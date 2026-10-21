/**
 * RECIBIR la intención de Emilio y convertirla en cambios · todo por los puertos (sin red propia).
 *  · Solo decide quien está en la lista de autorizados (vacía ⇒ nadie: falla cerrado).
 *  · APROBAR / RECHAZAR deciden la pieza por la ruta de siempre y guardan la nota (con el motivo, si lo hubo). Una pieza ya decidida NO se vuelve a decidir.
 *  · COMENTAR en el hilo guarda una nota y no cambia la decisión de la pieza.
 *  · Idempotente: cada nota tiene una clave única (el mismo clic o el mismo mensaje repetido no duplica nada).
 */
import { alcanceYComentario, type Intencion } from './interpretar'
import type { ConfiguracionDeNotas, NotaNueva, PiezaDeBandeja, PuertosDeNotas } from './tipos'

export const TIPO_PIEZA = 'content_piece_review'

export interface Respuesta { status: number; cuerpo: Record<string, unknown>; /** el texto que se devuelve al hilo, si aplica */ aviso?: string }
const r = (status: number, cuerpo: Record<string, unknown>, aviso?: string): Respuesta => ({ status, cuerpo, ...(aviso ? { aviso } : {}) })

function notaDeDecision(p: PiezaDeBandeja, tipo: 'aprobada' | 'rechazada', autor: string, comentario: string | null): NotaNueva {
  const c = comentario ? alcanceYComentario(comentario) : null
  return {
    client_id: p.client_id, alcance: c?.alcance ?? 'cliente', tipo, comentario: c?.comentario ?? null, hitl_id: p.hitl_id, output_id: p.output_id,
    pieza_titulo: p.titulo, pieza_version: p.version, pieza_familia: p.familia, origen: 'slack', autor, clave_unica: `decision:${p.hitl_id}:${tipo}`,
  }
}

export async function procesar(P: PuertosDeNotas, cfg: ConfiguracionDeNotas, i: Intencion): Promise<Respuesta> {
  if (i.tipo === 'reto') return r(200, { challenge: i.challenge })
  if (i.tipo === 'ignorar') return r(200, { ok: true, ignorado: i.motivo })
  if (!cfg.autorizados.includes(i.autor)) return r(200, { ok: false, error: 'no_autorizado' }, 'Solo el dueño puede decidir o comentar piezas.')

  if (i.tipo === 'comentar') {
    const hitl_id = await P.hitlDelHilo(i.canal, i.hilo_ts)
    if (!hitl_id) return r(200, { ok: true, ignorado: 'el hilo no es de una pieza' })
    const p = await P.pieza(hitl_id)
    if (!p || p.type !== TIPO_PIEZA) return r(200, { ok: true, ignorado: 'el hilo no es de una pieza' })
    const c = alcanceYComentario(i.texto)
    const n = await P.guardarNota({
      client_id: p.client_id, alcance: c.alcance, tipo: 'comentario', comentario: c.comentario, hitl_id: p.hitl_id, output_id: p.output_id,
      pieza_titulo: p.titulo, pieza_version: p.version, pieza_familia: p.familia, origen: 'slack', autor: i.autor, clave_unica: `comentario:${i.canal}:${i.ts}`,
    })
    if (!n.ok) return r(500, { ok: false, error: 'nota_no_guardada', detalle: n.error }, 'No pude guardar tu comentario. Vuelve a escribirlo.')
    return r(200, { ok: true, nota_id: n.id, repetida: n.repetida, alcance: c.alcance })
  }

  if (i.tipo === 'abrir_rechazo') {
    const p = await P.pieza(i.hitl_id)
    if (!p || p.type !== TIPO_PIEZA) return r(200, { ok: false, error: 'pieza_inexistente' })
    if (p.status !== 'pending') return r(200, { ok: false, error: 'ya_decidida', estado: p.status }, `Esta pieza ya estaba decidida (${p.status}).`)
    const abierto = await P.abrirModalDeRechazo(i.trigger_id, { hitl_id: p.hitl_id, canal: i.canal, ts: i.ts, titulo: p.titulo })
    return abierto
      ? r(200, { ok: true, formulario: 'abierto' })
      : r(200, { ok: false, error: 'formulario_no_abierto' }, 'No pude abrir el formulario del motivo. Responde en el hilo y vuelve a pulsar Rechazar.')
  }

  // aprobar / rechazar
  const status = i.tipo === 'aprobar' ? 'approved' : 'rejected'
  const tipo = i.tipo === 'aprobar' ? 'aprobada' : 'rechazada'
  const comentario = i.tipo === 'rechazar' ? i.comentario : null
  const p = await P.pieza(i.hitl_id)
  if (!p || p.type !== TIPO_PIEZA) return r(200, { ok: false, error: 'pieza_inexistente' })
  const yaEstaba = p.status === status
  if (p.status !== 'pending' && !yaEstaba) return r(200, { ok: false, error: 'ya_decidida', estado: p.status }, `Esta pieza ya estaba decidida (${p.status}); no la cambié.`)
  if (!yaEstaba) {
    const d = await P.decidir(p.hitl_id, { status, reviewer: `slack:${i.autor}`, frase: comentario })
    if (!d.ok) return r(502, { ok: false, error: 'decision_no_aplicada', detalle: d.error }, 'No pude registrar tu decisión. Vuelve a pulsar el botón.')
  }
  // una decisión repetida (o el reintento tras un fallo de la nota) vuelve a intentar la MISMA nota: la clave única la hace inofensiva
  const n = await P.guardarNota(notaDeDecision(p, tipo, i.autor, comentario))
  if (!n.ok) return r(500, { ok: false, error: 'nota_no_guardada', decision: yaEstaba ? 'ya_estaba' : 'aplicada', detalle: n.error }, 'Tu decisión quedó registrada pero la nota no se guardó. Vuelve a pulsar el botón.')
  return r(200, { ok: true, decision: status, nota_id: n.id, repetida: n.repetida }, status === 'approved' ? 'Aprobada. Nada se publica sin este paso: queda lista en ensayo.' : 'Rechazada. Tu comentario queda como nota del cliente.')
}
