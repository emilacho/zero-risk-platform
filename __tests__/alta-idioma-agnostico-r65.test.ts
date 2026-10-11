/**
 * Encargo «alta sin idioma fijo» (2026-10-11) · el Transform del alta escribía FIJO «español de Ecuador · sin voseo…» para todo cliente. Ahora el idioma y el registro salen del PAÍS del cliente
 * (la misma tabla país → trato que el detector de trato), y quedan vacíos y declarados si no se sabe. En seco, con las salidas REALES de la corrida E107 como contexto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirCodigo, construirFlujo } from '../scripts/worker-staging/LyVoKcrypS5uLyuu/construir-idioma-agnostico.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const ANTES = leer('LyVoKcrypS5uLyuu/alta-ANTES-idioma-2026-10-11.json') as Flujo
const HOY = leer('LyVoKcrypS5uLyuu/alta-ARREGLADO-idioma-2026-10-11.json') as Flujo
const EV = leer('LyVoKcrypS5uLyuu/evidencia-146532-e109.json') as { nodos: Record<string, any>; split_targets: any[]; calls: any[] }
const TRANSFORM = '[JEFATURA] Transform discovery→package'
const GATE = '[APIFY-WIRE] Gate · drop skip-markers (lazo)'
const CALL = '[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)'
const codigo = (f: Flujo) => String(f.nodes.find((n) => n.name === TRANSFORM)!.parameters.jsCode)

function correr(code: string, deal: Record<string, unknown> | null) {
  const nodos: Record<string, any> = { ...EV.nodos, [GATE]: EV.split_targets[1], [CALL]: { ok: true, apify_function: 'instagram_scraper', datos: '## Record 1\n' } }
  if (deal === null) delete nodos['Validate Deal Data']; else nodos['Validate Deal Data'] = deal
  const todos: Record<string, any[]> = { [GATE]: [EV.split_targets[1]], [CALL]: [nodos[CALL]] }
  const $ = (n: string) => {
    if (!(n in nodos)) throw new Error(`Node '${n}' hasn't been executed`)
    return { first: () => ({ json: nodos[n] }), all: () => (todos[n] ?? [nodos[n]]).map((j) => ({ json: j })), item: { json: nodos[n] } }
  }
  const json = EV.nodos['[JEFATURA] Load landscape_summary (canon)']
  const items = [{ json }]
  const out = new Function('$', '$input', '$json', '$workflow', '$execution', code)($, { all: () => items, first: () => items[0], item: items[0] }, json, { id: 'LyVoKcrypS5uLyuu' }, { id: '999' }) as Array<{ json: any }>
  return out[0].json.discovery_package.materia_cliente as Record<string, any>
}
const base = EV.nodos['Validate Deal Data'] as Record<string, unknown>
const cliente = (extra: Record<string, unknown>) => ({ ...base, country: undefined, city: undefined, location: undefined, ...extra })

describe('rojo · el alta de hoy escribe «Ecuador» para cualquier cliente', () => {
  it('un cliente de Argentina sale con «español de Ecuador · sin voseo»', () => {
    const m = correr(codigo(ANTES), cliente({ country: 'Argentina' }))
    expect(m.idioma).toMatch(/español de Ecuador · sin voseo/)
  })
})

describe('verde · el idioma sale del país del cliente', () => {
  it('Ecuador → tuteo (por nombre, por código y por el último tramo de la ubicación)', () => {
    for (const d of [{ country: 'Ecuador' }, { country: 'EC' }, { country: 'ecuador ' }, { location: 'Olón, Santa Elena, Ecuador' }]) {
      const m = correr(codigo(HOY), cliente(d))
      expect(m.idioma).toMatch(/^español · tuteo/)
      expect(m.idioma_estado).toBe('por_pais')
      expect(m.idioma_pais).toBe('ecuador'.slice(0, 2) === 'ec' && d.country === 'EC' ? 'ec' : 'ecuador')
    }
  })
  it('Argentina / Uruguay → voseo · Costa Rica → usted · México (con tilde) y España (con eñe) → tuteo', () => {
    expect(correr(codigo(HOY), cliente({ country: 'Argentina' })).idioma).toMatch(/^español · voseo/)
    expect(correr(codigo(HOY), cliente({ country: 'UY' })).idioma).toMatch(/^español · voseo/)
    expect(correr(codigo(HOY), cliente({ country: 'Costa Rica' })).idioma).toMatch(/^español · trato de usted/)
    expect(correr(codigo(HOY), cliente({ country: 'México' })).idioma).toMatch(/^español · tuteo/)
    expect(correr(codigo(HOY), cliente({ country: 'España' })).idioma).toMatch(/^español · tuteo/)
  })
  it('sin país → vacío y declarado (nunca se adivina)', () => {
    for (const d of [{}, { country: '' }, { country: '   ' }]) {
      const m = correr(codigo(HOY), cliente(d))
      expect(m.idioma).toBe('')
      expect(m.idioma_estado).toBe('pendiente_sin_pais')
      expect(m.idioma_pais).toBeNull()
    }
  })
  it('un país que la tabla no conoce → vacío y declarado con su causa', () => {
    const m = correr(codigo(HOY), cliente({ country: 'Francia' }))
    expect(m.idioma).toBe('')
    expect(m.idioma_estado).toBe('pais_sin_registro_conocido')
    expect(m.idioma_pais).toBe('francia')
  })
  it('el texto de idioma nunca nombra a un cliente concreto ni deja una frase fija de país', () => {
    for (const p of ['Ecuador', 'Argentina', 'Costa Rica']) {
      const t = correr(codigo(HOY), cliente({ country: p })).idioma as string
      expect(t).not.toMatch(/Náufrago|Naufrago|Olón|Guayaquil|sabes|pides|pagas/)
    }
    expect(codigo(HOY)).not.toContain('español de Ecuador')
  })
})

describe('la tabla es la del detector de trato (no una copia que se aparte)', () => {
  it('cada país de POR_PAIS del detector está en la tabla del alta con el mismo trato', () => {
    const det = readFileSync(join(process.cwd(), 'src/lib/trato/trato-logica.js'), 'utf8')
    const m = det.match(/var POR_PAIS = (\{[^}]*\})/)!
    const porPais = new Function('return ' + m[1])() as Record<string, string>
    const alta = codigo(HOY).match(/const _PAIS_TRATO = (\{[^\n]*\})/)!
    const tabla = new Function('return ' + alta[1])() as Record<string, string>
    for (const [pais, trato] of Object.entries(porPais)) expect(tabla[pais]).toBe(trato)
    // y lo que la tabla del alta añade son SOLO códigos de dos letras
    for (const k of Object.keys(tabla)) if (!(k in porPais)) expect(k).toMatch(/^[a-z]{2}$/)
  })
})

describe('nada más cambió', () => {
  it('solo cambia el Transform · estructura, conexiones y estado intactos · el resto del paquete es idéntico salvo el idioma', () => {
    const a = new Map(ANTES.nodes.map((n) => [n.name, JSON.stringify(n.parameters)])), b = new Map(HOY.nodes.map((n) => [n.name, JSON.stringify(n.parameters)]))
    expect(b.size).toBe(a.size)
    expect([...a.keys()].filter((k) => a.get(k) !== b.get(k))).toEqual([TRANSFORM])
    expect(HOY.connections).toEqual(ANTES.connections)
    expect(HOY.active).toBe(false)
    const d = cliente({ country: 'Ecuador' })
    const antes = correr(codigo(ANTES), d), hoy = correr(codigo(HOY), d)
    const { idioma: _i, idioma_estado: _e, idioma_pais: _p, ...resto } = hoy
    const { idioma: _j, ...restoAntes } = antes
    expect(resto).toEqual(restoAntes)
  })
  it('no se puede construir dos veces', () => {
    expect(() => construirCodigo(codigo(HOY))).toThrow(/ya trae el idioma/)
    expect(() => construirFlujo(HOY)).toThrow(/ya trae el idioma/)
  })
})
