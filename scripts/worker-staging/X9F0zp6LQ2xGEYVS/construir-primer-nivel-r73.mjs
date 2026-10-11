// PLANEACIÓN · el plan de 90 días a primer nivel (v2 AGNÓSTICA) · CC#2 · 2026-10-11 · ronda 73 (encargo «plan primer nivel v2»)
// Cuatro nodos cambian y NADA más (conexiones y ajustes idénticos):
//   «① Cargar el manual de marca»  → también trae los colores y tipografías del manual
//   «① GUARDA · sin manual…»       → los pasa (identidad_del_manual)
//   «Redactor (B4)»                → ficha SIN topes internos · bloque general «EL PLAN A PRIMER NIVEL» · fuera la regla fija del reparto 60 % y las frases «la casa lo fija»
//   «¿Llegó la vuelta?»            → chequeo por código del plan que volvió (P1–P6) + el bloque neutro de revisión
// Todo parte del flujo VIVO. Si el texto de un nodo cambió debajo, el constructor se detiene (no aplica a ciegas).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
export const NODOS = { manual: '① Cargar el manual de marca', guarda: '① GUARDA · sin manual aprobado se DETIENE', b4: 'Redactor (B4)', vuelta: '¿Llegó la vuelta?' }
export const MODULO = readFileSync(join(aqui, 'plan-primer-nivel.js'), 'utf8').split('\r\n').join('\n').replace(/\s+$/, '')

const unaVez = (s, a, b, quien) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error(quien + ': el texto a cambiar aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 80))
  return s.replace(a, () => b)
}
const entreMarcas = (s, ini, fin, nuevo, quien) => {
  const i = s.indexOf(ini), j = s.indexOf(fin, i)
  if (i < 0 || j < 0 || s.indexOf(ini, i + 1) >= 0) throw new Error(quien + ': no se encontró (o está repetido) el tramo ' + ini.slice(0, 60))
  return s.slice(0, i) + nuevo + s.slice(j + fin.length)
}
const conLF = (f) => (c) => { const crlf = c.includes('\r\n'); const r = f(c.split('\r\n').join('\n')); return crlf ? r.split('\n').join('\r\n') : r }

export const cambiarManual = (url) => {
  const a = 'select=id,client_id,gate_outcome,created_at,voice_description,tone_guidelines,writing_style,tagline,positioning,required_terminology,content_text'
  if (url.includes('primary_colors')) throw new Error('la consulta del manual ya trae los colores')
  return unaVez(url, a, a + ',primary_colors,typography', NODOS.manual)
}

export const cambiarGuarda = conLF((s) => {
  const a = 'return [{ json: { client_id: cid, manual_id: m.id, manual_aprobado: true, registro_del_manual: registro_del_manual } }];'
  if (s.includes('identidad_del_manual')) throw new Error('la guarda ya pasa la identidad del manual')
  return unaVez(s, a, 'return [{ json: { client_id: cid, manual_id: m.id, manual_aprobado: true, registro_del_manual: registro_del_manual, identidad_del_manual: { primary_colors: m.primary_colors === undefined ? null : m.primary_colors, typography: m.typography === undefined ? null : m.typography } } }];', NODOS.guarda)
})

export const cambiarB4 = conLF((s) => {
  const q = NODOS.b4
  if (s.includes('function fichaLimpia')) throw new Error(q + ' ya tiene el módulo del plan a primer nivel')
  // 1 · el módulo, antes de leer la entrada
  s = unaVez(s, 'const ent = $input.first().json || {};', MODULO + '\n\nconst ent = $input.first().json || {};', q)
  // 2 · el contexto de identidad y moneda (de la ficha y del manual)
  s = unaVez(s, 'const registroDelCliente = registroFinal(manual.registro_del_manual, ficha.country);',
    'const registroDelCliente = registroFinal(manual.registro_del_manual, ficha.country);\n' +
    '// r73 · identidad visual y moneda salen de la ficha y del manual; la ficha que ve el redactor NO lleva topes ni claves internas\n' +
    'const fichaSinInternos = fichaLimpia(ficha);\n' +
    'const ctxPN = { identidad: identidadDeclarada(ficha, { primary_colors: (manual.identidad_del_manual || {}).primary_colors, typography: (manual.identidad_del_manual || {}).typography }), moneda: monedaDelCliente(ficha, manual) };', q)
  // 3 · la ficha del pedido, sin lo interno
  s = unaVez(s, 'JSON.stringify(ficha, null, 1),', 'JSON.stringify(fichaSinInternos.ficha, null, 1),', q)
  // 4 · el porcentaje: se usa, pero no se atribuye ni se nombra
  s = unaVez(s, "' + PCT + '%. LA CASA LO FIJA ASI. No lo discutas ni lo estimes: úsalo tal cual y di en el plan que lo fija la casa.'",
    "' + PCT + '%. Es un criterio interno: úsalo tal cual para calcular el costo máximo por cliente y NO menciones quién lo fija, de dónde sale ni que existe una regla.'", q)
  s = unaVez(s, "declaralo como hueco («la casa todavia no fijo este numero») y di que sin el, el costo maximo por cliente no se puede cerrar.'",
    "NO lo estimes y NO inventes uno: calcula el costo por cliente con un rango de mercado que declares como tal (con su fuente) y no menciones reglas internas.'", q)
  // 5 · dos números POR ESCENARIO
  s = unaVez(s, "'6. Al dueno se le muestran DOS numeros, no cinco: cuanto le cuesta este mes, y cuantos',", "'6. Al dueno se le muestran DOS numeros por escenario, no cinco: cuanto le cuesta este mes, y cuantos',", q)
  // 6 · fuera la regla fija del reparto por canales (no es general) y su variante en la sección C
  s = entreMarcas(s, "'7. META E INSTAGRAM SON EL 60% DEL PRESUPUESTO TOTAL.", 'lineaPauta,\n', "'7. El reparto del presupuesto entre renglones lo propones tú, desde la meta y las fuentes de ESTE cliente (ver «EL PLAN A PRIMER NIVEL»).',\n'',\n", q)
  s = entreMarcas(s, "'   🔴 LA PAUTA EN META E INSTAGRAM NO VA EN ESTA SECCION.", "es el reparto de la casa. Si la escribes aca, el plan esta mal.',\n", '', q)
  // 7 · el bloque general
  s = unaVez(s, "'══════ SECCIONES QUE NO PUEDES OMITIR ══════',", '...bloquePrimerNivel(ctxPN),\n' + "'══════ SECCIONES QUE NO PUEDES OMITIR ══════',", q)
  // 8 · lo que el nodo declara de sí mismo (el chequeo lo lee)
  s = unaVez(s, '    registro_usado: registroDelCliente,', '    registro_usado: registroDelCliente,\n    contexto_chequeo: ctxPN,\n    claves_internas_quitadas_de_la_ficha: fichaSinInternos.quitadas,', q)
  return s
})

export const cambiarVuelta = conLF((s) => {
  const q = NODOS.vuelta
  if (s.includes('function revisarPlan')) throw new Error(q + ' ya tiene el chequeo del plan')
  s = unaVez(s, 'const e = $input.first().json || {};', MODULO + '\n\nconst e = $input.first().json || {};', q)
  s = unaVez(s, "const bloqueRevision = revisionDeRegistro ? bloqueDeRevisionDeRegistro(revisionDeRegistro, registroDelPlan) : '';",
    "const bloqueRevision = revisionDeRegistro ? bloqueDeRevisionDeRegistro(revisionDeRegistro, registroDelPlan) : '';\n" +
    '// r73 · chequeo del plan por código (P1–P6): marca lo que no debe llegar al cliente; no corrige, avisa\n' +
    'let contextoChequeo = null;\n' +
    "try { contextoChequeo = $('Redactor (B4)').first().json.contexto_chequeo; } catch (x) { contextoChequeo = null; }\n" +
    'const chequeoDelPlan = llego ? revisarPlan(textoRevisado, contextoChequeo) : null;\n' +
    "const bloqueChequeo = chequeoDelPlan ? bloqueDeRevisionDelPlan(chequeoDelPlan) : '';", q)
  s = unaVez(s, "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + bloqueRevision + '\\n\\n' + bloqueDescartados + '\\n' : textoDelRedactor;",
    "const texto = llego ? textoRevisado.replace(/\\s+$/, '') + bloqueRevision + bloqueChequeo + '\\n\\n' + bloqueDescartados + '\\n' : textoDelRedactor;", q)
  s = unaVez(s, '  calentamiento_quitado: sinCalentamiento.quitado || null,', '  calentamiento_quitado: sinCalentamiento.quitado || null,\n  chequeo_del_plan: chequeoDelPlan,', q)
  return s
})

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('no está el nodo ' + n); return x }
  nodo(NODOS.manual).parameters.url = cambiarManual(nodo(NODOS.manual).parameters.url)
  nodo(NODOS.guarda).parameters.jsCode = cambiarGuarda(nodo(NODOS.guarda).parameters.jsCode)
  nodo(NODOS.b4).parameters.jsCode = cambiarB4(nodo(NODOS.b4).parameters.jsCode)
  nodo(NODOS.vuelta).parameters.jsCode = cambiarVuelta(nodo(NODOS.vuelta).parameters.jsCode)
  return copia
}
