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
 * Cada corrida se PAGA: se atienden de a `CUPO_EN_VUELO`, en el orden en que
 * llegaron, y ninguna tumba a las otras.
 *
 * 🔴 Y SE TRADUCE ANTES DE SALIR (Lenovo · 10-sep · `vocabulario.ts`): el plan
 * dice `sitio_propio`, el proveedor entiende `website_content_scraper`. Sin esa
 * traducción el Servicio contesta `rechazado` y el plan lo lee como un hueco de
 * la fuente, que es mentira: la palabra estaba mal.
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
import { traducir, type FuncionProveedor } from '@/lib/planeacion/vocabulario'
import { sinDato, sinRespuesta, trajo, type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const FUENTE = 'servicio apify · n8n 3lyknrP3PoS2KzUf'

/**
 * 🔴 EL DESTINO · el tercero es el obvio, y hasta el 10-sep no existía.
 *
 * El Servicio sabía dos: `brain_rag`/`both` **ESCRIBE en el cerebro del cliente**
 * (`IF should_brain?` → `/api/brain/ingest-source`), y `callback_url` llama de
 * vuelta a una dirección. `planeación` no quiere ninguna de las dos: quiere lo
 * que encontró, en la mano, ahora.
 *
 * ⇒ `respuesta` · ADITIVO · no escribe y no llama a nadie. Todo el camino de
 *   abajo ya lo soportaba (las dos banderas dan false y el flujo sale derecho a
 *   contestar): lo único que faltaba era que la lista de destinos lo dejara pasar.
 *
 * 🔴 Y NO se hace un punto de recepción propio: obligaría a pausar y retomar la
 * corrida, y esa maquinaria sirve verdes falsos.
 *
 * ⚠️ Si quien llama trae su propia dirección de vuelta, se respeta y se usa el
 * destino viejo — eso funciona hoy, sin depender del cambio en el Servicio.
 */
const DESTINO_SIN_VUELTA = 'respuesta' as const
const DESTINO_CON_VUELTA = 'callback_url' as const

/** los params que le tocan a esta función · `por_funcion` manda, si está */
function paramsDe(p: PedidoPuerta, funcion: FuncionProveedor): Record<string, unknown> {
  const base = p.params ?? {}
  const porFuncion = base.por_funcion as Record<string, Record<string, unknown>> | undefined
  if (porFuncion && porFuncion[funcion]) return porFuncion[funcion]
  const { por_funcion: _fuera, ...resto } = base
  return resto
}

/** una corrida · una función del proveedor · el sobre entero al brazo */
async function correr(p: PedidoPuerta, funcion: FuncionProveedor, firma: { workflow_id: string; workflow_execution_id: string }, puerta: string): Promise<RespuestaBrazo> {
  const fuente = FUENTE + ' · ' + funcion
  return brazoApify({
    objetivo: p.objetivo as string,
    fuente,
    ...extraDe(p),
    consultar: () => conLimite(p.limite_ms, async () => {
      const resp = await fetch(puerta, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: p.client_id,
          apify_function: funcion,
          ...(p.callback_url
            ? { destination: DESTINO_CON_VUELTA, callback_url: p.callback_url }
            : { destination: DESTINO_SIN_VUELTA }),
          dry_run: p.dry_run,
          params: paramsDe(p, funcion),
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
}

/**
 * 🔴 Canon canonical · UN objetivo del plan, VARIAS corridas ⇒ UNA respuesta.
 *
 * `redes_sociales` son cinco corridas. Aplastarlas en un estado suelto miente en
 * las dos direcciones: si tres trajeron y dos no se pudieron ver, ni «trajo» a
 * secas ni «no hay» describen eso.
 *
 * Las reglas, y el porqué de cada una:
 *   · alguna trajo        ⇒ `trajo`, **y los huecos viajan adentro** · el plan
 *                            nunca puede leer «tiene tres redes» sin ver que de
 *                            las otras dos no se sabe.
 *   · TODAS «miré y no hay» ⇒ `sin_dato` · recién ahí la ausencia es información.
 *   · el resto            ⇒ `sin_respuesta` · alcanza UNA que nadie miró para que
 *                            «no hay» sea una afirmación que no se puede hacer.
 */
function unir(p: PedidoPuerta, funciones: ReadonlyArray<FuncionProveedor>, partes: ReadonlyArray<RespuestaBrazo>): RespuestaBrazo {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)
  const fuente = FUENTE + ' · ' + funciones.join(' + ')
  const por_funcion = Object.fromEntries(funciones.map((f, i) => [f, {
    estado: partes[i].estado,
    ...(partes[i].motivo ? { motivo: partes[i].motivo } : {}),
    datos: partes[i].datos,
    fuente: partes[i].fuente,
  }]))
  const de = (e: string) => funciones.filter((_, i) => partes[i].estado === e)
  const trajeron = de('trajo')
  const sinDatos = de('sin_dato')
  const huecos = de('sin_respuesta')

  if (trajeron.length) {
    return trajo({
      brazo: 'apify', objetivo, fuente, ...extra,
      datos: {
        por_funcion,
        trajeron,
        // 🔴 los huecos viajan PEGADOS al dato · no se pueden saltear
        sin_dato: sinDatos,
        huecos,
        ...(huecos.length
          ? { aviso: 'de ' + huecos.length + ' de ' + funciones.length + ' no se sabe: ' + huecos.join(', ') + ' · NO se puede leer esto como el total' }
          : {}),
      },
    })
  }
  if (sinDatos.length === funciones.length) {
    return sinDato({
      brazo: 'apify', objetivo, fuente, ...extra,
      datos: { por_funcion },
      motivo: 'fui, miré y no hay en las ' + funciones.length + ': ' + funciones.join(', '),
    })
  }
  return sinRespuesta({
    brazo: 'apify', objetivo, fuente, ...extra,
    motivo: 'no se pudo saber · ' + huecos.length + ' de ' + funciones.length + ' sin respuesta (' + huecos.join(', ') + ')' +
      (sinDatos.length ? ' · y ' + sinDatos.length + ' miró y no había (' + sinDatos.join(', ') + ')' : '') +
      ' · NO es que no haya dato',
  })
}

async function atender(p: PedidoPuerta): Promise<RespuestaBrazo> {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)

  if (!p.client_id) return pedidoInvalido('apify', FUENTE, p, 'falta client_id')

  // 🔴 la palabra del plan se traduce ANTES de salir · una palabra sin traducir
  // vuelve `rechazado` y se lee como un hueco de la fuente, que es mentira
  const t = traducir(objetivo)
  if (!t.ok) {
    return sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: t.motivo + ' · NO se preguntó · no es que no haya dato',
    })
  }

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

  const puerta = process.env.APIFY_SERVICE_WEBHOOK_URL
  if (!puerta) {
    return sinRespuesta({
      brazo: 'apify', objetivo, fuente: FUENTE, ...extra,
      motivo: 'el Servicio de Apify no está configurado (falta APIFY_SERVICE_WEBHOOK_URL) · NO se preguntó · no es que no haya dato',
    })
  }

  try {
    const partes = await enParalelo(t.funciones, CUPO_EN_VUELO, (f) => correr(p, f, firma, puerta))
    // una sola función ⇒ su respuesta ES la respuesta · no hay nada que unir
    return t.funciones.length === 1 ? partes[0] : unir(p, t.funciones, partes)
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
