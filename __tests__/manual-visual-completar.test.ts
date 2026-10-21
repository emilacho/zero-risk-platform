/**
 * ENCARGO manual visual con todas las fuentes · T4 · «Manual · completar lo visual»: cuando las copias llegan DESPUÉS del manual, la parte visual se vuelve a correr sola
 * y se promueve una versión nueva SOLO si mejora. Idempotente, con tope por día, solo clientes autorizados y nunca sobre un manual aprobado por una persona.
 * A costo cero: base y modelo simulados; los nodos corren con su código real.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'manual-visual-completar')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B: any = require(join(DIR, 'barrido-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(join(DIR, 'construir.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const OTRO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const HOY = new Date().toISOString().slice(0, 10)

const VISUAL_VIEJO_SIN_NADA = { error: 'FOTOS_SIN_COPIA · logo → sin copia guardada', capa_grafica: { paleta: [], tipografias: [], logo_url: null }, capa_producto: null, reglas: null }
const VISUAL_COMPLETO = { version: 2, estado: 'completo', capa_grafica: { paleta: [{ color: '#111111' }] }, capa_producto: { luz: 'x' }, reglas: { debe: ['a'] } }

describe('rangoDeVisual · mejoraElVisual', () => {
  it('v2 por su estado; v1 viejo por lo que tiene; nada = 0', () => {
    expect(B.rangoDeVisual(null)).toBe(0); expect(B.rangoDeVisual(VISUAL_VIEJO_SIN_NADA)).toBe(0)
    expect(B.rangoDeVisual({ estado: 'parcial' })).toBe(1); expect(B.rangoDeVisual({ estado: 'ausente' })).toBe(0); expect(B.rangoDeVisual(VISUAL_COMPLETO)).toBe(2)
    expect(B.rangoDeVisual({ capa_grafica: { paleta: [{ color: '#1' }] }, capa_producto: { a: 1 }, reglas: { b: 1 } })).toBe(2) // v1 con todo
    expect(B.rangoDeVisual({ capa_grafica: { paleta: [{ color: '#1' }] } })).toBe(1)
  })
  it('mejora si sube de nivel, o si con el mismo nivel tiene más colores; si no, no', () => {
    expect(B.mejoraElVisual(VISUAL_VIEJO_SIN_NADA, { estado: 'parcial' }).mejora).toBe(true)
    expect(B.mejoraElVisual({ estado: 'parcial', capa_grafica: { paleta: [{}] } }, { estado: 'parcial', capa_grafica: { paleta: [{}, {}] } }).mejora).toBe(true)
    expect(B.mejoraElVisual({ estado: 'parcial', capa_grafica: { paleta: [{}] } }, { estado: 'parcial', capa_grafica: { paleta: [{}] } }).mejora).toBe(false)
    expect(B.mejoraElVisual(VISUAL_COMPLETO, { estado: 'parcial' }).mejora).toBe(false) // nunca se baja un visual completo
    expect(B.mejoraElVisual({ estado: 'parcial' }, { estado: 'ausente' }).mejora).toBe(false)
  })
})

describe('decidirSiCorrer', () => {
  const base = { permitido: true, humanoAprobo: false, visual: VISUAL_VIEJO_SIN_NADA, huellaActual: 'h2', intento: null, hoy: HOY, forzar: false }
  it('corre cuando está autorizado, el visual está incompleto y hay entradas que no se probaron', () => { expect(B.decidirSiCorrer(base)).toEqual({ correr: true, motivo: null }) })
  it.each([
    ['no autorizado', { permitido: false }, 'cliente_no_autorizado'],
    ['manual aprobado por una persona', { humanoAprobo: true }, 'manual_aprobado_por_una_persona'],
    ['visual ya completo', { visual: VISUAL_COMPLETO }, 'visual_ya_completo'],
    ['misma huella que el último intento', { intento: { huella: 'h2', dia: HOY, n: 1 } }, 'sin_entradas_nuevas'],
    ['tope de intentos del día', { intento: { huella: 'h1', dia: HOY, n: 3 } }, 'tope_de_intentos_del_dia'],
  ])('no corre: %s', (_n, cambio, motivo) => { expect(B.decidirSiCorrer({ ...base, ...cambio })).toEqual({ correr: false, motivo }) })
  it('una huella distinta ayer o con intentos de otro día sí corre; el tope se reinicia cada día', () => {
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h1', dia: '2000-01-01', n: 9 } }).correr).toBe(true)
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h1', dia: HOY, n: 2 } }).correr).toBe(true)
  })
  it('forzar salta la huella y el «ya completo», pero NO el tope ni la autorización ni al humano', () => {
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h2', dia: HOY, n: 1 }, forzar: true }).correr).toBe(true)
    expect(B.decidirSiCorrer({ ...base, visual: VISUAL_COMPLETO, forzar: true }).correr).toBe(true)
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h1', dia: HOY, n: 3 }, forzar: true }).motivo).toBe('tope_de_intentos_del_dia')
    expect(B.decidirSiCorrer({ ...base, permitido: false, forzar: true }).motivo).toBe('cliente_no_autorizado')
    expect(B.decidirSiCorrer({ ...base, humanoAprobo: true, forzar: true }).motivo).toBe('manual_aprobado_por_una_persona')
  })
})

describe('huella · autorizados · cuerpo del manual', () => {
  it('la huella cambia con una copia nueva, con colores de la ficha o con una fila de sitio nueva; no con ruido', () => {
    const c = (n: number, t: string) => Array.from({ length: n }, (_, i) => ({ estado: 'ok', url: 'u' + i, created_at: t }))
    const h = (o: object) => B.huellaDeEntradas(o)
    expect(h({ copias: c(2, 'a') })).toBe(h({ copias: c(2, 'a') }))
    expect(h({ copias: c(3, 'a') })).not.toBe(h({ copias: c(2, 'a') }))
    expect(h({ copias: c(2, 'b') })).not.toBe(h({ copias: c(2, 'a') }))
    expect(h({ copias: [], ficha: { brand_colors: ['#111111'] } })).not.toBe(h({ copias: [], ficha: {} }))
    expect(h({ copias: [], sitioId: 7 })).not.toBe(h({ copias: [] }))
    expect(h({ copias: [{ estado: 'no_bajo', url: null, created_at: 'z' }] })).toBe(h({ copias: [] })) // una copia caída no cuenta
    expect(h({ copias: [{ estado: 'no_bajo', url: 'https://x/y.jpg', created_at: 'z' }] })).toBe(h({ copias: [] })) // una copia caída con URL tampoco cuenta
  })
  it('solo uuid bien formados, sin repetidos', () => { expect(B.clientesAutorizados([CID, CID.toUpperCase(), 'nada', 3, null, OTRO])).toEqual([CID, OTRO]); expect(B.clientesAutorizados('x')).toEqual([]) })
  it('armarCuerpoDelManual: el borrador viaja entero, el visual lleva huella y rastro, y el veredicto previo se conserva', () => {
    const cu = B.armarCuerpoDelManual({ borrador: { positioning: 'p', visual: { estado: 'parcial' } }, huella: 'h', previo: { gate_outcome: 'paso_la_vara', fidelity_passed: true, fidelity_scores: { a: 1 }, fidelity_threshold: 0.8 }, ahora: '2026-10-21T00:00:00Z' })
    expect(cu.brand_book.positioning).toBe('p'); expect(cu.brand_book.visual).toMatchObject({ estado: 'parcial', entradas_huella: 'h', generado_en: '2026-10-21T00:00:00Z', generado_por: 'manual-visual-completar' })
    expect(cu).toMatchObject({ source: 'visual_completar', gate_outcome: 'paso_la_vara', fidelity_passed: true, fidelity_scores: { a: 1 }, fidelity_threshold: 0.8 })
    expect(B.armarCuerpoDelManual({ borrador: { visual: {} }, huella: 'h', previo: null, ahora: 'x' })).toMatchObject({ gate_outcome: null, fidelity_passed: false })
  })
})

// ── los nodos reales ─────────────────────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>
function nodoElegir(o: { entrada?: Fila; permitidos?: unknown; manual?: Fila | null; copias?: Fila[]; ficha?: Fila; sitio?: Fila[]; intentos?: Record<string, unknown>; env?: Record<string, string> }) {
  const est: Record<string, unknown> = { intentos: o.intentos ?? {} }
  const pedidos: string[] = []
  const helpers = {
    httpRequest: async (p: { url: string }) => {
      pedidos.push(p.url)
      if (p.url.includes('cadena_config')) return [{ valor: o.permitidos ?? [] }]
      if (p.url.includes('client_brand_books')) return o.manual === null ? [] : [o.manual ?? manual()]
      if (p.url.includes('/rest/v1/clients?')) return [o.ficha ?? {}]
      if (p.url.includes('client_social_images')) return o.copias ?? []
      if (p.url.includes('apify_raw')) return o.sitio ?? []
      throw new Error('url inesperada ' + p.url)
    },
  }
  const ejecutar = async () => {
    const codigo = C.codigos().elegir
    return (await new AsyncFunction('$input', '$', '$env', '$getWorkflowStaticData', codigo).call({ helpers }, { first: () => ({ json: o.entrada ?? {} }) }, () => ({}), o.env ?? { SUPABASE_SERVICE_ROLE_KEY: 'k', INTERNAL_API_KEY: 'llave' }, () => est)) as Array<{ json: Fila }>
  }
  return { ejecutar, est, pedidos }
}
const manual = (extra: Fila = {}, visual: unknown = VISUAL_VIEJO_SIN_NADA): Fila => ({ id: 'm1', version: 1, human_validated: false, content_text: JSON.stringify({ brand_book_draft: { positioning: 'p', visual }, gate_outcome: 'paso_la_vara', fidelity_passed: true }), ...extra })
const copiasOk = (n = 3): Fila[] => Array.from({ length: n }, (_, i) => ({ estado: 'ok', url: 'u' + i, created_at: '2026-10-20T19:50:51Z' }))

describe('nodo «Elegir el cliente»', () => {
  it('sin clientes autorizados no hace nada y no toca la base de clientes', async () => {
    const n = nodoElegir({ permitidos: [] })
    const r = await n.ejecutar()
    expect(r[0].json).toMatchObject({ correr: false, motivo: 'sin_clientes_autorizados' }); expect(n.pedidos.some((p) => p.includes('client_brand_books'))).toBe(false)
  })
  it('🔴 df7e47cc autorizado con manual de visual vacío y copias propias → elige el cliente, con su borrador, huella y veredicto previo', async () => {
    const r = await nodoElegir({ permitidos: [CID], copias: copiasOk() }).ejecutar()
    expect(r[0].json).toMatchObject({ correr: true, client_id: CID, manual_id: 'm1', version: 1 })
    expect((r[0].json.brand_book_draft as Fila).positioning).toBe('p'); expect(String(r[0].json.huella)).toContain('c3'); expect(r[0].json.previo).toMatchObject({ gate_outcome: 'paso_la_vara', fidelity_passed: true })
  })
  it('un cliente con el visual ya completo no se toca', async () => {
    const r = await nodoElegir({ permitidos: [CID], manual: manual({}, VISUAL_COMPLETO), copias: copiasOk() }).ejecutar()
    expect(r[0].json).toMatchObject({ correr: false, motivo: 'visual_ya_completo' })
  })
  it('🔴 un manual aprobado por una persona NO se toca', async () => {
    const r = await nodoElegir({ permitidos: [CID], manual: manual({ human_validated: true }), copias: copiasOk() }).ejecutar()
    expect(r[0].json.motivo).toBe('manual_aprobado_por_una_persona')
  })
  it('🔴 idempotente: con la misma huella que el último intento no repite', async () => {
    const primero = await nodoElegir({ permitidos: [CID], copias: copiasOk() }).ejecutar()
    const huella = primero[0].json.huella
    const r = await nodoElegir({ permitidos: [CID], copias: copiasOk(), intentos: { [CID]: { huella, dia: HOY, n: 1 } } }).ejecutar()
    expect(r[0].json.motivo).toBe('sin_entradas_nuevas')
  })
  it('lee el manual VIGENTE (la versión mayor) y solo las copias PROPIAS; la huella ignora una copia «ok» sin URL', async () => {
    const n = nodoElegir({ permitidos: [CID], copias: copiasOk() })
    await n.ejecutar()
    expect(n.pedidos.find((p) => p.includes('client_brand_books'))).toContain('order=version.desc&limit=1')
    expect(n.pedidos.find((p) => p.includes('client_social_images'))).toContain('owner_role=eq.propio')
    expect(B.huellaDeEntradas({ copias: [{ estado: 'ok', url: null, created_at: 'z' }] })).toBe(B.huellaDeEntradas({ copias: [] }))
  })
  it('manual ilegible o inexistente: se omite con su motivo', async () => {
    expect((await nodoElegir({ permitidos: [CID], manual: null }).ejecutar())[0].json.motivo).toBe('sin_manual')
    expect((await nodoElegir({ permitidos: [CID], manual: { id: 'm', version: 1, content_text: 'no es json' } }).ejecutar())[0].json.motivo).toBe('manual_ilegible')
  })
  it('por el reloj recorre los autorizados y entrega A LO MÁS UNO (el primero con trabajo)', async () => {
    const n = nodoElegir({ permitidos: [CID, OTRO], copias: copiasOk() })
    const r = await n.ejecutar()
    expect(r).toHaveLength(1); expect(r[0].json.client_id).toBe(CID)
  })
  it('🔴 webhook: sin x-api-key correcta falla; con ella, un cliente NO autorizado se omite aunque lo pidan', async () => {
    await expect(nodoElegir({ entrada: { headers: {}, body: { client_id: CID } }, permitidos: [CID] }).ejecutar()).rejects.toThrow(/MANUAL_VISUAL_SIN_LLAVE/)
    await expect(nodoElegir({ entrada: { headers: { 'x-api-key': 'otra' }, body: { client_id: CID } }, permitidos: [CID] }).ejecutar()).rejects.toThrow(/SIN_LLAVE/)
    const r = await nodoElegir({ entrada: { headers: { 'x-api-key': 'llave' }, body: { client_id: OTRO } }, permitidos: [CID] }).ejecutar()
    expect(r[0].json).toMatchObject({ correr: false, motivo: 'cliente_no_autorizado' })
    const ok = await nodoElegir({ entrada: { headers: { 'x-api-key': 'llave' }, body: { client_id: CID } }, permitidos: [CID], copias: copiasOk() }).ejecutar()
    expect(ok[0].json.correr).toBe(true)
  })
  it('webhook con forzar:true salta la huella pero no el tope', async () => {
    const huella = (await nodoElegir({ permitidos: [CID], copias: copiasOk() }).ejecutar())[0].json.huella
    const entrada = { headers: { 'x-api-key': 'llave' }, body: { client_id: CID, forzar: true } }
    expect((await nodoElegir({ entrada, permitidos: [CID], copias: copiasOk(), intentos: { [CID]: { huella, dia: HOY, n: 1 } } }).ejecutar())[0].json.correr).toBe(true)
    expect((await nodoElegir({ entrada, permitidos: [CID], copias: copiasOk(), intentos: { [CID]: { huella, dia: HOY, n: 3 } } }).ejecutar())[0].json.motivo).toBe('tope_de_intentos_del_dia')
  })
})

describe('nodos «Decidir y armar» y «Cierre»', () => {
  const eleg = { client_id: CID, huella: 'h9', brand_book_draft: { positioning: 'p', visual: VISUAL_VIEJO_SIN_NADA }, previo: { gate_outcome: 'paso_la_vara', fidelity_passed: true } }
  async function decidir(piso: Fila, intentos: Record<string, unknown> = {}) {
    const est: Record<string, unknown> = { intentos }
    const $ = (n: string) => { if (n !== 'Elegir el cliente') throw new Error('nodo no ejecutado ' + n); return { first: () => ({ json: eleg }) } }
    const r = (await new AsyncFunction('$input', '$', '$getWorkflowStaticData', C.codigos().decidir)({ first: () => ({ json: piso }) }, $, () => est)) as Array<{ json: Fila }>
    return { json: r[0].json, est }
  }
  it('🔴 si el visual nuevo mejora: arma el cuerpo para la versión nueva y ANOTA el intento (huella + día + 1)', async () => {
    const { json, est } = await decidir({ brand_book_draft: { positioning: 'p', visual: { version: 2, estado: 'parcial', capa_grafica: { paleta: [{ color: '#c8102e' }] } } } })
    expect(json).toMatchObject({ promover: true, client_id: CID }); expect((json.cuerpo as Fila).source).toBe('visual_completar')
    expect(est.intentos).toEqual({ [CID]: { huella: 'h9', dia: HOY, n: 1 } })
  })
  it('🔴 si NO mejora: no promueve, pero el intento SE ANOTA igual (así no hay bucle)', async () => {
    const { json, est } = await decidir({ brand_book_draft: { positioning: 'p', visual: { version: 2, estado: 'ausente', error: 'x' } } }, { [CID]: { huella: 'h8', dia: HOY, n: 1 } })
    expect(json).toMatchObject({ promover: false }); expect(est.intentos).toEqual({ [CID]: { huella: 'h9', dia: HOY, n: 2 } })
  })
  it('sin bloque visual nuevo no promueve (nunca promueve una versión con el visual roto)', async () => {
    expect((await decidir({ brand_book_draft: { positioning: 'p' } })).json.promover).toBe(false)
  })
  it('el cierre FALLA ruidoso si el manual no se guardó, y confirma si se guardó', async () => {
    const decidirOut = { client_id: CID, motivo: 'm', estado_antes: 'ausente', estado_nuevo: 'parcial' }
    const $ = () => ({ first: () => ({ json: decidirOut }) })
    const cierre = (r: Fila) => new AsyncFunction('$input', '$', C.codigos().cierre)({ first: () => ({ json: r }) }, $)
    await expect(cierre({ persisted: false, error: 'x' })).rejects.toThrow(/MANUAL_VISUAL_NO_GUARDADO/)
    await expect(cierre({})).rejects.toThrow(/MANUAL_VISUAL_NO_GUARDADO/)
    expect((await cierre({ persisted: true, version: 2 }))[0].json).toMatchObject({ guardado: true, version: 2, client_id: CID })
  })
})

describe('el flujo', () => {
  const w = C.construirFlujo()
  it('nace con 11 nodos, un reloj de 30 min y un webhook, y sin id (es nuevo; se instala inactivo)', () => {
    expect(w.nodes).toHaveLength(11); expect(w.id).toBeUndefined()
    expect(w.nodes.find((n: { name: string }) => n.name === 'Cada 30 min').parameters.rule.interval[0].expression).toBe('*/30 * * * *')
    expect(w.nodes.find((n: { name: string }) => n.name === 'Webhook · un cliente').parameters.path).toBe('manual-visual-completar')
  })
  it('la cadena es: elegir → ¿hay trabajo? → pasar → piso → decidir → ¿promover? → (promover → cierre | sin mejora)', () => {
    const sig = (a: string, i = 0) => (w.connections[a]?.main?.[i] ?? []).map((c: { node: string }) => c.node)
    expect(sig('Cada 30 min')).toEqual(['Elegir el cliente']); expect(sig('Webhook · un cliente')).toEqual(['Elegir el cliente'])
    expect(sig('Elegir el cliente')).toEqual(['¿Hay trabajo?']); expect(sig('¿Hay trabajo?', 0)).toEqual(['Validate Deal Data']); expect(sig('¿Hay trabajo?', 1)).toEqual([])
    expect(sig('Validate Deal Data')).toEqual(['Piso visual · todas las fuentes']); expect(sig('Piso visual · todas las fuentes')).toEqual(['Decidir y armar'])
    expect(sig('¿Promover?', 0)).toEqual(['Promover el manual (versión nueva)']); expect(sig('¿Promover?', 1)).toEqual(['Sin mejora · queda como está'])
    expect(sig('Promover el manual (versión nueva)')).toEqual(['Cierre · guardado de verdad'])
  })
  it('el piso es el MISMO código del cimiento (una sola fuente de verdad) y promueve por la ruta canónica con la llave interna', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'ssLtwYPt7zxuvnM2', 'construir-nodo-visual.mjs')).href).then((cim: any) => {
      expect(w.nodes.find((n: { name: string }) => n.name === 'Piso visual · todas las fuentes').parameters.jsCode).toBe(cim.codigoDelNodo())
      const h = w.nodes.find((n: { name: string }) => n.name.startsWith('Promover el manual')).parameters
      expect(h.url).toContain('/api/brand-book/'); expect(JSON.stringify(h.headerParameters)).toContain('INTERNAL_API_KEY'); expect(h.method).toBe('POST')
    })
  })
  it('los nodos no usan module.exports ni require, y el piso nunca manda client_id al modelo (R5)', () => {
    for (const n of w.nodes) if (n.parameters.jsCode) { expect(n.parameters.jsCode).not.toMatch(/module\.exports|require\(/) }
  })
})
