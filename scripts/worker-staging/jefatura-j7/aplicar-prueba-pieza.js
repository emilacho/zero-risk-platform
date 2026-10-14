// JEF · aplicar · PRUEBA DE PIEZA · J7(pieza) · CC#1 · 2026-10-14 · el resumen de lo que pasó (el flujo no entrega a nadie: se lee en la ejecución y en `jefatura_revisiones`).
const CFG = __CFG__
const entrada = $input.first().json || {}
const jef = entrada.jef && typeof entrada.jef === 'object' ? entrada.jef : {}
const sal = jef.salida && typeof jef.salida === 'object' ? jef.salida : null
return [{ json: {
  fase: jef.fase || 'no_abre',
  motivo: jef.motivo || null,
  revision_id: jef.revision_id || null,
  resultado: sal ? String(sal.resultado || '') : null,
  marcas: sal && sal.marcas ? sal.marcas : null,
  desacuerdos: sal && Array.isArray(sal.desacuerdos) ? sal.desacuerdos : [],
  costo_usd: sal && typeof sal.costo_usd === 'number' ? sal.costo_usd : null,
  simulado: sal ? sal.simulado === true : null,
} }]
