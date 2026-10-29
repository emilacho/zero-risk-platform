/**
 * EL APRENDIZAJE DEL DUEÑO (29-oct · firma de Emilio «DALE» · RAG reutilizando el del cerebro) · US$ 0, sin red: modelo, huellas y base simulados.
 * Se prueba con los DIEZ clientes de prueba (rubros distintos): desmenuzar → fichas en sus espacios → consolidar (juntar, choque, promoción, desuso) → consultar por especialista.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIEZ_CLIENTES } from '../../__tests__/diez-clientes.fixtures'
import { corridaQueSeRevisa } from '../../modo'
import { consolidar, gana, type Nota } from '../consolidar'
import { consultarAprendizaje } from '../consultar'
import { CATALOGO_DE_ARRANQUE, ESPACIO_GENERAL, espacioDeCliente, espacioDeIndustria, esConsultanteExcluido, parametrosDelEntorno, PARAMETROS_POR_OMISION } from '../datos'
import { leerIdeas, promptDeDesmenuzar } from '../desmenuzar'
import { registrarMedida, resumirMedidas } from '../medidas'
import { procesarAprendizaje } from '../procesar'
import { crearBaseMini } from './dbmini'

type Fila = Record<string, unknown>
const AHORA = new Date('2026-10-29T16:00:00.000Z')
const CAT = CATALOGO_DE_ARRANQUE

describe('desmenuzar · las guardas del código (el modelo propone, el código verifica)', () => {
  const comentario = 'No uses emojis en los títulos. Para todos mis negocios quiero un tono cercano.'
  const idea = (o: Fila = {}) => ({ idea: 'No usar emojis en los títulos', sobre: 'emojis', atributo: 'tono', destinatario: 'texto', direccion: 'evitar', alcance: 'cliente', cita: 'No uses emojis en los títulos', ...o })
  const leer = (ideas: Fila[], rubro: string | null = 'pizzería') => leerIdeas(JSON.stringify({ ideas }), { comentario, catalogo: CAT, rubro })

  it('el prompt lleva el catálogo (dato) y el comentario literal', () => {
    const p = promptDeDesmenuzar({ comentario, rubro: 'pizzería', formato: null, catalogo: { destinatarios: ['texto', 'x_nuevo'], atributos: ['tono'] } })
    expect(p.system).toContain('x_nuevo'); expect(p.texto).toContain(comentario)
  })
  it('una cita que NO está en el comentario se cambia por el comentario (no se inventa un respaldo)', () => {
    const r = leer([idea({ cita: 'frase que el dueño nunca dijo' })])
    expect(r.ideas[0].cita).toBe(comentario)
    expect(leer([idea()]).ideas[0].cita).toBe('No uses emojis en los títulos')
  })
  it('el alcance por omisión es CLIENTE: subir exige la frase del dueño y que esté en su comentario', () => {
    expect(leer([idea({ alcance: 'general' })]).ideas[0].alcance).toBe('cliente')
    expect(leer([idea({ alcance: 'general', evidencia_de_alcance: 'algo que no dijo' })]).ideas[0].alcance).toBe('cliente')
    expect(leer([idea({ alcance: 'general', evidencia_de_alcance: 'Para todos mis negocios' })]).ideas[0].alcance).toBe('general')
    expect(leer([idea({ alcance: 'industria', evidencia_de_alcance: 'Para todos mis negocios' })], null).ideas[0].alcance).toBe('cliente') // sin rubro no hay espacio de industria
    expect(leer([idea({ alcance: 'formato', evidencia_de_alcance: 'Para todos mis negocios' })]).ideas[0].alcance).toBe('cliente') // formato sin formato
  })
  it('atributo nuevo = se acepta y se marca como propuesto; destinatario desconocido cae a «direccion»; basura ilegible se dice', () => {
    const r = leer([idea({ atributo: 'Ritmo Visual', destinatario: 'astronauta' })])
    expect(r.ideas[0]).toMatchObject({ atributo: 'ritmo_visual', atributo_propuesto: true, destinatario: 'direccion' })
    expect(leer([idea()]).ideas[0].atributo_propuesto).toBe(false)
    expect(leerIdeas('no es json', { comentario, catalogo: CAT }).ilegible).toBe(true)
    expect(leerIdeas('{"ideas":[]}', { comentario, catalogo: CAT })).toMatchObject({ ideas: [], ilegible: false })
    expect(leer([idea({ idea: 'x' })]).descartadas).toHaveLength(1)
  })
})

const nota = (id: string, o: Partial<Nota> = {}): Nota => ({
  id, espacio: 'aprendizaje:c1', alcance: 'cliente', industria: 'pizzeria', destinatario: 'texto', atributo: 'tono', sobre: 'emojis', idea: 'no usar emojis', direccion: 'evitar', formato: null, peso: 1,
  creada: '2026-10-29T10:00:00.000Z', ultima_vez_usada: null, peso_al: '2026-10-29T10:00:00.000Z', choca_con: [], ...o,
})

describe('consolidar · juntar, choques, promoción y desuso (puro)', () => {
  it('lo que no se usa pierde peso (semivida) con piso; lo usado no', () => {
    const viejo = nota('a', { creada: '2026-07-01T00:00:00.000Z', peso_al: '2026-07-01T00:00:00.000Z' })
    const usado = nota('b', { creada: '2026-07-01T00:00:00.000Z', peso_al: '2026-07-01T00:00:00.000Z', ultima_vez_usada: '2026-10-29T00:00:00.000Z', sobre: 'fondo', idea: 'fondo blanco', atributo: 'color' })
    const ops = consolidar([viejo, usado], AHORA)
    const d = ops.find((o) => o.tipo === 'decaer' && o.id === 'a') as { peso: number }
    expect(d.peso).toBeLessThan(0.5); expect(d.peso).toBeGreaterThanOrEqual(PARAMETROS_POR_OMISION.piso_de_peso)
    expect(ops.find((o) => o.tipo === 'decaer' && o.id === 'b')).toBeUndefined()
  })
  it('las parecidas se juntan y suman peso; la sobrante se retira con motivo', () => {
    const ops = consolidar([nota('a', { peso: 1 }), nota('b', { peso: 2, sobre: 'emojis en títulos', idea: 'sin emojis en títulos' })], AHORA)
    const j = ops.find((o) => o.tipo === 'juntar') as { sobrevive: string; retira: string[]; peso: number; motivo: string }
    expect(j).toMatchObject({ sobrevive: 'b', retira: ['a'], peso: 3 }); expect(j.motivo).toContain('b')
  })
  it('choque en el MISMO espacio: gana la más nueva y la otra se retira; entre espacios solo se anota', () => {
    const vieja = nota('a', { direccion: 'hacer', creada: '2026-10-01T00:00:00.000Z', peso_al: '2026-10-29T00:00:00.000Z' }), nueva = nota('b', { direccion: 'evitar', creada: '2026-10-20T00:00:00.000Z', peso_al: '2026-10-29T00:00:00.000Z' })
    expect(consolidar([vieja, nueva], AHORA).find((o) => o.tipo === 'retirar_por_choque')).toMatchObject({ id: 'a', gana: 'b' })
    const general = nota('g', { espacio: ESPACIO_GENERAL, alcance: 'general', industria: null, direccion: 'hacer' })
    const propia = nota('p', { direccion: 'evitar' })
    const ops = consolidar([general, propia], AHORA)
    expect(ops.find((o) => o.tipo === 'retirar_por_choque')).toBeUndefined() // la general sigue valiendo para los demás clientes
    expect(ops.find((o) => o.tipo === 'anotar_choque')).toBeDefined()
    expect(gana(general, propia).id).toBe('p') // la más específica
  })
  it('dos clientes distintos NO chocan entre sí', () => {
    const ops = consolidar([nota('a', { direccion: 'hacer' }), nota('b', { espacio: 'aprendizaje:c2', industria: 'hotel', direccion: 'evitar' })], AHORA)
    expect(ops.find((o) => o.tipo === 'retirar_por_choque' || o.tipo === 'anotar_choque')).toBeUndefined()
  })
  it('repetida en ≥ 2 rubros sube a general (una vez); con un solo rubro no', () => {
    const a = nota('a'), b = nota('b', { espacio: 'aprendizaje:c2', industria: 'hotel' })
    const p = consolidar([a, b], AHORA).find((o) => o.tipo === 'promover_a_general') as { de: string[]; industrias: string[] }
    expect(p.industrias).toEqual(['hotel', 'pizzeria']); expect(p.de.sort()).toEqual(['a', 'b'])
    expect(consolidar([a, nota('c', { espacio: 'aprendizaje:c3' })], AHORA).find((o) => o.tipo === 'promover_a_general')).toBeUndefined()
    const yaGeneral = nota('g', { espacio: ESPACIO_GENERAL, alcance: 'general', industria: null })
    expect(consolidar([a, b, yaGeneral], AHORA).find((o) => o.tipo === 'promover_a_general')).toBeUndefined()
  })
})

// ───────────────────────── los diez clientes de punta a punta
const RUBROS = DIEZ_CLIENTES.map((c) => c.rubro)
const COMENTARIOS: Record<number, { texto: string; ideas: Fila[] }> = {
  0: { texto: 'No uses emojis en los títulos. Prefiero fondos blancos en las fotos del producto.', ideas: [
    { idea: 'No usar emojis en los títulos', sobre: 'emojis', atributo: 'tono', destinatario: 'texto', direccion: 'evitar', alcance: 'cliente', cita: 'No uses emojis en los títulos' },
    { idea: 'Fondo blanco en las fotos del producto', sobre: 'fondo blanco', atributo: 'color', destinatario: 'imagen', direccion: 'hacer', alcance: 'cliente', cita: 'Prefiero fondos blancos en las fotos del producto' }] },
  1: { texto: 'Evita los emojis en el texto de los anuncios.', ideas: [{ idea: 'Evitar emojis en el texto', sobre: 'emojis', atributo: 'tono', destinatario: 'texto', direccion: 'evitar', alcance: 'cliente', cita: 'Evita los emojis en el texto' }] },
  2: { texto: 'Siempre un tono cercano, para todos mis negocios.', ideas: [{ idea: 'Tono cercano siempre', sobre: 'tono cercano', atributo: 'tono', destinatario: 'texto', direccion: 'hacer', alcance: 'general', evidencia_de_alcance: 'para todos mis negocios', cita: 'Siempre un tono cercano' }] },
}
for (let i = 3; i < 10; i++) COMENTARIOS[i] = { texto: `Hazlo más corto (nota ${i}).`, ideas: [{ idea: 'Mensajes más cortos', sobre: 'longitud corta', atributo: i === 3 ? 'ritmo' : 'longitud', destinatario: 'texto', direccion: 'hacer', alcance: 'cliente', cita: 'Hazlo más corto' }] }
// el 3 usa un atributo nuevo y los otros 6 «longitud»: la promoción a general sale de los 6 con longitud
const crudas = (): Fila[] => DIEZ_CLIENTES.map((c, i) => ({
  id: `cruda-${i}`, client_id: c.id, clase: 'dato_del_dueno', observado_en: `2026-10-29T1${i}:00:00.000Z`, retirada_en: null, descartada: false,
  provenance_tag: { datos: { acumula: true, respuesta: COMENTARIOS[i].texto, respondido_en: `2026-10-29T1${i}:00:00.000Z`, canal: '#oficina-creativa', tema: `oficina creativa · pieza p${i}`, mensaje_ref: `C1:${i}` } },
}))
const modeloSimulado = (texto: string) => { const e = Object.values(COMENTARIOS).find((c) => texto.includes(c.texto)); return JSON.stringify({ ideas: e ? e.ideas : [] }) }

function montar(extra: Record<string, Fila[]> = {}) {
  const t: Record<string, Fila[]> = {
    clients: DIEZ_CLIENTES.map((c) => ({ id: c.id, industry: c.rubro })), cerebro_fichas: crudas(), cerebro_ingresos: [], cerebro_aprendizaje_indice: [], cerebro_aprendizaje_catalogo: [], ...extra,
  }
  const { db } = crearBaseMini(t, { rpc: () => ({ data: [], error: null }) })
  const llamadas: string[] = [], registros: Fila[] = []
  let n = 0
  const deps = {
    db: db as never, ahora: () => AHORA, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, workflowId: 'wf-portero', ejecucionId: 'ex-1',
    llamarModelo: async (p: { messages: Array<{ content: string }> }) => { llamadas.push(p.messages[0].content); return { texto: modeloSimulado(p.messages[0].content), usage: { input_tokens: 800, output_tokens: 300 } } },
    registrar: async (f: Fila) => { registros.push(f); return { ok: true } },
    embeber: async (textos: string[]) => ({ ok: true as const, embeddings: textos.map(() => [1, 0, 0]), modelo: 'text-embedding-3-small' }),
  }
  return { t, deps, llamadas, registros }
}
const vivas = (t: Record<string, Fila[]>) => t.cerebro_fichas.filter((f) => f.clase === 'aprendizaje_del_dueno' && !f.retirada_en)
const datos = (f: Fila) => ((f.provenance_tag as Fila).datos as Fila)

describe('los diez clientes · desmenuzar y consolidar', () => {
  it('los diez rubros son distintos (la prueba no es de un solo cliente)', () => { expect(new Set(RUBROS).size).toBe(10) })

  it('dry_run solo cuenta: no llama al modelo ni escribe', async () => {
    const m = montar()
    const r = await procesarAprendizaje(m.deps as never, {})
    expect(r).toMatchObject({ dry_run: true, notas_crudas_pendientes: 10, modelos_llamados: 0, fichas_nuevas: 0 })
    expect(m.llamadas).toHaveLength(0); expect(vivas(m.t)).toHaveLength(0)
  })

  it('cada nota se desmenuza en SU espacio (cliente · general), se consolida y la promoción a general sale de varios rubros', async () => {
    const m = montar()
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false })
    expect(r.errores).toEqual([])
    expect(r).toMatchObject({ modelos_llamados: 10, desmenuzadas: 10, ilegibles: 0 })
    expect(r.costo_usd).toBeCloseTo(10 * (800 * 2 + 300 * 10) / 1e6, 6)
    expect(m.registros).toHaveLength(10)
    expect(m.registros[0]).toMatchObject({ agent_name: 'desmenuzador-del-dueno', workflow_id: 'wf-portero', command: 'portero.aprendizaje.desmenuzar' })
    const v = vivas(m.t)
    // cada cliente tiene lo suyo en su espacio
    for (const [i, c] of DIEZ_CLIENTES.entries()) {
      const suyas = v.filter((f) => f.client_id === espacioDeCliente(c.id))
      expect(suyas.length, `cliente ${i}`).toBe(i === 0 ? 2 : i === 2 ? 0 : 1)
      for (const f of suyas) { expect(f.alcance).toBe('cliente'); expect(datos(f).respaldo_en).toBe(`cruda-${i}`); expect(datos(f).industria).not.toBeNull() }
    }
    // «para todos mis negocios» vive en general
    const general = v.filter((f) => f.client_id === ESPACIO_GENERAL)
    expect(general.some((f) => f.que_es === 'Tono cercano siempre' && f.alcance === 'general')).toBe(true)
    // «evitar emojis» (rubros 0 y 1) y «longitud» (rubros 4..9) subieron a general; el rubro 3 usó un atributo propio y no se mezcla
    expect(general.some((f) => datos(f).atributo === 'tono' && datos(f).direccion === 'evitar' && Array.isArray(datos(f).promovida_de))).toBe(true)
    const longitud = general.find((f) => datos(f).atributo === 'longitud') as Fila
    expect((datos(longitud).industrias as string[]).length).toBe(6)
    // las de origen quedan de respaldo (nada se borra)
    expect(v.filter((f) => f.client_id === espacioDeCliente(DIEZ_CLIENTES[5].id))).toHaveLength(1)
    // atributo propuesto → al catálogo (dato)
    expect(r.atributos_propuestos).toEqual(['ritmo'])
    expect(m.t.cerebro_aprendizaje_catalogo.some((x) => x.valor === 'ritmo')).toBe(true)
    // cada ficha viva tiene su huella
    expect(m.t.cerebro_aprendizaje_indice).toHaveLength(v.length)
    // las crudas quedaron marcadas
    for (const f of m.t.cerebro_fichas.filter((x) => x.clase === 'dato_del_dueno')) expect(datos(f).desmenuzada_en).toBeTruthy()
  })

  it('repetir la pasada no vuelve a llamar al modelo ni duplica nada', async () => {
    const m = montar()
    await procesarAprendizaje(m.deps as never, { dry_run: false })
    const antes = vivas(m.t).length, llamadas = m.llamadas.length
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false })
    expect(m.llamadas.length).toBe(llamadas); expect(vivas(m.t)).toHaveLength(antes)
    expect(r).toMatchObject({ modelos_llamados: 0, fichas_nuevas: 0, notas_crudas_pendientes: 0 }); expect(r.errores).toEqual([])
  })

  it('las notas anteriores a «desde hoy» y las que no se suman (sin acumula) no se procesan', async () => {
    const m = montar()
    const c = m.t.cerebro_fichas
    ;(datos(c[0]) as Fila).respondido_en = '2026-10-01T00:00:00.000Z'
    ;(datos(c[1]) as Fila).acumula = false
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false })
    expect(r.modelos_llamados).toBe(8)
  })

  it('un modelo que responde basura no rompe: reintenta en la próxima pasada y a la tercera da la nota por vista', async () => {
    const m = montar()
    m.deps.llamarModelo = async () => ({ texto: 'no soy json', usage: { input_tokens: 100, output_tokens: 10 } })
    for (let k = 0; k < 3; k++) await procesarAprendizaje(m.deps as never, { dry_run: false, client_id: DIEZ_CLIENTES[0].id })
    expect(datos(m.t.cerebro_fichas[0]).desmenuzada_en).toBeTruthy()
    expect(datos(m.t.cerebro_fichas[0]).motivo).toContain('tres intentos')
    expect(vivas(m.t)).toHaveLength(0)
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false, client_id: DIEZ_CLIENTES[0].id })
    expect(r.modelos_llamados).toBe(0)
  })

  it('sin modelo de huellas: las fichas se escriben igual y la próxima pasada repara las huellas', async () => {
    const m = montar()
    const embeber = m.deps.embeber
    m.deps.embeber = (async () => ({ ok: false as const, detalle: 'sin llave' })) as never
    const r1 = await procesarAprendizaje(m.deps as never, { dry_run: false })
    expect(r1.huellas_pendientes).toBeGreaterThan(0); expect(m.t.cerebro_aprendizaje_indice).toHaveLength(0)
    m.deps.embeber = embeber
    const r2 = await procesarAprendizaje(m.deps as never, { dry_run: false, solo: 'consolidar' })
    expect(m.t.cerebro_aprendizaje_indice.length).toBe(vivas(m.t).length); expect(r2.huellas_escritas).toBeGreaterThan(0)
  })

  it('lo que no se usa pierde peso en la consolidación (meses después)', async () => {
    const m = montar()
    await procesarAprendizaje(m.deps as never, { dry_run: false })
    m.deps.ahora = () => new Date('2027-02-01T00:00:00.000Z')
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false, solo: 'consolidar' })
    expect(r.operaciones.decaer).toBeGreaterThan(0)
    const f = vivas(m.t).find((x) => x.client_id === espacioDeCliente(DIEZ_CLIENTES[5].id)) as Fila
    expect(Number(datos(f).peso)).toBeLessThan(0.5)
  })
})

// ───────────────────────── la consulta
const ficha = (id: string, espacio: string, alcance: string, o: Fila = {}, d: Fila = {}): Fila => ({
  id, client_id: espacio, clase: 'aprendizaje_del_dueno', que_es: 'no usar emojis en los títulos', contenido: 'x', observado_en: '2026-10-20T00:00:00.000Z', creado_en: '2026-10-20T00:00:00.000Z', alcance, retirada_en: null, descartada: false,
  provenance_tag: { canal: '#oficina-creativa', datos: { destinatario: 'texto', atributo: 'tono', sobre: 'emojis', direccion: 'evitar', peso: 1, industria: 'x', respaldo_en: `cruda-${id}`, cita: 'cita literal', mensaje_ref: 'C1:1', respondido_en: '2026-10-20T00:00:00.000Z', choca_con: [], ...d } }, ...o,
})
const A = DIEZ_CLIENTES[0], B = DIEZ_CLIENTES[1], Z = DIEZ_CLIENTES[5]
function montarConsulta(fichas: Fila[], conHuellas = true) {
  const t: Record<string, Fila[]> = { clients: DIEZ_CLIENTES.map((c) => ({ id: c.id, industry: c.rubro })), cerebro_fichas: fichas, cerebro_aprendizaje_indice: fichas.map((f) => ({ ficha_id: f.id, espacio: f.client_id, destinatario: datos(f).destinatario })) }
  const pedidos: Fila[] = []
  const { db } = crearBaseMini(t, { rpc: (_n, a) => { pedidos.push(a); const esp = a.p_espacios as string[]; return { data: t.cerebro_aprendizaje_indice.filter((i) => esp.includes(String(i.espacio)) && (!a.p_destinatario || i.destinatario === a.p_destinatario)).map((i) => ({ ficha_id: i.ficha_id, espacio: i.espacio, similitud: 0.6 })), error: null } } })
  const deps = { db: db as never, ahora: () => AHORA, ...(conHuellas ? { embeberTarea: async () => ({ ok: true as const, embedding: [1, 0, 0] }) } : {}) }
  return { t, deps, pedidos }
}
const consultar = (m: ReturnType<typeof montarConsulta>, cliente: string, o: Fila = {}) => consultarAprendizaje(m.deps, { client_id: cliente, oficina: 'oficina-creativa', agente: 'productor-de-texto', tarea: 'títulos para la publicación de la semana', ...o } as never)
const ids = (r: { body: Fila }) => (r.body.notas as Array<{ ficha_id: string }>).map((n) => n.ficha_id)

describe('la consulta por especialista', () => {
  const rubroA = espacioDeIndustria(A.rubro) as string
  const fichas = (): Fila[] => [
    ficha('f-a', espacioDeCliente(A.id), 'cliente'),
    ficha('f-ind', rubroA, 'industria', { que_es: 'fotos siempre con luz natural' }, { atributo: 'composicion', sobre: 'luz natural', direccion: 'hacer', destinatario: 'imagen' }),
    ficha('f-gen', ESPACIO_GENERAL, 'general', { que_es: 'tono cercano siempre' }, { atributo: 'tono', sobre: 'tono cercano', direccion: 'hacer' }),
    ficha('f-b', espacioDeCliente(B.id), 'cliente', { que_es: 'precios siempre visibles' }, { atributo: 'precio_y_oferta', sobre: 'precios', direccion: 'hacer' }),
  ]

  it('junta cliente + su industria + general; nunca lo de otro cliente; consulta los tres espacios', async () => {
    const m = montarConsulta(fichas())
    const r = await consultar(m, A.id, { tarea: 'texto de la publicación con tono cercano, sin emojis en los títulos, fotos con luz natural' })
    expect(r.status).toBe(200)
    expect(ids(r).sort()).toEqual(['f-a', 'f-gen', 'f-ind'])
    expect(r.body.espacios_leidos).toEqual([espacioDeCliente(A.id), rubroA, ESPACIO_GENERAL])
    expect(m.pedidos[0].p_espacios).toEqual([espacioDeCliente(A.id), rubroA, ESPACIO_GENERAL])
    expect(r.body.modo_de_busqueda).toBe('huellas')
  })
  it('aislamiento: el cliente Z (otro rubro) solo ve lo general y lo suyo, jamás lo de A, B ni la industria de A', async () => {
    const m = montarConsulta(fichas())
    const r = await consultar(m, Z.id)
    expect(ids(r)).toEqual(['f-gen'])
  })
  it('filtra por destinatario y por formato', async () => {
    const m = montarConsulta([...fichas(), ficha('f-fmt', ESPACIO_GENERAL, 'formato', { que_es: 'máximo 6 láminas' }, { destinatario: 'diseno', atributo: 'composicion', sobre: 'laminas', direccion: 'hacer', formato: 'carrusel' })])
    expect(ids(await consultar(m, A.id, { destinatario: 'imagen' }))).toEqual(['f-ind'])
    expect(ids(await consultar(m, A.id, { destinatario: 'diseno' }))).toEqual(['f-fmt']) // sin pedir formato, la nota de «carrusel» no se esconde
  })
  it('formato: una nota de otro formato no se entrega; la del formato pedido sí', async () => {
    const m = montarConsulta([ficha('f-fmt', ESPACIO_GENERAL, 'formato', { que_es: 'máximo 6 láminas' }, { destinatario: 'diseno', atributo: 'composicion', sobre: 'laminas', direccion: 'hacer', formato: 'carrusel' })])
    expect(ids(await consultar(m, A.id, { formato: 'carrusel', destinatario: 'diseno' }))).toEqual(['f-fmt'])
    expect(ids(await consultar(m, A.id, { formato: 'historia', destinatario: 'diseno' }))).toEqual([])
  })
  it('orden: especificidad → peso → fecha', async () => {
    const m = montarConsulta([
      ficha('g1', ESPACIO_GENERAL, 'general', { que_es: 'uno general', }, { atributo: 'a1', sobre: 'uno', peso: 5 }),
      ficha('c1', espacioDeCliente(A.id), 'cliente', { que_es: 'dos cliente' }, { atributo: 'a2', sobre: 'dos', peso: 1 }),
      ficha('i1', rubroA, 'industria', { que_es: 'tres industria' }, { atributo: 'a3', sobre: 'tres', peso: 9 }),
      ficha('c2', espacioDeCliente(A.id), 'cliente', { que_es: 'cuatro cliente' }, { atributo: 'a4', sobre: 'cuatro', peso: 3 }),
    ])
    expect(ids(await consultar(m, A.id))).toEqual(['c2', 'c1', 'i1', 'g1'])
  })
  it('un choque entrega solo la ganadora (la más específica) y dice cuál descartó; la general sigue valiendo para otros', async () => {
    const m = montarConsulta([ficha('g', ESPACIO_GENERAL, 'general', { que_es: 'usar emojis en los títulos' }, { direccion: 'hacer' }), ficha('c', espacioDeCliente(A.id), 'cliente')])
    const r = await consultar(m, A.id)
    expect(ids(r)).toEqual(['c']); expect(r.body.descartadas_por_choque).toEqual([{ ficha_id: 'g', gano: 'c' }])
    expect(ids(await consultar(m, Z.id))).toEqual(['g'])
  })
  it('una nota general que repite lo de una del cliente no se entrega dos veces', async () => {
    const m = montarConsulta([ficha('g', ESPACIO_GENERAL, 'general'), ficha('c', espacioDeCliente(A.id), 'cliente')])
    expect(ids(await consultar(m, A.id))).toEqual(['c'])
  })
  it('límite: 10 como máximo; trae la procedencia (cita, canal, nota cruda, mensaje) y marca ultima_vez_usada', async () => {
    const muchas = Array.from({ length: 14 }, (_, i) => ficha(`n${i}`, espacioDeCliente(A.id), 'cliente', { que_es: `tema distinto numero ${i}` }, { atributo: `a${i}`, sobre: `s${i}` }))
    const m = montarConsulta(muchas)
    const r = await consultar(m, A.id, { limite: 50 })
    expect(r.body.total).toBe(10)
    expect((r.body.notas as Array<Fila>)[0].procedencia).toMatchObject({ origen: 'dueno', canal: '#oficina-creativa', cita: 'cita literal', mensaje_ref: 'C1:1' })
    const usada = m.t.cerebro_fichas.find((f) => f.id === ids(r)[0]) as Fila
    expect(datos(usada).ultima_vez_usada).toBe(AHORA.toISOString()); expect(datos(usada).usos).toBe(1)
    expect(r.body.marcadas_como_usadas).toBe(10)
  })
  it('sin huellas cae a parecido por palabras y lo dice; sin nada que venga al caso: sin_dato', async () => {
    const m = montarConsulta(fichas(), false)
    const r = await consultar(m, A.id, { tarea: 'títulos sin emojis' })
    expect(r.body).toMatchObject({ modo_de_busqueda: 'palabras' }); expect(r.body.aviso_de_busqueda).toBeTruthy(); expect(ids(r)).toEqual(['f-a'])
    const nada = await consultar(m, A.id, { tarea: 'zzz qqq' })
    expect(nada.body).toMatchObject({ sin_dato: true, total: 0 })
  })
  it('la JEFATURA y la segunda mirada GPT no pueden leerla; la tarea y el cliente son obligatorios', async () => {
    const m = montarConsulta(fichas())
    expect((await consultar(m, A.id, { oficina: 'jefatura', agente: 'editor_en_jefe' })).status).toBe(403)
    expect((await consultar(m, A.id, { oficina: 'revision', agente: 'gpt-5.5 segunda mirada' })).status).toBe(403)
    expect(esConsultanteExcluido('oficina-creativa', 'productor-de-texto')).toBe(false)
    expect((await consultar(m, A.id, { tarea: '' })).status).toBe(400)
    expect((await consultar(m, 'no-es-uuid')).status).toBe(400)
    expect((await consultar(m, 'abababab-abab-4bab-8bab-abababababab')).status).toBe(404)
  })
  it('lo retirado no se entrega', async () => {
    const m = montarConsulta([ficha('r', espacioDeCliente(A.id), 'cliente', { retirada_en: '2026-10-25T00:00:00.000Z' })])
    expect((await consultar(m, A.id)).body.sin_dato).toBe(true)
  })
})

describe('garantías', () => {
  const raiz = join(process.cwd(), 'src')
  const archivos = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === 'node_modules' ? [] : archivos(p)) : /\.(ts|tsx)$/.test(n) && !/__tests__|\.test\./.test(p) ? [p] : [] })
  it('la jefatura y la segunda mirada GPT no importan ni nombran el aprendizaje (el sobre de revisión no lo contiene)', () => {
    const prohibidos = [join(raiz, 'lib', 'jefatura'), join(raiz, 'lib', 'camino-iii')]
    const todos = prohibidos.flatMap((d) => { try { return archivos(d) } catch { return [] } })
    expect(todos.length).toBeGreaterThan(0)
    for (const a of todos) { const s = readFileSync(a, 'utf8'); expect(s, a).not.toMatch(/portero-alimenta\/aprendizaje|aprendizaje_del_dueno|cerebro_aprendizaje/) }
  })
  it('solo cuatro puertas usan el módulo (nadie más lo importa: ni jefatura, ni GPT, ni la oficina por su cuenta)', () => {
    const posix = (a: string) => a.split(String.fromCharCode(92)).join('/')
    const quienes = archivos(raiz).filter((a) => readFileSync(a, 'utf8').split('\n').some((l) => /^\s*import\b/.test(l) && /portero-alimenta\/aprendizaje|'\.\/aprendizaje\//.test(l))).map((a) => posix(a).slice(posix(raiz).length))
    const permitidos = ['/lib/portero-alimenta/aprendizaje/', '/app/api/brain/consultar/route.ts', '/app/api/brain/alimentar/dueno/route.ts', '/app/api/brain/alimentar/aprendizaje/route.ts', '/app/api/brain/aprendizaje/medida/route.ts']
    expect(quienes.filter((q) => !permitidos.some((r) => q.startsWith(r)))).toEqual([])
    expect(quienes.length).toBe(4)
  })
  it('la lectura general del cerebro no entrega nunca esta clase y el puente al índice del corredor no la ve (espacios propios)', () => {
    expect(readFileSync(join(raiz, 'lib', 'portero-alimenta', 'consultar.ts'), 'utf8')).toContain("txt(f.clase) !== 'aprendizaje_del_dueno'")
    expect(espacioDeCliente('abc')).not.toBe('abc') // el espacio del aprendizaje no es el client_id de las fichas del cliente
  })
  it('las horas del cron siguen las corridas del modo: 3 al día en construcción, 1 en campaña', () => {
    const ok = (modo: 'construccion' | 'campana', hh: string) => !!corridaQueSeRevisa(modo, new Date(`2026-10-29T${hh}:00Z`), 90, 200)
    expect(['14:45', '20:45', '02:45'].map((h) => ok('construccion', h))).toEqual([true, true, true])
    expect(['14:45', '20:45', '02:45'].map((h) => ok('campana', h))).toEqual([true, false, false])
    expect(ok('construccion', '17:00')).toBe(false)
  })
  it('los parámetros son dato: APRENDIZAJE_PARAMS los cambia y un JSON roto no apaga nada', () => {
    expect(parametrosDelEntorno({ APRENDIZAJE_PARAMS: '{"semivida_dias":10,"industrias_para_general":3}' })).toMatchObject({ semivida_dias: 10, industrias_para_general: 3, piso_de_peso: 0.05 })
    expect(parametrosDelEntorno({ APRENDIZAJE_PARAMS: '{roto' }).semivida_dias).toBe(60)
  })
})

describe('medición', () => {
  it('guarda una fila por pieza y suma aprobadas a la primera y cambios por pieza, con y sin aprendizaje', async () => {
    const t: Record<string, Fila[]> = { cerebro_aprendizaje_medidas: [] }
    const { db } = crearBaseMini(t)
    const reg = (o: Fila) => registrarMedida(db as never, { client_id: A.id, ...o })
    expect((await reg({ pieza_ref: 'p1', aprobada_a_la_primera: true })).status).toBe(200)
    await reg({ pieza_ref: 'p2', aprobada_a_la_primera: false, cambios_pedidos: 3, usado_aprendizaje: true })
    await reg({ pieza_ref: 'p3', aprobada_a_la_primera: true, usado_aprendizaje: true })
    await reg({ pieza_ref: 'p2', aprobada_a_la_primera: false, cambios_pedidos: 1, usado_aprendizaje: true }) // misma pieza = actualiza
    expect(t.cerebro_aprendizaje_medidas).toHaveLength(3)
    const r = resumirMedidas(t.cerebro_aprendizaje_medidas)
    expect(r.total).toMatchObject({ piezas: 3, aprobadas_a_la_primera: 2, porcentaje_a_la_primera: 66.7, cambios_por_pieza: 0.33 })
    expect(r.con_aprendizaje).toMatchObject({ piezas: 2, aprobadas_a_la_primera: 1 }); expect(r.sin_aprendizaje.piezas).toBe(1)
    expect((await reg({ pieza_ref: 'p4', aprobada_a_la_primera: true, cambios_pedidos: 2 })).status).toBe(400) // incoherente
    expect((await reg({ pieza_ref: '', aprobada_a_la_primera: true })).status).toBe(400)
    expect((await reg({ pieza_ref: 'p5', aprobada_a_la_primera: 'si' })).status).toBe(400)
  })
})
