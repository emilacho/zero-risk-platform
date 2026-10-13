// EL CONDUCTOR DEL SECO (J5) · CC#2 · 13-oct · lógica pura con el transporte INYECTADO: lo mismo corre contra las rutas reales (fetch) y contra los manejadores locales en las pruebas del kit.
// Tres recorridos:
//   · `correrPorRuta` — este conductor HACE DE n8n: abre la revisión, y a cada turno responde con `pedido.molde` (el molde de la ruta, fuente única) hasta el cierre. Mide tamaños de pedido y comprueba cada rama. Nunca llama a un agente ni a GPT.
//   · `correrPorN8n` — abre la revisión y despierta el flujo REAL `jefatura · turno` (webhook con la llave); espera el cierre por `leer` y mide saltos y minutos de verdad.
//   · `puerta` — lo que la ruta se niega a abrir (aislamiento).
// T (transporte) = { llamar(ruta, cuerpo) → { status, body }, webhook?(cuerpo) → { status }, envejecer?(revision_id) → void, ahora?() → ms, dormir?(ms) }.
// US$ 0: todo es `dry_run: true`. Nada de lo que imprime lleva una llave.

export const CABECERA_DEL_EDITOR = 'x-skip-editor-middleware'
const CLAVES_DE_EXTRA = ['indicacion_jefatura', 'paso_de_la_jefatura', 'revision_id', 'dispatch_key']
const TERMINALES = ['cerrada', 'cerrada_por_tope', 'fallida']
const TOKEN = (chars) => Math.ceil(chars / 3.5)

/** precios por millón de tokens (entrada/salida) con los que se recalcula el costo por tipo; los de GPT son los de producción (13-oct), los de los agentes son los del diseño §7 */
export const PRECIOS = {
  sonnet: [3, 15],
  opus: [5, 25],
  gpt: [2, 10],
}
/** salida típica por paso (tokens), medida en §7 del diseño; la del plan reescrito es el plan entero */
const SALIDA_DE = { revision_fondo: 1060, correccion: 700, decision: 500, segunda_mirada: 800 }
/** lo que cada llamada a un agente lee ADEMÁS de la tarea (identidad del agente + trozos del cerebro que `run-sdk` inyecta + herramientas). Calibrado con la mediana medida de `jefe-marketing` (US$ 0,063 con ≈ 1.060 tokens de salida a 3/15 por millón ⇒ ≈ 15,7 k tokens de entrada, de los cuales la tarea de una pieza es ≈ 8–10 k): ≈ 6 k. Se puede cambiar con --sobrecarga */
export const SOBRECARGA_DE_AGENTE_TOKENS = 6000
const MODELO_DE = (agente) => (/social-media-strategist/.test(agente ?? '') ? 'opus' : 'sonnet')

export function auditarPedido(p) {
  const e = []
  if (!p || typeof p !== 'object') return ['el pedido no es un objeto']
  if (p.dry_run !== true) e.push('el pedido del seco debe llevar dry_run: true')
  if (p.force_restart !== true) e.push('falta force_restart: true')
  if (!(typeof p.max_budget_usd === 'number' && p.max_budget_usd > 0)) e.push('falta max_budget_usd > 0')
  if (typeof p.esquema !== 'string' || !p.esquema) e.push('falta el esquema')
  if (!p.headers_requeridos || p.headers_requeridos[CABECERA_DEL_EDITOR] !== '1') e.push(`falta la cabecera ${CABECERA_DEL_EDITOR}: 1`)
  for (const k of Object.keys(p.extra ?? {})) if (!CLAVES_DE_EXTRA.includes(k)) e.push(`extra.${k} no está permitido`)
  if (p.extra && 'workflow_execution_id' in p.extra) e.push('extra.workflow_execution_id resucitaría a los 3 revisores de julio')
  if (!p.molde || (p.molde.texto === undefined && !p.molde.error)) e.push('el pedido del seco no trae molde de la ruta')
  return e
}

const VOSEO = /\b(vos|tenés|querés|podés|sabés|decime|contame|escribinos|contanos|mirá|revisá|necesitás|descubrí|pedí)\b/i
const TUTEO = /\b(tú|tienes|quieres|puedes|sabes|cuéntanos|escríbenos|mira|revisa|necesitas|descubre)\b/i
const BARRIDO = (texto) => ({ voseo: VOSEO.test(texto), tuteo: TUTEO.test(texto) })

/** lo que mide la elección de versión del plan en el seco: las marcas «A calcular/TBD/por definir» y el largo (la planeación real usa `revisarPlan`; este es su sustituto del seco, declarado) */
export const marcasDeCodigo = (texto) => (String(texto).match(/A calcular|\bTBD\b|por definir|\[\s*\]|—\s*—/gi) ?? []).length

function medirPedidos(turnos) {
  return turnos.map((t) => ({ paso: t.paso, agente: t.agente, esquema: t.pedido?.esquema, chars: String(t.pedido?.task ?? '').length, tokens: TOKEN(String(t.pedido?.task ?? '').length) }))
}

/** costo estimado de una revisión con los tamaños MEDIDOS (entrada = chars/3,5) y los precios de PRECIOS; la salida es la típica del paso (§7) o, en el plan reescrito, el plan entero */
export function costoEstimado({ pedidos, gpt_chars, gpt_llamado, texto_largo, reescriben = null }) {
  let total = 0
  const detalle = []
  for (const p of pedidos) {
    const [pi, po] = PRECIOS[MODELO_DE(p.agente)]
    const base = String(p.paso).split(':')[0]
    const reescribe = !!texto_largo && (reescriben ? reescriben.has(p.paso) : true) // el plan: solo el paso que PRODUJO una versión escribe el plan entero
    const salida = reescribe ? TOKEN(texto_largo.length) : (SALIDA_DE[base] ?? 600)
    const usd = ((p.tokens + SOBRECARGA_DE_AGENTE_TOKENS) * pi + salida * po) / 1e6
    detalle.push({ paso: p.paso, usd: +usd.toFixed(4) })
    total += usd
  }
  if (gpt_llamado) {
    const usd = (TOKEN(gpt_chars) * PRECIOS.gpt[0] + SALIDA_DE.segunda_mirada * PRECIOS.gpt[1]) / 1e6
    detalle.push({ paso: 'segunda_mirada (GPT)', usd: +usd.toFixed(4) })
    total += usd
  }
  return { total: +total.toFixed(4), detalle }
}

const pasosDe = (turnos) => turnos.map((t) => t.paso)
const tiene = (pasos, pref) => pasos.some((p) => p === pref || p.startsWith(pref + ':'))

/** compara lo observado con lo esperado de la celda; devuelve la lista de fallos (vacía = pasó) */
export function comprobar(esc, obs) {
  const f = []
  if (esc.resultado && obs.resultado !== esc.resultado) f.push(`resultado: se esperaba «${esc.resultado}» y salió «${obs.resultado}»`)
  for (const [k, v] of Object.entries(esc.marcas ?? {})) if ((obs.marcas?.[k] ?? false) !== v) f.push(`marca ${k}: se esperaba ${v} y salió ${obs.marcas?.[k] ?? false}`)
  for (const p of esc.con ?? []) if (!tiene(obs.pasos, p)) f.push(`debía aparecer el paso «${p}» y no apareció (${obs.pasos.join(' → ')})`)
  for (const p of esc.sin ?? []) if (tiene(obs.pasos, p)) f.push(`NO debía aparecer el paso «${p}» y apareció (${obs.pasos.join(' → ')})`)
  if (esc.saltos && !(obs.saltos >= esc.saltos[0] && obs.saltos <= esc.saltos[1])) f.push(`saltos de agente: se esperaban ${esc.saltos[0]}–${esc.saltos[1]} y fueron ${obs.saltos}`)
  for (const e of obs.errores_de_pedido ?? []) f.push(`pedido: ${e}`)
  if (obs.voseo_en_instruccion) f.push('la instrucción interna de la jefatura salió con voseo (debe ir SIEMPRE en tuteo)')
  if (esc.registro === 'tuteo' && obs.voseo_en_pieza) f.push('una pieza de un cliente en TUTEO trae voseo')
  if (esc.registro === 'voseo' && obs.tuteo_en_pieza) f.push('una pieza de un cliente en VOSEO trae tuteo')
  if (esc.versiones) for (const e of esc.versiones) if (!obs.versiones?.includes(e)) f.push(`debía producirse la versión ${e} (salieron ${obs.versiones?.join(', ') || 'ninguna'})`)
  if (esc.adopta && obs.plan?.adoptada !== esc.adopta) f.push(`plan: se esperaba adoptar ${esc.adopta} y se adoptó ${obs.plan?.adoptada}`)
  if (esc.adopta && obs.plan) {
    const g = obs.plan.plan_de_guardado
    if (esc.adopta === 'A' && g.guardar.length) f.push('plan: adoptando A no se guarda nada y la ruta mandó guardar ' + g.guardar.map((x) => x.etiqueta).join(','))
    if (esc.adopta !== 'A') {
      // lo que se guarda = las versiones aceptadas hasta la adoptada, B antes que C (cada una cuelga de la anterior aceptada)
      const orden = g.guardar.map((x) => x.etiqueta).join('')
      const aceptadas = (obs.plan.razones ?? []).filter((r) => r.pasa).map((r) => r.etiqueta)
      const esperado = aceptadas.slice(0, aceptadas.indexOf(esc.adopta) + 1).join('')
      if (orden !== esperado) f.push(`plan: se guarda «${orden}» y debía guardarse «${esperado}» (B antes que C, hasta la adoptada)`)
      if (g.vigente !== esc.adopta) f.push(`plan: vigente «${g.vigente}» ≠ adoptada «${esc.adopta}»`)
    }
    if (obs.plan.repetida_sin_duplicar === false) f.push('plan: repetir la elección con la hija ya guardada creó otra fila (G4/G7)')
    if (esc.con_desacuerdo_si_no_adopta_la_ultima && !obs.plan.adopto_la_ultima && obs.plan.resultado_final !== 'con_desacuerdo') f.push(`plan: no se adoptó la última versión y el resultado final fue «${obs.plan.resultado_final}» (debía ser con_desacuerdo)`)
  }
  return f
}

async function dormir(T, ms) { if (T.dormir) await T.dormir(ms) }

/**
 * aplica `siguiente` hasta que el estado sea esperar/cerrado (el conductor hace de n8n)
 * @returns {Promise<any>}
 */
export async function correrPorRuta(esc, T, o = {}) {
  const t0 = (T.ahora ?? Date.now)()
  const turnos = [], errores_de_pedido = [], notas = []
  const abre = await T.llamar('revisiones', esc.sobre)
  if (abre.status !== 200) return { id: esc.id, fallos: [`la puerta contestó ${abre.status} ${abre.body?.error ?? ''}: ${abre.body?.detalle ?? JSON.stringify(abre.body).slice(0, 160)}`], observado: { abre: abre.status } }
  let rsp = abre.body
  const revision_id = rsp.revision_id
  let muertes = 0
  const gpt = { llamado: false }
  for (let i = 0; i < 60 && rsp.accion === 'esperar'; i++) {
    const t = rsp.turno
    if (!t?.pedido) { errores_de_pedido.push('esperar sin pedido'); break }
    turnos.push({ n: t.n, paso: t.paso, agente: t.agente, pedido: t.pedido })
    for (const e of auditarPedido(t.pedido)) errores_de_pedido.push(`${t.paso}: ${e}`)
    const molde = t.pedido.molde ?? { texto: null, error: 'sin molde' }
    if (molde.texto === null || molde.texto === undefined) {
      // el productor «murió»: no se responde. Pasan 20 min (se envejece el paso) y el vigía lo da por muerto
      if (esc.sim?.productor === 'muerto' && T.envejecer) {
        muertes++
        await T.envejecer(revision_id)
        const v = await T.llamar('vigia', {})
        notas.push(`vigía #${muertes}: ${JSON.stringify({ accion: v.body.accion, reanudar: v.body.reanudar?.length, cierres: v.body.cierres?.length })}`)
        if (v.body.cierres?.some((c) => c.revision_id === revision_id)) {
          const l = await T.llamar('revisiones', { accion: 'leer', revision_id })
          rsp = { accion: 'cerrado', ...l.body, resultado: l.body.resultado, marcas: l.body.marcas, salida: l.body.salida }
          break
        }
        if (v.body.reanudar?.includes(revision_id)) { rsp = (await T.llamar('turnos', { accion: 'siguiente', revision_id })).body; continue }
        errores_de_pedido.push('el vigía no reanudó ni cerró el paso muerto'); break
      }
      rsp = (await T.llamar('turnos', { accion: 'resultado', revision_id, n: t.n, error: molde.error ?? 'sin molde', costo_usd: 0 })).body
      continue
    }
    rsp = (await T.llamar('turnos', { accion: 'resultado', revision_id, n: t.n, texto: molde.texto, costo_usd: 0 })).body
  }
  if (rsp.accion !== 'cerrado') return { id: esc.id, fallos: [`la revisión no cerró (accion=${rsp.accion}) ${rsp.error ?? ''} ${rsp.detalle ?? ''}`], observado: { pasos: pasosDe(turnos), errores_de_pedido } }
  const salida = rsp.salida ?? {}
  gpt.llamado = !!salida.opinion_externa || (rsp.resultado !== 'fallida' && !esc.muerto && !esc.tope)
  const pedidos = medirPedidos(turnos)
  const textoVigente = String(esc.sobre.payload.texto)
  const contexto = (esc.sobre.payload.contexto ?? []).reduce((a, d) => a + String(d.texto).length, 0)
  const gpt_chars = textoVigente.length + contexto + 400
  // registro: la instrucción interna (las tareas de los pedidos) en tuteo; las piezas, en el registro de su manual
  const instr = turnos.map((t) => String(t.pedido.indicacion ?? t.pedido.extra?.indicacion_jefatura ?? '')).join('\n')
  const piezas = String(esc.sobre.payload.texto)
  const obs = {
    resultado: rsp.resultado, marcas: rsp.marcas, pasos: pasosDe(turnos), saltos: turnos.length, errores_de_pedido, notas,
    versiones: Array.isArray(salida.versiones) ? salida.versiones.map((v) => v.etiqueta) : [],
    pedidos, gpt_chars,
    voseo_en_instruccion: BARRIDO(instr).voseo,
    voseo_en_pieza: esc.tipo === 'pieza' ? BARRIDO(piezas).voseo : false,
    tuteo_en_pieza: esc.tipo === 'pieza' ? BARRIDO(piezas).tuteo : false,
    simulado: rsp.simulado === true,
    minutos: ((T.ahora ?? Date.now)() - t0) / 60000,
  }
  if (esc.adopta && Array.isArray(salida.versiones) && salida.versiones.length) obs.plan = await elegirVersionDelSeco(esc, T, revision_id, salida)
  const est = costoEstimado({ pedidos, gpt_chars, gpt_llamado: gpt.llamado && !esc.muerto, texto_largo: esc.tipo === 'plan' ? textoVigente : undefined, reescriben: new Set((Array.isArray(salida.versiones) ? salida.versiones : []).filter((v) => v.etiqueta !== 'A').map((v) => v.paso)) })
  obs.costo_estimado_usd = est.total
  obs.costo_detalle = est.detalle
  const fallos = comprobar(esc, obs)
  return { id: esc.id, tipo: esc.tipo, caso: esc.caso, cliente: esc.cliente, rubro: esc.rubro, registro: esc.registro, familia: esc.familia, ok: fallos.length === 0, fallos, observado: obs }
}

async function elegirVersionDelSeco(esc, T, revision_id, salida) {
  const evaluaciones = salida.versiones.map((v) => ({ etiqueta: v.etiqueta, marcas: esc.eval?.[v.etiqueta] ?? marcasDeCodigo(v.texto), largo: v.largo }))
  const idDeA = 'plan-A-seco'
  const r1 = await T.llamar('revisiones', { accion: 'elegir_version', revision_id, evaluaciones, id_de_a: idDeA, existentes: [] })
  if (r1.status !== 200) return { error: `elegir_version contestó ${r1.status} ${r1.body?.error ?? ''} ${r1.body?.detalle ?? ''}`, adoptada: null, plan_de_guardado: { guardar: [], vigente: null }, evaluaciones }
  const g = r1.body.plan_de_guardado
  // G4/G7: repetir la elección con las hijas YA guardadas no debe pedir crear otra fila (se reutiliza)
  let repetida_sin_duplicar = true
  if (g.guardar.length) {
    const existentes = []
    let padre = idDeA
    for (const x of g.guardar) { const id = `hija-${x.etiqueta}-seco`; existentes.push({ id, version_de: padre }); padre = id }
    const r2 = await T.llamar('revisiones', { accion: 'elegir_version', revision_id, evaluaciones, id_de_a: idDeA, existentes })
    repetida_sin_duplicar = r2.status === 200 && r2.body.plan_de_guardado.guardar.every((x) => typeof x.reutilizar_id === 'string')
  }
  return { adoptada: r1.body.adoptada, ultima: r1.body.ultima, adopto_la_ultima: r1.body.adopto_la_ultima, plan_de_guardado: g, resultado_final: r1.body.resultado, razones: r1.body.razones, evaluaciones, repetida_sin_duplicar }
}

/**
 * la puerta: lo que la ruta debe negarse a abrir. `base` = el sobre sano de una celda
 * @returns {Promise<any>}
 */
export async function puerta(caso, base, T) {
  const sobre = caso.cambia(JSON.parse(JSON.stringify(base)))
  const r = await T.llamar('revisiones', sobre)
  const fallos = []
  if (r.status !== caso.status) fallos.push(`se esperaba ${caso.status} y salió ${r.status} (${r.body?.error ?? ''})`)
  if (caso.error && r.body?.error !== caso.error) fallos.push(`se esperaba el error «${caso.error}» y salió «${r.body?.error}»`)
  return { id: `puerta/${caso.caso}`, ok: fallos.length === 0, fallos, observado: { status: r.status, error: r.body?.error } }
}

/** con la jefatura APAGADA: no abre, no corre ningún turno y el vigía no hace nada (409 / 409 / apagada). Quien llama compara los contadores antes y después: no debe cambiar ni una fila */
export async function apagadaNoAbre(base, T) {
  const fallos = []
  const a = await T.llamar('revisiones', base)
  if (a.status !== 409 || a.body?.error !== 'jefatura_no_abre') fallos.push(`abrir: se esperaba 409 jefatura_no_abre y salió ${a.status} ${a.body?.error ?? ''}`)
  const t = await T.llamar('turnos', { accion: 'siguiente', revision_id: '00000000-0000-4000-8000-0000000000ff' })
  if (t.status !== 409) fallos.push(`turnos: se esperaba 409 y salió ${t.status}`)
  const v = await T.llamar('vigia', {})
  if (v.status !== 200 || v.body?.accion !== 'apagada') fallos.push(`vigía: se esperaba 200 apagada y salió ${v.status} ${v.body?.accion ?? ''}`)
  return { id: 'apagada-no-abre', ok: fallos.length === 0, fallos, observado: { abrir: a.status, turnos: t.status, vigia: v.body?.accion } }
}

/**
 * el recorrido por n8n de verdad: abre, despierta el flujo `jefatura · turno` y espera el cierre mirando `leer`
 * @returns {Promise<any>}
 */
export async function correrPorN8n(esc, T, o = {}) {
  const t0 = (T.ahora ?? Date.now)()
  const abre = await T.llamar('revisiones', esc.sobre)
  if (abre.status !== 200 || abre.body.accion !== 'esperar') return { id: esc.id, fallos: [`la puerta no dejó un turno: ${abre.status} ${JSON.stringify(abre.body).slice(0, 200)}`], observado: {} }
  const revision_id = abre.body.revision_id
  const w = await T.webhook({ revision_id, turno: abre.body.turno })
  if (!(w.status >= 200 && w.status < 300)) return { id: esc.id, fallos: [`el webhook del flujo contestó ${w.status}`], observado: { revision_id } }
  const limite = (o.limite_min ?? 20) * 60000
  let l
  for (;;) {
    await dormir(T, o.cada_ms ?? 5000)
    l = (await T.llamar('revisiones', { accion: 'leer', revision_id })).body
    if (TERMINALES.includes(l.estado)) break
    if ((T.ahora ?? Date.now)() - t0 > limite) return { id: esc.id, fallos: [`no cerró en ${o.limite_min ?? 20} min (estado ${l.estado})`], observado: { revision_id, estado: l.estado } }
  }
  const salida = l.salida ?? {}
  const pasos = salida.pasos
  const obs = { revision_id, resultado: l.resultado, marcas: l.marcas, saltos: typeof pasos === 'number' ? pasos : null, pasos: [], errores_de_pedido: [], minutos: ((T.ahora ?? Date.now)() - t0) / 60000, gasto_usd: l.gasto_usd, estado: l.estado, versiones: Array.isArray(salida.versiones) ? salida.versiones.map((v) => v.etiqueta) : [] }
  const fallos = []
  if (esc.resultado && obs.resultado !== esc.resultado) fallos.push(`resultado: se esperaba «${esc.resultado}» y salió «${obs.resultado}»`)
  for (const [k, v] of Object.entries(esc.marcas ?? {})) if ((obs.marcas?.[k] ?? false) !== v) fallos.push(`marca ${k}: se esperaba ${v}`)
  if (obs.gasto_usd && obs.gasto_usd > 0) fallos.push(`en seco el gasto debe ser 0 y fue ${obs.gasto_usd}`)
  return { id: esc.id, tipo: esc.tipo, cliente: esc.cliente, registro: esc.registro, ok: fallos.length === 0, fallos, observado: obs }
}

/** costo estimado medio por tipo y caso (las 6 celdas de cada caso): lo que reemplaza las cifras de §7 */
export const costoPorCaso = (resultados) => {
  const por = {}
  for (const r of resultados) { if (r.observado?.costo_estimado_usd == null) continue; (por[`${r.tipo}/${r.caso}`] ??= []).push(r.observado.costo_estimado_usd) }
  return Object.fromEntries(Object.entries(por).map(([k, v]) => [k, { celdas: v.length, medio_usd: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(3), min_usd: +Math.min(...v).toFixed(3), max_usd: +Math.max(...v).toFixed(3) }]))
}

export const resumirMedidas = (resultados) => {
  const por = {}
  for (const r of resultados) {
    if (!r.observado?.pedidos) continue
    const k = r.tipo + (r.familia && r.tipo === 'pieza' ? '-' + r.familia : '')
    const m = (por[k] ??= { n: 0, chars_max: 0, chars_sum: 0, costo_sum: 0, costo_min: Infinity, costo_max: 0, saltos_sum: 0, saltos_max: 0, gpt_chars_max: 0 })
    const chars = r.observado.pedidos.reduce((a, p) => a + p.chars, 0)
    m.n++; m.chars_sum += chars; m.chars_max = Math.max(m.chars_max, ...r.observado.pedidos.map((p) => p.chars), 0)
    m.costo_sum += r.observado.costo_estimado_usd; m.costo_min = Math.min(m.costo_min, r.observado.costo_estimado_usd); m.costo_max = Math.max(m.costo_max, r.observado.costo_estimado_usd)
    m.saltos_sum += r.observado.saltos; m.saltos_max = Math.max(m.saltos_max, r.observado.saltos); m.gpt_chars_max = Math.max(m.gpt_chars_max, r.observado.gpt_chars)
  }
  return Object.fromEntries(Object.entries(por).map(([k, m]) => [k, { corridas: m.n, saltos_prom: +(m.saltos_sum / m.n).toFixed(2), saltos_max: m.saltos_max, pedido_chars_prom_total: Math.round(m.chars_sum / m.n), pedido_chars_max_un_paso: m.chars_max, gpt_entrada_chars_max: m.gpt_chars_max, gpt_entrada_tokens_max: TOKEN(m.gpt_chars_max), costo_prom_usd: +(m.costo_sum / m.n).toFixed(3), costo_min_usd: +m.costo_min.toFixed(3), costo_max_usd: +m.costo_max.toFixed(3) }]))
}
