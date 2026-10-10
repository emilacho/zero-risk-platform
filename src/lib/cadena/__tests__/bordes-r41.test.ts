/**
 * Relevo 41 · segunda ronda del mutador de CC#3 (129 mutantes, 28 vivos): los bordes de comportamiento real que quedaban sin prueba
 * (jerarquía de fuentes, escalones del reloj, plazo exacto, validación de la estrategia). Cliente sintético.
 */
import { describe, it, expect } from 'vitest'
import { nivelEfectivo, fuerza } from '../fuentes'
import { escalonQueToca, invarianteDeReloj } from '../esperas'
import { problemasDeEsquema, validarEstrategia } from '../validador-estrategia'
import { relojDeLaCadena, abrirCampana } from '../index'
import { prepararCorrida } from '../nucleo'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion } from '../__fixtures__/clientes'
import type { Referencia } from '../tipos'

const ref = (o: Partial<Referencia>): Referencia => ({ id: 'r', client_id: 'c', origen: 'plan', texto: 't', ...o })

describe('jerarquía de fuentes · cada origen en su nivel', () => {
  it('manual y plan son F1 y sostienen (sin firma); sede_datos es F2 y sostiene', () => {
    expect(nivelEfectivo(ref({ origen: 'manual' }))).toEqual({ nivel: 'F1', sostiene: true, firmada: false })
    expect(nivelEfectivo(ref({ origen: 'plan' }))).toEqual({ nivel: 'F1', sostiene: true, firmada: false })
    expect(nivelEfectivo(ref({ origen: 'sede_datos' }))).toEqual({ nivel: 'F2', sostiene: true, firmada: false })
  })
  it('un trozo es F3 y SOLO sostiene si es de confianza (system o tenant); untrusted y unknown nunca', () => {
    expect(nivelEfectivo(ref({ origen: 'trozo', confianza: 'system_trusted' }))).toEqual({ nivel: 'F3', sostiene: true, firmada: false })
    expect(nivelEfectivo(ref({ origen: 'trozo', confianza: 'tenant_trusted' }))).toEqual({ nivel: 'F3', sostiene: true, firmada: false })
    expect(nivelEfectivo(ref({ origen: 'trozo', confianza: 'untrusted' })).sostiene).toBe(false)
    expect(nivelEfectivo(ref({ origen: 'trozo', confianza: 'unknown' })).sostiene).toBe(false)
    expect(nivelEfectivo(ref({ origen: 'trozo' })).sostiene).toBe(false)
  })
  it('una ficha firmada y vigente es F0; sin firma es F2 (sostiene); no vigente es F2 y NO sostiene', () => {
    expect(nivelEfectivo(ref({ origen: 'ficha', firmada: true }))).toEqual({ nivel: 'F0', sostiene: true, firmada: true })
    expect(nivelEfectivo(ref({ origen: 'ficha', firmada: false }))).toEqual({ nivel: 'F2', sostiene: true, firmada: false })
    expect(nivelEfectivo(ref({ origen: 'ficha', firmada: true, vigente: false }))).toEqual({ nivel: 'F2', sostiene: false, firmada: false })
  })
  it('la fuerza ordena F0 > F1 > F2 > F3 y, dentro del nivel, sitio > instagram > mapas', () => {
    const f = (o: Partial<Referencia>) => fuerza(ref(o))
    expect(f({ origen: 'ficha', firmada: true })).toBeGreaterThan(f({ origen: 'plan' }))
    expect(f({ origen: 'plan' })).toBeGreaterThan(f({ origen: 'sede_datos' }))
    expect(f({ origen: 'sede_datos' })).toBeGreaterThan(f({ origen: 'trozo' }))
    expect(f({ origen: 'sede_datos', fuente: 'sitio' })).toBeGreaterThan(f({ origen: 'sede_datos', fuente: 'instagram' }))
    expect(f({ origen: 'sede_datos', fuente: 'instagram' })).toBeGreaterThan(f({ origen: 'sede_datos', fuente: 'mapas' }))
    expect(f({ origen: 'sede_datos', fuente: 'mapas' })).toBeGreaterThan(f({ origen: 'sede_datos' }))
  })
})

describe('escalones del reloj · el instante exacto cuenta', () => {
  const e = { id: 1, estado: 'viva', vence_en: '2026-10-12T00:00:00Z', recordatorio_en: '2026-10-10T00:00:00Z', alerta_en: '2026-10-11T00:00:00Z', rung_enviado: 0, objeto_tipo: 't', objeto_id: 'o' }
  it('justo en el recordatorio, en la alerta y en el vencimiento TOCA (≥), un segundo antes no', () => {
    expect(escalonQueToca(e, '2026-10-09T23:59:59Z')).toBeNull()
    expect(escalonQueToca(e, '2026-10-10T00:00:00Z')).toBe(1)
    expect(escalonQueToca({ ...e, rung_enviado: 1 }, '2026-10-10T23:59:59Z')).toBeNull()
    expect(escalonQueToca({ ...e, rung_enviado: 1 }, '2026-10-11T00:00:00Z')).toBe(2)
    expect(escalonQueToca({ ...e, rung_enviado: 2 }, '2026-10-11T23:59:59Z')).toBeNull()
    expect(escalonQueToca({ ...e, rung_enviado: 2 }, '2026-10-12T00:00:00Z')).toBe(3)
  })
  it('un escalón ya enviado no se repite y una espera que no está viva no escala', () => {
    expect(escalonQueToca({ ...e, rung_enviado: 3 }, '2026-10-20T00:00:00Z')).toBeNull()
    expect(escalonQueToca({ ...e, estado: 'resuelta' }, '2026-10-20T00:00:00Z')).toBeNull()
  })
  it('el latido exactamente en el máximo NO es «vigía parado»; un segundo más, sí', () => {
    const base = { ahora: '2026-10-10T18:00:00Z', esperas: [], campanasEnEspera: [], filasEnEspera: [], esperasPorCampana: [], corridasEnCurso: [], latidoMaxHoras: 18 }
    expect(invarianteDeReloj({ ...base, ultimoLatido: '2026-10-10T00:00:00Z' })).toEqual([])
    expect(invarianteDeReloj({ ...base, ultimoLatido: '2026-10-09T23:59:59Z' }).map((v) => v.tipo)).toEqual(['vigia_parado'])
  })
  it('una fila en espera cuya espera es de OTRA campaña (mismo tipo y objeto) igual cuenta como sin reloj', () => {
    const v = invarianteDeReloj({ ahora: '2026-10-10T00:00:00Z', esperas: [], campanasEnEspera: [], filasEnEspera: [{ id: 'f1', estado: 'en_investigacion', campana_id: 'A' }], esperasPorCampana: [{ campana_id: 'B', objeto_tipo: 'dato_en_investigacion', objeto_id: 'f1' }], corridasEnCurso: [], ultimoLatido: '2026-10-10T00:00:00Z', latidoMaxHoras: 18 })
    expect(v.map((x) => x.tipo)).toEqual(['fila_sin_reloj'])
  })
})

describe('plazo de una llamada · el instante exacto no la vence', () => {
  it('el vigía NO vence una corrida cuyo plazo es exactamente ahora; un segundo después, sí', async () => {
    const A = clienteA()
    const al = new AlmacenMemoria({ contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'p', fecha: '2026-10-08' }] }, config: { flujos: ['wf'], estado_cadena: 'encendida', puerta_workflow_id: 'wf' } })
    await abrirCampana(al, { workflow_id: 'wf', workflow_execution_id: '1', client_id: A.clientId, seco: false }, '2026-10-09T12:00:00Z')
    const p = await prepararCorrida(al, al.campanas[0], 'estrategia', 'k', 'wf', 'e', '2026-10-09T12:00:00Z', 'm', 'h')
    if (p.tipo !== 'lista') throw new Error('x')
    const plazo = p.corrida.plazo_en!
    await relojDeLaCadena(al, { workflow_id: 'wf', workflow_execution_id: 'v' }, plazo)
    expect(al.corridas[0].estado).toBe('en_curso')
    await relojDeLaCadena(al, { workflow_id: 'wf', workflow_execution_id: 'v2' }, new Date(Date.parse(plazo) + 1000).toISOString())
    expect(al.corridas[0].estado).toBe('vencida')
  })
})

describe('la estrategia · bordes de la validación', () => {
  const A = clienteA()
  const FORMATOS = formatosDeLaMigracion()
  const copia = () => structuredClone(A.estrategia)
  it('día de la semana: 1 y 7 valen; 0 y 8 no', () => {
    for (const d of [1, 7]) { const e = copia(); e.patron_semanal[0].dia_semana = d; expect(problemasDeEsquema(e).filter((x) => /dia_semana/.test(x))).toEqual([]) }
    for (const d of [0, 8]) { const e = copia(); e.patron_semanal[0].dia_semana = d; expect(problemasDeEsquema(e).some((x) => /dia_semana/.test(x))).toBe(true) }
  })
  it('un hito necesita clave Y día entero Y tipo válido: le falta cualquiera y es un problema', () => {
    const base = { clave: 'h1', dia: 10, tipo: 'revision' }
    for (const roto of [{ ...base, clave: '' }, { ...base, dia: 'x' }, { ...base, tipo: 'otro' }, { ...base, clave: '', dia: 'x' }]) { const e = copia(); e.hitos = [roto as never]; expect(problemasDeEsquema(e).some((x) => /hitos\[0\]/.test(x)), JSON.stringify(roto)).toBe(true) }
    const e = copia(); e.hitos = [base as never]; expect(problemasDeEsquema(e).some((x) => /hitos/.test(x))).toBe(false)
  })
  it('una frecuencia de 0 por semana no pide aparecer en el plan', () => {
    const e = copia(); e.canales = e.canales.map((c) => ({ ...c, rol: 'principal', frecuencia: { ...c.frecuencia, feed_semana: 0 } })) as never
    expect(validarEstrategia(e, { planTexto: 'sin números de frecuencia', formatos: FORMATOS }).filter((h) => h.chequeo === 'S05')).toEqual([])
    const e2 = copia(); e2.canales = e2.canales.map((c) => ({ ...c, rol: 'principal', frecuencia: { ...c.frecuencia, feed_semana: 7 } })) as never
    expect(validarEstrategia(e2, { planTexto: 'sin números de frecuencia', formatos: FORMATOS }).some((h) => h.chequeo === 'S05')).toBe(true)
  })
  it('un tipo de fecha declarado por la estrategia: sin motivo concreto ni cita avisa; con motivo largo o con cita, no', () => {
    const f = (o: object) => ({ tipo: 'feriados', ambito: 'nacional', origen: 'estrategia', ...o })
    const s08 = (fi: object) => { const e = copia(); e.fechas_que_importan = [f(fi)] as never; return validarEstrategia(e, { planTexto: 'plan', formatos: FORMATOS }).filter((h) => h.chequeo === 'S08') }
    expect(s08({})).toHaveLength(1)
    expect(s08({ motivo: 'corto' })).toHaveLength(1)
    expect(s08({ motivo: 'un motivo bastante concreto y largo' })).toHaveLength(0)
    expect(s08({ cita_plan: 'dice feriados en el plan' })).toHaveLength(0)
    expect(s08({ origen: 'plan' })).toHaveLength(0) // declarado por el plan: no se le exige motivo
  })
})
