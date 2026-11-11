/**
 * COLATERALES 2d · pieza B · la REVISIÓN de los retoques y su VUELTA (opción 1 de Lenovo 02:15Z · líneas 1-3 de CC7 · líneas de CC6 en la certificación de #1024).
 *
 *   · al ENTREGAR la secretaria, los retoques `propuesto` van a UNA revisión de la jefatura (tipo `colateral`, #1024), con vuelta a `api/jefatura/colaterales-vuelta`.
 *     Antes se mira el saldo: el tope diario del cliente (dato) contra lo gastado hoy + lo que está en vuelo + esta revisión. Sin saldo, sin tope o sin poder leerlo → `pendiente`.
 *     La revisión se abre por la MISMA función que la ruta de la jefatura, que valida la entrada (ningún cimiento entra) · línea 1 de CC6.
 *   · la VUELTA solo hace algo si la edición sigue `en_curso`: un veredicto tardío no aplica nada (línea 3 de CC7).
 *     Solo con resultado `limpia` y no simulada se miran los veredictos; con cualquier otro resultado, todo `pendiente` (línea 2 de CC6). En seco nunca se aplica nada (línea 4).
 *     Los veredictos se VUELVEN a verificar contra los retoques pedidos (no se confía en `sin_veredicto`): lo pedido sin veredicto válido es `pendiente` (línea 3).
 *   · cuando no queda nada `propuesto`, se aplican los aprobados y la edición pasa a `lista` (condicional).
 *   · quién decide lo `pendiente` (regla de Emilio · Lenovo 02:15Z): el manual y el Plan de Marketing, Emilio; cualquier otro documento, `jefe-marketing`. Queda en el motivo.
 *     El paso en que `jefe-marketing` decide sus pendientes NO está aquí (pregunta abierta a Lenovo): quedan listados con su dueño.
 *   · pieza D (líneas 1-7 de CC6): un `rechaza` sobre un retoque sin rehacer lo deja «por rehacer» (sigue `propuesto`, con la razón del jefe); la edición espera
 *     al rehacer (ver rehacer.ts). Un `rechaza` sobre un rehecho → `rechazado` (el documento de abajo sigue como estaba). En un cimiento no hay rehacer → `pendiente`.
 * Agnóstico: ningún dato de un cliente.
 */
import { DOCUMENTOS_DE_CIMIENTO, textoDeLosRetoques, verificarVeredictos } from '../jefatura/revision/colateral'
import type { Edicion } from './almacen'
import { AGENTE_SECRETARIA, FACTOR_DE_RESERVA, TOPE_DE_LA_LLAMADA_USD, TOPE_DE_LA_REVISION_USD, TOPE_DEL_REHACER_USD, TOPE_POR_EDICION_USD, type PuertosDelTurno } from './turno'

export const RUTA_DE_VUELTA_DE_COLATERALES = 'api/jefatura/colaterales-vuelta'
/** los documentos cuyo pendiente decide Emilio (regla de Emilio · Lenovo 02:15Z); todo lo demás lo decide `jefe-marketing` */
export const DOCUMENTOS_QUE_DECIDE_EMILIO = ['manual', 'plan'] as const
export const duenoDelPendiente = (documento: string): 'Emilio' | 'jefe-marketing' => ((DOCUMENTOS_QUE_DECIDE_EMILIO as readonly string[]).includes(documento) ? 'Emilio' : 'jefe-marketing')
export const motivoDePendiente = (razon: string, documento: string): string => `${razon} · lo decide ${duenoDelPendiente(documento)}`

export interface EntradaDeRevisionColateral {
  artifact_type: 'colateral'
  artifact_id: string
  client_id: string
  journey_id: null
  payload: Record<string, unknown>
}
export type ResultadoDeAbrirColateral =
  | { estado: 'esperando'; revision_id: string }
  | { estado: 'cerrada'; salida: Record<string, unknown> }
  | { estado: 'no_abre' | 'error'; motivo: string }

export interface Fila { id: string; estado: string; documento: string; seccion: string; antes: string; despues: string; porque: string; revision_id: string | null; rehechos: number; motivo: string | null; pedazo_id: string; pedazo_texto: string }
const deFila = (f: Record<string, unknown>): Fila => ({
  id: String(f.id), estado: String(f.estado), documento: String(f.documento), seccion: String(f.seccion ?? ''), antes: String(f.antes ?? ''), despues: String(f.despues ?? ''),
  porque: String(f.porque ?? ''), revision_id: typeof f.revision_id === 'string' && f.revision_id !== '' ? f.revision_id : null,
  rehechos: Number(f.rehechos) || 0, motivo: typeof f.motivo === 'string' && f.motivo !== '' ? f.motivo : null, pedazo_id: String(f.pedazo_id ?? ''), pedazo_texto: String(f.pedazo_texto ?? ''),
})
export const retoques = async (P: PuertosDelTurno, edicion_id: string): Promise<Fila[]> => (await P.almacen.retoquesDe(edicion_id)).map(deFila)
/** pieza D · «por rehacer»: el jefe lo rechazó y todavía no se rehízo (sigue `propuesto`, con la razón en `motivo`) */
export const porRehacer = (t: Pick<Fila, 'estado' | 'rehechos' | 'motivo'>): boolean => t.estado === 'propuesto' && t.rehechos === 0 && t.motivo !== null
const esCimiento = (documento: string): boolean => (DOCUMENTOS_DE_CIMIENTO as readonly string[]).includes(documento)
const mensaje = (x: unknown): string => (x instanceof Error ? x.message : String(x))

/** la entrada de la revisión: la edición del dueño (ya decidida) y los retoques, cada uno con SU id de fila */
export function sobreDeLaRevision(e: Pick<Edicion, 'id' | 'client_id' | 'documento' | 'seccion' | 'antes' | 'despues'>, rs: Fila[], version: number): EntradaDeRevisionColateral {
  const edicion_del_dueno = { documento: e.documento, seccion: e.seccion, antes: e.antes, despues: e.despues }
  const lista = rs.map((t) => ({ id: t.id, documento: t.documento, seccion: t.seccion, antes: t.antes, despues: t.despues, porque: t.porque }))
  return {
    artifact_type: 'colateral', artifact_id: e.id, client_id: e.client_id, journey_id: null,
    payload: { texto: textoDeLosRetoques(edicion_del_dueno, lista), dry_run: false, version, edicion_del_dueno, retoques: lista, productores: [{ donde: '*', agente: AGENTE_SECRETARIA }] },
  }
}

/**
 * 11-nov · pieza D (opción 1 de Lenovo 04:15Z) · ¿alcanza el tope de ESTA edición (US$ 0,50, decisión de Emilio) para `esto`? Lo cobrado de verdad + la reserva
 * de lo que salió sin recibo todavía (cada llamada su tope × 1,3; cada revisión abierta su tope) + `esto` ≤ el tope. Sin poder leer → no alcanza (frena).
 */
export async function saldoDeLaEdicion(P: PuertosDelTurno, e: Edicion, esto: number, que: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  let g: Awaited<ReturnType<PuertosDelTurno['gastoDeLaEdicion']>>
  try { g = await P.gastoDeLaEdicion(e) } catch (x) { return { ok: false, motivo: `no se pudo leer el gasto de la edición (${mensaje(x)})` } }
  const reserva = g.secretaria_sin_recibo * TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA + g.rehacer_sin_recibo * TOPE_DEL_REHACER_USD * FACTOR_DE_RESERVA + g.revisiones_abiertas * TOPE_DE_LA_REVISION_USD
  if (g.cobrado + reserva + esto > TOPE_POR_EDICION_USD) return { ok: false, motivo: `sin saldo en la edición para ${que}: cobrado ${g.cobrado.toFixed(3)} + reservado ${reserva.toFixed(3)} + ${esto.toFixed(3)} > ${TOPE_POR_EDICION_USD}` }
  return { ok: true }
}

/** ¿alcanza el tope diario del cliente para UNA revisión más? (lo gastado hoy incluye a esta edición: su recibo ya está) */
export async function saldoParaLaRevision(P: PuertosDelTurno, e: Pick<Edicion, 'client_id'>): Promise<{ ok: true } | { ok: false; motivo: string }> {
  let tope: number | null
  try { tope = await P.topeDiario(e.client_id) } catch (x) { return { ok: false, motivo: `no se pudo leer el tope diario (${mensaje(x)})` } }
  if (tope === null || !Number.isFinite(tope) || tope <= 0) return { ok: false, motivo: 'el cliente no tiene tope diario definido' }
  let g: Awaited<ReturnType<PuertosDelTurno['gastoDelDia']>>
  try { g = await P.gastoDelDia(e.client_id, '') } catch (x) { return { ok: false, motivo: `no se pudo leer el gasto del día (${mensaje(x)})` } }
  const hoy = g.recibos + g.revisiones + g.en_vuelo * TOPE_DE_LA_LLAMADA_USD * FACTOR_DE_RESERVA + g.revisiones_abiertas * TOPE_DE_LA_REVISION_USD
  if (hoy + TOPE_DE_LA_REVISION_USD > tope) return { ok: false, motivo: `sin saldo para la revisión: hoy ${hoy.toFixed(2)} + esta revisión ${TOPE_DE_LA_REVISION_USD.toFixed(2)} > ${tope}` }
  return { ok: true }
}

export async function aPendiente(P: PuertosDelTurno, rs: Fila[], razon: string): Promise<number> {
  let n = 0
  for (const t of rs) if (await P.almacen.pasarRetoque(t.id, 'propuesto', 'pendiente', { motivo: motivoDePendiente(razon, t.documento) })) n++
  return n
}

export interface ResultadoDeVeredictos { aprobados: number; rechazados: number; pendientes: number; por_rehacer: number }

/** aplica a los retoques de ESA revisión lo que la jefatura juzgó · idempotente: solo toca retoques que siguen `propuesto` y atados a esa revisión */
export async function aplicarVeredictos(P: PuertosDelTurno, edicion_id: string, salida: Record<string, unknown>): Promise<ResultadoDeVeredictos> {
  const r: ResultadoDeVeredictos = { aprobados: 0, rechazados: 0, pendientes: 0, por_rehacer: 0 }
  const revision_id = typeof salida.revision_id === 'string' ? salida.revision_id : ''
  // lo ya marcado «por rehacer» por esta misma revisión no se vuelve a tocar (vuelta repetida)
  const pedidos = (await retoques(P, edicion_id)).filter((t) => t.estado === 'propuesto' && revision_id !== '' && t.revision_id === revision_id && !porRehacer(t))
  if (!pedidos.length) return r
  if (salida.simulado !== false) { r.pendientes = await aPendiente(P, pedidos, 'la revisión fue simulada (en seco no se aplica nada)'); return r }
  if (salida.resultado !== 'limpia') { r.pendientes = await aPendiente(P, pedidos, `la revisión terminó «${String(salida.resultado)}»`); return r }
  const v = salida.veredictos && typeof salida.veredictos === 'object' ? (salida.veredictos as Record<string, unknown>).veredictos : undefined
  const porId = new Map(verificarVeredictos(pedidos.map((t) => t.id), v).veredictos.map((x) => [x.id, x]))
  for (const t of pedidos) {
    const x = porId.get(t.id)
    if (!x) { if (await P.almacen.pasarRetoque(t.id, 'propuesto', 'pendiente', { motivo: motivoDePendiente('la jefatura no dio un veredicto válido', t.documento) })) r.pendientes++; continue }
    if (x.veredicto === 'aprueba') { if (await P.almacen.pasarRetoque(t.id, 'propuesto', 'aprobado', { motivo: x.razon || 'aprobado por la jefatura' })) r.aprobados++; continue }
    // línea 7 de CC6: en un cimiento no hay rehacer (va a una persona)
    if (esCimiento(t.documento)) { if (await P.almacen.pasarRetoque(t.id, 'propuesto', 'pendiente', { motivo: motivoDePendiente(`la jefatura lo rechazó y en un cimiento no se rehace: ${x.razon}`, t.documento) })) r.pendientes++; continue }
    // línea 1 de CC6: se rehace UNA vez; un rehecho que vuelve a caer queda `rechazado`
    if (t.rehechos === 0) { if (await P.almacen.marcarParaRehacer(t.id, revision_id, x.razon)) r.por_rehacer++; continue }
    if (await P.almacen.pasarRetoque(t.id, 'propuesto', 'rechazado', { motivo: `rechazado por la jefatura: ${x.razon}` })) r.rechazados++
  }
  return r
}

export interface ResultadoDeCerrar {
  estado: 'esperando' | 'lista' | 'ya_cerrada'
  aplicados?: number
  pendientes?: { Emilio: string[]; 'jefe-marketing': string[] }
}

/** si ya no queda nada `propuesto`: aplica los aprobados y pasa la edición a `lista` · solo con la edición `en_curso` (se relee justo antes) */
export async function cerrarSiNoQuedaNada(P: PuertosDelTurno, edicion_id: string): Promise<ResultadoDeCerrar> {
  if ((await retoques(P, edicion_id)).some((t) => t.estado === 'propuesto')) return { estado: 'esperando' }
  const e = await P.almacen.edicion(edicion_id)
  if (!e || e.estado !== 'en_curso') return { estado: 'ya_cerrada' }
  const ap = await P.aplicar(edicion_id)
  const pendientes: { Emilio: string[]; 'jefe-marketing': string[] } = { Emilio: [], 'jefe-marketing': [] }
  for (const t of await retoques(P, edicion_id)) if (t.estado === 'pendiente') pendientes[duenoDelPendiente(t.documento)].push(t.id)
  const nota = `aplicados ${ap.aplicados.length} · pendientes: Emilio ${pendientes.Emilio.length}, jefe-marketing ${pendientes['jefe-marketing'].length}`
  if (!(await P.almacen.pasarEdicion(edicion_id, 'en_curso', 'lista', { nota }))) return { estado: 'ya_cerrada', aplicados: ap.aplicados.length, pendientes }
  return { estado: 'lista', aplicados: ap.aplicados.length, pendientes }
}

export type ResultadoDeRevisar =
  | { estado: 'esperando'; revision_id: string; atados: number }
  | { estado: 'sin_revision'; motivo: string; cierre: ResultadoDeCerrar }
  | ({ estado: 'juzgada'; cierre: ResultadoDeCerrar } & ResultadoDeVeredictos)

/** al entregar: abre la revisión de los `propuesto` sin revisión · nunca lanza por la jefatura (lo que no se revisa queda `pendiente`) */
export async function revisarLaEdicion(P: PuertosDelTurno, e: Edicion): Promise<ResultadoDeRevisar> {
  const rs = (await retoques(P, e.id)).filter((t) => t.estado === 'propuesto' && t.revision_id === null)
  if (!rs.length) return { estado: 'sin_revision', motivo: 'nada propuesto sin revisión', cierre: await cerrarSiNoQuedaNada(P, e.id) }
  // pieza D (hallazgo en B · Lenovo 04:15Z): también el tope de ESTA edición, en la primera revisión y en la de los rehechos
  const saldo = await saldoParaLaRevision(P, e).then(async (d) => (d.ok ? saldoDeLaEdicion(P, e, TOPE_DE_LA_REVISION_USD, 'la revisión') : d))
  if (!saldo.ok) { await aPendiente(P, rs, saldo.motivo); return { estado: 'sin_revision', motivo: saldo.motivo, cierre: await cerrarSiNoQuedaNada(P, e.id) } }
  // pieza D: la revisión de los rehechos es la versión 2 (la jefatura no la confunde con la primera)
  const version = 1 + Math.max(...rs.map((t) => t.rehechos))
  const r: ResultadoDeAbrirColateral = await P.abrirRevisionColateral(sobreDeLaRevision(e, rs, version)).catch((x: unknown) => ({ estado: 'error' as const, motivo: mensaje(x) }))
  if (r.estado === 'no_abre' || r.estado === 'error') {
    const motivo = `la jefatura no abrió la revisión (${r.motivo})`
    await aPendiente(P, rs, motivo)
    return { estado: 'sin_revision', motivo, cierre: await cerrarSiNoQuedaNada(P, e.id) }
  }
  const salidaYa = r.estado === 'cerrada' ? r.salida : null
  const revision_id = r.estado === 'esperando' ? r.revision_id : String(salidaYa?.revision_id ?? '')
  if (!revision_id) { const motivo = 'la jefatura no devolvió el número de la revisión'; await aPendiente(P, rs, motivo); return { estado: 'sin_revision', motivo, cierre: await cerrarSiNoQuedaNada(P, e.id) } }
  const atados = await P.almacen.atarRevision(rs.map((t) => t.id), revision_id)
  if (!salidaYa) return { estado: 'esperando', revision_id, atados }
  // la revisión ya había cerrado (la misma edición volvió a entregar): su salida se aplica ahora
  const v = await aplicarVeredictos(P, e.id, salidaYa)
  return { estado: 'juzgada', ...v, cierre: await cerrarSiNoQuedaNada(P, e.id) }
}

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }

/** la vuelta de la jefatura (`{ marcas, salida }`) · idempotente · una edición que ya no está `en_curso` no recibe nada */
export async function recibirVueltaColateral(P: PuertosDelTurno, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const s = cuerpo.salida
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`salida` debe ser un objeto'] } }
  const salida = s as Record<string, unknown>
  const errores: string[] = []
  if (salida.artifact_type !== 'colateral') errores.push('`salida.artifact_type` debe ser «colateral»: esta ruta solo vuelve a colaterales')
  if (typeof salida.revision_id !== 'string' || !salida.revision_id) errores.push('`salida.revision_id` es obligatorio')
  if (typeof salida.artifact_id !== 'string' || !salida.artifact_id) errores.push('`salida.artifact_id` es obligatorio')
  if (typeof salida.resultado !== 'string') errores.push('`salida.resultado` es obligatorio')
  if (errores.length) return { status: 400, cuerpo: { error: 'entrada_invalida', errores } }
  const e = await P.almacen.edicion(String(salida.artifact_id))
  if (!e) return { status: 404, cuerpo: { error: 'edicion_no_existe' } }
  if (e.estado !== 'en_curso') return { status: 200, cuerpo: { accion: 'tarde', estado: e.estado, nota: 'la edición ya no está en curso: el veredicto no aplica nada' } }
  const v = await aplicarVeredictos(P, e.id, salida)
  const c = await cerrarSiNoQuedaNada(P, e.id)
  return { status: 200, cuerpo: { accion: 'juzgada', revision_id: salida.revision_id, ...v, cierre: c } }
}
