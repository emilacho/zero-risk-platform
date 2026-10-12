/**
 * FUENTES PÚBLICAS · EL CATÁLOGO (dato, no lógica) · AGNÓSTICO.
 *
 * Qué mira el sistema de un cliente además de su sitio y su Instagram: las reseñas que el público dejó en las plataformas QUE APLICAN A SU RUBRO, y los textos/videos
 * de las redes QUE ÉL TIENE. Nada de este archivo nombra a un cliente, un lugar ni un rubro concreto: los rubros son FAMILIAS genéricas (palabras clave) y las
 * plataformas son un catálogo ampliable (una línea por plataforma). Para sumar una plataforma o una familia se edita ESTE dato; la lógica no cambia.
 *
 * Dos reglas de honestidad que el catálogo hace cumplir:
 *   · nunca se inventa una dirección: una plataforma sólo entra al plan si se HALLÓ una dirección pública del negocio en ella (o, para el mapa, su ficha);
 *   · una plataforma que no opera en el país del cliente no se pide (`paises`), y lo que no se pidió se DECLARA con su motivo.
 */

export type IdDeFamilia =
  | 'comida' | 'alojamiento' | 'turismo' | 'software' | 'apps_moviles' | 'comercio' | 'servicios_profesionales' | 'salud' | 'belleza_bienestar'
  | 'automotriz' | 'inmobiliaria' | 'educacion' | 'servicios_hogar' | 'finanzas' | 'general'

/** claves (sin tildes, minúsculas) que ponen un rubro en una familia · un rubro puede caer en varias · PALABRA ENTERA (`src/lib/texto/coincidencia.ts`): «bar» no es «barbería»; una raíz se pide EXPLÍCITA con `*` */
export const FAMILIAS: Record<Exclude<IdDeFamilia, 'general'>, string[]> = {
  comida: ['restaurante', 'restaurant', 'cafe', 'cafeteria', 'bar', 'comedor', 'comida', 'cocina', 'gastronom*', 'pizzeria', 'panaderia', 'heladeria', 'food', 'catering', 'sushi', 'bakery', 'bistro', 'parrilla', 'delivery de comida', 'ghost kitchen'],
  alojamiento: ['hotel', 'hostal', 'hostel', 'hospedaje', 'alojamiento', 'cabana', 'posada', 'resort', 'apart*', 'lodging', 'bnb', 'glamping', 'villa', 'alquiler vacacional'],
  turismo: ['tour', 'turismo', 'excursion', 'guia', 'aventura', 'surf', 'buceo', 'experiencia', 'agencia de viajes', 'travel', 'actividades', 'parque', 'museo', 'entretenimiento'],
  software: ['software', 'saas', 'plataforma digital', 'aplicacion web', 'crm', 'erp', 'b2b', 'tecnologia', 'startup', 'api', 'devtool', 'herramienta digital', 'inteligencia artificial'],
  apps_moviles: ['app movil', 'aplicacion movil', 'app para ios', 'app para android', 'app store', 'play store', 'juego movil', 'aplicacion para celular'],
  comercio: ['tienda', 'ecommerce', 'e-commerce', 'comercio', 'retail', 'boutique', 'moda', 'ropa', 'calzado', 'accesorios', 'venta online', 'shop', 'store', 'joyeria', 'muebles', 'electrodomesticos', 'supermercado'],
  servicios_profesionales: ['abogad*', 'contab*', 'consultor*', 'agencia', 'despacho', 'arquitect*', 'ingenier*', 'notari*', 'asesor*', 'coaching', 'marketing', 'diseno', 'constructora', 'legal', 'auditor', 'traduccion'],
  salud: ['clinica', 'medic*', 'dental', 'odontolog*', 'hospital', 'psicolog*', 'fisioterap*', 'nutricion', 'salud', 'farmacia', 'veterinar*', 'laboratorio', 'doctor', 'terapia'],
  belleza_bienestar: ['peluquer*', 'barber*', 'spa', 'salon de belleza', 'belleza', 'estetica', 'gimnasio', 'gym', 'yoga', 'fitness', 'masaje', 'maquillaje', 'manicur*', 'pedicur*', 'wellness', 'pilates'],
  automotriz: ['taller mecanico', 'mecanica', 'automotriz', 'concesionaria', 'lavado de autos', 'repuestos', 'vehiculos', 'autos', 'motos'],
  inmobiliaria: ['inmobiliaria', 'bienes raices', 'propiedades', 'real estate', 'arriendo', 'venta de casas', 'corretaje'],
  educacion: ['escuela', 'colegio', 'academia', 'curso', 'universidad', 'educacion', 'instituto', 'capacitacion', 'tutor', 'idiomas', 'bootcamp'],
  servicios_hogar: ['plomer*', 'electricista', 'limpieza', 'jardiner*', 'mudanza', 'reparacion', 'carpinter*', 'pintura', 'cerrajer*', 'fumigacion', 'mantenimiento del hogar'],
  finanzas: ['banco', 'cooperativa', 'seguros', 'financier*', 'credito', 'fintech', 'inversion', 'prestamos', 'cambio de divisas'],
}

export type TipoDeFuentePublica = 'resenas' | 'publicaciones' | 'videos'
export type Red = 'instagram' | 'facebook' | 'tiktok' | 'youtube'

export interface PlataformaDeResenas {
  id: string
  nombre: string
  /** hosts que reconocen una dirección pública del negocio en esa plataforma (sin www) · `nombre.*` = ese nombre con cualquier dominio de país */
  hosts: string[]
  /** familias a las que aplica · 'todas' = cualquiera */
  familias: Array<IdDeFamilia> | 'todas'
  /** países (ISO-2) donde la plataforma opera · ausente = en cualquiera */
  paises?: string[]
  /** función del Servicio de Apify que la raspa */
  funcion: string
  /** cómo se arma el pedido a partir de la dirección hallada */
  params: 'startUrls' | 'direcciones' | 'busqueda'
}

/** reseñas públicas · una línea por plataforma · el mapa es la única que no pide una dirección hallada en la web (usa la ficha de mapas del propio negocio) */
export const PLATAFORMAS_DE_RESENAS: PlataformaDeResenas[] = [
  { id: 'google_maps', nombre: 'Google Maps', hosts: ['google.com', 'maps.app.goo.gl', 'goo.gl', 'g.page'], familias: 'todas', funcion: 'resenas_google_maps', params: 'startUrls' },
  { id: 'tripadvisor', nombre: 'Tripadvisor', hosts: ['tripadvisor.*'], familias: ['comida', 'alojamiento', 'turismo'], funcion: 'resenas_tripadvisor', params: 'startUrls' },
  { id: 'booking', nombre: 'Booking.com', hosts: ['booking.com'], familias: ['alojamiento'], funcion: 'resenas_booking', params: 'startUrls' },
  { id: 'facebook', nombre: 'Facebook (recomendaciones)', hosts: ['facebook.com', 'fb.com'], familias: 'todas', funcion: 'resenas_facebook', params: 'startUrls' },
  { id: 'trustpilot', nombre: 'Trustpilot', hosts: ['trustpilot.com'], familias: ['comercio', 'software', 'finanzas', 'servicios_profesionales', 'educacion', 'servicios_hogar'], funcion: 'trustpilot_scraper', params: 'busqueda' },
  { id: 'software_g2_capterra', nombre: 'Directorios de software (G2 / Capterra)', hosts: ['g2.com', 'capterra.com'], familias: ['software'], funcion: 'software_review_scraper', params: 'busqueda' },
  { id: 'app_store', nombre: 'App Store', hosts: ['apps.apple.com', 'itunes.apple.com'], familias: ['apps_moviles', 'software'], funcion: 'resenas_app_store', params: 'startUrls' },
]

export interface RedConContenido {
  red: Red
  nombre: string
  hosts: string[]
  /** `publicaciones` = pies/textos · `videos` = lo que se dice en los videos (transcripción) */
  produce: TipoDeFuentePublica[]
  funcionPublicaciones?: string
  funcionVideos?: string
}
/** las redes de las que se leen los textos y los videos del propio cliente · LinkedIn no se lista: no hay transcripción de video útil */
export const REDES_CON_CONTENIDO: RedConContenido[] = [
  { red: 'instagram', nombre: 'Instagram', hosts: ['instagram.com'], produce: ['publicaciones', 'videos'], funcionPublicaciones: 'instagram_scraper', funcionVideos: 'videos_instagram' },
  { red: 'facebook', nombre: 'Facebook', hosts: ['facebook.com', 'fb.com'], produce: ['publicaciones'], funcionPublicaciones: 'publicaciones_facebook' },
  { red: 'tiktok', nombre: 'TikTok', hosts: ['tiktok.com'], produce: ['videos'], funcionVideos: 'videos_tiktok' },
  { red: 'youtube', nombre: 'YouTube', hosts: ['youtube.com', 'youtu.be'], produce: ['videos'], funcionVideos: 'videos_youtube' },
]

/** el actor de Apify de cada función NUEVA del Servicio + el pedido que hay que mandarle (la elección por calidad: transcripción de la propia plataforma y, donde no hay, del audio) */
export const ACTORES_NUEVOS: Record<string, { actor: string; descripcion: string }> = {
  resenas_google_maps: { actor: 'compass~google-maps-reviews-scraper', descripcion: 'reseñas de la ficha de Google Maps del propio negocio' },
  resenas_tripadvisor: { actor: 'maxcopell~tripadvisor-reviews', descripcion: 'reseñas del propio negocio en Tripadvisor' },
  resenas_booking: { actor: 'voyager~booking-reviews-scraper', descripcion: 'reseñas del propio alojamiento en Booking' },
  resenas_facebook: { actor: 'apify~facebook-reviews-scraper', descripcion: 'recomendaciones/reseñas de la página de Facebook del propio negocio' },
  resenas_app_store: { actor: 'epctex~appstore-scraper', descripcion: 'reseñas de la propia app en la App Store' },
  publicaciones_facebook: { actor: 'apify~facebook-posts-scraper', descripcion: 'textos (pies) y transcripción de los videos de la página propia de Facebook' },
  videos_instagram: { actor: 'apify~instagram-reel-scraper', descripcion: 'reels propios con transcripción del audio' },
  videos_tiktok: { actor: 'clockworks~tiktok-scraper', descripcion: 'videos propios de TikTok con subtítulos o, si no los hay, transcripción del audio' },
  videos_youtube: { actor: 'streamers~youtube-scraper', descripcion: 'videos propios de YouTube con subtítulos o, si no los hay, transcripción del audio' },
}
