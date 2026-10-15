// Reparo de #566 (15-oct · firma de Emilio: «para no tener que regresar a arreglar»): el alta NO lleva una copia de la cadena del portero.
//   node scripts/worker-staging/LyVoKcrypS5uLyuu/construir-una-sola-cadena.mjs
// Parte del respaldo VIVO del alta (118 nodos), quita los 13 nodos copiados y deja UN nodo que llama al flujo del portero (ogfq56oIEoHufFPM) para ese cliente
// (entrada «completar despertar», llave interna, responde al instante: disparar y seguir). El alta queda inactiva.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
export const DESDE = '⑦ Despertar el cerebro (con el raspado del alta)'
export const NODO = '⑧ Completar lo que falta (llama al flujo del portero)'
/** los 13 nodos que #566 copió en el alta (11 de la cadena + 2 adaptadores) */
export const COPIAS = [
  '⓪ Entrada', '① Un elemento por cliente', '① Descubrir (el portero que alimenta)', '① Plan unificado', '② Ampliar (Servicio de Apify)',
  '② bis Artículos (qué leer)', '② bis Leer artículos (Servicio de Apify)', '② ter Reseñas y videos (qué pedir)', '② ter Leer reseñas y videos (Servicio de Apify)',
  '④ Alimentar (filtrar · razonar · archivar)', '④ bis Puente (repetir hasta terminar)', '⑤ Cierre', '⑥ Vigilar (apaga y avisa si algo falla)',
]
export const URL_DEL_PORTERO = "https://n8n-production-72be.up.railway.app/webhook/zero-risk/cerebro-completar-despertar"

export function conUnaSolaCadena(antes) {
  const w = JSON.parse(JSON.stringify(antes))
  const faltan = COPIAS.filter((n) => !w.nodes.some((x) => x.name === n))
  if (faltan.length) throw new Error(`no están las copias de #566: ${faltan.join(' · ')}`)
  const origen = w.nodes.find((n) => n.name === DESDE)
  if (!origen) throw new Error(`no existe «${DESDE}»`)
  w.nodes = w.nodes.filter((n) => !COPIAS.includes(n.name))
  for (const c of COPIAS) delete w.connections[c]
  w.nodes.push({
    parameters: {
      method: 'POST', url: URL_DEL_PORTERO,
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ client_id: $('Validate Deal Data').first().json.client_id, pedir_ahora: $json.pedir_ahora === true }) }}",
      options: { timeout: 30000, response: { response: { neverError: true } } },
    },
    id: 'despertar-8', name: NODO, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, onError: 'continueRegularOutput',
    position: [(origen.position?.[0] ?? 6340) + 260, origen.position?.[1] ?? 1360],
  })
  w.connections[DESDE] = { main: [[{ node: NODO, type: 'main', index: 0 }]] }
  w.active = antes.active
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-una-sola-cadena.mjs')) {
  const antes = JSON.parse(fs.readFileSync(path.join(aqui, 'LyVoKcrypS5uLyuu-ANTES-una-sola-cadena-2026-10-15.json'), 'utf8'))
  const w = conUnaSolaCadena(antes)
  fs.writeFileSync(path.join(aqui, 'LyVoKcrypS5uLyuu-ARREGLADO-una-sola-cadena-2026-10-15.json'), JSON.stringify(w, null, 2))
  console.log('ok · nodos', antes.nodes.length, '→', w.nodes.length, '· activo =', w.active)
}
