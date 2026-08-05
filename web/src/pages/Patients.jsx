import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useI18n, formatDateTime } from '../i18n.jsx';

// Caseload at desk scale: everything a specialist scans before a session, in
// one sortable table instead of a phone-sized list.
export default function Patients() {
  const { t, lang, L } = useI18n();
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['patients'],
    queryFn: () => api('/specialist/patients'),
    refetchInterval: 60_000,
  });

  if (isLoading) return <p className="muted">{t('loading')}</p>;
  if (isError) {
    return <button className="ghost" onClick={() => refetch()}>{t('retry')}</button>;
  }

  const patients = (data.patients || []).filter((p) =>
    !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ flex: 1 }}>{t('patients')}</h1>
        <input
          style={{ maxWidth: 260 }} value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('search')} aria-label={t('search')}
        />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('patient')}</th>
                <th>{t('intake')}</th>
                <th>{t('openAlerts')}</th>
                <th>{t('lastMessage')}</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{p.name}</strong>
                      {p.isNewCase && <span className="badge primary">{t('newCase')}</span>}
                      {p.unreadCount > 0 && (
                        <span className="badge warn">{p.unreadCount} {t('unread')}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {p.latestResult
                      ? <span className="small">{L(p.latestResult.label)} · {p.latestResult.score}</span>
                      : <span className="faint">{t('none')}</span>}
                  </td>
                  <td>
                    {p.openAlerts > 0
                      ? <span className="badge danger">{p.openAlerts}</span>
                      : <span className="faint">—</span>}
                  </td>
                  <td className="small muted">
                    {p.lastMessage ? formatDateTime(p.lastMessage.createdAt, lang) : <span className="faint">—</span>}
                  </td>
                </tr>
              ))}
              {!patients.length && (
                <tr><td colSpan={4} className="faint" style={{ textAlign: 'center', padding: 28 }}>{t('none')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
