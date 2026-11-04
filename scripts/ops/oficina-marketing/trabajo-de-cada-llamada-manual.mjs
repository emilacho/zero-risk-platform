/**
 * 04-nov · ENCARGO Lenovo «cada llamada a un empleado guarda de qué trabajo es» (firma Emilio 11:14Z) · parte de CC#2, FLUJO DEL MANUAL (`ssLtwYPt7zxuvnM2`).
 * Contrato de CC#1 (PR #878, publicado): `trabajo_tipo` · `trabajo_id` · `paso` (cuerpo, `context` o cabeceras `x-zr-trabajo-tipo` / `x-zr-trabajo-id` / `x-zr-paso`).
 * Tipo e id van juntos (si falta uno no se guarda ninguno); vacío cuenta como «no enviado» sin avisar → cada valor lleva respaldo a '' y NUNCA frena la llamada.
 *
 *   · el manual dentro de un PEDIDO de cambios      → `pedido` · id = `reescritura.manual_cambio_id` (= `plan_cambios.id`)
 *   · el manual dentro del ALTA (sin `reescritura`)  → `alta`   · id = `_journey_id` del sobre del alta (si el sobre no lo trae: «sin dato», no se inventa)
 *   · `paso` = el nombre del tramo (no toca `step_name`: ese decide la clave de lo guardado y lo que lee el empleado).
 *
 * Qué se toca (solo se AGREGAN datos; ningún otro texto ni conexión cambia):
 *   · 7 nodos HTTP con cuerpo propio (3 lentes, juez, voz otra vez, voz revisión, estilo): tres cabeceras nuevas con expresión.
 *   · 10 nodos de código del Equipo (preparar y recoger): el cuerpo de cada llamada lleva los tres campos (los 5 HTTP «llamar» envían ese cuerpo tal cual).
 *   · el piso visual (código, llamada directa): los tres campos en su cuerpo.
 */
import { cambiarCodigo, nodo } from './lib.mjs'

const V = "$('Validate Deal Data').first().json"
// una expresión que lanza haría FALLAR el nodo: cada una se atrapa y devuelve '' («sin dato»)
const R = `const r = ${V}.reescritura`
export const EXPR_TIPO = `={{ (() => { try { ${R}; return r ? 'pedido' : 'alta'; } catch (e) { return ''; } })() }}`
export const EXPR_ID = `={{ (() => { try { ${R}; return String(r ? (r.manual_cambio_id || '') : (${V}._journey_id || '')); } catch (e) { return ''; } })() }}`

const HTTP = [
  ['Lente · brand-strategist', 'lente-brand-strategist'],
  ['Lente · editor-en-jefe', 'lente-editor-en-jefe'],
  ['Lente · jefe-client-success', 'lente-jefe-client-success'],
  ['[BB] Judge · run-sdk', 'juez-de-fidelidad'],
  ['[BB] Uso · pedir la voz otra vez (editor-en-jefe)', 'voz-otra-vez'],
  ['[BB] Voz · revisión (editor-en-jefe)', 'voz-revision'],
  ['[BB] Estilo · revisión (style-consistency-reviewer)', 'estilo-revision'],
]

const BASES = ['aportes de los dueños', 'mesa creativa', 'integración', 'logo y tipografía', 'el juez anota datos duros sin fuente']
const EQUIPO = BASES.flatMap((b) => ['[BB] Equipo · ' + b + ' · preparar', '[BB] Equipo · ' + b])

/** el trabajo de esta corrida, en código (mismo criterio que las expresiones de arriba) */
export const TRAB_JS = [
  'const TRAB = (() => { try {',
  "  const v = $('Validate Deal Data').first().json, r = v.reescritura;",
  "  return r ? { tipo: 'pedido', id: String(r.manual_cambio_id || '') } : { tipo: 'alta', id: String(v._journey_id || '') };",
  "} catch (e) { return { tipo: '', id: '' }; } })();",
].join('\n')

export function construirTrabajoDeCadaLlamadaManual(f) {
  for (const [nombre, paso] of HTTP) {
    const p = nodo(f, nombre).parameters
    const hp = (p.headerParameters && p.headerParameters.parameters) || []
    if (hp.some((h) => /^x-zr-trabajo/.test(h.name))) throw new Error(`«${nombre}» ya lleva las cabeceras del trabajo`)
    p.sendHeaders = true
    p.headerParameters = { parameters: [...hp, { name: 'x-zr-trabajo-tipo', value: EXPR_TIPO }, { name: 'x-zr-trabajo-id', value: EXPR_ID }, { name: 'x-zr-paso', value: paso }] }
  }

  for (const nombre of EQUIPO) {
    cambiarCodigo(f, nombre, 'const llamar = async (agente, paso, tarea, rol, div) => {', TRAB_JS + '\nconst llamar = async (agente, paso, tarea, rol, div) => {')
    cambiarCodigo(f, nombre, 'step_name: paso, task: String(tarea)', 'step_name: paso, trabajo_tipo: TRAB.tipo, trabajo_id: TRAB.id, paso: paso, task: String(tarea)')
  }

  const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
  cambiarCodigo(f, PISO, "step_name: 'bb-visual-piso',", "step_name: 'bb-visual-piso',\n        paso: 'piso-visual',\n        ...(function () { try { const v = $('Validate Deal Data').first().json, r = v.reescritura; return r ? { trabajo_tipo: 'pedido', trabajo_id: String(r.manual_cambio_id || '') } : { trabajo_tipo: 'alta', trabajo_id: String(v._journey_id || '') }; } catch (e) { return {}; } })(),")
}
