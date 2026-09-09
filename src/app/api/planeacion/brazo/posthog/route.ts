/**
 * POST /api/planeacion/brazo/posthog · la puerta de la analítica propia.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 LO PRIMERO, PORQUE NO SE DISIMULA · POSTHOG NO PUEDE ATRIBUIR POR CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 * Medido el 2026-09-10 contra el proyecto real, no supuesto:
 *
 *   eventos del SITIO en 90 días        con `client_id`
 *     $pageview            648                0
 *     menu_viewed           86                0
 *     cart_opened           75                0
 *     checkout_started      54                0
 *     order_submitted        3                0
 *
 *   eventos NUESTROS (agentes, imágenes)    1.197 · TODOS con client_id
 *
 * ⇒ **el `client_id` está en lo que hace la plataforma, NO en lo que hace el
 * visitante del sitio del cliente.** Lo único que separa un sitio de otro es el
 * dominio (`$host`), y ahí conviven el sitio real con más de siete
 * previsualizaciones de plantilla (`client-sites-template-*.vercel.app`).
 *
 * Y el volumen del único dominio real medido es de 14 visitas en 90 días.
 *
 * ⇒ ESTA PUERTA APROXIMA POR DOMINIO Y LO DICE EN CADA RESPUESTA. Nunca
 * presenta el número como «la analítica del cliente»: sería un rótulo que
 * miente, y el plan lo leería como evidencia.
 *
 * Por qué es así y no es un descuido: **decidimos no tocarle el sitio al
 * cliente.** Sin medición puesta ahí, no hay forma de atribuir. Es una
 * consecuencia de una decisión, no una falla.
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { conLimite, leerPedido, pedidoInvalido, responder, seRompio } from '@/lib/planeacion/puertas'
import { envolverBrazo, sinRespuesta } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUENTE = 'posthog · consulta por dominio (NO por cliente)'
export const LIMITACION =
  'PostHog NO puede atribuir el tráfico a un cliente: los eventos del sitio no llevan client_id ' +
  '(medido 10-sep · 0 de 866 en 90 días). Esto se aproximó por DOMINIO. No es la analítica del ' +
  'cliente: es lo que se ve desde un dominio que creemos suyo.'

interface Consulta { readonly results?: ReadonlyArray<ReadonlyArray<unknown>> }

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return responder(sinRespuesta({
      brazo: 'posthog', objetivo: '(sin objetivo)', fuente: FUENTE,
      motivo: 'la puerta rechazó la llamada · ' + auth.reason + ' · NO se consultó a la fuente',
    }))
  }
  const leido = await leerPedido(req)
  if (!leido.ok) return pedidoInvalido('posthog', FUENTE, undefined, leido.motivo)
  const { objetivo, proposito, limite_ms, params } = leido.pedido
  const extra = { ...(limite_ms !== undefined ? { limite_ms } : {}), ...(proposito ? { proposito } : {}) }
  const obj = objetivo || 'analitica_propia'

  const dominio = String((params?.dominio ?? params?.host ?? params?.website ?? '') || '')
    .replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
  if (!dominio) {
    // sin dominio no hay ni siquiera aproximación · es un hueco, no un «no hay»
    return pedidoInvalido('posthog', FUENTE, obj,
      'falta `params.dominio` · sin dominio no hay forma de acercarse: los eventos del sitio no llevan client_id', extra)
  }

  const proyecto = process.env.POSTHOG_PROJECT_ID
  const llave = process.env.POSTHOG_PERSONAL_API_KEY
  const host = (process.env.POSTHOG_API_URL || 'https://us.posthog.com').replace(/\/+$/, '')
  if (!proyecto || !llave) {
    return responder(sinRespuesta({
      brazo: 'posthog', objetivo: obj, fuente: FUENTE, ...extra,
      motivo: 'PostHog no está configurado para lectura (falta POSTHOG_PROJECT_ID o POSTHOG_PERSONAL_API_KEY) · NO se preguntó · no es que el cliente no tenga visitas',
    }))
  }

  const dias = Number(params?.dias ?? 90) || 90
  const consultar = async (sql: string) => {
    const r = await fetch(host + '/api/projects/' + proyecto + '/query/', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + llave, 'content-type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
    })
    const txt = await r.text()
    if (!r.ok) throw new Error('PostHog contestó HTTP ' + r.status + ' · ' + txt.slice(0, 200))
    return JSON.parse(txt) as Consulta
  }
  const escapado = dominio.replace(/'/g, "''")

  try {
    const r = await envolverBrazo({
      brazo: 'posthog',
      objetivo: obj,
      fuente: FUENTE + ' · dominio ' + dominio + ' · últimos ' + dias + ' días',
      ...extra,
      ejecutar: () => conLimite(limite_ms, async () => {
        const q = await consultar(
          "select event, count() as n, count(distinct distinct_id) as personas from events " +
          "where timestamp > now() - interval " + dias + " day " +
          "and (properties.$host = '" + escapado + "' or properties.$host = 'www." + escapado + "') " +
          'group by event order by n desc limit 40',
        )
        const filas = (q.results ?? []).map((f) => ({ evento: String(f[0]), veces: Number(f[1]), personas: Number(f[2]) }))
        if (!filas.length) {
          return {
            hay: false as const,
            motivo: 'fui, miré y no hay: el proyecto respondió y no registra ningún evento para el dominio ' +
              dominio + ' en ' + dias + ' días · ' + LIMITACION,
          }
        }
        const visitas = filas.find((f) => f.evento === '$pageview')
        return {
          hay: true as const,
          datos: {
            // 🔴 la limitación viaja PEGADA al dato · quien lo lea no la puede saltear
            atribucion: 'POR DOMINIO, NO POR CLIENTE',
            limitacion: LIMITACION,
            dominio,
            ventana_dias: dias,
            visitas: visitas ? visitas.veces : 0,
            personas_distintas: visitas ? visitas.personas : 0,
            embudo: filas,
          },
        }
      }),
    })
    return responder(r)
  } catch (e) {
    return seRompio('posthog', FUENTE, obj, e, extra)
  }
}
