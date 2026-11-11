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
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'

export type TipoDeMesaDeLaCadena = 'brief' | 'concepto' | 'reubicacion'
export const FAMILIA_DE: Record<TipoDeMesaDeLaCadena, string> = { brief: 'brief_mesa', concepto: 'concepto_mesa', reubicacion: 'reubicacion_mesa' }
export const ARTEFACTO_MARCO = 'marco_cadena'
export const esDeLaCadenaLaFamilia = (familia: string): boolean => Object.values(FAMILIA_DE).includes(familia)
const PREFIJO_DEL_ID: Record<TipoDeMesaDeLaCadena, string> = { brief: 'brf', concepto: 'con', reubicacion: 'reu' }
const TOPE_POR_OMISION_USD: Record<TipoDeMesaDeLaCadena, number> = { brief: 1.6, concepto: 5, reubicacion: 3 }

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
  if (b.tipo_de_mesa !== 'brief' && b.tipo_de_mesa !== 'concepto' && b.tipo_de_mesa !== 'reubicacion') errores.push('`tipo_de_mesa` debe ser «brief», «concepto» o «reubicacion»')
  if (typeof b.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser verdadero o falso (ausente = no se gasta nada)')
  if (typeof b.client_id !== 'string' || !UUID.test(b.client_id)) errores.push('`client_id` debe ser un uuid')
  if (typeof b.campana_id !== 'string' || !UUID.test(b.campana_id)) errores.push('`campana_id` debe ser un uuid')
  if (!Number.isInteger(b.version) || (b.version as number) < 1) errores.push('`version` debe ser un entero positivo')
  if (typeof b.marco_texto !== 'string' || b.marco_texto.trim().length < 20) errores.push('`marco_texto` falta (el marco de la mesa)')
  if (b.condiciones !== undefined && (!Array.isArray(b.condiciones) || b.condiciones.some((c) => typeof c !== 'string' || !/^si_[a-z0-9_]{1,30}$/.test(c)))) errores.push('`condiciones` debe ser una lista de claves `si_…`')
  if (errores.length) return { ok: false, errores }
  return { ok: true, sobre: { condiciones: ((b.condiciones as string[] | undefined) ?? []).slice(0, 20), tipo_de_mesa: b.tipo_de_mesa as TipoDeMesaDeLaCadena, client_id: b.client_id as string, campana_id: b.campana_id as string, version: b.version as number, marco_texto: (b.marco_texto as string).slice(0, TOPE_REAL_DEL_PEDIDO), dry_run: b.dry_run as boolean } }
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

/** el título de la sección que la mesa de CONCEPTO agrega al tablero con las líneas de idea de los aportes de los miembros */
export const TITULO_IDEAS_DE_LOS_APORTES = '## Banco de ideas · líneas de los aportes del equipo'
/** una línea de idea del banco (`- C<x>-I<nn> · …`), aunque venga envuelta en `código` o en **negrita** como la escriben los miembros */
const RE_LINEA_DE_IDEA_EN_APORTE = /^\s*(?:[-*•]|\d+[.)])\s+[`*]*C[A-Za-z0-9_]+-I\d{2,}[`*]*\s*·/
/** la línea tal como la lee la cadena: viñeta «- », sin el envoltorio de código ni de negrita alrededor del id y al final */
export function lineaDeIdeaLimpia(linea: string): string {
  const m = /^\s*(?:[-*•]|\d+[.)])\s+[`*]*(C[A-Za-z0-9_]+-I\d{2,})[`*]*\s*·\s*(.*)$/.exec(linea)
  if (!m) return linea.trim()
  return `- ${m[1]} · ${m[2].replace(/[`*]+\s*$/, '').trim()}`
}

/**
 * 09-nov (GO de Lenovo · falso rojo de una gran idea real, encargo 577c6038): en la mesa de CONCEPTO el banco de ideas lo escriben los MIEMBROS en sus aportes; la integración de la
 * dirección solo cita los ids. Antes viajaba solo la integración y la cadena (`leerConcepto`, que lee el banco «de todo el texto: integración + aportes») no encontraba
 * ninguna idea con mensaje y gancho → `sin_concepto`. Ahora, detrás de la integración, va una sección con las LÍNEAS DE IDEA de los aportes (solo esas líneas: el resto de
 * los aportes no entra, para que sus títulos no se confundan con las secciones del concepto).
 *  · Qué aportes: los de los miembros (no la dirección) tipo `aporta`/`responde`. Si la integración cita aportes (`A23`), van primero los citados, en el orden en que los
 *    cita; después el resto, del más nuevo al más viejo. Cuando dos miembros usaron el mismo id, la cadena se queda con la PRIMERA línea y declara las otras
 *    «id duplicado»: así manda la elección de la dirección.
 *  · Sin integración, o en la mesa del brief, nada cambia.
 */
export function ideasDeLosAportes(libro: Array<{ n?: number; de: string; tipo: string; texto: string }>, integracion: string): string[] {
  const dir = [...libro].reverse().find((a) => a.tipo === 'integra')?.de ?? null
  const aportes = libro.filter((a) => (a.tipo === 'aporta' || a.tipo === 'responde') && a.de !== dir && a.texto.trim())
  const citados: number[] = []
  for (const m of integracion.matchAll(/\bA(\d{1,4})\b/g)) { const n = Number(m[1]); if (!citados.includes(n)) citados.push(n) }
  const orden = [
    ...citados.map((n) => aportes.find((a) => a.n === n)).filter((a): a is (typeof aportes)[number] => !!a),
    ...[...aportes].reverse().filter((a) => a.n === undefined || !citados.includes(a.n)),
  ]
  const vistas = new Set<string>()
  const out: string[] = []
  for (const a of orden) {
    for (const l of a.texto.replace(/\r/g, '').split('\n')) {
      if (!RE_LINEA_DE_IDEA_EN_APORTE.test(l)) continue
      const limpia = lineaDeIdeaLimpia(l)
      if (vistas.has(limpia)) continue
      vistas.add(limpia)
      out.push(limpia)
    }
  }
  return out
}

/** el tablero integrado de la mesa (lo último que escribió la dirección), o lo que el equipo alcanzó a escribir si no hubo integración.
 *  `conIdeasDeLosAportes` (solo la mesa de concepto): agrega detrás de la integración las líneas de idea de los aportes (ver `ideasDeLosAportes`). */
export function textoParaLaCadena(libro: Array<{ n?: number; de: string; tipo: string; texto: string }>, piezaTexto: string | null | undefined, conIdeasDeLosAportes = false): string {
  const ult = [...libro].reverse().find((a) => a.tipo === 'integra' && a.texto.trim())
  if (ult) {
    const integracion = ult.texto.trim()
    const ideas = conIdeasDeLosAportes ? ideasDeLosAportes(libro, integracion) : []
    return ideas.length ? `${integracion}\n\n${TITULO_IDEAS_DE_LOS_APORTES}\n\n${ideas.join('\n')}` : integracion
  }
  if (piezaTexto?.trim()) return piezaTexto.trim()
  return libro.filter((a) => ['dirige', 'aporta', 'responde'].includes(a.tipo) && a.texto.trim()).map((a) => `[${a.de}] ${a.texto.trim()}`).join('\n\n')
}
/** lo que la mesa le entrega a la cadena: la de concepto lleva las ideas de los aportes */
export const textoDeLaMesaParaLaCadena = (enc: Pick<Encargo, 'familia'>, libro: Array<{ n?: number; de: string; tipo: string; texto: string }>, piezaTexto: string | null | undefined): string =>
  textoParaLaCadena(libro, piezaTexto, enc.familia === FAMILIA_DE.concepto)

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
      const x = ref.tipo_de_mesa === 'brief' ? await P.cadena.entregarBrief(base)
        : ref.tipo_de_mesa === 'reubicacion' ? (P.cadena.entregarReubicacion ? await P.cadena.entregarReubicacion(base) : { ok: false as const, error: 'la cadena no recibe reubicaciones en este entorno' })
        : await P.cadena.entregarConcepto({ ...base, brief_devuelto: o.brief_devuelto ?? null })
      entrega = x.ok ? { ok: true, detalle: x.estado ?? 'recibida', ...(x.siguiente ? { siguiente: x.siguiente } : {}) } : { ok: false, detalle: x.error ?? 'la cadena no recibió la entrega' }
    } catch (e) { entrega = { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
  const cambios: Cambios = { encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.estado_del_motor.gasto_usd, estado: o.estado, con_desacuerdo: o.estado !== 'cerrado' }
  await P.almacen.guardar(cambios)
  if (!entrega.ok) await P.avisar({ canal: "alertas", encargo_id: enc.id, texto: `⚠️ La mesa de la cadena (${enc.brief_id}) cerró pero la cadena no recibió el tablero (${entrega.detalle}); la campaña seguirá con lo que tenga al vencer el plazo de la mesa.`, dry_run: enc.dry_run })
  return r(200, { accion: 'cerrado', estado: o.estado, con_desacuerdo: o.estado !== 'cerrado', motivo: o.motivo, brief_devuelto: o.brief_devuelto ? true : undefined, simulado: enc.dry_run, gasto_usd: enc.estado_del_motor.gasto_usd, resultado_para_la_sala: enc.familia, sala_ref: enc.sala_ref, entrega_a_la_cadena: entrega })
}

/**
 * 11-nov (#1014 · relectura) · el texto que una mesa de la cadena dejó guardado en su encargo (`pieza_texto` del artefacto `mesa`), para releerlo SIN volver a llamar al agente.
 * Vive aquí porque solo la oficina nombra sus tablas; la cadena lo importa en el acto. Nunca lanza.
 * 🟡 CC7 punto 4 · «no hay texto» (`ok: true, texto: null`) NO es lo mismo que «la base no respondió» (`ok: false`): un error pasajero no debe dar la relectura por hecha.
 */
export type TextoGuardado = { ok: true; texto: string | null } | { ok: false; motivo: string }
export async function textoGuardadoDeLaMesa(db: { from: (t: string) => any }, encargoId: string): Promise<TextoGuardado> {
  try {
    const { data, error } = await db.from('oficina_encargos').select('estado_del_motor').eq('id', encargoId).maybeSingle()
    if (error) return { ok: false, motivo: String((error as { message?: unknown }).message ?? 'error de la base') }
    if (!data) return { ok: true, texto: null }
    const t = (data as { estado_del_motor?: { artefactos?: { mesa?: { datos?: { pieza_texto?: unknown } } } } }).estado_del_motor?.artefactos?.mesa?.datos?.pieza_texto
    return { ok: true, texto: typeof t === 'string' && t.trim() ? t : null }
  } catch (e) { return { ok: false, motivo: e instanceof Error ? e.message : String(e) } }
}
