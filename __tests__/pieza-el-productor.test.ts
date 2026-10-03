/**
 * EL FLUJO DE LA PIEZA (`zero-risk/pieza` · el productor: UN brief → UNA pieza) · pruebas a costo cero · CC#1 · 2026-10-01 · encargo Lenovo.
 *
 * 🔴 Lo que se demuestra (con el código EXACTO de cada nodo, no una copia):
 *   ① el sobre: llave · dry_run explícito · tope · ids · todo lo mal escrito DETIENE antes de gastar
 *   ② las GUARDA: parte inválido · brief inexistente · cliente sin fotos · foto ajena · foto que no baja · más de 20 fotos
 *   ③ el cuerpo que paga: dry_run viaja · callback_mode runner · force_restart · thinking disabled · tope SIEMPRE · fotos en base64 · agnóstico
 *   ④ la vuelta: éxito · fallo del agente · corte por tope (parcial) · espera agotada
 *   ⑤ los chequeos comparan lo PEDIDO contra lo HECHO (candidatos, no veredictos) y la pieza inválida no se da por buena
 *   ⑥ el CANON DE EMILIO como propiedad del grafo: sin retryOnFail en nodos que pagan · espera ≥ trabajo · ningún error tragado · orden por el grafo · el ramal seco no alcanza escritores
 *   ⑦ EL ROJO: la misma propiedad aplicada al flujo de prueba de HOY (smoke-test-agent) FALLA — por eso la prueba puede fallar
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { construirFlujo, codigoDeNodo, N } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
const { lecturasFueraDeOrden } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30', 'lecturas-fuera-de-orden.mjs')).href)
const CH = require(join(DIR, 'pieza-chequeos.js'))
const BRIEF = JSON.parse(readFileSync(join(DIR, 'fixtures', 'brf-0006.json'), 'utf8'))
const SMOKE_DE_HOY = JSON.parse(readFileSync(join(DIR, 'fixtures', 'smoke-test-agent-vivo-5681d0e1.json'), 'utf8'))

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; env?: Record<string, string>; helpers?: unknown }
async function correrNodo(clave: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => { if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] } }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave)).call({ helpers: ctx.helpers }, $input, $, ctx.env ?? {}, items[0]?.json, { id: 'WF-PIEZA' }, { id: '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}

const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const PID = '426af72d-12c0-471c-9fda-2a2978db5175'
const LLAVE = 'llave-de-despacho-de-prueba-0123456789abcdef'
const sobre = (body: Record<string, unknown>, headers: Record<string, string> = { 'x-sala-dispatch-key': LLAVE }) =>
  correrNodo('sobre', { input: [{ body: { client_id: CID, brief_id: 'BRF-0006', dry_run: false, ...body }, headers }], env: { SALA_DISPATCH_KEY: LLAVE } })
const SOBRE = { client_id: CID, tenant_id: CID, parte_id: null, brief_id: 'BRF-0006', dry_run: false, forzar: false, desde_worker: null, _sala_correlation_id: null, _journey_id: null, simulacro_respuesta: null, tope_usd: 0.6, tope_de_fabrica: true }

// ── ① el sobre ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe('① el sobre valida TODO antes de gastar', () => {
  it('un sobre sano pasa · el tope de fábrica es 0,60 y se declara · el parte es opcional', async () => {
    const [{ json }] = await sobre({})
    expect(json).toMatchObject({ client_id: CID, brief_id: 'BRF-0006', dry_run: false, tope_usd: 0.6, tope_de_fabrica: true, parte_id: null, forzar: false })
    expect((await sobre({ parte_id: PID, tope_usd: '1.5', forzar: true }))[0].json).toMatchObject({ parte_id: PID, tope_usd: 1.5, tope_de_fabrica: false, forzar: true })
  })
  it('🔴 sin la llave del motor el flujo queda CERRADO · con llave ausente o mala se rechaza (E67)', async () => {
    await expect(correrNodo('sobre', { input: [{ body: { client_id: CID, brief_id: 'BRF-0006', dry_run: false }, headers: {} }], env: {} })).rejects.toThrow(/PIEZA_CERRADA/)
    await expect(sobre({}, {})).rejects.toThrow(/PIEZA_PROCEDENCIA_INVALIDA/)
    await expect(sobre({}, { 'x-sala-dispatch-key': 'otra' })).rejects.toThrow(/PIEZA_PROCEDENCIA_INVALIDA/)
  })
  it.each([[undefined], [null], ['true'], [1], [0]])('🔴 dry_run %j (no es booleano explícito) ⇒ PIEZA_DRY_RUN_AUSENTE · se detiene antes de gastar', async (v) => {
    await expect(correrNodo('sobre', { input: [{ body: { client_id: CID, brief_id: 'BRF-0006', ...(v === undefined ? {} : { dry_run: v }) }, headers: { 'x-sala-dispatch-key': LLAVE } }], env: { SALA_DISPATCH_KEY: LLAVE } })).rejects.toThrow(/PIEZA_DRY_RUN_AUSENTE/)
  })
  it.each([[0], [-1], ['abc'], [''], [null], [51], [{}], [false]])('🔴 tope mal escrito (%j) ⇒ PIEZA_TOPE_INVALIDO · ignorarlo dejaría pagar sin tope', async (v) => {
    await expect(sobre({ tope_usd: v })).rejects.toThrow(/PIEZA_TOPE_INVALIDO/)
  })
  it('ids: sin cliente · cliente que no es uuid · parte que no es uuid · sin brief · brief con caracteres raros', async () => {
    await expect(sobre({ client_id: undefined })).rejects.toThrow(/PIEZA_SIN_CLIENTE/)
    await expect(sobre({ client_id: 'x/../?select=*' })).rejects.toThrow(/PIEZA_CLIENTE_INVALIDO/)
    await expect(sobre({ parte_id: 'no-es-uuid' })).rejects.toThrow(/PIEZA_PARTE_INVALIDO/)
    await expect(sobre({ brief_id: undefined })).rejects.toThrow(/PIEZA_SIN_BRIEF/)
    await expect(sobre({ brief_id: 'BRF-1&select=*' })).rejects.toThrow(/PIEZA_BRIEF_INVALIDO/)
  })
  it('el simulacro SÓLO existe con dry_run:true (en real se ignora)', async () => {
    expect((await sobre({ dry_run: true, _simulacro_respuesta: 'x' }))[0].json.simulacro_respuesta).toBe('x')
    expect((await sobre({ dry_run: false, _simulacro_respuesta: 'x' }))[0].json.simulacro_respuesta).toBeNull()
  })
})

// ── ② las GUARDA ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const parte = (extra: Record<string, unknown> = {}, entregables: unknown[] = [BRIEF]) => ({ id: PID, created_at: '2026-10-01T00:04:23Z', title: 'Parte de trabajo · briefs · 2026-10-01', provenance_tag: { valido: true, plan_id: 'plan-1', manual_id: 'man-1', parte: { entregables } }, ...extra })
const guardaParte = (filas: unknown[], env: Record<string, unknown> = {}) => correrNodo('guardaParte', { input: filas.length ? filas : [{}], refs: { '⓪ Sobre · llave · modo seco': { ...SOBRE, ...env } } })
describe('② GUARDA · el parte y el brief', () => {
  it('lee el brief ESTRUCTURADO del parte y lo arma como texto para el productor', async () => {
    const [{ json }] = await guardaParte([parte()])
    expect(json).toMatchObject({ parte_id: PID, plan_id: 'plan-1', plataforma: 'Meta Ads (Facebook e Instagram)', tipo_de_pieza: 'imagen' })
    expect(json.brief_texto).toContain('BRIEF BRF-0006')
    expect(json.brief_texto).toContain('Titular de Meta Ads: ≤ 40 caracteres')
    expect(json.brief_texto).toContain('  - marisco de Olón')
  })
  it('🔴 sin parte · parte ⛔ · parte ilegible · brief inexistente ⇒ se DETIENE con su motivo (nada se escribe)', async () => {
    await expect(guardaParte([])).rejects.toThrow(/PIEZA_SIN_PARTE/)
    await expect(guardaParte([parte({ title: '⛔ PARTE NO VÁLIDO · x' })])).rejects.toThrow(/PIEZA_PARTE_NO_VALIDO/)
    await expect(guardaParte([parte({ provenance_tag: { valido: false, parte: { entregables: [BRIEF] } } })])).rejects.toThrow(/PIEZA_PARTE_NO_VALIDO/)
    await expect(guardaParte([parte({ provenance_tag: {} })])).rejects.toThrow(/PIEZA_PARTE_ILEGIBLE/)
    await expect(guardaParte([parte()], { brief_id: 'BRF-9999' })).rejects.toThrow(/PIEZA_BRIEF_INEXISTENTE.*BRF-0006/)
  })
  it('con parte_id pide ESE parte (aunque haya uno más nuevo) · sin él toma el más reciente que sea válido', async () => {
    const viejo = parte({ id: 'viejo-0000-0000-0000-000000000000' })
    const nuevoInvalido = parte({ id: 'nuevo-0000-0000-0000-000000000000', title: '⛔ PARTE NO VÁLIDO · x' })
    expect((await guardaParte([nuevoInvalido, viejo]))[0].json.parte_id).toBe(viejo.id)
    await expect(guardaParte([viejo], { parte_id: PID })).rejects.toThrow(/PIEZA_PARTE_INEXISTENTE/)
  })
  it('el manual: sin manual o no aprobado ⇒ se detiene', async () => {
    const refs = { '① GUARDA · el parte y el brief': { ...SOBRE, brief: BRIEF } }
    await expect(correrNodo('guardaManual', { input: [{}], refs })).rejects.toThrow(/PIEZA_SIN_MANUAL/)
    await expect(correrNodo('guardaManual', { input: [{ id: 'm', gate_outcome: 'pendiente' }], refs })).rejects.toThrow(/PIEZA_MANUAL_NO_APROBADO/)
    const [{ json }] = await correrNodo('guardaManual', { input: [{ id: 'm', version: 2, gate_outcome: 'paso_la_vara', forbidden_words: ['premium'] }], refs })
    expect(json).toMatchObject({ manual_id: 'm', manual_version: 2, forbidden_words: ['premium'] })
  })
})

const URL_OK = 'https://abc.supabase.co/storage/v1/object/public/client-social-images/' + CID + '/propio/x/'
const foto = (n: number, extra: Record<string, unknown> = {}) => ({ id: 'f' + n, tipo: 'imagen', post_id: 'p' + n, url: URL_OK + n + '.jpg', estado: 'ok', created_at: '2026-09-29', ...extra })
const cabeza = (bytes = 200000, ct = 'image/jpeg', status = 200) => ({ statusCode: status, headers: { 'content-type': ct, 'content-length': String(bytes) } })
const guardaFotos = (filas: unknown[], respuesta: (url: string) => unknown = () => cabeza()) =>
  correrNodo('guardaFotos', { input: filas.length ? filas : [{}], refs: { '② GUARDA · sin manual aprobado se DETIENE': { ...SOBRE, brief: BRIEF } }, helpers: { httpRequest: async (o: { url: string }) => { const r = respuesta(o.url); if (r instanceof Error) throw r; return r } } })
describe('③ GUARDA · las fotos propias (todas las ramas)', () => {
  it('todas las fotos que sirven se mandan, con su rótulo · y se declaran las cuentas', async () => {
    const [{ json }] = await guardaFotos([foto(1), foto(2), foto(3)])
    expect(json.fotos).toHaveLength(3)
    expect(json.fotos[0]).toEqual({ url: URL_OK + '1.jpg', label: 'imagen · p1' })
    expect(json).toMatchObject({ fotos_en_la_tabla: 3, fotos_enviadas: 3, fotos_no_enviadas: [], fotos_excluidas: [], sin_fotos: false })
  })
  it('🔴 CLIENTE SIN FOTOS: no es un fallo · la pieza sale sin ellas y lo dice', async () => {
    const [{ json }] = await guardaFotos([])
    expect(json).toMatchObject({ fotos: [], fotos_en_la_tabla: 0, sin_fotos: true })
  })
  it('🔴 FOTO QUE NO BAJA: se EXCLUYE y se DECLARA con su causa (el corredor abortaría todo el pedido) · las demás siguen', async () => {
    const [{ json }] = await guardaFotos([foto(1), foto(2), foto(3), foto(4)], (u) => u.endsWith('2.jpg') ? cabeza(0, 'image/jpeg', 404) : u.endsWith('3.jpg') ? new Error('ETIMEDOUT') : cabeza())
    expect(json.fotos).toHaveLength(2)
    expect(json.fotos_excluidas).toEqual([
      expect.objectContaining({ id: 'f2', causa: 'HTTP 404' }),
      expect.objectContaining({ id: 'f3', causa: expect.stringContaining('ETIMEDOUT') }),
    ])
  })
  it('una foto que no es imagen, o pesa más de 5 MB, o no declara tamaño, se excluye y se declara', async () => {
    const [{ json }] = await guardaFotos([foto(1), foto(2), foto(3), foto(4)], (u) => u.endsWith('1.jpg') ? cabeza(100, 'text/html') : u.endsWith('2.jpg') ? cabeza(6 * 1024 * 1024) : u.endsWith('3.jpg') ? { statusCode: 200, headers: { 'content-type': 'image/png' } } : cabeza())
    expect(json.fotos.map((f: { label: string }) => f.label)).toEqual(['imagen · p4'])
    expect(json.fotos_excluidas.map((x: { causa: string }) => x.causa).join(' | ')).toMatch(/no es una imagen aceptada/)
    expect(json.fotos_excluidas.map((x: { causa: string }) => x.causa).join(' | ')).toMatch(/pesa 6291456/)
    expect(json.fotos_excluidas.map((x: { causa: string }) => x.causa).join(' | ')).toMatch(/sin tamaño declarado/)
  })
  it('todas excluidas ⇒ sin_fotos:true y las excluidas declaradas (nunca callado)', async () => {
    const [{ json }] = await guardaFotos([foto(1), foto(2)], () => cabeza(0, 'image/jpeg', 500))
    expect(json).toMatchObject({ sin_fotos: true, fotos_enviadas: 0 })
    expect(json.fotos_excluidas).toHaveLength(2)
  })
  it('🔴 más de 20: se mandan 20 (las más recientes) y se DECLARAN las que quedaron fuera · no se recorta callado', async () => {
    const [{ json }] = await guardaFotos(Array.from({ length: 23 }, (_, i) => foto(i + 1)))
    expect(json.fotos).toHaveLength(20)
    expect(json.fotos_no_enviadas).toEqual(['f21', 'f22', 'f23'])
    expect(json.fotos_en_la_tabla).toBe(23)
  })
  it('el total en base64 no pasa de 32 MB: lo que sobra se declara', async () => {
    const [{ json }] = await guardaFotos(Array.from({ length: 10 }, (_, i) => foto(i + 1)), () => cabeza(4.9 * 1024 * 1024))
    expect(json.fotos_bytes * 4 / 3).toBeLessThanOrEqual(32 * 1024 * 1024)
    expect(json.fotos_excluidas.some((x: { causa: string }) => /32 MB/.test(x.causa))).toBe(true)
  })
  it('🔴 una foto que NO es de nuestro almacén (p. ej. un enlace de Instagram) DETIENE la corrida', async () => {
    await expect(guardaFotos([foto(1), foto(2, { url: 'https://scontent-ssn1-1.cdninstagram.com/v/x.jpg' })])).rejects.toThrow(/PIEZA_FOTO_FUERA_DEL_ALMACEN/)
  })
  it('la pieza repetida: se detiene salvo forzar o modo seco', async () => {
    const refs = { '③ GUARDA · las fotos propias': { ...SOBRE, fotos: [] } }
    await expect(correrNodo('guardaRepetida', { input: [{ id: 'p0', created_at: 'ayer' }], refs })).rejects.toThrow(/PIEZA_REPETIDA/)
    expect((await correrNodo('guardaRepetida', { input: [{ id: 'p0', created_at: 'ayer' }], refs: { '③ GUARDA · las fotos propias': { ...SOBRE, forzar: true } } }))[0].json.repetido_declarado).toBe(true)
    expect((await correrNodo('guardaRepetida', { input: [{ id: 'p0', created_at: 'ayer' }], refs: { '③ GUARDA · las fotos propias': { ...SOBRE, dry_run: true } } }))[0].json.repetido_declarado).toBe(true)
    expect((await correrNodo('guardaRepetida', { input: [{}], refs }))[0].json.repetido_declarado).toBe(false)
  })
})

// ── ③ el cuerpo que paga ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const prevCuerpo = (extra: Record<string, unknown> = {}) => ({ ...SOBRE, brief: BRIEF, brief_texto: 'BRIEF BRF-0006 · …', fotos: [{ url: URL_OK + '1.jpg', label: 'imagen · p1' }, { url: URL_OK + '2.jpg', label: 'imagen · p2' }], ...extra })
const armar = (prev: Record<string, unknown>, ficha: Record<string, unknown> = { id: CID, name: 'Mi Negocio', config: { apify: { own_handles: { instagram: ['minegocio'] } } }, website: 'https://www.minegocio.ec/', country: 'Ecuador' }) =>
  correrNodo('cuerpo', { input: [ficha], refs: { '④ ¿Ya hay pieza de este brief? · guarda': prev } }).then((r) => r[0].json)
describe('③ el cuerpo que se manda al nodo que paga', () => {
  it('🔴 lleva TODO lo que el canon exige: dry_run · runner · force_restart · thinking disabled · tope SIEMPRE · fotos en base64 · el workflow', async () => {
    const j = await armar(prevCuerpo())
    expect(j.cuerpo).toMatchObject({ agent: 'campaign-brief-agent', client_id: CID, workflow_id: 'WF-PIEZA', workflow_execution_id: '999', callback_url: 'https://n8n.test/webhook-waiting/999', callback_mode: 'runner', force_restart: true, dry_run: false, max_budget_usd: 0.6, thinking_mode: 'disabled', images_mode: 'base64' })
    expect(j.cuerpo.images).toHaveLength(2)
  })
  it('🔴 «máximo 4 pedidos» y «sólo estas opciones» viajan como CAMPO para que el sistema los haga cumplir · y son exactamente lo que se le ofrece al agente (nunca los anuncios de pago)', async () => {
    const j = await armar(prevCuerpo())
    // 02-oct: `ficha_en_mapas` se ofrece SÓLO si la ficha trae una ubicación (ciudad o sede) · el país solo NO es una ubicación (con «Ecuador» trajo la ficha de OTRO negocio)
    expect(j.cuerpo.mirar_afuera_limites).toEqual({ max_pedidos: 4, permitidos: ['instagram', 'leer_el_sitio', 'que_dice_el_buscador'] })
    const conCiudad = await armar(prevCuerpo(), { id: CID, name: 'Mi Negocio', config: { apify: { own_handles: { instagram: ['minegocio'] } } }, website: 'https://www.minegocio.ec/', country: 'Ecuador', market: 'Guayaquil · Guayas' })
    expect(conCiudad.cuerpo.mirar_afuera_limites).toEqual({ max_pedidos: 4, permitidos: ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador'] })
    const sin = await armar(prevCuerpo(), { id: CID, name: 'Otro Negocio' })
    expect(sin.cuerpo.mirar_afuera_limites).toEqual({ max_pedidos: 4, permitidos: ['que_dice_el_buscador'] })
    for (const caro of ['anuncios_en_meta', 'anuncios_en_google']) expect(j.cuerpo.mirar_afuera_limites.permitidos).not.toContain(caro)
  })
  it('el dry_run del sobre es el del cuerpo (true ⇒ true) y el tope pedido es el del cuerpo', async () => {
    const j = await armar(prevCuerpo({ dry_run: true, tope_usd: 1.25 }))
    expect(j.cuerpo.dry_run).toBe(true)
    expect(j.cuerpo.max_budget_usd).toBe(1.25)
  })
  it('sin fotos ⇒ el cuerpo NO trae `images` y el pedido lo dice (no inventa)', async () => {
    const j = await armar(prevCuerpo({ fotos: [], sin_fotos: true }))
    expect('images' in j.cuerpo).toBe(false)
    expect('images_mode' in j.cuerpo).toBe(false)
    expect(j.cuerpo.task).toMatch(/NO hay fotos propias disponibles/)
  })
  it('🔴 AGNÓSTICO: el pedido usa los datos de la ficha (nombre · Instagram · sitio · país) y no nombra a ningún cliente', async () => {
    const t = (await armar(prevCuerpo())).cuerpo.task as string
    expect(t).toContain('«Mi Negocio»')
    expect(t).toContain('que_mirar = instagram            · de_quien = minegocio')
    expect(t).toContain('que_mirar = leer_el_sitio        · de_quien = www.minegocio.ec')
    expect(t).not.toContain('donde = Ecuador') // 02-oct: el país solo no es una ubicación
    expect(t).not.toContain('que_mirar = ficha_en_mapas') // y sin ubicación NO se ofrece la ficha de Mapas
    expect(t).toMatch(/NO uses anuncios_en_meta ni anuncios_en_google/)
    expect(t).toMatch(/MÁXIMO 4 pedidos/)
    expect(t).not.toMatch(/Náufrago|naufrago/i)
  })
  it('sin Instagram ni sitio en la ficha: no se le ofrece al agente lo que no hay y se le dice', async () => {
    const t = (await armar(prevCuerpo(), { id: CID, name: 'Otro Negocio' })).cuerpo.task as string
    expect(t).not.toContain('que_mirar = instagram')
    expect(t).not.toContain('que_mirar = leer_el_sitio')
    expect(t).toMatch(/NO tienes: instagram .* · leer_el_sitio/)
  })
  it('el pedido exige respuesta JSON con las claves que leen los chequeos', async () => {
    const t = (await armar(prevCuerpo())).cuerpo.task as string
    for (const k of ['"titular"', '"texto_principal"', '"prompt_imagen"', '"fuente_imagen"', '"no_pude_cumplir"', '"que_miro"']) expect(t).toContain(k)
    expect(t).toMatch(/EN POSITIVO/)
  })
})

// ── ④ la vuelta ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const cuerpoArmado = { ...SOBRE, brief: BRIEF, cuerpo: { dry_run: false, max_budget_usd: 0.6, images: [] }, client_name: 'Mi Negocio' }
const vuelta = (e: unknown, c: Record<string, unknown> = {}) => correrNodo('vuelta', { input: [e], refs: { '⑤ Armar el cuerpo del productor': { ...cuerpoArmado, ...c } } }).then((r) => r[0].json)
describe('④ ¿llegó la vuelta?', () => {
  it('éxito: llegó · texto · costo (snake_case) · modelo', async () => {
    expect(await vuelta({ success: true, response: '{"pieza":{}}', cost_usd: 0.31, model: 'claude-sonnet-4-6' })).toMatchObject({ llego_la_vuelta: true, vuelta_real: true, vuelta_costo_usd: 0.31, falla_del_productor: null, motivo: null })
  })
  it('🔴 FALLO del agente (incluida una foto que no baja): NO es una vuelta · lleva su motivo · no se da por exitosa', async () => {
    const j = await vuelta({ success: false, error: 'imagenes: imagen no descargable · ETIMEDOUT · servidor scontent-ssn1-1' })
    expect(j).toMatchObject({ llego_la_vuelta: false, texto: '' })
    expect(j.motivo).toMatch(/el productor FALLÓ .* ETIMEDOUT/)
  })
  it('🔴 CORTE POR TOPE: el texto parcial se conserva MARCADO pero no cuenta como pieza', async () => {
    const j = await vuelta({ success: false, error: 'error_max_budget_usd · … PARCIAL', partial: true, partial_reason: 'error_max_budget_usd', response: 'TITULAR: Ceviche…', cost_usd: 0.6 })
    expect(j).toMatchObject({ llego_la_vuelta: false, texto: '', texto_parcial: 'TITULAR: Ceviche…', parcial_razon: 'error_max_budget_usd', vuelta_costo_usd: 0.6 })
  })
  it('espera agotada (no llegó nada): se dice y no se da por exitosa', async () => {
    const j = await vuelta({})
    expect(j).toMatchObject({ llego_la_vuelta: false })
    expect(j.motivo).toMatch(/NO llegó · se agotó la espera/)
  })
  it('el simulacro sólo funciona en modo seco', async () => {
    expect((await vuelta({}, { dry_run: true, simulacro_respuesta: 'x' }))).toMatchObject({ simulacro_usado: true, llego_la_vuelta: true })
    expect((await vuelta({}, { dry_run: false, simulacro_respuesta: 'x' }))).toMatchObject({ simulacro_usado: false, llego_la_vuelta: false })
  })
})

// ── ⑤ los chequeos ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const BUENA = { titular: 'El ceviche que viene de Olón', texto_principal: 'Ceviche con marisco de Olón, directo a tu puerta en Guayaquil. Delivery jueves a lunes, 7am a 3pm. $7. Toca «Enviar mensaje» y escríbenos.', prompt_imagen: 'Un plato de ceviche ocupa el encuadre, luz natural cálida, mesa de madera clara, marisco visible', fuente_imagen: 'cliente', no_pude_cumplir: [], que_miro: ['no pedí nada: el brief y las fotos bastaron', 'fotos: luz natural y mesa de madera'] }
const chequear = (p: unknown, forb: string[] = []) => CH.chequearPieza(BRIEF, p, { forbidden_words: forb })
// 03-oct · el brief pide «2 variantes»: una pieza que CUMPLE las entrega en CAMPOS separados (`variantes`), no en un solo texto (ver el-prompt-de-imagen-sale-de-la-foto.test.ts)
const CUMPLE_CON_VARIANTES = { ...BUENA, fuera_de_la_foto: [], variantes: [{ id: 'A', titular: BUENA.titular, texto_principal: BUENA.texto_principal }, { id: 'B', titular: BUENA.titular, texto_principal: BUENA.texto_principal.replace('Ceviche con', 'Ceviche, ahora con') }] }
describe('⑤ los chequeos comparan lo PEDIDO contra lo HECHO', () => {
  it('una pieza que cumple pasa limpia', () => {
    const r = chequear(CUMPLE_CON_VARIANTES)
    expect(r.hallazgos.map((h: { chequeo: string }) => h.chequeo)).toEqual([])
    expect(r.ok).toBe(true)
  })
  it('🔴 el titular pasa del límite del brief ⇒ cuenta los caracteres reales · «los primeros 125 visibles» NO es un máximo', () => {
    const r = chequear({ ...BUENA, titular: 'El ceviche que viene de Olón de verdad, directo a tu puerta' })
    expect(r.por_chequeo.limite_de_caracteres).toBe(1)
    expect(r.hallazgos[0].detalle).toMatch(/titular mide 59 caracteres .* ≤ 40/)
    expect(CH.limitesDelBrief(BRIEF.limites).atribuidos).toEqual([{ campo: 'titular', etiqueta: 'Titular', max: 40 }])
    expect(chequear({ ...BUENA, texto_principal: BUENA.texto_principal + ' '.padEnd(200, 'x') }).por_chequeo.limite_de_caracteres).toBeUndefined()
  })
  it('palabras prohibidas del brief Y del manual, por palabra completa (candidatos)', () => {
    expect(chequear({ ...BUENA, texto_principal: BUENA.texto_principal + ' el mejor sabor' }).por_chequeo.palabra_prohibida).toBe(1)
    expect(chequear({ ...BUENA, titular: 'Ceviche de Olón' }, ['olón']).por_chequeo.palabra_prohibida).toBe(1)
    expect(chequear({ ...BUENA, texto_principal: BUENA.texto_principal + ' gourmetizado' }).por_chequeo.palabra_prohibida).toBeUndefined()
  })
  it('el vocabulario obligatorio que falta se declara · el llamado a la acción trae datos verificables', () => {
    const r = chequear({ ...BUENA, texto_principal: 'Ceviche. Pide ya.' })
    expect(r.por_chequeo.termino_obligatorio_ausente).toBe(1)
    // 02-oct (certificación CC#3): el teléfono es el DESTINO del botón, no copy ⇒ ya no se exige en el texto; en su lugar se pide NOMBRAR el botón
    expect(r.por_chequeo.llamado_ausente).toBeUndefined()
    expect(r.por_chequeo.boton_sin_mencion).toBe(1)
    expect(CH.datosDelLlamado(BRIEF.llamado_a_la_accion)).toEqual([])
  })
  it('🔴 la fuente de la imagen la declara la pieza (si el brief es de imagen) · el prompt va en POSITIVO', () => {
    expect(chequear({ ...BUENA, fuente_imagen: 'quien sabe' }).por_chequeo.fuente_de_imagen_no_declarada).toBe(1)
    expect(chequear({ ...BUENA, fuente_imagen: 'no_declarada' }).por_chequeo.fuente_de_imagen_no_declarada).toBe(1)
    expect(chequear({ ...BUENA, prompt_imagen: '' }).por_chequeo.prompt_de_imagen_ausente).toBe(1)
    expect(chequear({ ...BUENA, prompt_imagen: 'Un plato sin personas ni logo' }).por_chequeo.prompt_con_negaciones).toBe(1)
  })
  it('lo que miró y lo que no pudo se declaran siempre', () => {
    const r = chequear({ ...BUENA, que_miro: [], no_pude_cumplir: undefined })
    expect(r.por_chequeo).toMatchObject({ no_declaro_lo_que_miro: 1, no_declaro_lo_que_no_pudo: 1 })
  })
  it('🔴 sólo DOS cosas son fatales: pieza sin titular NI texto · respuesta ilegible', () => {
    expect(chequear({ ...BUENA, titular: '', texto_principal: '' }).fatales).toEqual(['pieza_vacia'])
    expect(chequear({ ...BUENA, titular: 'x'.repeat(80), texto_principal: 'premium' }).fatales).toEqual([])
  })
  it('el lector tolerante: JSON en bloque ```json · comillas sin escapar reparadas y DECLARADAS · basura ⇒ ilegible', () => {
    const j = JSON.stringify({ pieza: BUENA })
    expect(CH.extraerPieza('```json\n' + j + '\n```').legible).toBe(true)
    expect(CH.extraerPieza('Aquí va: ' + j + ' listo').legible).toBe(true)
    const rota = '{"pieza":{"titular":"Hola","texto_principal":"dice "Hola, quiero pedir" y listo","prompt_imagen":"x","fuente_imagen":"cliente","no_pude_cumplir":[],"que_miro":["a"]}}'
    const e = CH.extraerPieza(rota)
    expect(e).toMatchObject({ legible: true, reparado: true, comillas_reparadas: 2 })
    expect(e.pieza.texto_principal).toBe('dice "Hola, quiero pedir" y listo')
    expect(CH.extraerPieza('no hay json').legible).toBe(false)
    expect(CH.extraerPieza('').legible).toBe(false)
  })
})

const chequeos = (texto: string, c: Record<string, unknown> = {}) => correrNodo('chequeos', {
  input: [{}],
  refs: { '⑥ ¿Llegó la vuelta?': { ...cuerpoArmado, llego_la_vuelta: texto.trim() !== '', texto, motivo: texto.trim() === '' ? 'la vuelta del productor NO llegó' : null, manual_id: 'man-1', manual_version: 2, parte_id: PID, plan_id: 'plan-1', forbidden_words: [], fotos_en_la_tabla: 2, fotos_enviadas: 2, fotos_no_enviadas: [], fotos_excluidas: [], sin_fotos: false, brief_id: 'BRF-0006', vuelta_costo_usd: 0.31, ...c } },
}).then((r) => r[0].json)
describe('⑦ el nodo de chequeos arma la fila · la pieza inválida no se da por buena', () => {
  it('pieza sana ⇒ fila draft con el brief, el prompt y la fuente declarada dentro de provenance_tag', async () => {
    const j = await chequeos(JSON.stringify({ pieza: CUMPLE_CON_VARIANTES }))
    expect(j).toMatchObject({ pieza_valida: true, chequeos_ok: true, motivo_invalido: null })
    expect(j.fila_pieza).toMatchObject({ output_type: 'campaign_piece', status: 'draft', producing_agent: 'campaign-brief-agent', client_id: CID })
    expect(j.fila_pieza.title).toMatch(/^Pieza · BRF-0006 · Meta Ads/)
    expect(j.fila_pieza.provenance_tag).toMatchObject({ brief_id: 'BRF-0006', parte_id: PID, valida: true, prompt_imagen: BUENA.prompt_imagen, fuente_imagen: 'cliente', thinking_mode: 'disabled', tope_usd: 0.6, costo_usd: 0.31 })
    expect(j.fila_pieza.provenance_tag.brief.id).toBe('BRF-0006')
    expect(j.fila_pieza.content).toContain('LO QUE SE PIDIÓ ↔ LO QUE SALIÓ')
    expect(j.payload_cable).toMatchObject({ event_type: 'run_completed', worker_name: 'pieza', resultado: 'pieza_terminada', brief_id: 'BRF-0006' })
  })
  it('🔴 la vuelta no llegó / respuesta ilegible / pieza vacía ⇒ ⛔ PIEZA NO VÁLIDA con su motivo (se guarda para diagnóstico, no se da por buena)', async () => {
    for (const [texto, motivo] of [['', /vuelta del productor NO llegó/], ['esto no es json', /no se pudo leer como pieza/], [JSON.stringify({ pieza: { ...BUENA, titular: '', texto_principal: '' } }), /chequeo fatal: pieza_vacia/]] as const) {
      const j = await chequeos(texto)
      expect(j.pieza_valida).toBe(false)
      expect(j.motivo_invalido).toMatch(motivo)
      expect(j.fila_pieza.title).toMatch(/^⛔ PIEZA NO VÁLIDA · /)
      expect(j.payload_cable.resultado).toBe('pieza_no_valida')
    }
  })
  it('el texto PARCIAL de un corte viaja marcado dentro del documento, nunca como pieza', async () => {
    const j = await chequeos('', { texto_parcial: 'TITULAR: Ceviche…', parcial_razon: 'error_max_budget_usd', falla_del_productor: 'error_max_budget_usd · PARCIAL' })
    expect(j.pieza_valida).toBe(false)
    expect(j.fila_pieza.content).toContain('Texto PARCIAL del productor')
    expect(j.fila_pieza.provenance_tag.pieza).toBeNull()
  })
  it('una foto excluida y las no enviadas quedan DECLARADAS en la pieza', async () => {
    const j = await chequeos(JSON.stringify({ pieza: BUENA }), { fotos_excluidas: [{ id: 'f9', label: 'imagen · p9', causa: 'HTTP 404' }], fotos_no_enviadas: ['f21'] })
    expect(j.fila_pieza.content).toContain('EXCLUIDA f9 · imagen · p9 · HTTP 404')
    expect(j.fila_pieza.content).toContain('NO enviadas por el límite de 20 por pedido: 1 (f21)')
  })
})

describe('⑧⑨ el ramal seco, el cierre y el cable', () => {
  it('seco: valida las formas, no escribe nada, y una pieza inválida termina en ERROR como en real', async () => {
    const sana = await chequeos(JSON.stringify({ pieza: BUENA }), { dry_run: true })
    const [{ json }] = await correrNodo('secoCierre', { input: [sana] })
    expect(json).toMatchObject({ seco: true, escrituras_reales: 0, formas_validas: true, habria_cerrado_como: 'pieza_terminada' })
    const mala = await chequeos('', { dry_run: true })
    await expect(correrNodo('secoCierre', { input: [mala] })).rejects.toThrow(/PIEZA_NO_VALIDA \(modo seco\)/)
  })
  it('cierre: sin guardado o con pieza inválida ⇒ ok:false con problemas · el cable declara el resultado REAL', async () => {
    const v = await chequeos(JSON.stringify({ pieza: BUENA }))
    const cierre = (g: unknown) => correrNodo('cierre', { input: [{}], refs: { '⑦ Chequeos': v, '⑧ Guardar la pieza': g } }).then((r) => r[0].json)
    expect(await cierre([{ id: 'pieza-1' }])).toMatchObject({ ok: true, pieza_guardada: true, payload_cable: { resultado: 'pieza_terminada', pieza_id: 'pieza-1' } })
    const sinGuardar = await cierre({ message: 'permission denied for table x' })
    expect(sinGuardar).toMatchObject({ ok: false, pieza_guardada: false })
    expect(sinGuardar.problemas.join(' ')).toMatch(/permission denied/)
    expect(sinGuardar.payload_cable.resultado).toBe('pieza_con_problemas')
  })
  it('cable: la corrida termina en ERROR si la pieza no vale · el cable mudo sólo falla ruidoso si la sala lo despachó', async () => {
    const refs = (ok: boolean, corr: string | null) => ({ '⓪ Sobre · llave · modo seco': { _sala_correlation_id: corr }, '⑧ ¿Guardó la pieza?': { ok, pieza_valida: ok, problemas: ['x'] } })
    await expect(correrNodo('volvio', { input: [{ ok: true }], refs: refs(false, null) })).rejects.toThrow(/PIEZA_NO_VALIDA|PIEZA_CON_PROBLEMAS/)
    await expect(correrNodo('volvio', { input: [{ ok: false, code: 500 }], refs: refs(true, 'corr-1') })).rejects.toThrow(/CABLE_DE_VUELTA_MUDO/)
    expect((await correrNodo('volvio', { input: [{ ok: false }], refs: refs(true, null) }))[0].json).toMatchObject({ vuelta_ok: false, despachado_por_la_sala: false })
    expect((await correrNodo('volvio', { input: [{ ok: true, event_id: 'e1' }], refs: refs(true, 'corr-1') }))[0].json).toMatchObject({ cierre: 'pieza_terminada', vuelta_ok: true })
  })
})

// ── ⑥ el CANON de Emilio como propiedad del GRAFO ───────────────────────────────────────────────────────────────────────────────────────
const PAGAN = (n: Record<string, any>) => n.type.endsWith('httpRequest') && /run-sdk|apify|anthropic|openai|n8n-production-72be\.up\.railway\.app\/webhook\//.test(String(n.parameters?.url ?? ''))
/** las propiedades del canon · devuelve las violaciones (vacío = cumple) · se aplica al flujo nuevo Y al flujo de prueba de hoy */
function violacionesDelCanon(f: { nodes: Array<Record<string, any>>; connections: Record<string, any> }): string[] {
  const v: string[] = []
  for (const n of f.nodes) {
    if (PAGAN(n) && n.retryOnFail) v.push(`retryOnFail en un nodo que paga: ${n.name}`)
    if (n.type.endsWith('wait') && n.parameters?.resumeUnit === 'seconds' && Number(n.parameters?.resumeAmount) < 3600) v.push(`espera menor a 3600 s: ${n.name}`)
  }
  return v
}
describe('⑥ el canon de Emilio como propiedad del grafo (estructural · sin temporales · sin vigilancia)', () => {
  const f = construirFlujo()
  const porNombre = (nombre: string) => f.nodes.find((n: { name: string }) => n.name === nombre)
  it('🔴 ningún nodo que paga tiene retryOnFail · la espera es de 3.600 s · el productor llama UNA vez', () => {
    expect(violacionesDelCanon(f)).toEqual([])
    expect(f.nodes.some((n: Record<string, unknown>) => 'retryOnFail' in n || 'maxTries' in n || 'waitBetweenTries' in n)).toBe(false)
    expect(porNombre(N.espera).parameters).toMatchObject({ resumeAmount: 3600, resumeUnit: 'seconds', limitWaitTime: true })
    expect(PAGAN(porNombre(N.productor))).toBe(true)
  })
  it('🔴 ninguna consulta se traga el error ni deja la corrida «exitosa» sin hacer nada: todas entregan salida y una GUARDA decide', () => {
    const consultas = f.nodes.filter((n: { name: string }) => [N.parte, N.manual, N.fotos, N.repetida, N.ficha].includes(n.name))
    expect(consultas).toHaveLength(5)
    for (const q of consultas) expect(q.alwaysOutputData, q.name).toBe(true)
    // cada consulta va seguida de un nodo Code (la GUARDA o quien lee su resultado) y nunca de otra consulta suelta
    const sig = (nombre: string) => f.connections[nombre].main[0][0].node
    for (const [q, g] of [[N.parte, N.guardaParte], [N.manual, N.guardaManual], [N.fotos, N.guardaFotos], [N.repetida, N.guardaRepetida], [N.ficha, N.sedes], [N.sedes, N.guardaSedes], [N.guardaSedes, N.cuerpo]]) expect(sig(q)).toBe(g)
    // los nodos de red de aguas abajo se leen en un Code que declara el fallo
    expect(sig(N.salud)).toBe(N.guardaSalud) // la comprobación previa al corredor también
    expect(sig(N.productor)).toBe(N.acepto) // el rechazo síncrono de run-sdk se declara ANTES de esperar (cerrar el rojo, 01-oct)
    expect(sig(N.acepto)).toBe(N.espera)
    expect(sig(N.espera)).toBe(N.vuelta)
    expect(sig(N.guardar)).toBe(N.cierre)
    expect(sig(N.cable)).toBe(N.volvio)
  })
  it('🔴 el orden lo da el GRAFO: cero lecturas por nombre a un nodo que no sea antecesor (regla adoptada 30-sep)', () => {
    expect(lecturasFueraDeOrden(f)).toEqual([])
  })
  it('🔴 el ramal seco NO alcanza ningún nodo que escriba, avise o pague', () => {
    const alcanzables = new Set<string>()
    const pila = [N.secoCierre]
    while (pila.length) { const x = pila.pop()!; if (alcanzables.has(x)) continue; alcanzables.add(x); for (const s of f.connections[x]?.main ?? []) for (const h of s) pila.push(h.node) }
    for (const escritor of [N.guardar, N.cierre, N.cable, N.volvio, N.productor]) expect(alcanzables.has(escritor), escritor).toBe(false)
    // y el IF: verdadero ⇒ seco · falso ⇒ guardar
    expect(f.connections[N.seco].main[0][0].node).toBe(N.secoCierre)
    expect(f.connections[N.seco].main[1][0].node).toBe(N.guardar)
  })
  it('todos los nodos Code compilan · ninguno usa `fetch` ni `new URL` (no existen en el nodo Code de n8n)', () => {
    for (const n of f.nodes.filter((x: { type: string }) => x.type.endsWith('code'))) {
      expect(() => new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', n.parameters.jsCode), n.name).not.toThrow()
      expect(n.parameters.jsCode, n.name).not.toMatch(/\bfetch\(|new URL\(/)
    }
  })
  it('el flujo nace SIN activar: el constructor nunca lo marca activo y crea sólo con --crear', () => {
    expect('active' in f).toBe(false)
    expect(readFileSync(join(DIR, 'construir-pieza.mjs'), 'utf8')).not.toMatch(/\/activate/)
  })
  it('un sólo nodo habla con la sala por la puerta: la vuelta es del corredor (callback_mode runner) y la espera se reanuda con $execution.resumeUrl', async () => {
    const cuerpo = (await armar(prevCuerpo())).cuerpo
    expect(cuerpo.callback_url).toMatch(/webhook-waiting/)
    expect(cuerpo.callback_mode).toBe('runner')
  })
  it('🔴 MUTACIONES: las propiedades del canon se ponen ROJAS si alguien las rompe', () => {
    const roto = JSON.parse(JSON.stringify(f))
    roto.nodes.find((n: { name: string }) => n.name === N.productor).retryOnFail = true
    expect(violacionesDelCanon(roto)).toHaveLength(1)
    const corto = JSON.parse(JSON.stringify(f))
    corto.nodes.find((n: { name: string }) => n.name === N.espera).parameters.resumeAmount = 900
    expect(violacionesDelCanon(corto)).toHaveLength(1)
    const desordenado = JSON.parse(JSON.stringify(f))
    desordenado.connections[N.guardaManual].main[0][0].node = N.repetida // se salta las fotos: la guarda de «repetida» lee un nodo que ya no es antecesor
    expect(lecturasFueraDeOrden(desordenado).length).toBeGreaterThan(0)
  })
})

// ── ⑦ EL ROJO: la misma propiedad contra el estado de HOY ────────────────────────────────────────────────────────────────────────────────
describe('⑦ el ROJO que debe FALLAR contra el estado de hoy', () => {
  it('🔴 el flujo de prueba smoke-test-agent (versión viva 5681d0e1) VIOLA el canon: retryOnFail en el nodo que paga · el mismo chequeo que da verde al flujo nuevo', () => {
    const v = violacionesDelCanon(SMOKE_DE_HOY)
    expect(v).toEqual(['retryOnFail en un nodo que paga: Invoke agent via /api/agents/run-sdk'])
    expect(violacionesDelCanon(construirFlujo())).toEqual([])
  })
})
