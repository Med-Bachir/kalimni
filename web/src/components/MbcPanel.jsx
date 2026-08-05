import { useI18n, formatDate } from '../i18n.jsx';

// Measurement-based care panel (Phase 2.2) — CONSOLE/CLINICIAN ONLY.
// Reads /api/specialist/patients/:id/mbc, which no patient token can call.
// Nothing here may ever be mirrored onto a patient surface.

const CODES = { gad7: 'GAD-7', phq9: 'PHQ-9' };

function Change({ label, change }) {
  const { t } = useI18n();
  if (!change) return null;
  const color =
    change.direction === 'improved' ? 'var(--success)'
      : change.direction === 'deteriorated' ? 'var(--danger-dark)' : 'var(--muted)';
  const arrow = change.direction === 'improved' ? '↓' : change.direction === 'deteriorated' ? '↑' : '→';
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="muted small">{label}</span>
      <span style={{ color, fontWeight: 600, fontSize: 13 }}>
        {arrow}{' '}
        {change.direction === 'unchanged'
          ? t('withinNoise')
          : t(change.direction === 'improved' ? 'pointsDown' : 'pointsUp', { n: Math.abs(change.delta) })}
      </span>
    </div>
  );
}

export default function MbcPanel({ data }) {
  const { t, lang } = useI18n();
  const trajectories = data?.trajectories || [];
  if (!trajectories.length) return null;

  const series = data.selfHarmSeries || [];
  const latest = series.at(-1);
  const previous = series.length > 1 ? series.at(-2) : null;
  const rose = previous && latest.value > previous.value;

  return (
    <section className="stack">
      <div className="row">
        <h2 style={{ flex: 1 }}>{t('mbcTitle')}</h2>
        <span className="badge">{t('clinicianOnly')}</span>
      </div>

      {/* Item 9 first: the line clinicians scan for. */}
      {latest && (
        <div className={`card ${latest.value > 0 ? 'danger' : ''}`}>
          <div className="row">
            <strong style={{ flex: 1 }}>{t('selfHarmItem')}</strong>
            <span
              style={{ fontWeight: 700, fontSize: 18, color: latest.value > 0 ? 'var(--danger-dark)' : 'var(--muted)' }}
            >
              {latest.value}/3
            </span>
          </div>
          {previous && (
            <p className="small" style={{ margin: '6px 0 0', color: rose ? 'var(--danger-dark)' : 'var(--muted)' }}>
              {rose
                ? t('selfHarmRose', { from: previous.value, to: latest.value })
                : `${previous.value} → ${latest.value}`}
            </p>
          )}
        </div>
      )}

      <div className="grid-2">
        {trajectories.map((tr) => (
          <div key={tr.questionnaireId} className="card stack" style={{ gap: 10 }}>
            <div className="row">
              <h3 style={{ flex: 1 }}>{CODES[tr.questionnaireId] || tr.questionnaireId}</h3>
              <span className="faint">{t('administrations', { n: tr.administrations })}</span>
            </div>

            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span className="muted small">{t('baseline')} {tr.baseline.score}</span>
              <span className="faint">→</span>
              <span style={{ fontWeight: 700, fontSize: 24 }}>{tr.latest.score}</span>
              <span className="faint" style={{ marginInlineStart: 'auto' }}>
                {formatDate(tr.latest.at, lang)}
              </span>
            </div>

            <Change label={t('sinceLast')} change={tr.sinceLast} />
            <Change label={t('sinceBaseline')} change={tr.sinceBaseline} />

            {tr.sinceBaseline?.clinicallySignificant && (
              <span className="badge success">{t('recovered')}</span>
            )}
            {tr.nonResponse && (
              <div className="card warn" style={{ padding: 10, boxShadow: 'none' }}>
                <span className="small" style={{ color: 'var(--warn)' }}>
                  {t('nonResponse', { weeks: Math.round(tr.weeksInTreatment) })}
                </span>
              </div>
            )}
            <span className="faint">{t('rciFootnote', { n: tr.reliableChangeThreshold })}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
