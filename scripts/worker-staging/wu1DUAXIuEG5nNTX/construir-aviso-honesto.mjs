#!/usr/bin/env node
/**
 * CONSTRUCTOR · el aviso de «agenda lista» lee el resultado de la reserva.
 *
 * Emilio firmó el arreglo el 2026-09-03 (hallazgo
 * `raw/findings/2026-09-03-CC1-el-409-de-Calcom-y-el-aviso-falso.md`).
 *
 * QUÉ PASABA · el nodo que reserva tiene `onError: continueRegularOutput`, así que
 * cuando Cal.com rechaza sale por la MISMA puerta que cuando funciona. De esa puerta
 * cuelga el emisor del aviso, sin ninguna condición en medio, y su cuerpo NO llevaba
 * un solo campo de la respuesta: afirmaba `phase_state: "completed"` como texto fijo.
 * Medido el 03-sep: rechazo 409 a las 10:25:19Z, «fase de agenda completada» a las
 * 10:25:34Z, cero reservas creadas.
 *
 * QUÉ CAMBIA · UNA línea por flujo: `phase_state` pasa de literal a expresión que
 * mira la respuesta de la reserva. Sólo dice «completada» si hay fila de reserva.
 *
 * NO se agrega ni se borra ningún nodo · NO se toca el cableado · NO se toca el nodo
 * que reserva · NO se toca el aviso de Slack (que nunca prometió una reunión).
 *
 * CONSTRUIR SÍ · PUBLICAR NO. Este guion escribe archivos y no llama a n8n.
 *
 *   node scripts/worker-staging/wu1DUAXIuEG5nNTX/construir-aviso-honesto.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const STAGING = join(AQUI, '..')

const RESERVA = 'Schedule Kickoff Call (Cal.com)'
const AVISO = '[MODELB] Phase-boundary Emit · kickoff_scheduled'

/**
 * La expresión honesta. Sólo «completed» cuando la respuesta trae `ok:true` Y la fila
 * de reserva con su id. En cualquier otro caso (rechazo de Cal.com, error de red, o
 * el ítem de error que deja `continueRegularOutput`) la fase queda «started»: empezó
 * y no terminó, que es la verdad.
 *
 * Sin función anónima a propósito · el evaluador de n8n las admite, pero un ternario
 * plano es lo que ya usa el resto de los cuerpos de estos dos flujos.
 */
const EXPRESION_ESTADO =
  `{{ $('${RESERVA}').item.json?.ok === true && $('${RESERVA}').item.json?.booking?.id ? 'completed' : 'started' }}`

const OBJETIVOS = [
  { carpeta: 'wu1DUAXIuEG5nNTX', vivo: 'segunda-fase-VIVO-2026-09-03.json', salida: 'segunda-fase-construida.json', nodos: 11 },
  { carpeta: 'LyVoKcrypS5uLyuu', vivo: 'alta-VIVO-2026-09-03.json', salida: 'alta-construida.json', nodos: 81 },
]

for (const o of OBJETIVOS) {
  const rutaVivo = join(STAGING, o.carpeta, o.vivo)
  const flujo = JSON.parse(readFileSync(rutaVivo, 'utf8'))

  // ── Compuertas · el constructor se niega si el flujo no es el que espera ──
  // (la lección de la pieza (e): un constructor que parte de un retrato viejo
  //  BORRA los nodos que se agregaron después)
  if (flujo.nodes.length !== o.nodos) {
    throw new Error(`ABORTA · ${o.carpeta} tiene ${flujo.nodes.length} nodos y el retrato esperaba ${o.nodos}`)
  }
  const reserva = flujo.nodes.find((n) => n.name === RESERVA)
  const aviso = flujo.nodes.find((n) => n.name === AVISO)
  if (!reserva) throw new Error(`ABORTA · ${o.carpeta} · no está el nodo «${RESERVA}»`)
  if (!aviso) throw new Error(`ABORTA · ${o.carpeta} · no está el nodo «${AVISO}»`)
  if (reserva.onError !== 'continueRegularOutput') {
    throw new Error(`ABORTA · ${o.carpeta} · «${RESERVA}» ya no sigue-aunque-falle · el arreglo asume esa forma`)
  }
  const cuerpo = String(aviso.parameters?.jsonBody ?? '')
  if (!cuerpo.includes('"phase_state": "completed"')) {
    throw new Error(`ABORTA · ${o.carpeta} · el aviso ya no afirma «completed» como literal · revisar a mano`)
  }

  // ── El cambio · una línea ──
  aviso.parameters.jsonBody = cuerpo.replace(
    '"phase_state": "completed"',
    `"phase_state": "${EXPRESION_ESTADO}"`,
  )

  const rutaSalida = join(STAGING, o.carpeta, o.salida)
  writeFileSync(rutaSalida, JSON.stringify(flujo, null, 1))
  console.log(`✓ ${o.carpeta} · ${o.salida} · ${flujo.nodes.length} nodos (sin cambios) · 1 línea cambiada`)
}

console.log('\nCONSTRUIDO · NO publicado. Los dos flujos siguen como están en el motor.')
