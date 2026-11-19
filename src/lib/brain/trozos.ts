/**
 * ENCARGO 11 · paso 2b (19-nov · «nada se recorta», dale de Emilio): el índice (`client_brain_chunks`) guarda el texto ENTERO.
 * Un texto que pasa del tope de un trozo va en trozos PAREJOS y seguidos (juntos son el original: ninguno se corta ni se pierde),
 * todos con la misma fuente (`source_table` + `source_id`) y su número en la etiqueta («<etiqueta> · trozo 2 de 3») y en `metadata`.
 * Al LEER, la búsqueda une los trozos de la misma fuente y entrega el texto completo (`unirTrozos`).
 * Mismo criterio que `portero-alimenta/puente.ts` (`trozosParejos`), que manda las fichas por la ruta de ingreso.
 */

/** trozos parejos de hasta `tope` caracteres que juntos son el texto ENTERO (sin `slice`: no es un corte, es una partición) */
export function trozosParejos(texto: string, tope: number): string[] {
  if (texto.length <= tope) return [texto]
  const tam = Math.ceil(texto.length / Math.ceil(texto.length / tope))
  return texto.match(new RegExp(`[\\s\\S]{1,${tam}}`, 'g')) ?? [texto]
}

const DE_UN_TROZO = /^(.*) · trozo (\d+) de (\d+)$/

export const etiquetaDeTrozo = (etiqueta: string, i: number, n: number): string => (n === 1 ? etiqueta : `${etiqueta} · trozo ${i + 1} de ${n}`)

/** de una etiqueta «X · trozo k de n» saca {etiqueta: X, k, n}; otra etiqueta → null */
export function leerEtiquetaDeTrozo(etiqueta: string): { etiqueta: string; k: number; n: number } | null {
  const m = DE_UN_TROZO.exec(etiqueta)
  if (!m) return null
  const k = Number(m[2]), n = Number(m[3])
  return k >= 1 && k <= n && n > 1 ? { etiqueta: m[1], k, n } : null
}

/** las secciones de un texto, listas para el índice: una si cabe; si no, sus trozos numerados (con `trozo` y `trozos` en metadata) */
export function seccionesEnTrozos<M extends Record<string, unknown>>(etiqueta: string, texto: string, tope: number, metadata?: M): Array<{ section_label: string; text: string; metadata?: M | (M & { trozo: number; trozos: number }) }> {
  const trozos = trozosParejos(texto, tope)
  if (trozos.length === 1) return [{ section_label: etiqueta, text: texto, ...(metadata ? { metadata } : {}) }]
  return trozos.map((t, i) => ({ section_label: etiquetaDeTrozo(etiqueta, i, trozos.length), text: t, metadata: { ...(metadata ?? ({} as M)), trozo: i + 1, trozos: trozos.length } }))
}

export interface ResultadoConTrozos { source_id: string; label: string; content_text: string; similarity: number; chunk_id?: string; source_table: string }
/** lee TODOS los trozos de una fuente (los que empiezan con «<etiqueta> · trozo ») */
export type LeerTrozos = (q: { source_table: string; source_id: string; etiqueta: string }) => Promise<Array<{ section_label: string; chunk_text: string }> | null>

/**
 * Al LEER: cada resultado que es un trozo se cambia por el texto ENTERO de su fuente (los n trozos unidos en orden); varios trozos de la misma
 * fuente quedan en UNO (el de mejor similitud, en su lugar). Si falta algún trozo (o no se pudo leer) NO se inventa: queda lo que llegó y se
 * declara `trozos_faltan`. `tablaReal` da el `source_table` con el que se guardó (los resultados lo traen sin el prefijo `client_`).
 */
export async function unirTrozos<R extends ResultadoConTrozos>(filas: R[], leer: LeerTrozos, tablaReal: (r: R) => string = (r) => r.source_table): Promise<Array<R & { trozos?: number; trozos_faltan?: number[] }>> {
  const vistos = new Set<string>()
  const out: Array<R & { trozos?: number; trozos_faltan?: number[] }> = []
  const orden = [...filas].sort((a, b) => b.similarity - a.similarity)
  const mejor = new Map<string, R>()
  for (const r of orden) {
    const t = leerEtiquetaDeTrozo(r.label)
    if (!t) continue
    const k = `${tablaReal(r)}|${r.source_id}|${t.etiqueta}`
    if (!mejor.has(k)) mejor.set(k, r)
  }
  for (const r of filas) {
    const t = leerEtiquetaDeTrozo(r.label)
    if (!t) { out.push(r); continue }
    const k = `${tablaReal(r)}|${r.source_id}|${t.etiqueta}`
    if (vistos.has(k)) continue
    vistos.add(k)
    const elegido = mejor.get(k) ?? r
    const todos = await leer({ source_table: tablaReal(r), source_id: r.source_id, etiqueta: t.etiqueta }).catch(() => null)
    const porNumero = new Map<number, string>()
    for (const x of todos ?? []) { const e = leerEtiquetaDeTrozo(x.section_label); if (e && e.etiqueta === t.etiqueta && e.n === t.n) porNumero.set(e.k, x.chunk_text) }
    const faltan = Array.from({ length: t.n }, (_v, i) => i + 1).filter((i) => !porNumero.has(i))
    if (faltan.length) { out.push({ ...elegido, trozos: t.n, trozos_faltan: faltan }); continue }
    out.push({ ...elegido, label: t.etiqueta, content_text: Array.from({ length: t.n }, (_v, i) => porNumero.get(i + 1)!).join(''), trozos: t.n })
  }
  return out
}

/** la etiqueta de la sección original de un trozo («X · trozo 2 de 3» → «X»; una etiqueta suelta es su propia base) */
export const baseDeEtiqueta = (etiqueta: string): string => leerEtiquetaDeTrozo(etiqueta)?.etiqueta ?? etiqueta

/**
 * TODO O NADA por sección original: si el filtro rechaza un trozo, NINGÚN trozo de esa sección se escribe (el índice nunca guarda media sección).
 * Devuelve las bases que quedan fuera (las que tienen al menos un trozo rechazado).
 */
export function basesConRechazo(etiquetas: string[], rechazada: (i: number) => boolean): Set<string> {
  const fuera = new Set<string>()
  etiquetas.forEach((e, i) => { if (rechazada(i)) fuera.add(baseDeEtiqueta(e)) })
  return fuera
}

/**
 * Los trozos VIEJOS de una fuente que hay que sacar tras escribir los nuevos: los de la misma sección original con otra partición
 * (antes «trozo k de 3», ahora «de 2»; o antes entera y ahora en trozos, o al revés). Las secciones con otra base no se tocan.
 */
export function trozosViejos(existentes: string[], nuevas: string[]): string[] {
  const ya = new Set(nuevas)
  const bases = new Set(nuevas.map(baseDeEtiqueta))
  return existentes.filter((e) => !ya.has(e) && bases.has(baseDeEtiqueta(e)))
}
