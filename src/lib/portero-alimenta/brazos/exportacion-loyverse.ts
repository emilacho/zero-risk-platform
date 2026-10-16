/**
 * IMPORTADOR DE LAS EXPORTACIONES (CSV) DEL BACK OFFICE DE LOYVERSE · PURO · agnóstico (cualquier punto de venta, es/en).
 * El plan del cliente solo deja leer 31 días por la API; el Back Office SÍ exporta reportes por rango de fechas. Esto convierte esos CSV en las MISMAS cifras por mes
 * (`VentasDelMes`) que arma el brazo de propios, para que `fichasDeVentas` las escriba con la misma forma (`metrica:loyverse:*:<AAAA-MM>`), solo ingresos.
 *
 *   · tres formas de archivo, detectadas por sus columnas (no por el nombre): `recibos` (una fila por recibo), `resumen_por_dia` (una fila por día) y `por_articulo` (una fila por ítem);
 *   · lo personal NO se lee: solo se toman las columnas de la lista de abajo (fecha, número, tipo, estado, importes, cantidades, ítem); nombres, teléfonos y correos de clientes se ignoran;
 *   · un mes solo se archiva si el archivo lo cubre ENTERO (primer y último día dentro del rango exportado); los parciales se declaran y no se archivan;
 *   · la columna de ingreso (total cobrado / ventas netas / ventas brutas) se elige comparando contra lo leído por la API en los días que se solapan; si no hay días en común se declara;
 *   · nada de costos ni márgenes: las columnas de costo y ganancia nunca se leen.
 */
import { normalizar } from '../../manual/texto'
import { DESFASE_HORARIO_POR_DEFECTO_HORAS, nombreDeItem, PREFIJO_DE_VENTAS, resumirVentas, type DiaDeVentas, type LineaDeVenta, type MetaDelMapaDeItems, type ResumenDeVentas, type VentasDelMes } from './propios'
import type { FichaDeBrazo } from './tipos'

// ── CSV ───────────────────────────────────────────────────────────────────────────────────────────
/** lee un CSV (comillas dobles, saltos de línea dentro de comillas, BOM) con el separador detectado en la primera línea: `,` `;` o tabulador */
export function parsearCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '')
  const primera = t.split(/\r?\n/, 1)[0] ?? ''
  const cuenta = (c: string) => primera.split(c).length - 1
  const sep = cuenta(';') > cuenta(',') && cuenta(';') >= cuenta('\t') ? ';' : cuenta('\t') > cuenta(',') ? '\t' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let comillas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (comillas) {
      if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else comillas = false } else campo += ch
      continue
    }
    if (ch === '"') comillas = true
    else if (ch === sep) { fila.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      fila.push(campo); campo = ''
      if (fila.some((c) => c.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += ch
  }
  fila.push(campo)
  if (fila.some((c) => c.trim() !== '')) filas.push(fila)
  return filas
}

/** «1.234,56» · «1,234.56» · «12,50» · «$ 12.50» · «(12.50)» · «-3» → número; ilegible → null */
export function leerNumero(v: string | undefined): number | null {
  if (v === undefined) return null
  let s = v.trim().replace(/[^\d.,()\-]/g, '')
  if (!s || !/\d/.test(s)) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1) }
  s = s.replace(/-/g, '')
  const p = s.lastIndexOf('.'), c = s.lastIndexOf(',')
  if (p >= 0 && c >= 0) s = p > c ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  else if (c >= 0) s = /,\d{1,2}$/.test(s) && (s.match(/,/g) ?? []).length === 1 ? s.replace(',', '.') : s.replace(/,/g, '')
  else if (p >= 0 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

const MESES: Record<string, number> = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 }
const pad = (n: number) => String(n).padStart(2, '0')
export interface FechaLeida { f: string; hora: number | null; minuto: number | null }
/** orden de las fechas con barras: se decide POR ARCHIVO mirando todos los valores (un primer número >12 es día; un segundo >12 es mes); sin evidencia, día primero (Ecuador) */
export function ordenDeFechas(valores: string[]): 'dia_primero' | 'mes_primero' | 'sin_evidencia' {
  let dia = false, mes = false
  for (const v of valores) {
    const m = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
    if (!m) continue
    if (Number(m[1]) > 12) dia = true
    if (Number(m[2]) > 12) mes = true
  }
  return dia && !mes ? 'dia_primero' : mes && !dia ? 'mes_primero' : 'sin_evidencia'
}
export function leerFecha(v: string, orden: 'dia_primero' | 'mes_primero' | 'sin_evidencia' = 'sin_evidencia'): FechaLeida | null {
  const s = v.trim()
  if (!s) return null
  const hora = (r: string): { hora: number | null; minuto: number | null } => { const h = r.match(/(\d{1,2}):(\d{2})/); return h ? { hora: Number(h[1]), minuto: Number(h[2]) } : { hora: null, minuto: null } }
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(.*)$/)
  if (m) return valida(Number(m[1]), Number(m[2]), Number(m[3]), hora(m[4]))
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(.*)$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2]); const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])
    const diaPrimero = orden === 'mes_primero' ? false : true
    return diaPrimero ? valida(y, b, a, hora(m[4])) : valida(y, a, b, hora(m[4]))
  }
  m = normalizar(s).match(/^(\d{1,2})\s+(?:de\s+)?([a-z]{3})[a-z]*\.?,?\s+(?:de\s+)?(\d{4})(.*)$/)
  if (m && MESES[m[2]]) return valida(Number(m[3]), MESES[m[2]], Number(m[1]), hora(m[4]))
  m = normalizar(s).match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})(.*)$/)
  if (m && MESES[m[1]]) return valida(Number(m[3]), MESES[m[1]], Number(m[2]), hora(m[4]))
  return null
}
function valida(a: number, m: number, d: number, h: { hora: number | null; minuto: number | null }): FechaLeida | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return null
  const real = new Date(Date.UTC(a, m - 1, d))
  if (real.getUTCMonth() !== m - 1) return null
  return { f: `${a}-${pad(m)}-${pad(d)}`, hora: h.hora, minuto: h.minuto }
}

// ── columnas (lista blanca: lo que no está aquí no se lee) ─────────────────────────────────────────
type Col = 'fecha' | 'hora' | 'numero' | 'tipo' | 'estado' | 'brutas' | 'reembolsos' | 'descuentos' | 'netas' | 'total' | 'tickets' | 'item' | 'unidades'
const CABECERAS: Array<[Col, RegExp]> = [
  ['numero', /^(receipt number|receipt no|numero de recibo|no de recibo|n de recibo|nro de recibo|numero del recibo)$/],
  ['fecha', /^(date|fecha|receipt date|fecha del recibo|fecha y hora|date and time|day|dia|created at|creado)$/],
  ['hora', /^(time|hora)$/],
  ['tipo', /^(receipt type|tipo de recibo|tipo)$/],
  ['estado', /^(status|estado)$/],
  ['brutas', /^(gross sales|ventas brutas)$/],
  ['reembolsos', /^(refunds|reembolsos|devoluciones)$/],
  ['descuentos', /^(discounts|descuentos)$/],
  ['netas', /^(net sales|ventas netas)$/],
  ['total', /^(total collected|total recaudado|total cobrado|total money|total)$/],
  ['tickets', /^(receipts|recibos|number of receipts|numero de recibos|cantidad de recibos|transactions|transacciones|tickets|number of sales|numero de ventas)$/],
  ['item', /^(item|item name|nombre del articulo|articulo|nombre del producto|producto|nombre)$/],
  ['unidades', /^(items sold|articulos vendidos|cantidad vendida|cantidad|quantity|units sold|unidades vendidas)$/],
]
const normCabecera = (h: string): string => normalizar(h).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
export function mapearColumnas(cabecera: string[]): Partial<Record<Col, number>> {
  const out: Partial<Record<Col, number>> = {}
  cabecera.forEach((h, i) => {
    const n = normCabecera(h)
    for (const [col, re] of CABECERAS) if (re.test(n) && out[col] === undefined) { out[col] = i; break }
  })
  return out
}
export type TipoDeExportacion = 'recibos' | 'resumen_por_dia' | 'por_articulo' | 'desconocido'
export function tipoDeExportacion(c: Partial<Record<Col, number>>): TipoDeExportacion {
  const dinero = c.total !== undefined || c.netas !== undefined || c.brutas !== undefined
  if (c.fecha !== undefined && c.numero !== undefined && dinero) return 'recibos'
  if (c.item !== undefined && (c.unidades !== undefined || dinero) && c.fecha === undefined) return 'por_articulo'
  if (c.fecha !== undefined && dinero) return 'resumen_por_dia'
  return 'desconocido'
}

// ── lectura de un archivo ─────────────────────────────────────────────────────────────────────────
export interface ArchivoCsv { nombre: string; texto: string; /** fecha de la exportación (AAAA-MM-DD) */ exportado_en: string }
export type ColumnaDeIngreso = 'total' | 'netas' | 'brutas'
interface DiaLeido { f: string; total: number; netas: number; brutas: number; reembolsos: number; tickets: number | null; anuladas: number }
interface ReciboLeido { f: string; hora: number | null; minuto: number | null; reembolso: boolean; anulado: boolean; total: number; netas: number; brutas: number }
export interface ArchivoLeido {
  nombre: string
  exportado_en: string
  tipo: TipoDeExportacion
  filas: number
  desde: string | null
  hasta: string | null
  ignoradas: number
  recibos: ReciboLeido[]
  dias: DiaLeido[]
  items: Array<{ item: string; unidades: number; ingreso: number }>
  /** columnas de importes que trae (para elegir la de ingreso) */
  importes: ColumnaDeIngreso[]
  declarado: string[]
}
const REEMBOLSO = /refund|reembols|devoluc/
const ANULADO = /cancel|anulad/
export function leerArchivo(a: ArchivoCsv): ArchivoLeido {
  const base: ArchivoLeido = { nombre: a.nombre, exportado_en: a.exportado_en, tipo: 'desconocido', filas: 0, desde: null, hasta: null, ignoradas: 0, recibos: [], dias: [], items: [], importes: [], declarado: [] }
  const filas = parsearCsv(a.texto)
  if (filas.length < 2) { base.declarado.push(`${a.nombre}: sin filas de datos`); return base }
  // la cabecera es la primera fila que reconoce columnas (algunos reportes traen títulos antes)
  let h = 0
  for (; h < Math.min(filas.length, 8); h++) if (tipoDeExportacion(mapearColumnas(filas[h])) !== 'desconocido') break
  const c = mapearColumnas(filas[h] ?? [])
  base.tipo = tipoDeExportacion(c)
  if (base.tipo === 'desconocido') { base.declarado.push(`${a.nombre}: no reconozco las columnas (fecha, importes o ítem); no se usa`); return base }
  base.importes = (['total', 'netas', 'brutas'] as const).filter((k) => c[k] !== undefined)
  const datos = filas.slice(h + 1)
  base.filas = datos.length
  const valores = c.fecha !== undefined ? datos.map((r) => r[c.fecha!] ?? '') : []
  const orden = ordenDeFechas(valores)
  if (orden === 'sin_evidencia' && valores.some((v) => /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(v.trim()))) base.declarado.push(`${a.nombre}: las fechas con barras no dicen si van día/mes o mes/día; se tomó día primero`)
  const num = (r: string[], k: Col): number => (c[k] === undefined ? 0 : leerNumero(r[c[k]!]) ?? 0)
  const fechas: string[] = []
  if (base.tipo === 'recibos') {
    for (const r of datos) {
      const f = leerFecha(`${r[c.fecha!] ?? ''} ${c.hora !== undefined ? r[c.hora] ?? '' : ''}`, orden)
      if (!f) { base.ignoradas++; continue }
      const tipo = normalizar(String(r[c.tipo ?? -1] ?? ''))
      const estado = normalizar(String(r[c.estado ?? -1] ?? ''))
      const total = num(r, 'total'), netas = num(r, 'netas'), brutas = num(r, 'brutas')
      base.recibos.push({ f: f.f, hora: f.hora, minuto: f.minuto, reembolso: REEMBOLSO.test(tipo) || (c.tipo === undefined && total < 0), anulado: ANULADO.test(estado), total: Math.abs(total), netas: Math.abs(netas), brutas: Math.abs(brutas) })
      fechas.push(f.f)
    }
    // los días salen de los recibos
    const por = new Map<string, DiaLeido>()
    for (const r of base.recibos) {
      const d = por.get(r.f) ?? { f: r.f, total: 0, netas: 0, brutas: 0, reembolsos: 0, tickets: 0, anuladas: 0 }
      if (r.anulado) d.anuladas++
      else if (r.reembolso) d.reembolsos += r.total || r.netas || r.brutas
      else { d.total += r.total; d.netas += r.netas; d.brutas += r.brutas; d.tickets = (d.tickets ?? 0) + 1 }
      por.set(r.f, d)
    }
    base.dias = [...por.values()].sort((x, y) => (x.f < y.f ? -1 : 1))
  } else if (base.tipo === 'resumen_por_dia') {
    for (const r of datos) {
      const f = leerFecha(r[c.fecha!] ?? '', orden)
      if (!f) { base.ignoradas++; continue }
      fechas.push(f.f)
      const ticketsCol = c.tickets !== undefined ? leerNumero(r[c.tickets]) : null
      base.dias.push({ f: f.f, total: num(r, 'total'), netas: num(r, 'netas'), brutas: num(r, 'brutas'), reembolsos: Math.abs(num(r, 'reembolsos')), tickets: ticketsCol, anuladas: 0 })
    }
    // un día repetido (varias filas por día: por tienda o por hora) se suma
    const por = new Map<string, DiaLeido>()
    for (const d of base.dias) {
      const p = por.get(d.f)
      if (!p) { por.set(d.f, { ...d }); continue }
      p.total += d.total; p.netas += d.netas; p.brutas += d.brutas; p.reembolsos += d.reembolsos
      p.tickets = p.tickets === null || d.tickets === null ? null : p.tickets + d.tickets
    }
    base.dias = [...por.values()].sort((x, y) => (x.f < y.f ? -1 : 1))
  } else {
    // por artículo: el periodo no viene en las filas
    for (const r of datos) {
      const item = String(r[c.item!] ?? '').trim()
      if (!item || /^(total|totales)$/.test(normalizar(item))) { base.ignoradas++; continue }
      base.items.push({ item, unidades: num(r, 'unidades'), ingreso: c.netas !== undefined ? num(r, 'netas') : c.total !== undefined ? num(r, 'total') : num(r, 'brutas') })
    }
  }
  if (fechas.length) { fechas.sort(); base.desde = fechas[0]; base.hasta = fechas[fechas.length - 1] }
  return base
}

/** el periodo de un archivo por artículo, desde su nombre: `2026-03` (un mes) o `2025-11-01_2026-09-30` (un rango) */
export function periodoDelNombre(nombre: string): { desde: string; hasta: string } | null {
  const r = nombre.match(/(\d{4}-\d{2}-\d{2})\D{1,6}(\d{4}-\d{2}-\d{2})/)
  if (r) return { desde: r[1], hasta: r[2] }
  const m = nombre.match(/(?:^|\D)(\d{4})-(\d{2})(?!\d|-\d)/)
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const fin = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
    return { desde: `${m[1]}-${m[2]}-01`, hasta: `${m[1]}-${m[2]}-${pad(fin)}` }
  }
  return null
}

/** los ítems de un rango que no se puede partir por mes: una ficha del rango (nunca se reparte entre meses) */
export function fichasDeItemsDeRango(e: { client_id: string; rangos: ItemsDeRango[]; exportado_en: string; mapaDeItems?: Record<string, string>; mapaMeta?: MetaDelMapaDeItems | null }): FichaDeBrazo[] {
  return e.rangos.filter((r) => r.items.length).map((r) => {
    const top = r.items.slice(0, 10).map((x) => `${nombreDeItem(x.item, e.mapaDeItems ?? {}, e.mapaMeta)}: ${r2(x.unidades)} u., ${String(r2(x.ingreso)).replace('.', ',')}`).join(' · ')
    return {
      brazo: 'propios', alcance: 'cliente', client_id: e.client_id, ref: `brazo:propios:loyverse:items:rango:${r.desde}_${r.hasta}`, atributo: `${PREFIJO_DE_VENTAS}items:rango:${r.desde}_${r.hasta}`, clase: 'metrica',
      titulo: `Ítems más vendidos · ${r.desde} a ${r.hasta}`.slice(0, 160),
      contenido: `Los 10 ítems que más ingreso dejaron del ${r.desde} al ${r.hasta} (un solo reporte del rango, no por mes): ${top}. Tomado de la exportación del Back Office de Loyverse del ${e.exportado_en} (no de la API). Solo ingresos: el punto de venta no trae costos, no es margen.`,
      origen: 'plataforma', fuente_url: null, fecha_fuente: e.exportado_en, observado_en: `${e.exportado_en}T12:00:00.000Z`, vigente_hasta: null, decision: 'reemplaza',
      datos: { periodo: `${r.desde}_${r.hasta}`, desde: r.desde, hasta: r.hasta, en_curso: false, fuente: 'loyverse_exportacion', exportado_en: e.exportado_en, tienda: null },
    } as FichaDeBrazo
  })
}

// ── de los archivos a los meses ───────────────────────────────────────────────────────────────────
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const r2 = (n: number) => Math.round(n * 100) / 100
const ultimoDia = (mes: string) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${pad(new Date(Date.UTC(a, m, 0)).getUTCDate())}` }
export interface ValidacionContraLaApi {
  columna: ColumnaDeIngreso
  dias_comparados: number
  coinciden: number
  difieren: Array<{ f: string; exportacion: number; api: number }>
  /** por qué se eligió esa columna */
  motivo: string
}
/** elige la columna de ingreso que mejor coincide con lo leído por la API en los días que se solapan (la API da el total cobrado del recibo) */
export function elegirColumna(dias: DiaLeido[], diasApi: DiaDeVentas[], disponibles: ColumnaDeIngreso[]): ValidacionContraLaApi {
  const orden: ColumnaDeIngreso[] = (['total', 'netas', 'brutas'] as const).filter((k) => disponibles.includes(k))
  if (!orden.length) return { columna: 'total', dias_comparados: 0, coinciden: 0, difieren: [], motivo: 'el archivo no trae columnas de importes' }
  const api = new Map(diasApi.map((d) => [d.f, d.ingreso]))
  // un día de la API puede estar a medias (hoy): solo se comparan los días ANTERIORES al último día de la API
  const ultimaApi = diasApi.map((d) => d.f).sort().slice(-1)[0] ?? ''
  const comparables = dias.filter((d) => api.has(d.f) && d.f < ultimaApi)
  if (!comparables.length) return { columna: orden[0], dias_comparados: 0, coinciden: 0, difieren: [], motivo: `sin días en común con la API: no se pudo validar; se tomó «${orden[0]}»` }
  let mejor: ValidacionContraLaApi | null = null
  for (const k of orden) {
    const difieren = comparables.filter((d) => Math.abs(r2(d[k]) - r2(api.get(d.f)!)) > 0.011).map((d) => ({ f: d.f, exportacion: r2(d[k]), api: r2(api.get(d.f)!) }))
    const v: ValidacionContraLaApi = { columna: k, dias_comparados: comparables.length, coinciden: comparables.length - difieren.length, difieren, motivo: '' }
    if (!mejor || v.coinciden > mejor.coinciden) mejor = v
  }
  mejor!.motivo = mejor!.coinciden === mejor!.dias_comparados ? `coincide en los ${mejor!.dias_comparados} días en común con la API` : `la que más coincide con la API (${mejor!.coinciden} de ${mejor!.dias_comparados} días)`
  return mejor!
}

export interface MesImportado extends VentasDelMes {
  /** de qué archivos salió (nombres) */
  archivos: string[]
}
export interface ItemsDeRango { desde: string; hasta: string; archivo: string; items: LineaDeVenta[] }
export interface ResultadoDeImportacion {
  meses: MesImportado[]
  items_de_rango: ItemsDeRango[]
  validacion: ValidacionContraLaApi | null
  archivos: Array<{ nombre: string; tipo: TipoDeExportacion; filas: number; desde: string | null; hasta: string | null; ignoradas: number }>
  declarado: string[]
}
export function importarExportaciones(leidos: ArchivoLeido[], o: { ahora: Date; mesEnCurso: string; diasApi?: DiaDeVentas[]; desfaseHoras?: number; mesesYaArchivados?: ReadonlySet<string> }): ResultadoDeImportacion {
  const dh = o.desfaseHoras ?? DESFASE_HORARIO_POR_DEFECTO_HORAS
  const declarado: string[] = leidos.flatMap((l) => l.declarado)
  const usables = leidos.filter((l) => l.tipo !== 'desconocido' && l.filas > 0)
  const conDias = usables.filter((l) => l.tipo === 'recibos' || l.tipo === 'resumen_por_dia')
  const recibos = conDias.filter((l) => l.tipo === 'recibos')
  const diarios = conDias.filter((l) => l.tipo === 'resumen_por_dia')
  const importes = [...new Set(conDias.flatMap((l) => l.importes))] as ColumnaDeIngreso[]
  // un día puede venir de varios archivos: gana el de recibos (el más detallado); si hay dos resúmenes por día, el exportado más tarde
  const porDia = new Map<string, { d: DiaLeido; origen: ArchivoLeido }>()
  for (const l of [...diarios].sort((a, b) => (a.exportado_en < b.exportado_en ? -1 : 1))) for (const d of l.dias) porDia.set(d.f, { d, origen: l })
  for (const l of recibos) for (const d of l.dias) porDia.set(d.f, { d, origen: l })
  const todosLosDias = [...porDia.values()].map((x) => x.d)
  const validacion = todosLosDias.length ? elegirColumna(todosLosDias, o.diasApi ?? [], importes.length ? importes : ['total']) : null
  if (validacion?.difieren.length) declarado.push(`validación contra la API: ${validacion.difieren.length} de ${validacion.dias_comparados} días difieren (${validacion.difieren.slice(0, 5).map((x) => `${x.f}: exportación ${x.exportacion} · API ${x.api}`).join('; ')})`)
  else if (validacion && validacion.dias_comparados === 0) declarado.push(`validación contra la API: ${validacion.motivo}`)
  const col = validacion?.columna ?? 'total'
  // un día repetido entre un resumen y los recibos que no coincide se declara
  for (const r of recibos) for (const d of r.dias) for (const s of diarios) {
    const x = s.dias.find((y) => y.f === d.f)
    if (x && Math.abs(r2(x[col]) - r2(d[col])) > 0.011) declarado.push(`${d.f}: el resumen por día (${s.nombre}) dice ${r2(x[col])} y los recibos (${r.nombre}) ${r2(d[col])}; se usan los recibos`)
  }

  // cobertura: cada archivo cubre [desde, hasta]; un mes está completo si lo cubre un archivo entero
  const cubre = (mes: string): ArchivoLeido[] => conDias.filter((l) => l.desde !== null && l.hasta !== null && l.desde <= `${mes}-01` && l.hasta >= ultimoDia(mes))
  const mesesVistos = [...new Set(todosLosDias.map((d) => d.f.slice(0, 7)))].sort()
  const meses: MesImportado[] = []
  for (const mes of mesesVistos) {
    if (mes >= o.mesEnCurso) continue // el mes en curso lo lee la API (la exportación no lo reemplaza)
    if (o.mesesYaArchivados?.has(mes)) { declarado.push(`${mes}: ya estaba archivado; no se reescribe`); continue }
    if (!cubre(mes).length) { declarado.push(`${mes}: la exportación no lo cubre entero (primer o último día fuera del rango exportado); no se archiva`); continue }
    const dias = [...porDia.values()].filter((x) => x.d.f.startsWith(mes))
    const archivos = [...new Set(dias.map((x) => x.origen.nombre))]
    const deRecibos = dias.every((x) => x.origen.tipo === 'recibos')
    let resumen: ResumenDeVentas
    let sinTickets = false
    if (deRecibos) {
      // misma función que la de la API: los recibos se vuelven «recibos de API» con la hora UTC (la hora local menos el desfase)
      const api = recibos.flatMap((l) => l.recibos).filter((r) => r.f.startsWith(mes)).map((r) => ({
        created_at: new Date(Date.UTC(Number(r.f.slice(0, 4)), Number(r.f.slice(5, 7)) - 1, Number(r.f.slice(8, 10)), r.hora ?? 12, r.minuto ?? 0) - dh * 3_600_000).toISOString(),
        receipt_type: r.reembolso ? 'REFUND' : 'SALE', total_money: col === 'total' ? r.total : col === 'netas' ? r.netas : r.brutas, ...(r.anulado ? { cancelled_at: r.f } : {}),
      }))
      resumen = resumirVentas(api, { periodo: mes, desfaseHoras: dh })
      if (recibos.every((l) => l.recibos.every((r) => r.hora === null))) { resumen = { ...resumen, por_hora: [] }; declarado.push(`${mes}: los recibos no traen hora; no hay horas fuertes`) }
    } else {
      const ds = dias.map((x) => x.d)
      const ingreso = r2(ds.reduce((s, d) => s + d[col], 0))
      const reembolsos = r2(ds.reduce((s, d) => s + d.reembolsos, 0))
      sinTickets = ds.some((d) => d.tickets === null)
      const tickets = sinTickets ? 0 : ds.reduce((s, d) => s + (d.tickets ?? 0), 0)
      const porDiaSem = new Map<string, { tickets: number; ingreso: number }>()
      for (const d of ds) {
        const n = DIAS[new Date(`${d.f}T12:00:00Z`).getUTCDay()]
        const p = porDiaSem.get(n) ?? { tickets: 0, ingreso: 0 }
        p.tickets += d.tickets ?? 0; p.ingreso += d[col]
        porDiaSem.set(n, p)
      }
      resumen = {
        periodo: mes, tickets, ingreso, reembolsos, ticket_medio: tickets ? r2(ingreso / tickets) : 0, anuladas: 0, por_item: [], por_hora: [],
        por_dia: [...porDiaSem.entries()].map(([dia, v]) => ({ dia, tickets: v.tickets, ingreso: r2(v.ingreso) })).sort((a, b) => (sinTickets ? b.ingreso - a.ingreso : b.tickets - a.tickets) || (a.dia < b.dia ? -1 : 1)),
        por_fecha: ds.map((d) => ({ f: d.f, ingreso: r2(d[col]), tickets: d.tickets ?? 0, reembolsos: r2(d.reembolsos), anuladas: d.anuladas })), recortado: false,
      }
    }
    meses.push({ periodo: mes, grupo: '', rotulo: '', resumen, archivos, ...(sinTickets ? { sinTickets: true } : {}) })
  }

  // ítems: un archivo por artículo cuyo periodo es UN mes se une a ese mes; si abarca varios, queda como «ítems del rango»
  const items_de_rango: ItemsDeRango[] = []
  for (const l of usables.filter((x) => x.tipo === 'por_articulo')) {
    const p = periodoDelNombre(l.nombre)
    if (!p) { declarado.push(`${l.nombre}: el archivo por artículo no dice su periodo (ni en el nombre): nómbralo con el mes, p. ej. «ventas-por-articulo-2026-03.csv»; no se usa`); continue }
    const lineas: LineaDeVenta[] = l.items.map((x) => ({ item: x.item, unidades: r2(x.unidades), ingreso: r2(x.ingreso) })).sort((a, b) => b.ingreso - a.ingreso || (a.item < b.item ? -1 : 1))
    if (p.desde.slice(0, 7) === p.hasta.slice(0, 7) && p.desde.endsWith('-01') && p.hasta === ultimoDia(p.hasta.slice(0, 7))) {
      const m = meses.find((x) => x.periodo === p.desde.slice(0, 7))
      if (!m) { if (p.desde.slice(0, 7) < o.mesEnCurso) declarado.push(`${l.nombre}: ítems de ${p.desde.slice(0, 7)} sin cifras del mes (falta el resumen por día o los recibos de ese mes); no se archivan`); continue }
      m.resumen = { ...m.resumen, por_item: lineas }
      m.archivos = [...new Set([...m.archivos, l.nombre])]
    } else if (p.hasta.slice(0, 7) < o.mesEnCurso || p.hasta.slice(0, 7) === o.mesEnCurso) items_de_rango.push({ desde: p.desde, hasta: p.hasta, archivo: l.nombre, items: lineas })
  }
  return {
    meses, items_de_rango, validacion,
    archivos: leidos.map((l) => ({ nombre: l.nombre, tipo: l.tipo, filas: l.filas, desde: l.desde, hasta: l.hasta, ignoradas: l.ignoradas })),
    declarado,
  }
}
