// Suma al alta (LyVoKcrypS5uLyuu · Onboarding E2E v2) la CADENA que completa lo que el alta no trajo, a continuación del despertar (15-oct · firma de Emilio).
//   node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-despertar-completo.mjs <portero-vivo.json>
// ADITIVO: 13 nodos nuevos colgados de «⑦ Despertar el cerebro»; ningún nodo existente cambia. NO activa el alta (queda tal cual: inactiva) ni toca el flujo del portero.
// Los 11 nodos de la cadena son COPIA EXACTA (nombre, parámetros, código) de los del flujo del portero diario (ogfq56oIEoHufFPM), leídos de su respaldo vivo: así la cadena es el mismo
// planificador, filtro, archivar, cobertura, tope y vigilante. Solo se añaden dos nodos adaptadores con los nombres que esos códigos esperan («⓪ Entrada» y «① Un elemento por cliente»).
// El gasto cuenta como del portero: `workflow_id` = el flujo del portero (el vigilante y el tope lo suman; el alta no cuenta).
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const DESDE = '⑦ Despertar el cerebro (con el raspado del alta)'
export const CADENA = [
  '① Descubrir (el portero que alimenta)', '① Plan unificado', '② Ampliar (Servicio de Apify)',
  '② bis Artículos (qué leer)', '② bis Leer artículos (Servicio de Apify)',
  '② ter Reseñas y videos (qué pedir)', '② ter Leer reseñas y videos (Servicio de Apify)',
  '④ Alimentar (filtrar · razonar · archivar)', '④ bis Puente (repetir hasta terminar)', '⑤ Cierre', '⑥ Vigilar (apaga y avisa si algo falla)',
]
const ENTRADA = '⓪ Entrada'
const UNO = '① Un elemento por cliente'
const FLUJO_DEL_PORTERO = 'ogfq56oIEoHufFPM'

const jsEntrada = `// ⓪ ENTRADA (despertar completo) · el alta encadena, a continuación del despertar, la MISMA cadena del portero para ESTE cliente (misma lógica que la corrida diaria).
// El despertar responde \`pedir_ahora: true\` solo si archivó bien y no hay problemas; si falló, ya corrió hoy o fue en seco, la cadena NO corre (devuelve cero elementos).
const r = $input.first().json || {}
const b = r.body && typeof r.body === 'object' ? r.body : r
if (b.pedir_ahora !== true) return []
const cliente = $('Validate Deal Data').first().json.client_id
if (!cliente) return []
// El gasto de esta cadena es del portero (el vigilante y el tope del día lo suman por el identificador del flujo del portero); la ejecución es la de ESTA alta.
return [{ json: { workflow_id: String($env.PORTERO_WORKFLOW_ID || '${FLUJO_DEL_PORTERO}'), workflow_execution_id: String($execution.id), via: 'despertar', dry_run: false, client_id: cliente } }]`
const jsUno = `// ① UN ELEMENTO POR CLIENTE (despertar completo) · el cliente del alta, con la misma forma que le da el flujo del portero a su elemento; el plan lo arma la ruta «descubrir».
const e = $('${ENTRADA}').first().json
return [{ json: { ...e, cliente: e.client_id, nombre: null, acciones: [], omitidas: [], no_cubiertas: [], gastado_hoy_usd: 0, falla: null } }]`

export function conDespertarCompleto(antes, portero) {
  const w = JSON.parse(JSON.stringify(antes))
  const nombres = new Set(w.nodes.map((n) => n.name))
  for (const n of [ENTRADA, UNO, ...CADENA]) if (nombres.has(n)) throw new Error(`el alta ya tiene un nodo «${n}»`)
  const origen = w.nodes.find((n) => n.name === DESDE)
  if (!origen) throw new Error(`no existe «${DESDE}»`)
  if (w.connections[DESDE]?.main?.[0]?.length) throw new Error(`«${DESDE}» ya tiene salida: no se cuelga nada encima`)
  const [x0, y0] = origen.position ?? [6340, 1360]
  const id = (s) => crypto.createHash('sha1').update(`despertar-completo|${s}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5')
  const nuevo = (n, i, y) => ({ ...JSON.parse(JSON.stringify(n)), id: id(n.name), position: [x0 + 260 * (i + 1), y0 + y] })
  const adaptador = (name, jsCode) => ({ parameters: { jsCode }, id: id(name), name, type: 'n8n-nodes-base.code', typeVersion: 2 })
  const cadena = []
  cadena.push({ ...adaptador(ENTRADA, jsEntrada), position: [x0 + 260, y0] })
  cadena.push({ ...adaptador(UNO, jsUno), position: [x0 + 520, y0] })
  CADENA.forEach((nombre, i) => {
    const n = portero.nodes.find((x) => x.name === nombre)
    if (!n) throw new Error(`el flujo del portero no tiene «${nombre}»`)
    const c = nuevo(n, i + 2, 0)
    delete c.webhookId
    cadena.push(c)
  })
  w.nodes.push(...cadena)
  // una sola línea: ⑦ → ⓪ → ① → cadena (el orden del portero)
  const orden = [DESDE, ENTRADA, UNO, ...CADENA]
  for (let i = 0; i < orden.length - 1; i++) w.connections[orden[i]] = { main: [[{ node: orden[i + 1], type: 'main', index: 0 }]] }
  w.active = antes.active
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-despertar-completo.mjs')) {
  const fuente = process.argv[2]
  if (!fuente) { console.error('uso: construir-despertar-completo.mjs <respaldo-vivo-del-portero.json>'); process.exit(2) }
  const antes = JSON.parse(fs.readFileSync(path.join(aqui, 'LyVoKcrypS5uLyuu-ANTES-despertar-completo-2026-10-15.json'), 'utf8'))
  const portero = JSON.parse(fs.readFileSync(fuente, 'utf8'))
  const w = conDespertarCompleto(antes, portero)
  fs.writeFileSync(path.join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-despertar-completo-2026-10-15.json'), JSON.stringify(w, null, 2))
  console.log('ok · nodos', antes.nodes.length, '→', w.nodes.length, '· activo =', w.active)
}
