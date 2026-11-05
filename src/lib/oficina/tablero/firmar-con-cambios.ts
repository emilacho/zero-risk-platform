/**
 * Firmar un tablero financiero CON CIFRAS CAMBIADAS (05-nov · encargo de Lenovo, boceto 2 aprobado por Emilio). US$ 0: código puro, sin modelo.
 * El tablero propuesto no se edita: se calcula uno nuevo con la misma fórmula y queda como vigente, firmado por quien firma. El anterior queda `reemplazado`, íntegro y legible.
 * `firma_con_cambios` guarda propuesto, firmado, quién y cuándo; la corrida siguiente lee de ahí la meta fijada por el dueño (`meta_por_semana` va siempre).
 * Con una corrida viva no se firma: terminaría con la cifra anterior sin que nadie lo vea (CC1).
 */
import { cifrasDelBloque, leerLoQueSeFirma } from '../../direccion/decisiones-firma'
import { almacenDeFinanzas, type Db as DbDeFinanzas } from '../../finanzas/almacen-supabase'
import { huellaDe } from '../../finanzas/firma'
import { recalcularConCambios, type CambioDeCifra, type Recalculo } from '../../finanzas/firma-con-cambios'
import type { Bloque, Entrada } from '../../finanzas/tipos'
import { EN_PAUSA, ESTADOS_VIVOS } from '../../planeacion/corridas'
import { esObjeto, rechazo, UUID, type Contexto, type Fila, type Manejador, type Salida } from './comun'

const COLUMNAS = 'id, client_id, version, estado, vigente, dry_run, huella, entrada, bloque, workflow_execution_id'
const ESTADOS_DE_CORRIDA_VIVA = [...ESTADOS_VIVOS, EN_PAUSA]
const MAX_CAMBIOS = 5

function leerCambios(v: unknown): CambioDeCifra[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_CAMBIOS) return null
  const salida: CambioDeCifra[] = []
  for (const c of v) {
    if (!esObjeto(c) || typeof c.clave !== 'string' || typeof c.propuesto !== 'number' || typeof c.firmado !== 'number') return null
    salida.push({ clave: c.clave, propuesto: c.propuesto, firmado: c.firmado })
  }
  return salida
}

type Preparado = { ok: true; tablero: Fila; toca: Record<string, unknown>; r: Extract<Recalculo, { ok: true }> } | { ok: false; salida: Salida }

/** todo lo que debe cumplirse para mostrar o firmar el cambio. No escribe */
async function preparar({ db }: Pick<Contexto, 'db'>, cuerpo: Record<string, unknown>): Promise<Preparado> {
  const no = (salida: Salida): Preparado => ({ ok: false, salida })
  if (typeof cuerpo.tablero_id !== 'string' || !UUID.test(cuerpo.tablero_id)) return no(rechazo(400, 'entrada_invalida', '`tablero_id` debe ser un uuid'))
  const cambios = leerCambios(cuerpo.cambios)
  if (!cambios) return no(rechazo(400, 'entrada_invalida', '`cambios` debe traer de 1 a 5 cifras con `clave`, `propuesto` y `firmado`'))
  const r = await db.from('finanzas_tableros').select(COLUMNAS).eq('id', cuerpo.tablero_id).limit(1)
  if (r.error) return no(rechazo(500, 'finanzas_error', r.error.message))
  const t = ((r.data as Fila[] | null) ?? [])[0]
  if (!t) return no(rechazo(404, 'tablero_inexistente', 'no existe ese tablero'))
  const toca = { client_id: String(t.client_id) }
  if (t.estado !== 'sin_firma') return no(rechazo(409, 'no_esta_sin_firma', `solo se firma un tablero «sin_firma» (este está «${String(t.estado)}»)`, toca))
  if (t.dry_run === true) return no(rechazo(409, 'es_un_ensayo', 'un tablero de ensayo no se firma', toca))
  if (t.vigente !== true) return no(rechazo(409, 'no_es_el_vigente', 'solo se firma el tablero vigente del cliente', toca))
  if (!t.huella || !esObjeto(t.bloque) || huellaDe(t.bloque as unknown as Bloque) !== t.huella) return no(rechazo(409, 'huella_no_coincide', 'el tablero no coincide con su huella: no se recalcula sobre él', toca))
  if (!esObjeto(t.entrada)) return no(rechazo(409, 'no_se_puede_recalcular', 'el tablero no guardó su entrada', toca))
  const vivas = await db.from('plan_corridas').select('id').eq('client_id', String(t.client_id)).in('estado', ESTADOS_DE_CORRIDA_VIVA).limit(1)
  if (vivas.error) return no(rechazo(500, 'corridas_error', vivas.error.message, toca))
  if (((vivas.data as Fila[] | null) ?? []).length) return no(rechazo(409, 'corrida_viva', 'hay un plan corriendo: terminaría con la cifra anterior. Espera a que termine', toca))
  const c = recalcularConCambios(t.entrada as unknown as Entrada, t.bloque as unknown as Bloque, cambios)
  if (!c.ok) return no(rechazo(409, c.error, c.detalle, { ...toca, ...(c.minimo === undefined ? {} : { minimo: c.minimo }) }))
  return { ok: true, tablero: t, toca, r: c }
}

const cifrasEn = async (db: Contexto['db'], t: Fila, bloque: Bloque) => {
  const unidad = (await leerLoQueSeFirma(db as never, [t]).catch(() => new Map())).get(String(t.id))?.unidad ?? null
  return cifrasDelBloque(bloque, unidad)
}

/** `recalcular-tablero` · lo que resultaría del cambio, para verlo antes de firmar. Cambiar el presupuesto cambia la meta: no se firma sin verlo. No escribe */
export const recalcularTablero: Manejador = async ({ db }, { cuerpo }) => {
  const p = await preparar({ db }, cuerpo)
  if (!p.ok) return p.salida
  return { status: 200, cuerpo: { ok: true, tablero_id: p.tablero.id, cambios: p.r.cambios, cifras: await cifrasEn(db, p.tablero, p.r.bloque), alertas: p.r.bloque.alertas ?? [] }, toca: p.toca }
}

/** deshace lo que hizo `guardarTablero`: el cliente nunca se queda sin su tablero */
async function restaurar(db: Contexto['db'], nuevo: string, anterior: unknown): Promise<string[]> {
  const quedo: string[] = []
  const a = await db.from('finanzas_tableros').delete().eq('id', nuevo)
  if (a.error) quedo.push(`nuevo ${nuevo} sin borrar: ${a.error.message}`)
  const b = await db.from('finanzas_tableros').update({ vigente: true, estado: 'sin_firma' }).eq('id', String(anterior))
  if (b.error) quedo.push(`anterior ${String(anterior)} sin restaurar: ${b.error.message}`)
  return quedo
}

/** `firmar-tablero` con `cambios` */
export const firmarConCambios: Manejador = async ({ db, ahora }, { cuerpo, reviewer }) => {
  const p = await preparar({ db }, cuerpo)
  if (!p.ok) return p.salida
  const { tablero: t, r, toca } = p
  const anterior = t.bloque as unknown as Bloque
  let g: { id: string; version: number }
  try {
    g = await almacenDeFinanzas(db as unknown as DbDeFinanzas).guardarTablero({ client_id: String(t.client_id), entrada: r.entrada, bloque: r.bloque, huella: r.huella, numeros: r.numeros, workflow_execution_id: typeof t.workflow_execution_id === 'string' ? t.workflow_execution_id : `firma-con-cambios:${String(t.id)}` })
  } catch (e) { return rechazo(500, 'finanzas_error', e instanceof Error ? e.message : String(e), toca) }
  const hora = ahora().toISOString()
  const u = await db.from('finanzas_tableros').update({
    estado: 'firmado', firmado_por: reviewer, firmado_en: hora,
    firma_con_cambios: { de_tablero: t.id, de_version: t.version, cambios: r.cambios, meta_por_semana: r.meta_por_semana, total_mes: r.total_mes, propuesto: { meta_por_semana: anterior.cifras.meta_por_semana?.valor ?? null, total_mes: anterior.cifras.total_mes?.valor ?? null }, por: reviewer, en: hora },
  }).eq('id', g.id).eq('estado', 'borrador').select('id')
  if (u.error || ((u.data as Fila[] | null) ?? []).length === 0) {
    const quedo = await restaurar(db, g.id, t.id)
    return rechazo(500, 'finanzas_error', `${u.error?.message ?? 'otra decisión se tomó mientras tanto'}${quedo.length ? ` · COMPENSACIÓN INCOMPLETA: ${quedo.join('; ')}` : ' · el tablero anterior sigue vigente'}`, toca)
  }
  return { status: 200, cuerpo: { ok: true, tablero_id: g.id, de_tablero: t.id, version: g.version, estado: 'firmado', firmado_por: reviewer, cambios: r.cambios, cifras: await cifrasEn(db, t, r.bloque), alertas: r.bloque.alertas ?? [] }, toca }
}
