/**
 * RETOMAR DESDE EL PUNTO EXACTO DONDE SE CAYÓ · entrega 2a: las PIEZAS SIN MESA (el orquestador general) · GO Lenovo 24-nov 11:16Z.
 * Antes: un paso que caía por causa externa (saldo, proveedor, red) cerraba la pieza `fallido` y gastaba una de sus versiones; la cadena la volvía a pedir
 * desde cero. Ahora la pieza queda EN PAUSA (`en_paso`, sin turno corriendo), con el motivo a la vista, UNA alarma, y `siguiente` / `reanudar` vuelven a pedir el MISMO paso.
 * El texto de saldo es el REAL del encargo 9aac063b (turno 26, leído de `oficina_turnos` el 24-nov, solo lectura). US$ 0: base en memoria, sin red ni modelo.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, avanzar, recibirResultado } from '../orquestador'
import { reanudarMesa } from '../mesa/orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const SIN_SALDO = 'el agente FALLÓ · el empleado FALLÓ · Credit balance is too low · gastado ≈ US$ 0.0000 · lo escrito hasta ahí es PARCIAL y no se da por respuesta'
const SOBRECARGA = 'el agente FALLÓ · Overloaded'

const sobre = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }
type R = { cuerpo: Record<string, unknown>; status: number }
type T = { n: number; paso: string; agente: string }

async function enEspera() {
  const M = crearMemoria()
  const a = await abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const r = (a.cuerpo.accion === 'esperar' ? a : await avanzar(M.P, id)) as R
  return { M, id, t: r.cuerpo.turno as T }
}
const enc = (M: ReturnType<typeof crearMemoria>, id: string) => M.encargos.get(id)!
const corriendo = (M: ReturnType<typeof crearMemoria>, id: string) => [...(M.turnos.get(id)?.values() ?? [])].filter((x) => x.estado === 'corriendo')
const alarmas = (M: ReturnType<typeof crearMemoria>) => M.llamadas.avisos.filter((a) => a.texto.includes('EN PAUSA'))

describe('la pieza queda EN PAUSA por una causa externa (no cierra, no gasta versión)', () => {
  it('sin saldo: `en_paso`, sin turno corriendo, la pausa a la vista y UNA alarma a #alertas', async () => {
    const { M, id, t } = await enEspera()
    const r = (await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })) as R
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'en_pausa_por_causa_externa', encargo_id: id, causa: 'saldo', paso: t.paso, agente: t.agente })
    expect(enc(M, id).estado).toBe('en_paso')
    expect(enc(M, id).estado_del_motor.pausa_externa).toMatchObject({ causa: 'saldo', paso: t.paso, agente: t.agente, n: t.n })
    expect(enc(M, id).estado_del_motor.pausa_externa!.motivo).toContain('Credit balance is too low')
    expect(enc(M, id).estado_del_motor.fallo).toBeUndefined()
    expect(corriendo(M, id)).toHaveLength(0)
    expect(M.turnos.get(id)!.get(t.n)).toMatchObject({ estado: 'fallo' })
    expect(String(M.turnos.get(id)!.get(t.n)!.error)).toMatch(/^en pausa: /)
    expect(alarmas(M)).toHaveLength(1)
    expect(alarmas(M)[0].canal).toBe('alertas')
    expect(enc(M, id).estado_del_motor.vueltas.pausas_externas).toBe(1)
  })
  it('control: un error que NO es externo (formato, agente) cierra `fallido` como siempre, sin pausa ni alarma de pausa', async () => {
    const { M, id, t } = await enEspera()
    await recibirResultado(M.P, id, t.n, { error: 'el agente devolvió un formato inválido', costo_usd: 0.02 })
    expect(enc(M, id).estado).toBe('fallido')
    expect(enc(M, id).estado_del_motor.pausa_externa).toBeUndefined()
    expect(alarmas(M)).toHaveLength(0)
  })
  it('un turno con `pedido_no_llego` y SIN texto de error también queda en pausa (red), no cierra (observación de CC6 en #1279)', async () => {
    const { M, id, t } = await enEspera()
    const r = (await recibirResultado(M.P, id, t.n, { pedido_no_llego: true, costo_usd: 0 })) as R
    expect(r.cuerpo).toMatchObject({ accion: 'en_pausa_por_causa_externa', causa: 'red' })
    expect(enc(M, id).estado).toBe('en_paso')
  })
  it('lo gastado en el turno que cayó se suma (no se pierde la cuenta)', async () => {
    const { M, id, t } = await enEspera()
    const antes = enc(M, id).estado_del_motor.gasto_usd
    await recibirResultado(M.P, id, t.n, { error: SOBRECARGA, costo_usd: 0.03 })
    expect(enc(M, id).estado_del_motor.pausa_externa).toMatchObject({ causa: 'limite_del_proveedor' })
    expect(enc(M, id).estado_del_motor.gasto_usd).toBeCloseTo(antes + 0.03, 6)
  })
})

describe('se retoma desde el MISMO paso', () => {
  it('`siguiente` quita la pausa y vuelve a pedir el paso caído (lo hecho antes no se repite)', async () => {
    const { M, id, t } = await enEspera()
    const pasosAntes = enc(M, id).estado_del_motor.ultimo
    await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })
    const r = (await avanzar(M.P, id)) as R
    expect(r.cuerpo.accion).toBe('esperar')
    expect((r.cuerpo.turno as T).paso).toBe(t.paso)
    expect((r.cuerpo.turno as T).n).toBeGreaterThan(t.n)
    expect(enc(M, id).estado_del_motor.pausa_externa).toBeNull()
    expect(enc(M, id).estado_del_motor.ultimo).toBe(pasosAntes)
    expect(enc(M, id).estado_del_motor.vueltas.reanudaciones).toBe(1)
  })
  it('si vuelve a caer tras reanudar, la alarma va al HILO (una por incidente)', async () => {
    const { M, id, t } = await enEspera()
    await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })
    const t2 = ((await avanzar(M.P, id)) as R).cuerpo.turno as T
    await recibirResultado(M.P, id, t2.n, { error: SIN_SALDO, costo_usd: 0 })
    expect(alarmas(M).map((a) => a.canal)).toEqual(['alertas', 'hilo'])
    expect(enc(M, id).estado_del_motor.vueltas.pausas_externas).toBe(2)
    expect(enc(M, id).estado).toBe('en_paso')
  })
  it('`reanudar` de una pieza en pausa hace lo mismo que `siguiente`', async () => {
    const { M, id, t } = await enEspera()
    await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })
    const r = (await reanudarMesa(M.P, id)) as R
    expect(r.cuerpo.accion).toBe('esperar')
    expect((r.cuerpo.turno as T).paso).toBe(t.paso)
    expect(enc(M, id).estado_del_motor.pausa_externa).toBeNull()
  })
  // CC6 · certificación de #1280 · p6: una pieza cerrada a mano que arrastra la marca de pausa no se vuelve a mover
  it('`reanudar` de una pieza `cerrado` o `fallido` que ARRASTRA `pausa_externa`: 409 `no_se_reanuda`, sin avanzar ni abrir turno', async () => {
    for (const estado of ['cerrado', 'fallido'] as const) {
      const { M, id, t } = await enEspera()
      await recibirResultado(M.P, id, t.n, { error: SIN_SALDO, costo_usd: 0 })
      expect(enc(M, id).estado_del_motor.pausa_externa).toBeTruthy()
      enc(M, id).estado = estado
      const turnosAntes = M.turnos.get(id)!.size
      const r = (await reanudarMesa(M.P, id)) as R
      expect(r.status).toBe(409)
      expect(r.cuerpo.error).toBe('no_se_reanuda')
      expect(enc(M, id).estado).toBe(estado)
      expect(enc(M, id).estado_del_motor.pausa_externa).toBeTruthy()
      expect(M.turnos.get(id)!.size).toBe(turnosAntes)
    }
  })
  it('`reanudar` se niega con el porqué: una pieza trabajando (sin pausa) o una cerrada', async () => {
    const a = await enEspera()
    const ra = (await reanudarMesa(a.M.P, a.id)) as R
    expect(ra.status).toBe(409)
    expect(ra.cuerpo.error).toBe('no_se_reanuda')
    const b = await enEspera()
    await recibirResultado(b.M.P, b.id, b.t.n, { error: 'el agente devolvió un formato inválido', costo_usd: 0 })
    const rb = (await reanudarMesa(b.M.P, b.id)) as R
    expect(rb.status).toBe(409)
    expect(rb.cuerpo.error).toBe('no_se_reanuda')
    expect(enc(b.M, b.id).estado).toBe('fallido')
  })
})
