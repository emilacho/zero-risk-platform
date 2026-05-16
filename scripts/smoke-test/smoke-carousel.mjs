#!/usr/bin/env node
/**
 * Carousel-engine smoke test
 *
 * POSTs the Náufrago v1 5-slide Instagram-feed cascade against
 *   /api/carousel/generate
 * and verifies:
 *   - 200 OK
 *   - `slide_urls` is an array of length 5
 *   - `width` = 1080 · `height` = 1350
 *   - every URL is reachable (HEAD 200) and returns content-type image/png
 *
 * Usage:
 *   node scripts/smoke-test/smoke-carousel.mjs
 *   node scripts/smoke-test/smoke-carousel.mjs --dry-run
 *   node scripts/smoke-test/smoke-carousel.mjs --endpoint=https://...
 *   node scripts/smoke-test/smoke-carousel.mjs --platform=tiktok
 *
 * Requires (unless --dry-run): INTERNAL_API_KEY in .env.local
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')

const args = process.argv.slice(2)
const FLAGS = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const eq = a.indexOf('=')
      return eq < 0 ? [a.slice(2), true] : [a.slice(2, eq), a.slice(eq + 1)]
    }),
)
const DRY = !!FLAGS['dry-run']
const PLATFORM = (FLAGS.platform || 'instagram-feed')

function loadEnv() {
  const envPath = resolve(ROOT, '.env.local')
  if (!existsSync(envPath)) return {}
  const env = {}
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1)
  }
  return env
}

// Embed the Náufrago brand v1 cascade inline so the smoke is self-contained
// and survives even when run before the package is built / installed.
const naufragoBody = {
  client_slug: 'naufrago',
  platform: PLATFORM,
  carousel_id: `naufrago-v1-smoke-${new Date().toISOString().slice(0, 10)}`,
  brand: {
    logo_url: null,
    colors: {
      primary: '#0b3d2e',
      secondary: '#13573f',
      accent: '#f5b800',
      text_on_primary: '#f5f5f0',
      text_on_surface: '#0b3d2e',
      surface: '#f5f5f0',
    },
    fonts: { family: 'Inter', headline_family: 'Inter' },
    brand_handle: '@zerorisk.ec',
  },
  slides: [
    {
      eyebrow: 'Industria · Ecuador',
      headline: 'Tu consultoría de seguridad no te va a salvar de la multa',
      body: 'El 73 % de las empresas con auditoría al día reciben multa dentro del año siguiente.',
      cta: 'Agendá tu diagnóstico',
    },
    {
      eyebrow: 'Parte 2',
      headline: 'La consultoría tradicional está diseñada para entregarse, no para implementarse',
      body: 'PDF de 80 páginas · firma · archivo. Seis meses después: ministerio en la puerta.',
    },
    {
      eyebrow: 'Parte 3',
      headline: 'Diagnóstico operativo · entregables vivos · 90 días de soporte',
      body: 'Dashboard de cumplimiento + hoja de ruta priorizada + canal directo con el equipo técnico.',
    },
    {
      eyebrow: 'Parte 4',
      headline: 'Caso · 4 plantas industriales · 0 multas en 14 meses',
      body: 'Sin reemplazar a tu consultoría actual · trabajamos en paralelo y cerramos los gaps que ellos no ven.',
    },
    {
      eyebrow: 'Cierre',
      headline: 'Hablemos esta semana',
      body: '15 minutos · sin compromiso · te muestro qué encontraríamos en tu planta.',
      cta: 'Reservá tu sesión',
    },
  ],
}

async function main() {
  console.log('▶ Carousel smoke · Náufrago v1 cascade')
  console.log(`  platform   : ${PLATFORM}`)
  console.log(`  slides     : ${naufragoBody.slides.length}`)
  console.log(`  carousel_id: ${naufragoBody.carousel_id}`)
  console.log('')

  if (DRY) {
    console.log('— dry-run · not invoking endpoint —')
    process.exit(0)
  }

  const env = loadEnv()
  const apiKey = env.INTERNAL_API_KEY
  if (!apiKey) {
    console.error('✗ INTERNAL_API_KEY missing from .env.local. Run with --dry-run to inspect the fixture.')
    process.exit(2)
  }
  const endpoint =
    FLAGS.endpoint ||
    env.VERCEL_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    'https://zero-risk-platform.vercel.app'
  console.log(`  endpoint   : ${endpoint}`)

  const t0 = Date.now()
  const res = await fetch(`${endpoint}/api/carousel/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify(naufragoBody),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { _parse_error: text.slice(0, 500) }
  }
  const dt = Date.now() - t0
  console.log(`  http       : ${res.status} · ${dt}ms`)

  const expectedSize = {
    'instagram-feed': { w: 1080, h: 1350 },
    'instagram-reel': { w: 1080, h: 1920 },
    'tiktok':         { w: 1080, h: 1920 },
    'facebook-feed':  { w: 1200, h: 630 },
    'twitter-card':   { w: 1200, h: 675 },
  }[PLATFORM]

  const checks = []
  checks.push({ name: 'http=200',           pass: res.status === 200 })
  checks.push({ name: 'has carousel_id',    pass: !!json?.carousel_id })
  checks.push({ name: 'slide_urls length=5', pass: Array.isArray(json?.slide_urls) && json.slide_urls.length === 5 })
  checks.push({ name: `width=${expectedSize?.w}`,  pass: json?.width === expectedSize?.w })
  checks.push({ name: `height=${expectedSize?.h}`, pass: json?.height === expectedSize?.h })
  checks.push({ name: 'thumbnail_url present', pass: !!json?.thumbnail_url })
  checks.push({ name: 'timings_ms array',     pass: Array.isArray(json?.timings_ms) && json.timings_ms.length === 5 })

  // HEAD-probe each slide URL when present
  if (Array.isArray(json?.slide_urls)) {
    for (const [i, url] of json.slide_urls.entries()) {
      try {
        const head = await fetch(url, { method: 'HEAD' })
        const ct = head.headers.get('content-type') || ''
        checks.push({ name: `slide ${i + 1} HEAD 200`,     pass: head.status === 200 })
        checks.push({ name: `slide ${i + 1} is image/png`, pass: ct.includes('image/png') })
      } catch (err) {
        checks.push({ name: `slide ${i + 1} fetch`, pass: false, detail: String(err?.message || err) })
      }
    }
  }

  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ` · ${c.detail}` : ''}`)
  }
  const failed = checks.filter((c) => !c.pass)

  // Report
  const OUT_DIR = resolve(__dirname, 'out')
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const report = `# Carousel smoke · ${naufragoBody.carousel_id} · ${stamp}

Endpoint · \`${endpoint}\`
Platform · \`${PLATFORM}\`
HTTP · \`${res.status}\` · \`${dt}ms\`

## Checks
${checks.map((c) => `- ${c.pass ? '✓' : '✗'} ${c.name}${c.detail ? ` · ${c.detail}` : ''}`).join('\n')}

## Response body (first 4 KB)

\`\`\`json
${JSON.stringify(json, null, 2).slice(0, 4096)}
\`\`\`
`
  const outPath = resolve(OUT_DIR, `carousel-${stamp}.md`)
  writeFileSync(outPath, report, 'utf-8')
  console.log('')
  console.log(`📄 Report: ${outPath}`)

  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('💥 Fatal:', err)
  process.exit(1)
})
