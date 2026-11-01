/**
 * Estado de sede «solo delivery» en la cadena (01-nov · firma de Emilio): lo que reciben quienes planean y lo que el validador del calendario admite. US$ 0, sin red.
 * Sin una sede marcada, cada pedido queda idéntico a hoy, byte a byte.
 */
import { describe, expect, it } from 'vitest'
import { validarTodo, type InsumosCalendario, type PiezaAgente, type TandaAgente } from '../index'
import { REGLA_SOLO_DELIVERY } from '../../sedes/por-abrir'
import { clienteA, contextoDe, filasDe, formatosDeLaMigracion, tandaBuena } from '../__fixtures__/clientes'
import { tareaDeCalendario, tareaDeEstrategia } from '../indicaciones'
import { marcoDelBrief, marcoDelConcepto } from '../mesas'

const A = clienteA()
const FORMATOS = formatosDeLaMigracion()
const ctx = contextoDe(A)
const clave = A.sedes[0].clave
const marcada = { ...ctx, sedes: ctx.sedes.map((s, i) => (i === 0 ? { ...s, solo_delivery: true } : s)) }

describe('los pedidos', () => {
  const pedidos: Array<[string, (c: typeof ctx) => string]> = [
    ['estrategia', (c) => tareaDeEstrategia({ ctx: c, formatosPermitidos: { instagram: ['post'] }, version: 1 })],
    ['calendario', (c) => tareaDeCalendario({ ctx: c, estrategia: A.estrategia, tanda: 1, semanas: [1, 2, 3, 4], filasPrevias: [] } as never)],
    ['brief', (c) => marcoDelBrief({ ctx: c, estrategia: A.estrategia, version: 1, devolucion: null, nota: null })],
    ['concepto', (c) => marcoDelConcepto({ ctx: c, estrategia: A.estrategia, briefTexto: 'brief', version: 1, devolucion: null, nota: null } as never)],
  ]
  it.each(pedidos)('%s: sin sede marcada no dice nada nuevo; con ella lleva la regla junto a esa sede', (_n, armar) => {
    expect(armar(ctx)).not.toContain('SOLO DELIVERY')
    const t = armar(marcada)
    expect(t).toContain(REGLA_SOLO_DELIVERY)
    expect(t.split('\n').find((l) => l.includes(REGLA_SOLO_DELIVERY))).toContain(clave)
    expect(t.split(REGLA_SOLO_DELIVERY)).toHaveLength(2)
  })
})

describe('el validador del calendario', () => {
  const insumos = (t: TandaAgente, extra: Partial<InsumosCalendario> = {}): InsumosCalendario => ({
    campana: A.campana, estrategia: A.estrategia, planTexto: A.planTexto, formatos: FORMATOS, sedes: A.sedes, referencias: A.referencias,
    clientId: A.clientId, ahora: A.ahora, filas: filasDe(A, t, FORMATOS), forbiddenWords: A.forbiddenWords, conocidos: A.conocidos, ...extra,
  })
  const bueno = tandaBuena(A)
  const primera = bueno.piezas[0]
  const con = (cambios: Partial<PiezaAgente>): TandaAgente => ({ ...bueno, piezas: bueno.piezas.map((p, i) => (i === 0 ? { ...p, sede: clave, ...cambios } : { ...p, requiere_abierto: false })) })
  const sedes = A.sedes.map((s, i) => (i === 0 ? { ...s, solo_delivery: true } : s))
  const delivery = (hs: ReturnType<typeof validarTodo>) => hs.filter((h) => h.chequeo === 'V06' && /solo por delivery/.test(h.ficha.que))
  it('una pieza que exige local abierto en una sede solo delivery bloquea, y dice qué hacer', () => {
    const hs = delivery(validarTodo(insumos(con({ requiere_abierto: true, hora: primera.hora }), { sedes })))
    expect(hs).toHaveLength(1)
    expect(hs[0].severidad).toBe('bloquea')
    expect(hs[0].ficha.que).toContain(clave)
  })
  it('una pieza sin esa exigencia pasa: la sede SÍ recibe piezas', () => {
    expect(delivery(validarTodo(insumos(con({ requiere_abierto: false }), { sedes })))).toEqual([])
  })
  it('una sede sin marcar sigue con la regla de siempre', () => {
    expect(delivery(validarTodo(insumos(con({ requiere_abierto: true }))))).toEqual([])
  })
})
