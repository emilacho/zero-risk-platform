/**
 * LLAMADA DIRECTA A LA API DE MENSAJES POR FLUJO CONTINUO · 18-nov · firma de Emilio «nada se recorta» (G1 del barrido de topes · CC5).
 * Las llamadas por `fetch` sin SDK (`brand-analyzer.ts`, `meta-agent.ts`) pedían 20.000 tokens sin flujo continuo. Para ir al máximo del modelo (128.000) la
 * respuesta tiene que llegar por flujo continuo: una respuesta larga sin él puede pasar de 10 minutos y la conexión se corta (la documentación lo recomienda
 * para `max_tokens` altos). Esto pide `stream: true`, junta el texto de los eventos y devuelve lo mismo que antes: texto, tokens de entrada y de salida.
 * Si la respuesta NO viene por flujo (una prueba que imita la API con JSON), la lee como JSON igual que antes.
 */
export const TECHO_DE_RESPUESTA_DIRECTA = 128000

/** el techo que admite cada modelo · pedir más que su máximo da 400 · Haiku 4.5 y Sonnet 4.5 = 64.000 (referencia oficial de modelos) */
export function techoDeRespuestaDelModelo(modelo: string): number {
  if (/^claude-(haiku-4-5|sonnet-4-5|opus-4-5)/.test(modelo)) return 64000
  if (/^claude-opus-4-(0|1)/.test(modelo)) return 32000
  return TECHO_DE_RESPUESTA_DIRECTA
}

export type RespuestaDirecta = { text: string; inputTokens: number; outputTokens: number; stopReason: string | null }

export async function pedirMensajePorFlujo(o: {
  apiKey: string
  model: string
  system: string
  userMessage: string
  fetchFn?: typeof fetch
}): Promise<RespuestaDirecta> {
  const response = await (o.fetchFn ?? fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: o.model,
      max_tokens: techoDeRespuestaDelModelo(o.model),
      stream: true,
      system: o.system,
      messages: [{ role: 'user', content: o.userMessage }],
    }),
  })
  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 500)}`)
  }
  const tipo = response.headers?.get?.('content-type') ?? ''
  if (!tipo.includes('text/event-stream')) {
    const data = await response.json()
    // bloques de texto (el pensamiento NO) · un bloque sin `type` con `text` es la forma vieja que imitan algunas pruebas
    const esTexto = (b: { type?: string; text?: unknown }) => b?.type === 'text' || (b?.type === undefined && typeof b?.text === 'string')
    const texto = (data.content ?? []).filter(esTexto).map((b: { text?: string }) => b.text ?? '').join('')
    return { text: texto || '{}', inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0, stopReason: data.stop_reason ?? null }
  }
  return leerFlujo(await response.text())
}

/** junta un flujo SSE completo de la API de mensajes · exportada para la prueba */
export function leerFlujo(sse: string): RespuestaDirecta {
  let texto = ''
  let entrada = 0
  let salida = 0
  let parada: string | null = null
  for (const linea of sse.split(/\r?\n/)) {
    if (!linea.startsWith('data:')) continue
    const crudo = linea.slice(5).trim()
    if (!crudo) continue
    let ev: Record<string, unknown>
    try { ev = JSON.parse(crudo) } catch { continue }
    if (ev.type === 'message_start') {
      const u = (ev.message as { usage?: { input_tokens?: number; output_tokens?: number } } | undefined)?.usage
      entrada = u?.input_tokens ?? entrada
      salida = u?.output_tokens ?? salida
    } else if (ev.type === 'content_block_delta') {
      const d = ev.delta as { type?: string; text?: string } | undefined
      if (d?.type === 'text_delta' && typeof d.text === 'string') texto += d.text
    } else if (ev.type === 'message_delta') {
      const u = ev.usage as { output_tokens?: number } | undefined
      if (typeof u?.output_tokens === 'number') salida = u.output_tokens
      const d = ev.delta as { stop_reason?: string } | undefined
      if (d?.stop_reason) parada = d.stop_reason
    } else if (ev.type === 'error') {
      const e = ev.error as { type?: string; message?: string } | undefined
      throw new Error(`Claude API error en el flujo: ${e?.type ?? 'error'} · ${(e?.message ?? '').substring(0, 500)}`)
    }
  }
  return { text: texto || '{}', inputTokens: entrada, outputTokens: salida, stopReason: parada }
}
