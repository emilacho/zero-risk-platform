/**
 * J8a · DESPERTAR AL FLUJO DE LA OFICINA tras la vuelta de la jefatura (R3 de CC#3). Cuando la jefatura entrega y lo que sigue en el encargo es un paso de EMPLEADO (la re-imagen), la ruta de vuelta
 * ya no tiene quien lo despierte (el flujo `oficina · turno` terminó al quedar el encargo esperando a la jefatura): sin esto el paso quedaba parado hasta que el vigía lo diera por muerto (12 min) y gastara un reintento.
 * Se despierta con la llave de despacho del ENTORNO de la ruta (nadie más la conoce). Nunca lanza: si no se puede, lo dice y el vigía de la oficina lo re-arma. Solo habla con NUESTRO n8n.
 */
/** nuestro n8n (la misma dirección que usa la jefatura; copia deliberada: la oficina no importa la jefatura fuera de su paso, y una prueba exige que sean iguales) */
export const N8N_POR_OMISION = 'https://n8n-production-72be.up.railway.app/webhook'

export interface EntornoDeDespertar { dispatchKey?: string; n8nWebhookBase?: string }
export type ResultadoDeDespertar = { despertado: true; status: number } | { despertado: false; motivo: string; status?: number }

/** la dirección del flujo de la oficina: SOLO nuestro n8n */
export const webhookDeLaOficina = (env: EntornoDeDespertar): string => `${((env.n8nWebhookBase ?? '').trim() || N8N_POR_OMISION).replace(/\/+$/, '')}/zero-risk/oficina-turno`

export async function despertarAlFlujoDeLaOficina(f: typeof fetch, env: EntornoDeDespertar, encargoId: string, turno: unknown): Promise<ResultadoDeDespertar> {
  const llave = (env.dispatchKey ?? '').trim()
  if (!llave) return { despertado: false, motivo: 'sin SALA_DISPATCH_KEY en este entorno: no se puede despertar al flujo (lo re-arma el vigía de la oficina)' }
  if (!turno || typeof turno !== 'object') return { despertado: false, motivo: 'no hay turno que despertar' }
  try {
    const w = await f(webhookDeLaOficina(env), { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': llave }, body: JSON.stringify({ encargo_id: encargoId, turno }), signal: AbortSignal.timeout(30000) })
    return w.ok ? { despertado: true, status: w.status } : { despertado: false, motivo: `el flujo contestó HTTP ${w.status}`, status: w.status }
  } catch (e) {
    return { despertado: false, motivo: `webhook inalcanzable: ${e instanceof Error ? e.message : String(e)}` }
  }
}
