// «El rol de las fotos lo decide la llamada» en el Servicio de Apify (3lyknrP3PoS2KzUf) · CC#1 · 2026-10-21 · ENCARGO manual visual con todas las fuentes, T1 (orden en el alta).
// Hallazgo (df7e47cc, 20-oct): el alta raspó el Instagram propio 19 s después de crear la ficha, antes de que existiera `config.apify.own_handles.instagram`; `Fotos · lista` decidía el rol
// leyendo ESE dato en ese instante y guardó las 11 fotos como «competidor». El piso visual pide «propio» y se quedó sin copias.
// Arreglo: `rolDeLaCuenta` (src/lib/fotos/fotos-contexto-logica.js) → la ficha si ya lo dice; si no, lo que la llamada declara (`metadata.target_kind === 'own'`, perfil único).
// Cambia SOLO el código del nodo «Fotos · lista» (no agrega nodos ni toca conexiones).
//
//   node construir-rol-propio.mjs ANTES.json      → lee el flujo vivo ya respaldado en ANTES.json y escribe ARREGLADO.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { codigoDeNodo } from './construir-contexto-fotos.mjs'

export const NODO = 'Fotos · lista'

/** devuelve una COPIA del flujo con el código de «Fotos · lista» cambiado; conserva los fines de línea del nodo que reemplaza */
export function aplicarRolPropio(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  const n = w.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error('el flujo no trae el nodo «' + NODO + '»')
  const nuevo = codigoDeNodo('lista')
  if (n.parameters.jsCode.replace(/\r\n/g, '\n') === nuevo.replace(/\r\n/g, '\n')) throw new Error('el nodo ya tiene el rol por llamada')
  if (!nuevo.includes('rolDeLaCuenta({')) throw new Error('el código nuevo no usa rolDeLaCuenta')
  n.parameters = { ...n.parameters, jsCode: n.parameters.jsCode.includes('\r\n') ? nuevo.replace(/\r?\n/g, '\r\n') : nuevo }
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-rol-propio.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const entrada = process.argv[2]
  if (!entrada) { console.error('uso: node construir-rol-propio.mjs <ANTES.json>'); process.exit(2) }
  const antes = JSON.parse(fs.readFileSync(entrada, 'utf8'))
  fs.writeFileSync(join(aqui, 'servicio-apify-ARREGLADO-rol-propio-2026-10-21.json'), JSON.stringify(aplicarRolPropio(antes), null, 2))
  console.log('escrito servicio-apify-ARREGLADO-rol-propio-2026-10-21.json')
}
