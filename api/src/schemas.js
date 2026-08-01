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

const slider = z.number().int().min(1).max(5);
const checkin = z.object({
  mood: slider, stress: slider, energy: slider, sleep: slider,
  note: z.string().max(2000).nullish(),
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
  aiChat, checkin,
  message,
  questionnaireSubmit,
  appointmentCreate, appointmentRespond,
  alertAck, rotaCreate,
  callInvite,
};
