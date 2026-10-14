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
}
export type EstadoDeFiltro = 'propio' | 'sin_confirmar' | 'ajeno' | 'ruido' | 'repetida'
export interface Veredicto { estado: EstadoDeFiltro; motivo: string }

const RE_LISTA = /\b(los|las)? ?(\d{1,2}|diez|cinco|tres) (mejores|top|lugares|sitios|restaurantes|opciones|razones)\b|\btop ?\d{1,2}\b|\bmejores (lugares|sitios|opciones)\b/
const MIN_CARACTERES = 20
const digitos = (s: string): string => s.replace(/\D/g, '')

/** señales que el texto trae ADEMÁS del nombre */
export function segundasSenales(texto: string, ctx: ContextoDelCliente): string[] {
  const n = normalizar(texto)
  const hallazgos: string[] = []
  for (const u of ctx.ubicacion) if (u && coincidePorPalabra(n, u)) { hallazgos.push(`ubicación «${u}»`); break }
  for (const h of ctx.handles) if (h && n.includes(normalizar(h).replace(/ /g, ''))) { hallazgos.push(`cuenta @${h}`); break }
  for (const d of ctx.dominios) if (d && n.replace(/ /g, '').includes(normalizar(d).replace(/ /g, ''))) { hallazgos.push(`dominio ${d}`); break }
  const dg = digitos(texto)
  for (const t of ctx.telefonos) { const td = digitos(t); if (td.length >= 7 && dg.includes(td.slice(-8))) { hallazgos.push('teléfono propio'); break } }
  return hallazgos
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
  const nombreOk = !!ctx.nombre && coincidePorPalabra(u.texto, ctx.nombre)
  if (!nombreOk) return { estado: 'ajeno', motivo: 'no nombra al cliente por su nombre entero' }
  if (RE_LISTA.test(normalizar(u.texto)) && normalizar(u.texto).split(' ').length > 120 && !segundasSenales(u.texto, ctx).length) return { estado: 'ruido', motivo: 'lista de «los mejores…» que solo lo nombra al pasar' }
  const s = segundasSenales(u.texto, ctx)
  if (!s.length) return { estado: 'sin_confirmar', motivo: 'nombra al cliente pero sin ciudad, cuenta, dominio ni teléfono propios: podría ser un homónimo' }
  return { estado: 'propio', motivo: `nombre entero + ${s.join(', ')}` }
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
