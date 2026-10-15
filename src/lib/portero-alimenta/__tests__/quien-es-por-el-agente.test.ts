/**
 * «Quién es» lo elige el agente del pulido (15-oct · firma de Emilio) · el armado por código entrega VARIOS candidatos; `reporting_agent` razona cuál describe al negocio y deja 1–3 líneas
 * citadas; el código sigue impidiendo que agregue hechos; si falla, «Quién es» queda por código. El tope del pulido sube a US$ 0,05 solo tras 3 días seguidos sobre US$ 0,03.
 * US$ 0 · sin red · 3 rubros (tuteo y voseo).
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { TOPE_ALTO_DEL_PULIDO_USD, TOPE_DEL_PULIDO_USD } from '../datos'
import { agenteDelRoster } from '../entorno'
import { armarResumen, fichasDeResumen, type FichaParaResumen } from '../resumen-vivo'
import { armarTareaDelPulido, MAX_LINEAS_DE_QUIEN_ES, pulirResumen, topeDelPulido, validarPulido } from '../resumen-pulido'
import { crearBaseFalsa } from './base-falsa'
import { ALTA, CASOS, REAL, tablas } from './fixtures-despertar'

const C = '99999999-9999-4999-8999-999999999999'
const HOY = new Date('2026-10-15T13:00:00Z')
const f = (id: string, clase: string, contenido: string, extra: Partial<FichaParaResumen> = {}): FichaParaResumen => ({
  id, clase, titulo: `${clase} · ${id.slice(0, 4)}`, contenido, atributo: extra.atributo ?? null, observado_en: '2026-10-15T12:31:00Z', fecha_fuente: '2026-10-14',
  vigente_hasta: null, retirada_en: null, provenance_tag: {}, creado_en: extra.creado_en ?? '2026-10-14T10:00:00Z',
})
/** ids con prefijo «aaaaaaaa» distinto en el 8.º carácter, para que cada cita sea única */
const id8 = (n: number) => `aaaaaaa${n.toString(16).slice(-1)}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
const RUBROS = [
  { rubro: 'restaurante de mariscos', nombre: 'Náufrago', desc: 'Cocina costeña de mariscos frescos del día frente al mar con terraza para toda la familia', voz: 'tuteo' as const },
  { rubro: 'clínica dental', nombre: 'Clínica Sonrisa Norte', desc: 'Clínica odontológica familiar con ortodoncia, implantes y limpieza para que sonrías sin miedo, vení cuando quieras', voz: 'voseo' as const },
  { rubro: 'software B2B', nombre: 'Flujo CRM', desc: 'Software de CRM y facturación electrónica para pymes que quieren vender más con menos trabajo manual', voz: 'tuteo' as const },
]
// el sitio, en el orden en que se leyó: primero formularios y ruido, la descripción real recién en sexto lugar
const sitioRuidoso = (desc: string): FichaParaResumen[] => [
  f(id8(1), 'sitio', 'Correo electrónico del cliente', { creado_en: '2026-10-14T10:00:01Z' }),
  f(id8(2), 'sitio', 'Número de teléfono formato internacional sin espacios', { creado_en: '2026-10-14T10:00:02Z' }),
  f(id8(3), 'sitio', 'Escribe tu nombre completo tal como aparece en tu documento', { creado_en: '2026-10-14T10:00:03Z' }),
  f(id8(4), 'sitio', 'Política de privacidad y tratamiento de datos personales de los usuarios', { creado_en: '2026-10-14T10:00:04Z' }),
  f(id8(5), 'sitio', 'Elige la fecha y la hora que prefieres para tu visita al local', { creado_en: '2026-10-14T10:00:05Z' }),
  f(id8(6), 'sitio', desc, { creado_en: '2026-10-14T10:00:06Z' }),
]
const entrada = (r: (typeof RUBROS)[number], extra: FichaParaResumen[] = []) => ({
  client_id: C, nombre: r.nombre, rubro: r.rubro, ahora: HOY, zona: [], sedes: [],
  fichas: [...sitioRuidoso(r.desc), f('bbbbbbbb-0000-4000-8000-000000000002', 'precio', 'Menú del día 6 dólares'), f('cccccccc-0000-4000-8000-000000000003', 'mapas', 'nombre ' + r.nombre, { atributo: 'mapas:nombre' }), ...extra],
})
const quien = (t: string) => t.split('## Qué vende')[0]
const delAgente = (tarea: string) => tarea.split('RESUMEN ARMADO:\n')[1]

describe.each(RUBROS)('los candidatos de «Quién es» · $rubro ($voz)', (r) => {
  it('el texto del agente trae la descripción real entre los candidatos; el de código, las 3 primeras de siempre', () => {
    const s = fichasDeResumen(entrada(r))
    expect(quien(s.texto_para_el_agente)).toContain(r.desc.slice(0, 40))
    expect(quien(s.cliente.contenido)).not.toContain(r.desc.slice(0, 40)) // «como hoy»: la descripción no llega a las 3 primeras
    expect(s.cliente.contenido).toBe(armarResumen(entrada(r)).texto)
  })
  it('los candidatos excluyen lo legal y lo cortísimo', () => {
    const t = quien(armarResumen(entrada(r), { candidatos: true }).texto)
    expect(t).not.toMatch(/privacidad/i)
    expect(t).not.toMatch(/Correo electr/)
  })
  it('no pasa de 10 candidatos del sitio', () => {
    const muchos = Array.from({ length: 30 }, (_v, i) => f(`aaaaaa${String(10 + i)}-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, 'sitio', `Texto largo número ${i} con palabras suficientes para contar como candidato válido`, { creado_en: `2026-10-14T11:00:${String(i).padStart(2, '0')}Z` }))
    const t = quien(armarResumen({ ...entrada(r), fichas: muchos }, { candidatos: true }).texto)
    expect(t.split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(10)
  })
})

describe.each(RUBROS)('el agente elige · $rubro ($voz)', (r) => {
  const s = fichasDeResumen(entrada(r))
  const A = s.texto_para_el_agente
  const R = s.cliente.contenido
  const esDelSitio = (l: string) => /^- /.test(l) && /\[ficha:aaaaaaa/.test(l)
  /** un agente que razona: deja SOLO la descripción real (y el perfil, el resto de las secciones tal cual) */
  const elige = (tarea: string) => delAgente(tarea).split('\n').filter((l) => !esDelSitio(l) || l.includes(r.desc.slice(0, 30))).join('\n')
  it('deja la descripción real, saca los formularios y NO choca con la regla del 80 %', async () => {
    const res = await pulirResumen(A, { llamarAgente: async (t) => ({ texto: elige(t), costo_usd: 0.015 }), topeUsd: 0.03 }, R)
    expect(res.usado).toBe(true)
    expect(quien(res.texto)).toContain(r.desc.slice(0, 40))
    expect(quien(res.texto)).not.toMatch(/Escribe tu nombre|Elige la fecha/)
    expect(res.texto).toContain('Menú del día 6 dólares')
  })
  it('lo que agrega en «Quién es» sin que esté en la ficha citada se descarta', async () => {
    const texto = elige(armarTareaDelPulido(A)) + '\n'
    const con = texto.replace('## Qué vende', '- Fundado en 1998 por tres hermanos [ficha:aaaaaaa6 · 2026-10-14]\n\n## Qué vende')
    const res = await pulirResumen(A, { llamarAgente: async () => ({ texto: con, costo_usd: 0.015 }), topeUsd: 0.03 }, R)
    expect(res.texto).not.toContain('Fundado en 1998')
    expect(res.descartadas.some((d) => /cifra|palabras/.test(d.por_que))).toBe(true)
  })
  it('una línea sin cita en «Quién es» se descarta', async () => {
    const con = elige(armarTareaDelPulido(A)).replace('## Qué vende', '- Un negocio muy querido en la zona\n\n## Qué vende')
    const res = await pulirResumen(A, { llamarAgente: async () => ({ texto: con, costo_usd: 0.015 }), topeUsd: 0.03 }, R)
    expect(res.texto).not.toContain('muy querido')
    expect(res.descartadas.some((d) => d.por_que === 'sin cita')).toBe(true)
  })
  it('si deja «Quién es» sin ninguna línea válida, entra la de código (nunca vacía)', async () => {
    const sinQuien = delAgente(armarTareaDelPulido(A)).split('\n').filter((l) => !/^- /.test(l) || !/\[ficha:(aaaaaaa|cccccccc)/.test(l)).join('\n')
    const res = await pulirResumen(A, { llamarAgente: async () => ({ texto: sinQuien, costo_usd: 0.015 }), topeUsd: 0.03 }, R)
    expect(res.usado).toBe(true)
    expect(quien(res.texto)).toMatch(/## Quién es/)
    expect(quien(res.texto).split('\n').filter((l) => l.startsWith('- ')).length).toBeGreaterThan(0)
  })
  it('más de 6 líneas en «Quién es»: las que sobran se descartan', async () => {
    const lineas = Array.from({ length: 7 }, () => `- ${r.desc.slice(0, 60)} [ficha:aaaaaaa6 · 2026-10-14]`).join('\n')
    const base = delAgente(armarTareaDelPulido(A))
    const i0 = base.indexOf('## Quién es'), i1 = base.indexOf('## Qué vende')
    const texto = base.slice(0, i0) + base.slice(i0, base.indexOf('\n', i0) + 1) + lineas + '\n\n' + base.slice(i1)
    const v = validarPulido(A, texto, R)
    expect(quien(v.texto).split('\n').filter((l) => l.startsWith('- ')).length).toBeLessThanOrEqual(MAX_LINEAS_DE_QUIEN_ES)
    expect(v.descartadas.some((d) => /más líneas de las que caben/.test(d.por_que))).toBe(true)
  })
  it('fuera de «Quién es» la regla del 80 % sigue: si pierde precios y cifras, no se usa', async () => {
    const poco = delAgente(armarTareaDelPulido(A)).split('\n').filter((l) => !l.includes('Menú del día') && !l.includes('[ficha:cccccccc') && !l.includes('[ficha:bbbbbbbb')).join('\n')
    const res = await pulirResumen(A, { llamarAgente: async () => ({ texto: poco, costo_usd: 0.015 }), topeUsd: 0.03 }, R)
    expect(res.usado).toBe(false); expect(res.texto).toBe(R)
  })
  it('si el agente falla, queda el armado por código TAL COMO HOY, no el de candidatos', async () => {
    const res = await pulirResumen(A, { llamarAgente: async () => { throw new Error('run-sdk respondió 500') }, topeUsd: 0.03 }, R)
    expect(res.usado).toBe(false); expect(res.texto).toBe(R)
    expect(quien(res.texto)).not.toContain(r.desc.slice(0, 40))
  })
  it('si pasa el tope, tampoco se usa y queda el armado por código', async () => {
    const res = await pulirResumen(A, { llamarAgente: async (t) => ({ texto: elige(t), costo_usd: 0.2 }), topeUsd: 0.03 }, R)
    expect(res.usado).toBe(false); expect(res.texto).toBe(R); expect(res.paso_del_tope_base).toBe(true)
  })
  it('«pasó del tope base» se marca al pasar de US$ 0,03 aunque el tope vigente sea 0,05', async () => {
    const res = await pulirResumen(A, { llamarAgente: async (t) => ({ texto: elige(t), costo_usd: 0.04 }), topeUsd: 0.05 }, R)
    expect(res.usado).toBe(true); expect(res.paso_del_tope_base).toBe(true)
    const bajo = await pulirResumen(A, { llamarAgente: async (t) => ({ texto: elige(t), costo_usd: 0.02 }), topeUsd: 0.05 }, R)
    expect(bajo.paso_del_tope_base).toBe(false)
  })
  it('un corte por presupuesto del corredor cuenta como «pasó del tope»', async () => {
    const res = await pulirResumen(A, { llamarAgente: async () => { throw new Error('error_max_budget_usd: se alcanzó el presupuesto') }, topeUsd: 0.03 }, R)
    expect(res.paso_del_tope_base).toBe(true)
  })
})

describe('el tope sube a US$ 0,05 solo tras 3 días seguidos sobre 0,03', () => {
  const fila = (dia: string, paso: boolean | null) => ({ client_id: C, dia, estado: 'hecha', resumen: paso === null ? {} : { resumen_vivo: { pulido: { paso_del_tope_base: paso } } } })
  const tope = async (filas: unknown[], o: { fallaEn?: string } = {}) => topeDelPulido(crearBaseFalsa({ cerebro_portero_corridas: filas } as never, o).db as never, C, HOY)
  it('base: sin historia', async () => { expect(await tope([])).toMatchObject({ tope_usd: TOPE_DEL_PULIDO_USD, subido: false }) })
  it('3 días seguidos (14, 13, 12) sobre el tope ⇒ 0,05', async () => {
    expect(await tope([fila('2026-10-14', true), fila('2026-10-13', true), fila('2026-10-12', true)])).toMatchObject({ tope_usd: TOPE_ALTO_DEL_PULIDO_USD, subido: true, dias_sobre_el_tope: 3 })
  })
  it('solo 2 días ⇒ 0,03', async () => {
    expect(await tope([fila('2026-10-14', true), fila('2026-10-13', true)])).toMatchObject({ tope_usd: 0.03, subido: false, dias_sobre_el_tope: 2 })
  })
  it('un día en medio por debajo del tope ⇒ 0,03', async () => {
    expect(await tope([fila('2026-10-14', true), fila('2026-10-13', false), fila('2026-10-12', true)])).toMatchObject({ tope_usd: 0.03 })
  })
  it('un día sin pulido o sin fila corta la racha', async () => {
    expect((await tope([fila('2026-10-14', true), fila('2026-10-13', null), fila('2026-10-12', true)])).tope_usd).toBe(0.03)
    expect((await tope([fila('2026-10-14', true), fila('2026-10-12', true), fila('2026-10-11', true)])).tope_usd).toBe(0.03)
  })
  it('la fila de HOY no cuenta (solo los 3 días anteriores)', async () => {
    expect((await tope([fila('2026-10-15', true), fila('2026-10-14', true), fila('2026-10-13', true)])).tope_usd).toBe(0.03)
  })
  it('una lectura que falla deja el tope base: nunca sube por duda', async () => {
    expect((await tope([fila('2026-10-14', true), fila('2026-10-13', true), fila('2026-10-12', true)], { fallaEn: 'cerebro_portero_corridas' })).tope_usd).toBe(0.03)
  })
  it('el corredor recibe el tope vigente como presupuesto de la llamada', async () => {
    const vistos: Array<Record<string, unknown>> = []
    const fn = agenteDelRoster({ origen: 'https://x.example', llaveInterna: 'k', workflowId: 'wf', ejecucionId: 'ex', clientId: C, agente: 'reporting_agent', topeUsd: 0.03, fetchImpl: async (_u, i) => { vistos.push(JSON.parse(String(i?.body))); return { ok: true, status: 200, json: async () => ({ response: 'x', cost_usd: 0.01 }) } as Response } })
    await fn('t'); await fn('t', { topeUsd: 0.05 })
    expect(vistos.map((v) => v.max_budget_usd)).toEqual([0.03, 0.05])
  })
})

describe.each(CASOS)('dentro de la corrida · $nombre', (c) => {
  const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true, resumen_vivo: true, resumen_pulido: true }
  const previos = (paso: boolean) => ['2026-10-14', '2026-10-13', '2026-10-12'].map((dia) => ({ client_id: c.id, dia, estado: 'hecha', resumen: { resumen_vivo: { pulido: { paso_del_tope_base: paso } } } }))
  async function correr(paso: boolean | null, costo = 0.02) {
    const t = tablas(c)
    ;(t.cerebro_fichas as Array<Record<string, unknown>>).push(
      { id: 'aaaaaaaa-1111-4111-8111-111111111111', client_id: c.id, clase: 'sitio', titulo: 'Sitio', contenido: 'Descripción real del negocio con productos y servicios para sus clientes', atributo: null, observado_en: '2026-10-15T12:00:00Z', fecha_fuente: '2026-10-14', vigente_hasta: null, retirada_en: null, descartada: false, provenance_tag: {}, creado_en: '2026-10-15T12:00:00Z' })
    if (paso !== null) (t.cerebro_portero_corridas as Array<Record<string, unknown>>).push(...previos(paso))
    const base = crearBaseFalsa(t as never)
    const topes: Array<number | undefined> = []
    const r = await alimentarCliente({ db: base.db, client_id: c.id, ...REAL, interruptores: ON, ahora: ALTA, pulirResumen: async (tarea, o) => { topes.push(o?.topeUsd); return { texto: tarea.split('RESUMEN ARMADO:\n')[1], costo_usd: costo } } })
    return { r, topes }
  }
  it('sin historia: tope 0,03', async () => {
    const x = await correr(null)
    expect(x.topes).toEqual([0.03]); expect(x.r.resumen_vivo?.pulido).toMatchObject({ tope_usd: 0.03, tope_subido: false, paso_del_tope_base: false })
  })
  it('con 3 días seguidos sobre el tope: 0,05 y queda dicho en el rastro', async () => {
    const x = await correr(true, 0.04)
    expect(x.topes).toEqual([0.05])
    expect(x.r.resumen_vivo?.pulido).toMatchObject({ tope_usd: 0.05, tope_subido: true, paso_del_tope_base: true, usado: true })
  })
  it('con historia por debajo del tope: 0,03', async () => {
    const x = await correr(false)
    expect(x.topes).toEqual([0.03])
  })
})

describe('límites de los candidatos y entrega real al agente', () => {
  const r = RUBROS[0]
  const sitio = (n: number, texto: string) => f(`aaaaaa${String(n).padStart(2, '0')}-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, 'sitio', texto, { creado_en: `2026-10-14T11:00:${String(n).padStart(2, '0')}Z` })
  const lineas = (t: string) => quien(t).split('\n').filter((l) => l.startsWith('- '))
  it('hay exactamente 10 candidatos cuando sobran fichas válidas (no se corta en 8)', () => {
    const fichas = Array.from({ length: 14 }, (_v, i) => sitio(i, `Texto descriptivo número ${i} del negocio con suficientes palabras para ser candidato`))
    expect(lineas(armarResumen({ ...entrada(r), fichas }, { candidatos: true }).texto)).toHaveLength(10)
    expect(lineas(armarResumen({ ...entrada(r), fichas }).texto)).toHaveLength(3) // por código: las 3 de siempre
  })
  it('un texto de 5 palabras o de página entera (más de 45) no es candidato', () => {
    const largo = Array.from({ length: 60 }, (_v, i) => `palabra${i}`).join(' ')
    const fichas = [sitio(1, 'Solo cinco palabras aquí hay'), sitio(2, largo), sitio(3, 'Una descripción normal del negocio con palabras suficientes para contar')]
    const t = lineas(armarResumen({ ...entrada(r), fichas }, { candidatos: true }).texto).join('\n')
    expect(t).not.toContain('Solo cinco palabras')
    expect(t).not.toContain('palabra59')
    expect(t).toContain('descripción normal')
  })
  it('la corrida le entrega al agente el texto CON candidatos (la descripción que por código no entraría)', async () => {
    const c = CASOS[0]
    const t = tablas(c)
    const ruido = ['Correo electrónico del cliente', 'Número de teléfono formato internacional sin espacios', 'Escribe tu nombre completo tal como aparece en tu documento', 'Elige la fecha y la hora que prefieres para tu visita al local', 'Cuéntanos qué quieres pedir hoy para que lo preparemos']
    ;[...ruido, 'Cocina de la casa con productos frescos preparados cada día para toda la familia'].forEach((texto, i) => {
      ;(t.cerebro_fichas as Array<Record<string, unknown>>).push({ id: `bbbbbb${String(i).padStart(2, '0')}-1111-4111-8111-111111111111`, client_id: c.id, clase: 'sitio', titulo: 'Sitio', contenido: texto, atributo: null, observado_en: '2026-10-15T12:00:00Z', fecha_fuente: '2026-10-14', vigente_hasta: null, retirada_en: null, descartada: false, provenance_tag: {}, creado_en: `2026-10-14T09:00:0${i}Z` })
    })
    const base = crearBaseFalsa(t as never)
    const tareas: string[] = []
    await alimentarCliente({ db: base.db, client_id: c.id, ...REAL, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true, resumen_vivo: true, resumen_pulido: true }, ahora: ALTA, pulirResumen: async (tarea) => { tareas.push(tarea); throw new Error('fuera') } })
    expect(tareas).toHaveLength(1)
    expect(tareas[0]).toContain('Cocina de la casa con productos frescos')
  })
})
