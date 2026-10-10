/**
 * Validador de la cadena · batería permanente. Corre IGUAL con dos clientes distintos (sin parámetros por cliente).
 * Todo sin modelo, sin red, sin base: US$ 0.
 */
import { describe, it, expect } from 'vitest'
import {
  citaAparece, normalizar, fechaDeFila, fechaInicioPorRegla, semanaIso, minutos, sumarDias, diaSemanaIso,
  expandirPatron, fusionarTanda, validarEstrategia, validarTodo, hallarAfirmaciones, hallarVoseo,
  alcanza, resolverDato, sedesSospechosas, planDeCorreccion, resolverTrasCorreccion, claseDeFormato,
  type Fila, type Hallazgo, type InsumosCalendario, type PiezaAgente, type Referencia, type TandaAgente,
} from '../index'
import { clienteA, clienteB, filasDe, formatosDeLaMigracion, piezaBuena, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'

const FORMATOS = formatosDeLaMigracion()
const bloqueos = (hs: Hallazgo[]) => hs.filter((h) => h.severidad === 'bloquea')
const chequeos = (hs: Hallazgo[]) => new Set(bloqueos(hs).map((h) => h.chequeo))

function insumos(c: ClienteFixture, t: TandaAgente, extra: Partial<InsumosCalendario> = {}): InsumosCalendario {
  return {
    campana: c.campana, estrategia: c.estrategia, planTexto: c.planTexto, formatos: FORMATOS, sedes: c.sedes, referencias: c.referencias,
    clientId: c.clientId, ahora: c.ahora, filas: filasDe(c, t, FORMATOS), forbiddenWords: c.forbiddenWords, conocidos: c.conocidos, ...extra,
  }
}
const conPieza = (c: ClienteFixture, t: TandaAgente, semana: number, slot: string, cambios: Partial<PiezaAgente>): TandaAgente => ({
  ...t,
  piezas: t.piezas.map((p) => (p.semana === semana && p.slot === slot ? { ...p, ...cambios } : p)),
})

describe('texto y fechas · lo que el modelo no sabe hacer lo hace el código', () => {
  it('normaliza igual que la comprobación de citas', () => {
    expect(normalizar('  Revisión   de  RESULTADOS ')).toBe('revision de resultados')
    expect(citaAparece('Revisión de resultados los días 21, 42', 'revision de resultados LOS DIAS 21')).toBe(true)
    expect(citaAparece('abc', '')).toBe(false)
    expect(citaAparece('un texto cualquiera', 'otra cosa distinta')).toBe(false)
  })
  it('la fecha de una pieza sale de semana + día, nunca del modelo', () => {
    expect(fechaDeFila('2026-10-12', 1, 1)).toBe('2026-10-12')
    expect(fechaDeFila('2026-10-12', 1, 7)).toBe('2026-10-18')
    expect(fechaDeFila('2026-10-12', 4, 4)).toBe('2026-11-05')
    expect(diaSemanaIso('2026-10-12')).toBe(1)
    expect(semanaIso('2026-10-12')).toBe('2026-W42')
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(minutos('07:30')).toBe(450)
    expect(minutos('25:00')).toBeNull()
  })
  it('fecha de inicio: primer lunes ≥ plan + 3 días; hábiles solo si hay feriados nacionales; si no, corridos con aviso', () => {
    const sin = fechaInicioPorRegla('2026-10-08') // jueves
    expect(sin).toEqual({ fecha: '2026-10-12', base: 'corridos', aviso: 'fecha de inicio calculada sin descontar feriados' })
    const con = fechaInicioPorRegla('2026-10-08', new Set<string>())
    expect(con.base).toBe('habiles_nacionales')
    expect(con.aviso).toBeNull()
    expect(diaSemanaIso(con.fecha)).toBe(1)
    // un lunes feriado verificado → el siguiente día hábil
    expect(fechaInicioPorRegla('2026-10-05', new Set(['2026-10-12'])).fecha).toBe('2026-10-13')
  })
})

describe('expandir el patrón y fusionar la tanda', () => {
  const c = clienteA()
  it('4 semanas × 4 slots = 16 filas, todas con la fecha puesta por el código', () => {
    const f = expandirPatron(c.estrategia, c.campana, [1, 2, 3, 4], 1, FORMATOS)
    expect(f).toHaveLength(16)
    expect(f.every((x) => x.estado === 'esquema' && x.origen === 'patron')).toBe(true)
    expect(f.find((x) => x.id === 's1-d1-a')!.fecha).toBe('2026-10-12')
    expect(f.find((x) => x.id === 's2-d4-b')!.fecha).toBe('2026-10-22')
  })
  it('lo que el agente escribe rellena el slot; la fecha no se toca; un ajuste omitir quita el slot', () => {
    const t = tandaBuena(c)
    t.ajustes_al_patron = [{ semana: 2, slot: 'c', accion: 'omitir', motivo: 'feriado de la sede' }]
    t.piezas = t.piezas.filter((p) => !(p.semana === 2 && p.slot === 'c'))
    const esq = expandirPatron(c.estrategia, c.campana, [1, 2, 3, 4], 1, FORMATOS)
    const r = fusionarTanda(esq, t, c.estrategia, c.campana, 1, FORMATOS)
    expect(r.filas).toHaveLength(15)
    expect(r.ignoradas.join()).toContain('s2-d6-c')
    expect(r.filas.every((x) => x.estado === 'propuesta')).toBe(true)
  })
  it('los formatos de video nacen espera_video por la tabla, no por el agente', () => {
    const e = { ...c.estrategia, patron_semanal: [...c.estrategia.patron_semanal, { slot: 'r', dia_semana: 3, hora: '18:00', red: 'instagram', formato: 'reel', pilar: 'menu', requiere_abierto: false, sede: 'centro' }] }
    const f = expandirPatron(e, c.campana, [1], 1, FORMATOS)
    expect(f.find((x) => x.formato === 'reel')!.estado).toBe('espera_video')
  })
  it('una fila antes del inicio o después del fin no se materializa', () => {
    const e = { ...c.estrategia, patron_semanal: [{ ...c.estrategia.patron_semanal[0] }] }
    expect(expandirPatron(e, { fecha_inicio: '2026-10-14', fecha_fin: '2026-10-20' }, [1], 1, FORMATOS)).toHaveLength(0) // el lunes cae antes del inicio
  })
})

describe('validador de la estrategia', () => {
  for (const [n, mk] of [['A', clienteA], ['B', clienteB]] as const) {
    it(`cliente ${n}: la estrategia buena no tiene bloqueos`, () => {
      const c = mk()
      expect(bloqueos(validarEstrategia(c.estrategia, { planTexto: c.planTexto, formatos: FORMATOS }))).toEqual([])
    })
  }
  const c = clienteA()
  const v = (e: unknown) => validarEstrategia(e, { planTexto: c.planTexto, formatos: FORMATOS })
  it('S01: pilares que no suman 100, fase fuera de la campaña, forma rota', () => {
    expect(chequeos(v({ ...c.estrategia, pilares: [{ clave: 'x', nombre: 'x', pct: 90 }] }))).toContain('S01')
    expect(chequeos(v({ ...c.estrategia, fases: [{ clave: 'f', dia_desde: 1, dia_hasta: 120, objetivo: 'x', cita_plan: 'Plan de 90 días' }] }))).toContain('S01')
    expect(chequeos(v({ canales: [] }))).toContain('S01')
    expect(chequeos(v(null))).toContain('S01')
  })
  it('S01: ni el dueño ni nadie del cliente es un origen o un destino válido', () => {
    expect(chequeos(v({ ...c.estrategia, fechas_que_importan: [{ tipo: 'x', ambito: 'y', origen: 'dueno', motivo: 'lo dijo el dueño' }] }))).toContain('S01')
    expect(chequeos(v({ ...c.estrategia, pendientes: [{ clave: 'p', que_falta: 'x', desbloquea: ['a'], pedir_a: 'dueno' }] }))).toContain('S01')
  })
  it('S02: una cita del plan que no existe se bloquea (nada de «día 28» inventado)', () => {
    const e = { ...c.estrategia, hitos: [{ clave: 'rev-28', dia: 28, tipo: 'revision' as const, cita_plan: 'Ritual de revisión el día 28' }] }
    expect(chequeos(v(e))).toContain('S02')
  })
  it('S03: una red excluida usada como canal; S04: el día del hito sale de la cita; S06: par red-formato inexistente', () => {
    expect(chequeos(v({ ...c.estrategia, canales: [...c.estrategia.canales.filter((x) => x.red !== 'tiktok'), { red: 'tiktok', rol: 'principal', motivo: 'x', frecuencia: { feed_semana: 1, historias_semana: 0, anuncios_semana: 0 }, formatos: [] }] }))).toContain('S03')
    expect(chequeos(v({ ...c.estrategia, hitos: [{ clave: 'r', dia: 28, tipo: 'revision' as const, cita_plan: 'Revisión de resultados los días 21, 42, 63 y 84' }] }))).toContain('S04')
    expect(chequeos(v({ ...c.estrategia, patron_semanal: [{ ...c.estrategia.patron_semanal[0], formato: 'hologram' }] }))).toContain('S06')
  })
  it('S05/S07/S08 son avisos: no detienen', () => {
    const e = { ...c.estrategia, canales: [{ ...c.estrategia.canales[0], frecuencia: { feed_semana: 11, historias_semana: 0, anuncios_semana: 0 } }, ...c.estrategia.canales.slice(1)], pendientes: [{ clave: 'p', que_falta: 'x', desbloquea: [], pedir_a: 'sistema' as const }], fechas_que_importan: [{ tipo: 'temporadas', ambito: 'sector', origen: 'estrategia' as const, motivo: 'x' }] }
    const hs = v(e)
    expect(new Set(hs.map((h) => h.chequeo))).toEqual(new Set(['S05', 'S07', 'S08']))
    expect(bloqueos(hs)).toEqual([])
  })
})

/** LA BATERÍA: se corre idéntica para A y para B. */
function bateria(nombre: string, mk: () => ClienteFixture) {
  describe(`calendario · cliente ${nombre} (misma batería, sin parámetros por cliente)`, () => {
    const c = mk()
    const bueno = tandaBuena(c)
    const val = (t: TandaAgente, extra: Partial<InsumosCalendario> = {}) => validarTodo(insumos(c, t, extra))

    it('el calendario bueno pasa con 0 bloqueos', () => {
      expect(bloqueos(val(bueno))).toEqual([])
    })

    it('V02: «Foto o Reel» y un formato que la red no admite', () => {
      const a = c.anclas.lunes
      expect(chequeos(val(conPieza(c, bueno, 1, a, { formato: 'foto o reel' })))).toContain('V02')
      expect(chequeos(val(conPieza(c, bueno, 1, a, { formato: 'foto + carrusel' })))).toContain('V02')
      expect(chequeos(val(conPieza(c, bueno, 1, a, { formato: 'hologram' })))).toContain('V02')
    })

    it('V05: una red excluida por el plan o desconocida', () => {
      const a = c.anclas.lunes
      expect(chequeos(val(conPieza(c, bueno, 1, a, { red: 'tiktok', formato: 'video' })))).toContain('V05')
      expect(chequeos(val(conPieza(c, bueno, 1, a, { red: 'redinventada' })))).toContain('V05')
    })

    it('V06: hora fuera del horario; día cerrado; sin horario NUNCA es «ok»', () => {
      const sabado = c.anclas.sabado
      // la pieza del sábado no exige local abierto en A y sí en B: forzamos la exigencia
      const exige = conPieza(c, bueno, 1, sabado, { requiere_abierto: true, hora: '06:00' })
      expect(chequeos(val(exige))).toContain('V06')
      const sinHorario = insumos(c, bueno, { sedes: c.sedes.map((s) => ({ ...s, horario: null })) })
      const hs = validarTodo({ ...sinHorario, filas: sinHorario.filas })
      const v6 = hs.filter((h) => h.chequeo === 'V06')
      expect(v6.length).toBeGreaterThan(0)
      expect(v6.every((h) => h.severidad === 'aviso')).toBe(true)
      expect(v6[0].ficha.propuesta).toMatch(/PENDIENTE/)
    })

    it('V06 en domingo: la sede cerrada ese día se bloquea (B cierra el domingo; A abre jueves a lunes y cierra martes y miércoles)', () => {
      const dia = nombre === 'A' ? 2 : 7
      const t = conPieza(c, bueno, 1, c.anclas.sabado, { dia_semana: dia, requiere_abierto: true, hora: '10:00' })
      expect(chequeos(val(t))).toContain('V06')
    })

    it('V08: una pieza de más o de menos en una semana completa bloquea el feed', () => {
      const sinUna: TandaAgente = { ...bueno, piezas: bueno.piezas.filter((p) => !(p.semana === 2 && p.slot === c.anclas.lunes)) }
      const hs = val(sinUna)
      expect(chequeos(hs)).toContain('V01') // el slot quedó sin tema
      expect(hs.some((h) => h.chequeo === 'V08' && h.severidad === 'bloquea')).toBe(true)
    })

    it('V13: «día N» y fechas absolutas escritas en el tema son avisos, no bloqueos', () => {
      const hs = val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: 'Arrancamos el 12 de octubre con el día 7' }))
      expect(hs.some((h) => h.chequeo === 'V13' && h.severidad === 'aviso')).toBe(true)
      expect(bloqueos(hs)).toEqual([])
    })

    it('V15: palabra prohibida del manual y voseo', () => {
      expect(chequeos(val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: `Algo ${c.forbiddenWords[0]} hoy` })))).toContain('V15')
      expect(chequeos(val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: 'Vení a conocernos y decime qué pensás' })))).toContain('V15')
    })

    it('V16: una reseña con nombre sin ficha de procedencia', () => {
      expect(chequeos(val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: 'La reseña de Marta: «el mejor lugar que conozco»' })))).toContain('V16')
    })

    it('V20: el agente no puede esconder un video como foto', () => {
      const f = insumos(c, bueno).filas.map((x) => (x.id === `s1-d${c.estrategia.patron_semanal.find((s) => s.slot === c.anclas.lunes)!.dia_semana}-${c.anclas.lunes}` ? { ...x, formato: 'reel', estado: 'propuesta' as const } : x))
      const hs = validarTodo({ ...insumos(c, bueno), filas: f })
      expect(hs.some((h) => h.chequeo === 'V20' && h.severidad === 'bloquea')).toBe(true)
    })

    it('V22: una referencia que no existe o que es de OTRO cliente', () => {
      const dato = { dato: 'precio', valor: '$2,50', clase: 'alto' as const, nivel: 'F0' as const, opcional: false }
      expect(chequeos(val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: 'Café a $2,50', datos: [{ ...dato, ref: 'no-existe' }] })))).toContain('V22')
      const ajena: Referencia = { id: 'ficha-ajena', client_id: 'otro-cliente', origen: 'ficha', firmada: true, vigente: true, texto: 'cuesta $2,50' }
      expect(chequeos(val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: 'Café a $2,50', datos: [{ ...dato, ref: 'ficha-ajena' }] }), { referencias: [...c.referencias, ajena] }))).toContain('V22')
    })

    it('el calendario de un tema inocente no hace ruido falso (cifras de conteo no son datos)', () => {
      const hs = val(conPieza(c, bueno, 1, c.anclas.lunes, { tema: 'Tres pasos para elegir bien, parte 2 de 4' }))
      expect(bloqueos(hs)).toEqual([])
    })
  })
}
bateria('A', clienteA)
bateria('B', clienteB)

describe('los 7 errores del calendario real, inyectados (cliente A): el sistema los detiene y no inventa fallas', () => {
  const c = clienteA()
  const bueno = tandaBuena(c)
  const malo = (t: TandaAgente) => validarTodo(insumos(c, t, { fechasEspeciales: [] }))

  it('#1 día 1 indefinido: una fecha que no deriva el código se bloquea (V04)', () => {
    const base = insumos(c, bueno)
    const filas = base.filas.map((f, i) => (i === 0 ? { ...f, fecha: '2026-10-11' } : f))
    const hs = validarTodo({ ...base, filas })
    expect(chequeos(hs)).toContain('V04')
  })
  it('#2 revisión inventada (día 28 y 70): V12 bloquea', () => {
    const hs = malo(conPieza(c, bueno, 4, 'b', { tema: 'Ritual de revisión de la semana' })) // semana 4, jueves = día 25
    expect(chequeos(hs)).toContain('V12')
  })
  it('#3 anuncio antes de tener el grid listo: V11 bloquea', () => {
    const t = { ...bueno, piezas: [...bueno.piezas, { ...piezaBuena(c, 1, 'b', 'Primer anuncio'), slot: 'x', formato: 'anuncio_imagen', pieza_fija: 'anuncio-1' }] }
    const hs = malo(t)
    expect(hs.some((h) => h.chequeo === 'V11' && h.severidad === 'bloquea')).toBe(true)
  })
  it('#3b el mismo anuncio DESPUÉS de los 9 posts del grid no choca con la dependencia', () => {
    const t = { ...bueno, piezas: [...bueno.piezas, { ...piezaBuena(c, 4, 'b', 'Primer anuncio'), slot: 'x', formato: 'anuncio_imagen', pieza_fija: 'anuncio-1' }] }
    expect(malo(t).some((h) => h.chequeo === 'V11' && h.severidad === 'bloquea')).toBe(false)
  })
  it('#4 feriado equivocado: citar una fecha especial sin fuente verificada bloquea (V07); con fuente y en día abierto, pasa', () => {
    const t = conPieza(c, bueno, 2, 'a', { tema: 'Feliz feriado de la independencia' })
    expect(chequeos(malo(t))).toContain('V07')
    const fe = [{ id: 'f1', fecha: '2026-11-03', nombre: 'Independencia', tipo: 'feriados locales', ambito: 'ciudad', alcance: 'local' as const, estado: 'verificada' as const }]
    const respaldada = conPieza(c, bueno, 2, 'a', { tema: 'Feliz feriado de la independencia', datos: [{ dato: 'fecha_especial', valor: 'Independencia', clase: 'bajo', ref: 'fecha:f1', nivel: 'F1', opcional: false }] })
    expect(chequeos(validarTodo(insumos(c, respaldada, { fechasEspeciales: fe })))).not.toContain('V07')
  })
  it('#5 anuncio/pieza a las 06:00 con el local cerrado: V06 bloquea', () => {
    expect(chequeos(malo(conPieza(c, bueno, 1, 'a', { hora: '06:00' })))).toContain('V06')
  })
  it('#6 dato sin fuente («45 g»): V14 bloquea; con un trozo NO confiable como única fuente, también', () => {
    expect(chequeos(malo(conPieza(c, bueno, 1, 'a', { tema: 'Nuestro pan de 45 g' })))).toContain('V14')
    const conTrozo = conPieza(c, bueno, 1, 'a', { tema: 'Nuestro pan de 45 g', datos: [{ dato: 'peso del pan', valor: '45 g', clase: 'alto', ref: 'trozo-dudoso', nivel: 'F3', opcional: false }] })
    const hs = malo(conTrozo)
    expect(hs.some((h) => h.chequeo === 'V14' && /no sostiene un dato por sí sola/.test(h.ficha.que))).toBe(true)
  })
  it('#7 «Foto o Reel»: V02 bloquea', () => {
    expect(chequeos(malo(conPieza(c, bueno, 3, 'c', { formato: 'foto o reel' })))).toContain('V02')
  })
  it('y el calendario bueno de A no genera ni un bloqueo (ni ruido de pilares ni de fechas)', () => {
    expect(bloqueos(malo(bueno))).toEqual([])
  })
})

describe('CC#3 condición 3 · afirmaciones de origen, frescura, porción y trazabilidad (no son cifras)', () => {
  const frases = [
    ['el marisco llega el mismo día', 'frescura'],
    ['camarón y pescado de Olón', 'origen_lugar'],
    ['dos mixtos alcanzan para cuatro', 'porcion'],
    ['él es quien pesca lo que comes', 'trazabilidad'],
    ['resultado garantizado', 'garantia'],
    ['100 % natural', 'garantia'],
  ] as const
  for (const [f, tipo] of frases) {
    it(`«${f}» se detecta como ${tipo}`, () => {
      expect(hallarAfirmaciones(f, []).some((h) => h.subtipo === tipo)).toBe(true)
    })
  }
  it('un lugar que es una sede o el nombre del negocio NO es un origen de producto', () => {
    expect(hallarAfirmaciones('visítanos en la sede de Olón', ['Olón']).some((h) => h.subtipo === 'origen_lugar')).toBe(false)
    expect(hallarAfirmaciones('el menú de Café Brisa', ['Café Brisa']).some((h) => h.subtipo === 'origen_lugar')).toBe(false)
    expect(hallarAfirmaciones('mira lo que subimos de Instagram', []).some((h) => h.subtipo === 'origen_lugar')).toBe(false)
  })
  it('sin respaldo bloquean igual que una cifra; con un dato F0/F1 que las contenga, pasan; con un trozo no confiable, no', () => {
    const c = clienteA()
    const bueno = tandaBuena(c)
    const v = (t: TandaAgente, refs = c.referencias) => validarTodo(insumos(c, t, { referencias: refs }))
    const tema = 'El pan llega fresco todos los días'
    expect(chequeos(v(conPieza(c, bueno, 1, 'a', { tema })))).toContain('V14')
    const manual: Referencia = { id: 'ficha-pan', client_id: c.clientId, origen: 'ficha', firmada: true, vigente: true, texto: 'El pan llega fresco todos los días a las 06:00.' }
    const dato = { dato: 'frescura', valor: 'fresco', clase: 'alto' as const, ref: 'ficha-pan', nivel: 'F0' as const, opcional: false }
    expect(chequeos(v(conPieza(c, bueno, 1, 'a', { tema, datos: [dato] }), [...c.referencias, manual]))).not.toContain('V14')
    const trozo: Referencia = { id: 'trozo-pan', client_id: c.clientId, origen: 'trozo', confianza: 'untrusted', texto: 'El pan llega fresco' }
    expect(chequeos(v(conPieza(c, bueno, 1, 'a', { tema, datos: [{ ...dato, ref: 'trozo-pan', nivel: 'F3' }] }), [...c.referencias, trozo]))).toContain('V14')
  })
  it('queda pendiente (aviso) si la pieza lo declara como pendiente: la fila no sale a producción sin él', () => {
    const c = clienteA()
    const t = conPieza(c, tandaBuena(c), 1, 'a', { tema: 'El pan llega fresco', pendientes: ['frescura del pan'] })
    const hs = validarTodo(insumos(c, t))
    expect(hs.some((h) => h.chequeo === 'V14' && h.severidad === 'aviso')).toBe(true)
    expect(chequeos(hs)).not.toContain('V14')
  })
  it('el voseo se detecta; el tuteo no', () => {
    expect(hallarVoseo('Vení y probá el café').length).toBeGreaterThan(0)
    expect(hallarVoseo('Ven y prueba el café; tú decides').length).toBe(0)
  })
})

describe('jerarquía de fuentes (CC#3 condición 4: el manual NO es F0)', () => {
  const ficha: Referencia = { id: 'f', client_id: 'c', origen: 'ficha', firmada: true, vigente: true, texto: 'abre a las 07:00' }
  const manual: Referencia = { id: 'm', client_id: 'c', origen: 'manual', texto: 'abre a las 07:00' }
  const plan: Referencia = { id: 'p', client_id: 'c', origen: 'plan', texto: 'abre a las 07:00' }
  const trozo: Referencia = { id: 't', client_id: 'c', origen: 'trozo', confianza: 'untrusted', texto: 'abre a las 07:00' }
  const trozoOk: Referencia = { id: 't2', client_id: 'c', origen: 'trozo', confianza: 'tenant_trusted', texto: 'abre a las 07:00' }
  const sede = (s: 'sitio' | 'mapas', texto: string): Referencia => ({ id: `s-${s}`, client_id: 'c', origen: 'sede_datos', fuente: s, sede: 'centro', texto })

  it('un trozo untrusted o unknown nunca sostiene un dato, ni de riesgo medio', () => {
    expect(alcanza('alto', trozo, '07:00').ok).toBe(false)
    expect(alcanza('medio', trozo, '07:00').ok).toBe(false)
    expect(alcanza('alto', { ...trozo, confianza: 'unknown' }, '07:00').ok).toBe(false)
  })
  it('un trozo confiable sostiene riesgo medio pero NO alto', () => {
    expect(alcanza('medio', trozoOk, '07:00').ok).toBe(true)
    expect(alcanza('alto', trozoOk, '07:00').ok).toBe(false)
  })
  it('F0 sostiene todo; el manual y el plan son F1: riesgo alto solo con cita literal comprobada', () => {
    expect(alcanza('alto', ficha, '07:00').ok).toBe(true)
    expect(alcanza('alto', manual, '07:00').ok).toBe(true)
    expect(alcanza('alto', manual, '08:00').ok).toBe(false) // el valor no aparece: sin cita no hay respaldo
    expect(alcanza('alto', plan, '07:00').ok).toBe(true)
  })
  it('F2 sin firma sostiene riesgo alto solo con aviso «no firmado»', () => {
    const r = alcanza('alto', sede('sitio', 'abre a las 07:00'), '07:00')
    expect(r.ok).toBe(true)
    expect(r.avisos).toContain('no_firmado')
  })
  it('lo observado hace más de 90 días lleva aviso «viejo»', () => {
    expect(alcanza('alto', { ...sede('sitio', 'abre a las 07:00'), observado_en: '2026-05-01' }, '07:00', '2026-10-09').avisos).toContain('viejo')
  })
  it('C01: mismo dato, niveles distintos → gana el más alto', () => {
    const r = resolverDato([{ valor: '07:00', ref: ficha }, { valor: '08:00', ref: sede('mapas', 'abre a las 08:00') }], 'alto', ['centro'])
    expect(r.estado).toBe('ok')
    expect(r.valor).toBe('07:00')
    expect(r.nivel).toBe('F0')
    expect(r.choques.map((c) => c.id)).toContain('C01')
  })
  it('C02: mismo nivel, riesgo alto → no se elige (la fila queda en investigación); riesgo medio → la fuente más fuerte con aviso', () => {
    const a = sede('sitio', 'abre a las 07:00'), b = sede('mapas', 'abre a las 08:00')
    const alto = resolverDato([{ valor: '07:00', ref: a }, { valor: '08:00', ref: b }], 'alto', ['centro'])
    expect(alto.estado).toBe('conflicto')
    const medio = resolverDato([{ valor: '07:00', ref: a }, { valor: '08:00', ref: b }], 'medio', ['centro'])
    expect(medio.estado).toBe('ok')
    expect(medio.valor).toBe('07:00') // sitio > mapas
    expect(medio.choques.map((c) => c.id)).toContain('C02')
  })
  it('C04: una referencia de una sede ajena (el homónimo) se descarta antes de usarla', () => {
    const ajena: Referencia = { id: 'x', client_id: 'c', origen: 'sede_datos', fuente: 'mapas', sede: 'gualaceo', texto: 'abre a las 09:00' }
    const r = resolverDato([{ valor: '09:00', ref: ajena }], 'alto', ['centro'])
    expect(r.estado).toBe('sin_respaldo')
    expect(r.choques.map((c) => c.id)).toEqual(['C04'])
  })
  it('solo untrusted: no se cree el dato pero se conserva el candidato', () => {
    const r = resolverDato([{ valor: '45 g', ref: { ...trozo, texto: 'pesa 45 g' } }], 'alto', ['centro'])
    expect(r.estado).toBe('sin_respaldo')
    expect(r.candidato).toBe('45 g')
  })
  it('sedes duplicadas por mismo teléfono o nombre se señalan (aviso, no pregunta al cliente)', () => {
    expect(sedesSospechosas([{ clave: 'a', telefono: '099-000 001' }, { clave: 'b', telefono: '099000001' }])).toEqual([['a', 'b', 'mismo teléfono']])
    expect(sedesSospechosas([{ clave: 'a', nombre: 'Café Brisa' }, { clave: 'b', nombre: 'cafe brisa' }])).toEqual([['a', 'b', 'mismo nombre']])
    expect(sedesSospechosas([{ clave: 'a', nombre: 'Uno' }, { clave: 'b', nombre: 'Dos' }])).toEqual([])
  })
})

describe('fechas especiales declaradas por cada cliente (la lista vacía no investiga ni bloquea nada)', () => {
  it('el cliente B no declara tipos: ninguna comprobación de fechas especiales corre, y la campaña abre igual', () => {
    const c = clienteB()
    expect(c.estrategia.fechas_que_importan).toEqual([])
    const hs = validarTodo(insumos(c, tandaBuena(c)))
    expect(hs.filter((h) => h.chequeo === 'V07' || h.chequeo === 'V07b')).toEqual([])
    expect(bloqueos(hs)).toEqual([])
  })
  it('V07b solo actúa si el cliente declaró «feriados» Y hay filas que exigen local abierto', () => {
    const c = clienteA()
    const fe = [{ id: 'f9', fecha: '2026-10-22', nombre: 'Fiesta de otra ciudad', tipo: 'feriados locales', ambito: 'otra', alcance: 'local' as const, estado: 'verificada' as const }]
    const con = validarTodo(insumos(c, tandaBuena(c), { fechasEspeciales: fe }))
    expect(con.some((h) => h.chequeo === 'V07b' && h.severidad === 'aviso')).toBe(true)
    // un cliente sin horario (nada exige local abierto) nunca lo dispara
    const c2 = clienteA()
    const sinHorario = { ...c2.estrategia, patron_semanal: c2.estrategia.patron_semanal.map((s) => ({ ...s, requiere_abierto: false })) }
    const t = tandaBuena({ ...c2, estrategia: sinHorario })
    expect(validarTodo({ ...insumos({ ...c2, estrategia: sinHorario }, t, { fechasEspeciales: fe }) }).some((h) => h.chequeo === 'V07b')).toBe(false)
    // y un cliente que NO declaró el tipo tampoco, aunque haya fechas
    const sinTipo = { ...c2.estrategia, fechas_que_importan: [] }
    expect(validarTodo(insumos({ ...c2, estrategia: sinTipo }, tandaBuena({ ...c2, estrategia: sinTipo }), { fechasEspeciales: fe })).some((h) => h.chequeo === 'V07b')).toBe(false)
  })
})

describe('el ciclo de UNA corrección', () => {
  const c = clienteA()
  const bueno = tandaBuena(c)
  it('sin bloqueos no hay corrección; un bloqueo de fila se parchea por fila; uno de conjunto regenera la tanda', () => {
    expect(planDeCorreccion(validarTodo(insumos(c, bueno))).modo).toBe('ninguna')
    const deFila = planDeCorreccion(validarTodo(insumos(c, conPieza(c, bueno, 1, 'a', { formato: 'foto o reel' }))))
    expect(deFila.modo).toBe('filas')
    expect(deFila.filaIds).toEqual(['s1-d1-a'])
    expect(deFila.fichas[0]).toMatchObject({ gravedad: 'bloquea' })
    const deTanda = planDeCorreccion(validarTodo(insumos(c, { ...bueno, piezas: bueno.piezas.filter((p) => !(p.semana === 2 && p.slot === 'a')) })))
    expect(deTanda.modo).toBe('tanda')
  })
  it('tras la corrección, un dato sin fuente hace SALIR la fila (no se le pregunta a nadie) y el slot se anota como omitido', () => {
    const hs = validarTodo(insumos(c, conPieza(c, bueno, 1, 'a', { tema: 'Nuestro pan de 45 g' })))
    const r = resolverTrasCorreccion(hs, () => 1)
    expect(r.estado).toBe('filas_salen')
    expect(r.filasQueSalen).toEqual(['s1-d1-a'])
    expect(r.ajustes).toEqual([{ semana: 1, slot: 'a', accion: 'omitir', motivo: expect.stringContaining('dato sin fuente') }])
    // re-validar con el ajuste: la frecuencia no castiga a la fila que salió
    const filas = insumos(c, conPieza(c, bueno, 1, 'a', { tema: 'x' })).filas.map((f) => (f.id === 's1-d1-a' ? { ...f, estado: 'descartada_sin_fuente' as const } : f))
    const hs2 = validarTodo({ ...insumos(c, bueno), filas, ajustes: r.ajustes })
    expect(hs2.some((h) => h.chequeo === 'V08' && h.severidad === 'bloquea')).toBe(false)
  })
  it('un bloqueo que no es de dato (p. ej. una revisión inventada) detiene la campaña en la bandeja de Emilio', () => {
    const hs = validarTodo(insumos(c, conPieza(c, bueno, 4, 'b', { tema: 'Ritual de revisión' })))
    expect(resolverTrasCorreccion(hs, () => 4).estado).toBe('necesita_humano')
  })
  it('sin bloqueos tras la corrección: ok', () => {
    expect(resolverTrasCorreccion(validarTodo(insumos(c, bueno)), () => 1).estado).toBe('ok')
  })
  it('las clases de formato para contar frecuencia', () => {
    expect([claseDeFormato('foto'), claseDeFormato('historia'), claseDeFormato('estado'), claseDeFormato('anuncio_carrusel'), claseDeFormato('texto')]).toEqual(['feed', 'historias', 'historias', 'anuncios', 'feed'])
  })
})
