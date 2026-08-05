// Request-body schemas (Phase 3.2). Only shape and bounds live here —
// ownership, clinical rules and state machines stay in the routes where the
// reasoning is visible.
//
// Every schema is `.strict()`: an unexpected key is a 400 rather than a
// silently ignored field. That is what stops a client from smuggling
// `{ role: 'admin' }` or `{ riskFlag: false }` into a body the route spreads.
const { z } = require('zod');

const email = z.string().trim().toLowerCase().regex(/^\S+@\S+\.\S+$/);
const language = z.enum(['ar', 'fr']);
const iso = z.string().datetime({ offset: true }).or(z.string().min(10));

// --- auth ---------------------------------------------------------------------
const register = z.object({
  name: z.string().trim().min(1).max(120),
  email,
  password: z.string().min(8).max(200),
  role: z.enum(['patient', 'specialist']).default('patient'),
  language: language.default('ar'),
}).strict();

const login = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1).max(200),
}).strict();

// Mock mode accepts { email, name }; real mode { idToken } (routes decide).
const google = z.object({
  idToken: z.string().min(1).optional(),
  email: z.string().trim().optional(),
  name: z.string().trim().max(120).optional(),
}).strict();

// --- users --------------------------------------------------------------------
// settings is a WHITELIST, not a merge of whatever arrives: `aiCompanion` is
// the specialist's control over the companion, and a patient must not be able
// to switch it back on from their own profile screen.
const updateMe = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  language: language.optional(),
  settings: z.object({
    notifications: z.boolean().optional(),
  }).strict().optional(),
}).strict();

const pushToken = z.object({
  token: z.string().min(1).max(300),
  platform: z.string().max(30).nullish(),
}).strict();

// --- companion / journal --------------------------------------------------------
const aiChat = z.object({
  text: z.string().trim().min(1).max(2000),
}).strict();

// The patient rewriting what the companion remembers about them (Phase 2.4).
// Empty is legitimate — it means "you remember nothing about me" — so no min.
const memoryUpdate = z.object({
  text: z.string().max(1500),
}).strict();

const slider = z.number().int().min(1).max(5);

// The written note is either plaintext or ciphertext, never both (the column
// CHECK in migration 007 enforces it in the database too). `scan` is the
// client's safety attestation — deliberately NOT required by the schema: a
// missing attestation must reach the route so it can be dead-lettered and
// counted, not bounce off a validator as a 400 the client can retry away.
const scanAttestation = z.object({
  verdict: z.enum(['none', 'low', 'high']),
  textHash: z.string().max(120),
  exp: z.number().int(),
  sig: z.string().max(200),
  keyword: z.boolean().optional(),
  patternsVersion: z.number().int().optional(),
}).strict();

const envelope = z.object({
  ciphertext: z.string().max(20000),
  nonce: z.string().max(120),
  senderPublicKey: z.string().max(120),
}).strict();

const checkin = z.object({
  mood: slider, stress: slider, energy: slider, sleep: slider,
  note: z.string().max(2000).nullish(),
  ciphertext: z.string().max(20000).optional(),
  nonce: z.string().max(120).optional(),
  keyVersion: z.number().int().min(1).max(1000).optional(),
  encAlg: z.string().max(40).optional(),
  scan: scanAttestation.optional(),
  crisisEnvelope: envelope.optional(),
}).strict()
  .refine((v) => !(v.note && v.ciphertext), { message: 'note_and_ciphertext' })
  .refine((v) => !v.ciphertext || !!v.nonce, { message: 'nonce_required' });

// --- encrypted journal (Phase 2.5) --------------------------------------------
const journalScan = z.object({
  text: z.string().trim().min(1).max(2000),
}).strict();

const journalRecovery = z.object({
  method: z.enum(['phrase', 'escrow', 'none']),
  wrappedKey: z.string().max(2000).optional(),
  keyVersion: z.number().int().min(1).max(1000).optional(),
  publicKey: z.string().max(120).optional(),
}).strict();

const publicKey = z.object({
  publicKey: z.string().min(20).max(120),
}).strict();

const journalShare = z.object({
  envelope,
}).strict();

// --- session witness (Phase 2.3) --------------------------------------------------
// `includedIds` is the consent list, and its ABSENCE is meaningful: a save
// that only carries notes must not silently untick everything. The route
// distinguishes the two, so the field stays optional here rather than
// defaulting to [].
const briefDraft = z.object({
  notes: z.array(z.string().max(300)).max(3).optional(),
  includedIds: z.array(z.string().max(40)).max(20).optional(),
}).strict();

const briefTakeaway = z.object({
  text: z.string().max(500),
}).strict();

// --- chat -----------------------------------------------------------------------
const message = z.object({
  text: z.string().trim().min(1).max(4000),
}).strict();

// --- questionnaires ---------------------------------------------------------------
const questionnaireSubmit = z.object({
  answers: z.array(z.number().int().min(0).max(3)).min(1).max(30),
}).strict();

// --- appointments ------------------------------------------------------------------
const appointmentCreate = z.object({
  conversationId: z.string().min(1),
  scheduledAt: iso,
  durationMin: z.number().int().min(10).max(180).optional(),
  mode: z.enum(['call', 'chat']).optional(),
  note: z.string().max(500).nullish(),
}).strict();

const appointmentRespond = z.object({
  action: z.enum(['confirm', 'decline']),
}).strict();

// --- safety ---------------------------------------------------------------------
const alertAck = z.object({
  // Shape only. "An ack must record a real clinical action" is a domain rule,
  // so the route keeps that check — and its `action_taken_required` code,
  // which the client's ack modal reads (Phase 1.1).
  actionTaken: z.string().max(2000).optional(),
}).strict();

const rotaCreate = z.object({
  specialistId: z.string().min(1),
  tier: z.union([z.literal(1), z.literal(2)]).default(1),
  startsAt: iso,
  endsAt: iso,
}).strict();

// --- calls -----------------------------------------------------------------------
const callInvite = z.object({
  conversationId: z.string().min(1),
  media: z.enum(['voice', 'video']).optional(),
}).strict();

module.exports = {
  register, login, google,
  updateMe, pushToken,
  aiChat, checkin, memoryUpdate,
  journalScan, journalRecovery, publicKey, journalShare,
  briefDraft, briefTakeaway,
  message,
  questionnaireSubmit,
  appointmentCreate, appointmentRespond,
  alertAck, rotaCreate,
  callInvite,
};
