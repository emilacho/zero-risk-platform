/** Fuentes públicas · de la ficha y el raspado propios al plan, y el costo. Clientes INVENTADOS de rubros distintos; sin base, sin modelo. */
import { describe, expect, it } from 'vitest'
import { estimarCosto, planDeLaFicha, type FilaPropia } from '..'
import { BATERIA_DE_RUBROS as BATERIA } from '../../rubros-de-prueba/baterias'

const sitio = (url: string, enlaces: string[]): FilaPropia => ({ apify_function: 'website_content_scraper', params: { url }, respuesta: [{ url, text: 'hola', links: enlaces }] })
const mapas = (items: Array<Record<string, unknown>>): FilaPropia => ({ apify_function: 'own_google_maps_profile', params: {}, respuesta: items })

describe('la entrada sale SOLO de lo propio', () => {
  it('restaurante: mapas con el mismo nombre + redes del sitio propio → reseñas de mapas y de tripadvisor, videos de instagram', () => {
    const { plan, entrada } = planDeLaFicha(
      { name: 'Casa Demo Sabores', industry: 'restaurante familiar', country: 'Colombia', website_url: 'https://casademo.example', config: { apify: { own_handles: { instagram: 'casademo' } } } },
      [sitio('https://casademo.example', ['https://www.tripadvisor.com.co/Restaurant_Review-g1-d2-Reviews-Casa_Demo_Sabores-Ciudad.html', 'https://www.facebook.com/casademosabores']), mapas([{ title: 'Casa Demo Sabores', url: 'https://maps.example/p/1', placeId: 'ChIJdemo' }])],
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

describe('ronda 76 · solo cuentan los enlaces que son DEL cliente (la sonda del hotel de CC#3)', () => {
  const paginas = (url: string, ...enlacesPorPagina: string[][]): FilaPropia => ({ apify_function: 'website_content_scraper', params: { url }, respuesta: enlacesPorPagina.map((links, i) => ({ url: `${url}/p${i}`, links })) })
  const HOTEL = { name: 'Hotel Demo Mar', industry: 'hotel', country: 'Colombia', website_url: 'https://hoteldemomar.example', config: {} }
  const SALIDA = [
    'https://www.tripadvisor.com/Attraction_Review-g1-d2-Reviews-Playa_Cercana-Ciudad.html', // «qué hacer cerca»: una playa
    'https://www.booking.com/hotel/co/vecino.html', // otro hotel
    'https://www.facebook.com/sharer/sharer.php?u=https://hoteldemomar.example', // compartir
  ]
  it('la sonda: tres enlaces de salida NO se piden, y se dicen con su motivo', () => {
    const { plan, entrada } = planDeLaFicha(HOTEL, [paginas('https://hoteldemomar.example', [...SALIDA], [], [])])
    expect(plan.llamadas.some((l) => ['resenas_tripadvisor', 'resenas_booking', 'resenas_facebook'].includes(l.funcion))).toBe(false)
    expect(entrada.enlaces).toEqual([]); expect(entrada.descartados.map((d) => d.url)).toEqual(SALIDA)
    expect(entrada.descartados.every((d) => d.motivo.length > 10)).toBe(true)
  })
  it('los suyos SÍ: la ficha de su plataforma con su nombre, y su perfil de red repetido en el pie', () => {
    const suyos = ['https://www.tripadvisor.com/Hotel_Review-g1-d9-Reviews-Hotel_Demo_Mar-Ciudad.html', 'https://www.booking.com/hotel/co/hotel-demo-mar.html', 'https://www.facebook.com/hoteldemomar']
    const { plan } = planDeLaFicha(HOTEL, [paginas('https://hoteldemomar.example', [...suyos, ...SALIDA], [suyos[2]], [suyos[2]], [])])
    const f = plan.llamadas.map((l) => l.funcion)
    expect(f).toContain('resenas_tripadvisor'); expect(f).toContain('resenas_booking'); expect(f).toContain('resenas_facebook')
    expect(plan.llamadas.find((l) => l.funcion === 'resenas_tripadvisor')!.objetivo).toContain('Hotel_Demo_Mar')
    expect(plan.llamadas.find((l) => l.funcion === 'resenas_booking')!.objetivo).toContain('hotel-demo-mar')
  })
  it('un perfil de red que NO lleva el nombre y aparece en una sola página no es del cliente; repetido en varias páginas, sí', () => {
    const otro = 'https://www.instagram.com/cuenta_de_otro'
    const solo = planDeLaFicha(HOTEL, [paginas('https://hoteldemomar.example', [otro], [], [])]).entrada
    expect(solo.enlaces).toEqual([]); expect(solo.descartados[0].motivo).toMatch(/otro|repite/)
    const pie = planDeLaFicha(HOTEL, [paginas('https://hoteldemomar.example', [otro], [otro], [otro])]).entrada
    expect(pie.enlaces).toEqual([otro])
  })
  it('una página leída varias veces cuenta UNA vez (no inventa un «pie» repitiendo la lectura)', () => {
    const otro = 'https://www.instagram.com/cuenta_de_otro'
    const fila = paginas('https://hoteldemomar.example', [otro])
    const { entrada } = planDeLaFicha(HOTEL, [fila, fila, fila, paginas('https://hoteldemomar.example', [], [])])
    expect(entrada.enlaces).toEqual([])
  })
  it('lo declarado en la ficha manda aunque no lleve el nombre', () => {
    const { entrada } = planDeLaFicha({ ...HOTEL, config: { apify: { own_handles: { instagram: 'otro_usuario_declarado' } } } }, [])
    expect(entrada.redes?.instagram).toBe('otro_usuario_declarado')
  })
  it.each(BATERIA)('batería · $rubro: un enlace de salida a una plataforma no entra y el del propio negocio sí', (c) => {
    const nombre = c.nombre
    const slug = nombre.replace(/ /g, '_')
    const propio = `https://www.tripadvisor.com/Restaurant_Review-g1-d2-Reviews-${slug}-Ciudad.html`
    const ajeno = 'https://www.tripadvisor.com/Restaurant_Review-g1-d3-Reviews-Otro_Negocio_Cualquiera-Ciudad.html'
    const { entrada } = planDeLaFicha({ name: nombre, industry: c.rubro === 'comida' ? 'restaurante' : 'servicio', country: c.pais, website_url: 'https://negocio-demo.example' }, [paginas('https://negocio-demo.example', [propio, ajeno], [], [])])
    expect(entrada.enlaces).toEqual([propio]); expect(entrada.descartados.map((d) => d.url)).toEqual([ajeno])
  })
})
