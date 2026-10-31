/**
 * LAS MESAS DE LA CADENA (31-oct · nuevo orden, T2) · `brief_mesa` (el brief creativo de la campaña: UN miembro + el portero) y `concepto_mesa` (la gran idea, los capítulos y el banco: el equipo creativo, dos rondas).
 * Es la misma mesa del 28-oct (tablero, turnos, directorio vivo, libro de aportes, cotas, tope); lo que cambia: el encargo no nace de un brief de la sala sino de una campaña de la cadena
 * (`parte_id` = la campaña, `brief_id` = `brf-<campaña>-v<n>` / `con-<campaña>-v<n>`), no hay imágenes ni traductor ni jefatura propia, y la entrega NO va a la bandeja: va a la cadena por su puerto.
 * Heredan el molde de la mesa de ideas del calendario (rama congelada `7f4503f`, certificada por CC3). Aquí nada habla con un modelo.
 */
import { datos } from '../ayudas'
import type { Respuesta } from '../orquestador'
import type { FotoEtiquetada } from '../fotos'
import type { Cambios, Encargo, Puertos } from '../puertos'
import { estadoInicial, type Estado } from '../tipos'

export type TipoDeMesaDeLaCadena = 'brief' | 'concepto'
export const FAMILIA_DE: Record<TipoDeMesaDeLaCadena, string> = { brief: 'brief_mesa', concepto: 'concepto_mesa' }
export const ARTEFACTO_MARCO = 'marco_cadena'
export const esDeLaCadenaLaFamilia = (familia: string): boolean => familia === FAMILIA_DE.brief || familia === FAMILIA_DE.concepto
const PREFIJO_DEL_ID: Record<TipoDeMesaDeLaCadena, string> = { brief: 'brf', concepto: 'con' }
const TOPE_POR_OMISION_USD: Record<TipoDeMesaDeLaCadena, number> = { brief: 1.6, concepto: 5 }

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** lo que la cadena le pasa a la oficina para abrir una mesa de la campaña */
export interface SobreDeLaCadena { tipo_de_mesa: TipoDeMesaDeLaCadena; client_id: string; campana_id: string; version: number; marco_texto: string; dry_run: boolean; /** condiciones del directorio que la estrategia activa (`si_instagram`, `si_video`…): las calcula la CADENA del plan de canales, no la oficina */ condiciones: string[] }

/** lo que viaja dentro del encargo (artefacto `marco_cadena`): el contexto de la cadena + lo que el cliente tiene (manual, plan, fotos) leído UNA vez al abrir */
export interface MarcoDeLaCadena {
  tipo_de_mesa: TipoDeMesaDeLaCadena
  campana_id: string; version: number
  cliente_nombre: string; manual_texto: string; plan_texto: string | null
  marco_texto: string
  condiciones: string[]
  fotos: FotoEtiquetada[]
}
export const marcoDe = (e: Estado): MarcoDeLaCadena | null => (datos(e, ARTEFACTO_MARCO) as unknown as MarcoDeLaCadena | undefined) ?? null

/** el id del encargo: cabe en las 40 posiciones que admite el nombre de un brief y es distinto por campaña, mesa y versión */
export const briefIdDeLaCadena = (tipo: TipoDeMesaDeLaCadena, campanaId: string, version: number): string => `${PREFIJO_DEL_ID[tipo]}-${campanaId.replace(/-/g, '').slice(0, 12)}-v${version}`

export function validarSobreDeLaCadena(x: unknown): { ok: true; sobre: SobreDeLaCadena } | { ok: false; errores: string[] } {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, errores: ['el cuerpo debe ser un objeto'] }
  const b = x as Record<string, unknown>
  const errores: string[] = []
  if (b.tipo_de_mesa !== 'brief' && b.tipo_de_mesa !== 'concepto') errores.push('`tipo_de_mesa` debe ser «brief» o «concepto»')
  if (typeof b.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser verdadero o falso (ausente = no se gasta nada)')
  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) errores.push('`client_id` debe ser un uuid')
  if (typeof b.campana_id !== 'string' || !UUID.test(b.campana_id)) errores.push('`campana_id` debe ser un uuid')
  if (!Number.isInteger(b.version) || (b.version as number) < 1) errores.push('`version` debe ser un entero positivo')
  if (typeof b.marco_texto !== 'string' || b.marco_texto.trim().length < 20) errores.push('`marco_texto` falta (el marco de la mesa)')
  if (b.condiciones !== undefined && (!Array.isArray(b.condiciones) || b.condiciones.some((c) => typeof c !== 'string' || !/^si_[a-z0-9_]{1,30}$/.test(c)))) errores.push('`condiciones` debe ser una lista de claves `si_…`')
  if (errores.length) return { ok: false, errores }
  return { ok: true, sobre: { condiciones: ((b.condiciones as string[] | undefined) ?? []).slice(0, 20), tipo_de_mesa: b.tipo_de_mesa as TipoDeMesaDeLaCadena, client_id: b.client_id as string, campana_id: b.campana_id as string, version: b.version as number, marco_texto: (b.marco_texto as string).slice(0, 60_000), dry_run: b.dry_run as boolean } }
}

/**
 * Abre una mesa de la cadena. Idempotente por (campaña, brief_id): un sobre repetido devuelve el encargo que ya existe. La plantilla debe estar ACTIVA.
 * Devuelve lo que devuelve `avanzar`: el primer turno (el marco de la dirección) para que el flujo `oficina · turno` lo corra.
 */
export async function abrirMesaDeLaCadena(P: Puertos, s: SobreDeLaCadena, avanzar: (P: Puertos, id: string) => Promise<Respuesta>): Promise<Respuesta> {
  const familia = FAMILIA_DE[s.tipo_de_mesa]
  const pl = await P.almacen.leerPlantilla(familia)
  if (!pl) return r(404, { error: 'plantilla_desconocida', familia })
  if (!pl.activo) return r(409, { error: 'plantilla_inactiva', familia })
  if (!P.mesa) return r(409, { error: 'mesa_sin_puerto', detalle: 'la mesa no tiene su puerto (libro y directorio) configurado' })
  const fu = await P.fuentes(s.client_id)
  if ('error' in fu) return r(409, { error: 'sin_fuentes', detalle: fu.error })
  const marco: MarcoDeLaCadena = { tipo_de_mesa: s.tipo_de_mesa, campana_id: s.campana_id, version: s.version, cliente_nombre: fu.cliente_nombre, manual_texto: fu.manual_texto, plan_texto: fu.plan_texto, marco_texto: s.marco_texto, condiciones: s.condiciones, fotos: fu.fotos }
  const e0: Estado = estadoInicial()
  const estado: Estado = { ...e0, artefactos: { ...e0.artefactos, [ARTEFACTO_MARCO]: { version: 1, version_consumida: 0, datos: marco as unknown as Record<string, unknown> } } }
  const tope = pl.plantilla.limites.tope_encargo_usd ?? TOPE_POR_OMISION_USD[s.tipo_de_mesa]
  const c = await P.almacen.crearEncargo({
    client_id: s.client_id, parte_id: s.campana_id, brief_id: briefIdDeLaCadena(s.tipo_de_mesa, s.campana_id, s.version), tipo_de_grupo: pl.plantilla.tipo, familia,
    tope_usd: tope, dry_run: s.dry_run, prueba: false, sala_ref: { origen: 'cadena', tipo_de_mesa: s.tipo_de_mesa, campana_id: s.campana_id, version: s.version }, estado_del_motor: estado,
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
 * Lo que la dirección escribió en «## Devolución del brief» (solo en la mesa de concepto): si hay texto, el brief se devuelve UNA vez. Devuelve null si no hay sección o está vacía.
 * Se lee en CUALQUIER aporte de la dirección del primer turno (no solo en la integración): la mesa cierra sin gastar más turnos.
 */
export function devolucionDelBrief(texto: string): string | null {
  const m = /^#{1,3}\s*Devoluci[oó]n del brief\s*$/im.exec(texto)
  if (!m) return null
  const resto = texto.slice(m.index + m[0].length)
  const sig = /^#{1,3}\s+\S/m.exec(resto)
  const cuerpo = (sig ? resto.slice(0, sig.index) : resto).trim()
  return cuerpo ? cuerpo.slice(0, 4000) : null
}

/**
 * Cierra el encargo de la cadena y le entrega el tablero por su puerto. NUNCA va a la bandeja ni a la jefatura de la pieza. Si la cadena no recibe la entrega, el encargo cierra igual
 * (el plazo de la mesa en la cadena la deja sin mesa y la campaña sigue con lo que haya): la mesa jamás deja a una campaña colgada.
 */
export async function entregarALaCadena(P: Puertos, enc: Encargo, o: { texto: string | null; motivo: string | null; estado: 'cerrado' | 'cerrado_por_tope' | 'fallido'; brief_devuelto?: string | null }): Promise<Respuesta> {
  const ref = (enc.sala_ref ?? {}) as { tipo_de_mesa?: TipoDeMesaDeLaCadena; campana_id?: string; version?: number }
  let entrega: { ok: boolean; detalle: string; siguiente?: { sobre: object } } = { ok: false, detalle: 'la cadena no tiene su puerto en este entorno' }
  if (P.cadena && ref.campana_id && ref.version && ref.tipo_de_mesa) {
    try {
      const base = { campana_id: ref.campana_id, version: ref.version, encargo_id: enc.id, texto: o.texto, costo_usd: enc.estado_del_motor.gasto_usd, motivo: o.motivo }
      const x = ref.tipo_de_mesa === 'brief' ? await P.cadena.entregarBrief(base) : await P.cadena.entregarConcepto({ ...base, brief_devuelto: o.brief_devuelto ?? null })
      entrega = x.ok ? { ok: true, detalle: x.estado ?? 'recibida', ...(x.siguiente ? { siguiente: x.siguiente } : {}) } : { ok: false, detalle: x.error ?? 'la cadena no recibió la entrega' }
    } catch (e) { entrega = { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
  const cambios: Cambios = { encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.estado_del_motor.gasto_usd, estado: o.estado, con_desacuerdo: o.estado !== 'cerrado' }
  await P.almacen.guardar(cambios)
  if (!entrega.ok) await P.avisar({ canal: "alertas", encargo_id: enc.id, texto: `⚠️ La mesa de la cadena (${enc.brief_id}) cerró pero la cadena no recibió el tablero (${entrega.detalle}); la campaña seguirá con lo que tenga al vencer el plazo de la mesa.`, dry_run: enc.dry_run })
  return r(200, { accion: 'cerrado', estado: o.estado, con_desacuerdo: o.estado !== 'cerrado', motivo: o.motivo, brief_devuelto: o.brief_devuelto ? true : undefined, simulado: enc.dry_run, gasto_usd: enc.estado_del_motor.gasto_usd, resultado_para_la_sala: enc.familia, sala_ref: enc.sala_ref, entrega_a_la_cadena: entrega })
}
