/**
 * Las rutas de «editar y validar el manual desde el dashboard» (30-oct). Las dos hacen primero lo del manual y DESPUÉS lo del cerebro; si el cerebro falla, el manual ya quedó y el pendiente se dice.
 *   PATCH /api/manual/{client_id}/campos   cuerpo: { campos:{<clave del borrador o del tablero>: texto}, comentario?, reviewer, origen:'dashboard' }
 *   POST  /api/tablero/manual-validar      cuerpo: { client_id, reviewer, origen:'dashboard' }
 */
import { decidirPalabraDelDueno, editarManualDelDueno, empujarCamposAlCerebro, validarCampoDelManual, validarManualDelDueno, type Db, type DepsDelCerebro } from './edicion-del-dueno'

type Fila = Record<string, unknown>
export interface DepsDeEdicion {
  db: Db
  cerebro: DepsDelCerebro
  /** re-indexa la versión nueva en el cerebro (retira los trozos de las anteriores); en producción es `empujarManualAlCerebro` */
  empujarManual: (x: { client_id: string; source_id: string }) => { estado: string; detalle?: string }
  ahora?: () => Date
}
export interface SalidaDeEdicion { status: number; body: Fila; toca: { client_id: string | null; comentario?: string | null } }

const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)

export async function rutaEditarManual(d: DepsDeEdicion, client_id: string, cuerpo: unknown, reviewerPorOmision = 'emilio'): Promise<SalidaDeEdicion> {
  const b = esObjeto(cuerpo) ? cuerpo : {}
  const reviewer = typeof b.reviewer === 'string' && b.reviewer.trim() && b.reviewer.length <= 80 ? b.reviewer.trim() : reviewerPorOmision
  const comentario = typeof b.comentario === 'string' && b.comentario.trim() ? b.comentario.trim() : null
  const toca = { client_id, comentario }
  if (!esObjeto(b.campos)) return { status: 400, body: { ok: false, error: 'entrada_invalida', detalle: 'faltan los campos que cambian' }, toca }
  const ahora = (d.ahora ?? (() => new Date()))()
  const r = await editarManualDelDueno(d.db, { client_id, campos: b.campos, comentario, reviewer, ahora })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  // el manual ya quedó: ahora, como consecuencia, el cerebro (re-indexado de la versión + cada campo por la puerta del dueño)
  const indice = d.empujarManual({ client_id, source_id: r.source_id })
  const cerebro = await empujarCamposAlCerebro(d.cerebro, { client_id, version: r.version_nueva, cambios: r.cambios, reviewer, en: ahora.toISOString() })
  return {
    status: 200,
    toca,
    body: {
      ok: true, version_nueva: r.version_nueva, cambios: r.cambios.map((c) => ({ campo: c.clave_del_tablero, etiqueta: c.etiqueta, valor: c.valor, escrito_por: 'dueno' })),
      completo: r.completo, huecos: r.huecos,
      cerebro: { indice: indice.estado, enviados: cerebro.enviados, pendientes: cerebro.pendientes },
      ...(cerebro.pendientes.length ? { aviso: 'El manual quedó guardado, pero el cerebro no recibió todos los campos todavía: queda pendiente.' } : {}),
    },
  }
}

/** POST /api/tablero/manual-palabra · cuerpo: { client_id, texto, decision:'prohibir'|'contexto'|'quitar', comentario?, reviewer, origen:'dashboard' } */
export async function rutaDecidirPalabra(d: DepsDeEdicion, cuerpo: Fila, reviewer: string): Promise<SalidaDeEdicion> {
  const client_id = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : ''
  const comentario = typeof cuerpo.comentario === 'string' && cuerpo.comentario.trim() ? cuerpo.comentario.trim() : null
  const toca = { client_id: client_id || null, comentario }
  const r = await decidirPalabraDelDueno(d.db, { client_id, texto: cuerpo.texto, decision: cuerpo.decision, comentario, reviewer, ahora: (d.ahora ?? (() => new Date()))() })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  const indice = d.empujarManual({ client_id, source_id: r.source_id })
  return { status: 200, toca, body: { ok: true, version_nueva: r.version_nueva, decision: r.decision, texto: r.texto, prohibidas: r.duras, cerebro: { indice: indice.estado } } }
}

/** POST /api/tablero/manual-validar-campo · cuerpo: { client_id, campo, validado?: boolean (true por omisión), reviewer, origen:'dashboard' } · sin versión nueva */
export async function rutaValidarCampo(d: Pick<DepsDeEdicion, 'db' | 'ahora'>, cuerpo: Fila, reviewer: string): Promise<SalidaDeEdicion> {
  const client_id = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : ''
  const toca = { client_id: client_id || null }
  if (cuerpo.validado !== undefined && typeof cuerpo.validado !== 'boolean') return { status: 400, body: { ok: false, error: 'entrada_invalida', detalle: '`validado` debe ser verdadero o falso' }, toca }
  const r = await validarCampoDelManual(d.db, { client_id, campo: cuerpo.campo, validado: cuerpo.validado !== false, reviewer, ahora: (d.ahora ?? (() => new Date()))() })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  return { status: 200, toca, body: { ...r } }
}

export async function rutaValidarManual(d: DepsDeEdicion, client_id: string, reviewer: string): Promise<SalidaDeEdicion> {
  const toca = { client_id }
  const ahora = (d.ahora ?? (() => new Date()))()
  const r = await validarManualDelDueno(d.db, { client_id, reviewer, ahora })
  if (!r.ok) return { status: r.status, body: { ok: false, error: r.error, detalle: r.detalle }, toca }
  const indice = r.sin_cambios ? { estado: 'sin_cambios' } : d.empujarManual({ client_id, source_id: r.source_id })
  return { status: 200, toca, body: { ok: true, validado_por: 'dueno', version_nueva: r.version_nueva, sin_cambios: r.sin_cambios, aceptados_por_el_dueno: r.aceptados, cerebro: { indice: indice.estado } } }
}
