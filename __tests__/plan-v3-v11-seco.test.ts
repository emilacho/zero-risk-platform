/**
 * Plan v3 · V11 · el kit del seco (CC#1 · 15-oct). El corredor local corre la matriz (4 negocios × casos) por el camino de DATOS completo con las piezas reales (V1–V7, V10, V14),
 * reloj simulado y redactor simulado. US$ 0. Las celdas que necesitan V8/V9 o las migraciones aplicadas salen `pendiente` y NO se simulan como si existieran.
 * Mutaciones: un cambio en una FILA del catálogo (no en código) rompe la celda que lo vigila.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { correrCelda, correrMatriz, esperar, FILAS, PLAN_V2_TRAMPA, cargarJs, type Celda } from '../scripts/ops/plan-v3-seco/corredor'
import { celdas, CASOS, CONDICIONES, CONTADORES, NEGOCIOS, resumenDeLaMatriz } from '../scripts/ops/plan-v3-seco/matriz.mjs'
import type { FilasDelCatalogo } from '../src/lib/planeacion/dato-v1/catalogo'

const todas = celdas() as Celda[]
const celda = (id: string): Celda => {
  const c = todas.find((x) => x.id === id)
  if (!c) throw new Error(`no hay celda ${id}`)
  return c
}
const clon = (): FilasDelCatalogo => JSON.parse(JSON.stringify(FILAS))

describe('V11 · la matriz', () => {
  it('cuatro negocios de práctica y los casos de la tanda; lo que necesita V8/V9 queda pendiente (no se simula)', () => {
    expect((NEGOCIOS as unknown[]).length).toBe(4)
    const r = resumenDeLaMatriz() as { negocios: number; casos: number; celdas: number; corren_hoy: number; pendientes: number }
    expect(r.celdas).toBe(r.corren_hoy + r.pendientes)
    expect(r.pendientes).toBeGreaterThan(0)
    const ids = (CASOS as Array<{ id: string }>).map((c) => c.id)
    for (const i of ['L1', 'L2', 'L3', 'L4', 'C6', 'C7', 'C17', 'V2', 'E1', 'E5', 'R1', 'R2', 'G2', 'S40', 'M2', 'O1', 'PL', 'X1']) expect(ids).toContain(i)
  })
  it('«portero corrió hoy + plan hoy» y «plan antes del portero» esperan V8 y solo_portero; el punta a punta real espera V8, V9 y migraciones', () => {
    for (const n of ['N', 'T', 'S', 'P']) {
      expect(celda(`${n}-C6`)).toMatchObject({ pendiente: true, requiere: ['V8', 'solo_portero'] })
      expect(celda(`${n}-C7`).pendiente).toBe(true)
    }
    expect(celda('N-X1').requiere).toEqual(expect.arrayContaining(['V8', 'V9', 'solo_portero', 'cerebro_listo']))
  })
  it('lo que no aplica a un negocio no es falla: la tienda sin local no corre el homónimo de Mapas; sin anuncios no corre V2', () => {
    expect(todas.some((c) => c.id === 'T-C17')).toBe(false)
    expect(todas.some((c) => c.id === 'S-V2')).toBe(false)
    expect(todas.some((c) => c.id === 'N-O1')).toBe(true)
    expect(todas.some((c) => c.id === 'T-O1')).toBe(false)
  })
  it('agnóstico: ningún nombre de cliente real, ciudad del piloto ni producto en la matriz', () => {
    const src = readFileSync(join(__dirname, '..', 'scripts/ops/plan-v3-seco/matriz.mjs'), 'utf8').toLowerCase()
    for (const p of ['naufrago', 'náufrago', 'guayaquil', 'peniche', 'gualaceo', 'ceviche']) expect(src).not.toContain(p)
    expect((CONDICIONES as unknown[]).length).toBeGreaterThan(5)
    expect((CONTADORES as unknown[]).length).toBeGreaterThan(4)
  })
})

describe('V11 · la espera por «cerebro listo» (reloj simulado, lecturas cada 5 min)', () => {
  it('listo a tiempo: una lectura', () => {
    const e = esperar(() => ({ listo: true }))
    expect(e).toMatchObject({ vencido: false, minuto_de_salida: 0 })
    expect(e.lecturas).toEqual([0])
  })
  it('completando hasta el 44 y listo a las 45:00 ⇒ corre en la ÚLTIMA lectura (10 lecturas, minuto 0 a 45)', () => {
    const e = esperar((m) => (m < 45 ? { listo: false, completando: true } : { listo: true }))
    expect(e).toMatchObject({ vencido: false, minuto_de_salida: 45 })
    expect(e.lecturas).toHaveLength(10)
    expect(e.lecturas.at(-1)).toBe(45)
  })
  it('sin listo a las 45:00 ⇒ vence; una lectura ausente (señal que no se pudo leer) no es listo', () => {
    expect(esperar(() => ({ listo: false, completando: true }))).toMatchObject({ vencido: true, minuto_de_salida: 45 })
    expect(esperar((m) => (m < 45 ? 'ausente' : { listo: false }))).toMatchObject({ vencido: true })
    expect(esperar((m) => (m % 10 === 0 ? 'ausente' : { listo: true })).minuto_de_salida).toBe(5)
  })
})

describe('V11 · el seco local corre y TODAS las celdas que corren hoy pasan', () => {
  const rs = correrMatriz()
  const hoy = rs.filter((r) => !r.pendiente)
  it('hay celdas que corren y todas dan ok (con sus fallas a la vista si no)', () => {
    expect(hoy.length).toBeGreaterThan(40)
    const malas = hoy.filter((r) => !r.ok).map((r) => `${r.celda}: ${r.fallas.join(' | ')}`)
    expect(malas).toEqual([])
  })
  it('las pendientes NO se corren: sin observaciones y declaran qué les falta', () => {
    const pend = rs.filter((r) => r.pendiente)
    expect(pend.length).toBe((celdas() as Celda[]).filter((c) => c.pendiente).length)
    for (const p of pend) { expect(p.requiere.length).toBeGreaterThan(0); expect(p.obs).toEqual({}) }
  })
  it('cada negocio corre el mismo código: mismos casos, distintos datos (4 negocios × B1)', () => {
    const b1 = hoy.filter((r) => r.caso === 'B1')
    expect(b1.map((r) => r.negocio).sort()).toEqual(['N', 'P', 'S', 'T'])
    const datos = new Set(b1.map((r) => r.obs.datos))
    expect(datos.size).toBeGreaterThan(1) // cambian los datos, no el código
  })
  it('L3 (vencido): cero pedidos a Apify y todo explicado por cerebro_no_listo', () => {
    for (const r of hoy.filter((x) => x.caso === 'L3')) { expect(r.obs.vencido).toBe(true); expect(r.obs.pedidos).toEqual([]) }
  })
  it('L4 (huecos): el relleno es solo de los huecos y lo gastado cabe en el tope', () => {
    for (const r of hoy.filter((x) => x.caso === 'L4')) expect(r.obs.comprometido_usd as number).toBeLessThanOrEqual(0.4 + 1e-9)
  })
  it('O1 · el piloto tal cual: 137 mapeadas, precios con moneda supuesta rotulada que SÍ dejan correr', () => {
    const o = hoy.find((r) => r.celda === 'N-O1')!
    expect(o.ok).toBe(true)
    expect(o.obs.datos).toBe(137)
  })
  it('PL · el peor caso (80 + espera) no pasa el techo de 110 min', () => {
    for (const r of hoy.filter((x) => x.caso === 'PL')) expect(r.obs.techo_min as number).toBeLessThanOrEqual(110)
  })
})

describe('V11 · mutaciones: un cambio en una FILA del catálogo rompe la celda que lo vigila', () => {
  const js = cargarJs()
  const corre = (id: string, filas: FilasDelCatalogo) => correrCelda(celda(id), js, filas)
  it('la espera pasa de 45 a 30 min ⇒ L2 ya no corre en la lectura del 45:00', () => {
    expect(corre('N-L2', FILAS).ok).toBe(true)
    const f = clon()
    f.reglas.find((r) => r.regla_id === 'param_espera_listo_min')!.parametros.minutos = 30
    const r = corre('N-L2', f)
    expect(r.ok).toBe(false)
    expect(r.fallas.join(' ')).toMatch(/listo/)
  })
  it('sin la fila país→moneda el piloto sale sin moneda: O1 falla', () => {
    const f = clon()
    f.reglas = f.reglas.filter((r) => r.clase !== 'moneda_pais')
    expect(corre('N-O1', f).ok).toBe(false)
  })
  it('sin el léxico de ausencia P10d no marca «no tiene» sobre un hueco: V2 falla', () => {
    const f = clon()
    f.lexico = f.lexico.filter((l) => l.grupo !== 'ausencia')
    expect(corre('N-V2', f).ok).toBe(false)
  })
  it('sin la regla de cambio material el refresco no abre nueva ronda: R1 falla', () => {
    const f = clon()
    f.reglas = f.reglas.filter((r) => r.clase !== 'cambio_material')
    expect(corre('N-R1', f).ok).toBe(false)
  })
  it('sin el tope de recolección no se gasta nada (falla cerrado) y la celda de huecos lo ve', () => {
    const f = clon()
    f.topes = f.topes.filter((t) => t.tramo !== 'recoleccion')
    const r = corre('N-L4', f)
    // sin fila de tope no se gasta: solo puede salir lo que NO cobra (la analítica propia)
    expect((r.obs.pedidos as string[]).every((p) => p === 'analitica_dominio')).toBe(true)
    expect(r.obs.comprometido_usd).toBe(0)
  })
  it('un plan «v2» sin citas marca lo real y no es ruido (la trampa que usa M2)', () => {
    const j = js.p10Calibrar([{ id: 'v2', texto: PLAN_V2_TRAMPA, datos: [{ id: 'D1', tipo_id: 'puntaje_resenas', origen: 'medido', estado: 'trajo', valor: { numero: 4.8 }, identidad: { estado: 'coincide' }, frescura: { estado: 'fresco' }, periodo: { tipo: 'instante' }, alcance: 'cliente', derivado: { si: false, de: [] }, contradice: null, marcas: [], medido_en: '2026-10-15' }], op: { lexico: {}, cifras_de_slots: [] } }])
    expect(j.casos[0].ruido).toBe(false)
  })
})
