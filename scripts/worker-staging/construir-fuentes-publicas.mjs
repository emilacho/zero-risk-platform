// fuentes públicas · fase 1 · construye el Servicio de Apify con las funciones NUEVAS (reseñas públicas · textos y videos de las redes del cliente) desde un respaldo FRESCO.
// Aditivo: no cambia ninguna función existente. Agnóstico: ningún cliente, lugar ni rubro en el código; la tabla de actores vive en `src/lib/fuentes-publicas/catalogo.ts` (se copia aquí como dato).
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}

/** función → actor + esquema que ACEPTA (de los esquemas publicados por Apify, grabados en raw/evidencia/…-fuentes) + obligatorios + el mínimo del contrato del Servicio */
export const NUEVAS = {
  resenas_google_maps: { actor: 'compass~google-maps-reviews-scraper', acepta: ['startUrls', 'placeIds', 'maxReviews', 'reviewsSort', 'reviewsStartDate', 'reviewsFilterString', 'language', 'reviewsOrigin', 'personalData'], obligatorios: [], contrato: ['startUrls', 'placeIds'], etiqueta: 'resenas_google_maps_propias' },
  resenas_tripadvisor: { actor: 'maxcopell~tripadvisor-reviews', acepta: ['startUrls', 'sourceDatasetId', 'maxItemsPerQuery', 'scrapeReviewerInfo', 'lastReviewDate', 'disableMachineTranslations', 'reviewRatings', 'reviewsLanguages'], obligatorios: [], contrato: ['startUrls'], etiqueta: 'resenas_tripadvisor_propias' },
  resenas_booking: { actor: 'voyager~booking-reviews-scraper', acepta: ['startUrls', 'maxReviewsPerHotel', 'sortReviewsBy', 'cutoffDate', 'reviewScores'], obligatorios: ['startUrls'], contrato: ['startUrls'], etiqueta: 'resenas_booking_propias' },
  resenas_facebook: { actor: 'apify~facebook-reviews-scraper', acepta: ['startUrls', 'resultsLimit', 'onlyReviewsNewerThan'], obligatorios: ['startUrls'], contrato: ['startUrls'], etiqueta: 'resenas_facebook_propias' },
  resenas_app_store: { actor: 'epctex~appstore-scraper', acepta: ['term', 'startUrls', 'appIds', 'bundleIds', 'developerIds', 'mode', 'country', 'lang', 'page', 'endPage', 'includeReviews', 'reviewsSort', 'includeSimilarApps', 'maxItems'], obligatorios: [], contrato: ['startUrls', 'appIds'], etiqueta: 'resenas_app_store_propias' },
  publicaciones_facebook: { actor: 'apify~facebook-posts-scraper', acepta: ['startUrls', 'resultsLimit', 'captionText', 'onlyPostsNewerThan', 'onlyPostsOlderThan'], obligatorios: ['startUrls'], contrato: ['startUrls'], etiqueta: 'facebook_publicaciones_propias' },
  videos_instagram: { actor: 'apify~instagram-reel-scraper', acepta: ['username', 'resultsLimit', 'onlyPostsNewerThan', 'skipPinnedPosts', 'skipTrialReels', 'includeSharesCount', 'includeTranscript', 'includeDownloadedVideo'], obligatorios: ['username'], contrato: ['username'], etiqueta: 'instagram_videos_propios' },
  videos_tiktok: { actor: 'clockworks~tiktok-scraper', acepta: ['profiles', 'resultsPerPage', 'profileScrapeSections', 'profileSorting', 'excludePinnedPosts', 'oldestPostDateUnified', 'downloadSubtitlesOptions'], obligatorios: [], contrato: ['profiles'], etiqueta: 'tiktok_videos_propios' },
  videos_youtube: { actor: 'streamers~youtube-scraper', acepta: ['startUrls', 'maxResults', 'maxResultsShorts', 'maxResultStreams', 'transcriptionAndSubtitle', 'subtitlesLanguage', 'sortVideosBy', 'oldestPostDate'], obligatorios: [], contrato: ['startUrls'], etiqueta: 'youtube_videos_propios' },
}
const FUNCIONES = Object.keys(NUEVAS)

// ───────────── Validate Body · lista de funciones permitidas
const ANCLA_PERMITIDAS = "    'facebook_page_scraper',\n  ]);"
export function validateBody(codigo) {
  return conFinDeLinea(codigo, (c) => cambiar(c, ANCLA_PERMITIDAS, "    'facebook_page_scraper',\n    // FUENTES PÚBLICAS (ronda 71) · reseñas de las plataformas que aplican al rubro y textos/videos de las redes del cliente\n" + FUNCIONES.map((f) => `    '${f}',`).join('\n') + '\n  ]);', 'permitidas'))
}

// ───────────── Validar params · contrato
const ANCLA_CONTRATO = 'const CONTRATO = {\n'
export function contrato(codigo) {
  const filas = FUNCIONES.map((f) => `  ${f}: () => tiene(${NUEVAS[f].contrato.map((c) => JSON.stringify(c)).join(',')}) ? null : "falta uno de · ${NUEVAS[f].contrato.join(' | ')} (la dirección o el usuario PÚBLICO del propio negocio · no se inventa)",`).join('\n')
  return conFinDeLinea(codigo, (c) => cambiar(c, ANCLA_CONTRATO, ANCLA_CONTRATO + '  // FUENTES PÚBLICAS (ronda 71)\n' + filas + '\n', 'contrato'))
}

// ───────────── Validar el cuerpo contra el esquema
const ANCLA_ESQUEMAS = 'const ESQUEMAS = {'
export function esquemas(codigo) {
  const filas = FUNCIONES.map((f) => `${JSON.stringify(f)}:${JSON.stringify({ acepta: NUEVAS[f].acepta, obligatorios: NUEVAS[f].obligatorios })}`).join(',')
  return conFinDeLinea(codigo, (c) => cambiar(c, ANCLA_ESQUEMAS, ANCLA_ESQUEMAS + filas + ',', 'esquemas'))
}

// ───────────── Armar el cuerpo del raspador
const CONSTRUCTORES_NUEVOS = `  // FUENTES PÚBLICAS (ronda 71) · cada constructor lleva SOLO lo que el actor declara y recorta el pedido a un tope sensato
  resenas_google_maps: ($json) => { const p = $json.params; const urls = [].concat(p.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)).filter((u) => u && u.url); const ids = [].concat(p.placeIds || []).filter(Boolean); const o = { maxReviews: Math.min(Number(p.maxReviews) || 100, 500), reviewsSort: 'newest', language: p.language || 'es', personalData: false }; if (urls.length) o.startUrls = urls; if (ids.length) o.placeIds = ids; return o; },
  resenas_tripadvisor: ($json) => ({ startUrls: [].concat($json.params.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)), maxItemsPerQuery: Math.min(Number($json.params.maxItemsPerQuery) || 100, 500), scrapeReviewerInfo: false, reviewsLanguages: ['ALL_REVIEW_LANGUAGES'] }),
  resenas_booking: ($json) => ({ startUrls: [].concat($json.params.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)), maxReviewsPerHotel: Math.min(Number($json.params.maxReviewsPerHotel) || 100, 500), sortReviewsBy: 'f_recent_desc' }),
  resenas_facebook: ($json) => ({ startUrls: [].concat($json.params.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)), resultsLimit: Math.min(Number($json.params.resultsLimit) || 100, 500) }),
  resenas_app_store: ($json) => { const p = $json.params; const o = { includeReviews: true, maxItems: Number(p.maxItems) || 1 }; const urls = [].concat(p.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)).filter((u) => u && u.url); if (urls.length) o.startUrls = urls; if ([].concat(p.appIds || []).length) o.appIds = [].concat(p.appIds); if (p.country) o.country = p.country; if (p.lang) o.lang = p.lang; return o; },
  publicaciones_facebook: ($json) => ({ startUrls: [].concat($json.params.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)), resultsLimit: Math.min(Number($json.params.resultsLimit) || 20, 100), captionText: $json.params.captionText !== false }),
  videos_instagram: ($json) => ({ username: [].concat($json.params.username || $json.params.usernames || []).map((s) => String(s).trim().replace(/^@/, '')).filter(Boolean), resultsLimit: Math.min(Number($json.params.resultsLimit) || 10, 50), includeTranscript: true }),
  videos_tiktok: ($json) => ({ profiles: [].concat($json.params.profiles || $json.params.usernames || []).map((s) => String(s).trim().replace(/^@/, '')).filter(Boolean), resultsPerPage: Math.min(Number($json.params.resultsPerPage) || 10, 50), profileScrapeSections: ['videos'], downloadSubtitlesOptions: 'DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES' }),
  videos_youtube: ($json) => ({ startUrls: [].concat($json.params.startUrls || []).map((u) => (typeof u === 'string' ? { url: u } : u)), maxResults: Math.min(Number($json.params.maxResults) || 10, 50), transcriptionAndSubtitle: 'TRANSCRIPTION_AS_FALLBACK', subtitlesLanguage: $json.params.subtitlesLanguage || 'es' }),
`
const ANCLA_CONSTRUCTORES = 'const CONSTRUCTORES = {\n'
const ACTORES_TABLA = 'const ACTOR_NUEVO = ' + JSON.stringify(Object.fromEntries(FUNCIONES.map((f) => [f, NUEVAS[f].actor]))) + ';\n'
const COLA_VIEJA = 'return [{ json: { ...ctx, cuerpo: cuerpo } }];'
const COLA_NUEVA = "return [{ json: { ...ctx, cuerpo: cuerpo, ...(ACTOR_NUEVO[fn] ? { actor_id: ACTOR_NUEVO[fn] } : {}) } }];"
export function armarCuerpo(codigo) {
  return conFinDeLinea(codigo, (c) => {
    c = cambiar(c, ANCLA_CONSTRUCTORES, ACTORES_TABLA + ANCLA_CONSTRUCTORES + CONSTRUCTORES_NUEVOS, 'constructores')
    return cambiar(c, COLA_VIEJA, COLA_NUEVA, 'cola')
  })
}

// ───────────── transform-sections · lo que se escribe en la respuesta y en el crudo (texto legible, sin datos personales)
export const RENDER = `
// FUENTES PÚBLICAS (ronda 71) · reseñas, textos y videos de las plataformas del cliente · una línea por pieza, SIN datos personales de quien opinó.
const ES_FUENTE_PUBLICA = /^(resenas_|publicaciones_|videos_)/.test(apifyFunction);
const primeroTexto = (o, ks) => { for (const k of ks) { const v = o && o[k]; if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
const aplanar = (v) => String(v == null ? '' : v).replace(/\\s+/g, ' ').trim();
function lineasDeFuente(fn, items) {
  const out = [];
  const meter = (it) => {
    if (!it || typeof it !== 'object') return;
    if (fn.indexOf('resenas_') === 0) {
      // la tienda de apps trae las reseñas ANIDADAS en la ficha de la app
      if (Array.isArray(it.reviews) && it.reviews.length && !it.text) { for (const r of it.reviews) meter(r); return; }
      const bien = primeroTexto(it, ['liked']); const mal = primeroTexto(it, ['disliked']);
      const texto = primeroTexto(it, ['text', 'reviewText', 'review', 'comment', 'body', 'content']) || [bien && 'lo que gustó: ' + bien, mal && 'lo que no: ' + mal].filter(Boolean).join(' · ');
      const titulo = primeroTexto(it, ['title', 'reviewTitle']);
      if (!texto && !titulo) return;
      const estrellas = it.stars != null ? it.stars : (it.rating != null ? it.rating : (it.score != null ? it.score : (it.ratingValue != null ? it.ratingValue : null)));
      const fecha = String(primeroTexto(it, ['publishedAtDate', 'publishedDate', 'reviewDate', 'date', 'createdAt', 'time', 'updatedAt'])).slice(0, 10);
      const recomienda = it.isRecommended === true ? 'recomienda' : (it.isRecommended === false ? 'no recomienda' : '');
      const resp = primeroTexto(it, ['responseFromOwnerText', 'ownerResponse']);
      out.push([estrellas != null ? '★' + estrellas : '', recomienda, fecha].filter(Boolean).join(' · ') + (titulo && texto ? ' · ' + aplanar(titulo) : '') + ' · «' + aplanar(texto || titulo) + '»' + (resp ? ' [respuesta del negocio: «' + aplanar(resp).slice(0, 300) + '»]' : ''));
    } else if (fn === 'publicaciones_facebook') {
      const texto = primeroTexto(it, ['text', 'message', 'caption', 'postText']); const trans = primeroTexto(it, ['videoTranscript', 'transcript', 'captionText', 'ocrText']);
      if (!texto && !trans) return;
      out.push([String(primeroTexto(it, ['time', 'date', 'timestamp', 'createdAt'])).slice(0, 10)].filter(Boolean).join(' · ') + (texto ? ' · «' + aplanar(texto) + '»' : '') + (trans ? ' · lo que se dice en el video: «' + aplanar(trans) + '»' : ''));
    } else {
      const caption = primeroTexto(it, ['caption', 'text', 'description', 'title']);
      const trans = primeroTexto(it, ['transcript', 'transcription', 'subtitles', 'videoTranscript', 'subtitle']);
      const url = primeroTexto(it, ['url', 'videoUrl', 'postUrl', 'webVideoUrl', 'inputUrl']);
      if (!caption && !trans) return;
      out.push('video' + (url ? ' ' + url : '') + ' · ' + String(primeroTexto(it, ['timestamp', 'createTimeISO', 'date', 'uploadDate', 'publishedAt'])).slice(0, 10) + (caption ? ' · pie: «' + aplanar(caption) + '»' : '') + ' · ' + (trans ? 'lo que se dice: «' + aplanar(trans) + '»' : 'SIN transcripción'));
    }
  };
  for (const it of items) meter(it);
  return out;
}
function seccionesDeFuente(fn, items, etiqueta) {
  const lineas = lineasDeFuente(fn, items);
  const secciones = []; let actual = ''; let usadas = 0;
  const TOPE = 7000; const MAX_SECCIONES = 8;
  for (const l of lineas) {
    if ((actual + NL + l).length > TOPE) { if (actual) secciones.push(actual); actual = l.slice(0, TOPE); } else { actual = actual ? actual + NL + l : l; }
    usadas++;
  }
  if (actual) secciones.push(actual);
  const recortada = secciones.length > MAX_SECCIONES;
  const finales = secciones.slice(0, MAX_SECCIONES);
  return { lineas: lineas.length, recortada, secciones: finales.map((t, i) => ({ section_label: etiqueta + (finales.length > 1 ? ' · ' + (i + 1) + '/' + finales.length : ''), text: t + (recortada && i === finales.length - 1 ? NL + '⟨recortado · se guardaron ' + MAX_SECCIONES + ' secciones de ' + secciones.length + '⟩' : '') })) };
}
`
const ETIQUETAS = Object.fromEntries(FUNCIONES.map((f) => [f, NUEVAS[f].etiqueta]))
export function transformSections(codigo) {
  return conFinDeLinea(codigo, (c) => {
    // 1 · funciones de ayuda, antes de las etiquetas
    c = cambiar(c, 'const sectionLabelBase = {', RENDER + '\nconst sectionLabelBase = {', 'render')
    // 2 · rótulos y tabla de origen
    c = cambiar(c, "  twitter_scraper: 'twitter_competitive',\n}[apifyFunction] || 'apify_scrape';", "  twitter_scraper: 'twitter_competitive',\n  ...(" + JSON.stringify(ETIQUETAS) + "),\n}[apifyFunction] || 'apify_scrape';", 'etiquetas')
    c = cambiar(c, "  facebook_page_scraper: 'client_competitive_landscape',\n}[apifyFunction] || 'client_competitive_landscape';", "  facebook_page_scraper: 'client_competitive_landscape',\n  ...Object.fromEntries(['resenas_google_maps', 'resenas_tripadvisor', 'resenas_booking', 'resenas_facebook', 'resenas_app_store', 'publicaciones_facebook', 'videos_instagram', 'videos_tiktok', 'videos_youtube'].map((f) => [f, 'client_voc_library'])),\n}[apifyFunction] || 'client_competitive_landscape';", 'tabla')
    // 3 · el texto y las secciones de estas funciones salen de su propio redactor
    c = cambiar(c, 'const sinDatos = data.length === 0;\nconst text = sinDatos\n  ? \'\'\n  : data.slice(0, 50)', "const sinDatos = data.length === 0;\nconst FUENTE = ES_FUENTE_PUBLICA && !sinDatos ? seccionesDeFuente(apifyFunction, data, sectionLabelBase) : null;\nconst text = (sinDatos || FUENTE)\n  ? (FUENTE ? FUENTE.secciones.map((s) => s.text).join(NL + NL) : '')\n  : data.slice(0, 50)", 'texto')
    c = cambiar(c, "    sections: sinDatos ? [] : ((apifyFunction === 'website_content_scraper'", "    sections: sinDatos ? [] : (FUENTE ? FUENTE.secciones : (apifyFunction === 'website_content_scraper'", 'secciones')
    return c
  })
}

// ───────────── Switch + nodo nuevo
export function conRutaNueva(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const sw = f.nodes.find((n) => n.name === 'Switch · apify_function')
  const modelo = f.nodes.find((n) => n.name === 'apify-fb-ads')
  if (!sw || !modelo) throw new Error('falta el Switch o el nodo modelo')
  if (sw.parameters.rules.values.some((r) => r.outputKey === 'fuentes_publicas')) throw new Error('la ruta ya existe')
  const cond = (id, prefijo) => ({ id, leftValue: '={{ $json.apify_function }}', rightValue: prefijo, operator: { type: 'string', operation: 'startsWith' } })
  sw.parameters.rules.values.push({
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [cond('fp1', 'resenas_'), cond('fp2', 'publicaciones_'), cond('fp3', 'videos_')], combinator: 'or' },
    renameOutput: true, outputKey: 'fuentes_publicas',
  })
  const nuevo = JSON.parse(JSON.stringify(modelo))
  nuevo.id = 'apify-fuentes-publicas'; nuevo.name = 'apify-fuentes-publicas'
  nuevo.notes = 'FUENTES PÚBLICAS (ronda 71) · UN solo nodo para las funciones nuevas: el actor viene en `actor_id` (tabla cerrada en «Armar el cuerpo del raspador») · llave por cabecera'
  nuevo.parameters.url = '=https://api.apify.com/v2/acts/{{ $json.actor_id }}/run-sync-get-dataset-items?timeout=280'
  nuevo.parameters.options = { ...(nuevo.parameters.options || {}), timeout: 295000 }
  nuevo.position = [(modelo.position?.[0] ?? 0), (modelo.position?.[1] ?? 0) + 2400]
  f.nodes.push(nuevo)
  f.connections['Switch · apify_function'].main.push([{ node: 'apify-fuentes-publicas', type: 'main', index: 0 }])
  f.connections['apify-fuentes-publicas'] = JSON.parse(JSON.stringify(f.connections['apify-fb-ads']))
  return f
}

export function servicioFuentesPublicas(flujo) {
  let f = JSON.parse(JSON.stringify(flujo))
  const por = (n) => { const x = f.nodes.filter((m) => m.name === n); if (x.length !== 1) throw new Error(`${x.length} nodos «${n}»`); return x[0] }
  por('Validate Body').parameters.jsCode = validateBody(por('Validate Body').parameters.jsCode)
  por('Validar params · contrato').parameters.jsCode = contrato(por('Validar params · contrato').parameters.jsCode)
  por('Validar el cuerpo contra el esquema').parameters.jsCode = esquemas(por('Validar el cuerpo contra el esquema').parameters.jsCode)
  por('Armar el cuerpo del raspador').parameters.jsCode = armarCuerpo(por('Armar el cuerpo del raspador').parameters.jsCode)
  por('transform-sections').parameters.jsCode = transformSections(por('transform-sections').parameters.jsCode)
  f = conRutaNueva(f)
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-fuentes-publicas.mjs')) {
  const antes = JSON.parse(fs.readFileSync(RAIZ + 'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-fuentes-2026-10-12.json', 'utf8'))
  fs.writeFileSync(RAIZ + 'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-fuentes-2026-10-12.json', JSON.stringify(servicioFuentesPublicas(antes), null, 2))
  console.log('ok')
}
