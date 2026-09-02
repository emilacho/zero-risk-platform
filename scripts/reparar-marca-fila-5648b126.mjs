#!/usr/bin/env node
/**
 * REPARACIÓN DE UNA (1) FILA · la marca del veredicto de GoEuropeAdventure.
 *
 * Aprobado por Emilio · 2026-09-02 · "es leer historia, no deducirla".
 *
 * QUÉ PASÓ · la corrida 118856 del cimiento (01-sep) mandó `gate_outcome: "paso_la_vara"`
 * y el escritor PUBLICADO en ese momento era el anterior a la pieza (e): aceptó la marca,
 * la descartó y devolvió `persisted: true`. La fila quedó vacía. Publicado el escritor
 * (PR #328 · 02-sep), la fila NO se cura sola: ya existe, así que la próxima corrida sale
 * por el corte de idempotencia sin volver a escribirla.
 *
 * POR QUÉ ESTO NO ES RELLENO HACIA ATRÁS · la migración 202608281400 prohíbe expreso
 * inferir el veredicto de las filas viejas ("reescribir historia con una deducción").
 * Acá no se infiere nada: la marca se LEE de la corrida que escribió esa misma fila, en
 * vivo, y el guion se niega a escribir si esa lectura no cierra. Las 5 filas anteriores
 * al corte siguen en nulo y así se quedan: a esas nadie les mandó marca.
 *
 * QUÉ NO TOCA · `content_text` queda como lo dejó el escritor viejo (sin las claves
 * gate_outcome/gate_nota). Esa ausencia es la HUELLA que permite distinguir "escribió el
 * escritor viejo" de "el cuerpo llegó sin marca" — la compuerta la usa para diagnosticar.
 * Borrarla sería tapar la evidencia del propio defecto.
 *
 *   node scripts/reparar-marca-fila-5648b126.mjs            (muestra y NO escribe)
 *   node scripts/reparar-marca-fila-5648b126.mjs --escribir (repara)
 *
 * Sale 0 reparada (o ya estaba) · 1 se negó (la evidencia no cierra) · 2 no pudo medir.
 */
import { readFileSync } from 'node:fs'

const FILA = '5648b126-7b0c-4cb1-b5b4-90a3165c864f'
const CORRIDA = '118856'
const FLUJO = 'ssLtwYPt7zxuvnM2'
const ESCRIBIR = process.argv.includes('--escribir')

function deEnv(key) {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const line = raw.split('\n').find((l) => l.startsWith(`${key}=`))
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch { return undefined }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? deEnv('NEXT_PUBLIC_SUPABASE_URL')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? deEnv('SUPABASE_SERVICE_ROLE_KEY')
const n8nUrl = (process.env.N8N_BASE_URL ?? deEnv('N8N_BASE_URL') ?? '').replace(/\/$/, '')
const n8nKey = process.env.N8N_API_KEY ?? deEnv('N8N_API_KEY')
if (!url || !key || !n8nUrl || !n8nKey) {
  console.error('✗ faltan credenciales · Supabase + n8n · no se puede confirmar la evidencia')
  process.exit(2)
}
const sb = { apikey: key, Authorization: `Bearer ${key}` }

// ── 1 · la fila, como está hoy ────────────────────────────────────────────────
const rf = await fetch(`${url}/rest/v1/client_brand_books?id=eq.${FILA}&select=id,client_id,created_at,gate_outcome,content_text`, { headers: sb })
if (!rf.ok && rf.status !== 206) { console.error(`✗ la base no contesta · HTTP ${rf.status}`); process.exit(2) }
const filas = await rf.json()
if (filas.length !== 1) { console.error(`✗ se esperaba 1 fila · llegaron ${filas.length}`); process.exit(1) }
const fila = filas[0]
console.log(`fila ${fila.id} · cliente ${fila.client_id} · ${fila.created_at}`)
console.log(`  marca hoy: ${JSON.stringify(fila.gate_outcome)}`)
if (fila.gate_outcome !== null && fila.gate_outcome !== undefined) {
  console.log('✓ la fila YA lleva marca · no hay nada que reparar (el guion no pisa nada)')
  process.exit(0)
}

// ── 2 · la evidencia · la corrida que escribió ESTA fila ──────────────────────
const re = await fetch(`${n8nUrl}/api/v1/executions/${CORRIDA}?includeData=true`, { headers: { 'X-N8N-API-KEY': n8nKey, accept: 'application/json' } })
if (!re.ok) { console.error(`✗ no se pudo leer la corrida ${CORRIDA} · HTTP ${re.status} · sin evidencia NO se escribe`); process.exit(2) }
const ex = await re.json()
if (String(ex.workflowId) !== FLUJO) { console.error(`✗ la corrida ${CORRIDA} no es del flujo del cimiento (${ex.workflowId})`); process.exit(1) }
const run = ex.data?.resultData?.runData ?? {}
const salida = (n) => run[n]?.[0]?.data?.main?.[0]?.[0]?.json
const marcaDeLaCorrida = salida('[BB] Promote prep')?.promote_body?.gate_outcome
const reciboDeLaCorrida = salida('[BB] Promote → canon')

console.log(`evidencia · corrida ${CORRIDA} (${ex.startedAt} → ${ex.stoppedAt})`)
console.log(`  [BB] Promote prep    mandó: ${JSON.stringify(marcaDeLaCorrida)}`)
console.log(`  [BB] Promote → canon recibió id: ${JSON.stringify(reciboDeLaCorrida?.id)}`)

// las dos negativas · sin las dos, esto sería una deducción
if (reciboDeLaCorrida?.id !== FILA) {
  console.error('✗ el recibo de esa corrida NO apunta a esta fila · la evidencia no cierra · NO se escribe')
  process.exit(1)
}
if (marcaDeLaCorrida !== 'paso_la_vara' && marcaDeLaCorrida !== 'salio_al_tope') {
  console.error(`✗ la corrida no mandó una marca reconocible (${JSON.stringify(marcaDeLaCorrida)}) · NO se escribe`)
  process.exit(1)
}

if (!ESCRIBIR) {
  console.log(`\n(seco) escribiría gate_outcome = ${JSON.stringify(marcaDeLaCorrida)} · correr con --escribir`)
  process.exit(0)
}

// ── 3 · la escritura · una fila, una columna ─────────────────────────────────
const rp = await fetch(`${url}/rest/v1/client_brand_books?id=eq.${FILA}&gate_outcome=is.null`, {
  method: 'PATCH',
  headers: { ...sb, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ gate_outcome: marcaDeLaCorrida }),
})
if (!rp.ok) { console.error(`✗ la escritura falló · HTTP ${rp.status} · ${(await rp.text()).slice(0, 300)}`); process.exit(1) }
const despues = await rp.json()
if (despues.length !== 1) { console.error(`✗ se tocaron ${despues.length} filas · se esperaba 1`); process.exit(1) }
console.log(`✓ reparada · gate_outcome = ${JSON.stringify(despues[0].gate_outcome)} · 1 fila · 1 columna`)
