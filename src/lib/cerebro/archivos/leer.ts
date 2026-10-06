/**
 * Despachador de lectura de archivos (paso 5 del cerebro): recibe los bytes en base64 (nunca una dirección), los reconoce por su firma
 * y llama al lector que toca. Sin modelo, sin red, sin escribir. El resultado se puede guardar y mostrar: no trae los bytes ni el base64.
 * Una imagen NO se lee aquí: queda lista (tipo, mime, huella y tamaño) para que otra ruta la mire.
 */
import { recibirBytes } from './bytes'
import { lectura } from './comun'
import { leerHoja } from './hoja'
import type { LecturaDeArchivo } from './tipos'
import { leerPdf } from './pdf'
import { leerWord } from './word'

const ESTADO_DEL_RECHAZO = { base64_invalido: 'ilegible', vacio: 'vacio', sobre_el_tope: 'sobre_el_tope', tipo_no_admitido: 'tipo_no_admitido', tipo_no_coincide: 'tipo_no_admitido' } as const

export async function leerArchivo(entrada: unknown): Promise<LecturaDeArchivo> {
  const r = recibirBytes(entrada)
  if (!r.ok) {
    return { estado: ESTADO_DEL_RECHAZO[r.motivo], tipo: null, nombre: r.nombre, huella: null, bytes: 0, texto: '', avisos: [], motivo: `${r.motivo}: ${r.detalle}` }
  }
  const { bytes, nombre } = r
  switch (r.tipo) {
    case 'pdf': return leerPdf(bytes, nombre)
    case 'word': return leerWord(bytes, nombre)
    case 'hoja': return leerHoja(bytes, nombre, 'xlsx')
    case 'csv': return leerHoja(bytes, nombre, 'csv')
    case 'imagen': return lectura('imagen', nombre, bytes, 'ok', { mime: r.mime })
    case 'texto': {
      const texto = bytes.toString('utf8').replace(/^﻿/, '')
      return texto.trim() ? lectura('texto', nombre, bytes, 'ok', { texto, mime: r.mime }) : lectura('texto', nombre, bytes, 'vacio', { mime: r.mime, motivo: 'el texto está vacío' })
    }
  }
}
