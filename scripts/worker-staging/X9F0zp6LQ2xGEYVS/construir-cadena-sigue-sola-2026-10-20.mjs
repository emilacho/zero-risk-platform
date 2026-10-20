// CC#2 · 20-oct · PARTE 3 DEL ENCARGO «LIMPIAR Y ARREGLAR» · LA CADENA SIGUE SOLA DESPUÉS DEL PLAN.
//   node construir-cadena-sigue-sola-2026-10-20.mjs
// Parte del flujo VIVO de planeación (`planeacion-ARREGLADO-ensayo-sin-manual-2026-10-20.json` = vivo tras la #655) y hace TRES cambios (nodos y conexiones; nada más):
//  1. DRIVE FUERA DEL CAMINO CRÍTICO. Medido en la ejecución real 186281: con la credencial de Google caducada la rama «sin PDF» (`Armar el aviso · sin PDF` → `Campana · plan sin PDF`) terminaba ahí
//     y NUNCA corrían `Cable de vuelta · sala`, `BRIEF · sobre` ni `V9 · cerrar la corrida`: la sala no se enteraba de que la planeación acabó y la cadena no seguía. Ahora la campana avisa Y la corrida sigue
//     al cable de vuelta (el plan ya está guardado; el PDF es un documento de cortesía). La alarma roja se queda.
//  2. UN PLAN CON PENDIENTES ESPERA A EMILIO. Entre `Cable · ¿volvió? · plan` y `BRIEF · sobre` entra `¿Plan con pendientes? · espera a Emilio`: con pendientes NO se pide el parte (sigue el cierre de la corrida);
//     el sobre lo emite la plataforma cuando Emilio APRUEBA el elemento de la bandeja (`PATCH /api/hitl/[id]`, módulo `plan-aprobado`), con la misma llave de idempotencia.
//  3. `Aviso · plan con pendientes` deja en el `payload` del elemento lo que hace falta para emitir ese sobre después: `journey_id`, `tenant_id`, `dry_run`, `correlation_id`.
// Reversa: restaurar `planeacion-ANTES-cadena-sigue-sola-2026-10-20.json` (= el vivo de antes) con `scripts/ops/n8n-flujo.mjs restaurar`.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODOS = {
  campana: 'Campana · plan sin PDF',
  cable: 'Cable de vuelta · sala',
  volvio: 'Cable · ¿volvió? · plan',
  brief: 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)',
  espera: '¿Plan con pendientes? · espera a Emilio',
  aviso: 'Aviso · plan con pendientes',
}
const unaVez = (s, a, b, quien) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(quien + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 80))
  return s.replace(a, () => b)
}
const PAYLOAD_ANTES = "payload: { plan_id: planId, estado_del_plan: v.estado_del_plan, marcas: (v.chequeo_del_plan && v.chequeo_del_plan.marcas) || [], para_el_cliente: false },"
const PAYLOAD_NUEVO = [
  "payload: { plan_id: planId, estado_del_plan: v.estado_del_plan, marcas: (v.chequeo_del_plan && v.chequeo_del_plan.marcas) || [], para_el_cliente: false,",
  "    // 20-oct · lo que hace falta para pedir el parte del brief CUANDO EMILIO APRUEBE (la plataforma emite el sobre con la misma llave de idempotencia `{viaje}:briefear`)",
  "    journey_id: (sobre.body && sobre.body._journey_id) || null, tenant_id: (sobre.body && (sobre.body.tenant_id || sobre.body.client_id)) || null,",
  "    dry_run: !!(sobre.body && sobre.body.dry_run === true), correlation_id: (sobre.body && sobre.body._sala_correlation_id) || null },",
].join('\n')
const SOBRE_ANTES = "const v = $('¿Llegó la vuelta?').first().json;\nif (!v.con_pendientes) return [];"
const SOBRE_NUEVO = "const v = $('¿Llegó la vuelta?').first().json;\nif (!v.con_pendientes) return [];\nlet sobre = { body: {} }; try { sobre = $('Webhook · planeacion').first().json || { body: {} }; } catch (x) { sobre = { body: {} }; }"

export function construirFlujo(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const por = (n) => { const x = f.nodes.filter((y) => y.name === n); if (x.length !== 1) throw new Error(x.length + ' nodos «' + n + '»'); return x[0] }
  if (f.nodes.some((n) => n.name === NODOS.espera)) throw new Error('el flujo ya trae «' + NODOS.espera + '»')
  const campana = por(NODOS.campana), brief = por(NODOS.brief), aviso = por(NODOS.aviso); por(NODOS.cable); por(NODOS.volvio)
  // 1 · la campana ya no es el final de la rama «sin PDF»
  if (f.connections[NODOS.campana]) throw new Error('la campana ya tiene salida: el flujo cambió debajo')
  f.connections[NODOS.campana] = { main: [[{ node: NODOS.cable, type: 'main', index: 0 }]] }
  // 2 · el IF entre el cable y el sobre del brief
  const sal = f.connections[NODOS.volvio]?.main?.[0]
  if (!sal || !sal.some((t) => t.node === NODOS.brief)) throw new Error('«' + NODOS.volvio + '» ya no apunta a «' + NODOS.brief + '»: el flujo cambió debajo')
  f.nodes.push({
    id: 'cadena-sigue-sola-if', name: NODOS.espera, type: 'n8n-nodes-base.if', typeVersion: 2, position: [brief.position[0] - 200, brief.position[1]],
    notes: '20-oct · CC#2 · un plan con pendientes NO pide el parte: espera a que Emilio apruebe el elemento de la bandeja (la plataforma emite entonces el sobre, misma llave de idempotencia). Sin pendientes: sigue al sobre del brief como siempre.',
    parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: "={{ $('¿Llegó la vuelta?').first().json.con_pendientes === true }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} },
  })
  f.connections[NODOS.volvio].main[0] = sal.map((t) => (t.node === NODOS.brief ? { node: NODOS.espera, type: 'main', index: 0 } : t))
  f.connections[NODOS.espera] = { main: [[], [{ node: NODOS.brief, type: 'main', index: 0 }]] } // 0 = con pendientes (se queda esperando), 1 = sin pendientes (sigue)
  // 3 · el aviso lleva lo que hace falta para emitir después
  const js = aviso.parameters.jsCode
  const crlf = js.includes('\r\n'); let c = js.split('\r\n').join('\n')
  c = unaVez(c, SOBRE_ANTES, SOBRE_NUEVO, NODOS.aviso)
  c = unaVez(c, PAYLOAD_ANTES, PAYLOAD_NUEVO, NODOS.aviso)
  aviso.parameters.jsCode = crlf ? c.split('\n').join('\r\n') : c
  void campana
  return f
}

const aqui = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && process.argv[1].endsWith('construir-cadena-sigue-sola-2026-10-20.mjs')) {
  const ANTES = join(aqui, 'planeacion-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
  const w = JSON.parse(readFileSync(ANTES, 'utf8'))
  writeFileSync(join(aqui, 'planeacion-ANTES-cadena-sigue-sola-2026-10-20.json'), JSON.stringify(w, null, 2))
  const n = construirFlujo(w)
  writeFileSync(join(aqui, 'planeacion-ARREGLADO-cadena-sigue-sola-2026-10-20.json'), JSON.stringify(n, null, 2))
  console.log('escrito · nodos', n.nodes.length)
}
