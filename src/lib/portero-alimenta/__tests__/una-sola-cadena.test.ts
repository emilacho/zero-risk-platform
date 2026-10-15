/**
 * UNA SOLA CADENA DEL PORTERO (15-oct · reparo de #566). El alta NO puede llevar una copia de la cadena del portero: cada arreglo al portero tendría que repetirse y,
 * si se olvida, el primer día de cada cliente nuevo correría con una cadena vieja. El alta solo LLAMA al flujo del portero para ese cliente.
 * Guarda: falla si el alta vuelve a tener nodos de la cadena (por nombre, por ruta o por código). También prueba la entrada nueva del portero ejecutando su código real.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '../../../..')
const leer = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts/worker-staging', ...p), 'utf8'))
const ALTA = leer('LyVoKcrypS5uLyuu', 'LyVoKcrypS5uLyuu-ARREGLADO-una-sola-cadena-2026-10-15.json')
const PORTERO = leer('ogfq56oIEoHufFPM', 'ogfq56oIEoHufFPM-ARREGLADO-completar-despertar-2026-10-15.json')
type Nodo = { name: string; type: string; parameters: Record<string, unknown> }
const NOMBRES_DE_LA_CADENA = (PORTERO.nodes as Nodo[]).filter((n) => !/webhook|scheduleTrigger/.test(n.type)).map((n) => n.name)
const texto = (n: Nodo) => JSON.stringify(n.parameters)

describe('el alta no tiene una copia de la cadena del portero', () => {
  it('ningún nodo del alta tiene el nombre de un nodo de la cadena del portero', () => {
    const del_alta = new Set((ALTA.nodes as Nodo[]).map((n) => n.name))
    expect(NOMBRES_DE_LA_CADENA.length).toBeGreaterThanOrEqual(11)
    expect(NOMBRES_DE_LA_CADENA.filter((n) => del_alta.has(n))).toEqual([])
  })
  it('ningún nodo del alta llama a las rutas de la cadena (descubrir · procesar · vigilar) ni arma su plan', () => {
    const malos = (ALTA.nodes as Nodo[]).filter((n) => /\/api\/brain\/alimentar\/(descubrir|procesar|vigilar)/.test(texto(n)))
    expect(malos.map((n) => n.name)).toEqual([])
  })
  it('hay UN solo nodo que llama al flujo del portero, cuelga del despertar y no espera la respuesta larga', () => {
    const llamadas = (ALTA.nodes as Nodo[]).filter((n) => /cerebro-completar-despertar/.test(texto(n)))
    expect(llamadas).toHaveLength(1)
    expect(ALTA.connections['⑦ Despertar el cerebro (con el raspado del alta)'].main[0].map((x: { node: string }) => x.node)).toEqual([llamadas[0].name])
    expect(((llamadas[0].parameters.options as { timeout: number }).timeout)).toBeLessThanOrEqual(60_000)
    expect(texto(llamadas[0])).not.toMatch(/SALA_DISPATCH_KEY/)
    expect(texto(llamadas[0])).toMatch(/pedir_ahora/)
  })
  it('el alta sigue inactiva y la corrida diaria del portero conserva sus 16 nodos de siempre', () => {
    expect(ALTA.active).toBe(false)
    const antes = leer('ogfq56oIEoHufFPM', 'ogfq56oIEoHufFPM-ANTES-completar-despertar-2026-10-15.json')
    const previos = new Map((antes.nodes as Nodo[]).map((n) => [n.name, texto(n)]))
    const cambian = (PORTERO.nodes as Nodo[]).filter((n) => previos.has(n.name) && previos.get(n.name) !== texto(n)).map((n) => n.name)
    expect(cambian).toEqual(['⓪ Entrada'])
    expect((PORTERO.nodes as Nodo[]).filter((n) => !previos.has(n.name)).map((n) => n.name)).toEqual(['Webhook · completar despertar (llave interna)'])
  })
  it('el alta ARREGLADA solo se diferencia de su base por quitar las copias y poner la llamada', () => {
    const base = leer('LyVoKcrypS5uLyuu', 'LyVoKcrypS5uLyuu-ANTES-una-sola-cadena-2026-10-15.json')
    const b = new Set((base.nodes as Nodo[]).map((n) => n.name)), a = new Set((ALTA.nodes as Nodo[]).map((n) => n.name))
    expect([...a].filter((n) => !b.has(n))).toEqual(['⑧ Completar lo que falta (llama al flujo del portero)'])
    expect([...b].filter((n) => !a.has(n))).toHaveLength(13)
  })
})

describe('la entrada nueva del portero (se ejecuta el código real del nodo «⓪ Entrada»)', () => {
  const codigo = (PORTERO.nodes as Nodo[]).find((n) => n.name === '⓪ Entrada')!.parameters.jsCode as string
  const CL = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
  const correr = (opts: { despertar?: unknown; manual?: unknown; env?: Record<string, string> }) => {
    const nodos: Record<string, unknown> = {
      'Webhook · completar despertar (llave interna)': opts.despertar,
      'Webhook · a mano (con llave)': opts.manual,
    }
    const ctx = {
      $: (n: string) => { if (nodos[n] === undefined) throw new Error('nodo sin correr'); return { first: () => nodos[n] } },
      $workflow: { id: 'ogfq56oIEoHufFPM' }, $execution: { id: '777' },
      $env: { INTERNAL_API_KEY: 'k-interna', SALA_DISPATCH_KEY: 'k-sala', ...(opts.env ?? {}) },
      Error, String, RegExp, Object, JSON,
    }
    return vm.runInNewContext(`(function(){${codigo}\n})()`, ctx) as Array<{ json: Record<string, unknown> }>
  }
  const hook = (headers: Record<string, string>, body: unknown) => ({ json: { headers, body } })

  it('con la llave interna, client_id y pedir_ahora: corre para ESE cliente, real, con el flujo del portero', () => {
    const r = correr({ despertar: hook({ 'x-api-key': 'k-interna' }, { client_id: CL, pedir_ahora: true }) })
    expect(r).toHaveLength(1)
    expect(r[0].json).toMatchObject({ via: 'despertar', dry_run: false, client_id: CL, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: '777' })
  })
  it('pedir_ahora distinto de true: no corre nada (cero elementos)', () => {
    for (const b of [{ client_id: CL }, { client_id: CL, pedir_ahora: false }, { client_id: CL, pedir_ahora: 'true' }]) {
      expect(correr({ despertar: hook({ 'x-api-key': 'k-interna' }, b) })).toEqual([])
    }
  })
  it('sin llave, con llave equivocada o con la llave de despacho: SE DETIENE', () => {
    const cabeceras: Array<Record<string, string>> = [{}, { 'x-api-key': 'otra' }, { 'x-sala-dispatch-key': 'k-sala' }]
    for (const h of cabeceras) {
      expect(() => correr({ despertar: hook(h, { client_id: CL, pedir_ahora: true }) })).toThrow(/DESPERTAR_SIN_LLAVE/)
    }
    expect(() => correr({ despertar: hook({ 'x-api-key': 'k' }, { client_id: CL, pedir_ahora: true }), env: { INTERNAL_API_KEY: '' } })).toThrow(/DESPERTAR_SIN_LLAVE/)
  })
  it('client_id ausente o que no es uuid: SE DETIENE (nunca corre «todos los clientes»)', () => {
    for (const b of [{ pedir_ahora: true }, { client_id: 'no-uuid', pedir_ahora: true }, { client_id: 123, pedir_ahora: true }]) {
      expect(() => correr({ despertar: hook({ 'x-api-key': 'k-interna' }, b) })).toThrow(/DESPERTAR_CLIENTE_INVALIDO/)
    }
  })
  it('la corrida diaria no cambia: horario → todos los clientes, real; a mano → llave de despacho y dry_run booleano', () => {
    expect(correr({})[0].json).toMatchObject({ via: 'horario', dry_run: false, client_id: null })
    expect(correr({ manual: hook({ 'x-sala-dispatch-key': 'k-sala' }, { dry_run: true, client_id: CL }) })[0].json).toMatchObject({ via: 'a mano', dry_run: true, client_id: CL })
    expect(() => correr({ manual: hook({}, { dry_run: true }) })).toThrow(/DIARIO_SIN_LLAVE/)
    expect(() => correr({ manual: hook({ 'x-sala-dispatch-key': 'k-sala' }, {}) })).toThrow(/DIARIO_DRY_RUN_OBLIGATORIO/)
    // la llave interna NO abre la entrada «a mano»
    expect(() => correr({ manual: hook({ 'x-api-key': 'k-interna' }, { dry_run: true }) })).toThrow(/DIARIO_SIN_LLAVE/)
  })
})
