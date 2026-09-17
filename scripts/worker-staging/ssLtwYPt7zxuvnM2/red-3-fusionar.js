// RED 3 · última red · fusiona lo que trajo el reintento y, si TODAVÍA falta
// alguna lente, PARA RUIDOSO. Nunca entregar vacío disfrazado de "no dijo nada":
// ese disfraz es lo que anuló el eje del gate en exec 87625.
//
// 🔴 E84 · CC#3 · 2026-09-17 · lo que mató la bolita (cimiento 140150):
// la red 1 recuperó 2 de 3, la red 2 reintentó bien la tercera, y esta red leía
// `secciones` e `_lente` DEL ÍTEM QUE LE LLEGA. Por el camino del reintento ese ítem
// es la respuesta CRUDA del nodo HTTP de la red 2 (con respuesta JSON el motor reemplaza
// el ítem entero; `outputPropertyName` no lo envuelve) ⇒ sin `secciones`, sin `_lente`
// ⇒ «faltan las TRES» ⇒ paraba con las tres secciones en la mano.
// AHORA: el estado reparado se lee de la red 1 (que siempre corre antes); de la entrada
// sólo se toma la sección del reintento, y se atribuye por el ítem emparejado.
const LENTES = [
  ['brand-strategist',    'Lente · brand-strategist',    'bb-lens-brand-strategist'],
  ['editor-en-jefe',      'Lente · editor-en-jefe',      'bb-lens-editor-en-jefe'],
  ['jefe-client-success', 'Lente · jefe-client-success', 'bb-lens-jefe-client-success'],
];
const SLUGS = LENTES.map((l) => l[0]);

// ① el estado ya reparado por la red 1 · un ítem por lente faltante (o uno solo si no faltaba ninguna)
let triaje = [];
try { triaje = $('[BB] Rescate · red 1 · triaje').all().map((i) => i.json || {}); } catch (e) { triaje = []; }
const base = triaje[0] || {};
const secciones = Object.assign({}, base.secciones || {});
const origen = Object.assign({}, base.origen || {});
const faltantes = triaje.map((t) => t && t._lente).filter(Boolean);

// ② la entrada · camino directo: ítems del triaje · camino reintento: respuestas crudas de la red 2
const seccionDe = (x) => {
  if (!x || typeof x !== 'object') return null;
  const b = (x.body && typeof x.body === 'object') ? x.body : x;
  return (b && b.brand_section && typeof b.brand_section === 'object') ? b.brand_section : null;
};
const entrada = $input.all();
entrada.forEach((item, i) => {
  const j = item.json || {};
  if (j.secciones) {                      // ítem del triaje (camino directo) · ya contado en ①
    Object.assign(secciones, Object.fromEntries(Object.entries(j.secciones).filter(([k]) => !secciones[k])));
    return;
  }
  // forma vieja (por si algún día el motor sí envuelve en `reintento`)
  const envuelto = j.reintento !== undefined;
  const s = envuelto ? seccionDe(j.reintento) : seccionDe(j);
  if (!s) return;                         // reintento fallido · se declara abajo como faltante
  const agente = envuelto ? j._lente : ((j.body && j.body.agent) || j.agent);
  const pi = Array.isArray(item.pairedItem) ? item.pairedItem[0] : item.pairedItem;
  const porPar = pi && Number.isInteger(pi.item) ? faltantes[pi.item] : undefined;
  let lente = null;
  if (typeof agente === 'string' && SLUGS.includes(agente)) lente = agente;
  else if (porPar) lente = porPar;
  else if (faltantes[i]) lente = faltantes[i];
  if (!lente && typeof s.lens === 'string' && SLUGS.includes(s.lens)) lente = s.lens;
  if (lente && !secciones[lente]) { secciones[lente] = s; origen[lente] = 'reintento'; }
});

const faltan = SLUGS.filter((slug) => !secciones[slug]);
if (faltan.length) {
  throw new Error(
    'LENTE_SIN_SECCION · ' + faltan.join(', ') + ' · la red triple no pudo recuperar su sección ' +
    '(HTTP falló · no había fila en la base · el reintento tampoco). Se PARA a propósito: ' +
    'seguir entregaría campos VACÍOS disfrazados de "la lente no dijo nada" y anularía el eje del gate.' +
    ' · origen de las recuperadas: ' + JSON.stringify(origen)
  );
}
console.log('[rescate] origen por lente · ' + JSON.stringify(origen));
return [{ json: { secciones, origen, _rescate_ok: true } }];
