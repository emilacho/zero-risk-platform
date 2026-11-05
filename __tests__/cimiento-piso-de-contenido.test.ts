/**
 * LA VARA DE LOS JUECES DEL MANUAL · el piso de contenido propio (CC#1 · 20-oct · encargo de Lenovo «limpiar y arreglar» · parte 2). US$ 0.
 * Prueba real del 20-oct: un manual con la voz «PENDIENTE» y misión/propósito sin señal sacó 0,95/0,95/0,93 de fidelidad y pasó la vara: el juez mide si lo escrito está SOPORTADO, no si HAY contenido.
 * Aquí se EJECUTA el texto real de «[BB] Promote prep» y de «Return scores a parent» del Cimiento preparado y se compara con el vivo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/ssLtwYPt7zxuvnM2')
const M = await import(pathToFileURL(path.join(D, 'construir-piso-de-contenido-2026-10-20.mjs')).href)
type Flujo = { nodes: Array<{ name: string; parameters: Record<string, any> }>; connections: unknown }
const leer = (f: string, dir = D) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Flujo
const antes = leer('ssLtwYPt7zxuvnM2-ANTES-piso-de-contenido-2026-10-20.json')
const nuevo = leer('ssLtwYPt7zxuvnM2-ARREGLADO-piso-de-contenido-2026-10-20.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

type Piso = { ok: boolean; motivos: string[]; voz_pendiente: boolean; ausentes: string[] }
const piso = new Function(M.BLOQUE + '\nreturn pisoDeContenidoPropio')() as (d: unknown) => Piso

// ───────────────────────── los dos manuales de la vida real (reducidos a lo que mide el piso)
const VOZ_REAL = 'Tuteo constante y sin excepción — la marca habla de igual a igual, nunca desde arriba. Frases cortas, cercanas, con humor sano y vocabulario del lugar.'
const HUECO = { // el manual de la prueba real: fiel (0,95) y vacío
  positioning: 'En un mercado de recarga de extintores altamente commoditizado, el territorio estratégico es la certeza de cumplimiento regulatorio.',
  icp_summary: 'Se identifican tres segmentos de audiencia unidos por la obligatoriedad regulatoria.',
  voice_description: 'PENDIENTE: el cliente no tiene sitio web activo y no se recuperó contenido scrapeado de Instagram. Sin texto primario disponible, la voz observada no puede determinarse desde evidencia primaria en esta etapa.',
  campos_ausentes: ['personalidad', 'proposito'],
  _field_meta: { personalidad: { estado: 'ausente' }, proposito: { estado: 'ausente' }, mision: { estado: 'con_pendientes' }, voice_description: { estado: 'con_pendientes' }, positioning: { estado: 'sin_hechos' } },
}
const LLENO = { // el manual de un cliente con contenido real
  positioning: 'Cocina de mar sin pretensiones, para gente que llega con hambre.', icp_summary: 'Familias y viajeros de la zona.',
  voice_description: VOZ_REAL, campos_ausentes: [], _field_meta: { personalidad: { estado: 'sin_hechos' }, voice_description: { estado: 'sin_hechos' } },
}
const PASO = { pass: true, threshold: 0.85, scores: { positioning: 0.95, icp_summary: 0.95, voice_description: 0.93 } }
const NO_PASO = { pass: false, exhausted: true, threshold: 0.85, scores: { positioning: 0.5, icp_summary: 0.9 } }

describe('el piso de contenido propio (el texto que se pega en el Cimiento)', () => {
  it('el manual de la prueba real —fiel y vacío— NO tiene contenido propio, y dice por qué', () => {
    const r = piso(HUECO)
    expect(r.ok).toBe(false); expect(r.voz_pendiente).toBe(true)
    expect(r.motivos.join(' ')).toMatch(/voz del manual está vacía o PENDIENTE/)
  })
  it('un manual con voz real y sin campos ausentes pasa', () => {
    expect(piso(LLENO)).toMatchObject({ ok: true, motivos: [], voz_pendiente: false, ausentes: [] })
  })
  it('la voz pendiente se reconoce por cualquier frase de «no hay» (mayúsculas, tildes, otra forma) y por el estado «ausente»', () => {
    for (const v of ['PENDIENTE: nada', 'Pendiente', '  pendiente de definir', 'No determinada con la evidencia', 'No disponible', 'Sin datos', 'N/A', 'Por definir', 'TBD', 'No se recuperó contenido', '', '   ', null, undefined]) expect(piso({ ...LLENO, voice_description: v }).ok, String(v)).toBe(false)
    expect(piso({ ...LLENO, _field_meta: { voice_description: { estado: 'ausente' } } }).ok).toBe(false)
  })
  it('una voz que solo CONTIENE la palabra «pendiente» más adelante no es una voz pendiente', () => {
    expect(piso({ ...LLENO, voice_description: 'Cercana y directa; evita dejar nada pendiente en el trato con el cliente.' }).ok).toBe(true)
  })
  it('tres o más campos de identidad sin señal bastan por sí solos; dos no', () => {
    expect(piso({ ...LLENO, campos_ausentes: ['personalidad', 'proposito', 'mision'] })).toMatchObject({ ok: false })
    expect(piso({ ...LLENO, campos_ausentes: ['personalidad', 'proposito'] }).ok).toBe(true)
    // sin `campos_ausentes` se cuentan los `_field_meta` en estado «ausente»
    const meta = { _field_meta: { a: { estado: 'ausente' }, b: { estado: 'ausente' }, c: { estado: 'ausente' } } }
    expect(piso({ voice_description: VOZ_REAL, ...meta }).ok).toBe(false)
  })
  it('no revienta con basura', () => { for (const x of [undefined, null, {}, 5, 'x', []]) expect(() => piso(x), String(x)).not.toThrow() })
})

// ───────────────────────── ejecutar los nodos
function correr(codigo: string, o: { json: Record<string, unknown>; nodos?: Record<string, Record<string, unknown>> }) {
  const $ = (n: string) => { const v = (o.nodos ?? {})[n]; if (v === undefined) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: v }), all: () => [{ json: v }] } }
  return new Function('$json', '$', codigo)(o.json, $) as Array<{ json: Record<string, any> }>
}
const NODOS_PROMOTE = { 'Validate Deal Data': { client_id: 'c-1', _sin_web: true }, '[BB] Guardia de procedencia': { _procedencia: 'padre' } }
// el Promote usa `$json` y `$(...)`; se ejecuta envuelto en una función (el texto del nodo usa `return`)
const promote = (draft: unknown, fidelity: unknown) => correr(nodo(nuevo, M.N_PROMOTE).parameters.jsCode as string, { json: { fidelity, brand_book_draft: draft }, nodos: NODOS_PROMOTE })[0].json
const retorno = (draft: unknown, fidelity: unknown, extra: Record<string, unknown> = {}) => correr(nodo(nuevo, M.N_RETORNO).parameters.jsCode as string, { json: { fidelity, brand_book_draft: draft, client_id: 'c-1', ...extra } })[0].json

describe('«[BB] Promote prep»: la vara que se persiste es fidelidad Y piso', () => {
  it('🔴 fiel pero HUECO (el caso de la prueba real): NO es «paso_la_vara»: sale marcado «sin_contenido_propio», firmado por el piso, y registra por qué', () => {
    const r = promote(HUECO, PASO)
    expect(r.gate_outcome).toBe('sin_contenido_propio')
    expect(r.should_persist).toBe(true) // el manual SALE siempre, marcado
    expect(r.promote_body).toMatchObject({ fidelity_passed: false, gate_outcome: 'sin_contenido_propio', approved_by: 'piso_de_contenido' })
    expect(r.promote_body.gate_nota).toMatch(/SIN contenido propio del cliente/); expect(r.promote_body.gate_nota).toMatch(/voz del manual/)
    expect(r.promote_body.brand_book.piso_contenido).toMatchObject({ ok: false, voz_pendiente: true })
    expect(r.piso_contenido.ok).toBe(false)
  })
  it('fiel y con contenido: «paso_la_vara», como siempre, firmado por la fidelidad', () => {
    const r = promote(LLENO, PASO)
    expect(r.gate_outcome).toBe('paso_la_vara')
    expect(r.promote_body).toMatchObject({ fidelity_passed: true, gate_outcome: 'paso_la_vara', gate_nota: null, approved_by: 'faithfulness_check' })
    expect(r.promote_body.brand_book.piso_contenido).toMatchObject({ ok: true })
  })
  it('no fiel (tope agotado): sigue siendo «salio_al_tope» y «cap_agotado», con o sin contenido (lo de antes no cambia)', () => {
    for (const d of [HUECO, LLENO]) {
      const r = promote(d, NO_PASO)
      expect(r.gate_outcome).toBe('salio_al_tope')
      expect(r.promote_body).toMatchObject({ fidelity_passed: false, gate_outcome: 'salio_al_tope', gate_nota: 'salió al tope, no alcanzó la vara', approved_by: 'cap_agotado' })
    }
  })
  it('el candado de procedencia sigue: sin el proceso padre no promueve', () => {
    expect(() => correr(nodo(nuevo, M.N_PROMOTE).parameters.jsCode as string, { json: { fidelity: PASO, brand_book_draft: LLENO }, nodos: { ...NODOS_PROMOTE, '[BB] Guardia de procedencia': { _procedencia: 'manual' } } })).toThrow(/CIMIENTO_PROMOCION_SIN_PADRE/)
  })
  it('lo demás del cuerpo no cambia (los campos del manual, las listas, el origen)', () => {
    const r = promote(LLENO, PASO)
    expect(r.promote_body.source).toBe('onboarding_collaborative_build'); expect(r.promote_body.brand_book).toMatchObject({ gated_fields_only: true, campos_gateados: ['positioning', 'icp_summary'], provisional: true })
    expect(r.client_id).toBe('c-1')
  })
})

describe('«Return scores a parent»: el padre recibe el mismo veredicto', () => {
  it('🔴 fiel pero HUECO: `track_pass:false`, marcado, razón «sin_contenido_propio»; sigue PUBLICADO (el manual sale)', () => {
    const r = retorno(HUECO, PASO)
    expect(r).toMatchObject({ track_pass: false, track_marked: true, track_reason: 'sin_contenido_propio', track_published: true, _cimiento_return: true })
    expect(r.piso_contenido).toMatchObject({ ok: false })
  })
  it('fiel y con contenido: igual que antes (`track_pass:true`, razón «pass»)', () => {
    expect(retorno(LLENO, PASO)).toMatchObject({ track_pass: true, track_marked: false, track_reason: 'pass', track_published: true })
  })
  it('no fiel: las razones de antes se conservan (ciclos agotados, fidelidad baja, juez incompleto, ciclo estéril)', () => {
    expect(retorno(LLENO, NO_PASO)).toMatchObject({ track_pass: false, track_reason: 'ciclos_agotados' })
    expect(retorno(LLENO, { ...NO_PASO, exhausted: false })).toMatchObject({ track_pass: false, track_reason: 'fidelidad_baja' })
    expect(retorno(LLENO, { ...NO_PASO, judge_incomplete: true })).toMatchObject({ track_reason: 'juez_incompleto' })
    expect(retorno(HUECO, { ...NO_PASO, _lazo: { esteril: 'sin_mejora' } })).toMatchObject({ track_reason: 'ciclo_esteril:sin_mejora' })
  })
})

describe('lo que cambia en el Cimiento: DOS nodos, y el ANTES es el estado del modo seco', () => {
  it('solo cambian «[BB] Promote prep» y «Return scores a parent»; nodos y cables iguales', () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    expect(nuevo.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n) => n.name)).toEqual([M.N_PROMOTE, M.N_RETORNO])
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(antes.connections))
  })
  it('🔴 LINAJE: el ANTES es EXACTAMENTE lo que dejó el modo seco; el constructor reproduce el ARREGLADO y no se construye dos veces', () => {
    const seco = leer('ssLtwYPt7zxuvnM2-ARREGLADO-seco-2026-10-19.json', path.resolve(D, '../modo-seco'))
    expect(JSON.stringify(antes.nodes.map((n) => [n.name, n.parameters]))).toBe(JSON.stringify(seco.nodes.map((n) => [n.name, n.parameters])))
    expect(JSON.stringify(M.construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => M.construirFlujo(nuevo)).toThrow(/ya trae/)
  })
  it('conserva los saltos de línea de cada nodo y no lleva llaves ni nombres de clientes en lo agregado', () => {
    const CRLF = String.fromCharCode(13, 10)
    for (const n of [M.N_PROMOTE, M.N_RETORNO]) expect((nodo(nuevo, n).parameters.jsCode as string).includes(CRLF), n).toBe((nodo(antes, n).parameters.jsCode as string).includes(CRLF))
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    for (const p of ['naufrago', 'náufrago', 'zerorisk', 'guayaquil', 'olon', 'extintor']) expect(M.BLOQUE.toLowerCase().includes(p), p).toBe(false)
  })
})
