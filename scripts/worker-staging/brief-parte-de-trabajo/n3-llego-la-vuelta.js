// ③ ¿LLEGÓ LA VUELTA, O SE AGOTÓ LA ESPERA? · CC#1 · 2026-09-29 · mismo criterio que planeación (12-sep).
// El Wait sigue por la MISMA salida si contesta y si nadie contesta: sin esta distinción una espera agotada se vería
// igual que una vuelta vacía y la corrida se iría «exitosa» sin parte.
const c = $('③ Armar el cuerpo del redactor').first().json
const e = $input.first().json || {}
const cuerpo = e.body ? e.body : e
let texto = String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '')
const llegoReal = texto.trim().length > 0
// Simulacro SOLO en modo seco (nunca cobra): permite ejercitar los chequeos con datos de forma real. En modo real no aplica.
let simulacro_usado = false
if (c.dry_run === true && c.simulacro_respuesta) {
  texto = c.simulacro_respuesta
  simulacro_usado = true
}
const llego = texto.trim().length > 0
return [{
  json: {
    ...c,
    llego_la_vuelta: llego,
    vuelta_real: llegoReal,
    simulacro_usado,
    texto,
    caracteres: texto.length,
    // la vuelta trae `cost_usd` (snake_case) · antes se leía `costUsd` y salía siempre vacío (medido en la corrida del 29-sep)
    vuelta_costo_usd: typeof cuerpo.cost_usd === 'number' ? cuerpo.cost_usd : (typeof cuerpo.costUsd === 'number' ? cuerpo.costUsd : null),
    vuelta_modelo: cuerpo.model || null,
    motivo: llego ? null : 'la vuelta del redactor NO llegó · se agotó la espera · el parte puede haberse escrito igual y estar en el corredor · NO se da por exitosa',
  },
}]
