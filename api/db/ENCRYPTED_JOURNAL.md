# The encrypted journal (Phase 2.5)

`journal_entries.note` was the most intimate free text in the system and it sat
in plaintext beside everything else — readable by the server, by anyone with a
database credential, and by the treating specialist by default. After this the
patient holds the key.

This file exists because the interesting parts of 2.5 are the trade-offs, and
they are not visible from the schema.

## The safety argument

Rule 1 of the engineering plan: **never widen the safety gap.** Encryption is
the one change in this codebase that could do it quietly, because today a
journal note runs through two layers — an instant keyword scan and an LLM
classifier — and a high verdict pages the specialist *with the triggering
text*. All three of those had to survive.

| | Before | After |
|---|---|---|
| Keyword layer | server, on the stored note | **device**, before encryption, using the pattern list served by `GET /api/journal/scan-patterns` |
| LLM layer | server, async, dead-lettered | `POST /api/journal/scan` — classifies and **stores nothing**, returns a signed verdict |
| Alert | fires with `detail.trigger` | fires with `detail.encrypted: true` and `crisis_envelope`, the excerpt sealed to the specialist's public key |

**Plaintext still passes through the server once, for the scan.** It is never
written down — no row, no log line, no response field. That is the honest
trade at the centre of this phase: the alternative was losing the stronger of
the two safety layers entirely. The setup screen says so in plain language
before the patient turns the lock on, in both languages.

### Why the verdict is signed

An unsigned verdict is a field a modified client sets to `"safe"`. The scan
endpoint HMACs `verdict | sha256(text) | userId | exp`, so a client can only
*omit* the attestation — and an omission is dead-lettered, counted by
`/api/health/safety`, and never resolved by the worker.

What this does **not** do, stated plainly because the alternative is
overclaiming: it cannot prove the ciphertext holds the text that was scanned.
Nothing can — the client owns the key. The achievable property is that an
unscanned entry is *visibly* unscanned. That is the same principle as the
Phase 1 dead letters: the failure mode is a known gap, never a silent one.

### The counter that was hiding the gap

`countUnscannedEncryptedEntries` originally counted `WHERE scan IS NULL`. But
a rejected attestation writes `scan = {"status":"unverified"}`, which is not
NULL — so the metric whose entire job is to make a gap visible reported **0
while two such entries sat in the table**. Found on live data, not in tests.
It now counts anything that is not `status = 'verified'`, and both the API
suite and the SQL smoke checks pin that behaviour.

## What the specialist lost, and what they gained

They lost **default** access to journal notes. Before this, every note was
visible on `/api/specialist/patients/:id/checkins`; now a locked note reaches
them only if the patient sealed that specific entry to them. This is a real
clinical change and it was the point of the phase — blanket visibility becomes
per-entry consent.

Three things deliberately did *not* change:

- **The sliders always travel.** Mood/stress/energy/sleep are the trend the
  treatment runs on, they carry no free text, and locking them would cost the
  whole measurement layer for no privacy gain.
- **Locked entries are shown as locked, not omitted.** An empty-looking day and
  a day the patient chose to keep are different facts.
- **Existing plaintext notes stay as they are.** Encryption starts when the
  patient opts in. Nothing already written is destroyed or rewritten.

## Deviations from the plan, and why

The plan specified *"key derived from a device secret in `expo-secure-store` +
an optional user PIN, via Argon2id"* and *"recovery phrase, or server escrow"*.
Two of those are not shipped:

**No PIN.** Argon2id is what makes a 4–6 digit secret defensible, and every
pure-JS Argon2 in React Native is either a native module (breaking Expo Go) or
unusably slow. The fallback — PBKDF2-HMAC-SHA512 over tweetnacl — was written,
measured and removed: 200k iterations cost ~13s on a developer desktop, so
30–60s on the phones these patients actually use, and even then a 4-digit PIN
wrapping a *server-stored* key falls to an offline GPU search in minutes.
Shipping it would have been a slow unlock screen that also lied about how
protected the journal was. The recovery phrase carries 128 bits of CSPRNG
entropy, where there is nothing to stretch and a single SHA-512 is sufficient.

**No server escrow yet.** The column accepts `method = 'escrow'` so the flow
can be added without a migration. What does not exist is the operational half:
who may ask for a patient's journal to be reopened, how their identity is
verified, and who signs off. Offering the option before that policy is written
would let a patient choose "the clinic can recover this for me" when no clinic
process can.

## Recovery, designed before the crypto

- **`phrase`** — 16 words from a 256-word list (one random byte per word, no
  modulo bias; the module throws at load if the list ever drifts off 256).
  The journal key is wrapped under SHA-512 of the phrase. Lose the phrase *and*
  the device and the entries are gone — the setup screen says exactly that, and
  the phrase must be confirmed before the lock engages.
- **`none`** — device only. Offered, never the default.

Words that carry weight for this population (*fear, pain, knife, prison,
regret, nerve, whip*) were removed from the list. A recovery phrase should not
read like a symptom checklist.

## The launch crash, and what it changed

The first build of this feature **stopped immediately on launch.** Two causes,
both mine, both worth recording:

1. **`expo-secure-store` was installed with `npm install`, not `npx expo
   install`** — so npm resolved the standalone latest (57.0.1) instead of the
   version matching Expo SDK 54 (`~15.0.8`). A native module built against a
   different SDK does not load. `npx expo-doctor` catches this in seconds and
   is now the thing to run after adding any Expo package.
2. **tweetnacl had no PRNG.** It wires one from `self.crypto.getRandomValues`
   or Node's `require('crypto')`, and Hermes guarantees neither — so
   `nacl.randomBytes` would have thrown `no PRNG` at key generation, nonce
   generation and phrase generation. It is now set explicitly from
   `expo-crypto`. `TextEncoder`/`TextDecoder` were the same class of
   assumption and are now hand-rolled UTF-8 in the module.

The deeper problem was not either bug but the **coupling**: `journalCrypto`
was statically imported from `navigation/index.js`, which put two native
modules on the boot path. Anything wrong with them took the whole app down
before the first screen rendered — including the crisis screen. Rule 6 says
the crisis path is never more than one tap away, and an app that will not open
has no crisis path at all.

So the crypto module is now loaded **lazily at all three call sites**
(`store/journalLock.js`, `navigation/index.js`, the specialist patient file),
and a failure to load sets `useJournalLock.unavailable`, which shows an
explanation on the lock screen. Journal encryption is a feature; being able to
reach the emergency numbers is why the app exists. A broken feature must
degrade to "the lock is unavailable", never to "the app does not start".

## Operational notes

- `expo-secure-store` and `expo-crypto` are native modules: **this does not
  ship over EAS Update.** It needs a new build, and `app.json` must list
  `expo-secure-store` in `plugins`.
- Add Expo packages with `npx expo install`, never `npm install`, and run
  `npx expo-doctor` afterwards.
- `npx expo export --platform android` catches resolution and bundling
  failures without a full build (`npm run export:check`).
- The specialist's sharing keypair is generated on their **phone** and its
  private half never reaches a browser, so the web console can show that a note
  is shared but cannot open it. It links to the app instead of pretending the
  note is missing.
- Bump `PATTERNS_VERSION` in `src/utils/safety.js` whenever `RISK_PATTERNS`
  changes; each entry's attestation records the version that judged it.
