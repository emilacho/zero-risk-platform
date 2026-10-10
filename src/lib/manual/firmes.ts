/**
 * R6 · «PROVISIONAL» VIAJA · y la PUERTA FINAL (S5): lo que sigue sin respaldo se cierra como `PENDIENTE:` y el autor no puede deshacerlo. PURO.
 *
 *  · `metaDeCampos` deja un estado en TODOS los campos de texto (también `positioning`, `icp_summary`…): {estado, provisional, pendientes}.
 *  · `camposFirmes(manual)` es lo que leen TODOS los lectores (planeación, el manual en limpio, la oficina, la cadena): un campo provisional NO es F0, entra como F2 con aviso.
 *  · `cerrarPuerta` reemplaza SOLO la cláusula con la marca sin respaldo por `PENDIENTE: …` (el resto de la frase creativa se respeta) y escribe lo que el cliente dice de sí mismo
 *    como «el cliente dice: «…»» (firma D2).
 *  · `recomprobar` = S5 sobre el manual que devolvió el autor: re-evalúa, cierra la puerta y RESTITUYE cualquier PENDIENTE que el autor haya quitado.
 */
import { declaracionDelCliente, evaluarHechos, hojasDeTexto, PREFIJO_PENDIENTE, type EntradaDeHechos, type Hecho, type InformeDeHechos } from './hechos'

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
    const hs = informe.hechos.filter((h) => h.campo === campo)
    const texto = hojasDeTexto({ [campo]: manual[campo] }, []).map((h) => h.texto).join('\n')
    const pendientes = cuentaPendientes(texto) + hs.filter((h) => h.estado === 'sin_cita' || h.estado === 'solo_sintesis' || h.estado === 'con_duda').length
    const estado: EstadoDeCampo = !hs.length && !pendientes ? 'sin_hechos' : pendientes ? 'con_pendientes' : hs.some((h) => h.estado === 'afirmacion_del_cliente') ? 'afirmacion_del_cliente' : 'verificado'
    out[campo] = { estado, provisional: pendientes > 0, pendientes, hechos: hs.length }
  }
  return out
}

/** escribe `_field_meta` para TODOS los campos de texto (conserva lo que ya traía cada campo y lo pisa con el estado nuevo) */
export function aplicarMeta<T extends Record<string, unknown>>(manual: T, informe: InformeDeHechos, excluir?: string[]): T {
  const previa = (manual._field_meta && typeof manual._field_meta === 'object' ? manual._field_meta : {}) as Record<string, Record<string, unknown>>
  const nueva = metaDeCampos(manual, informe, excluir)
  const merged: Record<string, unknown> = { ...previa }
  for (const [c, m] of Object.entries(nueva)) merged[c] = { ...(previa[c] ?? {}), ...m }
  return { ...manual, _field_meta: merged }
}

export interface CamposFirmes { firmes: string[]; provisionales: string[]; sin_revisar: string[] }
/** lo que leen los lectores: firmes (F0 si el manual está aprobado) · provisionales (F2 con aviso) · sin revisar (manual anterior al ciclo: ni se firma ni se condena) */
export function camposFirmes(manual: Record<string, unknown>, excluir?: string[]): CamposFirmes {
  const meta = (manual._field_meta && typeof manual._field_meta === 'object' ? manual._field_meta : {}) as Record<string, Partial<MetaDeCampo> & { provisional?: boolean }>
  const out: CamposFirmes = { firmes: [], provisionales: [], sin_revisar: [] }
  for (const campo of new Set(hojasDeTexto(manual, excluir).map((h) => h.campo))) {
    const texto = hojasDeTexto({ [campo]: manual[campo] }, []).map((h) => h.texto).join('\n')
    const m = meta[campo]
    if (cuentaPendientes(texto) > 0 || m?.provisional === true || m?.estado === 'con_pendientes') out.provisionales.push(campo)
    else if (!m || (m.estado === undefined && m.provisional === undefined)) out.sin_revisar.push(campo)
    else out.firmes.push(campo)
  }
  return out
}

// ───────────────────────── la puerta final
function hueco(h: Hecho): string {
  const d = h.detalle.find((x) => x.estado === h.estado) ?? h.detalle[0]
  switch (d.marca) {
    case 'certeza': return `${PREFIJO_PENDIENTE}afirmación sin fuente («${d.texto}»)`
    case 'cifra': return `${PREFIJO_PENDIENTE}dato sin fuente (${d.texto})`
    case 'lugar': return `${PREFIJO_PENDIENTE}origen sin fuente`
    case 'fecha': return `${PREFIJO_PENDIENTE}fecha sin fuente`
    default: return `${PREFIJO_PENDIENTE}cita sin fuente`
  }
}

export interface CambioDeCierre { ruta: string; de: string; a: string; por: 'pendiente' | 'declaracion_del_cliente' }
export function cerrarPuerta<T extends Record<string, unknown>>(manual: T, informe: InformeDeHechos): { manual: T; cambios: CambioDeCierre[]; no_aplicados: Hecho[] } {
  let cur = manual
  const cambios: CambioDeCierre[] = []
  const no: Hecho[] = []
  for (const h of informe.hechos) {
    let nuevo: string | null = null
    let por: CambioDeCierre['por'] = 'pendiente'
    if (h.estado === 'sin_cita' || h.estado === 'solo_sintesis') nuevo = hueco(h)
    else if (h.estado === 'afirmacion_del_cliente' && h.cita_literal) { nuevo = declaracionDelCliente(h.cita_literal); por = 'declaracion_del_cliente' }
    if (nuevo === null) continue
    const actual = leerRuta(cur, h.ruta)
    if (typeof actual !== 'string' || !actual.includes(h.clausula)) { no.push(h); continue }
    cur = ponerRuta(cur, h.ruta, actual.replace(h.clausula, nuevo))
    cambios.push({ ruta: h.ruta, de: h.clausula, a: nuevo, por })
  }
  return { manual: cur, cambios, no_aplicados: no }
}

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
  /** lo que el autor dejó sin respaldo (ya cerrado como PENDIENTE) */
  introducidos: Hecho[]
  cambios: CambioDeCierre[]
  restituidos: Array<{ ruta: string; pendiente: string }>
  /** true si el autor NO dejó nada sin respaldo (la puerta no tuvo que cerrar nada) */
  limpio: boolean
}
/** S5 / S7: re-evalúa lo que devolvió el autor, cierra la puerta y restituye lo que quitó. El resultado ya lleva `_field_meta` de todos los campos. */
export function recomprobar(antes: Record<string, unknown>, despues: Record<string, unknown>, entrada: Omit<EntradaDeHechos, 'manual'>): Recomprobacion {
  const informe = evaluarHechos({ ...entrada, manual: despues })
  const cierre = cerrarPuerta(despues, informe)
  const rest = restituirPendientes(antes, cierre.manual)
  const finalInforme = evaluarHechos({ ...entrada, manual: rest.manual })
  const manual = aplicarMeta(rest.manual, finalInforme, entrada.excluir)
  return { manual, informe: finalInforme, introducidos: informe.sin_respaldo.filter((h) => h.estado !== 'con_duda'), cambios: cierre.cambios, restituidos: rest.restituidos, limpio: informe.sin_respaldo.every((h) => h.estado === 'con_duda') }
}
