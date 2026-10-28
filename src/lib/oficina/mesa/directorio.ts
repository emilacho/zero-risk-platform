/**
 * EL DIRECTORIO VIVO · quién está en la mesa y qué especialidades son pertinentes para cada tipo de pieza. Es DATO (`oficina_directorio`), no código:
 * agregar un agente = insertar una fila; quitarlo = `activo=false`. Puro: sin base ni red.
 */
import type { Tarjeta, TipoDePieza } from './tipos'

const CONDICION_IMAGEN = 'si_imagen_generada'

/** ¿esta tarjeta es de aporte obligatorio en este tipo de pieza? `carrusel` siempre · `carrusel:si_imagen_generada` solo si alguna imagen se genera */
export function esPertinente(t: Tarjeta, tipo: TipoDePieza, hayImagenGenerada: boolean): boolean {
  if (!t.activo) return false
  return t.pertinente_en.some((p) => {
    const [tp, cond] = p.split(':')
    if (tp !== tipo) return false
    if (!cond) return true
    return cond === CONDICION_IMAGEN ? hayImagenGenerada : false
  })
}

/** los especialistas cuyo aporte es obligatorio (sin la dirección y sin el portero: ellos no «aportan», dirigen o traen material) */
export function especialistasPertinentes(directorio: Tarjeta[], tipo: TipoDePieza, hayImagenGenerada: boolean): string[] {
  return directorio.filter((t) => t.rol === 'miembro' && esPertinente(t, tipo, hayImagenGenerada)).map((t) => t.agente)
}

export const direccionDe = (directorio: Tarjeta[]): Tarjeta | null => directorio.find((t) => t.rol === 'direccion' && t.activo) ?? null
export const porteroDe = (directorio: Tarjeta[]): Tarjeta | null => directorio.find((t) => t.rol === 'portero' && t.activo) ?? null

/** el directorio que TODOS reciben en cada turno (en español, escrito para compañeros); `yo` se marca para que cada uno sepa quién es */
export function seccionDelDirectorio(directorio: Tarjeta[], yo: string): string {
  const linea = (t: Tarjeta): string => {
    const partes = [
      `**${t.agente}**${t.agente === yo ? ' (tú)' : ''} — ${t.especialidad}`,
      t.sabe_hacer.length ? `  Sabe hacer: ${t.sabe_hacer.join('; ')}.` : '',
      t.necesita.length ? `  Necesita para trabajar: ${t.necesita.join('; ')}.` : '',
      t.entrega.length ? `  Entrega: ${t.entrega.join('; ')}.` : '',
    ].filter(Boolean)
    return partes.join('\n')
  }
  const activos = directorio.filter((t) => t.activo)
  return ['## El equipo (directorio vivo)', ...activos.map(linea)].join('\n\n')
}
