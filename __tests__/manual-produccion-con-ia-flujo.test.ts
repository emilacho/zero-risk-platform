/**
 * Encargo 16 · 🔴 2 de CC6 en #1275 (23-nov): la ENTRADA del flujo «Manual · Cómo se produce con IA» compara la llave
 * de la cabecera con INTERNAL_API_KEY (firma de Cerebro: NUNCA SALA_DISPATCH_KEY) y se DETIENE antes de `preparar`
 * con llave vacía, llave errada o entorno sin la variable. US$ 0: el código del nodo corre con un entorno falso, sin n8n.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = path.join(process.cwd(), 'scripts/worker-staging/manual-produccion-con-ia')

// el entorno falso de un nodo de código de n8n (el mismo patrón de __tests__/jefatura-flujos-j4.test.ts)
interface Entorno { input?: unknown[]; env?: Record<string, string> }
function ejecutar(archivo: string, e: Entorno): any[] {
  const codigo = fs.readFileSync(path.join(DIR, archivo), 'utf8')
  const items = (xs: unknown[]) => xs.map((j) => ({ json: j }))
  const entrada = items(e.input ?? [])
  const $input = { first: () => entrada[0], all: () => entrada }
  const $ = () => { throw new Error('la entrada no debe leer otros nodos') }
  return new Function('$input', '$', '$env', '$workflow', '$execution', codigo)($input, $, e.env ?? {}, { id: 'wf-16' }, { id: 'ex-1' })
}

const LLAVE = 'llave-interna-de-prueba'
const pedido = (llave: string | null) => ({ headers: llave === null ? {} : { 'x-api-key': llave }, body: { client_id: 'c0000000-0000-4000-8000-000000000016', dry_run: true } })

describe('⓪ Entrada · llave (n0-entrada.js)', () => {
  it('🔴 sin llave, con llave errada o sin INTERNAL_API_KEY en el entorno: el nodo LANZA (el flujo se detiene antes de `preparar`)', () => {
    // llave vacía / cabecera ausente
    expect(() => ejecutar('n0-entrada.js', { input: [pedido(null)], env: { INTERNAL_API_KEY: LLAVE } })).toThrow(/PRODUCCION_CON_IA_SIN_LLAVE/)
    expect(() => ejecutar('n0-entrada.js', { input: [pedido('')], env: { INTERNAL_API_KEY: LLAVE } })).toThrow(/PRODUCCION_CON_IA_SIN_LLAVE/)
    // llave errada (cualquier texto NO abre el flujo: antes bastaba que viniera no vacía)
    expect(() => ejecutar('n0-entrada.js', { input: [pedido('cualquier-texto')], env: { INTERNAL_API_KEY: LLAVE } })).toThrow(/PRODUCCION_CON_IA_SIN_LLAVE/)
    // entorno sin INTERNAL_API_KEY: ni siquiera una llave vacía coincidente pasa
    expect(() => ejecutar('n0-entrada.js', { input: [pedido('')], env: {} })).toThrow(/PRODUCCION_CON_IA_SIN_LLAVE/)
    expect(() => ejecutar('n0-entrada.js', { input: [pedido(LLAVE)], env: {} })).toThrow(/PRODUCCION_CON_IA_SIN_LLAVE/)
  })
  it('la llave se compara con INTERNAL_API_KEY y NUNCA con SALA_DISPATCH_KEY (firma de Cerebro 23-nov)', () => {
    const codigo = fs.readFileSync(path.join(DIR, 'n0-entrada.js'), 'utf8')
    expect(codigo).toContain('$env.INTERNAL_API_KEY')
    expect(codigo).not.toContain('$env.SALA_DISPATCH_KEY')
    // una SALA_DISPATCH_KEY válida tampoco abre: solo la interna
    expect(() => ejecutar('n0-entrada.js', { input: [pedido('la-de-la-sala')], env: { INTERNAL_API_KEY: LLAVE, SALA_DISPATCH_KEY: 'la-de-la-sala' } })).toThrow(/PRODUCCION_CON_IA_SIN_LLAVE/)
  })
  it('con la llave buena pasa, exige `client_id` y `dry_run` booleano, y NO propaga la llave a los nodos siguientes', () => {
    const r = ejecutar('n0-entrada.js', { input: [{ headers: { 'x-api-key': LLAVE }, body: { client_id: ' c0000000-0000-4000-8000-000000000016 ', dry_run: false, reescribir: true } }], env: { INTERNAL_API_KEY: LLAVE } })
    expect(r[0].json).toEqual({ client_id: 'c0000000-0000-4000-8000-000000000016', dry_run: false, reescribir: true, workflow_id: 'wf-16', workflow_execution_id: 'ex-1' })
    expect(JSON.stringify(r[0].json)).not.toContain(LLAVE)
    expect(() => ejecutar('n0-entrada.js', { input: [{ headers: { 'x-api-key': LLAVE }, body: { dry_run: true } }], env: { INTERNAL_API_KEY: LLAVE } })).toThrow(/falta client_id/)
    expect(() => ejecutar('n0-entrada.js', { input: [{ headers: { 'x-api-key': LLAVE }, body: { client_id: 'c1' } }], env: { INTERNAL_API_KEY: LLAVE } })).toThrow(/dry_run es obligatorio/)
  })
  it('los 4 nodos de código del flujo compilan', () => {
    for (const f of ['n0-entrada.js', 'n1-guarda.js', 'n2-vuelta.js', 'n3-fin.js']) {
      expect(() => new Function('$input', '$', '$env', '$workflow', '$execution', fs.readFileSync(path.join(DIR, f), 'utf8')), f).not.toThrow()
    }
  })
})

describe('② Agente · run-sdk (construir.mjs) · escritura fresca', () => {
  it('🔴 (ADENDA 27-nov) el nodo ② manda `force_restart: true`: el corredor NUNCA devuelve el punto de control de una corrida vieja', () => {
    // el flujo CONSTRUIDO (no el texto fuente): `--salida` escribe el mismo JSON que iría a n8n, sin tocar nada vivo
    const salida = fs.mkdtempSync(path.join(os.tmpdir(), 'e17-flujo-construido-'))
    try {
      execFileSync(process.execPath, [path.join(DIR, 'construir.mjs'), `--salida=${salida}`], { stdio: 'pipe' })
      const flujo = JSON.parse(fs.readFileSync(path.join(salida, 'manual-produccion-con-ia.json'), 'utf8'))
      const agente = flujo.nodes.find((n: { name: string }) => n.name === '② Agente · run-sdk') as { parameters: { jsonBody: string } } | undefined
      expect(agente, 'el nodo ② existe en el flujo construido').toBeTruthy()
      // el cuerpo REAL que el nodo manda a run-sdk: se evalúa la expresión n8n con un $json de muestra
      const expr = String(agente!.parameters.jsonBody).replace(/^=\{\{/, '').replace(/\}\}$/, '')
      const $json = { client_id: 'c-x', workflow_id: 'wf-x', workflow_execution_id: 'ex-x', insumos: { task: 'pedido' } }
      const body = JSON.parse(new Function('$json', `return (${expr})`)($json))
      // 27-nov: la llave del punto de control es (flujo, cliente, paso) sin ejecución; con `false` una corrida nueva recibió el texto viejo del 23-nov
      expect(body.force_restart).toBe(true)
      // lo certificado por CC6 no cambia: el agente de la mesa, el tope 0,80 y el paso con nombre
      expect(body).toMatchObject({ agent: 'creative-director-mesa', max_budget_usd: 0.8, step_name: 'manual-produccion-con-ia', dry_run: false })
    } finally {
      fs.rmSync(salida, { recursive: true, force: true })
    }
  })
})
