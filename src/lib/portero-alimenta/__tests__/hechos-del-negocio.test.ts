/**
 * ENCARGO 2 de Cerebro (17-nov, firma de Emilio) · hechos del negocio como DATO, por oferta. US$ 0 · sin red (base y ruta de la plataforma simuladas).
 * Las tres que pide el encargo: contradicción → pregunta · sin fuente → «no consta» · retiro de una oferta → deja de ser actual. Más: sin preguntas repetidas.
 */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from './base-falsa'
import {
  bloqueDeHechosEnTexto, diaAnterior, fechaExactaEnElTexto, TOPE_DE_LECTURA, formaDeLaOficina, hechosDelNegocio, leerHechosDelNegocio, NO_CONSTA, temaDeApertura, temaDeEstado, temaDeZona, TEMA_SIN_OFERTAS,
  type EntradaDeHechos,
} from '../hechos-del-negocio'
import { actualizarHechosDeLosClientes, hechosDeLaCorridaDelVigilante, preguntarHuecos, TOPE_DE_PREGUNTAS_POR_CORRIDA, type Preguntar } from '../hechos-preguntas'

const AHORA = new Date('2026-11-17T12:00:00Z')
const C = '0a2ffbd4-0000-4000-8000-000000000001'
const GYE = { id: 's-gye', clave: 'guayaquil', ciudad: 'Guayaquil' }
const OLON = { id: 's-olon', clave: 'olon', ciudad: 'Olon' }
let n = 0
const dato = (sede: string, campo: string, valor: string, fuente: string, en: string, extra: Record<string, unknown> = {}) => ({ id: `d${++n}`, sede_id: sede, campo, valor_texto: valor, fuente, fuente_ref: 'x', observado_en: en, retirada_en: null, ...extra })
const respuesta = (tema: string, resp: string, en: string, sedes: string[] = [], extra: Record<string, unknown> = {}) => ({ id: `f${++n}`, sede: sedes[0] ?? null, observado_en: en, retirada_en: null, descartada: false, provenance_tag: { datos: { tema, respuesta: resp, respondido_en: en, ...(sedes.length ? { sedes } : {}) } }, ...extra })

/** el caso real de Náufrago (17-nov): Guayaquil abierta según el dueño (antes «sin abrir»), solo domicilio; Olón con local y domicilio, sin estado declarado */
const naufrago = (): EntradaDeHechos => ({
  sedes: [GYE, OLON],
  datosDeSede: [
    dato('s-gye', 'estado_de_la_sede', 'por abrir', 'dueno', '2026-10-15T00:00:00Z'),
    dato('s-gye', 'estado_de_la_sede', 'abierta', 'dueno', '2026-11-09T00:00:00Z'),
    dato('s-gye', 'tipo_de_atencion', 'solo domicilio (sin local)', 'dueno', '2026-10-12T00:00:00Z'),
    dato('s-gye', 'direccion', 'Bamboo Plaza (no es del cliente)', 'sitio', '2026-10-28T00:00:00Z', { retirada_en: '2026-11-02T00:00:00Z' }),
    dato('s-olon', 'direccion', '663R+25G, Olon', 'mapas', '2026-10-11T00:00:00Z'),
    dato('s-olon', 'tipo_de_atencion', 'restaurante (local) y domicilio', 'dueno', '2026-10-12T00:00:00Z'),
  ],
  fichasDelDueno: [
    respuesta('apertura de la sede', 'Guayaquil sin abrir', '2026-10-16T00:00:00Z', ['guayaquil']),
    respuesta('fecha apertura guayaquil', 'LA PROXIMA SEMANA', '2026-11-06T00:00:00Z'),
  ],
})
const de = (h: ReturnType<typeof hechosDelNegocio>, oferta: string | null, tipo: string) => h.hechos.filter((x) => x.oferta === oferta && x.tipo === tipo)

describe('el caso real: cada hecho atado a su oferta, con fuente y fecha; lo que no se sabe, «no consta»', () => {
  const h = hechosDelNegocio(naufrago(), AHORA)
  it('Guayaquil: sede (solo domicilio) y apertura «abierta» según el DATO MÁS NUEVO del dueño (no la respuesta vieja «sin abrir»)', () => {
    expect(de(h, 'guayaquil', 'sede')[0]).toMatchObject({ sede_id: 's-gye', valor: 'Guayaquil (guayaquil) · atención: solo domicilio (sin local)', confianza: 'alta', fecha_de_la_fuente: '2026-10-12' })
    expect(de(h, 'guayaquil', 'sede')[0].fuente).toMatch(/^dueno · client_sede_datos:/)
    const ap = de(h, 'guayaquil', 'apertura')[0]
    // la fuente es la del ESTADO (el dato del 9-nov que dice «abierta»); la respuesta sobre la fecha va citada en el texto con su ficha
    expect(ap.valor).toMatch(/^Guayaquil \(guayaquil\) abierta · sobre la fecha, el dueño dijo «LA PROXIMA SEMANA» \(2026-11-06 · cerebro_fichas:f\d+\)$/)
    expect(ap).toMatchObject({ fuente: expect.stringMatching(/^dueno · client_sede_datos:/), fecha_de_la_fuente: '2026-11-09' })
    expect(de(h, 'guayaquil', 'aun_no_existe')).toHaveLength(0)
  })
  it('🔴 sin fecha EXACTA no se inventa el «desde»: la respuesta se cita y el desde queda «no consta»; y no se vuelve a preguntar lo que ya respondió', () => {
    expect(de(h, 'guayaquil', 'apertura')[0].vigente_desde).toBeNull()
    expect(h.sin_dato).toContainEqual({ oferta: 'guayaquil', tipo: 'apertura', que_falta: 'desde qué fecha atiende (el dueño dijo «LA PROXIMA SEMANA», sin fecha exacta)' })
    expect(h.huecos.map((x) => x.tema)).not.toContain(temaDeApertura('guayaquil'))
  })
  it('un dato de sede RETIRADO no cuenta (la dirección ajena de Guayaquil no aparece)', () => {
    expect(JSON.stringify(h.hechos)).not.toMatch(/Bamboo/)
  })
  it('🔴 la respuesta de Guayaquil NO cierra la pregunta de Olón (temas exactos: por palabras serían «el mismo»)', () => {
    expect(h.huecos.map((x) => x.tema)).toContain(temaDeApertura('olon'))
    expect(de(h, 'olon', 'apertura')).toHaveLength(0) // sin estado declarado: no se afirma «abierta»
    expect(de(h, 'olon', 'sede')[0]).toMatchObject({ valor: expect.stringMatching(/^Olon \(olon\) · atención: restaurante \(local\) y domicilio · dirección: 663R\+25G, Olon \(mapas · client_sede_datos:d\d+ · 2026-10-11\)$/) })
  })
  it('🔴 una respuesta a un tema GENERAL («fecha apertura», sin oferta) no se toma como la de Olón (por palabras coincidiría 2 de 2)', () => {
    const e = naufrago()
    e.fichasDelDueno = [...e.fichasDelDueno, respuesta('fecha apertura', 'el 2026-11-01', '2026-11-10T00:00:00Z')]
    const h2 = hechosDelNegocio(e, AHORA)
    expect(h2.huecos.map((x) => x.tema)).toContain(temaDeApertura('olon'))
    expect(de(h2, 'olon', 'apertura')).toHaveLength(0)
  })
  it('las dos entregan a domicilio y ninguna tiene zona: «no consta» y su pregunta', () => {
    for (const o of ['guayaquil', 'olon']) {
      expect(h.sin_dato).toContainEqual({ oferta: o, tipo: 'zona_de_entrega', que_falta: 'a qué zonas entrega a domicilio' })
      expect(h.huecos.find((x) => x.tema === temaDeZona(o))?.pregunta).toMatch(/¿A qué zonas entregas a domicilio desde/)
    }
  })
  it('sin contradicción: los dos estados de Guayaquil son del dueño y manda el más nuevo', () => {
    expect(h.huecos.filter((x) => x.clase === 'contradiccion')).toHaveLength(0)
  })
})

describe('🔴 contradicción → pregunta', () => {
  it('la ficha del cliente dice «por abrir» y el dueño «abierta»: pregunta qué es lo actual, con los dos lados y sus fechas', () => {
    const e = { ...naufrago(), config: { apify: { sedes_estado: { guayaquil: 'por_abrir' } } } }
    const h = hechosDelNegocio(e, AHORA)
    const c = h.huecos.find((x) => x.clase === 'contradiccion')
    expect(c).toMatchObject({ oferta: 'guayaquil', tema: temaDeEstado('guayaquil') })
    expect(c!.pregunta).toBe('Tengo datos distintos sobre Guayaquil (guayaquil): «abierta» según el dueño (2026-11-09) y «por abrir» según la ficha del cliente. ¿Cuál es el estado actual?')
  })
  it('mientras se aclara, manda la ficha del cliente (el mismo orden que el resto del sistema): Guayaquil sale «por abrir»', () => {
    const h = hechosDelNegocio({ ...naufrago(), config: { apify: { sedes_estado: { guayaquil: 'por_abrir' } } } }, AHORA)
    expect(h.hechos.filter((x) => x.oferta === 'guayaquil').map((x) => x.tipo)).toEqual(['aun_no_existe'])
  })
  it('ya respondida por el dueño → no se vuelve a preguntar', () => {
    const e = { ...naufrago(), config: { apify: { sedes_estado: { guayaquil: 'por_abrir' } } } }
    e.fichasDelDueno = [...e.fichasDelDueno, respuesta(temaDeEstado('guayaquil'), 'ya está abierta', '2026-11-17T00:00:00Z')]
    expect(hechosDelNegocio(e, AHORA).huecos.filter((x) => x.clase === 'contradiccion')).toHaveLength(0)
  })
  it('dos fuentes que dicen lo MISMO no son contradicción', () => {
    const e = { ...naufrago(), config: { apify: { sedes_estado: { guayaquil: 'abierta' } } } }
    expect(hechosDelNegocio(e, AHORA).huecos.filter((x) => x.clase === 'contradiccion')).toHaveLength(0)
  })
})

describe('🔴 sin fuente → «no consta»', () => {
  it('un cliente sin ofertas: ningún hecho inventado, «no consta» y la pregunta de dónde atiende', () => {
    const h = hechosDelNegocio({ sedes: [], datosDeSede: [], fichasDelDueno: [] }, AHORA)
    expect(h.hechos).toEqual([])
    expect(h.sin_dato).toEqual([{ oferta: null, tipo: 'sede', que_falta: 'dónde atiende o vende el negocio (no hay ofertas registradas)' }])
    expect(h.huecos).toEqual([expect.objectContaining({ tema: TEMA_SIN_OFERTAS, oferta: null })])
    expect(formaDeLaOficina(h, AHORA)).toEqual([{ que: 'sede', valor: `${NO_CONSTA}: dónde atiende o vende el negocio (no hay ofertas registradas)`, donde: null, desde: null, fuente: null }])
  })
  it('una oferta registrada sin ningún dato: la sede se cita al registro del alta (confianza media) y su apertura no consta', () => {
    const h = hechosDelNegocio({ sedes: [OLON], datosDeSede: [], fichasDelDueno: [] }, AHORA)
    expect(de(h, 'olon', 'sede')[0]).toMatchObject({ valor: 'Olon (olon)', fuente: 'alta · client_sedes:s-olon', confianza: 'media', fecha_de_la_fuente: null })
    expect(h.sin_dato).toContainEqual({ oferta: 'olon', tipo: 'apertura', que_falta: 'desde qué fecha atiende' })
    // sin atención declarada no se supone que entregue a domicilio
    expect(h.huecos.map((x) => x.tema)).toEqual([temaDeApertura('olon')])
  })
  it('el bloque en texto: cada línea con su fuente y su fecha; lo que no consta lo dice', () => {
    const t = bloqueDeHechosEnTexto(hechosDelNegocio(naufrago(), AHORA), AHORA)
    expect(t).toMatch(/^# HECHOS DEL NEGOCIO/)
    expect(t).toMatch(/- guayaquil · sede: Guayaquil \(guayaquil\) · atención: solo domicilio \(sin local\) · fuente: dueno · client_sede_datos:\S+ · dicho el 2026-10-12/)
    expect(t).toMatch(/- olon · zona de entrega: no consta: a qué zonas entrega a domicilio/)
  })
})

describe('🔴 retiro de una oferta → deja de ser actual', () => {
  const cerrada = (en: string, extra: Partial<EntradaDeHechos> = {}): EntradaDeHechos => ({ sedes: [GYE, OLON], datosDeSede: [...naufrago().datosDeSede, dato('s-olon', 'estado_de_la_sede', 'cerrada', 'dueno', en)], fichasDelDueno: naufrago().fichasDelDueno, ...extra })
  it('cerrada: ni sede, ni apertura, ni zona como actuales; un solo hecho «cierre o retiro»; pregunta desde cuándo', () => {
    const h = hechosDelNegocio(cerrada('2026-11-16T00:00:00Z'), AHORA)
    expect(h.hechos.filter((x) => x.oferta === 'olon').map((x) => x.tipo)).toEqual(['cierre_retiro'])
    expect(h.huecos.filter((x) => x.oferta === 'olon').map((x) => x.tema)).toEqual(['fecha cierre olon'])
    const of = formaDeLaOficina(h, AHORA).filter((x) => x.donde === 'olon')
    expect(of.map((x) => x.que)).toEqual(['cierre o retiro', 'cierre o retiro'])
    expect(of[0].valor).toBe('Olon (olon) cerrada')
  })
  it('cerrada AYER según el dueño (con fecha exacta): en la oficina dice «cerrada desde» y nunca como sede actual', () => {
    const e = cerrada('2026-11-16T00:00:00Z')
    e.fichasDelDueno = [...e.fichasDelDueno, respuesta('fecha cierre olon', 'cerramos el 16/11/2026', '2026-11-17T00:00:00Z')]
    const of = formaDeLaOficina(hechosDelNegocio(e, AHORA), AHORA).filter((x) => x.donde === 'olon')
    expect(of).toEqual([{ que: 'cierre o retiro', valor: expect.stringMatching(/^Olon \(olon\) cerrada · sobre la fecha, el dueño dijo «cerramos el 16\/11\/2026» \(2026-11-17 · cerebro_fichas:f\d+\) · cerrada desde 2026-11-16$/), donde: 'olon', desde: '2026-11-16', fuente: expect.stringMatching(/^dueno · client_sede_datos:\S+ · dicho el 2026-11-16$/) }])
  })
  it('por abrir con fecha ya pasada: «aún no existe» vence y la apertura queda como actual', () => {
    const e: EntradaDeHechos = { sedes: [GYE], datosDeSede: [dato('s-gye', 'estado_de_la_sede', 'por abrir', 'dueno', '2026-10-15T00:00:00Z')], fichasDelDueno: [respuesta('fecha apertura guayaquil', 'abrimos el 2026-11-16', '2026-10-20T00:00:00Z')] }
    const of = formaDeLaOficina(hechosDelNegocio(e, AHORA), AHORA)
    expect(of.map((x) => x.que)).toEqual(['apertura'])
    expect(of[0]).toMatchObject({ desde: '2026-11-16' })
  })
  it('por abrir con fecha futura: la apertura llega «AÚN NO VIGENTE» y «aún no existe» sigue actual hasta esa fecha', () => {
    const e: EntradaDeHechos = { sedes: [GYE], datosDeSede: [dato('s-gye', 'estado_de_la_sede', 'por abrir', 'dueno', '2026-10-15T00:00:00Z')], fichasDelDueno: [respuesta('fecha apertura guayaquil', 'el 18 de noviembre de 2026', '2026-10-20T00:00:00Z')] }
    const h = hechosDelNegocio(e, AHORA)
    expect(h.huecos).toEqual([])
    const of = formaDeLaOficina(h, AHORA)
    expect(of.find((x) => x.que === 'aún no existe')?.valor).toBe('Guayaquil (guayaquil) por abrir (todavía no atiende) · hasta 2026-11-17')
    expect(of.find((x) => x.que === 'apertura')?.valor).toMatch(/AÚN NO VIGENTE \(empieza el 2026-11-18\)$/)
  })
  it('sin estado declarado pero con la fecha exacta del dueño: la apertura es su respuesta (y deja de preguntarse)', () => {
    const e: EntradaDeHechos = { sedes: [OLON], datosDeSede: [], fichasDelDueno: [respuesta('fecha apertura olon', 'desde el 3 de marzo de 2019', '2026-11-17T00:00:00Z')] }
    const h = hechosDelNegocio(e, AHORA)
    expect(de(h, 'olon', 'apertura')[0]).toMatchObject({ valor: 'Olon (olon) atiende desde 2019-03-03 · el dueño dijo «desde el 3 de marzo de 2019»', vigente_desde: '2019-03-03', fuente: expect.stringMatching(/^dueno · cerebro_fichas:/) })
    expect(h.sin_dato.filter((x) => x.tipo === 'apertura')).toEqual([])
    expect(h.huecos).toEqual([])
  })
  it('por abrir SIN fecha: «aún no existe» sin hasta, la fecha prevista no consta y se pregunta', () => {
    const e: EntradaDeHechos = { sedes: [GYE], datosDeSede: [dato('s-gye', 'estado_de_la_sede', 'por abrir', 'dueno', '2026-10-15T00:00:00Z')], fichasDelDueno: [] }
    const h = hechosDelNegocio(e, AHORA)
    expect(h.hechos.map((x) => [x.tipo, x.vigente_hasta])).toEqual([['aun_no_existe', null]])
    expect(h.huecos).toEqual([expect.objectContaining({ tema: temaDeApertura('guayaquil'), pregunta: '¿Qué fecha tienes prevista para abrir Guayaquil (guayaquil)?' })])
  })
  it('🔴 el DÍA en que abre (E): «aún no existe» vale hasta E−1 y ya no llega; la apertura llega como vigente, sin «AÚN NO VIGENTE»', () => {
    const e: EntradaDeHechos = { sedes: [GYE], datosDeSede: [dato('s-gye', 'estado_de_la_sede', 'por abrir', 'dueno', '2026-10-15T00:00:00Z')], fichasDelDueno: [respuesta('fecha apertura guayaquil', 'el 17/11/2026', '2026-10-20T00:00:00Z')] }
    const h = hechosDelNegocio(e, AHORA)
    expect(de(h, 'guayaquil', 'aun_no_existe')[0].vigente_hasta).toBe('2026-11-16')
    const of = formaDeLaOficina(h, AHORA)
    expect(of.map((x) => x.que)).toEqual(['apertura'])
    expect(of[0].valor).not.toMatch(/AÚN NO VIGENTE/)
    // la víspera (E−1) todavía es «por abrir»
    expect(formaDeLaOficina(h, new Date('2026-11-16T12:00:00Z')).map((x) => x.que)).toEqual(['aún no existe', 'apertura'])
  })
  it('el día anterior cruza meses y años', () => {
    expect([diaAnterior('2026-03-01'), diaAnterior('2027-01-01'), diaAnterior('2028-03-01')]).toEqual(['2026-02-28', '2026-12-31', '2028-02-29'])
  })
  it('🔴 una respuesta del dueño DESCARTADA no cuenta: no da fecha, no cierra el hueco ni frena la pregunta', () => {
    const e: EntradaDeHechos = { sedes: [OLON], datosDeSede: [], fichasDelDueno: [respuesta('fecha apertura olon', 'el 2019-03-03', '2026-11-01T00:00:00Z', [], { descartada: true })] }
    const h = hechosDelNegocio(e, AHORA)
    expect(de(h, 'olon', 'apertura')).toHaveLength(0)
    expect(h.sin_dato).toContainEqual({ oferta: 'olon', tipo: 'apertura', que_falta: 'desde qué fecha atiende' })
    expect(h.huecos.map((x) => x.tema)).toEqual([temaDeApertura('olon')])
  })
  it('una respuesta del dueño RETIRADA tampoco cuenta', () => {
    const e: EntradaDeHechos = { sedes: [OLON], datosDeSede: [], fichasDelDueno: [respuesta('fecha apertura olon', 'el 2019-03-03', '2026-11-01T00:00:00Z', [], { retirada_en: '2026-11-02T00:00:00Z' })] }
    expect(hechosDelNegocio(e, AHORA).huecos.map((x) => x.tema)).toEqual([temaDeApertura('olon')])
  })
  it('si el dueño respondió dos veces el mismo tema, vale la respuesta MÁS NUEVA', () => {
    const e: EntradaDeHechos = { sedes: [OLON], datosDeSede: [], fichasDelDueno: [respuesta('fecha apertura olon', 'el 2019-03-03', '2026-11-01T00:00:00Z'), respuesta('fecha apertura olon', 'el 2018-05-05', '2026-11-15T00:00:00Z')] }
    expect(de(hechosDelNegocio(e, AHORA), 'olon', 'apertura')[0].vigente_desde).toBe('2018-05-05')
  })
  it('solo local (no entrega a domicilio): la zona de entrega no se pregunta ni figura como «no consta»', () => {
    const e: EntradaDeHechos = { sedes: [OLON], datosDeSede: [dato('s-olon', 'tipo_de_atencion', 'restaurante (local)', 'dueno', '2026-10-12T00:00:00Z')], fichasDelDueno: [] }
    const h = hechosDelNegocio(e, AHORA)
    expect(h.huecos.map((x) => x.tema)).not.toContain(temaDeZona('olon'))
    expect(h.sin_dato.map((x) => x.tipo)).not.toContain('zona_de_entrega')
  })
  it('la confianza baja viaja en el texto', () => {
    const e: EntradaDeHechos = { sedes: [OLON], datosDeSede: [dato('s-olon', 'zona_de_entrega', 'Olón y Montañita', 'resena', '2026-11-01T00:00:00Z')], fichasDelDueno: [] }
    expect(formaDeLaOficina(hechosDelNegocio(e, AHORA), AHORA).find((x) => x.que === 'zona de entrega')?.valor).toBe('Olon (olon): Olón y Montañita (confianza baja)')
  })
})

describe('fecha EXACTA en una respuesta (código: solo lo escrito)', () => {
  it.each([
    ['abrimos el 2026-11-16', '2026-11-16'], ['el 16/11/2026', '2026-11-16'], ['16-11-2026', '2026-11-16'], ['el 3 de marzo de 2019', '2019-03-03'], ['el 1 de setiembre del 2025', '2025-09-01'],
    ['LA PROXIMA SEMANA', null], ['en marzo de 2019', null], ['2019', null], ['el 30/02/2026', null], ['entre el 2026-11-01 y el 2026-11-05', null], ['el 2026-11-16, o sea 16/11/2026', '2026-11-16'],
  ])('%s → %s', (t, f) => expect(fechaExactaEnElTexto(t)).toBe(f))
})

describe('🔴 las preguntas: por la ruta de la plataforma, oficina «cerebro», nunca repetidas', () => {
  const huecos = hechosDelNegocio(naufrago(), AHORA).huecos
  const armar = (historial: Array<Record<string, unknown>> = [], contesta: (c: Record<string, unknown>) => { status: number; body: Record<string, unknown> } = () => ({ status: 200, body: { ok: true, registrada: true, pregunta_id: `p${++n}` } }), falla = false) => {
    const base = crearBaseFalsa({ dueno_preguntas: historial.map((h) => ({ client_id: C, ...h })) }, falla ? { fallaEn: 'dueno_preguntas' } : {})
    const pedidos: Array<Record<string, unknown>> = []
    const preguntar: Preguntar = async (c) => { pedidos.push(c); return contesta(c) }
    return { db: base.db, preguntar, pedidos }
  }
  const correr = (a: ReturnType<typeof armar>, dry_run = false) => preguntarHuecos(a, { clientId: C, huecos, workflow_id: 'wf', workflow_execution_id: 'ex', dry_run, sedes: ['guayaquil', 'olon'] })
  it('crea cada pregunta con accion «preguntar», oficina «cerebro», su tema, su sede y el workflow', async () => {
    const a = armar()
    const r = await correr(a)
    expect(r.creadas.map((x) => x.tema)).toEqual([temaDeZona('guayaquil'), temaDeApertura('olon'), temaDeZona('olon')])
    expect(a.pedidos[1]).toMatchObject({ accion: 'preguntar', client_id: C, workflow_id: 'wf', workflow_execution_id: 'ex', preguntado_por: { oficina: 'cerebro' }, tema: 'fecha apertura olon', sede_clave: 'olon', canal: 'dashboard · Tu oficina' })
  })
  it('🔴 un tema que YA existe para el cliente (en cualquier estado y fecha) no se pregunta: ni siquiera se llama a la ruta', async () => {
    for (const estado of ['pendiente', 'respondida', 'obsoleta', 'descartada']) {
      const a = armar([{ tema: 'Zona entrega Guayaquil', estado }])
      const r = await correr(a)
      expect(r.ya_existian).toContainEqual({ tema: temaDeZona('guayaquil'), motivo: `ya se le preguntó al dueño (estado: ${estado})` })
      expect(a.pedidos.map((p) => p.tema)).not.toContain(temaDeZona('guayaquil'))
    }
  })
  it('🔴 la pregunta de otra oferta no frena a esta (tema exacto)', async () => {
    const a = armar([{ tema: 'fecha apertura guayaquil', estado: 'respondida' }])
    expect((await correr(a)).creadas.map((x) => x.tema)).toContain(temaDeApertura('olon'))
  })
  it('🔴 un tema GENERAL del historial («fecha apertura») no frena la pregunta de una oferta (tema exacto, no por palabras)', async () => {
    const a = armar([{ tema: 'fecha apertura', estado: 'respondida' }])
    expect((await correr(a)).creadas.map((x) => x.tema)).toContain(temaDeApertura('olon'))
  })
  it('🔴 la sede solo viaja si es una oferta registrada del cliente', async () => {
    const a = armar()
    await preguntarHuecos(a, { clientId: C, huecos: [{ clase: 'falta', oferta: 'quito', tema: 'zona entrega quito', pregunta: '¿?', motivo: 'x' }], workflow_id: 'wf', workflow_execution_id: 'ex', dry_run: false, sedes: ['olon'] })
    expect(a.pedidos[0]).not.toHaveProperty('sede_clave')
  })
  it('si no puede leer el historial, NO pregunta a ciegas', async () => {
    const a = armar([], undefined, true)
    const r = await correr(a)
    expect(a.pedidos).toHaveLength(0)
    expect(r.fallidas).toHaveLength(huecos.length)
  })
  it('lo que la ruta frena (ya respondida / ya preguntada / repetida) se anota como existente; un error, como fallida', async () => {
    const respuestas = [{ status: 200, body: { ok: true, registrada: false, ya_respondida: true } }, { status: 200, body: { ok: true, registrada: false, repetida: true } }, { status: 502, body: { error: 'cerebro_no_leido', detalle: 'puerta apagada' } }]
    const a = armar([], () => respuestas.shift()!)
    const r = await correr(a)
    expect(r.ya_existian.map((x) => x.motivo)).toEqual(['el dueño ya lo respondió', 'la misma pregunta sigue pendiente'])
    expect(r.fallidas).toEqual([{ tema: temaDeZona('olon'), detalle: '502 cerebro_no_leido puerta apagada' }])
  })
  it(`tope de ${TOPE_DE_PREGUNTAS_POR_CORRIDA} por corrida y cliente; en seco solo dice qué preguntaría`, async () => {
    const muchos = Array.from({ length: 5 }, (_, i) => ({ clase: 'falta' as const, oferta: null, tema: `tema ${i} de prueba`, pregunta: '¿?', motivo: 'x' }))
    const a = armar()
    const r = await preguntarHuecos(a, { clientId: C, huecos: muchos, workflow_id: 'wf', workflow_execution_id: 'ex', dry_run: false })
    expect(r.creadas).toHaveLength(TOPE_DE_PREGUNTAS_POR_CORRIDA)
    expect(r.para_otra_corrida).toEqual(['tema 3 de prueba', 'tema 4 de prueba'])
    const seco = armar()
    expect((await correr(seco, true)).se_preguntaria).toHaveLength(huecos.length)
    expect(seco.pedidos).toHaveLength(0)
  })
})

describe('la lectura desde la base y el paso de cada corrida', () => {
  const tablas = () => ({
    client_sedes: [{ ...GYE, client_id: C }, { ...OLON, client_id: C }],
    client_sede_datos: naufrago().datosDeSede.map((d) => ({ ...d, client_id: C })),
    cerebro_fichas: naufrago().fichasDelDueno.map((f) => ({ ...f, client_id: C, clase: 'dato_del_dueno' })),
    clients: [{ id: C, config: {} }],
    dueno_preguntas: [] as Array<Record<string, unknown>>,
  })
  it('lee las cuatro fuentes y sirve la forma completa, la de la oficina y el texto', async () => {
    const l = await leerHechosDelNegocio(crearBaseFalsa(tablas()).db, C, AHORA)
    if (l.estado !== 'ok') throw new Error(l.detalle)
    expect(l.hechos.length).toBe(hechosDelNegocio(naufrago(), AHORA).hechos.length)
    expect(l.oficina.hechos.every((x) => x.que && x.valor)).toBe(true)
    expect(l.texto).toMatch(/^# HECHOS DEL NEGOCIO/)
  })
  it('una lectura que falla se dice (no se sirve vacío como si no hubiera hechos)', async () => {
    const l = await leerHechosDelNegocio(crearBaseFalsa(tablas(), { fallaEn: 'client_sede_datos' }).db, C, AHORA)
    expect(l).toEqual({ estado: 'no_se_pudo_leer', detalle: 'client_sede_datos: falla simulada en client_sede_datos' })
  })
  it('🔴 una lectura que llega al tope de filas NO se sirve como completa', async () => {
    const t = tablas()
    t.client_sede_datos = Array.from({ length: TOPE_DE_LECTURA }, (_, i) => ({ ...dato('s-olon', 'horario', `h${i}`, 'sitio', '2026-11-01T00:00:00Z'), client_id: C }))
    expect(await leerHechosDelNegocio(crearBaseFalsa(t).db, C, AHORA)).toEqual({ estado: 'no_se_pudo_leer', detalle: `lectura recortada a ${TOPE_DE_LECTURA} filas: los hechos no estarían completos` })
  })
  it('en cada corrida: por cliente, deriva y pregunta; un cliente que falla no frena a otro', async () => {
    const t = tablas()
    const pedidos: string[] = []
    const r = await actualizarHechosDeLosClientes({ db: crearBaseFalsa(t).db, preguntar: async (c) => { pedidos.push(String(c.tema)); return { status: 200, body: { registrada: true, pregunta_id: 'p' } } }, ahora: AHORA }, { clientes: [C, 'otro-cliente'], workflow_id: 'wf', workflow_execution_id: 'ex', dry_run: false })
    expect(r[0]).toMatchObject({ client_id: C, estado: 'ok', preguntas: { creadas: expect.any(Array) } })
    // el segundo cliente no tiene ofertas: su pregunta es «dónde atiende»
    expect(pedidos).toEqual([temaDeZona('guayaquil'), temaDeApertura('olon'), temaDeZona('olon'), TEMA_SIN_OFERTAS])
    expect(r[1]).toMatchObject({ client_id: 'otro-cliente', estado: 'ok', hechos: 0, sin_dato: 1 })
  })
})

describe('al cierre de cada corrida (la ruta del vigilante)', () => {
  const C2 = '0a2ffbd4-0000-4000-8000-000000000002'
  const armar = () => { const pedidos: string[] = []; const db = crearBaseFalsa({ client_sedes: [{ ...OLON, client_id: C2 }], client_sede_datos: [], cerebro_fichas: [], clients: [{ id: C2, config: {} }], dueno_preguntas: [] }).db; return { pedidos, deps: { db, preguntar: (async (c) => { pedidos.push(String(c.tema)); return { status: 200, body: { registrada: true, pregunta_id: 'p' } } }) as Preguntar, ahora: AHORA } } }
  it('🔴 pregunta solo con dry_run false Y el proceso que lo pidió; los clientes son los que revisó el vigilante (lo que no es un id se ignora)', async () => {
    const a = armar()
    const r = await hechosDeLaCorridaDelVigilante(a.deps, { dry_run: false, workflow_id: 'wf', workflow_execution_id: 'ex' }, { clientes: [{ client_id: C2 }, { client_id: 'general' }] })
    expect(r?.map((x) => x.client_id)).toEqual([C2])
    expect(a.pedidos).toEqual([temaDeApertura('olon')])
  })
  it.each([
    ['en seco', { dry_run: true, workflow_id: 'wf', workflow_execution_id: 'ex' }],
    ['sin dry_run', { workflow_id: 'wf', workflow_execution_id: 'ex' }],
    ['sin el proceso', { dry_run: false }],
  ])('🔴 %s: no pregunta nada (solo dice qué preguntaría)', async (_n, cuerpo) => {
    const a = armar()
    const r = await hechosDeLaCorridaDelVigilante(a.deps, cuerpo, { clientes: [{ client_id: C2 }] })
    expect(a.pedidos).toEqual([])
    expect(r?.[0].preguntas?.se_preguntaria).toEqual([temaDeApertura('olon')])
  })
  it('sin clientes revisados: null (la respuesta del vigilante no cambia)', async () => {
    expect(await hechosDeLaCorridaDelVigilante(armar().deps, { dry_run: false }, { ok: false })).toBeNull()
  })
})
