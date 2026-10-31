/**
 * T5 · paso 3 · el flujo `oficina · turno` con el nuevo orden · US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de los nodos del flujo nuevo (`scripts/ops/oficina-marketing/nuevo/bTbWL9lUvQCfStAz.json`) con la respuesta REAL que da la oficina al cerrar una mesa
 * (`entregarALaCadena` → la cadena de CC1 sobre su almacén en memoria → `siguiente.sobre`). Lo que fija: el sobre con el que la puerta vuelve a entrar llega a la sala tal cual,
 * una vez, y sin él todo es como hoy; `esperar_jefatura` ya no es un rechazo; un rechazo de la sala DETIENE.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../src/lib/cadena/almacen'
import { briefAbrir, puertoDeLaCadena } from '../src/lib/cadena/mesas'
import { entregarALaCadena } from '../src/lib/oficina/mesa/de-la-cadena'
import { BRIEF_MESA } from '../src/lib/oficina/plantillas/mesa'
import { crearMemoria } from '../src/lib/oficina/__tests__/memoria'
import { crearMesaEnMemoria } from '../src/lib/oficina/__tests__/mesa-memoria'
import { abrirMesaDeLaCadena, validarSobreDeLaCadena } from '../src/lib/oficina/mesa/de-la-cadena'
import { avanzar } from '../src/lib/oficina/orquestador'
import type { Tarjeta } from '../src/lib/oficina/mesa/tipos'
import { recorrer, type Http } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (carpeta: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, carpeta, 'bTbWL9lUvQCfStAz.json'), 'utf8'))
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

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['x'], necesita: ['x'], entrega: ['x'], pertinente_en, activo: true, version: 1 })
const DIRECTORIO = [tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']), tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']), tarjeta('content-creator', 'miembro', ['concepto']), tarjeta('portero', 'portero', [])]

/** una mesa de brief REAL abierta por la cadena y la oficina, y su entrega REAL: la respuesta con la que cierra el encargo */
async function cierreDeLaMesaDeBrief(o: { texto: string | null } = { texto: BRIEF }) {
  const al = new AlmacenMemoria({
    contextos: { [CLIENTE]: contextoDe(A) },
    planes: { [CLIENTE]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-puerta'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [CLIENTE], nuevo_orden: { clientes: [CLIENTE] } },
    journeys: [{ journeyId: 'journey-1', clientId: CLIENTE }],
  })
  const campana: Campana = {
    id: CAMPANA, client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  al.campanas.push(campana)
  al.estrategias.push({ campana_id: CAMPANA, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true } as EstrategiaGuardada)
  const ab = await briefAbrir(al, { workflow_id: 'wf-puerta', workflow_execution_id: 'ex-1', campana_id: CAMPANA }, AHORA)
  expect(ab.status).toBe(200)
  const M = crearMemoria({ plantilla: BRIEF_MESA, config: { familias_activas: ['brief_mesa', 'concepto_mesa'] } })
  M.P.mesa = crearMesaEnMemoria(DIRECTORIO)
  M.P.cadena = puertoDeLaCadena(al, () => AHORA)
  const v = validarSobreDeLaCadena({ ...(ab.cuerpo as any).sobre, origen: 'cadena', despertar: true })
  if (!v.ok) throw new Error(JSON.stringify(v.errores))
  await abrirMesaDeLaCadena(M.P, v.sobre, avanzar)
  const enc = [...M.encargos.values()][0]
  const r = await entregarALaCadena(M.P, enc, { texto: o.texto, motivo: null, estado: 'cerrado' })
  return { al, respuesta: r.cuerpo as any }
}

const ENTRADA = { encargo_id: 'enc-1', turno: 3 }
const respuestaDelTurno = (cuerpo: any) => ({ statusCode: 200, body: cuerpo })

function sala(llamadas: Array<{ ruta: string; cuerpo: any }>, contesta: (c: any) => any = () => ({ ok: true, kind: 'accepted' })): Http {
  return async (url, headers, cuerpo) => {
    llamadas.push({ ruta: url.replace('https://zero-risk-platform.vercel.app', ''), cuerpo })
    if (url.includes('/api/sala/intake')) {
      if (!headers['x-api-key']) return { statusCode: 401, body: {} }
      return { statusCode: 200, body: contesta(cuerpo) }
    }
    return { statusCode: 200, body: { ok: true } } // el cable de vuelta
  }
}
const previos = { '⓪ Entrada · llave': [ENTRADA] }
const correr = (entrada: any, http: Http) => recorrer(leer('nuevo'), '③ ¿Y ahora?', entrada, { previos, http, env: { SALA_INGRESS_API_KEY: 'k-ing' } })

describe('el flujo nuevo se parece al vivo en todo menos en lo que debe cambiar', () => {
  const vivo = leer('vivo'), nuevo = leer('nuevo')
  it('cambia solo el código de «③ ¿Y ahora?» y suma 3 nodos «③ Sobre · …» al final del cable de vuelta', () => {
    const v = new Map(vivo.nodes.map((n: any) => [n.name, n]))
    expect(nuevo.nodes.filter((n: any) => v.has(n.name) && JSON.stringify(v.get(n.name)) !== JSON.stringify(n)).map((n: any) => n.name)).toEqual(['③ ¿Y ahora?'])
    expect(nuevo.nodes.filter((n: any) => !v.has(n.name)).map((n: any) => n.name).sort()).toEqual(['③ Sobre · a la sala', '③ Sobre · ¿entró?', '③ Sobre · ¿hay siguiente?'])
    for (const k of Object.keys(vivo.connections)) if (k !== '③ Cable de vuelta · sala') expect(nuevo.connections[k]).toEqual(vivo.connections[k])
    expect(nuevo.connections['③ Cable de vuelta · sala'].main[0][0].node).toBe('③ Sobre · ¿hay siguiente?')
    expect(new Set(nuevo.nodes.map((n: any) => n.id)).size).toBe(nuevo.nodes.length)
  })
  it('es determinista y no lleva llaves pegadas', async () => {
    const { construirTurno } = await import('../scripts/ops/oficina-marketing/construir-turno.mjs')
    expect(JSON.stringify(construirTurno())).toBe(JSON.stringify(nuevo))
    expect(JSON.stringify(nuevo)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|xox[abp]-/)
  })
})

describe('con el sobre de la cadena (respuesta REAL de la entrega del brief)', () => {
  it('brief validado: la cadena devuelve el sobre y el flujo se lo manda a la sala TAL CUAL, después del cable', async () => {
    const { respuesta } = await cierreDeLaMesaDeBrief()
    const sobre = respuesta.entrega_a_la_cadena.siguiente?.sobre
    expect(sobre).toMatchObject({ source: 'cadena/vigia', intent: 'briefear', payload: { modo: 'tanda_siguiente', campana_id: CAMPANA, client_id: CLIENTE } })
    const llamadas: Array<{ ruta: string; cuerpo: any }> = []
    const r = await correr(respuestaDelTurno(respuesta), sala(llamadas))
    expect(r.pasos).toEqual(['③ ¿Y ahora?', '③ ¿Siguiente paso?', '③ Cable de vuelta · sala', '③ Sobre · ¿hay siguiente?', '③ Sobre · a la sala', '③ Sobre · ¿entró?'])
    expect(llamadas.map((l) => l.ruta)).toEqual(['/api/sala/callback', '/api/sala/intake'])
    expect(llamadas[1].cuerpo).toEqual(sobre)
    expect(llamadas[0].cuerpo).toMatchObject({ event_type: 'run_completed', worker_name: 'oficina', encargo_id: 'enc-1' })
    expect(r.item).toMatchObject({ entro: true, clave: sobre.idempotency_key })
  })
  it('la sala dice duplicate (el vigía o un reintento ya lo metió): éxito', async () => {
    const { respuesta } = await cierreDeLaMesaDeBrief()
    const r = await correr(respuestaDelTurno(respuesta), sala([], () => ({ ok: true, kind: 'duplicate' })))
    expect(r.item).toMatchObject({ entro: true, kind: 'duplicate' })
  })
  it('🔴 la sala rechaza (200 con ok:false) o no contesta: el flujo se DETIENE con el código (el vigía reemite)', async () => {
    const { respuesta } = await cierreDeLaMesaDeBrief()
    await expect(correr(respuestaDelTurno(respuesta), sala([], () => ({ ok: false, code: 'SOURCE_NO_REGISTRADA', detail: 'cadena/mesas' })))).rejects.toThrow(/OFICINA_SOBRE_RECHAZADO.*SOURCE_NO_REGISTRADA/)
    const caida: Http = async (url) => { if (url.includes('intake')) throw new Error('ECONNRESET'); return { statusCode: 200, body: {} } }
    await expect(correr(respuestaDelTurno(respuesta), caida)).rejects.toThrow(/ECONNRESET/)
  })
  it('un brief devuelto sin texto igual puede traer sobre (abrir el brief siguiente) y se manda; si no hay sobre, no se llama a la sala', async () => {
    const { respuesta } = await cierreDeLaMesaDeBrief({ texto: null })
    const llamadas: Array<{ ruta: string; cuerpo: any }> = []
    const r = await correr(respuestaDelTurno(respuesta), sala(llamadas))
    const hay = !!respuesta.entrega_a_la_cadena.siguiente?.sobre
    expect(llamadas.some((l) => l.ruta.includes('intake'))).toBe(hay)
    expect(r.pasos.includes('③ Sobre · a la sala')).toBe(hay)
  })
})

describe('todo lo de hoy sigue igual', () => {
  const cerrado = (extra: any = {}) => respuestaDelTurno({ accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'encargo_en_bandeja', sala_ref: { _sala_correlation_id: 'c1', _journey_id: 'j1' }, ...extra })
  it('un cierre sin entrega a la cadena (pieza de la oficina): cable y NADA más', async () => {
    const llamadas: Array<{ ruta: string; cuerpo: any }> = []
    const r = await correr(cerrado(), sala(llamadas))
    expect(r.pasos).toEqual(['③ ¿Y ahora?', '③ ¿Siguiente paso?', '③ Cable de vuelta · sala', '③ Sobre · ¿hay siguiente?'])
    expect(llamadas.map((l) => l.ruta)).toEqual(['/api/sala/callback'])
  })
  it('un cierre cuya entrega a la cadena no trae sobre (la gran idea espera a Emilio): cable y nada más', async () => {
    const llamadas: Array<{ ruta: string; cuerpo: any }> = []
    await correr(cerrado({ entrega_a_la_cadena: { ok: true, detalle: 'lista' } }), sala(llamadas))
    expect(llamadas.map((l) => l.ruta)).toEqual(['/api/sala/callback'])
  })
  it('esperar un turno más sigue despertando este flujo; el vivo y el nuevo dan lo mismo', async () => {
    const e = respuestaDelTurno({ accion: 'esperar', turno: { n: 4 } })
    const a = await recorrer(leer('vivo'), '③ ¿Y ahora?', e, { previos, http: sala([]), hasta: ['③ Siguiente paso'] })
    const b = await recorrer(leer('nuevo'), '③ ¿Y ahora?', e, { previos, http: sala([]), hasta: ['③ Siguiente paso'] })
    expect(b.item).toEqual(a.item)
  })
  it('esperar_material termina sin ítems (como hoy)', async () => {
    const r = await recorrer(leer('nuevo'), '③ ¿Y ahora?', respuestaDelTurno({ accion: 'esperar_material' }), { previos })
    expect(r.vacio).toBe(true)
  })
})

describe('esperar_jefatura (el vivo lo trataría como rechazo)', () => {
  it('el vivo lanza OFICINA_TURNO_RECHAZADO; el nuevo termina sin ítems, como esperar_material', async () => {
    const e = respuestaDelTurno({ accion: 'esperar_jefatura', turno: { n: 5, tipo: 'jefatura' }, revision_id: 'rev-1' })
    await expect(recorrer(leer('vivo'), '③ ¿Y ahora?', e, { previos })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
    const r = await recorrer(leer('nuevo'), '③ ¿Y ahora?', e, { previos })
    expect(r.vacio).toBe(true)
  })
  it('un 409 o una acción desconocida siguen DETENIENDO', async () => {
    await expect(recorrer(leer('nuevo'), '③ ¿Y ahora?', { statusCode: 409, body: { error: 'turno_no_esperado' } }, { previos })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
    await expect(recorrer(leer('nuevo'), '③ ¿Y ahora?', respuestaDelTurno({ accion: 'algo_nuevo' }), { previos })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
  })
})
