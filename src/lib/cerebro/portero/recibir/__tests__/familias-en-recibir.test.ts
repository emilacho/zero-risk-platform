/**
 * PASO 7 · E1 y E2 de CC#3: lo nuevo del rebase (`recibir` mira la imagen con las familias del catálogo) tiene su prueba propia.
 * «Familia sola ⇒ confianza baja» y el adorno LLEGAN a `recibir`, en modo real y en modo prueba. Modelo y base simulados.
 */
import { describe, expect, it } from 'vitest'
import { recibir, type DepsDeRecibir } from '../recibir'
import { A, AHORA, BaseSimulada, crearModelo, cuerpo, etiquetaBuena, modeloDeGrupos } from './casos'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('imagen-minima-del-plato')]).toString('base64')
const imagen = (extra: Record<string, unknown> = {}) => cuerpo({ texto: undefined, fuente_ref: 'plato', archivo: { nombre: 'plato.png', tipo: 'image/png', base64: PNG }, ...extra })
const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: [['Encebollado A', 'Encebollados'], ['Encebollado B', 'Encebollados'], ['Cola', 'Bebidas']].map(([n, c], i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'Product', name: n, category: c, offers: { '@type': 'Offer', price: '4', priceCurrency: 'USD' } } })) })

function armar(vistos: string[], confianza: string, conCatalogo: boolean) {
  const base = new BaseSimulada()
  const m = crearModelo(modeloDeGrupos(3), () => etiquetaBuena({ producto_visto: vistos, confianza }))
  if (conCatalogo) base.otras.client_web_pages = [{ id: 'wp-1', client_id: A, url: 'https://a.example/', title: 'Inicio', owner_role: 'propio', competitor_id: null, crawled_at: AHORA.toISOString(), content_text: `Texto.\n${jsonLd}` }]
  const deps: DepsDeRecibir = { consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar, ahora: () => AHORA, nuevoId: base.nuevoId }
  return { base, m, correr: (c: Record<string, unknown>) => recibir(deps, c) }
}
const confianzaGuardada = (x: ReturnType<typeof armar>) => (x.base.fichas[0].provenance_tag as { etiqueta: { confianza: string } }).etiqueta.confianza

describe('E1 · la regla «familia sola ⇒ confianza baja» llega a `recibir`', () => {
  it('REAL: la familia sola (con o sin adorno) se guarda con confianza «baja» aunque el modelo diga «alta»', async () => {
    for (const dicho of ['Encebollados', 'Familia «Encebollados»']) {
      const x = armar([dicho], 'alta', true)
      await x.correr(imagen())
      expect(x.base.fichas[0].producto, dicho).toEqual(['Encebollados'])
      expect(confianzaGuardada(x), dicho).toBe('baja')
    }
  })
  it('REAL: con una variante exacta, o una variante más una familia, se respeta la confianza del modelo', async () => {
    for (const vistos of [['Encebollado A'], ['Encebollados', 'Cola']]) {
      const x = armar(vistos, 'alta', true)
      await x.correr(imagen())
      expect(confianzaGuardada(x), vistos.join()).toBe('alta')
    }
  })
  it('PRUEBA: con `familias_de_prueba`, la familia sola baja la confianza (también con adorno) y una variante exacta la respeta', async () => {
    const familias = [{ nombre: 'Encebollados', incluye: ['Encebollado A', 'Encebollado B'] }]
    const prod = ['Encebollado A', 'Encebollado B', 'Cola']
    const sola = armar(['Familia «Encebollados»'], 'alta', false)
    await sola.correr(imagen({ prueba: true, productos_de_prueba: prod, familias_de_prueba: familias }))
    expect(sola.base.fichas[0].producto).toEqual(['Encebollados'])
    expect(confianzaGuardada(sola)).toBe('baja')
    const variante = armar(['Encebollado A'], 'alta', false)
    await variante.correr(imagen({ prueba: true, productos_de_prueba: prod, familias_de_prueba: familias }))
    expect(confianzaGuardada(variante)).toBe('alta')
  })
})

describe('E2 · lo que el modelo de visión VE desde `recibir` incluye las líneas de familia', () => {
  it('REAL: familias + productos del catálogo del cliente', async () => {
    const x = armar([], 'media', true)
    await x.correr(imagen())
    expect(x.m.espia.imagenes[0].texto).toContain('Familia «Encebollados» · agrupa: Encebollado A, Encebollado B')
    expect(x.m.espia.imagenes[0].texto).toContain('Cola · ')
  })
  it('PRUEBA: las familias de prueba, antes de los productos de prueba', async () => {
    const x = armar([], 'media', false)
    await x.correr(imagen({ prueba: true, productos_de_prueba: ['Encebollado A'], familias_de_prueba: [{ nombre: 'Encebollados', incluye: ['Encebollado A', 'Encebollado B'] }] }))
    const t = x.m.espia.imagenes[0].texto
    expect(t).toContain('Familia «Encebollados» · agrupa: Encebollado A, Encebollado B')
    expect(t.indexOf('Familia «Encebollados»')).toBeLessThan(t.indexOf('Encebollado A\n'))
  })
  it('sin catálogo real no hay líneas de familia', async () => {
    const x = armar([], 'media', false)
    await x.correr(imagen())
    expect(x.m.espia.imagenes[0].texto).not.toContain('Familia «')
  })
})
