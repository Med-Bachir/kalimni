# كلّمني — Kalimni

Arabic-first (RTL) + French teletherapy platform: patients talk to licensed
mental-health specialists through secure chat, guided by a clinically validated
intake questionnaire. Three-sided product: **patient app**, **specialist
interface**, and **admin panel** — all inside one React Native (Expo) app with
role-based navigation, backed by a Node.js API.

Built from the hi-fi mockups in `Kalimni App Design.html` (13 screens, turns 1–2).

## Structure

```
psycology app/
├── api/        Node.js (Express 5 + Socket.IO) API, PostgreSQL data layer
├── client/     React Native app (Expo SDK 54) — Android-first, runs in Expo Go
│               (a custom dev build is only needed for live audio calls, see below)
├── docker-compose.yml   Dev PostgreSQL (host port 5433)
└── Kalimni App Design.html   Original design mockups
```

## Quick start

**1. Database** (from the project root — needs Docker):

```bash
docker compose up -d          # starts PostgreSQL on host port 5433
```

The dev DB uses host port **5433** (not the default 5432) so it coexists with
any other local Postgres — change the mapping in `docker-compose.yml` and the
`DATABASE_URL` in `api/.env` together if you need a different port.

**2. API** (terminal 1):

```bash
cd api
npm install
cp .env.example .env    # then edit if needed (DB URL, Agora keys)
npm run db:setup        # creates the schema + loads demo data (re-runnable; resets everything)
npm run dev             # or: npm start — listens on http://0.0.0.0:4000
```

**3. Mobile app** (terminal 2):

```bash
cd client
npm install
npm start          # scan the QR with Expo Go on Android
```

The client auto-derives the API host from the Metro dev server, so a phone on
the **same Wi-Fi** reaches the API with zero config. To override, create
`client/.env` with `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000/api`.

### Demo accounts (password for all: `password123`)

| Role | Email | Notes |
|---|---|---|
| Patient | `amina@email.com` | Assigned to Dr Samir, seeded chat + GAD-7 moderate |
| Patient | `leila@email.com` | Unassigned — pending matching request |
| Specialist | `samir@kalimni.app` | Approved, 3 patients |
| Specialist | `nadia@kalimni.app` | Approved (French UI) |
| Specialist | `hicham@kalimni.app` | **Pending approval** — sees the waiting screen |
| Admin | `admin@kalimni.app` | Dashboard, matching, approvals, CMS |

Data persists in the Postgres Docker volume across restarts. To reset to the
seed, re-run `npm run db:setup`; to wipe the volume entirely, `docker compose
down -v`.

## What's implemented

- **Auth & roles** — email/password (JWT, bcrypt), mock Google sign-in
  (`MOCK_GOOGLE_AUTH=true`; swap in `google-auth-library` verification for
  production), three roles. Specialists register freely but are blocked from
  operating until an admin approves them.
- **Intake questionnaire** — validated **GAD-7** and **PHQ-9** (Arabic +
  French), standard clinical scoring bands. PHQ-9 item 9 (self-harm ideation)
  triggers the safety protocol regardless of total score. Retake from profile;
  full history visible to the patient and their specialist.
- **Manual matching via admin** — completing intake without an assigned
  specialist enqueues a matching request (with score context). Admin assigns /
  reviews / rejects; assignment auto-creates the conversation and notifies both
  sides over sockets. Statuses: new → review → accepted/rejected.
- **Real-time chat** — REST send + Socket.IO push: delivery/read receipts
  (single/double tick), online presence, typing indicator, day separators,
  unread badges on tabs and lists.
- **Session scheduling** — either party proposes a session (slot picker: day /
  time / duration / call-or-chat) from the chat; the other confirms or declines
  over sockets. A confirmed/proposed session shows as a card in the chat, on the
  patient's home screen, and in the specialist's patient file. One open slot per
  conversation; either side can cancel. Lightweight by design (no full calendar
  yet — MVP scope).
- **Safety layer** — crisis screen (reachable pre-login, from onboarding,
  profile, home) with emergency numbers; onboarding disclaimer ("not a
  substitute for emergency care"); risk-keyword scan (ar/fr) on patient
  messages → flags the message to the specialist with a crisis-protocol
  reminder, gently shows the patient the crisis resources banner, and raises a
  safety alert the specialist must acknowledge.
- **Content library** — 12 seeded articles/exercises (ar + fr), categories,
  search, featured card, article reader with embedded exercise CTA, animated
  **4-7-8 breathing player**, admin CMS (create/edit/delete).
- **Profile & privacy** — personal data editing, questionnaire history,
  notification toggle, **language switch (ar ⇄ fr with RTL/LTR flip)**,
  privacy screen citing Algeria's **Law 18-07**, full **account deletion**
  (personal data removed, messages anonymized).
- **Specialist interface** — patient list with filters (all / new messages /
  new cases), intake score chips, safety-alert markers, patient file, chats.
- **Admin panel** — stats dashboard, user directory, specialist approval
  queue, matching workflow, content CMS.
- **Live audio calls** — real signaling (invite/accept/reject/end) over
  Socket.IO plus Agora for the actual audio, with an incoming-call screen
  reachable from anywhere in the app. See **Live audio calls** below —
  it needs one free credential and a different run command than the rest of
  the app.

## Live audio calls

Calling has two independently working layers:

1. **Signaling** (who's calling whom, ringing/accept/reject/end, a 45s
   ring timeout) — plain REST + Socket.IO in `api/src/routes/calls.js`, works
   out of the box, no account needed. Covered by `smoke_calls`-style checks.
2. **Audio** (actually hearing the other person) — needs
   [Agora](https://console.agora.io) (free tier, ~2 minutes to sign up) and a
   **custom dev build**, because `react-native-agora` is native code that
   doesn't exist inside Expo Go.

**Without an Agora App ID**, the app still works exactly as before: ringing,
accept/reject, and the call screen all function, but the call screen shows
"المكالمات غير مُفعّلة بعد / calls not configured yet" instead of joining audio.
Tapping the call button under plain Expo Go is also safe — it shows a
"needs a dev build" message rather than crashing.

**To enable real audio:**

1. Create a free project at [console.agora.io](https://console.agora.io) →
   copy its **App ID**. For a quick demo, leave the project's authentication
   mode as "App ID" (no certificate needed — tokens are optional in that mode).
2. Add to `api/.env`:
   ```
   AGORA_APP_ID=your-app-id
   ```
   Restart the API (`npm run dev` picks this up automatically via nodemon).
3. Build a dev client instead of using Expo Go (one-time per device):
   ```bash
   cd client
   npx expo run:android     # builds + installs a custom Kalimni dev client via USB/adb
   ```
   From then on, run `npm start` as usual and open the app from the **Kalimni
   dev client** icon on the phone (not Expo Go) — it connects to the same
   Metro server and supports Fast Refresh identically, it just also has
   `react-native-agora`'s native code compiled in.
4. Two devices/accounts (e.g. a patient and their specialist) can now call
   each other from an open chat — mic permission is requested on first call.

Call history isn't surfaced in the UI yet; records exist in the `calls` table
for a future "recent calls" view.

## Deliberately deferred (v1.1+)

- **Video calls** — audio-only for MVP; Agora also supports video with a
  small addition (`enableVideo()` + a `RtcSurfaceView`) if needed later.
- **Push notifications (FCM)** — realtime updates (chat, calls, session
  proposals) are socket-based while the app is open; add `expo-notifications`
  + FCM so an incoming call/message/session rings when the app is backgrounded
  or closed.
- **Full calendar / availability** — scheduling today is one proposed slot per
  conversation; a specialist availability calendar with recurring slots and
  reminders is the natural next step.
- Real Google token verification, payments, audio content production.

## Important production notes

- The UI says **"encrypted"** (TLS in transit) — do not claim end-to-end
  encryption unless it's actually implemented.
- **Verify the crisis hotline numbers** in `api/src/utils/safety.js` with the
  operating authorities before release, and set a real `JWT_SECRET`.
- Health data falls under Algeria's **Law 18-07** on personal-data protection —
  the account-deletion flow already cascades in Postgres; keep it and the
  consent flows intact, and encrypt data at rest for production.

## RTL / language notes

Arabic is the default and forces RTL; switching to French flips to LTR. The
direction change reloads the app instantly in Expo Go / dev builds; production
builds apply it on next launch.
