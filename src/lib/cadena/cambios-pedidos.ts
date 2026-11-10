/**
 * CAMBIOS PEDIDOS POR EL DUEÑO, CON ANÁLISIS DE IMPACTO (10-nov · decisión C de Emilio, literal): «el agente no debe cambiar una frase sino ver cómo afecta esa petición
 * de cambio a todo el documento; a veces se puede tratar de algo que reestructura todo el documento; debe haber ese análisis de por medio cuando se pide un cambio».
 *
 * Genérico (cualquier cliente, cualquier documento de la cadena). Va en el marco de la mesa SOLO cuando hay cambios pedidos por el dueño:
 *  - la orden de analizar el impacto ANTES de escribir, cambiar lo pedido y TODO lo que se derive, y conservar lo que no se vea afectado (si el cambio pide rehacer todo, se rehace);
 *  - que el documento nuevo ABRA con «## Qué cambió y por qué» (qué pidió el dueño y qué secciones se tocaron por ese pedido), sin códigos ni versiones;
 *  - para el brief, el texto de la versión anterior (el brief es corto; la gran idea recibe su resumen, que ya existe).
 * Los lectores de la cadena ignoran «## Qué cambió y por qué» (no es una sección del contrato), así que no cambia lo que se valida ni lo que lee la etapa siguiente.
 */
import { seccionesObligatoriasQueFaltan } from './brief-creativo'

export const TITULO_DE_LO_QUE_CAMBIO = 'Qué cambió y por qué'

/** los identificadores internos de la oficina (`brf-<12 hex>-v<n>`, `con-<12 hex>-v<n>`) no son para el dueño ni para el documento nuevo */
export function sinCodigosInternos(texto: string): string {
  return texto
    .replace(/\s*·\s*(?:brf|con)-[0-9a-f]{12}(?:\s*·\s*|-)v\d+\b/gi, '')
    .replace(/\s*·?\s*\b(?:brf|con)-[0-9a-f]{12}(?:-v\d+)?\b/gi, '')
}

/** la orden de análisis de impacto, igual para el brief y la gran idea */
export function ordenDeAnalisisDeImpacto(documento: 'el brief' | 'la gran idea'): string {
  return [
    `# CÓMO SE APLICAN LOS CAMBIOS (analiza antes de escribir)`,
    `1. ANTES de escribir, analiza cómo afecta CADA cambio pedido a TODO ${documento}: qué secciones toca directamente, cuáles toca de rebote (lo que se apoyaba en lo que cambia) y si obliga a reestructurarlo.`,
    '2. Cambia lo pedido Y todo lo que se derive de ello, en cualquier sección. No basta con reemplazar una frase si el resto del documento seguía apoyándose en la idea vieja.',
    '3. Conserva tal cual lo que el cambio no afecta. Si el cambio pide rehacer todo, rehazlo todo.',
    `4. ${documento === 'el brief' ? 'El brief nuevo' : 'La gran idea nueva'} ABRE con «## ${TITULO_DE_LO_QUE_CAMBIO}»: en 2 a 5 viñetas cortas, qué pidió el cliente y qué secciones tocaste por ese pedido (y por qué). Sin códigos internos, sin números de versión. Después, las secciones de siempre, en su formato.`,
    '5. El título del documento no lleva códigos internos ni números de versión.',
  ].join('\n')
}

/**
 * el bloque con el brief anterior, sin sus códigos internos.
 * 10-nov · si el anterior no cumple el formato de HOY (le faltan secciones obligatorias, p. ej. porque se validó antes de que lo fueran), el bloque
 * lo dice y ordena agregarlas desde el PLAN aunque el cambio no las toque: «conservar tal cual» no vale para lo que falta (brief v3 de Náufrago, devuelto por eso).
 */
export function briefAnteriorParaElMarco(b: { version: number; texto_md: string | null }): string {
  const texto = sinCodigosInternos(b.texto_md ?? '').trim()
  const faltan = seccionesObligatoriasQueFaltan(texto)
  return [
    `# EL BRIEF ANTERIOR (versión ${b.version}), sobre el que el cliente pidió cambios`,
    texto,
    ...(faltan.length ? [
      '',
      '# LO QUE LE FALTA AL BRIEF ANTERIOR (agrégalo aunque el cambio no lo toque)',
      `El formato de hoy exige secciones que el brief anterior no tiene: ${faltan.map((k) => `«## ${k}»`).join(', ')}.`,
      'Escríbelas con lo que dice el PLAN (y lo que no sepas va a «Faltantes», nunca se rellena). «Conservar tal cual» no vale para una sección que falta: sin ellas el brief se devuelve.',
      `Nómbralas en «## ${TITULO_DE_LO_QUE_CAMBIO}» como secciones agregadas por el formato, no por el pedido del cliente.`,
    ] : []),
  ].join('\n')
}
