/**
 * 18-nov · la oficina lee el `papel` de la fase B del cerebro (CAMPOS-CC-CEREBRO-a-CC1-CC4-LENOVO-origen-de-lo-ajeno) · US$ 0, sin base ni red.
 * El rol sale de la regla del cerebro (`rolEfectivo`: papel si existe, si no `owner_role`), una copia (`duplicado_de`) no cuenta dos veces
 * y lo ajeno sin motivo va APARTE, nunca entre las referencias ni la competencia.
 */
import { describe, expect, it } from 'vitest'
import { separarFotos, separarFotosYCapturas } from '../material'
import { idsDeFotosPropias } from '../fotos-propias-datos'
import { leerReferenciasDeVideo } from '../mesa/lectura-referencias'
import { desarmarReferencias, type FilasDeReferencias } from '../video/referencias'

type F = Record<string, unknown>
const ids = (xs: Array<{ id?: string; video_id?: string }>) => xs.map((x) => x.id ?? x.video_id)

describe('fotos · el papel manda sobre owner_role', () => {
  const filas: F[] = [
    { id: 'hashtag', owner_role: 'competidor', papel: 'mercado' },
    { id: 'anuncio', owner_role: 'competidor', papel: 'referencia' },
    { id: 'propia-mal-guardada', owner_role: 'competidor', papel: 'propio' },
    { id: 'competidor-real', owner_role: 'competidor', papel: 'competidor' },
    { id: 'vieja-sin-papel', owner_role: 'propio' },
    { id: 'vieja-competidor', owner_role: 'competidor' },
  ]
  it('🔴 una cuenta de hashtag deja de ser competencia; la cuenta propia mal guardada vuelve a ser propia; sin papel, owner_role', () => {
    const r = separarFotos(filas)
    expect(ids(r.propias)).toEqual(['propia-mal-guardada', 'vieja-sin-papel'])
    expect(r.referencias.map((f) => [f.id, f.origen])).toEqual([['hashtag', 'referencia'], ['anuncio', 'referencia'], ['competidor-real', 'competencia'], ['vieja-competidor', 'competencia']])
  })
  it('🔴 una copia (`duplicado_de`) no se cuenta: ni propia ni referencia', () => {
    const r = separarFotos([{ id: 'original', owner_role: 'propio', papel: 'propio' }, { id: 'copia', owner_role: 'propio', papel: 'propio', duplicado_de: 'original' }, { id: 'vacia', owner_role: 'propio', duplicado_de: '' }])
    expect(ids(r.propias)).toEqual(['original', 'vacia'])
    expect(r.referencias).toEqual([])
  })
  it('🔴 lo ajeno sin motivo va APARTE: nunca entre las referencias; lo propio nunca es «sin motivo»', () => {
    const r = separarFotos([{ id: 'medellin', owner_role: 'competidor', papel: 'mercado', sin_motivo: true }, { id: 'con-motivo', owner_role: 'competidor', papel: 'mercado', sin_motivo: false }, { id: 'propia', papel: 'propio', sin_motivo: true }])
    expect(ids(r.sin_motivo)).toEqual(['medellin'])
    expect(ids(r.referencias)).toEqual(['con-motivo'])
    expect(ids(r.propias)).toEqual(['propia'])
  })
  it('🔴 con las capturas de la web: las sin motivo también quedan aparte', () => {
    const r = separarFotosYCapturas([{ id: 'cap', clase: 'captura_web', owner_role: 'competidor', papel: 'mercado', sin_motivo: true }, { id: 'f', owner_role: 'competidor', papel: 'mercado', sin_motivo: true }, { id: 'ok', owner_role: 'competidor', papel: 'competidor' }])
    expect(ids(r.sin_motivo).sort()).toEqual(['cap', 'f'])
    expect(r.sin_motivo.find((x) => x.id === 'cap')?.captura_web).toBeUndefined()
    expect(ids(r.referencias)).toEqual(['ok'])
  })
})

describe('las lecturas piden las columnas nuevas', () => {
  function base(filas: F[]) {
    const pedidos: Array<{ tabla: string; columnas: string }> = []
    const db = {
      from(tabla: string) {
        const q: any = {}
        q.select = (columnas: string) => { pedidos.push({ tabla, columnas }); return q }
        for (const m of ['eq', 'in', 'not', 'order']) q[m] = () => q
        q.limit = async () => ({ data: filas, error: null })
        return q
      },
    }
    return { db, pedidos }
  }
  const columnas = (s: string) => s.split(',').map((c) => c.trim())
  it('🔴 las fotos propias: papel, sin_motivo y duplicado_de (y la copia o la del hashtag no entran)', async () => {
    const { db, pedidos } = base([{ id: 'p', owner_role: 'propio', papel: 'propio' }, { id: 'copia', owner_role: 'propio', duplicado_de: 'p' }, { id: 'h', owner_role: 'propio', papel: 'mercado' }])
    expect(await idsDeFotosPropias(db as never, 'k')).toEqual(['p'])
    expect(columnas(pedidos[0].columnas)).toEqual(expect.arrayContaining(['owner_role', 'papel', 'sin_motivo', 'duplicado_de']))
  })
  it('🔴 los videos de referencia: papel y sin_motivo', async () => {
    const { db, pedidos } = base([])
    await leerReferenciasDeVideo(db as never, 'k')
    expect(columnas(pedidos.find((p) => p.tabla === 'client_videos')!.columnas)).toEqual(expect.arrayContaining(['owner_role', 'papel', 'sin_motivo']))
  })
})

describe('videos de referencia · el papel manda', () => {
  const video = (id: string, x: F = {}): F => ({ id, owner_role: 'competidor', handle: `cuenta-${id}`, tipo: 'reel', estado: 'ok', duracion_s: 20, caption: `pie ${id}`, transcripcion: `dice ${id}`, metricas: {}, ...x })
  const momentos = (id: string): F[] => Array.from({ length: 5 }, (_, i) => ({ video_id: id, posicion: `hijo-${i + 1}`, estado: 'ok', que_muestra: `${id} momento ${i + 1}`, tipo_de_toma: 'producto', texto_visible: '', producto_visto: [], con_personas: false }))
  const filas = (videos: F[]): FilasDeReferencias => ({ videos, tendencias: [], capturas: videos.flatMap((v) => momentos(String(v.id))) })
  it('🔴 el video propio guardado como competidor NO entra; el de mercado sí; el sin motivo no', () => {
    const r = desarmarReferencias(filas([video('propio', { papel: 'propio' }), video('mercado', { papel: 'mercado' }), video('sin-motivo', { papel: 'mercado', sin_motivo: true }), video('viejo')]), { maximo: 5 })
    expect(ids(r).sort()).toEqual(['mercado', 'viejo'])
  })
  it('🔴 un video guardado como propio que el cerebro marcó de mercado SÍ entra como referencia', () => {
    const r = desarmarReferencias(filas([video('mal-guardado', { owner_role: 'propio', papel: 'mercado' })]), { maximo: 5 })
    expect(ids(r)).toEqual(['mal-guardado'])
  })
  it('🔴 el nivel sale del papel: una referencia vieja que el cerebro marcó competidor es «directa»', () => {
    const r = desarmarReferencias(filas([video('a', { owner_role: 'referencia', papel: 'competidor' }), video('b', { owner_role: 'competidor', papel: 'mercado' })]), { maximo: 5 })
    expect(Object.fromEntries(r.map((x) => [x.video_id, x.nivel]))).toEqual({ a: 'directa', b: 'competencia' })
  })
})
