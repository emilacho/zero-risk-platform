/**
 * PLAN v3 · V4 · EL ARMADOR DE LA SEMILLA COMPACTA (diseño §6 + N7). De `dato.v1[]` a `procedencia.v1.1` para la oficina financiera (F8).
 *   · por dato SOLO viajan: id, tipo_id, procedencia, medido_en, valor normalizado y un `resumen` ≤ 160 caracteres. El contenido completo de la ficha NO viaja;
 *   · el tope de la semilla es 40.000 caracteres (F8 responde 413): el armador TRUNCA POR PRIORIDAD (críticos y medidos primero) y declara `datos_omitidos: n`
 *     con sus ids (nunca parte un dato por la mitad ni cambia un id: las citas `[D#]` siguen siendo las mismas);
 *   · un `hueco` viaja SIN valor: le sirve a la oficina para decir «sin base: falta X, lo aclara Y», nunca como base de cálculo.
 * PURO. Nadie lo llama todavía (V6 lo usa para armar el pedido; V9 lo cablea).
 */
import type { DatoConProcedencia } from '../../finanzas/conversa/esquemas'
import { MAX_RESUMEN } from '../../finanzas/conversa/esquemas'
import type { CatalogoSnapshot } from './catalogo'
import type { DatoV1 } from './tipos'

/** de los 40.000 de F8 se deja el resto a la ficha, el manual y los resúmenes */
export const PRESUPUESTO_DE_DATOS = 24_000

export interface SemillaCompacta {
  datos: DatoConProcedencia[]
  datos_omitidos: number
  omitidos: string[]
  /** una línea para `brazos_resumen`: declara lo que no cupo, con los ids */
  nota: string
}

const corto = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`)
const RANGO_ORIGEN: Record<string, number> = { medido: 0, dueno: 1, supuesto: 1, cerebro: 1, hueco: 2, de_ensayo: 3 }

function valorDe(d: DatoV1): unknown {
  if (d.origen === 'hueco') return null
  if (d.valor.numero !== undefined) return { numero: d.valor.numero, ...(d.valor.unidad ? { unidad: d.valor.unidad } : {}), ...(d.valor.moneda ? { moneda: d.valor.moneda } : {}) }
  return d.valor.texto_corto ?? null
}

export function aProcedencia(d: DatoV1): DatoConProcedencia {
  const v = valorDe(d)
  const vtxt = v === null ? 'sin valor' : typeof v === 'object' ? `${(v as { numero: number }).numero}${(v as { moneda?: string }).moneda ? ' ' + (v as { moneda: string }).moneda : ''}` : String(v)
  const cola = [d.origen, d.rotulo, d.motivo].filter(Boolean).join(' · ')
  return {
    clave: `${d.id}·${d.tipo_id}`.slice(0, 80),
    id: d.id,
    tipo_id: d.tipo_id,
    valor: v,
    procedencia: d.origen,
    fuente: d.fuente_id,
    ...(d.medido_en ? { fecha: d.medido_en, medido_en: d.medido_en } : {}),
    resumen: corto(`${d.tipo_id}${d.atributo ? ` (${d.atributo})` : ''}: ${vtxt} — ${cola}`, MAX_RESUMEN),
    estado: d.estado === 'viejo_reciclado' ? 'viejo_reciclado' : d.estado,
    identidad: d.identidad.estado,
    ...(d.frescura.edad_h !== null ? { frescura_h: d.frescura.edad_h } : {}),
    periodo: { tipo: d.periodo.tipo, ...(d.periodo.desde ? { desde: d.periodo.desde } : {}), ...(d.periodo.hasta ? { hasta: d.periodo.hasta } : {}) },
    alcance: d.alcance,
    confianza: d.confianza,
  }
}

export function armarSemillaCompacta(datos: DatoV1[], o: { snapshot?: CatalogoSnapshot; presupuesto_chars?: number } = {}): SemillaCompacta {
  const presupuesto = o.presupuesto_chars ?? PRESUPUESTO_DE_DATOS
  const critico = (d: DatoV1) => o.snapshot?.tipo(d.tipo_id)?.critico === true
  const idN = (d: DatoV1) => Number(d.id.replace(/\D/g, '')) || 0
  // prioridad: críticos primero; luego medidos > declarados > huecos > ensayo; desempata por id (estable)
  const orden = [...datos].sort((a, b) => Number(critico(b)) - Number(critico(a)) || (RANGO_ORIGEN[a.origen] ?? 9) - (RANGO_ORIGEN[b.origen] ?? 9) || idN(a) - idN(b))
  const entran: DatoV1[] = []
  const omitidos: string[] = []
  let largo = 2 // los corchetes del arreglo
  for (const d of orden) {
    const p = aProcedencia(d)
    const costo = JSON.stringify(p).length + 1
    if (largo + costo > presupuesto) { omitidos.push(d.id); continue }
    largo += costo
    entran.push(d)
  }
  const salida = entran.sort((a, b) => idN(a) - idN(b)).map(aProcedencia)
  omitidos.sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')))
  return {
    datos: salida,
    datos_omitidos: omitidos.length,
    omitidos,
    nota: omitidos.length ? `datos_omitidos: ${omitidos.length} (${omitidos.slice(0, 20).join(', ')}${omitidos.length > 20 ? ', …' : ''}) · no cupieron en la semilla; los críticos y medidos entraron primero` : 'datos_omitidos: 0',
  }
}
