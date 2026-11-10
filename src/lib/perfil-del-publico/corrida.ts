/**
 * PERFIL DEL PÚBLICO · el CONDUCTOR de una corrida (un cliente, todos sus públicos) · T1.
 * Todo lo que toca base, red o modelo entra como dependencia: la puerta HTTP lo cablea y las pruebas lo sabotean a US$ 0.
 *
 * El orden es la garantía (lo que CC6 mide):
 *   1. en corrida real, la PALANCA (apagada por omisión) y después el CRÉDITO con margen, ANTES de leer nada que cueste: sin crédito no se raspa
 *      ni se redacta, y se dice por qué. Una lectura de crédito que falla o tarda es «sin crédito».
 *   2. primero lo que YA hay (voces guardadas de este cliente y fichas de habla del cerebro, a US$ 0); se raspa solo lo que falta para la muestra.
 *   3. cada llamada reserva su máximo en el tope ANTES de salir: el tope corta a mitad de la corrida.
 *   4. toda voz pasa por la red propia y por el filtro de seguridad existente; la apartada no llega al redactor.
 *   5. sin muestra mínima no se redacta. Lo que devuelve el redactor pasa por `filtrarPerfil`: ninguna frase sin fuente de este cliente.
 *   6. se archiva por la puerta de informes del cerebro (uno vigente por cliente; el anterior queda retirado). En ensayo no se raspa, no se
 *      redacta ni se archiva nada: se devuelve el plan.
 */
import {
  AGENTE, crearPresupuesto, decidirCredito, etiquetaDeVoz, filtrarPerfil, FUENTES_FALTANTES, FUENTES_POR_TIPO, OFICINA, pareceUnaOrden, planDeRaspado,
  publicosDe, suficiencia, tareaDelPerfil, TIPO_DEL_INFORME, TOPE_DEL_REDACTOR_USD, TOPE_POR_CORRIDA_USD, vocesDe,
  type LecturaDeCredito, type LlamadaPlaneada, type Objetivos, type PublicoObjetivo, type Voz, type VozConId,
} from './perfil'

export const RUTA = '/api/perfil-del-publico'

export interface FichaDelCliente { readonly rubro: string | null; readonly plaza: string | null; readonly pais: string | null; readonly idioma: string | null; readonly trato: string | null }
export type ResultadoDeRecoleccion = { ok: true; items: ReadonlyArray<unknown>; costo_usd: number | null } | { ok: false; detalle: string; costo_usd: number | null }
export type ResultadoDelRedactor = { ok: true; salida: string; costo_usd: number | null } | { ok: false; error: string; costo_usd: number | null }

export interface DepsDeLaCorrida {
  leerPalanca(): Promise<{ encendida: boolean; motivo: string }>
  leerCredito(): Promise<LecturaDeCredito>
  /** ¿el redactor existe y está activo en `agents`? (si no, no se raspa: sería pagar Apify para nada) */
  empleadoListo(): Promise<{ ok: true } | { ok: false; motivo: string }>
  leerFicha(): Promise<FichaDelCliente | null>
  /** las filas del documento de público ideal de ESTE cliente */
  leerPublicos(): Promise<ReadonlyArray<Record<string, unknown>>>
  /** las voces ya guardadas de ESTE cliente y sus fichas de habla del cerebro (fuente `cerebro:<clase>`, id = id de la ficha) */
  leerVoces(): Promise<ReadonlyArray<VozConId>>
  leerObjetivos(): Promise<Objetivos>
  recolectar(ll: LlamadaPlaneada, n: number): Promise<ResultadoDeRecoleccion>
  /** el filtro de seguridad que ya existe: true = pasa. Si lanza, la voz queda apartada (falla cerrado) */
  filtroDeSeguridad(texto: string): Promise<boolean>
  /** guarda (sin duplicar por huella) y devuelve las voces con su id */
  guardarVoces(voces: ReadonlyArray<Voz & { etiqueta: Record<string, unknown> }>): Promise<ReadonlyArray<VozConId>>
  redactar(tarea: string, tope_usd: number, publico: PublicoObjetivo): Promise<ResultadoDelRedactor>
  archivar(cuerpo: CuerpoDelPerfil): Promise<{ ok: boolean; detalle: string }>
}
export interface EntradaDeLaCorrida {
  client_id: string; dry_run: boolean; workflow_id: string; workflow_execution_id: string; ahora?: () => Date
  /** un tope MENOR que el de la corrida (nunca mayor): lo que llegue fuera de (0, TOPE_POR_CORRIDA_USD] se ignora */
  tope_usd?: number
}

export interface CuerpoDelPerfil {
  client_id: string; tipo: string; texto: string; citas: string[]; fecha_de_corte: string
  pedido_por: { oficina: string; agente: string }; dry_run: false; workflow_id: string; workflow_execution_id: string
}

export interface ResultadoPorPublico {
  publico: string; tipo: string; estado: 'redactado' | 'muestra_insuficiente' | 'cortado_por_tope' | 'redactor_fallo' | 'ensayo'
  muestra: string; voces_usadas: number; lineas_validas?: number; descartadas?: number; secciones_sin_dato?: ReadonlyArray<string>
  sin_objetivo?: ReadonlyArray<string>; fuentes_faltantes: ReadonlyArray<string>; detalle?: string
}
export interface ResultadoDeLaCorrida {
  estado: 'apagado' | 'sin_credito' | 'sin_empleado' | 'sin_publicos' | 'sin_ficha' | 'ensayo' | 'hecho'
  motivo: string
  llamadas_a_apify: number; llamadas_al_redactor: number; gasto_comprometido_usd: number; tope_usd: number
  voces_nuevas: number; voces_apartadas: number
  publicos: ResultadoPorPublico[]
  plan?: Array<{ publico: string; llamadas: Array<{ funcion: string; objetivo: string; usd_max: number }> }>
  archivado?: { ok: boolean; detalle: string }
  cortes: string[]
}

const familiasDe = (p: PublicoObjetivo): Set<string> => new Set(FUENTES_POR_TIPO[p.tipo].map((f) => f.funcion))
/** las voces que sirven a ESTE público: las de sus fuentes y las del cerebro */
const vocesDelPublico = (todas: ReadonlyArray<VozConId>, p: PublicoObjetivo): VozConId[] => { const f = familiasDe(p); return todas.filter((v) => v.fuente.startsWith('cerebro:') || f.has(v.fuente)) }

export async function correrPerfil(deps: DepsDeLaCorrida, e: EntradaDeLaCorrida): Promise<ResultadoDeLaCorrida> {
  const tope = typeof e.tope_usd === 'number' && e.tope_usd > 0 && e.tope_usd <= TOPE_POR_CORRIDA_USD ? e.tope_usd : TOPE_POR_CORRIDA_USD
  const presupuesto = crearPresupuesto(tope)
  const r: ResultadoDeLaCorrida = { estado: 'hecho', motivo: '', llamadas_a_apify: 0, llamadas_al_redactor: 0, gasto_comprometido_usd: 0, tope_usd: tope, voces_nuevas: 0, voces_apartadas: 0, publicos: [], cortes: [] }
  const cerrar = (estado: ResultadoDeLaCorrida['estado'], motivo: string): ResultadoDeLaCorrida => ({ ...r, estado, motivo, gasto_comprometido_usd: Number(presupuesto.comprometido().toFixed(4)) })

  // 1 · palanca y crédito: ANTES de cualquier lectura, raspado o redactor
  if (!e.dry_run) {
    const palanca = await deps.leerPalanca().catch((x) => ({ encendida: false, motivo: `no se pudo leer la palanca (${String(x).slice(0, 120)}): se toma como apagada` }))
    if (!palanca.encendida) return cerrar('apagado', `${palanca.motivo} · US$ 0`)
    const lectura = await deps.leerCredito().catch((x): LecturaDeCredito => ({ ok: false, detalle: x instanceof Error ? x.message : String(x) }))
    const credito = decidirCredito(lectura)
    if (!credito.corre) return cerrar('sin_credito', credito.motivo)
    const empleado = await deps.empleadoListo().catch((x) => ({ ok: false as const, motivo: `no se pudo leer el registro de empleados (${String(x).slice(0, 120)})` }))
    if (!empleado.ok) return cerrar('sin_empleado', `${empleado.motivo} · no se raspó ni se redactó · US$ 0`)
  }

  const ficha = await deps.leerFicha()
  if (!ficha) return cerrar('sin_ficha', 'no existe la ficha del cliente · US$ 0')
  const { publicos, fuera } = publicosDe(await deps.leerPublicos())
  if (!publicos.length) return cerrar('sin_publicos', 'el cliente no tiene públicos en su documento de público ideal: no hay de quién hacer el perfil · US$ 0')
  if (fuera) r.cortes.push(`${fuera} público(s) de menor prioridad quedaron fuera (máximo ${publicos.length})`)

  // 2 · lo que ya hay, pasado por la red propia y el filtro existente
  const pasa = async (texto: string): Promise<boolean> => { if (pareceUnaOrden(texto)) return false; try { return (await deps.filtroDeSeguridad(texto)) === true } catch { return false } }
  const conocidas: VozConId[] = []
  for (const v of await deps.leerVoces()) { if (await pasa(v.texto)) conocidas.push(v); else r.voces_apartadas++ }
  const huellas = new Set(conocidas.map((v) => v.huella))
  const pedidos = new Set<string>()
  const objetivos = e.dry_run ? null : await deps.leerObjetivos()
  if (e.dry_run) r.plan = []
  let n = 0
  const textos: string[] = []
  const citasDeFichas = new Set<string>()
  const delCerebro = new Set<string>()

  for (const p of publicos) {
    const faltantes = FUENTES_FALTANTES[p.tipo]
    let suyas = vocesDelPublico(conocidas, p)
    let muestra = suficiencia(suyas)
    if (e.dry_run) {
      const plan = muestra.alcanza ? { llamadas: [], sin_objetivo: [] } : planDeRaspado(p.tipo, await deps.leerObjetivos())
      r.plan!.push({ publico: p.nombre, llamadas: plan.llamadas.map((l) => ({ funcion: l.funcion, objetivo: l.objetivo, usd_max: l.usd_max })) })
      r.publicos.push({ publico: p.nombre, tipo: p.tipo, estado: 'ensayo', muestra: muestra.motivo, voces_usadas: suyas.length, sin_objetivo: plan.sin_objetivo, fuentes_faltantes: faltantes, detalle: 'ensayo: no se raspó, no se redactó, no se archivó · US$ 0' })
      continue
    }
    // 3 · raspar solo lo que falta, reservando ANTES de cada llamada
    let cortado: string | null = null
    if (!muestra.alcanza) {
      const plan = planDeRaspado(p.tipo, objetivos!, pedidos)
      for (const ll of plan.llamadas) {
        if (muestra.alcanza) break
        const reserva = presupuesto.reservar(ll.usd_max)
        if (!reserva.ok) { cortado = reserva.motivo; break }
        pedidos.add(`${ll.funcion}|${ll.objetivo}`)
        r.llamadas_a_apify++
        const res = await deps.recolectar(ll, ++n).catch((x): ResultadoDeRecoleccion => ({ ok: false, detalle: String(x).slice(0, 200), costo_usd: null }))
        presupuesto.liquidar(ll.usd_max, res.costo_usd)
        if (!res.ok) { r.cortes.push(`${ll.funcion} (${ll.objetivo.slice(0, 80)}): ${res.detalle}`); continue }
        const nuevas: Array<Voz & { etiqueta: Record<string, unknown> }> = []
        for (const v of vocesDe(ll.funcion, res.items, huellas)) {
          huellas.add(v.huella)
          if (await pasa(v.texto)) nuevas.push({ ...v, etiqueta: etiquetaDeVoz(v, RUTA, e.workflow_execution_id) })
          else r.voces_apartadas++
        }
        if (nuevas.length) {
          const guardadas = await deps.guardarVoces(nuevas)
          r.voces_nuevas += guardadas.length
          conocidas.push(...guardadas)
        }
        suyas = vocesDelPublico(conocidas, p)
        muestra = suficiencia(suyas)
      }
      if (!muestra.alcanza && !cortado) r.cortes.push(...plan.sin_objetivo.map((f) => `${p.nombre}: sin a quién apuntar para ${f}`))
    }
    const base = { publico: p.nombre, tipo: p.tipo, muestra: muestra.motivo, voces_usadas: suyas.length, fuentes_faltantes: faltantes }
    if (!muestra.alcanza) {
      if (cortado) r.cortes.push(`${p.nombre}: ${cortado}`)
      r.publicos.push({ ...base, estado: cortado ? 'cortado_por_tope' : 'muestra_insuficiente', ...(cortado ? { detalle: cortado } : {}) })
      continue
    }
    // 5 · redactar con la muestra, también dentro del tope
    const reserva = presupuesto.reservar(TOPE_DEL_REDACTOR_USD)
    if (!reserva.ok) { r.cortes.push(`${p.nombre}: ${reserva.motivo}`); r.publicos.push({ ...base, estado: 'cortado_por_tope', detalle: reserva.motivo }); continue }
    r.llamadas_al_redactor++
    const red = await deps.redactar(tareaDelPerfil({ publico: p, rubro: ficha.rubro, plaza: ficha.plaza, pais: ficha.pais, voces: suyas, idioma: ficha.idioma, trato: ficha.trato }), TOPE_DEL_REDACTOR_USD, p)
      .catch((x): ResultadoDelRedactor => ({ ok: false, error: String(x).slice(0, 200), costo_usd: null }))
    presupuesto.liquidar(TOPE_DEL_REDACTOR_USD, red.costo_usd)
    if (!red.ok) { r.publicos.push({ ...base, estado: 'redactor_fallo', detalle: red.error }); continue }
    const f = filtrarPerfil(red.salida, suyas, p.nombre)
    for (const v of suyas) if (v.fuente.startsWith('cerebro:')) delCerebro.add(v.id.toLowerCase())
    f.citas.filter((c) => delCerebro.has(c)).forEach((c) => citasDeFichas.add(c))
    textos.push(`# Público: ${p.nombre}\n${f.texto}${faltantes.length ? `\n\n(fuente faltante: ${faltantes.join(', ')} · el Servicio de Apify no la tiene)` : ''}`)
    r.publicos.push({ ...base, estado: 'redactado', lineas_validas: f.lineas_validas, descartadas: f.descartadas.length, secciones_sin_dato: f.secciones_sin_dato })
  }

  if (e.dry_run) return cerrar('ensayo', 'ensayo: se leyó lo que ya hay y se armó el plan · nada se raspó, redactó ni archivó · US$ 0')

  // 6 · archivar por la puerta de informes (el portero exige ≥ 1 cita a una ficha del cerebro)
  if (textos.length) {
    const ahora = (e.ahora ?? (() => new Date()))()
    const cuerpo: CuerpoDelPerfil = {
      client_id: e.client_id, tipo: TIPO_DEL_INFORME, texto: textos.join('\n\n'), citas: [...citasDeFichas], fecha_de_corte: ahora.toISOString(),
      pedido_por: { oficina: OFICINA, agente: AGENTE }, dry_run: false, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id,
    }
    r.archivado = cuerpo.citas.length
      ? await deps.archivar(cuerpo).catch((x) => ({ ok: false, detalle: String(x).slice(0, 200) }))
      : { ok: false, detalle: 'no se archivó: el perfil no cita ninguna ficha del cerebro (la puerta de informes exige al menos una)' }
  }
  const hechos = r.publicos.filter((p) => p.estado === 'redactado').length
  return cerrar('hecho', `${hechos} de ${publicos.length} público(s) con perfil`)
}
