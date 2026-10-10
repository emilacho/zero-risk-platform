/**
 * R7 · LA DUDA DEL MODELO SE CONSERVA. PURO.
 * Si un agente escribió una duda sobre un hecho («no sé si…, ¿realmente…, es marketing»), esa duda se ata a la afirmación del manual con la que comparte términos,
 * y esa afirmación no puede quedar `verificado` hasta que haya cita primaria o decida una persona.
 */
import { contenidoDe, normalizar, partirEnFrases } from './texto'

/** marcas de duda (patrones DATO por idioma, sobre texto normalizado). Conservadoras: ninguna es una palabra suelta de uso común. */
export const MARCAS_DE_DUDA_ES: RegExp[] = [
  /\bno se si\b/, /\bno esta claro\b/, /\bno se sabe\b/, /\bsi realmente\b/, /\b(o|u) es (solo |solamente |puro |pura )?marketing\b/, /\bsin confirmar\b/,
  /\bno (hay|existe|tenemos) (evidencia|confirmacion|prueba)\b/, /\bhabria que (verificar|confirmar|comprobar)\b/, /\bpor (verificar|confirmar|comprobar)\b/, /\bparece (ser )?(solo )?marketing\b/,
]

export interface Duda { origen: string; frase: string; terminos: string[] }

/** las dudas escritas en textos de agentes (cada texto trae su origen: «ICP · objeciones», «resumen competitivo»…) */
export function detectarDudas(textos: Array<{ origen: string; texto: string }>): Duda[] {
  const out: Duda[] = []
  for (const t of textos) {
    // un texto puede ser una lista JSON de objeciones: se parte también por comillas de lista
    for (const f of partirEnFrases(String(t.texto).replace(/","/g, '\n').replace(/^\["|"\]$/g, ''))) {
      const n = normalizar(f)
      if (MARCAS_DE_DUDA_ES.some((r) => r.test(n))) out.push({ origen: t.origen, frase: f.trim(), terminos: [...new Set(contenidoDe(f))] })
    }
  }
  return out
}

/** las dudas que comparten al menos `minimo` términos de contenido con la frase del manual */
export function dudasAtadas(frase: string, dudas: Duda[], minimo = 2): Duda[] {
  const t = new Set(contenidoDe(frase))
  return dudas.filter((d) => d.terminos.filter((x) => t.has(x)).length >= minimo)
}
