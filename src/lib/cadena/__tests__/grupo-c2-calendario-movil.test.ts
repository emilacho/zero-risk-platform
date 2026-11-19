/**
 * 19-nov · grupo C · parte 2 · EL CALENDARIO MÓVIL (V04 · firma de Emilio · GO del plan C de Lenovo 04:29Z · D1 (a) y D2 (a) 06:54Z):
 *   · la fila que ya no alcanza su plazo se MUEVE a la próxima fecha libre de SU slot (el mismo día de la semana y la misma hora) en las semanas que siguen DE SU TANDA;
 *   · la candidata pasa por la verificación de la mesa de reubicación (plazo, día abierto, máximo por día, dependencias) y tiene que estar libre;
 *   · sin fecha libre sale `perdio_su_fecha` con su aviso y SU IDEA VUELVE AL BANCO (condición de Lenovo: «que nada se pierda»): la tarea de la tanda siguiente la ofrece primero.
 * Cliente sintético. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion, tandaBuena } from '../__fixtures__/clientes'
import { fechaDeFila, sumarDias } from '../fechas'
import { tareaDeCalendario } from '../indicaciones'
import { leadDeFormato, PREFIJO_FUERA_DE_PLAZO } from '../lotes'
import { ideasQueVolvieronAlBanco, MARCA_DE_REUBICADA, MARCA_IDEA_DE_VUELTA, moverAlSlotLibre, PREFIJO_CALENDARIO_MOVIL, PREFIJO_REUBICACION, yaReubicada, type ContextoDeReubicacion } from '../reubicacion'
import type { ConceptoLeido, IdeaDelBanco } from '../conceptos'
import type { Fila, FormatosPorRed } from '../tipos'

const INICIO = '2026-10-12' // un lunes
const FORMATOS: FormatosPorRed = { instagram: [{ formato: 'post', lead_dias: 2, max_por_dia: 2 } as never], tiktok: [{ formato: 'video', lead_dias: 2, max_por_dia: 1 } as never] }
const fila = (semana: number, dia: number, slot: string, extra: Partial<Fila> = {}): Fila => ({
  id: `s${semana}-d${dia}-${slot}`, tanda: 1, semana, dia_semana: dia, fecha: fechaDeFila(INICIO, semana, dia), hora: '10:00', red: 'instagram', formato: 'post', pilar: 'p',
  estado: 'propuesta', avisos: [], depende_de: [], requiere_abierto: false, sede: null, idea_ref: null, ...extra,
} as unknown as Fila)
const ctx = (filas: Fila[], hoy = '2026-10-14', sedes: ContextoDeReubicacion['sedes'] = []): ContextoDeReubicacion => ({ hoy, campana: { fecha_inicio: INICIO, fecha_fin: '2027-01-10' }, filas, formatos: FORMATOS, sedes })

describe('moverAlSlotLibre (puro)', () => {
  it('🔴 la fila vencida va a la próxima semana de su tanda con su slot LIBRE: mismo día, misma hora, mismo id; semana y fecha nuevas, con la marca de la mesa', () => {
    const v = fila(1, 1, 'a', { idea_ref: 'C1-I01' })
    const filas = [v, fila(1, 3, 'b'), fila(2, 3, 'b'), fila(3, 1, 'a')] // la semana 2 no tiene su «a»
    const [c] = moverAlSlotLibre([v], [1, 2, 3, 4], ctx(filas))
    expect(c).toMatchObject({ fila_id: 's1-d1-a', tipo: 'reubicar', semana: 2, dia_semana: 1, fecha: fechaDeFila(INICIO, 2, 1), hora: '10:00' })
    expect(c.aviso.startsWith(`${MARCA_DE_REUBICADA}${v.fecha} al ${fechaDeFila(INICIO, 2, 1)}`)).toBe(true)
    expect(c.aviso).toContain(PREFIJO_CALENDARIO_MOVIL)
    expect(c.aviso).not.toContain(MARCA_IDEA_DE_VUELTA) // se movió: su idea sigue en su fila
    expect(yaReubicada({ ...v, avisos: [c.aviso] })).toBe(true) // si vuelve a quedar atrás, la regla de siempre la descarta
  })
  it('el slot ocupado por su propia pieza se salta: va a la primera semana libre', () => {
    const v = fila(1, 1, 'a')
    const [c] = moverAlSlotLibre([v], [1, 2, 3, 4], ctx([v, fila(2, 1, 'a'), fila(3, 1, 'a')]))
    expect(c).toMatchObject({ tipo: 'reubicar', semana: 4 })
  })
  it('el máximo por día de su red y formato se respeta (otra pieza, otro slot, mismo día): se salta esa semana', () => {
    const v = fila(1, 1, 'a', { red: 'tiktok', formato: 'video' })
    const otro = fila(2, 1, 'z', { red: 'tiktok', formato: 'video' }) // ocupa el único lugar del lunes de la semana 2
    const [c] = moverAlSlotLibre([v], [1, 2, 3], ctx([v, otro]))
    expect(c).toMatchObject({ tipo: 'reubicar', semana: 3 })
  })
  it('una pieza que exige local abierto no va a un día que la sede cierra (el mismo día en todas las semanas): sale con el porqué', () => {
    const v = fila(1, 1, 'a', { requiere_abierto: true, sede: 'centro', idea_ref: 'C1-I02' } as Partial<Fila>)
    const sedes = [{ clave: 'centro', horario: { 1: [], 2: [{ abre: '08:00', cierra: '18:00' }] } } as never]
    const [c] = moverAlSlotLibre([v], [1, 2], ctx([v], '2026-10-14', sedes))
    expect(c.tipo).toBe('descartar')
    expect(c.aviso).toContain('cerrada')
  })
  it('una dependencia: la fila no se mueve a antes de la que la antecede', () => {
    const ant = fila(3, 1, 'b')
    const v = fila(1, 1, 'a', { depende_de: [ant.id] })
    const [c] = moverAlSlotLibre([v], [1, 2, 3, 4], ctx([v, ant]))
    expect(c).toMatchObject({ tipo: 'reubicar', semana: 3 })
  })
  it('🔴 D1 (a): solo las semanas de SU tanda; sin fecha libre ahí sale, con la razón y su idea de vuelta al banco', () => {
    const v = fila(1, 1, 'a', { idea_ref: 'C1-I03' })
    const [c] = moverAlSlotLibre([v], [1, 2], ctx([v, fila(2, 1, 'a')])) // la semana 3 estaría libre, pero es de otra tanda
    expect(c.tipo).toBe('descartar')
    expect(c.aviso.startsWith(`${PREFIJO_REUBICACION}perdió su fecha (${v.fecha})`)).toBe(true)
    expect(c.aviso).toContain(`${PREFIJO_CALENDARIO_MOVIL}no hay fecha libre en su slot dentro de la tanda`)
    expect(c.aviso).toContain('ya tiene su propia pieza en el slot a')
    expect(c.aviso.endsWith(`${MARCA_IDEA_DE_VUELTA}«C1-I03»`)).toBe(true)
  })
  it('sin idea, sale sin la marca del banco; en la última semana de la tanda no hay a dónde ir', () => {
    const v = fila(2, 1, 'a')
    const [c] = moverAlSlotLibre([v], [1, 2], ctx([v], '2026-10-21'))
    expect(c.tipo).toBe('descartar')
    expect(c.aviso).toContain('no quedan semanas después de la suya en esta tanda')
    expect(c.aviso).not.toContain(MARCA_IDEA_DE_VUELTA)
  })
  it('🔴 la que ya se había reubicado y volvió a quedar atrás se descarta sin moverla otra vez (la regla de siempre), y su idea vuelve al banco', () => {
    const v = fila(1, 1, 'a', { idea_ref: 'C1-I04', avisos: [`${MARCA_DE_REUBICADA}2026-10-05 al 2026-10-12 · x`] })
    const [c] = moverAlSlotLibre([v], [1, 2, 3], ctx([v]))
    expect(c.tipo).toBe('descartar')
    expect(c.aviso).toContain('ya se había reubicado una vez')
    expect(c.aviso).toContain(`${MARCA_IDEA_DE_VUELTA}«C1-I04»`)
  })
  it('dos vencidas del mismo slot no van a la misma fecha libre: la segunda toma la siguiente', () => {
    const a = fila(1, 1, 'a'), b = { ...fila(1, 1, 'a'), id: 'r1-d1-a' } as Fila // mismo día, misma hora, mismo slot «a»
    const r = moverAlSlotLibre([a, b], [1, 2, 3], ctx([a, b]))
    expect(r.map((c) => (c.tipo === 'reubicar' ? c.semana : c.tipo))).toEqual([2, 3])
  })
  it('la candidata respeta el plazo de producción contado desde hoy', () => {
    const v = fila(1, 1, 'a')
    const hoy = fechaDeFila(INICIO, 2, 1) // el lunes de la semana 2: con 2 días de plazo, ese lunes no alcanza
    const [c] = moverAlSlotLibre([v], [1, 2, 3], ctx([v], hoy))
    expect(c).toMatchObject({ tipo: 'reubicar', semana: 3 })
  })
})

describe('ideasQueVolvieronAlBanco (pura)', () => {
  const idea = (id: string) => ({ id, capitulo: 'C1' })
  const salio = (id: string, ref: string, marca = true) => ({ ...fila(1, 1, id), id, estado: 'perdio_su_fecha', idea_ref: ref, avisos: marca ? [`x · ${MARCA_IDEA_DE_VUELTA}«${ref}»`] : ['perdió su fecha'] } as unknown as Fila)
  it('🔴 vuelve la idea de una fila que salió por el calendario móvil y que nadie cita', () => {
    expect(ideasQueVolvieronAlBanco([salio('s1-d1-a', 'C1-I01')], [idea('C1-I01'), idea('C1-I02')]).map((i) => i.id)).toEqual(['C1-I01'])
  })
  it('no vuelve: si otra fila viva ya la realiza; si salió sin la marca; si ya no está en el banco (retirada)', () => {
    const viva = { ...fila(2, 1, 'a'), estado: 'validada', idea_ref: 'C1-I01' } as unknown as Fila
    expect(ideasQueVolvieronAlBanco([salio('s1-d1-a', 'C1-I01'), viva], [idea('C1-I01')])).toEqual([])
    expect(ideasQueVolvieronAlBanco([salio('s1-d1-a', 'C1-I01', false)], [idea('C1-I01')])).toEqual([])
    expect(ideasQueVolvieronAlBanco([salio('s1-d1-a', 'C1-I09')], [idea('C1-I01')])).toEqual([])
  })
})

describe('🔴 la tarea de la tanda siguiente ofrece primero las ideas que volvieron (condición de Lenovo 06:54Z)', () => {
  const A = clienteA()
  const banco: IdeaDelBanco[] = [
    { id: 'C1-I01', capitulo: 'C1', red: 'instagram', formato: 'post', idea: 'la idea que volvió', mensaje: 'm1', gancho: 'g1', protagonista: 'p', serie: null, foto: null, linea: 'l' } as IdeaDelBanco,
    { id: 'C1-I02', capitulo: 'C1', red: 'instagram', formato: 'post', idea: 'otra idea', mensaje: 'm2', gancho: 'g2', protagonista: 'p', serie: null, foto: null, linea: 'l' } as IdeaDelBanco,
  ]
  const concepto = { leido: { gran_idea: { nombre: 'n', frase: 'f' }, por_que_funciona: '', como_se_ve: '', como_suena: '', capitulos: [], banco, ideas_descartadas: [], ideas_que_salen: [] } as unknown as ConceptoLeido, version: 1 }
  const base = { ctx: contextoDe(A), estrategia: A.estrategia, tanda: 2, semanas: [5, 6, 7, 8], concepto }
  it('con una fila salida por el calendario móvil, la sección aparece con su idea (y solo esa)', () => {
    const salida = { ...fila(1, 1, 'a'), estado: 'perdio_su_fecha', idea_ref: 'C1-I01', avisos: [`${PREFIJO_REUBICACION}perdió su fecha · ${MARCA_IDEA_DE_VUELTA}«C1-I01»`] } as unknown as Fila
    const t = tareaDeCalendario({ ...base, filasPrevias: [salida] })
    expect(t).toContain('# IDEAS QUE VOLVIERON AL BANCO')
    const seccion = t.slice(t.indexOf('# IDEAS QUE VOLVIERON AL BANCO'))
    expect(seccion).toContain('- C1-I01 · capítulo C1')
    expect(seccion.split('\n# ')[0]).not.toContain('C1-I02')
  })
  it('sin filas salidas, la tarea es la de siempre (sin la sección)', () => {
    const t = tareaDeCalendario({ ...base, filasPrevias: [] })
    expect(t).not.toContain('IDEAS QUE VOLVIERON')
  })
})

describe('por el camino real (calendarioGuardar → cerrarTanda)', () => {
  const A = clienteA()
  const ABRE = '2026-10-12T12:00:00Z'
  const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
  const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })
  const formatos = formatosDeLaMigracion()
  async function tanda(ahora: string, ajustar: (t: ReturnType<typeof tandaBuena>) => ReturnType<typeof tandaBuena> = (t) => t) {
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: { ...contextoDe(A), zonaHoraria: 'UTC' } },
      planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
      journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const ab = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
    const id = (ab.cuerpo.campana as { id: string }).id
    const pe = await estrategiaPreparar(al, { ...wf(), campana_id: id }, ABRE)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: pe.cuerpo.corrida_id, resultado: ok(A.estrategia) }, ABRE)
    const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, ahora)
    const g = await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(ajustar(tandaBuena(A))) }, ahora)
    return { al, id, g, filas: (await al.filas(id, 1)).filter((f) => f.tanda === 1) }
  }
  const ahora = `${sumarDias('2026-10-12', 2)}T12:00:00Z`
  const vencida = (f: Fila) => f.fecha < sumarDias(ahora.slice(0, 10), leadDeFormato(formatos, f))
  it('🔴 con el patrón semanal lleno no hay fecha libre: sale como siempre, con el aviso del calendario móvil', async () => {
    const { g, filas } = await tanda(ahora)
    expect(g.status).toBe(200)
    const salen = filas.filter((f) => f.estado === 'perdio_su_fecha')
    expect(salen.length).toBeGreaterThan(0)
    for (const f of salen) {
      expect(f.avisos.some((a) => a.startsWith(PREFIJO_FUERA_DE_PLAZO))).toBe(true)
      expect(f.avisos.some((a) => a.includes(`${PREFIJO_CALENDARIO_MOVIL}no hay fecha libre`))).toBe(true)
    }
  })
  it('🔴 con el slot libre en la semana 2 (omitido por el patrón), la fila vencida se MUEVE ahí: validada, con su fecha nueva, sin salir', async () => {
    const primera = await tanda(ahora)
    const v = primera.filas.find((f) => f.estado === 'perdio_su_fecha' && f.semana === 1)!
    const slot = v.id.slice(v.id.lastIndexOf('-') + 1)
    const sinSemana2 = (t: ReturnType<typeof tandaBuena>) => ({ ...t, piezas: t.piezas.filter((x) => !(x.semana === 2 && x.slot === slot)), ajustes_al_patron: [...(t.ajustes_al_patron ?? []), { semana: 2, slot, accion: 'omitir' as const, motivo: 'la semana 2 no lleva esta pieza' }] })
    const { g, filas } = await tanda(ahora, sinSemana2)
    expect(g.status).toBe(200)
    const movida = filas.find((f) => f.id === v.id)!
    expect(movida.estado).not.toBe('perdio_su_fecha')
    expect(movida.semana).toBe(2)
    expect(movida.fecha).toBe(fechaDeFila('2026-10-12', 2, v.dia_semana)) // V04: la fecha es la que deriva el código de semana + día
    expect(movida.dia_semana).toBe(v.dia_semana)
    expect(movida.hora).toBe(v.hora)
    expect(vencida(movida)).toBe(false)
    expect(movida.avisos.some((a) => a.startsWith(`${MARCA_DE_REUBICADA}${v.fecha} al ${movida.fecha}`) && a.includes(PREFIJO_CALENDARIO_MOVIL))).toBe(true)
  })
})
