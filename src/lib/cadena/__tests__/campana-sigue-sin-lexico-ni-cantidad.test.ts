/**
 * 31-oct · la campaña no se detiene por lo que NO es un dato declarado sin fuente:
 *  · el léxico sobre el TEXTO del tema ya no bloquea ni saca filas: viaja como nota «por confirmar» (V14n) hacia el brief;
 *  · una cantidad por semana MENOR a la de la estrategia (V08, real < meta), tras la única corrección, es un aviso y la campaña sigue;
 *  · lo que NO cambia: dato declarado sin fuente (la fila sale), exceso de cantidad, dependencias y reparto (→ necesita_humano).
 */
import { describe, it, expect } from 'vitest'
import { retomarPorCantidades } from '../pasos'
import { relojDeLaCadena, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, abrirCampana, type Estrategia, type Hallazgo } from '../index'
import { bajarFaltantesDeCantidad, leerV08, mensajeV08 } from '../cantidad'
import { ponerNecesitaHumano } from '../nucleo'
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
  it('las tres clases (feed, historias, anuncios) se leen y el faltante de cada una baja a aviso', () => {
    for (const clase of ['feed', 'historias', 'anuncios']) {
      expect(leerV08(mensajeV08(3, 'tiktok', clase, 1, 4))).toEqual({ semana: 3, red: 'tiktok', clase, real: 1, meta: 4 })
      expect(bajarFaltantesDeCantidad([hall('V08', 'bloquea', mensajeV08(3, 'tiktok', clase, 1, 4))])[0].severidad).toBe('aviso')
      expect(bajarFaltantesDeCantidad([hall('V08', 'bloquea', mensajeV08(3, 'tiktok', clase, 5, 4))])[0].severidad).toBe('bloquea')
    }
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

describe('el reloj retoma SOLO una campaña frenada únicamente por cantidades', () => {
  const vigia = (al: AlmacenMemoria) => relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v-1', seco: true }, AHORA)
  /** deja la campaña como la dejaba la versión vieja: tanda propuesta, bloqueos guardados, en necesita_humano */
  async function frenada(al: AlmacenMemoria, e: Estrategia, objeto: unknown) {
    const { id } = await conEstrategia(al, e)
    const { g } = await primera(al, id, objeto)
    expect(g.cuerpo.correccion).toBe(true) // la primera pasada sigue pidiendo la única corrección
    await ponerNecesitaHumano(al, al.campanas.find((c) => c.id === id)!, 'la tanda 1 sigue con bloqueos tras sacar las filas sin fuente', AHORA)
    return id
  }
  it('🔴 solo faltantes de cantidad: el vigía la retoma, las filas quedan validadas, la campaña pasa a activa y no se llama al modelo', async () => {
    const al = almacen()
    const id = await frenada(al, conFrecuencia('facebook', 2), tandaBuena(A))
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
    const corridasAntes = (await al.corridasDeCampana(id)).length
    const r = await vigia(al)
    expect(r.cuerpo.aplicado).toEqual(expect.arrayContaining([expect.stringContaining(`campaña ${id} retomada sola`)]))
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('activa')
    const filas = await al.filas(id)
    expect(filas.filter((f) => f.estado === 'propuesta')).toEqual([])
    expect(filas.filter((f) => f.estado === 'validada').length).toBeGreaterThan(0)
    expect(al.esperas.some((e) => e.objeto_tipo === 'necesita_humano' && e.estado === 'viva')).toBe(false)
    expect((await al.corridasDeCampana(id)).length).toBe(corridasAntes) // ninguna llamada nueva: US$ 0
    expect(JSON.stringify(al.validaciones.filter((v) => v.objeto === 'calendario'))).toContain('por confirmar')
  })
  it('🔴 con un dato sin fuente además del faltante: NO se retoma (sigue esperando a una persona)', async () => {
    const al = almacen()
    const t = tandaBuena(A)
    const id = await frenada(al, conFrecuencia('facebook', 2), { ...t, piezas: t.piezas.map((p) => (p.semana === 1 && p.slot === 'a' ? { ...p, datos: [DATO_SIN_REF] } : p)) })
    const r = await vigia(al)
    expect((r.cuerpo.aplicado as string[]).some((x) => x.includes('retomada sola'))).toBe(false)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
  })
  it('🔴 con un EXCESO de cantidad: NO se retoma', async () => {
    const al = almacen()
    const id = await frenada(al, conFrecuencia('instagram', 2), tandaBuena(A))
    const r = await vigia(al)
    expect((r.cuerpo.aplicado as string[]).some((x) => x.includes('retomada sola'))).toBe(false)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
  })
  it('🔴 con un bloqueo de otra clase (una revisión inventada) además del faltante: NO se retoma', async () => {
    const al = almacen()
    const t = tandaBuena(A)
    const id = await frenada(al, conFrecuencia('facebook', 2), { ...t, piezas: t.piezas.map((p) => (p.semana === 4 && p.slot === 'b' ? { ...p, tema: 'Ritual de revisión de la semana' } : p)) })
    await vigia(al)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
  })
  it('🔴 sin bloqueos guardados (frenada por otra causa, p. ej. una llamada que no volvió): NO se retoma aunque la tanda propuesta valide limpia', async () => {
    const al = almacen()
    const { id } = await conEstrategia(al)
    await primera(al, id, tandaBuena(A))
    const v = Math.max(1, await al.ultimaVersionDeCalendario(id))
    await al.cambiarEstadoDeFilas(id, v, (await al.filas(id, v)).filter((f) => f.estado === 'validada').map((f) => f.id), 'propuesta')
    await ponerNecesitaHumano(al, al.campanas.find((c) => c.id === id)!, 'la llamada del calendario no entregó el objeto tras 3 intentos', AHORA)
    await vigia(al)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
  })
  it('🔴 si al re-validar aparece un bloqueo que los guardados no tenían, NO se retoma (la re-validación es la que manda)', async () => {
    const al = almacen()
    const id = await frenada(al, conFrecuencia('facebook', 2), tandaBuena(A))
    const v = Math.max(1, await al.ultimaVersionDeCalendario(id))
    const filas = (await al.filas(id, v)).map((f) => (f.id === 's1-d1-a' ? { ...f, formato: 'foto o reel' } : f))
    await al.guardarFilas(id, v, 1, filas, true)
    await vigia(al)
    expect(al.campanas.find((c) => c.id === id)!.estado).toBe('necesita_humano')
  })
  it('el paso solo actúa sobre campañas en necesita_humano', async () => {
    const al = almacen()
    const id = await frenada(al, conFrecuencia('facebook', 2), tandaBuena(A))
    const c = await al.actualizarCampana(id, { estado: 'pausada' })
    expect((await retomarPorCantidades(al, c, AHORA)).retomada).toBe(false)
    expect((await al.filas(id)).some((f) => f.estado === 'propuesta')).toBe(true)
  })
  it('una campaña activa o sin tanda propuesta no se toca, y retomar dos veces no duplica nada', async () => {
    const al = almacen()
    const id = await frenada(al, conFrecuencia('facebook', 2), tandaBuena(A))
    await vigia(al)
    const n1 = (await al.filas(id)).length
    const r2 = await vigia(al)
    expect((r2.cuerpo.aplicado as string[]).some((x) => x.includes('retomada sola'))).toBe(false)
    expect((await al.filas(id)).length).toBe(n1)
  })
})
