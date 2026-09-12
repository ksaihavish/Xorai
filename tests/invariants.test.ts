import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * rules.md §2, enforced. This file is the single gate for every invariant in
 * that section — the ones that cannot be checked by types, only by reading the
 * repository back.
 *
 * ─── Why these live in ONE file ───
 *
 * They were previously spread across banned-strings.test.ts and clock.test.ts,
 * which meant two places to look and two places to forget. Worse, it hid a
 * defect: the banned-clinical-string check had been passing vacuously since it
 * was written, because `` `\b${word}\b` `` in a template literal is the
 * BACKSPACE character U+0008, not a word boundary. The regex was
 * `[BS]diagnosis[BS]`, which matches nothing. Verified before rewriting it: a
 * string reading "This gives you an MMSE diagnosis and a risk score" passed all
 * five assertions.
 *
 * Escaping is now asserted directly, below, so the gate cannot go quiet again.
 */

// process.cwd(), not import.meta.url: under jsdom import.meta is served over
// http and fileURLToPath rejects it. Vitest runs from the repo root, and the
// file-count assertions below fail loudly if that ever stops being true.
const REPO_ROOT = process.cwd()

function walk(dir: string, match = /\.(ts|tsx)$/): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }

  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full, match))
    else if (match.test(entry)) out.push(full)
  }
  return out
}

/** Repo-relative, forward slashes, so allowlists read the same on any OS. */
function repoPath(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join('/')
}

/**
 * Comments are stripped before every source scan.
 *
 * The header of clock.ts explains the Date.now() rule at length and names the
 * call; the header of this file does too. A scan that could not tell an
 * explanation from a call would force the explanation to be deleted, which is
 * exactly backwards — the explanation is the part that stops the rule being
 * broken by someone who never read it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Word-boundary matcher. Note the DOUBLE backslash; see the header. */
function wordRe(word: string): RegExp {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
}

// ─── 0. the matcher itself ────────────────────────────────────

describe('the string matcher these checks depend on', () => {
  /**
   * Asserted first, because every check below is only as real as this.
   *
   * A silently-broken matcher is worse than no check at all: it reports green
   * and nobody looks again. This is the regression test for the defect
   * described in the header.
   */
  it('is a word boundary, not a backspace character', () => {
    expect(wordRe('diagnosis').source.charCodeAt(0)).toBe(92) // a real backslash
    expect(wordRe('diagnosis').test('gives you a diagnosis today')).toBe(true)
  })

  it('matches on whole words only, so "staging" and "staged" survive', () => {
    expect(wordRe('stage').test('the stage of the illness')).toBe(true)
    expect(wordRe('stage').test('staging the rollout')).toBe(false)
    expect(wordRe('stage').test('staged the release')).toBe(false)
  })
})

// ─── 1. Date.now() in the telemetry path ──────────────────────

/**
 * The allowlist, printed by the test below so it can be reviewed rather than
 * trusted.
 *
 * Every `*_ms` telemetry field is an offset from one `performance.now()` origin
 * taken at session start. Wall clock is not monotonic — NTP steps it, the user
 * changes it, the device sleeps — so a reaction time computed from it is not a
 * reaction time. The variability metric is the clinical claim; if it is built on
 * a clock that can jump backwards, nothing downstream means anything.
 *
 * Adding an entry here is a decision, not a fix. The question to answer first is
 * whether the value being computed is a `*_ms` telemetry field. If it is, the
 * answer is no.
 */
const DATE_NOW_ALLOWLIST: { file: string; why: string }[] = [
  {
    file: 'src/core/telemetry/clock.ts',
    why: 'sessions.started_at — the one permitted wall-clock read in the product.',
  },
  {
    file: 'src/patient/assist/reminders.ts',
    why:
      'Reminder scheduling. "Nine in the morning" is a statement about the world, not about a ' +
      'session, so it cannot live on performance.now(). Nothing here feeds a *_ms telemetry ' +
      'field — reminder_logs stores timestamptz, which is what a calendar event needs ' +
      '(architecture.md §6 permits exactly this distinction). The whole assistance layer routes ' +
      'its wall-clock needs through msUntil/minutesFromNow here, so the allowlist names one ' +
      'file rather than every component with a countdown.',
  },
]

const TIMING_DIRS = ['src/core/telemetry', 'src/patient']

describe('rules.md §2 — Date.now() is banned in the telemetry path', () => {
  it('appears only in the allowlist, which is printed here for review', () => {
    const allowed = new Set(DATE_NOW_ALLOWLIST.map((e) => e.file))
    const offenders: string[] = []
    let scanned = 0

    for (const dir of TIMING_DIRS) {
      for (const file of walk(join(REPO_ROOT, dir))) {
        scanned += 1
        const path = repoPath(file)
        if (stripComments(readFileSync(file, 'utf8')).includes('Date.now()') && !allowed.has(path)) {
          offenders.push(path)
        }
      }
    }

    // Printed every run, passing or failing. An allowlist nobody reads is an
    // allowlist that grows.
    console.info(
      [
        '',
        `Date.now() scan: ${scanned} files under ${TIMING_DIRS.join(', ')}`,
        'Allowlist:',
        ...DATE_NOW_ALLOWLIST.map((e) => `  - ${e.file}\n      ${e.why}`),
        '',
      ].join('\n'),
    )

    expect(scanned).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('the allowlisted files really do still contain the call they are listed for', () => {
    // Otherwise the allowlist silently becomes a list of files that used to
    // matter, and the next real violation is waved through by an entry that
    // stopped meaning anything.
    for (const entry of DATE_NOW_ALLOWLIST) {
      const source = readFileSync(join(REPO_ROOT, entry.file), 'utf8')
      expect(source, `${entry.file} is allowlisted but no longer calls Date.now()`).toContain(
        'Date.now()',
      )
    }
  })

  it('the scan would actually catch a violation', () => {
    // The same proof obligation as the matcher test: a scanner that cannot fail
    // is not a scanner. Run the real predicate over a synthetic file.
    const violating = stripComments('const t = Date.now()\n')
    const commentOnly = stripComments('// never call Date.now() here\n')
    expect(violating.includes('Date.now()')).toBe(true)
    expect(commentOnly.includes('Date.now()')).toBe(false)
  })
})

// ─── 2. banned clinical strings ───────────────────────────────

/**
 * rules.md §2, Data & language.
 *
 * MMSE is copyrighted and MoCA requires certification; this product neither
 * reproduces them nor claims equivalence. The rest are claims it does not make —
 * prd.md §2 is explicit that we do not diagnose, do not stage, do not screen,
 * and that every comparison is within-person by design.
 */
const BANNED = [
  'diagnosis',
  'diagnose',
  'decline detected',
  'condition worsening',
  'stage',
  'screening result',
  'risk score',
  'MMSE',
  'MoCA',
]

/**
 * THE ONE EXEMPTION, and it is deliberate.
 *
 * prd.md §2 requires a disclaimer word for word, on the dashboard and on the
 * exported PDF, and that sentence contains "diagnose" and "stage" — because it
 * DENIES them: "is not a diagnostic tool and does not diagnose, stage, or treat
 * dementia."
 *
 * A word-boundary match cannot tell a denial from a claim. The ban exists so the
 * product never claims those things; exempting the sentence that disclaims them
 * serves the rule rather than bending it.
 *
 * The exemption is ONE key. A second is a decision to be argued for, not a
 * convenience — which is why the count is asserted.
 */
const EXEMPT_I18N_KEYS = ['legal.disclaimer']

/**
 * Source files that discuss the ban rather than violate it.
 *
 * The test files naming the banned words, and the disclaimer component that
 * renders the mandated sentence. Both are read by the same scan that reads
 * product copy, and neither is making a clinical claim.
 */
const BANNED_STRING_FILE_EXEMPTIONS = ['tests/invariants.test.ts']

function flatJson(path: string): Record<string, string> {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const out: Record<string, string> = {}
  const visit = (node: unknown, prefix: string) => {
    if (typeof node === 'string') {
      out[prefix] = node
      return
    }
    if (node && typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        visit(value, prefix ? `${prefix}.${key}` : key)
      }
    }
  }
  visit(raw, '')
  return out
}

const PATIENT_KEY_PREFIXES = [
  'patient.',
  'orientation.',
  'aponjon.',
  'deck.',
  'milan.',
  'ghorir.',
  'assist.',
  'session.',
  'kin.',
]

const isPatientKey = (key: string) => PATIENT_KEY_PREFIXES.some((p) => key.startsWith(p))

describe('rules.md §2 — banned clinical strings', () => {
  const langFiles = readdirSync(join(REPO_ROOT, 'i18n')).filter((f) => f.endsWith('.json'))

  it('appear in no i18n string, in any language, except the exempt disclaimer', () => {
    const offenders: string[] = []

    for (const file of langFiles) {
      const bundle = flatJson(join(REPO_ROOT, 'i18n', file))
      for (const [key, value] of Object.entries(bundle)) {
        if (EXEMPT_I18N_KEYS.includes(key)) continue
        for (const word of BANNED) {
          if (wordRe(word).test(value)) offenders.push(`${file} ${key}: ${word}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('appear in no PATIENT-mode key, exemption or not', () => {
    // The patient never sees the disclaimer either — it is a caregiver artefact,
    // so the exemption does not reach into patient mode at all.
    const offenders: string[] = []

    for (const file of langFiles) {
      const bundle = flatJson(join(REPO_ROOT, 'i18n', file))
      for (const [key, value] of Object.entries(bundle)) {
        if (!isPatientKey(key)) continue
        for (const word of BANNED) {
          if (wordRe(word).test(value)) offenders.push(`${file} ${key}: ${word}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('appear in no source file under src/', () => {
    /**
     * Copy does not only live in i18n. A hard-coded English label, a chart axis,
     * an aria-label or a console warning is just as visible, and the i18n scan
     * would never see it.
     *
     * Comments are stripped: architecture.md is discussed in prose throughout
     * the codebase, and that prose is the reason the rule survives.
     */
    const exempt = new Set(BANNED_STRING_FILE_EXEMPTIONS)
    const offenders: string[] = []
    let scanned = 0

    for (const file of walk(join(REPO_ROOT, 'src'))) {
      const path = repoPath(file)
      if (exempt.has(path)) continue
      scanned += 1
      const code = stripComments(readFileSync(file, 'utf8'))
      for (const word of BANNED) {
        if (wordRe(word).test(code)) offenders.push(`${path}: ${word}`)
      }
    }

    expect(scanned).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('has exactly one i18n exemption, and it is the mandated disclaimer', () => {
    expect(EXEMPT_I18N_KEYS).toHaveLength(1)

    const disclaimer = flatJson(join(REPO_ROOT, 'i18n', 'en.json'))['legal.disclaimer'] ?? ''
    // If the sentence ever stops being a denial, the exemption stops being valid.
    expect(disclaimer).toMatch(/is not a diagnostic tool/i)
    expect(disclaimer).toMatch(/does not diagnose, stage, or treat/i)
  })
})

// ─── 3. the errorless contract, on the strings themselves ─────

describe('rules.md §2 — the errorless UI contract', () => {
  const langFiles = readdirSync(join(REPO_ROOT, 'i18n')).filter((f) => f.endsWith('.json'))

  /**
   * design.md §6: no patient surface may ever indicate the patient was wrong.
   *
   * Not in a message, not in a label, and not in a word tucked inside a longer
   * sentence. Someone with dementia who is told they failed does not learn from
   * it — they learn that the tablet is a place where they fail, and they stop
   * picking it up. A product they will not touch measures nothing.
   */
  it('no patient-facing string, in any language, says the patient was wrong', () => {
    const forbidden = ['wrong', 'incorrect', 'try again', 'failed', 'error']
    const offenders: string[] = []

    for (const file of langFiles) {
      const bundle = flatJson(join(REPO_ROOT, 'i18n', file))
      for (const [key, value] of Object.entries(bundle)) {
        if (!isPatientKey(key)) continue
        for (const word of forbidden) {
          if (wordRe(word).test(value)) offenders.push(`${file} ${key}: ${word}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('no patient-facing string carries a score, streak or percentage', () => {
    // design.md §6 bans all three outright: they turn a memory aid into a test
    // with a mark at the end.
    const offenders: string[] = []

    for (const file of langFiles) {
      const bundle = flatJson(join(REPO_ROOT, 'i18n', file))
      for (const [key, value] of Object.entries(bundle)) {
        if (!isPatientKey(key)) continue
        if (/\b(score|streak|percent|leaderboard)\b/i.test(value) || value.includes('%')) {
          offenders.push(`${file} ${key}: ${value}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

// ─── 4. media licensing ───────────────────────────────────────

describe('rules.md §2 — every media asset is attributed', () => {
  /**
   * The schema is the enforcement, and that is the point of asserting it here.
   *
   * A test that reads rows from a database only checks the rows that happen to
   * exist today; a NOT NULL constraint makes an unattributed asset impossible to
   * insert at all. This asserts the constraint is still in the migration, so it
   * cannot be quietly relaxed to unblock an import script.
   *
   * It matters because the photographic deck is the one part of this product
   * built from other people's work, and shipping an image whose licence nobody
   * recorded is the kind of thing that gets a project pulled rather than
   * corrected.
   */
  it('media_assets.licence and source_url are NOT NULL in the schema', () => {
    const sql = readFileSync(join(REPO_ROOT, 'supabase/migrations/0001_init.sql'), 'utf8')
    const table = sql.slice(sql.indexOf('create table public.media_assets'))
    const body = table.slice(0, table.indexOf(');'))

    expect(body).toMatch(/licence\s+text\s+not null/i)
    expect(body).toMatch(/source_url\s+text\s+not null/i)
  })

  it('the asset-pack builder refuses a row missing either field', () => {
    // The constraint stops a bad row reaching the database; this stops a bad row
    // being built in the first place, with an error a human can act on.
    const builder = readFileSync(join(REPO_ROOT, 'scripts/build-asset-pack.ts'), 'utf8')
    expect(builder).toContain('licence')
    expect(builder).toContain('source_url')
  })
})

// ─── 5. the patient / caregiver boundary ──────────────────────

describe('rules.md §2 — patient and caregiver code never import each other', () => {
  /**
   * The two modes share `src/core/**` and `src/ui/**` and nothing else.
   *
   * The boundary is not tidiness. Patient mode is the locked surface: it must
   * not be able to reach a route that leaves it, read a caregiver query, or pull
   * in a dependency that was never designed against the patient contract. An
   * import is how all three would happen.
   *
   * eslint enforces this too (no-restricted-imports, error not warning). It is
   * asserted here as well because lint is a separate command that a hurried
   * person can skip, and `npm test` is the one that runs in CI.
   */
  const importRe = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g

  function importsOf(file: string): string[] {
    const out: string[] = []
    const code = stripComments(readFileSync(file, 'utf8'))
    let m: RegExpExecArray | null
    while ((m = importRe.exec(code)) !== null) if (m[1]) out.push(m[1])
    importRe.lastIndex = 0
    return out
  }

  it('no file in src/patient/ imports from caregiver code', () => {
    const offenders: string[] = []
    let scanned = 0

    for (const file of walk(join(REPO_ROOT, 'src/patient'))) {
      scanned += 1
      for (const spec of importsOf(file)) {
        if (/(^@\/caregiver)|(\/caregiver\/)/.test(spec)) offenders.push(`${repoPath(file)} → ${spec}`)
      }
    }

    expect(scanned).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('no file in src/caregiver/ imports from patient code', () => {
    const offenders: string[] = []
    let scanned = 0

    for (const file of walk(join(REPO_ROOT, 'src/caregiver'))) {
      scanned += 1
      for (const spec of importsOf(file)) {
        if (/(^@\/patient)|(\/patient\/)/.test(spec)) offenders.push(`${repoPath(file)} → ${spec}`)
      }
    }

    expect(scanned).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('patient mode pulls in no icon or animation library', () => {
    /**
     * lucide-react is caregiver-only and framer-motion is banned outright in
     * patient mode.
     *
     * Patient icons are hand-drawn inline SVG so they carry the same 3px stroke
     * as everything else at the sizes this audience needs; a library icon set at
     * 1.5px reads as a smudge. Ambient motion is banned because movement the
     * patient did not cause is indistinguishable from movement they did, and a
     * surface that seems to act on its own is frightening rather than lively.
     */
    const banned = ['lucide-react', 'framer-motion']
    const offenders: string[] = []

    for (const file of walk(join(REPO_ROOT, 'src/patient'))) {
      for (const spec of importsOf(file)) {
        if (banned.some((b) => spec === b || spec.startsWith(`${b}/`))) {
          offenders.push(`${repoPath(file)} → ${spec}`)
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('eslint still enforces the same boundary, in both directions', () => {
    // If this file and the lint config ever disagree, one of them is stale and
    // the boundary is only half guarded.
    const config = readFileSync(join(REPO_ROOT, 'eslint.config.js'), 'utf8')
    expect(config).toContain("files: ['src/patient/**/*.{ts,tsx}']")
    expect(config).toContain("files: ['src/caregiver/**/*.{ts,tsx}']")
    expect(config).toContain("'no-restricted-imports': ['error'")
    expect(config).toContain('lucide-react')
  })
})
