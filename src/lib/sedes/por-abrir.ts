/**
 * SEDES «POR ABRIR» (19-oct · firma de Emilio) · una sede que el dueño dijo que todavía no abre NO atiende al público: su horario y su atención no se leen como si fueran reales.
 * Los precios y el catálogo de la web SÍ son de esa sede y se quedan; lo que cambia es el rótulo de horario/atención. General: cualquier cliente con sedes por abrir, nada a la medida.
 * (21-oct) Lo que el dueño dice del estado de una sede («por abrir», «ya abrió», «cerrada») se guarda TAMBIÉN como dato de esa sede (`campo = estado_de_la_sede`, fuente `dueno`, con su cita en `fuente_ref`):
 *   así `leerSedes`, el resumen y cualquier lector lo ven igual. Una respuesta nueva se suma como fila más nueva; la anterior no se borra.
 * El estado sale de tres lugares, del más explícito al menos (el primero que dice algo sobre la sede manda):
 *   1 · la ficha del cliente: `config.apify.sedes_estado = { "<clave de sede>": "por_abrir" | "abierta" }`;
 *   2 · un dato de la sede: `client_sede_datos` con campo `estado` (o `apertura`) y un valor como «por abrir»;
 *   3 · lo que dijo el dueño: la ficha vigente más nueva `dato_del_dueno` con `datos.tema_norm = apertura-sede` para esa sede; su respuesta se lee con `estadoDeApertura`.
 * Puro: no lee nada; quien llama le da lo que ya leyó.
 */
import { normalizar } from '../manual/texto'

export type EstadoDeSede = 'por_abrir' | 'abierta' | 'cerrada'

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const txt = (v: unknown): string => (typeof v === 'string' ? v : '')

const POR_ABRIR = /\b(sin abrir|por abrir|aun no (ha )?(abre|abierto|abrio|abrimos|abrieron|opera|atiende)|todavia no (ha )?(abre|abierto|abrio|abrimos|abrieron|opera|atiende)|no (ha|hemos) abierto|no (esta|estamos) abiert[oa]s?|no abre aun|no abrimos aun|abrira|abriremos|abre (el|en|a partir)|proxima apertura|proximamente|en construccion|en obra|sin inaugurar|aun sin apertura|apertura (prevista|programada|pendiente))\b/
/** «cerrada» a secas solo vale si no habla de días ni horas (cerrada los martes es un horario, no un estado) */
const CERRADA_FIRME = /\b(cerrad[oa]s? (definitivamente|para siempre|permanentemente)|cerro (definitivamente|para siempre)|cierre definitivo|ya no (abre|opera|atiende|existe)|cerramos (la sede|definitivamente)|cerraron (la sede|definitivamente))\b/
const CERRADA = /\b(cerrad[oa]s?|cerro|cerramos|cerraron)\b/
const DIA_U_HORA = /\b(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?|dias?|horas?|desde|hasta|los|las|fines? de semana|feriados?)\b/
const ABIERTA = /\b(ya (ha )?abrio|ya (esta|estamos) abiert[oa]s?|ya abrimos|ya atiende|ya atendemos|abrio (el|en|hace)|abierta al publico|funcionando|operando|inaugurad[oa])\b/

/** lo que dice un texto libre sobre la apertura de una sede; `null` si no dice nada claro */
export function estadoDeApertura(texto: string): EstadoDeSede | null {
  const t = normalizar(texto)
  if (!t) return null
  if (ABIERTA.test(t) && !POR_ABRIR.test(t)) return 'abierta'
  if (POR_ABRIR.test(t)) return 'por_abrir'
  if (CERRADA_FIRME.test(t) || (CERRADA.test(t) && !DIA_U_HORA.test(t))) return 'cerrada'
  return null
}

/** el campo de `client_sede_datos` donde vive el estado (la base solo admite este; los otros dos nombres se leen por compatibilidad) */
export const CAMPO_DEL_ESTADO = 'estado_de_la_sede'
const CAMPOS_DE_ESTADO = new Set(['estado', 'apertura', 'estado de la sede'])
/** cómo se escribe el estado en el dato de la sede */
export const textoDeEstado = (e: EstadoDeSede): string => (e === 'por_abrir' ? 'por abrir' : e === 'cerrada' ? 'cerrada' : 'abierta')
/** ¿el tema que preguntó la oficina habla del estado de una sede? (solo entonces lo que responde el dueño cuenta como estado) */
export const esTemaDeEstadoDeSede = (tema: string): boolean => /\b(apertura|abrir|abierta|abierto|abrio|estado|inauguracion|inaugurar|cierre|cerrada|cerrado|funcionando|operando)\b/.test(normalizar(tema))
/** la sede (o sedes) que nombra un texto, por su clave o su ciudad; solo si nombra EXACTAMENTE una se sabe de cuál habla */
export function sedeQueNombra(texto: string, sedes: Array<{ clave: string; ciudad?: string | null }>): string | null {
  const t = ` ${normalizar(texto)} `
  const halladas = sedes.filter((s) => [s.clave, s.ciudad ?? ''].map((x) => normalizar(x)).filter((x) => x.length >= 3).some((x) => t.includes(` ${x} `)))
  return halladas.length === 1 ? halladas[0].clave : null
}

const estadoDeValor = (v: unknown): EstadoDeSede | null => {
  const t = normalizar(txt(v)).replace(/_/g, ' ')
  if (!t) return null
  if (t === 'por abrir' || t === 'sin abrir' || t === 'proxima' || t === 'cerrada por apertura') return 'por_abrir'
  if (t === 'abierta' || t === 'abierto' || t === 'activa') return 'abierta'
  if (t === 'cerrada' || t === 'cerrado') return 'cerrada'
  return estadoDeApertura(t)
}

export interface EntradaDeEstadoDeSedes {
  config?: unknown
  /** fichas del cerebro del cliente (solo importan las `dato_del_dueno` de apertura) */
  fichasDelDueno?: Array<{ clase?: string | null; observado_en?: string | null; retirada_en?: string | null; provenance_tag?: unknown }>
  /** filas de `client_sede_datos` con la clave de la sede ya resuelta */
  datosDeSede?: Array<{ clave: string; campo?: string | null; valor_texto?: string | null; observado_en?: string | null }>
}

/** sede → estado, solo para las sedes de las que algo se sabe */
export function estadoDeLasSedes(e: EntradaDeEstadoDeSedes): Map<string, EstadoDeSede> {
  const out = new Map<string, EstadoDeSede>()
  // 3 · lo que dijo el dueño (la más nueva por sede)
  const nuevas = new Map<string, { en: string; estado: EstadoDeSede }>()
  for (const f of e.fichasDelDueno ?? []) {
    if (f.clase !== 'dato_del_dueno' || f.retirada_en) continue
    const d = obj(obj(f.provenance_tag).datos)
    if (txt(d.tema_norm) !== 'apertura-sede') continue
    const estado = estadoDeApertura(txt(d.respuesta))
    if (!estado) continue
    const sedes = Array.isArray(d.sedes) && d.sedes.length ? (d.sedes as unknown[]).map(txt) : [txt(d.sede)]
    const en = String(f.observado_en ?? '')
    for (const s of sedes.filter(Boolean)) { const a = nuevas.get(s); if (!a || en >= a.en) nuevas.set(s, { en, estado }) }
  }
  for (const [s, v] of nuevas) out.set(s, v.estado)
  // 2 · un dato de la sede (el más nuevo por sede)
  const ds = new Map<string, { en: string; estado: EstadoDeSede }>()
  for (const r of e.datosDeSede ?? []) {
    const campo = normalizar(txt(r.campo)).replace(/_/g, ' ')
    if (!CAMPOS_DE_ESTADO.has(campo)) continue
    const estado = estadoDeValor(r.valor_texto)
    if (!estado) continue
    const en = String(r.observado_en ?? '')
    const a = ds.get(r.clave); if (!a || en >= a.en) ds.set(r.clave, { en, estado })
  }
  for (const [s, v] of ds) out.set(s, v.estado)
  // 1 · la ficha del cliente manda
  const cfg = obj(obj(obj(e.config).apify).sedes_estado)
  for (const [s, v] of Object.entries(cfg)) { const estado = estadoDeValor(v); if (estado) out.set(s, estado) }
  return out
}

export const sedesPorAbrir = (e: EntradaDeEstadoDeSedes): Set<string> => new Set([...estadoDeLasSedes(e)].filter(([, v]) => v === 'por_abrir').map(([k]) => k))

/** ¿esta línea habla del horario o de la atención de la sede? (lo que NO vale mientras la sede está por abrir) */
export const esLineaDeHorarioOAtencion = (linea: string): boolean => /\b(abiert[oa]s?|abre|abren|cierra|cierran|cerrad[oa]s?|horarios?|atiende|atienden|atencion|de lunes|hasta las|24 ?h|24 horas)\b/.test(normalizar(linea))

export const sedesCerradas = (e: EntradaDeEstadoDeSedes): Set<string> => new Set([...estadoDeLasSedes(e)].filter(([, v]) => v === 'cerrada').map(([k]) => k))

export const ROTULO_POR_ABRIR = 'por abrir'
export const ROTULO_CERRADA = 'cerrada'
export const AVISO_DE_HORARIO_CERRADA = 'sede cerrada: no atiende al público'
export const AVISO_DE_HORARIO_POR_ABRIR = 'sede por abrir: todavía no atiende al público'
