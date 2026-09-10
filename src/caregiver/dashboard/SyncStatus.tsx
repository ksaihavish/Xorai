import { formatDistanceToNow } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { useTranslation } from 'react-i18next'
import { META_KEYS, db, readMeta } from '@/core/db/dexie'
import { droppedWriteCount, pendingCount } from '@/core/db/outbox'

/**
 * CAREGIVER MODE ONLY. This component is never rendered in patient mode, and
 * must never be.
 *
 * design.md 6 forbids any patient-facing surface from showing a technical
 * state: network failure, storage failure, a queue depth. A patient who sees
 * "42 waiting to sync" will believe they broke it. The sync engine surfaces
 * exactly here and nowhere else (rules.md 4).
 *
 * There is no spinner and no error styling. A full outbox is not a fault — it
 * is the product working as designed on a tablet that has been offline for two
 * days, which is the normal case in the districts this is built for.
 */
export function SyncStatus() {
  const { t } = useTranslation()

  const state = useLiveQuery(async () => {
    const [lastSyncedAt, pending] = await Promise.all([
      readMeta(META_KEYS.lastSyncedAt),
      pendingCount(),
    ])
    return { lastSyncedAt, pending }
    // Re-runs whenever any of these tables change, which is what makes the
    // count live without a poll.
  }, [db.outbox_sessions, db.outbox_attempts, db.outbox_strokes, db.outbox_rhythm, db.sync_meta])

  if (!state) return null

  const { lastSyncedAt, pending } = state
  const dropped = droppedWriteCount()

  const lastSynced =
    typeof lastSyncedAt === 'number'
      ? t('sync.lastSynced', {
          when: formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true }),
        })
      : t('sync.never')

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] text-clay">
      <span className="tabular">{lastSynced}</span>

      {pending > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular">{t('sync.pending', { count: pending })}</span>
        </>
      ) : null}

      {dropped > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          {/* Stated plainly because it is the one number here that means
              something went wrong, and a caregiver should be able to repeat it
              to us verbatim. */}
          <span className="tabular text-madder">{t('sync.dropped', { count: dropped })}</span>
        </>
      ) : null}
    </div>
  )
}
