/**
 * /api/cadena/estrategia · /calendario · /validar (diseño v2 §2, §5, §9, §10.4).
 * `preparar` arma el cuerpo COMPLETO del `run-sdk` (tarea, esquema, tope, razonamiento, modelo, cabecera): el flujo n8n no duplica nada.
 * `guardar` valida con el código, hace UNA corrección si hace falta, y deja todo escrito con su reloj.
 */
import type { Almacen, Campana, ContextoDelCliente, Corrida } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { AGENTE_POR_PASO, CABECERA_SALTAR_EDITOR, DIAS_DE_CAMPANA, MAXIMO_DE_INTENTOS, modeloDeLaCadena, RAZONAMIENTO_POR_DEFECTO, SEMANAS_DE_PANORAMA, SEMANAS_DE_TANDA, topeDelPaso, type Paso } from './constantes'
import { planDeCorreccion, resolverTrasCorreccion } from './ciclo'
import { ESQUEMA_CALENDARIO_TANDA, ESQUEMA_ESTRATEGIA } from './esquemas'
import { expandirPatron, fusionarTanda } from './expandir-patron'
import { tareaDeCalendario, tareaDeEstrategia } from './indicaciones'
import { abrirEsperaDe, ponerNecesitaHumano, prepararCorrida, semanaDeId } from './nucleo'
import { validarEsquemaDeSalida } from '@/lib/salida-estructurada'
import { diasEntre, fechaDeFila } from './fechas'
import type { Ajuste, Estrategia, Fila, FormatosPorRed, Hallazgo, TandaAgente } from './tipos'
import { problemasDeEsquema, validarEstrategia } from './validador-estrategia'
import { validarTodo, type FechaEspecialVerificada, type InsumosCalendario } from './validador-calendario'

const TOTAL_SEMANAS = Math.ceil(DIAS_DE_CAMPANA / 7)
export const semanasDeTanda = (tanda: number): number[] => {
  const ini = (tanda - 1) * SEMANAS_DE_TANDA + 1
  return Array.from({ length: SEMANAS_DE_TANDA }, (_, i) => ini + i).filter((s) => s <= TOTAL_SEMANAS)
}
export const TOTAL_DE_TANDAS = Math.ceil(TOTAL_SEMANAS / SEMANAS_DE_TANDA)

const formatosPermitidos = (f: FormatosPorRed): Record<string, string[]> => Object.fromEntries(Object.entries(f).map(([r, fs]) => [r, fs.map((x) => x.formato)]))

interface Preparado {
  campana: Campana
  ctx: ContextoDelCliente
  formatos: FormatosPorRed
}
async function cargar(al: Almacen, cuerpo: Record<string, unknown>): Promise<{ ok: true; p: Preparado } | { ok: false; r: Respuesta }> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return { ok: false, r: err(400, 'E-CAMPOS', 'falta campana_id') }
  const campana = await al.campana(id)
  if (!campana) return { ok: false, r: err(404, 'E-CAMPANA', 'la campaña no existe') }
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return { ok: false, r: noAut }
  const cerrada = await compuerta(al, campana.client_id, campana.seco)
  if (cerrada) return { ok: false, r: cerrada }
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  if (!ctx) return { ok: false, r: err(409, 'E-CONTEXTO', 'no se pudo armar el contexto del cliente') }
  return { ok: true, p: { campana, ctx, formatos: await al.formatos() } }
}

export function cuerpoDeRunSdk(paso: Paso, modelo: string, tarea: string, esquema: Record<string, unknown>, clientId: string, extra: Record<string, unknown> = {}) {
  return {
    agent: AGENTE_POR_PASO[paso],
    task: tarea,
    client_id: clientId,
    output_schema: esquema,
    max_budget_usd: topeDelPaso(paso),
    thinking_mode: RAZONAMIENTO_POR_DEFECTO,
    model_override: modelo,
    extra,
  }
}

type Resultado = { success?: boolean; structured_output?: unknown; cost_usd?: number; error?: string; cerrada_por_tope?: boolean }
const leerResultado = (x: unknown): Resultado => (x && typeof x === 'object' ? (x as Resultado) : {})

/** Cierra la corrida según lo que volvió. Devuelve el objeto estructurado si la llamada sirvió. */
async function cerrarSegunResultado(al: Almacen, corrida: Corrida, r: Resultado): Promise<{ objeto: unknown | null; reintentar: boolean }> {
  const costo = typeof r.cost_usd === 'number' ? r.cost_usd : null
  const sirvio = r.success === true && r.structured_output !== undefined && r.structured_output !== null
  if (!sirvio) {
    await al.cerrarCorrida(corrida.id, { estado: r.cerrada_por_tope ? 'cerrada_por_tope' : 'fallida', costo_usd: costo, error: String(r.error ?? 'la llamada no entregó el objeto estructurado').slice(0, 400), plazo_en: null })
    return { objeto: null, reintentar: corrida.intento < MAXIMO_DE_INTENTOS }
  }
  await al.cerrarCorrida(corrida.id, { estado: 'ok', costo_usd: costo, plazo_en: null, error: null })
  return { objeto: r.structured_output, reintentar: false }
}

function respuestaDePreparar(res: Awaited<ReturnType<typeof prepararCorrida>>): Respuesta | null {
  if (res.tipo === 'ya_hecha') return { status: 200, cuerpo: { ya_hecha: true, corrida_id: res.corrida.id } }
  if (res.tipo === 'en_curso') return err(409, 'E-EN-CURSO', 'ya hay una llamada en curso para este paso (dentro de su plazo)', { corrida_id: res.corrida.id })
  return null
}

// ─────────────────────────────────────────────────────────────── ESTRATEGIA
export async function estrategiaPreparar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos } = c.p
  // una estrategia ya validada es «ya hecha» en cualquier estado de la campaña (repetir un sub-flujo no gasta ni falla)
  const ultima = await al.ultimaEstrategia(campana.id)
  if (ultima?.estado === 'validada') return { status: 200, cuerpo: { ya_hecha: true, version: ultima.version } }
  if (campana.estado !== 'abierta' && campana.estado !== 'estrategia') return err(409, 'E-ESTADO', `la campaña está ${campana.estado}: la estrategia solo se prepara con la campaña abierta o en estrategia`)
  const version = (ultima?.version ?? 0) + 1
  const fichas = Array.isArray((cuerpo.correccion as { fichas?: unknown } | undefined)?.fichas) ? ((cuerpo.correccion as { fichas: never[] }).fichas) : null
  const esquema = validarEsquemaDeSalida(ESQUEMA_ESTRATEGIA)
  if (!esquema.ok || !esquema.valor || !esquema.hash) return err(500, 'E-ESQUEMA', 'el esquema de la estrategia no es válido')
  const modelo = await modeloDeLaCadena(al)
  const prep = await prepararCorrida(al, campana, 'estrategia', `v${version}:c${fichas ? 1 : 0}`, cadena(cuerpo.workflow_id)!, cadena(cuerpo.workflow_execution_id)!, ahora, modelo, esquema.hash)
  const corto = respuestaDePreparar(prep)
  if (corto) return corto
  if (prep.tipo === 'intentos_agotados' || prep.tipo === 'presupuesto_agotado') {
    const motivo = prep.tipo === 'intentos_agotados' ? 'la estrategia agotó sus 3 intentos' : `el presupuesto de planificación se agotó (US$ ${prep.gastado.toFixed(2)} de ${prep.presupuesto})`
    const r = await ponerNecesitaHumano(al, campana, motivo, ahora)
    return { status: 409, cuerpo: { error: prep.tipo, necesita_humano: true, alerta: r.alerta } }
  }
  if (campana.estado === 'abierta') await al.actualizarCampana(campana.id, { estado: 'estrategia' })
  const tarea = tareaDeEstrategia({ ctx, formatosPermitidos: formatosPermitidos(formatos), version, correccion: fichas ?? undefined })
  return {
    status: 200,
    cuerpo: {
      corrida_id: prep.corrida.id, version, intento: prep.corrida.intento, plazo_en: prep.corrida.plazo_en,
      headers: { [CABECERA_SALTAR_EDITOR]: '1' },
      run_sdk: cuerpoDeRunSdk('estrategia', modelo, tarea, esquema.valor, campana.client_id, { contrato: 'estrategia.v1' }),
    },
  }
}

export async function estrategiaGuardar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos } = c.p
  const corridaId = Number(cuerpo.corrida_id)
  const corrida = (await al.corridasDeCampana(campana.id)).find((x) => x.id === corridaId && x.paso === 'estrategia')
  if (!corrida) return err(404, 'E-CORRIDA', 'la corrida no existe para esta campaña')
  if (corrida.estado !== 'en_curso') return { status: 200, cuerpo: { ya_guardada: true, estado: corrida.estado } }
  const esCorreccion = cuerpo.correccion === true
  const { objeto, reintentar } = await cerrarSegunResultado(al, corrida, leerResultado(cuerpo.resultado))
  if (objeto === null) {
    if (reintentar) return { status: 200, cuerpo: { reintentar: true } }
    const r = await ponerNecesitaHumano(al, campana, 'la llamada de la estrategia no entregó el objeto estructurado tras 3 intentos', ahora)
    return { status: 200, cuerpo: { necesita_humano: true, alerta: r.alerta } }
  }
  const version = ((await al.ultimaEstrategia(campana.id))?.version ?? 0) + 1
  const hs = validarEstrategia(objeto, { planTexto: ctx.planTexto, formatos })
  await al.guardarValidaciones(campana.id, 'estrategia', version, null, esCorreccion ? 2 : 1, hs, campana.seco)
  const plan = planDeCorreccion(hs)
  if (plan.necesita && !esCorreccion) return { status: 200, cuerpo: { correccion: true, modo: 'tanda', fichas: plan.fichas } }
  if (plan.necesita) {
    // la estrategia no tiene «filas que salen»: cualquier bloqueo tras la única corrección es de Emilio
    const r = await ponerNecesitaHumano(al, campana, `la estrategia sigue con ${plan.fichas.length} bloqueo(s) tras la única corrección: ${plan.fichas.map((f) => f.que).join(' | ').slice(0, 300)}`, ahora)
    return { status: 200, cuerpo: { necesita_humano: true, fichas: plan.fichas, alerta: r.alerta } }
  }
  await al.insertarEstrategia({ campana_id: campana.id, version, estado: 'validada', contenido: objeto as Estrategia, agente: AGENTE_POR_PASO.estrategia, modelo: corrida.modelo, costo_usd: leerResultado(cuerpo.resultado).cost_usd ?? null, workflow_execution_id: corrida.workflow_execution_id, seco: campana.seco })
  await al.actualizarCampana(campana.id, { estado: 'calendario' })
  // los tipos de fechas que ESTE cliente declaró (puede ser ninguno: lo normal) y los años de la campaña: el flujo investiga solo eso
  const anios = [...new Set([campana.fecha_inicio.slice(0, 4), campana.fecha_fin.slice(0, 4)].map(Number))]
  const fechasPedidas = ctx.pais ? (objeto as Estrategia).fechas_que_importan.flatMap((f) => anios.map((anio) => ({ pais: ctx.pais, tipo: f.tipo, ambito: f.ambito, anio }))) : []
  return { status: 200, cuerpo: { ok: true, version, fechas_pedidas: fechasPedidas, avisos: hs.filter((h) => h.severidad === 'aviso').map((h) => h.ficha.que) } }
}

// ─────────────────────────────────────────────────────────────── CALENDARIO
async function fechasDeclaradas(al: Almacen, ctx: ContextoDelCliente, e: Estrategia, c: Campana): Promise<FechaEspecialVerificada[]> {
  const tipos = [...new Set(e.fechas_que_importan.map((f) => f.tipo))]
  if (!tipos.length || !ctx.pais) return [] // la lista vacía no investiga ni bloquea nada
  return al.fechasEspeciales(ctx.pais, tipos, c.fecha_inicio, c.fecha_fin)
}

/** Slots del patrón que faltan en las filas de la tanda: en una corrección se leen como «omitidos» (no hay otra forma de saber qué omitió el primer intento). */
function omitidosImplicitos(e: Estrategia, semanas: number[], filas: Fila[]): Ajuste[] {
  const out: Ajuste[] = []
  for (const semana of semanas) for (const s of e.patron_semanal) {
    if (!filas.some((f) => f.semana === semana && f.id.endsWith(`-${s.slot}`) && f.estado !== 'esquema')) out.push({ semana, slot: s.slot, accion: 'omitir', motivo: 'omitido en el primer intento' })
  }
  return out
}

function insumosDe(c: Campana, ctx: ContextoDelCliente, e: Estrategia, formatos: FormatosPorRed, tanda: number, semanas: number[], filas: Fila[], previas: Fila[], ajustes: Ajuste[], fechas: FechaEspecialVerificada[], ahora: string): InsumosCalendario {
  return {
    campana: { fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, tanda, semanas }, estrategia: e, planTexto: ctx.planTexto, formatos, sedes: ctx.sedes,
    referencias: ctx.referencias, clientId: ctx.clientId, ahora: ahora.slice(0, 10), filas, filasPrevias: previas, ajustes, fechasEspeciales: fechas,
    forbiddenWords: ctx.forbiddenWords, conocidos: [ctx.nombreDelNegocio],
  }
}

export async function calendarioPreparar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos } = c.p
  const tanda = Number(cuerpo.tanda ?? 1)
  if (!Number.isInteger(tanda) || tanda < 1 || tanda > TOTAL_DE_TANDAS) return err(400, 'E-TANDA', `tanda debe ser un entero entre 1 y ${TOTAL_DE_TANDAS}`)
  if (campana.estado !== 'calendario' && campana.estado !== 'activa') return err(409, 'E-ESTADO', `la campaña está ${campana.estado}: el calendario solo se prepara con la estrategia validada`)
  const estr = await al.ultimaEstrategia(campana.id)
  if (!estr || estr.estado !== 'validada') return err(409, 'E-SIN-ESTRATEGIA', 'no hay una estrategia validada')
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const todas = await al.filas(campana.id, version)
  const delaTanda = todas.filter((f) => f.tanda === tanda && f.estado !== 'esquema')
  const correccion = cuerpo.correccion && typeof cuerpo.correccion === 'object' ? (cuerpo.correccion as { fichas?: never[]; fila_ids?: string[]; modo?: 'filas' | 'tanda' }) : null
  if (!correccion && delaTanda.length > 0 && delaTanda.every((f) => f.estado !== 'propuesta')) return { status: 200, cuerpo: { ya_hecha: true, tanda } }
  const semanas = semanasDeTanda(tanda)
  const esquema = validarEsquemaDeSalida(ESQUEMA_CALENDARIO_TANDA)
  if (!esquema.ok || !esquema.valor || !esquema.hash) return err(500, 'E-ESQUEMA', 'el esquema del calendario no es válido')
  const modelo = await modeloDeLaCadena(al)
  const prep = await prepararCorrida(al, campana, 'calendario', `t${tanda}:v${version}:c${correccion ? 1 : 0}`, cadena(cuerpo.workflow_id)!, cadena(cuerpo.workflow_execution_id)!, ahora, modelo, esquema.hash)
  const corto = respuestaDePreparar(prep)
  if (corto) return corto
  if (prep.tipo === 'intentos_agotados' || prep.tipo === 'presupuesto_agotado') {
    const motivo = prep.tipo === 'intentos_agotados' ? `la tanda ${tanda} agotó sus 3 intentos` : `el presupuesto de planificación se agotó (US$ ${prep.gastado.toFixed(2)} de ${prep.presupuesto})`
    const r = await ponerNecesitaHumano(al, campana, motivo, ahora)
    return { status: 409, cuerpo: { error: prep.tipo, necesita_humano: true, alerta: r.alerta } }
  }
  const filasMalas = correccion?.fila_ids?.length ? todas.filter((f) => correccion.fila_ids!.includes(f.id)) : []
  const tarea = tareaDeCalendario({
    ctx, estrategia: estr.contenido, tanda, semanas, filasPrevias: todas.filter((f) => f.tanda < tanda && f.estado !== 'esquema'),
    correccion: correccion ? { fichas: correccion.fichas ?? [], filas: filasMalas, modo: correccion.modo === 'filas' ? 'filas' : 'tanda' } : undefined,
  })
  return {
    status: 200,
    cuerpo: {
      corrida_id: prep.corrida.id, tanda, semanas, calendario_version: version, intento: prep.corrida.intento, plazo_en: prep.corrida.plazo_en,
      headers: { [CABECERA_SALTAR_EDITOR]: '1' },
      run_sdk: cuerpoDeRunSdk('calendario', modelo, tarea, esquema.valor, campana.client_id, { contrato: 'calendario_tanda.v1' }),
    },
  }
}

const esTanda = (x: unknown): x is TandaAgente => !!x && typeof x === 'object' && Array.isArray((x as TandaAgente).piezas) && Array.isArray((x as TandaAgente).ajustes_al_patron)

export async function calendarioGuardar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos } = c.p
  const tanda = Number(cuerpo.tanda ?? 1)
  const corrida = (await al.corridasDeCampana(campana.id)).find((x) => x.id === Number(cuerpo.corrida_id) && x.paso === 'calendario')
  if (!corrida) return err(404, 'E-CORRIDA', 'la corrida no existe para esta campaña')
  if (corrida.estado !== 'en_curso') return { status: 200, cuerpo: { ya_guardada: true, estado: corrida.estado } }
  const esCorreccion = cuerpo.correccion === true
  const modo = cuerpo.modo === 'filas' ? 'filas' : 'tanda'
  const { objeto, reintentar } = await cerrarSegunResultado(al, corrida, leerResultado(cuerpo.resultado))
  if (objeto === null || !esTanda(objeto)) {
    if (objeto !== null) await al.cerrarCorrida(corrida.id, { estado: 'fallida', error: 'el objeto no tiene la forma de una tanda' })
    if (reintentar || objeto !== null) return { status: 200, cuerpo: { reintentar: true } }
    const r = await ponerNecesitaHumano(al, campana, `la llamada del calendario (tanda ${tanda}) no entregó el objeto tras 3 intentos`, ahora)
    return { status: 200, cuerpo: { necesita_humano: true, alerta: r.alerta } }
  }
  const estr = (await al.ultimaEstrategia(campana.id))!.contenido
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const semanas = semanasDeTanda(tanda)
  const guardadas = (await al.filas(campana.id, version))
  const previas = guardadas.filter((f) => f.tanda < tanda && f.estado !== 'esquema')
  const fechas = await fechasDeclaradas(al, ctx, estr, campana)
  const esqNuevo = expandirPatron(estr, campana, semanas, tanda, formatos)
  const base = esCorreccion && modo === 'filas' ? guardadas.filter((f) => f.tanda === tanda && f.estado !== 'esquema') : esqNuevo
  let { filas } = fusionarTanda(base, objeto, estr, campana, tanda, formatos)
  const ajustes = esCorreccion ? [...(objeto.ajustes_al_patron ?? []), ...omitidosImplicitos(estr, semanas, filas)] : objeto.ajustes_al_patron ?? []
  let hs: Hallazgo[] = validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, ajustes, fechas, ahora))
  await al.guardarValidaciones(campana.id, 'calendario', version, tanda, esCorreccion ? 2 : 1, hs, campana.seco)
  const plan = planDeCorreccion(hs)

  if (plan.necesita && !esCorreccion) {
    await al.guardarFilas(campana.id, version, 1, filas, campana.seco) // quedan `propuesta`: la corrección parchea sobre ellas
    return { status: 200, cuerpo: { correccion: true, modo: plan.modo, fila_ids: plan.filaIds, fichas: plan.fichas } }
  }
  const salen: string[] = []
  if (plan.necesita) {
    const res = resolverTrasCorreccion(hs, semanaDeId)
    if (res.estado === 'necesita_humano') {
      await al.guardarFilas(campana.id, version, 1, filas, campana.seco)
      const r = await ponerNecesitaHumano(al, campana, `la tanda ${tanda} sigue con bloqueos tras la única corrección: ${res.fichasPendientes.map((f) => f.que).join(' | ').slice(0, 300)}`, ahora)
      return { status: 200, cuerpo: { necesita_humano: true, fichas: res.fichasPendientes, alerta: r.alerta } }
    }
    // dato sin fuente: la FILA sale (nunca se le pregunta a nadie del cliente) y se vuelve a validar con el slot anotado como omitido
    salen.push(...res.filasQueSalen)
    filas = filas.map((f) => (salen.includes(f.id) ? { ...f, estado: 'descartada_sin_fuente' as const } : f))
    hs = validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, [...ajustes, ...res.ajustes], fechas, ahora))
    await al.guardarValidaciones(campana.id, 'calendario', version, tanda, 2, hs, campana.seco)
    if (hs.some((h) => h.severidad === 'bloquea')) {
      await al.guardarFilas(campana.id, version, 1, filas, campana.seco)
      const r = await ponerNecesitaHumano(al, campana, `la tanda ${tanda} sigue con bloqueos tras sacar las filas sin fuente`, ahora)
      return { status: 200, cuerpo: { necesita_humano: true, fichas: hs.filter((h) => h.severidad === 'bloquea').map((h) => h.ficha), alerta: r.alerta } }
    }
  }
  // estado final de cada fila: validada | en_investigacion (dato pendiente o sin horario, con su reloj) | espera_video (con su reloj) | descartada_sin_fuente
  const enInvestigacion = new Set(hs.filter((h) => h.severidad === 'aviso' && (h.chequeo === 'V14' || h.chequeo === 'V06') && h.fila_id).map((h) => h.fila_id as string))
  const finales: Fila[] = filas.map((f) => {
    if (f.estado === 'descartada_sin_fuente' || f.estado === 'espera_video') return f
    return { ...f, estado: enInvestigacion.has(f.id) ? 'en_investigacion' : 'validada', avisos: hs.filter((h) => h.fila_id === f.id && h.severidad === 'aviso').map((h) => h.ficha.que) }
  })
  const todas12 = tanda === 1 ? expandirPatron(estr, campana, Array.from({ length: SEMANAS_DE_PANORAMA }, (_, i) => i + 1).filter((s) => !semanas.includes(s)), 0, formatos).map((f) => ({ ...f, tanda: Math.ceil(f.semana / SEMANAS_DE_TANDA) })) : []
  await al.guardarFilas(campana.id, version, 1, [...finales, ...todas12], campana.seco)
  for (const f of finales) {
    if (f.estado === 'espera_video') {
      const lead = (formatos[f.red] ?? []).find((x) => x.formato === f.formato)?.lead_dias ?? 5
      await abrirEsperaDe(al, campana, 'espera_video', f.id, 'espera al brazo de video', ahora, { fechaPieza: f.fecha, leadDiasVideo: lead })
    } else if (f.estado === 'en_investigacion') await abrirEsperaDe(al, campana, 'dato_en_investigacion', f.id, 'un dato de la fila se investiga con fuente', ahora)
  }
  if (campana.estado === 'calendario') await al.actualizarCampana(campana.id, { estado: 'activa' })
  const cuenta = (e: Fila['estado']) => finales.filter((f) => f.estado === e).length
  return { status: 200, cuerpo: { ok: true, tanda, filas: finales.length, validadas: cuenta('validada'), en_investigacion: cuenta('en_investigacion'), espera_video: cuenta('espera_video'), salieron_sin_fuente: salen, panorama_semanas: todas12.length ? SEMANAS_DE_PANORAMA : 0, avisos: hs.filter((h) => h.severidad === 'aviso').length } }
}

// ─────────────────────────────────────────────────────────────── VALIDAR (sin escribir nada)
export async function validarSinEscribir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos } = c.p
  if (cuerpo.tipo === 'estrategia') {
    const hs = validarEstrategia(cuerpo.estrategia, { planTexto: ctx.planTexto, formatos })
    return { status: 200, cuerpo: { hallazgos: hs, bloquea: hs.some((h) => h.severidad === 'bloquea'), forma_valida: problemasDeEsquema(cuerpo.estrategia).length === 0 } }
  }
  if (cuerpo.tipo === 'calendario') {
    const estr = (await al.ultimaEstrategia(campana.id))?.contenido
    if (!estr) return err(409, 'E-SIN-ESTRATEGIA', 'no hay una estrategia guardada')
    if (!esTanda(cuerpo.tanda_agente)) return err(400, 'E-TANDA', 'tanda_agente debe traer piezas y ajustes_al_patron')
    const tanda = Number(cuerpo.tanda ?? 1)
    const semanas = semanasDeTanda(tanda)
    const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
    const previas = (await al.filas(campana.id, version)).filter((f) => f.tanda < tanda && f.estado !== 'esquema')
    const { filas } = fusionarTanda(expandirPatron(estr, campana, semanas, tanda, formatos), cuerpo.tanda_agente, estr, campana, tanda, formatos)
    const hs = validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, cuerpo.tanda_agente.ajustes_al_patron, await fechasDeclaradas(al, ctx, estr, campana), ahora))
    return { status: 200, cuerpo: { hallazgos: hs, bloquea: hs.some((h) => h.severidad === 'bloquea') } }
  }
  return err(400, 'E-TIPO', 'tipo debe ser estrategia o calendario')
}


/**
 * ¿Toca abrir otra tanda? Cuando faltan ≤ 14 días para que termine la última materializada (calendario rodante, diseño v2 §6).
 * Devuelve `{ tanda }` o `{ tanda: null, motivo }`.
 */
export async function calendarioSiguiente(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  if (c.estado !== 'activa') return { status: 200, cuerpo: { tanda: null, motivo: `la campaña está ${c.estado}` } }
  const version = Math.max(1, await al.ultimaVersionDeCalendario(id))
  const hechas = (await al.filas(id, version)).filter((f) => f.estado !== 'esquema')
  const ultima = hechas.reduce((m, f) => Math.max(m, f.tanda), 0)
  if (ultima === 0) return { status: 200, cuerpo: { tanda: null, motivo: 'todavía no hay una primera tanda' } }
  if (ultima >= TOTAL_DE_TANDAS) return { status: 200, cuerpo: { tanda: null, motivo: 'ya están todas las tandas' } }
  const finDeLaTanda = fechaDeFila(c.fecha_inicio, semanasDeTanda(ultima).slice(-1)[0], 7)
  const hoy = (cadena(cuerpo.hoy) ?? ahora).slice(0, 10)
  const faltan = diasEntre(hoy, finDeLaTanda)
  if (faltan > 14) return { status: 200, cuerpo: { tanda: null, motivo: `faltan ${faltan} días para que termine la tanda ${ultima} (se abre a los 14)` } }
  return { status: 200, cuerpo: { tanda: ultima + 1, faltan_dias: faltan } }
}
