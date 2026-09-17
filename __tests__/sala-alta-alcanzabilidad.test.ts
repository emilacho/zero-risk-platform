/**
 * 🔴 E71 · EL SOBRE QUE PIDE `planeación` TIENE QUE SER ALCANZABLE · comprobación estática.
 *
 * Medido 2026-09-17 (CC#1): el nodo «E57 · sobre · pedir planeación a la sala» colgaba de un
 * `journey_completed` que NINGÚN disparador del alta alcanza (la cola vieja del alta, 24 nodos,
 * quedó huérfana cuando la segunda fase se movió a `wu1DUAXIuEG5nNTX` el 03-sep). El diff no lo
 * veía. Esta prueba lee la FOTO publicada del alta y falla si el sobre vuelve a quedar huérfano
 * o si aparece un huérfano nuevo. Para comprobar el motor en vivo (y refrescar la foto):
 *   node scripts/sala/alta-alcanzabilidad.mjs --foto scripts/worker-staging/LyVoKcrypS5uLyuu/alta-VIVO-<fecha>.json
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  analizar,
  veredicto,
  HUERFANOS_CONOCIDOS,
  SOBRE,
  FINAL_REAL,
  DISPARADOR,
} from '../scripts/sala/alta-alcanzabilidad.mjs'

const DIR = join(__dirname, '..', 'scripts', 'worker-staging', 'LyVoKcrypS5uLyuu')
const fotos = readdirSync(DIR).filter((f) => /^alta-VIVO-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
const ultima = fotos[fotos.length - 1]
const alta = JSON.parse(readFileSync(join(DIR, ultima), 'utf8')) as Parameters<typeof analizar>[0]
const r = analizar(alta)

describe(`E71 · alcanzabilidad del alta · foto ${ultima} · versionId ${r.versionId}`, () => {
  it('el sobre de planeación existe y es ALCANZABLE desde el disparador', () => {
    expect(r.sobre_existe, `falta «${SOBRE}»`).toBe(true)
    expect(r.sobre_alcanzable, `«${SOBRE}» no se alcanza desde «${DISPARADOR}» · el pedido de planeación nunca saldría`).toBe(true)
  })

  it('cuelga del final REAL del alta (la segunda fase), no de la cola huérfana', () => {
    expect(r.pasa_por_final_real, `el camino al sobre no pasa por «${FINAL_REAL}» · camino: ${r.camino.join(' → ')}`).toBe(true)
    expect(r.camino[r.camino.length - 2]).toBe(FINAL_REAL)
  })

  it('no hay huérfanos NUEVOS · los 24 conocidos están declarados por nombre', () => {
    expect(r.huerfanos_nuevos, `huérfanos no declarados: ${r.huerfanos_nuevos.join(' · ')}`).toEqual([])
    // si alguien reconecta o borra la cola vieja, esta lista se actualiza a propósito, no en silencio
    expect(r.huerfanos.length).toBeLessThanOrEqual(HUERFANOS_CONOCIDOS.length)
  })

  it('el journey_completed huérfano ya NO alimenta al sobre (una sola fuente · no salen dos sobres)', () => {
    const entradas = Object.entries(alta.connections as Record<string, { main?: Array<Array<{ node: string }>> }>)
      .filter(([, c]) => (c.main ?? []).some((arr) => (arr ?? []).some((x) => x.node === SOBRE)))
      .map(([k]) => k)
    expect(entradas).toEqual([FINAL_REAL])
  })

  it('el veredicto del script coincide', () => {
    expect(veredicto(r)).toEqual({ ok: true, problemas: [] })
  })
})
