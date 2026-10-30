/**
 * RE-REVISAR UNA PIEZA CERRADA (30-oct · orden de Lenovo/Emilio: observar qué hace la jefatura con una pieza ya hecha).
 * «Re-revisar» abre un encargo NUEVO de la misma familia que NO pasa por la mesa: arranca justo antes de los chequeos duros con los materiales de la última versión cerrada
 * (texto, láminas, imágenes, dibujo) y de ahí corre el camino de siempre: chequeos → jefatura (revisión nueva, con el tope vigente) → correcciones y redibujo → entrega → bandeja.
 *  · NO abre versión de la mesa ni cuenta rondas de «Pedir cambios» (no lleva `cambios_del_dueno`);
 *  · NO escribe notas del dueño ni `eventos_de_emilio` (esta ruta no pasa por ellos: no es una decisión de Emilio);
 *  · la versión original queda intacta (su encargo, sus archivos y su fila de bandeja no se tocan); la nueva sale como pieza pendiente aparte, con su número de versión;
 *  · gasto: el techo del encargo nuevo es `TOPE_DE_UNA_RE_REVISION_USD` (revisión + correcciones + redibujo); el gasto de la mesa de la versión original NO se arrastra.
 * Pura salvo `reRevisar`, que usa los puertos del orquestador (los mismos que `pedirCambios`).
 */
import type { Db } from './almacen-supabase'
import { TIPO_PIEZA_DE_OFICINA_BANDEJA } from './cambios-del-dueno'
import { avanzar } from './orquestador'
import type { Puertos } from './puertos'
import type { Estado, Plantilla } from './tipos'
import { estadoInicial } from './tipos'

/** techo del encargo de una re-revisión (revisión + correcciones + redibujo). Si lo estimado lo supera, no se dispara. */
export const TOPE_DE_UNA_RE_REVISION_USD = 3

/** lo que declara un encargo de re-revisión en su `sala_ref.re_revision` */
export interface ReRevision { desde_encargo: string; desde_hitl: string; pedido_por: string }

/** el paso desde el que arranca: los chequeos duros (antes de la jefatura) */
export const PASO_DE_ARRANQUE = 'chequeos'
/** lo que la versión original produjo DESPUÉS de ese punto, o se recalcula: no se hereda (la revisión nueva y el cierre los vuelven a producir) */
const NO_SE_HEREDA = new Set(['chequeos', 'fichas_externas', 'respuesta_imagen', 'entrega', 'cierre'])

/** Puro. El estado con el que arranca la re-revisión, o por qué no se puede. */
export function estadoParaReRevisar(pl: Pick<Plantilla, 'pasos'>, anterior: Estado): { ok: true; estado: Estado; indiceDeArranque: number } | { ok: false; error: string } {
  const iJefatura = pl.pasos.findIndex((p) => p.tipo === 'jefatura')
  if (iJefatura < 0) return { ok: false, error: 'la familia no tiene paso de jefatura: no hay qué re-revisar' }
  const iArranque = pl.pasos.findIndex((p) => p.clave === PASO_DE_ARRANQUE)
  if (iArranque < 0 || iArranque > iJefatura) return { ok: false, error: `la plantilla no tiene el paso «${PASO_DE_ARRANQUE}» antes de la jefatura` }
  const artefactos: Estado['artefactos'] = {}
  for (const [k, v] of Object.entries(anterior.artefactos ?? {})) if (!NO_SE_HEREDA.has(k)) artefactos[k] = structuredClone(v)
  if (Object.keys(artefactos).length === 0) return { ok: false, error: 'la versión cerrada no guardó materiales que revisar' }
  return { ok: true, indiceDeArranque: iArranque, estado: { ...estadoInicial(), ultimo: iArranque - 1, pasos_ejecutados: Math.max(0, iArranque), artefactos } }
}

type Fila = Record<string, unknown>
const esObjeto = (x: unknown): x is Fila => typeof x === 'object' && x !== null && !Array.isArray(x)
export type ResultadoDeReRevision = { status: number; cuerpo: Record<string, unknown> }

/** Con `solo_estimar` no crea nada: dice si se puede y cuánto como máximo costaría. */
export async function reRevisar(db: Db, P: Puertos, p: { hitl_id: string; reviewer: string; solo_estimar?: boolean }): Promise<ResultadoDeReRevision> {
  const h = await db.from('hitl_queue').select('id, status, type, client_id').eq('id', p.hitl_id).maybeSingle()
  if (h.error) return { status: 500, cuerpo: { error: 'bandeja_error', detalle: h.error.message } }
  const fila = h.data as Fila | null
  if (!fila) return { status: 404, cuerpo: { error: 'pieza_inexistente' } }
  if (fila.type !== TIPO_PIEZA_DE_OFICINA_BANDEJA) return { status: 409, cuerpo: { error: 'no_es_una_pieza_de_la_oficina', tipo: fila.type } }
  if (fila.status !== 'pending') return { status: 409, cuerpo: { error: 'ya_decidida', estado: fila.status } }

  const en = await db.from('oficina_encargos').select('*').eq('hitl_queue_id', p.hitl_id).limit(1)
  if (en.error) return { status: 500, cuerpo: { error: 'oficina_error', detalle: en.error.message } }
  const enc = ((en.data as Fila[] | null) ?? [])[0]
  if (!enc) return { status: 409, cuerpo: { error: 'la_pieza_no_tiene_encargo' } }
  if (enc.dry_run === true) return { status: 409, cuerpo: { error: 'es_un_ensayo' } }
  if (enc.estado !== 'cerrado' && enc.estado !== 'cerrado_por_tope') return { status: 409, cuerpo: { error: 'encargo_no_cerrado', estado: enc.estado } }

  // solo la ÚLTIMA versión real: si ya hay una más nueva (otra re-revisión viva o terminada, o cambios del dueño en curso) esta pieza ya no es la vigente
  const hermanos = await db.from('oficina_encargos').select('id, version_encargo, dry_run').eq('parte_id', enc.parte_id).eq('brief_id', enc.brief_id).eq('tipo_de_grupo', enc.tipo_de_grupo)
  if (hermanos.error) return { status: 500, cuerpo: { error: 'oficina_error', detalle: hermanos.error.message } }
  const masNueva = ((hermanos.data as Fila[] | null) ?? []).find((x) => x.dry_run !== true && Number(x.version_encargo) > Number(enc.version_encargo))
  if (masNueva) return { status: 409, cuerpo: { error: 'ya_hay_una_version_mas_nueva', version: masNueva.version_encargo, encargo_id: masNueva.id } }

  const pl = await P.almacen.leerPlantilla(String(enc.familia))
  if (!pl) return { status: 409, cuerpo: { error: 'familia_sin_plantilla', familia: enc.familia } }
  const em = esObjeto(enc.estado_del_motor) ? (enc.estado_del_motor as unknown as Estado) : estadoInicial()
  const sem = estadoParaReRevisar(pl.plantilla, em)
  if (!sem.ok) return { status: 409, cuerpo: { error: 'no_se_puede_re_revisar', detalle: sem.error } }
  const tope = Math.min(TOPE_DE_UNA_RE_REVISION_USD, pl.plantilla.limites.tope_encargo_usd)
  if (p.solo_estimar) return { status: 200, cuerpo: { accion: 'estimado', puede: true, arranca_en: PASO_DE_ARRANQUE, techo_usd: tope, gasto_de_la_version_original_usd: Number(enc.gasto_usd ?? 0), nota: 'no abre versión de la mesa, no cuenta rondas y no escribe notas del dueño' } }

  const sala = esObjeto(enc.sala_ref) ? enc.sala_ref : {}
  const cal = esObjeto(sala.fila) ? { fila: sala.fila } : {}
  const re: ReRevision = { desde_encargo: String(enc.id), desde_hitl: p.hitl_id, pedido_por: p.reviewer }
  const c = await P.almacen.crearEncargo({
    client_id: String(enc.client_id), parte_id: String(enc.parte_id), brief_id: String(enc.brief_id), tipo_de_grupo: String(enc.tipo_de_grupo), familia: String(enc.familia), tope_usd: tope, dry_run: false, prueba: false,
    sala_ref: { _journey_id: sala._journey_id ?? null, _sala_correlation_id: sala._sala_correlation_id ?? null, ...cal }, estado_del_motor: sem.estado, re_revision: re,
  })
  if (!c.ok) return { status: 409, cuerpo: { error: 'no_se_pudo_abrir_la_re_revision', detalle: c.error } }
  if (!c.nuevo) return { status: 409, cuerpo: { error: 'no_se_pudo_abrir_la_re_revision', detalle: 'ya existía' } }
  const sal = await avanzar(P, c.encargo.id)
  return { status: sal.status, cuerpo: { ...sal.cuerpo, encargo_id: c.encargo.id, desde_encargo: re.desde_encargo, techo_usd: tope } }
}
