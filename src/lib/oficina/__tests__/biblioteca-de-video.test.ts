/**
 * SPRINT 2 · S2-2 · la biblioteca de planos y los ritmos del video (GO Lenovo 16-nov 21:55) · US$ 0, sin base ni red ni modelo.
 *  · lo puro: lectura tolerante, lo general + lo del rubro del cliente, el ritmo que aplica, los AVISOS de ritmo (sin reja) y la sección que lee la mesa;
 *  · el dato sembrado: ids únicos, roles y rubros conocidos, cantidades, permisos de solo lectura, y que todo lo sembrado se lee igual que en vivo;
 *  · el turno: solo la mesa de VIDEO la recibe; sin puerto o con error, el turno sigue sin la sección.
 */
import { describe, expect, it } from 'vitest'
import { FAMILIAS } from '@/lib/fuentes-publicas/catalogo'
import { ROLES_DEL_PLANO, avisosDeRitmo, bibliotecaDelCliente, leerFichas, leerRitmos, ritmoPara, seccionDeLaBiblioteca } from '../video/biblioteca'
import { FILAS_FICHAS, FILAS_RITMOS, LECTURA_DE_LA_SEMILLA as LECTURA, REVERSA, SQL } from './biblioteca-semilla'
import { bibliotecaDelTurno } from '../mesa/orquestador'
import type { Encargo, Puertos } from '../puertos'
import type { EstadoMesa } from '../mesa/tipos'

describe('el dato sembrado (202611162230)', () => {
  it('23 fichas generales + 9 por rubro, 5 ritmos; ids únicos; roles del catálogo; rubros que existen en las familias', () => {
    expect(FILAS_FICHAS.filter((f) => !f.rubros.length)).toHaveLength(23)
    expect(FILAS_FICHAS.filter((f) => f.rubros.length)).toHaveLength(9)
    expect(FILAS_RITMOS).toHaveLength(5)
    expect(new Set(FILAS_FICHAS.map((f) => f.id)).size).toBe(FILAS_FICHAS.length)
    for (const f of FILAS_FICHAS) {
      expect(f.roles.length, f.id).toBeGreaterThan(0)
      for (const r of f.roles) expect(ROLES_DEL_PLANO as readonly string[], `${f.id} · ${r}`).toContain(r)
      for (const r of f.rubros) expect(Object.keys(FAMILIAS), `${f.id} · ${r}`).toContain(r)
      expect(f.segundos_max, f.id).toBeGreaterThanOrEqual(f.segundos_min)
    }
    // cada rol de la historia tiene al menos una ficha general
    for (const r of ROLES_DEL_PLANO) expect(FILAS_FICHAS.some((f) => !f.rubros.length && f.roles.includes(r)), r).toBe(true)
  })
  it('todo lo sembrado se lee (nada se pierde en la lectura tolerante) y los ritmos cubren de 5 a 60 s sin huecos', () => {
    expect(leerFichas(FILAS_FICHAS)).toHaveLength(FILAS_FICHAS.length)
    expect(leerRitmos(FILAS_RITMOS)).toHaveLength(5)
    const generales = leerRitmos(FILAS_RITMOS).filter((r) => !r.red)
    for (const sg of [5, 6, 8, 8.4, 8.5, 9, 12, 15, 15.4, 15.5, 16, 30, 30.5, 31, 45, 60, 60.4]) expect(ritmoPara(sg, 'instagram', generales), `${sg} s`).not.toBeNull()
  })
  it('solo lectura para el servidor, nada para anon ni authenticated; seguridad por fila; la reversa borra solo estas dos tablas', () => {
    for (const t of ['oficina_fichas_de_plano', 'oficina_ritmos_de_video']) {
      expect(SQL).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`)
      expect(SQL).toContain(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated, service_role;`)
      expect(SQL).toContain(`GRANT SELECT ON public.${t} TO service_role;`)
      expect(REVERSA).toContain(`DROP TABLE IF EXISTS public.${t};`)
    }
    expect(SQL).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)/)
    expect(REVERSA.match(/DROP TABLE/g)).toHaveLength(2)
  })
})

describe('lo puro', () => {
  it('la lectura es tolerante: sin id o sin nombre, o apagada, no entra; segundos al revés se corrigen; orden por `orden`', () => {
    const f = leerFichas([{ id: 'b', nombre: 'B', orden: 2, segundos_min: 3, segundos_max: 1 }, { id: '', nombre: 'x' }, { id: 'c' }, { id: 'a', nombre: 'A', orden: 1, segundos_min: 1, segundos_max: 2 }, { id: 'z', nombre: 'Z', activo: false }, null, 'basura'])
    expect(f.map((x) => x.id)).toEqual(['a', 'b'])
    expect(f[1]).toMatchObject({ segundos_min: 3, segundos_max: 3 })
    expect(leerFichas('no es lista')).toEqual([])
    expect(leerRitmos([{ id: 'r', segundos_min: 10, segundos_max: 5, planos_min: 1, planos_max: 2 }, { id: 'q', segundos_min: 1, segundos_max: 5 }])).toEqual([])
  })
  it('lo general + lo del rubro del cliente: un restaurante recibe las de comida; «software para restaurantes» NO; sin rubro, solo lo general', () => {
    const resto = bibliotecaDelCliente(LECTURA('Restaurante de mariscos'))
    expect(resto.familias).toContain('comida')
    expect(resto.fichas.map((f) => f.id)).toEqual(expect.arrayContaining(['vapor-y-servido', 'primer-bocado', 'golpe-de-detalle']))
    expect(resto.fichas.map((f) => f.id)).not.toContain('desempaque')
    const soft = bibliotecaDelCliente(LECTURA('software para restaurantes'))
    expect(soft.fichas.map((f) => f.id)).toContain('el-problema-en-una-imagen')
    expect(soft.fichas.map((f) => f.id)).not.toContain('vapor-y-servido')
    const nada = bibliotecaDelCliente(LECTURA(null))
    expect(nada.familias).toEqual([])
    expect(nada.fichas.every((f) => !f.rubros.length)).toBe(true)
    expect(nada.fichas).toHaveLength(23)
  })
  it('el ritmo que aplica: el de la red si lo hay; si no, el general; fuera de todo rango, ninguno', () => {
    const rs = leerRitmos(FILAS_RITMOS)
    expect(ritmoPara(12, 'instagram', rs)?.id).toBe('reel-9-15')
    expect(ritmoPara(120, 'youtube', rs)?.id).toBe('largo-youtube')
    expect(ritmoPara(120, 'instagram', rs)).toBeNull()
    expect(ritmoPara(12, null, rs)?.id).toBe('reel-9-15')
    const conRubro = leerRitmos([...FILAS_RITMOS, { ...FILAS_RITMOS[1], id: 'reel-comida', rubros: ['comida'] }])
    expect(ritmoPara(12, 'instagram', conRubro)?.id).toBe('reel-comida')
  })
  it('los avisos de ritmo AVISAN y nunca rechazan: planos de menos, producto tarde o ausente; un guion dentro de la guía no tiene avisos', () => {
    const rs = leerRitmos(FILAS_RITMOS)
    expect(avisosDeRitmo({ segundos: 12, red: 'instagram', planos: [{ segundos: 4 }, { segundos: 4, producto: true }, { segundos: 4 }] }, rs)).toEqual([
      '12 s con 3 planos: la guía de ritmo «reel de 9 a 15 s» sugiere de 4 a 6',
      'el producto entra a los 4 s: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s',
    ])
    expect(avisosDeRitmo({ segundos: 12, planos: [{ segundos: 3 }, { segundos: 3 }, { segundos: 3 }, { segundos: 3 }] }, rs)).toEqual(['el producto no aparece en ningún plano: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s'])
    expect(avisosDeRitmo({ segundos: 12, planos: [{ segundos: 2, producto: true }, { segundos: 3 }, { segundos: 3 }, { segundos: 4 }] }, rs)).toEqual([])
    // el borde: «antes de 3 s» no incluye los 3 s justos
    expect(avisosDeRitmo({ segundos: 12, planos: [{ segundos: 3 }, { segundos: 3, producto: true }, { segundos: 3 }, { segundos: 3 }] }, rs)).toEqual(['el producto entra a los 3 s: la guía de ritmo «reel de 9 a 15 s» sugiere mostrarlo antes de 3 s'])
    expect(avisosDeRitmo({ segundos: 12, planos: [{ segundos: 2.9 }, { segundos: 3, producto: true }, { segundos: 3 }, { segundos: 3.1 }] }, rs)).toEqual([])
    expect(avisosDeRitmo({ segundos: 400, red: 'instagram', planos: [{ segundos: 400 }] }, rs)).toEqual([])
  })
  it('la sección es guía, no lista cerrada; lleva ritmos y fichas con rol, ejes, duración, efecto y trampas; vacía si no hay nada', () => {
    const t = seccionDeLaBiblioteca(bibliotecaDelCliente(LECTURA('restaurante')))
    expect(t).toMatch(/^## Biblioteca de planos y ritmos de la oficina \(guía para elegir, no lista cerrada\)/)
    expect(t).toMatch(/si otra técnica sirve mejor, úsala, nómbrala y di por qué/)
    expect(t).toMatch(/Cada técnica es protagonista una sola vez en el video/)
    expect(t).toMatch(/- \*\*9–15 s\*\* · de 4 a 6 planos · gancho dentro de los primeros 2 s · el producto en cuadro antes de 3 s/)
    expect(t).toMatch(/- \*\*vapor-y-servido\*\* · Vapor y servido: .* · rol: captar, conclusion · material producto · forma detalle · cámara: .* · intensidad alta · 1–2\.5 s · efecto: antojo inmediato · ojo: /)
    expect(seccionDeLaBiblioteca({ fichas: [], ritmos: [] })).toBe('')
  })
})

describe('el turno de la mesa', () => {
  const enc = { client_id: 'cli-1' } as unknown as Encargo
  const est = (tipo: EstadoMesa['tipo']) => ({ tipo }) as unknown as EstadoMesa
  it('solo la mesa de VIDEO la recibe, con el rubro del cliente; las demás mesas ni la piden', async () => {
    const pedidos: string[] = []
    const P = { mesa: { bibliotecaDeVideo: async (c: string) => { pedidos.push(c); return LECTURA('Restaurante') } } } as unknown as Puertos
    const v = await bibliotecaDelTurno(P, enc, est('video'))
    expect(v).toMatch(/vapor-y-servido/)
    expect(pedidos).toEqual(['cli-1'])
    expect(await bibliotecaDelTurno(P, enc, est('carrusel'))).toBeUndefined()
    expect(await bibliotecaDelTurno(P, enc, est('kit'))).toBeUndefined()
    expect(pedidos).toHaveLength(1)
  })
  it('sin puerto, con error o vacía: nada (el turno sigue igual)', async () => {
    expect(await bibliotecaDelTurno({ mesa: {} } as unknown as Puertos, enc, est('video'))).toBeUndefined()
    expect(await bibliotecaDelTurno({ mesa: { bibliotecaDeVideo: async () => { throw new Error('tabla caída') } } } as unknown as Puertos, enc, est('video'))).toBeUndefined()
    expect(await bibliotecaDelTurno({ mesa: { bibliotecaDeVideo: async () => ({ fichas: [], ritmos: [], industria: null }) } } as unknown as Puertos, enc, est('video'))).toBeUndefined()
  })
})

