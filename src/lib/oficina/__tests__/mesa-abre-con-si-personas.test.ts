/**
 * T6 (CC3 · V07): al abrir una pieza de calendario, el orquestador calcula `si_personas` del brief y lo deja en el estado de la mesa; sin personas no hay condición. US$ 0, memoria.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, parteCon } from './mesa-arnes'
import type { EstadoMesa } from '../mesa/tipos'

async function abrirCon(brief: string): Promise<EstadoMesa> {
  const M = crearMemoria({ parte: parteCon(brief), plantilla: CARRUSEL_MESA })
  M.P.mesa = crearMesaEnMemoria()
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return M.encargos.get(String(a.cuerpo.encargo_id))!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
}

describe('la mesa abre con las condiciones que calcula sola', () => {
  it('un brief con personas deja `si_personas` en el estado', async () => {
    const est = await abrirCon(BRIEF_CARRUSEL.replace('El plato del día. UNO.', 'Una familia compartiendo el plato del día. UNO.'))
    expect(est.condiciones).toEqual(['si_personas'])
  })
  it('un brief sin personas no lleva condiciones (la clave no existe, como antes)', async () => {
    const est = await abrirCon(BRIEF_CARRUSEL)
    expect(est.condiciones).toBeUndefined()
  })
})
