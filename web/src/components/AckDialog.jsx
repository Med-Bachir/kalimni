import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useI18n } from '../i18n.jsx';

// Acknowledging a safety alert is a clinical act: the server refuses an ack
// without a recorded intervention, and stores it in the append-only
// escalation audit (Phase 1.1). This is the console's only ack surface.
export default function AckDialog({ alert, onClose }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [tooShort, setTooShort] = useState(false);

  const ack = useMutation({
    mutationFn: () => api(`/safety/alerts/${alert.id}/ack`, {
      method: 'POST', body: { actionTaken: text.trim() },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['criticalAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['patients'] });
      onClose();
    },
    onError: (err) => {
      if (err.code === 'action_taken_required') setTooShort(true);
    },
  });

  const submit = (e) => {
    e.preventDefault();
    if (text.trim().length < 5) return setTooShort(true);
    setTooShort(false);
    return ack.mutate();
  };

  if (!alert) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit}>
        <h2>{t('ackTitle')}</h2>
        <p className="muted small">{t('ackHint')}</p>
        <textarea
          rows={4} value={text} autoFocus
          onChange={(e) => { setText(e.target.value); setTooShort(false); }}
          placeholder={t('ackPlaceholder')}
        />
        {tooShort && <p style={{ color: 'var(--danger-dark)', fontSize: 12.5 }}>{t('ackTooShort')}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="ghost" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="danger" disabled={ack.isPending}>
            {ack.isPending ? t('loading') : t('ack')}
          </button>
        </div>
      </form>
    </div>
  );
}
