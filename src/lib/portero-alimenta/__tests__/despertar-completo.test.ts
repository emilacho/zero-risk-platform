/**
 * El despertar COMPLETA lo que el alta no trajo (15-oct · firma de Emilio) y la corrida diaria toma al cliente desde el despertar. US$ 0 · base falsa · sin Apify ni modelo.
 * Cubre: el despertar deja «completando» y NO está listo; la cadena que lo cierra lo deja listo; una fuente que no llegó se declara como hueco; la espera vencida no bloquea para siempre;
 * despertar dos veces ni estira la espera ni vuelve a pedir; el alta que ya trajo todo (0 pedidos); 3 rubros (tuteo y voseo), sin web, sin Mapas, sin Instagram; y quién es «cliente activo».
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { clientesActivos } from '../clientes'
import { rutaDespertar } from '../despertar'
import { ESPERA_MAXIMA_DEL_DESPERTAR_MIN, rutaListo } from '../listo'
import { rutaDescubrir } from '../rutas'
import { AHORA, CASOS, ON, REAL, montar, tablas } from './fixtures-despertar'

type T = Record<string, Array<Record<string, unknown>>>
type Falta = Array<{ funcion: string; objetivo: string }>
const min = (n: number) => new Date(AHORA.getTime() + n * 60_000)

/** simula la cadena del portero: pide lo que falta (filas nuevas en apify_raw) y la corrida «alimentar» reemplaza la fila del despertar */
async function correrLaCadena(t: T, clientId: string, falta: Falta, cuando: Date, opciones: { omitir?: string[] } = {}) {
  for (const a of falta) {
    if (opciones.omitir?.includes(a.funcion)) continue
    t.apify_raw.push({ id: `cad-${a.funcion}-${t.apify_raw.length}`, client_id: clientId, apify_function: a.funcion, ensayo: false, created_at: cuando.toISOString(), params: {}, metadata: { llamado_por: 'ogfq56oIEoHufFPM' }, respuesta: [] })
  }
  const m = montar(t, { ahora: cuando })
  return alimentarCliente({ db: m.base.db, client_id: clientId, dry_run: false, interruptores: ON, ahora: cuando, gasto_de_hoy_usd: 0, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'ex-cadena-1' })
}
type Senal = { status: number; listo: boolean; completando: boolean; huecos: Array<{ funcion: string }>; motivo: string; origen: string | null }
const listo = async (t: T, clientId: string, ahora: Date): Promise<Senal> => {
  const m = montar(t, { ahora })
  const r = await rutaListo(m.deps, { client_id: clientId })
  return { status: r.status, ...(r.body as object) } as Senal
}
const faltaDe = (r: { body: Record<string, unknown> }) => r.body.por_pedir_en_la_corrida_diaria as Falta

describe('el despertar deja «completando»: no está listo hasta que la cadena pide lo que falta', () => {
  for (const c of CASOS) {
    it(`${c.nombre} (${c.pais} · ${c.voz}): despierta → completando; cadena termina → listo sin huecos`, async () => {
      const t = tablas(c)
      const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
      expect(r.body).toMatchObject({ ok: true, cerebro_listo: false, pedir_ahora: true, apify_llamado: false })
      const falta = faltaDe(r)
      const dsp = (t.cerebro_portero_corridas[0].resumen as { despertar: { completando: { desde: string; falta: unknown[] } } }).despertar
      expect(dsp.completando.desde).toBe(AHORA.toISOString())
      expect(dsp.completando.falta).toHaveLength(falta.length)

      const antes = await listo(t, c.id, min(10))
      expect(antes).toMatchObject({ status: 200, listo: false, completando: true })
      expect(antes.motivo).toMatch(/espera lo que el alta no trajo/)

      await correrLaCadena(t, c.id, falta, min(20))
      const despues = await listo(t, c.id, min(21))
      expect(despues).toMatchObject({ listo: true, completando: false, origen: 'despertar' })
      expect(despues.huecos).toEqual([])
      expect((t.cerebro_portero_corridas[0].resumen as { despertar: { completado_en?: string } }).despertar.completado_en).toBeTruthy()
    })
  }

  it('una fuente que no llegó se DECLARA como hueco y el cerebro queda listo igual (no bloquea)', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    const falta = faltaDe(r)
    expect(falta.length).toBeGreaterThan(0)
    const caida = falta[0].funcion
    await correrLaCadena(t, c.id, falta, min(15), { omitir: [caida] })
    const s = await listo(t, c.id, min(16))
    expect(s.listo).toBe(true)
    expect(s.huecos.map((h) => h.funcion)).toEqual([caida])
    expect(s.motivo).toMatch(/hueco/)
  })

  it('la cadena que nunca corrió: pasada la espera máxima se da por listo CON hueco (no bloquea para siempre)', async () => {
    const c = CASOS[1]
    const t = tablas(c)
    await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    const dentro = await listo(t, c.id, min(ESPERA_MAXIMA_DEL_DESPERTAR_MIN - 1))
    expect(dentro).toMatchObject({ listo: false, completando: true })
    const vencida = await listo(t, c.id, min(ESPERA_MAXIMA_DEL_DESPERTAR_MIN + 1))
    expect(vencida.listo).toBe(true)
    expect(vencida.huecos.length).toBeGreaterThan(0)
    expect(vencida.motivo).toMatch(/no terminó/)
  })

  it('espera vencida con el alta que ya trajo todo (0 pedidos): igual declara que la cadena no terminó', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const plan = await rutaDescubrir({ db: montar(t).base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    for (const a of (plan.body.plan as { hacer: Array<{ funcion: string; params: unknown }> }).hacer) t.apify_raw.push({ id: `t-${t.apify_raw.length}`, client_id: c.id, apify_function: a.funcion, ensayo: false, created_at: new Date(AHORA.getTime() - 60_000).toISOString(), params: a.params, metadata: {}, respuesta: [] })
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(faltaDe(r)).toEqual([])
    const s = await listo(t, c.id, min(ESPERA_MAXIMA_DEL_DESPERTAR_MIN + 5))
    expect(s.listo).toBe(true)
    expect(s.huecos.map((h) => h.funcion)).toEqual(['cadena_del_despertar'])
  })

  it('un raspado ANTERIOR al despertar o un ensayo de la misma función NO cuentan como llegado: sigue siendo hueco', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    const falta = faltaDe(r)
    const f = falta[0].funcion
    t.apify_raw.push({ id: 'viejo', client_id: c.id, apify_function: f, ensayo: false, created_at: new Date(AHORA.getTime() - 3_600_000).toISOString(), params: {}, metadata: {}, respuesta: [] })
    t.apify_raw.push({ id: 'ensayo', client_id: c.id, apify_function: f, ensayo: true, created_at: min(5).toISOString(), params: {}, metadata: {}, respuesta: [] })
    await correrLaCadena(t, c.id, falta, min(10), { omitir: [f] })
    const s = await listo(t, c.id, min(11))
    expect(s.listo).toBe(true)
    expect(s.huecos.map((h) => h.funcion)).toContain(f)
  })

  it('si no se puede leer lo que llegó, se DICE (502): ni «listo» ni «con huecos» a ciegas', async () => {
    const c = CASOS[1]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    await correrLaCadena(t, c.id, faltaDe(r), min(10))
    const m = montar(t, { ahora: min(11), fallaEn: 'apify_raw' })
    const x = await rutaListo(m.deps, { client_id: c.id })
    expect(x.status).toBe(502)
  })

  it('un problema del vigilante NO se disfraza de hueco: no pide y no queda listo', async () => {
    const c = CASOS[2]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t, { puenteFalla: true }).deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ cerebro_listo: false, pedir_ahora: false })
    expect((await listo(t, c.id, min(60))).listo).toBe(false)
  })
})

describe('idempotencia: despertar dos veces no estira la espera ni vuelve a pagar', () => {
  it('la segunda llamada conserva el mismo `desde` y la misma lista; no escribe fichas nuevas', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const a = await rutaDespertar(montar(t, { ahora: AHORA }).deps, { client_id: c.id, ...REAL })
    const fichas1 = t.cerebro_fichas.length
    const b = await rutaDespertar(montar(t, { ahora: min(7) }).deps, { client_id: c.id, ...REAL, workflow_execution_id: 'ex-alta-2' })
    expect(t.cerebro_fichas.length).toBe(fichas1)
    const d = (t.cerebro_portero_corridas[0].resumen as { despertar: { completando: { desde: string } } }).despertar
    expect(d.completando.desde).toBe(AHORA.toISOString())
    expect(faltaDe(b)).toEqual(faltaDe(a))
    expect(t.cerebro_portero_corridas).toHaveLength(1)
  })

  it('con la cadena ya cerrada, un despertar tardío no reabre nada: «ya corrió» y sin pedir', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    await correrLaCadena(t, c.id, faltaDe(r), min(20))
    const otra = await rutaDespertar(montar(t, { ahora: min(30) }).deps, { client_id: c.id, ...REAL, workflow_execution_id: 'ex-alta-3' })
    expect(otra.body).toMatchObject({ estado: 'ya_corrio_hoy', cerebro_listo: null })
    expect(otra.body.pedir_ahora).toBeUndefined()
  })

  it('lo que la cadena ya pidió (misma función, todos sus objetivos) no vuelve a salir como «por pedir»', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(faltaDe(r).length).toBeGreaterThan(0)
    const plan = await rutaDescubrir({ db: montar(t).base.db, interruptores: ON, ahora: min(5) }, { client_id: c.id, dry_run: true })
    for (const a of (plan.body.plan as { hacer: Array<{ funcion: string; params: unknown }> }).hacer) t.apify_raw.push({ id: `p-${t.apify_raw.length}`, client_id: c.id, apify_function: a.funcion, ensayo: false, created_at: min(5).toISOString(), params: a.params, metadata: {}, respuesta: [] })
    const otra = await rutaDescubrir({ db: montar(t).base.db, interruptores: ON, ahora: min(6) }, { client_id: c.id, dry_run: true })
    expect((otra.body.plan as { hacer: unknown[] }).hacer).toHaveLength(0)
  })
})

describe('bordes del alta: sin web · sin Mapas · sin Instagram · ya trajo todo · tope', () => {
  const sin = (t: T, clientId: string, funcion: string) => { t.apify_raw = t.apify_raw.filter((f) => !(f.client_id === clientId && f.apify_function === funcion)) }

  it('sin web: despierta, pide lo demás y queda listo tras la cadena', async () => {
    const c = CASOS[0]
    const t = tablas(c, { sinWeb: true })
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ ok: true, pedir_ahora: true, cerebro_listo: false })
    await correrLaCadena(t, c.id, faltaDe(r), min(10))
    expect((await listo(t, c.id, min(11))).listo).toBe(true)
  })
  it('sin Mapas: el alta no trajo la ficha; el despertar sigue y la cadena decide', async () => {
    const c = CASOS[1]
    const t = tablas(c)
    sin(t, c.id, 'own_google_maps_profile')
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ ok: true, pedir_ahora: true })
    await correrLaCadena(t, c.id, faltaDe(r), min(10))
    expect((await listo(t, c.id, min(11))).listo).toBe(true)
  })
  it('sin Instagram: ídem; no inventa cuentas ni pide videos', async () => {
    const c = CASOS[2]
    const t = tablas(c)
    sin(t, c.id, 'instagram_scraper')
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ ok: true, pedir_ahora: true })
    expect(faltaDe(r).every((a) => a.funcion !== 'videos_instagram')).toBe(true)
  })
  it('el alta que ya trajo todo: 0 pedidos; pasa por la cadena (que no hace nada) y sale listo sin huecos', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const plan = await rutaDescubrir({ db: montar(t).base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    for (const a of (plan.body.plan as { hacer: Array<{ funcion: string; params: unknown }> }).hacer) t.apify_raw.push({ id: `t-${t.apify_raw.length}`, client_id: c.id, apify_function: a.funcion, ensayo: false, created_at: new Date(AHORA.getTime() - 60_000).toISOString(), params: a.params, metadata: {}, respuesta: [] })
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(faltaDe(r)).toEqual([])
    expect(r.body.pedir_ahora).toBe(true)
    await correrLaCadena(t, c.id, [], min(3))
    expect(await listo(t, c.id, min(4))).toMatchObject({ listo: true, huecos: [] })
  })
  it('un tope alcanzado se declara: lo no pedido sale como hueco', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    const falta = faltaDe(r)
    await correrLaCadena(t, c.id, falta, min(10), { omitir: falta.slice(1).map((a) => a.funcion) })
    const s = await listo(t, c.id, min(11))
    expect(s.listo).toBe(true)
    // llegó solo la función de la primera acción: huecos = las acciones de otra función (el cruce es por función)
    expect(s.huecos.length).toBe(falta.filter((a) => a.funcion !== falta[0].funcion).length)
    expect(s.huecos.length).toBeGreaterThan(0)
  })
  it('en seco el despertar no escribe «completando» ni pide nada', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL, dry_run: true })
    expect(r.body).toMatchObject({ dry_run: true, cerebro_listo: null })
    expect(r.body.pedir_ahora).toBeUndefined()
    expect(t.cerebro_portero_corridas).toHaveLength(0)
  })
})

describe('la corrida diaria toma al cliente desde el despertar (aunque aún no tenga plan)', () => {
  const sinPlan = (c: (typeof CASOS)[number]) => { const t = tablas(c); t.client_historical_outputs = []; return t }
  const activos = async (t: T) => {
    const r = await clientesActivos(montar(t).base.db as never)
    if (!r.ok) throw new Error(r.detalle)
    return r.datos
  }

  it('sin plan y SIN despertar → excluido (como antes)', async () => {
    const d = await activos(sinPlan(CASOS[0]))
    expect(d.clientes).toHaveLength(0)
    expect(d.excluidos[0].motivos).toContain('sin plan de 90 días')
  })
  it('sin plan y CON despertar hecho → activo', async () => {
    const c = CASOS[0]
    const t = sinPlan(c)
    await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect((await activos(t)).clientes.map((x) => x.client_id)).toEqual([c.id])
  })
  it('el despertar arrastrado a la corrida diaria (fila reemplazada) sigue contando', async () => {
    const c = CASOS[1]
    const t = sinPlan(c)
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    await correrLaCadena(t, c.id, faltaDe(r), min(10))
    expect((t.cerebro_portero_corridas[0].resumen as { tipo?: string }).tipo).toBeUndefined()
    expect((await activos(t)).clientes).toHaveLength(1)
  })
  it('despertar con errores, prueba, archivado o dado de baja → NO entra', async () => {
    const c = CASOS[2]
    const conErrores = sinPlan(c)
    conErrores.cerebro_portero_corridas = [{ id: 'r1', client_id: c.id, dia: '2026-10-15', estado: 'con_errores', resumen: { tipo: 'despertar' } }]
    expect((await activos(conErrores)).clientes).toHaveLength(0)
    const cambios: Array<[string, Record<string, unknown>]> = [['archivado', { archived_at: '2026-10-01' }], ['baja', { status: 'churned' }], ['prueba', { config: { es_de_prueba: true } }]]
    for (const [nombre, cambio] of cambios) {
      const t = sinPlan(c)
      t.cerebro_portero_corridas = [{ id: 'r2', client_id: c.id, dia: '2026-10-15', estado: 'hecha', resumen: { tipo: 'despertar' } }]
      Object.assign(t.clients[0], cambio)
      expect((await activos(t)).clientes, nombre).toHaveLength(0)
    }
  })
  it('sin manual de marca no entra aunque haya despertado', async () => {
    const c = CASOS[0]
    const t = sinPlan(c)
    t.cerebro_portero_corridas = [{ id: 'r3', client_id: c.id, dia: '2026-10-15', estado: 'hecha', resumen: { tipo: 'despertar' } }]
    t.client_brand_books = []
    expect((await activos(t)).excluidos[0].motivos).toContain('sin manual de marca')
  })
  it('una falla al leer el rastro se DICE (no se lee como «sin despertar»)', async () => {
    const c = CASOS[0]
    const m = montar(sinPlan(c), { fallaEn: 'cerebro_portero_corridas' })
    const r = await clientesActivos(m.base.db as never)
    expect(r.ok).toBe(false)
  })
})
