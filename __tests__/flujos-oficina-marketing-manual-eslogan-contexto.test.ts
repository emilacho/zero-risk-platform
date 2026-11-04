/**
 * 02-nov · EQUIPO DEL MANUAL · (e) el eslogan en el manual es CONTEXTO, no una regla (ADENDA 3 de Emilio: sin reglas duras sobre la creatividad).
 * US$ 0, sin red; se ejecuta el CÓDIGO REAL de «[BB] Fan-out prep» del vivo (antes) y del archivo nuevo (ahora) con la misma evidencia real (ejecución 146544).
 * Fija: con frase hallada ya no sale «TAL CUAL» ni «PRIMERA opción»; sale «UNA FRASE QUE EL CLIENTE USA (contexto…)» y solo en la lente del eslogan;
 * sin frase la salida es IDÉNTICA byte a byte; lo demás de la tarea no cambia; solo cambia ese nodo respecto del paso anterior.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NUEVO, VIEJO } from '../scripts/ops/oficina-marketing/eslogan-manual-contexto.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nuevo = leer('nuevo')
const vivo = leer('vivo')
const codigo = (f: any, n: string): string => f.nodes.find((x: any) => x.name === n).parameters.jsCode
const EV44 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts/worker-staging/ssLtwYPt7zxuvnM2/evidencia-146544-e109.json'), 'utf8')) as { nodos: Record<string, any>; todos: Record<string, any[]> }

const FANOUT = '[BB] Fan-out prep'
const LENTES = ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']
const FRASE = 'Cuando tengas esa hambre de... Náufrago te espera!'

function correr(code: string, ctx: { nodos: Record<string, any>; todos: Record<string, any[]>; json: any }) {
  const $ = (n: string) => {
    if (!(n in ctx.nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: ctx.nodos[n] }), all: () => (ctx.todos[n] ?? [ctx.nodos[n]]).map((j) => ({ json: j })), item: { json: ctx.nodos[n] } }
  }
  return new Function('$', '$json', '$execution', code)($, ctx.json, { id: '999001' }) as Array<{ json: any }>
}
const materia = (extra: Record<string, unknown> = {}) => ({ idioma: 'español de Ecuador', sitio_estado: 'trajo', sitio_texto: 'x'.repeat(3500), sitio_caracteres_total: 16006, instagram_propio: 'y'.repeat(1000), instagram_estado: 'trajo', ...extra })
const ctxFan = (m: Record<string, unknown> | null) => {
  const nodos = JSON.parse(JSON.stringify(EV44.nodos)); const todos = JSON.parse(JSON.stringify(EV44.todos))
  if (m) { nodos['Confirm barato · competitor list'].discovery_package.materia_cliente = m; todos['Confirm barato · competitor list'][0].discovery_package.materia_cliente = m }
  return { nodos, todos, json: nodos['[BB] Load ICP (canon)'] }
}
// «antes» de ESTE paso = el mismo archivo acumulado (con palabras con intención, juez y pedir cambios) con el texto viejo de la frase: así solo se mide (e)
const previo = codigo(nuevo, FANOUT).replace(NUEVO, VIEJO)
const hallada = materia({ estado_frase_propia: 'hallado', frase_propia: FRASE })

describe('eslogan del manual · contexto, no regla (código real de Fan-out prep)', () => {
  it('rojo (el vivo de hoy): con frase hallada la lente del eslogan recibe la orden «TAL CUAL … PRIMERA opción»', () => {
    const [o] = correr(codigo(vivo, FANOUT), ctxFan(hallada))
    expect(o.json.tasks['editor-en-jefe']).toMatch(/TAL CUAL, sin cambiar una letra, como PRIMERA opción/)
  })
  it('verde: con frase hallada llega como contexto libre, solo a la lente del eslogan, con la frase literal', () => {
    const [o] = correr(codigo(nuevo, FANOUT), ctxFan(hallada))
    const t = o.json.tasks['editor-en-jefe'] as string
    expect(t).toContain('UNA FRASE QUE EL CLIENTE USA (contexto')
    expect(t).toContain('«' + FRASE + '».')
    expect(t).toMatch(/contexto, no una orden/)
    expect(t).toMatch(/Úsala, adáptala o propón otra mejor, como prefieras/)
    expect(t).toMatch(/Solo si es evidente que es su eslogan/)
    for (const l of LENTES) { expect(o.json.tasks[l]).not.toMatch(/TAL CUAL|PRIMERA opción|FRASE PROPIA DEL CLIENTE|sin cambiar una letra/) }
    for (const l of ['brand-strategist', 'jefe-client-success']) expect(o.json.tasks[l]).not.toContain('UNA FRASE QUE EL CLIENTE USA')
  })
  it('sin frase (sin dato, dudosa o sin materia) la salida es IDÉNTICA byte a byte a la de hoy', () => {
    for (const m of [materia(), materia({ estado_frase_propia: 'sin_dato', frase_propia: null }), materia({ estado_frase_propia: 'dudoso', frase_propia: FRASE }), null]) {
      const [antes] = correr(previo, ctxFan(m))
      const [ahora] = correr(codigo(nuevo, FANOUT), ctxFan(m))
      expect(JSON.stringify(ahora.json.tasks)).toBe(JSON.stringify(antes.json.tasks))
      for (const l of LENTES) expect(ahora.json.tasks[l]).not.toContain('UNA FRASE QUE EL CLIENTE USA')
    }
  })
  it('lo único que cambia en la tarea del eslogan es ese bloque: quitado, queda igual a la de hoy sin él', () => {
    const [antes] = correr(previo, ctxFan(hallada))
    const [ahora] = correr(codigo(nuevo, FANOUT), ctxFan(hallada))
    const sinBloque = (t: string) => t.replace(/\n\n(FRASE PROPIA DEL CLIENTE|UNA FRASE QUE EL CLIENTE USA) \([^\n]*/, '')
    for (const l of LENTES) expect(sinBloque(ahora.json.tasks[l])).toBe(sinBloque(antes.json.tasks[l]))
  })
  it('el presupuesto se ajusta solo: lo que cede de evidencia no crece y todas las tareas caben bajo 16.000 (frase normal y larguísima)', () => {
    for (const m of [hallada, materia({ estado_frase_propia: 'hallado', frase_propia: 'palabra '.repeat(400) })]) {
      const [antes] = correr(previo, ctxFan(m))
      const [ahora] = correr(codigo(nuevo, FANOUT), ctxFan(m))
      expect(ahora.json._corte.lentes_recortadas).toEqual([])
      for (const l of LENTES) { expect(ahora.json.tasks[l].length).toBeLessThanOrEqual(16000); expect(ahora.json._corte.margen_por_lente[l]).toBeGreaterThanOrEqual(0) }
      expect(ahora.json._corte.evidencia_omitida).toEqual(antes.json._corte.evidencia_omitida)
      for (const l of LENTES) expect(ahora.json.tasks[l].length).toBeLessThanOrEqual(antes.json.tasks[l].length)   // el texto nuevo no es más largo que el viejo: no come el techo de 16.000 del endpoint
    }
  })
  it('alcance: este paso no toca ningún otro nodo del archivo acumulado (cambia solo el código de Fan-out prep respecto de lo anterior)', () => {
    const hoy = codigo(vivo, FANOUT)
    expect(codigo(nuevo, FANOUT).split('UNA FRASE QUE EL CLIENTE USA').length).toBe(2)
    expect(codigo(nuevo, FANOUT)).not.toContain('Escríbela TAL CUAL')
    expect(hoy).toContain('Escríbela TAL CUAL')
    expect(previo).not.toBe(codigo(nuevo, FANOUT))
    expect(previo.split(VIEJO).length).toBe(2)
  })
})
