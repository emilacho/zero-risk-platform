/**
 * POST /api/planeacion/brazo/mercado · la puerta del INFORME DE MERCADO (F4 · 31-oct).
 *
 * Paso 0 del plan (estructura completa §2, firmada por Emilio): `market_research_analyst`
 * escribe UN informe corto de tendencia y oportunidad de la categoría y la plaza del cliente,
 * ANTES del redactor. Es PROPUESTA, nunca dato del cliente; el redactor lo recibe como contexto.
 *
 * Lo que esta puerta decide, y por qué:
 *   · exige `dry_run` explícito y la firma REAL de la corrida (workflow_id + execution id):
 *     el agente solo se invoca vía flujo (canon) y el gasto tiene que cruzarse con quien lo pidió;
 *   · en ensayo NO llama al agente (en seco no genera) · US$ 0 · contesta `sin_respuesta` declarado;
 *   · sin rubro (`params.rubro` o `clients.industry`) → `sin_respuesta` «falta industry en la ficha»;
 *   · el tope del turno viaja al corredor (`max_budget_usd`) · por omisión US$ 1, nunca más de 5;
 *   · la respuesta vuelve rotulada y con `es_dato_del_cliente: false`.
 * El idioma del informe es el del manual del cliente (`params.idioma` si el flujo lo trae; si no,
 * el del país de la ficha); ninguna indicación de esta puerta fija un idioma ni un trato.
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { baseDeRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { AGENTE_DE_MERCADO, brazoMercado, ROTULO_INFORME_DE_MERCADO, SENALES_ESPERADAS } from '@/lib/planeacion/brazos'
import {
  conLimite,
  CUPO_EN_VUELO,
  enParalelo,
  extraDe,
  firmaDeLaCorrida,
  leerSobre,
  pedidoInvalido,
  responderLista,
  seRompio,
  sobreInvalido,
  type PedidoPuerta,
} from '@/lib/planeacion/puertas'
import { sinRespuesta, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUENTE = `mercado · ${AGENTE_DE_MERCADO} vía /api/agents/run-sdk · PROPUESTA, no dato del cliente`
export const PASO_DE_MERCADO = 'informe-mercado'
export const TOPE_POR_OMISION_USD = 1
export const TOPE_MAXIMO_USD = 5

interface FichaMinima { nombre: string | null; rubro: string | null; plaza: string | null; pais: string | null }

const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)

/** el rubro y la plaza: del pedido si los trae (`params.rubro` · `params.plaza`); si no, de la ficha */
async function fichaDe(p: PedidoPuerta): Promise<{ ok: true; ficha: FichaMinima } | { ok: false; motivo: string }> {
  const rubroPedido = texto(p.params?.rubro)
  const plazaPedido = texto(p.params?.plaza)
  if (rubroPedido) return { ok: true, ficha: { nombre: texto(p.params?.nombre), rubro: rubroPedido, plaza: plazaPedido, pais: texto(p.params?.pais) } }
  try {
    const { data, error } = await getSupabaseAdmin().from('clients').select('name, industry, market, country').eq('id', p.client_id).maybeSingle()
    if (error) throw new Error(error.message)
    const f = (data ?? null) as { name?: unknown; industry?: unknown; market?: unknown; country?: unknown } | null
    if (!f) return { ok: false, motivo: `no existe la ficha del cliente ${String(p.client_id)}` }
    return { ok: true, ficha: { nombre: texto(f.name), rubro: texto(f.industry), plaza: plazaPedido ?? texto(f.market), pais: texto(f.country) } }
  } catch (e) {
    return { ok: false, motivo: 'no se pudo leer la ficha del cliente · ' + (e instanceof Error ? e.message : String(e)) }
  }
}

const topeDe = (p: PedidoPuerta): number =>
  typeof p.tope_usd === 'number' && p.tope_usd > 0 && p.tope_usd <= TOPE_MAXIMO_USD ? p.tope_usd : TOPE_POR_OMISION_USD

/** el pedido al analista · texto interno (tuteo); el informe sale en el idioma del manual del cliente */
export function tareaDeMercado(a: { ficha: FichaMinima; idioma: string | null; proposito?: string }): string {
  const plaza = a.ficha.plaza ?? a.ficha.pais ?? 'la plaza del cliente (sin dato en la ficha: dilo)'
  const idioma = a.idioma ?? `el del manual del cliente; si no lo conoces, el idioma oficial de ${a.ficha.pais ?? 'su país'}`
  return [
    `Eres el analista de mercado y tendencias. Escribe UN informe corto de mercado para el plan de 90 días de un negocio del rubro «${a.ficha.rubro}» en ${plaza}.`,
    '',
    'Reglas:',
    `- Entrega entre ${SENALES_ESPERADAS.min} y ${SENALES_ESPERADAS.max} señales de la categoría y de la plaza. Una señal = UNA sola línea de lista que empieza con «- », con: señal · fuente (nombre y dónde se puede ver) · fecha · confianza (alta/media/baja y por qué) · oportunidad que abre · qué faltó.`,
    '- Solo tendencia y oportunidad. NO analices competidores (eso lo trae otro agente). NO escribas cifras del cliente ni inventes datos suyos.',
    '- Si no tienes una fuente para una señal, no la estimes: escribe «sin dato» y qué habría que mirar. Si no hay ninguna señal con fuente, responde solo «sin dato» y qué faltó, sin líneas de lista.',
    '- Nada de predicciones sin intervalo de confianza o método declarado.',
    `- Encabeza el informe con el rótulo exacto: ${ROTULO_INFORME_DE_MERCADO}`,
    `- Idioma: ${idioma}. Respeta el trato (tú, vos, usted u otro) que fije el manual del cliente; no lo cambies.`,
    ...(a.proposito ? ['', `Para qué sirve en el plan: ${a.proposito}`] : []),
  ].join('\n')
}

async function atender(p: PedidoPuerta): Promise<RespuestaBrazo> {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)
  if (!p.client_id) return pedidoInvalido('mercado', FUENTE, p, 'falta client_id')
  // 🔴 el ensayo se DECIDE, no se asume: asumir `false` sería gastar sin que nadie lo pidiera
  if (typeof p.dry_run !== 'boolean') {
    return sinRespuesta({ brazo: 'mercado', objetivo, fuente: FUENTE, ...extra, motivo: 'falta `dry_run` explícito (true o false) · el ensayo se decide, no se asume · NO se preguntó' })
  }
  // 🔴 el agente SOLO se invoca vía flujo · sin firma no hay llamada ni gasto
  const firma = firmaDeLaCorrida(p)
  if (!firma.ok) return pedidoInvalido('mercado', FUENTE, p, firma.motivo)

  try {
    const ficha = await fichaDe(p)
    if (!ficha.ok) return pedidoInvalido('mercado', FUENTE, p, ficha.motivo)
    if (!ficha.ficha.rubro) return pedidoInvalido('mercado', FUENTE, p, 'falta industry en la ficha')

    const tope = topeDe(p)
    const modelo = modeloRunSdk({ base: baseDeRunSdk(process.env), llave: process.env.INTERNAL_API_KEY, fetch: globalThis.fetch, workflow_id: firma.workflow_id })
    const tarea = tareaDeMercado({ ficha: ficha.ficha, idioma: texto(p.params?.idioma), ...(p.proposito ? { proposito: p.proposito } : {}) })
    const fuente = `${FUENTE} · rubro «${ficha.ficha.rubro}» · plaza «${ficha.ficha.plaza ?? ficha.ficha.pais ?? 'sin dato'}» · tope US$ ${tope.toFixed(2)}`

    return await brazoMercado({
      objetivo,
      fuente,
      ...extra,
      rubro: ficha.ficha.rubro,
      dry_run: p.dry_run,
      pedir: () => conLimite(p.limite_ms, () => modelo.invocar({
        agente: AGENTE_DE_MERCADO,
        tarea,
        encargo_id: firma.workflow_execution_id,
        client_id: p.client_id as string,
        paso: PASO_DE_MERCADO,
        tope_usd: tope,
        dry_run: p.dry_run as boolean,
      })),
    })
  } catch (e) {
    return seRompio('mercado', FUENTE, p, e)
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) return sobreInvalido('mercado', FUENTE, 'la puerta rechazó la llamada · ' + auth.reason)
  const leido = await leerSobre(req)
  if (!leido.ok) return sobreInvalido('mercado', FUENTE, leido.motivo)
  const rs = await enParalelo(leido.sobre.pedidos, CUPO_EN_VUELO, async (l) =>
    l.ok ? atender(l.pedido) : pedidoInvalido('mercado', FUENTE, l.pedido, l.motivo),
  )
  return responderLista(rs)
}
