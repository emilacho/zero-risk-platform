/**
 * GO de Lenovo (10-nov · 14:59Z): el calendario NO programa nada antes de HOY (en la zona del cliente) + el plazo de producción del formato.
 * Lo que cae antes queda `perdio_su_fecha` con su razón escrita; lo demás sigue igual. Regla exacta de fechas, en código. Dos clientes de rubros distintos.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, filasLotes } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, formatosDeLaMigracion, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'
import { sumarDias } from '../fechas'
import { fueraDePlazoDeProduccion, leadDeFormato, PREFIJO_FUERA_DE_PLAZO } from '../lotes'
import type { Fila } from '../tipos'

const ABRE = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })

function almacen(c: ClienteFixture, zona = 'UTC') {
  return new AlmacenMemoria({
    contextos: { [c.clientId]: { ...contextoDe(c), zonaHoraria: zona } },
    planes: { [c.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
    journeys: [{ journeyId: 'journey-1', clientId: c.clientId }],
  })
}
/** abre la campaña el 09-oct y guarda la tanda 1 con el reloj en `ahora` */
async function tandaUno(c: ClienteFixture, ahora: string, zona = 'UTC') {
  const al = almacen(c, zona)
  const ab = await abrirCampana(al, { ...wf(), client_id: c.clientId, seco: true }, ABRE)
  const campana = ab.cuerpo.campana as { id: string; fecha_inicio: string }
  const pe = await estrategiaPreparar(al, { ...wf(), campana_id: campana.id }, ABRE)
  await estrategiaGuardar(al, { ...wf(), campana_id: campana.id, corrida_id: pe.cuerpo.corrida_id, resultado: ok(c.estrategia) }, ABRE)
  const p = await calendarioPreparar(al, { ...wf(), campana_id: campana.id, tanda: 1 }, ahora)
  const g = await calendarioGuardar(al, { ...wf(), campana_id: campana.id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(tandaBuena(c)) }, ahora)
  const filas = (await al.filas(campana.id, 1)).filter((f) => f.tanda === 1)
  return { al, campana, g, filas }
}
const formatos = formatosDeLaMigracion()

describe('la regla de fechas (sin base)', () => {
  const f = (fecha: string, red: string, formato: string) => ({ fecha, red, formato })
  const [red, lista] = Object.entries(formatos).find(([, l]) => l.some((x) => x.lead_dias > 0))!
  const formato = lista.find((x) => x.lead_dias > 0)!
  it('el primer día que alcanza (hoy + plazo del formato) se programa; el anterior, no, con la razón escrita', () => {
    const hoy = '2026-11-10'
    const primero = sumarDias(hoy, formato.lead_dias)
    expect(fueraDePlazoDeProduccion(f(primero, red, formato.formato), hoy, formatos)).toBeNull()
    const razon = fueraDePlazoDeProduccion(f(sumarDias(primero, -1), red, formato.formato), hoy, formatos)
    expect(razon).toContain(PREFIJO_FUERA_DE_PLAZO)
    expect(razon).toContain(primero)
    expect(razon).toContain(`${formato.lead_dias} días`)
    expect(fueraDePlazoDeProduccion(f('2026-11-09', red, formato.formato), hoy, formatos)).not.toBeNull() // ayer
  })
  it('el plazo es el DEL FORMATO (dato de la tabla); sin dato, 3 días', () => {
    const otros = Object.entries(formatos).flatMap(([r, l]) => l.map((x) => ({ red: r, ...x })))
    const leads = new Set(otros.map((x) => x.lead_dias))
    expect(leads.size).toBeGreaterThan(1) // la tabla trae plazos distintos: la regla no puede usar uno fijo
    for (const x of otros) expect(leadDeFormato(formatos, x)).toBe(x.lead_dias)
    expect(leadDeFormato(formatos, { red: 'red-que-no-existe', formato: 'x' })).toBe(3)
  })
})

describe('la tanda guardada no programa antes de hoy + el plazo (dos clientes)', () => {
  for (const [nombre, cli] of [['café con sede', clienteA()], ['clínica (otro rubro)', clienteB()]] as const) {
    it(`${nombre}: lo que no alcanza queda «perdio_su_fecha» con su razón; lo demás, igual que antes`, async () => {
      const antes = await tandaUno(cli, ABRE) // el reloj del día en que se abrió: lo de siempre
      const { campana } = antes
      const ahora = `${sumarDias(campana.fecha_inicio, 2)}T12:00:00Z` // la tanda se guarda 2 días después de empezar
      const { g, filas, al, campana: c2 } = await tandaUno(cli, ahora)
      expect(g.status).toBe(200)
      const hoy = ahora.slice(0, 10)
      const debenSalir = (f: Fila) => f.estado !== 'descartada_sin_fuente' && f.fecha < sumarDias(hoy, leadDeFormato(formatos, f))
      const salen = filas.filter(debenSalir)
      const quedan = filas.filter((f) => !debenSalir(f))
      expect(salen.length).toBeGreaterThan(0)
      expect(quedan.length).toBeGreaterThan(0)
      for (const f of salen) {
        expect(f.estado).toBe('perdio_su_fecha')
        expect(f.avisos.some((a) => a.startsWith(PREFIJO_FUERA_DE_PLAZO) && a.includes(f.fecha))).toBe(true)
      }
      for (const f of quedan) {
        expect(f.estado).not.toBe('perdio_su_fecha')
        expect(f.avisos.some((a) => a.startsWith(PREFIJO_FUERA_DE_PLAZO))).toBe(false)
      }
      expect(g.cuerpo.fuera_de_plazo).toBe(salen.length)
      // las que quedan conservan el estado que tenían con el reloj del día de apertura (el recorte no toca nada más)
      const estadoAntes = new Map(antes.filas.map((f) => [f.id, f.estado]))
      for (const f of quedan) expect(f.estado).toBe(estadoAntes.get(f.id))
      // ninguna fila recortada entra a un lote de producción
      const lotes = await filasLotes(al, { ...wf(), campana_id: c2.id, hoy }, ahora)
      const enLotes = new Set(((lotes.cuerpo.lotes ?? []) as Array<{ fila_ids: string[] }>).flatMap((l) => l.fila_ids))
      for (const f of salen) expect(enLotes.has(f.id)).toBe(false)
    })
  }

  it('«hoy» es el del cliente, no el de UTC: 03:00Z del día D es todavía el día D-1 en Guayaquil', async () => {
    const cli = clienteA()
    const { campana } = await tandaUno(cli, ABRE)
    const d = sumarDias(campana.fecha_inicio, 3)
    const ahora = `${d}T03:00:00Z`
    const enUtc = await tandaUno(cli, ahora, 'UTC')
    const enGye = await tandaUno(cli, ahora, 'America/Guayaquil')
    const fuera = (fs: Fila[]) => fs.filter((f) => f.estado === 'perdio_su_fecha').map((f) => f.id).sort()
    const hoyGye = sumarDias(d, -1)
    for (const f of enGye.filas) expect(f.estado === 'perdio_su_fecha').toBe(f.estado !== 'descartada_sin_fuente' && f.fecha < sumarDias(hoyGye, leadDeFormato(formatos, f)))
    // un día menos en Guayaquil ⇒ nunca recorta MÁS que en UTC, y en este patrón recorta menos
    expect(fuera(enGye.filas).every((id) => fuera(enUtc.filas).includes(id))).toBe(true)
    expect(fuera(enGye.filas).length).toBeLessThan(fuera(enUtc.filas).length)
  })
})
