/**
 * EL CAMINO DE VERSIONES DEL PLAN (diseño v4 §5.1 + correcciones de CC#3) · puro: sin red ni base.
 *   A = el plan original (siempre se guarda primero y nunca se pierde) · B = la corrección (si `jefe-marketing` dejó ficha que bloquea) · C = la decisión (si el redactor tomó algo de GPT; final).
 * «Mejor versión aceptable» (corrección 2 de CC#3): se evalúa cada versión contra la ANTERIOR ACEPTADA y se adopta la mejor que pase (C, si no B, si no A).
 *   Una versión pasa si NO tiene más marcas de código que la anterior aceptada y NO es más corta de lo razonable (≥ 60 % del largo de A: número de seguridad propuesto, a medir en el seco).
 *   `con_desacuerdo` si no se adoptó la última versión producida. Casos de seco: «B mejora y C empeora» → B; «C pasa contra A pero es peor que B» → B.
 * Guardas (sin abrir la puerta a duplicados): G3 ninguna versión abre otra revisión · G4/G7 `version_de` ENCADENADO, a lo sumo una hija por padre y a lo sumo 3 versiones ·
 * G5 el predecesor se marca `reemplazado_por` solo DESPUÉS de guardar su sucesora, y leyendo/reescribiendo el objeto `provenance_tag` COMPLETO (no se pierde rastro).
 */
import type { Marcas, Resultado } from './contrato'

export type Etiqueta = 'A' | 'B' | 'C'
export const ETIQUETAS: readonly Etiqueta[] = ['A', 'B', 'C']
export const MAXIMO_DE_VERSIONES = 3
export const PORCENTAJE_MINIMO_DEL_LARGO = 0.6

export const etiquetaDeVersion = (version: number): Etiqueta => ETIQUETAS[Math.min(Math.max(version, 1), MAXIMO_DE_VERSIONES) - 1]

/** lo que la planeación mide con SUS chequeos por código (los mismos de hoy) sobre cada versión */
export interface EvaluacionDeVersion { etiqueta: Etiqueta; marcas: number; largo: number }

export interface Adopcion {
  adoptada: Etiqueta
  /** la última versión PRODUCIDA (la que se habría adoptado si todas pasan) */
  ultima: Etiqueta
  adoptoLaUltima: boolean
  /** versiones que pasaron (A siempre) */
  aceptadas: Etiqueta[]
  razones: Array<{ etiqueta: Etiqueta; pasa: boolean; contra: Etiqueta; motivo: string }>
}

export function elegirVersion(evaluaciones: EvaluacionDeVersion[]): Adopcion {
  const por = new Map<Etiqueta, EvaluacionDeVersion>()
  for (const e of evaluaciones) {
    if (!ETIQUETAS.includes(e.etiqueta)) throw new Error(`etiqueta «${String(e.etiqueta)}» no válida`)
    if (por.has(e.etiqueta)) throw new Error(`la versión ${e.etiqueta} viene repetida`)
    if (!Number.isFinite(e.marcas) || e.marcas < 0 || !Number.isFinite(e.largo) || e.largo < 0) throw new Error(`la versión ${e.etiqueta} trae marcas o largo no válidos`)
    por.set(e.etiqueta, e)
  }
  const a = por.get('A')
  if (!a) throw new Error('falta la versión A (el plan original) entre las evaluadas')
  if (a.largo <= 0) throw new Error('la versión A no puede tener largo 0')
  let previa: EvaluacionDeVersion = a
  const aceptadas: Etiqueta[] = ['A']
  const razones: Adopcion['razones'] = []
  let ultima: Etiqueta = 'A'
  for (const et of ['B', 'C'] as const) {
    const x = por.get(et)
    if (!x) continue
    ultima = et
    const minimo = a.largo * PORCENTAJE_MINIMO_DEL_LARGO
    const masMarcas = x.marcas > previa.marcas
    const corta = x.largo < minimo
    const pasa = !masMarcas && !corta
    razones.push({ etiqueta: et, pasa, contra: previa.etiqueta, motivo: pasa ? `${x.marcas} marca(s) ≤ ${previa.marcas} de ${previa.etiqueta} y largo ${x.largo} ≥ ${Math.ceil(minimo)}` : [masMarcas ? `${x.marcas} marca(s) > ${previa.marcas} de ${previa.etiqueta}` : '', corta ? `largo ${x.largo} < ${Math.ceil(minimo)} (60 % de A)` : ''].filter(Boolean).join(' · ') })
    if (pasa) { previa = x; aceptadas.push(et) }
  }
  return { adoptada: previa.etiqueta, ultima, adoptoLaUltima: previa.etiqueta === ultima, aceptadas, razones }
}

export interface FilaExistente { id: string; version_de: string | null }
export interface GuardarVersion {
  etiqueta: 'B' | 'C'
  /** número de versión en la cadena (B = 2; C = 3, o 2 si no hubo B) */
  version: 2 | 3
  version_de: Etiqueta
  /** si la hija de ese padre ya existe (se reejecutó la planeación), se reutiliza: NO se inserta otra (G4) */
  reutilizar_id?: string
}
export interface PlanDeGuardado {
  /** en orden: B antes que C, para que «el más reciente» sea la versión final */
  guardar: GuardarVersion[]
  /** la última fila de la cadena (la vigente) */
  vigente: Etiqueta
  /** marcar `reemplazado_por` DESPUÉS de guardada la sucesora: leer el objeto `provenance_tag`, añadir, escribir COMPLETO */
  reemplazos: Array<{ de: Etiqueta; por: 'B' | 'C' }>
  /** versiones producidas que NO se guardan como fila (quedan solo en la traza) */
  solo_en_la_traza: Etiqueta[]
}

/**
 * Qué guardar, en qué orden y qué marcar, dada la adopción. `idDeA` = id de la fila A (ya guardada); `existentes` = filas del plan del cliente con su `version_de` (para no duplicar: G4/G7).
 * Si lo adoptado es A no se guarda nada. Si B no pasó pero C sí, C cuelga directo de A (la cadena salta a B, que queda en la traza).
 */
export function planDeGuardado(adopcion: Adopcion, o: { idDeA: string; existentes: FilaExistente[]; produjo: Etiqueta[] }): PlanDeGuardado {
  const traza = o.produjo.filter((e) => e !== 'A' && !adopcion.aceptadas.includes(e))
  if (adopcion.adoptada === 'A') return { guardar: [], vigente: 'A', reemplazos: [], solo_en_la_traza: traza }
  const hijaDe = (padreId: string) => o.existentes.find((f) => f.version_de === padreId)?.id
  const guardar: GuardarVersion[] = []
  const reemplazos: PlanDeGuardado['reemplazos'] = []
  let padre: Etiqueta = 'A'
  let padreId: string | undefined = o.idDeA
  let version = 2
  for (const et of ['B', 'C'] as const) {
    if (!adopcion.aceptadas.includes(et)) continue
    const ya: string | undefined = padreId ? hijaDe(padreId) : undefined
    guardar.push({ etiqueta: et, version: version as 2 | 3, version_de: padre, ...(ya ? { reutilizar_id: ya } : {}) })
    reemplazos.push({ de: padre, por: et })
    padre = et
    padreId = ya
    version += 1
    if (et === adopcion.adoptada) break
  }
  if (version - 1 > MAXIMO_DE_VERSIONES) throw new Error(`la cadena pasaría de ${MAXIMO_DE_VERSIONES} versiones (G7)`)
  return { guardar, vigente: adopcion.adoptada, reemplazos, solo_en_la_traza: traza }
}

/** tras elegir: si no se adoptó la última versión producida, el resultado pasa a `con_desacuerdo` (nunca mejora un resultado: una `fallida` o una `incompleta_por_tope` siguen así) */
export function resultadoTrasElegir(actual: { resultado: Resultado; marcas: Marcas }, adoptoLaUltima: boolean): { resultado: Resultado; marcas: Marcas } {
  if (adoptoLaUltima) return actual
  const marcas = { ...actual.marcas, con_desacuerdo: true }
  const resultado: Resultado = actual.resultado === 'fallida' || actual.resultado === 'incompleta_por_tope' ? actual.resultado : 'con_desacuerdo'
  return { resultado, marcas }
}

/**
 * CONDICIÓN 2 de CC#3 · el `provenance_tag` de `client_historical_outputs` se escribe COMPLETO. PostgREST reemplaza la columna jsonb entera (no la mezcla) y la tabla exige las claves `type` y `trust_level`:
 * mandar solo `{reemplazado_por}` pierde el rastro de la fila (y la base lo rechazaría con 23514 dejando dos planes vigentes). Estas funciones reciben el objeto ACTUAL, le añaden lo suyo y devuelven el objeto entero;
 * se niegan a trabajar con uno incompleto (no se escribe un objeto parcial). No mutan lo que reciben.
 */
const esObjetoPlano = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
function exigirTagCompleto(tag: unknown, quien: string): Record<string, unknown> {
  if (!esObjetoPlano(tag)) throw new Error(`${quien}: el provenance_tag actual no es un objeto: se LEE la fila antes de escribir`)
  for (const k of ['type', 'trust_level'] as const) if (typeof tag[k] !== 'string' || (tag[k] as string).trim() === '') throw new Error(`${quien}: al provenance_tag le falta «${k}» (sin él la base rechaza la escritura con 23514 y la fila quedaría sin marca): no se escribe un objeto parcial`)
  return tag
}

/** marca una versión como reemplazada: `reemplazado_por` + `reemplazado_en` sobre el objeto ENTERO. Una versión no se reemplaza dos veces (G7); repetir la misma marca es idempotente y conserva su hora. */
export function provenanceConReemplazo(actual: unknown, o: { por: string; en: string }): Record<string, unknown> {
  const tag = exigirTagCompleto(actual, 'marcar el reemplazo')
  if (typeof o.por !== 'string' || o.por.trim() === '') throw new Error('marcar el reemplazo: falta el id de la versión que la reemplaza')
  const previo = tag.reemplazado_por
  if (typeof previo === 'string' && previo !== '') {
    if (previo !== o.por) throw new Error(`marcar el reemplazo: esta versión ya fue reemplazada por ${previo}; una versión no se reemplaza dos veces (G7)`)
    return { ...tag }
  }
  return { ...tag, reemplazado_por: o.por, reemplazado_en: o.en }
}

/** el `provenance_tag` de una versión NUEVA (B o C): hereda lo de la fila de partida (incluidos `type` y `trust_level`, que la base exige) y añade su cadena `version_de` */
export function provenanceDeVersionNueva(tagDePartida: unknown, o: { etiqueta: 'B' | 'C'; version: 2 | 3; version_de: string; jefatura_revision_id: string }): Record<string, unknown> {
  const tag = exigirTagCompleto(tagDePartida, 'armar la versión nueva')
  if (typeof o.version_de !== 'string' || o.version_de.trim() === '') throw new Error('armar la versión nueva: falta version_de (la fila de la que sale)')
  if (typeof o.jefatura_revision_id !== 'string' || o.jefatura_revision_id.trim() === '') throw new Error('armar la versión nueva: falta la revisión que la produjo')
  if (o.version > MAXIMO_DE_VERSIONES) throw new Error(`armar la versión nueva: la cadena no pasa de ${MAXIMO_DE_VERSIONES} versiones (G7)`)
  const { reemplazado_por: _a, reemplazado_en: _b, ...resto } = tag
  void _a; void _b
  return { ...resto, etiqueta: o.etiqueta, version: o.version, version_de: o.version_de, jefatura_revision_id: o.jefatura_revision_id, reentrega: 'version_nueva' }
}

/** G3 · «sin otra vuelta»: una versión producida por la jefatura NUNCA abre otra revisión */
export const esProductoDeUnaRevision = (generado_por_jefatura: string | null | undefined): boolean => typeof generado_por_jefatura === 'string' && generado_por_jefatura.trim() !== ''
