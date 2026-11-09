/**
 * LA PAUSA DEL RASPADO PROGRAMADO (09-nov · firma de Emilio) · US$ 0 · base falsa · sin Apify ni modelo.
 * Cubre: pausa activa · vence sola · valor roto = sin pausa · la corrida del horario sigue TODOS los días como mantenimiento · el reloj de redes no corre pasos ·
 * `descubrir` vacía lo de Apify solo en la corrida del horario y solo a clientes completos (el alta raspa igual) · la línea visible (un incidente, repetir no publica) ·
 * «listo» sigue true con la pausa (con fecha del último raspado) · la frescura sigue el ritmo real (cada 2 días = 60 h).
 */
import { describe, expect, it } from 'vitest'
import { avisarPorIncidente, resolverIncidente } from '../alertas'
import { rutaDespertar } from '../despertar'
import { alimentarCliente } from '../alimentar'
import { FRESCURA_DEL_LISTO_HORAS, frescuraDelListoHoras, rutaListo } from '../listo'
import { corridaProgramadaAhora, corridaQueSeRevisa, diaConCorrida, pausaDelRaspadoDelEntorno, raspadoEnPausa } from '../modo'
import { corridaDeLaHora } from '../modo-ruta'
import { pasosDelDia, PASOS_DE_REDES } from '../pasos-diarios'
import { claveDeLaPausaDelRaspado, clienteEnAlta, decidirPausaDelDescubrir, enLaCorridaProgramada, frenarPorLaPausa, lineaDeLaPausaDelRaspado, sostenerLaLineaDeLaPausa } from '../pausa-del-raspado'
import { correrElSiguientePaso } from '../redes-ruta'
import { crearBaseFalsa } from './base-falsa'
import { AHORA, CASOS, ON, REAL, montar, tablas } from './fixtures-despertar'

type Fila = Record<string, unknown>
type T = Record<string, Fila[]>
const t = (iso: string) => new Date(iso)
// lo que está en producción desde el 02-nov + la pausa firmada el 09-nov
const PROD = { PORTERO_CORRIDAS_POR_DIA: '1', PORTERO_CORRIDAS_CADA_DIAS: '2', PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2026-11-25', PORTERO_TENDENCIAS: 'on', PORTERO_FUENTES_NUEVAS: 'on' }
const PAUSA = { ...PROD, PORTERO_RASPADO_PAUSADO_HASTA: '2026-11-25' }
const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'

describe('la pausa es un dato con fecha: se reanuda sola', () => {
  it('activa antes de las 00:00 UTC del día dado; vence sola a esa hora; sin variable o con un valor roto, no hay pausa (y lo dice)', () => {
    expect(pausaDelRaspadoDelEntorno(PAUSA)).toEqual({ hasta: '2026-11-25T00:00:00.000Z', aviso: null })
    expect(raspadoEnPausa(t('2026-11-10T12:30:00Z'), PAUSA)).toBe(true)
    expect(raspadoEnPausa(t('2026-11-24T23:59:59Z'), PAUSA)).toBe(true)
    expect(raspadoEnPausa(t('2026-11-25T00:00:00Z'), PAUSA)).toBe(false)
    expect(raspadoEnPausa(t('2026-11-10T12:30:00Z'), PROD)).toBe(false)
    const roto = pausaDelRaspadoDelEntorno({ PORTERO_RASPADO_PAUSADO_HASTA: 'el 25' })
    expect(roto.hasta).toBeNull(); expect(roto.aviso).toMatch(/no se entiende/)
    expect(raspadoEnPausa(t('2026-11-10T12:30:00Z'), { PORTERO_RASPADO_PAUSADO_HASTA: 'el 25' })).toBe(false)
    // una fecha ISO completa también vale
    expect(raspadoEnPausa(t('2026-11-24T11:00:00Z'), { PORTERO_RASPADO_PAUSADO_HASTA: '2026-11-24T12:00:00Z' })).toBe(true)
  })
})

describe('la corrida del horario sigue TODOS los días como mantenimiento (puente, retiro, vigilante, pulido)', () => {
  it('el 09 y el 11-nov (días sin corrida cada 2) corre a las 12:30 en la pausa; sin la pausa no corría', async () => {
    for (const dia of ['2026-11-09', '2026-11-11']) {
      expect(diaConCorrida(t(`${dia}T12:30:00Z`), PROD)).toBe(false)
      expect(diaConCorrida(t(`${dia}T12:30:00Z`), PAUSA)).toBe(true)
      expect(corridaProgramadaAhora('construccion', t(`${dia}T12:31:00Z`), 20, PAUSA)?.toISOString()).toBe(`${dia}T12:30:00.000Z`)
      const m = await corridaDeLaHora({ env: PAUSA, ahora: t(`${dia}T12:31:00Z`) })
      expect(m).toMatchObject({ corre_ahora: true, raspado_en_pausa: { activa: true, hasta: '2026-11-25T00:00:00.000Z' } })
      expect(String((m.raspado_en_pausa as Fila).motivo)).toMatch(/mantenimiento, sin pedirle nada a Apify/)
    }
    // sigue siendo una corrida al día (PORTERO_CORRIDAS_POR_DIA=1): a las 18:30 no
    expect((await corridaDeLaHora({ env: PAUSA, ahora: t('2026-11-09T18:31:00Z') })).corre_ahora).toBe(false)
    // los vigías de «no corrió» revisan esa corrida diaria
    expect(corridaQueSeRevisa('construccion', t('2026-11-09T14:15:00Z'), 60, 180, PAUSA)?.toISOString()).toBe('2026-11-09T12:30:00.000Z')
    // el 25-nov vuelve sola a lo normal (diaria desde esa fecha) y /modo lo dice
    const despues = await corridaDeLaHora({ env: PAUSA, ahora: t('2026-11-25T12:31:00Z') })
    expect(despues).toMatchObject({ corre_ahora: true, raspado_en_pausa: { activa: false } })
  })
})

describe('el reloj de redes no corre pasos en la pausa', () => {
  it('pasosDelDia vacío en la pausa (redes, tendencias, bodega viral, transcripción y fuentes nuevas); vuelve sola el 25-nov', async () => {
    expect(pasosDelDia(t('2026-11-10T00:05:00Z'), PAUSA)).toEqual([])
    expect(pasosDelDia(t('2026-11-09T00:05:00Z'), PROD)).toEqual(PASOS_DE_REDES)
    expect(pasosDelDia(t('2026-11-25T00:05:00Z'), PAUSA).length).toBeGreaterThan(PASOS_DE_REDES.length)
    // el reloj ni siquiera lee la base
    const base = crearBaseFalsa({ clients: [{ id: C, status: 'active' }] })
    const r = await correrElSiguientePaso({ db: base.db as never, ahora: t('2026-11-10T00:05:00Z'), env: PAUSA }, { workflowId: 'cron', ejecucionId: 'x' })
    expect(r).toMatchObject({ ok: true, estado: 'raspado_en_pausa' })
    expect(String((r as { motivo: string }).motivo)).toMatch(/hasta el 25-nov/)
    expect(base.lecturas).toEqual([])
  })
})

describe('descubrir: en la corrida del horario un cliente completo no le pide nada a Apify; el alta raspa igual', () => {
  const tablasCon = (o: { hecha?: boolean; pausaDeAlta?: boolean } = {}) => ({
    cerebro_portero_corridas: o.hecha === false ? [] : [{ id: 'c1', client_id: C, dia: '2026-11-08', estado: 'hecha' }],
    cerebro_portero_pausas: o.pausaDeAlta ? [{ id: 'p1', client_id: C, termina_con: 'alta_terminada', levantada_en: null }] : [{ id: 'p0', client_id: C, termina_con: 'alta_terminada', levantada_en: '2026-11-03T15:03:42Z' }],
  })
  const decidir = (tb: T, ahora: string, env: Record<string, string> = PAUSA, fase?: string) => decidirPausaDelDescubrir({ db: crearBaseFalsa(tb).db as never, ahora: t(ahora), env, clientId: C, fase })

  it('cliente completo, 12:30–15:30 del día: frena; antes o después de la ventana (pedidos del sistema): no', async () => {
    expect(enLaCorridaProgramada(t('2026-11-10T12:31:00Z'), PAUSA)).toBe(true)
    expect(await decidir(tablasCon(), '2026-11-10T12:31:00Z')).toMatchObject({ frena: true, hasta: '2026-11-25T00:00:00.000Z' })
    expect(await decidir(tablasCon(), '2026-11-10T15:29:00Z')).toMatchObject({ frena: true })
    expect(await decidir(tablasCon(), '2026-11-10T15:31:00Z')).toMatchObject({ frena: false, por_que: expect.stringMatching(/pedido del sistema/) })
    expect(await decidir(tablasCon(), '2026-11-10T09:00:00Z')).toMatchObject({ frena: false })
  })
  it('el alta raspa igual: pausa «hasta la alta» abierta, o cliente nuevo sin corrida hecha', async () => {
    expect(await decidir(tablasCon({ pausaDeAlta: true }), '2026-11-10T12:31:00Z')).toMatchObject({ frena: false, por_que: expect.stringMatching(/hasta la alta/) })
    expect(await decidir(tablasCon({ hecha: false }), '2026-11-10T12:31:00Z')).toMatchObject({ frena: false, por_que: expect.stringMatching(/cliente nuevo/) })
    expect(await clienteEnAlta(crearBaseFalsa(tablasCon()).db as never, C)).toEqual({ ok: true, en_alta: false, por_que: 'ya está completo' })
  })
  it('sin pausa, vencida, o fase «clientes»: no frena; una lectura fallida no frena (un alta nunca se queda sin raspar) y lo dice', async () => {
    expect(await decidir(tablasCon(), '2026-11-10T12:31:00Z', PROD)).toMatchObject({ frena: false, hasta: null })
    expect(await decidir(tablasCon(), '2026-11-25T12:31:00Z')).toMatchObject({ frena: false, hasta: null })
    expect(await decidir(tablasCon(), '2026-11-10T12:31:00Z', PAUSA, 'clientes')).toMatchObject({ frena: false })
    const rota = await decidirPausaDelDescubrir({ db: crearBaseFalsa(tablasCon(), { fallaEn: 'cerebro_portero_pausas' }).db as never, ahora: t('2026-11-10T12:31:00Z'), env: PAUSA, clientId: C })
    expect(rota).toMatchObject({ frena: false, por_que: expect.stringMatching(/no se pudo saber/) })
  })
  it('frenar vacía el plan del día, las acciones de la 2.ª tanda y de los artículos, y lo deja a la vista; sin freno el cuerpo no cambia', async () => {
    const d = await decidir(tablasCon(), '2026-11-10T12:31:00Z')
    const plan = { hacer: [{ fuente: 'sitio', funcion: 'website_content_scraper' }, { fuente: 'mapas', funcion: 'google_maps_scraper' }], omitidas: [], costo_maximo_del_plan_usd: 0.4 }
    const a = frenarPorLaPausa({ plan, modelos_llamados: 0 }, d) as { plan: { hacer: unknown[]; omitidas: Array<{ por_que: string }>; costo_maximo_del_plan_usd: number }; raspado_en_pausa: Fila }
    expect(a.plan.hacer).toEqual([]); expect(a.plan.costo_maximo_del_plan_usd).toBe(0)
    expect(a.plan.omitidas.map((o) => o.por_que)).toEqual(['raspado diario en pausa hasta el 25-nov', 'raspado diario en pausa hasta el 25-nov'])
    expect(a.raspado_en_pausa).toMatchObject({ frena: true })
    const b = frenarPorLaPausa({ acciones: [{ fuente: 'prensa' }], omitidas: [] }, d) as { acciones: unknown[]; omitidas: unknown[] }
    expect(b.acciones).toEqual([]); expect(b.omitidas).toHaveLength(1)
    const sin = await decidir(tablasCon(), '2026-11-10T12:31:00Z', PROD)
    expect(frenarPorLaPausa({ plan }, sin)).toEqual({ plan })
    const alta = await decidir(tablasCon({ pausaDeAlta: true }), '2026-11-10T12:31:00Z')
    expect((frenarPorLaPausa({ plan }, alta) as { plan: typeof plan }).plan.hacer).toHaveLength(2)
  })
})

describe('la pausa se ve: UNA línea en cerebro_alertas, sin una alarma por corrida', () => {
  it('abre una vez, repetir solo cuenta (no publica), y al vencer se cierra en su hilo', async () => {
    const tb: T = { cerebro_alertas: [] }
    const base = crearBaseFalsa(tb)
    const publicados: Array<{ text: string; thread_ts?: string }> = []
    const fetchImpl = (async (_u: string, i?: RequestInit) => { const b = JSON.parse(String(i?.body)); publicados.push(b); return new Response(JSON.stringify({ ok: true, ts: `ts-${publicados.length}` })) }) as never
    let reloj = t('2026-11-10T00:30:00Z')
    const o = { db: base.db as never, token: 'x', fetchImpl, ahora: () => reloj }
    const avisar = async (texto: string, clave: string) => { const r = await avisarPorIncidente(o)(texto, clave); return { ok: r.ok, detalle: r.accion } }
    const resolver = async (clave: string, nota: string) => { const r = await resolverIncidente(o)(clave, nota); return { ok: r.ok, detalle: r.accion } }
    for (const h of ['2026-11-10T00:30:00Z', '2026-11-10T12:30:00Z', '2026-11-10T18:30:00Z', '2026-11-11T00:30:00Z', '2026-11-11T12:30:00Z']) {
      reloj = t(h)
      await sostenerLaLineaDeLaPausa({ ahora: reloj, env: PAUSA, avisar, resolver })
    }
    expect(publicados).toHaveLength(1)
    expect(publicados[0].text).toBe(lineaDeLaPausaDelRaspado('2026-11-25T00:00:00.000Z'))
    expect(tb.cerebro_alertas).toHaveLength(1)
    expect(tb.cerebro_alertas[0]).toMatchObject({ clave: claveDeLaPausaDelRaspado('2026-11-25T00:00:00.000Z'), repeticiones: 4, cerrado_en: null })
    expect(String(tb.cerebro_alertas[0].clave)).toBe('raspado-en-pausa:2026-11-25')
    reloj = t('2026-11-25T00:30:00Z')
    expect(await sostenerLaLineaDeLaPausa({ ahora: reloj, env: PAUSA, avisar, resolver })).toMatchObject({ accion: 'cerrada', detalle: 'cerro' })
    expect(tb.cerebro_alertas[0].cerrado_en).toBe('2026-11-25T00:30:00.000Z')
    expect(publicados[1]).toMatchObject({ thread_ts: 'ts-1' })
    expect(publicados[1].text).toMatch(/volvió solo el 25-nov/)
    // sin pausa configurada no escribe nada
    expect(await sostenerLaLineaDeLaPausa({ ahora: reloj, env: PROD, avisar, resolver })).toMatchObject({ accion: 'nada' })
    expect(publicados).toHaveLength(2)
  })
})

describe('«listo» con la pausa y con el ritmo real', () => {
  const listoDe = async (tb: T, clientId: string, ahora: Date, env: Record<string, string>) => {
    const m = montar(tb, { ahora })
    const r = await rutaListo({ ...m.deps, env } as never, { client_id: clientId })
    return r.body as Fila
  }
  // un cliente que quedó completo: alta + cadena (la corrida hecha es de AHORA)
  const completo = async () => {
    const c = CASOS[0]
    const tb = tablas(c) as T
    const r = await rutaDespertar(montar(tb).deps, { client_id: c.id, ...REAL })
    for (const a of r.body.por_pedir_en_la_corrida_diaria as Array<{ funcion: string }>) tb.apify_raw.push({ id: `cad-${a.funcion}`, client_id: c.id, apify_function: a.funcion, ensayo: false, created_at: new Date(AHORA.getTime() + 20 * 60_000).toISOString(), params: {}, metadata: {}, respuesta: [] })
    const cuando = new Date(AHORA.getTime() + 20 * 60_000)
    await alimentarCliente({ db: montar(tb, { ahora: cuando }).base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: cuando, gasto_de_hoy_usd: 0, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'ex-1' })
    return { tb, id: c.id, hecha: cuando }
  }
  const horas = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000)
  const envCon = (base: Record<string, string>) => ({ ...base, PORTERO_CORRIDAS_CADA_DIAS_HASTA: '2099-01-01', ...(base.PORTERO_RASPADO_PAUSADO_HASTA ? { PORTERO_RASPADO_PAUSADO_HASTA: '2099-01-01' } : {}) })

  it('la frescura sigue el ritmo: cada 2 días = 60 h (sin el hueco de 12 h); sin cada-días, 36 h; vencida la fecha, 36 h', () => {
    expect(frescuraDelListoHoras(t('2026-11-10T00:40:00Z'), PROD)).toBe(60)
    expect(frescuraDelListoHoras(t('2026-11-10T00:40:00Z'), {})).toBe(FRESCURA_DEL_LISTO_HORAS)
    expect(frescuraDelListoHoras(t('2026-11-25T00:00:00Z'), PROD)).toBe(36)
    expect(frescuraDelListoHoras(t('2026-11-10T00:40:00Z'), { ...PROD, PORTERO_CORRIDAS_CADA_DIAS: '3' })).toBe(84)
  })
  it('con cada 2 días: a las 50 h sigue listo (antes caía a las 36); a las 61 h ya no', async () => {
    const { tb, id, hecha } = await completo()
    const env = envCon(PROD)
    expect(await listoDe(tb, id, horas(hecha, 50), env)).toMatchObject({ listo: true, frescura_horas: 60 })
    expect(await listoDe(tb, id, horas(hecha, 50), {})).toMatchObject({ listo: false, frescura_horas: 36 })
    const viejo = await listoDe(tb, id, horas(hecha, 61), env)
    expect(viejo).toMatchObject({ listo: false }); expect(String(viejo.motivo)).toMatch(/más de 60 h/)
  })
  it('en la pausa: listo true aunque la corrida tenga 10 días, con la razón y la fecha del último raspado', async () => {
    const { tb, id, hecha } = await completo()
    const env = envCon(PAUSA)
    const r = await listoDe(tb, id, horas(hecha, 240), env)
    expect(r).toMatchObject({ listo: true, frescura_horas: null, raspado_en_pausa: { hasta: '2099-01-01T00:00:00.000Z' } })
    expect(String(r.motivo)).toMatch(/raspado diario en pausa hasta el 01-ene \(último raspado: \d{4}-\d{2}-\d{2}\)/)
    // la base falsa no ordena: aquí se comprueba que la fecha sale de lo raspado del cliente; el orden (el más nuevo) lo da la consulta en la base real
    expect(tb.apify_raw.filter((x) => x.client_id === id).map((x) => x.created_at)).toContain((r.raspado_en_pausa as Fila).ultimo_raspado)
    // la pausa no tapa un problema de verdad: una corrida con errores sigue dando «no listo»
    const ult = tb.cerebro_portero_corridas[0]; ult.estado = 'con_errores'
    expect(await listoDe(tb, id, horas(hecha, 240), env)).toMatchObject({ listo: false })
  })
})
