#!/usr/bin/env node
/**
 * COMPUERTA · ¿la marca del veredicto ATERRIZA en la fila?
 *
 * No vale "ya está en la rama": esto le pregunta a la BASE, que es donde la marca
 * tenía que quedar. La prueba (e.5) del Sprint B estaba VERDE en la laptop mientras
 * producción escribía nulo — probaba la función del repositorio, no la que corre.
 * Este archivo es el instrumento que faltaba.
 *
 *   node scripts/compuerta-marca-del-veredicto.mjs
 *
 * Sale 0 · toda fila escrita DESPUÉS de que el flujo empezó a mandar la marca la lleva
 * Sale 1 · hay filas nuevas con la marca en nulo → el escritor publicado la descarta
 * Sale 2 · no se pudo medir (sin credenciales · la tabla no responde) · "no pude medir"
 *          NUNCA se disfraza de "dio cero" (mismo criterio que el canario de nulos)
 *
 * EL CORTE · 2026-08-28T20:36:50Z · momento en que el flujo del cimiento
 * (ssLtwYPt7zxuvnM2) quedó publicado con la pieza (e) y empezó a mandar `gate_outcome`
 * en el cuerpo. Las filas ANTERIORES están en nulo con razón: nadie les mandó marca.
 * No se rellenan hacia atrás (ver la migración 202608281400).
 *
 * LÍNEA BASE MEDIDA 2026-09-01 · 6 filas · 5 antes del corte · 1 después:
 *   5648b126-7b0c-4cb1-b5b4-90a3165c864f · GoEuropeAdventure · 20:29:11Z · gate_outcome NULL
 *   su corrida (n8n 118856) mandó `gate_outcome: "paso_la_vara"` y recibió persisted:true
 *   ⇒ ROJO de 1 fila. Cualquier valor > 0 es señal, no ruido.
 *
 * Sólo lectura · no escribe nada · $0.
 */
import { readFileSync } from 'node:fs'

const CORTE = '2026-08-28T20:36:50Z'

function fromEnvFile(key) {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const line = raw.split('\n').find((l) => l.startsWith(`${key}=`))
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : undefined
  } catch {
    return undefined
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fromEnvFile('NEXT_PUBLIC_SUPABASE_URL')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fromEnvFile('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('✗ faltan credenciales · NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  process.exit(2)
}
const headers = { apikey: key, Authorization: `Bearer ${key}` }

// Control · la tabla contesta. Sin esto, un 42703 se confundiría con "la base está caída".
const control = await fetch(`${url}/rest/v1/client_brand_books?select=id&limit=1`, { headers })
if (!control.ok && control.status !== 206) {
  console.error(`✗ la tabla no responde · HTTP ${control.status} · compuerta NO concluyente`)
  process.exit(2)
}

// (1) la columna tiene que existir · si no, no hay dónde aterrizar
const col = await fetch(`${url}/rest/v1/client_brand_books?select=gate_outcome&limit=1`, { headers })
if (!col.ok && col.status !== 206) {
  const b = await col.json().catch(() => null)
  if (b?.code === '42703') {
    console.error('✗ la columna `gate_outcome` NO existe (42703)')
    console.error('  → aplicar · supabase/migrations/202608281400_client_brand_books_gate_outcome.sql')
    process.exit(1)
  }
  console.error(`✗ respuesta inesperada · HTTP ${col.status} · ${JSON.stringify(b)}`)
  process.exit(2)
}

// (2) toda fila posterior al corte tiene que llevar marca
const sel = 'id,client_id,created_at,gate_outcome,content_text'
const res = await fetch(
  `${url}/rest/v1/client_brand_books?select=${sel}&order=created_at.asc`,
  { headers },
)
if (!res.ok && res.status !== 206) {
  console.error(`✗ no se pudo leer la tabla · HTTP ${res.status} · compuerta NO concluyente`)
  process.exit(2)
}
const filas = await res.json()
const antes = filas.filter((f) => f.created_at < CORTE)
const despues = filas.filter((f) => f.created_at >= CORTE)
const sinMarca = despues.filter((f) => f.gate_outcome === null || f.gate_outcome === undefined)

console.log(`filas: ${filas.length} · ${antes.length} antes del corte (${CORTE}) · ${despues.length} después`)

if (sinMarca.length === 0) {
  console.log(`✓ ${despues.length} de ${despues.length} filas escritas después del corte llevan la marca del veredicto`)
  process.exit(0)
}

console.error(`✗ ${sinMarca.length} de ${despues.length} filas nuevas SIN marca · el escritor publicado la descarta`)
for (const f of sinMarca) {
  // la huella que distingue "escritor viejo" de "cuerpo sin marca": el escritor de la
  // pieza (e) escribe la clave en nulo explícito; el anterior no la escribe nunca.
  let claves = []
  try { claves = Object.keys(JSON.parse(f.content_text || '{}')) } catch { claves = ['(texto ilegible)'] }
  const tieneClave = claves.includes('gate_outcome')
  console.error(`  · ${f.id} · cliente ${f.client_id} · ${f.created_at}`)
  console.error(
    `    content_text ${tieneClave ? 'SÍ' : 'NO'} trae la clave gate_outcome ⇒ ` +
      (tieneClave
        ? 'escritor de la pieza (e) publicado · el cuerpo llegó sin marca (mirar el flujo)'
        : 'escribió el escritor ANTERIOR a la pieza (e) · falta publicar el código'),
  )
}
console.error('  → publicar `src/app/api/brand-book/[clientId]/route.ts` con la pieza (e)')
process.exit(1)
