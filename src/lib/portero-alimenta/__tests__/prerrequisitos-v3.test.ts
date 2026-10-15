/**
 * Prerrequisitos del plan v3 (15-oct): (1) el vigilante y el tope cuentan SOLO el gasto del portero, (2) la señal «cerebro listo», (3) las cifras como fichas con atributo.
 * US$ 0 · base falsa · sin Apify ni modelo. ≥ 3 rubros; cliente sin Mapas y sin Instagram.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { gastoDeHoy } from '../rutas'
import { rutaVigilar, type DepsDelVigilante } from '../vigilante'
import { rutaListo, FRESCURA_DEL_LISTO_HORAS } from '../listo'
import { llamadaDelPortero, invocacionDelPortero, soloLoDelPortero, FLUJO_DEL_PORTERO } from '../gasto'
import { unidadesDeRaspados } from '../unidades'
import type { Interruptores } from '../datos'
import { crearBaseFalsa } from './base-falsa'
import { POST as listoPOST, GET as listoGET } from '../../../app/api/brain/alimentar/listo/route'

const ON: Interruptores = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const C = '77777777-7777-4777-8777-777777777777'
const WF = FLUJO_DEL_PORTERO
const AHORA = new Date('2026-10-15T13:00:00Z')
const REAL = { dry_run: false, workflow_id: WF, workflow_execution_id: 'ex-1' }
const CIERRE = { fin: 'hecho', clientes: [{ cliente: C, errores: [], puente: { quedan: 0, vueltas: 0, falla: null }, alimentar: 'hecha', plan_fallo: null }] }

// ───────────────────────── 1 · solo el gasto del portero
/** una llamada de Apify: el crudo a la hora `t`, la fila del libro 60 s después (como el Servicio real) */
function llamada(fn: string, t: string, usd: number, llamadoPor?: string, cliente = C) {
  const tt = Date.parse(t)
  return {
    raw: { id: `r-${fn}-${t}`, client_id: cliente, apify_function: fn, ensayo: false, created_at: t, metadata: llamadoPor === undefined ? {} : { llamado_por: llamadoPor } },
    cost: { service: `apify:${fn}`, amount_usd: usd, created_at: new Date(tt + 60_000).toISOString(), description: JSON.stringify({ es: 'detalle_de_llamada', client_id: cliente, funcion: fn, ensayo: false }) },
  }
}
function mundo(llamadas: Array<ReturnType<typeof llamada>>, invocaciones: Array<Record<string, unknown>> = []) {
  return {
    clients: [{ id: C, name: 'Cliente Zeta', status: 'active', archived_at: null, config: {} }],
    client_brand_books: [{ id: 'mb', client_id: C }],
    client_historical_outputs: [{ id: 'pl', client_id: C, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    cerebro_portero_corridas: [{ id: 'r1', client_id: C, dia: '2026-10-15', estado: 'hecha', resumen: { escrituras: { fichas: 0 } }, creado_en: '2026-10-15T12:35:00Z' }],
    cerebro_fichas: [], client_brain_chunks: [], cerebro_unidades_vistas: [],
    costs: llamadas.map((l) => l.cost), apify_raw: llamadas.map((l) => l.raw), agent_invocations: invocaciones,
  } as Record<string, Array<Record<string, unknown>>>
}
function vigilar(t: Record<string, Array<Record<string, unknown>>>) {
  const base = crearBaseFalsa(t as never)
  const apagados: string[] = [], avisos: string[] = []
  const deps: DepsDelVigilante = {
    db: base.db, interruptores: ON, ahora: AHORA, esperar: async () => {},
    apagar: async (w) => { apagados.push(w); return { ok: true, detalle: 'flujo desactivado' } },
    avisar: async (x) => { avisos.push(x); return { ok: true, detalle: 'entregado' } },
  }
  return { base, deps, apagados, avisos }
}
const PLAN = (n: number, desde = '2026-10-15T09:00:00Z') => Array.from({ length: n }, (_, i) => llamada('website_content_scraper', new Date(Date.parse(desde) + i * 120_000).toISOString(), 0.6, 'plan-v3-sala'))
const PORTERO = (usd: number, desde = '2026-10-15T12:30:00Z') => [llamada('website_content_scraper', desde, usd, `${WF}`)]

describe('1 · el vigilante y el tope cuentan SOLO lo del portero', () => {
  it('plan de 2,4 + portero de 0,4 el mismo día ⇒ NO apaga (en los dos órdenes)', async () => {
    for (const orden of ['plan_primero', 'portero_primero'] as const) {
      const ls = orden === 'plan_primero' ? [...PLAN(4), ...PORTERO(0.4)] : [...PORTERO(0.4, '2026-10-15T07:00:00Z'), ...PLAN(4, '2026-10-15T09:00:00Z')]
      const v = vigilar(mundo(ls))
      const r = await rutaVigilar(v.deps, { ...REAL, cierre: CIERRE })
      expect(r.body.ok, orden).toBe(true)
      expect(v.apagados, orden).toEqual([]); expect(v.avisos, orden).toEqual([])
      const g = (r.body.clientes as Array<{ gasto_usd: number }>)[0].gasto_usd
      expect(g, orden).toBeCloseTo(0.4, 4)
    }
  })
  it('portero de 1,2 (con o sin plan al lado, en los dos órdenes) ⇒ apaga y avisa', async () => {
    for (const ls of [[...PLAN(4), ...PORTERO(1.2)], [...PORTERO(1.2, '2026-10-15T07:00:00Z'), ...PLAN(4)], PORTERO(1.2)]) {
      const v = vigilar(mundo(ls))
      const r = await rutaVigilar(v.deps, { ...REAL, cierre: CIERRE })
      expect(r.body.ok).toBe(false)
      expect(v.apagados).toEqual([WF])
      expect(v.avisos[0]).toMatch(/gasto del día US\$ 1\.20 > 1\.00/)
    }
  })
  it('gastoDeHoy dice cuánto fue de OTROS (plan) y cuántas llamadas no tenían origen', async () => {
    const base = crearBaseFalsa(mundo([...PLAN(4), ...PORTERO(0.4)]) as never)
    const g = await gastoDeHoy(base.db, C, AHORA)
    expect(g.ok).toBe(true)
    if (g.ok) { expect(g.gasto.apify_usd).toBeCloseTo(0.4, 4); expect(g.fuera_del_portero_usd).toBeCloseTo(2.4, 4); expect(g.llamadas_sin_origen).toBe(0) }
  })
  it('SIN pareja en el crudo (filas viejas o sin crudo) CUENTA como del portero: no se subestima', async () => {
    const t = mundo([...PORTERO(0.4)])
    t.costs.push({ service: 'apify:instagram_scraper', amount_usd: 0.9, created_at: '2026-10-15T10:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C, funcion: 'instagram_scraper', ensayo: false }) })
    const base = crearBaseFalsa(t as never)
    const g = await gastoDeHoy(base.db, C, AHORA)
    if (g.ok) { expect(g.gasto.apify_usd).toBeCloseTo(1.3, 4); expect(g.llamadas_sin_origen).toBe(1) }
    const v = vigilar(t)
    expect((await rutaVigilar(v.deps, { ...REAL, cierre: CIERRE })).body.ok).toBe(false)
  })
  it('un crudo SIN `llamado_por` no explica nada: cuenta como del portero', async () => {
    const v = vigilar(mundo([llamada('own_google_maps_profile', '2026-10-15T12:30:00Z', 1.3, undefined)]))
    expect((await rutaVigilar(v.deps, { ...REAL, cierre: CIERRE })).body.ok).toBe(false)
  })
  it('las llamadas del portero se reconocen por su flujo, sus tandas, artículos y mediciones; las de otros no', () => {
    for (const x of [WF, `${WF}#tanda2`, `${WF}#articulo`, 'paso-6-medir-portero', 'portero-alimentar']) expect(llamadaDelPortero(x), x).toBe(true)
    for (const x of ['plan-v3-sala', 'LyVoKcrypS5uLyuu', 'EZXAFQvKZsJlvGNO', '', null, undefined]) expect(llamadaDelPortero(x), String(x)).toBe(false)
  })
  it('el modelo: cuenta el agente del portero o lo registrado desde su flujo; no el etiquetador ni otros agentes', async () => {
    expect(invocacionDelPortero({ agent_name: 'portero-del-cerebro', workflow_id: 'LyVoKcrypS5uLyuu' })).toBe(true)
    expect(invocacionDelPortero({ agent_name: 'otro', workflow_id: WF })).toBe(true)
    expect(invocacionDelPortero({ agent_name: 'etiquetador-del-cerebro', workflow_id: 'EZXAFQvKZsJlvGNO' })).toBe(false)
    const t = mundo([], [
      { client_id: C, created_at: '2026-10-15T12:31:00Z', cost_usd: 0.4, agent_name: 'portero-del-cerebro', workflow_id: WF },
      { client_id: C, created_at: '2026-10-15T10:31:00Z', cost_usd: 0.9, agent_name: 'etiquetador-del-cerebro', workflow_id: 'EZXAFQvKZsJlvGNO' },
    ])
    const g = await gastoDeHoy(crearBaseFalsa(t as never).db, C, AHORA)
    if (g.ok) { expect(g.gasto.modelo_usd).toBeCloseTo(0.4, 4); expect(g.fuera_del_portero_usd).toBeCloseTo(0.9, 4) }
  })
  it('dos llamadas de la MISMA función pegadas (plan y portero): cada una va con su crudo, en orden', () => {
    const a = llamada('google_serp_scraper', '2026-10-15T12:30:00Z', 0.3, 'plan-v3-sala')
    const b = llamada('google_serp_scraper', '2026-10-15T12:30:20Z', 0.2, WF)
    const r = soloLoDelPortero([a.cost, b.cost] as never, [a.raw, b.raw] as never, C)
    expect(r.fuera_del_portero).toHaveLength(1)
    expect(Number(r.fuera_del_portero[0].amount_usd)).toBe(0.3)
    expect(r.libro).toHaveLength(1)
  })
  it('las filas de OTROS clientes pasan sin tocar y las de ensayo no entran', () => {
    const o = llamada('website_content_scraper', '2026-10-15T12:30:00Z', 0.5, 'plan-v3-sala', '99999999-9999-4999-8999-999999999999')
    const r = soloLoDelPortero([o.cost] as never, [o.raw] as never, C)
    expect(r.libro).toHaveLength(1); expect(r.fuera_del_portero).toEqual([]); expect(r.sin_origen).toBe(0)
  })
})

// ───────────────────────── 2 · la señal «cerebro listo»
const fila = (o: Record<string, unknown>) => ({ id: 'x', client_id: C, dia: '2026-10-15', estado: 'hecha', resumen: { unidades: 20, escrituras: { fichas: 3 } }, creado_en: '2026-10-15T12:35:00Z', ...o })
function listoDeps(corridas: Array<Record<string, unknown>>, extra: Record<string, Array<Record<string, unknown>>> = {}, o: { fallaEn?: string } = {}) {
  const base = crearBaseFalsa({ clients: [{ id: C, name: 'X' }], cerebro_portero_corridas: corridas, cerebro_fichas: [], client_brain_chunks: [], ...extra } as never, { fallaEn: o.fallaEn })
  return { db: base.db, interruptores: ON, ahora: AHORA }
}
describe('2 · la señal «cerebro listo» (una lectura por client_id)', () => {
  it('corrida diaria hecha hoy + puente al día ⇒ listo, con motivo, desde y origen', async () => {
    const r = await rutaListo(listoDeps([fila({})]), { client_id: C })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ client_id: C, listo: true, origen: 'corrida_diaria', puente_quedan: 0, frescura_horas: FRESCURA_DEL_LISTO_HORAS, desde: '2026-10-15T12:35:00.000Z' })
    expect(r.body.motivo).toMatch(/corrida diaria hecha hace/)
  })
  it('despertar del alta terminado ⇒ listo con origen «despertar» (cliente recién dado de alta)', async () => {
    const r = await rutaListo(listoDeps([fila({ resumen: { tipo: 'despertar', unidades: 106, vigilante: { ok: true, revisado_en: '2026-10-15T12:50:00Z' } } })]), { client_id: C })
    expect(r.body).toMatchObject({ listo: true, origen: 'despertar', desde: '2026-10-15T12:50:00.000Z' })
    expect(r.body.motivo).toMatch(/despertar del alta terminado/)
  })
  it('un cliente ya dado de alta, con corrida de ayer (hace 25 h) ⇒ listo (no exige despertar)', async () => {
    const r = await rutaListo(listoDeps([fila({ dia: '2026-10-14', creado_en: '2026-10-14T12:00:00Z' })]), { client_id: C })
    expect(r.body.listo).toBe(true)
  })
  it('la corrida hecha es vieja (> 36 h) ⇒ NO listo, y lo dice', async () => {
    const r = await rutaListo(listoDeps([fila({ dia: '2026-10-13', creado_en: '2026-10-13T12:00:00Z' })]), { client_id: C })
    expect(r.body).toMatchObject({ listo: false, desde: null })
    expect(r.body.motivo).toMatch(/hace 49 h/)
  })
  it('la última corrida quedó con errores ⇒ NO listo (aunque la anterior estuviera hecha)', async () => {
    const r = await rutaListo(listoDeps([fila({ estado: 'con_errores' }), fila({ id: 'y', dia: '2026-10-14', creado_en: '2026-10-14T12:00:00Z' })]), { client_id: C })
    expect(r.body.listo).toBe(false)
    expect(r.body.motivo).toMatch(/con_errores/)
  })
  it('el vigilante dejó un problema ⇒ NO listo', async () => {
    const r = await rutaListo(listoDeps([fila({ resumen: { unidades: 20, vigilante: { ok: false, problemas: ['x'], revisado_en: '2026-10-15T12:40:00Z' } } })]), { client_id: C })
    expect(r.body.listo).toBe(false)
    expect(r.body.motivo).toMatch(/vigilante/)
  })
  it('el puente tiene trozos por escribir ⇒ NO listo, con la cifra', async () => {
    const f = { id: 'f1', client_id: C, ref: 'portero:sitio:1', clase: 'texto', titulo: 't', contenido: 'texto de la ficha', fecha_fuente: null, observado_en: '2026-10-15T09:00:00Z', creado_en: '2026-10-15T09:00:00Z', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null, huella: 'h1' }
    const r = await rutaListo(listoDeps([fila({})], { cerebro_fichas: [f] }), { client_id: C })
    expect(r.body).toMatchObject({ listo: false, puente_quedan: 1 })
  })
  it('despertar de un alta que no raspó nada ⇒ NO listo', async () => {
    const r = await rutaListo(listoDeps([fila({ resumen: { tipo: 'despertar', unidades: 0 } })]), { client_id: C })
    expect(r.body.listo).toBe(false)
  })
  it('sin ninguna corrida ⇒ NO listo («todavía no ha corrido»)', async () => {
    const r = await rutaListo(listoDeps([]), { client_id: C })
    expect(r.body).toMatchObject({ listo: false, ultima_corrida: null })
  })
  it('lectura que falla ⇒ 502 (nunca un «no listo» ni un «listo» en silencio); cliente inexistente 404; client_id inválido 400', async () => {
    expect((await rutaListo(listoDeps([fila({})], {}, { fallaEn: 'cerebro_portero_corridas' }), { client_id: C })).status).toBe(502)
    expect((await rutaListo(listoDeps([fila({})], {}, { fallaEn: 'client_brain_chunks' }), { client_id: C })).status).toBe(502)
    expect((await rutaListo({ ...listoDeps([]), db: crearBaseFalsa({ clients: [], cerebro_portero_corridas: [] } as never).db }, { client_id: C })).status).toBe(404)
    expect((await rutaListo(listoDeps([]), { client_id: 'no' })).status).toBe(400)
  })
  it('la ruta exige la llave interna (GET y POST)', async () => {
    expect((await listoGET(new Request(`http://x/api/brain/alimentar/listo?client_id=${C}`))).status).toBe(401)
    expect((await listoPOST(new Request('http://x/api/brain/alimentar/listo', { method: 'POST', body: '{}' }))).status).toBe(401)
  })
  it('sin la llave de despacho', () => {
    expect(fs.readFileSync(path.resolve(__dirname, '../listo.ts'), 'utf8')).not.toMatch(/SALA_DISPATCH_KEY/)
  })
})

// ───────────────────────── 3 · las cifras como fichas con atributo
interface Caso { id: string; nombre: string; rubro: string; ciudad: string; web: string; ig: string }
const CASOS: Caso[] = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Clínica Sonrisa Norte', rubro: 'clínica dental y ortodoncia', ciudad: 'Quito', web: 'https://sonrisanorte.example', ig: 'sonrisanorte' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'Taller Mecánico El Pistón', rubro: 'taller mecánico y lubricadora', ciudad: 'Rosario', web: 'https://elpiston.example', ig: 'elpiston.ok' },
  { id: '33333333-3333-4333-8333-333333333333', nombre: 'Flujo CRM', rubro: 'software CRM para pymes', ciudad: 'Ciudad de México', web: 'https://flujocrm.example', ig: 'flujocrm' },
]
const T1 = '2026-10-15T08:00:00Z', T2 = '2026-10-16T08:00:00Z', T3 = '2026-10-17T08:00:00Z'
function cifras(c: Caso, o: { puntaje?: number; resenas?: number; seguidores?: number; posts?: number; conMapas?: boolean; conIg?: boolean; t: string; id: string }) {
  const f: Array<Record<string, unknown>> = []
  if (o.conMapas !== false) f.push({ id: `${c.id}-m-${o.id}`, client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: o.t, params: {}, respuesta: [{ title: c.nombre, url: `https://www.google.com/maps/place/${c.ig}`, address: `Av. Principal 123, ${c.ciudad}`, totalScore: o.puntaje, reviewsCount: o.resenas }] })
  if (o.conIg !== false) f.push({ id: `${c.id}-i-${o.id}`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: o.t, params: {}, respuesta: [{ username: c.ig, biography: `Somos ${c.nombre}`, followersCount: o.seguidores, postsCount: o.posts, latestPosts: [] }] })
  return f
}
const clienteTablas = (c: Caso, raw: Array<Record<string, unknown>>) => ({
  clients: [{ id: c.id, name: c.nombre, website_url: c.web, industry: c.rubro, country: 'Ecuador', config: { apify: { own_handles: { instagram: c.ig } } } }],
  client_sedes: [{ client_id: c.id, ciudad: c.ciudad, clave: c.ciudad.toLowerCase() }],
  apify_raw: raw, cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [],
}) as Record<string, Array<Record<string, unknown>>>
async function corrida(c: Caso, t: Record<string, Array<Record<string, unknown>>>, cuando: string, modelo: { n: number } = { n: 0 }) {
  const base = crearBaseFalsa(t as never, { reloj: () => cuando })
  const r = await alimentarCliente({ db: base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: new Date(cuando), llamarModelo: async () => { modelo.n++; return { texto: '{"decisiones":[]}', costo_usd: 0.01, tokens_entrada: 1, tokens_salida: 1 } }, workflow_id: WF, workflow_execution_id: `ex-${cuando}`, forzar: true })
  return { r, base }
}
const vivas = (t: Record<string, Array<Record<string, unknown>>>, atributo: string) => t.cerebro_fichas.filter((f) => f.atributo === atributo && !f.retirada_en)
const todas = (t: Record<string, Array<Record<string, unknown>>>, atributo: string) => t.cerebro_fichas.filter((f) => f.atributo === atributo)

describe('3 · cifras como fichas con atributo (la nueva reemplaza; la vieja queda con fecha)', () => {
  for (const c of CASOS) {
    it(`${c.nombre}: puntaje, reseñas, seguidores y publicaciones → fichas con atributo, valor, observado_en y fuente_url`, async () => {
      const t = clienteTablas(c, cifras(c, { puntaje: 4.8, resenas: 26, seguidores: 1236, posts: 19, t: T1, id: 'a' }))
      const { r } = await corrida(c, t, '2026-10-15T09:00:00Z')
      expect(r.estado).toBe('hecha')
      const esperadas: Record<string, number> = { 'metrica:mapas:puntaje': 4.8, 'metrica:mapas:resenas': 26, 'metrica:instagram:seguidores': 1236, 'metrica:instagram:publicaciones': 19 }
      for (const [atributo, valor] of Object.entries(esperadas)) {
        const [f] = vivas(t, atributo)
        expect(f, atributo).toBeDefined()
        expect(f.observado_en).toBe(T1)
        expect(f.fuente_url).toMatch(/^https:\/\//)
        expect((f.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(valor)
        expect(f.propiedad).toBe('propia')
        expect(f.decision).toBe('suma')
      }
    })
  }
  it('el valor cambia (reseñas 26 → 50): la ficha nueva REEMPLAZA y la vieja queda archivada con fecha; sin modelo', async () => {
    const c = CASOS[0]
    const modelo = { n: 0 }
    const t = clienteTablas(c, cifras(c, { puntaje: 4.8, resenas: 26, seguidores: 1236, posts: 19, t: T1, id: 'a' }))
    await corrida(c, t, '2026-10-15T09:00:00Z', modelo)
    t.apify_raw.push(...cifras(c, { puntaje: 4.8, resenas: 50, seguidores: 1236, posts: 19, t: T2, id: 'b' }))
    await corrida(c, t, '2026-10-16T09:00:00Z', modelo)
    const todasLasDeReseñas = todas(t, 'metrica:mapas:resenas')
    expect(todasLasDeReseñas).toHaveLength(2) // nada se borra
    const [viva] = vivas(t, 'metrica:mapas:resenas')
    expect((viva.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(50)
    expect(viva.decision).toBe('reemplaza')
    const vieja = todasLasDeReseñas.find((f) => f.retirada_en)!
    expect((vieja.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(26)
    expect(String(vieja.motivo_retirada)).toMatch(/reemplazada por/)
    expect(vieja.observado_en).toBe(T1)
    expect(modelo.n).toBe(0) // las cifras se reemplazan por código
    // lo que no cambió (puntaje, seguidores) NO genera ficha nueva
    expect(todas(t, 'metrica:mapas:puntaje')).toHaveLength(1)
    expect(todas(t, 'metrica:instagram:seguidores')).toHaveLength(1)
  })
  it('26 → 50 → 26: el valor que vuelve a uno ya visto también reemplaza (la tendencia no se pierde)', async () => {
    const c = CASOS[1]
    const t = clienteTablas(c, cifras(c, { puntaje: 4.5, resenas: 26, seguidores: 100, posts: 5, t: T1, id: 'a' }))
    await corrida(c, t, '2026-10-15T09:00:00Z')
    t.apify_raw.push(...cifras(c, { puntaje: 4.5, resenas: 50, seguidores: 100, posts: 5, t: T2, id: 'b' }))
    await corrida(c, t, '2026-10-16T09:00:00Z')
    t.apify_raw.push(...cifras(c, { puntaje: 4.5, resenas: 26, seguidores: 100, posts: 5, t: T3, id: 'c' }))
    await corrida(c, t, '2026-10-17T09:00:00Z')
    expect(todas(t, 'metrica:mapas:resenas')).toHaveLength(3)
    const [viva] = vivas(t, 'metrica:mapas:resenas')
    expect((viva.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBe(26)
    expect(vivas(t, 'metrica:mapas:resenas')).toHaveLength(1)
  })
  it('cliente SIN Mapas: sin cifras de Mapas y sin error; cliente SIN Instagram: sin cifras de Instagram y sin error', async () => {
    const c = CASOS[2]
    const sinMapas = clienteTablas(c, cifras(c, { seguidores: 10, posts: 2, t: T1, id: 'a', conMapas: false }))
    const a = await corrida(c, sinMapas, '2026-10-15T09:00:00Z')
    expect(a.r.estado).toBe('hecha')
    expect(vivas(sinMapas, 'metrica:instagram:seguidores')).toHaveLength(1)
    expect(sinMapas.cerebro_fichas.some((f) => String(f.atributo).startsWith('metrica:mapas'))).toBe(false)
    const sinIg = clienteTablas(c, cifras(c, { puntaje: 4.1, resenas: 7, t: T1, id: 'b', conIg: false }))
    const b = await corrida(c, sinIg, '2026-10-15T09:00:00Z')
    expect(b.r.estado).toBe('hecha')
    expect(vivas(sinIg, 'metrica:mapas:puntaje')).toHaveLength(1)
    expect(sinIg.cerebro_fichas.some((f) => String(f.atributo).startsWith('metrica:instagram'))).toBe(false)
  })
  it('lo que no es cifra (texto, «nulo», negativo) no genera ficha; la ficha de un HOMÓNIMO en Mapas no aporta cifras', () => {
    const c = CASOS[0]
    const raw = [{ id: 'm', apify_function: 'own_google_maps_profile', ensayo: false, created_at: T1, respuesta: [{ title: 'Otro Negocio', address: 'Calle 1, Otra Ciudad', totalScore: 3.1, reviewsCount: 900 }] },
      { id: 'i', apify_function: 'instagram_scraper', ensayo: false, created_at: T1, respuesta: [{ username: c.ig, followersCount: 'muchos', postsCount: -4 }] }]
    const u = unidadesDeRaspados(raw as never, { propios: { handles: [c.ig] }, fichaDeMapas: () => null })
    expect(u.filter((x) => x.fuente === 'metrica')).toEqual([])
  })
  it('las cifras de una fila de ENSAYO nunca entran', () => {
    const c = CASOS[0]
    const raw = cifras(c, { puntaje: 5, resenas: 999, seguidores: 99999, posts: 1, t: T1, id: 'e' }).map((f) => ({ ...f, ensayo: true }))
    expect(unidadesDeRaspados(raw as never, { propios: { handles: [c.ig] }, fichaDeMapas: (items) => items[0] }).filter((x) => x.fuente === 'metrica')).toEqual([])
  })
  it('por qué 143 de 169 fichas no tienen atributo: es lo que se SUMA por diseño (publicaciones, reseñas, menciones, videos, líneas de texto); solo precios, horarios, campos de Mapas, bio y cifras llevan atributo', async () => {
    const c = CASOS[0]
    const raw = [...cifras(c, { puntaje: 4.8, resenas: 26, seguidores: 1236, posts: 19, t: T1, id: 'a' }),
      { id: 'w', client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: T1, params: {}, respuesta: [{ url: `${c.web}/`, text: 'Limpieza dental $35\nSomos una clínica con más de diez años cuidando sonrisas en toda la ciudad' }] },
      { id: 'rv', client_id: c.id, apify_function: 'resenas_google_maps', ensayo: false, created_at: T1, params: {}, respuesta: [{ reviewId: 'R1', text: 'Excelente atención en la clínica, me explicaron todo el tratamiento con calma' }] }]
    const t = clienteTablas(c, raw)
    await corrida(c, t, '2026-10-15T09:00:00Z')
    const sinAtributo = t.cerebro_fichas.filter((f) => !f.atributo && !f.retirada_en)
    const conAtributo = t.cerebro_fichas.filter((f) => f.atributo && !f.retirada_en)
    expect(sinAtributo.length).toBeGreaterThan(0)
    expect(new Set(sinAtributo.map((f) => f.clase))).toEqual(new Set(['sitio', 'resenas']))
    expect(conAtributo.map((f) => String(f.atributo)).some((a) => a.startsWith('metrica:'))).toBe(true)
  })
})

describe('1 · bordes del emparejamiento libro ↔ crudo', () => {
  afterEach(() => { vi.unstubAllEnvs() })
  it('el crudo MUY anterior (> 3 min) o POSTERIOR a la fila del libro no es su pareja: la fila cuenta como del portero', () => {
    const lejos = llamada('website_content_scraper', '2026-10-15T09:00:00Z', 0.6, 'plan-v3-sala')
    lejos.cost.created_at = '2026-10-15T09:10:00Z' // 10 min después del crudo
    const antes = llamada('instagram_scraper', '2026-10-15T09:00:00Z', 0.6, 'plan-v3-sala')
    antes.raw.created_at = '2026-10-15T09:02:00Z' // el crudo es 60 s POSTERIOR a la fila del libro
    const r = soloLoDelPortero([lejos.cost, antes.cost] as never, [lejos.raw, antes.raw] as never, C)
    expect(r.fuera_del_portero).toEqual([])
    expect(r.sin_origen).toBe(2)
  })
  it('PORTERO_WORKFLOW_ID cambia el flujo que se reconoce como del portero', async () => {
    vi.stubEnv('PORTERO_WORKFLOW_ID', 'otroFlujo99999')
    const t = mundo([llamada('website_content_scraper', '2026-10-15T12:30:00Z', 0.5, WF), llamada('instagram_scraper', '2026-10-15T12:31:00Z', 0.2, 'otroFlujo99999#tanda2')])
    const g = await gastoDeHoy(crearBaseFalsa(t as never).db, C, AHORA)
    if (g.ok) { expect(g.gasto.apify_usd).toBeCloseTo(0.2, 4); expect(g.fuera_del_portero_usd).toBeCloseTo(0.5, 4) }
  })
})

describe('3 · bordes de las cifras', () => {
  it('un valor 0 es una cifra (0 reseñas de un negocio nuevo); el texto o lo negativo no', () => {
    const c = CASOS[0]
    const raw = [{ id: 'm', apify_function: 'own_google_maps_profile', ensayo: false, created_at: T1, respuesta: [{ title: c.nombre, address: `Calle 1, ${c.ciudad}`, totalScore: 0, reviewsCount: 0 }] }]
    const u = unidadesDeRaspados(raw as never, { propios: { handles: [] }, fichaDeMapas: (items) => items[0] }).filter((x) => x.fuente === 'metrica')
    expect(u.map((x) => x.metrica?.valor)).toEqual([0, 0])
  })
  it('el plazo de una cifra: la de Mapas vence como la ficha de Mapas, la de Instagram como el perfil', async () => {
    const c = CASOS[2]
    const t = clienteTablas(c, cifras(c, { puntaje: 4.2, resenas: 10, seguidores: 50, posts: 3, t: T1, id: 'p' }))
    await corrida(c, t, '2026-10-15T09:00:00Z')
    expect(vivas(t, 'metrica:mapas:puntaje')[0].plazo).toBe('ficha_mapas_propia')
    expect(vivas(t, 'metrica:instagram:seguidores')[0].plazo).toBe('perfil_propio')
  })
})
