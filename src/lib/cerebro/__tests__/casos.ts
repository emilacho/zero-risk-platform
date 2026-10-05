/**
 * CASOS DE PRUEBA DEL TRAMO 1 · escritos ANTES de que exista el código (paso 3 del diseño v3).
 *
 * Tres clientes INVENTADOS de rubros distintos (ninguno es un cliente real) y un cuarto cliente cuyas filas
 * conviven en la misma base falsa para probar que nada se filtra de uno a otro:
 *   · A · negocio con varias sedes (horarios por sede, promoción con fecha, versiones de piezas, correcciones del aprobador)
 *   · B · tienda con catálogo grande (más de 30 productos con precio → la lista los agrupa por familia)
 *   · C · servicio profesional sin datos estructurados (y una lectura que FALLA: un error nunca se lee como vacío)
 *   · Z · otro cliente: sus filas jamás deben aparecer en la lista de los demás
 *
 * La base falsa SOLO sabe leer (no tiene ninguna operación de escritura). Cada lectura queda registrada para
 * comprobar que SIEMPRE lleva el filtro de cliente.
 */
import type { Consulta, Fila, PeticionDeLectura } from '../consulta'

export const AHORA = new Date('2026-10-05T12:00:00Z')
export const A = 'aaaaaaaa-0000-4000-8000-00000000000a'
export const B = 'bbbbbbbb-0000-4000-8000-00000000000b'
export const C = 'cccccccc-0000-4000-8000-00000000000c'
export const Z = 'zzzzzzzz-0000-4000-8000-00000000000f'
export const NO_EXISTE = 'dddddddd-0000-4000-8000-00000000000d'

const dias = (n: number): string => new Date(AHORA.getTime() - n * 86_400_000).toISOString()

export type Tablas = Record<string, Fila[]>

export interface BaseFalsa {
  consulta: Consulta
  llamadas: PeticionDeLectura[]
}

/** Lee en memoria con los mismos filtros de igualdad que usa la lectura real. `fallan`: tablas cuya lectura devuelve error. */
export function crearBaseFalsa(tablas: Tablas, fallan: string[] = []): BaseFalsa {
  const llamadas: PeticionDeLectura[] = []
  const consulta: Consulta = async (p) => {
    llamadas.push(p)
    if (fallan.includes(p.tabla)) return { filas: [], error: `fallo simulado de lectura en ${p.tabla}` }
    let filas = (tablas[p.tabla] ?? []).filter((f) => Object.entries(p.donde).every(([k, v]) => String(f[k]) === String(v)))
    if (p.orden) {
      const { columna, descendente } = p.orden
      filas = [...filas].sort((x, y) => (String(x[columna]) < String(y[columna]) ? -1 : 1) * (descendente ? -1 : 1))
    }
    if (typeof p.limite === 'number') filas = filas.slice(0, p.limite)
    return { filas: filas.map((f) => ({ ...f })), error: null }
  }
  return { consulta, llamadas }
}

const texto = (n: number): string => 'palabra '.repeat(n).trim()

/** schema.org de un negocio con servicios y precio dentro de un catálogo de ofertas */
const jsonLdServicios = JSON.stringify([
  [
    {
      '@context': 'https://schema.org',
      '@type': 'MedicalClinic',
      name: 'Negocio sintético A',
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: 'Servicios',
        itemListElement: [
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Servicio uno', description: 'Descripción del servicio uno' }, price: '40.00', priceCurrency: 'USD' },
          { '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'Servicio dos' }, price: '900', priceCurrency: 'USD' },
        ],
      },
    },
  ],
])

/** 120 productos repartidos en 4 familias */
const familias = ['Familia uno', 'Familia dos', 'Familia tres', 'Familia cuatro']
const jsonLdCatalogo = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  itemListElement: Array.from({ length: 120 }, (_, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    item: { '@type': 'Product', name: `Producto ${i + 1}`, category: familias[i % 4], offers: { '@type': 'Offer', price: String(10 + i), priceCurrency: 'USD' } },
  })),
})

export function tablasDeLaBase(): Tablas {
  return {
    clients: [
      { id: A, name: 'Negocio sintético A', website_url: 'https://a.example', status: 'active', config: { business_model: { source: 'auto_discovery_agent', value: 'modelo deducido' }, apify: {} } },
      { id: B, name: 'Tienda sintética B', website_url: 'https://b.example', status: 'active', config: {} },
      { id: C, name: 'Estudio sintético C', website_url: 'https://c.example', status: 'active', config: {} },
      { id: Z, name: 'Otro cliente Z', website_url: 'https://z.example', status: 'active', config: {} },
    ],
    client_brand_books: [
      { id: 'bb-1', client_id: A, version: 1, human_validated: true, auto_generated: true, created_at: dias(120), content_text: texto(500) },
      { id: 'bb-2', client_id: A, version: 2, human_validated: false, auto_generated: true, created_at: dias(15), content_text: texto(500) },
      { id: 'bb-c1', client_id: C, version: 1, human_validated: false, auto_generated: true, created_at: dias(3), content_text: texto(300) },
      { id: 'bb-z1', client_id: Z, version: 1, human_validated: true, auto_generated: false, created_at: dias(3), content_text: texto(300) },
    ],
    client_icp_documents: [
      { id: 'icp-1', client_id: A, audience_segment: 'Segmento uno', created_at: dias(15), content_text: texto(80) },
      { id: 'icp-z', client_id: Z, audience_segment: 'Segmento de Z', created_at: dias(15), content_text: texto(80) },
    ],
    client_competitive_landscape: [
      { id: 'comp-1', client_id: A, competitor_name: 'Competidor uno', created_at: dias(15), last_analyzed_at: dias(15), content_text: texto(80) },
      // fila interna de resumen (nombre que empieza con «_»): no es un competidor
      { id: 'comp-res', client_id: A, competitor_name: '_landscape_summary', created_at: dias(15), last_analyzed_at: dias(15), content_text: texto(80) },
      { id: 'comp-z', client_id: Z, competitor_name: 'Competidor de Z', created_at: dias(15), last_analyzed_at: dias(15), content_text: texto(80) },
    ],
    client_web_pages: [
      // A · su sitio, verificado hace 46 días (catálogo: 30 → vencido; precio: 7 → vencido)
      { id: 'wp-a1', client_id: A, url: 'https://a.example/', title: 'Inicio A', owner_role: 'propio', competitor_id: null, crawled_at: dias(46), content_text: `${texto(60)}\n${jsonLdServicios}` },
      // A · una página de un competidor
      { id: 'wp-a2', client_id: A, url: 'https://otro.example/', title: 'Competidor', owner_role: 'competidor', competitor_id: 'comp-1', crawled_at: dias(2), content_text: texto(40) },
      // A · una página propia con un precio SOLO en texto libre (sin datos estructurados), verificada hace 3 días
      { id: 'wp-a3', client_id: A, url: 'https://a.example/precios', title: 'Precios A', owner_role: 'propio', competitor_id: null, crawled_at: dias(3), content_text: 'Nuestro servicio cuesta 25 dólares por sesión.' },
      // B · catálogo grande verificado hace 2 días
      { id: 'wp-b1', client_id: B, url: 'https://b.example/', title: 'Inicio B', owner_role: 'propio', competitor_id: null, crawled_at: dias(2), content_text: `${texto(30)}\n${jsonLdCatalogo}` },
      // C · sin datos estructurados, con una frase repetida 8 veces
      { id: 'wp-c1', client_id: C, url: 'https://c.example/', title: 'Inicio C', owner_role: 'propio', competitor_id: null, crawled_at: dias(5), content_text: `${Array(8).fill('Frase repetida de la cabecera.').join('\n')}\nSegunda frase distinta.` },
      { id: 'wp-z1', client_id: Z, url: 'https://z.example/', title: 'Inicio Z', owner_role: 'propio', competitor_id: null, crawled_at: dias(2), content_text: texto(30) },
    ],
    client_sedes: [
      { id: 'sd-n', client_id: A, clave: 'norte', ciudad: 'Ciudad uno', created_at: dias(100), updated_at: dias(30) },
      { id: 'sd-c', client_id: A, clave: 'centro', ciudad: 'Ciudad dos' },
      { id: 'sd-s', client_id: A, clave: 'sur', ciudad: 'Ciudad tres' },
      { id: 'sd-z', client_id: Z, clave: 'unica', ciudad: 'Ciudad de Z' },
    ],
    client_sede_datos: [
      // el horario de la sede norte según su sitio: dos observaciones (queda la más nueva, con el conteo de anteriores)
      { id: 'dat-1', client_id: A, sede_id: 'sd-n', campo: 'horario', valor_texto: 'lunes a viernes 8–16 (antiguo)', fuente: 'sitio', alcance: 'sede', observado_en: dias(35) },
      { id: 'dat-2', client_id: A, sede_id: 'sd-n', campo: 'horario', valor_texto: 'lunes a viernes 9–17', fuente: 'sitio', alcance: 'sede', observado_en: dias(1) },
      // el mismo campo según otra fuente, hace 15 días (horario: 7 → vencido)
      { id: 'dat-3', client_id: A, sede_id: 'sd-n', campo: 'horario', valor_texto: 'lunes a viernes 8–16', fuente: 'mapas', alcance: 'sede', observado_en: dias(15) },
      // dirección de la sede centro hace 65 días (dirección: 30 → vencida)
      { id: 'dat-4', client_id: A, sede_id: 'sd-c', campo: 'direccion', valor_texto: 'Calle uno 123', fuente: 'sitio', alcance: 'sede', observado_en: dias(65) },
      // dato de la cuenta, sin sede
      { id: 'dat-5', client_id: A, sede_id: null, campo: 'canal_pedido', valor_texto: 'teléfono 000', fuente: 'instagram', alcance: 'cuenta', observado_en: dias(2) },
      { id: 'dat-z', client_id: Z, sede_id: 'sd-z', campo: 'horario', valor_texto: 'horario de Z', fuente: 'sitio', alcance: 'sede', observado_en: dias(1) },
    ],
    client_social_images: [
      { id: 'im-1', client_id: A, owner_role: 'propio', handle: 'cuenta_a', post_id: 'p1', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-1.jpg', caption: 'texto de la publicación', posted_at: dias(4), post_url: 'https://red/p1', posicion: 'unica', producto: ['Servicio uno'], producto_fuente: 'caption', created_at: dias(4) },
      { id: 'im-2', client_id: A, owner_role: 'propio', handle: 'cuenta_a', post_id: 'p2', tipo: 'post_video', medio: 'reel', estado: 'ok', url: 'https://bucket/im-2.jpg', caption: 'texto del reel', posted_at: dias(40), post_url: 'https://red/p2', posicion: 'unica', producto: [], created_at: dias(40) },
      { id: 'im-3', client_id: A, owner_role: 'competidor', handle: 'cuenta_otra', post_id: 'p3', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-3.jpg', caption: null, posted_at: dias(3), post_url: 'https://red/p3', posicion: 'unica', producto: [], created_at: dias(3) },
      { id: 'im-4', client_id: A, owner_role: 'propio', handle: 'cuenta_a', post_id: null, tipo: 'logo', medio: 'logo', estado: 'ok', url: 'https://bucket/logo.jpg', caption: null, posted_at: null, post_url: null, posicion: 'unica', producto: [], created_at: dias(40) },
      // publicada hace más de un año pero capturada ayer: la vigencia es de la ÚLTIMA VERIFICACIÓN, no de la fecha de la publicación
      { id: 'im-5', client_id: A, owner_role: 'propio', handle: 'cuenta_a', post_id: 'p5', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-5.jpg', caption: 'publicación antigua', posted_at: dias(400), post_url: 'https://red/p5', posicion: 'unica', producto: [], created_at: dias(1) },
      // H2 · dos publicaciones del mismo día con la MISMA leyenda y sin producto: no pueden salir con la misma línea
      { id: 'im-6', client_id: A, owner_role: 'propio', handle: 'cuenta_a', post_id: 'p6', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-6.jpg', caption: 'misma leyenda', posted_at: dias(2), post_url: 'https://red/p6', posicion: 'unica', producto: [], producto_fuente: 'desconocido', created_at: dias(2) },
      { id: 'im-7', client_id: A, owner_role: 'propio', handle: 'cuenta_a', post_id: 'p7', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-7.jpg', caption: 'misma leyenda', posted_at: dias(2), post_url: 'https://red/p7', posicion: 'unica', producto: [], producto_fuente: 'desconocido', created_at: dias(2) },
      { id: 'im-c1', client_id: C, owner_role: 'propio', handle: 'cuenta_c', post_id: 'c1', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-c1.jpg', caption: 'x', posted_at: dias(1), post_url: 'https://red/c1', posicion: 'unica', producto: [], created_at: dias(1) },
      { id: 'im-z1', client_id: Z, owner_role: 'propio', handle: 'cuenta_z', post_id: 'z1', tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: 'https://bucket/im-z1.jpg', caption: 'foto de Z', posted_at: dias(1), post_url: 'https://red/z1', posicion: 'unica', producto: [], created_at: dias(1) },
    ],
    client_historical_outputs: [
      { id: 'plan-1', client_id: A, output_type: 'campaign_plan_90d', title: 'Plan de 90 días', status: 'draft', created_at: dias(34), content_text: texto(200), provenance_tag: { fuente: 'flujo' }, hitl_verdict: null, human_edits: null },
      { id: 'part-1', client_id: A, output_type: 'campaign_brief_pack', title: 'Parte de trabajo', status: 'draft', created_at: dias(30), content_text: texto(300), provenance_tag: { plan_id: 'plan-1', valido: true }, hitl_verdict: null, human_edits: null },
      { id: 'part-2', client_id: A, output_type: 'campaign_brief_pack', title: '⛔ PARTE NO VÁLIDO · Parte de trabajo', status: 'draft', created_at: dias(29), content_text: texto(300), provenance_tag: { plan_id: 'plan-1', valido: false, motivo_invalido: 'el redactor no cerró el bloque' }, hitl_verdict: null, human_edits: null },
      // tres versiones de la MISMA pieza (mismo entregable): la 2.ª está aprobada, la 3.ª es un borrador más nuevo
      { id: 'pz-1', client_id: A, output_type: 'campaign_piece', title: 'Pieza · E-1 · versión 1', status: 'draft', created_at: dias(20), content_text: texto(100), provenance_tag: { brief_id: 'E-1', parte_id: 'part-1' }, hitl_verdict: null, human_edits: null },
      { id: 'pz-2', client_id: A, output_type: 'campaign_piece', title: 'Pieza · E-1 · versión 2', status: 'approved', created_at: dias(18), content_text: texto(100), provenance_tag: { brief_id: 'E-1', parte_id: 'part-1' }, hitl_verdict: 'aprobada', human_edits: 'cambié el segundo párrafo' },
      { id: 'pz-3', client_id: A, output_type: 'campaign_piece', title: 'Pieza · E-1 · versión 3', status: 'draft', created_at: dias(10), content_text: texto(100), provenance_tag: { brief_id: 'E-1', parte_id: 'part-1' }, hitl_verdict: null, human_edits: null },
      // otro entregable: una sola versión
      { id: 'pz-4', client_id: A, output_type: 'campaign_piece', title: 'Pieza · E-2', status: 'draft', created_at: dias(9), content_text: texto(100), provenance_tag: { brief_id: 'E-2', parte_id: 'part-1' }, hitl_verdict: null, human_edits: null },
      // D1 · las PIEZAS guardan la validez en `valida` (las partes, en `valido`): la inválida es la más NUEVA de su entregable y no puede salir vigente
      { id: 'pz-5', client_id: A, output_type: 'campaign_piece', title: 'Pieza · E-3 · válida', status: 'draft', created_at: dias(8), content_text: texto(100), provenance_tag: { brief_id: 'E-3', parte_id: 'part-1', valida: true }, hitl_verdict: null, human_edits: null },
      { id: 'pz-6', client_id: A, output_type: 'campaign_piece', title: 'Pieza · E-3 · inválida', status: 'draft', created_at: dias(5), content_text: texto(100), provenance_tag: { brief_id: 'E-3', parte_id: 'part-1', valida: false, motivo_invalido: 'la pieza no cerró' }, hitl_verdict: null, human_edits: null },
      // D2 · un tipo de trabajo SIN clave de versión conocida: tres correos distintos son tres cosas, no tres versiones de una
      { id: 'em-1', client_id: A, output_type: 'campaign_email', title: 'Correo de bienvenida', status: 'draft', created_at: dias(7), content_text: texto(50), provenance_tag: {}, hitl_verdict: null, human_edits: null },
      { id: 'em-2', client_id: A, output_type: 'campaign_email', title: 'Correo de carrito abandonado', status: 'draft', created_at: dias(6), content_text: texto(50), provenance_tag: {}, hitl_verdict: null, human_edits: null },
      { id: 'em-3', client_id: A, output_type: 'campaign_email', title: 'Correo de reactivación', status: 'draft', created_at: dias(4), content_text: texto(50), provenance_tag: {}, hitl_verdict: null, human_edits: null },
      // D2 · un tipo CON clave conocida pero a la que le faltan las claves (no se sabe de qué entregable es): tampoco se agrupa por tipo
      { id: 'pz-8', client_id: A, output_type: 'campaign_piece', title: 'Pieza sin entregable declarado · uno', status: 'draft', created_at: dias(3), content_text: texto(50), provenance_tag: {}, hitl_verdict: null, human_edits: null },
      { id: 'pz-9', client_id: A, output_type: 'campaign_piece', title: 'Pieza sin entregable declarado · dos', status: 'draft', created_at: dias(2), content_text: texto(50), provenance_tag: {}, hitl_verdict: null, human_edits: null },
      { id: 'pz-z', client_id: Z, output_type: 'campaign_piece', title: 'Pieza de Z', status: 'draft', created_at: dias(9), content_text: texto(100), provenance_tag: { brief_id: 'E-9', parte_id: 'part-z' }, hitl_verdict: null, human_edits: null },
    ],
    hitl_queue: [
      { id: 'hq-1', client_id: A, type: 'pieza_aprobacion', status: 'edited', output_id: 'pz-3', decision: { cambio: 'más corto' }, resolution_notes: null, resolved_at: dias(8), created_at: dias(9) },
      { id: 'hq-2', client_id: A, type: 'confirm_competitor_list', status: 'pending', output_id: null, decision: {}, resolution_notes: null, resolved_at: null, created_at: dias(30) },
      { id: 'hq-z', client_id: Z, type: 'pieza_aprobacion', status: 'rejected', output_id: 'pz-z', decision: { motivo: 'no' }, resolution_notes: 'no', resolved_at: dias(1), created_at: dias(2) },
    ],
    client_brain_chunks: [
      // trozos de fuentes que la lista YA cubre con sus propias líneas (no deben duplicarse)
      { id: 'ch-1', client_id: A, source_table: 'client_brand_books', source_id: 'bb-2', section_label: 'positioning', chunk_text: 'x', provenance_tag: { type: 'evidence', trust_level: 'untrusted' }, metadata: {}, created_at: dias(15) },
      // un trozo de una fuente que NINGÚN lector lista: debe aparecer como línea propia
      { id: 'ch-2', client_id: A, source_table: 'fuente_sin_lector', source_id: 'zz-1', section_label: 'nota', chunk_text: 'texto de un trozo de otra fuente', provenance_tag: { type: 'evidence', trust_level: 'untrusted' }, metadata: {}, created_at: dias(3) },
      { id: 'ch-z', client_id: Z, source_table: 'fuente_sin_lector', source_id: 'zz-9', section_label: 'nota', chunk_text: 'trozo de Z', provenance_tag: { type: 'evidence', trust_level: 'untrusted' }, metadata: {}, created_at: dias(3) },
    ],
  }
}
