/**
 * TOPE DE GASTO POR CAMPAÑA en autoproducir (CC1 · 10-nov) · el freno dentro de la llamada real, con el almacén en memoria y la sala de verdad · US$ 0, sin red.
 * Lo gastado se siembra CONSTRUIDO (los US$ 26,28 de Náufrago en una corrida); la lectura real de la base se prueba en `tope-de-campana.test.ts`.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { avisoDelTope, claveDelTope } from '../tope-de-campana'
import { filasAutoproducir } from '../autoproducir'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'

const NAU = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('autoproducir con el freno · avisa UNA vez por el buzón (condición 4 de CC7) · lo seco no lo consulta', () => {
  const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
  const PARTE = '22222222-2222-4222-8222-222222222222'
  const WF = { workflow_id: 'wf-copia-por-filas', workflow_execution_id: 'ex-1' }
  async function montar(tope: number | null, briefs = [{ brief_id: 'B1', fila_id: 'f1', familia: 'carrusel_mesa' }, { brief_id: 'B2', fila_id: 'f2', familia: 'kit_historias' }]) {
    const al = new AlmacenMemoria({ partes: [{ id: PARTE, client_id: CLIENTE, valido: true, briefs }], config: { flujos: ['wf-copia-por-filas'], estado_cadena: 'encendida' } })
    const c = await al.insertarCampana({ client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: '2026-11-10', fecha_inicio_origen: 'regla', fecha_fin: '2026-12-20', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: [], estado: 'activa', estado_motivo: null,
      presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: true, sala_ref: {}, reemplaza_a: null, seco: false, ...(tope === null ? {} : { tope_gasto_usd: tope }) })
    al.lecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }] } // construido: lo gastado de Náufrago en una sola corrida
    return { al, c }
  }
  const llamar = (al: AlmacenMemoria, id: string, dry_run = false) => filasAutoproducir(al, { campana_id: id, parte_id: PARTE, dry_run, ...WF })
  it('tope 40 con 26,28 gastado: sale el carrusel (5) y el kit (2,5) · sin aviso', async () => {
    const { al, c } = await montar(40)
    const r = await llamar(al, c.id)
    expect(r.cuerpo).toMatchObject({ emite: true, emitidos: 2, tope: { decision: 'cabe', tope: 40, gastado: 26.28, estimado: 7.5, retenidas: [] } })
    expect(al.avisosAlBuzon).toHaveLength(0)
  })
  it('tope 32: sale solo el primero · el buzón recibe UNA pregunta; repetir la llamada no abre otra (misma clave → «repetida»)', async () => {
    const { al, c } = await montar(32)
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emitidos: 1, tope: { decision: 'corta', retenidas: ['B2'] } })
    await llamar(al, c.id)
    expect(al.avisosAlBuzon.map((a) => [a.clave, a.tipo, a.accion])).toEqual([[claveDelTope(c.id, 32), 'pregunta', 'abrio'], [claveDelTope(c.id, 32), 'pregunta', 'repetida']])
    expect(al.avisosAlBuzon[0].origen).toMatch(/tope de campaña/)
  })
  it('si se SUBE el tope, el siguiente corte abre su propia pregunta (otra clave) y sale lo que ahora cabe', async () => {
    const { al, c } = await montar(32)
    await llamar(al, c.id)
    al.campanas[0].tope_gasto_usd = 36
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emitidos: 1, duplicados: 1 }) // B1 ya estaba; B2 cabe ahora (26,28 + 5 + 2,5 ≤ 36)
  })
  it('subir el tope y volver a cortar abre una pregunta NUEVA (la clave lleva el monto); con el mismo monto, no', async () => {
    const { al, c } = await montar(32)
    await llamar(al, c.id)
    al.campanas[0].tope_gasto_usd = 33 // 26,28 + 5 (B1, sin encargo aún) + 2,5 = 33,78 > 33 → vuelve a cortar
    await llamar(al, c.id)
    await llamar(al, c.id)
    expect(al.avisosAlBuzon.map((a) => [a.clave, a.accion])).toEqual([[claveDelTope(c.id, 32), 'abrio'], [claveDelTope(c.id, 33), 'abrio'], [claveDelTope(c.id, 33), 'repetida']])
  })
  it('sin tope: no sale nada y se pregunta una vez', async () => {
    const { al, c } = await montar(null)
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emite: false, motivo: 'campana_sin_tope', emitidos: 0 })
    expect(al.sala.size).toBe(0)
    expect(al.avisosAlBuzon.map((a) => a.tipo)).toEqual(['pregunta'])
  })
  it('gasto ilegible: no sale nada y suena UNA alarma (repetir suma repetición, no otra)', async () => {
    const { al, c } = await montar(40)
    al.falloDeLecturaDeGasto = 'la base no contesta'
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emite: false, motivo: 'gasto_de_campana_ilegible', emitidos: 0 })
    await llamar(al, c.id)
    expect(al.sala.size).toBe(0)
    expect(al.avisosAlBuzon.map((a) => [a.tipo, a.accion])).toEqual([['alarma', 'abrio'], ['alarma', 'repetida']])
  })
  it('sin el calendario legible no se sabe qué va antes: es gasto ilegible (no sale nada, alarma)', async () => {
    const { al, c } = await montar(40)
    al.filas = async () => { throw new Error('el calendario no contesta') }
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emite: false, motivo: 'gasto_de_campana_ilegible', emitidos: 0 })
    expect(al.avisosAlBuzon.map((a) => a.tipo)).toEqual(['alarma'])
    expect(al.avisosAlBuzon[0].detalle).toMatch(/calendario/) // el aviso dice QUÉ no se pudo leer
  })
  it('el ensayo en seco NO lee el gasto ni avisa (lo seco no gasta)', async () => {
    const { al, c } = await montar(null)
    expect((await llamar(al, c.id, true)).cuerpo).toMatchObject({ emite: true, emitidos: 2 })
    expect(al.lecturasDeGasto).toBe(0); expect(al.avisosAlBuzon).toHaveLength(0)
  })
  it('el texto del aviso dice la política entera (el buzón manda a Slack solo el primero)', () => {
    const a = avisoDelTope({ id: NAU, client_id: CLIENTE }, { tipo: 'corta', tope: 40, gastado: 26.28, comprometido: 0, estimado: 12.5, sueltan: ['a'], retenidas: ['b', 'c'] })
    expect(a.titulo).toMatch(/28de888e.*US\$ 40\.00.*2 piezas/)
    expect(a.detalle).toMatch(/no se reintentan solas/); expect(a.detalle).toMatch(/subir|sube/)
  })
})
