/** Fuentes públicas · lo que el manual lee de SALIDAS REALES de Apify (grabadas el 2026-10-12, recortadas a pocas filas y sin nombres de personas). Sin modelo, US$ 0. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fuentesDeRaspado, type FilaDeRaspado } from '../materia'

const DIR = path.join(process.cwd(), '__tests__', 'fixtures', 'fuentes-reales-r75')
const real = (fn: string): FilaDeRaspado => {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, fn + '.json'), 'utf8')) as { respuesta: unknown[] }
  return { id: 'real-' + fn, apify_function: fn, respuesta: j.respuesta, ensayo: false }
}
const PROPIOS = { sitio: 'https://negocio.example', handles: ['negocio_demo'] }
const claves = (fn: string) => Object.keys(((real(fn).respuesta as Array<Record<string, unknown>>)[0]) ?? {})

describe('salidas reales · cada función deja texto útil en el manual', () => {
  it.each(['resenas_google_maps', 'resenas_tripadvisor'])('%s → voz del público, sin el nombre de quien opinó', (fn) => {
    const f = fuentesDeRaspado([real(fn)], PROPIOS)
    const r = f.find((x) => x.canal === 'resenas')
    expect(r, fn).toBeTruthy()
    expect(r!.tipo).toBe('tercero')
    expect(r!.texto.length).toBeGreaterThan(40)
  })
  it.each(['publicaciones_facebook', 'videos_instagram', 'videos_tiktok', 'videos_youtube'])('%s → fuente propia con su texto', (fn) => {
    const f = fuentesDeRaspado([real(fn)], PROPIOS)
    expect(f.length, `${fn} · claves reales: ${claves(fn).join(',')}`).toBeGreaterThan(0)
    expect(f[0].tipo).toBe('primaria_propia')
    expect(f[0].texto.length).toBeGreaterThan(20)
  })
  it('una página que no existe (error del actor) no deja texto ni inventa nada', () => {
    expect(fuentesDeRaspado([real('resenas_facebook')], PROPIOS)).toEqual([])
  })
  it('lo que se DICE en un video real (transcripción) llega al manual cuando el actor la trae', () => {
    const f = fuentesDeRaspado([real('videos_instagram')], PROPIOS)
    expect(f[0].texto).toMatch(/\S+\s+\S+\s+\S+\s+\S+/)
    const conTranscripcion = (real('videos_instagram').respuesta as Array<Record<string, unknown>>).filter((x) => typeof x.transcript === 'string' && (x.transcript as string).length > 10)
    expect(conTranscripcion.length).toBeGreaterThan(0)
  })
})

describe('salida real de YouTube · los subtítulos vienen como lista de {srt}', () => {
  it('el manual lee lo que se dice, sin números ni tiempos', () => {
    const f = fuentesDeRaspado([real('videos_youtube')], PROPIOS)
    expect(f[0].texto).toContain('Lo primero que ves hacer a un niño')
    expect(f[0].texto).not.toContain('-->')
  })
})
