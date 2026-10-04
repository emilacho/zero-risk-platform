/**
 * Paso 2 · catálogo de productos o servicios desde datos estructurados de CUALQUIER tipo (no solo de un rubro),
 * y resumen del sitio sin repetir lo repetido. Casos escritos antes del código.
 */
import { describe, expect, it } from 'vitest'
import { extraerCatalogo } from '../datos-estructurados'
import { resumirTexto } from '../resumen'

const ld = (o: unknown): string => `texto antes\n${JSON.stringify(o)}\ntexto después`

describe('extraerCatalogo · formas que debe entender', () => {
  it('lista de productos con oferta (ItemList → ListItem → Product → Offer)', () => {
    const r = extraerCatalogo(ld({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', item: { '@type': 'Product', name: 'P1', category: 'F1', offers: { '@type': 'Offer', price: '10', priceCurrency: 'USD' } } }] }))
    expect(r.items).toEqual([{ nombre: 'P1', descripcion: null, precio: 10, moneda: 'USD', familia: 'F1', tipo: 'Product' }])
  })
  it('servicio dentro de una oferta dentro de un catálogo, con la raíz envuelta en listas anidadas', () => {
    const r = extraerCatalogo(ld([[{ '@type': 'Organization', hasOfferCatalog: { '@type': 'OfferCatalog', itemListElement: [{ '@type': 'Offer', price: '7,50', priceCurrency: 'EUR', itemOffered: { '@type': 'Service', name: 'S1', description: 'd' } }] } }]]))
    expect(r.items).toEqual([{ nombre: 'S1', descripcion: 'd', precio: 7.5, moneda: 'EUR', familia: null, tipo: 'Service' }])
  })
  it('grafo (@graph) con producto y precio dentro de especificación de precio', () => {
    const r = extraerCatalogo(ld({ '@graph': [{ '@type': 'WebSite', name: 'x' }, { '@type': 'Product', name: 'G1', offers: { '@type': 'Offer', priceSpecification: { price: 3, priceCurrency: 'USD' } } }] }))
    expect(r.items.map((i) => [i.nombre, i.precio, i.moneda])).toEqual([['G1', 3, 'USD']])
  })
  it('curso y evento con oferta; sección de carta con platos (el vocabulario de schema.org de cualquier rubro)', () => {
    const r = extraerCatalogo(ld([
      { '@type': 'Course', name: 'Curso 1', offers: { '@type': 'Offer', price: '99', priceCurrency: 'USD' } },
      { '@type': 'Event', name: 'Evento 1', offers: { '@type': 'Offer', price: '20', priceCurrency: 'USD' } },
      { '@type': 'Restaurant', hasMenu: { '@type': 'Menu', hasMenuSection: [{ '@type': 'MenuSection', name: 'Sección 1', hasMenuItem: [{ '@type': 'MenuItem', name: 'Plato 1', offers: { '@type': 'Offer', price: '5', priceCurrency: 'USD' } }] }] } },
    ]))
    expect(r.items.map((i) => [i.nombre, i.tipo, i.familia])).toEqual([['Curso 1', 'Course', null], ['Evento 1', 'Event', null], ['Plato 1', 'MenuItem', 'Sección 1']])
  })
  it('el mismo dato declarado dos veces en la página sale una sola vez', () => {
    const bloque = { '@type': 'Product', name: 'Repetido', offers: { '@type': 'Offer', price: '5', priceCurrency: 'USD' } }
    expect(extraerCatalogo(`${JSON.stringify(bloque)}
${JSON.stringify(bloque)}`).items).toHaveLength(1)
  })
  it('sin precio: el precio es null (no se inventa)', () => {
    const r = extraerCatalogo(ld({ '@type': 'Service', name: 'Sin precio' }))
    expect(r.items[0].precio).toBeNull()
  })
})

describe('extraerCatalogo · lo que no puede resolver lo declara', () => {
  it('sin datos estructurados: ningún ítem y el motivo', () => {
    expect(extraerCatalogo('solo texto, sin nada estructurado')).toMatchObject({ items: [], motivo: 'sin_datos_estructurados' })
  })
  it('JSON roto: no revienta, lo cuenta como descartado', () => {
    const r = extraerCatalogo('{"@type":"Product","name":"roto" {{{ ')
    expect(r.items).toEqual([])
    expect(r.bloques_descartados).toBeGreaterThanOrEqual(1)
  })
  it('estructura sin productos (solo la organización): sin catálogo, no un error', () => {
    expect(extraerCatalogo(ld({ '@type': 'Organization', name: 'Org' })).motivo).toBe('sin_datos_estructurados')
  })
})

describe('resumirTexto', () => {
  it('quita los bloques estructurados y no repite frases repetidas; conserva el orden', () => {
    const texto = `Primera frase.\n${Array(8).fill('Repetida.').join('\n')}\n${JSON.stringify({ '@type': 'Product', name: 'x' })}\nÚltima frase.`
    const r = resumirTexto(texto)
    expect(r.resumen).toBe('Primera frase. Repetida. Última frase.')
    expect(r.caracteres_originales).toBe(texto.length)
    expect(r.caracteres_resumidos).toBe(r.resumen.length)
  })
  it('acota el largo del resumen', () => {
    expect(resumirTexto('palabra distinta '.repeat(1000).split(' ').map((p, i) => p + i).join(' '), 300).resumen.length).toBeLessThanOrEqual(300)
  })
})
