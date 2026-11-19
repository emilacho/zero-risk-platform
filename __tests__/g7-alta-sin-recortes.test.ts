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
      'El perfil de la red, o el hueco': ['.slice(0, 3)', '.slice(0, TOPE)'],
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
