/**
 * 18-nov · GO Lenovo 13:52Z (DECISION-EMILIO «nada detiene el flujo»): LA REGLA DURA ROTA VUELVE AL CREADOR · es DATO del paso `jefatura` de las plantillas con mesa.
 *  · antes: solo `kit_mesa` podía devolver la pieza a la mesa, y una sola vez; en post, carrusel y video con mesa una regla dura rota llegaba a la bandeja como observación.
 *  · ahora: la jefatura de las cuatro puede devolverla. Lo de criterio vuelve una sola vez (el código no lo reabre tras la vuelta); la regla dura, mientras siga rota y quepa.
 *  · el tope REAL es el dinero del encargo (`puedeVolverALaMesa` → `cabeLaVuelta`: cada vuelta tiene que caber en lo que queda) y los pasos de la plantilla (su margen).
 *    `max` es solo la red de seguridad para que ningún reintento sea infinito (CLAUDE.md §2.2, guardrail 2).
 * Pasar a esto es la migración 202611181530 (con su reversa); el código no lee estas constantes en producción.
 */
import { ARTEFACTO_DE_LA_JEFATURA, CLAVE_DEL_PASO_JEFATURA } from '../paso-jefatura'
import type { Paso, Plantilla } from '../tipos'

/** la red de seguridad: cuántas vueltas de la jefatura a la mesa como mucho, aunque quepan en el dinero */
export const VUELTAS_POR_REGLA_DURA = 6

export const VUELTA_POR_REGLA_DURA: NonNullable<Paso['vuelve_a']> = { paso: 'mesa', max: VUELTAS_POR_REGLA_DURA, si: { tipo: 'si_artefacto', artefacto: ARTEFACTO_DE_LA_JEFATURA, campo: 'vuelve_a_la_mesa', igual: true } }

/** las familias con mesa cuya jefatura gana la vuelta (las de julio no tienen mesa: su regla dura queda «en corrección») */
export const FAMILIAS_CON_VUELTA_POR_REGLA_DURA = ['post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'] as const

export function conVueltaPorReglaDura(pl: Plantilla): Plantilla {
  const iMesa = pl.pasos.findIndex((p) => p.clave === 'mesa')
  const iJef = pl.pasos.findIndex((p) => p.clave === CLAVE_DEL_PASO_JEFATURA)
  if (iMesa < 0 || iJef < iMesa) throw new Error(`«${pl.tipo}» no tiene la mesa antes de la jefatura: no hay a quién devolver la pieza`)
  return { ...pl, pasos: pl.pasos.map((p, i) => (i === iJef ? { ...p, vuelve_a: structuredClone(VUELTA_POR_REGLA_DURA) } : p)) }
}
