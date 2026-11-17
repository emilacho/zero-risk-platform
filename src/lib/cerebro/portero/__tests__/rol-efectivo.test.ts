/**
 * ENCARGO 3 de Cerebro, fase B (17-nov) · los lectores del cerebro usan el `papel` que escribió el cerebro antes que el `owner_role` guardado:
 * la cuenta propia guardada como competidor se lee propia, y una cuenta hallada por un hashtag («mercado») se lee referencia, no competencia. Sin papel, como antes.
 */
import { describe, expect, it } from 'vitest'
import type { Consulta, Fila } from '../../consulta'
import { leerFotos } from '../../lectores'
import { PLAZOS_EN_DIAS } from '../../plazos'
import { listarFotos } from '../fotos-pendientes'
import { listarVideos } from '../videos-lectura'
import { rolEfectivo } from '../../../portero-alimenta/embudo'

const C = 'cliente-a'
const consultaCon = (filas: Fila[]): Consulta => async (p) => ({ filas: filas.filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v))), error: null })
const foto = (id: string, owner_role: string, papel: string | null): Fila => ({ id, client_id: C, owner_role, papel, estado: 'ok', handle: 'cuenta', tipo: 'post_image', url: `https://x/${id}.jpg`, created_at: '2026-11-10T12:00:00Z', duplicado_de: null })
const video = (id: string, owner_role: string, papel: string | null): Fila => ({ id, client_id: C, owner_role, papel, estado: 'ok', handle: 'cuenta', tipo: 'reel', path: `v/${id}.mp4`, created_at: '2026-11-10T12:00:00Z' })

// como la base real: devuelve SOLO las columnas que se piden (una lectura que no pide `papel` no lo ve)
const consultaEstricta = (filas: Fila[]): Consulta => async (p) => ({ filas: filas.filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v))).map((x) => Object.fromEntries(p.columnas.filter((c) => c in x).map((c) => [c, x[c]]))), error: null })

describe('rolEfectivo', () => {
  it('el papel manda: propio y competidor tal cual; mercado y referencia → referencia; sin papel (o uno desconocido) → owner_role', () => {
    expect(rolEfectivo({ owner_role: 'competidor', papel: 'propio' })).toBe('propio')
    expect(rolEfectivo({ owner_role: 'referencia', papel: 'competidor' })).toBe('competidor')
    expect(rolEfectivo({ owner_role: 'competidor', papel: 'mercado' })).toBe('referencia')
    expect(rolEfectivo({ owner_role: 'propio', papel: 'referencia' })).toBe('referencia')
    expect(rolEfectivo({ owner_role: 'competidor', papel: null })).toBe('competidor')
    expect(rolEfectivo({ owner_role: 'competidor', papel: 'otro' })).toBe('competidor')
    expect(rolEfectivo(null)).toBe('')
  })
})

describe('🔴 los lectores del cerebro leen el papel', () => {
  const FOTOS = [foto('dup', 'competidor', 'propio'), foto('hash', 'competidor', 'mercado'), foto('comp', 'competidor', 'competidor'), foto('vieja', 'competidor', null)]
  it('listarFotos: la propia guardada como competidor cuenta propia; la de hashtag, referencia; sin papel, como se guardó', async () => {
    const r = await listarFotos(consultaCon(FOTOS), { cliente: C })
    if (!r.ok) throw new Error('debía leer')
    const por = Object.fromEntries(r.fotos.map((f) => [f.foto_id, f.origen]))
    expect(por).toEqual({ dup: 'propia', hash: 'referencia', comp: 'competencia', vieja: 'competencia' })
    expect(r.por_origen.propia.total).toBe(1)
    expect(r.por_origen.referencia.total).toBe(1)
    expect(r.por_origen.competencia.total).toBe(2)
    const solo = await listarFotos(consultaCon(FOTOS), { cliente: C, origen: 'competencia' })
    if (!solo.ok) throw new Error('debía leer')
    expect(solo.fotos.map((f) => f.foto_id).sort()).toEqual(['comp', 'vieja'])
  })
  it('listarVideos: igual, en el conteo, el filtro y cada video', async () => {
    const r = await listarVideos(consultaCon([video('dup', 'competidor', 'propio'), video('hash', 'competidor', 'mercado'), video('vieja', 'competidor', null)]), { cliente: C })
    if (!r.ok) throw new Error('debía leer')
    expect(Object.fromEntries(r.videos.map((v) => [v.video_id, v.origen]))).toEqual({ dup: 'propia', hash: 'referencia', vieja: 'competencia' })
    expect(r.por_origen).toEqual({ propia: 1, competencia: 1, referencia: 1 })
    const solo = await listarVideos(consultaCon([video('dup', 'competidor', 'propio'), video('hash', 'competidor', 'mercado')]), { cliente: C, origen: 'referencia' })
    if (!solo.ok) throw new Error('debía leer')
    expect(solo.videos.map((v) => v.video_id)).toEqual(['hash'])
  })
  it('leerFotos (la consulta): la propia guardada como competidor se lee de su fuente; la de hashtag, de tercero', async () => {
    const r = await leerFotos({ consulta: consultaCon([foto('dup', 'competidor', 'propio'), foto('hash', 'competidor', 'mercado'), foto('vieja', 'propio', null)]), cliente: C, ahora: new Date('2026-11-17T12:00:00Z'), plazos: PLAZOS_EN_DIAS })
    const por = Object.fromEntries(r.lineas.map((l) => [l.ref.split(':')[1], l.origen]))
    expect(por).toEqual({ dup: 'su_fuente', hash: 'tercero', vieja: 'su_fuente' })
  })
  it('los tres lectores PIDEN la columna papel (con una base que solo devuelve lo pedido)', async () => {
    const f = await listarFotos(consultaEstricta([foto('dup', 'competidor', 'propio')]), { cliente: C })
    if (!f.ok) throw new Error('debía leer')
    expect(f.fotos[0].origen).toBe('propia')
    const v = await listarVideos(consultaEstricta([video('dup', 'competidor', 'propio')]), { cliente: C })
    if (!v.ok) throw new Error('debía leer')
    expect(v.videos[0].origen).toBe('propia')
    const l = await leerFotos({ consulta: consultaEstricta([foto('dup', 'competidor', 'propio')]), cliente: C, ahora: new Date('2026-11-17T12:00:00Z'), plazos: PLAZOS_EN_DIAS })
    expect(l.lineas[0].origen).toBe('su_fuente')
  })
})
