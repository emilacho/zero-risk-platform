/**
 * R6 · «PROVISIONAL» VIAJA · y la PUERTA FINAL (S5). 03-nov, decisión de Emilio («quita esas reglas, para eso están mis observaciones»): la puerta NO toca el texto del manual; solo anota. PURO.
 *
 *  · `metaDeCampos` deja un estado en TODOS los campos de texto (también `positioning`, `icp_summary`…): {estado, provisional, pendientes}.
 *  · `camposFirmes(manual)` es lo que leen TODOS los lectores (planeación, el manual en limpio, la oficina, la cadena): un campo provisional NO es F0, entra como F2 con aviso.
 *  · `recomprobar` = S5 sobre el manual que devolvió el autor: devuelve el mismo texto con su `_field_meta`. Una cifra o una fecha sin fuente se anotan al campo; una palabra de certeza, un lugar o una cita, no.
 */
import { datosSinFuenteDe, ESTADOS_SIN_RESPALDO, esSoloDatoSinFuente, evaluarHechos, hojasDeTexto, tieneDatoSinFuente, type EntradaDeHechos, type Hecho, type InformeDeHechos } from './hechos'
import { palabrasDeclaradasEnUso, type PalabraAnotada } from './palabras-anotadas'

export type EstadoDeCampo = 'verificado' | 'afirmacion_del_cliente' | 'con_pendientes' | 'sin_hechos'
export interface MetaDeCampo { estado: EstadoDeCampo; provisional: boolean; pendientes: number; hechos: number }

const RE_PENDIENTE = /PENDIENTE:[^.;\n]*/g
const cuentaPendientes = (t: string): number => (t.match(RE_PENDIENTE) ?? []).length

// ───────────────────────── rutas («campo», «campo[2]», «campo.sub»)
const partesDeRuta = (ruta: string): Array<string | number> => [...ruta.matchAll(/([^.[\]]+)|\[(\d+)\]/g)].map((m) => (m[2] !== undefined ? Number(m[2]) : m[1]))
export function leerRuta(obj: unknown, ruta: string): unknown {
  let cur: unknown = obj
  for (const p of partesDeRuta(ruta)) { if (cur == null || typeof cur !== 'object') return undefined; cur = (cur as Record<string | number, unknown>)[p] }
  return cur
}
function ponerRuta<T>(obj: T, ruta: string, valor: unknown): T {
  const clon = JSON.parse(JSON.stringify(obj)) as Record<string | number, unknown>
  const ps = partesDeRuta(ruta)
  let cur: Record<string | number, unknown> = clon
  for (let i = 0; i < ps.length - 1; i++) { const n = cur[ps[i]]; if (n == null || typeof n !== 'object') return obj; cur = n as Record<string | number, unknown> }
  cur[ps[ps.length - 1]] = valor
  return clon as T
}

// ───────────────────────── R6
export function metaDeCampos(manual: Record<string, unknown>, informe: InformeDeHechos, excluir?: string[]): Record<string, MetaDeCampo> {
  const out: Record<string, MetaDeCampo> = {}
  const campos = [...new Set(hojasDeTexto(manual, excluir).map((h) => h.campo))]
  for (const campo of campos) {
    // 03-nov · una palabra de certeza, un lugar o una cita sin respaldo ya no cuentan: ni dejan el campo provisional ni se leen como «verificado»
    const hs = informe.hechos.filter((h) => h.campo === campo && (h.estado === 'con_duda' || !ESTADOS_SIN_RESPALDO.includes(h.estado) || tieneDatoSinFuente(h)))
    const texto = hojasDeTexto({ [campo]: manual[campo] }, []).map((h) => h.texto).join('\n')
    const pendientes = cuentaPendientes(texto) + hs.filter((h) => ESTADOS_SIN_RESPALDO.includes(h.estado)).length
    const estado: EstadoDeCampo = !hs.length && !pendientes ? 'sin_hechos' : pendientes ? 'con_pendientes' : hs.some((h) => h.estado === 'afirmacion_del_cliente') ? 'afirmacion_del_cliente' : 'verificado'
    out[campo] = { estado, provisional: pendientes > 0, pendientes, hechos: hs.length }
  }
  return out
}

/** escribe `_field_meta` para TODOS los campos de texto (conserva lo que ya traía cada campo y lo pisa con el estado nuevo) */
export function aplicarMeta<T extends Record<string, unknown>>(manual: T, informe: InformeDeHechos, excluir?: string[]): T & { _field_meta: Record<string, unknown> } {
  const previa = (manual._field_meta && typeof manual._field_meta === 'object' ? manual._field_meta : {}) as Record<string, Record<string, unknown>>
  const nueva = metaDeCampos(manual, informe, excluir)
  const merged: Record<string, unknown> = { ...previa }
  // lo que el dueño ve en el campo. Se recalcula en cada pasada: si el dato ya tiene fuente o salió del texto, su nota se va
  const datosDe = (c: string) => informe.hechos.filter((h) => h.campo === c).flatMap(datosSinFuenteDe)
  // 02-nov · lo propuesto sigue siendo propuesta tras la puerta, salvo que le queden pendientes: el dueño lo ve «por validar», no como dato
  for (const [c, m] of Object.entries(nueva)) merged[c] = { ...(previa[c] ?? {}), ...m, ...(previa[c]?.estado === 'propuesta_del_agente' && m.estado !== 'con_pendientes' ? { estado: 'propuesta_del_agente' } : {}), datos_sin_fuente: datosDe(c) }
  return { ...manual, _field_meta: merged }
}

export interface CamposFirmes { firmes: string[]; provisionales: string[]; sin_revisar: string[]; validados_por_el_dueno?: string[] }
/** lo que leen los lectores: firmes (F0 si el manual está aprobado) · provisionales (F2 con aviso) · sin revisar (manual anterior al ciclo: ni se firma ni se condena) */
export function camposFirmes(manual: Record<string, unknown>, excluir?: string[]): CamposFirmes {
  const meta = (manual._field_meta && typeof manual._field_meta === 'object' ? manual._field_meta : {}) as Record<string, Partial<MetaDeCampo> & { provisional?: boolean; aceptado_por_el_dueno?: { campo?: boolean } }>
  const out: CamposFirmes = { firmes: [], provisionales: [], sin_revisar: [] }
  for (const campo of new Set(hojasDeTexto(manual, excluir).map((h) => h.campo))) {
    const texto = hojasDeTexto({ [campo]: manual[campo] }, []).map((h) => h.texto).join('\n')
    const m = meta[campo]
    // 02-nov · lo que el dueño validó campo por campo se lista aparte: la clasificación no cambia, y quien lee en marketing decide con avisoDelManualConValidados
    if (m?.aceptado_por_el_dueno?.campo === true) (out.validados_por_el_dueno ??= []).push(campo)
    if (cuentaPendientes(texto) > 0 || m?.provisional === true || m?.estado === 'con_pendientes') out.provisionales.push(campo)
    else if (!m || (m.estado === undefined && m.provisional === undefined)) out.sin_revisar.push(campo)
    else out.firmes.push(campo)
  }
  return out
}

// ───────────────────────── la puerta final
export interface CambioDeCierre { ruta: string; de: string; a: string; por: 'retirada' | 'declaracion_del_cliente' | 'limpieza' }
export interface RetiradoDelManual { ruta: string; clausula: string; estado: Hecho['estado']; marca: string; motivo: string }
/** el autor no puede quitar un `PENDIENTE`: si falta en su versión, se vuelve a poner al final del mismo campo */
export function restituirPendientes<T extends Record<string, unknown>>(antes: Record<string, unknown>, despues: T): { manual: T; restituidos: Array<{ ruta: string; pendiente: string }> } {
  let cur = despues
  const restituidos: Array<{ ruta: string; pendiente: string }> = []
  for (const h of hojasDeTexto(antes, [])) {
    if (h.campo.startsWith('_')) continue
    for (const p of h.texto.match(RE_PENDIENTE) ?? []) {
      const ahora = leerRuta(cur, h.ruta)
      if (typeof ahora === 'string' ? ahora.includes(p) : false) continue
      // ¿el mismo pendiente sigue en otra parte del mismo campo?
      const campoTexto = hojasDeTexto({ [h.campo]: cur[h.campo] }, []).map((x) => x.texto).join('\n')
      if (campoTexto.includes(p)) continue
      if (typeof ahora === 'string') { cur = ponerRuta(cur, h.ruta, `${ahora.trimEnd()} ${p}`); restituidos.push({ ruta: h.ruta, pendiente: p }) }
      else { const raiz = cur[h.campo]; if (typeof raiz === 'string') { cur = { ...cur, [h.campo]: `${raiz.trimEnd()} ${p}` }; restituidos.push({ ruta: h.campo, pendiente: p }) } }
    }
  }
  return { manual: cur, restituidos }
}

export interface Recomprobacion {
  manual: Record<string, unknown>
  informe: InformeDeHechos
  /** lo que el autor dejó sin respaldo: sigue en el texto; la revisión es de Emilio */
  introducidos: Hecho[]
  cambios: CambioDeCierre[]
  /** siempre vacío desde el 03-nov: el flujo vivo del manual y el borrador leen esta lista */
  retirados: RetiradoDelManual[]
  /** true si el autor NO dejó nada sin respaldo */
  limpio: boolean
}
export const MOTIVO_DE_PALABRA_DECLARADA = 'usa una palabra declarada por una norma o por el dueño: revisa si corresponde'
/** 02-nov · firma de Emilio: la palabra declarada no quita texto, queda en las notas del campo, sin repetirse */
function anotarPalabras(manual: Record<string, unknown>, anotadas: PalabraAnotada[]): Record<string, unknown> {
  if (!anotadas.length) return manual
  const meta = { ...(manual._field_meta as Record<string, Record<string, unknown>> | undefined) }
  for (const a of anotadas) {
    const campo = a.ruta.split(/[.[]/)[0]
    const notas = Array.isArray(meta[campo]?.notas_del_juez) ? (meta[campo].notas_del_juez as Array<{ dato?: unknown }>) : []
    if (!notas.some((n) => n.dato === a.palabra)) meta[campo] = { ...meta[campo], notas_del_juez: [...notas, { dato: a.palabra, motivo: MOTIVO_DE_PALABRA_DECLARADA }] }
  }
  return { ...manual, _field_meta: meta }
}
/** S5 / S7: re-evalúa lo que devolvió el autor y anota. El texto sale igual que entró; el resultado ya lleva `_field_meta` de todos los campos. */
export function recomprobar(_antes: Record<string, unknown>, despues: Record<string, unknown>, entrada: Omit<EntradaDeHechos, 'manual'>): Recomprobacion {
  const informe = evaluarHechos({ ...entrada, manual: despues })
  const manual = anotarPalabras(aplicarMeta(despues, informe, entrada.excluir), palabrasDeclaradasEnUso(despues))
  return { manual, informe, introducidos: informe.sin_respaldo.filter((h) => h.estado !== 'con_duda' && !esSoloDatoSinFuente(h)), cambios: [], retirados: [], limpio: informe.sin_respaldo.every((h) => h.estado === 'con_duda' || esSoloDatoSinFuente(h)) }
}
