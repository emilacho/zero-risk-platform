/**
 * Ronda 74 · lo que frenaría el tramo 2 (del ensayo en seco): referencia agnóstica · «lo que no se buscó» sin nombres internos · el simulacro del parte llega a la copia por filas y autoproducir se ensaya en seco.
 * Flujos reales (respaldos ANTES de hoy). Tres clientes de práctica de rubros distintos en las pruebas de «no se buscó».
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEXTO_DE_REFERENCIA, NODOS as N74, construirFlujo as planeacion, cambiarVuelta } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-ronda74.mjs'
import { PUERTA, COPIA, construirPuerta, construirCopia, CUERPO_AUTOPRODUCIR_SECO } from '../scripts/worker-staging/cadena/construir-ronda74.mjs'

type Nodo = { name: string; parameters: Record<string, any>; position?: number[] }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const W = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(W, p), 'utf8')) as Flujo
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const cambian = (a: Flujo, b: Flujo) => a.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(b, n.name))).map((n) => n.name)
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const PLA_ANTES = leer('X9F0zp6LQ2xGEYVS/planeacion-r74-ANTES.json'), PLA_HOY = leer('X9F0zp6LQ2xGEYVS/planeacion-r74-ARREGLADO.json')
const PUE_ANTES = leer('cadena/puerta-r74-ANTES.json'), PUE_HOY = leer('cadena/puerta-r74-ARREGLADO.json')
const COP_ANTES = leer('cadena/copia-r74-ANTES.json'), COP_HOY = leer('cadena/copia-r74-ARREGLADO.json')

describe('1 · «La referencia del producto» agnóstica', () => {
  const prohibidos = /\b60 ?%|la casa|emilio|myrtle|settings\.|porcentaje_de_la_casa|centinela|arquitecto|fable|consejero|restaurante|cevich|marisc|hostal|hotel|cafeter|dentista|f[aá]brica|men[uú] con precios|el men[uú]\b|hosteler|booking|airbnb|ol[oó]n|guayaquil|n[aá]ufrago|meta e instagram|meta \+ instagram/i
  it('el texto no nombra reglas internas, firmas, clientes, lugares ni rubros, ni lleva nombres internos con guiones bajos', () => {
    expect(TEXTO_DE_REFERENCIA).not.toMatch(prohibidos)
    expect(TEXTO_DE_REFERENCIA.replace(/https?:\/\/\S+/g, '')).not.toMatch(/\b[a-z]{2,}(?:_[a-z0-9]{2,})+\b/)
  })
  it('conserva el marco y pide lo de primer nivel: ocho secciones, puertas, presupuesto desde la meta con escenarios, marca, disponibilidad, 12 semanas, recompra, agencia agéntica', () => {
    for (const re of [/SOSTAC/, /RACE/, /1 \| El número|\| 1 \| El número/, /\| 8 \| La regla de revisión/, /Capacidad de atender/, /El presupuesto sale de la meta/, /dos escenarios/, /meta de recordaci/, /disponibilidad/i, /calendario de 12 semanas/, /recompra/i, /variantes creativas/, /lenguaje llano/, /No hay un techo artificial/]) expect(TEXTO_DE_REFERENCIA).toMatch(re)
  })
  it('rojo (antes): la referencia viva traía la regla fija del 60 %, las firmas y el ejemplo de otro caso; verde: el nodo nuevo devuelve la v4 y su salida tiene la misma forma', async () => {
    const antes = String(nodo(PLA_ANTES, N74.referencia).parameters.jsCode)
    expect(antes).toMatch(/60 ?%/); expect(antes).toMatch(/Arquitecto de Sistema/)
    const salida = (await new AsyncFunction(String(nodo(PLA_HOY, N74.referencia).parameters.jsCode))())[0].json
    expect(salida.texto).toBe(TEXTO_DE_REFERENCIA); expect(salida.caracteres).toBe(TEXTO_DE_REFERENCIA.length); expect(salida.de_donde).toMatch(/v4 agnóstica/)
    expect(String(nodo(PLA_HOY, N74.referencia).parameters.jsCode)).not.toMatch(/\b60 ?%|Arquitecto de Sistema|Myrtle/)
  })
})

describe('2 · «Lo que NO se buscó y por qué» ante el cliente: lenguaje llano', () => {
  const clientes = [
    { rubro: 'servicio B2B', descartados: [{ objetivo: 'competidores_precio', motivo: 'el rubro no lo requiere · lo pidió sólo quien le vende a empresas' }, { objetivo: 'alojamiento_capacidad', motivo: 'no aplica' }] },
    { rubro: 'tienda en línea', descartados: [{ objetivo: 'velocidad_sitio', motivo: 'no lo pidió ninguno · queda fuera hasta que alguien lo pida' }, { objetivo: 'manual_de_marca', motivo: 'no es objetivo de recolección · entra antes de los brazos' }] },
    { rubro: 'negocio local', descartados: [{ objetivo: 'precios_de_la_zona', motivo: 'sin zona declarada' }] },
  ]
  async function vuelta(f: Flujo, descartados: any) {
    const $ = (n: string) => {
      if (n === 'elegir brazos') return { first: () => ({ json: { descartados } }) }
      if (n === 'Redactor (B4)') return { first: () => ({ json: { registro_usado: { registro: 'tuteo' }, cliente_id: 'c1', contexto_chequeo: null } }) }
      if (n === 'Ficha del cliente') return { first: () => ({ json: { name: 'Cliente' } }) }
      throw new Error('nodo ' + n)
    }
    return (await new AsyncFunction('$input', '$', String(nodo(f, N74.vuelta).parameters.jsCode))({ first: () => ({ json: { body: { response: '# Plan\nTexto del plan.' } } }) }, $))[0].json as Record<string, any>
  }
  it.each(clientes)('$rubro: antes el plan llevaba los nombres internos; ahora el plan va en lenguaje llano y el detalle original queda en la salida del nodo', async (c) => {
    const antes = await vuelta(PLA_ANTES, c.descartados), hoy = await vuelta(PLA_HOY, c.descartados)
    expect(antes.texto).toMatch(/\b[a-z]+_[a-z_]+\b/)
    const bloque = hoy.texto.split('## Lo que NO se buscó y por qué')[1]
    expect(bloque).not.toMatch(/\b[a-z]{2,}(?:_[a-z0-9]{2,})+\b/)
    for (const d of c.descartados) expect(bloque).toContain(d.objetivo.split('_').join(' '))
    expect(hoy.no_se_busco_interno).toEqual(c.descartados); expect(hoy.descartados_declarados).toBe(c.descartados.length)
  })
  it('lista vacía, lista ilegible y objetivos vacíos siguen declarándose, sin reventar', async () => {
    expect((await vuelta(PLA_HOY, [])).texto).toContain('(nada: se pidieron todos')
    expect((await vuelta(PLA_HOY, null)).texto).toContain('No se pudo leer la lista')
    expect((await vuelta(PLA_HOY, [{}])).texto).toContain('(sin nombre) — (sin motivo declarado)')
  })
  it('solo cambian esos dos nodos; se reconstruye igual; no se aplica a ciegas ni dos veces', () => {
    expect(cambian(PLA_ANTES, PLA_HOY).sort()).toEqual([N74.referencia, N74.vuelta].sort()); expect(JSON.stringify(PLA_HOY.connections)).toBe(JSON.stringify(PLA_ANTES.connections))
    expect(JSON.stringify(planeacion(PLA_ANTES as any).nodes)).toBe(JSON.stringify(PLA_HOY.nodes))
    expect(() => planeacion(PLA_HOY as any)).toThrow(); expect(() => cambiarVuelta('const x = 1')).toThrow(/aparece 0 veces/)
  })
})

describe('3 · F7 · el simulacro del parte llega a la copia por filas (solo en seco)', () => {
  const ENV = { SALA_DISPATCH_KEY: 'k-sala' }
  const entrada = (extra: Record<string, unknown>) => ({ first: () => ({ json: { headers: { 'x-sala-dispatch-key': 'k-sala' }, body: { client_id: '0a2ffbd4-0000-4000-8000-000000000001', _journey_id: 'j1', _sala_correlation_id: 'c1', target_step_id: 'router.dispatch.cadena/vigia.briefear', modo: 'parte', campana_id: 'camp1', lote: '2026-W43', fila_ids: ['f1'], ...extra } } }) })
  const correr = async (f: Flujo, extra: Record<string, unknown>) => (await new AsyncFunction('$input', '$env', String(nodo(f, PUERTA.llave).parameters.jsCode))(entrada(extra), ENV))[0].json as Record<string, any>
  const armar = async (f: Flujo, s: Record<string, unknown>) => (await new AsyncFunction('$input', String(nodo(f, PUERTA.armar).parameters.jsCode))({ first: () => ({ json: s }) }))[0].json as Record<string, any>
  it('en seco el simulacro pasa por la llave de la puerta y por «Parte · armar» hasta el cuerpo de la copia; en real se ignora por completo', async () => {
    const seco = await correr(PUE_HOY, { dry_run: true, _simulacro_respuesta: '{"entregables":[]}' })
    expect(seco.simulacro_respuesta).toBe('{"entregables":[]}')
    const cuerpoSeco = JSON.parse((await armar(PUE_HOY, seco)).cuerpo_parte); expect(cuerpoSeco._simulacro_respuesta).toBe('{"entregables":[]}'); expect(cuerpoSeco.dry_run).toBe(true)
    const real = await correr(PUE_HOY, { dry_run: false, _simulacro_respuesta: '{"entregables":[]}' })
    expect(real.simulacro_respuesta).toBeNull(); expect('_simulacro_respuesta' in JSON.parse((await armar(PUE_HOY, real)).cuerpo_parte)).toBe(false)
    const sin = await correr(PUE_HOY, { dry_run: true })
    expect(sin.simulacro_respuesta).toBeNull(); expect('_simulacro_respuesta' in JSON.parse((await armar(PUE_HOY, sin)).cuerpo_parte)).toBe(false)
    expect((await correr(PUE_HOY, { dry_run: true, _simulacro_respuesta: 42 })).simulacro_respuesta).toBeNull()
  })
  it('rojo (antes): la puerta no dejaba pasar el simulacro; verde: solo cambian esos dos nodos y las conexiones quedan', async () => {
    expect((await correr(PUE_ANTES, { dry_run: true, _simulacro_respuesta: 'x' })).simulacro_respuesta).toBeUndefined()
    expect(cambian(PUE_ANTES, PUE_HOY).sort()).toEqual([PUERTA.armar, PUERTA.llave].sort()); expect(JSON.stringify(PUE_HOY.connections)).toBe(JSON.stringify(PUE_ANTES.connections))
    expect(JSON.stringify(construirPuerta(PUE_ANTES as any).nodes)).toBe(JSON.stringify(PUE_HOY.nodes)); expect(() => construirPuerta(PUE_HOY as any)).toThrow()
  })
  it('la copia: el nodo seco deja el parte_seco; un nodo NUEVO lo manda a autoproducir (dry_run:true) y su salida va a «⑤c ¿Salió?»; nada más cambia', () => {
    expect(cambian(COP_ANTES, COP_HOY)).toEqual([COPIA.seco]); expect(COP_HOY.nodes.length).toBe(COP_ANTES.nodes.length + 1)
    const nuevo = nodo(COP_HOY, COPIA.nuevo); expect(nuevo.parameters.jsonBody).toBe(CUERPO_AUTOPRODUCIR_SECO); expect(nuevo.parameters.jsonBody).toMatch(/dry_run: true/); expect(nuevo.parameters.jsonBody).toMatch(/parte_seco: \$json\.parte_seco/)
    expect(COP_HOY.connections[COPIA.seco].main[0][0].node).toBe(COPIA.nuevo); expect(COP_HOY.connections[COPIA.nuevo].main[0][0].node).toBe(COPIA.salio)
    const sinNuevas = Object.keys(COP_HOY.connections).filter((k) => k !== COPIA.seco && k !== COPIA.nuevo)
    for (const k of sinNuevas) expect(JSON.stringify(COP_HOY.connections[k])).toBe(JSON.stringify(COP_ANTES.connections[k]))
    expect(JSON.stringify(construirCopia(COP_ANTES as any).nodes)).toBe(JSON.stringify(COP_HOY.nodes)); expect(() => construirCopia(COP_HOY as any)).toThrow()
  })
  it('el nodo seco entrega el parte_seco con las familias por brief (parte válido) y no cambia el veredicto de uno inválido', async () => {
    const fila = { client_id: 'c', title: 'Parte', output_type: 'campaign_brief_pack', content: 'x', content_text: 'x', producing_agent: 'campaign-brief-agent', status: 'draft', provenance_tag: { campana_id: 'camp1', dry_run: true, familias_por_brief: [{ brief_id: 'B1', fila_id: 'f1', familia: 'post_img' }] } }
    const c = { fila_parte: fila, payload_cable: { event_type: 'run_completed', worker_id: 'w', worker_name: 'brief', resultado: 'parte_terminado', client_id: 'c' }, parte_valido: true, entregables: [], pendientes_declarados: [], lote: '2026-W43' }
    const correrSeco = async (f: Flujo, cc: any) => new AsyncFunction('$input', '$', String(nodo(f, COPIA.seco).parameters.jsCode))({ first: () => ({ json: cc }) }, () => ({ first: () => ({ json: {} }) }))
    const ok = await correrSeco(COP_HOY, c)
    expect(ok[0].json.parte_seco).toEqual({ lote: '2026-W43', valido: true, briefs: [{ brief_id: 'B1', fila_id: 'f1', familia: 'post_img' }] })
    expect((await correrSeco(COP_ANTES, c))[0].json.parte_seco).toBeUndefined()
    await expect(correrSeco(COP_HOY, { ...c, parte_valido: false, motivo_invalido: 'no legible' })).rejects.toThrow(/PARTE_NO_VALIDO/)
  })
})
