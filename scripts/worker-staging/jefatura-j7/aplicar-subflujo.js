// JEF · aplicar · ESTRATEGIA / CALENDARIO · J7 · CC#1 · 2026-10-14 · sin revisión cerrada devuelve EXACTAMENTE el ítem que traía «④ ¿Termina?»: idéntico a hoy.
// Con revisión cerrada le suma `jefatura` (resultado, marcas, desacuerdos, costo): «⑤ Salida» lo pasa a la puerta. NO cambia la estrategia ni el calendario guardados (la corrección se aplica con otra pieza: `guardar_revisada`).
const CFG = __CFG__
const entrada = $input.first().json || {}
const orig = $('JEF · armar').first().json.orig
const jef = entrada.jef && typeof entrada.jef === 'object' ? entrada.jef : {}
if (jef.fase !== 'cerrada' || !jef.salida || typeof jef.salida !== 'object') return [{ json: orig }]
const sal = jef.salida
const marcas = sal.marcas && typeof sal.marcas === 'object' ? sal.marcas : {}
return [{ json: { ...orig, jefatura: {
  revision_id: jef.revision_id || sal.revision_id || null,
  resultado: String(sal.resultado || jef.resultado || ''),
  con_desacuerdo: marcas.con_desacuerdo === true,
  sin_segunda_mirada: marcas.sin_segunda_mirada === true,
  desacuerdos: Array.isArray(sal.desacuerdos) ? sal.desacuerdos.map((x) => String(x).slice(0, 300)).slice(0, 8) : [],
  costo_usd: typeof sal.costo_usd === 'number' ? sal.costo_usd : null,
  simulado: sal.simulado === true,
  correccion_aplicada: false,
} } }]
