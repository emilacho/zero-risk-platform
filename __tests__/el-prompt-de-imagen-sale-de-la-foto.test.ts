/**
 * EL PROMPT DE IMAGEN SALE DE LA FOTO · pruebas a costo cero con los datos REALES de Náufrago · CC#1 · 2026-10-03
 * (encargo Lenovo `el-prompt-de-imagen-sale-de-la-foto` · origen: certificación de CC#3 de la 3.ª pieza real, BRF-0006).
 *
 * 🔴 Cada prueba tiene que estar ROJA contra el estado de ANTES (main `824570a`) y VERDE después:
 *   ① sin marcas, rótulos ni contactos AJENOS en el prompt de imagen (la 3.ª pieza pedía el frasco «Rukutu» de la foto de referencia)
 *   ② el prompt describe lo que la foto muestra: lo que el brief pide y la foto NO trae se DECLARA (la 3.ª escribió «marisco visible» sin que se viera)
 *   ③ las variantes van en CAMPOS separados (la 3.ª entregó «Variante A: … Variante B: …» dentro de un solo texto)
 *   ④ «coincide en parte»: un producto de varias palabras que la foto nombra sólo en parte se ve (recomendación 3.1 de CC#3)
 * Agnóstico: la lógica no nombra clientes, platos ni marcas; los nombres de estas pruebas son datos de prueba.
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let F: any = null
try { F = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js')) } catch { /* ANTES */ }
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
const SEDES_INFO = { sedes_info: { sedes: [sede('Olón'), sede('Guayaquil')], textos_propios: [], descartes: [] } }
const VOZ = { voice_description: 'Voz directa, costeña. Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {} }
const HEAD_OK = { httpRequest: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } }) }
const SOBRE = { client_id: CID, tenant_id: CID, parte_id: 'p', brief_id: 'BRF-0006', dry_run: false, tope_usd: 0.6, _sala_correlation_id: null }

async function correr(clave: string, input: unknown[], refs: Record<string, unknown>, helpers: unknown = {}) {
  const items = input.map((j) => ({ json: j }))
  const $ = (n: string) => { if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] } }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave)).call({ helpers }, { first: () => items[0], all: () => items }, $, {}, items[0]?.json, { id: 'WF' }, { id: '1', resumeUrl: 'x' })
}
/** ③ → ⑤ como lo haría el flujo · devuelve la salida de ⑤ (lo que viaja hasta ⑦) */
async function cadena(brief: Record<string, unknown> = BRF6, filas: Record<string, unknown>[] = FILAS, extra: Record<string, unknown> = {}) {
  const base = { ...SOBRE, brief, brief_texto: 'BRIEF', protagonista: brief.protagonista, manual_voz: VOZ, forbidden_words: ['premium', 'barato'], required_terminology: ['marisco de Olón'], fotos: [], fotos_no_enviadas: [], ...extra }
  const t3 = await correr('guardaFotos', filas, { '② GUARDA · sin manual aprobado se DETIENE': base }, HEAD_OK)
  const t5 = await correr('cuerpo', [SEDES_INFO], { '④ ¿Ya hay pieza de este brief? · guarda': t3[0].json, '⑤ Ficha del cliente': FICHA })
  return t5[0].json
}
let CADENA: Record<string, any> | null = null // eslint-disable-line @typescript-eslint/no-explicit-any
const cadenaReal = async () => (CADENA ??= await cadena())
const REF_F01 = 'F01'
async function chequear(n5: Record<string, unknown>, pieza: Record<string, unknown>, briefMod: Record<string, unknown> = {}) {
  const c = {
    ...n5,
    llego_la_vuelta: true,
    texto: '```json\n' + JSON.stringify({ pieza: { titular: 'Ceviche de Olón', texto_principal: 'Escríbenos por WhatsApp y coordina tu pedido.', prompt_imagen: 'Overhead shot of a ceviche bowl on a wooden table, warm light', fuente_imagen: 'cliente', foto_referencia: { foto: REF_F01, por_que: 'su texto dice ceviche' }, no_pude_cumplir: [], que_miro: ['miré las fotos'], fuera_de_la_foto: [], omitido_de_la_foto: [], ...pieza } }) + '\n```',
    brief: { ...BRF6, ...briefMod }, brief_id: 'BRF-0006', parte_id: 'p', client_name: 'Náufrago', manual_id: 'm', manual_version: 1, forbidden_words: ['premium', 'barato'],
    fotos_en_la_tabla: 16, fotos_enviadas: 15, fotos_no_enviadas: [], fotos_excluidas: [], dry_run: false, tope_usd: 0.6, sedes_resumen: { leidas: false, error: 'x' },
  }
  const r = await correr('chequeos', [{}], { '⑥ ¿Llegó la vuelta?': c })
  return r[0].json
}
const nombres = (r: { hallazgos: { chequeo: string }[] }) => r.hallazgos.map((h) => h.chequeo)
const hall = (r: { hallazgos: { chequeo: string }[] }, n: string) => r.hallazgos.find((h) => h.chequeo === n) as unknown as { fatal: boolean; detalle: string }

// el prompt REAL de la 3.ª pieza (BRF-0006): el frasco «Rukutu» sale de la foto de referencia
const PROMPT_REAL = 'Overhead shot of a white ceramic bowl of ceviche: red onion, creamy avocado, pico de gallo and fresh cilantro, warm natural light, wooden table. Beside it stands a glass jar labeled Rukutu with an orange hot-sauce condiment inside.'

describe('① sin marcas, rótulos ni contactos AJENOS en el prompt de imagen', () => {
  it('🔴 EL INCIDENTE REAL: «a glass jar labeled Rukutu» ⇒ FATAL «prompt_con_marca_ajena» y la pieza queda NO VÁLIDA', async () => {
    const r = await chequear(await cadenaReal(), { prompt_imagen: PROMPT_REAL })
    const h = hall(r, 'prompt_con_marca_ajena')
    expect(h).toBeTruthy()
    expect(h.fatal).toBe(true)
    expect(h.detalle).toMatch(/Rukutu/)
    expect(r.pieza_valida).toBe(false)
    expect(r.motivo_invalido).toMatch(/prompt_con_marca_ajena/)
  })
  it('CONTROL POSITIVO: el mismo prompt SIN el frasco ⇒ ningún hallazgo de marcas y la pieza vale', async () => {
    const sin = PROMPT_REAL.replace(/ Beside it stands.*$/, '')
    const r = await chequear(await cadenaReal(), { prompt_imagen: sin })
    expect(nombres(r).filter((n) => /marca|contacto|palabra_ajena/.test(n))).toEqual([])
    expect(r.pieza_valida).toBe(true)
  })
  it('lo del CLIENTE sí puede aparecer: su nombre, su ciudad, su WhatsApp y lo que dice su brief', async () => {
    const r = await chequear(await cadenaReal(), { prompt_imagen: 'A bowl of ceviche with a small sign reading “Náufrago” on the table, Olón style, WhatsApp order card, phone +593 997 744 288' })
    expect(nombres(r).filter((n) => /marca|contacto|palabra_ajena/.test(n))).toEqual([])
  })
  it('🔴 un rótulo entre comillas o con «logo/label/branded» que no es del cliente ⇒ FATAL', async () => {
    for (const p of ['A bowl of ceviche with a bottle that says “Corona Extra”', 'Ceviche next to a branded Tabasco bottle', 'Ceviche bowl, a logo of Heinz in the corner']) {
      const r = await chequear(await cadenaReal(), { prompt_imagen: p })
      expect(hall(r, 'prompt_con_marca_ajena'), p).toBeTruthy()
      expect(hall(r, 'prompt_con_marca_ajena').fatal, p).toBe(true)
    }
  })
  it('🔴 un texto entre comillas SIN palabra de rótulo («a card “Fresh Daily”») también es ajeno ⇒ FATAL · pero las cifras y siglas cortas («“2x1”», «“WOW”») no son marcas', async () => {
    const ajena = await chequear(await cadenaReal(), { prompt_imagen: 'Ceviche bowl on a table next to a card “Fresh Daily”' })
    expect(hall(ajena, 'prompt_con_marca_ajena')).toBeTruthy()
    const corta = await chequear(await cadenaReal(), { prompt_imagen: 'Ceviche bowl on a table next to a card “2x1” and a sticker “WOW”' })
    expect(nombres(corta)).not.toContain('prompt_con_marca_ajena')
  })
  it('🔴 un teléfono, enlace o @usuario que NO es del cliente ⇒ FATAL «prompt_con_contacto_ajeno» (el de la foto de referencia no se copia)', async () => {
    for (const p of ['Ceviche bowl with a jar showing WhatsApp +593 98 111 2233', 'Ceviche bowl, a card with www.otra-marca.com', 'Ceviche bowl, a sticker @otra_marca']) {
      const r = await chequear(await cadenaReal(), { prompt_imagen: p })
      expect(hall(r, 'prompt_con_contacto_ajeno'), p).toBeTruthy()
      expect(hall(r, 'prompt_con_contacto_ajeno').fatal, p).toBe(true)
    }
  })
  it('una palabra con mayúscula a mitad de frase que no es del cliente ⇒ AVISO no fatal «prompt_con_palabra_ajena» (candidato)', async () => {
    const r = await chequear(await cadenaReal(), { prompt_imagen: 'Overhead ceviche bowl next to a Fanta bottle, warm light' })
    const h = hall(r, 'prompt_con_palabra_ajena')
    expect(h).toBeTruthy()
    expect(h.fatal).toBe(false)
    expect(h.detalle).toMatch(/Fanta/)
  })
  it('las mayúsculas de INICIO de frase y los términos del brief y del manual no disparan nada', async () => {
    const r = await chequear(await cadenaReal(), { prompt_imagen: 'Overhead shot of ceviche. Warm light. The bowl sits on wood. Marisco de Olón served for delivery in Guayaquil.' })
    expect(nombres(r).filter((n) => /marca|contacto|palabra_ajena/.test(n))).toEqual([])
  })
  it('🔴 el pedido pide OMITIR marcas, rótulos, logos y teléfonos de terceros de la foto (antes: ni una palabra)', async () => {
    const t: string = (await cadenaReal()).cuerpo.task
    expect(t).toMatch(/OMITE las marcas, rótulos, logos, textos y teléfonos de terceros/)
    expect(t).toMatch(/«omitido_de_la_foto»/)
  })
  it('AGNÓSTICO: otro cliente (una pizzería) · «labeled Heinz» es ajeno, «labeled Luna» es suyo', () => {
    const permitido = F.permitidoDelPrompt({ nombre: 'Pizzería Luna', handles: ['pizzerialuna'], ciudades: ['Cuenca'], brief: { mensaje: 'La pizza margarita de Luna', llamado_a_la_accion: 'Llama al 0987654321' }, manual: { required_terminology: ['masa madre'] }, ficha: {} })
    const mal = F.chequearPromptDeImagen({ prompt_imagen: 'A pizza next to a bottle labeled Heinz', fuente_imagen: 'cliente' }, { permitido })
    expect(mal.map((h: { chequeo: string; fatal: boolean }) => [h.chequeo, h.fatal])).toContainEqual(['prompt_con_marca_ajena', true])
    const bien = F.chequearPromptDeImagen({ prompt_imagen: 'A pizza box labeled Luna, phone 0987654321, masa madre crust', fuente_imagen: 'cliente' }, { permitido })
    expect(bien.filter((h: { chequeo: string }) => /marca|contacto|palabra_ajena/.test(h.chequeo))).toEqual([])
  })
})

describe('② el prompt describe lo que la foto MUESTRA · lo que el brief pide y la foto no trae se DECLARA', () => {
  it('🔴 el pedido lo dice y el contrato trae «fuera_de_la_foto» y «omitido_de_la_foto»', async () => {
    const t: string = (await cadenaReal()).cuerpo.task
    expect(t).toMatch(/Si el brief pide un elemento que la foto de referencia NO muestra, NO lo describas como si estuviera/)
    expect(t).toMatch(/"fuera_de_la_foto": \[/)
    expect(t).toMatch(/"omitido_de_la_foto": \[/)
  })
  it('🔴 la imagen es del cliente y la pieza NO trae la lista «fuera_de_la_foto» (aunque sea vacía) ⇒ aviso «no_declaro_lo_que_la_foto_no_muestra»', async () => {
    const c: Record<string, unknown> = {}
    const r = await chequear(await cadenaReal(), { fuera_de_la_foto: undefined, ...c })
    expect(nombres(r)).toContain('no_declaro_lo_que_la_foto_no_muestra')
  })
  it('🔴 declara lo que la foto no muestra pero NO lo repite en «no_pude_cumplir» ⇒ aviso «elemento_fuera_de_la_foto_sin_declarar» (y siempre el aviso informativo para quien aprueba)', async () => {
    const r = await chequear(await cadenaReal(), { fuera_de_la_foto: ['marisco visible encima'], no_pude_cumplir: [] })
    expect(nombres(r)).toContain('foto_no_muestra_lo_que_pide_el_brief')
    expect(nombres(r)).toContain('elemento_fuera_de_la_foto_sin_declarar')
    expect(hall(r, 'foto_no_muestra_lo_que_pide_el_brief').fatal).toBe(false)
    expect(hall(r, 'foto_no_muestra_lo_que_pide_el_brief').detalle).toMatch(/marisco visible encima/)
  })
  it('declarado en las dos partes ⇒ sólo el aviso informativo (el hueco queda a la vista, no se calla)', async () => {
    const r = await chequear(await cadenaReal(), { fuera_de_la_foto: ['marisco visible encima'], no_pude_cumplir: ['El brief pide marisco visible y la foto de referencia no lo muestra: no lo describí'] })
    expect(nombres(r)).toContain('foto_no_muestra_lo_que_pide_el_brief')
    expect(nombres(r)).not.toContain('elemento_fuera_de_la_foto_sin_declarar')
  })
  it('lista vacía declarada ⇒ ningún aviso de este chequeo · una imagen «generada» no aplica (no sale de una foto)', async () => {
    const vacia = await chequear(await cadenaReal(), { fuera_de_la_foto: [] })
    expect(nombres(vacia).filter((n) => /fuera_de_la_foto|no_declaro_lo_que_la_foto|foto_no_muestra/.test(n))).toEqual([])
    const gen = await chequear(await cadenaReal(), { fuente_imagen: 'generada', foto_referencia: null, fuera_de_la_foto: undefined })
    expect(nombres(gen).filter((n) => /fuera_de_la_foto|no_declaro_lo_que_la_foto|foto_no_muestra/.test(n))).toEqual([])
  })
})

describe('③ las variantes van en CAMPOS separados, no en un texto concatenado', () => {
  const A = { id: 'A', titular: 'Ceviche de Olón', texto_principal: 'Marisco de Olón directo a tu puerta. Escríbenos por WhatsApp.' }
  const B = { id: 'B', titular: 'Ceviche de Olón', texto_principal: 'El almuerzo sin espera: marisco de Olón. Escríbenos por WhatsApp.' }
  it('🔴 el pedido pide `variantes` (un objeto por variante, completas) y prohíbe concatenarlas', async () => {
    const t: string = (await cadenaReal()).cuerpo.task
    expect(t).toMatch(/"variantes": \[ \{ "id": "A"/)
    expect(t).toMatch(/NUNCA concatenes las variantes dentro de un solo campo/)
  })
  it('🔴 LA 3.ª PIEZA REAL: «Variante A: … Variante B: …» dentro de `texto_principal` ⇒ aviso «variantes_concatenadas»', async () => {
    const r = await chequear(await cadenaReal(), { texto_principal: 'Variante A: Marisco de Olón directo a tu puerta.\n\nVariante B: El almuerzo sin espera.' })
    const h = hall(r, 'variantes_concatenadas')
    expect(h).toBeTruthy()
    expect(h.fatal).toBe(false)
  })
  it('🔴 con `variantes` en campos, cada una se revisa POR SEPARADO: la palabra prohibida está sólo en la B ⇒ el aviso dice «variante B»', async () => {
    const r = await chequear(await cadenaReal(), { variantes: [A, { ...B, texto_principal: 'El ceviche premium de Olón. Escríbenos.' }] })
    const h = r.hallazgos.filter((x: { chequeo: string }) => x.chequeo === 'palabra_prohibida')
    expect(h).toHaveLength(1)
    expect(h[0].detalle).toMatch(/\[variante B\]/)
    expect(r.hallazgos.some((x: { detalle: string }) => /\[variante A\]/.test(x.detalle) && /prohibida/.test(x.detalle))).toBe(false)
  })
  it('el límite de caracteres del titular se mide en cada variante', async () => {
    const largo = 'Ceviche de Olón con marisco que viene directo a tu puerta'
    const r = await chequear(await cadenaReal(), { variantes: [A, { ...B, titular: largo }] })
    const h = r.hallazgos.filter((x: { chequeo: string }) => x.chequeo === 'limite_de_caracteres')
    expect(h.length).toBe(1)
    expect(h[0].detalle).toMatch(/\[variante B\]/)
  })
  it('el trato también: un voseo en la variante B se nombra «variante B»', async () => {
    const r = await chequear(await cadenaReal(), { variantes: [A, { ...B, texto_principal: 'Pedilo ya, marisco de Olón.' }] })
    const h = hall(r, 'trato_distinto_al_del_cliente')
    expect(h.detalle).toMatch(/variante B/)
    expect(h.detalle).toMatch(/pedilo/i)
  })
  it('el brief pide 2 variantes: con 1 sola ⇒ «variantes_incompletas» · con 2 ⇒ ninguna · un brief sin variantes no lo exige', async () => {
    expect(nombres(await chequear(await cadenaReal(), { variantes: [A] }))).toContain('variantes_incompletas')
    expect(nombres(await chequear(await cadenaReal(), { variantes: [A, B] }))).not.toContain('variantes_incompletas')
    expect(nombres(await chequear(await cadenaReal(), {}, { variantes: '' }))).not.toContain('variantes_incompletas')
  })
  it('dos variantes con el mismo texto ⇒ «variantes_iguales»', async () => {
    expect(nombres(await chequear(await cadenaReal(), { variantes: [A, { ...A, id: 'B' }] }))).toContain('variantes_iguales')
  })
  it('🔴 la pieza guardada trae cada variante en su campo y el texto las lista por separado', async () => {
    const r = await chequear(await cadenaReal(), { variantes: [A, B] })
    expect(r.fila_pieza.provenance_tag.variantes).toHaveLength(2)
    expect(r.fila_pieza.provenance_tag.variantes[1]).toMatchObject({ id: 'B', texto_principal: B.texto_principal })
    expect(r.pieza_md).toMatch(/### Variante A/)
    expect(r.pieza_md).toMatch(/### Variante B/)
  })
  it('una pieza SIN variantes sigue como antes (titular y texto sueltos · sin avisos nuevos)', async () => {
    const r = await chequear(await cadenaReal(), {}, { variantes: '' })
    expect(nombres(r).filter((n) => /variantes/.test(n))).toEqual([])
    expect(r.pieza_md).toMatch(/TITULAR \(/)
  })
})

describe('④ «coincide en parte»: el producto de varias palabras nombrado sólo en parte se VE (recomendación 3.1 de CC#3)', () => {
  const brief = { tipo_de_pieza: 'imagen', protagonista: 'La pizza margarita de la casa', vocabulario_obligatorio: ['pizza', 'margarita'] }
  it('🔴 «#pizza» sola frente a «pizza margarita»: «ES el producto» pero la etiqueta dice «(coincide en parte)»', () => {
    const prod = F.productoDelBrief(brief, [])
    const c = F.clasificarFotos([{ id: 'a', url: 'u', post_id: 'A', caption: 'Solo #pizza' }, { id: 'b', url: 'u2', post_id: 'B', caption: 'Nuestra pizza margarita recién hecha' }], { producto: prod, catalogo: [], excluir: [] })
    const por = (p: string) => c.fotos.find((f: { post_id: string }) => f.post_id === p)
    expect(por('B').label).not.toMatch(/en parte/)
    expect(por('A').rol).toBe('producto_del_brief')
    expect(por('A').label).toMatch(/\(coincide en parte\)/)
    expect(por('A').label.length).toBeLessThanOrEqual(80)
    expect(F.bloqueDeFotos(c, 'X')).toMatch(/coincide sólo en parte con «pizza margarita»/)
    expect(c.fotos[0].post_id).toBe('B') // la que coincide entera va primero
  })
  it('con el brief real del ceviche (una palabra) nada cambia: ninguna foto sale «en parte»', async () => {
    const n5 = await cadenaReal()
    expect(JSON.stringify(n5.cuerpo.images)).not.toMatch(/en parte/)
  })
})

describe('el flujo sigue igual de grande y lo que ya funcionaba no se toca', () => {
  it('27 nodos · 0 reintentos · 0 lecturas fuera de orden con el código NUEVO pegado', async () => {
    const { construirFlujo } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
    const { lecturasFueraDeOrden } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30', 'lecturas-fuera-de-orden.mjs')).href)
    const f = construirFlujo()
    expect(f.nodes).toHaveLength(27)
    expect(f.nodes.filter((n: { retryOnFail?: boolean }) => n.retryOnFail)).toHaveLength(0)
    expect(lecturasFueraDeOrden(f)).toEqual([])
  })
  it('los chequeos de coherencia de foto y de trato de ayer siguen vivos (el incidente de la 2.ª pieza)', async () => {
    const n5 = await cadenaReal()
    const otra = n5.fotos_ctx.find((f: { rol: string }) => f.rol === 'otro_producto').ref
    const r = await chequear(n5, { foto_referencia: { foto: otra, por_que: 'x' } })
    expect(nombres(r)).toContain('foto_referencia_de_otro_producto')
  })
})
