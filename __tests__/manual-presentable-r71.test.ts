/**
 * Ronda 71 · el manual y su PDF PRESENTABLES para un lector. Datos REALES de Náufrago (cliente 0a2ffbd4…): v1 (la del cimiento) y v2 (la primera limpieza).
 *   limpieza: nunca «(: «…»)», un tronco sin verbo sale entero · PDF: sin ** , etiquetas presentables, S1–S4 con nombre del segmento, sin líneas cortadas.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { limpiarManual, esTroncoSinVerbo, quitarNombresInternos } from '../src/lib/manual/limpieza'
import { nombreCorto, nombresDeSegmentos, ponerNombresDeSegmento, presentarEtiquetas, renderManualLimpio, sinMarkdown } from '../src/lib/brand-book-render-limpio'

const D = 'src/lib/manual/__tests__/fixtures/repeticion-r68'
const V1 = JSON.parse(fs.readFileSync(`${D}/manual-v1.json`, 'utf8')) as Record<string, any>
const V2 = JSON.parse(fs.readFileSync(`${D}/manual-v2.json`, 'utf8')) as Record<string, any>
const limpio = (m: Record<string, unknown>) => renderManualLimpio({ brand_book: m, client_name: 'Cliente X' })

describe('1 · limpieza: «(: «…»)» y troncos sin verbo', () => {
  it('rojo (v2 de hoy): trae «(: «Disponibilidad…»)» y «La objeción S2 sobre frescura del marisco.»', () => {
    expect(V2.retention_notes).toMatch(/\(: «Disponibilidad/); expect(V2.retention_notes).toContain('La objeción S2 sobre frescura del marisco.')
  })
  it('verde: v1 por la limpieza actual NO deja ni el «(: …)» ni el tronco, y conserva lo demás de retention_notes', () => {
    const r = (limpiarManual(V1).manual as Record<string, any>).retention_notes as string
    expect(r).not.toMatch(/\(\s*[:;,]/); expect(r).not.toContain('La objeción S2 sobre frescura')
    expect(r).toContain('Palanca principal de retención: relación directa por WhatsApp con pedido recurrente.')
    expect(r).toContain('El segmento S3 (veraneantes de temporada) representa un pool de LTV medio-largo'); expect(r).toContain('Canales de fidelización activos')
    expect(r).not.toMatch(/ICP|icp_|discovery_summary/)
  })
  it('el bloque con una cita que lleva su propio paréntesis se quita ENTERO (antes quedaba «(: «…(cierra mar–mié)»)»)', () => {
    expect(quitarNombresInternos('Riesgo del segmento local (ICP objections S1: «Abre jueves–lunes (cierra mar–mié)») más citado.').texto).toBe('Riesgo del segmento local más citado.')
    expect(quitarNombresInternos('Dato (campo_x: «a (b) c»; otro_campo: «d») fin.').texto).toBe('Dato fin.')
  })
  it('un paréntesis legítimo (sin nombre interno) se queda, aunque lleve uno interno adentro: solo se quita lo interno', () => {
    expect(quitarNombresInternos('Abre (jueves a lunes) siempre.').texto).toBe('Abre (jueves a lunes) siempre.')
    expect(quitarNombresInternos('Abre (jueves a lunes (dato_interno)) siempre.').texto).toBe('Abre (jueves a lunes) siempre.')
  })
  it('red de seguridad: si una cita queda con puntuación suelta al abrir, esa puntuación se va («(: «x»)» ⇒ «(«x»)»)', () => {
    expect(quitarNombresInternos('Mira (: «cita») ahora.').texto).toBe('Mira («cita») ahora.')
  })
  it('tronco sin verbo: solo se va la oración que PERDIÓ un bloque y quedó «determinante + sustantivo de referencia + preposición…» sin verbo', () => {
    expect(esTroncoSinVerbo('La objeción S2 sobre frescura del marisco.')).toBe(true)
    expect(esTroncoSinVerbo('El dolor S3 de la espera.')).toBe(true)
    for (const ok of ['El dato importa.', 'La objeción es clara.', 'La objeción S2 sobre frescura es el riesgo principal.', 'El cliente valora la consistencia.', 'Hay una objeción sobre precio.']) expect(esTroncoSinVerbo(ok), ok).toBe(false)
    expect(quitarNombresInternos('Todo sigue igual. La objeción S2 sobre frescura (icp_signals.objeciones). Fin.').texto).toBe('Todo sigue igual. Fin.')
    // una oración igual de corta pero SIN haber perdido ningún bloque no se toca
    expect(quitarNombresInternos('La objeción sobre frescura. Fin.').texto).toBe('La objeción sobre frescura. Fin.')
  })
  it('todo el manual v1: ningún «(: », ningún tronco de ese tipo, idempotente', () => {
    const m = limpiarManual(V1).manual
    const t = JSON.stringify(m)
    expect(t).not.toMatch(/\(\s*[:;,]/); expect(t).not.toMatch(/La objeción S\d sobre/)
    expect(JSON.stringify(limpiarManual(m).manual)).toBe(t)
  })
})

describe('2 · el PDF (texto del manual limpio) presentable', () => {
  const v2 = limpio(V2).texto
  const v3 = limpio(limpiarManual(V1).manual as Record<string, unknown>).texto
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
      expect(t).toContain('«Cuando tengas esa hambre de... Náufrago te espera!» — frase del cliente')
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
