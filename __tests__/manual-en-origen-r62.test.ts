/**
 * Relevo 62 · el MANUAL en el ORIGEN (firma de Emilio «tras la prueba desde cero (tramo 1)»). Todo en seco: sin n8n, sin modelo, sin red (US$ 0).
 *
 * Caso real: el manual v1 que salió del tramo 1 (fixture) · defectos medidos: «origen verificable», «denominación de origen implícita», «el origen es la prueba»,
 * cifras de competidores sin fuente · y la frase propia del cliente NO llegó a ninguna casilla.
 *   ① cimiento · Fan-out prep: las 3 lentes reciben las reglas de evidencia · SOLO la lente del eslogan recibe la frase propia (primera opción de tagline_opciones)
 *      · el tope sube lo que suman, la evidencia no cede un carácter más · sin frase hallada, nada nuevo salvo las reglas
 *   ② cimiento · nodo «Sacar lo sin fuente»: corre el código REAL del nodo contra la puerta REAL de M2 (rutaRecomprobar) con una base falsa
 *      · saca lo sin fuente, deja lo creativo y la capa visual intactos, NO escribe el eslogan, el registro interno no va a la bandeja · ruta caída ⇒ sigue y lo declara
 *   ③ Lazo A · Re-síntesis prep: el que reescribe recibe las mismas reglas sin perder evidencia
 *   ④ nada más cambió respecto de los respaldos ANTES · los dos flujos siguen inactivos
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { rutaRecomprobar } from '../src/lib/manual/rutas'
import { filaInstagram, filaSitio } from '../src/lib/manual/__tests__/apoyo'
import { REGLAS_EVIDENCIA, TOPE_FRASE } from '../scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-r62.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any>; notes?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const CIM_ANTES = leer('ssLtwYPt7zxuvnM2/cimiento-ANTES-2026-10-10-r62.json') as Flujo
const CIM = leer('ssLtwYPt7zxuvnM2/cimiento-ARREGLADO-2026-10-10-r62.json') as Flujo
const LAZO_ANTES = leer('ssLtwYPt7zxuvnM2/lazoA-ANTES-2026-10-10-r62.json') as Flujo
const LAZO = leer('ssLtwYPt7zxuvnM2/lazoA-ARREGLADO-2026-10-10-r62.json') as Flujo
const EV44 = leer('ssLtwYPt7zxuvnM2/evidencia-146544-e109.json') as { nodos: Record<string, any>; todos: Record<string, any[]> }
const MANUAL = JSON.parse(readFileSync(join(process.cwd(), 'src/lib/manual/__tests__/fixtures/manual-prueba-tramo-1.json'), 'utf8')) as Record<string, any>

const FANOUT = '[BB] Fan-out prep'
const SACAR = '[BB] Sacar lo sin fuente (antes del Promote)'
const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
const PROMOTE_PREP = '[BB] Promote prep'
const RESINTESIS = '[BBA] Re-síntesis prep'
const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x }
const codigo = (f: Flujo, n: string) => String(nodo(f, n).parameters.jsCode)
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

/** el motor en miniatura (síncrono) para los nodos que no llaman a la red */
function correr(code: string, ctx: { nodos: Record<string, any>; todos?: Record<string, any[]>; json?: any }) {
  const $ = (n: string) => {
    if (!(n in ctx.nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: ctx.nodos[n] }), all: () => (ctx.todos?.[n] ?? [ctx.nodos[n]]).map((j) => ({ json: j })), item: { json: ctx.nodos[n] } }
  }
  return new Function('$', '$json', '$execution', code)($, ctx.json ?? {}, { id: '999001' }) as Array<{ json: any }>
}

const FRASE = 'Cuando tengas esa hambre de... Náufrago te espera!'
/** el arranque del bloque que ordena usar la frase (la frase sola ya viajaba, dentro del JSON de evidencia, y nadie la escribió en el manual) */
const ORDEN_DE_LA_FRASE = 'FRASE PROPIA DEL CLIENTE (la halló el código, literal, en su sitio y su perfil social):'
const materia = (extra: Record<string, unknown> = {}) => ({ idioma: 'español de Ecuador', sitio_estado: 'trajo', sitio_texto: 'x'.repeat(3500), sitio_caracteres_total: 16006, instagram_propio: 'y'.repeat(1000), instagram_estado: 'trajo', ...extra })
const ctxFan = (m: Record<string, unknown> | null) => {
  const nodos = JSON.parse(JSON.stringify(EV44.nodos)); const todos = JSON.parse(JSON.stringify(EV44.todos))
  if (m) { nodos['Confirm barato · competitor list'].discovery_package.materia_cliente = m; todos['Confirm barato · competitor list'][0].discovery_package.materia_cliente = m }
  return { nodos, todos, json: nodos['[BB] Load ICP (canon)'] }
}
const LENTES = ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']

describe('① Fan-out prep · reglas a las 3 lentes, frase propia solo a la del eslogan', () => {
  const hallada = materia({ estado_frase_propia: 'hallado', frase_propia: FRASE })
  it('rojo (el cimiento de hoy): ninguna lente trae reglas de evidencia ni la frase', () => {
    const [o] = correr(codigo(CIM_ANTES, FANOUT), ctxFan(hallada))
    for (const l of LENTES) { expect(o.json.tasks[l]).not.toContain('REGLAS DE EVIDENCIA'); expect(o.json.tasks[l]).not.toContain(ORDEN_DE_LA_FRASE) }   // la frase viajaba SOLO dentro del JSON de evidencia: nadie ordenaba usarla
  })
  it('verde: las TRES lentes traen las reglas, y SOLO editor-en-jefe la frase con la orden de la primera opción de tagline_opciones', () => {
    const [o] = correr(codigo(CIM, FANOUT), ctxFan(hallada))
    for (const l of LENTES) expect(o.json.tasks[l]).toContain(REGLAS_EVIDENCIA)
    expect(o.json.tasks['editor-en-jefe']).toContain(ORDEN_DE_LA_FRASE + ' «' + FRASE + '».')
    expect(o.json.tasks['editor-en-jefe']).toMatch(/TAL CUAL, sin cambiar una letra, como PRIMERA opción de `tagline_opciones`/)
    expect(o.json.tasks['brand-strategist']).not.toContain(ORDEN_DE_LA_FRASE)
    expect(o.json.tasks['jefe-client-success']).not.toContain(ORDEN_DE_LA_FRASE)
  })
  it('las reglas son las del descubridor (cita literal · «el cliente dice» · certeza solo con fuente primaria · el lugar no es origen · el resumen no es fuente) y agnósticas', () => {
    for (const k of ['cita literal', 'el cliente dice', 'origen, verificable, trazabilidad, denominación', 'único', 'fuente primaria', 'NUNCA es el origen del producto', 'no una fuente']) expect(REGLAS_EVIDENCIA).toContain(k)
    expect(REGLAS_EVIDENCIA).not.toMatch(/Olón|Náufrago|ceviche|marisco|restaurante/i)
    expect(REGLAS_EVIDENCIA.length).toBeLessThan(1400)
  })
  it('el tope sube lo que suman: la evidencia que cede es EXACTAMENTE la de antes · todas las tareas caben bajo el techo de 16.000', () => {
    for (const m of [hallada, materia()]) {
      const [antes] = correr(codigo(CIM_ANTES, FANOUT), ctxFan(m))
      const [ahora] = correr(codigo(CIM, FANOUT), ctxFan(m))
      expect(ahora.json._corte.evidencia_omitida).toEqual(antes.json._corte.evidencia_omitida)
      expect(ahora.json._corte.hubo).toBe(antes.json._corte.hubo)
      expect(ahora.json._corte.lentes_recortadas).toEqual([])
      for (const l of LENTES) { expect(ahora.json.tasks[l].length).toBeLessThanOrEqual(16000); expect(ahora.json._corte.margen_por_lente[l]).toBeGreaterThanOrEqual(0) }
    }
  })
  it('lo único que cambia en cada tarea son las reglas (y la frase en la del eslogan): quitadas, queda IDÉNTICA a la de antes', () => {
    const [antes] = correr(codigo(CIM_ANTES, FANOUT), ctxFan(hallada))
    const [ahora] = correr(codigo(CIM, FANOUT), ctxFan(hallada))
    const sinFrase = (t: string) => t.replace(/\n\nFRASE PROPIA DEL CLIENTE \(la halló el código[^\n]*/, '')
    for (const l of LENTES) expect(sinFrase(ahora.json.tasks[l]).split(REGLAS_EVIDENCIA).join('')).toBe(antes.json.tasks[l])
  })
  it('sin frase hallada (o dudosa, o sin materia) NO hay bloque de frase: no se inventa una frase del cliente', () => {
    for (const m of [materia(), materia({ estado_frase_propia: 'sin_dato', frase_propia: null }), materia({ estado_frase_propia: 'dudoso', frase_propia: FRASE }), null]) {
      const [o] = correr(codigo(CIM, FANOUT), ctxFan(m))
      for (const l of LENTES) { expect(o.json.tasks[l]).not.toContain('FRASE PROPIA DEL CLIENTE'); expect(o.json.tasks[l]).toContain(REGLAS_EVIDENCIA) }
    }
  })
  it('una frase larguísima se corta al tope y no revienta el pedido', () => {
    const [o] = correr(codigo(CIM, FANOUT), ctxFan(materia({ estado_frase_propia: 'hallado', frase_propia: 'palabra '.repeat(400) })))
    const t = o.json.tasks['editor-en-jefe'] as string
    const dentro = t.match(/«([^»]*)»\. Escríbela TAL CUAL/)![1]
    expect(dentro.length).toBeLessThanOrEqual(TOPE_FRASE)
    expect(t.length).toBeLessThanOrEqual(16000)
  })
})

// ─────────────────────────── ② el nodo que saca
const C = '96864e88-79bc-47ff-8f8e-5bf88610ec7d'
function baseFalsa(): DbFalsa {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: C, name: 'Cliente de práctica', website_url: 'https://www.clinicaejemplo.test', country: 'EC', config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
  const filas = [
    filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'Cliente de práctica · ' + FRASE, text: 'Ceviche y encebollado todos los días. Pedidos por WhatsApp. Atendemos de lunes a domingo.' }]),
    filaInstagram('i1', 'clinicaejemplo', FRASE + '\n📍 Ciudad Ejemplo'),
  ]
  db.semilla('apify_raw', filas.map((f) => ({ ...f, client_id: C, ensayo: false, created_at: '2026-10-10' })))
  db.semilla('client_icp_documents', [])
  return db
}
type Salida = { json: Record<string, any> }
async function correrSacar(db: DbFalsa, opciones: { fallaRuta?: number; fallaRegistro?: boolean; draft?: Record<string, any> } = {}) {
  const llamadas: Array<{ url: string; body: any }> = []
  let falloRuta = opciones.fallaRuta ?? 0
  const httpRequest = async (o: { url: string; body: any }) => {
    llamadas.push({ url: o.url, body: o.body })
    if (o.url.endsWith('/api/manual/recomprobar')) {
      if (falloRuta-- > 0) throw new Error('503 la ruta no contestó')
      const r = await rutaRecomprobar(db as never, o.body)
      if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body)}`)
      return r.body
    }
    if (o.url.endsWith('/rest/v1/client_historical_outputs')) {
      if (opciones.fallaRegistro) throw new Error('403 sin permiso')
      const r = await db.from('client_historical_outputs').insert(o.body).select('id').single()
      if (r.error) throw new Error(r.error.message)
      return {}
    }
    throw new Error('url no prevista ' + o.url)
  }
  const $ = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: { client_id: C } }) } }
  const j = { brand_book_draft: opciones.draft ?? JSON.parse(JSON.stringify(MANUAL)), fidelity: { pass: true, scores: { positioning: 0.9 } }, cycle: 1, _fidelity_cycle: 0 }
  const fn = new AsyncFunction('$', '$json', '$env', '$execution', codigo(CIM, SACAR))
  const out = (await fn.call({ helpers: { httpRequest } }, $, j, { ZERO_RISK_API_URL: 'https://app.test', INTERNAL_API_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' }, { id: '999002' })) as Salida[]
  return { out, llamadas, j }
}
const MALAS = ['origen costero verificable', 'denominación de origen implícita', 'el origen es la prueba', 'Origen verificable', 'frescura verificable', 'origen geográfico específico', 'el lugar de origen del marisco', 'origen manabita']

describe('② «Sacar lo sin fuente» · el manual v1 de hoy contra la puerta REAL de M2', () => {
  it('el manual v1 trae lo que se midió (rojo): las frases sin fuente están en el borrador de entrada', () => {
    const t = JSON.stringify(MANUAL)
    for (const m of MALAS) expect(t).toContain(m)
    expect(MANUAL.tagline).toBeUndefined()
  })
  it('saca lo sin fuente · deja la capa visual, las listas y lo creativo intactos · NO escribe el eslogan · pasa el resto del ítem', async () => {
    const db = baseFalsa()
    const { out, llamadas, j } = await correrSacar(db)
    const m = out[0].json.brand_book_draft as Record<string, any>
    const t = JSON.stringify(m)
    for (const mala of MALAS) expect(t).not.toContain(mala)
    expect(m.visual).toEqual(MANUAL.visual)                                   // la capa visual la arma el código: no es prosa del autor
    expect(m.forbidden_words).toEqual(MANUAL.forbidden_words)
    expect(m.required_terminology).toEqual(MANUAL.required_terminology)
    expect(m.tagline_opciones).toEqual(MANUAL.tagline_opciones)               // las opciones del eslogan no se tocan
    expect(m.tagline).toBeUndefined()                                         // NO se escribe el eslogan por código
    expect(m.voice_description).toContain('Voz directa y conversacional')    // lo creativo se respeta
    expect(m.client_id).toBe(MANUAL.client_id)
    expect(out[0].json.fidelity).toEqual(j.fidelity)                          // el resto del ítem viaja intacto (Promote prep lo necesita)
    expect(out[0].json.cycle).toBe(1)
    expect(llamadas[0].body).toMatchObject({ client_id: C, sin_manual_previo: true, sin_eslogan: true })
    expect(llamadas.filter((l) => l.url.endsWith('/api/manual/recomprobar'))).toHaveLength(1)
  })
  it('r63 · SIN FRAGMENTOS: ningún texto del manual que sale empieza en minúscula ni trae puntuación huérfana; lo mutilado queda PENDIENTE y provisional; en listas se quita el elemento entero', async () => {
    const { out } = await correrSacar(baseFalsa())
    const m = out[0].json.brand_book_draft as Record<string, any>
    const hojas: Array<[string, string]> = []
    const ver = (v: unknown, r: string): void => { if (typeof v === 'string') { hojas.push([r, v]); return } if (Array.isArray(v)) v.forEach((x, i) => ver(x, `${r}[${i}]`)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) ver(x, `${r}.${k}`) }
    for (const c of ['positioning', 'icp_summary', 'voice_description', 'mision', 'personalidad', 'mensajes_clave', 'propuestas_de_valor']) ver(m[c], c)
    expect(hojas.length).toBeGreaterThan(5)
    for (const [r, t] of hojas) {
      if (r.includes('[')) expect(t.trim(), r).not.toBe('')            // un elemento de lista vacío no se deja (un campo suelto que sale entero queda vacío: A3)
      expect(t, r).not.toMatch(/^\s*[a-záéíóúñ]/)                        // «sabés exactamente…» · «sirviendo a comensales…»
      expect(t, r).not.toMatch(/\.\s+:|(?<!\b(?:vs|etc|ej))\.\s+[a-záéíóúñ]|(^|\s)[:;,]\s/)  // «. :» · «Cercano. el trato…» · coma/dos puntos sueltos
    }
    expect(m.positioning).toBe('PENDIENTE: reescribir con fuente')      // «marisco de Olón, fresco… En Olón.» ya no se guarda como si fuera el posicionamiento
    expect(m._field_meta.positioning).toMatchObject({ provisional: true })
    expect(m.personalidad.length).toBeLessThan(MANUAL.personalidad.length) // lo mutilado se quitó entero, no se dejó «Transparente. no con adjetivos»
    const reg = (await (async () => { const db = baseFalsa(); await correrSacar(db); return db.tablas['client_historical_outputs'][0].provenance_tag as any })()).registro_interno.retirados as Array<{ marca: string }>
    expect(reg.some((x) => x.marca === 'fragmento')).toBe(true)         // lo quitado va solo al registro interno
    expect(JSON.stringify(m)).not.toMatch(/fragmento/)
  })
  it('el registro interno guarda lo sacado (con su cláusula y motivo) · NUNCA bandeja · el manual no lleva el texto sacado', async () => {
    const db = baseFalsa()
    const { out } = await correrSacar(db)
    const s = (out[0].json.brand_book_draft as any)._sacar
    expect(s.estado).toBe('sacado')
    expect(s.retirados_n).toBeGreaterThanOrEqual(20)
    expect(s.registro).toBe('guardado')
    const filas = db.tablas['client_historical_outputs'] ?? []
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ client_id: C, output_type: 'manual_sacado_en_origen', status: 'draft' })
    const reg = (filas[0].provenance_tag as any).registro_interno.retirados as Array<{ clausula: string; motivo: string }>
    expect(reg.length).toBe(s.retirados_n)
    expect(reg.every((r) => r.clausula && r.motivo)).toBe(true)
    expect(reg.some((r) => /origen/i.test(r.clausula))).toBe(true)
    expect(JSON.stringify(s)).not.toMatch(/origen/i)                         // el resumen que viaja en el manual no repite lo sacado
    expect(db.tablas['hitl_queue']?.length ?? 0).toBe(0)                      // ni bandeja
  })
  it('es idempotente: lo que ya salió limpio vuelve a pasar sin sacar nada y sin otro registro', async () => {
    const db = baseFalsa()
    const uno = await correrSacar(db)
    const limpio = uno.out[0].json.brand_book_draft as Record<string, any>
    const dos = await correrSacar(db, { draft: limpio })
    expect((dos.out[0].json.brand_book_draft as any)._sacar).toMatchObject({ estado: 'limpio', retirados_n: 0, registro: 'sin_nada_que_registrar' })
    expect(db.tablas['client_historical_outputs']).toHaveLength(1)
  })
  it('ruta caída: reintenta UNA vez · si sigue caída el manual sigue SIN revisar y lo DECLARA (no para el alta)', async () => {
    const db = baseFalsa()
    const { out, llamadas } = await correrSacar(db, { fallaRuta: 2 })
    expect(llamadas.filter((l) => l.url.endsWith('/recomprobar'))).toHaveLength(2)
    const m = out[0].json.brand_book_draft as Record<string, any>
    expect(m._sacar.estado).toBe('no_se_pudo')
    expect(m._sacar.motivo).toContain('503')
    expect(m.positioning).toBe(MANUAL.positioning)                            // sin tocar
    expect(db.tablas['client_historical_outputs']).toBeUndefined()
  })
  it('una caída de la primera llamada se recupera con el reintento', async () => {
    const { out } = await correrSacar(baseFalsa(), { fallaRuta: 1 })
    expect((out[0].json.brand_book_draft as any)._sacar.estado).toBe('sacado')
  })
  it('registro que no se puede escribir: el manual sale limpio igual y se DECLARA', async () => {
    const { out } = await correrSacar(baseFalsa(), { fallaRegistro: true })
    const m = out[0].json.brand_book_draft as Record<string, any>
    expect(m._sacar.estado).toBe('sacado')
    expect(m._sacar.registro).toMatch(/^no_se_pudo/)
    expect(JSON.stringify(m)).not.toContain('origen costero verificable')
  })
  it('sin borrador: no llama a nada y lo declara', async () => {
    const { out, llamadas } = await correrSacar(baseFalsa(), { draft: {} })
    expect(llamadas).toHaveLength(0)
    expect((out[0].json.brand_book_draft as any)._sacar.estado).toBe('no_se_pudo')
  })
})

describe('② la ruta de M2: las dos opciones nuevas están APAGADAS por omisión', () => {
  const cuerpo = (extra: Record<string, unknown>) => ({ client_id: C, despues: JSON.parse(JSON.stringify(MANUAL)), ...extra })
  it('sin manual guardado y sin la opción: 409 sin_manual (igual que antes)', async () => {
    const r = await rutaRecomprobar(baseFalsa() as never, cuerpo({}))
    expect(r.status).toBe(409)
    expect((r.body as any).error).toBe('sin_manual')
  })
  it('con sin_manual_previo: 200 · sin `despues` es 400', async () => {
    expect((await rutaRecomprobar(baseFalsa() as never, cuerpo({ sin_manual_previo: true }))).status).toBe(200)
    const r = await rutaRecomprobar(baseFalsa() as never, { client_id: C, sin_manual_previo: true })
    expect(r.status).toBe(400)
  })
  it('el eslogan: por omisión la puerta lo escribe (como M2) · con sin_eslogan NO', async () => {
    const db = baseFalsa()
    const con = await rutaRecomprobar(db as never, cuerpo({ sin_manual_previo: true }))
    const sin = await rutaRecomprobar(db as never, cuerpo({ sin_manual_previo: true, sin_eslogan: true }))
    expect((con.body as any).eslogan.aplicado).toBe(true)
    expect((con.body as any).manual.tagline).toBe(FRASE)
    expect((sin.body as any).eslogan.aplicado).toBe(false)
    expect((sin.body as any).manual.tagline).toBeUndefined()
  })
  it('sin_manual_previo no cambia nada para un cliente CON manual guardado', async () => {
    const db = baseFalsa()
    db.semilla('client_brand_books', [{ id: 'b1', client_id: C, version: 1, created_at: '2026-10-10', content_text: JSON.stringify({ brand_book_draft: MANUAL }) }])
    const a = await rutaRecomprobar(db as never, cuerpo({}))
    const b = await rutaRecomprobar(db as never, cuerpo({ sin_manual_previo: true }))
    expect(b.body).toEqual(a.body)
  })
})

// ─────────────────────────── ③ Lazo A
describe('③ Lazo A · Re-síntesis prep (el que reescribe positioning/icp_summary)', () => {
  const entrada = () => ({
    brand_book_draft: { client_id: C, positioning: 'p'.repeat(900), icp_summary: 'i'.repeat(900), voice_description: 'v'.repeat(400) },
    _grounding_refs: { client_name: 'Cliente de práctica', industry: 'x', discovery_summary: 'resumen '.repeat(150), competitors: [{ name: 'A' }, { name: 'B' }], icp_signals: { segments: ['[S1] uno'], pain_points: ['[S1] dolor'], goals: ['[S1] meta'] } },
    client_id: C, cycle: 1, _fidelity_cycle: 1, low_fields: ['positioning'], corrections_bloqueantes: [{ eje: 'factual', campo: 'positioning', severidad: 'rojo', problema: 'z'.repeat(200) }], _lazo_a: { max_cycles: 1 },
  })
  it('rojo: hoy el reescritor no recibe las reglas · verde: las recibe, antes de las correcciones y de la evidencia', () => {
    const [antes] = correr(codigo(LAZO_ANTES, RESINTESIS), { nodos: {}, json: entrada() })
    const [ahora] = correr(codigo(LAZO, RESINTESIS), { nodos: {}, json: entrada() })
    expect(antes.json.task).not.toContain('REGLAS DE EVIDENCIA')
    const t = ahora.json.task as string
    expect(t).toContain(REGLAS_EVIDENCIA)
    expect(t.indexOf('REGLAS DE EVIDENCIA')).toBeLessThan(t.indexOf('CORRECCIONES:'))
    expect(t.indexOf('CORRECCIONES:')).toBeLessThan(t.indexOf('EVIDENCIA:\n'))
  })
  it('la evidencia no pierde ni un carácter por las reglas · lo demás queda idéntico', () => {
    const [antes] = correr(codigo(LAZO_ANTES, RESINTESIS), { nodos: {}, json: entrada() })
    const [ahora] = correr(codigo(LAZO, RESINTESIS), { nodos: {}, json: entrada() })
    expect((ahora.json.task as string).split(REGLAS_EVIDENCIA).join('')).toBe(antes.json.task)
    expect(ahora.json._resynth_scope).toEqual(antes.json._resynth_scope)
  })
  it('con la evidencia llena el tope sube lo que suman las reglas: la cola de la evidencia llega igual', () => {
    const j = entrada(); j._grounding_refs.discovery_summary = 'resumen largo '.repeat(400)
    const [antes] = correr(codigo(LAZO_ANTES, RESINTESIS), { nodos: {}, json: j })
    const [ahora] = correr(codigo(LAZO, RESINTESIS), { nodos: {}, json: j })
    const cola = (t: string) => t.slice(t.indexOf('EVIDENCIA:\n'))
    expect(cola(ahora.json.task)).toBe(cola(antes.json.task))
    expect((ahora.json.task as string).length).toBeLessThanOrEqual(7900 + REGLAS_EVIDENCIA.length)
  })
})

// ─────────────────────────── ④ nada más cambió
describe('④ solo lo pedido cambió · los dos flujos siguen apagados', () => {
  const huella = (n: Nodo) => JSON.stringify({ t: n.type, p: n.parameters })
  it('cimiento: cambia SOLO Fan-out prep · +1 nodo (Sacar) · y Piso visual → Sacar → Promote prep', () => {
    const a = new Map(CIM_ANTES.nodes.map((n) => [n.name, n])), b = new Map(CIM.nodes.map((n) => [n.name, n]))
    expect(CIM.nodes.map((n) => n.name).filter((n) => !a.has(n))).toEqual([SACAR])
    expect([...a.keys()].filter((n) => !b.has(n))).toEqual([])
    expect([...a.keys()].filter((n) => huella(a.get(n)!) !== huella(b.get(n)!))).toEqual([FANOUT])
    expect(CIM.connections[PISO].main[0].map((x) => x.node)).toEqual([SACAR])
    expect(CIM.connections[SACAR].main[0].map((x) => x.node)).toEqual([PROMOTE_PREP])
    const resto = Object.keys(CIM_ANTES.connections).filter((k) => k !== PISO)
    for (const k of resto) expect(CIM.connections[k]).toEqual(CIM_ANTES.connections[k])
    expect(Object.keys(CIM.connections).sort()).toEqual([...Object.keys(CIM_ANTES.connections), SACAR].sort())
  })
  it('Lazo A: cambia SOLO Re-síntesis prep', () => {
    const a = new Map(LAZO_ANTES.nodes.map((n) => [n.name, n])), b = new Map(LAZO.nodes.map((n) => [n.name, n]))
    expect(b.size).toBe(a.size)
    expect([...a.keys()].filter((n) => huella(a.get(n)!) !== huella(b.get(n)!))).toEqual([RESINTESIS])
    expect(LAZO.connections).toEqual(LAZO_ANTES.connections)
  })
  it('la vara, el juez y el Promote no se tocan · los dos flujos quedan inactivos', () => {
    for (const n of ['[BB] Judge prep', '[BB] Faithfulness judge', '[BB] Promote prep', '[BB] Promote → canon', '[BB] Consolidador']) expect(huella(nodo(CIM, n))).toBe(huella(nodo(CIM_ANTES, n)))
    expect(CIM_ANTES.active).toBe(false)
    expect(CIM.active).toBe(false)
    expect(LAZO.active).toBe(false)
  })
  it('el nodo Sacar no escribe el eslogan por código ni manda nada a bandeja ni Slack', () => {
    const c = codigo(CIM, SACAR)
    expect(c).toContain('sin_eslogan: true')
    expect(c).not.toMatch(/hitl_queue|\/api\/hitl|chat\.postMessage|hooks\.slack|tagline\s*[:=]/i)
    expect(c).toContain("'manual_sacado_en_origen'")
  })
})

describe('② quitarClausula · al inicio del texto no queda un guion ni dos puntos colgando', () => {
  it('«— marisco…» y «: sabés…» pierden la puntuación huérfana; el resto no cambia', async () => {
    const { quitarClausula } = await import('../src/lib/manual/firmes')
    expect(quitarClausula('Se diferencia por X — marisco fresco, artesanal.', 'Se diferencia por X')).toBe('marisco fresco, artesanal.')
    expect(quitarClausula('Cliente: algo falso: lo demás se queda.', 'Cliente: algo falso')).toBe('lo demás se queda.')
    expect(quitarClausula('Primera parte. Algo falso. Última parte.', 'Algo falso')).toBe('Primera parte. Última parte.')
  })
})
