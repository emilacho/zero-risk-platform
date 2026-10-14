/**
 * FILTRAR · «¿es el cliente y es nuevo?» · TRES COMPUERTAS en orden, TODO CÓDIGO (US$ 0). El modelo solo entra después, y solo para lo `sin_confirmar`.
 *   1. NUEVO: la huella de la unidad ya se vio ⇒ `repetida` (solo se renueva «última vez»). Lo transitorio («abierto ahora», «volvé a las 9») ⇒ `ruido`.
 *   2. ES DEL CLIENTE: lo que sale de SU sitio, SU cuenta o SU ficha ya viene confirmado (`autoria: propia`). Lo de un TERCERO exige el nombre ENTERO
 *      (palabra por palabra, `coincidePorPalabra`) Y una segunda señal en el mismo texto (su ciudad, su cuenta, su dominio o su teléfono).
 *      Solo el nombre ⇒ `sin_confirmar` (homónimo posible: precedente Gualaceo). Sin el nombre ⇒ `ajeno`.
 *   3. VALE LA PENA: listas tipo «los 10 mejores…» que lo nombran al pasar, textos muy cortos ⇒ `ruido`.
 * PURO, agnóstico: nada de este archivo nombra un cliente, un lugar ni un rubro.
 */
import { coincidePorPalabra } from '../texto/coincidencia'
import { normalizar } from '../manual/texto'
import { analizarNombre } from '../fuentes-publicas/enlaces-propios'
import { esTransitoria, type Unidad } from './unidades'
import { TRANSITORIOS_COMUNES } from './datos'

export interface ContextoDelCliente {
  nombre: string
  /** ciudad, zona y país de la ficha */
  ubicacion: string[]
  /** usuarios de red propios (sin @) */
  handles: string[]
  /** dominios propios (sin www) */
  dominios: string[]
  telefonos: string[]
  /** palabras significativas del rubro del cliente (de su ficha) · sirven de contexto, nunca de identidad */
  rubro?: string[]
}
export type EstadoDeFiltro = 'propio' | 'sin_confirmar' | 'ajeno' | 'ruido' | 'repetida'
export interface Veredicto { estado: EstadoDeFiltro; motivo: string }

const RE_LISTA = /\b(los|las)? ?(\d{1,2}|diez|cinco|tres) (mejores|top|lugares|sitios|restaurantes|opciones|razones)\b|\btop ?\d{1,2}\b|\bmejores (lugares|sitios|opciones)\b/
const MIN_CARACTERES = 20
const digitos = (s: string): string => s.replace(/\D/g, '')

/** señales que el texto trae ADEMÁS del nombre, separadas por lo que prueban: la UBICACIÓN es contexto (otro negocio de la misma ciudad la comparte); la IDENTIDAD (cuenta, dominio, teléfono) es del cliente */
export interface Senales { ubicacion: string[]; identidad: string[]; rubro: string[] }
export function senalesDe(texto: string, ctx: ContextoDelCliente): Senales {
  const n = normalizar(texto)
  const s: Senales = { ubicacion: [], identidad: [], rubro: [] }
  for (const u of ctx.ubicacion) if (u && coincidePorPalabra(n, u)) { s.ubicacion.push(`ubicación «${u}»`); break }
  // la cuenta se busca TAL CUAL en el texto original (con su punto o guion bajo) y como palabra entera: «sonrisanorte» NO se confunde con el nombre «Sonrisa Norte»
  const crudo = String(texto).toLowerCase()
  for (const h of ctx.handles) {
    const hh = h.toLowerCase().replace(/^@/, '')
    if (hh && new RegExp('(^|[^a-z0-9._])@?' + hh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9_])').test(crudo)) { s.identidad.push(`cuenta @${h}`); break }
    // texto YA normalizado (sin puntos): la cuenta «naufrago.ec» queda «naufrago ec». Solo cuenta si la cuenta tiene separador (si no, es una sola palabra y se confundiría con el nombre)
    const hn = normalizar(hh)
    if (hn.includes(' ') && ` ${n.replace(/@/g, ' ').replace(/\s+/g, ' ')} `.includes(` ${hn} `)) { s.identidad.push(`cuenta @${h}`); break }
  }
  // el dominio se busca como SECUENCIA DE PALABRAS enteras («naufrago ec»): «naufrago.ecuador» ya no lo confirma por contener «naufragoec»
  const palabras = ` ${n.replace(/@/g, ' ').replace(/\s+/g, ' ').trim()} `
  for (const d of ctx.dominios) { const dn = normalizar(d); if (dn && palabras.includes(` ${dn} `)) { s.identidad.push(`dominio ${d}`); break } }
  const dg = digitos(texto)
  for (const t of ctx.telefonos) { const td = digitos(t); if (td.length >= 7 && dg.includes(td.slice(-8))) { s.identidad.push('teléfono propio'); break } }
  for (const r of new Set(ctx.rubro ?? [])) if (r && coincidePorPalabra(n, r)) s.rubro.push(r)
  return s
}
/** compatibilidad: todas las señales juntas */
export function segundasSenales(texto: string, ctx: ContextoDelCliente): string[] {
  const s = senalesDe(texto, ctx)
  return [...s.ubicacion, ...s.identidad]
}

/** un nombre de UNA sola palabra (tras quitar artículos y tipo de local) es un nombre COMÚN: lo comparten otros negocios, noticias y diccionarios («Náufrago», «Luna», «Brisa») */
export const MIN_PALABRAS_DE_RUBRO_PARA_CONFIRMAR = 2
export const nombreEsComun = (nombre: string | null | undefined): boolean => analizarNombre(nombre).nucleo.length <= 1

/**
 * ¿un texto de un TERCERO es SOBRE el cliente? Nombre ENTERO + segunda señal; y si el nombre es COMÚN la ciudad ya no basta (el homónimo de la misma ciudad la comparte):
 * hace falta una señal de IDENTIDAD (cuenta, dominio o teléfono) o ciudad + al menos 2 palabras de su rubro en el mismo texto. Lo demás es `sin_confirmar` (no se entrega).
 * Límite honesto: un homónimo del MISMO rubro y de la misma ciudad que repita 2 palabras del rubro puede pasar; solo la identidad lo descarta.
 */
export function esSobreElCliente(texto: string, ctx: ContextoDelCliente): Veredicto {
  if (!ctx.nombre || !coincidePorPalabra(texto, ctx.nombre)) return { estado: 'ajeno', motivo: 'no nombra al cliente por su nombre entero' }
  const s = senalesDe(texto, ctx)
  if (!nombreEsComun(ctx.nombre)) {
    const todas = [...s.ubicacion, ...s.identidad]
    return todas.length ? { estado: 'propio', motivo: `nombre entero + ${todas.join(', ')}` } : { estado: 'sin_confirmar', motivo: 'nombra al cliente pero sin ciudad, cuenta, dominio ni teléfono propios: podría ser un homónimo' }
  }
  if (s.identidad.length) return { estado: 'propio', motivo: `nombre común + identidad: ${s.identidad.join(', ')}` }
  if (s.ubicacion.length && s.rubro.length >= MIN_PALABRAS_DE_RUBRO_PARA_CONFIRMAR) return { estado: 'propio', motivo: `nombre común + ${s.ubicacion[0]} + rubro (${s.rubro.slice(0, 3).join(', ')})` }
  return { estado: 'sin_confirmar', motivo: 'el nombre es común: la ciudad sola no basta; falta cuenta, dominio o teléfono propios (o su rubro en el mismo texto)' }
}

export function filtrarUnidad(u: Unidad, ctx: ContextoDelCliente, vistas: ReadonlySet<string>, patrones: RegExp[] = TRANSITORIOS_COMUNES): Veredicto {
  // 1 · nuevo
  if (vistas.has(`${u.fuente}|${u.unidad_ref}|${u.huella}`)) return { estado: 'repetida', motivo: 'ya se vio con la misma huella' }
  if (esTransitoria(normalizar(u.texto), patrones)) return { estado: 'ruido', motivo: 'aviso de estado (transitorio)' }
  // 3 (barato, antes de pagar nada) · textos sin sustancia
  if (normalizar(u.texto).length < MIN_CARACTERES && u.clase_dato === 'acumula') return { estado: 'ruido', motivo: 'texto demasiado corto para decir algo' }
  // 2 · es del cliente
  if (u.autoria === 'propia') return { estado: 'propio', motivo: 'sale de su sitio, su cuenta o su ficha' }
  if (u.de_ficha_propia) return { estado: 'propio', motivo: 'voz de un tercero SOBRE su ficha o su publicación propia (confirmado por la fuente)' }
  if (RE_LISTA.test(normalizar(u.texto)) && normalizar(u.texto).split(' ').length > 120 && !segundasSenales(u.texto, ctx).length && coincidePorPalabra(u.texto, ctx.nombre)) return { estado: 'ruido', motivo: 'lista de «los mejores…» que solo lo nombra al pasar' }
  return esSobreElCliente(u.texto, ctx)
}

export interface ResultadoDelFiltro { propias: Unidad[]; sin_confirmar: Unidad[]; descartadas: Array<{ unidad: Unidad; estado: Exclude<EstadoDeFiltro, 'propio' | 'sin_confirmar'>; motivo: string }>; veredictos: Map<Unidad, Veredicto> }
export function filtrar(unidades: Unidad[], ctx: ContextoDelCliente, vistas: ReadonlySet<string>, patrones: RegExp[] = TRANSITORIOS_COMUNES): ResultadoDelFiltro {
  const r: ResultadoDelFiltro = { propias: [], sin_confirmar: [], descartadas: [], veredictos: new Map() }
  for (const u of unidades) {
    const v = filtrarUnidad(u, ctx, vistas, patrones)
    r.veredictos.set(u, v)
    if (v.estado === 'propio') r.propias.push(u)
    else if (v.estado === 'sin_confirmar') r.sin_confirmar.push(u)
    else r.descartadas.push({ unidad: u, estado: v.estado, motivo: v.motivo })
  }
  return r
}
