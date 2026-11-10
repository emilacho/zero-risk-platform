/**
 * Falla 1 (GO de Lenovo 10-nov 14:37Z): aprobar o pedir cambios desde el TABLERO no empujaba al instante: el sobre viajaba en la respuesta y el dashboard lo dejaba caer;
 * la campaña esperaba al vigía (hasta 30 min). Ahora la plataforma deja ella misma el sobre en la sala, con la MISMA clave que armaría el vigía en ese medio día
 * (la sala deduplica: la pasada del vigía sale `duplicado`). Desde un flujo, nada cambia: el flujo reenvía. US$ 0, sin modelo. Dos clientes de rubros distintos.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { WORKFLOW_DEL_TABLERO } from '../autorizar'
import { briefAbrir, conceptoAbrir, conceptoDecidir, recibirBrief, recibirConcepto, sobreDeTanda, type SobreDeTanda } from '../mesas'
import { calendarioSiguiente } from '../pasos'

const CAMP = 'camp-empuje'
const AHORA = '2026-10-09T15:00:00Z' // tarde en UTC: el tramo del vigía es «2026-10-09pm»
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
const tablero = (extra: Record<string, unknown> = {}) => ({ workflow_id: WORKFLOW_DEL_TABLERO, workflow_execution_id: `tablero:hitl-1:${AHORA}`, campana_id: CAMP, ...extra })
const VIGIA = { workflow_id: 'wf-vigia', workflow_execution_id: 'v1', campana_id: CAMP }

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

function almacen(c: ClienteFixture, extra: Record<string, unknown> = {}) {
  const al = new AlmacenMemoria({
    contextos: { [c.clientId]: contextoDe(c) },
    planes: { [c.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [c.clientId], nuevo_orden: { clientes: [c.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: c.clientId }],
    ...extra,
  })
  const campana: Campana = {
    id: CAMP, client_id: c.clientId, plan_id: 'plan-1', fecha_inicio: c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'EC', sedes: c.sedes.map((s) => s.clave),
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: c.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  return al
}
/** brief y gran idea genéricos: citan el plan DEL cliente (su primera línea con «semana»), así sirven para cualquier rubro */
function textos(c: ClienteFixture) {
  const cita = (c.planTexto.split('\n').find((l) => /semana/i.test(l) && l.trim().length > 20) ?? c.planTexto.split('\n').find((l) => l.trim().length > 20) ?? '').trim()
  const [red1, red2] = c.estrategia.canales.filter((x) => x.rol !== 'no').map((x) => x.red)
  const BRIEF = [
    '## De qué parte del plan sale', `Fase 1: «${cita}».`,
    '## Insight', 'La gente no sabe que puede venir antes del trabajo.', '## Mensaje', 'Te esperamos temprano.',
    '## Público', 'Gente del barrio que pasa entre semana (del plan).', '## Cómo sabremos que funcionó', 'Visitas por semana contra la meta del plan, revisadas cada lunes.', '## Objetivo', 'Que entren 30 visitas nuevas por semana.',
    `- ${red1}: que miren · «ven»`, `- ${red2 ?? red1}: que guarden · «guarda»`,
    '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: temprano', '- prohibido: barato; gratis', '- lo que no se dice: precios',
    '## Faltantes', '- público: el manual no dice edades', '## Contradicciones plan vs manual', '- ninguna',
  ].join('\n')
  const CONCEPTO = [
    '## Gran idea  La puerta abierta · Noventa días para llegar temprano', '## Por qué funciona  El insight dice que la gente no sabe que puede venir antes.',
    '## Cómo se ve  Luz de mañana.', '## Cómo suena  Voz cercana.',
    '## Capítulo f1 · Abrir la puerta', 'Qué cuenta: la puerta se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
    '## Banco de ideas',
    `- C1-I01 · ${red1} · foto · la primera llegada · mensaje: aquí te esperamos · gancho: ¿quién llega primero? · protagonista: la puerta · serie: ninguna · foto:ninguna`,
    `- C1-I02 · ${red2 ?? red1} · foto · la hora temprana · mensaje: ninguna hora sobra · gancho: son las siete · protagonista: el reloj · serie: ninguna · foto:ninguna`,
    '## Caminos descartados y por qué', '- «El producto del día»: habla del producto',
  ].join('\n')
  return { BRIEF, CONCEPTO }
}
const entrega = (version: number, texto: string) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })

async function conTarjeta(c: ClienteFixture, extra: Record<string, unknown> = {}) {
  const al = almacen(c, extra)
  const { BRIEF, CONCEPTO } = textos(c)
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
  expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, entrega(1, CONCEPTO), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
  al.sobresEmitidos.length = 0
  return al
}
/** el sobre que el vigía dejaría en la sala en su pasada de AHORA (mismo armado que su nodo «4 · Sobres de tanda») */
async function sobreDelVigia(al: AlmacenMemoria): Promise<SobreDeTanda | null> {
  const r = await calendarioSiguiente(al, VIGIA, AHORA)
  const b = r.cuerpo as { tanda?: unknown; etapa?: unknown }
  if (!Number.isInteger(b.tanda) || typeof b.etapa !== 'string') return null
  const camp = (await al.campana(CAMP))!
  return sobreDeTanda(camp, b.tanda as number, b.etapa)
}

describe('falla 1 · la decisión desde el tablero deja ella misma el sobre en la sala (dos clientes)', () => {
  for (const [nombre, cli] of [['café', clienteA()], ['clínica (otro rubro)', clienteB()]] as const) {
    it(`${nombre} · aprobar: UN sobre en la sala, idéntico al del vigía de ese medio día; la pasada del vigía sale «duplicado»`, async () => {
      const al = await conTarjeta(cli)
      const r = await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
      expect(al.sobresEmitidos).toHaveLength(1)
      const vigia = await sobreDelVigia(al)
      expect(vigia).not.toBeNull()
      expect(al.sobresEmitidos[0]).toEqual(vigia)
      expect((vigia as SobreDeTanda).idempotency_key).toMatch(/:2026-10-09pm$/)
      expect(r.cuerpo.empuje).toMatchObject({ resultado: 'aceptado' })
      expect((await al.emitirSobre(vigia as SobreDeTanda)).resultado).toBe('duplicado')
    })
    it(`${nombre} · pedir cambios: también empuja, con la etapa de la vuelta siguiente y la clave del vigía`, async () => {
      const al = await conTarjeta(cli)
      const r = await conceptoDecidir(al, tablero({ decision: 'cambios', apunta_a: 'concepto', nota: 'más cercano' }), AHORA)
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
      expect(al.sobresEmitidos).toHaveLength(1)
      expect(al.sobresEmitidos[0]).toEqual(await sobreDelVigia(al))
      expect((al.sobresEmitidos[0] as SobreDeTanda).idempotency_key).toContain(':abrir-concepto-v2:')
      expect(r.cuerpo.empuje).toMatchObject({ resultado: 'aceptado' })
    })
  }

  it('desde un FLUJO la plataforma no manda nada (el flujo reenvía el sobre de la respuesta, sin tramo, como siempre)', async () => {
    const al = await conTarjeta(clienteA())
    const r = await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)
    expect(r.status).toBe(200)
    expect(al.sobresEmitidos).toHaveLength(0)
    expect('empuje' in r.cuerpo).toBe(false)
    expect((r.cuerpo.siguiente as { sobre: SobreDeTanda }).sobre.idempotency_key).not.toMatch(/(am|pm)$/)
  })

  it('si la sala no acepta, la decisión queda guardada igual y la respuesta lo declara (el vigía queda de respaldo)', async () => {
    const al = await conTarjeta(clienteA(), { intakeApagado: true })
    const r = await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)
    expect(r.status).toBe(200)
    expect(al.conceptos[0]).toMatchObject({ aprobacion: 'aprobado' })
    expect(r.cuerpo.empuje).toMatchObject({ resultado: 'rechazado' })
  })

  it('si emitir revienta, tampoco tumba la decisión', async () => {
    const al = await conTarjeta(clienteA())
    al.emitirSobre = async () => { throw new Error('se cayó la base') }
    const r = await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo.empuje).toMatchObject({ resultado: 'rechazado', detalle: expect.stringContaining('se cayó la base') })
  })

  it('sin nada con qué volver a entrar (la campaña está en pausa), no deja ningún sobre y lo dice', async () => {
    const al = await conTarjeta(clienteA())
    al.campanas[0].estado = 'pausada'
    const r = await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)
    expect(r.status).toBe(200)
    expect(al.sobresEmitidos).toHaveLength(0)
    expect(r.cuerpo.empuje).toEqual({ resultado: 'nada_que_mandar' })
  })

  it('aprobar dos veces desde el tablero: la segunda no manda nada (ya decidido)', async () => {
    const al = await conTarjeta(clienteA())
    await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)
    const r = await conceptoDecidir(al, tablero({ decision: 'aprobar' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ya_decidido: true })
    expect(al.sobresEmitidos).toHaveLength(1)
  })
})
