/**
 * 02-nov · A3 · el reloj del ciclo de vida de incidentes. US$ 0, sin red: se ejecuta el CÓDIGO REAL de sus nodos con el emulador y un HTTP simulado.
 * Fija: cada hora; llama a la ruta correcta con la llave interna y el cuerpo {"ejecutar": true}; no gasta ni avisa a Slack; y FALLA A LA VISTA si la plataforma no contesta bien.
 */
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
// @ts-expect-error módulo .mjs sin tipos
import { construirRelojCicloDeVida, RELOJ, LLAMAR, COMPROBAR } from '../scripts/ops/oficina-marketing/construir-reloj-ciclo-de-vida.mjs'

const flujo = construirRelojCicloDeVida()
const BUENA = { ok: true, ejecutado: true, completo: true, total: 3, generado_en: '2026-11-02T12:07:00Z', cierres: [], fuentes: {} }

type Llamada = { url: string; headers: Record<string, string>; cuerpo: any }
function correr(respuesta: { statusCode: number; body: any }, env: Record<string, string> = {}) {
  const llamadas: Llamada[] = []
  const http = async (url: string, headers: Record<string, string>, cuerpo: any) => { llamadas.push({ url, headers, cuerpo }); return respuesta }
  return { llamadas, promesa: recorrer(flujo, LLAMAR, {}, { http, env }) }
}

describe('la forma del flujo', () => {
  it('son tres nodos en fila: reloj → llamada → comprobación; sin Slack ni agentes', () => {
    expect(flujo.nodes.map((n: any) => n.name)).toEqual([RELOJ, LLAMAR, COMPROBAR])
    expect(flujo.connections[RELOJ].main[0][0].node).toBe(LLAMAR)
    expect(flujo.connections[LLAMAR].main[0][0].node).toBe(COMPROBAR)
    const texto = JSON.stringify(flujo)
    expect(texto).not.toMatch(/slack|run-sdk|agents\/|executeWorkflow/i)
  })
  it('corre cada hora, en un minuto fijo', () => {
    const r = flujo.nodes.find((n: any) => n.name === RELOJ)
    expect(r.type).toBe('n8n-nodes-base.scheduleTrigger')
    expect(r.parameters.rule.interval).toEqual([{ field: 'cronExpression', expression: '7 * * * *' }])
  })
  it('nace sin la marca de activo (la enciende quien lo aplica, con orden de Lenovo)', () => {
    expect(flujo.active).toBeUndefined()
  })
  it('no lleva ninguna llave pegada', () => {
    expect(JSON.stringify(flujo)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{25,}/)
  })
})

describe('la llamada', () => {
  it('POST a la ruta del ciclo con la llave interna y {"ejecutar": true}', async () => {
    const { llamadas, promesa } = correr({ statusCode: 200, body: BUENA })
    await promesa
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://api.test/api/incidentes/ciclo-de-vida')
    expect(llamadas[0].headers['x-api-key']).toBe('llave-interna')
    expect(llamadas[0].cuerpo).toEqual({ ejecutar: true })
  })
  it('la dirección sale del entorno cuando está puesta', async () => {
    const { llamadas, promesa } = correr({ statusCode: 200, body: BUENA }, { ZERO_RISK_API_URL: 'https://otra.test' })
    await promesa
    expect(llamadas[0].url).toBe('https://otra.test/api/incidentes/ciclo-de-vida')
  })
})

describe('la comprobación: falla a la vista', () => {
  it('respuesta buena: pasa y cuenta lo cerrado', async () => {
    const { promesa } = correr({ statusCode: 200, body: BUENA })
    const r = await promesa
    expect(r.ultimo).toBe(COMPROBAR)
    expect(r.item).toEqual({ ok: true, ejecutado: true, total_cerrado: 3, generado_en: '2026-11-02T12:07:00Z' })
  })
  it.each([
    ['401 sin llave', { statusCode: 401, body: { error: 'unauthorized' } }, /CICLO_DE_VIDA_NO_200/],
    ['500 de la plataforma', { statusCode: 500, body: { ok: false, error: 'incidentes_error' } }, /CICLO_DE_VIDA_NO_200/],
    ['sin respuesta', { statusCode: undefined as any, body: undefined }, /CICLO_DE_VIDA_NO_200/],
    ['200 pero ok distinto de true', { statusCode: 200, body: { ...BUENA, ok: false } }, /CICLO_DE_VIDA_SIN_OK/],
    ['200 pero solo informó (no ejecutó)', { statusCode: 200, body: { ...BUENA, ejecutado: false } }, /CICLO_DE_VIDA_NO_EJECUTO/],
    ['200 pero una fuente no se pudo leer', { statusCode: 200, body: { ...BUENA, completo: false } }, /CICLO_DE_VIDA_INCOMPLETO/],
  ])('%s → la ejecución termina en ERROR', async (_t, resp, patron) => {
    const { promesa } = correr(resp as any)
    await expect(promesa).rejects.toThrow(patron)
  })
})

describe('el reconciliador reconstruido enseña el estado nuevo', () => {
  it('su nodo «Reconciliar» reconoce sin_cierre y es el único que cambia respecto de main', async () => {
    const fs = await import('node:fs')
    const f = JSON.parse(fs.readFileSync('scripts/ops/oficina-marketing/nuevo/pZy6quQakQr9bdRr.json', 'utf8'))
    expect(f.id).toBe('pZy6quQakQr9bdRr')
    expect(f.nodes.map((n: any) => n.name)).toHaveLength(6)
    const rec = f.nodes.find((n: any) => n.name === 'Reconciliar')
    expect(rec.parameters.jsCode).toContain("despacho.status === 'sin_cierre'")
    expect(rec.parameters.jsCode).toContain('const SOLO_LECTURA = false')
  })
})

describe('reservas de CC3 sobre el reloj (K14 y K12)', () => {
  it('K14 · el código REAL del nodo «Reconciliar» clasifica un despacho sin_cierre como ok (no como hallazgo), venga de la edad que venga', async () => {
    const fs = await import('node:fs')
    const f = JSON.parse(fs.readFileSync('scripts/ops/oficina-marketing/nuevo/pZy6quQakQr9bdRr.json', 'utf8'))
    const js: string = f.nodes.find((n: any) => n.name === 'Reconciliar').parameters.jsCode
    const cuerpo = js.slice(0, js.indexOf('// «Reconciliar»') > 0 ? js.indexOf('// «Reconciliar»') : js.length)
    // se evalúa el texto del nodo hasta donde termina la lógica pura, y se pide clasificar
    const fn = new Function(cuerpo + '\nreturn clasificarDespacho;')() as (d: any, i: any, ints: any[], ahora: number) => any
    const ahora = Date.parse('2026-11-02T12:00:00Z')
    for (const dias of [0.1, 2, 40]) {
      const d = { dispatch_key: 'x', status: 'sin_cierre', created_at: new Date(ahora - dias * 86400000).toISOString(), workflow_execution_id: 'e1', agent_name: 'a' }
      expect(fn(d, null, [], ahora).clasificacion).toBe('ok')
    }
    // control: el mismo despacho en curso y viejo SÍ es hallazgo
    const viejo = { dispatch_key: 'x', status: 'running', created_at: new Date(ahora - 40 * 86400000).toISOString(), workflow_execution_id: 'e1', agent_name: 'a' }
    expect(fn(viejo, null, [], ahora).clasificacion).not.toBe('ok')
  })
  it('K12 · la llamada al ciclo tiene un tiempo límite fijo de 60 s y no se queda esperando por error', () => {
    const n = flujo.nodes.find((x: any) => x.name === LLAMAR)
    expect(n.parameters.options.timeout).toBe(60000)
    expect(n.parameters.options.response.response.neverError).toBe(true)
  })
})
