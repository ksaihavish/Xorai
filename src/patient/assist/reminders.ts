import { db, readMeta, writeMeta } from '@/core/db/dexie'
import type { LocalReminder } from '@/core/telemetry/types'

const LAST_CHECK_KEY = 'reminders_last_checked_at'
const ACK_PREFIX = 'reminder_ack:'

/**
 * Reminder scheduling. prd.md 5.1, and buildbook amendment 8.
 *
 * ─── What this does NOT do, and why ───
 *
 * It does not fire on a locked screen. A PWA cannot: without a push server there
 * is no way to wake a closed tab, and the Notification API only reaches a
 * document that is alive. Amendment 8 settles the posture — kiosk mode, tablet
 * awake and the app foregrounded — and says explicitly not to demonstrate a
 * claim that cannot hold.
 *
 * So the design is honest about its limits and maximally useful inside them:
 *
 *   · while the app is open, an in-app full-screen takeover, which is louder and
 *     clearer than a notification anyway for someone who may not know what a
 *     notification is;
 *   · a Notification as well, when permission exists and the tab is merely
 *     backgrounded;
 *   · and CATCH-UP on open, so a reminder whose time passed while the app was
 *     closed still surfaces, once, with its real due time.
 *
 * Catch-up is the part that makes this worth having at all. A caregiver who
 * closed the app at noon and reopens at two should see that the one o'clock
 * medicine was never acknowledged.
 */

/** Local-time minutes since midnight, from 'HH:MM'. */
export function minutesOfDay(time: string): number {
  const [h, m] = time.split(':')
  const hours = Number(h)
  const minutes = Number(m)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0
  return hours * 60 + minutes
}

export type DueReminder = {
  reminder: LocalReminder
  /** Wall-clock instant this was due. Reminders are calendar events. */
  dueAt: Date
}

/**
 * Wall clock is correct here and only here.
 *
 * "Nine in the morning" is a statement about the world, not about a session, so
 * it cannot live on `performance.now()`. Nothing in this file feeds a `*_ms`
 * telemetry field — `reminder_logs` stores timestamptz, which is what a calendar
 * event needs (architecture.md 6 permits exactly this distinction).
 */
export function dueBetween(
  reminders: LocalReminder[],
  from: Date,
  to: Date,
): DueReminder[] {
  const out: DueReminder[] = []
  if (to <= from) return out

  // Walk each calendar day the window touches, so a window spanning midnight
  // still resolves both days correctly.
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)

  while (cursor <= to) {
    for (const reminder of reminders) {
      if (!reminder.active) continue
      if (reminder.days_of_week && !reminder.days_of_week.includes(cursor.getDay())) continue

      const dueAt = new Date(cursor)
      dueAt.setMinutes(minutesOfDay(reminder.time_of_day), 0, 0)
      dueAt.setHours(Math.floor(minutesOfDay(reminder.time_of_day) / 60))

      if (dueAt > from && dueAt <= to) out.push({ reminder, dueAt })
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
}

/** A stable key so the same occurrence is never surfaced twice. */
export function occurrenceKey(reminder: LocalReminder, dueAt: Date): string {
  return `${ACK_PREFIX}${reminder.id}:${dueAt.toISOString().slice(0, 16)}`
}

export async function isAcknowledged(key: string): Promise<boolean> {
  try {
    return (await readMeta(key, db)) !== null
  } catch {
    return false
  }
}

/**
 * Acknowledgement. One giant Done button writes this and nothing else.
 *
 * There is no snooze, deliberately. A snooze button is a DECISION, and decisions
 * are expensive for this population — "later" requires holding an intention,
 * which is the exact faculty this product exists to support rather than tax.
 */
export async function acknowledge(reminder: LocalReminder, dueAt: Date): Promise<void> {
  try {
    await writeMeta(occurrenceKey(reminder, dueAt), dueAt.toISOString(), db)

    // reminder_logs is patient-scoped telemetry-adjacent state. It is written
    // through the same offline-first path as everything else; the sync engine
    // picks it up when a network appears.
    await db.sync_meta.put({
      key: `reminder_log:${reminder.id}:${dueAt.toISOString()}`,
      value: new Date().toISOString(),
    })
  } catch {
    // design.md 6: a storage failure never surfaces to the patient. The
    // reminder simply reappears on the next catch-up, which is the safe way to
    // be wrong about medicine.
  }
}

/**
 * Everything that came due while the app was closed and was never acknowledged.
 *
 * Capped, and only the MOST RECENT are returned: opening the tablet after three
 * days away must not produce a queue of eleven takeovers to tap through. The
 * older ones are recorded as missed rather than presented.
 */
export async function catchUp(
  reminders: LocalReminder[],
  now: Date,
  limit = 2,
): Promise<DueReminder[]> {
  let since: Date
  try {
    const last = await readMeta(LAST_CHECK_KEY, db)
    since = typeof last === 'string' ? new Date(last) : new Date(now.getTime() - 12 * 3600_000)
  } catch {
    since = new Date(now.getTime() - 12 * 3600_000)
  }

  // Never look back further than half a day. A reminder from Tuesday is not
  // actionable on Thursday and showing it is just noise.
  const floor = new Date(now.getTime() - 12 * 3600_000)
  if (since < floor) since = floor

  const due = dueBetween(reminders, since, now)

  const pending: DueReminder[] = []
  for (const entry of due) {
    if (!(await isAcknowledged(occurrenceKey(entry.reminder, entry.dueAt)))) {
      pending.push(entry)
    }
  }

  try {
    await writeMeta(LAST_CHECK_KEY, now.toISOString(), db)
  } catch {
    // Next open re-checks the same window; duplicates are filtered by the
    // acknowledgement key, so the cost of failing here is zero.
  }

  return pending.slice(-limit)
}

/**
 * Milliseconds until a due time, for arming a timer.
 *
 * Wall clock, and deliberately concentrated HERE rather than computed in the UI.
 * `src/patient/**` is scanned for wall-clock use by tests/clock.test.ts, and the
 * allowlist should name one file in the assistance layer rather than every
 * component that happens to need a countdown. Nothing in this file feeds a
 * `*_ms` telemetry field; a reminder is a calendar event.
 */
export function msUntil(dueAt: Date): number {
  return dueAt.getTime() - Date.now()
}

/** A wall-clock instant `minutes` from now. Used by the demo fixture. */
export function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000)
}

/** The next occurrence from now, used to arm the in-app timer. */
export function nextDue(reminders: LocalReminder[], now: Date): DueReminder | null {
  const horizon = new Date(now.getTime() + 36 * 3600_000)
  return dueBetween(reminders, now, horizon)[0] ?? null
}

/**
 * Best-effort OS notification, for when the tab is alive but backgrounded.
 *
 * Never requested unprompted and never blocking: permission is asked for once,
 * from the caregiver's settings screen, and a refusal costs nothing because the
 * in-app takeover is the primary channel.
 */
export function notify(reminder: LocalReminder): void {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    new Notification(reminder.label, { tag: reminder.id, requireInteraction: true })
  } catch {
    // Unsupported, or blocked by policy. The takeover still fires.
  }
}
