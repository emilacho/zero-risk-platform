/**
 * 01-nov · PUNTOS 9a / 9b del encargo «errores del plan» (ADENDA 2 de Lenovo · «el único que cuenta es el que yo apruebo») · BRIEF `PQdIgbuFexuBsoh8` (9a y 9b) y PARTE POR FILAS `BNXqlaX1oHSfZIpF` (solo 9b: ya lee el plan de la campaña por su id, no «el más reciente»).
 *   9a · EL PLAN QUE SE LEE ES EL APROBADO. Hasta hoy el brief leía el `campaign_plan_90d` MÁS RECIENTE por `created_at`, sin mirar si el dueño lo aprobó (un borrador esperando decisión se colaba).
 *        Ahora: un nodo nuevo lee `plan_aprobaciones` (último `estado = aprobado` por `decidido_en`) y el GET del plan pide ESE `plan_id`.
 *        Sin plan aprobado: corrida REAL ⇒ se DETIENE con BRIEF_PLAN_NO_APROBADO (nunca cae al más reciente). `dry_run === true` ⇒ usa el último borrador, ROTULADO «BORRADOR SIN APROBAR» en el pedido y con `plan_sin_aprobar: true`.
 *        Un error de la base al leer la aprobación no es «sin aprobar»: se DETIENE con su motivo.
 *   9b · LA JERARQUÍA: el dueño > el plan aprobado > el manual. La regla 4 del redactor decía lo contrario (ante un choque, el manual). Ahora gana el plan aprobado y el choque se declara igual, para que la fuente vieja se actualice.
 * Con plan aprobado, el pedido es el de hoy salvo la regla 4. La pieza no relee el plan (lee el parte ya escrito).
 */
import { agregarNodo, cambiarCodigo, conectar, nodo, redirigir } from './lib.mjs'

const NUEVO = '② Cargar la aprobación del plan'
const CARGAR_PLAN = '② Cargar plan vigente'
const GUARDA_PLAN = '② GUARDA · sin plan se DETIENE'
const ARMAR = '③ Armar el cuerpo del redactor'
const ULTIMA_GUARDA_MANUAL = '① GUARDA · sin manual aprobado se DETIENE'
const SOBRE = '⓪ Sobre · llave · modo seco'

const CERO = '00000000-0000-0000-0000-000000000000'
const URL_APROBACION = "={{ $env.SUPABASE_URL || $env.NEXT_PUBLIC_SUPABASE_URL }}/rest/v1/plan_aprobaciones?select=plan_id,version,estado,decidido_en&estado=eq.aprobado&client_id=eq.{{ $('" + SOBRE + "').first().json.client_id }}&order=decidido_en.desc&limit=1"
const CABEZA_VIEJA = '&order=created_at.desc&limit=1'
const FILTRO_PLAN = "{{ $('" + NUEVO + "').first().json.plan_id ? '&id=eq.' + $('" + NUEVO + "').first().json.plan_id : ($('" + SOBRE + "').first().json.dry_run === true ? '' : '&id=eq." + CERO + "') }}"

const GUARDA_ANCLA = "const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)\nif (filas.length === 0) {\n  throw new Error('BRIEF_SIN_PLAN"
const GUARDA_NUEVO = `// 01-nov · EL PLAN QUE SE LEE ES EL APROBADO POR EL DUEÑO (plan_aprobaciones.estado = aprobado). Un error de la base NO es «sin aprobar»: se DETIENE con su motivo.
const _ap = $('${NUEVO}').first().json || {}
if ((_ap.error !== undefined && _ap.error !== null) || (_ap.code !== undefined && _ap.message !== undefined && _ap.plan_id === undefined)) {
  const _m = _ap.error && typeof _ap.error === 'object' ? (_ap.error.message || _ap.error.name) : (_ap.error || _ap.message)
  throw new Error('BRIEF_APROBACION_CONSULTA_FALLO · la consulta de la aprobación del plan FALLÓ (' + String(_m || 'sin detalle').slice(0, 160) + ') · un error no es «sin aprobar» · se DETIENE y NO escribe nada')
}
const _aprobado = !!_ap.plan_id
const filas = $input.all().map((i) => i.json).filter((r) => r && r.id)
if (!_aprobado && prev.dry_run !== true) {
  throw new Error('BRIEF_PLAN_NO_APROBADO · el cliente ' + prev.client_id + ' no tiene un plan APROBADO por el dueño (plan_aprobaciones) · el brief no se construye sobre un borrador · se DETIENE y NO escribe nada')
}
if (filas.length === 0) {
  throw new Error('BRIEF_SIN_PLAN`
const GUARDA_SALIDA_VIEJA = '    plan_id: p.id,\n'
const GUARDA_SALIDA_NUEVA = "    plan_id: p.id,\n    // 01-nov · de dónde salió el plan: aprobado por el dueño, o (solo en ensayo) el último borrador, rotulado\n    plan_sin_aprobar: !_aprobado,\n    plan_aprobado_version: _aprobado ? (_ap.version === undefined ? null : _ap.version) : null,\n"

const ARMAR_ENCABEZADO_VIEJO = "'════════ PLAN DE 90 DÍAS VIGENTE (id ' + prev.plan_id + ') ════════',"
const ARMAR_ENCABEZADO_NUEVO = "'════════ PLAN DE 90 DÍAS VIGENTE (id ' + prev.plan_id + ')' + (prev.plan_sin_aprobar === true ? ' · BORRADOR SIN APROBAR (ensayo: el dueño no lo ha aprobado; no es su plan)' : '') + ' ════════',"

const REGLA4_VIEJA = "'4. Si el plan CONTRADICE al manual de marca (por ejemplo usa un término que el manual prohíbe, o nombra una plataforma o una cifra que el manual no respalda), NO obedeces al plan: lo DECLARAS en «contradicciones_plan_vs_manual» y en el brief usas lo que dice el manual.',"
const REGLA4_NUEVA = "'4. JERARQUÍA DE FUENTES: 1º lo que el dueño ordenó o declaró · 2º el plan que el dueño APROBÓ · 3º el manual de marca. Si el plan CONTRADICE al manual (por ejemplo usa un término que el manual no trae, o nombra una plataforma o una cifra que el manual no respalda), MANDA EL PLAN: en el brief usas lo que dice el plan y DECLARAS el choque en «contradicciones_plan_vs_manual» (que_se_hizo: «se siguió el plan aprobado») para que la fuente vieja se actualice. Lo que el dueño declaró en el manual o en la carpeta como hecho suyo gana incluso al plan.',"

export function construirPlanAprobado(f) {
  // el nodo que lee la aprobación, justo antes de cargar el plan
  const base = nodo(f, CARGAR_PLAN)
  const def = {
    name: NUEVO,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: { ...JSON.parse(JSON.stringify(base.parameters)), url: URL_APROBACION },
  }
  agregarNodo(f, def, CARGAR_PLAN, -220, 0)
  redirigir(f, ULTIMA_GUARDA_MANUAL, CARGAR_PLAN, NUEVO)
  conectar(f, NUEVO, CARGAR_PLAN)

  // el GET del plan pide el aprobado (o, solo en ensayo sin aprobado, el último; en real sin aprobado, un id que no existe)
  const n = nodo(f, CARGAR_PLAN)
  if (n.parameters.url.split(CABEZA_VIEJA).length !== 2) throw new Error('«' + CARGAR_PLAN + '»: la cola de la consulta no es la esperada')
  n.parameters.url = n.parameters.url.replace(CABEZA_VIEJA, () => FILTRO_PLAN + CABEZA_VIEJA)

  cambiarCodigo(f, GUARDA_PLAN, GUARDA_ANCLA, GUARDA_NUEVO)
  cambiarCodigo(f, GUARDA_PLAN, GUARDA_SALIDA_VIEJA, GUARDA_SALIDA_NUEVA)
  cambiarCodigo(f, ARMAR, ARMAR_ENCABEZADO_VIEJO, ARMAR_ENCABEZADO_NUEVO)
}

/** 9b · la jerarquía de fuentes en la regla 4 del redactor: brief Y parte por filas (la parte por filas ya lee el plan de la campaña por id, no el más reciente) */
export function construirJerarquiaDeFuentes(f) {
  cambiarCodigo(f, ARMAR, REGLA4_VIEJA, REGLA4_NUEVA)
}
