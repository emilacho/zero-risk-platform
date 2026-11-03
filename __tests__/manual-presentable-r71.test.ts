/**
 * Ronda 71 · el PDF del manual PRESENTABLE para un lector. Datos REALES de Náufrago (cliente 0a2ffbd4…): v2 (la primera limpieza) y v1 limpia (manual-v1-limpia.json: la salida congelada de la limpieza por código, quitada el 03-nov).
 *   PDF: sin ** , etiquetas presentables, S1–S4 con nombre del segmento, sin líneas cortadas.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { nombreCorto, nombresDeSegmentos, ponerNombresDeSegmento, presentarEtiquetas, renderManualLimpio, sinMarkdown } from '../src/lib/brand-book-render-limpio'

const D = 'src/lib/manual/__tests__/fixtures/repeticion-r68'
const V1_LIMPIA = JSON.parse(fs.readFileSync(D + '/manual-v1-limpia.json', 'utf8')) as Record<string, unknown>
const V2 = JSON.parse(fs.readFileSync(`${D}/manual-v2.json`, 'utf8')) as Record<string, any>
const limpio = (m: Record<string, unknown>) => renderManualLimpio({ brand_book: m, client_name: 'Cliente X' })

describe('2 · el PDF (texto del manual limpio) presentable', () => {
  const v2 = limpio(V2).texto
  const v3 = limpio(V1_LIMPIA).texto
  it('rojo (el PDF de v2 de hoy en el formato anterior): asteriscos, etiquetas entre corchetes, claves S1–S4 y «ICP»', () => {
    const crudo = JSON.stringify(V2)
    expect(crudo).toContain('**Segmento 1'); expect(crudo).toMatch(/\[frase propia del cliente/); expect(crudo).toMatch(/\bS[1-4]\b/)
  })
  for (const [nombre, t] of [['v2 (la guardada)', v2], ['v1 limpiada hoy', v3]] as const) {
    it(`${nombre}: sin ** ni __ , sin corchetes, sin claves S1–S4, sin «ICP», sin nombres internos`, () => {
      expect(t).not.toMatch(/\*\*|__/); expect(t).not.toMatch(/\[[^\]]*\]/); expect(t).not.toMatch(/\bS[1-9]\b/); expect(t).not.toMatch(/\bICP\b/); expect(t).not.toMatch(/discovery_summary|icp_signals|\b[a-z]+_[a-z_]+\b/)
    })
    it(`${nombre}: los segmentos salen con su NOMBRE y como subtítulos; las etiquetas, como nota discreta`, () => {
      expect(t).toContain('Segmento 1 — Residente local o visitante de largo plazo en Olón'); expect(t).not.toContain('**')
      expect(t).toMatch(/«Residente local o visitante de largo plazo»/); expect(t).not.toMatch(/\b(goal|pain)\b/)
      // 01-nov · ADENDA de Emilio: la frase propia ya no va entre los lemas: sale como eslogan, con su fuente
      expect(t).toMatch(/UNA FRASE QUE EL CLIENTE USA[\s\S]*Cuando tengas esa hambre de\.\.\. Náufrago te espera!/)
      expect(t).toMatch(/«El encebollado y ceviche que llegan a donde estás» — propuesta/)
    })
    it(`${nombre}: sin líneas cortadas: cada párrafo o viñeta es UNA línea (el documento acomoda el ancho)`, () => {
      const lineas = t.split('\n')
      for (const l of lineas) if (l.startsWith('•')) expect(l.length).toBeGreaterThan(2)
      expect(lineas.some((l) => l.length > 160)).toBe(true) // los párrafos largos no se parten a 76 columnas
      expect(t).not.toMatch(/\n[a-záéíóúñ]/) // ninguna línea arranca en minúscula (resto de un corte)
      expect(t).toContain('• Constante y confiable — el perfil de cliente ideal de residentes y recurrentes valora consistencia pedido a pedido; la voz no promete lujo, promete que siempre estará')
    })
  }
})

describe('2 · piezas de presentación', () => {
  it('sinMarkdown: ** en cualquier parte, __ y # de encabezado; no toca asteriscos sueltos de multiplicación', () => {
    expect(sinMarkdown('**Segmento 1 — Algo.**\nTexto **negrita** y __otra__.')).toBe('Segmento 1 — Algo.\nTexto negrita y otra.')
    expect(sinMarkdown('## Título\nsigue')).toBe('Título\nsigue')
    expect(sinMarkdown('2 * 3 = 6')).toBe('2 * 3 = 6')
  })
  it('presentarEtiquetas: frase del cliente / propuesta; cualquier otra anotación entre corchetes se quita', () => {
    expect(presentarEtiquetas('«Hola» [frase propia del cliente, verbatim, sitio]')).toBe('«Hola» — frase del cliente')
    expect(presentarEtiquetas('«Otro» [propuesta del agente — centra el delivery]')).toBe('«Otro» — propuesta')
    expect(presentarEtiquetas('Pídenos [canal preferido S1-S4 + diferenciador] ya')).toBe('Pídenos ya')
  })
  it('nombresDeSegmentos y ponerNombresDeSegmento: sueltas, en listas, en rangos; sin nombre ⇒ se deja', () => {
    const n = nombresDeSegmentos('**Segmento 1 — Locales.**\nx\n**Segmento 2 — Turistas de fin de semana.**\n**Segmento 3 — Veraneantes.**\n**Segmento 4 — Visitantes de playa.**')
    expect(n).toEqual({ 1: 'Locales', 2: 'Turistas de fin de semana', 3: 'Veraneantes', 4: 'Visitantes de playa' })
    expect(ponerNombresDeSegmento('Para S1 y S3.', n)).toBe('Para «Locales» y «Veraneantes».')
    expect(ponerNombresDeSegmento('Para S2, S4 y S1/S3', n)).toBe('Para «Turistas de fin de semana», «Visitantes de playa», «Locales» y «Veraneantes»')
    expect(ponerNombresDeSegmento('canal S1-S3', n)).toBe('canal «Locales», «Turistas de fin de semana» y «Veraneantes»')
    expect(nombreCorto('Residente local o visitante de largo plazo en Olón')).toBe('Residente local o visitante de largo plazo')
    expect(nombreCorto('Residentes y veraneantes de temporada en Olón y zonas aledañas (clientes recurrentes)')).toBe('Residentes y veraneantes de temporada')
    expect(nombreCorto('Locales')).toBe('Locales'); expect(nombreCorto('Turistas en Playa')).toBe('Turistas en Playa') // un nombre de una sola palabra tras recortar se deja completo
    expect(ponerNombresDeSegmento('Solo S9 aquí', n)).toBe('Solo S9 aquí'); expect(ponerNombresDeSegmento('S1', {})).toBe('S1')
  })
})
