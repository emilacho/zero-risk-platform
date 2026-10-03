/**
 * EL TRATO (tú · vos · usted) ES DE LA MARCA · pruebas a costo cero · CC#1 · 2026-10-03
 * (encargo Lenovo «cada foto viaja con todo su contexto» punto 5 · incidente real: la 2.ª pieza salió con «Pedilo directo» (voseo) en una marca que TUTEA, copiado de su brief).
 *
 * 🔴 Cada prueba tiene que estar ROJA contra el estado de ANTES (commit `e667b5c`) y VERDE después:
 *   · el trato sale del MANUAL de marca o de la ficha del cliente, no de una regla fija
 *   · el brief y la pieza lo respetan · un chequeo detecta el voseo (y el tuteo, y el usted) cuando la marca usa otro
 * Agnóstico: la detección es de FORMAS del español, no de frases ni clientes.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let T: any = null
try { T = require(join(process.cwd(), 'src', 'lib', 'trato', 'trato-logica.js')) } catch { /* estado de ANTES */ }
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const PIEZA = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const BRIEF = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const { codigoDeNodo, N } = await import(pathToFileURL(join(PIEZA, 'construir-pieza.mjs')).href)
const brief = await import(pathToFileURL(join(BRIEF, 'construir-brief.mjs')).href)
const BRF6 = JSON.parse(readFileSync(join(PIEZA, 'fixtures', 'brf-0006.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'

// la descripción de voz REAL del manual de Náufrago (leída de la base el 03-oct)
const VOZ_REAL = 'Voz directa, costeña y económica con las palabras. Tutea siempre (tú/sabes/pides — nunca vos). Ancla geográfica explícita: Olón, no "la costa" ni "el mar" genérico. Copy corto: una idea por frase.'

describe('① el trato sale del MANUAL o de la ficha · no de una regla fija', () => {
  it('🔴 la voz real del manual dice «Tutea siempre (… nunca vos)» ⇒ TÚ, y el «vos» está NEGADO (no cuenta como mención)', () => {
    const r = T.resolverTrato({ voice_description: VOZ_REAL }, { country: 'Ecuador' })
    expect(r).toMatchObject({ trato: 'tu', fuente: 'manual' })
    expect(r.evidencia).toMatch(/niega vos/)
  })
  it('un campo EXPLÍCITO del manual (tone_guidelines.trato) manda sobre la prosa · y el de la ficha sobre el default', () => {
    expect(T.resolverTrato({ voice_description: VOZ_REAL, tone_guidelines: { trato: 'vos' } }, {})).toMatchObject({ trato: 'vos', fuente: 'manual' })
    expect(T.resolverTrato({}, { config: { voz: { trato: 'usted' } }, country: 'Argentina' })).toMatchObject({ trato: 'usted', fuente: 'ficha' })
  })
  it('un manual de OTRA marca que voseaa ⇒ VOS (misma lógica · cero reglas del cliente)', () => {
    expect(T.resolverTrato({ voice_description: 'Hablá con voseo rioplatense, cálido y cercano.' }, { country: 'Ecuador' })).toMatchObject({ trato: 'vos', fuente: 'manual' })
    expect(T.resolverTrato({ voice_description: 'Trato formal de usted, sobrio.' }, {})).toMatchObject({ trato: 'usted' })
  })
  it('«tu puerta» (posesivo) NO es una mención de tuteo', () => {
    expect(T.resolverTrato({ voice_description: 'Entregado directo a tu puerta. Frases cortas.' }, {}).trato).toBe('no_definido')
  })
  it('el manual menciona dos tratos sin negar ninguno ⇒ «conflicto» (no se elige · no se comprueba)', () => {
    const r = T.resolverTrato({ voice_description: 'Tutea a los clientes y vosea a los amigos de la casa.' }, {})
    expect(r.trato).toBe('conflicto')
    expect(T.chequearTrato(r, 'Pedilo ya', 'la pieza')).toEqual([])
  })
  it('sin manual ni ficha: el trato habitual del país, DECLARADO de baja confianza · sin país ⇒ «no_definido» y NO se comprueba', () => {
    expect(T.resolverTrato({}, { country: 'Ecuador' })).toMatchObject({ trato: 'tu', fuente: 'default_por_pais' })
    expect(T.resolverTrato({}, { country: 'Argentina' })).toMatchObject({ trato: 'vos', fuente: 'default_por_pais' })
    expect(T.resolverTrato({}, { market: 'Guayaquil · Ecuador' })).toMatchObject({ trato: 'tu' })
    const nada = T.resolverTrato({}, {})
    expect(nada).toMatchObject({ trato: 'no_definido', fuente: 'ninguna' })
    expect(T.chequearTrato(nada, 'Pedilo ya', 'la pieza')).toEqual([])
  })
})

describe('② las FORMAS de cada trato (conjugación del español · no frases)', () => {
  it('🔴 «Pedilo directo» (el incidente real) es voseo · «Pídelo directo» es tuteo', () => {
    expect(T.formasDeTrato('Pedilo directo por WhatsApp').vos).toEqual(['pedilo'])
    expect(T.formasDeTrato('Pídelo directo por WhatsApp').tu).toEqual(['pídelo'])
    expect(T.formasDeTrato('Pídelo directo por WhatsApp').vos).toEqual([])
  })
  it('imperativos, clíticos y presente del voseo', () => {
    const v = T.formasDeTrato('Mandá tu pedido, vení a probar, contanos, escribinos, tenés hambre, sos de acá, querés más').vos
    for (const w of ['mandá', 'vení', 'contanos', 'escribinos', 'tenés', 'sos', 'querés']) expect(v, w).toContain(w)
  })
  it('tuteo: pronombre, presente de segunda persona y clíticos acentuados', () => {
    const t = T.formasDeTrato('Tú eres de aquí, tienes hambre. Escríbenos, llámanos y mándanos tu pedido').tu
    for (const w of ['tú', 'eres', 'tienes', 'escríbenos', 'llámanos', 'mándanos']) expect(t, w).toContain(w)
  })
  it('usted: pronombre y el imperativo formal', () => {
    const u = T.formasDeTrato('Usted puede pedir. Llame ya y mande su pedido').usted
    for (const w of ['usted', 'llame', 'mande']) expect(u, w).toContain(w)
  })
  it('SIN falsos positivos en español común: «más», «además», «país», «café», «está», «interés», «también», «Olón», «jueves»', () => {
    const t = 'Más sabor, además de un buen café. El país está de fiesta. Tienes interés también. Jueves a lunes en Olón, de 7am a 3pm. Delivery directo a tu puerta.'
    expect(T.formasDeTrato(t)).toEqual({ vos: [], tu: ['tienes'], usted: [] })
  })
  it('la pieza REAL buena (tuteo puro) no dispara nada', () => {
    const buena = 'El ceviche que viene de Olón de verdad — pídelo por WhatsApp, jueves a lunes, 7am a 3pm, Guayaquil. Envíanos tu mensaje y te respondemos. Directo a tu puerta.'
    expect(T.chequearTrato({ trato: 'tu', fuente: 'manual', evidencia: 'x' }, buena, 'la pieza')).toEqual([])
  })
})

describe('③ el chequeo detecta el trato equivocado (candidato · no fatal) en el flujo de la pieza', () => {
  const TU = { trato: 'tu', fuente: 'manual', evidencia: 'la descripción de voz del manual lo dice (tu · niega vos)' }
  async function correrSiete(pieza: Record<string, unknown>, briefMod: Record<string, unknown> = {}, trato: unknown = TU) {
    const c = {
      llego_la_vuelta: true, texto: '```json\n' + JSON.stringify({ pieza: { titular: 'Ceviche de Olón', texto_principal: 'Pídelo por WhatsApp.', prompt_imagen: 'A bowl', fuente_imagen: 'generada', no_pude_cumplir: [], que_miro: ['brief'], foto_referencia: null, ...pieza } }) + '\n```',
      brief: { ...BRF6, ...briefMod }, brief_id: 'BRF-0006', parte_id: 'p', client_id: CID, client_name: 'Náufrago', manual_id: 'm', manual_version: 1, forbidden_words: [], fotos_en_la_tabla: 0, fotos_enviadas: 0, fotos_no_enviadas: [], fotos_excluidas: [],
      fotos_regla: null, fotos_ctx: [], trato, dry_run: false, cuerpo: {}, tope_usd: 0.6, sedes_resumen: { leidas: false, error: 'x' },
    }
    const r = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo('chequeos')).call({}, { first: () => ({ json: {} }), all: () => [{ json: {} }] }, (n: string) => ({ first: () => ({ json: (({ '⑥ ¿Llegó la vuelta?': c }) as Record<string, unknown>)[n] }) }), {}, {}, { id: 'WF' }, { id: '1', resumeUrl: 'x' })
    return r[0].json
  }
  it('🔴 EL INCIDENTE REAL: la pieza dice «Pedilo directo» y la marca TUTEA ⇒ hallazgo «trato_distinto_al_del_cliente» con la palabra y la fuente', async () => {
    const r = await correrSiete({ texto_principal: 'Pedilo directo por WhatsApp, jueves a lunes.' })
    const h = r.hallazgos.find((x: { chequeo: string }) => x.chequeo === 'trato_distinto_al_del_cliente')
    expect(h).toBeTruthy()
    expect(h.detalle).toMatch(/«pedilo» \(voseo\)/)
    expect(h.detalle).toMatch(/el trato de la marca es tuteo \(manual/)
    expect(h.fatal).toBe(false) // candidato: lo decide quien aprueba (como los demás chequeos de texto)
    expect(r.pieza_valida).toBe(true)
  })
  it('la mezcla del incidente («Pedilo directo» en una variante y «Envíanos» en otra) se detecta en la parte equivocada', async () => {
    const r = await correrSiete({ texto_principal: 'Variante A: Pedilo directo. Variante B: Envíanos tu mensaje.' })
    const h = r.hallazgos.find((x: { chequeo: string }) => x.chequeo === 'trato_distinto_al_del_cliente')
    expect(h.detalle).toMatch(/«pedilo»/)
    expect(h.detalle).not.toMatch(/envíanos/i)
  })
  it('🔴 el BRIEF que trae voseo también se declara («brief_en_otro_trato»): el productor copió «pedilo» de ahí', async () => {
    const r = await correrSiete({}, { mensaje: 'El ceviche que viene de Olón de verdad — pedilo por WhatsApp.' })
    const h = r.hallazgos.find((x: { chequeo: string }) => x.chequeo === 'brief_en_otro_trato')
    expect(h).toBeTruthy()
    expect(h.detalle).toMatch(/el brief trae formas de otro trato: «pedilo»/)
  })
  it('CONTROL POSITIVO: pieza y brief en tuteo ⇒ ningún hallazgo de trato', async () => {
    const r = await correrSiete({})
    expect(r.hallazgos.filter((x: { chequeo: string }) => /trato/.test(x.chequeo))).toEqual([])
  })
  it('la regla es de la MARCA, no del idioma: una marca que VOSEA recibe el aviso al revés («Pídelo» ⇒ tuteo)', async () => {
    const VOS = { trato: 'vos', fuente: 'manual', evidencia: 'tone_guidelines.trato = «vos»' }
    const r = await correrSiete({ texto_principal: 'Pídelo por WhatsApp. Escríbenos.' }, {}, VOS)
    expect(r.hallazgos.find((x: { chequeo: string }) => x.chequeo === 'trato_distinto_al_del_cliente').detalle).toMatch(/tuteo/)
    const bien = await correrSiete({ texto_principal: 'Pedilo por WhatsApp. Escribinos.' }, { mensaje: 'Pedilo ya' }, VOS)
    expect(bien.hallazgos.filter((x: { chequeo: string }) => /trato/.test(x.chequeo))).toEqual([])
  })
  it('sin trato resuelto o «no_definido»: NO se comprueba (no se inventa una regla)', async () => {
    const r = await correrSiete({ texto_principal: 'Pedilo ya' }, {}, { trato: 'no_definido', fuente: 'ninguna', evidencia: 'x' })
    expect(r.hallazgos.filter((x: { chequeo: string }) => /trato/.test(x.chequeo))).toEqual([])
  })
})

describe('④ el pedido a la pieza y al brief dicen el trato de la marca (y de dónde sale)', () => {
  const FICHA = { id: CID, name: 'Mi Marca', country: 'Ecuador', market: 'Guayaquil', config: { apify: { own_handles: { instagram: 'mimarca' } } } }
  const SEDES = { sedes_info: { sedes: [], textos_propios: [], descartes: [] } }
  async function cuerpoPieza(manualVoz: unknown, ficha = FICHA) {
    const prev = { client_id: CID, brief_id: 'BRF-0006', dry_run: false, tope_usd: 0.6, brief: BRF6, brief_texto: 'BRIEF', protagonista: 'x', protagonistas_del_plan: [], fotos: [], fotos_filas: [], fotos_no_enviadas: [], manual_voz: manualVoz }
    const r = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo('cuerpo')).call({}, { first: () => ({ json: SEDES }), all: () => [{ json: SEDES }] }, (n: string) => ({ first: () => ({ json: n === N.guardaRepetida ? prev : ficha }), all: () => [{ json: ficha }] }), {}, {}, { id: 'WF' }, { id: '1', resumeUrl: 'x' })
    return r[0].json
  }
  it('🔴 ⑤ pieza: con el manual que tutea el pedido dice TÚ y su fuente (antes: ni una palabra del trato)', async () => {
    const j = await cuerpoPieza({ voice_description: VOZ_REAL })
    expect(j.cuerpo.task).toMatch(/F\) EL TRATO de esta marca es TÚ \(tuteo\) \(fuente: manual/)
    expect(j.cuerpo.task).toMatch(/Si el brief trae formas de OTRO trato .* NO las copies/)
    expect(j.trato).toMatchObject({ trato: 'tu', fuente: 'manual' })
  })
  it('otra marca (voseo en su manual): el pedido dice VOS · sin manual y con país conocido: TÚ por default DECLARADO · sin nada: «no sabe»', async () => {
    expect((await cuerpoPieza({ voice_description: 'Voseo siempre' })).cuerpo.task).toMatch(/EL TRATO de esta marca es VOS/)
    expect((await cuerpoPieza({})).cuerpo.task).toMatch(/default_por_pais/)
    const sinPais = await cuerpoPieza({}, { ...FICHA, country: undefined, market: undefined } as never)
    expect(sinPais.cuerpo.task).toMatch(/El sistema NO sabe qué trato/)
  })
  it('🔴 el flujo del BRIEF: el pedido del redactor lleva el trato de la marca (el brief ya no copia el trato de una conversación)', async () => {
    const AF = AsyncFunction
    const prev = { client_id: CID, plan_id: 'p', manual_id: 'm', manual_version: 1, manual_texto: 'M', plan_texto: 'PLAN', dry_run: true, manual_voz: { voice_description: VOZ_REAL } }
    const r = await new AF('$input', '$', '$env', '$json', '$workflow', '$execution', brief.codigoDeNodo('cuerpo')).call({}, { first: () => ({ json: FICHA }) }, () => ({ first: () => ({ json: prev }) }), {}, {}, { id: 'WF' }, { id: '1', resumeUrl: 'x' })
    expect(r[0].json.cuerpo.task).toMatch(/EL TRATO de esta marca es TÚ/)
    expect(r[0].json.cuerpo.task).toMatch(/Esto vale para todo texto que el brief PROPONGA al público/)
    expect(r[0].json.trato.trato).toBe('tu')
  })
  it('🔴 el chequeo del BRIEF declara «brief_en_otro_trato» por entregable (candidato · no fatal)', async () => {
    const { armarSimulacroSano } = await import(pathToFileURL(join(BRIEF, 'simulacro-parte-sano.js')).href).catch(() => ({ armarSimulacroSano: null })) as { armarSimulacroSano: null | ((a: string, b: unknown) => string) }
    // el simulacro es un script de nodo (no módulo): se arma una parte mínima y legible a mano
    const parte = { entregables: [{ id: 'BRF-0001', plataforma: 'Instagram', tipo_de_pieza: 'imagen', que_es: 'x', de_que_parte_del_plan: 'x', objetivo: 'x', segmento: 'x', protagonista: 'p', mensaje: 'Pedilo por WhatsApp', hipotesis: 'x', limites: 'x', vocabulario_obligatorio: [], prohibido: [], sintaxis: 'x', visual: { capa_que_manda: 'producto', descripcion: 'x', muestra: 'x' }, llamado_a_la_accion: 'Mandanos un mensaje', variantes: 'x', negativos: [], aprueba_y_para_cuando: 'x', presupuesto: null }], pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [], dependencias: [] }
    void armarSimulacroSano
    const c = { llego_la_vuelta: true, texto: '```json\n' + JSON.stringify({ parte }) + '\n```', forbidden_words: [], required_terminology: [], plan_texto: 'PLAN', trato: { trato: 'tu', fuente: 'manual', evidencia: 'x' }, client_id: CID, brief_id: null }
    const r = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', brief.codigoDeNodo('chequeos')).call({}, { first: () => ({ json: c }), all: () => [{ json: c }] }, () => ({ first: () => ({ json: c }) }), {}, {}, { id: 'WF' }, { id: '1', resumeUrl: 'x' }).catch((e: Error) => ({ error: e.message }))
    expect(Array.isArray(r) || r.error === undefined, String(r.error)).toBe(true)
    const j = r[0].json
    const h = j.hallazgos.filter((x: { chequeo: string }) => x.chequeo === 'brief_en_otro_trato')
    expect(h).toHaveLength(1)
    expect(h[0]).toMatchObject({ entregable: 'BRF-0001' })
    expect(h[0].detalle).toMatch(/«pedilo» \(voseo\)|«mandanos» \(voseo\)/)
  })
  it('las consultas piden la voz del manual (pieza y brief) y la ficha con país y mercado (brief)', () => {
    const f = JSON.stringify(brief.construirFlujo().nodes.map((n: { parameters: { url?: string } }) => n.parameters.url))
    expect(f).toMatch(/voice_description,writing_style,tone_guidelines/)
    expect(f).toMatch(/clients\?select=id,name,country,market,config/)
  })
})
