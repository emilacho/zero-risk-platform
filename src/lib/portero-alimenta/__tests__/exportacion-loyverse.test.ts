/**
 * Importador de las exportaciones (CSV) del Back Office de Loyverse · 16-oct · US$ 0, sin red, con CSV sintéticos (español e inglés; coma, punto y coma, tabulador).
 * Verifica: que lo personal NO se lee, que un mes solo se archiva si el archivo lo cubre entero, que la columna de ingreso se elige contra la API, que el resultado
 * es la MISMA forma de ficha que el brazo (mismas claves por mes) y que repetirlo no duplica.
 */
import { describe, expect, it } from 'vitest'
import { archivarFichasDeBrazos } from '../brazos/archivo'
import { fichasDeItemsDeRango, importarExportaciones, leerArchivo, leerFecha, leerNumero, mapearColumnas, ordenDeFechas, parsearCsv, periodoDelNombre, tipoDeExportacion } from '../brazos/exportacion-loyverse'
import { fichasDeVentas, mesLocalDe } from '../brazos/propios'
import { crearBaseFalsa } from './base-falsa'

const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-10-16T15:00:00Z')
const MES_EN_CURSO = mesLocalDe(AHORA)

describe('CSV · lectura tolerante', () => {
  it('coma, punto y coma y tabulador; comillas con separadores y saltos de línea adentro; BOM', () => {
    expect(parsearCsv('﻿a,b\n1,"x,y"\n')).toEqual([['a', 'b'], ['1', 'x,y']])
    expect(parsearCsv('a;b\r\n1;"dos\nlíneas"\r\n')).toEqual([['a', 'b'], ['1', 'dos\nlíneas']])
    expect(parsearCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parsearCsv('a,b\n"di ""hola""",2')[1]).toEqual(['di "hola"', '2'])
  })
  it('números con coma o punto decimal, miles, moneda y paréntesis', () => {
    expect(leerNumero('1.234,56')).toBe(1234.56)
    expect(leerNumero('1,234.56')).toBe(1234.56)
    expect(leerNumero('12,50')).toBe(12.5)
    expect(leerNumero('$ 12.50')).toBe(12.5)
    expect(leerNumero('(12.50)')).toBe(-12.5)
    expect(leerNumero('-3')).toBe(-3)
    expect(leerNumero('1.234')).toBe(1234)
    expect(leerNumero('12.5')).toBe(12.5)
    expect(leerNumero('abc')).toBeNull()
    expect(leerNumero('')).toBeNull()
  })
  it('fechas: ISO, día/mes/año, mes/día/año, nombres de mes en español e inglés; imposibles se descartan', () => {
    expect(leerFecha('2026-03-05 14:30:10')).toEqual({ f: '2026-03-05', hora: 14, minuto: 30 })
    expect(leerFecha('05/03/2026 14:30')).toEqual({ f: '2026-03-05', hora: 14, minuto: 30 })
    expect(leerFecha('05/03/2026', 'mes_primero')).toEqual({ f: '2026-05-03', hora: null, minuto: null })
    expect(leerFecha('5 mar 2026')?.f).toBe('2026-03-05')
    expect(leerFecha('5 de marzo de 2026')?.f).toBe('2026-03-05')
    expect(leerFecha('Mar 5, 2026')?.f).toBe('2026-03-05')
    expect(leerFecha('31/02/2026')).toBeNull()
    expect(leerFecha('basura')).toBeNull()
    expect(ordenDeFechas(['13/03/2026', '01/04/2026'])).toBe('dia_primero')
    expect(ordenDeFechas(['03/13/2026'])).toBe('mes_primero')
    expect(ordenDeFechas(['03/04/2026'])).toBe('sin_evidencia')
  })
  it('las columnas se reconocen en español e inglés y la forma del archivo por sus columnas, no por su nombre', () => {
    expect(tipoDeExportacion(mapearColumnas(['Date', 'Receipt number', 'Receipt type', 'Total collected']))).toBe('recibos')
    expect(tipoDeExportacion(mapearColumnas(['Fecha', 'Ventas brutas', 'Reembolsos', 'Descuentos', 'Ventas netas']))).toBe('resumen_por_dia')
    expect(tipoDeExportacion(mapearColumnas(['Nombre del artículo', 'Artículos vendidos', 'Ventas netas']))).toBe('por_articulo')
    expect(tipoDeExportacion(mapearColumnas(['Foo', 'Bar']))).toBe('desconocido')
  })
  it('el periodo de un archivo por artículo sale del nombre: mes o rango', () => {
    expect(periodoDelNombre('ventas-por-articulo-2026-03.csv')).toEqual({ desde: '2026-03-01', hasta: '2026-03-31' })
    expect(periodoDelNombre('items_2025-11-01_2026-09-30.csv')).toEqual({ desde: '2025-11-01', hasta: '2026-09-30' })
    expect(periodoDelNombre('articulos.csv')).toBeNull()
  })
})

// un resumen por día, español, punto y coma, coma decimal: marzo y abril 2026 enteros (62 días)
const resumenPorDia = (desde: string, hasta: string, valor: (f: string) => number, o: { tickets?: boolean; cabecera?: string } = {}): string => {
  const filas: string[] = [o.cabecera ?? (o.tickets ? 'Fecha;Recibos;Ventas brutas;Reembolsos;Descuentos;Ventas netas;Costo de los bienes;Ganancia bruta' : 'Fecha;Ventas brutas;Reembolsos;Descuentos;Ventas netas;Costo de los bienes;Ganancia bruta')]
  for (let t = Date.parse(`${desde}T00:00:00Z`); t <= Date.parse(`${hasta}T00:00:00Z`); t += 86_400_000) {
    const f = new Date(t).toISOString().slice(0, 10)
    const [y, m, d] = f.split('-')
    const v = valor(f)
    const coma = (n: number) => n.toFixed(2).replace('.', ',')
    filas.push(`${d}/${m}/${y};${o.tickets ? `${Math.round(v / 10)};` : ''}${coma(v * 1.15)};${coma(v % 7 === 0 ? 3 : 0)};${coma(0)};${coma(v)};${coma(v * 0.4)};${coma(v * 0.6)}`)
  }
  return filas.join('\n')
}
const valorDelDia = (f: string) => 100 + Number(f.slice(8, 10))

describe('importar · resumen por día', () => {
  const csv = resumenPorDia('2026-03-01', '2026-04-30', valorDelDia, { tickets: true })
  const lee = (nombre: string, texto: string, exportado_en = '2026-10-16') => leerArchivo({ nombre, texto, exportado_en })

  it('arma un mes por cada mes entero del archivo, con ingreso, tickets, reembolsos y días fuertes; los parciales no se archivan', () => {
    const r = importarExportaciones([lee('resumen-diario.csv', resumenPorDia('2026-02-15', '2026-04-30', valorDelDia, { tickets: true }))], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses.map((m) => m.periodo)).toEqual(['2026-03', '2026-04']) // febrero empieza el 15: parcial
    expect(r.declarado.join(' ')).toMatch(/2026-02: la exportación no lo cubre entero/)
    const marzo = r.meses[0].resumen
    const esperado = Array.from({ length: 31 }, (_, i) => valorDelDia(`2026-03-${String(i + 1).padStart(2, '0')}`)).reduce((s, v) => s + v, 0)
    expect(marzo.ingreso).toBeCloseTo(esperado, 2) // la columna elegida sin API: «total» no existe → ventas netas
    expect(marzo.tickets).toBe(Array.from({ length: 31 }, (_, i) => Math.round(valorDelDia(`2026-03-${String(i + 1).padStart(2, '0')}`) / 10)).reduce((s, v) => s + v, 0))
    expect(marzo.por_dia.length).toBe(7)
    expect(r.meses[0].sinTickets).toBeUndefined()
  })
  it('sin columna de tickets: no se inventan; la ficha lo dice y no escribe tickets ni ticket promedio', () => {
    const r = importarExportaciones([lee('resumen.csv', resumenPorDia('2026-03-01', '2026-03-31', valorDelDia))], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses[0].sinTickets).toBe(true)
    const f = fichasDeVentas({ client_id: CL, meses: r.meses, ahora: AHORA, exportacion: { fecha: '2026-10-16' } })
    expect(f.map((x) => x.atributo).sort()).toEqual(['metrica:loyverse:dias_y_horas:2026-03', 'metrica:loyverse:ingreso:2026-03'])
    const ing = f.find((x) => x.atributo.endsWith('ingreso:2026-03'))!
    expect(ing.contenido).toMatch(/la exportación no trae el número de tickets/)
    expect(ing.contenido).toMatch(/exportación del Back Office de Loyverse del 2026-10-16 \(no de la API\)/)
    expect(ing.contenido).not.toMatch(/0 tickets/)
    expect(ing.datos).toMatchObject({ tickets: null, ticket_promedio: null, fuente: 'loyverse_exportacion', exportado_en: '2026-10-16', en_curso: false })
    expect(ing.observado_en).toBe('2026-10-16T12:00:00.000Z')
    expect(ing.vigente_hasta).toBeNull()
  })
  it('el mes en curso nunca se importa (lo lee la API); un mes ya archivado no se reescribe', () => {
    const r = importarExportaciones([lee('r.csv', resumenPorDia('2026-09-01', '2026-10-16', valorDelDia, { tickets: true }))], { ahora: AHORA, mesEnCurso: MES_EN_CURSO, mesesYaArchivados: new Set(['2026-09']) })
    expect(r.meses).toEqual([])
    expect(r.declarado.join(' ')).toMatch(/2026-09: ya estaba archivado/)
  })
  it('un archivo que no se reconoce o vacío se declara y no rompe', () => {
    const r = importarExportaciones([lee('raro.csv', 'Foo,Bar\n1,2'), lee('vacio.csv', ''), lee('resumen.csv', csv)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.declarado.join(' ')).toMatch(/raro\.csv: no reconozco las columnas/)
    expect(r.declarado.join(' ')).toMatch(/vacio\.csv: sin filas de datos/)
    expect(r.meses.map((m) => m.periodo)).toEqual(['2026-03', '2026-04'])
  })
  it('días repetidos (una fila por tienda) se suman', () => {
    const doble = `${csv}\n${csv.split('\n').slice(1, 32).join('\n')}`
    const sencillo = importarExportaciones([lee('a.csv', csv)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO }).meses[0].resumen.ingreso
    const sumado = importarExportaciones([lee('b.csv', doble)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO }).meses[0].resumen.ingreso
    expect(sumado).toBeCloseTo(sencillo * 2, 2)
  })
})

describe('importar · validación contra la API y elección de la columna', () => {
  const csv = resumenPorDia('2026-09-01', '2026-10-10', valorDelDia, { tickets: true })
  const dia = (f: string, ingreso: number) => ({ f, ingreso, tickets: 1, reembolsos: 0, anuladas: 0 })
  const lee = (texto: string) => leerArchivo({ nombre: 'r.csv', texto, exportado_en: '2026-10-16' })

  it('elige la columna que coincide con la API (aquí las ventas BRUTAS, que traen el IVA), y lo dice', () => {
    const api = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((f) => dia(f, Math.round(valorDelDia(f) * 1.15 * 100) / 100))
    const r = importarExportaciones([lee(csv)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO, diasApi: api })
    expect(r.validacion).toMatchObject({ columna: 'brutas', dias_comparados: 3, coinciden: 3 }) // el último día de la API puede estar a medias: no se compara
    expect(r.meses[0].resumen.ingreso).toBeCloseTo(Array.from({ length: 30 }, (_, i) => valorDelDia(`2026-09-${String(i + 1).padStart(2, '0')}`) * 1.15).reduce((s, v) => s + v, 0), 1)
  })
  it('si ninguna columna coincide, lo DECLARA con los días que difieren (no calla)', () => {
    const api = ['2026-10-01', '2026-10-02', '2026-10-03'].map((f) => dia(f, 9999))
    const r = importarExportaciones([lee(csv)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO, diasApi: api })
    expect(r.validacion?.coinciden).toBe(0)
    expect(r.declarado.join(' ')).toMatch(/validación contra la API: 2 de 2 días difieren/)
  })
  it('sin días en común con la API: lo declara y toma la primera columna disponible', () => {
    const r = importarExportaciones([lee(csv)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO, diasApi: [dia('2026-10-14', 100), dia('2026-10-15', 100)] })
    expect(r.validacion).toMatchObject({ dias_comparados: 0 })
    expect(r.declarado.join(' ')).toMatch(/sin días en común con la API/)
  })
})

describe('importar · recibos (una fila por recibo)', () => {
  // inglés, coma; con nombre de cliente y teléfono que NO se deben leer
  const cab = 'Date,Receipt number,Receipt type,Gross sales,Discounts,Net sales,Total collected,Cost of goods,Status,Customer name,Customer contacts,Description'
  const filas = [
    '2026-03-01 13:05:00,1-1001,Sale,10.00,0.00,8.70,10.00,3.00,,María Pérez,0991234567,Encebollado',
    '2026-03-01 13:40:00,1-1002,Sale,5.00,0.00,4.35,5.00,1.00,,Juan Soto,juan@x.com,Cola',
    '2026-03-01 21:30:00,1-1003,Refund,3.00,0.00,2.61,3.00,0.00,,,,Devolución',
    '2026-03-02 10:00:00,1-1004,Sale,7.50,0.00,6.52,7.50,2.00,Cancelled,,,Anulada',
    '2026-03-02 10:20:00,1-1005,Sale,12.00,0.00,10.43,12.00,4.00,,,,Ceviche',
  ]
  const lee = () => leerArchivo({ nombre: 'recibos-2026-03.csv', texto: [cab, ...filas, ...diasRestantes()].join('\n'), exportado_en: '2026-10-16' })
  // del 3 al 31 de marzo: un recibo por día, para que el mes quede cubierto entero
  const diasRestantes = () => Array.from({ length: 29 }, (_, i) => `2026-03-${String(i + 3).padStart(2, '0')} 12:00:00,1-2${String(i).padStart(3, '0')},Sale,10.00,0.00,8.70,10.00,3.00,,,,x`)

  it('mismas cifras que la API: tickets, ingreso, reembolsos, anuladas, horas y días (hora local)', () => {
    const r = importarExportaciones([lee()], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.validacion?.columna).toBe('total') // sin API: total cobrado primero
    const m = r.meses[0].resumen
    expect(m.tickets).toBe(2 + 1 + 29)
    expect(m.ingreso).toBeCloseTo(10 + 5 + 12 + 290, 2)
    expect(m.reembolsos).toBe(3)
    expect(m.anuladas).toBe(1)
    expect(m.por_hora.find((h) => h.hora === 13)?.tickets).toBe(2)
    expect(m.por_hora.find((h) => h.hora === 10)?.tickets).toBe(1)
  })
  it('lo personal no se lee: ningún nombre, teléfono ni correo llega al resultado ni a las fichas', () => {
    const r = importarExportaciones([lee()], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    const todo = JSON.stringify([r, fichasDeVentas({ client_id: CL, meses: r.meses, ahora: AHORA, exportacion: { fecha: '2026-10-16' } })])
    for (const x of ['María', 'Pérez', 'Juan', 'Soto', '0991234567', 'juan@x.com']) expect(todo).not.toContain(x)
    expect(JSON.stringify(leerArchivo({ nombre: 'r.csv', texto: [cab, ...filas].join('\n'), exportado_en: '2026-10-16' }))).not.toMatch(/María|0991234567|juan@/)
  })
  it('nada de costos ni de margen: las columnas de costo y ganancia nunca llegan a una ficha', () => {
    const r = importarExportaciones([lee()], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    for (const f of fichasDeVentas({ client_id: CL, meses: r.meses, ahora: AHORA, exportacion: { fecha: '2026-10-16' } })) {
      expect(f.atributo).not.toMatch(/margen|costo|utilidad|ganancia/)
      expect(f.contenido.replace(/no es margen/gi, '')).not.toMatch(/margen|utilidad|ganancia|costo (de|del|total)/i)
    }
  })
  it('el archivo por artículo de ese mes se une al mes; uno de varios meses queda como ficha del rango; sin periodo se declara', () => {
    const porArticulo = 'Nombre del artículo;Artículos vendidos;Ventas netas\nEncebollado con chifle;120;420,00\nCeviche mixto;10;85,00\nTotal;130;505,00'
    const r = importarExportaciones([lee(), leerArchivo({ nombre: 'ventas-por-articulo-2026-03.csv', texto: porArticulo, exportado_en: '2026-10-16' }), leerArchivo({ nombre: 'articulos-2025-11-01_2026-09-30.csv', texto: porArticulo, exportado_en: '2026-10-16' }), leerArchivo({ nombre: 'articulos.csv', texto: porArticulo, exportado_en: '2026-10-16' })], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses[0].resumen.por_item.map((i) => [i.item, i.unidades, i.ingreso])).toEqual([['Encebollado con chifle', 120, 420], ['Ceviche mixto', 10, 85]]) // «Total» no es un ítem
    expect(r.items_de_rango).toHaveLength(1)
    expect(r.items_de_rango[0]).toMatchObject({ desde: '2025-11-01', hasta: '2026-09-30' })
    expect(r.declarado.join(' ')).toMatch(/articulos\.csv: el archivo por artículo no dice su periodo/)
    const fr = fichasDeItemsDeRango({ client_id: CL, rangos: r.items_de_rango, exportado_en: '2026-10-16', mapaDeItems: { 'Encebollado con chifle': 'Encebollado Náufrago' } })
    expect(fr).toHaveLength(1)
    expect(fr[0].atributo).toBe('metrica:loyverse:items:rango:2025-11-01_2026-09-30')
    expect(fr[0].contenido).toMatch(/Encebollado Náufrago \(en el punto de venta: «Encebollado con chifle»\)/)
    expect(fr[0].contenido).toMatch(/un solo reporte del rango, no por mes/)
  })
})

describe('importar · bordes que no se pueden dejar al azar', () => {
  const lee = (nombre: string, texto: string) => leerArchivo({ nombre, texto, exportado_en: '2026-10-16' })
  const marzoEntero = (f: (d: number) => string) => Array.from({ length: 31 }, (_, i) => f(i + 1)).join('\n')
  it('recibos en español: «Reembolso» y «Anulado» se reconocen igual que Refund y Cancelled', () => {
    const cab = 'Fecha;Número de recibo;Tipo de recibo;Ventas brutas;Total recaudado;Estado'
    const dia = (d: number) => `${String(d).padStart(2, '0')}/03/2026 12:00;1-${d};Venta;10,00;10,00;`
    const texto = [cab, marzoEntero(dia), '05/03/2026 13:00;1-900;Reembolso;4,00;4,00;', '06/03/2026 13:00;1-901;Venta;9,00;9,00;Anulado'].join('\n')
    const r = importarExportaciones([lee('recibos.csv', texto)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses[0].resumen).toMatchObject({ tickets: 31, ingreso: 310, reembolsos: 4, anuladas: 1 })
  })
  it('el mes en curso (el que diga quien llama) no se importa aunque el archivo lo cubra entero', () => {
    const texto = ['Fecha;Ventas netas', marzoEntero((d) => `${String(d).padStart(2, '0')}/03/2026;10,00`)].join('\n')
    expect(importarExportaciones([lee('r.csv', texto)], { ahora: AHORA, mesEnCurso: '2026-03' }).meses).toEqual([])
    expect(importarExportaciones([lee('r.csv', texto)], { ahora: AHORA, mesEnCurso: '2026-04' }).meses.map((m) => m.periodo)).toEqual(['2026-03'])
  })
  it('si dos columnas coinciden por igual con la API, gana la primera por prioridad (total cobrado)', () => {
    const texto = ['Fecha;Total recaudado;Ventas netas', marzoEntero((d) => `${String(d).padStart(2, '0')}/03/2026;10,00;10,00`)].join('\n')
    const api = [{ f: '2026-03-10', ingreso: 10, tickets: 1, reembolsos: 0, anuladas: 0 }, { f: '2026-03-11', ingreso: 10, tickets: 1, reembolsos: 0, anuladas: 0 }, { f: '2026-03-12', ingreso: 10, tickets: 1, reembolsos: 0, anuladas: 0 }]
    expect(importarExportaciones([lee('r.csv', texto)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO, diasApi: api }).validacion).toMatchObject({ columna: 'total', coinciden: 2, dias_comparados: 2 })
  })
  it('si a UN día le falta el número de tickets, el mes entero queda «sin tickets» (no se suma un total engañoso)', () => {
    const texto = ['Fecha;Recibos;Ventas netas', marzoEntero((d) => `${String(d).padStart(2, '0')}/03/2026;${d === 7 ? '' : '3'};10,00`)].join('\n')
    const r = importarExportaciones([lee('r.csv', texto)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses[0].sinTickets).toBe(true)
    expect(r.meses[0].resumen.tickets).toBe(0)
  })
  it('recibos sin hora: no hay horas fuertes y se declara (no se inventa el mediodía)', () => {
    const texto = ['Fecha;Número de recibo;Tipo de recibo;Total recaudado', marzoEntero((d) => `${String(d).padStart(2, '0')}/03/2026;1-${d};Venta;10,00`)].join('\n')
    const r = importarExportaciones([lee('r.csv', texto)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses[0].resumen.por_hora).toEqual([])
    expect(r.declarado.join(' ')).toMatch(/2026-03: los recibos no traen hora/)
    expect(r.meses[0].resumen.tickets).toBe(31)
  })
  it('un archivo por artículo de medio mes NO se une al mes entero: queda como ficha de su rango', () => {
    const texto = ['Fecha;Ventas netas', marzoEntero((d) => `${String(d).padStart(2, '0')}/03/2026;10,00`)].join('\n')
    const items = 'Nombre del artículo;Artículos vendidos;Ventas netas\nCeviche;5;40,00'
    const r = importarExportaciones([lee('r.csv', texto), lee('ventas-por-articulo-2026-03-01_2026-03-15.csv', items)], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    expect(r.meses[0].resumen.por_item).toEqual([])
    expect(r.items_de_rango).toHaveLength(1)
    expect(r.items_de_rango[0]).toMatchObject({ desde: '2026-03-01', hasta: '2026-03-15' })
  })
  it('un nombre con una fecha completa no se lee como un mes (2026-03-15 ≠ marzo)', () => {
    expect(periodoDelNombre('items-2026-03-15.csv')).toBeNull()
  })
  it('el separador: punto y coma gana a la coma si hay más; coma y punto y coma empatados → coma', () => {
    expect(parsearCsv('a;b;c,d\n1;2;3,4')[0]).toEqual(['a', 'b', 'c,d'])
    expect(parsearCsv('a,b;c\n1,2;3')[0]).toEqual(['a', 'b;c'])
  })
  it('un número con punto y coma («1.234,56» y «1,234.56») sale igual sea cual sea el último separador', () => {
    expect(leerNumero('2.500,75')).toBe(2500.75)
    expect(leerNumero('2,500.75')).toBe(2500.75)
  })
})

describe('importar · mismas fichas que el brazo y sin duplicar', () => {
  const resumen = resumenPorDia('2026-03-01', '2026-03-31', valorDelDia, { tickets: true })
  it('la clave por mes es la misma que la de la API; repetir la importación no escribe nada nuevo; un mes ya archivado por otra vía no cambia', async () => {
    const r = importarExportaciones([leerArchivo({ nombre: 'r.csv', texto: resumen, exportado_en: '2026-10-16' })], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    const fichas = fichasDeVentas({ client_id: CL, meses: r.meses, ahora: AHORA, exportacion: { fecha: '2026-10-16' } })
    expect(fichas.map((f) => f.ref).sort()).toEqual([
      'brazo:propios:loyverse:dias_y_horas:2026-03', 'brazo:propios:loyverse:ingreso:2026-03', 'brazo:propios:loyverse:ticket_promedio:2026-03', 'brazo:propios:loyverse:tickets:2026-03',
    ])
    const t = { cerebro_fichas: [] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t as never)
    const a = await archivarFichasDeBrazos({ db: base.db, fichas, ahora: AHORA, dry_run: false, workflow_id: 'importar-csv-loyverse' })
    expect(a.errores).toEqual([])
    expect(a.escritas).toBe(4)
    const b = await archivarFichasDeBrazos({ db: base.db, fichas, ahora: AHORA, dry_run: false, workflow_id: 'importar-csv-loyverse' })
    expect(b.escritas).toBe(0)
    expect(b.iguales).toBe(4)
    expect(t.cerebro_fichas.filter((f) => f.atributo === 'metrica:loyverse:ingreso:2026-03' && !f.retirada_en)).toHaveLength(1)
    const ing = t.cerebro_fichas.find((f) => f.atributo === 'metrica:loyverse:ingreso:2026-03')!
    expect((ing.provenance_tag as { metrica: { valor: number } }).metrica.valor).toBeGreaterThan(0)
  })
  it('en seco no escribe', async () => {
    const r = importarExportaciones([leerArchivo({ nombre: 'r.csv', texto: resumen, exportado_en: '2026-10-16' })], { ahora: AHORA, mesEnCurso: MES_EN_CURSO })
    const t = { cerebro_fichas: [] as Array<Record<string, unknown>>, cerebro_ingresos: [] as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t as never)
    await archivarFichasDeBrazos({ db: base.db, fichas: fichasDeVentas({ client_id: CL, meses: r.meses, ahora: AHORA, exportacion: { fecha: '2026-10-16' } }), ahora: AHORA, dry_run: true })
    expect(base.escrituras).toEqual([])
  })
})
