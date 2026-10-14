/**
 * F8 · EL MODELO SIMULADO del seco (CC#2 · 14-oct) · US$ 0, cero red. Con `dry_run = true` del ENCARGO, `avanzar` puede recibir `simulacion`: en lugar de llamar al corredor, cada turno
 * de agente contesta lo que el guion dice para ese paso (así el seco ejerce la ruta, la base, los topes y la firma de punta a punta sin un modelo).
 *  · `guion[<clave del paso>]` = el valor del turno. Un VALOR: objeto (se serializa), texto (tal cual: un formato roto se escribe aquí) o `null` (el agente no contesta).
 *    Una LISTA = intentos sucesivos del MISMO turno (el 2.º es el reintento de formato); el último se repite.
 *  · `costo_por_llamada_usd` (por omisión 0,11, lo medido por CC#3) se suma por llamada: así el tope de US$ 1,50 se ejerce sin gastar.
 * Nunca se admite sobre un encargo real (`dry_run = false` → 409 antes de cualquier turno). No hay `fetch` aquí ni nada que hable con un proveedor.
 */
import type { PedidoAlModelo, PuertosDeConversa, ModeloPuerto, RespuestaDeModelo } from './puertos'
import { voseoEn } from '../preguntas'
import { avanzar, type Respuesta } from './orquestador'

export interface Simulacion {
  guion: Record<string, unknown>
  costo_por_llamada_usd?: number
}

export const COSTO_SIMULADO_POR_LLAMADA = 0.11
export const MAX_BYTES_DE_SIMULACION = 60_000

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function validarSimulacion(v: unknown): { ok: true; valor: Simulacion } | { ok: false; errores: string[] } {
  if (!esObjeto(v)) return { ok: false, errores: ['`simulacion` debe ser un objeto'] }
  const e: string[] = []
  if (!esObjeto(v.guion)) e.push('`simulacion.guion` debe ser un objeto { paso: valor | [valores] }')
  if (v.costo_por_llamada_usd !== undefined && (typeof v.costo_por_llamada_usd !== 'number' || !Number.isFinite(v.costo_por_llamada_usd) || v.costo_por_llamada_usd < 0 || v.costo_por_llamada_usd > 5)) e.push('`simulacion.costo_por_llamada_usd` debe ser un número entre 0 y 5')
  if (JSON.stringify(v).length > MAX_BYTES_DE_SIMULACION) e.push(`la simulación pasa de ${MAX_BYTES_DE_SIMULACION} caracteres`)
  return e.length ? { ok: false, errores: e } : { ok: true, valor: v as unknown as Simulacion }
}

/** el modelo de mentira: una instancia por llamada a `avanzar` (los intentos se cuentan dentro de ese turno) */
export function modeloSimulado(s: Simulacion): ModeloPuerto & { llamadas: PedidoAlModelo[] } {
  const intentos: Record<string, number> = {}
  const llamadas: PedidoAlModelo[] = []
  return {
    llamadas,
    async invocar(p: PedidoAlModelo): Promise<RespuestaDeModelo> {
      llamadas.push(p)
      const costo = s.costo_por_llamada_usd ?? COSTO_SIMULADO_POR_LLAMADA
      const k = (intentos[p.paso] = (intentos[p.paso] ?? 0) + 1)
      if (!(p.paso in s.guion)) return { ok: false, error: 'sin_guion_para_el_paso', costo_usd: costo }
      const g = s.guion[p.paso]
      const v = Array.isArray(g) ? g[Math.min(k - 1, g.length - 1)] : g
      if (v === null || v === undefined) return { ok: false, error: 'sin_respuesta', costo_usd: costo }
      return { ok: true, salida: typeof v === 'string' ? v : JSON.stringify(v), costo_usd: costo }
    },
  }
}

/**
 * `avanzar` con modelo simulado. Orden de las puertas: apagada (409, como `avanzar`) → simulación bien formada (400) → el encargo existe (404) → SOLO en seco (409) → un turno.
 * La comprobación de «solo en seco» va ANTES de armar el modelo: con un encargo real la simulación no corre ni una vez.
 */
export async function avanzarConSimulacion(P: PuertosDeConversa, encargo_id: string, bruta: unknown): Promise<Respuesta> {
  let cfg
  try { cfg = await P.config() } catch (e) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  if (cfg.estado === 'apagada' || cfg.conversa === 'apagado') return { status: 409, cuerpo: { error: 'conversa_apagada' } }
  const v = validarSimulacion(bruta)
  if (!v.ok) return { status: 400, cuerpo: { error: 'simulacion_invalida', errores: v.errores } }
  const e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  if (e.dry_run !== true) return { status: 409, cuerpo: { error: 'simulacion_solo_en_seco' } }
  const modelo = modeloSimulado(v.valor)
  const r = await avanzar({ ...P, modelo }, encargo_id)
  // lo que el seco necesita ver de los pedidos: ¿cuántas veces se llamó a cada agente y la INSTRUCCIÓN (no el contexto) salió en tuteo, sin voseo propio?
  const llamadas = modelo.llamadas.map((l) => {
    const instruccion = l.tarea.split('\n\nCONTEXTO (JSON):')[0]
    return { paso: l.paso, agente: l.agente, instruccion_en_tuteo: /\btutea\b/i.test(instruccion), voseo_en_la_instruccion: voseoEn(instruccion), largo: l.tarea.length }
  })
  return { status: r.status, cuerpo: { ...r.cuerpo, simulado: { llamadas } } }
}
