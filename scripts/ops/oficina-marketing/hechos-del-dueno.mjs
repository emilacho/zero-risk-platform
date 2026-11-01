/**
 * 01-nov · PUNTO 3 del encargo «errores del plan» · LO QUE DECLARÓ EL DUEÑO LLEGA AL REDACTOR DEL PLAN COMO HECHO CON PRECEDENCIA (parte de CC2 del LISTO-CC1-para-certificar-hechos-del-dueno).
 * La plataforma entrega `contexto_del_cliente.hechos_del_dueno: [{ tema, respuesta, sede, frases_negadas }]` (ausente si no hay). «Redactor (B4)» imprime el bloque con el mismo molde del eslogan:
 * sin el campo (o vacío / sin entradas válidas) el pedido queda IDÉNTICO al de hoy. El texto pasa por `limpio` (personas protegidas). Las frases negadas se imprimen como «NO digas ni insinúes».
 */
import { cambiarCodigo } from './lib.mjs'

const ANCLA_BLOQUE = '// 01-nov · EL ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE)'
const BLOQUE = `// 01-nov · LO QUE DECLARÓ EL DUEÑO (hechos con la máxima precedencia) · viene en contexto_del_cliente.hechos_del_dueno = [{ tema, respuesta, sede, frases_negadas }]. Sin entradas válidas, el pedido queda idéntico a hoy.
const bloqueHechosDelDueno = (function () {
  const lista = carpeta && Array.isArray(carpeta.hechos_del_dueno) ? carpeta.hechos_del_dueno : [];
  const una = function (v, tope) { return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, tope); };
  const filas = [];
  for (let i = 0; i < lista.length && filas.length < 20; i++) {
    const h = lista[i];
    if (!h || typeof h !== 'object' || Array.isArray(h)) continue;
    const resp = una(h.respuesta, 500);
    if (!resp) continue;
    const tema = una(h.tema, 120);
    const sede = una(h.sede, 80);
    const neg = (Array.isArray(h.frases_negadas) ? h.frases_negadas : []).map(function (x) { return una(x, 120); }).filter(Boolean).slice(0, 6);
    filas.push('- ' + (tema ? limpio(tema) + ' ' : '') + (sede ? '[sede: ' + limpio(sede) + '] ' : '') + '→ ' + limpio(resp) + (neg.length ? ' · NO digas ni insinúes: ' + neg.map(function (x) { return '«' + limpio(x) + '»'; }).join(', ') : ''));
  }
  if (!filas.length) return [];
  return [
    '══════ LO QUE DECLARÓ EL DUEÑO (hechos con la MÁXIMA precedencia) ══════',
    ...filas,
    'REGLA DEL PLAN: esto lo dijo el dueño y manda sobre el manual, la carpeta, el cerebro y cualquier otra fuente. Úsalo como hecho; no lo suavices, no lo condiciones y no escribas nada que lo contradiga (incluida la idea de marca). Si otra fuente dice lo contrario, gana lo del dueño y lo dices en una línea.',
    '',
  ];
})();
`
const ANCLA_USO = '...bloqueEslogan,\n'

export function construirHechosDelDuenoEnPlan(f) {
  cambiarCodigo(f, 'Redactor (B4)', ANCLA_BLOQUE, BLOQUE + ANCLA_BLOQUE)
  cambiarCodigo(f, 'Redactor (B4)', ANCLA_USO, ANCLA_USO + '...bloqueHechosDelDueno,\n')
}
