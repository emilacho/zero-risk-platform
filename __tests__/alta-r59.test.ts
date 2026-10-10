/**
 * Relevo 59 · alta r59: (1) own_handles en «Persist Client»; (2) cada INTENTO del re-descubrimiento tiene su propia ventana de sondeos (R1 de CC#3); (3) mensajes con el tope real.
 * Sin n8n, sin llamadas reales: el sub-grafo [RD] se recorre con las condiciones REALES de los nodos.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type Cond = { leftValue: string; rightValue: unknown; operator: { type: string; operation: string } }
type Nodo = { name: string; type: string; parameters: { conditions?: { conditions: Cond[] }; jsonBody?: string; jsCode?: string } & Record<string, unknown> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean }
const leer = (f: string): Flujo => JSON.parse(fs.readFileSync(f, 'utf8'))
const R57 = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r57.json')
const R59 = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r59.json')

type Resp = { ready: boolean; dispatch_status: string | null }
/** recorre el sub-grafo [RD] con las condiciones reales; devuelve cuántas llamadas al agente se pagan y cómo termina */
function recorrer(w: Flujo, respuestas: Resp[]): { llamadas: number; fin: 'LISTO' | 'TIMEOUT' | 'PARADA_REINTENTOS' | 'SIN_FIN'; sondeos: number } {
  const nodo = (n: string) => w.nodes.find((x) => x.name === n)!
  const sig = (n: string, salida: number) => w.connections[n]?.main?.[salida]?.[0]?.node
  const corridas: Record<string, number> = {}
  let llamadas = 0, sondeos = 0, intento = 0, ultima: Resp = { ready: false, dispatch_status: 'running' }
  const evalIf = (n: string): boolean => {
    const c = nodo(n).parameters.conditions!.conditions
    return c.every((k) => {
      const e = k.leftValue.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')
      const v = e === '$json.ready' ? ultima.ready : e === '$json.dispatch_status' ? ultima.dispatch_status : e === '$runIndex' ? corridas[n] - 1 : e.includes('rd_attempt') ? intento : undefined
      if (v === undefined) throw new Error('expresión no prevista en ' + n + ': ' + e)
      // el valor de la derecha puede ser una expresión con el intento (ventana por intento)
      const rv = typeof k.rightValue === 'string' && k.rightValue.includes('rd_attempt') ? 35 * (intento + 1) : (k.rightValue as number)
      const op = k.operator
      if (op.type === 'boolean') return op.operation === 'true' ? v === true : v === false
      if (op.type === 'string') return v === k.rightValue
      if (op.type === 'number') return op.operation === 'lt' ? (v as number) < rv : op.operation === 'equals' ? v === rv : false
      throw new Error('operador no previsto ' + op.type)
    })
  }
  let actual: string | undefined = '[RD] Dispatch (fire+forget)'
  for (let paso = 0; paso < 6000 && actual; paso++) {
    corridas[actual] = (corridas[actual] ?? 0) + 1
    switch (actual) {
      case '[RD] Dispatch (fire+forget)': case '[RD] Re-fire Dispatch': case '[RD] Re-dispatch tras error': llamadas++; actual = sig(actual, 0); break
      case '[RD] Preparar reintento': intento++; actual = sig(actual, 0); break
      case '[RD] Poll Status': ultima = respuestas[Math.min(sondeos, respuestas.length - 1)]; sondeos++; actual = sig(actual, 0); break
      case '[RD] Poll Wait 20s': case '[RD] Sello de intento': actual = sig(actual, 0); break
      case '[RD] Poll Ready?': case '[RD] ¿Error declarado?': case '[RD] Flake Check': case '[RD] Poll Retry Guard': case '[RD] ¿Quedan reintentos?': actual = sig(actual, evalIf(actual) ? 0 : 1); break
      case 'Re-discovery INLINE (onboarding-specialist)': return { llamadas, fin: 'LISTO', sondeos }
      case '[RD] Poll Timeout': return { llamadas, fin: 'TIMEOUT', sondeos }
      case '[RD] Parada ruidosa · reintentos agotados': return { llamadas, fin: 'PARADA_REINTENTOS', sondeos }
      default: throw new Error('nodo no previsto en el recorrido: ' + actual)
    }
  }
  return { llamadas, fin: 'SIN_FIN', sondeos }
}
const rep = (n: number, r: Resp): Resp[] => Array.from({ length: n }, () => r)
const EN_CURSO: Resp = { ready: false, dispatch_status: 'running' }
const ACEPTADO: Resp = { ready: false, dispatch_status: 'accepted' }
const LISTO: Resp = { ready: true, dispatch_status: 'completed' }
const ERROR: Resp = { ready: false, dispatch_status: 'error' }

describe('r59 · cambia SOLO cuatro nodos respecto de r57', () => {
  it('Persist, guardia, parada ruidosa y timeout; mismos nodos y mismos cables; sigue apagada', () => {
    const a = new Map(R57.nodes.map((n) => [n.name, n])), b = new Map(R59.nodes.map((n) => [n.name, n]))
    expect([...b.keys()]).toEqual([...a.keys()])
    expect([...b.keys()].filter((k) => JSON.stringify(b.get(k)) !== JSON.stringify(a.get(k))).sort()).toEqual(['Persist Client to Supabase', '[RD] Parada ruidosa · reintentos agotados', '[RD] Poll Retry Guard', '[RD] Poll Timeout'].sort())
    expect(JSON.stringify(R59.connections)).toBe(JSON.stringify(R57.connections))
    expect(R59.active).toBe(false)
  })
  it('los mensajes dicen el tope real', () => {
    const p = R59.nodes.find((n) => n.name === '[RD] Parada ruidosa · reintentos agotados')!.parameters.jsCode!
    expect(p).toContain("1 + ' reintento quedó agotado"); expect(p).not.toContain("2 + ' reintentos")
    expect(R59.nodes.find((n) => n.name === '[RD] Poll Timeout')!.parameters.jsCode!).toContain('POR INTENTO')
  })
})

describe('R1 · cada intento tiene su propia ventana', () => {
  it('falla tarde (sondeo 25) y la 2.ª llamada tarda 20 sondeos (≈ 7 min): r59 LLEGA; r57 moría por timeout', () => {
    const resp = [...rep(24, EN_CURSO), ERROR, ...rep(19, EN_CURSO), LISTO]
    expect(recorrer(R59, resp)).toMatchObject({ llamadas: 2, fin: 'LISTO' })
    expect(recorrer(R57, resp)).toMatchObject({ llamadas: 2, fin: 'TIMEOUT' })
  })
  it('la 2.ª llamada perdida de verdad: espera SU ventana y falla ruidoso, sin una 3.ª llamada', () => {
    expect(recorrer(R59, [ERROR, ...rep(200, ACEPTADO)])).toMatchObject({ llamadas: 2, fin: 'TIMEOUT' })
  })
  it('todo lo del arreglo anterior sigue igual: lento = 1 llamada; falló una vez = 2; falló dos = para con 2; perdido = 1 y timeout a los 36', () => {
    expect(recorrer(R59, [...rep(30, ACEPTADO), LISTO])).toMatchObject({ llamadas: 1, fin: 'LISTO' })
    expect(recorrer(R59, [ERROR, ...rep(3, EN_CURSO), LISTO])).toMatchObject({ llamadas: 2, fin: 'LISTO' })
    expect(recorrer(R59, [ERROR, ERROR])).toMatchObject({ llamadas: 2, fin: 'PARADA_REINTENTOS' })
    const perdido = recorrer(R59, rep(100, ACEPTADO))
    expect(perdido).toMatchObject({ llamadas: 1, fin: 'TIMEOUT' }); expect(perdido.sondeos).toBe(36)
  })
})

describe('own_handles en el cuerpo de «Persist Client to Supabase»', () => {
  const cuerpoPara = (trato: Record<string, unknown>): Record<string, unknown> => {
    const expr = R59.nodes.find((n) => n.name === 'Persist Client to Supabase')!.parameters.jsonBody!.replace(/^=\{\{/, '').replace(/\}\}$/, '')
    const $ = () => ({ first: () => ({ json: trato }) })
    return JSON.parse(new Function('$', '$workflow', '$execution', `return (${expr.trim()})`)($, { id: 'wf' }, { id: 'ex' }) as string)
  }
  const base = { client_id: 'c-1', client_name: 'Clinica Ejemplo', website: 'https://www.clinicaejemplo.test', industry: 'salud', _defaults_aplicados: [] }
  it('con la cuenta en el trato (instagram_handle o instagram): viaja como own_handles.instagram', () => {
    expect(cuerpoPara({ ...base, instagram_handle: '@clinicaejemplo' }).own_handles).toEqual({ instagram: '@clinicaejemplo' })
    expect(cuerpoPara({ ...base, instagram: 'https://www.instagram.com/clinicaejemplo/' }).own_handles).toEqual({ instagram: 'https://www.instagram.com/clinicaejemplo/' })
  })
  it('sin la cuenta: la clave NO viaja', () => { expect(cuerpoPara(base)).not.toHaveProperty('own_handles') })
  it('el resto del cuerpo es idéntico con o sin la cuenta', () => {
    const { own_handles: _o, ...con } = cuerpoPara({ ...base, instagram_handle: '@x' })
    void _o
    expect(con).toEqual(cuerpoPara(base))
  })
})
