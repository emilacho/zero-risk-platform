/**
 * POST /api/planeacion/brazo/apify · la puerta del brazo de raspado.
 *
 * Llama al Servicio de Apify (`3lyknrP3PoS2KzUf`) y devuelve el contrato §4.2.
 * NO reimplementa nada: el sobre del Servicio entra entero a `brazoApify`, que
 * es quien sabe distinguir los cuatro casos.
 *
 * 🔴 POR QUÉ EL SOBRE ENTERO Y NO LAS FILAS: el Servicio ya distingue «nadie
 * preguntó» (salteado · rechazado), «no pude ver» y «se miró y no hay» —
 * anidado en `cero`. Quedarse con las filas tira esa distinción y el plan
 * escribe «el cliente no corre pauta» cuando nadie preguntó (B2-bis, 09-sep).
 *
 * 🔴 ENTRA UNA LISTA · SALE UNA RESPUESTA POR PEDIDO (Lenovo · 10-sep).
 * Cada pedido es una corrida que se PAGA: se atienden de a `CUPO_EN_VUELO`,
 * en el orden en que llegaron, y ninguno tumba a los otros.
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { brazoApify } from '@/lib/planeacion/brazos'
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
export const maxDuration = 300

const FUENTE = 'servicio apify · n8n 3lyknrP3PoS2KzUf'

/**
 * 🔴 POR QUÉ `callback_url` Y NO `brain_rag` · medido sobre el flujo vivo.
 *
 * El Servicio admite tres destinos y los tres hacen algo distinto:
 *   `brain_rag` / `both` ⇒ **ESCRIBE en el cerebro del cliente** (nodo
 *      `IF should_brain?` → `HTTP · /api/brain/ingest-source`).
 *   `callback_url`       ⇒ `guardado_en: 'sólo la respuesta'` · no escribe.
 * `planeación` LEE el cerebro, no lo escribe (canon 06-sep) ⇒ el único destino
 * admisible acá es `callback_url`.
 *
 * ⚠️ Y el Servicio EXIGE la dirección de vuelta cuando el destino es ése
 * (nodo `Validate Body`: «callback_url required for destination=callback_url»).
 * La primera versión mandaba el destino sin la dirección ⇒ el Servicio
 * contestaba `rechazado` SIEMPRE. La puerta ahora lo corta antes de salir:
 * no se inventa una dirección de vuelta, se dice que falta.
 */
const DESTINO = 'callback_url' as const

async function atender(p: PedidoPuerta): Promise<RespuestaBrazo> {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)

  if (!p.client_id) return pedidoInvalido('apify', FUENTE, p, 'falta client_id')

  // 🔴 la firma de la corrida NO se inventa · sin ella no se gasta
  const firma = firmaDeLaCorrida(p)
  if (!firma.ok) {
    return sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: firma.motivo + ' · NO se preguntó · no es que no haya dato',
    })
  }

  // 🔴 el ensayo se DECIDE, no se hereda ni se asume (PIEZA 4 del Servicio).
  // Asumir `false` sería gastar sin que nadie lo pidiera; asumir `true` sería
  // contestar invento. Se pide explícito.
  if (typeof p.dry_run !== 'boolean') {
    return sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: 'falta `dry_run` explícito (true o false) · el ensayo se decide, no se asume · NO se preguntó',
    })
  }

  if (!p.callback_url) {
    return sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: 'falta `callback_url` · el Servicio la exige para devolver sin escribir en el cerebro · NO se preguntó · no es que no haya dato',
    })
  }

  const puerta = process.env.APIFY_SERVICE_WEBHOOK_URL
  if (!puerta) {
    return sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: 'el Servicio de Apify no está configurado (falta APIFY_SERVICE_WEBHOOK_URL) · NO se preguntó · no es que no haya dato',
    })
  }

  try {
    return await brazoApify({
      objetivo,
      fuente: FUENTE,
      ...extra,
      consultar: () => conLimite(p.limite_ms, async () => {
        const resp = await fetch(puerta, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: p.client_id,
            apify_function: objetivo,
            destination: DESTINO,
            callback_url: p.callback_url,
            dry_run: p.dry_run,
            params: p.params ?? {},
            metadata: {
              scope: 'planeacion',
              // 🔴 la firma REAL de quien llama · lo único que hace cruzable el gasto
              calling_workflow_id: firma.workflow_id,
              calling_workflow_execution_id: firma.workflow_execution_id,
            },
          }),
        })
        const txt = await resp.text()
        // 🔴 un HTTP feo NO es «no hay»: se deja que el brazo lo lea como hueco
        if (!resp.ok) throw new Error('el Servicio contestó HTTP ' + resp.status + ' · ' + txt.slice(0, 200))
        try {
          return JSON.parse(txt)
        } catch {
          throw new Error('el Servicio no contestó JSON · ' + txt.slice(0, 200))
        }
      }),
    })
  } catch (e) {
    return seRompio('apify', FUENTE, p, e)
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    // ni siquiera se llegó a preguntar ⇒ hueco, no «no hay»
    return sobreInvalido('apify', FUENTE, 'la puerta rechazó la llamada · ' + auth.reason)
  }
  const leido = await leerSobre(req)
  if (!leido.ok) return sobreInvalido('apify', FUENTE, leido.motivo)

  const rs = await enParalelo(leido.sobre.pedidos, CUPO_EN_VUELO, async (l) =>
    l.ok ? atender(l.pedido) : pedidoInvalido('apify', FUENTE, l.pedido, l.motivo),
  )
  return responderLista(rs)
}
