/**
 * COLATERALES 2d · pieza D · REHACER UNA VEZ lo que la jefatura rechazó (opción 1 de Lenovo 02:15Z · las 7 líneas de CC6 del 11-nov).
 *
 *   · la vuelta de la jefatura deja «por rehacer» los `rechaza` sin rehacer (vuelta.ts) y avisa con `por_rehacer`; el flujo despierta `rehacer`.
 *   · REHACER (no gasta): solo con la edición `en_curso` (línea 6) · junta los «por rehacer» (nunca lo aprobado: línea 3) · sin saldo → `pendiente`
 *     (línea 4: el tope diario del cliente Y el de la edición, con lo cobrado de verdad · opción 1 de Lenovo 04:15Z) · devuelve el PEDIDO de la secretaria con la razón del jefe por pedazo (línea 2), su llave de despacho FIJA
 *     (`colaterales:<id>:rehacer`, distinta de la primera: `una_sola_vez` la deja correr una sola vez) y el SELLO de lo pedido.
 *   · ENTREGAR EL REHECHO: el sello debe coincidir (si algo cambió → `pendiente`) · cada retoque acepta UN solo rehecho de SU mismo pedazo;
 *     un pedazo distinto, uno de más o repetido no cuenta y su retoque queda `pendiente` (línea 2) · lo aceptado pasa `propuesto → propuesto`
 *     (el almacén sube `rehechos` a 1 y no deja una segunda vez: línea 1) y suelta la revisión vieja · después se abre la revisión versión 2,
 *     que juzga SOLO los rehechos (línea 3). Un rehecho que vuelve a caer queda `rechazado` (vuelta.ts). Una falla → `pendiente` (línea 5).
 *   · en un cimiento no hay rehacer (línea 7): la vuelta ya lo manda a una persona, y aquí se vuelve a filtrar.
 * Agnóstico: ningún dato de un cliente.
 */
import { createHash } from 'node:crypto'
import { DOCUMENTOS_DE_CIMIENTO } from '../jefatura/revision/colateral'
import type { Documento } from '../cadena/dependencias-de-documentos'
import { AGENTE_SECRETARIA, FACTOR_DE_RESERVA, TOPE_DE_LA_LLAMADA_USD, TOPE_DE_LA_REVISION_USD, TOPE_DEL_REHACER_USD, type PuertosDelTurno } from './turno'
import { aPendiente, cerrarSiNoQuedaNada, porRehacer, retoques, revisarLaEdicion, saldoDeLaEdicion, type Fila, type ResultadoDeCerrar, type ResultadoDeRevisar } from './vuelta'

export { TOPE_DEL_REHACER_USD }
export const llaveDelRehacer = (edicion_id: string): string => `colaterales:${edicion_id}:rehacer`

const esCimiento = (documento: string): boolean => (DOCUMENTOS_DE_CIMIENTO as readonly string[]).includes(documento)
const mensaje = (x: unknown): string => (x instanceof Error ? x.message : String(x))

/** el pedido de rehacer: la edición del dueño y, por pedazo, lo propuesto y la razón del jefe · solo se pide el `despues` nuevo */
export function pedidoDeRehacer(e: { documento: string; seccion: string; antes: string; despues: string }, rs: Fila[]): string {
  return [
    'Rehaces retoques de colaterales que la jefatura rechazó. NO uses herramientas. Responde solo con el objeto JSON pedido.',
    '',
    `EDICIÓN DEL DUEÑO: en «${e.documento}», sección «${e.seccion}», cambió`,
    `ANTES: «${e.antes}»`,
    `DESPUÉS: «${e.despues}»`,
    '',
    'Por cada pedazo de abajo: el fragmento que se cambia («antes») queda IGUAL; propón un «despues» nuevo que atienda la razón del jefe,',
    'con el retoque MÍNIMO, el mismo estilo y registro del documento, sin inventar hechos. Devuelve UN objeto por pedazo, con su MISMO id.',
    'Forma: {"rehechos":[{"id":"C1","despues":"...","porque":"..."}]}',
    '',
    'PEDAZOS:',
    ...rs.map((t) => `[${t.pedazo_id}] (${t.documento} · ${t.seccion}) ${t.pedazo_texto}\n  antes: «${t.antes}»\n  propuesto y rechazado: «${t.despues}»\n  razón del jefe: ${t.motivo}`),
  ].join('\n')
}

/** el sello de lo pedido: los retoques (id, pedazo, antes, propuesto, razón) y la versión vigente de sus documentos */
export function selloDelRehacer(rs: Fila[], versiones: Partial<Record<string, string>>): string {
  const filas = rs.map((t) => [t.id, t.pedazo_id, t.antes, t.despues, t.motivo]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  const vs = Object.entries(versiones).sort((a, b) => a[0].localeCompare(b[0]))
  return createHash('sha256').update(JSON.stringify({ filas, vs })).digest('hex').slice(0, 32)
}

async function versionesDe(P: PuertosDelTurno, e: Parameters<PuertosDelTurno['documentos']>[0], rs: Fila[]): Promise<Partial<Record<string, string>>> {
  const docs = [...new Set(rs.map((t) => t.documento))] as Documento[]
  const leidos = await P.documentos(e, docs)
  return Object.fromEntries(docs.map((d) => [d, leidos[d]?.version ?? 'sin_lector']))
}

/** ¿alcanza el tope DIARIO del cliente para el rehacer y su segunda revisión? (el de la edición lo mira `saldoDeLaEdicion`) */
export async function saldoParaRehacer(P: PuertosDelTurno, e: { client_id: string }): Promise<{ ok: true } | { ok: false; motivo: string }> {
  let tope: number | null
  try { tope = await P.topeDiario(e.client_id) } catch (x) { return { ok: false, motivo: `no se pudo leer el tope diario (${mensaje(x)})` } }
  if (tope === null || !Number.isFinite(tope) || tope <= 0) return { ok: false, motivo: 'el cliente no tiene tope diario definido' }
  let g: Awaited<ReturnType<PuertosDelTurno['gastoDelDia']>>
  try { g = await P.gastoDelDia(e.client_id, '') } catch (x) { return { ok: false, motivo: `no se pudo leer el gasto del día (${mensaje(x)})` } }
  const hoy = g.recibos + g.revisiones + g.en_vuelo * TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA + g.revisiones_abiertas * TOPE_DE_LA_REVISION_USD
  const esto = TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + TOPE_DE_LA_REVISION_USD
  if (hoy + esto > tope) return { ok: false, motivo: `sin saldo para rehacer: hoy ${hoy.toFixed(2)} + rehacer y su revisión ${esto.toFixed(2)} > ${tope}` }
  return { ok: true }
}

export type ResultadoDeRehacer =
  | { accion: 'ya_cerrada'; estado: string }
  | { accion: 'nada'; cierre: ResultadoDeCerrar }
  | { accion: 'sin_rehacer'; motivo: string; pendientes: number; cierre: ResultadoDeCerrar }
  | { accion: 'pedir'; agente: string; pedido: string; tope_usd: number; dispatch_key: string; sello: string; retoques: string[] }

/** el turno del rehacer · no gasta ni escribe, salvo mandar a `pendiente` lo que no se puede rehacer */
export async function rehacer(P: PuertosDelTurno, p: { edicion_id: string }): Promise<ResultadoDeRehacer> {
  const e = await P.almacen.edicion(p.edicion_id)
  if (!e) return { accion: 'ya_cerrada', estado: 'no_existe' }
  if (e.estado !== 'en_curso') return { accion: 'ya_cerrada', estado: e.estado }
  const todos = (await retoques(P, e.id)).filter(porRehacer)
  const cimientos = todos.filter((t) => esCimiento(t.documento))
  if (cimientos.length) await aPendiente(P, cimientos, 'en un cimiento no se rehace')
  const rs = todos.filter((t) => !esCimiento(t.documento))
  if (!rs.length) return { accion: 'nada', cierre: await cerrarSiNoQuedaNada(P, e.id) }
  // el tope DIARIO del cliente y el de ESTA edición (opción 1 de Lenovo 04:15Z): el rehacer y su segunda revisión
  const saldo = await saldoParaRehacer(P, e).then(async (d) => (d.ok ? saldoDeLaEdicion(P, e, TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + TOPE_DE_LA_REVISION_USD, 'rehacer y su revisión') : d))
  if (!saldo.ok) return { accion: 'sin_rehacer', motivo: saldo.motivo, pendientes: await aPendiente(P, rs, saldo.motivo), cierre: await cerrarSiNoQuedaNada(P, e.id) }
  let versiones: Partial<Record<string, string>>
  try { versiones = await versionesDe(P, e, rs) } catch (x) {
    const motivo = `no se pudieron leer los documentos para rehacer (${mensaje(x)})`
    return { accion: 'sin_rehacer', motivo, pendientes: await aPendiente(P, rs, motivo), cierre: await cerrarSiNoQuedaNada(P, e.id) }
  }
  return {
    accion: 'pedir', agente: AGENTE_SECRETARIA, pedido: pedidoDeRehacer(e, rs), tope_usd: TOPE_DEL_REHACER_USD,
    dispatch_key: llaveDelRehacer(e.id), sello: selloDelRehacer(rs, versiones), retoques: rs.map((t) => t.id),
  }
}

export type ResultadoDeEntregarRehecho =
  | { accion: 'ya_cerrada'; estado: string }
  | { accion: 'sin_rehacer'; motivo: string; pendientes: number; cierre: ResultadoDeCerrar }
  | { accion: 'rehechos'; rehechos: number; pendientes: number; revision: ResultadoDeRevisar }

/** la salida del rehacer, leída sin confiar en su forma: `{ rehechos: [{ id, despues, porque }] }` (cualquier otra cosa = null) */
export function leerRehechos(v: unknown): { id: string; despues: string; porque: string }[] | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const l = (v as Record<string, unknown>).rehechos
  if (!Array.isArray(l) || !l.every((x) => x && typeof x === 'object' && !Array.isArray(x))) return null
  const s = (x: unknown) => (typeof x === 'string' ? x : '')
  return (l as Record<string, unknown>[]).map((x) => ({ id: s(x.id), despues: s(x.despues), porque: s(x.porque) }))
}

export async function entregarRehecho(P: PuertosDelTurno, p: { edicion_id: string; sello: string; salida: unknown }): Promise<ResultadoDeEntregarRehecho> {
  const e = await P.almacen.edicion(p.edicion_id)
  if (!e) return { accion: 'ya_cerrada', estado: 'no_existe' }
  if (e.estado !== 'en_curso') return { accion: 'ya_cerrada', estado: e.estado }
  const rs = (await retoques(P, e.id)).filter((t) => porRehacer(t) && !esCimiento(t.documento))
  const fallar = async (motivo: string): Promise<ResultadoDeEntregarRehecho> => ({ accion: 'sin_rehacer', motivo, pendientes: await aPendiente(P, rs, motivo), cierre: await cerrarSiNoQuedaNada(P, e.id) })
  if (!rs.length) return { accion: 'sin_rehacer', motivo: 'nada por rehacer', pendientes: 0, cierre: await cerrarSiNoQuedaNada(P, e.id) }
  let versiones: Partial<Record<string, string>>
  try { versiones = await versionesDe(P, e, rs) } catch (x) { return fallar(`no se pudieron leer los documentos (${mensaje(x)})`) }
  if (selloDelRehacer(rs, versiones) !== p.sello) return fallar('lo pedido cambió entre el pedido y la entrega del rehacer')
  const l = leerRehechos(p.salida)
  if (!l) return fallar('la salida del rehacer no tiene la forma pedida')
  let rehechos = 0
  const malos: Fila[] = []
  for (const t of rs) {
    const suyos = l.filter((x) => x.id === t.pedazo_id)
    const x = suyos.length === 1 ? suyos[0] : null
    // un solo rehecho de SU pedazo, con un después de verdad distinto (del antes y de lo ya rechazado)
    if (!x || !x.despues.trim() || x.despues === t.antes || x.despues === t.despues || x.despues.length > 4000) { malos.push(t); continue }
    if (await P.almacen.pasarRetoque(t.id, 'propuesto', 'propuesto', { despues: x.despues, porque: x.porque || t.porque, motivo: null, revision_id: null })) rehechos++
  }
  // lo que vino de más (un pedazo que no se pidió) no cuenta: no toca nada
  const pendientes = malos.length ? await aPendiente(P, malos, 'el rehacer no devolvió un único rehecho válido de su mismo pedazo') : 0
  return { accion: 'rehechos', rehechos, pendientes, revision: await revisarLaEdicion(P, e) }
}
