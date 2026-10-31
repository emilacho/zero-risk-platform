/**
 * T5 · paso 2 · la PARTE POR FILAS con el nuevo orden: la hoja de producción la escribe el código · US$ 0, sin red, sin modelo.
 * Se ejecuta el CÓDIGO REAL de los nodos del flujo nuevo (`scripts/ops/oficina-marketing/nuevo/BNXqlaX1oHSfZIpF.json`) y cada llamada HTTP llega a la RUTA REAL `/api/cadena/hojas` (T3, sobre el almacén en memoria).
 * Lo que fija: con la palanca el parte sale de la hoja (formato que lee la oficina, procedencia, costo 0, sin llamar al redactor); sin ella el camino es el de hoy; cualquier otro fallo DETIENE (no cae al redactor).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'
import { ACCIONES } from '../src/lib/cadena/acciones'
import type { Campana, EstrategiaGuardada } from '../src/lib/cadena/almacen'
import { sobresDeProducir } from '../src/lib/cadena/autoproducir'
import { parsearBrief } from '../src/lib/oficina/brief'
import { recorrer, type Http } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (carpeta: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, 'BNXqlaX1oHSfZIpF.json'), 'utf8'))
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
const AHORA = '2026-10-09T12:00:00Z'
const A = { ...clienteA(), clientId: CLIENTE }

const BRIEF = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const CONCEPTO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  El insight del brief dice que la gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Cómo suena  Voz cercana, frases cortas.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: ninguna · foto:ninguna',
  '- C1-I03 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto, no de la mesa',
].join('\n')

const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1', campana_id: CAMPANA, ...extra })
const fila = (id: string, red: string, formato: string, idea: string | null, dia: number) => ({
  id, tanda: 1, semana: 1, dia_semana: dia, fecha: `2026-10-${String(12 + dia).padStart(2, '0')}`, hora: '09:00', red, formato, pilar: 'comunidad', tema: 'la mesa', sede: null, requiere_abierto: false, depende_de: [], datos: [], pendientes: [],
  pieza_fija: null, origen: 'agente' as const, estado: 'lista_para_brief' as any, avisos: [], fase: 'f1', idea_ref: idea,
})

async function cadena(o: { palanca?: boolean; conGranIdea?: boolean } = {}) {
  const al = new AlmacenMemoria({
    contextos: { [CLIENTE]: contextoDe(A) },
    planes: { [CLIENTE]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-puerta'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [CLIENTE], nuevo_orden: { clientes: o.palanca === false ? [] : [CLIENTE] } },
    journeys: [{ journeyId: 'journey-1', clientId: CLIENTE }],
  })
  const campana: Campana = {
    id: CAMPANA, client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  // la base real trae la familia por formato (columna de r63); el ensayo la pone a mano para que la hoja salga con sala
  const f0 = al.formatos.bind(al)
  al.formatos = async () => { const base = await f0(); return Object.fromEntries(Object.entries(base).map(([red, fs]) => [red, fs.map((f) => ({ ...f, familia: 'imagen_fija' }))])) }
  const estrategia: EstrategiaGuardada = { campana_id: CAMPANA, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  if (o.palanca !== false && o.conGranIdea !== false) {
    const { briefAbrir, recibirBrief, conceptoAbrir, recibirConcepto } = await import('../src/lib/cadena/mesas')
    expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
    expect(await recibirBrief(al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-1', texto: BRIEF, costo_usd: 0.1, motivo: null }, AHORA)).toEqual({ ok: true, estado: 'validada' })
    expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200)
    expect(await recibirConcepto(al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-2', texto: CONCEPTO, costo_usd: 0.1, motivo: null }, AHORA)).toEqual({ ok: true, estado: 'lista' })
    const d = await (ACCIONES as any).concepto.decidir(al, wf({ decision: 'aprobar' }), AHORA)
    expect(d.status, JSON.stringify(d.cuerpo)).toBe(200)
    await al.guardarFilas(CAMPANA, 1, 0, [fila('F1-S1-ig-01', 'instagram', 'carrusel', 'C1-I01', 1), fila('F1-S1-ig-02', 'instagram', 'foto', 'C1-I02', 2), fila('F1-S1-fb-03', 'facebook', 'foto', 'C1-I03', 3)] as any)
  }
  return al
}

function mundo(al: AlmacenMemoria) {
  const llamadas: Array<{ ruta: string; cuerpo: any }> = []
  const http: Http = async (url, headers, cuerpo) => {
    const ruta = url.replace('https://api.test', '')
    llamadas.push({ ruta, cuerpo })
    if (ruta !== '/api/cadena/hojas') throw new Error(`ruta no simulada: ${ruta}`)
    if (headers['x-api-key'] !== 'llave-interna') return { statusCode: 401, body: { error: 'llave' } }
    const r = await (ACCIONES as any).hojas[cuerpo.accion](al, cuerpo, AHORA)
    return { statusCode: r.status, body: r.cuerpo }
  }
  return { http, llamadas }
}

/** lo que «③ Armar el cuerpo del redactor» deja (el contexto del lote que sigue todo el flujo) */
const CONTEXTO = {
  client_id: CLIENTE, tenant_id: CLIENTE, client_name: 'Cafetería de práctica', campana_id: CAMPANA, plan_id: 'plan-1', manual_id: 'man-1', manual_version: 3, lote: '2026-W42', lote_key: 'camp:v1:ids',
  fila_ids: ['F1-S1-ig-01', 'F1-S1-ig-02', 'F1-S1-fb-03'], filas_lote: [{ id: 'F1-S1-ig-01', familia: 'imagen_fija' }, { id: 'F1-S1-ig-02', familia: 'imagen_fija' }, { id: 'F1-S1-fb-03', familia: 'imagen_fija' }],
  dry_run: true, _journey_id: 'journey-1', _sala_correlation_id: 'corr-1', plan_texto: 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».', forbidden_words: ['barato', 'gratis'], required_terminology: ['pan de masa madre'],
  cuerpo: { agent: 'campaign-brief-agent', dry_run: true },
}

describe('el flujo nuevo se parece al vivo en todo menos en lo que debe cambiar', () => {
  const vivo = leer('vivo'), nuevo = leer('nuevo')
  it('suma 5 nodos «③ Hoja · …», cambia solo el redireccionamiento de «③ Armar…» y el código de «④ Chequeos» (que ahora empieza con el atajo)', () => {
    const v = new Map(vivo.nodes.map((n: any) => [n.name, n]))
    const cambiados = nuevo.nodes.filter((n: any) => v.has(n.name) && JSON.stringify(v.get(n.name)) !== JSON.stringify(n)).map((n: any) => n.name)
    expect(cambiados).toEqual(['④ Chequeos'])
    expect(nuevo.nodes.filter((n: any) => !v.has(n.name)).map((n: any) => n.name).sort()).toEqual(['③ Hoja · armar el pedido', '③ Hoja · como vuelta', '③ Hoja · pedir a la cadena', '③ Hoja · qué sigue', '③ Hoja · ¿por código?'])
    const viejoChequeos = (v.get('④ Chequeos') as any).parameters.jsCode
    expect(nuevo.nodes.find((n: any) => n.name === '④ Chequeos').parameters.jsCode.endsWith(viejoChequeos)).toBe(true)
    for (const k of Object.keys(vivo.connections)) if (k !== '③ Armar el cuerpo del redactor') expect(nuevo.connections[k]).toEqual(vivo.connections[k])
    expect(nuevo.connections['③ Armar el cuerpo del redactor'].main[0][0].node).toBe('③ Hoja · armar el pedido')
    expect(new Set(nuevo.nodes.map((n: any) => n.id)).size).toBe(nuevo.nodes.length)
  })
  it('es determinista y no lleva llaves pegadas', async () => {
    const { construirParte } = await import('../scripts/ops/oficina-marketing/construir-parte.mjs')
    expect(JSON.stringify(construirParte())).toBe(JSON.stringify(nuevo))
    expect(JSON.stringify(nuevo)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|xox[abp]-/)
  })
})

describe('con la palanca: el parte sale de la hoja por código (contra la ruta REAL)', () => {
  it('pide la hoja por fila_ids, no llama al redactor y arma la salida que esperan los nodos de abajo', async () => {
    const m = mundo(await cadena())
    const r = await recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: m.http, hasta: ['⑤ ¿Modo seco?'] })
    expect(r.pasos).toEqual(['③ Hoja · armar el pedido', '③ Hoja · pedir a la cadena', '③ Hoja · qué sigue', '③ Hoja · ¿por código?', '③ Hoja · como vuelta', '④ Chequeos', '⑤ ¿Modo seco?'])
    expect(m.llamadas).toHaveLength(1)
    expect(m.llamadas[0].cuerpo).toMatchObject({ accion: 'escribir', campana_id: CAMPANA, fila_ids: CONTEXTO.fila_ids, lote_key: 'camp:v1:ids', manual_version: '3', workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' })
    const o = r.historial['④ Chequeos'][0]
    expect(o).toMatchObject({ client_id: CLIENTE, plan_id: 'plan-1', manual_id: 'man-1', llego_la_vuelta: true, simulacro_usado: false, vuelta_costo_usd: 0, vuelta_modelo: 'codigo:hoja.v1', parte_legible: true, parte_valido: true, motivo_invalido: null, chequeos_ok: true, entregables: 3 })
    expect(o.fila_parte).toMatchObject({ client_id: CLIENTE, output_type: 'campaign_brief_pack', status: 'draft', producing_agent: 'campaign-brief-agent' })
    expect(o.fila_parte.content).toBe(o.parte_md)
    expect(o.payload_cable).toMatchObject({ event_type: 'run_completed', worker_id: 'pBAp5Cx7R39U585i', worker_name: 'brief', resultado: 'lote_briefeado', client_id: CLIENTE, _sala_correlation_id: 'corr-1' })
    const t = o.fila_parte.provenance_tag
    expect(t).toMatchObject({ fuente: 'brief', hoja: true, contrato: 'hoja.v1', valido: true, legible: true, costo_usd: 0, dry_run: true, plan_id: 'plan-1', campana_id: CAMPANA, lote: '2026-W42', entregables: 3, guardado_antes_de_drive: true })
    expect(t.familias_por_brief).toEqual([
      { brief_id: 'F1-S1-ig-01', fila_id: 'F1-S1-ig-01', familia: 'imagen_fija' }, { brief_id: 'F1-S1-ig-02', fila_id: 'F1-S1-ig-02', familia: 'imagen_fija' }, { brief_id: 'F1-S1-fb-03', fila_id: 'F1-S1-fb-03', familia: 'imagen_fija' },
    ])
  })
  it('el contenido guardado es EXACTAMENTE lo que lee la oficina (`parsearBrief`) y lo que autoproduce (`sobresDeProducir`)', async () => {
    const m = mundo(await cadena())
    const r = await recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: m.http, hasta: ['⑤ ¿Modo seco?'] })
    const o = r.historial['④ Chequeos'][0]
    const b = parsearBrief(o.fila_parte.content, 'F1-S1-ig-01')!
    expect(b).not.toBeNull()
    expect(b.mensaje).toBe('aquí siempre hay una silla para ti')
    expect(b.protagonista).toBe('la silla')
    const { sobres, omitidos } = sobresDeProducir({ id: 'parte-1', client_id: CLIENTE, valido: o.parte_valido, briefs: o.fila_parte.provenance_tag.familias_por_brief }, { dry_run: true })
    expect(omitidos).toEqual([])
    expect(sobres.map((s) => (s.payload as any).brief_id)).toEqual(['F1-S1-ig-01', 'F1-S1-ig-02', 'F1-S1-fb-03'])
    expect((sobres[0].payload as any).familia).toBe('imagen_fija')
  })
  it('una fila sin idea del banco NO tumba el parte: queda DECLARADA como hallazgo (aviso), no fatal', async () => {
    const al = await cadena()
    ;(al.filasGuardadas.find((f) => f.id === 'F1-S1-ig-02') as any).idea_ref = null
    const m = mundo(al)
    const r = await recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: m.http, hasta: ['⑤ ¿Modo seco?'] })
    const o = r.historial['④ Chequeos'][0]
    expect(o.parte_valido).toBe(true)
    expect(o.chequeos_ok).toBe(false)
    expect(o.hallazgos).toEqual([{ chequeo: 'aviso_de_la_hoja', entregable: null, detalle: expect.stringContaining('F1-S1-ig-02: sin idea del banco') }])
    expect(o.por_chequeo).toEqual({ aviso_de_la_hoja: 1 })
    expect(o.fila_parte.provenance_tag.hallazgos).toBe(1)
  })
})

describe('sin la palanca el camino es el de hoy; y todo lo demás DETIENE', () => {
  it('palanca apagada (409 E-NUEVO-ORDEN-APAGADO): sigue al redactor con el cuerpo de siempre, sin tocar nada', async () => {
    const m = mundo(await cadena({ palanca: false }))
    const r = await recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: m.http, hasta: ['③ Redactor (run-sdk)'] })
    expect(r.ultimo).toBe('③ Redactor (run-sdk)')
    expect(r.pasos).toEqual(['③ Hoja · armar el pedido', '③ Hoja · pedir a la cadena', '③ Hoja · qué sigue', '③ Hoja · ¿por código?', '③ Redactor (run-sdk)'])
    expect(r.item).toMatchObject({ via: 'redactor', cuerpo: CONTEXTO.cuerpo, fila_ids: CONTEXTO.fila_ids, lote_key: 'camp:v1:ids' })
    expect(m.llamadas).toHaveLength(1)
    // y el nodo que paga recibe lo mismo que hoy: `$json.cuerpo`
    expect(r.item.hoja).toBeUndefined()
  })
  it('🔴 con la palanca pero SIN gran idea aprobada: se DETIENE con el código (NO cae al redactor)', async () => {
    const al = await cadena({ conGranIdea: false })
    const m = mundo(al)
    await expect(recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: m.http, hasta: ['③ Redactor (run-sdk)'] })).rejects.toThrow(/PARTE_HOJA_E-SIN-BRIEF/)
  })
  it('🔴 sin filas que coincidan: se DETIENE (E-SIN-FILAS)', async () => {
    const m = mundo(await cadena())
    await expect(recorrer(leer('nuevo'), '③ Hoja · armar el pedido', { ...CONTEXTO, fila_ids: ['no-existe'] }, { http: m.http, hasta: ['③ Redactor (run-sdk)'] })).rejects.toThrow(/PARTE_HOJA_E-SIN-FILAS/)
  })
  it('🔴 la cadena no contesta (error de red) o contesta 401: se DETIENE, no se pasa al redactor', async () => {
    const red: Http = async () => { throw new Error('ECONNRESET') }
    await expect(recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: red, hasta: ['③ Redactor (run-sdk)'] })).rejects.toThrow(/ECONNRESET/)
    const noAut: Http = async () => ({ statusCode: 401, body: { error: 'llave' } })
    await expect(recorrer(leer('nuevo'), '③ Hoja · armar el pedido', CONTEXTO, { http: noAut, hasta: ['③ Redactor (run-sdk)'] })).rejects.toThrow(/PARTE_HOJA_llave/)
  })
  it('un lote sin fila_ids no sale a la red (se detiene en el primer nodo)', async () => {
    const m = mundo(await cadena())
    await expect(recorrer(leer('nuevo'), '③ Hoja · armar el pedido', { ...CONTEXTO, fila_ids: [] }, { http: m.http })).rejects.toThrow(/PARTE_HOJA_SIN_LOTE/)
    expect(m.llamadas).toEqual([])
  })
  it('el atajo de «④ Chequeos» no se activa solo: sin `hoja_por_codigo` el nodo es el de hoy (la vuelta ilegible sigue dando parte no válido)', async () => {
    const r = await recorrer(leer('nuevo'), '④ Chequeos', { ...CONTEXTO, llego_la_vuelta: false, motivo: 'la vuelta del redactor NO llegó', texto: '', caracteres: 0, falla_del_redactor: null, vuelta_costo_usd: null }, { hasta: ['⑤ ¿Modo seco?'] })
    const o = r.historial['④ Chequeos'][0]
    expect(o.parte_valido).toBe(false)
    expect(o.motivo_invalido).toMatch(/la vuelta del redactor NO llegó/)
    expect(o.fila_parte.provenance_tag.hoja).toBeUndefined()
  })
})

describe('chequeos sobre el texto final de la hoja (pedido de CC3)', () => {
  const correr = async (al: AlmacenMemoria, ctx: Record<string, unknown> = {}) => {
    const m = mundo(al)
    const r = await recorrer(leer('nuevo'), '③ Hoja · armar el pedido', { ...CONTEXTO, ...ctx }, { http: m.http, hasta: ['⑤ ¿Modo seco?'] })
    return r.historial['④ Chequeos'][0]
  }
  it('🔴 un formato sin familia DETIENE el flujo (no es un aviso mudo)', async () => {
    const al = await cadena()
    al.formatos = async () => ({ instagram: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 3, max_por_dia: 3 }, { formato: 'foto', produccion: 'opera', lead_dias: 3, max_por_dia: 3 }], facebook: [{ formato: 'foto', produccion: 'opera', lead_dias: 3, max_por_dia: 3 }] }) as any
    await expect(correr(al)).rejects.toThrow(/PARTE_HOJA_SIN_FAMILIA/)
  })
  it('una palabra prohibida del manual en lo que la hoja pide se DECLARA; en las listas PROHIBIDO / NEGATIVOS no cuenta', async () => {
    const o = await correr(await cadena(), { forbidden_words: ['silla', 'precios'] })
    const h = o.hallazgos.filter((x: any) => x.chequeo === 'palabra_prohibida').map((x: any) => x.detalle)
    expect(h.some((d: string) => d.includes('«silla»'))).toBe(true)
    expect(h.some((d: string) => d.includes('«precios»'))).toBe(false) // «precios» solo aparece en la lista de lo que no se dice
    expect(o.parte_valido).toBe(true) // como en el nodo de hoy, no es fatal
    expect(o.por_chequeo.palabra_prohibida).toBeGreaterThan(0)
  })
  it('una cifra «,77» en la hoja la vuelve NO VÁLIDA (fatal, como en el nodo de hoy)', async () => {
    const al = await cadena()
    ;Object.assign(al.filasGuardadas.find((f) => f.id === 'F1-S1-ig-01') as any, { tema: 'promo de 47,77 dólares', idea_ref: null })
    const o = await correr(al)
    expect(o.parte_valido).toBe(false)
    expect(o.motivo_invalido).toMatch(/centinela/)
    expect(o.payload_cable.resultado).toBe('parte_no_valido')
    expect(o.fila_parte.content).toMatch(/PARTE NO VÁLIDO/)
  })
  it('sin palabras prohibidas ni cifras raras: limpio', async () => {
    const o = await correr(await cadena(), { forbidden_words: ['barato', 'gratis'] })
    expect(o.hallazgos).toEqual([])
    expect(o.parte_valido).toBe(true)
  })
})
