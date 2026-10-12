/**
 * EL REGISTRO DEL CLIENTE EN LA CADENA · r75 · H2 · tuteo, voseo o usted lo deciden el manual y el país del cliente (la MISMA resolución que usa la pieza: `trato-logica.js`), nunca una regla fija del proyecto.
 *   · las indicaciones a los agentes dicen el registro del cliente (o que no está fijado);
 *   · V15 bloquea las formas de OTRO registro solo si el registro está fijado; sin dato no inventa una regla (no bloquea nada).
 * Agnóstico: ningún cliente, ciudad ni rubro.
 */
import { hallarVoseo } from './afirmaciones'
const T = require('../trato/trato-logica.js') as TratoLogica
interface Resolucion { trato: 'tu' | 'vos' | 'usted' | 'conflicto' | 'no_definido'; fuente: string; evidencia: string }
interface TratoLogica { resolverTrato(manual: unknown, ficha: unknown): Resolucion; formasDeTrato(t: string): { vos: string[]; tu: string[]; usted: string[] } }

export type RegistroDelCliente = 'tu' | 'vos' | 'usted' | 'sin_dato'

/** el registro ya resuelto: manual > ficha > país; en conflicto o sin dato, `sin_dato` (se declara, no se elige) */
export function registroDelCliente(manual: unknown, ficha: unknown): { registro: RegistroDelCliente; fuente: string } {
  const r = T.resolverTrato(manual, ficha)
  return r.trato === 'tu' || r.trato === 'vos' || r.trato === 'usted' ? { registro: r.trato, fuente: r.fuente } : { registro: 'sin_dato', fuente: r.trato === 'conflicto' ? 'conflicto en el manual' : 'sin dato' }
}

/** la regla de registro de las indicaciones */
export function reglaDeRegistro(r: RegistroDelCliente | undefined): string {
  if (r === 'tu') return 'Escribe en tuteo (tú). Nada de voseo.'
  if (r === 'vos') return 'Escribe en voseo (vos). Nada de tuteo.'
  if (r === 'usted') return 'Trata de usted. Nada de tuteo ni de voseo.'
  return 'El registro del cliente (tú · vos · usted) no está fijado ni por su manual ni por su país: no lo inventes y evita la segunda persona marcada en los temas.'
}

/** las formas de OTRO registro en un tema, dado el del cliente · sin dato no se marca nada */
export function formasDeOtroRegistro(r: RegistroDelCliente | undefined, tema: string): string[] {
  if (r === 'tu') return hallarVoseo(tema)
  if (r === 'vos' || r === 'usted') {
    const f = T.formasDeTrato(String(tema ?? ''))
    return (r === 'vos' ? [...f.tu, ...f.usted] : [...f.tu, ...f.vos])
  }
  return []
}
export const nombreDelRegistro = (r: RegistroDelCliente | undefined): string => (r === 'tu' ? 'tuteo' : r === 'vos' ? 'voseo' : r === 'usted' ? 'usted' : 'sin dato')
