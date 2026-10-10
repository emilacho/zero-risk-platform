/**
 * EL REVISOR GPT · lo COMÚN a la oficina (piezas) y a la revisión del manual. Sin reglas, sin rúbrica, sin formato: su texto es una OPINIÓN libre.
 *
 *  · UNA sola pregunta para todo, con huecos {qué es} {uso} {público} {objetivo} (firma D3 de Emilio, 10-oct): generaliza la versión literal que dio el propio revisor en la consulta del 10-oct
 *    (`raw/tasks/2026-10-10-LISTO-CC2-consulta-gpt.md`). Cambiar el texto es cambiar una firma.
 *  · el pedido se arma en este orden: la pregunta (con un resumen) → lo que se revisa completo → el contexto rotulado por nombre y función.
 *  · llamada con 3 REINTENTOS de espera creciente (5 s, 20 s, 60 s) ante red, 5xx o 429; una llave o un modelo equivocados (401/403/404 y demás 4xx) NO se reintentan; cada intento cuenta su costo.
 */

// ───────────────────────── la pregunta
export const PREGUNTA_AL_REVISOR = 'Te comparto {qué es}, que se usa para {uso}, apunta a {público} y busca {objetivo}, junto con el contexto de la marca. Dame una lectura independiente: qué funciona, qué puede fallar y qué cambiarías, si cambiarías algo. Puedes cuestionar también la idea o el enfoque. Sé concreto y apóyate en lo que ves; distingue lo que observas de lo que supones sobre el público. Usa el contexto para entender lo que te comparto, no para justificarlo.'

export const QUE_ES_SIN_DATO = 'una pieza de marketing'
export const USO_SIN_DATO = 'comunicar la marca'
export const PUBLICO_SIN_DATO = 'quienes describen los documentos de abajo'
export const OBJETIVO_SIN_DATO = 'lo que pide el brief'

export interface HuecosDeLaPregunta { que_es?: string; uso?: string; publico?: string; objetivo?: string }
/** llena los cuatro huecos con lo que se sabe; lo que no se sabe se DICE (no se inventa) */
export function preguntaAlRevisor(h: HuecosDeLaPregunta = {}): string {
  const v = (x: string | undefined, sin: string) => (x ?? '').trim() || sin
  return PREGUNTA_AL_REVISOR
    .replace('{qué es}', v(h.que_es, QUE_ES_SIN_DATO))
    .replace('{uso}', v(h.uso, USO_SIN_DATO))
    .replace('{público}', v(h.publico, PUBLICO_SIN_DATO))
    .replace('{objetivo}', v(h.objetivo, OBJETIVO_SIN_DATO))
}

// ───────────────────────── el pedido
/** un documento de apoyo: su nombre y SU FUNCIÓN (para que el revisor sepa qué es hecho, qué es aspiración y cuál manda si se contradicen) */
export interface ContextoDelRevisor { titulo: string; texto: string; funcion?: string }
export interface PedidoAlRevisor { texto: string; imagenes: string[] }

export const INTRO_CONTEXTO = 'Los documentos mezclan hechos (lo que el cliente es y tiene) con aspiraciones (lo que quiere lograr). Cada uno dice qué es. Si dos se contradicen, vale el manual de marca vigente. Es un resumen de lo vigente, no el historial.'

export interface DatosDelPedido {
  /** la pregunta ya armada (con `preguntaAlRevisor`) */
  pregunta: string
  /** filas del «resumen del encargo» (opcional) */
  resumen?: string[]
  /** lo que se revisa, completo, y cómo se llama la sección */
  titulo_de_lo_revisado?: string
  revisado: string
  nota?: string
  contexto: ContextoDelRevisor[]
  titulo_del_contexto?: string
  intro_del_contexto?: string
  imagenes?: string[]
}
export function armarPedido(a: DatosDelPedido): PedidoAlRevisor {
  const partes = [a.pregunta]
  const filas = (a.resumen ?? []).filter(Boolean)
  if (filas.length) partes.push(`## Resumen del encargo\n${filas.join('\n')}`)
  partes.push(`## ${a.titulo_de_lo_revisado ?? 'La pieza'}\n${a.revisado.trim() || '(sin texto)'}${a.nota ? `\n\n(${a.nota})` : ''}`)
  const docs = a.contexto.filter((c) => c.texto.trim())
  if (docs.length) partes.push(`## ${a.titulo_del_contexto ?? 'Contexto de la marca'}\n${a.intro_del_contexto ?? INTRO_CONTEXTO}\n\n${docs.map((c) => `### ${c.titulo}${c.funcion ? ` — ${c.funcion}` : ''}\n${c.texto.trim()}`).join('\n\n')}`)
  return { texto: partes.join('\n\n'), imagenes: (a.imagenes ?? []).filter((u) => typeof u === 'string' && u !== '') }
}

// ───────────────────────── la llamada
export interface IntentoDelRevisor { n: number; resultado: string; http: number | null; costo_usd: number; espera_antes_ms: number }
export type ResultadoDelRevisor =
  | { ok: true; texto: string; costo_usd: number; modelo: string; intentos?: IntentoDelRevisor[] }
  | { ok: false; error: string; costo_usd?: number; intentos?: IntentoDelRevisor[] }

export const ESPERAS_DEL_REVISOR_MS = [5_000, 20_000, 60_000]
/** tiempo límite de CADA intento: un fetch colgado cuenta como fallo de red y se reintenta (condición de CC#3 sobre #477) */
export const TIEMPO_LIMITE_POR_INTENTO_MS = 60_000
/** total máximo de la llamada con sus reintentos: la ruta de turnos vive 300 s y le quedan otros pasos; si el siguiente intento no cabe, se deja de reintentar */
export const PRESUPUESTO_TOTAL_MS = 200_000
const sumaDeIntentos = (xs: IntentoDelRevisor[]) => +xs.reduce((a, x) => a + x.costo_usd, 0).toFixed(8)

export interface OpcionesDeLlamada {
  f: typeof fetch
  apiKey?: string
  modelo?: string
  precioEntrada?: number
  precioSalida?: number
  texto: string
  imagenes_urls?: string[]
  esperasMs?: number[]
  tiempoLimiteMs?: number
  presupuestoTotalMs?: number
  ahora?: () => number
  esperar?: (ms: number) => Promise<void>
}
export async function llamarRevisorGpt(o: OpcionesDeLlamada): Promise<ResultadoDelRevisor> {
  if (!o.apiKey) return { ok: false, error: 'OPENAI_API_KEY no configurada', costo_usd: 0, intentos: [] }
  if (!o.modelo) return { ok: false, error: 'el nombre del modelo del revisor no está configurado (no se inventa uno)', costo_usd: 0, intentos: [] }
  const esperas = o.esperasMs ?? ESPERAS_DEL_REVISOR_MS
  const dormir = o.esperar ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)))
  const contenido: Array<Record<string, unknown>> = [{ type: 'input_text', text: o.texto }]
  for (const u of o.imagenes_urls ?? []) contenido.push({ type: 'input_image', image_url: u })
  const cuerpo = JSON.stringify({ model: o.modelo, input: [{ role: 'user', content: contenido }] })
  const intentos: IntentoDelRevisor[] = []
  let ultimoError = ''
  const limite = o.tiempoLimiteMs ?? TIEMPO_LIMITE_POR_INTENTO_MS
  const total = o.presupuestoTotalMs ?? PRESUPUESTO_TOTAL_MS
  const reloj = o.ahora ?? Date.now
  const t0 = reloj()
  for (let k = 0; k <= esperas.length; k++) {
    const espera = k === 0 ? 0 : esperas[k - 1]
    // si la espera + un intento completo ya no caben en el presupuesto total, no se reintenta
    if (k > 0 && reloj() - t0 + espera + limite > total) { ultimoError = `${ultimoError} (sin presupuesto para otro intento)`.trim(); break }
    if (espera > 0) await dormir(espera)
    const intento = (resultado: string, costo_usd: number, http?: number): IntentoDelRevisor => ({ n: k + 1, resultado, http: http ?? null, costo_usd, espera_antes_ms: espera })
    let reintentable = false
    try {
      const r = await o.f('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` }, body: cuerpo, signal: AbortSignal.timeout(limite) })
      const j = (await r.json().catch(() => ({}))) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } }
      // precio: del entorno; sin él, un valor conservador para que el freno cuente algo (se declara como estimación en el libro)
      const pin = o.precioEntrada ?? 5, pout = o.precioSalida ?? 30
      const costo = ((j.usage?.input_tokens ?? 0) * pin + (j.usage?.output_tokens ?? 0) * pout) / 1_000_000
      if (r.ok) {
        const texto = j.output_text ?? j.output?.flatMap((x) => x.content ?? []).map((c) => c.text ?? '').join('') ?? ''
        intentos.push(intento('ok', costo, r.status))
        return { ok: true, texto, costo_usd: sumaDeIntentos(intentos), modelo: o.modelo, intentos }
      }
      ultimoError = j.error?.message ?? `HTTP ${r.status}`
      reintentable = r.status === 429 || r.status >= 500
      intentos.push(intento(reintentable ? `http_${r.status}` : `rechazado_${r.status}`, costo, r.status))
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : String(e)
      reintentable = true
      intentos.push(intento('red', 0))
    }
    if (!reintentable) break
  }
  return { ok: false, error: ultimoError, costo_usd: sumaDeIntentos(intentos), intentos }
}
