// Phase 2.3 — Session Witness.
//
// The companion holds real signal about a patient — check-in trajectory,
// recurring themes, what helped — and their treating specialist cannot see any
// of it. The obvious fix is a "your specialist can read your AI chats" toggle,
// and it is the wrong one: nobody understands what they agreed to, and the
// patient becomes the subject of a report rather than its author.
//
// This builds a one-page brief BEFORE a session, shows it to the patient
// first, and sends only what they tick. Three properties do the work:
//
//   1. Generated items default to OFF. An affirmative act ships anything the
//      machine wrote about them.
//   2. Sharing DELETES the unticked items (witnessService.share -> repos
//      rewrites `items`). "Remove anything you don't want shared" means the
//      row no longer holds it.
//   3. Nothing here is LLM-generated. Every body is composed from stored
//      numbers and the patient's own text, so a brief cannot hallucinate a
//      clinical claim into a treatment relationship. The one item that quotes
//      a model — `themes` — quotes the memory the patient can already read and
//      correct (Phase 2.4), which is why that phase comes first.
//
// The safety item is the exception to (1) and (2), and is marked `locked`:
// alerts are already visible to the specialist through their own route, so a
// toggle would either be a lie (unticking changes nothing) or a way to
// suppress a page. It ships, and it says so.
const repos = require('../data/repos');
const { emitToUser } = require('../realtime');
const push = require('./pushService');

const WINDOW_DAYS = 14;
const MAX_NOTES = 3;
const MAX_NOTE_CHARS = 300;
const MAX_TAKEAWAY_CHARS = 500;

const pick = (bi, lang) => bi[lang] || bi.ar;

// --- item bodies (deterministic, never generated) --------------------------------

const TITLES = {
  notes: { ar: 'ما أريد قوله', fr: 'Ce que je veux dire' },
  takeaway: { ar: 'ما خرجت به من الجلسة الماضية', fr: 'Ce que j\'ai retenu de la dernière séance' },
  checkins: { ar: 'تسجيلاتي اليومية', fr: 'Mes points quotidiens' },
  themes: { ar: 'ما يتكرر في حديثي مع الرفيق', fr: 'Ce qui revient dans mes échanges avec le compagnon' },
  exercises: { ar: 'التمارين التي اقترحها الرفيق', fr: 'Les exercices proposés par le compagnon' },
  safety: { ar: 'تنبيهات السلامة', fr: 'Alertes de sécurité' },
};

const mean = (nums) => nums.reduce((a, b) => a + b, 0) / nums.length;
const one = (n) => (Math.round(n * 10) / 10).toString();

// Counts and averages only. No direction, no "better/worse": rule 4 says the
// app never rewards mood improvement, and a line the patient reads before
// pressing send is exactly where that pressure would appear.
function checkinsBody(entries, lang) {
  const n = entries.length;
  const mood = one(mean(entries.map((e) => e.mood)));
  const sleep = one(mean(entries.map((e) => e.sleep)));
  const energy = one(mean(entries.map((e) => e.energy)));
  const stress = one(mean(entries.map((e) => e.stress)));
  return lang === 'fr'
    ? `${n} point(s) quotidien(s) sur les ${WINDOW_DAYS} derniers jours. Moyennes sur 5 — humeur ${mood}, sommeil ${sleep}, énergie ${energy}, stress ${stress}.`
    : `${n} تسجيلاً في آخر ${WINDOW_DAYS} يوماً. المتوسطات من 5 — المزاج ${mood}، النوم ${sleep}، الطاقة ${energy}، التوتر ${stress}.`;
}

function themesBody(state, lang) {
  const summary = String(state?.summary || '').trim();
  const topics = Array.isArray(state?.topics) ? state.topics.filter(Boolean) : [];
  if (!summary && !topics.length) return null;
  const tags = topics.length
    ? (lang === 'fr' ? `\nThèmes : ${topics.join(' · ')}` : `\nالمواضيع: ${topics.join(' · ')}`)
    : '';
  return `${summary}${tags}`.trim();
}

function exercisesBody(counts, lang) {
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([title, n]) => `${pick(title, lang)} ×${n}`);
  if (!parts.length) return null;
  return parts.join('، ');
}

// Locked. The wording has one job: make sure the patient is not misled into
// thinking this checkbox is what decides whether their specialist knows.
function safetyBody(count, lang) {
  return lang === 'fr'
    ? `${count} alerte(s) de sécurité sur les ${WINDOW_DAYS} derniers jours. Votre spécialiste les voit déjà — elles ne dépendent pas de ce partage. C'est indiqué ici pour que vous sachiez ce qu'il sait.`
    : `${count} تنبيه سلامة في آخر ${WINDOW_DAYS} يوماً. مختصك يراها أصلاً — لا تتوقف على هذه المشاركة. تظهر هنا لتعرف ما يعرفه.`;
}

// --- draft assembly ---------------------------------------------------------------

/**
 * Everything the server can honestly say about the last WINDOW_DAYS, as
 * candidate items. Generated items carry `included: false`; the patient's own
 * words carry `included: true` — they wrote them for this, and a note that
 * silently fails to send is the worse failure. `notes` is seeded from the
 * previous draft so the screen can be left and come back to.
 */
async function generateItems(patient, previous = []) {
  const lang = patient.language === 'fr' ? 'fr' : 'ar';
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const prevOf = (id) => previous.find((i) => i.id === id);
  const items = [];

  // 1. The patient's own talking points — the highest-value part of the brief
  //    and the only item they compose themselves.
  const notes = prevOf('notes');
  items.push({
    id: 'notes', title: TITLES.notes, body: notes?.body || '',
    patientAuthored: true, included: notes ? notes.included !== false : true,
  });

  // 2. Last session's takeaway, carried forward (the "after" half of 2.3).
  const [latest] = await repos.sessionBriefsOf(patient.id, 5);
  if (latest?.takeaway) {
    items.push({
      id: 'takeaway', title: TITLES.takeaway, body: latest.takeaway,
      patientAuthored: true, included: prevOf('takeaway')?.included !== false,
    });
  }

  // 3. Check-in trajectory.
  const entries = (await repos.journalEntriesOf(patient.id, 60))
    .filter((e) => e.createdAt >= since);
  if (entries.length) {
    items.push({
      id: 'checkins', title: TITLES.checkins, body: checkinsBody(entries, lang),
      included: prevOf('checkins')?.included === true,
    });
  }

  // 4 & 5. Themes and exercises, from the companion thread.
  const conversation = await repos.getAiConversation(patient.id);
  if (conversation) {
    const [state, messages] = await Promise.all([
      repos.getAiState(conversation.id),
      repos.aiMessagesOf(conversation.id, 100),
    ]);

    const themes = themesBody(state, lang);
    if (themes) {
      items.push({
        id: 'themes', title: TITLES.themes, body: themes,
        // Flagged so the screen can say "this is what your companion wrote —
        // you can change it" and link to the memory screen (Phase 2.4).
        fromMemory: true,
        included: prevOf('themes')?.included === true,
      });
    }

    // What the companion SUGGESTED, which is what the server can honestly
    // observe — whether the patient actually did the breathing exercise lives
    // on their phone and is not ours to report.
    const byTitle = new Map(); // bilingual title object -> count
    for (const m of messages) {
      if (m.createdAt < since) continue;
      for (const s of m.suggestions || []) {
        if (s.kind !== 'exercise' || !s.title) continue;
        const key = [...byTitle.keys()].find((t) => t.ar === s.title.ar) || s.title;
        byTitle.set(key, (byTitle.get(key) || 0) + 1);
      }
    }
    const exercises = exercisesBody(byTitle, lang);
    if (exercises) {
      items.push({
        id: 'exercises', title: TITLES.exercises, body: exercises,
        included: prevOf('exercises')?.included === true,
      });
    }
  }

  // 6. Safety — locked, always shared, never a consent decision.
  const alerts = await repos.alertsOfPatientSince(patient.id, since);
  if (alerts.length) {
    items.push({
      id: 'safety', title: TITLES.safety, body: safetyBody(alerts.length, lang),
      locked: true, included: true,
    });
  }

  return items;
}

/**
 * The patient's current draft, refreshed. Generated bodies are recomputed on
 * every read so the brief is never stale at the moment it is sent; the
 * patient's notes and every tick they made are carried across.
 */
async function draftFor(patient, { appointmentId } = {}) {
  if (!patient.assignedSpecialistId) return { brief: null, reason: 'no_specialist' };

  const existing = await repos.openBriefDraftOf(patient.id);
  const items = await generateItems(patient, existing?.items || []);

  if (existing) {
    const patch = { items };
    if (appointmentId && appointmentId !== existing.appointmentId) patch.appointmentId = appointmentId;
    return { brief: await repos.updateSessionBrief(existing.id, patch) };
  }
  return {
    brief: await repos.insertSessionBrief({
      patientId: patient.id,
      specialistId: patient.assignedSpecialistId,
      appointmentId: appointmentId || null,
      items,
    }),
  };
}

/** Save what the patient typed and ticked. Locked items ignore the tick. */
async function saveDraft(patient, { notes, includedIds }) {
  const draft = await repos.openBriefDraftOf(patient.id);
  if (!draft) return null;

  const wanted = Array.isArray(includedIds) ? new Set(includedIds) : null;
  const items = draft.items.map((item) => {
    const next = { ...item };
    if (item.id === 'notes' && notes !== undefined) {
      next.body = (Array.isArray(notes) ? notes : [notes])
        .map((l) => String(l || '').trim())
        .filter(Boolean)
        .slice(0, MAX_NOTES)
        .map((l) => l.slice(0, MAX_NOTE_CHARS))
        .join('\n');
    }
    if (wanted) next.included = item.locked ? true : wanted.has(item.id);
    return next;
  });
  return repos.updateSessionBrief(draft.id, { items });
}

/**
 * Send it. The unticked items are dropped from the row, not hidden: this is
 * the moment "remove anything you don't want shared" has to become true in
 * the database, because everything after this point is someone else reading.
 */
async function share(patient) {
  const draft = await repos.openBriefDraftOf(patient.id);
  if (!draft) return { error: 'no_draft' };

  const kept = draft.items
    .filter((i) => i.locked || i.included)
    .filter((i) => String(i.body || '').trim().length > 0);
  if (!kept.length) return { error: 'nothing_selected' };

  const brief = await repos.updateSessionBrief(draft.id, {
    items: kept, status: 'shared', sharedAt: new Date().toISOString(),
  });

  emitToUser(brief.specialistId, 'witness:brief', { brief });
  push.sendToUsers([brief.specialistId], () => ({
    title: patient.language === 'fr' ? 'Note avant séance' : 'ملاحظة قبل الجلسة',
    body: patient.language === 'fr'
      ? `${patient.name} a partagé une note avant votre séance.`
      : `${patient.name} شارك ملاحظة قبل جلستكم.`,
    data: { type: 'witness_brief', briefId: brief.id, patientId: patient.id },
  })).catch((err) => console.error('[witness] push failed:', err.message));

  return { brief };
}

/**
 * The after-session line. It follows the brief's status: written onto a shared
 * brief, the specialist reads it (the screen says so); written onto a draft
 * that is never sent, it stays with the patient. Either way it seeds the next
 * brief as a patient-authored item.
 */
async function setTakeaway(patient, briefId, text) {
  const brief = await repos.findSessionBrief(briefId);
  if (!brief || brief.patientId !== patient.id) return null;
  const takeaway = String(text || '').trim().slice(0, MAX_TAKEAWAY_CHARS);
  const updated = await repos.updateSessionBrief(brief.id, {
    takeaway: takeaway || null,
    takeawayAt: takeaway ? new Date().toISOString() : null,
  });
  if (takeaway && updated.status === 'shared') {
    emitToUser(updated.specialistId, 'witness:brief', { brief: updated });
  }
  return updated;
}

async function discardDraft(patient) {
  const draft = await repos.openBriefDraftOf(patient.id);
  if (!draft) return false;
  await repos.deleteSessionBrief(draft.id);
  return true;
}

module.exports = {
  draftFor, saveDraft, share, setTakeaway, discardDraft,
  WINDOW_DAYS, MAX_NOTES, MAX_TAKEAWAY_CHARS,
  // exported for tests
  generateItems, TITLES,
};
