/**
 * 04-nov · GO Lenovo «la oficina financiera pausa hasta que el dueño responda» · parte de CC#2 (plan `X9F0zp6LQ2xGEYVS`). Todo en seco (US$ 0): corre el código real de los nodos tocados.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirPlanPausaDeFinanzas, CODIGO_PAUSA_OK, CODIGO_PONER, N_PAUSAR, N_PAUSA_OK, N_R_LEER, N_R_PONER, N_R_SI, N_SE_PAUSA } from '../scripts/ops/oficina-marketing/plan-pausa-de-finanzas.mjs'

type Nodo = { name: string; parameters: Record<string, any>; onError?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/X9F0zp6LQ2xGEYVS-antes-de-pausa-finanzas-2026-11-04.json'), 'utf8'))
const base = () => (ANTES.workflow || ANTES) as Flujo
const nuevo = () => { const f = structuredClone(base()); construirPlanPausaDeFinanzas(f); return f }
const cod = (f: Flujo, n: string) => (f.nodes.find((x) => x.name === n) as Nodo).parameters.jsCode as string
const sale = (f: Flujo, de: string, i = 0) => (f.connections[de].main[i] || []).map((x: { node: string }) => x.node)

/** corre «FIN · decidir»: vuelta 0 = respuesta de abrir; >0 = de avanzar */
function decidir(codigoNodo: string, vuelta: number, statusCode: number, body: Record<string, unknown>) {
  const dolar = (n: string) => ({ first: () => ({ json: n === 'FIN · armar la semilla' ? { t0: Date.now() } : { encargo_id: 'e1' } }) })
  return new Function('$', '$input', '$runIndex', codigoNodo)(dolar, { first: () => ({ json: { statusCode, body } }) }, vuelta)[0].json
}
const ESPERA = { estado: 'esperando_al_dueno', terminado: false, esperando: true, encargo_id: 'e1' }

describe('plan · la pausa de finanzas', () => {
  it('«FIN · decidir»: la respuesta «esperando al dueño» marca pausa (en abrir y en avanzar); lo demás sigue igual', () => {
    const c = cod(nuevo(), 'FIN · decidir')
    expect(decidir(c, 0, 200, ESPERA)).toMatchObject({ fin: true, pausa: true, encargo_id: 'e1' })
    expect(decidir(c, 3, 200, ESPERA)).toMatchObject({ fin: true, pausa: true, encargo_id: 'e1' })
    expect(decidir(c, 0, 200, { encargo_id: 'e1' })).toEqual({ fin: false, encargo_id: 'e1' })
    expect(decidir(c, 2, 200, { terminado: true, estado: 'firmado' })).toMatchObject({ fin: true, leer: true })
    expect(decidir(c, 2, 200, { terminado: false })).toEqual({ fin: false, encargo_id: 'e1' })
    expect(decidir(c, 2, 500, {})).toMatchObject({ fin: true, finanzas_motivo: 'sin_bloque' })
    // antes: la misma respuesta NO pausaba
    expect(decidir(cod(base(), 'FIN · decidir'), 3, 200, ESPERA)).toEqual({ fin: false, encargo_id: 'e1' })
  })
  it('el cableado: decidir → ¿se pausa? → pausar → guardada; lo demás sigue por el camino de siempre', () => {
    const f = nuevo()
    expect(sale(f, 'FIN · decidir')).toEqual([N_SE_PAUSA])
    expect(sale(f, N_SE_PAUSA, 0)).toEqual([N_PAUSAR]); expect(sale(f, N_SE_PAUSA, 1)).toEqual(['FIN · ¿sigue la conversación?'])
    expect(sale(f, N_PAUSAR)).toEqual([N_PAUSA_OK]); expect(f.connections[N_PAUSA_OK]).toBeUndefined()
  })
  it('«pausar» manda lo acordado con CC#1 y la guardada falla en rojo si la ruta no contesta 200', () => {
    const f = nuevo(); const p = f.nodes.find((x) => x.name === N_PAUSAR) as Nodo
    expect(p.parameters.url).toContain('/api/finanzas/pausar')
    for (const k of ['client_id', 'encargo_id', 'corrida', 'corrida_id', 'material', 'sobre']) expect(p.parameters.jsonBody).toContain(k + ':')
    expect(p.parameters.jsonBody).toContain("$('[PLANEACIÓN] Junta de brazos').first().json")
    const ok = (r: unknown) => new Function('$input', CODIGO_PAUSA_OK)({ first: () => ({ json: r }) })
    expect(ok({ statusCode: 200 })[0].json).toEqual({ pausada: true })
    expect(() => ok({ statusCode: 500, body: { error: 'x' } })).toThrow(/PLAN_PAUSA_NO_GUARDADA/)
  })
  it('«⓪ Llave» acepta uuid o ausente y rechaza lo demás ANTES de gastar', () => {
    const c = cod(nuevo(), '⓪ Llave · Webhook · planeacion')
    const i = c.indexOf('const _re ='), j = c.indexOf('// 01-nov · CICLO DEL PLAN (tramo 2)')
    const corre = (v: unknown) => new Function('w', c.slice(i, j))({ body: v === undefined ? {} : { reanudar_esperas_id: v } })
    expect(() => corre(undefined)).not.toThrow(); expect(() => corre('')).not.toThrow()
    expect(() => corre('2c0d2236-8d57-4a43-b9a1-5f0c1a2b3c4d')).not.toThrow()
    for (const malo of ['x', 7, true, {}]) expect(() => corre(malo)).toThrow(/PLANEACION_REANUDAR_INVALIDO/)
  })
  it('«elegir brazos»: al reanudar no pide ningún brazo ni se detiene por eso; sin reanudar, igual que hoy', () => {
    const c = cod(nuevo(), 'elegir brazos')
    expect(c).toContain('pedidos: REANUDA ? [] : pedidos,')
    expect(c).toContain('if (!REANUDA && !pedidos.some(')
    const expr = c.slice(c.indexOf('const REANUDA = ') + 16, c.indexOf(';\r\nif (!REANUDA') > 0 ? c.indexOf(';\r\nif (!REANUDA') : c.indexOf(';\nif (!REANUDA'))
    // `viejo`: lo que contesta «V9 · decidir» (undefined = ese nodo no corrió)
    const reanuda = (b: Record<string, unknown> | 'sin', viejo?: boolean) => new Function('$', 'return ' + expr)((n: string) => ({ first: () => {
      if (n === 'V9 · decidir') { if (viejo === undefined) throw new Error('no corrió'); return { json: { material_viejo: viejo } } }
      if (b === 'sin') throw new Error('x'); return { json: { body: b } }
    } }))
    expect(reanuda({ reanudar_esperas_id: 'u' })).toBe(true); expect(reanuda({})).toBe(false); expect(reanuda('sin')).toBe(false)
    // pausa de más de 7 días: el pre-vuelo avisa `material_viejo` → NO se reanuda con lo guardado (los brazos se piden frescos)
    expect(reanuda({ reanudar_esperas_id: 'u' }, true)).toBe(false); expect(reanuda({ reanudar_esperas_id: 'u' }, false)).toBe(true)
    expect(cod(base(), 'elegir brazos')).not.toContain('REANUDA')
  })
  it('el pre-vuelo recibe `reanudar_esperas_id` y «V9 · decidir» deja pasar `material_viejo`; sin ellos, igual que hoy', () => {
    const f = nuevo()
    const cuerpo = (ff: Flujo, b: Record<string, unknown>) => JSON.parse(new Function('$', 'return ' + ((ff.nodes.find((x) => x.name === 'V9 · pre-vuelo') as Nodo).parameters.jsonBody as string).replace(/^={{/, '').replace(/}}$/, ''))(() => ({ first: () => ({ json: { body: b } }) })))
    const b0 = { client_id: 'c', corrida: 'k', dry_run: false }
    expect(cuerpo(f, { ...b0, reanudar_esperas_id: 'u1' })).toEqual({ client_id: 'c', corrida: 'k', dry_run: false, reanudar_esperas_id: 'u1' })
    expect(cuerpo(f, b0)).toEqual({ client_id: 'c', corrida: 'k', dry_run: false })
    expect(cuerpo(base() as Flujo, { ...b0, reanudar_esperas_id: 'u1' })).toEqual({ client_id: 'c', corrida: 'k', dry_run: false })
    const dec = (ff: Flujo, body: Record<string, unknown>) => new Function('$input', '$runIndex', cod(ff, 'V9 · decidir'))({ first: () => ({ json: { statusCode: 200, body } }) }, 0)[0].json
    expect(dec(f, { decision: 'correr', material_viejo: true })).toMatchObject({ ruta: 'seguir', material_viejo: true })
    expect(dec(f, { decision: 'correr' })).toMatchObject({ ruta: 'seguir', material_viejo: false })
    expect(dec(base() as Flujo, { decision: 'correr', material_viejo: true }).material_viejo).toBeUndefined()
  })
  it('después de la Junta: al reanudar el material guardado ocupa su lugar; si no se puede leer, falla en rojo', () => {
    const f = nuevo()
    expect(sale(f, '[PLANEACIÓN] Junta de brazos')).toEqual([N_R_SI])
    expect(sale(f, N_R_SI, 0)).toEqual([N_R_LEER]); expect(sale(f, N_R_SI, 1)).toEqual(['Derivador (B5)'])
    expect(sale(f, N_R_LEER)).toEqual([N_R_PONER]); expect(sale(f, N_R_PONER)).toEqual(['Derivador (B5)'])
    const leer = f.nodes.find((x) => x.name === N_R_LEER) as Nodo
    expect(leer.parameters.url).toContain('esperas_del_dueno?id=eq.'); expect(leer.onError).toBe('continueRegularOutput')
    const poner = (r: unknown) => new Function('$input', CODIGO_PONER)({ first: () => ({ json: r }) })
    const material = { material: [{ brazo: 'apify' }], descartados: [] }
    expect(poner({ statusCode: 200, body: [{ sobre_de_reanudacion: { material } }] })[0].json).toEqual(material)
    expect(() => poner({ statusCode: 200, body: [] })).toThrow(/PLAN_REANUDAR_SIN_MATERIAL/)
    expect(() => poner({ statusCode: 500, body: {} })).toThrow(/PLAN_REANUDAR_SIN_MATERIAL/)
  })
  it('la semilla de la apertura lleva el manual completo (si «① GUARDA» lo trae)', () => {
    expect(cod(nuevo(), 'FIN · armar la semilla')).toContain('semilla.manual_completo = mc')
    expect(cod(base(), 'FIN · armar la semilla')).not.toContain('manual_completo')
  })
  it('solo cambian los 6 nodos esperados y se suman 6', () => {
    const a = base().nodes, d = nuevo().nodes
    expect(d.length).toBe(a.length + 6)
    expect(a.filter((n) => JSON.stringify(n) !== JSON.stringify(d.find((y) => y.name === n.name))).map((n) => n.name).sort()).toEqual(['FIN · armar la semilla', 'FIN · decidir', 'V9 · decidir', 'V9 · pre-vuelo', 'elegir brazos', '⓪ Llave · Webhook · planeacion'].sort())
  })
})
