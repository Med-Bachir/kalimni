import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useI18n, formatDate, formatDateTime } from '../i18n.jsx';
import MbcPanel from '../components/MbcPanel.jsx';
import BriefPanel from '../components/BriefPanel.jsx';
import AckDialog from '../components/AckDialog.jsx';

const CODES = { gad7: 'GAD-7', phq9: 'PHQ-9' };

// The patient file: safety alerts first, then the measurement trajectory,
// then the raw material (questionnaire history, daily check-ins).
export default function PatientDetail() {
  const { id } = useParams();
  const { t, lang, L } = useI18n();
  const navigate = useNavigate();
  const [ackAlert, setAckAlert] = useState(null);

  const patients = useQuery({ queryKey: ['patients'], queryFn: () => api('/specialist/patients') });
  const history = useQuery({
    queryKey: ['history', id],
    queryFn: () => api(`/questionnaires/history?patientId=${id}`),
  });
  const mbc = useQuery({
    queryKey: ['mbc', id],
    queryFn: () => api(`/specialist/patients/${id}/mbc`),
  });
  const checkins = useQuery({
    queryKey: ['checkins', id],
    queryFn: () => api(`/specialist/patients/${id}/checkins`),
  });
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: () => api('/safety/alerts') });
  const briefs = useQuery({
    queryKey: ['briefs', id],
    queryFn: () => api(`/specialist/patients/${id}/briefs`),
  });

  const patient = (patients.data?.patients || []).find((p) => p.id === id);
  const openAlerts = (alerts.data?.alerts || []).filter((a) => a.patientId === id && a.status === 'open');

  if (patients.isLoading) return <p className="muted">{t('loading')}</p>;

  return (
    <div className="stack">
      <div className="row">
        <button className="ghost" onClick={() => navigate('/patients')}>← {t('back')}</button>
        <h1 style={{ flex: 1 }}>{patient?.name || t('patientFile')}</h1>
      </div>

      {/* Open safety alerts, above everything else on the page. */}
      {openAlerts.map((a) => (
        <div key={a.id} className="card danger stack" style={{ gap: 8 }}>
          <div className="row">
            <strong style={{ color: 'var(--danger-dark)', flex: 1 }}>
              {t('source')}: {t(`source${a.source.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())}`)}
            </strong>
            <span className="faint">{formatDateTime(a.createdAt, lang)}</span>
          </div>
          {(a.message?.text || a.detail?.trigger) && (
            <blockquote className="small" style={{ margin: 0, color: 'var(--body)' }}>
              “{a.message?.text || a.detail.trigger}”
            </blockquote>
          )}
          {a.detail?.selfHarmItem && (
            <span className="badge danger">
              {t('selfHarmItem')}: {a.detail.selfHarmItem.from} → {a.detail.selfHarmItem.to}
            </span>
          )}
          <div>
            <button className="danger" onClick={() => setAckAlert(a)}>{t('ack')}</button>
          </div>
        </div>
      ))}

      {/* What the patient chose to say, above the numbers the app computed
          about them — reading order is a clinical statement too. */}
      <BriefPanel briefs={briefs.data?.briefs} />

      <MbcPanel data={mbc.data} />

      <section className="stack">
        <h2>{t('intake')}</h2>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <tbody>
                {(history.data?.results || []).map((r) => (
                  <tr key={r.id}>
                    <td><strong>{CODES[r.questionnaireId] || r.questionnaireId}</strong></td>
                    <td>{t('score')} {r.score}</td>
                    <td className="muted small">{L(r.label)}</td>
                    <td className="faint">{formatDate(r.createdAt, lang)}</td>
                  </tr>
                ))}
                {!(history.data?.results || []).length && (
                  <tr><td className="faint" style={{ textAlign: 'center', padding: 24 }}>{t('none')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="stack">
        <h2>{t('checkins')}</h2>
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('opened')}</th><th>{t('mood')}</th><th>{t('stress')}</th>
                  <th>{t('energy')}</th><th>{t('sleep')}</th><th>{t('note')}</th>
                </tr>
              </thead>
              <tbody>
                {(checkins.data?.entries || []).slice(0, 14).map((e) => (
                  <tr key={e.id}>
                    <td className="faint">{formatDate(e.createdAt, lang)}</td>
                    <td>{e.mood}</td><td>{e.stress}</td><td>{e.energy}</td><td>{e.sleep}</td>
                    {/* Phase 2.5. The console cannot open a shared note: the
                        private half of the sharing key lives in the
                        clinician's PHONE keystore and deliberately never
                        reaches a browser. So this says where to read it
                        rather than pretending the note is missing. */}
                    <td className="small">
                      {e.note || (e.locked
                        ? <span className="faint">🔒 {t(e.sharedEnvelope ? 'noteSharedOpenInApp' : 'noteLocked')}</span>
                        : <span className="faint">—</span>)}
                    </td>
                  </tr>
                ))}
                {!(checkins.data?.entries || []).length && (
                  <tr><td colSpan={6} className="faint" style={{ textAlign: 'center', padding: 24 }}>{t('none')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <AckDialog alert={ackAlert} onClose={() => setAckAlert(null)} />
    </div>
  );
}
