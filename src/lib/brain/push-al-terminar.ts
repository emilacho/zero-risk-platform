/**
 * Lo que termina EMPUJA a su siguiente paso · el manual entra al cerebro al terminar.
 *
 * ── LA REGLA (Emilio · 2026-09-02) ────────────────────────────────────────
 * *"necesito que los trabajos y outputs entren de inmediato a su segunda fase o
 * sigan su journey, en este caso el manual se termina y entra de inmediato al
 * cerebro"*. El barrido diario queda como RED, no como camino.
 *
 * ── LO QUE PASABA ─────────────────────────────────────────────────────────
 * Medido en GoEuropeAdventure · la fila del manual se escribió el 01-sep 20:29:11
 * y sus fichas aparecieron en el cerebro el 02-sep 07:00:05: **10 h 30 min**, y
 * las puso el barrido diario. El enganche que embebía existía desde el 23-may en
 * `onboarding-orchestrator.ts`, pero quedó fuera del camino vivo cuando el alta
 * cambió de puerta el 01-jul. **Nunca falló porque nunca se llamó.**
 *
 * ── POR QUÉ ACÁ Y NO EN UN NODO DE n8n ────────────────────────────────────
 * Un nodo en el flujo del manual cubre UN camino. Este defecto existe
 * exactamente porque el enganche vivía en un camino y el camino cambió. El
 * escritor del manual, en cambio, es la puerta por la que pasa CUALQUIERA que
 * escriba un manual: cubrirlo acá cubre también al que venga mañana. Y queda a
 * la vista del repositorio y de las pruebas, no escondido en un flujo.
 *
 * ── LAS DOS REGLAS INNEGOCIABLES ──────────────────────────────────────────
 * 1. **La fila del manual se guarda igual aunque el cerebro no responda.** El
 *    empuje se agenda DESPUÉS de que el insert salió bien y NO se espera: el
 *    recibo vuelve al que llamó antes de que el empuje siquiera arranque.
 *    Nunca lanza, nunca bloquea, nunca cambia el resultado de la escritura.
 * 2. **No se duplica el extractor.** Las secciones de un manual se arman en
 *    `/api/brain/reembed-source-row`, que ya existe, ya es la puerta única de
 *    escritura al cerebro y ya usa el MISMO extractor que el barrido diario.
 *    Acá sólo se toca el timbre. Un tercer extractor sería un tercer lugar
 *    donde quedar desincronizado.
 *
 * Costo medido del empuje · **$0,0000089 por manual** (3 secciones · 1.400
 * caracteres · `text-embedding-3-small`), tomado de `brain_embed_costs`.
 *
 * ── Y SI EL EMPUJE FALLA, SE OYE (2026-09-02) ─────────────────────────────
 * El estado viaja en el recibo, pero **el recibo lo consume un nodo de n8n que
 * no lo lee**. Un empuje que falla en silencio deja el manual fuera del cerebro
 * hasta el barrido del día siguiente — el defecto original, disfrazado. Los tres
 * fallos posibles tocan la campana de `#equipo`: ver `empuje-alerta.ts`.
 */
import { waitUntil } from '@vercel/functions'
import { avisarFalloDelEmpuje } from './empuje-alerta'

/** Qué se hizo con el empuje · va en el recibo, para que nunca sea silencioso. */
export type EmpujeEstado =
  /** agendado · el recibo vuelve ya y el empuje corre atrás */
  | 'agendado'
  /** apagado a mano por env · `BRAIN_PUSH_AL_TERMINAR=false` */
  | 'apagado'
  /** falta configuración para poder llamar a la puerta */
  | 'sin_configurar'
  /** no hay contra qué empujar (sin id de fila) */
  | 'sin_fila'

export interface EmpujeResultado {
  readonly estado: EmpujeEstado
  readonly detalle?: string
}

export interface EmpujeEntrada {
  readonly client_id: string
  /** `id` de la fila recién escrita en `client_brand_books`. */
  readonly source_id: string | null | undefined
  /** Inyectable para prueba · en producción se usa `fetch` global. */
  readonly fetchImpl?: typeof fetch
  /** Inyectable para prueba · en producción se usa `waitUntil` de Vercel. */
  readonly agendar?: (p: Promise<unknown>) => void
}

/** Apagado explícito · un env ausente = ENCENDIDO (la regla es que empuje). */
export function empujeHabilitado(): boolean {
  const raw = (process.env.BRAIN_PUSH_AL_TERMINAR ?? '').trim().toLowerCase()
  return !(raw === 'false' || raw === '0' || raw === 'off')
}

function baseUrl(): string {
  return (
    process.env.ZERO_RISK_API_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    'https://zero-risk-platform.vercel.app'
  ).replace(/\/+$/, '')
}

/**
 * Toca el timbre de la puerta del cerebro para la fila de manual recién escrita.
 *
 * NO se espera el resultado: se agenda y se devuelve enseguida. Cualquier fallo
 * queda en consola y NUNCA sube. El que llama ya tiene su fila escrita.
 */
export function empujarManualAlCerebro(entrada: EmpujeEntrada): EmpujeResultado {
  const { client_id, source_id } = entrada
  const agendar = entrada.agendar ?? waitUntil
  const doFetch = entrada.fetchImpl ?? fetch

  if (!empujeHabilitado()) {
    return { estado: 'apagado', detalle: 'BRAIN_PUSH_AL_TERMINAR desactivado' }
  }
  if (!source_id) {
    return { estado: 'sin_fila', detalle: 'el insert no devolvió id · nada que embeber' }
  }
  const key = process.env.INTERNAL_API_KEY
  if (!key) {
    // SE OYE · sin llave el empuje no ocurre NUNCA, para ningun manual. Es el
    // fallo mas silencioso de todos: no hay ni intento que mirar.
    void avisarFalloDelEmpuje({
      motivo: 'sin_configurar', client_id, source_id: source_id ?? null,
      detalle: 'INTERNAL_API_KEY ausente', fetchImpl: entrada.fetchImpl,
    })
    return { estado: 'sin_configurar', detalle: 'INTERNAL_API_KEY ausente · no se puede llamar a la puerta' }
  }

  const url = `${baseUrl()}/api/brain/reembed-source-row`
  const cuerpo = JSON.stringify({
    source_table: 'client_brand_books',
    source_id,
    client_id,
  })

  // Se agenda · el recibo del manual NO espera a esto.
  try {
    agendar(
      (async () => {
        try {
          const r = await doFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': key },
            body: cuerpo,
          })
          const t = await r.text().catch(() => '')
          if (!r.ok) {
            // SE OYE · el manual quedo fuera del cerebro y nadie mira el recibo.
            await avisarFalloDelEmpuje({
              motivo: 'puerta_no_2xx', client_id, source_id: source_id ?? null,
              status: r.status, detalle: t, fetchImpl: entrada.fetchImpl,
            })
          } else {
            console.info(
              `[cerebro-al-terminar] manual ${String(source_id).slice(0, 8)} empujado al cerebro · ${t.slice(0, 200)}`,
            )
          }
        } catch (e) {
          // §148 · el empuje es una mejora, jamás un punto de falla nuevo · pero
          // que sea best-effort no significa que sea MUDO.
          await avisarFalloDelEmpuje({
            motivo: 'puerta_inalcanzable', client_id, source_id: source_id ?? null,
            detalle: e instanceof Error ? e.message : String(e), fetchImpl: entrada.fetchImpl,
          })
        }
      })(),
    )
  } catch (e) {
    // Si ni siquiera se pudo agendar (entorno sin waitUntil), tampoco se rompe nada.
    return {
      estado: 'sin_configurar',
      detalle: 'no se pudo agendar · ' + (e instanceof Error ? e.message : String(e)),
    }
  }

  return { estado: 'agendado' }
}
