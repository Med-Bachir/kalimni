// Shapes internal records into API responses. Never leak passwordHash.

function publicUser(user) {
  if (!user) return null;
  const base = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    language: user.language || 'ar',
    settings: user.settings || { notifications: true },
    createdAt: user.createdAt,
  };
  if (user.role === 'patient') {
    base.assignedSpecialistId = user.assignedSpecialistId || null;
    base.intakeCompletedAt = user.intakeCompletedAt || null;
    base.intakeSkipped = !!user.intakeSkipped;
  }
  if (user.role === 'specialist') {
    base.title = user.title || null;
    base.status = user.status; // pending | approved | rejected
    base.specialties = user.specialties || [];
    base.bio = user.bio || null;
    base.license = user.license || null;
  }
  return base;
}

// Minimal card used when embedding another user inside a payload.
function userCard(user, onlineUserIds) {
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name,
    title: user.title || null,
    online: onlineUserIds ? onlineUserIds.has(user.id) : false,
  };
}

// A journal entry as a CLINICIAN may see it (Phase 2.5).
//
// The sliders always travel — they are the trend the treatment runs on and
// they hold no free text. The written note only travels when the patient left
// it unlocked, or sealed this specific entry to this specific clinician. A
// locked, unshared entry is reported as locked rather than omitted: "there is
// something here you cannot read" is true and useful, and silently dropping
// the row would make the journal look emptier than it is.
function clinicalJournalEntry(entry, envelopeByEntryId) {
  const base = {
    id: entry.id,
    userId: entry.userId,
    mood: entry.mood, stress: entry.stress, energy: entry.energy, sleep: entry.sleep,
    createdAt: entry.createdAt,
  };
  if (!entry.ciphertext) return { ...base, note: entry.note || null, locked: false };

  const envelope = envelopeByEntryId?.get(entry.id) || null;
  return {
    ...base,
    note: null,
    locked: true,
    // Present only when the patient sealed this entry to this specialist;
    // the server cannot open it either way.
    sharedEnvelope: envelope,
    // Honest about the safety net's state on an entry nobody can read.
    scanStatus: entry.scan?.status || 'missing',
  };
}

module.exports = { publicUser, userCard, clinicalJournalEntry };
