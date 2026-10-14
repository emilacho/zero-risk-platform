/**
 * Las dependencias REALES de las rutas del portero que alimenta (el modelo registrado y el puente al índice). Nada de esto corre en pruebas: allí se inyectan moldes.
 *  · el modelo: la misma llamada única del portero (`llamarAlModelo`, Sonnet 5.5, razonamiento al mínimo, 25 s, sin reintentos), REGISTRADA por `log-invocation` con `workflow_id`;
 *  · el «puente» NO es un empuje (firma 14-oct: las oficinas buscan al cerebro, el portero no empuja nada a la `jefatura` ni a la oficina): es mantener UNA sola biblioteca de consulta.
 *    Lo que el portero archiva se escribe también en el índice donde ya buscan (`client_brain_chunks`) POR la única puerta de escritura de evidencia (`/api/brain/ingest-source`),
 *    y el trozo de una ficha reemplazada SALE del índice (la ficha queda con su historia; el índice nunca miente).
 */
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

export function puenteAlIndice(o: { origen: string; llaveInterna: string; db: Db; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> }) {
  const traer = o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (p: { escribir: PuenteDeIndice[]; sacar: string[]; client_id: string }) => {
    const errores: string[] = []
    let escritos = 0, sacados = 0
    for (const x of p.escribir) {
      try {
        const r = await traer(`${o.origen.replace(/\/$/, '')}/api/brain/ingest-source`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': o.llaveInterna },
          body: JSON.stringify({ client_id: x.client_id, source_table: x.source_table, source_id: x.source_id, sections: x.sections, metadata: x.metadata, source: 'apify_scrape', scrape_trace: true }),
        })
        if (r.ok) escritos++; else errores.push(`ingest-source respondió ${r.status} para ${x.source_id}`)
      } catch (e) { errores.push(e instanceof Error ? e.message : String(e)) }
    }
    for (const id of p.sacar) {
      const d = await o.db.from('client_brain_chunks').delete().eq('client_id', p.client_id).eq('source_table', 'cerebro_fichas').eq('source_id', id)
      if (d.error) errores.push(`sacar ${id}: ${d.error.message}`); else sacados++
    }
    return { escritos, sacados, errores }
  }
}
