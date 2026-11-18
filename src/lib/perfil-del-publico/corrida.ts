/**
 * PERFIL DEL PÚBLICO · el CONDUCTOR de una corrida (un cliente, todos sus públicos) · T1.
 * Todo lo que toca base, red o modelo entra como dependencia: la puerta HTTP lo cablea y las pruebas lo sabotean a US$ 0.
 *
 * 18-nov · firma de Emilio (00:56 Zúrich · DECISION-EMILIO-el-portero-junta-el-especialista-analiza): el perfil NO RASPA.
 * El único que raspa es el portero del cerebro; el analista LEE la voz del público por la consulta del cerebro y escribe el informe.
 * Lo que el cerebro todavía no tiene para un público se declara «fuente faltante»; nunca se busca afuera.
 *
 * El orden es la garantía (lo que CC6 mide):
 *   1. en corrida real, la PALANCA (apagada por omisión) y que el redactor exista y esté activo, ANTES de leer nada.
 *   2. la voz del público: SOLO lo que el cerebro ya juntó (su consulta, a US$ 0). Cada voz pasa por la red propia y por el filtro de
 *      seguridad existente; la apartada no llega al redactor.
 *   3. sin muestra mínima no se redacta, y se declara qué fuente falta.
 *   4. cada llamada al redactor reserva su máximo en el tope ANTES de salir: el tope corta a mitad de la corrida.
 *   5. lo que devuelve el redactor pasa por `filtrarPerfil`: ninguna frase sin fuente de este cliente.
 *   6. se archiva por la puerta de informes del cerebro (uno vigente por cliente; el anterior queda retirado). En ensayo no se redacta
 *      ni se archiva nada: se devuelve qué hay y qué falta.
 */
import {
  AGENTE, crearPresupuesto, filtrarPerfil, fuentesFaltantes, OFICINA, vocesDelTipo, pareceUnaOrden, publicosDe, suficiencia, tareaDelPerfil, TIPO_DEL_INFORME,
  TOPE_DEL_REDACTOR_USD, TOPE_POR_CORRIDA_USD, type PublicoObjetivo, type VozConId,
} from './perfil'

export const RUTA = '/api/perfil-del-publico'

export interface FichaDelCliente { readonly rubro: string | null; readonly plaza: string | null; readonly pais: string | null; readonly idioma: string | null; readonly trato: string | null }
export type ResultadoDelRedactor = { ok: true; salida: string; costo_usd: number | null } | { ok: false; error: string; costo_usd: number | null }

export interface DepsDeLaCorrida {
  leerPalanca(): Promise<{ encendida: boolean; motivo: string }>
  /** ¿el redactor existe y está activo en `agents`? (si no, no se lee ni se redacta nada) */
  empleadoListo(): Promise<{ ok: true } | { ok: false; motivo: string }>
  leerFicha(): Promise<FichaDelCliente | null>
  /** las filas del documento de público ideal de ESTE cliente */
  leerPublicos(): Promise<ReadonlyArray<Record<string, unknown>>>
  /** la voz del público que el CEREBRO ya juntó para ESTE cliente, por su consulta (fuente `cerebro:<clase>`, id = id de la ficha) · nunca raspa.
   *  `corte`: si no se leyó todo lo que hay, por qué (se declara; nunca es mudo) */
  leerVoces(): Promise<{ voces: ReadonlyArray<VozConId>; corte: string | null }>
  /** el filtro de seguridad que ya existe: true = pasa. Si lanza, la voz queda apartada (falla cerrado) */
  filtroDeSeguridad(texto: string): Promise<boolean>
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
  /** lo que el cerebro todavía no tiene para este público (se declara; no se busca afuera) */
  fuentes_faltantes: ReadonlyArray<string>; detalle?: string
}
export interface ResultadoDeLaCorrida {
  estado: 'apagado' | 'sin_empleado' | 'sin_publicos' | 'sin_ficha' | 'ensayo' | 'hecho'
  motivo: string
  llamadas_al_redactor: number; gasto_comprometido_usd: number; tope_usd: number
  voces_del_cerebro: number; voces_apartadas: number
  publicos: ResultadoPorPublico[]
  archivado?: { ok: boolean; detalle: string }
  cortes: string[]
}

/** la línea que el perfil escribe cuando al público le falta una fuente: el cerebro no la tiene todavía (no se rellena con otra) */
export const notaDeFuenteFaltante = (faltantes: ReadonlyArray<string>): string => `(fuente faltante: ${faltantes.join(', ')} · el cerebro todavía no la tiene)`

export async function correrPerfil(deps: DepsDeLaCorrida, e: EntradaDeLaCorrida): Promise<ResultadoDeLaCorrida> {
  const tope = typeof e.tope_usd === 'number' && e.tope_usd > 0 && e.tope_usd <= TOPE_POR_CORRIDA_USD ? e.tope_usd : TOPE_POR_CORRIDA_USD
  const presupuesto = crearPresupuesto(tope)
  const r: ResultadoDeLaCorrida = { estado: 'hecho', motivo: '', llamadas_al_redactor: 0, gasto_comprometido_usd: 0, tope_usd: tope, voces_del_cerebro: 0, voces_apartadas: 0, publicos: [], cortes: [] }
  const cerrar = (estado: ResultadoDeLaCorrida['estado'], motivo: string): ResultadoDeLaCorrida => ({ ...r, estado, motivo, gasto_comprometido_usd: Number(presupuesto.comprometido().toFixed(4)) })

  // 1 · palanca y redactor: ANTES de cualquier lectura
  if (!e.dry_run) {
    const palanca = await deps.leerPalanca().catch((x) => ({ encendida: false, motivo: `no se pudo leer la palanca (${String(x).slice(0, 120)}): se toma como apagada` }))
    if (!palanca.encendida) return cerrar('apagado', `${palanca.motivo} · US$ 0`)
    const empleado = await deps.empleadoListo().catch((x) => ({ ok: false as const, motivo: `no se pudo leer el registro de empleados (${String(x).slice(0, 120)})` }))
    if (!empleado.ok) return cerrar('sin_empleado', `${empleado.motivo} · no se leyó ni se redactó · US$ 0`)
  }

  const ficha = await deps.leerFicha()
  if (!ficha) return cerrar('sin_ficha', 'no existe la ficha del cliente · US$ 0')
  const { publicos, fuera } = publicosDe(await deps.leerPublicos())
  if (!publicos.length) return cerrar('sin_publicos', 'el cliente no tiene públicos en su documento de público ideal: no hay de quién hacer el perfil · US$ 0')
  if (fuera) r.cortes.push(`${fuera} público(s) de menor prioridad quedaron fuera (máximo ${publicos.length})`)

  // 2 · la voz del público que ya juntó el cerebro, pasada por la red propia y el filtro existente
  const pasa = async (texto: string): Promise<boolean> => { if (pareceUnaOrden(texto)) return false; try { return (await deps.filtroDeSeguridad(texto)) === true } catch { return false } }
  const voces: VozConId[] = []
  const lectura = await deps.leerVoces()
  if (lectura.corte) r.cortes.push(lectura.corte)
  for (const v of lectura.voces) { if (await pasa(v.texto)) voces.push(v); else r.voces_apartadas++ }
  r.voces_del_cerebro = voces.length
  const textos: string[] = []
  const citas = new Set<string>()

  for (const p of publicos) {
    const suyas = vocesDelTipo(voces, p.tipo)
    const muestra = suficiencia(suyas)
    const faltantes = fuentesFaltantes(p.tipo, suyas)
    const base = { publico: p.nombre, tipo: p.tipo, muestra: muestra.motivo, voces_usadas: suyas.length, fuentes_faltantes: faltantes }
    if (e.dry_run) { r.publicos.push({ ...base, estado: 'ensayo', detalle: 'ensayo: se leyó lo que el cerebro ya tiene · no se redactó ni se archivó · US$ 0' }); continue }
    // 3 · sin muestra no se redacta; lo que falta se declara (no se busca afuera)
    if (!muestra.alcanza) {
      if (faltantes.length) r.cortes.push(`${p.nombre}: ${notaDeFuenteFaltante(faltantes)}`)
      r.publicos.push({ ...base, estado: 'muestra_insuficiente' })
      continue
    }
    // 4 · redactar con la muestra, dentro del tope
    const reserva = presupuesto.reservar(TOPE_DEL_REDACTOR_USD)
    if (!reserva.ok) { r.cortes.push(`${p.nombre}: ${reserva.motivo}`); r.publicos.push({ ...base, estado: 'cortado_por_tope', detalle: reserva.motivo }); continue }
    r.llamadas_al_redactor++
    const red = await deps.redactar(tareaDelPerfil({ publico: p, rubro: ficha.rubro, plaza: ficha.plaza, pais: ficha.pais, voces: suyas, idioma: ficha.idioma, trato: ficha.trato }), TOPE_DEL_REDACTOR_USD, p)
      .catch((x): ResultadoDelRedactor => ({ ok: false, error: String(x).slice(0, 200), costo_usd: null }))
    presupuesto.liquidar(TOPE_DEL_REDACTOR_USD, red.costo_usd)
    if (!red.ok) { r.publicos.push({ ...base, estado: 'redactor_fallo', detalle: red.error }); continue }
    // 5 · ninguna frase sin fuente de este cliente
    const f = filtrarPerfil(red.salida, suyas, p.nombre)
    f.citas.forEach((c) => citas.add(c))
    textos.push(`# Público: ${p.nombre}\n${f.texto}${faltantes.length ? `\n\n${notaDeFuenteFaltante(faltantes)}` : ''}`)
    r.publicos.push({ ...base, estado: 'redactado', lineas_validas: f.lineas_validas, descartadas: f.descartadas.length, secciones_sin_dato: f.secciones_sin_dato })
  }

  if (e.dry_run) return cerrar('ensayo', 'ensayo: se leyó lo que el cerebro ya tiene · nada se redactó ni se archivó · US$ 0')

  // 6 · archivar por la puerta de informes (el portero exige ≥ 1 cita a una ficha del cerebro)
  if (textos.length) {
    const ahora = (e.ahora ?? (() => new Date()))()
    const cuerpo: CuerpoDelPerfil = {
      client_id: e.client_id, tipo: TIPO_DEL_INFORME, texto: textos.join('\n\n'), citas: [...citas], fecha_de_corte: ahora.toISOString(),
      pedido_por: { oficina: OFICINA, agente: AGENTE }, dry_run: false, workflow_id: e.workflow_id, workflow_execution_id: e.workflow_execution_id,
    }
    r.archivado = cuerpo.citas.length
      ? await deps.archivar(cuerpo).catch((x) => ({ ok: false, detalle: String(x).slice(0, 200) }))
      : { ok: false, detalle: 'no se archivó: el perfil no cita ninguna ficha del cerebro (la puerta de informes exige al menos una)' }
  }
  const hechos = r.publicos.filter((p) => p.estado === 'redactado').length
  return cerrar('hecho', `${hechos} de ${publicos.length} público(s) con perfil`)
}
