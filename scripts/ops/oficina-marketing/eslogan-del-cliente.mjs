/**
 * 02-nov · ADENDA 3 del equipo del manual (Emilio: «eso es darle regla dura… no truncar la creatividad con reglas duras») · LA FRASE QUE EL CLIENTE USA ES CONTEXTO, no un hecho obligatorio.
 * REEMPLAZA lo que esta pieza hacía desde el 01-nov (f86df96, certificado, NO publicado):
 *   · PLANEACIÓN (`X9F0zp6LQ2xGEYVS` · «Redactor (B4)»): si `contexto_del_cliente.eslogan = {texto, fuente}` trae texto, el pedido lleva un bloque «UNA FRASE QUE EL CLIENTE USA (contexto)»
 *     con su fuente. Sin obligación: el redactor la usa, la adapta o propone otra mejor, libremente; sus propuestas son aporte creativo y no se justifican. Si la fuente es el DUEÑO, eso sí manda
 *     (palabra del dueño) y aun así puede sugerir variantes como propuesta. Ya no se copia la `regla` que mande la plataforma (era una regla dura). Sin eslogan, el pedido queda IDÉNTICO a hoy, byte por byte.
 *   · MANUAL (`ssLtwYPt7zxuvnM2`): el código YA NO escribe `tagline` ni lo marca como 'hecho'. La frase propia hallada sigue llegando a las lentes como contexto (rotulada «frase propia del cliente», desde el relevo 62):
 *     solo si es realmente evidente que es su eslogan (p. ej. aparece como tal junto al nombre del negocio) el agente del manual puede rotularla «eslogan actual» y decir por qué. Cliente sin eslogan: no pasa nada.
 * El texto pasa por `limpio` (personas protegidas).
 */
import { cambiarCodigo } from './lib.mjs'

const B4_ANCLA_PEDIDO = "const pedido = [\n'Eres el redactor de planes de campana de esta agencia."
const B4_BLOQUE = `// 02-nov · UNA FRASE QUE EL CLIENTE USA (contexto, sin obligación) · viene en contexto_del_cliente.eslogan = { texto, fuente }. Sin texto, el pedido queda idéntico a hoy.
const bloqueEslogan = (function () {
  const e = carpeta && carpeta.eslogan && typeof carpeta.eslogan === 'object' && !Array.isArray(carpeta.eslogan) ? carpeta.eslogan : null;
  const t = e ? String(e.texto == null ? '' : e.texto).replace(/\\s+/g, ' ').trim().slice(0, 300) : '';
  if (!t) return [];
  const fu = String(e.fuente == null ? '' : e.fuente).replace(/\\s+/g, ' ').trim().slice(0, 300);
  const delDueno = /due(ñ|n)o/i.test(fu);
  return [
    '══════ UNA FRASE QUE EL CLIENTE USA (contexto) ══════',
    '«' + limpio(t) + '»',
    'Fuente: ' + (fu || 'no declarada'),
    delDueno
      ? 'Esta frase la declaró el dueño: manda. Puedes sugerir variantes como propuesta, rotuladas como tales.'
      : 'Es contexto sobre cómo se presenta hoy el cliente, no una obligación: puedes usarla, adaptarla o proponer otra mejor, libremente. Tus propuestas son aporte creativo y no necesitan justificarse.',
    '',
  ];
})();
`
const B4_ANCLA_ARREGLO = '...bloqueDeRegistro(registroDelCliente),\n'
const B4_ARREGLO_NUEVO = '...bloqueDeRegistro(registroDelCliente),\n...bloqueEslogan,\n'

export function construirEsloganEnPlan(f) {
  cambiarCodigo(f, 'Redactor (B4)', B4_ANCLA_PEDIDO, B4_BLOQUE + B4_ANCLA_PEDIDO)
  cambiarCodigo(f, 'Redactor (B4)', B4_ANCLA_ARREGLO, B4_ARREGLO_NUEVO)
}
