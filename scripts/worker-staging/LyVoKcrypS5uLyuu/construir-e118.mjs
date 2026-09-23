// E118 · cambio 1 (punto 1 de 2) · EL CORREO LLEGA A LA SEGUNDA FASE.
//
// Medido (E117 · CC#2 · E110 fase2 146739): el trato que entra por la sala trae el correo como `email`; «Armar
// carga · segunda fase» lo pide como `contact_email` (L16: `v.contact_email || ''`) ⇒ cadena vacía ⇒ la reserva en
// Cal.com responde 400 `contact_email_required`. Cambio: aceptar los dos nombres · UNA línea · nada más.
//
// node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-e118.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const ARMAR = 'Armar carga · segunda fase'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
export const ANTES = "  contact_email: v.contact_email || '',"
export const DESPUES = "  contact_email: v.contact_email || v.email || '',   // E118 · el trato de la sala lo trae como `email` · se aceptan los dos nombres"

export function construir(flujo) {
  const n = flujo.nodes.find((x) => x.name === ARMAR)
  if (!n) throw new Error(`no encontré «${ARMAR}»`)
  const code = String(n.parameters.jsCode)
  if (code.includes('v.email')) throw new Error('la carga ya acepta `email` · no construir dos veces')
  if (code.split(ANTES).length - 1 !== 1) throw new Error('no encuentro (una vez) la línea del correo (f2993727)')
  const nuevo = { ...n, parameters: { ...n.parameters, jsCode: code.replace(ANTES, DESPUES) }, notes: ((n.notes || '') + '\nE118 · contact_email = v.contact_email || v.email (el trato de la sala trae `email`).').trim() }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes.map((x) => (x.name === ARMAR ? nuevo : x)), connections: flujo.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-e118.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'alta-antes-e118-f2993727.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'alta-construida-e118.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos · Armar carga: contact_email || email')
}
