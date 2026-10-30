/**
 * EL MENSAJE DE LA PIEZA · lo que llega al Slack de Emilio: el texto, la imagen y un enlace directo a la pieza en el dashboard. SIN botones (30-oct, decisión de Emilio: «yo trabajo a través del dashboard»); decidir se hace allí. Un comentario escrito en el hilo sigue alimentando las notas.
 * Puro: sale de la pieza ya hecha. Respeta los límites de Slack (texto de sección ≤ 3000, ≤ 50 bloques, imágenes solo con https).
 */
export const ACCION_APROBAR = 'nota_aprobar'
export const ACCION_RECHAZAR = 'nota_rechazar'
/** el dashboard de Emilio; la pieza se abre con `?id=<hitl_id>` */
export const TABLERO_URL = 'https://zero-risk-dashboard.vercel.app'
export const enlaceDeLaPieza = (hitl_id: string): string => `${TABLERO_URL}/piezas?id=${encodeURIComponent(hitl_id)}`
export const MAX_SECCION = 2800
export const MAX_IMAGENES = 10 // un carrusel trae hasta 10 láminas; Slack admite 50 bloques

export interface PiezaParaSlack {
  hitl_id: string
  cliente: string
  titulo: string
  familia?: string | null
  texto?: string | null
  hashtags?: string[]
  imagenes?: string[]
}

const recortar = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)
/** Slack acepta en `image_url` solo direcciones públicas https */
const esImagenPublica = (u: string): boolean => /^https:\/\/[^\s]+$/i.test(u)

export function mensajeDeLaPieza(p: PiezaParaSlack): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: recortar(`Pieza lista para revisar · ${p.cliente}`, 150), emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: recortar(`*${p.titulo}*${p.familia ? ` · ${p.familia}` : ''}`, 600) } },
  ]
  if (p.texto && p.texto.trim()) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: recortar(p.texto.trim(), MAX_SECCION) } })
  if (p.hashtags && p.hashtags.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: recortar(p.hashtags.join(' '), 900) }] })
  for (const [i, u] of (p.imagenes ?? []).filter(esImagenPublica).slice(0, MAX_IMAGENES).entries()) blocks.push({ type: 'image', image_url: u, alt_text: `${p.titulo} · imagen ${i + 1}` })
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${enlaceDeLaPieza(p.hitl_id)}|Ver en el dashboard>` } })
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: 'Aprueba, rechaza o pide cambios en el dashboard. Para comentar, responde en este hilo. Escribe *general:* al inicio si el comentario vale para todos tus clientes. Nada se publica sin tu aprobación.' }] })
  return { text: recortar(`Pieza lista para revisar · ${p.cliente} · ${p.titulo}`, 300), blocks }
}
