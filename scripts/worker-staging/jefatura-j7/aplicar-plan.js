// JEF · aplicar · PLAN · J7 · CC#1 · 2026-10-14 · la puerta termina aquí y entrega a la cadena de versiones (evaluar → elegir → guardar → plan vigente) lo que pasó con la revisión.
// Sin revisión cerrada, la cadena no hace nada y «Plan vigente» devuelve EXACTAMENTE la salida de «Guardar el plan»: idéntico a hoy.
const CFG = __CFG__
const entrada = $input.first().json || {}
return [{ json: { jef: entrada.jef && typeof entrada.jef === 'object' ? entrada.jef : { fase: 'no_abre', motivo: 'sin estado de la puerta' } } }]
