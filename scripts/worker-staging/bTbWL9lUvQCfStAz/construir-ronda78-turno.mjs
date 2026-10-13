// OFICINA · un turno · ensayo en seco del tramo 2 · CC#2 · 2026-10-12
// Hallazgo: el «modelo simulado» del modo seco solo tenía moldes para la sala 1 (post con foto). Las salas 2 (carrusel) y 3 (historias) piden otros esquemas y el nodo hacía `throw`
// ⇒ la ejecución del turno moría y el encargo quedaba «corriendo» para siempre, en silencio (el vigía lo re-armaría para fallar otra vez).
// Arreglo (solo afecta al modo seco; en real el nodo no cambia):
//   1. moldes válidos por esquema para las salas 2 y 3 (refs leídos del propio pedido: roles de lámina o elementos del kit);
//   2. un esquema SIN molde ya no mata la ejecución: devuelve un `error` visible al motor (el encargo falla visible, no se congela).
export const NODO = '② Armar el pedido'

export const MOLDES_NUEVOS = [
  "  // ── r78 · salas 2 y 3 (los refs salen del propio pedido)",
  "  'direccion_imagenes.v1': (task) => { const refs = refsDe(task); return { resumen: '(simulado) dirección visual', estilo: '(simulado)', imagenes: refs.length ? [{ ref: refs[0], modo: 'generada', motivo: '(simulado)' }] : [], reglas_de_imagen: { obligatorio: [], prohibido: [] } } },",
  "  'prompts_por_ref.v1': (task) => ({ imagenes: refsAGenerar(task).map((ref) => ({ ref, prompts: [{ prompt: '(simulado) un plato visto desde arriba con luz natural lateral, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) cenital' }, { prompt: '(simulado) el mismo plato a nivel de mesa con fondo desenfocado, sin personas, sin texto, sin logotipos', idea_en_una_linea: '(simulado) nivel de mesa' }] })) }),",
  "  'observacion_imagenes.v1': (task) => { const ix = indices(task); return { imagenes: ix.map((indice) => ({ indice, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 })), preferencia: ix } },",
  "  'copy_base.v1': () => ({ texto_base: 'Primera línea simulada\\nSegunda línea simulada\\nTercera línea simulada\\nCuarta línea simulada\\nEscríbenos', pie_de_foto: '(simulado) pie de foto de prueba', hashtags: [] }),",
  "  'laminas.v1': () => ({ laminas: [{ rol: 'hook', headline: 'Primera línea simulada' }, { rol: 'problem', headline: 'Segunda línea simulada' }, { rol: 'reframe', headline: 'Tercera línea simulada' }, { rol: 'benefit', headline: 'Cuarta línea simulada' }, { rol: 'cta', headline: 'Escríbenos', cta: 'Escríbenos' }] }),",
  "  'estructura.v1': (task) => ({ elementos: refsDeKit(task).map((ref) => ({ ref, rol: '(simulado) rol', beat: '(simulado) beat', mood: '(simulado) mood' })) }),",
  "  'copy_kit.v1': (task) => ({ elementos: refsDeKit(task).map((ref) => ({ ref, headline: '(simulado) titular' })) }),",
  "  'resolucion_solo.v1': () => ({ respuestas: [] }),",
  "  'resolucion_copy_base.v1': () => ({ respuestas: [] }),",
  "  'resolucion_copy_kit.v1': () => ({ respuestas: [] }),",
  "  'resolucion_estructura.v1': () => ({ respuestas: [] }),",
  "  'resolucion_laminas.v1': () => ({ respuestas: [] }),",
].join('\r\n')

export const AYUDAS = [
  "// ── r78 · los refs del pedido: elementos del kit («- e01: …»), roles de lámina del carrusel («Roles de lámina posibles …: hook, problem, …») o las imágenes a generar («## Imágenes que hay que GENERAR … - ref: …»)",
  "const refsDeKit = (task) => [...String(task).matchAll(/^- (e\\d+):/gm)].map((m) => m[1])",
  "const refsDe = (task) => { const kit = refsDeKit(task); if (kit.length) return kit; const m = /Roles de lámina posibles[^:\\n]*:\\s*([^\\n]+)/.exec(String(task)); return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [] }",
  "const refsAGenerar = (task) => { const i = String(task).search(/## Imágenes que hay que GENERAR/); if (i < 0) return []; const sec = String(task).slice(i).split(/\\n## /)[0]; return [...sec.matchAll(/^- ([^:\\n]+):/gm)].map((m) => m[1].trim()) }",
  "",
].join('\r\n')

const unaVez = (s, a, b) => {
  const n = s.split(a).length - 1
  if (n !== 1) throw new Error('ancla: aparece ' + n + ' veces (debe ser 1): ' + a.slice(0, 80))
  return s.replace(a, () => b)
}

export function cambiarPedido(codigo) {
  if (codigo.includes("'direccion_imagenes.v1'")) throw new Error('el nodo ya tiene los moldes de las salas 2 y 3')
  let s = codigo
  s = unaVez(s, "const SIMULADOS = {\r\n", AYUDAS + "const SIMULADOS = {\r\n")
  s = unaVez(s, "  'resolucion.v1': () => ({ respuestas: [] }),\r\n}\r\n", "  'resolucion.v1': () => ({ respuestas: [] }),\r\n" + MOLDES_NUEVOS + "\r\n}\r\n")
  s = unaVez(s,
    "  if (!molde) throw new Error('OFICINA_SIN_MOLDE_SIMULADO · no hay respuesta simulada para el esquema ' + JSON.stringify(p.esquema) + ' · se DETIENE')\r\n",
    "  // r78 · un esquema sin molde NO mata la ejecución (el encargo se quedaba «corriendo» en silencio): el motor recibe el error y el encargo falla visible\r\n" +
    "  if (!molde) return [{ json: { ...e, simulado: true, resultado_body: { accion: 'resultado', encargo_id: e.encargo_id, n: t.n, error: 'OFICINA_SIN_MOLDE_SIMULADO · no hay respuesta simulada para el esquema ' + JSON.stringify(p.esquema), costo_usd: 0, workflow_execution_id: $execution.id } } }]\r\n")
  return s
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const n = copia.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('no está el nodo ' + NODO)
  n.parameters.jsCode = cambiarPedido(n.parameters.jsCode)
  return copia
}
