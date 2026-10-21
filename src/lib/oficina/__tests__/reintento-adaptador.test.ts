/**
 * Los puertos REALES del reintento de piezas contra una base FALSA con la forma de PostgREST + un almacén de la cadena falso (config, campañas, sobres).
 * Prueba lo que las pruebas del módulo puro no pueden: que las consultas leen lo correcto (el parte de ESTA campaña, no el de ensayo, solo encargos reales), que el interruptor es el booleano
 * exacto, que el reintento nunca lanza dentro del vigía y que, de punta a punta con los datos reales de la tercera prueba, sale lo esperado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from './dbfalsa'
import type { SobreDeProducir } from '@/lib/cadena/autoproducir'

const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const CAMPANA = '31dc6aaf-2e9c-426e-81c5-1645c500283e'
const OTRA = '99999999-aaaa-bbbb-cccc-dddddddddddd'
const PARTE = '2a93029a-d4e5-439e-87a8-4b67afdfec33'
const T0 = Date.parse('2026-10-21T10:02:24Z')

const cad = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  campanas: [] as Array<Record<string, unknown>>,
  emitidos: [] as SobreDeProducir[],
  freno: { bloqueado: false } as { bloqueado: boolean; motivo?: string },
  filasFalla: false,
}))
vi.mock('@/lib/cadena/almacen-supabase', () => ({
  almacenDeSupabase: () => ({
    leerConfig: async (k: string) => cad.config[k],
    escribirConfig: async (k: string, v: unknown) => { cad.config[k] = v },
    campanasActivas: async () => cad.campanas,
    ultimaVersionDeCalendario: async () => { if (cad.filasFalla) throw new Error('caída'); return 1 },
    filas: async () => [{ id: 's1-d1-lun_ig', fecha: '2026-10-26', hora: '09:00' }],
    frenoDeGasto: async () => cad.freno,
    emitirSobre: async (s: SobreDeProducir) => { cad.emitidos.push(s); return { resultado: 'aceptado' } },
  }),
}))
import { puertosDeReintento, reintentoDeLaCadena } from '../reintento-adaptador'

const campana = (o: Record<string, unknown> = {}) => ({ id: CAMPANA, client_id: CLIENTE, estado: 'activa', autoproducir: true, seco: false, sala_ref: { _sala_correlation_id: 'ccc4204b-7b95-4418-8ae6-57d360c65714' }, ...o })
const parte = (id: string, lote: string, o: Record<string, unknown> = {}) => ({
  id, client_id: CLIENTE, output_type: 'campaign_brief_pack', created_at: new Date(T0).toISOString(),
  provenance_tag: { lote_key: lote, valido: true, familias_por_brief: [{ brief_id: 'BRF-0001', fila_id: 's1-d1-lun_ig', familia: 'carrusel_ig_v1' }, { brief_id: 'BRF-0004', fila_id: 's1-d1-hist_lun', familia: 'kit_historias' }], ...o },
})
const mundo = () => new DbFalsa()
  .semilla('client_historical_outputs', [
    parte(PARTE, `${CAMPANA}:2026-W44:1`),
    parte('11111111-1111-1111-1111-111111111111', `${OTRA}:2026-W44:1`),                                  // de OTRA campaña
    parte('22222222-2222-2222-2222-222222222222', `seco:${CAMPANA}:2026-W44:1`, { seco: true }),            // de ensayo
    { ...parte('33333333-3333-3333-3333-333333333333', `${CAMPANA}:2026-W45:1`), output_type: 'campaign_plan_90d' }, // no es un parte
  ])
  .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img', 'carrusel_ig_v1', 'kit_historias'], clientes_ensayo: [] }])
  .semilla('oficina_tipos_de_grupo', [
    { tipo: 'post_img', familia: 'post_img', pasos: [], indicaciones: {}, limites: { tope_encargo_usd: 1.5 }, activo: true },
    { tipo: 'carrusel_ig_v1', familia: 'carrusel_ig_v1', pasos: [], indicaciones: {}, limites: { tope_encargo_usd: 1.5 }, activo: true },
    { tipo: 'kit_historias', familia: 'kit_historias', pasos: [], indicaciones: {}, limites: { tope_encargo_usd: 1.5 }, activo: false },
  ])
  .semilla('oficina_encargos', [])
const ENV = { slackToken: 'xoxb-falso' }
let reloj = new Date(T0 + 20 * 60_000)
beforeEach(() => { cad.config = { estado_cadena: 'encendida', reintento_piezas: true }; cad.campanas = [campana()]; cad.emitidos = []; cad.freno = { bloqueado: false }; cad.filasFalla = false; reloj = new Date(T0 + 20 * 60_000) })

describe('las consultas leen lo correcto', () => {
  it('el interruptor es el booleano exacto: «true» como texto, 1 o nada = apagado', async () => {
    const P = puertosDeReintento(mundo() as never, ENV, () => reloj)
    expect(await P.interruptor()).toBe(true)
    for (const v of ['true', 1, 'si', null, undefined]) { cad.config.reintento_piezas = v; expect(await P.interruptor()).toBe(false) }
  })
  it('la cadena «encendida» es la única que cuenta', async () => {
    const P = puertosDeReintento(mundo() as never, ENV)
    expect(await P.cadenaEncendida()).toBe(true); cad.config.estado_cadena = 'ensayo'; expect(await P.cadenaEncendida()).toBe(false)
  })
  it('solo entrega campañas con autoproducir real y que no son de ensayo', async () => {
    cad.campanas = [campana(), campana({ id: 'b', autoproducir: false }), campana({ id: 'c', seco: true }), campana({ id: 'd', autoproducir: 'true' })]
    expect((await puertosDeReintento(mundo() as never, ENV).campanas()).map((c) => c.id)).toEqual([CAMPANA])
  })
  it('los partes son los de ESTA campaña: ni los de otra, ni los de ensayo, ni algo que no es un parte', async () => {
    const P = puertosDeReintento(mundo() as never, ENV)
    const ps = await P.partes({ id: CAMPANA, client_id: CLIENTE, sala_ref: null })
    expect(ps.map((p) => p.id)).toEqual([PARTE])
    expect(ps[0]).toMatchObject({ valido: true, briefs: [{ brief_id: 'BRF-0001', fila_id: 's1-d1-lun_ig', familia: 'carrusel_ig_v1' }, { brief_id: 'BRF-0004', fila_id: 's1-d1-hist_lun', familia: 'kit_historias' }] })
  })
  it('un parte de ensayo (marcado seco) NO entra aunque su llave de lote empiece por la campaña; y «valido» es el booleano exacto', async () => {
    const db = mundo().semilla('client_historical_outputs', [
      parte('55555555-5555-5555-5555-555555555555', `${CAMPANA}:2026-W44:3`, { seco: true }),
      parte('66666666-6666-6666-6666-666666666666', `${CAMPANA}:2026-W44:4`, { valido: 'true' }),
      parte('77777777-7777-7777-7777-777777777777', `${CAMPANA}:2026-W44:5`, { valido: undefined }),
    ])
    const ps = await puertosDeReintento(db as never, ENV).partes({ id: CAMPANA, client_id: CLIENTE, sala_ref: null })
    expect(ps.map((p) => p.id).sort()).toEqual([PARTE, '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777'].sort())
    expect(ps.filter((p) => p.valido).map((p) => p.id)).toEqual([PARTE])
  })
  it('un parte de OTRO cliente con la misma campaña no se mezcla', async () => {
    const db = mundo().semilla('client_historical_outputs', [{ ...parte('44444444-4444-4444-4444-444444444444', `${CAMPANA}:2026-W44:2`), client_id: 'otro-cliente' }])
    expect((await puertosDeReintento(db as never, ENV).partes({ id: CAMPANA, client_id: CLIENTE, sala_ref: null })).map((p) => p.id)).toEqual([PARTE])
  })
  it('solo cuentan los encargos REALES (un encargo de ensayo no es una pieza)', async () => {
    const db = mundo().semilla('oficina_encargos', [{ id: 'e1', parte_id: PARTE, brief_id: 'BRF-0001', dry_run: false }, { id: 'e2', parte_id: PARTE, brief_id: 'BRF-0004', dry_run: true }, { id: 'e3', parte_id: 'otro', brief_id: 'BRF-0004', dry_run: false }])
    expect([...(await puertosDeReintento(db as never, ENV).briefsConEncargo(PARTE))]).toEqual(['BRF-0001'])
  })
  it('la plantilla activa se lee de la tabla; una desconocida es inactiva', async () => {
    const P = puertosDeReintento(mundo() as never, ENV)
    expect(await P.plantillaActiva('carrusel_ig_v1')).toBe(true); expect(await P.plantillaActiva('kit_historias')).toBe(false); expect(await P.plantillaActiva('inventada')).toBe(false)
  })
  it('un error de la base se lanza (no se lee como «no hay partes»)', async () => {
    const db = mundo(); db.fallar['client_historical_outputs'] = 'caída'
    await expect(puertosDeReintento(db as never, ENV).partes({ id: CAMPANA, client_id: CLIENTE, sala_ref: null })).rejects.toThrow(/caída/)
    const e = mundo(); e.fallar['oficina_encargos'] = 'caída'
    await expect(puertosDeReintento(e as never, ENV).briefsConEncargo(PARTE)).rejects.toThrow(/caída/)
  })
  it('las fechas del calendario viajan; si el calendario no se puede leer, los sobres salen sin fecha (no frena)', async () => {
    const P = puertosDeReintento(mundo() as never, ENV)
    expect((await P.cuando(CAMPANA)).get('s1-d1-lun_ig')).toEqual({ fecha: '2026-10-26', hora: '09:00' })
    cad.filasFalla = true; expect((await P.cuando(CAMPANA)).size).toBe(0)
  })
})

describe('el pre-vuelo real de láminas (las mismas lecturas que la puerta)', () => {
  const marcaOk = JSON.stringify({ visual: { version: 1, capa_grafica: { paleta: [{ color: '#112233', rol: 'principal' }] } } })
  const con = (cliente: Record<string, unknown> | null, manual: Record<string, unknown> | null) => {
    const db = mundo()
    if (cliente) db.semilla('clients', [{ id: CLIENTE, config: {}, ...cliente }])
    if (manual) db.semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, ...manual }])
    return puertosDeReintento(db as never, ENV)
  }
  it('post_img (no dibuja láminas) no lee nada y pasa', async () => {
    const db = mundo(); db.fallar['clients'] = 'caída'
    expect(await puertosDeReintento(db as never, ENV).previueloDeLaminas(CLIENTE, 'post_img')).toEqual({ ok: true })
  })
  it('post_img pasa aunque el cliente NO tenga ni colores ni slug (solo las láminas los exigen)', async () => {
    expect(await con({ slug: null }, { primary_colors: [], content_text: '{}' }).previueloDeLaminas(CLIENTE, 'post_img')).toEqual({ ok: true })
  })
  it('carrusel/kit: sin colores en NINGÚN lado → sin_identidad_visual (el caso de la ficha solo con Instagram)', async () => {
    for (const f of ['carrusel_ig_v1', 'kit_historias']) expect(await con({ slug: 'zr' }, { primary_colors: [], typography: {}, content_text: JSON.stringify({ visual: { capa_grafica: { paleta: [] } } }) }).previueloDeLaminas(CLIENTE, f)).toEqual({ ok: false, motivo: 'sin_identidad_visual' })
  })
  it('con colores solo en el bloque visual (columnas vacías) y slug → pasa; sin slug → sin_slug', async () => {
    expect(await con({ slug: 'zr' }, { primary_colors: [], content_text: marcaOk }).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: true })
    expect(await con({ slug: null }, { primary_colors: [], content_text: marcaOk }).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: false, motivo: 'sin_slug' })
    expect(await con({ slug: '' }, { content_text: marcaOk }).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: false, motivo: 'sin_slug' })
  })
  it('el respaldo de la ficha (brand_colors) también cuenta', async () => {
    expect(await con({ slug: 'zr', brand_colors: [{ hex: '#abcdef' }] }, { primary_colors: [] }).previueloDeLaminas(CLIENTE, 'kit_historias')).toEqual({ ok: true })
  })
  it('una lectura que falla o filas que faltan NO bloquean (la puerta decide)', async () => {
    expect(await con(null, null).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: true })
    expect(await con({ slug: 'zr' }, null).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: true })
    const db = mundo(); db.semilla('clients', [{ id: CLIENTE, slug: 'zr' }]); db.semilla('client_brand_books', [{ client_id: CLIENTE, version: 1 }]); db.fallar['client_brand_books'] = 'caída'
    expect(await puertosDeReintento(db as never, ENV).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: true })
  })
  it('lee el manual VIGENTE (el de mayor versión)', async () => {
    const db = mundo(); db.semilla('clients', [{ id: CLIENTE, slug: 'zr', config: {} }]); db.semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, primary_colors: [] }, { client_id: CLIENTE, version: 2, primary_colors: ['#112233'] }])
    expect(await puertosDeReintento(db as never, ENV).previueloDeLaminas(CLIENTE, 'carrusel_ig_v1')).toEqual({ ok: true })
  })
})

describe('de punta a punta con los datos de la tercera prueba', () => {
  it('sin encargos y con 20 min: reintenta el carrusel (plantilla activa) y la historia NO (plantilla apagada); anota la libreta', async () => {
    const db = mundo()
    const r = await reintentoDeLaCadena(db as never, ENV, { ejecutar: true }, () => reloj)
    expect(r).toMatchObject({ accion: 'vigilado', emitidos: 1 })
    expect(cad.emitidos.map((s) => s.idempotency_key)).toEqual([`${PARTE}:BRF-0001:producir:r1`])
    expect((cad.config.reintentos_piezas as Record<string, { n: number }>)[`${PARTE}:BRF-0001`].n).toBe(1)
  })
  it('con la historia también activa salen las dos, cada una con su fila y su fecha', async () => {
    const db = mundo(); db.tablas['oficina_tipos_de_grupo'].find((t) => t.tipo === 'kit_historias')!.activo = true
    await reintentoDeLaCadena(db as never, ENV, { ejecutar: true }, () => reloj)
    expect(cad.emitidos.map((s) => s.payload.brief_id)).toEqual(['BRF-0001', 'BRF-0004'])
    expect(cad.emitidos[0].payload).toMatchObject({ fila_id: 's1-d1-lun_ig', fecha: '2026-10-26', hora: '09:00', familia: 'carrusel_ig_v1' })
  })
  it('apagado: no emite, no anota; en seco: da el plan y no toca nada aunque el interruptor esté apagado', async () => {
    const db = mundo(); cad.config.reintento_piezas = false
    expect(await reintentoDeLaCadena(db as never, ENV, { ejecutar: true }, () => reloj)).toMatchObject({ accion: 'apagado' })
    const seco = await reintentoDeLaCadena(db as never, ENV, { ejecutar: false }, () => reloj)
    expect(seco).toMatchObject({ accion: 'en_seco', interruptor: false }); expect((seco as { plan: unknown[] }).plan.length).toBeGreaterThan(0)
    expect(cad.emitidos).toHaveLength(0); expect(cad.config.reintentos_piezas).toBeUndefined()
  })
  it('NUNCA lanza dentro del vigía: un fallo de la base vuelve como {accion:\'error\'}', async () => {
    const db = mundo(); db.fallar['client_historical_outputs'] = 'caída'
    const r = await reintentoDeLaCadena(db as never, ENV, { ejecutar: true }, () => reloj)
    expect(r).toMatchObject({ accion: 'error' }); expect((r as { detalle: string }).detalle).toMatch(/caída/)
  })
  it('el aviso va al hilo de #oficina-creativa (canal fijo por omisión) y un fallo de Slack no lanza', async () => {
    const llamadas: Array<{ url: string; body: string }> = []
    const f = vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string, init?: { body?: string }) => { llamadas.push({ url: String(url), body: String(init?.body ?? '') }); return new Response('{"ok":true}') }) as never)
    try {
      await puertosDeReintento(mundo() as never, ENV).avisar('hola')
      expect(llamadas).toHaveLength(1); expect(llamadas[0].url).toBe('https://slack.com/api/chat.postMessage'); expect(JSON.parse(llamadas[0].body)).toMatchObject({ channel: 'C0C7XUKNCLS', text: 'hola' })
      f.mockImplementation((async () => { throw new Error('sin red') }) as never)
      await expect(puertosDeReintento(mundo() as never, ENV).avisar('hola')).resolves.toBeUndefined()
      await puertosDeReintento(mundo() as never, {}).avisar('sin token'); expect(f).toHaveBeenCalledTimes(2)   // sin token no llama
    } finally { f.mockRestore() }
  })
})
