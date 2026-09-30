/**
 * PLANEACIÓN · LA ANALÍTICA PROPIA ES DE CUALQUIER CLIENTE · lo que no se buscó se declara · el filtro del brazo · CC#1 · 2026-09-30
 * Decisiones de Emilio: (1) el criterio para pedir la analítica es si el sitio tiene datos, no a quién le vende el cliente;
 * (2) el plan DECLARA los brazos descartados con su motivo; (3) los eventos de conducta no llevan el dominio ⇒ se arregla el filtro;
 * (4) el comentario viejo «14 visitas» se corrige. Corre el CÓDIGO EXACTO de los nodos (antes y después) y el brazo real con PostHog simulado.
 *
 * 🔴 Cada rojo se prueba contra el defecto real: el mismo caso corrido con el código «ANTES» tiene que dar el resultado viejo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'X9F0zp6LQ2xGEYVS')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const ANTES = JSON.parse(readFileSync(join(DIR, 'planeacion-antes-analitica-2026-09-30.json'), 'utf8'))
const { construir, ELEGIR, VUELTA, REDACTOR } = await import(pathToFileURL(join(DIR, 'construir-analitica-propia-2026-09-30.mjs')).href)
const DESPUES = construir(ANTES)
const codigo = (flujo: { nodes: Array<{ name: string; parameters: { jsCode?: string } }> }, nombre: string) =>
  String(flujo.nodes.find((n) => n.name === nombre)!.parameters.jsCode)

async function correr(js: string, entrada: unknown, refs: Record<string, unknown> = {}) {
  const items = [{ json: entrada }]
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => {
    if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n)
    const v = refs[n]
    const arr = Array.isArray(v) ? v : [v]
    return { first: () => ({ json: arr[0] }), all: () => arr.map((j) => ({ json: j })) }
  }
  const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', js)
  return fn($input, $, {}, items[0].json, { id: 'WF' }, { id: '1' })
}
const elegir = async (flujo: typeof ANTES, ficha: Record<string, unknown>) => {
  const [{ json }] = await correr(codigo(flujo, ELEGIR), { ...ficha }, { 'Competidores del cliente': [] })
  return json as { pedidos: Array<{ brazo: string; objetivo: string; params: Record<string, unknown> }>; descartados: Array<{ objetivo: string; motivo: string }> }
}
const pide = (r: Awaited<ReturnType<typeof elegir>>, o: string) => r.pedidos.some((p) => p.objetivo === o)
const motivoDe = (r: Awaited<ReturnType<typeof elegir>>, o: string) => r.descartados.find((d) => d.objetivo === o)?.motivo

const FICHA = (over: Record<string, unknown> = {}) => ({
  id: '41dd3d62-d6de-4c9a-9996-6df78c1da118', name: 'Náufrago', industry: 'restaurante', website_url: 'https://naufrago.ec', country: 'Ecuador', ...over,
})

describe('① la analítica propia se pide a CUALQUIER cliente que tenga un dominio propio', () => {
  it('🔴 un restaurante (no le vende a empresas) con sitio propio ⇒ PIDE analitica_propia · el código de ANTES la descartaba («lo pidió sólo quien le vende a empresas»)', async () => {
    const antes = await elegir(ANTES, FICHA())
    expect(pide(antes, 'analitica_propia')).toBe(false)
    expect(motivoDe(antes, 'analitica_propia')).toMatch(/sólo quien le vende a empresas/)
    const despues = await elegir(DESPUES, FICHA())
    expect(pide(despues, 'analitica_propia')).toBe(true)
    const p = despues.pedidos.find((x) => x.objetivo === 'analitica_propia')!
    expect(p.brazo).toBe('posthog')
    expect(p.params).toMatchObject({ dominio: 'naufrago.ec' })
    expect(despues.descartados.some((d) => d.objetivo === 'analitica_propia')).toBe(false)
  })
  it.each([
    ['gimnasio', 'gimnasio de barrio'],
    ['turismo', 'turismo · surf'],
    ['consultora B2B', 'consultora b2b'],
    ['sin rubro cargado', 'unknown'],
    ['vacío', ''],
  ])('la pide sea cual sea el rubro · %s', async (_n, industry) => {
    expect(pide(await elegir(DESPUES, FICHA({ industry })), 'analitica_propia')).toBe(true)
  })
  it('🔴 «sin rubro» ya no la descarta por no saber a qué se dedica (antes: «no se pudo decidir»)', async () => {
    const antes = await elegir(ANTES, FICHA({ industry: 'unknown' }))
    expect(motivoDe(antes, 'analitica_propia')).toMatch(/no dice a qué se dedica/)
    expect(pide(await elegir(DESPUES, FICHA({ industry: 'unknown' })), 'analitica_propia')).toBe(true)
  })
  it('sin sitio en la ficha ⇒ NO sale y dice QUÉ falta (el dato, no el rubro)', async () => {
    const r = await elegir(DESPUES, FICHA({ website_url: null }))
    expect(pide(r, 'analitica_propia')).toBe(false)
    expect(motivoDe(r, 'analitica_propia')).toMatch(/sin sitio en la ficha no hay dominio/)
  })
  it('🔴 el campo del sitio trae una RED SOCIAL ⇒ NO sale (el dominio no es el del cliente) y lo dice', async () => {
    const r = await elegir(DESPUES, FICHA({ website_url: 'https://www.instagram.com/zeroriskgye/' }))
    expect(pide(r, 'analitica_propia')).toBe(false)
    expect(motivoDe(r, 'analitica_propia')).toMatch(/RED SOCIAL \(www\.instagram\.com\)/)
  })
  it('lo demás NO cambió: mismos pedidos y descartados que antes salvo analitica_propia (competidores_precio sigue siendo sólo B2B)', async () => {
    for (const ficha of [FICHA(), FICHA({ industry: 'consultora b2b' }), FICHA({ industry: 'unknown' }), FICHA({ website_url: null })]) {
      const a = await elegir(ANTES, ficha)
      const d = await elegir(DESPUES, ficha)
      const sinAnalitica = (r: typeof a) => r.pedidos.filter((p) => p.objetivo !== 'analitica_propia').map((p) => ({ brazo: p.brazo, objetivo: p.objetivo, params: p.params }))
      expect(sinAnalitica(d)).toEqual(sinAnalitica(a))
      expect(d.descartados.filter((x) => x.objetivo !== 'analitica_propia')).toEqual(a.descartados.filter((x) => x.objetivo !== 'analitica_propia'))
    }
    expect(pide(await elegir(DESPUES, FICHA()), 'competidores_precio')).toBe(false)
    expect(motivoDe(await elegir(DESPUES, FICHA()), 'competidores_precio')).toMatch(/sólo quien le vende a empresas/)
  })
  it('el orden se renumera sin huecos', async () => {
    const r = await elegir(DESPUES, FICHA())
    expect(r.pedidos.map((p) => (p as unknown as { orden?: number }).orden)).toEqual(r.pedidos.map((_p, i) => i + 1))
  })
})

describe('② lo que no se buscó se DECLARA DENTRO DEL PLAN, con su motivo', () => {
  const DESC = [
    { objetivo: 'competidores_precio', motivo: 'el rubro no lo requiere · lo pidió sólo quien le vende a empresas' },
    { objetivo: 'velocidad_sitio', motivo: 'no lo pidió ninguno de los dos rubros medidos · queda fuera hasta que alguien lo pida' },
  ]
  const vuelta = (flujo: typeof ANTES, respuesta: string | null, desc: unknown) =>
    correr(codigo(flujo, VUELTA), respuesta === null ? {} : { body: { response: respuesta } }, {
      'Redactor (B4)': { cliente_id: 'c1' }, 'Ficha del cliente': { name: 'Náufrago' },
      ...(desc === undefined ? {} : { 'elegir brazos': { descartados: desc } }),
    })
  it('🔴 el texto del plan trae el bloque «Lo que NO se buscó y por qué» con CADA objetivo y su motivo · el código de ANTES no dejaba marca', async () => {
    const [{ json: antes }] = await vuelta(ANTES, '# PLAN\nTexto del redactor.', DESC)
    expect(antes.texto).not.toMatch(/Lo que NO se buscó/)
    expect(antes.texto).not.toMatch(/velocidad_sitio/)
    const [{ json }] = await vuelta(DESPUES, '# PLAN\nTexto del redactor.', DESC)
    expect(json.texto.startsWith('# PLAN\nTexto del redactor.')).toBe(true)
    expect(json.texto).toContain('## Lo que NO se buscó y por qué (lo declara el sistema, no el redactor)')
    expect(json.texto).toContain('- competidores_precio — el rubro no lo requiere · lo pidió sólo quien le vende a empresas')
    expect(json.texto).toContain('- velocidad_sitio — no lo pidió ninguno de los dos rubros medidos')
    expect(json.descartados_declarados).toBe(2)
    expect(json.caracteres).toBe(json.texto.length)
    expect(json.llego_la_vuelta).toBe(true)
  })
  it('si la lista NO se puede leer, el plan DICE que no se sabe qué se dejó de buscar (no calla)', async () => {
    const [{ json }] = await vuelta(DESPUES, '# PLAN', undefined)
    expect(json.texto).toMatch(/NO se sabe qué brazos quedaron fuera ni por qué/)
    expect(json.texto).toMatch(/Ninguna ausencia de este plan debe leerse como «no correspondía»/)
    expect(json.descartados_declarados).toBeNull()
  })
  it('lista vacía ⇒ lo dice explícitamente (nada quedó fuera), no omite la sección', async () => {
    const [{ json }] = await vuelta(DESPUES, '# PLAN', [])
    expect(json.texto).toContain('## Lo que NO se buscó y por qué')
    expect(json.texto).toMatch(/se pidieron todos los brazos/)
    expect(json.descartados_declarados).toBe(0)
  })
  it('un descartado sin motivo NO se cuela sin decirlo', async () => {
    const [{ json }] = await vuelta(DESPUES, '# PLAN', [{ objetivo: 'x' }])
    expect(json.texto).toContain('- x — (sin motivo declarado)')
  })
  it('🔴 sin vuelta del redactor NO se fabrica un plan: el texto sigue vacío (sólo el bloque no hace un plan) y la corrida NO se da por exitosa', async () => {
    const [{ json }] = await vuelta(DESPUES, null, DESC)
    expect(json.llego_la_vuelta).toBe(false)
    expect(json.texto).toBe('')
    expect(json.motivo).toMatch(/NO llegó/)
  })
  it('no duplica saltos de línea ni pisa el texto: el plan original va intacto delante', async () => {
    const original = '# PLAN\n\n## 1\ncontenido\n\n\n'
    const [{ json }] = await vuelta(DESPUES, original, DESC)
    expect(json.texto.startsWith('# PLAN\n\n## 1\ncontenido')).toBe(true)
    expect(json.texto).not.toMatch(/\n{4,}/)
  })
  it('③ el pedido al redactor NO choca: le dice que el sistema lista lo descartado y que no lo repita, pero que declare si una decisión suya depende de eso', () => {
    const nuevo = codigo(DESPUES, REDACTOR)
    const viejo = codigo(ANTES, REDACTOR)
    expect(viejo).toContain("'   NO lo reportes como una falta:',")
    expect(nuevo).not.toContain("'   NO lo reportes como una falta:',")
    expect(nuevo).toContain('El sistema lo lista al final del plan')
    expect(nuevo).toContain('si una decision tuya depende de algo de esta lista, dilo en el plan')
  })
})

describe('el flujo · sólo cambian esos 3 nodos', () => {
  it('3 nodos cambiados de lógica (+ 2 sólo de posición) · mismas conexiones · mismos 42 nodos · ajustes sólo los permitidos por la API', () => {
    expect(DESPUES.nodes).toHaveLength(42)
    const cambiados = DESPUES.nodes.filter((n: { name: string; parameters: unknown }, i: number) => JSON.stringify(n.parameters) !== JSON.stringify(ANTES.nodes[i].parameters)).map((n: { name: string }) => n.name)
    expect(cambiados.sort()).toEqual([ELEGIR, REDACTOR, VUELTA].sort())
    expect(JSON.stringify(DESPUES.connections)).toBe(JSON.stringify(ANTES.connections))
    expect(Object.keys(DESPUES.settings)).toEqual(['executionOrder'])
  })
  it('🔴 DEFECTO LATENTE: «El número de la casa» y «La referencia del producto» quedan dibujados POR ENCIMA de «Ficha del cliente» (n8n v1 corre las ramas de arriba hacia abajo) · antes corrían DESPUÉS y sólo funcionaba porque PostHog salía vacío', () => {
    const y = (f: typeof ANTES, n: string) => f.nodes.find((x: { name: string }) => x.name === n).position[1]
    // ANTES: ambos por debajo de la ficha ⇒ corren después de toda la rama principal
    expect(y(ANTES, 'El número de la casa')).toBeGreaterThan(y(ANTES, 'Ficha del cliente'))
    expect(y(ANTES, 'La referencia del producto')).toBeGreaterThan(y(ANTES, 'Ficha del cliente'))
    // DESPUÉS: ambos por encima
    expect(y(DESPUES, 'El número de la casa')).toBeLessThan(y(DESPUES, 'Ficha del cliente'))
    expect(y(DESPUES, 'La referencia del producto')).toBeLessThan(y(DESPUES, 'Ficha del cliente'))
    // sólo se movió el dibujo: parámetros, tipo y conexiones idénticos
    for (const n of ['El número de la casa', 'La referencia del producto']) {
      const a = ANTES.nodes.find((x: { name: string }) => x.name === n), d = DESPUES.nodes.find((x: { name: string }) => x.name === n)
      expect(JSON.stringify(d.parameters)).toBe(JSON.stringify(a.parameters))
      expect(d.type).toBe(a.type)
    }
    // y los tres siguen colgando de la misma guarda ①
    expect(DESPUES.connections['① GUARDA · sin manual aprobado se DETIENE'].main[0].map((t: { node: string }) => t.node).sort()).toEqual(['El número de la casa', 'Ficha del cliente', 'La referencia del producto'])
  })
  it('los saltos de línea de lo que no se tocó quedan byte a byte (CRLF del original)', () => {
    const viejo = codigo(ANTES, ELEGIR)
    const nuevo = codigo(DESPUES, ELEGIR)
    expect(viejo.includes('\r\n')).toBe(true)
    expect(nuevo.includes('\r\n')).toBe(true)
    expect(nuevo.replace(/\r\n/g, '').includes('\n')).toBe(false)
  })
  it('todo el código de los nodos parcheados compila · y no vuelve a construirse dos veces', () => {
    for (const n of [ELEGIR, VUELTA, REDACTOR]) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigo(DESPUES, n))).not.toThrow()
    }
    expect(() => construir(DESPUES)).toThrow(/ya está construido/)
  })
})

describe('③ y ④ el brazo de PostHog · el filtro y el comentario', () => {
  const ROUTE = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'planeacion', 'brazo', 'posthog', 'route.ts'), 'utf8')
  let sqls: string[] = []
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = 'k'
    process.env.POSTHOG_PROJECT_ID = '1'
    process.env.POSTHOG_PERSONAL_API_KEY = 'k'
    process.env.POSTHOG_API_URL = 'https://ph.test'
    sqls = []
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: { body: string }) => {
      sqls.push(JSON.parse(init.body).query.query)
      return new Response(JSON.stringify({ results: [['$pageview', 488, 300], ['menu_viewed', 65, 50], ['cart_opened', 63, 49]] }), { status: 200 })
    }))
  })
  afterEach(() => vi.unstubAllGlobals())
  const pedir = async (dominio: string) => {
    const { POST } = await import('@/app/api/planeacion/brazo/posthog/route')
    const r = await POST(new Request('https://x.test/api/planeacion/brazo/posthog', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': 'k' },
      body: JSON.stringify({ pedidos: [{ brazo: 'posthog', objetivo: 'analitica_propia', params: { dominio } }] }),
    }))
    return r.json()
  }
  it('🔴 el filtro mira `$host` Y el host de `$current_url` (los eventos de conducta no traen `$host`) · no sólo `$host`', async () => {
    await pedir('naufrago.ec')
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toMatch(/coalesce\(properties\.\$host, domain\(properties\.\$current_url\)\) in \('naufrago\.ec', 'www\.naufrago\.ec'\)/)
    expect(sqls[0]).not.toMatch(/properties\.\$host = /) // el filtro viejo, sólo por $host
  })
  it('sigue devolviendo el embudo completo con la limitación pegada, y dice de dónde leyó el dominio', async () => {
    const j = await pedir('naufrago.ec')
    const r = Array.isArray(j) ? j[0] : (j.respuestas ?? [j])[0]
    expect(r.estado).toBe('trajo')
    expect(r.datos.visitas).toBe(488)
    expect(r.datos.embudo.map((f: { evento: string }) => f.evento)).toEqual(['$pageview', 'menu_viewed', 'cart_opened'])
    expect(r.datos.atribucion).toBe('POR DOMINIO, NO POR CLIENTE')
    expect(r.datos.dominio_leido_de).toMatch(/\$current_url/)
  })
  it('🔴 la ficha trae el dominio CON www (caso real: https://www.naufrago.ec) ⇒ se piden el pelado Y el www · antes salía www.www.… y sólo se veían 138 de 488 visitas', async () => {
    await pedir('www.naufrago.ec')
    expect(sqls[0]).toContain("in ('naufrago.ec', 'www.naufrago.ec')")
    expect(sqls[0]).not.toContain('www.www.')
    await pedir('WWW.Naufrago.EC')
    expect(sqls[1]).toContain("in ('naufrago.ec', 'www.naufrago.ec')")
    await pedir('naufrago.ec')
    expect(sqls[2]).toContain("in ('naufrago.ec', 'www.naufrago.ec')")
  })
  it('un dominio con comillas no rompe la consulta (se escapan)', async () => {
    await pedir("a'b.test")
    expect(sqls[0]).toContain("'a''b.test'")
  })
  it('🔴 el comentario ya NO afirma «14 visitas» como el volumen del sitio: dice lo medido (488) y deja constancia de la corrección', () => {
    expect(ROUTE).not.toMatch(/el volumen del único dominio real medido es de 14 visitas/)
    expect(ROUTE).toMatch(/488 visitas/)
    expect(ROUTE).toMatch(/CORREGIDO 2026-09-30/)
    expect(ROUTE).toMatch(/0 de 806 \$pageview con client_id/)
    expect(ROUTE).not.toMatch(/0 de 866/)
  })
})
