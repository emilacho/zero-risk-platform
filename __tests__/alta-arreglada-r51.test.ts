/**
 * Relevo 51 · el alta `LyVoKcrypS5uLyuu` y el Servicio de Apify `3lyknrP3PoS2KzUf` ARREGLADOS: ensayo SIN n8n y SIN llamadas reales.
 * Se comparan los respaldos «antes» con los flujos arreglados nodo por nodo y se ejecuta el código de los nodos tocados con datos sintéticos.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type Nodo = { name: string; type: string; parameters: Record<string, unknown> & { jsCode?: string; jsonBody?: string }; onError?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const leer = (f: string): Flujo => JSON.parse(fs.readFileSync(f, 'utf8'))
const ALTA_ANTES = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ANTES-2026-10-10-r51.json')
const ALTA = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r51.json')
const SVC_ANTES = leer('scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-ANTES-2026-10-10-r51.json')
const SVC = leer('scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-ARREGLADO-2026-10-10-r51.json')
const nodo = (w: Flujo, n: string) => w.nodes.find((x) => x.name === n)!
const cuerpo = (n: Nodo) => JSON.stringify(n.parameters)

const NUEVOS = ['[R2] Materia del cliente por código', '[HECHOS] Chequeo por código del manual', '[HECHOS] Unir el informe al ítem']
const TOCADOS = ['[JEFATURA] Transform discovery→package', 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)', 'Armar carga · segunda fase']

function diferencia(a: Flujo, b: Flujo) {
  const A = new Map(a.nodes.map((n) => [n.name, n])), B = new Map(b.nodes.map((n) => [n.name, n]))
  return {
    cambian: [...A.keys()].filter((k) => B.has(k) && cuerpo(A.get(k)!) !== cuerpo(B.get(k)!)),
    nuevos: [...B.keys()].filter((k) => !A.has(k)),
    quitados: [...A.keys()].filter((k) => !B.has(k)),
    conexiones: Object.keys({ ...a.connections, ...b.connections }).filter((k) => JSON.stringify(a.connections[k]) !== JSON.stringify(b.connections[k])).sort(),
  }
}

describe('el alta: cambia SOLO lo previsto (nodo por nodo contra el respaldo)', () => {
  const d = diferencia(ALTA_ANTES, ALTA)
  it('3 nodos tocados, 3 nuevos, ninguno quitado', () => {
    expect(d.cambian.sort()).toEqual([...TOCADOS].sort())
    expect(d.nuevos.sort()).toEqual([...NUEVOS].sort())
    expect(d.quitados).toEqual([])
  })
  it('solo se re-cablean los 3 enlaces previstos (landscape → R2 → transform; IF → hechos → unir → emit)', () => {
    expect(d.conexiones).toEqual(['IF track_pass (¿el cimiento pasó de verdad?)', '[HECHOS] Chequeo por código del manual', '[HECHOS] Unir el informe al ítem', '[JEFATURA] Load landscape_summary (canon)', '[R2] Materia del cliente por código'].sort())
  })
  it('las dos llamadas nuevas siguen su camino y NUNCA detienen el alta (continúan ante error, no fallan por la respuesta)', () => {
    for (const n of NUEVOS.slice(0, 2)) {
      const x = nodo(ALTA, n)
      expect(x.onError).toBe('continueRegularOutput')
      expect(cuerpo(x)).toContain('neverError')
      expect(cuerpo(x)).toContain('$env.INTERNAL_API_KEY') // la llave sale del entorno de n8n, jamás pegada
      expect(/[0-9a-f]{64}/.test(cuerpo(x))).toBe(false)
    }
  })
  it('el flujo sigue APAGADO', () => { expect((leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r51.json') as unknown as { active?: boolean }).active).toBe(false) })
  it('el descubridor recibe las reglas de evidencia y conserva TODO lo anterior', () => {
    const a = nodo(ALTA_ANTES, 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)').parameters.jsonBody!
    const b = nodo(ALTA, 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)').parameters.jsonBody!
    expect(b).toContain('EVIDENCE RULES (mandatory)')
    for (const p of ['the client says: «quote»', 'headquarters, delivery zone, product origin, market', 'DUDAS', 'a synthesis, not a source']) expect(b).toContain(p)
    expect(b.replace(/ \+ String\.fromCharCode\(10\) \+ '' \+ String\.fromCharCode\(10\) \+ 'EVIDENCE RULES[^']*'/, '')).toBe(a)
  })
})

/** ejecuta un nodo de código con `$()` falso: lo que no existe LANZA, como n8n */
function correr(codigo: string, datos: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const $ = (nombre: string) => {
    if (!(nombre in datos)) throw new Error(`Node '${nombre}' hasn't been executed`)
    const v = datos[nombre]
    const lista = Array.isArray(v) ? v : [v]
    return { first: () => ({ json: lista[0] }), all: () => lista.map((j) => ({ json: j })), item: { json: lista[0] } }
  }
  return new Function('$', '$workflow', '$execution', '$input', codigo)($, { id: 'wf1' }, { id: 'ex1' }, { first: () => ({ json: {} }), all: () => [], ...extra })
}

describe('Transform del alta · la materia por código y la frase propia (ensayo con cliente sintético)', () => {
  const COD = nodo(ALTA, '[JEFATURA] Transform discovery→package').parameters.jsCode!
  const COD_ANTES = nodo(ALTA_ANTES, '[JEFATURA] Transform discovery→package').parameters.jsCode!
  const sitio = 'x'.repeat(9000)
  const base = (r2?: unknown) => ({
    'Validate Deal Data': { client_id: 'c1', client_name: 'Clinica Ejemplo', industry: 'salud', website: 'https://www.clinicaejemplo.test', _journey_id: 'j', _sala_correlation_id: 's' },
    '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)': { discovery_package: { discovery_summary: 'resumen', competitors: [], own_handles: { instagram: 'clinicaejemplo' }, icp_signals: [] } },
    'El texto del sitio, o el hueco': { sitio_estado: 'trajo', sitio_caracteres: 9000, sitio_texto: sitio },
    '[APIFY-WIRE] Gate · drop skip-markers (lazo)': [{ target_kind: 'own', apify_function: 'instagram_scraper' }],
    '[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)': [{ ok: true, datos: 'y'.repeat(12000) }],
    ...(r2 ? { '[R2] Materia del cliente por código': r2 } : {}),
  })
  const mat = (o: ReturnType<typeof correr>) => o[0].json.discovery_package.materia_cliente
  const R2 = { ok: true, estado: 'trajo', texto: '### Título\nSonríe sin miedo\n\n### Portada\nAgenda hoy.', total_original: 28000, recortes: [{ bloque: 'portada', leidos: 4000, total: 9000 }], eslogan: { literal: 'Sonríe sin miedo, tu clínica de siempre' }, estado_eslogan: 'hallado', frases_repetidas: [{ literal: 'Agenda por WhatsApp hoy mismo' }] }

  it('con la ruta: la frase propia va primero, la materia ordenada después, y viaja en casillas propias', () => {
    const m = mat(correr(COD, base(R2)))
    expect(m.materia_estado).toBe('trajo')
    expect(m.sitio_texto.startsWith('FRASE PROPIA DEL CLIENTE (literal')).toBe(true)
    expect(m.sitio_texto).toContain('«Sonríe sin miedo, tu clínica de siempre»')
    expect(m.sitio_texto).toContain('### Portada')
    expect(m.frase_propia).toBe('Sonríe sin miedo, tu clínica de siempre')
    expect(m.estado_frase_propia).toBe('hallado'); expect(m.frases_repetidas).toEqual(['Agenda por WhatsApp hoy mismo']); expect(m.materia_recortes).toHaveLength(1)
    expect(m.sitio_caracteres_total).toBe(28000)
  })
  it('sin la ruta (no ejecutada, sin respuesta o sin dato): se conserva lo de antes y se DECLARA; el corte por la cabeza ya no es mudo', () => {
    const sinNodo = mat(correr(COD, base()))
    expect(sinNodo.materia_estado).toBe('no_disponible')
    expect(sinNodo.sitio_texto).toContain('[recortado por la cabeza: se leyeron 3500 de 9000 caracteres]')
    expect(mat(correr(COD, base({ ok: false, error: 'x' }))).materia_estado).toBe('sin_respuesta')
    const sd = mat(correr(COD, base({ ok: true, estado: 'sin_dato' })))
    expect(sd.materia_estado).toBe('sin_dato'); expect(sd.frase_propia).toBeNull(); expect(sd.estado_frase_propia).toBe('sin_dato')
  })
  it('el Instagram propio ya no se corta a 1.000 en silencio: 8.000 y con aviso', () => {
    const m = mat(correr(COD, base()))
    expect(m.instagram_propio.length).toBeGreaterThan(8000)
    expect(m.instagram_propio).toContain('[recortado: se leyeron 8000 de 12000 caracteres]')
    const corto = base(); (corto['[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)'] as unknown) = [{ ok: true, datos: 'hola' }]
    expect(mat(correr(COD, corto)).instagram_propio).toBe('hola')
  })
  it('todo lo demás del paquete es IDÉNTICO al de antes', () => {
    const nuevo = correr(COD, base(R2))[0].json, viejo = correr(COD_ANTES, base(R2))[0].json
    const sinMateria = (o: { discovery_package: { materia_cliente: Record<string, unknown> } }) => { const { materia_cliente: _m, ...resto } = o.discovery_package; void _m; return { ...o, discovery_package: resto } }
    expect(sinMateria(nuevo)).toEqual(sinMateria(viejo))
    const claves = (o: Record<string, unknown>) => Object.keys(o)
    for (const k of claves(viejo.discovery_package.materia_cliente)) expect(claves(nuevo.discovery_package.materia_cliente)).toContain(k)
  })
})

describe('el chequeo de hechos DENTRO: el ítem sigue igual y el informe se agrega', () => {
  const COD = nodo(ALTA, '[HECHOS] Unir el informe al ítem').parameters.jsCode!
  const IF = 'IF track_pass (¿el cimiento pasó de verdad?)'
  const item = { track_published: true, otro: 'dato' }
  it('con informe: lo del ítem se conserva y se agrega el resumen y los primeros sin respaldo', () => {
    const o = correr(COD, { [IF]: item, '[HECHOS] Chequeo por código del manual': { ok: true, manual_version: 3, total_hechos: 12, resumen: { sin_cita: 2 }, sin_respaldo: [{ campo: 'positioning' }, { campo: 'x' }] } })[0].json
    expect(o.track_published).toBe(true); expect(o.otro).toBe('dato')
    expect(o.chequeo_hechos).toMatchObject({ estado: 'revisado', manual_version: 3, total_hechos: 12, sin_respaldo_n: 2 })
  })
  it('si la ruta no contestó: el ítem sigue y lo DICE (nunca detiene el alta)', () => {
    const o = correr(COD, { [IF]: item, '[HECHOS] Chequeo por código del manual': { error: 'sin_manual' } })[0].json
    expect(o.otro).toBe('dato'); expect(o.chequeo_hechos).toEqual({ estado: 'no_se_pudo', motivo: 'sin_manual' })
    expect(correr(COD, { [IF]: item })[0].json.chequeo_hechos.estado).toBe('no_se_pudo')
  })
  it('la carga de la segunda fase lleva el informe (o null)', () => {
    const C = nodo(ALTA, 'Armar carga · segunda fase').parameters.jsCode!
    const datos = { 'Validate Deal Data': { client_id: 'c1', _journey_id: 'j' }, 'Call Onboarding Specialist: Auto-Discovery': { discovery_output: {} } }
    expect(correr(C, datos)[0].json.chequeo_hechos).toBeNull()
    expect(correr(C, { ...datos, '[HECHOS] Unir el informe al ítem': { chequeo_hechos: { estado: 'revisado' } } })[0].json.chequeo_hechos).toEqual({ estado: 'revisado' })
  })
})

describe('el Servicio de Apify · el rótulo «propio» SOLO cuando el objetivo es propio; lo demás idéntico', () => {
  const COD = nodo(SVC, 'transform-sections').parameters.jsCode!
  const COD_ANTES = nodo(SVC_ANTES, 'transform-sections').parameters.jsCode!
  it('solo cambia ese nodo y nada más del flujo', () => {
    const d = diferencia(SVC_ANTES, SVC)
    expect(d.cambian).toEqual(['transform-sections']); expect(d.nuevos).toEqual([]); expect(d.quitados).toEqual([]); expect(d.conexiones).toEqual([])
  })
  const FUNCIONES = ['instagram_scraper', 'facebook_page_scraper', 'linkedin_company_scraper', 'tiktok_profile_scraper', 'youtube_channel_scraper', 'twitter_scraper', 'website_content_scraper', 'own_google_maps_profile', 'google_maps_scraper', 'facebook_ads_library_scraper', 'google_serp_scraper', 'competitor_website_scraper', 'funcion_desconocida']
  const metas: Array<[string, unknown]> = [['sin metadata', undefined], ['metadata vacía', {}], ['competidor', { target_kind: 'competitor' }], ['search', { target_kind: 'search' }], ['propio', { target_kind: 'own' }]]
  const salida = (cod: string, fn: string, meta: unknown) => {
    const body = { apify_function: fn, client_id: 'c1', destination: 'brain_rag', ...(meta === undefined ? {} : { metadata: meta }) }
    const items = [{ username: 'u', biography: 'Sonríe sin miedo', text: 'hola', url: 'https://x.test/', metadata: { title: 't' } }]
    return correr(cod, { 'Validate Body': { body, dry_run: false } }, { first: () => ({ json: items[0] }), all: () => items.map((j) => ({ json: j })) })[0].json
  }
  for (const fn of FUNCIONES) for (const [nombre, meta] of metas) {
    it(`${fn} · ${nombre}`, () => {
      const antes = salida(COD_ANTES, fn, meta), despues = salida(COD, fn, meta)
      const propioConMapa = nombre === 'propio' && ['instagram_scraper', 'facebook_page_scraper', 'linkedin_company_scraper', 'tiktok_profile_scraper', 'youtube_channel_scraper', 'twitter_scraper'].includes(fn)
      if (!propioConMapa) return expect(despues).toEqual(antes)
      const esperado = { instagram_scraper: 'instagram_propio', facebook_page_scraper: 'facebook_page_propia', linkedin_company_scraper: 'linkedin_propio', tiktok_profile_scraper: 'tiktok_propio', youtube_channel_scraper: 'youtube_channel_propio', twitter_scraper: 'twitter_propio' }[fn]
      expect(despues.sections[0].section_label).toBe(esperado)
      expect({ ...despues, sections: despues.sections.map((s: Record<string, unknown>) => ({ ...s, section_label: 'X' })) }).toEqual({ ...antes, sections: antes.sections.map((s: Record<string, unknown>) => ({ ...s, section_label: 'X' })) })
    })
  }
})
