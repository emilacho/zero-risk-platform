/**
 * El cerebro despierta con el raspado del alta (15-oct). US$ 0 · base falsa · ninguna llamada a Apify ni a modelo.
 * ≥ 3 rubros (tuteo y voseo), cliente sin web, homónimo en Mapas, filas de ensayo que nunca entran, alta sin raspado, raspado viejo,
 * la corrida diaria no se bloquea ni repite lo del alta, el vigilante, y el nodo del alta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { rutaDespertar, type DepsDeDespertar } from '../despertar'
import { rutaDescubrir, rutaTanda2 } from '../rutas'
import { accionCubierta, COBERTURA_DEL_ALTA_HORAS, objetivosDeParams, sinLoYaRaspado } from '../cobertura'
import type { Interruptores } from '../datos'
import { crearBaseFalsa } from './base-falsa'
import { POST } from '../../../app/api/brain/alimentar/despertar/route'

const ON: Interruptores = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const ALTA = new Date('2026-10-15T14:00:00Z')
const AHORA = new Date('2026-10-15T15:00:00Z')
const REAL = { dry_run: false, workflow_id: 'LyVoKcrypS5uLyuu', workflow_execution_id: 'ex-alta-1' }
const PORTERO = 'ogfq56oIEoHufFPM'

interface Caso { id: string; nombre: string; rubro: string; pais: string; ciudad: string; voz: 'tuteo' | 'voseo'; web: string | null; ig: string; pagina: string; bio: string; homonimo: string }
const CASOS: Caso[] = [
  { id: '11111111-1111-4111-8111-111111111111', nombre: 'Clínica Sonrisa Norte', rubro: 'clínica dental y ortodoncia', pais: 'Ecuador', ciudad: 'Quito', voz: 'tuteo', web: 'https://sonrisanorte.example', ig: 'sonrisanorte',
    pagina: 'Limpieza dental $35\nOrtodoncia desde $900\nAtendemos con cita previa por WhatsApp', bio: 'Somos la Clínica Sonrisa Norte, cuida tu sonrisa', homonimo: 'Clínica Sonrisa Norte de Guayaquil' },
  { id: '22222222-2222-4222-8222-222222222222', nombre: 'Taller Mecánico El Pistón', rubro: 'taller mecánico y lubricadora', pais: 'Argentina', ciudad: 'Rosario', voz: 'voseo', web: 'https://elpiston.example', ig: 'elpiston.ok',
    pagina: 'Cambio de aceite ARS 45.000\nAlineación y balanceo ARS 30.000\nPedí tu turno por WhatsApp', bio: 'Taller Mecánico El Pistón, pedí tu turno', homonimo: 'Taller Mecánico El Pistón de Córdoba' },
  { id: '33333333-3333-4333-8333-333333333333', nombre: 'Flujo CRM', rubro: 'software CRM para pymes', pais: 'México', ciudad: 'Ciudad de México', voz: 'tuteo', web: 'https://flujocrm.example', ig: 'flujocrm',
    pagina: 'Plan Starter US$ 19 por mes\nPlan Pro US$ 49 por mes\nSoporte por chat de lunes a viernes', bio: 'Flujo CRM, ordena tu seguimiento de clientes', homonimo: 'Flujo CRM de Lima' },
]

function tablas(c: Caso, o: { sinWeb?: boolean; edad?: number; conEnsayo?: boolean; sinRaspado?: boolean; homonimoEnMapas?: boolean } = {}) {
  const t0 = new Date(ALTA.getTime() - (o.edad ?? 0) * 3_600_000).toISOString()
  const web = o.sinWeb ? null : c.web
  const filas: Array<Record<string, unknown>> = o.sinRaspado ? [] : [
    ...(web ? [{ id: `${c.id}-w`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: false, created_at: t0, params: { startUrls: [{ url: web }], maxCrawlPages: 6 }, metadata: { llamado_por: 'LyVoKcrypS5uLyuu' }, respuesta: [{ url: `${web}/`, text: c.pagina }] }] : []),
    { id: `${c.id}-m`, client_id: c.id, apify_function: 'own_google_maps_profile', ensayo: false, created_at: t0, params: { searchStringsArray: [`${c.nombre} ${c.ciudad}`] }, respuesta: [{ title: o.homonimoEnMapas ? c.homonimo : c.nombre, url: `https://www.google.com/maps/place/${c.ig}`, address: `Av. Principal 123, ${o.homonimoEnMapas ? 'Otra Ciudad' : c.ciudad}`, openingHours: [{ day: 'lunes', hours: '8 AM to 6 PM' }] }] },
    { id: `${c.id}-i`, client_id: c.id, apify_function: 'instagram_scraper', ensayo: false, created_at: t0, params: { usernames: [c.ig], resultsLimit: 12 }, respuesta: [{ username: c.ig, biography: c.bio, latestPosts: [{ shortCode: 'P1', caption: 'Bienvenidos a la semana con muchas novedades para todos', ownerUsername: c.ig, type: 'Video' }] }] },
  ]
  if (o.conEnsayo) filas.push({ id: `${c.id}-e`, client_id: c.id, apify_function: 'website_content_scraper', ensayo: true, created_at: t0, params: {}, respuesta: [{ url: `${c.web}/`, text: 'TEXTO-DE-ENSAYO-QUE-NUNCA-DEBE-ENTRAR precio sintético $1 por todo' }] })
  return {
    clients: [{ id: c.id, name: c.nombre, website_url: web, industry: c.rubro, country: c.pais, config: { registro: c.voz, apify: { own_handles: { instagram: c.ig } } } }],
    client_sedes: [{ client_id: c.id, ciudad: c.ciudad, clave: c.ciudad.toLowerCase() }],
    client_brand_books: [{ id: 'mb', client_id: c.id }],
    client_historical_outputs: [{ id: 'pl', client_id: c.id, output_type: 'campaign_plan_90d', provenance_tag: {} }],
    apify_raw: filas, cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [],
  } as Record<string, Array<Record<string, unknown>>>
}

function montar(t: Record<string, Array<Record<string, unknown>>>, o: { apagarOk?: boolean; avisarOk?: boolean; puenteFalla?: boolean; ahora?: Date; fallaEn?: string; fallaVeces?: number; saltar?: number } = {}) {
  const base = crearBaseFalsa(t as never, { fallaEn: o.fallaEn, fallaVeces: o.fallaVeces, saltar: o.saltar, reloj: () => (o.ahora ?? AHORA).toISOString() })
  const apagados: string[] = [], avisos: string[] = [], pasadas: number[] = [], esperas: number[] = []
  const deps: DepsDeDespertar = {
    db: base.db, interruptores: ON, ahora: o.ahora ?? AHORA,
    // el puente simulado escribe los trozos de las fichas que recibe (en lotes de 5) para que la reconciliación converja
    puente: async (p) => {
      if (o.puenteFalla) return { escritos: 0, sacados: 0, errores: ['ingest-source respondió 502'] }
      const lote = p.escribir.slice(0, 5)
      pasadas.push(lote.length)
      for (const x of lote) (t.client_brain_chunks ??= []).push({ client_id: p.client_id, source_table: 'cerebro_fichas', source_id: x.source_id })
      return { escritos: lote.length, sacados: 0, errores: [] }
    },
    apagar: async (w) => { apagados.push(w); return { ok: o.apagarOk !== false, detalle: 'flujo desactivado' } },
    avisar: async (x) => { avisos.push(x); return { ok: o.avisarOk !== false, detalle: 'entregado' } },
    esperar: async (ms) => { esperas.push(ms) },
    workflowIdPortero: PORTERO,
  }
  return { base, deps, apagados, avisos, pasadas, esperas }
}
const fichasVivas = (t: Record<string, Array<Record<string, unknown>>>) => (t.cerebro_fichas ?? []).filter((f) => !f.descartada && !f.retirada_en)

describe('despierta con el raspado del alta · 3 rubros (tuteo y voseo)', () => {
  for (const c of CASOS) {
    it(`${c.nombre} (${c.pais} · ${c.voz}): fichas con fecha y fuente, vistas marcadas, rastro «despertar», puente en pasadas, cerebro listo, sin Apify`, async () => {
      const t = tablas(c)
      const m = montar(t)
      const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, estado: 'hecha', cerebro_listo: true, apify_llamado: false, modelos_llamados: 0 })
      const vivas = fichasVivas(t)
      expect(vivas.length).toBeGreaterThan(3)
      expect(vivas.every((f) => f.observado_en && f.decision === 'suma')).toBe(true)
      expect((t.cerebro_unidades_vistas ?? []).length).toBeGreaterThanOrEqual(vivas.length)
      // el rastro: tipo despertar, hecha, con el vigilante en paz
      const fila = t.cerebro_portero_corridas.find((x) => x.client_id === c.id)!
      expect(fila.estado).toBe('hecha')
      expect(fila.resumen).toMatchObject({ tipo: 'despertar', despertar: { fichas_nuevas: vivas.length }, vigilante: { ok: true } })
      // el puente corrió por pasadas (lotes de 5) hasta que no quedó nada
      expect(m.pasadas.length).toBeGreaterThan(1)
      expect((r.body.puente as { quedan: number }).quedan).toBe(0)
      // silencio: nada apagado ni avisado
      expect(m.apagados).toEqual([]); expect(m.avisos).toEqual([])
    })
  }
})

describe('lo que el alta trajo no se vuelve a pedir; lo que no, sí', () => {
  it('después de despertar, el plan diario omite lo cubierto y deja lo demás; el ahorro se mide con el máximo declarado', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    const plan = d.body.plan as { hacer: Array<{ funcion: string; fuente: string }> }
    const cub = d.body.cubierto_por_el_alta as { cubiertas: Array<{ funcion: string }>; ahorro_usd: number }
    expect(cub.cubiertas.map((x) => x.funcion).sort()).toEqual(['instagram_scraper', 'own_google_maps_profile', 'website_content_scraper'])
    expect(cub.ahorro_usd).toBeGreaterThan(0)
    // sin publicaciones propias vigiladas ni búsquedas en el alta: la prensa SÍ se pide (el alta no la trajo)
    expect(plan.hacer.map((a) => a.fuente)).toContain('prensa')
    expect(plan.hacer.map((a) => a.funcion)).not.toContain('website_content_scraper')
    expect(plan.hacer.map((a) => a.funcion)).not.toContain('instagram_scraper')
  })
  it('SIN despertar el plan es el de siempre (nada se omite): el comportamiento diario no cambia', async () => {
    const c = CASOS[0]
    const m = montar(tablas(c))
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect(d.body.cubierto_por_el_alta).toBeNull()
    expect((d.body.plan as { hacer: Array<{ funcion: string }> }).hacer.map((a) => a.funcion)).toContain('website_content_scraper')
  })
  it('el raspado del alta MUY viejo (> 36 h) se procesa para el cerebro pero NO cubre: se vuelve a pedir', async () => {
    const c = CASOS[1]
    const t = tablas(c, { edad: COBERTURA_DEL_ALTA_HORAS + 12 })
    const m = montar(t)
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body.cerebro_listo).toBe(true)
    expect(fichasVivas(t).length).toBeGreaterThan(3)
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect((d.body.cubierto_por_el_alta as { cubiertas: unknown[] }).cubiertas).toEqual([])
    expect((d.body.plan as { hacer: Array<{ funcion: string }> }).hacer.map((a) => a.funcion)).toContain('website_content_scraper')
  })
  it('pasada la ventana (40 h después del despertar) ya no se omite nada, aunque el raspado siga ahí', async () => {
    const c = CASOS[2]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const tarde = new Date(AHORA.getTime() + 40 * 3_600_000)
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora: tarde }, { client_id: c.id, dry_run: true })
    expect(d.body.cubierto_por_el_alta).toBeNull()
  })
  it('lo que cambió de parámetros (otra dirección del sitio) NO queda cubierto', () => {
    const a = { fuente: 'sitio', funcion: 'website_content_scraper', params: { startUrls: [{ url: 'https://nuevo.example' }] }, metadata: { target_kind: 'own' as const, llamado_por: 'x' }, usd_max: 0.05, medido: true, objetivo: 'https://nuevo.example' }
    const fila = { apify_function: 'website_content_scraper', params: { startUrls: [{ url: 'https://viejo.example/' }] }, created_at: ALTA.toISOString() }
    expect(accionCubierta(a as never, [fila], ALTA.getTime() - 1000)).toBe(false)
    expect(accionCubierta({ ...a, params: { startUrls: [{ url: 'https://VIEJO.example' }] } } as never, [fila], ALTA.getTime() - 1000)).toBe(true) // mayúsculas y barra final no cuentan
  })
  it('objetivosDeParams entiende direcciones, cuentas, búsquedas y lugares; sin objetivos cubre la función', () => {
    expect(objetivosDeParams({ startUrls: [{ url: 'https://www.A.com/' }], usernames: ['@Cuenta'], queries: '"X" Quito\n"X" Quito tripadvisor', searchStringsArray: ['Y Lima'], placeIds: ['ChIJ1'] }).sort())
      .toEqual(['"x" quito', '"x" quito tripadvisor', 'a.com', 'chij1', 'cuenta', 'y lima'].sort())
    expect(objetivosDeParams(null)).toEqual([])
    const sin = { fuente: 'x', funcion: 'f', params: {}, metadata: { target_kind: 'own' as const, llamado_por: 'x' }, usd_max: 0.01, medido: true, objetivo: '' }
    expect(sinLoYaRaspado({ hacer: [sin as never] }, [{ apify_function: 'f', created_at: ALTA.toISOString() }], AHORA).cubiertas).toHaveLength(1)
  })
  it('los videos de las publicaciones que el despertar VIO se piden igual dentro de la ventana (nunca se bajaron); fuera de ella solo los nuevos', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const dentro = await rutaTanda2({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect((dentro.body.acciones as Array<{ fuente: string }>).map((a) => a.fuente)).toContain('videos')
    // si ya se bajó ese video, no se pide otra vez
    t.apify_raw.push({ id: 'v', client_id: c.id, apify_function: 'videos_instagram', ensayo: false, created_at: AHORA.toISOString(), params: {}, respuesta: [{ shortCode: 'P1', transcript: 'x'.repeat(40) }] })
    const ya = await rutaTanda2({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect((ya.body.acciones as Array<{ fuente: string }>).map((a) => a.fuente)).not.toContain('videos')
  })
})

describe('casos de borde del alta', () => {
  it('cliente SIN web: se despierta con Mapas e Instagram, sin error', async () => {
    const c = CASOS[0]
    const t = tablas(c, { sinWeb: true })
    const m = montar(t)
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ ok: true, cerebro_listo: true })
    expect(fichasVivas(t).length).toBeGreaterThan(0)
    expect(JSON.stringify(t.cerebro_fichas)).not.toContain('website_content_scraper')
  })
  it('homónimo en Mapas: la ficha de otro negocio no entra al cerebro', async () => {
    const c = CASOS[1]
    const t = tablas(c, { homonimoEnMapas: true })
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const textos = JSON.stringify(fichasVivas(t).map((f) => f.contenido))
    expect(textos).not.toContain('Córdoba')
    expect(textos).not.toContain('Otra Ciudad')
  })
  it('las filas de ENSAYO del alta nunca entran al cerebro', async () => {
    const c = CASOS[2]
    const t = tablas(c, { conEnsayo: true })
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(JSON.stringify(t.cerebro_fichas)).not.toMatch(/ENSAYO-QUE-NUNCA/i)
    expect(JSON.stringify(t.cerebro_unidades_vistas)).not.toMatch(/ENSAYO-QUE-NUNCA/i)
  })
  it('el alta NO raspó nada: no hay fichas, el cerebro NO queda «listo» y el plan diario lo pide todo', async () => {
    const c = CASOS[0]
    const t = tablas(c, { sinRaspado: true })
    const m = montar(t)
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ cerebro_listo: false, sin_raspado_del_alta: true, ya_cubierto: 0 })
    expect(fichasVivas(t)).toEqual([])
    expect((r.body.por_pedir_en_la_corrida_diaria as unknown[]).length).toBeGreaterThanOrEqual(3)
  })
  it('es idempotente: despertar dos veces no duplica fichas', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const n = fichasVivas(t).length
    const r2 = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(fichasVivas(t).length).toBe(n)
    expect(r2.body.fichas_nuevas).toBe(0)
  })
})

describe('la corrida diaria sigue sola', () => {
  it('el despertar NO bloquea la corrida diaria del mismo día: la reemplaza y deja de ser «despertar»', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(t.cerebro_portero_corridas).toHaveLength(1)
    const diaria = await alimentarCliente({ db: m.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, workflow_id: PORTERO, workflow_execution_id: 'ex-d' })
    expect(diaria.estado).toBe('hecha')
    expect(diaria.estado).not.toBe('ya_corrio_hoy')
    expect(t.cerebro_portero_corridas).toHaveLength(1) // UNA fila por día: se actualiza, no se duplica
    expect((t.cerebro_portero_corridas[0].resumen as Record<string, unknown>).tipo).toBeUndefined()
  })
  it('y al revés: si la corrida diaria ya corrió hoy, el despertar no la pisa', async () => {
    const c = CASOS[1]
    const t = tablas(c)
    const m = montar(t)
    await alimentarCliente({ db: m.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, workflow_id: PORTERO, workflow_execution_id: 'ex-d' })
    const antes = JSON.stringify(t.cerebro_portero_corridas)
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ estado: 'ya_corrio_hoy' })
    expect(JSON.stringify(t.cerebro_portero_corridas)).toBe(antes)
  })
  it('la corrida diaria después del despertar NO repite las unidades (todo «repetida»), aunque el raspado sea el mismo', async () => {
    const c = CASOS[2]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const n = fichasVivas(t).length
    const d = await alimentarCliente({ db: m.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, workflow_id: PORTERO, workflow_execution_id: 'ex-d' })
    expect(d.filtro.repetidas).toBeGreaterThan(0)
    expect(fichasVivas(t).length).toBe(n)
  })
})

describe('el vigilante se aplica igual', () => {
  it('todo bien = silencio (0 apagados, 0 avisos); el gasto del día del alta NO lo apaga (el despertar no gasta)', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    t.costs.push({ service: 'apify:website', amount_usd: 4.2, created_at: '2026-10-15T13:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: c.id }) })
    const m = montar(t)
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body.cerebro_listo).toBe(true)
    expect(m.apagados).toEqual([]); expect(m.avisos).toEqual([])
  })
  it('el puente falla ⇒ apaga el portero diario, avisa (una línea que dice «al despertar con el alta») y el cerebro NO queda listo', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t, { puenteFalla: true })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body.cerebro_listo).toBe(false)
    expect(m.apagados).toEqual([PORTERO])
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/al despertar con el alta/)
    expect(t.cerebro_portero_corridas[0].estado).toBe('con_errores')
  })
  it('una ficha viva nacida hoy de una unidad que el filtro NO confirmó ⇒ apaga y avisa, y el cerebro no queda listo', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    t.cerebro_fichas.push({ id: 'ajena-1', client_id: c.id, ref: 'portero:x:1', clase: 'texto', titulo: 't', contenido: 'texto de otro negocio', fecha_fuente: null, observado_en: '2026-10-15T10:00:00Z', creado_en: '2026-10-15T10:00:00Z', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null, huella: 'h-ajena' })
    t.cerebro_unidades_vistas.push({ client_id: c.id, fuente: 'otra', unidad_ref: 'u-ajena', huella: 'h-ajena', veredicto: 'ajeno', ficha_id: 'ajena-1', ultima_vez: '2026-10-15T10:00:00Z' })
    const m = montar(t)
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body.cerebro_listo).toBe(false)
    expect(m.apagados).toEqual([PORTERO])
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toMatch(/no confirmó como propia/)
  })
  it('sin la llave de despacho: el código nuevo no la nombra', () => {
    const dir = path.resolve(__dirname, '..')
    for (const f of ['despertar.ts', 'cobertura.ts']) expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/SALA_DISPATCH_KEY/)
  })
})

describe('reintento del vigilante en el despertar y mirada «a esa hora»', () => {
  it('una lectura que falla UNA vez al vigilar ⇒ espera y repite; si pasa, silencio (no apaga, no avisa)', async () => {
    const c = CASOS[0]
    // lecturas de la tabla del rastro: alimentar (1), plan de lo que falta (2), el rastro de hoy (3), el vigilante (4 ← falla una vez) y su reintento (5)
    const m = montar(tablas(c), { fallaEn: 'cerebro_portero_corridas', saltar: 3, fallaVeces: 1 })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(m.esperas).toHaveLength(1)
    expect(r.body).toMatchObject({ ok: true, cerebro_listo: true })
    expect((r.body.vigilante as { intentos: number }).intentos).toBe(2)
    expect(m.apagados).toEqual([]); expect(m.avisos).toEqual([])
  })
  it('si la lectura falla las dos veces ⇒ apaga y avisa («falló 2 veces»)', async () => {
    const c = CASOS[1]
    const m = montar(tablas(c), { fallaEn: 'cerebro_portero_corridas', saltar: 3 })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(m.esperas).toHaveLength(1)
    expect(r.body.cerebro_listo).toBe(false)
    expect(m.apagados).toEqual([PORTERO])
    expect(m.avisos[0]).toMatch(/falló 2 veces/)
  })
  it('solo mira el raspado que YA existe a esa hora: lo posterior no entra', async () => {
    const c = CASOS[2]
    const t = tablas(c)
    const m = montar(t, { ahora: new Date(ALTA.getTime() - 3_600_000) })
    const r = await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    expect(r.body.fichas_nuevas).toBe(0)
    expect(r.body.sin_raspado_del_alta).toBe(true)
  })
  it('fuera de la ventana, de las publicaciones ya vistas NO se piden videos (solo las nuevas)', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const tarde = new Date(AHORA.getTime() + 40 * 3_600_000)
    const r = await rutaTanda2({ db: m.base.db, interruptores: ON, ahora: tarde }, { client_id: c.id, dry_run: true })
    expect((r.body.acciones as Array<{ fuente: string }>).map((a) => a.fuente)).not.toContain('videos')
  })
})

describe('cobertura: bordes que no pueden fallar en silencio', () => {
  it('una acción con DOS objetivos solo queda cubierta si el raspado pidió LOS DOS', () => {
    const a = { fuente: 'reparto', funcion: 'website_content_scraper', params: { startUrls: [{ url: 'https://a.example' }, { url: 'https://b.example' }] }, metadata: { target_kind: 'own' as const, llamado_por: 'x' }, usd_max: 0.05, medido: true, objetivo: 'x' }
    const solo = { apify_function: 'website_content_scraper', params: { startUrls: [{ url: 'https://a.example' }] }, created_at: ALTA.toISOString() }
    const ambos = { apify_function: 'website_content_scraper', params: { startUrls: [{ url: 'https://a.example' }, { url: 'https://b.example' }] }, created_at: ALTA.toISOString() }
    expect(accionCubierta(a as never, [solo], 0)).toBe(false)
    expect(accionCubierta(a as never, [ambos], 0)).toBe(true)
  })
  it('un raspado de hace 20 h SÍ cubre (la ventana es de 36 h); con username en singular también se reconoce', () => {
    const a = { fuente: 'menciones', funcion: 'menciones_en_redes', params: { username: ['@cuenta'], resultsLimit: 30 }, metadata: { target_kind: 'third_party' as const, llamado_por: 'x' }, usd_max: 0.14, medido: true, objetivo: 'x' }
    const hace20 = new Date(AHORA.getTime() - 20 * 3_600_000).toISOString()
    const fila = { apify_function: 'menciones_en_redes', params: { username: ['cuenta'] }, created_at: hace20 }
    expect(objetivosDeParams({ username: ['@Cuenta'] })).toEqual(['cuenta'])
    expect(sinLoYaRaspado({ hacer: [a as never] }, [fila], AHORA).cubiertas).toHaveLength(1)
    const hace40 = new Date(AHORA.getTime() - 40 * 3_600_000).toISOString()
    expect(sinLoYaRaspado({ hacer: [a as never] }, [{ ...fila, created_at: hace40 }], AHORA).cubiertas).toHaveLength(0)
  })
  it('el despertar con raspado de hace 20 h: cubre en el plan diario (la ventana por omisión)', async () => {
    const c = CASOS[0]
    const t = tablas(c, { edad: 20 })
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect((d.body.cubierto_por_el_alta as { cubiertas: unknown[] }).cubiertas).toHaveLength(3)
  })
  it('una corrida DIARIA reciente (no despertar) NO activa la cobertura', async () => {
    const c = CASOS[1]
    const t = tablas(c)
    const m = montar(t)
    await alimentarCliente({ db: m.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: AHORA, workflow_id: PORTERO, workflow_execution_id: 'ex-d' })
    const d = await rutaDescubrir({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect(d.body.cubierto_por_el_alta).toBeNull()
  })
  it('las reseñas que el alta ya pidió (dentro de la ventana) no se piden otra vez; sin ellas, sí se piden', async () => {
    const c = CASOS[2]
    const t = tablas(c)
    const m = montar(t)
    await rutaDespertar(m.deps, { client_id: c.id, ...REAL })
    const sin = await rutaTanda2({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect((sin.body.acciones as Array<{ fuente: string }>).map((a) => a.fuente)).toContain('resenas')
    t.apify_raw.push({ id: 'r', client_id: c.id, apify_function: 'resenas_google_maps', ensayo: false, created_at: new Date(AHORA.getTime() - 20 * 3_600_000).toISOString(), params: {}, respuesta: [] })
    const con = await rutaTanda2({ db: m.base.db, interruptores: ON, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect((con.body.acciones as Array<{ fuente: string }>).map((a) => a.fuente)).not.toContain('resenas')
    expect(JSON.stringify(con.body.omitidas)).toMatch(/raspado del alta/)
  })
  it('sin puente al índice el cerebro NO queda «listo» (no hay forma de buscarlo)', async () => {
    const c = CASOS[0]
    const m = montar(tablas(c))
    const r = await rutaDespertar({ ...m.deps, interruptores: { ...ON, puente_al_indice: false } }, { client_id: c.id, ...REAL })
    expect(r.body.cerebro_listo).toBe(false)
  })
  it('un puente que no avanza (ni errores) se corta: no gira las 12 pasadas', async () => {
    const c = CASOS[1]
    const m = montar(tablas(c))
    const r = await rutaDespertar({ ...m.deps, puente: async () => ({ escritos: 0, sacados: 0, errores: [] }) }, { client_id: c.id, ...REAL })
    expect((r.body.puente as { pasadas: number }).pasadas).toBe(2)
    expect(r.body.cerebro_listo).toBe(false) // quedaron trozos sin escribir: el vigilante lo dice
  })
})

describe('entrada, interruptor y la ruta', () => {
  it('dry_run obligatorio (400); sin workflow (403); client_id inválido (400)', async () => {
    const m = montar(tablas(CASOS[0]))
    expect((await rutaDespertar(m.deps, { client_id: CASOS[0].id })).status).toBe(400)
    expect((await rutaDespertar(m.deps, { client_id: CASOS[0].id, dry_run: false })).status).toBe(403)
    expect((await rutaDespertar(m.deps, { client_id: 'no-uuid', dry_run: true })).status).toBe(400)
  })
  it('dry_run: calcula todo y NO escribe, NO apaga y NO avisa; dice cuánto se ahorra y qué falta', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const m = montar(t)
    const r = await rutaDespertar(m.deps, { client_id: c.id, dry_run: true })
    expect(r.status).toBe(200)
    expect(m.base.escrituras).toEqual([])
    expect(r.body).toMatchObject({ dry_run: true, cerebro_listo: null, apify_llamado: false })
    expect(r.body.fichas_nuevas as number).toBeGreaterThan(3)
    expect(r.body.ya_cubierto).toBe(3)
    expect(r.body.ahorro_usd as number).toBeGreaterThan(0)
    expect(m.avisos).toEqual([]); expect(m.apagados).toEqual([])
  })
  it('con el portero apagado (PORTERO_ALIMENTAR) no lee ni escribe', async () => {
    const m = montar(tablas(CASOS[0]))
    const r = await rutaDespertar({ ...m.deps, interruptores: { ...ON, alimentar: false } }, { client_id: CASOS[0].id, ...REAL })
    expect(r.body.apagado).toBe(true)
    expect(m.base.lecturas).toEqual([]); expect(m.base.escrituras).toEqual([])
  })
  it('cliente inexistente: 404', async () => {
    const t = tablas(CASOS[0])
    t.clients = []
    const r = await rutaDespertar(montar(t).deps, { client_id: CASOS[0].id, ...REAL })
    expect(r.status).toBe(404)
  })
  it('la ruta exige la llave interna (401)', async () => {
    const r = await POST(new Request('http://x/api/brain/alimentar/despertar', { method: 'POST', body: '{}' }))
    expect(r.status).toBe(401)
  })
})

describe('el nodo del alta: aditivo, no la enciende y no la rompe', () => {
  const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/LyVoKcrypS5uLyuu')
  const ANTES = JSON.parse(fs.readFileSync(path.join(DIR, 'LyVoKcrypS5uLyuu-ANTES-despertar-2026-10-15.json'), 'utf8')) as { active: boolean; nodes: Array<{ name: string; parameters: unknown; onError?: string }>; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
  const DESPUES = JSON.parse(fs.readFileSync(path.join(DIR, 'LyVoKcrypS5uLyuu-ARREGLADO-despertar-2026-10-15.json'), 'utf8')) as typeof ANTES
  const NODO = '⑦ Despertar el cerebro (con el raspado del alta)'
  it('el alta sigue INACTIVA y se agrega UN nodo; los demás nodos son idénticos', () => {
    expect(ANTES.active).toBe(false)
    expect(JSON.stringify(DESPUES)).not.toMatch(/"active"\s*:\s*true/)
    expect(DESPUES.nodes).toHaveLength(ANTES.nodes.length + 1)
    for (const n of ANTES.nodes) expect(DESPUES.nodes.find((x) => x.name === n.name)!.parameters, n.name).toEqual(n.parameters)
  })
  it('cuelga de «Armar carga · segunda fase» como SEGUNDA salida (después del pedido de planeación) y no rompe al alta si falla', () => {
    const sal = DESPUES.connections['Armar carga · segunda fase'].main[0].map((x) => x.node)
    expect(sal).toEqual(['Llamar · Segunda Fase del alta', NODO])
    expect(DESPUES.nodes.find((n) => n.name === NODO)!.onError).toBe('continueRegularOutput')
    for (const [de, v] of Object.entries(DESPUES.connections)) if (de !== 'Armar carga · segunda fase') expect(JSON.stringify(v)).toBe(JSON.stringify(ANTES.connections[de]))
  })
  it('llama a la ruta del despertar con la llave interna, el client_id del alta y workflow/ejecución; nunca la llave de despacho', () => {
    const p = JSON.stringify(DESPUES.nodes.find((n) => n.name === NODO)!.parameters)
    expect(p).toContain('/api/brain/alimentar/despertar')
    expect(p).toContain('$env.INTERNAL_API_KEY')
    expect(p).toContain("$('Validate Deal Data').first().json.client_id")
    expect(p).toContain('$workflow.id'); expect(p).toContain('$execution.id')
    expect(p).not.toMatch(/SALA_DISPATCH_KEY/)
  })
})
