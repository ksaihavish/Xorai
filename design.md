# Design — Xorai

Two design systems in one codebase. They share nothing but the palette.

| | Patient mode | Caregiver mode |
|---|---|---|
| Audience | 65–90, low vision, low literacy, possible tremor | 30–60, normal vision, wants density |
| Job | Feel like being cared for | Feel like a reliable instrument |
| Density | One thing per screen | As dense as clarity allows |
| Type floor | 24 px | 14 px |
| Motion | Only in direct response to a tap | One orchestrated reveal (clock replay) |

---

## 1. Where the look comes from

The *gamosa* — the white handwoven cotton cloth with a red border, given as a mark of respect across Assam, and its cousins in Bodo, Mizo and Naga weaving. It is the most everyday object of respect in the region, which is exactly the register the product wants: not clinical, not childish, not a game console.

Two things are taken from it literally:

1. **A woven border frames every patient screen.** Not decoration — it is the session progress indicator. It begins madder red and fills with brass as the session advances. The patient never sees a percentage, a bar, or a number, but they can see how much is left. One structural device, two jobs.
2. **The white is cloth-white, not paper-white.** Warm, slightly yellowed, the colour of cotton that has been washed many times.

The second source is the **xorai**, the brass offering bowl the product is named for. Brass is the accent and the reward colour. Nothing else is brass.

**Rejected on purpose:** the cream-plus-terracotta palette, the dark-mode-plus-neon look, and anything that reads as "medical app" (cool blue-grey, thin sans, pill badges). Blue and violet are additionally *forbidden as distinguishing hues* in patient mode on clinical grounds — the ageing lens yellows and shifts blue perception, so two colours a designer can tell apart may be indistinguishable to a 78-year-old.

---

## 2. Colour

```css
/* src/styles/tokens.css */
:root {
  /* ground */
  --paper:        #FDFAF3;   /* gamosa cotton, warm white */
  --paper-sunk:   #F4EEE2;   /* recessed surfaces, card wells */

  /* structure */
  --madder:       #B3342B;   /* the gamosa border red */
  --madder-deep:  #8C2620;   /* pressed state, borders on madder fills */

  /* accent + reward */
  --brass:        #C08A2E;   /* xorai. the ONLY reward colour. */
  --brass-soft:   #E8D3A4;   /* fills, glows, filled progress */

  /* affirmation */
  --tea:          #2E4632;   /* tea-garden green. correct, complete, safe. */
  --tea-soft:     #CFDCCB;

  /* text */
  --ink:          #2A211A;   /* lac-black, warm. body text. ~14:1 on paper. */
  --clay:         #5E5142;   /* secondary text. 7.4:1 on paper, MEASURED.
                               The old #6B5B49 measured 6.26:1 and failed the
                               AAA law this file sets. */
  --focus:        #8A241C;   /* focus rings. 8.35:1. Brass measured 2.91:1 and
                               missed even the 3:1 non-text minimum. */
}
```

**Contrast law.** WCAG AAA (**7:1**), not AA — presbyopia and lens yellowing reduce contrast sensitivity, and near-point focus shifts from about 10 cm at age 20 to about 100 cm at 70.

Measured, not estimated: ink/paper **15.14:1**, clay/paper **7.4:1**, tea/paper **9.88:1**, madder/paper **5.85:1** (fill only), ink on brass-soft **10.73:1**.

- `--ink` on `--paper` → text. Always.
- `--clay` on `--paper` → secondary text only. Never for anything the patient must read to act.
- `--madder` **never carries body text on paper** — it measures ~6.2:1. It is a fill and a border colour. White text on a madder fill is fine.
- `--tea` on `--paper` → passes; usable for confirmation text.

**Semantic assignment — fixed, do not improvise:**

| Meaning | Colour |
|---|---|
| Frame, structure, session border | madder |
| Correct / complete / safe | tea |
| Reward, progress earned, the growing grove | brass |
| Interactive surface at rest | paper on a 3 px ink border |
| Interactive surface pressed | brass-soft fill |
| **Incorrect** | *has no colour.* See §6. |

### 2.1 Caregiver palette

```css
[data-mode="caregiver"] {
  --paper:      #F8F8F6;
  --paper-sunk: #FFFFFF;
  --ink:        #1E2A24;
  --clay:       #5F6B63;
  --rule:       #DFE2DD;      /* hairline dividers */
  --signal:     #35576B;      /* system/sync state — cool, and allowed here */
  /* charts reuse madder / brass / tea so the two modes read as one product */
}
```

Chart series order: `--tea` → `--brass` → `--madder` → `--clay`. The baseline band is `--brass-soft` at 40% opacity. Amber flag = `--brass`; red flag = `--madder`. Never a traffic-light green/amber/red — this product does not say "good" or "bad" about a person.

---

## 3. Type

**Noto Sans.** This is a constraint, not a preference: it is the only family with coherent, matched coverage of Latin, Bengali-Assamese, Devanagari and Meetei Mayek. Load only the subsets the selected language needs — shipping four scripts to every device blows the precache budget.

Caregiver mode adds **Inter** for numerals and dense UI, with `font-variant-numeric: tabular-nums` on every chart axis and table (misaligned digits in a trend table is the fastest way to look amateur).

**No italics anywhere.** Indic script italics are synthesised and look broken.

### Patient scale (base 24 px)

| Role | Size | Weight | Line height | Use |
|---|---|---|---|---|
| Prompt | 40 px | 600 | 1.35 | The instruction. One per screen. |
| Prompt large | 56 px | 600 | 1.25 | Orientation answers, the single word on a card |
| Body | 24 px | 400 | 1.55 | Everything else |
| Name label | 32 px | 600 | 1.3 | A person's name, a card caption |
| Button | 28 px | 600 | 1.2 | — |

Instructions: present tense, active voice, **≤ 12 words**, sentence case. Every instruction is spoken automatically on screen entry, with a persistent replay button. Literacy is not assumable.

### Caregiver scale

`12 / 14 / 16 / 20 / 28 / 40`, base 16 px, line height 1.5. Line length ≤ 72 characters.

---

## 4. Layout

### Patient

```
┌════════════════════════════════════════════┐  ← woven border, madder→brass
║                                            ║     as the session advances
║                                            ║
║              [ the one thing ]             ║
║                                            ║
║                                            ║
║   ┌──────────┐  ┌──────────┐        [▶ again]  ← replay,
║   │  option  │  │  option  │                    icon+word,
║   └──────────┘  └──────────┘               ║     top-right, every screen
║                                            ║
└════════════════════════════════════════════┘
      ⌐ press & hold 3s to exit (bottom-left, invisible)
```

- **Landscape, locked.** One column, centred, `max-width: 900px`.
- **Maximum two actions per screen.** Not a guideline.
- **Touch target: 60 px minimum, 72 px preferred**, which is ~16 mm on a typical tablet — the size at which elderly users performed best in a 220-participant touchscreen study (110 aged 65+). Apple's 44 pt is the absolute floor, not the target.
- **Minimum 24 px between targets.** Reduced dexterity causes mis-taps on close controls.
- **Primary action goes upper or right**, not bottom. The same study found elderly users performed best with buttons in upper and right positions. This contradicts mobile convention; follow the research, not the convention.
- Navigation is identical on every screen: one persistent Home, always in the same place.
- The replay-audio control carries the **icon and the word** for "listen again" in the active language. It is not exempt from the icon-plus-word rule in §5 — it is the control that most needs to obey it.
- **No timeouts that lose progress. Ever.**

### Caregiver

12-column grid, 24 px gutter, `max-width: 1280px`. Sections separated by 1 px `--rule` hairlines, not by cards — the SaaS-card grid is the default look and this is a clinical instrument. The **only** carded element is a flag, because a flag genuinely is a discrete object that gets acknowledged and dismissed.

---

## 5. Components

### Button (patient)

```
rest     paper fill · 3px solid --ink border · radius 16px · 72px tall · 32px padding-x
pressed  --brass-soft fill · border --brass-deep · translateY(2px)
focus    4px --focus outline, offset 2px  (brass fails 3:1 and is reward-only)
```

Every interactive element has a **visible border and a fill**. No ghost buttons, no flat text buttons, no icon-only buttons. Users under cognitive strain cannot distinguish interactive from non-interactive elements and may not know modern affordance conventions at all.

Every button that is not self-evident carries an icon *and* a word. Icons alone are learned conventions; do not assume them.

### Card (patient — a face, a match tile, a contact)

Photo at 4:3 or 1:1, 2 px `--clay` border, radius 20 px, caption 32 px/600 beneath. Minimum 240 px wide. Pressed state: 3 px `--brass` border, no scale transform (scale makes a tremoring finger lose the target).

### Gestures

**Tap only.** No swipe, no pinch, no long-press, no multi-touch, no drag anywhere in the patient UI. Gesture complexity is a documented failure point for older adults.

The single exception is the exit control — press-and-hold for 3 seconds in a fixed corner, unlabelled. It sits deliberately outside the patient contract because it is not for the patient.

---

## 6. The errorless UI contract

This is a design rule with a clinical basis and it overrides every other consideration in this file.

**No patient-facing surface may ever indicate that the patient was wrong.**

| Banned | Replacement |
|---|---|
| Red, X marks, buzzers, shake animations | Nothing. Silence. |
| A score, a percentage, a streak, a leaderboard | A bamboo grove that grows |
| "Wrong", "Try again", "Incorrect", "Oops" | No message at all |
| A wrong answer staying on screen | It fades to 30% opacity over 400 ms |
| Any error state, toast, or alert | See below |

On an incorrect tap: the chosen option fades to 30%, the correct option gains a soft `--brass-soft` glow, the correct answer is spoken, and the game advances. No sound of failure exists in the audio bundle.

**Prevent the error before it happens.** When hesitation passes the game's threshold, dim the distractors so the answer becomes obvious. The patient experiences success; the telemetry records `hints_used += 1`. This is why hint rate, not accuracy, is the difficulty signal — and it is why accuracy in this product is inflated by design, which we state openly rather than hide.

**Error states do not exist in patient mode**, including technical ones. Network failure, storage failure, audio failure: the patient sees the session continue. Everything is queued locally and surfaced to the caregiver. A patient who sees an error dialog will believe they broke it.

Caregiver mode has normal error states, and they follow normal rules: say what happened and how to fix it, never apologise, never be vague.

---

## 7. Motion

**Patient mode: motion only in direct response to the patient's own action.** No entrance animations, no ambient movement, no parallax, no loading spinners with personality. Distraction and confusion are the documented failure modes. Card flip 250 ms, press feedback 120 ms, fade-out 400 ms. That is the complete list.

**Caregiver mode:** one orchestrated moment, and it is the **clock trace replay** — the stroke path drawing itself at recorded speed, with the pauses preserved. The hesitation is the finding; showing it in real time is the most persuasive thing in the product. Everything else in caregiver mode is static.

`prefers-reduced-motion: reduce` disables the replay animation and shows the final trace with pause durations annotated instead.

---

## 8. The growth metaphor

The patient's only feedback across sessions is a **bamboo grove** on the close screen: one new culm per completed session, growing taller and denser over weeks. It is regionally correct, it is a real cultural object across the whole NER, and it has the right property — it grows and it does not shrink.

**It never decreases and it never resets.** A missed day adds nothing; it takes nothing away. Streaks are forbidden: a streak punishes illness and shames the caregiver, and the caregiver is the person we most need to keep.

---

## 9. Voice

Every instruction is spoken automatically on screen entry, in the patient's language, from a pre-generated file. A persistent replay button sits top-right on every patient screen, in the same position, always.

Family voice notes — a grandchild recording "Aita, it's time for your medicine" — take priority over synthesised speech everywhere they exist. It is better clinically and better emotionally, and it removes the last runtime TTS dependency.

Pace: pre-generated audio should be rendered slightly slower than default TTS speed. Leave 800 ms of silence at the head of every file so the first word is not clipped by playback start.

---

## 10. Quality floor

Keyboard focus visible everywhere (4 px `--focus` outline). Reduced motion respected. Every image has alt text in the active language. Caregiver mode responsive to 375 px. **Patient mode is designed at 1024 × 600** — a 7" tablet in landscape, which is the tightest real target — and says so if launched smaller. Height is the binding constraint, not width: a 40 px prompt, 72 px buttons, 240 px cards and 24 px gaps leave very little room, so the woven border thickness is responsive rather than fixed. Colour is never the only carrier of meaning — every state also has a shape, a border weight, or a word.


---

# Part II — The North East layer

Everything in Part I still wins. This adds the regional imagery you asked for, in a way that survives the contrast law, the no-blue-distinction rule and the errorless contract.

---

## The rule that governs all of it

**A motif earns its place by doing a job.** Decoration that only decorates is the thing that makes an app for 78-year-olds feel like an app for children. Every element below either carries state, carries meaning, or is the reward itself.

The gamosa border already works this way — it is the session progress indicator, not a frame. Everything here follows that pattern.

---

## 1. Where each motif lives

| Motif | Where | Job it does |
|---|---|---|
| **Gamosa weave** (diamond band) | Border of every patient screen | Session progress — fills madder → brass |
| **Bamboo grove** | Close screen | Cross-session growth. Already specified in `design.md §8` |
| **Xorai** (brass bowl) | Reward moment, once per completed game | The single celebratory object. Nothing else is brass |
| **Japi** (bamboo sunhat) | Ghorir Chobi trace variant, severe tier | The shape being traced — a cone and two arcs, easy under tremor |
| **Dhol** | Dhol Bator drum head | The tap target itself, 400 px minimum |
| **Gogona / pepa** | Dhol Bator timbre variants at higher spans | Distinguishes levels by *sound*, not by colour |
| **One-horned rhino** | Xorai Milan deck, Kaziranga caption | A card and a reminiscence prompt |
| **Hoolock gibbon, hornbill, orchid, tea leaf** | Xorai Milan deck, 40% "recognition" half | Cards and captions |
| **Hurricane lantern, transistor radio, brass utensils, treadle sewing machine, dheki, jaapi** | Xorai Milan deck, 60% "their memory" half | The core of the deck. Remote memory outlives recent memory |
| **Living-root bridge arch, Naga shawl border** | Ghorir Chobi trace variants | Alternate trace shapes for repeat sessions |
| **Bihu dhol patterns** | Dhol Bator rhythms | The rhythmic material itself |

---

## 2. Making it lively without breaking the law

The instinct with "more lively" is more colour and more motion. Both are banned here for clinical reasons. Liveliness has to come from somewhere else. Three levers:

### Texture, not colour
The gamosa is *woven*. A flat red border is a rectangle; a border with visible warp lines and diamond figures is cloth. Render the border as an SVG pattern — vertical warp threads at 2 px, `--ring` at 40% opacity, with diamond figures in `--madder` and `--brass` on a 48 px repeat. Same colours, same contrast, dramatically more presence. This is the single highest-return change in this document.

### Silhouette, not illustration
Every regional object renders as a **single-weight line drawing**, 5 px stroke, one colour, no fill, no shading, no gradient. This is what makes a rhino and a hurricane lantern feel like they belong in the same product. It also keeps each asset under 8 KB and legible to a low-contrast-sensitivity eye at 240 px.

Detailed photographs are correct for the Xorai Milan **deck** (recognition needs realism). Line art is correct for everything structural: borders, buttons, the grove, the reward, trace shapes.

### One thing moves, and only when touched
`design.md §7` stands. The liveliness budget is spent on the reward: on a completed game, the xorai bowl draws itself in brass over 600 ms and the grove gains one culm. That is the whole animation inventory in patient mode, and because it is the only motion, it lands.

---

## 3. Colour — two changes to the existing tokens

Keep the palette. Two corrections, both from the audit:

```css
--clay:  #5E5142;   /* was #6B5B49 — measured 6.26:1, failed the stated 7:1 */
--focus: #8A241C;   /* focus rings move off --brass (2.91:1) to madder-deep (8.35:1) */
```

`--brass` stays exactly as it is for reward fills, where dark text sits on `--brass-soft` at 10.7:1.

Two additions, for the regional layer only:

```css
--indigo:   #2E3A5C;   /* Manipuri / Naga textile indigo. STRUCTURE ONLY. */
--terracotta: #9C5A3C; /* Assam pottery. Deck card backgrounds. */
```

**`--indigo` may never distinguish two options from each other in patient mode.** The ageing lens yellows and shifts blue perception; two blues a designer separates easily may be identical to a 78-year-old. It is allowed as a single structural ground — a card well, a header field — where nothing depends on telling it apart from anything else. Written as a rule so nobody uses it for a correct/incorrect pair six weeks from now.

---

## 4. Per-game treatment

**Aponjon.** Photographs of real family members, on a `--paper-sunk` well with a 2 px `--clay` frame and a subtle woven corner mark. The kinship term appears *below* the name in `--madder`, at 28 px, because that word is the culturally loaded one and the one the voice speaks.

**Dhol Bator.** A large line-drawn dhol head, centred, 400 px. On the model rhythm, the lacing lines pulse in `--brass-soft` on each beat — motion driven by the audio clock, so it doubles as a visual metronome for a hard-of-hearing patient. On tap, a brass ring expands from the touch point and fades in 250 ms. No colour anywhere indicates right or wrong; the correction is the dhol replaying the pattern with the tap points glowing.

**Xorai Milan.** Card backs carry the gamosa diamond in `--brass-soft` on `--terracotta`. Card fronts are photographs. A matched pair does not vanish — it stays face-up and gains a thin brass frame, so the board fills up with what has been found rather than emptying out. That inversion matters: an emptying board is a record of what is gone.

**Ghorir Chobi.** The canvas is cloth-white with a faint warp texture, and the drawn stroke renders in `--ink` at 6 px with a slight taper. For the severe trace variant, the target shape is a japi outline in `--brass-soft` at 3 px — visible enough to follow, faint enough that the patient's own line is clearly theirs.

**Orientation.** The season question uses four line drawings — Bihu (spring), monsoon, harvest, winter — rather than words. It is the one orientation question that does not depend on literacy at all.

**Close screen.** Bamboo grove in `--tea` line art on `--paper`, one culm per session, growing taller and denser. Above it, the xorai bowl in brass. Below it, one line: the patient's name and today's family photo.

---

## 5. Assets — what this actually costs

| Asset | Count | Form |
|---|---|---|
| Structural line art (gamosa pattern, xorai, bamboo culms, dhol, japi, root-bridge arch, Naga border, four season marks) | ~14 | Inline SVG in the repo, single stroke, tokenized colour |
| Xorai Milan photographic deck | 150+ | WebP, square, ≤120 KB, `licence` and `source_url` mandatory |
| Patient-mode icons (replay, home, call, SOS) | ~6 | Inline SVG, 3 px stroke, always paired with a word |

The line art is a day's work for one person and it is what makes the product look like it comes from somewhere. The photographic deck is the long pole and it is already owner 1's job in `memory.md`.

**Sourcing, unchanged:** Wikimedia Commons (CC-BY / CC-BY-SA), Government of India tourism assets, or team-photographed originals. No scraping. `licence` and `source_url` are `NOT NULL` for exactly one reason — "where did these images come from" is a real question and one column answers it.

---

## 6. What this deliberately does not do

- No mascot, no character, no face that talks to the patient. A friendly animated guide is the fastest way to make an adult feel condescended to.
- No festival-themed seasonal skins. The interface must be identical every single day; novelty is a cost, not a feature, for someone relying on procedural familiarity.
- No sound design beyond the dhol samples, the spoken prompts and the family voice notes. There is no success chime, because a success chime implies a failure chime, and no sound of failure exists in the audio bundle.
