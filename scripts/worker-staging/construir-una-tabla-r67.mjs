// ronda 67 · D1 · UNA sola tabla país → trato. Pega el bloque marcado de `src/lib/trato/trato-logica.js` en los flujos y reemplaza sus tablas apartadas.
// Uso: node scripts/worker-staging/construir-una-tabla-r67.mjs   (lee los respaldos ANTES-ronda67, escribe los ARREGLADO-ronda67 · NO toca n8n)
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
const leer = (p) => fs.readFileSync(RAIZ + p, 'utf8')

const modulo = leer('src/lib/trato/trato-logica.js').split('\r\n').join('\n')
const i0 = modulo.indexOf('// ═══ PAÍS → TRATO')
const i1 = modulo.indexOf('// ═══ fin país → trato ═══')
if (i0 < 0 || i1 < 0) throw new Error('no están las marcas del bloque en el módulo')
export const BLOQUE = modulo.slice(i0, i1 + '// ═══ fin país → trato ═══'.length)

/** cambia UNA ocurrencia exacta; si no está una sola vez, falla */
export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}

const POR_PAIS_VIEJO = "var POR_PAIS = { argentina: 'vos', uruguay: 'vos', paraguay: 'vos', ecuador: 'tu', mexico: 'tu', peru: 'tu', chile: 'tu', espana: 'tu', bolivia: 'tu', venezuela: 'tu', panama: 'tu', 'costa rica': 'usted' }"
const PAIS_VIEJO = "  var pais = sinTildes(f.country).trim() || sinTildes(String(f.market || '').split(/[·|,;\\/]/).pop()).trim()"
const PAIS_NUEVO = "  var pais = paisNormal(f.country) || paisNormal(String(f.market || '').split(/[·|,;\\/]/).pop())"
const USO_VIEJO = "  if (pais && POR_PAIS[pais]) return"
const USO_NUEVO = "  if (pais && Object.prototype.hasOwnProperty.call(POR_PAIS, pais)) return"

/** brief ③④ · pieza ⑤⑦ · copia por filas ③④: el detector de trato embebido */
export function detector(codigo) {
  return conFinDeLinea(codigo, (c) => {
    c = cambiar(c, POR_PAIS_VIEJO, BLOQUE, 'POR_PAIS')
    c = cambiar(c, PAIS_VIEJO, PAIS_NUEVO, 'pais')
    return cambiar(c, USO_VIEJO, USO_NUEVO, 'uso')
  })
}

/** planeación ① y Redactor: la tabla de registros se DERIVA de la única fuente (tu→tuteo · vos→voseo · usted→formal) */
const REGISTRO_VIEJO = `const REGISTRO_POR_PAIS = {
  ecuador: 'tuteo', colombia: 'tuteo', mexico: 'tuteo', peru: 'tuteo', chile: 'tuteo', venezuela: 'tuteo', bolivia: 'tuteo', espana: 'tuteo',
  cuba: 'tuteo', panama: 'tuteo', 'republica dominicana': 'tuteo', 'puerto rico': 'tuteo',
  argentina: 'voseo', uruguay: 'voseo', paraguay: 'voseo',
}`
const REGISTRO_NUEVO = `${BLOQUE}
// el registro de la planeación se DERIVA de la única tabla (tu → tuteo · vos → voseo · usted → formal): no hay segunda lista de países
const REGISTRO_POR_PAIS = (() => { const r = {}; const m = { tu: 'tuteo', vos: 'voseo', usted: 'formal' }; Object.keys(POR_PAIS).forEach((k) => { r[k] = m[POR_PAIS[k]] }); return r })()`
export function planeacion(codigo) {
  return conFinDeLinea(codigo, (c) => {
    c = cambiar(c, REGISTRO_VIEJO, REGISTRO_NUEVO, 'REGISTRO_POR_PAIS')
    return cambiar(c, '  const p = _sinTildes(pais)\n', '  const p = paisNormal(pais)\n', 'registroFinal.p')
  })
}

/** alta · Transform discovery→package: la tabla del alta es la misma (sin los códigos pegados a mano: los pone paisNormal) */
const ALTA_TABLA_VIEJA = /const _PAIS_TRATO = \{[^\n]*\}\n/
const ALTA_LINEAS_VIEJAS = `  const sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().trim()
  const d = deal && typeof deal === 'object' ? deal : {}
  const pais = sinTildes(d.country) || sinTildes(String(d.location || '').split(/[·|,;\\/]/).pop())
  if (!pais) return { texto: '', estado: 'pendiente_sin_pais', pais: null }
  const registro = _PAIS_TRATO[pais]
`
const ALTA_LINEAS_NUEVAS = `  const d = deal && typeof deal === 'object' ? deal : {}
  const pais = paisNormal(d.country) || paisNormal(String(d.location || '').split(/[·|,;\\/]/).pop())
  if (!pais) return { texto: '', estado: 'pendiente_sin_pais', pais: null }
  const registro = Object.prototype.hasOwnProperty.call(POR_PAIS, pais) ? POR_PAIS[pais] : undefined
`
export function alta(codigo) {
  return conFinDeLinea(codigo, (c) => {
    if (!ALTA_TABLA_VIEJA.test(c)) throw new Error('alta: no está _PAIS_TRATO')
    c = c.replace(ALTA_TABLA_VIEJA, () => BLOQUE + '\n')
    return cambiar(c, ALTA_LINEAS_VIEJAS, ALTA_LINEAS_NUEVAS, 'alta._idiomaDelCliente')
  })
}

/** CC#3 §2.5-1 · las dos reservas del alta mandan el client_id (si no, #495 resuelve la zona en UTC y la reserva queda sin cliente · C7). Cambia SOLO el cuerpo del nodo de la reserva. */
export const reservaDe = (nodoDeDatos) => (cuerpo) => {
  const antes = '={\n  "contact_id"'
  const linea = `  "client_id": {{ JSON.stringify($('${nodoDeDatos}').item.json.client_id || null) }},\n`
  return cambiar(cuerpo, antes, '={\n' + linea + '  "contact_id"', 'reserva')
}

const CASOS = [
  ['scripts/worker-staging/PQdIgbuFexuBsoh8/brief-ANTES-ronda67-2026-10-11.json', 'scripts/worker-staging/PQdIgbuFexuBsoh8/brief-ARREGLADO-ronda67-2026-10-11.json', ['③ Armar', '④ Chequeos'], detector],
  ['scripts/worker-staging/lVCLzxQCKNkd3uS0/pieza-ANTES-ronda67-2026-10-11.json', 'scripts/worker-staging/lVCLzxQCKNkd3uS0/pieza-ARREGLADA-ronda67-2026-10-11.json', ['⑤ Armar', '⑦ Chequeos'], detector],
  ['scripts/worker-staging/cadena/parte-por-filas-ANTES-ronda67-2026-10-11.json', 'scripts/worker-staging/cadena/parte-por-filas-ARREGLADA-ronda67-2026-10-11.json', ['③ Armar', '④ Chequeos'], detector],
  ['scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ANTES-ronda67-2026-10-11.json', 'scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ARREGLADA-ronda67-2026-10-11.json', ['① GUARDA', 'Redactor (B4)'], planeacion],
  ['scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ANTES-ronda67-2026-10-11.json', 'scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-ronda67-2026-10-11.json', ['[JEFATURA] Transform discovery'], alta, { nodo: 'Schedule Kickoff Call (Cal.com)', fn: reservaDe('Validate Deal Data') }],
  ['scripts/worker-staging/wu1DUAXIuEG5nNTX/segunda-fase-ANTES-ronda67-2026-10-11.json', 'scripts/worker-staging/wu1DUAXIuEG5nNTX/segunda-fase-ARREGLADA-ronda67-2026-10-11.json', [], null, { nodo: 'Schedule Kickoff Call (Cal.com)', fn: reservaDe('Datos del alta') }],
]

if (process.argv[1] && process.argv[1].endsWith('construir-una-tabla-r67.mjs')) {
  for (const [antes, despues, nombres, fn, reserva] of CASOS) {
    const flujo = JSON.parse(leer(antes))
    let tocados = 0
    for (const n of flujo.nodes) {
      if (!nombres.some((x) => n.name.startsWith(x))) continue
      if (typeof n.parameters?.jsCode !== 'string') continue
      n.parameters.jsCode = fn(n.parameters.jsCode); tocados++
    }
    if (reserva) {
      const n = flujo.nodes.filter((x) => x.name === reserva.nodo)
      if (n.length !== 1) throw new Error(`${antes}: ${n.length} nodos ${reserva.nodo}`)
      n[0].parameters.jsonBody = reserva.fn(n[0].parameters.jsonBody); tocados++
    }
    if (tocados !== nombres.length + (reserva ? 1 : 0)) throw new Error(`${antes}: tocados ${tocados} de ${nombres.length}`)
    fs.writeFileSync(RAIZ + despues, JSON.stringify(flujo, null, 2))
    console.log('ok', despues.split('/').pop(), tocados, 'nodos')
  }
}
