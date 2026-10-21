/**
 * EL GASTO DEL DÍA INCLUYE AL PULIDO (21-oct). El vigilante (⑥) mide el gasto antes de que corra el pulido (⑧): el pulido real quedaba fuera de la cifra del día y de su aviso.
 * Al terminar, la ruta del pulido vuelve a medir el día, lo anota en el rastro del vigilante y avisa UNA vez por día y cliente si pasa el umbral. US$ 0 · sin red · los diez clientes.
 */
import { describe, expect, it } from 'vitest'
import { rutaPulir } from '../pulido-aparte'
import { alimentarCliente } from '../alimentar'
import { UMBRALES_DE_GASTO_POR_OMISION } from '../datos'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const ENC = { ...ON, resumen_vivo: true, resumen_pulido: true }
const DIA = AHORA.toISOString().slice(0, 10)
const reordenar = (tarea: string) => tarea.split('RESUMEN ARMADO:\n')[1].split('\n\n').map((b) => { const l = b.split('\n'); return l[0].startsWith('## ') ? [l[0], ...l.slice(1).reverse()].join('\n') : b }).join('\n\n')
const agente = async (t: string) => ({ texto: reordenar(t), costo_usd: 0.16 })

async function conResumen(c: (typeof DIEZ_CLIENTES)[number], gastoPrevio = 0): Promise<T> {
  const t = tablasDe(c)
  const r = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ENC, ahora: AHORA, ...WF })
  expect(r.errores).toEqual([])
  // ④ ya dejó el rastro de hoy; el vigilante (⑥) le anota su parte
  const rastro = t.cerebro_portero_corridas.find((f) => f.client_id === c.id && f.dia === DIA)
  const vig = { vigilante: { ok: true, problemas: [], gasto_usd: 0.1 } }
  if (rastro) rastro.resumen = { ...((rastro.resumen as object) ?? {}), ...vig }
  else t.cerebro_portero_corridas.push({ id: 'corrida-1', client_id: c.id, dia: DIA, estado: 'hecha', resumen: vig })
  if (gastoPrevio) t.agent_invocations.push({ id: 'inv-1', client_id: c.id, cost_usd: gastoPrevio, created_at: AHORA.toISOString(), agent_name: 'portero-del-cerebro', workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'x' })
  return t
}
const vigilanteDe = (t: T) => (t.cerebro_portero_corridas.find((f) => f.dia === DIA)!.resumen as { vigilante: Record<string, unknown> }).vigilante

describe('el gasto del día con el pulido dentro', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): bajo el umbral anota el gasto en el rastro y no avisa`, async () => {
      const t = await conResumen(c)
      const avisos: string[] = []
      const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente, ahora: AHORA, avisar: async (x) => { avisos.push(x); return { ok: true, detalle: '' } } }, { client_id: c.id, dry_run: false, ...WF })
      expect(r.body).toMatchObject({ ok: true, gasto_del_dia: { ok: true, incluye_pulido: true } })
      expect(avisos).toEqual([])
      expect(vigilanteDe(t)).toMatchObject({ ok: true, incluye_pulido: true })
      expect(vigilanteDe(t).aviso_de_gasto_dia).toBeUndefined()
    })
  }

  const c = DIEZ_CLIENTES[0]
  it('sobre el umbral de aviso: UN aviso por día y cliente, con la marca en el rastro; forzar de nuevo no repite', async () => {
    const t = await conResumen(c, UMBRALES_DE_GASTO_POR_OMISION.aviso_usd + 0.2)
    const avisos: string[] = []
    const deps = { db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente, ahora: AHORA, avisar: async (x: string) => { avisos.push(x); return { ok: true, detalle: '' } } }
    const r = await rutaPulir(deps, { client_id: c.id, dry_run: false, ...WF })
    expect((r.body as { gasto_del_dia: { gasto_usd: number } }).gasto_del_dia.gasto_usd).toBeGreaterThan(UMBRALES_DE_GASTO_POR_OMISION.aviso_usd)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatch(/con el pulido incluido/)
    expect(vigilanteDe(t)).toMatchObject({ aviso_de_gasto_dia: DIA, incluye_pulido: true })
    await rutaPulir(deps, { client_id: c.id, dry_run: false, forzar: true, ...WF })
    expect(avisos).toHaveLength(1)
  })
  it('si el vigilante ya avisó hoy, el pulido no vuelve a avisar y la marca se conserva', async () => {
    const t = await conResumen(c, UMBRALES_DE_GASTO_POR_OMISION.aviso_usd + 0.2)
    ;(vigilanteDe(t) as Record<string, unknown>).aviso_de_gasto_dia = DIA
    const avisos: string[] = []
    await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente, ahora: AHORA, avisar: async (x) => { avisos.push(x); return { ok: true, detalle: '' } } }, { client_id: c.id, dry_run: false, ...WF })
    expect(avisos).toEqual([])
    expect(vigilanteDe(t).aviso_de_gasto_dia).toBe(DIA)
  })
  it('un aviso que no se entrega no deja marca (se intenta de nuevo) y el pulido igual queda archivado', async () => {
    const t = await conResumen(c, UMBRALES_DE_GASTO_POR_OMISION.aviso_usd + 0.2)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente, ahora: AHORA, avisar: async () => { throw new Error('slack caído') } }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ ok: true, escritas: 1, pulido: { usado: true }, gasto_del_dia: { aviso: { ok: false } } })
    expect(vigilanteDe(t).aviso_de_gasto_dia).toBeUndefined()
  })
  it('sin rastro de hoy no rompe nada y lo dice', async () => {
    const t = await conResumen(c); t.cerebro_portero_corridas.splice(0, t.cerebro_portero_corridas.length)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ ok: true, pulido: { usado: true }, gasto_del_dia: { ok: true, rastro: expect.stringMatching(/sin rastro/) } })
  })
  it('en seco o apagado no mide ni escribe nada del gasto', async () => {
    const t = await conResumen(c)
    const antes = JSON.stringify(t.cerebro_portero_corridas)
    const seco = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente, ahora: AHORA }, { client_id: c.id, dry_run: true })
    expect('gasto_del_dia' in (seco.body as object)).toBe(false)
    expect(JSON.stringify(t.cerebro_portero_corridas)).toBe(antes)
  })
})
