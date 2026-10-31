/**
 * 31-oct · la campaña no se detiene por lo que NO es un dato declarado sin fuente:
 *  · el léxico sobre el TEXTO del tema ya no bloquea ni saca filas: viaja como nota «por confirmar» (V14n) hacia el brief;
 *  · una cantidad por semana MENOR a la de la estrategia (V08, real < meta), tras la única corrección, es un aviso y la campaña sigue;
 *  · lo que NO cambia: dato declarado sin fuente (la fila sale), exceso de cantidad, dependencias y reparto (→ necesita_humano).
 */
import { describe, it, expect } from 'vitest'
import { calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, abrirCampana, type Estrategia, type Hallazgo } from '../index'
import { bajarFaltantesDeCantidad, leerV08, mensajeV08 } from '../cantidad'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, piezaBuena, tandaBuena } from '../__fixtures__/clientes'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })

function almacen() {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
async function conEstrategia(al: AlmacenMemoria, e: Estrategia = A.estrategia) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
  const id = (c.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(e) }, AHORA)
  return { id, g }
}
async function primera(al: AlmacenMemoria, id: string, objeto: unknown) {
  const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
  const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(objeto) }, AHORA)
  return { p, g }
}
/** la corrección vuelve IGUAL: lo que el agente devuelve ya no cambia el resultado */
async function corregir(al: AlmacenMemoria, id: string, g: { cuerpo: Record<string, unknown> }, objeto: unknown, modo: 'filas' | 'tanda') {
  const p2 = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1, correccion: { fichas: g.cuerpo.fichas, fila_ids: g.cuerpo.fila_ids, modo } }, AHORA)
  return calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p2.cuerpo.corrida_id, correccion: true, modo, resultado: ok(objeto) }, AHORA)
}
const conFrecuencia = (red: string, feed: number): Estrategia => ({ ...A.estrategia, canales: A.estrategia.canales.map((c) => (c.red === red ? { ...c, frecuencia: { ...c.frecuencia, feed_semana: feed } } : c)) })
const DATO_SIN_REF = { dato: 'peso del pan', valor: '45 g', clase: 'alto' as const, ref: 'no-existe', nivel: 'F1' as const, opcional: false }

const hall = (chequeo: string, severidad: 'bloquea' | 'aviso', que: string): Hallazgo => ({ chequeo, severidad, fila_id: null, alcance: 'tanda', ficha: { que, donde: 'tanda', contra_que: 'x', gravedad: severidad, propuesta: 'x' } })

describe('bajarFaltantesDeCantidad (pura)', () => {
  it('el mensaje de V08 se lee de vuelta (real y meta)', () => {
    expect(leerV08(mensajeV08(2, 'facebook', 'feed', 1, 2))).toEqual({ semana: 2, red: 'facebook', clase: 'feed', real: 1, meta: 2 })
    expect(leerV08('otra cosa')).toBeNull()
  })
  it('V08 bloquea con real < meta pasa a aviso y se rotula «por confirmar»', () => {
    const [x] = bajarFaltantesDeCantidad([hall('V08', 'bloquea', mensajeV08(1, 'youtube', 'feed', 0, 1))])
    expect(x.severidad).toBe('aviso')
    expect(x.ficha.gravedad).toBe('aviso')
    expect(x.ficha.que).toContain('por confirmar')
  })
  it('el EXCESO (real > meta) sigue bloqueando', () => {
    const [x] = bajarFaltantesDeCantidad([hall('V08', 'bloquea', mensajeV08(1, 'instagram', 'feed', 3, 2))])
    expect(x.severidad).toBe('bloquea')
  })
  it('un V08 con forma desconocida sigue bloqueando (ante la duda, no se afloja)', () => {
    expect(bajarFaltantesDeCantidad([hall('V08', 'bloquea', 'texto raro')])[0].severidad).toBe('bloquea')
  })
  it('lo que no es V08 no se toca (dependencias V11, reparto V09, datos V14/V22)', () => {
    const hs = ['V11', 'V09', 'V14', 'V22', 'V12'].map((c) => hall(c, 'bloquea', mensajeV08(1, 'facebook', 'feed', 0, 1)))
    expect(bajarFaltantesDeCantidad(hs).map((x) => x.severidad)).toEqual(['bloquea', 'bloquea', 'bloquea', 'bloquea', 'bloquea'])
  })
})

describe('léxico: ninguna fila sale ni se detiene por el texto del tema', () => {
  it('🔴 un tema con cifra/afirmación sin dato declarado: sin corrección, la fila queda validada y la nota viaja en sus avisos', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const t = tandaBuena(A)
    const objeto = { ...t, piezas: t.piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, tema: 'Nuestro pan de 45 g, llega fresco todos los días' } : p)) }
    const { g } = await primera(al, id, objeto)
    expect(g.cuerpo.correccion).toBeUndefined()
    expect(g.cuerpo).toMatchObject({ ok: true, salieron_sin_fuente: [], validadas: 16 })
    const fila = (await al.filas(id)).find((f) => f.id === 's1-d1-a')!
    expect(fila.estado).toBe('validada')
    expect(fila.avisos.some((a) => a.startsWith('por confirmar'))).toBe(true)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
  })
  it('🔴 un dato DECLARADO sin fuente sigue sacando la fila (la jerarquía de fuentes no cambió)', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    const t = tandaBuena(A)
    const mala = { ...t, piezas: t.piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: [DATO_SIN_REF] } : p)) }
    const { g } = await primera(al, id, mala)
    expect(g.cuerpo.correccion).toBe(true)
    const g2 = await corregir(al, id, g, { piezas: [{ ...piezaBuena(A, 1, 'a', 'x'), datos: [DATO_SIN_REF] }], ajustes_al_patron: [] }, 'filas')
    expect(g2.cuerpo).toMatchObject({ ok: true, salieron_sin_fuente: ['s1-d1-a'] })
  })
})

describe('cantidad por semana: el faltante no detiene; el exceso y lo demás sí', () => {
  it('🔴 faltante (Facebook pide 2 y el patrón da 1): una corrección, vuelve igual y la campaña SIGUE con el faltante como aviso', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al, conFrecuencia('facebook', 2))
    const { g } = await primera(al, id, tandaBuena(A))
    expect(g.cuerpo.correccion).toBe(true)
    const g2 = await corregir(al, id, g, tandaBuena(A), 'tanda')
    expect(g2.cuerpo.necesita_humano).toBeUndefined()
    expect(g2.cuerpo).toMatchObject({ ok: true })
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
    const v08 = al.validaciones.filter((v) => v.objeto === 'calendario')
    expect(JSON.stringify(v08)).toContain('por confirmar')
  })
  it('🔴 la fila de Facebook sale por dato sin fuente y deja un faltante NUEVO tras sacarla: la campaña SIGUE (caso real de Náufrago)', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al, conFrecuencia('facebook', 2))
    const t = tandaBuena(A)
    const mala = { ...t, piezas: t.piezas.map((p) => (p.semana === 1 && p.slot === 'd' ? { ...p, datos: [DATO_SIN_REF] } : p)) }
    const { g } = await primera(al, id, mala)
    expect(g.cuerpo.correccion).toBe(true)
    const g2 = await corregir(al, id, g, mala, 'tanda')
    expect(g2.cuerpo.necesita_humano).toBeUndefined()
    expect(g2.cuerpo).toMatchObject({ ok: true, salieron_sin_fuente: ['s1-d4-d'] })
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
  })
  it('🔴 exceso (Instagram pide 2 y el patrón da 3): sigue yendo a necesita_humano', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al, conFrecuencia('instagram', 2))
    const { g } = await primera(al, id, tandaBuena(A))
    expect(g.cuerpo.correccion).toBe(true)
    const g2 = await corregir(al, id, g, tandaBuena(A), 'tanda')
    expect(g2.cuerpo.necesita_humano).toBe(true)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
  })
  it('🔴 faltante + un bloqueo que no es de cantidad: sigue yendo a necesita_humano', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al, conFrecuencia('facebook', 2))
    const t = tandaBuena(A)
    const mala = { ...t, piezas: t.piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, tema: 'Ritual de revisión de la semana' } : p)) }
    const { g } = await primera(al, id, mala)
    const g2 = await corregir(al, id, g, mala, 'tanda')
    expect(g2.cuerpo.necesita_humano).toBe(true)
  })
})
