// «Fotos de competencia y referencias» en el Servicio de Apify (3lyknrP3PoS2KzUf) · CC-CEREBRO · 2026-10-27 · permiso de Emilio «dale» (encargo fotos-competencia-y-dos-rarezas).
// Cambia SOLO el código de «Fotos · lista» (Mapas, sitios de competidores y anuncios también dejan fotos, con su origen) y de «Fotos · revisar» (el mismo archivo = una foto en todo el cliente).
// No agrega nodos ni toca conexiones. Requiere la migración 202610272200 (owner_role admite 'referencia').
//   node construir-fotos-competencia.mjs ANTES.json   → lee el flujo vivo ya respaldado y escribe servicio-apify-ARREGLADO-fotos-competencia-2026-10-27.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codigoDeNodo } from './construir-contexto-fotos.mjs'

export const NODOS_QUE_CAMBIAN = { lista: 'Fotos · lista', revisar: 'Fotos · revisar' }

/** devuelve una COPIA del flujo con el código de los dos nodos cambiado; conserva los fines de línea del nodo que reemplaza */
export function aplicarFotosDeCompetencia(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  let cambiados = 0
  for (const [clave, nombre] of Object.entries(NODOS_QUE_CAMBIAN)) {
    const n = w.nodes.find((x) => x.name === nombre)
    if (!n) throw new Error('el flujo no trae el nodo «' + nombre + '»')
    const nuevo = codigoDeNodo(clave)
    if (n.parameters.jsCode.replace(/\r\n/g, '\n') === nuevo.replace(/\r\n/g, '\n')) continue
    n.parameters = { ...n.parameters, jsCode: n.parameters.jsCode.includes('\r\n') ? nuevo.replace(/\r?\n/g, '\r\n') : nuevo }
    cambiados++
  }
  if (!cambiados) throw new Error('los dos nodos ya tienen las fotos de competencia')
  if (!codigoDeNodo('lista').includes('fotosDeOtrasFuentes(')) throw new Error('el código nuevo no usa fotosDeOtrasFuentes')
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-fotos-competencia.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const entrada = process.argv[2]
  if (!entrada) { console.error('uso: node construir-fotos-competencia.mjs <ANTES.json>'); process.exit(2) }
  const antes = JSON.parse(fs.readFileSync(entrada, 'utf8'))
  fs.writeFileSync(join(aqui, 'servicio-apify-ARREGLADO-fotos-competencia-2026-10-27.json'), JSON.stringify(aplicarFotosDeCompetencia(antes), null, 2))
  console.log('escrito servicio-apify-ARREGLADO-fotos-competencia-2026-10-27.json')
}
