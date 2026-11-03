#!/usr/bin/env node
/**
 * 03-nov · FIRMA DE EMILIO 14:46Z · «no siga la cadena hasta que yo apruebe el manual». El alta (`LyVoKcrypS5uLyuu`) deja de pedir el plan:
 * se quitan «E57 · sobre · pedir planeación a la sala» y su «GUARDA» (una línea, nada más cuelga de ellos). «Llamar · Segunda Fase del alta»
 * (Notion, agenda, aviso, cierre) queda igual y pasa a ser el final del alta. El plan lo pide el botón «Aprobar el manual» (CC#1) con el mismo sobre.
 *   node scripts/ops/alta-sin-sobre-de-planeacion.mjs <alta-entrada.json> <alta-salida.json>
 * Falla en voz alta si la forma esperada no está (otro cambió el alta): no adivina.
 */
import fs from 'node:fs'

export const SOBRE = 'E57 · sobre · pedir planeación a la sala'
export const GUARDA = 'GUARDA · si la puerta rechazó el pedido de planeación'
export const FINAL_REAL = 'Llamar · Segunda Fase del alta'

export function quitarSobre(alta) {
  const w = JSON.parse(JSON.stringify(alta))
  const nombres = new Set(w.nodes.map((n) => n.name))
  if (!nombres.has(SOBRE) || !nombres.has(GUARDA)) throw new Error(`el alta no trae «${SOBRE}» y su GUARDA: ya está cortada o la cambió otro`)
  const salidas = (n) => Object.values(w.connections?.[n] ?? {}).flatMap((s) => s.flatMap((a) => (a ?? []).map((x) => x.node)))
  const entradas = (n) => Object.keys(w.connections ?? {}).filter((k) => salidas(k).includes(n))
  if (JSON.stringify(entradas(SOBRE)) !== JSON.stringify([FINAL_REAL])) throw new Error(`el sobre no cuelga SOLO de «${FINAL_REAL}»: ${entradas(SOBRE).join(', ')}`)
  if (JSON.stringify(salidas(SOBRE)) !== JSON.stringify([GUARDA]) || salidas(GUARDA).length) throw new Error('el sobre o la GUARDA tienen conexiones que no esperaba')
  if (JSON.stringify(entradas(GUARDA)) !== JSON.stringify([SOBRE])) throw new Error('la GUARDA recibe de otro nodo además del sobre')
  w.nodes = w.nodes.filter((n) => n.name !== SOBRE && n.name !== GUARDA)
  delete w.connections[SOBRE]
  delete w.connections[GUARDA]
  const main = w.connections[FINAL_REAL].main
  w.connections[FINAL_REAL].main = main.map((a) => (a ?? []).filter((x) => x.node !== SOBRE))
  if (w.connections[FINAL_REAL].main.every((a) => !a.length)) delete w.connections[FINAL_REAL]
  return w
}

const esMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (esMain) {
  const [, , entrada, salida] = process.argv
  if (!entrada || !salida) { console.error('uso: alta-sin-sobre-de-planeacion.mjs <entrada.json> <salida.json>'); process.exit(2) }
  const out = quitarSobre(JSON.parse(fs.readFileSync(entrada, 'utf8')))
  fs.writeFileSync(salida, JSON.stringify(out))
  console.log(`listo · ${out.nodes.length} nodos · sin «${SOBRE}» ni su GUARDA`)
}
