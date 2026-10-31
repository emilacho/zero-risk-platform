/**
 * EL BRAZO DE VIDEO DESDE LA OFICINA · parte 2 (31-oct · orden «construir todo antes de probar»). Familia `video_mesa`: la MESA escribe el guion (dirección creativa + guionista + coach de video corto
 * + especialista de YouTube + texto + curaduría de fotos propias); lo que sigue aquí es cola mecánica:
 *   abrir_video → (mesa) → pedido_de_video → video (el brazo `POST /api/video/generate`; espera ASÍNCRONA: un turno `brazo` que el vigía sondea) → chequeos_video → (jefatura) → empaquetar_entrega_video → cierre
 * Reglas de oficio: en dry_run NO se llama al brazo (el puerto devuelve un pedido simulado); el gasto del video entra al libro de la oficina como concepto `video` con el `session_id` del libro central
 * (`vid-<request_id>`); un video que falla, se cancela o se corta por NSFW cierra el encargo FALLIDO visible (nunca se rellena); un video que no vuelve en el plazo también.
 * Todo el contacto con el mundo entra por los puertos (`P.video` es el brazo).
 */
import crypto from 'node:crypto'
import { datos, fichaNueva } from './ayudas'
import { fechaLimiteDelBrief, parsearBrief, planDeOrigen, type BriefLeido } from './brief'
import { chequeosDePost, type FuentesDelCliente } from './chequeos'
import type { ContextoDelRevisor } from './ciego'
import { aUtc, chequeosDeEntrega, cuandoSePublica, manifiesto, nombreDeArchivo, textoParaCopiar, type ArchivoDeEntrega } from './entrega'
import { registrarPaso, siguientePaso, type ResultadoDePaso } from './motor'
import { materialDe } from './material-orquestador'
import { avanzar, fallar, plantillaDe, type Respuesta } from './orquestador'
import { FUNCION_DEL_BRIEF, FUNCION_DEL_MANUAL, FUNCION_DEL_PLAN, FUNCION_DEL_PORTERO } from './pedidos'
import { FUNCION_DEL_TABLERO } from './pedidos-laminas'
import type { Cambios, Encargo, EstadoDelBrazo, FuentesCompletas, Puertos } from './puertos'
import type { Estado, Ficha, Paso, Plantilla } from './tipos'
import { RELACION_POR_FORMATO } from '../video/parametros'
import { sessionIdDeVideo } from '../video/libro'
import { guionLegible, type TraduccionDeGuion } from './video/guion'
import { armarPedidoDeLaOficina, esVideo, formatoDeEntrega, formatoDeVideo, type PedidoDeVideoDeLaOficina } from './video/pedido'

export type FamiliaDeVideo = 'video'
export const familiaDeVideo = (pl: Pick<Plantilla, 'familia'>): FamiliaDeVideo | null => (pl.familia === 'video_mesa' ? 'video' : null)

/** el mismo marcador de lo simulado que usa `adaptadores.ts` (`PREFIJO_DRY`): `descargar` lo reconoce y no sale a la red */
const PREFIJO_DRY = 'https://dry.invalid/'
/** cuánto espera la oficina a que el brazo entregue un video antes de darlo por perdido (el brazo tarda ≈ 5–8 min por video; el peor caso medido 31-oct fue ≈ 7 min) */
export const MINUTOS_PARA_ESPERAR_AL_BRAZO = 45

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')
const txt = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const arr = <T = string>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const turnoDe = (e: Estado) => e.pasos_ejecutados + 1

export interface BaseV { brief: BriefLeido; proporcion: string; F: FuentesCompletas; familia: 'video'; plataforma: string; elementos: never[]; formato_video: string }
const baseV = (e: Estado): BaseV => datos(e, 'encargo') as unknown as BaseV

/** lo que la mesa deja en el artefacto `guion` */
export type GuionDeLaMesa = TraduccionDeGuion & { texto: string }
/** lo que deja el paso `video` (y lo que lee todo lo de después) */
export interface VideoDelEncargo {
  request_id: string
  status: string
  simulado: boolean
  video_url: string | null
  url_proveedor: string | null
  copia: 'bucket' | 'solo_proveedor' | 'simulada' | null
  costo_usd: number
  costo_estimado_usd: number
  expires_at: string | null
  enviado_en: string
  terminado_en: string | null
  aviso?: string | null
  error?: string | null
}
interface EnvioGuardado { request_id: string; status: string; costo_estimado_usd: number; costo_lista_usd?: number; descuento_pct?: number; enviado_en: string; n: number }

type SalidaCodigoV = { res: ResultadoDePaso; gastos?: Cambios['gastos']; fallido?: string }

// ───────────────────────── funciones de código
export async function ejecutarCodigoV(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<SalidaCodigoV> {
  switch (paso.funcion) {
    case 'abrir_video': return abrir(P, enc, pl)
    case 'pedido_de_video': return pedido(enc, pl, enc.estado_del_motor)
    case 'chequeos_video': return chequeos(enc.estado_del_motor, pl)
    case 'empaquetar_entrega_video': return empaquetar(P, enc)
    default: return { res: { costo_usd: 0 }, fallido: `función de código «${paso.funcion}» sin implementar` }
  }
}

async function abrir(P: Puertos, enc: Encargo, pl: Plantilla): Promise<SalidaCodigoV> {
  const fu = await P.fuentes(enc.client_id)
  if ('error' in fu) return { res: { costo_usd: 0 }, fallido: `no se pudieron leer las fuentes del cliente: ${fu.error}` }
  const parte = await P.parte(enc.parte_id, enc.client_id)
  if (!parte) return { res: { costo_usd: 0 }, fallido: `la parte ${enc.parte_id} no existe para este cliente` }
  const brief = parsearBrief(parte.texto, enc.brief_id)
  if (!brief) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no está en la parte` }
  const planId = planDeOrigen(parte.texto)
  const plan = planId ? await P.plan(planId, enc.client_id) : null
  if (plan) fu.plan_texto = plan
  if (!esVideo(brief)) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no es de video (${brief.formato}): esta sala hace reels, shorts y videos cortos` }
  const formato_video = formatoDeVideo(brief)
  const proporcion = RELACION_POR_FORMATO[formato_video] ?? String(pl.limites.formato_por_omision ?? '9:16')
  const plataforma = `${brief.red.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() || 'red'}-${formato_video}`
  return { res: { costo_usd: 0, artefacto: { brief, proporcion, F: fu, familia: 'video', plataforma, elementos: [], formato_video } } }
}

/** el guion de la mesa → el pedido al brazo (sin red): la clave idempotente es `<encargo>:<brief>:v<versión del guion>` */
function pedido(enc: Encargo, pl: Plantilla, e: Estado): SalidaCodigoV {
  const b = baseV(e)
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  if (!g || !Array.isArray(g.planos) || !g.planos.length) return { res: { costo_usd: 0 }, fallido: 'no hay guion traducido que pedir (la mesa no dejó planos)' }
  const lim = (pl.limites.video ?? {}) as { resolucion?: string }
  const clave = `${enc.id}:${enc.brief_id}:v${e.artefactos['guion']?.version ?? 1}`
  const a = armarPedidoDeLaOficina({ guion: g, brief: b.brief, fotos: b.F.fotos, clave, ...(lim.resolucion ? { resolucion: lim.resolucion } : {}) })
  if (!a.ok) return { res: { costo_usd: 0 }, fallido: `el pedido al brazo de video no es válido: ${a.errores.join(' · ')}` }
  const fichas: Ficha[] = []
  if (a.pedido.fotos_no_halladas.length) fichas.push(fichaNueva(`video-fotos-no-halladas-${e.pasos_ejecutados}`, 'chequeo', 'video', 'sugerencia', `el guion nombra fotos que no están entre las propias del cliente y no viajan al modelo: ${a.pedido.fotos_no_halladas.join(', ')}`, 'fotos propias del cliente', 'mirar el video: esos planos salen sin referencia'))
  if (a.pedido.prompt_recortado) fichas.push(fichaNueva(`video-prompt-recortado-${e.pasos_ejecutados}`, 'chequeo', 'video', 'sugerencia', 'el guion era más largo de lo que el modelo admite y se recortó', 'límite del pedido al modelo', 'mirar que el video cubra todos los planos'))
  return { res: { costo_usd: 0, artefacto: { pedido: a.pedido, clave, fotos_no_halladas: a.pedido.fotos_no_halladas, avisos_del_guion: g.avisos ?? [] }, ...(fichas.length ? { fichas } : {}) } }
}

function chequeos(e: Estado, pl: Plantilla): SalidaCodigoV {
  const b = baseV(e)
  const cv = datos(e, 'copy_video')
  if (!cv) return { res: { costo_usd: 0, artefacto: { fichas: 0 } }, fallido: 'no hay pie ni etiquetas que chequear' }
  const fs = chequeosDePost({
    pieza: { pie_de_foto: txt(cv.pie_de_foto), hashtags: arr(cv.hashtags), llamado: typeof cv.llamado === 'string' ? cv.llamado : undefined },
    fuentes: b.F.fuentes as FuentesDelCliente,
    limites: { pie_de_foto_max: Number(pl.limites.pie_de_foto_max ?? 2200), hashtags_max: Number(pl.limites.hashtags_max ?? 30), limites_verificados: pl.limites.limites_verificados === true },
    prohibidas_del_brief: b.brief.prohibido,
    imagen: { generada: true, declarada_en_bandeja: true },
  })
  const prefijo = `chk${e.pasos_ejecutados}`
  const fichas: Ficha[] = fs.map((f, i) => ({ ...f, id: `${prefijo}-${i}` }))
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const pv = datos(e, 'pedido_video')
  const lim = (pl.limites.video ?? {}) as { tope_por_video_usd?: number }
  let k = 0
  const nueva = (gravedad: Ficha['gravedad'], que: string, contra: string, propuesta: string) => fichas.push(fichaNueva(`${prefijo}-video-${k++}`, 'chequeo', 'video', gravedad, que, contra, propuesta))
  if (!v || !v.video_url) nueva('bloquea', 'el brazo no entregó un video', 'respuesta del brazo de video', 'una persona decide: rehacer o cerrar')
  else {
    if (v.copia === 'solo_proveedor') nueva('sugerencia', `el video quedó solo en el proveedor (no se pudo copiar a nuestro bucket)${v.expires_at ? `; vence ${v.expires_at}` : ''}`, 'copia de la entrega', 'descargarlo al aprobar, antes de que venza')
    if (!v.simulado && v.costo_usd > 0 && v.costo_estimado_usd > 0 && v.costo_usd > v.costo_estimado_usd * 1.05) nueva('sugerencia', `el video cobró US$ ${v.costo_usd.toFixed(4)} y se habían reservado US$ ${v.costo_estimado_usd.toFixed(4)}`, 'reserva del paso', 'revisar el libro del brazo')
    if (typeof lim.tope_por_video_usd === 'number' && v.costo_usd > lim.tope_por_video_usd + 1e-9) nueva('bloquea', `el video cobró US$ ${v.costo_usd.toFixed(4)}, más que el tope por video (US$ ${lim.tope_por_video_usd})`, 'tope por video', 'una persona decide')
  }
  for (const a of arr(pv?.avisos_del_guion)) nueva('sugerencia', `el traductor del guion avisó: ${a}`, 'guion de la mesa', 'mirar el video con eso en mente')
  return { res: { costo_usd: 0, artefacto: { fichas: fichas.length }, fichas, reemplazar_fichas: { origen: 'chequeo', donde: ['texto', 'hashtags', 'video'] } } }
}

/** un mp4 mínimo (solo la caja `ftyp`): lo que se entrega en dry_run para que la hoja, el manifiesto y los chequeos de entrega se ejerzan sin red */
export function mp4Simulado(): Buffer {
  const cuerpo = Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'binary')
  const caja = Buffer.alloc(8)
  caja.writeUInt32BE(8 + cuerpo.length, 0)
  caja.write('ftyp', 4, 'ascii')
  return Buffer.concat([caja, cuerpo])
}

async function empaquetar(P: Puertos, enc: Encargo): Promise<SalidaCodigoV> {
  const e = enc.estado_del_motor
  const b = baseV(e)
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const cv = datos(e, 'copy_video')
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const pv = datos(e, 'pedido_video')
  if (!v || !v.video_url) return { res: { costo_usd: 0 }, fallido: 'no hay video que empaquetar' }
  if (!cv) return { res: { costo_usd: 0 }, fallido: 'no hay pie ni etiquetas que empaquetar' }
  const red = b.brief.red.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() || 'red'
  const formato = formatoDeEntrega(b.formato_video)
  const fila = await P.almacen.leerFormato(red, formato)
  const cuando = cuandoSePublica(enc.sala_ref, fechaLimiteDelBrief(b.brief.aprueba))
  const expires = cuando ? aUtc(cuando.fecha, cuando.hora, b.F.zona) : null
  const nombreBase = (ext: string) => nombreDeArchivo({ fecha: cuando?.de === 'fila' ? cuando.fecha : null, hora: cuando?.de === 'fila' ? cuando.hora : null, red, formato: b.formato_video, brief_id: b.brief.id, n: 1, de: 1, ext })
  const archivos: ArchivoDeEntrega[] = []
  const fichasExtra: Ficha[] = []
  const bytes = v.simulado || v.video_url.startsWith(PREFIJO_DRY) ? mp4Simulado() : await P.descargar(v.video_url)
  if (bytes) archivos.push({ nombre: nombreBase('mp4'), bytes })
  else fichasExtra.push(fichaNueva('entrega-video-no-descargado', 'chequeo', 'entrega', 'bloquea', 'no se pudo descargar el video del brazo para la entrega', 'copia de la entrega', 'una persona lo baja del enlace del proveedor antes de que venza'))
  const texto = textoParaCopiar({ pie_de_foto: txt(cv.pie_de_foto), hashtags: arr(cv.hashtags) })
  const base = nombreBase('txt').replace(/\.txt$/, '')
  const pedidoEnviado = (pv?.pedido as PedidoDeVideoDeLaOficina | undefined)
  const hoja = [
    `# Publicar a mano · ${b.brief.id}`,
    `Red: ${b.brief.red} · formato: ${b.brief.formato} (${b.formato_video}, ${b.proporcion}) · ${g?.segundos ?? pedidoEnviado?.segundos ?? '?'} s`,
    `Hora de publicación: ${cuando ? (cuando.de === 'fila' ? `${cuando.fecha}${cuando.hora ? ' ' + cuando.hora : ''}${b.F.zona ? ' (' + b.F.zona + ')' : ' (zona del cliente sin registrar)'}` : `(aprobar antes de ${cuando.fecha})`) : 'sin fecha: se decide al aprobar'}`,
    '⚠️ El video es GENERADO por un modelo (Seedance), no una grabación real. Sin voces; música o ambiente generados.',
    v.copia === 'solo_proveedor' ? `⚠️ El video quedó solo en el proveedor${v.expires_at ? ` y vence ${v.expires_at}` : ''}: descargarlo al aprobar.` : '',
    v.simulado ? '(ensayo: el video es simulado)' : '',
    '',
    '## Pasos',
    ...(fila?.pasos_publicacion?.map((x, i) => `${i + 1}. ${x}`) ?? ['(sin especificación de formato)']),
    '',
  ].filter((l) => l !== '').join('\n')
  const guionMd = [
    `# Guion · ${b.brief.id}`,
    g ? guionLegible(g) : '(sin guion traducido)',
    '',
    '## Pedido enviado al modelo',
    pedidoEnviado ? `Formato ${pedidoEnviado.formato} · ${pedidoEnviado.segundos} s · ${pedidoEnviado.resolucion} · ${pedidoEnviado.relacion} · fotos de referencia: ${pedidoEnviado.fotos.length}\n\n${pedidoEnviado.prompt}` : '(sin pedido)',
    '',
    g?.avisos?.length ? `## Avisos del traductor\n${g.avisos.map((a) => `- ${a}`).join('\n')}` : '',
  ].filter((l) => l !== '').join('\n')
  const man = manifiesto(archivos, { encargo_id: enc.id, brief_id: b.brief.id, aprobada_version: e.artefactos['copy_video']?.version ?? 1, expires_at: expires, video_generado: true, request_id: v.request_id, video_url_proveedor: v.url_proveedor, video_expires_at: v.expires_at, simulado: v.simulado })
  const fichas = [...chequeosDeEntrega(archivos, fila ?? null, { pie_de_foto: txt(cv.pie_de_foto), hashtags: arr(cv.hashtags) }, man), ...fichasExtra]
  const todos = [
    ...archivos.map((a) => ({ ...a, tipo: 'video/mp4' })),
    { nombre: `${base}_texto.txt`, bytes: Buffer.from(texto, 'utf8'), tipo: 'text/plain' },
    { nombre: `${base}_publicar.md`, bytes: Buffer.from(hoja, 'utf8'), tipo: 'text/markdown' },
    { nombre: `${base}_guion.md`, bytes: Buffer.from(guionMd, 'utf8'), tipo: 'text/markdown' },
    { nombre: 'manifest.json', bytes: Buffer.from(JSON.stringify(man, null, 2), 'utf8'), tipo: 'application/json' },
  ]
  let urls: Record<string, string> = {}
  if (!enc.dry_run) {
    const gu = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}`, todos)
    if (!gu.ok) return { res: { costo_usd: 0 }, fallido: `no se pudieron guardar los archivos de la entrega: ${gu.error}` }
    urls = gu.urls
  }
  const mp4 = archivos[0]?.nombre
  const prefijo = `ent${e.pasos_ejecutados}`
  return {
    res: {
      costo_usd: 0,
      artefacto: { archivos: man.archivos, nombres: todos.map((x) => x.nombre), urls, texto_para_copiar: texto, expires_at: expires, video_url: (mp4 && urls[mp4]) || v.video_url, simulado: enc.dry_run },
      fichas: fichas.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })),
      reemplazar_fichas: { origen: 'chequeo', donde: 'entrega' },
    },
  }
}

// ───────────────────────── el paso `video`: enviar al brazo y esperar
const conEnvio = (e: Estado, envio: EnvioGuardado): Estado => {
  const antes = e.artefactos['pedido_video']
  if (!antes) return e
  return { ...e, artefactos: { ...e.artefactos, pedido_video: { ...antes, version: antes.version + 1, datos: { ...antes.datos, envio } } } }
}
export const envioDe = (e: Estado): EnvioGuardado | null => ((datos(e, 'pedido_video')?.envio as EnvioGuardado | undefined) ?? null)

/**
 * el paso `video` del motor: manda el pedido al brazo. En dry_run el puerto no sale a la red y el paso se registra en el acto con un video simulado; en real se abre un turno `brazo`
 * (sin agente) y el encargo espera: el vigía sondea el estado y `recibirVideo` registra el paso cuando el brazo termina. El tope del paso nunca pasa de lo que le queda al encargo.
 */
export async function enviarVideo(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<{ fallido?: string; esperar?: Record<string, unknown>; res?: ResultadoDePaso }> {
  const e = enc.estado_del_motor
  const pv = datos(e, 'pedido_video')
  const ped = pv?.pedido as PedidoDeVideoDeLaOficina | undefined
  if (!ped) return { fallido: 'no hay pedido de video que enviar' }
  if (!P.video) return { fallido: 'el puerto del brazo de video no está configurado' }
  const lim = (pl.limites.video ?? {}) as { tope_por_video_usd?: number }
  const tope = Math.max(0, Math.min(paso.tope_usd, lim.tope_por_video_usd ?? paso.tope_usd, +(pl.limites.tope_encargo_usd - e.gasto_usd).toFixed(4)))
  const n = turnoDe(e)
  const envio = await P.video.enviar({ pedido: ped, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run, tope_usd: tope, workflow_id: `oficina:${enc.familia}`, workflow_execution_id: `${enc.id}:${n}` })
  if (!envio.ok) return { fallido: `el brazo de video no aceptó el pedido: ${envio.error}` }
  const ahora = P.ahora().toISOString()
  if (envio.simulado) {
    const v: VideoDelEncargo = { request_id: envio.request_id, status: 'simulado', simulado: true, video_url: `${PREFIJO_DRY}video-${encodeURIComponent(ped.clave)}.mp4`, url_proveedor: null, copia: 'simulada', costo_usd: 0, costo_estimado_usd: envio.costo_estimado_usd, expires_at: null, enviado_en: ahora, terminado_en: ahora }
    return { res: { costo_usd: 0, artefacto: v as unknown as Record<string, unknown> } }
  }
  const e2 = conEnvio(e, { request_id: envio.request_id, status: envio.status, costo_estimado_usd: envio.costo_estimado_usd, costo_lista_usd: envio.costo_lista_usd, descuento_pct: envio.descuento_pct, enviado_en: ahora, n })
  const dispatch_key = `${enc.id}:${n}`
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: e2, gasto_usd: e2.gasto_usd, estado: 'en_paso',
    turno: { n, paso: paso.clave, tipo: 'brazo', agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 },
    artefacto: { tipo: 'pedido_video', version: e2.artefactos['pedido_video'].version, contenido: e2.artefactos['pedido_video'].datos, sha256: sha(e2.artefactos['pedido_video'].datos), autor: 'sala' },
  })
  return { esperar: { accion: 'esperar_brazo', turno: { n, paso: paso.clave, tipo: 'brazo', dispatch_key, request_id: envio.request_id }, video: { costo_estimado_usd: envio.costo_estimado_usd, costo_lista_usd: envio.costo_lista_usd ?? null, descuento_pct: envio.descuento_pct ?? 0, plazo_min: MINUTOS_PARA_ESPERAR_AL_BRAZO } } }
}

/** lo que el brazo entregó (o no): lo trae el vigía tras sondear, o una prueba */
export type ResultadoDelBrazo =
  | { ok: true; status: 'completed'; video_url: string; url_proveedor: string | null; costo_usd: number; expires_at: string | null; copia: 'bucket' | 'solo_proveedor'; aviso: string | null }
  | { ok: false; status: string; error: string }

/** el brazo terminó: se registra el paso `video` (artefacto + gasto en el libro de la oficina) y el encargo sigue; si falló, cierra FALLIDO visible. IDEMPOTENTE: una entrega repetida solo avanza */
export async function recibirVideo(P: Puertos, encargoId: string, n: number, res: ResultadoDelBrazo): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const pl = await plantillaDe(P, enc)
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.n !== n || abierto.tipo !== 'brazo') {
    if (n < turnoDe(enc.estado_del_motor)) return avanzar(P, enc.id)
    return r(409, { error: 'turno_no_esperado', esperado: abierto?.n ?? null, recibido: n })
  }
  const e = enc.estado_del_motor
  const sig = siguientePaso(e, pl)
  if (sig.accion !== 'ejecutar' || sig.paso.funcion !== 'video') return r(409, { error: 'sin_paso_pendiente' })
  const envio = envioDe(e)
  const request_id = envio?.request_id ?? ''
  const turnoBase = { n, paso: sig.paso.clave, tipo: 'brazo', agente: null, dispatch_key: abierto.dispatch_key, workflow_execution_id: abierto.workflow_execution_id ?? null }
  const ahora = P.ahora().toISOString()
  if (!res.ok) {
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e, gasto_usd: e.gasto_usd, turno: { ...turnoBase, estado: 'fallo', cost_usd: 0, error: `${res.status}: ${res.error}`.slice(0, 300) } })
    return fallar(P, enc, `el brazo de video no entregó (${res.status}): ${res.error}`)
  }
  const costo = Math.max(0, Number(res.costo_usd) || 0)
  const v: VideoDelEncargo = { request_id, status: 'completed', simulado: false, video_url: res.video_url, url_proveedor: res.url_proveedor, copia: res.copia, costo_usd: costo, costo_estimado_usd: envio?.costo_estimado_usd ?? 0, expires_at: res.expires_at, enviado_en: envio?.enviado_en ?? ahora, terminado_en: ahora, aviso: res.aviso }
  const nuevo = registrarPaso(e, pl, sig.indice, { costo_usd: costo, artefacto: v as unknown as Record<string, unknown>, ...(sig.vuelta ? { vuelta: sig.vuelta } : {}) })
  const gastos: NonNullable<Cambios['gastos']> = costo > 0 ? [{ concepto: 'video', ref_tabla: 'agent_invocations', ref_id: request_id ? sessionIdDeVideo(request_id) : null, cost_usd: costo, base: 'usage' }] : []
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', fichas: nuevo.fichas,
    turno: { ...turnoBase, estado: 'hecho', cost_usd: costo },
    artefacto: { tipo: sig.paso.salida_artefacto, version: nuevo.artefactos[sig.paso.salida_artefacto].version, contenido: v as unknown as Record<string, unknown>, sha256: sha(v), autor: 'brazo-video' },
    ...(gastos.length ? { gastos } : {}),
  })
  return avanzar(P, enc.id)
}

/** la lectura del brazo → lo que `recibirVideo` entiende; null = todavía no terminó */
export function leerEstadoDelBrazo(st: EstadoDelBrazo, inicio: string, ahora: Date, plazoMin = MINUTOS_PARA_ESPERAR_AL_BRAZO): ResultadoDelBrazo | null {
  const vencido = new Date(inicio).getTime() < ahora.getTime() - plazoMin * 60_000
  if (!st.ok) return vencido ? { ok: false, status: 'sin_estado', error: `el brazo no contestó el estado en ${plazoMin} min (${st.error})` } : null
  if (st.simulado) return { ok: true, status: 'completed', video_url: `${PREFIJO_DRY}video-simulado.mp4`, url_proveedor: null, costo_usd: 0, expires_at: null, copia: 'bucket', aviso: 'simulado' }
  if (!st.terminal) return vencido ? { ok: false, status: 'sin_vuelta', error: `el brazo no terminó en ${plazoMin} min (último estado: ${st.status})` } : null
  if ('video_url' in st) return { ok: true, status: 'completed', video_url: st.video_url, url_proveedor: st.url_proveedor, costo_usd: st.costo_usd, expires_at: st.expires_at, copia: st.copia, aviso: st.aviso }
  return { ok: false, status: st.status, error: ('error' in st ? st.error : null) ?? 'el proveedor no entregó el video' }
}

/** EL VIGÍA sondea los turnos `brazo` abiertos (`oficina_turnos` corriendo): los que terminaron se registran y el encargo sigue; los que pasaron el plazo cierran fallidos */
export async function sondearVideos(P: Puertos, turnos: Array<{ encargo_id: string; n: number; paso: string; inicio: string }>, ahora: Date): Promise<{ reanudar: string[]; fallidos: string[]; cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> }> {
  const reanudar: string[] = [], fallidos: string[] = []
  const cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> = []
  for (const t of turnos) {
    const enc = await P.almacen.leerEncargo(t.encargo_id)
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'].includes(enc.estado)) continue
    const envio = envioDe(enc.estado_del_motor)
    let res: ResultadoDelBrazo | null
    if (!envio?.request_id) res = { ok: false, status: 'sin_request_id', error: 'el turno del brazo no tiene pedido registrado' }
    else if (!P.video) res = { ok: false, status: 'sin_puerto', error: 'el puerto del brazo de video no está configurado' }
    else res = leerEstadoDelBrazo(await P.video.estado(envio.request_id), t.inicio, ahora)
    if (!res) continue
    const out = await recibirVideo(P, enc.id, t.n, res)
    if (res.ok) { reanudar.push(enc.id); continue }
    fallidos.push(enc.id)
    cierres.push({ encargo_id: enc.id, resultado_para_la_sala: txt(out.cuerpo.resultado_para_la_sala) || 'fallido', sala_ref: enc.sala_ref, client_id: enc.client_id, brief_id: enc.brief_id })
  }
  return { reanudar, fallidos, cierres }
}

// ───────────────────────── la jefatura y el cierre
/** lo que la jefatura revisa de un video: el guion legible, el pie y las etiquetas, el pedido que se mandó al modelo y el enlace del video; las fotos de referencia como imágenes; el cerebro que leyó la mesa como contexto */
export function contextoDeRevisorV(pl: Plantilla, e: Estado): { pieza: string; imagenes: string[]; contexto: ContextoDelRevisor[] } {
  void pl
  const b = baseV(e)
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const cv = datos(e, 'copy_video') ?? {}
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const pv = datos(e, 'pedido_video')
  const ped = pv?.pedido as PedidoDeVideoDeLaOficina | undefined
  const pieza = [
    '## Guion del video',
    g ? guionLegible(g) : '(sin guion traducido)',
    '',
    '## Pie de foto',
    txt(cv.pie_de_foto) || '(vacío)',
    '',
    `## Etiquetas\n${arr(cv.hashtags).join(' ') || '(ninguna)'}`,
    '',
    '## Pedido enviado al modelo de video',
    ped ? `${ped.formato} · ${ped.segundos} s · ${ped.resolucion} · ${ped.relacion} · ${ped.fotos.length} foto(s) propia(s) de referencia\n${ped.prompt}` : '(sin pedido)',
    '',
    '## El video',
    v?.video_url ? `${v.video_url}${v.simulado ? ' (simulado)' : ''}${v.copia === 'solo_proveedor' ? ' (solo en el proveedor)' : ''} · costo US$ ${v.costo_usd.toFixed(4)}` : '(el brazo no entregó video)',
  ].join('\n')
  const imagenes = ped?.fotos ?? []
  const m = materialDe(e)
  const hechos = m?.resultado?.hechos ?? []
  const tablero = txt(datos(e, 'mesa')?.tablero_para_la_jefatura)
  const contexto: ContextoDelRevisor[] = [
    { titulo: 'Manual de marca', funcion: FUNCION_DEL_MANUAL, texto: b.F.manual_texto },
    ...(b.F.plan_texto ? [{ titulo: 'Plan de trabajo', funcion: FUNCION_DEL_PLAN, texto: b.F.plan_texto }] : []),
    { titulo: 'Brief', funcion: FUNCION_DEL_BRIEF, texto: b.brief.texto },
    ...(hechos.length ? [{ titulo: 'Material del portero', funcion: FUNCION_DEL_PORTERO, texto: hechos.map((h) => `- ${h.texto}${h.fuente ? ` (fuente: ${h.fuente})` : ''}`).join('\n') }] : []),
    ...(tablero ? [{ titulo: 'Tablero de la mesa', funcion: FUNCION_DEL_TABLERO, texto: tablero }] : []),
  ]
  return { pieza, imagenes, contexto }
}

export function resumenDeCierreV(enc: Encargo, e: Estado, pl: Plantilla): { titulo: string; tituloBandeja: string; contenido: Record<string, unknown>; vista_previa: string; expires_at: string | null; generada: boolean; red: string; version: number } | null {
  if (!familiaDeVideo(pl)) return null
  const b = baseV(e)
  if (!b) return null
  const cv = datos(e, 'copy_video')
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  if (!cv || !v) return null
  const ent = datos(e, 'entrega')
  const version = e.artefactos['copy_video']?.version ?? 1
  return {
    titulo: `Video ${enc.brief_id} · ${b.brief.red}`,
    tituloBandeja: `Aprobación · Video ${enc.brief_id} · ${b.brief.red} · ${g?.segundos ?? '?'} s · versión ${version} · ${b.F.cliente_nombre}`,
    contenido: {
      pie_de_foto: cv.pie_de_foto, hashtags: cv.hashtags, llamado: cv.llamado ?? null,
      guion: g ? guionLegible(g) : null, planos: g?.planos ?? [], segundos: g?.segundos ?? null,
      video: { url: txt(ent?.video_url) || v.video_url, url_proveedor: v.url_proveedor, copia: v.copia, costo_usd: v.costo_usd, expires_at: v.expires_at, request_id: v.request_id, simulado: v.simulado },
      entrega: ent ? { urls: ent.urls, expires_at: ent.expires_at } : null,
    },
    vista_previa: txt(cv.pie_de_foto).slice(0, 280), expires_at: (ent?.expires_at as string | null | undefined) ?? null, generada: true, red: b.brief.red, version,
  }
}
