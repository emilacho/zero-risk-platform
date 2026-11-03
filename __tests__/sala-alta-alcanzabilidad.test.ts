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
  huecos,
  guardaSeComporta,
  sucesores,
  compararConMotor,
  HUERFANOS_CONOCIDOS,
  SOBRE,
  FINAL_REAL,
  DISPARADOR,
  GUARDA,
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
    expect(veredicto(r, alta)).toEqual({ ok: true, problemas: [] })
  })

  // ── E73 · los huecos de E72 (CC#2) ──
  it('E73 · hueco 1 · ningún nodo del camino está DESACTIVADO y «Llamar» espera a la segunda fase', () => {
    const byName = new Map((alta.nodes as Array<{ name: string; disabled?: boolean; parameters?: { options?: { waitForSubWorkflow?: boolean } } }>).map((n) => [n.name, n]))
    const desactivados = r.camino.filter((n) => byName.get(n)?.disabled)
    expect(desactivados, `desactivados en el camino: ${desactivados.join(' · ')}`).toEqual([])
    expect(byName.get(FINAL_REAL)?.parameters?.options?.waitForSubWorkflow).not.toBe(false)
  })

  it('E73 · hueco 2 · la GUARDA existe, es la salida del sobre y lanza cuando ok !== true', () => {
    const guarda = (alta.nodes as Array<{ name: string; disabled?: boolean; parameters?: { jsCode?: string } }>).find((n) => n.name === GUARDA)
    expect(guarda, `falta «${GUARDA}»`).toBeDefined()
    expect(guarda?.disabled).not.toBe(true)
    expect(sucesores(alta, SOBRE)).toEqual([GUARDA])
    // E75 · comportamiento, no palabras: la guarda se EJECUTA en banco
    const g = guardaSeComporta(String(guarda?.parameters?.jsCode ?? ''))
    expect(g.lanza_con_rechazo, 'la GUARDA no lanza con ok:false').toBe(true)
    expect(g.pasa_con_duplicate, 'la GUARDA no deja pasar un duplicate').toBe(true)
    expect(huecos(alta, r)).toEqual([])
  })

  it('E75 · una guarda NEUTRALIZADA que conserva las palabras en comentarios ya NO pasa (H2c de E74)', () => {
    const neutralizada = [
      '// antes: if (cuerpo.ok !== true) { throw new Error("SOBRE_RECHAZADO") }',
      'const r = $input.first().json;',
      'return [{ json: { dejado_en_la_puerta: true, kind: (r.body || r).kind } }];',
    ].join('\n')
    const g = guardaSeComporta(neutralizada)
    expect(g.lanza_con_rechazo).toBe(false)
    const mutada = JSON.parse(JSON.stringify(alta)) as typeof alta
    const gm = (mutada.nodes as Array<{ name: string; parameters: { jsCode?: string } }>).find((n) => n.name === GUARDA)!
    gm.parameters.jsCode = neutralizada
    expect(huecos(mutada, analizar(mutada)).some((p) => /ya no lanza/.test(p))).toBe(true)
  })

  it('E73 · hueco 3 · la foto es la misma versión que el motor (sólo con N8N_API_KEY · secreto de GitHub)', async () => {
    const c = await compararConMotor(alta)
    if (c === null) {
      console.warn(`[E73] N8N_API_KEY ausente · la foto ${ultima} (${r.versionId}) NO se comparó con el motor · CI no puede ver una foto desalineada hasta que exista el secreto`)
      return
    }
    expect(c.versionId_motor, `la foto (${c.versionId_foto}) y el motor (${c.versionId_motor}) no son la misma versión · refrescar con --foto`).toBe(c.versionId_foto)
    expect(c.iguales).toBe(true)
    expect(veredicto(analizar(c.vivo), c.vivo)).toEqual({ ok: true, problemas: [] })
  })
})
