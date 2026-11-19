// sabotajes G2c · deshace UN reemplazo a la vez en nuevo/ (copia en memoria, se restaura siempre) y corre la prueba
const fs = require('fs'), path = require('path'), { execSync } = require('child_process')
const DIR = 'scripts/worker-staging/g2c-enteros'
const { REEMPLAZOS } = require(path.resolve(DIR, 'reemplazos.cjs'))
const T = '__tests__/g2c-enteros-en-los-flujos.test.ts'
const corre = () => { try { execSync(`npx vitest run ${T}`, { stdio: 'pipe' }); return 'VERDE' } catch (e) { const m = /(\d+) failed/.exec(String(e.stdout)); return `ROJO ${m ? m[1] : '?'}` } }
// sabotajes extra que no son un reemplazo deshecho
const EXTRA = [
  ['x1 el redactor corta los hechos a 2000', 'X9F0zp6LQ2xGEYVS', 'Redactor (B4)', 'const resp = una(h.respuesta, 100000);', 'const resp = una(h.respuesta, 2000);'],
  ['x2 unir corta a 50 respuestas', 'X9F0zp6LQ2xGEYVS', 'Unir el texto libre del dueño al paquete', 'const items = lista.map(function (x) {', 'const items = lista.slice(0, 40).map(function (x) {'],
  ['x3 no declara el recorte de la lectura', 'X9F0zp6LQ2xGEYVS', 'Unir el texto libre del dueño al paquete', 'texto_libre_recortado_por_la_lectura: !!(cuerpo && cuerpo.recortado === true)', 'texto_libre_recortado_por_la_lectura: false'],
  ['x4 el presupuesto de la mesa creativa vuelve a 15500', 'ssLtwYPt7zxuvnM2', '[BB] Equipo · mesa creativa · preparar', 'const PRESUPUESTO_TAREA = 1490000;', 'const PRESUPUESTO_TAREA = 15500;'],
]
const casos = []
for (const id of Object.keys(REEMPLAZOS)) REEMPLAZOS[id].forEach(([nodo, campo, a, b], k) => casos.push([`r${id.slice(0, 4)}-${k + 1} deshacer «${nodo}» ${a.slice(0, 50)}`, id, nodo, b, a, campo]))
for (const [n, id, nodo, a, b] of EXTRA) casos.push([n, id, nodo, a, b, 'jsCode'])
console.log('control', corre())
for (const [n, id, nodo, a, b, campo] of casos) {
  const p = path.join(DIR, 'nuevo', id + '.json'); const orig = fs.readFileSync(p, 'utf8'); const w = JSON.parse(orig)
  let k = 0
  for (const x of w.nodes) { if (!(nodo.startsWith('*') ? x.name.includes(nodo.slice(1, -1)) : x.name === nodo)) continue; const t = x.parameters[campo]; if (typeof t !== 'string' || !t.includes(a)) continue; x.parameters[campo] = t.split(a).join(b); k++ }
  if (!k) { console.log(n, 'NO APLICA'); continue }
  fs.writeFileSync(p, JSON.stringify(w, null, 2) + '\n')
  try { console.log(n, `(${k}×)`, corre()) } finally { fs.writeFileSync(p, orig) }
}
console.log('control final', corre())
