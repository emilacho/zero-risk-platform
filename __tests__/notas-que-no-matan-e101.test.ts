/**
 * 🔴 E101 · UNA NOTA QUE NO DECIDE NADA NO PUEDE MATAR UNA CORRIDA.
 *
 * La tercera bolita (2026-09-18 · alta 141414 · US$ 0,46) murió en «[MODELB] Phase-boundary Emit ·
 * onboarding_specialist_done»: nota informativa al libro, tope 5 s, sin onError, sin reintento. La puerta tardó 6 s
 * (la nota SÍ quedó escrita 0,8 s después del corte) y el motor mató el alta antes del cimiento.
 *
 * Fija: (①) todo nodo cosmético del alta y de la segunda fase tiene tope ≥ 20 s, 2 intentos y salida de error;
 * (②) de esa salida cuelga «Nota perdida · …» que devuelve {ok:false, code:'nota_perdida'} al mismo sucesor y avisa
 * al AVISADOR que ya existe (sin esperar); (③) el avisador tiene la segunda entrada y titula «SE PERDIÓ UNA NOTA ·
 * la corrida SIGUE»; (④) nada que DECIDE cambió (E57 · sobre, Confirm barato, Persist, Notion, polls, guardas).
 * NO toca producción · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COSMETICOS, NO_SE_TOCAN, AVISAR, AVISADOR_ID, TOPE_MS, TRIGGER_NOTA, nombreNota, alcanzables } from '../scripts/worker-staging/e101-notas-que-no-matan.mjs'

type Nodo = { name: string; type: string; parameters: Record<string, any>; disabled?: boolean; onError?: string; retryOnFail?: boolean; maxTries?: number; waitBetweenTries?: number }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main?: Array<Array<{ node: string }> | null> }>; settings?: any }

const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ALTA_VIVO = leer('LyVoKcrypS5uLyuu/alta-antes-e101-d1108e41.json') // lo que corrió en la tercera bolita
const ALTA_HOY = leer('LyVoKcrypS5uLyuu/alta-construida-e101.json')
const SF_VIVO = leer('wu1DUAXIuEG5nNTX/segunda-fase-antes-e101-55495be5.json')
const SF_HOY = leer('wu1DUAXIuEG5nNTX/segunda-fase-construida-e101.json')
const AV_VIVO = leer('5fkPLbZvQsQa1bcd/avisador-antes-e101-df848663.json')
const AV_HOY = leer('5fkPLbZvQsQa1bcd/avisador-construido-e101.json')

const EMISOR_QUE_MATO = '[MODELB] Phase-boundary Emit · onboarding_specialist_done'
const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}
const salidas = (f: Flujo, n: string, i = 0) => (f.connections[n]?.main?.[i] ?? []).map((x) => x.node)
const PAREJAS: Array<[string, Flujo, Flujo]> = [
  ['LyVoKcrypS5uLyuu', ALTA_VIVO, ALTA_HOY],
  ['wu1DUAXIuEG5nNTX', SF_VIVO, SF_HOY],
]

describe('el rojo · lo que corrió en la tercera bolita (alta d1108e41 · segunda fase 55495be5)', () => {
  it('el emisor que mató la corrida: tope 5 s · sin onError · sin reintento · y es una HOJA (no decide nada)', () => {
    const e = nodo(ALTA_VIVO, EMISOR_QUE_MATO)
    expect(e.parameters.options.timeout).toBe(5000)
    expect(e.onError).toBeUndefined()
    expect(e.retryOnFail).toBeFalsy()
    expect(salidas(ALTA_VIVO, EMISOR_QUE_MATO)).toEqual([])
  })
  it('todos los cosméticos listados eran frágiles: tope ≤ 20 s y sin onError', () => {
    for (const [id, vivo] of PAREJAS) for (const c of COSMETICOS[id as keyof typeof COSMETICOS]) {
      const n = nodo(vivo, c)
      expect(Number(n.parameters.options?.timeout ?? 0), c).toBeLessThanOrEqual(20000)
      expect(n.onError, c).toBeUndefined()
    }
  })
  it('ningún cosmético es leído por nombre por otro nodo (por eso son cosméticos) · «Confirm barato» SÍ lo es (por eso no se toca)', () => {
    for (const [id, vivo] of PAREJAS) for (const c of COSMETICOS[id as keyof typeof COSMETICOS]) {
      const lectores = vivo.nodes.filter((n) => JSON.stringify(n.parameters).includes(`$('${c}')`)).map((n) => n.name)
      expect(lectores, c).toEqual([])
    }
    const lectores = ALTA_VIVO.nodes.filter((n) => JSON.stringify(n.parameters).includes("$('Confirm barato · competitor list')")).map((n) => n.name)
    expect(lectores.length).toBeGreaterThan(0)
  })
})

describe('① el arreglo · cada nota ANOTA y no puede matar la corrida', () => {
  for (const [id, , hoy] of PAREJAS) {
    const vivos = alcanzables(hoy)
    for (const c of COSMETICOS[id as keyof typeof COSMETICOS]) {
      it(`${id} · «${c}» · tope ${TOPE_MS / 1000} s · 2 intentos · la corrida sigue`, () => {
        const n = nodo(hoy, c)
        expect(n.parameters.options.timeout).toBeGreaterThanOrEqual(20000)
        expect(n.retryOnFail).toBe(true)
        expect(n.maxTries).toBe(2)
        expect(n.waitBetweenTries).toBe(3000)
        if (vivos.has(c)) {
          // camino vivo: la salida de error va a «Nota perdida» · el éxito sigue exactamente igual
          expect(n.onError).toBe('continueErrorOutput')
          expect(salidas(hoy, c, 1)).toEqual([nombreNota(c)])
          const nota = nodo(hoy, nombreNota(c))
          expect(nota.type).toBe('n8n-nodes-base.code')
          expect(salidas(hoy, nombreNota(c))).toEqual([...salidas(hoy, c, 0), AVISAR])
        } else {
          // cola vieja (ningún disparador la alcanza): se blinda, no se le cuelga aviso
          expect(n.onError).toBe('continueRegularOutput')
          expect(hoy.nodes.find((x) => x.name === nombreNota(c))).toBeUndefined()
        }
      })
    }
  }
  it('el emisor que mató la corrida ya no puede: error ⇒ «Nota perdida» ⇒ sólo el avisador (era hoja) · el camino principal ni lo ve', () => {
    expect(salidas(ALTA_HOY, EMISOR_QUE_MATO, 0)).toEqual([])
    expect(salidas(ALTA_HOY, EMISOR_QUE_MATO, 1)).toEqual([nombreNota(EMISOR_QUE_MATO)])
    expect(salidas(ALTA_HOY, nombreNota(EMISOR_QUE_MATO))).toEqual([AVISAR])
  })
  it('«cimiento.promoted» no es hoja: si la nota se pierde, «Armar carga · segunda fase» sigue recibiendo su ítem', () => {
    const c = '[MODELB] Emit · cimiento.promoted'
    expect(salidas(ALTA_HOY, c, 0)).toEqual(['Armar carga · segunda fase'])
    expect(salidas(ALTA_HOY, nombreNota(c))).toEqual(['Armar carga · segunda fase', AVISAR])
    expect(JSON.stringify(nodo(ALTA_HOY, 'Armar carga · segunda fase').parameters)).not.toMatch(/\$json\.(ok|event_id)/)
  })
  it('el aviso reusa el avisador que ya existe · sin esperar · si el aviso falla, la corrida sigue', () => {
    for (const [, , hoy] of PAREJAS) {
      const a = nodo(hoy, AVISAR)
      expect(a.type).toBe('n8n-nodes-base.executeWorkflow')
      expect(a.parameters.workflowId.value).toBe(AVISADOR_ID)
      expect(a.parameters.options.waitForSubWorkflow).toBe(false)
      expect(a.onError).toBe('continueRegularOutput')
      expect(hoy.connections[AVISAR]).toBeUndefined() // hoja
    }
  })
})

/** corre «Nota perdida» como n8n · $input = el ítem de error del emisor */
function notaPerdida(f: Flujo, c: string, item: any) {
  const code = String(nodo(f, nombreNota(c)).parameters.jsCode)
  return new Function('$input', '$execution', '$workflow', '$env', code)(
    { all: () => [{ json: item }] },
    { id: '141414', mode: 'webhook' },
    { id: 'LyVoKcrypS5uLyuu', name: 'Zero Risk — Client Onboarding E2E v2' },
    { N8N_BASE_URL: 'https://n8n-production-72be.up.railway.app' },
  )[0].json as Record<string, any>
}

describe('② la nota perdida queda en constancia · con el caso exacto de 141414', () => {
  it('devuelve {ok:false, code:nota_perdida} y el aviso en la forma que «Armar el aviso» entiende', () => {
    const out = notaPerdida(ALTA_HOY, EMISOR_QUE_MATO, { error: { message: 'The connection was aborted, perhaps the server is offline' } })
    expect(out.ok).toBe(false)
    expect(out.code).toBe('nota_perdida')
    expect(out.nota_perdida).toBe(true)
    expect(out.nodo).toBe(EMISOR_QUE_MATO)
    expect(out.error).toBe('The connection was aborted, perhaps the server is offline')
    expect(out.execution).toMatchObject({ id: '141414', mode: 'webhook', lastNodeExecuted: EMISOR_QUE_MATO, url: 'https://n8n-production-72be.up.railway.app/workflow/LyVoKcrypS5uLyuu/executions/141414' })
    expect(out.execution.error.message).toMatch(/^SE PERDIÓ UNA NOTA · la corrida SIGUE · /)
    expect(out.workflow).toEqual({ id: 'LyVoKcrypS5uLyuu', name: 'Zero Risk — Client Onboarding E2E v2' })
  })
  it('error como texto · error vacío · sin error: siempre una cadena, nunca revienta', () => {
    expect(notaPerdida(ALTA_HOY, EMISOR_QUE_MATO, { error: 'timeout' }).error).toBe('timeout')
    expect(notaPerdida(ALTA_HOY, EMISOR_QUE_MATO, { error: {} }).error).toBe('sin mensaje')
    expect(notaPerdida(ALTA_HOY, EMISOR_QUE_MATO, {}).error).toBe('sin mensaje')
  })
})

/** corre «Armar el aviso» como n8n · memoria vacía (sin freno) */
function armarElAviso(f: Flujo, item: any) {
  const code = String(nodo(f, 'Armar el aviso').parameters.jsCode)
  const mem: any = {}
  return new Function('$input', '$env', '$getWorkflowStaticData', code)({ first: () => ({ json: item }) }, {}, () => mem)[0].json as Record<string, any>
}

describe('③ el avisador · segunda entrada · «SE PERDIÓ UNA NOTA · la corrida SIGUE»', () => {
  it('la segunda entrada existe y desemboca en «Armar el aviso» · la primera (Error Trigger) sigue igual', () => {
    const t = nodo(AV_HOY, TRIGGER_NOTA)
    expect(t.type).toBe('n8n-nodes-base.executeWorkflowTrigger')
    expect(salidas(AV_HOY, TRIGGER_NOTA)).toEqual(['Armar el aviso'])
    expect(salidas(AV_HOY, 'Cuando un flujo muere')).toEqual(['Armar el aviso'])
    expect(AV_HOY.nodes.length).toBe(AV_VIVO.nodes.length + 1)
  })
  it('una nota perdida se titula distinto y lleva la bandera · el freno es el mismo (flujo + nodo)', () => {
    const nota = notaPerdida(ALTA_HOY, EMISOR_QUE_MATO, { error: { message: 'ECONNABORTED' } })
    const a = armarElAviso(AV_HOY, nota)
    expect(a.titulo).toMatch(/^SE PERDIÓ UNA NOTA · la corrida SIGUE · Zero Risk — Client Onboarding E2E v2 · nodo «\[MODELB\] Phase-boundary Emit · onboarding_specialist_done»/)
    expect(a.mensaje).toMatch(/^SE PERDIÓ UNA NOTA · la corrida SIGUE · .* · ECONNABORTED$/)
    expect(a.nota_perdida).toBe(true)
    expect(a.suprimido).toBe(false)
    expect(a.clave_freno).toBe('LyVoKcrypS5uLyuu::' + EMISOR_QUE_MATO)
    expect(a.execution_url).toBe('https://n8n-production-72be.up.railway.app/workflow/LyVoKcrypS5uLyuu/executions/141414')
  })
  it('una corrida muerta (Error Trigger) se sigue titulando «MURIÓ UNA CORRIDA» · igual que antes', () => {
    const item = { execution: { id: '141329', url: 'u', mode: 'webhook', lastNodeExecuted: 'Stop and Error · cimiento no promovido', error: { message: 'CIMIENTO NO PROMOVIDO' } }, workflow: { id: 'LyVoKcrypS5uLyuu', name: 'alta' } }
    const hoy = armarElAviso(AV_HOY, item)
    const antes = armarElAviso(AV_VIVO, item)
    expect(hoy.titulo).toMatch(/^MURIÓ UNA CORRIDA · alta · nodo «Stop and Error · cimiento no promovido»/)
    expect(hoy.nota_perdida).toBe(false)
    const { nota_perdida: _n, cuando: _c, ...restoHoy } = hoy
    const { cuando: _c2, ...restoAntes } = antes
    expect(restoHoy).toEqual(restoAntes)
  })
  it('el resto del avisador no cambió (AVISO · ¿Avisar? · Cierre · Suprimido · conexiones)', () => {
    for (const v of AV_VIVO.nodes) {
      if (v.name === 'Armar el aviso') continue
      expect(nodo(AV_HOY, v.name).parameters, v.name).toEqual(v.parameters)
    }
    for (const [from, c] of Object.entries(AV_VIVO.connections)) expect(AV_HOY.connections[from], from).toEqual(c)
  })
})

describe('④ nada que DECIDE cambió', () => {
  for (const [id, vivo, hoy] of PAREJAS) {
    const cosm = new Set(COSMETICOS[id as keyof typeof COSMETICOS])
    it(`${id} · todos los nodos fuera de la lista: parámetros, onError, retry y disabled idénticos`, () => {
      for (const v of vivo.nodes) {
        if (cosm.has(v.name)) continue
        const h = nodo(hoy, v.name)
        expect(h.parameters, v.name).toEqual(v.parameters)
        expect(h.onError ?? null, v.name).toBe(v.onError ?? null)
        expect(h.retryOnFail ?? false, v.name).toBe(v.retryOnFail ?? false)
        expect(h.disabled ?? false, v.name).toBe(v.disabled ?? false)
      }
    })
    it(`${id} · los nombrados que deciden siguen byte a byte: ${NO_SE_TOCAN[id as keyof typeof NO_SE_TOCAN].length} nodos`, () => {
      for (const n of NO_SE_TOCAN[id as keyof typeof NO_SE_TOCAN]) expect(nodo(hoy, n), n).toEqual(nodo(vivo, n))
    })
    it(`${id} · las conexiones de éxito de TODOS los nodos son las mismas · sólo se agregan salidas de error`, () => {
      for (const [from, c] of Object.entries(vivo.connections)) {
        expect(salidas(hoy, from, 0), from).toEqual((c.main?.[0] ?? []).map((x) => x.node))
        if (!cosm.has(from)) expect(hoy.connections[from], from).toEqual(c)
      }
    })
    it(`${id} · sólo se sumaron «Nota perdida · …» y el aviso`, () => {
      const nuevos = hoy.nodes.filter((n) => !vivo.nodes.some((v) => v.name === n.name)).map((n) => n.name)
      for (const n of nuevos) expect(n === AVISAR || n.startsWith('Nota perdida · '), n).toBe(true)
      expect(hoy.settings?.errorWorkflow ?? null).toBe(vivo.settings?.errorWorkflow ?? null)
    })
  }
  it('el barrido de la cadena: E57 · sobre y la entrada de trato cerrado (deciden) no están en ninguna lista', () => {
    const todas = Object.values(COSMETICOS).flat()
    expect(todas).not.toContain('E57 · sobre · pedir planeación a la sala')
    expect(todas).not.toContain('Confirm barato · competitor list')
    expect(todas).not.toContain('Dejar el sobre en la puerta de la sala')
  })
})
