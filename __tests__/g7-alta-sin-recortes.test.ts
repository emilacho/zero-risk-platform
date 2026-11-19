/**
 * 19-nov · G7 · el alta del cliente (LyVoKcrypS5uLyuu) sin recortes y con el país del cliente (firma de Emilio «nada se recorta», 18-nov).
 * El flujo nuevo sale del VIVO con solo los reemplazos declarados (`scripts/worker-staging/g7-alta/reemplazos.cjs`).
 * La conducta se prueba corriendo los nodos del flujo NUEVO con entradas falsas (sin red, US$ 0) y comparando con el VIVO.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { TOPE_REAL_DEL_PEDIDO } from '@/lib/limites-de-tamano'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/g7-alta')
const ID = 'LyVoKcrypS5uLyuu'
type Nodo = { name: string; parameters?: { jsCode?: string } & Record<string, unknown> } & Record<string, unknown>
type Flujo = { nodes: Nodo[] } & Record<string, unknown>
const leer = (c: string): Flujo => JSON.parse(fs.readFileSync(path.join(DIR, c, `${ID}.json`), 'utf8'))
const { construir, TECHO } = createRequire(import.meta.url)(path.join(DIR, 'reemplazos.cjs')) as { construir: (w: Flujo) => { w: Flujo }; TECHO: number }
const codigo = (f: Flujo, nombre: string) => String(f.nodes.find((n) => n.name === nombre)!.parameters!.jsCode)

/** corre un nodo de código de n8n con `$('…')`, `$json`, `$execution` y `$workflow` falsos */
const correrNodo = (f: Flujo, nombre: string, nodos: Record<string, unknown>, json: unknown = {}) => {
  const $ = (n: string) => ({ first: () => ({ json: nodos[n] }), item: { json: nodos[n] }, all: () => [{ json: nodos[n] }] })
  const fn = new Function('$', '$json', '$input', '$execution', '$workflow', '$env', `return (function(){${codigo(f, nombre)}\n})()`)
  return fn($, json, { first: () => ({ json }), all: () => [{ json }], item: { json } }, { id: 'e1' }, { id: ID }, {}) as Array<{ json: Record<string, any> }>
}

describe('G7 · el flujo nuevo', () => {
  it('se reconstruye igual desde el vivo (solo los reemplazos declarados)', () => {
    expect(construir(leer('vivo')).w).toEqual(leer('nuevo'))
  })
  it('fuera del código, el flujo nuevo es IGUAL al vivo (nodos, conexiones, ajustes)', () => {
    const sin = (f: Flujo) => ({ ...f, nodes: f.nodes.map((n) => ({ ...n, parameters: { ...n.parameters, jsCode: undefined } })) })
    expect(sin(leer('nuevo'))).toEqual(sin(leer('vivo')))
  })
  it('el techo es el del pedido entero menos el margen de G1b', () => {
    expect(TECHO).toBe(TOPE_REAL_DEL_PEDIDO - 10_000)
  })
  it('el bloque «entrada del cliente» queda IDÉNTICO (lo comparte con src/lib/alta/entrada-del-cliente.ts)', () => {
    const bloque = (t: string) => t.slice(t.indexOf('// ═══ LA ENTRADA DEL CLIENTE'), t.indexOf('// ═══ fin de la entrada del cliente ═══'))
    for (const nombre of ['Validate Deal Data', 'El texto del sitio, o el hueco', 'El perfil de la red, o el hueco']) {
      const v = bloque(codigo(leer('vivo'), nombre))
      expect(v.length, nombre).toBeGreaterThan(1000)
      expect(bloque(codigo(leer('nuevo'), nombre)), nombre).toBe(v)
    }
  })
})

describe('G7 · el país de la biblioteca de anuncios es el del cliente (antes US fijo)', () => {
  const parser = '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)'
  const competidores = [{ name: 'Competidor Uno', handles: {} }, { name: 'Competidor Dos', handles: {} }]
  const anuncios = (f: Flujo, deal: Record<string, unknown>) => {
    const r = correrNodo(f, parser, {
      'Call Onboarding Specialist: Auto-Discovery': { body: { discovery_output: { competitors: competidores, own_handles: {}, sources: [] } } },
      'Validate Deal Data': { client_id: 'c1', client_name: 'Cliente', _journey_id: 'j1', ...deal },
    })
    const targets = (r[0].json.discovery_package?.scrape_targets ?? r[0].json.scrape_targets ?? []) as Array<{ apify_function?: string; params?: { country?: string } }>
    return targets.filter((t) => t.apify_function === 'facebook_ads_library_scraper').map((t) => t.params?.country)
  }
  it.each([
    [{ country: 'EC' }, 'EC'],
    [{ country: 'Ecuador' }, 'EC'],
    [{ country: 'Perú' }, 'PE'],
    [{ country: null, location: 'Guayaquil, Ecuador' }, 'EC'],
    [{ country: 'República Dominicana' }, 'DO'],
    [{ country: 'mx' }, 'MX'],
    [{ country: null, location: null }, 'ALL'],
    [{ country: 'Narnia' }, 'ALL'],
  ])('🔴 %j → %s en cada competidor', (deal, esperado) => {
    const p = anuncios(leer('nuevo'), deal)
    expect(p.length).toBe(competidores.length)
    expect(p.every((x) => x === esperado), JSON.stringify(p)).toBe(true)
  })
  it('el vivo buscaba siempre en US (lo que se arregla)', () => {
    expect(anuncios(leer('vivo'), { country: 'EC' })).toEqual(['US', 'US'])
    expect(codigo(leer('nuevo'), parser)).not.toContain("country: 'US'")
  })
})

describe('G7 · el texto del sitio y el perfil llegan enteros hasta el techo del pedido', () => {
  const largo = (marca: string, n: number) => `${marca}-INICIO ${'x'.repeat(n)} ${marca}-FINAL`
  it('🔴 el sitio de 300.000 caracteres llega entero (antes 60.000) y el perfil de 50.000 también (antes 8.000)', () => {
    const tSitio = codigo(leer('nuevo'), 'El texto del sitio, o el hueco')
    const tPerfil = codigo(leer('nuevo'), 'El perfil de la red, o el hueco')
    expect(tSitio).toContain(`const TOPE = ${TECHO};`)
    expect(tPerfil).toContain(`const TOPE = ${TECHO};`)
    expect(codigo(leer('vivo'), 'El texto del sitio, o el hueco')).toContain('const TOPE = 60000;')
    expect(codigo(leer('vivo'), 'El perfil de la red, o el hueco')).toContain('const TOPE = 8000;')
    expect(largo('S', 300_000).length).toBeLessThan(TECHO)
  })
})

// 19-nov · 🟡 de CC6 (05:31Z): el sitio y el perfil van en UNA tarea al descubridor. Se corre el nodo del sitio, el del perfil y la expresión REAL de la tarea del nodo
// «Call Onboarding Specialist: Auto-Discovery Dispatch»; la tarea entera tiene que caber en TOPE_REAL_DEL_PEDIDO y, si el perfil no cabe, llevar el aviso con los dos números.
describe('G7 · el sitio y el perfil comparten la tarea del descubridor: entra en el techo y avisa', () => {
  const NUEVO = leer('nuevo')
  const DISPATCH = 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)'
  const largo = (marca: string, n: number) => `${marca}-INICIO ${'x'.repeat(n)} ${marca}-FINAL`
  const TRATO = { client_id: 'c-1', client_name: 'Cliente de prueba', industry: 'servicios', location: 'Quito · Ecuador', website: 'https://ejemplo.ec', _entrada: { cuentas: { instagram: 'cliente.prueba' } } }
  /** la tarea tal como la arma n8n: se evalúa la expresión `"task": {{ … }}` del cuerpo del nodo con un `$` falso */
  const tareaDelDescubridor = (nodos: Record<string, unknown>) => {
    const cuerpo = String(NUEVO.nodes.find((n) => n.name === DISPATCH)!.parameters!.jsonBody)
    const i = cuerpo.indexOf('"task": {{') + '"task": {{'.length
    const j = cuerpo.indexOf('}},\n  "workflow_id"', i)
    expect(i).toBeGreaterThan(20)
    expect(j).toBeGreaterThan(i)
    const $ = (n: string) => ({ first: () => ({ json: nodos[n] }), item: { json: nodos[n] } })
    return JSON.parse(new Function('$', '$workflow', '$execution', `return (${cuerpo.slice(i, j)})`)($, { id: ID }, { id: 'e1' })) as string
  }
  const correr = (sitio: string, perfil: string, trato: Record<string, unknown> = TRATO) => {
    const nodos: Record<string, unknown> = { 'Validate Deal Data': trato }
    nodos['El texto del sitio, o el hueco'] = correrNodo(NUEVO, 'El texto del sitio, o el hueco', nodos, { ok: true, datos: sitio })[0].json
    nodos['El perfil de la red, o el hueco'] = correrNodo(NUEVO, 'El perfil de la red, o el hueco', nodos, { ok: true, datos: perfil })[0].json
    return { nodos, tarea: tareaDelDescubridor(nodos) }
  }
  it('🔴 un sitio de 1,4 M y un perfil de 200 000 (juntos no caben): la tarea queda dentro del techo, el sitio llega entero y el perfil lleva el aviso con los dos números', () => {
    const { nodos, tarea } = correr(largo('S', 1_400_000), largo('P', 200_000))
    expect((nodos['El texto del sitio, o el hueco'] as Record<string, unknown>).sitio_estado).toBe('trajo')
    expect((nodos['El perfil de la red, o el hueco'] as Record<string, unknown>).perfil_estado).toBe('trajo')
    expect(tarea.length).toBeLessThanOrEqual(TOPE_REAL_DEL_PEDIDO)
    expect(tarea).toContain('S-FINAL')
    expect(tarea).toContain('P-INICIO')
    expect(tarea).not.toContain('P-FINAL')
    expect(tarea).toMatch(/\[…recortado: llegan \d+ de 200017 caracteres del perfil; la tarea al descubridor tiene un techo y el texto del sitio va primero\]/)
  })
  it('🔴 un sitio que llena su techo: el perfil recibe solo lo que queda (pocos miles), AVISADO con los dos números, y la tarea sigue dentro del techo', () => {
    const { tarea } = correr(largo('S', TECHO), largo('P', 50_000))
    expect(tarea.length).toBeLessThanOrEqual(TOPE_REAL_DEL_PEDIDO)
    const m = /\[…recortado: llegan (\d+) de 50017 caracteres del perfil;/.exec(tarea)
    expect(m, 'aviso del perfil').not.toBeNull()
    expect(Number(m![1])).toBeLessThan(10_000)
    expect(tarea).not.toContain('P-FINAL')
  })
  it('🔴 los datos del trato también ocupan la tarea: con un rubro de 40 000 caracteres, el perfil recibe menos y la tarea sigue dentro del techo', () => {
    const { tarea } = correr(largo('S', 1_400_000), largo('P', 200_000), { ...TRATO, industry: 'r'.repeat(40_000) })
    expect(tarea).toContain('r'.repeat(40_000))
    expect(tarea.length).toBeLessThanOrEqual(TOPE_REAL_DEL_PEDIDO)
    expect(tarea).toMatch(/\[…recortado: llegan \d+ de 200017 caracteres del perfil;/)
  })
  it('lo que cabe llega entero, sin aviso (un sitio de 300 000 y un perfil de 50 000)', () => {
    const { tarea } = correr(largo('S', 300_000), largo('P', 50_000))
    for (const m of ['S-INICIO', 'S-FINAL', 'P-INICIO', 'P-FINAL']) expect(tarea).toContain(m)
    expect(tarea).not.toContain('recortado')
  })
  it('🔴 el vivo daba un perfil de 8 000 (la prueba distingue el vivo)', () => {
    const vivo = leer('vivo')
    const nodos: Record<string, unknown> = { 'Validate Deal Data': TRATO }
    const p = correrNodo(vivo, 'El perfil de la red, o el hueco', nodos, { ok: true, datos: largo('P', 50_000) })[0].json
    expect(String(p.perfil_texto)).not.toContain('P-FINAL')
  })
})

describe('G7 · la materia de la jefatura', () => {
  const nodo = '[JEFATURA] Transform discovery→package'
  it('🔴 el sitio y el Instagram propio usan el techo del pedido (antes 200.000 y 100.000), con el aviso si se pasa', () => {
    const t = codigo(leer('nuevo'), nodo)
    expect(t).toContain(`_t.length > ${TECHO} ? _t.slice(0, ${TECHO})`)
    expect(t.split(`_d.length > ${TECHO} ? _d.slice(0, ${TECHO})`).length - 1).toBe(2)
    expect(t).not.toMatch(/slice\(0, (200000|100000|150)\)/)
  })
})

describe('G7 · los recortes de datos y diagnósticos que quedan fuera', () => {
  it('🔴 en el flujo nuevo no queda ningún recorte salvo los declarados (fecha, ids, señales del bloque compartido, lo que decide cuánto se raspa)', () => {
    // la lista EXACTA, nodo por nodo: un recorte de más en cualquier nodo (o uno de los permitidos en otro lugar) hace fallar
    const quedan: Record<string, string[]> = {
      'Validate Deal Data': ['.slice(0, 3)'], // señales, dentro del bloque compartido con entrada-del-cliente.ts
      '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)': ['.slice(0, 8)'], // 8 competidores a raspar: gasto, pregunta a Lenovo
      '[JEFATURA] Transform discovery→package': ['.slice(0, 10)', `.slice(0, ${TECHO})`, `.slice(0, ${TECHO})`, `.slice(0, ${TECHO})`], // fecha AAAA-MM-DD · el techo del pedido, con aviso
      'El texto del sitio, o el hueco': ['.slice(0, 3)', '.slice(0, TOPE)'], // señales del bloque compartido · el techo, con aviso
      'El perfil de la red, o el hueco': ['.slice(0, 3)', '.slice(0, ESPACIO)'],
      'Veredicto perdido · parar ruidoso': ['.slice(0, 8)'], // el id corto del cliente en el mensaje
      'Re-gate perdido · parar ruidoso': ['.slice(0, 8)'],
      '[FUENTES] Armar las llamadas': ['.slice(0, 80)'], // la etiqueta target_label (un identificador)
    }
    const hay: Record<string, string[]> = {}
    for (const n of leer('nuevo').nodes) {
      const t = n.parameters?.jsCode
      if (typeof t !== 'string') continue
      const m = (t.match(/\.(slice|substring)\(0, ?[\w]+\)/g) ?? []).map((x) => x.replace(/\(0, ?/, '(0, ')).sort()
      if (m.length) hay[n.name] = m
    }
    expect(hay).toEqual(Object.fromEntries(Object.entries(quedan).map(([k, v]) => [k, [...v].sort()])))
  })
  it('🔴 el error de una nota perdida llega entero (antes 400)', () => {
    const r = correrNodo(leer('nuevo'), 'Nota perdida · APIFY_WIRE', {}, { error: { message: 'E'.repeat(1000) + '-FINAL' } })
    expect(JSON.stringify(r)).toContain('-FINAL')
  })
})
