/**
 * 18-nov · LA MESA DE LA GRAN IDEA TAMBIÉN MIRA LO REAL (GO Lenovo, firma de Emilio 22:50 Zúrich). Qué mesas leen el índice del cerebro y con qué hoja.
 * Las mesas de pieza: la hoja es el brief de la pieza + el plan. La mesa de la gran idea (`concepto`): la hoja es el marco COMPLETO que le pasó la cadena
 * (su brief) + el plan. Sin casillas ni filtros por rol: cada miembro lee la base entera y pide por número lo que su oficio necesita. Las otras mesas de la
 * cadena (brief, reubicación, fallidos, banco) no cambian. Un solo lugar para las dos puntas: la apertura (orquestador) y `pedir_fichas` (herramienta).
 */
import type { Encargo } from '../puertos'
import { baseDeLaminas } from '../orquestador-laminas'
import { marcoDe } from './de-la-cadena'
import { piezaParaElCerebro, type PiezaParaElCerebro } from './indice-del-cerebro'
import { esDeLaCadena, type EstadoMesa } from './tipos'

/** ¿esta mesa lee el índice? Las de pieza y la de la gran idea */
export const leeElIndice = (tipo: EstadoMesa['tipo']): boolean => !esDeLaCadena(tipo) || tipo === 'concepto'

/** la pieza para el cerebro según la mesa: su encargo, su fila (si la hay) y su hoja completa */
export function piezaDeLaMesa(enc: Encargo, est: Pick<EstadoMesa, 'tipo'>): PiezaParaElCerebro {
  if (est.tipo === 'concepto') {
    const m = marcoDe(enc.estado_del_motor)
    return piezaParaElCerebro({ encargo_id: enc.id, brief_texto: m?.marco_texto, plan_texto: m?.plan_texto })
  }
  const bf = baseDeLaminas(enc.estado_del_motor)
  return piezaParaElCerebro({ encargo_id: enc.id, fila: enc.sala_ref?.fila, brief_texto: bf.brief.texto, plan_texto: bf.F.plan_texto })
}
