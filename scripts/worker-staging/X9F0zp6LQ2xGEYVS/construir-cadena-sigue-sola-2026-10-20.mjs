// CC#2 · 20-oct · PARTE 3 DEL ENCARGO «LIMPIAR Y ARREGLAR» · LA CADENA SIGUE SOLA DESPUÉS DEL PLAN (corregida por Emilio 14:47: nadie nuevo interviene; la revisión del plan es de la `jefatura`).
//   node construir-cadena-sigue-sola-2026-10-20.mjs
// Parte del flujo VIVO de planeación (`planeacion-ARREGLADO-ensayo-sin-manual-2026-10-20.json` = vivo tras la #655) y hace UN solo cambio de conexión:
//  DRIVE FUERA DEL CAMINO CRÍTICO. Medido en la ejecución real 186281: con la credencial de Google caducada la rama «sin PDF» (`Armar el aviso · sin PDF` → `Campana · plan sin PDF`) terminaba ahí
//     y NUNCA corrían `Cable de vuelta · sala`, `BRIEF · sobre` ni `V9 · cerrar la corrida`: la sala no se enteraba de que la planeación acabó y la cadena no seguía. Ahora la campana avisa Y la corrida sigue
//     al cable de vuelta (el plan ya está guardado; el PDF es un documento de cortesía). La alarma roja se queda.
//  (La revisión del plan por la `jefatura` está diseñada y firmada en el diseño v4 §5.1 y NO se construye aquí: ver el papel de la parte 3.)
// Reversa: restaurar `planeacion-ANTES-cadena-sigue-sola-2026-10-20.json` (= el vivo de antes) con `scripts/ops/n8n-flujo.mjs restaurar`.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODOS = { campana: 'Campana · plan sin PDF', cable: 'Cable de vuelta · sala' }

export function construirFlujo(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const por = (n) => { const x = f.nodes.filter((y) => y.name === n); if (x.length !== 1) throw new Error(x.length + ' nodos «' + n + '»'); return x[0] }
  por(NODOS.campana); por(NODOS.cable)
  if (f.connections[NODOS.campana]) throw new Error('la campana ya trae salida (¿ya está aplicado?): el flujo cambió debajo')
  f.connections[NODOS.campana] = { main: [[{ node: NODOS.cable, type: 'main', index: 0 }]] }
  return f
}

const aqui = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && process.argv[1].endsWith('construir-cadena-sigue-sola-2026-10-20.mjs')) {
  const ANTES = join(aqui, 'planeacion-ARREGLADO-ensayo-sin-manual-2026-10-20.json')
  const w = JSON.parse(readFileSync(ANTES, 'utf8'))
  writeFileSync(join(aqui, 'planeacion-ANTES-cadena-sigue-sola-2026-10-20.json'), JSON.stringify(w, null, 2))
  const n = construirFlujo(w)
  writeFileSync(join(aqui, 'planeacion-ARREGLADO-cadena-sigue-sola-2026-10-20.json'), JSON.stringify(n, null, 2))
  console.log('escrito · nodos', n.nodes.length)
}
