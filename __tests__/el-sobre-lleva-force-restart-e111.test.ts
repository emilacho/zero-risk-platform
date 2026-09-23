/**
 * 🔴 E111 · EL SOBRE DEL ALTA A PLANEACIÓN LLEVA EL INTERRUPTOR DE RE-CORRIDA TAL COMO VIENE EN EL TRATO.
 *
 * Medido (E110 · planeación 146741): el guardia «⑥ ¿corrida repetida?» sólo cede con `body.forzar === true` y el
 * redactor «Pedir el plan al redactor» sólo reescribe con `body.force_restart === true`. El sobre `planear` del alta
 * (900b0e53) no lleva ninguno de los dos, aunque el trato traiga `force_restart: true` y ese campo llegue intacto a
 * la salida de «Validate Deal Data» (146720). Resultado: «Plan repetido · NO se corrió».
 *
 * Fija: (①) el sobre construido lleva `forzar` y `force_restart` = `trato.force_restart === true` (booleanos) y NADA
 * más cambió; (②) sin trato forzado ambos salen `false` (el comportamiento de hoy no cambia); (③) planeación (foto
 * viva 14951fff · no se toca) lee exactamente esos dos nombres. NO toca producción · sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ALTA_VIVO = leer('LyVoKcrypS5uLyuu/alta-antes-e111-900b0e53.json') // lo que corrió en E110
const ALTA_HOY = leer('LyVoKcrypS5uLyuu/alta-construida-e111.json')
const PLANEACION = leer('X9F0zp6LQ2xGEYVS/planeacion-VIVO-2026-09-21.json') // 14951fff · no se toca

const SOBRE = 'E57 · sobre · pedir planeación a la sala'
const nodo = (f: Flujo, n: string) => {
  const x = f.nodes.find((y) => y.name === n)
  if (!x) throw new Error(`falta ${n}`)
  return x
}
/** evalúa el jsonBody del sobre como lo hace el motor: `={ … {{ expr }} … }` con Validate Deal Data simulado */
function sobre(f: Flujo, deal: Record<string, unknown>) {
  const plantilla = String(nodo(f, SOBRE).parameters.jsonBody).replace(/^=/, '')
  const $ = () => ({ first: () => ({ json: deal }) })
  const texto = plantilla.replace(/\{\{([^}]*)\}\}/g, (_, e) => String(new Function('$', `return (${e})`)($)))
  return JSON.parse(texto) as { source: string; intent: string; payload: Record<string, unknown>; idempotency_key: string; logical_period: string; tenant_id: string; client_id: string }
}
const TRATO = { client_id: 'c-1', _journey_id: 'j-1', tenant_id: 't-1', _sala_correlation_id: 'corr-1' }
const FORZADO = { ...TRATO, force_restart: true }

describe('el rojo · el sobre de E110 (900b0e53) no lleva forzar ni force_restart aunque el trato lo traiga', () => {
  it('payload = {pedido, dry_run, client_id, desde_worker, journey_id} · planeación recibió undefined en los dos', () => {
    const s = sobre(ALTA_VIVO, FORZADO)
    expect(s.intent).toBe('planear')
    expect(Object.keys(s.payload).sort()).toEqual(['client_id', 'desde_worker', 'dry_run', 'journey_id', 'pedido'])
    expect(s.payload.forzar).toBeUndefined()
    expect(s.payload.force_restart).toBeUndefined()
  })
  it('planeación (14951fff): el guardia lee body.forzar y el redactor lee body.force_restart', () => {
    const guardia = JSON.stringify(nodo(PLANEACION, '⑥ IF · ¿corrida repetida?').parameters)
    expect(guardia).toContain("$('Webhook · planeacion').first().json.body.forzar === true")
    const redactor = JSON.stringify(nodo(PLANEACION, 'Pedir el plan al redactor').parameters)
    expect(redactor).toContain('.first().json.body || {}).force_restart === true')
    expect(redactor).not.toContain('.forzar')
  })
})

describe('① el arreglo · dos campos en el origen', () => {
  it('trato con force_restart:true → payload.forzar y payload.force_restart son true (booleanos) · el resto del sobre es idéntico', () => {
    const antes = sobre(ALTA_VIVO, FORZADO)
    const hoy = sobre(ALTA_HOY, FORZADO)
    expect(hoy.payload.forzar).toBe(true)
    expect(hoy.payload.force_restart).toBe(true)
    const { forzar: _f, force_restart: _r, ...restoPayload } = hoy.payload
    expect(restoPayload).toEqual(antes.payload)
    expect({ ...hoy, payload: null }).toEqual({ ...antes, payload: null })
    expect(hoy.idempotency_key).toBe('j-1:planear')
  })
  it('② sin trato forzado (campo ausente · "true" como texto · false) ambos salen false: el comportamiento de hoy no cambia', () => {
    expect(sobre(ALTA_HOY, TRATO).payload).toMatchObject({ forzar: false, force_restart: false })
    expect(sobre(ALTA_HOY, { ...TRATO, force_restart: 'true' }).payload).toMatchObject({ forzar: false, force_restart: false })
    expect(sobre(ALTA_HOY, { ...TRATO, force_restart: false }).payload).toMatchObject({ forzar: false, force_restart: false })
  })
  it('no cambió nada más: 98 nodos · todos los demás nodos y conexiones idénticos · settings iguales', () => {
    expect(ALTA_HOY.nodes.length).toBe(ALTA_VIVO.nodes.length)
    for (const v of ALTA_VIVO.nodes) {
      const h = nodo(ALTA_HOY, v.name)
      if (v.name === SOBRE) continue
      expect({ type: h.type, parameters: h.parameters }).toEqual({ type: v.type, parameters: v.parameters })
    }
    expect(ALTA_HOY.connections).toEqual(ALTA_VIVO.connections)
    expect(ALTA_HOY.settings.executionOrder).toBe(ALTA_VIVO.settings.executionOrder)
    expect(ALTA_HOY.settings.errorWorkflow).toBe(ALTA_VIVO.settings.errorWorkflow)
  })
  it('el trato real de E110 (146720) trae force_restart:true a la salida de Validate Deal Data · con este sobre planeación lo habría recibido', () => {
    const ev = JSON.parse(readFileSync(join(WS, 'LyVoKcrypS5uLyuu/evidencia-146720-e111.json'), 'utf8')) as { validate_deal_data: Record<string, unknown> }
    expect(ev.validate_deal_data.force_restart).toBe(true)
    const s = sobre(ALTA_HOY, ev.validate_deal_data)
    expect(s.payload).toMatchObject({ forzar: true, force_restart: true, dry_run: false, client_id: '0736401b-8a9c-4e57-9ab0-e4bad25cb630' })
  })
})
