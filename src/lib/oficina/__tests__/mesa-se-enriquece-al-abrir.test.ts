/**
 * LA MESA SE ENRIQUECE DEL CEREBRO ANTES DE TRABAJAR (31-oct, ADENDA 2, Emilio): al abrir cada encargo, antes del primer turno, un pedido al portero con lo que pide ESA pieza;
 * lo que vuelva va al tablero para todos; vacío / cercano / negado / tope se anotan y la mesa SIGUE igual (nunca se frena). US$ 0: portero simulado.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { pedidoDeApertura } from '../mesa/orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, parteCon } from './mesa-arnes'
import type { PuertoDelCerebro } from '../puertos'
import type { Aporte, EstadoMesa } from '../mesa/tipos'
import { armarTarea } from '../mesa/pedidos'
import { siguienteDeLaMesa } from '../mesa/planificador'
import { DIRECTORIO } from './mesa-memoria'

type Resp = Awaited<ReturnType<PuertoDelCerebro['pedir']>>
const CON_HECHOS: Resp = { ok: true, body: { estado: 'completo', costo_usd: 0.08, huecos: [{ hueco: { objetivo: '¿Cuál es el plato del día?' }, estado: 'traido_y_archivado', hallazgos: [{ resumen: 'El plato del día es el encebollado', url: 'https://www.naufrago.ec/menu' }] }] } }
const VACIO: Resp = { ok: true, body: { estado: 'completo', costo_usd: 0.02, huecos: [{ hueco: { tipo: 'hechos' }, estado: 'no_resuelto', detalle: 'no hay' }] } }

async function abrir(o: { responder?: () => Resp; sinCerebro?: boolean; dry?: boolean } = {}) {
  const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA })
  const MS = crearMesaEnMemoria()
  M.P.mesa = MS
  const pedidos: Array<Record<string, unknown>> = []
  if (!o.sinCerebro) {
    M.P.cerebro = {
      avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta',
      pedir: async (p) => { pedidos.push(p as unknown as Record<string, unknown>); return (o.responder ?? (() => CON_HECHOS))() },
      leerPedido: async () => ({ ok: false, error: 'no se usa' }),
    }
  }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: o.dry ?? false, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const est = () => M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
  return { M, MS, a, id, pedidos, est }
}

describe('el pedido de apertura sale del brief de ESA pieza (puro)', () => {
  it('nombra la pieza, su protagonista y qué es, y pide fotos, hechos y lo más gustado; admite que no haya nada', () => {
    const t = pedidoDeApertura('BRF-0100', 'Instagram', 'carrusel', 'El plato del día. UNO.', 'Carrusel educativo')
    expect(t).toContain('BRF-0100 · Instagram · carrusel')
    expect(t).toContain('El plato del día. UNO.')
    expect(t).toContain('Carrusel educativo')
    expect(t).toMatch(/Fotos propias etiquetadas/)
    expect(t).toMatch(/lo que más ha gustado/)
    expect(t).toMatch(/Si no hay nada, dilo/)
  })
  it('sin campos del brief no inventa: solo lo que hay', () => {
    const t = pedidoDeApertura('BRF-1', null, undefined, null, '')
    expect(t).not.toMatch(/Protagonista|Qué es/)
  })
})

describe('al abrir: pedido al portero ANTES del primer turno y el material va al tablero', () => {
  it('un pedido al portero con el brief; el tablero queda con el pedido (oficina-creativa → portero) y el material; luego abre la dirección', async () => {
    const { MS, a, pedidos, est } = await abrir()
    expect(pedidos).toHaveLength(1)
    expect(JSON.stringify(pedidos[0])).toContain('BRF-0100')
    const pide = MS.filas.find((f) => f.tipo === 'pide')!
    expect(pide).toMatchObject({ de: 'oficina-creativa', para: 'portero' })
    const mat = MS.filas.find((f) => f.tipo === 'material')!
    expect(mat.texto).toContain('El plato del día es el encebollado')
    expect(mat.responde_a).toBe(pide.id)
    expect(MS.filas.some((f) => f.tipo === 'dirige')).toBe(false) // aún no trabajó nadie
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('creative-director-mesa') // el primer turno es de la dirección, que ya ve el material
    expect(est().marcas.apertura_enriquecida).toBe(true)
  })
  it('no gasta el cupo de pedidos de material del equipo', async () => {
    const { est } = await abrir()
    expect(Number(est().marcas.pedidos_de_material ?? 0)).toBe(0)
  })
  it('el pedido se hace UNA sola vez por pieza', async () => {
    const { M, id, pedidos } = await abrir()
    const { avanzarMesa } = await import('../mesa/orquestador')
    const enc = M.encargos.get(id)!
    await avanzarMesa(M.P, enc, M.plantilla!.plantilla as never, 0)
    expect(pedidos).toHaveLength(1)
  })
})

describe('si el portero no trae nada, la mesa sigue igual (nunca se frena)', () => {
  it('vacío: se anota «no tenía nada» y abre la dirección', async () => {
    const { MS, a } = await abrir({ responder: () => VACIO })
    expect(MS.filas.find((f) => f.tipo === 'material')!.texto).toMatch(/no tenía nada/)
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('creative-director-mesa')
  })
  it('negado por tope (429): se anota y abre la dirección', async () => {
    const { MS, a } = await abrir({ responder: () => ({ ok: false, error: 'tope diario de la oficina', http: 429 }) })
    expect(MS.filas.find((f) => f.tipo === 'material')!.texto).toMatch(/no tenía nada|portero/)
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('creative-director-mesa')
  })
  it('el portero falla de red: abre la dirección igual', async () => {
    const { a } = await abrir({ responder: () => ({ ok: false, error: 'fetch failed' }) })
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('creative-director-mesa')
  })
  it('ensayo (dry_run): no se le pide nada al portero y la mesa abre igual', async () => {
    const { a, pedidos } = await abrir({ dry: true })
    expect(pedidos).toHaveLength(0)
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('creative-director-mesa')
  })
})

describe('sin portero conectado la mesa funciona exactamente como antes', () => {
  it('sin cerebro: ningún pedido en el tablero y la dirección abre', async () => {
    const { MS, a } = await abrir({ sinCerebro: true })
    expect(MS.filas.filter((f) => f.tipo === 'pide' || f.tipo === 'material')).toHaveLength(0)
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('creative-director-mesa')
  })
})

describe('un especialista puede aportar «Sin aporte» (no se le obliga a rellenar) y la mesa sigue', () => {
  const dir = DIRECTORIO.map((t) => ({ ...t }))
  const estado = (): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: dir, direccion: 'creative-director-mesa', turnos: 1, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null } as EstadoMesa)
  const ap = (n: number, de: string, tipo: Aporte['tipo'], texto: string): Aporte => ({ id: `id-${n}`, encargo_id: 'e', n, de, para: null, tipo, texto, refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null } as unknown as Aporte)
  const ctx = { cliente_nombre: 'Cliente', tipo: 'carrusel' as const, brief_id: 'BRF-1', brief_texto: 'b', manual_texto: 'm', plan_texto: null, fotos: [], tope_usd: 5, gasto_usd: 0 }

  it('el turno de aportar le dice cómo declararlo', () => {
    const task = armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: dir.find((t) => t.agente === 'content-creator'), est: estado(), libro: [], c: ctx })
    expect(task).toMatch(/«Sin aporte:»/)
    expect(task).toMatch(/No rellenes por cumplir/)
  })
  it('un «Sin aporte: …» cuenta como participación: no se le convoca otra vez', () => {
    const libro = [ap(1, 'creative-director-mesa', 'dirige', 'idea rectora'), ap(2, 'content-creator', 'aporta', 'Sin aporte: el hook ya está bien como lo planteó la dirección')]
    const sig = siguienteDeLaMesa(estado(), libro, { gasto_usd: 0, tope_usd: 5, hayImagenGenerada: false })
    expect(sig.accion === 'turno' && sig.agente === 'content-creator' && sig.tipo === 'aportar').toBe(false)
  })
})
