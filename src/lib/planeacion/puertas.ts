/**
 * Canon canonical · LO COMÚN DE LAS TRES PUERTAS DE `planeación`.
 *
 * Las puertas son finas a propósito: reciben los pedidos, llaman al brazo que
 * ya existe (B2 · `brazos.ts`) y devuelven el contrato §4.2 sin tocarlo. Toda
 * la inteligencia de «no hay» vs «no pude ver» vive en el brazo, no acá.
 *
 * 🔴 UNA PUERTA NUNCA SE CAE. Cualquier cosa que salga mal —cuerpo inválido,
 * credencial ausente, el otro lado caído— sale como `sin_respuesta` con su
 * motivo y HTTP 200. Un 500 obligaría a quien llama a distinguir «se rompió»
 * de «no hay», que es exactamente lo que este contrato existe para impedir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 LA PUERTA RECIBE UNA **LISTA** Y CONTESTA UNA RESPUESTA POR PEDIDO
 * (decisión de Lenovo · 2026-09-10 · reemplaza el abanico fijo de a uno)
 * ═══════════════════════════════════════════════════════════════════════════
 * `elegir brazos` decide EN VIVO cuántos pedidos salen —§4.1: `pedidos[]` con
 * su `orden`, y la medición de dos rubros dio listas DISTINTAS—. Una puerta de
 * a un pedido obliga a quien llama a armar el abanico afuera, y el número de
 * ramas queda clavado en el dibujo del flujo en vez de salir de la decisión
 * del nodo.
 *
 * ⇒ entra `{ client_id, pedidos: [...] }` · sale `{ respuestas: [...] }`
 * ⇒ **`respuestas[i]` es la respuesta de `pedidos[i]`** · misma cantidad,
 *   mismo orden, siempre. Un pedido que no sirve NO tumba a los demás: ocupa
 *   su lugar con su propio `sin_respuesta`.
 */
import { NextResponse } from 'next/server'
import {
  resumirRecoleccion,
  sinRespuesta,
  validarRespuesta,
  type Brazo,
  type RespuestaBrazo,
} from './contrato-brazos'

export const PEDIDO_MAXIMO = 100_000

/** Canon canonical · tope de pedidos por llamada. No es capricho: cada pedido
 *  de raspado es una corrida que se PAGA, y un sobre de 500 pedidos sería una
 *  factura decidida por accidente. `elegir brazos` mide 7 fijos + 2
 *  condicionales (§5) — 25 deja aire de sobra y sigue siendo un techo. */
export const TOPE_PEDIDOS = 25

/** Canon canonical · cuántos pedidos se atienden a la vez. En fila de a uno el
 *  abanico tardaría la suma de todos; todos juntos serían N corridas pagas
 *  disparadas de golpe. */
export const CUPO_EN_VUELO = 4

export interface PedidoPuerta {
  readonly client_id?: string
  readonly objetivo?: string
  readonly proposito?: string
  readonly limite_ms?: number
  readonly params?: Record<string, unknown>
  /** el que trae `elegir brazos` (§4.1) · no se reordena: sólo se respeta */
  readonly orden?: number
  // ── la firma de la corrida · ver `firmaDeLaCorrida()` ──────────────────
  readonly workflow_id?: string
  readonly workflow_execution_id?: string
  // ── lo que el Servicio de Apify exige que se DECIDA, no que se herede ──
  readonly dry_run?: boolean
  readonly callback_url?: string
}

/** Canon canonical · un pedido leído: o sirve, o dice por qué no. Los que no
 *  sirven NO se tiran — ocupan su lugar en la lista de respuestas. */
export type PedidoLeido =
  | { readonly ok: true; readonly pedido: PedidoPuerta }
  | { readonly ok: false; readonly motivo: string; readonly pedido: PedidoPuerta }

export interface Sobre {
  readonly pedidos: ReadonlyArray<PedidoLeido>
}

/** los campos que el sobre puede poner UNA vez para todos los pedidos */
const HEREDABLES = [
  'client_id',
  'proposito',
  'limite_ms',
  'workflow_id',
  'workflow_execution_id',
  'dry_run',
  'callback_url',
] as const

/**
 * Canon canonical · lee el sobre sin lanzar nunca.
 *
 * Acepta las dos formas y devuelve SIEMPRE una lista:
 *   `{ client_id, pedidos: [ {objetivo, ...}, ... ] }`  ← la de `elegir brazos`
 *   `{ client_id, objetivo, ... }`                      ← un pedido suelto
 * Lo de arriba se HEREDA a cada pedido que no lo traiga: `elegir brazos` pone
 * el cliente una vez, no una vez por pedido.
 */
export async function leerSobre(
  req: Request,
): Promise<{ ok: true; sobre: Sobre } | { ok: false; motivo: string }> {
  let cuerpo: Record<string, unknown>
  try {
    const txt = await req.text()
    if (txt.length > PEDIDO_MAXIMO) {
      return { ok: false, motivo: `el pedido mide ${txt.length} caracteres · el tope es ${PEDIDO_MAXIMO}` }
    }
    if (!txt.trim()) return { ok: false, motivo: 'el pedido vino vacío' }
    const j: unknown = JSON.parse(txt)
    if (!j || typeof j !== 'object' || Array.isArray(j)) return { ok: false, motivo: 'el pedido no es un objeto' }
    cuerpo = j as Record<string, unknown>
  } catch (e) {
    return { ok: false, motivo: 'el pedido no es JSON válido · ' + (e instanceof Error ? e.message : String(e)) }
  }

  const hayLista = Array.isArray(cuerpo.pedidos)
  const crudos: unknown[] = hayLista ? (cuerpo.pedidos as unknown[]) : [cuerpo]
  if (hayLista && crudos.length === 0) {
    return { ok: false, motivo: '`pedidos` vino vacío · no hay nada que preguntar' }
  }
  if (crudos.length > TOPE_PEDIDOS) {
    return { ok: false, motivo: `llegaron ${crudos.length} pedidos · el tope por llamada es ${TOPE_PEDIDOS}` }
  }

  const comun: Record<string, unknown> = {}
  for (const k of HEREDABLES) if (cuerpo[k] !== undefined) comun[k] = cuerpo[k]

  const pedidos: PedidoLeido[] = crudos.map((c) => {
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      return { ok: false as const, motivo: 'el pedido no es un objeto', pedido: {} as PedidoPuerta }
    }
    const pedido = { ...comun, ...(c as Record<string, unknown>) } as PedidoPuerta
    // un objetivo de espacios no es un objetivo · y `objetivo` es lo último que
    // le queda al cerebro como texto de búsqueda, así que acá se corta en serio
    if (!String(pedido.objetivo ?? '').trim()) return { ok: false as const, motivo: 'falta objetivo', pedido }
    return { ok: true as const, pedido }
  })

  return { ok: true, sobre: { pedidos } }
}

/** Canon canonical · si la propia puerta rompiera el contrato, se dice. */
function marcar(r: RespuestaBrazo): RespuestaBrazo {
  const problemas = validarRespuesta(r)
  return problemas.length ? ({ ...r, _contrato_incumplido: problemas } as RespuestaBrazo) : r
}

/**
 * Canon canonical · la respuesta de una puerta · SIEMPRE 200, siempre §4.2.
 * `respuestas[i]` corresponde a `pedidos[i]`: misma cantidad, mismo orden.
 * El `resumen` no deriva nada — cuenta y clasifica (`resumirRecoleccion`).
 */
export function responderLista(rs: ReadonlyArray<RespuestaBrazo>): NextResponse {
  return NextResponse.json({ respuestas: rs.map(marcar), resumen: resumirRecoleccion(rs) }, { status: 200 })
}

/** Canon canonical · el sobre entero no se pudo ni leer ⇒ es un HUECO, no un
 *  «no hay». No hay pedidos que contar: la lista sale con un solo renglón. */
export function sobreInvalido(brazo: Brazo, fuente: string, motivo: string): NextResponse {
  return responderLista([
    sinRespuesta({
      brazo,
      objetivo: '(sin objetivo)',
      fuente,
      motivo: 'el pedido no era válido · ' + motivo + ' · NO se consultó a la fuente',
    }),
  ])
}

/** Canon canonical · ESTE pedido no sirve ⇒ es un HUECO, y los demás siguen. */
export function pedidoInvalido(brazo: Brazo, fuente: string, p: PedidoPuerta, motivo: string): RespuestaBrazo {
  return sinRespuesta({
    brazo,
    objetivo: p.objetivo?.trim() || '(sin objetivo)',
    fuente,
    motivo: 'el pedido no era válido · ' + motivo + ' · NO se consultó a la fuente',
    ...extraDe(p),
  })
}

/** Canon canonical · red final · una puerta jamás devuelve 500. */
export function seRompio(brazo: Brazo, fuente: string, p: PedidoPuerta, e: unknown): RespuestaBrazo {
  const detalle = e instanceof Error ? e.message : String(e)
  return sinRespuesta({
    brazo,
    objetivo: p.objetivo?.trim() || '(sin objetivo)',
    fuente,
    motivo: ('la puerta se rompió · ' + detalle).slice(0, 400),
    ...extraDe(p),
  })
}

/** los dos campos aditivos del §4.2 que viajan de ida y de vuelta */
export function extraDe(p: PedidoPuerta): { limite_ms?: number; proposito?: string } {
  return {
    ...(p.limite_ms !== undefined ? { limite_ms: p.limite_ms } : {}),
    ...(p.proposito ? { proposito: p.proposito } : {}),
  }
}

/**
 * 🔴 Canon canonical · LA FIRMA DE LA CORRIDA · NO SE INVENTA.
 *
 * La primera versión firmaba cada raspado con `calling_workflow_id: 'planeacion'`
 * y `calling_workflow_execution_id: 'puerta-' + Date.now()`. Los dos eran
 * invento de la puerta:
 *   · `'planeacion'` no es el identificador de ningún flujo — y el Servicio lo
 *     guarda tal cual en `apify_raw.metadata.llamado_por` (nodo «Guardar lo
 *     crudo»), así que la fila quedaba firmada con una palabra que no cruza
 *     contra nada.
 *   · `'puerta-<milisegundos>'` el Servicio ni lo mira: medido sobre el flujo
 *     vivo `3lyknrP3PoS2KzUf`, `calling_workflow_execution_id` no aparece en
 *     ninguno de sus 56 nodos ⇒ era un identificador inventado para nadie.
 * ⇒ el gasto que la corrida deja en la libreta no se puede cruzar con la
 *   corrida que lo pidió, que es exactamente para lo que sirve una firma.
 *
 * 🔴 Por eso ahora **la firma la pone quien llama, o no hay raspado**. Sin
 * firma la puerta contesta `sin_respuesta` («no se preguntó») y NO gasta: una
 * corrida paga que nadie puede cruzar es peor que una corrida que no ocurrió.
 */
export function firmaDeLaCorrida(
  p: PedidoPuerta,
): { ok: true; workflow_id: string; workflow_execution_id: string } | { ok: false; motivo: string } {
  const wf = typeof p.workflow_id === 'string' ? p.workflow_id.trim() : ''
  const ex = typeof p.workflow_execution_id === 'string' ? p.workflow_execution_id.trim() : ''
  const faltan = [!wf ? 'workflow_id' : '', !ex ? 'workflow_execution_id' : ''].filter(Boolean)
  if (faltan.length) {
    return {
      ok: false,
      motivo:
        'falta la firma de la corrida · ' + faltan.join(' y ') +
        ' · sin eso el gasto queda sin con qué cruzarse, y la puerta NO inventa un identificador',
    }
  }
  return { ok: true, workflow_id: wf, workflow_execution_id: ex }
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

/**
 * Canon canonical · atiende la lista con cupo, y **devuelve en el mismo orden
 * en que llegó**. El orden es lo único que ata cada respuesta a su pedido.
 */
export async function enParalelo<E, S>(
  items: ReadonlyArray<E>,
  cupo: number,
  fn: (e: E, i: number) => Promise<S>,
): Promise<S[]> {
  const salida = new Array<S>(items.length)
  let siguiente = 0
  const obrero = async (): Promise<void> => {
    for (;;) {
      const i = siguiente++
      if (i >= items.length) return
      salida[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(cupo, items.length)) }, obrero))
  return salida
}
