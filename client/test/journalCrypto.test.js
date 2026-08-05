// Phase 2.5 — the client half of the encrypted journal.
//
// Everything else in this app fails visibly. This module fails by making a
// year of someone's journal permanently unreadable, quietly, on a device they
// no longer have. So the tests that matter most here are the recovery ones:
// the wrong phrase must fail closed, the right phrase must work on a device
// that has never seen the key, and the wordlist must not silently drift into
// biasing every key it generates.
import { describe, it, expect, beforeEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import {
  createJournalKey, restoreJournalKey, generateRecoveryPhrase,
  loadJournalKey, forgetJournalKeyOnDevice,
  encryptNote, decryptNote,
  sealToSpecialist, ensureSharingKeypair, openSharedEnvelope,
  PHRASE_WORDS, toBase64, fromBase64,
} from '../src/crypto/journalCrypto.js';

const NOTE = 'ما قدرتش نرقد البارح، وكنت نخمّم برك.';

beforeEach(() => SecureStore.__reset());

describe('base64 round-trip', () => {
  it('survives every byte value and every padding case', () => {
    for (const len of [1, 2, 3, 4, 31, 32, 33, 255]) {
      const bytes = new Uint8Array(len).map((_, i) => (i * 7 + len) % 256);
      expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it('handles UTF-8 beyond ASCII, which is most of what patients write', async () => {
    await createJournalKey({ method: 'none' });
    const sealed = await encryptNote(NOTE);
    expect(await decryptNote(sealed)).toBe(NOTE);
  });
});

describe('the recovery phrase', () => {
  it('is 16 words from the list', () => {
    const phrase = generateRecoveryPhrase().split(' ');
    expect(phrase).toHaveLength(PHRASE_WORDS);
    expect(phrase.every((w) => /^[a-z]+$/.test(w))).toBe(true);
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateRecoveryPhrase()));
    expect(seen.size).toBe(50);
  });

  it('draws on the whole wordlist — a biased list is a weak key', () => {
    const words = new Set();
    for (let i = 0; i < 400; i += 1) generateRecoveryPhrase().split(' ').forEach((w) => words.add(w));
    // 6400 draws from 256 words: seeing fewer than 240 distinct would mean the
    // mapping is not uniform.
    expect(words.size).toBeGreaterThan(240);
  });
});

describe('turning the lock on', () => {
  it('puts a key on the device and hands back the phrase exactly once', async () => {
    const { wrappedKey, phrase, keyVersion } = await createJournalKey({ method: 'phrase' });
    expect(keyVersion).toBe(1);
    expect(phrase.split(' ')).toHaveLength(PHRASE_WORDS);
    expect(await loadJournalKey()).toHaveLength(32);
    // What the server receives must not contain the key or the phrase.
    expect(wrappedKey).not.toContain(phrase.split(' ')[0]);
    expect(wrappedKey).not.toContain(toBase64(await loadJournalKey()));
  });

  it('device-only mode stores no recovery material at all', async () => {
    const { wrappedKey, phrase } = await createJournalKey({ method: 'none' });
    expect(wrappedKey).toBeNull();
    expect(phrase).toBeNull();
    expect(await loadJournalKey()).toHaveLength(32);
  });

  it('gives every patient a different key', async () => {
    const a = await createJournalKey({ method: 'none' });
    const first = toBase64(await loadJournalKey());
    SecureStore.__reset();
    const b = await createJournalKey({ method: 'none' });
    expect(toBase64(await loadJournalKey())).not.toBe(first);
    expect(a.keyVersion).toBe(b.keyVersion);
  });
});

describe('recovery on a new device', () => {
  it('the right phrase brings back a journal the device has never seen', async () => {
    const { wrappedKey, phrase } = await createJournalKey({ method: 'phrase' });
    const sealed = await encryptNote(NOTE);

    SecureStore.__reset();                         // new phone, nothing local
    expect(await loadJournalKey()).toBeNull();
    expect(await decryptNote(sealed)).toBeNull();  // and it stays shut

    expect(await restoreJournalKey({ wrappedKey, phrase })).toBe(true);
    expect(await decryptNote(sealed)).toBe(NOTE);
  });

  it('a wrong phrase fails closed and leaves no key behind', async () => {
    const { wrappedKey } = await createJournalKey({ method: 'phrase' });
    SecureStore.__reset();
    expect(await restoreJournalKey({ wrappedKey, phrase: generateRecoveryPhrase() })).toBe(false);
    expect(await loadJournalKey()).toBeNull();
  });

  it('forgives spacing and capitalisation, because this is copied off paper', async () => {
    const { wrappedKey, phrase } = await createJournalKey({ method: 'phrase' });
    const sealed = await encryptNote(NOTE);
    SecureStore.__reset();
    const messy = `  ${phrase.toUpperCase().split(' ').join('   ')}  `;
    expect(await restoreJournalKey({ wrappedKey, phrase: messy })).toBe(true);
    expect(await decryptNote(sealed)).toBe(NOTE);
  });

  it('survives corrupt recovery material without throwing', async () => {
    // A restore screen that crashes instead of saying "that phrase didn't
    // work" is the worst possible place for an unhandled error. tweetnacl
    // throws on a wrong-sized nonce, so every one of these used to crash.
    const cases = [
      'not json',
      '{"v":1}',
      '{"v":1,"ciphertext":"","nonce":""}',
      '{"v":1,"ciphertext":"AAAA","nonce":"AAAA"}',   // right shape, wrong sizes
      '{"v":1,"ciphertext":null,"nonce":null}',
    ];
    for (const wrappedKey of cases) {
      expect(await restoreJournalKey({ wrappedKey, phrase: generateRecoveryPhrase() })).toBe(false);
    }
    expect(await loadJournalKey()).toBeNull();
  });

  it('a truncated wrapped key fails closed rather than half-restoring', async () => {
    const { wrappedKey, phrase } = await createJournalKey({ method: 'phrase' });
    SecureStore.__reset();
    const truncated = wrappedKey.slice(0, wrappedKey.length - 12) + '"}';
    expect(await restoreJournalKey({ wrappedKey: truncated, phrase })).toBe(false);
    expect(await loadJournalKey()).toBeNull();
  });

  it('device-only + wiped device really is gone — and says so by failing', async () => {
    await createJournalKey({ method: 'none' });
    const sealed = await encryptNote(NOTE);
    await forgetJournalKeyOnDevice();
    expect(await decryptNote(sealed)).toBeNull();
  });
});

describe('sealing an entry', () => {
  beforeEach(() => createJournalKey({ method: 'none' }));

  it('produces different ciphertext for the same note every time', async () => {
    const a = await encryptNote(NOTE);
    const b = await encryptNote(NOTE);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.nonce).not.toBe(b.nonce);
    expect(await decryptNote(a)).toBe(await decryptNote(b));
  });

  it('refuses to encrypt when there is no key rather than storing plaintext', async () => {
    await forgetJournalKeyOnDevice();
    await expect(encryptNote(NOTE)).rejects.toThrow('journal_key_missing');
  });

  it('rejects a tampered ciphertext instead of returning garbage', async () => {
    const sealed = await encryptNote(NOTE);
    const bytes = fromBase64(sealed.ciphertext);
    bytes[3] ^= 0xff;
    expect(await decryptNote({ ...sealed, ciphertext: toBase64(bytes) })).toBeNull();
  });

  it('does not leak the note into its own metadata', async () => {
    const sealed = await encryptNote(NOTE);
    expect(JSON.stringify(sealed)).not.toContain('نرقد');
    expect(sealed.encAlg).toBe('nacl.secretbox');
  });
});

describe('sharing one entry with a clinician', () => {
  it('only the holder of the specialist private key can open it', async () => {
    const specialist = await ensureSharingKeypair();
    const envelope = sealToSpecialist(NOTE, specialist.publicKey);
    expect(envelope.ciphertext).not.toContain('نرقد');
    expect(await openSharedEnvelope(envelope)).toBe(NOTE);
  });

  it('a different clinician cannot open it', async () => {
    const intended = await ensureSharingKeypair();
    const envelope = sealToSpecialist(NOTE, intended.publicKey);
    SecureStore.__reset();                 // a different device, different keypair
    await ensureSharingKeypair();
    expect(await openSharedEnvelope(envelope)).toBeNull();
  });

  it('keeps the same keypair across calls, so old shares keep opening', async () => {
    const first = await ensureSharingKeypair();
    const envelope = sealToSpecialist(NOTE, first.publicKey);
    const again = await ensureSharingKeypair();
    expect(again.publicKey).toBe(first.publicKey);
    expect(await openSharedEnvelope(envelope)).toBe(NOTE);
  });

  it('uses a fresh sender key per share, so shares are not linkable', () => {
    const pk = 'A'.repeat(43) + '=';
    const a = sealToSpecialist(NOTE, pk);
    const b = sealToSpecialist(NOTE, pk);
    expect(a.senderPublicKey).not.toBe(b.senderPublicKey);
  });
});
