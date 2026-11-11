// FECHAS · SOLO CUENTA COMO PÁGINA LA QUE TRAE TEXTO · CC3 · 2026-11-11 · arreglo genérico de CC7 (RESPUESTA 10-nov «fuentes oficiales de Ecuador»).
// SIN red: parte del respaldo EXACTO del vivo (`fechas-ANTES-solo-texto-2026-11-11.json`, sacado con `scripts/ops/n8n-flujo.mjs respaldar`) y escribe
// `fechas-ARREGLADO-solo-texto-2026-11-11.json`, que cambia SOLO el código de dos nodos por el de `nodos/` (la misma fuente que prueba el simulador):
//   · «② Juntar las páginas»: un PDF, una imagen o una página sin texto legible se descartan con su razón (no llaman al agente).
//   · «③ Armar preparar»: las descartadas viajan a `preparar`, que dice por qué el tipo quedó sin fuente.
// NADA se publica aquí: se aplica con la certificación de CC7, n8n en 0/0 y `n8n-flujo.mjs restaurar KNkgFo1hulmNY05s <ARREGLADO> --ejecutar`.
// La REVERSA es restaurar el respaldo.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
export const ID = 'KNkgFo1hulmNY05s'
export const ANTES = join(AQUI, 'fechas-ANTES-solo-texto-2026-11-11.json')
export const ARREGLADO = join(AQUI, 'fechas-ARREGLADO-solo-texto-2026-11-11.json')
// 11-nov 19:xxZ · el nodo «② Juntar» siguió cambiando (opción b, `fechas-leer-pdf.mjs`): este registro queda CONGELADO con el código que se publicó a las 14:35Z
export const CAMBIOS = { '② Juntar las páginas': 'historico/fechas-juntar-solo-texto-2026-11-11.js', '③ Armar preparar': 'fechas-armar-preparar.js' }

export function arreglar(f) {
  if (f.id !== ID) throw new Error(`este arreglo es solo para ${ID}`)
  for (const [nombre, archivo] of Object.entries(CAMBIOS)) {
    const n = f.nodes.find((x) => x.name === nombre)
    if (!n || n.type !== 'n8n-nodes-base.code') throw new Error(`el vivo no tiene el nodo de código «${nombre}»: vuelve a respaldar`)
    n.parameters.jsCode = fs.readFileSync(join(AQUI, 'nodos', archivo), 'utf8').replace(/\r\n/g, '\n')
  }
  return f
}

if (process.argv[1] && process.argv[1].endsWith('fechas-solo-texto.mjs')) {
  const f = arreglar(JSON.parse(fs.readFileSync(ANTES, 'utf8')))
  fs.writeFileSync(ARREGLADO, JSON.stringify(f, null, 2) + '\n')
  console.log('escrito', ARREGLADO, '· nodos', f.nodes.length)
}
