import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useI18n, formatDateTime } from '../i18n.jsx';
import AckDialog from '../components/AckDialog.jsx';

// The escalation console (Phase 1.1). Every open alert, newest last so the
// oldest — the one closest to escalating — sits at the top of attention.
// Tier-2 (60 min unacknowledged) alerts get the banner that only an
// acknowledgement clears.
const SOURCE_KEY = {
  chat: 'sourceChat', ai_chat: 'sourceAiChat',
  questionnaire: 'sourceQuestionnaire', journal: 'sourceJournal',
};

export default function Alerts({ isAdmin }) {
  const { t, lang } = useI18n();
  const [ackAlert, setAckAlert] = useState(null);

  const alerts = useQuery({
    queryKey: ['alerts'],
    queryFn: () => api('/safety/alerts'),
    refetchInterval: 30_000,
  });
  const critical = useQuery({
    queryKey: ['criticalAlerts'],
    queryFn: () => api('/safety/alerts/critical'),
    refetchInterval: 30_000,
    enabled: !!isAdmin,
  });

  if (alerts.isLoading) return <p className="muted">{t('loading')}</p>;

  const open = (alerts.data?.alerts || [])
    .filter((a) => a.status === 'open')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const criticalIds = new Set((critical.data?.alerts || []).map((a) => a.id));

  return (
    <div className="stack">
      <h1>{t('alertsOpen')}</h1>

      {criticalIds.size > 0 && (
        <div className="critical-banner">
          <strong style={{ color: 'var(--danger-dark)' }}>⚠ {t('critical')}</strong>
        </div>
      )}

      {!open.length && <div className="card muted">{t('alertsNone')}</div>}

      {open.map((a) => (
        <AlertRow
          key={a.id} alert={a} lang={lang} t={t}
          critical={criticalIds.has(a.id)}
          onAck={() => setAckAlert(a)}
        />
      ))}

      <AckDialog alert={ackAlert} onClose={() => setAckAlert(null)} />
    </div>
  );
}

function AlertRow({ alert, lang, t, critical, onAck }) {
  const [showTrail, setShowTrail] = useState(false);
  const trail = useQuery({
    queryKey: ['escalations', alert.id],
    queryFn: () => api(`/safety/alerts/${alert.id}/escalations`),
    enabled: showTrail,
  });

  const minutesOpen = Math.round((Date.now() - new Date(alert.createdAt)) / 60000);

  return (
    <div className={`card ${critical ? 'danger' : ''} stack`} style={{ gap: 10 }}>
      <div className="row">
        <Link to={`/patients/${alert.patientId}`}><strong>{alert.patient?.name}</strong></Link>
        <span className="badge">{t(SOURCE_KEY[alert.source] || 'sourceChat')}</span>
        {critical && <span className="badge danger">{t('critical')}</span>}
        <span className="faint" style={{ marginInlineStart: 'auto' }}>
          {formatDateTime(alert.createdAt, lang)} · {minutesOpen} min
        </span>
      </div>

      {(alert.message?.text || alert.detail?.trigger) && (
        <blockquote className="small" style={{ margin: 0, color: 'var(--body)' }}>
          “{alert.message?.text || alert.detail.trigger}”
        </blockquote>
      )}
      {alert.detail?.selfHarmItem && (
        <span className="badge danger">
          {t('selfHarmItem')}: {alert.detail.selfHarmItem.from} → {alert.detail.selfHarmItem.to}
        </span>
      )}

      <div className="row">
        <button className="danger" onClick={onAck}>{t('ack')}</button>
        <button className="link" onClick={() => setShowTrail((v) => !v)}>{t('escalationTrail')}</button>
      </div>

      {showTrail && (
        <ul className="trail">
          {(trail.data?.escalations || []).map((e) => (
            <li key={e.id}>
              {t('tier')} {e.tier} · {e.method} · {t('paged')}: {e.notifiedName || e.notifiedId || '—'} ·{' '}
              {formatDateTime(e.notifiedAt, lang)}
              {e.actionTaken ? ` — “${e.actionTaken}”` : ''}
            </li>
          ))}
          {trail.isFetched && !(trail.data?.escalations || []).length && (
            <li className="faint">{t('none')}</li>
          )}
        </ul>
      )}
    </div>
  );
}
