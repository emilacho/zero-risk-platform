/**
 * 04-nov · «cada llamada guarda de qué trabajo es» · lo que el PLAN (`X9F0zp6LQ2xGEYVS`) le manda a la PLATAFORMA para finanzas, mesa, mercado y jefatura.
 * Contrato de CC#1 (PR #886, LISTO 04-nov): finanzas → cuerpo de `avanzar`, en CADA llamada · mesa y mercado → raíz del sobre · jefatura → dentro de `payload` al abrir la revisión.
 * Tipo `plan` · id = `corrida_id` de «V9 · pre-vuelo» (#882). Vacío = «sin dato» en silencio (la expresión se atrapa). NO se aplica hasta que #886 esté publicada y certificada.
 */
import { cambiarCodigo, nodo } from './lib.mjs'
import { CORRIDA_ID_JS } from './trabajo-de-cada-llamada-plan.mjs'

const TRAB = "trabajo_tipo: 'plan', trabajo_id: " + CORRIDA_ID_JS

function sumarAlCuerpo(f, nombre, viejo, nuevo) {
  const p = nodo(f, nombre).parameters
  const j = p.jsonBody
  if (typeof j !== 'string' || j.split(viejo).length !== 2) throw new Error(`«${nombre}»: el cuerpo no tiene la forma esperada`)
  if (/trabajo_tipo/.test(j)) throw new Error(`«${nombre}» ya manda el trabajo`)
  p.jsonBody = j.replace(viejo, () => nuevo)
}

export function construirTrabajoDeCadaLlamadaPlanPlataforma(f) {
  sumarAlCuerpo(f, 'FIN · avanzar un paso', "accion: 'avanzar',", "accion: 'avanzar', " + TRAB + ",")
  sumarAlCuerpo(f, 'Mesa de análisis', 'brazo: "analisis",', 'brazo: "analisis", ' + TRAB + ',')
  sumarAlCuerpo(f, 'Brazo · mercado', 'brazo: "mercado",', 'brazo: "mercado", ' + TRAB + ',')
  cambiarCodigo(f, 'JEF · armar', '  payload: {\n    texto: String(v.texto),', '  payload: {\n    trabajo_tipo: \'plan\', trabajo_id: ' + CORRIDA_ID_JS + ',\n    texto: String(v.texto),')
}
