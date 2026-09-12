import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * architecture.md 5.3 sets a hard ceiling on the precache. Over the device
 * quota, a service worker install fails SILENTLY: the worker registers, the
 * files are absent, and the first offline session runs with no audio and no
 * assets. Nothing reports it. This turns that into a failed build instead.
 */
const PRECACHE_LIMIT_BYTES = 25 * 1024 * 1024

/** Colours are duplicated from src/styles/tokens.css because the manifest is
 *  JSON written at build time and cannot read a CSS variable. If --madder or
 *  --paper changes, change them here too. */
const MADDER = '#B3342B'
const PAPER = '#FDFAF3'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        // Precache: app shell, fonts, i18n bundles, the base cultural pack, and
        // the DEFAULT language's audio only. Other languages are runtime-cached
        // in sw.ts — precaching seven of them is several times the budget above.
        /**
         * architecture.md 5.3 and 10: precache the SELECTED language only and
         * runtime-cache the rest. Seven languages of pre-generated speech is
         * several times the budget, and a precache over the device quota fails
         * SILENTLY at install — the worker registers, the files are absent, and
         * the first session runs mute with no error anywhere.
         *
         * Fonts follow the same rule. Latin is always needed (the caregiver UI
         * is Latin whatever the patient's language), so it is precached; the
         * Bengali, Devanagari and Meetei Mayek subsets are runtime-cached on
         * first use by the sw.ts rule for /fonts/. unicode-range already means a
         * browser only DOWNLOADS the script it renders — this stops the service
         * worker undoing that by fetching all four up front.
         */
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webmanifest}',
          'fonts/fonts.css',
          'fonts/noto-sans-latin-*.woff2',
          'fonts/inter-latin-*.woff2',
          'i18n/en.json',
          'audio/en/**/*.{mp3,wav}',
          'assets/cultural/**/*.webp',
        ],
        globIgnores: ['audio/!(en)/**', 'fonts/noto-sans-{bengali,devanagari,meetei}*'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        name: 'Xorai',
        short_name: 'Xorai',
        description:
          'Cognitive engagement and memory assistance for elderly people living with dementia.',
        // Kiosk posture: the tablet stays awake, foregrounded and landscape.
        display: 'fullscreen',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        theme_color: MADDER,
        background_color: PAPER,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    {
      name: 'xorai-precache-budget',
      apply: 'build',
      // vite-plugin-pwa emits dist/sw.js from its OWN closeBundle, in a second
      // Vite build. closeBundle is a parallel hook, so without sequential+post
      // this runs first, finds no sw.js, and silently checks nothing — which is
      // the exact failure mode the check exists to catch.
      closeBundle: {
        sequential: true,
        order: 'post',
        handler() {
          assertPrecacheBudget()
        },
      },
    },
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})

function assertPrecacheBudget(): void {
  const dist = fileURLToPath(new URL('./dist', import.meta.url))

  // Throws rather than returns on every "cannot check" path. A budget check
  // that quietly passes when it found nothing is worse than no check at all.
  let entries: string[]
  try {
    entries = readdirSync(dist)
  } catch {
    throw new Error(`Precache budget check: ${dist} does not exist after build.`)
  }
  if (!entries.includes('sw.js')) {
    throw new Error(
      'Precache budget check: dist/sw.js was not found. vite-plugin-pwa did not emit a service worker, so nothing is precached and the app has no offline mode.',
    )
  }

  const source = readFileSync(join(dist, 'sw.js'), 'utf8')
  const urls = [...source.matchAll(/"url":\s*"([^"]+)"/g)].map((match) => match[1])
  if (urls.length === 0) {
    throw new Error(
      'Precache budget check: dist/sw.js contains no precache manifest entries. The __WB_MANIFEST injection did not happen.',
    )
  }

  let total = 0
  for (const url of urls) {
    if (!url) continue
    try {
      total += statSync(join(dist, url)).size
    } catch {
      // Listed but absent: the manifest hash check will catch it, not this.
    }
  }

  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

  // Printed every build, passing or failing, so the number is watched rather
  // than discovered at 25 MB.
  const byKind = new Map<string, number>()
  for (const url of urls) {
    if (!url) continue
    const kind = url.startsWith('audio/')
      ? 'audio'
      : url.startsWith('fonts/')
        ? 'fonts'
        : url.startsWith('assets/cultural/')
          ? 'cultural'
          : 'shell'
    try {
      byKind.set(kind, (byKind.get(kind) ?? 0) + statSync(join(dist, url)).size)
    } catch {
      // Counted in the total below or not at all.
    }
  }
  const breakdown = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, bytes]) => `${kind} ${mb(bytes)}`)
    .join(', ')

  if (total > PRECACHE_LIMIT_BYTES) {
    throw new Error(
      `Precache is ${mb(total)} across ${urls.length} files, over the ${mb(PRECACHE_LIMIT_BYTES)} ceiling in architecture.md 5.3. ` +
        'A precache above the device quota fails silently at install and the app runs with no audio. ' +
        'Move something to a runtime cache in src/sw.ts rather than raising this limit.',
    )
  }

  console.log(
    `[xorai] precache ${mb(total)} across ${urls.length} files ` +
      `(limit ${mb(PRECACHE_LIMIT_BYTES)}) — ${breakdown}`,
  )
}
