/**
 * PERFIL DEL PÚBLICO · NO RASPA (firma de Emilio 18-nov 00:56 · RESPUESTA-LENOVO-a-CC3-perfil-del-publico-sin-raspar · la certifica CC6).
 * Una corrida REAL (no ensayo, palanca encendida) con las dependencias REALES de la puerta: lo único de afuera son la base, la consulta del
 * cerebro, el filtro, el redactor y la red, que son dobles. La prueba es lo que NO pasa: ninguna llamada al Servicio de Apify, ninguna lectura
 * de lo crudo de Apify, ninguna escritura de voces propias. La voz llega SOLO por la consulta del cerebro. US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CLIENTE = '11111111-1111-4111-8111-111111111111'
const uuid = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`
const FRASES = ['el café está de lujo y la tostada con tomate es la mejor del barrio', 'siempre pido el cortado de avena antes de currar', 'un sitio muy majo para currar con el portátil']
const fichas = (clase: string, n: number, desde: number) =>
  Array.from({ length: n }, (_, i) => ({ ficha_id: uuid(desde + i), clase, contenido: `${FRASES[i % FRASES.length]} número ${desde + i}`, fecha_de_la_fuente: '2026-10-01' }))

const h = vi.hoisted(() => ({
  tablas: [] as string[],
  escrituras: [] as string[],
  consultas: [] as Array<Record<string, unknown>>,
  resultados: [] as unknown[],
  redactor: [] as string[],
  estado: 200,
  pagina: 300,
  noJunta: [] as string[],
}))
vi.mock('@/lib/supabase', () => {
  const DATOS: Record<string, unknown[]> = {
    agents: [{ name: 'feedback-synthesizer', is_active: true }],
    clients: [{ industry: 'cafetería', market: 'Madrid', country: 'España' }],
    client_icp_documents: [{ id: 'p-cafe', audience_segment: 'Vecinos que desayunan fuera', segment_priority: 1, job_titles: [], company_size: null, industries: [], geography: 'Madrid, España' }],
  }
  const consulta = (t: string) => {
    h.tablas.push(t)
    const o: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in', 'contains']) o[m] = () => o
    for (const m of ['insert', 'upsert', 'update', 'delete']) o[m] = () => { h.escrituras.push(`${m}:${t}`); return o }
    o.then = (ok: (x: unknown) => unknown) => ok({ data: DATOS[t] ?? [], error: null })
    return o
  }
  return { getSupabaseAdmin: () => ({ from: consulta }) }
})
vi.mock('@/lib/cadena/almacen-supabase', () => ({ almacenDeSupabase: () => ({ leerConfig: async () => ({ encendida: true, clientes: [CLIENTE] }) }) }))
vi.mock('@/lib/portero-alimenta/consultar', () => ({
  // el doble se porta como la consulta real (consultar.ts): sin `todo` entrega 10 y no pagina; con `todo`, páginas (`desde` + `siguiente_desde`);
  // sin `contenido_completo` recorta cada ficha a 700 letras
  rutaConsultar: async (_ctx: unknown, pedido: Record<string, unknown>) => {
    h.consultas.push(pedido)
    if (h.estado !== 200) return { status: h.estado, body: { error: 'portero_caido' } }
    const desde = pedido.todo === true ? Number(pedido.desde ?? 0) : 0
    const tam = pedido.todo === true ? h.pagina : 10
    const trozo = (h.resultados as Array<Record<string, unknown>>).slice(desde, desde + tam).map((f) => {
      const t = String(f.contenido)
      return pedido.contenido_completo === true || t.length <= 700 ? f : { ...f, contenido: `${t.slice(0, 700)}…` }
    })
    const hay = pedido.todo === true && desde + tam < h.resultados.length
    // 18-nov · con `publico` (#1167) se porta como el cerebro: declara las clases del tipo y lo que no junta
    const voz = pedido.publico === 'consumo' ? { voz_del_publico: { publico: 'consumo', clases_del_publico: ['resenas', 'comentarios', 'mencion', 'competidor_comentarios'], fuentes_que_el_cerebro_no_junta: h.noJunta } } : {}
    return { status: 200, body: { resultados: trozo, siguiente_desde: hay ? desde + tam : null, ...voz } }
  },
}))
vi.mock('@/lib/ingress-filter', () => ({ DEFAULT_ROUTE_POLICY: {}, runIngressFilter: async () => ({ allow: true }) }))
vi.mock('@/lib/finanzas/conversa/modelo-run-sdk', () => ({
  baseDeRunSdk: () => 'https://plataforma.test',
  modeloRunSdk: () => ({ invocar: async (p: { tarea: string }) => { h.redactor.push(p.tarea); return { ok: true, salida: `## Cómo habla\n- «cortado de avena» [voz:${uuid(2)}]`, costo_usd: 0.1 } } }),
}))

import { correrPerfil } from '@/lib/perfil-del-publico/corrida'
import { dependenciasReales } from '@/lib/perfil-del-publico/dependencias'

const PUERTA_DE_APIFY = 'https://servicio-apify.test/webhook/apify'
const red = vi.fn(async (_url: string | URL | Request) => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
const correr = () => correrPerfil(dependenciasReales({ client_id: CLIENTE, workflow_id: 'wf-perfil', workflow_execution_id: 'ex-1', idioma: null, trato: null }), { client_id: CLIENTE, dry_run: false, workflow_id: 'wf-perfil', workflow_execution_id: 'ex-1' })
const urls = () => red.mock.calls.map((c) => String(c[0]))

describe('el perfil del público NO raspa: lee la voz del público solo del cerebro', () => {
  beforeEach(() => {
    h.tablas.length = 0; h.escrituras.length = 0; h.consultas.length = 0; h.redactor.length = 0; h.estado = 200; h.pagina = 300; h.noJunta = []
    red.mockClear()
    vi.stubGlobal('fetch', red)
    vi.stubEnv('APIFY_SERVICE_WEBHOOK_URL', PUERTA_DE_APIFY)
    vi.stubEnv('INTERNAL_API_KEY', 'llave-de-prueba')
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('🔴 con la muestra en el cerebro: redacta y archiva, sin una sola llamada al Servicio de Apify ni lectura de lo crudo', async () => {
    h.resultados = [...fichas('resenas', 40, 1), ...fichas('comentarios', 30, 100)]
    const r = await correr()
    expect(r).toMatchObject({ estado: 'hecho', llamadas_al_redactor: 1, voces_del_cerebro: 70, archivado: { ok: true } })
    // la red: SOLO la puerta de informes del cerebro (archivar)
    expect(urls()).toEqual(['https://plataforma.test/api/brain/alimentar/informe'])
    expect(urls().some((u) => /apify/i.test(u))).toBe(false)
    // la base: nada de lo crudo de Apify ni de una tabla de voces propia; y ninguna escritura
    expect(h.tablas.filter((t) => /apify|perfil_publico_voces/.test(t))).toEqual([])
    expect(h.escrituras).toEqual([])
    // la voz llegó por la consulta del cerebro, pedida por TIPO de público (#1167): el cerebro elige las clases; sin `que` ni `clase`
    expect(h.consultas).toHaveLength(1)
    expect(h.consultas[0]).toMatchObject({ publico: 'consumo', agente: 'feedback-synthesizer' })
    expect(h.consultas[0]).not.toHaveProperty('clase')
    expect(h.consultas[0]).not.toHaveProperty('que')
    expect(h.redactor[0]).toContain(`[voz:${uuid(2)}]`)
  })
  it('🔴 lo que el cerebro declara que NO junta llega a la fuente faltante (por el camino real de la consulta)', async () => {
    h.resultados = fichas('resenas', 20, 1)
    h.noJunta = ['directorios']
    const r = await correr()
    expect(r.publicos[0].fuentes_faltantes).toEqual(['cerebro:comentarios', 'cerebro:mencion', 'cerebro:competidor_comentarios', 'directorios'])
  })
  it('🔴 sin muestra en el cerebro: NO sale a buscarla · declara la fuente faltante, no redacta y no llama a nadie', async () => {
    h.resultados = fichas('resenas', 20, 1)
    const r = await correr()
    expect(r.publicos[0]).toMatchObject({ estado: 'muestra_insuficiente', fuentes_faltantes: expect.arrayContaining(['cerebro:comentarios', 'cerebro:mencion']) })
    expect(r.cortes.join(' ')).toMatch(/fuente faltante: .*el cerebro todavía no la tiene/)
    expect(red).not.toHaveBeenCalled()
    expect(h.redactor).toEqual([])
    expect(h.tablas.filter((t) => /apify/.test(t))).toEqual([])
  })
  it('🔴 CC7 (d02·d04·d05) · pide TODO, con el contenido completo, y sigue las páginas: con 320 fichas llegan las 320 (la página 2 también)', async () => {
    h.resultados = [...fichas('resenas', 200, 1), ...fichas('comentarios', 120, 300)]
    const r = await correr()
    expect(h.consultas).toHaveLength(2)
    expect(h.consultas[0]).toMatchObject({ todo: true, contenido_completo: true, desde: 0 })
    expect(h.consultas[1]).toMatchObject({ todo: true, contenido_completo: true, desde: 300 })
    expect(r.voces_del_cerebro).toBe(320)
    expect(r.cortes.join(' ')).not.toMatch(/el cerebro tiene más/)
  })
  it('sin `todo` la consulta entregaría 10 fichas: con 70 en el cerebro, el perfil igual las lee todas y redacta', async () => {
    h.resultados = [...fichas('resenas', 40, 1), ...fichas('comentarios', 30, 100)]
    const r = await correr()
    expect(r).toMatchObject({ voces_del_cerebro: 70, llamadas_al_redactor: 1 })
  })
  it('🔴 el tope de páginas NO corta callado: si se agota y el cerebro tiene más, queda en `cortes`', async () => {
    h.pagina = 3
    h.resultados = fichas('resenas', 70, 1)
    const r = await correr()
    expect(h.consultas).toHaveLength(20)
    expect(r.voces_del_cerebro).toBe(60)
    expect(r.cortes).toContain('se leyeron 60 voces en 20 páginas y el cerebro tiene más: el perfil usa solo esas')
  })
  it('🔴 CC7 g3 · con el tope de páginas agotado, lo que el cerebro declara que no junta igual llega a la fuente faltante', async () => {
    h.pagina = 3
    h.resultados = fichas('resenas', 70, 1)
    h.noJunta = ['directorios']
    const r = await correr()
    expect(h.consultas).toHaveLength(20)
    expect(r.publicos[0].fuentes_faltantes).toContain('directorios')
  })
  it('🔴 la consulta al cerebro CAÍDA no se lee como «cerebro vacío»: la corrida falla diciendo por qué, sin redactar ni declarar fuentes faltantes falsas', async () => {
    h.estado = 503
    await expect(correr()).rejects.toThrow(/el portero no contestó la consulta \(503 portero_caido\)/)
    expect(red).not.toHaveBeenCalled()
    expect(h.redactor).toEqual([])
  })
  it('el código del perfil no conoce ninguna puerta ni tabla de Apify (si alguien la vuelve a cablear, esto lo ve)', () => {
    const dir = path.join(process.cwd(), 'src/lib/perfil-del-publico')
    const archivos = [...fs.readdirSync(dir).filter((a) => a.endsWith('.ts')).map((a) => path.join(dir, a)), path.join(process.cwd(), 'src/app/api/perfil-del-publico/route.ts')]
    for (const a of archivos) {
      const src = fs.readFileSync(a, 'utf8')
      expect(src, a).not.toMatch(/APIFY_SERVICE_WEBHOOK_URL|apify_raw|@\/lib\/apify|from '\.\.\/apify|perfil_publico_voces|leerUsoDelMes|creditoDeApify/)
    }
  })
  it('control: la prueba de red ve una llamada a Apify si existiera (si no la viera, todo lo anterior sería ciego)', async () => {
    await fetch(PUERTA_DE_APIFY, { method: 'POST' })
    expect(urls().some((u) => /apify/i.test(u))).toBe(true)
  })
})
