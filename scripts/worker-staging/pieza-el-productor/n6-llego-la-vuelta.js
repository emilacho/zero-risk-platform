// ⑥ ¿LLEGÓ LA VUELTA, O SE AGOTÓ LA ESPERA? · CC#1 · 2026-10-01 · mismo criterio que el brief y planeación.
// El Wait sigue por la MISMA salida si contesta y si nadie contesta: sin esta distinción una espera agotada se vería igual que una vuelta vacía y la corrida se iría «exitosa» sin pieza.
const c = $('⑤ Armar el cuerpo del productor').first().json
const e = $input.first().json || {}
const cuerpo = e.body ? e.body : e
// 🔴 un FALLO declarado del productor (`success:false` · p. ej. el corte por tope `error_max_budget_usd` o una foto que no baja) NO es una vuelta: su texto, si trae, es PARCIAL y no se lee como pieza
const fallaDelProductor = cuerpo.success === false ? String(cuerpo.error || cuerpo.error_kind || 'sin detalle') : null
const textoParcial = fallaDelProductor && cuerpo.partial === true ? String(cuerpo.response || '') : ''
let texto = fallaDelProductor ? '' : String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '')
const llegoReal = texto.trim().length > 0
// Simulacro SOLO en modo seco (nunca cobra): permite ejercitar los chequeos con datos de forma real. En modo real no aplica.
let simulacro_usado = false
if (c.dry_run === true && c.simulacro_respuesta) {
  texto = c.simulacro_respuesta
  simulacro_usado = true
}
const llego = texto.trim().length > 0
const costo = typeof cuerpo.cost_usd === 'number' ? cuerpo.cost_usd : (typeof cuerpo.costUsd === 'number' ? cuerpo.costUsd : null)
return [{
  json: {
    ...c,
    llego_la_vuelta: llego,
    vuelta_real: llegoReal,
    simulacro_usado,
    texto,
    caracteres: texto.length,
    falla_del_productor: fallaDelProductor,
    texto_parcial: textoParcial,
    parcial_razon: fallaDelProductor && cuerpo.partial === true ? String(cuerpo.partial_reason || 'error_del_sdk') : null,
    vuelta_costo_usd: costo,
    vuelta_modelo: cuerpo.model || null,
    motivo: llego ? null : fallaDelProductor ? ('el productor FALLÓ · ' + fallaDelProductor + ' · NO se da por exitosa') : 'la vuelta del productor NO llegó · se agotó la espera · la pieza puede haberse escrito igual y estar en el corredor · NO se da por exitosa',
  },
}]
