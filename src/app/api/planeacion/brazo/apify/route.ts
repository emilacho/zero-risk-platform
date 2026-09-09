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
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { brazoApify } from '@/lib/planeacion/brazos'
import { conLimite, leerPedido, pedidoInvalido, responder, seRompio } from '@/lib/planeacion/puertas'
import { sinRespuesta } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const FUENTE = 'servicio apify · n8n 3lyknrP3PoS2KzUf'

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    // ni siquiera se llegó a preguntar ⇒ hueco, no «no hay»
    return responder(sinRespuesta({
      brazo: 'apify', objetivo: '(sin objetivo)', fuente: FUENTE,
      motivo: 'la puerta rechazó la llamada · ' + auth.reason + ' · NO se consultó a la fuente',
    }))
  }
  const leido = await leerPedido(req)
  if (!leido.ok) return pedidoInvalido('apify', FUENTE, undefined, leido.motivo)
  const { client_id, objetivo, proposito, limite_ms, params } = leido.pedido
  const extra = { ...(limite_ms !== undefined ? { limite_ms } : {}), ...(proposito ? { proposito } : {}) }

  if (!client_id) return pedidoInvalido('apify', FUENTE, objetivo, 'falta client_id', extra)
  if (!objetivo) return pedidoInvalido('apify', FUENTE, objetivo, 'falta objetivo', extra)

  const puerta = process.env.APIFY_SERVICE_WEBHOOK_URL
  if (!puerta) {
    return responder(sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: 'el Servicio de Apify no está configurado (falta APIFY_SERVICE_WEBHOOK_URL) · NO se preguntó · no es que no haya dato',
    }))
  }

  try {
    const r = await brazoApify({
      objetivo,
      fuente: FUENTE,
      ...extra,
      consultar: () => conLimite(limite_ms, async () => {
        const resp = await fetch(puerta, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id,
            apify_function: objetivo,
            destination: 'callback_url',
            dry_run: false,
            params: params ?? {},
            metadata: {
              scope: 'planeacion',
              calling_workflow_id: 'planeacion',
              calling_workflow_execution_id: 'puerta-' + Date.now(),
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
    return responder(r)
  } catch (e) {
    return seRompio('apify', FUENTE, objetivo, e, extra)
  }
}
