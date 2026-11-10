/**
 * 10-nov · COSTO DE LA MESA (diagnóstico de CC2 · GO de Lenovo 13:28Z · sumas de CC7). La gran idea v4 anotó US$ 6,15 y gastó 10,39: el acuse del flujo «oficina · turno» salía SIN llave
 * (`$json.llave` vacío → 401 siempre, desde el 28-oct), el vigía re-entregaba a los 3 min todo turno «sin dueño», y la segunda respuesta se descartaba como «repetida» sin anotar su costo.
 *  ① la llave del acuse sale del entorno, como «Registrar» (flujo vivo y constructor);
 *  ② la COPIA de un turno anota su costo (una vez por ejecución) y el tope lo ve;
 *  ③ esta prueba permanente: falla si el acuse vuelve a mandar otra llave que «Registrar», o si un turno que nadie tomó (lo que deja un acuse en 401) se re-entrega EN SILENCIO;
 *  ④ la alarma: UNA por encargo en #alertas.
 * US$ 0: base falsa y memoria, sin red ni modelo.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { crearPuertos } from '../adaptadores'
import { almacenDeSupabase } from '../almacen-supabase'
import { abrirEncargo, anotarCostoDeLaCopia, avanzar, recibirResultado } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { revisarPasosMuertos } from '../vigia'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL, crearMemoria } from './memoria'
import { montar } from './mesa-arnes'

const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const BRIEF = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el producto
- PROTAGONISTA: El producto. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- LLAMADO A LA ACCIÓN: Escríbenos
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`

/** un encargo con su primer turno ya registrado (ejecución «ex-1», US$ 0,05) y el segundo abierto */
async function conUnTurnoRegistrado() {
  const M = crearMemoria({ parte: parteCon(BRIEF), plantilla: CARRUSEL_IG_V1, fuentes: { fotos: [] } })
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_ig_v1' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const r0 = await avanzar(M.P, id)
  const n = (r0.cuerpo.turno as { n: number }).n
  await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0.05, workflow_execution_id: 'ex-1' })
  return { M, id, n }
}
const gasto = (M: ReturnType<typeof crearMemoria>, id: string) => ({ motor: M.encargos.get(id)!.estado_del_motor.gasto_usd, encargo: M.encargos.get(id)!.gasto_usd })

describe('② la copia de un turno anota su costo', () => {
  it('🔴 una respuesta REPETIDA de otra ejecución suma su costo al encargo (motor y fila) y deja su fila de gasto', async () => {
    const { M, id, n } = await conUnTurnoRegistrado()
    const antes = gasto(M, id)
    await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0.3, workflow_execution_id: 'ex-copia' })
    const despues = gasto(M, id)
    expect(+(despues.motor - antes.motor).toFixed(6)).toBe(0.3)
    expect(despues.encargo).toBe(despues.motor)
    expect(M.gastos.filter((g) => g.ref_id === 'ex-copia')).toEqual([{ concepto: 'modelo', ref_tabla: 'agent_invocations', ref_id: 'ex-copia', cost_usd: 0.3, base: 'usage' }])
  })
  it('🔴 la MISMA ejecución reenviada no suma dos veces', async () => {
    const { M, id, n } = await conUnTurnoRegistrado()
    await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0.3, workflow_execution_id: 'ex-copia' })
    const una = gasto(M, id)
    await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0.3, workflow_execution_id: 'ex-copia' })
    expect(gasto(M, id)).toEqual(una)
    expect(M.gastos.filter((g) => g.ref_id === 'ex-copia')).toHaveLength(1)
  })
  it('🔴 el turno original repetido (su misma ejecución «ex-1») no se cuenta otra vez', async () => {
    const { M, id, n } = await conUnTurnoRegistrado()
    const antes = gasto(M, id)
    await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0.05, workflow_execution_id: 'ex-1' })
    expect(gasto(M, id)).toEqual(antes)
  })
  it('sin ejecución o sin costo no se suma (no se puede saber si ya se anotó)', async () => {
    const { M, id, n } = await conUnTurnoRegistrado()
    const antes = gasto(M, id)
    await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0.3 })
    await recibirResultado(M.P, id, n, { texto: 'material', costo_usd: 0, workflow_execution_id: 'ex-gratis' })
    expect(gasto(M, id)).toEqual(antes)
    expect(await anotarCostoDeLaCopia(M.P, id, { costo_usd: 0.3 })).toBe('sin_ejecucion')
    expect(await anotarCostoDeLaCopia(M.P, id, { costo_usd: 0, workflow_execution_id: 'x' })).toBe('sin_costo')
  })
  it('🔴 la mesa: una copia de un turno de la mesa también suma (el tope de la mesa lee este gasto)', async () => {
    const { M, a, id } = await montar()
    const n = (a.cuerpo.turno as { n: number }).n
    expect(String((a.cuerpo.turno as { paso: string }).paso)).toMatch(/^mesa:/)
    await recibirResultado(M.P, id, n, { texto: 'Dirijo: hagan su parte.', costo_usd: 0.4, workflow_execution_id: 'mesa-1' })
    const antes = gasto(M, id)
    await recibirResultado(M.P, id, n, { texto: 'Dirijo: hagan su parte.', costo_usd: 0.4, workflow_execution_id: 'mesa-1-copia' })
    expect(+(gasto(M, id).motor - antes.motor).toFixed(6)).toBe(0.4)
  })
})

describe('② en la base (almacén real contra la base falsa)', () => {
  const ENC = '11111111-1111-4111-8111-111111111111'
  const semilla = () => new DbFalsa().semilla('oficina_encargos', [{ id: ENC, gasto_usd: 1, estado_del_motor: { gasto_usd: 1, vueltas: {} } }]).semilla('oficina_gastos', [])
  const G = { concepto: 'modelo' as const, ref_tabla: 'agent_invocations', ref_id: 'ex-9', cost_usd: 0.25, base: 'usage' as const }
  it('🔴 anota la fila y suma al encargo; la misma ejecución otra vez = ya_estaba', async () => {
    const db = semilla()
    const al = almacenDeSupabase(db)
    expect(await al.anotarGastoDeCopia!({ encargo_id: ENC, gasto: G })).toBe('anotado')
    expect(db.tablas['oficina_encargos'][0]).toMatchObject({ gasto_usd: 1.25, estado_del_motor: { gasto_usd: 1.25 } })
    expect(await al.anotarGastoDeCopia!({ encargo_id: ENC, gasto: G })).toBe('ya_estaba')
    expect(db.tablas['oficina_encargos'][0].gasto_usd).toBe(1.25)
    expect(db.tablas['oficina_gastos']).toHaveLength(1)
  })
  it('🔴 la suma es CONDICIONAL: si otro cambió el gasto entre la lectura y la escritura, se relee y no se pisa', async () => {
    const db = semilla()
    const from = db.from.bind(db)
    let cambiado = false
    db.from = (t: string) => {
      const q = from(t) as unknown as { update: (p: Record<string, unknown>) => unknown }
      if (t === 'oficina_encargos' && !cambiado) {
        const upd = q.update.bind(q)
        q.update = (p: Record<string, unknown>) => { cambiado = true; db.tablas['oficina_encargos'][0].gasto_usd = 2; db.tablas['oficina_encargos'][0].estado_del_motor = { gasto_usd: 2, vueltas: {} }; return upd(p) }
      }
      return q as never
    }
    expect(await almacenDeSupabase(db).anotarGastoDeCopia!({ encargo_id: ENC, gasto: G })).toBe('anotado')
    expect(db.tablas['oficina_encargos'][0]).toMatchObject({ gasto_usd: 2.25, estado_del_motor: { gasto_usd: 2.25 } })
  })
})

describe('③ ④ un turno que nadie tomó no se re-entrega en silencio', () => {
  async function conPasoColgado() {
    const db = new DbFalsa()
      .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
      .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Trata de usted', forbidden_words: [] }])
      .semilla('client_social_images', [])
      .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
      .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
      .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
    const hora = { v: new Date('2026-10-10T12:00:00Z') }
    const P = crearPuertos(db, { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('{}', { status: 404 })) as typeof fetch, () => hora.v)
    const avisos: Array<{ canal: string; texto: string }> = []
    P.avisar = async (p) => { avisos.push({ canal: p.canal, texto: p.texto }) }
    const a = await abrirEncargo(P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const vivo = () => db.tablas['oficina_turnos'].find((t) => t.estado === 'corriendo')!
    // lo que deja un acuse que respondió 401: el turno sigue «corriendo» SIN dueño (workflow_execution_id vacío)
    const sinAcuse = (min: number, ejecucion: string | null = null) => { vivo().workflow_execution_id = ejecucion; vivo().inicio = new Date(hora.v.getTime() - min * 60_000).toISOString() }
    return { db, P, hora, avisos, sinAcuse, id: String(a.cuerpo.encargo_id) }
  }
  it('🔴 la primera re-entrega suena UNA alarma en #alertas que nombra el acuse y el 401', async () => {
    const { db, P, hora, avisos, sinAcuse, id } = await conPasoColgado()
    sinAcuse(4)
    expect((await revisarPasosMuertos(P, db, hora.v)).reanudar).toEqual([id])
    expect(avisos).toHaveLength(1)
    expect(avisos[0].canal).toBe('alertas')
    expect(avisos[0].texto).toMatch(/ningún flujo lo tomó/)
    expect(avisos[0].texto).toMatch(/acuse/)
    expect(avisos[0].texto).toMatch(/401/)
  })
  it('🔴 las re-entregas siguientes del mismo encargo NO vuelven a sonar (una por incidente)', async () => {
    const { db, P, hora, avisos, sinAcuse } = await conPasoColgado()
    for (let i = 0; i < 3; i++) { sinAcuse(4); await revisarPasosMuertos(P, db, hora.v) }
    expect(avisos).toHaveLength(1)
  })
  it('con acuse (el flujo lo tomó) no hay re-entrega ni alarma', async () => {
    const { db, P, hora, avisos, sinAcuse } = await conPasoColgado()
    sinAcuse(4, 'ex-acuse')
    expect((await revisarPasosMuertos(P, db, hora.v)).reanudar).toEqual([])
    expect(avisos).toEqual([])
  })
  it('una alarma que falla no frena al vigía', async () => {
    const { db, P, hora, sinAcuse, id } = await conPasoColgado()
    P.avisar = async () => { throw new Error('slack caído') }
    sinAcuse(4)
    expect((await revisarPasosMuertos(P, db, hora.v)).reanudar).toEqual([id])
  })
})

describe('① ③ la llave del acuse es la de «Registrar» (flujo vivo y constructor)', () => {
  type Nodo = { name: string; type: string; parameters: { headerParameters?: { parameters?: Array<{ name: string; value: string }> } } }
  const llaveDe = (nodos: Nodo[], nombre: string) => nodos.find((x) => x.name === nombre)?.parameters.headerParameters?.parameters?.find((h) => h.name === 'x-sala-dispatch-key')?.value
  const ENV = '={{ $env.SALA_DISPATCH_KEY }}'
  it('🔴 la copia del flujo vivo: «⓪ Acuse del turno» manda la MISMA llave que «③ Registrar el resultado», y es la del entorno', () => {
    const w = JSON.parse(readFileSync(path.join(__dirname, '../../../../scripts/ops/oficina-marketing/vivo/bTbWL9lUvQCfStAz.json'), 'utf8')) as { nodes: Nodo[] }
    expect(llaveDe(w.nodes, '⓪ Acuse del turno')).toBe(llaveDe(w.nodes, '③ Registrar el resultado'))
    expect(llaveDe(w.nodes, '⓪ Acuse del turno')).toBe(ENV)
  })
  it('🔴 el constructor del flujo también (una reconstrucción no trae el error de vuelta)', async () => {
    const { construirTurno } = await import('../../../../scripts/worker-staging/oficina/construir-oficina.mjs')
    const t = construirTurno() as unknown as { nodes: Nodo[] }
    expect(llaveDe(t.nodes, '⓪ Acuse del turno')).toBe(ENV)
    expect(llaveDe(t.nodes, '③ Registrar el resultado')).toBe(ENV)
  })
})
