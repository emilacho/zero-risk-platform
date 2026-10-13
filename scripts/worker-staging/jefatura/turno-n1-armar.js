// ② ARMAR EL PEDIDO · CC#2 · J4 · 2026-10-13 · el cuerpo que se manda a /api/agents/run-sdk (el agente solo se invoca desde un flujo con workflow_id) o, en modo seco, la respuesta SIMULADA.
// 🔴 En modo seco NO se llama a ningún proveedor ni al corredor: la respuesta sale de un molde válido por esquema (el «modelo simulado»), como en el turno de la oficina (r78).
// 🔴 Un esquema SIN molde no mata la ejecución ni la deja «corriendo»: devuelve un error VISIBLE al motor y la revisión cierra `fallida`.
// 🔴 `force_restart: true` y `dispatch_key` propios del paso: una respuesta vieja guardada no se reutiliza (lección del flujo de prueba).
// 🔴 Regla dura del editor (diseño v4 §2 y §9): `extra` lleva SOLO claves de una lista cerrada; JAMÁS `workflow_execution_id` (los ids de ejecución van arriba del cuerpo). Y el nodo «Agente» manda siempre `x-skip-editor-middleware: 1`.
// `pedido.simulacion` (solo con dry_run=true) fuerza ramas: fichas ninguna|sugerencia|bloquea · toma todo|nada · productor ok|formato_roto|formato_roto_siempre|muerto · version_nueva mejora|empeora|demasiado_corta · largo_a (largo del plan A) · donde.
const e = $input.first().json
const t = e.turno
const p = t.pedido

// ── lectura del propio pedido: las fichas («- [id] (gravedad) en …», como las arma la oficina) y los refs del kit / carrusel / imágenes
const idsDeFichas = (task) => [...String(task).matchAll(/^- \[([^\]\n]+)\] \((?:bloquea|sugerencia)\)/gm)].map((m) => m[1])
const indices = (task) => [...String(task).matchAll(/índice (\d+)/g)].map((m) => Number(m[1]))
const refsDeKit = (task) => [...String(task).matchAll(/^- (e\d+):/gm)].map((m) => m[1])
const refsDe = (task) => { const kit = refsDeKit(task); if (kit.length) return kit; const m = /Roles de lámina posibles[^:\n]*:\s*([^\n]+)/.exec(String(task)); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [] }
const refsAGenerar = (task) => { const i = String(task).search(/## Imágenes que hay que GENERAR/); if (i < 0) return []; const sec = String(task).slice(i).split(/\n## /)[0]; return [...sec.matchAll(/^- ([^:\n]+):/gm)].map((m) => m[1].trim()) }
const sim = e.dry_run === true && p.simulacion && typeof p.simulacion === 'object' ? p.simulacion : {}
const toma = sim.toma === 'nada' ? 'nada' : 'todo'
const respuestasDe = (task) => idsDeFichas(task).map((id) => (toma === 'nada' ? { id, estado: 'no_tomada', razon: '(simulado) no lo tomo' } : { id, estado: 'tomada', razon: '(simulado) lo tomo' }))
const algunaTomada = (rs) => rs.some((r) => r.estado === 'tomada')
// el plan simulado: tres largos según el caso (la comparación contra A la hace el código de la planeación; aquí solo se fabrica el texto)
const textoDePlan = () => {
  const a = Number.isFinite(Number(sim.largo_a)) && Number(sim.largo_a) > 0 ? Number(sim.largo_a) : 25000
  const objetivo = sim.version_nueva === 'demasiado_corta' ? Math.floor(a * 0.3) : a
  const marca = sim.version_nueva === 'empeora' ? ' A calcular · TBD ·' : ''
  const base = '(simulado) línea del plan corregido.' + marca + '\n'
  return base.repeat(Math.ceil(objetivo / base.length)).slice(0, objetivo)
}

// ── moldes del modelo simulado: UNO por esquema que la jefatura puede pedir (los de la oficina, que la jefatura reutiliza, y los nuevos de re-entrega por tipo)
const SIMULADOS = {
  // jefe-marketing
  'fichas.v1': () => ({ fichas: sim.fichas === 'bloquea' || sim.fichas === 'sugerencia' ? [{ que: '(simulado) hallazgo de prueba', donde: String(sim.donde || 'texto'), contra_que: '(simulado) el manual', gravedad: sim.fichas, propuesta: '(simulado) propuesta de prueba' }] : [] }),
  // pieza (oficina): resoluciones por dueño
  'resolucion.v1': (task) => { const rs = respuestasDe(task); return { respuestas: rs, ...(algunaTomada(rs) ? { pieza: { pie_de_foto: '(simulado) pie de foto corregido', hashtags: [] } } : {}) } },
  'resolucion_solo.v1': (task) => ({ respuestas: respuestasDe(task) }),
  'resolucion_copy_base.v1': (task) => ({ respuestas: respuestasDe(task) }),
  'resolucion_copy_kit.v1': (task) => ({ respuestas: respuestasDe(task) }),
  'resolucion_estructura.v1': (task) => ({ respuestas: respuestasDe(task) }),
  'resolucion_laminas.v1': (task) => ({ respuestas: respuestasDe(task) }),
  // estrategia (objeto completo), calendario (por fila o tanda) y plan (texto completo): la re-entrega de cada tipo
  'resolucion_objeto.v1': (task) => { const rs = respuestasDe(task); return { respuestas: rs, ...(algunaTomada(rs) ? { objeto: { simulado: true } } : {}) } },
  'resolucion_parcial.v1': (task) => { const rs = respuestasDe(task); return { respuestas: rs, ...(algunaTomada(rs) ? { filas: [] } : {}) } },
  // 🔴 el FORMATO real del texto largo del plan (bloque delimitado o esquema ≥ 40.000) lo decide la condición 1 de CC#3 (§13.5); este molde es lo único que cambia cuando se decida
  'resolucion_plan.v1': (task) => { const rs = respuestasDe(task); return { respuestas: rs, ...(algunaTomada(rs) ? { texto_completo: textoDePlan() } : {}) } },
  // 🔴 EL PLAN REAL (condición 1 de CC#3): texto plano + bloque de resolución al final (no un JSON con 25–34 mil caracteres adentro). Si no se tomó nada, solo el bloque.
  'plan_texto_y_resolucion.v1': (task) => { const rs = respuestasDe(task); const bloque = '<<<RESOLUCION>>>' + String.fromCharCode(10) + JSON.stringify({ respuestas: rs }) + String.fromCharCode(10) + '<<<FIN_RESOLUCION>>>'; return algunaTomada(rs) ? textoDePlan() + String.fromCharCode(10) + bloque : bloque },
  // oficina: pasos de producción que la jefatura NO ejecuta pero cuyos moldes se conservan idénticos para la prueba de igualdad (§13.3)
  'visual_direction.v1': () => ({ resumen: '(simulado) dirección visual', decision: { modo: 'generada', motivo: '(simulado)' }, reglas_de_imagen: { obligatorio: [], prohibido: [] } }),
  'prompts.v1': () => ({ prompts: [{ prompt: '(simulado) un plato visto desde arriba con luz natural lateral, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) cenital' }, { prompt: '(simulado) el mismo plato a nivel de mesa con fondo desenfocado, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) nivel de mesa' }] }),
  'observacion_imagen.v1': (task) => { const ix = indices(task); return { imagenes: ix.map((indice) => ({ indice, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 })), preferencia: ix } },
  'observacion_imagenes.v1': (task) => { const ix = indices(task); return { imagenes: ix.map((indice) => ({ indice, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 })), preferencia: ix } },
  'pieza_post.v1': () => ({ pie_de_foto: '(simulado) pie de foto de prueba', hashtags: [] }),
  'direccion_imagenes.v1': (task) => { const refs = refsDe(task); return { resumen: '(simulado) dirección visual', estilo: '(simulado)', imagenes: refs.length ? [{ ref: refs[0], modo: 'generada', motivo: '(simulado)' }] : [], reglas_de_imagen: { obligatorio: [], prohibido: [] } } },
  'prompts_por_ref.v1': (task) => ({ imagenes: refsAGenerar(task).map((ref) => ({ ref, prompts: [{ prompt: '(simulado) un plato visto desde arriba con luz natural lateral, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) cenital' }, { prompt: '(simulado) el mismo plato a nivel de mesa con fondo desenfocado, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) nivel de mesa' }] })) }),
  'copy_base.v1': () => ({ texto_base: 'Primera línea simulada\nSegunda línea simulada\nTercera línea simulada\nCuarta línea simulada\nEscríbenos', pie_de_foto: '(simulado) pie de foto de prueba', hashtags: [] }),
  'laminas.v1': () => ({ laminas: [{ rol: 'hook', headline: 'Primera línea simulada' }, { rol: 'problem', headline: 'Segunda línea simulada' }, { rol: 'reframe', headline: 'Tercera línea simulada' }, { rol: 'benefit', headline: 'Cuarta línea simulada' }, { rol: 'cta', headline: 'Escríbenos', cta: 'Escríbenos' }] }),
  'estructura.v1': (task) => ({ elementos: refsDeKit(task).map((ref) => ({ ref, rol: '(simulado) rol', beat: '(simulado) beat', mood: '(simulado) mood' })) }),
  'copy_kit.v1': (task) => ({ elementos: refsDeKit(task).map((ref) => ({ ref, headline: '(simulado) titular' })) }),
}

const ERROR = (msg) => ({ ...e, simulado: true, resultado_body: { accion: 'resultado', revision_id: e.revision_id, n: t.n, error: msg, costo_usd: 0, workflow_execution_id: $execution.id } })

if (e.dry_run === true) {
  const molde = SIMULADOS[p.esquema]
  // un esquema sin molde NO mata la ejecución (la revisión se quedaría «corriendo» en silencio): el motor recibe el error y la revisión falla visible
  if (!molde) return [{ json: ERROR('JEFATURA_SIN_MOLDE_SIMULADO · no hay respuesta simulada para el esquema ' + JSON.stringify(p.esquema)) }]
  // productor muerto: no contesta nunca (el vigía lo re-arma a los 12 min); en el seco la ejecución termina sin registrar nada, a propósito
  if (sim.productor === 'muerto') return []
  const roto = sim.productor === 'formato_roto_siempre' || (sim.productor === 'formato_roto' && p.reintento_formato !== true)
  const m = roto ? null : molde(p.task)
  const texto = roto ? '{"respuestas": [ {"id": ' : (typeof m === 'string' ? m : JSON.stringify(m)) // un molde de TEXTO (el plan) devuelve la cadena tal cual
  return [{ json: { ...e, simulado: true, resultado_body: { accion: 'resultado', revision_id: e.revision_id, n: t.n, texto, costo_usd: 0, workflow_execution_id: $execution.id } } }]
}

// ── real: el pedido a run-sdk. Sin tope de gasto del paso NO se paga (el SDK acota el costo con max_budget_usd)
if (!(typeof p.max_budget_usd === 'number' && p.max_budget_usd > 0)) throw new Error('JEFATURA_SIN_TOPE_DEL_PASO · el pedido real no trae max_budget_usd (> 0) · no se paga un paso sin tope · se DETIENE')
const PERMITIDAS = ['indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id', 'dispatch_key']
const extra = {}
for (const k of PERMITIDAS) if (p.extra && p.extra[k] !== undefined) extra[k] = p.extra[k]
extra.dispatch_key = t.dispatch_key
const cuerpo = {
  agent: p.agent_name,
  task: p.task,
  client_id: p.client_id,
  workflow_id: $workflow.id,
  workflow_execution_id: $execution.id,
  callback_url: $execution.resumeUrl,
  // la vuelta la entrega el corredor cuando el agente puede; si no puede, run-sdk lo ignora y la vuelta sigue por Vercel con la recuperación del resultado
  callback_mode: 'runner',
  force_restart: true,
  dry_run: false,
  max_budget_usd: p.max_budget_usd,
  thinking_mode: p.thinking_mode || 'disabled',
  extra,
  ...(Array.isArray(p.images) && p.images.length ? { images: p.images, images_mode: 'base64' } : {}),
}
return [{ json: { ...e, simulado: false, cuerpo } }]
