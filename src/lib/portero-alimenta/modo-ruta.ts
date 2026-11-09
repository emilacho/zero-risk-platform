/** La respuesta de `/api/brain/alimentar/modo`: la lógica vive aquí para probarla con un reloj y un lector del plan simulados. */
import { corridaForzada, corridaProgramadaAhora, corridasCadaDiasDelEntorno, corridasPorDiaDelEntorno, diaConCorrida, horasDeCorrida, modoDelEntorno, pausaDelRaspadoDelEntorno, raspadoEnPausa, topeDiarioPorClienteUsd } from './modo'
import { motivoDeLaPausa, sostenerLaLineaDeLaPausa } from './pausa-del-raspado'
import { decidirPlanApify, pctMaximoDelPlan, type UsoDelPlan } from './plan-apify'

export async function corridaDeLaHora(d: {
  env?: Record<string, string | undefined>; ahora?: Date; uso?: () => Promise<{ ok: true; uso: UsoDelPlan } | { ok: false; detalle: string }>
  /** la línea visible de la pausa del raspado (un incidente en `cerebro_alertas`); sin estas dos no se escribe nada */
  avisar?: (texto: string, clave: string) => Promise<{ ok: boolean; detalle: string }>; resolver?: (clave: string, nota: string) => Promise<{ ok: boolean; detalle: string }>
} = {}): Promise<Record<string, unknown>> {
  const env = d.env ?? process.env
  const ahora = d.ahora ?? new Date()
  const m = modoDelEntorno(env)
  const programada = corridaProgramadaAhora(m.modo, ahora, 20, env)
  const cpd = corridasPorDiaDelEntorno(m.modo, env)
  const cada = corridasCadaDiasDelEntorno(env)
  const pausa = pausaDelRaspadoDelEntorno(env)
  const enPausa = raspadoEnPausa(ahora, env)
  const linea = await sostenerLaLineaDeLaPausa({ ahora, env, avisar: d.avisar, resolver: d.resolver })
  const u = d.uso ? await d.uso().catch((e: unknown) => ({ ok: false as const, detalle: e instanceof Error ? e.message : String(e) })) : null
  return {
    modo: m.modo, origen_del_modo: m.origen, ...(m.aviso ? { aviso: m.aviso } : {}), ...(cpd.aviso ? { aviso_corridas: cpd.aviso } : {}), ...(cada.aviso ? { aviso_cada_dias: cada.aviso } : {}),
    corre_ahora: programada !== null,
    hora_programada: programada ? programada.toISOString() : null,
    forzar: programada !== null && corridaForzada(m.modo),
    corridas_utc: horasDeCorrida(m.modo, env).map((c) => c.hhmm), corridas_por_dia: cpd.n, cada_dias: cada.cada, cada_dias_hasta: cada.hasta, hoy_toca_corrida: diaConCorrida(ahora, env), origen_de_las_corridas: cpd.origen,
    raspado_en_pausa: { activa: enPausa, hasta: pausa.hasta, ...(enPausa && pausa.hasta ? { motivo: `${motivoDeLaPausa(pausa.hasta)}: la corrida del horario corre como mantenimiento, sin pedirle nada a Apify (altas y pedidos del sistema raspan igual)` } : {}), linea: linea.accion, ...(pausa.aviso ? { aviso: pausa.aviso } : {}) },
    tope_diario_por_cliente_usd: topeDiarioPorClienteUsd(m.modo),
    plan_apify: u === null ? null : u.ok ? { ...u.uso, ...decidirPlanApify(u.uso, pctMaximoDelPlan(env)) } : { leido: false, detalle: u.detalle },
    ahora: ahora.toISOString(),
    modelos_llamados: 0,
  }
}
