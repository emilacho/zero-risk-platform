/**
 * EL CABLEADO DE LOS LÍMITES DE «MIRAR AFUERA» · `index.ts → runner → registro → servidor` · pruebas a costo cero · CC#1 · 2026-10-01 (PR #418 · recertificación CC#3: mutaciones N09 y N10 sin detectar).
 *
 * Antes sólo se probaba el servidor MCP arrancado DIRECTAMENTE con sus variables de entorno: si alguien rompía un eslabón del cableado, el cupo desaparecía EN SILENCIO mientras Vercel seguía validando y reenviando el campo.
 *   · N09 «el runner deja de pasar `mirarAfueraLimites` al registro» ⇒ ahora lo detecta la prueba ②
 *   · N10 «`index.ts` deja de pasar los límites al runner» ⇒ ahora lo detecta la prueba ③ (el corredor es una aplicación que escucha al importarse: se prueba su CONTRATO sobre el código y el lector real)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── un SDK falso: captura las opciones que recibe (entre ellas los servidores MCP que monta el registro) ──────────────────────────────────────────────────────────────
let opcionesRecibidas: Record<string, any> | null = null
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (p: { options: Record<string, unknown> }) => {
    opcionesRecibidas = p.options
    return (async function* () {
      yield { type: 'system', subtype: 'init', session_id: 's1' }
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'listo' }] } }
      yield { type: 'result', subtype: 'success', session_id: 's1', usage: { input_tokens: 10, output_tokens: 5 } }
    })()
  },
}))
function cadena(tabla: string): any {
  const q: any = {}
  for (const m of ['select', 'eq', 'or', 'in', 'gte', 'order', 'limit', 'is', 'neq']) q[m] = () => q
  q.maybeSingle = async () => ({ data: tabla === 'agents' ? { id: 'a1', name: 'campaign-brief-agent', identity_content: 'Eres el planificador.', model: 'claude-sonnet' } : null, error: null })
  q.single = q.maybeSingle
  for (const op of ['insert', 'upsert', 'update']) q[op] = () => q
  q.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: tabla === 'agents' ? null : [], error: null }).then(r)
  return q
}
vi.mock('../supabase', () => ({ getSupabaseAdmin: () => ({ from: (t: string) => cadena(t) }), getSupabase: () => ({}), supabase: null }))
vi.mock('../brain-enrichment', () => ({
  enrichSystemPromptWithClientBrain: async () => ({ brain_hit: false, brain_chunks_count: 0, brain_query_ms: 0, cost_usd: 0, enrichment: '', evidence_refs: [], grounding: 'prose_only' }),
}))
vi.mock('../braintrust', () => ({ instrumentClaudeAgentSdk: (sdk: unknown) => sdk, flushBraintrust: async () => {} }))

const { runAgentViaSDK } = await import('../agent-sdk-runner')
const { limitesDelPedido, ecoDeLimites, CAPACIDADES_DEL_CORREDOR, LIMITE_MAXIMO_DE_PEDIDOS } = await import('../mirar-afuera-pedido')

const CUATRO = ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador']
const corrida = (extra: Record<string, unknown> = {}) =>
  runAgentViaSDK({ agentName: 'campaign-brief-agent', task: 'trivial', clientId: 'c1', workflowId: 'wf', workflowExecutionId: '1', stepName: 'brief', forceRestart: true, dryRun: false, ...extra } as never)
beforeEach(() => { opcionesRecibidas = null })

describe('② N09 · el RUNNER pasa los límites al registro de servidores (lo que recibe el SDK)', () => {
  it('🔴 con límites en la entrada: el servidor «mirar-afuera» que monta el SDK lleva las dos variables', async () => {
    await corrida({ mirarAfueraLimites: { maxPedidos: 4, permitidos: CUATRO } })
    const s = opcionesRecibidas?.mcpServers?.['mirar-afuera']
    expect(s, 'el servidor mirar-afuera debe estar montado').toBeDefined()
    expect(s.env.MIRAR_AFUERA_MAX_PEDIDOS).toBe('4')
    expect(s.env.MIRAR_AFUERA_PERMITIDOS).toBe(CUATRO.join(','))
  })
  it('CONTROL POSITIVO: sin límites el servidor se monta como siempre (ni existen las claves)', async () => {
    await corrida({})
    const s = opcionesRecibidas?.mcpServers?.['mirar-afuera']
    expect(s).toBeDefined()
    expect(Object.keys(s.env).sort()).toEqual(['AGENT_SLUG', 'APIFY_SERVICE_URL', 'CLIENT_ID', 'PATH'])
  })
  it('sólo el cupo, o sólo las opciones: cada uno viaja solo', async () => {
    await corrida({ mirarAfueraLimites: { maxPedidos: 2, permitidos: null } })
    expect(Object.keys(opcionesRecibidas!.mcpServers['mirar-afuera'].env)).toContain('MIRAR_AFUERA_MAX_PEDIDOS')
    expect(Object.keys(opcionesRecibidas!.mcpServers['mirar-afuera'].env)).not.toContain('MIRAR_AFUERA_PERMITIDOS')
    await corrida({ mirarAfueraLimites: { maxPedidos: null, permitidos: ['instagram'] } })
    expect(Object.keys(opcionesRecibidas!.mcpServers['mirar-afuera'].env)).toContain('MIRAR_AFUERA_PERMITIDOS')
    expect(Object.keys(opcionesRecibidas!.mcpServers['mirar-afuera'].env)).not.toContain('MIRAR_AFUERA_MAX_PEDIDOS')
  })
})

describe('③ N10 · `index.ts` lee los límites del pedido y se los PASA al runner', () => {
  const index = readFileSync(resolve(__dirname, '..', '..', 'index.ts'), 'utf8')
  const bloqueInput = (() => { const a = index.indexOf('const input: AgentRunInput = {'); return index.slice(a, index.indexOf('\n  }\n', a)) })()
  it('🔴 la entrada del runner incluye `mirarAfueraLimites` tomado del pedido VALIDADO (si alguien lo quita, esto lo grita)', () => {
    expect(bloqueInput).toMatch(/\.\.\.\(limitesMirar\.valor \? \{ mirarAfueraLimites: limitesMirar\.valor \} : \{\}\)/)
    expect(index).toMatch(/const limitesMirar = limitesDelPedido\(body as unknown as Record<string, unknown>, ctxObj as Record<string, unknown>\)/)
  })
  it('un límite mal escrito se rechaza con 400 ANTES de armar la entrada', () => {
    const iRechazo = index.indexOf("code: 'E-MIRAR-LIMITES-INVALID'")
    expect(iRechazo).toBeGreaterThan(index.indexOf('const limitesMirar = limitesDelPedido('))
    expect(iRechazo).toBeLessThan(index.indexOf('const input: AgentRunInput = {'))
  })
  it('el acuse 202 de la vuelta por el corredor lleva el ECO · y /health dice la capacidad', () => {
    expect(index).toMatch(/const eco = ecoDeLimites\(limitesMirar\.valor\)/)
    expect(index).toMatch(/\.\.\.\(eco \? \{ mirar_afuera_limites: eco \} : \{\}\)/)
    expect(index).toMatch(/capacidades: CAPACIDADES_DEL_CORREDOR/)
    expect(CAPACIDADES_DEL_CORREDOR.mirar_afuera_limites).toBe(1)
  })
  it('el lector REAL del pedido: camelCase · snake_case · dentro de context · el primero presente manda · mal escrito ⇒ rechazo', () => {
    expect(limitesDelPedido({}, {})).toEqual({ ok: true, valor: null })
    expect(limitesDelPedido({ mirar_afuera_limites: { max_pedidos: 4, permitidos: CUATRO } }, {})).toEqual({ ok: true, valor: { maxPedidos: 4, permitidos: CUATRO } })
    expect(limitesDelPedido({}, { mirar_afuera_limites: { max_pedidos: 3 } })).toEqual({ ok: true, valor: { maxPedidos: 3, permitidos: null } })
    expect(limitesDelPedido({ mirarAfueraLimites: { maxPedidos: 2 } }, { mirar_afuera_limites: { max_pedidos: 9 } }).valor?.maxPedidos).toBe(2)
    expect(limitesDelPedido({ mirar_afuera_limites: { max_pedidos: 0 } }, {}).ok).toBe(false)
    expect(limitesDelPedido({ mirar_afuera_limites: { permitidos: ['no_existe'] } }, {}).ok).toBe(false)
  })
})

describe('④ el ECO que el corredor devuelve en el acuse', () => {
  it('con límites ⇒ el eco dice EXACTAMENTE lo aceptado (snake_case) · sin límites ⇒ undefined (ni existe la clave)', () => {
    expect(ecoDeLimites({ maxPedidos: 4, permitidos: CUATRO })).toEqual({ max_pedidos: 4, permitidos: CUATRO })
    expect(ecoDeLimites({ maxPedidos: 2, permitidos: null })).toEqual({ max_pedidos: 2 })
    expect(ecoDeLimites({ maxPedidos: null, permitidos: ['instagram'] })).toEqual({ permitidos: ['instagram'] })
    expect(ecoDeLimites(null)).toBeUndefined()
    expect(ecoDeLimites(undefined)).toBeUndefined()
  })
})

describe('⑤ N13 · el techo del módulo es 20 (un solo número que vigilan las dos puertas)', () => {
  it('🔴 el módulo acepta 20 y rechaza 21 · si alguien sube el techo, esto lo grita', () => {
    expect(LIMITE_MAXIMO_DE_PEDIDOS).toBe(20)
    expect(limitesDelPedido({ mirar_afuera_limites: { max_pedidos: 20 } }, {}).ok).toBe(true)
    expect(limitesDelPedido({ mirar_afuera_limites: { max_pedidos: 21 } }, {}).ok).toBe(false)
    expect(limitesDelPedido({ mirar_afuera_limites: { max_pedidos: 2000 } }, {}).ok).toBe(false)
  })
})
