/**
 * POST /api/tablero/crear-campana · «Crear Campaña» (entrega 2 · contrato con CC2 de las 21:04Z y 21:15Z). US$ 0 aquí: guarda el pedido y deja el sobre de «plan listo»
 * con su llave; la campaña nace después, en la puerta. El trabajo lo hace la cadena (`cadena/crear-campana.ts`); aquí solo se adapta a la forma de una acción del tablero.
 */
import type { Almacen } from '../../cadena/almacen'
import { crearCampana } from '../../cadena/crear-campana'
import type { Manejador } from './comun'

export const crearCampanaDelTablero = (almacen: () => Almacen): Manejador => async ({ ahora }, { cuerpo, reviewer }) => {
  const r = await crearCampana(almacen(), cuerpo, reviewer, ahora().toISOString())
  const clientId = typeof cuerpo.client_id === 'string' ? cuerpo.client_id : null
  const nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.slice(0, 120) : null
  return { status: r.status, cuerpo: r.cuerpo, toca: { client_id: clientId, comentario: nombre } }
}
