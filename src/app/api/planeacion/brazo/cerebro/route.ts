/**
 * POST /api/planeacion/brazo/cerebro · la puerta del CEREBRO.
 *
 * El cerebro se LEE, no se escribe (canon 06-sep · lo raspado es materia prima
 * y vive en su tabla). Esta puerta sólo busca y devuelve el contrato §4.2.
 *
 * 🔴 Cero fragmentos tras una búsqueda que SÍ respondió es `sin_dato` —
 * «este cliente todavía no tiene conocimiento cargado» es información real y
 * accionable para el plan. Que la búsqueda se rompa es `sin_respuesta`.
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { brazoCerebro } from '@/lib/planeacion/brazos'
import { conLimite, leerPedido, pedidoInvalido, responder, seRompio } from '@/lib/planeacion/puertas'
import { sinRespuesta } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUENTE = 'cerebro · client_brain_chunks (pgvector)'

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return responder(sinRespuesta({
      brazo: 'cerebro', objetivo: '(sin objetivo)', fuente: FUENTE,
      motivo: 'la puerta rechazó la llamada · ' + auth.reason + ' · NO se consultó a la fuente',
    }))
  }
  const leido = await leerPedido(req)
  if (!leido.ok) return pedidoInvalido('cerebro', FUENTE, undefined, leido.motivo)
  const { client_id, objetivo, proposito, limite_ms, params } = leido.pedido
  const extra = { ...(limite_ms !== undefined ? { limite_ms } : {}), ...(proposito ? { proposito } : {}) }
  const obj = objetivo || 'cerebro_cliente'

  if (!client_id) return pedidoInvalido('cerebro', FUENTE, obj, 'falta client_id', extra)

  const k = Math.min(Math.max(Number(params?.k ?? 12) || 12, 1), 100)
  const secciones = Array.isArray(params?.secciones) ? (params?.secciones as string[]) : null

  try {
    const r = await brazoCerebro({
      objetivo: obj,
      fuente: FUENTE,
      ...extra,
      buscar: () => conLimite(limite_ms, async () => {
        const sb = getSupabaseAdmin()
        let q = sb
          .from('client_brain_chunks')
          .select('id, source_table, source_id, section_label, chunk_text, provenance_tag, created_at')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })
          .limit(k)
        if (secciones && secciones.length) q = q.in('section_label', secciones)
        const { data, error } = await q
        // 🔴 un error de la base NO es «el cliente no tiene conocimiento»
        if (error) throw new Error('la búsqueda falló · ' + error.message)
        return (data ?? []).map((f) => ({
          seccion: f.section_label,
          de_donde: f.source_table,
          // el texto se recorta para no inflar la respuesta · se declara el recorte
          texto: String(f.chunk_text ?? '').slice(0, 2000),
          recortado: String(f.chunk_text ?? '').length > 2000,
          procedencia: f.provenance_tag ?? null,
          cargado_el: f.created_at,
        }))
      }),
    })
    return responder(r)
  } catch (e) {
    return seRompio('cerebro', FUENTE, obj, e, extra)
  }
}
