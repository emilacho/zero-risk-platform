/**
 * 18-nov · T7d · encargo de Lenovo, arreglo 1 (regla de Emilio: los límites técnicos al máximo sin preguntar). US$ 0, sin base ni red ni modelo.
 * En la mesa de la GRAN IDEA (`0aa14d17`) el director anotó 6 pedidos (A3–A8), el máximo por agente, y en su última integración el sistema le contestó con el tope.
 * Los conteos de esa mesa suben (12 pedidos por agente · profundidad 4 · 48 turnos) y el freno queda en el dinero. Las demás mesas siguen igual.
 * Lo que NO prueba esto: que el banco llegue a 120. El banco se perdió en la devolución por citas, no por los pedidos (ver el papel de Lenovo).
 */
import { describe, expect, it } from 'vitest'
import { registrarHerramienta, MAX_PEDIDOS_POR_AGENTE } from '../mesa/herramienta'
import { armarTarea } from '../mesa/pedidos'
import { cotaAgotada, pedidosAtendibles, reservaDeLoQueSigue } from '../mesa/planificador'
import { COTAS, COTAS_DE_LA_GRAN_IDEA, profundidadMaximaDe, turnosMaximosDe, type Aporte, type EstadoMesa, type Tarjeta } from '../mesa/tipos'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA, TOPE_DE_LA_MESA_DE_CONCEPTO_USD } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

describe('los conteos de la mesa de la gran idea', () => {
  it('suben solo en la gran idea; las demás mesas siguen con los de siempre', () => {
    expect(COTAS_DE_LA_GRAN_IDEA).toEqual({ MAX_PEDIDOS_POR_AGENTE: 12, MAX_PROFUNDIDAD: 4, MAX_TURNOS: 48 })
    expect(profundidadMaximaDe('concepto')).toBe(4)
    expect(turnosMaximosDe('concepto')).toBe(48)
    for (const t of ['brief', 'carrusel', 'kit', 'video', 'post', undefined] as const) {
      expect(profundidadMaximaDe(t)).toBe(COTAS.MAX_PROFUNDIDAD)
      expect(turnosMaximosDe(t)).toBe(COTAS.MAX_TURNOS)
    }
    expect([COTAS.MAX_PROFUNDIDAD, COTAS.MAX_TURNOS, MAX_PEDIDOS_POR_AGENTE]).toEqual([2, 24, 6])
    // profundidad = idas y vueltas por pareja: pedir más hondo no se podría usar
    expect(COTAS_DE_LA_GRAN_IDEA.MAX_PROFUNDIDAD).toBe(COTAS.MAX_IDAS_VUELTAS_POR_PAREJA)
  })

  it('el freno es el dinero: al costo real de T7d (US$ 5,93 en 22 turnos), el tope de 10 corta antes de los 48 turnos', () => {
    const costoPorTurno = 5.929889 / 22
    const est = (turnos: number) => ({ tipo: 'concepto', turnos } as unknown as EstadoMesa)
    const ctx = (turnos: number) => ({ gasto_usd: turnos * costoPorTurno, tope_usd: TOPE_DE_LA_MESA_DE_CONCEPTO_USD, hayImagenGenerada: false, reserva_posterior_usd: 0, tipo: 'concepto' as const })
    let corte = 0
    while (!cotaAgotada(est(corte), ctx(corte))) corte++
    expect(cotaAgotada(est(corte), ctx(corte))).toMatch(/tope de la pieza/)
    expect(corte).toBeLessThan(COTAS_DE_LA_GRAN_IDEA.MAX_TURNOS)
    expect(corte).toBeGreaterThan(COTAS.MAX_TURNOS) // con los 24 de antes, la mesa cortaba por conteo con dinero de sobra
    expect(reservaDeLoQueSigue(false, 0, 'concepto')).toBe(0)
    // los 48 siguen siendo una cota (bucle coherente): con dinero de sobra, cortan
    expect(cotaAgotada(est(48), { ...ctx(0), gasto_usd: 0 })).toMatch(/48 turnos/)
    expect(cotaAgotada(est(47), { ...ctx(0), gasto_usd: 0 })).toBeNull()
    // en el carrusel, los 24 de siempre
    expect(cotaAgotada({ tipo: 'carrusel', turnos: 24 } as unknown as EstadoMesa, { gasto_usd: 0, tope_usd: 5, hayImagenGenerada: false })).toMatch(/24 turnos/)
  })

  it('un pedido de profundidad 3 o 4 se atiende en la gran idea; en el carrusel no', () => {
    const dir: Tarjeta[] = [{ agente: 'creative-director-mesa', rol: 'direccion', activo: true }, { agente: 'content-creator', rol: 'miembro', activo: true }, { agente: 'carousel-designer', rol: 'miembro', activo: true }] as unknown as Tarjeta[]
    const p = (profundidad: number): Aporte => ({ id: `p${profundidad}`, encargo_id: 'e', n: 2 + profundidad, de: 'content-creator', para: 'carousel-designer', tipo: 'pide', texto: 'dame el ritmo', refs: [], responde_a: null, profundidad, costo_usd: 0, workflow_execution_id: null, creado_en: '2026-11-18T00:00:00Z' } as Aporte)
    const est = (tipo: string) => ({ tipo, directorio_congelado: dir } as unknown as EstadoMesa)
    for (const prof of [3, 4]) {
      expect(pedidosAtendibles(est('concepto'), [p(prof)])).toHaveLength(1)
      expect(pedidosAtendibles(est('carrusel'), [p(prof)])).toHaveLength(0)
    }
    expect(pedidosAtendibles(est('concepto'), [p(5)])).toHaveLength(0)
  })

  it('el texto que lee el equipo dice el máximo de su mesa', () => {
    const e = (tipo: EstadoMesa['tipo']) => ({ tipo, directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] } as EstadoMesa)
    const c = (tipo: 'concepto' | 'carrusel') => ({ cliente_nombre: 'Náufrago', tipo, brief_id: 'x', brief_texto: 'brief', manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 })
    expect(armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est: e('concepto'), libro: [], c: c('concepto') })).toContain('Máximo 4 niveles de pedidos encadenados')
    expect(armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est: e('carrusel'), libro: [], c: c('carrusel') })).toContain('Máximo 2 niveles de pedidos encadenados')
  })
})

const BRIEF = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel de 5 láminas
- PROTAGONISTA: El plato del día.
- LÍMITES: 4:5
- VISUAL: El plato aparece completo.
- LLAMADO A LA ACCIÓN: Escríbenos
`
const parte = `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${BRIEF}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
/** abre una pieza con el turno de la dirección abierto; con `comoGranIdea`, el estado de la mesa dice `concepto` (lo único que mira la herramienta) */
async function preparado(comoGranIdea: boolean) {
  const M = crearMemoria({ parte, plantilla: CARRUSEL_MESA })
  const MS = crearMesaEnMemoria()
  M.P.mesa = MS
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  if (comoGranIdea) (M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as { tipo: string }).tipo = 'concepto'
  return { M, MS, id, turno: a.cuerpo.turno as { agente: string } }
}
const pedirMuchos = async (comoGranIdea: boolean) => {
  const { M, MS, id, turno } = await preparado(comoGranIdea)
  // a todo el equipo (las idas y vueltas por pareja son otra cota, de 4: con dos compañeros cortaría en 8)
  const dir = (M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as { directorio_congelado: Tarjeta[] }).directorio_congelado
  const equipo = dir.filter((t) => t.activo && t.rol !== 'portero' && t.agente !== turno.agente).map((t) => t.agente)
  expect(equipo.length).toBeGreaterThanOrEqual(4)
  const respuestas = []
  for (let i = 0; i < 14; i++) respuestas.push(await registrarHerramienta(M.P, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: equipo[i % equipo.length], que: `pedido distinto número ${i}` }))
  return { anotados: MS.filas.filter((f) => f.de === turno.agente).length, ultimo: respuestas.at(-1)!.cuerpo }
}

describe('la herramienta de pedidos en la mesa real', () => {
  it('🔴 en la gran idea, la dirección anota 12 pedidos (antes 6) y el 13.º recibe el tope', async () => {
    const r = await pedirMuchos(true)
    expect(r.anotados).toBe(12)
    expect(r.ultimo).toMatchObject({ ok: false, motivo: expect.stringContaining('ya anotaste 12 pedidos') })
  })
  it('en el carrusel siguen siendo 6', async () => {
    const r = await pedirMuchos(false)
    expect(r.anotados).toBe(6)
    expect(r.ultimo).toMatchObject({ ok: false, motivo: expect.stringContaining('ya anotaste 6 pedidos') })
  })
})
