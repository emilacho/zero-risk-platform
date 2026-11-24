/**
 * RETOMAR DONDE SE CAYÓ · GO Lenovo 24-nov · el reloj de la cadena NO vence una mesa que la oficina dejó EN PAUSA por causa externa (saldo, proveedor, red).
 * Vencerla abría una versión nueva (un encargo con el libro vacío) y se pagaba la mesa entera otra vez. Sin pausa, o si no se puede leer, vence como siempre.
 * Almacén en memoria, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { BriefCreativoGuardado, Campana, ConceptoGuardado, EsperaFila } from '../almacen'
import { cerrarMesasVencidas, HOLGURA_DE_MESA_MIN, MOTIVO_REABIERTA_POR_CAUSA_EXTERNA, objetoDeEsperaDeConcepto, PLAZO_DE_MESA_MIN, puertoDeLaCadena, reabrirConceptoPorCausaExterna, TIPO_DE_ESPERA_DE_CONCEPTO } from '../mesas'

const A = clienteA()
const CAMP = 'camp-1'
const PLAZO = '2026-11-24T04:00:00Z'
const TARDE = '2026-11-24T10:47:00Z'

function almacen() {
  const al = new AlmacenMemoria({ contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-11-20' }] }, config: { flujos: ['wf-cadena'] } })
  const campana: Campana = {
    id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  al.campanas.push(campana)
  return al
}
const concepto = (encargo: string | null): ConceptoGuardado => ({ campana_id: CAMP, version: 1, estado: 'abierta', aprobacion: null, texto_md: null, leido: null, brief_devuelto: null, motivo: null, costo_usd: null, plazo_en: PLAZO, encargo_id: encargo, seco: true } as ConceptoGuardado)
const brief = (encargo: string | null): BriefCreativoGuardado => ({ campana_id: CAMP, version: 1, estado: 'borrador', texto_md: null, leido: null, devolucion_texto: null, motivo: null, costo_usd: null, encargo_id: encargo, seco: true, plazo_en: PLAZO })

describe('el reloj de la cadena y la mesa en pausa', () => {
  it('la gran idea cuya mesa está en pausa NO queda sin_mesa al pasar el plazo; sigue abierta esperando la reanudación', async () => {
    const al = almacen()
    al.conceptos.push(concepto('enc-pausado'))
    al.mesasEnPausa.add('enc-pausado')
    expect(await cerrarMesasVencidas(al, TARDE)).toEqual([])
    expect(al.conceptos[0].estado).toBe('abierta')
  })
  it('el brief cuya mesa está en pausa NO queda descartado', async () => {
    const al = almacen()
    al.briefsCreativos.push(brief('enc-pausado'))
    al.mesasEnPausa.add('enc-pausado')
    expect(await cerrarMesasVencidas(al, TARDE)).toEqual([])
    expect(al.briefsCreativos[0].estado).toBe('borrador')
  })
  it('control: sin pausa (o sin encargo) vence como siempre', async () => {
    const al = almacen()
    al.conceptos.push(concepto('enc-otro'))
    al.briefsCreativos.push(brief(null))
    al.mesasEnPausa.add('enc-pausado')
    const out = await cerrarMesasVencidas(al, TARDE)
    expect(out).toHaveLength(2)
    expect(al.conceptos[0].estado).toBe('sin_mesa')
    expect(al.briefsCreativos[0].estado).toBe('descartada')
  })
  it('levantada la pausa, el plazo vuelve a valer', async () => {
    const al = almacen()
    al.conceptos.push(concepto('enc-pausado'))
    al.mesasEnPausa.add('enc-pausado')
    await cerrarMesasVencidas(al, TARDE)
    al.mesasEnPausa.delete('enc-pausado')
    await cerrarMesasVencidas(al, TARDE)
    expect(al.conceptos[0].estado).toBe('sin_mesa')
  })
  it('si la lectura de la pausa falla, vence como siempre (nunca deja una mesa colgada para siempre)', async () => {
    const al = almacen()
    al.conceptos.push(concepto('enc-pausado'))
    al.mesaEnPausa = async () => { throw new Error('la base no contestó') }
    await cerrarMesasVencidas(al, TARDE)
    expect(al.conceptos[0].estado).toBe('sin_mesa')
  })
})

describe('reabrir la gran idea que la mesa entregó a medias por una caída externa (GO Lenovo 10:53Z)', () => {
  const lista = (o: Partial<ConceptoGuardado> = {}): ConceptoGuardado => ({ ...concepto('enc-1'), estado: 'lista', aprobacion: 'pendiente', texto_md: 'la integración vieja', leido: { estado: 'lista' }, hitl_id: 'hitl-1', ...o } as ConceptoGuardado)
  const montarLista = (o: Partial<ConceptoGuardado> = {}) => {
    const al = almacen()
    al.conceptos.push(lista(o))
    al.tarjetas.push({ id: 'hitl-1', status: 'pending', decision: null } as never)
    al.esperas.push({ id: 1, campana_id: CAMP, objeto_tipo: TIPO_DE_ESPERA_DE_CONCEPTO, objeto_id: objetoDeEsperaDeConcepto(1), motivo: null, desde: PLAZO, recordatorio_en: null, alerta_en: null, vence_en: '2027-01-01T00:00:00Z', estado: 'viva', rung_enviado: 0, dedup_key: 'concepto:camp-1:v1', accion_al_vencer: 'recordar', seco: true } as EsperaFila)
    return al
  }
  const P = { campana_id: CAMP, version: 1, encargo_id: 'enc-1' }

  it('lista + pendiente, la última, del mismo encargo: vuelve a abierta con plazo nuevo; la espera se CANCELA y la tarjeta se RETIRA (no es una decisión de Emilio)', async () => {
    const al = montarLista()
    expect(await reabrirConceptoPorCausaExterna(al, P, TARDE)).toEqual({ ok: true, estado: 'abierta' })
    expect(al.conceptos[0]).toMatchObject({ estado: 'abierta', aprobacion: null, texto_md: null, leido: null, hitl_id: null, motivo: MOTIVO_REABIERTA_POR_CAUSA_EXTERNA })
    expect(Date.parse(al.conceptos[0].plazo_en as string)).toBe(Date.parse(TARDE) + (PLAZO_DE_MESA_MIN.concepto + HOLGURA_DE_MESA_MIN) * 60_000)
    expect(al.esperas[0].estado).toBe('cancelada')
    expect(al.tarjetas[0]).toMatchObject({ status: 'rejected', decision: { accion: 'retirada_para_retomar', version: 1 } })
    // la entrega siguiente de la MISMA mesa se acepta (antes de reabrir, contestaba «ya_cerrada»)
    expect((await al.conceptosDe(CAMP))[0].estado).toBe('abierta')
  })
  it('una gran idea que Emilio ya decidió NO se reabre (aprobada o mandada a cambios)', async () => {
    for (const aprobacion of ['aprobado', 'cambios'] as const) {
      const al = montarLista({ aprobacion })
      const r = await reabrirConceptoPorCausaExterna(al, P, TARDE)
      expect(r.ok).toBe(false)
      expect(al.conceptos[0].estado).toBe('lista')
      expect(al.esperas[0].estado).toBe('viva')
    }
  })
  it('otra versión vino después, o la entregó otro encargo, o no existe: no se reabre', async () => {
    const despues = montarLista(); despues.conceptos.push({ ...concepto('enc-2'), version: 2 })
    expect((await reabrirConceptoPorCausaExterna(despues, P, TARDE)).ok).toBe(false)
    expect(despues.conceptos[0].estado).toBe('lista')
    const otro = montarLista({ encargo_id: 'enc-9' })
    expect((await reabrirConceptoPorCausaExterna(otro, P, TARDE)).ok).toBe(false)
    expect((await reabrirConceptoPorCausaExterna(montarLista(), { ...P, version: 7 }, TARDE)).ok).toBe(false)
    expect((await reabrirConceptoPorCausaExterna(montarLista(), { ...P, campana_id: 'otra' }, TARDE)).ok).toBe(false)
  })
  it('una gran idea sin_mesa o abierta no se «reabre»', async () => {
    for (const estado of ['sin_mesa', 'abierta', 'brief_devuelto'] as const) {
      const al = montarLista({ estado })
      expect((await reabrirConceptoPorCausaExterna(al, P, TARDE)).ok).toBe(false)
      expect(al.conceptos[0].estado).toBe(estado)
    }
  })
  it('la escritura es condicional: si la fila cambió entre la lectura y la escritura, no reabre ni toca la espera', async () => {
    const al = montarLista()
    al.actualizarConceptoSi = async () => false
    expect((await reabrirConceptoPorCausaExterna(al, P, TARDE)).ok).toBe(false)
    expect(al.esperas[0].estado).toBe('viva')
    expect(al.tarjetas[0].status).toBe('pending')
  })
  it('el puerto de la oficina lo expone y nunca lanza', async () => {
    const al = montarLista()
    const p = puertoDeLaCadena(al, () => TARDE)
    expect(await p.reabrirConcepto(P)).toEqual({ ok: true, estado: 'abierta' })
    const roto = puertoDeLaCadena(() => { throw new Error('sin base') }, () => TARDE)
    expect(await roto.reabrirConcepto(P)).toMatchObject({ ok: false })
  })
})
