#!/usr/bin/env node
/**
 * COSTO DEL BRAZO DE VIDEO · tabla por modelo/resolución/duración leída de `/estimate` de Higgsfield (GRATIS: no crea pedidos, no gasta).
 * Uso: doppler run -p zero-risk -c prd -- node scripts/ops/video-costo.mjs [segundos=8,15] [relacion=9:16]
 * La llave (HIGGSFIELD_API_KEY_V2) nunca se imprime. Las tarifas son «antes de cualquier descuento del cliente» (texto del proveedor).
 */
const llave = process.env.HIGGSFIELD_API_KEY_V2
if (!llave) { console.error('falta HIGGSFIELD_API_KEY_V2 en el entorno'); process.exit(1) }
const segundos = (process.argv[2] || '8,15').split(',').map(Number)
const relacion = process.argv[3] || '9:16'

const num = (s) => Number(s.replace(/[$,]/g, ''))
function leerTarifas(t) {
  t = t.replace(/\s+/g, ' ')
  const m25 = t.match(/Each 1,000 video tokens costs \$([\d.]+) at 480p or 720p and \$([\d.]+) at 1080p/)
  if (m25) return { '480p': num(m25[1]), '720p': num(m25[1]), '1080p': num(m25[2]) }
  const m20 = t.match(/(?:without video input — |Per 1,000 video tokens: )480p\/720p\/1080p \$([\d.]+), 4K \$([\d.]+)/)
  if (m20) return { '480p': num(m20[1]), '720p': num(m20[1]), '1080p': num(m20[1]), '4k': num(m20[2]) }
  return null
}
function dimensiones(res, rel) {
  const corto = { '480p': 480, '720p': 720, '1080p': 1080, '4k': 2160 }[res]
  const [a, b] = rel.split(':').map(Number)
  const par = (x) => Math.round(x / 2) * 2
  return a >= b ? { ancho: par((corto * a) / b), alto: corto } : { ancho: corto, alto: par((corto * b) / a) }
}
const costo = (tarifa, res, s) => { const d = dimensiones(res, relacion); return (Math.ceil((d.alto * d.ancho * s * 24) / 1024) / 1000) * tarifa }

const modelos = ['bytedance/seedance-2.5/text-to-video', 'bytedance/seedance-2.0/text-to-video']
for (const m of modelos) {
  const r = await fetch(`https://api.higgsfield.ai/estimate/${m}`, { method: 'POST', headers: { Authorization: `Key ${llave}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'estimación', duration: segundos[0], resolution: '1080p', aspect_ratio: relacion, generate_audio: true }) })
  const j = await r.json().catch(() => ({}))
  console.log(`\n## ${m} · HTTP ${r.status} · correlación ${r.headers.get('x-correlation-id')}`)
  if (typeof j.usd !== 'undefined') { console.log(`la API devolvió un número directo: US$ ${j.usd}`); continue }
  const t = j.pricing_description ? leerTarifas(j.pricing_description) : null
  if (!t) { console.log('no pude leer las tarifas:', JSON.stringify(j).slice(0, 400)); continue }
  console.log(`tarifas por 1.000 tokens: ${JSON.stringify(t)} · relación ${relacion}`)
  console.log('| resolución | ' + segundos.map((s) => `${s} s`).join(' | ') + ' |')
  for (const res of Object.keys(t)) console.log(`| ${res} | ` + segundos.map((s) => `US$ ${costo(t[res], res, s).toFixed(2)}`).join(' | ') + ' |')
}
