/**
 * 02-nov · LIMPIEZA FASE 2 · «la lista de competidores NO es decisión del dueño» (Emilio: «eso lo hace el sistema; yo solo apruebo el documento que los lea»).
 * Encargo: RESPUESTA-LENOVO-a-CC1-limpieza-y-saldos + LISTO-CC1-limpieza-fase-2 («CC2, te toca»). US$ 0, nada aplicado.
 * En el alta (`LyVoKcrypS5uLyuu`) dos nodos HTTP escribían en la bandeja del dueño un pedido `confirm_competitor_list`:
 *   · «Confirm barato · competitor list» (camino normal: no detiene la corrida, sigue al veredicto del agente de competencia)
 *   · «Escalate · competitor observar (hitl)» (cuando el veredicto es «observar» tras el re-descubrimiento: tampoco detiene, sigue al Split)
 * Aquí dejan de ESCRIBIR en la bandeja: cada uno pasa a ser un nodo Code con el MISMO nombre (las lecturas por nombre siguen funcionando) y la MISMA conexión.
 * La lista la valida el veredicto del agente de competencia (nodo siguiente), que ya existe; no se agrega nada. NO se toca «[APIFY-WIRE] POST /api/hitl/queue (canon)» (revisión del onboarding con espera): no está en la lista firmada.
 * Los lectores de «Confirm barato» (`Synthesis Staging · build package`, `Parse veredicto`) hoy reciben la RESPUESTA de la bandeja ({item:{…}}), nunca `discovery_package`; el reemplazo les da `{}` igual de vacío en esa clave: el efecto sobre ellos es el mismo.
 *   node scripts/ops/oficina-marketing/construir-alta-sin-firma-competidores.mjs → escribe nuevo/LyVoKcrypS5uLyuu.json (NO toca n8n)
 */
import { codigo, leerVivo, nodo, escribirNuevo } from './lib.mjs'

export const ID = 'LyVoKcrypS5uLyuu'
export const CONFIRMAR = 'Confirm barato · competitor list'
export const ESCALAR = 'Escalate · competitor observar (hitl)'

export const CODIGO_SIN_BANDEJA = (cual) => `// 02-nov · limpieza fase 2 · «${cual}» ya NO escribe en la bandeja del dueño: la lista de competidores la valida el sistema (veredicto del agente de competencia, nodo siguiente).
// Mismo nombre y misma conexión que el nodo HTTP que reemplaza, para no romper las lecturas por nombre. No hay llamada, no hay costo, no hay fila.
return [{ json: { sin_bandeja: true, motivo: 'lista_de_competidores_no_es_decision_del_dueno' } }];`

export function construirAltaSinFirmaCompetidores(f = leerVivo(ID)) {
  for (const nombre of [CONFIRMAR, ESCALAR]) {
    const n = nodo(f, nombre)
    if (n.type !== 'n8n-nodes-base.httpRequest') throw new Error(`«${nombre}» ya no es un HTTP (¿ya se aplicó, o cambió el vivo?)`)
    if (!String(n.parameters.url).includes('/api/hitl/queue')) throw new Error(`«${nombre}» no escribe en /api/hitl/queue: revisar antes de reemplazar`)
    const nuevo = codigo(nombre, CODIGO_SIN_BANDEJA(nombre))
    n.type = nuevo.type
    n.typeVersion = nuevo.typeVersion
    n.parameters = nuevo.parameters
    for (const k of ['credentials', 'retryOnFail', 'maxTries', 'waitBetweenTries']) delete n[k]
  }
  return f
}

if (process.argv[1] && process.argv[1].endsWith('construir-alta-sin-firma-competidores.mjs')) {
  const f = construirAltaSinFirmaCompetidores()
  console.log('escrito', escribirNuevo(f))
}
