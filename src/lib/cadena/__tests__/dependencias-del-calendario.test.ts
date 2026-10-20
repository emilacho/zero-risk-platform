/**
 * Dependencias del calendario que el CÓDIGO resuelve solo · encargo «arreglar la segunda mitad» · parte 2 (CC#3 · 20-oct).
 * Causa medida en la repetición de la prueba real: 12 réplicas de Facebook dependían de la pieza de Instagram del mismo día a la MISMA hora; V11 comparaba solo la fecha,
 * la única corrección no lo arregló y la campaña quedó en `necesita_humano`. Todo sin modelo, sin red, sin base: US$ 0.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  resolverDependencias, saleAntes, validarTodo, expandirPatron, fusionarTanda,
  abrirCampana, estrategiaPreparar, estrategiaGuardar, calendarioPreparar, calendarioGuardar, validarSinEscribir,
  type Fila, type InsumosCalendario, type PiezaAgente,
} from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, filasDe, formatosDeLaMigracion, piezaBuena, tandaBuena } from '../__fixtures__/clientes'

const REAL = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/cadena/__fixtures__/calendario-repeticion-20oct.json'), 'utf8')).filas as Fila[]
const fila = (id: string, fecha: string, hora: string | null, dep: string[] = [], extra: Partial<Fila> = {}): Fila => ({
  id, tanda: 1, semana: 1, dia_semana: 1, fecha, hora, red: 'instagram', formato: 'foto', pilar: null, tema: null, sede: null, requiere_abierto: false,
  depende_de: dep, datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'propuesta', avisos: [], ...extra,
})
const congelar = <T,>(o: T): T => { const d = (x: unknown) => { if (x && typeof x === 'object') { Object.freeze(x); Object.values(x).forEach(d) } }; d(o); return o }

describe('saleAntes · la regla', () => {
  it('otra fecha anterior sí; la misma fecha solo si las dos tienen hora y la antecesora es anterior; lo demás no', () => {
    expect(saleAntes({ fecha: '2026-10-26', hora: null }, { fecha: '2026-10-27', hora: null })).toBe(true)
    expect(saleAntes({ fecha: '2026-10-27', hora: null }, { fecha: '2026-10-26', hora: null })).toBe(false)
    expect(saleAntes({ fecha: '2026-10-26', hora: '09:00:00' }, { fecha: '2026-10-26', hora: '10:00:00' })).toBe(true)
    expect(saleAntes({ fecha: '2026-10-26', hora: '09:00:00' }, { fecha: '2026-10-26', hora: '09:00:00' })).toBe(false)
    expect(saleAntes({ fecha: '2026-10-26', hora: '10:00' }, { fecha: '2026-10-26', hora: '09:00' })).toBe(false)
    expect(saleAntes({ fecha: '2026-10-26', hora: null }, { fecha: '2026-10-26', hora: '09:00' })).toBe(false)
    expect(saleAntes({ fecha: '2026-10-26', hora: '09:00' }, { fecha: '2026-10-26', hora: null })).toBe(false)
    expect(saleAntes({ fecha: '2026-10-26', hora: '25:99' }, { fecha: '2026-10-26', hora: '10:00' })).toBe(false)
  })
})

describe('los datos REALES de la repetición del 20-oct', () => {
  const conDep = REAL.filter((f) => f.depende_de.length)
  it('rojo (antes): las 12 réplicas dependen de una pieza del mismo día y a la misma hora → ninguna sale después', () => {
    expect(conDep).toHaveLength(12)
    const porId = new Map(REAL.map((f) => [f.id, f]))
    for (const f of conDep) { const a = porId.get(f.depende_de[0])!; expect(a.fecha).toBe(f.fecha); expect(a.hora).toBe(f.hora); expect(saleAntes(a, f)).toBe(false) }
  })
  it('verde: tras resolver, las 12 conservan su dependencia y ahora salen UNA HORA DESPUÉS de la original; nada más cambia', () => {
    const r = resolverDependencias(congelar(structuredClone(REAL)))
    const porId = new Map(r.filas.map((f) => [f.id, f]))
    for (const f of r.filas.filter((x) => x.depende_de.length)) { expect(saleAntes(porId.get(f.depende_de[0])!, f)).toBe(true); expect(f.hora).toBe('10:00:00') }
    expect(r.filas.filter((f) => f.depende_de.length)).toHaveLength(12)
    expect(r.notas).toHaveLength(12)
    for (const f of r.filas) {
      const o = REAL.find((x) => x.id === f.id)!
      if (conDep.some((c) => c.id === f.id)) { expect({ ...f, hora: o.hora, avisos: [] }).toEqual({ ...o, avisos: [] }); expect(f.avisos).toHaveLength(1) }
      else expect(f).toEqual(o) // las otras 52 filas, idénticas
    }
  })
  it('las fechas no se tocan nunca y la función es idempotente (la segunda pasada no cambia ni anota nada)', () => {
    const r1 = resolverDependencias(structuredClone(REAL)), r2 = resolverDependencias(r1.filas)
    expect(r1.filas.map((f) => f.fecha)).toEqual(REAL.map((f) => f.fecha))
    expect(r2.notas).toEqual([]); expect(r2.filas).toEqual(r1.filas)
  })
})

describe('qué hace con cada caso (sintético)', () => {
  it('antecesora en fecha anterior, o el mismo día con hora anterior: no toca nada', () => {
    const f = [fila('a', '2026-10-26', '09:00:00'), fila('b', '2026-10-27', '09:00:00', ['a']), fila('c', '2026-10-26', '11:00:00', ['a'])]
    const r = resolverDependencias(f); expect(r.filas).toEqual(f); expect(r.notas).toEqual([])
  })
  it('mismo día y misma hora: la dependiente pasa a +60 min y conserva el formato de la hora (con y sin segundos)', () => {
    expect(resolverDependencias([fila('a', '2026-10-26', '09:00:00'), fila('b', '2026-10-26', '09:00:00', ['a'])]).filas[1].hora).toBe('10:00:00')
    expect(resolverDependencias([fila('a', '2026-10-26', '09:30'), fila('b', '2026-10-26', '09:30', ['a'])]).filas[1].hora).toBe('10:30')
  })
  it('mismo día y la dependiente salía ANTES: pasa a +60 min de la antecesora', () => {
    const r = resolverDependencias([fila('a', '2026-10-26', '15:00'), fila('b', '2026-10-26', '08:00', ['a'])])
    expect(r.filas[1].hora).toBe('16:00'); expect(r.filas[1].depende_de).toEqual(['a']); expect(r.filas[1].avisos[0]).toContain('la hora pasó de 08:00 a 16:00')
  })
  it('mismo día sin hora que las ordene (de cualquiera de las dos): se suelta la dependencia y se anota', () => {
    for (const [ha, hb] of [[null, '09:00'], ['09:00', null], [null, null]] as const) {
      const r = resolverDependencias([fila('a', '2026-10-26', ha), fila('b', '2026-10-26', hb, ['a'])])
      expect(r.filas[1].depende_de).toEqual([]); expect(r.filas[1].hora).toBe(hb); expect(r.filas[1].avisos[0]).toContain('no hay hora que las ordene')
    }
  })
  it('la antecesora sale DESPUÉS: se suelta (no se mueve ninguna fecha)', () => {
    const r = resolverDependencias([fila('a', '2026-10-28', '09:00'), fila('b', '2026-10-26', '09:00', ['a'])])
    expect(r.filas[1].depende_de).toEqual([]); expect(r.filas.map((f) => f.fecha)).toEqual(['2026-10-28', '2026-10-26']); expect(r.filas[1].avisos[0]).toContain('sale después')
  })
  it('no existe, es ella misma o es un video que espera: se suelta cada una con su motivo', () => {
    const r = resolverDependencias([fila('v', '2026-10-25', '09:00', [], { estado: 'espera_video' }), fila('b', '2026-10-26', '09:00', ['v', 'fantasma', 'b'])])
    expect(r.filas[1].depende_de).toEqual([])
    const t = r.filas[1].avisos.join(' | ')
    expect(t).toContain('pieza de video'); expect(t).toContain('esa fila no existe'); expect(t).toContain('no puede depender de sí misma')
  })
  it('una dependencia buena y una mala en la misma fila: queda la buena', () => {
    const r = resolverDependencias([fila('a', '2026-10-25', '09:00'), fila('b', '2026-10-26', '09:00', ['a', 'fantasma'])])
    expect(r.filas[1].depende_de).toEqual(['a'])
  })
  it('una antecesora de una tanda ANTERIOR (previas) cuenta; sin ella, se suelta', () => {
    const previa = fila('p', '2026-10-20', '09:00')
    expect(resolverDependencias([fila('b', '2026-10-26', '09:00', ['p'])], [previa]).filas[0].depende_de).toEqual(['p'])
    expect(resolverDependencias([fila('b', '2026-10-26', '09:00', ['p'])]).filas[0].depende_de).toEqual([])
  })
  it('si no cabe una hora después en el mismo día (23:30), se suelta en vez de pasar la medianoche', () => {
    const r = resolverDependencias([fila('a', '2026-10-26', '23:30'), fila('b', '2026-10-26', '23:30', ['a'])])
    expect(r.filas[1].depende_de).toEqual([]); expect(r.filas[1].hora).toBe('23:30'); expect(r.filas[1].avisos[0]).toContain('no cabe una hora posterior')
  })
  it('un círculo (a↔b a la misma hora) termina y no deja ninguna dependencia imposible', () => {
    const r = resolverDependencias([fila('a', '2026-10-26', '09:00', ['b']), fila('b', '2026-10-26', '09:00', ['a'])])
    const porId = new Map(r.filas.map((f) => [f.id, f]))
    for (const f of r.filas) for (const d of f.depende_de) expect(saleAntes(porId.get(d)!, f)).toBe(true)
  })
  it('una cadena a→b→c a la misma hora queda escalonada: 09:00, 10:00, 11:00', () => {
    const r = resolverDependencias([fila('a', '2026-10-26', '09:00'), fila('b', '2026-10-26', '09:00', ['a']), fila('c', '2026-10-26', '09:00', ['b'])])
    expect(r.filas.map((f) => f.hora)).toEqual(['09:00', '10:00', '11:00']); expect(r.filas.map((f) => f.depende_de)).toEqual([[], ['a'], ['b']])
  })
  it('la misma cadena con las filas en el orden contrario (c, b, a) también queda escalonada: hacen falta varias pasadas', () => {
    const r = resolverDependencias([fila('c', '2026-10-26', '09:00', ['b']), fila('b', '2026-10-26', '09:00', ['a']), fila('a', '2026-10-26', '09:00')])
    expect(r.filas.map((f) => f.hora)).toEqual(['11:00', '10:00', '09:00'])
    const porId = new Map(r.filas.map((f) => [f.id, f]))
    for (const f of r.filas) for (const d of f.depende_de) expect(saleAntes(porId.get(d)!, f)).toBe(true)
  })
  it('no muta lo que recibe (entrada congelada) y devuelve filas nuevas', () => {
    const entrada = congelar([fila('a', '2026-10-26', '09:00'), fila('b', '2026-10-26', '09:00', ['a'])])
    const r = resolverDependencias(entrada)
    expect(r.filas[1]).not.toBe(entrada[1]); expect(entrada[1].hora).toBe('09:00'); expect(entrada[1].avisos).toEqual([])
  })
  it('una fila sin dependencias no se toca ni se anota', () => {
    const f = [fila('a', '2026-10-26', '09:00'), fila('b', '2026-10-26', '09:00')]
    const r = resolverDependencias(f); expect(r.filas).toEqual(f); expect(r.notas).toEqual([])
  })
})

describe('el validador (V11) y el flujo', () => {
  const FORMATOS = formatosDeLaMigracion()
  const A = clienteA()
  const insumos = (filas: Fila[]): InsumosCalendario => ({
    campana: A.campana, estrategia: A.estrategia, planTexto: A.planTexto, formatos: FORMATOS, sedes: A.sedes, referencias: A.referencias,
    clientId: A.clientId, ahora: A.ahora, filas, forbiddenWords: A.forbiddenWords, conocidos: A.conocidos, registro: 'tu',
  })
  // 'b' (instagram, jueves 09:00) y 'd' (facebook, jueves 11:00) caen el mismo día en la fixture
  const tandaConReplica = (horaDeD: string) => {
    const t = tandaBuena(A)
    return { ...t, piezas: t.piezas.map((p: PiezaAgente) => (p.semana === 1 && p.slot === 'd' ? { ...p, hora: horaDeD, depende_de: ['s1-d4-b'] } : p)) }
  }
  const v11 = (filas: Fila[]) => validarTodo(insumos(filas)).filter((h) => h.chequeo === 'V11' && h.severidad === 'bloquea')

  it('rojo: sin resolver, la réplica a la misma hora que su original bloquea con V11 (el defecto de la prueba real)', () => {
    expect(v11(filasDe(A, tandaConReplica('09:00'), FORMATOS))).toHaveLength(1)
  })
  it('la misma réplica UNA HORA DESPUÉS ya NO bloquea: V11 mira la hora, no solo la fecha', () => {
    expect(v11(filasDe(A, tandaConReplica('10:00'), FORMATOS))).toEqual([])
  })
  it('verde: resuelta por el código, V11 no bloquea y la fila sale una hora después con su aviso', () => {
    const esq = expandirPatron(A.estrategia, A.campana, A.campana.semanas, A.campana.tanda, FORMATOS)
    const filas = resolverDependencias(fusionarTanda(esq, tandaConReplica('09:00'), A.estrategia, A.campana, A.campana.tanda, FORMATOS).filas).filas
    expect(v11(filas)).toEqual([])
    const d = filas.find((f) => f.id === 's1-d4-d')!
    expect(d.hora).toBe('10:00'); expect(d.depende_de).toEqual(['s1-d4-b']); expect(d.avisos.join(' ')).toContain('para salir después de «s1-d4-b»')
  })
  it('🔴 de punta a punta: la tanda con la réplica a la misma hora NO pide corrección ni deja la campaña en necesita_humano; la fila guardada sale una hora después y anotada', async () => {
    const AHORA = '2026-10-09T12:00:00Z'
    const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })
    const c = await abrirCampana(al, { ...wf, client_id: A.clientId, seco: true }, AHORA)
    const id = (c.cuerpo.campana as { id: string }).id
    const pe = await estrategiaPreparar(al, { ...wf, campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf, campana_id: id, corrida_id: pe.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    const p = await calendarioPreparar(al, { ...wf, campana_id: id, tanda: 1 }, AHORA)
    const g = await calendarioGuardar(al, { ...wf, campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(tandaConReplica('09:00')) }, AHORA)
    expect(g.cuerpo.correccion).toBeUndefined(); expect(g.cuerpo.necesita_humano).toBeUndefined()
    expect(al.campanas.find((x) => x.id === id)!.estado).toBe('activa')
    const d = (await al.filas(id)).find((f) => f.id === 's1-d4-d')!
    expect(d.hora).toBe('10:00'); expect(d.depende_de).toEqual(['s1-d4-b']); expect(d.avisos.join(' ')).toContain('mismo día')
    // el ensayo sin escribir (la ruta que usa el flujo para probar una tanda) ve lo mismo: no bloquea
    const seco = await validarSinEscribir(al, { ...wf, campana_id: id, tipo: 'calendario', tanda: 1, tanda_agente: tandaConReplica('09:00') }, AHORA)
    expect(seco.cuerpo.bloquea).toBe(false)
  })
  it('lo bueno de siempre sigue igual: una tanda sin dependencias problemáticas se valida como antes', () => {
    const filas = filasDe(A, tandaBuena(A), FORMATOS)
    expect(resolverDependencias(filas).filas).toEqual(filas)
    expect(v11(filas)).toEqual([])
  })
})
