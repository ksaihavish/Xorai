# PRD — Xorai

**Problem Statement:** SIH26003 — AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients in the North Eastern Region
**Ministry:** MDoNER · **Category:** Software · **Deadline:** 20 September 2026

---

## 1. One sentence

A tablet-based, offline-first, voice-first cognitive engagement and memory assistance platform for elderly people living with dementia in the North East, which turns everyday play into a longitudinal record of change that a caregiver can act on.

**Name:** *Xorai* — the Assamese brass offering bowl, given as a gesture of respect to elders. The product is framed as respect and companionship, never as testing.

---

## 2. The scope boundary (non-negotiable, read this before every design decision)

**We do not diagnose. We do not stage. We do not screen.**

| We do | We never do |
|---|---|
| Deliver cognitive stimulation as play | Output a diagnosis |
| Assist with existing deficits (reminders, faces, orientation) | Output a stage (CDR / FAST / GDS) |
| Detect *change* against the person's own baseline | Compare to population norms |
| Surface that change to a caregiver, who escalates to a clinician | Tell a caregiver their relative is declining |

Severity (mild / moderate / severe) is an **input** taken from the caregiver at onboarding — it gates difficulty and which modules appear. It is never an output.

Defensible: *"recall accuracy has been lower than usual for three weeks — here is the trend."*
Indefensible: *"this patient is at GDS stage 5."*

Required disclaimer, rendered on the caregiver dashboard, on the exported PDF, and on slide 1 of the deck:

> Xorai is not a diagnostic tool and does not diagnose, stage, or treat dementia. It provides cognitive engagement activities and shows changes in performance over time. Any concern about a person's memory or thinking should be discussed with a qualified doctor.

**Precedent to cite before a judge raises it:** in January 2016 the FTC settled with Lumos Labs over Lumosity's claims that its games could delay memory decline and protect against dementia — $2M in redress against a suspended $50M judgment, with an order requiring human clinical testing before any future cognition claim. We are deliberately refusing to make the claim they were fined for.

---

## 3. Users

### 3.1 Patient (primary, but never the account holder)

An adult aged roughly 65–90 in Assam, Meghalaya, Manipur, Mizoram, Nagaland, Tripura, Sikkim or Arunachal Pradesh, living with mild to moderate dementia, at home with family.

Assume: **no literacy**, no prior smartphone use, presbyopia, reduced contrast sensitivity, reduced fine motor control, possible tremor, hearing loss, and low tolerance for anything that feels like a test.

**The patient never authenticates.** They tap a large photo of themselves on a device already signed in by the caregiver. There is no email, no password, no OTP, no account recovery in the patient's path.

### 3.2 Caregiver (the account holder, and clinically the higher-value signal)

Usually an adult child or spouse, sometimes a daughter-in-law; may live in the same house or in another city. Owns the account, does all setup, receives all numbers.

Why the caregiver is a first-class user and not a stakeholder: **self-reported memory loss does not predict future dementia well; informant-reported memory loss does.** The caregiver's observation is a clinical instrument. Separately, computerised cognitive training shows materially better adherence when there is social involvement rather than solo home use — so the caregiver is also the retention mechanism.

### 3.3 ASHA worker / community health worker (secondary, v1.1)

Onboards families in rural districts where no family member is confident with a tablet. In v1 this is the same caregiver role with a different label; a dedicated multi-patient view is roadmap.

### 3.4 Clinician (out of scope for v1 — deliberately)

Receives a **printed or exported PDF** that the caregiver brings to an appointment. There is no doctor login, no clinician portal, no e-prescribing. Say this out loud in the pitch: a doctor portal nobody uses is worse than a PDF a family actually carries.

---

## 4. Surfaces

| Surface | Device | Notes |
|---|---|---|
| **Patient mode** | Android tablet 7–10", PWA installed to home screen, landscape | Locked, full-screen, no browser chrome, no navigation out |
| **Caregiver mode** | Same PWA on phone (reminders, quick check) and desktop (dashboard) | Responsive |

Phone-only for the patient is rejected: touch targets on a phone cannot reach the 16 mm that the elderly-touchscreen literature identifies as optimal without destroying layout.

**Deployment posture — decide this before Phase 6.** A PWA cannot fire a scheduled notification while the device is locked and the app is backgrounded; Notification Triggers never shipped to stable. The v1 answer is **kiosk mode**: the tablet lives in the patient's room, stays awake under a wake lock, and stays foregrounded in patient mode. That is the realistic deployment for a shared household tablet and it makes the reminder claim true. Do not promise locked-screen alarms.

---

## 5. Feature list

### 5.1 P0 — must exist for submission

**Onboarding (caregiver)**
1. Caregiver sign-up (email + password; phone OTP is a config flag, off by default — see architecture.md §Auth)
2. Patient profile: display name, birth year, **education level** (a documented confounder in Indian digital-clock data — must be captured), **home place** (district/town — the orientation warm-up needs it), preferred language, photo
3. Severity, framed as *"as told to you by a doctor"*
4. Family members: photo + name + **kinship term** + relationship + optional voice note
5. Music: caregiver uploads or records tracks from the patient's youth
6. Daily routine: medication times, meal times, sleep window
7. Emergency contacts
8. **DPDP guardian consent** with granular scope toggles and audit trail
9. Short informant questionnaire — IQCODE-*style*, never the instrument itself, on the same reasoning as the MMSE/MoCA ban. Repeated monthly.

**Daily session (patient) — 12–15 minutes**
1. Orientation warm-up (1 min) — day, date, season, place. Voice-led, errorless.
2. Familiar music cue (30 s) — the patient's own track.
3. Two games (4–5 min each), rotated. Never all four in one session.
4. Close (1 min) — a family photo with a spoken message, plus today's reminders.

**The four games** (full specs in `architecture.md §Games`):

| # | Name | Domain | Signature metric |
|---|---|---|---|
| 1 | **Aponjon** — Our Own People (face–name, spaced retrieval) | Episodic memory, language | Sustained retrieval interval per face |
| 2 | **Dhol Bator** — Rhythm Echo (tap-back rhythm span) | Working memory, attention, motor timing | Inter-tap interval variability (purest IIV) |
| 3 | **Xorai Milan** — Regional Memory Match | Complex attention, working memory | Revisit rate |
| 4 | **Ghorir Chobi** — Clock & Trace | Visuospatial, executive, perceptual-motor | Pre-first-stroke latency, time-in-air |

**Memory assistance layer** — the half of the PS title most teams skip:
- Medication and routine reminders with voice prompt in the patient's language
- Family contact cards: photo + kinship term + one-tap call
- SOS button → calls primary contact
- Always-available orientation card (today's day, date, place) — the reality-orientation board, digitised
- Personalised music player, triggerable standalone during agitation

**Telemetry & analysis**
- Per-interaction event capture (not per-session), buffered offline, synced on reconnect
- Personal baseline over first 7–10 sessions; nothing is analysed before that
- Rolling z-score vs personal baseline + EWMA smoothing
- Amber/red flags with non-diagnostic copy, suppressed on insufficient data, logged illness/medication change, or a low-effort signature
- Low-effort vs genuine-impairment discrimination → routes to an unscored **mood check-in** for the caregiver instead of a decline flag. Deliberately not called PHQ-2: that instrument is administered to the person, not to an informant about them, and §2 says we do not screen.

**Caregiver dashboard**
- Per-domain trend lines with the personal baseline band shaded
- Session compliance calendar
- Flags with plain-language copy
- **Clock trace replay, side by side across months**
- Sustained retrieval interval per family member ("holds Priya's name for 8 minutes, was 2 in July")
- Sync status ("last synced 2 days ago")
- Exportable PDF summary for a doctor's appointment

**Platform**
- Full offline operation: play, reminders, assistance all work with no network
- Voice for every instruction, in the patient's language, pre-generated, no runtime network call
- Languages v1: **Assamese, Bodo, Manipuri (Meitei), Nepali, Hindi, English.** Khasi and Mizo strings shipped, audio subject to Bhashini TTS availability.

### 5.2 P1 — build if Phase 8 finishes early

- Mann-Kendall trend test alongside z-score
- Time-of-day performance delta (sundowning view)
- Caregiver mobile push for missed sessions
- ASHA multi-patient list view

### 5.3 P2 — explicitly cut, and say why when asked

| Cut | Why (this is the answer, not an excuse) |
|---|---|
| Spatial navigation game (Sea Hero Quest analogue) | Best science of any candidate — spatial deficits can precede memory symptoms by years — but needs a game engine and real level design, and continuous directional control is the single hardest input for this population. Roadmap. |
| Facial emotion recognition (social cognition) | Hardest to build, weakest signal, most culturally loaded. Skipped deliberately; DSM-5 requires decline in only one of six domains, and the four games cover five — memory/learning, language, complex attention, perceptual-motor and executive. Social cognition is the only one absent. |
| Speech-based verbal fluency | Requires ASR in low-resource NER languages. Not reliable enough to demo honestly. |
| Wandering / GPS safety | Needs background location, permissions, and ideally hardware. Roadmap. |
| Trained ML model | The telemetry schema is designed so a model can be trained on it later. The data volume to train one does not exist yet. Saying this scores better than faking it. |
| Doctor portal | See §3.4. |
| Native Android app | PWA gives offline, one codebase, no store review, and installs to the home screen. **There is exactly one build.** Patient mode and caregiver mode are two design systems inside the same PWA — there is no separate mobile app and no separate website. Say this plainly; it is a strength, not an omission. |

---

## 6. Product principles

1. **It is never a test.** The word "score", the word "test", and any number are absent from the patient UI. Sessions are "today's practice".
2. **No game may ever display "wrong".** People with dementia largely do not learn from mistakes — implicit memory encodes the error itself. Feedback on *correct* responses is what transfers. On an incorrect tap: no red, no negative sound, no deduction. Fade the wrong option, gently light the right one, move on.
3. **Prevent the error before it happens.** If hesitation passes a threshold, dim the distractors so the answer becomes obvious. The user experiences success; the telemetry records that a hint was needed. **This makes hint rate, not accuracy, the true difficulty signal** — accuracy is inflated by design and we say so.
4. **Personalisation is the retention mechanism, not decoration.** A supervised 10-week serious-games study recruited 61 and completed 35 — ~43% attrition, in the best possible conditions. Solo home use is the worst-adherence configuration and it is exactly what we are building. Personalised, culturally familiar content is the documented lever, which is precisely why the NER localisation work is load-bearing.
5. **Every comparison is within-person.** No published norms exist for these games in these languages, and Indian digital-clock data shows strong education and age effects. Within-person comparison is what the clinical literature recommends anyway.
6. **Progress is shown as growth, never as a streak.** The patient sees a bamboo grove fill in. Streaks punish missed days and shame the caregiver.

---

## 7. Success metrics

**For the product**
- Primary: **session adherence** — sessions completed / sessions offered, over 4 weeks. Adherence is the hard problem in this space; making it the primary endpoint is the honest choice.
- Secondary: session completion rate (started vs finished), caregiver-reported utility, time-to-first-flag-acknowledged.
- Not a metric: improvement in game scores. Scores rising means difficulty is mis-calibrated, not that dementia improved.

**For the submission**
- Working hosted URL, public source repo, 3-minute demo video, Figma link — all four live on the idea slide
- Airplane-mode toggle demonstrated mid-session on video
- Clock trace replay, two months side by side, on video
- 60 days of seeded telemetry for three synthetic patients: one stable, one gradually declining, one with a sharp drop that resolves (illness confound, correctly suppressed)

---

## 8. Validation & deployment path (for the pitch)

**Pilot:** 20–30 patient–caregiver dyads over 12 weeks. Primary endpoint adherence, secondary endpoint caregiver-reported utility.

**Partners to name:** NEIGRIHMS Shillong, AIIMS Guwahati, LGBRIMH Tezpur, ARDSI regional chapters.

**Government hooks:** NPHCE (National Programme for Health Care of the Elderly) as the deployment channel · ABDM/ABHA consent-manager framework, which aligns with DPDP · **Bhashini**, already integrated · ASHA workers as the last-mile onboarding channel.

**Burden numbers:** dementia prevalence among Indians aged 60+ is 7.4% (LASI-DAD), roughly 8.8 million people. Earlier 10/66 estimates put rural prevalence (10.6%) above urban (7.5%) — directly relevant to NER. India's 60+ population exceeds 138 million. The framing: India's prevalence is comparable to the US and UK; the detection and support infrastructure is not. The gap is not prevalence, it is detection — which is exactly what a low-cost tablet tool addresses.

---

## 9. Legal

**DPDP Act 2023 + Rules 2025.** Where a data principal is a person with a disability unable to consent, consent must be obtained from their **lawful guardian**, and the fiduciary must obtain *verifiable* guardian consent. Consent under s.6 must be free, specific, informed, unconditional, unambiguous, given by clear affirmative action, and limited to what the stated purpose needs. Notices must be available in multiple languages; withdrawal must be as easy as giving.

Fourth Schedule exemptions from verifiable-consent cover clinical establishments, mental health establishments and registered practitioners. **We are not one of those**, so we implement guardian consent properly.

What ships (roughly 30 minutes of work, disproportionate payoff):
- Consent screen at onboarding, in the selected language, plain-language purpose statement per data category
- Separate toggles: gameplay data / photos / audio / analytics
- Guardian relationship field + attestation checkbox
- Timestamped consent record with audit trail and notice version
- Visible "withdraw consent and delete all data" button that actually works
- Data stored in-country (Supabase region: Mumbai / ap-south-1)
