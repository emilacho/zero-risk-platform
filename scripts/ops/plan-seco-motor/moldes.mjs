/**
 * Las respuestas simuladas de los agentes del doble chequeo, por paso (contratos: `planeacion/mesa/acta.ts`, `finanzas/conversa/esquemas.ts`). No son contenido: solo forma válida, para que el flujo corra.
 * El escenario (variable SECO_ESCENARIO) decide las ramas: `no_viable` hace que la primera pasada de finanzas devuelva a la mesa, `pregunta` hace que la pausa se abra.
 */
import fs from 'node:fs'

const ESC = process.env.SECO_ESCENARIO_JSON ? JSON.parse(process.env.SECO_ESCENARIO_JSON) : {}
const planFijo = process.env.SECO_PLAN_FIJO && fs.existsSync(process.env.SECO_PLAN_FIJO) ? fs.readFileSync(process.env.SECO_PLAN_FIJO, 'utf8') : null

const j = (o) => JSON.stringify(o)
const APORTE = (agente) => j({ agente, resumen: `(simulado) lectura de ${agente}`, recomendaciones: [{ que: '(simulado) priorizar el canal principal', razon: '(simulado) es lo que el dato sugiere' }], costo_por_resultado: { min: 1, max: 3, base: 2 }, alertas: [] })
const CANALES = [{ canal: 'Instagram', peso: 0.6, razon: '(simulado) canal principal' }, { canal: 'Google Maps', peso: 0.4, razon: '(simulado) búsqueda local' }]
const ACTA = { esquema: 'acta.v1', numero: { meta: 40, por_que: '(simulado) meta de la mesa' }, servicio: '(simulado) servicio', audiencia: '(simulado) audiencia', oferta: '(simulado) oferta', canales: CANALES, camino: '(simulado) camino', prueba: '(simulado) prueba', no_se_hace: [{ que: 'TikTok', por_que: '(simulado) no aplica ahora' }], no_se: [] }
const PLANTEO_MESA = { objetivo: '(simulado)', tesis: '(simulado)', audiencia: '(simulado)', oferta: '(simulado)', canales: CANALES.map((c) => ({ canal: c.canal, activo: true })), habla: { busqueda: true, seo: true, organico: true } }
const PLANTEO_FIN = { meta_por_semana: 40, zonas: ['(simulado)'], dias_y_horarios: { dias_activos_por_semana: 6 }, evento: 'pedido', canales: [{ canal: 'meta_ig', peso: 0.6 }, { canal: 'google_search', peso: 0.4 }], no_se: [] }
let consultas = 0, cierres = 0, consolidas = 0
const CONSULTA = (agente) => j({ agente, resumen: `(simulado) ${agente}`, supuestos: { ticket: { min: 8, max: 15, base: 11 }, margen: { min: 0.3, max: 0.5, base: 0.4 }, costo_por_resultado: ESC.no_viable && (++consultas <= (ESC.no_viable_pasadas ?? 99)) ? { min: 40, max: 90, base: 70 } : { min: 1, max: 3, base: 2 } }, preguntas_a_otros: [], alertas: [] })
const ACUERDO = (pregunta) => j({ salida: 'sale', hallazgos: pregunta ? [{ severidad: 'critico', que: '(simulado) falta el presupuesto', alude: 'plan', estado: 'abierto' }] : [], conflictos_resueltos: [], preguntas_a_emilio: pregunta ? [{ clave: 'seco_pregunta', texto: '(simulado) ¿cuál es el presupuesto?', recomendacion: '(simulado) 500', supuesto_si_no_responde: '(simulado) 500', impacto: 'alto', frena_la_firma: true }] : [] })
const PLAN_LARGO = () => planFijo ?? ['# Plan de 90 días (simulado)', '', '## Lo que no hacemos', '- TikTok', '', ...Array.from({ length: 400 }, (_, i) => `Línea ${i + 1} de relleno simulado del plan para alcanzar el mínimo de caracteres que pide la validación.`)].join('\n')

// Los moldes de la jefatura, por esquema (los mismos de src/lib/jefatura/revision/simulacion.ts). El escenario `fichas` ('sugerencia' | 'bloquea') hace que el revisor encuentre algo y el resto corrija.
const MARCA_I = '<<<RESOLUCION>>>'
const MARCA_F = '<<<FIN_RESOLUCION>>>'
function jefatura(c) {
  const task = String(c.task || '')
  const ids = [...task.matchAll(/^- \[([^\]\n]+)\] \((?:bloquea|sugerencia)\)/gm)].map((m) => m[1])
  const respuestas = ids.map((id) => ({ id, estado: 'tomada', razon: '(simulado) tomado' }))
  if (task.includes('{"fichas":[')) return ESC.fichas ? j({ fichas: [{ que: '(simulado) hallazgo de fondo', donde: 'plan', contra_que: 'el manual vigente (simulado)', gravedad: ESC.fichas, propuesta: '(simulado) ajustar esa parte' }] }) : '{"fichas":[]}'
  if (task.includes(MARCA_I)) return `${PLAN_LARGO()}\n\n(simulado) versión corregida\n${MARCA_I}\n${j({ respuestas })}\n${MARCA_F}`
  if (/"filas"/.test(task)) return j({ filas: [] })
  return j({ respuestas })
}

export async function responder(c, ctx) {
  const paso = String(c.paso || c.step_name || '')
  const ag = String(c.agent || '')
  const intento = ctx.intento
  if (paso === 'mesa-estrategia-jefe-marketing') return j(PLANTEO_MESA)
  if (paso === 'mesa-estrategia-consolida' || /consolida/.test(paso)) { consolidas++; const m = consolidas === 1 ? ESC.acta_meta : ESC.acta_meta_2 ?? ESC.acta_meta; return ESC.formato_roto === 'consolida' ? '(simulado) texto sin JSON' : j(m ? { ...ACTA, numero: { ...ACTA.numero, meta: m } } : ACTA) }
  if (paso.startsWith('mesa-estrategia-')) return ESC.formato_roto === paso ? '(simulado) texto sin JSON' : APORTE(ag)
  if (paso === 'planteo' || paso === 'ajuste' || paso === 'ajuste_2') return j(PLANTEO_FIN)
  if (paso.startsWith('consulta') || ['fpa', 'redes', 'busqueda', 'medicion'].includes(paso)) return ESC.formato_roto === paso && intento <= (ESC.formato_roto_veces ?? 2) ? '(simulado) texto sin JSON' : CONSULTA(ag)
  if (paso === 'cierre' || paso === 'cierre_2') { cierres++; return ESC.formato_roto === paso ? '(simulado) texto sin JSON' : ACUERDO((ESC.pregunta === true && intento === 1) || ESC.pregunta_en_cierre === cierres) }
  if (c.extra && c.extra.revision_id) return jefatura(c)
  if (ag === 'jefe-marketing' && c.callback_url) return PLAN_LARGO()
  return `(simulado) ${ag} ${paso}`
}

export const rutas = {
  '/drive': async () => ({ status: 200, cuerpo: { ok: true, simulado: true, file_id: 'seco', url: 'https://drive.invalid/seco' } }),
  '/openai/v1/responses': async () => { if (ESC.demora_gpt_s) await new Promise((r) => setTimeout(r, ESC.demora_gpt_s * 1000)); return ESC.gpt_status ? { status: ESC.gpt_status, cuerpo: { error: { message: 'simulado' } } } : { status: 200, cuerpo: { output_text: '(simulado) Lectura independiente: opinión simulada para el doble chequeo.', usage: { input_tokens: 1000, output_tokens: 200 } } } },
  '/openai/v1/embeddings': async () => ({ status: 200, cuerpo: { data: [{ embedding: new Array(1536).fill(0.001) }], usage: { total_tokens: 1 } } }),
  '/slack/chat.postMessage': async () => ({ status: 200, cuerpo: { ok: true, ts: '0.0', simulado: true } }),
  '/slack': async () => ({ status: 200, cuerpo: { ok: true, ts: '0.0', simulado: true } }),
  '/api/sala/callback': async () => ({ status: 200, cuerpo: { ok: true, simulado: true } }),
  '/api/sala/intake': async () => ({ status: 200, cuerpo: { ok: true, simulado: true } }),
}
