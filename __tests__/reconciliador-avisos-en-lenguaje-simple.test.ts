/**
 * 06-nov · pedido de Lenovo (riesgos en escritorio, punto 3): el título de cada aviso del reconciliador lo ve Emilio tal cual
 * (escritorio de riesgos `src/lib/direccion/riesgos.ts` usa `que` como título, y el aviso de #alertas lo repite). Va en lenguaje
 * simple, en origen. Lo que NO cambia: las claves (la tabla las restringe con un CHECK) y la severidad de cada una.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'reconciliador')
const { CLASES, clasificarDespacho } = require(join(DIR, 'clasificar.js'))
const { codigoDeNodo } = await import(pathToFileURL(join(DIR, 'construir-reconciliador.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// palabras de taller que Emilio no tiene por qué conocer
const JERGA = /\b(despacho|callback|vuelta|ledger|sondea|409|corriendo|NADIE|NUNCA|TERMINÓ|ACEPTÓ|FALLÓ|SÍ|NO)\b|«|·/
const GRITO = /\b[A-ZÁÉÍÓÚÑ]{3,}\b/

describe('los títulos de los avisos', () => {
  it('las claves y la severidad quedan como estaban', () => {
    expect(Object.fromEntries(Object.entries(CLASES).map(([k, v]: [string, any]) => [k, v.severidad]))).toEqual({
      ok: 'ok', en_curso: 'ok', entregado_ledger_abierto: 'info', error_entregado: 'info', error_callback_409: 'info',
      termino_y_no_entrego: 'alta', nunca_arranco: 'alta', sin_senales_de_vida: 'alta', error_sin_entrega: 'alta',
    })
  })
  it.each(Object.entries(CLASES))('«%s» se lee en lenguaje simple: sin jerga, sin mayúsculas de grito, empieza con mayúscula', (_k, v: any) => {
    expect(v.que).not.toMatch(JERGA)
    expect(v.que).not.toMatch(GRITO)
    expect(v.que[0]).toBe(v.que[0].toUpperCase())
    expect(v.que.length).toBeLessThanOrEqual(110)
  })
  it('el caso que vio Emilio: «terminó y no entregó» dice qué pasó con palabras de oficina', () => {
    expect(CLASES.termino_y_no_entrego.que).toBe('Un empleado terminó su trabajo, pero el resultado no llegó a quien lo esperaba')
    const c = clasificarDespacho(
      { id: 'i', dispatch_key: 'k', workflow_execution_id: '9', agent_name: 'a', status: 'running', created_at: '2026-11-05T22:00:00Z' },
      { id: 'v', workflow_execution_id: '9', agent_name: 'a', created_at: '2026-11-05T22:30:00Z', duration_ms: 1000, cost_usd: 1, status: 'completed' },
      [], new Date('2026-11-05T23:00:00Z').getTime())
    expect(c).toMatchObject({ clasificacion: 'termino_y_no_entrego', severidad: 'alta', que: CLASES.termino_y_no_entrego.que })
  })
  it('el aviso de #alertas lleva el título simple y el qué hacer simple (lo técnico, entre paréntesis)', async () => {
    const avisos = (['termino_y_no_entrego', 'nunca_arranco', 'sin_senales_de_vida', 'error_sin_entrega'] as const).map((k, i) => ({ dispatch_key: 'd' + i, clasificacion: k, que: CLASES[k].que, agente: 'a', ejecucion: String(i), edad_s: 600, invocacion: null, intentos: 0, ultimo_intento: null }))
    const fn = new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo('armar'))
    const [{ json }] = await fn({ first: () => ({ json: { avisos } }) }, () => ({}), {}, {}, {}, {})
    for (const a of avisos) expect(json.texto).toContain(a.que)
    const queHacer = json.texto.split('\n').filter((l: string) => l.trim().startsWith('→')).map((l: string) => l.replace(/\([^)]*\)/g, ''))
    expect(queHacer).toHaveLength(4)
    for (const l of queHacer) { expect(l).not.toMatch(GRITO); expect(l).not.toMatch(/despacho|corredor|ejecución|agent_invocations/) }
  })
})
