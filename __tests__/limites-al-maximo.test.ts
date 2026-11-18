/** Firma de Emilio 02-nov: los límites técnicos van al máximo. Una ruta nueva o rebajada por debajo del tope del plan rompe esta prueba, salvo las que están atadas a otro actor. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TOPE_DEL_PLAN = 800
const CEREBRO = /^(brain|client-brain|cerebro|portero)\//
// su espera está atada al nodo de n8n que las llama (hay pruebas de eso): suben juntas con el flujo, no antes
const ATADAS_A_N8N = ['oficina/encargos']

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
    // 18-nov · G1 «nada se recorta»: las tres van al techo de cada modelo (128.000 en los de 1 M) y por flujo continuo
    expect(t.match(/max_tokens: [^,\n]+/g)).toEqual(Array(3).fill('max_tokens: techoDeSalidaDelModelo(args.model)'))
    expect(t.match(/await pedirRespuestaCompleta\(client, \{/g)).toHaveLength(3)
    expect(t).not.toMatch(/client\.messages\.create\(\{/)
  })
  it('🔴 18-nov G1 · el techo forzado es el máximo de cada modelo y va por flujo continuo', async () => {
    const m = await import('../services/agent-runner/src/lib/forced-emit-messages')
    for (const modelo of ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-sonnet-4-6', 'claude-opus-4-7', 'claude-opus-4-6']) expect(m.techoDeSalidaDelModelo(modelo), modelo).toBe(128000)
    expect(m.techoDeSalidaDelModelo('claude-haiku-4-5-20251001')).toBe(64000)
    // con un cliente que trae `stream` (el real), se usa el flujo continuo y NO `create`
    const mensaje = { content: [], usage: { input_tokens: 1, output_tokens: 2 } }
    const create = (): never => { throw new Error('no debía llamar a create') }
    let recibido: { max_tokens?: number } | undefined
    const cliente = { messages: { create, stream: (p: { max_tokens: number }) => { recibido = p; return { finalMessage: async () => mensaje } } } }
    const r = await m.pedirRespuestaCompleta(cliente as never, { model: 'claude-opus-5-5', max_tokens: 128000, messages: [{ role: 'user', content: 'x' }] })
    expect(r).toBe(mensaje)
    expect(recibido?.max_tokens).toBe(128000)
  })
  it('🔴 la puerta vieja de agentes espera lo mismo que la nueva', () => {
    expect(leer('src/app/api/agents/run/route.ts')).toContain('AbortSignal.timeout(790_000)')
  })
})
