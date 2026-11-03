/**
 * 03-nov · el reloj del barrido de corridas del plan (RESPUESTA Lenovo a CC#2). US$ 0, sin red. Se ejecuta el CÓDIGO REAL de los tres nodos de código.
 * Fija los 6 guardarraíles de la agencia + la regla de Emilio «una alarma por incidente, sus cambios en su hilo»: un fallo alarma UNA vez (y guarda su hilo),
 * mientras siga fallando no repite, y al volver RESPONDE en ese hilo; el incidente solo se abre/cierra cuando Slack confirmó.
 */
import { describe, expect, it } from 'vitest'
import {
  AVISO_DE_ERROR, CANAL_ALERTAS, CODIGO_ANOTA, CODIGO_CIERRE, CODIGO_LIMPIA, CRON, N_ALARMA, N_ANOTA, N_AVISO_VOLVIO, N_BARRER, N_CIERRE, N_LIMPIA, N_RELOJ, N_SI_FALLO, N_SI_VOLVIO, RUTA, construir,
} from '../scripts/ops/reloj-barrido-del-plan.mjs'

const f = construir() as any
const nodo = (n: string) => f.nodes.find((x: any) => x.name === n)
type Mem = { incidente_desde?: string | null; incidente_hilo?: string | null }
/** corre el código de un nodo con la memoria compartida del flujo y el contexto de n8n simulado */
const correr = (codigo: string, json: unknown, mem: Mem) =>
  new Function('$input', '$getWorkflowStaticData', '$workflow', '$execution', '$env', 'console', codigo)(
    { first: () => ({ json }) }, () => mem, { id: 'wf-1' }, { id: 'ex-7' }, { N8N_BASE_URL: 'https://n8n.test/' }, { log: () => {} })
const MAL = [{ statusCode: 404, body: { error: 'x' } }, { statusCode: 401, body: {} }, { statusCode: 500, body: { error: 'plan_corridas_error' } }, {}, { statusCode: 200, body: { accion: 'dry_run' } }, { statusCode: 200, body: 'texto' }, { error: { message: 'ECONNRESET' } }]
const BIEN = { statusCode: 200, body: { accion: 'barrido', vencidas: 1, fallidas: 1 } }
const accion = (codigo: string, json: unknown, mem: Mem) => (correr(codigo, json, mem) as any[])[0].json
/** un tic completo: cierre → (alarma | respuesta en el hilo) con lo que contestaría Slack */
const tic = (json: unknown, mem: Mem, slackOk = true) => {
  const d = accion(CODIGO_CIERRE, json, mem)
  if (d.accion === 'avisar_fallo') { try { accion(CODIGO_ANOTA, slackOk ? { ok: true, ts: '171.001' } : { ok: false, error: 'channel_not_found' }, mem) } catch { /* ejecución en rojo: lo recoge el aviso de errores */ } return { avisos: 1, hilo: null, d } }
  if (d.accion === 'avisar_volvio') { accion(CODIGO_LIMPIA, slackOk ? { ok: true } : { ok: false }, mem); return { avisos: 1, hilo: d.hilo, d } }
  return { avisos: 0, hilo: null, d }
}

describe('el reloj del barrido', () => {
  it('cadencia definida: cada 15 minutos, un solo disparador, reloj → barrer → cierre', () => {
    expect(CRON).toBe('*/15 * * * *')
    expect(nodo(N_RELOJ).parameters.rule.interval[0].expression).toBe(CRON)
    expect(f.nodes.filter((n: any) => n.type.includes('Trigger') || n.type.includes('webhook'))).toHaveLength(1)
    expect(f.connections[N_RELOJ].main[0][0].node).toBe(N_BARRER)
    expect(f.connections[N_BARRER].main[0][0].node).toBe(N_CIERRE)
    expect(f.connections[N_CIERRE].main[0].map((c: any) => c.node).sort()).toEqual([N_SI_FALLO, N_SI_VOLVIO].sort())
  })
  it('llama a la ruta del barrido con la llave interna, sin dry_run, para cualquier cliente (sin client_id)', () => {
    const p = nodo(N_BARRER).parameters
    expect(p.url).toContain(RUTA)
    expect(p.method).toBe('POST')
    expect(JSON.stringify(p.headerParameters)).toContain('$env.INTERNAL_API_KEY')
    expect(p.jsonBody).toContain('"dry_run": false')
    expect(JSON.stringify(p)).not.toMatch(/client_id/)
  })
  it('reintentos con tope: 3 intentos y espera fija; un corte de red llega al cierre (no mata el flujo)', () => {
    const n = nodo(N_BARRER)
    expect(n.retryOnFail).toBe(true)
    expect(n.maxTries).toBe(3)
    expect(n.waitBetweenTries).toBeGreaterThan(0)
    expect(n.onError).toBe('continueRegularOutput')
  })
  it('lo imprevisto no queda mudo: el flujo enlaza el aviso de errores que ya usan otros (E73)', () => {
    expect(f.settings.errorWorkflow).toBe(AVISO_DE_ERROR)
    expect(AVISO_DE_ERROR).toBe('5fkPLbZvQsQa1bcd')
  })
  it('sin costo: ningún nodo llama a agentes, a modelos ni a la sala', () => {
    expect(JSON.stringify(f)).not.toMatch(/agents\/run|sala\/intake|anthropic|openai/i)
  })
})

describe('una alarma por incidente, sus cambios en su hilo', () => {
  it('🔴 el PRIMER fallo (404, 401, 500, vacío, forma distinta o corte de red) manda UNA alarma con qué hacer y el enlace a la corrida', () => {
    for (const r of MAL) {
      const mem: Mem = {}
      const d = accion(CODIGO_CIERRE, r, mem)
      expect(d.accion).toBe('avisar_fallo')
      expect(d.texto).toContain('QUÉ HACER')
      expect(d.texto).toContain('https://n8n.test/workflow/wf-1/executions/ex-7')
      expect(mem.incidente_desde, 'el incidente NO se abre hasta que Slack confirme').toBeFalsy()
    }
  })
  it('la alarma llegada ABRE el incidente y guarda su hilo; si Slack no la confirmó, NO se abre y el siguiente tic vuelve a avisar', () => {
    const mem: Mem = {}
    tic(MAL[0], mem, false)
    expect(mem.incidente_desde).toBeFalsy()
    expect(tic(MAL[0], mem).avisos).toBe(1)
    expect(mem.incidente_hilo).toBe('171.001')
    expect(mem.incidente_desde).toBeTruthy()
  })
  it('🔴 mientras siga fallando NO repite: 96 tics malos seguidos = una sola alarma', () => {
    const mem: Mem = {}
    let avisos = 0
    for (let i = 0; i < 96; i++) avisos += tic(MAL[i % MAL.length], mem).avisos
    expect(avisos).toBe(1)
  })
  it('🔴 al volver a funcionar RESPONDE en el hilo de la alarma (thread_ts) y cierra el incidente; los tics buenos siguientes no avisan', () => {
    const mem: Mem = {}
    tic(MAL[2], mem)
    const v = tic(BIEN, mem)
    expect(v.avisos).toBe(1)
    expect(v.hilo).toBe('171.001')
    expect(mem.incidente_desde).toBeNull()
    expect(mem.incidente_hilo).toBeNull()
    expect(tic(BIEN, mem).avisos).toBe(0)
    expect(tic(BIEN, mem).avisos).toBe(0)
  })
  it('un tic bueno sin incidente no avisa nada', () => {
    expect(accion(CODIGO_CIERRE, BIEN, {}).accion).toBe('nada')
  })
  it('si la respuesta en el hilo no llegó a Slack el incidente sigue abierto y el siguiente tic reintenta', () => {
    const mem: Mem = {}
    tic(MAL[0], mem)
    expect(tic(BIEN, mem, false).avisos).toBe(1)
    expect(mem.incidente_hilo).toBe('171.001')
    expect(tic(BIEN, mem).avisos).toBe(1)
    expect(mem.incidente_desde).toBeNull()
  })
  it('ciclo completo: falla → alarma → sigue sin repetir → vuelve → respuesta en el hilo → nuevo incidente alarma de nuevo con otro hilo', () => {
    const mem: Mem = {}
    expect(tic(MAL[0], mem).avisos).toBe(1)
    expect(tic(MAL[2], mem).avisos).toBe(0)
    expect(tic(BIEN, mem).hilo).toBe('171.001')
    expect(tic(MAL[1], mem).avisos).toBe(1)
    expect(mem.incidente_desde).toBeTruthy()
  })
  it('las condiciones de los dos IF miran la acción exacta (alarma solo con «avisar_fallo», respuesta solo con «avisar_volvio»)', () => {
    const cond = (n: string) => nodo(n).parameters.conditions.conditions[0]
    expect(cond(N_SI_FALLO)).toMatchObject({ leftValue: '={{ $json.accion }}', rightValue: 'avisar_fallo', operator: { type: 'string', operation: 'equals' } })
    expect(cond(N_SI_VOLVIO)).toMatchObject({ leftValue: '={{ $json.accion }}', rightValue: 'avisar_volvio', operator: { type: 'string', operation: 'equals' } })
    // las salidas «no» de ambos IF no llevan a ningún nodo
    expect(f.connections[N_SI_FALLO].main[1]).toEqual([])
    expect(f.connections[N_SI_VOLVIO].main[1]).toEqual([])
    // cada acción que produce el cierre alcanza exactamente su rama
    const ramas = { avisar_fallo: N_SI_FALLO, avisar_volvio: N_SI_VOLVIO } as Record<string, string>
    for (const [a, n] of Object.entries(ramas)) expect(cond(n).rightValue).toBe(a)
  })
  it('las dos llamadas a Slack: #alertas, llave del entorno, no rompen la corrida si Slack falla; la respuesta lleva thread_ts del hilo guardado', () => {
    for (const n of [N_ALARMA, N_AVISO_VOLVIO]) {
      const p = nodo(n)
      expect(p.parameters.url).toBe('https://slack.com/api/chat.postMessage')
      expect(JSON.stringify(p.parameters)).toContain('$env.SLACK_BOT_TOKEN')
      expect(JSON.stringify(p.parameters)).toContain(CANAL_ALERTAS)
      expect(p.onError).toBe('continueRegularOutput')
    }
    expect(nodo(N_AVISO_VOLVIO).parameters.jsonBody).toContain('thread_ts')
    expect(nodo(N_ALARMA).parameters.jsonBody).not.toContain('thread_ts')
    expect(f.connections[N_ALARMA].main[0][0].node).toBe(N_ANOTA)
    expect(f.connections[N_AVISO_VOLVIO].main[0][0].node).toBe(N_LIMPIA)
  })
  it('🔴 si Slack no acepta la alarma la ejecución sale en ROJO (no queda en verde y mudo) y el incidente no se abre', () => {
    const mem: Mem = {}
    accion(CODIGO_CIERRE, MAL[0], mem)
    expect(() => accion(CODIGO_ANOTA, { ok: false, error: 'invalid_auth' }, mem)).toThrow(/no pudo avisar en Slack/)
    expect(() => accion(CODIGO_ANOTA, { ok: true }, mem)).toThrow()
    expect(mem.incidente_desde).toBeUndefined()
  })
  it('🔴 mutantes: sin memoria repite la alarma; abrir sin esperar a Slack; cerrar sin esperar a Slack; responder sin hilo', () => {
    const sinMemoria = CODIGO_CIERRE.replace('if (mem.incidente_desde) {\n  console.log("[reloj-barrido-del-plan] SIGUE', 'if (false) {\n  console.log("[reloj-barrido-del-plan] SIGUE')
    expect(sinMemoria).not.toBe(CODIGO_CIERRE)
    const m1: Mem = {}
    let avisos = 0
    for (let i = 0; i < 5; i++) { if (accion(sinMemoria, MAL[0], m1).accion === 'avisar_fallo') { avisos++; accion(CODIGO_ANOTA, { ok: true, ts: '1' }, m1) } }
    expect(avisos, 'con el mutante avisa 5 veces; la prueba de «una sola alarma» lo atrapa').toBe(5)
    const abreSiempre = CODIGO_ANOTA.replace('if (respuesta.ok !== true || !respuesta.ts) {', 'if (false) {')
    const m2: Mem = {}
    accion(abreSiempre, { ok: false }, m2)
    expect(m2.incidente_desde, 'abre aunque Slack haya fallado').toBeTruthy()
    const cierraSiempre = CODIGO_LIMPIA.replace('if (respuesta.ok !== true) {', 'if (false) {')
    const m3: Mem = { incidente_desde: 'x', incidente_hilo: '1' }
    accion(cierraSiempre, { ok: false }, m3)
    expect(m3.incidente_desde, 'cierra aunque Slack haya fallado').toBeNull()
    const sinHilo = CODIGO_ANOTA.replace('mem.incidente_hilo = respuesta.ts;', '')
    const m4: Mem = {}
    accion(sinHilo, { ok: true, ts: '9' }, m4)
    expect(m4.incidente_hilo).toBeUndefined()
  })
})
