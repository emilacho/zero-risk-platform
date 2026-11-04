/**
 * 04-nov · ADENDA 2 del GO «arreglos del plan» (aprobada por Emilio) · punto 10, lado n8n de CC#2: el sistema calcula el calendario del plan y el redactor lo recibe como DATO.
 * Contrato (LISTO de CC#1 «apertura, calendario y reunión»): el pre-vuelo devuelve `calendario: { arranque, termina, semanas: [{ semana, desde, hasta }] }` (12 semanas de 7 días) solo cuando el plan va a correr.
 *   · «V9 · decidir»: deja pasar `calendario` (objeto o null) igual que `material_viejo`.
 *   · «Redactor (B4)»: si el calendario es válido (fechas AAAA-MM-DD, semanas con número) escribe el bloque «EL CALENDARIO DEL PLAN» con la orden de usar esas fechas tal cual, y lo deja declarado en `calendario_usado`.
 *     Sin calendario, o con uno mal formado (pre-vuelo viejo, plan sin `plan_v3`): el pedido es EXACTAMENTE el de hoy (falla cerrado: nunca se inventa un calendario).
 * La comprobación de la jefatura contra este calendario es de CC#1 y Lenovo (por definir); aquí solo viaja el dato.
 */
import { cambiarCodigo as cambiarCodigoLF, nodo } from './lib.mjs'

/** como `cambiarCodigo`, pero respeta los saltos de línea del nodo (algunos del vivo vienen con CRLF) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const CRLF = String.fromCharCode(13, 10), LF = String.fromCharCode(10)
  const crlf = nodo(f, nombre).parameters.jsCode.includes(CRLF)
  const a = (t) => (crlf ? t.split(CRLF).join(LF).split(LF).join(CRLF) : t)
  cambiarCodigoLF(f, nombre, a(viejo), a(nuevo))
}

const N_DECIDIR = 'V9 · decidir'
const N_B4 = 'Redactor (B4)'

export const CODIGO_CALENDARIO = String.raw`// 04-nov · el calendario del plan lo calcula el sistema (pre-vuelo) y llega como dato; mal formado o ausente = no se escribe nada (el pedido es el de siempre)
const CAL = (function () {
  try {
    const c = $('V9 · decidir').first().json.calendario
    if (!c || typeof c !== 'object' || !Array.isArray(c.semanas) || c.semanas.length < 1 || c.semanas.length > 60) return null
    const F = /^\d{4}-\d{2}-\d{2}$/
    const ok = c.semanas.every(function (s) { return s && Number.isFinite(Number(s.semana)) && F.test(String(s.desde)) && F.test(String(s.hasta)) })
    if (!ok || !F.test(String(c.arranque)) || !F.test(String(c.termina))) return null
    return c
  } catch (e) { return null }
})();
const bloqueCalendario = CAL ? [
  '══════ EL CALENDARIO DEL PLAN (lo calcula el sistema; no lo cambies) ══════',
  'El plan arranca el ' + CAL.arranque + ' y termina el ' + CAL.termina + '. Estas son sus semanas:',
  ...CAL.semanas.map(function (s) { return 'Semana ' + s.semana + ': del ' + s.desde + ' al ' + s.hasta }),
  'Cuando el plan diga que pasa cada semana, usa EXACTAMENTE estas fechas. No inventes otras, no corras las semanas y no cambies el arranque.',
  '',
] : [];
`

export function construirCalendarioAlRedactor(f) {
  cambiarCodigo(f, N_DECIDIR, 'material_viejo: cuerpo.material_viejo === true,',
    "material_viejo: cuerpo.material_viejo === true, calendario: cuerpo.calendario && typeof cuerpo.calendario === 'object' && !Array.isArray(cuerpo.calendario) ? cuerpo.calendario : null,")
  cambiarCodigo(f, N_B4, "const pedido = [\n'Eres el redactor de planes de campana de esta agencia.", CODIGO_CALENDARIO + "const pedido = [\n'Eres el redactor de planes de campana de esta agencia.")
  cambiarCodigo(f, N_B4, "bloquePlata,\n'',\n'══════ REGLAS QUE NO SE NEGOCIAN ══════',", "bloquePlata,\n'',\n...bloqueCalendario,\n'══════ REGLAS QUE NO SE NEGOCIAN ══════',")
  cambiarCodigo(f, N_B4, '    claves_internas_quitadas_de_la_ficha: fichaSinInternos.quitadas,', "    ...(CAL ? { calendario_usado: { arranque: CAL.arranque, termina: CAL.termina, semanas: CAL.semanas.length } } : {}),\n    claves_internas_quitadas_de_la_ficha: fichaSinInternos.quitadas,")
}
