/**
 * LEER EL HILO DE SLACK (R6 de CC#3 · F7/F8 · CC#1 · 14-oct) · código NUEVO: hasta hoy `src/` solo publicaba.
 * Lee las respuestas de un hilo de un canal PRIVADO con `conversations.replies` (alcance `groups:history`, que el bot ya tiene) y las filtra:
 *  · solo cuentan los mensajes posteriores a `desde_ts`;
 *  · solo el autor `emilio_id` cuenta como respuesta o nota del dueño; el bot y cualquier otro autor se ignoran;
 *  · `not_in_channel` / `channel_not_found` / `thread_not_found` / `missing_scope` / fallo de red NO lanzan: devuelven «sin acceso» una vez y la conversación sigue con supuestos.
 * Nada se llama aquí en el diseño apagado: el `fetch` y la llave entran por parámetro. La llave NUNCA se escribe en papel ni en registros.
 */
export interface MensajeDeHilo { ts: string; user?: string; bot_id?: string; text?: string; subtype?: string }
export interface LecturaDeHilo {
  ok: boolean
  /** mensajes nuevos de Emilio, en orden, sin el que abre el hilo */
  mensajes: Array<{ ts: string; texto: string }>
  /** el nuevo `leido_hasta` (el `ts` más alto leído, de cualquier autor) */
  leido_hasta: string | null
  /** si no se pudo leer: el motivo corto (una sola vez; no se reintenta) */
  sin_acceso?: string
}
type Fetch = typeof fetch

const MOTIVOS_SIN_ACCESO = new Set(['not_in_channel', 'channel_not_found', 'thread_not_found', 'missing_scope', 'invalid_auth', 'not_authed', 'account_inactive', 'token_revoked', 'is_archived'])

export async function leerHilo(p: {
  canal: string
  thread_ts: string
  /** solo se devuelven los mensajes con `ts` > desde_ts */
  desde_ts?: string | null
  emilio_id: string
  token: string
  fetch?: Fetch
  /** tope de páginas (cada una ≤ 200 mensajes) para no quedarse leyendo sin fin */
  max_paginas?: number
}): Promise<LecturaDeHilo> {
  const f = p.fetch ?? fetch
  if (!p.token) return { ok: false, mensajes: [], leido_hasta: p.desde_ts ?? null, sin_acceso: 'sin_llave' }
  if (!p.canal || !p.thread_ts) return { ok: false, mensajes: [], leido_hasta: p.desde_ts ?? null, sin_acceso: 'faltan_canal_o_hilo' }
  const todos: MensajeDeHilo[] = []
  let cursor: string | undefined
  const max = Math.max(1, p.max_paginas ?? 5)
  try {
    for (let pagina = 0; pagina < max; pagina++) {
      const url = new URL('https://slack.com/api/conversations.replies')
      url.searchParams.set('channel', p.canal)
      url.searchParams.set('ts', p.thread_ts)
      url.searchParams.set('limit', '200')
      if (cursor) url.searchParams.set('cursor', cursor)
      const r = await f(url.toString(), { headers: { authorization: `Bearer ${p.token}` } })
      if (r.status === 429) return { ok: false, mensajes: [], leido_hasta: p.desde_ts ?? null, sin_acceso: 'limite_de_ritmo' }
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; messages?: MensajeDeHilo[]; response_metadata?: { next_cursor?: string } }
      if (!j.ok) return { ok: false, mensajes: [], leido_hasta: p.desde_ts ?? null, sin_acceso: MOTIVOS_SIN_ACCESO.has(String(j.error)) ? String(j.error) : `error:${String(j.error ?? 'desconocido')}` }
      todos.push(...(j.messages ?? []))
      cursor = j.response_metadata?.next_cursor || undefined
      if (!cursor) break
    }
  } catch {
    return { ok: false, mensajes: [], leido_hasta: p.desde_ts ?? null, sin_acceso: 'red' }
  }
  const desde = p.desde_ts ?? '0'
  // `ts` de Slack es «segundos.micro»: se compara como número, no como texto
  // un `ts` que no sea «segundos.micro» se ignora (con NaN toda comparación da falso y el cursor quedaría clavado)
  const esTs = (t: unknown): t is string => typeof t === 'string' && /^\d+(?:\.\d+)?$/.test(t)
  const mayor = (a: string, b: string) => Number(a) > Number(b)
  const nuevos = todos.filter((m) => esTs(m.ts) && m.ts !== p.thread_ts && mayor(m.ts, desde))
  const mensajes = nuevos
    // un subtipo descarta el mensaje (ediciones, uniones al canal…) SALVO «thread_broadcast»: es la respuesta con «Enviar también al canal» marcada, y SÍ cuenta (R8)
    .filter((m) => m.user === p.emilio_id && !m.bot_id && (!m.subtype || m.subtype === 'thread_broadcast') && typeof m.text === 'string' && m.text.trim())
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .map((m) => ({ ts: m.ts, texto: String(m.text).trim() }))
  const leido = todos.reduce<string | null>((acc, m) => (esTs(m.ts) && (acc === null || mayor(m.ts, acc)) ? m.ts : acc), p.desde_ts ?? null)
  return { ok: true, mensajes, leido_hasta: leido }
}
