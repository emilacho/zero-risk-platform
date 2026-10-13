// LA MATRIZ DEL SECO (diseño v4 §13.3) · CC#2 · J5 · puro: arma la lista de escenarios y lo que se espera de cada uno. No hace red.
// Una «celda» = un cliente de práctica × un registro (tuteo | voseo) × un tipo × un caso (las ramas que fuerza `payload.simulacion`).
// Lo que se espera sale del diseño (reglas 1–11, §5.1, §13.3): resultado, marcas, pasos que DEBEN y que NO deben aparecer, rango de saltos de agente. Lo que el diseño no fija con claridad se deja SIN `resultado`
// (se observa y se reporta; no se inventa una expectativa).
import { CLIENTES, artefactoDe, contextoDe, imagenesDe, pedidoDelPlanDe } from './fixtures.mjs'

export const TIPOS = ['pieza', 'brief', 'calendario', 'estrategia', 'plan']
export const REGISTROS = ['tuteo', 'voseo']
export const FAMILIAS = ['post_img', 'carrusel', 'kit_historias']

/** cierres que no son «limpios»: se espera el resultado y NO se afirma nada de las marcas (una revisión fallida o cortada por tope puede traer también con_desacuerdo) */
const S = (resultado) => ({ resultado })
const R = (resultado, marcas = {}) => ({ resultado, marcas: { con_desacuerdo: false, sin_segunda_mirada: false, ...marcas } })

/** casos por tipo: nombre, simulacion, y lo que se espera. `con`/`sin` son prefijos de `paso`; `saltos` = [min, max] turnos de agente (los que pasan por n8n) */
const CASOS = {
  pieza: [
    { caso: 'sin-fichas-gpt-vacio', sim: { fichas: 'ninguna', gpt: 'vacio' }, ...R('limpia'), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'sin-fichas-gpt-sin-hallazgos', sim: { fichas: 'ninguna', gpt: 'sin_hallazgos' }, ...R('limpia'), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'sin-fichas-gpt-ok-toma-todo', sim: { fichas: 'ninguna', gpt: 'ok', toma: 'todo' }, ...R('limpia'), con: ['decision'], sin: ['correccion'], saltos: [2, 3] },
    { caso: 'sin-fichas-gpt-ok-toma-nada', sim: { fichas: 'ninguna', gpt: 'ok', toma: 'nada' }, ...R('limpia'), con: ['decision'], sin: ['correccion'], saltos: [2, 3] },
    { caso: 'sin-fichas-gpt-falla-red', sim: { fichas: 'ninguna', gpt: 'falla_red' }, ...R('sin_segunda_mirada', { sin_segunda_mirada: true }), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'sin-fichas-gpt-falla-401', sim: { fichas: 'ninguna', gpt: 'falla_401' }, ...R('sin_segunda_mirada', { sin_segunda_mirada: true }), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'sugerencia-gpt-ok', sim: { fichas: 'sugerencia', gpt: 'ok', toma: 'todo' }, ...R('limpia'), con: ['decision'], sin: ['correccion'], saltos: [2, 3] },
    { caso: 'bloquea-toma-todo-gpt-ok', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo' }, ...R('limpia'), con: ['correccion', 'decision'], saltos: [3, 5] },
    { caso: 'bloquea-toma-nada-gpt-ok', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'nada' }, ...R('con_desacuerdo', { con_desacuerdo: true }), con: ['correccion'], saltos: [2, 5] },
    { caso: 'bloquea-toma-todo-gpt-vacio', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo' }, ...R('limpia'), con: ['correccion'], sin: ['decision'], saltos: [2, 3] },
    { caso: 'bloquea-gpt-falla-red', sim: { fichas: 'bloquea', gpt: 'falla_red', toma: 'todo' }, marcas: { sin_segunda_mirada: true }, con: ['correccion'], sin: ['decision'], saltos: [2, 3] },
    { caso: 'bloquea-formato-roto-una-vez', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'formato_roto' }, ...R('limpia'), con: ['correccion'], saltos: [3, 4] },
    { caso: 'bloquea-formato-roto-siempre', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'formato_roto_siempre' }, ...S('fallida'), saltos: [3, 4] },
    { caso: 'bloquea-productor-muerto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'muerto' }, ...S('fallida'), muerto: true },
    { caso: 'tope-exceso', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo', tope: 'exceso' }, ...S('incompleta_por_tope'), tope: true },
  ],
  brief: [
    { caso: 'sin-fichas', sim: { fichas: 'ninguna', gpt: 'vacio' }, ...R('limpia'), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'sin-fichas-gpt-ok', sim: { fichas: 'ninguna', gpt: 'ok' }, sin: ['correccion', 'decision'], saltos: [1, 1] },
    // brief «solo marca» (F17): su ficha que bloquea no tiene camino de corrección ⇒ `con_desacuerdo` (así lo dice `cierre.ts`) y NO hay correccion ni decision
    { caso: 'bloquea-solo-marca', sim: { fichas: 'bloquea', gpt: 'ok' }, ...R('con_desacuerdo', { con_desacuerdo: true }), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'gpt-falla-red', sim: { fichas: 'ninguna', gpt: 'falla_red' }, ...R('sin_segunda_mirada', { sin_segunda_mirada: true }), sin: ['correccion', 'decision'], saltos: [1, 1] },
  ],
  calendario: [
    { caso: 'sin-fichas', sim: { fichas: 'ninguna', gpt: 'vacio' }, ...R('limpia'), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'bloquea-ok', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'ok' }, ...R('limpia'), con: ['correccion'], saltos: [2, 3] },
    { caso: 'bloquea-formato-roto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'formato_roto' }, ...R('limpia'), con: ['correccion'], saltos: [3, 4] },
    { caso: 'bloquea-muerto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'muerto' }, ...S('fallida'), muerto: true },
    { caso: 'bloquea-gpt-ok-toma-todo', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo' }, ...R('limpia'), con: ['correccion', 'decision'], saltos: [3, 5] },
  ],
  estrategia: [
    { caso: 'sin-fichas', sim: { fichas: 'ninguna', gpt: 'vacio' }, ...R('limpia'), sin: ['correccion', 'decision'], saltos: [1, 1] },
    { caso: 'bloquea-ok', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'ok' }, ...R('limpia'), con: ['correccion'], saltos: [2, 3] },
    { caso: 'bloquea-formato-roto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'formato_roto' }, ...R('limpia'), con: ['correccion'], saltos: [3, 4] },
    { caso: 'bloquea-muerto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'muerto' }, ...S('fallida'), muerto: true },
    { caso: 'bloquea-gpt-ok-toma-todo', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo' }, ...R('limpia'), con: ['correccion', 'decision'], saltos: [3, 5] },
  ],
  // el camino A→B→C (§5.1): `adopta` = la versión que debe quedar vigente tras `elegir_version` con la prueba de código del seco (marcas «A calcular» + largo)
  plan: [
    { caso: 'A-sin-fichas-gpt-sin-hallazgos', sim: { fichas: 'ninguna', gpt: 'sin_hallazgos' }, ...R('limpia'), sin: ['correccion', 'decision'], saltos: [1, 1], adopta: 'A' },
    { caso: 'A-sin-fichas-gpt-ok-toma-nada', sim: { fichas: 'ninguna', gpt: 'ok', toma: 'nada' }, ...R('limpia'), con: ['decision'], sin: ['correccion'], saltos: [2, 2], adopta: 'A' },
    // DIVERGENCIA observada (se reporta a CC#1/CC#3): el diseño §13.3(3) dice «A→C si no hubo B»; la ruta nombra por orden de producción, así que la versión de la decisión sin corrección previa sale como B (versión 2, hija de A). Las invariantes se cumplen (A intacta, una hija por padre, ≤ 3)
    { caso: 'sin-fichas-gpt-ok-toma-algo', sim: { fichas: 'ninguna', gpt: 'ok', toma: 'todo', version_nueva: 'mejora' }, ...R('limpia'), con: ['decision'], sin: ['correccion'], saltos: [2, 2], versiones: ['A', 'B'], adopta: 'B', divergencia: 'diseño §13.3(3): A→C si no hubo B; la ruta la nombra B' },
    { caso: 'B-bloquea-gpt-ok-toma-nada', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'nada', version_nueva: 'mejora' }, con: ['correccion'], saltos: [2, 3] },
    { caso: 'BC-bloquea-gpt-ok-toma-todo-mejora', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo', version_nueva: 'mejora' }, ...R('limpia'), con: ['correccion', 'decision'], saltos: [3, 3], versiones: ['A', 'B', 'C'], adopta: 'C' },
    // `eval` fija las marcas de código de cada versión en la elección (la simulación de la ruta aplica `version_nueva` igual a B y a C: estos dos casos de CC#3 se fuerzan en la medición, que es lo que hace la planeación)
    { caso: 'B-mejora-C-empeora', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo', version_nueva: 'mejora' }, eval: { A: 2, B: 0, C: 3 }, versiones: ['A', 'B', 'C'], adopta: 'B', con_desacuerdo_si_no_adopta_la_ultima: true },
    { caso: 'C-pasa-contra-A-pero-peor-que-B', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo', version_nueva: 'mejora' }, eval: { A: 2, B: 0, C: 1 }, versiones: ['A', 'B', 'C'], adopta: 'B', con_desacuerdo_si_no_adopta_la_ultima: true },
    { caso: 'B-empeora-C-mejora-respecto-de-A', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo', version_nueva: 'mejora' }, eval: { A: 2, B: 3, C: 1 }, versiones: ['A', 'B', 'C'], adopta: 'C' },
    { caso: 'B-empeora', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', version_nueva: 'empeora' }, versiones: ['A', 'B'], adopta: 'A', con_desacuerdo_si_no_adopta_la_ultima: true },
    { caso: 'B-demasiado-corta', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', version_nueva: 'demasiado_corta' }, versiones: ['A', 'B'], adopta: 'A', con_desacuerdo_si_no_adopta_la_ultima: true },
    { caso: 'bloquea-gpt-falla-red', sim: { fichas: 'bloquea', gpt: 'falla_red', toma: 'todo', version_nueva: 'mejora' }, marcas: { sin_segunda_mirada: true }, con: ['correccion'], sin: ['decision'], versiones: ['A', 'B'], adopta: 'B' },
    { caso: 'bloquea-formato-roto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', version_nueva: 'mejora', productor: 'formato_roto' }, con: ['correccion'], saltos: [3, 4], versiones: ['A', 'B'], adopta: 'B' },
    { caso: 'bloquea-productor-muerto', sim: { fichas: 'bloquea', gpt: 'vacio', toma: 'todo', productor: 'muerto' }, ...S('fallida'), muerto: true },
    { caso: 'tope-exceso', sim: { fichas: 'bloquea', gpt: 'ok', toma: 'todo', tope: 'exceso' }, ...S('incompleta_por_tope'), tope: true },
  ],
}

/** casos de la PUERTA (aislamiento): lo que la ruta debe negarse a abrir. `corre` arma el sobre a partir del sobre base */
export const CASOS_DE_PUERTA = [
  { caso: 'dry_run-ausente', status: 400, cambia: (s) => { delete s.payload.dry_run; return s } },
  { caso: 'dry_run-no-booleano', status: 400, cambia: (s) => { s.payload.dry_run = 'true'; return s } },
  { caso: 'necesita-humano-no-abre', status: 409, error: 'chequeos_detienen', cambia: (s) => { s.payload.chequeos_previos = { pasaron: false, necesita_humano: true, marcas: ['P1'] }; return s } },
  { caso: 'sin-otra-vuelta-G3', status: 409, error: 'sin_otra_vuelta', cambia: (s) => { s.payload.generado_por_jefatura = '00000000-0000-4000-8000-0000000000aa'; return s } },
  { caso: 'cliente-fuera-del-ensayo', status: 409, error: 'jefatura_no_abre', cambia: (s) => { s.client_id = 'prueba-jefatura-seco-fuera-del-ensayo'; return s } },
  { caso: 'simulacion-con-dry_run-falso', status: 400, cambia: (s) => { s.payload.dry_run = false; s.payload.simulacion = { fichas: 'bloquea' }; return s } },
  { caso: 'tipo-inexistente', status: 400, cambia: (s) => { s.artifact_type = 'otro'; return s } },
]

/** el sobre de una celda (el sobre único de entrada de la jefatura) */
export function sobreDe({ cliente, registro, tipo, familia = 'post_img', caso, sim, corrida = 'c0', devolver_a }) {
  const c = typeof cliente === 'string' ? CLIENTES.find((x) => x.id === cliente) : cliente
  const base = {
    artifact_type: tipo,
    artifact_id: `${tipo}-${c.slug}-${registro}-${familia}-${caso}-${corrida}`,
    client_id: c.id,
    journey_id: `journey-seco-${corrida}`,
    payload: {
      texto: artefactoDe(c, tipo, { familia, registro }),
      contexto: contextoDe(c, tipo, registro),
      dry_run: true,
      devolver_a: devolver_a ?? { tipo: 'ninguno', destino: '' },
      chequeos_previos: { pasaron: true, necesita_humano: false, marcas: [] },
      ...(tipo === 'pieza' ? { familia, imagenes: imagenesDe(c, familia) } : {}),
      ...(tipo === 'plan' ? { pedido_del_plan: pedidoDelPlanDe(c) } : {}),
      ...(sim ? { simulacion: limpiarSim(sim, tipo, artefactoDe(c, tipo, { familia, registro }).length) } : {}),
    },
  }
  return base
}

/** `simulacion` que entiende la ruta (el plan además lleva el largo de A para que el molde fabrique B y C) */
function limpiarSim(sim, tipo, largo) {
  return { ...sim, ...(tipo === 'plan' ? { largo_a: largo } : {}) }
}

/**
 * todas las celdas: cliente × registro × tipo × caso (la pieza además × familia en el caso central)
 * @param {{ tipos?: string[], clientes?: string[], registros?: string[], casos?: string[] | null, corrida?: string }} [o]
 * @returns {any[]}
 */
export function celdas({ tipos = TIPOS, clientes = CLIENTES.map((c) => c.id), registros = REGISTROS, casos = null, corrida = 'c0' } = {}) {
  const out = []
  for (const cid of clientes) {
    const cliente = CLIENTES.find((c) => c.id === cid)
    for (const registro of registros) {
      for (const tipo of tipos) {
        for (const k of CASOS[tipo]) {
          if (casos && !casos.includes(k.caso)) continue
          const familias = tipo === 'pieza' && k.caso === 'bloquea-toma-todo-gpt-ok' ? FAMILIAS : ['post_img']
          for (const familia of familias) {
            out.push({ id: `${cliente.slug}/${registro}/${tipo}${tipo === 'pieza' ? '-' + familia : ''}/${k.caso}`, cliente: cliente.id, rubro: cliente.rubro, registro, tipo, familia, ...k, sobre: sobreDe({ cliente, registro, tipo, familia, caso: k.caso, sim: k.sim, corrida }) })
          }
        }
      }
    }
  }
  return out
}

export const resumenDeLaMatriz = (cs = celdas()) => {
  const por = {}
  for (const c of cs) por[c.tipo] = (por[c.tipo] ?? 0) + 1
  return { total: cs.length, por_tipo: por, casos_por_tipo: Object.fromEntries(TIPOS.map((t) => [t, CASOS[t].length])), puerta: CASOS_DE_PUERTA.length }
}

export { CASOS }
