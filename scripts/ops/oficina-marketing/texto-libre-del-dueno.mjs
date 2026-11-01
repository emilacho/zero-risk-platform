/**
 * 01-nov · «LO QUE DIJO EL DUEÑO» llega al redactor con su TEXTO LIBRE, no solo los datos de sede (orden Lenovo 12:36Z, tramo 1, ítem 5). Agnóstico.
 * Hoy «Lo que dijo el dueño» trae únicamente datos de sede (`/api/cliente/datos-del-dueno`). Las respuestas con texto libre viven en el cerebro (`GET /api/brain/alimentar/dueno`, solo lectura, US$ 0, dominio CEREBRO: aquí solo se CONSUME).
 * Qué cambia (y SOLO esto): tras «Unir el público ideal al paquete» se lee esa ruta y se pega al paquete `texto_libre_del_dueno` (+ `texto_libre_estado`); «Redactor (B4)» lo escribe como un bloque con PRECEDENCIA ALTA.
 *   · Ruta apagada (`PORTERO_DUENO` sin `on` ⇒ `{apagado:true}`), sin respuestas, lectura caída o respuesta rara ⇒ no se pega nada y el pedido queda IGUAL que hoy (estado `apagado` | `vacio` | `sin_lectura`). Nunca detiene la corrida: la lectura estructurada de sedes ya la detiene si falla.
 *   · Reciente primero, tope 30 respuestas, cada una ≤ 600 caracteres y el bloque ≤ 6.000. Cada línea lleva tema, fecha («hace N días») y la cita; el redactor decide si sigue vigente.
 *   · El bloque pasa por la misma limpieza de nombres de personas que los hechos (el plan no nombra al dueño ni dice quién habló: P7).
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, redirigir } from './lib.mjs'

export const CODIGO_UNIR_TEXTO_LIBRE = `// 01-nov · el texto libre que el dueño respondió (cerebro, solo lectura) entra al paquete. Apagado, vacío o caído ⇒ el pedido queda como hoy; nunca detiene la corrida.
const base = $('Unir el público ideal al paquete').first().json;
const r = $input.first().json || {};
const http = Number(r.statusCode);
const cuerpo = r.body && typeof r.body === 'object' && !Array.isArray(r.body) ? r.body : null;
let estado = 'sin_lectura';
let lista = [];
if (cuerpo && cuerpo.apagado === true) estado = 'apagado';
else if (Number.isFinite(http) && http >= 200 && http < 300 && cuerpo && cuerpo.ok === true && Array.isArray(cuerpo.respuestas)) {
  lista = cuerpo.respuestas.filter(function (x) { return x && typeof x === 'object' && typeof x.respuesta === 'string' && x.respuesta.trim() });
  estado = lista.length ? 'leido' : 'vacio';
}
const corta = function (t, n) { t = String(t || '').replace(/\\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t };
const items = lista.slice(0, 30).map(function (x) {
  const dias = Number.isFinite(Number(x.hace_dias)) ? Number(x.hace_dias) : null;
  return { tema: corta(x.tema, 80), hace_dias: dias, respuesta: corta(x.respuesta, 600) };
});
let usado = 0;
const recorte = [];
items.forEach(function (it) { const n = it.respuesta.length + it.tema.length + 30; if (usado + n <= 6000) { usado += n; recorte.push(it); } });
return [{ json: Object.assign({}, base, { texto_libre_del_dueno: recorte, texto_libre_estado: estado }), pairedItem: { item: 0 } }];
`

export const B4_FUNCION_TEXTO_LIBRE = `/**
 * (01-nov) LO QUE DIJO EL DUEÑO CON SUS PALABRAS · respuestas de texto libre que el negocio dio por sus canales (cerebro, solo lectura). Precedencia ALTA: valen sobre lo que dice el resto del insumo.
 * Cada una trae tema, hace cuántos días se dijo y la cita; si el tiempo la pudo volver vieja, dilo en vez de afirmarla. Sin respuestas ⇒ [] (el pedido queda como hoy).
 */
function bloqueDelTextoLibre(respuestas, limpiar) {
  var lista = (Array.isArray(respuestas) ? respuestas : []).filter(function (x) { return x && typeof x.respuesta === 'string' && x.respuesta.trim() })
  if (!lista.length) return []
  var limpio = typeof limpiar === 'function' ? limpiar : function (t) { return t }
  var L = []
  L.push('══════ LO QUE EL NEGOCIO RESPONDIÓ CON SUS PALABRAS (confirmado · PRECEDENCIA ALTA) ══════')
  L.push('Son respuestas del propio negocio, más recientes primero. Valen SOBRE lo que digan el resto de las fuentes (cerebro, raspados, estimaciones): si lo contradicen, manda esto. Una respuesta de hace muchos días puede haber cambiado: no la afirmes como vigente sin decirlo, y si ya no encaja, pregúntalo. En el plan escríbelo como hechos del negocio, sin decir quién lo dijo, sin nombrar al dueño y sin escribir que una instrucción «manda» sobre otra fuente.')
  lista.forEach(function (x) {
    var cuando = Number.isFinite(Number(x.hace_dias)) ? ' (hace ' + Number(x.hace_dias) + ' días)' : ''
    L.push('- ' + (x.tema ? x.tema + cuando + ': ' : (cuando ? cuando.trim() + ': ' : '')) + limpio(String(x.respuesta)))
  })
  L.push('')
  return L
}

`

export function construirTextoLibreDelDueno(f) {
  const leer = agregarNodo(f, {
    name: 'Lo que dijo el dueño · texto libre', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: {
      method: 'GET',
      url: "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') }}/api/brain/alimentar/dueno?client_id={{ encodeURIComponent((($('Webhook · planeacion').first().json.body || {}).client_id) || '') }}&limite=30",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, 'Unir el público ideal al paquete', 220, 0)
  // una caída de red no detiene la corrida: el error pasa como item y el nodo siguiente lo trata como «sin lectura»
  leer.onError = 'continueRegularOutput'
  leer.alwaysOutputData = true
  agregarNodo(f, codigo('Unir el texto libre del dueño al paquete', CODIGO_UNIR_TEXTO_LIBRE), 'Unir el público ideal al paquete', 440, 0)
  redirigir(f, 'Unir el público ideal al paquete', 'PV3 · ¿pide el dato v1?', 'Lo que dijo el dueño · texto libre')
  conectar(f, 'Lo que dijo el dueño · texto libre', 'Unir el texto libre del dueño al paquete')
  conectar(f, 'Unir el texto libre del dueño al paquete', 'PV3 · ¿pide el dato v1?')

  // 🔴 hallazgo: los dos nodos que ENTREGAN el paquete a «Redactor (B4)» (rama FIN) lo releían de «Unir lo del dueño al paquete», es decir, ANTES del público ideal: ese paquete nunca llevó `icp`.
  // Ahora lo releen del último «Unir…», que lleva el público ideal Y el texto libre. (Con el ICP vacío o sin lectura no cambia nada; con ICP, el bloque del público ideal empieza a llegar.)
  const viejo = "$('Unir lo del dueño al paquete')", nuevo = "$('Unir el texto libre del dueño al paquete')"
  cambiarCodigo(f, 'FIN · devolver el paquete', viejo, nuevo)
  cambiarCodigo(f, 'FIN · sobre', viejo, nuevo)

  const b4 = 'Redactor (B4)'
  const ancla = '/**\n * EL PÚBLICO IDEAL (noche 19-oct'
  cambiarCodigo(f, b4, ancla, B4_FUNCION_TEXTO_LIBRE + ancla)
  cambiarCodigo(f, b4, '...bloqueDelDueno((Array.isArray(ent.hechos_del_dueno) ? ent.hechos_del_dueno : []).map(function (h) { return typeof h === \'string\' ? limpio(h) : h; })),',
    '...bloqueDelDueno((Array.isArray(ent.hechos_del_dueno) ? ent.hechos_del_dueno : []).map(function (h) { return typeof h === \'string\' ? limpio(h) : h; })),\n...bloqueDelTextoLibre(ent.texto_libre_del_dueno, limpio),')
  cambiarCodigo(f, b4, '    hechos_del_dueno_usados: Array.isArray(ent.hechos_del_dueno) ? ent.hechos_del_dueno.length : 0,',
    '    hechos_del_dueno_usados: Array.isArray(ent.hechos_del_dueno) ? ent.hechos_del_dueno.length : 0,\n    texto_libre_dueno_usados: Array.isArray(ent.texto_libre_del_dueno) ? ent.texto_libre_del_dueno.length : 0,\n    texto_libre_dueno_estado: ent.texto_libre_estado || null,')
}
