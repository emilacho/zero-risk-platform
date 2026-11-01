/**
 * 01-nov · ADENDA 3 (punto 11) · UNA SOLA FUENTE de los datos del negocio · parte n8n de CC2 (PLAN-CC2-una-sola-fuente… + LISTO-CC1-para-certificar-una-sola-fuente, #823).
 * Brief `PQdIgbuFexuBsoh8`, parte por filas `BNXqlaX1oHSfZIpF` y pieza `lVCLzxQCKNkd3uS0` dejan de depender de la prosa del manual y del plan para sedes, hechos del dueño, eslogan y activos de solo lectura:
 * un nodo nuevo «② Leer los datos del negocio» llama a `POST /api/cliente/datos-del-negocio {client_id}` (llave interna) y el armado del pedido imprime, con el MISMO código ya certificado en planeación, los bloques de
 * hechos del dueño y de sedes, más dos nuevos: ACTIVOS QUE LA AGENCIA NO TOCA y lo que FALTA / NO SE PUDO LEER (nunca se adivina).
 *   · 200  ⇒ bloques completos. 502 (lectura parcial) ⇒ lo que se pudo leer + aviso con los fallos. Cualquier otra cosa (error de red, 401, 500, cuerpo ilegible) ⇒ NO hay bloques de datos y el pedido lo dice:
 *     «no se pudieron leer los datos del negocio: no inventes sedes, horarios, precios, eslogan ni hechos; decláralos como hueco». Un error de lectura jamás se lee como «no hay datos».
 *   · El eslogan lo imprime el bloque de la parte 4 (eslogan-brief-y-pieza.mjs), que ahora prefiere el de la fuente (resuelto: el del dueño gana) y cae a la columna `tagline` solo si la fuente no respondió.
 *   · La jerarquía del pedido: lo que dicen estos bloques (dueño > fuente única) gana a lo que diga la prosa del plan o del manual cuando choquen; el choque se declara.
 * La pieza conserva su recolector de sedes aparte («⑤ Sedes y voz»; es el que arma los datos de contacto de cada pieza): este bloque se SUMA, no lo reemplaza. Declarado.
 */
import { agregarNodo, cambiarCodigo, conectar, nodo } from './lib.mjs'
import { BLOQUE_HECHOS } from './hechos-del-dueno.mjs'
import { BLOQUE_SEDES } from './sedes-del-cliente.mjs'

export const NODO_DATOS = '② Leer los datos del negocio'
const SOBRE = '⓪ Sobre · llave · modo seco'
const URL_DATOS = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') }}/api/cliente/datos-del-negocio"

const ANCLA_ESLOGAN = '// 01-nov · EL ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE) · viene de client_brand_books.tagline.'

const BLOQUE_NEGOCIO = `// 01-nov · UNA SOLA FUENTE · los datos del negocio vienen de POST /api/cliente/datos-del-negocio (nodo «${NODO_DATOS}»). Nada de esto se adivina: lo que falta o no se pudo leer se dice.
const _lecturaNegocio = (function () { try { return $('${NODO_DATOS}').first().json || {} } catch (e) { return null } })();
const _datosNegocio = (function () {
  if (_lecturaNegocio === null) return null; // el flujo no trae el nodo (no debería pasar): pedido idéntico al de antes
  const st = Number(_lecturaNegocio.statusCode);
  const b = _lecturaNegocio.body && typeof _lecturaNegocio.body === 'object' && !Array.isArray(_lecturaNegocio.body) ? _lecturaNegocio.body : null;
  if (b && (st === 200 || st === 502) && !_lecturaNegocio.error) return b;
  return false; // la lectura falló: se dice, no se interpreta como «sin datos»
})();
const carpeta = _datosNegocio || {};
const limpio = typeof limpiar === 'function' ? limpiar : function (t) { return t };
${BLOQUE_HECHOS}
${BLOQUE_SEDES}
const bloquesDelNegocio = (function () {
  if (_datosNegocio === null) return [];
  const una = function (v, tope) { return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, tope); };
  if (_datosNegocio === false) {
    return [
      '══════ DATOS DEL NEGOCIO · NO SE PUDIERON LEER ══════',
      'La lectura de los datos del negocio (sedes, hechos del dueño, eslogan, activos de solo lectura) FALLÓ. No inventes sedes, horarios, precios, eslogan ni hechos del dueño: decláralos como hueco.',
      '',
    ];
  }
  const activos = (Array.isArray(_datosNegocio.activos_solo_lectura) ? _datosNegocio.activos_solo_lectura : []).map(function (x) { return una(x, 120); }).filter(Boolean).slice(0, 10);
  const falta = (Array.isArray(_datosNegocio.sin_dato) ? _datosNegocio.sin_dato : []).map(function (x) { return una(x, 120); }).filter(Boolean).slice(0, 10);
  const fallos = (Array.isArray(_datosNegocio.fallos) ? _datosNegocio.fallos : []).map(function (x) { return una(x, 160); }).filter(Boolean).slice(0, 6);
  return [
    ...bloqueHechosDelDueno,
    ...bloqueSedes,
    ...(activos.length ? ['══════ ACTIVOS DEL CLIENTE QUE LA AGENCIA NO TOCA (solo lectura) ══════', activos.map(function (x) { return '- ' + limpio(x); }).join('\\n'), 'REGLA: no propongas editarlos ni cambiarles nada (ni su texto, ni su horario, ni instalarles nada sin permiso). Si hace falta un cambio ahí, plantéalo como PEDIDO al dueño.', ''] : []),
    ...(falta.length ? ['══════ LO QUE FALTA EN LOS DATOS DEL NEGOCIO ══════', falta.map(function (x) { return '- ' + limpio(x); }).join('\\n'), 'REGLA: no lo inventes. Decláralo como hueco nombrado.', ''] : []),
    ...(fallos.length ? ['══════ DATOS DEL NEGOCIO · LECTURA PARCIAL ══════', 'No se pudo leer: ' + fallos.map(function (x) { return limpio(x); }).join(' · ') + '. Lo de esas partes no está arriba: no lo inventes, decláralo como hueco.', ''] : []),
  ];
})();
`

const USO_BRIEF_VIEJO = '  ...bloqueEslogan,\n'
const USO_BRIEF_NUEVO = '  ...bloqueEslogan,\n  ...bloquesDelNegocio,\n'
const USO_PIEZA_VIEJO = "'', ...bloqueEslogan, '════════ EL BRIEF ════════'"
const USO_PIEZA_NUEVO = "'', ...bloqueEslogan, ...bloquesDelNegocio, '════════ EL BRIEF ════════'"

function agregarNodoDeLectura(f, { despuesDe }) {
  const base = nodo(f, despuesDe)
  const def = {
    name: NODO_DATOS,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: URL_DATOS,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ client_id: $('" + SOBRE + "').first().json.client_id }) }}",
      options: { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }
  agregarNodo(f, def, despuesDe, 220, 120)
  // entre «despuesDe» y lo que le seguía
  const sig = f.connections[despuesDe]?.main?.[0]
  if (!sig || sig.length !== 1) throw new Error(`«${despuesDe}» no tiene exactamente un siguiente nodo`)
  const destino = sig[0].node
  sig[0].node = NODO_DATOS
  conectar(f, NODO_DATOS, destino)
  void base
}

/** modo: 'brief' (brief y parte por filas: mismo código de armado) | 'pieza' */
export function construirDatosDelNegocio(f, { guardaManual, armar, modo }) {
  agregarNodoDeLectura(f, { despuesDe: guardaManual })
  cambiarCodigo(f, armar, ANCLA_ESLOGAN, BLOQUE_NEGOCIO + ANCLA_ESLOGAN)
  if (modo === 'pieza') cambiarCodigo(f, armar, USO_PIEZA_VIEJO, USO_PIEZA_NUEVO)
  else cambiarCodigo(f, armar, USO_BRIEF_VIEJO, USO_BRIEF_NUEVO)
}
