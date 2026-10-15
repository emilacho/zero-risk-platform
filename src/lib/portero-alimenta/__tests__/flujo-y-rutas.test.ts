/**
 * El flujo (JSON ARREGLADO, nunca aplicado) y los archivos de ruta: nacen APAGADOS, exigen llave, reutilizan lo de hoy sin tocarlo y se pueden revertir.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { POST as descubrirPOST } from '../../../app/api/brain/alimentar/descubrir/route'
import { POST as alimentarPOST } from '../../../app/api/brain/alimentar/procesar/route'
import { rutaArticulos, resultadosDeBusqueda, leerBusqueda, LECTOR_DE_BUSQUEDA } from '../rutas'
import { crearBaseFalsa } from './base-falsa'

const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/ogfq56oIEoHufFPM')
const cargar = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as { nodes: Array<{ name: string; type: string; parameters: Record<string, unknown>; position: number[] }>; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean; name: string }
const ANTES = cargar('ogfq56oIEoHufFPM-ANTES-2026-10-14.json')
const DESPUES = cargar('ogfq56oIEoHufFPM-ARREGLADO-alimenta-2026-10-14.json')

describe('el flujo ARREGLADO', () => {
  it('queda INACTIVO y su respaldo ANTES también (nada se encendió)', () => {
    expect(ANTES.active).toBe(false)
    expect(DESPUES.active).toBeUndefined() // el cuerpo de actualización no lleva `active`: no se enciende por actualizarlo
    const body = JSON.stringify(DESPUES)
    expect(body).not.toMatch(/"active"\s*:\s*true/)
  })
  it('reutiliza sin tocar los nodos de hoy (mismo código y mismos parámetros)', () => {
    for (const n of ['Webhook · a mano (con llave)', 'Horario diario 08:30 (hora de n8n)', '⓪ Entrada', '① Un elemento por cliente', '② Ampliar (Servicio de Apify)']) {
      const a = ANTES.nodes.find((x) => x.name === n)!
      const d = DESPUES.nodes.find((x) => x.name === n)!
      expect(d, n).toBeDefined()
      expect(d.parameters, n).toEqual(a.parameters)
    }
  })
  it('todas las conexiones apuntan a nodos que existen y el recorrido es lineal de la entrada al cierre', () => {
    const nombres = new Set(DESPUES.nodes.map((n) => n.name))
    for (const [de, v] of Object.entries(DESPUES.connections)) { expect(nombres.has(de), de).toBe(true); for (const b of v.main) for (const t of b) expect(nombres.has(t.node), t.node).toBe(true) }
    const orden: string[] = []
    let actual = '⓪ Entrada'
    while (actual && orden.length < 30) { orden.push(actual); actual = DESPUES.connections[actual]?.main[0]?.[0]?.node as string }
    expect(orden).toEqual(['⓪ Entrada', '① Clientes activos', '① Un elemento por cliente', '① Descubrir (el portero que alimenta)', '① Plan unificado', '② Ampliar (Servicio de Apify)', '② bis Artículos (qué leer)', '② bis Leer artículos (Servicio de Apify)', '② ter Reseñas y videos (qué pedir)', '② ter Leer reseñas y videos (Servicio de Apify)', '④ Alimentar (filtrar · razonar · archivar)', '④ bis Puente (repetir hasta terminar)', '⑤ Cierre'])
  })
  it('los nodos nuevos entran por Vercel con la llave interna y nunca piden la llave de despacho', () => {
    const nuevos = DESPUES.nodes.filter((n) => /alimentar\/(descubrir|procesar)/.test(String(n.parameters.url ?? '')))
    expect(nuevos).toHaveLength(5)
    for (const n of nuevos) expect(JSON.stringify(n.parameters)).toContain('$env.INTERNAL_API_KEY')
    const nuevoCodigo = DESPUES.nodes.filter((n) => /Plan unificado|Leer artículos|Cierre/.test(n.name)).map((n) => String(n.parameters.jsCode)).join('\n')
    expect(nuevoCodigo).not.toMatch(/SALA_DISPATCH_KEY/)
  })
  it('con dry_run no se llama a ningún proveedor y los códigos nuevos compilan', () => {
    const leer = String(DESPUES.nodes.find((n) => /Leer artículos/.test(n.name))!.parameters.jsCode)
    expect(leer).toMatch(/e\.dry_run === true/)
    expect(leer).toContain("'#articulo'")
    for (const n of DESPUES.nodes) if (typeof n.parameters.jsCode === 'string') expect(() => new Function('$input', '$', '$env', '$workflow', '$execution', `return (async () => {${n.parameters.jsCode}})`), n.name).not.toThrow()
  })
  it('lo viejo sin lector está RETIRADO del flujo: ni ③ Pedido/③ Correr ni ninguna llamada a /api/brain/diario/*', () => {
    const nombres = DESPUES.nodes.map((n) => n.name)
    expect(nombres.some((n) => /③ (Pedido a correr|Correr)/.test(n))).toBe(false)
    expect(JSON.stringify(DESPUES.nodes)).not.toMatch(/brain\/diario|cerebro_oportunidades|cerebro_vigilancia|cerebro_avisos/)
  })
  it('el puente se repite por pasadas hasta que no quede nada (tope de vueltas) y nunca llama a Apify ni al modelo', () => {
    const n = DESPUES.nodes.find((x) => /Puente/.test(x.name))!
    const js = String(n.parameters.jsCode)
    expect(js).toContain('/api/brain/alimentar/puente')
    expect(js).toMatch(/v < 12/)
    expect(js).toMatch(/p\.quedan > 0/)
    expect(js).toMatch(/e\.dry_run !== true/)
    expect(js).not.toMatch(/apify-service|run-sdk/)
  })
  it('el nombre del flujo cabe en n8n (≤ 128 caracteres)', () => { expect(DESPUES.name.length).toBeLessThanOrEqual(128) })
  it('lo que va a la ruta lleva dry_run y los ids del flujo (guardarraíl 6)', () => {
    for (const n of DESPUES.nodes.filter((x) => /alimentar\/(descubrir|procesar)/.test(String(x.parameters.url ?? '')))) {
      const b = String(n.parameters.jsonBody)
      expect(b).toContain('dry_run')
      expect(b).toContain('workflow_id')
      expect(b).toContain('workflow_execution_id')
    }
  })
})

describe('el portero NO empuja: las oficinas buscan (firma 14-oct)', () => {
  const raiz = path.resolve(__dirname, '../../../')
  const archivos = [
    ...fs.readdirSync(path.resolve(__dirname, '..')).filter((f) => f.endsWith('.ts')).map((f) => path.resolve(__dirname, '..', f)),
    path.join(raiz, 'app/api/brain/alimentar/descubrir/route.ts'), path.join(raiz, 'app/api/brain/alimentar/procesar/route.ts'),
  ]
  it('ningún archivo del portero que alimenta llama a la jefatura, a la oficina ni a la sala, ni importa su código', () => {
    for (const f of archivos) {
      const t = fs.readFileSync(f, 'utf8').split(String.fromCharCode(10)).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10))
      expect(t, f).not.toMatch(/\/api\/(jefatura|oficina|sala)|lib\/(jefatura|oficina|sala)|from '[^']*\/(jefatura|oficina|sala)[/']/)
    }
  })
  it('el flujo no tiene ningún nodo que avise o despierte a las oficinas', () => {
    const urls = DESPUES.nodes.map((n) => String(n.parameters.url ?? '')).filter(Boolean)
    expect(urls.some((u) => /jefatura|oficina|sala/i.test(u))).toBe(false)
    expect(JSON.stringify(DESPUES.nodes.map((n) => n.parameters.jsCode ?? ''))).not.toMatch(/jefatura-turno|oficina-turno|zero-risk\/portero|api\/oficina|api\/jefatura/)
  })
})

describe('los archivos de ruta', () => {
  const guardado = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { if (guardado === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = guardado })
  const pedir = (cabeceras: Record<string, string>, cuerpo: unknown) => new Request('https://x.test/api/brain/portero/x', { method: 'POST', headers: { 'content-type': 'application/json', ...cabeceras }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
  for (const [nombre, POST] of [['descubrir', descubrirPOST], ['alimentar', alimentarPOST]] as const) {
    it(`${nombre}: sin llave interna → 401 antes de leer nada`, async () => {
      const r = await POST(pedir({}, { dry_run: true, client_id: '11111111-1111-4111-8111-111111111111' }))
      expect(r.status).toBe(401)
    })
    it(`${nombre}: con llave y JSON roto → 400; con llave y sin dry_run → 400 (el interruptor apagado no lo salta)`, async () => {
      expect((await POST(pedir({ 'x-api-key': 'llave-de-prueba' }, '{no es json'))).status).toBe(400)
    })
  }
})

describe('la segunda tanda (artículos)', () => {
  const C = '11111111-1111-4111-8111-111111111111'
  const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }
  const tablas = () => ({
    clients: [{ id: C, name: 'Casa Yoga Luna', website_url: 'https://casayogaluna.example' }],
    apify_raw: [
      { id: 's1', client_id: C, apify_function: 'google_serp_scraper', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: [{ organicResults: [
        { url: 'https://casayogaluna.example/blog', title: 'Casa Yoga Luna blog' },
        { url: 'https://diario.example/nota', title: 'Casa Yoga Luna abre salón', description: 'en Montevideo' },
        { url: 'https://diario.example/otra', title: 'Otro negocio' },
        { url: 'https://www.instagram.com/casayogaluna', title: 'Casa Yoga Luna' },
      ] }] },
      { id: 'w0', client_id: C, apify_function: 'website_content_scraper', ensayo: false, created_at: '2026-10-15T08:00:00Z', params: { startUrls: [{ url: 'https://diario.example/vieja' }] }, respuesta: [] },
    ],
    costs: [], agent_invocations: [],
  })
  it('elige solo páginas de terceros que nombran al cliente, con la marca de tercero y dentro del tope', async () => {
    const base = crearBaseFalsa(tablas() as never)
    const r = await rutaArticulos({ db: base.db, interruptores: ON, ahora: new Date('2026-10-16T10:00:00Z') }, { client_id: C, dry_run: true })
    expect(r.status).toBe(200)
    expect((r.body.acciones as Array<{ objetivo: string; metadata: { target_kind: string } }>).map((a) => a.objetivo)).toEqual(['https://diario.example/nota'])
    expect((r.body.acciones as Array<{ metadata: { target_kind: string } }>)[0].metadata.target_kind).toBe('third_party')
    expect(base.escrituras).toEqual([])
  })
  it('sin lugar en el tope no pide nada y dice por qué', async () => {
    const t = tablas()
    ;(t.costs as unknown[]).push({ service: 'apify:own_google_maps_profile', amount_usd: 2.99, created_at: '2026-10-16T09:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C }) })
    const base = crearBaseFalsa(t as never)
    const r = await rutaArticulos({ db: base.db, interruptores: ON, ahora: new Date('2026-10-16T10:00:00Z') }, { client_id: C, dry_run: true })
    expect(r.body.acciones).toEqual([])
    expect(JSON.stringify(r.body.omitidas)).toMatch(/no cabe en el tope/)
  })
  it('apagado: no lee nada', async () => {
    const base = crearBaseFalsa(tablas() as never)
    const r = await rutaArticulos({ db: base.db, interruptores: { ...ON, alimentar: false } }, { client_id: C, dry_run: true })
    expect(r.body.apagado).toBe(true)
    expect(base.lecturas).toEqual([])
  })
  it('H4 · el lector del buscador es tolerante: varias formas, varios nombres de campo, y lo que no entiende se CUENTA (no se inventa)', () => {
    const { resultados, ilegibles } = leerBusqueda([
      { respuesta: [{ organicResults: [{ url: 'https://a.example/1', title: 'A', description: 'da' }] }, { url: 'https://b.example/2', title: 'B' }] },
      { respuesta: { results: [{ link: 'https://c.example/3', name: 'C', snippet: 'sc' }, { href: 'https://d.example/4' }] } },
      { respuesta: [{ searchResults: [{ items: [{ url: 'https://e.example/5' }] }] }] },
      { respuesta: [{ url: 'no es una direccion' }, { title: 'sin direccion' }] },
      { respuesta: null },
    ])
    expect(resultados.map((r) => r.url)).toEqual(['https://a.example/1', 'https://b.example/2', 'https://c.example/3', 'https://d.example/4', 'https://e.example/5'])
    expect(resultados[2]).toMatchObject({ title: 'C', description: 'sc' })
    expect(ilegibles).toBe(2)
    expect(resultadosDeBusqueda([{ respuesta: [{ url: 'https://z.example' }] }]).map((x) => x.url)).toEqual(['https://z.example'])
    expect(LECTOR_DE_BUSQUEDA.verificado_con_salida_real).toBe(true)
  })
  it('H4 · la segunda tanda dice cuántas filas y cuántos resultados ilegibles vio, y que el lector está verificado con una salida real', async () => {
    const t = tablas()
    ;(t.apify_raw as Array<Record<string, unknown>>).push({ id: 's2', client_id: C, apify_function: 'google_serp_scraper', ensayo: false, created_at: '2026-10-16T08:05:00Z', respuesta: [{ rareza: 'forma desconocida' }] })
    const base = crearBaseFalsa(t as never)
    const r = await rutaArticulos({ db: base.db, interruptores: ON, ahora: new Date('2026-10-16T10:00:00Z') }, { client_id: C, dry_run: true })
    expect(r.body).toMatchObject({ filas_de_busqueda: 2, resultados_ilegibles: 1, lector_de_busqueda: { verificado_con_salida_real: true } })
  })
})
