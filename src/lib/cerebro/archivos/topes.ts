/**
 * Los TOPES de los lectores de archivo (paso 5 del cerebro). Se aplican ANTES de gastar memoria o tiempo.
 * Los cuatro primeros los fijó el encargo (imagen ≤ 5 MB · PDF ≤ 10 MB y ≤ 100 páginas · hoja ≤ 5 MB · 25 s); los demás son del lector y se declaran aquí
 * (Word ≤ 10 MB como el PDF; los de ZIP, hoja y salida evitan bombas de compresión y salidas gigantes).
 */
const MB = 1024 * 1024

export const TOPES = {
  imagen_bytes: 5 * MB,
  pdf_bytes: 10 * MB,
  pdf_paginas: 100,
  hoja_bytes: 5 * MB,
  word_bytes: 10 * MB,
  texto_bytes: 2 * MB,
  tiempo_ms: 25_000,
  /** lo más que un lector devuelve como texto (se corta con aviso) */
  texto_salida_chars: 2_000_000,
  hoja_filas: 20_000,
  hoja_columnas: 200,
  hoja_hojas: 20,
  celda_chars: 2_000,
  /** ZIP (Word y XLSX): entradas, una entrada descomprimida y el total descomprimido */
  zip_entradas: 500,
  zip_entrada_bytes: 20 * MB,
  zip_total_bytes: 60 * MB,
  /** PDF: lo que puede inflarse un flujo comprimido (se mide ANTES de abrir el PDF), el total de todos los flujos y cuántos flujos se revisan */
  pdf_flujo_bytes: 32 * MB,
  pdf_flujos_total_bytes: 128 * MB,
  pdf_flujos_max: 50_000,
  /** PDF: trozos de texto por página que se juntan antes de cortar la página */
  pdf_items_por_pagina: 400_000,
  /** PDF: cuántas lecturas puede haber esperando turno en un proceso (de a una se leen); la que llegue de más se rechaza sin leer */
  pdf_cola_max: 8,
} as const

/** el archivo más grande que se admite de cualquier tipo: el tope del base64 sale de aquí (4 caracteres por cada 3 bytes) */
export const MAXIMO_DE_BYTES = Math.max(TOPES.imagen_bytes, TOPES.pdf_bytes, TOPES.hoja_bytes, TOPES.word_bytes, TOPES.texto_bytes)
export const MAXIMO_DE_BASE64 = Math.ceil((MAXIMO_DE_BYTES * 4) / 3) + 8
