/**
 * 01-nov · PUNTO 1 del encargo «errores del plan» · SEDES COMO DATO (parte de CC2 del LISTO-CC1-para-certificar-sedes-como-dato, #821).
 * La plataforma entrega `contexto_del_cliente.sedes: [{ clave, ciudad, datos: [{ campo, valor, fuente }] }]` (ausente si hay menos de dos sedes). «Redactor (B4)» imprime el bloque con el molde del eslogan:
 * cada sede con sus datos y su fuente, y la regla de no mezclarlas. Sin el campo (o sin entradas válidas) el pedido queda IDÉNTICO al de hoy. Todo texto pasa por `limpio` (personas protegidas).
 * Declarado: esto es instrucción al modelo; el control por código de precios por sede espera el dato de «de qué sede es cada página» (lo plantea CC1 a Lenovo).
 */
import { cambiarCodigo } from './lib.mjs'

const ANCLA_BLOQUE = '// 01-nov · LO QUE DECLARÓ EL DUEÑO (hechos con la máxima precedencia)'
export const BLOQUE_SEDES = `// 01-nov · SEDES DEL CLIENTE (cada dato es de SU sede) · viene en contexto_del_cliente.sedes = [{ clave, ciudad, datos: [{ campo, valor, fuente }] }]. Sin entradas válidas, el pedido queda idéntico a hoy.
const bloqueSedes = (function () {
  const lista = carpeta && Array.isArray(carpeta.sedes) ? carpeta.sedes : [];
  const una = function (v, tope) { return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, tope); };
  const sedes = [];
  for (let i = 0; i < lista.length && sedes.length < 10; i++) {
    const s = lista[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const ciudad = una(s.ciudad, 80), clave = una(s.clave, 60);
    if (!ciudad && !clave) continue;
    const datos = [];
    const ds = Array.isArray(s.datos) ? s.datos : [];
    for (let j = 0; j < ds.length && datos.length < 12; j++) {
      const d = ds[j];
      if (!d || typeof d !== 'object' || Array.isArray(d)) continue;
      const campo = una(d.campo, 60), valor = una(d.valor, 200);
      if (!campo || !valor) continue;
      const fuente = una(d.fuente, 80);
      datos.push('   · ' + limpio(campo) + ': ' + limpio(valor) + (fuente ? ' (fuente: ' + limpio(fuente) + ')' : ''));
    }
    sedes.push('- Sede ' + limpio(ciudad || clave) + (ciudad && clave && clave !== ciudad ? ' [' + limpio(clave) + ']' : '') + (datos.length ? ':\\n' + datos.join('\\n') : ': (sin datos guardados)'));
  }
  if (!sedes.length) return [];
  return [
    '══════ SEDES DEL CLIENTE (cada dato es de SU sede) ══════',
    ...sedes,
    'REGLA DEL PLAN: cada dato es de su sede. Dos horarios, cartas o canales de dos sedes NO son una discrepancia. No uses el dato de una sede para otra; si una acción, un precio o un horario vale para una sola sede, di cuál.',
    '',
  ];
})();
`
const ANCLA_USO = '...bloqueHechosDelDueno,\n'

export function construirSedesEnPlan(f) {
  cambiarCodigo(f, 'Redactor (B4)', ANCLA_BLOQUE, BLOQUE_SEDES + ANCLA_BLOQUE)
  cambiarCodigo(f, 'Redactor (B4)', ANCLA_USO, ANCLA_USO + '...bloqueSedes,\n')
}
