// PRUEBA REAL CHICA DE LA JEFATURA (J6) · núcleo puro · CC#1 · 14-oct · diseño v4 §13.4 (opción B).
// Sin red ni base: todo lo que toca el mundo entra por el transporte `T` (en la CLI es la API real; en las pruebas, uno de mentira). Así se prueba el CORTE DURO, la regla «solo con confirmación»
// y el «apagar SIEMPRE al final» sin gastar un centavo.
//
// Qué es: 2 revisiones REALES (`dry_run=false`) de una `pieza` post ya producida, en 2 rubros distintos, con clientes de práctica; la jefatura en `ensayo` SOLO para esos 2 clientes y SOLO el tipo `pieza`.
// Topes: US$ 0,50 por revisión (J6 ter/cuarto; con las reservas de la política `pieza` 0,10/0,10) (se manda como `payload.tope_restante_usd`: la ruta lo respeta y cierra por tope) y US$ 0,70 en total (lo que queda de presupuesto se calcula entre una revisión y la otra).
// Nada se publica al cliente, nada se produce, nada toca naufrago.ec. Los clientes de práctica son archivos: la jefatura guarda `client_id` como texto.
import { CLIENTES, contextoDe, piezaDe } from '../jefatura-seco/fixtures.mjs'

export const ID_PREFIJO = 'prueba-jefatura-real-'
export const TOPES = { revision: 0.5, total: 0.7, limite_min: 20, cada_ms: 5000, minimo_para_abrir: 0.1 }
/** estados terminales de una revisión (los de la ruta) */
export const TERMINALES = ['cerrada', 'cerrada_por_tope', 'fallida']
export const RESULTADOS_VALIDOS = ['limpia', 'con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope', 'fallida']

/** los 2 clientes de la prueba: dos rubros distintos (restaurante y servicios profesionales), con id propio para no mezclar nada con el seco */
export const CLIENTES_REALES = [CLIENTES[0], CLIENTES[1]].map((c) => ({ ...c, id: ID_PREFIJO + c.rubro.split(' ')[0] }))

/** el sobre de una revisión real: la pieza ya producida, sus documentos «contra qué» y el tope de ESTA revisión */
/** @param {any} cliente @param {{ corrida: string, tope_usd: number, imagen?: string | null }} o */
export function sobreReal(cliente, { corrida, tope_usd, imagen = null }) {
  const imagenes = imagen ? [imagen] : []
  return {
    artifact_type: 'pieza',
    artifact_id: `j6-${cliente.slug}-${corrida}`,
    client_id: cliente.id,
    journey_id: `journey-j6-${corrida}`,
    payload: {
      texto: piezaDe(cliente, 'post_img', cliente.registro),
      contexto: contextoDe(cliente, 'pieza', cliente.registro),
      dry_run: false,
      devolver_a: { tipo: 'ninguno', destino: '' },
      chequeos_previos: { pasaron: true, necesita_humano: false, marcas: [] },
      familia: 'post_img',
      ...(imagenes.length ? { imagenes } : {}),
      // sin imagen no hay a quién pedirle una corrección de imagen: solo el dueño del texto
      productores: imagenes.length ? [{ donde: 'texto', agente: 'content-creator' }, { donde: 'imagen', agente: 'marketing_instagram_curator' }] : [{ donde: 'texto', agente: 'content-creator' }],
      tope_restante_usd: +Number(tope_usd).toFixed(4),
    },
  }
}

/** lo que se HACE, en orden (sirve para imprimirlo sin hacerlo y para que las pruebas lo comparen con lo que se ejecuta) */
export function pasosDeLaPrueba({ topes = TOPES, clientes = CLIENTES_REALES } = {}) {
  return [
    'Comprobar que n8n no tiene nada corriendo ni esperando, que `jefatura_config` está `apagada` con listas vacías y que existen los 2 flujos (turno y vigía) inactivos.',
    'Guardar la foto de los contadores y del estado previo (respaldo de `jefatura_config`).',
    `Poner la jefatura en \`ensayo\` SOLO para ${clientes.map((c) => c.id).join(' y ')} y SOLO el tipo \`pieza\`; activar SOLO el flujo \`jefatura · turno\` (el vigía queda inactivo).`,
    ...clientes.map((c, i) => `Revisión ${i + 1} (${c.rubro}): abrir por la ruta con \`dry_run=false\`, tope ${i === 0 ? `US$ ${topes.revision.toFixed(2)}` : `el menor entre US$ ${topes.revision.toFixed(2)} y lo que quede de US$ ${topes.total.toFixed(2)}`}; despertar el flujo; mirar el cierre cada ${topes.cada_ms / 1000} s hasta ${topes.limite_min} min.`),
    'Por cada revisión leer sus pasos, fichas y filas de `agent_invocations` y armar la evidencia por tramo (jefe → ficha → corrección → GPT ciego → decisión → cierre → costo).',
    'APAGAR SIEMPRE al final, haya salido bien o mal: `jefatura_config` vuelve a la foto previa (apagada, listas vacías) y el flujo `jefatura · turno` queda inactivo.',
    'Comparar los contadores: `agent_invocations` solo sube por esta prueba; `hitl_queue`, `client_historical_outputs` y `editor_escalation` no se mueven.',
  ]
}

/**
 * ¿se puede abrir la siguiente revisión y con qué tope? Corte duro por costo: el tope de una revisión es el menor entre el de la revisión y lo que queda del total.
 * Si queda menos del mínimo útil NO se abre (no se paga una revisión que no cabe).
 */
export function topeDeLaSiguiente(gastado, topes = TOPES) {
  const queda = +(topes.total - gastado).toFixed(6)
  const tope = Math.min(topes.revision, queda)
  return tope >= topes.minimo_para_abrir ? { abrir: true, tope_usd: +tope.toFixed(4) } : { abrir: false, tope_usd: 0, motivo: `quedan US$ ${Math.max(queda, 0).toFixed(2)} del total de US$ ${topes.total.toFixed(2)}: no alcanza para otra revisión` }
}

/** ¿esta lectura de una revisión en curso pide parar todo? (se pasó de su tope, aunque la ruta debía cortar) */
export function debeParar(lectura, tope_usd) {
  const gasto = Number(lectura?.gasto_usd ?? 0)
  return gasto > tope_usd * 1.25 + 1e-9 ? `la revisión gastó US$ ${gasto.toFixed(4)} y su tope era US$ ${tope_usd.toFixed(2)} (más de un 25 % por encima): se corta la prueba` : null
}

/** dinero en el aviso: coma decimal (es-EC) */
const usd = (n) => `US$ ${Number(n).toFixed(2).replace('.', ',')}`
const sumar = (xs) => xs.reduce((a, b) => a + Number(b || 0), 0)

/**
 * La evidencia por tramo de UNA revisión (Q1: corrida real completa con evidencia por tramo).
 * @param {{ rev: any, pasos: any[], fichas: any[], invocaciones: any[], tope_usd: number, minutos: number }} d
 */
export function evidenciaDeUnaRevision({ rev, pasos, fichas, invocaciones, tope_usd, minutos }) {
  const tramos = []
  const marca = (tramo, ok, detalle, extra = {}) => tramos.push({ tramo, ok, detalle, ...extra })
  const hecho = (p) => p.estado === 'hecho'
  const porClave = (re) => pasos.filter((p) => re.test(String(p.paso)))
  const fondo = porClave(/^revision_fondo$/)[0]
  marca('jefe real', !!fondo && hecho(fondo) && Number(fondo.cost_usd) > 0, fondo ? `paso revision_fondo (${fondo.agente ?? 'sin agente'}) ${fondo.estado}, US$ ${Number(fondo.cost_usd).toFixed(4)}` : 'no hay paso revision_fondo', { costo_usd: fondo ? Number(fondo.cost_usd) : 0 })
  const delJefe = fichas.filter((f) => f.origen === 'jefe')
  const bloquean = delJefe.filter((f) => f.gravedad === 'bloquea')
  marca('ficha del jefe', true, `${delJefe.length} ficha(s) del jefe, ${bloquean.length} que bloquea(n)`, { informativo: true })
  const correcciones = porClave(/^correccion:/)
  if (bloquean.length) marca('corrección por el dueño del dónde', correcciones.some(hecho), correcciones.length ? `${correcciones.length} paso(s) de corrección: ${correcciones.map((p) => `${p.paso} ${p.estado}`).join(', ')}` : 'había fichas que bloquean y no hubo paso de corrección')
  else marca('corrección por el dueño del dónde', true, 'no hubo fichas que bloqueen: no corresponde corrección (no se fuerza)', { informativo: true })
  const gpt = porClave(/^segunda_mirada$/)[0]
  const gptConGasto = !!gpt && hecho(gpt) && Number(gpt.cost_usd) > 0
  const gptEnLibro = invocaciones.filter((i) => /gpt|openai/i.test(String(i.agent_name ?? i.model ?? '')) || i.origen === 'jefatura')
  marca('segunda mirada de GPT (ciega, con el portero)', gptConGasto, gpt ? (gptConGasto ? `paso segunda_mirada hecho, US$ ${Number(gpt.cost_usd).toFixed(4)}; filas de GPT en el libro: ${gptEnLibro.length}` : `paso segunda_mirada ${gpt.estado} sin costo${gpt.error ? ` (${gpt.error})` : ''}: la llamada real NO se probó (el resultado debe ser «sin segunda mirada»)`) : 'no hay paso segunda_mirada', { costo_usd: gpt ? Number(gpt.cost_usd) : 0, en_el_libro: gptEnLibro.length })
  const decisiones = porClave(/^decision:/)
  const externas = fichas.filter((f) => f.origen === 'externa')
  marca('decisión del dueño sobre lo que dijo GPT', externas.length === 0 ? true : decisiones.some(hecho), externas.length ? `${externas.length} ficha(s) externa(s); decisión: ${decisiones.map((p) => `${p.paso} ${p.estado}`).join(', ') || 'ninguna'}` : 'GPT no dejó hallazgos: no corresponde decisión', { informativo: externas.length === 0 })
  marca('cierre', TERMINALES.includes(rev.estado) && RESULTADOS_VALIDOS.includes(rev.resultado), `estado ${rev.estado}, resultado ${rev.resultado}, marcas ${JSON.stringify(rev.marcas ?? {})}`)
  const gasto = Number(rev.gasto_usd ?? 0)
  const suma = +sumar(pasos.map((p) => p.cost_usd)).toFixed(6)
  marca('costo dentro del tope', gasto <= tope_usd + 1e-6, `gasto US$ ${gasto.toFixed(4)} ≤ tope US$ ${tope_usd.toFixed(2)}`, { costo_usd: gasto })
  marca('costo por paso = costo de la revisión', Math.abs(suma - gasto) <= 0.0005, `suma de pasos US$ ${suma.toFixed(4)} vs revisión US$ ${gasto.toFixed(4)}`)
  const sinWorkflow = invocaciones.filter((i) => !i.workflow_id)
  marca('toda llamada de agente con workflow_id', sinWorkflow.length === 0, sinWorkflow.length ? `${sinWorkflow.length} fila(s) de agent_invocations sin workflow_id` : `${invocaciones.length} fila(s) en el libro, todas con workflow_id`)
  const saltos = pasos.filter((p) => p.tipo === 'agente' && hecho(p)).length
  return { revision_id: rev.id, resultado: rev.resultado, estado: rev.estado, marcas: rev.marcas ?? {}, gasto_usd: gasto, tope_usd, saltos_de_agente: saltos, minutos: +minutos.toFixed(2), tramos, ok: tramos.every((t) => t.ok) }
}

/** lo que NO debe moverse en esta prueba (diferencia = alarma) y lo que sí puede */
export const DEBE_SEGUIR_IGUAL = ['hitl_queue_total', 'client_historical_outputs_total', 'hitl_queue_editor_escalation', 'agent_invocations_workflow_id_nulo']
export function compararContadores(antes, despues, { gasto_esperado_usd }) {
  const fallos = []
  for (const k of DEBE_SEGUIR_IGUAL) if (antes[k] !== despues[k]) fallos.push(`${k}: ${antes[k]} → ${despues[k]} (debía seguir igual)`)
  const dAgent = Number(despues.agent_invocations_total) - Number(antes.agent_invocations_total)
  if (!(dAgent >= 0)) fallos.push(`agent_invocations bajó (${antes.agent_invocations_total} → ${despues.agent_invocations_total})`)
  const dCosto = +(Number(despues.agent_invocations_costo_usd_de_los_clientes_de_practica) - Number(antes.agent_invocations_costo_usd_de_los_clientes_de_practica)).toFixed(6)
  if (dCosto > gasto_esperado_usd * 1.25 + 0.01) fallos.push(`el libro subió US$ ${dCosto} y las revisiones declaran US$ ${gasto_esperado_usd}`)
  return { ok: fallos.length === 0, fallos, filas_nuevas_en_el_libro: dAgent, costo_nuevo_en_el_libro_usd: dCosto }
}

/** ¿la prueba cumplió TODO? Cada condición cuenta por separado: alguna revisión, todas con evidencia completa, contadores en orden, ninguna parada y el gasto total dentro del tope */
export function esExitosa(r, topes = TOPES) {
  return Array.isArray(r.revisiones) && r.revisiones.length > 0 && r.revisiones.every((x) => x.ok === true) && r.contadores?.ok === true && !r.parada && r.apagado === true && Number(r.gasto_total_usd) <= topes.total + 1e-6
}

const dormir = (T, ms) => (T.dormir ? T.dormir(ms) : new Promise((r) => setTimeout(r, ms)))
const ahora = (T) => (T.ahora ?? Date.now)()

/**
 * LA PRUEBA. Sin `aplicar` no llama a nada que escriba (solo devuelve lo que haría). Con `aplicar` EXIGE la confirmación del «dale» de Emilio.
 * Pase lo que pase (error, corte, tope), el `finally` APAGA: restaura `jefatura_config` y desactiva el flujo `jefatura · turno`.
 * T = { enVuelo(), leerConfig(), ponerConfig(c), flujos() → { turno:{id,active}|null, vigia:{id,active}|null }, activar(id,on), llamar(ruta, cuerpo) → {status, body}, despertar({ revision_id, turno }) → {status} (la acción `despertar` de la ruta de turnos: ella despierta al flujo con su propia llave), evidencia(revision_id) → {rev,pasos,fichas,invocaciones}, contadores(), ahora?, dormir? }
 */
/** @param {{ T: any, aplicar?: boolean, confirmacion?: any, topes?: any, clientes?: any[], corrida?: string, imagen?: string | null }} o
 * @returns {Promise<any>} */
/**
 * J6 cuarto · UNA pieza con una falla BLOQUEANTE sembrada a propósito (la del segundo cliente): se le agrega una frase con palabras que SU manual prohíbe («Lo que nunca decimos»).
 * Sirve para que el camino de corrección se ejerza de verdad. Devuelve el texto sembrado y lo sembrado (para documentarlo en la evidencia). No toca nada más de la pieza.
 */
export function sembrarFalla(cliente, texto) {
  const p = cliente.prohibidas ?? []
  if (p.length < 2) throw new Error(`el cliente ${cliente.id} no tiene palabras prohibidas para sembrar`)
  const frase = `${p[2] ? p[2][0].toUpperCase() + p[2].slice(1) : 'Garantizado'} que ${p[1]} ${p[0]}.`
  const i = texto.indexOf('\n\n')
  const sembrado = i >= 0 ? `${texto.slice(0, i)} ${frase}${texto.slice(i)}` : `${texto} ${frase}`
  return { texto: sembrado, frase, palabras_prohibidas: p.filter((w) => sembrado.toLowerCase().includes(w.toLowerCase())) }
}

export async function correrLaPruebaReal({ T, aplicar = false, confirmacion = false, topes = TOPES, clientes = CLIENTES_REALES, corrida, imagen = null, fallaSembrada = false }) {
  if (!aplicar) return { impreso: true, pasos: pasosDeLaPrueba({ topes, clientes }), escrituras: 0 }
  if (confirmacion !== true) throw new Error('J6 se niega: falta la confirmación del «dale» de Emilio (--dale-de-emilio <fecha>). Sin ese «dale» no se corre nada real.')
  if (!corrida) throw new Error('J6 se niega: falta el identificador de la corrida (cada corrida abre revisiones nuevas)')
  const log = []
  const dicho = (t) => log.push(t)
  // 0 · comprobaciones previas (si algo no está como se espera, NO se enciende nada)
  const vuelo = await T.enVuelo()
  if (vuelo !== 0) throw new Error(`J6 se niega: n8n tiene ${vuelo} ejecución(es) corriendo o esperando (debe haber 0)`)
  const cfg = await T.leerConfig()
  if (!cfg || cfg.estado !== 'apagada' || (cfg.tipos_activos ?? []).length || (cfg.clientes_ensayo ?? []).length) throw new Error(`J6 se niega: jefatura_config no está apagada con listas vacías (${JSON.stringify(cfg)})`)
  const fl = await T.flujos()
  if (!fl.turno || fl.turno.active) throw new Error('J6 se niega: el flujo «jefatura · turno» no existe o ya está activo')
  if (fl.vigia?.active) throw new Error('J6 se niega: el flujo «jefatura · el vigía» está activo (debe estar inactivo)')
  const antes = await T.contadores()
  /** @type {any} */
  const resultado = { corrida, antes, revisiones: [], saltadas: [], parada: null, apagado: false, log }
  let gastado = 0
  let fallo = null
  try {
    await T.ponerConfig({ estado: 'ensayo', tipos_activos: ['pieza'], clientes_ensayo: clientes.map((c) => c.id) })
    await T.activar(fl.turno.id, true)
    dicho('jefatura en ensayo (pieza, 2 clientes de práctica) y flujo turno activo')
    for (const [i, c] of clientes.entries()) {
      const dec = topeDeLaSiguiente(gastado, topes)
      if (!dec.abrir) { resultado.saltadas.push({ cliente: c.id, motivo: dec.motivo }); dicho(`no se abre la revisión ${i + 1}: ${dec.motivo}`); continue }
      const sobre = sobreReal(c, { corrida, tope_usd: dec.tope_usd, imagen })
      // solo UNA pieza (la segunda) lleva la falla sembrada; la otra queda como en J6/J6 ter
      if (fallaSembrada && i === 1) {
        const sem = sembrarFalla(c, sobre.payload.texto)
        resultado.falla_sembrada = { cliente: c.id, artifact_id: sobre.artifact_id, frase: sem.frase, palabras_prohibidas: sem.palabras_prohibidas, texto_original: sobre.payload.texto, texto_sembrado: sem.texto }
        sobre.payload.texto = sem.texto
        dicho(`falla sembrada en la revisión ${i + 1}: «${sem.frase}» (prohibidas: ${sem.palabras_prohibidas.join(', ')})`)
      }
      const t0 = ahora(T)
      const abre = await T.llamar('revisiones', sobre)
      if (abre.status !== 200) { resultado.revisiones.push({ cliente: c.id, ok: false, error: `la ruta contestó ${abre.status}: ${JSON.stringify(abre.body).slice(0, 240)}` }); dicho(`revisión ${i + 1}: la ruta contestó ${abre.status}`); continue }
      const revision_id = abre.body.revision_id
      if (abre.body.accion === 'esperar') {
        const w = await T.despertar({ revision_id, turno: abre.body.turno })
        if (!(w.status >= 200 && w.status < 300)) { resultado.revisiones.push({ cliente: c.id, revision_id, ok: false, error: `la ruta no pudo despertar al flujo (${w.status})` }); dicho(`revisión ${i + 1}: el flujo no despertó (${w.status})`); break }
      }
      let lectura = null
      const limite = topes.limite_min * 60000
      for (;;) {
        lectura = (await T.llamar('revisiones', { accion: 'leer', revision_id })).body ?? {}
        const parar = debeParar(lectura, dec.tope_usd)
        if (parar) { resultado.parada = parar; dicho(parar); break }
        if (TERMINALES.includes(lectura.estado)) break
        if (ahora(T) - t0 > limite) { resultado.parada = `la revisión ${i + 1} no cerró en ${topes.limite_min} min (estado ${lectura.estado}): se corta la prueba`; dicho(resultado.parada); break }
        await dormir(T, topes.cada_ms)
      }
      const ev = await T.evidencia(revision_id)
      const minutos = (ahora(T) - t0) / 60000
      const e = evidenciaDeUnaRevision({ rev: ev.rev ?? { id: revision_id, ...lectura }, pasos: ev.pasos ?? [], fichas: ev.fichas ?? [], invocaciones: ev.invocaciones ?? [], tope_usd: dec.tope_usd, minutos })
      resultado.revisiones.push({ cliente: c.id, rubro: c.rubro, ...e })
      gastado += e.gasto_usd
      dicho(`revisión ${i + 1} (${c.rubro}): ${e.resultado}, US$ ${e.gasto_usd.toFixed(4)}, ${e.minutos} min, evidencia ${e.ok ? 'completa' : 'con tramos sin cumplir'}`)
      if (resultado.parada) break
    }
  } catch (e) {
    fallo = e
  } finally {
    // 🔴 APAGAR SIEMPRE: aunque algo haya fallado arriba, la jefatura vuelve a la foto previa y el flujo queda inactivo. Las dos cosas se intentan POR SEPARADO (que falle una no impide la otra).
    const alApagar = []
    try { await T.ponerConfig({ estado: cfg.estado, tipos_activos: cfg.tipos_activos ?? [], clientes_ensayo: cfg.clientes_ensayo ?? [] }) } catch (e) { alApagar.push('jefatura_config: ' + (e instanceof Error ? e.message : String(e))) }
    try { await T.activar(fl.turno.id, false) } catch (e) { alApagar.push('flujo turno: ' + (e instanceof Error ? e.message : String(e))) }
    resultado.apagado = alApagar.length === 0
    if (alApagar.length) { resultado.errores_al_apagar = alApagar; dicho('NO SE PUDO APAGAR TODO (hay que apagar a mano con «apagar --aplicar»): ' + alApagar.join(' · ')) } else dicho('apagado: jefatura_config restaurada y flujo turno inactivo')
  }
  if (fallo) { fallo.resultado_parcial = resultado; throw fallo }
  if (!resultado.apagado) { const e = new Error('J6: la prueba terminó pero NO se pudo apagar todo: ' + resultado.errores_al_apagar.join(' · ')); e.resultado_parcial = resultado; throw e }
  resultado.despues = await T.contadores()
  resultado.gasto_total_usd = +gastado.toFixed(6)
  resultado.contadores = compararContadores(antes, resultado.despues, { gasto_esperado_usd: resultado.gasto_total_usd })
  resultado.ok = esExitosa(resultado, topes)
  return resultado
}

/** El aviso para Emilio (método de Lenovo: qué corre, cuánto cuesta, cuánto tarda, qué prueba, qué riesgo; luego el «dale»). Lenguaje de administrador, tuteo. `medidas` = lo medido en el seco (si existe). */
/** @param {{ topes?: any, medidas?: any, clientes?: any[] }} [o] */
export function avisoParaEmilio({ topes = TOPES, medidas = null, clientes = CLIENTES_REALES } = {}) {
  const costo = medidas?.costo_por_revision_usd
  const rango = costo ? `≈ ${usd(costo * 2)} (medido en el ensayo: ≈ ${usd(costo)} por revisión)` : '≈ US$ 0,45–0,55 (cálculo del diseño; lo reemplazamos por lo medido en el ensayo antes de pedirte el «dale»)'
  return [
    `**Aviso previo a tu «dale» · primera prueba REAL de la revisión de calidad (la jefatura)**`,
    '',
    `**Qué corre:** la revisión de calidad revisa **2 piezas ya hechas** (un post de un restaurante y un post de un estudio contable), las dos de **clientes de práctica**: no son clientes tuyos ni de nadie, no se publica nada y no se produce nada nuevo. Es la primera vez que corre con los empleados y con el revisor externo de verdad (hasta ahora solo corrió en ensayo, sin costo).`,
    `**Cuánto cuesta:** ${rango}. Dos topes duros: **${usd(topes.revision)} por revisión** y **${usd(topes.total)} en total**; si una revisión llega a su tope se corta sola y queda anotada.`,
    `**Cuánto tarda:** entre 5 y 15 minutos por revisión (≈ 10–30 minutos todo); la prueba se corta sola a los ${topes.limite_min} minutos por revisión.`,
    `**Qué prueba:** que el jefe de marketing señala fallas reales, que quien hizo la pieza las corrige, que el revisor externo la mira a ciegas, que la decisión final queda registrada, que cada centavo queda anotado paso por paso y que **no aparece ninguna aprobación suelta del editor viejo**.`,
    `**Riesgo:** (1) el revisor externo puede razonar más de la cuenta y subir un poco su costo (ya está dentro del tope); (2) si el revisor externo no contesta o no está configurado, la revisión queda «sin segunda mirada» — es un resultado válido pero esa parte NO queda probada y te lo diremos; (3) mientras corre, nadie puede publicar cambios (una publicación reinicia el sistema); (4) al terminar la revisión de calidad **se apaga sola** y vuelve a como está hoy.`,
    `**Qué necesitamos de ti:** solo un «dale» (o «no todavía»). Si quieres que una de las piezas lleve una foto real para probar también la revisión de imágenes, dímelo y sumamos ≈ US$ 0,05 por imagen.`,
    '',
    `*(técnico · J6 · \`jefatura-prueba-real.mjs\` · clientes ${clientes.map((c) => c.id).join(', ')} · \`dry_run=false\` · \`tope_restante_usd\` ${topes.revision} · tipos_activos [pieza] · \`apagar\` en el finally)*`,
  ].join('\n')
}
