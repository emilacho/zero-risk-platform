/**
 * Ronda 75 · los flujos: (1) la pieza usa el registro del cliente en «E) LA VOZ» (H1) · (2) UN SOLO CAMINO DE BRIEFS: la puerta con la cadena apagada ya no reenvía a la parte vieja.
 * Flujos reales (respaldos ANTES de hoy).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirFlujo as aPieza, cambiarFuncion, NODOS_CON_LA_FUNCION, NODO_DEL_CUERPO } from '../scripts/worker-staging/pieza-el-productor/construir-ronda75.mjs'
import { construirFlujo as aPuerta, NODOS as NP, NOTA } from '../scripts/worker-staging/cadena/construir-ronda75-puerta.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const W = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(W, p), 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const cambian = (a: Flujo, b: Flujo) => a.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(b, n.name))).map((n) => n.name)
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const PIE_ANTES = leer('pieza-el-productor/pieza-r75-ANTES.json'), PIE_HOY = leer('pieza-el-productor/pieza-r75-ARREGLADO.json')
const PUE_ANTES = leer('cadena/puerta-r75-ANTES.json'), PUE_HOY = leer('cadena/puerta-r75-ARREGLADO.json')

describe('H1 · «E) LA VOZ» de la pieza usa el registro del cliente', () => {
  const TEXTOS = [{ fecha: '2026-09-01', texto: 'Un texto propio del cliente', post: null }]
  const voz = (f: Flujo, nombre: string) => {
    const c = String(nodo(f, nombre).parameters.jsCode)
    const i = c.indexOf('function bloqueDeVoz'), ini = Math.max(c.indexOf('function lineaDeRegistro'), 0)
    const desde = c.indexOf('/** r75 · H1') >= 0 ? c.indexOf('/** r75 · H1') : i
    const fin = c.indexOf('\n}\n', i) + 3
    return new Function(c.slice(desde, fin) + '\nreturn bloqueDeVoz')() as (t: unknown, tr?: unknown) => string
  }
  it('rojo (antes): ⑤ y ⑦ mandaban «El español es de Ecuador: TUTEA siempre» a todo cliente', () => {
    for (const n of NODOS_CON_LA_FUNCION) { expect(String(nodo(PIE_ANTES, n).parameters.jsCode)).toContain('El español es de Ecuador: TUTEA siempre'); expect(voz(PIE_ANTES, n)(TEXTOS, { trato: 'vos', fuente: 'manual' })).toContain('TUTEA siempre') }
  })
  it.each(NODOS_CON_LA_FUNCION)('verde · %s: con el registro del cliente ya resuelto, lo dice; sin dato, lo declara; nunca «Ecuador»', (n) => {
    expect(String(nodo(PIE_HOY, n).parameters.jsCode)).not.toContain('TUTEA siempre')
    const v = voz(PIE_HOY, n)
    const cabeza = (x: string) => x.split('\n   1. ')[0]
    expect(cabeza(v(TEXTOS, { trato: 'tu', fuente: 'manual' }))).toMatch(/TUTEO \(fijado por su manual\)/)
    expect(cabeza(v(TEXTOS, { trato: 'vos', fuente: 'default_por_pais' }))).toMatch(/VOSEO \(fijado por su país, por omisión\)/)
    expect(cabeza(v(TEXTOS, { trato: 'usted', fuente: 'ficha' }))).toMatch(/USTED \(fijado por su ficha\)/)
    for (const sin of [undefined, { trato: 'no_definido' }, { trato: 'conflicto' }]) { const x = cabeza(v(TEXTOS, sin)); expect(x).toMatch(/NO está fijado/); expect(x).not.toMatch(/TUTEO \(|VOSEO \(|USTED \(/) }
    expect(cabeza(v(TEXTOS, { trato: 'vos', fuente: 'manual' }))).not.toMatch(/Ecuador/)
    expect(v([], { trato: 'tu' })).toMatch(/No hay textos de posts propios/)
  })
  it('la llamada de ⑤ pasa el trato ya resuelto; SOLO cambian esos dos nodos; se reconstruye igual; no se aplica a ciegas ni dos veces', () => {
    expect(String(nodo(PIE_HOY, NODO_DEL_CUERPO).parameters.jsCode)).toContain('bloqueDeVoz(textosDeVoz, trato)')
    expect(cambian(PIE_ANTES, PIE_HOY).sort()).toEqual([...NODOS_CON_LA_FUNCION].sort()); expect(JSON.stringify(PIE_HOY.connections)).toBe(JSON.stringify(PIE_ANTES.connections))
    expect(JSON.stringify(aPieza(PIE_ANTES as never).nodes)).toBe(JSON.stringify(PIE_HOY.nodes))
    expect(() => aPieza(PIE_HOY as never)).toThrow(); expect(() => cambiarFuncion('const x = 1', 'n')).toThrow(/no se encontró/)
  })
})

describe('UN SOLO CAMINO DE BRIEFS · la puerta con la cadena apagada no reenvía a la parte vieja', () => {
  /** nodos alcanzables desde la rama «pasarela» de «¿Pasarela?» */
  const alcanzables = (f: Flujo, desde: string) => {
    const vistos = new Set<string>(), pila = [desde]
    while (pila.length) { const n = pila.pop()!; if (vistos.has(n)) continue; vistos.add(n); for (const s of f.connections[n]?.main ?? []) for (const d of s) pila.push(d.node) }
    return vistos
  }
  const llamaALaParteVieja = (f: Flujo, nombres: Iterable<string>) => [...nombres].filter((n) => nodo(f, n).type.endsWith('httpRequest') && /zero-risk\/brief['"`)\s]|zero-risk\/brief$/.test(String(nodo(f, n).parameters.url)))
  const rama = (f: Flujo) => f.connections['¿Pasarela?'].main[0].map((d) => d.node)
  it('rojo (antes): desde la rama «pasarela» se llegaba a un POST a /webhook/zero-risk/brief (el brief viejo, que cobra); verde: ya no', () => {
    expect(rama(PUE_ANTES)).toEqual([NP.reenviar]); expect(llamaALaParteVieja(PUE_ANTES, alcanzables(PUE_ANTES, NP.reenviar))).toEqual([NP.reenviar])
    expect(rama(PUE_HOY)).toEqual([NP.reenviar]); expect(llamaALaParteVieja(PUE_HOY, alcanzables(PUE_HOY, NP.reenviar))).toEqual([])
    expect(JSON.stringify(PUE_HOY)).not.toMatch(/webhook\/zero-risk\/brief['"`]|zero-risk\/brief'/)
  })
  const correr = async (n: string, entrada: unknown, decidir?: unknown) => (await new AsyncFunction('$input', '$', String(nodo(PUE_HOY, n).parameters.jsCode))({ first: () => ({ json: entrada }) }, (x: string) => ({ first: () => ({ json: x === '⓪ Decidir' ? decidir : {} }) })))[0].json as Record<string, any>
  it('el nodo de «reenviar» no llama a nadie: deja constancia; «¿salió?» arma el cierre con `cadena_apagada` y la nota, con los datos del viaje', async () => {
    const a = await correr(NP.reenviar, { client_id: 'c1', plan_id: 'p1', modo: 'abrir' })
    expect(a).toMatchObject({ statusCode: 200, cadena_apagada: true, nota: NOTA, client_id: 'c1', plan_id: 'p1' })
    const decidir = { modo: 'abrir', client_id: 'c1', tenant_id: 'c1', _journey_id: 'j1', _sala_correlation_id: 's1', plan_id: 'p1', dry_run: true, cuerpo_original: '{"x":1}', simulacros: { x: 1 } }
    const b = await correr(NP.salio, a, decidir)
    expect(b).toMatchObject({ resultado: 'cadena_apagada', nota: NOTA, client_id: 'c1', _journey_id: 'j1', _sala_correlation_id: 's1' }); expect(b.cuerpo_original).toBeUndefined(); expect(b.simulacros).toBeUndefined()
    await expect(correr(NP.salio, { statusCode: 200 }, decidir)).rejects.toThrow(/PUERTA_PASARELA_INESPERADA/)
  })
  it('el cierre del viaje: «¿salió?» → «Cable · armar» y el cable acepta el resultado nuevo (y los de antes)', async () => {
    expect(PUE_HOY.connections[NP.salio].main[0][0].node).toBe(NP.cable); expect(PUE_ANTES.connections[NP.salio]).toBeUndefined()
    for (const resultado of ['cadena_apagada', 'cadena_abierta', 'pasarela_ok']) {
      const s = await new AsyncFunction('$input', '$workflow', '$execution', String(nodo(PUE_HOY, NP.cable).parameters.jsCode))({ first: () => ({ json: { resultado, client_id: 'c1', _journey_id: 'j1', _sala_correlation_id: 's1' } }) }, { id: 'wf' }, { id: 'ex' })
      expect(s[0].json.pedido_cierre).toMatchObject({ accion: 'cierre', resultado, client_id: 'c1', journey_id: 'j1' })
    }
    await expect(new AsyncFunction('$input', '$workflow', '$execution', String(nodo(PUE_HOY, NP.cable).parameters.jsCode))({ first: () => ({ json: { resultado: 'inventado' } }) }, { id: 'wf' }, { id: 'ex' })).rejects.toThrow(/PUERTA_RESULTADO_INVALIDO/)
  })
  it('SOLO cambian esos tres nodos; se reconstruye igual; no se aplica a ciegas ni dos veces', () => {
    expect(cambian(PUE_ANTES, PUE_HOY).sort()).toEqual([NP.cable, NP.reenviar, NP.salio].sort())
    expect(Object.keys(PUE_HOY.connections).filter((k) => JSON.stringify(PUE_HOY.connections[k]) !== JSON.stringify(PUE_ANTES.connections[k]))).toEqual([NP.salio])
    expect(JSON.stringify(aPuerta(PUE_ANTES as never).nodes)).toBe(JSON.stringify(PUE_HOY.nodes)); expect(() => aPuerta(PUE_HOY as never)).toThrow()
  })
})
