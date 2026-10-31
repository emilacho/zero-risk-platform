/**
 * T5 · paso 2 · la PARTE POR FILAS (`BNXqlaX1oHSfZIpF` · webhook `zero-risk/cadena-parte`) con el nuevo orden: la hoja de producción la escribe CÓDIGO, no el redactor.
 *   node scripts/ops/oficina-marketing/construir-parte.mjs        · escribe nuevo/BNXqlaX1oHSfZIpF.json
 * Qué cambia (y SOLO esto):
 *   · después de «③ Armar el cuerpo del redactor» entran 4 nodos «③ Hoja · …»: se pide la hoja a `/api/cadena/hojas {accion:'escribir'}`.
 *       200            ⇒ la hoja (texto en el formato que ya lee la oficina) entra a «④ Chequeos» como si fuera la vuelta del redactor, a costo US$ 0 y SIN llamar a ningún modelo.
 *       409 E-NUEVO-ORDEN-APAGADO ⇒ la palanca del cliente está apagada: sigue el camino de hoy (redactor · espera · vuelta), byte a byte.
 *       cualquier otra cosa (sin brief, sin gran idea, sin filas, error de red) ⇒ el flujo se DETIENE con el código; nada se escribe a medias.
 *   · «④ Chequeos» lleva un atajo al principio: si la vuelta es una hoja por código arma la MISMA salida (parte_md, fila_parte, payload_cable…) a partir de la hoja y su procedencia; si no, el resto del nodo es el de hoy.
 * Todo lo de abajo (guardar el parte, Drive, marcar filas, autoproducir, cable de vuelta) queda intacto.
 */
import { agregarNodo, cambiarCodigo, codigo, conectar, escribirNuevo, http, leerVivo, nodo, redirigir, si } from './lib.mjs'

const ID = 'BNXqlaX1oHSfZIpF'
const URL_HOJAS = "={{ ($env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app') + '/api/cadena/hojas' }}"

export const CODIGO_PEDIR_HOJA = `// ③ HOJA · ARMAR EL PEDIDO · la hoja se pide por fila_ids (el lote que mandó el vigía) · sin tocar nada del contexto
const c = $input.first().json
if (!c.campana_id || !Array.isArray(c.fila_ids) || c.fila_ids.length === 0) throw new Error('PARTE_HOJA_SIN_LOTE · para pedir la hoja hace falta campana_id y fila_ids · se DETIENE y no escribe nada')
const pedido = { accion: 'escribir', campana_id: c.campana_id, fila_ids: c.fila_ids, ...(c.lote_key ? { lote_key: String(c.lote_key) } : {}), ...(c.manual_version !== undefined && c.manual_version !== null ? { manual_version: String(c.manual_version) } : {}), workflow_id: String($workflow.id), workflow_execution_id: String($execution.id) }
return [{ json: { ...c, pedido_hoja: JSON.stringify(pedido) } }]
`

export const CODIGO_QUE_SIGUE = `// ③ HOJA · QUÉ SIGUE · 200 ⇒ la hoja por código · 409 palanca apagada ⇒ el redactor de hoy · todo lo demás se DETIENE con su código (nunca se cae al redactor "por si acaso": eso gastaría sin que nadie lo pidiera)
const c = $('③ Hoja · armar el pedido').last().json
const r = $input.first().json || {}
if (r.error && typeof r.error === 'object') throw new Error('PARTE_HOJA_NO_LLEGO · la llamada a la cadena falló antes de recibir respuesta (' + String(r.error.message || r.error.name || 'sin detalle') + ') · se DETIENE y no escribe nada')
const status = Number(r.statusCode)
const b = r.body && typeof r.body === 'object' ? r.body : {}
if (status === 200 && typeof b.hoja === 'string' && b.hoja.trim() && b.provenance && typeof b.provenance === 'object' && Array.isArray(b.briefs)) return [{ json: { ...c, via: 'hoja', hoja: b } }]
if (status === 409 && (b.code === 'E-NUEVO-ORDEN-APAGADO' || b.error === 'E-NUEVO-ORDEN-APAGADO')) return [{ json: { ...c, via: 'redactor' } }]
throw new Error('PARTE_HOJA_' + String(b.code || b.error || status) + ' · ' + String(b.detalle || b.detail || b.message || 'sin detalle') + ' · se DETIENE y no escribe nada')
`

export const CODIGO_COMO_VUELTA = `// ③ HOJA · COMO VUELTA · la hoja por código entra a los chequeos con la misma forma que la vuelta del redactor (costo 0, sin modelo)
const c = $input.first().json
const h = c.hoja
return [{ json: { ...c, llego_la_vuelta: true, vuelta_real: true, simulacro_usado: false, texto: h.hoja, caracteres: h.hoja.length, falla_del_redactor: null, vuelta_costo_usd: 0, vuelta_modelo: 'codigo:hoja.v1', motivo: null, hoja_por_codigo: true } }]
`

/** el atajo de «④ Chequeos»: va ANTES del código de hoy; sin hoja por código no hace nada */
export const ATAJO_DE_LA_HOJA = `// ═══ T5 · la HOJA POR CÓDIGO (nuevo orden) · si la vuelta es una hoja escrita por código, la salida se arma de ella; si no, sigue el nodo de hoy ═══
;(function () {})
{
  const c0 = $input.first().json
  if (c0 && c0.hoja_por_codigo === true && c0.hoja && typeof c0.hoja === 'object') {
    const h = c0.hoja
    const prov = h.provenance || {}
    const hoy = new Date().toISOString().slice(0, 10)
    const avisos = Array.isArray(h.avisos) ? h.avisos.map(String) : []
    // un formato sin familia saldría SIN sala: no es un aviso mudo, es una detención (cadena_formatos_por_red.familia se completa antes de producir)
    const sinFamilia = avisos.filter(function (a) { return /sin familia/.test(a) })
    if (sinFamilia.length) throw new Error('PARTE_HOJA_SIN_FAMILIA · ' + sinFamilia.join(' · ') + ' · se DETIENE y no escribe nada')
    const hallazgos = avisos.map(function (a) { return { chequeo: 'aviso_de_la_hoja', entregable: null, detalle: a } })
    // chequeos sobre el texto FINAL de la hoja (mezcla brief + gran idea + calendario): cifras centinela (,77) y palabras prohibidas del manual (fuera de las listas PROHIBIDO / NEGATIVOS, que las nombran a propósito)
    const sinAcentos = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') }
    const pedidoLineas = []
    let enLista = false
    String(h.hoja).split('\\n').forEach(function (l) {
      if (/^- (PROHIBIDO|NEGATIVOS)/.test(l)) { enLista = true; return }
      if (enLista && /^\\s+/.test(l)) return
      enLista = false
      pedidoLineas.push(l.replace(/no se dice:.*$/i, ''))
    })
    const centinela = String(h.hoja).match(/\\d+[.,]77(?!\\d)/)
    if (centinela) hallazgos.push({ chequeo: 'centinela', entregable: null, detalle: 'aparece la cifra «' + centinela[0] + '» (termina en ,77) · copia del ejemplo de la referencia' })
    const pedidoNorm = ' ' + sinAcentos(pedidoLineas.join('\\n')).replace(/[^a-z0-9]+/g, ' ') + ' '
    ;(Array.isArray(c0.forbidden_words) ? c0.forbidden_words : []).forEach(function (w) {
      const wn = sinAcentos(typeof w === 'string' ? w : (w && (w.word || w.palabra)) || '').replace(/[^a-z0-9]+/g, ' ').trim()
      if (!wn) return
      if (pedidoNorm.indexOf(' ' + wn + ' ') !== -1) hallazgos.push({ chequeo: 'palabra_prohibida', entregable: null, detalle: 'la hoja usa «' + wn + '», prohibida por el manual, fuera de las listas de lo prohibido' })
    })
    const por_chequeo = {}
    hallazgos.forEach(function (x) { por_chequeo[x.chequeo] = (por_chequeo[x.chequeo] || 0) + 1 })
    const fatales = hallazgos.filter(function (x) { return x.chequeo === 'centinela' })
    const valido = prov.valido === true && fatales.length === 0
    const motivo = valido ? null : (prov.valido === true ? '' : 'la hoja por código no es válida (provenance.valido = false)') + fatales.map(function (x) { return (prov.valido === true ? '' : ' · ') + 'falla el chequeo «' + x.chequeo + '»' }).join(' · ') + (prov.valido === true ? '' : (avisos.length ? ' · ' + avisos.join(' · ') : ''))
    const encabezado = (valido ? '' : '# ⛔ PARTE NO VÁLIDO · NO USAR\\nMotivo: ' + motivo + '\\n\\n')
    const parte_md0 = encabezado + String(h.hoja)
    const briefs = Array.isArray(h.briefs) ? h.briefs : []
    const familias_por_brief0 = briefs.map(function (b) { return { brief_id: String(b.brief_id), fila_id: b.fila_id ? String(b.fila_id) : null, ...(Array.isArray(b.fila_ids) && b.fila_ids.length > 1 ? { fila_ids: b.fila_ids } : {}), familia: b.familia || null } })
    const fila_parte0 = {
      client_id: c0.client_id,
      title: (valido ? '' : '⛔ PARTE NO VÁLIDO · ') + 'Parte de trabajo · briefs · ' + hoy,
      output_type: 'campaign_brief_pack',
      content: parte_md0,
      content_text: parte_md0,
      producing_agent: 'campaign-brief-agent',
      status: 'draft',
      provenance_tag: {
        ...prov,
        fuente: 'brief',
        workflow_id: $workflow.id,
        workflow_execution_id: $execution.id,
        plan_id: c0.plan_id,
        campana_id: c0.campana_id,
        lote: c0.lote,
        lote_key: c0.lote_key,
        fila_ids: c0.fila_ids,
        familias_por_brief: familias_por_brief0,
        manual_id: c0.manual_id,
        manual_version: c0.manual_version,
        ...(c0.manual_de_ensayo === true ? { manual_de_ensayo: true } : {}),
        legible: true,
        kit: prov.kit ? { brief_id: prov.kit.brief_id, filas: (prov.kit.fila_ids || []).length, absorbidos: [] } : null,
        reparado: false,
        comillas_reparadas: 0,
        valido: valido,
        motivo_invalido: motivo,
        chequeos_ok: hallazgos.length === 0,
        hallazgos: hallazgos.length,
        por_chequeo: por_chequeo,
        entregables: briefs.length,
        pendientes: 0,
        huecos: 0,
        dry_run: c0.dry_run === true,
        guardado_antes_de_drive: true,
        tope_usd: c0.tope_usd === undefined ? null : c0.tope_usd,
        costo_usd: 0,
        parte: null,
      },
    }
    const payload_cable0 = {
      event_type: 'run_completed',
      worker_id: 'pBAp5Cx7R39U585i',
      worker_name: 'brief',
      resultado: valido ? 'lote_briefeado' : 'parte_no_valido',
      ...(valido ? {} : { motivo: motivo }),
      client_id: c0.client_id,
      tenant_id: c0.tenant_id || c0.client_id,
      _sala_correlation_id: c0._sala_correlation_id || null,
      _journey_id: c0._journey_id || null,
      ts: new Date().toISOString(),
    }
    return [{ json: {
      client_id: c0.client_id, client_name: c0.client_name, dry_run: c0.dry_run === true, plan_id: c0.plan_id, manual_id: c0.manual_id,
      cuerpo_dry_run_enviado: null, llego_la_vuelta: true, vuelta_real: true, simulacro_usado: false, vuelta_costo_usd: 0, vuelta_modelo: 'codigo:hoja.v1', falla_del_redactor: null,
      tope_usd: c0.tope_usd === undefined ? null : c0.tope_usd,
      parte_legible: true, parte_reparado: false, comillas_reparadas: 0, parte_valido: valido, motivo_invalido: motivo, titulo_parte: fila_parte0.title,
      chequeos_ok: hallazgos.length === 0, hallazgos: hallazgos, por_chequeo: por_chequeo, entregables: briefs.length, pendientes_declarados: 0,
      _sala_correlation_id: c0._sala_correlation_id || null, _journey_id: c0._journey_id || null,
      parte_md: parte_md0, fila_parte: fila_parte0, payload_cable: payload_cable0,
    } }]
  }
}
`

export function construirParte() {
  const f = leerVivo(ID)
  // 1 · cuatro nodos nuevos entre «③ Armar el cuerpo del redactor» y «③ Redactor (run-sdk)»
  agregarNodo(f, codigo('③ Hoja · armar el pedido', CODIGO_PEDIR_HOJA), '③ Armar el cuerpo del redactor', 220, -260)
  agregarNodo(f, http('③ Hoja · pedir a la cadena', URL_HOJAS, [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }, { name: 'Content-Type', value: 'application/json' }], '={{ $json.pedido_hoja }}', 30000), '③ Armar el cuerpo del redactor', 440, -260)
  agregarNodo(f, codigo('③ Hoja · qué sigue', CODIGO_QUE_SIGUE), '③ Armar el cuerpo del redactor', 660, -260)
  agregarNodo(f, si('③ Hoja · ¿por código?', "={{ $json.via === 'hoja' }}"), '③ Armar el cuerpo del redactor', 880, -260)
  agregarNodo(f, codigo('③ Hoja · como vuelta', CODIGO_COMO_VUELTA), '③ Armar el cuerpo del redactor', 1100, -360)
  redirigir(f, '③ Armar el cuerpo del redactor', '③ Redactor (run-sdk)', '③ Hoja · armar el pedido')
  conectar(f, '③ Hoja · armar el pedido', '③ Hoja · pedir a la cadena')
  conectar(f, '③ Hoja · pedir a la cadena', '③ Hoja · qué sigue')
  conectar(f, '③ Hoja · qué sigue', '③ Hoja · ¿por código?')
  conectar(f, '③ Hoja · ¿por código?', '③ Hoja · como vuelta', 0)
  conectar(f, '③ Hoja · ¿por código?', '③ Redactor (run-sdk)', 1)
  conectar(f, '③ Hoja · como vuelta', '④ Chequeos')
  // 2 · el atajo al principio de «④ Chequeos»
  const n = nodo(f, '④ Chequeos')
  if (n.parameters.jsCode.includes('hoja_por_codigo')) throw new Error('«④ Chequeos» ya trae el atajo de la hoja: ¿el vivo ya cambió?')
  n.parameters.jsCode = ATAJO_DE_LA_HOJA.replace(';(function () {})\n', '') + n.parameters.jsCode
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-parte.mjs')) console.log(escribirNuevo(construirParte()))
