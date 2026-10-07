/**
 * Lector de hojas: CSV y XLSX → CSV → filas como texto (cada fila se explica sola). Casos escritos ANTES del código.
 */
import { describe, expect, it } from 'vitest'
import { leerHoja } from '../hoja'
import { TOPES } from '../topes'
import { crearXlsx, crearZip } from './muestras'

const csv = (t: string, nombre = 'x.csv') => leerHoja(Buffer.from(t, 'utf8'), nombre, 'csv')

describe('CSV', () => {
  it('cada fila se escribe con su encabezado: «Columna: valor | …»', () => {
    const r = csv('Servicio,Precio,Unidad\nConsulta,40,hora\nRevision,25,visita\n')
    expect(r.estado).toBe('ok'); expect(r.tipo).toBe('csv'); expect(r.filas).toBe(2)
    expect(r.texto).toContain('Columnas: Servicio | Precio | Unidad')
    expect(r.texto).toContain('fila 2: Servicio: Consulta | Precio: 40 | Unidad: hora')
    expect(r.texto).toContain('fila 3: Servicio: Revision | Precio: 25 | Unidad: visita')
  })
  it('detecta punto y coma y tabulación', () => {
    expect(csv('a;b\n1;2').texto).toContain('a: 1 | b: 2')
    expect(csv('a\tb\n1\t2').texto).toContain('a: 1 | b: 2')
  })
  it('comillas con comas, comillas dobles escapadas y saltos de línea dentro de la celda; BOM', () => {
    const r = csv('﻿nombre,nota\n"Pérez, Ana","dijo ""hola""\ny siguió"\n')
    expect(r.texto).toContain('nombre: Pérez, Ana')
    expect(r.texto).toContain('nota: dijo "hola"\ny siguió')
    expect(r.filas).toBe(1)
  })
  it('las celdas vacías se omiten y las filas vacías se saltan', () => {
    const r = csv('a,b,c\n1,,3\n,,\n4,5,\n')
    expect(r.texto).toContain('fila 2: a: 1 | c: 3'); expect(r.texto).toContain('fila 4: a: 4 | b: 5'); expect(r.texto).not.toContain('fila 3')
  })
  it('cada 20 filas hay una línea en blanco y se repite «Columnas:» (así el sistema corta en segmentos que se explican solos)', () => {
    const filas = Array.from({ length: 45 }, (_, i) => `p${i},${i}`).join('\n')
    const r = csv('producto,precio\n' + filas)
    expect(r.texto.match(/^Columnas: producto \| precio$/gm)?.length).toBe(3)
    expect(r.texto.split('\n\n').length).toBe(3)
  })
  it('una fórmula maliciosa en una celda se lee como TEXTO, no se interpreta', () => {
    const r = csv('a,b\n"=cmd|\' /C calc\'!A0",2')
    expect(r.estado).toBe('ok'); expect(r.texto).toContain("a: =cmd|' /C calc'!A0")
  })
  it('sin filas de datos: vacío', () => { expect(csv('solo,encabezado\n').estado).toBe('vacio') })
  it('topes: filas, columnas y tamaño de celda se cortan con aviso', () => {
    const grande = 'a,b\n' + Array.from({ length: TOPES.hoja_filas + 50 }, (_, i) => `${i},x`).join('\n')
    const r = csv(grande)
    expect(r.filas).toBe(TOPES.hoja_filas); expect(r.avisos.join(' ')).toMatch(/filas/i)
    const ancha = csv(Array.from({ length: TOPES.hoja_columnas + 10 }, (_, i) => 'c' + i).join(',') + '\n' + Array.from({ length: TOPES.hoja_columnas + 10 }, () => '1').join(','))
    expect(ancha.avisos.join(' ')).toMatch(/columnas/i)
    const celda = csv('a\n' + 'z'.repeat(TOPES.celda_chars + 500))
    expect(celda.avisos.join(' ')).toMatch(/celda/i)
  })
})

describe('XLSX', () => {
  const libro = () => crearXlsx([
    { nombre: 'Tarifas', filas: [['Servicio', 'Precio', 'Activo'], ['Consulta', 40, true], ['Contrato', 300.5, false], [null, null, null], ['Visita & campo', 25, true]] },
    { nombre: 'Notas', enLinea: true, filas: [['Tema', 'Detalle'], ['Pagos', 'Se paga al inicio']] },
  ])
  it('lee cadenas compartidas y en línea, números y booleanos; una hoja tras otra con su nombre', () => {
    const r = leerHoja(libro(), 'l.xlsx', 'xlsx')
    expect(r.estado).toBe('ok'); expect(r.tipo).toBe('hoja'); expect(r.hojas).toEqual(['Tarifas', 'Notas'])
    expect(r.texto).toContain('Hoja «Tarifas»')
    expect(r.texto).toContain('fila 2: Servicio: Consulta | Precio: 40 | Activo: VERDADERO')
    expect(r.texto).toContain('fila 3: Servicio: Contrato | Precio: 300.5 | Activo: FALSO')
    expect(r.texto).toContain('Servicio: Visita & campo | Precio: 25')
    expect(r.texto).toContain('Hoja «Notas»'); expect(r.texto).toContain('Tema: Pagos | Detalle: Se paga al inicio')
  })
  it('la fila vacía se salta pero conserva su número', () => {
    const r = leerHoja(libro(), 'l.xlsx', 'xlsx')
    expect(r.texto).not.toContain('fila 4:'); expect(r.texto).toContain('fila 5:')
  })
  it('XLSX corrupto o sin libro: ilegible', () => {
    const bueno = libro()
    expect(leerHoja(bueno.subarray(0, 50), 'x.xlsx', 'xlsx').estado).toBe('ilegible')
    expect(leerHoja(crearZip([{ nombre: 'otra.xml', datos: '<a/>' }]), 'x.xlsx', 'xlsx').estado).toBe('ilegible')
  })
  it('cifrado: protegido', () => {
    expect(leerHoja(crearZip([{ nombre: 'xl/workbook.xml', datos: '<workbook/>', cifrada: true }]), 'x.xlsx', 'xlsx').estado).toBe('protegido')
  })
  it('más filas que el tope: se corta con aviso', () => {
    const r = leerHoja(crearXlsx([{ nombre: 'G', filas: [['n'], ...Array.from({ length: TOPES.hoja_filas + 30 }, (_, i) => [i])] }]), 'g.xlsx', 'xlsx')
    expect(r.filas).toBe(TOPES.hoja_filas); expect(r.avisos.join(' ')).toMatch(/filas/i)
  })
  it('avisa que las fechas pueden venir como número de serie y que las fórmulas se leen como se guardó su valor', () => {
    expect(leerHoja(libro(), 'l.xlsx', 'xlsx').avisos.join(' ')).toMatch(/fechas|fórmulas/i)
  })
})
