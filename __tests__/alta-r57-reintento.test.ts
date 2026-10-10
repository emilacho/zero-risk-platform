/**
 * Relevo 57 · el reintento del re-descubrimiento de la alta: SOLO si la llamada FALLÓ, nunca por lentitud. Sin n8n, sin llamadas reales.
 * Se recorre el sub-grafo [RD] con las condiciones REALES de los nodos (las IF de la alta) y respuestas de estado guionadas.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type Cond = { leftValue: string; rightValue: unknown; operator: { type: string; operation: string } }
type Nodo = { name: string; type: string; parameters: { conditions?: { conditions: Cond[] } } & Record<string, unknown> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }>; active?: boolean }
const leer = (f: string): Flujo => JSON.parse(fs.readFileSync(f, 'utf8'))
const R54 = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r54.json')
const R57 = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r57.json')

describe('r57 · cambia SOLO el sub-grafo del reintento', () => {
  it('quita Flake Check y Re-fire; el resto de nodos es idéntico salvo el tope; sigue apagada', () => {
    const n54 = new Map(R54.nodes.map((n) => [n.name, n])), n57 = new Map(R57.nodes.map((n) => [n.name, n]))
    expect([...n54.keys()].filter((k) => !n57.has(k)).sort()).toEqual(['[RD] Flake Check', '[RD] Re-fire Dispatch'])
    expect([...n57.keys()].filter((k) => !n54.has(k))).toEqual([])
    const cambian = [...n57.keys()].filter((k) => JSON.stringify(n57.get(k)) !== JSON.stringify(n54.get(k)))
    expect(cambian).toEqual(['[RD] ¿Quedan reintentos?'])
    expect(R57.active).toBe(false)
  })
  it('solo cambia un cable (la salida «no» de ¿Error declarado?) y los dos de los nodos quitados', () => {
    const claves = Object.keys({ ...R54.connections, ...R57.connections })
    const dif = claves.filter((k) => JSON.stringify(R54.connections[k]) !== JSON.stringify(R57.connections[k])).sort()
    expect(dif).toEqual(['[RD] Flake Check', '[RD] Re-fire Dispatch', '[RD] ¿Error declarado?'])
    expect(R57.connections['[RD] ¿Error declarado?'].main[1].map((x) => x.node)).toEqual(['[RD] Poll Retry Guard'])
    expect(R57.connections['[RD] ¿Error declarado?'].main[0].map((x) => x.node)).toEqual(['[RD] ¿Quedan reintentos?'])
  })
  it('nadie apunta ya a los nodos quitados', () => {
    for (const v of Object.values(R57.connections)) for (const a of v.main) for (const x of a) expect(['[RD] Flake Check', '[RD] Re-fire Dispatch']).not.toContain(x.node)
  })
})

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
      const op = k.operator
      if (op.type === 'boolean') return op.operation === 'true' ? v === true : v === false
      if (op.type === 'string') return v === k.rightValue
      if (op.type === 'number') return op.operation === 'lt' ? (v as number) < (k.rightValue as number) : op.operation === 'equals' ? v === k.rightValue : false
      throw new Error('operador no previsto ' + op.type)
    })
  }
  let actual: string | undefined = '[RD] Dispatch (fire+forget)'
  for (let paso = 0; paso < 4000 && actual; paso++) {
    corridas[actual] = (corridas[actual] ?? 0) + 1
    switch (actual) {
      case '[RD] Dispatch (fire+forget)': llamadas++; actual = sig(actual, 0); break
      case '[RD] Re-fire Dispatch': llamadas++; actual = sig(actual, 0); break
      case '[RD] Re-dispatch tras error': llamadas++; actual = sig(actual, 0); break
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

describe('caso LENTO: nunca se paga dos veces', () => {
  it('en curso 30 sondeos y luego listo → UNA llamada', () => {
    expect(recorrer(R57, [...rep(30, EN_CURSO), LISTO])).toMatchObject({ llamadas: 1, fin: 'LISTO' })
  })
  it('«accepted» 30 sondeos (el estado que antes disparaba el re-fire en el sondeo nº 6) y luego listo → UNA llamada', () => {
    expect(recorrer(R57, [...rep(30, ACEPTADO), LISTO])).toMatchObject({ llamadas: 1, fin: 'LISTO' })
  })
  it('control: el alta r54 (la de hoy) SÍ volvía a pagar en ese caso (2 llamadas)', () => {
    expect(recorrer(R54, [...rep(30, ACEPTADO), LISTO])).toMatchObject({ llamadas: 2, fin: 'LISTO' })
  })
  it('despacho perdido que nunca llega: espera hasta su tope y FALLA ruidoso con UNA llamada', () => {
    const r = recorrer(R57, rep(100, ACEPTADO))
    expect(r).toMatchObject({ llamadas: 1, fin: 'TIMEOUT' })
    expect(r.sondeos).toBe(36) // 36 vueltas de 20 s ≈ 12 min
  })
  it('lento hasta justo antes del tope y luego listo: llega y no paga de más', () => {
    expect(recorrer(R57, [...rep(35, EN_CURSO), LISTO])).toMatchObject({ llamadas: 1, fin: 'LISTO' })
  })
})

describe('caso FALLÓ: se reintenta, una sola vez', () => {
  it('la primera llamada falla y la segunda sale bien → 2 llamadas', () => {
    expect(recorrer(R57, [ERROR, ...rep(3, EN_CURSO), LISTO])).toMatchObject({ llamadas: 2, fin: 'LISTO' })
  })
  it('falla la primera y también la segunda → se PARA ruidoso con 2 llamadas (antes eran hasta 3)', () => {
    expect(recorrer(R57, [ERROR, ERROR])).toMatchObject({ llamadas: 2, fin: 'PARADA_REINTENTOS' })
    expect(recorrer(R54, [ERROR, ERROR, ERROR])).toMatchObject({ llamadas: 3, fin: 'PARADA_REINTENTOS' })
  })
  it('sin fallo y sin lentitud: una llamada', () => {
    expect(recorrer(R57, [LISTO])).toMatchObject({ llamadas: 1, fin: 'LISTO' })
  })
})
