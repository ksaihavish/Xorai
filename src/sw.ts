/// <reference lib="webworker" />
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

/**
 * Custom service worker, injectManifest strategy. architecture.md 5.3.
 *
 * generateSW was not an option: the precache set here is a deliberate subset,
 * and the "never cache" rules below are the kind of thing a generated worker
 * gets wrong in a way nobody notices until a caregiver sees stale data.
 */

// __WB_MANIFEST is replaced at build time by vite-plugin-pwa with the list from
// injectManifest.globPatterns in vite.config.ts.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

/**
 * ─── Never cached, and this is the important half of the file ───
 *
 * Supabase REST and auth, always straight to the network.
 *
 * A cached REST response means a caregiver opening the dashboard sees last
 * week's numbers presented as today's, with no indication anything is stale —
 * on a product whose entire claim is "this changed against their own baseline".
 * A cached auth response is worse: a revoked or refreshed token served from
 * cache is a session that will not die.
 *
 * These are registered FIRST because workbox matches routes in registration
 * order, and a later, broader rule must not be able to claim them.
 */
registerRoute(({ url }) => url.pathname.startsWith('/rest/v1/'), new NetworkOnly())
registerRoute(({ url }) => url.pathname.startsWith('/auth/v1/'), new NetworkOnly())
registerRoute(({ url }) => url.pathname.startsWith('/realtime/v1/'), new NetworkOnly())
registerRoute(({ url }) => url.pathname.startsWith('/functions/v1/'), new NetworkOnly())

/**
 * Family photographs, from Supabase Storage. CacheFirst, 30 days, 300 entries.
 *
 * These must survive offline: a contact card without the face is a contact card
 * that does not work for the person it is for. Signed URLs carry a token in the
 * query string, so the cache key drops the query — otherwise every re-signing
 * would store the same image again under a new key and blow through the cap in
 * a week.
 */
registerRoute(
  ({ url, request }) =>
    request.destination === 'image' && url.pathname.includes('/storage/v1/object/'),
  new CacheFirst({
    cacheName: 'xorai-family-media',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 300,
        maxAgeSeconds: 30 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
    matchOptions: { ignoreSearch: true },
  }),
)

/**
 * Audio for languages other than the precached default.
 *
 * architecture.md 5.3: precache the selected language only and runtime-cache the
 * rest. Precaching seven languages of pre-generated speech is several times the
 * asset budget, and a precache that exceeds the device quota fails SILENTLY —
 * the worker installs, the files are not there, and the first patient session
 * runs mute. The build-time assertion in vite.config.ts is the other half of
 * this; between them a language switch costs one online session, and going over
 * quota costs a failed build instead of a failed demo.
 */
registerRoute(
  ({ url, request }) => request.destination === 'audio' && url.pathname.startsWith('/audio/'),
  new CacheFirst({
    cacheName: 'xorai-audio-runtime',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 2000,
        maxAgeSeconds: 90 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

/** Cultural deck images beyond the precached base pack. */
registerRoute(
  ({ url, request }) =>
    request.destination === 'image' && url.pathname.startsWith('/assets/cultural/'),
  new CacheFirst({
    cacheName: 'xorai-cultural',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 400,
        maxAgeSeconds: 90 * 24 * 60 * 60,
        purgeOnQuotaError: true,
      }),
    ],
  }),
)

/**
 * i18n bundles are precached, but a rebuild changes them. SWR keeps a language
 * pack usable offline while picking up a corrected translation on the next load.
 */
registerRoute(
  ({ url }) => url.pathname.startsWith('/i18n/') && url.pathname.endsWith('.json'),
  new StaleWhileRevalidate({ cacheName: 'xorai-i18n' }),
)

/**
 * Take over immediately on update rather than waiting for every tab to close.
 *
 * A tablet in kiosk mode has exactly one tab and it is never closed, so the
 * default waiting behaviour means a fix ships and never arrives.
 */
self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
