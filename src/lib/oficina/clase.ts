/**
 * LA CLASE DE UNA PIEZA ES UN DATO DE SU PLANTILLA · fila #19 del barrido de reglas rígidas (GO Lenovo 11-nov 03:55Z) · puro.
 *
 * Antes: qué familia es carrusel, kit o video, y cuál no tiene pieza simple (pasarela), se decidía por el NOMBRE de la familia en 7 archivos;
 * una familia nueva cargada en la tabla caía como «post» (se revisaba y se dibujaba como una publicación con imagen).
 * Ahora: la plantilla (`oficina_tipos_de_grupo.clase`) declara su clase. El código solo sabe qué HACE cada clase (dibuja láminas, tiene pasarela);
 * nunca qué familia es de cuál. Una plantilla sin clase legible no abre encargos: lo dice (409), no la adivina.
 */
import type { Plantilla } from './tipos'

export const CLASES_DE_PIEZA = ['post_img', 'carrusel', 'kit', 'video', 'interna'] as const
export type ClaseDePieza = (typeof CLASES_DE_PIEZA)[number]

/** lo que el código hace distinto por clase (la clase la pone el dato; esto es comportamiento, no una lista de familias) */
export const COMPORTAMIENTO_DE_CLASE: Record<ClaseDePieza, { laminas: boolean; pasarela: boolean }> = {
  post_img: { laminas: false, pasarela: true },
  carrusel: { laminas: true, pasarela: true },
  kit: { laminas: true, pasarela: true },
  /** un reel no se puede hacer como publicación con imagen: si la oficina no lo abre, el sobre espera (409 visible) */
  video: { laminas: false, pasarela: false },
  /** pasos internos de la mesa (brief, concepto, reubicación): no son una pieza que se publique; la puerta los trata como hoy (pasarela) */
  interna: { laminas: false, pasarela: true },
}

export const esClaseDePieza = (x: unknown): x is ClaseDePieza => typeof x === 'string' && (CLASES_DE_PIEZA as readonly string[]).includes(x)

/** la clase declarada por la plantilla; `null` si no la declara o no es una de las conocidas (nunca se deduce del nombre) */
export const claseDe = (pl: Pick<Plantilla, 'clase'> | null | undefined): ClaseDePieza | null => (pl && esClaseDePieza(pl.clase) ? pl.clase : null)

export const dibujaLaminas = (c: ClaseDePieza | null): c is 'carrusel' | 'kit' => !!c && COMPORTAMIENTO_DE_CLASE[c].laminas
/** sin clase conocida no se sabe si hay pieza simple: el sobre sigue por la pasarela como hoy (la pasarela lo dice si tampoco la conoce) */
export const tienePasarela = (c: ClaseDePieza | null): boolean => (c ? COMPORTAMIENTO_DE_CLASE[c].pasarela : true)
