/**
 * POST /api/planeacion/brazo/cerebro · la puerta del CEREBRO hacia el plan.
 *
 * El cerebro se LEE, no se escribe (canon 06-sep). Esta puerta devuelve el contrato §4.2.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 EL PLAN RECIBE LA CARPETA COMPLETA, NO BUSCA (FIRMA de Emilio 01-nov 08:42Z · punto 2)
 * ═══════════════════════════════════════════════════════════════════════════
 * Hasta el 01-nov esta puerta buscaba por parecido («nombre · rubro» → pgvector) y el redactor
 * recortaba lo que llegaba a ~2.500 caracteres (INFORME-CC3 «todo lo que recibe el jefe de
 * marketing» §2, fallas A y B). Emilio: «eso debería venir desde antes: en el manual ya actúan
 * agentes de investigación y raspadores». Por eso NO se mejora la pregunta: se REEMPLAZA.
 *
 * Lo que devuelve ahora (`datos`):
 *   · `contexto_del_cliente` ENTERO, tal como lo arma el portero (`adjuntoDelCliente`): el resumen
 *     vivo (cliente + sedes) y los informes vigentes de la mesa de análisis, UNO por tipo, con su
 *     fecha de corte, sus citas y la marca «hay material nuevo desde el corte». SIN recorte;
 *   · `material_citado`: los ids de las fichas crudas que algún informe cita (el material crudo
 *     sigue disponible SOLO por esa vía: se le pide al portero por su id; esta puerta no lee las
 *     tablas del cerebro, solo sus funciones públicas);
 *   · `carpeta`: el estado en una línea (para el registro).
 * Sin resumen vivo y sin informes es `sin_dato` (el portero todavía no armó la carpeta: información
 * real para el plan); que la lectura se rompa es `sin_respuesta`. `params.k` / `params.secciones` /
 * `params.query` de la búsqueda vieja se aceptan y se IGNORAN (se declara en `fuente`).
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import type { Db } from '@/lib/portero-alimenta/alimentar'
import { adjuntoDelCliente } from '@/lib/portero-alimenta/contexto-del-cliente'
import { brazoCarpeta } from '@/lib/planeacion/brazos'
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
import { type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUENTE = 'cerebro · carpeta del cliente que arma el portero (resumen vivo + informes vigentes de la mesa de análisis) · sin búsqueda por parecido'
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

async function atender(p: PedidoPuerta): Promise<RespuestaBrazo> {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)
  if (!p.client_id) return pedidoInvalido('cerebro', FUENTE, p, 'falta client_id')
  const clientId = p.client_id
  const ignorados = ['query', 'pregunta', 'texto', 'k', 'secciones'].filter((k) => p.params?.[k] !== undefined)
  const fuente = FUENTE + (ignorados.length ? ` · parámetros de la búsqueda vieja ignorados: ${ignorados.join(', ')}` : '')

  try {
    return await brazoCarpeta({
      objetivo,
      fuente,
      ...extra,
      leer: () => conLimite(p.limite_ms, async () => {
        const contexto_del_cliente = await adjuntoDelCliente(getSupabaseAdmin() as unknown as Db, clientId)
        const ids = [...new Set(contexto_del_cliente.informes.flatMap((i) => i.citas).map(txt).filter(Boolean))]
        return {
          contexto_del_cliente,
          material_citado: { ids, detalle: ids.length ? 'el material crudo que los informes citan se pide al portero por su id (esta puerta no lee las tablas del cerebro)' : 'ningún informe cita material crudo' },
        }
      }),
    })
  } catch (e) {
    return seRompio('cerebro', FUENTE, p, e)
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return sobreInvalido('cerebro', FUENTE, 'la puerta rechazó la llamada · ' + auth.reason)
  }
  const leido = await leerSobre(req)
  if (!leido.ok) return sobreInvalido('cerebro', FUENTE, leido.motivo)

  const rs = await enParalelo(leido.sobre.pedidos, CUPO_EN_VUELO, async (l) =>
    l.ok ? atender(l.pedido) : pedidoInvalido('cerebro', FUENTE, l.pedido, l.motivo),
  )
  return responderLista(rs)
}
