/**
 * 04-nov · GO Lenovo «la oficina financiera: cómo viaja la información y pausa hasta que el dueño responda» (visto bueno 15:33Z) · parte de CC#2 en el plan `X9F0zp6LQ2xGEYVS`.
 * Contrato con CC#1 (RESPUESTA «ajuste al contrato de la pausa»): la oficina se detiene tras el cierre de la ronda 1; `avanzar` contesta `{ estado: 'esperando_al_dueno', esperando: true, encargo_id }`.
 *   · «FIN · decidir» reconoce esa respuesta (en «abrir» o en «avanzar») y marca `pausa: true`.
 *   · «FIN · ¿se pausa?» → «FIN · pausar» (POST /api/finanzas/pausar: `{ client_id, encargo_id, corrida, corrida_id, material, sobre }`) → «FIN · la pausa quedó guardada» (si la ruta no contesta 200, la ejecución falla EN ROJO: nunca una corrida colgada y callada).
 *     La ejecución TERMINA ahí: no queda nada corriendo ni «esperando» (publicar exige 0). `material` = la salida de la Junta de brazos (lo ya pagado); `sobre` = el cuerpo original del plan.
 *   · Al reanudar, el vigía de CC#1 vuelve a llamar al plan con el `sobre` + `reanudar_esperas_id` (sin `finanzas_id`): «⓪ Llave» lo valida (uuid o ausente) · «elegir brazos» NO pide ningún brazo
 *     (pedidos vacíos = ninguna llamada de pago) y no se detiene por «ningún brazo salió» · tras la Junta, «Reanudar · …» pone el material guardado en su lugar y el plan sigue hasta el redactor.
 *     Si el material guardado no se puede leer, la ejecución falla en rojo (no se escribe un plan a ciegas).
 *   · Pausa de más de 3 días (umbral de Emilio · lo calcula el pre-vuelo) (visto Lenovo 15:51Z): el pre-vuelo contesta `material_viejo:true` → NO se usa lo guardado; «elegir brazos» pide como siempre y la Junta sale fresca. El pre-vuelo recibe `reanudar_esperas_id`.
 *   · Apertura con el manual completo (GO punto 6): la semilla lleva `manual_completo` (los campos del manual de «① GUARDA»). La ruta de CC#1 debe dejarlo pasar al abrir.
 * Con `reanudar_esperas_id` ausente y sin respuesta `esperando`, el plan es EXACTAMENTE el de hoy (la pausa nunca se activa hasta que la plataforma conteste `esperando`).
 */
import { agregarNodo, cambiarCodigo as cambiarCodigoLF, codigo, conectar, nodo, redirigir } from './lib.mjs'
import { CORRIDA_ID_JS } from './trabajo-de-cada-llamada-plan.mjs'

/** como `cambiarCodigo`, pero respeta los saltos de línea del nodo (algunos del vivo vienen con CRLF) */
function cambiarCodigo(f, nombre, viejo, nuevo) {
  const CRLF = String.fromCharCode(13, 10), LF = String.fromCharCode(10)
  const crlf = nodo(f, nombre).parameters.jsCode.includes(CRLF)
  const a = (t) => (crlf ? t.split(CRLF).join(LF).split(LF).join(CRLF) : t)
  cambiarCodigoLF(f, nombre, a(viejo), a(nuevo))
}

const N_DECIDIR = 'FIN · decidir'
const N_SIGUE = 'FIN · ¿sigue la conversación?'
const N_ABRIR = 'FIN · abrir la conversación'
export const N_SE_PAUSA = 'FIN · ¿se pausa?'
export const N_PAUSAR = 'FIN · pausar'
export const N_PAUSA_OK = 'FIN · la pausa quedó guardada'
const N_JUNTA = '[PLANEACIÓN] Junta de brazos'
const N_DERIVADOR = 'Derivador (B5)'
export const N_R_SI = 'Reanudar · ¿trae el material guardado?'
export const N_R_LEER = 'Reanudar · leer lo guardado'
export const N_R_PONER = 'Reanudar · poner el material guardado'
const N_LLAVE = '⓪ Llave · Webhook · planeacion'
const N_ELEGIR = 'elegir brazos'
const N_SEMILLA = 'FIN · armar la semilla'
const WH = "$('Webhook · planeacion').first().json.body"

// con `material_viejo` (la pausa pasó de 3 días · lo avisa el pre-vuelo) NO se reanuda con lo guardado: los brazos se piden de nuevo, frescos
const SI_REANUDA = `(function () { try { const x = ${WH}.reanudar_esperas_id; if (!(typeof x === 'string' && x.length > 0)) return false; try { return $('V9 · decidir').first().json.material_viejo !== true } catch (e2) { return true } } catch (e) { return false } })()`

export const CODIGO_PAUSA_OK = [
  '// 04-nov · la ruta de pausa debe contestar 200: si no, la corrida NO queda colgada y callada, la ejecución falla en rojo y el aviso de error del motor avisa.',
  'const r = $input.first().json || {}',
  'if (Number(r.statusCode) !== 200) throw new Error("PLAN_PAUSA_NO_GUARDADA · la ruta /api/finanzas/pausar contestó HTTP " + String(r.statusCode) + " · " + JSON.stringify(r.body || r.error || "").slice(0, 300))',
  'return [{ json: { pausada: true } }]',
].join('\n')

export const CODIGO_PONER = [
  '// 04-nov · reanudar tras la pausa de finanzas: el material de los brazos (ya pagado) vuelve de lo guardado; no se pide ningún brazo otra vez.',
  'const r = $input.first().json || {}',
  'const filas = r.body && Array.isArray(r.body) ? r.body : (Array.isArray(r) ? r : [])',
  'const guardado = filas[0] && filas[0].sobre_de_reanudacion && typeof filas[0].sobre_de_reanudacion === "object" ? filas[0].sobre_de_reanudacion : null',
  'const material = guardado && guardado.material && typeof guardado.material === "object" ? guardado.material : null',
  'if (Number(r.statusCode) !== 200 || !material || !Array.isArray(material.material)) throw new Error("PLAN_REANUDAR_SIN_MATERIAL · no se pudo leer el material guardado de la espera (HTTP " + String(r.statusCode) + ") · se DETIENE: no se escribe un plan a ciegas")',
  'return [{ json: material }]',
].join('\n')

export function construirPlanPausaDeFinanzas(f) {
  // 1 · reconocer la pausa en «FIN · decidir» (en «abrir» y en «avanzar»)
  cambiarCodigo(f, N_DECIDIR, "  return [{ json: { fin: false, encargo_id: b.encargo_id } }]\n}",
    "  if (b.esperando === true || b.estado === 'esperando_al_dueno') return [{ json: { fin: true, pausa: true, encargo_id: b.encargo_id } }]\n  return [{ json: { fin: false, encargo_id: b.encargo_id } }]\n}")
  cambiarCodigo(f, N_DECIDIR, "if (b.terminado === true) return",
    "if (b.esperando === true || b.estado === 'esperando_al_dueno') return [{ json: { fin: true, pausa: true, encargo_id: id } }]\nif (b.terminado === true) return")

  // 2 · la rama de la pausa
  const abrir = nodo(f, N_ABRIR)
  agregarNodo(f, { name: N_SE_PAUSA, type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: '={{ $json.pausa === true }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } }, N_SIGUE, -300, 0)
  const p = JSON.parse(JSON.stringify(abrir.parameters))
  p.url = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/finanzas/pausar' }}"
  p.jsonBody = `={{ JSON.stringify({ client_id: String(${WH}.client_id), encargo_id: $json.encargo_id, corrida: String(${WH}.corrida || ''), corrida_id: ${CORRIDA_ID_JS}, material: $('${N_JUNTA}').first().json, sobre: ${WH}, workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }) }}`
  agregarNodo(f, { name: N_PAUSAR, type: 'n8n-nodes-base.httpRequest', typeVersion: abrir.typeVersion, onError: 'continueRegularOutput', parameters: p }, N_SIGUE, 0, 260)
  agregarNodo(f, codigo(N_PAUSA_OK, CODIGO_PAUSA_OK), N_SIGUE, 300, 260)
  redirigir(f, N_DECIDIR, N_SIGUE, N_SE_PAUSA)
  conectar(f, N_SE_PAUSA, N_PAUSAR, 0)
  conectar(f, N_SE_PAUSA, N_SIGUE, 1)
  conectar(f, N_PAUSAR, N_PAUSA_OK)

  // 3 · la llave acepta `reanudar_esperas_id` (uuid o ausente)
  cambiarCodigo(f, N_LLAVE, '// 01-nov · CICLO DEL PLAN (tramo 2): entradas nuevas del disparo.',
    "// 04-nov · reanudar tras la pausa de finanzas: `reanudar_esperas_id` solo admite un uuid o ausente. Se rechaza ANTES de gastar.\n" +
    "const _re = w.body && typeof w.body === 'object' ? w.body.reanudar_esperas_id : undefined\n" +
    "if (_re !== undefined && _re !== null && _re !== '' && (typeof _re !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_re))) throw new Error('PLANEACION_REANUDAR_INVALIDO · reanudar_esperas_id solo admite un uuid (llegó ' + JSON.stringify(_re).slice(0, 60) + ') · se DETIENE antes de gastar')\n" +
    '// 01-nov · CICLO DEL PLAN (tramo 2): entradas nuevas del disparo.')

  // 4 · «elegir brazos»: al reanudar no se pide ningún brazo y no se detiene por «ningún brazo salió»
  cambiarCodigo(f, N_ELEGIR, 'if (!pedidos.some((p) => RAMAS_CON_BRAZO.indexOf(p.brazo) !== -1)) {',
    `// 04-nov · al reanudar tras la pausa de finanzas el material ya está pagado y guardado: no se pide ningún brazo\nconst REANUDA = ${SI_REANUDA};\nif (!REANUDA && !pedidos.some((p) => RAMAS_CON_BRAZO.indexOf(p.brazo) !== -1)) {`)
  cambiarCodigo(f, N_ELEGIR, '    pedidos: pedidos,\n    descartados: descartados,\n  },', '    pedidos: REANUDA ? [] : pedidos,\n    descartados: descartados,\n    ...(REANUDA ? { reanudando: true } : {}),\n  },')

  // 5 · después de la Junta, al reanudar el material guardado ocupa su lugar
  agregarNodo(f, { name: N_R_SI, type: 'n8n-nodes-base.if', typeVersion: 2, parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and', conditions: [{ leftValue: `={{ ${SI_REANUDA} }}`, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} } }, N_JUNTA, 300, 0)
  agregarNodo(f, {
    name: N_R_LEER, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: `={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/esperas_del_dueno?id=eq.{{ ${WH}.reanudar_esperas_id }}&select=id,sobre_de_reanudacion`,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Content-Type', value: 'application/json' }] },
      options: { timeout: 120000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, N_JUNTA, 600, 0)
  agregarNodo(f, codigo(N_R_PONER, CODIGO_PONER), N_JUNTA, 900, 0)
  redirigir(f, N_JUNTA, N_DERIVADOR, N_R_SI)
  conectar(f, N_R_SI, N_R_LEER, 0)
  conectar(f, N_R_SI, N_DERIVADOR, 1)
  conectar(f, N_R_LEER, N_R_PONER)
  conectar(f, N_R_PONER, N_DERIVADOR)

  // 5b · el pre-vuelo recibe `reanudar_esperas_id` (sin él, la corrida en pausa contesta «ya en marcha») y «V9 · decidir» deja pasar `material_viejo`
  const pv = nodo(f, 'V9 · pre-vuelo').parameters
  const VIEJO_PV = "if (b.dry_run !== undefined) o.dry_run = b.dry_run;"
  if (!pv.jsonBody.includes(VIEJO_PV)) throw new Error('V9 · pre-vuelo: ancla no encontrada')
  pv.jsonBody = pv.jsonBody.replace(VIEJO_PV, VIEJO_PV + " if (typeof b.reanudar_esperas_id === 'string' && b.reanudar_esperas_id.length > 0) o.reanudar_esperas_id = b.reanudar_esperas_id;")
  cambiarCodigo(f, 'V9 · decidir', 'relleno_permitido: cuerpo.relleno_permitido === true,', 'relleno_permitido: cuerpo.relleno_permitido === true, material_viejo: cuerpo.material_viejo === true,')

  // 6 · la apertura de la oficina recibe el manual completo (GO punto 6)
  cambiarCodigo(f, N_SEMILLA, '// plan v3: si el `dato.v1` llegó',
    "// 04-nov · la apertura recibe el MANUAL COMPLETO (los campos de «① GUARDA»), no solo su registro\ntry { const mc = manual.contenido_del_manual; if (mc && typeof mc === 'object' && Object.keys(mc).length) semilla.manual_completo = mc } catch (x) {}\n// plan v3: si el `dato.v1` llegó")
}
