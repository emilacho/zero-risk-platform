// EL NÚCLEO DEL SECO DE LA OFICINA FINANCIERA · CC#2 · 14-oct. Corre UNA celda contra «algo que contesta como la ruta»: `llamar(cuerpo) → { status, json }`.
// Por la ruta real, `llamar` es un POST a `/api/finanzas/conversa` con la llave interna; en la prueba, es el orquestador real con una base en memoria. El mismo código en los dos lados.
import { evaluar } from './matriz.mjs'

export const MAX_AVANCES = 40

/** abre el encargo, avanza paso a paso con la simulación de la celda hasta que termina (o se pasa de MAX_AVANCES) y lee de vuelta turnos y gasto */
export async function correrCelda(llamar, celda) {
  const abrir = await llamar({ accion: 'abrir', client_id: celda.client_id, dry_run: true, semilla: celda.semilla })
  const obs = { abrir_status: abrir.status, encargo_id: abrir.json?.encargo_id ?? null, estado: null, gasto_usd: 0, pasos: [], turnos: [], llamadas: [], avances: 0, ultimo: null }
  if (abrir.status !== 200 || !obs.encargo_id) return { celda, obs, veredicto: evaluar(celda, obs) }
  for (let i = 0; i < MAX_AVANCES; i++) {
    const r = await llamar({ accion: 'avanzar', encargo_id: obs.encargo_id, simulacion: celda.simulacion })
    obs.avances++
    obs.ultimo = { status: r.status, estado: r.json?.estado, terminado: r.json?.terminado === true }
    if (r.status !== 200) { obs.estado = `http_${r.status}:${r.json?.error ?? ''}`; break }
    if (typeof r.json?.paso === 'string') obs.pasos.push(r.json.paso)
    for (const l of r.json?.simulado?.llamadas ?? []) obs.llamadas.push(l)
    obs.gasto_usd = Number(r.json?.gasto_usd ?? obs.gasto_usd)
    if (r.json?.terminado === true) { obs.estado = r.json.estado; break }
  }
  const leido = await llamar({ accion: 'leer', encargo_id: obs.encargo_id })
  if (leido.status === 200) {
    obs.turnos = leido.json.turnos ?? []
    obs.gasto_usd = Number(leido.json.gasto_usd ?? obs.gasto_usd)
    if (obs.estado === null) obs.estado = leido.json.estado
  }
  return { celda, obs, veredicto: evaluar(celda, obs) }
}

/** un resumen corto de una celda para el informe (sin las salidas completas) */
export function resumenDeCelda(r) {
  return {
    id: r.celda.id, ok: r.veredicto.ok, fallas: r.veredicto.fallas, estado: r.obs.estado, pasos: r.obs.pasos, gasto_usd: r.obs.gasto_usd,
    llamadas: r.obs.llamadas.length, encargo_id: r.obs.encargo_id,
  }
}
