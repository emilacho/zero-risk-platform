/** La respuesta de `/api/brain/alimentar/modo`: la lógica vive aquí para probarla con un reloj y un lector del plan simulados. */
import { corridaForzada, corridaProgramadaAhora, corridasPorDiaDelEntorno, horasDeCorrida, modoDelEntorno, topeDiarioPorClienteUsd } from './modo'
import { decidirPlanApify, pctMaximoDelPlan, type UsoDelPlan } from './plan-apify'

export async function corridaDeLaHora(d: { env?: Record<string, string | undefined>; ahora?: Date; uso?: () => Promise<{ ok: true; uso: UsoDelPlan } | { ok: false; detalle: string }> } = {}): Promise<Record<string, unknown>> {
  const env = d.env ?? process.env
  const ahora = d.ahora ?? new Date()
  const m = modoDelEntorno(env)
  const programada = corridaProgramadaAhora(m.modo, ahora, 20, env)
  const cpd = corridasPorDiaDelEntorno(m.modo, env)
  const u = d.uso ? await d.uso().catch((e: unknown) => ({ ok: false as const, detalle: e instanceof Error ? e.message : String(e) })) : null
  return {
    modo: m.modo, origen_del_modo: m.origen, ...(m.aviso ? { aviso: m.aviso } : {}), ...(cpd.aviso ? { aviso_corridas: cpd.aviso } : {}),
    corre_ahora: programada !== null,
    hora_programada: programada ? programada.toISOString() : null,
    forzar: programada !== null && corridaForzada(m.modo),
    corridas_utc: horasDeCorrida(m.modo, env).map((c) => c.hhmm), corridas_por_dia: cpd.n, origen_de_las_corridas: cpd.origen,
    tope_diario_por_cliente_usd: topeDiarioPorClienteUsd(m.modo),
    plan_apify: u === null ? null : u.ok ? { ...u.uso, ...decidirPlanApify(u.uso, pctMaximoDelPlan(env)) } : { leido: false, detalle: u.detalle },
    ahora: ahora.toISOString(),
    modelos_llamados: 0,
  }
}
