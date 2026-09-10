import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createSessionClock } from '@/core/telemetry/clock'

/**
 * The clock is the thing the clinical claim rests on. rules.md 5 / phases.md
 * Phase 4: this suite is green or the reaction-time variability metric is not
 * trustworthy, and everything downstream of it is decoration.
 */

// process.cwd(), not import.meta.url: under the jsdom environment import.meta
// is served over http and fileURLToPath rejects it. Vitest runs from the repo
// root, and the assertion below fails loudly if that ever stops being true.
const REPO_ROOT = process.cwd()

/**
 * The allowlist, printed by the test below so it can be reviewed rather than
 * trusted.
 *
 * There is exactly one legitimate `Date.now()` in the telemetry path, and it is
 * the one that produces `sessions.started_at` — the single wall-clock value in
 * the whole schema. Anything else appearing here is a regression, and the reason
 * it matters is in the header comment of clock.ts.
 *
 * Adding an entry to this list is a decision, not a fix. If a new file needs
 * wall clock, the question to answer first is whether the value it is computing
 * is a `*_ms` telemetry field. If it is, the answer is no.
 */
const DATE_NOW_ALLOWLIST: { file: string; why: string }[] = [
  {
    file: 'src/core/telemetry/clock.ts',
    why: 'sessions.started_at — the one permitted wall-clock read in the product.',
  },
]

const SCANNED_DIRS = ['src/core/telemetry', 'src/patient']

function walk(dir: string): string[] {
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }

  for (const entry of entries) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

/** Repo-relative, forward slashes, so the allowlist reads the same on any OS. */
function repoPath(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join('/')
}

describe('SessionClock', () => {
  it('produces monotonically non-decreasing offsets across 1000 calls', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    const samples: number[] = []
    for (let i = 0; i < 1000; i++) samples.push(clock.now())

    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1]
      const current = samples[i]
      expect(previous).toBeDefined()
      expect(current).toBeDefined()
      // Non-decreasing, not strictly increasing: performance.now() is allowed to
      // return the same value twice in a row, and on a browser with timer
      // coarsening for Spectre mitigation it routinely does. Requiring strict
      // increase here would be testing the platform's clock resolution, not ours.
      expect(current as number).toBeGreaterThanOrEqual(previous as number)
    }

    dispose()
  })

  it('starts at approximately zero and never goes negative', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    const first = clock.now()
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(50)

    dispose()
  })

  it('records started_at as a valid ISO wall-clock instant', () => {
    const { startedAt, dispose } = createSessionClock({ sampleWindowMs: 1 })

    expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Number.isNaN(new Date(startedAt).getTime())).toBe(false)

    dispose()
  })

  it('exposes a usable pointer sample interval before measurement finishes', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    // A default, not a null: the session record can be written at any moment and
    // the analysis needs something to normalise by.
    expect(clock.pointerSampleIntervalMs).toBeGreaterThan(0)
    expect(clock.pointerSampleIntervalMs).toBeLessThan(100)

    dispose()
  })

  it('refuses to convert an audio timestamp without an anchor', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    // Loud, not silent. Returning NaN or 0 here would put a plausible-looking
    // wrong number into rhythm_trials, and architecture.md 6 is explicit that
    // both the attempt offsets and the asynchronies would then be wrong while
    // still looking fine.
    expect(() => clock.fromAudio(1.5)).toThrow(/audio anchor/i)

    dispose()
  })

  it('converts audio time against a supplied anchor', () => {
    const fakeContext = {
      currentTime: 10,
      getOutputTimestamp: () => ({ contextTime: 10, performanceTime: performance.now() }),
    } as unknown as AudioContext

    const { clock, dispose } = createSessionClock({
      audioContext: fakeContext,
      sampleWindowMs: 1,
    })

    // One second later on the audio clock is ~1000 ms later on this timeline.
    const converted = clock.fromAudio(11)
    expect(converted).toBeGreaterThan(950)
    expect(converted).toBeLessThan(1050)

    dispose()
  })
})

describe('Date.now() is banned in the telemetry path', () => {
  it('appears only in the allowlist, which is printed here for review', () => {
    const offenders: string[] = []
    const allowlisted = new Set(DATE_NOW_ALLOWLIST.map((entry) => entry.file))
    let scanned = 0

    for (const dir of SCANNED_DIRS) {
      for (const file of walk(join(REPO_ROOT, dir))) {
        scanned += 1
        const path = repoPath(file)
        const source = readFileSync(file, 'utf8')

        // Strip comments first. The header of clock.ts explains this rule at
        // length and mentions the call by name; a grep that cannot tell an
        // explanation from a call would force the explanation to be deleted.
        const code = source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/(^|[^:])\/\/.*$/gm, '$1')

        if (code.includes('Date.now()') && !allowlisted.has(path)) {
          offenders.push(path)
        }
      }
    }

    // Printed every run, passing or failing. An allowlist nobody reads is an
    // allowlist that grows.
    console.info(
      [
        '',
        `Date.now() scan: ${scanned} files under ${SCANNED_DIRS.join(', ')}`,
        'Allowlist:',
        ...DATE_NOW_ALLOWLIST.map((entry) => `  - ${entry.file}\n      ${entry.why}`),
        '',
      ].join('\n'),
    )

    expect(scanned).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('the allowlisted file really does still contain the call it is listed for', () => {
    // Otherwise the allowlist silently becomes a list of files that used to
    // matter, and the next real violation gets waved through by an entry that
    // stopped meaning anything.
    for (const entry of DATE_NOW_ALLOWLIST) {
      const source = readFileSync(join(REPO_ROOT, entry.file), 'utf8')
      expect(source, `${entry.file} is allowlisted but no longer calls Date.now()`).toContain(
        'Date.now()',
      )
    }
  })
})
