/**
 * C · lo que el portero VE de la sala (solo lectura): los destinos activos con su estado real y los recados abiertos del cliente (los de verdad, no los de prueba).
 * No escribe nada y no nombra las tablas: lee por el almacén de la puerta. Si falla, quien lo llama (`razonar`) sigue sin esto; nunca tumba al portero.
 */
import type { ContextoDeRecados } from '@/lib/cerebro/portero/recados'
import type { Almacen } from './puerta'

export const MAXIMO_DE_RECADOS_QUE_VE_EL_PORTERO = 50

export async function contextoParaElPortero(almacen: Almacen, clientId: string): Promise<ContextoDeRecados> {
  const [destinos, abiertos] = await Promise.all([almacen.listarDestinos(), almacen.abiertosDe(clientId, false)])
  return {
    // un destino apagado (el dueño) no se ofrece: nada va a Emilio
    destinos: destinos.filter((d) => d.activo).map((d) => ({ destino: d.destino, tipo: d.tipo, estado_del_brazo: d.estado_del_brazo })),
    abiertos: abiertos.slice(0, MAXIMO_DE_RECADOS_QUE_VE_EL_PORTERO).map((r) => ({ numero: r.id, que_falta: r.que_falta, destino: r.destino })),
  }
}
