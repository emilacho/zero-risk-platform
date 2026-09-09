/**
 * Canon canonical · CONTRATO COMÚN DE LOS BRAZOS · §4.2 del diseño de
 * `planeación` (2026-09-08) · firmado por Emilio 2026-09-09.
 *
 * Los brazos existen; la forma común en que contestan, no. Esto es esa forma:
 * la MISMA salida para Apify, PostHog y el cerebro.
 *
 * ─── Los TRES estados, y por qué son tres y no dos ───────────────────────
 *   trajo          hay dato                     → el plan lo usa
 *   sin_dato       FUI, MIRÉ, Y NO HAY          → es INFORMACIÓN
 *   sin_respuesta  no contestó, o se rompió     → es un HUECO
 *
 * 🔴 «no hay» y «no contestó» NO se mezclan. Es la diferencia entre
 * «el competidor no pautea» y «no sabemos si el competidor pautea».
 *
 * ⚠️ OJO con la analogía de la sala (la pieza anterior de este mismo autor):
 * allá `attempt` es un FALLO ⇒ acá sería `sin_respuesta`. **`sin_dato` NO
 * tiene equivalente en la sala**: es una llamada EXITOSA con resultado vacío.
 * Confundirlas es exactamente lo que esta pieza existe para impedir.
 *
 * ─── El caso Meta · el más peligroso, y por qué hay `motivo` ─────────────
 * La biblioteca de anuncios de Meta DECLARA `spend`, `impressions` y `reach`
 * en su esquema y los devuelve VACÍOS: sólo los publica para anuncios
 * políticos (lectura del esquema por CC#3 en A4 · NO midió los valores).
 *
 * Un campo presente y vacío **NO es `sin_dato` a secas**: `sin_dato` dice
 * «fui, miré, y no hay». Acá la fuente NO LO PUBLICA NUNCA. Si eso cae en un
 * `sin_dato` mudo —o peor, en un cero— el plan escribe «el competidor no
 * invierte en pauta» cuando la verdad es «no se puede saber».
 * ⇒ `campoNoPublicado()` existe para eso, y el `motivo` es lo único que
 * separa «no gasta» de «no se puede saber». Nunca un cero, nunca un vacío
 * suelto.
 */

/** Canon canonical · los tres estados. No hay un cuarto. */
export const ESTADOS_BRAZO = ['trajo', 'sin_dato', 'sin_respuesta'] as const
export type EstadoBrazo = (typeof ESTADOS_BRAZO)[number]

/** Canon canonical · los brazos del lienzo v11 (firmado por Emilio).
 *  Son DOS brazos —Apify y PostHog— más el cerebro, que se LEE y no se
 *  escribe. «web propia» es la función 17 de Apify, no un brazo aparte. */
export const BRAZOS = ['apify', 'posthog', 'cerebro'] as const
export type Brazo = (typeof BRAZOS)[number]

/** Canon canonical · la salida idéntica de todo brazo · §4.2. */
export interface RespuestaBrazo {
  readonly brazo: Brazo
  readonly objetivo: string
  readonly estado: EstadoBrazo
  readonly datos: Record<string, unknown>
  /** 📌 obligatorio SIEMPRE, incluso en `trajo`: si un número no tiene de
   *  dónde, el plan asumió (exigencia textual del juez). */
  readonly fuente: string
  /** ISO-8601. */
  readonly medido_en: string
  /** 🔴 obligatorio siempre que `estado !== 'trajo'`. */
  readonly motivo?: string
}

const ahora = (medido_en?: string) => medido_en ?? new Date().toISOString()

/** Canon canonical · el brazo trajo dato. `fuente` no puede faltar. */
export function trajo(args: {
  brazo: Brazo
  objetivo: string
  datos: Record<string, unknown>
  fuente: string
  medido_en?: string
}): RespuestaBrazo {
  return {
    brazo: args.brazo,
    objetivo: args.objetivo,
    estado: 'trajo',
    datos: args.datos,
    fuente: args.fuente,
    medido_en: ahora(args.medido_en),
  }
}

/** Canon canonical · FUI, MIRÉ, Y NO HAY. Llamada exitosa, resultado vacío.
 *  El `motivo` es obligatorio por tipo: un vacío sin explicación es
 *  indistinguible de un fallo, y ésa es la confusión que esto impide. */
export function sinDato(args: {
  brazo: Brazo
  objetivo: string
  fuente: string
  motivo: string
  datos?: Record<string, unknown>
  medido_en?: string
}): RespuestaBrazo {
  return {
    brazo: args.brazo,
    objetivo: args.objetivo,
    estado: 'sin_dato',
    datos: args.datos ?? {},
    fuente: args.fuente,
    medido_en: ahora(args.medido_en),
    motivo: args.motivo,
  }
}

/** Canon canonical · NO CONTESTÓ, O SE ROMPIÓ. Es un hueco, no información. */
export function sinRespuesta(args: {
  brazo: Brazo
  objetivo: string
  fuente: string
  motivo: string
  medido_en?: string
}): RespuestaBrazo {
  return {
    brazo: args.brazo,
    objetivo: args.objetivo,
    estado: 'sin_respuesta',
    datos: {},
    fuente: args.fuente,
    medido_en: ahora(args.medido_en),
    motivo: args.motivo,
  }
}

/**
 * 🔴 Canon canonical · EL CASO META · un campo que la fuente NO PUBLICA.
 *
 * No es `trajo` (no hay valor), no es `sin_respuesta` (la llamada anduvo), y
 * no es un `sin_dato` cualquiera (no es que hoy no haya: es que **nunca** se
 * va a poder saber por esta fuente). Se marca `sin_dato` con motivo explícito
 * y **jamás con un cero ni con un vacío suelto**.
 */
export function campoNoPublicado(args: {
  brazo: Brazo
  objetivo: string
  fuente: string
  campo: string | ReadonlyArray<string>
  detalle?: string
  medido_en?: string
}): RespuestaBrazo {
  const campos = Array.isArray(args.campo) ? args.campo.join(', ') : String(args.campo)
  return sinDato({
    brazo: args.brazo,
    objetivo: args.objetivo,
    fuente: args.fuente,
    ...(args.medido_en ? { medido_en: args.medido_en } : {}),
    motivo:
      `la fuente NO PUBLICA este campo: ${campos}` +
      (args.detalle ? ` · ${args.detalle}` : '') +
      ' · NO es "no hay": es "no se puede saber por esta fuente"',
    // 🔴 explícito y a propósito: el campo va como null, nunca como 0 ni ''.
    // Un cero acá es lo que hace que el plan escriba «no invierte en pauta».
    datos: Object.fromEntries(
      (Array.isArray(args.campo) ? args.campo : [args.campo]).map((c) => [c, null]),
    ),
  })
}

/** Canon canonical · qué está mal en una respuesta. Lista vacía = cumple. */
export function validarRespuesta(r: RespuestaBrazo): ReadonlyArray<string> {
  const p: string[] = []
  if (!BRAZOS.includes(r.brazo)) p.push(`brazo desconocido: "${String(r.brazo)}"`)
  if (!r.objetivo) p.push('objetivo vacío')
  if (!ESTADOS_BRAZO.includes(r.estado)) p.push(`estado desconocido: "${String(r.estado)}"`)
  if (!r.fuente) p.push('fuente vacía · obligatoria incluso en trajo')
  if (!r.medido_en || Number.isNaN(Date.parse(r.medido_en))) {
    p.push(`medido_en no es ISO-8601: "${String(r.medido_en)}"`)
  }
  if (r.estado !== 'trajo' && !r.motivo) {
    p.push(`motivo obligatorio cuando estado="${r.estado}"`)
  }
  if (r.estado === 'trajo' && Object.keys(r.datos ?? {}).length === 0) {
    p.push('estado=trajo con datos vacíos · si no hay dato es sin_dato, con motivo')
  }
  return p
}

/**
 * Canon canonical · el envoltorio. Corre el brazo y **nunca lanza**: cualquier
 * excepción, rechazo o brazo apagado sale como `sin_respuesta` con su motivo,
 * y la corrida sigue.
 *
 * 🔴 El brazo tiene que decir él mismo si "fue y no hay": el envoltorio NO
 * puede adivinarlo. Un resultado vacío visto desde afuera es idéntico a un
 * fallo — por eso `ejecutar` devuelve `{hay:false, motivo}` en vez de `{}`.
 */
export async function envolverBrazo(args: {
  brazo: Brazo
  objetivo: string
  fuente: string
  /** `false` ⇒ el brazo está apagado · sale `sin_respuesta`, no `sin_dato`. */
  encendido?: boolean
  ejecutar: () => Promise<
    | { hay: true; datos: Record<string, unknown>; fuente?: string }
    | { hay: false; motivo: string; fuente?: string }
  >
  medido_en?: string
}): Promise<RespuestaBrazo> {
  const base = { brazo: args.brazo, objetivo: args.objetivo, fuente: args.fuente }
  if (args.encendido === false) {
    return sinRespuesta({
      ...base,
      ...(args.medido_en ? { medido_en: args.medido_en } : {}),
      motivo: 'brazo APAGADO · no se consultó · no es que no haya dato, es que no se preguntó',
    })
  }
  try {
    const r = await args.ejecutar()
    const fuente = r.fuente ?? args.fuente
    if (r.hay) {
      return trajo({
        ...base,
        fuente,
        datos: r.datos,
        ...(args.medido_en ? { medido_en: args.medido_en } : {}),
      })
    }
    return sinDato({
      ...base,
      fuente,
      motivo: r.motivo,
      ...(args.medido_en ? { medido_en: args.medido_en } : {}),
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e)
    return sinRespuesta({
      ...base,
      ...(args.medido_en ? { medido_en: args.medido_en } : {}),
      motivo: `el brazo se rompió · ${detalle}`.slice(0, 400),
    })
  }
}

/** Canon canonical · resumen legible de una recolección · para el registro
 *  y para el que lea el plan. No deriva nada: sólo cuenta y clasifica. */
export function resumirRecoleccion(rs: ReadonlyArray<RespuestaBrazo>) {
  const por = (e: EstadoBrazo) => rs.filter((r) => r.estado === e)
  return {
    pedidos: rs.length,
    trajo: por('trajo').length,
    sin_dato: por('sin_dato').length,
    sin_respuesta: por('sin_respuesta').length,
    huecos: por('sin_respuesta').map((r) => ({
      brazo: r.brazo,
      objetivo: r.objetivo,
      motivo: r.motivo ?? '',
    })),
    informacion_de_ausencia: por('sin_dato').map((r) => ({
      brazo: r.brazo,
      objetivo: r.objetivo,
      motivo: r.motivo ?? '',
    })),
    invalidas: rs.flatMap((r) =>
      validarRespuesta(r).length ? [{ objetivo: r.objetivo, problemas: validarRespuesta(r) }] : [],
    ),
  }
}
