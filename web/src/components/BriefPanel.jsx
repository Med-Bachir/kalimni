import { useI18n, formatDate } from '../i18n.jsx';

// Session Witness, the clinician's side (Phase 2.3).
//
// Everything here was chosen by the patient. That is the point, and it is
// worth reading the panel with it in mind: what is absent was not withheld by
// the software, it was a decision — and unshared items are deleted at send
// time, so there is nothing to go looking for. The one exception is the
// `locked` safety item, which ships regardless and says so on both sides.
//
// The panel is read-only by design. A brief is a message from a patient, not
// a form to work in.

const ORDER = ['notes', 'takeaway', 'checkins', 'themes', 'exercises', 'safety'];

export default function BriefPanel({ briefs }) {
  const { t, lang } = useI18n();
  if (!briefs?.length) return null;

  return (
    <section className="stack">
      <div className="row">
        <h2 style={{ flex: 1 }}>{t('briefsTitle')}</h2>
        <span className="badge">{t('patientAuthored')}</span>
      </div>
      <p className="muted small" style={{ marginTop: -8 }}>{t('briefsHint')}</p>

      {briefs.map((brief) => {
        const items = [...(brief.items || [])].sort(
          (a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)
        );
        return (
          <div key={brief.id} className="card stack" style={{ gap: 12 }}>
            <div className="row">
              <strong style={{ flex: 1 }}>{formatDate(brief.sharedAt || brief.createdAt, lang)}</strong>
              <span className="faint small">{t('briefSharedItems', { n: items.length })}</span>
            </div>

            {items.map((item) => (
              <div key={item.id} className="stack" style={{ gap: 4 }}>
                <div className="row" style={{ gap: 8 }}>
                  <span className="muted small" style={{ fontWeight: 600 }}>
                    {item.title?.[lang] || item.title?.ar || item.id}
                  </span>
                  {item.locked && <span className="badge danger">{t('alwaysShared')}</span>}
                  {item.patientAuthored && <span className="badge">{t('theirWords')}</span>}
                </div>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{item.body}</p>
              </div>
            ))}

            {brief.takeaway && (
              <div className="stack" style={{ gap: 4, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span className="muted small" style={{ fontWeight: 600 }}>{t('takeaway')}</span>
                <p style={{ margin: 0, lineHeight: 1.7 }}>{brief.takeaway}</p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
