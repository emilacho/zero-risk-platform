/**
 * PUBLICAR DE VERDAD en Meta una pieza ya armada (16-nov · GO Lenovo «encender la publicación real» · firma de Emilio 19:07 · CC3).
 *
 * Solo publicación ORGÁNICA. Las únicas rutas que este archivo puede llamar con POST son estas cuatro, y solo en la cuenta de la ficha del cliente:
 *   /<instagram_id>/media · /<instagram_id>/media_publish · /<pagina_facebook>/photos · /<pagina_facebook>/feed
 * Nada de pauta ni de promoción (`/promote`, anuncios, campañas): eso necesita presupuesto firmado aparte. Cualquier otra ruta se niega sin llamar a nadie.
 *
 * Token · `META_ACCESS_TOKEN` (usuario del sistema). Facebook exige el token DE LA PÁGINA (se pide con el del sistema); Instagram acepta el del sistema.
 * Nunca se devuelve un token.
 */
import { META_GRAPH_BASE, tokenDePagina, type CuentasMeta } from '@/lib/clients/cuentas-meta'
import type { PiezaEnsayada } from './en-ensayo'

export type ResultadoDePieza =
  | { canal: string; ok: true; id: string; creation_id?: string }
  | { canal: string; ok: false; paso: string; error: string }

/** ¿esta ruta es una de las cuatro de publicación orgánica, en la cuenta de la ficha de ESTE cliente? */
export function rutaPermitida(ruta: string, canal: string, cuentas: CuentasMeta): boolean {
  const m = /^\/(\d{5,25})\/([a-z_]+)$/.exec(ruta) // la lista de lo permitido vive SOLO abajo, por red
  if (!m) return false
  if (canal === 'instagram') return m[1] === cuentas.instagram_id && (m[2] === 'media' || m[2] === 'media_publish')
  if (canal === 'facebook') return m[1] === cuentas.pagina_facebook && (m[2] === 'photos' || m[2] === 'feed')
  return false
}

type Json = { id?: string; post_id?: string; status_code?: string; error?: { message?: string } }

async function postear(ruta: string, cuerpo: Record<string, unknown>, token: string): Promise<{ ok: true; j: Json } | { ok: false; error: string }> {
  try {
    const r = await fetch(`${META_GRAPH_BASE}${ruta}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(60_000),
    })
    const j = (await r.json().catch(() => ({}))) as Json
    if (!r.ok || j.error) return { ok: false, error: j.error?.message || `status_${r.status}` }
    return { ok: true, j }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Instagram procesa la imagen antes de dejar publicar el contenedor: se espera a FINISHED (hasta ~60 s). */
async function esperarContenedor(id: string, token: string, intentos: number, pausaMs: number): Promise<string | null> {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${META_GRAPH_BASE}/${id}?fields=status_code&access_token=${encodeURIComponent(token)}`, { method: 'GET', signal: AbortSignal.timeout(20_000) })
      const j = (await r.json().catch(() => ({}))) as Json
      if (j.status_code === 'FINISHED') return null
      if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') return `el contenedor quedó en ${j.status_code}`
    } catch { /* se reintenta */ }
    if (pausaMs > 0) await new Promise((ok) => setTimeout(ok, pausaMs))
  }
  return 'el contenedor no terminó de procesarse a tiempo'
}

export async function publicarPiezaEnMeta(
  p: PiezaEnsayada,
  cuentas: CuentasMeta,
  env: Record<string, string | undefined>,
  espera: { intentos: number; pausaMs: number } = { intentos: 20, pausaMs: 3000 },
): Promise<ResultadoDePieza> {
  const canal = p.canal
  const token = env.META_ACCESS_TOKEN || ''
  if (!token) return { canal, ok: false, paso: 'configuracion', error: 'falta META_ACCESS_TOKEN' }
  if (!p.armada || !p.solicitudes.length) return { canal, ok: false, paso: 'armado', error: 'la pieza no está armada' }
  for (const s of p.solicitudes) if (!rutaPermitida(s.ruta, canal, cuentas)) return { canal, ok: false, paso: s.paso, error: `ruta no permitida: ${s.ruta}` }

  if (canal === 'instagram') {
    const [contenedor, publicar] = p.solicitudes
    if (!contenedor || !publicar || contenedor.paso !== 'contenedor' || publicar.paso !== 'publicar') return { canal, ok: false, paso: 'armado', error: 'instagram necesita contenedor y publicar' }
    const c = await postear(contenedor.ruta, contenedor.cuerpo, token)
    if (!c.ok || !c.j.id) return { canal, ok: false, paso: 'contenedor', error: c.ok ? 'Meta no devolvió el contenedor' : c.error }
    const mal = await esperarContenedor(c.j.id, token, espera.intentos, espera.pausaMs)
    if (mal) return { canal, ok: false, paso: 'contenedor', error: mal }
    const pub = await postear(publicar.ruta, { creation_id: c.j.id }, token)
    if (!pub.ok || !pub.j.id) return { canal, ok: false, paso: 'publicar', error: pub.ok ? 'Meta no devolvió la publicación' : pub.error }
    return { canal, ok: true, id: pub.j.id, creation_id: c.j.id }
  }

  if (canal === 'facebook') {
    const [publicar] = p.solicitudes
    const pagina = await tokenDePagina(cuentas.pagina_facebook as string, token)
    if (!pagina.ok) return { canal, ok: false, paso: 'token_de_pagina', error: pagina.detalle }
    const r = await postear(publicar.ruta, publicar.cuerpo, pagina.token)
    const id = r.ok ? r.j.post_id || r.j.id : null
    if (!r.ok || !id) return { canal, ok: false, paso: 'publicar', error: r.ok ? 'Meta no devolvió la publicación' : r.error }
    return { canal, ok: true, id }
  }

  return { canal, ok: false, paso: 'armado', error: `sin publicador para «${canal}»` }
}
