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
import type { Fila } from './tipos'

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
  /** a dónde va (calendario | banco): la hoja ya se repartió al recibir */
  destino: DestinoGuardado
  /** el destino que pidió la oficina (el de la llave) */
  destino_pedido: DestinoDeCorreccion
  /** el rótulo de la hoja donde apareció el dato (solo para destino hoja · CC4) */
  campo_de_la_hoja: string | null
  /** banco: la idea de la fila (`idea_ref`) al recibir */
  idea_id: string | null
  /** banco: la `linea` de esa idea en la gran idea aprobada vigente, leída AL RECIBIR (CC1: si cambió, la corrección es vieja) */
  idea_sello: string | null
  /** la regla dura que citó la jefatura (D1, D2, D3…), si la citó; una corrección con regla es dura */
  regla: string | null
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
  /** la alarma de una dura no tomada salió (una por incidente · Lenovo 17-nov) */
  alarma_en: string | null
  /** 🟡 CC6 22:00 · se guarda al CERRAR: ¿quedó frenada? La fila de alarmas por reintentar trae solo éstas (las tomadas no la tapan) */
  frena: boolean
  /** 🟡 CC7 22:02 · los OTROS encargos de la misma fila que llegaron mientras ésta seguía abierta: la respuesta del creador vale también para ellos */
  encargos_cubiertos: string[]
}

export const llaveDeCorreccion = (filaId: string, destino: DestinoDeCorreccion): string => `${filaId}:${destino}`
/**
 * 🟡 CC7 22:02 (el hueco entre encargos) · la llave de la OFICINA es «fila:destino»; la guardada lleva «#n» desde la 2.ª corrección de esa fila y destino
 * (un encargo nuevo cuando la anterior ya se respondió). La oficina siempre ve SU llave (`vista`).
 */
export const llaveGuardada = (llave: string, n: number): string => (n <= 1 ? llave : `${llave}#${n}`)
export const llaveDeLaOficina = (guardada: string): string => guardada.replace(/#\d+$/, '')
export type DestinoGuardado = Exclude<DestinoDeCorreccion, 'hoja'>

/**
 * RESPUESTA-LENOVO (17-nov · 4) · la hoja no tiene creador propio: la corrección va al INSUMO de donde salió la línea (CC3 + CC4 · opción b con `campo_de_la_hoja`).
 *   lo de la fila (datos del calendario, llamado, oferta, objetivo, público) → calendario
 *   lo de la idea (idea, mensaje, gancho, protagonista, lo decidido) → banco, SOLO si la fila tiene `idea_ref` y NO es pieza fija (CC1: el banco solo cambia la idea);
 *       pieza fija → calendario (su texto fijo es de la fila) · sin idea → pieza
 *   sin campo o un campo que no está aquí → pieza (la vuelta a la mesa que ya existe)
 * Un destino «banco» pedido directo cumple la misma condición de la idea.
 */
export const CAMPOS_DEL_CALENDARIO: readonly string[] = ['DATOS DEL CALENDARIO', 'LLAMADO A LA ACCIÓN', 'OFERTA', 'OBJETIVO', 'PÚBLICO']
export const CAMPOS_DE_LA_IDEA: readonly string[] = ['IDEA DEL BANCO', 'IDEA DE LA PIEZA', 'MENSAJE (UNO)', 'GANCHO SUGERIDO', 'PROTAGONISTA', 'LO DECIDIDO', 'FIJO · MENSAJE']
const rotulo = (x: string) => x.replace(/^[\s\-*•]+/, '').replace(/[\s:]+$/, '').replace(/\s+/g, ' ').toUpperCase()
type FilaParaRepartir = { idea_ref?: string | null; pieza_fija?: string | null }
export function destinoFinal(pedido: DestinoDeCorreccion, campo: string | null, fila: FilaParaRepartir | null): { destino: DestinoGuardado | 'pieza'; motivo: string } {
  const aLaIdea = (): { destino: DestinoGuardado | 'pieza'; motivo: string } =>
    !fila ? { destino: 'pieza', motivo: 'la fila no está en el calendario vigente' }
      : fila.pieza_fija ? { destino: 'calendario', motivo: 'la fila es una pieza fija: su texto es de la fila, no de una idea del banco' }
      : !fila.idea_ref ? { destino: 'pieza', motivo: 'la fila no tiene idea del banco' }
      : { destino: 'banco', motivo: `la idea ${fila.idea_ref}` }
  if (pedido === 'calendario') return { destino: 'calendario', motivo: 'pedido al calendario' }
  if (pedido === 'banco') return aLaIdea()
  const k = campo ? rotulo(campo) : null
  if (!k) return { destino: 'pieza', motivo: 'la hoja sin el campo de donde salió el dato' }
  if (CAMPOS_DEL_CALENDARIO.includes(k)) return { destino: 'calendario', motivo: `el campo «${k}» sale de la fila` }
  if (CAMPOS_DE_LA_IDEA.includes(k)) return aLaIdea()
  return { destino: 'pieza', motivo: `el campo «${k}» no sale de un paso de la cadena` }
}
const esDestino = (x: unknown): x is DestinoDeCorreccion => typeof x === 'string' && (DESTINOS_DE_CORRECCION as readonly string[]).includes(x)
const recortar = (x: string | null): string | null => (x === null ? null : x.slice(0, LARGO_MAXIMO_DE_TEXTO))

// ───────────────────────────────────────────── 1 · recibir (POST /api/cadena/correcciones · accion recibir)
/** `enProceso`: la oficina llega por `puertoDeLaCadena` (CC4 · en proceso, de confianza, sin HTTP): misma validación y misma llave, sin `autorizarLlamada` */
export async function correccionRecibir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string, enProceso = false): Promise<Respuesta> {
  if (!al.correccionInsertar) return err(503, 'E-SIN-CORRECCIONES', 'este almacén no guarda correcciones todavía')
  const campanaId = cadena(cuerpo.campana_id)
  if (!campanaId) return err(400, 'E-CAMPANA', 'falta campana_id')
  const campana = await al.campana(campanaId)
  if (!campana) return err(404, 'E-CAMPANA-NO-EXISTE', 'esa campaña no existe')
  const auth = enProceso ? null : await autorizarLlamada(al, cuerpo, campana.client_id)
  if (auth) return auth
  const filaId = cadena(cuerpo.fila_id), destino = cuerpo.destino, motivo = cadena(cuerpo.motivo), encargoId = cadena(cuerpo.encargo_id)
  if (!filaId) return err(400, 'E-FILA', 'falta fila_id')
  if (!esDestino(destino)) return err(400, 'E-DESTINO', `destino debe ser uno de: ${DESTINOS_DE_CORRECCION.join(', ')} (la pieza vuelve a su mesa en la oficina, no aquí)`)
  if (!motivo) return err(400, 'E-MOTIVO', 'falta el motivo: qué vio la jefatura')
  if (!encargoId) return err(400, 'E-ENCARGO', 'falta encargo_id: el encargo de la pieza donde quedó la devolución')
  if (cuerpo.dura !== undefined && typeof cuerpo.dura !== 'boolean') return err(400, 'E-DURA', 'dura debe ser true o false')
  // la llave es la de la oficina: con el destino que ELLA pidió (la hoja se reparte aquí, pero la llave no cambia)
  const llave = llaveDeCorreccion(filaId, destino)
  if (cuerpo.llave !== undefined && cadena(cuerpo.llave) !== llave) return err(400, 'E-LLAVE', `la llave no corresponde a la fila y el destino (se esperaba «${llave}»)`)
  const campoDeLaHoja = cadena(cuerpo.campo_de_la_hoja)
  const reglaCruda = cadena(cuerpo.regla)
  if (reglaCruda && !/^D\d{1,2}$/i.test(reglaCruda)) return err(400, 'E-REGLA', 'la regla dura va como «D1», «D2»…')
  const regla = reglaCruda ? reglaCruda.toUpperCase() : null
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const fila = (await al.filas(campana.id, version)).find((f) => f.id === filaId) ?? null
  const repartida = destinoFinal(destino, campoDeLaHoja, fila)
  // banco: el sello es la línea de la idea en la gran idea aprobada vigente; sin la idea en el banco, no hay a quién corregir → pieza
  const sello = repartida.destino === 'banco' && fila?.idea_ref ? await selloDeLaIdea(al, campana.id, fila.idea_ref) : null
  const r = repartida.destino === 'banco' && !sello ? { destino: 'pieza' as const, motivo: `la idea ${fila?.idea_ref} no está en la gran idea aprobada` } : repartida
  // a la pieza: no es de la cadena (la oficina la devuelve a su mesa); no se guarda nada aquí
  if (r.destino === 'pieza') return { status: 200, cuerpo: { ok: true, va_a: 'pieza', motivo: r.motivo, llave } }
  const nueva: Correccion = {
    llave, campana_id: campana.id, fila_id: filaId, destino: r.destino, destino_pedido: destino, campo_de_la_hoja: campoDeLaHoja, idea_id: r.destino === 'banco' ? fila?.idea_ref ?? null : null, idea_sello: sello, regla,
    motivo: recortar(motivo)!, linea_de_la_ficha: recortar(cadena(cuerpo.linea_de_la_ficha)), dura: cuerpo.dura === true || !!regla,
    origen: cadena(cuerpo.origen), encargo_id: encargoId, encargos_cubiertos: [], estado: 'recibida', respuesta: null, explicacion: null, version_nueva: null, frena: false, intentos: 0, recibida_en: ahora, entregada_en: null, respondida_en: null, alarma_en: null,
  }
  return insertarPorEncargo(al, nueva, llave, ahora)
}

/**
 * 🟡 CC7 22:02 · una corrección por (fila, destino) Y por encargo, sin perder la idempotencia:
 *  · el MISMO encargo otra vez → `ya_estaba` con la suya;
 *  · otro encargo y la última sigue abierta → la misma corrección lo cubre (`encargos_cubiertos`): la respuesta del creador vale para los dos;
 *  · otro encargo y la última ya se respondió → una DURA abre una corrección nueva («se toman sí o sí», firma de Emilio);
 *    una de CRITERIO no se reabre: queda cerrada al llegar como observación (`no_tomada`), y la pieza sigue.
 */
export const MAX_CORRECCIONES_POR_FILA = 20
async function insertarPorEncargo(al: Almacen, nueva: Correccion, llave: string, ahora: string): Promise<Respuesta> {
  const ya = (c: Correccion) => ({ status: 200, cuerpo: { ok: true, ya_estaba: true, correccion: vista(c) } })
  for (let n = 1, vueltas = 0; n <= MAX_CORRECCIONES_POR_FILA && vueltas < MAX_CORRECCIONES_POR_FILA * 3; n++, vueltas++) {
    const guardada = llaveGuardada(llave, n)
    const existe = await al.correccion!(guardada)
    if (!existe) {
      const previa = n > 1 ? await al.correccion!(llaveGuardada(llave, n - 1)) : null
      const cerradaComoObservacion = !!previa && !nueva.dura
      const fila: Correccion = cerradaComoObservacion
        ? { ...nueva, llave: guardada, estado: 'respondida', respuesta: 'no_tomada', explicacion: recortar(`la misma fila ya tuvo su corrección de criterio (${previa!.llave}, respondida «${previa!.respuesta}»): no se reabre, va como observación`), respondida_en: ahora }
        : { ...nueva, llave: guardada }
      const { correccion, nueva: esNueva } = await al.correccionInsertar!(fila)
      if (esNueva) return { status: 201, cuerpo: { ok: true, ya_estaba: false, correccion: vista(correccion) } }
      n-- // otro la insertó en el medio: se vuelve a mirar esa misma
      continue
    }
    const cubiertos = existe.encargos_cubiertos ?? []
    if (existe.encargo_id === nueva.encargo_id || cubiertos.includes(nueva.encargo_id)) return ya(existe)
    if (existe.estado !== 'respondida') {
      // sigue abierta: la cubre (escritura condicional al estado; si cambió en el medio, se vuelve a mirar)
      const con = [...cubiertos, nueva.encargo_id]
      if (await al.correccionActualizar!(existe.llave, { encargos_cubiertos: con }, existe.estado)) return ya({ ...existe, encargos_cubiertos: con })
      n--
      continue
    }
  }
  return err(409, 'E-DEMASIADAS', `la fila ya tiene ${MAX_CORRECCIONES_POR_FILA} correcciones a ${nueva.destino_pedido}: la revisa una persona`)
}

/** GET por encargo (la bandeja de la oficina lee el estado y la respuesta del creador) */
export async function correccionesDelEncargo(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const encargoId = cadena(cuerpo.encargo_id)
  if (!encargoId) return err(400, 'E-ENCARGO', 'falta encargo_id')
  const lista = al.correccionesDeEncargo ? await al.correccionesDeEncargo(encargoId) : []
  return { status: 200, cuerpo: { ok: true, correcciones: lista.map(vista) } }
}

/** RESPUESTA-LENOVO (17-nov · 3): una DURA cerrada sin tomar (no_dicha tras el reintento) FRENA la pieza y deja UNA alarma · «se toman sí o sí» */
export function frenadaPorReglaDura(c: Pick<Correccion, 'estado' | 'respuesta' | 'dura'>): boolean {
  return c.estado === 'respondida' && c.dura && c.respuesta === 'no_dicha'
}
/** ¿la pieza vieja NO sale? Todo lo que no es «sigue» (🟡 CC6 21:19: una sola regla para la oficina; una tomada REEMPLAZA la pieza, no la suelta) */
export const bloqueaLaPieza = (c: Parameters<typeof paraLaPieza>[0]): boolean => paraLaPieza(c) !== 'sigue'
/**
 * Lo que la oficina hace con la pieza (CC4 · con la vuelta de la fila de Lenovo: una corrección TOMADA no suelta la pieza vieja, la reemplaza):
 *   esperando  · sin respuesta todavía → no sale
 *   frenada    · una dura cerró sin tomar → no sale (la alarma ya salió del receptor)
 *   reemplazada· se tomó y la fila se movió (volvió al brief · se reubicó · se descartó · se fusionó) → la pieza vieja no se publica nunca
 *   sigue      · no se tomó (criterio) o se tomó sin mover la fila (aprobada sin dura · publicada) → sale y lo declara
 */
export type ParaLaPieza = 'esperando' | 'frenada' | 'reemplazada' | 'sigue'
export function paraLaPieza(c: Pick<Correccion, 'estado' | 'respuesta' | 'dura' | 'destino' | 'fila_id' | 'version_nueva'>): ParaLaPieza {
  if (c.estado !== 'respondida') return 'esperando'
  if (frenadaPorReglaDura(c)) return 'frenada'
  if (c.respuesta !== 'tomada' && c.respuesta !== 'tomada_en_parte') return 'sigue'
  const vn = (c.version_nueva ?? {}) as { accion?: unknown; filas_al_brief?: unknown; fila_publicada?: unknown }
  const movida = c.destino === 'calendario' ? typeof vn.accion === 'string' : Array.isArray(vn.filas_al_brief) && vn.filas_al_brief.includes(c.fila_id)
  if (movida) return 'reemplazada'
  // 🔴 CC6 · una DURA tomada sin mover la fila: la pieza vieja rompe la regla → frena (con su alarma), salvo que se sepa que ya se publicó
  return c.dura && vn.fila_publicada !== true ? 'frenada' : 'sigue'
}
const vista = (c: Correccion) => ({ llave: llaveDeLaOficina(c.llave), llave_guardada: c.llave, fila_id: c.fila_id, destino: c.destino, destino_pedido: c.destino_pedido, estado: c.estado, respuesta: c.respuesta, explicacion: c.explicacion, dura: c.dura, intentos: c.intentos, respondida_en: c.respondida_en, bloquea_la_pieza: bloqueaLaPieza(c), para_la_pieza: paraLaPieza(c), regla: c.regla })

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
export async function guardarRespuesta(al: Almacen, llave: string, leida: RespuestaLeida, ahora: string, versionNueva: Record<string, unknown> | null = null, final = false): Promise<{ estado: EstadoDeCorreccion; respuesta: RespuestaDeCorreccion | null; ya_respondida?: boolean } | null> {
  if (!al.correccion || !al.correccionActualizar) return null
  const c = await al.correccion(llave)
  if (!c) return null
  if (c.estado === 'respondida') return { estado: c.estado, respuesta: c.respuesta, ya_respondida: true }
  if (leida.respuesta === 'no_dicha' && !final && c.intentos < INTENTOS_POR_CORRECCION) {
    await al.correccionActualizar(llave, { estado: 'recibida', explicacion: recortar(leida.motivo_no_dicha ?? null) }, c.estado)
    return { estado: 'recibida', respuesta: null }
  }
  const explicacion = leida.respuesta === 'no_dicha' ? (leida.motivo_no_dicha ?? 'sin respuesta del creador') : leida.explicacion
  const cerrada: Correccion = { ...c, estado: 'respondida', respuesta: leida.respuesta, explicacion: recortar(explicacion), version_nueva: versionNueva, respondida_en: ahora }
  const frena = paraLaPieza(cerrada) === 'frenada'
  const cerro = await al.correccionActualizar(llave, { estado: 'respondida', respuesta: leida.respuesta, explicacion: cerrada.explicacion, version_nueva: versionNueva, respondida_en: ahora, frena }, c.estado)
  if (cerro) await alarmaSiFrena(al, { ...cerrada, frena }, ahora)
  return { estado: 'respondida', respuesta: leida.respuesta }
}

/** la `linea` de la idea en la gran idea aprobada vigente (la misma regla que el calendario, el tablero y el puerto del banco de CC1) */
export async function selloDeLaIdea(al: Almacen, campanaId: string, ideaId: string): Promise<string | null> {
  const aprobado = [...(await al.conceptosDe(campanaId))].reverse().find((x) => x.aprobacion === 'aprobado' && x.leido)
  const banco = aprobado && Array.isArray((aprobado.leido as Record<string, unknown>).banco) ? ((aprobado.leido as Record<string, unknown>).banco as Array<{ id?: unknown; linea?: unknown }>) : []
  const idea = banco.find((i) => i.id === ideaId)
  return idea && typeof idea.linea === 'string' && idea.linea.trim() ? idea.linea : null
}

/**
 * CONTRATO-CC1 (17-nov) · un creador que se SONDEA en cada vuelta: el puerto abre su mesa, reintenta adentro y responde al final.
 * El receptor solo marca la corrección «en manos del creador» (la puerta de CC1 exige eso), lo llama con la misma corrección hasta `respondida`
 * y guarda esa respuesta como FINAL (los reintentos ya los hizo el puerto; aquí no se repiten).
 */
export type SondeoDeCorreccion = (al: Almacen, c: Correccion, ahora: string) => Promise<{ estado: 'en_curso'; detalle?: string } | { estado: 'respondida'; leida: RespuestaLeida; version_nueva: Record<string, unknown> | null }>

/** la forma del puerto de CC1 que usa el receptor (estructural: el módulo del banco no se importa aquí) */
export interface CorreccionAlBancoDelReceptor { correccion_id: string; campana_id: string; idea_id: string; idea_sello: string; filas_afectadas: string[]; motivo: string; linea_de_la_ficha: string | null; regla: string | null }
export type PuertoDelBanco = (al: Almacen, c: CorreccionAlBancoDelReceptor, ahora: string) => Promise<
  | { estado: 'en_curso'; encargo_id?: string | null; intentos?: number }
  | { estado: 'respondida'; resultado: { respuesta: { respuesta: RespuestaDeCorreccion; explicacion?: string | null; motivo?: string | null; accion?: string }; version: number | null; reasignadas?: unknown[]; con_brief_sin_tocar?: string[] } }
>

/**
 * RESPUESTA-LENOVO-a-CC3 (vuelta de la fila · SÍ) · una corrección del banco TOMADA (o en parte) devuelve a `lista_para_brief` las filas que ya tenían brief con la idea vieja
 * (`con_brief_sin_tocar` del puerto de CC1): desde `briefeada` / `en_oficina` siempre; desde `aprobada` solo con regla dura y si la pieza NO se publicó
 * (sin la consulta de publicación, se da por publicada: no vuelve). La pieza vieja queda reemplazada. La escribe solo el receptor, una vez por corrección
 * (la escritura es condicional al estado de la fila: repetirla no la mueve otra vez).
 */
export const ESTADOS_QUE_VUELVEN_AL_BRIEF: readonly Fila['estado'][] = ['briefeada', 'en_oficina']
export async function devolverFilasAlBrief(al: Almacen, c: Pick<Correccion, 'campana_id' | 'dura' | 'llave'>, filaIds: readonly string[]): Promise<string[]> {
  if (!filaIds.length) return []
  const version = await al.ultimaVersionDeCalendario(c.campana_id)
  if (!version) return []
  const filas = await al.filas(c.campana_id, version)
  const vueltas: string[] = []
  for (const id of [...new Set(filaIds)]) {
    const f = filas.find((x) => x.id === id)
    if (!f) continue
    // la regla dura se mira en un solo lugar: el «desde» de la escritura condicional (sin dura, «aprobada» no está y la fila no se mueve)
    if (f.estado === 'aprobada' && (!al.piezaPublicada || (await al.piezaPublicada(c.campana_id, f.id)))) continue
    const desde: readonly Fila['estado'][] = c.dura ? [...ESTADOS_QUE_VUELVEN_AL_BRIEF, 'aprobada'] : ESTADOS_QUE_VUELVEN_AL_BRIEF
    if (await al.reubicarFila(c.campana_id, version, f.id, { estado: 'lista_para_brief' }, avisoDeLaVuelta(c.llave), desde)) vueltas.push(f.id)
  }
  return vueltas
}
/** la marca que deja la vuelta en la fila: con ella, una vuelta repetida (el cierre perdió) sabe que la fila YA volvió por esta corrección (🔴 CC6 21:40) */
export const avisoDeLaVuelta = (llave: string) => `la jefatura corrigió su idea del banco (corrección ${llave}): el brief se rehace y la pieza vieja queda reemplazada`

export function sondeoDelBanco(puerto: PuertoDelBanco): SondeoDeCorreccion {
  return async (al, c, ahora) => {
    if (!c.idea_id || !c.idea_sello) return { estado: 'respondida', leida: { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: 'la corrección al banco llegó sin la idea o sin su sello' }, version_nueva: null }
    const e = await puerto(al, { correccion_id: c.llave, campana_id: c.campana_id, idea_id: c.idea_id, idea_sello: c.idea_sello, filas_afectadas: [c.fila_id], motivo: c.motivo, linea_de_la_ficha: c.linea_de_la_ficha, regla: c.regla }, ahora)
    if (e.estado === 'en_curso') return { estado: 'en_curso', detalle: e.intentos === -1 ? 'error pasajero del puerto' : undefined }
    const x = e.resultado.respuesta
    const explicacion = recortar(cadena(x.explicacion ?? null))
    const leida: RespuestaLeida = x.respuesta === 'no_dicha'
      ? { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: cadena(x.motivo ?? null) ?? 'el banco no respondió' }
      // una dura no se puede «no tomar» (se toma sí o sí): si el puerto la deja así, cuenta como no dicha
      : c.dura && x.respuesta === 'no_tomada' ? { respuesta: 'no_dicha', explicacion, motivo_no_dicha: 'es una regla dura y el banco dijo «no tomada»' }
      : { respuesta: x.respuesta, explicacion }
    // la vuelta va ANTES de cerrar la corrección: si algo se corta en el medio, repetir no la mueve dos veces (condicional al estado de la fila)
    const tomada = leida.respuesta === 'tomada' || leida.respuesta === 'tomada_en_parte'
    // al editar el puerto no dice qué filas tenían brief (al retirar, sí: `con_brief_sin_tocar`, ya reasignadas): las que citan la idea corregida, más esas
    const citan = c.idea_id ? (await al.filas(c.campana_id, Math.max(1, await al.ultimaVersionDeCalendario(c.campana_id)))).filter((f) => f.idea_ref === c.idea_id).map((f) => f.id) : []
    const candidatas = [...citan, ...(e.resultado.con_brief_sin_tocar ?? [])]
    if (tomada) await devolverFilasAlBrief(al, c, candidatas)
    // las devueltas se cuentan por el ESTADO de la fila y la marca de ESTA corrección, no por lo que movió esta llamada: repetir da lo mismo
    const ahoraFilas = tomada ? await al.filas(c.campana_id, Math.max(1, await al.ultimaVersionDeCalendario(c.campana_id))) : []
    const filas_al_brief = ahoraFilas.filter((f) => candidatas.includes(f.id) && f.estado === 'lista_para_brief' && f.avisos.includes(avisoDeLaVuelta(c.llave))).map((f) => f.id)
    // 🔴 CC6 · una dura tomada cuya fila NO volvió: solo «sigue» si se SABE que la pieza ya se publicó; si no, frena
    const propia = ahoraFilas.find((f) => f.id === c.fila_id)
    const fila_publicada = !!(tomada && propia && !filas_al_brief.includes(c.fila_id) && al.piezaPublicada && (await al.piezaPublicada(c.campana_id, c.fila_id)))
    return { estado: 'respondida', leida, version_nueva: { version: e.resultado.version, accion: x.accion ?? null, reasignadas: e.resultado.reasignadas ?? [], con_brief_sin_tocar: e.resultado.con_brief_sin_tocar ?? [], filas_al_brief, fila_publicada } }
  }
}

/**
 * RESPUESTA-LENOVO (17-nov · 3): una DURA que el creador no tomó tras el reintento FRENA (esas piezas no se publican) y deja UNA alarma en #alertas con el motivo.
 * Una por incidente: solo quien cierra la corrección la manda (la escritura condicional al estado la cierra una sola vez) · si Slack no confirma, `alarma_en` queda vacío
 * y la vigía la reintenta (`alarmasPendientes`): un aviso que no salió no se da por avisado.
 */
export function textoDeLaAlarma(c: Pick<Correccion, 'fila_id' | 'campana_id' | 'destino' | 'motivo' | 'linea_de_la_ficha' | 'explicacion'> & { respuesta?: Correccion['respuesta'] }): string {
  const porque = c.respuesta === 'tomada' || c.respuesta === 'tomada_en_parte'
    ? `El creador (${c.destino}) la tomó, pero la fila no pudo volver al brief (la pieza vieja sigue rompiendo la regla): ${c.explicacion ?? 'sin explicación'}.`
    : `El creador (${c.destino}) no la tomó tras el reintento: ${c.explicacion ?? 'sin respuesta'}.`
  return `⛔ Regla dura sin tomar · la pieza de la fila ${c.fila_id} (campaña ${c.campana_id}) NO se publica. La jefatura vio: ${c.motivo}${c.linea_de_la_ficha ? ` (ficha: «${c.linea_de_la_ficha}»)` : ''}. ${porque}`
}
async function alarmaSiFrena(al: Almacen, c: Correccion, ahora: string): Promise<void> {
  if (paraLaPieza(c) !== 'frenada' || c.alarma_en) return
  try {
    const r = await al.avisarAlarma(textoDeLaAlarma(c))
    if (r.ok && al.correccionActualizar) await al.correccionActualizar(c.llave, { alarma_en: ahora }, 'respondida')
  } catch { /* la vigía la reintenta */ }
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
export async function repartirCorrecciones(al: Almacen, ahora: string, creadores: Partial<Record<DestinoDeCorreccion, CreadorDeCorreccion>>, sondeos: Partial<Record<DestinoGuardado, SondeoDeCorreccion>> = {}): Promise<{ aplicado: string[]; lineas: string[] }> {
  const aplicado: string[] = [], lineas: string[] = []
  if (!al.correccionesPendientes || !al.correccionActualizar) return { aplicado, lineas }
  // las alarmas de duras sin tomar que Slack no confirmó (una por incidente: se reintentan, no se duplican)
  if (al.alarmasPendientes) for (const c of await al.alarmasPendientes()) { await alarmaSiFrena(al, c, ahora); if (c.alarma_en === null) aplicado.push(`${c.llave}: alarma de regla dura reintentada`) }
  // 18-nov · botón «Flujo de la campaña»: con la campaña `pausada` no se abre ni se reintenta ninguna mesa de corrección; la corrección queda como está (sin gastar intentos) y sigue al reanudar
  const pausadas = new Map<string, boolean>()
  const estaPausada = async (id: string) => {
    if (!pausadas.has(id)) pausadas.set(id, (await al.campana(id))?.estado === 'pausada')
    return pausadas.get(id) === true
  }
  for (const c of await al.correccionesPendientes()) {
    try {
      if (await estaPausada(c.campana_id)) continue
      const sondeo = sondeos[c.destino]
      if (sondeo) {
        // la marca va antes de la primera llamada (la puerta del puerto exige «en manos del creador»); después, se sondea en cada vuelta
        if (c.estado === 'recibida' && !(await al.correccionActualizar(c.llave, { estado: 'en_manos_del_creador', intentos: c.intentos + 1, entregada_en: ahora }, 'recibida'))) continue
        const enManos: Correccion = c.estado === 'recibida' ? { ...c, estado: 'en_manos_del_creador', intentos: c.intentos + 1, entregada_en: ahora } : c
        const s = await sondeo(al, enManos, ahora)
        if (s.estado === 'en_curso') { if (s.detalle) lineas.push(`${c.llave}: ${s.detalle}`); continue }
        const g = await guardarRespuesta(al, c.llave, s.leida, ahora, s.version_nueva, true)
        aplicado.push(`${c.llave}: el ${c.destino} respondió ${g?.respuesta ?? s.leida.respuesta}`)
        continue
      }
      if (c.estado === 'en_manos_del_creador') {
        if (!vencida(c, ahora)) continue
        const r = await guardarRespuesta(al, c.llave, { respuesta: 'no_dicha', explicacion: null, motivo_no_dicha: `el creador no respondió en ${PLAZO_DEL_CREADOR_MIN} min` }, ahora)
        aplicado.push(`${c.llave}: el creador no respondió a tiempo → ${r?.estado === 'respondida' ? 'cerrada no_dicha (intentos agotados)' : 'se reintenta'}`)
        continue
      }
      const creador = creadores[c.destino]
      // sin creador: queda recibida y visible en la corrección (la bandeja la lee); no se avisa en cada vuelta (menos ruido)
      if (!creador) continue
      if (c.intentos >= INTENTOS_POR_CORRECCION) {
        if (await al.correccionActualizar(c.llave, { estado: 'respondida', respuesta: 'no_dicha', explicacion: c.explicacion ?? 'intentos agotados', respondida_en: ahora }, c.estado)) await alarmaSiFrena(al, { ...c, estado: 'respondida', respuesta: 'no_dicha', explicacion: c.explicacion ?? 'intentos agotados' }, ahora)
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
