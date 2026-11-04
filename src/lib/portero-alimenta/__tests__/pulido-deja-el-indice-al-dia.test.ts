/**
 * 04-nov (firma de Emilio): el índice queda al día EN LA MISMA corrida. El pulido (⑧) corre DESPUÉS de que ④ bis cerró el puente: archiva una ficha NUEVA y retira la anterior,
 * así que sin puente propio quedaban 1 trozo por escribir + 1 por sacar y «cerebro listo» salía en falso hasta una pasada extra. US$ 0 · los diez clientes de práctica.
 */
import { describe, expect, it } from 'vitest'
import { rutaPulir } from '../pulido-aparte'
import { alimentarCliente } from '../alimentar'
import { reconciliarYEnviar } from '../rutas'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const ENC = { ...ON, resumen_vivo: true, resumen_pulido: true }
const reordenar = (tarea: string) => tarea.split('RESUMEN ARMADO:\n')[1].split('\n\n').map((b) => { const l = b.split('\n'); return l[0].startsWith('## ') ? [l[0], ...l.slice(1).reverse()].join('\n') : b }).join('\n\n')
const agente = (costo = 0.24) => async (t: string) => ({ texto: reordenar(t), costo_usd: costo })

/** el índice simulado: escribe y saca trozos en `client_brain_chunks` como el real */
const puenteSimulado = (t: T, o: { falla?: boolean } = {}) => async (p: { escribir: Array<{ source_id: string }>; sacar: string[]; client_id: string }) => {
  if (o.falla) return { escritos: 0, sacados: 0, errores: ['ingest-source respondió 502'] }
  for (const x of p.escribir) t.client_brain_chunks.push({ client_id: p.client_id, source_table: 'cerebro_fichas', source_id: x.source_id })
  t.client_brain_chunks = t.client_brain_chunks.filter((c) => !(c.client_id === p.client_id && p.sacar.includes(String(c.source_id))))
  return { escritos: p.escribir.length, sacados: p.sacar.length, errores: [] }
}
const quedan = async (t: T, id: string) => {
  const x = await reconciliarYEnviar({ db: crearBaseFalsa(t as never).db, interruptores: ENC }, id, true)
  return Number(x.puente.quedan)
}
/** deja al cliente como lo deja ④ + ④ bis: resumen por código archivado y el índice AL DÍA */
async function cerradoPor4(c: (typeof DIEZ_CLIENTES)[number]): Promise<T> {
  const t = tablasDe(c); t.client_brain_chunks ??= []
  const r = await alimentarCliente({ db: crearBaseFalsa(t as never).db, client_id: c.id, dry_run: false, interruptores: ENC, ahora: AHORA, ...WF })
  expect(r.errores).toEqual([])
  for (let i = 0; i < 6 && (await quedan(t, c.id)) > 0; i++) await reconciliarYEnviar({ db: crearBaseFalsa(t as never).db, interruptores: ENC, puente: puenteSimulado(t) }, c.id, false)
  expect(await quedan(t, c.id)).toBe(0)
  return t
}

describe('el pulido deja el índice al día en la misma corrida', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: ficha reemplazada por el pulido ⇒ se escribe la nueva y se saca la vieja, quedan = 0`, async () => {
      const t = await cerradoPor4(c)
      const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(), puente: puenteSimulado(t), ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
      expect(r.body).toMatchObject({ ok: true, pulido: { usado: true }, escritas: 1, errores: [], puente: { quedan: 0 } })
      expect(await quedan(t, c.id)).toBe(0)
      const nueva = t.cerebro_fichas.find((f) => f.client_id === c.id && f.clase === 'resumen_vivo' && !f.retirada_en && String(f.ref).endsWith(':pulido'))!
      const vieja = t.cerebro_fichas.find((f) => f.client_id === c.id && f.clase === 'resumen_vivo' && f.retirada_en)!
      const ids = t.client_brain_chunks.filter((x) => x.client_id === c.id).map((x) => x.source_id)
      expect(ids).toContain(nueva.id); expect(ids).not.toContain(vieja.id)
    })
  }
  it('sin el puente propio queda 1 por escribir + 1 por sacar (el defecto que se arregla)', async () => {
    const c = DIEZ_CLIENTES[0]; const t = await cerradoPor4(c)
    await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(), ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(await quedan(t, c.id)).toBe(2)
  })
  it('si una pasada no alcanza (el índice trabaja de a 1) repite hasta quedan = 0 dentro de la misma corrida', async () => {
    const c = DIEZ_CLIENTES[0]; const t = await cerradoPor4(c); let pasadas = 0
    const lento = async (p: { escribir: Array<{ source_id: string }>; sacar: string[]; client_id: string }) => { pasadas++; return puenteSimulado(t)({ client_id: p.client_id, escribir: p.escribir.slice(0, 1), sacar: p.escribir.length ? [] : p.sacar.slice(0, 1) }) }
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(), puente: lento, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ ok: true, puente: { quedan: 0 } }); expect(pasadas).toBeGreaterThan(1); expect(await quedan(t, c.id)).toBe(0)
  })
  it('si el puente falla se DICE (ok:false, error) y no se da por al día', async () => {
    const c = DIEZ_CLIENTES[0]; const t = await cerradoPor4(c)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(), puente: puenteSimulado(t, { falla: true }), ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body.ok).toBe(false); expect((r.body.errores as string[]).join()).toMatch(/502/)
  })
  it('un pulido descartado no cambia fichas ⇒ no llama al puente', async () => {
    const c = DIEZ_CLIENTES[0]; const t = await cerradoPor4(c); let llamadas = 0
    const p = puenteSimulado(t)
    const r = await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: ENC, pulirResumen: agente(0.31), puente: async (x) => { llamadas++; return p(x) }, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(r.body).toMatchObject({ pulido: { usado: false } }); expect(llamadas).toBe(0)
  })
  it('con el interruptor del puente apagado no escribe en el índice', async () => {
    const c = DIEZ_CLIENTES[0]; const t = await cerradoPor4(c); let llamadas = 0
    await rutaPulir({ db: crearBaseFalsa(t as never).db, interruptores: { ...ENC, puente_al_indice: false }, pulirResumen: agente(), puente: async () => { llamadas++; return { escritos: 0, sacados: 0, errores: [] } }, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF })
    expect(llamadas).toBe(0)
  })
})
