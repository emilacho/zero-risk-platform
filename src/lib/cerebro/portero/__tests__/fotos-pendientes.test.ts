/** Fotos del cerebro (27-oct): lectura con origen y etiquetado automático con tope por cliente/día. US$ 0 · sin red (la base y el etiquetador son moldes). */
import { describe, expect, it } from 'vitest'
import type { Consulta, Fila } from '../../consulta'
import { etiquetarPendientes, idsDeFotosRepetidas, listarFotos, origenDeLaFoto, TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA } from '../fotos-pendientes'

const C = 'cliente-a'
const HOY = new Date('2026-10-27T14:30:00Z')
const foto = (id: string, rol: string, extra: Fila = {}): Fila => ({ id, client_id: C, owner_role: rol, estado: 'ok', handle: 'cuenta', tipo: 'post_image', url: `https://x/${id}.jpg`, created_at: '2026-10-20T12:00:00Z', etiquetada_en: null, duplicado_de: null, ...extra })
const consultaCon = (filas: Fila[], error: string | null = null): Consulta => async (p) => {
  if (error) return { filas: [], error }
  const f = filas.filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v)))
  return { filas: f, error: null }
}

describe('origen de la foto', () => {
  it('propio → propia · competidor → competencia · referencia → referencia · lo desconocido es competencia (ajeno)', () => {
    expect(origenDeLaFoto('propio')).toBe('propia')
    expect(origenDeLaFoto('competidor')).toBe('competencia')
    expect(origenDeLaFoto('referencia')).toBe('referencia')
    expect(origenDeLaFoto(undefined)).toBe('competencia')
  })
})

describe('listarFotos', () => {
  const filas = [
    foto('1', 'propio', { etiquetada_en: '2026-10-21T00:00:00Z', que_muestra: 'extintor rojo', producto_visto: ['extintor'], etiqueta_confianza: 'alta', con_personas: false }),
    foto('2', 'propio'), foto('3', 'competidor'), foto('4', 'propio', { duplicado_de: '1' }), foto('5', 'propio', { estado: 'no_bajo' }),
  ]
  it('cuenta por origen, deja fuera copias duplicadas y fotos sin archivo, y dice cuántas faltan por etiquetar', async () => {
    const r = await listarFotos(consultaCon(filas), { cliente: C })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.total).toBe(3)
    expect(r.por_origen.propia).toEqual({ total: 2, etiquetadas: 1 })
    expect(r.por_origen.competencia).toEqual({ total: 1, etiquetadas: 0 })
    expect(r.sin_etiquetar).toBe(2)
    expect(r.fotos.find((f) => f.foto_id === '1')).toMatchObject({ origen: 'propia', etiquetada: true, que_muestra: 'extintor rojo', producto_visto: ['extintor'], confianza: 'alta', con_personas: false })
    expect(r.modelos_llamados).toBe(0)
  })
  it('filtra por origen y por etiquetadas, y respeta el límite', async () => {
    const o = await listarFotos(consultaCon(filas), { cliente: C, origen: 'competencia' })
    expect(o.ok && o.fotos.map((f) => f.foto_id)).toEqual(['3'])
    const e = await listarFotos(consultaCon(filas), { cliente: C, soloEtiquetadas: true })
    expect(e.ok && e.fotos.map((f) => f.foto_id)).toEqual(['1'])
    const l = await listarFotos(consultaCon(filas), { cliente: C, limite: 1 })
    expect(l.ok && l.devueltas).toBe(1)
  })
  it('un error de la base es un error, no una lista vacía; sin cliente o con origen raro, no se lee', async () => {
    expect((await listarFotos(consultaCon([], 'caída'), { cliente: C })).ok).toBe(false)
    expect((await listarFotos(consultaCon([]), { cliente: '' })).ok).toBe(false)
    expect((await listarFotos(consultaCon([]), { cliente: C, origen: 'x' as never })).ok).toBe(false)
  })
})

describe('el mismo archivo es UNA foto (df7e47cc, 27-oct: 11 «competidor» eran las propias)', () => {
  const dup = [foto('a', 'competidor', { hash_archivo: 'H1' }), foto('b', 'propio', { hash_archivo: 'H1' }), foto('c', 'competidor', { hash_archivo: 'H2' }), foto('d', 'propio'), foto('e', 'propio')]
  it('gana el origen más confiable del grupo; a igual origen, la primera por id; sin huella no se agrupa', () => {
    expect([...idsDeFotosRepetidas(dup)]).toEqual(['a'])
    const mismos = [foto('z', 'propio', { hash_archivo: 'H' }), foto('y', 'propio', { hash_archivo: 'H' })]
    expect([...idsDeFotosRepetidas(mismos)]).toEqual(['z'])
    expect(idsDeFotosRepetidas([foto('p', 'propio'), foto('q', 'propio')]).size).toBe(0)
  })
  it('la lectura no cuenta la repetida: 5 filas, 4 fotos, la «competencia» que era propia desaparece', async () => {
    const r = await listarFotos(consultaCon(dup), { cliente: C })
    expect(r.ok && r.total).toBe(4)
    expect(r.ok && r.por_origen.propia.total).toBe(3)
    expect(r.ok && r.fotos.map((f) => f.foto_id)).not.toContain('a')
  })
  it('el etiquetado no paga la repetida y lo dice', async () => {
    const vistas: string[] = []
    const r = await etiquetarPendientes({ consulta: consultaCon(dup), ahora: () => HOY, etiquetarFoto: async (a) => { vistas.push(a.foto_id); return { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 } } }, { clientes: [C], dry_run: false })
    expect(vistas).not.toContain('a')
    expect(vistas).toHaveLength(4)
    expect(r.informes[0].repetidas_omitidas).toBe(1)
  })
})

describe('etiquetarPendientes', () => {
  const base = [foto('c1', 'competidor'), foto('p1', 'propio'), foto('p2', 'propio'), foto('e1', 'propio', { etiquetada_en: '2026-10-27T13:00:00Z' })]
  const bien = (vistas: string[]) => async (a: { cliente: string; foto_id: string }) => { vistas.push(a.foto_id); return { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 } }
  it('en seco (por omisión) solo cuenta: no llama al modelo', async () => {
    const vistas: string[] = []
    const r = await etiquetarPendientes({ consulta: consultaCon(base), etiquetarFoto: bien(vistas), ahora: () => HOY }, { clientes: [C] })
    expect(r.dry_run).toBe(true)
    expect(vistas).toEqual([])
    expect(r.informes[0]).toMatchObject({ pendientes: 3, etiquetadas_hoy_antes: 1, intentadas: 0 })
  })
  it('etiqueta las PROPIAS primero y suma el costo', async () => {
    const vistas: string[] = []
    const r = await etiquetarPendientes({ consulta: consultaCon(base), etiquetarFoto: bien(vistas), ahora: () => HOY }, { clientes: [C], dry_run: false })
    expect(vistas).toEqual(['p1', 'p2', 'c1'])
    expect(r.etiquetadas).toBe(3)
    expect(r.costo_usd).toBeCloseTo(0.024, 6)
    expect(r.modelos_llamados).toBe(3)
  })
  it('el tope es por cliente y DÍA: descuenta lo ya etiquetado hoy y deja el resto para mañana', async () => {
    const vistas: string[] = []
    const r = await etiquetarPendientes({ consulta: consultaCon(base), etiquetarFoto: bien(vistas), ahora: () => HOY }, { clientes: [C], dry_run: false, tope_por_cliente: 2 })
    expect(vistas).toEqual(['p1'])
    expect(r.informes[0].omitidas_por_tope).toBe(2)
    expect(TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA).toBe(10)
  })
  it('una foto que falla no frena a las demás y queda anotada con su motivo', async () => {
    const r = await etiquetarPendientes({ consulta: consultaCon(base), ahora: () => HOY, etiquetarFoto: async (a) => (a.foto_id === 'p1' ? { llamo_al_modelo: false, escribio: false, costo_usd: 0, motivo: 'foto_fuera_del_almacen' } : { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 }) }, { clientes: [C], dry_run: false })
    expect(r.informes[0].etiquetadas).toBe(2)
    expect(r.informes[0].fallidas).toEqual([{ foto_id: 'p1', motivo: 'foto_fuera_del_almacen' }])
  })
  it('un etiquetador que lanza se anota como fallo, no tumba la pasada', async () => {
    const r = await etiquetarPendientes({ consulta: consultaCon(base), ahora: () => HOY, etiquetarFoto: async () => { throw new Error('boom') } }, { clientes: [C], dry_run: false })
    expect(r.informes[0].fallidas).toHaveLength(3)
    expect(r.etiquetadas).toBe(0)
  })
  it('el plazo total corta la pasada: lo que falta queda para la siguiente', async () => {
    let t = HOY.getTime()
    const r = await etiquetarPendientes({ consulta: consultaCon(base), plazoMs: 1000, ahora: () => new Date(t), etiquetarFoto: async () => { t += 600; return { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 } } }, { clientes: [C], dry_run: false })
    expect(r.informes[0].etiquetadas).toBeLessThan(3)
    expect(r.informes[0].omitidas_por_plazo).toBeGreaterThan(0)
  })
  it('un error de lectura de un cliente no impide a los otros', async () => {
    const consulta: Consulta = async (p) => (p.donde.client_id === 'roto' ? { filas: [], error: 'caída' } : consultaCon(base)(p))
    const r = await etiquetarPendientes({ consulta, etiquetarFoto: bien([]), ahora: () => HOY }, { clientes: ['roto', C], dry_run: false })
    expect(r.informes[0].error).toContain('caída')
    expect(r.informes[1].etiquetadas).toBe(3)
  })
})
