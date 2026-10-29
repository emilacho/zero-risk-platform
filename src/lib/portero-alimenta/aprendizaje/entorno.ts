/** El aprendizaje del dueño CABLEADO al entorno real (base, modelo, huellas, registro en `log-invocation`). Lo comparten la ruta del cron/POST, la puerta del dueño y la consulta. */
import { generateEmbedding, generateEmbeddings } from '../../brain/embed'
import { getSupabaseAdmin } from '../../supabase'
import type { Db } from '../alimentar'
import { llamarAlModelo } from '../../cerebro/portero/modelo'
import { crearRegistrador } from '../../cerebro/portero/registro'
import { parametrosDelEntorno } from './datos'
import { consultarAprendizaje, type ParametrosDeConsultaAprendizaje } from './consultar'
import { procesarAprendizaje, type PedidoDeProcesar } from './procesar'

export function procesarAprendizajeDelEntorno(o: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string }, pedido: PedidoDeProcesar) {
  return procesarAprendizaje({
    db: getSupabaseAdmin() as unknown as Db, llamarModelo: llamarAlModelo, registrar: crearRegistrador({ origen: o.origen, llaveInterna: o.llaveInterna }),
    embeber: async (textos) => { const r = await generateEmbeddings(textos); return r.ok ? { ok: true, embeddings: r.embeddings, modelo: r.model } : { ok: false, detalle: `${r.code}: ${r.detail}` } },
    workflowId: o.workflowId, ejecucionId: o.ejecucionId, parametros: parametrosDelEntorno(),
  }, pedido)
}

export function consultarAprendizajeDelEntorno(q: ParametrosDeConsultaAprendizaje) {
  return consultarAprendizaje({
    db: getSupabaseAdmin() as unknown as Db,
    embeberTarea: async (texto) => { const r = await generateEmbedding(texto); return r.ok ? { ok: true, embedding: r.embedding } : { ok: false, detalle: `${r.code}: ${r.detail}` } },
    parametros: parametrosDelEntorno(),
  }, q)
}
