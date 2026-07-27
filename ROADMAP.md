# Kalimni — product roadmap

Written after reading the client codebase in full. It assumes the reader knows
the app; it does not re-explain what already exists.

Everything is ordered by **value per unit of risk**, not by how interesting it
is to build. Each item says what it needs (JS-only, native rebuild, or backend),
because that determines whether it ships over EAS Update this week or waits for
a release.

---

## 0. What shipped in this pass

| Thing | Where |
|---|---|
| Logo (speech bubble + leaf), animated and static | `src/components/Logo.js`, `brand/` |
| Animated splash on every cold start | `src/components/SplashOverlay.js`, wired in `App.js` |
| Calm Corner hub | `src/screens/patient/CalmScreen.js` |
| Growing garden | `src/components/Garden.js`, `src/utils/calmData.js` |
| 5-4-3-2-1 grounding | `src/screens/patient/GroundingScreen.js` |
| Passing-thought bubbles | `src/screens/patient/BubblesScreen.js` |
| Thought-trap flip cards | `src/screens/patient/ReframeScreen.js` |
| Daily kindness quests + collectible skies | `src/components/QuestsCard.js`, `src/store/calm.js` |
| Mood asked as weather | `src/components/MoodSky.js`, used by `DailyCheckin` |

No new dependency, no backend change, no new permission. It all ships over EAS
Update.

---

## 1. The rules this app is built on

These are not style preferences. They are the reason the existing
`utils/milestones.js` refuses streaks, and every item below is checked against
them. Write them into the README so the next contributor inherits them.

1. **Nothing can be lost.** No streak, no decay, no expiry, no "you missed N
   days". The week a patient stops opening the app is the week they most need a
   reason to come back — not a punishment for having gone.
2. **The bar is "possible on your worst day."** Any action the app asks for must
   be doable while severely depressed, or it teaches the user the app is for
   other people.
3. **No comparison to other patients, ever.** No leaderboards, no percentiles,
   no "most users do X". Social comparison is actively harmful in this
   population.
4. **Never reward mood improvement.** Reward *showing up*. The moment better
   numbers unlock something, the check-in data becomes fiction — and the
   check-in data is what the specialist treats from.
5. **Motion is feedback, not decoration.** Nothing loops. `components/motion.js`
   already caps `Pulse` at three beats; hold that line.
6. **The crisis path is never more than one tap away** and is never behind a
   modal, a loading state, or a paywall.
7. **Local by default.** If a feature does not need to leave the phone, it does
   not leave the phone.

---

## 2. Ship next — JS-only, goes out over EAS Update

### 2.1 Safety plan screen — **do this first**

A per-patient Stanley-Brown safety plan, stored **on the device only**, reached
from `CrisisScreen` and from Profile:

1. My warning signs
2. Things that help me on my own
3. People and places that distract me
4. People I can ask for help (with tap-to-call)
5. Professionals and services (pre-filled with the crisis numbers)
6. Making my environment safer

This is the single highest-value screen left to build. Safety planning has
better evidence behind it than anything else in the app, it costs one screen and
an AsyncStorage blob, and it turns `CrisisScreen` from a phone number into a
plan the patient wrote themselves while calm. Pre-fill it during intake, let
them edit it any time, and surface it automatically when a check-in scores low.

**Do not** sync it to the server in v1. Ask first, separately, later.

### 2.2 Session prep and recap

Two small screens hung off `AppointmentCard`:

- **Before:** "What do you want to make sure you say?" — three lines, saved
  locally, shown at the top of the call screen.
- **After:** "What are you taking away?" — one line, appended to History.

Patients routinely leave sessions having forgotten the thing they most needed to
raise. Cheap to build, disproportionately improves the actual therapy.

### 2.3 Risk routing on the daily check-in — **safety-critical**

Right now a check-in of `mood: 1, energy: 1` and a note saying something
frightening produces the same supportive line as any other entry. Add, on the
client and mirrored on the server:

- a low-mood threshold that surfaces the crisis card and the safety plan
  immediately, above the usual feedback
- a keyword pass over the free-text note that does the same
- a flag on the specialist's `PatientDetailScreen` so a human sees it

Fail loudly and fail early here. A false positive costs a patient thirty seconds
of mild annoyance. A false negative costs something you cannot get back.

### 2.4 Three good things

An evening card: name three things that went okay and why. One of the most
replicated interventions in the literature, and it fits the existing
`TodayCard` slot. Feeds the garden like everything else.

### 2.5 Worry window

Schedule a 15-minute "worry appointment". Outside it, worries get written down
and deferred; inside it, the app hands them back. Pairs naturally with
`BubblesScreen` and is a standard, well-evidenced GAD technique.

### 2.6 Trend insight lines

`MoodTrend` already has the data; it just doesn't say anything about it. One
plain sentence, generated on the client, no AI: *"Your energy has been lowest on
Sundays for the last three weeks."* Observations only, never advice, and never a
causal claim.

### 2.7 Accessibility pass

Not optional, and unusually load-bearing here: some of these users are heavily
medicated, exhausted, or shaking. Concretely — respect OS text scaling (the app
currently hard-codes every `fontSize`), add `accessibilityLabel` to every icon
button, verify contrast in dark mode, and confirm the new full-screen exercises
are navigable by screen reader.

### 2.8 First-run tour of Calm Corner

Three tooltips, once. Especially the "nothing here can be lost" promise — read
it early and the rest of the app relaxes.

---

## 3. Needs a native rebuild

### 3.1 App lock (`expo-local-authentication`)

Biometric or PIN lock on launch. For an app containing therapy chats, this is
close to table stakes, and users will ask for it the moment they think about it.

### 3.2 Guided audio (`expo-audio` is already installed)

Body scan, sleep wind-down, 10-minute meditation, in Arabic and French with a
real human voice. The biggest perceived-quality jump available for the money.
Stream and cache; do not bundle.

### 3.3 Gentle scheduled notifications (`expo-notifications` is installed)

Strict rules, or skip it entirely:

- one per day, maximum
- never between 22:00 and 08:00
- never loss-framed ("you'll lose your…"), never guilt-framed ("we miss you")
- one tap to make it less frequent, from inside the notification's screen
- silence for a week after the user dismisses two in a row

### 3.4 Home-screen widget

Today's sky + one tap to check in. Removes the biggest friction in the whole
loop: opening the app at all.

### 3.5 Haptic breathing pacer

`utils/haptics.js` is already the right abstraction. A pulse on inhale and
exhale lets someone do `BreathingScreen` with their eyes closed, or in a room
where they cannot look at a phone.

---

## 4. Needs backend work

### 4.1 Specialist-assigned exercises

Let a specialist push a specific exercise or article to a patient with one line
of context, and see whether it was opened. This is what turns the content
library from a pile into treatment. Extends the existing `/content` model.

### 4.2 Journal with consent-per-entry sharing

The check-in note is already there. Give it a home, search, and a **per-entry**
share toggle — never a blanket "your specialist can read your journal". Default
private. Sharing is an explicit act each time.

### 4.3 Measurement-based care dashboard

`checkinDue` and `/questionnaires/history` already implement the biweekly
re-check. Complete the loop: PHQ-9/GAD-7 trajectory per patient, session-over-
session change, and a flag when someone is not responding to treatment after
6-8 weeks. This is the feature that makes the platform defensible to clinics and
insurers, not just to patients.

### 4.4 Appointment lifecycle

Reminders, reschedule, cancel with reason, no-show handling. Currently the
weakest operational surface in the product.

### 4.5 Data export and deletion

Full export and hard delete, self-serve from `PrivacyScreen`. Required in most
jurisdictions you would want to operate in, and much cheaper to build now than
to retrofit.

### 4.6 Offline read

Cache the content library and the last 30 check-ins. Patients open this app on
bad connections, and an empty screen at the wrong moment is worse than a stale
one.

---

## 5. Bigger bets — validate before building

- **AI companion memory.** `/ai/followup` hints at it already. Needs a hard
  safety layer, an explicit "I am not a therapist" boundary the model cannot
  talk itself out of, and a tested human-handoff path.
- **Moderated peer support.** High value, high risk. Do not attempt without
  paid, trained moderation and a crisis escalation runbook. Unmoderated peer
  support in this population causes harm.
- **Carer / family view.** Consent-gated, patient-revocable at any moment,
  showing engagement only — never content.
- **Specialist web app.** The specialist tabs are cramped on a phone. Specialists
  work at desks.
- **Darija and English.** `i18n/` handles a third dictionary with no structural
  change. Darija in particular would meaningfully widen reach.

---

## 6. Deliberately not building

Each of these is a normal, popular feature that is wrong *for this app*.

| Not building | Why |
|---|---|
| Streaks | Breaks exactly when someone relapses, then removes the reason to return. |
| Leaderboards, friend comparison | Social comparison worsens depression; there is no safe version. |
| Loss-framed or guilt-framed notifications | Converts the app into another source of failure. |
| Rewards for better mood scores | Corrupts the clinical data the specialist treats from. |
| Public profiles | No upside here, unbounded downside. |
| AI-generated diagnosis or severity labels | Clinical, regulated, and not something to guess at. |
| Endless-scroll content feed | The library is a pharmacy, not a feed. |
| Ads, or any engagement-maximising metric | The North Star is "did they get better", not time-in-app. |

---

## 7. Suggested order

**Now (this week, EAS Update):** 2.3 risk routing → 2.1 safety plan → 2.2 session
prep/recap → 2.7 accessibility.

**Next release (rebuild):** 3.1 app lock → 3.3 notifications → 3.2 audio.

**Next quarter (backend):** 4.1 assigned exercises → 4.3 measurement dashboard →
4.5 export/delete → 4.2 journal.

Do 2.3 before anything else on this page. Everything else improves the app; that
one is the one that can prevent something irreversible.
