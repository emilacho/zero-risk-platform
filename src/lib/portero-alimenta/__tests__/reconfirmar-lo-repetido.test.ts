/**
 * LO REPETIDO RECONFIRMA (22-oct) · los precios y horarios del sitio (plazo 7 días) se vencían aunque el sitio se releyera cada día y dijera lo mismo: el filtro marcaba «repetida» y solo renovaba la «última vez»
 * de la vista; la ficha conservaba su vigencia original. Medido 22-oct: 20 fichas de precio y horario de Náufrago vencidas el 21-oct y el resumen vivo sin precios.
 * Ahora releer lo mismo en una fecha MÁS NUEVA renueva `reconfirmado_en` y `vigente_hasta`; nunca la acorta, nunca toca una ficha retirada y volver a leer una fila vieja no inventa frescura. US$ 0 · los diez clientes.
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { claveDeRefDelPortero, planDeReconfirmaciones, type FichaReconfirmable } from '../archivar'
import type { Unidad } from '../unidades'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const DIA = 86_400_000
const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const unidad = (o: Partial<Unidad>): Unidad => ({ fuente: 'sitio', ref: 'https://x.example', unidad_ref: 'u', texto: 'precio 3 50', clase_dato: 'precio' as never, atributo: 'precio:x', autoria: 'propia' as never, huella: 'a'.repeat(32), fecha_fuente: null, apify_raw_id: 'r', observado_en: '2026-10-21T12:36:00Z', ...o } as Unidad)
const ficha = (o: Partial<FichaReconfirmable> = {}): FichaReconfirmable => ({ id: 'f1', ref: `portero:sitio:${'a'.repeat(16)}`, plazo: 'precio_oferta_horario', vigente_hasta: '2026-10-21T14:37:00Z', reconfirmado_en: '2026-10-14T14:37:00Z', observado_en: '2026-10-14T14:37:00Z', ...o })

describe('planDeReconfirmaciones (puro)', () => {
  it('releer lo mismo en una fecha más nueva renueva la vigencia: reconfirmado_en = esa fecha, vigente_hasta = esa fecha + el plazo', () => {
    const r = planDeReconfirmaciones([unidad({})], [ficha()])
    expect(r).toEqual([{ id: 'f1', reconfirmado_en: '2026-10-21T12:36:00.000Z', vigente_hasta: new Date(Date.parse('2026-10-21T12:36:00Z') + 7 * DIA).toISOString() }])
  })
  it('una fila vieja no renueva (no se inventa frescura); nunca acorta; sin plazo no hay nada que renovar', () => {
    expect(planDeReconfirmaciones([unidad({ observado_en: '2026-10-14T10:00:00Z' })], [ficha()])).toEqual([])
    expect(planDeReconfirmaciones([unidad({})], [ficha({ vigente_hasta: '2026-12-01T00:00:00Z' })])).toEqual([])
    expect(planDeReconfirmaciones([unidad({})], [ficha({ plazo: null, vigente_hasta: null })])).toEqual([])
    expect(planDeReconfirmaciones([unidad({})], [ficha({ plazo: 'archivo_propio' })])).toEqual([])
  })
  it('una misma línea en dos sedes son dos fichas: las dos se renuevan; otra huella o una ficha que no es del portero, no', () => {
    const r = planDeReconfirmaciones([unidad({})], [ficha({ id: 'g', ref: `portero:sitio:${'a'.repeat(16)}:s:guayaquil` }), ficha({ id: 'o', ref: `portero:sitio:${'a'.repeat(16)}:s:olon` }), ficha({ id: 'x', ref: `portero:sitio:${'b'.repeat(16)}` }), ficha({ id: 'y', ref: 'resumen:cliente' })])
    expect(r.map((x) => x.id).sort()).toEqual(['g', 'o'])
    expect(claveDeRefDelPortero(`portero:sitio:${'a'.repeat(16)}:s:guayaquil`)).toBe(`portero:sitio:${'a'.repeat(16)}`)
  })
  it('varias lecturas de la misma unidad: gana la más nueva; una ficha ya vencida SE REVIVE si el sitio sigue diciendo lo mismo', () => {
    const r = planDeReconfirmaciones([unidad({ observado_en: '2026-10-19T12:00:00Z' }), unidad({ observado_en: '2026-10-21T12:00:00Z' })], [ficha({ vigente_hasta: '2026-10-10T00:00:00Z' })])
    expect(r).toHaveLength(1); expect(r[0].reconfirmado_en).toBe('2026-10-21T12:00:00.000Z')
  })
})

const crudosNuevos = (t: T, c: ClienteSintetico, cuando: Date) => {
  const copias = t.apify_raw.filter((r) => r.client_id === c.id).map((r, i) => ({ ...r, id: `${String(r.id)}-nuevo${i}`, created_at: cuando.toISOString() }))
  t.apify_raw.push(...copias)
  return copias.length
}

describe('de punta a punta con los diez clientes: se relee el sitio tres días después y dice lo mismo', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}${c.web ? '' : ', sin sitio'}): las fichas con plazo renuevan su vigencia; nada se duplica ni se retira`, async () => {
      const t = tablasDe(c)
      const r1 = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, ...WF })
      expect(r1.errores).toEqual([])
      const antes = t.cerebro_fichas.filter((f) => f.client_id === c.id).map((f) => ({ ...f }))
      const conPlazo = antes.filter((f) => f.plazo && f.vigente_hasta && String(f.ref).startsWith('portero:') && !String(f.ref).startsWith('portero:metrica:'))
      const tres = new Date(AHORA.getTime() + 3 * DIA)
      crudosNuevos(t, c, tres)
      const r2 = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: tres, ...WF })
      expect(r2.errores).toEqual([])
      const despues = t.cerebro_fichas.filter((f) => f.client_id === c.id)
      expect(despues.length).toBe(antes.length) // nada se duplica
      expect(despues.filter((f) => f.retirada_en).length).toBe(antes.filter((f) => f.retirada_en).length) // nada se retira
      for (const f of conPlazo) {
        const d = despues.find((x) => x.id === f.id)!
        expect(Date.parse(String(d.vigente_hasta)), String(f.ref)).toBeGreaterThan(Date.parse(String(f.vigente_hasta)))
        expect(Date.parse(String(d.reconfirmado_en)), String(f.ref)).toBeGreaterThan(Date.parse(String(f.reconfirmado_en)))
        expect(d.observado_en).toBe(f.observado_en) // cuándo se vio por PRIMERA vez no cambia
        expect(d.contenido).toBe(f.contenido)
      }
      expect(r2.escrituras.reconfirmadas ?? 0).toBe(conPlazo.length)
    })
  }
  it('al menos un cliente de prueba tiene fichas con plazo (la prueba no pasa por vacía)', async () => {
    let total = 0
    for (const c of DIEZ_CLIENTES) {
      const t = tablasDe(c)
      await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, ...WF })
      total += t.cerebro_fichas.filter((f) => f.plazo && f.vigente_hasta && String(f.ref).startsWith('portero:') && !String(f.ref).startsWith('portero:metrica:')).length
    }
    expect(total).toBeGreaterThan(5)
  })
  it('releer la MISMA fila vieja otro día no renueva nada', async () => {
    const c = DIEZ_CLIENTES[0]
    const t = tablasDe(c)
    await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, ...WF })
    const antes = JSON.stringify(t.cerebro_fichas.map((f) => [f.id, f.reconfirmado_en, f.vigente_hasta]))
    const r = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ON, ahora: new Date(AHORA.getTime() + 2 * DIA), ...WF })
    expect(r.escrituras.reconfirmadas ?? 0).toBe(0)
    expect(JSON.stringify(t.cerebro_fichas.map((f) => [f.id, f.reconfirmado_en, f.vigente_hasta]))).toBe(antes)
  })
})
