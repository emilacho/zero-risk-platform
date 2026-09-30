// PLANEACIÓN · LA ANALÍTICA PROPIA ES DE CUALQUIER CLIENTE + LO QUE NO SE BUSCÓ SE DECLARA EN EL PLAN · CC#1 · 2026-09-30 · decisión de Emilio.
//
// Tres parches sobre la foto del flujo vivo `planeacion-antes-analitica-2026-09-30.json` (v 2cb31183) · lista cerrada · cada uno con su conteo esperado:
//   ① «elegir brazos» · `analitica_propia` deja de ser condicional a «le vende a empresas». Somos una agencia agéntica para CUALQUIER cliente: el
//      criterio correcto es si el sitio del cliente tiene datos. Acá no se sabe (lo mira el brazo, que dice «trajo» o «se miró y no hay»): se pide siempre
//      que haya un dominio propio; si no lo hay o es una red social, se DESCARTA diciendo qué falta (`parametrosDe` ya lo dice). `competidores_precio`
//      SIGUE siendo condicional B2B (no se toca).
//   ② «¿Llegó la vuelta?» · lo que no se buscó se DECLARA DENTRO DEL TEXTO DEL PLAN, con su motivo, escrito por el SISTEMA (no depende de que el redactor
//      lo recuerde): «Lo que NO se buscó y por qué». Misma familia del parte que no miente: que no desaparezca del razonamiento sin dejar marca.
//   ③ «Redactor (B4)» · una línea de su pedido (el bloque ⚪) para que no choque con ②.
//
//   node construir-analitica-propia-2026-09-30.mjs            → escribe `planeacion-construida-analitica-2026-09-30.json` (NO toca n8n)
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const aqui = dirname(fileURLToPath(import.meta.url))
export const ELEGIR = 'elegir brazos'
export const VUELTA = '¿Llegó la vuelta?'
export const REDACTOR = 'Redactor (B4)'
const SETTINGS_OK = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder']

function reemplazar(code, viejo, nuevo, veces, quien) {
  const c = code.split(viejo).length - 1
  if (c !== veces) throw new Error(`${quien}: «${viejo.slice(0, 50)}…» aparece ${c} veces, esperaba ${veces}`)
  // función de reemplazo a propósito: `$'` y `$&` dentro del texto nuevo NO se interpretan
  return code.split(viejo).join(nuevo)
}

// ① elegir brazos
export const ELEGIR_VIEJO = `// ── LOS DOS CONDICIONALES · y son éstos, no otros ──────────────────────────
// Medido: los pidió SÓLO el que le vende a empresas.
if (sin_rubro) {
  // «no se pudo saber» NO es «no correspondía». Se dice cuál de los dos fue.
  descartar('competidores_precio', 'la ficha del cliente no dice a qué se dedica · no se pudo decidir');
  descartar('analitica_propia', 'la ficha del cliente no dice a qué se dedica · no se pudo decidir');
} else if (a_empresas) {
  pedir('apify', 'competidores_precio');
  pedir('posthog', 'analitica_propia');
} else {
  descartar('competidores_precio', 'el rubro no lo requiere · lo pidió sólo quien le vende a empresas');
  descartar('analitica_propia', 'el rubro no lo requiere · lo pidió sólo quien le vende a empresas');
}`
export const ELEGIR_NUEVO = `// ── LA ANALÍTICA PROPIA ES NÚCLEO, NO CONDICIONAL (decisión de Emilio 2026-09-30) ─────────
// Somos una agencia agéntica para CUALQUIER cliente: el criterio correcto NO es a quién le vende, es si el sitio del cliente TIENE DATOS.
// Acá no se puede saber si los tiene (eso lo mira el brazo y contesta «trajo» o «se miró y no hay»): se pide siempre que haya un DOMINIO
// PROPIO. Si no lo hay (o el campo del sitio trae una red social), NO sale y se descarta diciendo QUÉ falta (lo dice \`parametrosDe\`).
// Medido 30-sep: naufrago.ec tiene 488 visitas en 90 días que este nodo nunca pidió porque «no le vende a empresas».
pedir('posthog', 'analitica_propia');

// ── UN CONDICIONAL · \`competidores_precio\` sigue siendo sólo de quien le vende a empresas (no se toca) ──────────────
if (sin_rubro) {
  // «no se pudo saber» NO es «no correspondía». Se dice cuál de los dos fue.
  descartar('competidores_precio', 'la ficha del cliente no dice a qué se dedica · no se pudo decidir');
} else if (a_empresas) {
  pedir('apify', 'competidores_precio');
} else {
  descartar('competidores_precio', 'el rubro no lo requiere · lo pidió sólo quien le vende a empresas');
}`
export const EJE_VIEJO = '// eje 1 · ¿le vende a EMPRESAS? · es el que enciende los dos condicionales'
export const EJE_NUEVO = '// eje 1 · ¿le vende a EMPRESAS? · enciende SÓLO `competidores_precio` (la analítica propia ya no depende de esto · 30-sep)'

// ② ¿Llegó la vuelta?
export const VUELTA_VIEJO = `const texto = String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '');

// la vuelta trae cuerpo con texto · la espera agotada llega vacía o sin él
const llego = texto.trim().length > 0;
`
export const VUELTA_NUEVO = `const textoDelRedactor = String(cuerpo.response || cuerpo.result || cuerpo.output || cuerpo.text || '');

// la vuelta trae cuerpo con texto · la espera agotada llega vacía o sin él
const llego = textoDelRedactor.trim().length > 0;

// 🔴 LO QUE NO SE BUSCÓ SE DECLARA DENTRO DEL PLAN, CON SU MOTIVO (2026-09-30 · decisión de Emilio · misma familia del parte que no miente).
// Antes el pedido al redactor decía «no lo reportes como una falta» y la lista de descartados se quedaba en el razonamiento del flujo: el plan
// no dejaba marca de qué se dejó de mirar ni por qué. Ahora lo escribe EL SISTEMA (no depende de que el redactor lo recuerde), al final del texto,
// que es el que se guarda, se sube a Drive y lee el brief. Si la lista no se puede leer, se DICE que no se sabe qué se dejó de buscar.
let descartados = null;
try { descartados = $('elegir brazos').first().json.descartados; } catch (x) { descartados = null; }
const bloqueDescartados = (() => {
  const t = '## Lo que NO se buscó y por qué (lo declara el sistema, no el redactor)';
  if (!Array.isArray(descartados)) {
    return t + '\\n- ⚠️ No se pudo leer la lista de lo que se dejó de buscar: NO se sabe qué brazos quedaron fuera ni por qué. Ninguna ausencia de este plan debe leerse como «no correspondía».';
  }
  if (!descartados.length) return t + '\\n- (nada: se pidieron todos los brazos del catálogo elegible para este cliente)';
  return t + '\\n' + descartados.map((d) => '- ' + String((d && d.objetivo) || '(sin nombre)') + ' — ' + String((d && d.motivo) || '(sin motivo declarado)')).join('\\n');
})();
const texto = llego ? textoDelRedactor.replace(/\\s+$/, '') + '\\n\\n' + bloqueDescartados + '\\n' : textoDelRedactor;
`
export const VUELTA_SALIDA_VIEJO = `  caracteres: texto.length,
  client_id: cid,`
export const VUELTA_SALIDA_NUEVO = `  caracteres: texto.length,
  descartados_declarados: llego && Array.isArray(descartados) ? descartados.length : null,
  client_id: cid,`

// ③ Redactor (B4)
export const REDACTOR_VIEJO = "'   NO lo reportes como una falta:',"
export const REDACTOR_NUEVO = "'   NO lo reportes como una falta. El sistema lo lista al final del plan, con su motivo, en «Lo que NO se busco y por que»: no lo repitas alli. Pero si una decision tuya depende de algo de esta lista, dilo en el plan:',"

export function construir(flujo) {
  const nodo = (n) => { const x = flujo.nodes.find((k) => k.name === n); if (!x) throw new Error(`no encontré «${n}»`); return x }
  // el código vivo trae saltos CRLF: se parcha sobre texto normalizado y se devuelve con los MISMOS saltos que tenía (lo que no se toca queda byte a byte)
  const parche = (n, fn) => {
    const x = nodo(n)
    const original = String(x.parameters.jsCode)
    const CRLF = '\r\n'
    const crlf = original.includes(CRLF)
    const parchado = fn(original.split(CRLF).join('\n'))
    return { ...x, parameters: { ...x.parameters, jsCode: crlf ? parchado.split('\n').join(CRLF) : parchado } }
  }
  const e = parche(ELEGIR, (c) => {
    if (c.includes('LA ANALÍTICA PROPIA ES NÚCLEO')) throw new Error('ya está construido')
    return reemplazar(reemplazar(c, ELEGIR_VIEJO, ELEGIR_NUEVO, 1, ELEGIR), EJE_VIEJO, EJE_NUEVO, 1, ELEGIR)
  })
  const v = parche(VUELTA, (c) => reemplazar(reemplazar(c, VUELTA_VIEJO, VUELTA_NUEVO, 1, VUELTA), VUELTA_SALIDA_VIEJO, VUELTA_SALIDA_NUEVO, 1, VUELTA))
  const r = parche(REDACTOR, (c) => reemplazar(c, REDACTOR_VIEJO, REDACTOR_NUEVO, 1, REDACTOR))
  const nuevos = { [ELEGIR]: e, [VUELTA]: v, [REDACTOR]: r }
  const settings = {}
  for (const k of SETTINGS_OK) if (flujo.settings?.[k] !== undefined) settings[k] = flujo.settings[k]
  return { name: flujo.name, nodes: flujo.nodes.map((x) => nuevos[x.name] || x), connections: flujo.connections, settings }
}

if (process.argv[1] && process.argv[1].endsWith('construir-analitica-propia-2026-09-30.mjs')) {
  const vivo = JSON.parse(readFileSync(join(aqui, 'planeacion-antes-analitica-2026-09-30.json'), 'utf8'))
  const construido = construir(vivo)
  writeFileSync(join(aqui, 'planeacion-construida-analitica-2026-09-30.json'), JSON.stringify(construido, null, 2) + '\n')
  console.log('construida ·', construido.nodes.length, 'nodos · 3 parches (elegir brazos · ¿Llegó la vuelta? · Redactor (B4))')
}
