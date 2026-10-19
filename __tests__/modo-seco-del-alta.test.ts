/**
 * EL MODO SECO DEL ALTA (CC#1 · noche 19-oct · orden de Lenovo 23:40). Se vigila sobre los flujos ARREGLADO (alta, segunda fase, cimiento, lazo A):
 *  · SIN `dry_run:true` nada cambia de conducta (cada dirección vale lo de siempre; cada cuerpo manda dry_run:false);
 *  · CON `dry_run:true` ningún nodo alcanzable que gaste o toque algo real queda sin modo seco o sin eco.
 * Las expresiones de n8n se EJECUTAN con un entorno simulado (no se comparan como texto). US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/modo-seco')
const IDS = { ALTA: 'LyVoKcrypS5uLyuu', SEGUNDA: 'wu1DUAXIuEG5nNTX', CIMIENTO: 'ssLtwYPt7zxuvnM2', LAZO_A: 'kSSAvCbEfHs2Hoa0' } as const
type Nodo = { name: string; type: string; disabled?: boolean; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const cargar = (id: string, version: 'ANTES' | 'ARREGLADO'): Flujo => {
  const w = JSON.parse(fs.readFileSync(path.join(D, `${id}-${version}-seco-2026-10-19.json`), 'utf8'))
  return (w.nodes ? w : Object.values(w).find((v) => v && typeof v === 'object' && (v as { nodes?: unknown }).nodes)) as Flujo
}
const antes = Object.fromEntries(Object.entries(IDS).map(([k, id]) => [k, cargar(id, 'ANTES')])) as Record<keyof typeof IDS, Flujo>
const desp = Object.fromEntries(Object.entries(IDS).map(([k, id]) => [k, cargar(id, 'ARREGLADO')])) as Record<keyof typeof IDS, Flujo>
const por = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const ENV = { ZERO_RISK_API_URL: 'https://api.prueba', INTERNAL_API_KEY: 'llave-de-prueba', SLACK_WEBHOOK_URL: 'https://hooks.slack.invalido/x' }

/** ejecuta UNA expresión de n8n con $env y $() simulados; el nodo «Validate Deal Data»/«Datos del alta» devuelve dry_run = `dry` */
function evalExpr(expr: string, dry: boolean, json: Record<string, unknown> = {}): unknown {
  const nodoSim = () => ({ first: () => ({ json: { dry_run: dry, client_id: 'c1' } }), item: { json: { dry_run: dry, client_id: 'c1' } }, all: () => [] })
  return new Function('$env', '$', '$json', `return (${expr})`)(ENV, nodoSim, { client_id: 'c1', promote_body: {}, ...json })
}
function evalCampo(valor: string, dry: boolean): string {
  if (!valor.startsWith('=')) return valor
  return valor.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_m, e: string) => String(evalExpr(e, dry)))
}

describe('lo que cambió: solo lo previsto', () => {
  const previstos: Record<keyof typeof IDS, string[]> = {
    ALTA: ['Validate Deal Data', 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)', 'Competitor Verdict', 'Re-gate INLINE', '[RD] Dispatch', '[RD] Re-dispatch', '[APIFY] Scrape-Verify', 'Completar lo que falta', 'FUENTES] Llamar al Servicio', 'Despertar el cerebro', 'E57', '[APIFY-WIRE] Call Apify Service Workflow', '[JEFATURA] Transform', 'Armar carga', 'Parse veredicto', 'Parse re-gate veredicto'],
    SEGUNDA: ['Create Notion Client Workspace', 'Create Success Plan in Notion', 'Schedule Kickoff Call (Cal.com)', 'Alert Slack: Onboarding Initiated'],
    CIMIENTO: ['Validate Deal Data', '[BB] Promote', '[BB] Manual'],
    LAZO_A: [],
  }
  for (const k of Object.keys(IDS) as Array<keyof typeof IDS>) {
    it(`${k}: los nodos distintos son los previstos (y los nuevos son los del atajo seco)`, () => {
      const cambiados = desp[k].nodes.filter((n) => { const a = antes[k].nodes.find((x) => x.name === n.name); return a && JSON.stringify(a.parameters) !== JSON.stringify(n.parameters) }).map((n) => n.name)
      for (const n of cambiados) expect(previstos[k].some((p) => n.includes(p)), `no se esperaba cambio en «${n}»`).toBe(true)
      for (const p of previstos[k]) expect(cambiados.some((n) => n.includes(p)), `faltó cambiar «${p}»`).toBe(true)
      const nuevos = desp[k].nodes.filter((n) => !antes[k].nodes.some((x) => x.name === n.name)).map((n) => n.name)
      expect(nuevos.length).toBe(k === 'CIMIENTO' ? 2 : 0)
    })
  }
})

describe('SIN dry_run nada cambia de conducta', () => {
  it('toda dirección cambiada vale, con dry_run:false, EXACTAMENTE la de antes', () => {
    for (const k of Object.keys(IDS) as Array<keyof typeof IDS>) {
      for (const n of desp[k].nodes) {
        const a = antes[k].nodes.find((x) => x.name === n.name)
        if (!a || a.parameters.url === n.parameters.url || a.parameters.url === undefined) continue
        expect(evalCampo(n.parameters.url, false), `${k} · ${n.name}`).toBe(evalCampo(a.parameters.url, false))
      }
    }
  })
  it('con dry_run:true toda dirección cambiada vale el eco', () => {
    let vistas = 0
    for (const k of Object.keys(IDS) as Array<keyof typeof IDS>) {
      for (const n of desp[k].nodes) {
        const a = antes[k].nodes.find((x) => x.name === n.name)
        if (!a || a.parameters.url === n.parameters.url || a.parameters.url === undefined) continue
        expect(evalCampo(n.parameters.url, true), `${k} · ${n.name}`).toBe('https://api.prueba/api/dry-run/eco')
        vistas++
      }
    }
    expect(vistas).toBe(8) // Scrape-Verify, Completar, Notion x2, Cal.com, Slack, Promote, Drive
  })
  it('la llave interna viaja SOLO en seco (con dry_run:false el encabezado queda vacío en los destinos de terceros)', () => {
    for (const [k, n] of [['SEGUNDA', 'Alert Slack: Onboarding Initiated'], ['CIMIENTO', '[BB] Manual → Drive (PDF)']] as const) {
      const h = (por(desp[k], n).parameters.headerParameters.parameters as Array<{ name: string; value: string }>).find((x) => x.name.toLowerCase() === 'x-api-key')!
      expect(evalCampo(h.value, false)).toBe('')
      expect(evalCampo(h.value, true)).toBe('llave-de-prueba')
    }
  })
  it('las llamadas a agentes mandan dry_run:false sin seco y dry_run:true en seco', () => {
    let vistas = 0
    for (const n of desp.ALTA.nodes.filter((x) => String(x.parameters.url ?? '').includes('/api/agents/run-sdk'))) {
      const m = /"dry_run": \{\{([\s\S]*?)\}\},/.exec(n.parameters.jsonBody)
      expect(m, n.name).not.toBeNull()
      expect(evalExpr(m![1], false)).toBe(false)
      expect(evalExpr(m![1], true)).toBe(true)
      vistas++
    }
    expect(vistas).toBe(5)
  })
  it('lo que ya traía dry_run lo toma del pedido (antes iba fijo en falso)', () => {
    for (const [pref, campo] of [['→ Despertar el cerebro', 'dry_run: '], ['[FUENTES] Llamar al Servicio', 'dry_run: ']] as const) {
      const n = desp.ALTA.nodes.find((x) => x.name.includes(pref.replace('→ ', '')))!
      const cuerpo = n.parameters.jsonBody as string
      expect(cuerpo).not.toContain('dry_run: false')
      expect(cuerpo).toContain(campo + "$('Validate Deal Data').first().json.dry_run === true")
    }
    const e57 = desp.ALTA.nodes.find((x) => x.name.startsWith('E57'))!
    expect(e57.parameters.jsonBody).not.toContain('"dry_run": false')
    expect(/"dry_run": \{\{([\s\S]*?)\}\},/.exec(e57.parameters.jsonBody)).not.toBeNull()
  })
})

describe('el validador del alta', () => {
  const codigo = por(desp.ALTA, 'Validate Deal Data').parameters.jsCode as string
  const cola = codigo.slice(codigo.indexOf('// MODO SECO'))
  const correr = (dry: unknown) => {
    const b: Record<string, unknown> = dry === undefined ? {} : { dry_run: dry }
    const f = new Function('b', cola.replace('return [{ json: b }];', 'return b;'))
    return f(b) as Record<string, unknown>
  }
  it('ausente = real; true = seco; false = real', () => {
    expect(correr(undefined).dry_run).toBe(false)
    expect(correr(true).dry_run).toBe(true)
    expect(correr(false).dry_run).toBe(false)
    expect(correr(null).dry_run).toBe(false)
  })
  it('cualquier otra cosa PARA antes de gastar (un «true» como texto no cuenta como seco ni como real)', () => {
    for (const malo of ['true', 'false', 1, 0, {}, []]) expect(() => correr(malo), String(malo)).toThrow(/DRY_RUN_NO_BOOLEANO/)
  })
})

describe('el cimiento en seco', () => {
  const f = desp.CIMIENTO
  it('el atajo: en seco devuelve su contrato de «pasó» y el flujo NO sigue a ningún agente', () => {
    const si = 'SECO · ¿es una corrida en seco?'
    expect(f.connections['Validate Deal Data'].main[0].map((x) => x.node)).toEqual([si])
    const salidas = f.connections[si].main
    expect(salidas[0].map((x) => x.node)).toEqual(['SECO · devolver el contrato al padre'])
    expect(salidas[1].map((x) => x.node)).toEqual(['Confirm barato · competitor list'])
    expect(f.connections['SECO · devolver el contrato al padre']).toBeUndefined() // es el ÚLTIMO nodo: lo que devuelve va al padre
    const ret = por(f, 'SECO · devolver el contrato al padre')
    const ejecutar = new Function('$', ret.parameters.jsCode as string)
    const j = (ejecutar(() => ({ first: () => ({ json: { client_id: 'c9' } }) })) as Array<{ json: Record<string, unknown> }>)[0].json
    // el contrato que el padre lee (IF track_pass · «Armar la causa»): los mismos campos que el retorno real
    expect(j).toMatchObject({ _cimiento_return: true, track_pass: true, track_published: true, track_marked: false, track_exhausted: false, judge_incomplete: false, client_id: 'c9', dry_run: true, track_reason: 'dry_run' })
    const real = por(f, 'Return scores a parent (grade-cimiento gate)').parameters.jsCode as string
    for (const campo of ['fidelity_scores', 'brand_book_draft', 'client_id', 'track_pass', 'track_published', 'track_marked', 'track_exhausted', 'fidelity_cycle', 'track_reason', 'lazo_a', 'judge_incomplete', '_return_source', 'pdf_manual']) {
      expect(real, campo).toContain(campo)
      expect(Object.keys(j), campo).toContain(campo)
    }
  })
  it('desde el atajo seco NO se alcanza ningún nodo que gaste o toque algo real', () => {
    const vistos = new Set<string>()
    const q = ['SECO · ¿es una corrida en seco?']
    // solo la rama «verdadera» (índice 0)
    const inicio = f.connections[q[0]].main[0].map((x) => x.node)
    const pila = [...inicio]
    while (pila.length) { const x = pila.pop()!; if (vistos.has(x)) continue; vistos.add(x); for (const o of f.connections[x]?.main ?? []) for (const y of o ?? []) pila.push(y.node) }
    expect([...vistos]).toEqual(['SECO · devolver el contrato al padre'])
  })
  it('el validador deja pasar el seco al atajo', () => {
    expect(por(f, 'Validate Deal Data').parameters.jsCode).toContain('dry_run: inp.dry_run === true')
  })
})

describe('invariante: en seco, todo nodo ALCANZABLE que gaste o toque algo real tiene su modo seco o su eco', () => {
  const RIESGO = /run-sdk|notion|calendar\/book|cascade|apify|competitors\/scrape|\/webhook\/|\/api\/inbox|slack|brand-book|\/api\/hitl|sala\/intake/i
  const SEGURO_EN_SECO = /sala\/ingress|sala\/callback|\/api\/hitl\/queue|rest\/v1/ // solo escriben la base propia (rastro, bandeja, eventos)
  function alcanzables(f: Flujo, inicios: string[]): Set<string> {
    const v = new Set<string>(); const p = [...inicios]
    while (p.length) { const x = p.pop()!; if (v.has(x)) continue; v.add(x); for (const o of f.connections[x]?.main ?? []) for (const y of o ?? []) p.push(y.node) }
    return v
  }
  // CIMIENTO: en seco corre solo la rama «verdadera» del atajo; la «falsa» (los agentes) no se ejecuta
  const casos: Array<[keyof typeof IDS, string[]]> = [['ALTA', ['Webhook: Deal Won']], ['SEGUNDA', ['Datos del alta']], ['CIMIENTO', ['SECO · devolver el contrato al padre']]]
  for (const [k, inicios] of casos) {
    it(`${k}: sin nodos de riesgo desprotegidos`, () => {
      const f = desp[k]
      const vivos = alcanzables(f, inicios)
      // CIMIENTO: en seco la rama «falsa» no corre: se mide solo desde el atajo verdadero (ya probado arriba); aquí se mide la protección «defensa en profundidad»
      for (const n of f.nodes.filter((x) => vivos.has(x.name) && x.type.endsWith('httpRequest') && !x.disabled)) {
        const url = String(n.parameters.url ?? '')
        const riesgoso = RIESGO.test(url) && !SEGURO_EN_SECO.test(url)
        if (!riesgoso) continue
        const urlSeca = evalCampo(url, true)
        const tieneDry = /"?dry_run"?:\s*(\{\{[\s\S]*?\}\}|[^,}]*(dry_run|DRY)[^,}]*)/i.test(String(n.parameters.jsonBody ?? '')) && !/dry_run"?:\s*false/.test(String(n.parameters.jsonBody ?? ''))
        const enEco = urlSeca === 'https://api.prueba/api/dry-run/eco'
        // un nodo de riesgo es aceptable si: apunta al eco en seco, o trae dry_run tomado del pedido (agentes / Apify / despertar / sobre de planeación)
        expect(enEco || tieneDry, `${k} · «${n.name}» (${url.slice(0, 70)}) NO tiene modo seco ni eco`).toBe(true)
      }
    })
  }
  it('LAZO A y los nodos huérfanos del alta no cuentan: no son alcanzables (Lazo A solo se llama desde el rama del cimiento que el atajo evita)', () => {
    const vivos = alcanzables(desp.ALTA, ['Webhook: Deal Won'])
    for (const n of ['Create Notion Client Workspace', 'Create Success Plan in Notion', 'Schedule Kickoff Call (Cal.com)', 'Alert Slack: Onboarding Initiated', 'Notify MC Inbox', 'Run Onboarding Cascade (Gap 3)']) expect(vivos.has(n), n).toBe(false)
  })
})

describe('el veredicto en seco (hallazgo del ensayo del 20-oct: la respuesta canónica no trae veredicto)', () => {
  const correr = (nodo: string, dry: boolean, respuesta: unknown) => {
    const codigo = por(desp.ALTA, nodo).parameters.jsCode as string
    const f = new Function('$input', '$', codigo)
    const nodoSim = () => ({ first: () => ({ json: { dry_run: dry, client_id: 'c1', client_name: 'Prueba' } }), item: { json: { dry_run: dry, client_id: 'c1', client_name: 'Prueba', competitors: [] } } })
    return (f({ first: () => ({ json: respuesta }) }, nodoSim) as Array<{ json: Record<string, any> }>)[0].json
  }
  const CANONICA = { success: true, response: 'Respuesta canonica del modo seco: sin JSON y sin veredicto.' }
  for (const nodo of ['Parse veredicto', 'Parse re-gate veredicto']) {
    it(`${nodo}: en seco la respuesta canónica da «confirmar» (el cable sigue)`, () => {
      const j = correr(nodo, true, CANONICA)
      expect(j).toMatchObject({ veredicto: 'confirmar', confianza: 1, _perdida: null })
      expect(j.razones).toEqual(['modo seco: veredicto simulado'])
    })
    it(`${nodo}: SIN seco la misma respuesta sigue siendo «no_se» (falla ruidoso, como siempre)`, () => {
      const j = correr(nodo, false, CANONICA)
      expect(j.veredicto).toBe('no_se')
      expect(j._perdida).toBe('respuesta_sin_json')
    })
    it(`${nodo}: sin seco un veredicto real sigue leyéndose igual`, () => {
      expect(correr(nodo, false, { success: true, response: '{"veredicto":"observar","razones":["x"],"confianza":0.4}' })).toMatchObject({ veredicto: 'observar', confianza: 0.4 })
    })
  }
})
