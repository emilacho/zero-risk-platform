// LA VUELTA DEL AGENTE · 21-nov · opción A (GO Lenovo 02:47Z · CC1) · lo que dejó el Wait, con la MISMA forma que tenía la llamada de antes
// (`{ statusCode, body }`), para que «Armar guardar» no cambie.
// El Wait sigue por la MISMA salida cuando llega la vuelta y cuando se agota la espera. Si se agota, sale lo que entró: el acuse 202 de run-sdk.
// Una espera agotada NO es una vuelta vacía: se guarda como llamada FALLIDA, con sus palabras. El agente puede haber terminado igual; el plazo de
// la corrida (62 min) cubre la espera, así que el vigía no relanza encima de un agente vivo.
const e = $input.first().json || {}
if (Number(e.statusCode) === 202) {
  return [{ json: { error: { message: 'LA_VUELTA_NO_LLEGO · se agotó la espera de @@ESPERA_S@@ s; el agente puede haber terminado igual' } } }]
}
const b = e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}
return [{ json: { statusCode: 200, body: b } }]
