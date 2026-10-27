/**
 * LO QUE UNA IMAGEN GENERADA NO PUEDE INVENTAR (condiciones 1 y 5 de CC#3 · 27-oct). Una imagen generada «de la nada» no es evidencia de nada: no muestra datos del producto ni de la marca que nadie verificó.
 * El prompt NO puede pedir: precios, cifras, porcentajes, teléfonos, usuarios ni enlaces · logotipos, eslóganes ni texto legible · etiquetas, sellos, certificaciones, normas ni lecturas de instrumentos (un manómetro con un valor, un sello de
 * certificación en un extintor es un dato de seguridad inventado) · ni nada que la competencia tenga escrito o publicado (su texto visible, su enlace, su usuario). Cada término puede ir NEGADO («sin logotipos»), eso sí vale (`aparicionesDe`).
 * Apagado por omisión: se enciende con `limites.generar_cuando_no_hay_foto` (el mismo interruptor que genera cuando no hay foto). La lista de términos es DATO de plantilla (`terminos_no_inventados`).
 */
import { referenciasDeEstilo } from './material'
import { aparicionesDe, datosDeContacto, normalizar } from './texto'

export const TERMINOS_NO_INVENTADOS = [
  'logo', 'logotipo', 'eslogan', 'slogan', 'lema', 'rotulo', 'letrero', 'texto legible', 'letras', 'tipografia visible', 'precio', 'oferta',
  'etiqueta', 'sello', 'certificacion', 'certificado', 'norma', 'manometro', 'lectura', 'medidor', 'indicador de presion', 'fecha de vencimiento', 'codigo de barras', 'qr',
]
const RE_DINERO = /(?:\$|us\$|usd)\s?\d|\d\s?(?:usd|dolares)\b/i
const RE_PORCENTAJE = /\d\s?%/

export interface ReglasDeInvencion { terminos: string[]; copiar: string[] }

/** `null` = apagado (la sala se comporta como antes). `referencias` = las fotos de la competencia/referencia: de ellas sale lo que NO se puede copiar (su texto visible, su enlace, su usuario) */
export function reglasDeInvencion(limites: Record<string, unknown> | undefined, referencias: Array<{ url?: string | null; texto_visible?: string | string[] | null; handle?: string | null }> = []): ReglasDeInvencion | null {
  if (limites?.generar_cuando_no_hay_foto !== true) return null
  const propios = Array.isArray(limites.terminos_no_inventados) ? (limites.terminos_no_inventados as unknown[]).map(String).filter(Boolean) : TERMINOS_NO_INVENTADOS
  const copiar = new Set<string>()
  for (const r of referencias) {
    const t = Array.isArray(r.texto_visible) ? r.texto_visible : r.texto_visible ? [r.texto_visible] : []
    for (const x of t) { const n = normalizar(String(x)).trim(); if (n.length >= 4) copiar.add(n) }
    if (r.handle) { const h = normalizar(String(r.handle)).replace(/^@/, '').trim(); if (h.length >= 3) copiar.add(h) }
    if (r.url) { try { const h = new URL(String(r.url)).hostname.replace(/^www\./, ''); if (h) copiar.add(normalizar(h)) } catch { /* una dirección rota no se copia */ } }
  }
  return { terminos: propios.map((x) => normalizar(x)), copiar: [...copiar] }
}

/** los motivos por los que el prompt NO se genera (vacío = pasa) */
export function motivosDeInvencion(prompt: string, r: ReglasDeInvencion): string[] {
  const m: string[] = []
  const d = datosDeContacto(prompt)
  if (RE_DINERO.test(prompt) || RE_PORCENTAJE.test(prompt)) m.push('pide un precio, una cifra o un porcentaje: una imagen generada no puede inventarlo')
  if (d.telefonos.length || d.handles.length || d.urls.length) m.push('trae un teléfono, un usuario o un enlace: eso no se genera')
  for (const t of r.terminos) if (t && aparicionesDe(prompt, t).some((a) => !a.negada)) m.push(`pide «${t}» sin negarlo: una imagen generada no inventa logotipos, textos, etiquetas, sellos, normas ni lecturas`)
  const n = normalizar(prompt)
  for (const c of r.copiar) if (c && n.includes(c)) m.push(`copia algo de una foto de la competencia o de referencia («${c.slice(0, 40)}»): la competencia es solo referencia de estilo, en palabras propias`)
  return m
}

/** lo que se le dice al ingeniero de prompts cuando la imagen se genera sin foto: de qué parte (lo verificado), qué estilo imita (en palabras) y qué NO puede pedir */
export function seccionDeImagenSinFoto(F: { fotos: Array<{ que_muestra?: string | null }>; referencias?: Array<{ origen?: 'propia' | 'competencia' | 'referencia'; que_muestra?: string | null; producto_visto?: string[] | null }>; vocabulario_de_productos: string[] }): string {
  const propias = F.fotos.map((f) => String(f.que_muestra ?? '').trim()).filter(Boolean).slice(0, 4)
  const refs = referenciasDeEstilo(F.referencias ?? [], 4)
  return [
    '\n\n## Si una imagen se GENERA (no hay foto del cliente apta para ella)',
    `Parte SOLO de lo que el cliente es. Productos verificados: ${F.vocabulario_de_productos.length ? F.vocabulario_de_productos.slice(0, 12).join(', ') : '(ninguno verificado: no nombres un producto concreto)'}.`,
    `Estilo de sus fotos propias (en palabras): ${propias.length ? propias.join(' | ') : '(sin fotos propias descritas)'}.`,
    `Referencias de estilo de otras cuentas (SOLO palabras, jamás copies su texto, su enlace ni su usuario): ${refs.length ? refs.join(' | ') : '(ninguna)'}.`,
    'La imagen generada NO inventa datos: no pidas precios, cifras, teléfonos, usuarios ni enlaces; no pidas logotipos, eslóganes, rótulos ni texto legible; no pidas etiquetas, sellos, certificaciones, normas ni lecturas de instrumentos (un manómetro con un valor, un sello en un equipo de seguridad serían datos inventados). Escribe el objeto y la escena, sin texto en la imagen.',
  ].join('\n')
}
