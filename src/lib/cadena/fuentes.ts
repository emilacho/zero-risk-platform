/**
 * Jerarquía de fuentes (diseño v2 §4 + condición 4 de CC#3) · función pura.
 *
 *   F0  lo firmado por Emilio en el alta: fichas con `firmada`. Sostiene TODO.
 *   F1  el manual vigente y el plan. (CC#3 cond. 4: el manual NO es F0: lo escribe la agencia a partir de un cerebro
 *       100 % no confiable; sostiene tono, vocabulario, prohibidos y segmentos, y hechos solo con cita literal.)
 *   F2  fichas vigentes sin firma y observaciones de sede por fuente (sitio > instagram > mapas).
 *   F3  trozos del cerebro. `untrusted`/`unknown` NUNCA sostienen un dato: solo corroboran o proponen un candidato.
 *   F4  nada: PENDIENTE (la FILA sale o se cambia; no se pregunta al cliente).
 */
import { citaAparece, normalizar } from './texto'
import { diasEntre } from './fechas'
import type { Clase, Nivel, Referencia } from './tipos'

export interface NivelEfectivo {
  nivel: Nivel
  /** ¿puede sostener un dato por sí sola? (falso para trozos no confiables y fichas retiradas) */
  sostiene: boolean
  firmada: boolean
}

export function nivelEfectivo(ref: Referencia): NivelEfectivo {
  switch (ref.origen) {
    case 'ficha':
      if (ref.vigente === false) return { nivel: 'F2', sostiene: false, firmada: false }
      return ref.firmada ? { nivel: 'F0', sostiene: true, firmada: true } : { nivel: 'F2', sostiene: true, firmada: false }
    case 'manual':
    case 'plan':
      return { nivel: 'F1', sostiene: true, firmada: false }
    case 'sede_datos':
      return { nivel: 'F2', sostiene: true, firmada: false }
    case 'trozo':
      return { nivel: 'F3', sostiene: ref.confianza === 'system_trusted' || ref.confianza === 'tenant_trusted', firmada: false }
  }
}

const FUERZA_NIVEL: Record<Nivel, number> = { F0: 4, F1: 3, F2: 2, F3: 1 }
const FUERZA_FUENTE: Record<string, number> = { sitio: 3, instagram: 2, mapas: 1 }

export function fuerza(ref: Referencia): number {
  const n = nivelEfectivo(ref)
  return FUERZA_NIVEL[n.nivel] * 10 + (ref.fuente ? FUERZA_FUENTE[ref.fuente] ?? 0 : 0)
}

export type Aviso = 'no_firmado' | 'viejo'
export interface Alcanza { ok: boolean; razon: string; avisos: Aviso[] }

/**
 * ¿Esta referencia alcanza para sostener `valor` con esta clase de riesgo? (§4.2)
 * El valor debe aparecer en el texto de la referencia (comprobación literal normalizada) salvo en la clase baja.
 */
export function alcanza(clase: Clase, ref: Referencia, valor: string, ahora?: string): Alcanza {
  const n = nivelEfectivo(ref)
  const avisos: Aviso[] = []
  if (ref.observado_en && ahora && diasEntre(ref.observado_en.slice(0, 10), ahora) > 90) avisos.push('viejo')
  if (clase === 'bajo') return { ok: true, razon: 'riesgo bajo', avisos }
  if (!n.sostiene) {
    return { ok: false, razon: `la referencia (${ref.origen}${ref.confianza ? ' ' + ref.confianza : ''}) no sostiene un dato por sí sola`, avisos }
  }
  if (!citaAparece(ref.texto, valor) && !normalizar(ref.texto).includes(normalizar(valor))) {
    return { ok: false, razon: 'el valor no aparece en la referencia', avisos }
  }
  if (clase === 'medio') return { ok: true, razon: 'riesgo medio: F0–F2 o F3 confiable', avisos }
  // riesgo alto
  if (n.nivel === 'F0') return { ok: true, razon: 'F0', avisos }
  if (n.nivel === 'F1') return { ok: true, razon: 'F1 con cita literal comprobada', avisos }
  if (n.nivel === 'F2' && (ref.origen === 'ficha' || ref.origen === 'sede_datos')) {
    return { ok: true, razon: 'F2 con ficha/observación vigente', avisos: [...avisos, 'no_firmado'] }
  }
  return { ok: false, razon: 'un dato de riesgo alto necesita F0, F1 con cita, o una ficha/observación vigente (no un trozo)', avisos }
}

export type ChoqueId = 'C01' | 'C02' | 'C03' | 'C04'
export interface Choque { id: ChoqueId; detalle: string }
export interface Candidato { valor: string; ref: Referencia }
export type EstadoDato = 'ok' | 'conflicto' | 'sin_respaldo'
export interface DatoResuelto {
  estado: EstadoDato
  valor: string | null
  nivel: Nivel | null
  ref: string | null
  clase: Clase
  choques: Choque[]
  /** candidato visto sin respaldo (p. ej. solo en un trozo no confiable): no sostiene nada. */
  candidato: string | null
  avisos: Aviso[]
}

/**
 * Qué hace el validador cuando dos fuentes chocan (C01–C04):
 *  C04  una referencia de una sede ajena al cliente (el homónimo) se DESCARTA antes de usarla.
 *  C01  mismo dato, valores distintos, niveles distintos → gana el nivel más alto.
 *  C02  mismo nivel, valores distintos → riesgo alto: `conflicto` (la fila queda en investigación); medio/bajo: la fuente más fuerte con aviso.
 *  (C03, el plan contra el alta, lo resuelve el validador del calendario: gana F0.)
 */
export function resolverDato(candidatos: Candidato[], clase: Clase, sedesDelCliente: readonly string[], ahora?: string): DatoResuelto {
  const choques: Choque[] = []
  const vivos: Candidato[] = []
  for (const c of candidatos) {
    if (c.ref.sede != null && !sedesDelCliente.includes(c.ref.sede)) {
      choques.push({ id: 'C04', detalle: `la referencia ${c.ref.id} es de la sede «${c.ref.sede}», que no es del cliente: descartada` })
      continue
    }
    vivos.push(c)
  }
  const sostienen = vivos.filter((c) => alcanza(clase, c.ref, c.valor, ahora).ok)
  const base: DatoResuelto = { estado: 'sin_respaldo', valor: null, nivel: null, ref: null, clase, choques, candidato: null, avisos: [] }
  if (sostienen.length === 0) {
    base.candidato = vivos[0]?.valor ?? null
    return base
  }
  const grupos = new Map<string, Candidato[]>()
  for (const c of sostienen) {
    const k = normalizar(c.valor)
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }
  const mejorDe = (cs: Candidato[]) => cs.slice().sort((a, b) => fuerza(b.ref) - fuerza(a.ref))[0]
  const mejores = [...grupos.values()].map(mejorDe).sort((a, b) => fuerza(b.ref) - fuerza(a.ref))
  const ganador = mejores[0]
  if (mejores.length > 1) {
    const [a, b] = mejores
    const na = nivelEfectivo(a.ref).nivel, nb = nivelEfectivo(b.ref).nivel
    if (na !== nb) {
      choques.push({ id: 'C01', detalle: `«${a.valor}» (${na}) contra «${b.valor}» (${nb}): gana el nivel más alto` })
    } else if (clase === 'alto') {
      choques.push({ id: 'C02', detalle: `«${a.valor}» contra «${b.valor}», mismo nivel ${na}, riesgo alto: no se elige` })
      return { ...base, estado: 'conflicto', candidato: a.valor }
    } else {
      choques.push({ id: 'C02', detalle: `«${a.valor}» contra «${b.valor}», mismo nivel ${na}: se usa la fuente más fuerte con aviso` })
    }
  }
  const al = alcanza(clase, ganador.ref, ganador.valor, ahora)
  return { ...base, estado: 'ok', valor: ganador.valor, nivel: nivelEfectivo(ganador.ref).nivel, ref: ganador.ref.id, avisos: al.avisos }
}

/**
 * Duda de modelado de CC#3 (§3 pregunta 4): dos «sedes» con el mismo teléfono o el mismo nombre normalizado pueden ser
 * la misma sede duplicada (la ficha de Mapas de un homónimo). Devuelve los pares sospechosos; es un AVISO para investigar, no una pregunta al cliente.
 */
export function sedesSospechosas(sedes: readonly { clave: string; nombre?: string; telefono?: string | null }[]): [string, string, string][] {
  const out: [string, string, string][] = []
  for (let i = 0; i < sedes.length; i++) {
    for (let j = i + 1; j < sedes.length; j++) {
      const a = sedes[i], b = sedes[j]
      if (a.telefono && b.telefono && a.telefono.replace(/\D/g, '') === b.telefono.replace(/\D/g, '')) out.push([a.clave, b.clave, 'mismo teléfono'])
      else if (a.nombre && b.nombre && normalizar(a.nombre) === normalizar(b.nombre)) out.push([a.clave, b.clave, 'mismo nombre'])
    }
  }
  return out
}
