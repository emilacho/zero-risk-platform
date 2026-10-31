/**
 * T5 · paso 1 · la PUERTA de la cadena y el sub-flujo del calendario con el nuevo orden · US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de los nodos del flujo nuevo (`scripts/ops/oficina-marketing/nuevo/*.json`, el que se publicará en T9) recorriendo su grafo, y cada llamada HTTP del flujo
 * llega a la RUTA REAL de la otra pieza: `/api/cadena/{brief|concepto|calendario}` (acciones de T3 sobre el almacén en memoria) y `/api/oficina/encargos` (sobre validado y mesa abierta por el código de T2).
 * Lo que fija: sin la palanca el camino es el de hoy (el nodo no cambia); con ella, el flujo hace el PRÓXIMO paso que falta (brief → concepto), nunca dos veces, y no hace nada si la mesa trabaja o si espera a Emilio.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'
import { ACCIONES } from '../src/lib/cadena/acciones'
import type { Campana, EstrategiaGuardada } from '../src/lib/cadena/almacen'
import { avanzar } from '../src/lib/oficina/orquestador'
import { abrirMesaDeLaCadena, validarSobreDeLaCadena } from '../src/lib/oficina/mesa/de-la-cadena'
import { BRIEF_MESA, CONCEPTO_MESA } from '../src/lib/oficina/plantillas/mesa'
import { crearMemoria } from '../src/lib/oficina/__tests__/memoria'
import { crearMesaEnMemoria } from '../src/lib/oficina/__tests__/mesa-memoria'
import type { Tarjeta } from '../src/lib/oficina/mesa/tipos'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (carpeta: 'vivo' | 'nuevo', id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, `${id}.json`), 'utf8'))
const PUERTA = 'pBAp5Cx7R39U585i'
const CALENDARIO = 'cR22ztH1p2ihTIwD'

// ───────────────────────── un emulador mínimo del motor de n8n: nodos Code, If y HTTP; expresiones {{ … }}
type Item = Record<string, any>
interface Salida { nodo: string; json: Item }
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor as new (...a: string[]) => (...a: any[]) => Promise<any>

function entorno(env: Record<string, string>, historial: Record<string, Item[]>, entrada: Item) {
  const dolar = (n: string) => ({ last: () => ({ json: (historial[n] ?? [])[(historial[n] ?? []).length - 1] ?? {} }), first: () => ({ json: (historial[n] ?? [])[0] ?? {} }), all: () => (historial[n] ?? []).map((json) => ({ json })) })
  return { $: dolar, $input: { first: () => ({ json: entrada }), all: () => [{ json: entrada }] }, $env: env, $workflow: { id: 'wf-puerta' }, $execution: { id: 'ex-1' }, $json: entrada }
}
const expr = (s: unknown, ctx: ReturnType<typeof entorno>): any => {
  if (typeof s !== 'string' || !s.startsWith('={{')) return s
  const cuerpo = s.slice(3, s.lastIndexOf('}}')).trim()
  return new Function('$json', '$env', '$', `return (${cuerpo})`)(ctx.$json, ctx.$env, ctx.$)
}

type Http = (url: string, headers: Record<string, string>, cuerpo: any) => Promise<{ statusCode: number; body: any }>

async function recorrer(flujo: any, desde: string, entrada: Item, o: { env?: Record<string, string>; http?: Http; previos?: Record<string, Item[]>; hasta?: string[] } = {}) {
  const env = { ZERO_RISK_API_URL: 'https://api.test', INTERNAL_API_KEY: 'llave-interna', SALA_DISPATCH_KEY: 'llave-sala', ...(o.env ?? {}) }
  const historial: Record<string, Item[]> = { ...(o.previos ?? {}) }
  const pasos: string[] = []
  let nombre: string | null = desde
  let item = entrada
  for (let i = 0; i < 60 && nombre; i++) {
    const n = flujo.nodes.find((x: any) => x.name === nombre)
    if (!n) throw new Error(`no existe el nodo «${nombre}»`)
    if (o.hasta?.includes(nombre)) { pasos.push(nombre); return { pasos, item, ultimo: nombre, historial } }
    const ctx = entorno(env, historial, item)
    let salida = 0
    if (n.type.endsWith('.code')) {
      const f = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', n.parameters.jsCode)
      const r = await f(ctx.$input, ctx.$, ctx.$env, ctx.$workflow, ctx.$execution)
      item = r[0].json
    } else if (n.type.endsWith('.if')) {
      const c = n.parameters.conditions.conditions[0]
      const izq = expr(c.leftValue, ctx)
      salida = String(izq) === String(c.rightValue) ? 0 : 1
    } else if (n.type.endsWith('.httpRequest')) {
      if (!o.http) throw new Error('el recorrido llegó a un nodo HTTP sin simulador')
      const url = expr(n.parameters.url, ctx)
      const headers = Object.fromEntries((n.parameters.headerParameters?.parameters ?? []).map((p: any) => [p.name, expr(p.value, ctx)]))
      const cuerpo = JSON.parse(expr(n.parameters.jsonBody, ctx))
      const r = await o.http(url, headers, cuerpo)
      item = { statusCode: r.statusCode, body: r.body }
    } else throw new Error(`tipo de nodo sin emulador: ${n.type}`)
    historial[nombre] = [...(historial[nombre] ?? []), item]
    pasos.push(nombre)
    const sig: any[] | undefined = flujo.connections[nombre]?.main?.[salida]
    nombre = sig?.[0]?.node ?? null
  }
  return { pasos, item, ultimo: pasos[pasos.length - 1], historial }
}

// ───────────────────────── las dos piezas REALES: la cadena (T3) y la oficina (T2)
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
const AHORA = '2026-10-09T12:00:00Z'
const A = { ...clienteA(), clientId: CLIENTE }

function cadena(o: { palanca?: boolean } = {}) {
  const al = new AlmacenMemoria({
    contextos: { [CLIENTE]: contextoDe(A) },
    planes: { [CLIENTE]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-puerta'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [CLIENTE], nuevo_orden: { clientes: o.palanca === false ? [] : [CLIENTE] } },
    journeys: [{ journeyId: 'journey-1', clientId: CLIENTE }],
  })
  const campana: Campana = {
    id: CAMPANA, client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMPANA, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  return al
}

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['x'], necesita: ['x'], entrega: ['x'], pertinente_en, activo: true, version: 1 })
const DIRECTORIO = [tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']), tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']), tarjeta('content-creator', 'miembro', ['concepto']), tarjeta('portero', 'portero', [])]

function oficina(o: { apagada?: boolean } = {}) {
  const M = crearMemoria({ plantilla: BRIEF_MESA, config: { familias_activas: o.apagada ? [] : ['brief_mesa', 'concepto_mesa'] } })
  M.P.mesa = crearMesaEnMemoria(DIRECTORIO)
  return M
}

/** los dos extremos reales, con un registro de lo que recibieron */
function mundo(o: { palanca?: boolean; oficinaApagada?: boolean } = {}) {
  const al = cadena({ palanca: o.palanca })
  const M = oficina({ apagada: o.oficinaApagada })
  const llamadas: Array<{ ruta: string; cuerpo: any }> = []
  const http: Http = async (url, headers, cuerpo) => {
    const ruta = url.replace('https://api.test', '')
    llamadas.push({ ruta, cuerpo })
    if (ruta.startsWith('/api/cadena/')) {
      if (headers['x-api-key'] !== 'llave-interna') return { statusCode: 401, body: { error: 'llave' } }
      const grupo = ruta.split('/')[3] as 'brief' | 'concepto' | 'calendario'
      const r = await (ACCIONES as any)[grupo][cuerpo.accion](al, cuerpo, AHORA)
      return { statusCode: r.status, body: r.cuerpo }
    }
    if (ruta === '/api/oficina/encargos') {
      if (headers['x-sala-dispatch-key'] !== 'llave-sala') return { statusCode: 401, body: { error: 'llave' } }
      if (o.oficinaApagada) return { statusCode: 409, body: { error: 'oficina_no_abre', motivo: 'familia no activa' } }
      expect(cuerpo.origen).toBe('cadena')
      expect(cuerpo.despertar).toBe(true)
      const v = validarSobreDeLaCadena(cuerpo)
      if (!v.ok) return { statusCode: 400, body: { error: 'entrada_invalida', errores: v.errores } }
      const r = await abrirMesaDeLaCadena(M.P, v.sobre, avanzar)
      return { statusCode: r.status, body: { ...r.cuerpo, despertado: true } }
    }
    throw new Error(`ruta no simulada: ${ruta}`)
  }
  return { al, M, http, llamadas }
}

const S = { client_id: CLIENTE, tenant_id: CLIENTE, _journey_id: 'journey-1', _sala_correlation_id: 'corr-1', campana_id: CAMPANA, dry_run: true, modo: 'abrir', efectivo: 'cadena', sigue: true, simulacros: null }
/** lo que el sub-flujo del calendario le devuelve a la puerta */
const SALIDA = (resultado: string, detalle: any = {}) => ({ paso: 'calendario', campana_id: CAMPANA, tanda: 1, resultado, alerta: null, fichas: [], fechas_pedidas: [], detalle })
const previos = { '2 · ¿Estrategia?': [S], '⓪ Decidir': [S] }

describe('el flujo nuevo se parece al vivo en todo menos en lo que debe cambiar', () => {
  const vivo = leer('vivo', PUERTA), nuevo = leer('nuevo', PUERTA)
  it('conserva los 37 nodos de hoy sin tocar (salvo los dos que reciben el resultado del calendario) y suma 8 que empiezan por «Mesa · »', () => {
    const v = new Map(vivo.nodes.map((n: any) => [n.name, n]))
    const cambiados = nuevo.nodes.filter((n: any) => v.has(n.name) && JSON.stringify(v.get(n.name)) !== JSON.stringify(n)).map((n: any) => n.name).sort()
    expect(cambiados).toEqual(['4 · ¿Calendario?', 'Tanda · ¿resultado?'])
    const nuevos = nuevo.nodes.filter((n: any) => !v.has(n.name)).map((n: any) => n.name)
    expect(nuevos).toHaveLength(8)
    expect(nuevos.every((n: string) => n.startsWith('Mesa · '))).toBe(true)
    expect(nuevo.nodes.length).toBe(vivo.nodes.length + 8)
    expect(new Set(nuevo.nodes.map((n: any) => n.id)).size).toBe(nuevo.nodes.length)
  })
  it('las únicas conexiones que cambian son las dos que entraban a «Cable · armar» desde el calendario', () => {
    for (const k of Object.keys(vivo.connections)) {
      if (k === '4 · ¿Calendario?' || k === 'Tanda · ¿resultado?') continue
      expect(nuevo.connections[k]).toEqual(vivo.connections[k])
    }
    expect(nuevo.connections['4 · ¿Calendario?'].main[0][0].node).toBe('Mesa · ¿espera la gran idea?')
    expect(nuevo.connections['Tanda · ¿resultado?'].main[0][0].node).toBe('Mesa · ¿espera la gran idea?')
  })
  it('es determinista: construir dos veces da el mismo archivo, y no lleva llaves pegadas', async () => {
    const { construirPuerta, construirCalendario } = await import('../scripts/ops/oficina-marketing/construir-puerta.mjs')
    expect(JSON.stringify(construirPuerta())).toBe(JSON.stringify(nuevo))
    expect(JSON.stringify(construirCalendario())).toBe(JSON.stringify(leer('nuevo', CALENDARIO)))
    for (const f of [nuevo, leer('nuevo', CALENDARIO)]) expect(JSON.stringify(f)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|xox[abp]-/)
  })
})

describe('sin la palanca el camino es el de hoy (byte a byte en los nodos que miran el resultado)', () => {
  it('«4 · ¿Calendario?» da lo mismo que el vivo con un resultado ok, ya_hecha o fallido', async () => {
    const vivo = leer('vivo', PUERTA), nuevo = leer('nuevo', PUERTA)
    for (const r of [SALIDA('ok'), SALIDA('ya_hecha'), SALIDA('necesita_humano'), SALIDA('otra_cosa')]) {
      const a = await recorrer(vivo, '4 · ¿Calendario?', r, { previos: { '2 · ¿Estrategia?': [S] }, hasta: ['Cable · armar'] })
      const b = await recorrer(nuevo, '4 · ¿Calendario?', r, { previos: { '2 · ¿Estrategia?': [S] }, hasta: ['Cable · armar'] })
      expect(b.item).toEqual(a.item)
      expect(b.pasos.filter((p) => p.startsWith('Mesa · ')).join()).toBe('Mesa · ¿espera la gran idea?')
    }
  })
  it('«Tanda · ¿resultado?» igual', async () => {
    const vivo = leer('vivo', PUERTA), nuevo = leer('nuevo', PUERTA)
    const p = { '⓪ Decidir': [{ ...S, modo: 'tanda_siguiente', tanda: 2 }] }
    for (const r of [SALIDA('ok'), SALIDA('ya_hecha'), SALIDA('necesita_humano')]) {
      const a = await recorrer(vivo, 'Tanda · ¿resultado?', r, { previos: p, hasta: ['Cable · armar'] })
      const b = await recorrer(nuevo, 'Tanda · ¿resultado?', r, { previos: p, hasta: ['Cable · armar'] })
      expect(b.item).toEqual(a.item)
    }
  })
  it('con la palanca apagada la ruta REAL del calendario nunca contesta «esperar_concepto»', async () => {
    const m = mundo({ palanca: false })
    const r = await m.http('https://api.test/api/cadena/calendario', { 'x-api-key': 'llave-interna' }, { accion: 'preparar', campana_id: CAMPANA, seco: true, tanda: 1, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' })
    expect(r.body.accion).not.toBe('esperar_concepto')
  })
})

describe('el sub-flujo del calendario entiende «esperar_concepto» (contra la ruta REAL)', () => {
  it('con la palanca y sin brief, `preparar` espera y el nodo «① ¿Qué dijo?» lo convierte en un fin declarado con el detalle', async () => {
    const m = mundo()
    const prep = await m.http('https://api.test/api/cadena/calendario', { 'x-api-key': 'llave-interna' }, { accion: 'preparar', campana_id: CAMPANA, seco: true, tanda: 1, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' })
    expect(prep.body).toMatchObject({ accion: 'esperar_concepto', falta: 'brief' })
    const cal = leer('nuevo', CALENDARIO)
    const base = { paso: 'calendario', campana_id: CAMPANA, seco: true, tanda: 1, vuelta: 0 }
    const dijo = await recorrer(cal, '① ¿Qué dijo?', { statusCode: prep.statusCode, body: prep.body }, { previos: { '① Armar el pedido': [{ ...base, pedido: {} }] }, hasta: ['① ¿Termina?'] })
    expect(dijo.item).toMatchObject({ fin: true, resultado: 'esperando_concepto', detalle: { accion: 'esperar_concepto', falta: 'brief' } })
    const salida = await recorrer(cal, '⑤ Salida', dijo.item)
    expect(salida.item).toMatchObject({ resultado: 'esperando_concepto', tanda: 1, detalle: { falta: 'brief' } })
  })
  it('lo demás sigue igual: una respuesta rara sigue FALLANDO ruidoso (no se traga)', async () => {
    const cal = leer('nuevo', CALENDARIO)
    await expect(recorrer(cal, '① ¿Qué dijo?', { statusCode: 200, body: { accion: 'otra' } }, { previos: { '① Armar el pedido': [{ campana_id: CAMPANA, pedido: {} }] } })).rejects.toThrow(/CADENA_PREPARAR_/)
  })
  it('el nodo «① ¿Qué dijo?» solo cambió en esa línea (el resto del sub-flujo es el vivo)', () => {
    const vivo = leer('vivo', CALENDARIO), nuevo = leer('nuevo', CALENDARIO)
    const v = new Map(vivo.nodes.map((n: any) => [n.name, n]))
    const cambiados = nuevo.nodes.filter((n: any) => JSON.stringify(v.get(n.name)) !== JSON.stringify(n)).map((n: any) => n.name)
    expect(cambiados).toEqual(['① ¿Qué dijo?'])
    expect(nuevo.nodes.length).toBe(vivo.nodes.length)
    expect(nuevo.connections).toEqual(vivo.connections)
  })
})

describe('la puerta con el nuevo orden hace el PRÓXIMO paso que falta, contra las rutas REALES', () => {
  const desdeAbrir = (m: ReturnType<typeof mundo>, falta: string, extra: Item = {}) =>
    recorrer(leer('nuevo', PUERTA), '4 · ¿Calendario?', SALIDA('esperando_concepto', { accion: 'esperar_concepto', tanda: 1, falta, ...extra }), { previos, http: m.http, hasta: ['Cable · armar'] })

  it('falta el brief: pide el sobre a la cadena, se lo lleva a la oficina y la mesa del brief abre (ensayo: sin gasto)', async () => {
    const m = mundo()
    const r = await desdeAbrir(m, 'brief')
    expect(r.pasos).toEqual(['4 · ¿Calendario?', 'Mesa · ¿espera la gran idea?', 'Mesa · qué sigue', 'Mesa · ¿hay una mesa que abrir?', 'Mesa · abrir en la cadena', 'Mesa · leer lo que abrió', 'Mesa · ¿llevarlo a la oficina?', 'Mesa · abrir en la oficina', 'Mesa · ¿abrió?', 'Cable · armar'])
    expect(m.llamadas.map((l) => l.ruta)).toEqual(['/api/cadena/brief', '/api/oficina/encargos'])
    expect(m.llamadas[0].cuerpo).toMatchObject({ accion: 'abrir', campana_id: CAMPANA, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' })
    expect(m.llamadas[1].cuerpo).toMatchObject({ origen: 'cadena', tipo_de_mesa: 'brief', campana_id: CAMPANA, client_id: CLIENTE, version: 1, dry_run: true, despertar: true })
    expect(m.llamadas[1].cuerpo.marco_texto.length).toBeGreaterThan(100)
    expect(m.al.briefsCreativos).toHaveLength(1)
    expect(m.al.briefsCreativos[0]).toMatchObject({ version: 1, estado: 'borrador' })
    expect(m.M.encargos.size).toBe(1)
    expect([...m.M.encargos.values()][0]).toMatchObject({ familia: 'brief_mesa', parte_id: CAMPANA, estado: 'en_paso' })
    expect(r.item).toMatchObject({ resultado: 'cadena_abierta', campana_id: CAMPANA, client_id: CLIENTE })
    expect(String(r.item.nota)).toMatch(/la mesa de brief abrió/)
    expect(r.item.sobre).toBeUndefined()
  })

  it('falta el concepto (brief ya validado): abre la mesa de concepto con el brief dentro del marco', async () => {
    const m = mundo()
    await desdeAbrir(m, 'brief')
    const brief = m.al.briefsCreativos[0]
    brief.estado = 'validada'
    brief.texto_md = '## Insight\nEl barrio desayuna de pie.\n## Mensaje\nHay mesa desde las siete.'
    const antes = m.llamadas.length
    const r = await desdeAbrir(m, 'concepto')
    expect(m.llamadas.slice(antes).map((l) => l.ruta)).toEqual(['/api/cadena/concepto', '/api/oficina/encargos'])
    expect(m.llamadas[antes + 1].cuerpo).toMatchObject({ tipo_de_mesa: 'concepto', version: 1 })
    expect(m.llamadas[antes + 1].cuerpo.marco_texto).toContain('El barrio desayuna de pie')
    expect(m.al.conceptos).toHaveLength(1)
    expect(m.M.encargos.size).toBe(2)
    expect(String(r.item.nota)).toMatch(/la mesa de concepto abrió/)
  })

  it('idempotente: la segunda pasada no abre otra mesa (la cadena contesta ya_abierta y la oficina no se llama)', async () => {
    const m = mundo()
    await desdeAbrir(m, 'brief')
    const antes = m.llamadas.length
    const r = await desdeAbrir(m, 'brief')
    expect(m.llamadas.slice(antes).map((l) => l.ruta)).toEqual(['/api/cadena/brief'])
    expect(m.M.encargos.size).toBe(1)
    expect(m.al.briefsCreativos).toHaveLength(1)
    expect(String(r.item.nota)).toMatch(/ya estaba abierta/)
    expect(r.item.resultado).toBe('cadena_abierta')
  })

  it('la mesa trabaja (entrega) o Emilio no ha firmado (aprobacion): no se llama a NADIE', async () => {
    for (const falta of ['entrega', 'aprobacion']) {
      const m = mundo()
      const r = await desdeAbrir(m, falta)
      expect(m.llamadas).toEqual([])
      expect(r.pasos).toEqual(['4 · ¿Calendario?', 'Mesa · ¿espera la gran idea?', 'Mesa · qué sigue', 'Mesa · ¿hay una mesa que abrir?', 'Cable · armar'])
      expect(r.item).toMatchObject({ resultado: 'cadena_abierta' })
      expect(String(r.item.nota)).toContain(falta)
    }
  })

  it('una «falta» que el flujo no conoce se DETIENE (no inventa un paso)', async () => {
    const m = mundo()
    await expect(desdeAbrir(m, 'algo_nuevo')).rejects.toThrow(/PUERTA_MESA_FALTA_DESCONOCIDA/)
    expect(m.llamadas).toEqual([])
  })

  it('la oficina no abre (apagada o familia inactiva): la campaña pide a una persona, con el motivo', async () => {
    const m = mundo({ oficinaApagada: true })
    const r = await desdeAbrir(m, 'brief')
    expect(r.item).toMatchObject({ resultado: 'necesita_humano' })
    expect(String(r.item.nota)).toMatch(/la oficina no abre la mesa de brief \(familia no activa\)/)
  })

  it('la cadena dice que ya no se puede reabrir (409 con necesita_humano): no se le lleva nada a la oficina', async () => {
    const m = mundo()
    await desdeAbrir(m, 'brief')
    m.al.briefsCreativos[0].estado = 'descartada'
    m.al.briefsCreativos[0].version = 2 // la reapertura ya se gastó
    const antes = m.llamadas.length
    const r = await desdeAbrir(m, 'brief')
    expect(m.llamadas.slice(antes).map((l) => l.ruta)).toEqual(['/api/cadena/brief'])
    expect(r.item).toMatchObject({ resultado: 'necesita_humano' })
  })

  it('un error de la cadena que no es de los conocidos (p. ej. la palanca apagada) se DETIENE con su código', async () => {
    const m = mundo({ palanca: false })
    await expect(desdeAbrir(m, 'brief')).rejects.toThrow(/PUERTA_MESA_ABRIR_E-NUEVO-ORDEN-APAGADO/)
    expect(m.llamadas.map((l) => l.ruta)).toEqual(['/api/cadena/brief'])
  })

  it('el modo tanda siguiente entra por la misma cadena de nodos', async () => {
    const m = mundo()
    const r = await recorrer(leer('nuevo', PUERTA), 'Tanda · ¿resultado?', SALIDA('esperando_concepto', { accion: 'esperar_concepto', tanda: 2, falta: 'brief' }), { previos: { '⓪ Decidir': [{ ...S, modo: 'tanda_siguiente', tanda: 2 }] }, http: m.http, hasta: ['Cable · armar'] })
    expect(m.llamadas.map((l) => l.ruta)).toEqual(['/api/cadena/brief', '/api/oficina/encargos'])
    expect(r.item).toMatchObject({ resultado: 'cadena_abierta', modo: 'tanda_siguiente' })
  })

  it('el cable de cierre que arma «Cable · armar» sigue siendo válido para el resultado de espera', async () => {
    const m = mundo()
    const r = await desdeAbrir(m, 'entrega')
    const cable = await recorrer(leer('nuevo', PUERTA), 'Cable · armar', r.item, { hasta: ['Cable · cierre'] })
    expect(cable.item.pedido_cierre).toMatchObject({ accion: 'cierre', resultado: 'cadena_abierta', client_id: CLIENTE, campana_id: CAMPANA })
  })
})
