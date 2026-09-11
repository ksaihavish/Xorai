/**
 * build-asset-pack.ts — turns a folder of source images plus assets.csv into
 * the cultural deck and the migration that seeds it.
 *
 *   npx tsx scripts/build-asset-pack.ts --in ./raw-assets --csv ./raw-assets/assets.csv
 *
 * ─── The one rule this script exists to enforce ───
 *
 * `licence` and `source_url` are NOT NULL in `media_assets`, and this script
 * REFUSES a row missing either. It does not warn and continue; it fails.
 *
 * "Where did the images come from" is a real question a judge will ask, and one
 * column answers it. A pack assembled without provenance cannot be published,
 * and finding that out at submission time is finding out too late. Sourcing is
 * Wikimedia Commons (CC-BY / CC-BY-SA), Government of India tourism assets, or
 * team-photographed originals. No scraping.
 *
 * Requires `sharp` for the image work, which is NOT in rules.md 3 and is NOT
 * installed. It is a build-time-only dependency — it never enters the browser
 * bundle — but it still needs approving before this script can run. Until then
 * the script parses, validates and emits SQL, and tells you what it would have
 * converted.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'

const OUT_DIR = resolve('public/assets/cultural')
const MIGRATION = resolve('supabase/migrations/0003_seed_assets.sql')
const MAX_BYTES = 200 * 1024
const EDGE = 512

type AssetRow = {
  id: string
  category: string
  item_name_key: string
  source_file: string
  licence: string
  source_url: string
  region_tags: string[]
  era: 'vintage' | 'contemporary'
}

function fail(message: string): never {
  console.error(`\n  build-asset-pack: ${message}\n`)
  process.exit(1)
}

/** Minimal CSV: no embedded newlines, quoted fields with commas supported. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  const header = lines.shift()
  if (!header) fail('assets.csv is empty')

  const columns = splitRow(header)
  return lines.map((line) => {
    const cells = splitRow(line)
    const row: Record<string, string> = {}
    columns.forEach((name, i) => {
      row[name.trim()] = (cells[i] ?? '').trim()
    })
    return row
  })
}

function splitRow(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      quoted = !quoted
    } else if (ch === ',' && !quoted) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out
}

function validate(raw: Record<string, string>, index: number): AssetRow {
  const where = `row ${index + 2}`
  const required = ['id', 'category', 'item_name_key', 'source_file', 'licence', 'source_url', 'era']

  for (const field of required) {
    if (!raw[field]) {
      // The refusal. Not a warning.
      fail(
        `${where} is missing "${field}". licence and source_url are NOT NULL in media_assets and no asset enters the repo without both. Fix assets.csv and re-run.`,
      )
    }
  }

  const era = raw['era']
  if (era !== 'vintage' && era !== 'contemporary') {
    fail(`${where} has era="${era ?? ''}". Must be vintage or contemporary — it drives the deck weighting.`)
  }

  return {
    id: raw['id'] ?? '',
    category: raw['category'] ?? '',
    item_name_key: raw['item_name_key'] ?? '',
    source_file: raw['source_file'] ?? '',
    licence: raw['licence'] ?? '',
    source_url: raw['source_url'] ?? '',
    region_tags: (raw['region_tags'] ?? '')
      .split(/[;|]/)
      .map((tag) => tag.trim())
      .filter(Boolean),
    era,
  }
}

async function convert(row: AssetRow, inDir: string): Promise<{ path: string; bytes: number } | null> {
  const source = join(inDir, row.source_file)
  if (!existsSync(source)) fail(`${row.id}: source file not found at ${source}`)

  const outName = `${row.id}.webp`
  const outPath = join(OUT_DIR, outName)

  type SharpImage = {
    resize: (w: number, h: number, opts: object) => SharpImage
    webp: (opts: object) => SharpImage
    toBuffer: () => Promise<Buffer>
  }
  type SharpLike = (input: string) => SharpImage

  // Imported through a computed specifier so TypeScript does not require the
  // package to be installed for this file to compile. It is build-time only and
  // never enters the browser bundle, but it still needs approving before use.
  let sharp: SharpLike | null = null
  try {
    const moduleName = 'sharp'
    const loaded: unknown = await import(/* @vite-ignore */ moduleName)
    sharp = (loaded as { default: SharpLike }).default
  } catch {
    console.warn(`  · ${row.id}: would convert ${row.source_file} → ${outName} (sharp not installed)`)
    return { path: `/assets/cultural/${outName}`, bytes: 0 }
  }

  // Square crop, because a mixed-aspect grid reads as broken rather than varied.
  // Quality steps down until it fits: 7.3 caps each image at 200 KB, and a
  // 512 px square WebP is comfortably under 100 KB in practice.
  for (const quality of [82, 72, 62, 52, 42]) {
    const buffer = await sharp(source)
      .resize(EDGE, EDGE, { fit: 'cover', position: 'attention' })
      .webp({ quality })
      .toBuffer()

    if (buffer.byteLength <= MAX_BYTES) {
      writeFileSync(outPath, buffer)
      return { path: `/assets/cultural/${outName}`, bytes: buffer.byteLength }
    }
  }

  fail(`${row.id}: cannot get under ${MAX_BYTES / 1024} KB even at quality 42. Crop it tighter or replace it.`)
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function emitMigration(rows: { row: AssetRow; path: string }[]): void {
  const values = rows
    .map(({ row, path }) => {
      const tags =
        row.region_tags.length > 0
          ? `ARRAY[${row.region_tags.map(sqlString).join(', ')}]::text[]`
          : 'NULL'
      return `  (${sqlString(row.id)}, ${sqlString(row.category)}, ${sqlString(row.item_name_key)}, ${sqlString(path)}, ${sqlString(row.item_name_key + '.alt')}, ${sqlString(row.licence)}, ${sqlString(row.source_url)}, ${tags}, ${sqlString(row.era)})`
    })
    .join(',\n')

  const sql = `-- 0003_seed_assets.sql — the cultural deck.
--
-- GENERATED by scripts/build-asset-pack.ts. Do not hand-edit: re-run the script.
-- Forward-only, like every migration here (rules.md 5).
--
-- Every row carries licence and source_url because media_assets makes both
-- NOT NULL, and because "where did the images come from" is a question with one
-- correct answer: this table.
--
-- \`era\` drives the deck weighting in the game — vintage 0.6, contemporary 0.4.
-- Remote memory outlives recent memory, so a hurricane lantern is worth more
-- than a landmark here (architecture.md 7.3).

insert into public.media_assets
  (id, category, item_name_key, image_path, alt_text_key, licence, source_url, region_tags, era)
values
${values}
on conflict (id) do update set
  category      = excluded.category,
  item_name_key = excluded.item_name_key,
  image_path    = excluded.image_path,
  alt_text_key  = excluded.alt_text_key,
  licence       = excluded.licence,
  source_url    = excluded.source_url,
  region_tags   = excluded.region_tags,
  era           = excluded.era;
`

  writeFileSync(MIGRATION, sql)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const inDir = resolve(argValue(args, '--in') ?? './raw-assets')
  const csvPath = resolve(argValue(args, '--csv') ?? join(inDir, 'assets.csv'))

  if (!existsSync(csvPath)) {
    fail(
      `no assets.csv at ${csvPath}. Expected columns: id, category, item_name_key, source_file, licence, source_url, region_tags, era`,
    )
  }

  const rows = parseCsv(readFileSync(csvPath, 'utf8')).map(validate)
  if (rows.length === 0) fail('assets.csv has a header but no rows')

  const ids = new Set<string>()
  for (const row of rows) {
    if (ids.has(row.id)) fail(`duplicate id "${row.id}" — ids are the primary key in media_assets`)
    ids.add(row.id)
  }

  mkdirSync(OUT_DIR, { recursive: true })

  const converted: { row: AssetRow; path: string }[] = []
  let totalBytes = 0
  for (const row of rows) {
    const result = await convert(row, inDir)
    if (!result) continue
    totalBytes += result.bytes
    converted.push({ row, path: result.path })
  }

  emitMigration(converted)

  const vintage = rows.filter((r) => r.era === 'vintage').length
  console.log(
    [
      '',
      `  ${converted.length} assets → ${OUT_DIR}`,
      `  ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`,
      `  era mix: ${vintage} vintage / ${rows.length - vintage} contemporary` +
        `  (target 60/40 — see architecture.md 7.3)`,
      `  migration written to ${basename(MIGRATION)}`,
      '',
    ].join('\n'),
  )
}

function argValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag)
  return at >= 0 ? args[at + 1] : undefined
}

void main()

// Referenced so the import of extname is not dropped by a future edit that
// needs it back; the converter always writes .webp regardless of source format.
export const SOURCE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tif'].map((e) => extname(`x${e}`))
