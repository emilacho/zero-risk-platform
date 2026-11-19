/**
 * VARIAS CAMPAÑAS POR CLIENTE · entrega 2 · la PUERTA de la cadena (`pBAp5Cx7R39U585i`) le pasa a la apertura QUÉ campaña · CC1 · 19-nov
 * (firma de Emilio 21:16 Zúrich · GO de Lenovo a CC1 · lo esencial para la prueba)
 *
 *   node scripts/worker-staging/cadena/construir-varias-campanas-puerta.mjs   → escribe puerta-varias-campanas-DESPUES.json desde el respaldo ANTES
 *
 * Qué cambia (y SOLO esto, dos nodos):
 *   · `⓪ Llave y origen`: además de `campana_id` (que ya leía), lee `llave_de_campana` y `nombre_de_campana` del sobre (texto o null);
 *   · `1 · Abrir campaña`: el cuerpo a `/api/cadena/campanas` (acción `abrir`) lleva `campana_id`, `llave_de_campana` y `nombre_de_campana`.
 * Por qué: el reintento y la reapertura ya mandan `payload.campana_id` (`campanas.ts`, `sobreDeReintento` / `reabrirCampana`), pero la puerta lo perdía y la
 * apertura buscaba por (cliente, plan): con dos campañas en el mismo plan retomaba la que no era. La campaña nueva de la prueba nace con su llave.
 * Con el código de antes de #1243 los dos campos se ignoran: la puerta se comporta igual que hoy.
 *
 * Aplicar (con ABRE, n8n 0/0): `diferencia` vivo = ANTES · `restaurar … DESPUES --ejecutar` · `diferencia` vivo = DESPUES.
 * REVERSA: `node scripts/ops/n8n-flujo.mjs restaurar pBAp5Cx7R39U585i scripts/worker-staging/cadena/puerta-varias-campanas-ANTES.json --ejecutar`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
export const ANTES = path.join(AQUI, 'puerta-varias-campanas-ANTES.json')
export const DESPUES = path.join(AQUI, 'puerta-varias-campanas-DESPUES.json')

export const LLAVE_VIEJA = "    campana_id: typeof body.campana_id === 'string' ? body.campana_id : null,\n"
export const LLAVE_NUEVA = LLAVE_VIEJA + "    // 19-nov · varias campañas: la campaña NUEVA nace con su llave y su nombre (la apertura los valida); sin llave, nace del plan como siempre\n    llave_de_campana: typeof body.llave_de_campana === 'string' ? body.llave_de_campana : null,\n    nombre_de_campana: typeof body.nombre_de_campana === 'string' ? body.nombre_de_campana : null,\n"
export const ABRIR_VIEJO = 'plan_id: $json.plan_id, seco: $json.dry_run,'
export const ABRIR_NUEVO = 'plan_id: $json.plan_id, campana_id: $json.campana_id, llave_de_campana: $json.llave_de_campana, nombre_de_campana: $json.nombre_de_campana, seco: $json.dry_run,'

/** cambia `viejo` por `nuevo` en el texto; tiene que estar UNA sola vez (si no, el respaldo no es el que se espera y no se sigue) */
function unaVez(texto, viejo, nuevo, donde) {
  const n = texto.split(viejo).length - 1
  if (n !== 1) throw new Error(`${donde}: esperaba el texto una vez y está ${n} (¿cambió la puerta viva? rehacer el respaldo)`)
  return texto.replace(viejo, () => nuevo)
}

/** pura: del flujo ANTES (tal como lo devuelve la API) al DESPUES. No toca nada más que los dos nodos. */
export function construirPuerta(antes) {
  const f = structuredClone(antes)
  const nodo = (nombre) => { const x = f.nodes.filter((n) => n.name === nombre); if (x.length !== 1) throw new Error(`nodo «${nombre}»: hay ${x.length}`); return x[0] }
  const llave = nodo('⓪ Llave y origen')
  llave.parameters.jsCode = unaVez(String(llave.parameters.jsCode).replace(/\r\n/g, '\n'), LLAVE_VIEJA, LLAVE_NUEVA, '⓪ Llave y origen')
  const abrir = nodo('1 · Abrir campaña')
  abrir.parameters.jsonBody = unaVez(String(abrir.parameters.jsonBody), ABRIR_VIEJO, ABRIR_NUEVO, '1 · Abrir campaña')
  return f
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const d = construirPuerta(JSON.parse(fs.readFileSync(ANTES, 'utf8')))
  fs.writeFileSync(DESPUES, JSON.stringify(d, null, 2) + '\n')
  console.log('escrito', path.relative(process.cwd(), DESPUES))
}
