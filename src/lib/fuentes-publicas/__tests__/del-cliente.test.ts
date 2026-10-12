/** Fuentes públicas · de la ficha y el raspado propios al plan, y el costo. Clientes INVENTADOS de rubros distintos; sin base, sin modelo. */
import { describe, expect, it } from 'vitest'
import { estimarCosto, planDeLaFicha, type FilaPropia } from '..'

const sitio = (url: string, enlaces: string[]): FilaPropia => ({ apify_function: 'website_content_scraper', params: { url }, respuesta: [{ url, text: 'hola', links: enlaces }] })
const mapas = (items: Array<Record<string, unknown>>): FilaPropia => ({ apify_function: 'own_google_maps_profile', params: {}, respuesta: items })

describe('la entrada sale SOLO de lo propio', () => {
  it('restaurante: mapas con el mismo nombre + redes del sitio propio → reseñas de mapas y de tripadvisor, videos de instagram', () => {
    const { plan, entrada } = planDeLaFicha(
      { name: 'Casa Demo Sabores', industry: 'restaurante familiar', country: 'Colombia', website_url: 'https://casademo.example', config: { apify: { own_handles: { instagram: 'casademo' } } } },
      [sitio('https://casademo.example', ['https://www.tripadvisor.com.co/Restaurant_Review-g1-d2-Reviews-Casa_Demo.html', 'https://www.facebook.com/casademo']), mapas([{ title: 'Casa Demo Sabores', url: 'https://maps.example/p/1', placeId: 'ChIJdemo' }])],
    )
    expect(entrada.mapas?.placeId).toBe('ChIJdemo')
    expect(plan.llamadas.map((l) => l.funcion).sort()).toEqual(['publicaciones_facebook', 'resenas_facebook', 'resenas_google_maps', 'resenas_tripadvisor', 'videos_instagram'])
  })
  it('un homónimo en mapas NO entra, y el enlace de la ficha de OTRO negocio tampoco', () => {
    const { plan, entrada } = planDeLaFicha(
      { name: 'Clínica Demo', industry: 'clínica dental', country: 'Argentina', website_url: 'https://clinicademo.example', config: {} },
      [
        sitio('https://clinicademo.example', []),
        mapas([{ title: 'Clínica Demo del Sur', url: 'https://maps.example/p/9', website: 'https://otro.example' }]),
        { apify_function: 'own_google_maps_profile', params: {}, respuesta: [{ title: 'Hotel Vecino', url: 'https://www.booking.com/hotel/xx/vecino.html' }] },
      ],
    )
    expect(entrada.mapas).toBeNull()
    expect(plan.llamadas.some((l) => l.funcion === 'resenas_booking' || l.funcion === 'resenas_google_maps')).toBe(false)
    expect(plan.omitidas.some((o) => /ficha propia/.test(o.motivo))).toBe(true)
  })
  it('un mismo sitio web identifica la ficha de mapas aunque el nombre cambie', () => {
    const { entrada } = planDeLaFicha({ name: 'Tienda Demo', industry: 'tienda de ropa', country: 'México', website_url: 'https://www.tiendademo.example/' }, [mapas([{ title: 'Demo Moda', website: 'https://tiendademo.example/inicio', placeId: 'ChIJt' }])])
    expect(entrada.mapas?.placeId).toBe('ChIJt')
  })
  it('SaaS sin redes ni ficha: solo directorios que aplican, y lo demás declarado como omitido', () => {
    const { plan } = planDeLaFicha({ name: 'Producto Demo', industry: 'software SaaS de gestión', country: 'Uruguay', website_url: 'https://productodemo.example' }, [])
    expect(plan.llamadas.map((l) => l.funcion)).toContain('software_review_scraper')
    expect(plan.omitidas.length).toBeGreaterThan(3)
    expect(plan.llamadas.every((l) => l.funcion !== 'resenas_google_maps')).toBe(true)
  })
  it('los datos de ensayo nunca cuentan', () => {
    const { entrada } = planDeLaFicha({ name: 'Casa Demo', website_url: 'https://casademo.example' }, [{ ...mapas([{ title: 'Casa Demo', placeId: 'X' }]), ensayo: true }])
    expect(entrada.mapas).toBeNull()
  })
})

describe('costo estimado con precios medidos', () => {
  it('suma tope × precio por llamada y declara lo que no tiene precio', () => {
    const { estimado } = planDeLaFicha(
      { name: 'Casa Demo Sabores', industry: 'restaurante', country: 'Colombia', website_url: 'https://casademo.example', config: { apify: { own_handles: { instagram: 'casademo' } } } },
      [mapas([{ title: 'Casa Demo Sabores', placeId: 'ChIJdemo' }])],
    )
    const ig = estimado.por_llamada.find((x) => x.funcion === 'videos_instagram')!
    expect(ig.usd).toBeCloseTo(0.557, 3)
    expect(estimado.total_usd).toBeGreaterThan(0.4)
    expect(estimado.total_usd).toBeLessThan(2)
    expect(estimado.sin_precio).toEqual([])
    expect(estimarCosto({ familias: [], llamadas: [], omitidas: [] }).total_usd).toBe(0)
  })
})
