/**
 * Canon canonical · LO COMÚN DE LAS TRES PUERTAS DE `planeación`.
 *
 * Las puertas son finas a propósito: reciben el pedido, llaman al brazo que ya
 * existe (B2 · `brazos.ts`) y devuelven el contrato §4.2 sin tocarlo. Toda la
 * inteligencia de «no hay» vs «no pude ver» vive en el brazo, no acá.
 *
 * 🔴 UNA PUERTA NUNCA SE CAE. Cualquier cosa que salga mal —cuerpo inválido,
 * credencial ausente, el otro lado caído— sale como `sin_respuesta` con su
 * motivo y HTTP 200. Un 500 obligaría a quien llama a distinguir «se rompió»
 * de «no hay», que es exactamente lo que este contrato existe para impedir.
 */
import { NextResponse } from 'next/server'
import { sinRespuesta, validarRespuesta, type Brazo, type RespuestaBrazo } from './contrato-brazos'

export const PEDIDO_MAXIMO = 100_000

export interface PedidoPuerta {
  readonly client_id?: string
  readonly objetivo?: string
  readonly proposito?: string
  readonly limite_ms?: number
  readonly params?: Record<string, unknown>
}

/** Canon canonical · lee el cuerpo sin lanzar nunca. */
export async function leerPedido(req: Request): Promise<{ ok: true; pedido: PedidoPuerta } | { ok: false; motivo: string }> {
  try {
    const txt = await req.text()
    if (txt.length > PEDIDO_MAXIMO) return { ok: false, motivo: `el pedido mide ${txt.length} caracteres · el tope es ${PEDIDO_MAXIMO}` }
    if (!txt.trim()) return { ok: false, motivo: 'el pedido vino vacío' }
    const j = JSON.parse(txt) as PedidoPuerta
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, motivo: 'el pedido no es un objeto' }
    return { ok: true, pedido: j }
  } catch (e) {
    return { ok: false, motivo: 'el pedido no es JSON válido · ' + (e instanceof Error ? e.message : String(e)) }
  }
}

/** Canon canonical · la respuesta de una puerta · SIEMPRE 200, siempre §4.2. */
export function responder(r: RespuestaBrazo): NextResponse {
  const problemas = validarRespuesta(r)
  // si la propia puerta rompiera el contrato, se dice — no se esconde
  return NextResponse.json(problemas.length ? { ...r, _contrato_incumplido: problemas } : r, { status: 200 })
}

/** Canon canonical · el pedido no sirve ⇒ es un HUECO, no un «no hay». */
export function pedidoInvalido(brazo: Brazo, fuente: string, objetivo: string | undefined, motivo: string, extra?: { limite_ms?: number; proposito?: string }): NextResponse {
  return responder(sinRespuesta({
    brazo,
    objetivo: objetivo || '(sin objetivo)',
    fuente,
    motivo: 'el pedido no era válido · ' + motivo + ' · NO se consultó a la fuente',
    ...(extra?.limite_ms !== undefined ? { limite_ms: extra.limite_ms } : {}),
    ...(extra?.proposito ? { proposito: extra.proposito } : {}),
  }))
}

/** Canon canonical · red final · una puerta jamás devuelve 500. */
export function seRompio(brazo: Brazo, fuente: string, objetivo: string, e: unknown, extra?: { limite_ms?: number; proposito?: string }): NextResponse {
  const detalle = e instanceof Error ? e.message : String(e)
  return responder(sinRespuesta({
    brazo,
    objetivo,
    fuente,
    motivo: ('la puerta se rompió · ' + detalle).slice(0, 400),
    ...(extra?.limite_ms !== undefined ? { limite_ms: extra.limite_ms } : {}),
    ...(extra?.proposito ? { proposito: extra.proposito } : {}),
  }))
}

/**
 * Canon canonical · el techo de tiempo, aplicado de verdad.
 * Sin esto, `limite_ms` sería un campo que se declara y no se cumple — y un
 * `sin_respuesta` que no dice cuánto esperó no se puede leer.
 */
export async function conLimite<T>(ms: number | undefined, tarea: () => Promise<T>): Promise<T> {
  if (!ms || ms <= 0) return tarea()
  let temporizador: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      tarea(),
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(() => rechazar(new Error(`se agotó el tiempo dado · ${ms} ms`)), ms)
      }),
    ])
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}
