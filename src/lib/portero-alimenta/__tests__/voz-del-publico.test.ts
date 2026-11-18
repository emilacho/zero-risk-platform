/**
 * La voz del público por la consulta del cerebro (encargo 5 · parte B): por cliente y por tipo de público, con fuente, fecha y vigencia,
 * sin datos de personas privadas. Con la base falsa del portero y los diez clientes sintéticos. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { rutaConsultar } from '../consultar'
import { REGLA_DE_PRIVACIDAD, VOZ_POR_TIPO, clasesDelPublico, declaracionDelPublico, redDeLaFicha, textoSinPersonas, tipoDePublico } from '../voz-del-publico'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA } from './fixtures-despertar'

type Fila = Record<string, unknown>
let n = 0
const F = (c: ClienteSintetico, clase: string, o: Fila = {}): Fila => ({
  id: `v-${String(++n).padStart(5, '0')}`, client_id: c.id, ref: `portero:${n}`, clase, atributo: '', titulo: `${clase} · ${n}`, que_es: '', contenido: `voz ${n} de ${clase}`,
  observado_en: '2026-10-14T10:00:00Z', fecha_fuente: '2026-10-13T08:00:00Z', vigente_hasta: '2026-12-01T00:00:00Z', alcance: 'cliente', origen: 'tercero', ...o,
})
const mundo = (c: ClienteSintetico, fichas: Fila[]): T => ({ ...tablasDe(c), cerebro_fichas: fichas, cerebro_consultas: [], cerebro_pedidos: [], agents: [] })
type Res = { ficha_id: string; clase: string; contenido: string; titulo: string | null; fuente: string; red: string | null; tipo_de_publico: string; fecha_de_la_fuente: string | null; vigente_hasta: string | null; vencida: boolean; datos_personales_omitidos: boolean; procedencia: Fila }
type Cuerpo = { status: number; body: { resultados: Res[]; voz_del_publico?: Fila; error?: string; clase?: string; siguiente_desde?: number | null } }
const leer = async (c: ClienteSintetico, fichas: Fila[], p: Fila) => (await rutaConsultar({ db: crearBaseFalsa(mundo(c, fichas) as never).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'perfil', agente: 'feedback-synthesizer', ...p })) as unknown as Cuerpo

const TODAS = ['resenas', 'comentarios', 'mencion', 'competidor_comentarios', 'foro']
const surtido = (c: ClienteSintetico): Fila[] => [...TODAS.map((k) => F(c, k)), F(c, 'precio'), F(c, 'sitio'), F(c, 'comentarios_algo'), F(c, 'competidor_evaluacion')]

describe('voz del público · qué clases entrega cada tipo', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: consumo = reseñas, comentarios propios, menciones y comentarios en la competencia; profesional = con foros y sin la competencia`, async () => {
      const fichas = surtido(c)
      const co = await leer(c, fichas, { publico: 'consumo', todo: true })
      expect(co.status).toBe(200)
      expect(co.body.resultados.map((r) => r.clase).sort()).toEqual(['comentarios', 'competidor_comentarios', 'mencion', 'resenas'])
      const pr = await leer(c, fichas, { publico: 'profesional', todo: true })
      expect(pr.body.resultados.map((r) => r.clase).sort()).toEqual(['comentarios', 'foro', 'mencion', 'resenas'])
    })
  }
  it('las clases son exactas: ni un prefijo («comentarios_algo») ni el texto libre meten otra cosa', async () => {
    const c = DIEZ_CLIENTES[0]
    const fichas = [F(c, 'comentarios_algo', { contenido: 'encebollado delicioso' }), F(c, 'precio', { contenido: 'encebollado delicioso a 5 dólares' }), F(c, 'resenas', { contenido: 'encebollado delicioso' })]
    // control: sin público, el texto libre sí encuentra las tres
    expect((await leer(c, fichas, { que: 'encebollado delicioso', todo: true })).body.resultados).toHaveLength(3)
    const r = await leer(c, fichas, { publico: 'consumo', que: 'encebollado delicioso', todo: true })
    expect(r.body.resultados.map((x) => x.clase)).toEqual(['resenas'])
  })
  it('sin `que` alcanza con el público; un público inválido o clases ajenas → 400', async () => {
    const c = DIEZ_CLIENTES[0]
    expect((await leer(c, surtido(c), { publico: 'consumo' })).status).toBe(200)
    // con clase y texto libre válidos: el 400 lo da el público o las clases, no la falta de algo que buscar
    const malo = await leer(c, surtido(c), { publico: 'empresas', clase: 'resenas', que: 'voz' })
    expect(malo.status).toBe(400)
    expect(String((malo.body as unknown as Fila).detalle)).toContain('`publico` debe ser consumo o profesional')
    const ajena = await leer(c, surtido(c), { publico: 'consumo', clase: 'precio', que: 'voz' })
    expect(ajena.status).toBe(400)
    expect(String((ajena.body as unknown as Fila).detalle)).toContain('ninguna de las clases pedidas es voz del público consumo')
    expect((await leer(c, surtido(c), { publico: 'profesional', clase: 'competidor_comentarios', que: 'voz' })).status).toBe(400)
  })
  it('con `clase` se queda solo con las comunes al público', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, surtido(c), { publico: 'consumo', clase: 'resenas,foro', todo: true })
    expect(r.body.resultados.map((x) => x.clase)).toEqual(['resenas'])
    expect(r.body.clase).toBe('resenas')
  })
  it('sin `publico` la consulta no cambia: ni campos de voz ni declaración', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, [F(c, 'mencion', { contenido: 'hola @alguien etiquetado pepe' })], { clase: 'mencion' })
    expect(r.body.voz_del_publico).toBeUndefined()
    expect(r.body.resultados[0].contenido).toBe('hola @alguien etiquetado pepe')
    expect('fuente' in r.body.resultados[0]).toBe(false)
  })
  it('las tablas de VOZ_POR_TIPO son las acordadas con CC3', () => {
    expect(VOZ_POR_TIPO).toEqual({ consumo: ['resenas', 'comentarios', 'mencion', 'competidor_comentarios'], profesional: ['resenas', 'comentarios', 'mencion', 'foro'] })
    expect(tipoDePublico(' consumo ')).toBe('consumo')
    expect(tipoDePublico('Consumo')).toBeNull()
    expect(clasesDelPublico('profesional', '')).toEqual(['resenas', 'comentarios', 'mencion', 'foro'])
  })
})

describe('voz del público · cada pieza con fuente, fecha, vigencia y red', () => {
  it('trae su fuente legible, su fecha de la fuente, su vigencia (vencida rotulada) y el tipo de público', async () => {
    const c = DIEZ_CLIENTES[1]
    const r = await leer(c, [F(c, 'resenas'), F(c, 'comentarios', { vigente_hasta: '2026-01-01T00:00:00Z' })], { publico: 'consumo', todo: true })
    const re = r.body.resultados.find((x) => x.clase === 'resenas')!
    const co = r.body.resultados.find((x) => x.clase === 'comentarios')!
    expect(re.fuente).toBe('reseña')
    expect(co.fuente).toBe('comentario en una publicación propia')
    expect(re.fecha_de_la_fuente).toBe('2026-10-13T08:00:00Z')
    expect(re.vencida).toBe(false)
    expect(co.vencida).toBe(true)
    expect(re.tipo_de_publico).toBe('consumo')
    expect(r.body.resultados.at(-1)?.clase).toBe('comentarios') // las vencidas al final, igual que en toda consulta
  })
  it('los comentarios de TikTok traen su red (de la procedencia de la ficha)', async () => {
    const c = DIEZ_CLIENTES[2]
    const r = await leer(c, [F(c, 'competidor_comentarios', { provenance_tag: { source: 'brazo_comentarios', datos: { red: 'TikTok', cuenta: 'pepe' } } }), F(c, 'resenas')], { publico: 'consumo', todo: true })
    expect(r.body.resultados.find((x) => x.clase === 'competidor_comentarios')?.red).toBe('tiktok')
    expect(r.body.resultados.find((x) => x.clase === 'resenas')?.red).toBeNull()
    expect(redDeLaFicha(null)).toBeNull()
  })
})

describe('voz del público · personas privadas: nunca nombre ni cuenta de quien comenta', () => {
  it('quita @usuarios, correos y teléfonos del texto y del título, y lo marca', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, [F(c, 'comentarios', { titulo: 'comentario de @juanito_88', contenido: 'muy rico @maria.p escríbeme a ana@correo.com o al 0991234567' })], { publico: 'consumo' })
    const x = r.body.resultados[0]
    expect(x.contenido).not.toMatch(/maria|ana@|0991234567/)
    expect(x.contenido).toContain('[usuario omitido]')
    expect(x.titulo).not.toContain('juanito')
    expect(x.datos_personales_omitidos).toBe(true)
    expect(r.body.voz_del_publico?.voces_con_datos_omitidos).toBe(1)
  })
  it('en las menciones corta la lista «etiquetado …» de cuentas etiquetadas', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, [F(c, 'mencion', { contenido: 'el mejor encebollado de la zona etiquetado helenvat72 timo reposteriabrunch' })], { publico: 'consumo' })
    expect(r.body.resultados[0].contenido).toBe('el mejor encebollado de la zona')
    expect(r.body.resultados[0].datos_personales_omitidos).toBe(true)
  })
  it('una voz sin datos personales queda igual y sin marca', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, [F(c, 'resenas', { contenido: 'excelente salsa picante casera' })], { publico: 'consumo' })
    expect(r.body.resultados[0].contenido).toBe('excelente salsa picante casera')
    expect(r.body.resultados[0].datos_personales_omitidos).toBe(false)
    expect(r.body.voz_del_publico?.voces_con_datos_omitidos).toBe(0)
  })
  it('la limpieza va ANTES del recorte: un @usuario partido por el corte no deja su comienzo', async () => {
    const c = DIEZ_CLIENTES[0]
    // el corte (700) cae justo después de «@a»: si se recortara primero, «@a» (un solo carácter) ya no parecería usuario y quedaría
    const r = await leer(c, [F(c, 'comentarios', { contenido: `${'a'.repeat(697)} @abcdef fin` })], { publico: 'consumo' })
    expect(r.body.resultados[0].contenido).not.toContain('@a')
  })
  it('con contenido_completo la voz llega entera y limpia (no se recorta antes de limpiar)', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, [F(c, 'comentarios', { contenido: `${'b'.repeat(800)} @pepe fin` })], { publico: 'consumo', contenido_completo: true })
    expect(r.body.resultados[0].contenido).toBe(`${'b'.repeat(800)} [usuario omitido] fin`)
  })
  it('«etiquetado» solo corta en las menciones; en otra clase el texto sigue', () => {
    expect(textoSinPersonas('comentarios', 'quedó etiquetado como el mejor')).toEqual({ texto: 'quedó etiquetado como el mejor', omitido: false })
    expect(textoSinPersonas('mencion', 'Etiquetados ana pepe')).toEqual({ texto: '', omitido: true })
    expect(textoSinPersonas('mencion', 'sin lista')).toEqual({ texto: 'sin lista', omitido: false })
  })
  it('la procedencia no lleva datos de autor (solo canal, url de la fuente, etc.)', async () => {
    const c = DIEZ_CLIENTES[0]
    const r = await leer(c, [F(c, 'competidor_comentarios', { provenance_tag: { source: 'brazo_comentarios', datos: { red: 'instagram', comentarios: [{ autor: 'pepito', texto: 'x' }], autor: 'pepito', ownerUsername: 'pepito' } } })], { publico: 'consumo' })
    expect(JSON.stringify(r.body.resultados[0].procedencia)).not.toContain('pepito')
  })
})

describe('voz del público · lo que falta se declara', () => {
  it('declara la regla de privacidad, las clases leídas y las que no tienen material; LinkedIn siempre para el profesional', async () => {
    const c = DIEZ_CLIENTES[3]
    const co = await leer(c, [F(c, 'resenas')], { publico: 'consumo', todo: true })
    expect(co.body.voz_del_publico).toMatchObject({ publico: 'consumo', clases_del_publico: ['resenas', 'comentarios', 'mencion', 'competidor_comentarios'], clases_sin_material: ['comentarios', 'mencion', 'competidor_comentarios'], fuentes_que_el_cerebro_no_junta: [], privacidad: REGLA_DE_PRIVACIDAD })
    const pr = await leer(c, [F(c, 'resenas')], { publico: 'profesional', todo: true })
    expect(pr.body.voz_del_publico).toMatchObject({ clases_sin_material: ['comentarios', 'mencion', 'foro'], fuentes_que_el_cerebro_no_junta: ['linkedin'] })
  })
  it('con la lectura cortada en páginas no declara faltante lo que podría venir en la siguiente', async () => {
    const c = DIEZ_CLIENTES[0]
    const fichas = Array.from({ length: 12 }, () => F(c, 'resenas'))
    const r = await leer(c, fichas, { publico: 'consumo' })
    expect(r.body.siguiente_desde).toBe(10)
    expect(r.body.voz_del_publico?.clases_sin_material).toEqual([])
    const r2 = await leer(c, fichas, { publico: 'consumo', desde: 10 })
    expect(r2.body.voz_del_publico?.clases_sin_material).toEqual([])
  })
  it('declaracionDelPublico sin corte declara lo que no vino', () => {
    expect(declaracionDelPublico('consumo', ['resenas', 'mencion'], [{ clase: 'resenas' }], false).clases_sin_material).toEqual(['mencion'])
    expect(declaracionDelPublico('consumo', ['resenas', 'mencion'], [{ clase: 'resenas' }], true).clases_sin_material).toEqual([])
  })
  it('es solo lectura: la única escritura es el registro de quién consultó', async () => {
    const c = DIEZ_CLIENTES[0]
    const b = crearBaseFalsa(mundo(c, surtido(c)) as never)
    await rutaConsultar({ db: b.db as never, ahora: AHORA }, { client_id: c.id, oficina: 'perfil', agente: 'feedback-synthesizer', publico: 'consumo' })
    expect(b.escrituras.map((w) => `${w.op}:${w.tabla}`)).toEqual(['insert:cerebro_consultas'])
  })
})
