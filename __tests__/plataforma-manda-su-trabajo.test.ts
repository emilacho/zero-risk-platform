/**
 * 04-nov · las llamadas que hace la propia plataforma (finanzas, mesa de análisis, mercado, jefatura) dicen de qué trabajo son, si quien las pide lo trae.
 * Sin dato: «sin dato», y la llamada no cambia en nada más.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { armarPedidoRunSdk, modeloRunSdk } from '@/lib/finanzas/conversa/modelo-run-sdk'
import { armarPedidoDeAgente } from '@/lib/jefatura/revision/pedidos'
import { leerSobre } from '@/lib/planeacion/puertas'

const LEE = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const turno = { agente: 'a', tarea: 't', encargo_id: 'enc', client_id: 'c', paso: 'planteo', dry_run: true, tope_usd: 1 } as never
const TRABAJO = { trabajo_tipo: 'plan', trabajo_id: 'corrida-1', llamada_padre: 'i1' }

describe('el adaptador del modelo', () => {
  it('🔴 lleva el trabajo y el paso de ESTE turno, aunque quien llama traiga otro paso', () => {
    expect(armarPedidoRunSdk(turno, 'wf', { ...TRABAJO, paso: 'otro' })).toMatchObject({ ...TRABAJO, paso: 'planteo' })
  })
  it('🔴 sin trabajo solo agrega el paso, y no cambia el id de ejecución', () => {
    const p = armarPedidoRunSdk(turno, 'wf')
    expect(p.paso).toBe('planteo')
    expect(p).not.toHaveProperty('trabajo_tipo')
    expect(p.workflow_execution_id).toBe('enc:planteo')
  })
  it('🔴 lo que llega al corredor lo lleva de verdad', async () => {
    let cuerpo: Record<string, unknown> = {}
    const f = (async (_u: string, i: { body: string }) => { cuerpo = JSON.parse(i.body); return new Response(JSON.stringify({ response: 'ok', cost_usd: 0 }), { status: 200 }) }) as never
    await modeloRunSdk({ base: 'https://x.test', llave: 'k', fetch: f, workflow_id: 'X9F0zp6LQ2xGEYVS', trabajo: TRABAJO }).invocar(turno)
    expect(cuerpo).toMatchObject({ ...TRABAJO, paso: 'planteo' })
  })
})

describe('la mesa y el brazo de mercado', () => {
  const pide = (b: unknown) => leerSobre(new Request('https://x.test', { method: 'POST', body: JSON.stringify(b) }))
  it('🔴 cada pedido hereda el trabajo del sobre', async () => {
    const r = await pide({ ...TRABAJO, pedidos: [{ objetivo: 'o1' }, { objetivo: 'o2' }] })
    if (!r.ok) throw new Error(r.motivo)
    for (const l of r.sobre.pedidos) expect(l.pedido).toMatchObject(TRABAJO)
  })
  it('🔴 cada ruta lo pasa al modelo', () => {
    for (const a of ['src/app/api/planeacion/mesa-de-analisis/route.ts', 'src/app/api/planeacion/brazo/mercado/route.ts']) expect(LEE(a)).toContain('trabajo: trabajoDeLaLlamada(p).columnas')
    expect(LEE('src/app/api/finanzas/conversa/route.ts')).toContain('trabajo: trabajoDeLaLlamada(cuerpo')
  })
})

describe('la jefatura', () => {
  const base = { agente: 'a', task: 't', esquema: 'e', indicacion: 'i', paso: 'p', revision_id: 'r', dispatch_key: 'd', max_budget_usd: 1, dry_run: true, client_id: 'c' }
  it('🔴 una revisión de otro tipo lleva lo que trajo quien la abrió', () => {
    expect(armarPedidoDeAgente({ ...base, trabajo: TRABAJO })).toMatchObject(TRABAJO)
    expect(armarPedidoDeAgente({ ...base, trabajo: {} })).not.toHaveProperty('trabajo_tipo')
  })
  it('🔴 la pieza usa su `artifact_id`; las demás, lo que venga en su entrada', () => {
    expect(LEE('src/lib/jefatura/revision/orquestador.ts')).toContain("trabajo: rev.artifact_type === 'pieza' ? { trabajo_tipo: 'pieza', trabajo_id: rev.artifact_id } : trabajoDeLaLlamada(p).columnas")
  })
})
