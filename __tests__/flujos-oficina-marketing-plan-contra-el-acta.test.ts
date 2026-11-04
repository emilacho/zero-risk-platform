/**
 * 04-nov · P21 (el plan contra el acta de la mesa) pegado en los nodos de los chequeos. Todo en seco (US$ 0): corre el módulo VIVO de «¿Llegó la vuelta?» con el parche encima.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { construirMesaDeEstrategia } from '../scripts/ops/oficina-marketing/plan-mesa-de-estrategia.mjs'
import { construirPlanContraElActa, NODOS_DEL_ACTA } from '../scripts/ops/oficina-marketing/plan-contra-el-acta.mjs'
import { moduloDeLosChequeos } from '../scripts/worker-staging/jefatura-j7/plan-versiones.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown> }
const J = JSON.parse(fs.readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/aplicado/X9F0zp6LQ2xGEYVS-calendario-2026-11-04.json'), 'utf8'))
const base = () => (J.workflow || J) as Flujo
const conMesa = () => { const f = structuredClone(base()); construirMesaDeEstrategia(f); return f }
const nuevo = () => { const f = conMesa(); construirPlanContraElActa(f); return f }
const nod = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n) as Nodo
const cod = (f: Flujo, n: string) => nod(f, n).parameters.jsCode as string
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
interface Marca { codigo: string; que: string; ejemplos: string[] }
interface Resultado { ok: boolean; marcas: Marca[] }
const armar = (js: string) => new Function(`${js}\nreturn { revisarPlan }`)() as { revisarPlan: (t: string, c: unknown) => Resultado }
const DIR = '__tests__/fixtures/chequeos-del-plan'
const CTX = JSON.parse(fs.readFileSync(`${DIR}/contexto.json`, 'utf8'))
const PLAN_B = fs.readFileSync(`${DIR}/plan-4-nov-b.md`, 'utf8').replace(/\r\n/g, '\n')

const ACTA = { esquema: 'acta.v1', numero: { meta: 40, por_que: 'p' }, servicio: 's', audiencia: 'a', oferta: 'o', camino: 'c', prueba: 'pr', canales: [{ canal: 'Meta', peso: 0.6, razon: 'r1' }, { canal: 'Búsqueda paga', peso: 0.4, razon: 'r2' }], no_se_hace: [{ que: 'TikTok', por_que: 'no hay video' }], no_se: [] }
const PLAN_OK = ['# Plan', '| Canal | Presupuesto |', '|---|---|', '| Meta Ads | $480 (60%) |', '| Google Ads | $320 (40%) |'].join('\n')
const PLAN_MAL = ['# Plan', '| Canal | Presupuesto |', '|---|---|', '| Meta Ads | $200 (25%) |', '| WhatsApp | $600 (75%) |', '', '- Campañas de TikTok cada semana'].join('\n')
const NL = String.fromCharCode(10)
const codigos = (r: Resultado) => r.marcas.map((m) => m.codigo)

describe('plan · P21 el plan contra el acta (pegado en los nodos)', () => {
  const f = nuevo()
  // el módulo VIVO de «¿Llegó la vuelta?», ya con el parche (es el único cuyo cuerpo se puede cortar limpio); los otros dos llevan EXACTAMENTE el mismo texto (prueba abajo)
  const modulo = (_n: string) => moduloDeLosChequeos(cod(f, '¿Llegó la vuelta?'))
  const revisar = (n: string) => { const c = cod(f, n); const i = c.indexOf('function revisarPlan(texto, ctx) {'); return c.slice(i, c.indexOf(String.fromCharCode(10) + '}' + String.fromCharCode(10), i)) }

  it('el módulo se pega en los 3 nodos de los chequeos y compila (los 3 nodos, y cada nodo de código del plan)', () => {
    for (const n of NODOS_DEL_ACTA) {
      expect(cod(f, n)).toContain('function _planContraElActa(')
      expect(cod(f, n)).toContain("codigo: 'P21'")
    }
    for (const x of f.nodes) if (typeof x.parameters.jsCode === 'string') expect(() => new AsyncFunction('$', '$input', '$json', '$runIndex', '$workflow', '$execution', x.parameters.jsCode), x.name).not.toThrow()
  })

  it('con acta: el plan que la sigue no marca; el que se aparta marca P21 (canal sin peso, canal fuera del acta, «no se hace»)', () => {
    for (const n of NODOS_DEL_ACTA) {
      const { revisarPlan } = armar(modulo(n))
      const ok = revisarPlan(PLAN_OK, { ...CTX, acta: ACTA })
      expect(codigos(ok), n).not.toContain('P21')
      const mal = revisarPlan(PLAN_MAL, { ...CTX, acta: ACTA })
      expect(codigos(mal), n).toContain('P21')
      const ej = mal.marcas.find((m) => m.codigo === 'P21')!.ejemplos.join(' | ')
      expect(ej).toMatch(/25 % a «Meta Ads» y el acta acordó 60 %/); expect(ej).toMatch(/75 % a «WhatsApp» y ese canal no está activo en el acta/); expect(ej).toMatch(/«TikTok» está en lo que no se hace/)
    }
  })

  it('lo que CC3 pidió probar de la vara: canal diferido, sección «lo que no se hace», borde de la tolerancia y no repetir', () => {
    const { revisarPlan } = armar(modulo('JEF · plan · evaluar'))
    const ACTA_D = { ...ACTA, canales: [{ canal: 'Meta', peso: 0.6, razon: 'r' }, { canal: 'Búsqueda paga', peso: 0.3, razon: 'r' }, { canal: 'WhatsApp', peso: 0.1, razon: 'r', activo: false, condicion: 'solo si hay verificación' }] }
    const tabla = (m: number, g: number, w?: number) => ['# Plan', '| Canal | Presupuesto |', '|---|---|', `| Meta Ads | $1 (${m}%) |`, `| Google Ads | $1 (${g}%) |`, w ? `| WhatsApp | $1 (${w}%) |` : ''].join(NL)
    const ej = (t: string, a: unknown) => revisarPlan(t, { ...CTX, acta: a }).marcas.filter((m) => m.codigo === 'P21').flatMap((m) => m.ejemplos)
    // 1 · un canal diferido (activo:false) NO cuenta como activo
    expect(ej(tabla(60, 30, 10), ACTA_D).join(' | ')).toMatch(/10 % a «WhatsApp» y ese canal no está activo en el acta/)
    expect(ej(tabla(60, 30), ACTA_D)).toEqual([])
    // 3 · el borde: 3 puntos no marca, 5 exactos no marca, 8 sí
    expect(ej(tabla(63, 30), ACTA_D)).toEqual([]); expect(ej(tabla(65, 30), ACTA_D)).toEqual([])
    expect(ej(tabla(68, 30), ACTA_D).join(' | ')).toMatch(/68 % a «Meta Ads» y el acta acordó 60 %/)
    // 2 · la sección de lo que NO se hace nombra el canal para decir que no se hace: viñetas SIN «no» no marcan; la misma viñeta fuera de esa sección sí
    for (const h of ['Lo que no se hace', 'Lo que no haremos']) expect(ej(['## ' + h, '- TikTok cada semana', '- Reels de TikTok diarios', ''].join(NL), ACTA), h).toEqual([])
    expect(ej(['## Qué hacemos', '- TikTok cada semana', ''].join(NL), ACTA).join(' | ')).toMatch(/«TikTok» está en lo que no se hace/)
    // 4 · el mismo «no se hace» se marca UNA vez aunque el plan lo repita
    expect(ej(['## Qué hacemos', '- TikTok cada semana', '- Reels de TikTok diarios', '- Más TikTok', ''].join(NL), ACTA).filter((x) => /TikTok/.test(x)).length).toBe(1)
  })

  it('sin acta (mesa apagada o plan que no pasó por la mesa) el chequeo calla: el resultado es el de hoy', () => {
    const { revisarPlan } = armar(modulo('JEF · plan · evaluar'))
    const antes = armar(moduloDeLosChequeos(cod(conMesa(), '¿Llegó la vuelta?'))).revisarPlan
    for (const ctx of [CTX, { ...CTX, acta: null }, { ...CTX, acta: {} }, { ...CTX, acta: { canales: 'x' } }]) {
      const r = revisarPlan(PLAN_MAL, ctx)
      expect(codigos(r)).not.toContain('P21')
      expect(r).toEqual(antes(PLAN_MAL, ctx))
    }
    expect(codigos(revisarPlan(PLAN_B, CTX))).not.toContain('P21') // el plan real del 4-nov, sin acta
  })

  it('marca, no bloquea: P21 no cambia las demás marcas del mismo plan', () => {
    const { revisarPlan } = armar(modulo('Redactor (B4)'))
    const sin = revisarPlan(PLAN_B, CTX), con = revisarPlan(PLAN_B, { ...CTX, acta: ACTA })
    expect(codigos(con).filter((c) => c !== 'P21')).toEqual(codigos(sin))
  })

  it('los 3 nodos llevan el mismo módulo del acta y la misma revisión (el parche es uno solo)', () => {
    const [a, b, c] = NODOS_DEL_ACTA
    expect(revisar(a)).toBe(revisar(b)); expect(revisar(b)).toBe(revisar(c))
    const m = (n: string) => { const t = cod(f, n); return t.slice(t.indexOf('var _ACTA_TOLERANCIA_PUNTOS'), t.indexOf('function revisarPlan(texto, ctx) {')) }
    expect(m(a).length).toBeGreaterThan(1500); expect(m(a)).toBe(m(b)); expect(m(b)).toBe(m(c))
  })

  it('«Redactor (B4)» pone el acta en el contexto del chequeo solo si la mesa la cerró; los otros dos nodos leen ese contexto', () => {
    const b4 = cod(f, 'Redactor (B4)')
    expect(b4).toContain("(typeof ACT !== 'undefined' && ACT ? { acta: ACT } : {})")
    expect(b4.indexOf('const ACT = ')).toBeLessThan(b4.indexOf('contexto_chequeo: Object.assign'))
    for (const n of ['¿Llegó la vuelta?', 'JEF · plan · evaluar']) expect(cod(f, n)).toContain("$('Redactor (B4)').first().json.contexto_chequeo")
  })

  it('solo cambian esos 3 nodos respecto al plan con la mesa, y las conexiones quedan iguales', () => {
    const a = conMesa()
    const cambian = f.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nod(a, n.name))).map((n) => n.name).sort()
    expect(cambian).toEqual([...NODOS_DEL_ACTA].sort())
    expect(f.connections).toEqual(a.connections); expect(f.nodes.length).toBe(a.nodes.length)
  })
})
