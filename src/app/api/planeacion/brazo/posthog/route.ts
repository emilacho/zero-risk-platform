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
 * ✏️ CORREGIDO 2026-09-30 (CC#1) · ESTE COMENTARIO DECÍA «14 visitas en 90 días» y ESO ERA FALSO HOY.
 *    Esa cifra era del 10-sep (el sitio recién salía). Medido el 30-sep contra el proyecto real, 90 días:
 *      naufrago.ec 350 + www.naufrago.ec 138 = **488 visitas** ($pageview) · 300 personas distintas.
 *    Un comentario que dice «casi no hay tráfico» hace que NADIE vuelva a mirar: por eso el plan nunca pedía este brazo.
 *
 * ✏️ Y LOS EVENTOS DE CONDUCTA NO ERAN «INVISIBLES POR NO EXISTIR» SINO POR EL FILTRO (medido 30-sep):
 *    `menu_viewed`, `cart_opened`, `checkout_started`, `order_submitted`… NO traen `$host` (0 de 220), pero los 220 SÍ traen
 *    `$current_url`. El filtro sólo miraba `$host`, así que todo lo que hizo el visitante DESPUÉS de entrar quedaba fuera.
 *    Con el filtro por `coalesce($host, host de $current_url)`: naufrago.ec pasa de 1 tipo de evento a 8 y de 488 a
 *    689 eventos (201 de conducta recuperados: menu_viewed 65 · cart_opened 63 · checkout_started 46 · error_en_el_navegador 19
 *    · order_delivered 4 · order_submitted 3 · ruleta_spun 1) · las 488 visitas no cambian · 0 eventos nuestros (con client_id)
 *    se cuelan. Se arregló el FILTRO, no el sitio: no se le toca el sitio al cliente (frontera).
 *
 * ⇒ ESTA PUERTA APROXIMA POR DOMINIO Y LO DICE EN CADA RESPUESTA. Nunca
 * presenta el número como «la analítica del cliente»: sería un rótulo que
 * miente, y el plan lo leería como evidencia.
 *
 * Por qué es así y no es un descuido: **decidimos no tocarle el sitio al
 * cliente.** Sin medición puesta ahí, no hay forma de atribuir. Es una
 * consecuencia de una decisión, no una falla.
 *
 * 🔴 ENTRA UNA LISTA · SALE UNA RESPUESTA POR PEDIDO (Lenovo · 10-sep).
 */
import { checkInternalKey } from '@/lib/internal-auth'
import {
  conLimite,
  CUPO_EN_VUELO,
  enParalelo,
  extraDe,
  leerSobre,
  pedidoInvalido,
  responderLista,
  seRompio,
  sobreInvalido,
  type PedidoPuerta,
} from '@/lib/planeacion/puertas'
import { envolverBrazo, sinRespuesta, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUENTE = 'posthog · consulta por dominio (NO por cliente)'
export const LIMITACION =
  'PostHog NO puede atribuir el tráfico a un cliente: los eventos del sitio no llevan client_id ' +
  '(medido 30-sep · 0 de 806 $pageview con client_id en 90 días). Esto se aproximó por DOMINIO. No es la analítica del ' +
  'cliente: es lo que se ve desde un dominio que creemos suyo.'

interface Consulta { readonly results?: ReadonlyArray<ReadonlyArray<unknown>> }

async function atender(p: PedidoPuerta): Promise<RespuestaBrazo> {
  const obj = p.objetivo as string
  const extra = extraDe(p)

  const dominio = String((p.params?.dominio ?? p.params?.host ?? p.params?.website ?? '') || '')
    .replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim()
  if (!dominio) {
    // sin dominio no hay ni siquiera aproximación · es un hueco, no un «no hay»
    return pedidoInvalido('posthog', FUENTE, p,
      'falta `params.dominio` · sin dominio no hay forma de acercarse: los eventos del sitio no llevan client_id')
  }

  const proyecto = process.env.POSTHOG_PROJECT_ID
  const llave = process.env.POSTHOG_PERSONAL_API_KEY
  const host = (process.env.POSTHOG_API_URL || 'https://us.posthog.com').replace(/\/+$/, '')
  if (!proyecto || !llave) {
    return sinRespuesta({
      brazo: 'posthog', objetivo: obj, fuente: FUENTE, ...extra,
      motivo: 'PostHog no está configurado para lectura (falta POSTHOG_PROJECT_ID o POSTHOG_PERSONAL_API_KEY) · NO se preguntó · no es que el cliente no tenga visitas',
    })
  }

  const dias = Number(p.params?.dias ?? 90) || 90
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
  // 🔴 la ficha puede traer el dominio CON `www.` (Náufrago: https://www.naufrago.ec) y el sitio recibe visitas en AMBOS: el pelado (350) y el
  // `www.` (138). Antes se filtraba sólo `dominio` y `www.dominio`: con `www.naufrago.ec` en la ficha salía `www.www.naufrago.ec` y el plan veía 138
  // visitas en vez de 488. Se pela el `www.` y se piden los dos (medido 30-sep contra los datos reales).
  const base = dominio.toLowerCase().replace(/^www\./, '')
  const escapado = base.replace(/'/g, "''")

  try {
    return await envolverBrazo({
      brazo: 'posthog',
      objetivo: obj,
      fuente: FUENTE + ' · dominio ' + dominio + ' · últimos ' + dias + ' días',
      ...extra,
      ejecutar: () => conLimite(p.limite_ms, async () => {
        const q = await consultar(
          "select event, count() as n, count(distinct distinct_id) as personas from events " +
          "where timestamp > now() - interval " + dias + " day " +
          // el dominio sale de `$host` o, si el evento no lo trae (los de conducta), del host de `$current_url` (medido 30-sep)
          "and coalesce(properties.$host, domain(properties.$current_url)) in ('" + escapado + "', 'www." + escapado + "') " +
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
            dominio_leido_de: '$host, o el host de $current_url en los eventos de conducta (que no traen $host)',
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
  } catch (e) {
    return seRompio('posthog', FUENTE, p, e)
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return sobreInvalido('posthog', FUENTE, 'la puerta rechazó la llamada · ' + auth.reason)
  }
  const leido = await leerSobre(req)
  if (!leido.ok) return sobreInvalido('posthog', FUENTE, leido.motivo)

  const rs = await enParalelo(leido.sobre.pedidos, CUPO_EN_VUELO, async (l) =>
    l.ok ? atender(l.pedido) : pedidoInvalido('posthog', FUENTE, l.pedido, l.motivo),
  )
  return responderLista(rs)
}
