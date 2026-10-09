// ② ARMAR EL PEDIDO · CC#2 · 2026-10-09 · el cuerpo que se manda a /api/agents/run-sdk (el agente solo se invoca desde un flujo con workflow_id) o, en modo seco, la respuesta SIMULADA.
// 🔴 En modo seco NO se llama a ningún proveedor ni al corredor: la respuesta sale de un molde válido por esquema (el «modelo simulado»), igual que `simulacro_respuesta` de la pieza.
// 🔴 `force_restart: true` y `dispatch_key` propios del paso: una respuesta vieja guardada no se reutiliza (lección del flujo de prueba).
const e = $input.first().json
const t = e.turno
const p = t.pedido

// ── moldes del modelo simulado (válidos contra los esquemas de la oficina)
const indices = (task) => [...String(task).matchAll(/índice (\d+)/g)].map((m) => Number(m[1]))
const SIMULADOS = {
  'visual_direction.v1': () => ({ resumen: '(simulado) dirección visual', decision: { modo: 'generada', motivo: '(simulado)' }, reglas_de_imagen: { obligatorio: [], prohibido: [] } }),
  'prompts.v1': () => ({ prompts: [{ prompt: '(simulado) un plato visto desde arriba con luz natural lateral, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) cenital' }, { prompt: '(simulado) el mismo plato a nivel de mesa con fondo desenfocado, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) nivel de mesa' }] }),
  'observacion_imagen.v1': (task) => { const ix = indices(task); return { imagenes: ix.map((indice) => ({ indice, reglas: [], texto_visible: [], marcas: [], personas: 0 })), preferencia: ix } },
  'pieza_post.v1': () => ({ pie_de_foto: '(simulado) pie de foto de prueba', hashtags: [] }),
  'fichas.v1': () => ({ fichas: [] }),
  'resolucion.v1': () => ({ respuestas: [] }),
}

if (e.dry_run === true) {
  const molde = SIMULADOS[p.esquema]
  if (!molde) throw new Error('OFICINA_SIN_MOLDE_SIMULADO · no hay respuesta simulada para el esquema ' + JSON.stringify(p.esquema) + ' · se DETIENE')
  return [{ json: { ...e, simulado: true, resultado_body: { accion: 'resultado', encargo_id: e.encargo_id, n: t.n, texto: JSON.stringify(molde(p.task)), costo_usd: 0, workflow_execution_id: $execution.id } } }]
}

const cuerpo = {
  agent: p.agent_name,
  task: p.task,
  client_id: p.client_id,
  workflow_id: $workflow.id,
  workflow_execution_id: $execution.id,
  callback_url: $execution.resumeUrl,
  force_restart: true,
  dry_run: false,
  max_budget_usd: p.max_budget_usd,
  thinking_mode: p.thinking_mode || 'disabled',
  extra: { ...(p.extra || {}), dispatch_key: t.dispatch_key },
  ...(Array.isArray(p.images) && p.images.length ? { images: p.images, images_mode: 'base64' } : {}),
}
return [{ json: { ...e, simulado: false, cuerpo } }]
