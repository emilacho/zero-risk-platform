// CICLO DEL PLAN · tramo 2 · CC2 · «Segunda mitad · sobre»: el ítem con que X9F0 llama al sub-flujo «Plan · segunda mitad» cuando NO hay compuerta (sin_compuerta:true). Es el mismo sobre que la compuerta guarda.
const c = $('Ciclo · armar cierres').first().json
return [{ json: Object.assign({}, c.sobre, { aprobacion_id: null, origen: 'planeacion/directo' }) }]
