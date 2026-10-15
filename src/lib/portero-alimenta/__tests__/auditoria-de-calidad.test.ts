/**
 * Mejora 4 (15-oct) · auditoría diaria de calidad, silenciosa. US$ 0 · base falsa · 3 rubros (tuteo y voseo).
 * Sobre datos reales del 15-oct (174 fichas vivas de Náufrago): 0 errores falsos (scripts/ops/auditoria-seco.ts).
 */
import { describe, expect, it } from 'vitest'
import { auditarCliente, elegirMuestra, juzgarAuditoria, verificarFicha, MINIMO_ERRORES, MINIMO_VERIFICABLES, TAMANO_DE_MUESTRA, UMBRAL_DE_ERROR, type FichaAuditable } from '../auditoria'
import { rutaVigilar, type DepsDelVigilante } from '../vigilante'
import type { Interruptores } from '../datos'
import { crearBaseFalsa } from './base-falsa'

const AHORA = new Date('2026-10-15T13:00:00Z')
const ON: Interruptores = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const RUBROS = [
  { rubro: 'restaurante de mariscos', cliente: '11111111-1111-4111-8111-111111111111', voz: 'tú', texto: 'Ceviche de camarón a 8,50 dólares, abierto de lunes a domingo desde las 10:00' },
  { rubro: 'clínica dental', cliente: '22222222-2222-4222-8222-222222222222', voz: 'vos', texto: 'Limpieza dental completa con valoración gratuita, agenda tu cita en Quito' },
  { rubro: 'software B2B', cliente: '33333333-3333-4333-8333-333333333333', voz: 'tú', texto: 'Facturación electrónica integrada con inventario y reportes mensuales para pymes' },
]
const ficha = (id: string, cliente: string, contenido: string, extra: Record<string, unknown> = {}): FichaAuditable & Record<string, unknown> => ({
  id, client_id: cliente, contenido, fecha_fuente: '2026-10-14', observado_en: '2026-10-15T12:31:00Z', fuente_url: 'https://ejemplo.ec', provenance_tag: { respaldo_en: { tabla: 'apify_raw', id: 'raw-' + id } }, ...extra,
})
const crudo = (id: string, cliente: string, texto: string, extra: Record<string, unknown> = {}) => ({ id: 'raw-' + id, client_id: cliente, respuesta: [{ text: texto, date: '2026-10-14' }], ...extra })

describe.each(RUBROS)('verificar una ficha · $rubro', ({ cliente, texto }) => {
  it('una ficha copiada de su fuente verifica', () => {
    const r = verificarFicha(ficha('a', cliente, texto), crudo('a', cliente, texto))
    expect(r.veredicto).toBe('ok')
    expect(r.errores).toEqual([])
  })
  it('un texto que la fuente NO dice es un error (la cita no existe)', () => {
    const r = verificarFicha(ficha('b', cliente, texto), crudo('b', cliente, 'Otra cosa completamente distinta que no menciona nada de lo anterior en absoluto'))
    expect(r.veredicto).toBe('error')
    expect(r.errores.join(' ')).toMatch(/no está en su fuente/)
  })
  it('un crudo de OTRO cliente es un error', () => {
    const r = verificarFicha(ficha('c', cliente, texto), crudo('c', '99999999-9999-4999-8999-999999999999', texto))
    expect(r.veredicto).toBe('error')
    expect(r.errores.join(' ')).toMatch(/OTRO cliente/)
  })
  it('una fecha futura o ilegible es un error; una fuente sin esa fecha NO lo es (sin_verificar)', () => {
    expect(verificarFicha(ficha('d', cliente, texto, { fecha_fuente: '2026-12-31' }), crudo('d', cliente, texto)).errores.join(' ')).toMatch(/posterior/)
    expect(verificarFicha(ficha('e', cliente, texto, { fecha_fuente: 'ayer por la tarde' }), crudo('e', cliente, texto)).errores.join(' ')).toMatch(/no se entiende/)
    const sinFecha = verificarFicha(ficha('f', cliente, texto, { fecha_fuente: '2026-10-10' }), { client_id: cliente, respuesta: [{ text: texto }] })
    expect(sinFecha.errores).toEqual([])
    expect(sinFecha.sin_verificar.join(' ')).toMatch(/no trae esa fecha/)
  })
  it('sin fila cruda no se puede comprobar: sin_verificar, nunca error', () => {
    const r = verificarFicha(ficha('g', cliente, texto), null)
    expect(r.veredicto).toBe('sin_verificar')
    expect(r.errores).toEqual([])
  })
  it('una ficha armada por el sistema se comprueba por sus cifras (no por palabras)', () => {
    const f = ficha('h', cliente, 'Puntaje 4,5 sobre 5 con 61 reseñas en Google Maps', { provenance_tag: { respaldo_en: { id: 'raw-h' }, metrica: { nombre: 'puntaje' } } })
    expect(verificarFicha(f, { client_id: cliente, respuesta: { totalScore: '4,5', reviewsCount: '61' } }).veredicto).toBe('ok')
    expect(verificarFicha(f, { client_id: cliente, respuesta: { totalScore: '3,1', reviewsCount: '12' } }).veredicto).toBe('error')
  })
})

describe('la muestra y el umbral', () => {
  it('la muestra es reproducible, de tamaño fijo y distinta de un día a otro', () => {
    const fs = Array.from({ length: 40 }, (_, i) => ({ id: 'f' + i }))
    const a = elegirMuestra(fs, '2026-10-15'), b = elegirMuestra(fs, '2026-10-15'), c = elegirMuestra(fs, '2026-10-16')
    expect(a).toHaveLength(TAMANO_DE_MUESTRA)
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
    expect(a.map((x) => x.id)).not.toEqual(c.map((x) => x.id))
  })
  const r = (v: 'ok' | 'error' | 'sin_verificar') => ({ ficha_id: 'x', veredicto: v, errores: v === 'error' ? ['e'] : [], sin_verificar: [] })
  it('una ficha mala sola NO es problema; 2 de 5 (40 %) sí; sin_verificar no cuenta en la tasa', () => {
    expect(juzgarAuditoria('d', [r('error'), r('ok'), r('ok'), r('ok'), r('ok')]).problema).toBeNull()
    expect(juzgarAuditoria('d', [r('error'), r('error'), r('ok'), r('ok'), r('ok')]).problema).toMatch(/2 de 5/)
    expect(juzgarAuditoria('d', [r('error'), r('error'), r('sin_verificar'), r('sin_verificar'), r('sin_verificar')]).problema).toBeNull() // < 3 verificables
    expect(juzgarAuditoria('d', [r('sin_verificar'), r('sin_verificar')]).tasa_de_error).toBeNull()
    expect(MINIMO_VERIFICABLES).toBe(3); expect(MINIMO_ERRORES).toBe(2); expect(UMBRAL_DE_ERROR).toBe(0.4)
  })
})

function vigilar(t: Record<string, Array<Record<string, unknown>>>) {
  const base = crearBaseFalsa(t as never)
  const apagados: string[] = [], avisos: string[] = []
  const deps: DepsDelVigilante = { db: base.db, interruptores: ON, ahora: AHORA, esperar: async () => {}, apagar: async (w) => { apagados.push(w); return { ok: true, detalle: 'flujo desactivado' } }, avisar: async (x) => { avisos.push(x); return { ok: true, detalle: 'entregado' } } }
  return { deps, apagados, avisos }
}
function mundo(cliente: string, fichas: Array<Record<string, unknown>>, crudos: Array<Record<string, unknown>>) {
  return {
    clients: [{ id: cliente, name: 'Cliente', status: 'active', archived_at: null, config: {} }],
    client_brand_books: [{ id: 'mb', client_id: cliente }],
    client_historical_outputs: [{ id: 'pl', client_id: cliente, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    cerebro_portero_corridas: [{ id: 'r1', client_id: cliente, dia: '2026-10-15', estado: 'hecha', resumen: { escrituras: { fichas: 0 } }, creado_en: '2026-10-15T12:35:00Z' }],
    cerebro_fichas: fichas, client_brain_chunks: [], cerebro_unidades_vistas: [], costs: [], apify_raw: crudos, agent_invocations: [],
  } as Record<string, Array<Record<string, unknown>>>
}
const CIERRE = (c: string) => ({ fin: 'hecho', clientes: [{ cliente: c, errores: [], puente: { quedan: 0, vueltas: 0, falla: null }, alimentar: 'hecha', plan_fallo: null }] })
const REAL = { dry_run: false, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'ex-1' }
const viva = <T extends Record<string, unknown>>(f: T) => ({ descartada: false, retirada_en: null, entregable: false, creado_en: '2026-10-15T12:31:00Z', ...f })

const problemasDe = (r: { body: Record<string, unknown> }) => ((r.body.clientes as Array<{ problemas: string[] }>)[0].problemas)
describe.each(RUBROS)('el vigilante y la auditoría · $rubro', ({ cliente, texto }) => {
  // las fichas de estos mundos no tienen trozo en el índice: el puente dice lo suyo; aquí solo importa lo que dice la AUDITORÍA
  it('todo bien ⇒ la auditoría no pone ningún problema', async () => {
    const fs = Array.from({ length: 5 }, (_, i) => viva(ficha('f' + i, cliente, texto + ' ' + i)))
    const cs = fs.map((f) => crudo(String(f.id), cliente, String(f.contenido)))
    const m = vigilar(mundo(cliente, fs, cs))
    const r = await rutaVigilar(m.deps, { ...REAL, client_id: cliente, cierre: CIERRE(cliente) })
    expect(problemasDe(r).filter((p) => /auditoría/.test(p))).toEqual([])
    expect((r.body.clientes as Array<{ auditoria: { verificables: number; errores: number } }>)[0].auditoria).toMatchObject({ verificables: 5, errores: 0 })
  })
  it('fichas de hoy que no salen de su fuente ⇒ problema del vigilante: apaga y avisa', async () => {
    const fs = Array.from({ length: 5 }, (_, i) => viva(ficha('f' + i, cliente, texto + ' ' + i)))
    const cs = fs.map((f) => crudo(String(f.id), cliente, 'texto que no tiene nada que ver con esta ficha ni con su negocio'))
    const m = vigilar(mundo(cliente, fs, cs))
    const r = await rutaVigilar(m.deps, { ...REAL, client_id: cliente, cierre: CIERRE(cliente) })
    expect(problemasDe(r).join(' ')).toMatch(/auditoría de calidad: 5 de 5/)
    expect(m.apagados).toEqual(['ogfq56oIEoHufFPM'])
    expect(m.avisos).toHaveLength(1)
  })
  it('una ficha mala entre cinco buenas NO es problema de auditoría', async () => {
    const fs = Array.from({ length: 5 }, (_, i) => viva(ficha('f' + i, cliente, texto + ' ' + i)))
    const cs = fs.map((f, i) => crudo(String(f.id), cliente, i === 0 ? 'nada que ver con la ficha y su contenido completo' : String(f.contenido)))
    const m = vigilar(mundo(cliente, fs, cs))
    const r = await rutaVigilar(m.deps, { ...REAL, client_id: cliente, cierre: CIERRE(cliente) })
    expect(problemasDe(r).filter((p) => /auditoría/.test(p))).toEqual([])
  })
  it('una lectura que falla se DICE (no se lee como todo bien)', async () => {
    const b = crearBaseFalsa(mundo(cliente, [viva(ficha('f0', cliente, texto))], []) as never, { fallaEn: 'apify_raw' } as never)
    const au = await auditarCliente(b.db, cliente, AHORA)
    expect(au.ok).toBe(false)
  })
})

describe('casos que la mutación pidió', () => {
  const r = (v: 'ok' | 'error') => ({ ficha_id: 'x', veredicto: v, errores: v === 'error' ? ['e'] : [], sin_verificar: [] })
  it('2 errores de 8 verificables (25 %) NO es problema: el umbral es de tasa, no de cantidad', () => {
    expect(juzgarAuditoria('d', [r('error'), r('error'), ...Array.from({ length: 6 }, () => r('ok'))]).problema).toBeNull()
  })
  it('una ficha retirada o descartada NO entra en la muestra aunque su crudo no coincida', async () => {
    const C = RUBROS[0].cliente
    const mala = (id: string, extra: Record<string, unknown>) => ({ ...ficha(id, C, 'texto de la ficha que ya no está vigente'), creado_en: '2026-10-15T12:00:00Z', descartada: false, retirada_en: null, ...extra })
    const t = { cerebro_fichas: [mala('r1', { retirada_en: '2026-10-15T12:30:00Z' }), mala('r2', { descartada: true })], apify_raw: [crudo('r1', C, 'otra cosa'), crudo('r2', C, 'otra cosa')] }
    const au = await auditarCliente(crearBaseFalsa(t as never).db as never, C, AHORA)
    expect(au.ok && au.resultado.elegidas).toBe(0)
  })
  it('si la lectura de la auditoría falla, el vigilante lo DICE (no es silencio)', async () => {
    const C = RUBROS[0].cliente
    const fs = [viva(ficha('f0', C, RUBROS[0].texto))]
    const base = crearBaseFalsa(mundo(C, fs, [crudo('f0', C, RUBROS[0].texto)]) as never, { fallaEn: 'apify_raw' } as never)
    const deps: DepsDelVigilante = { db: base.db, interruptores: ON, ahora: AHORA, esperar: async () => {}, apagar: async () => ({ ok: true, detalle: 'x' }), avisar: async () => ({ ok: true, detalle: 'x' }) }
    const r2 = await rutaVigilar(deps, { ...REAL, client_id: C, cierre: CIERRE(C) })
    expect(problemasDe(r2).join(' ')).toMatch(/la auditoría de calidad/)
  })
})
