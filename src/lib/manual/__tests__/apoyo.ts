/** apoyo de las pruebas de la revisión del manual: un cliente SINTÉTICO de otro rubro (nada del piloto) */
import type { CanalDeFuente, Fuente, RolDeFuente, TipoDeFuente } from '..'

export const F = (id: string, tipo: TipoDeFuente, texto: string, canal: CanalDeFuente = 'sitio', rol: RolDeFuente = 'cuerpo', url?: string): Fuente => ({ id, tipo, canal, rol, rotulo: `${canal} · ${rol} · ${id}`, texto, ...(url ? { url } : {}) })

/** una clínica dental inventada: sitio, Instagram propio y un competidor */
export const PROPIOS = { sitio: 'https://www.clinicaejemplo.test', handles: ['clinicaejemplo'] }

export const filaSitio = (id: string, paginas: Array<{ url: string; text: string; title?: string; description?: string; jsonLd?: unknown }>) => ({
  id, apify_function: 'website_content_scraper', params: { url: PROPIOS.sitio },
  respuesta: paginas.map((p) => ({ url: p.url, text: p.text, markdown: `# ${p.title ?? ''}\n\n${p.text}`, metadata: { title: p.title, description: p.description, jsonLd: p.jsonLd } })),
})
export const filaInstagram = (id: string, usuario: string, biografia: string, posts: Array<{ caption: string; ownerUsername?: string }> = []) => ({
  id, apify_function: 'instagram_scraper', params: { usernames: [usuario] },
  respuesta: [{ username: usuario, fullName: usuario.toUpperCase(), biography: biografia, latestPosts: posts }],
})
export const filaMapas = (id: string, partes: Record<string, unknown>) => ({ id, apify_function: 'own_google_maps_profile', params: { searchStringsArray: ['Clinica Ejemplo'] }, respuesta: [partes] })
