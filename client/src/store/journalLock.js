import { create } from 'zustand';
import { api } from '../api/client';
import {
  createJournalKey, restoreJournalKey, loadJournalKey,
  encryptNote, sealToSpecialist,
} from '../crypto/journalCrypto';

// The journal lock (Phase 2.5): state, setup, and the one path that turns a
// written note into something the server stores but cannot read.
//
// The order in `prepareNote` is the whole safety argument and must not be
// rearranged: SCAN FIRST, THEN ENCRYPT. Once the text is sealed nobody —
// including us — can check whether it was a cry for help.

// Mirrors normalize() in api/src/utils/safety.js. The PATTERNS themselves come
// from the server (GET /journal/scan-patterns) precisely so this file cannot
// hold a stale copy of the word list; only the normalisation lives here, and
// it is three lines that have not changed since Phase 0.
const normalize = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[ً-ٰ]/g, '')
    .replace(/[أإآ]/g, 'ا');

export const useJournalLock = create((set, get) => ({
  // 'unknown' until hydrate() has asked both the device and the server.
  //   off          — no lock; notes go as plaintext, exactly as before
  //   on           — key on this device, notes are sealed
  //   needsRestore — the account has a lock but THIS device has no key
  status: 'unknown',
  method: null,          // 'phrase' | 'escrow' | 'none'
  wrappedKey: null,
  patterns: null,        // device keyword layer, fetched once
  patternsVersion: null,
  specialistPublicKey: null,

  async hydrate() {
    try {
      const [{ recovery }, key] = await Promise.all([
        api('/journal/recovery'),
        loadJournalKey(),
      ]);
      if (!recovery) return set({ status: 'off', method: null, wrappedKey: null });
      return set({
        status: key ? 'on' : 'needsRestore',
        method: recovery.method,
        wrappedKey: recovery.wrappedKey || null,
      });
    } catch {
      // Offline: say nothing rather than guessing. A wrong "off" here would
      // send a note in the clear that the patient believes is locked.
      return set({ status: 'unknown' });
    }
  },

  // Fetched once per session; the version travels with every attestation so
  // the server knows which list judged the entry.
  async ensurePatterns() {
    if (get().patterns) return get().patterns;
    const res = await api('/journal/scan-patterns');
    set({ patterns: res.patterns.map(normalize), patternsVersion: res.version });
    return get().patterns;
  },

  async loadSpecialistKey() {
    try {
      const res = await api('/journal/keys/specialist');
      set({ specialistPublicKey: res.publicKey || null });
      return res.publicKey || null;
    } catch {
      return null;
    }
  },

  /** Turn the lock on. Returns the recovery phrase to show ONCE, or null. */
  async enable({ method }) {
    const { keyVersion, wrappedKey, phrase } = await createJournalKey({ method });
    await api('/journal/recovery', { method: 'PUT', body: { method, wrappedKey, keyVersion } });
    set({ status: 'on', method, wrappedKey });
    return phrase;
  },

  /** Bring the journal back on a device that has never held the key. */
  async restore({ phrase }) {
    const { wrappedKey } = get();
    if (!wrappedKey) return false;
    const ok = await restoreJournalKey({ wrappedKey, phrase });
    if (ok) set({ status: 'on' });
    return ok;
  },

  /**
   * The write path. Returns the body fields for POST /api/ai/checkin.
   *
   * Layer 1 runs here on the device. Layer 2 runs at /journal/scan, which
   * classifies the text and stores nothing — that call is the reason the
   * stronger of the two safety layers survives encryption at all, and the
   * setup screen tells the patient it happens.
   *
   * If the scan cannot be reached the note is still saved: losing what
   * someone wrote is not an acceptable failure. It goes up without an
   * attestation, which the server dead-letters and counts — a known gap
   * rather than a silent one.
   */
  async prepareNote(text) {
    const note = String(text || '').trim();
    if (!note) return {};
    if (get().status !== 'on') return { note };

    let scan = null;
    let verdict = 'none';
    let keyword = false;
    try {
      const patterns = await get().ensurePatterns();
      const value = normalize(note);
      keyword = patterns.some((p) => value.includes(p));

      const res = await api('/journal/scan', { method: 'POST', body: { text: note } });
      verdict = res.verdict;
      scan = { ...res.token, keyword: keyword || res.keyword, patternsVersion: get().patternsVersion };
    } catch (err) {
      console.warn('[journal] safety scan unavailable — entry will be flagged unscanned', err?.code || err);
    }

    const sealed = await encryptNote(note);
    const body = { ...sealed, ...(scan ? { scan } : {}) };

    // On a high verdict the triggering text is sealed to the treating
    // specialist so the alert they receive still has something to read.
    // Without this, encryption would hand clinicians an alarm with no
    // content — which is the safety gap Rule 1 forbids widening.
    if (verdict === 'high' || keyword) {
      const publicKey = get().specialistPublicKey || (await get().loadSpecialistKey());
      if (publicKey) body.crisisEnvelope = sealToSpecialist(note.slice(0, 500), publicKey);
    }
    return body;
  },

  /** Share one already-stored entry with the treating specialist. */
  async shareEntry(entryId, plaintext) {
    const publicKey = get().specialistPublicKey || (await get().loadSpecialistKey());
    if (!publicKey) return { error: 'no_specialist_key' };
    await api(`/journal/entries/${entryId}/share`, {
      method: 'POST',
      body: { envelope: sealToSpecialist(plaintext, publicKey) },
    });
    return { shared: true };
  },

  async unshareEntry(entryId) {
    await api(`/journal/entries/${entryId}/share`, { method: 'DELETE' });
  },
}));
