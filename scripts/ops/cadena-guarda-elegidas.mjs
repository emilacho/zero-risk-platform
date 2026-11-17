// «PRODUCIR ESTAS FILAS» (CC1 · 17-nov · RESPUESTA Lenovo opción A) · el cambio VIVO del flujo de brief («Cadena · parte por filas», n8n BNXqlaX1oHSfZIpF).
// Cambia UNA línea del nodo «⓪ GUARDA · el lote»: además de una campaña activa, deja pasar una campaña PAUSADA solo si TODAS las filas del lote están en `elegidas`
// (los permisos vigentes que devuelve `filas · listar`, `src/lib/cadena/elegidas.ts`). Nada más del flujo se toca.
//
//   doppler run -p zero-risk -c prd -- node scripts/ops/cadena-guarda-elegidas.mjs --ensayo   --dir <carpeta>   (lee lo vivo, arma el después, compila; NO escribe en n8n)
//   doppler run -p zero-risk -c prd -- node scripts/ops/cadena-guarda-elegidas.mjs --aplicar  --dir <carpeta>   (respaldo exacto, PUT, re-registro, lectura de vuelta)
//   doppler run -p zero-risk -c prd -- node scripts/ops/cadena-guarda-elegidas.mjs --reversa  --dir <carpeta>   (vuelve la línea vieja SOLO si lo vivo es exactamente el después)
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ID = 'BNXqlaX1oHSfZIpF'
const NODO = '⓪ GUARDA · el lote'
export const ANTES = "if (b.campana.estado !== 'activa') throw new Error('PARTE_CAMPANA_NO_ACTIVA · la campaña está ' + String(b.campana.estado) + ' · no se briefea · se DETIENE y NO escribe nada')"
export const DESPUES = [
  "// 17-nov · «producir estas filas» (CC1 · opción A de Lenovo): una campaña PAUSADA pasa SOLO si todas las filas del lote tienen permiso vigente (`elegidas` de `filas · listar`)",
  "const elegidas = Array.isArray(b.elegidas) ? b.elegidas : []",
  "const loteElegido = b.campana.estado === 'pausada' && Array.isArray(s.fila_ids) && s.fila_ids.length > 0 && s.fila_ids.every((id) => elegidas.indexOf(id) !== -1)",
  "if (b.campana.estado !== 'activa' && !loteElegido) throw new Error('PARTE_CAMPANA_NO_ACTIVA · la campaña está ' + String(b.campana.estado) + (b.campana.estado === 'pausada' ? ' y el lote trae filas sin permiso de «producir estas filas»' : '') + ' · no se briefea · se DETIENE y NO escribe nada')",
].join('\n')

/** el código del nodo después del cambio · lanza si la línea vieja no está exactamente una vez */
export function guardaDespues(codigo) {
  const n = codigo.split(ANTES).length - 1
  if (n !== 1) throw new Error(`la línea de la guarda aparece ${n} veces (se esperaba 1): lo vivo no es lo que se leyó · no se toca`)
  return codigo.replace(ANTES, DESPUES)
}
export function guardaAntes(codigo) {
  const n = codigo.split(DESPUES).length - 1
  if (n !== 1) throw new Error(`el bloque nuevo aparece ${n} veces (se esperaba 1): lo vivo no es el después · no se revierte`)
  return codigo.replace(DESPUES, ANTES)
}
/** compila el cuerpo como lo hace el nodo Code (función async con `$` e `$input`) */
export function compila(codigo) { new Function('$', '$input', `return (async () => {\n${codigo}\n})()`) }

async function main() {
  const modo = process.argv.find((a) => ['--ensayo', '--aplicar', '--reversa'].includes(a))
  const di = process.argv.indexOf('--dir')
  const dir = di > -1 ? process.argv[di + 1] : null
  if (!modo || !dir) throw new Error('uso: --ensayo|--aplicar|--reversa --dir <carpeta>')
  mkdirSync(dir, { recursive: true })
  const B = String(process.env.N8N_BASE_URL || '').replace(/\/$/, ''), K = process.env.N8N_API_KEY
  if (!B || !K) throw new Error('faltan N8N_BASE_URL / N8N_API_KEY')
  const api = async (method, path, body) => {
    const r = await fetch(`${B}/api/v1${path}`, { method, headers: { 'X-N8N-API-KEY': K, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const t = await r.text(); if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 300)}`)
    return t ? JSON.parse(t) : null
  }
  const vivo = await api('GET', `/workflows/${ID}`)
  const hora = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(join(dir, `${ID}-antes-${hora}.json`), JSON.stringify(vivo, null, 2))
  const nodo = vivo.nodes.find((n) => n.name === NODO)
  if (!nodo) throw new Error(`no está el nodo «${NODO}»`)
  const nuevo = modo === '--reversa' ? guardaAntes(nodo.parameters.jsCode) : guardaDespues(nodo.parameters.jsCode)
  compila(nuevo)
  const despues = { ...vivo, nodes: vivo.nodes.map((n) => (n.name === NODO ? { ...n, parameters: { ...n.parameters, jsCode: nuevo } } : n)) }
  writeFileSync(join(dir, `${ID}-despues-${modo.slice(2)}-${hora}.json`), JSON.stringify(despues, null, 2))
  const otros = vivo.nodes.filter((n, i) => n.name !== NODO && JSON.stringify(n) !== JSON.stringify(despues.nodes[i])).length
  console.log(JSON.stringify({ modo, flujo: vivo.name, activo: vivo.active, nodos: vivo.nodes.length, otros_nodos_cambiados: otros, compila: true }))
  if (modo === '--ensayo') return
  const { name, nodes, connections, settings } = despues
  await api('PUT', `/workflows/${ID}`, { name, nodes, connections, settings })
  if (vivo.active) { await api('POST', `/workflows/${ID}/deactivate`); await api('POST', `/workflows/${ID}/activate`) }
  const vuelta = await api('GET', `/workflows/${ID}`)
  writeFileSync(join(dir, `${ID}-vuelta-${modo.slice(2)}-${hora}.json`), JSON.stringify(vuelta, null, 2))
  const ok = vuelta.nodes.find((n) => n.name === NODO).parameters.jsCode === nuevo && vuelta.active === vivo.active && vuelta.nodes.length === vivo.nodes.length
  console.log(JSON.stringify({ aplicado: ok, activo: vuelta.active, updatedAt: vuelta.updatedAt }))
  if (!ok) process.exitCode = 1
}

if (process.argv[1] && process.argv[1].endsWith('cadena-guarda-elegidas.mjs')) await main()
