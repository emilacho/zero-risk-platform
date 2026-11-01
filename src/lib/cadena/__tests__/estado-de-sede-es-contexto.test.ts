/**
 * ADENDA de Emilio (01-nov): el estado de una sede es CONTEXTO. Ninguna regla por código excluye piezas ni planeación; el plan decide. La única guarda es de veracidad. US$ 0, sin red.
 * Sin ninguna sede con estado, cada pedido queda idéntico a hoy.
 */
import { describe, expect, it } from 'vitest'
import { validarTodo, type InsumosCalendario, type PiezaAgente, type TandaAgente } from '../index'
import { AVISO_DE_HORARIO_CERRADA, AVISO_DE_HORARIO_POR_ABRIR, contextoDeEstado, type EstadoDeSede } from '../../sedes/por-abrir'
import { clienteA, contextoDe, filasDe, formatosDeLaMigracion, tandaBuena } from '../__fixtures__/clientes'
import { tareaDeCalendario, tareaDeEstrategia } from '../indicaciones'
import { marcoDelBrief, marcoDelConcepto } from '../mesas'

const A = clienteA()
const FORMATOS = formatosDeLaMigracion()
const ctx = contextoDe(A)
const clave = A.sedes[0].clave
const conEstado = (estado: EstadoDeSede) => ({ ...ctx, sedes: ctx.sedes.map((s, i) => (i === 0 ? { ...s, estado } : s)) })

describe('el texto del contexto', () => {
  it('por abrir: dice que no es prohibición, nombra lo que sí se puede y conserva la veracidad', () => {
    const t = String(contextoDeEstado('por_abrir'))
    for (const palabra of ['no una prohibición', 'No excluyas', 'el plan decide', 'expectativa', 'preinauguración', 'delivery', 'bienvenida', 'no afirmes que está abierta', 'horarios de local', 'requiere_abierto en false']) expect(t).toContain(palabra)
  })
  it('cerrada: tampoco prohíbe, y conserva la veracidad', () => {
    const t = String(contextoDeEstado('cerrada'))
    for (const palabra of ['no una prohibición', 'El plan decide', 'no afirmes que está abierta', 'horarios de local']) expect(t).toContain(palabra)
  })
  it('abierta o sin dato: nada que añadir', () => {
    expect(contextoDeEstado('abierta')).toBeNull(); expect(contextoDeEstado(undefined)).toBeNull(); expect(contextoDeEstado(null)).toBeNull()
  })
  it('los avisos que llegan al redactor conservan el dato y la veracidad, y ya no se leen como prohibición', () => {
    expect(AVISO_DE_HORARIO_POR_ABRIR).toMatch(/^sede por abrir: todavía no atiende al público; no afirmes horario ni atención de local/)
    expect(AVISO_DE_HORARIO_POR_ABRIR).toMatch(/expectativa, preinauguración, delivery y bienvenida/)
    expect(AVISO_DE_HORARIO_CERRADA).toMatch(/^sede cerrada: no atiende al público; no afirmes horario ni atención de local/)
    expect(AVISO_DE_HORARIO_CERRADA).toMatch(/el plan decide/)
  })
})

describe('los pedidos de quien planea', () => {
  const pedidos: Array<[string, (c: typeof ctx) => string]> = [
    ['estrategia', (c) => tareaDeEstrategia({ ctx: c, formatosPermitidos: { instagram: ['post'] }, version: 1 })],
    ['calendario', (c) => tareaDeCalendario({ ctx: c, estrategia: A.estrategia, tanda: 1, semanas: [1, 2, 3, 4], filasPrevias: [] } as never)],
    ['brief', (c) => marcoDelBrief({ ctx: c, estrategia: A.estrategia, version: 1, devolucion: null, nota: null })],
    ['concepto', (c) => marcoDelConcepto({ ctx: c, estrategia: A.estrategia, briefTexto: 'brief', version: 1, devolucion: null, nota: null } as never)],
  ]
  it.each(pedidos)('%s: sin estado queda idéntico; abierta también', (_n, armar) => {
    expect(armar(conEstado('abierta'))).toBe(armar(ctx))
  })
  it.each(pedidos)('%s: por abrir y cerrada llegan como contexto, junto a su sede y una sola vez', (_n, armar) => {
    for (const e of ['por_abrir', 'cerrada'] as const) {
      const nota = String(contextoDeEstado(e))
      const t = armar(conEstado(e))
      expect(t.split('\n').find((l) => l.includes(nota))).toContain(clave)
      expect(t.split(nota)).toHaveLength(2)
    }
  })
})

describe('🔴 una sede por abrir o cerrada SÍ recibe piezas cuando el plan las pide', () => {
  const bueno = tandaBuena(A)
  const insumos = (t: TandaAgente, estado: EstadoDeSede | undefined): InsumosCalendario => ({
    campana: A.campana, estrategia: A.estrategia, planTexto: A.planTexto, formatos: FORMATOS, sedes: A.sedes.map((s, i) => (i === 0 && estado ? { ...s, estado } : s)), referencias: A.referencias,
    clientId: A.clientId, ahora: A.ahora, filas: filasDe(A, t, FORMATOS), forbiddenWords: A.forbiddenWords, conocidos: A.conocidos,
  })
  const todasEnLaSede = (cambios: Partial<PiezaAgente>): TandaAgente => ({ ...bueno, piezas: bueno.piezas.map((p) => ({ ...p, sede: clave, ...cambios })) })
  const delEstado = (hs: ReturnType<typeof validarTodo>) => hs.filter((h) => h.chequeo === 'V06' && /depende de un local abierto/.test(h.ficha.que))
  const bloqueos = (hs: ReturnType<typeof validarTodo>) => hs.filter((h) => h.severidad === 'bloquea').map((h) => `${h.chequeo}: ${h.ficha.que}`)

  it.each(['por_abrir', 'cerrada'] as const)('%s: el mismo calendario da exactamente los mismos bloqueos que con la sede abierta, y sin aviso de estado', (estado) => {
    const t = todasEnLaSede({ requiere_abierto: false })
    const con = validarTodo(insumos(t, estado))
    expect(bloqueos(con)).toEqual(bloqueos(validarTodo(insumos(t, undefined))))
    expect(delEstado(con)).toEqual([])
  })
  it.each(['por_abrir', 'cerrada'] as const)('%s + pieza que exige local abierto: AVISO de veracidad, nunca bloqueo por el estado', (estado) => {
    const t = todasEnLaSede({ requiere_abierto: true })
    const con = validarTodo(insumos(t, estado))
    const avisos = delEstado(con)
    expect(avisos.length).toBeGreaterThan(0)
    expect(avisos.every((h) => h.severidad === 'aviso')).toBe(true)
    expect(avisos[0].ficha.que).toContain(clave)
    // lo que bloquea es el mismo horario de siempre, no el estado
    expect(bloqueos(con)).toEqual(bloqueos(validarTodo(insumos(t, undefined))))
  })
  it('abierta o sin dato: ningún aviso de estado', () => {
    const t = todasEnLaSede({ requiere_abierto: true })
    expect(delEstado(validarTodo(insumos(t, 'abierta')))).toEqual([])
    expect(delEstado(validarTodo(insumos(t, undefined)))).toEqual([])
  })
})
