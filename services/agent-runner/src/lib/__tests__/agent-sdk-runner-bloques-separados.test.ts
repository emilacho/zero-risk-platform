/**
 * 17-nov · REAPERTURA «nada se pierde sin aviso» (RESPUESTAS Lenovo 13:00Z · arreglo (a) de CC6): en el reel `2ed549cc` la mesa escribió «Voy a cargar las herramientas…», usó una
 * herramienta y después «# Propuesta 1 · …»; el runner unía los dos textos PEGADOS («…con sus citas.# Propuesta 1 · …») y el lector de propuestas tiró la Propuesta 1.
 * Ahora el texto que sigue al resultado de una herramienta se une con un salto de párrafo. Nunca se quita texto. US$ 0.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: () => ({}) }))
const { drainStream, unirBloqueDeTexto } = await import('../agent-sdk-runner')

async function* streamOf(...messages: unknown[]): AsyncIterable<unknown> { for (const m of messages) yield m }
const asistente = (...content: Array<Record<string, unknown>>) => ({ type: 'assistant', message: { content } })
const herramienta = () => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })
const fin = () => ({ type: 'result', session_id: 's', usage: {}, stop_reason: 'end_turn' })
const drenar = (...m: unknown[]) => drainStream(streamOf(...m) as never)

describe('el runner une los textos del agente sin pegarlos', () => {
  it('🔴 el caso del reel: narración → herramienta → «# Propuesta 1»: el título queda al principio de su línea', async () => {
    const d = await drenar(
      asistente({ type: 'text', text: 'Voy a cargar las herramientas de mesa antes de integrar.' }, { type: 'tool_use', id: 't1', name: 'Read', input: {} }),
      herramienta(),
      asistente({ type: 'text', text: '# Propuesta 1 · La puerta\n\nConcepto: …' }),
      fin(),
    )
    expect(d.responseText).toBe('Voy a cargar las herramientas de mesa antes de integrar.\n\n# Propuesta 1 · La puerta\n\nConcepto: …')
    expect(d.responseText.split('\n').some((l) => l.startsWith('# Propuesta 1'))).toBe(true)
    // el cierre (lo escrito después de la última herramienta) no cambia
    expect(d.textoFinal).toBe('# Propuesta 1 · La puerta\n\nConcepto: …')
  })
  it('sin resultado de herramienta en medio, los bloques van pegados como siempre (el SDK puede partir un mismo turno en varios mensajes)', async () => {
    const d = await drenar(asistente({ type: 'text', text: 'uno' }, { type: 'text', text: ' y dos' }), asistente({ type: 'text', text: ' y tres' }), fin())
    expect(d.responseText).toBe('uno y dos y tres')
  })
  it('🔴 (w2 de CC6) tras una herramienta, un turno partido en DOS mensajes: el salto va solo al principio, nunca entre los dos', async () => {
    const d = await drenar(
      asistente({ type: 'text', text: 'Voy a leer.' }, { type: 'tool_use', id: 't1', name: 'Read', input: {} }),
      herramienta(),
      asistente({ type: 'text', text: '{"titulo": "a' }),
      asistente({ type: 'text', text: 'b", "texto": "c"}' }),
      fin(),
    )
    expect(d.responseText).toBe('Voy a leer.\n\n{"titulo": "ab", "texto": "c"}')
    expect(d.textoFinal).toBe('{"titulo": "ab", "texto": "c"}')
  })
  it('no duplica saltos: si el acumulado ya termina en salto de línea o el bloque empieza con uno, se une tal cual', () => {
    expect(unirBloqueDeTexto('a\n', '# T', true)).toBe('a\n# T')
    expect(unirBloqueDeTexto('a', '\n# T', true)).toBe('a\n# T')
    expect(unirBloqueDeTexto('', '# T', true)).toBe('# T')
    expect(unirBloqueDeTexto('a', 'b', false)).toBe('ab')
  })
  it('nunca quita texto: todo lo escrito está, en orden', async () => {
    const partes = ['primero.', 'segundo.', 'tercero.']
    const d = await drenar(asistente({ type: 'text', text: partes[0] }, { type: 'tool_use', id: 't', name: 'X', input: {} }), herramienta(), asistente({ type: 'text', text: partes[1] }), asistente({ type: 'text', text: partes[2] }), fin())
    expect(d.responseText.replace(/\n/g, '')).toBe(partes.join(''))
  })
})
