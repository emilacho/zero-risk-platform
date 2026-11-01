// CICLO DEL PLAN · tramo 2 · CC2 · «Compuerta · esperar al dueño»: la corrida real TERMINA aquí. El plan quedó guardado, revisado por la jefatura y con su compuerta abierta (plan_aprobaciones);
// el PDF, el cable a la sala y el brief salen cuando el dueño aprueba (puerta `plan-aprobar` → sub-flujo «Plan · segunda mitad»). No hay nada que esperar dentro de n8n.
const c = $('Ciclo · armar cierres').first().json
const k = $('Ciclo · comprobar').first().json
return [{ json: {
  parado_en: 'compuerta', plan_id: c.plan_id, version: c.version, aprobacion_id: k.aprobacion_id || null,
  con_pendientes: !!(c.sobre && c.sobre.con_pendientes),
  nota: 'el plan espera la aprobación del dueño; sin ella no salen el PDF ni el brief',
} }]
