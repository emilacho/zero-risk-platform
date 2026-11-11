// FECHAS · EL TEXTO DE LOS PDF OFICIALES · CC3 · 2026-11-11 · GO Lenovo 19:30 (opción b, para cualquier país · certifica CC7).
// SIN red: parte del respaldo EXACTO del vivo (`fechas-ANTES-leer-pdf-2026-11-11.json`, sacado con `scripts/ops/n8n-flujo.mjs respaldar`; era igual al publicado
// de las 14:35Z) y escribe `fechas-ARREGLADO-leer-pdf-2026-11-11.json`, que cambia SOLO esto:
//   · «② Juntar las páginas»: además anota en `pdfs_por_leer` los PDF que descarta (código de `nodos/fechas-juntar.js`, el que prueba el simulador);
//   · 3 nodos NUEVOS, iguales a los que arma `construir.mjs` (los que prueba el simulador): «② ¿Hay PDF?» → «② Leer los PDF» (acción `leer_pdf`) → «② Sumar los PDF»;
//   · las uniones: «② Juntar» → «② ¿Hay PDF?»; sí → «② Leer los PDF» → «② Sumar los PDF» → «③ Armar preparar»; no → «③ Armar preparar».
// NADA se publica aquí: se aplica con el 🟢 de CC7, n8n en 0/0, sin encargos vivos y `n8n-flujo.mjs restaurar KNkgFo1hulmNY05s <ARREGLADO> --ejecutar`.
// La REVERSA es restaurar el respaldo (`fechas-ANTES-leer-pdf-2026-11-11.json`).
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flujoDeFechas } from './construir.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const ID = 'KNkgFo1hulmNY05s'
export const ANTES = join(AQUI, 'fechas-ANTES-leer-pdf-2026-11-11.json')
export const ARREGLADO = join(AQUI, 'fechas-ARREGLADO-leer-pdf-2026-11-11.json')
export const CAMBIOS = { '② Juntar las páginas': 'fechas-juntar.js' }
export const NUEVOS = ['② ¿Hay PDF?', '② Leer los PDF', '② Sumar los PDF']

export function arreglar(f) {
  if (f.id !== ID) throw new Error(`este arreglo es solo para ${ID}`)
  for (const [nombre, archivo] of Object.entries(CAMBIOS)) {
    const n = f.nodes.find((x) => x.name === nombre)
    if (!n || n.type !== 'n8n-nodes-base.code') throw new Error(`el vivo no tiene el nodo de código «${nombre}»: vuelve a respaldar`)
    n.parameters.jsCode = fs.readFileSync(join(AQUI, 'nodos', archivo), 'utf8').replace(/\r\n/g, '\n')
  }
  if (f.nodes.some((x) => NUEVOS.includes(x.name))) throw new Error('el vivo ya tiene los nodos nuevos: vuelve a respaldar')
  const modelo = flujoDeFechas()
  const juntar = f.nodes.find((x) => x.name === '② Juntar las páginas')
  NUEVOS.forEach((nombre, k) => {
    const n = structuredClone(modelo.nodes.find((x) => x.name === nombre))
    if (!n) throw new Error(`construir.mjs no arma «${nombre}»`)
    // al lado del «② Juntar» del vivo, hacia abajo (la posición no cambia nada de lo que se ejecuta)
    n.position = [juntar.position[0] + 220 * (k + 1), juntar.position[1] + 200]
    f.nodes.push(n)
  })
  const c = f.connections
  const sale = c['② Juntar las páginas']?.main?.[0]
  if (!sale || sale.length !== 1 || sale[0].node !== '③ Armar preparar') throw new Error('«② Juntar» del vivo no va directo a «③ Armar preparar»: vuelve a respaldar')
  const a = (node) => ({ node, type: 'main', index: 0 })
  c['② Juntar las páginas'] = { main: [[a('② ¿Hay PDF?')]] }
  c['② ¿Hay PDF?'] = { main: [[a('② Leer los PDF')], [a('③ Armar preparar')]] }
  c['② Leer los PDF'] = { main: [[a('② Sumar los PDF')]] }
  c['② Sumar los PDF'] = { main: [[a('③ Armar preparar')]] }
  return f
}

if (process.argv[1] && process.argv[1].endsWith('fechas-leer-pdf.mjs')) {
  const f = arreglar(JSON.parse(fs.readFileSync(ANTES, 'utf8')))
  fs.writeFileSync(ARREGLADO, JSON.stringify(f, null, 2) + '\n')
  console.log('escrito', ARREGLADO, '· nodos', f.nodes.length)
}
