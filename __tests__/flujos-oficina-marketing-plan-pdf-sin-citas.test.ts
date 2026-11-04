/**
 * 04-nov · «plan sin rótulos internos» · el PDF del plan sale sin citas internas [D12] (misma regla que el dashboard #276). Todo en seco (US$ 0): corre la expresión real del nodo.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { construirPdfSinCitas } from '../scripts/ops/oficina-marketing/plan-pdf-sin-citas.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const DIR = join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos')
const cargar = (archivo: string) => { const j = JSON.parse(readFileSync(join(DIR, archivo), 'utf8')); return (j.workflow || j) as Flujo }
const PLAN = cargar('X9F0zp6LQ2xGEYVS-antes-de-pausa-finanzas-2026-11-04.json')
const MITAD = cargar(readdirSync(DIR).filter((x) => x.startsWith('mdhgiJeCkLV2bTxL-antes-de-sin-error-crudo')).sort()[0])
const PDF = 'Plan → Drive (PDF)'

/** corre la expresión del cuerpo del nodo con un texto dado y devuelve el `texto` que viajaría a Drive */
function textoQueViaja(f: Flujo, texto: string): string {
  const cuerpo = (f.nodes.find((x) => x.name === PDF) as Nodo).parameters.jsonBody as string
  const expr = cuerpo.replace(/^=\{\{/, '').replace(/\}\}$/, '')
  const nodoJson = { client_id: 'c', client_name: 'N', texto, con_pendientes: false }
  const $ = (n: string) => ({ first: () => ({ json: n === 'Plan vigente' ? { jef_vigente: nodoJson } : nodoJson }) })
  return JSON.parse(new Function('$', 'return ' + expr)($)).texto
}

describe('plan · el PDF sale sin citas internas', () => {
  for (const [nombre, base] of [['plan X9F0', PLAN], ['segunda mitad mdhgi', MITAD]] as const) {
    it(`${nombre}: quita [D12] y [D9, D55]; deja lo demás igual`, () => {
      const f = structuredClone(base); construirPdfSinCitas(f)
      expect(textoQueViaja(f, 'Subir el ticket [D12] y revisar [D9, D55].\nNada [Donde] ni [D] ni [D12a] ni [Dx].')).toBe('Subir el ticket y revisar.\nNada [Donde] ni [D] ni [D12a] ni [Dx].')
      expect(textoQueViaja(f, 'sin citas')).toBe('sin citas')
      expect(textoQueViaja(f, '')).toBe('')
    })
    it(`${nombre}: solo cambia el cuerpo de «${PDF}»`, () => {
      const f = structuredClone(base); construirPdfSinCitas(f)
      expect(f.nodes.length).toBe(base.nodes.length)
      expect(f.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(base.nodes.find((y) => y.name === n.name))).map((n) => n.name)).toEqual([PDF])
      expect(f.connections).toEqual(base.connections)
      // antes: las citas viajaban
      expect(textoQueViaja(base, 'a [D12] b')).toBe('a [D12] b')
    })
  }
  it('si el cuerpo no tiene la forma esperada, se detiene en vez de aplicar a ciegas', () => {
    const f = structuredClone(PLAN); const n = f.nodes.find((x) => x.name === PDF) as Nodo
    n.parameters.jsonBody = String(n.parameters.jsonBody).replace('.texto || \'\')', '.texto)')
    expect(() => construirPdfSinCitas(f)).toThrow(/forma esperada/)
  })
})
