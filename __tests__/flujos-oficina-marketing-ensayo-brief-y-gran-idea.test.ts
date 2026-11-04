// @ts-nocheck · pruebas de los constructores de n8n: tipan mal a propósito los nodos de código (CI 04-nov)
/**
 * 01-nov · ENSAYO EN SECO de punta a punta del tramo «plan aprobado → brief de campaña → gran idea → tarjeta a Emilio» (ENCARGO LENOVO a CC2/CC3). US$ 0, sin red, sin modelo.
 * Se ejecuta el CÓDIGO REAL de los nodos de los flujos publicados (`nuevo/*.json`) y cada llamada HTTP llega a la RUTA REAL de la otra pieza (cadena en memoria + oficina en memoria).
 * Lo único simulado son los TEXTOS que entregarían los agentes (brief y gran idea de ejemplo del cliente de práctica de las pruebas de la cadena): ningún agente corre.
 * Fija: (1) sin plan aprobado la segunda mitad NO arranca; (2) con la palanca apagada no se abre ninguna mesa; (3) el tramo avanza solo hasta la tarjeta y SE DETIENE ahí
 * (sin calendario, sin piezas) hasta que Emilio decide; (4) cada paso deja su fila en seco y a costo 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'
import { ACCIONES } from '../src/lib/cadena/acciones'
import type { Campana, EstrategiaGuardada } from '../src/lib/cadena/almacen'
import { conceptoDecidir, recibirBrief, recibirConcepto } from '../src/lib/cadena/mesas'
import { avanzar } from '../src/lib/oficina/orquestador'
import { abrirMesaDeLaCadena, validarSobreDeLaCadena } from '../src/lib/oficina/mesa/de-la-cadena'
import { BRIEF_MESA } from '../src/lib/oficina/plantillas/mesa'
import { crearMemoria } from '../src/lib/oficina/__tests__/memoria'
import { crearMesaEnMemoria } from '../src/lib/oficina/__tests__/mesa-memoria'
import type { Tarjeta } from '../src/lib/oficina/mesa/tipos'
import { recorrer, type Http, type Item } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', `${id}.json`), 'utf8'))
const puerta = leer('pBAp5Cx7R39U585i'), planeacion = leer('X9F0zp6LQ2xGEYVS'), segundaMitad = leer('segundaMitadDelPlan')
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
const AHORA = '2026-10-09T12:00:00Z'
const A = { ...clienteA(), clientId: CLIENTE }
const web = (body: Record<string, unknown>, llave = 'llave-sala') => ({ headers: { 'x-sala-dispatch-key': llave }, body })

function cadena(o: { palanca?: boolean } = {}) {
  const al = new AlmacenMemoria({
    contextos: { [CLIENTE]: contextoDe(A) },
    planes: { [CLIENTE]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-puerta'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [CLIENTE], nuevo_orden: { clientes: o.palanca === false ? [] : [CLIENTE] } },
    journeys: [{ journeyId: 'journey-1', clientId: CLIENTE }],
  })
  const campana: Campana = {
    id: CAMPANA, client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMPANA, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  return al
}
const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['x'], necesita: ['x'], entrega: ['x'], pertinente_en, activo: true })
const DIRECTORIO = [tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']), tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']), tarjeta('content-creator', 'miembro', ['concepto']), tarjeta('design-visual-storyteller', 'miembro', ['concepto']), tarjeta('marketing_instagram_curator', 'miembro', ['concepto'])]

// 01-nov: las mesas de la cadena NO consultan oficina_config.familias_activas (solo la plantilla activa + nuevo_orden): la lista va vacía a propósito
function mundo(o: { palanca?: boolean } = {}) {
  const al = cadena(o)
  const M = crearMemoria({ plantilla: BRIEF_MESA, config: { familias_activas: [] } })
  M.P.mesa = crearMesaEnMemoria(DIRECTORIO)
  const llamadas: Array<{ ruta: string; cuerpo: any }> = []
  const http: Http = async (url, headers, cuerpo) => {
    const ruta = url.replace('https://api.test', '')
    llamadas.push({ ruta, cuerpo })
    if (ruta.startsWith('/api/cadena/')) {
      if (headers['x-api-key'] !== 'llave-interna') return { statusCode: 401, body: { error: 'llave' } }
      const grupo = ruta.split('/')[3] as 'brief' | 'concepto' | 'calendario'
      const r = await (ACCIONES as any)[grupo][cuerpo.accion](al, cuerpo, AHORA)
      return { statusCode: r.status, body: r.cuerpo }
    }
    if (ruta === '/api/oficina/encargos') {
      if (headers['x-sala-dispatch-key'] !== 'llave-sala') return { statusCode: 401, body: { error: 'llave' } }
      const v = validarSobreDeLaCadena(cuerpo)
      if (!v.ok) return { statusCode: 400, body: { error: 'entrada_invalida', errores: v.errores } }
      const r = await abrirMesaDeLaCadena(M.P, v.sobre, avanzar)
      return { statusCode: r.status, body: { ...r.cuerpo, despertado: true } }
    }
    throw new Error(`ruta no simulada: ${ruta}`)
  }
  return { al, M, http, llamadas }
}

const S = { client_id: CLIENTE, tenant_id: CLIENTE, _journey_id: 'journey-1', _sala_correlation_id: 'corr-1', campana_id: CAMPANA, dry_run: true, modo: 'abrir', efectivo: 'cadena', sigue: true, simulacros: null }
const SALIDA = (resultado: string, detalle: any = {}) => ({ paso: 'calendario', campana_id: CAMPANA, tanda: 1, resultado, alerta: null, fichas: [], fechas_pedidas: [], detalle })
const previos = { '2 · ¿Estrategia?': [S], '⓪ Decidir': [S] }

// los textos de ejemplo que entregarían los agentes (los mismos del cliente de práctica de las pruebas de la cadena)
const BRIEF = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie.', '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: pan de masa madre', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades', '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const CONCEPTO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos', '## Por qué funciona  El insight dice que la gente desayuna de pie.',
  '## Cómo se ve  Luz cálida.', '## Cómo suena  Voz cercana.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto',
].join('\n')

const preparar = (m: ReturnType<typeof mundo>) => m.http('https://api.test/api/cadena/calendario', { 'x-api-key': 'llave-interna' }, { accion: 'preparar', campana_id: CAMPANA, seco: true, tanda: 1, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' })
/** la puerta recibe lo que el calendario dijo EN VERDAD (la ruta real de `preparar`) y hace el paso que falta */
const puertaRecibe = async (m: ReturnType<typeof mundo>, modo: 'abrir' | 'tanda_siguiente' = 'abrir') => {
  const prep = await preparar(m)
  expect(prep.body).toMatchObject({ accion: 'esperar_concepto' })
  const desde = modo === 'abrir' ? '4 · ¿Calendario?' : 'Tanda · ¿resultado?'
  return { prep: prep.body, ...(await recorrer(puerta, desde, SALIDA('esperando_concepto', { ...prep.body, tanda: 1 }), { previos: { ...previos, '⓪ Decidir': [{ ...S, modo }] }, http: m.http, hasta: ['Cable · armar'] })) }
}

describe('ENSAYO · tramo 1 · sin plan aprobado NO arranca', () => {
  it('🔴 la planeación real (sin sin_compuerta) termina en la compuerta: nunca llama al sub-flujo ni escribe el cable a la sala', async () => {
    const r = await recorrer(planeacion, '¿Compuerta?', {}, { previos: { 'Webhook · planeacion': [web({ client_id: CLIENTE, dry_run: false })] }, hasta: ['Compuerta · esperar al dueño', 'Segunda mitad · sobre'] })
    expect(r.ultimo).toBe('Compuerta · esperar al dueño')
    expect(r.pasos).not.toContain('Segunda mitad · llamar')
  })
  it('🔴 desde el plan guardado de la planeación NO se llega nunca al PDF ni al cable «plan-listo · briefear» (solo por el sub-flujo, que despiertan la compuerta aprobada o la llamada directa)', () => {
    const alcanzables = (flujo: any, desde: string) => {
      const vistos = new Set<string>(); const cola = [desde]
      while (cola.length) { const n = cola.pop() as string; if (vistos.has(n)) continue; vistos.add(n); for (const g of flujo.connections[n]?.main ?? []) for (const c of g) cola.push(c.node) }
      return vistos
    }
    const deLaCompuerta = alcanzables(planeacion, 'Ciclo · armar cierres')
    expect(deLaCompuerta.has('Compuerta · esperar al dueño')).toBe(true)
    expect(deLaCompuerta.has('Segunda mitad · llamar')).toBe(true)
    for (const prohibido of ['Plan → Drive (PDF)', 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', 'Cable de vuelta · sala']) expect(deLaCompuerta.has(prohibido), prohibido).toBe(false)
    expect(alcanzables(segundaMitad, 'Plan vigente').has('BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')).toBe(true)
    const entradas = Object.entries(segundaMitad.connections).filter(([, c]: any) => JSON.stringify(c).includes('"Sobre"')).map(([de]) => de).sort()
    expect(entradas).toEqual(['Entrada · desde la planeación', '⓪ Llave · plan-aprobado'])
  })
  it('🔴 el webhook de la aprobación sin la llave de despacho (o con otra) se DETIENE antes de tocar nada', async () => {
    await expect(recorrer(segundaMitad, '⓪ Llave · plan-aprobado', web({ plan_id: 'x' }, 'otra'), { env: { SALA_DISPATCH_KEY: 'llave-sala' } })).rejects.toThrow(/FLUJO_PROCEDENCIA_INVALIDA/)
  })
})

describe('ENSAYO · tramo 2 · la puerta de la cadena (guardas de entrada)', () => {
  it('la puerta no arranca con la llave equivocada, sin viaje de la sala o sin dry_run explícito', async () => {
    const cuerpo = { client_id: CLIENTE, _journey_id: 'journey-1', dry_run: true, target_step_id: 'router.dispatch.planeacion/plan-listo.briefear' }
    expect((await recorrer(puerta, '⓪ Llave y origen', web(cuerpo), { hasta: ['⓪ ¿Existe el viaje?'] })).item).toMatchObject({ modo: 'abrir', dry_run: true })
    await expect(recorrer(puerta, '⓪ Llave y origen', web(cuerpo, 'mala'))).rejects.toThrow(/PUERTA_PROCEDENCIA_INVALIDA/)
    await expect(recorrer(puerta, '⓪ Llave y origen', web({ ...cuerpo, _journey_id: '' }))).rejects.toThrow(/PUERTA_SIN_VIAJE/)
    await expect(recorrer(puerta, '⓪ Llave y origen', web({ ...cuerpo, dry_run: undefined }))).rejects.toThrow(/PUERTA_DRY_RUN_AUSENTE/)
    await expect(recorrer(puerta, '⓪ Llave y origen', web({ ...cuerpo, target_step_id: 'otro' }))).rejects.toThrow(/PUERTA_ORIGEN_DESCONOCIDO/)
  })
  it('🔴 con la palanca apagada para el cliente ninguna mesa se abre (409) y la puerta se DETIENE: no hay fila de brief ni encargo', async () => {
    const m = mundo({ palanca: false })
    await expect(puertaRecibe(m)).rejects.toThrow()
    expect(m.al.briefsCreativos).toHaveLength(0)
    expect(m.M.encargos.size).toBe(0)
  })
  it('🔴 las DOS palancas hacen falta: con la cadena «apagada» (o el cliente fuera del ensayo) la entrada va por la pasarela de hoy aunque «nuevo_orden» esté encendida', async () => {
    const estado = async (al: AlmacenMemoria) => (await ACCIONES.campanas.estado(al, { client_id: CLIENTE, workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1' }, AHORA)).cuerpo
    expect(await estado(cadena())).toMatchObject({ estado_cadena: 'ensayo', modo: 'cadena' })
    const apagada = cadena(); apagada.config.set('estado_cadena', 'apagada')
    expect(await estado(apagada)).toMatchObject({ modo: 'pasarela' })
    const fuera = cadena(); fuera.config.set('clientes_ensayo', [])
    expect(await estado(fuera)).toMatchObject({ modo: 'pasarela' })
  })
})

describe('ENSAYO · tramo 3 · brief → gran idea → tarjeta, y SE DETIENE', () => {
  it('recorre cada paso con su fila en seco, costo 0 y llegada nodo por nodo', async () => {
    const m = mundo()
    const traza: string[] = []

    // ── paso 1 · el calendario de la tanda 1 dice «falta el brief»; la puerta abre la mesa del brief
    const a = await puertaRecibe(m)
    expect(a.prep).toMatchObject({ accion: 'esperar_concepto', falta: 'brief' })
    expect(a.pasos).toEqual(['4 · ¿Calendario?', 'Mesa · ¿espera la gran idea?', 'Mesa · qué sigue', 'Mesa · ¿hay una mesa que abrir?', 'Mesa · abrir en la cadena', 'Mesa · leer lo que abrió', 'Mesa · ¿llevarlo a la oficina?', 'Mesa · abrir en la oficina', 'Mesa · ¿abrió?', 'Cable · armar'])
    traza.push('brief abierto')
    expect(m.al.briefsCreativos[0]).toMatchObject({ version: 1, estado: 'borrador', seco: true })
    const encBrief = [...m.M.encargos.values()][0]
    expect(encBrief).toMatchObject({ familia: 'brief_mesa', parte_id: CAMPANA, estado: 'en_paso' })
    expect(a.item).toMatchObject({ resultado: 'cadena_abierta' })

    // ── paso 2 · la mesa entrega el brief (texto de ejemplo): validada por código, con el sobre para que la puerta vuelva a entrar
    const e1 = await recibirBrief(m.al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-brief', texto: BRIEF, costo_usd: 0, motivo: null }, AHORA)
    expect(e1).toMatchObject({ ok: true, estado: 'validada' })
    expect(m.al.briefsCreativos[0]).toMatchObject({ estado: 'validada', seco: true, costo_usd: 0 })
    traza.push('brief validado')

    // ── paso 3 · la puerta vuelve a entrar (modo tanda siguiente): falta la gran idea
    const b = await puertaRecibe(m, 'tanda_siguiente')
    expect(b.prep).toMatchObject({ accion: 'esperar_concepto', falta: 'concepto' })
    expect(b.item).toMatchObject({ resultado: 'cadena_abierta', modo: 'tanda_siguiente' })
    expect(m.al.conceptos[0]).toMatchObject({ version: 1, seco: true })
    expect([...m.M.encargos.values()].map((x: any) => x.familia).sort()).toEqual(['brief_mesa', 'concepto_mesa'])
    expect(m.llamadas.map((l) => l.ruta).filter((r) => r === '/api/oficina/encargos')).toHaveLength(2)
    traza.push('concepto abierto')

    // ── paso 4 · la mesa entrega la gran idea: queda LISTA; abre la tarjeta y la espera que no vence
    const e2 = await recibirConcepto(m.al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-concepto', texto: CONCEPTO, costo_usd: 0, motivo: null }, AHORA)
    expect(e2).toMatchObject({ ok: true, estado: 'lista' })
    expect(m.al.conceptos[0]).toMatchObject({ aprobacion: 'pendiente', seco: true, costo_usd: 0 })
    expect(m.al.tarjetas).toHaveLength(1)
    expect(m.al.tarjetas[0]).toMatchObject({ status: 'pending' })
    traza.push('tarjeta a Emilio')

    // ── paso 5 · SE DETIENE: el calendario sigue esperando la firma de Emilio y la puerta no llama a nadie
    const antes = m.llamadas.length
    const c = await puertaRecibe(m)
    expect(c.prep).toMatchObject({ accion: 'esperar_concepto', falta: 'aprobacion' })
    expect(m.llamadas.slice(antes).map((l) => l.ruta)).toEqual(['/api/cadena/calendario']) // solo la consulta del calendario; ninguna mesa, ningún sobre
    expect(c.pasos).toEqual(['4 · ¿Calendario?', 'Mesa · ¿espera la gran idea?', 'Mesa · qué sigue', 'Mesa · ¿hay una mesa que abrir?', 'Cable · armar'])
    expect(m.al.campanas[0].estado).toBe('calendario') // no pasó a activa: sin calendario ordenado, sin piezas
    traza.push('detenido en la tarjeta')

    // ── la suma de todo lo que costó el ensayo
    expect(m.al.briefsCreativos.concat(m.al.conceptos as any).reduce((s: number, x: any) => s + Number(x.costo_usd || 0), 0)).toBe(0)
    expect(traza).toEqual(['brief abierto', 'brief validado', 'concepto abierto', 'tarjeta a Emilio', 'detenido en la tarjeta'])
  })

  it('la firma de Emilio es lo que libera el calendario: aprobar cambia lo que `preparar` contesta (y ahí termina este ensayo)', async () => {
    const m = mundo()
    await puertaRecibe(m)
    await recibirBrief(m.al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-brief', texto: BRIEF, costo_usd: 0, motivo: null }, AHORA)
    await puertaRecibe(m, 'tanda_siguiente')
    await recibirConcepto(m.al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-concepto', texto: CONCEPTO, costo_usd: 0, motivo: null }, AHORA)
    expect((await preparar(m)).body).toMatchObject({ accion: 'esperar_concepto', falta: 'aprobacion' })
    const d = await conceptoDecidir(m.al, { workflow_id: 'tablero', workflow_execution_id: 'tablero:hitl-1:2026-10-09T12:00:00Z', campana_id: CAMPANA, decision: 'aprobar', autor: 'emilio' }, AHORA)
    expect(d.status, JSON.stringify(d.cuerpo)).toBe(200)
    expect((await preparar(m)).body.accion).not.toBe('esperar_concepto') // desde aquí corre el calendario: NO se ensaya aquí
  })

  it('un brief que no pasa el lector se devuelve con los puntos y no abre la gran idea (UNA reapertura; la segunda, a una persona)', async () => {
    const m = mundo()
    await puertaRecibe(m)
    const r = await recibirBrief(m.al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-brief', texto: '## Insight\nsolo esto', costo_usd: 0, motivo: null }, AHORA)
    expect(r).toMatchObject({ ok: true })
    expect(['devuelta', 'descartada']).toContain((r as any).estado)
    expect(m.al.conceptos).toHaveLength(0)
  })
})

describe('ENSAYO · un brief que rebasa el tope (cerrado_por_tope) no deja a la campaña en limbo', () => {
  it('entrega parcial por tope: se devuelve, la puerta reabre UNA vez (v2) y una segunda entrega mala deja la campaña en necesita_humano con aviso', async () => {
    const m = mundo()
    await puertaRecibe(m)
    const parcial = BRIEF.split('\n').slice(0, 6).join('\n') // el brief se cortó a la mitad
    const r1 = await recibirBrief(m.al, { campana_id: CAMPANA, version: 1, encargo_id: 'enc-1', texto: parcial, costo_usd: 1.6, motivo: 'cerrado_por_tope' }, AHORA)
    expect(r1).toMatchObject({ ok: true })
    expect(['devuelta', 'descartada']).toContain((r1 as any).estado)
    // la puerta vuelve a entrar: la cadena abre la versión 2 (una sola reapertura)
    const b = await puertaRecibe(m, 'tanda_siguiente')
    expect(m.al.briefsCreativos.map((x: any) => x.version)).toEqual([1, 2])
    expect(b.item).toMatchObject({ resultado: 'cadena_abierta' })
    // la versión 2 también llega cortada: ya no hay otra reapertura
    const r2 = await recibirBrief(m.al, { campana_id: CAMPANA, version: 2, encargo_id: 'enc-2', texto: parcial, costo_usd: 1.6, motivo: 'cerrado_por_tope' }, AHORA)
    expect(r2).toMatchObject({ ok: true })
    const c = await puertaRecibe(m, 'tanda_siguiente').catch((e) => ({ error: String(e) }))
    const estadoCampana = m.al.campanas[0].estado
    expect(estadoCampana).toBe('necesita_humano')
    expect(m.al.briefsCreativos).toHaveLength(2) // nunca una tercera versión
    expect(m.al.conceptos).toHaveLength(0) // y nunca se abrió la gran idea sobre un brief sin validar
  })
})

describe('ENSAYO · cada llamada del tramo lleva su contexto de flujo (cero invocaciones fuera de un flujo)', () => {
  it('las llamadas de la puerta a la cadena llevan workflow_id y workflow_execution_id; las de la oficina, la llave de despacho', async () => {
    const m = mundo()
    await puertaRecibe(m)
    for (const l of m.llamadas.filter((x) => x.ruta.startsWith('/api/cadena/'))) expect(l.cuerpo).toMatchObject({ workflow_id: expect.any(String), workflow_execution_id: expect.any(String) })
    const aOficina = m.llamadas.filter((x) => x.ruta === '/api/oficina/encargos')
    expect(aOficina.length).toBeGreaterThan(0)
    for (const l of aOficina) expect(l.cuerpo).toMatchObject({ origen: 'cadena', dry_run: true })
  })
})

void ({} as Item)
