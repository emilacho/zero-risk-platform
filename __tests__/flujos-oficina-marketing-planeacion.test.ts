/**
 * T5 · paso 4 · la PLANEACIÓN (`X9F0zp6LQ2xGEYVS`) con `parar_en` y el redactor del plan como dato · US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de los nodos nuevos y cambiados del flujo (`scripts/ops/oficina-marketing/nuevo/X9F0zp6LQ2xGEYVS.json`); la tabla `cadena_config` es una lista en memoria.
 * Lo que fija: ausente `parar_en` y sin fila de configuración, el flujo es el de hoy (el pedido al redactor sale IDÉNTICO al del vivo); con la fila, el redactor y la indicación salen del dato en los CUATRO nodos;
 * un valor raro de `parar_en`, un slug mal formado o una lectura que falla DETIENEN antes de gastar; `parar_en = guardar_plan` corta justo después de guardar el plan.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer, type Http } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (carpeta: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = leer('nuevo')
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k-db' }
const web = (body: Record<string, unknown>, llave = 'k-sala') => ({ headers: { 'x-sala-dispatch-key': llave }, body })
const WEBHOOK = (body: Record<string, unknown>) => ({ 'Webhook · planeacion': [web(body)] })
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor

describe('el flujo nuevo se parece al vivo en todo menos en lo que debe cambiar', () => {
  it('cambia 5 nodos (la llave y los 4 con el redactor pegado) y suma 4; solo se mueven 2 conexiones', () => {
    const v = new Map(vivo.nodes.map((n: any) => [n.name, n]))
    const cambiados = nuevo.nodes.filter((n: any) => v.has(n.name) && JSON.stringify(v.get(n.name)) !== JSON.stringify(n)).map((n: any) => n.name).sort()
    expect(cambiados).toEqual(['JEF · plan · armar B', 'JEF · plan · armar C', 'Guardar el plan', 'Pedir el plan al redactor', '⓪ Llave · Webhook · planeacion'].sort())
    expect(nuevo.nodes.filter((n: any) => !v.has(n.name)).map((n: any) => n.name).sort()).toEqual(['Parar · resumen', 'Parar · ¿corta aquí?', 'Redactor · elegir', 'Redactor · leer la elección'].sort())
    const movidas = Object.keys(vivo.connections).filter((k) => JSON.stringify(nuevo.connections[k]) !== JSON.stringify(vivo.connections[k])).sort()
    expect(movidas).toEqual(['Guardar el plan', 'Redactor (B4)'])
    expect(new Set(nuevo.nodes.map((n: any) => n.id)).size).toBe(nuevo.nodes.length)
    // el nombre del redactor ya no está pegado en ningún nodo del flujo nuevo, salvo como valor por omisión del nodo que lo elige
    const pegados = nuevo.nodes.filter((n: any) => JSON.stringify(n.parameters).includes('campaign-brief-agent')).map((n: any) => n.name)
    expect(pegados).toEqual(['Redactor · elegir'])
  })
  it('es determinista y no lleva llaves pegadas', async () => {
    const { construirPlaneacion } = await import('../scripts/ops/oficina-marketing/construir-planeacion.mjs')
    expect(JSON.stringify(construirPlaneacion())).toBe(JSON.stringify(nuevo))
    expect(JSON.stringify(nuevo)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|xox[abp]-/)
  })
})

describe('parar_en · «⓪ Llave»', () => {
  const llave = (body: Record<string, unknown>, flujo = nuevo) => recorrer(flujo, '⓪ Llave · Webhook · planeacion', web(body), { env: ENV, hasta: ['V9 · ¿pide el pre-vuelo?'] })
  it('ausente o null: pasa y devuelve lo mismo que el vivo', async () => {
    for (const b of [{ client_id: CLIENTE }, { client_id: CLIENTE, parar_en: null }]) {
      const a = await llave(b, vivo), c = await llave(b)
      expect(c.item).toEqual(a.item)
    }
  })
  it('«guardar_plan» pasa; cualquier otro valor DETIENE antes de gastar', async () => {
    expect((await llave({ client_id: CLIENTE, parar_en: 'guardar_plan' })).ultimo).toBe('V9 · ¿pide el pre-vuelo?')
    for (const raro of ['jefatura', '', 0, true, ['guardar_plan'], 'GUARDAR_PLAN']) await expect(llave({ client_id: CLIENTE, parar_en: raro })).rejects.toThrow(/PLANEACION_PARAR_EN_INVALIDO/)
  })
  it('la llave de despacho sigue mandando: sin ella o equivocada, se DETIENE como hoy', async () => {
    await expect(recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web({ parar_en: 'guardar_plan' }, 'otra'), { env: ENV })).rejects.toThrow(/FLUJO_PROCEDENCIA_INVALIDA/)
    await expect(recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web({}), { env: { SALA_DISPATCH_KEY: '' } })).rejects.toThrow(/FLUJO_CERRADO/)
  })
})

describe('parar_en · la compuerta después de «Guardar el plan»', () => {
  const guardado = { statusCode: 201, body: [{ id: 'plan-1' }] }
  it('con «guardar_plan» la corrida termina en «Parar · resumen» y NO llega a la jefatura', async () => {
    const r = await recorrer(nuevo, 'Parar · ¿corta aquí?', guardado, { previos: WEBHOOK({ parar_en: 'guardar_plan' }), hasta: ['JEF · armar'] })
    expect(r.pasos).toEqual(['Parar · ¿corta aquí?', 'Parar · resumen'])
    expect(r.item).toEqual({ parado_en: 'guardar_plan', plan_guardado_id: 'plan-1', redactor: null })
  })
  it('sin parar_en (o en un disparo que no es webhook) sigue a «JEF · armar» como hoy', async () => {
    for (const p of [WEBHOOK({ client_id: CLIENTE }), {}]) {
      const r = await recorrer(nuevo, 'Parar · ¿corta aquí?', guardado, { previos: p, hasta: ['JEF · armar'] })
      expect(r.pasos).toEqual(['Parar · ¿corta aquí?', 'JEF · armar'])
    }
  })
})

describe('el redactor del plan es un dato', () => {
  const B4 = { pedido: 'PEDIDO ORIGINAL', cliente_id: CLIENTE, otro: 1 }
  const config = (res: { statusCode: number; body: any } | Error): Http => async (url) => {
    expect(url).toBe('https://db.test/rest/v1/cadena_config?clave=eq.planeacion&select=valor')
    if (res instanceof Error) throw res
    return res
  }
  const elegir = (res: { statusCode: number; body: any } | Error) =>
    recorrer(nuevo, 'Redactor · leer la elección', B4, { env: ENV, http: config(res), previos: { 'Redactor (B4)': [B4] }, hasta: ['Pedir el plan al redactor'] })

  it('sin fila (o fila vacía): el agente de hoy y el pedido SIN tocar', async () => {
    for (const cuerpo of [[], [{ valor: {} }], [{ valor: { redactor: null, indicacion: '   ' } }]]) {
      const r = await elegir({ statusCode: 200, body: cuerpo })
      expect(r.item).toMatchObject({ redactor_elegido: 'campaign-brief-agent', indicacion_elegida: null, pedido: 'PEDIDO ORIGINAL', cliente_id: CLIENTE, otro: 1 })
    }
  })
  it('con fila: el redactor y la indicación salen del dato; la indicación va ANTES del pedido', async () => {
    const r = await elegir({ statusCode: 200, body: [{ valor: { redactor: 'jefe-marketing', indicacion: 'Escribe tú el plan completo, no delegues.' } }] })
    expect(r.item).toMatchObject({ redactor_elegido: 'jefe-marketing', indicacion_elegida: 'Escribe tú el plan completo, no delegues.' })
    expect(r.item.pedido).toBe('Escribe tú el plan completo, no delegues.\n\nPEDIDO ORIGINAL')
  })
  it('🔴 slug mal formado, lectura que falla o respuesta no 200: DETIENEN antes de gastar (no se cae al agente viejo)', async () => {
    for (const malo of ['Jefe Marketing', '../x', 'a', 7, {}, 'x'.repeat(80)]) await expect(elegir({ statusCode: 200, body: [{ valor: { redactor: malo } }] })).rejects.toThrow(/PLANEACION_REDACTOR_INVALIDO/)
    await expect(elegir({ statusCode: 500, body: {} })).rejects.toThrow(/PLANEACION_REDACTOR_NO_LEGIBLE/)
    await expect(elegir(new Error('ECONNRESET'))).rejects.toThrow(/ECONNRESET/)
  })
  it('«Pedir el plan al redactor» manda al redactor ELEGIDO; sin elección es idéntico al del vivo', async () => {
    const cuerpoDe = async (flujo: any, item: any) => {
      let visto: any = null
      const http: Http = async (_u, _h, c) => { visto = c; return { statusCode: 200, body: {} } }
      await recorrer(flujo, 'Pedir el plan al redactor', item, { env: ENV, http, previos: WEBHOOK({ dry_run: true, force_restart: true }), hasta: ['Esperar al redactor'] })
      return visto
    }
    const base = { pedido: 'PEDIDO', cliente_id: CLIENTE }
    const hoy = await cuerpoDe(vivo, base)
    expect(await cuerpoDe(nuevo, { ...base, redactor_elegido: 'campaign-brief-agent' })).toEqual(hoy)
    expect((await cuerpoDe(nuevo, { ...base, redactor_elegido: 'jefe-marketing' })).agent).toBe('jefe-marketing')
    expect(hoy).toMatchObject({ agent: 'campaign-brief-agent', task: 'PEDIDO', client_id: CLIENTE, dry_run: true, force_restart: true, callback_mode: 'runner' })
  })
  it('«Guardar el plan» rotula la fila con el redactor REAL y el resto del cuerpo no cambia', async () => {
    const cuerpoDe = async (flujo: any, previos: any) => {
      let visto: any = null
      const http: Http = async (_u, _h, c) => { visto = c; return { statusCode: 201, body: [{ id: 'p' }] } }
      await recorrer(flujo, 'Guardar el plan', { client_id: CLIENTE, texto: 'EL PLAN', caracteres: 7 }, { env: ENV, http, previos, hasta: ['Parar · ¿corta aquí?', 'JEF · armar'] })
      return visto
    }
    const a = await cuerpoDe(vivo, {})
    const b = await cuerpoDe(nuevo, { 'Redactor · elegir': [{ redactor_elegido: 'campaign-brief-agent' }] })
    expect(b).toEqual(a)
    const c = await cuerpoDe(nuevo, { 'Redactor · elegir': [{ redactor_elegido: 'jefe-marketing' }] })
    expect(c.producing_agent).toBe('jefe-marketing')
    expect(c.content).toBe('EL PLAN')
  })
  it('los nodos «JEF · plan · armar B» y «C» leen el redactor del dato (y compilan)', () => {
    for (const k of ['JEF · plan · armar B', 'JEF · plan · armar C']) {
      const c = nuevo.nodes.find((n: any) => n.name === k).parameters.jsCode
      expect(c).toContain("producing_agent: $('Redactor · elegir').last().json.redactor_elegido")
      expect(() => new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', c)).not.toThrow()
    }
  })
})
