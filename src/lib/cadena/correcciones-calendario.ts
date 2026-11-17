/**
 * CAMBIO 4 · ENTREGA 2 · el CREADOR «calendario» de una corrección de la jefatura: la mesa de reubicación, por ENTRADA PROPIA (RESPUESTA-LENOVO-a-CC3-CC1:
 * sin el interruptor `reubicar_filas_pasadas`, que sigue gobernando solo lo de hoy).
 *   · Abre la MISMA mesa de la oficina (`abrirMesaDeReubicacion`), con la fila corregida y la corrección en el marco. La decisión va en una libreta PROPIA por campaña
 *     (`correcciones_calendario:<campaña>`), escrita SOLO con escritura condicional (sello): dos vigías o una vigía y una entrega a la vez no se borran (🟡 CC6 #1150).
 *     Sus versiones empiezan en VERSION_BASE_DE_CORRECCION: nunca chocan con una reubicación normal, y la entrega vuelve por el puerto de siempre (que la desvía aquí).
 *   · La vuelta: el creador decide la fila (reubicar · fusionar · descartar) Y deja su línea fija de respuesta. El código lo verifica igual que una reubicación;
 *     una propuesta que no cumple NUNCA descarta la fila: cuenta como no dicha y se reintenta (la fila no se pierde por un error de la mesa).
 *   · RESPUESTA-LENOVO-a-CC3 (vuelta de la fila · SÍ): reubicada vuelve a `validada` con su fecha nueva (entra al próximo lote: la pieza vieja queda reemplazada) desde
 *     `briefeada` / `en_oficina` siempre, y desde `aprobada` SOLO con regla dura y nunca si la pieza ya se publicó · fusionada → `cancelada` · descartada → `perdio_su_fecha`.
 */
import type { Almacen } from './almacen'
import { hoyEnZona } from './campanas'
import { guardarRespuesta, leerRespuestaDelCreador, marcoDeLaCorreccion, type CreadorDeCorreccion, type RespuestaLeida } from './correcciones'
import { leerDecisiones, marcoDeReubicacion, verificarDecisiones, type Cambio } from './reubicacion'
import type { Decision, EntregaDeReubicacion, SobreDeReubicacion } from './reubicar'
import type { Correccion } from './correcciones'
import type { Fila } from './tipos'

export const PREFIJO_HUELLA_DE_CORRECCION = 'correccion:'
/** de dónde puede salir la fila corregida: sin producir, o con su pieza ya en camino (la jefatura de piezas la frenó) */
export const ESTADOS_CORREGIBLES: readonly Fila['estado'][] = ['validada', 'lista_para_brief', 'briefeada', 'en_oficina']

/** Lenovo: desde `aprobada` solo con regla dura, y nunca si la pieza ya se publicó */
export async function filaCorregible(al: Almacen, campanaId: string, fila: Pick<Fila, 'id' | 'estado'>, c: Pick<Correccion, 'dura'>): Promise<boolean> {
  if (ESTADOS_CORREGIBLES.includes(fila.estado)) return true
  if (fila.estado !== 'aprobada' || !c.dura) return false
  // sin la consulta de publicación, se da por publicada: la fila no vuelve (lado seguro)
  return al.piezaPublicada ? !(await al.piezaPublicada(campanaId, fila.id)) : false
}
const desdeDe = (c: Pick<Correccion, 'dura'>): readonly Fila['estado'][] => (c.dura ? [...ESTADOS_CORREGIBLES, 'aprobada'] : ESTADOS_CORREGIBLES)

/** las versiones de los sobres de corrección: lejos de las de reubicación (que cuentan desde 1) */
export const VERSION_BASE_DE_CORRECCION = 1_000_000
export const claveDeLaLibretaDeCorrecciones = (campanaId: string) => `correcciones_calendario:${campanaId}`
export interface LibretaDeCorrecciones { ultima: number; decisiones: Record<string, Decision> }
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const libretaDe = (v: unknown): LibretaDeCorrecciones => (esObjeto(v) && typeof v.ultima === 'number' && esObjeto(v.decisiones) ? (v as unknown as LibretaDeCorrecciones) : { ultima: 0, decisiones: {} })
export async function leerLibretaDeCorrecciones(al: Almacen, campanaId: string): Promise<LibretaDeCorrecciones> {
  return libretaDe(structuredClone((await al.leerConfigConSello?.(claveDeLaLibretaDeCorrecciones(campanaId)))?.valor ?? null))
}
/**
 * Lee con su sello, cambia y escribe SOLO si nadie la tocó; si otro escribió en el medio, relee y vuelve a cambiar (hasta 5 veces).
 * `cambiar` devuelve `undefined` para no escribir nada. Nunca pisa lo que escribió otro.
 */
async function conLaLibreta<T>(al: Almacen, campanaId: string, cambiar: (l: LibretaDeCorrecciones) => T | undefined): Promise<{ hecho: true; valor: T } | { hecho: false }> {
  if (!al.leerConfigConSello || !al.escribirConfigSiSello) return { hecho: false }
  const clave = claveDeLaLibretaDeCorrecciones(campanaId)
  for (let i = 0; i < 5; i++) {
    const leida = await al.leerConfigConSello(clave)
    const l = libretaDe(structuredClone(leida?.valor ?? null))
    const valor = cambiar(l)
    if (valor === undefined) return { hecho: false }
    if (await al.escribirConfigSiSello(clave, l, leida?.sello ?? null)) return { hecho: true, valor }
  }
  return { hecho: false }
}

/** el creador que la vigía llama: abre la mesa de reubicación para ESA fila */
export const creadorDelCalendario: CreadorDeCorreccion = async (al, c, ahora) => {
  if (!al.abrirMesaDeReubicacion || !al.leerConfigConSello || !al.escribirConfigSiSello) return { estado: 'sin_creador', motivo: 'la cadena no puede abrir la mesa de reubicación en este entorno' }
  const campana = await al.campana(c.campana_id)
  if (!campana) return { estado: 'no_abre', motivo: 'la campaña ya no existe' }
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const filas = await al.filas(campana.id, version)
  const fila = filas.find((f) => f.id === c.fila_id)
  if (!fila) return { estado: 'no_abre', motivo: `la fila ${c.fila_id} no está en el calendario vigente (v${version})` }
  if (!(await filaCorregible(al, campana.id, fila, c))) return { estado: 'no_abre', motivo: `la fila ${c.fila_id} está «${fila.estado}»: ya no se corrige desde el calendario` }
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const sedes = (ctx?.sedes ?? []).filter((s) => !campana.sedes.length || campana.sedes.includes(s.clave))
  const x = { hoy: hoyEnZona(ahora, campana.zona_horaria), campana: { fecha_inicio: campana.fecha_inicio, fecha_fin: campana.fecha_fin }, filas, formatos: await al.formatos(), sedes }
  const marco = [marcoDeLaCorreccion(c), '', marcoDeReubicacion([fila], x, ctx?.nombreDelNegocio || 'el cliente').replace(/^# Filas del calendario de (.*) que quedaron atrás sin producir$/m, '# La fila corregida del calendario de $1'), '', `Si NO tomas la corrección, no escribas ninguna línea de decisión para ${fila.id}: la fila queda como está.`].join('\n')
  const huella = `${PREFIJO_HUELLA_DE_CORRECCION}${c.llave}`
  // la versión se reserva y la decisión se anota ANTES de abrir (la entrega puede volver antes de que esta función termine), en una sola escritura condicional
  const reservada = await conLaLibreta(al, campana.id, (l) => {
    const v = VERSION_BASE_DE_CORRECCION + l.ultima + 1
    l.ultima += 1
    l.decisiones[String(v)] = { huella, calendario_version: version, fila_ids: [fila.id], version: v, intentos: c.intentos, estado: 'abierta', abierta_en: ahora, encargo_id: null, motivo: null, resumen: null, avisado: true, releida: true }
    return v
  })
  if (!reservada.hecho) return { estado: 'no_abre', motivo: 'la libreta de correcciones está ocupada: se reintenta en la próxima vuelta' }
  const v = reservada.valor
  const sobre: SobreDeReubicacion = { tipo_de_mesa: 'reubicacion', client_id: campana.client_id, campana_id: campana.id, version: v, dry_run: campana.seco, marco_texto: marco, condiciones: [] }
  const r = await al.abrirMesaDeReubicacion(sobre)
  await conLaLibreta(al, campana.id, (l) => {
    const d2 = l.decisiones[String(v)]
    if (!d2 || d2.estado !== 'abierta') return undefined
    l.decisiones[String(v)] = r.estado === 'abierta' ? { ...d2, encargo_id: r.encargo_id } : { ...d2, estado: 'fallida', motivo: `la mesa no abrió: ${r.motivo}` }
    return true
  })
  return r.estado === 'abierta' ? { estado: 'entregada' } : { estado: 'no_abre', motivo: `la mesa no abrió: ${r.motivo}` }
}

/** ¿esta entrega de la mesa de reubicación es de una corrección? Por la versión: las de corrección viven lejos de las de reubicación */
export const esEntregaDeCorreccion = (version: number): boolean => Number.isInteger(version) && version > VERSION_BASE_DE_CORRECCION

/**
 * La vuelta de la mesa para una corrección. Idempotente: solo la entrega del intento vigente aplica. Nunca descarta una fila por una propuesta que no cumple.
 * Devuelve el estado de la decisión (aplicada · fallida · obsoleta) para la oficina.
 */
export async function recibirCorreccionDelCalendario(al: Almacen, p: EntregaDeReubicacion, ahora: string): Promise<{ ok: true; estado?: string; ya_cerrada?: boolean } | { ok: false; error: string }> {
  const d = (await leerLibretaDeCorrecciones(al, p.campana_id)).decisiones[String(p.version)]
  if (!d) return { ok: false, error: `la cadena no tiene una corrección del calendario con la versión ${p.version} en esa campaña` }
  if (d.estado !== 'abierta') return { ok: true, ya_cerrada: true, estado: d.estado }
  const llave = d.huella.slice(PREFIJO_HUELLA_DE_CORRECCION.length)
  // cierra la decisión de ESTA versión solo si sigue abierta (escritura condicional): una entrega repetida o a la vez no cierra dos veces
  const cerrarLaDecision = (estado: Decision['estado'], motivo: string | null) => conLaLibreta(al, p.campana_id, (l) => {
    const x = l.decisiones[String(p.version)]
    if (!x || x.estado !== 'abierta') return undefined
    l.decisiones[String(p.version)] = { ...x, estado, motivo, encargo_id: x.encargo_id ?? p.encargo_id }
    return true
  })
  // después de RECLAMAR la decisión (abajo), cerrar solo deja su estado final y guarda la respuesta
  const cerrar = async (estado: Decision['estado'], motivo: string | null, leida: RespuestaLeida, version_nueva: Record<string, unknown> | null = null) => {
    await conLaLibreta(al, p.campana_id, (l) => { const x = l.decisiones[String(p.version)]; if (!x) return undefined; l.decisiones[String(p.version)] = { ...x, estado, motivo }; return true })
    await guardarRespuesta(al, llave, leida, ahora, version_nueva)
    return { ok: true as const, estado }
  }
  const c = al.correccion ? await al.correccion(llave) : null
  // 🟡 CC6 k4: una mesa vieja (la corrección venció, se reintentó o ya se cerró) NO toca la fila ni escribe respuesta: solo se cierra su decisión
  if (!c || c.estado !== 'en_manos_del_creador' || c.intentos !== d.intentos) {
    await cerrarLaDecision('obsoleta', 'la corrección ya no está en manos de este intento del creador')
    return { ok: true, estado: 'obsoleta' }
  }
  // se RECLAMA antes de tocar la fila (escritura condicional): de dos entregas a la vez de la misma mesa, solo una sigue; la otra contesta «ya cerrada»
  if (!(await cerrarLaDecision('aplicada', null)).hecho) return { ok: true, ya_cerrada: true }
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
  if (!fila || !(await filaCorregible(al, campana.id, fila, c))) return cerrar('obsoleta', 'la fila ya no se puede corregir', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la fila cambió mientras la mesa decidía' })
  if (decisiones.length !== 1) return noDicha(decisiones.length ? 'dejó más de una decisión sobre la fila' : `dijo «${leida.respuesta.replace(/_/g, ' ')}» pero no dejó la decisión sobre la fila`)
  const x = { hoy: hoyEnZona(ahora, campana.zona_horaria), campana: { fecha_inicio: campana.fecha_inicio, fecha_fin: campana.fecha_fin }, filas, formatos: await al.formatos(), sedes: ((await al.cargarContexto(campana.client_id, campana.plan_id))?.sedes ?? []).filter((s) => !campana.sedes.length || campana.sedes.includes(s.clave)) }
  const { cambios } = verificarDecisiones([fila], decisiones, x)
  const k = cambios[0]
  if (!k) return noDicha('la decisión no se pudo verificar')
  if (k.tipo === 'descartar' && k.rechazo) return noDicha(`la propuesta no cumple: ${k.rechazo}`)
  const ok = await aplicar(al, campana.id, d.calendario_version, k, desdeDe(c))
  if (!ok) return cerrar('obsoleta', 'la fila cambió mientras se aplicaba', { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la fila cambió mientras se aplicaba' })
  return cerrar('aplicada', null, leida, versionNuevaDe(k))
}

async function aplicar(al: Almacen, campanaId: string, version: number, k: Cambio, desde: readonly Fila['estado'][]): Promise<boolean> {
  if (k.tipo === 'reubicar') return al.reubicarFila(campanaId, version, k.fila_id, { fecha: k.fecha, hora: k.hora, semana: k.semana, dia_semana: k.dia_semana, estado: 'validada' }, k.aviso, desde)
  if (k.tipo === 'descartar') return al.reubicarFila(campanaId, version, k.fila_id, { estado: 'perdio_su_fecha' }, k.aviso, desde)
  const ok = await al.reubicarFila(campanaId, version, k.fila_id, { estado: 'cancelada' }, k.aviso, desde)
  if (ok) await al.reubicarFila(campanaId, version, k.destino, {}, k.aviso_destino)
  return ok
}
const versionNuevaDe = (k: Cambio): Record<string, unknown> =>
  k.tipo === 'reubicar' ? { accion: 'reubicar', fecha: k.fecha, hora: k.hora } : k.tipo === 'fusionar' ? { accion: 'fusionar', destino: k.destino } : { accion: 'descartar' }

