import { describe, expect, it } from 'vitest'
import { INTERVALS, advance, initialState, nextDueAt, selectDueFace } from '@/core/difficulty/spaced-retrieval'
import { classifyError } from '@/patient/games/aponjon/AponjonGame'
import { isSemanticallyNear, kinshipEntry } from '@/patient/games/aponjon/kinship'
import type { LocalFamilyMember } from '@/core/telemetry/types'

const P = 'patient-1'

function member(id: string, name: string, kin: string | null): LocalFamilyMember {
  return {
    id,
    display_name: name,
    kinship_term_key: kin,
    relationship_en: null,
    photo_url: null,
    voice_note_url: null,
    phone: null,
    is_emergency: false,
    sort_order: 0,
  }
}

describe('spaced retrieval', () => {
  it('advances one rung on success and records the interval SUSTAINED', () => {
    let s = initialState(P, 'f1')
    expect(s.current_interval_s).toBe(30)
    expect(s.longest_interval_s).toBe(0)

    s = advance(s, true, 1000)
    expect(s.current_interval_s).toBe(60)
    // 30 is what they actually held, not the 60 they were promoted to.
    expect(s.longest_interval_s).toBe(30)
    expect(s.consecutive_success).toBe(1)
  })

  it('drops back exactly ONE rung on a miss, never to zero', () => {
    let s = initialState(P, 'f1')
    s = advance(s, true, 1)
    s = advance(s, true, 2)
    s = advance(s, true, 3)
    expect(s.current_interval_s).toBe(240)

    s = advance(s, false, 4)
    // One step. Dropping to the start would discard weeks of gain to one bad
    // afternoon, which is usually an infection rather than the person changing.
    expect(s.current_interval_s).toBe(120)
    expect(s.consecutive_success).toBe(0)
  })

  it('never lets longest_interval_s decrease', () => {
    let s = initialState(P, 'f1')
    for (let i = 0; i < 4; i++) s = advance(s, true, i)
    const peak = s.longest_interval_s
    expect(peak).toBe(240)

    for (let i = 0; i < 6; i++) s = advance(s, false, 100 + i)
    expect(s.current_interval_s).toBe(INTERVALS[0])
    expect(s.longest_interval_s).toBe(peak)
  })

  it('clamps at the top rung rather than running off the ladder', () => {
    let s = initialState(P, 'f1')
    for (let i = 0; i < 20; i++) s = advance(s, true, i)
    expect(s.current_interval_s).toBe(480)
  })

  it('schedules the next test at now + the current interval', () => {
    const s = advance(initialState(P, 'f1'), true, 10_000)
    // Promoted to 60 s, tested at 10 s in → due at 70 s.
    expect(nextDueAt(s)).toBe(10_000 + 60_000)
  })

  it('picks the most overdue face, and untested faces first', () => {
    const untested = initialState(P, 'fresh')
    const tested = advance(initialState(P, 'seen'), true, 1_000)

    const due = selectDueFace([tested, untested], 2_000)
    expect(due?.family_member_id).toBe('fresh')
  })
})

describe('kinship structure', () => {
  it("keeps the four people English collapses into 'uncle' distinct", () => {
    const keys = [
      'kin.father_elder_brother',
      'kin.father_younger_brother',
      'kin.mother_brother',
      'kin.father_sister',
    ]
    for (const key of keys) expect(kinshipEntry(key)).not.toBeNull()
    expect(new Set(keys).size).toBe(4)
  })

  it('marks the maternal uncle as maternal — Khasi is matrilineal', () => {
    expect(kinshipEntry('kin.mother_brother')?.side).toBe('maternal')
    expect(kinshipEntry('kin.father_elder_brother')?.side).toBe('paternal')
  })

  it('treats same-generation relations as near and cross-generation as not', () => {
    expect(isSemanticallyNear('kin.spouse', 'kin.elder_sister')).toBe(true)
    expect(isSemanticallyNear('kin.grandson', 'kin.father')).toBe(false)
    // A key is not near itself; that would be the correct answer.
    expect(isSemanticallyNear('kin.spouse', 'kin.spouse')).toBe(false)
  })
})

describe('error typing', () => {
  const target = member('t', 'Priya', 'kin.daughter')
  const sibling = member('s', 'Nomita', 'kin.elder_sister')
  const spouse = member('sp', 'Ranjit', 'kin.spouse')
  const grandchild = member('g', 'Rahul', 'kin.grandson')

  const base = { correct: false, target, seenTargets: new Set<string>(), lastWrongId: null }

  it('a correct answer is none', () => {
    expect(classifyError({ ...base, correct: true, chosen: target })).toBe('none')
  })

  it('no response is an omission', () => {
    expect(classifyError({ ...base, chosen: null })).toBe('omission')
  })

  it('the same wrong name twice running is perseveration', () => {
    expect(classifyError({ ...base, chosen: spouse, lastWrongId: 'sp' })).toBe('perseveration')
  })

  it("an earlier trial's answer bleeding forward is an intrusion", () => {
    expect(
      classifyError({ ...base, chosen: sibling, seenTargets: new Set(['s']) }),
    ).toBe('intrusion')
  })

  it('a same-generation relation is semantic_near, not random', () => {
    // Choosing a sibling's name for a spouse is a different clinical signal
    // from a random pick. That is the whole reason this function exists.
    expect(classifyError({ ...base, chosen: spouse, target: sibling })).toBe('semantic_near')
  })

  it('a cross-generation relation is random', () => {
    expect(classifyError({ ...base, chosen: grandchild, target: spouse })).toBe('random')
  })

  it('prefers the more informative label when several apply', () => {
    // Perseveration outranks intrusion outranks semantic_near.
    expect(
      classifyError({
        ...base,
        chosen: spouse,
        target: sibling,
        seenTargets: new Set(['sp']),
        lastWrongId: 'sp',
      }),
    ).toBe('perseveration')

    expect(
      classifyError({
        ...base,
        chosen: spouse,
        target: sibling,
        seenTargets: new Set(['sp']),
      }),
    ).toBe('intrusion')
  })
})
