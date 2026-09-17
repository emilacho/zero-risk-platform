// E87 · CC#1 · 2026-09-17 · Journey B · GUARDA antes de cada ingesta al CEREBRO
//
// 🔴 ANTES: si el empleado no devolvía respuesta, el nodo de ingesta guardaba en el CEREBRO del
// cliente el texto «step-N pending · upstream agent did not return response.» como si fuera
// conocimiento (E86 ③-c). Canon de la casa: al cerebro sólo va output calificado y aprobado.
// Un marcador de error ahí es contaminación, y sale caro de limpiar.
//
// AHORA: sólo se ingiere lo que vino con `success:true` y una `response` de texto no vacía.
// Todo lo demás es «no sé»: se PARA ruidoso (el avisador de errores lo lleva a #alertas) y NO se escribe nada.
const PASO = '__STEP__';
let j = null;
try { j = $('__STEP__').first().json; } catch (e) { j = null; }
const b = (j && j.body && typeof j.body === 'object') ? j.body : j;
const ok = !!b && typeof b === 'object' && !Array.isArray(b) && b.success === true
  && typeof b.response === 'string' && b.response.trim().length > 0
  && !/did not return response/i.test(b.response);
if (!ok) {
  const motivo = !b ? 'sin respuesta' : (b.success !== true ? 'sin success:true' + (b.error ? ' · ' + String(b.error).slice(0, 120) : '') : 'response vacia');
  throw new Error('RESPUESTA_PERDIDA · ' + PASO + ' · no se · ' + motivo + ' · NO se ingiere nada al CEREBRO (un marcador de error no es conocimiento) · corrida ' + $execution.id);
}
return [{ json: Object.assign({}, $input.first().json, { _respuesta_verificada: PASO }) }];
