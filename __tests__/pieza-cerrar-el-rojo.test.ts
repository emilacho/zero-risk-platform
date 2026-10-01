/**
 * CERRAR EL ROJO DEL FLUJO DE LA PIEZA · pruebas a costo cero · CC#1 · 2026-10-01 · encargo Lenovo `cerrar-el-rojo-del-flujo-de-la-pieza` (origen: certificación de CC#3, punto 2 🔴).
 *
 * 🔴 Cada prueba de este archivo tiene que FALLAR contra el estado de ANTES (commit `c5eed5e`) y PASAR después:
 *   ① un ERROR DE LA BASE en ③ fotos · ④ pieza repetida · ⑤ ficha se DETIENE con motivo (antes: se leía como «sin fotos», «no hay pieza previa», «el cliente» y SEGUÍA al nodo que paga)
 *   ② un rechazo SÍNCRONO de `run-sdk` (400/403/429…) se DETIENE YA con el motivo (antes: el flujo esperaba la hora de ⑥ y rotulaba mal la causa)
 */
import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { construirFlujo, codigoDeNodo, N } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
const { lecturasFueraDeOrden } = await import(pathToFileURL(join(process.cwd(), 'scripts', 'worker-staging', 'orden-explicito-2026-09-30', 'lecturas-fuera-de-orden.mjs')).href)

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; helpers?: unknown }
async function correrNodo(clave: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => { if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: ctx.refs![n] }), all: () => [{ json: ctx.refs![n] }] } }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave)).call({ helpers: ctx.helpers }, $input, $, {}, items[0]?.json, { id: 'WF-PIEZA' }, { id: '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}

const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const SOBRE = { client_id: CID, tenant_id: CID, parte_id: 'p', brief_id: 'BRF-0006', dry_run: false, forzar: false, tope_usd: 0.6, tope_de_fabrica: true, _sala_correlation_id: null }
// lo que n8n entrega cuando el nodo HTTP falla con `onError: continueRegularOutput`: un ítem `{error:{…}}` (reproducido por CC#3)
const FALLO_DE_LA_BASE = [{ error: { message: 'timeout of 30000ms exceeded', name: 'NodeApiError', httpCode: '504' } }]
// y lo que deja PostgREST cuando contesta con un objeto de error en vez de una lista (p. ej. una columna que no existe)
const OBJETO_DE_ERROR = [{ code: '42703', message: 'column client_social_images.nope does not exist', details: null, hint: null }]
const ficha = { id: CID, name: 'Mi Negocio', config: {} }

describe('① un error de la base se DETIENE con motivo (nunca se lee como «vacío»)', () => {
  const casos: Array<[string, string, () => Promise<unknown>, RegExp]> = [
    ['① el parte', 'guardaParte', () => correrNodo('guardaParte', { input: FALLO_DE_LA_BASE, refs: { '⓪ Sobre · llave · modo seco': SOBRE } }), /PIEZA_PARTE_CONSULTA_FALLO/],
    ['② el manual', 'guardaManual', () => correrNodo('guardaManual', { input: FALLO_DE_LA_BASE, refs: { '① GUARDA · el parte y el brief': SOBRE } }), /PIEZA_MANUAL_CONSULTA_FALLO/],
    ['③ las fotos', 'guardaFotos', () => correrNodo('guardaFotos', { input: FALLO_DE_LA_BASE, refs: { '② GUARDA · sin manual aprobado se DETIENE': SOBRE }, helpers: { httpRequest: async () => ({ statusCode: 200, headers: {} }) } }), /PIEZA_FOTOS_CONSULTA_FALLO/],
    ['④ la pieza repetida', 'guardaRepetida', () => correrNodo('guardaRepetida', { input: FALLO_DE_LA_BASE, refs: { '③ GUARDA · las fotos propias': SOBRE } }), /PIEZA_REPETIDA_CONSULTA_FALLO/],
    ['⑤ la ficha', 'cuerpo', () => correrNodo('cuerpo', { input: FALLO_DE_LA_BASE, refs: { '④ ¿Ya hay pieza de este brief? · guarda': { ...SOBRE, brief: {}, brief_texto: 'x', fotos: [] } } }), /PIEZA_FICHA_CONSULTA_FALLO/],
  ]
  it.each(casos)('🔴 %s: un ítem de error (HTTP caído) ⇒ se DETIENE con su motivo y NO sigue al nodo que paga', async (_n, _c, correr, motivo) => {
    await expect(correr()).rejects.toThrow(motivo)
  })
  it.each([
    ['③ las fotos', () => correrNodo('guardaFotos', { input: OBJETO_DE_ERROR, refs: { '② GUARDA · sin manual aprobado se DETIENE': SOBRE }, helpers: { httpRequest: async () => ({ statusCode: 200, headers: {} }) } }), /PIEZA_FOTOS_CONSULTA_FALLO/],
    ['④ la pieza repetida', () => correrNodo('guardaRepetida', { input: OBJETO_DE_ERROR, refs: { '③ GUARDA · las fotos propias': SOBRE } }), /PIEZA_REPETIDA_CONSULTA_FALLO/],
    ['⑤ la ficha', () => correrNodo('cuerpo', { input: OBJETO_DE_ERROR, refs: { '④ ¿Ya hay pieza de este brief? · guarda': { ...SOBRE, brief: {}, brief_texto: 'x', fotos: [] } } }), /PIEZA_FICHA_CONSULTA_FALLO/],
  ])('🔴 %s: un OBJETO de error de PostgREST (no una lista) también se DETIENE', async (_n, correr, motivo) => {
    await expect(correr()).rejects.toThrow(motivo)
  })
  it('🔴 ⑤ una ficha VACÍA (la consulta volvió sin fila) se DETIENE: sin ficha no hay nombre, sitio ni Instagram', async () => {
    await expect(correrNodo('cuerpo', { input: [{}], refs: { '④ ¿Ya hay pieza de este brief? · guarda': { ...SOBRE, brief: {}, brief_texto: 'x', fotos: [] } } })).rejects.toThrow(/PIEZA_SIN_FICHA/)
  })
  it('CONTROL POSITIVO: lo legítimo sigue pasando · cliente sin fotos (lista vacía) · sin pieza previa · ficha con fila', async () => {
    const f = await correrNodo('guardaFotos', { input: [{}], refs: { '② GUARDA · sin manual aprobado se DETIENE': SOBRE }, helpers: { httpRequest: async () => ({ statusCode: 200, headers: {} }) } })
    expect(f[0].json).toMatchObject({ sin_fotos: true, fotos_en_la_tabla: 0 })
    const r = await correrNodo('guardaRepetida', { input: [{}], refs: { '③ GUARDA · las fotos propias': SOBRE } })
    expect(r[0].json).toMatchObject({ repetido_declarado: false })
    const c = await correrNodo('cuerpo', { input: [ficha], refs: { '④ ¿Ya hay pieza de este brief? · guarda': { ...SOBRE, brief: {}, brief_texto: 'x', fotos: [] } } })
    expect(c[0].json.client_name).toBe('Mi Negocio')
  })
  it('🔴 la propiedad GENERAL: ninguna GUARDA de una consulta lee un error como «vacío» (el resultado de cada una con un ítem de error es una EXCEPCIÓN)', async () => {
    const f = construirFlujo()
    const consultas = [N.parte, N.manual, N.fotos, N.repetida, N.ficha]
    expect(consultas.every((q: string) => f.connections[q])).toBe(true)
    for (const [i, c] of ['guardaParte', 'guardaManual', 'guardaFotos', 'guardaRepetida', 'cuerpo'].entries()) {
      const refs: Record<string, unknown> = { '⓪ Sobre · llave · modo seco': SOBRE, '① GUARDA · el parte y el brief': SOBRE, '② GUARDA · sin manual aprobado se DETIENE': SOBRE, '③ GUARDA · las fotos propias': SOBRE, '④ ¿Ya hay pieza de este brief? · guarda': { ...SOBRE, brief: {}, brief_texto: 'x', fotos: [] } }
      await expect(correrNodo(c, { input: FALLO_DE_LA_BASE, refs, helpers: { httpRequest: async () => ({ statusCode: 200, headers: {} }) } }), consultas[i]).rejects.toThrow(/CONSULTA_FALLO|SIN_FICHA/)
    }
  })
})

describe('② un rechazo SÍNCRONO de run-sdk se DETIENE YA, con su motivo', () => {
  const acepto = (cuerpo: unknown) => correrNodo('acepto', { input: [cuerpo], refs: { '⑤ Armar el cuerpo del productor': { ...SOBRE, cuerpo: { max_budget_usd: 0.6 } } } })
  it('el nodo existe, va entre el productor y la espera, y la cadena queda en serie', () => {
    const f = construirFlujo()
    expect(N.acepto).toBeDefined()
    expect(f.connections[N.productor].main[0][0].node).toBe(N.acepto)
    expect(f.connections[N.acepto].main[0][0].node).toBe(N.espera)
    expect(lecturasFueraDeOrden(f)).toEqual([])
  })
  it('✅ aceptado (202 · accepted:true · will_callback) ⇒ pasa a esperar la vuelta', async () => {
    const [{ json }] = await acepto({ accepted: true, will_callback: true, dispatch_key: 'dispatch:W:a:1', ack_timestamp: 't' })
    expect(json).toMatchObject({ pedido_aceptado: true, dispatch_key: 'dispatch:W:a:1' })
    expect((await acepto({ accepted: true, delivered_by: 'runner', dispatch_key: 'd' }))[0].json.pedido_aceptado).toBe(true)
  })
  it.each([
    ['400 · foto mal escrita', { error: 'images_invalid', code: 'E-IMAGES-INVALID', detail: 'images[3].url debe ser https' }, /E-IMAGES-INVALID/],
    ['400 · tope mal escrito', { error: 'max_budget_usd_invalid', code: 'E-BUDGET-INVALID', detail: 'x' }, /E-BUDGET-INVALID/],
    ['403 · sin workflow_id', { error: 'workflow_id_required', detail: 'pass workflow_id' }, /workflow_id_required/],
    ['429 · el freno de gasto', { error: 'cost_cap_exceeded', code: 'E-CAP-150', detail: 'spend cap' }, /E-CAP-150/],
    ['400 · dirección de vuelta ajena', { success: false, error: 'callback_url_not_allowed', code: 'E-CALLBACK-HOST' }, /E-CALLBACK-HOST/],
    ['502 · el corredor no está', { error: 'agent-runner upstream failed', upstream_status: 502 }, /upstream failed/],
  ])('🔴 %s ⇒ PIEZA_PEDIDO_RECHAZADO con la causa · NO espera la hora', async (_n, cuerpo, motivo) => {
    await expect(acepto(cuerpo)).rejects.toThrow(/PIEZA_PEDIDO_RECHAZADO/)
    await expect(acepto(cuerpo)).rejects.toThrow(motivo)
  })
  it('🔴 la llamada ni llegó (el nodo HTTP falló: ítem de error) o la respuesta vino vacía ⇒ PIEZA_PEDIDO_NO_LLEGO', async () => {
    await expect(acepto({ error: { message: 'ECONNRESET' } })).rejects.toThrow(/PIEZA_PEDIDO_NO_LLEGO|PIEZA_PEDIDO_RECHAZADO/)
    await expect(acepto({})).rejects.toThrow(/PIEZA_PEDIDO_NO_LLEGO/)
  })
  it('el nodo es un Code (declara el fallo) y está ANTES de la espera de 3.600 s: ningún camino llega a esperar sin haber sido aceptado', () => {
    const f = construirFlujo()
    const nodo = f.nodes.find((n: { name: string }) => n.name === N.acepto)
    expect(nodo.type).toBe('n8n-nodes-base.code')
    const padres = Object.entries(f.connections as Record<string, any>).filter(([, c]) => c.main.some((s: any[]) => s.some((h) => h.node === N.espera))).map(([k]) => k)
    expect(padres).toEqual([N.acepto])
  })
})

// ── ③ OBLIGATORIO · el flujo verifica que el corredor trae los límites (nada depende de que alguien recuerde el orden de publicación) ───────────────────────────────
describe('③ el corredor trae los límites de «mirar afuera» · si no, se DETIENE antes de gastar', () => {
  const CUATRO = ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador']
  const LIM = { max_pedidos: 4, permitidos: CUATRO }
  const cuerpoArmado = { ...SOBRE, cuerpo: { max_budget_usd: 0.6, mirar_afuera_limites: LIM } }
  const guardaSalud = (salud: unknown) => correrNodo('guardaSalud', { input: [salud], refs: { '⑤ Armar el cuerpo del productor': cuerpoArmado } })
  const acepto = (acuse: unknown) => correrNodo('acepto', { input: [acuse], refs: { '⑤ Armar el cuerpo del productor': cuerpoArmado } })
  const ACUSE = { accepted: true, will_callback: true, dispatch_key: 'dispatch:W:a:1', ack_timestamp: 't' }

  it('el flujo tiene la comprobación previa entre armar el cuerpo y pagar · cadena en serie · orden por el grafo', () => {
    const f = construirFlujo()
    expect(f.connections[N.cuerpo].main[0][0].node).toBe(N.salud)
    expect(f.connections[N.salud].main[0][0].node).toBe(N.guardaSalud)
    expect(f.connections[N.guardaSalud].main[0][0].node).toBe(N.productor)
    const salud = f.nodes.find((n: { name: string }) => n.name === N.salud)
    expect(salud.parameters.method).toBe('GET')
    expect(salud.parameters.url).toMatch(/\/health/)
    expect(salud.alwaysOutputData).toBe(true)
    expect('retryOnFail' in salud).toBe(false)
    expect(lecturasFueraDeOrden(f)).toEqual([])
  })
  it('✅ el corredor dice que trae los límites ⇒ pasa y devuelve el MISMO cuerpo (el productor lo manda tal cual)', async () => {
    const [{ json }] = await guardaSalud({ status: 'ok', uptimeSeconds: 5, capacidades: { mirar_afuera_limites: 1 } })
    expect(json.cuerpo.mirar_afuera_limites).toEqual(LIM)
  })
  it.each([
    ['🔴 un corredor SIN el cambio (el /health de HOY: sin capacidades)', { status: 'ok', uptimeSeconds: 5 }, /PIEZA_CORREDOR_SIN_LIMITES/],
    ['capacidades sin la clave', { status: 'ok', capacidades: {} }, /PIEZA_CORREDOR_SIN_LIMITES/],
    ['capacidad en 0', { capacidades: { mirar_afuera_limites: 0 } }, /PIEZA_CORREDOR_SIN_LIMITES/],
    ['capacidades que no es un objeto', { capacidades: 'si' }, /PIEZA_CORREDOR_SIN_LIMITES/],
    ['la llamada falló (ítem de error de n8n)', { error: { message: 'ECONNREFUSED' } }, /PIEZA_CORREDOR_NO_RESPONDE/],
    ['respuesta vacía', {}, /PIEZA_CORREDOR_SIN_LIMITES/],
  ])('%s ⇒ se DETIENE ANTES de gastar', async (_n, salud, motivo) => {
    await expect(guardaSalud(salud)).rejects.toThrow(motivo)
  })

  it('✅ el acuse hace ECO de los límites mandados ⇒ confirmado', async () => {
    const [{ json }] = await acepto({ ...ACUSE, mirar_afuera_limites: LIM })
    expect(json).toMatchObject({ pedido_aceptado: true, limites_confirmados: true })
    // el mismo conjunto en otro orden también vale
    expect((await acepto({ ...ACUSE, mirar_afuera_limites: { max_pedidos: 4, permitidos: [...CUATRO].reverse() } }))[0].json.limites_confirmados).toBe(true)
  })
  it.each([
    ['🔴 SIN eco (Vercel viejo / el camino perdió el campo)', ACUSE],
    ['eco vacío', { ...ACUSE, mirar_afuera_limites: {} }],
    ['eco con OTRO máximo', { ...ACUSE, mirar_afuera_limites: { max_pedidos: 20, permitidos: CUATRO } }],
    ['eco con OTRAS opciones (incluye un anuncio de pago)', { ...ACUSE, mirar_afuera_limites: { max_pedidos: 4, permitidos: [...CUATRO, 'anuncios_en_meta'] } }],
    ['eco con MENOS opciones', { ...ACUSE, mirar_afuera_limites: { max_pedidos: 4, permitidos: ['instagram'] } }],
    ['eco sin la lista', { ...ACUSE, mirar_afuera_limites: { max_pedidos: 4 } }],
    ['eco que no es objeto', { ...ACUSE, mirar_afuera_limites: 'ok' }],
  ])('%s ⇒ PIEZA_LIMITES_NO_ACEPTADOS · se DETIENE', async (_n, acuse) => {
    await expect(acepto(acuse)).rejects.toThrow(/PIEZA_LIMITES_NO_ACEPTADOS/)
  })
  it('CONTROL POSITIVO: un cuerpo SIN límites (no es el caso de la pieza) no exige eco · y el aceptado/rechazado de siempre sigue igual', async () => {
    const sinLimites = (acuse: unknown) => correrNodo('acepto', { input: [acuse], refs: { '⑤ Armar el cuerpo del productor': { ...SOBRE, cuerpo: { max_budget_usd: 0.6 } } } })
    expect((await sinLimites(ACUSE))[0].json).toMatchObject({ pedido_aceptado: true, limites_confirmados: false })
    await expect(sinLimites({ error: 'images_invalid', code: 'E-IMAGES-INVALID' })).rejects.toThrow(/PIEZA_PEDIDO_RECHAZADO/)
  })
  it('el cuerpo REAL que arma el flujo lleva los límites (si no los llevara, el eco no se exigiría)', async () => {
    const [{ json }] = await correrNodo('cuerpo', { input: [{ id: CID, name: 'Mi Negocio', config: { apify: { own_handles: { instagram: ['minegocio'] } } } }], refs: { '④ ¿Ya hay pieza de este brief? · guarda': { ...SOBRE, brief: {}, brief_texto: 'x', fotos: [] } } })
    expect(json.cuerpo.mirar_afuera_limites).toEqual({ max_pedidos: 4, permitidos: ['instagram', 'ficha_en_mapas', 'que_dice_el_buscador'] })
  })
})
