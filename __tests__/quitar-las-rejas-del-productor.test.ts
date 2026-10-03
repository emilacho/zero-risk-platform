/**
 * SIN REJAS AL PRODUCTOR · pruebas a costo cero con los datos REALES de Náufrago · CC#1 · 2026-10-03
 * (encargo Lenovo `quitar-las-rejas-del-productor` · canon de Emilio «sin rejas al agente»: el productor crea libre; el control es la aprobación de Emilio antes de publicar).
 *
 * 🔴 Cada prueba tiene que estar ROJA contra el estado de ANTES (main `02d3b48`, con las rejas de #420 y #421) y VERDE después:
 *   ① el productor puede usar de referencia CUALQUIER foto (propia, de otro producto, de la competencia) y alterarla: ni fatal, ni regla dura «sin foto del producto ⇒ no armes el prompt»
 *   ② el pedido ya no prohíbe marcas ni objetos ajenos en el prompt de imagen, y su chequeo no existe
 *   ③ SE QUEDA la información (cada foto con su texto, fecha, enlace y qué muestra; el productor declara qué foto usó y por qué) y los chequeos restantes son AVISOS:
 *      los únicos fatales son los técnicos (respuesta ilegible · pieza vacía · la vuelta no llegó)
 *   ④ el inventario de lo que SIGUE restringiendo al productor queda fijado por prueba (para que Emilio decida cuáles siguen)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const FX = join(process.cwd(), '__tests__', 'fixtures', 'fotos-contexto')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { codigoDeNodo } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
const completar = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'completar-contexto-fotos.mjs')).href)
const F = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'))
const BRF6 = JSON.parse(readFileSync(join(DIR, 'fixtures', 'brf-0006.json'), 'utf8'))
const RASPADO = JSON.parse(readFileSync(join(FX, 'raspado-instagram-propio.json'), 'utf8'))
const FILAS16: Record<string, unknown>[] = JSON.parse(readFileSync(join(FX, 'client-social-images-16-filas.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'

const huellas: Record<string, string> = {}
for (const f of FILAS16) huellas[String(f.id)] = ['DPti3m8jQJt', 'DPti3m8jQJt-c1'].includes(String(f.post_id)) ? 'misma' : 'h' + f.id
const plan = completar.planificar({ filas: FILAS16, raspados: [{ id: 'r', created_at: RASPADO.created_at, respuesta: [{ username: 'naufrago.ec', latestPosts: RASPADO.latestPosts }] }], huellas })
const FILAS = FILAS16.map((f) => ({ ...f, ...(plan.cambios.find((c: { id: unknown }) => c.id === f.id)?.parche ?? {}) })) as Record<string, unknown>[]
const FICHA = { id: CID, name: 'Náufrago', country: 'Ecuador', market: 'Guayaquil · Guayas', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }
const sede = (c: string) => ({ clave: c.toLowerCase(), ciudad: c, direccion: { estado: 'sin_dato', valor: null, fuentes: [] }, horario: { estado: 'sin_dato', valor: null, fuentes: [] }, canal_pedido: { estado: 'sin_dato', valor: null, fuentes: [] } })
const SEDES_INFO = { sedes_info: { sedes: [sede('Olón'), sede('Guayaquil')], textos_propios: [{ fecha: '2026-05-24', texto: 'Un texto propio de ejemplo para la voz de la casa', post: 'X' }], descartes: [] } }
const VOZ = { voice_description: 'Voz directa, costeña. Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {} }
const HEAD_OK = { httpRequest: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } }) }
const SOBRE = { client_id: CID, tenant_id: CID, parte_id: 'p', brief_id: 'BRF-0006', dry_run: false, tope_usd: 0.6, _sala_correlation_id: null }

async function correr(clave: string, input: unknown[], refs: Record<string, unknown>, helpers: unknown = {}) {
  const items = input.map((j) => ({ json: j }))
  const $ = (n: string) => { if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] } }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave)).call({ helpers }, { first: () => items[0], all: () => items }, $, {}, items[0]?.json, { id: 'WF' }, { id: '1', resumeUrl: 'x' })
}
async function cadena(brief: Record<string, unknown> = BRF6, filas: Record<string, unknown>[] = FILAS) {
  const base = { ...SOBRE, brief, brief_texto: 'BRIEF', protagonista: brief.protagonista, manual_voz: VOZ, forbidden_words: ['premium', 'barato'], required_terminology: ['marisco de Olón'], fotos: [], fotos_no_enviadas: [] }
  const t3 = await correr('guardaFotos', filas, { '② GUARDA · sin manual aprobado se DETIENE': base }, HEAD_OK)
  const t5 = await correr('cuerpo', [SEDES_INFO], { '④ ¿Ya hay pieza de este brief? · guarda': t3[0].json, '⑤ Ficha del cliente': FICHA })
  return t5[0].json
}
const CACHE: Record<string, Record<string, any>> = {} // eslint-disable-line @typescript-eslint/no-explicit-any
const real = async () => (CACHE.real ??= await cadena())
const HAMBURGUESA = { ...BRF6, protagonista: 'La hamburguesa doble de la casa', vocabulario_obligatorio: ['hamburguesa', 'delivery'] }
const sinProducto = async () => (CACHE.sinProducto ??= await cadena(HAMBURGUESA))

type Resp = { hallazgos: { chequeo: string; fatal: boolean; detalle: string }[]; pieza_valida: boolean; motivo_invalido: string | null; fatales?: string[] }
async function chequear(n5: Record<string, unknown>, pieza: Record<string, unknown>, briefMod: Record<string, unknown> = {}, extraC: Record<string, unknown> = {}): Promise<Resp & Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = {
    ...n5,
    llego_la_vuelta: true,
    texto: '```json\n' + JSON.stringify({ pieza: { titular: 'Ceviche de Olón', texto_principal: 'Escríbenos por WhatsApp y coordina tu pedido.', prompt_imagen: 'Overhead shot of a ceviche bowl on a wooden table, warm light', fuente_imagen: 'cliente', foto_referencia: { foto: 'F01', por_que: 'su texto dice ceviche' }, no_pude_cumplir: [], que_miro: ['miré las fotos'], fuera_de_la_foto: [], variantes: [{ id: 'A', titular: 'Ceviche de Olón', texto_principal: 'Escríbenos por WhatsApp y coordina tu pedido.' }, { id: 'B', titular: 'Ceviche de Olón', texto_principal: 'El almuerzo sin espera. Escríbenos por WhatsApp.' }], ...pieza } }) + '\n```',
    brief: { ...BRF6, ...briefMod }, brief_id: 'BRF-0006', parte_id: 'p', client_name: 'Náufrago', manual_id: 'm', manual_version: 1, forbidden_words: ['premium', 'barato'],
    fotos_en_la_tabla: 16, fotos_enviadas: 15, fotos_no_enviadas: [], fotos_excluidas: [], dry_run: false, tope_usd: 0.6, sedes_resumen: { leidas: false, error: 'x' }, ...extraC,
  }
  return (await correr('chequeos', [{}], { '⑥ ¿Llegó la vuelta?': c }))[0].json
}
const nombres = (r: Resp) => r.hallazgos.map((h) => h.chequeo)
const fatales = (r: Resp) => r.hallazgos.filter((h) => h.fatal).map((h) => h.chequeo)
const PROMPT_REAL = 'Overhead shot of a white ceramic bowl of ceviche: red onion, creamy avocado, pico de gallo and fresh cilantro, warm natural light, wooden table. Beside it stands a glass jar labeled Rukutu with an orange hot-sauce condiment inside.'
const refDe = (n5: any, post: string) => n5.fotos_ctx.find((f: { post_id: string }) => f.post_id === post).ref // eslint-disable-line @typescript-eslint/no-explicit-any

describe('① el productor puede usar de referencia CUALQUIER foto y alterarla · sin fatal, sin regla dura', () => {
  it('🔴 EL INCIDENTE DE LA 2.ª PIEZA: brief de ceviche y foto de referencia de encebollado ⇒ la pieza VALE (antes: FATAL y NO VÁLIDA)', async () => {
    const n5 = await real()
    const r = await chequear(n5, { foto_referencia: { foto: refDe(n5, 'DPti3m8jQJt'), por_que: 'me gusta la luz y el caldo' } })
    expect(fatales(r)).toEqual([])
    expect(r.pieza_valida).toBe(true)
    expect(r.motivo_invalido).toBeNull()
  })
  it('lo que sí queda es INFORMACIÓN para quien aprueba: un aviso (no fatal) dice que la foto de referencia muestra otro producto', async () => {
    const n5 = await real()
    const r = await chequear(n5, { foto_referencia: { foto: refDe(n5, 'DPti3m8jQJt'), por_que: 'x' } })
    const h = r.hallazgos.find((x) => x.chequeo === 'foto_referencia_de_otro_producto')!
    expect(h).toBeTruthy()
    expect(h.fatal).toBe(false)
    expect(h.detalle).toMatch(/informativo/)
  })
  it('🔴 sin foto del producto: armar el prompt NO es falta (antes: FATAL «prompt_sin_foto_del_producto» y aviso «hueco_de_foto_no_declarado»)', async () => {
    const n5 = await sinProducto()
    expect(n5.fotos_regla.sin_foto_del_producto).toBe(true) // la información sigue: el pedido sabe que no hay foto de ese producto
    const r = await chequear(n5, { fuente_imagen: 'cliente', prompt_imagen: 'A double burger on a wooden table', foto_referencia: { foto: 'F01', por_que: 'x' }, no_pude_cumplir: [] }, HAMBURGUESA)
    expect(nombres(r)).not.toContain('prompt_sin_foto_del_producto')
    expect(nombres(r)).not.toContain('hueco_de_foto_no_declarado')
    expect(fatales(r)).toEqual([])
    expect(r.pieza_valida).toBe(true)
  })
  it('🔴 el prompt puede nombrar otro plato del cliente (antes: FATAL «prompt_nombra_otro_producto»)', async () => {
    const r = await chequear(await real(), { fuente_imagen: 'generada', prompt_imagen: 'A steaming bowl of encebollado with chifles and lime', foto_referencia: null })
    expect(nombres(r)).not.toContain('prompt_nombra_otro_producto')
    expect(r.pieza_valida).toBe(true)
  })
  it('🔴 el pedido ya no prohíbe: ni «PROHIBIDO armar el prompt», ni «solo puedes usar las fotos marcadas», ni «NO copies su plato»; dice que puede usar CUALQUIER foto y alterarla', async () => {
    for (const n5 of [await real(), await sinProducto()]) {
      const t: string = n5.cuerpo.task
      expect(t).not.toMatch(/PROHIBIDO armar el prompt/)
      expect(t).not.toMatch(/solo puedes usar las fotos marcadas/)
      expect(t).not.toMatch(/NO copies su plato/)
      expect(t).not.toMatch(/Nunca uses de referencia una foto marcada/)
      expect(t).toMatch(/CUALQUIER foto/)
      expect(t).toMatch(/alterarla/)
    }
  })
  it('🔴 sin foto del producto el pedido INFORMA (no manda): dice que no hay foto asociada a ese producto y deja elegir', async () => {
    const t: string = (await sinProducto()).cuerpo.task
    expect(t).toMatch(/ninguna foto que su texto asocie a «/)
    expect(t).not.toMatch(/deja «prompt_imagen» VAC/)
  })
})

describe('② el pedido no prohíbe marcas ni objetos ajenos en el prompt de imagen · y no hay chequeo', () => {
  it('🔴 LA 3.ª PIEZA REAL (el frasco «Rukutu» de la foto): la pieza VALE y no hay aviso de marca ni de contacto ajeno', async () => {
    const r = await chequear(await real(), { prompt_imagen: PROMPT_REAL })
    expect(fatales(r)).toEqual([])
    expect(r.pieza_valida).toBe(true)
    expect(nombres(r).filter((n) => /marca|contacto|palabra_ajena/.test(n))).toEqual([])
  })
  it('🔴 un teléfono, un enlace, un @usuario o un texto entre comillas ajenos en el prompt tampoco se tocan', async () => {
    for (const p of ['Ceviche bowl with a jar showing WhatsApp +593 98 111 2233', 'Ceviche bowl, a card with www.otra-marca.com and a sticker @otra_marca', 'Ceviche next to a bottle that says “Corona Extra”, a Fanta bottle']) {
      const r = await chequear(await real(), { prompt_imagen: p })
      expect(nombres(r).filter((n) => /marca|contacto|palabra_ajena/.test(n)), p).toEqual([])
      expect(r.pieza_valida, p).toBe(true)
    }
  })
  it('🔴 el pedido ya no manda omitir marcas, rótulos, logos ni teléfonos de terceros y el contrato ya no trae «omitido_de_la_foto»', async () => {
    const t: string = (await real()).cuerpo.task
    expect(t).not.toMatch(/OMITE las marcas/)
    expect(t).not.toMatch(/omitido_de_la_foto/)
    expect(t).not.toMatch(/En el prompt sólo puede aparecer lo del cliente/)
  })
  it('🔴 la librería ya no tiene el chequeo ni la lista de lo «permitido» (código eliminado, no apagado)', () => {
    expect(F.permitidoDelPrompt).toBeUndefined()
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'), 'utf8')
    expect(src).not.toMatch(/prompt_con_marca_ajena|prompt_con_contacto_ajeno|prompt_con_palabra_ajena|prompt_nombra_otro_producto|prompt_sin_foto_del_producto/)
  })
})

describe('③ SE QUEDA la información y los chequeos son AVISOS · fatales sólo los técnicos', () => {
  it('🔴 la matriz de piezas «problemáticas» VALE todas: ninguna se detiene ni se reescribe (se avisa y decide quien aprueba)', async () => {
    const n5 = await real()
    const casos: [string, Record<string, unknown>, Record<string, unknown>][] = [
      ['foto de otro producto', { foto_referencia: { foto: refDe(n5, 'DPti3m8jQJt'), por_que: 'x' } }, {}],
      ['foto de la competencia / sin identificar', { foto_referencia: { foto: refDe(n5, 'DT1H9PDjH78'), por_que: 'x' } }, {}],
      ['prompt con marca y teléfono ajenos', { prompt_imagen: PROMPT_REAL + ' Phone +593 98 111 2233.' }, {}],
      ['palabra prohibida en una variante', { variantes: [{ id: 'A', titular: 'Ceviche', texto_principal: 'El ceviche premium.' }] }, {}],
      ['titular más largo que el límite', { titular: 'Ceviche de Olón que viene directo hasta tu puerta en Guayaquil' }, {}],
      ['voseo', { texto_principal: 'Pedilo ya.' }, {}],
      ['variantes pegadas en un solo texto', { variantes: [], texto_principal: 'Variante A: uno.\n\nVariante B: dos.' }, {}],
      ['con prompt en negativo', { prompt_imagen: 'A bowl without sauce, no people, never blurry' }, {}],
      ['no declara qué miró ni qué no pudo', { que_miro: [], no_pude_cumplir: undefined }, {}],
      ['fuente de imagen no declarada', { fuente_imagen: 'no_declarada' }, {}],
      ['pide algo que la foto no muestra y no lo declara', { fuera_de_la_foto: ['marisco visible'], no_pude_cumplir: [] }, {}],
    ]
    for (const [que, pieza, brief] of casos) {
      const r = await chequear(n5, pieza, brief)
      expect(fatales(r), que).toEqual([])
      expect(r.pieza_valida, que).toBe(true)
      expect(r.motivo_invalido, que).toBeNull()
    }
  })
  it('🔴 en el código de los chequeos y de la librería de fotos NO queda ningún fatal salvo los técnicos (pieza vacía · respuesta ilegible)', () => {
    const chequeos = readFileSync(join(DIR, 'pieza-chequeos.js'), 'utf8')
    const fatalesEnCodigo = [...chequeos.matchAll(/falla\('([a-z_]+)',[^\n]*?,\s*true\)/g)].map((m) => m[1])
    expect(fatalesEnCodigo).toEqual(['pieza_vacia'])
    const fotos = readFileSync(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'), 'utf8')
    expect(fotos).not.toMatch(/falla\([^\n]*,\s*true\)/)
    const nodo = readFileSync(join(DIR, 'n7-chequeos-nodo.js'), 'utf8')
    expect((nodo.match(/fatal: true/g) || []).length).toBe(1) // respuesta_no_legible
  })
  it('🔴 la librería de fotos NUNCA devuelve un hallazgo fatal (se prueba directo, sin la capa de los chequeos)', async () => {
    const n5 = await real()
    const otra = n5.fotos_ctx.find((f: { rol: string }) => f.rol === 'otro_producto').ref
    const hallazgos = [
      ...F.chequearFotoReferencia({ fuente_imagen: 'cliente', prompt_imagen: 'x', foto_referencia: { foto: otra, por_que: 'x' } }, n5.fotos_regla, BRF6),
      ...F.chequearFotoReferencia({ fuente_imagen: 'cliente', prompt_imagen: 'x', foto_referencia: { foto: 'F99', por_que: 'x' } }, n5.fotos_regla, BRF6),
      ...F.chequearFotoReferencia({ fuente_imagen: 'cliente', prompt_imagen: 'x', foto_referencia: null }, { ...n5.fotos_regla, sin_foto_del_producto: true }, BRF6),
      ...F.chequearLoQueLaFotoNoMuestra({ fuente_imagen: 'cliente', prompt_imagen: 'x', fuera_de_la_foto: ['marisco'], no_pude_cumplir: [] }),
      ...F.chequearLoQueLaFotoNoMuestra({ fuente_imagen: 'cliente', prompt_imagen: 'x' }),
    ]
    expect(hallazgos.length).toBeGreaterThanOrEqual(5)
    expect(hallazgos.filter((h: { fatal: boolean }) => h.fatal)).toEqual([])
  })
  it('los fatales TÉCNICOS siguen: pieza vacía · respuesta ilegible · la vuelta no llegó ⇒ NO VÁLIDA', async () => {
    const n5 = await real()
    const vacia = await chequear(n5, { titular: '', texto_principal: '', variantes: [] })
    expect(fatales(vacia)).toEqual(['pieza_vacia'])
    expect(vacia.pieza_valida).toBe(false)
    const ilegible = await chequear(n5, {}, {}, { texto: 'no soy un json ni una pieza' })
    expect(ilegible.pieza_valida).toBe(false)
    expect(nombres(ilegible)).toContain('respuesta_no_legible')
    const sinVuelta = await chequear(n5, {}, {}, { llego_la_vuelta: false, motivo: 'la vuelta del productor no llegó' })
    expect(sinVuelta.pieza_valida).toBe(false)
  })
  it('🔴 la INFORMACIÓN se queda: cada foto viaja con su texto, fecha, enlace y qué muestra; la declaración de la foto usada y por qué', async () => {
    const n5 = await real()
    const t: string = n5.cuerpo.task
    expect(t).toMatch(/texto de la publicación: «Rukutu: el toque perfecto para acompañar un delicioso ceviche/)
    expect(t).toMatch(/2025-10-12 · https:\/\/www\.instagram\.com\/p\/DPti3m8jQJt\//)
    expect(t).toMatch(/ES el producto del brief/)
    expect(t).toMatch(/NO es el producto del brief \(el texto nombra: encebollado\)/)
    expect(t).toMatch(/"foto_referencia": \{ "foto": "F01"/)
    expect(t).toMatch(/«foto_referencia»: la CLAVE/)
    expect(n5.cuerpo.images).toHaveLength(15) // ninguna foto escondida
    const r = await chequear(n5, { foto_referencia: { foto: 'F01', por_que: 'su texto dice ceviche' } })
    expect(r.fila_pieza.provenance_tag.fotos.foto_referencia).toMatchObject({ foto: 'F01' })
    expect(r.fila_pieza.provenance_tag.fotos.ctx).toHaveLength(15)
  })
  it('los avisos de DECLARACIÓN siguen (información, no reja): sin la clave de la foto · clave inventada · foto sin producto identificado', async () => {
    const n5 = await real()
    expect(nombres(await chequear(n5, { foto_referencia: null }))).toContain('foto_referencia_no_declarada')
    expect(nombres(await chequear(n5, { foto_referencia: { foto: 'F99', por_que: 'x' } }))).toContain('foto_referencia_inexistente')
    expect(nombres(await chequear(n5, { foto_referencia: { foto: refDe(n5, 'DT1H9PDjH78'), por_que: 'x' } }))).toContain('foto_referencia_sin_producto_identificado')
  })
})

describe('④ el inventario de lo que SIGUE restringiendo al productor (fijado por prueba para que Emilio decida cuáles siguen)', () => {
  it('el pedido conserva exactamente estas restricciones (cada una con su razón en el resultado)', async () => {
    const n5 = await real()
    const t: string = n5.cuerpo.task
    const quedan: [string, RegExp][] = [
      ['brief manda / no rehacerlo', /Tu trabajo NO es opinar sobre el brief ni rehacerlo/],
      ['límites de caracteres + vocabulario obligatorio + palabras prohibidas', /Respeta los límites de caracteres del brief\. Usa el vocabulario obligatorio\. NUNCA uses una palabra prohibida/],
      ['un solo mensaje y el llamado del brief', /UN solo mensaje: el del brief/],
      ['no inventar datos (horario, dirección, teléfono)', /No inventes datos que no estén en el brief/],
      ['prompt de imagen en positivo', /El prompt para la imagen va EN POSITIVO/],
      ['la fuente de la imagen la decide el brief', /La fuente de la imagen la decide el brief, no tú/],
      ['mirar_afuera: máximo de pedidos', /MÁXIMO [0-9]+ pedidos en total/],
      ['mirar_afuera: sin anuncios de pago', /NO uses anuncios_en_meta ni anuncios_en_google/],
      ['mirar_afuera: comprobar nombre y ciudad de Mapas', /Antes de citar una ficha de Mapas comprueba que el nombre y la CIUDAD sean los del cliente/],
      ['sedes: horario SÓLO de la sede del brief y sin inventarlo', /usa SOLO el horario de ESA sede/],
      ['voz: no copiar los textos de referencia', /no los copies, no repitas sus datos/],
      ['trato de la marca', /El trato de esta marca es|EL TRATO de esta marca es/],
      ['variantes en campos, sin concatenar', /NUNCA concatenes las variantes dentro de un solo campo/],
      ['formato: UN bloque JSON', /Responde EXCLUSIVAMENTE con UN bloque JSON/],
    ]
    for (const [que, re] of quedan) expect(t, que).toMatch(re)
    expect(n5.cuerpo.max_budget_usd).toBe(0.6) // tope de gasto por llamada
    expect(n5.cuerpo.mirar_afuera_limites).toMatchObject({ max_pedidos: 5 })
    expect(n5.cuerpo.thinking_mode).toBe('disabled')
  })
  it('los chequeos que quedan son sólo AVISOS (lista fijada): ninguno detiene ni reescribe', async () => {
    const n5 = await real()
    const r = await chequear(n5, { titular: 'x'.repeat(60), texto_principal: ['Pedilo premium.', 'Variante A: uno.', '', 'Variante B: dos.'].join(String.fromCharCode(10)), variantes: [], prompt_imagen: 'A bowl, no people', fuente_imagen: 'no_declarada', foto_referencia: null, que_miro: [], no_pude_cumplir: undefined, fuera_de_la_foto: ['marisco'] })
    const esperados = ['limite_de_caracteres', 'palabra_prohibida', 'termino_obligatorio_ausente', 'fuente_de_imagen_no_declarada', 'prompt_con_negaciones', 'trato_distinto_al_del_cliente', 'variantes_concatenadas', 'no_declaro_lo_que_miro', 'no_declaro_lo_que_no_pudo']
    for (const e of esperados) expect(nombres(r), e).toContain(e)
    expect(fatales(r)).toEqual([])
    expect(r.pieza_valida).toBe(true)
    // con imagen del cliente: lo que la foto no muestra se avisa (información) y la foto usada se declara
    const c = await chequear(n5, { fuente_imagen: 'cliente', foto_referencia: null, fuera_de_la_foto: ['marisco'], no_pude_cumplir: [] })
    for (const e of ['foto_referencia_no_declarada', 'foto_no_muestra_lo_que_pide_el_brief', 'elemento_fuera_de_la_foto_sin_declarar']) expect(nombres(c), e).toContain(e)
    expect(fatales(c)).toEqual([])
    expect(c.pieza_valida).toBe(true)
  })
})

describe('el flujo sigue igual de grande', () => {
  it('27 nodos · 0 reintentos · 0 lecturas fuera de orden', async () => {
    const { construirFlujo } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
    const { lecturasFueraDeOrden } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30', 'lecturas-fuera-de-orden.mjs')).href)
    const f = construirFlujo()
    expect(f.nodes).toHaveLength(27)
    expect(f.nodes.filter((n: { retryOnFail?: boolean }) => n.retryOnFail)).toHaveLength(0)
    expect(lecturasFueraDeOrden(f)).toEqual([])
  })
})
