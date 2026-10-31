/**
 * La mesa y la oficina NO pasan por el editor de run-sdk (31-oct, ADR-020: los jueces de la jefatura quedan FUERA de la mesa).
 * Todo pedido a un agente lleva `x-skip-editor-middleware: 1`; el flujo de n8n también la fija en su nodo HTTP.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EDITOR_WHITELIST } from '../../editor-routing'
import { CABECERA_SALTAR_EDITOR } from '../../cadena/constantes'
import { pedidoDeAgente } from '../mesa/pedidos'
import { pedidoDe } from '../orquestador'

const LEE = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const AGENTES_DEL_EDITOR = Object.keys(EDITOR_WHITELIST)

describe('la cabecera que evita el editor va en todo pedido de agente', () => {
  it.each(AGENTES_DEL_EDITOR)('mesa · %s', (agente) => {
    const p = pedidoDeAgente({ agente, task: 't', encargo_id: 'e', client_id: 'c', dry_run: true, paso: 'p', reserva_usd: 1 })
    expect(p.headers_requeridos).toEqual({ [CABECERA_SALTAR_EDITOR]: '1' })
  })
  it.each(AGENTES_DEL_EDITOR)('oficina · %s', (agente) => {
    const enc = { id: 'e', client_id: 'c', dry_run: true } as never
    const paso = { clave: 'x', tipo: 'agente', tope_usd: 1 } as never
    const p = pedidoDe(enc, { indicaciones: {} } as never, paso, agente, { task: 't', images: [], esquema: 'e' }, {} as never)
    expect(p.headers_requeridos).toEqual({ [CABECERA_SALTAR_EDITOR]: '1' })
  })
  it('la cabecera es la misma que usa la cadena', () => { expect(CABECERA_SALTAR_EDITOR).toBe('x-skip-editor-middleware') })

  it('estática: cada constructor de pedido con workflow_hint «oficina · turno» declara la cabecera', () => {
    for (const f of ['src/lib/oficina/mesa/pedidos.ts', 'src/lib/oficina/orquestador.ts']) {
      const t = LEE(f)
      const n = (t.match(/workflow_hint: 'oficina · turno'/g) ?? []).length
      const h = (t.match(/headers_requeridos: \{ \[CABECERA_SALTAR_EDITOR\]: '1' \}/g) ?? []).length
      expect(n).toBeGreaterThan(0)
      expect(h).toBe(n)
    }
  })
})

describe('el flujo de n8n de la mesa (respaldo en el repositorio)', () => {
  const nodo = (archivo: string) => {
    const f = JSON.parse(LEE(archivo)) as { nodes: Array<{ name: string; parameters: { headerParameters?: { parameters: Array<{ name: string; value: string }> } } }> }
    return f.nodes.find((n) => n.name === '② Agente (run-sdk)')!
  }
  const D = 'scripts/worker-staging/bTbWL9lUvQCfStAz/'
  it('ARREGLADO: el nodo run-sdk lleva la cabecera fija en 1', () => {
    const hs = nodo(D + 'turno-mesa-sin-editor-ARREGLADO.json').parameters.headerParameters!.parameters
    expect(hs.find((h) => h.name === CABECERA_SALTAR_EDITOR)?.value).toBe('1')
  })
  it('ANTES: no la llevaba (así se reprodujo el hallazgo)', () => {
    const hs = nodo(D + 'turno-mesa-sin-editor-ANTES.json').parameters.headerParameters!.parameters
    expect(hs.some((h) => h.name === CABECERA_SALTAR_EDITOR)).toBe(false)
  })
})
