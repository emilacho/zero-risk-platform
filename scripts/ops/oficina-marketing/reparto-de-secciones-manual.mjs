/**
 * 02-nov · SEÑAL-LENOVO 13:27Z punto (c) · REPARTO DE SECCIONES del manual (firma de Emilio 01-nov; sin reglas nuevas).
 *   · `brand-strategist` escribe la ESTRATEGIA: posicionamiento + público (lo de hoy) + VISIÓN + misión + propósito + propuestas de valor.
 *     Su insumo de mercado es el que ya viaja en la evidencia (competidores y resumen del descubrimiento, que sale del analista de mercado): no se suma ninguna llamada.
 *   · `jefe-client-success` conserva SUS campos gateados (ángulo del cliente y retención: son de él y sostienen un eje del gate) y pasa a escribir PRODUCTOS y SEDES
 *     (los datos del negocio; ya era el dueño de ambos en `src/lib/manual/propuesta.ts`). Deja misión, propósito y propuestas de valor.
 *   · La VISIÓN no existía como campo de la lente: la plataforma ya la guarda (`brand_vision`) y la lista de campos ya declara visión, productos y sedes
 *     (`src/lib/manual/campos-del-manual.ts`); el borrador solo necesita conservar la clave. El Consolidador las rotula con quien las escribió.
 * Lo que NO cambia: la voz (parte (d)), las dos lentes gateadas, el gate, la evidencia ni su orden de sacrificio, el rescate (cada lente conserva su empleado).
 * Presupuesto: brand-strategist ahora lleva también la regla de campos NUEVOS (`_meta` con fuente y confianza; vacío con confianza 0 si la evidencia no alcanza)
 * y su sección crece, así que entra al máximo de lo fijo para que las tres lentes sigan recibiendo la MISMA evidencia.
 * Riesgo declarado: la lente con compuerta (brand-strategist) emite más campos en la misma respuesta (el diseño original evitaba eso para que un truncado de salida no desplazara
 * `positioning`/`icp_summary`). La prueba cuenta el largo del pedido, pero el truncado de SALIDA solo se ve en una corrida real (regla Q1).
 */
import { cambiarCodigo } from './lib.mjs'

const FAN = '[BB] Fan-out prep'
const CONS = '[BB] Consolidador'

const SEC_BS_VIEJA = String.raw`const _SEC_BS = '\n\nTU SECCIÓN: positioning + icp (audience_segment, pains, goals).';`
const SEC_BS_NUEVA = String.raw`const _SEC_BS = '\n\nTU SECCIÓN: positioning + icp (audience_segment, pains, goals)'
  + ' + vision (hacia dónde va el negocio · 1 frase · inferida de la evidencia · aspiracional pero creíble)'
  + ' + mision (qué hace el negocio y para quién · 1-2 frases)'
  + ' + proposito (el "por qué", inferido de la evidencia · aspiracional · 1 frase)'
  + ' + propuestas_de_valor[] (3-5 · diferenciadores REALES contra los competidores de la evidencia).'
  + ' Tu insumo de mercado es la evidencia: los competidores y el resumen del descubrimiento.';`

const SEC_JCS_VIEJA = String.raw`const _SEC_JCS = '\n\nTU SECCIÓN: customer_angle + retention_notes'
  + ' + mision (qué hace el negocio y para quién · 1-2 frases)'
  + ' + proposito (el "por qué", inferido de la evidencia · aspiracional · 1 frase)'
  + ' + propuestas_de_valor[] (3-5 · diferenciadores REALES contra los competidores de la evidencia).';`
const SEC_JCS_NUEVA = String.raw`const _SEC_JCS = '\n\nTU SECCIÓN: customer_angle + retention_notes'
  + ' + productos[] (lo que el negocio vende u ofrece · un ítem por producto o servicio, con su nombre y una frase · solo lo que la evidencia muestra)'
  + ' + sedes[] (dónde atiende · un ítem por lugar, con su nombre y dónde queda · solo lo que la evidencia muestra · vacío si solo atiende en línea).';`

const MAX_VIEJO = String.raw`const _FIJO_MAX = Math.max(
  _PROSA.length + _SEC_BS.length,`
const MAX_NUEVO = String.raw`const _FIJO_MAX = Math.max(
  _PROSA.length + _SEC_BS.length + REGLA_PROV.length,   // (c) 02-nov · brand-strategist también emite campos nuevos`

const LENTE_VIEJA = String.raw`task: cap(base + _SEC_BS, 'brand-strategist') },`
const LENTE_NUEVA = String.raw`task: cap(base + _SEC_BS + REGLA_PROV, 'brand-strategist') },`

const CONS_VIEJO = String.raw`  mision:              _nuevo(cs,     'mision',              'jefe-client-success', ''),
  proposito:           _nuevo(cs,     'proposito',           'jefe-client-success', ''),
  propuestas_de_valor: _nuevo(cs,     'propuestas_de_valor', 'jefe-client-success', []),`
const CONS_NUEVO = String.raw`  // (c) 02-nov · reparto de secciones: la estrategia es de brand-strategist; productos y sedes, de jefe-client-success
  vision:              _nuevo(strat,  'vision',              'brand-strategist',    ''),
  mision:              _nuevo(strat,  'mision',              'brand-strategist',    ''),
  proposito:           _nuevo(strat,  'proposito',           'brand-strategist',    ''),
  propuestas_de_valor: _nuevo(strat,  'propuestas_de_valor', 'brand-strategist',    []),
  productos:           _nuevo(cs,     'productos',           'jefe-client-success', []),
  sedes:               _nuevo(cs,     'sedes',               'jefe-client-success', []),`

export function construirRepartoDeSecciones(f) {
  cambiarCodigo(f, FAN, SEC_BS_VIEJA, SEC_BS_NUEVA)
  cambiarCodigo(f, FAN, SEC_JCS_VIEJA, SEC_JCS_NUEVA)
  cambiarCodigo(f, FAN, MAX_VIEJO, MAX_NUEVO)
  cambiarCodigo(f, FAN, LENTE_VIEJA, LENTE_NUEVA)
  cambiarCodigo(f, CONS, CONS_VIEJO, CONS_NUEVO)
}

/** los reemplazos tal cual, para que la prueba reconstruya el «antes de (c)» y mida solo este paso */
export const REEMPLAZOS_FAN_OUT = [[SEC_BS_VIEJA, SEC_BS_NUEVA], [SEC_JCS_VIEJA, SEC_JCS_NUEVA], [MAX_VIEJO, MAX_NUEVO], [LENTE_VIEJA, LENTE_NUEVA]]
export const REEMPLAZOS_CONSOLIDADOR = [[CONS_VIEJO, CONS_NUEVO]]
