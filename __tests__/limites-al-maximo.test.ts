/** Firma de Emilio 02-nov: los límites técnicos van al máximo. Una ruta nueva o rebajada por debajo del tope del plan rompe esta prueba, salvo las que están atadas a otro actor. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TOPE_DEL_PLAN = 800
const CEREBRO = /^(brain|client-brain|cerebro|portero)\//
// su espera está atada al nodo de n8n que las llama (hay pruebas de eso): suben juntas con el flujo, no antes
const ATADAS_A_N8N = ['jefatura/revisiones', 'jefatura/turnos', 'jefatura/vigia', 'manual/opinion', 'oficina/encargos', 'oficina/turnos', 'oficina/vigia']

const raiz = path.join(process.cwd(), 'src/app/api')
const rutas = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name)
  return e.isDirectory() ? rutas(p) : e.name === 'route.ts' ? [p] : []
})
const nombre = (p: string): string => path.relative(raiz, path.dirname(p)).replace(/\\/g, '/')
const leer = (rel: string): string => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('los límites técnicos están al máximo', () => {
  it('🔴 ninguna ruta declara menos que el tope del plan, salvo las del Cerebro y las atadas a n8n', () => {
    const bajas = rutas(raiz).filter((p) => {
      const m = /export const maxDuration = (\d+)/.exec(fs.readFileSync(p, 'utf8'))
      const r = nombre(p)
      return m && Number(m[1]) < TOPE_DEL_PLAN && !CEREBRO.test(`${r}/`) && !ATADAS_A_N8N.includes(r)
    }).map(nombre)
    expect(bajas).toEqual([])
  })
  it('🔴 las atadas a n8n siguen existiendo: la lista no se pudre', () => {
    for (const r of ATADAS_A_N8N) expect(fs.existsSync(path.join(raiz, r, 'route.ts')), r).toBe(true)
  })
  it('🔴 el corredor recibe más que el pedido más grande permitido', () => {
    expect(leer('services/agent-runner/src/index.ts')).toContain("express.json({ limit: '4mb' })")
  })
  it('🔴 la salida forzada de un empleado no se queda corta', () => {
    const t = leer('services/agent-runner/src/lib/forced-emit-messages.ts')
    expect(t.match(/max_tokens: \d+/g)).toEqual(['max_tokens: 20000', 'max_tokens: 20000', 'max_tokens: 20000'])
  })
  it('🔴 la puerta vieja de agentes espera lo mismo que la nueva', () => {
    expect(leer('src/app/api/agents/run/route.ts')).toContain('AbortSignal.timeout(790_000)')
  })
})
