/**
 * SIMULADOR DE FLUJOS n8n (lo justo para los flujos de la cadena) · para PROBAR el grafo entero sin encender nada, sin red y sin modelo.
 *
 * Soporta los tipos que usan los flujos: webhook · scheduleTrigger · executeWorkflowTrigger · code (una vez para todos los ítems) · if (v2) · httpRequest · wait (la vuelta ya llegó: pasa los ítems) · executeWorkflow (una vez / uno por ítem).
 * Un nodo HTTP con `onError: continueRegularOutput` que falla (red, tiempo) entrega `{ error: { message } }` y el flujo sigue, como n8n.
 * Reglas de n8n que respeta: un nodo corre una vez por cada llegada de datos; `$('nodo')` ve la ÚLTIMA corrida de ese nodo (los bucles reescriben); el IF decide por ítem (salida 0 = verdadero, 1 = falso);
 * un nodo sin salida de datos detiene esa rama; una excepción en un nodo de código ABORTA la ejecución (como un fallo real).
 * Las expresiones `={{ … }}` se evalúan con `$json`, `$('nodo')`, `$env`, `$workflow`, `$execution`.
 * NO es n8n: lo que no soporta lo dice en voz alta (lanza), nunca lo ignora.
 */
export interface NodoN8n { name: string; type: string; typeVersion?: number; parameters: Record<string, any>; onError?: string }
export interface FlujoN8n { name: string; nodes: NodoN8n[]; connections: Record<string, { main: { node: string; type: string; index: number }[][] }> }
export interface PeticionHttp { metodo: string; url: string; cabeceras: Record<string, string>; cuerpo: unknown; cuerpoCrudo: string | undefined; timeout: number | undefined; texto: boolean }
export interface RespuestaHttp { statusCode: number; body: unknown; headers?: Record<string, string> }
export type Item = { json: any }

export interface OpcionesSim {
  flujos: Record<string, FlujoN8n>
  env?: Record<string, string>
  http: (p: PeticionHttp, ctx: { flujoId: string; nodo: string }) => Promise<RespuestaHttp>
}
export interface Traza { flujo: string; nodo: string }

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...a: string[]) => (...b: any[]) => Promise<any>

export class SimuladorN8n {
  ejecuciones = 0
  traza: Traza[] = []
  constructor(private o: OpcionesSim) {}

  async ejecutar(flujoId: string, entrada: Item[], inicio?: string): Promise<Item[]> {
    const flujo = this.o.flujos[flujoId]
    if (!flujo) throw new Error(`el simulador no tiene el flujo ${flujoId}`)
    const exId = String(++this.ejecuciones)
    const corridas = new Map<string, Item[][]>()
    const ultimo = (n: string) => { const c = corridas.get(n); if (!c || !c.length) throw new Error(`«${n}» no ha corrido (referencia a un nodo sin datos)`); return c[c.length - 1] }
    const referencia = (n: string) => { const items = ultimo(n); return { first: () => items[0], last: () => items[items.length - 1], all: () => items, item: items[0] } }
    const cola: { nodo: string; items: Item[] }[] = []
    const primero = inicio ?? flujo.nodes.find((n) => /Trigger$|webhook$/.test(n.type))?.name
    if (!primero) throw new Error(`el flujo ${flujoId} no tiene un nodo de entrada`)
    cola.push({ nodo: primero, items: entrada })
    let ultimaSalida: Item[] = []
    let pasos = 0
    while (cola.length) {
      if (++pasos > 5000) throw new Error('el simulador cortó la ejecución: más de 5000 pasos (¿un bucle sin fin?)')
      const { nodo: nombre, items } = cola.shift()!
      const nodo = flujo.nodes.find((n) => n.name === nombre)
      if (!nodo) throw new Error(`conexión a un nodo que no existe: «${nombre}»`)
      this.traza.push({ flujo: flujoId, nodo: nombre })
      const ctx = (item?: Item) => ({ $json: item?.json, $: referencia, $env: this.o.env ?? {}, $workflow: { id: flujoId, name: flujo.name }, $execution: { id: exId, resumeUrl: `https://n8n/resume/${exId}` } })
      let salidas: Item[][]
      switch (nodo.type.replace('n8n-nodes-base.', '')) {
        case 'webhook': case 'scheduleTrigger': case 'executeWorkflowTrigger': salidas = [items]; break
        case 'code': {
          const c = ctx(items[0])
          const fn = new AsyncFunction('$input', '$json', '$', '$env', '$workflow', '$execution', nodo.parameters.jsCode)
          const r = await fn({ first: () => items[0], all: () => items, last: () => items[items.length - 1], item: items[0] }, c.$json, c.$, c.$env, c.$workflow, c.$execution)
          if (!Array.isArray(r)) throw new Error(`«${nombre}»: un nodo de código debe devolver una lista de ítems`)
          salidas = [r]
          break
        }
        case 'if': {
          const v: Item[] = [], f: Item[] = []
          for (const it of items) (this.evaluar(nodo.parameters.conditions.conditions[0].leftValue, ctx(it)) ? v : f).push(it)
          salidas = [v, f]
          break
        }
        case 'httpRequest': {
          const out: Item[] = []
          for (const it of items) {
            const c = ctx(it), p = nodo.parameters
            const cabeceras: Record<string, string> = {}
            for (const h of p.headerParameters?.parameters ?? []) cabeceras[String(h.name).toLowerCase()] = String(this.evaluar(h.value, c) ?? '')
            const crudo = p.sendBody ? this.evaluar(p.jsonBody, c) : undefined
            let cuerpo: unknown = crudo
            if (typeof crudo === 'string') { try { cuerpo = JSON.parse(crudo) } catch { cuerpo = crudo } }
            const full = p.options?.response?.response?.fullResponse === true
            let r: RespuestaHttp
            try { r = await this.o.http({ metodo: p.method ?? 'GET', url: String(this.evaluar(p.url, c)), cabeceras, cuerpo, cuerpoCrudo: typeof crudo === 'string' ? crudo : undefined, timeout: p.options?.timeout, texto: p.options?.response?.response?.responseFormat === 'text' }, { flujoId, nodo: nombre }) } catch (e) { if (nodo.onError !== 'continueRegularOutput') throw e; out.push({ json: { error: { message: e instanceof Error ? e.message : String(e) } } }); continue }
            if (!full && r.statusCode >= 400 && nodo.onError !== 'continueRegularOutput' && p.options?.response?.response?.neverError !== true) throw new Error(`«${nombre}»: HTTP ${r.statusCode}`)
            // n8n parte una respuesta que es una LISTA en un ítem por elemento (una lista vacía llega como un ítem vacío)
            if (!full && Array.isArray(r.body)) out.push(...(r.body.length ? r.body.map((x: unknown) => ({ json: x })) : [{ json: {} }]))
            else out.push({ json: full ? { statusCode: r.statusCode, headers: r.headers ?? {}, body: r.body } : r.body })
          }
          salidas = [out]
          break
        }
        case 'wait': salidas = [items]; break
        case 'executeWorkflow': {
          const id = nodo.parameters.workflowId?.value ?? nodo.parameters.workflowId
          if (!this.o.flujos[id]) throw new Error(`«${nombre}» llama al flujo ${String(id)}, que el simulador no tiene`)
          if (nodo.parameters.mode === 'each') {
            const out: Item[] = []
            for (const it of items) out.push(...(await this.ejecutar(id, [it])))
            salidas = [out]
          } else salidas = [await this.ejecutar(id, items)]
          break
        }
        default: throw new Error(`el simulador no soporta el nodo «${nombre}» de tipo ${nodo.type}`)
      }
      const c = corridas.get(nombre) ?? []
      c.push(salidas[0] ?? [])
      corridas.set(nombre, c)
      const siguientes = flujo.connections[nombre]?.main ?? []
      let hubo = false
      salidas.forEach((its, idx) => {
        if (!its.length) return
        for (const dest of siguientes[idx] ?? []) { cola.push({ nodo: dest.node, items: its }); hubo = true }
      })
      if (!hubo) ultimaSalida = salidas.flat()
    }
    return ultimaSalida
  }

  /** `={{ expr }}` solo → el valor; texto con `{{ }}` → texto; sin `=` → tal cual */
  evaluar(valor: unknown, c: { $json: any; $: any; $env: any; $workflow: any; $execution: any }): any {
    if (typeof valor !== 'string' || !valor.startsWith('=')) return valor
    const t = valor.slice(1)
    const ev = (expr: string) => new Function('$json', '$', '$env', '$workflow', '$execution', `return (${expr})`)(c.$json, c.$, c.$env, c.$workflow, c.$execution)
    const solo = /^\s*\{\{([\s\S]*)\}\}\s*$/.exec(t)
    if (solo && !/\}\}[\s\S]*\{\{/.test(solo[1])) return ev(solo[1])
    return t.replace(/\{\{([\s\S]*?)\}\}/g, (_m, e) => { const r = ev(e); return typeof r === 'object' ? JSON.stringify(r) : String(r ?? '') })
  }
}
