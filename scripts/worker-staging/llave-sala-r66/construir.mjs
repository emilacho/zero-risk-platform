// LA LLAVE DE DESPACHO DE LA SALA NO VIAJA EN LA SALIDA DE NINGÚN NODO · CC#2 · 2026-10-11 · relevo 66 (CC#3 certificación r63 §Para-Lenovo (a): «débil y visible en datos de ejecución»)
//
// LO QUE SE ENCONTRÓ (flujos vivos): tres flujos de la oficina COPIABAN la llave que llegó en la cabecera a la SALIDA de un nodo Code (`llave: recibida`, `llave: s.llave`, `llave: c.llave`,
// `llave` en cada ítem del vigía) y los nodos HTTP siguientes la leían con `{{ $json.llave }}`. Una salida de nodo queda guardada en los datos de ejecución de n8n: la llave quedaba escrita ahí.
//   · «Oficina · la puerta» `PzZ3b6cY6DYmIaOQ` (ACTIVA): «⓪ Sobre · llave» → «① ¿Qué pasó?» → ① Abrir el encargo · Pasarela · pieza simple · Turno · arrancar
//   · «Oficina · un turno» `bTbWL9lUvQCfStAz` (inactiva): «⓪ Entrada · llave» → «③ ¿Y ahora?» → ③ Registrar el resultado · ③ Siguiente paso
//   · «Oficina · el vigía» `YCjbIgE1xz7f0Uzb` (inactiva): «① Qué hacer con cada pendiente» → ② Re-armar el paso · Turno · arrancar
// (La puerta de la cadena, Brief y Pieza ya NO la devolvían: la comparan y la ponen en la cabecera con `$env` directo.)
//
// LO QUE SE CONSTRUYE: ningún nodo Code devuelve la llave; cada nodo HTTP la toma de `{{ $env.SALA_DISPATCH_KEY }}` en el momento de enviar (como ya hace la puerta de la cadena).
// La COMPARACIÓN de la llave recibida con la esperada no cambia. No se rota nada.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const FLUJOS = {
  puerta: { id: 'PzZ3b6cY6DYmIaOQ', nombre: 'Oficina · la puerta' },
  turno: { id: 'bTbWL9lUvQCfStAz', nombre: 'Oficina · un turno' },
  vigia: { id: 'YCjbIgE1xz7f0Uzb', nombre: 'Oficina · el vigía' },
}
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']
export const ENV_LLAVE = '{{ $env.SALA_DISPATCH_KEY }}'

/** cambios de CÓDIGO por nodo: [ancla literal, reemplazo, veces esperadas] */
const CODIGO = {
  '⓪ Sobre · llave': [["return [{ json: { body, llave: recibida, tiene_familia:", 'return [{ json: { body, tiene_familia:', 1]],
  '① ¿Qué pasó?': [['const base = { llave: s.llave, cuerpo_original: s.body }', 'const base = { cuerpo_original: s.body }', 1]],
  '⓪ Entrada · llave': [['return [{ json: { llave: recibida, encargo_id:', 'return [{ json: { encargo_id:', 1]],
  '③ ¿Y ahora?': [['{ json: { llave: c.llave, ruta:', '{ json: { ruta:', 2]],
  '② Re-armar · resultado': [['{ json: { llave: i.llave, turno_body:', '{ json: { turno_body:', 1]],
  '① Qué hacer con cada pendiente': [
    ["const llave = String($env.SALA_DISPATCH_KEY || '')\n", '', 1],
    ["{ tipo: 'reanudar', llave, encargo_id:", "{ tipo: 'reanudar', encargo_id:", 1],
    ["{ tipo: 'cable', llave, payload_cable:", "{ tipo: 'cable', payload_cable:", 1],
  ],
}
const crlf = (s) => s.replace(/\r\n/g, '\n')

export function construir(antes) {
  const nodos = antes.nodes.map((n) => JSON.parse(JSON.stringify(n)))
  const tocados = []
  for (const n of nodos) {
    const cambios = CODIGO[n.name]
    if (cambios && typeof n.parameters?.jsCode === 'string') {
      const eraCRLF = n.parameters.jsCode.includes('\r\n')
      let c = crlf(n.parameters.jsCode)
      for (const [ancla, nuevo, veces] of cambios) {
        const hay = c.split(ancla).length - 1
        if (hay !== veces) throw new Error(`${n.name}: el ancla aparece ${hay} veces (debe ser ${veces}) · ${ancla.slice(0, 60)}`)
        c = c.split(ancla).join(nuevo)
      }
      n.parameters.jsCode = eraCRLF ? c.replace(/\n/g, '\r\n') : c
      tocados.push(n.name)
    }
    const t = JSON.stringify(n.parameters ?? {})
    if (n.type === 'n8n-nodes-base.httpRequest' && t.includes('{{ $json.llave }}')) {
      n.parameters = JSON.parse(t.split('{{ $json.llave }}').join(ENV_LLAVE))
      tocados.push(n.name)
    }
  }
  const settings = {}
  for (const k of SETTINGS_OK) if (antes.settings?.[k] !== undefined) settings[k] = antes.settings[k]
  return { flujo: { name: antes.name, nodes: nodos, connections: antes.connections, settings }, tocados }
}

/** comprobación de la regla: ningún nodo Code devuelve/copia la llave y ningún nodo lee `.llave` de otro */
export function llavesEnSalida(flujo) {
  const malos = []
  for (const n of flujo.nodes) {
    const t = JSON.stringify(n.parameters ?? {})
    if (/\$json\.llave\b|\.json\.llave\b|\bllave:\s*(recibida|s\.llave|c\.llave)\b|\{\s*tipo:\s*'[a-z]+',\s*llave\b|\bjson:\s*\{[^}]*\bllave\b\s*[,:]/.test(t)) malos.push(n.name)
  }
  return malos
}

if (process.argv[1] && process.argv[1].endsWith('construir.mjs')) {
  for (const [k, f] of Object.entries(FLUJOS)) {
    const antes = JSON.parse(readFileSync(join(aqui, `${k}-ANTES-2026-10-11-r66.json`), 'utf8'))
    const { flujo, tocados } = construir(antes)
    writeFileSync(join(aqui, `${k}-ARREGLADO-2026-10-11-r66.json`), JSON.stringify(flujo))
    console.log(k, f.id, 'nodos tocados:', tocados.join(' | '), '· aún con llave en salida:', llavesEnSalida(flujo).join(', ') || 'ninguno')
  }
}
