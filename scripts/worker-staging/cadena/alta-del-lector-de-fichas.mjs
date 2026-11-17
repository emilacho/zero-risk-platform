/**
 * ALTA DEL LECTOR DE LAS FICHAS en n8n · Sprint 4 · A entrega 2 · CC#3 · 17-nov
 *
 *   doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/alta-del-lector-de-fichas.mjs              → plan (no escribe nada)
 *   doppler run -p zero-risk -c prd -- node scripts/worker-staging/cadena/alta-del-lector-de-fichas.mjs --ejecutar   → crea y parcha
 *
 * 🔴 SOLO con el 🟢 del certificador, el GO de Lenovo, la migración 202611172300 YA aplicada y n8n 0/0.
 * Orden (cada paso verifica el anterior):
 *   1 · la puerta viva es IGUAL al respaldo `puerta-s4-fichas-ANTES.json` (si cambió, no se sigue: rehacer el respaldo y el parche)
 *   2 · crea el sub-flujo «cadena · fichas» (o reusa el de un alta a medias, si es idéntico) y lo PUBLICA: n8n no deja que la puerta publicada llame a un sub-flujo sin publicar
 *   3 · imprime el SQL que suma su id a `cadena_config.flujos` (sin eso la ruta responde 403 y el lector no corre · NO se aplica aquí)
 *   4 · parcha la puerta con `construir-s4-fichas-puerta.mjs` y la verifica nodo por nodo
 * Si un paso falla DESPUÉS de tocar la puerta, el motor la restaura solo al respaldo y dice si lo logró (salida 3 = restaurada · 4 = NO restaurada).
 * REVERSA: `node scripts/ops/n8n-flujo.mjs restaurar pBAp5Cx7R39U585i scripts/worker-staging/cadena/puerta-s4-fichas-ANTES.json --ejecutar` y quitar el id de `cadena_config.flujos`.
 * Las llaves vienen del entorno (Doppler): este guion no las imprime ni las guarda.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { construirFlujos } from './construir.mjs'
import { construirFlujo as conLector } from './construir-s4-fichas-puerta.mjs'
import { altaDelLector } from './alta-del-lector-motor.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const ejecutar = process.argv.includes('--ejecutar')
const BASE = process.env.N8N_BASE_URL?.replace(/\/$/, ''), KEY = process.env.N8N_API_KEY
if (!BASE || !KEY) { console.error('faltan N8N_BASE_URL / N8N_API_KEY en el entorno (correr con doppler run)'); process.exit(2) }
const H = { 'X-N8N-API-KEY': KEY, 'content-type': 'application/json' }
const api = async (m, p, body) => {
  const r = await fetch(BASE + '/api/v1' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${typeof j === 'string' ? j.slice(0, 200) : JSON.stringify(j).slice(0, 200)}`)
  return j
}
const ID_PUERTA = 'pBAp5Cx7R39U585i'
const ANTES = JSON.parse(fs.readFileSync(path.join(AQUI, 'puerta-s4-fichas-ANTES.json'), 'utf8'))

// la lógica vive en el motor (probado con un n8n simulado: `__tests__/alta-del-lector-motor.test.ts`); aquí solo el entorno y la salida
const r = await altaDelLector({ api, ANTES, sub: construirFlujos()['cadena-fichas'], conLector, idPuerta: ID_PUERTA, ejecutar })
for (const l of r.lineas) console.log(l)
if (r.sql) console.log(`\n3 · SQL para sumar su id a la lista de flujos autorizados (NO se aplicó · aplicarlo ANTES de que corra una campaña):\n\n${r.sql}\n`)
if (r.estado === 'plan') console.log('\n(plan solamente: no se creó nada · agregar --ejecutar)')
if (r.estado === 'frenado') { console.error(`🔴 no se sigue (no se escribió nada): ${r.motivo}`); process.exitCode = 1 }
if (r.estado === 'fallido') { console.error(`🔴 falló: ${r.motivo}`); process.exitCode = r.restaurada === false ? 4 : 3 }
if (r.estado === 'hecho') fs.writeFileSync(path.join(AQUI, 'lector-de-fichas-creado.json'), JSON.stringify({ fichas: r.idFichas, puerta: ID_PUERTA, fecha: new Date().toISOString() }, null, 1))
await new Promise((x) => setTimeout(x, 100))
