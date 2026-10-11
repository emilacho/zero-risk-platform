/**
 * Ronda 72 · el PDF del manual LISTO PARA UN LECTOR (certificación CC#3 §B.3–B.5): sin «\!», frases de segmento bien escritas, sin palabras de oficina,
 * «En las piezas no se nombra a la competencia» · y una prueba por cada mutación viva del renderizador y de la limpieza (§B.4).
 * Datos REALES de Náufrago (manual v1 pasado por la limpieza).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { esTroncoSinVerbo, limpiarManual, quitarNombresInternos } from '../src/lib/manual/limpieza'
import { nombreCorto, nombreDelManual, palabrasLlanas, ponerNombresDeSegmento, renderManualLimpio, sinMarkdown } from '../src/lib/brand-book-render-limpio'

const D = 'src/lib/manual/__tests__/fixtures/repeticion-r68'
const V1 = JSON.parse(fs.readFileSync(`${D}/manual-v1.json`, 'utf8')) as Record<string, any>
const real = renderManualLimpio({ brand_book: limpiarManual(V1).manual as Record<string, unknown>, client_name: 'Náufrago', industry: 'restaurante costero', country: 'Ecuador', website: 'https://www.naufrago.ec', created_at: '2026-10-11T10:00:00Z' }).texto
const N = { 1: 'Locales', 2: 'Turistas de fin de semana', 3: 'Residentes y veraneantes de temporada en Olón', 4: 'Visitantes de playa' }

describe('el PDF real: se lee como escrito por una persona', () => {
  it('sin escapes de markdown: ni «\\!» ni «\\*» (los carácteres quedan)', () => {
    expect(real).not.toMatch(/\\[!*_#()]/); expect(real).toContain('Náufrago te espera!')
    expect(sinMarkdown('te espera\\! y 2 \\* 3 \\_x\\_ \\(a\\) \\# t')).toBe('te espera! y 2 * 3 _x_ (a) # t')
    expect(sinMarkdown('ruta C:\\carpeta')).toBe('ruta C:\\carpeta') // una barra que no escapa nada se queda
  })
  it('nada de «latente «Nombre» «cita»» ni del nombre repetido con su paréntesis ni comillas encadenadas', () => {
    expect(real).not.toMatch(/»\s+«/); expect(real).not.toMatch(/«Residentes y veraneantes de temporada»\s*\(/)
    expect(real).toContain('activa la objeción latente del segmento «Residentes y veraneantes de temporada»: «posible variación de calidad o disponibilidad de productos según la temporada»')
    expect(real).toMatch(/El segmento «Residentes y veraneantes de temporada» representa/)
    expect(real).toMatch(/riesgo de abandono más citado por el segmento «Residente local o visitante de largo plazo»\./)
    expect(real).not.toMatch(/segmento local «/)
  })
  it('los segmentos con comilla simple pasan a cita normal tras el nombre', () => {
    expect(real).toMatch(/resuelve el objetivo del segmento «Turista de fin de semana o feriado»: «disfrutar comida marina fresca sin moverse del alojamiento»/)
    expect(real).toMatch(/responde directamente al dolor del segmento «Residentes y veraneantes de temporada»: «oferta limitada de restaurantes con horario constante fuera de temporada alta»/)
    expect(real).not.toMatch(/'disfrutar|'oferta/)
  })
  it('el paréntesis «(S2, S4)» no se repite como nombres; las listas «S1 y S3» sí llevan los nombres', () => {
    expect(real).not.toMatch(/visitantes de playa \(«/); expect(real).toMatch(/declarado en «Residente local o visitante de largo plazo» y «Residentes y veraneantes de temporada»/)
  })
  it('sin palabras de oficina (churn, LTV, ICP, pool, copy, KPI…) y con su equivalente llano', () => {
    expect(real).not.toMatch(/\b(churn|LTV|ICP|pool|copy|KPI|ROI|CTA|goal|pain)\b/i)
    expect(real).toContain('un grupo de clientes de valor medio-largo con mayor propensión a recomendar')
  })
  it('competidores: la regla es para las piezas', () => {
    expect(renderManualLimpio({ brand_book: { positioning: 'x', competitor_mentions_policy: 'never_mention' }, client_name: 'X' }).texto).toContain('En las piezas no se nombra a la competencia.')
    expect(real).not.toContain('No se menciona a la competencia por nombre')
  })
})

describe('reescritura de segmentos · casos sueltos', () => {
  const p = (t: string) => ponerNombresDeSegmento(t, N)
  it('clave pegada a una cita: «del segmento «N»: «x»» (con «de» delante no se duplica; en plural, «de los segmentos»)', () => {
    expect(p('la objeción latente S3 «posible» fin')).toBe('la objeción latente del segmento «Residentes y veraneantes de temporada»: «posible» fin')
    expect(p('el criterio de S1 «sabor»')).toBe('el criterio del segmento «Locales»: «sabor»')
    expect(p('dolores de S1 y S2 «espera»')).toBe('dolores de los segmentos «Locales» y «Turistas de fin de semana»: «espera»')
    expect(p("objetivo S4 'comer rápido' y nada")).toBe('objetivo del segmento «Visitantes de playa»: «comer rápido» y nada')
  })
  it('«segmento <calificativo> S1» pierde el calificativo; «segmento S3 (descripción repetida)» no repite; una descripción NUEVA se conserva', () => {
    expect(p('el segmento local S1 es fiel')).toBe('el segmento «Locales» es fiel')
    expect(p('El segmento S3 (veraneantes de temporada) crece')).toBe('El segmento «Residentes y veraneantes de temporada» crece')
    expect(p('El segmento S3 (con tarjeta propia) crece')).toBe('El segmento «Residentes y veraneantes de temporada» (con tarjeta propia) crece')
    expect(p('en el segmento de S1 hay')).toBe('en el segmento de «Locales» hay')
  })
  it('el paréntesis que repite el nombre se va aunque difiera en género o número; palabras de 2 letras («de») no cuentan como repetición', () => {
    expect(p('El segmento S1 (locales) crece')).toBe('El segmento «Locales» crece')
    expect(p('El segmento S2 (turista de fin de semana) crece')).toBe('El segmento «Turistas de fin de semana» crece')
    expect(p('El segmento S4 (de) crece')).toBe('El segmento «Visitantes de playa» (de) crece')
  })
  it('sin nombre conocido NO se toca (ni en lista, ni pegada a una cita, ni entre paréntesis)', () => {
    expect(p('mira S9 y S1 «x»')).toBe('mira S9 y S1 «x»')
    expect(p('mira S9 «x»')).toBe('mira S9 «x»'); expect(p('mira (S9)')).toBe('mira (S9)'); expect(p('segmento nuevo S9')).toBe('segmento nuevo S9')
  })
})

describe('palabras llanas', () => {
  it('cada palabra de oficina con su equivalente', () => {
    expect(palabrasLlanas('riesgo de churn en el funnel con KPI y ROI; el CTA y el copy; el ICP')).toBe('riesgo de abandono en el embudo con indicador y retorno de la inversión; el llamado a la acción y el texto; el perfil de cliente ideal')
    expect(palabrasLlanas('un pool de LTV medio-largo')).toBe('un grupo de clientes de valor medio-largo')
    expect(palabrasLlanas('el LTV y el pool y los pain points / goals')).toBe('el valor del cliente en el tiempo y el grupo y los dolores / objetivos')
    expect(palabrasLlanas('copyright y pooling')).toBe('copyright y pooling') // palabras completas
  })
})

// ───────────────────────── las 16 mutaciones vivas (CC#3 §B.4)
describe('título y encabezado con el nombre del cliente', () => {
  it('el nombre del archivo y la segunda línea del PDF llevan el nombre (recortado); vacío ⇒ «Cliente»', () => {
    expect(nombreDelManual('  Cliente X  ')).toBe('Manual de Marca · Cliente X'); expect(nombreDelManual('')).toBe('Manual de Marca · Cliente'); expect(nombreDelManual(undefined as unknown as string)).toBe('Manual de Marca · Cliente')
    const r = renderManualLimpio({ brand_book: { positioning: 'p' }, client_name: ' Cliente X ' })
    expect(r.nombre).toBe('Manual de Marca · Cliente X'); expect(r.texto.split('\n').slice(0, 3)).toEqual(['MANUAL DE MARCA', 'Cliente X', ''])
  })
  it('sin nombre, el encabezado no inventa nada y no rompe', () => {
    expect(renderManualLimpio({ brand_book: { positioning: 'p' }, client_name: undefined as unknown as string }).texto.split('\n')[1]).toBe('')
  })
  it('línea de ubicación: solo con datos reales, en blanco o espacios no cuentan', () => {
    const l = (e: object) => renderManualLimpio({ brand_book: { positioning: 'p' }, client_name: 'X', ...e }).texto.split('\n')[3]
    expect(l({ industry: 'cocina', city: 'Olón', country: 'Ecuador' })).toBe('cocina · Olón, Ecuador'); expect(l({ industry: 'cocina' })).toBe('cocina'); expect(l({ city: 'Olón' })).toBe('Olón')
    expect(l({ industry: '  ', city: ' ', country: '' })).not.toMatch(/·/)
  })
})

describe('qué secciones salen (lleno / omitidas)', () => {
  const r = (b: Record<string, unknown>) => renderManualLimpio({ brand_book: b, client_name: 'X' })
  it('vacíos NO salen: cadena vacía, solo espacios, null, lista vacía; con contenido sí', () => {
    const x = r({ positioning: '   ', mision: '', proposito: null, personalidad: [], tagline_opciones: ['«a» [propuesta del agente — x]'], mensajes_clave: [''] })
    expect(x.secciones).toEqual(['tagline_opciones', 'mensajes_clave']); expect(x.omitidas).toEqual(expect.arrayContaining(['positioning', 'mision', 'proposito', 'personalidad']))
    expect(x.texto).not.toMatch(/POSICIONAMIENTO|MISIÓN|PROPÓSITO|PERSONALIDAD/)
  })
  it('un campo que no es texto (número, objeto, lista) en un bloque de prosa no se imprime ni rompe', () => {
    for (const v of [42, { a: 1 }, ['x'], true]) expect(r({ positioning: v }).secciones).not.toContain('positioning')
  })
  it('una lista con un elemento sí sale', () => {
    expect(r({ personalidad: ['Cálida'] }).texto).toContain('• Cálida')
  })
})

describe('el borrador completo vive en content_text', () => {
  const r = (b: Record<string, unknown>) => renderManualLimpio({ brand_book: b, client_name: 'X' })
  it('se prefiere el borrador de content_text y las columnas propias lo pisan', () => {
    const t = r({ content_text: JSON.stringify({ brand_book_draft: { positioning: 'del borrador', mision: 'misión del borrador' } }), positioning: 'de la columna' }).texto
    expect(t).toContain('de la columna'); expect(t).toContain('misión del borrador'); expect(t).not.toMatch(/^del borrador$/m) // la columna pisa al borrador
  })
  it('content_text ilegible, sin borrador, o con borrador que no es un objeto ⇒ se sigue con las columnas, sin romper', () => {
    for (const ct of ['no es json', JSON.stringify({ otra: 1 }), JSON.stringify({ brand_book_draft: 'texto' }), JSON.stringify({ brand_book_draft: null }), JSON.stringify({ brand_book_draft: 5 })]) expect(r({ content_text: ct, positioning: 'col' }).texto, ct).toContain('col')
    expect(r({ content_text: JSON.stringify({ brand_book_draft: 'texto' }), positioning: 'col' }).texto).not.toContain('texto\n')
  })
  it('solo con content_text (sin columnas) también sale', () => {
    expect(r({ content_text: JSON.stringify({ brand_book_draft: { positioning: 'solo borrador' } }) }).texto).toContain('solo borrador')
  })
})

describe('subtítulos «Segmento N» con línea en blanco, solo en el resumen de a quién le hablamos', () => {
  const icp = 'Segmento 1 — Locales.\nDolores: «a».\nSegmento 2 — Turistas.\nDolores: «b».'
  it('en icp_summary cada «Segmento N —» va precedido de UNA línea en blanco', () => {
    const t = renderManualLimpio({ brand_book: { icp_summary: icp }, client_name: 'X' }).texto
    expect(t).toContain('Dolores: «a».\n\nSegmento 2 — Turistas.'); expect(t).not.toMatch(/\n\n\nSegmento/)
  })
  it('en cualquier OTRO campo el texto «Segmento 2 — …» no se separa', () => {
    const t = renderManualLimpio({ brand_book: { customer_angle: 'Uno.\nSegmento 2 — Turistas.' }, client_name: 'X' }).texto
    expect(t).toContain('Uno.\nSegmento 2 — Turistas.')
  })
})

describe('bordes de la limpieza', () => {
  it('nombre corto: exactamente 2 palabras tras recortar se quedan con el recorte', () => {
    expect(nombreCorto('Turistas locales en Olón')).toBe('Turistas locales'); expect(nombreCorto('Turistas en Playa')).toBe('Turistas en Playa')
  })
  it('bloques sin cerrar o con cierre suelto: lo balanceado se limpia, lo roto se deja', () => {
    expect(quitarNombresInternos('Abre (jueves sin cerrar y (campo_x) fin').texto).toBe('Abre (jueves sin cerrar y fin')
    expect(quitarNombresInternos('Cierra suelto) y (campo_x) fin').texto).toBe('Cierra suelto) y fin')
    expect(quitarNombresInternos('Solo ( abre').texto).toBe('Solo ( abre')
  })
  it('anidados muy hondos (más de 8 niveles): el bloque externo con nombre interno se quita igual', () => {
    const hondo = '('.repeat(10) + 'x' + ')'.repeat(10)
    expect(quitarNombresInternos(`Dato (campo_x: ${hondo}) fin.`).texto).toBe('Dato fin.')
    expect(quitarNombresInternos(`Dato (nota ${hondo}) fin.`).texto).toBe(`Dato (nota ${hondo}) fin.`)
  })
  it('tronco sin verbo: 12 palabras todavía; 13 ya no; vacío no', () => {
    const con = (n: number) => 'La objeción sobre ' + Array(n - 3).fill('frescura').join(' ') + '.'
    expect(esTroncoSinVerbo(con(12))).toBe(true); expect(esTroncoSinVerbo(con(13))).toBe(false); expect(esTroncoSinVerbo('')).toBe(false)
  })
  it('las listas de términos NO son prosa: no se tocan ni por defecto', () => {
    const m = { forbidden_words: ['gas'], required_terminology: ['término (campo_x)'], voz: 'Cocina a gas. Cálida.' }
    const r = limpiarManual(m).manual as Record<string, any>
    expect(r.forbidden_words).toEqual(['gas']); expect(r.required_terminology).toEqual(['término (campo_x)']); expect(r.voz).toBe('Cálida.')
  })
})
