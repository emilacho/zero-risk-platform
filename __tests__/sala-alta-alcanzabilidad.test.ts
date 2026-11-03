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
  it('03-nov · el alta NO pide el plan: no existe el sobre ni ningún nodo con intent «planear» (firma de Emilio 14:46Z · el plan sale al aprobar el manual)', () => {
    expect(r.sobre_existe, `«${SOBRE}» sigue en el alta`).toBe(false)
    expect(r.nodos_que_piden_planeacion).toEqual([])
    expect(alta.nodes.map((n: { name: string }) => n.name)).not.toContain(GUARDA)
  })

  it('«Llamar · Segunda Fase del alta» sigue siendo alcanzable: es el FINAL del alta (Notion, agenda, aviso, cierre) y nada cuelga de él', () => {
    expect(r.final_real_alcanzable, `«${FINAL_REAL}» no se alcanza desde «${DISPARADOR}»`).toBe(true)
    expect(r.camino[r.camino.length - 1]).toBe(FINAL_REAL)
    expect(sucesores(alta, FINAL_REAL)).toEqual([])
  })

  it('no hay huérfanos NUEVOS · los 24 conocidos están declarados por nombre', () => {
    expect(r.huerfanos_nuevos, `huérfanos no declarados: ${r.huerfanos_nuevos.join(' · ')}`).toEqual([])
    // si alguien reconecta o borra la cola vieja, esta lista se actualiza a propósito, no en silencio
    expect(r.huerfanos.length).toBeLessThanOrEqual(HUERFANOS_CONOCIDOS.length)
  })

  it('el veredicto del script coincide', () => {
    expect(veredicto(r, alta)).toEqual({ ok: true, problemas: [] })
  })

  it('🔴 mutante · si el sobre vuelve a colgar de la segunda fase, el veredicto FALLA', () => {
    const m = JSON.parse(JSON.stringify(alta)) as typeof alta
    m.nodes.push({ name: SOBRE, type: 'n8n-nodes-base.httpRequest', parameters: { jsonBody: '={ "intent": "planear" }' } })
    m.connections[FINAL_REAL] = { main: [[{ node: SOBRE, type: 'main', index: 0 }]] }
    const v = veredicto(analizar(m), m)
    expect(v.ok).toBe(false)
    expect(v.problemas.join(' ')).toMatch(/sigue en el alta/)
  })

  it('🔴 mutante · con OTRO nombre pero que pide planeación (intent «planear») también falla', () => {
    const m = JSON.parse(JSON.stringify(alta)) as typeof alta
    m.nodes.push({ name: 'Pedir plan por otra puerta', type: 'n8n-nodes-base.httpRequest', parameters: { jsonBody: '={ "source": "x", "intent": "planear" }' } })
    m.connections[FINAL_REAL] = { main: [[{ node: 'Pedir plan por otra puerta', type: 'main', index: 0 }]] }
    expect(veredicto(analizar(m), m).problemas.join(' ')).toMatch(/piden planeación/)
  })

  // ── E73 · los huecos de E72 (CC#2) que siguen vigentes ──
  it('E73 · hueco 1 · ningún nodo del camino está DESACTIVADO y «Llamar» espera a la segunda fase', () => {
    const byName = new Map((alta.nodes as Array<{ name: string; disabled?: boolean; parameters?: { options?: { waitForSubWorkflow?: boolean } } }>).map((n) => [n.name, n]))
    const desactivados = r.camino.filter((n) => byName.get(n)?.disabled)
    expect(desactivados, `desactivados en el camino: ${desactivados.join(' · ')}`).toEqual([])
    expect(byName.get(FINAL_REAL)?.parameters?.options?.waitForSubWorkflow).not.toBe(false)
    expect(huecos(alta, r)).toEqual([])
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
