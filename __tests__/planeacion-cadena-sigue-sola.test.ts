/**
 * LA CADENA SIGUE SOLA DESPUÉS DEL PLAN (CC#2 · 20-oct · parte 3 del encargo «limpiar y arreglar»). US$ 0 · sin red · sin modelo.
 * Recorre el GRAFO del flujo de planeación preparado (el de antes = el vivo) y ejecuta el código real del aviso y la condición real del IF:
 *  1. con la credencial de Google caducada (sin PDF) la corrida sigue al cable de vuelta, al sobre del brief y al cierre de la corrida (antes terminaba en la campana);
 *  2. un plan con pendientes NO pide el parte; uno sin pendientes sí;
 *  3. el aviso de la bandeja lleva lo que hace falta para pedir el parte cuando Emilio apruebe.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/X9F0zp6LQ2xGEYVS')
type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main?: Array<Array<{ node: string }>> }> }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as Flujo
const antes = leer('planeacion-ANTES-cadena-sigue-sola-2026-10-20.json')
const nuevo = leer('planeacion-ARREGLADO-cadena-sigue-sola-2026-10-20.json')

const CAMPANA = 'Campana · plan sin PDF', CABLE = 'Cable de vuelta · sala', VOLVIO = 'Cable · ¿volvió? · plan', BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
const CIERRE = 'V9 · cerrar la corrida', ESPERA = '¿Plan con pendientes? · espera a Emilio', AVISO = 'Aviso · plan con pendientes', SIN_PDF = 'Armar el aviso · sin PDF', HAY_PDF = 'IF · ¿hay PDF?'
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

/** los nodos a los que se llega desde `desde` saliendo por la salida `salida` (si se da) y siguiendo todas las demás */
function alcanzables(f: Flujo, desde: string, salida?: number, bloqueados: string[] = []): Set<string> {
  const visto = new Set<string>(); const pila: string[] = []
  const salidas = f.connections[desde]?.main ?? []
  for (const [i, o] of salidas.entries()) if (salida === undefined || i === salida) for (const t of o) pila.push(t.node)
  while (pila.length) {
    const n = pila.pop()!; if (visto.has(n) || bloqueados.includes(n)) continue; visto.add(n)
    for (const o of f.connections[n]?.main ?? []) for (const t of o) pila.push(t.node)
  }
  return visto
}

describe('1 · Drive fuera del camino crítico', () => {
  it('ANTES: la rama «sin PDF» terminaba en la campana y nunca llegaba al cable, al brief ni al cierre (lo medido en la ejecución 186281)', () => {
    const r = alcanzables(antes, HAY_PDF, 1)
    expect([...r].sort()).toEqual([CAMPANA, SIN_PDF].sort())
    expect(r.has(CABLE)).toBe(false); expect(r.has(BRIEF)).toBe(false); expect(r.has(CIERRE)).toBe(false)
  })
  it('AHORA: la rama «sin PDF» avisa por Slack Y sigue al cable de vuelta, al brief (si no hay pendientes) y al cierre de la corrida', () => {
    const r = alcanzables(nuevo, HAY_PDF, 1)
    for (const n of [SIN_PDF, CAMPANA, CABLE, VOLVIO, ESPERA, BRIEF, CIERRE]) expect(r.has(n), n).toBe(true)
  })
  it('la rama «con PDF» llega a lo mismo que antes (no se rompe el camino bueno)', () => {
    const a = alcanzables(antes, HAY_PDF, 0); const n = alcanzables(nuevo, HAY_PDF, 0)
    for (const x of a) expect(n.has(x), x).toBe(true)
  })
  it('la alarma «sin PDF» se conserva: el aviso y la campana siguen existiendo y siguen conectados', () => {
    expect(nuevo.connections[SIN_PDF]?.main?.[0]?.[0]?.node).toBe(CAMPANA); expect(nuevo.connections[CAMPANA]?.main?.[0]?.[0]?.node).toBe(CABLE)
  })
})

describe('2 · un plan con pendientes espera a Emilio', () => {
  /** evalúa la condición REAL del IF con un `$` mínimo */
  const espera = (con_pendientes: unknown) => {
    const expr = String(nodo(nuevo, ESPERA).parameters.conditions.conditions[0].leftValue).replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')
    return new Function('$', `return (${expr})`)((n: string) => { if (n !== '¿Llegó la vuelta?') throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: { con_pendientes } }) } })
  }
  it('con pendientes (true exacto) el IF dice «espera»; sin pendientes, ausente, texto o número NO esperan', () => {
    expect(espera(true)).toBe(true)
    for (const v of [false, undefined, null, 'true', 1]) expect(espera(v), String(v)).toBe(false)
  })
  it('el sobre del brief SOLO cuelga de la salida «sin pendientes» del IF; la salida «con pendientes» no lleva a ningún lado', () => {
    const c = nuevo.connections[ESPERA].main!
    expect(c[0]).toEqual([]); expect(c[1].map((t) => t.node)).toEqual([BRIEF])
    expect(nuevo.connections[VOLVIO].main![0].map((t) => t.node).sort()).toEqual([ESPERA, 'V9 · armar el cierre'].sort())
    expect(alcanzables(nuevo, ESPERA, 0).size).toBe(0)
  })
  it('con pendientes la corrida igual cierra bien (el cierre de la corrida no depende del brief)', () => {
    const sinBrief = alcanzables(nuevo, VOLVIO, undefined, [ESPERA]); expect(sinBrief.has(CIERRE)).toBe(true); expect(sinBrief.has(BRIEF)).toBe(false)
  })
})

describe('3 · el aviso de la bandeja lleva lo que hace falta para pedir el parte después', () => {
  const correr = (v: Record<string, unknown>, body: Record<string, unknown> | null) => {
    const f = new Function('$', nodo(nuevo, AVISO).parameters.jsCode as string)
    const $ = (n: string) => {
      if (n === '¿Llegó la vuelta?') return { first: () => ({ json: v }) }
      if (n === 'Guardar el plan') return { first: () => ({ json: { id: 'plan-1' } }) }
      if (n === 'Webhook · planeacion') { if (body === null) throw new Error('sin webhook'); return { first: () => ({ json: { body } }) } }
      throw new Error('nodo no ejecutado: ' + n)
    }
    return f($) as Array<{ json: { cuerpo: Record<string, any> } }>
  }
  const V = { con_pendientes: true, client_id: 'c-1', client_name: 'Zero Risk', pendientes: 'P3, P4', estado_del_plan: 'con_pendientes', chequeo_del_plan: { marcas: ['P3'] } }
  it('el payload trae el viaje, el tenant, el seco y la correlación del sobre que recibió la planeación', () => {
    const [{ json }] = correr(V, { _journey_id: 'j-7', tenant_id: 't-7', dry_run: false, _sala_correlation_id: 'corr-7' })
    expect(json.cuerpo.payload).toMatchObject({ plan_id: 'plan-1', journey_id: 'j-7', tenant_id: 't-7', dry_run: false, correlation_id: 'corr-7', para_el_cliente: false })
    expect(json.cuerpo).toMatchObject({ type: 'plan_con_pendientes', client_id: 'c-1', output_id: 'plan-1' })
  })
  it('sin tenant usa el cliente; `dry_run` solo con true exacto; un sobre ilegible deja los campos en null (no rompe el aviso)', () => {
    const [{ json: a }] = correr(V, { _journey_id: 'j-7', client_id: 'c-1', dry_run: 'true' }); expect(a.cuerpo.payload).toMatchObject({ tenant_id: 'c-1', dry_run: false })
    const [{ json: b }] = correr(V, null); expect(b.cuerpo.payload).toMatchObject({ journey_id: null, tenant_id: null, dry_run: false, correlation_id: null })
  })
  it('sin pendientes no sale ningún elemento (igual que antes)', () => { expect(correr({ ...V, con_pendientes: false }, {})).toEqual([]) })
})

describe('lo que cambia en el flujo: solo lo previsto', () => {
  it('el constructor, aplicado al flujo de antes, reproduce el preparado byte a byte (el linaje no se pierde)', async () => {
    const { construirFlujo } = await import('../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-cadena-sigue-sola-2026-10-20.mjs')
    expect(JSON.stringify(construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => construirFlujo(nuevo)).toThrow(/ya trae/)
  })
  it('un nodo nuevo (el IF), el aviso, y tres conexiones; nada más', () => {
    const noms = (f: Flujo) => f.nodes.map((n) => n.name)
    expect(noms(nuevo).filter((n) => !noms(antes).includes(n))).toEqual([ESPERA]); expect(noms(antes).filter((n) => !noms(nuevo).includes(n))).toEqual([])
    const distintos = antes.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(nuevo, n.name))).map((n) => n.name); expect(distintos).toEqual([AVISO])
    const claves = new Set([...Object.keys(antes.connections), ...Object.keys(nuevo.connections)])
    const cambian = [...claves].filter((k) => JSON.stringify(antes.connections[k]) !== JSON.stringify(nuevo.connections[k])).sort()
    expect(cambian).toEqual([CAMPANA, ESPERA, VOLVIO].sort())
  })
  it('no lleva llaves pegadas', () => { expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/) })
})
