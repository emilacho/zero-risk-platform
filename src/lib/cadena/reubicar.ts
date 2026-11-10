/**
 * LAS FILAS QUE QUEDARON ATRÁS · el lado de la CADENA (GO de Lenovo 10-nov 18:14Z · camino A 18:24Z · NACE APAGADO).
 *   · `abrirReubicaciones` (lo llama el reloj): con el interruptor `reubicar_filas_pasadas === true`, por cada campaña activa con filas pasadas sin producir abre UNA decisión
 *     (la mesa de reubicación de la oficina). Idempotente por la huella de las filas; tope de MAX_INTENTOS_DE_REUBICACION intentos por huella; después, UN aviso y nada más.
 *   · `recibirReubicacion` (el puerto de la cadena, en proceso): lee la propuesta del agente, la VERIFICA por código (`verificarDecisiones`) y la aplica fila por fila con una escritura
 *     condicional (solo si la fila sigue sin producir). Lo que no cumple se descarta con la razón del código. Todo queda en los avisos de cada fila.
 *   · `avisosDeReubicacion` (lo llama el reloj): el resumen UNA vez por decisión, por la línea de la campaña.
 * Apagado (interruptor ausente o distinto de `true`): no se lee nada más ni se escribe nada; el reloj queda byte a byte como hoy.
 * La libreta vive en `cadena_config.reubicacion_libreta` (por campaña: la última versión usada y una entrada por huella).
 */
import type { Almacen, Campana } from './almacen'
import { hoyEnZona } from './campanas'
import { filasPasadas, huellaDeReubicacion, leerDecisiones, marcoDeReubicacion, MAX_INTENTOS_DE_REUBICACION, verificarDecisiones, type Cambio, type ContextoDeReubicacion } from './reubicacion'

export const INTERRUPTOR_DE_REUBICACION = 'reubicar_filas_pasadas'
export const CLAVE_DE_LA_LIBRETA = 'reubicacion_libreta'
/** cuánto espera la cadena a la mesa antes de dar el intento por perdido: el plazo de la mesa (30 min) más la holgura */
export const PLAZO_DE_LA_DECISION_MIN = 60

export type EstadoDeDecision = 'abierta' | 'fallida' | 'aplicada' | 'agotada' | 'obsoleta'
export interface Decision {
  huella: string
  calendario_version: number
  fila_ids: string[]
  /** la versión que lleva el sobre del intento vigente (la oficina la usa en el nombre del encargo) */
  version: number
  intentos: number
  estado: EstadoDeDecision
  abierta_en: string
  encargo_id: string | null
  motivo: string | null
  /** el resumen que el reloj avisa UNA vez */
  resumen: string | null
  avisado: boolean
}
export interface LibretaDeCampana { ultima_version: number; decisiones: Record<string, Decision> }
export type Libreta = Record<string, LibretaDeCampana>

/** lo que la cadena le pide al almacén para abrir la mesa de la oficina (adaptador real en `almacen-supabase.ts`) */
export interface SobreDeReubicacion { tipo_de_mesa: 'reubicacion'; client_id: string; campana_id: string; version: number; dry_run: boolean; marco_texto: string; condiciones: string[] }
export type ResultadoDeAbrirMesa = { estado: 'abierta'; encargo_id: string } | { estado: 'no_abre' | 'error'; motivo: string }

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
async function leerLibreta(al: Almacen): Promise<Libreta> {
  const x = await al.leerConfig(CLAVE_DE_LA_LIBRETA)
  return esObjeto(x) ? (structuredClone(x) as Libreta) : {}
}
export const encendida = async (al: Almacen): Promise<boolean> => (await al.leerConfig(INTERRUPTOR_DE_REUBICACION)) === true
const masMin = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString()

async function contextoDe(al: Almacen, c: Campana, ahora: string): Promise<{ x: ContextoDeReubicacion; version: number; cliente: string }> {
  const version = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
  const ctx = await al.cargarContexto(c.client_id, c.plan_id)
  const sedes = (ctx?.sedes ?? []).filter((s) => !c.sedes.length || c.sedes.includes(s.clave))
  return {
    version,
    cliente: ctx?.nombreDelNegocio || 'el cliente',
    x: { hoy: hoyEnZona(ahora, c.zona_horaria), campana: { fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin }, filas: await al.filas(c.id, version), formatos: await al.formatos(), sedes },
  }
}

/** el reloj: abre (o reintenta) las decisiones que tocan. Devuelve lo hecho y las líneas de aviso. Nunca lanza hacia el reloj por una campaña. */
export async function abrirReubicaciones(al: Almacen, ahora: string): Promise<{ aplicado: string[]; lineas: Array<{ campana_id: string; texto: string }> }> {
  const aplicado: string[] = []
  const lineas: Array<{ campana_id: string; texto: string }> = []
  if (!(await encendida(al))) return { aplicado, lineas }
  const libreta = await leerLibreta(al)
  let cambio = false
  for (const c of await al.campanasActivas()) {
    try {
      const { x, version, cliente } = await contextoDe(al, c, ahora)
      const pasadas = filasPasadas(x.filas, x.hoy)
      if (!pasadas.length) continue
      const huella = huellaDeReubicacion(c.id, version, pasadas.map((f) => f.id))
      const lc: LibretaDeCampana = libreta[c.id] ?? { ultima_version: 0, decisiones: {} }
      const d = lc.decisiones[huella]
      const venceYa = (o: Decision) => Date.parse(ahora) > Date.parse(masMin(o.abierta_en, PLAZO_DE_LA_DECISION_MIN))
      const vencida = d?.estado === 'abierta' && venceYa(d)
      // una sola decisión viva por campaña: si otra (otra huella) sigue abierta y en plazo, se espera a que cierre
      if (Object.values(lc.decisiones).some((o) => o.huella !== huella && o.estado === 'abierta' && !venceYa(o))) continue
      if (d && d.estado !== 'fallida' && !vencida) continue
      if (d && d.intentos >= MAX_INTENTOS_DE_REUBICACION) {
        lc.decisiones[huella] = { ...d, estado: 'agotada', motivo: d.motivo ?? 'la mesa no devolvió una decisión a tiempo' }
        libreta[c.id] = lc
        cambio = true
        lineas.push({ campana_id: c.id, texto: `reubicación: ${pasadas.length} fila(s) que quedaron atrás sin producir siguen sin decisión tras ${d.intentos} intentos de la mesa (${d.motivo ?? 'sin respuesta a tiempo'}). No se reintenta sola: revisar.` })
        aplicado.push(`reubicación agotada en ${c.id}`)
        continue
      }
      if (!al.abrirMesaDeReubicacion) {
        if (!d) { lc.decisiones[huella] = nueva(huella, version, pasadas.map((f) => f.id), lc.ultima_version + 1, ahora, null, 'agotada', 'la cadena no puede abrir la mesa de reubicación en este entorno'); libreta[c.id] = lc; cambio = true; lineas.push({ campana_id: c.id, texto: `reubicación: hay ${pasadas.length} fila(s) que quedaron atrás sin producir y la cadena no puede abrir la mesa de reubicación en este entorno.` }) }
        continue
      }
      const v = lc.ultima_version + 1
      lc.ultima_version = v
      const sobre: SobreDeReubicacion = { tipo_de_mesa: 'reubicacion', client_id: c.client_id, campana_id: c.id, version: v, dry_run: c.seco, marco_texto: marcoDeReubicacion(pasadas, x, cliente), condiciones: [] }
      const r = await al.abrirMesaDeReubicacion(sobre)
      const intentos = (d?.intentos ?? 0) + 1
      if (r.estado === 'abierta') {
        lc.decisiones[huella] = nueva(huella, version, pasadas.map((f) => f.id), v, ahora, r.encargo_id, 'abierta', null, intentos)
        aplicado.push(`reubicación abierta en ${c.id} (${pasadas.length} fila(s), intento ${intentos})`)
      } else {
        lc.decisiones[huella] = nueva(huella, version, pasadas.map((f) => f.id), v, ahora, null, 'fallida', `la mesa no abrió: ${r.motivo}`, intentos)
        aplicado.push(`reubicación sin abrir en ${c.id}: ${r.motivo}`)
      }
      libreta[c.id] = lc
      cambio = true
    } catch (e) {
      lineas.push({ campana_id: c.id, texto: `reubicación: no se pudo revisar la campaña (${String((e as Error)?.message ?? e).slice(0, 160)})` })
    }
  }
  if (cambio) await al.escribirConfig(CLAVE_DE_LA_LIBRETA, libreta)
  return { aplicado, lineas }
}

function nueva(huella: string, calendario_version: number, fila_ids: string[], version: number, ahora: string, encargo_id: string | null, estado: EstadoDeDecision, motivo: string | null, intentos = 1): Decision {
  return { huella, calendario_version, fila_ids, version, intentos, estado, abierta_en: ahora, encargo_id, motivo, resumen: null, avisado: false }
}

export interface EntregaDeReubicacion { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }

/**
 * La vuelta de la mesa (puerto de la cadena, en proceso). Idempotente: solo la entrega del intento VIGENTE de una decisión abierta aplica; cualquier otra contesta `ya_cerrada`.
 * Una entrega sin texto deja la decisión `fallida` (el reloj la reintenta hasta el tope).
 */
export async function recibirReubicacion(al: Almacen, p: EntregaDeReubicacion, ahora: string): Promise<{ ok: true; estado?: string; ya_cerrada?: boolean } | { ok: false; error: string }> {
  const libreta = await leerLibreta(al)
  const lc = libreta[p.campana_id]
  const d = lc ? Object.values(lc.decisiones).find((x) => x.version === p.version) : undefined
  if (!lc || !d) return { ok: false, error: `la cadena no tiene una reubicación con la versión ${p.version} en esa campaña` }
  if (d.estado !== 'abierta') return { ok: true, ya_cerrada: true, estado: d.estado }
  const guardar = async (cambios: Partial<Decision>) => { lc.decisiones[d.huella] = { ...d, ...cambios }; await al.escribirConfig(CLAVE_DE_LA_LIBRETA, libreta) }
  if (!p.texto || !p.texto.trim()) { await guardar({ estado: 'fallida', motivo: p.motivo ?? 'la mesa no produjo una decisión' }); return { ok: true, estado: 'fallida' } }
  const c = await al.campana(p.campana_id)
  if (!c) { await guardar({ estado: 'obsoleta', motivo: 'la campaña ya no existe' }); return { ok: true, estado: 'obsoleta' } }
  const { x, version } = await contextoDe(al, c, ahora)
  if (version !== d.calendario_version) { await guardar({ estado: 'obsoleta', motivo: `el calendario cambió de versión (${d.calendario_version} → ${version}) mientras la mesa decidía` }); return { ok: true, estado: 'obsoleta' } }
  // solo las filas de ESTA decisión que siguen pasadas y sin producir
  const pasadas = filasPasadas(x.filas, x.hoy).filter((f) => d.fila_ids.includes(f.id))
  const { cambios, ignoradas } = verificarDecisiones(pasadas, leerDecisiones(p.texto), x)
  const hechos = await aplicarCambios(al, c.id, version, cambios)
  const n = (t: Cambio['tipo']) => hechos.filter((h) => h.tipo === t).length
  const rechazadas = hechos.filter((h) => h.tipo === 'descartar' && h.rechazo).length
  const resumen = `reubicación de ${hechos.length} fila(s) que quedaron atrás: ${n('reubicar')} reubicada(s), ${n('fusionar')} fusionada(s), ${n('descartar')} descartada(s)${rechazadas ? ` (${rechazadas} porque la propuesta no cumplía)` : ''}${ignoradas.length ? ` · ${ignoradas.length} decisión(es) sobre filas que no eran pasadas, ignorada(s)` : ''}${hechos.length < cambios.length ? ` · ${cambios.length - hechos.length} fila(s) ya habían cambiado y no se tocaron` : ''}`
  await guardar({ estado: 'aplicada', resumen, motivo: null })
  return { ok: true, estado: 'aplicada' }
}

/** aplica cada cambio con una escritura condicional (la fila tiene que seguir sin producir); devuelve los que se aplicaron */
async function aplicarCambios(al: Almacen, campanaId: string, version: number, cambios: Cambio[]): Promise<Cambio[]> {
  const hechos: Cambio[] = []
  for (const k of cambios) {
    let ok = false
    if (k.tipo === 'reubicar') ok = await al.reubicarFila(campanaId, version, k.fila_id, { fecha: k.fecha, semana: k.semana, dia_semana: k.dia_semana }, k.aviso)
    else if (k.tipo === 'descartar') ok = await al.reubicarFila(campanaId, version, k.fila_id, { estado: 'perdio_su_fecha' }, k.aviso)
    else {
      ok = await al.reubicarFila(campanaId, version, k.fila_id, { estado: 'cancelada' }, k.aviso)
      if (ok) await al.reubicarFila(campanaId, version, k.destino, {}, k.aviso_destino)
    }
    if (ok) hechos.push(k)
  }
  return hechos
}

/** el resumen de cada decisión aplicada, UNA vez (el reloj lo manda por la línea de la campaña). `marcar` = el reloj de verdad envía */
export async function avisosDeReubicacion(al: Almacen, marcar: boolean): Promise<Array<{ campana_id: string; texto: string }>> {
  if (!(await encendida(al))) return []
  const libreta = await leerLibreta(al)
  const out: Array<{ campana_id: string; texto: string }> = []
  for (const [campana_id, lc] of Object.entries(libreta)) {
    for (const d of Object.values(lc.decisiones)) {
      if (d.avisado || !d.resumen) continue
      out.push({ campana_id, texto: d.resumen })
      d.avisado = true
    }
  }
  // como los avisos del vigía: solo lo que de verdad se manda queda como avisado (en ensayo se registra y se vuelve a mostrar)
  if (out.length && marcar) await al.escribirConfig(CLAVE_DE_LA_LIBRETA, libreta)
  return out
}
