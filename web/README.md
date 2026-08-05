# Kalimni — specialist console (web)

The desk-shaped view of the same API the mobile app uses. Specialists work at
desks; the phone tabs are cramped for a caseload review, an escalation queue,
or a measurement trajectory.

Nothing here is a new privilege surface: every endpoint it calls is one the
mobile app already exposes, behind the same `requireApprovedSpecialist` /
`requireRole('admin')` guards. Patients cannot use this console — the API
refuses them, and the login screen says so plainly rather than dropping them
into a wall of 403s.

## What's in it

| Page | For | What it shows |
|---|---|---|
| **Patients** | specialists | Caseload table: latest intake result, open-alert count, unread messages, new-case flag |
| **Patient detail** | specialists | Open safety alerts (with ack), session briefs, the MBC panel, questionnaire history, recent check-ins |
| **Alerts** | specialists + admins | Escalation console: every open alert oldest-first, the tier-2 critical banner, the per-alert page trail |
| **Rota** | admins | On-call rota — who gets paged when an *unassigned* patient is in crisis |

The **brief panel** (Phase 2.3) sits above the numbers, and that ordering is
deliberate: what the patient chose to say comes before what the app computed
about them. Everything in it was ticked by the patient — items they left
unticked were *deleted* when they pressed send, so there is nothing withheld
to go looking for and no draft the console can reach. The one exception is the
`locked` safety item, which ships regardless and is labelled as such on both
screens, because a checkbox that could suppress a safety alert would be a
patient-facing lie and a clinician-facing hazard.

The **MBC panel** (Phase 2.2) is clinician-only by construction: it reads
`/api/specialist/patients/:id/mbc`, which no patient token can call, and
nothing it shows is mirrored onto any patient surface. Reliable-change
indices, the non-response flag, and the PHQ-9 item-9 series are treatment
information, not feedback — the moment better numbers become something to
achieve, the questionnaires stop being the honest instrument the treatment
depends on.

## Running it

```bash
npm install
npm run dev        # http://localhost:5174
```

Dev proxies `/api` to `http://localhost:4000`, so the browser sees one origin
and CORS never enters the picture. Point it elsewhere with
`VITE_API_TARGET=https://your-api.example.com npm run dev`.

## Deploying it

```bash
npm run build      # -> dist/
```

Two things the API needs for a deployed console:

1. `VITE_API_URL` at build time — the full API base, e.g.
   `https://kalimni.onrender.com/api`.
2. The console's origin added to the API's **`CORS_ORIGINS`** (comma-separated).
   Without it the browser blocks every request; the native app is unaffected
   because it sends no `Origin` header.

Serve `dist/` as static files. `index.html` carries `noindex, nofollow` —
clinical console pages must never reach a search index.

## Conventions

- Arabic-first with RTL, French toggle in the header (`src/i18n.jsx`), matching
  the mobile app.
- The session token lives in `sessionStorage`, not `localStorage`: a console
  session on a shared clinic desktop should not survive closing the tab. A 401
  from any call ends the session immediately rather than leaving stale
  clinical data on screen.
- Acknowledging an alert always goes through `AckDialog`, which requires the
  clinical action taken — the server refuses an empty ack and records the text
  in the append-only escalation audit (Phase 1.1).
