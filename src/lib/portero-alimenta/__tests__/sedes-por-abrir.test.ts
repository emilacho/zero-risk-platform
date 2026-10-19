/**
 * SEDES «POR ABRIR» (19-oct) · el resumen vivo mostraba el horario de Guayaquil como si atendiera, aunque el dueño dijo «Guayaquil sin abrir».
 * Lo que cambia: el horario y la atención de una sede por abrir salen rotulados; los PRECIOS de esa sede se quedan. General: tres rubros, una o varias sedes, el dato viene del dueño, de la ficha o de la sede.
 * US$ 0 · sin red.
 */
import { describe, expect, it } from 'vitest'
import { estadoDeApertura, estadoDeLasSedes, sedesPorAbrir, esLineaDeHorarioOAtencion } from '../../sedes/por-abrir'
import { armarResumen, cargarEntradaDelResumen, type EntradaDelResumen, type FichaParaResumen } from '../resumen-vivo'
import { crearBaseFalsa } from './base-falsa'

const AHORA = new Date('2026-10-19T12:30:00Z')
const ficha = (id: string, clase: string, contenido: string, extra: Partial<FichaParaResumen> = {}): FichaParaResumen => ({ id, clase, titulo: contenido.slice(0, 30), contenido, atributo: `${clase}:${id}`, observado_en: '2026-10-14T10:00:00Z', fecha_fuente: '2026-10-14', vigente_hasta: '2026-12-01T00:00:00Z', retirada_en: null, provenance_tag: {}, ...extra })
const enSede = (sede: string) => ({ datos: { sede, sedes: [sede], sede_asignada_por: 'fuente' } })
const duenoApertura = (sede: string, respuesta: string, en = '2026-10-16T00:00:00Z'): FichaParaResumen => ficha(`d${sede}${en.slice(8, 10)}`.padEnd(8, '0'), 'dato_del_dueno', `Respuesta del dueño: «${respuesta}»`, { observado_en: en, provenance_tag: { datos: { sede, sedes: [sede], tema: 'apertura de la sede', tema_norm: 'apertura-sede', respuesta, respondido_en: en } } })

describe('qué dice un texto sobre la apertura', () => {
  it('por abrir', () => { for (const t of ['Guayaquil sin abrir', 'aún no abre', 'todavía no hemos abierto', 'Abrirá en diciembre', 'está en construcción', 'próxima apertura en enero', 'Aún no abrimos']) expect(estadoDeApertura(t), t).toBe('por_abrir') })
  it('abierta', () => { for (const t of ['ya abrió', 'Ya está abierta', 'ya abrimos el sábado', 'funcionando desde el lunes']) expect(estadoDeApertura(t), t).toBe('abierta') })
  it('nada claro', () => { for (const t of ['', 'tiene 20 mesas', 'queda en Olón']) expect(estadoDeApertura(t), t).toBeNull() })
})

describe('de dónde sale el estado de una sede', () => {
  it('lo que dijo el dueño: la respuesta más nueva por sede gana («sin abrir» y luego «ya abrió»)', () => {
    expect([...sedesPorAbrir({ fichasDelDueno: [duenoApertura('guayaquil', 'Guayaquil sin abrir')] })]).toEqual(['guayaquil'])
    expect(sedesPorAbrir({ fichasDelDueno: [duenoApertura('guayaquil', 'Guayaquil sin abrir', '2026-10-16T00:00:00Z'), duenoApertura('guayaquil', 'ya abrió', '2026-10-30T00:00:00Z')] }).size).toBe(0)
  })
  it('una ficha retirada del dueño no cuenta; otro tema del dueño tampoco', () => {
    expect(sedesPorAbrir({ fichasDelDueno: [{ ...duenoApertura('guayaquil', 'sin abrir'), retirada_en: '2026-10-17T00:00:00Z' }] }).size).toBe(0)
    const otro = duenoApertura('guayaquil', 'sin abrir'); (otro.provenance_tag as any).datos.tema_norm = 'costo-por-plato'
    expect(sedesPorAbrir({ fichasDelDueno: [otro] }).size).toBe(0)
  })
  it('la ficha del cliente manda sobre lo demás (por_abrir y abierta); un valor raro se ignora', () => {
    const dueno = [duenoApertura('guayaquil', 'sin abrir')]
    expect(estadoDeLasSedes({ config: { apify: { sedes_estado: { guayaquil: 'abierta' } } }, fichasDelDueno: dueno }).get('guayaquil')).toBe('abierta')
    expect(estadoDeLasSedes({ config: { apify: { sedes_estado: { quito: 'por_abrir', loja: 'hola' } } } }).get('quito')).toBe('por_abrir')
    expect(estadoDeLasSedes({ config: { apify: { sedes_estado: { loja: 'hola' } } } }).has('loja')).toBe(false)
  })
  it('un dato de la sede (campo estado) sirve; el más nuevo gana', () => {
    const d = (valor: string, en: string) => ({ clave: 'cuenca', campo: 'estado', valor_texto: valor, observado_en: en })
    expect(sedesPorAbrir({ datosDeSede: [d('por abrir', '2026-10-01')] }).has('cuenca')).toBe(true)
    expect(sedesPorAbrir({ datosDeSede: [d('por abrir', '2026-10-01'), d('abierta', '2026-10-10')] }).has('cuenca')).toBe(false)
    expect(sedesPorAbrir({ datosDeSede: [{ clave: 'cuenca', campo: 'horario', valor_texto: 'por abrir' }] }).size).toBe(0)
  })
  it('sin dato no hay sede por abrir', () => { expect(sedesPorAbrir({}).size).toBe(0); expect(sedesPorAbrir({ config: null, fichasDelDueno: [] }).size).toBe(0) })
  it('qué líneas son de horario o atención', () => {
    for (const l of ['abierto hasta 3pm', 'horario lunes a viernes 07:00–14:45', 'cierra a las 22', 'atención de lunes a sábado']) expect(esLineaDeHorarioOAtencion(l), l).toBe(true)
    for (const l of ['producto cafe pasado precio 2 00 usd', 'ceviche mixto 9 00 usd']) expect(esLineaDeHorarioOAtencion(l), l).toBe(false)
  })
})

const entrada = (extra: Partial<EntradaDelResumen> = {}): EntradaDelResumen => ({
  client_id: 'c1', nombre: 'Marisquería X', rubro: 'restaurante', ahora: AHORA, zona: [],
  sedes: [{ clave: 'guayaquil', ciudad: 'Guayaquil' }, { clave: 'olon', ciudad: 'Olón' }],
  fichas: [
    ficha('p1111111', 'precio', 'producto ceviche mixto precio 9 00 usd', { provenance_tag: enSede('guayaquil') }),
    ficha('h2222222', 'horario', 'abierto hasta 3pm', { provenance_tag: enSede('guayaquil'), observado_en: '2026-10-16T10:00:00Z', fecha_fuente: '2026-10-16' }),
    ficha('p3333333', 'precio', 'producto encebollado precio 3 50 usd', { provenance_tag: enSede('olon') }),
    ficha('h4444444', 'horario', 'abierto hasta 4pm', { provenance_tag: enSede('olon') }),
    duenoApertura('guayaquil', 'Guayaquil sin abrir'),
  ],
  ...extra,
})
const seccion = (t: string) => t.split('## Qué vende y a qué precio')[1].split('\n## ')[0]

describe('el resumen vivo con una sede por abrir', () => {
  it('SIN el dato: sale como antes (nada se rotula)', () => {
    const t = seccion(armarResumen(entrada()).texto)
    expect(t).not.toMatch(/por abrir/)
  })
  it('con el dato: el horario de la sede por abrir sale rotulado, el precio de esa sede se queda, y la sede abierta no cambia', () => {
    const t = seccion(armarResumen(entrada({ sedes_por_abrir: ['guayaquil'] })).texto)
    const l = t.split('\n').filter(Boolean)
    expect(l.find((x) => /ceviche mixto/.test(x))).toMatch(/^- \[sede guayaquil \(Guayaquil\) · por abrir\] producto ceviche mixto precio 9 00 usd \[ficha:p1111111/)
    expect(l.find((x) => /ceviche mixto/.test(x))).not.toMatch(/todavía no atiende/)
    expect(l.find((x) => /abierto hasta 3pm/.test(x))).toMatch(/\[sede guayaquil \(Guayaquil\) · por abrir\] abierto hasta 3pm — sede por abrir: todavía no atiende al público \[ficha:h2222222/)
    expect(l.find((x) => /abierto hasta 4pm/.test(x))).toMatch(/^- \[sede olon \(Olón\)\] abierto hasta 4pm \[ficha:h4444444/)
    expect(l.find((x) => /encebollado/.test(x))).not.toMatch(/por abrir/)
  })
  it('cada línea sigue citando su ficha (el pulido y la auditoría siguen funcionando)', () => {
    const t = armarResumen(entrada({ sedes_por_abrir: ['guayaquil'] })).texto
    for (const l of seccion(t).split('\n').filter((x) => x.startsWith('- '))) expect(l).toMatch(/\[ficha:[0-9a-z]{8} · /)
  })
  it('las líneas de la web sin sede no se tocan', () => {
    const e = entrada({ sedes_por_abrir: ['guayaquil'], fichas: [ficha('s5555555', 'horario', 'abierto de lunes a viernes')] })
    expect(armarResumen(e).texto).not.toMatch(/por abrir/)
  })
})

describe('el cargador del resumen lee el dato de las tres fuentes', () => {
  const tablas = (extra: Record<string, unknown[]> = {}) => ({
    cerebro_fichas: [{ id: 'dg111111-0000-0000-0000-000000000000', client_id: 'c1', clase: 'dato_del_dueno', titulo: 'apertura', contenido: 'Guayaquil sin abrir', atributo: 'dueno:apertura-sede', observado_en: '2026-10-16T00:00:00Z', retirada_en: null, descartada: false, provenance_tag: { datos: { sede: 'guayaquil', sedes: ['guayaquil'], tema_norm: 'apertura-sede', respuesta: 'Guayaquil sin abrir' } } }],
    client_sedes: [{ id: 's-gye', client_id: 'c1', clave: 'guayaquil', ciudad: 'Guayaquil' }, { id: 's-olon', client_id: 'c1', clave: 'olon', ciudad: 'Olón' }],
    client_sede_datos: [], ...extra,
  })
  const cargar = async (t: Record<string, unknown[]>, config?: unknown) => {
    const db = crearBaseFalsa(t as never).db as never
    const r = await cargarEntradaDelResumen(db, { client_id: 'c1', nombre: 'X', rubro: null, ahora: AHORA, zonas: [], sedes: [{ clave: 'guayaquil', ciudad: 'Guayaquil' }, { clave: 'olon', ciudad: 'Olón' }], config })
    if (!r.ok) throw new Error(r.detalle)
    return r.entrada
  }
  it('lo que dijo el dueño', async () => { expect((await cargar(tablas())).sedes_por_abrir).toEqual(['guayaquil']) })
  it('la ficha del cliente', async () => { expect((await cargar(tablas({ cerebro_fichas: [] }), { apify: { sedes_estado: { olon: 'por_abrir' } } })).sedes_por_abrir).toEqual(['olon']) })
  it('un dato de la sede', async () => { expect((await cargar(tablas({ cerebro_fichas: [], client_sede_datos: [{ id: 'x', client_id: 'c1', sede_id: 's-olon', campo: 'estado', valor_texto: 'por abrir', observado_en: '2026-10-10T00:00:00Z' }] }))).sedes_por_abrir).toEqual(['olon']) })
  it('sin nada: el campo no aparece', async () => { expect('sedes_por_abrir' in (await cargar(tablas({ cerebro_fichas: [] })))).toBe(false) })
})
