/** cambio 4 · ayuda de pruebas: la hoja de una pieza como la escribe `src/lib/cadena/hoja.ts`, con la función REAL de la cadena, y 3 clientes de rubros distintos */
import { fichaEnLineas, type FichaDeOferta } from '../../cadena/ficha-de-oferta'

/** una sección de hoja (OFERTA + FICHA DE LA OFERTA como lista + el resto de campos) */
export function hoja(oferta: string | null, ficha: FichaDeOferta | null | 'sin_fichas', fecha: string, extra: string[] = []): string {
  const L = ['### F-01 · Instagram · post', `- QUÉ ES: post para Instagram`, `- OFERTA: ${oferta ?? 'sin oferta en la fila · declarado'}`]
  if (ficha === 'sin_fichas') L.push('- FICHA DE LA OFERTA: sin fichas de hechos todavía · declarado')
  else if (!ficha) L.push(`- FICHA DE LA OFERTA: sin ficha para «${oferta}» · declarado`)
  else { L.push('- FICHA DE LA OFERTA:'); for (const l of fichaEnLineas(ficha, fecha)) L.push(`  - ${l}`) }
  L.push('- MENSAJE (uno): lo de la pieza', ...extra)
  return L.join('\n')
}

// tres clientes de rubros distintos (agnóstico: «oferta», nunca un rubro en el código)
export const CLIENTES: Array<{ nombre: string; ficha: FichaDeOferta; precioBien: string; precioMal: string }> = [
  {
    nombre: 'Náufrago (comida)',
    ficha: { clave: 'olon', nombre: 'Olón', que_es: { valor: 'cocina de mar a domicilio', fuente: 'ficha:1' }, oferta_y_precio: [{ valor: 'combo del día $8,50', fuente: 'manual:precios' }, { valor: 'promo de apertura $5', fuente: 'plan:p2', vigente_hasta: '2026-11-10' }], no_se_puede_afirmar: [{ valor: 'atención en local antes de diciembre', fuente: 'cerebro:dueno · client_sede_datos:9', vigente_desde: '2026-11-01' }] },
    precioBien: 'Pide el combo del día a $8.50', precioMal: 'Pide el combo del día a $9.90',
  },
  {
    nombre: 'tienda en línea (doble)',
    ficha: { clave: 'linea-hogar', nombre: 'Línea hogar', que_es: { valor: 'textiles para el hogar', fuente: 'ficha:2' }, oferta_y_precio: [{ valor: 'juego de sábanas USD 1.200', fuente: 'manual:catalogo' }, { valor: 'envío gratis desde $50', fuente: 'plan:p1', vigente_hasta: '2026-11-10' }] },
    precioBien: 'Juego de sábanas a USD 1200', precioMal: 'Juego de sábanas a USD 1,2',
  },
  {
    nombre: 'servicio profesional (doble)',
    ficha: { clave: 'asesoria-tributaria', nombre: 'Asesoría tributaria', que_es: { valor: 'declaración anual para personas', fuente: 'ficha:3' }, oferta_y_precio: [{ valor: 'declaración anual 120 dólares', fuente: 'manual:tarifas' }, { valor: 'primera consulta gratis', fuente: 'plan:p3', vigente_desde: '2026-12-01' }] },
    precioBien: 'La declaración anual por 120 dólares', precioMal: 'La declaración anual por 150 dólares',
  },
]
