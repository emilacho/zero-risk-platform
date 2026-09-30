// ③ ARMAR EL CUERPO DEL REDACTOR · CC#1 · 2026-09-29 · encargo Lenovo §1.2 ③ + §1.3.
// Un solo agente (`campaign-brief-agent`) produce la lista de entregables Y el brief de cada uno.
// 🔴 MODO SECO DE VERDAD: `dry_run` viaja en el CUERPO que se manda a /api/agents/run-sdk (campo `cuerpo.dry_run`).
// El nodo HTTP siguiente manda EXACTAMENTE `JSON.stringify(cuerpo)`, así que lo enviado queda visible como la salida de
// ESTE nodo en la corrida. En seco el corredor contesta con su respuesta canónica sin llamar al modelo (US$ 0).
// `force_restart:true` es obligatorio: sin él el corredor sirve un punto de control guardado (vuelve en 0,7 s sin haber corrido).
const prev = $('② ¿Ya hay parte de este plan? · guarda').first().json
let ficha = {}
try { const f = $input.first().json; ficha = Array.isArray(f) ? f[0] || {} : f || {} } catch (e) { ficha = {} }
const nombre = String(ficha.name || ficha.client_name || 'cliente')

const REFERENCIA = __REFERENCIA__

const REGLAS = [
  'Eres el planificador que BAJA un plan de marketing a TRABAJO. Vas a producir un PARTE DE TRABAJO para el cliente «' + nombre + '»: la lista CERRADA de entregables del plan, cada uno con su brief.',
  '',
  '## Reglas que no se negocian',
  '1. La unidad es el ENTREGABLE DE PRODUCCIÓN: algo con un responsable, un criterio de aceptación y un estado verificable de terminado. Nunca más grande que UNA plataforma: un brief por plataforma, nunca uno por campaña.',
  '2. Cada entregable trae su brief con TODOS los campos de la referencia (abajo). UN solo mensaje por brief. La audiencia NUNCA es «todos»: se dice a quién SÍ y a quién NO. No prescribas la solución creativa. NO escribas el texto publicitario: el brief PIDE la pieza, no la escribe.',
  '3. Lo que falta SE DECLARA en «huecos»; NO se rellena con supuestos. Ninguna cifra sin de dónde salió.',
  '4. Si el plan CONTRADICE al manual de marca (por ejemplo usa un término que el manual prohíbe, o nombra una plataforma o una cifra que el manual no respalda), NO obedeces al plan: lo DECLARAS en «contradicciones_plan_vs_manual» y en el brief usas lo que dice el manual.',
  '5. El sistema mira imágenes, NO video ni audio. Toda pieza de video, reel o audio NO lleva brief: va a «pendientes_declarados» con su motivo. Nunca pongas tipo_de_pieza «video» dentro de «entregables».',
  '6. Toda regla visual declara su MUESTRA (cuántas piezas se miraron, cuántas eran foto y cuántas video, y qué no se pudo observar): tómala del campo visual.muestra del manual. Sin muestra no hay regla visual.',
  '7. Cada brief cita la parte del plan de donde sale (una sección o una frase TEXTUAL del plan) y lleva un identificador BRF-0001, BRF-0002…',
  '8. Las cifras y conteos del ejemplo de la referencia son CENTINELAS. Si copias una cifra que termina en ,77 el parte se rechaza. Piensa cada cifra desde el plan.',
  '9. No inventes presupuestos: si el plan no fija dinero para el entregable, «presupuesto» va null y se declara el hueco.',
  '10. Usa el vocabulario obligatorio del manual y NUNCA sus palabras prohibidas en lo que el brief pide (solo pueden aparecer en la lista «prohibido» y «negativos»).',
  '',
  '## Cómo responder',
  'Responde EXCLUSIVAMENTE con UN bloque JSON (nada de texto antes ni después) con esta forma exacta:',
  '{ "parte": {',
  '  "entregables": [ {',
  '    "id": "BRF-0001", "plataforma": "…", "tipo_de_pieza": "imagen|texto|listado|configuracion|carrusel|documento|otro",',
  '    "que_es": "…", "de_que_parte_del_plan": "…", "objetivo": "…", "segmento": "…", "protagonista": "…", "mensaje": "UN solo mensaje",',
  '    "hipotesis": "…", "limites": "…", "vocabulario_obligatorio": ["…"], "prohibido": ["…"], "sintaxis": "…",',
  '    "visual": { "capa_que_manda": "producto|grafica", "descripcion": "…", "muestra": "…" },',
  '    "llamado_a_la_accion": "…", "variantes": "…", "negativos": ["…"], "aprueba_y_para_cuando": "…", "presupuesto": null',
  '  } ],',
  '  "pendientes_declarados": [ { "entregable": "…", "plataforma": "…", "motivo": "…" } ],',
  '  "huecos": [ "…" ],',
  '  "contradicciones_plan_vs_manual": [ { "que": "…", "plan_dice": "…", "manual_dice": "…", "que_se_hizo": "…" } ],',
  '  "dependencias": [ "…" ]',
  '} }',
].join('\n')

const pedido = [
  REGLAS,
  '',
  '════════ MANUAL DE MARCA VIGENTE (versión ' + prev.manual_version + ' · id ' + prev.manual_id + ') ════════',
  prev.manual_texto || '(el manual no trae texto)',
  '',
  '════════ PLAN DE 90 DÍAS VIGENTE (id ' + prev.plan_id + ') ════════',
  prev.plan_texto,
  '',
  '════════ REFERENCIA · EL BRIEF DE UN ENTREGABLE (campos, reglas y trampas) ════════',
  REFERENCIA,
].join('\n')

const cuerpo = {
  agent: 'campaign-brief-agent',
  task: pedido,
  client_id: prev.client_id,
  workflow_id: $workflow.id,
  workflow_execution_id: $execution.id,
  callback_url: $execution.resumeUrl,
  // 🔴 LA PALANCA (2026-09-30 · PR #399 en producción) · el corredor de Railway hace el POST de la vuelta y no muere en los 800 s de Vercel.
  // SÓLO para campaign-brief-agent (lista cerrada en run-sdk) · NO copiar a otro agente ni a otro flujo. Quitarla = todo vuelve a como era.
  callback_mode: 'runner',
  force_restart: true,
  // 🔴 EL INTERRUPTOR LLEGA AL NODO QUE PAGA
  dry_run: prev.dry_run === true,
}
return [{ json: { ...prev, client_name: nombre, cuerpo, pedido_caracteres: pedido.length } }]
