/**
 * Relevo 41 · huecos de mutación que CC#3 listó como COMPORTAMIENTO real sin prueba (fechas, días hábiles, multi-sede, V10).
 * Todo con datos sintéticos; ninguna prueba nombra un cliente, una ciudad ni un rubro.
 */
import { describe, it, expect } from 'vitest'
import { esFechaIso, sumarDias, diaSemanaIso, diasEntre, lunesDe, fechaDeFila, diaDeCampana, semanaIso, fechaInicioPorRegla } from '../fechas'
import { expandirPatron, fusionarTanda, idDeFila } from '../expandir-patron'
import { validarTodo, type Hallazgo, type InsumosCalendario } from '../index'
import { clienteA, filasDe, formatosDeLaMigracion, tandaBuena } from '../__fixtures__/clientes'
import type { Estrategia, FormatosPorRed, TandaAgente } from '../tipos'

describe('fechas · una fecha imposible NO es una fecha', () => {
  it('rechaza lo que el formato deja pasar pero el calendario no', () => {
    for (const x of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2027-02-29', '2026-10-32', '2026-1-05', '26-10-05', '2026-10-05T00:00', '', null, undefined, 20261005]) expect(esFechaIso(x)).toBe(false)
  })
  it('acepta las reales, incluido el 29 de febrero bisiesto', () => {
    for (const x of ['2026-10-05', '2028-02-29', '2026-12-31', '2026-01-01']) expect(esFechaIso(x)).toBe(true)
  })
  it('las funciones de fecha se niegan a calcular con una imposible (nunca un día «corrido» en silencio)', () => {
    expect(() => sumarDias('2026-02-30', 1)).toThrow()
    expect(() => diaSemanaIso('2026-13-01')).toThrow()
    expect(() => diasEntre('2026-10-01', '2026-02-30')).toThrow()
  })
})

describe('fechas · matemática de calendario', () => {
  it('suma de días cruza mes y año; resta con negativos', () => {
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(sumarDias('2028-03-01', -1)).toBe('2028-02-29')
  })
  it('día de la semana ISO: lunes 1 … domingo 7', () => {
    expect(diaSemanaIso('2026-10-05')).toBe(1) // lunes
    expect(diaSemanaIso('2026-10-10')).toBe(6)
    expect(diaSemanaIso('2026-10-11')).toBe(7)
  })
  it('diasEntre es con signo y exacto', () => {
    expect(diasEntre('2026-10-05', '2026-10-12')).toBe(7)
    expect(diasEntre('2026-10-12', '2026-10-05')).toBe(-7)
    expect(diasEntre('2026-10-05', '2026-10-05')).toBe(0)
  })
  it('lunesDe devuelve el lunes de esa semana (un domingo pertenece a la semana que termina)', () => {
    expect(lunesDe('2026-10-05')).toBe('2026-10-05')
    expect(lunesDe('2026-10-11')).toBe('2026-10-05')
    expect(lunesDe('2026-10-08')).toBe('2026-10-05')
  })
  it('fechaDeFila: lunes de la semana de inicio + (semana-1)·7 + (día-1); el inicio a mitad de semana no corre la grilla', () => {
    expect(fechaDeFila('2026-10-07', 1, 1)).toBe('2026-10-05') // miércoles de inicio: la semana 1 arranca su lunes
    expect(fechaDeFila('2026-10-07', 1, 3)).toBe('2026-10-07')
    expect(fechaDeFila('2026-10-05', 2, 1)).toBe('2026-10-12')
    expect(fechaDeFila('2026-10-05', 3, 7)).toBe('2026-10-25')
  })
  it('día N de campaña: el de inicio es el 1', () => {
    expect(diaDeCampana('2026-10-05', '2026-10-05')).toBe(1)
    expect(diaDeCampana('2026-10-05', '2026-10-12')).toBe(8)
    expect(diaDeCampana('2026-10-05', '2027-01-02')).toBe(90)
  })
  it('semana ISO en los bordes de año', () => {
    expect(semanaIso('2026-10-05')).toBe('2026-W41')
    expect(semanaIso('2027-01-03')).toBe('2026-W53')
    expect(semanaIso('2026-12-31')).toBe('2026-W53')
    expect(semanaIso('2024-12-30')).toBe('2025-W01')
  })
})

describe('fecha de inicio por regla · primer lunes ≥ plan + 3 días hábiles', () => {
  it('sin feriados verificados: días corridos, con aviso', () => {
    const r = fechaInicioPorRegla('2026-10-05') // lunes: +3 corridos = jueves 8 → lunes 12
    expect(r).toEqual({ fecha: '2026-10-12', base: 'corridos', aviso: 'fecha de inicio calculada sin descontar feriados' })
  })
  it('con feriados verificados: cuenta solo días hábiles (sábado y domingo no cuentan) y no lleva aviso', () => {
    const r = fechaInicioPorRegla('2026-10-08', new Set<string>()) // jueves: vie 9 (1) · lun 12 (2) · mar 13 (3) → primer lunes ≥ 13 = 19
    expect(r).toEqual({ fecha: '2026-10-19', base: 'habiles_nacionales', aviso: null })
  })
  it('un feriado entre medio no cuenta como hábil', () => {
    const sin = fechaInicioPorRegla('2026-10-05', new Set<string>())
    const con = fechaInicioPorRegla('2026-10-05', new Set(['2026-10-06', '2026-10-07', '2026-10-08'])) // los tres hábiles siguientes son feriado
    expect(sin.fecha).toBe('2026-10-12')
    expect(con.fecha).toBe('2026-10-19')
  })
  it('un lunes feriado verificado pasa al siguiente día hábil', () => {
    const r = fechaInicioPorRegla('2026-10-05', new Set(['2026-10-12']))
    expect(r.fecha).toBe('2026-10-13')
  })
  it('siempre cae en un día hábil y nunca antes de plan + 3', () => {
    for (let k = 0; k < 40; k++) {
      const plan = sumarDias('2026-10-01', k)
      const r = fechaInicioPorRegla(plan)
      expect(diasEntre(plan, r.fecha)).toBeGreaterThanOrEqual(3)
      expect(diaSemanaIso(r.fecha)).toBe(1)
    }
  })
})

const FORMATOS: FormatosPorRed = formatosDeLaMigracion()
const slot = (o: Partial<Estrategia['patron_semanal'][number]>) => ({ slot: 'a', dia_semana: 1, hora: '10:00', red: 'instagram', formato: 'foto', pilar: 'p1', requiere_abierto: false, sede: '', ...o })

describe('expandir el patrón · varias sedes', () => {
  const e = { patron_semanal: [slot({ slot: 'a', sede: 'norte' }), slot({ slot: 'b', sede: 'sur' }), slot({ slot: 'c', sede: '' })], piezas_fijas: [] }
  const camp = { fecha_inicio: '2026-10-05', fecha_fin: '2026-12-27' }
  it('dos slots del mismo día y red con sedes distintas son filas distintas y cada una conserva SU sede', () => {
    const filas = expandirPatron(e, camp, [1], 1, FORMATOS)
    expect(filas.map((f) => [f.id, f.sede])).toEqual([[idDeFila(1, 1, 'a'), 'norte'], [idDeFila(1, 1, 'b'), 'sur'], [idDeFila(1, 1, 'c'), null]])
  })
  it('requiere_abierto, hora, red y pilar del slot pasan tal cual', () => {
    const filas = expandirPatron({ patron_semanal: [slot({ slot: 'x', requiere_abierto: true, hora: '19:30', red: 'facebook', pilar: 'p9', sede: 'norte' })], piezas_fijas: [] }, camp, [2], 1, FORMATOS)
    expect(filas[0]).toMatchObject({ requiere_abierto: true, hora: '19:30', red: 'facebook', pilar: 'p9', sede: 'norte', semana: 2, fecha: '2026-10-12', origen: 'patron' })
  })
  it('una fila fuera de las fechas de la campaña no se materializa (ni antes ni después)', () => {
    const corta = { fecha_inicio: '2026-10-07', fecha_fin: '2026-10-14' }
    const filas = expandirPatron({ patron_semanal: [slot({ slot: 'l', dia_semana: 1 }), slot({ slot: 'm', dia_semana: 3 })], piezas_fijas: [] }, corta, [1, 2, 3], 1, FORMATOS)
    expect(filas.map((f) => f.fecha)).toEqual(['2026-10-07', '2026-10-12', '2026-10-14'])
  })
  it('una pieza fija se pega a su slot y semana (y solo a esos)', () => {
    const filas = expandirPatron({ patron_semanal: [slot({ slot: 'a' })], piezas_fijas: [{ clave: 'apertura', semana: 2, slot: 'a', tema: 'Gran apertura', refs: [] }] }, camp, [1, 2], 1, FORMATOS)
    expect(filas.map((f) => [f.semana, f.pieza_fija, f.tema])).toEqual([[1, null, null], [2, 'apertura', 'Gran apertura']])
  })
  it('un formato que espera brazo nace `espera_video`; uno normal, `esquema`', () => {
    const video = Object.entries(FORMATOS).flatMap(([red, fs]) => fs.filter((f) => f.produccion === 'espera_brazo').map((f) => ({ red, formato: f.formato })))[0]
    expect(video).toBeTruthy()
    const filas = expandirPatron({ patron_semanal: [slot({ slot: 'v', red: video.red, formato: video.formato }), slot({ slot: 'f' })], piezas_fijas: [] }, camp, [1], 1, FORMATOS)
    expect(filas.map((f) => f.estado)).toEqual(['espera_video', 'esquema'])
  })
  it('la fusión: la fecha la pone SIEMPRE el código, aunque la pieza traiga otra semana/día; la sede de la pieza gana si la trae', () => {
    const esquema = expandirPatron(e, camp, [1], 1, FORMATOS)
    const t: TandaAgente = { ajustes_al_patron: [], piezas: [{ semana: 1, dia_semana: 1, slot: 'a', hora: '', red: '', formato: '', pilar: '', tema: 'Tema A', sede: 'sur', requiere_abierto: false, depende_de: [], pieza_fija: '', datos: [], pendientes: [] }] }
    const { filas } = fusionarTanda(esquema, t, e, camp, 1, FORMATOS)
    const a = filas.find((f) => f.id === idDeFila(1, 1, 'a'))!
    expect(a).toMatchObject({ fecha: '2026-10-05', sede: 'sur', tema: 'Tema A', red: 'instagram', hora: '10:00' })
    expect(filas.find((f) => f.id === idDeFila(1, 1, 'b'))!.sede).toBe('sur')
  })
  it('un ajuste «omitir» quita ese slot de esa semana y lo anota', () => {
    const esquema = expandirPatron(e, camp, [1, 2], 1, FORMATOS)
    const { filas, ignoradas } = fusionarTanda(esquema, { piezas: [], ajustes_al_patron: [{ semana: 2, slot: 'b', accion: 'omitir', motivo: 'x' }] }, e, camp, 1, FORMATOS)
    expect(filas.some((f) => f.id === idDeFila(2, 1, 'b'))).toBe(false)
    expect(filas.some((f) => f.id === idDeFila(1, 1, 'b'))).toBe(true)
    expect(ignoradas).toContain(`omitido por ajuste: ${idDeFila(2, 1, 'b')}`)
  })
})

describe('V10 · totales declarados', () => {
  const c = clienteA(); const b = tandaBuena(c)
  const run = (totales: InsumosCalendario['totalesDeclarados']) => {
    const filas = filasDe(c, b, FORMATOS)
    const base: InsumosCalendario = { campana: c.campana, estrategia: c.estrategia, planTexto: c.planTexto, formatos: FORMATOS, sedes: c.sedes, referencias: c.referencias, clientId: c.clientId, ahora: c.ahora, filas, forbiddenWords: c.forbiddenWords, conocidos: c.conocidos, totalesDeclarados: totales }
    return { hs: validarTodo(base) as Hallazgo[], filas }
  }
  const v10 = (hs: Hallazgo[]) => hs.filter((h) => h.chequeo === 'V10')
  it('sin totales declarados no hay V10', () => expect(v10(run(undefined).hs)).toEqual([]))
  it('un total que coincide no avisa; uno que no coincide avisa (y no bloquea)', () => {
    const { filas } = run(undefined)
    const real = filas.filter((f) => f.estado !== 'cancelada' && f.estado !== 'descartada_sin_fuente' && f.estado !== 'esquema').length
    expect(v10(run({ total_filas: real }).hs)).toEqual([])
    const mal = v10(run({ total_filas: real + 1 }).hs)
    expect(mal).toHaveLength(1)
    expect(mal[0].severidad).toBe('aviso')
  })
  it('un total por pilar que no coincide también avisa; uno que coincide, no', () => {
    const { filas } = run(undefined)
    const pilar = filas.find((f) => f.pilar)!.pilar!
    const real = filas.filter((f) => f.pilar === pilar && f.estado !== 'cancelada' && f.estado !== 'descartada_sin_fuente' && f.estado !== 'esquema').length
    expect(v10(run({ por_pilar: { [pilar]: real } }).hs)).toEqual([])
    expect(v10(run({ por_pilar: { [pilar]: real + 5 } }).hs)).toHaveLength(1)
  })
})

describe('mutantes vivos de la 1.ª corrida del mutador (relevo 41)', () => {
  it('fecha de inicio: un viernes de plan cuenta lunes-martes-miércoles y salta al lunes siguiente (ni un día más)', () => {
    expect(fechaInicioPorRegla('2026-10-09').fecha).toBe('2026-10-12') // corridos: +3 = lunes 12
    expect(fechaInicioPorRegla('2026-10-09', new Set<string>()).fecha).toBe('2026-10-19') // hábiles: 12, 13, 14 → primer lunes ≥ 14
  })
  it('un lunes feriado cuyos días hábiles siguientes también lo son: el viernes sigue siendo hábil (no se lo salta)', () => {
    expect(fechaInicioPorRegla('2026-10-05', new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'])).fecha).toBe('2026-10-16')
  })
  it('esFechaIso no se deja engañar por un objeto que se imprime como fecha', () => {
    expect(esFechaIso({ toString: () => '2026-10-05' })).toBe(false)
  })
  it('semana ISO en varias fechas del año', () => {
    expect(semanaIso('2026-01-01')).toBe('2026-W01')
    expect(semanaIso('2026-03-15')).toBe('2026-W11')
    expect(semanaIso('2026-06-30')).toBe('2026-W27')
  })
  it('minutos: horas válidas y bordes', async () => {
    const { minutos } = await import('../fechas')
    expect(minutos('23:30')).toBe(23 * 60 + 30)
    expect(minutos('00:00')).toBe(0)
    expect(minutos('23:59')).toBe(1439)
    expect(minutos('24:00')).toBeNull()
    expect(minutos('10:60')).toBeNull()
    expect(minutos('9:05')).toBe(545)
    expect(minutos('abc')).toBeNull()
    expect(minutos(930)).toBeNull()
  })
  it('un formato que no está en la tabla NO es de video (nace `esquema`)', () => {
    const filas = expandirPatron({ patron_semanal: [slot({ slot: 'z', red: 'red-que-no-existe', formato: 'formato-que-no-existe' })], piezas_fijas: [] }, { fecha_inicio: '2026-10-05', fecha_fin: '2026-12-27' }, [1], 1, FORMATOS)
    expect(filas[0].estado).toBe('esquema')
  })
  it('la pieza fija de OTRO slot de la misma semana no se pega a una pieza del agente', () => {
    const camp = { fecha_inicio: '2026-10-05', fecha_fin: '2026-12-27' }
    const e = { patron_semanal: [slot({ slot: 'a' })], piezas_fijas: [{ clave: 'otra', semana: 1, slot: 'b', tema: 'x', refs: [] }, { clave: 'otra-semana', semana: 2, slot: 'a', tema: 'y', refs: [] }] }
    const t: TandaAgente = { ajustes_al_patron: [], piezas: [{ semana: 1, dia_semana: 4, slot: 'a', hora: '10:00', red: 'instagram', formato: 'foto', pilar: 'p1', tema: 'T', sede: '', requiere_abierto: false, depende_de: [], pieza_fija: '', datos: [], pendientes: [] }] }
    const { filas } = fusionarTanda([], t, e, camp, 1, FORMATOS)
    expect(filas[0].pieza_fija).toBeNull()
  })
})
