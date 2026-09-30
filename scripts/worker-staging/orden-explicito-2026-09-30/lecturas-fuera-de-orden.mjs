// LA REGLA ADOPTADA (Emilio · 30-sep): «todo flujo se prueba con todas sus ramas llenas y se compara el orden de ejecución». Y la regla de diseño que la hace innecesaria:
// TODA lectura por nombre `$('X')` / `$node["X"]` debe apuntar a un ANTECESOR del nodo que lee (X está garantizado antes por el grafo), salvo los disparadores, que son
// alternativos entre sí (sólo corre uno) y se leen con `try/catch`.
// Esta librería es la MISMA lógica del auditor y de las pruebas: una sola definición de «lectura fuera de orden».
//
// Sólo sigue conexiones `main`. Heurística: un antecesor es cualquier nodo desde el que se llega al que lee por conexiones `main`.

const TIPO_DISPARADOR = /webhook|trigger|schedule|manual/i

export function antecesoresDe(flujo) {
  const padres = {}
  for (const [de, c] of Object.entries(flujo.connections || {})) {
    for (const salidas of c.main || []) for (const h of salidas || []) (padres[h.node] = padres[h.node] || new Set()).add(de)
  }
  return (nombre) => {
    const vistos = new Set()
    const pila = [...(padres[nombre] || [])]
    while (pila.length) {
      const x = pila.pop()
      if (vistos.has(x)) continue
      vistos.add(x)
      for (const p of padres[x] || []) pila.push(p)
    }
    return vistos
  }
}

/** los nombres que un nodo lee por referencia (`$('X')`, `$("X")`, `$node["X"]`), en cualquier parámetro */
export function referenciasDe(nodo) {
  const texto = JSON.stringify(nodo.parameters || {})
  const refs = new Set()
  for (const m of texto.matchAll(/\$\(\\?["']([^"'\\]+?)\\?["']\)/g)) refs.add(m[1])
  for (const m of texto.matchAll(/\$node\[\\?["']([^"'\\]+?)\\?["']\]/g)) refs.add(m[1])
  return refs
}

/** lecturas a un nodo que NO es antecesor del que lee · sin contar disparadores · cada una dice si el que lee tolera la ausencia (`try/catch`) */
export function lecturasFueraDeOrden(flujo) {
  const nombres = new Set(flujo.nodes.map((n) => n.name))
  const disparadores = new Set(flujo.nodes.filter((n) => TIPO_DISPARADOR.test(n.type)).map((n) => n.name))
  const anc = antecesoresDe(flujo)
  const hallazgos = []
  for (const n of flujo.nodes) {
    const misAntecesores = anc(n.name)
    for (const r of referenciasDe(n)) {
      if (r === n.name || !nombres.has(r) || misAntecesores.has(r) || disparadores.has(r)) continue
      hallazgos.push({ nodo_que_lee: n.name, lee_a: r, tolera_ausencia: /try\s*\{|catch/.test(JSON.stringify(n.parameters || {})) })
    }
  }
  return hallazgos
}

/** el orden REAL de una ejecución de n8n (runData) · [{n, nodo, items}] por hora de inicio */
export function ordenDeEjecucion(runData) {
  const a = []
  for (const [nodo, runs] of Object.entries(runData || {})) {
    for (const r of runs) a.push({ t: r.startTime, nodo, items: r.data?.main?.[0]?.length ?? 0 })
  }
  a.sort((x, y) => x.t - y.t)
  return a.map((x, i) => ({ n: i + 1, nodo: x.nodo, items: x.items }))
}
