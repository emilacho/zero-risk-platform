/** Reparos H1–H3 de la autocomprobación del PR #540: reconciliación del puente, pruebas que faltaban y costo de Mapas por sede. US$ 0. */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { aplicarGuardas, type ItemParaJuzgar } from '../juez'
import { descubrir } from '../plan'
import { esBuscable, puenteDeFicha, reconciliarPuente, type FichaParaPuente } from '../puente'
import { gastoDeHoy, rutaAlimentar } from '../rutas'
import { gastoDelDia } from '../gasto'
import { lineasDeMetadata } from '../sitio-metadata'
import { unidadesDeRaspados } from '../unidades'
import { crearBaseFalsa } from './base-falsa'

const C = '55555555-5555-4555-8555-555555555555'
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }
const D1 = new Date('2026-10-16T10:30:00Z')
const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }

const ficha = (o: Partial<FichaParaPuente> & { id: string }): FichaParaPuente => ({ client_id: C, ref: 'portero:sitio:abc', clase: 'precio', titulo: 'sitio · precio:x', contenido: 'x $5', fecha_fuente: null, observado_en: '2026-10-15T10:00:00Z', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null, ...o })

describe('H1 · el puente se reconcilia: lo que faltó ayer se escribe hoy, sin duplicar', () => {
  it('escribe las entregables SIN trozo; saca los trozos de retiradas, descartadas, inciertas, de prueba o ya inexistentes; no toca lo que está bien', () => {
    const fichas = [
      ficha({ id: 'A' }), // entregable sin trozo → escribir
      ficha({ id: 'B' }), // entregable con trozo → nada
      ficha({ id: 'C', descartada: true }), // descartada con trozo → sacar
      ficha({ id: 'D', retirada_en: '2026-10-16T00:00:00Z' }), // retirada con trozo → sacar
      ficha({ id: 'E', propiedad: 'incierta' }), // incierta sin trozo → no escribir
      ficha({ id: 'F', prueba: true }), // de prueba → no escribir
      ficha({ id: 'G', contenido: '   ' }), // sin contenido → no escribir
    ]
    const r = reconciliarPuente(fichas, ['B', 'C', 'D', 'HUERFANO'])
    expect(r.escribir.map((p) => p.source_id)).toEqual(['A'])
    expect(r.sacar).toEqual(['C', 'D', 'HUERFANO'])
    expect(r.ya_buscables).toBe(1)
    expect(fichas.filter(esBuscable).map((f) => f.id)).toEqual(['A', 'B'])
  })
  it('es idempotente: aplicado el resultado, la segunda pasada no tiene nada que hacer', () => {
    const fichas = [ficha({ id: 'A' }), ficha({ id: 'B' }), ficha({ id: 'C', descartada: true })]
    const chunks = new Set(['C'])
    const r1 = reconciliarPuente(fichas, chunks)
    for (const p of r1.escribir) chunks.add(p.source_id)
    for (const s of r1.sacar) chunks.delete(s)
    const r2 = reconciliarPuente(fichas, chunks)
    expect(r1.escribir).toHaveLength(2)
    expect(r2.escribir).toEqual([])
    expect(r2.sacar).toEqual([])
  })
  it('el trozo de un tercero va marcado como raspado ajeno; el propio no; el texto lleva fecha', () => {
    const t = puenteDeFicha(ficha({ id: 'T', origen: 'tercero', propiedad: 'ajena', ref: 'portero:resenas:zzz', fecha_fuente: '2026-10-10T00:00:00Z' }))
    expect(t.metadata).toMatchObject({ apify_function: 'portero_diario_tercero', fuente: 'resenas', ficha_id: 'T' })
    expect(t.sections[0].text).toContain('(fecha 2026-10-10)')
    expect(puenteDeFicha(ficha({ id: 'P' })).metadata).not.toHaveProperty('apify_function')
  })

  const tablas = () => ({
    clients: [{ id: C, name: 'Estudio Brisa', website_url: 'https://brisa.example', config: {} }],
    client_sedes: [{ client_id: C, ciudad: 'Cuenca', clave: 'cuenca' }],
    apify_raw: [{ id: 'w1', client_id: C, apify_function: 'website_content_scraper', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: [{ url: 'https://brisa.example/', text: 'Sesion de masaje $30\nHorario de lunes a viernes de 9 a 18' }] }],
    cerebro_unidades_vistas: [], cerebro_fichas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [] as Array<Record<string, unknown>>,
  })
  it('de punta a punta: el puente falla el día 1; el día 2 (la ruta repite) se reenvía lo que faltó, y el día 3 no hay nada', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never)
    let falla = true
    const enviados: string[][] = []
    const puente = async (p: { escribir: Array<{ source_id: string }>; sacar: string[] }) => {
      enviados.push(p.escribir.map((x) => x.source_id))
      if (falla) return { escritos: 0, sacados: 0, errores: ['ingest-source respondió 502'] }
      for (const x of p.escribir) t.client_brain_chunks.push({ client_id: C, source_table: 'cerebro_fichas', source_id: x.source_id })
      return { escritos: p.escribir.length, sacados: 0, errores: [] }
    }
    const dia1 = await rutaAlimentar({ db: base.db, interruptores: ON, ahora: D1, puente }, { client_id: C, dry_run: false, ...WF })
    expect(dia1.body.estado).toBe('con_errores')
    const fichasDia1 = (t.cerebro_fichas as Array<{ id: string }>).length
    expect(fichasDia1).toBeGreaterThan(0)
    expect(t.client_brain_chunks).toHaveLength(0) // ningún trozo: el puente falló
    // día 2: la unidad ya está «vista»; sin reconciliación NUNCA volvería al índice
    falla = false
    const dia2 = await rutaAlimentar({ db: base.db, interruptores: ON, ahora: new Date(D1.getTime() + 86_400_000), puente }, { client_id: C, dry_run: false, ...WF })
    expect(dia2.body.puente).toMatchObject({ pendientes: fichasDia1, escritos: fichasDia1 })
    expect(t.client_brain_chunks).toHaveLength(fichasDia1)
    expect((t.cerebro_fichas as unknown[]).length).toBe(fichasDia1) // no se duplicaron fichas
    // día 3: nada pendiente, no se vuelve a llamar al puente con trabajo
    const antes = enviados.length
    const dia3 = await rutaAlimentar({ db: base.db, interruptores: ON, ahora: new Date(D1.getTime() + 2 * 86_400_000), puente }, { client_id: C, dry_run: false, ...WF })
    expect(dia3.body.puente).toMatchObject({ pendientes: 0, a_sacar: 0 })
    expect(enviados.length).toBe(antes)
    expect(t.client_brain_chunks).toHaveLength(fichasDia1)
  })
  it('en seco solo CUENTA lo pendiente: no llama al puente ni escribe', async () => {
    const t = tablas()
    ;(t.cerebro_fichas as unknown[]).push({ id: 'F1', client_id: C, ref: 'portero:sitio:x', clase: 'texto', titulo: 't', contenido: 'algo', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null })
    const base = crearBaseFalsa(t as never)
    let llamado = false
    const r = await rutaAlimentar({ db: base.db, interruptores: ON, ahora: D1, puente: async () => { llamado = true; return { escritos: 0, sacados: 0, errores: [] } } }, { client_id: C, dry_run: true })
    expect(r.body.puente).toMatchObject({ pendientes: 1 })
    expect(llamado).toBe(false)
    expect(base.escrituras).toEqual([])
  })
  it('si no se puede LEER el índice se dice (no se lee como «no falta nada»)', async () => {
    const t = tablas()
    const base = crearBaseFalsa(t as never, { fallaEn: 'client_brain_chunks' })
    const r = await rutaAlimentar({ db: base.db, interruptores: ON, ahora: D1 }, { client_id: C, dry_run: true })
    expect(r.body.puente).toMatchObject({ lectura_fallida: true })
    expect(JSON.stringify(r.body.errores)).toMatch(/puente: lectura fallida/)
  })
})

describe('H2 · las pruebas que faltaban', () => {
  const filaTexto = (texto: string, creado = '2026-10-16T08:00:00Z') => ({ id: `w-${creado}`, client_id: C, apify_function: 'website_content_scraper', ensayo: false, created_at: creado, respuesta: [{ url: 'https://brisa.example/', text: texto }] })
  const base = (apify: unknown[], fichas: unknown[]) => ({
    clients: [{ id: C, name: 'Estudio Brisa', website_url: 'https://brisa.example', config: {} }], client_sedes: [], apify_raw: apify, cerebro_unidades_vistas: [], cerebro_fichas: fichas,
    cerebro_ingresos: [], cerebro_portero_corridas: [],
  })
  it('el juez NO se llama si el texto no cambió respecto de lo vigente; sí cuando cambió', async () => {
    let llamadas = 0
    const llamarModelo = async (_i: string, m: string) => { llamadas++; const n = Number(/^\[(\d+)\]/m.exec(m)?.[1] ?? 1); return { texto: JSON.stringify({ decisiones: [{ n, decision: 'reemplaza', reemplaza_ficha: 'F-VIEJA', cita: 'sesion de masaje', razon: 'cambió' }] }), costo_usd: 0.006, tokens_entrada: 1, tokens_salida: 1 } }
    const vigente = { id: 'F-VIEJA', client_id: C, atributo: 'precio:sesion masaje', contenido: 'sesion de masaje $30', creado_en: '2026-10-15T00:00:00Z', retirada_en: null, prueba: false }
    const igual = crearBaseFalsa(base([filaTexto('Sesion de masaje $30')], [vigente]) as never)
    const r1 = await alimentarCliente({ db: igual.db, client_id: C, dry_run: true, interruptores: ON, llamarModelo, ahora: D1 })
    expect(r1.juez.items).toBe(0)
    expect(llamadas).toBe(0)
    const cambia = crearBaseFalsa(base([filaTexto('Sesion de masaje $35')], [vigente]) as never)
    const r2 = await alimentarCliente({ db: cambia.db, client_id: C, dry_run: true, interruptores: ON, llamarModelo, ahora: D1 })
    expect(r2.juez.items).toBe(1)
    expect(llamadas).toBe(1)
    expect(r2.plan?.resumen.reemplaza).toBe(1)
  })
  it('el TEXTO de una unidad nunca sale de una fila de ensayo, aunque sea más nueva', () => {
    const ig = (bio: string) => [{ username: 'estudiobrisa', biography: bio, latestPosts: [] }]
    const us = unidadesDeRaspados([
      { id: 'real', apify_function: 'instagram_scraper', ensayo: false, created_at: '2026-10-16T08:00:00Z', respuesta: ig('Bio real del estudio') },
      { id: 'ensayo', apify_function: 'instagram_scraper', ensayo: true, created_at: '2026-10-16T12:00:00Z', respuesta: ig('BIO INVENTADA DE ENSAYO') },
    ], { propios: { handles: ['estudiobrisa'] } })
    expect(us).toHaveLength(1)
    expect(us[0].texto).toBe('bio real del estudio')
    expect(us[0].apify_raw_id).toBe('real')
  })
  it('el horario del JSON-LD se lee, y el orden de los días no cambia la línea', () => {
    const a = lineasDeMetadata({ jsonLd: [{ '@type': 'LocalBusiness', openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['https://schema.org/Monday', 'https://schema.org/Tuesday'], opens: '09:00', closes: '18:00' }] }] })
    const b = lineasDeMetadata({ jsonLd: [{ '@type': 'LocalBusiness', openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['https://schema.org/Tuesday', 'https://schema.org/Monday'], opens: '09:00', closes: '18:00' }] }] })
    expect(a.some((l) => /^horario monday tuesday de 09 00 a 18 00$/.test(l))).toBe(true)
    expect(a).toEqual(b)
    const otra = lineasDeMetadata({ jsonLd: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: 'Saturday', opens: '10:00', closes: '14:00' }] })
    expect(otra).toContain('horario saturday de 10 00 a 14 00')
  })
  it('la guarda «otro atributo» es alcanzable por el contrato del juez y no deja reemplazar un atributo con otro', () => {
    const item: ItemParaJuzgar = { n: 1, unidad_clave: 'k', fuente: 'sitio', autoria: 'propia', clase_dato: 'atributo', atributo: 'precio:masaje', texto: 'masaje $35', fecha: null, vigente: { ficha_id: 'F', texto: 'corte de pelo $10', fecha: null, atributo: 'precio:corte' } }
    const r = (d: string) => JSON.stringify({ decisiones: [{ n: 1, decision: d, reemplaza_ficha: 'F', cita: 'masaje $35', razon: 'x' }] })
    expect(aplicarGuardas([item], r('reemplaza'))[0]).toMatchObject({ decision: 'suma', degradada_por: 'otro atributo' })
    expect(aplicarGuardas([item], r('nada'))[0]).toMatchObject({ decision: 'suma', degradada_por: expect.stringMatching(/atributo distinto/) })
    // y con el MISMO atributo el reemplazo vale
    expect(aplicarGuardas([{ ...item, vigente: { ...item.vigente!, atributo: 'precio:masaje' } }], r('reemplaza'))[0].decision).toBe('reemplaza')
  })
})

describe('H3 · el costo máximo de Mapas es n_sedes × el máximo por búsqueda', () => {
  const cliente = (n: number) => ({ id: 'C', name: 'Estudio Brisa', website_url: 'https://brisa.example', config: { apify: { own_handles: {} } }, _n: n })
  const plan = (ciudades: string[]) => descubrir({ cliente: cliente(ciudades.length), rubro: 'estudio de masajes', ciudad: ciudades[0], ciudades, publicaciones_propias: [], gastado_hoy_usd: 0, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false } })
  const mapas = (p: ReturnType<typeof descubrir>) => p.hacer.find((a) => a.fuente === 'mapas')!
  it('1 sede = 0,10 · 2 sedes = 0,20 · 3 sedes = 0,30 · 5 sedes se cortan en 3 (nunca más búsquedas que las pagadas)', () => {
    expect(mapas(plan(['Cuenca'])).usd_max).toBeCloseTo(0.1, 6)
    expect(mapas(plan(['Cuenca', 'Loja'])).usd_max).toBeCloseTo(0.2, 6)
    const tres = mapas(plan(['Cuenca', 'Loja', 'Quito']))
    expect(tres.usd_max).toBeCloseTo(0.3, 6)
    const cinco = mapas(plan(['Cuenca', 'Loja', 'Quito', 'Ambato', 'Machala']))
    expect((cinco.params.searchStringsArray as string[]).length).toBe(3)
    expect(cinco.usd_max).toBeCloseTo(0.3, 6)
  })
  it('una ficha de Mapas ya conocida es UNA corrida (0,10), no por sede', () => {
    const p = descubrir({ cliente: cliente(2), rubro: 'x', ciudad: 'Cuenca', ciudades: ['Cuenca', 'Loja'], mapas: { url: 'https://maps.example/p' }, publicaciones_propias: [], gastado_hoy_usd: 0, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false } })
    expect(mapas(p).usd_max).toBeCloseTo(0.1, 6)
  })
  it('el libro sin importe cuenta el máximo POR BÚSQUEDA de lo que se hizo hoy (2 sedes ⇒ 0,20)', async () => {
    const t = {
      costs: [{ service: 'apify:own_google_maps_profile', amount_usd: null, created_at: '2026-10-16T09:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C }) }],
      agent_invocations: [],
      apify_raw: [{ client_id: C, apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-16T09:00:00Z', params: { searchStringsArray: ['a Cuenca', 'a Loja'] } }],
    }
    const base = crearBaseFalsa(t as never)
    const g = await gastoDeHoy(base.db, C, new Date('2026-10-16T12:00:00Z'))
    expect(g.ok).toBe(true)
    if (g.ok) { expect(g.gasto.apify_usd).toBeCloseTo(0.2, 6); expect(g.gasto.filas_sin_importe).toBe(1) }
  })
  it('gastoDelDia respeta el máximo por llamada que se le pasa y no el declarado por omisión', () => {
    const libro = [{ service: 'apify:own_google_maps_profile', amount_usd: 0, created_at: '2026-10-16T09:00:00Z', description: JSON.stringify({ es: 'detalle_de_llamada', client_id: C }) }]
    expect(gastoDelDia({ clientId: C, ahora: D1, libro, invocacionesUsd: [] }).apify_usd).toBeCloseTo(0.1, 6)
    expect(gastoDelDia({ clientId: C, ahora: D1, libro, invocacionesUsd: [], maximoPorLlamada: { own_google_maps_profile: 0.3 } }).apify_usd).toBeCloseTo(0.3, 6)
  })
})
