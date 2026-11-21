/**
 * 21-nov · opción A (GO Lenovo 02:47Z · A1 probada en n8n vivo 04:02Z · CC1) · los 4 sub-flujos de la cadena esperan la vuelta del agente en un Wait por webhook
 * (la entrega el corredor de Railway), no en la misma llamada con el techo de 800 s de Vercel.
 * Se fija sobre el ANTES (el vivo bajado el 21-nov) y el DESPUÉS guardados de cada uno:
 *  · el DESPUÉS es exactamente el cambio puro del ANTES: la llamada suma `callback_url` + `callback_mode`, el agente sale a «¿Quedó en espera?», 3 nodos nuevos;
 *  · NADA más cambia (los demás nodos y cables, byte a byte);
 *  · el cambio se niega si el flujo no es el medido o si ya tiene la espera;
 *  · lo que se aplica al vivo es lo mismo que arma el constructor (los nodos tocados);
 *  · la espera del Wait es la misma constante con la que el código pone el plazo de la corrida (62 min).
 * El camino entero (acuse 202 → Wait → vuelta → guardar; espera agotada; vuelta fallida) se ejerce en `src/lib/cadena/__tests__/flujos.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { conEsperaPorElCorredor, llamadaConCorredor, ESPERA_S, CORTE_DE_LA_LLAMADA_MS, FORMA, SUBFLUJOS } from '../scripts/worker-staging/cadena/espera-por-el-corredor.mjs'
import { construirFlujos } from '../scripts/worker-staging/cadena/construir.mjs'
import { ESPERA_DE_LA_VUELTA_S, ESPERA_DE_LA_MISMA_LLAMADA_S, PLAZO_MINIMO_POR_EL_CORREDOR_MIN } from '../src/lib/cadena/constantes'

type Nodo = { name: string; type: string; parameters: Record<string, any>; onError?: string }
type Flujo = { id?: string; name: string; nodes: Nodo[]; connections: Record<string, { main: { node: string }[][] }> }
const dir = join(__dirname, '..', 'scripts', 'worker-staging', 'cadena', 'espera-por-el-corredor')
const leer = (id: string, n: string): Flujo => JSON.parse(readFileSync(join(dir, `${id}-${n}-2026-11-21.json`), 'utf8'))
const porNombre = (f: Flujo) => new Map(f.nodes.map((n) => [n.name, n]))

describe('las esperas son las del código', () => {
  it('🔴 el Wait espera lo mismo que la constante del plazo (3 600 s) y el plazo de la corrida la cubre', () => {
    expect(ESPERA_S).toBe(ESPERA_DE_LA_VUELTA_S)
    expect(PLAZO_MINIMO_POR_EL_CORREDOR_MIN * 60).toBeGreaterThan(ESPERA_S)
  })
  it('🔴 el corte de la llamada misma (si no hubiera acuse) sigue en 800 s, el techo de Vercel', () => {
    expect(CORTE_DE_LA_LLAMADA_MS).toBe(ESPERA_DE_LA_MISMA_LLAMADA_S * 1000)
  })
})

describe.each(Object.entries(SUBFLUJOS))('el sub-flujo vivo %s', (id, { clave, forma }) => {
  const antes = leer(id, 'ANTES'), despues = leer(id, 'DESPUES')
  const F = FORMA[forma as keyof typeof FORMA]
  const cambiar = (x: unknown) => conEsperaPorElCorredor(x as never, forma as 'paso' | 'fechas') as unknown as Flujo
  const nuevos = [`${F.n} ¿Quedó en espera?`, `${F.n} Esperar la vuelta`, `${F.n} La vuelta`]

  it('🔴 el ANTES es el vivo medido: el agente espera en la misma llamada 800 000 ms y sale directo a guardar', () => {
    expect(antes.id).toBe(id)
    expect(porNombre(antes).get(F.agente)?.parameters.options.timeout).toBe(800000)
    expect(antes.connections[F.agente].main).toEqual([[{ node: F.guardar, type: 'main', index: 0 }]])
    expect(JSON.stringify(antes)).not.toContain('callback_mode')
  })
  it('🔴 el DESPUÉS es exactamente el cambio puro del ANTES', () => {
    const puro = cambiar(antes)
    expect(JSON.stringify({ n: puro.nodes, c: puro.connections })).toBe(JSON.stringify({ n: despues.nodes, c: despues.connections }))
  })
  it('🔴 SOLO cambia la llamada (2 líneas) y el cable del agente; los demás nodos y cables quedan byte a byte', () => {
    const a = porNombre(antes)
    const cambiados = despues.nodes.filter((n) => a.has(n.name) && JSON.stringify(a.get(n.name)) !== JSON.stringify(n)).map((n) => n.name)
    expect(cambiados).toEqual([F.llamada])
    expect(despues.nodes.filter((n) => !a.has(n.name)).map((n) => n.name)).toEqual(nuevos)
    expect(despues.nodes).toHaveLength(antes.nodes.length + 3)
    const codigoAntes = String(a.get(F.llamada)!.parameters.jsCode)
    const codigoDespues = String(porNombre(despues).get(F.llamada)!.parameters.jsCode)
    expect(codigoDespues.replace("llamada.callback_url = $execution.resumeUrl\nllamada.callback_mode = 'runner'\n", '').replace(/\/\/ 🔴 21-nov · opción A[^\n]*\n/, '')).toBe(codigoAntes.replace(/\r\n/g, '\n'))
    for (const k of Object.keys(antes.connections)) if (k !== F.agente) expect(despues.connections[k]).toEqual(antes.connections[k])
  })
  it('🔴 los cables: agente → ¿espera? → (202) Wait → la vuelta → guardar · (otra cosa) → guardar', () => {
    const c = despues.connections
    expect(c[F.agente].main.map((s) => s.map((x) => x.node))).toEqual([[nuevos[0]]])
    expect(c[nuevos[0]].main.map((s) => s.map((x) => x.node))).toEqual([[nuevos[1]], [F.guardar]])
    expect(c[nuevos[1]].main.map((s) => s.map((x) => x.node))).toEqual([[nuevos[2]]])
    expect(c[nuevos[2]].main.map((s) => s.map((x) => x.node))).toEqual([[F.guardar]])
    const n = porNombre(despues)
    expect(n.get(nuevos[0])!.parameters.conditions.conditions[0].leftValue).toBe('={{ Number($json.statusCode) === 202 }}')
    expect(n.get(nuevos[1])!).toMatchObject({ type: 'n8n-nodes-base.wait', parameters: { resume: 'webhook', httpMethod: 'POST', limitWaitTime: true, resumeAmount: 3600, resumeUnit: 'seconds' } })
    expect(n.get(F.agente)!.onError).toBe('continueRegularOutput') // un corte de red sigue de largo y se guarda como fallida (relevo 41)
  })
  it('🔴 el cambio se niega si el flujo ya tiene la espera, si el agente no corta en 800 s o si falta un nodo', () => {
    expect(() => cambiar(despues)).toThrow(/ya tiene/)
    const otroCorte = structuredClone(antes); porNombre(otroCorte).get(F.agente)!.parameters.options.timeout = 290000
    expect(() => cambiar(otroCorte)).toThrow(/290000 ms/)
    expect(() => cambiar({ ...antes, nodes: antes.nodes.filter((n) => n.name !== F.guardar) })).toThrow(/hay 0/)
    const otroCable = structuredClone(antes); otroCable.connections[F.agente] = { main: [[{ node: F.llamada }]] } as any
    expect(() => cambiar(otroCable)).toThrow(/no sale solo/)
  })
  it('🔴 lo que se aplica al vivo es lo mismo que arma el constructor (los nodos tocados y los nuevos)', () => {
    const c = porNombre((construirFlujos() as Record<string, unknown>)[clave] as Flujo), d = porNombre(despues)
    for (const n of [F.agente, ...nuevos]) expect(JSON.stringify({ t: d.get(n)!.type, p: d.get(n)!.parameters, o: d.get(n)!.onError ?? null })).toBe(JSON.stringify({ t: c.get(n)!.type, p: c.get(n)!.parameters, o: c.get(n)!.onError ?? null }))
  })
})

describe('la línea de la llamada', () => {
  it('🔴 se pega una sola vez, antes del return, y se niega si ya está o si la llamada no es la de antes', () => {
    const viejo = "const s = $input.first().json\nconst llamada = { ...s.run_sdk }\nreturn [{ json: { ...s, llamada } }]"
    const nuevo = llamadaConCorredor(viejo)
    expect(nuevo.indexOf("llamada.callback_mode = 'runner'")).toBeLessThan(nuevo.indexOf('return [{'))
    expect(nuevo.match(/callback_url/g)).toHaveLength(1)
    expect(() => llamadaConCorredor(nuevo)).toThrow(/ya tiene/)
    expect(() => llamadaConCorredor('return 1')).toThrow(/no es la de antes/)
  })
})
