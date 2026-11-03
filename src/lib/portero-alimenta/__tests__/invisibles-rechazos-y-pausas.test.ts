/**
 * 03-nov · firma de Emilio (corrección del caso Náufrago: un emoji compuesto no entraba al índice, el vigilante lo contó como problema y el plan esperó 45 min). US$ 0 · base falsa.
 *  1 · los invisibles (U+200D…) se quitan SOLO de la copia que va al índice; la ficha queda intacta; no se re-embebe nada ya indexado;
 *  2 · un trozo que el filtro rechaza queda MARCADO en la ficha y declarado como hueco: no es pendiente, no bloquea el «listo» ni el plan; más de 3 o más del 5 % → UNA alarma;
 *  3 · la vigía de pausas «hasta la alta»: a las 3 h cierra (con UNA alarma) la corriente; la de borrado solo avisa a las 3 h y se cierra sola a las 24 h sin alta.
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { puenteAlIndice } from '../entorno'
import { rutaDespertar } from '../despertar'
import { rutaListo } from '../listo'
import { reconciliarYEnviar } from '../rutas'
import { FIN_ALTA_TERMINADA, TIPO_BORRADO, vigiarPausasDeAlta } from '../pausa-de-alta'
import { rutaPausarHastaLaAlta } from '../pausas'
import { MAX_RECHAZOS_SIN_AVISAR, limpiarInvisibles, pasaElTopeDeRechazos, puenteDeFicha, reconciliarPuente, type FichaParaPuente } from '../puente'
import { AHORA, CASOS, ON, REAL, montar, tablas } from './fixtures-despertar'

type T = Record<string, Array<Record<string, unknown>>>
const c = CASOS[0]
const min = (n: number) => new Date(AHORA.getTime() + n * 60_000)
const hora = (n: number) => new Date(AHORA.getTime() + n * 3_600_000)
const nueva = (): T => { const t = tablas(c) as T; t.cerebro_portero_pausas = []; t.client_brain_chunks ??= []; return t }
const ZWJ = '‍'
const EMOJI = `Me encantó 😮${ZWJ}💨 el encebollado`

const ficha = (id: string, contenido: string, extra: Partial<FichaParaPuente> = {}): FichaParaPuente => ({
  id, client_id: c.id, ref: `portero:comentarios:${id}`, clase: 'competidor_comentarios', titulo: 'Comentarios', contenido, fecha_fuente: '2026-03-31', observado_en: '2026-11-02', creado_en: '2026-11-02T16:00:00Z',
  propiedad: 'competidor', origen: 'tercero', descartada: false, retirada_en: null, prueba: false, huella: `h-${id}`, atributo: null, ...extra,
})
const fila = (f: FichaParaPuente) => ({ ...f }) as Record<string, unknown>

/** el ingest-source de verdad, en pequeño: el filtro rechaza el texto con invisibles (o con la palabra prohibida) y contesta 200 con 0 trozos; si no, escribe el trozo */
function fetchDelIndice(t: T, prohibida?: string) {
  const textos: string[] = []
  const impl = async (_u: string, i?: RequestInit): Promise<Response> => {
    const b = JSON.parse(String(i?.body)) as { client_id: string; source_id: string; sections: Array<{ text: string }> }
    const texto = b.sections[0].text
    textos.push(texto)
    if (/[​-‍⁠﻿‮]/.test(texto) || (prohibida && texto.includes(prohibida))) {
      return new Response(JSON.stringify({ ok: true, chunks_upserted: 0, sections_rejected: 1, note: 'all_sections_quarantined', ingress_filter: { rejected: [{ reason: 'zero_width_unicode' }] } }), { status: 200 })
    }
    t.client_brain_chunks.push({ client_id: b.client_id, source_table: 'cerebro_fichas', source_id: b.source_id })
    return new Response(JSON.stringify({ ok: true, chunks_upserted: 1, sections_processed: 1, sections_rejected: 0 }), { status: 200 })
  }
  return { impl, textos }
}

describe('1 · invisibles fuera del índice, solo en la copia', () => {
  it('limpiarInvisibles quita U+200D y sus parientes y deja el resto', () => {
    expect(limpiarInvisibles(EMOJI)).toBe('Me encantó 😮💨 el encebollado')
    expect(limpiarInvisibles(`a​b‌c⁠d﻿e‮f­g`)).toBe('abcdefg')
    expect(limpiarInvisibles('texto normal ñ á 🙌 con «comillas»')).toBe('texto normal ñ á 🙌 con «comillas»')
  })

  it('el trozo del índice sale limpio y la ficha original NO se toca', () => {
    const f = ficha('f1', EMOJI)
    const copia = JSON.stringify(f)
    const p = puenteDeFicha(f)
    expect(p.sections[0].text).not.toMatch(/[​-‍]/)
    expect(p.sections[0].text).toContain('Me encantó 😮💨 el encebollado')
    expect(JSON.stringify(f)).toBe(copia) // la cita literal sigue siendo la del cliente
    expect(f.contenido).toContain(ZWJ)
    expect(p.source_id).toBe('f1')
  })

  it('no re-embebe nada: una ficha vieja ya indexada (con o sin invisibles) no vuelve a salir pendiente', () => {
    const fichas = [ficha('a', 'sin nada raro'), ficha('b', EMOJI), ficha('c', `otra${ZWJ}`)]
    const r = reconciliarPuente(fichas, ['a', 'b', 'c'])
    expect(r.escribir).toHaveLength(0)
    expect(r.sacar).toHaveLength(0)
    expect(r.ya_buscables).toBe(3)
    // y solo la que de verdad no tiene trozo sale a escribir
    expect(reconciliarPuente(fichas, ['a', 'c']).escribir.map((x) => x.source_id)).toEqual(['b'])
  })

  it('CASO REAL (Náufrago 03-nov): la ficha con el emoji compuesto ahora ENTRA al índice, el ⑦ queda en paz, el «listo» es true y la pausa se cierra', async () => {
    const t = nueva()
    t.cerebro_fichas.push(fila(ficha('edfce366', EMOJI)))
    t.cerebro_portero_pausas.push({ id: 'p1', client_id: c.id, motivo: 'desde cero', problemas: [], desde: min(-60).toISOString(), levantada_en: null, termina_con: FIN_ALTA_TERMINADA })
    const m = montar(t)
    const idx = fetchDelIndice(t)
    m.deps.puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: m.base.db as never, fetchImpl: idx.impl })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.status).toBe(200)
    expect(t.client_brain_chunks.some((x) => x.source_id === 'edfce366')).toBe(true)
    expect(idx.textos.find((x) => x.includes('encebollado'))).not.toMatch(/‍/)
    expect(t.cerebro_fichas.find((f) => f.id === 'edfce366')!.contenido).toContain(ZWJ)
    expect(t.cerebro_fichas.find((f) => f.id === 'edfce366')!.indice_rechazado_en).toBeUndefined()
  })
})

describe('2 · el rechazo del filtro es un hueco declarado', () => {
  it('puenteAlIndice: un 200 con 0 trozos y sections_rejected NO es «escrito»: marca la ficha con el porqué y lo devuelve', async () => {
    const t = nueva()
    t.cerebro_fichas.push(fila(ficha('r1', 'texto con PROHIBIDA dentro')), fila(ficha('ok1', 'texto limpio')))
    const m = montar(t)
    const idx = fetchDelIndice(t, 'PROHIBIDA')
    const puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: m.base.db as never, fetchImpl: idx.impl, avisar: async () => undefined })
    const out = await puente({ escribir: [puenteDeFicha(ficha('r1', 'texto con PROHIBIDA dentro')), puenteDeFicha(ficha('ok1', 'texto limpio'))], sacar: [], client_id: c.id })
    expect(out).toMatchObject({ escritos: 1, intentados: 2, errores: [] })
    expect(out.rechazados).toEqual([{ source_id: 'r1', razon: 'zero_width_unicode' }])
    const r1 = t.cerebro_fichas.find((f) => f.id === 'r1')!
    expect(r1.indice_rechazado_en).toBeTruthy(); expect(r1.indice_rechazo).toBe('zero_width_unicode')
    expect(t.cerebro_fichas.find((f) => f.id === 'ok1')!.indice_rechazado_en).toBeUndefined()
  })

  it('una ficha ya marcada como rechazada no es pendiente: quedan 0 y sale en rechazadas (huecos), sin pausar nada', async () => {
    const t = nueva()
    t.cerebro_fichas.push(fila(ficha('r1', 'x', { indice_rechazado_en: '2026-11-03T12:00:00Z', indice_rechazo: 'zero_width_unicode' })), fila(ficha('a', 'y')))
    t.client_brain_chunks.push({ client_id: c.id, source_table: 'cerebro_fichas', source_id: 'a' })
    const m = montar(t)
    const x = await reconciliarYEnviar({ db: m.base.db as never, interruptores: ON, puente: m.deps.puente }, c.id, true)
    expect(x.errores).toEqual([])
    expect(x.puente).toMatchObject({ pendientes: 0, rechazadas_total: 1 })
    expect(x.puente.rechazadas).toEqual([{ id: 'r1', clase: 'competidor_comentarios', ref: 'portero:comentarios:r1', razon: 'zero_width_unicode' }])
    expect(x.puente.quedan).toBe(0)
  })

  it('«listo»: con un trozo rechazado el cerebro está LISTO (el plan no espera) y el hueco queda declarado', async () => {
    const t = nueva()
    t.cerebro_fichas.push(fila(ficha('r1', 'texto con PROHIBIDA')))
    const m = montar(t)
    const idx = fetchDelIndice(t, 'PROHIBIDA')
    m.deps.puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: m.base.db as never, fetchImpl: idx.impl, avisar: async () => undefined })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.status).toBe(200)
    expect(t.cerebro_fichas.find((f) => f.id === 'r1')!.indice_rechazado_en).toBeTruthy()
    // el ⑦ no lo trata como problema: sigue su camino normal
    expect(JSON.stringify(r.body)).not.toMatch(/trozo\(s\) por escribir o sacar/)
    // la cadena de la alta termina (el ⑧) y el «listo» llega SIN esperar el trozo rechazado
    const falta = (r.body.por_pedir_en_la_corrida_diaria ?? []) as Array<{ funcion: string }>
    for (const a of falta) t.apify_raw.push({ id: `cad-${a.funcion}`, client_id: c.id, apify_function: a.funcion, ensayo: false, created_at: min(20).toISOString(), params: {}, metadata: {}, respuesta: [] })
    const m2 = montar(t, { ahora: min(20) })
    m2.deps.puente = m.deps.puente
    await alimentarCliente({ db: m2.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: min(20), gasto_de_hoy_usd: 0, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'ex-cadena-1' })
    const m3 = montar(t, { ahora: min(21) })
    m3.deps.puente = m.deps.puente
    const l = await rutaListo(m3.deps, { client_id: c.id })
    expect(l.body).toMatchObject({ listo: true, puente_quedan: 0 })
    expect((l.body.huecos as Array<{ funcion: string; objetivo: string }>).filter((h) => h.funcion === 'rechazado_por_el_filtro')).toHaveLength(1)
    expect(JSON.stringify(l.body.huecos)).toMatch(/r1/)
  })

  it('el tope: más de 3 trozos O más del 5 % (lo que llegue primero)', () => {
    expect(MAX_RECHAZOS_SIN_AVISAR).toBe(3)
    expect(pasaElTopeDeRechazos(0, 40)).toBe(false)
    expect(pasaElTopeDeRechazos(1, 40)).toBe(false) // 2,5 %
    expect(pasaElTopeDeRechazos(2, 40)).toBe(false) // 5 % justo no pasa
    expect(pasaElTopeDeRechazos(3, 40)).toBe(true) // 7,5 %
    expect(pasaElTopeDeRechazos(3, 100)).toBe(false) // 3 % y no más de 3
    expect(pasaElTopeDeRechazos(4, 100)).toBe(true) // más de 3
    expect(pasaElTopeDeRechazos(1, 1)).toBe(true) // todo lo intentado se rechazó
  })

  async function pasada(rechazadas: number, buenas: number) {
    const t = nueva()
    const malas = Array.from({ length: rechazadas }, (_, i) => ficha(`m${i}`, `MALA ${i}`))
    const ok = Array.from({ length: buenas }, (_, i) => ficha(`b${i}`, `buena ${i}`))
    t.cerebro_fichas.push(...[...malas, ...ok].map(fila))
    const avisos: Array<{ texto: string; clave?: string }> = []
    const idx = fetchDelIndice(t, 'MALA')
    const puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: montar(t).base.db as never, fetchImpl: idx.impl, avisar: async (texto, clave) => { avisos.push({ texto, clave }) } })
    const out = await puente({ escribir: [...malas, ...ok].map(puenteDeFicha), sacar: [], client_id: c.id })
    return { out, avisos, t }
  }

  it('4 rechazos en una corrida → UNA alarma con cliente, cuántos y por qué; los 4 quedan marcados; nada se pierde en silencio', async () => {
    const { out, avisos, t } = await pasada(4, 16)
    expect(out.rechazados).toHaveLength(4)
    expect(avisos).toHaveLength(1)
    expect(avisos[0].texto).toMatch(/rechazó 4 de 20/); expect(avisos[0].texto).toMatch(/zero_width_unicode/); expect(avisos[0].texto).toContain(c.id.slice(0, 8))
    expect(avisos[0].clave).toMatch(/^indice-rechazos:/)
    expect(t.cerebro_fichas.filter((f) => f.indice_rechazado_en).length).toBe(4)
  })
  it('1 rechazo entre 40 no suena (2,5 %), pero queda marcado y declarado', async () => {
    const { out, avisos, t } = await pasada(1, 39)
    expect(out.rechazados).toHaveLength(1); expect(avisos).toHaveLength(0)
    expect(t.cerebro_fichas.filter((f) => f.indice_rechazado_en).length).toBe(1)
  })
  it('si Slack falla, la pasada sigue (la alarma no tumba nada)', async () => {
    const t = nueva(); t.cerebro_fichas.push(fila(ficha('m0', 'MALA')))
    const puente = puenteAlIndice({ origen: 'https://x', llaveInterna: 'k', db: montar(t).base.db as never, fetchImpl: fetchDelIndice(t, 'MALA').impl, avisar: async () => { throw new Error('slack caído') } })
    await expect(puente({ escribir: [puenteDeFicha(ficha('m0', 'MALA'))], sacar: [], client_id: c.id })).resolves.toMatchObject({ errores: [] })
  })
})

describe('3 · la vigía de pausas «hasta la alta»', () => {
  const pausa = (t: T, extra: Record<string, unknown> = {}) => t.cerebro_portero_pausas.push({ id: 'p1', client_id: c.id, motivo: 'desde cero', problemas: [], desde: AHORA.toISOString(), levantada_en: null, termina_con: FIN_ALTA_TERMINADA, motivo_tipo: null, ...extra })
  const vigia = async (t: T, cuando: Date) => {
    const avisos: Array<{ texto: string; clave?: string }> = []
    const r = await vigiarPausasDeAlta(montar(t).base.db as never, cuando, async (texto, clave) => { avisos.push({ texto, clave }) })
    return { r, avisos }
  }

  it('antes de las 3 h no hace nada', async () => {
    const t = nueva(); pausa(t)
    const { r, avisos } = await vigia(t, hora(2.9))
    expect(r).toMatchObject({ abiertas: 1, cerradas: 0, avisadas: 0 }); expect(avisos).toHaveLength(0); expect(t.cerebro_portero_pausas[0].levantada_en).toBeNull()
  })
  it('pausa corriente: a las 3 h se cierra sola con UNA alarma', async () => {
    const t = nueva(); pausa(t)
    const { r, avisos } = await vigia(t, hora(3.1))
    expect(r).toMatchObject({ cerradas: 1, avisadas: 1 })
    expect(t.cerebro_portero_pausas[0]).toMatchObject({ levantada_por: expect.stringMatching(/3 h/) })
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeTruthy()
    expect(avisos[0].clave).toBe('pausa-alta:p1:3h')
    const otra = await vigia(t, hora(3.2)) // ya cerrada: no vuelve a sonar
    expect(otra.r.abiertas).toBe(0); expect(otra.avisos).toHaveLength(0)
  })
  it('pausa por BORRADO: a las 3 h solo AVISA (una vez, sin cerrar); a las 24 h sin alta se cierra sola con otra alarma', async () => {
    const t = nueva(); pausa(t, { motivo_tipo: TIPO_BORRADO })
    const a = await vigia(t, hora(3.5))
    expect(a.r).toMatchObject({ cerradas: 0, avisadas: 1 }); expect(a.avisos[0].clave).toBe('pausa-alta:p1:3h')
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeNull()
    const medio = await vigia(t, hora(10))
    expect(medio.r.cerradas).toBe(0); expect(t.cerebro_portero_pausas[0].levantada_en).toBeNull()
    const z = await vigia(t, hora(24.1))
    expect(z.r).toMatchObject({ cerradas: 1, avisadas: 1 }); expect(z.avisos[0].clave).toBe('pausa-alta:p1:24h')
    expect(String(t.cerebro_portero_pausas[0].levantada_por)).toMatch(/24 h/); expect(String(t.cerebro_portero_pausas[0].motivo_de_levantarla)).toMatch(/sin que el alta/)
  })
  it('alta que falla antes del ⑦: la de borrado avisa a las 3 h y nadie la reanuda a mano: a las 24 h vuelve a raspar', async () => {
    const t = nueva(); pausa(t, { motivo_tipo: TIPO_BORRADO })
    await vigia(t, hora(3)); await vigia(t, hora(23.9))
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeNull()
    await vigia(t, hora(24))
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeTruthy()
  })
  it('el fin del alta (el ⑦ real) cierra la de borrado antes de las 24 h', async () => {
    const t = nueva(); pausa(t, { motivo_tipo: TIPO_BORRADO, desde: min(-60).toISOString() })
    t.cerebro_portero_corridas.push({ id: 'diaria', client_id: c.id, dia: AHORA.toISOString().slice(0, 10), estado: 'hecha', resumen: {}, creado_en: min(-600).toISOString() })
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ pausa_de_alta: { cerradas: 1 } })
  })
  it('solo mira las pausas «hasta la alta»: las del vigilante (sin condición) no se tocan nunca', async () => {
    const t = nueva(); pausa(t, { termina_con: null, motivo: 'hay 1 ficha repetida' })
    const { r } = await vigia(t, hora(100))
    expect(r.abiertas).toBe(0); expect(t.cerebro_portero_pausas[0].levantada_en).toBeNull()
  })
  it('si la base falla, lo dice y no lanza; si Slack falla, igual cierra', async () => {
    expect(await vigiarPausasDeAlta({ from: () => { throw new Error('base caída') } } as never, AHORA)).toMatchObject({ errores: ['base caída'] })
    const t = nueva(); pausa(t)
    const r = await vigiarPausasDeAlta(montar(t).base.db as never, hora(4), async () => { throw new Error('slack caído') })
    expect(r.cerradas).toBe(1); expect(r.errores[0]).toMatch(/slack caído/)
  })
  it('pausar con tipo «borrado» deja la marca (al abrir y al convertir)', async () => {
    const t = nueva()
    await rutaPausarHastaLaAlta({ db: montar(t).base.db as never, ahora: AHORA }, { client_id: c.id, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', motivo: 'Náufrago desde cero', por: 'CC-CEREBRO', tipo: 'borrado' })
    expect(t.cerebro_portero_pausas[0]).toMatchObject({ termina_con: FIN_ALTA_TERMINADA, motivo_tipo: TIPO_BORRADO })
    const t2 = nueva(); pausa(t2, { termina_con: null })
    await rutaPausarHastaLaAlta({ db: montar(t2).base.db as never }, { client_id: c.id, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', motivo: 'x', por: 'y', tipo: 'borrado' })
    expect(t2.cerebro_portero_pausas[0]).toMatchObject({ termina_con: FIN_ALTA_TERMINADA, motivo_tipo: TIPO_BORRADO })
    const t3 = nueva()
    await rutaPausarHastaLaAlta({ db: montar(t3).base.db as never, ahora: AHORA }, { client_id: c.id, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', motivo: 'x', por: 'y' })
    expect(t3.cerebro_portero_pausas[0].motivo_tipo).toBeUndefined()
  })
})
