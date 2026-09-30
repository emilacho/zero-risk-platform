// SIMULACRO DE UNA RESPUESTA BUENA DEL REDACTOR · CC#1 · 2026-09-30 · encargo Lenovo (punto 2: probar un parte SANO en ensayo).
// En seco el corredor contesta un texto canónico que NO es un parte legible, así que un parte sano nunca se podía ejercitar de punta a punta.
// Esto arma, a partir del plan y del manual REALES del cliente, una respuesta con la forma exacta que el redactor debe dar y que PASA los chequeos:
// se manda en el sobre como `_simulacro_respuesta` (sólo vale con dry_run:true · cero costo · nunca en modo real).
// 🔴 Es un parche de PRUEBA, no un parte: cita una línea textual del plan y NO inventa nada de negocio; su único trabajo es cruzar los chequeos.
function armarSimulacroSano(planTexto, manual) {
  var lineas = String(planTexto || '').split(/\r?\n/).map(function (l) { return l.replace(/^[#>\-*\s]+/, '').trim() }).filter(function (l) { return l.length >= 12 })
  if (!lineas.length) throw new Error('el plan no tiene una línea citable')
  var cita = lineas[0]
  var prohibidas = (manual && Array.isArray(manual.forbidden_words) ? manual.forbidden_words : []).filter(Boolean)
  var oblig = (manual && Array.isArray(manual.required_terminology) ? manual.required_terminology : []).filter(Boolean)
  var termino = oblig.length ? String(oblig[0]) : 'la marca'
  var brief = function (n) {
    return {
      id: 'BRF-000' + n,
      plataforma: 'Instagram',
      tipo_de_pieza: 'imagen',
      que_es: 'Anuncio de imagen fija · variante ' + n + ' (simulacro de prueba)',
      de_que_parte_del_plan: cita,
      objetivo: 'Mensajes al canal de contacto · variante ' + n,
      segmento: 'Adulto urbano que ya conoce la oferta y quiere decidir rápido. NO es el visitante ocasional.',
      protagonista: 'El producto principal · uno solo',
      mensaje: 'Simulacro de mensaje único número ' + n + ' sobre ' + termino + '.',
      hipotesis: 'Si el anuncio muestra el origen, la respuesta sube frente al anuncio sin origen (variante ' + n + ').',
      limites: 'Titular corto · proporción 4:5',
      vocabulario_obligatorio: [termino],
      prohibido: prohibidas.slice(0, 2),
      sintaxis: 'Frase completa en móvil',
      visual: { capa_que_manda: 'producto', descripcion: 'plano cenital sobre mesa clara', muestra: '2 fotos miradas de 12 piezas (10 son video)' },
      llamado_a_la_accion: 'Enviar mensaje',
      variantes: '2 · varía solo el titular',
      negativos: ['no se burla de quien no cocina'],
      aprueba_y_para_cuando: 'Responsable de la marca · antes del viernes',
      presupuesto: null,
    }
  }
  var parte = {
    entregables: [brief(1), brief(2)],
    pendientes_declarados: [{ entregable: 'Reel', plataforma: 'Instagram', motivo: 'el sistema no mira video' }],
    huecos: ['presupuesto no fijado por el plan'],
    contradicciones_plan_vs_manual: [],
    dependencias: [],
  }
  return '```json\n' + JSON.stringify({ parte: parte }, null, 1) + '\n```'
}
if (typeof module !== 'undefined' && module.exports) module.exports = { armarSimulacroSano: armarSimulacroSano }
