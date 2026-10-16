/**
 * Las dependencias REALES de las rutas del portero que alimenta (el modelo registrado y el puente al índice). Nada de esto corre en pruebas: allí se inyectan moldes.
 *  · el modelo: la misma llamada única del portero (`llamarAlModelo`, Sonnet 5.5, razonamiento al mínimo, 25 s, sin reintentos), REGISTRADA por `log-invocation` con `workflow_id`;
 *  · el «puente» NO es un empuje (firma 14-oct: las oficinas buscan al cerebro, el portero no empuja nada a la `jefatura` ni a la oficina): es mantener UNA sola biblioteca de consulta.
 *    Lo que el portero archiva se escribe también en el índice donde ya buscan (`client_brain_chunks`) POR la única puerta de escritura de evidencia (`/api/brain/ingest-source`),
 *    y el trozo de una ficha reemplazada SALE del índice (la ficha queda con su historia; el índice nunca miente).
 */
import { enTandas } from './tandas'
import { llamarAlModelo } from '../cerebro/portero/modelo'
import { costoDeLaLlamada, MODELO, RAZONAMIENTO, TIEMPO_MAXIMO_MS } from '../cerebro/portero/razonar'
import { crearRegistrador } from '../cerebro/portero/registro'
import type { RespuestaDeLlamada } from './juez'
import type { PuenteDeIndice } from './archivar'
import type { Db } from './alimentar'

export const MAX_TOKENS_DEL_PORTERO = 1500

export function modeloRegistrado(o: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string; clientId: string; comando: string; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> }) {
  const registrar = crearRegistrador({ origen: o.origen, llaveInterna: o.llaveInterna, fetchImpl: o.fetchImpl })
  return async (instruccion: string, mensaje: string): Promise<RespuestaDeLlamada> => {
    const inicio = Date.now()
    const r = await llamarAlModelo({ model: MODELO, max_tokens: MAX_TOKENS_DEL_PORTERO, thinking: RAZONAMIENTO, system: instruccion, messages: [{ role: 'user', content: mensaje }], timeoutMs: TIEMPO_MAXIMO_MS })
    const costo = costoDeLaLlamada(r.usage)
    await registrar({
      workflow_id: o.workflowId, workflow_execution_id: o.ejecucionId, agent_name: 'portero-del-cerebro', agent_id: 'portero-del-cerebro', session_id: o.ejecucionId,
      model: MODELO, cost_usd: costo, duration_ms: Date.now() - inicio, tokens_input: r.usage.input_tokens, tokens_output: r.usage.output_tokens, num_turns: 1, status: 'completed',
      client_id: o.clientId, command: o.comando, response_text: r.texto.slice(0, 2000), metadata: { stop_reason: r.stop_reason ?? null },
    })
    return { texto: r.texto, costo_usd: costo, tokens_entrada: r.usage.input_tokens, tokens_salida: r.usage.output_tokens }
  }
}

/**
 * El pulido del resumen (15-oct): UN agente del roster por `/api/agents/run-sdk` (llave interna, SIN SALA_DISPATCH_KEY), con el workflow del portero en el cuerpo.
 * `x-skip-editor-middleware: 1`: es un resumen interno, no una pieza para el cliente; sin él, el agente de reportes dispararía su revisión de editor (más llamadas y una fila de bandeja).
 * Devuelve solo `texto` y `costo_usd`; lanza si la puerta responde mal (quien llama deja el resumen por código).
 */
export function agenteDelRoster(o: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string; clientId: string; agente: string; topeUsd: number; /** tiempo máximo que se espera al agente (ms); pasado eso el pulido se descarta y queda el resumen armado por código */ plazoMs?: number; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> }) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (tarea: string, opciones?: { topeUsd?: number }): Promise<{ texto: string; costo_usd: number }> => {
    const r = await traer(`${o.origen.replace(/\/$/, '')}/api/agents/run-sdk`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.llaveInterna, 'x-skip-editor-middleware': '1' },
      body: JSON.stringify({ agent: o.agente, task: tarea, client_id: o.clientId, workflow_id: o.workflowId, workflow_execution_id: `${o.ejecucionId}:resumen-pulido`, step_name: 'resumen-pulido', dry_run: false, force_restart: true, max_budget_usd: opciones?.topeUsd ?? o.topeUsd }),
      // 16-oct: el agente tardó >100 s y con el resto pasó los 120 s de ④; el pulido es un extra y NO puede comerse el presupuesto de la ruta
      signal: AbortSignal.timeout(o.plazoMs ?? PLAZO_DEL_PULIDO_MS),
    })
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null
    if (!r.ok || !j) throw new Error(`run-sdk respondió ${r.status}`)
    const texto = typeof j.response === 'string' ? j.response : typeof j.output === 'string' ? j.output : ''
    const costo = typeof j.cost_usd === 'number' && Number.isFinite(j.cost_usd) && j.cost_usd >= 0 ? j.cost_usd : 0
    return { texto, costo_usd: costo }
  }
}

/** lo máximo que se espera al agente del pulido */
export const PLAZO_DEL_PULIDO_MS = 40_000
const TROZOS_A_LA_VEZ = 3

export function puenteAlIndice(o: { origen: string; llaveInterna: string; db: Db; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> }) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (p: { escribir: PuenteDeIndice[]; sacar: string[]; client_id: string; hasta?: number }) => {
    const errores: string[] = []
    let escritos = 0, sacados = 0
    // cada trozo pasa por el modelo de huellas (~1-2 s): pocos a la vez y SIN arrancar otro pasada la hora límite (lo que no cupo queda como `quedan` y sigue la próxima pasada)
    await enTandas(p.escribir, TROZOS_A_LA_VEZ, async (x) => {
      try {
        const r = await traer(`${o.origen.replace(/\/$/, '')}/api/brain/ingest-source`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.llaveInterna },
          body: JSON.stringify({ client_id: x.client_id, source_table: x.source_table, source_id: x.source_id, sections: x.sections, metadata: x.metadata, source: 'apify_scrape', scrape_trace: true }),
        })
        if (r.ok) escritos++; else errores.push(`ingest-source respondió ${r.status} para ${x.source_id}`)
      } catch (e) { errores.push(e instanceof Error ? e.message : String(e)) }
    }, p.hasta)
    await enTandas(p.sacar, 10, async (id) => {
      const d = await o.db.from('client_brain_chunks').delete().eq('client_id', p.client_id).eq('source_table', 'cerebro_fichas').eq('source_id', id)
      if (d.error) errores.push(`sacar ${id}: ${d.error.message}`); else sacados++
    }, p.hasta)
    return { escritos, sacados, errores }
  }
}
