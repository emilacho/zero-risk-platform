#!/usr/bin/env node
/**
 * COMPUERTA H1.2 · C1 del Consejero · correr ANTES de publicar PR #318.
 *
 * No vale "ya corrimos la migración": esto le pregunta a la base.
 *
 * El endpoint del manual pasa a insertar `positioning` en la fila. Si la columna
 * no existe, el INSERT falla con 42703 y NINGÚN manual se persiste. Esta compuerta
 * es lo único que separa "publicamos en orden" de "publicamos y se corta".
 *
 *   node scripts/gate-h1-2-columna-positioning.mjs
 *
 * Sale 0 · la columna existe    → se puede publicar
 * Sale 1 · la columna NO existe → aplicar primero la migración
 *          supabase/migrations/202608201200_client_brand_books_positioning.sql
 *
 * Sólo lectura · no escribe nada · $0.
 */
import { readFileSync } from 'node:fs'

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

// Control · prueba que la consulta llega y la tabla responde. Sin esto, un 42703
// podría confundirse con "la base no contesta" y la compuerta mentiría.
const control = await fetch(`${url}/rest/v1/client_brand_books?select=id&limit=1`, { headers })
if (!control.ok && control.status !== 206) {
  console.error(`✗ la tabla no responde · HTTP ${control.status} · compuerta NO concluyente`)
  process.exit(2)
}

const res = await fetch(`${url}/rest/v1/client_brand_books?select=positioning&limit=1`, { headers })
const body = await res.json().catch(() => null)

if (res.ok || res.status === 206) {
  console.log('✓ la columna `positioning` EXISTE en client_brand_books · se puede publicar')
  process.exit(0)
}

if (body?.code === '42703') {
  console.error('✗ la columna `positioning` NO existe (42703)')
  console.error('  → aplicar PRIMERO · supabase/migrations/202608201200_client_brand_books_positioning.sql')
  console.error('  → publicar el código sin la columna CORTA la escritura de manuales')
  process.exit(1)
}

console.error(`✗ respuesta inesperada · HTTP ${res.status} · ${JSON.stringify(body)}`)
process.exit(2)
