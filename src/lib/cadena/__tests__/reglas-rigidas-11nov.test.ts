/**
 * 11-nov · GO de Lenovo (03:55Z) · REGLAS RÍGIDAS DEL BARRIDO DE CC7 · puntos de CC2: #4 #5 #6 #7 #8 #9 #23.
 * Regla: «juzgar = agente; verificar exacto = código». Lo que antes adivinaba una lista de palabras o una regex ahora lo DECLARA el agente (un dato, un campo)
 * y el código solo verifica exacto. Ninguna verificación nueva.
 * Cada criterio corre con DOS clientes de práctica de rubros distintos (A · cafetería · B · clínica veterinaria), sin parámetros por cliente. US$ 0: sin modelo, sin red, sin base.
 */
import { describe, expect, it } from 'vitest'
import { lexicoDeLaIndustria } from '../lexico-por-rubro'
import { validarTodo, type Hallazgo, type InsumosCalendario, type PiezaAgente, type TandaAgente } from '../index'
import { clienteA, clienteB, filasDe, formatosDeLaMigracion, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'
import { cantidadExigida, toleranciaDe, TOLERANCIA_POR_OMISION } from '../validador-calendario'
import { problemasDeEsquema } from '../validador-estrategia'
import { nombraElMes, temporadaRespaldada } from '../fechas-del-cliente'
import { citaRespaldaLaFecha } from '../datos'
import { normalizar } from '../texto'
import type { DatoDeterminado, Estrategia, Referencia } from '../tipos'

const FORMATOS = formatosDeLaMigracion()
const LEXICO = lexicoDeLaIndustria('restaurante de comida')
const CASOS: Array<[string, () => ClienteFixture]> = [['A · cafetería', clienteA], ['B · clínica veterinaria', clienteB]]

function insumos(c: ClienteFixture, t: TandaAgente, extra: Partial<InsumosCalendario> = {}): InsumosCalendario {
  return {
    campana: c.campana, estrategia: c.estrategia, planTexto: c.planTexto, formatos: FORMATOS, sedes: c.sedes, referencias: c.referencias,
    clientId: c.clientId, ahora: c.ahora, filas: filasDe(c, t, FORMATOS), forbiddenWords: c.forbiddenWords, conocidos: c.conocidos, registro: 'tu', lexico: LEXICO, ...extra,
  }
}
const conPieza = (t: TandaAgente, semana: number, slot: string, cambios: Partial<PiezaAgente>): TandaAgente => ({ ...t, piezas: t.piezas.map((p) => (p.semana === semana && p.slot === slot ? { ...p, ...cambios } : p)) })
const de = (hs: Hallazgo[], chequeo: string, sev?: 'bloquea' | 'aviso') => hs.filter((h) => h.chequeo === chequeo && (!sev || h.severidad === sev))
const dato = (d: string, ref: string, valor = 'x'): DatoDeterminado => ({ dato: d, valor, clase: 'alto', ref, nivel: 'F0', opcional: false })

describe.each(CASOS)('%s', (_n, cliente) => {
  const c = cliente()
  const bueno = tandaBuena(c)
  const val = (t: TandaAgente, extra: Partial<InsumosCalendario> = {}) => validarTodo(insumos(c, t, extra))

  describe('#5 · V07: la fecha especial la DECLARA el agente; el código verifica su fuente', () => {
    const fe = [{ id: 'f1', fecha: c.campana.fecha_inicio, nombre: 'Fiesta de práctica', tipo: 'feriados', ambito: 'nacional', alcance: 'nacional' as const, estado: 'verificada' as const }]
    it('🔴 un tema con palabras de fecha («puente», «vacaciones de verano», «temporada alta») SIN declarar ninguna fecha no saca la fila', () => {
      for (const tema of ['Avance de obra: terminamos el puente peatonal', 'Consejos para las vacaciones de verano', 'Preparados para la temporada alta']) {
        expect(de(val(conPieza(bueno, 1, c.anclas.lunes, { tema })), 'V07', 'bloquea')).toEqual([])
      }
    })
    it('🔴 una fecha declarada que NO está verificada bloquea; la misma, verificada, no', () => {
      const t = conPieza(bueno, 1, c.anclas.lunes, { tema: 'Celebramos la fiesta', datos: [dato('fecha_especial', 'fecha:f1')] })
      expect(de(val(t, { fechasEspeciales: [] }), 'V07', 'bloquea')).toHaveLength(1)
      expect(de(val(t, { fechasEspeciales: [{ ...fe[0]!, estado: 'pendiente' as never }] }), 'V07', 'bloquea')).toHaveLength(1)
      expect(de(val(t, { fechasEspeciales: fe }), 'V07', 'bloquea')).toEqual([])
    })
    it('🔴 una fecha declarada con una ref vacía o de otra forma bloquea (no se adivina cuál era)', () => {
      const t = conPieza(bueno, 1, c.anclas.lunes, { tema: 'Celebramos la fiesta', datos: [dato('fecha_especial', '')] })
      expect(de(val(t, { fechasEspeciales: fe }), 'V07', 'bloquea')).toHaveLength(1)
    })
  })

  describe('#6 · V16: la reseña la DECLARA el agente; el código verifica su ficha', () => {
    const ficha: Referencia = { id: 'ficha-resena', client_id: c.clientId, origen: 'ficha', firmada: true, vigente: true, texto: 'reseña firmada por el dueño' }
    const refs = [...c.referencias, ficha]
    it('🔴 un eslogan entre comillas o la palabra «opinión» sin declarar reseña no bloquea', () => {
      for (const tema of ['Nuestro lema: "cuidamos cada detalle desde el primer día"', 'Tu opinión de nuestro servicio nos importa']) {
        expect(de(val(conPieza(bueno, 1, c.anclas.lunes, { tema })), 'V16', 'bloquea')).toEqual([])
      }
    })
    it('🔴 una reseña declarada con ficha firmada pasa; sin ficha, o con UNA de dos sin ficha, bloquea', () => {
      const conFicha = conPieza(bueno, 1, c.anclas.lunes, { tema: 'Lo que dicen de nosotros', datos: [dato('resena', 'ficha-resena')] })
      expect(de(val(conFicha, { referencias: refs }), 'V16', 'bloquea')).toEqual([])
      expect(de(val(conFicha), 'V16', 'bloquea')).toHaveLength(1) // sin la ficha en las referencias
      const una = conPieza(bueno, 1, c.anclas.lunes, { tema: 'Lo que dicen de nosotros', datos: [dato('resena', 'ficha-resena'), dato('resena', 'inventada')] })
      expect(de(val(una, { referencias: refs }), 'V16', 'bloquea')).toHaveLength(1)
    })
  })

  describe('#23 · V15: otro registro es AVISO (el que juzga y bloquea es el revisor de registro)', () => {
    it('🔴 un tema en voseo con el cliente en tuteo: V15 avisa, no bloquea', () => {
      const hs = val(conPieza(bueno, 1, c.anclas.lunes, { tema: 'Vení y contanos qué pensás' }))
      expect(de(hs, 'V15', 'bloquea')).toEqual([])
      expect(de(hs, 'V15', 'aviso').some((h) => /otro registro/.test(h.ficha.que))).toBe(true)
    })
  })

  describe('#8 · V08: la tolerancia de frecuencia es un DATO de la estrategia', () => {
    const sinUna: TandaAgente = { ...bueno, piezas: bueno.piezas.filter((p) => !(p.semana === 2 && p.slot === c.anclas.lunes)) }
    const conTol = (feed: number): Estrategia => ({ ...c.estrategia, tolerancia_frecuencia: { feed, historias: 1, anuncios: 1 } })
    it('🔴 sin dato: la de siempre (feed exacto ⇒ una de menos bloquea)', () => {
      expect(de(val(sinUna), 'V08', 'bloquea').length).toBeGreaterThan(0)
    })
    it('🔴 la estrategia da holgura 1 en feed ⇒ una de menos avisa; con 0 bloquea igual que siempre', () => {
      const hs1 = val(sinUna, { estrategia: conTol(1) })
      expect(de(hs1, 'V08', 'bloquea')).toEqual([])
      expect(de(hs1, 'V08', 'aviso').length).toBeGreaterThan(0)
      expect(de(val(sinUna, { estrategia: conTol(0) }), 'V08', 'bloquea').length).toBeGreaterThan(0)
    })
    it('🔴 historias con tolerancia 0 en la estrategia: una de menos BLOQUEA (antes, historias nunca bloqueaba con 1 de diferencia)', () => {
      const conHistorias: Estrategia = {
        ...c.estrategia,
        canales: c.estrategia.canales.map((x, i) => (i === 0 ? { ...x, frecuencia: { ...x.frecuencia, historias_semana: 1 } } : x)),
        tolerancia_frecuencia: { feed: 0, historias: 0, anuncios: 1 },
      }
      const hs = val(bueno, { estrategia: conHistorias })
      expect(de(hs, 'V08', 'bloquea').some((h) => /historias/.test(h.ficha.que))).toBe(true)
      expect(de(val(bueno, { estrategia: { ...conHistorias, tolerancia_frecuencia: { feed: 0, historias: 1, anuncios: 1 } } }), 'V08', 'bloquea').some((h) => /historias/.test(h.ficha.que))).toBe(false)
    })
    it('toleranciaDe: la de la estrategia si es entero ≥ 0; si no, la de siempre', () => {
      expect(toleranciaDe(conTol(2), 'feed')).toBe(2)
      expect(toleranciaDe(c.estrategia, 'feed')).toBe(TOLERANCIA_POR_OMISION.feed)
      expect(toleranciaDe({ tolerancia_frecuencia: { feed: -1, historias: 1.5, anuncios: 3 } }, 'feed')).toBe(0)
      expect(toleranciaDe({ tolerancia_frecuencia: { feed: -1, historias: 1.5, anuncios: 3 } }, 'historias')).toBe(1)
      expect(toleranciaDe({ tolerancia_frecuencia: { feed: -1, historias: 1.5, anuncios: 3 } }, 'anuncios')).toBe(3)
    })
  })

  describe('#9 · V11 en el calendario: el campo `cantidad` decide cuántas pide la dependencia', () => {
    const conDep = (cantidad?: number): Estrategia => ({ ...c.estrategia, dependencias: [{ antes: 'foto', despues: 'carrusel', regla: 'veinte fotos antes del primer carrusel', cita_plan: '', ...(cantidad ? { cantidad } : {}) }] })
    const pide = (hs: Hallazgo[]) => de(hs, 'V11', 'bloquea').map((h) => /la regla pide (\d+)/.exec(h.ficha.que)?.[1]).filter(Boolean)
    it('🔴 con cantidad 20 bloquea y dice 20; sin el campo, «veinte» en palabras se lee 1 como antes', () => {
      expect(pide(val(bueno, { estrategia: conDep(20) }))).toEqual(['20'])
      for (const n of pide(val(bueno, { estrategia: conDep() }))) expect(n).toBe('1')
    })
  })

  describe('#8 y #9 · el esquema de la estrategia: los campos nuevos son opcionales y, si vienen, números válidos', () => {
    it('🔴 una estrategia guardada antes (sin los campos) sigue siendo válida; con valores malos, no', () => {
      expect(problemasDeEsquema(c.estrategia)).toEqual([])
      const conDep = { ...c.estrategia, dependencias: [{ antes: 'a', despues: 'b', regla: 'r', cita_plan: '' }] }
      expect(problemasDeEsquema({ ...conDep, dependencias: [{ ...conDep.dependencias[0], cantidad: 3 }], tolerancia_frecuencia: { feed: 0, historias: 1, anuncios: 2 } })).toEqual([])
      expect(problemasDeEsquema({ ...conDep, dependencias: [{ ...conDep.dependencias[0], cantidad: 0 }] }).join()).toMatch(/cantidad/)
      expect(problemasDeEsquema({ ...conDep, dependencias: [{ ...conDep.dependencias[0], cantidad: 2.5 }] }).join()).toMatch(/cantidad/)
      expect(problemasDeEsquema({ ...c.estrategia, tolerancia_frecuencia: { feed: -1, historias: 1, anuncios: 1 } }).join()).toMatch(/tolerancia_frecuencia\.feed/)
      expect(problemasDeEsquema({ ...c.estrategia, tolerancia_frecuencia: { feed: 0, historias: 1 } }).join()).toMatch(/tolerancia_frecuencia\.anuncios/)
    })
  })
})

describe('#9 · V11: cuántas piezas pide una dependencia es un CAMPO (no se lee de las palabras)', () => {
  it('🔴 «tres posts antes del anuncio» con cantidad 3 exige 3 (la regex leía 1); sin el campo, la estrategia vieja se lee como antes', () => {
    expect(cantidadExigida({ regla: 'tres posts antes del primer anuncio', cantidad: 3 })).toBe(3)
    expect(cantidadExigida({ regla: 'tres posts antes del primer anuncio' })).toBe(1)
    expect(cantidadExigida({ regla: '9 posts antes del primer anuncio' })).toBe(9)
    expect(cantidadExigida({ regla: '9 posts antes del primer anuncio', cantidad: 2 })).toBe(2) // el campo manda
    expect(cantidadExigida({ regla: 'cinco consultas antes del taller', cantidad: 0 })).toBe(1) // un campo inválido no se usa
  })
})

describe('#7 · el mes se reconoce en el idioma de la cita (no solo en español)', () => {
  it('🔴 inglés, francés, portugués, alemán y la forma con día («grudnia»): nombran su mes; palabra entera («mayor» no es «mayo»)', () => {
    expect(nombraElMes(normalizar('Christmas Day, December 25'), 12)).toBe(true)
    expect(nombraElMes(normalizar('le 14 juillet'), 7)).toBe(true)
    expect(nombraElMes(normalizar('7 de setembro'), 9)).toBe(true)
    expect(nombraElMes(normalizar('3. Oktober'), 10)).toBe(true)
    expect(nombraElMes(normalizar('25 grudnia'), 12)).toBe(true)
    expect(nombraElMes(normalizar('el 25 de diciembre'), 12)).toBe(true)
    expect(nombraElMes(normalizar('la venta mayorista'), 5)).toBe(false)
    // un nombre que es mes distinto según el idioma («listopad»: noviembre en checo, octubre en croata) no respalda ninguno
    expect(nombraElMes(normalizar('15 listopad'), 11)).toBe(false)
    expect(nombraElMes(normalizar('15 listopad'), 10)).toBe(false)
    expect(nombraElMes(normalizar('Christmas Day, December 25'), 11)).toBe(false)
  })
  it('🔴 una página oficial en inglés respalda su fecha (antes solo el español); sin el día, no', () => {
    const pagina = 'Public holidays: Christmas Day, December 25, is a national holiday.'
    expect(citaRespaldaLaFecha({ fecha: '2026-12-25', nombre: 'Christmas', alcance: 'nacional', fuente_url: 'https://x.test', cita_literal: 'Christmas Day, December 25' }, pagina)).toBe(true)
    expect(citaRespaldaLaFecha({ fecha: '2026-12-24', nombre: 'Christmas', alcance: 'nacional', fuente_url: 'https://x.test', cita_literal: 'Christmas Day, December 25' }, pagina)).toBe(false)
    // el día coincide pero el mes no: no respalda
    expect(citaRespaldaLaFecha({ fecha: '2026-11-25', nombre: 'Christmas', alcance: 'nacional', fuente_url: 'https://x.test', cita_literal: 'Christmas Day, December 25' }, pagina)).toBe(false)
  })
  it('🔴 la temporada de un plan escrito en inglés se respalda con sus meses; con otro mes, no', () => {
    const plan = 'Our high season runs from December to April every year.'
    expect(temporadaRespaldada({ desde: '2026-12-01', hasta: '2027-04-30', cita_plan: 'from December to April' }, plan).ok).toBe(true)
    expect(temporadaRespaldada({ desde: '2026-11-01', hasta: '2027-04-30', cita_plan: 'from December to April' }, plan).ok).toBe(false)
  })
})

describe('#8 y #9 · la estrategia se pide con el contrato `estrategia.v3` y su esquema trae los dos campos', () => {
  it('🔴 el pedido al agente nombra estrategia.v3 y el esquema que manda pide `cantidad` y `tolerancia_frecuencia`', async () => {
    const { AlmacenMemoria } = await import('../__fixtures__/almacen-memoria')
    const { contextoDe } = await import('../__fixtures__/clientes')
    const { abrirCampana, estrategiaPreparar } = await import('../index')
    const { ESQUEMAS } = await import('../esquemas')
    for (const c of [clienteA(), clienteB()]) {
      const al = new AlmacenMemoria({ contextos: { [c.clientId]: contextoDe(c) }, planes: { [c.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: { flujos: ['wf-cadena'] } })
      const ab = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', client_id: c.clientId, seco: true }, '2026-10-09T12:00:00Z')
      const id = (ab.cuerpo.campana as { id: string }).id
      const p = await estrategiaPreparar(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: id }, '2026-10-09T12:00:00Z')
      expect(p.status).toBe(200)
      const cuerpo = JSON.stringify(p.cuerpo.run_sdk)
      expect(cuerpo).toContain('estrategia.v3')
      expect(cuerpo).toContain('tolerancia_frecuencia')
      expect(cuerpo).toContain('"cantidad"')
      expect(JSON.stringify(ESQUEMAS['estrategia.v3'])).toContain('tolerancia_frecuencia')
      expect(JSON.stringify(ESQUEMAS['estrategia.v2'])).not.toContain('tolerancia_frecuencia')
    }
  })
})
