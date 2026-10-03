/**
 * COHERENCIA FOTO ↔ PIEZA · el flujo de la pieza · pruebas a costo cero con los datos REALES de Náufrago · CC#1 · 2026-10-03
 * (encargo Lenovo «cada foto viaja con todo su contexto» puntos 2 y 4 · diagnóstico CC#2: la 2.ª pieza armó un prompt de «ceviche» sobre una foto de encebollado y nada lo impedía).
 *
 * (03-oct · CANON «SIN REJAS AL AGENTE»: los chequeos de coherencia ya NO son fatales y ya no hay regla dura de «sólo fotos del producto»; esas pruebas se reemplazaron por las de `quitar-las-rejas-del-productor.test.ts`. Lo que sigue aquí es la INFORMACIÓN: contexto por foto, rol, declaración de la foto usada.)
 * 🔴 Cada prueba tiene que estar ROJA contra el estado de ANTES (commit `e667b5c`) y VERDE después:
 *   ② al productor le llega TODO: cada foto con su texto, fecha y enlace (no un código opaco) · no se esconde ninguna foto · sin repetidas
 *   ④ el productor declara qué foto usó de referencia · si el producto del brief no coincide con el de esa foto ⇒ hallazgo FATAL
 *      sin foto del producto ⇒ se declara y NO se arma el prompt sobre otro plato
 * Agnóstico: los nodos no nombran clientes ni platos (los platos de estas pruebas salen del brief y de los textos reales).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const FX = join(process.cwd(), '__tests__', 'fixtures', 'fotos-contexto')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { codigoDeNodo, N } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
const completar = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf', 'completar-contexto-fotos.mjs')).href).catch(() => null)
const BRF6 = JSON.parse(readFileSync(join(DIR, 'fixtures', 'brf-0006.json'), 'utf8'))
const RASPADO = JSON.parse(readFileSync(join(FX, 'raspado-instagram-propio.json'), 'utf8'))
const FILAS16: Record<string, unknown>[] = JSON.parse(readFileSync(join(FX, 'client-social-images-16-filas.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; helpers?: Record<string, unknown> }
async function correrNodo(clave: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => { if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] } }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave)).call({ helpers: ctx.helpers }, $input, $, {}, items[0]?.json, { id: 'WF-PIEZA' }, { id: '999', resumeUrl: 'https://x' })
}

// ── las 16 filas REALES, ya completadas con su contexto (lo que dejará el completador) ──
const raspados = [{ id: 'r1', created_at: RASPADO.created_at, respuesta: [{ username: 'naufrago.ec', latestPosts: RASPADO.latestPosts }] }]
const huellas: Record<string, string> = {}
for (const f of FILAS16) huellas[String(f.id)] = ['DPti3m8jQJt', 'DPti3m8jQJt-c1'].includes(String(f.post_id)) ? 'misma-huella' : 'h-' + f.id
const plan = completar ? completar.planificar({ filas: FILAS16, raspados, huellas }) : { cambios: [] as { id: string; parche: Record<string, unknown> }[] } // (en el estado de ANTES el completador no existe: las filas quedan sin contexto y cada prueba falla por su cuenta)
const FILAS = FILAS16.map((f) => ({ ...f, ...(plan.cambios.find((c: { id: string }) => c.id === f.id)?.parche ?? {}) })) as Record<string, unknown>[]
const SOBRE = { client_id: CID, tenant_id: CID, parte_id: 'p', brief_id: 'BRF-0006', dry_run: false, tope_usd: 0.6, _sala_correlation_id: null }
const PROT_ENCEBOLLADO = 'El encebollado Náufrago, plato principal'
const FICHA = { id: CID, name: 'Náufrago', country: 'Ecuador', market: 'Guayaquil · Guayas', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }
const SEDES_INFO = { sedes_info: { sedes: ['Olón', 'Guayaquil'].map((c) => ({ clave: c.toLowerCase(), ciudad: c, direccion: { estado: 'sin_dato', valor: null, fuentes: [] }, horario: { estado: 'sin_dato', valor: null, fuentes: [] }, canal_pedido: { estado: 'sin_dato', valor: null, fuentes: [] } })), textos_propios: [], descartes: [] } }
const VOZ = { voice_description: 'Voz directa, costeña. Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {} }
const HEAD_OK = { httpRequest: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } }) }

/** corre ③ y luego ⑤ como lo haría el flujo */
async function tresYCinco(opc: { filas?: Record<string, unknown>[]; brief?: Record<string, unknown>; ficha?: Record<string, unknown>; sinFotosFilas?: boolean; manualVoz?: unknown } = {}) {
  const brief = opc.brief ?? BRF6
  const base = { ...SOBRE, brief, brief_texto: 'BRIEF', protagonista: brief.protagonista, manual_voz: opc.manualVoz ?? VOZ, fotos: [], fotos_no_enviadas: [] }
  const t3 = await correrNodo('guardaFotos', { input: opc.filas ?? FILAS, refs: { '② GUARDA · sin manual aprobado se DETIENE': base }, helpers: HEAD_OK })
  const prev3 = t3[0].json
  const t5 = await correrNodo('cuerpo', { input: [SEDES_INFO], refs: { '④ ¿Ya hay pieza de este brief? · guarda': opc.sinFotosFilas ? { ...prev3, fotos_filas: undefined } : prev3, '⑤ Ficha del cliente': opc.ficha ?? FICHA } })
  return { prev3, out: t5[0].json }
}

describe('② al productor le llega TODO: cada foto con su texto, su fecha y su enlace', () => {
  it('🔴 ③ entrega las filas CON su contexto (antes: sólo {url, label «tipo · código»})', async () => {
    const { prev3 } = await tresYCinco()
    expect(prev3.fotos_filas).toHaveLength(15) // 16 filas − la portada repetida (hijo 1) = 15 · los 2 logos incluidos
    const f = prev3.fotos_filas.find((x: { post_id: string }) => x.post_id === 'DAvtICqvjC-')
    expect(f).toMatchObject({ post_url: expect.stringContaining('/DAvtICqvjC-/'), medio: 'imagen', posicion: 'unica' })
    expect(String(f.caption)).toMatch(/ceviche/)
    expect(String(f.posted_at)).toMatch(/^2024-10-05/)
  })
  it('🔴 ③ NO manda la repetida: la portada de un carrusel es su hijo 1 (la fila marcada `duplicado_de`) · se DECLARA', async () => {
    const { prev3 } = await tresYCinco()
    const rep = FILAS.find((f) => f.post_id === 'DPti3m8jQJt-c1')!
    expect(rep.duplicado_de).toBeTruthy()
    expect(prev3.fotos_filas.map((x: { id: string }) => x.id)).not.toContain(rep.id)
    expect(prev3.fotos_duplicadas_ocultas).toEqual([rep.id])
    expect(prev3.fotos_en_la_tabla).toBe(16)
  })
  it('🔴 ⑤ el pedido lleva CADA foto con su texto, su fecha y su enlace (no un código opaco)', async () => {
    const { out } = await tresYCinco()
    const task: string = out.cuerpo.task
    expect(task).toMatch(/texto de la publicación: «Rukutu: el toque perfecto para acompañar un delicioso ceviche/)
    expect(task).toMatch(/2025-10-12 · https:\/\/www\.instagram\.com\/p\/DPti3m8jQJt\//)
    expect(task).toMatch(/texto de la publicación: «Cerrando el feriado como se debe: con el mejor encebollado de la zona/)
    // todas las fotos enviadas aparecen en el bloque B con su clave
    for (const img of out.cuerpo.images) expect(task, img.label).toContain(img.label.split(' · ')[0] + ' · ')
  })
  it('🔴 ⑤ NO se le esconde ninguna foto: las 15 vivas viajan, cada una con una etiqueta legible (clave · fecha · de qué plato es) ≤ 80 caracteres', async () => {
    const { out } = await tresYCinco()
    expect(out.cuerpo.images).toHaveLength(15)
    for (const img of out.cuerpo.images) {
      expect(img.label.length).toBeLessThanOrEqual(80)
      expect(img.label).toMatch(/^F\d{2} · /)
      expect(img.label).not.toMatch(/post_sidecar|post_video|post_image|post_hijo/) // adiós al código opaco
    }
    const claves = out.cuerpo.images.map((i: { label: string }) => i.label.slice(0, 3))
    expect(new Set(claves).size).toBe(15) // claves únicas
    expect(out.fotos_enviadas).toBe(15)
  })
  it('🔴 ⑤ el recorte al tope de 20 NO pierde la foto del producto: va primero aunque sea la más vieja (y lo recortado se DECLARA)', async () => {
    const relleno = Array.from({ length: 24 }, (_, i) => ({ id: 'r' + i, handle: 'naufrago.ec', tipo: 'post_video', post_id: 'R' + i, url: 'https://abc.supabase.co/storage/v1/object/public/client-social-images/r' + i + '.jpg', caption: 'Un domingo en la playa ' + i, posted_at: '2026-09-' + String(10 + (i % 9)).padStart(2, '0') + 'T00:00:00Z', post_url: 'https://www.instagram.com/p/R' + i + '/', posicion: 'unica', medio: 'reel', producto: [], producto_fuente: 'desconocido', duplicado_de: null }))
    const vieja = { ...relleno[0], id: 'vieja', post_id: 'VIEJA', caption: 'El ceviche de la casa 🍋', url: 'https://abc.supabase.co/storage/v1/object/public/client-social-images/vieja.jpg', posted_at: '2020-01-01T00:00:00Z' }
    const { prev3, out } = await tresYCinco({ filas: [...relleno, vieja] })
    expect(prev3.fotos_filas).toHaveLength(20)
    expect(prev3.fotos_filas.map((f: { id: string }) => f.id)).toContain('vieja')
    expect(prev3.fotos_no_enviadas).toHaveLength(5)
    expect(out.cuerpo.images[0].label).toMatch(/ES el producto/)
  })
  it('🟡→🟢 la evidencia DÉBIL se ve: si el plato sólo lo dijo una #etiqueta, la etiqueta de la foto y el bloque B lo dicen (CC#3 · debilidad 3.2)', async () => {
    const { out } = await tresYCinco()
    const debil = out.cuerpo.images.filter((i: { label: string }) => i.label.includes('(sólo #etiqueta)'))
    expect(debil.length).toBeGreaterThanOrEqual(2) // en los datos reales, 2 fotos de encebollado se clasifican sólo por etiqueta
    for (const i of debil) expect(i.label.length).toBeLessThanOrEqual(80)
    expect(out.cuerpo.task).toContain('una #etiqueta: el cuerpo del texto NO lo dice · evidencia débil')
    const sana = out.cuerpo.images.find((i: { label: string }) => i.label.includes('ES el producto'))
    expect(sana.label).not.toContain('etiqueta') // la foto cuyo cuerpo lo dice no lleva la marca
    expect(out.fotos_ctx.filter((f: { via: string }) => f.via === 'etiqueta').length).toBe(debil.length)
  })
  it('la posición en el carrusel se dice como lo ve el dueño: portada = foto 1 · el hijo 2 es la foto 2', async () => {
    const { out } = await tresYCinco()
    expect(out.cuerpo.task).toMatch(/portada de carrusel · 2025-10-12/)
    expect(out.cuerpo.task).toContain('video (cuadro) · carrusel · foto 2 · 2025-10-12')
  })
  it('compatibilidad: con el ③ viejo (sin `fotos_filas`) ⑤ sigue mandando {url, label} y no inventa reglas', async () => {
    const { out } = await tresYCinco({ sinFotosFilas: true })
    expect(out.fotos_regla.regla_activa).toBe(false)
    expect(out.cuerpo.task).toMatch(/B\) LAS FOTOS REALES DEL NEGOCIO/)
  })
})

describe('④ qué producto muestra cada foto contra el producto del brief', () => {
  it('🔴 brief de CEVICHE: sólo la foto cuyo texto nombra el ceviche es «ES el producto»; las de encebollado van rotuladas «NO es el producto»', async () => {
    const { out } = await tresYCinco()
    const r = out.fotos_regla
    expect(r).toMatchObject({ regla_activa: true, sin_foto_del_producto: false, producto_del_brief: 'ceviche' })
    const de = (post: string) => out.fotos_ctx.find((f: { post_id: string }) => f.post_id === post)
    expect(de('DAvtICqvjC-').rol).toBe('producto_del_brief')
    for (const post of ['DPti3m8jQJt', 'DPti3m8jQJt-c2', 'DSHyjPzEa3C', 'DBCCBtGx0wr', 'C_LmHq4OHXU']) expect(de(post).rol, post).toBe('otro_producto')
    expect(de('DAjARyZxg8N').rol).toBe('varios_productos') // su texto nombra los dos platos: no se sabe cuál muestra
    expect(de('DT1H9PDjH78').rol).toBe('no_identificado')
    expect(de('logo').rol).toBe('marca')
    expect(r.de_referencia).toEqual([de('DAvtICqvjC-').ref])
    expect(out.cuerpo.task).toMatch(/Las fotos cuyo texto lo asocia a él: F01/)
    expect(out.cuerpo.task).toMatch(/NO es el producto del brief \(el texto nombra: encebollado\)/)
  })
  it('🔴 el cuerpo de un post manda sobre su cola de #etiquetas: un reel de encebollado con «#ceviche» NO es una foto de ceviche', async () => {
    const { out } = await tresYCinco()
    const reel = out.fotos_ctx.find((f: { post_id: string }) => f.post_id === 'DBCCBtGx0wr')
    expect(reel.rol).toBe('otro_producto')
    expect(reel.producto).toEqual(['encebollado'])
  })
  it('brief de ENCEBOLLADO + los productos que el DUEÑO declara en la ficha: las de encebollado son referencia y la de ceviche es «NO es el producto» (misma regla, otro producto)', async () => {
    const { out } = await tresYCinco({ brief: { ...BRF6, protagonista: PROT_ENCEBOLLADO, vocabulario_obligatorio: ['encebollado', 'Olón'] }, ficha: { ...FICHA, config: { ...FICHA.config, productos: ['ceviche', 'encebollado'] } } })
    expect(out.fotos_regla.producto_del_brief).toBe('encebollado')
    const de = (post: string) => out.fotos_ctx.find((f: { post_id: string }) => f.post_id === post)
    expect(de('DPti3m8jQJt').rol).toBe('producto_del_brief')
    expect(de('DAvtICqvjC-').rol).toBe('otro_producto')
  })
  it('SIN foto del producto: el pedido INFORMA que no hay una foto asociada a ese producto y deja elegir (canon sin rejas)', async () => {
    const { out } = await tresYCinco({ brief: { ...BRF6, protagonista: 'La hamburguesa doble de la casa', vocabulario_obligatorio: ['hamburguesa', 'delivery'] } })
    expect(out.fotos_regla).toMatchObject({ regla_activa: true, sin_foto_del_producto: true })
    expect(out.fotos_regla.producto_del_brief).toMatch(/hamburguesa/)
    const t: string = out.cuerpo.task
    expect(t).toMatch(/ninguna foto que su texto asocie a «/)
    expect(t).toMatch(/CUALQUIER foto/)
    expect(out.cuerpo.images).toHaveLength(15) // las fotos siguen yendo como contexto de marca · ninguna se esconde
  })
  it('brief que NO nombra un producto (sin regla): no se inventa una regla de producto · todo como antes', async () => {
    const { out } = await tresYCinco({ brief: { ...BRF6, protagonista: 'El local' } })
    expect(out.fotos_regla.regla_activa).toBe(false)
    expect(out.cuerpo.task).not.toMatch(/PROHIBIDO armar el prompt/)
    expect(out.cuerpo.images).toHaveLength(15)
  })
  it('un brief cuyo protagonista y vocabulario NO comparten un término no nombra un producto: no se inventa una regla', async () => {
    const { out } = await tresYCinco({ brief: { ...BRF6, protagonista: 'La hamburguesa doble', vocabulario_obligatorio: ['delivery', 'jueves a lunes'] } })
    expect(out.fotos_regla.regla_activa).toBe(false)
  })
  it('la regla sólo vale para piezas de IMAGEN: una bio o una configuración no llevan foto de plato', async () => {
    const { out } = await tresYCinco({ brief: { ...BRF6, tipo_de_pieza: 'bio' } })
    expect(out.fotos_regla.regla_activa).toBe(false)
    expect(out.cuerpo.task).not.toMatch(/PROHIBIDO armar el prompt|Como REFERENCIA del producto solo puedes/)
  })
  it('cliente SIN fotos: se dice y no hay `images` (nada inventado)', async () => {
    const { out } = await tresYCinco({ filas: [] })
    expect(out.cuerpo.task).toMatch(/NO hay fotos propias disponibles/)
    expect(out.cuerpo.images).toBeUndefined()
    expect(out.fotos_regla.sin_foto_del_producto).toBe(true)
  })
  it('el contrato del JSON pide `foto_referencia` y la regla 6 la explica', async () => {
    const { out } = await tresYCinco()
    expect(out.cuerpo.task).toMatch(/"foto_referencia": \{ "foto": "F01"/)
    expect(out.cuerpo.task).toMatch(/6\. «foto_referencia»: la CLAVE/)
  })
})

describe('④ el chequeo de coherencia foto ↔ pieza (determinista · sin modelo)', () => {
  async function chequear(regla: Record<string, unknown>, pieza: Record<string, unknown>, brief: Record<string, unknown> = BRF6) {
    const c = {
      llego_la_vuelta: true, texto: '```json\n' + JSON.stringify({ pieza: { titular: 'Ceviche de Olón', texto_principal: 'Pídelo por WhatsApp, jueves a lunes.', no_pude_cumplir: [], que_miro: ['miré las fotos'], fuera_de_la_foto: [], ...pieza } }) + '\n```',
      brief, brief_id: 'BRF-0006', parte_id: 'p', client_id: CID, client_name: 'Náufrago', manual_id: 'm', manual_version: 1, plan_id: null, forbidden_words: [], fotos_en_la_tabla: 16, fotos_enviadas: 15, fotos_no_enviadas: [], fotos_excluidas: [],
      fotos_regla: regla, fotos_ctx: (regla as { fotos?: unknown[] }).fotos ?? [], trato: { trato: 'tu', fuente: 'manual', evidencia: 'x' }, dry_run: false, cuerpo: {}, tope_usd: 0.6, sedes_resumen: { leidas: false, error: 'x' },
    }
    const r = await correrNodo('chequeos', { input: [{}], refs: { '⑥ ¿Llegó la vuelta?': c } })
    return r[0].json
  }
  const HAMBURGUESA = { ...BRF6, protagonista: 'La hamburguesa doble de la casa', vocabulario_obligatorio: ['hamburguesa', 'delivery'] }
  const REGLA = async (opc = {}) => (await tresYCinco(opc)).out.fotos_regla
  const refDe = (regla: { fotos: { post_id: string; ref: string }[] }, post: string) => regla.fotos.find((f) => f.post_id === post)!.ref
  const PROMPT_CEVICHE = 'Overhead shot of a bowl of ceviche with red onion and lime, warm natural light'

  it('CONTROL POSITIVO: la foto de referencia ES del producto del brief ⇒ ningún hallazgo de fotos y la pieza vale', async () => {
    const regla = await REGLA()
    const r = await chequear(regla, { fuente_imagen: 'cliente', prompt_imagen: PROMPT_CEVICHE, foto_referencia: { foto: refDe(regla, 'DAvtICqvjC-'), por_que: 'su texto dice ceviche' } })
    const fotos = r.hallazgos.filter((h: { chequeo: string }) => /foto|prompt_sin|prompt_nombra|hueco/.test(h.chequeo))
    expect(fotos).toEqual([])
    expect(r.pieza_valida).toBe(true)
  })
  it('foto de referencia con clave inventada ⇒ avisa · foto sin producto identificado ⇒ avisa (no fatal) · imagen del cliente sin declarar la foto ⇒ avisa', async () => {
    const regla = await REGLA()
    const inv = await chequear(regla, { fuente_imagen: 'cliente', prompt_imagen: PROMPT_CEVICHE, foto_referencia: { foto: 'F99', por_que: 'x' } })
    expect(inv.hallazgos.map((h: { chequeo: string }) => h.chequeo)).toContain('foto_referencia_inexistente')
    const sin = await chequear(regla, { fuente_imagen: 'cliente', prompt_imagen: PROMPT_CEVICHE, foto_referencia: refDe(regla, 'DT1H9PDjH78') })
    const h = sin.hallazgos.find((x: { chequeo: string }) => x.chequeo === 'foto_referencia_sin_producto_identificado')
    expect(h).toBeTruthy(); expect(h.fatal).toBe(false)
    const nada = await chequear(regla, { fuente_imagen: 'cliente', prompt_imagen: PROMPT_CEVICHE, foto_referencia: null })
    expect(nada.hallazgos.map((x: { chequeo: string }) => x.chequeo)).toContain('foto_referencia_no_declarada')
  })
  it('un brief que no es de imagen (p. ej. una bio) NO dispara los chequeos de foto', async () => {
    const regla = await REGLA()
    const r = await chequear(regla, { fuente_imagen: '', prompt_imagen: '', foto_referencia: null }, { ...BRF6, tipo_de_pieza: 'bio' })
    expect(r.hallazgos.filter((h: { chequeo: string }) => /foto_referencia|prompt_sin|prompt_nombra|hueco_de_foto/.test(h.chequeo))).toEqual([])
  })
  it('SIN regla (el brief no nombra un producto) los chequeos de foto no corren: no se inventa una verificación', async () => {
    const regla = await REGLA({ brief: { ...BRF6, protagonista: 'El local' } })
    const r = await chequear(regla, { fuente_imagen: 'cliente', prompt_imagen: 'A bowl of encebollado', foto_referencia: null }, { ...BRF6, protagonista: 'El local' })
    expect(r.hallazgos.filter((h: { chequeo: string }) => /foto_referencia|prompt_sin|prompt_nombra|hueco_de_foto/.test(h.chequeo))).toEqual([])
  })
  it('la pieza guardada trae qué foto es cada una, cuál usó de referencia y el trato (provenance + texto)', async () => {
    const regla = await REGLA()
    const r = await chequear(regla, { fuente_imagen: 'cliente', prompt_imagen: PROMPT_CEVICHE, foto_referencia: { foto: refDe(regla, 'DAvtICqvjC-'), por_que: 'ceviche' } })
    expect(r.fila_pieza.provenance_tag.fotos.regla).toMatchObject({ regla_activa: true, producto_del_brief: 'ceviche' })
    expect(r.fila_pieza.provenance_tag.fotos.foto_referencia).toMatchObject({ foto: refDe(regla, 'DAvtICqvjC-') })
    expect(r.fila_pieza.provenance_tag.fotos.ctx).toHaveLength(15)
    expect(r.fila_pieza.provenance_tag.trato).toMatchObject({ trato: 'tu' })
    expect(r.pieza_md).toMatch(/## Qué foto es cada una y cuál usó de referencia/)
  })
})

describe('el flujo sigue teniendo 27 nodos y lo que ya funcionaba no se toca', () => {
  it('construirFlujo: 27 nodos · el productor SIN reintento · la consulta de fotos pide las columnas de contexto y la del manual pide la voz', async () => {
    const { construirFlujo } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
    const f = construirFlujo()
    expect(f.nodes).toHaveLength(27)
    expect(f.nodes.filter((n: { retryOnFail?: boolean }) => n.retryOnFail)).toHaveLength(0)
    const q = (nombre: string) => JSON.stringify(f.nodes.find((n: { name: string }) => n.name === nombre).parameters.url)
    expect(q(N.fotos)).toMatch(/caption,posted_at,post_url,posicion,medio,producto,producto_fuente,duplicado_de/)
    expect(q(N.manual)).toMatch(/voice_description,writing_style,tone_guidelines/)
  })
})

describe('la bolita con TODAS las ramas: ningún nodo lee por nombre a uno que no sea su antecesor (flujo de la pieza y flujo del brief)', () => {
  it('🔴 pieza: 0 lecturas fuera de orden con el código NUEVO de ③ ⑤ ⑦ pegado en los nodos', async () => {
    const { construirFlujo } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
    const { lecturasFueraDeOrden } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30', 'lecturas-fuera-de-orden.mjs')).href)
    expect(lecturasFueraDeOrden(construirFlujo())).toEqual([])
  })
  it('brief: 0 lecturas fuera de orden con el código NUEVO de ③ ④ pegado en los nodos', async () => {
    const { lecturasFueraDeOrden } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30', 'lecturas-fuera-de-orden.mjs')).href)
    const b = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo', 'construir-brief.mjs')).href)
    expect(lecturasFueraDeOrden(b.construirFlujo())).toEqual([])
  })
  it('todas las ramas LLENAS de ③: fotos del producto · de otro plato · sin plato · repetidas · logos · con y sin texto, a la vez ⇒ ninguna se pierde ni se repite', async () => {
    const extra = [{ ...FILAS[3], id: 'sin-texto', post_id: 'SINTEXTO', url: 'https://abc.supabase.co/storage/v1/object/public/client-social-images/sin-texto.jpg', caption: null, producto: [], producto_fuente: 'desconocido', duplicado_de: null }, { ...FILAS[4], id: 'rep2', post_id: 'REP2', duplicado_de: FILAS[3].id }]
    const { prev3, out } = await tresYCinco({ filas: [...FILAS, ...extra] })
    expect(prev3.fotos_filas.length).toBe(16) // 15 vivas + la nueva sin texto · la repetida nueva NO
    expect(out.cuerpo.images).toHaveLength(16)
    expect(new Set(out.cuerpo.images.map((i: { url: string }) => i.url)).size).toBe(16)
    expect(out.fotos_ctx.find((f: { id: string }) => f.id === 'sin-texto').rol).toBe('no_identificado')
    expect(out.cuerpo.task).toMatch(/sin texto|\(sin texto\)/)
  })
})
