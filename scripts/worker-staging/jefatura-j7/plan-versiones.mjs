// LA CADENA DE VERSIONES DEL PLAN (J7 · CC#1 · 2026-10-14 · diseño v4 §5.1) · lo que sigue a la puerta de revisión en el flujo de planeación (`X9F0zp6LQ2xGEYVS`):
//   ¿hay versión nueva? → evaluar (los chequeos por código de hoy sobre B y C) → filas del plan → armar la elección → elegir (ruta) → el plan de guardado
//     → [B: armar → tag (ruta) → guardar → reemplazo (ruta) → marcar a A] → [C: armar → tag (ruta) → guardar → reemplazo (ruta) → marcar a B] → Plan vigente
// Cualquier paso que no salga bien → «algo falló» → Plan vigente (la última fila realmente guardada, o A). Nada se reintenta, nada se borra.
// El `provenance_tag` de B y C y el `reemplazado_por` de A y B los calcula la RUTA con la fila LEÍDA (G5/condición 2 de CC#3): aquí nunca se escribe un rastro a mano.
import { code, conCfg, si, leerJs } from './gate.mjs'

export const P = {
  hay: 'JEF · plan · ¿hay versión nueva?',
  evaluar: 'JEF · plan · evaluar',
  filas: 'JEF · plan · filas del plan',
  armarEleccion: 'JEF · plan · armar la elección',
  listo: 'JEF · plan · ¿listo para elegir?',
  elegir: 'JEF · plan · elegir',
  eligio: 'JEF · plan · ¿eligió?',
  guardado: 'JEF · plan · el plan de guardado',
  fallo: 'JEF · plan · algo falló',
  marcaArmar: 'JEF · plan · armar la marca',
  marcaPatch: 'JEF · plan · marcar la revisión incompleta',
  marcaAvisar: 'JEF · plan · avisar la revisión incompleta',
  vigente: 'Plan vigente',
}
export const etapa = (S) => ({
  guardarSi: `JEF · plan · ¿guardar ${S}?`,
  armar: `JEF · plan · armar ${S}`,
  tag: `JEF · plan · tag de ${S}`,
  tagOk: `JEF · plan · ¿tag de ${S} listo?`,
  guardar: `JEF · plan · guardar ${S}`,
  guardoOk: `JEF · plan · ¿se guardó ${S}?`,
  reemplazo: `JEF · plan · reemplazo de ${S}`,
  reemplazoOk: `JEF · plan · ¿reemplazo de ${S} listo?`,
  marcar: `JEF · plan · marcar a ${S}`,
  marcoOk: `JEF · plan · ¿quedó marcado ${S}?`,
})
export const NOMBRES_DE_LA_CADENA = [...Object.values(P), ...['B', 'C'].flatMap((S) => Object.values(etapa(S)))]

const SUPABASE = "($env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL)"
const VERCEL = "($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app')"
const JSON_H = { name: 'Content-Type', value: 'application/json' }
const LLAVE = { name: 'x-sala-dispatch-key', value: '={{ $env.SALA_DISPATCH_KEY }}' }
const SB = [{ name: 'apikey', value: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, { name: 'Authorization', value: '=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}' }, JSON_H]

const nodoHttp = (name, method, url, body, headers, position, timeout = 30000) => ({
  parameters: {
    method, url, sendHeaders: true, headerParameters: { parameters: headers }, ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
    options: { timeout, response: { response: { fullResponse: true, neverError: true } } },
  },
  name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, onError: 'continueRegularOutput',
})

/** el módulo de chequeos de hoy: todo lo de «¿Llegó la vuelta?» ANTES de su cuerpo (funciones y constantes, sin referencias a n8n) */
export const MARCA_DEL_CUERPO = 'const e = $input.first().json || {};'
export function moduloDeLosChequeos(jsDeLaVuelta) {
  const js = jsDeLaVuelta.split('\r\n').join('\n')
  const i = js.indexOf(MARCA_DEL_CUERPO)
  if (i < 0 || js.indexOf(MARCA_DEL_CUERPO, i + 1) >= 0) throw new Error('«¿Llegó la vuelta?»: no se halla (o se repite) el inicio de su cuerpo: el módulo de chequeos cambió de forma')
  return js.slice(0, i)
}

/** la cadena completa. `vuelta` = el código de «¿Llegó la vuelta?» del flujo; `origen` = posición de partida */
export function cadenaDeVersiones({ jsDeLaVuelta, origen }) {
  const [x, y] = origen
  const pos = (i, fila = 0) => [x + 240 * i, y + 220 * fila]
  const modulo = moduloDeLosChequeos(jsDeLaVuelta)
  const cfg = { tipo: 'plan' }
  const nodes = []
  const links = []
  const nodo = (n) => { nodes.push(n); return n.name }
  const enlace = (a, b, i = 0) => links.push([a, b, i])

  nodo(si(P.hay, "={{ $json.jef.fase === 'cerrada' && Array.isArray(($json.jef.salida || {}).versiones) && $json.jef.salida.versiones.some((x) => x && (x.etiqueta === 'B' || x.etiqueta === 'C') && String(x.texto || '').trim() !== '') }}", pos(0)))
  nodo(code(P.evaluar, conCfg('const CFG = __CFG__\n' + modulo + '\n' + leerJs('plan-evaluar-glue.js'), cfg), pos(1)))
  nodo(nodoHttp(P.filas, 'GET', `={{ ${SUPABASE} + '/rest/v1/client_historical_outputs?select=id,provenance_tag&output_type=eq.campaign_plan_90d&client_id=eq.' + $json.client_id + '&order=created_at.desc&limit=100' }}`, null, SB, pos(2)))
  nodo(code(P.armarEleccion, conCfg(leerJs('plan-armar-eleccion.js'), cfg), pos(3)))
  nodo(si(P.listo, '={{ $json.ok === true }}', pos(4)))
  nodo(nodoHttp(P.elegir, 'POST', `={{ ${VERCEL} + '/api/jefatura/revisiones' }}`, '={{ JSON.stringify($json.cuerpo) }}', [JSON_H, LLAVE], pos(5), 60000))
  nodo(si(P.eligio, "={{ $json.statusCode === 200 && !!$json.body && $json.body.accion === 'versiones_elegidas' }}", pos(6)))
  nodo(code(P.guardado, conCfg(leerJs('plan-el-plan-de-guardado.js'), cfg), pos(7)))
  nodo(code(P.fallo, conCfg(leerJs('plan-fallo.js'), cfg), pos(9, 2)))
  nodo(code(P.vigente, conCfg(leerJs('plan-vigente.js'), cfg), pos(18, 1)))
  // R4 · rama lateral que cuelga de «Plan vigente»: la marca «revisión incompleta» (firma A); sin marca que poner no devuelve ítems y termina
  nodo(code(P.marcaArmar, conCfg(leerJs('plan-armar-marca.js'), cfg), pos(19, 3)))
  nodo(nodoHttp(P.marcaPatch, 'PATCH', `={{ ${SUPABASE} + '/rest/v1/client_historical_outputs?id=eq.' + $json.id }}`, '={{ JSON.stringify($json.cuerpo) }}', [...SB, { name: 'Prefer', value: 'return=representation' }], pos(20, 3)))
  nodo({ parameters: { method: 'POST', url: '={{ $env.SLACK_WEBHOOK_URL }}', sendBody: true, specifyBody: 'json', jsonBody: `={{ JSON.stringify({ text: $('${P.marcaArmar}').first().json.texto }) }}`, options: { timeout: 15000, response: { response: { neverError: true } } } }, name: P.marcaAvisar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(21, 3), onError: 'continueRegularOutput' })
  enlace(P.vigente, P.marcaArmar); enlace(P.marcaArmar, P.marcaPatch); enlace(P.marcaPatch, P.marcaAvisar)

  enlace(P.hay, P.evaluar, 0); enlace(P.hay, P.vigente, 1)
  enlace(P.evaluar, P.filas); enlace(P.filas, P.armarEleccion)
  enlace(P.armarEleccion, P.listo)
  enlace(P.listo, P.elegir, 0); enlace(P.listo, P.vigente, 1)
  enlace(P.elegir, P.eligio)
  enlace(P.eligio, P.guardado, 0); enlace(P.eligio, P.fallo, 1)
  enlace(P.fallo, P.vigente)

  const etapas = ['B', 'C']
  etapas.forEach((S, k) => {
    const e = etapa(S)
    const base = 8 + k * 5
    const sigue = k === 0 ? etapa('C').guardarSi : P.vigente
    nodo(si(e.guardarSi, `={{ $('${P.guardado}').first().json.guardar.some((g) => g.etiqueta === '${S}' && !g.reutilizar_id) }}`, pos(base, 0)))
    nodo(code(e.armar, conCfg(leerJs('plan-armar-version.js'), { ...cfg, etiqueta: S }), pos(base + 1, 0)))
    nodo(nodoHttp(e.tag, 'POST', `={{ ${VERCEL} + '/api/jefatura/revisiones' }}`, '={{ JSON.stringify($json.pedido_tag) }}', [JSON_H, LLAVE], pos(base + 2, 0), 30000))
    nodo(si(e.tagOk, '={{ $json.statusCode === 200 && !!$json.body && !!$json.body.provenance_tag }}', pos(base + 3, 0)))
    nodo(nodoHttp(e.guardar, 'POST', `={{ ${SUPABASE} + '/rest/v1/client_historical_outputs' }}`, `={{ JSON.stringify(Object.assign({}, $('${e.armar}').first().json.fila_base, { provenance_tag: Object.assign({}, $json.body.provenance_tag, $('${e.armar}').first().json.tag_propio) })) }}`, [...SB, { name: 'Prefer', value: 'return=representation' }], pos(base + 4, 0)))
    nodo(si(e.guardoOk, '={{ [200, 201].includes($json.statusCode) && Array.isArray($json.body) && !!$json.body[0] && !!$json.body[0].id }}', pos(base + 4, 1)))
    nodo(nodoHttp(e.reemplazo, 'POST', `={{ ${VERCEL} + '/api/jefatura/revisiones' }}`, `={{ JSON.stringify({ accion: 'marcar_reemplazo', provenance_tag: $('${e.armar}').first().json.padre.tag, por: $('${e.guardar}').first().json.body[0].id }) }}`, [JSON_H, LLAVE], pos(base + 3, 1), 30000))
    nodo(si(e.reemplazoOk, '={{ $json.statusCode === 200 && !!$json.body && !!$json.body.provenance_tag }}', pos(base + 2, 1)))
    nodo(nodoHttp(e.marcar, 'PATCH', `={{ ${SUPABASE} + '/rest/v1/client_historical_outputs?id=eq.' + $('${e.armar}').first().json.padre.id }}`, '={{ JSON.stringify({ provenance_tag: $json.body.provenance_tag }) }}', [...SB, { name: 'Prefer', value: 'return=representation' }], pos(base + 1, 1)))
    nodo(si(e.marcoOk, '={{ $json.statusCode === 200 && Array.isArray($json.body) && $json.body.length === 1 }}', pos(base, 1)))
    if (k === 0) enlace(P.guardado, e.guardarSi)
    enlace(e.guardarSi, e.armar, 0); enlace(e.guardarSi, sigue, 1)
    enlace(e.armar, e.tag); enlace(e.tag, e.tagOk)
    enlace(e.tagOk, e.guardar, 0); enlace(e.tagOk, P.fallo, 1)
    enlace(e.guardar, e.guardoOk)
    enlace(e.guardoOk, e.reemplazo, 0); enlace(e.guardoOk, P.fallo, 1)
    enlace(e.reemplazo, e.reemplazoOk)
    enlace(e.reemplazoOk, e.marcar, 0); enlace(e.reemplazoOk, P.fallo, 1)
    enlace(e.marcar, e.marcoOk)
    enlace(e.marcoOk, sigue, 0); enlace(e.marcoOk, P.fallo, 1)
  })
  return { nodes, links, entrada: P.hay, salida: P.vigente }
}
