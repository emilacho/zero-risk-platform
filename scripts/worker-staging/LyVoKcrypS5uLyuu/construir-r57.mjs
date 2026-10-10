// Relevo 57 · el reintento del RE-DESCUBRIMIENTO de la alta: SOLO si la primera llamada FALLÓ (estado de error del corredor), NUNCA por lentitud.
// Parte del alta r54 y cambia el sub-grafo [RD]: (1) se QUITAN «[RD] Flake Check» y «[RD] Re-fire Dispatch» (volvían a disparar si en el sondeo nº 6 el despacho seguía «accepted»: un despacho lento o perdido
// se cobraba dos veces); ahora «¿Error declarado?» = no → sigue esperando en «[RD] Poll Retry Guard» hasta su tope (36 vueltas de 20 s ≈ 12 min) y, si no llega, «[RD] Poll Timeout» falla RUIDOSO (sin pagar de nuevo);
// (2) el tope duro de reintentos tras un error baja de 2 a 1 (como mucho 2 llamadas, y solo si la primera falló). Desde la raiz: node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-r57.mjs
import fs from 'node:fs'
const R = 'scripts/worker-staging/LyVoKcrypS5uLyuu/'
const w = JSON.parse(fs.readFileSync(R + 'alta-ARREGLADA-2026-10-10-r54.json', 'utf8'))
const quitar = ['[RD] Flake Check', '[RD] Re-fire Dispatch']
for (const n of quitar) if (!w.nodes.some((x) => x.name === n)) throw new Error('no hallé ' + n)
w.nodes = w.nodes.filter((x) => !quitar.includes(x.name))
for (const n of quitar) delete w.connections[n]
const err = w.connections['[RD] ¿Error declarado?'].main
if (err[1].length !== 1 || err[1][0].node !== '[RD] Flake Check') throw new Error('la salida «no» de ¿Error declarado? no es la esperada')
err[1] = [{ node: '[RD] Poll Retry Guard', type: 'main', index: 0 }]
for (const [k, v] of Object.entries(w.connections)) for (const a of v.main || []) for (const x of a) if (quitar.includes(x.node)) throw new Error('queda un cable a ' + x.node + ' desde ' + k)
const tope = w.nodes.find((x) => x.name === '[RD] ¿Quedan reintentos?')
const c = tope.parameters.conditions.conditions[0]
if (c.rightValue !== 2) throw new Error('el tope de reintentos no era 2')
c.rightValue = 1
fs.writeFileSync(R + 'alta-ARREGLADA-2026-10-10-r57.json', JSON.stringify(w, null, 1))
console.log('ok · nodos', w.nodes.length)
