/** El modo del portero (construcción / campaña), el plan de Apify y el vigía por corrida (28-oct). US$ 0 · sin red. */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from './base-falsa'
import { CORRIDAS_POR_MODO, eldineroFrena, topeQueCortaUsd, corridaForzada, corridaProgramadaAhora, corridaQueSeRevisa, corridasDelDia, modoDelEntorno, topeDiarioPorClienteUsd } from '../modo'
import { claveDeAvisoDelPlan, decidirPlanApify, frenarCuerpoPorPlan, leerUsoDelPlan, lineaDePlanApify, pctMaximoDelPlan, revisarPlanApify, type UsoDelPlan } from '../plan-apify'
import { corridaDeLaHora } from '../modo-ruta'
import { rutaNoCorrio, type DepsDeNoCorrio } from '../no-corrio'
import { topesVigentes } from '../costos'
import { descubrir } from '../plan'
import { RETENCION_DE_FOTOS_AJENAS_DIAS, diasDeRetencionDeUnaFoto } from '../../cerebro/retencion-de-fotos'

const U = (usado: number, extra: Partial<UsoDelPlan> = {}): UsoDelPlan => ({ plan: 'STARTER', credito_usd: 29, usado_usd: usado, ciclo_desde: '2026-10-25T00:00:00.000Z', ciclo_hasta: '2026-11-24T23:59:59.999Z', ...extra })
const t = (iso: string) => new Date(iso)

describe('el modo es un dato (PORTERO_MODO)', () => {
  it('arranca en construccion; campana se lee; un valor roto cae a campana y lo dice', () => {
    expect(modoDelEntorno({})).toMatchObject({ modo: 'construccion', origen: 'por_omision', aviso: null })
    expect(modoDelEntorno({ PORTERO_MODO: ' Construcción ' })).toMatchObject({ modo: 'construccion', origen: 'variable' })
    expect(modoDelEntorno({ PORTERO_MODO: 'CAMPAÑA' })).toMatchObject({ modo: 'campana', origen: 'variable' })
    const roto = modoDelEntorno({ PORTERO_MODO: 'turbo' })
    expect(roto.modo).toBe('campana'); expect(roto.origen).toBe('valor_roto'); expect(roto.aviso).toMatch(/turbo/)
  })
  it('construccion = 3 corridas (12:30, 18:30, 00:30) y tope 3,00; campana = 1 corrida (12:30) y tope 1,00', () => {
    expect(CORRIDAS_POR_MODO.construccion.map((c) => c.hhmm)).toEqual(['12:30', '18:30', '00:30'])
    expect(CORRIDAS_POR_MODO.campana.map((c) => c.hhmm)).toEqual(['12:30'])
    expect(topeDiarioPorClienteUsd('construccion')).toBe(3); expect(topeDiarioPorClienteUsd('campana')).toBe(1)
    expect(corridasDelDia('construccion', t('2026-10-28T15:00:00Z')).map((d) => d.toISOString().slice(11, 16))).toEqual(['00:30', '12:30', '18:30'])
  })
  it('«toca correr ahora» solo a las horas del modo (con 20 min de holgura del disparador)', () => {
    expect(corridaProgramadaAhora('construccion', t('2026-10-28T12:30:05Z'))?.toISOString()).toBe('2026-10-28T12:30:00.000Z')
    expect(corridaProgramadaAhora('construccion', t('2026-10-28T18:34:00Z'))?.toISOString()).toBe('2026-10-28T18:30:00.000Z')
    expect(corridaProgramadaAhora('construccion', t('2026-10-29T00:31:00Z'))?.toISOString()).toBe('2026-10-29T00:30:00.000Z')
    expect(corridaProgramadaAhora('construccion', t('2026-10-28T16:00:00Z'))).toBeNull()
    // campaña: las 18:30 y las 00:30 NO tocan
    expect(corridaProgramadaAhora('campana', t('2026-10-28T12:30:00Z'))).not.toBeNull()
    expect(corridaProgramadaAhora('campana', t('2026-10-28T18:30:00Z'))).toBeNull()
    expect(corridaProgramadaAhora('campana', t('2026-10-29T00:30:00Z'))).toBeNull()
  })
  it('en construccion cada corrida repite el día (forzar); en campaña no', () => {
    expect(corridaForzada('construccion')).toBe(true); expect(corridaForzada('campana')).toBe(false)
  })
  it('la respuesta de /modo: corre_ahora + forzar + tope + plan de Apify, y cambiar PORTERO_MODO la cambia sin tocar nada más', async () => {
    const uso = async () => ({ ok: true as const, uso: U(0.7) })
    const c = await corridaDeLaHora({ env: {}, ahora: t('2026-10-28T18:30:30Z'), uso })
    expect(c).toMatchObject({ modo: 'construccion', corre_ahora: true, forzar: true, tope_diario_por_cliente_usd: 3, corridas_utc: ['12:30', '18:30', '00:30'] })
    expect((c.plan_apify as { permitido: boolean }).permitido).toBe(true)
    const k = await corridaDeLaHora({ env: { PORTERO_MODO: 'campana' }, ahora: t('2026-10-28T18:30:30Z'), uso })
    expect(k).toMatchObject({ modo: 'campana', corre_ahora: false, forzar: false, tope_diario_por_cliente_usd: 1 })
    const k12 = await corridaDeLaHora({ env: { PORTERO_MODO: 'campana' }, ahora: t('2026-10-28T12:30:30Z') })
    expect(k12).toMatchObject({ corre_ahora: true, forzar: false, plan_apify: null })
  })
})

describe('el plan de Apify: no pasa del ~90 % del crédito del mes', () => {
  it('con el uso real de hoy (US$ 0,71 de 29) cabe; a US$ 26,10 ya no; pedir de más tampoco', () => {
    expect(decidirPlanApify(U(0.71), 90)).toMatchObject({ permitido: true, tope_usd: 26.1, pct_usado: 2.4 })
    expect(decidirPlanApify(U(26.1), 90).permitido).toBe(true) // justo en el tope: cabe (no se pasa)
    const pasa = decidirPlanApify(U(26.11), 90)
    expect(pasa.permitido).toBe(false); expect(pasa.motivo).toMatch(/90 %/)
    expect(decidirPlanApify(U(26), 90, 0.5).permitido).toBe(false)
    expect(decidirPlanApify(U(26), 90, 0.05).permitido).toBe(true)
  })
  it('el 90 es un dato; un valor roto vuelve a 90', () => {
    expect(pctMaximoDelPlan({})).toBe(90); expect(pctMaximoDelPlan({ PORTERO_APIFY_PLAN_MAX_PCT: '80' })).toBe(80)
    expect(pctMaximoDelPlan({ PORTERO_APIFY_PLAN_MAX_PCT: 'x' })).toBe(90); expect(pctMaximoDelPlan({ PORTERO_APIFY_PLAN_MAX_PCT: '500' })).toBe(90)
  })
  it('lee la cuenta con la forma real (plan y crédito en /me; uso y ciclo en /limits) y dice si no puede', async () => {
    const me = { data: { plan: { id: 'STARTER', monthlyUsageCreditsUsd: 29 } } }
    const lim = { data: { monthlyUsageCycle: { startAt: '2026-10-25T00:00:00.000Z', endAt: '2026-11-24T23:59:59.999Z' }, limits: { maxMonthlyUsageUsd: 29 }, current: { monthlyUsageUsd: 0.705 } } }
    const ok = await leerUsoDelPlan({ token: 'x', fetchImpl: async (u) => new Response(JSON.stringify(String(u).endsWith('/limits') ? lim : me), { status: 200 }) })
    expect(ok).toEqual({ ok: true, uso: { plan: 'STARTER', credito_usd: 29, usado_usd: 0.705, ciclo_desde: '2026-10-25T00:00:00.000Z', ciclo_hasta: '2026-11-24T23:59:59.999Z' } })
    expect((await leerUsoDelPlan({ token: 'x', fetchImpl: async () => new Response('no', { status: 401 }) })).ok).toBe(false)
    expect((await leerUsoDelPlan({ token: '' })).ok).toBe(false)
  })
  it('si se pasa: avisa UNA vez (clave por ciclo), no en seco; si no se puede leer, no frena pero lo dice', async () => {
    const avisos: Array<[string, string | undefined]> = []
    const avisar = async (x: string, k?: string) => { avisos.push([x, k]); return { ok: true, detalle: 'ok' } }
    const bien = await revisarPlanApify({ leer: async () => ({ ok: true, uso: U(1) }), avisar })
    expect(bien).toMatchObject({ leido: true }); expect(avisos).toHaveLength(0)
    const mal = await revisarPlanApify({ leer: async () => ({ ok: true, uso: U(27) }), avisar })
    expect(mal).toMatchObject({ leido: true, aviso: { ok: true } })
    expect(avisos).toHaveLength(1); expect(avisos[0][1]).toBe('plan-apify:2026-10-25'); expect(avisos[0][0]).toContain('93.1 %')
    await revisarPlanApify({ leer: async () => ({ ok: true, uso: U(27) }), avisar, dry_run: true })
    expect(avisos).toHaveLength(1)
    expect(await revisarPlanApify({ leer: async () => ({ ok: false, detalle: 'sin token' }), avisar })).toEqual({ leido: false, detalle: 'sin token' })
    expect(claveDeAvisoDelPlan(U(1, { ciclo_desde: null }))).toBe('plan-apify:sin-ciclo')
    expect(lineaDePlanApify(decidirPlanApify(U(27), 90), U(27))).toContain('2026-11-24')
  })
  it('frenar vacía TODO lo que pediría a Apify (plan del día, 2.ª tanda, artículos) y lo dice; si cabe no toca nada', () => {
    const mal = decidirPlanApify(U(27), 90)
    const plan = { hacer: [{ fuente: 'mapas', funcion: 'google_maps_scraper' }, { fuente: 'sitio', funcion: 'website_content_scraper' }], omitidas: [], costo_maximo_del_plan_usd: 0.2 }
    const a = frenarCuerpoPorPlan({ plan, modelos_llamados: 0 }, mal) as { plan: { hacer: unknown[]; omitidas: Array<{ por_que: string }>; costo_maximo_del_plan_usd: number }; plan_apify: { permitido: boolean } }
    expect(a.plan.hacer).toEqual([]); expect(a.plan.omitidas).toHaveLength(2); expect(a.plan.omitidas[0].por_que).toMatch(/plan de Apify/); expect(a.plan.costo_maximo_del_plan_usd).toBe(0); expect(a.plan_apify.permitido).toBe(false)
    const b = frenarCuerpoPorPlan({ acciones: [{ fuente: 'prensa' }], omitidas: [] }, mal) as { acciones: unknown[]; omitidas: unknown[] }
    expect(b.acciones).toEqual([]); expect(b.omitidas).toHaveLength(1)
    const ok = frenarCuerpoPorPlan({ plan, modelos_llamados: 0 }, decidirPlanApify(U(1), 90)) as { plan: typeof plan; plan_apify: { permitido: boolean } }
    expect(ok.plan.hacer).toHaveLength(2); expect(ok.plan_apify.permitido).toBe(true)
  })
})

describe('el vigía revisa CADA corrida del modo vigente', () => {
  it('la ventana: en construcción toca a las 14:15, 20:15 y 02:15 UTC; en campaña solo a las 14:15', () => {
    expect(corridaQueSeRevisa('construccion', t('2026-10-28T14:15:00Z'))?.toISOString()).toBe('2026-10-28T12:30:00.000Z')
    expect(corridaQueSeRevisa('construccion', t('2026-10-28T20:15:00Z'))?.toISOString()).toBe('2026-10-28T18:30:00.000Z')
    expect(corridaQueSeRevisa('construccion', t('2026-10-29T02:15:00Z'))?.toISOString()).toBe('2026-10-29T00:30:00.000Z')
    expect(corridaQueSeRevisa('construccion', t('2026-10-28T20:45:00Z'))?.toISOString()).toBe('2026-10-28T18:30:00.000Z')
    expect(corridaQueSeRevisa('campana', t('2026-10-28T14:15:00Z'))).not.toBeNull()
    expect(corridaQueSeRevisa('campana', t('2026-10-28T20:15:00Z'))).toBeNull()
    expect(corridaQueSeRevisa('campana', t('2026-10-29T02:15:00Z'))).toBeNull()
  })

  const C = '99999999-9999-4999-8999-999999999999'
  const montar = (corridas: unknown[], ahora: string, esperada: string) => {
    const base = crearBaseFalsa({
      clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
      client_brand_books: [{ id: 'mb', client_id: C }],
      client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
      cerebro_portero_corridas: corridas,
    } as never)
    const avisos: Array<[string, string | undefined]> = []
    const deps: DepsDeNoCorrio = { db: base.db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true } as never, ahora: t(ahora), workflowId: 'ogfq56oIEoHufFPM', corridaEsperada: t(esperada), avisar: async (x, k) => { avisos.push([x, k]); return { ok: true, detalle: 'ok' } } }
    return { deps, avisos }
  }
  const fila = (dia: string, ultima: string | undefined, extra: Record<string, unknown> = {}) => ({ id: `r-${dia}`, client_id: C, dia, estado: 'hecha', creado_en: `${dia}T12:31:00Z`, resumen: { ...(ultima ? { ultima_corrida_en: ultima } : {}), ...extra } })

  it('la fila de hoy es de las 12:30 y la de las 18:30 no dejó rastro ⇒ UNA línea que lo dice (antes quedaba en silencio: la fila existe y está «hecha»)', async () => {
    const m = montar([fila('2026-10-28', '2026-10-28T12:36:00Z')], '2026-10-28T20:15:00Z', '2026-10-28T18:30:00Z')
    const r = await rutaNoCorrio(m.deps, { dry_run: false })
    expect(r.body.ok).toBe(false)
    expect(r.body.clientes).toMatchObject([{ veredicto: 'corrida_sin_rastro' }])
    expect(m.avisos).toHaveLength(1); expect(m.avisos[0][0]).toMatch(/corrida de las 18:30 UTC no dejó rastro \(el último es de 12:36 UTC\)/); expect(m.avisos[0][1]).toBe('no-corrio:2026-10-28:18:30')
  })
  it('la corrida de las 18:30 sí dejó rastro ⇒ silencio', async () => {
    const m = montar([fila('2026-10-28', '2026-10-28T18:42:00Z')], '2026-10-28T20:15:00Z', '2026-10-28T18:30:00Z')
    const r = await rutaNoCorrio(m.deps, { dry_run: false })
    expect(r.body.ok).toBe(true); expect(m.avisos).toEqual([])
  })
  it('la corrida de las 00:30 se revisa a las 02:15 con la fila del día NUEVO; sin fila nueva sigue la lógica de siempre (aviso por día sin corrida)', async () => {
    const ok = montar([fila('2026-10-29', '2026-10-29T00:41:00Z')], '2026-10-29T02:15:00Z', '2026-10-29T00:30:00Z')
    expect((await rutaNoCorrio(ok.deps, { dry_run: false })).body.ok).toBe(true)
    const sin = montar([fila('2026-10-28', '2026-10-28T18:42:00Z')], '2026-10-29T02:15:00Z', '2026-10-29T00:30:00Z')
    const r = await rutaNoCorrio(sin.deps, { dry_run: false })
    expect(r.body.ok).toBe(false); expect(sin.avisos[0][0]).toMatch(/hoy no hay corrida/)
  })
  it('una fila vieja sin `ultima_corrida_en` usa su `creado_en`; una fila de despertar NO cuenta como corrida', async () => {
    const vieja = montar([{ ...fila('2026-10-28', undefined), creado_en: '2026-10-28T12:40:00Z' }], '2026-10-28T14:15:00Z', '2026-10-28T12:30:00Z')
    expect((await rutaNoCorrio(vieja.deps, { dry_run: false })).body.ok).toBe(true)
    const despertar = montar([fila('2026-10-28', '2026-10-28T13:00:00Z', { tipo: 'despertar' })], '2026-10-28T14:15:00Z', '2026-10-28T12:30:00Z')
    expect((await rutaNoCorrio(despertar.deps, { dry_run: false })).body.clientes).toMatchObject([{ veredicto: 'corrida_sin_rastro' }])
  })
  it('sin corridaEsperada se revisa como siempre (una por día): la fila de hoy hecha ⇒ silencio', async () => {
    const m = montar([fila('2026-10-28', '2026-10-28T09:00:00Z')], '2026-10-28T14:15:00Z', '2026-10-28T12:30:00Z')
    const { corridaEsperada: _x, ...sin } = m.deps
    expect((await rutaNoCorrio(sin, { dry_run: false })).body.ok).toBe(true)
  })
})

describe('los topes visibles dependen del modo y traen el plan de Apify', () => {
  it('construcción 3,00 · campaña 1,00 · tope del mes = 90 % del crédito', () => {
    const u = { aviso_usd: 3, apagar_usd: 10 }
    const plan = { uso: U(0.7), pct_max: 90 }
    const c = topesVigentes(u, { modo: 'construccion', plan }); const k = topesVigentes(u, { modo: 'campana', plan })
    expect(c.find((x) => x.tope === 'raspado diario · por cliente y día')?.usd).toBe(3)
    expect(k.find((x) => x.tope === 'raspado diario · por cliente y día')?.usd).toBe(1)
    expect(c.find((x) => x.tope === 'plan de Apify · mes')).toMatchObject({ usd: 26.1, frena: false })
    expect(k.find((x) => x.tope === 'plan de Apify · mes')).toMatchObject({ usd: 26.1, frena: true })
    expect(c.find((x) => x.tope === 'raspado diario · por cliente y día')?.frena).toBe(false)
    expect(k.find((x) => x.tope === 'raspado diario · por cliente y día')?.frena).toBe(true)
    // los firmados del gasto total no cambian con el modo
    expect(k.find((x) => x.tope === 'portero · aviso')?.usd).toBe(3); expect(k.find((x) => x.tope === 'portero · apagado')?.usd).toBe(10)
    expect(topesVigentes(u).some((x) => x.tope === 'plan de Apify · mes')).toBe(false)
  })
})

describe('retención de las fotos ajenas', () => {
  it('competidor y referencia = 90 días; lo propio no vence por plazo', () => {
    expect(RETENCION_DE_FOTOS_AJENAS_DIAS).toBe(90)
    expect(diasDeRetencionDeUnaFoto('competidor')).toBe(90); expect(diasDeRetencionDeUnaFoto('referencia')).toBe(90)
    expect(diasDeRetencionDeUnaFoto('propio')).toBeNull()
  })
})

describe('en construcción el dinero no frena (Emilio 28-oct)', () => {
  const base = { cliente: { id: 'C', name: 'Náufrago', website_url: 'https://naufrago.example', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }, ciudad: 'Olón', publicaciones_propias: [] as string[], interruptores: { alimentar: true, proponer_busquedas: false, menciones: true, puente_al_indice: false } }
  it('solo la campaña deja que el dinero frene; el tope que corta en construcción es enorme', () => {
    expect(eldineroFrena('construccion')).toBe(false); expect(eldineroFrena('campana')).toBe(true)
    expect(topeQueCortaUsd('campana', 3)).toBe(1); expect(topeQueCortaUsd(undefined, 3)).toBe(3); expect(topeQueCortaUsd('construccion', 3)).toBeGreaterThan(1000)
  })
  it('con US$ 2,95 gastados el plan CORTA en campaña y NO corta en construcción (solo registra que pasó del tope)', () => {
    const campana = descubrir({ ...base, gastado_hoy_usd: 2.95, tope_usd: 1, tope_corta_usd: topeQueCortaUsd('campana', 3) })
    const constr = descubrir({ ...base, gastado_hoy_usd: 2.95, tope_usd: 3, tope_corta_usd: topeQueCortaUsd('construccion', 3) })
    expect(campana.hacer.length).toBe(0); expect(campana.el_tope_corta).toBe(true)
    expect(constr.hacer.length).toBeGreaterThan(0); expect(constr.omitidas.filter((o) => /tope del día/.test(o.por_que))).toEqual([])
    expect(constr.el_tope_corta).toBe(false); expect(constr.pasa_del_tope_de_referencia).toBe(true); expect(constr.tope_usd).toBe(3)
  })
  it('al pasar el 90 % del plan: UN aviso que dice que el raspado sigue; el cuerpo no se toca', async () => {
    const avisos: string[] = []
    const r = await revisarPlanApify({ leer: async () => ({ ok: true, uso: U(27) }), env: {}, frena: false, avisar: async (t) => { avisos.push(t); return { ok: true, detalle: 'ok' } } })
    expect(r.leido && r.decision.permitido).toBe(false)
    expect(avisos).toHaveLength(1); expect(avisos[0]).toMatch(/SIGUE/)
    const cuerpo = { plan: { hacer: [{ fuente: 'sitio' }], omitidas: [] } }
    expect(frenarCuerpoPorPlan(cuerpo, decidirPlanApify(U(27), 90)).plan).not.toEqual(cuerpo.plan)
  })
  it('crédito agotado: el aviso dice qué hacer', () => {
    expect(lineaDePlanApify(decidirPlanApify(U(29), 90), U(29), true)).toMatch(/sube el plan/)
  })
})
