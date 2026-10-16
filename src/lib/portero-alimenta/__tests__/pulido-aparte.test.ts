/**
 * EL PULIDO DEL RESUMEN VIVO EN SU PROPIO PASO (16-oct · «calidad sobre precio», tope US$ 0,30) · los diez clientes de prueba, el agente simulado (US$ 0).
 *   · apagado = no lee ni escribe; en seco no llama al agente; real: archiva la versión pulida y retira la anterior (nada se borra);
 *   · tope US$ 0,30: un pulido que cuesta más se descarta y queda el resumen por código; un agente que falla deja el resumen por código;
 *   · una vez por día y cliente (la repetición no paga dos veces; `forzar` sí);
 *   · no corre si el gasto de hoy + 0,30 pasaría el tope del portero;
 *   · ④ y el despertar ya NO reciben al agente (el pulido no puede volver a trabar el guardado).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rutaPulir } from '../pulido-aparte'
import { alimentarCliente } from '../alimentar'
import { citasDeUnResumen } from '../auditoria'
import { TOPE_DEL_PULIDO_APARTE_USD } from '../datos'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const ENC = { ...ON, resumen_vivo: true, resumen_pulido: true }
/** un agente «bueno»: mismas líneas, con las de cada sección al revés */
const reordenar = (tarea: string) => {
  const texto = tarea.split('RESUMEN ARMADO:\n')[1]
  return texto.split('\n\n').map((b) => { const l = b.split('\n'); return l[0].startsWith('## ') ? [l[0], ...l.slice(1).reverse()].join('\n') : b }).join('\n\n')
}
const agente = (costo = 0.24) => { const llamadas: string[] = []; return { llamadas, f: async (t: string) => { llamadas.push(t); return { texto: reordenar(t), costo_usd: costo } } } }

/** deja el cliente con su resumen por código ya archivado (lo que deja ④) */
async function conResumen(c: (typeof DIEZ_CLIENTES)[number]): Promise<T> {
  const t = tablasDe(c)
  const r = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ENC, ahora: AHORA, ...WF })
  expect(r.errores).toEqual([])
  return t
}
const vivos = (t: T, c: { id: string }) => t.cerebro_fichas.filter((f) => f.client_id === c.id && f.clase === 'resumen_vivo' && !f.retirada_en)

describe('el pulido aparte, con los diez clientes', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): pule, archiva la versión pulida y retira la anterior; una repetición no paga dos veces`, async () => {
      const t = await conResumen(c)
      const antes = vivos(t, c).find((f) => f.atributo === 'resumen:cliente')
      expect(antes).toBeTruthy()
      const a = agente()
      const deps = { db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: a.f, ahora: AHORA }
      const r = await rutaPulir(deps, { client_id: c.id, dry_run: false, ...WF })
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ ok: true, pulido: { usado: true }, escritas: 1, errores: [] })
      expect(a.llamadas).toHaveLength(1)
      const despues = vivos(t, c).filter((f) => f.atributo === 'resumen:cliente')
      expect(despues).toHaveLength(1)
      expect(despues[0].id).not.toBe(antes!.id)
      expect(citasDeUnResumen(String(despues[0].contenido)).length).toBeGreaterThanOrEqual(citasDeUnResumen(String(antes!.contenido)).length)
      expect(t.cerebro_fichas.find((f) => f.id === antes!.id)?.retirada_en).toBeTruthy() // la anterior queda retirada, no borrada
      // el segundo intento del mismo día: no llama al agente
      const otra = await rutaPulir(deps, { client_id: c.id, dry_run: false, ...WF })
      expect(otra.body).toMatchObject({ ya_pulido_hoy: true })
      expect(a.llamadas).toHaveLength(1)
      // forzar lo repite
      await rutaPulir(deps, { client_id: c.id, dry_run: false, forzar: true, ...WF })
      expect(a.llamadas).toHaveLength(2)
    })
  }
})

describe('el pulido aparte · guardas', () => {
  const c = DIEZ_CLIENTES[0]
  it('apagado (sin PORTERO_RESUMEN_PULIDO) no lee ni escribe', async () => {
    const t = await conResumen(c); const n = t.cerebro_fichas.length
    const a = agente()
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: { ...ON, resumen_vivo: true }, pulirResumen: a.f, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ apagado: true })
    expect(a.llamadas).toHaveLength(0); expect(t.cerebro_fichas).toHaveLength(n)
  })
  it('en seco no llama al agente ni escribe', async () => {
    const t = await conResumen(c); const n = t.cerebro_fichas.length
    const a = agente()
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: a.f, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect(r.status).toBe(200); expect(a.llamadas).toHaveLength(0); expect(t.cerebro_fichas).toHaveLength(n)
  })
  it('real sin workflow_id es 403 (los agentes solo corren desde un flujo)', async () => {
    const t = await conResumen(c)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente().f, ahora: AHORA }, { client_id: c.id, dry_run: false })
    expect(r.status).toBe(403)
  })
  it(`un pulido que cuesta más que US$ ${TOPE_DEL_PULIDO_APARTE_USD} se descarta y queda el resumen por código`, async () => {
    const t = await conResumen(c)
    const antes = vivos(t, c).map((f) => f.id)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(0.31).f, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ pulido: { usado: false }, escritas: 0 })
    expect(vivos(t, c).map((f) => f.id)).toEqual(antes)
  })
  it('un pulido de US$ 0,25 SÍ se usa (el tope es 0,30)', async () => {
    const t = await conResumen(c)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(0.25).f, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ pulido: { usado: true, costo_usd: 0.25 } })
  })
  it('si el agente falla, queda el resumen por código y no se escribe nada', async () => {
    const t = await conResumen(c)
    const antes = vivos(t, c).map((f) => f.id)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: async () => { throw new Error('run-sdk respondió 500') }, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.status).toBe(200); expect(r.body).toMatchObject({ pulido: { usado: false }, escritas: 0 })
    expect(vivos(t, c).map((f) => f.id)).toEqual(antes)
  })
  it('si el gasto de hoy + 0,30 pasaría el tope del portero, no llama al agente', async () => {
    const t = await conResumen(c)
    t.agent_invocations.push({ client_id: c.id, cost_usd: 2.8, created_at: AHORA.toISOString(), agent_name: 'x', workflow_id: 'ogfq56oIEoHufFPM' })
    const a = agente()
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: a.f, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(a.llamadas).toHaveLength(0)
    expect(r.body).toMatchObject({ pulido: { usado: false } })
  })
})

describe('④ y el despertar ya no llevan al agente del pulido', () => {
  for (const r of ['procesar', 'despertar']) {
    it(`/${r} no pasa pulirResumen`, () => {
      const src = fs.readFileSync(path.resolve(__dirname, `../../../app/api/brain/alimentar/${r}/route.ts`), 'utf8')
      expect(src).not.toMatch(/pulirResumen:/)
      expect(src).not.toMatch(/AGENTE_DEL_PULIDO/)
    })
  }
  it('/pulir existe con tope de la plataforma que cubre el plazo del agente', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../app/api/brain/alimentar/pulir/route.ts'), 'utf8')
    const m = /export const maxDuration = (\d+)/.exec(src)
    expect(Number(m![1])).toBeGreaterThanOrEqual(260)
  })
})

describe('el flujo: ⑧ va DESPUÉS del cierre y no toca ④', () => {
  const DIR = path.resolve(__dirname, '../../../../scripts/worker-staging/ogfq56oIEoHufFPM')
  const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as { nodes: Array<{ name: string; type: string; parameters: { jsCode?: string; url?: string; options?: { timeout?: number } } }>; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
  const ANTES = leer('portero-ANTES-pulido-aparte-2026-10-16.json')
  const DESPUES = leer('portero-ARREGLADO-pulido-aparte-2026-10-16.json')
  const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<Array<{ json: Record<string, unknown> }>>
  const quien = (ent: Record<string, unknown>, cierre: Record<string, unknown>, vig: Record<string, unknown> = {}) => {
    const f = new AsyncFunction('$', DESPUES.nodes.find((n) => n.name.startsWith('⑧ Quién'))!.parameters.jsCode!)
    const dolar = (n: string) => ({ first: () => ({ json: n.startsWith('⓪') ? ent : n.startsWith('⑤') ? cierre : vig }) })
    return f(dolar)
  }
  const C1 = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', C2 = '11111111-1111-4111-8111-111111111111'
  const E = { workflow_id: 'wf', workflow_execution_id: 'ex', dry_run: false }
  const CIERRE = { clientes: [{ cliente: C1, alimentar: 'hecha' }, { cliente: C2, alimentar: 'sin_respuesta' }] }
  it('solo se pule a quien guardó bien; en seco o con el cliente pausado, a nadie', async () => {
    expect((await quien(E, CIERRE)).map((i) => i.json.cliente)).toEqual([C1])
    expect(await quien({ ...E, dry_run: true }, CIERRE)).toEqual([])
    expect(await quien(E, CIERRE, { pausados: [{ client_id: C1 }] })).toEqual([])
    expect((await quien(E, CIERRE))[0].json).toMatchObject({ workflow_id: 'wf', workflow_execution_id: 'ex' })
  })
  it('el paso nuevo cuelga de ⑦ Reintento (al final) y su llamada espera lo que el agente necesita', () => {
    expect(DESPUES.connections['⑦ Reintento (misma mañana)'].main[0][0].node).toMatch(/^⑧ Quién/)
    const bis = DESPUES.nodes.find((n) => n.name.startsWith('⑧ bis'))!
    expect(bis.parameters.url).toMatch(/\/api\/brain\/alimentar\/pulir$/)
    expect(bis.parameters.options?.timeout).toBeGreaterThanOrEqual(280_000)
  })
  it('los demás nodos (④ incluido) quedan idénticos al respaldo', () => {
    const A = new Map(ANTES.nodes.map((n) => [n.name, JSON.stringify(n)]))
    for (const n of DESPUES.nodes) if (A.has(n.name)) expect(JSON.stringify(n), n.name).toBe(A.get(n.name))
    expect(DESPUES.nodes.length).toBe(ANTES.nodes.length + 2)
  })
})
