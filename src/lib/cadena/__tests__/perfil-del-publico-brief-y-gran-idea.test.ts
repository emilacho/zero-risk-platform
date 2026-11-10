/**
 * PERFIL DEL PÚBLICO · T2 · brief y gran idea (decisión 1 de Lenovo, 10-nov 19:05Z): leen el perfil por la PUERTA del portero, nunca por tablas del cerebro.
 *   · sin lector o sin perfil, los marcos quedan BYTE A BYTE como hoy;
 *   · un fallo de lectura se DICE («no disponible»), nunca «no hay»;
 *   · la gran idea que atribuye una frase al público que no está textual en el perfil lleva el aviso «frase del público sin fuente» (aviso, nunca bloqueo).
 * Cliente de práctica: una panadería de barrio (fixture `clienteA`).
 */
import { describe, expect, it, vi } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { briefAbrir, conceptoAbrir, insumosDelConcepto, marcoDelBrief, marcoDelConcepto, perfilParaLaMesa, recibirBrief } from '../mesas'
import { ENCABEZADO_DEL_PERFIL, SIN_PERFIL_LEIDO, type PerfilParaLectores } from '../../perfil-del-publico/lectores'
import { perfilPorHttp } from '../../perfil-del-publico/por-http'

const A = clienteA()
const CAMP = 'camp-perfil'
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
const PERFIL_TEXTO = 'Las voces públicas valoran el pan recién salido. Frases textuales: «el pan todavía está caliente» · «hay mesa para todos».'
const VIGENTE: PerfilParaLectores = { estado: 'vigente', texto: PERFIL_TEXTO, fecha_de_corte: '2026-10-01T00:00:00Z', ficha_id: 'ficha-perfil-1' }

function almacen(perfil?: (clientId: string, mesa: 'brief' | 'gran_idea') => Promise<PerfilParaLectores>) {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
  const campana: Campana = {
    id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Bogota', pais: 'CO', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  if (perfil) Object.assign(al, { perfilDelPublico: perfil })
  return al
}
const marcoDe = (r: { cuerpo: Record<string, unknown> }): string => (r.cuerpo.sobre as { marco_texto: string }).marco_texto

const BRIEF_BUENO = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')

// ─────────────────────────────────────────────── el lector por la puerta del portero
describe('perfilPorHttp · la cadena lee el perfil por la puerta del portero', () => {
  const resp = (status: number, cuerpo: unknown) => vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } }))
  const adjunto = (informes: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, resultados: [], contexto_del_cliente: { resumen_vivo: { estado: 'sin_resumen' }, informes, informes_estado: 'ok', ...extra } })

  it('pide a /api/brain/consultar con la llave, registra quién consulta y pide solo la clase del informe', async () => {
    const f = resp(200, adjunto([{ tipo: 'perfil_del_publico', texto: PERFIL_TEXTO, fecha_de_corte: '2026-10-01', ficha_id: 'f1' }]))
    const p = await perfilPorHttp({ base: 'https://plataforma.test/', llave: 'llave-de-prueba', fetch: f as unknown as typeof fetch })('11111111-1111-4111-8111-111111111111', 'brief')
    expect(p).toEqual({ estado: 'vigente', texto: PERFIL_TEXTO, fecha_de_corte: '2026-10-01', ficha_id: 'f1' })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url.startsWith('https://plataforma.test/api/brain/consultar?')).toBe(true)
    const qs = new URL(url).searchParams
    expect([qs.get('client_id'), qs.get('oficina'), qs.get('agente'), qs.get('clase'), qs.get('limite')]).toEqual(['11111111-1111-4111-8111-111111111111', 'cadena', 'brief', 'informe_de_analisis', '1'])
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('llave-de-prueba')
  })
  it('sin informe del perfil = sin_perfil (otro tipo de informe no cuenta)', async () => {
    const f = resp(200, adjunto([{ tipo: 'informe_de_mercado', texto: 'otra cosa' }]))
    expect(await perfilPorHttp({ base: 'https://x.test', llave: 'k', fetch: f as unknown as typeof fetch })('c', 'gran_idea')).toEqual({ estado: 'sin_perfil' })
  })
  it('los informes que el portero no pudo leer viajan DICHOS, no como «no hay»', async () => {
    const f = resp(200, adjunto([], { informes_estado: 'no_se_pudo_leer', informes_detalle: 'tiempo agotado' }))
    expect(await perfilPorHttp({ base: 'https://x.test', llave: 'k', fetch: f as unknown as typeof fetch })('c', 'brief')).toEqual({ estado: 'no_se_pudo_leer', detalle: 'tiempo agotado' })
  })
  it.each([
    ['un error de la puerta', () => resp(500, { error: 'x' }), /respondió 500/],
    ['una llave rechazada', () => resp(401, { error: 'unauthorized' }), /respondió 401/],
    ['una respuesta sin adjunto', () => resp(200, { ok: true, resultados: [] }), /no devolvió el adjunto/],
    ['un adjunto sin la lista de informes', () => resp(200, { ok: true, contexto_del_cliente: { resumen_vivo: {} } }), /no devolvió el adjunto/],
    ['una caída de red', () => vi.fn(async () => { throw new Error('ECONNRESET') }), /sin red/],
    ['un cuerpo que no es JSON', () => vi.fn(async () => new Response('<html>', { status: 200 })), /no devolvió el adjunto/],
  ])('%s = no_se_pudo_leer (nunca sin_perfil) y nunca lanza', async (_n, hacer, re) => {
    const p = await perfilPorHttp({ base: 'https://x.test', llave: 'k', fetch: hacer() as unknown as typeof fetch })('c', 'brief')
    expect(p.estado).toBe('no_se_pudo_leer')
    expect(p.estado === 'no_se_pudo_leer' ? p.detalle : '').toMatch(re)
  })
  it('sin base o sin llave no sale a la red y lo dice', async () => {
    const f = resp(200, adjunto([]))
    for (const cfg of [{ base: '', llave: 'k' }, { base: 'https://x.test', llave: '' }]) {
      expect((await perfilPorHttp({ ...cfg, fetch: f as unknown as typeof fetch })('c', 'brief')).estado).toBe('no_se_pudo_leer')
    }
    expect(f).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────── el perfil para una mesa
describe('perfilParaLaMesa', () => {
  it('un almacén sin lector = sin perfil (como hoy)', async () => {
    expect(await perfilParaLaMesa({}, 'c', 'brief')).toEqual({ estado: 'sin_perfil' })
  })
  it('un lector que lanza = no_se_pudo_leer con su motivo', async () => {
    expect(await perfilParaLaMesa({ perfilDelPublico: async () => { throw new Error('se cayó') } }, 'c', 'gran_idea')).toEqual({ estado: 'no_se_pudo_leer', detalle: 'se cayó' })
  })
})

// ─────────────────────────────────────────────── los marcos
describe('marcoDelBrief y marcoDelConcepto con el perfil', () => {
  const ctx = contextoDe(A)
  const baseBrief = { ctx, estrategia: A.estrategia, version: 1, devolucion: null, nota: null, informeDeMercado: 'Señal 1: desayunan temprano.' }
  const baseConcepto = { ctx, estrategia: A.estrategia, briefTexto: BRIEF_BUENO, version: 1, nota: null, inicio: A.campana.fecha_inicio, hoy: '2026-10-09' }

  it('sin perfil el marco queda BYTE A BYTE igual al de hoy (sin campo, null o sin_perfil)', () => {
    const hoyB = marcoDelBrief(baseBrief)
    expect(marcoDelBrief({ ...baseBrief, perfil: null })).toBe(hoyB)
    expect(marcoDelBrief({ ...baseBrief, perfil: { estado: 'sin_perfil' } })).toBe(hoyB)
    const hoyC = marcoDelConcepto(baseConcepto)
    expect(marcoDelConcepto({ ...baseConcepto, perfil: null })).toBe(hoyC)
    expect(marcoDelConcepto({ ...baseConcepto, perfil: { estado: 'sin_perfil' } })).toBe(hoyC)
  })
  it('con perfil vigente el bloque entra UNA vez, rotulado como observado y contexto, con su corte; el resto del marco no cambia', () => {
    for (const [con, sin] of [[marcoDelBrief({ ...baseBrief, perfil: VIGENTE }), marcoDelBrief(baseBrief)], [marcoDelConcepto({ ...baseConcepto, perfil: VIGENTE }), marcoDelConcepto(baseConcepto)]]) {
      expect(con.split(ENCABEZADO_DEL_PERFIL).length).toBe(2)
      expect(con).toContain(PERFIL_TEXTO)
      expect(con).toContain('Corte del perfil: 2026-10-01.')
      expect(con).toMatch(/OBSERVADO en voces públicas · no es dato del cliente · contexto, no mandato/)
      const bloque = `\n\n${ENCABEZADO_DEL_PERFIL}`
      expect(con.replace(new RegExp(`${bloque.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${PERFIL_TEXTO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')).toBe(sin)
    }
  })
  it('en el brief va después del informe de mercado; en la gran idea, después del brief validado', () => {
    const b = marcoDelBrief({ ...baseBrief, perfil: VIGENTE })
    expect(b.indexOf('# INFORME DE MERCADO')).toBeLessThan(b.indexOf(ENCABEZADO_DEL_PERFIL))
    expect(b.indexOf(ENCABEZADO_DEL_PERFIL)).toBeLessThan(b.indexOf('# PLAN'))
    const c = marcoDelConcepto({ ...baseConcepto, perfil: VIGENTE })
    expect(c.indexOf('# BRIEF CREATIVO DE LA CAMPAÑA')).toBeLessThan(c.indexOf(ENCABEZADO_DEL_PERFIL))
    expect(c.indexOf(ENCABEZADO_DEL_PERFIL)).toBeLessThan(c.indexOf('# ESTRATEGIA · fases'))
  })
  it('si no se pudo leer, el marco lo DICE y pide no atribuir frases al público', () => {
    const p: PerfilParaLectores = { estado: 'no_se_pudo_leer', detalle: 'x' }
    expect(marcoDelBrief({ ...baseBrief, perfil: p })).toContain(SIN_PERFIL_LEIDO)
    expect(marcoDelConcepto({ ...baseConcepto, perfil: p })).toContain(SIN_PERFIL_LEIDO)
  })
})

// ─────────────────────────────────────────────── las mesas abren con el perfil
describe('las mesas piden el perfil al almacén y lo ponen en el sobre', () => {
  it('el brief: cada apertura pide el perfil de ESE cliente para la mesa «brief»', async () => {
    const lector = vi.fn(async () => VIGENTE)
    const al = almacen(lector)
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.status).toBe(200)
    expect(marcoDe(r)).toContain(PERFIL_TEXTO)
    expect(lector).toHaveBeenCalledWith(A.clientId, 'brief')
  })
  it('sin lector en el almacén, el sobre del brief es el de siempre', async () => {
    const sin = await briefAbrir(almacen(), wf(), AHORA)
    const conVacio = await briefAbrir(almacen(async () => ({ estado: 'sin_perfil' })), wf(), AHORA)
    expect(marcoDe(conVacio)).toBe(marcoDe(sin))
    expect(marcoDe(sin)).not.toContain('PERFIL DEL PÚBLICO')
  })
  it('un lector que falla no tumba la mesa: el brief abre y dice «no disponible»', async () => {
    const r = await briefAbrir(almacen(async () => { throw new Error('caída') }), wf(), AHORA)
    expect(r.status).toBe(200)
    expect(marcoDe(r)).toContain(SIN_PERFIL_LEIDO)
  })
  it('la gran idea: la apertura y el reenvío del mismo sobre llevan el perfil (mesa «gran_idea»)', async () => {
    const lector = vi.fn(async () => VIGENTE)
    const al = almacen(lector)
    expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
    expect(await recibirBrief(al, { campana_id: CAMP, version: 1, encargo_id: 'enc-1', texto: BRIEF_BUENO, costo_usd: 0.1, motivo: null }, AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    const a = await conceptoAbrir(al, wf(), AHORA)
    expect(a.status, JSON.stringify(a.cuerpo)).toBe(200)
    expect(marcoDe(a)).toContain(PERFIL_TEXTO)
    const otraVez = await conceptoAbrir(al, wf(), AHORA)
    expect(otraVez.cuerpo.ya_abierta).toBe(true)
    expect(marcoDe(otraVez)).toBe(marcoDe(a))
    expect(lector).toHaveBeenCalledWith(A.clientId, 'gran_idea')
  })
})

// ─────────────────────────────────────────────── el aviso «frase del público sin fuente» en la gran idea
describe('leerConcepto · frase del público sin fuente', () => {
  const MD = (frase: string) => [
    '## Gran idea', '- nombre: La mesa larga', '- frase: Noventa días para sentarse juntos',
    '## Por qué funciona', `Como dice la gente «${frase}», y eso es la mesa.`,
    '## Cómo se ve', 'Luz cálida.', '## Cómo suena', 'Voz cercana.',
  ].join('\n')
  const ins = (perfil?: string | null): InsumosDelConcepto => ({ fases: [], redes: [], prohibidas: [], fotos: [], ...(perfil !== undefined ? { perfil_del_publico: perfil } : {}) })
  const avisoDe = (md: string, i: InsumosDelConcepto) => leerConcepto(md, i).avisos.filter((a) => a.startsWith('frase del público sin fuente'))

  it('sin el campo, el chequeo no corre (como hoy)', () => {
    expect(avisoDe(MD('el pan sale a las cinco'), ins())).toEqual([])
  })
  it('una frase atribuida al público que está textual en el perfil no avisa', () => {
    expect(avisoDe(MD('el pan todavía está caliente'), ins(PERFIL_TEXTO))).toEqual([])
  })
  it('una frase atribuida al público que NO está en el perfil avisa; y avisar no bloquea', () => {
    const md = MD('aquí el café es el mejor del mundo')
    expect(avisoDe(md, ins(PERFIL_TEXTO))).toEqual(['frase del público sin fuente: «aquí el café es el mejor del mundo» (se la atribuye al público y no está textual en el perfil del público)'])
    expect(leerConcepto(md, ins(PERFIL_TEXTO)).bloqueos).toEqual(leerConcepto(md, ins()).bloqueos)
  })
  it('sin perfil vigente (null), toda frase atribuida al público avisa', () => {
    expect(avisoDe(MD('el pan todavía está caliente'), ins(null))).toHaveLength(1)
  })
  it('insumosDelConcepto lleva el perfil solo si el almacén tiene lector (vigente = texto; otro estado = null)', async () => {
    const campana = { id: CAMP, client_id: A.clientId, plan_id: 'plan-1' }
    expect('perfil_del_publico' in (await insumosDelConcepto(almacen(), campana))).toBe(false)
    expect((await insumosDelConcepto(almacen(async () => VIGENTE), campana)).perfil_del_publico).toBe(PERFIL_TEXTO)
    expect((await insumosDelConcepto(almacen(async () => ({ estado: 'sin_perfil' })), campana)).perfil_del_publico).toBeNull()
    expect((await insumosDelConcepto(almacen(async () => { throw new Error('x') }), campana)).perfil_del_publico).toBeNull()
  })
})
