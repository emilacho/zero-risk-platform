/**
 * ENCARGO manual visual con todas las fuentes · T4 · «Manual · completar lo visual» — DISPARO AUTOMÁTICO (corrección de Emilio 21-oct 20:50: «siempre arreglos estructurales»).
 * Nadie agrega clientes a una lista: cada 30 min el flujo recorre los clientes con manual y vuelve a correr la parte visual del que la tiene incompleta y tiene material propio que probar;
 * promueve una versión nueva SOLO si mejora. Idempotente, con tope por cliente y global por día, y nunca sobre un manual aprobado por una persona ni sobre un cliente excluido.
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
const P: any = require(join(process.cwd(), 'scripts', 'worker-staging', 'ssLtwYPt7zxuvnM2', 'piso-visual-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(join(DIR, 'construir.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const OTRO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const HOY = new Date().toISOString().slice(0, 10)
const valida = P.nombreDeTipografiaObservada

const VISUAL_VIEJO_SIN_NADA = { error: 'FOTOS_SIN_COPIA · logo → sin copia guardada', capa_grafica: { paleta: [], tipografias: [], logo_url: null }, capa_producto: null, reglas: null }
const VISUAL_COMPLETO = { version: 2, estado: 'completo', capa_grafica: { paleta: [{ color: '#111111' }], tipografias: [{ nombre: 'Bebas Neue', estado: 'propuesta' }] }, capa_producto: { luz: 'x' }, reglas: { debe: ['a'] } }
const VISUAL_COMPLETO_CON_BASURA = { ...VISUAL_COMPLETO, capa_grafica: { paleta: [{ color: '#111111' }], tipografias: [{ nombre: 'Impact o condensed sans-serif bold', estado: 'propuesta' }, { nombre: 'no reconocida con claridad', estado: 'propuesta' }] } }

describe('rangoDeVisual · mejoraElVisual', () => {
  it('v2 por su estado; v1 viejo por lo que tiene; nada = 0', () => {
    expect(B.rangoDeVisual(null)).toBe(0); expect(B.rangoDeVisual(VISUAL_VIEJO_SIN_NADA)).toBe(0)
    expect(B.rangoDeVisual({ estado: 'parcial' })).toBe(1); expect(B.rangoDeVisual({ estado: 'ausente' })).toBe(0); expect(B.rangoDeVisual(VISUAL_COMPLETO)).toBe(2)
    expect(B.rangoDeVisual({ capa_grafica: { paleta: [{ color: '#1' }] }, capa_producto: { a: 1 }, reglas: { b: 1 } })).toBe(2)
    expect(B.rangoDeVisual({ capa_grafica: { paleta: [{ color: '#1' }] } })).toBe(1)
  })
  it('🔴 un «completo» con una tipografía PROPUESTA que no es un nombre real baja a 1 (hay que volver a probar); una DECLARADA no se juzga', () => {
    expect(B.rangoDeVisual(VISUAL_COMPLETO_CON_BASURA, valida)).toBe(1)
    expect(B.rangoDeVisual(VISUAL_COMPLETO, valida)).toBe(2)
    expect(B.rangoDeVisual({ ...VISUAL_COMPLETO, capa_grafica: { paleta: [{}], tipografias: [{ nombre: 'Impact o algo', estado: 'declarado' }] } }, valida)).toBe(2)
    expect(B.rangoDeVisual(VISUAL_COMPLETO_CON_BASURA)).toBe(2) // sin validador no se juzga (compatibilidad)
  })
  it('mejora si sube de nivel, o con el mismo nivel y más colores; nunca baja un visual bueno', () => {
    expect(B.mejoraElVisual(VISUAL_VIEJO_SIN_NADA, { estado: 'parcial' }).mejora).toBe(true)
    expect(B.mejoraElVisual({ estado: 'parcial', capa_grafica: { paleta: [{}] } }, { estado: 'parcial', capa_grafica: { paleta: [{}, {}] } }).mejora).toBe(true)
    expect(B.mejoraElVisual({ estado: 'parcial', capa_grafica: { paleta: [{}] } }, { estado: 'parcial', capa_grafica: { paleta: [{}] } }).mejora).toBe(false)
    expect(B.mejoraElVisual(VISUAL_COMPLETO, { estado: 'parcial' }, valida).mejora).toBe(false)
    expect(B.mejoraElVisual({ estado: 'parcial' }, { estado: 'ausente' }).mejora).toBe(false)
  })
  it('🔴 el visual con tipografía basura (1) se reemplaza por uno completo y limpio (2): esa es la sanación automática', () => {
    expect(B.mejoraElVisual(VISUAL_COMPLETO_CON_BASURA, VISUAL_COMPLETO, valida)).toMatchObject({ mejora: true })
    expect(B.mejoraElVisual(VISUAL_COMPLETO_CON_BASURA, VISUAL_COMPLETO_CON_BASURA, valida).mejora).toBe(false)
  })
})

describe('decidirSiCorrer · el disparo automático', () => {
  const base = { excluido: false, humanoAprobo: false, hayMaterial: true, rango: 0, huellaActual: 'h2', intento: null, hoy: HOY, globalHoy: 0, forzar: false }
  it('corre cuando hay material propio, el visual está incompleto y hay entradas que no se probaron — sin que nadie lo haya listado', () => { expect(B.decidirSiCorrer(base)).toEqual({ correr: true, motivo: null }) })
  it.each([
    ['cliente excluido', { excluido: true }, 'cliente_excluido'],
    ['manual aprobado por una persona', { humanoAprobo: true }, 'manual_aprobado_por_una_persona'],
    ['sin material que probar', { hayMaterial: false }, 'sin_material_que_probar'],
    ['visual ya completo', { rango: 2 }, 'visual_ya_completo'],
    ['tope global del día', { globalHoy: 3 }, 'tope_global_del_dia'],
    ['misma huella que el último intento', { intento: { huella: 'h2', dia: HOY, n: 1 } }, 'sin_entradas_nuevas'],
    ['tope de intentos del cliente', { intento: { huella: 'h1', dia: HOY, n: 3 } }, 'tope_de_intentos_del_dia'],
  ])('no corre: %s', (_n, cambio, motivo) => { expect(B.decidirSiCorrer({ ...base, ...cambio })).toEqual({ correr: false, motivo }) })
  it('el orden de los motivos: excluido > humano > sin material > ya completo > tope global > tope del cliente > misma huella', () => {
    const todo = { excluido: true, humanoAprobo: true, hayMaterial: false, rango: 2, globalHoy: 9, intento: { huella: 'h2', dia: HOY, n: 9 } }
    expect(B.decidirSiCorrer({ ...base, ...todo }).motivo).toBe('cliente_excluido')
    expect(B.decidirSiCorrer({ ...base, ...todo, excluido: false }).motivo).toBe('manual_aprobado_por_una_persona')
    expect(B.decidirSiCorrer({ ...base, ...todo, excluido: false, humanoAprobo: false }).motivo).toBe('sin_material_que_probar')
    expect(B.decidirSiCorrer({ ...base, ...todo, excluido: false, humanoAprobo: false, hayMaterial: true }).motivo).toBe('visual_ya_completo')
    expect(B.decidirSiCorrer({ ...base, ...todo, excluido: false, humanoAprobo: false, hayMaterial: true, rango: 1 }).motivo).toBe('tope_global_del_dia')
    expect(B.decidirSiCorrer({ ...base, ...todo, excluido: false, humanoAprobo: false, hayMaterial: true, rango: 1, globalHoy: 0 }).motivo).toBe('tope_de_intentos_del_dia')
  })
  it('los topes se reinician cada día y una huella distinta sí corre', () => {
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h1', dia: '2000-01-01', n: 9 } }).correr).toBe(true)
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h1', dia: HOY, n: 2 } }).correr).toBe(true)
  })
  it('forzar salta la huella y el «ya completo», pero NO los topes ni al excluido ni al humano ni la falta de material', () => {
    expect(B.decidirSiCorrer({ ...base, intento: { huella: 'h2', dia: HOY, n: 1 }, forzar: true }).correr).toBe(true)
    expect(B.decidirSiCorrer({ ...base, rango: 2, forzar: true }).correr).toBe(true)
    for (const [cambio, motivo] of [[{ globalHoy: 3 }, 'tope_global_del_dia'], [{ intento: { huella: 'h1', dia: HOY, n: 3 } }, 'tope_de_intentos_del_dia'], [{ excluido: true }, 'cliente_excluido'], [{ humanoAprobo: true }, 'manual_aprobado_por_una_persona'], [{ hayMaterial: false }, 'sin_material_que_probar']] as const) {
      expect(B.decidirSiCorrer({ ...base, forzar: true, ...cambio }).motivo).toBe(motivo)
    }
  })
})

describe('huella · material · excluidos · cuerpo del manual', () => {
  const c = (n: number, t: string) => Array.from({ length: n }, (_, i) => ({ estado: 'ok', url: 'u' + i, created_at: t }))
  it('la huella cambia con una copia nueva, con colores de la ficha o con una fila de sitio nueva; no con ruido (copias caídas, con o sin URL)', () => {
    const h = (o: object) => B.huellaDeEntradas(o)
    expect(h({ copias: c(2, 'a') })).toBe(h({ copias: c(2, 'a') })); expect(h({ copias: c(3, 'a') })).not.toBe(h({ copias: c(2, 'a') })); expect(h({ copias: c(2, 'b') })).not.toBe(h({ copias: c(2, 'a') }))
    expect(h({ copias: [], ficha: { brand_colors: ['#111111'] } })).not.toBe(h({ copias: [], ficha: {} })); expect(h({ copias: [], sitioId: 7 })).not.toBe(h({ copias: [] }))
    expect(h({ copias: [{ estado: 'no_bajo', url: null, created_at: 'z' }] })).toBe(h({ copias: [] }))
    expect(h({ copias: [{ estado: 'no_bajo', url: 'https://x/y.jpg', created_at: 'z' }] })).toBe(h({ copias: [] }))
    expect(h({ copias: [{ estado: 'ok', url: null, created_at: 'z' }] })).toBe(h({ copias: [] }))
  })
  it('hayMaterialQueProbar: copias propias bajadas, colores o tipografías en la ficha, o un sitio raspado; nada = no', () => {
    expect(B.hayMaterialQueProbar({ copias: c(1, 'a') })).toBe(true); expect(B.hayMaterialQueProbar({ copias: [], ficha: { brand_colors: ['#1'] } })).toBe(true)
    expect(B.hayMaterialQueProbar({ copias: [], ficha: { brand_fonts: ['Lato'] } })).toBe(true); expect(B.hayMaterialQueProbar({ copias: [], sitioId: 5 })).toBe(true)
    expect(B.hayMaterialQueProbar({ copias: [{ estado: 'no_bajo', url: 'x' }], ficha: { brand_colors: [] } })).toBe(false); expect(B.hayMaterialQueProbar({ copias: [] })).toBe(false)
  })
  it('listaDeClientes: solo uuid bien formados, sin repetidos', () => { expect(B.listaDeClientes([CID, CID.toUpperCase(), 'nada', 3, null, OTRO])).toEqual([CID, OTRO]); expect(B.listaDeClientes('x')).toEqual([]) })
  it('armarCuerpoDelManual: el borrador viaja entero, el visual lleva huella y rastro, y el veredicto previo se conserva', () => {
    const cu = B.armarCuerpoDelManual({ borrador: { positioning: 'p', visual: { estado: 'parcial' } }, huella: 'h', previo: { gate_outcome: 'paso_la_vara', fidelity_passed: true, fidelity_scores: { a: 1 }, fidelity_threshold: 0.8 }, ahora: '2026-10-21T00:00:00Z' })
    expect(cu.brand_book.positioning).toBe('p'); expect(cu.brand_book.visual).toMatchObject({ estado: 'parcial', entradas_huella: 'h', generado_en: '2026-10-21T00:00:00Z', generado_por: 'manual-visual-completar' })
    expect(cu).toMatchObject({ source: 'visual_completar', gate_outcome: 'paso_la_vara', fidelity_passed: true, fidelity_scores: { a: 1 }, fidelity_threshold: 0.8 })
    expect(B.armarCuerpoDelManual({ borrador: { visual: {} }, huella: 'h', previo: null, ahora: 'x' })).toMatchObject({ gate_outcome: null, fidelity_passed: false })
  })
})

// ── los nodos reales ─────────────────────────────────────────────────────────────────────────────
type Fila = Record<string, unknown>
type Cli = { manual?: Fila | null; copias?: Fila[]; ficha?: Fila; sitio?: Fila[] }
function nodoElegir(o: { entrada?: Fila; excluidos?: unknown; clientes?: Record<string, Cli>; intentos?: Record<string, unknown>; global?: Fila; env?: Record<string, string> }) {
  const est: Record<string, unknown> = { intentos: o.intentos ?? {}, ...(o.global ? { global: o.global } : {}) }
  const pedidos: string[] = []
  const clientes = o.clientes ?? { [CID]: {} }
  const idDe = (url: string) => (url.match(/client_id=eq\.([0-9a-f-]{36})/) ?? url.match(/clients\?id=eq\.([0-9a-f-]{36})/) ?? [])[1] ?? ''
  const helpers = {
    httpRequest: async (p: { url: string }) => {
      pedidos.push(p.url)
      if (p.url.includes('cadena_config')) return o.excluidos === undefined ? [] : [{ valor: o.excluidos }]
      if (p.url.includes('client_brand_books?select=client_id')) return Object.entries(clientes).filter(([, c]) => c.manual !== null).map(([client_id]) => ({ client_id }))
      const c = clientes[idDe(p.url)] ?? {}
      if (p.url.includes('client_brand_books?client_id=')) return c.manual === null ? [] : [c.manual ?? manual()]
      if (p.url.includes('/rest/v1/clients?')) return [c.ficha ?? {}]
      if (p.url.includes('client_social_images')) return c.copias ?? []
      if (p.url.includes('apify_raw')) return c.sitio ?? []
      throw new Error('url inesperada ' + p.url)
    },
  }
  const ejecutar = async () => (await new AsyncFunction('$input', '$', '$env', '$getWorkflowStaticData', C.codigos().elegir).call({ helpers }, { first: () => ({ json: o.entrada ?? {} }) }, () => ({}), o.env ?? { SUPABASE_SERVICE_ROLE_KEY: 'k', INTERNAL_API_KEY: 'llave' }, () => est)) as Array<{ json: Fila }>
  return { ejecutar, est, pedidos }
}
const manual = (extra: Fila = {}, visual: unknown = VISUAL_VIEJO_SIN_NADA): Fila => ({ id: 'm1', version: 1, human_validated: false, content_text: JSON.stringify({ brand_book_draft: { positioning: 'p', visual }, gate_outcome: 'paso_la_vara', fidelity_passed: true }), ...extra })
const copiasOk = (n = 3): Fila[] => Array.from({ length: n }, (_, i) => ({ estado: 'ok', url: 'u' + i, created_at: '2026-10-20T19:50:51Z' }))

describe('nodo «Elegir el cliente» · el disparo AUTOMÁTICO', () => {
  it('🔴 sin que nadie lo liste: recorre los clientes con manual y elige el de visual incompleto con copias propias (df7e47cc), con su borrador, huella y veredicto previo', async () => {
    const r = await nodoElegir({ clientes: { [CID]: { copias: copiasOk() } } }).ejecutar()
    expect(r[0].json).toMatchObject({ correr: true, client_id: CID, manual_id: 'm1', version: 1 })
    expect((r[0].json.brand_book_draft as Fila).positioning).toBe('p'); expect(String(r[0].json.huella)).toContain('c3'); expect(r[0].json.previo).toMatchObject({ gate_outcome: 'paso_la_vara', fidelity_passed: true })
  })
  it('🔴 la sanación estructural: un manual «completo» con tipografía basura propuesta se vuelve a elegir solo', async () => {
    const r = await nodoElegir({ clientes: { [CID]: { manual: manual({}, VISUAL_COMPLETO_CON_BASURA), copias: copiasOk() } } }).ejecutar()
    expect(r[0].json.correr).toBe(true)
  })
  it('🔴 un cliente cuyo visual ya está completo y limpio (tipo Náufrago) NO se toca, aunque tenga copias y esté en la base', async () => {
    const r = await nodoElegir({ clientes: { [OTRO]: { manual: manual({}, VISUAL_COMPLETO), copias: copiasOk(14) } } }).ejecutar()
    expect(r[0].json).toMatchObject({ correr: false, motivo: 'visual_ya_completo' })
  })
  it('🔴 un cliente EXCLUIDO no se toca aunque su visual esté incompleto', async () => {
    const r = await nodoElegir({ excluidos: [CID], clientes: { [CID]: { copias: copiasOk() } } }).ejecutar()
    expect(r[0].json).toMatchObject({ correr: false, motivo: 'cliente_excluido' })
  })
  it('🔴 un manual aprobado por una persona NO se toca', async () => {
    const r = await nodoElegir({ clientes: { [CID]: { manual: manual({ human_validated: true }), copias: copiasOk() } } }).ejecutar()
    expect(r[0].json.motivo).toBe('manual_aprobado_por_una_persona')
  })
  it('sin material propio que probar no hace nada (no gasta ni crea versiones)', async () => {
    const r = await nodoElegir({ clientes: { [CID]: { copias: [] } } }).ejecutar()
    expect(r[0].json.motivo).toBe('sin_material_que_probar')
  })
  it('🔴 idempotente: con la misma huella que el último intento no repite; con material nuevo sí', async () => {
    const huella = (await nodoElegir({ clientes: { [CID]: { copias: copiasOk() } } }).ejecutar())[0].json.huella
    expect((await nodoElegir({ clientes: { [CID]: { copias: copiasOk() } }, intentos: { [CID]: { huella, dia: HOY, n: 1 } } }).ejecutar())[0].json.motivo).toBe('sin_entradas_nuevas')
    expect((await nodoElegir({ clientes: { [CID]: { copias: copiasOk(4) } }, intentos: { [CID]: { huella, dia: HOY, n: 1 } } }).ejecutar())[0].json.correr).toBe(true)
  })
  it('🔴 tope GLOBAL del día: con 3 corridas ya hechas hoy no corre nadie más', async () => {
    const r = await nodoElegir({ clientes: { [CID]: { copias: copiasOk() } }, global: { dia: HOY, n: 3 } }).ejecutar()
    expect(r[0].json.motivo).toBe('tope_global_del_dia')
    expect((await nodoElegir({ clientes: { [CID]: { copias: copiasOk() } }, global: { dia: '2000-01-01', n: 9 } }).ejecutar())[0].json.correr).toBe(true) // otro día: se reinicia
  })
  it('manual ilegible o sin clientes con manual: se omite con su motivo', async () => {
    expect((await nodoElegir({ clientes: { [CID]: { manual: { id: 'm', version: 1, content_text: 'no es json' } } } }).ejecutar())[0].json.motivo).toBe('manual_ilegible')
    expect((await nodoElegir({ clientes: {} }).ejecutar())[0].json.motivo).toBe('sin_manuales')
  })
  it('por el reloj entrega A LO MÁS UNO (el primero con trabajo) aunque haya varios candidatos', async () => {
    const r = await nodoElegir({ clientes: { [OTRO]: { manual: manual({}, VISUAL_COMPLETO), copias: copiasOk() }, [CID]: { copias: copiasOk() } } }).ejecutar()
    expect(r).toHaveLength(1); expect(r[0].json.client_id).toBe(CID)
  })
  it('lee el manual VIGENTE (versión mayor), solo las copias PROPIAS y la lista de excluidos', async () => {
    const n = nodoElegir({ clientes: { [CID]: { copias: copiasOk() } } })
    await n.ejecutar()
    expect(n.pedidos.find((p) => p.includes('client_brand_books?client_id='))).toContain('order=version.desc&limit=1')
    expect(n.pedidos.find((p) => p.includes('client_social_images'))).toContain('owner_role=eq.propio')
    expect(n.pedidos.find((p) => p.includes('cadena_config'))).toContain('manual_visual_excluidos')
  })
  it('🔴 webhook: sin x-api-key correcta falla; con ella, un cliente excluido se omite aunque lo pidan; forzar salta la huella pero no los topes', async () => {
    await expect(nodoElegir({ entrada: { headers: {}, body: { client_id: CID } } }).ejecutar()).rejects.toThrow(/MANUAL_VISUAL_SIN_LLAVE/)
    await expect(nodoElegir({ entrada: { headers: { 'x-api-key': 'otra' }, body: { client_id: CID } } }).ejecutar()).rejects.toThrow(/SIN_LLAVE/)
    const h = { 'x-api-key': 'llave' }
    expect((await nodoElegir({ entrada: { headers: h, body: { client_id: CID } }, excluidos: [CID], clientes: { [CID]: { copias: copiasOk() } } }).ejecutar())[0].json.motivo).toBe('cliente_excluido')
    expect((await nodoElegir({ entrada: { headers: h, body: { client_id: CID } }, clientes: { [CID]: { copias: copiasOk() } } }).ejecutar())[0].json.correr).toBe(true)
    const huella = (await nodoElegir({ clientes: { [CID]: { copias: copiasOk() } } }).ejecutar())[0].json.huella
    const forzado = { entrada: { headers: h, body: { client_id: CID, forzar: true } }, clientes: { [CID]: { copias: copiasOk() } } }
    expect((await nodoElegir({ ...forzado, intentos: { [CID]: { huella, dia: HOY, n: 1 } } }).ejecutar())[0].json.correr).toBe(true)
    expect((await nodoElegir({ ...forzado, intentos: { [CID]: { huella, dia: HOY, n: 3 } } }).ejecutar())[0].json.motivo).toBe('tope_de_intentos_del_dia')
  })
})

describe('nodos «Decidir y armar» y «Cierre»', () => {
  const eleg = { client_id: CID, huella: 'h9', brand_book_draft: { positioning: 'p', visual: VISUAL_VIEJO_SIN_NADA }, previo: { gate_outcome: 'paso_la_vara', fidelity_passed: true } }
  async function decidir(piso: Fila, intentos: Record<string, unknown> = {}, elegido: Fila = eleg, global?: Fila) {
    const est: Record<string, unknown> = { intentos, ...(global ? { global } : {}) }
    const $ = (n: string) => { if (n !== 'Elegir el cliente') throw new Error('nodo no ejecutado ' + n); return { first: () => ({ json: elegido }) } }
    const r = (await new AsyncFunction('$input', '$', '$getWorkflowStaticData', C.codigos().decidir)({ first: () => ({ json: piso }) }, $, () => est)) as Array<{ json: Fila }>
    return { json: r[0].json, est }
  }
  it('🔴 si el visual nuevo mejora: arma el cuerpo para la versión nueva y ANOTA el intento (huella + día + 1) y la corrida global', async () => {
    const { json, est } = await decidir({ brand_book_draft: { positioning: 'p', visual: { version: 2, estado: 'parcial', capa_grafica: { paleta: [{ color: '#c8102e' }] } } } })
    expect(json).toMatchObject({ promover: true, client_id: CID }); expect((json.cuerpo as Fila).source).toBe('visual_completar')
    expect(est.intentos).toEqual({ [CID]: { huella: 'h9', dia: HOY, n: 1 } }); expect(est.global).toEqual({ dia: HOY, n: 1 })
  })
  it('🔴 si NO mejora: no promueve, pero el intento y la corrida global SE ANOTAN igual (así no hay bucle ni gasto sin tope)', async () => {
    const { json, est } = await decidir({ brand_book_draft: { positioning: 'p', visual: { version: 2, estado: 'ausente', error: 'x' } } }, { [CID]: { huella: 'h8', dia: HOY, n: 1 } }, eleg, { dia: HOY, n: 2 })
    expect(json).toMatchObject({ promover: false }); expect(est.intentos).toEqual({ [CID]: { huella: 'h9', dia: HOY, n: 2 } }); expect(est.global).toEqual({ dia: HOY, n: 3 })
  })
  it('🔴 el visual con tipografía basura se reemplaza por uno limpio (usa el MISMO validador del piso)', async () => {
    const e = { ...eleg, brand_book_draft: { positioning: 'p', visual: VISUAL_COMPLETO_CON_BASURA } }
    expect((await decidir({ brand_book_draft: { positioning: 'p', visual: VISUAL_COMPLETO } }, {}, e)).json.promover).toBe(true)
    expect((await decidir({ brand_book_draft: { positioning: 'p', visual: VISUAL_COMPLETO_CON_BASURA } }, {}, e)).json.promover).toBe(false)
  })
  it('sin bloque visual nuevo no promueve (nunca promueve una versión con el visual roto)', async () => { expect((await decidir({ brand_book_draft: { positioning: 'p' } })).json.promover).toBe(false) })
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
  it('los nodos de Elegir y Decidir llevan el validador del piso (misma definición de «tipografía real») y ninguno usa module.exports ni require', () => {
    for (const nombre of ['Elegir el cliente', 'Decidir y armar']) expect(w.nodes.find((n: { name: string }) => n.name === nombre).parameters.jsCode).toContain('function nombreDeTipografiaObservada(')
    for (const n of w.nodes) if (n.parameters.jsCode) { expect(n.parameters.jsCode).not.toMatch(/module\.exports|require\(/) }
  })
})
