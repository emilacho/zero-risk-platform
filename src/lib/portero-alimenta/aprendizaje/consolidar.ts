/**
 * CONSOLIDAR (etapa 4) · PURO: de las notas vivas dice qué hacer, sin escribir nada.
 *   1. lo que no se usa pierde peso (semivida, con piso; nunca se borra);
 *   2. las parecidas (mismo espacio, destinatario, atributo, dirección y tema) se JUNTAN y suman su peso; las sobrantes se retiran con su motivo;
 *   3. un CHOQUE (mismo tema, dirección contraria, y alcances que se cruzan) lo gana la más específica y, a igual especificidad, la más nueva. En el mismo espacio la perdedora se retira con motivo;
 *      entre espacios distintos NO se retira (la general sigue valiendo para los demás clientes): se anota el choque y la consulta entrega solo la ganadora;
 *   4. una idea repetida en ≥ N rubros distintos sube a GENERAL (ficha nueva; las de industria y cliente quedan de respaldo).
 * Todos los umbrales vienen de `ParametrosDeAprendizaje` (dato).
 */
import { palabrasDelTema } from '../dueno'
import { ESPACIO_GENERAL, ESPECIFICIDAD, espacioDeIndustria, PARAMETROS_POR_OMISION, type Alcance, type Direccion, type ParametrosDeAprendizaje } from './datos'

export interface Nota {
  id: string
  espacio: string
  alcance: Alcance
  /** rubro (normalizado) del cliente de donde salió la nota */
  industria: string | null
  destinatario: string
  atributo: string
  sobre: string
  idea: string
  direccion: Direccion
  formato: string | null
  peso: number
  /** cuándo lo dijo el dueño */
  creada: string
  ultima_vez_usada: string | null
  /** cuándo se evaluó el peso por última vez */
  peso_al: string | null
  choca_con: string[]
}

export type Operacion =
  | { tipo: 'decaer'; id: string; peso: number }
  | { tipo: 'juntar'; sobrevive: string; retira: string[]; peso: number; motivo: string }
  | { tipo: 'retirar_por_choque'; id: string; gana: string; motivo: string }
  | { tipo: 'anotar_choque'; ids: [string, string] }
  | { tipo: 'promover_a_general'; de: string[]; industrias: string[]; peso: number; modelo: string }

const DIA_MS = 86_400_000
/** ¿dos temas son el mismo? (palabras significativas compartidas sobre las del más corto) */
export function mismoTema(a: string, b: string, minimo = PARAMETROS_POR_OMISION.parecido_minimo): boolean {
  const pa = palabrasDelTema(a), pb = palabrasDelTema(b)
  if (!pa.length || !pb.length) return false
  return pa.filter((p) => pb.includes(p)).length / Math.min(pa.length, pb.length) >= minimo
}
const mismoAsunto = (a: Nota, b: Nota, min: number): boolean => mismoTema(a.sobre, b.sobre, min) || mismoTema(a.idea, b.idea, min)
const mismaVia = (a: Nota, b: Nota): boolean => a.destinatario === b.destinatario && a.atributo === b.atributo
const dias = (desde: string | null, hasta: Date): number => (desde && !Number.isNaN(Date.parse(desde)) ? Math.max(0, (hasta.getTime() - Date.parse(desde)) / DIA_MS) : 0)

/** ¿se cruzan los alcances de dos notas? (el mismo espacio, o una de cliente con la de SU rubro o con la general) */
export function sealcanzan(a: Nota, b: Nota): boolean {
  if (a.espacio === b.espacio) return true
  const delCliente = (n: Nota) => n.alcance === 'cliente'
  const mia = (c: Nota, o: Nota): boolean => o.espacio === ESPACIO_GENERAL || (!!c.industria && o.espacio === espacioDeIndustria(c.industria))
  if (delCliente(a) && !delCliente(b)) return mia(a, b)
  if (delCliente(b) && !delCliente(a)) return mia(b, a)
  if (delCliente(a) && delCliente(b)) return false
  // industria vs general (o formato en general): se cruzan
  return a.espacio === ESPACIO_GENERAL || b.espacio === ESPACIO_GENERAL
}
/** de dos notas que chocan, cuál gana: la más específica y luego la más nueva */
export function gana(a: Nota, b: Nota): Nota {
  const ea = ESPECIFICIDAD[a.alcance] + (a.formato ? 0.5 : 0), eb = ESPECIFICIDAD[b.alcance] + (b.formato ? 0.5 : 0)
  if (ea !== eb) return ea > eb ? a : b
  return Date.parse(a.creada) >= Date.parse(b.creada) ? a : b
}

export function consolidar(notas: Nota[], ahora: Date, p: ParametrosDeAprendizaje = PARAMETROS_POR_OMISION): Operacion[] {
  const ops: Operacion[] = []
  const vivas = new Map<string, Nota>(notas.map((n) => [n.id, { ...n }]))

  // 1 · lo que no se usa pierde peso
  for (const n of vivas.values()) {
    const ancla = [n.ultima_vez_usada, n.peso_al, n.creada].filter((x): x is string => !!x).sort().pop() ?? n.creada
    const d = dias(ancla, ahora)
    if (d < 1) continue
    const peso = Math.max(p.piso_de_peso, Math.round(n.peso * Math.pow(0.5, d / p.semivida_dias) * 1e4) / 1e4)
    if (peso < n.peso - 1e-4) { ops.push({ tipo: 'decaer', id: n.id, peso }); n.peso = peso }
  }

  // 2 · juntar parecidas
  const lista = [...vivas.values()].sort((a, b) => (b.peso - a.peso) || (Date.parse(a.creada) - Date.parse(b.creada)) || a.id.localeCompare(b.id))
  const yaJuntada = new Set<string>()
  for (const a of lista) {
    if (yaJuntada.has(a.id)) continue
    const iguales = lista.filter((b) => b.id !== a.id && !yaJuntada.has(b.id) && b.espacio === a.espacio && mismaVia(a, b) && b.direccion === a.direccion && (b.formato ?? '') === (a.formato ?? '') && mismoAsunto(a, b, p.parecido_minimo))
    if (!iguales.length) continue
    for (const b of iguales) yaJuntada.add(b.id)
    const peso = Math.round((a.peso + iguales.reduce((s, b) => s + b.peso, 0)) * 1e4) / 1e4
    ops.push({ tipo: 'juntar', sobrevive: a.id, retira: iguales.map((b) => b.id), peso, motivo: `juntada con ${a.id}: la misma indicación dicha ${iguales.length + 1} veces (el peso se suma)` })
    a.peso = peso
    for (const b of iguales) vivas.delete(b.id)
  }

  // 3 · choques
  const sobrevivientes = [...vivas.values()].sort((a, b) => a.id.localeCompare(b.id))
  const retiradas = new Set<string>()
  for (let i = 0; i < sobrevivientes.length; i++) for (let j = i + 1; j < sobrevivientes.length; j++) {
    const a = sobrevivientes[i], b = sobrevivientes[j]
    if (retiradas.has(a.id) || retiradas.has(b.id)) continue
    if (!mismaVia(a, b) || a.direccion === b.direccion || !mismoAsunto(a, b, p.parecido_minimo) || !sealcanzan(a, b)) continue
    if (a.formato && b.formato && a.formato !== b.formato) continue
    const g = gana(a, b), perdedora = g.id === a.id ? b : a
    if (a.espacio === b.espacio) {
      retiradas.add(perdedora.id)
      ops.push({ tipo: 'retirar_por_choque', id: perdedora.id, gana: g.id, motivo: `choca con ${g.id} (${g.direccion === 'hacer' ? 'pide' : 'rechaza'} lo contrario): gana la ${ESPECIFICIDAD[a.alcance] === ESPECIFICIDAD[b.alcance] ? 'más nueva' : 'más específica'}` })
    } else if (!a.choca_con.includes(b.id) || !b.choca_con.includes(a.id)) ops.push({ tipo: 'anotar_choque', ids: [a.id, b.id] })
  }

  // 4 · repetida en ≥ N rubros → general
  const candidatas = sobrevivientes.filter((n) => !retiradas.has(n.id) && (n.alcance === 'cliente' || n.alcance === 'industria') && n.industria)
  const yaGeneral = sobrevivientes.filter((n) => n.espacio === ESPACIO_GENERAL && !retiradas.has(n.id))
  const tomada = new Set<string>()
  for (const a of candidatas) {
    if (tomada.has(a.id)) continue
    const grupo = candidatas.filter((b) => !tomada.has(b.id) && mismaVia(a, b) && b.direccion === a.direccion && (b.formato ?? '') === (a.formato ?? '') && mismoAsunto(a, b, p.parecido_minimo))
    const industrias = [...new Set(grupo.map((g) => g.industria as string))].sort()
    if (industrias.length < p.industrias_para_general) continue
    for (const g of grupo) tomada.add(g.id)
    if (yaGeneral.some((g) => mismaVia(a, g) && g.direccion === a.direccion && (g.formato ?? '') === (a.formato ?? '') && mismoAsunto(a, g, p.parecido_minimo))) continue
    ops.push({ tipo: 'promover_a_general', de: grupo.map((g) => g.id), industrias, peso: Math.round(grupo.reduce((s, g) => s + g.peso, 0) * 1e4) / 1e4, modelo: a.id })
  }
  return ops
}
