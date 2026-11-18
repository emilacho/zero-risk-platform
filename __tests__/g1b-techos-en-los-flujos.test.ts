/** 18-nov · G1b «nada se recorta» (CC5): los flujos n8n nuevos salen del VIVO con solo los reemplazos declarados, y ninguno queda en el valor viejo */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { MODOS_DE_RAZONAMIENTO_DEL_PEDIDO } from '@/lib/razonamiento'
import { TOPE_REAL_DEL_PEDIDO } from '@/lib/limites-de-tamano'
import { pedidoDeAgente } from '@/lib/oficina/mesa/pedidos'
import { armarPedidoDeAgente } from '@/lib/jefatura/revision/pedidos'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/g1b-techos')
const IDS = ['bTbWL9lUvQCfStAz', 'o8qaF7bI0PKv2XGZ', 'lVCLzxQCKNkd3uS0', 'PQdIgbuFexuBsoh8', 'BNXqlaX1oHSfZIpF', 'ssLtwYPt7zxuvnM2', 'X9F0zp6LQ2xGEYVS']
type Nodo = { name: string; parameters?: { jsCode?: string } & Record<string, unknown> } & Record<string, unknown>
type Flujo = { nodes: Nodo[] } & Record<string, unknown>
const leer = (c: string, id: string): Flujo => JSON.parse(fs.readFileSync(path.join(DIR, c, `${id}.json`), 'utf8'))
const { REEMPLAZOS } = createRequire(import.meta.url)(path.join(DIR, 'reemplazos.cjs')) as { REEMPLAZOS: Record<string, unknown> }

describe('G1b · los flujos nuevos', () => {
  it.each(IDS)('%s · fuera del código tocado, el flujo nuevo es IGUAL al vivo (nodos, conexiones, ajustes)', (id) => {
    const vivo = leer('vivo', id)
    const nuevo = leer('nuevo', id)
    const sinCodigo = (f: Flujo) => ({ ...f, nodes: f.nodes.map((n) => ({ ...n, parameters: { ...n.parameters, jsCode: undefined } })) })
    expect(sinCodigo(nuevo)).toEqual(sinCodigo(vivo))
  })
  it.each(IDS)('%s · cada nodo tocado compila y lo único que cambió es lo declarado', (id) => {
    const vivo = leer('vivo', id)
    const nuevo = leer('nuevo', id)
    let tocados = 0
    nuevo.nodes.forEach((n, i) => {
      const antes = vivo.nodes[i].parameters?.jsCode
      const despues = n.parameters?.jsCode
      if (antes === despues) return
      tocados++
      expect(() => new Function(`return (async function(){${despues}\n})`), n.name).not.toThrow()
      // deshacer lo declarado devuelve el vivo exacto
      const regla = REEMPLAZOS[id]
      let revertido = despues as string
      if (typeof regla === 'string') revertido = revertido.split('1490000').join('590000')
      else for (const [a, b] of (regla as Record<string, [string, string][]>)[n.name]) revertido = revertido.split(b).join(a)
      expect(revertido, n.name).toBe(antes)
    })
    expect(tocados).toBeGreaterThan(0)
  })
  it('🔴 ningún flujo nuevo manda razonamiento apagado ni conserva el tope de 590.000', () => {
    for (const id of IDS) {
      const t = JSON.stringify(leer('nuevo', id).nodes.map((n) => n.parameters?.jsCode ?? ''))
      expect(t, id).not.toMatch(/thinking_mode: 'disabled'|\|\| 'disabled'|let razonamiento = 'disabled'/)
      expect(t, id).not.toContain('590000')
    }
  })
  it('🔴 el tope de 1.490.000 de los flujos queda por debajo del tope del pedido de la plataforma', () => {
    expect(1_490_000).toBeLessThan(TOPE_REAL_DEL_PEDIDO)
  })
  it('🔴 (🟡 d3 de CC6 en #1183) el turno de la MESA pide razonamiento al máximo, sea pieza o cadena', () => {
    const mesa = { agente: 'a', task: 't', encargo_id: 'enc-1', client_id: 'c', dry_run: true, paso: 'p', reserva_usd: 1 }
    for (const es_pieza of [true, false, undefined]) expect(pedidoDeAgente({ ...mesa, es_pieza }).thinking_mode, String(es_pieza)).toBe('maximo')
  })
  it('🔴 (🟡 s17 de CC7) el pedido de la JEFATURA pide razonamiento al máximo', () => {
    const p = armarPedidoDeAgente({ agente: 'a', task: 't', esquema: 'e', indicacion: 'i', paso: 'p', revision_id: 'r', dispatch_key: 'd', max_budget_usd: 1, dry_run: true, client_id: 'c' } as never)
    expect(p.thinking_mode).toBe('maximo')
  })
  it('🔴 el sobre del brief acepta exactamente los niveles de la plataforma, más «completo»', () => {
    const t = fs.readFileSync(path.join(process.cwd(), 'scripts/worker-staging/brief-parte-de-trabajo/n0-sobre.js'), 'utf8')
    const lista = /!\[([^\]]+)\]\.includes\(body\.razonamiento\)/.exec(t)?.[1].split(',').map((x) => x.trim().replace(/'/g, ''))
    expect(lista).toEqual([...MODOS_DE_RAZONAMIENTO_DEL_PEDIDO, 'completo'])
  })
})
