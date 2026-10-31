/**
 * T5 · paso 6 · el VALIDADOR DE FORMA del plan en la PLANEACIÓN (`X9F0zp6LQ2xGEYVS`) · US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de los nodos nuevos y la RUTA REAL `POST /api/planeacion/validar-plan` de CC1 (solo la llave interna es un doble).
 * Lo que fija: sin `validar_forma` el plan va directo a «Guardar el plan» (el flujo de hoy); con él, un plan con forma pasa INTACTO; uno sin forma vuelve UNA vez al redactor
 * con la corrección pegada y `force_restart` (si no, el corredor devuelve la respuesta vieja); la 2.ª vez sin forma → alerta + `necesita_humano` y NO se guarda;
 * una validación que no se pudo leer DETIENE (nunca se lee como «el plan está bien»); un valor raro de `validar_forma` se rechaza antes de gastar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { recorrer, type Http } from './_emulador-n8n'

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'llave-interna' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }),
}))
import { POST as rutaValidar } from '@/app/api/planeacion/validar-plan/route'
import { almacenDeSupabase } from '@/lib/cadena/almacen-supabase'

// base falsa: una sola tabla en memoria que respeta los .eq/.order/.limit con los que `resolverPlan` la lee
const FILAS: Record<string, any>[] = []
const consulta = (): any => {
  const filtros: Array<[string, unknown]> = []
  let tope = 1000
  const q: any = {
    select: () => q, eq: (c: string, v: unknown) => { filtros.push([c, v]); return q },
    order: () => q, limit: (n: number) => { tope = n; return q },
    then: (ok: (r: any) => unknown) => ok({ data: FILAS.filter((f) => filtros.every(([c, v]) => f[c] === v)).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, tope), error: null }),
  }
  return q
}
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => ({ from: () => consulta() }) }))

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (carpeta: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = leer('nuevo')
const PLAN_BUENO = fs.readFileSync(path.join(__dirname, 'fixtures', 'ronda78', 'plan-v2-811b9e94.md'), 'utf8')
const PLAN_ROTO = PLAN_BUENO.replace(/\|\s*\d+\s*\|[^\n]*\n/g, '').slice(0, 1200) // sin calendario fechado y corto
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala', SLACK_WEBHOOK_URL: 'https://slack.test/hook', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k-db' }
const WEBHOOK = (body: Record<string, unknown>) => ({ 'Webhook · planeacion': [{ headers: { 'x-sala-dispatch-key': 'k-sala' }, body }] })
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })
const BASE = { pedido: 'PEDIDO ORIGINAL', cliente_id: CLIENTE, redactor_elegido: 'campaign-brief-agent' }
const planItem = (texto: string) => ({ llego_la_vuelta: true, texto, caracteres: texto.length, client_id: CLIENTE, client_name: 'Cafetería Prueba' })

const rutaEnMemoria = (visto: { llamadas: number; cuerpo?: any; borrador?: any; guardadoFalla?: boolean } = { llamadas: 0 }): Http => async (url, headers, cuerpo) => {
  if (url === 'https://slack.test/hook') { visto.cuerpo = cuerpo; return { statusCode: 200, body: 'ok' } }
  if (url === 'https://db.test/rest/v1/client_historical_outputs') { visto.borrador = cuerpo; return { statusCode: visto.guardadoFalla ? 500 : 201, body: visto.guardadoFalla ? {} : [{ id: 'abcd1234-0000' }] } }
  expect(url).toBe('https://api.test/api/planeacion/validar-plan')
  visto.llamadas++
  const r = await rutaValidar(new Request(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))
  return { statusCode: r.status, body: await r.json() }
}
const desdeValidar = (texto: string, body: Record<string, unknown>, o: { http?: Http; previos?: Record<string, any[]>; hasta?: string[] } = {}) =>
  recorrer(nuevo, 'Validar · ¿se pide?', planItem(texto), {
    env: ENV, http: o.http ?? rutaEnMemoria(), hasta: o.hasta ?? ['Guardar el plan', 'Pedir el plan al redactor'],
    previos: { ...WEBHOOK(body), '¿Llegó la vuelta?': [planItem(texto)], 'Redactor · elegir': [BASE], ...(o.previos ?? {}) },
  })

describe('el flujo nuevo se parece al vivo en lo demás', () => {
  it('«¿Hay plan?» ahora entra por «Validar · ¿se pide?» y no por «Guardar el plan»; el resto de su salida no cambia', () => {
    expect(vivo.connections['¿Hay plan?'].main[0].map((c: any) => c.node)).toEqual(['Guardar el plan'])
    expect(nuevo.connections['¿Hay plan?'].main[0].map((c: any) => c.node)).toEqual(['Validar · ¿se pide?'])
    expect(nuevo.connections['¿Hay plan?'].main[1]).toEqual(vivo.connections['¿Hay plan?'].main[1])
  })
  it('apagado, el único camino por los nodos nuevos termina en «Guardar el plan»; encendido, hay 3 salidas (guarda · reintenta · alerta)', () => {
    expect(nuevo.connections['Validar · ¿se pide?'].main.map((g: any[]) => g.map((c) => c.node))).toEqual([['Validar · pedir'], ['Guardar el plan']])
    expect(nuevo.connections['Validar · ¿pasó?'].main.map((g: any[]) => g.map((c) => c.node))).toEqual([['Guardar el plan'], ['Validar · ¿reintenta?']])
    expect(nuevo.connections['Validar · ¿reintenta?'].main.map((g: any[]) => g.map((c) => c.node))).toEqual([['Pedir el plan al redactor'], ['Validar · guardar borrador']])
    expect(nuevo.connections['Validar · resumen']).toBeUndefined()
  })
})

describe('«⓪ Llave» · validar_forma', () => {
  const llave = (body: Record<string, unknown>) => recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web(body), { env: ENV, hasta: ['V9 · ¿pide el pre-vuelo?'] })
  it('true, false, null o ausente pasan; cualquier otro valor DETIENE antes de gastar', async () => {
    for (const v of [true, false, null, undefined]) expect((await llave({ client_id: CLIENTE, validar_forma: v })).ultimo).toBe('V9 · ¿pide el pre-vuelo?')
    for (const raro of ['true', 'si', 1, 0, [], {}]) await expect(llave({ client_id: CLIENTE, validar_forma: raro })).rejects.toThrow(/PLANEACION_VALIDAR_FORMA_INVALIDO/)
  })
})

describe('apagado es el flujo de hoy', () => {
  it('sin validar_forma (o false, o un disparo que no es webhook) el plan va DIRECTO a «Guardar el plan» y no se llama al validador', async () => {
    for (const body of [{ client_id: CLIENTE }, { client_id: CLIENTE, validar_forma: false }]) {
      const visto = { llamadas: 0 }
      const r = await desdeValidar(PLAN_ROTO, body, { http: rutaEnMemoria(visto) })
      expect(r.pasos).toEqual(['Validar · ¿se pide?', 'Guardar el plan'])
      expect(visto.llamadas).toBe(0)
    }
    const r = await desdeValidar(PLAN_ROTO, {}, { previos: { 'Webhook · planeacion': [] } })
    expect(r.ultimo).toBe('Guardar el plan')
  })
})

describe('encendido · contra la ruta real', () => {
  it('un plan con forma (el real de Náufrago) pasa INTACTO a «Guardar el plan» con la firma de la corrida', async () => {
    const visto: any = { llamadas: 0 }
    const r = await desdeValidar(PLAN_BUENO, { client_id: CLIENTE, validar_forma: true }, { http: rutaEnMemoria(visto) })
    expect(r.pasos).toEqual(['Validar · ¿se pide?', 'Validar · pedir', 'Validar · ¿qué dijo?', 'Validar · ¿pasó?', 'Guardar el plan'])
    expect(visto.llamadas).toBe(1)
    expect(r.item).toMatchObject({ ...planItem(PLAN_BUENO), veredicto: 'ok', validacion_forma: { ok: true, intentos: 1 } })
  })
  it('🔴 la 1.ª vez sin forma: vuelve al redactor UNA vez con la corrección pegada AL FINAL del pedido original', async () => {
    const r = await desdeValidar(PLAN_ROTO, { client_id: CLIENTE, validar_forma: true })
    expect(r.ultimo).toBe('Pedir el plan al redactor')
    expect(r.item).toMatchObject({ veredicto: 'reintentar', reintento_forma: true, redactor_elegido: 'campaign-brief-agent', cliente_id: CLIENTE })
    expect(r.item.pedido.startsWith('PEDIDO ORIGINAL\n\n')).toBe(true)
    expect(r.item.pedido).toContain('# CORRECCIÓN DE FORMA (única)')
    expect(r.item.hallazgos.length).toBeGreaterThan(0)
  })
  it('🔴 el reintento FUERZA el reinicio aunque el disparo no lo pidiera (si no, el corredor devuelve la respuesta vieja); el primer pedido sigue idéntico al de hoy', async () => {
    const cuerpoDe = async (flujo: any, item: any, body: Record<string, unknown>) => {
      let visto: any = null
      const http: Http = async (_u, _h, c) => { visto = c; return { statusCode: 200, body: {} } }
      await recorrer(flujo, 'Pedir el plan al redactor', item, { env: ENV, http, previos: WEBHOOK(body), hasta: ['Esperar al redactor'] })
      return visto
    }
    for (const fr of [false, true, undefined]) {
      const body = { client_id: CLIENTE, ...(fr === undefined ? {} : { force_restart: fr }) }
      expect(await cuerpoDe(nuevo, BASE, body)).toEqual(await cuerpoDe(vivo, BASE, body))
    }
    const reintento = await cuerpoDe(nuevo, { ...BASE, pedido: 'P2', reintento_forma: true }, { client_id: CLIENTE, force_restart: false })
    expect(reintento).toMatchObject({ force_restart: true, task: 'P2', agent: 'campaign-brief-agent', client_id: CLIENTE })
  })
  it('🔴 la 2.ª vez sin forma: queda guardada como BORRADOR MARCADO (no se pierde) y NO sigue · alerta a Slack con lo que falta · necesita_humano', async () => {
    const visto: any = { llamadas: 0 }
    const r = await desdeValidar(PLAN_ROTO, { client_id: CLIENTE, validar_forma: true }, { http: rutaEnMemoria(visto), previos: { 'Validar · ¿qué dijo?': [{ veredicto: 'reintentar' }] }, hasta: ['Guardar el plan', 'Pedir el plan al redactor', 'JEF · armar'] })
    expect(r.pasos).toEqual(['Validar · ¿se pide?', 'Validar · pedir', 'Validar · ¿qué dijo?', 'Validar · ¿pasó?', 'Validar · ¿reintenta?', 'Validar · guardar borrador', 'Validar · armar la alerta', 'Validar · alerta', 'Validar · resumen'])
    expect(r.item).toMatchObject({ parado_en: 'validar_forma', necesita_humano: true, plan_guardado_id: 'abcd1234-0000' })
    // el borrador lleva el plan ENTERO y la marca; no es un plan normal
    expect(visto.borrador).toMatchObject({ client_id: CLIENTE, output_type: 'campaign_plan_90d_borrador', status: 'draft', content: PLAN_ROTO, content_text: PLAN_ROTO, producing_agent: 'campaign-brief-agent' })
    expect(visto.borrador.provenance_tag).toMatchObject({ forma_invalida: true, necesita_humano: true, estado_del_plan: 'forma_invalida', caracteres: PLAN_ROTO.length })
    expect(visto.borrador.provenance_tag.hallazgos.length).toBeGreaterThan(0)
    expect(r.item.hallazgos.length).toBeGreaterThan(0)
    expect(visto.cuerpo.text).toMatch(/Plan sin forma/)
    expect(visto.cuerpo.text).toMatch(/necesita_humano/)
    expect(visto.cuerpo.text).toContain('Cafetería Prueba')
    expect(visto.cuerpo.text).toMatch(/BORRADOR MARCADO/)
    expect(visto.cuerpo.text).toContain('abcd1234')
  })
  it('🔴 si el borrador NO se pudo guardar, la alerta lo dice y manda a copiar el texto de la corrida (no finge que se guardó)', async () => {
    const visto: any = { llamadas: 0, guardadoFalla: true }
    const r = await desdeValidar(PLAN_ROTO, { client_id: CLIENTE, validar_forma: true }, { http: rutaEnMemoria(visto), previos: { 'Validar · ¿qué dijo?': [{ veredicto: 'reintentar' }] } })
    expect(r.item).toMatchObject({ necesita_humano: true, plan_guardado_id: null })
    expect(visto.cuerpo.text).toContain('NO se pudo guardar (500)')
    expect(visto.cuerpo.text).not.toMatch(/BORRADOR MARCADO/)
  })
  it('🔴 una validación que no se pudo leer DETIENE: 401 (llave mala), 500, cuerpo raro, error de red, o «sin forma» sin corrección', async () => {
    await expect(desdeValidar(PLAN_BUENO, { validar_forma: true }, { http: async () => ({ statusCode: 401, body: { ok: false, error: 'Invalid x-api-key' } }) })).rejects.toThrow(/PLAN_VALIDADOR_NO_LEGIBLE.*401/)
    await expect(desdeValidar(PLAN_BUENO, { validar_forma: true }, { http: async () => ({ statusCode: 500, body: '<html>' }) })).rejects.toThrow(/PLAN_VALIDADOR_NO_LEGIBLE/)
    await expect(desdeValidar(PLAN_BUENO, { validar_forma: true }, { http: async () => ({ statusCode: 200, body: { hola: 1 } }) })).rejects.toThrow(/PLAN_VALIDADOR_NO_LEGIBLE/)
    await expect(desdeValidar(PLAN_BUENO, { validar_forma: true }, { http: async () => ({ statusCode: 200, body: { ok: false, hallazgos: [{ que: 'x', donde: 'y' }], correccion: null } }) })).rejects.toThrow(/no trajo la corrección/)
    await expect(recorrer(nuevo, 'Validar · ¿qué dijo?', { error: { message: 'ECONNRESET' } }, { env: ENV, previos: { '¿Llegó la vuelta?': [planItem(PLAN_BUENO)], 'Redactor · elegir': [BASE] } })).rejects.toThrow(/PLAN_VALIDADOR_NO_LEGIBLE.*ECONNRESET/)
  })
  it('la llamada al validador lleva el plan, la firma de la corrida y la llave interna', async () => {
    let visto: any = null
    const http: Http = async (_u, h, c) => { visto = { h, c }; return { statusCode: 200, body: { ok: true, hallazgos: [], correccion: null } } }
    await desdeValidar(PLAN_BUENO, { client_id: CLIENTE, validar_forma: true }, { http })
    expect(visto.h['x-api-key']).toBe('llave-interna')
    expect(visto.c).toEqual({ texto: PLAN_BUENO, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' })
  })
})

describe('🔴 el borrador marcado NO es un plan para nadie que lea planes', () => {
  it('queda con otro output_type y con la marca prueba_* · la cadena (resolverPlan) devuelve el plan BUENO aunque el borrador sea más reciente', async () => {
    const visto: any = { llamadas: 0 }
    await desdeValidar(PLAN_ROTO, { client_id: CLIENTE, validar_forma: true }, { http: rutaEnMemoria(visto), previos: { 'Validar · ¿qué dijo?': [{ veredicto: 'reintentar' }] } })
    const b = visto.borrador
    expect(b.output_type).toBe('campaign_plan_90d_borrador')
    expect(b.provenance_tag).toMatchObject({ forma_invalida: true, prueba_forma_invalida: true })
    // el mismo predicado que usan el cerebro (clave `prueba_*` === true) y el diario (cualquier clave que empiece por «prueba»)
    expect(Object.entries(b.provenance_tag).some(([k, v]) => k.startsWith('prueba_') && v === true)).toBe(true)
    FILAS.length = 0
    FILAS.push({ id: 'plan-bueno', client_id: CLIENTE, output_type: 'campaign_plan_90d', created_at: '2026-10-30T10:00:00Z' })
    FILAS.push({ id: 'borrador', ...b, created_at: '2026-10-31T10:00:00Z' })
    expect(await almacenDeSupabase().resolverPlan(CLIENTE, undefined)).toEqual({ plan_id: 'plan-bueno', fecha: '2026-10-30' })
    // y si no hay plan bueno, NO inventa uno con el borrador
    FILAS.splice(0, 1)
    expect(await almacenDeSupabase().resolverPlan(CLIENTE, undefined)).toBeNull()
    // el plan que SÍ se guarda sigue con su tipo de siempre
    expect(JSON.stringify(nuevo.nodes.find((n: any) => n.name === 'Guardar el plan').parameters)).toContain("output_type: 'campaign_plan_90d'")
  })
})

describe('el slack del aviso es el mismo canal que el aviso de «plan sin PDF»', () => {
  it('«Validar · alerta» es hermano de «Campana · plan sin PDF»', () => {
    const a = nuevo.nodes.find((n: any) => n.name === 'Campana · plan sin PDF'), b = nuevo.nodes.find((n: any) => n.name === 'Validar · alerta')
    expect(b.parameters).toEqual(a.parameters)
    expect(b.onError).toBe(a.onError)
  })
})
