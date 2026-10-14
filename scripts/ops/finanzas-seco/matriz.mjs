// LA MATRIZ DEL SECO DE LA OFICINA FINANCIERA · CC#2 · 14-oct. Celda = negocio (7) × registro (tuteo, voseo) × caso (10). Cada caso trae LO QUE DEBE PASAR; `evaluar` lo compara con lo observado.
// Es PURA (sin red): la usan el CLI (por la ruta, con la base real) y la prueba (en memoria, con el orquestador real). Si una expectativa fuera falsa, la prueba en memoria lo dice ANTES de tocar la base.
import { acuerdoConCritico, acuerdoOk, CLIENTES, guionBase, idDe, NEGOCIOS, planteo, redes, semilla } from './fixtures.mjs'

export const REGISTROS = ['tuteo', 'voseo']
export const TOPE_ENCARGO_USD = 1.5

/**
 * Los casos. `guion(n)` devuelve el guion completo; `costo` el costo simulado por llamada; `espera` lo que debe observarse:
 *  · estado        estado final del encargo
 *  · bloque        { hay_bloque, motivo? } del paso «calculo»
 *  · firma         campos del artefacto de cierre (paso «firma»)
 *  · no_habla      pasos que NO deben haberse ejecutado (la omisión por canal, el salto sin bloque, la ronda 2 que no ocurre)
 *  · habla         pasos que SÍ
 *  · en_fallo      pasos cuyo turno quedó «sin supuestos del agente» (turno en fallo)
 *  · gasto         { max } o { min }
 */
export const CASOS = [
  {
    caso: 'completo', que: 'todos contestan: bloque calculado, jefe «sale», firmado',
    guion: (n) => guionBase(n),
    espera: { estado: 'cerrado', bloque: { hay_bloque: true }, firma: { estado: 'firmado', sin_acuerdo: false }, habla: ['abrir', 'planteo', 'fpa', 'redes', 'medicion', 'ajuste', 'calculo', 'cierre', 'firma'], no_habla: ['fpa_2', 'redes_2', 'busqueda_2', 'medicion_2', 'ajuste_2', 'calculo_2', 'cierre_2'], gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'sin-referencia', que: 'ni el especialista ni la tabla dan costo por resultado: no se inventa un número; sin bloque; el plan sigue',
    semilla: { sin_referencia: true },
    guion: (n) => ({ ...guionBase(n), redes: redes(n, { sinCosto: true }) }),
    espera: { estado: 'sin_acuerdo', bloque: { hay_bloque: false, motivo: 'sin_base' }, firma: { estado: 'sin_bloque', sin_acuerdo: true }, no_habla: ['cierre'], gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'sin-pauta', que: 'el plan no paga medios (solo base propia): habla solo FP&A; sin bloque; el plan sigue',
    guion: (n) => ({ ...guionBase(n), planteo: planteo(n, { canales: [{ canal: 'base_propia', peso: 1 }] }), ajuste: planteo(n, { canales: [{ canal: 'base_propia', peso: 1 }] }) }),
    espera: { estado: 'sin_acuerdo', bloque: { hay_bloque: false, motivo: 'sin_pauta' }, firma: { estado: 'sin_bloque', sin_acuerdo: true }, habla: ['planteo', 'fpa', 'ajuste'], no_habla: ['redes', 'busqueda', 'medicion', 'cierre'], gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'jefe-sin-respuesta', que: 'el jefe de finanzas no contesta: «sale con alerta», sin firma, sin acuerdo; nunca «sale»',
    guion: (n) => ({ ...guionBase(n), cierre: null }),
    espera: { estado: 'sin_acuerdo', bloque: { hay_bloque: true }, firma: { estado: 'sin_firma', sin_acuerdo: true, salida: 'sale_con_alerta' }, en_fallo: ['cierre'], gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'formato-roto-una-vez', que: 'el plan contesta texto roto y acierta en el reintento: el turno queda hecho (2 llamadas)',
    guion: (n) => ({ ...guionBase(n), planteo: ['esto no es un objeto JSON', planteo(n)] }),
    espera: { estado: 'cerrado', bloque: { hay_bloque: true }, firma: { estado: 'firmado' }, llamadas: { planteo: 2 }, gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'formato-roto-siempre', que: 'FP&A contesta roto dos veces: turno «sin supuestos del agente»; la conversación sigue con lo que hay',
    guion: (n) => ({ ...guionBase(n), fpa: ['{"agente": "x"', '{"agente": "x"'] }),
    espera: { en_fallo: ['fpa'], llamadas: { fpa: 2 }, habla: ['redes', 'ajuste', 'calculo', 'firma'], gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'tope', que: 'cada llamada cuesta US$ 0,60 (simulado): al pasar US$ 1,50 la conversación cierra por tope y nunca bloquea',
    costo: 0.6,
    guion: (n) => guionBase(n),
    espera: { estado: 'cierre_por_tope', gasto: { min: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'ronda-2', que: 'el jefe señala un crítico a redes: SOLO redes habla en la ronda 2, una sola vuelta, nunca una tercera',
    guion: (n) => ({ ...guionBase(n), cierre: acuerdoConCritico('redes'), redes_2: redes(n), cierre_2: acuerdoOk() }),
    espera: { habla: ['cierre', 'redes_2', 'ajuste_2', 'calculo_2'], no_habla: ['fpa_2', 'busqueda_2', 'medicion_2'], max_turnos_de_modelo: 13, gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'dado-por-verificado', que: 'el plan «da por verificado» algo que el código no comprueba: la salida topa a «sale con alerta» y la confianza no sube',
    guion: (n) => ({ ...guionBase(n), ajuste: planteo(n, { dado_por_verificado: ['la ficha del mapa'] }) }),
    espera: { bloque: { hay_bloque: true }, firma: { salida: 'sale_con_alerta', tope_aplicado: true }, gasto: { max: TOPE_ENCARGO_USD } },
  },
  {
    caso: 'dato-de-ensayo', que: 'la corrida del expediente fue de ensayo: ningún dato entra como «medido»',
    semilla: { dato_de_ensayo: true },
    guion: (n) => guionBase(n),
    espera: { expediente_sin_medidos: true, bloque: { hay_bloque: true }, gasto: { max: TOPE_ENCARGO_USD } },
  },
]

export const celdas = (opciones = {}) => {
  const out = []
  for (const n of NEGOCIOS) for (const registro of REGISTROS) for (const c of CASOS) {
    if (opciones.negocio && n.slug !== opciones.negocio) continue
    if (opciones.registro && registro !== opciones.registro) continue
    if (opciones.caso && c.caso !== opciones.caso) continue
    out.push({
      id: `${n.slug}|${registro}|${c.caso}`, negocio: n.slug, registro, caso: c.caso, que: c.que,
      client_id: idDe(n),
      semilla: semilla(n, registro, c.semilla),
      simulacion: { guion: c.guion(n), ...(c.costo !== undefined ? { costo_por_llamada_usd: c.costo } : {}) },
      espera: c.espera,
    })
  }
  return out
}

export function resumenDeLaMatriz() {
  const por = {}
  for (const c of CASOS) por[c.caso] = c.que
  return { negocios: NEGOCIOS.map((n) => n.slug), registros: REGISTROS, casos: por, total: NEGOCIOS.length * REGISTROS.length * CASOS.length }
}

// ───────────────────────── lo observado → veredicto
/** `obs` = { abrir_status, estado, gasto_usd, pasos: [clave], turnos: [{paso,agente,estado,costo_usd,salida}], llamadas: [{paso,agente,instruccion_en_tuteo,voseo_en_la_instruccion}], sin_voseo_propio } */
export function evaluar(celda, obs) {
  const fallas = []
  const e = celda.espera
  const ya = (cond, msg) => { if (!cond) fallas.push(msg) }
  ya(obs.abrir_status === 200, `abrir devolvió ${obs.abrir_status}`)
  const turno = (p) => obs.turnos.find((t) => t.paso === p)
  if (e.estado) ya(obs.estado === e.estado, `estado final ${obs.estado}, esperado ${e.estado}`)
  if (e.bloque) {
    const t = turno('calculo')
    ya(!!t, 'no hubo paso «calculo»')
    if (t) {
      ya((t.salida?.hay_bloque === true) === e.bloque.hay_bloque, `hay_bloque=${t.salida?.hay_bloque}, esperado ${e.bloque.hay_bloque}`)
      if (e.bloque.motivo) ya(t.salida?.motivo === e.bloque.motivo, `motivo «${t.salida?.motivo}», esperado «${e.bloque.motivo}»`)
    }
  }
  if (e.firma) {
    const t = turno('firma')
    ya(!!t, 'no hubo paso «firma»')
    if (t) for (const [k, v] of Object.entries(e.firma)) ya(t.salida?.[k] === v, `firma.${k}=${JSON.stringify(t.salida?.[k])}, esperado ${JSON.stringify(v)}`)
  }
  for (const p of e.habla ?? []) ya(obs.pasos.includes(p), `el paso «${p}» debía ejecutarse`)
  for (const p of e.no_habla ?? []) ya(!obs.pasos.includes(p), `el paso «${p}» NO debía ejecutarse`)
  for (const p of e.en_fallo ?? []) ya(turno(p)?.estado === 'fallo', `el turno «${p}» debía quedar en fallo (sin supuestos del agente)`)
  for (const [p, n] of Object.entries(e.llamadas ?? {})) ya(obs.llamadas.filter((l) => l.paso === p).length === n, `llamadas al paso «${p}»: ${obs.llamadas.filter((l) => l.paso === p).length}, esperadas ${n}`)
  if (e.gasto?.max !== undefined) ya(obs.gasto_usd <= e.gasto.max + 1e-9, `gasto ${obs.gasto_usd} pasa de ${e.gasto.max}`)
  if (e.gasto?.min !== undefined) ya(obs.gasto_usd >= e.gasto.min - 1e-9, `gasto ${obs.gasto_usd} no llega a ${e.gasto.min}`)
  if (e.max_turnos_de_modelo !== undefined) ya(obs.llamadas.length <= e.max_turnos_de_modelo * 2, `más llamadas al modelo de lo permitido (${obs.llamadas.length})`)
  if (e.expediente_sin_medidos) {
    const t = turno('abrir')
    const datos = t?.salida?.datos ?? []
    ya(Array.isArray(datos) && datos.length > 0 && datos.every((d) => d.procedencia !== 'medido'), 'un dato de una corrida de ensayo entró como «medido»')
  }
  // siempre: el plan nunca se bloquea y la instrucción interna sale en tuteo, sin voseo propio, aunque el manual del cliente esté en voseo
  ya(obs.llamadas.every((l) => l.instruccion_en_tuteo === true), 'una instrucción a un agente no pide tuteo')
  ya(obs.llamadas.every((l) => Array.isArray(l.voseo_en_la_instruccion) && l.voseo_en_la_instruccion.length === 0), 'voseo en una instrucción de la oficina: ' + JSON.stringify(obs.llamadas.map((l) => l.voseo_en_la_instruccion).flat()))
  ya(obs.turnos.length <= 20, 'demasiados turnos (bucle)')
  return { ok: fallas.length === 0, fallas }
}

export { CLIENTES }
