/**
 * LOS PASOS DE REDES DE UN CLIENTE (01-nov · antes vivían dentro de `alimentarCliente` y una sola llamada de 300 s no alcanzaba: Náufrago cortó con 504).
 * Cada paso es una llamada propia (ver `pasos-diarios.ts`): lee lo que necesita fresco de la base, no depende de que el anterior haya vivido en la misma llamada.
 *  · cuentas_y_comentarios · descubre cuentas de TikTok/X (regla única) y trae los comentarios de redes (propios → fichas; competencia → su tabla);
 *  · tendencias           · el embudo global → país → competencia → directa, con sus videos;
 *  · bodega               · la bodega viral del mundo (una vez por día en total) y la transcripción de sus videos;
 *  · transcripcion        · los videos del cliente que aún no tienen texto.
 * Interruptor `PORTERO_TENDENCIAS=on`. Nunca lanza: lo que falla se DICE en `errores`.
 */
import { paisIsoDe } from '../cerebro/zona'
import { ejecutarEnApify } from './tendencias'
import { bodegaDelMundo, tendenciasDelCliente } from './tendencias-del-cliente'
import { descubrirCuentas } from './cuentas-de-redes'
import { comentariosDeRedes, comentariosDeVideosDeLaCompetencia, ejecutarComentarios, guardarComentariosDeLaCompetencia, REDES_DE_IG_Y_FB, REDES_DEL_PASO_DE_SIEMPRE } from './comentarios-de-redes'
import { correrFuenteNueva, esFuenteNueva } from './fuentes-nuevas'
import { transcribirVideos } from './transcripcion-de-videos'
import type { RespuestaDeLlamada } from './juez'
import type { Paso } from './pasos-diarios'

type Fila = Record<string, unknown>
export type Db = { from(tabla: string): any }
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])

export interface EntradaDePasoDeRedes {
  db: Db
  clientId: string
  paso: Paso
  ahora: Date
  env?: Record<string, string | undefined>
  fetch?: (u: string, i?: RequestInit) => Promise<Response>
  llamarModelo?: (instruccion: string, mensaje: string) => Promise<RespuestaDeLlamada>
  /** para registrar el gasto de la transcripción */
  registro?: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string }
}
export interface ResultadoDePasoDeRedes { estado: 'apagado' | 'cliente_inexistente' | 'corrido'; resumen: Record<string, unknown>; errores: string[]; gasto_usd: number }

export const tendenciasEncendidas = (env: Record<string, string | undefined> = process.env): boolean => String(env.PORTERO_TENDENCIAS ?? '').trim().toLowerCase() === 'on'

export async function correrPasoDeRedes(e: EntradaDePasoDeRedes): Promise<ResultadoDePasoDeRedes> {
  const entorno = e.env ?? process.env
  const sinNada = (estado: ResultadoDePasoDeRedes['estado']): ResultadoDePasoDeRedes => ({ estado, resumen: {}, errores: [], gasto_usd: 0 })
  if (!tendenciasEncendidas(entorno)) return sinNada('apagado')
  const errores: string[] = []
  const common = { urlDeLaBase: entorno.NEXT_PUBLIC_SUPABASE_URL ?? entorno.SUPABASE_URL ?? '', llave: entorno.SUPABASE_SERVICE_ROLE_KEY ?? '', token: entorno.APIFY_API_TOKEN ?? entorno.APIFY_API_KEY ?? '', ahora: e.ahora, fetchImpl: e.fetch as never }
  const cl = await e.db.from('clients').select('*').eq('id', e.clientId).limit(1)
  if (cl.error) return { estado: 'corrido', resumen: {}, errores: [`clients: ${cl.error.message}`], gasto_usd: 0 }
  const cliente = lista(cl.data)[0]
  if (!cliente) return sinNada('cliente_inexistente')
  const sd = await e.db.from('client_sedes').select('id, ciudad, clave').eq('client_id', e.clientId)
  if (sd.error) return { estado: 'corrido', resumen: {}, errores: [`client_sedes: ${sd.error.message}`], gasto_usd: 0 }
  const ciudades = lista(sd.data).map((s) => String(s.ciudad ?? '')).filter(Boolean)
  const iso = paisIsoDe(cliente.country ?? cliente.pais, cliente.market)
  let gasto = 0
  const resumen: Record<string, unknown> = {}
  try {
    if (e.paso === 'cuentas_y_comentarios') {
      const ejecutarApify = ejecutarEnApify({ token: common.token, fetchImpl: e.fetch as never })
      const cuentas = await descubrirCuentas({ cliente: cliente as never, clientId: e.clientId, ciudades, urlDeLaBase: common.urlDeLaBase, llave: common.llave, token: common.token, ahora: e.ahora, ejecutar: ejecutarApify, fetchImpl: e.fetch as never })
      const clienteVivo = (cuentas.config_nueva ? { ...cliente, config: cuentas.config_nueva } : cliente) as never
      const cm = await comentariosDeRedes({ redes: REDES_DEL_PASO_DE_SIEMPRE, cliente: clienteVivo, clientId: e.clientId, urlDeLaBase: common.urlDeLaBase, llave: common.llave, token: common.token, ahora: e.ahora, ejecutar: ejecutarComentarios({ token: common.token, fetchImpl: e.fetch as never }), fetchImpl: e.fetch as never })
      // los comentarios que ya traían los videos de Instagram de la competencia (del raspado que ya está en la base)
      const rr = await e.db.from('apify_raw').select('id, apify_function, params, respuesta, ensayo, metadata, created_at').eq('client_id', e.clientId).eq('ensayo', false).eq('apify_function', 'videos_instagram').order('created_at', { ascending: false }).limit(60)
      if (rr.error) errores.push(`apify_raw: ${rr.error.message}`)
      const own = (((cliente.config as Fila | null)?.apify as Fila | undefined)?.own_handles ?? {}) as Record<string, unknown>
      const propios = new Set(Object.values(own).filter((v): v is string => typeof v === 'string').map((h) => h.toLowerCase().replace(/^@/, '')))
      const deVideos = comentariosDeVideosDeLaCompetencia(lista(rr.data) as never, propios)
      const gv = deVideos.length ? await guardarComentariosDeLaCompetencia({ clientId: e.clientId, comentarios: deVideos, urlDeLaBase: common.urlDeLaBase, llave: common.llave, ahora: e.ahora, fetchImpl: e.fetch as never }) : { guardados: 0 }
      resumen.cuentas_de_redes = cuentas
      resumen.comentarios_de_redes = { ...cm, de_videos_de_la_competencia: { leidos: deVideos.length, guardados: gv.guardados, ...(gv.error ? { error: gv.error } : {}) } }
      gasto += (cuentas.costo_usd ?? 0) + (cm.costo_usd ?? 0)
    } else if (esFuenteNueva(e.paso)) {
      // las seis fuentes nuevas (02-nov): cada una su paso; el trabajo y el archivo viven en `fuentes-nuevas.ts`
      const f = await correrFuenteNueva({
        db: e.db, fuente: e.paso, cliente: cliente as never, clientId: e.clientId, ciudadesDeSedes: ciudades, ahora: e.ahora, ejecutar: ejecutarEnApify({ token: common.token, fetchImpl: e.fetch as never, esperaMs: 120_000 }),
        workflowId: e.registro?.workflowId, ejecucionId: e.registro?.ejecucionId,
        leerComentarios: async (cl) => {
          const cm = await comentariosDeRedes({ redes: REDES_DE_IG_Y_FB, cliente: cl, clientId: e.clientId, urlDeLaBase: common.urlDeLaBase, llave: common.llave, token: common.token, ahora: e.ahora, ejecutar: ejecutarComentarios({ token: common.token, fetchImpl: e.fetch as never }), fetchImpl: e.fetch as never })
          return { costo_usd: cm.costo_usd ?? 0, ...(cm.estado === 'error' || cm.estado === 'sin_base' || cm.estado === 'sin_token' ? { error: `comentarios de Instagram y Facebook: ${cm.estado}${cm.mensaje ? ` · ${cm.mensaje}` : ''}` } : {}), resumen: { estado: cm.estado, cuentas_conocidas: cm.cuentas_conocidas, leidas: cm.leidas, comentarios_nuevos: cm.competencia, por_red: cm.por_red, costo_usd: cm.costo_usd } }
        },
      })
      resumen[e.paso] = f.resumen
      f.errores.forEach((x) => errores.push(x))
      gasto += f.gasto_usd
    } else if (e.paso === 'tendencias') {
      const t = await tendenciasDelCliente({ ...common, cliente: cliente as never, clientId: e.clientId, ciudades, llamarModelo: e.llamarModelo })
      resumen.tendencias = t
      gasto += (t.gasto_usd ?? 0) + (t.costo_modelo_usd ?? 0)
    } else if (e.paso === 'bodega') {
      const b = await bodegaDelMundo({ ...common, paises: iso ? [iso] : [] })
      resumen.bodega = b
      gasto += b.gasto_usd ?? 0
      // los videos de la bodega (sin cliente) también se transcriben
      const tr = await transcribirVideos({ clientId: null, urlDeLaBase: common.urlDeLaBase, llave: common.llave, openaiKey: entorno.OPENAI_API_KEY ?? '', fetchImpl: e.fetch, registro: e.registro })
      resumen.transcripcion_de_la_bodega = tr
      gasto += tr.costo_usd
      tr.fallidos.forEach((f) => errores.push(`transcripción de la bodega ${f.post_id}: ${f.causa}`))
    } else if (e.paso === 'transcripcion') {
      const tr = await transcribirVideos({ clientId: e.clientId, urlDeLaBase: common.urlDeLaBase, llave: common.llave, openaiKey: entorno.OPENAI_API_KEY ?? '', fetchImpl: e.fetch, registro: e.registro })
      resumen.transcripcion = tr
      gasto += tr.costo_usd
      tr.fallidos.forEach((f) => errores.push(`transcripción ${f.post_id}: ${f.causa}`))
    }
  } catch (err) { errores.push(`${e.paso}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300)) }
  return { estado: 'corrido', resumen, errores, gasto_usd: gasto }
}
