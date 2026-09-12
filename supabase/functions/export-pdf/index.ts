// export-pdf — one A4 page a family carries to an appointment.
//
// ─── Why a PDF and not a portal ───
//
// prd.md 3.4 cut the doctor portal deliberately: a portal nobody logs into is
// worse than a PDF a family actually brings. An Indian outpatient consultation
// is minutes long, and the realistic artefact is a single sheet a daughter can
// hand across a desk.
//
// ─── What it must never contain ───
//
// No diagnosis. No stage. No interpretation. No score. It is a DATA SUMMARY,
// and prd.md 2 draws that line: we show change against a person's own earlier
// results and hand the reading to a doctor. The disclaimer is on the page, in
// full, for the same reason it is on the dashboard.
//
// The PDF is assembled by hand rather than with a library. rules.md 3 does not
// list a PDF dependency, and a one-page text-and-lines document is a few hundred
// bytes of PDF syntax — cheaper than an approval and with nothing to audit.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// A4 at 72 dpi.
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 48

const DISCLAIMER =
  'Xorai is not a diagnostic tool and does not diagnose, stage, or treat dementia. ' +
  'It provides cognitive engagement activities and shows changes in performance over time. ' +
  "Any concern about a person's memory or thinking should be discussed with a qualified doctor."

Deno.serve(async (req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  try {
    const { patient_id: patientId, days = 90 } = (await req.json()) as {
      patient_id: string
      days?: number
    }
    if (!patientId) return json({ ok: false, error: 'patient_id required' }, 400)

    const pdf = await buildReport(supabase, patientId, days)

    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="xorai-summary.pdf"`,
      },
    })
  } catch (error) {
    console.error('[export-pdf]', error instanceof Error ? error.message : String(error))
    return json({ ok: false, error: 'export_failed' }, 500)
  }
})

async function buildReport(
  supabase: SupabaseClient,
  patientId: string,
  days: number,
): Promise<Uint8Array> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

  const { data: patient } = await supabase
    .from('patients')
    .select('display_name,birth_year,education_level,baseline_status')
    .eq('id', patientId)
    .single()

  const { data: daily } = await supabase
    .from('v_daily_domain_score')
    .select('domain,day,accuracy')
    .eq('patient_id', patientId)
    .gte('day', since)
    .order('day', { ascending: true })

  const { data: calendar } = await supabase
    .from('v_session_calendar')
    .select('day,played')
    .eq('patient_id', patientId)
    .gte('day', since)

  const { data: flags } = await supabase
    .from('flags')
    .select('domain,level,window_start,window_end,suppressed_reason')
    .eq('patient_id', patientId)
    .is('acknowledged_at', null)

  const p = (patient ?? {}) as {
    display_name?: string
    birth_year?: number | null
    education_level?: string | null
    baseline_status?: string
  }

  const calendarRows = (calendar ?? []) as { day: string; played: boolean }[]
  const adherence =
    calendarRows.length > 0
      ? Math.round((calendarRows.filter((d) => d.played).length / calendarRows.length) * 100)
      : 0

  const byDomain = new Map<string, { day: string; accuracy: number }[]>()
  for (const row of (daily ?? []) as { domain: string; day: string; accuracy: number }[]) {
    const list = byDomain.get(row.domain) ?? []
    list.push({ day: row.day, accuracy: row.accuracy })
    byDomain.set(row.domain, list)
  }

  const ops: string[] = []
  let y = PAGE_H - MARGIN

  const text = (value: string, size: number, font: 'F1' | 'F2' = 'F1', dy = 0) => {
    y -= dy
    ops.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${MARGIN} ${y} Tm (${escape(value)}) Tj ET`,
    )
  }

  text('Xorai — activity summary', 18, 'F2')
  y -= 8
  rule(ops, y)

  const age = p.birth_year ? `${new Date().getFullYear() - p.birth_year}` : 'not recorded'
  text(`${p.display_name ?? 'Patient'}`, 13, 'F2', 26)
  text(`Age ${age}   ·   Schooling: ${p.education_level ?? 'not recorded'}`, 10, 'F1', 16)
  text(`Period: ${since} to ${new Date().toISOString().slice(0, 10)}`, 10, 'F1', 14)
  text(`Sessions played on ${adherence}% of days in this period`, 10, 'F1', 14)

  // ── sparklines, one per domain ──
  y -= 18
  text('Activity over time', 12, 'F2')
  y -= 6

  for (const [domain, series] of byDomain) {
    if (series.length < 2) continue
    y -= 42
    ops.push(`BT /F1 9 Tf 1 0 0 1 ${MARGIN} ${y + 14} Tm (${escape(domain)}) Tj ET`)
    sparkline(ops, series.map((s) => s.accuracy), MARGIN + 110, y, 320, 28)
  }

  // ── flags, in the exact dashboard wording ──
  y -= 34
  text('Points a doctor may want to know about', 12, 'F2')

  const active = (flags ?? []) as {
    domain: string
    level: string
    window_start: string
    window_end: string
    suppressed_reason: string | null
  }[]

  if (active.length === 0) {
    text('Nothing stands out in this period.', 10, 'F1', 16)
  } else {
    for (const flag of active) {
      // The same sentence as the dashboard. Not a summary of it, and not a
      // stronger version of it for a clinical reader.
      const line =
        flag.level === 'effort'
          ? 'Fewer sessions finished and fewer answers given. Often about mood or tiredness rather than memory.'
          : `${cap(flag.domain)} scores have been lower than usual for the past two weeks. This can happen for many reasons — illness, poor sleep, a change in medication, or low mood.`
      text(`${flag.window_start} to ${flag.window_end}`, 9, 'F2', 18)
      for (const wrapped of wrap(line, 96)) text(wrapped, 10, 'F1', 13)
      if (flag.suppressed_reason) {
        text(`(Not read into: ${flag.suppressed_reason.replace(/_/g, ' ')})`, 9, 'F1', 12)
      }
    }
  }

  // ── the disclaimer, in full, at the foot ──
  y = MARGIN + 64
  rule(ops, y + 14)
  for (const line of wrap(DISCLAIMER, 100)) {
    ops.push(`BT /F1 8 Tf 1 0 0 1 ${MARGIN} ${y} Tm (${escape(line)}) Tj ET`)
    y -= 11
  }

  return assemble(ops.join('\n'))
}

/** A sparkline as a polyline. No axes, no numbers — shape only. */
function sparkline(ops: string[], values: number[], x: number, y: number, w: number, h: number) {
  if (values.length < 2) return
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1

  ops.push('q 0.18 0.27 0.20 RG 1.2 w')
  values.forEach((value, i) => {
    const px = x + (i / (values.length - 1)) * w
    const py = y + ((value - min) / span) * h
    ops.push(`${px.toFixed(1)} ${py.toFixed(1)} ${i === 0 ? 'm' : 'l'}`)
  })
  ops.push('S Q')
}

function rule(ops: string[], y: number) {
  ops.push(`q 0.87 0.89 0.87 RG 0.8 w ${MARGIN} ${y} m ${PAGE_W - MARGIN} ${y} l S Q`)
}

function wrap(value: string, width: number): string[] {
  const words = value.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if ((line + word).length > width) {
      lines.push(line.trim())
      line = ''
    }
    line += `${word} `
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

function cap(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ')
}

/** PDF strings escape backslash and both parens, and are Latin-1. */
function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, (ch) => (ch === '—' ? '-' : ch === '·' ? '-' : "'"))
}

/** Minimal single-page PDF: catalog, pages, page, content, two base-14 fonts. */
function assemble(content: string): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ]

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })

  const xrefAt = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`

  return new TextEncoder().encode(pdf)
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
