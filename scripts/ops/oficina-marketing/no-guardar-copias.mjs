/**
 * 01-nov · ADENDA 5 del encargo «errores del plan» · «Pedir cambios» NO puede guardar una versión que es COPIA del plan anterior
 * (PLAN-CC2-adenda5-version-2-copia-del-plan-anterior + RESPUESTA-CC3: seis condiciones). Planeación `X9F0zp6LQ2xGEYVS`.
 * Causa: el corredor devuelve la respuesta del punto de control si el pedido no trae `force_restart`; «Guardar el plan» no comparaba nada.
 *
 * DOS CANDADOS INDEPENDIENTES (cada uno se prueba SOLO):
 *   1. «Pedir el plan al redactor» manda `force_restart: true` cuando hay un plan anterior que reescribir (`Plan anterior · leer`.reescritura === true), además de lo que ya lo forzaba.
 *   2. Un nodo nuevo «② ¿Es copia del plan anterior?» va ANTES de «Guardar el plan» (en sus dos entradas) y compara el texto del redactor, tal cual llegó (la sección «Qué cambió»
 *      la arma la plataforma después, así que no puede disfrazar una copia), con el texto del plan anterior (espacios y saltos normalizados).
 *        · no es reescritura o el texto es distinto ⇒ el ítem pasa INTACTO (solo suma `copia_del_plan_anterior: 'no'`) y todo sigue como hoy.
 *        · es copia la 1.ª vez ⇒ UN reintento: vuelve a «Pedir el plan al redactor» con `reintento_forma: true` (fuerza el reinicio).
 *        · es copia la 2.ª vez ⇒ NO se guarda nada: el pedido del dueño (si hay `plan_cambio_id`) queda `fallido` con «sin cambios reales…», la vigente no se mueve, no hay compuerta ni avisos de bandeja,
 *          y la sala recibe `no_corrio_sin_cambios_reales` con el motivo (un solo cable, sin aviso suelto).
 *        · el plan anterior sin texto legible ⇒ se guarda como hoy pero rotulado `comparacion_fallo: true` en el tag (visible; no se calla).
 */
import { agregarNodo, codigo, conectar, nodo, redirigir, si } from './lib.mjs'

export const NODO_COPIA = '② ¿Es copia del plan anterior?'
export const NODO_COPIA_REINTENTO = '② IF · ¿copia · reintentar?'
export const NODO_COPIA_DETENER = '② IF · ¿copia · detener?'
export const NODO_COPIA_PREGUNTA = '② IF · ¿hay pedido de cambios?'
export const NODO_COPIA_CAMBIO = '② Cambio · sin cambios reales'
export const NODO_COPIA_RESUMEN = '② Resumen · sin cambios reales'
export const NODO_COPIA_CABLE = '② Cable de vuelta · sin cambios reales'
export const NODO_COPIA_VOLVIO = '② Cable · ¿volvió? · sin cambios reales'

export const DETALLE_SIN_CAMBIOS = 'sin cambios reales: el redactor devolvió el mismo plan que ya existía (dos intentos); no se guardó ninguna versión nueva'

export const CODIGO_COPIA = `// 01-nov · ADENDA 5 · NO se guarda una copia del plan anterior. Compara el texto del redactor (tal cual llegó, SIN la sección «Qué cambió», que la arma la plataforma después) con el del plan anterior.
const plan = $input.first().json || {}
let re = null
try { re = $('Plan anterior · leer').first().json } catch (e) { re = null }
if (!re || re.reescritura !== true) return [{ json: Object.assign({}, plan, { copia_del_plan_anterior: 'no' }) }]
// la plataforma pega la sección «Qué cambió» a las versiones B y C (tras el título, en el lugar de la del modelo o al final): se quita de AMBOS textos, dondequiera que esté, desde su título hasta el siguiente título del mismo o mayor rango
const sinQueCambio = function (t) {
  const fuera = []; let rango = 0
  String(t == null ? '' : t).split(/\\r?\\n/).forEach(function (linea) {
    const h = /^\\s*(#{1,6})\\s/.exec(linea)
    if (rango && h && h[1].length <= rango) rango = 0
    if (!rango) {
      const t1 = /^\\s*(#{1,6})\\s*(?:\\*\\*)?\\s*qu[eé]\\s+cambi[oó]/i.exec(linea)
      const t2 = /^\\s*\\*\\*\\s*qu[eé]\\s+cambi[oó]|^\\s*qu[eé]\\s+cambi[oó]\\s*:/i.exec(linea)
      if (t1) { rango = t1[1].length; return }
      if (t2) { rango = 7; return }
      fuera.push(linea)
    }
  })
  return fuera.join('\\n')
}
const normal = function (t) { return sinQueCambio(t).replace(/\\s+/g, ' ').trim() }
const anterior = re.plan_anterior && typeof re.plan_anterior.texto === 'string' ? normal(re.plan_anterior.texto) : ''
const nuevo = normal(plan.texto)
if (!anterior || !nuevo) return [{ json: Object.assign({}, plan, { copia_del_plan_anterior: 'no', comparacion_fallo: true }) }]
const esCopia = anterior === nuevo
if (!esCopia) return [{ json: Object.assign({}, plan, { copia_del_plan_anterior: 'no' }) }]
if ($runIndex === 0) {
  const base = $('Redactor · elegir').last().json
  return [{ json: Object.assign({}, base, { veredicto: 'reintentar', reintento_forma: true, copia_del_plan_anterior: 'reintentar' }) }]
}
return [{ json: { copia_del_plan_anterior: 'detener', client_id: plan.client_id || null, client_name: plan.client_name || null, caracteres: plan.caracteres || 0 } }]
`

const CODIGO_RESUMEN = `// 01-nov · ADENDA 5 · la corrida termina AQUÍ: el redactor devolvió dos veces el plan que ya existía. No se guardó nada.
const c = $input.first().json || {}
return [{ json: {
  corrio: true,
  guardo_plan: false,
  motivo: ${JSON.stringify(DETALLE_SIN_CAMBIOS)},
  pedido_marcado: c.statusCode ? [200, 204].indexOf(Number(c.statusCode)) !== -1 : null,
} }]
`

const CODIGO_VOLVIO = `// El cable de vuelta NO puede ser mudo (misma regla que «repetida»): la sala debe enterarse de que la corrida terminó sin versión nueva.
const r = $input.first().json || {};
const volvio = r.ok === true;
let corr = null;
try { corr = $('Webhook · planeacion').first().json.body._sala_correlation_id || null; } catch (e) { corr = null; }
if (corr && !volvio) {
  throw new Error('CABLE_DE_VUELTA_MUDO · la sala NO se entero de que la corrida termino · codigo ' + String(r.code || r.error || 'sin codigo'));
}
return [{ json: {
  cierre: 'no_corrio_sin_cambios_reales',
  vuelta_ok: volvio,
  vuelta_detalle: volvio ? (r.event_id || 'sin event_id') : (r.code || r.detail || r.error || 'sin respuesta de la sala'),
  despachado_por_la_sala: !!corr,
} }];
`

const clonar = (f, de, nombre, cambio) => {
  const n = structuredClone(nodo(f, de))
  delete n.id
  delete n.position
  n.name = nombre
  cambio(n)
  return n
}

export function construirNoGuardarCopias(f) {
  // candado 1 · reescribir ⇒ reinicio forzado
  const pedir = nodo(f, 'Pedir el plan al redactor')
  const fr = 'force_restart: ('
  if (pedir.parameters.jsonBody.split(fr).length !== 2) throw new Error('«Pedir el plan al redactor» ya no trae force_restart una sola vez')
  pedir.parameters.jsonBody = pedir.parameters.jsonBody.replace(fr, () => "force_restart: (function () { try { return $('Plan anterior · leer').first().json.reescritura === true } catch (e) { return false } })() || (")

  // candado 2 · los nodos
  agregarNodo(f, codigo(NODO_COPIA, CODIGO_COPIA), 'Guardar el plan', -440, 0)
  agregarNodo(f, si(NODO_COPIA_REINTENTO, "={{ $json.copia_del_plan_anterior }}", 'reintentar', 'equals', 'string'), 'Guardar el plan', -440, 160)
  agregarNodo(f, si(NODO_COPIA_DETENER, "={{ $json.copia_del_plan_anterior }}", 'detener', 'equals', 'string'), 'Guardar el plan', -440, 320)
  agregarNodo(f, si(NODO_COPIA_PREGUNTA, "={{ typeof ($('Webhook · planeacion').first().json.body || {}).plan_cambio_id === 'string' && ($('Webhook · planeacion').first().json.body || {}).plan_cambio_id !== '' }}"), 'Guardar el plan', -440, 480)
  agregarNodo(f, clonar(f, 'Cambio · fallido', NODO_COPIA_CAMBIO, (n) => {
    const v = "estado: 'fallido', despertar_detalle: 'la corrida terminó sin plan'"
    if (n.parameters.jsonBody.split(v).length !== 2) throw new Error('«Cambio · fallido» ya no trae su cuerpo esperado')
    n.parameters.jsonBody = n.parameters.jsonBody.replace(v, () => `estado: 'fallido', despertar_detalle: ${JSON.stringify(DETALLE_SIN_CAMBIOS)}`)
  }), 'Guardar el plan', -440, 640)
  agregarNodo(f, codigo(NODO_COPIA_RESUMEN, CODIGO_RESUMEN), 'Guardar el plan', -440, 800)
  agregarNodo(f, clonar(f, 'Cable de vuelta · repetida', NODO_COPIA_CABLE, (n) => {
    const v = "resultado: 'no_corrio_repetida',"
    if (n.parameters.jsonBody.split(v).length !== 2) throw new Error('«Cable de vuelta · repetida» ya no trae su resultado esperado')
    n.parameters.jsonBody = n.parameters.jsonBody.replace(v, () => `resultado: 'no_corrio_sin_cambios_reales', motivo: ${JSON.stringify(DETALLE_SIN_CAMBIOS)},`)
  }), 'Guardar el plan', -440, 960)
  agregarNodo(f, codigo(NODO_COPIA_VOLVIO, CODIGO_VOLVIO), 'Guardar el plan', -440, 1120)

  // las dos entradas de «Guardar el plan» pasan por la comparación
  redirigir(f, 'Validar · ¿se pide?', 'Guardar el plan', NODO_COPIA, 1)
  redirigir(f, 'Validar · ¿pasó?', 'Guardar el plan', NODO_COPIA, 0)
  conectar(f, NODO_COPIA, NODO_COPIA_REINTENTO)
  conectar(f, NODO_COPIA_REINTENTO, 'Pedir el plan al redactor', 0)
  conectar(f, NODO_COPIA_REINTENTO, NODO_COPIA_DETENER, 1)
  conectar(f, NODO_COPIA_DETENER, NODO_COPIA_PREGUNTA, 0)
  conectar(f, NODO_COPIA_DETENER, 'Guardar el plan', 1)
  conectar(f, NODO_COPIA_PREGUNTA, NODO_COPIA_CAMBIO, 0)
  conectar(f, NODO_COPIA_PREGUNTA, NODO_COPIA_RESUMEN, 1)
  conectar(f, NODO_COPIA_CAMBIO, NODO_COPIA_RESUMEN)
  conectar(f, NODO_COPIA_RESUMEN, NODO_COPIA_CABLE)
  conectar(f, NODO_COPIA_CABLE, NODO_COPIA_VOLVIO)
  conectar(f, NODO_COPIA_VOLVIO, 'V9 · armar el cierre')

  // la comparación que no se pudo hacer queda a la vista en el tag del plan guardado
  const ancla = 'guardado_antes_de_drive: true,'
  const g = nodo(f, 'Guardar el plan')
  if (g.parameters.jsonBody.split(ancla).length !== 2) throw new Error('«Guardar el plan» ya no trae `guardado_antes_de_drive` una sola vez')
  g.parameters.jsonBody = g.parameters.jsonBody.replace(ancla, () => ancla + ' comparacion_fallo: $json.comparacion_fallo === true ? true : undefined,')
}
