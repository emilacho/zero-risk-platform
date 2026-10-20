// CC#1 · 20-oct · LA OFICINA FINANCIERA CIERRA SOLA (encargo Lenovo 19:35 · parte 4).  node construir-fin-cierra-2026-10-20.mjs   → ANTES (respaldo del vivo) → ARREGLADO
// Causa raíz (medida en las dos pruebas): «FIN · decidir» corta la conversación a los 15 min (`PLAZO_MS = 900000`) y la oficina real tarda 19-22 min (13 pasos secuenciales de 33-250 s cada uno): el plan
// se va con «vencido» y el encargo se queda `en_curso` para siempre (la ronda 2, `calculo_2` · `cierre_2` · `firma`, no corre nunca). Cambia SOLO dos nodos de la planeación:
//  1. «FIN · decidir»: plazo de 30 min (lo medido + ~35 % de margen) y, si aun así vence, le pide a la plataforma que CIERRE el encargo (`cerrar_antes`), no solo que se abandone.
//  2. «FIN · leer el encargo»: con `cerrar_antes` manda `accion: 'cerrar'` (la plataforma lo cierra por plazo: estado terminal, sin firma, US$ 0); si no, `leer` como siempre.
// Nada cambia en nodos ni cables; lo que el plan lee de la oficina (`vencido`) es lo mismo que hoy.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODOS = { decidir: 'FIN · decidir', leer: 'FIN · leer el encargo' }
export const PLAZO_NUEVO_MS = 1800000
const unaVez = (s, viejo, nuevo, que) => {
  const n = s.split(viejo).length - 1
  if (n !== 1) throw new Error(`${que}: el ancla aparece ${n} veces (debe ser 1) · rehacer desde el vivo`)
  return s.replace(viejo, () => nuevo)
}
export function cambiarDecidir(codigo) {
  if (codigo.includes('cerrar_antes')) throw new Error('«FIN · decidir» ya cierra por plazo · no construir dos veces')
  let s = unaVez(codigo, 'const PLAZO_MS = 900000', `// plazo de la oficina: lo MEDIDO en las dos pruebas del 20-oct fue 19-22 min de principio a firma; 30 min deja ~35 % de margen (antes 15: vencía con la ronda 2 a medias)\nconst PLAZO_MS = ${PLAZO_NUEVO_MS}`, 'plazo')
  s = unaVez(s, "finanzas_motivo: 'vencido', detalle: 'la oficina no terminó a tiempo' } }]", "finanzas_motivo: 'vencido', detalle: 'la oficina no terminó a tiempo', leer: true, cerrar_antes: true } }]", 'vencido')
  return s
}
export function cambiarLeer(jsonBody) {
  if (jsonBody.includes('cerrar_antes')) throw new Error('«FIN · leer el encargo» ya cierra por plazo · no construir dos veces')
  return unaVez(jsonBody, "accion: 'leer', encargo_id:", "accion: ($json.cerrar_antes === true ? 'cerrar' : 'leer'), encargo_id:", 'accion')
}
export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const nodo = (n) => { const x = copia.nodes.find((y) => y.name === n); if (!x) throw new Error('falta el nodo ' + n); return x }
  nodo(NODOS.decidir).parameters.jsCode = cambiarDecidir(nodo(NODOS.decidir).parameters.jsCode)
  nodo(NODOS.leer).parameters.jsonBody = cambiarLeer(nodo(NODOS.leer).parameters.jsonBody)
  return copia
}
const aqui = dirname(fileURLToPath(import.meta.url))
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const w = JSON.parse(fs.readFileSync(join(aqui, 'planeacion-ANTES-fin-cierra-2026-10-20.json'), 'utf8'))
  const nuevo = construirFlujo(w)
  fs.writeFileSync(join(aqui, 'planeacion-ARREGLADO-fin-cierra-2026-10-20.json'), JSON.stringify(nuevo, null, 2))
  console.log('escrito · nodos', nuevo.nodes.length)
}
