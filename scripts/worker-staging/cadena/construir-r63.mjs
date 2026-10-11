// Relevo 63 / encargo 61 (CC#1 2026-10-11) · la copia de la parte «por filas» (BNXqlaX1oHSfZIpF) deja la FAMILIA de la oficina por brief. Desde la raíz del repo:
//   node scripts/worker-staging/cadena/construir-r63.mjs
// Parte del respaldo ANTES (el flujo vivo) y escribe el ARREGLADO · NO toca n8n (eso lo hace n8n-flujo.mjs restaurar --ejecutar). Todo apagado: el flujo sigue inactivo.
// Qué cambia (solo el nodo «④ Chequeos»): cada fila del lote ya trae `familia` (la sacó `/api/cadena/filas` de `cadena_formatos_por_red.familia`: un DATO, no un rubro).
// El parte guarda en `provenance_tag.familias_por_brief` [{brief_id, fila_id, familia|null}]: quien emita el sobre `brief/parte-listo · producir` (autoproducir, apagado; o un humano) lee de ahí.
// Lo que no tiene sala → familia null → el sobre va sin `familia` y la pieza simple lo atiende como hoy. NADIE emite el sobre desde aquí: este flujo no despacha producción.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
export const NODO = '④ Chequeos'
const lf = (s) => String(s ?? '').replace(/\r\n/g, '\n')
function cambia(codigo, a, b, donde) {
  const c = lf(codigo)
  const n = c.split(a).length - 1
  if (n !== 1) throw new Error(`${donde}: el ancla aparece ${n} veces (esperaba 1): ${a.slice(0, 80)}`)
  return c.replace(a, b)
}

export function construirCodigo(antes) {
  if (lf(antes).includes('familias_por_brief')) throw new Error('④ Chequeos ya trae r63 · no construir dos veces')
  let c = antes
  c = cambia(c, 'const fila_parte = {', `// r63 (relevo 61) · la FAMILIA de la oficina por brief. Sale del dato de cada fila (\`familia\`, de cadena_formatos_por_red); sin familia = sin sala = pieza simple, como hoy. Este flujo NO emite ningún sobre de producción.
const familiaPorFila = {}
;(Array.isArray(c.filas_lote) ? c.filas_lote : []).forEach(function (f) { if (f && f.id) familiaPorFila[f.id] = (typeof f.familia === 'string' && f.familia.trim()) ? f.familia.trim() : null })
const familias_por_brief = (ext.legible ? parte.entregables : []).map(function (e) {
  return { brief_id: e && e.id ? String(e.id) : null, fila_id: e && e.fila_id ? String(e.fila_id) : null, familia: (e && e.fila_id && familiaPorFila[e.fila_id]) || null }
})
const fila_parte = {`, '④ Chequeos · familia')
  c = cambia(c, '    fila_ids: c.fila_ids,\n', '    fila_ids: c.fila_ids,\n    familias_por_brief: familias_por_brief,   // r63 · [{brief_id, fila_id, familia|null}]\n', '④ Chequeos · provenance_tag')
  return c
}

export function construirFlujo(antes) {
  const f = JSON.parse(JSON.stringify(antes))
  const n = f.nodes.find((x) => x.name === NODO)
  if (!n) throw new Error(`no encontré «${NODO}»`)
  n.parameters.jsCode = construirCodigo(n.parameters.jsCode)
  n.notes = ((n.notes || '') + '\nr63 · provenance_tag.familias_por_brief: la familia de la oficina por brief (dato de cadena_formatos_por_red.familia) · null = pieza simple.').trim()
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-r63.mjs')) {
  const antes = JSON.parse(readFileSync(join(aqui, 'parte-por-filas-ANTES-r63.json'), 'utf8'))
  writeFileSync(join(aqui, 'parte-por-filas-ARREGLADA-r63.json'), JSON.stringify(construirFlujo(antes), null, 1) + '\n')
  console.log('construida · «④ Chequeos» deja familias_por_brief')
}
