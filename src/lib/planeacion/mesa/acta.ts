/**
 * EL ACTA DE LA MESA DE ESTRATEGIA (`acta.v1`). Es el contrato entre la mesa, la oficina financiera y el redactor: marketing decide aquí, una sola vez, y los demás la leen.
 * Puro. El peso de cada canal es de marketing: ni el código ni finanzas lo mueven. Solo se valida la forma, nunca el contenido de una decisión.
 */
export interface CanalDelActa { canal: string; peso: number; razon: string; activo?: boolean; condicion?: string }
export interface NoSeHace { que: string; por_que: string }
export interface ActaV1 {
  esquema: 'acta.v1'
  numero: { meta: number; por_que: string }
  servicio: string
  audiencia: string
  oferta: string
  canales: CanalDelActa[]
  camino: string
  prueba: string
  no_se_hace: NoSeHace[]
  no_se: string[]
}
export interface RangoDeCosto { min: number; max: number; base?: number }
/** lo que aporta cada especialista: su recomendación con razón y, si le toca, el costo por resultado con rango */
export interface AporteV1 { agente: string; resumen: string; recomendaciones: Array<{ que: string; razon: string }>; costo_por_resultado?: RangoDeCosto; alertas: string[] }

/** cuánto se tolera que los pesos no sumen 1: redondeos de quien escribe */
export const TOLERANCIA_DE_PESOS = 0.02
const texto = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function validarActa(v: unknown): { ok: true; valor: ActaV1 } | { ok: false; errores: string[] } {
  const e: string[] = []
  if (!objeto(v)) return { ok: false, errores: ['el acta debe ser un objeto'] }
  const num = v.numero
  if (!objeto(num) || typeof num.meta !== 'number' || !Number.isFinite(num.meta) || num.meta <= 0 || !texto(num.por_que)) e.push('numero: { meta (número > 0), por_que } es obligatorio')
  for (const k of ['servicio', 'audiencia', 'oferta', 'camino', 'prueba']) if (!texto(v[k])) e.push(`${k} es obligatorio`)
  if (!Array.isArray(v.canales) || !v.canales.length) e.push('canales debe traer al menos uno')
  else {
    v.canales.forEach((c, i) => {
      if (!objeto(c) || !texto(c.canal, 60) || typeof c.peso !== 'number' || !Number.isFinite(c.peso) || c.peso < 0 || c.peso > 1 || !texto(c.razon)) e.push(`canales[${i}]: { canal, peso entre 0 y 1, razon } es obligatorio`)
    })
    const activos = v.canales.filter((c) => objeto(c) && c.activo !== false) as Array<{ peso?: unknown }>
    const suma = activos.reduce((s, c) => s + (typeof c.peso === 'number' ? c.peso : 0), 0)
    if (activos.length && Math.abs(suma - 1) > TOLERANCIA_DE_PESOS) e.push(`los pesos de los canales activos suman ${suma.toFixed(2)}: deben sumar 1`)
  }
  if (!Array.isArray(v.no_se_hace)) e.push('no_se_hace debe ser una lista (puede ir vacía)')
  else v.no_se_hace.forEach((n, i) => { if (!objeto(n) || !texto(n.que) || !texto(n.por_que)) e.push(`no_se_hace[${i}]: { que, por_que } es obligatorio`) })
  if (v.no_se !== undefined && (!Array.isArray(v.no_se) || !v.no_se.every((x) => typeof x === 'string'))) e.push('no_se debe ser una lista de textos')
  if (e.length) return { ok: false, errores: e }
  return { ok: true, valor: { ...(v as unknown as ActaV1), esquema: 'acta.v1', no_se: Array.isArray(v.no_se) ? (v.no_se as string[]) : [] } }
}

const rangoValido = (r: unknown): r is RangoDeCosto => objeto(r) && typeof r.min === 'number' && typeof r.max === 'number' && Number.isFinite(r.min) && Number.isFinite(r.max) && r.min >= 0 && r.max >= r.min && (r.base === undefined || (typeof r.base === 'number' && r.base >= r.min && r.base <= r.max))

/** un costo mal formado se quita y se dice, no tumba el aporte: el resto de lo que dijo sirve. El cálculo declara el hueco (no inventa) */
export function validarAporte(v: unknown, agente: string): { ok: true; valor: AporteV1; avisos: string[] } | { ok: false; errores: string[] } {
  if (!objeto(v)) return { ok: false, errores: ['el aporte debe ser un objeto'] }
  const e: string[] = []
  if (!texto(v.resumen)) e.push('resumen es obligatorio')
  const recs = Array.isArray(v.recomendaciones) ? v.recomendaciones : null
  if (!recs) e.push('recomendaciones debe ser una lista')
  else recs.forEach((r, i) => { if (!objeto(r) || !texto(r.que) || !texto(r.razon)) e.push(`recomendaciones[${i}]: { que, razon } es obligatorio`) })
  if (e.length) return { ok: false, errores: e }
  const avisos: string[] = []
  let costo: RangoDeCosto | undefined
  if (v.costo_por_resultado !== undefined && v.costo_por_resultado !== null) {
    if (rangoValido(v.costo_por_resultado)) costo = v.costo_por_resultado
    else avisos.push('el costo por resultado no traía un rango válido: se dejó fuera')
  }
  return { ok: true, avisos, valor: { agente, resumen: String(v.resumen), recomendaciones: recs as AporteV1['recomendaciones'], ...(costo ? { costo_por_resultado: costo } : {}), alertas: Array.isArray(v.alertas) ? v.alertas.filter((x): x is string => typeof x === 'string') : [] } }
}

/** el bloque que lee quien escribe el plan: decide marketing, una vez; el redactor escribe sobre esto */
export function actaParaElRedactor(a: ActaV1): string {
  const canales = a.canales.map((c) => `- ${c.canal}: ${Math.round(c.peso * 100)} %${c.activo === false ? ` (diferido${c.condicion ? `: ${c.condicion}` : ''})` : ''} · ${c.razon}`).join('\n')
  const noHace = a.no_se_hace.map((n) => `- ${n.que} · ${n.por_que}`).join('\n') || '- (nada)'
  return [
    '══════ LO QUE ACORDÓ LA MESA DE ESTRATEGIA ══════',
    'Escribe el plan SOBRE esto: no vuelvas a decidir canales, pesos, meta ni oferta. Es la decisión de marketing, ya tomada.',
    `Meta: ${a.numero.meta} · ${a.numero.por_que}`,
    `Servicio: ${a.servicio}`, `Audiencia: ${a.audiencia}`, `Oferta: ${a.oferta}`,
    'Canales y su peso:', canales,
    `Camino: ${a.camino}`, `Prueba: ${a.prueba}`,
    'Lo que no se hace:', noHace,
    ...(a.no_se.length ? ['Lo que la mesa no sabe:', ...a.no_se.map((n) => `- ${n}`)] : []),
    '',
  ].join('\n')
}
