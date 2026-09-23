// E118 · cambio 1 (punto 2 de 2) + cambio 2 · LA SEGUNDA FASE ACEPTA `email` AL RESERVAR · Y EL FALLO SE DECLARA.
//
// Medido (E117 · CC#2 · 146739): «Schedule Kickoff Call (Cal.com)» manda `contact_email` desde «Datos del alta»
// (vacío si la carga no lo trajo) ⇒ 400 `contact_email_required` ⇒ el nodo «continúa en error» y el aviso de Slack
// dice «ONBOARDING INITIATED» sin mencionar la cita. El libro ya anota SCHEDULING como `started` (no `completed`) si
// Cal.com no confirmó (la puerta sólo acepta started|completed): eso NO se toca.
// Cambios (texto de dos nodos · sin lógica nueva de flujo):
//   1. reserva: `contact_email` = contact_email || email de «Datos del alta» (acepta los dos nombres).
//   2. aviso Slack: una línea «Kickoff: AGENDADO · fecha · enlace» o «Kickoff: NO AGENDADO · motivo» · la corrida sigue.
//
// node scripts/worker-staging/wu1DUAXIuEG5nNTX/construir-e118.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const RESERVA = 'Schedule Kickoff Call (Cal.com)'
export const AVISO = 'Alert Slack: Onboarding Initiated'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

export const CORREO_ANTES = `"contact_email": "{{ $('Datos del alta').item.json.contact_email }}",`
export const CORREO_DESPUES = `"contact_email": "{{ $('Datos del alta').item.json.contact_email || $('Datos del alta').item.json.email || '' }}",`

export const AVISO_ANTES = `String($('Datos del alta').item.json.contract_scope || ''))) }}`
export const AVISO_DESPUES = `String($('Datos del alta').item.json.contract_scope || '')) + '\\nKickoff: ' + (($('Schedule Kickoff Call (Cal.com)').item.json || {}).ok === true && (($('Schedule Kickoff Call (Cal.com)').item.json || {}).booking || {}).id ? ('AGENDADO · ' + String((($('Schedule Kickoff Call (Cal.com)').item.json || {}).booking || {}).scheduled_at || (($('Schedule Kickoff Call (Cal.com)').item.json || {}).booking || {}).start_time || '') + ' · ' + String((($('Schedule Kickoff Call (Cal.com)').item.json || {}).booking || {}).meeting_url || '')) : ('NO AGENDADO · ' + String((($('Schedule Kickoff Call (Cal.com)').item.json || {}).error || {}).message || (($('Schedule Kickoff Call (Cal.com)').item.json || {}).error) || (($('Schedule Kickoff Call (Cal.com)').item.json || {}).code) || 'sin respuesta de la puerta').slice(0, 300)))) }}`

export function construir(flujo) {
  const byName = new Map(flujo.nodes.map((n) => [n.name, n]))
  for (const n of [RESERVA, AVISO]) if (!byName.has(n)) throw new Error(`no encontré «${n}»`)
  const r = byName.get(RESERVA), a = byName.get(AVISO)
  const rb = String(r.parameters.jsonBody), ab = String(a.parameters.jsonBody)
  if (rb.includes('.json.email')) throw new Error('la reserva ya acepta `email` · no construir dos veces')
  if (rb.split(CORREO_ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) el correo en la reserva (785537fe)')
  if (ab.includes('Kickoff:')) throw new Error('el aviso ya declara la cita · no construir dos veces')
  if (ab.split(AVISO_ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) el cierre del aviso (785537fe)')
  const rNuevo = { ...r, parameters: { ...r.parameters, jsonBody: rb.replace(CORREO_ANTES, CORREO_DESPUES) }, notes: ((r.notes || '') + '\nE118 · contact_email = contact_email || email de «Datos del alta».').trim() }
  const aNuevo = { ...a, parameters: { ...a.parameters, jsonBody: ab.replace(AVISO_ANTES, AVISO_DESPUES) }, notes: ((a.notes || '') + '\nE118 · el aviso declara si la cita quedó AGENDADA (fecha · enlace) o NO AGENDADA (motivo) · la corrida sigue.').trim() }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes.map((x) => (x.name === RESERVA ? rNuevo : x.name === AVISO ? aNuevo : x)), connections: flujo.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-e118.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'fase2-antes-e118-785537fe.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'fase2-construida-e118.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos · reserva acepta email · aviso declara la cita')
}
