/**
 * CAMBIO 4 · ENTREGA 2 · EL RECEPTOR DE LAS CORRECCIONES DE LA JEFATURA EN LA CADENA (firma de Emilio 17-nov · RESPUESTA-LENOVO-a-CC3-CC1-receptor-de-correcciones).
 * La jefatura de piezas (oficina · #1148) deja una DEVOLUCIÓN por fila y destino (`llave` = «fila_id:destino»). Aquí:
 *   1. se RECIBE (idempotente por llave: repetirla devuelve la que ya está);
 *   2. la vigía la REPARTE a su creador, una vez por vuelta y con tope de intentos:
 *        calendario → la mesa de reubicación por entrada PROPIA (sin el interruptor `reubicar_filas_pasadas`: Lenovo) · banco → el puerto de CC1 · hoja → espera la decisión de Lenovo (queda visible);
 *   3. el creador RESPONDE en una línea fija («RESPUESTA A LA JEFATURA C1: tomada | tomada en parte: … | no tomada: …», el mismo formato que la oficina);
 *      lo que no se lee es `no_dicha` (nunca se inventa) · una corrección DURA no se cierra con «no tomada» (se toma sí o sí): cuenta como no dicha y se reintenta.
 * La corrección es INSUMO, nunca orden: el marco le dice al creador que decide él. Sin persona en el medio. Agnóstico: ninguna rama por cliente ni rubro.
 */
import type { Almacen } from './almacen'
import { autorizarLlamada, cadena, err, type Respuesta } from './autorizar'

export const DESTINOS_DE_CORRECCION = ['hoja', 'calendario', 'banco'] as const
export type DestinoDeCorreccion = (typeof DESTINOS_DE_CORRECCION)[number]
export type EstadoDeCorreccion = 'recibida' | 'en_manos_del_creador' | 'respondida'
export type RespuestaDeCorreccion = 'tomada' | 'tomada_en_parte' | 'no_tomada' | 'no_dicha'
/** intentos del creador por corrección (el primero + un reintento); agotados, queda respondida «no_dicha» y visible: no bloquea más */
export const INTENTOS_POR_CORRECCION = 2
/** minutos que se espera la respuesta de un creador antes de reintentar */
export const PLAZO_DEL_CREADOR_MIN = 60
export const LARGO_MAXIMO_DE_TEXTO = 2000

export interface Correccion {
  llave: string
  campana_id: string
  fila_id: string
  destino: DestinoDeCorreccion
  motivo: string
  linea_de_la_ficha: string | null
  dura: boolean
  origen: string | null
  encargo_id: string
  estado: EstadoDeCorreccion
  respuesta: RespuestaDeCorreccion | null
  explicacion: string | null
  version_nueva: Record<string, unknown> | null
  intentos: number
  recibida_en: string
  entregada_en: string | null
  respondida_en: string | null
}

export const llaveDeCorreccion = (filaId: string, destino: DestinoDeCorreccion): string => `${filaId}:${destino}`
const esDestino = (x: unknown): x is DestinoDeCorreccion => typeof x === 'string' && (DESTINOS_DE_CORRECCION as readonly string[]).includes(x)
const recortar = (x: string | null): string | null => (x === null ? null : x.slice(0, LARGO_MAXIMO_DE_TEXTO))

// ───────────────────────────────────────────── 1 · recibir (POST /api/cadena/correcciones · accion recibir)
export async function correccionRecibir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  if (!al.correccionInsertar) return err(503, 'E-SIN-CORRECCIONES', 'este almacén no guarda correcciones todavía')
  const campanaId = cadena(cuerpo.campana_id)
  if (!campanaId) return err(400, 'E-CAMPANA', 'falta campana_id')
  const campana = await al.campana(campanaId)
  if (!campana) return err(404, 'E-CAMPANA-NO-EXISTE', 'esa campaña no existe')
  const auth = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (auth) return auth
  const filaId = cadena(cuerpo.fila_id), destino = cuerpo.destino, motivo = cadena(cuerpo.motivo), encargoId = cadena(cuerpo.encargo_id)
  if (!filaId) return err(400, 'E-FILA', 'falta fila_id')
  if (!esDestino(destino)) return err(400, 'E-DESTINO', `destino debe ser uno de: ${DESTINOS_DE_CORRECCION.join(', ')} (la pieza vuelve a su mesa en la oficina, no aquí)`)
  if (!motivo) return err(400, 'E-MOTIVO', 'falta el motivo: qué vio la jefatura')
  if (!encargoId) return err(400, 'E-ENCARGO', 'falta encargo_id: el encargo de la pieza donde quedó la devolución')
  if (cuerpo.dura !== undefined && typeof cuerpo.dura !== 'boolean') return err(400, 'E-DURA', 'dura debe ser true o false')
  const llave = llaveDeCorreccion(filaId, destino)
  if (cuerpo.llave !== undefined && cadena(cuerpo.llave) !== llave) return err(400, 'E-LLAVE', `la llave no corresponde a la fila y el destino (se esperaba «${llave}»)`)
  const nueva: Correccion = {
    llave, campana_id: campana.id, fila_id: filaId, destino, motivo: recortar(motivo)!, linea_de_la_ficha: recortar(cadena(cuerpo.linea_de_la_ficha)), dura: cuerpo.dura === true,
    origen: cadena(cuerpo.origen), encargo_id: encargoId, estado: 'recibida', respuesta: null, explicacion: null, version_nueva: null, intentos: 0, recibida_en: ahora, entregada_en: null, respondida_en: null,
  }
  const { correccion, nueva: esNueva } = await al.correccionInsertar(nueva)
  return { status: esNueva ? 201 : 200, cuerpo: { ok: true, ya_estaba: !esNueva, correccion: vista(correccion) } }
}

/** GET por encargo (la bandeja de la oficina lee el estado y la respuesta del creador) */
export async function correccionesDelEncargo(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const encargoId = cadena(cuerpo.encargo_id)
  if (!encargoId) return err(400, 'E-ENCARGO', 'falta encargo_id')
  const lista = al.correccionesDeEncargo ? await al.correccionesDeEncargo(encargoId) : []
  return { status: 200, cuerpo: { ok: true, correcciones: lista.map(vista) } }
}

const vista = (c: Correccion) => ({ llave: c.llave, fila_id: c.fila_id, destino: c.destino, estado: c.estado, respuesta: c.respuesta, explicacion: c.explicacion, dura: c.dura, intentos: c.intentos, respondida_en: c.respondida_en })

// ───────────────────────────────────────────── 3 · la respuesta del creador (una línea fija · el mismo formato de la oficina)
export const ROTULO_DE_RESPUESTA = 'RESPUESTA A LA JEFATURA'
export const ID_EN_EL_MARCO = 'C1'
const RE_RESPUESTA = /^[\s>*•\-–—]*\*{0,2}RESPUESTA A LA JEFATURA\s*\[?\s*(C\d{1,2})\s*\]?\s*\*{0,2}\s*[:·–—-]\s*(.*)$/iu
const RE_VALOR = /^\s*(tomada\s+en\s+parte|no\s+tomada|tomada)\s*(?:[:·–—-]\s*(.*))?$/iu

export interface RespuestaLeida { respuesta: RespuestaDeCorreccion; explicacion: string | null; motivo_no_dicha?: string }

/** lee la línea fija del creador. Ninguna línea, dos distintas o un valor ilegible ⇒ `no_dicha` (se registra; nunca se inventa) */
export function leerRespuestaDelCreador(texto: string | null | undefined, dura: boolean): RespuestaLeida {
  const lineas = (texto ?? '').split(/\r?\n/).map((l) => RE_RESPUESTA.exec(l)).filter((m): m is RegExpExecArray => !!m && m[1].toUpperCase() === ID_EN_EL_MARCO)
  if (!lineas.length) return { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'el creador no dejó la línea fija de respuesta' }
  const leidas = lineas.map((m) => RE_VALOR.exec(m[2]))
  if (leidas.some((v) => !v)) return { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la línea de respuesta no dice tomada, tomada en parte ni no tomada' }
  const valores = leidas.map((v) => normalizarValor(v![1]))
  if (new Set(valores).size > 1) return { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'el creador dejó respuestas distintas a la misma corrección' }
  const respuesta = valores[0]
  const explicacion = recortar(cadena(leidas[0]![2] ?? null))
  if (respuesta !== 'tomada' && !explicacion) return { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: `«${respuesta.replace(/_/g, ' ')}» sin su porqué (es obligatorio)` }
  if (dura && respuesta === 'no_tomada') return { respuesta: 'no_dicha', explicacion, motivo_no_dicha: 'es una regla dura (se toma sí o sí) y el creador dijo «no tomada»' }
  return { respuesta, explicacion }
}
const normalizarValor = (v: string): Exclude<RespuestaDeCorreccion, 'no_dicha'> => {
  const t = v.toLowerCase().replace(/\s+/g, ' ')
  return t === 'tomada en parte' ? 'tomada_en_parte' : t === 'no tomada' ? 'no_tomada' : 'tomada'
}

/** lo que va al marco del creador: INSUMO, no orden; él decide y lo deja escrito */
export function marcoDeLaCorreccion(c: Pick<Correccion, 'motivo' | 'linea_de_la_ficha' | 'dura' | 'fila_id'>): string {
  return [
    `# CORRECCIÓN DE LA JEFATURA (${ID_EN_EL_MARCO}) · fila ${c.fila_id}`,
    `- Qué vio la jefatura: ${c.motivo}`,
    ...(c.linea_de_la_ficha ? [`- La línea de la ficha de la oferta que lo contradice: «${c.linea_de_la_ficha}»`] : []),
    c.dura
      ? '- Es una REGLA DURA de la agencia: se toma sí o sí. Tú decides CÓMO resolverla (y si la tomas entera o en parte), no si la tomas.'
      : '- Es una observación de criterio: es un insumo, no una orden. Tú decides si la tomas entera, en parte o no la tomas.',
    `- Deja tu decisión en UNA línea aparte, al final: «${ROTULO_DE_RESPUESTA} ${ID_EN_EL_MARCO}: tomada», «${ROTULO_DE_RESPUESTA} ${ID_EN_EL_MARCO}: tomada en parte: <por qué>» o «${ROTULO_DE_RESPUESTA} ${ID_EN_EL_MARCO}: no tomada: <por qué>».`,
  ].join('\n')
}

/**
 * Guarda la respuesta de UN intento del creador. Idempotente: si ya está respondida, no cambia nada.
 * `no_dicha` con intentos por delante deja la corrección `recibida` (la vigía la vuelve a repartir); agotados, queda respondida `no_dicha` y visible.
 */
export async function guardarRespuesta(al: Almacen, llave: string, leida: RespuestaLeida, ahora: string, versionNueva: Record<string, unknown> | null = null): Promise<{ estado: EstadoDeCorreccion; respuesta: RespuestaDeCorreccion | null; ya_respondida?: boolean } | null> {
  if (!al.correccion || !al.correccionActualizar) return null
  const c = await al.correccion(llave)
  if (!c) return null
  if (c.estado === 'respondida') return { estado: c.estado, respuesta: c.respuesta, ya_respondida: true }
  if (leida.respuesta === 'no_dicha' && c.intentos < INTENTOS_POR_CORRECCION) {
    await al.correccionActualizar(llave, { estado: 'recibida', explicacion: recortar(leida.motivo_no_dicha ?? null) }, c.estado)
    return { estado: 'recibida', respuesta: null }
  }
  const explicacion = leida.respuesta === 'no_dicha' ? (leida.motivo_no_dicha ?? 'sin respuesta del creador') : leida.explicacion
  await al.correccionActualizar(llave, { estado: 'respondida', respuesta: leida.respuesta, explicacion: recortar(explicacion), version_nueva: versionNueva, respondida_en: ahora }, c.estado)
  return { estado: 'respondida', respuesta: leida.respuesta }
}

// ───────────────────────────────────────────── 2 · el reparto (la vigía de la cadena, una vez por vuelta)
/** lo que un creador hace con la corrección: abrir su mesa (la respuesta llega después por `guardarRespuesta`) */
export type ResultadoDeEntrega = { estado: 'entregada' } | { estado: 'sin_creador' | 'no_abre'; motivo: string }
export type CreadorDeCorreccion = (al: Almacen, c: Correccion, ahora: string) => Promise<ResultadoDeEntrega>

const vencida = (c: Correccion, ahora: string) => !!c.entregada_en && Date.parse(ahora) > Date.parse(c.entregada_en) + PLAZO_DEL_CREADOR_MIN * 60_000

/**
 * Reparte las pendientes. Nunca lanza hacia la vigía por una corrección. Por cada una:
 *   recibida → se entrega al creador (cuenta un intento) · en manos del creador y vencida → vuelve a recibida (o se cierra no_dicha si no quedan intentos)
 *   destino sin creador (hoja, mientras Lenovo decide · banco sin el puerto de CC1) → queda recibida y visible, sin gastar intentos.
 */
export async function repartirCorrecciones(al: Almacen, ahora: string, creadores: Partial<Record<DestinoDeCorreccion, CreadorDeCorreccion>>): Promise<{ aplicado: string[]; lineas: string[] }> {
  const aplicado: string[] = [], lineas: string[] = []
  if (!al.correccionesPendientes || !al.correccionActualizar) return { aplicado, lineas }
  for (const c of await al.correccionesPendientes()) {
    try {
      if (c.estado === 'en_manos_del_creador') {
        if (!vencida(c, ahora)) continue
        const r = await guardarRespuesta(al, c.llave, { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: `el creador no respondió en ${PLAZO_DEL_CREADOR_MIN} min` }, ahora)
        aplicado.push(`${c.llave}: el creador no respondió a tiempo → ${r?.estado === 'respondida' ? 'cerrada no_dicha (intentos agotados)' : 'se reintenta'}`)
        continue
      }
      const creador = creadores[c.destino]
      if (!creador) { lineas.push(`${c.llave}: sin creador para «${c.destino}» todavía · queda recibida y visible`); continue }
      if (c.intentos >= INTENTOS_POR_CORRECCION) {
        await al.correccionActualizar(c.llave, { estado: 'respondida', respuesta: 'no_dicha', explicacion: c.explicacion ?? 'intentos agotados', respondida_en: ahora }, c.estado)
        aplicado.push(`${c.llave}: intentos agotados → no_dicha`)
        continue
      }
      // la marca va ANTES de abrir la mesa (escritura condicional al estado): dos vigías juntas no abren dos mesas
      const tomada = await al.correccionActualizar(c.llave, { estado: 'en_manos_del_creador', intentos: c.intentos + 1, entregada_en: ahora }, 'recibida')
      if (!tomada) continue
      const r = await creador(al, { ...c, estado: 'en_manos_del_creador', intentos: c.intentos + 1, entregada_en: ahora }, ahora)
      if (r.estado === 'entregada') aplicado.push(`${c.llave}: entregada a su creador (intento ${c.intentos + 1})`)
      else {
        await al.correccionActualizar(c.llave, { estado: 'recibida', intentos: r.estado === 'sin_creador' ? c.intentos : c.intentos + 1, entregada_en: null, explicacion: recortar(r.motivo) }, 'en_manos_del_creador')
        lineas.push(`${c.llave}: no se pudo entregar (${r.motivo})`)
      }
    } catch (e) {
      lineas.push(`${c.llave}: no se pudo repartir (${String((e as Error)?.message ?? e).slice(0, 160)})`)
    }
  }
  return { aplicado, lineas }
}
