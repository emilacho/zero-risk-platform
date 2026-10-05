/**
 * El registro de cada llamada al modelo: va por `POST /api/agents/log-invocation` (la ruta que ya existe y exige `workflow_id`),
 * así el costo y la duración quedan en el libro de invocaciones que ya leen los vigilantes de gasto. No toca la libreta `costs`.
 * Si el registro falla, devuelve el motivo: nunca rompe la respuesta del portero.
 */
import type { ResultadoDeRegistro } from './razonar'

export function crearRegistrador(args: { origen: string; llaveInterna: string; fetchImpl?: (url: string, init?: RequestInit) => Promise<Response> }) {
  const traer = args.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (fila: Record<string, unknown>): Promise<ResultadoDeRegistro> => {
    try {
      const r = await traer(`${args.origen.replace(/\/$/, '')}/api/agents/log-invocation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': args.llaveInterna },
        body: JSON.stringify(fila),
      })
      return r.ok ? { ok: true } : { ok: false, detalle: `log-invocation respondió ${r.status}` }
    } catch (e) {
      return { ok: false, detalle: e instanceof Error ? e.message : String(e) }
    }
  }
}
