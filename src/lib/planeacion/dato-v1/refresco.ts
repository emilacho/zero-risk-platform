/**
 * PLAN v3 · V10 · REFRESCO Y ENVEJECIMIENTO (diseño §8.2, N1–N3). PURO: decide qué volver a pedir, qué cambió de verdad y qué se declara; no manda nada.
 *   1 · CORRIDA LARGA: `recolectado_en` va en el encabezado por código; pasado `limite_entrega_h` del catálogo, aviso (N1).
 *   2 · REFRESCO IDEMPOTENTE POR FUENTE: re-pide SOLO las fuentes con algún tipo vencido, en hueco o ausente; reutiliza el planteo fijado y lo vigente (N2).
 *   3 · CAMBIO MATERIAL: solo lo define la fila `cambio_material` del TIPO. Si cambia algo material ⇒ nueva ronda de la oficina (máx. 2 en total); si no, o si ya
 *       se agotaron las rondas, el bloque se CONSERVA y el plan lo declara «sobre datos del [fecha]». Sin la fila de regla, no hay cambio material (= hoy).
 *   + el manual: si cambió entre medio, aviso con la versión usada (N3).
 * Quitar la regla del catálogo = hoy (reversa).
 */
import { createHash } from 'node:crypto'
import { normalizar } from '../../manual/texto'
import { difiereMasDe } from './cifras'
import type { CatalogoSnapshot } from './catalogo'
import { resolverFrescura } from './normalizador'
import type { DatoV1 } from './tipos'

export const RONDAS_MAXIMAS_DE_LA_OFICINA = 2
export const LIMITE_DE_ENTREGA_H_POR_OMISION = 6

export interface CambioMaterial { tipo_id: string; atributo: string | null; antes: string | number | null; despues: string | number | null; regla: string }
export interface PlanDeRefresco {
  /** fecha-hora (UTC) en que terminó de recolectarse lo que usa el plan: el encabezado «datos al …» */
  recolectado_en: string | null
  encabezado: string
  /** el plan salió después de `limite_entrega_h` desde la recolección */
  vencido_para_entregar: boolean
  /** fuentes a volver a pedir (solo las vencidas, en hueco o ausentes) y por qué */
  repedir: Array<{ fuente_id: string; tipos: string[]; motivo: 'vencido' | 'hueco' | 'ausente' }>
  /** fuentes que se reutilizan tal cual (idempotencia por fuente) */
  reutiliza: string[]
  reutiliza_planteo_fijado: boolean
  cambios_materiales: CambioMaterial[]
  /** huella de los insumos de los datos nuevos (cambia solo si cambió un valor medido) */
  insumos_huella: string
  nueva_ronda: boolean
  conserva_bloque: boolean
  /** lo que el plan debe DECIR: «sobre datos del …», manual distinto, vencido para entregar */
  declara: string[]
}

export interface OperadoresDeRefresco {
  /** ¿este par antes/después es un cambio material según la fila de la regla? */
  esMaterial(antes: DatoV1, despues: DatoV1, parametros: { abs?: number; rel?: number; modo?: string }): boolean
}
export const OPERADORES_DE_REFRESCO: OperadoresDeRefresco = {
  esMaterial(a, b, p) {
    if (a.valor.numero !== undefined && b.valor.numero !== undefined) return difiereMasDe(a.valor.numero, b.valor.numero, { abs: p.abs, rel: p.rel })
    if (a.valor.texto_corto !== undefined && b.valor.texto_corto !== undefined) return normalizar(a.valor.texto_corto) !== normalizar(b.valor.texto_corto)
    return false
  },
}

const clave = (d: DatoV1) => `${d.tipo_id}|${d.atributo ?? ''}`
const valorDe = (d: DatoV1): string | number | null => (d.valor.numero !== undefined ? d.valor.numero : d.valor.texto_corto ?? null)
const medidoYCitable = (d: DatoV1) => d.citable && d.estado === 'trajo' && (d.origen === 'medido' || d.origen === 'supuesto')

/** huella de los insumos: solo lo medido y citable, por tipo y atributo, ordenado (el orden de llegada no la mueve) */
export function huellaDeInsumos(datos: DatoV1[]): string {
  const filas = datos.filter(medidoYCitable).map((d) => `${clave(d)}=${String(valorDe(d))}`).sort()
  return createHash('sha256').update(filas.join('\n')).digest('hex').slice(0, 16)
}

export function planificarRefresco(
  e: {
    snapshot: CatalogoSnapshot
    ahora: Date
    /** los datos de la corrida anterior (los que sostienen el bloque firmado) */
    previos: DatoV1[]
    /** los datos de la recolección nueva (vacío si todavía no se re-pidió) */
    nuevos: DatoV1[]
    /** la huella de los insumos con que se firmó el bloque anterior (si se conoce) */
    insumos_huella_previa?: string | null
    rondas_de_oficina_usadas: number
    manual?: { version_usada: string | number | null; version_actual: string | number | null }
    /** los tipos que el plan necesita (por omisión, los de los datos previos) */
    tipos_requeridos?: string[]
  },
  op: OperadoresDeRefresco = OPERADORES_DE_REFRESCO,
): PlanDeRefresco {
  const snap = e.snapshot
  const horasMax = snap.parametro<number>('param_limite_entrega_h', 'horas', LIMITE_DE_ENTREGA_H_POR_OMISION)
  const declara: string[] = []

  // 1 · recolectado_en: lo más reciente que sostiene el plan (el corte de la corrida)
  const usados = [...e.nuevos, ...e.previos.filter((p) => !e.nuevos.some((n) => clave(n) === clave(p)))].filter((d) => d.medido_en)
  const fechas = usados.map((d) => Date.parse(d.medido_en as string)).filter((t) => !Number.isNaN(t))
  const recolectado = fechas.length ? new Date(Math.max(...fechas)).toISOString() : null
  const edadH = recolectado ? (e.ahora.getTime() - Date.parse(recolectado)) / 3_600_000 : null
  const vencidoParaEntregar = edadH !== null && edadH > horasMax
  if (vencidoParaEntregar) declara.push(`los datos se recolectaron hace ${Math.round(edadH as number)} h (más de ${horasMax} h): el plan sale sobre datos del ${(recolectado as string).slice(0, 10)}`)

  // 2 · idempotencia por fuente: solo se re-pide lo vencido, en hueco o ausente
  const requeridos = e.tipos_requeridos ?? [...new Set(e.previos.map((d) => d.tipo_id))]
  const vigente = (tipo: string): { ok: boolean; motivo: 'vencido' | 'hueco' | 'ausente' } => {
    const ds = [...e.nuevos, ...e.previos].filter((d) => d.tipo_id === tipo)
    if (!ds.length) return { ok: false, motivo: 'ausente' }
    const buenos = ds.filter(medidoYCitable)
    if (!buenos.length) return { ok: false, motivo: 'hueco' }
    const tipoFila = snap.tipo(tipo)
    const fresco = buenos.some((d) => resolverFrescura(d.medido_en, null, tipoFila?.frescura_limite_h ?? 0, e.ahora).estado === 'fresco')
    return fresco ? { ok: true, motivo: 'vencido' } : { ok: false, motivo: 'vencido' }
  }
  const porFuente = new Map<string, { tipos: string[]; motivo: 'vencido' | 'hueco' | 'ausente' }>()
  const reutilizaSet = new Set<string>()
  for (const t of requeridos) {
    const v = vigente(t)
    const fuentes = snap.filas.fuentes.filter((f) => f.via !== 'cerebro' && (f.provee ?? []).includes(t))
    if (v.ok) { for (const f of fuentes) reutilizaSet.add(f.fuente_id); continue }
    const f = fuentes.sort((a, b) => a.tope_usd - b.tope_usd || a.fuente_id.localeCompare(b.fuente_id))[0]
    if (!f) continue
    const g = porFuente.get(f.fuente_id) ?? { tipos: [], motivo: v.motivo }
    g.tipos.push(t)
    porFuente.set(f.fuente_id, g)
  }
  const repedir = [...porFuente.entries()].map(([fuente_id, g]) => ({ fuente_id, tipos: g.tipos, motivo: g.motivo }))
  for (const r of repedir) reutilizaSet.delete(r.fuente_id)

  // 3 · cambio material: solo con la fila `cambio_material` del tipo
  const cambios: CambioMaterial[] = []
  const previosPorClave = new Map(e.previos.filter(medidoYCitable).map((d) => [clave(d), d]))
  for (const n of e.nuevos.filter(medidoYCitable)) {
    const a = previosPorClave.get(clave(n))
    if (!a) continue
    const regla = snap.reglas('cambio_material', { tipo: n.tipo_id })[0]
    if (!regla) continue
    if (op.esMaterial(a, n, regla.parametros as { abs?: number; rel?: number; modo?: string })) {
      cambios.push({ tipo_id: n.tipo_id, atributo: n.atributo, antes: valorDe(a), despues: valorDe(n), regla: regla.regla_id })
    }
  }
  const huella = huellaDeInsumos([...e.nuevos, ...e.previos.filter((p) => !e.nuevos.some((n) => clave(n) === clave(p)))])
  // N2: si la huella de los insumos no cambió, no hay nada nuevo que la oficina deba ver (aunque la regla lo dijera)
  const huellaIgual = !!e.insumos_huella_previa && e.insumos_huella_previa === huella
  const hayCambio = cambios.length > 0 && !huellaIgual
  const quedanRondas = e.rondas_de_oficina_usadas < RONDAS_MAXIMAS_DE_LA_OFICINA
  const nuevaRonda = hayCambio && quedanRondas
  const conserva = !nuevaRonda
  if (conserva) {
    const fechaPrevia = e.previos.map((d) => d.medido_en).filter((x): x is string => !!x).sort()[0]?.slice(0, 10)
    declara.push(`el bloque se conserva: sobre datos del ${fechaPrevia ?? 'la corrida anterior'}${hayCambio ? ' (hubo cambios materiales pero ya se usaron las 2 rondas de la oficina)' : ''}`)
  }
  if (e.manual && e.manual.version_usada !== e.manual.version_actual) declara.push(`el manual cambió entre medio: el plan usó la versión ${String(e.manual.version_usada)} y la vigente es la ${String(e.manual.version_actual)}`)

  return {
    recolectado_en: recolectado,
    encabezado: recolectado ? `datos al ${recolectado.slice(0, 16).replace('T', ' ')} UTC` : 'datos sin fecha de recolección',
    vencido_para_entregar: vencidoParaEntregar,
    repedir, reutiliza: [...reutilizaSet].sort(), reutiliza_planteo_fijado: true,
    cambios_materiales: cambios, insumos_huella: huella, nueva_ronda: nuevaRonda, conserva_bloque: conserva, declara,
  }
}
