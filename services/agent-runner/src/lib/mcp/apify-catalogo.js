// =============================================================
// EL CATÁLOGO · qué puede pedir un empleado, en palabras del negocio.
//
// Vive SEPARADO del servidor a propósito: el servidor arranca la conexión y
// necesita el SDK de herramientas; este archivo es PURO y se puede probar sin
// instalar nada. La traducción negocio → raspador es lo que hay que poder
// revisar, y ahora se revisa sola.
// =============================================================

/**
 * QUÉ SE PUEDE MIRAR · en palabras del negocio → qué función del Servicio y con
 * qué parámetros. Es el único lugar donde vive la traducción.
 *
 * Los parámetros salen de lo MEDIDO el 05-sep (16 esquemas leídos de Apify),
 * no de lo que uno supondría.
 */
const CATALOGO = {
  ficha_en_mapas: {
    para: 'la ficha del negocio en Google Maps · puntaje, reseñas, horario, dirección, fotos',
    funcion: 'google_maps_scraper',
    params: (a) => ({ searchStringsArray: [a.de_quien], locationQuery: a.donde || '', resultsLimit: 1 }),
  },
  instagram: {
    para: 'la cuenta de Instagram · si existe y cuántos seguidores tiene',
    funcion: 'instagram_scraper',
    params: (a) => ({ usernames: [String(a.de_quien).replace(/^@/, '')], resultsLimit: 1 }),
  },
  tiktok: {
    para: 'la cuenta de TikTok · si existe y qué publica',
    funcion: 'tiktok_profile_scraper',
    params: (a) => ({ usernames: [String(a.de_quien).replace(/^@/, '')], maxItems: 5 }),
  },
  anuncios_en_meta: {
    para: 'si pauta o pautó alguna vez en Facebook/Instagram · biblioteca pública de anuncios',
    funcion: 'facebook_ads_library_scraper',
    // medido · el raspador pide una DIRECCIÓN de búsqueda, no palabras sueltas
    params: (a) => ({ searchTerms: [a.de_quien], countryCode: a.donde || 'US', maxItems: 20 }),
  },
  anuncios_en_google: {
    para: 'si pauta en Google · biblioteca pública de anuncios',
    funcion: 'google_ads_scraper',
    // medido · este busca por DOMINIO del anunciante, no por palabras
    params: (a) => ({ domain: a.de_quien, countryCode: a.donde || 'US', maxResults: 5 }),
  },
  que_dice_el_buscador: {
    para: 'qué aparece en Google al buscarlo',
    funcion: 'google_serp_scraper',
    params: (a) => ({ queries: a.de_quien, maxPagesPerQuery: 1 }),
  },
  opiniones: {
    para: 'reseñas públicas en Trustpilot',
    funcion: 'trustpilot_scraper',
    params: (a) => ({ searchTerms: [a.de_quien] }),
  },
  trafico_del_sitio: {
    para: 'tamaño y tráfico estimado del sitio',
    funcion: 'similarweb_scraper',
    params: (a) => ({ websites: [String(a.de_quien).replace(/^https?:\/\//, '').replace(/\/.*$/, '')] }),
  },
}

module.exports = { CATALOGO }
