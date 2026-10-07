/**
 * La llamada REAL al modelo · una sola petición, con límite de tiempo, sin reintentos.
 *
 * Usa la llave que ya existe en el servidor (`CLAUDE_API_KEY`, la misma de las otras rutas que llaman al modelo).
 * La llave nunca se escribe en el código ni sale en una respuesta ni en un mensaje de error.
 * En las pruebas estas funciones se reemplazan por un modelo simulado: aquí no se hace ninguna llamada de prueba.
 * Hay UN solo destino (`DESTINO_DEL_MODELO`) y dos formas de pedir: solo texto (`razonar`) y texto con UNA imagen (`etiquetar`).
 */
import { type PeticionAlModelo, type RespuestaDelModelo, SinLlave } from './razonar'

const DESTINO_DEL_MODELO = 'https://api.anthropic.com/v1/messages'

/** una petición con UNA imagen (en base64) y un texto: la usa la ruta `etiquetar` */
export interface PeticionConImagen {
  model: string
  max_tokens: number
  thinking: { type: 'between_tools' }
  system: string
  texto: string
  imagen: { tipo: string; base64: string }
  timeoutMs: number
}

interface CuerpoDeLaPeticion { model: string; max_tokens: number; thinking: { type: 'between_tools' }; system: string; messages: Array<{ role: 'user'; content: unknown }> }

async function enviar(cuerpo: CuerpoDeLaPeticion, timeoutMs: number): Promise<RespuestaDelModelo> {
  const llave = process.env.CLAUDE_API_KEY
  if (!llave) throw new SinLlave()
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), timeoutMs)
  try {
    const r = await fetch(DESTINO_DEL_MODELO, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': llave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    })
    if (!r.ok) throw new Error(`el modelo respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = (await r.json()) as { content?: Array<{ type?: string; text?: string }>; stop_reason?: string | null; usage?: { input_tokens?: number; output_tokens?: number } }
    const texto = (j.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    return { texto, stop_reason: j.stop_reason ?? null, usage: { input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0 } }
  } finally {
    clearTimeout(reloj)
  }
}

export async function llamarAlModelo(p: PeticionAlModelo): Promise<RespuestaDelModelo> {
  return enviar({ model: p.model, max_tokens: p.max_tokens, thinking: p.thinking, system: p.system, messages: p.messages }, p.timeoutMs)
}

export async function llamarAlModeloConImagen(p: PeticionConImagen): Promise<RespuestaDelModelo> {
  return enviar({
    model: p.model, max_tokens: p.max_tokens, thinking: p.thinking, system: p.system,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: p.imagen.tipo, data: p.imagen.base64 } }, { type: 'text', text: p.texto }] }],
  }, p.timeoutMs)
}
