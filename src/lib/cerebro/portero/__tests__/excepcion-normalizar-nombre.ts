/**
 * LA ÚNICA EXCEPCIÓN a la prohibición de partir o normalizar textos (relevo 3 de Lenovo, hallazgo 2 de CC#3).
 *
 * La prueba permanente prohíbe `normalize('NFD')` y el rango de tildes en TODO `src/lib/cerebro/` y la ruta del portero, porque son la herramienta de la búsqueda
 * por palabras que el paso 6 borró. La ruta `etiquetar` (paso 4, PR #431) la usa en UN solo lugar y para OTRA cosa: comparar el nombre de un producto que dijo el modelo
 * contra el catálogo del cliente sin que importen mayúsculas ni tildes («no inventa producto»: lo que no está en el catálogo se descarta). No toca el pedido ni ordena ni filtra líneas.
 *
 * La excepción es CON NOMBRE y MÍNIMA:
 *  · un solo archivo: `src/lib/cerebro/portero/etiquetar.ts`;
 *  · una sola declaración, LÍNEA POR LÍNEA IDÉNTICA a esta (si alguien la cambia, deja de valer y la prohibición vuelve a saltar);
 *  · una sola vez en ese archivo (una segunda aparición no está cubierta);
 *  · nada más: el resto de ese archivo y de todos los demás sigue sujeto a la prohibición completa; y la lectura del texto del pedido sigue prohibida en `etiquetar.ts`.
 */
export const ARCHIVO_CON_EXCEPCION = 'src/lib/cerebro/portero/etiquetar.ts'
const COMBINANTES = `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`
/** la declaración exacta de `normalizar` en `etiquetar.ts` (comparar un nombre de producto con el catálogo) */
export const LINEA_CON_EXCEPCION = `const normalizar = (t: string): string => t.normalize('NFD').replace(/${COMBINANTES}/g, '').toLowerCase().replace(/\\s+/g, ' ').trim()`

/** devuelve el texto SIN la línea exceptuada (solo en el archivo permitido y solo la primera vez); todo lo demás queda para que la prohibición lo revise */
export function sinLaExcepcion(rel: string, texto: string): string {
  if (rel !== ARCHIVO_CON_EXCEPCION) return texto
  const lineas = texto.split('\n')
  const i = lineas.findIndex((l) => l.trim() === LINEA_CON_EXCEPCION)
  if (i < 0) return texto
  lineas.splice(i, 1)
  return lineas.join('\n')
}
