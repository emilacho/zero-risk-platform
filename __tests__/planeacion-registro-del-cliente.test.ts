/**
 * Relevo 62 · el redactor del plan toma el REGISTRO (tuteo / voseo / usted) del manual del cliente y no lo inventa.
 * Casos escritos ANTES del código (rojo primero). El texto que se prueba es EL MISMO que se pega en los nodos de n8n.
 * Agnóstico: cliente, país y rubro son DATOS de las pruebas; el código no nombra ninguno.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const ARCHIVO = 'scripts/worker-staging/X9F0zp6LQ2xGEYVS/registro-del-cliente.js'
const texto = fs.readFileSync(ARCHIVO, 'utf8')
type Reg = { registro: 'tuteo' | 'voseo' | 'formal' | 'sin_dato'; fuente: string; pruebas: string[] }
const lib = new Function(`${texto}\nreturn { registroDelManual, registroFinal, bloqueDeRegistro, marcasDeRegistro, REGISTRO_POR_PAIS }`)() as {
  registroDelManual: (fila: Record<string, unknown>) => Reg
  registroFinal: (delManual: Reg, pais: unknown) => Reg & { aviso: string | null }
  bloqueDeRegistro: (r: Reg) => string[]
  marcasDeRegistro: (t: string) => { tuteo: number; voseo: number; formal: number }
  REGISTRO_POR_PAIS: Record<string, string>
}
const fila = (voz: string, extra: Record<string, unknown> = {}) => ({ voice_description: voz, ...extra })
const draft = (d: Record<string, unknown>) => ({ content_text: JSON.stringify({ brand_book_draft: d }) })

describe('lo que el manual DECLARA', () => {
  it.each([
    ['Voz cálida. Tutea siempre al cliente.', 'tuteo'],
    ['Nunca uses vos; habla de tú.', 'tuteo'],
    ['Tuteo cercano en todos los canales.', 'tuteo'],
    ['Usa voseo en todo texto: es la forma de la marca.', 'voseo'],
    ['Habla con voseo rioplatense.', 'voseo'],
    ['Trato de usted en todo momento: registro formal.', 'formal'],
    ['Siempre de usted, con respeto.', 'formal'],
  ])('«%s» ⇒ %s (declarado en el manual)', (voz, esperado) => {
    const r = lib.registroDelManual(fila(voz))
    expect(r.registro).toBe(esperado); expect(r.fuente).toBe('declarado_en_el_manual'); expect(r.pruebas.length).toBeGreaterThan(0)
  })
  it('una declaración en cualquier campo de texto del borrador del manual también cuenta', () => {
    expect(lib.registroDelManual({ ...draft({ personalidad: 'Tutea siempre', mision: 'Servir' }) }).registro).toBe('tuteo')
  })
  it('declaraciones que se contradicen no se eligen: queda sin declarar (y se mira lo escrito)', () => {
    const r = lib.registroDelManual(fila('Tutea siempre. También usa voseo.'))
    expect(r.fuente).not.toBe('declarado_en_el_manual')
  })
  it('«no uses usted» o «sin usted» NO declara trato formal', () => {
    expect(lib.registroDelManual(fila('Cercano, sin usted ni formalismos. Tutea.')).registro).toBe('tuteo')
  })
})

describe('lo que el manual ESCRIBE (cuando no declara)', () => {
  it('formas de voseo repetidas en sus textos ⇒ voseo (inferido de los textos del manual)', () => {
    const r = lib.registroDelManual(draft({ tagline_opciones: ['Pedí hoy lo que querés', 'Vení y probá'], mensajes_clave: 'Sabés lo que comés' }))
    expect(r).toMatchObject({ registro: 'voseo', fuente: 'inferido_de_los_textos_del_manual' }); expect(r.pruebas.length).toBeGreaterThanOrEqual(2)
  })
  it('formas de tuteo repetidas ⇒ tuteo', () => {
    const r = lib.registroDelManual(draft({ tagline_opciones: ['Tú decides cuándo', 'Sabes lo que comes'], propuestas_de_valor: ['Si quieres, puedes pedir ya'] }))
    expect(r).toMatchObject({ registro: 'tuteo', fuente: 'inferido_de_los_textos_del_manual' })
  })
  it('«tu» posesivo NO distingue (se usa igual en voseo y en tuteo): sin pistas ⇒ sin dato', () => {
    expect(lib.registroDelManual(draft({ required_terminology: ['tu mesa', 'tu puerta'] })).registro).toBe('sin_dato')
  })
  it('una sola marca suelta o marcas de los dos lados NO deciden: sin dato (no se inventa)', () => {
    expect(lib.registroDelManual(draft({ a: 'Vení' })).registro).toBe('sin_dato')
    expect(lib.registroDelManual(draft({ a: 'Pedí ya', b: 'Tú decides', c: 'Sabes más', d: 'Vení' })).registro).toBe('sin_dato')
  })
  it('las listas de lo PROHIBIDO o lo que hay que evitar no cuentan (citan lo que no se debe decir)', () => {
    const r = lib.registroDelManual(draft({ forbidden_words: ['vos', 'tenés', 'querés', 'pedí'], palabras_a_evitar: ['sos', 'vení'] }))
    expect(r.registro).toBe('sin_dato')
  })
  it('un manual vacío o ilegible ⇒ sin dato, sin romper', () => {
    for (const x of [{}, { content_text: 'no es json' }, { content_text: null }, { voice_description: null }]) expect(lib.registroDelManual(x as never).registro).toBe('sin_dato')
  })
  it('las marcas respetan las palabras completas y las tildes («ven» o «sos» dentro de otra palabra no cuentan; «vos» sí)', () => {
    expect(lib.marcasDeRegistro('sostenible y sosegado, convenir').voseo).toBe(0)
    expect(lib.marcasDeRegistro('Pedí lo que querés, vos sos así').voseo).toBeGreaterThanOrEqual(4)
    expect(lib.marcasDeRegistro('Tú tienes lo que quieres; puedes pedir').tuteo).toBeGreaterThanOrEqual(4)
    expect(lib.marcasDeRegistro('Usted decide; ustedes también').formal).toBe(1) // «ustedes» (plural) no marca trato formal
  })
})

describe('el registro FINAL: manual primero, país por omisión, y si no hay nada se dice', () => {
  const sin = { registro: 'sin_dato', fuente: 'sin_dato', pruebas: [] } as Reg
  it('lo que dice el manual manda sobre el país', () => {
    const r = lib.registroFinal({ registro: 'voseo', fuente: 'declarado_en_el_manual', pruebas: ['x'] }, 'Ecuador')
    expect(r.registro).toBe('voseo'); expect(r.fuente).toBe('declarado_en_el_manual'); expect(r.aviso).toBeNull()
  })
  it('sin dato en el manual rige el DATO del país de la ficha, declarado como omisión (no como decisión del manual)', () => {
    const r = lib.registroFinal(sin, 'Ecuador')
    expect(r).toMatchObject({ registro: 'tuteo', fuente: 'por_omision_del_pais_de_la_ficha' }); expect(r.aviso).toMatch(/el manual no fija el registro/i)
    expect(lib.registroFinal(sin, 'Argentina').registro).toBe('voseo')
    expect(lib.registroFinal(sin, '  méxico ').registro).toBe('tuteo') // sin tildes ni mayúsculas ni espacios
  })
  it('r63 · R-1 · un registro solo INFERIDO que contradice al del país NO gana: manda el país y el conflicto queda DICHO', () => {
    const inferido = { registro: 'voseo', fuente: 'inferido_de_los_textos_del_manual', pruebas: ['4 marcas de voseo y ninguna de otro registro'] } as Reg
    const r = lib.registroFinal(inferido, 'Ecuador')
    expect(r).toMatchObject({ registro: 'tuteo', fuente: 'por_omision_del_pais_de_la_ficha' })
    expect(r.aviso).toMatch(/voseo/); expect(r.aviso).toMatch(/no lo declara|no está declarado|solo lo sugieren/i)
    expect(r.pruebas.join(' ')).toMatch(/voseo/) // la sospecha queda a la vista para quien revisa
  })
  it('r63 · el caso de CC#3: manual de un cliente de Ecuador escrito SOLO en voseo (sin ninguna marca de tuteo, sin declarar) ⇒ el plan sale en TUTEO', () => {
    const m = lib.registroDelManual(draft({ mensajes_clave: ['Pedí por WhatsApp', 'Sabés exactamente de dónde viene', 'Lo tenés en casa en media hora'] }))
    expect(m).toMatchObject({ registro: 'voseo', fuente: 'inferido_de_los_textos_del_manual' }) // lo que vio CC#3
    expect(lib.registroFinal(m, 'Ecuador')).toMatchObject({ registro: 'tuteo', fuente: 'por_omision_del_pais_de_la_ficha' })
  })
  it('r63 · lo DECLARADO en el manual sigue mandando sobre el país; lo inferido que COINCIDE con el país se queda; sin país, el inferido es lo único que hay', () => {
    expect(lib.registroFinal({ registro: 'voseo', fuente: 'declarado_en_el_manual', pruebas: ['«voseo»'] }, 'Ecuador')).toMatchObject({ registro: 'voseo', aviso: null })
    const tuteo = { registro: 'tuteo', fuente: 'inferido_de_los_textos_del_manual', pruebas: ['x'] } as Reg
    expect(lib.registroFinal(tuteo, 'Ecuador')).toMatchObject({ registro: 'tuteo', fuente: 'inferido_de_los_textos_del_manual', aviso: null })
    const voseo = { registro: 'voseo', fuente: 'inferido_de_los_textos_del_manual', pruebas: ['x'] } as Reg
    for (const p of ['Atlantis', '', null]) expect(lib.registroFinal(voseo, p)).toMatchObject({ registro: 'voseo', fuente: 'inferido_de_los_textos_del_manual' })
    expect(lib.registroFinal(voseo, 'Argentina')).toMatchObject({ registro: 'voseo', fuente: 'inferido_de_los_textos_del_manual' }) // el país coincide
  })
  it('país desconocido, vacío o ausente ⇒ sin dato (no se adivina)', () => {
    for (const p of ['Atlantis', '', null, undefined, 5]) expect(lib.registroFinal(sin, p).registro).toBe('sin_dato')
  })
  it('la tabla de países es DATO (claves normalizadas, valores válidos)', () => {
    for (const [k, v] of Object.entries(lib.REGISTRO_POR_PAIS)) { expect(k).toBe(k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()); expect(['tuteo', 'voseo', 'formal']).toContain(v) }
  })
})

describe('el bloque que entra al pedido del redactor', () => {
  it('con registro: lo nombra, dice de dónde sale, obliga a los textos publicables y avisa que las instrucciones pueden estar en otro registro', () => {
    const b = lib.bloqueDeRegistro({ registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: ['«Tutea siempre»'] }).join('\n')
    expect(b).toContain('EL REGISTRO DE LA VOZ'); expect(b).toMatch(/tuteo/); expect(b).toMatch(/declarado_en_el_manual/)
    expect(b).toMatch(/llamados a la acción|ejemplos de texto|titulares/i); expect(b).toMatch(/no imites el registro/i)
  })
  it('sin dato: manda evitar la segunda persona marcada y declarar el hueco (no inventar uno)', () => {
    const b = lib.bloqueDeRegistro({ registro: 'sin_dato', fuente: 'sin_dato', pruebas: [] }).join('\n')
    expect(b).toMatch(/no fija el registro/i); expect(b).toMatch(/ni vos ni tú ni usted|sin segunda persona/i); expect(b).toMatch(/que asumimos/i)
  })
  it('para el voseo y el trato formal dice cuál es, sin pretender que sea «lo normal»', () => {
    expect(lib.bloqueDeRegistro({ registro: 'voseo', fuente: 'x', pruebas: [] }).join(' ')).toMatch(/voseo/)
    expect(lib.bloqueDeRegistro({ registro: 'formal', fuente: 'x', pruebas: [] }).join(' ')).toMatch(/usted/)
  })
})

describe('agnóstico', () => {
  it('el archivo no nombra a ningún cliente, ciudad ni rubro (los países son los datos de la tabla)', () => {
    const t = texto.toLowerCase().replace(/registro_por_pais[\s\S]*?\}\s*\n/, '')
    for (const p of ['naufrago', 'náufrago', 'olon', 'guayaquil', 'ceviche', 'marisco', 'peniche', 'zero risk']) expect(t.includes(p), p).toBe(false)
  })
  it('es texto plano apto para pegar en un nodo de n8n: sin require, sin import, sin export', () => {
    expect(texto).not.toMatch(/\brequire\(|^\s*import\s|^\s*export\s|module\.exports/m)
  })
})
