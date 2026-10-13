/**
 * LOS ADAPTADORES REALES de los puertos de la jefatura (oficina propia). NADA de esto corre mientras la jefatura esté apagada (la puerta devuelve 409 antes) y NADA llama a un proveedor en `dry_run`.
 * Todo recibe sus dependencias por parámetro (base, `fetch`, claves) para probarse sin red. Un fallo de Slack nunca se lanza; un proveedor sin configurar responde «no configurado», no revienta.
 *
 * El modelo del revisor ciego sale de `JEFATURA_REVISOR_MODEL`; si no existe, cae a `OFICINA_REVISOR_MODEL` (lo mismo con los precios). Sin modelo: falla VISIBLE («no configurado»), no inventa uno.
 * El valor real de `OFICINA_REVISOR_MODEL` en Vercel NO está confirmado: confirmarlo es precondición de J4 (nunca se escribe ni se imprime aquí).
 */
import { ESPERAS_DEL_REVISOR_MS, llamarRevisorGptConLibro } from '../../revision-comun'
import { almacenDeSupabase, type Db } from './almacen-supabase'
import type { Puertos } from './puertos'

type Fetch = typeof fetch
export interface Entorno {
  openaiKey?: string
  revisorModelo?: string
  revisorPrecioEntrada?: number
  revisorPrecioSalida?: number
  slackToken?: string
  slackCanalAlertas?: string
  /** esperas entre reintentos del revisor (ms); por omisión 5 s, 20 s, 60 s */
  esperasRevisorMs?: number[]
  /** dormir (inyectable en pruebas) */
  esperar?: (ms: number) => Promise<void>
}

const CANAL_DE_ALERTAS_POR_OMISION = 'C0B7XUUEBHA'
const num = (v: string | undefined): number | undefined => (v && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined)
const texto = (v: string | undefined): string | undefined => (v && v.trim() !== '' ? v.trim() : undefined)

/** el entorno de la jefatura: sus variables, y si faltan, las de la oficina (mismo proveedor, mismo modelo) */
export function entornoDeProceso(env: Record<string, string | undefined> = process.env): Entorno {
  return {
    openaiKey: texto(env.OPENAI_API_KEY),
    revisorModelo: texto(env.JEFATURA_REVISOR_MODEL) ?? texto(env.OFICINA_REVISOR_MODEL),
    revisorPrecioEntrada: num(env.JEFATURA_REVISOR_PRECIO_ENTRADA_USD_M) ?? num(env.OFICINA_REVISOR_PRECIO_ENTRADA_USD_M),
    revisorPrecioSalida: num(env.JEFATURA_REVISOR_PRECIO_SALIDA_USD_M) ?? num(env.OFICINA_REVISOR_PRECIO_SALIDA_USD_M),
    slackToken: texto(env.SLACK_BOT_TOKEN),
    slackCanalAlertas: texto(env.JEFATURA_SLACK_ALERTAS) ?? texto(env.OFICINA_SLACK_ALERTAS),
  }
}

export { ESPERAS_DEL_REVISOR_MS }

export function crearPuertos(db: Db, env: Entorno, f: Fetch = fetch, ahora: () => Date = () => new Date()): Puertos {
  return {
    almacen: almacenDeSupabase(db),
    ahora,
    async revisor(p) {
      if (p.dry_run) return { ok: true, texto: '', costo_usd: 0, modelo: 'simulado (dry_run)' }
      if (!env.openaiKey) return { ok: false, error: 'OPENAI_API_KEY no configurada', costo_usd: 0, intentos: [] }
      if (!env.revisorModelo) return { ok: false, error: 'JEFATURA_REVISOR_MODEL (ni OFICINA_REVISOR_MODEL) configurado: el nombre del modelo del revisor no está verificado', costo_usd: 0, intentos: [] }
      // la llamada Y su costo en el libro central (`agent_invocations`): así el freno de US$ 8 y el vigilante de costos ven el gasto de GPT de la jefatura (condición 5 de CC#3). El detalle por paso sigue en `jefatura_pasos`.
      return llamarRevisorGptConLibro(
        { f, apiKey: env.openaiKey, modelo: env.revisorModelo, precioEntrada: env.revisorPrecioEntrada, precioSalida: env.revisorPrecioSalida, texto: p.texto, imagenes_urls: p.imagenes_urls, esperasMs: env.esperasRevisorMs, esperar: env.esperar },
        { supabase: db as never, origen: 'jefatura', refId: p.contexto.revision_id, n: p.contexto.n, clientId: p.contexto.client_id, ahora: () => ahora().getTime() },
      )
    },
    async avisar(p) {
      if (p.dry_run || !env.slackToken) return
      try {
        const r = await f('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8', authorization: `Bearer ${env.slackToken}` }, body: JSON.stringify({ channel: env.slackCanalAlertas ?? CANAL_DE_ALERTAS_POR_OMISION, text: p.texto }) })
        await r.json().catch(() => ({}))
      } catch { /* un fallo de Slack nunca frena una revisión */ }
    },
  }
}
