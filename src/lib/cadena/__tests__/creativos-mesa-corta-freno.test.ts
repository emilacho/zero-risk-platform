/**
 * 17-nov · «creativos en cada paso» (punto 1 · lo que mide CC7) · el freno de la campaña: la pieza se reserva con lo de su versión con mesa (la que de verdad corre)
 * si la mesa está activa (tiene tope de familia activa).
 * 20-nov · «la mesa para todos los clientes» (firma de Emilio 12:37 Zúrich): sin lista de clientes, para cualquier cliente; y el carrusel también tiene su mesa. US$ 0, sin red.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { filasAutoproducir } from '../autoproducir'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('autoproducir · el freno reserva lo de la familia que corre', () => {
  const NAUFRAGO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
  /** un cliente que NO estaba en la vieja lista de la palanca */
  const OTRO = '00000000-0000-4000-8000-000000000099'
  const PARTE = '22222222-2222-4222-8222-222222222222'
  const WF = { workflow_id: 'wf-copia-por-filas', workflow_execution_id: 'ex-1' }
  async function montar(topes: Record<string, number>, o: { cliente?: string; carrusel?: string; config?: Record<string, unknown> } = {}) {
    const cliente = o.cliente ?? NAUFRAGO
    const al = new AlmacenMemoria({ partes: [{ id: PARTE, client_id: cliente, valido: true, briefs: [{ brief_id: 'B1', fila_id: 'f1', familia: o.carrusel ?? 'carrusel_mesa' }, { brief_id: 'B2', fila_id: 'f2', familia: 'kit_historias' }] }], config: { flujos: ['wf-copia-por-filas'], estado_cadena: 'encendida', ...(o.config ?? {}) } })
    const c = await al.insertarCampana({ client_id: cliente, plan_id: 'plan-1', fecha_inicio: '2026-11-10', fecha_inicio_origen: 'regla', fecha_fin: '2026-12-20', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: [], estado: 'activa', estado_motivo: null,
      presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: true, sala_ref: {}, reemplaza_a: null, seco: false, tope_gasto_usd: 40 })
    al.lecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }], topes_de_familia: topes }
    return { al, c }
  }
  const llamar = (al: AlmacenMemoria, id: string) => filasAutoproducir(al, { campana_id: id, parte_id: PARTE, dry_run: false, ...WF })
  const CON_KIT_MESA = { post_img: 2.5, carrusel_ig_v1: 2.5, kit_historias: 2.5, carrusel_mesa: 5, kit_mesa: 5 }

  it('kit_mesa activa: el kit reserva el tope de la mesa, 5 (estimado 10)', async () => {
    const { al, c } = await montar(CON_KIT_MESA)
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emite: true, emitidos: 2, tope: { decision: 'cabe', estimado: 10 } })
  })
  it('un cliente que NO estaba en la vieja lista reserva igual lo de la mesa (estimado 10)', async () => {
    const { al, c } = await montar(CON_KIT_MESA, { cliente: OTRO })
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ emite: true, emitidos: 2, tope: { decision: 'cabe', estimado: 10 } })
  })
  it('la vieja palanca ya no cuenta: aunque siga escrita con otro cliente, se reserva lo de la mesa', async () => {
    const { al, c } = await montar(CON_KIT_MESA, { config: { creativos_con_mesa: { clientes: [OTRO] } } })
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ tope: { estimado: 10 } })
  })
  it('kit_mesa APAGADA (sin tope de familia activa): el kit reserva lo de siempre (estimado 7,5)', async () => {
    const { al, c } = await montar({ post_img: 2.5, carrusel_ig_v1: 2.5, kit_historias: 2.5, carrusel_mesa: 5 })
    expect((await llamar(al, c.id)).cuerpo).toMatchObject({ tope: { estimado: 7.5 } })
  })
  it('el carrusel de la cadena (`carrusel_ig_v1`) reserva el tope de `carrusel_mesa` (5 + 5 = 10); sin esa mesa activa, el suyo (2,5 + 5 = 7,5)', async () => {
    const con = await montar(CON_KIT_MESA, { carrusel: 'carrusel_ig_v1' })
    expect((await llamar(con.al, con.c.id)).cuerpo).toMatchObject({ emite: true, emitidos: 2, tope: { decision: 'cabe', estimado: 10 } })
    const sin = await montar({ post_img: 2.5, carrusel_ig_v1: 2.5, kit_historias: 2.5, kit_mesa: 5 }, { carrusel: 'carrusel_ig_v1' })
    expect((await llamar(sin.al, sin.c.id)).cuerpo).toMatchObject({ tope: { estimado: 7.5 } })
  })
})
