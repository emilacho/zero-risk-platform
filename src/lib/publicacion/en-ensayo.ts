/**
 * PUBLICAR LO APROBADO · SOLO EN ENSAYO (CC#2 · 19-oct · arreglo 5 de la cadena).
 *
 * El publicador de n8n llamaba a una ruta que no existe y nadie publicaba lo que la bandeja aprobaba. Esto cierra ese tramo SIN publicar nada:
 *  · `encolarLote` deja el lote de piezas en la bandeja (tipo `social_batch_review`), una sola vez por `task_id`;
 *  · `publicarAprobado` solo trabaja sobre un lote APROBADO en la bandeja, arma la solicitud exacta que se mandaría a Meta (sin la llave), comprueba qué configuración hay
 *    y deja el resultado en el propio elemento de la bandeja. NO hay ningún puerto de red aquí: esta función no puede llamar a Meta ni a ningún otro servicio.
 *
 * Publicar de verdad NO está construido: pedirlo (`real: true`) se rechaza. Antes de construirlo hace falta una cuenta de Meta POR CLIENTE (hoy las rutas de Meta
 * usan una sola cuenta del entorno: publicaría en la cuenta de la agencia, no en la del cliente).
 * Puro: lo que toca la base entra por `PuertosDePublicacion`.
 */

export const TIPO_LOTE_SOCIAL = 'social_batch_review'
export const REDES_CON_PUBLICADOR = ['instagram', 'facebook'] as const
export type RedConPublicador = (typeof REDES_CON_PUBLICADOR)[number]

export const MAX_PIEZAS_POR_LOTE = 10
export const MAX_CAPTION_INSTAGRAM = 2200

export interface PiezaSocial {
  canal: string
  image_url?: string
  caption?: string
  message?: string
  link_url?: string
}
export interface LoteSocial {
  task_id: string
  client_id: string
  piezas: PiezaSocial[]
  programar_para?: string
}

export interface ElementoDeBandeja {
  id: string
  type: string | null
  status: string
  client_id: string | null
  metadata: Record<string, unknown> | null
}

export interface PuertosDePublicacion {
  /** el elemento de la bandeja por id; null si no existe */
  leerElemento(id: string): Promise<ElementoDeBandeja | null>
  /** guarda el resultado del ensayo dentro de `metadata.publicacion_ensayo` del elemento (sin tocar el resto) */
  guardarEnsayo(id: string, ensayo: ResultadoDeEnsayo): Promise<void>
  /** el lote ya encolado de ese `task_id` y cliente, si existe */
  buscarLote(task_id: string, client_id: string): Promise<{ id: string } | null>
  /** crea el elemento de la bandeja para el lote */
  crearElemento(e: { client_id: string; title: string; output_preview: string; metadata: Record<string, unknown>; payload: Record<string, unknown> }): Promise<{ id: string }>
  /** variables de entorno (solo se mira si existen) */
  env: Record<string, string | undefined>
  ahora(): Date
}

// ───────────────────────────────────────────────────────── el lote
const esTexto = (x: unknown): x is string => typeof x === 'string'
const esObjeto = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)
const httpsValida = (u: string) => {
  try { return new URL(u).protocol === 'https:' } catch { return false }
}

export type LoteValidado = { ok: true; lote: LoteSocial } | { ok: false; errores: string[] }
/** valida el cuerpo que manda el publicador: cliente, tarea y de 1 a 10 piezas con canal; lo demás se mira al armar la solicitud */
export function validarLote(cuerpo: unknown): LoteValidado {
  const e: string[] = []
  if (!esObjeto(cuerpo)) return { ok: false, errores: ['el cuerpo debe ser un objeto'] }
  const client_id = esTexto(cuerpo.client_id) ? cuerpo.client_id.trim() : ''
  const task_id = esTexto(cuerpo.task_id) ? cuerpo.task_id.trim() : ''
  if (!client_id) e.push('client_id requerido')
  if (!task_id) e.push('task_id requerido')
  const piezasIn = cuerpo.piezas
  if (!Array.isArray(piezasIn) || piezasIn.length === 0) e.push('piezas requeridas: una lista de 1 a ' + MAX_PIEZAS_POR_LOTE + ' piezas con `canal`')
  else if (piezasIn.length > MAX_PIEZAS_POR_LOTE) e.push('máximo ' + MAX_PIEZAS_POR_LOTE + ' piezas por lote')
  const piezas: PiezaSocial[] = []
  if (Array.isArray(piezasIn)) {
    piezasIn.slice(0, MAX_PIEZAS_POR_LOTE).forEach((p, i) => {
      if (!esObjeto(p) || !esTexto(p.canal) || !p.canal.trim()) { e.push(`piezas[${i}]: falta el canal`); return }
      for (const k of ['image_url', 'caption', 'message', 'link_url'] as const) if (p[k] !== undefined && !esTexto(p[k])) e.push(`piezas[${i}].${k} debe ser texto`)
      piezas.push({ canal: p.canal.trim().toLowerCase(), ...(esTexto(p.image_url) ? { image_url: p.image_url.trim() } : {}), ...(esTexto(p.caption) ? { caption: p.caption } : {}), ...(esTexto(p.message) ? { message: p.message } : {}), ...(esTexto(p.link_url) ? { link_url: p.link_url.trim() } : {}) })
    })
  }
  let programar_para: string | undefined
  if (cuerpo.programar_para !== undefined && cuerpo.programar_para !== null) {
    if (!esTexto(cuerpo.programar_para) || Number.isNaN(Date.parse(cuerpo.programar_para))) e.push('programar_para debe ser una fecha legible')
    else programar_para = new Date(Date.parse(cuerpo.programar_para)).toISOString()
  }
  return e.length ? { ok: false, errores: e } : { ok: true, lote: { task_id, client_id, piezas, ...(programar_para ? { programar_para } : {}) } }
}

// ───────────────────────────────────────────────────────── la solicitud que se mandaría
export interface SolicitudMeta { paso: string; metodo: 'POST'; ruta: string; cuerpo: Record<string, unknown> }
export interface PiezaEnsayada {
  canal: string
  publicador: boolean
  armada: boolean
  errores: string[]
  solicitudes: SolicitudMeta[]
}

/** arma, sin llaves ni ids reales, lo que cada publicador de Meta mandaría. Una pieza con errores no lleva solicitudes. */
export function armarSolicitud(p: PiezaSocial): PiezaEnsayada {
  const base = { canal: p.canal, publicador: (REDES_CON_PUBLICADOR as readonly string[]).includes(p.canal), armada: false, errores: [] as string[], solicitudes: [] as SolicitudMeta[] }
  if (!base.publicador) return { ...base, errores: [`no hay publicador para «${p.canal}» (solo instagram y facebook)`] }
  const errores: string[] = []
  if (p.image_url !== undefined && !httpsValida(p.image_url)) errores.push('image_url debe ser una dirección https')
  if (p.link_url !== undefined && p.link_url !== '' && !httpsValida(p.link_url)) errores.push('link_url debe ser una dirección https')
  if (p.canal === 'instagram') {
    if (!p.image_url) errores.push('instagram necesita image_url')
    const caption = p.caption ?? ''
    if (caption.length > MAX_CAPTION_INSTAGRAM) errores.push(`el caption pasa de ${MAX_CAPTION_INSTAGRAM} caracteres (${caption.length})`)
    if (errores.length) return { ...base, errores }
    return {
      ...base, armada: true, errores: [],
      solicitudes: [
        { paso: 'contenedor', metodo: 'POST', ruta: '/{META_IG_BUSINESS_ACCOUNT_ID}/media', cuerpo: { image_url: p.image_url, caption } },
        { paso: 'publicar', metodo: 'POST', ruta: '/{META_IG_BUSINESS_ACCOUNT_ID}/media_publish', cuerpo: { creation_id: '<id del contenedor>' } },
      ],
    }
  }
  const mensaje = (p.message ?? p.caption ?? '').trim()
  if (!mensaje && !p.image_url) errores.push('facebook necesita message o image_url')
  if (errores.length) return { ...base, errores }
  const conImagen = !!p.image_url
  return {
    ...base, armada: true, errores: [],
    solicitudes: [{
      paso: 'publicar', metodo: 'POST', ruta: conImagen ? '/{META_FB_PAGE_ID}/photos' : '/{META_FB_PAGE_ID}/feed',
      cuerpo: conImagen ? { url: p.image_url, ...(mensaje ? { caption: mensaje } : {}) } : { message: mensaje, ...(p.link_url ? { link: p.link_url } : {}) },
    }],
  }
}

/** ¿hay configuración de Meta para esa red? Solo se mira si existen las variables; nunca se devuelve su valor. */
export function configuracionDeMeta(env: Record<string, string | undefined>): Record<RedConPublicador, { configurada: boolean; faltan: string[] }> {
  const hay = (k: string) => typeof env[k] === 'string' && env[k]!.trim() !== ''
  const ig = [!hay('META_IG_BUSINESS_ACCOUNT_ID') && 'META_IG_BUSINESS_ACCOUNT_ID', !(hay('META_IG_ACCESS_TOKEN') || hay('META_ACCESS_TOKEN')) && '(META_IG_ACCESS_TOKEN | META_ACCESS_TOKEN)'].filter(Boolean) as string[]
  const fb = [!hay('META_FB_PAGE_ID') && 'META_FB_PAGE_ID', !(hay('META_FB_PAGE_ACCESS_TOKEN') || hay('META_ACCESS_TOKEN')) && '(META_FB_PAGE_ACCESS_TOKEN | META_ACCESS_TOKEN)'].filter(Boolean) as string[]
  return { instagram: { configurada: ig.length === 0, faltan: ig }, facebook: { configurada: fb.length === 0, faltan: fb } }
}

// ───────────────────────────────────────────────────────── encolar
export type RespuestaDePublicacion<T> = ({ ok: true } & T) | { ok: false; status: number; error: string; detalle?: string; errores?: string[] }

export async function encolarLote(P: PuertosDePublicacion, cuerpo: unknown): Promise<RespuestaDePublicacion<{ staged: true; hitl_id: string; ya_estaba: boolean; piezas: number }>> {
  const v = validarLote(cuerpo)
  if (!v.ok) return { ok: false, status: 400, error: 'lote_invalido', errores: v.errores }
  const { lote } = v
  const previo = await P.buscarLote(lote.task_id, lote.client_id)
  if (previo) return { ok: true, staged: true, hitl_id: previo.id, ya_estaba: true, piezas: lote.piezas.length }
  const redes = [...new Set(lote.piezas.map((p) => p.canal))]
  const nuevo = await P.crearElemento({
    client_id: lote.client_id,
    title: `Lote de publicación (${lote.piezas.length} pieza${lote.piezas.length === 1 ? '' : 's'}: ${redes.join(', ')})`,
    output_preview: `Lote ${lote.task_id}: ${lote.piezas.length} pieza(s) para ${redes.join(', ')}. Al aprobarlo se arma la publicación en ensayo; no se publica nada.`,
    metadata: { task_id: lote.task_id, lote },
    payload: { lote },
  })
  return { ok: true, staged: true, hitl_id: nuevo.id, ya_estaba: false, piezas: lote.piezas.length }
}

// ───────────────────────────────────────────────────────── publicar lo aprobado (ensayo)
export interface ResultadoDeEnsayo {
  modo: 'ensayo'
  real: false
  hora: string
  task_id: string
  client_id: string
  /** todas las piezas quedaron armadas y la red tiene configuración */
  publicable: boolean
  piezas: Array<PiezaEnsayada & { configuracion: { configurada: boolean; faltan: string[] } | null }>
  advertencias: string[]
}

export async function publicarAprobado(P: PuertosDePublicacion, n: { hitl_id: string; real?: unknown }): Promise<RespuestaDePublicacion<{ ensayo: ResultadoDeEnsayo; ya_estaba: boolean }>> {
  // publicar de verdad no está construido: se rechaza ANTES de mirar nada
  if (n.real !== undefined && n.real !== false) return { ok: false, status: 409, error: 'real_no_habilitado', detalle: 'publicar de verdad no está construido; esta ruta solo arma el ensayo' }
  const el = await P.leerElemento(n.hitl_id)
  if (!el) return { ok: false, status: 404, error: 'no_existe' }
  if (el.type !== TIPO_LOTE_SOCIAL) return { ok: false, status: 409, error: 'tipo_no_publicable', detalle: `el elemento es de tipo «${el.type ?? 'sin tipo'}»` }
  if (el.status !== 'approved') return { ok: false, status: 409, error: 'no_aprobado', detalle: `estado actual: ${el.status}; solo se arma lo aprobado en la bandeja` }
  const meta = el.metadata ?? {}
  const previo = meta.publicacion_ensayo
  if (esObjeto(previo)) return { ok: true, ensayo: previo as unknown as ResultadoDeEnsayo, ya_estaba: true }
  const v = validarLote(esObjeto(meta.lote) ? meta.lote : null)
  if (!v.ok) return { ok: false, status: 409, error: 'lote_ausente', detalle: 'el elemento no trae un lote válido', errores: v.errores }
  if (el.client_id && v.lote.client_id !== el.client_id) return { ok: false, status: 409, error: 'cliente_distinto', detalle: 'el lote es de otro cliente que el elemento de la bandeja' }
  const cfg = configuracionDeMeta(P.env)
  const piezas = v.lote.piezas.map((p) => {
    const a = armarSolicitud(p)
    return { ...a, configuracion: a.publicador ? cfg[p.canal as RedConPublicador] : null }
  })
  const advertencias = ['sin_cuenta_por_cliente: las rutas de Meta usan una sola cuenta del entorno, no la del cliente']
  const sinConfig = [...new Set(piezas.filter((x) => x.configuracion && !x.configuracion.configurada).map((x) => x.canal))]
  if (sinConfig.length) advertencias.push(`falta configuración de Meta para: ${sinConfig.join(', ')}`)
  const ensayo: ResultadoDeEnsayo = {
    modo: 'ensayo', real: false, hora: P.ahora().toISOString(), task_id: v.lote.task_id, client_id: v.lote.client_id,
    publicable: piezas.length > 0 && piezas.every((x) => x.armada && x.configuracion?.configurada === true),
    piezas, advertencias,
  }
  await P.guardarEnsayo(el.id, ensayo)
  return { ok: true, ensayo, ya_estaba: false }
}
