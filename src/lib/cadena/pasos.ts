/**
 * /api/cadena/estrategia · /calendario · /validar (diseño v2 §2, §5, §9, §10.4).
 * `preparar` arma el cuerpo COMPLETO del `run-sdk` (tarea, esquema, tope, razonamiento, modelo, cabecera): el flujo n8n no duplica nada.
 * `guardar` valida con el código, hace UNA corrección si hace falta, y deja todo escrito con su reloj.
 */
import type { Almacen, Campana, ContextoDelCliente, Corrida, EsperaFila } from './almacen'
import { activarYArrancar, type ResultadoDelArranque } from './arranque'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { AGENTE_POR_PASO, CABECERA_SALTAR_EDITOR, MAXIMO_DE_INTENTOS, modeloDeLaCadena, RAZONAMIENTO_POR_DEFECTO, medidaDeCampana, SEMANAS_DE_PANORAMA, TOTAL_DE_TANDAS, topeDelPaso, type MedidaDeCampana, type Paso } from './constantes'
import { bajarFaltantesDeCantidad, leerV08, sinFaltantesSiCorrige } from './cantidad'
import { planDeCorreccion, resolverTrasCorreccion, slotDe } from './ciclo'
import { ESQUEMA_CALENDARIO_TANDA, ESQUEMA_CALENDARIO_TANDA_V2, ESQUEMA_ESTRATEGIA } from './esquemas'
import { conceptoParaElCalendario, empujarDesdeElTablero, EN_REVISION_DE_REGISTRO, etapaDeReentrada, nuevoOrdenEncendido, origenesDelCliente, recibirVueltaDeRegistro, siguienteDespuesDe, tramoDeReemision } from './mesas'
import { abrirRegistro, avisoDePistas, avisosDeLaSalida, esperaDeRegistroViva, filasConTema, leerArtifactIdDeRegistro, leerObjetoDeRegistro, objetoDeRegistro, pistasDeRegistro, registroFijado, seRevisaElRegistro, temasDeLaVuelta, textoDelCalendario, textoDeLaVuelta, type RegistroFijado } from './registro-en-jefatura'
import { esNotaDeIdea, expandirPatron, fusionarTanda } from './expandir-patron'
import { hoyEnZona } from './campanas'
import { fueraDePlazoDeProduccion } from './lotes'
import { esNotaDeDependencias, resolverDependencias } from './resolver-dependencias'
import { tareaDeCalendario, tareaDeEstrategia } from './indicaciones'
import { metodoDeCalendario } from './metodos'
import { abrirEsperaDe, ponerNecesitaHumano, prepararCorrida, resolverEsperas, semanaDeId } from './nucleo'
import { validarEsquemaDeSalida } from '@/lib/salida-estructurada'
import { diasEntre, fechaDeFila } from './fechas'
import { diaUnoDelPlan } from './fechas-en-texto'
import type { Ajuste, Estrategia, Fila, FormatosPorRed, Hallazgo, TandaAgente } from './tipos'
import { type LexicoAfirmaciones } from './afirmaciones'
import { lexicoDelCliente } from './lexico-por-rubro'
import { problemasDeEsquema, normalizarPilares, validarEstrategia } from './validador-estrategia'
import { validarTodo, type FechaEspecialVerificada, type InsumosCalendario } from './validador-calendario'
import { fechasPedidasDe, retencionDe, retenerParaRevision, TIPO_DE_ESPERA as TIPO_DE_ESPERA_DE_JEFATURA } from './revision-jefatura'
import { guardarTemporadas, llaveCrudaDe } from './fechas-del-cliente'

export const semanasDeTanda = (tanda: number, m: MedidaDeCampana = medidaDeCampana()): number[] => {
  const ini = (tanda - 1) * m.semanasPorTanda + 1
  return Array.from({ length: m.semanasPorTanda }, (_, i) => ini + i).filter((s) => s <= m.totalSemanas)
}
export { TOTAL_DE_TANDAS }

const formatosPermitidos = (f: FormatosPorRed): Record<string, string[]> => Object.fromEntries(Object.entries(f).map(([r, fs]) => [r, fs.map((x) => x.formato)]))

interface Preparado {
  campana: Campana
  ctx: ContextoDelCliente
  formatos: FormatosPorRed
  /** léxico de afirmaciones: dato de `cadena_config.lexico_afirmaciones` (D3), sin publicar para cambiarlo */
  lexico: LexicoAfirmaciones
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
  return { ok: true, p: { campana, ctx, formatos: await al.formatos(), lexico: lexicoDelCliente(ctx.industria, await al.leerConfig('lexico_afirmaciones')) } }
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
  const prep = await prepararCorrida(al, campana, 'estrategia', `v${version}:c${fichas ? 1 : 0}`, cadena(cuerpo.workflow_id)!, cadena(cuerpo.workflow_execution_id)!, ahora, modelo, esquema.hash, async () => (await al.ultimaEstrategia(campana.id))?.estado === 'validada')
  const corto = respuestaDePreparar(prep)
  if (corto) return corto
  if (prep.tipo === 'intentos_agotados' || prep.tipo === 'presupuesto_agotado') {
    const motivo = prep.tipo === 'intentos_agotados' ? 'la estrategia agotó sus 3 intentos' : `el presupuesto de planificación se agotó (US$ ${prep.gastado.toFixed(2)} de ${prep.presupuesto})`
    const r = await ponerNecesitaHumano(al, campana, motivo, ahora)
    return { status: 409, cuerpo: { error: prep.tipo, necesita_humano: true, alerta: r.alerta } }
  }
  if (campana.estado === 'abierta') await al.actualizarCampana(campana.id, { estado: 'estrategia' })
  const llavesDeFechas = ctx.pais ? await al.llavesDeFechas(ctx.pais, campana.client_id) : []
  const tarea = tareaDeEstrategia({ ctx, formatosPermitidos: formatosPermitidos(formatos), version, diasDeCampana: medidaDeCampana(campana).dias, fechaInicio: campana.fecha_inicio, fechaFin: campana.fecha_fin, diaUnoDelPlan: diaUnoDelPlan(ctx.planTexto), correccion: fichas ?? undefined, llavesDeFechas })
  return {
    status: 200,
    cuerpo: {
      corrida_id: prep.corrida.id, version, intento: prep.corrida.intento, plazo_en: prep.corrida.plazo_en,
      headers: { [CABECERA_SALTAR_EDITOR]: '1' },
      run_sdk: cuerpoDeRunSdk('estrategia', modelo, tarea, esquema.valor, campana.client_id, { contrato: 'estrategia.v2' }),
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
  const { estrategia: objetoAjustado, aviso: avisoDePilares } = normalizarPilares(objeto)
  // D · la misma lista de llaves que vio el agente (se relee: lo que se guardó entre preparar y guardar también vale)
  const llavesDeFechas = ctx.pais ? await al.llavesDeFechas(ctx.pais, campana.client_id) : []
  const hs = [...(avisoDePilares ? [avisoDePilares] : []), ...validarEstrategia(objetoAjustado, { planTexto: ctx.planTexto, formatos, diasCampana: medidaDeCampana(campana).dias, fechaInicio: campana.fecha_inicio, llavesDeFechas })]
  await al.guardarValidaciones(campana.id, 'estrategia', version, null, esCorreccion ? 2 : 1, hs, campana.seco)
  const plan = planDeCorreccion(hs)
  if (plan.necesita && !esCorreccion) return { status: 200, cuerpo: { correccion: true, modo: 'tanda', fichas: plan.fichas } }
  if (plan.necesita) {
    // la estrategia no tiene «filas que salen»: cualquier bloqueo tras la única corrección es de Emilio
    const r = await ponerNecesitaHumano(al, campana, `la estrategia sigue con ${plan.fichas.length} bloqueo(s) tras la única corrección: ${plan.fichas.map((f) => f.que).join(' | ').slice(0, 300)}`, ahora)
    return { status: 200, cuerpo: { necesita_humano: true, fichas: plan.fichas, alerta: r.alerta } }
  }
  await al.insertarEstrategia({ campana_id: campana.id, version, estado: 'validada', contenido: objetoAjustado as Estrategia, agente: AGENTE_POR_PASO.estrategia, modelo: corrida.modelo, costo_usd: leerResultado(cuerpo.resultado).cost_usd ?? null, workflow_execution_id: corrida.workflow_execution_id, seco: campana.seco })
  // C · las temporadas del negocio: con cita se guardan para ESTE cliente; sin cita, pendientes y pregunta al dueño (nunca una fecha inventada)
  const temporadas = await guardarTemporadas(al, campana, ctx, objetoAjustado as Estrategia, { workflow_id: cadena(cuerpo.workflow_id), workflow_execution_id: cadena(cuerpo.workflow_execution_id) ?? corrida.workflow_execution_id })
  const conTemporadas = temporadas.guardadas.length || temporadas.pendientes.length || temporadas.avisos.length ? { temporadas } : {}
  // J7 · el punto de espera «antes de pasar»: si la jefatura abriría una revisión de la estrategia, se guarda todo igual pero la campaña NO pasa a `calendario` hasta que la revisión cierre
  // (o venza la espera). Con la jefatura apagada `retener` es false y esto es BYTE A BYTE lo de siempre.
  const retencion = await retencionDe(al, 'estrategia', campana.client_id)
  if (retencion.retener) {
    const espera = await retenerParaRevision(al, campana, 'estrategia', version, ahora)
    return { status: 200, cuerpo: { ok: true, version, retenida_para_revision: { tipo: 'estrategia', version, objeto_id: espera.objeto_id, vence_en: espera.vence_en }, avisos: hs.filter((h) => h.severidad === 'aviso').map((h) => h.ficha.que), ...conTemporadas } }
  }
  await al.actualizarCampana(campana.id, { estado: 'calendario' })
  // los tipos de fechas que ESTE cliente declaró (puede ser ninguno: lo normal) y los años de la campaña: el flujo investiga solo eso
  const fechasPedidas = fechasPedidasDe(campana, ctx.pais, objeto as Estrategia)
  return { status: 200, cuerpo: { ok: true, version, fechas_pedidas: fechasPedidas, avisos: hs.filter((h) => h.severidad === 'aviso').map((h) => h.ficha.que), ...conTemporadas } }
}

// ─────────────────────────────────────────────────────────────── CALENDARIO
async function fechasDeclaradas(al: Almacen, ctx: ContextoDelCliente, e: Estrategia, c: Campana): Promise<FechaEspecialVerificada[]> {
  // la llave estable (10-nov · D): la que guardó el código, no la grafía de turno; las temporadas son SOLO de este cliente (C)
  const tipos = [...new Set(e.fechas_que_importan.map(llaveCrudaDe))]
  if (!tipos.length || !ctx.pais) return [] // la lista vacía no investiga ni bloquea nada
  return al.fechasEspeciales(ctx.pais, tipos, c.fecha_inicio, c.fecha_fin, c.client_id)
}

/** Slots del patrón que faltan en las filas de la tanda: en una corrección se leen como «omitidos» (no hay otra forma de saber qué omitió el primer intento). */
function omitidosImplicitos(e: Estrategia, semanas: number[], filas: Fila[]): Ajuste[] {
  const out: Ajuste[] = []
  for (const semana of semanas) for (const s of e.patron_semanal) {
    if (!filas.some((f) => f.semana === semana && f.id.endsWith(`-${s.slot}`) && f.estado !== 'esquema')) out.push({ semana, slot: s.slot, accion: 'omitir', motivo: 'omitido en el primer intento' })
  }
  return out
}

function insumosDe(c: Campana, ctx: ContextoDelCliente, e: Estrategia, formatos: FormatosPorRed, tanda: number, semanas: number[], filas: Fila[], previas: Fila[], ajustes: Ajuste[], fechas: FechaEspecialVerificada[], ahora: string, lexico?: LexicoAfirmaciones, registroSoloAviso = false): InsumosCalendario {
  return {
    campana: { fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, tanda, semanas }, estrategia: e, planTexto: ctx.planTexto, formatos, sedes: ctx.sedes,
    referencias: ctx.referencias, clientId: ctx.clientId, ahora: ahora.slice(0, 10), filas, filasPrevias: previas, ajustes, fechasEspeciales: fechas,
    forbiddenWords: ctx.forbiddenWords, palabrasDuras: ctx.palabrasDuras, conocidos: [ctx.nombreDelNegocio], lexico, registro: ctx.registro,
    // tramo 3 del revisor de registro: el campo SOLO existe con la revisión encendida (apagado = los mismos insumos de siempre)
    ...(registroSoloAviso ? { registroSoloAviso: true } : {}),
  }
}

export async function calendarioPreparar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos } = c.p
  const tanda = Number(cuerpo.tanda ?? 1)
  const totalDeTandas = medidaDeCampana(campana).totalTandas
  if (!Number.isInteger(tanda) || tanda < 1 || tanda > totalDeTandas) return err(400, 'E-TANDA', `tanda debe ser un entero entre 1 y ${totalDeTandas}`)
  if (campana.estado !== 'calendario' && campana.estado !== 'activa') return err(409, 'E-ESTADO', `la campaña está ${campana.estado}: el calendario solo se prepara con la estrategia validada`)
  const estr = await al.ultimaEstrategia(campana.id)
  if (!estr || estr.estado !== 'validada') return err(409, 'E-SIN-ESTRATEGIA', 'no hay una estrategia validada')
  // tramo 3 del revisor de registro: mientras la jefatura revisa el registro de esta tanda, el calendario NO se vuelve a pedir (ni corrección reconstruida ni gasto): la vuelta la cierra
  if (await esperaDeRegistroViva(al, campana.id, 'calendario', tanda)) return { status: 200, cuerpo: { accion: 'esperar_revision_de_registro', tanda, objeto_id: objetoDeRegistro('calendario', tanda) } }
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const todas = await al.filas(campana.id, version)
  const delaTanda = todas.filter((f) => f.tanda === tanda && f.estado !== 'esquema')
  let correccion = cuerpo.correccion && typeof cuerpo.correccion === 'object' ? (cuerpo.correccion as { fichas?: never[]; fila_ids?: string[]; modo?: 'filas' | 'tanda' }) : null
  // r74 · F3 · UNA TANDA GUARDADA PERO SIN VALIDAR (filas `propuesta`) es una corrección pendiente: si la llamada de corrección murió (vencida/fallida) y se reenvía el sobre SIN corrección,
  // antes la primera pasada (c0, ok) contestaba «ya hecha» y la campaña se quedaba en `calendario` con un éxito falso. Ahora se reconstruye la corrección con los hallazgos que bloquearon.
  if (!correccion && delaTanda.some((f) => f.estado === 'propuesta')) {
    const abiertos = await al.hallazgosQueBloquean(campana.id, tanda)
    correccion = { fichas: abiertos.map((h) => h.ficha) as never[], fila_ids: [...new Set(abiertos.map((h) => h.fila_id).filter((x): x is string => !!x))], modo: 'tanda' }
  }
  if (!correccion && delaTanda.length > 0 && delaTanda.every((f) => f.estado !== 'propuesta')) return { status: 200, cuerpo: { ya_hecha: true, tanda } }
  // 31-oct (nuevo orden · T3): con la palanca encendida la tanda ESPERA la gran idea aprobada (no es un fallo: el flujo vuelve a pasar); apagada, `mesa` es vacía y nada cambia
  const mesa = await conceptoParaElCalendario(al, campana)
  if (mesa.espera) return { status: 200, cuerpo: { accion: 'esperar_concepto', tanda, ...mesa.espera } }
  const semanas = semanasDeTanda(tanda, medidaDeCampana(campana))
  const esquema = validarEsquemaDeSalida(mesa.concepto ? ESQUEMA_CALENDARIO_TANDA_V2 : ESQUEMA_CALENDARIO_TANDA)
  if (!esquema.ok || !esquema.valor || !esquema.hash) return err(500, 'E-ESQUEMA', 'el esquema del calendario no es válido')
  const modelo = await modeloDeLaCadena(al)
  const prep = await prepararCorrida(al, campana, 'calendario', `t${tanda}:v${version}:c${correccion ? 1 : 0}`, cadena(cuerpo.workflow_id)!, cadena(cuerpo.workflow_execution_id)!, ahora, modelo, esquema.hash,
    async () => (await al.filas(campana.id, version)).some((f) => f.tanda === tanda && f.estado !== 'esquema'))
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
    concepto: mesa.concepto ? { leido: mesa.concepto, version: mesa.version ?? 0 } : undefined,
    fechasEspeciales: mesa.concepto ? await fechasDeclaradas(al, ctx, estr.contenido, campana) : undefined,
    // 31-oct (FIRMA de Emilio): el método de colocación como capa local, solo con la gran idea; `cadena_config.metodos.calendario` lo apaga o lo reemplaza
    metodo: mesa.concepto ? await metodoDeCalendario(al) : undefined,
  })
  return {
    status: 200,
    cuerpo: {
      corrida_id: prep.corrida.id, tanda, semanas, calendario_version: version, intento: prep.corrida.intento, plazo_en: prep.corrida.plazo_en,
      headers: { [CABECERA_SALTAR_EDITOR]: '1' },
      ...(mesa.concepto ? { concepto_version: mesa.version } : {}),
      run_sdk: cuerpoDeRunSdk('calendario', modelo, tarea, esquema.valor, campana.client_id, { contrato: mesa.concepto ? 'calendario_tanda.v2' : 'calendario_tanda.v1' }),
    },
  }
}

const esTanda = (x: unknown): x is TandaAgente => !!x && typeof x === 'object' && Array.isArray((x as TandaAgente).piezas) && Array.isArray((x as TandaAgente).ajustes_al_patron)

export async function calendarioGuardar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos, lexico } = c.p
  const tanda = Number(cuerpo.tanda ?? 1)
  const corrida = (await al.corridasDeCampana(campana.id)).find((x) => x.id === Number(cuerpo.corrida_id) && x.paso === 'calendario')
  if (!corrida) return err(404, 'E-CORRIDA', 'la corrida no existe para esta campaña')
  if (corrida.estado !== 'en_curso') return { status: 200, cuerpo: { ya_guardada: true, estado: corrida.estado } }
  // r74 · una corrida de CORRECCIÓN (clave `…:c1`) lo es aunque quien guarda no lo diga (el reenvío tras una llamada vencida pide la corrección por su cuenta)
  const esCorreccion = cuerpo.correccion === true || /:c1$/.test(corrida.clave_idempotencia)
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
  const semanas = semanasDeTanda(tanda, medidaDeCampana(campana))
  const guardadas = (await al.filas(campana.id, version))
  const previas = guardadas.filter((f) => f.tanda < tanda && f.estado !== 'esquema')
  const fechas = await fechasDeclaradas(al, ctx, estr, campana)
  const esqNuevo = expandirPatron(estr, campana, semanas, tanda, formatos)
  const base = esCorreccion && modo === 'filas' ? guardadas.filter((f) => f.tanda === tanda && f.estado !== 'esquema') : esqNuevo
  // las dependencias imposibles (misma fecha y hora, antecesora que sale después…) las arregla el código y las anota: nunca llegan a bloquear la campaña
  // 31-oct (T3): con la gran idea aprobada, las filas llevan `fase` e `idea_ref` (de la `idea_de_mesa` de cada pieza); sin palanca, byte a byte
  const mesa = await conceptoParaElCalendario(al, campana)
  let filas = resolverDependencias(fusionarTanda(base, objeto, estr, campana, tanda, formatos, mesa.concepto ? { banco: mesa.concepto.banco, fases: estr.fases } : null).filas, previas).filas
  const ajustes = esCorreccion ? [...(objeto.ajustes_al_patron ?? []), ...omitidosImplicitos(estr, semanas, filas)] : objeto.ajustes_al_patron ?? []
  // tramo 3 del revisor de registro: con la jefatura reteniendo `registro`, V15 AVISA las formas de otro registro y la tanda, si nada más bloquea, espera al revisor antes de cerrarse
  const revisaRegistro = await seRevisaElRegistro(al, campana, ctx)
  let hs: Hallazgo[] = sinFaltantesSiCorrige(esCorreccion, validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, ajustes, fechas, ahora, lexico, revisaRegistro)))
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
    hs = bajarFaltantesDeCantidad(validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, [...ajustes, ...res.ajustes], fechas, ahora, lexico, revisaRegistro)))
    await al.guardarValidaciones(campana.id, 'calendario', version, tanda, 2, hs, campana.seco)
    if (hs.some((h) => h.severidad === 'bloquea')) {
      await al.guardarFilas(campana.id, version, 1, filas, campana.seco)
      const r = await ponerNecesitaHumano(al, campana, `la tanda ${tanda} sigue con bloqueos tras sacar las filas sin fuente`, ahora)
      return { status: 200, cuerpo: { necesita_humano: true, fichas: hs.filter((h) => h.severidad === 'bloquea').map((h) => h.ficha), alerta: r.alerta } }
    }
  }
  if (revisaRegistro) return retenerTandaParaRegistro(al, ctx, { campana, formatos, estr, version, tanda, semanas, filas, hs, salen, ahora })
  return cerrarTanda(al, { campana, formatos, estr, version, tanda, semanas, filas, hs, salen, ahora })
}

/** Lo que sigue a una tanda ya validada: estado final de cada fila, esperas, panorama, y la campaña pasa a `activa` si era la primera. Lo usan el guardado y el reloj (retomar una campaña frenada solo por cantidades). */
export async function cerrarTanda(al: Almacen, p: { campana: Campana; formatos: FormatosPorRed; estr: Estrategia; version: number; tanda: number; semanas: number[]; filas: Fila[]; hs: Hallazgo[]; salen: string[]; ahora: string }): Promise<Respuesta> {
  const { campana, formatos, estr, version, tanda, semanas, filas, hs, salen, ahora } = p
  // estado final de cada fila: validada | en_investigacion (dato pendiente o sin horario, con su reloj) | espera_video (con su reloj) | descartada_sin_fuente
  const enInvestigacion = new Set(hs.filter((h) => h.severidad === 'aviso' && (h.chequeo === 'V14' || h.chequeo === 'V06') && h.fila_id).map((h) => h.fila_id as string))
  // GO de Lenovo 10-nov 14:59Z: lo que cae antes de hoy (zona del cliente) + el plazo de producción de su formato no se programa; queda `perdio_su_fecha` con la razón escrita
  const hoy = hoyEnZona(ahora, campana.zona_horaria)
  const finales: Fila[] = filas.map((f) => {
    if (f.estado === 'descartada_sin_fuente') return f
    const fuera = fueraDePlazoDeProduccion(f, hoy, formatos)
    if (fuera) return { ...f, estado: 'perdio_su_fecha', avisos: [...f.avisos.filter((a) => esNotaDeDependencias(a) || esNotaDeIdea(a)), fuera] }
    if (f.estado === 'espera_video') return f
    return { ...f, estado: enInvestigacion.has(f.id) ? 'en_investigacion' : 'validada', avisos: [...f.avisos.filter((a) => esNotaDeDependencias(a) || esNotaDeIdea(a)), ...hs.filter((h) => h.fila_id === f.id && h.severidad === 'aviso').map((h) => h.ficha.que)] }
  })
  const todas12 = tanda === 1 ? expandirPatron(estr, campana, Array.from({ length: SEMANAS_DE_PANORAMA }, (_, i) => i + 1).filter((s) => !semanas.includes(s)), 0, formatos).map((f) => ({ ...f, tanda: Math.ceil(f.semana / medidaDeCampana(campana).semanasPorTanda) })) : []
  await al.guardarFilas(campana.id, version, 1, [...finales, ...todas12], campana.seco)
  for (const f of finales) {
    if (f.estado === 'espera_video') {
      const lead = (formatos[f.red] ?? []).find((x) => x.formato === f.formato)?.lead_dias ?? 5
      await abrirEsperaDe(al, campana, 'espera_video', f.id, 'espera al brazo de video', ahora, { fechaPieza: f.fecha, leadDiasVideo: lead })
    } else if (f.estado === 'en_investigacion') await abrirEsperaDe(al, campana, 'dato_en_investigacion', f.id, 'un dato de la fila se investiga con fuente', ahora)
  }
  // J7 · lo mismo para el calendario: la PRIMERA tanda es la que mueve la campaña a `activa`; con la jefatura abriendo, se retiene hasta que cierre su revisión
  let retenida: { tipo: 'calendario'; tanda: number; objeto_id: string; vence_en: string } | null = null
  let arranque: ResultadoDelArranque | null = null
  if (campana.estado === 'calendario') {
    const retencion = await retencionDe(al, 'calendario', campana.client_id)
    if (retencion.retener) {
      const espera = await retenerParaRevision(al, campana, 'calendario', tanda, ahora)
      retenida = { tipo: 'calendario', tanda, objeto_id: espera.objeto_id, vence_en: espera.vence_en }
    } else arranque = (await activarYArrancar(al, campana, ahora)).arranque // 20-oct · parte 3: la campaña pasa a `activa` AQUÍ en el camino real; el arranque por evento tiene que salir de aquí también
  }
  const cuenta = (e: Fila['estado']) => finales.filter((f) => f.estado === e).length
  return { status: 200, cuerpo: { ok: true, tanda, filas: finales.length, validadas: cuenta('validada'), en_investigacion: cuenta('en_investigacion'), espera_video: cuenta('espera_video'), salieron_sin_fuente: salen, fuera_de_plazo: cuenta('perdio_su_fecha'), panorama_semanas: todas12.length ? SEMANAS_DE_PANORAMA : 0, avisos: hs.filter((h) => h.severidad === 'aviso').length, ...(retenida ? { retenida_para_revision: retenida } : {}), ...(arranque ? { arranque } : {}) } }
}

// ─────────────────────────────────────────────────────────────── VALIDAR (sin escribir nada)
export async function validarSinEscribir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo)
  if (!c.ok) return c.r
  const { campana, ctx, formatos, lexico } = c.p
  if (cuerpo.tipo === 'estrategia') {
    const ajustada = normalizarPilares(cuerpo.estrategia)
    const llavesDeFechas = ctx.pais ? await al.llavesDeFechas(ctx.pais, campana.client_id) : []
    const hs = [...(ajustada.aviso ? [ajustada.aviso] : []), ...validarEstrategia(ajustada.estrategia, { planTexto: ctx.planTexto, formatos, diasCampana: medidaDeCampana(campana).dias, fechaInicio: campana.fecha_inicio, llavesDeFechas })]
    return { status: 200, cuerpo: { hallazgos: hs, bloquea: hs.some((h) => h.severidad === 'bloquea'), forma_valida: problemasDeEsquema(cuerpo.estrategia).length === 0 } }
  }
  if (cuerpo.tipo === 'calendario') {
    const estr = (await al.ultimaEstrategia(campana.id))?.contenido
    if (!estr) return err(409, 'E-SIN-ESTRATEGIA', 'no hay una estrategia guardada')
    if (!esTanda(cuerpo.tanda_agente)) return err(400, 'E-TANDA', 'tanda_agente debe traer piezas y ajustes_al_patron')
    const tanda = Number(cuerpo.tanda ?? 1)
    const semanas = semanasDeTanda(tanda, medidaDeCampana(campana))
    const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
    const previas = (await al.filas(campana.id, version)).filter((f) => f.tanda < tanda && f.estado !== 'esquema')
    const filas = resolverDependencias(fusionarTanda(expandirPatron(estr, campana, semanas, tanda, formatos), cuerpo.tanda_agente, estr, campana, tanda, formatos).filas, previas).filas
    const hs = validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, cuerpo.tanda_agente.ajustes_al_patron, await fechasDeclaradas(al, ctx, estr, campana), ahora, lexico))
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
  // 31-oct (nuevo orden · respuesta a CC2): con la palanca el vigía también reemite ANTES de la primera tanda (la campaña en `calendario` esperando la gran idea) y la respuesta trae `etapa`
  // para la clave de idempotencia (`campana:tanda-N:<etapa>`); sin nada nuevo que hacer, `tanda: null` y silencio. Palanca apagada: byte a byte lo de hoy.
  const encendida = await nuevoOrdenEncendido(al, c.client_id)
  if (c.estado !== 'activa' && !(encendida && c.estado === 'calendario')) return { status: 200, cuerpo: { tanda: null, motivo: `la campaña está ${c.estado}` } }
  const version = Math.max(1, await al.ultimaVersionDeCalendario(id))
  const hechas = (await al.filas(id, version)).filter((f) => f.estado !== 'esquema')
  const ultima = hechas.reduce((m, f) => Math.max(m, f.tanda), 0)
  if (ultima === 0 && !encendida) return { status: 200, cuerpo: { tanda: null, motivo: 'todavía no hay una primera tanda' } }
  if (ultima >= medidaDeCampana(c).totalTandas) return { status: 200, cuerpo: { tanda: null, motivo: 'ya están todas las tandas' } }
  let faltan: number | null = null
  if (ultima > 0) {
    const finDeLaTanda = fechaDeFila(c.fecha_inicio, semanasDeTanda(ultima, medidaDeCampana(c)).slice(-1)[0], 7)
    const hoy = (cadena(cuerpo.hoy) ?? ahora).slice(0, 10)
    faltan = diasEntre(hoy, finDeLaTanda)
    if (faltan > 14) return { status: 200, cuerpo: { tanda: null, motivo: `faltan ${faltan} días para que termine la tanda ${ultima} (se abre a los 14)` } }
  }
  if (!encendida) return { status: 200, cuerpo: { tanda: ultima + 1, faltan_dias: faltan } }
  const etapa = await etapaDeReentrada(al, c)
  if (!etapa) return { status: 200, cuerpo: { tanda: null, motivo: `la tanda ${ultima + 1} espera a una mesa que trabaja o a la decisión de Emilio: nada que reemitir` } }
  // hueco 2 de CC3: el respaldo lleva un tramo de medio día en la etapa (clave nueva por pasada del vigía mientras haya algo que hacer); ver `tramoDeReemision`
  return { status: 200, cuerpo: { tanda: ultima + 1, etapa: `${etapa}:${tramoDeReemision(ahora)}`, ...(faltan === null ? {} : { faltan_dias: faltan }) } }
}

/**
 * 31-oct · el vigía retoma SOLO una campaña que quedó en `necesita_humano` únicamente por cantidades (V08 con real < meta).
 * No llama al modelo ni gasta: re-valida la tanda guardada con la regla nueva y, si ya no queda ningún bloqueo, la cierra por el mismo camino del guardado
 * (filas a `validada` / `en_investigacion`, esperas, panorama, y `activa` si era la primera tanda). Ante cualquier duda NO toca nada: sigue esperando a una persona.
 */
export async function retomarPorCantidades(al: Almacen, campana: Campana, ahora: string): Promise<{ retomada: boolean; motivo: string }> {
  const no = (motivo: string) => ({ retomada: false, motivo })
  if (campana.estado !== 'necesita_humano') return no('no está en necesita_humano')
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const todas = await al.filas(campana.id, version)
  const pendientes = todas.filter((f) => f.estado === 'propuesta')
  if (!pendientes.length) return no('no hay una tanda propuesta esperando')
  const tanda = Math.min(...pendientes.map((f) => f.tanda))
  const bloqueos = await al.hallazgosQueBloquean(campana.id, tanda)
  // lo guardado por la regla VIEJA: V08 de cantidad faltante y V14 de fila (el léxico, que hoy ya no bloquea). Quien decide es la re-validación de abajo: si queda cualquier bloqueo, no se retoma.
  const soloCantidad = bloqueos.length > 0 && bloqueos.every((b) => { if (b.fila_id !== null) return b.chequeo === 'V14'; return !!leerV08(b.ficha.que) })
  if (!soloCantidad) return no('los bloqueos guardados no son solo de cantidad')
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const estr = (await al.ultimaEstrategia(campana.id))?.contenido
  if (!ctx || !estr) return no('falta el contexto o la estrategia')
  const formatos = await al.formatos()
  const lexico = lexicoDelCliente(ctx.industria, await al.leerConfig('lexico_afirmaciones'))
  const semanas = semanasDeTanda(tanda, medidaDeCampana(campana))
  const previas = todas.filter((f) => f.tanda < tanda && f.estado !== 'esquema')
  const filas = todas.filter((f) => f.tanda === tanda && f.estado !== 'esquema')
  const salen = filas.filter((f) => f.estado === 'descartada_sin_fuente').map((f) => f.id)
  const ajustes: Ajuste[] = [...omitidosImplicitos(estr, semanas, filas), ...salen.map((id) => ({ semana: semanaDeId(id), slot: slotDe(id), accion: 'omitir' as const, motivo: 'la fila salió: dato sin fuente tras la corrección' }))]
  const hs = bajarFaltantesDeCantidad(validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, filas, previas, ajustes, await fechasDeclaradas(al, ctx, estr, campana), ahora, lexico)))
  if (hs.some((h) => h.severidad === 'bloquea')) return no('al re-validar queda algún bloqueo que no es de cantidad')
  await al.guardarValidaciones(campana.id, 'calendario', version, tanda, 2, hs, campana.seco)
  await resolverEsperas(al, campana.id, 'necesita_humano')
  const n = await al.actualizarCampana(campana.id, { estado: tanda === 1 ? 'calendario' : 'activa', estado_motivo: 'retomada sola: solo faltaban cantidades (viajan como aviso al brief)' })
  await cerrarTanda(al, { campana: n, formatos, estr, version, tanda, semanas, filas, hs, salen, ahora })
  return { retomada: true, motivo: `tanda ${tanda} retomada` }
}

// ───────────────────────────────────────────────────────── tramo 3 del revisor de registro · EL CALENDARIO (10-nov · GO de Lenovo 22:20Z) · ver `registro-en-jefatura.ts`
/**
 * Con la jefatura reteniendo `registro` para el cliente y su registro fijado, la tanda YA validada (V15 de registro como aviso; todo lo demás bloquea igual que siempre) no se cierra:
 * sus filas quedan como están (`propuesta` · `espera_video` · `descartada_sin_fuente`), se abre la espera `revision_jefatura` (objeto `registro:calendario:t<n>`) y UNA revisión de registro
 * con el calendario como documento (una línea por fila, con su cabecera fija). La vuelta corrige POR FILA: el tema de cada fila sale del texto corregido entre su cabecera y la siguiente.
 *   · una fila cuyo tema corregido rompe un chequeo que antes no rompía se queda con su tema anterior, con aviso (línea 2 de CC7, por fila);
 *   · si aun así la tanda corregida rompe algo que la original no rompía (una fila que afecta a otra, un chequeo de la tanda), se quedan TODOS los temas de antes, con aviso;
 *   · un texto que no se puede leer fila por fila (una cabecera tocada, repetida o fuera de orden) deja todos los temas de antes: nunca se adivina a qué fila va un pedazo;
 *   · no abre · error · vence: la tanda se cierra con sus temas y las pistas como aviso (nunca de rehén).
 * Apagado (sin retener, sin puerto o sin registro fijado) = byte a byte con hoy: V15 bloquea y la tanda se cierra en el mismo paso.
 */
type CierreDeTanda = Parameters<typeof cerrarTanda>[1]
/** los estados de una tanda guardada que todavía no se cerró (cerrarTanda los lleva a validada · en_investigacion · perdio_su_fecha) */
const ESTADOS_SIN_CERRAR: ReadonlySet<Fila['estado']> = new Set(['propuesta', 'espera_video', 'descartada_sin_fuente'])

const avisoDeFila = (filaId: string, que: string): Hallazgo => ({
  chequeo: 'V15', severidad: 'aviso', fila_id: filaId, alcance: 'fila',
  ficha: { que, donde: `fila ${filaId}`, contra_que: 'registro del cliente (fijado por su manual o su país)', gravedad: 'aviso', propuesta: 'revisar el registro de este tema' },
})
/** el aviso por fila cuando la revisión no corrió: solo en las filas donde el detector ve formas de otro registro */
const avisosSinRevision = (filas: Fila[], reg: RegistroFijado, motivo: string): Hallazgo[] =>
  filasConTema(filas).flatMap((f) => avisoDePistas(pistasDeRegistro(reg, f.tema ?? ''), motivo).map((a) => avisoDeFila(f.id, a)))

async function retenerTandaParaRegistro(al: Almacen, ctx: ContextoDelCliente, p: CierreDeTanda): Promise<Respuesta> {
  const { campana, version, tanda, filas, ahora } = p
  const texto = textoDelCalendario(filas.filter((f) => f.tanda === tanda))
  if (!texto) return cerrarTanda(al, p)
  const reg = registroFijado(ctx)!
  await al.guardarFilas(campana.id, version, 1, filas, campana.seco) // quedan sin cerrar: la vuelta (o el reloj) las cierra
  const { r } = await abrirRegistro(al, { doc: 'calendario', campana, version: tanda, texto, registro: reg, origenes: origenesDelCliente(ctx) }, ahora)
  if (r.estado === 'esperando') return { status: 200, cuerpo: { ok: true, tanda, estado: EN_REVISION_DE_REGISTRO, objeto_id: objetoDeRegistro('calendario', tanda), revision_id: r.revision_id } }
  if (r.estado === 'cerrada') return aplicarVueltaDelCalendario(al, r.salida, ahora)
  // no abre · error: se cierra con lo que ya está validado en memoria y las pistas como aviso
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, objetoDeRegistro('calendario', tanda))
  return cerrarTanda(al, { ...p, hs: [...p.hs, ...avisosSinRevision(filas, reg, `la jefatura no abrió la revisión: ${r.motivo}`)] })
}

/** las filas de la tanda que siguen esperando su revisión (ninguna cerrada); null si la tanda ya cerró por otra vía o no existe */
async function tandaRetenida(al: Almacen, campana: Campana, tanda: number): Promise<Fila[] | null> {
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const filas = (await al.filas(campana.id, version)).filter((f) => f.tanda === tanda && f.estado !== 'esquema')
  return filas.length && filas.every((f) => ESTADOS_SIN_CERRAR.has(f.estado)) ? filas : null
}

interface VueltaDelCalendario { temas: Map<string, string> | null; avisosDeLaRevision: string[]; motivoSinRevision: string | null }

/**
 * Cierra la tanda retenida: aplica los temas corregidos que no rompen nada, vuelve a validar con TODOS los chequeos (registro como aviso), resuelve la espera y cierra por `cerrarTanda`.
 * Los insumos se rearman como en `retomarPorCantidades` (lo único que no se guarda son los ajustes: se reconstruyen de lo omitido y de lo que salió). La comparación es SIEMPRE de la
 * tanda corregida contra la original con los MISMOS insumos: lo que solo cambia es el tema.
 */
async function cerrarTandaDeRegistro(al: Almacen, campana: Campana, tanda: number, v: VueltaDelCalendario, ahora: string): Promise<Respuesta> {
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const estr = (await al.ultimaEstrategia(campana.id))?.contenido
  if (!ctx || !estr) return err(409, 'E-CONTEXTO', 'falta el contexto o la estrategia de la campaña')
  const formatos = await al.formatos()
  const lexico = lexicoDelCliente(ctx.industria, await al.leerConfig('lexico_afirmaciones'))
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const todas = await al.filas(campana.id, version)
  const semanas = semanasDeTanda(tanda, medidaDeCampana(campana))
  const previas = todas.filter((f) => f.tanda < tanda && f.estado !== 'esquema')
  const originales = todas.filter((f) => f.tanda === tanda && f.estado !== 'esquema')
  const salen = originales.filter((f) => f.estado === 'descartada_sin_fuente').map((f) => f.id)
  const ajustes: Ajuste[] = [...omitidosImplicitos(estr, semanas, originales), ...salen.map((id) => ({ semana: semanaDeId(id), slot: slotDe(id), accion: 'omitir' as const, motivo: 'la fila salió: dato sin fuente tras la corrección' }))]
  const fechas = await fechasDeclaradas(al, ctx, estr, campana)
  const validar = (fs: Fila[]) => bajarFaltantesDeCantidad(validarTodo(insumosDe(campana, ctx, estr, formatos, tanda, semanas, fs, previas, ajustes, fechas, ahora, lexico, true)))
  /** los chequeos que BLOQUEAN, por fila (o `tanda` si son del conjunto) */
  const bloqueosPor = (hs: Hallazgo[]): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>()
    for (const x of hs) if (x.severidad === 'bloquea') { const k = x.fila_id ?? 'tanda'; m.set(k, new Set([...(m.get(k) ?? []), x.chequeo])) }
    return m
  }
  const nuevos = (antes: Map<string, Set<string>>, despues: Map<string, Set<string>>, k: string): string[] => [...(despues.get(k) ?? [])].filter((c) => !antes.get(k)?.has(c))

  const hsOriginal = validar(originales)
  const antes = bloqueosPor(hsOriginal)
  const reg = registroFijado(ctx)
  const extra: Hallazgo[] = []
  const corregidas: string[] = []
  const revertidas: string[] = []
  let filas = originales
  let hs = hsOriginal
  if (v.temas) {
    const propuesta = originales.map((f) => (v.temas!.has(f.id) && v.temas!.get(f.id) !== f.tema ? { ...f, tema: v.temas!.get(f.id)! } : f))
    const conTodas = bloqueosPor(validar(propuesta))
    filas = propuesta.map((f, k) => {
      const o = originales[k]
      if (f === o) return f
      const rompe = nuevos(antes, conTodas, f.id)
      if (!rompe.length) { corregidas.push(f.id); return f }
      revertidas.push(f.id)
      extra.push(avisoDeFila(f.id, `la corrección de registro de esta fila rompía otros chequeos (${rompe.join(' · ')}): se queda el tema anterior`))
      return o
    })
    if (corregidas.length) {
      hs = validar(filas)
      const despues = bloqueosPor(hs)
      const rompeAlgo = [...despues.keys()].some((k) => nuevos(antes, despues, k).length > 0)
      if (rompeAlgo) {
        // una fila que afecta a otra o al conjunto: se quedan TODOS los temas de antes (la versión anterior entera, como en el brief)
        for (const id of corregidas) extra.push(avisoDeFila(id, 'la corrección de registro rompía otros chequeos de la tanda: se queda el tema anterior'))
        revertidas.push(...corregidas.splice(0))
        filas = originales
        hs = hsOriginal
      }
    }
  }
  if (v.motivoSinRevision && reg) extra.push(...avisosSinRevision(filas, reg, v.motivoSinRevision))
  // los avisos de la revisión (citas en otro registro): a la fila cuyo tema trae la frase citada; los que no se ubican, en la respuesta
  const sinFila: string[] = []
  for (const a of v.avisosDeLaRevision) {
    const frase = /«([^»]+)»/.exec(a)?.[1]
    const donde = frase ? filasConTema(filas).filter((f) => (f.tema ?? '').includes(frase)) : []
    if (donde.length) for (const f of donde) extra.push(avisoDeFila(f.id, a))
    else sinFila.push(a)
  }
  const hsFinal = [...hs, ...extra]
  await al.guardarValidaciones(campana.id, 'calendario', version, tanda, 2, hsFinal, campana.seco)
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, objetoDeRegistro('calendario', tanda))
  const r = await cerrarTanda(al, { campana: (await al.campana(campana.id)) ?? campana, formatos, estr, version, tanda, semanas, filas, hs: hsFinal, salen, ahora })
  return { status: r.status, cuerpo: { ...r.cuerpo, registro: { corregidas, revertidas, ...(sinFila.length ? { avisos: sinFila } : {}) } } }
}

/** LA VUELTA de la revisión de registro del calendario. IDEMPOTENTE: sin espera viva, o con la tanda ya cerrada, no toca nada */
export async function aplicarVueltaDelCalendario(al: Almacen, salida: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = leerArtifactIdDeRegistro(String(salida.artifact_id ?? ''))
  if (!id || id.doc !== 'calendario') return err(400, 'E-CAMPOS', '`salida.artifact_id` debe ser registro:calendario:<campaña>:t<n>')
  const campana = await al.campana(id.campana_id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  if (!(await esperaDeRegistroViva(al, campana.id, 'calendario', id.version))) return { status: 200, cuerpo: { ok: true, ya_cerrada: true } }
  const retenidas = await tandaRetenida(al, campana, id.version)
  if (!retenidas) { await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, objetoDeRegistro('calendario', id.version)); return { status: 200, cuerpo: { ok: true, ya_cerrada: true } } }
  const v = textoDeLaVuelta(salida, textoDelCalendario(retenidas))
  const temas = v.corregido ? temasDeLaVuelta(v.texto, retenidas) : null
  return cerrarTandaDeRegistro(al, campana, id.version, {
    temas, avisosDeLaRevision: avisosDeLaSalida(salida),
    motivoSinRevision: v.corregido && !temas ? 'la versión corregida no se pudo leer fila por fila: se quedan los temas de antes' : null,
  }, ahora)
}

/**
 * La ruta `api/jefatura/cadena-vuelta` para los TRES documentos: el calendario vuelve aquí; el brief y la gran idea, por `recibirVueltaDeRegistro` (mesas.ts) sin cambios.
 * Como en el brief, nadie más reenvía el sobre de la cadena: lo deja la ruta en la sala con la clave del medio día (la sala deduplica con el vigía).
 */
export async function recibirVueltaDeLaCadena(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const s = cuerpo.salida
  const id = s && typeof s === 'object' && !Array.isArray(s) ? leerArtifactIdDeRegistro(String((s as Record<string, unknown>).artifact_id ?? '')) : null
  if (id?.doc !== 'calendario') return recibirVueltaDeRegistro(al, cuerpo, ahora)
  const salida = s as Record<string, unknown>
  if (salida.artifact_type !== 'registro') return err(400, 'E-CAMPOS', '`salida.artifact_type` debe ser «registro»: esta ruta solo vuelve a la cadena')
  if (typeof salida.resultado !== 'string') return err(400, 'E-CAMPOS', '`salida.resultado` es obligatorio')
  const re = await aplicarVueltaDelCalendario(al, salida, ahora)
  if (re.status !== 200) return re
  const tramo = tramoDeReemision(ahora)
  const empuje = re.cuerpo.ya_cerrada ? {} : await empujarDesdeElTablero(al, tramo, await siguienteDespuesDe(al, id.campana_id, tramo))
  return { status: 200, cuerpo: { ...re.cuerpo, revision: { id: salida.revision_id ?? null, resultado: salida.resultado }, ...empuje } }
}

/** el reloj: la espera de la revisión del calendario venció sin vuelta → la tanda se cierra con sus temas y las pistas como aviso (la cadena nunca queda de rehén) */
export async function seguirSinRevisionDelCalendario(al: Almacen, e: EsperaFila, ahora: string): Promise<string> {
  const o = leerObjetoDeRegistro(e.objeto_id)
  if (!o || o.doc !== 'calendario') return `${e.objeto_id}: objeto no reconocido`
  const campana = await al.campana(e.campana_id)
  if (!campana) return `campaña ${e.campana_id} inexistente`
  if (!(await tandaRetenida(al, campana, o.version))) { await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, e.objeto_id); return `${e.objeto_id}: ya había cerrado` }
  const r = await cerrarTandaDeRegistro(al, campana, o.version, { temas: null, avisosDeLaRevision: [], motivoSinRevision: 'la revisión venció sin vuelta' }, ahora)
  return r.status === 200 ? `${e.objeto_id}: la tanda ${o.version} se cerró sin revisión (las pistas quedan como aviso)` : `${e.objeto_id}: no se pudo cerrar (${String(r.cuerpo.error ?? r.status)})`
}
