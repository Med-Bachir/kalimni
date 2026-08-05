import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useI18n, formatDateTime } from '../i18n.jsx';

// On-call rota management (Phase 1.1, admin only). This is who gets paged
// when a patient with NO assigned specialist is in crisis — without an entry
// the ladder falls back to paging every admin, which is a fallback, not a
// plan. Configure it before launch.
const localInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function Rota() {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const now = new Date();

  const [specialistId, setSpecialistId] = useState('');
  const [tier, setTier] = useState(1);
  const [startsAt, setStartsAt] = useState(localInput(now));
  const [endsAt, setEndsAt] = useState(localInput(new Date(now.getTime() + 12 * 3600_000)));
  const [error, setError] = useState('');

  const rota = useQuery({ queryKey: ['rota'], queryFn: () => api('/safety/rota') });
  const specialists = useQuery({
    queryKey: ['adminUsers', 'specialist'],
    queryFn: () => api('/admin/users?role=specialist'),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rota'] });

  const add = useMutation({
    mutationFn: () => api('/safety/rota', {
      method: 'POST',
      body: {
        specialistId, tier: Number(tier),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      },
    }),
    onSuccess: () => { setError(''); invalidate(); },
    onError: (err) => setError(err.code),
  });

  const remove = useMutation({
    mutationFn: (id) => api(`/safety/rota/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const approved = (specialists.data?.users || []).filter((u) => u.status === 'approved');
  const entries = rota.data?.entries || [];

  return (
    <div className="stack">
      <h1>{t('rotaTitle')}</h1>
      <p className="muted small" style={{ marginTop: -8 }}>{t('rotaHint')}</p>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('specialist')}</th><th>{t('tier')}</th>
                <th>{t('from')}</th><th>{t('to')}</th><th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td><strong>{e.specialist?.name || e.specialistId}</strong></td>
                  <td><span className="badge">{e.tier}</span></td>
                  <td className="small muted">{formatDateTime(e.startsAt, lang)}</td>
                  <td className="small muted">{formatDateTime(e.endsAt, lang)}</td>
                  <td style={{ textAlign: 'end' }}>
                    <button className="link" onClick={() => remove.mutate(e.id)}>{t('remove')}</button>
                  </td>
                </tr>
              ))}
              {!entries.length && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--warn)' }}>
                    {t('rotaEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form
        className="card stack"
        onSubmit={(e) => { e.preventDefault(); add.mutate(); }}
      >
        <h3>{t('rotaAdd')}</h3>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="spec">{t('specialist')}</label>
            <select id="spec" value={specialistId} onChange={(e) => setSpecialistId(e.target.value)} required>
              <option value="">—</option>
              {approved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tier">{t('tier')}</label>
            <select id="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">{t('from')}</label>
            <input id="from" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="to">{t('to')}</label>
            <input id="to" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
          </div>
        </div>
        {error && <p style={{ color: 'var(--danger-dark)', fontSize: 12.5 }}>{error}</p>}
        <div><button type="submit" disabled={add.isPending || !specialistId}>{t('rotaAdd')}</button></div>
      </form>
    </div>
  );
}
