/**
 * Emulador mínimo del motor de n8n para ejecutar el CÓDIGO REAL de los nodos (Code · If · HTTP) de los flujos de la oficina de marketing (T5). Sin red: el HTTP lo contesta quien llama.
 * No es n8n: solo lo que esos nodos usan (`$input`, `$('nodo')`, `$env`, `$workflow`, `$execution`, expresiones `={{ … }}`).
 */
export type Item = Record<string, any>
export type Http = (url: string, headers: Record<string, string>, cuerpo: any) => Promise<{ statusCode: number; body: any }>

const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor as new (...a: string[]) => (...a: any[]) => Promise<any>

function entorno(env: Record<string, string>, historial: Record<string, Item[]>, entrada: Item) {
  const dolar = (n: string) => ({ last: () => ({ json: (historial[n] ?? [])[(historial[n] ?? []).length - 1] ?? {} }), first: () => ({ json: (historial[n] ?? [])[0] ?? {} }), all: () => (historial[n] ?? []).map((json) => ({ json })) })
  return { $: dolar, $input: { first: () => ({ json: entrada }), all: () => [{ json: entrada }] }, $env: env, $workflow: { id: 'wf-puerta' }, $execution: { id: 'ex-1' }, $json: entrada }
}

const evaluar = (cuerpo: string, ctx: ReturnType<typeof entorno>): any =>
  new Function('$json', '$env', '$', '$workflow', '$execution', `return (${cuerpo})`)(ctx.$json, ctx.$env, ctx.$, ctx.$workflow, ctx.$execution)

/** `={{ x }}` devuelve el valor tal cual; `=texto {{ x }} texto` (expresión incrustada) devuelve el texto armado */
const expr = (s: unknown, ctx: ReturnType<typeof entorno>): any => {
  if (typeof s !== 'string' || !s.startsWith('=')) return s
  const entero = /^=\{\{([\s\S]*)\}\}$/.exec(s)
  if (entero && !entero[1].includes('}}')) return evaluar(entero[1].trim(), ctx)
  return s.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_m, e) => String(evaluar(String(e).trim(), ctx)))
}

export async function recorrer(flujo: any, desde: string, entrada: Item, o: { env?: Record<string, string>; http?: Http; previos?: Record<string, Item[]>; hasta?: string[] } = {}) {
  const env = { ZERO_RISK_API_URL: 'https://api.test', INTERNAL_API_KEY: 'llave-interna', SALA_DISPATCH_KEY: 'llave-sala', ...(o.env ?? {}) }
  const historial: Record<string, Item[]> = { ...(o.previos ?? {}) }
  const pasos: string[] = []
  let nombre: string | null = desde
  let item = entrada
  for (let i = 0; i < 60 && nombre; i++) {
    const n = flujo.nodes.find((x: any) => x.name === nombre)
    if (!n) throw new Error(`no existe el nodo «${nombre}»`)
    if (o.hasta?.includes(nombre)) { pasos.push(nombre); return { pasos, item, ultimo: nombre, historial, vacio: false } }
    const ctx = entorno(env, historial, item)
    let salida = 0
    if (n.type.endsWith('.code')) {
      const f = new AsyncFunction('$input', '$', '$env', '$workflow', '$execution', n.parameters.jsCode)
      const r = await f(ctx.$input, ctx.$, ctx.$env, ctx.$workflow, ctx.$execution)
      if (!r.length) { pasos.push(nombre); return { pasos, item: null as any, ultimo: nombre, historial, vacio: true } }
      item = r[0].json
    } else if (n.type.endsWith('.if')) {
      const c = n.parameters.conditions.conditions[0]
      const izq = expr(c.leftValue, ctx)
      salida = String(izq) === String(c.rightValue) ? 0 : 1
    } else if (n.type.endsWith('.httpRequest')) {
      if (!o.http) throw new Error('el recorrido llegó a un nodo HTTP sin simulador')
      const url = expr(n.parameters.url, ctx)
      const headers = Object.fromEntries((n.parameters.headerParameters?.parameters ?? []).map((p: any) => [p.name, expr(p.value, ctx)]))
      const cuerpo = n.parameters.method === 'GET' ? null : JSON.parse(expr(n.parameters.jsonBody, ctx))
      const r = await o.http(url, headers, cuerpo)
      item = { statusCode: r.statusCode, body: r.body }
    } else throw new Error(`tipo de nodo sin emulador: ${n.type}`)
    historial[nombre] = [...(historial[nombre] ?? []), item]
    pasos.push(nombre)
    const sig: any[] | undefined = flujo.connections[nombre]?.main?.[salida]
    nombre = sig?.[0]?.node ?? null
  }
  return { pasos, item, ultimo: pasos[pasos.length - 1], historial, vacio: false }
}
