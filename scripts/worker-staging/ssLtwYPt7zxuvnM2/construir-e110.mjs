// E110 · lado del CIMIENTO · los 2 renglones de E109 en «[BB] Fan-out prep» (materia en el grounding de las lentes)
// + el cambio nuevo: «[BB] Judge prep» ve la MISMA materia del cliente (sitio + Instagram propio + idioma) en su
// evidencia, con el mismo tope que las lentes (3.500 + 1.000), como bloque propio DESPUÉS del ICP y ANTES de los
// campos no gateados · cede con espacio declarado (_materia_chars · _materia_recortada). NO se toca la vara ni el
// prompt (PROSA) del juez.
//
// node scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-e110.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { construir as construirE109 } from './construir-e109.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
export const JUDGE = '[BB] Judge prep'
export const TOPE_SITIO_JUEZ = 3500 // mismo tope que las lentes (Transform · E109)
export const TOPE_IG_JUEZ = 1000

const A1 = "const icpBlock = icpCrudo.slice(0, Math.min(1900, espacioIcp));\nconst _icp_chars = icpBlock.length;\nconst _icp_recortado = icpBlock.length < icpCrudo.length;   // ← nunca silencioso\n"
const B1 = A1 + `
// E110 (CC#1 2026-09-22) · LA MATERIA DEL CLIENTE también la ve el juez: lo verdadero del sitio (precios · horario ·
// PedidosYa · Club · combos) y del Instagram propio no puede puntuar como inventado. Mismos topes por campo que
// las lentes (sitio ${TOPE_SITIO_JUEZ} · Instagram ${TOPE_IG_JUEZ}) · idioma primero (corto, sobrevive) · bloque propio DESPUÉS del ICP y
// ANTES de los no gateados · cede SÓLO por presupuesto y lo declara · la vara y la PROSA no cambian.
const _mat = (g.materia_cliente && typeof g.materia_cliente === 'object') ? g.materia_cliente : null;
const _matSitio = _mat ? String(_mat.sitio_texto || '').slice(0, ${TOPE_SITIO_JUEZ}) : '';
const _matIg = _mat ? String(_mat.instagram_propio || '').slice(0, ${TOPE_IG_JUEZ}) : '';
const materiaCrudo = _mat ? (
  '\\nMATERIA DEL CLIENTE (texto real · evidencia primaria):\\n' +
  (_mat.idioma ? 'IDIOMA: ' + String(_mat.idioma) + '\\n' : '') +
  (_matSitio ? 'SITIO (' + (Number(_mat.sitio_caracteres_total) || _matSitio.length) + ' chars · primeros ' + _matSitio.length + '):\\n' + _matSitio + '\\n' : '') +
  (_matIg ? 'INSTAGRAM PROPIO:\\n' + _matIg + '\\n' : '')
) : '';
const espacioMateria = Math.max(0, TOPE_TASK - (FIJO + camposTxt.length + icpBlock.length));
const materiaBlock = materiaCrudo.slice(0, espacioMateria);
const _materia_chars = materiaBlock.length;
const _materia_recortada = materiaBlock.length < materiaCrudo.length;   // ← cedió por presupuesto · nunca silencioso
`
const A2 = "  if (FIJO + icpBlock.length + prueba.length <= TOPE_TASK) { lista = lista.concat([entrada(f)]); camposTxt = prueba; }"
const B2 = "  if (FIJO + icpBlock.length + materiaBlock.length + prueba.length <= TOPE_TASK) { lista = lista.concat([entrada(f)]); camposTxt = prueba; }"
const A3 = "const evidencia = evBase + icpBlock;"
const B3 = "const evidencia = evBase + icpBlock + materiaBlock;   // E110 · la materia entra a la evidencia del juez"
const A4 = "  _icp_recortado,\n"
const B4 = "  _icp_recortado,\n  _materia_chars,        // E110 · cuánto de la materia del cliente vio el juez\n  _materia_recortada,    // E110 · si la materia cedió (nunca silencioso)\n"

export function construir(flujoAntes) {
  const base = construirE109(flujoAntes)
  const n = base.nodes.find((x) => x.name === JUDGE)
  if (!n) throw new Error(`no encontré «${JUDGE}»`)
  const code = String(n.parameters.jsCode)
  if (code.includes('materiaBlock')) throw new Error('Judge prep ya trae E110 · no construir dos veces')
  for (const [a, k] of [[A1, 'A1'], [A2, 'A2'], [A3, 'A3'], [A4, 'A4']]) if (!code.includes(a)) throw new Error(`Judge prep: no encuentro el punto ${k} (c5396c0f)`)
  const nuevo = code.replace(A1, B1).replace(A2, B2).replace(A3, B3).replace(A4, B4)
  if (nuevo.includes('const PROSA =') !== code.includes('const PROSA =') || nuevo.split('THRESHOLD').length !== code.split('THRESHOLD').length) throw new Error('la vara o la PROSA cambiaron · PARO')
  const judge = { ...n, parameters: { ...n.parameters, jsCode: nuevo }, notes: ((n.notes || '') + '\nE110 · la evidencia incluye materia_cliente (idioma + sitio ≤3.500 + Instagram propio ≤1.000 · cede sólo por presupuesto) · vara y prompt intactos.').trim() }
  return { ...base, nodes: base.nodes.map((x) => (x.name === JUDGE ? judge : x)) }
}

const vivo = JSON.parse(readFileSync(join(aqui, 'cimiento-antes-e109-36871fc3.json'), 'utf8'))
const construido = construir(vivo)
writeFileSync(join(aqui, 'cimiento-construido-e110.json'), JSON.stringify(construido, null, 2) + '\n')
console.log('construido ·', construido.nodes.length, 'nodos · Fan-out prep (E109) + Judge prep ve la materia (E110)')
