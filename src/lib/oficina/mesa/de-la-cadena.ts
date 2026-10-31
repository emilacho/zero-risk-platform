/**
 * LA MESA DE CREATIVOS DEL CALENDARIO (31-oct) · la familia `calendario_mesa` de la oficina: el equipo creativo idea el QUÉ de cada hueco de la tanda y entrega UN tablero a la cadena.
 * Es la misma mesa del 28-oct (tablero, turnos, directorio vivo, libro de aportes, cotas, tope); lo que cambia: el encargo no nace de un brief de la sala sino de una tanda de la cadena
 * (`parte_id` = la campaña, `brief_id` = `cal-<campaña>-t<tanda>-v<versión>`), no hay imágenes ni traductor ni jefatura propia, y la entrega NO va a la bandeja: va a la fila de la mesa en la cadena.
 * La jefatura sigue revisando el calendario al final, como hoy (retención J7). Aquí nada habla con un modelo.
 */
import { datos } from '../ayudas'
import type { Respuesta } from '../orquestador'
import type { FotoEtiquetada } from '../fotos'
import type { Cambios, Encargo, Puertos } from '../puertos'
import { estadoInicial, type Estado } from '../tipos'

export const FAMILIA_CALENDARIO = 'calendario_mesa'
export const ARTEFACTO_MARCO = 'marco_calendario'
export const esDelCalendario = (familia: string): boolean => familia === FAMILIA_CALENDARIO

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** lo que la cadena le pasa a la oficina para abrir la mesa de una tanda */
export interface SobreDelCalendario { client_id: string; campana_id: string; tanda: number; version: number; marco_texto: string; dry_run: boolean }

/** lo que viaja dentro del encargo (artefacto `marco_calendario`): el contexto de la cadena + lo que el cliente tiene (manual, plan, fotos) leído UNA vez al abrir */
export interface MarcoDelCalendario {
  campana_id: string; tanda: number; version: number
  cliente_nombre: string; manual_texto: string; plan_texto: string | null
  marco_texto: string
  fotos: FotoEtiquetada[]
}
export const marcoDe = (e: Estado): MarcoDelCalendario | null => (datos(e, ARTEFACTO_MARCO) as unknown as MarcoDelCalendario | undefined) ?? null

/** el id del brief de una tanda: cabe en las 40 posiciones que admite el nombre de un brief y es distinto por campaña, tanda y versión */
export const briefIdDelCalendario = (campanaId: string, tanda: number, version: number): string => `cal-${campanaId.replace(/-/g, '').slice(0, 12)}-t${tanda}-v${version}`

export function validarSobreDelCalendario(x: unknown): { ok: true; sobre: SobreDelCalendario } | { ok: false; errores: string[] } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, errores: ['el cuerpo debe ser un objeto'] }
  const b = x as Record<string, unknown>
  const errores: string[] = []
  if (typeof b.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser verdadero o falso (ausente = no se gasta nada)')
  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) errores.push('`client_id` debe ser un uuid')
  if (typeof b.campana_id !== 'string' || !UUID.test(b.campana_id)) errores.push('`campana_id` debe ser un uuid')
  if (!Number.isInteger(b.tanda) || (b.tanda as number) < 1 || (b.tanda as number) > 12) errores.push('`tanda` debe ser un entero entre 1 y 12')
  if (!Number.isInteger(b.version) || (b.version as number) < 1) errores.push('`version` debe ser un entero positivo')
  if (typeof b.marco_texto !== 'string' || b.marco_texto.trim().length < 20) errores.push('`marco_texto` falta (el marco de la tanda)')
  if (errores.length) return { ok: false, errores }
  return { ok: true, sobre: { client_id: b.client_id as string, campana_id: b.campana_id as string, tanda: b.tanda as number, version: b.version as number, marco_texto: (b.marco_texto as string).slice(0, 40_000), dry_run: b.dry_run as boolean } }
}

/**
 * Abre la mesa de una tanda. Idempotente por (campaña, brief, versión de encargo): un sobre repetido devuelve el encargo que ya existe. La plantilla debe estar ACTIVA (la palanca por cliente vive en la cadena).
 * Devuelve lo que devuelve `avanzar`: el primer turno (el marco de la dirección) para que el flujo `oficina · turno` lo corra.
 */
export async function abrirMesaDelCalendario(P: Puertos, s: SobreDelCalendario, avanzar: (P: Puertos, id: string) => Promise<Respuesta>): Promise<Respuesta> {
  const pl = await P.almacen.leerPlantilla(FAMILIA_CALENDARIO)
  if (!pl) return r(404, { error: 'plantilla_desconocida', familia: FAMILIA_CALENDARIO })
  if (!pl.activo) return r(409, { error: 'plantilla_inactiva', familia: FAMILIA_CALENDARIO })
  if (!P.mesa) return r(409, { error: 'mesa_sin_puerto', detalle: 'la mesa no tiene su puerto (libro y directorio) configurado' })
  const fu = await P.fuentes(s.client_id)
  if ('error' in fu) return r(409, { error: 'sin_fuentes', detalle: fu.error })
  const marco: MarcoDelCalendario = { campana_id: s.campana_id, tanda: s.tanda, version: s.version, cliente_nombre: fu.cliente_nombre, manual_texto: fu.manual_texto, plan_texto: fu.plan_texto, marco_texto: s.marco_texto, fotos: fu.fotos }
  const e0: Estado = estadoInicial()
  const estado: Estado = { ...e0, artefactos: { ...e0.artefactos, [ARTEFACTO_MARCO]: { version: 1, version_consumida: 0, datos: marco as unknown as Record<string, unknown> } } }
  const tope = pl.plantilla.limites.tope_encargo_usd
  const c = await P.almacen.crearEncargo({
    client_id: s.client_id, parte_id: s.campana_id, brief_id: briefIdDelCalendario(s.campana_id, s.tanda, s.version), tipo_de_grupo: pl.plantilla.tipo, familia: FAMILIA_CALENDARIO,
    tope_usd: tope, dry_run: s.dry_run, prueba: false, sala_ref: { origen: 'cadena', campana_id: s.campana_id, tanda: s.tanda, version: s.version }, estado_del_motor: estado,
  })
  if (!c.ok) return r(500, { error: 'almacen_error', detalle: c.error })
  if (!c.nuevo) return r(200, { accion: 'ya_existia', encargo_id: c.encargo.id, estado: c.encargo.estado })
  const sal = await avanzar(P, c.encargo.id)
  return r(sal.status, { ...sal.cuerpo, encargo_id: c.encargo.id })
}

/** el tablero integrado de la mesa (lo último que escribió la dirección), o lo que el equipo alcanzó a escribir si no hubo integración */
export function textoParaLaCadena(libro: Array<{ de: string; tipo: string; texto: string }>, piezaTexto: string | null | undefined): string {
  const ult = [...libro].reverse().find((a) => a.tipo === 'integra' && a.texto.trim())
  if (ult) return ult.texto.trim()
  if (piezaTexto?.trim()) return piezaTexto.trim()
  return libro.filter((a) => ['dirige', 'aporta', 'responde'].includes(a.tipo) && a.texto.trim()).map((a) => `[${a.de}] ${a.texto.trim()}`).join('\n\n')
}

/**
 * Cierra el encargo del calendario y le entrega el tablero a la cadena. NUNCA va a la bandeja ni a la jefatura de la pieza. Si la cadena no recibe la entrega, el encargo cierra igual
 * (el plazo de la mesa en la cadena la deja `sin_mesa` y el calendario se ordena sin ideas): la mesa jamás deja a una campaña sin calendario.
 */
export async function entregarALaCadena(P: Puertos, enc: Encargo, o: { texto: string | null; motivo: string | null; estado: 'cerrado' | 'cerrado_por_tope' | 'fallido' }): Promise<Respuesta> {
  const ref = (enc.sala_ref ?? {}) as { campana_id?: string; tanda?: number; version?: number }
  let entrega: { ok: boolean; detalle: string } = { ok: false, detalle: 'la cadena no tiene su puerto en este entorno' }
  if (P.cadena && ref.campana_id && ref.tanda && ref.version) {
    try {
      const x = await P.cadena.entregarIdeas({ campana_id: ref.campana_id, tanda: ref.tanda, version: ref.version, encargo_id: enc.id, texto: o.texto, costo_usd: enc.estado_del_motor.gasto_usd, motivo: o.motivo })
      entrega = x.ok ? { ok: true, detalle: x.estado } : { ok: false, detalle: x.error }
    } catch (e) { entrega = { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
  const cambios: Cambios = { encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.estado_del_motor.gasto_usd, estado: o.estado, con_desacuerdo: o.estado !== 'cerrado' }
  await P.almacen.guardar(cambios)
  if (!entrega.ok) await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `⚠️ La mesa del calendario (${enc.brief_id}) cerró pero la cadena no recibió el tablero (${entrega.detalle}); el calendario se ordenará sin ideas al vencer el plazo de la mesa`, dry_run: enc.dry_run })
  return r(200, { accion: 'cerrado', estado: o.estado, con_desacuerdo: o.estado !== 'cerrado', motivo: o.motivo, simulado: enc.dry_run, gasto_usd: enc.estado_del_motor.gasto_usd, resultado_para_la_sala: 'calendario_mesa', sala_ref: enc.sala_ref, entrega_a_la_cadena: entrega })
}
