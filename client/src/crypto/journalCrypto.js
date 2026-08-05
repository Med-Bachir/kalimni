import nacl from 'tweetnacl';
import * as SecureStore from 'expo-secure-store';

// Journal encryption (Phase 2.5). The patient holds the key; the server holds
// ciphertext it cannot open.
//
// PRIMITIVES — chosen for being boring and auditable, not clever:
//   entry body     nacl.secretbox  (XSalsa20-Poly1305) under a 32-byte journal key
//   sharing        nacl.box        (X25519 + XSalsa20-Poly1305) to a specialist
//   key wrapping   secretbox under a key derived from the recovery phrase
//
// ON THE KDF, AND ON THE PIN THAT IS NOT HERE. The plan specifies "a device
// secret + an optional user PIN, via Argon2id". This ships the device secret
// and the phrase, and deliberately does NOT ship the PIN:
//
//   * The recovery phrase carries 128 bits of CSPRNG entropy. Key stretching
//     exists to make LOW-entropy secrets expensive to guess; against 128
//     random bits there is nothing to stretch, so a single SHA-512 is
//     cryptographically sufficient and instant.
//   * A PIN is the opposite case, and it is the one that cannot be made safe
//     here. Argon2id is what makes a 4-6 digit secret defensible, and every
//     pure-JS Argon2 in React Native is either a native module (breaking Expo
//     Go) or unusably slow. The fallback, PBKDF2-HMAC-SHA512 over tweetnacl,
//     was written, measured, and removed: 200k iterations cost ~13s on a
//     developer desktop, so 30-60s on the phones these patients actually use,
//     and even then a 4-digit PIN wrapping a SERVER-STORED key falls to an
//     offline GPU search in minutes. Shipping it would have been a slow
//     unlock screen that also lied about how protected the journal was.
//
// So: the phrase is the recovery mechanism, and the device keystore (which is
// already gated on device unlock) is the day-to-day one. If a real Argon2id
// becomes available in this runtime, a PIN can be added as a second wrapper
// without touching anything else here.

const KEY_STORE = 'kalimni.journal.key.v1';
const SHARE_SK_STORE = 'kalimni.journal.sharesk.v1';
const KEY_VERSION = 1;

// --- encoding ------------------------------------------------------------------
const utf8 = {
  encode: (s) => new TextEncoder().encode(s),
  decode: (b) => new TextDecoder().decode(b),
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b || 0) >> 4)];
    out += b === undefined ? '=' : B64[((b & 15) << 2) | ((c || 0) >> 6)];
    out += c === undefined ? '=' : B64[c & 63];
  }
  return out;
}
function fromBase64(str) {
  const clean = String(str).replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12)
      | ((clean[i + 2] ? B64.indexOf(clean[i + 2]) : 0) << 6)
      | (clean[i + 3] ? B64.indexOf(clean[i + 3]) : 0);
    out[p++] = (n >> 16) & 255;
    if (clean[i + 2]) out[p++] = (n >> 8) & 255;
    if (clean[i + 3]) out[p++] = n & 255;
  }
  return out.slice(0, p);
}

// --- recovery phrase ----------------------------------------------------------------
// EXACTLY 256 words, so one random byte selects one word with no modulo bias
// and 16 words carry exactly 128 bits. The guard below is not decoration: a
// wordlist that quietly drifts to 255 or 257 entries would bias every key
// generated afterwards, and nothing else in the system would notice.
//
// The words are short, concrete and unambiguous to hand-copy — this gets
// written on paper by someone who may be exhausted or shaking. Words that
// carry weight for this particular population (fear, pain, knife, prison,
// regret, nerve, whip) were deliberately removed: a recovery phrase should
// not read like a symptom checklist.
const WORDS = ('able acid aim air ant arm art ask bag ball band bank bar base bath bay bean bear bed bell belt '
  + 'bird blue boat body bone book boot bowl box boy bread brick bridge brush bus cake call camp can cap car card '
  + 'cat chain chair cheese chess chin city clock cloud coal coat cold comb cook copper cord cow cup cut dark day '
  + 'deep desk dog door drain dress drink drop dust ear earth egg elbow engine eye face fall farm feather '
  + 'field finger fire fish flag floor flower fly foot fork fowl frame friend fruit garden girl glass glove goat '
  + 'gold grain grass green grip hair hammer hand hat head heart hill hole hook horn horse house ice ink iron '
  + 'island jelly jewel join journey judge jump keel kettle key kick knee knot leaf leather leg letter '
  + 'library lift light line lip list lock loop map match milk mind mine minute mist money monkey moon mouth '
  + 'muscle nail name neck needle net news night nose note nut oil orange oven page paint paper parcel '
  + 'pen pencil pig pin pipe plane plate plough pocket pot potato pump quill rail rain rat receipt record '
  + 'rice ring rod roof root sail salt sand scale school scissors screw seed sheep shelf ship shirt shoe '
  + 'skin skirt snake sock spade sponge spoon spring square stamp star station stem stick stitch stocking stomach '
  + 'store street sun table tail thread throat thumb ticket toe tongue tooth town train tray tree trousers '
  + 'umbrella wall watch water wheel whistle window wing wire worm').split(/\s+/);

if (WORDS.length !== 256) {
  throw new Error(`journalCrypto: wordlist must be exactly 256 words, found ${WORDS.length}`);
}

const PHRASE_WORDS = 16; // x 8 bits = 128 bits of entropy

function generateRecoveryPhrase() {
  const bytes = nacl.randomBytes(PHRASE_WORDS);
  return Array.from(bytes, (b) => WORDS[b]).join(' ');
}

const normalisePhrase = (phrase) => String(phrase || '').trim().toLowerCase().split(/\s+/).join(' ');

// --- key material -------------------------------------------------------------------

/** The journal key, from the device's secure store. null when not set up. */
async function loadJournalKey() {
  const stored = await SecureStore.getItemAsync(KEY_STORE);
  return stored ? fromBase64(stored) : null;
}

async function storeJournalKey(key) {
  await SecureStore.setItemAsync(KEY_STORE, toBase64(key), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Wipe the key from THIS device. Recovery material is what brings it back. */
async function forgetJournalKeyOnDevice() {
  await SecureStore.deleteItemAsync(KEY_STORE).catch(() => {});
}

const wrappingKeyFromPhrase = (phrase) =>
  nacl.hash(utf8.encode(`kalimni.journal.phrase.v1|${normalisePhrase(phrase)}`)).slice(0, 32);

function wrapKey(journalKey, wrappingKey) {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return {
    ciphertext: toBase64(nacl.secretbox(journalKey, nonce, wrappingKey)),
    nonce: toBase64(nonce),
  };
}

// Returns null for "that phrase does not open this", including when the stored
// material is malformed. tweetnacl THROWS on a wrong-sized nonce rather than
// returning null, and a truncated or corrupted `wrappedKey` is a real
// possibility — so the length checks and the catch are load-bearing: without
// them a corrupt blob crashes the restore screen instead of saying "that
// phrase didn't work", on the one screen where a patient is already anxious.
function unwrapKey(wrapped, wrappingKey) {
  try {
    const ciphertext = fromBase64(wrapped?.ciphertext || '');
    const nonce = fromBase64(wrapped?.nonce || '');
    if (nonce.length !== nacl.secretbox.nonceLength || ciphertext.length <= nacl.secretbox.overheadLength) {
      return null;
    }
    return nacl.secretbox.open(ciphertext, nonce, wrappingKey) || null;
  } catch {
    return null;
  }
}

/**
 * Turn the lock on. Returns the material the caller must persist:
 * `wrappedKey` goes to the server, `phrase` is shown to the patient ONCE.
 */
async function createJournalKey({ method }) {
  const journalKey = nacl.randomBytes(32);
  await storeJournalKey(journalKey);

  if (method === 'none') return { keyVersion: KEY_VERSION, wrappedKey: null, phrase: null };

  const phrase = generateRecoveryPhrase();
  const payload = { v: 1, kdf: 'sha512', ...wrapKey(journalKey, wrappingKeyFromPhrase(phrase)) };
  return { keyVersion: KEY_VERSION, wrappedKey: JSON.stringify(payload), phrase };
}

/** Restore on a new device. Returns true when the phrase actually opened it. */
async function restoreJournalKey({ wrappedKey, phrase }) {
  let payload;
  try {
    payload = JSON.parse(wrappedKey);
  } catch {
    return false;
  }
  const key = phrase ? unwrapKey(payload, wrappingKeyFromPhrase(phrase)) : null;
  if (!key) return false;
  await storeJournalKey(key);
  return true;
}

// --- entries -------------------------------------------------------------------------

/** Seal one note. The caller attaches the safety attestation separately. */
async function encryptNote(text) {
  const key = await loadJournalKey();
  if (!key) throw new Error('journal_key_missing');
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return {
    ciphertext: toBase64(nacl.secretbox(utf8.encode(String(text)), nonce, key)),
    nonce: toBase64(nonce),
    keyVersion: KEY_VERSION,
    encAlg: 'nacl.secretbox',
  };
}

/** Open one note. Returns null rather than throwing when the key is wrong. */
async function decryptNote(entry) {
  const key = await loadJournalKey();
  if (!key || !entry?.ciphertext) return null;
  const opened = nacl.secretbox.open(fromBase64(entry.ciphertext), fromBase64(entry.nonce), key);
  return opened ? utf8.decode(opened) : null;
}

// --- sharing ---------------------------------------------------------------------------
// One entry, one clinician, one envelope. The patient's sharing keypair is
// ephemeral per share — there is no reason for a long-lived patient identity
// key here, and a fresh one leaks less.

function sealToSpecialist(text, specialistPublicKeyB64) {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const boxed = nacl.box(
    utf8.encode(String(text)), nonce, fromBase64(specialistPublicKeyB64), ephemeral.secretKey
  );
  return {
    ciphertext: toBase64(boxed),
    nonce: toBase64(nonce),
    senderPublicKey: toBase64(ephemeral.publicKey),
  };
}

/** The clinician side: their own keypair, private half never leaving the device. */
async function ensureSharingKeypair() {
  const stored = await SecureStore.getItemAsync(SHARE_SK_STORE);
  if (stored) {
    const secretKey = fromBase64(stored);
    return { publicKey: toBase64(nacl.box.keyPair.fromSecretKey(secretKey).publicKey), secretKey };
  }
  const pair = nacl.box.keyPair();
  await SecureStore.setItemAsync(SHARE_SK_STORE, toBase64(pair.secretKey), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return { publicKey: toBase64(pair.publicKey), secretKey: pair.secretKey };
}

async function openSharedEnvelope(envelope) {
  if (!envelope) return null;
  const { secretKey } = await ensureSharingKeypair();
  const opened = nacl.box.open(
    fromBase64(envelope.ciphertext), fromBase64(envelope.nonce),
    fromBase64(envelope.senderPublicKey), secretKey
  );
  return opened ? utf8.decode(opened) : null;
}

export {
  KEY_VERSION, PHRASE_WORDS,
  loadJournalKey, forgetJournalKeyOnDevice,
  createJournalKey, restoreJournalKey, generateRecoveryPhrase,
  encryptNote, decryptNote,
  sealToSpecialist, ensureSharingKeypair, openSharedEnvelope,
  toBase64, fromBase64,
};
