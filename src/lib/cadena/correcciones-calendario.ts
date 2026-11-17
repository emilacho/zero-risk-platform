/**
 * CAMBIO 4 · ENTREGA 2 · el CREADOR «calendario» de una corrección de la jefatura: la mesa de reubicación, por ENTRADA PROPIA (RESPUESTA-LENOVO-a-CC3-CC1:
 * sin el interruptor `reubicar_filas_pasadas`, que sigue gobernando solo lo de hoy).
 *   · Abre la MISMA mesa de la oficina (`abrirMesaDeReubicacion`), con la fila corregida y la corrección en el marco. La decisión se anota en la MISMA libreta
 *     (`reubicacion_libreta`, huella `correccion:<llave>`), así la versión del sobre nunca choca con una reubicación normal y la entrega vuelve por el puerto de siempre.
 *   · Nace `avisado` y `releida`: el aviso y la relectura de las reubicaciones normales no la tocan (menos ruido · el estado se ve en la corrección).
 *   · La vuelta: el creador decide la fila (reubicar · fusionar · descartar) Y deja su línea fija de respuesta. El código lo verifica igual que una reubicación;
 *     una propuesta que no cumple NUNCA descarta la fila: cuenta como no dicha y se reintenta (la fila no se pierde por un error de la mesa).
 *   · La fila de una pieza ya en la oficina sale de `briefeada` / `en_oficina`: reubicada vuelve a `validada` con su fecha nueva (entra al próximo lote: la pieza vieja
 *     queda reemplazada) · fusionada → `cancelada` · descartada → `perdio_su_fecha`.  ⚠️ `en_oficina → validada` es una transición NUEVA: la decide Lenovo (DISEÑO-CC3).
 */
import type { Almacen } from './almacen'
import { hoyEnZona } from './campanas'
import { guardarRespuesta, leerRespuestaDelCreador, marcoDeLaCorreccion, type CreadorDeCorreccion, type RespuestaLeida } from './correcciones'
import { leerDecisiones, marcoDeReubicacion, verificarDecisiones, type Cambio } from './reubicacion'
import { CLAVE_DE_LA_LIBRETA, type Decision, type EntregaDeReubicacion, type Libreta, type SobreDeReubicacion } from './reubicar'
import type { Fila } from './tipos'

export const PREFIJO_HUELLA_DE_CORRECCION = 'correccion:'
/** de dónde puede salir la fila corregida: sin producir, o con su pieza ya en camino (la jefatura de piezas la frenó) */
export const ESTADOS_CORREGIBLES: readonly Fila['estado'][] = ['validada', 'lista_para_brief', 'briefeada', 'en_oficina']

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
async function leerLibreta(al: Almacen): Promise<Libreta> {
  const x = await al.leerConfig(CLAVE_DE_LA_LIBRETA)
  return esObjeto(x) ? (structuredClone(x) as Libreta) : {}
}

/** el creador que la vigía llama: abre la mesa de reubicación para ESA fila */
export const creadorDelCalendario: CreadorDeCorreccion = async (al, c, ahora) => {
  if (!al.abrirMesaDeReubicacion) return { estado: 'sin_creador', motivo: 'la cadena no puede abrir la mesa de reubicación en este entorno' }
  const campana = await al.campana(c.campana_id)
  if (!campana) return { estado: 'no_abre', motivo: 'la campaña ya no existe' }
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const filas = await al.filas(campana.id, version)
  const fila = filas.find((f) => f.id === c.fila_id)
  if (!fila) return { estado: 'no_abre', motivo: `la fila ${c.fila_id} no está en el calendario vigente (v${version})` }
  if (!ESTADOS_CORREGIBLES.includes(fila.estado)) return { estado: 'no_abre', motivo: `la fila ${c.fila_id} está «${fila.estado}»: ya no se corrige desde el calendario` }
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const sedes = (ctx?.sedes ?? []).filter((s) => !campana.sedes.length || campana.sedes.includes(s.clave))
  const x = { hoy: hoyEnZona(ahora, campana.zona_horaria), campana: { fecha_inicio: campana.fecha_inicio, fecha_fin: campana.fecha_fin }, filas, formatos: await al.formatos(), sedes }
  const libreta = await leerLibreta(al)
  const lc = libreta[campana.id] ?? { ultima_version: 0, decisiones: {} }
  const v = lc.ultima_version + 1
  lc.ultima_version = v
  const marco = [marcoDeLaCorreccion(c), '', marcoDeReubicacion([fila], x, ctx?.nombreDelNegocio || 'el cliente').replace(/^# Filas del calendario de (.*) que quedaron atrás sin producir$/m, '# La fila corregida del calendario de $1'), '', `Si NO tomas la corrección, no escribas ninguna línea de decisión para ${fila.id}: la fila queda como está.`].join('\n')
  const sobre: SobreDeReubicacion = { tipo_de_mesa: 'reubicacion', client_id: campana.client_id, campana_id: campana.id, version: v, dry_run: campana.seco, marco_texto: marco, condiciones: [] }
  const huella = `${PREFIJO_HUELLA_DE_CORRECCION}${c.llave}`
  // la libreta se anota ANTES de abrir: la entrega puede volver antes de que esta función termine
  const decision: Decision = { huella, calendario_version: version, fila_ids: [fila.id], version: v, intentos: c.intentos, estado: 'abierta', abierta_en: ahora, encargo_id: null, motivo: null, resumen: null, avisado: true, releida: true }
  lc.decisiones[huella] = decision
  libreta[campana.id] = lc
  await al.escribirConfig(CLAVE_DE_LA_LIBRETA, libreta)
  const r = await al.abrirMesaDeReubicacion(sobre)
  const despues = await leerLibreta(al)
  const d2 = despues[campana.id]?.decisiones[huella]
  if (d2 && d2.version === v) {
    despues[campana.id].decisiones[huella] = r.estado === 'abierta' ? { ...d2, encargo_id: r.encargo_id } : { ...d2, estado: 'fallida', motivo: `la mesa no abrió: ${r.motivo}` }
    await al.escribirConfig(CLAVE_DE_LA_LIBRETA, despues)
  }
  return r.estado === 'abierta' ? { estado: 'entregada' } : { estado: 'no_abre', motivo: `la mesa no abrió: ${r.motivo}` }
}

/** ¿esta entrega de la mesa de reubicación es de una corrección? (la llama `recibirReubicacion` antes de su camino de siempre) */
export function decisionDeCorreccion(lc: Libreta[string] | undefined, version: number): Decision | null {
  const d = lc ? Object.values(lc.decisiones).find((x) => x.version === version) : undefined
  return d && d.huella.startsWith(PREFIJO_HUELLA_DE_CORRECCION) ? d : null
}

/**
 * La vuelta de la mesa para una corrección. Idempotente: solo la entrega del intento vigente aplica. Nunca descarta una fila por una propuesta que no cumple.
 * Devuelve el estado de la decisión (aplicada · fallida · obsoleta) para la oficina.
 */
export async function recibirCorreccionDelCalendario(al: Almacen, p: EntregaDeReubicacion, ahora: string): Promise<{ ok: true; estado?: string; ya_cerrada?: boolean } | { ok: false; error: string }> {
  const libreta = await leerLibreta(al)
  const lc = libreta[p.campana_id]
  const d = decisionDeCorreccion(lc, p.version)
  if (!lc || !d) return { ok: false, error: `la cadena no tiene una corrección del calendario con la versión ${p.version} en esa campaña` }
  if (d.estado !== 'abierta') return { ok: true, ya_cerrada: true, estado: d.estado }
  const llave = d.huella.slice(PREFIJO_HUELLA_DE_CORRECCION.length)
  const cerrar = async (estado: Decision['estado'], motivo: string | null, leida: RespuestaLeida, version_nueva: Record<string, unknown> | null = null) => {
    lc.decisiones[d.huella] = { ...d, estado, motivo, encargo_id: d.encargo_id ?? p.encargo_id }
    await al.escribirConfig(CLAVE_DE_LA_LIBRETA, libreta)
    await guardarRespuesta(al, llave, leida, ahora, version_nueva)
    return { ok: true as const, estado }
  }
  const c = al.correccion ? await al.correccion(llave) : null
  if (!c || c.estado !== 'en_manos_del_creador') return cerrar('obsoleta', 'la corrección ya no está en manos del creador', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'obsoleta' })
  const noDicha = (motivo: string) => cerrar('fallida', motivo, { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: motivo })
  if (!p.texto || !p.texto.trim()) return noDicha(p.motivo ?? 'la mesa no produjo una respuesta')
  const leida = leerRespuestaDelCreador(p.texto, c.dura)
  if (leida.respuesta === 'no_dicha') return cerrar('fallida', leida.motivo_no_dicha ?? 'no dicha', leida)
  const campana = await al.campana(p.campana_id)
  if (!campana) return cerrar('obsoleta', 'la campaña ya no existe', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la campaña ya no existe' })
  const filas = await al.filas(campana.id, d.calendario_version)
  const fila = filas.find((f) => f.id === c.fila_id)
  // línea por línea: `leerDecisiones` se queda con la PRIMERA de cada fila (lo de siempre); en una corrección, dos decisiones sobre la fila son contradictorias = no dicha
  const decisiones = p.texto.split(/\r?\n/).flatMap((l) => leerDecisiones(l)).filter((y) => y.fila_id === c.fila_id)
  if (leida.respuesta === 'no_tomada') {
    if (decisiones.length) return noDicha('dijo «no tomada» pero dejó una decisión sobre la fila: respuesta contradictoria')
    return cerrar('aplicada', null, leida)
  }
  // tomada / en parte: tiene que traer UNA decisión sobre la fila, y cumplir lo que el código verifica
  if (!fila || !ESTADOS_CORREGIBLES.includes(fila.estado)) return cerrar('obsoleta', 'la fila ya no se puede corregir', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la fila cambió mientras la mesa decidía' })
  if (decisiones.length !== 1) return noDicha(decisiones.length ? 'dejó más de una decisión sobre la fila' : `dijo «${leida.respuesta.replace(/_/g, ' ')}» pero no dejó la decisión sobre la fila`)
  const x = { hoy: hoyEnZona(ahora, campana.zona_horaria), campana: { fecha_inicio: campana.fecha_inicio, fecha_fin: campana.fecha_fin }, filas, formatos: await al.formatos(), sedes: ((await al.cargarContexto(campana.client_id, campana.plan_id))?.sedes ?? []).filter((s) => !campana.sedes.length || campana.sedes.includes(s.clave)) }
  const { cambios } = verificarDecisiones([fila], decisiones, x)
  const k = cambios[0]
  if (!k) return noDicha('la decisión no se pudo verificar')
  if (k.tipo === 'descartar' && k.rechazo) return noDicha(`la propuesta no cumple: ${k.rechazo}`)
  const ok = await aplicar(al, campana.id, d.calendario_version, k)
  if (!ok) return cerrar('obsoleta', 'la fila cambió mientras se aplicaba', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la fila cambió mientras se aplicaba' })
  return cerrar('aplicada', null, leida, versionNuevaDe(k))
}

async function aplicar(al: Almacen, campanaId: string, version: number, k: Cambio): Promise<boolean> {
  if (k.tipo === 'reubicar') return al.reubicarFila(campanaId, version, k.fila_id, { fecha: k.fecha, hora: k.hora, semana: k.semana, dia_semana: k.dia_semana, estado: 'validada' }, k.aviso, ESTADOS_CORREGIBLES)
  if (k.tipo === 'descartar') return al.reubicarFila(campanaId, version, k.fila_id, { estado: 'perdio_su_fecha' }, k.aviso, ESTADOS_CORREGIBLES)
  const ok = await al.reubicarFila(campanaId, version, k.fila_id, { estado: 'cancelada' }, k.aviso, ESTADOS_CORREGIBLES)
  if (ok) await al.reubicarFila(campanaId, version, k.destino, {}, k.aviso_destino)
  return ok
}
const versionNuevaDe = (k: Cambio): Record<string, unknown> =>
  k.tipo === 'reubicar' ? { accion: 'reubicar', fecha: k.fecha, hora: k.hora } : k.tipo === 'fusionar' ? { accion: 'fusionar', destino: k.destino } : { accion: 'descartar' }

