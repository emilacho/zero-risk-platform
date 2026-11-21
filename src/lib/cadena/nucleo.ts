/**
 * Núcleo compartido de los manejadores: esperas con reloj, corridas idempotentes con plazo, presupuesto, `necesita_humano`.
 * Todo contra la interfaz `Almacen` (nada de base aquí).
 */
import { createHash } from 'node:crypto'
import type { Almacen, Campana, Corrida, EsperaFila } from './almacen'
import { calcularReloj, type ContextoPlazo } from './esperas'
import { bolsaDePlanificacion, MAXIMO_DE_INTENTOS, medidaDeCampana, PASOS_CON_PRESUPUESTO_PROPIO, PRESUPUESTO_LECTOR_POR_OMISION, plazoDeLlamadaMinutos, plazoMinimoDelPaso, topeDelPaso, type Paso } from './constantes'

export const sello = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 12)
export const semanaDeId = (id: string): number => Number(/^s(\d+)-/.exec(id)?.[1] ?? 0)

/** Abre una espera con su reloj (idempotente por `dedupKey`). Sin plazo configurado para el tipo, falla fuerte: no se crea una espera sin reloj. */
export async function abrirEsperaDe(
  al: Almacen, campana: Pick<Campana, 'id' | 'seco'>, tipo: string, objetoId: string, motivo: string, ahora: string, ctx: ContextoPlazo = {}, dedupKey?: string,
): Promise<EsperaFila> {
  const plazo = (await al.plazos()).find((p) => p.tipo === tipo)
  if (!plazo) throw new Error(`no hay plazo configurado para ${tipo}: no se crea una espera sin reloj`)
  const reloj = calcularReloj(plazo, ahora, ctx)
  const r = await al.abrirEspera({
    campana_id: campana.id, objeto_tipo: tipo, objeto_id: objetoId, motivo, desde: ahora,
    recordatorio_en: reloj.recordatorio_en, alerta_en: reloj.alerta_en, vence_en: reloj.vence_en, estado: 'viva', rung_enviado: 0,
    dedup_key: dedupKey ?? `${campana.id}:${tipo}:${objetoId}`, accion_al_vencer: reloj.accion_al_vencer, seco: campana.seco,
  })
  return r.espera
}

export async function resolverEsperas(al: Almacen, campanaId: string, tipo: string, objetoId?: string, estado: 'resuelta' | 'cancelada' = 'resuelta'): Promise<void> {
  for (const e of await al.esperasVivas()) {
    if (e.campana_id === campanaId && e.objeto_tipo === tipo && (objetoId === undefined || e.objeto_id === objetoId)) await al.actualizarEspera(e.id, { estado })
  }
}

/** Cancela TODAS las esperas vivas de una campaña (reemplazada o cerrada): ningún aviso ni vencimiento de una campaña muerta (CC#3 #464 C2). */
export async function cancelarEsperasDeCampana(al: Almacen, campanaId: string): Promise<number> {
  let n = 0
  for (const e of await al.esperasVivas()) if (e.campana_id === campanaId) { await al.actualizarEspera(e.id, { estado: 'cancelada' }); n++ }
  return n
}

/** Una campaña que necesita a Emilio: queda en `necesita_humano` CON su reloj (aviso inmediato, a las 48 h, y a los 7 días pasa a pausada). */
export async function ponerNecesitaHumano(al: Almacen, campana: Campana, motivo: string, ahora: string): Promise<{ campana: Campana; alerta: string }> {
  const c = await al.actualizarCampana(campana.id, { estado: 'necesita_humano', estado_motivo: motivo.slice(0, 500) })
  await abrirEsperaDe(al, c, 'necesita_humano', c.id, motivo.slice(0, 200), ahora, {}, `nh:${c.id}:${sello(motivo)}`)
  return { campana: c, alerta: `La campaña ${c.id} necesita a Emilio: ${motivo.slice(0, 300)}` }
}

/**
 * 18-nov · «NADA detiene el flujo» (grupo A) · el paso no pudo correr (bolsa o intentos) y la campaña SIGUE en su estado: el reintento llega solo en el tramo siguiente
 * (el vigía reemite la tanda; el barrido de atascadas deja el sobre del plan para la estrategia). UNA alerta por incidente: la marca es el motivo de la campaña
 * (`reintento automático · <paso> · <qué>`); con la misma marca ya escrita, no hay alerta nueva. Nunca `necesita_humano`.
 */
export const PREFIJO_DE_REINTENTO = 'reintento automático'
export async function seguirConReintento(al: Almacen, campana: Campana, paso: string, que: string): Promise<{ campana: Campana; alerta: string | null }> {
  const marca = `${PREFIJO_DE_REINTENTO} · ${paso} · ${que}`.slice(0, 500)
  if (campana.estado_motivo === marca) return { campana, alerta: null }
  const c = await al.actualizarCampana(campana.id, { estado_motivo: marca })
  return { campana: c, alerta: `La campaña ${c.id} sigue sola: ${paso} no pudo correr (${que.slice(0, 300)}). Lo reintenta en la vuelta siguiente; no hace falta nadie.` }
}

export function costoEfectivo(c: Pick<Corrida, 'costo_usd' | 'estado' | 'paso'>): number {
  if (typeof c.costo_usd === 'number' && c.costo_usd > 0) return c.costo_usd
  // el libro puede registrar 0 en un corte con tope diminuto (hallazgo de CC#1, relevo 29): si la llamada no terminó bien, se cuenta el tope como cota pesimista
  if (c.estado === 'fallida' || c.estado === 'vencida' || c.estado === 'cerrada_por_tope') return topeDelPaso(c.paso as Paso)
  return 0
}

export async function gastoDeCampana(al: Almacen, campanaId: string): Promise<number> {
  return (await al.corridasDeCampana(campanaId)).reduce((s, c) => s + costoEfectivo(c), 0)
}

/** el presupuesto propio del lector de una campaña: su dato (`presupuesto_lector_usd`) o, sin él, el valor por omisión */
export function presupuestoDelLector(campana: Pick<Campana, 'presupuesto_lector_usd'>): number {
  const v = Number(campana.presupuesto_lector_usd)
  return campana.presupuesto_lector_usd !== null && campana.presupuesto_lector_usd !== undefined && Number.isFinite(v) && v >= 0 ? v : PRESUPUESTO_LECTOR_POR_OMISION
}

/**
 * RESPUESTA-LENOVO a CC3 (17-nov, opción b) · DOS bolsas en la campaña: el lector gasta de la SUYA (`presupuesto_lector_usd`) y nada más;
 * los demás pasos gastan del presupuesto de planificación SIN contar lo del lector. Así el lector no le quita al calendario, y una estrategia cara no deja sin fichas.
 */
export async function bolsaDelPaso(al: Almacen, campana: Campana, paso: Paso): Promise<{ gastado: number; presupuesto: number }> {
  const delLector = PASOS_CON_PRESUPUESTO_PROPIO.has(paso)
  const gastado = (await al.corridasDeCampana(campana.id)).filter((c) => PASOS_CON_PRESUPUESTO_PROPIO.has(c.paso as Paso) === delLector).reduce((s, c) => s + costoEfectivo(c), 0)
  return { gastado, presupuesto: delLector ? presupuestoDelLector(campana) : campana.presupuesto_planificacion_usd }
}

/**
 * 18-nov · «NADA detiene el flujo» (grupo A · GO de Lenovo 13:52Z) · LA LLAVE DEL REINTENTO. La base no admite más de 3 intentos por llave (`intento BETWEEN 1 AND 3`):
 * cuando la llave del paso agotó sus 3 sin un `ok`, el paso sigue con `<llave>:r<tramo>` (el MISMO tramo de medio día del vigía), 3 intentos nuevos por tramo.
 * En el mismo tramo no se insiste; el siguiente pase del vigía (o el sobre del barrido) vuelve a entrar y encuentra la llave nueva.
 */
export const tramoDeReintento = (ahora: string): string => `${ahora.slice(0, 10)}${new Date(ahora).getUTCHours() < 12 ? 'am' : 'pm'}`
export const llaveDeReintentoDelPaso = (base: string, ahora: string): string => `${base}:r${tramoDeReintento(ahora)}`
/** la llave base o cualquiera de sus reintentos: un `ok` o un `en_curso` en cualquiera de ellas vale para todas */
export const esDeLaLlave = (clave: string, base: string): boolean => clave === base || clave.startsWith(`${base}:r`)
/** la llave base de una clave de corrida: sin su reintento (`:r<tramo>` o `:rmanual-<UTC>`) */
export const baseDeLaLlave = (clave: string): string => clave.replace(/:r[^:]*$/, '')

/**
 * La llave con la que iría el próximo intento de un paso, y si está AGOTADA (la misma regla de `prepararCorrida`, sin escribir nada):
 * la base con menos de 3 intentos; si no, la llave del tramo; agotada si el tramo ya usó sus 3, o si es nueva y la base se agotó en ESTE mismo tramo («no insistir en el mismo tramo»).
 */
export function estadoDeLaLlave(corridasDelPaso: Pick<Corrida, 'clave_idempotencia' | 'creada_en'>[], clave: string, ahora: string): { llave: string; intento: number; agotada: boolean } {
  const usadas = (k: string) => corridasDelPaso.filter((c) => c.clave_idempotencia === k).length
  const llave = usadas(clave) >= MAXIMO_DE_INTENTOS ? llaveDeReintentoDelPaso(clave, ahora) : clave
  const intento = usadas(llave) + 1
  const mismoTramo = llave !== clave && intento === 1 && corridasDelPaso.some((c) => esDeLaLlave(c.clave_idempotencia, clave) && c.creada_en && tramoDeReintento(c.creada_en) === tramoDeReintento(ahora))
  return { llave, intento, agotada: intento > MAXIMO_DE_INTENTOS || mismoTramo }
}

/**
 * 21-nov · REINTENTO MANUAL (GO Lenovo 03:55Z, opción c · CC4) · un operador concede a un paso AGOTADO una llave nueva `<base>:rmanual-<UTC>` con sus 3 intentos
 * (`reintento-manual.ts`). El permiso vive en la libreta `cadena_config.reintentos_manuales` (quién, cuándo, por qué, la llave que se agotó); no se mueve ni se borra
 * ninguna corrida. `prepararCorrida` lo usa SOLO cuando la regla de siempre dice «agotado», y pasa por la misma bolsa y el mismo candado del tope.
 */
export const CLAVE_DE_LA_LIBRETA_DE_REINTENTOS = 'reintentos_manuales'
export interface PermisoDeReintento { campana_id: string; paso: string; clave_agotada: string; llave: string; quien: string; por_que: string; cuando: string }
export const llaveDeReintentoManual = (base: string, ahora: string): string => `${base}:rmanual-${ahora.replace(/\.\d+/, '').replace(/[-:]/g, '').replace(/z$/i, '').toLowerCase()}`
export function permisosDeLaLibreta(v: unknown): PermisoDeReintento[] {
  if (!Array.isArray(v)) return []
  return v.filter((p): p is PermisoDeReintento => !!p && typeof p === 'object' && ['campana_id', 'paso', 'clave_agotada', 'llave', 'quien', 'por_que', 'cuando'].every((k) => typeof (p as Record<string, unknown>)[k] === 'string'))
}
/** el último permiso para esa campaña, ese paso y esa llave base (o null) */
export async function permisoVigente(al: Almacen, campanaId: string, paso: string, base: string): Promise<PermisoDeReintento | null> {
  const propios = permisosDeLaLibreta(await al.leerConfig(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS)).filter((p) => p.campana_id === campanaId && p.paso === paso && p.clave_agotada === base)
  return propios.at(-1) ?? null
}

/**
 * 18-nov · LA BOLSA AL TRIPLE DE LO MEDIDO (firma de Emilio: todo tope = el triple de lo medido) · la bolsa de PLANIFICACIÓN que no alcanza para el paso se lleva a
 * la de su regla (`bolsaDePlanificacion`: 3 × (la estrategia + las tandas de ESTA campaña), con lo medido), sin pasar NUNCA el tope de gasto de la campaña. Así una campaña
 * que nació con la bolsa vieja (US$ 6 fijos, como Náufrago) alcanza la suya. Una vez: si ya está en ese valor (o más), no se toca. El lector tiene su bolsa y no cambia.
 * Devuelve la bolsa nueva, o null si no hay nada que agrandar.
 */
export function bolsaAgrandada(campana: Pick<Campana, 'presupuesto_planificacion_usd' | 'tope_gasto_usd' | 'fecha_inicio' | 'fecha_fin' | 'semanas_de_tanda'>, paso: Paso): number | null {
  if (PASOS_CON_PRESUPUESTO_PROPIO.has(paso)) return null
  const tope = Number(campana.tope_gasto_usd)
  const techo = Math.min(bolsaDePlanificacion(medidaDeCampana(campana).totalTandas), campana.tope_gasto_usd !== null && campana.tope_gasto_usd !== undefined && Number.isFinite(tope) && tope > 0 ? tope : Infinity)
  const actual = Number(campana.presupuesto_planificacion_usd)
  return Number.isFinite(actual) && actual < techo ? techo : null
}

export type ResultadoDePreparar =
  | { tipo: 'lista'; corrida: Corrida; bolsa_agrandada?: { de: number; a: number } }
  | { tipo: 'ya_hecha'; corrida: Corrida }
  | { tipo: 'en_curso'; corrida: Corrida }
  | { tipo: 'intentos_agotados' }
  | { tipo: 'presupuesto_agotado'; gastado: number; presupuesto: number }

/**
 * Abre la corrida de un paso con su plazo (condición 2 de CC#3: una llamada en curso sin plazo es una espera sin reloj).
 * Idempotente: la misma `clave` con una corrida ok → `ya_hecha`; con una en curso dentro de plazo → `en_curso`; vencida o fallida → siguiente intento (máx. 3).
 */
export async function prepararCorrida(
  al: Almacen, campana: Campana, paso: Paso, clave: string, workflowId: string, workflowExecutionId: string, ahora: string, modelo: string, esquemaHash: string | null,
  /** r79 · D1: una corrida `ok` solo vale como «ya hecha» si el objeto validado EXISTE. Sin esta función (fechas) se confía en la corrida. */
  existeElObjeto?: () => Promise<boolean>,
): Promise<ResultadoDePreparar> {
  const previas = (await al.corridasDeCampana(campana.id)).filter((c) => c.paso === paso && esDeLaLlave(c.clave_idempotencia, clave))
  const ok = previas.find((c) => c.estado === 'ok')
  // la llamada pudo cerrar `ok` y caerse antes de guardar el objeto: sin objeto, ese `ok` no cuenta y se abre el siguiente intento (el tope de intentos sigue contando todas las previas)
  if (ok && (!existeElObjeto || await existeElObjeto())) return { tipo: 'ya_hecha', corrida: ok }
  for (const c of previas.filter((x) => x.estado === 'en_curso')) {
    if (c.plazo_en && Date.parse(ahora) > Date.parse(c.plazo_en)) await al.cerrarCorrida(c.id, { estado: 'vencida', error: 'la llamada pasó su plazo sin volver', plazo_en: c.plazo_en })
    else return { tipo: 'en_curso', corrida: c }
  }
  const todas = (await al.corridasDeCampana(campana.id)).filter((c) => c.paso === paso)
  const usadas = (k: string) => todas.filter((c) => c.clave_idempotencia === k).length
  // grupo A · la base agotada sigue con la llave del tramo (3 intentos nuevos); en el mismo tramo, agotados
  // (la llave del tramo NUEVA no se estrena en el mismo tramo en que se agotó la anterior: el reintento es «en la vuelta siguiente», no un segundo golpe seguido)
  const estado = estadoDeLaLlave(todas, clave, ahora)
  let llave = estado.llave
  let intento = estado.intento
  if (estado.agotada) {
    // 21-nov · reintento manual: solo si un operador lo concedió para ESTA llave base, y solo mientras su llave tenga intentos
    const permiso = await permisoVigente(al, campana.id, paso, clave)
    if (!permiso || usadas(permiso.llave) >= MAXIMO_DE_INTENTOS) return { tipo: 'intentos_agotados' }
    llave = permiso.llave
    intento = usadas(llave) + 1
  }
  const bolsa = await bolsaDelPaso(al, campana, paso)
  const gastado = bolsa.gastado
  let presupuesto = bolsa.presupuesto
  let agrandada: { de: number; a: number } | undefined
  if (gastado + topeDelPaso(paso) > presupuesto) {
    const nueva = bolsaAgrandada(campana, paso)
    if (nueva === null) return { tipo: 'presupuesto_agotado', gastado, presupuesto }
    await al.actualizarCampana(campana.id, { presupuesto_planificacion_usd: nueva })
    agrandada = { de: presupuesto, a: nueva }
    presupuesto = nueva
    if (gastado + topeDelPaso(paso) > presupuesto) return { tipo: 'presupuesto_agotado', gastado, presupuesto }
  }
  const plazoMin = Math.max(await plazoDeLlamadaMinutos(al), plazoMinimoDelPaso(paso)) // 21-nov #1260: nunca menos que la espera de la misma llamada
  const { corrida, creada } = await al.abrirCorrida({
    campana_id: campana.id, paso, clave_idempotencia: llave, intento, workflow_id: workflowId, workflow_execution_id: workflowExecutionId,
    modelo, costo_usd: null, estado: 'en_curso', plazo_en: new Date(Date.parse(ahora) + plazoMin * 60_000).toISOString(), error: null,
    revision_editor: paso === 'brief' ? 'conservada' : 'saltada_por_diseno', salida_estructurada: esquemaHash !== null, esquema_hash: esquemaHash, seco: campana.seco, creada_en: ahora,
  })
  // 🔴 #464 C1 (CC#3): el índice único decidió la carrera. Si OTRA llamada abrió este mismo intento antes, esta NO paga: la corrida ya existe y es de la otra.
  if (!creada) return corrida.estado === 'ok' ? { tipo: 'ya_hecha', corrida } : { tipo: 'en_curso', corrida }
  // …y como el intento sale de contar lo anterior, dos llamadas simultáneas pueden abrir intentos DISTINTOS (el único no las junta): gana la de menor id, la otra se descarta ANTES de gastar.
  const ganadora = (await al.corridasDeCampana(campana.id))
    .filter((c) => c.paso === paso && c.clave_idempotencia === llave && c.estado === 'en_curso' && c.id < corrida.id)
    .sort((a, b) => a.id - b.id)[0]
  if (ganadora) { await al.descartarCorrida(corrida.id); return { tipo: 'en_curso', corrida: ganadora } }
  return { tipo: 'lista', corrida, ...(agrandada ? { bolsa_agrandada: agrandada } : {}) }
}
