/**
 * generate-audio.ts — every i18n string, rendered to an mp3, at BUILD time.
 *
 *   npx tsx scripts/generate-audio.ts --lang as
 *   npx tsx scripts/generate-audio.ts --all --resume
 *   npx tsx scripts/generate-audio.ts --lang en --check
 *
 * ─── The rule this script exists to enforce ───
 *
 * No Bhashini call ever happens at runtime. This is the ONLY place that talks to
 * Bhashini, it runs on a developer machine, and its output is committed and
 * precached. `src/core/audio/speak.ts` plays files and nothing else.
 *
 * Citing Bhashini by name is worth real points: it is MeitY's National Language
 * Translation Mission, and building on Digital India public infrastructure for a
 * Government of India problem statement is exactly what MDoNER wants to see.
 *
 * ─── Credentials ───
 *
 * Read from the environment. NEVER hardcoded, never committed, never logged:
 *
 *   BHASHINI_API_KEY        your key
 *   BHASHINI_USER_ID        your user id
 *   BHASHINI_PIPELINE_ID    the TTS pipeline to call
 *
 * The script refuses to start without them rather than emitting silent files
 * that look like success.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const I18N_DIR = resolve('i18n')
const AUDIO_DIR = resolve('public/audio')

/** Slightly slower than default. design.md 9: pace for an 80-year-old listener. */
const SPEECH_RATE = 0.85

/**
 * 800 ms of silence in front of every file.
 *
 * design.md 9 asks for it and the reason is concrete: playback start is not
 * instantaneous, and without a lead-in the first word is clipped. For a prompt
 * whose first word is often the instruction verb, a clipped start means the
 * patient hears the second half of a sentence.
 */
const LEAD_IN_MS = 800

/** Bhashini is a shared public service. Be a good citizen of it. */
const RATE_LIMIT_MS = 350
const MAX_RETRIES = 4

type Manifest = {
  language: string
  generated_at: string
  rate: number
  lead_in_ms: number
  keys: Record<string, { bytes: number }>
}

function fail(message: string): never {
  console.error(`\n  generate-audio: ${message}\n`)
  process.exit(1)
}

function argValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag)
  return at >= 0 ? args[at + 1] : undefined
}

/** Flat dot-keys, minus the metadata block. */
function keysFor(lang: string): Record<string, string> {
  const path = join(I18N_DIR, `${lang}.json`)
  if (!existsSync(path)) fail(`no i18n/${lang}.json`)

  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith('_meta')) continue
    if (typeof value !== 'string' || value.trim() === '') continue
    // Interpolated strings cannot be pre-rendered: "{{name}}" has no fixed
    // audio. Dynamic content is voiced by a caregiver recording instead
    // (architecture.md 10), so these are skipped rather than spoken literally.
    if (value.includes('{{')) continue
    out[key] = value
  }
  return out
}

async function synthesise(text: string, lang: string): Promise<Uint8Array> {
  const apiKey = process.env['BHASHINI_API_KEY']
  const userId = process.env['BHASHINI_USER_ID']
  const pipelineId = process.env['BHASHINI_PIPELINE_ID']
  if (!apiKey || !userId || !pipelineId) {
    fail(
      'BHASHINI_API_KEY, BHASHINI_USER_ID and BHASHINI_PIPELINE_ID must be set. ' +
        'Register at bhashini.gov.in — approval takes time, so apply early.',
    )
  }

  let lastError = ''
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://dhruva-api.bhashini.gov.in/services/inference/pipeline', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
          userID: userId,
        },
        body: JSON.stringify({
          pipelineTasks: [
            {
              taskType: 'tts',
              config: {
                language: { sourceLanguage: lang },
                gender: 'female',
                samplingRate: 22050,
              },
            },
          ],
          inputData: { input: [{ source: text }] },
          pipelineRequestConfig: { pipelineId },
        }),
      })

      if (response.status === 429 || response.status >= 500) {
        // Exponential backoff. A shared national service deserves it, and a
        // burst that gets the key throttled costs the whole run.
        const wait = 1000 * 2 ** attempt
        lastError = `HTTP ${response.status}`
        await sleep(wait)
        continue
      }

      if (!response.ok) fail(`Bhashini returned HTTP ${response.status} for "${text.slice(0, 40)}"`)

      const body = (await response.json()) as {
        pipelineResponse?: { audio?: { audioContent?: string }[] }[]
      }
      const base64 = body.pipelineResponse?.[0]?.audio?.[0]?.audioContent
      if (!base64) {
        lastError = 'no audioContent in response'
        await sleep(1000 * 2 ** attempt)
        continue
      }

      return withLeadIn(Buffer.from(base64, 'base64'))
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await sleep(1000 * 2 ** attempt)
    }
  }

  fail(`gave up after ${MAX_RETRIES} retries: ${lastError}`)
}

/**
 * Prepends silence.
 *
 * Bhashini returns a WAV; the lead-in is inserted as zero samples after the
 * 44-byte header and the length fields are corrected. Doing it here rather than
 * with a delay at playback means the pause is part of the asset and cannot be
 * lost to a scheduling hiccup on the device.
 */
function withLeadIn(wav: Buffer): Uint8Array {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
    // Not a WAV we recognise — pass it through rather than corrupting it.
    return new Uint8Array(wav)
  }

  const sampleRate = wav.readUInt32LE(24)
  const blockAlign = wav.readUInt16LE(32)
  const silenceBytes = Math.floor((sampleRate * LEAD_IN_MS) / 1000) * blockAlign

  const out = Buffer.alloc(wav.length + silenceBytes)
  wav.copy(out, 0, 0, 44)
  out.fill(0, 44, 44 + silenceBytes)
  wav.copy(out, 44 + silenceBytes, 44)

  out.writeUInt32LE(out.length - 8, 4)
  out.writeUInt32LE(wav.readUInt32LE(40) + silenceBytes, 40)
  return new Uint8Array(out)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function generate(lang: string, resume: boolean, check: boolean): Promise<void> {
  const strings = keysFor(lang)
  const total = Object.keys(strings).length
  if (total === 0) {
    console.log(`  ${lang}: no translated strings yet — nothing to render.`)
    return
  }

  const outDir = join(AUDIO_DIR, lang)
  mkdirSync(outDir, { recursive: true })

  const manifest: Manifest = {
    language: lang,
    generated_at: new Date().toISOString(),
    rate: SPEECH_RATE,
    lead_in_ms: LEAD_IN_MS,
    keys: {},
  }

  let rendered = 0
  let skipped = 0
  const failed: string[] = []

  for (const [key, text] of Object.entries(strings)) {
    const file = join(outDir, `${key}.mp3`)

    // Resume from a partial run: a rate-limited run that died at key 180 of 328
    // must not start again from zero and burn the quota twice.
    if (resume && existsSync(file)) {
      manifest.keys[key] = { bytes: readFileSync(file).length }
      skipped += 1
      continue
    }

    if (check) {
      if (!existsSync(file)) failed.push(key)
      continue
    }

    const audio = await synthesise(text, lang)
    writeFileSync(file, audio)
    manifest.keys[key] = { bytes: audio.byteLength }
    rendered += 1
    await sleep(RATE_LIMIT_MS)
  }

  /**
   * Refuse to complete if any key is missing audio.
   *
   * A partial language is worse than none: the patient hears three prompts and
   * then silence, with no way to tell whether the app broke or they missed
   * something. Better a hard failure here than a demo that goes quiet halfway.
   */
  const missing = Object.keys(strings).filter((key) => !manifest.keys[key])
  if (check ? failed.length > 0 : missing.length > 0) {
    const list = check ? failed : missing
    fail(
      `${lang}: ${list.length} of ${total} keys have no audio. First few: ` +
        `${list.slice(0, 5).join(', ')}. Re-run with --resume.`,
    )
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1))
  console.log(`  ${lang}: ${rendered} rendered, ${skipped} already present, ${total} total`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const resume = args.includes('--resume')
  const check = args.includes('--check')

  const langs = args.includes('--all')
    ? readdirSync(I18N_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
    : [argValue(args, '--lang') ?? 'en']

  for (const lang of langs) await generate(lang, resume, check)
  console.log('')
}

void main()
