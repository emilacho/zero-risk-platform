// CADENA · Sprint 4 · A entrega 2 · EL LECTOR DE LAS FICHAS en la puerta VIVA · CC#3 · 2026-11-17
// Parche sobre la puerta tal como está en n8n (respaldo `puerta-s4-fichas-ANTES.json`): NO se reconstruye la puerta entera (la viva ya trae las rondas 74/75).
//   + «2b · Entrada de las fichas» (código) → «2b · Fichas (sub-flujo)» (executeWorkflow, onError: continueRegularOutput) → «2b · Seguir» (código)
//   «2 · ¿Sigue?» rama 0: antes → «3 · Fechas · expandir»; ahora → «2b · Entrada de las fichas»; «2b · Seguir» → «3 · Fechas · expandir»
// El lector NO es reja: si su sub-flujo falla, «2b · Seguir» deja pasar lo que dejó la estrategia, tal cual. Ningún otro nodo cambia.
// El código de los nodos nuevos es el MISMO que usa `construir.mjs` (carpeta `nodos/`).
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const leer = (f) => fs.readFileSync(path.join(AQUI, 'nodos', f), 'utf8').replace(/\r\n/g, '\n')
const uuid = (s) => { const h = createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}` }

export const NODOS = { entrada: '2b · Entrada de las fichas', sub: '2b · Fichas (sub-flujo)', seguir: '2b · Seguir', sigue: '2 · ¿Sigue?', fechas: '3 · Fechas · expandir', estrategia: '2 · ¿Estrategia?' }

export function construirFlujo(flujo, idFichas) {
  if (typeof idFichas !== 'string' || !idFichas.trim()) throw new Error('falta el id del sub-flujo de las fichas')
  const copia = JSON.parse(JSON.stringify(flujo))
  const nombres = new Set(copia.nodes.map((n) => n.name))
  for (const n of [NODOS.entrada, NODOS.sub, NODOS.seguir]) if (nombres.has(n)) throw new Error(`la puerta ya tiene «${n}» · no se aplica dos veces`)
  for (const n of [NODOS.sigue, NODOS.fechas, NODOS.estrategia]) if (!nombres.has(n)) throw new Error(`no está el nodo «${n}» · rehacer desde el vivo`)
  const rama = copia.connections[NODOS.sigue]?.main?.[0] ?? []
  if (rama.length !== 1 || rama[0].node !== NODOS.fechas) throw new Error('«2 · ¿Sigue?» rama 0 ya no va solo a «3 · Fechas · expandir» · rehacer desde el vivo')
  const base = copia.nodes.find((n) => n.name === NODOS.sigue).position ?? [0, 0]
  const pos = (dx) => [base[0] + dx, base[1] - 600]
  const codigo = (name, archivo, dx) => ({ parameters: { jsCode: leer(archivo) }, name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(dx), id: uuid('puerta-s4|' + name) })
  copia.nodes.push(
    codigo(NODOS.entrada, 'puerta-fichas-entrada.js', 0),
    { parameters: { workflowId: { __rl: true, value: idFichas, mode: 'id' }, options: { waitForSubWorkflow: true } }, name: NODOS.sub, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.2, position: pos(280), id: uuid('puerta-s4|' + NODOS.sub), onError: 'continueRegularOutput' },
    codigo(NODOS.seguir, 'puerta-fichas-seguir.js', 560),
  )
  const a = (node) => [{ node, type: 'main', index: 0 }]
  copia.connections[NODOS.sigue].main[0] = a(NODOS.entrada)
  copia.connections[NODOS.entrada] = { main: [a(NODOS.sub)] }
  copia.connections[NODOS.sub] = { main: [a(NODOS.seguir)] }
  copia.connections[NODOS.seguir] = { main: [a(NODOS.fechas)] }
  return copia
}
