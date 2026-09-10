import { addDays, format, getDate } from 'date-fns'

/**
 * The reality-orientation board, digitised. architecture.md 7.5.
 *
 * Four questions, every session. It is the cheapest thing in the product to
 * build and it yields a clean daily orientation score, which is why it runs
 * every time rather than being one of the rotating games.
 *
 * Wall clock is used freely in this file, and that is correct: "what day is it"
 * is a question ABOUT the wall clock. Nothing here produces a `*_ms` telemetry
 * value — those come from the session clock, in the component. The two must not
 * be confused, which is why the date lives here and the timing lives there.
 */

export type OrientationQuestionId = 'day' | 'date' | 'season' | 'place'

export type OrientationOption = {
  id: string
  /** Already-resolved display text. Season options render a drawing instead. */
  label: string
  correct: boolean
}

export type OrientationQuestion = {
  id: OrientationQuestionId
  /** i18n key for the spoken and displayed prompt. */
  promptKey: string
  options: OrientationOption[]
  /** Seasons are drawings, not words — the one question needing no literacy. */
  render: 'text' | 'season'
}

export type Season = 'bihu' | 'monsoon' | 'harvest' | 'winter'

/**
 * The North Eastern year, not the meteorological one. Bihu is the spring
 * festival and the marker everyone in the region orients by; the monsoon is long
 * and unmistakable; harvest and winter close the year.
 *
 * Months are 0-indexed as JavaScript gives them.
 */
export function seasonFor(date: Date): Season {
  const month = date.getMonth()
  if (month >= 1 && month <= 3) return 'bihu'
  if (month >= 4 && month <= 8) return 'monsoon'
  if (month >= 9 && month <= 10) return 'harvest'
  return 'winter'
}

export const SEASONS: Season[] = ['bihu', 'monsoon', 'harvest', 'winter']

/**
 * Deterministic shuffle from a seed, so the option order is stable for one
 * session but not identical every day.
 *
 * Stability within a session matters: the errorless hint dims distractors after
 * a hesitation, and a re-render that reshuffled the options underneath a finger
 * already moving toward one would be the single most confusing thing this
 * screen could do.
 */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items]
  let state = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    const j = state % (i + 1)
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out
}

/**
 * Takes only the fields it reads, not the whole patient. A component memoising
 * on a `LocalPatient` object would reshuffle the options whenever the caller
 * rebuilt that object, which is exactly what must not happen mid-question.
 */
export function buildOrientationQuestions(
  patient: { home_place: string | null },
  today: Date,
  seed: number,
): OrientationQuestion[] {
  const questions: OrientationQuestion[] = []

  // ── What day is it ──
  const correctDay = format(today, 'EEEE')
  const dayDistractors = [2, 4, 5]
    .map((offset) => format(addDays(today, offset), 'EEEE'))
    .filter((day) => day !== correctDay)
    .slice(0, 3)

  questions.push({
    id: 'day',
    promptKey: 'orientation.prompts.day',
    render: 'text',
    options: shuffle(
      [
        { id: correctDay, label: correctDay, correct: true },
        ...dayDistractors.map((day) => ({ id: day, label: day, correct: false })),
      ],
      seed,
    ),
  })

  // ── What is today's date ──
  //
  // Distractors are days either side rather than random numbers: a person who is
  // a day or two out is doing something different from a person guessing, and
  // the error type is only interpretable if the near misses are actually near.
  const correctDate = getDate(today)
  const dateDistractors = [-2, 2, 5]
    .map((offset) => getDate(addDays(today, offset)))
    .filter((value) => value !== correctDate)
    .slice(0, 3)

  questions.push({
    id: 'date',
    promptKey: 'orientation.prompts.date',
    render: 'text',
    options: shuffle(
      [
        { id: String(correctDate), label: String(correctDate), correct: true },
        ...dateDistractors.map((value) => ({
          id: String(value),
          label: String(value),
          correct: false,
        })),
      ],
      seed + 1,
    ),
  })

  // ── Which season ── all four, always; the drawings are the whole point.
  const correctSeason = seasonFor(today)
  questions.push({
    id: 'season',
    promptKey: 'orientation.prompts.season',
    render: 'season',
    options: shuffle(
      SEASONS.map((season) => ({
        id: season,
        label: season,
        correct: season === correctSeason,
      })),
      seed + 2,
    ),
  })

  // ── Where are you ──
  //
  // Skipped entirely when home_place is unset, rather than guessed. There is no
  // honest distractor for a place we were never told, and inventing one risks
  // asking a person to choose between two towns they have both lived in.
  //
  // With a place, the choice is two options — their own town, or the neutral
  // alternative. Naming a second real town would be inventing content about
  // someone's life from nothing.
  if (patient.home_place && patient.home_place.trim().length > 0) {
    const place = patient.home_place.trim()
    questions.push({
      id: 'place',
      promptKey: 'orientation.prompts.place',
      render: 'text',
      options: shuffle(
        [
          { id: 'home', label: place, correct: true },
          { id: 'elsewhere', label: 'ORIENTATION_ELSEWHERE', correct: false },
        ],
        seed + 3,
      ),
    })
  }

  return questions
}
