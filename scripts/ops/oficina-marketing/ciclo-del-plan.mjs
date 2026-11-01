/**
 * 01-nov · CICLO DEL PLAN · TRAMO 2 · la parte de n8n (ORDEN CC1 `2026-11-01-ORDEN-CC1-a-CC2-ciclo-del-plan-tramo-2-n8n.md` + ADENDA 1). US$ 0, nada aplicado.
 * Los nodos Code de CC1 se copian de `ciclo-nodos/` (rama `feat/ciclo-del-plan-tramo-2` en `1f4e19a`); los míos (llave, hermanas, comprobar, compuerta) están al lado. Todo se pega TAL CUAL.
 *
 * Qué cambia en la planeación `X9F0zp6LQ2xGEYVS` (y SOLO esto):
 *   · «⓪ Llave»: valida plan_base_id · cambios_del_dueno · plan_cambio_id · sin_compuerta · tope_reescritura_usd ANTES de gastar.
 *   · «Plan anterior · pedir / leer» + marcar el pedido «en reescritura»: sin plan_base_id no hacen nada (el flujo de hoy).
 *   · «elegir brazos»: en reescritura NO se vuelve a raspar con Apify (se declara «no se buscó»); cerebro y PostHog siguen.
 *   · «Redactor (B4)»: el bloque «ESTA ES UNA REESCRITURA» (plan anterior + lo que pidió el dueño) y su medida en las líneas v3.
 *   · «Pedir el plan al redactor»: el tope del redactor es el menor entre 2,5 y `tope_reescritura_usd`.
 *   · «Guardar el plan» y las versiones B/C de la jefatura: el tag lleva version · reemplaza_a · vigente · plan_cambio_id · compuerta.
 *     🔴 La ruta de la jefatura escribe `version: 2|3` (su B/C) en el tag y pisaría la versión del ciclo: en B/C se re-imponen las claves del ciclo y la de la jefatura queda en `version_jefatura`.
 *   · «Ciclo · armar cierres» y la cadena de cierres tras «Plan vigente»: abre la compuerta, marca al anterior/hermanas, mueve la campaña, cierra el pedido. Cada paso falla fuerte («Ciclo · comprobar»).
 *   · La COMPUERTA tras «Parar · ¿plan revisado?»: toda corrida real se detiene ahí; con `sin_compuerta:true` la segunda mitad corre llamando al sub-flujo.
 *   · Sin plan (¿Hay plan? falso) con plan_cambio_id: el pedido queda «fallido».
 * La cola vieja (PDF → cable → brief) se COPIA al sub-flujo «Plan · segunda mitad»; en la planeación se queda donde está porque dos caminos sin plan la usan todavía
 * («Parar · ¿sin plan y con parar_en?» y «Cable · ¿volvió? · repetida»): su único camino de entrada desde el plan se corta y lo reemplaza la compuerta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { AQUI, agregarNodo, cambiarCodigo, codigo, conectar, idDeNodo, nodo, redirigir, si } from './lib.mjs'

const NODOS = path.join(AQUI, 'ciclo-nodos')
const leerNodo = (f) => fs.readFileSync(path.join(NODOS, f), 'utf8').replace(/\r\n/g, '\n')
/** el id del sub-flujo en n8n: se conoce al CREARLO; mientras no exista, un valor reservado que la prueba reconoce */
export const SUBFLUJO_PENDIENTE = 'PENDIENTE-SUBFLUJO-SEGUNDA-MITAD'
export const archivoDelIdSubflujo = path.join(AQUI, 'ciclo-subflujo-id.txt')
export const idDelSubflujo = () => (fs.existsSync(archivoDelIdSubflujo) ? fs.readFileSync(archivoDelIdSubflujo, 'utf8').trim() : '') || SUBFLUJO_PENDIENTE

const BASE = "={{ ($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL) }}/rest/v1/"
const CABECERAS = [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }]
const OPC = { timeout: 30000, response: { response: { fullResponse: true, neverError: true } } }
const cuerpoWebhook = "($('Webhook · planeacion').first().json.body || {})"

export const httpBase = (name, method, url, cuerpoJs, extra = []) => ({
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
  parameters: {
    method, url,
    sendHeaders: true,
    headerParameters: { parameters: [...CABECERAS, { name: 'Content-Type', value: 'application/json' }, ...extra] },
    ...(cuerpoJs ? { sendBody: true, specifyBody: 'json', jsonBody: cuerpoJs } : {}),
    options: OPC,
  },
})

/** un paso condicional: IF «¿<nombre>?» → HTTP <nombre>; las dos salidas del IF siguen al nodo `siguiente` (si el paso no aplica, se salta sin ruido). Devuelve [primer nodo, ultimo nodo para encadenar]. */
function pasoCondicional(f, { nombre, cond, http, junto, dx, dy, executeOnce = false }) {
  const iff = agregarNodo(f, si(`¿${nombre}?`, `={{ ${cond} }}`), junto, dx, dy)
  const h = agregarNodo(f, http, junto, dx + 220, dy)
  if (executeOnce) h.executeOnce = true
  conectar(f, iff.name, h.name, 0)
  return { entrada: iff.name, http: h.name, ifNombre: iff.name }
}
/** engancha un paso a su siguiente: la salida 0 del IF (pasa por el HTTP) y la salida 1 (se salta) terminan en `siguiente` */
function cerrarPaso(f, p, siguiente) {
  conectar(f, p.http, siguiente, 0)
  conectar(f, p.ifNombre, siguiente, 1)
}

const PATCH_ID = (tabla, expr) => `${BASE}${tabla}?id=eq.{{ ${expr} }}`

export function construirCicloDelPlan(f) {
  // ── A.1 · «⓪ Llave»: las entradas nuevas se validan ANTES de gastar ─────────────────────────────────────────────
  cambiarCodigo(f, '⓪ Llave · Webhook · planeacion', 'return $input.all()', leerNodo('llave-ciclo.js') + 'return $input.all()')

  // ── A.2 · «Plan anterior · pedir / leer» + marcar el pedido «en reescritura» ───────────────────────────────────
  const pedir = agregarNodo(f, {
    name: 'Plan anterior · pedir', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: {
      method: 'GET',
      url: `${BASE}client_historical_outputs?select=id,client_id,output_type,status,content_text,provenance_tag&id=eq.{{ (${cuerpoWebhook}.plan_base_id) || '00000000-0000-4000-8000-000000000000' }}`,
      sendHeaders: true, headerParameters: { parameters: CABECERAS },
      options: { timeout: 20000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, '⓪ Llave · Webhook · planeacion', 220, 0)
  // una caída de red no debe pasar por «no hay plan base»: el error llega como item y «Plan anterior · leer» DETIENE si había plan_base_id
  pedir.onError = 'continueRegularOutput'
  pedir.alwaysOutputData = true
  agregarNodo(f, codigo('Plan anterior · leer', leerNodo('plan-anterior-leer.js')), '⓪ Llave · Webhook · planeacion', 440, 0)
  const marca = pasoCondicional(f, {
    nombre: 'Reescritura · marcar el pedido', cond: '!!$json.cambio_patch',
    http: { ...httpBase('Cambio · en reescritura', 'PATCH', PATCH_ID('plan_cambios', '$json.cambio_patch.id'), '={{ JSON.stringify($json.cambio_patch) }}') },
    junto: '⓪ Llave · Webhook · planeacion', dx: 660, dy: 0,
  })
  // la marca es una anotación: si falla, la planeación NO se cae por ella (el pedido sigue; el vigía de pedidos abandonados lo recoge)
  nodo(f, 'Cambio · en reescritura').onError = 'continueRegularOutput'
  nodo(f, 'Cambio · en reescritura').alwaysOutputData = true
  redirigir(f, '⓪ Llave · Webhook · planeacion', 'V9 · ¿pide el pre-vuelo?', 'Plan anterior · pedir')
  conectar(f, 'Plan anterior · pedir', 'Plan anterior · leer')
  conectar(f, 'Plan anterior · leer', marca.entrada)
  cerrarPaso(f, marca, 'V9 · ¿pide el pre-vuelo?')

  // ── A.10 · «elegir brazos»: en reescritura no se vuelve a raspar ──────────────────────────────────────────────
  cambiarCodigo(f, 'elegir brazos', 'const pedidos = [];',
    "// 01-nov · CICLO DEL PLAN: una REESCRITURA parte del plan anterior y del cerebro; NO vuelve a raspar con Apify (cuesta y no hay nada nuevo que buscar). Se declara «no se buscó».\nconst REESCRIBE = (function () { try { const b = $('Webhook · planeacion').first().json.body || {}; return typeof b.plan_base_id === 'string' && b.plan_base_id !== ''; } catch (e) { return false; } })();\nconst pedidos = [];")
  cambiarCodigo(f, 'elegir brazos', 'const pedir = (brazo, objetivo) => {',
    "const pedir = (brazo, objetivo) => {\n  if (REESCRIBE && brazo === 'apify') { descartar(objetivo, 'no se buscó: es una reescritura del plan anterior (se usa el plan, el cerebro y la analítica, sin volver a raspar)'); return; }")

  // ── A.4 · «Redactor (B4)»: el bloque de reescritura ──────────────────────────────────────────────────────────
  const b4 = 'Redactor (B4)'
  const ancla = '/**\n * EL PÚBLICO IDEAL (noche 19-oct'
  cambiarCodigo(f, b4, ancla, leerNodo('b4-bloque-de-reescritura.js') + '\n' + ancla)
  cambiarCodigo(f, b4, 'const LINEAS_V3 = PV3 ?',
    "// 01-nov · CICLO DEL PLAN: ¿es una reescritura? (el plan anterior + lo que pidió el dueño, leídos por «Plan anterior · leer»)\nconst REESCRITURA = (function () { try { const r = $('Plan anterior · leer').first().json; return r && r.reescritura === true ? r : null } catch (x) { return null } })()\nconst LINEAS_V3 = PV3 ?")
  cambiarCodigo(f, b4, "{ base_chars: String((ent && ent.referencia) || '').length + 12000 }",
    "{ base_chars: String((ent && ent.referencia) || '').length + 12000 + (REESCRITURA ? String(REESCRITURA.plan_anterior.texto || '').length + 3000 : 0) }")
  cambiarCodigo(f, b4, "'══════ SECCIONES QUE NO PUEDES OMITIR ══════',",
    "...bloqueDeReescritura(REESCRITURA && REESCRITURA.plan_anterior, REESCRITURA && REESCRITURA.cambios_del_dueno, limpio),\n'══════ SECCIONES QUE NO PUEDES OMITIR ══════',")
  cambiarCodigo(f, b4, '    texto_libre_dueno_estado: ent.texto_libre_estado || null,',
    "    texto_libre_dueno_estado: ent.texto_libre_estado || null,\n    reescritura: REESCRITURA ? { plan_base_id: REESCRITURA.plan_anterior.id, version_base: REESCRITURA.plan_anterior.version, version_nueva: REESCRITURA.version_nueva, caracteres_del_pedido_del_dueno: REESCRITURA.cambios_del_dueno.length } : null,")

  // ── A.9 · el tope del redactor ────────────────────────────────────────────────────────────────────────────────
  const pedirRedactor = nodo(f, 'Pedir el plan al redactor')
  const viejoTope = 'max_budget_usd: 2.5,'
  if (!pedirRedactor.parameters.jsonBody.includes(viejoTope) || pedirRedactor.parameters.jsonBody.split(viejoTope).length !== 2) throw new Error('«Pedir el plan al redactor»: el tope 2.5 no aparece exactamente una vez')
  pedirRedactor.parameters.jsonBody = pedirRedactor.parameters.jsonBody.replace(viejoTope,
    "max_budget_usd: (function () { const t = Number(" + cuerpoWebhook + ".tope_reescritura_usd); return t > 0 && t < 2.5 ? t : 2.5 })(),")

  // ── A.5 · el tag de «Guardar el plan» y de las versiones B/C de la jefatura ────────────────────────────────────
  const CICLO = "(function () { try { const r = $('Plan anterior · leer').first().json; const re = !!(r && r.reescritura === true); return { version: re ? r.version_nueva : 1, reemplaza_a: re ? r.plan_anterior.id : null, vigente: true, plan_cambio_id: (r && r.plan_cambio_id) || null, compuerta: " + cuerpoWebhook + ".sin_compuerta !== true } } catch (e) { return { version: 1, reemplaza_a: null, vigente: true, plan_cambio_id: null, compuerta: true } } })()"
  const guardar = nodo(f, 'Guardar el plan')
  const a1 = "provenance_tag: { fuente: 'planeacion', workflow_id", a2 = 'pendientes: $json.pendientes || null } })'
  if (guardar.parameters.jsonBody.split(a1).length !== 2 || guardar.parameters.jsonBody.split(a2).length !== 2) throw new Error('«Guardar el plan»: el tag no tiene la forma esperada')
  guardar.parameters.jsonBody = guardar.parameters.jsonBody.replace(a1, "provenance_tag: Object.assign({ fuente: 'planeacion', workflow_id").replace(a2, 'pendientes: $json.pendientes || null }, ' + CICLO + ') })')
  for (const S of ['B', 'C']) {
    const n = nodo(f, `JEF · plan · guardar ${S}`)
    const viejo = `provenance_tag: Object.assign({}, $json.body.provenance_tag, $('JEF · plan · armar ${S}').first().json.tag_propio) }))`
    if (n.parameters.jsonBody.split(viejo).length !== 2) throw new Error(`«JEF · plan · guardar ${S}»: el tag no tiene la forma esperada`)
    // la ruta de la jefatura escribe version: 2|3 (su B/C) y pisaría la versión del ciclo: se re-imponen las claves del ciclo y la suya queda aparte
    n.parameters.jsonBody = n.parameters.jsonBody.replace(viejo,
      `provenance_tag: (function () { const t = Object.assign({}, $json.body.provenance_tag, $('JEF · plan · armar ${S}').first().json.tag_propio); t.version_jefatura = t.version; return Object.assign(t, ${CICLO}) })() }))`)
  }

  // ── A.6 · los cierres tras «Plan vigente» ─────────────────────────────────────────────────────────────────────
  const armar = agregarNodo(f, codigo('Ciclo · armar cierres', leerNodo('ciclo-armar-cierres.js')), 'Plan vigente', 220, 260)
  redirigir(f, 'Plan vigente', 'Parar · ¿plan revisado?', armar.name)
  const c = "$('Ciclo · armar cierres').first().json"
  const pasos = [
    pasoCondicional(f, { nombre: 'Compuerta · abrir', cond: `!!${c}.aprobacion`, junto: 'Plan vigente', dx: 440, dy: 260, executeOnce: true,
      http: httpBase('Compuerta · abrir', 'POST', `${BASE}plan_aprobaciones`, `={{ JSON.stringify(${c}.aprobacion) }}`, [{ name: 'Prefer', value: 'return=representation' }]) }),
    pasoCondicional(f, { nombre: 'Anterior · reemplazado', cond: `!!${c}.anterior`, junto: 'Plan vigente', dx: 880, dy: 260, executeOnce: true,
      http: httpBase('Anterior · reemplazado', 'PATCH', PATCH_ID('client_historical_outputs', `${c}.anterior.id`), `={{ JSON.stringify({ provenance_tag: ${c}.anterior.provenance_tag }) }}`) }),
  ]
  // hermanas: un ítem por hermana; cero hermanas ⇒ un ítem «ninguna» que el IF deja pasar sin PATCH
  const exp = agregarNodo(f, codigo('Hermanas · expandir', leerNodo('ciclo-expandir-hermanas.js')), 'Plan vigente', 1320, 260)
  exp.executeOnce = true
  const her = pasoCondicional(f, { nombre: 'Hermanas · no vigentes', cond: '!$json.ninguna', junto: 'Plan vigente', dx: 1540, dy: 260,
    http: httpBase('Hermanas · no vigentes', 'PATCH', PATCH_ID('client_historical_outputs', '$json.id'), '={{ JSON.stringify({ provenance_tag: $json.provenance_tag }) }}') })
  const resto = [
    pasoCondicional(f, { nombre: 'Campaña · a la vigente', cond: `!!${c}.campana`, junto: 'Plan vigente', dx: 1980, dy: 260, executeOnce: true,
      http: httpBase('Campaña · a la vigente', 'PATCH', `${BASE}cadena_campanas?client_id=eq.{{ ${c}.campana.client_id }}&plan_id=eq.{{ ${c}.campana.plan_id_anterior }}`, `={{ JSON.stringify({ plan_id: ${c}.campana.plan_id, actualizada_en: ${c}.campana.actualizada_en }) }}`) }),
    pasoCondicional(f, { nombre: 'Cambio · aplicado', cond: `!!${c}.cambio`, junto: 'Plan vigente', dx: 2420, dy: 260, executeOnce: true,
      http: httpBase('Cambio · aplicado', 'PATCH', PATCH_ID('plan_cambios', `${c}.cambio.id`), `={{ JSON.stringify(${c}.cambio) }}`) }),
    pasoCondicional(f, { nombre: 'Compuerta anterior · reemplazada', cond: `!!${c}.aprobacion_anterior`, junto: 'Plan vigente', dx: 2860, dy: 260, executeOnce: true,
      http: httpBase('Compuerta anterior · reemplazada', 'PATCH', `${BASE}plan_aprobaciones?plan_id=eq.{{ ${c}.aprobacion_anterior.plan_id }}`, `={{ JSON.stringify({ estado: ${c}.aprobacion_anterior.estado, actualizado_en: ${c}.aprobacion_anterior.actualizado_en }) }}`) }),
  ]
  const comprobar = agregarNodo(f, codigo('Ciclo · comprobar', leerNodo('ciclo-comprobar.js')), 'Plan vigente', 3300, 260)
  comprobar.executeOnce = true
  // la cadena: armar → abrir → anterior → expandir hermanas → hermanas → campaña → cambio → compuerta anterior → comprobar
  conectar(f, armar.name, pasos[0].entrada)
  cerrarPaso(f, pasos[0], pasos[1].entrada)
  cerrarPaso(f, pasos[1], exp.name)
  conectar(f, exp.name, her.entrada)
  cerrarPaso(f, her, resto[0].entrada)
  cerrarPaso(f, resto[0], resto[1].entrada)
  cerrarPaso(f, resto[1], resto[2].entrada)
  cerrarPaso(f, resto[2], comprobar.name)
  conectar(f, comprobar.name, 'Parar · ¿plan revisado?')

  // ── A.7 · la COMPUERTA tras «Parar · ¿plan revisado?» ─────────────────────────────────────────────────────────
  const compuerta = agregarNodo(f, si('¿Compuerta?', `={{ ${cuerpoWebhook}.dry_run !== true && ${cuerpoWebhook}.sin_compuerta !== true }}`), 'Parar · ¿plan revisado?', 220, 160)
  agregarNodo(f, codigo('Compuerta · esperar al dueño', leerNodo('compuerta-esperar.js')), 'Parar · ¿plan revisado?', 440, 100)
  agregarNodo(f, codigo('Segunda mitad · sobre', leerNodo('segunda-mitad-llamar-sobre.js')), 'Parar · ¿plan revisado?', 440, 240)
  const ejecutar = agregarNodo(f, {
    name: 'Segunda mitad · llamar', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1.1,
    parameters: { source: 'database', workflowId: { __rl: true, value: idDelSubflujo(), mode: 'id' }, options: { waitForSubWorkflow: true } },
  }, 'Parar · ¿plan revisado?', 660, 240)
  void ejecutar
  redirigir(f, 'Parar · ¿plan revisado?', 'Plan → Drive (PDF)', compuerta.name, 1)
  conectar(f, compuerta.name, 'Compuerta · esperar al dueño', 0)
  conectar(f, compuerta.name, 'Segunda mitad · sobre', 1)
  conectar(f, 'Segunda mitad · sobre', 'Segunda mitad · llamar')

  // ── A.8 · sin plan con un pedido del dueño: el pedido queda «fallido» ─────────────────────────────────────────
  const fallido = pasoCondicional(f, {
    nombre: 'Sin plan · cerrar el pedido', cond: `typeof ${cuerpoWebhook}.plan_cambio_id === 'string' && ${cuerpoWebhook}.plan_cambio_id !== ''`,
    http: httpBase('Cambio · fallido', 'PATCH', PATCH_ID('plan_cambios', `${cuerpoWebhook}.plan_cambio_id`),
      "={{ JSON.stringify({ estado: 'fallido', despertar_detalle: 'la corrida terminó sin plan', workflow_execution_id: $execution.id, actualizado_en: new Date().toISOString() }) }}"),
    junto: '¿Hay plan?', dx: 220, dy: 200,
  })
  nodo(f, 'Cambio · fallido').onError = 'continueRegularOutput'
  nodo(f, 'Cambio · fallido').alwaysOutputData = true
  redirigir(f, '¿Hay plan?', 'Parar · ¿sin plan y con parar_en?', fallido.entrada, 1)
  cerrarPaso(f, fallido, 'Parar · ¿sin plan y con parar_en?')
}
