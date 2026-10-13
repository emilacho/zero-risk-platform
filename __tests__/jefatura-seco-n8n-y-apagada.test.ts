/**
 * KIT DEL SECO J5 · (1) el recorrido POR n8n (`correrPorN8n`) con un «n8n de mentira» que ejecuta el código de los nodos de los flujos GENERADOS contra las rutas reales de J3 (US$ 0);
 * (2) «apagada no gasta»: con la jefatura apagada no abre, no corre turnos y el vigía no hace nada, sin una sola escritura.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseDelSeco, LLAVE_LOCAL, transporteLocal } from './_helpers/transporte-local-jefatura'
import { CLIENTES } from '../scripts/ops/jefatura-seco/fixtures.mjs'
import { celdas } from '../scripts/ops/jefatura-seco/matriz.mjs'
import { apagadaNoAbre, correrPorN8n } from '../scripts/ops/jefatura-seco/nucleo.mjs'
import { construirTurno } from '../scripts/worker-staging/jefatura/construir-jefatura.mjs'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))

import { POST as REVISIONES } from '../src/app/api/jefatura/revisiones/route'
import { POST as TURNOS } from '../src/app/api/jefatura/turnos/route'
import { POST as VIGIA } from '../src/app/api/jefatura/vigia/route'

type Json = Record<string, any>
const IDS = CLIENTES.map((c: { id: string }) => c.id)
const db = () => h.db as ReturnType<typeof baseDelSeco>
beforeEach(() => { h.db = baseDelSeco(IDS); process.env.SALA_DISPATCH_KEY = LLAVE_LOCAL })
const base = () => transporteLocal({ revisiones: REVISIONES, turnos: TURNOS, vigia: VIGIA }, db)
const turnoJson = construirTurno() as Json

function nodo(nombre: string, entrada: Json | Json[], nodos: Record<string, Json | Json[]> = {}): Json[] {
  const n = (turnoJson.nodes as Json[]).find((x) => x.name === nombre)!
  const items = (Array.isArray(entrada) ? entrada : [entrada]).map((json) => ({ json }))
  const $ = (k: string) => ({ first: () => ({ json: Array.isArray(nodos[k]) ? (nodos[k] as Json[])[0] : nodos[k] }) })
  const fn = new Function('$input', '$env', '$', '$execution', '$workflow', String(n.parameters.jsCode))
  return (fn({ first: () => items[0], all: () => items }, { SALA_DISPATCH_KEY: LLAVE_LOCAL }, $, { id: 'exec-1', resumeUrl: 'https://n8n.invalid/resume' }, { id: 'wf-1' }) as Array<{ json: Json }>).map((x) => x.json)
}

/** el «n8n de mentira»: recibe el webhook del turno y ejecuta, ejecución por ejecución, ⓪ → ② (molde) → ruta → ③ hasta que no haya siguiente */
function n8nDeMentira(T: ReturnType<typeof base>) {
  return {
    ...T,
    async webhook(cuerpo: Json) {
      let turnoBody = cuerpo
      for (let i = 0; i < 40; i++) {
        const [entrada] = nodo('⓪ Entrada · llave', { body: turnoBody, headers: { 'x-sala-dispatch-key': LLAVE_LOCAL } })
        const armado = nodo('② Armar el pedido', entrada)
        if (!armado.length) return { status: 200 } // productor muerto: la ejecución termina sin registrar (lo recoge el vigía)
        const respuesta = await T.llamar('turnos', armado[0].resultado_body)
        const [sigue] = nodo('③ ¿Y ahora?', { statusCode: respuesta.status, body: respuesta.body }, { '⓪ Entrada · llave': entrada })
        if (sigue.ruta !== 'esperar') return { status: 200 }
        turnoBody = sigue.turno_body
      }
      return { status: 500 }
    },
  }
}

describe('el recorrido por n8n (con el n8n de mentira): abre, despierta el flujo, espera el cierre por `leer`', () => {
  it('una celda de cada tipo llega al resultado esperado y en seco el gasto es 0', async () => {
    for (const tipo of ['pieza', 'brief', 'calendario', 'estrategia', 'plan']) {
      const caso = tipo === 'plan' ? 'BC-bloquea-gpt-ok-toma-todo-mejora' : tipo === 'pieza' ? 'bloquea-toma-todo-gpt-ok' : tipo === 'brief' ? 'sin-fichas' : 'bloquea-gpt-ok-toma-todo'
      const esc = celdas({ tipos: [tipo], clientes: [IDS[0]], registros: ['tuteo'], casos: [caso], corrida: 'n1' })[0]
      const r = await correrPorN8n(esc, n8nDeMentira(base()), { cada_ms: 0 })
      expect(r.fallos, `${tipo}: ${JSON.stringify(r.observado)}`).toEqual([])
      expect(r.observado.saltos, tipo).toBeGreaterThanOrEqual(1)
      expect(r.observado.gasto_usd ?? 0).toBe(0)
    }
  })
  it('si el flujo no cierra la revisión (nadie contesta), el conductor lo dice con el motivo y no se queda esperando', async () => {
    const esc = celdas({ tipos: ['pieza'], clientes: [IDS[0]], registros: ['tuteo'], casos: ['sin-fichas-gpt-vacio'], corrida: 'n2' })[0]
    const T = { ...base(), webhook: async () => ({ status: 200 }), ahora: (() => { let t = 0; return () => (t += 60000) })() }
    const r = await correrPorN8n(esc, T, { cada_ms: 0, limite_min: 5 })
    expect(r.ok).not.toBe(true)
    expect(r.fallos.join(' ')).toMatch(/no cerró en 5 min/)
  })
  it('un webhook que responde mal se nombra', async () => {
    const esc = celdas({ tipos: ['pieza'], clientes: [IDS[0]], registros: ['tuteo'], casos: ['sin-fichas-gpt-vacio'], corrida: 'n3' })[0]
    const r = await correrPorN8n(esc, { ...base(), webhook: async () => ({ status: 404 }) }, {})
    expect(r.fallos.join(' ')).toMatch(/webhook del flujo contestó 404/)
  })
})

describe('APAGADA no gasta: no abre, no corre turnos, el vigía no hace nada y la base no recibe NI UNA escritura', () => {
  const sano = () => celdas({ tipos: ['pieza'], clientes: [IDS[0]], registros: ['tuteo'], casos: ['sin-fichas-gpt-vacio'], corrida: 'a1' })[0].sobre
  it('con la llave en apagada el conductor lo da por bien y no hay escrituras', async () => {
    h.db = baseDelSeco(IDS, 'apagada')
    const r = await apagadaNoAbre(sano(), base())
    expect(r.fallos, JSON.stringify(r.observado)).toEqual([])
    expect(db().escrituras).toHaveLength(0)
  })
  it('con la jefatura en ensayo el mismo conductor lo marca como fallo (la prueba es de verdad)', async () => {
    const r = await apagadaNoAbre(sano(), base())
    expect(r.ok).toBe(false)
  })
})
