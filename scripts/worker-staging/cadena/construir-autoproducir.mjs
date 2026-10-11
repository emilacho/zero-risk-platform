// AUTOPRODUCIR (CC#1 2026-10-11 · firma de Emilio: «el brief manda solo a producir») · la copia de la parte «por filas» (BNXqlaX1oHSfZIpF) pide a la plataforma que saque UN sobre `producir` por brief.
// Desde la raíz del repo:  node scripts/worker-staging/cadena/construir-autoproducir.mjs
// Parte del respaldo ANTES (el flujo vivo) y escribe el ARREGLADO · NO toca n8n (eso lo hace n8n-flujo.mjs restaurar --ejecutar). El flujo sigue INACTIVO.
// Dos nodos nuevos, DESPUÉS de «⑤ Marcar las filas del lote» y en una rama aparte (la rama de siempre —Drive y el cable— va PRIMERO y no cambia):
//   «⑤c Autoproducir» → POST /api/cadena/filas { accion: 'autoproducir' } · la plataforma decide con sus tres candados (interruptor de la campaña, compuerta de la cadena, freno de gasto); con todo apagado devuelve «no emite»
//   «⑤c ¿Salió?»      → no calla: un sobre rechazado o un error del servidor DETIENE la corrida con su motivo; «no emite por candado» (interruptor apagado, cadena apagada, freno) es lo normal y NO es error
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const ANCLA = '⑤ Marcar las filas del lote'
export const AUTOPRODUCIR = '⑤c Autoproducir'
export const SALIO = '⑤c ¿Salió?'
const DRIVE = '⑤ Parte a Drive'

const CUERPO = "={{ JSON.stringify({ accion: 'autoproducir', campana_id: $('④ Chequeos').first().json.fila_parte.provenance_tag.campana_id, parte_id: (() => { try { const g = $('⑤ Guardar el parte').first().json; const b = g && g.body ? g.body : g; const f = Array.isArray(b) ? b[0] : b; return (f && f.id) || null } catch (e) { return null } })(), dry_run: $('④ Chequeos').first().json.fila_parte.provenance_tag.dry_run === true, workflow_id: $workflow.id, workflow_execution_id: $execution.id, _sala_correlation_id: $('⓪ Sobre · llave · modo seco').first().json._sala_correlation_id || undefined, _journey_id: $('⓪ Sobre · llave · modo seco').first().json._journey_id || undefined }) }}"

export const CODIGO_SALIO = `// ⑤c ¿SALIÓ? · autoproducir no se calla (CC#1 2026-10-11). Lo normal con todo apagado es «no emite» (el interruptor de la campaña, la cadena apagada o el freno de gasto): eso NO es un error.
// Un sobre RECHAZADO por la sala, o un error del servidor, detiene la corrida con su motivo: así no se pierde un brief sin que nadie lo sepa.
const r = $input.first().json || {}
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
const NO_EMITE_POR_CANDADO = ['E-CADENA-APAGADA', 'E-CADENA-NO-ADMITIDO']
if (status === 409 && NO_EMITE_POR_CANDADO.indexOf(String(b.code || '')) !== -1) return [{ json: { autoproducir: 'cerrado_por_la_compuerta', code: b.code } }]
if (status !== 200) throw new Error('AUTOPRODUCIR_NO_CONTESTO · HTTP ' + String(r.statusCode) + ' · ' + String(b.code || b.error || b.detalle || 'sin detalle') + ' · los briefs NO salieron solos: se piden a mano')
if (b.emite === false) return [{ json: { autoproducir: 'no_emite', motivo: b.motivo || null } }]
if (Number(b.rechazados) > 0) throw new Error('AUTOPRODUCIR_SOBRES_RECHAZADOS · ' + b.rechazados + ' de ' + (Number(b.emitidos || 0) + Number(b.duplicados || 0) + Number(b.rechazados)) + ' sobres no entraron a la sala · ' + JSON.stringify((b.sobres || []).filter((s) => s.resultado === 'rechazado').slice(0, 5)))
return [{ json: { autoproducir: 'emitido', emitidos: b.emitidos, duplicados: b.duplicados, sin_familia: b.sin_familia, omitidos: b.omitidos || [], dry_run: b.dry_run === true } }]`

export function construirFlujo(antes) {
  const f = JSON.parse(JSON.stringify(antes))
  if (f.nodes.some((n) => n.name === AUTOPRODUCIR)) throw new Error('la copia ya trae autoproducir · no construir dos veces')
  const ancla = f.nodes.find((n) => n.name === ANCLA)
  if (!ancla) throw new Error(`no encontré «${ANCLA}»`)
  const sal = f.connections[ANCLA]
  if (!sal || !sal.main || !sal.main[0] || sal.main[0].length !== 1 || sal.main[0][0].node !== DRIVE) throw new Error('«Marcar las filas» ya no va solo a «Parte a Drive» · PARO')
  f.nodes.push({
    parameters: {
      method: 'POST', url: "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/cadena/filas' }}",
      sendHeaders: true, headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }] },
      sendBody: true, specifyBody: 'json', jsonBody: CUERPO, options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [ancla.position[0] + 220, ancla.position[1] + 200], id: '6a7a1f10-8c33-4f0e-9d11-65a0c0de0c01', name: AUTOPRODUCIR,
    notes: 'r65 · autoproducir (APAGADO): pide a la plataforma UN sobre `producir` por brief del parte guardado. Los candados viven en la plataforma (interruptor de la campaña · compuerta de la cadena · freno de gasto).',
  })
  f.nodes.push({
    parameters: { jsCode: CODIGO_SALIO }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [ancla.position[0] + 440, ancla.position[1] + 200], id: '6a7a1f10-8c33-4f0e-9d11-65a0c0de0c02', name: SALIO,
    notes: 'r65 · no calla: un sobre rechazado o un error del servidor detiene la corrida; «no emite por candado» es lo normal.',
  })
  // la rama de siempre (Drive → cable) sigue PRIMERA e intacta; la de autoproducir va después
  f.connections[ANCLA] = { main: [[{ node: DRIVE, type: 'main', index: 0 }, { node: AUTOPRODUCIR, type: 'main', index: 0 }]] }
  f.connections[AUTOPRODUCIR] = { main: [[{ node: SALIO, type: 'main', index: 0 }]] }
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-autoproducir.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'parte-por-filas-ANTES-autoproducir-2026-10-11.json'), 'utf8'))
  writeFileSync(join(aqui, 'parte-por-filas-ARREGLADA-autoproducir-2026-10-11.json'), JSON.stringify(construirFlujo(antes), null, 1) + '\n')
  console.log('construida · la copia por filas pide autoproducir (apagado)')
}
