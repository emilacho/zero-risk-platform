// UN N8N EN MINIATURA (J7 · CC#1 · 2026-10-14) · solo para PROBAR los enganches: recorre un flujo nodo por nodo ejecutando el código REAL de los nodos `code`, evaluando las condiciones de los `if` y
// contestando los `httpRequest` y los `wait` con lo que diga la prueba. No habla con ninguna red. Reproduce las reglas de n8n que importan aquí:
//  · `$('nodo')` falla si ese nodo NO se ejecutó en esta corrida (como n8n) · `.first() / .last() / .all()` sobre todas sus ejecuciones · `$runIndex` = cuántas veces ya corrió ESE nodo
//  · un `if` manda sus ítems por la salida 0 (verdadero) o 1 (falso) · `wait` adelanta un reloj falso (Date.now) los segundos que pide
// Lo que NO reproduce (y no se afirma): el orden exacto entre ramas paralelas ni la evaluación de cualquier expresión que no sea `={{ … }}` simple.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

/** evalúa un valor de parámetro: `={{ expr }}` o un texto con `{{ expr }}` incrustado; lo demás se devuelve tal cual */
export function evaluar(valor, ctx) {
  if (typeof valor !== 'string' || !valor.startsWith('=')) return valor
  const cuerpo = valor.slice(1)
  const solo = /^\{\{([\s\S]*)\}\}$/.exec(cuerpo.trim())
  const f = (e) => new Function('$json', '$', '$env', '$workflow', '$execution', `return (${e})`)(ctx.json, ctx.$, ctx.env, ctx.workflow, ctx.execution)
  if (solo && !/\}\}[\s\S]*\{\{/.test(cuerpo)) return f(solo[1])
  return cuerpo.replace(/\{\{([\s\S]*?)\}\}/g, (_m, e) => String(f(e)))
}

/**
 * ejecuta `flujo` desde `inicio` con `itemsDeInicio` como SALIDA de ese nodo (no se ejecuta el nodo `inicio` mismo: su salida es la que se da).
 * opciones: { previos: { [nombre]: json | json[] } (nodos que ya corrieron antes del inicio, para `$('x')`), stubs: { [nombre]: (items, ctx) => items | { items, salida } }, http: { [nombre]: (cuerpo, ctx) => { statusCode, body } | { error } }, env, reloj }
 * Todo `httpRequest` y todo nodo no `code`/`if`/`wait` SIN stub lanza (la prueba debe decir qué contesta).
 */
export async function correr(flujo, { inicio, itemsDeInicio, stubs = {}, http = {}, env = {}, previos = {}, maxPasos = 400, reloj0 = 1_700_000_000_000 }) {
  const porNombre = new Map(flujo.nodes.map((n) => [n.name, n]))
  if (!porNombre.has(inicio)) throw new Error(`no existe el nodo de inicio «${inicio}»`)
  const ejecuciones = new Map() // nombre → [{ items }]
  const visitas = []
  let reloj = reloj0
  const realNow = Date.now
  Date.now = () => reloj
  const workflow = { id: 'WF_PRUEBA', name: flujo.name }
  const execution = { id: 'EX_PRUEBA' }
  const llamadasHttp = []
  const dobles = (items) => items.map((i) => ({ json: i.json }))
  // `$('x').all()` en n8n devuelve los ítems de la ÚLTIMA ejecución del nodo (no todas); `first()/last()` también son de la última. Se imita eso.
  const nodoRefN8n = (nombre) => {
    const ex = ejecuciones.get(nombre)
    if (!ex || !ex.length) throw new Error(`Node '${nombre}' hasn't been executed`)
    const ult = () => ex[ex.length - 1].items
    return { first: () => ult()[0], last: () => ult()[ult().length - 1], all: () => ult() }
  }
  const registrar = (nombre, items) => { if (!ejecuciones.has(nombre)) ejecuciones.set(nombre, []); ejecuciones.get(nombre).push({ items }) }
  for (const [nombre, items] of Object.entries(previos)) registrar(nombre, (Array.isArray(items) ? items : [items]).map((j) => ({ json: j })))
  registrar(inicio, itemsDeInicio)
  let cola = [{ de: inicio, salida: 0, items: itemsDeInicio }]
  let pasos = 0
  try {
    while (cola.length) {
      const { de, salida, items } = cola.shift()
      const destinos = (flujo.connections[de]?.main?.[salida] ?? [])
      for (const d of destinos) {
        if (++pasos > maxPasos) throw new Error('el flujo no termina (más de ' + maxPasos + ' pasos)')
        const n = porNombre.get(d.node)
        if (!n) throw new Error(`enlace a un nodo que no existe: ${d.node}`)
        const corrida = (ejecuciones.get(n.name)?.length ?? 0)
        const ctxBase = { $: nodoRefN8n, env, workflow, execution }
        let salidaDelNodo, ramal = 0
        const entradaJson = items[0]?.json ?? {}
        if (stubs[n.name]) {
          const r = await stubs[n.name](items, { corrida, $: nodoRefN8n })
          if (Array.isArray(r)) salidaDelNodo = r
          else { salidaDelNodo = r.items; ramal = r.salida ?? 0 }
        } else if (n.type === 'n8n-nodes-base.code') {
          const $input = { first: () => items[0], all: () => items, last: () => items[items.length - 1] }
          const f = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', '$runIndex', n.parameters.jsCode)
          const r = await f($input, nodoRefN8n, env, workflow, execution, corrida)
          if (!Array.isArray(r)) throw new Error(`«${n.name}» no devolvió una lista de ítems`)
          salidaDelNodo = r
        } else if (n.type === 'n8n-nodes-base.if') {
          const c = n.parameters.conditions.conditions[0]
          const izq = evaluar(c.leftValue, { ...ctxBase, json: entradaJson })
          // las condiciones de aquí son booleanas («es verdadero»): se compara estricto con `true` para no ocultar un `undefined` como «falso» silencioso
          if (c.operator.operation !== 'true') throw new Error('«' + n.name + '»: solo se simula la condición «es verdadero»')
          ramal = izq === true ? 0 : 1
          salidaDelNodo = items
        } else if (n.type === 'n8n-nodes-base.wait') {
          const p = n.parameters
          const mult = p.unit === 'minutes' ? 60 : p.unit === 'hours' ? 3600 : 1
          if (p.resume === 'timeInterval') reloj += Number(p.amount) * mult * 1000
          else reloj += Number(p.resumeAmount ?? 0) * (p.resumeUnit === 'minutes' ? 60 : 1) * 1000
          salidaDelNodo = items
        } else if (n.type === 'n8n-nodes-base.httpRequest') {
          const h = http[n.name]
          if (!h) throw new Error(`«${n.name}» es un httpRequest sin respuesta preparada en la prueba`)
          const ctx = { ...ctxBase, json: entradaJson }
          const cuerpo = n.parameters.jsonBody !== undefined ? evaluar(n.parameters.jsonBody, ctx) : undefined
          const url = evaluar(n.parameters.url, ctx)
          const cab = Object.fromEntries(((n.parameters.headerParameters && n.parameters.headerParameters.parameters) || []).map((x) => [x.name, evaluar(x.value, ctx)]))
          llamadasHttp.push({ nodo: n.name, url, cuerpo: typeof cuerpo === 'string' ? safeJson(cuerpo) : cuerpo, cabeceras: cab })
          const r = await h(typeof cuerpo === 'string' ? safeJson(cuerpo) : cuerpo, { corrida, url, cabeceras: cab, $: nodoRefN8n })
          salidaDelNodo = [{ json: r }]
        } else {
          throw new Error(`«${n.name}» (${n.type}) no tiene stub en la prueba`)
        }
        registrar(n.name, salidaDelNodo)
        visitas.push({ nodo: n.name, entrada: items.map((i) => i.json), salida: salidaDelNodo.map((i) => i.json), ramal })
        // como en n8n: un nodo sin ítems de salida NO activa a los que le siguen
        if (salidaDelNodo.length) cola.push({ de: n.name, salida: ramal, items: salidaDelNodo })
      }
    }
  } finally { Date.now = realNow }
  return { visitas, llamadasHttp, ejecuciones, reloj, nombres: visitas.map((v) => v.nodo) }
}
const safeJson = (s) => { try { return JSON.parse(s) } catch { return s } }
