import type { LocalMusicTrack, LocalReminder } from '@/core/telemetry/types'
import { minutesFromNow } from '@/patient/assist/reminders'

/**
 * Stand-ins for the cached profile, used only until Phase 6's `local_profile`
 * caching lands. Same role as `demoFamily.ts` in Aponjon: they exist so the
 * assistance layer can be opened, seen and tested now rather than in two phases.
 *
 * The reminder times are relative to load so a demo always has something due
 * shortly, rather than depending on what time of day it happens to be.
 */

function inMinutes(minutes: number): string {
  const at = minutesFromNow(minutes)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}

export const DEMO_REMINDERS: LocalReminder[] = [
  {
    id: 'demo-med',
    kind: 'medication',
    label: 'Time for the blue tablet',
    time_of_day: inMinutes(1),
    days_of_week: null,
    // Null here means generated speech. A real deployment almost always has a
    // recording, and design.md 9 says to prefer it whenever one exists.
    audio_url: null,
    active: true,
  },
  {
    id: 'demo-meal',
    kind: 'meal',
    label: 'Time for lunch',
    time_of_day: '13:00',
    days_of_week: null,
    audio_url: null,
    active: true,
  },
]

export const DEMO_TRACKS: LocalMusicTrack[] = [
  { id: 'demo-track-1', title: 'Bihu geet', audio_url: null },
  { id: 'demo-track-2', title: 'Jyoti Sangeet', audio_url: null },
]
