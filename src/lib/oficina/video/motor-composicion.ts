/**
 * EL VIDEO COMPUESTO · la máquina de fases · Sprint 3 · T5 tramo 3 (CC4 · US$ 0 · el servicio de render es nuestro).
 *
 * Después de unir los clips (camino B, solo el video principal), si la plantilla lo pide (`limites.video.componer: true`), el video unido
 * pasa por el servicio de render. Cada fase es un TRABAJO en fila que se pide una vez y se consulta en las vueltas del vigía; lo hecho se
 * guarda en el envío (`composicion`), así que una vuelta nunca repite lo que otra ya pidió:
 *  · `analizando` (solo si la mesa pidió subtítulos) → la voz del video unido se transcribe; si falla o vence, sin subtítulos (y se avisa);
 *  · `rindiendo` → el documento `htmlDeVideo` (textos de cada plano + cierre de marca + subtítulos) se rinde sobre el video unido;
 *    máximo `PEDIDOS_DE_RENDER_MAX` pedidos; el plazo cuenta desde la hora GUARDADA del último pedido;
 *  · listo → se baja el mp4, se guarda en el almacén de la oficina y ESE es el video del encargo.
 * Nada se pierde: cualquier fallo entrega el video UNIDO con el aviso de por qué (y una alarma, una sola vez: la vuelta que cierra).
 * No suma nada al libro (el costo del video sigue siendo el de los clips).
 */
import type { Puertos } from '../puertos'
import type { DisenoDeAnuncio } from '../../../../packages/carousel-engine/src/anuncio'
import type { GrupoDeSubtitulo } from '../../../../packages/carousel-engine/src/video-html'
import { armarVideoCompuesto, type PlanoParaComponer } from './composicion-del-video'
import { agruparPalabras, leerPalabras, type EnergiaDeSubtitulos } from './subtitulos'

export const MINUTOS_PARA_ANALIZAR = 10
export const MINUTOS_PARA_RENDIR = 20
export const PEDIDOS_DE_RENDER_MAX = 2
/** el nombre con que el servicio baja el video unido a su carpeta (lo cita el documento) */
export const NOMBRE_DEL_UNIDO = 'video-unido.mp4'

/** lo que el paso `video` entrega cuando salió bien (la forma de `ResultadoDelBrazo` ok) */
export interface VideoUnido {
  ok: true; status: 'completed'; video_url: string; url_proveedor: string | null; costo_usd: number; expires_at: string | null
  copia: 'bucket' | 'solo_proveedor'; aviso: string | null; planos?: Array<{ n: number; request_id: string; costo_usd: number; video_url: string }>
}

/** lo que el artefacto `video` cuenta de la composición (lo lee la tarjeta y la auditoría) */
export type InfoDelCompuesto =
  | { compuesto: true; de: string; textos: number; con_cierre: boolean; subtitulos: number | null; segundos_de_render: number | null; pedidos_de_render: number; avisos: string[] }
  | { compuesto: false; motivo: string; pedidos_de_render: number; avisos: string[] }

/** lo que se guarda en el envío entre vueltas */
export interface ComposicionGuardada {
  fase: 'analizando' | 'rindiendo'
  /** cuándo empezó la composición */
  iniciado_en: string
  /** desde cuándo corre el plazo de la fase (el último pedido) */
  desde: string
  unido: VideoUnido
  clips: Array<{ n: number; cortar_a_s: number }>
  analisis_id: string | null
  render_id: string | null
  /** los grupos de subtítulos ya leídos (null = no van) */
  subtitulos: GrupoDeSubtitulo[] | null
  pedidos_de_render: number
  textos: number
  con_cierre: boolean
  avisos: string[]
}

export interface MarcaDelVideo { logo: string | null; firma: string | null; diseno: DisenoDeAnuncio | null; avisos: string[] }
export interface ContextoDeComposicion {
  planos: PlanoParaComponer[]
  relacion: string
  resolucion: string
  /** la energía de los subtítulos si la mesa los pidió; null = no van */
  subtitulos: EnergiaDeSubtitulos | null
  idioma: string
  /** la marca se lee solo al pedir el render (baja el logo) */
  marca(): Promise<MarcaDelVideo>
}

export type PasoDeComposicion =
  | { sigue: ComposicionGuardada }
  | { fin: VideoUnido & { compuesto: InfoDelCompuesto }; alarma: string | null }

type PuertosDeComposicion = Pick<Puertos, 'componerVideo' | 'guardarArchivos'>

const juntar = (...xs: Array<string | null | undefined>) => xs.filter((x): x is string => !!x && !!x.trim()).join(' · ') || null
const sinRepetir = (xs: string[]) => [...new Set(xs)]

/** la composición arranca: la primera fase según lo que pidió la mesa */
export function empezarComposicion(unido: VideoUnido, clips: Array<{ n: number; cortar_a_s: number }>, pideSubtitulos: boolean, ahora: Date): ComposicionGuardada {
  const iso = ahora.toISOString()
  return {
    fase: pideSubtitulos ? 'analizando' : 'rindiendo', iniciado_en: iso, desde: iso, unido,
    clips: clips.map((c) => ({ n: c.n, cortar_a_s: c.cortar_a_s })),
    analisis_id: null, render_id: null, subtitulos: null, pedidos_de_render: 0, textos: 0, con_cierre: false, avisos: [],
  }
}

/** el video unido sale tal cual, con el motivo; `alarma` = el texto para #alertas (null = solo aviso en la pieza) */
function sinComponer(c: ComposicionGuardada, motivo: string, alarma: boolean): PasoDeComposicion {
  const texto = `el video sale sin textos ni cierre de marca: ${motivo}`
  return {
    fin: { ...c.unido, aviso: juntar(c.unido.aviso, ...c.avisos, texto), compuesto: { compuesto: false, motivo, pedidos_de_render: c.pedidos_de_render, avisos: c.avisos } },
    alarma: alarma ? texto : null,
  }
}

/** UNA vuelta de la composición: pide lo que falta, lee lo pedido, y sigue o termina. Nunca lanza */
export async function pasoDeComposicion(P: PuertosDeComposicion, enc: { id: string; client_id: string }, c: ComposicionGuardada, ctx: ContextoDeComposicion, ahora: Date): Promise<PasoDeComposicion> {
  try {
    return await paso(P, enc, c, ctx, ahora)
  } catch (e) {
    return sinComponer(c, `error inesperado al componer (${e instanceof Error ? e.message : String(e)})`.slice(0, 300), true)
  }
}

async function paso(P: PuertosDeComposicion, enc: { id: string; client_id: string }, c: ComposicionGuardada, ctx: ContextoDeComposicion, ahora: Date): Promise<PasoDeComposicion> {
  const S = P.componerVideo
  if (!S) return sinComponer(c, 'el servicio de render no está configurado', false)
  const iso = ahora.toISOString()
  const vencida = (min: number) => new Date(c.desde).getTime() <= ahora.getTime() - min * 60_000

  if (c.fase === 'analizando') {
    // sin subtítulos: se sigue a rendir en la MISMA vuelta, con el aviso (nunca se inventan)
    const sinSubtitulos = (motivo: string) => paso(P, enc, { ...c, fase: 'rindiendo', desde: iso, subtitulos: null, avisos: [...c.avisos, `el video sale sin subtítulos: ${motivo}`] }, ctx, ahora)
    if (!c.analisis_id) {
      const a = await S.analizar({ voz: { nombre: NOMBRE_DEL_UNIDO, url: c.unido.video_url }, musica: null, idioma: ctx.idioma })
      if (a.ok) return { sigue: { ...c, analisis_id: a.id, desde: iso } }
      if (a.reintentar && !vencida(MINUTOS_PARA_ANALIZAR)) return { sigue: c }
      return sinSubtitulos(`no se pudo pedir la transcripción (${a.error})`)
    }
    const a = await S.analisis(c.analisis_id)
    if (!a.ok) return a.reintentar && !vencida(MINUTOS_PARA_ANALIZAR) ? { sigue: c } : sinSubtitulos(`no se pudo leer la transcripción (${a.error})`)
    if (a.estado === 'en_fila' || a.estado === 'rindiendo') return vencida(MINUTOS_PARA_ANALIZAR) ? sinSubtitulos(`la transcripción no terminó en ${MINUTOS_PARA_ANALIZAR} min`) : { sigue: c }
    if (a.estado === 'fallido') return sinSubtitulos(`la transcripción falló (${a.error ?? 'sin detalle'})`)
    const segundos = c.clips.reduce((s, x) => s + x.cortar_a_s, 0)
    const l = leerPalabras(a.resultado?.palabras ?? null, { segundos })
    if (!l.ok) return sinSubtitulos(l.motivo)
    const grupos = agruparPalabras(l.palabras, ctx.subtitulos ?? 'conversacion')
    if (!grupos.length) return sinSubtitulos('la transcripción no trajo palabras')
    const descarte = l.descartadas ? [`la transcripción traía ${l.descartadas} palabra${l.descartadas === 1 ? '' : 's'} sin tiempo válido: no se muestran`] : []
    return paso(P, enc, { ...c, fase: 'rindiendo', desde: iso, subtitulos: grupos, avisos: [...c.avisos, ...descarte] }, ctx, ahora)
  }

  // ── rindiendo
  if (!c.render_id) {
    if (c.pedidos_de_render >= PEDIDOS_DE_RENDER_MAX) return sinComponer(c, `el render falló ${c.pedidos_de_render} veces`, true)
    const m = await ctx.marca()
    const arm = armarVideoCompuesto({ planos: ctx.planos, clips: c.clips, relacion: ctx.relacion, resolucion: ctx.resolucion, nombre_del_video: NOMBRE_DEL_UNIDO, logo: m.logo, firma: m.firma, diseno: m.diseno, subtitulos: c.subtitulos })
    if (!arm.ok) return sinComponer({ ...c, avisos: sinRepetir([...c.avisos, ...m.avisos]) }, arm.motivo, false)
    const r = await S.rendir({ pedido: arm.pedido, archivos: [{ nombre: NOMBRE_DEL_UNIDO, url: c.unido.video_url }] })
    const pedidos = c.pedidos_de_render + 1
    const avisos = sinRepetir([...c.avisos, ...m.avisos, ...arm.avisos, ...(r.ok && r.fonts_faltantes.length ? [`tipografías del manual que no se pudieron cargar (se dibujó con la de reserva): ${r.fonts_faltantes.join(', ')}`] : [])])
    const conPedido: ComposicionGuardada = { ...c, pedidos_de_render: pedidos, desde: iso, textos: arm.textos, con_cierre: arm.con_cierre, avisos }
    if (r.ok) return { sigue: { ...conPedido, render_id: r.id } }
    // el pedido no entró: cuenta como pedido; si quedan y es pasajero, se pide otra vez en la vuelta siguiente
    if (r.reintentar && pedidos < PEDIDOS_DE_RENDER_MAX) return { sigue: { ...conPedido, avisos: [...avisos, `el servicio de render no aceptó el pedido ${pedidos} (${r.error}): se pide otra vez`] } }
    return sinComponer(conPedido, `el servicio de render no aceptó el video (${r.error})`, true)
  }
  // el render pedido falló o se perdió: otro pedido si quedan (en esta misma vuelta), si no, el unido
  const otraVez = (motivo: string) => (c.pedidos_de_render < PEDIDOS_DE_RENDER_MAX
    ? paso(P, enc, { ...c, render_id: null, avisos: [...c.avisos, `el render ${c.pedidos_de_render} falló (${motivo}): se pide otra vez`] }, ctx, ahora)
    : Promise.resolve(sinComponer(c, `el render falló (${motivo})`, true)))
  const st = await S.render(c.render_id)
  if (!st.ok) {
    if (st.reintentar && !vencida(MINUTOS_PARA_RENDIR)) return { sigue: c }
    return st.reintentar ? sinComponer(c, `el servicio de render no contestó en ${MINUTOS_PARA_RENDIR} min (${st.error})`, true) : otraVez(st.error)
  }
  if (st.estado === 'en_fila' || st.estado === 'rindiendo') return vencida(MINUTOS_PARA_RENDIR) ? sinComponer(c, `el render no terminó en ${MINUTOS_PARA_RENDIR} min`, true) : { sigue: c }
  if (st.estado === 'fallido') return otraVez(st.error ?? 'sin detalle')
  const b = await S.bajar(c.render_id)
  if (!b.ok) return b.reintentar && !vencida(MINUTOS_PARA_RENDIR) ? { sigue: c } : sinComponer(c, `no se pudo bajar el video compuesto (${b.error})`, true)
  const nombre = `video-compuesto-${ahora.getTime()}.mp4`
  const g = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}`, [{ nombre, bytes: b.mp4, tipo: 'video/mp4' }])
  if (!g.ok || !g.urls[nombre]) return sinComponer(c, `no se pudo guardar el video compuesto (${g.ok ? 'sin dirección' : g.error})`, true)
  return {
    fin: {
      ...c.unido, video_url: g.urls[nombre], aviso: juntar(c.unido.aviso, ...c.avisos),
      compuesto: { compuesto: true, de: c.unido.video_url, textos: c.textos, con_cierre: c.con_cierre, subtitulos: c.subtitulos?.length ?? null, segundos_de_render: st.segundos_de_render, pedidos_de_render: c.pedidos_de_render, avisos: c.avisos },
    },
    alarma: null,
  }
}
