/**
 * ENSAYO DEL TRASPASO CALENDARIO → BRIEF (CC#3 · 19-oct · arreglo 4 del encargo «arreglos de la cadena 1-5»). US$ 0: sin red, sin modelo, sin escribir en ninguna base.
 *
 * Qué prueba: que una fila del calendario que la cadena abre llega, por el camino real (vigía → sobre a la sala → puerta en modo «parte» → webhook `cadena-parte` → COPIA «parte por filas»),
 * a producir su brief. La copia que se ejecuta es la versión VIVA (r80-ARREGLADO: su código idéntico al de n8n el 19-oct, comprobado nodo por nodo). El redactor va con `_simulacro_respuesta`
 * (solo vale en seco). El almacén de la cadena es el de memoria con los MANEJADORES REALES de las rutas.
 * Cliente sintético (cafetería de barrio): nada de esto depende de un cliente concreto.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ACCIONES } from '../acciones'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { SimuladorN8n, type FlujoN8n, type Item, type PeticionHttp, type RespuestaHttp } from '../__fixtures__/simulador-n8n'
import { clienteA, contextoDe, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'

const RAIZ = resolve(__dirname, '..', '..', '..', '..')
const AHORA = '2026-10-09T12:00:00Z'
const UUID = '11111111-1111-4111-8111-111111111111'
const IDS = { estrategia: 'F-EST', calendario: 'F-CAL', fechas: 'F-FEC', puerta: 'F-PUE' }
const ID_VIGIA = 'F-VIG', ID_PARTE = 'F-PAR', ID_COPIA_VIVA = 'F-COPIA-VIVA'
const ENV = {
  SALA_DISPATCH_KEY: 'k-sala', INTERNAL_API_KEY: 'k-int', SALA_INGRESS_API_KEY: 'k-ing', SLACK_BOT_TOKEN: 'xoxb-prueba', ZERO_RISK_API_URL: 'https://api.test', N8N_PUBLIC_URL: 'https://n8n.test',
  SALA_CALLBACK_API_KEY: 'k-cb', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'k-db',
}

let POR_ID: Record<string, FlujoN8n> = {}
beforeAll(async () => {
  const mod: any = await import(/* @vite-ignore */ pathToFileURL(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'construir.mjs')).href)
  const vivo = (f: string) => JSON.parse(readFileSync(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'vivos', f), 'utf8'))
  const F = mod.construirFlujos({ ids: IDS, parteViva: vivo('PQdIgbuFexuBsoh8.json'), planViva: vivo('X9F0zp6LQ2xGEYVS.json') })
  const copiaViva = JSON.parse(readFileSync(join(RAIZ, 'scripts', 'worker-staging', 'cadena', 'copia-r80-ARREGLADO.json'), 'utf8')) as FlujoN8n
  POR_ID = {
    [IDS.estrategia]: F['cadena-estrategia'], [IDS.calendario]: F['cadena-calendario'], [IDS.fechas]: F['cadena-fechas'], [IDS.puerta]: F['cadena-puerta'],
    [ID_VIGIA]: F['cadena-vigia'], [ID_PARTE]: F['cadena-parte-por-filas'], [ID_COPIA_VIVA]: copiaViva,
  }
})

interface Registro { escrituras: PeticionHttp[]; parte: PeticionHttp[]; agente: PeticionHttp[]; drive: PeticionHttp[]; intake: any[]; cable: any[]; autoproducir: any[] }
function clienteUuid(): ClienteFixture {
  const c = clienteA()
  c.clientId = UUID
  c.referencias = c.referencias.map((r) => ({ ...r, client_id: UUID }))
  return c
}
function mundo(cliente = clienteUuid()) {
  const al = new AlmacenMemoria({
    contextos: { [UUID]: contextoDe(cliente) }, planes: { [UUID]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, journeys: [{ journeyId: 'viaje-1', clientId: UUID }],
    config: { flujos: [...Object.values(IDS), ID_VIGIA, ID_PARTE, ID_COPIA_VIVA], puerta_workflow_id: IDS.puerta, estado_cadena: 'ensayo', clientes_ensayo: [UUID] },
  })
  const reg: Registro = { escrituras: [], parte: [], agente: [], drive: [], intake: [], cable: [], autoproducir: [] }
  const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
    const u = new URL(p.url)
    if (u.pathname.startsWith('/api/cadena/')) {
      if (p.cabeceras['x-api-key'] !== ENV.INTERNAL_API_KEY) return { statusCode: 401, body: { error: 'unauthorized' } }
      const ruta = u.pathname.split('/')[3] as keyof typeof ACCIONES
      const accion = String((p.cuerpo as any)?.accion)
      if (accion === 'autoproducir') reg.autoproducir.push(p.cuerpo)
      const m = ACCIONES[ruta]?.[accion]
      if (!m) return { statusCode: 400, body: { error: 'accion_desconocida', accion } }
      const r = await m(al, p.cuerpo as Record<string, unknown>, AHORA)
      return { statusCode: r.status, body: r.cuerpo }
    }
    if (u.pathname === '/api/agents/run-sdk') { reg.agente.push(p); return { statusCode: 200, body: { success: true, response: '' } } }
    if (u.pathname === '/api/sala/callback') { reg.cable.push(p.cuerpo); return { statusCode: 200, body: { ok: true, event_id: 'ev-1' } } }
    if (u.pathname === '/api/sala/intake') { reg.intake.push(p.cuerpo); return { statusCode: 200, body: { ok: true, kind: 'accepted' } } }
    if (u.pathname === '/webhook/zero-risk/cadena-parte') { reg.parte.push(p); return { statusCode: 200, body: {} } }
    if (u.pathname === '/webhook/zero-risk/texto-a-drive') { reg.drive.push(p); return { statusCode: 200, body: {} } }
    if (u.pathname === '/rest/v1/client_brand_books') return { statusCode: 200, body: [{ id: 'manual-1', client_id: UUID, version: 1, gate_outcome: 'paso_la_vara', created_at: '2026-10-01T00:00:00Z', forbidden_words: cliente.forbiddenWords, required_terminology: [], content_text: contextoDe(cliente).manualTexto, voice_description: 'Tutea', writing_style: '', tone_guidelines: '' }] }
    if (u.pathname === '/rest/v1/clients') return { statusCode: 200, body: [{ id: UUID, name: 'Cafetería de práctica', country: 'país de práctica', market: 'práctica', config: {} }] }
    if (u.pathname === '/rest/v1/client_historical_outputs') {
      if (p.metodo !== 'GET') { reg.escrituras.push(p); return { statusCode: 201, body: [{ id: 'nuevo' }] } }
      if (u.search.includes('campaign_plan_90d')) return { statusCode: 200, body: [{ id: 'plan-1', created_at: '2026-10-08T00:00:00Z', title: 'Plan de práctica', content_text: cliente.planTexto, status: 'draft' }] }
      return { statusCode: 200, body: [] } // «¿ya hay parte de este lote?»: no
    }
    if (p.metodo !== 'GET') reg.escrituras.push(p)
    throw new Error('el simulador no conoce esta dirección: ' + p.metodo + ' ' + p.url)
  }
  return { al, sim: new SimuladorN8n({ flujos: POR_ID, env: ENV, http }), reg, cliente }
}

const entrada = (cuerpo: Record<string, unknown>, llave = 'k-sala'): Item[] => [{ json: { headers: { 'x-sala-dispatch-key': llave }, body: cuerpo } }]

const TIPO: Record<string, string> = { foto: 'imagen', carrusel: 'carrusel', historia: 'historia', anuncio_imagen: 'imagen' }
/** lo que el redactor devolvería: UN brief por fila del lote (texto genérico; la forma es la del contrato del parte) */
function parteDelRedactor(filas: Array<{ id: string; red: string; formato: string; tema: string | null }>) {
  return JSON.stringify({
    parte: {
      entregables: filas.map((f, i) => ({
        id: 'BRF-' + String(i + 1).padStart(4, '0'), fila_id: f.id, plataforma: f.red.charAt(0).toUpperCase() + f.red.slice(1), tipo_de_pieza: TIPO[f.formato] ?? f.formato,
        que_es: 'Publicación de ' + f.formato + ' para ' + f.red, de_que_parte_del_plan: 'Plan de 90 días', objetivo: 'Dar a conocer la carta de la casa',
        segmento: 'Vecinos del barrio que ya conocen el lugar', protagonista: 'El café de la casa', mensaje: 'Un mensaje único: ' + (f.tema ?? 'la carta'),
        hipotesis: 'Si se muestra el producto real, la respuesta sube frente a una imagen genérica', limites: 'Titular corto',
        vocabulario_obligatorio: [], prohibido: [], sintaxis: 'Frase completa en móvil', visual: { capa_que_manda: 'producto', descripcion: 'plano cenital sobre mesa clara', muestra: 'foto propia' },
        llamado_a_la_accion: 'Escríbenos', variantes: '1', negativos: [], aprueba_y_para_cuando: 'Responsable de la marca · antes de la fecha', presupuesto: null,
      })),
      pendientes_declarados: [], huecos: [], contradicciones_plan_vs_manual: [], dependencias: [],
    },
  })
}

async function hastaElPedido(m: ReturnType<typeof mundo>) {
  const c = m.cliente
  const abrir = { client_id: UUID, tenant_id: UUID, plan_id: 'plan-1', dry_run: true, desde_worker: 'X9F0zp6LQ2xGEYVS', _sala_correlation_id: 'corr-1', _journey_id: 'viaje-1', target_step_id: 'router.dispatch.planeacion/plan-listo.briefear', _simulacros: { estrategia: [c.estrategia], calendario: [tandaBuena(c)] } }
  await m.sim.ejecutar(IDS.puerta, entrada(abrir))
  await m.sim.ejecutar(ID_VIGIA, [{ json: {} }])
  const lote = m.reg.intake.find((s: any) => s.payload.modo === 'parte')
  const sv = { client_id: UUID, tenant_id: UUID, dry_run: true, _sala_correlation_id: 'corr-2', _journey_id: 'viaje-1', target_step_id: 'router.dispatch.cadena/vigia.briefear', ...lote.payload }
  const puerta = await m.sim.ejecutar(IDS.puerta, entrada(sv))
  const filas = (await m.al.filas(lote.payload.campana_id)).filter((f: any) => lote.payload.fila_ids.includes(f.id))
  return { lote, puerta, pedido: m.reg.parte[0], filas }
}


const correrLaCopia = (m: ReturnType<typeof mundo>, pedido: PeticionHttp, extra: Record<string, unknown>, cabeceras?: Record<string, string>) =>
  m.sim.ejecutar(ID_COPIA_VIVA, [{ json: { headers: cabeceras ?? pedido.cabeceras, body: { ...(pedido.cuerpo as Record<string, unknown>), ...extra } } }])

describe('traspaso calendario → brief (ensayo, US$ 0)', () => {
  it('🔴 una fila del calendario que abre la cadena termina en su brief: vigía → sala → puerta (parte) → copia viva; un brief por fila, ligado a su fila', async () => {
    const m = mundo()
    const { lote, puerta, pedido, filas } = await hastaElPedido(m)
    expect(lote.payload.fila_ids).toHaveLength(3)
    expect(puerta[0].json.resultado).toBe('pasarela_ok')
    expect(pedido.cabeceras['x-sala-dispatch-key']).toBe('k-sala')
    expect(pedido.cuerpo).toMatchObject({ campana_id: lote.payload.campana_id, lote: lote.payload.lote, fila_ids: lote.payload.fila_ids, dry_run: true })
    const r = await correrLaCopia(m, pedido, { _simulacro_respuesta: parteDelRedactor(filas as any) })
    expect(r[0].json).toMatchObject({ autoproducir: 'no_emite', motivo: 'autoproducir_apagado' }) // el candado propio de la campaña: nace apagado
    const parte = (m.reg.autoproducir[0] as any).parte_seco
    expect(parte.valido).toBe(true)
    expect(parte.fila.provenance_tag).toMatchObject({ chequeos_ok: true, hallazgos: 0, entregables: 3, dry_run: true, lote: lote.payload.lote })
    expect(parte.fila.provenance_tag.familias_por_brief.map((b: any) => b.fila_id).sort()).toEqual([...lote.payload.fila_ids].sort())
    expect(new Set(parte.fila.provenance_tag.familias_por_brief.map((b: any) => b.brief_id)).size).toBe(3) // cada fila, su propio brief
  })

  it('🔴 US$ 0 y sin escribir nada: el redactor recibe dry_run:true, no se guarda el parte, no sube a Drive y la cadena no registra costo', async () => {
    const m = mundo()
    const { pedido, filas } = await hastaElPedido(m)
    await correrLaCopia(m, pedido, { _simulacro_respuesta: parteDelRedactor(filas as any) })
    expect(m.reg.agente).toHaveLength(1)
    expect((m.reg.agente[0].cuerpo as any).dry_run).toBe(true)
    expect(m.reg.escrituras).toHaveLength(0)
    expect(m.reg.drive).toHaveLength(0)
    expect(m.al.corridas.reduce((x, c) => x + (c.costo_usd ?? 0), 0)).toBe(0)
  })

  it('🔴 una fila SIN brief no pasa: el parte se marca «fila_sin_brief» y la copia se detiene (no da por bueno un parte incompleto)', async () => {
    const m = mundo()
    const { pedido, filas } = await hastaElPedido(m)
    const sinUna = (filas as any[]).slice(0, 2)
    await expect(correrLaCopia(m, pedido, { _simulacro_respuesta: parteDelRedactor(sinUna) })).rejects.toThrow(/fila_sin_brief.*s1-d4-d/)
    expect(m.reg.autoproducir).toHaveLength(0) // nada sale hacia producir
  })

  it('🔴 los candados siguen donde estaban: sin llave, sin dry_run explícito o con la campaña cerrada, la copia se detiene antes de gastar', async () => {
    const m = mundo()
    const { pedido, filas } = await hastaElPedido(m)
    const parte = parteDelRedactor(filas as any)
    await expect(correrLaCopia(m, pedido, { _simulacro_respuesta: parte }, { 'x-sala-dispatch-key': 'otra' })).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    await expect(correrLaCopia(m, pedido, { dry_run: undefined, _simulacro_respuesta: parte })).rejects.toThrow(/DRY_RUN_AUSENTE/)
    m.al.campanas[0].estado = 'cerrada'
    await expect(correrLaCopia(m, pedido, { _simulacro_respuesta: parte })).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA/)
    expect(m.reg.agente).toHaveLength(0)
    expect(m.reg.escrituras).toHaveLength(0)
  })

  it('con la cadena APAGADA la puerta no manda nada a la copia (la vigía se detiene): encender los flujos no hace correr nada solo', async () => {
    const m = mundo()
    m.al.config.set('estado_cadena', 'apagada')
    const sv = { client_id: UUID, tenant_id: UUID, dry_run: true, _sala_correlation_id: 'c', _journey_id: 'viaje-1', target_step_id: 'router.dispatch.cadena/vigia.briefear', modo: 'parte', campana_id: 'camp-x', lote: '2026-W42', fila_ids: ['a'] }
    await expect(m.sim.ejecutar(IDS.puerta, entrada(sv))).rejects.toThrow(/PUERTA_CADENA_APAGADA/)
    expect(m.reg.parte).toHaveLength(0)
  })
})
