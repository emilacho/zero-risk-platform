/**
 * Fixtures for the carousel-engine · used by tests + smoke + showcase.
 *
 * The Náufrago fixture mirrors the cliente piloto's brand v1 cascade
 * (5 slides · Instagram feed) so the engine renders the actual data
 * shape the API will receive in production.
 */
import type { BrandTokens, CarouselGenerateRequest, SlideContent } from '../types'

export const naufragoBrandV1: BrandTokens = {
  logo_url: null,
  colors: {
    primary: '#0b3d2e',
    secondary: '#13573f',
    accent: '#f5b800',
    text_on_primary: '#f5f5f0',
    text_on_surface: '#0b3d2e',
    surface: '#f5f5f0',
  },
  fonts: {
    family: 'Inter',
    headline_family: 'Inter',
  },
  brand_handle: '@zerorisk.ec',
}

export const naufragoSlidesV1: SlideContent[] = [
  {
    eyebrow: 'Industria · Ecuador',
    headline: 'Tu consultoría de seguridad no te va a salvar de la multa',
    body: 'El 73 % de las empresas con auditoría al día reciben multa dentro del año siguiente.',
    cta: 'Agendá tu diagnóstico',
  },
  {
    eyebrow: 'Parte 2',
    headline: 'La consultoría tradicional está diseñada para entregarse, no para implementarse',
    body: 'PDF de 80 páginas · firma · archivo. Seis meses después: ministerio en la puerta.',
  },
  {
    eyebrow: 'Parte 3',
    headline: 'Diagnóstico operativo · entregables vivos · 90 días de soporte',
    body: 'Dashboard de cumplimiento + hoja de ruta priorizada + canal directo con el equipo técnico.',
  },
  {
    eyebrow: 'Parte 4',
    headline: 'Caso · 4 plantas industriales · 0 multas en 14 meses',
    body: 'Sin reemplazar a tu consultoría actual · trabajamos en paralelo y cerramos los gaps que ellos no ven.',
  },
  {
    eyebrow: 'Cierre',
    headline: 'Hablemos esta semana',
    body: '15 minutos · sin compromiso · te muestro qué encontraríamos en tu planta.',
    cta: 'Reservá tu sesión',
  },
]

/** Full API request body for the Náufrago Instagram 5-slide cascade. */
export const naufragoInstagramFeedRequest: CarouselGenerateRequest = {
  client_slug: 'naufrago',
  platform: 'instagram-feed',
  brand: naufragoBrandV1,
  slides: naufragoSlidesV1,
  carousel_id: 'naufrago-v1-instagram-feed-smoke',
}
