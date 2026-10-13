/**
 * EL ORQUESTADOR DE LA JEFATURA (oficina propia) · diseño v4 §1, §3, §5.1, §10. Es PURO respecto del mundo: todo entra por los puertos (`./puertos`).
 *   · `abrirRevision`   → la puerta: valida el sobre, aplica los interruptores (apagada = 409, no abre ni gasta) y la guarda G3 («sin otra vuelta»), abre y avanza.
 *   · `avanzar`         → ejecuta en línea lo que no es de un agente (GPT ciego, cierre) y se detiene en un paso de agente devolviendo el PEDIDO (n8n lo ejecuta con `run-sdk`).
 *   · `recibirResultado`→ aplica el contrato de formato a lo que devolvió un empleado, registra y sigue.
 *   · `elegirVersion`   → plan: la «mejor versión aceptable» (A/B/C) y qué guardar, sin duplicar.
 *   · `vigiar`          → un paso en «corriendo» más de 12 min no volverá: se marca muerto y se reintenta UNA vez; si vuelve a morir, `fallida` + aviso.
 * Sin ciclos: no existe `vuelve_a`; `max_cycles` de julio no se lee. Un bloqueo del código (`necesita_humano`) nunca se salta: con él la jefatura NO abre (regla 8).
 */
import crypto from 'node:crypto'
import { estadoInicial, fichaNueva, registrarPaso, siguientePaso, type Artefacto, type Estado, type Ficha, type Paso, type Plantilla, type ResultadoDePaso } from '../../revision-comun'
import { desacuerdosDe, hayQueAvisar, resolverCierre, textoDelAviso, type Cierre } from './cierre'
import { validarEntrada, type EntradaDeRevision, type Marcas, type PayloadDeRevision, type SalidaDeRevision } from './contrato'
import { procesarSalidaDeRevision } from './formatos'
import { armarPedidoCiego, armarPedidoDeAgente, auditarPedidoDeAgente, tareaDeCorreccion, tareaDeDecision, tareaDeRevisionDeFondo, type FichaParaElDueno } from './pedidos'
import { elegirVersion as elegirVersionPura, esProductoDeUnaRevision, etiquetaDeVersion, MAXIMO_DE_VERSIONES, planDeGuardado, resultadoTrasElegir, type EvaluacionDeVersion, type Etiqueta, type FilaExistente } from './plan'
import { atiende, CLAVE_DE_CORRECCION, CLAVE_DE_DECISION, dondeDeLaOpinion, duenosDe, plantillaDePolitica, topeDelPaso, type Dueno } from './politicas'
import { ESTADOS_TERMINALES, type CambiosDeRevision, type PasoRegistrado, type Puertos, type Revision } from './puertos'
import { moldeDelPaso, simulacionDelRevisor } from './simulacion'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')
export const MINUTOS_PARA_DAR_POR_MUERTO = 12
const MAX_VUELTAS_DEL_BUCLE = 40

type Datos = Record<string, unknown>
const datos = (e: Estado, n: string): Datos | undefined => e.artefactos[n]?.datos
const turnoDe = (e: Estado): number => e.pasos_ejecutados + 1
const esTerminal = (rev: Revision): boolean => (ESTADOS_TERMINALES as readonly string[]).includes(rev.estado)

interface Historial { etiqueta: Etiqueta; paso: string; texto: string; largo: number }
const historialDe = (e: Estado): Historial[] => ((datos(e, 'revision')?.historial as Historial[] | undefined) ?? [])

function plantillaDe(rev: Revision): Plantilla { return plantillaDePolitica(rev.policy, rev.productores, rev.tope_usd) }
function duenoDe(rev: Revision, paso: Paso): Dueno {
  const agente = paso.clave.includes(':') ? paso.clave.split(':').slice(1).join(':') : paso.quien
  const d = duenosDe(rev.productores).find((x) => x.agente === agente)
  if (!d) throw new Error(`no hay dueño «${agente}» en la revisión`)
  return d
}
const esDecision = (paso: Paso): boolean => paso.clave.startsWith('decision:')
const esCorreccion = (paso: Paso): boolean => paso.clave.startsWith('correccion:')

/** el estado inicial: el artefacto que se revisa es la versión A */
function estadoDeApertura(entrada: EntradaDeRevision): Estado {
  const p = entrada.payload
  const base: Datos = { texto: p.texto, ...(p.imagenes?.length ? { imagenes: p.imagenes } : {}), ...(p.chequeos_previos ? { chequeos_previos: p.chequeos_previos } : {}), historial: [{ etiqueta: 'A', paso: 'abrir', texto: p.texto, largo: p.texto.length }] }
  // estrategia / calendario viajan como texto JSON: si se puede leer, se guarda el objeto / las filas para corregir por partes
  try {
    const j = JSON.parse(p.texto) as unknown
    if (entrada.artifact_type === 'estrategia' && j && typeof j === 'object' && !Array.isArray(j)) base.objeto = j as Datos
    if (entrada.artifact_type === 'calendario') base.filas = Array.isArray(j) ? j : Array.isArray((j as { filas?: unknown })?.filas) ? (j as { filas: unknown[] }).filas : undefined
  } catch { /* texto plano: no hay objeto */ }
  const e = estadoInicial()
  e.artefactos.revision = { version: 1, version_consumida: 0, datos: base } satisfies Artefacto
  return e
}

// ───────────────────────── la puerta
export async function abrirRevision(P: Puertos, cuerpo: unknown, o: { prueba?: boolean } = {}): Promise<Respuesta> {
  const v = validarEntrada(cuerpo)
  if (!v.ok) return r(400, { error: v.codigo, errores: v.errores })
  const { entrada } = v
  const p = entrada.payload
  const cfg = await P.almacen.leerConfig()
  // 🔴 apagada = no abre y no gasta, ni siquiera en seco
  if (cfg.estado === 'apagada') return r(409, { error: 'jefatura_no_abre', motivo: 'apagada', detalle: 'la jefatura está apagada: no abre ni gasta; el artefacto sigue por su camino de hoy' })
  if (!cfg.tipos_activos.includes(entrada.artifact_type)) return r(409, { error: 'jefatura_no_abre', motivo: 'tipo_no_activo', detalle: `el tipo «${entrada.artifact_type}» no está en tipos_activos` })
  if (cfg.estado === 'ensayo' && !cfg.clientes_ensayo.includes(entrada.client_id)) return r(409, { error: 'jefatura_no_abre', motivo: 'fuera_del_ensayo', detalle: 'en ensayo solo abre para los clientes de ensayo' })
  // G3 · «sin otra vuelta»: una versión producida por la jefatura NUNCA abre otra revisión
  if (esProductoDeUnaRevision(p.generado_por_jefatura)) return r(409, { error: 'sin_otra_vuelta', detalle: `este artefacto lo produjo la revisión ${String(p.generado_por_jefatura)}: ninguna versión abre otra revisión (F20)` })
  // regla 8 · chequeos por código primero; un bloqueo del código nunca se salta
  if (p.chequeos_previos?.necesita_humano) return r(409, { error: 'chequeos_detienen', detalle: 'el validador por código dejó «necesita humano»: la cadena ya está detenida y la jefatura no abre (regla 8)' })
  const lp = await P.almacen.leerPolitica(entrada.artifact_type)
  if (!lp.ok) return r(lp.existe ? 422 : 404, { error: lp.existe ? 'politica_invalida' : 'tipo_sin_politica', detalle: lp.error })
  if (cfg.estado === 'encendida' && !lp.activa) return r(409, { error: 'jefatura_no_abre', motivo: 'politica_inactiva', detalle: `el renglón de «${entrada.artifact_type}» está inactivo` })
  // seco: `simulacion.reentrega = 'ninguna'` fuerza el camino «solo marca» aunque el tipo tenga re-entrega
  const pol = p.dry_run && p.simulacion?.reentrega === 'ninguna' ? { ...lp.politica, reentrega: 'ninguna' as const } : lp.politica
  if (p.tope_restante_usd !== undefined && p.tope_restante_usd <= 0) return r(409, { error: 'jefatura_no_abre', motivo: 'sin_presupuesto', detalle: 'al encargo padre no le queda presupuesto: la revisión no abre' })
  // seco: `simulacion.tope = 'exceso'` deja presupuesto solo para el primer paso, así el cierre por tope se ejerce sin gastar
  const topeSimulado = p.dry_run && p.simulacion?.tope === 'exceso' ? topeDelPaso(pol, 'revision_fondo') + 0.05 : Infinity
  const tope = Math.min(pol.tope_revision_usd, p.tope_restante_usd ?? Infinity, topeSimulado)
  const productores = p.productores ?? pol.productores
  if (pol.reentrega !== 'ninguna' && productores.length === 0) return r(422, { error: 'sin_productores', detalle: 'el tipo tiene re-entrega y no hay quién reciba las correcciones' })
  const c = await P.almacen.crearRevision({
    client_id: entrada.client_id, artifact_type: entrada.artifact_type, artifact_id: entrada.artifact_id, version: p.version ?? 1, journey_id: entrada.journey_id, productores, entrada: p,
    devolver_a: p.devolver_a, policy: pol, tope_usd: +tope.toFixed(6), dry_run: p.dry_run, prueba: !!o.prueba, estado_del_motor: estadoDeApertura(entrada),
  })
  if (!c.ok) return r(500, { error: 'almacen_error', detalle: c.error })
  if (!c.nuevo) return r(200, { accion: 'ya_existia', revision_id: c.revision.id, estado: c.revision.estado, resultado: c.revision.resultado })
  const sal = await avanzar(P, c.revision.id)
  return r(sal.status, { ...sal.cuerpo, revision_id: c.revision.id, ignorados: v.ignorados })
}

// ───────────────────────── avanzar
async function aplicar(P: Puertos, rev: Revision, pl: Plantilla, indice: number, res: ResultadoDePaso, extra: { paso: Omit<PasoRegistrado, 'n' | 'estado' | 'intento'> & { n?: number; intento?: number; estado?: PasoRegistrado['estado'] } }): Promise<Revision> {
  const antes = rev.estado_del_motor
  const nuevo = registrarPaso(antes, pl, indice, res)
  const n = extra.paso.n ?? turnoDe(antes)
  const cambios: CambiosDeRevision = {
    revision_id: rev.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', fichas: nuevo.fichas,
    paso: { ...extra.paso, n, estado: extra.paso.estado ?? 'hecho', intento: extra.paso.intento ?? (antes.vueltas[`fmt:${pl.pasos[indice].clave}`] ?? 0) + 1 },
  }
  await P.almacen.guardar(cambios)
  return { ...rev, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso' }
}

const ROL_DE: (clave: string) => string = (c) => (c === 'revision_fondo' ? 'fondo' : c === 'segunda_mirada' ? 'ciego' : c.startsWith('correccion:') ? 'productor_corrige' : 'productor_decide')
/** la traza M1 de un paso: namespace `metadata.jefatura` (diseño §6) */
function trazaM1(rev: Revision, paso: Paso, extra: Datos = {}): Record<string, unknown> {
  return { jefatura: { role: ROL_DE(paso.clave), review_id: rev.id, artifact_type: rev.artifact_type, artifact_id: rev.artifact_id, cycle: 0, nominal_agent: paso.quien, contra_que_ref: rev.policy.contra_que.map((d) => d.clave), policy_snapshot: { artifact_type: rev.policy.artifact_type, reentrega: rev.policy.reentrega, tope_revision_usd: rev.policy.tope_revision_usd }, ...extra } }
}

function fichasPropias(rev: Revision, e: Estado, paso: Paso, d: Dueno): Ficha[] {
  const origen = esDecision(paso) ? 'externa' : 'jefe'
  return e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && (origen === 'externa' || f.gravedad === 'bloquea') && atiende(d, f.donde))
}
const paraElDueno = (fs: Ficha[]): FichaParaElDueno[] => fs.map((f) => ({ id: f.id, que: f.que, donde: f.donde, contra_que: f.contra_que, propuesta: f.propuesta, gravedad: f.gravedad }))

/** el agente y el pedido de un paso de agente (puro: sale del estado, así se puede volver a entregar) */
function armarPedido(rev: Revision, pl: Plantilla, paso: Paso, e: Estado, n: number, errorDeFormato?: string): { agente: string; pedido: Record<string, unknown>; molde?: { texto: string | null; error?: string } } {
  const rd = datos(e, 'revision') ?? {}
  const texto = String(rd.texto ?? '')
  const tipo = rev.artifact_type
  const p = rev.entrada
  const dispatch_key = `${rev.id}:${n}`
  const h = historialDe(e)
  const vigente = (h.length > 1 ? etiquetaDeVersion(h.length) : 'A') as 'A' | 'B' | 'C'
  const version_actual: 'A' | 'B' = vigente === 'A' ? 'A' : 'B'
  let t: { task: string; indicacion: string; esquema: string }
  let ids: string[] = []
  let donde = 'general'
  const duenos = duenosDe(rev.productores)
  if (paso.clave === 'revision_fondo') {
    t = tareaDeRevisionDeFondo({ politica: rev.policy, payload: p, tipo, texto, duenos })
    donde = duenos.flatMap((d) => (d.comodin ? [] : d.dondes))[0] ?? 'general'
  } else {
    const d = duenoDe(rev, paso)
    const mias = fichasPropias(rev, e, paso, d)
    ids = mias.map((f) => f.id)
    const esquema = paso.salida?.esquema ?? 'resolucion_solo.v1'
    if (esCorreccion(paso)) t = tareaDeCorreccion({ politica: rev.policy, payload: p, tipo, dueno: d, esquema, texto, objeto: rd.objeto ?? rd.filas, fichas: paraElDueno(mias), version_actual })
    else {
      const op = String(datos(e, 'fichas_externas')?.opinion ?? '')
      t = tareaDeDecision({ politica: rev.policy, payload: p, tipo, dueno: d, esquema, texto, fichas: paraElDueno(mias), opinion: op, version_actual })
    }
  }
  const task = errorDeFormato ? `${t.task}\n\n${errorDeFormato}` : t.task
  const pedido = armarPedidoDeAgente({ agente: paso.quien, task, esquema: t.esquema, imagenes: p.imagenes, indicacion: t.indicacion, paso: paso.clave, revision_id: rev.id, dispatch_key, max_budget_usd: paso.tope_usd, dry_run: rev.dry_run, client_id: rev.client_id })
  const malos = auditarPedidoDeAgente(pedido)
  if (malos.length) throw new Error(`pedido inválido (regla dura del editor): ${malos.join(' · ')}`)
  const molde = rev.dry_run ? moldeDelPaso({ paso: paso.clave, esquema: t.esquema, sim: p.simulacion, ids_de_fichas: ids, donde, texto, objeto: rd.objeto as Datos | undefined, filas: rd.filas as Array<Record<string, unknown>> | undefined, esDecision: esDecision(paso) }) : undefined
  return { agente: paso.quien, pedido: { ...pedido, ...(molde ? { molde } : {}) } as Record<string, unknown>, ...(molde ? { molde } : {}) }
}

export async function avanzar(P: Puertos, revisionId: string): Promise<Respuesta> {
  let rev = await P.almacen.leerRevision(revisionId)
  if (!rev) return r(404, { error: 'revision_inexistente' })
  const pl = plantillaDe(rev)
  for (let vuelta = 0; vuelta < MAX_VUELTAS_DEL_BUCLE; vuelta++) {
    if (esTerminal(rev)) return r(200, { accion: 'cerrado', estado: rev.estado, resultado: rev.resultado, marcas: rev.marcas, simulado: rev.dry_run, salida: armarSalida(rev, resolverCierre(rev.estado_del_motor, { tope: rev.estado === 'cerrada_por_tope', fallida: rev.estado === 'fallida' })) })
    const abierto = await P.almacen.pasoAbierto(rev.id)
    const e = rev.estado_del_motor
    if (abierto) {
      // un «siguiente» repetido no abre otro paso: ENTREGA DE NUEVO el mismo pedido (mismo número, misma dispatch_key)
      const sg = siguientePaso(e, pl)
      if (sg.accion === 'ejecutar' && sg.paso.tipo === 'agente') {
        const a = armarPedido(rev, pl, sg.paso, e, abierto.n)
        return r(200, { accion: 'esperar', reentrega: true, turno: { n: abierto.n, paso: abierto.paso, tipo: abierto.tipo, agente: abierto.agente, dispatch_key: abierto.dispatch_key, pedido: a.pedido } })
      }
      return r(200, { accion: 'esperar', turno: { n: abierto.n, paso: abierto.paso, agente: abierto.agente, dispatch_key: abierto.dispatch_key }, nota: 'ya hay un paso esperando respuesta' })
    }
    const sig = siguientePaso(e, pl)
    if (sig.accion === 'cierre_por_tope') return cerrar(P, rev, { tope: true, nota: sig.detalle })
    if (sig.accion === 'fin') return cerrar(P, rev, {})
    const paso = pl.pasos[sig.indice]
    try {
      if (paso.tipo === 'codigo') return cerrar(P, rev, {})
      if (paso.tipo === 'externo') { rev = await ejecutarExterno(P, rev, pl, sig.indice, paso); continue }
      const n = turnoDe(e)
      const a = armarPedido(rev, pl, paso, e, n)
      const intento = (e.vueltas[`fmt:${paso.clave}`] ?? 0) + 1
      await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: e.gasto_usd, estado: 'en_paso', paso: { n, paso: paso.clave, intento, tipo: 'agente', agente: a.agente, estado: 'corriendo', dispatch_key: `${rev.id}:${n}`, concepto: 'modelo', base: 'usage', cost_usd: 0, traza: trazaM1(rev, paso) } })
      return r(200, { accion: 'esperar', turno: { n, paso: paso.clave, tipo: 'agente', agente: a.agente, dispatch_key: `${rev.id}:${n}`, pedido: a.pedido } })
    } catch (err) {
      return fallar(P, rev, `error interno en «${paso.clave}»: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return fallar(P, rev, `la jefatura dio más de ${MAX_VUELTAS_DEL_BUCLE} vueltas (no debería pasar)`)
}

/** GPT ciego: recibe SOLO el texto vigente, las imágenes y el contexto (nada del hilo ni de las fichas) */
async function ejecutarExterno(P: Puertos, rev: Revision, pl: Plantilla, indice: number, paso: Paso): Promise<Revision> {
  const e = rev.estado_del_motor
  const rd = datos(e, 'revision') ?? {}
  const pedido = armarPedidoCiego({ tipo: rev.artifact_type, texto: String(rd.texto ?? ''), imagenes: (rd.imagenes as string[] | undefined) ?? rev.entrada.imagenes, contexto: rev.entrada.contexto ?? [], huecos: rev.entrada.huecos, huecos_de_la_politica: rev.policy.huecos_pregunta })
  // en seco NUNCA se llama al proveedor: se usa la simulación (US$ 0)
  const rv = rev.dry_run ? simulacionDelRevisor(rev.entrada.simulacion) : await P.revisor({ texto: pedido.texto, imagenes_urls: pedido.imagenes, dry_run: false })
  const base: Omit<PasoRegistrado, 'n' | 'estado' | 'intento'> = { paso: paso.clave, tipo: 'externo', agente: paso.quien, dispatch_key: null, concepto: 'revisor_externo', base: 'usage', cost_usd: 0 }
  if (!rv.ok) {
    // F5: tras los reintentos (los hace el adaptador) sigue «sin segunda mirada» + aviso (al cerrar); nunca bloquea
    const costo = rv.costo_usd ?? 0
    return aplicar(P, rev, pl, indice, { costo_usd: costo, artefacto: { sin_revision: true, motivo: rv.error, intentos: rv.intentos ?? [] } }, { paso: { ...base, cost_usd: costo, error: rv.error, traza: trazaM1(rev, paso, { sin_segunda_mirada: true, intentos: (rv.intentos ?? []).length }) } })
  }
  const opinion = rv.texto.trim()
  const traza = trazaM1(rev, paso, { effective_model: rv.modelo, simulado: rev.dry_run })
  if (!opinion) return aplicar(P, rev, pl, indice, { costo_usd: rv.costo_usd, artefacto: { opinion: null, sin_opinion: true, modelo: rv.modelo, simulado: rev.dry_run } }, { paso: { ...base, cost_usd: rv.costo_usd, traza } })
  // la opinión llega a TODOS los que hicieron algo (uno por parte); cada uno decide sobre SU parte, con razón. En los tipos sin re-entrega (brief) solo se guarda como opinión.
  const fichas: Ficha[] = rev.policy.reentrega === 'ninguna' ? [] : duenosDe(rev.productores).flatMap((d) => dondeDeLaOpinion(d).map((donde) => fichaNueva(`ext-${turnoDe(e)}-${donde}`, 'externa', donde, 'sugerencia', opinion, 'opinión libre del revisor externo (sin criterios ni reglas)', `quien hizo la parte «${donde}» decide qué toma y qué no, con razón`)))
  return aplicar(P, rev, pl, indice, { costo_usd: rv.costo_usd, artefacto: { opinion, modelo: rv.modelo, intentos: rv.intentos ?? [], simulado: rev.dry_run }, fichas }, { paso: { ...base, cost_usd: rv.costo_usd, traza } })
}

// ───────────────────────── recibir el resultado de un empleado
export interface ResultadoDeTurno { texto?: string; error?: string; costo_usd?: number; workflow_execution_id?: string | null; tokens_in?: number | null; tokens_out?: number | null }

export async function recibirResultado(P: Puertos, revisionId: string, n: number, res: ResultadoDeTurno): Promise<Respuesta> {
  const rev = await P.almacen.leerRevision(revisionId)
  if (!rev) return r(404, { error: 'revision_inexistente' })
  const pl = plantillaDe(rev)
  const abierto = await P.almacen.pasoAbierto(rev.id)
  if (!abierto || abierto.n !== n) {
    if (n < turnoDe(rev.estado_del_motor)) return avanzar(P, rev.id) // respuesta repetida: ya registrada, no se cuenta dos veces
    return r(409, { error: 'turno_no_esperado', esperado: abierto?.n ?? null, recibido: n })
  }
  const e = rev.estado_del_motor
  const sig = siguientePaso(e, pl)
  if (sig.accion !== 'ejecutar') return r(409, { error: 'sin_paso_pendiente' })
  const paso = sig.paso
  const costo = Math.max(0, Number(res.costo_usd ?? 0))
  const intento = (e.vueltas[`fmt:${paso.clave}`] ?? 0) + 1
  const base = { paso: paso.clave, intento, tipo: 'agente' as const, agente: abierto.agente, dispatch_key: abierto.dispatch_key, concepto: 'modelo' as const, base: 'usage' as const, cost_usd: costo, workflow_execution_id: res.workflow_execution_id ?? null, tokens_in: res.tokens_in ?? null, tokens_out: res.tokens_out ?? null, traza: trazaM1(rev, paso) }
  if (res.error || typeof res.texto !== 'string') {
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), paso: { ...base, n, estado: 'fallo', error: res.error ?? 'respuesta vacía' } })
    return fallar(P, { ...rev, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, `el paso «${paso.clave}» falló: ${res.error ?? 'respuesta vacía'}`)
  }
  const intentos = e.vueltas[`fmt:${paso.clave}`] ?? 0
  const p = procesarSalidaDeRevision(res.texto, paso.salida!.esquema, intentos, paso.salida!.reintento_formato)
  const pedirReintento = async (mensaje: string, motivo: string): Promise<Respuesta> => {
    const nuevo: Estado = { ...e, vueltas: { ...e.vueltas, [`fmt:${paso.clave}`]: intentos + 1 }, pasos_ejecutados: e.pasos_ejecutados + 1, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, paso: { ...base, n, estado: 'hecho', error: motivo } })
    const n2 = turnoDe(nuevo)
    const a = armarPedido({ ...rev, estado_del_motor: nuevo }, pl, paso, nuevo, n2, mensaje)
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', paso: { n: n2, paso: paso.clave, intento: intentos + 2, tipo: 'agente', agente: a.agente, estado: 'corriendo', dispatch_key: `${rev.id}:${n2}`, concepto: 'modelo', base: 'usage', cost_usd: 0, traza: trazaM1(rev, paso) } })
    return r(200, { accion: 'esperar', reintento_de_formato: true, turno: { n: n2, paso: paso.clave, tipo: 'agente', agente: a.agente, dispatch_key: `${rev.id}:${n2}`, pedido: a.pedido } })
  }
  if (!p.ok && p.accion === 'reintentar') return pedirReintento(p.mensaje_de_error, 'formato: reintento')
  if (!p.ok) {
    // regla 5: formato roto tras el único reintento ⇒ fallida; nunca relleno
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), paso: { ...base, n, estado: 'fallo', error: p.errores.join(' · ') } })
    return fallar(P, { ...rev, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, p.ficha.que ?? 'formato inválido')
  }
  const proc = procesarValor(paso, p.valor, rev, e)
  if (proc.reintentar !== undefined) {
    if (intentos < (paso.salida?.reintento_formato ?? 0)) return pedirReintento(proc.reintentar, 'validación de la jefatura: reintento')
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), paso: { ...base, n, estado: 'fallo', error: proc.reintentar } })
    return fallar(P, { ...rev, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, proc.reintentar)
  }
  if (proc.fallido || !proc.res) {
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: +(e.gasto_usd + costo).toFixed(6), paso: { ...base, n, estado: 'fallo', error: proc.fallido ?? 'sin resultado' } })
    return fallar(P, { ...rev, gasto_usd: +(e.gasto_usd + costo).toFixed(6) }, proc.fallido ?? 'el paso no produjo resultado')
  }
  // el contador de reintento de formato es del PASE: al aceptar la salida se reinicia
  const { [`fmt:${paso.clave}`]: _f, ...sinFormato } = e.vueltas
  void _f
  await aplicar(P, { ...rev, estado_del_motor: { ...e, vueltas: sinFormato } }, pl, sig.indice, { ...proc.res, costo_usd: costo }, { paso: { ...base, n, estado: 'hecho' } })
  return avanzar(P, rev.id)
}

interface Procesado { res?: ResultadoDePaso; fallido?: string; reintentar?: string }

function procesarValor(paso: Paso, v: Record<string, unknown>, rev: Revision, e: Estado): Procesado {
  if (paso.clave === 'revision_fondo') {
    const fs = (v.fichas as Array<{ que: string; donde: string; contra_que: string; gravedad: 'bloquea' | 'sugerencia'; propuesta: string }>).map((f, i) => fichaNueva(`jefe-${e.pasos_ejecutados}-${i}`, 'jefe', f.donde, f.gravedad, f.que, f.contra_que, f.propuesta))
    return { res: { costo_usd: 0, artefacto: { fichas: fs.length }, fichas: fs } }
  }
  const d = duenoDe(rev, paso)
  const mias = fichasPropias(rev, e, paso, d)
  const respuestas = v.respuestas as Array<{ id: string; estado: 'tomada' | 'no_tomada'; razon: string }>
  const validas = respuestas.filter((x) => mias.some((f) => f.id === x.id))
  const huerfanas = mias.filter((f) => !validas.some((x) => x.id === f.id))
  const resoluciones = [...validas.map((x) => ({ id: x.id, estado: x.estado, razon: x.razon })), ...huerfanas.map((f) => ({ id: f.id, estado: 'no_tomada' as const, razon: 'el empleado no respondió este hallazgo' }))]
  const tomoAlgo = validas.some((x) => x.estado === 'tomada')
  const rd = datos(e, 'revision') ?? {}
  const version = e.artefactos.revision?.version ?? 1
  const conVersion = (nuevo: Datos, texto: string, etiquetaPaso: string): Datos => {
    const h = historialDe(e)
    const next = version + 1
    return { ...rd, ...nuevo, texto, historial: next <= MAXIMO_DE_VERSIONES ? [...h, { etiqueta: etiquetaDeVersion(next), paso: etiquetaPaso, texto, largo: texto.length }] : h }
  }
  const extraFichas: Ficha[] = []
  let artefacto: Datos | undefined
  const esquema = paso.salida?.esquema ?? ''
  if (esquema === 'plan_texto_y_resolucion.v1') {
    const t = typeof v.texto_plan === 'string' ? v.texto_plan : null
    if (esDecision(paso)) {
      if (tomoAlgo && t === null) return { reintentar: 'Dijiste que tomaste algo de la opinión pero no entregaste la versión final del plan: entrega el plan completo y, al final, el bloque de resolución.' }
      if (!tomoAlgo && t !== null) return { reintentar: 'Entregaste una versión del plan pero no tomaste nada de la opinión: si no tomas nada, responde solo el bloque de resolución, sin texto del plan.' }
    } else {
      if (tomoAlgo && t === null) return { reintentar: 'Dijiste que tomaste una ficha pero no entregaste la versión nueva del plan: entrega el plan completo antes del bloque de resolución.' }
      if (!tomoAlgo && t !== null) return { reintentar: 'Entregaste una versión nueva del plan pero no tomaste ninguna ficha: si no tomas ninguna, responde solo el bloque de resolución, sin texto del plan.' }
    }
    if (t !== null) artefacto = conVersion({}, t, paso.clave)
  } else if (esquema === 'resolucion.v1' && v.pieza && typeof v.pieza === 'object') {
    const pz = v.pieza as Datos
    const texto = [pz.pie_de_foto, Array.isArray(pz.hashtags) ? (pz.hashtags as string[]).join(' ') : '', pz.llamado].filter((x) => typeof x === 'string' && x !== '').join('\n\n')
    artefacto = conVersion({ pieza: { ...((rd.pieza as Datos | undefined) ?? {}), ...pz } }, texto || String(rd.texto ?? ''), paso.clave)
  } else if (esquema === 'resolucion_objeto.v1' && v.objeto && typeof v.objeto === 'object') {
    artefacto = conVersion({ objeto: v.objeto }, JSON.stringify(v.objeto), paso.clave)
  } else if (esquema === 'resolucion_parcial.v1' && Array.isArray(v.filas)) {
    const actuales = (Array.isArray(rd.filas) ? (rd.filas as Array<Record<string, unknown>>) : []).map((f) => ({ ...f }))
    for (const nueva of v.filas as Array<Record<string, unknown>>) {
      const i = actuales.findIndex((f) => f.fila_id === nueva.fila_id)
      if (i >= 0) actuales[i] = { ...actuales[i], ...nueva }
      else actuales.push(nueva)
    }
    artefacto = conVersion({ filas: actuales }, JSON.stringify(actuales), paso.clave)
  }
  // la opinión de imagen tomada: la única re-imagen la ejecuta la oficina; la jefatura devuelve «imagen por rehacer» como dato
  if (esDecision(paso) && validas.some((x) => x.estado === 'tomada' && mias.find((f) => f.id === x.id)?.donde === 'imagen')) {
    extraFichas.push(fichaNueva('imagen-por-rehacer', 'chequeo', 'imagen', 'sugerencia', 'quien dirige la imagen tomó la opinión: la oficina rehace la imagen una sola vez', 'opinión libre del revisor externo', 'la oficina decide si cabe la re-imagen'))
  }
  return { res: { costo_usd: 0, ...(artefacto ? { artefacto } : {}), resoluciones, ...(extraFichas.length ? { fichas: extraFichas } : {}) } }
}

// ───────────────────────── cierres
const marcasDe = (c: Cierre): Marcas => c.marcas

export function armarSalida(rev: Revision, c: Cierre): SalidaDeRevision {
  const e = rev.estado_del_motor
  const { historial: _historial, ...rd } = (datos(e, 'revision') ?? {}) as Datos
  void _historial
  const ext = datos(e, 'fichas_externas')
  const h = historialDe(e)
  return {
    revision_id: rev.id, artifact_type: rev.artifact_type, artifact_id: rev.artifact_id, resultado: c.resultado, marcas: marcasDe(c),
    artefacto_final: rd,
    versiones: h.map((x) => ({ etiqueta: x.etiqueta, paso: x.paso, texto: x.texto, largo: x.largo })),
    respuestas: c.respuestas,
    opinion_externa: typeof ext?.opinion === 'string' && ext.opinion ? { texto: ext.opinion, modelo: typeof ext.modelo === 'string' ? ext.modelo : null } : null,
    imagen_por_rehacer: e.fichas.some((f) => f.id === 'imagen-por-rehacer'),
    desacuerdos: c.desacuerdos, costo_usd: e.gasto_usd, pasos: e.pasos_ejecutados, trace_id: `jefatura:${rev.id}`, devolver_a: rev.devolver_a, simulado: rev.dry_run,
  }
}

async function cerrar(P: Puertos, rev: Revision, o: { tope?: boolean; fallida?: boolean; nota?: string }): Promise<Respuesta> {
  const e = rev.estado_del_motor
  const c = resolverCierre(e, { tope: !!o.tope, fallida: !!o.fallida })
  const estado = o.fallida ? 'fallida' : o.tope ? 'cerrada_por_tope' : 'cerrada'
  await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: rev.gasto_usd > e.gasto_usd ? rev.gasto_usd : e.gasto_usd, estado, resultado: c.resultado, marcas: c.marcas })
  const cerrada: Revision = { ...rev, estado, resultado: c.resultado, marcas: c.marcas }
  if (hayQueAvisar(c)) await P.avisar({ canal: 'alertas', revision_id: rev.id, texto: textoDelAviso(c, { tipo: rev.artifact_type, artifact_id: rev.artifact_id, gasto_usd: e.gasto_usd, simulado: rev.dry_run }) + (o.nota ? ` · ${o.nota}` : ''), dry_run: rev.dry_run })
  return r(200, { accion: 'cerrado', estado, resultado: c.resultado, marcas: c.marcas, simulado: rev.dry_run, gasto_usd: e.gasto_usd, ...(o.nota ? { nota: o.nota } : {}), salida: armarSalida(cerrada, c) })
}

export async function fallar(P: Puertos, rev: Revision, motivo: string): Promise<Respuesta> {
  const e = rev.estado_del_motor
  const c = resolverCierre(e, { tope: false, fallida: true })
  await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: e, gasto_usd: rev.gasto_usd > e.gasto_usd ? rev.gasto_usd : e.gasto_usd, estado: 'fallida', resultado: 'fallida', marcas: c.marcas })
  await P.avisar({ canal: 'alertas', revision_id: rev.id, texto: `${textoDelAviso(c, { tipo: rev.artifact_type, artifact_id: rev.artifact_id, gasto_usd: e.gasto_usd, simulado: rev.dry_run })} · ${motivo}`, dry_run: rev.dry_run })
  return r(200, { accion: 'cerrado', estado: 'fallida', resultado: 'fallida', marcas: c.marcas, motivo, simulado: rev.dry_run, salida: armarSalida({ ...rev, estado: 'fallida', resultado: 'fallida' }, c) })
}

// ───────────────────────── plan: la mejor versión aceptable
/**
 * La planeación mide con SUS chequeos por código (los de hoy) cada versión producida y llama aquí: devuelve la versión adoptada, qué guardar (en orden y sin duplicar) y el resultado final
 * (`con_desacuerdo` si no se adoptó la última). Solo corre sobre una revisión de `plan` ya cerrada. Persiste el resultado final.
 */
export async function elegirVersionDelPlan(P: Puertos, revisionId: string, o: { evaluaciones: EvaluacionDeVersion[]; idDeA: string; existentes: FilaExistente[] }): Promise<Respuesta> {
  const rev = await P.almacen.leerRevision(revisionId)
  if (!rev) return r(404, { error: 'revision_inexistente' })
  if (rev.artifact_type !== 'plan') return r(409, { error: 'solo_el_plan', detalle: 'la elección de versión solo existe para el plan' })
  if (!esTerminal(rev) || !rev.resultado) return r(409, { error: 'revision_sin_cerrar', detalle: 'la revisión del plan todavía no cerró' })
  const h = historialDe(rev.estado_del_motor)
  const producidas = h.map((x) => x.etiqueta)
  let ad
  try {
    const evaluadas = o.evaluaciones.map((x) => x.etiqueta).sort()
    if (JSON.stringify(evaluadas) !== JSON.stringify([...producidas].sort())) return r(400, { error: 'evaluaciones_no_coinciden', detalle: `se produjeron ${producidas.join(', ')} y se evaluaron ${evaluadas.join(', ')}` })
    ad = elegirVersionPura(o.evaluaciones)
  } catch (err) { return r(400, { error: 'evaluaciones_invalidas', detalle: err instanceof Error ? err.message : String(err) }) }
  const guardado = planDeGuardado(ad, { idDeA: o.idDeA, existentes: o.existentes, produjo: producidas })
  const fin = resultadoTrasElegir({ resultado: rev.resultado, marcas: rev.marcas }, ad.adoptoLaUltima)
  if (fin.resultado !== rev.resultado || fin.marcas.con_desacuerdo !== rev.marcas.con_desacuerdo) {
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: rev.estado_del_motor, gasto_usd: rev.gasto_usd, resultado: fin.resultado, marcas: fin.marcas })
    if (rev.resultado === 'limpia' || rev.resultado === 'sin_segunda_mirada') {
      await P.avisar({ canal: 'alertas', revision_id: rev.id, texto: `${rev.dry_run ? '🧪 (seco) ' : ''}⚠️ Plan con desacuerdo · ${rev.artifact_id}: la versión ${ad.ultima} no mejoró los chequeos; sigue la ${ad.adoptada}`, dry_run: rev.dry_run })
    }
  }
  return r(200, { accion: 'versiones_elegidas', adoptada: ad.adoptada, ultima: ad.ultima, adopto_la_ultima: ad.adoptoLaUltima, razones: ad.razones, plan_de_guardado: guardado, resultado: fin.resultado, marcas: fin.marcas, simulado: rev.dry_run })
}

// ───────────────────────── el vigía
export async function vigiar(P: Puertos, ahora: Date): Promise<{ reanudar: string[]; fallidos: string[]; cierres: Array<{ revision_id: string; resultado: string; devolver_a: unknown; client_id: string; artifact_id: string }> }> {
  const limite = new Date(ahora.getTime() - MINUTOS_PARA_DAR_POR_MUERTO * 60_000).toISOString()
  const vivos = await P.almacen.pasosCorriendoAntesDe(limite)
  const reanudar: string[] = [], fallidos: string[] = []
  const cierres: Array<{ revision_id: string; resultado: string; devolver_a: unknown; client_id: string; artifact_id: string }> = []
  for (const t of vivos) {
    const rev = await P.almacen.leerRevision(t.revision_id)
    if (!rev || esTerminal(rev)) continue
    const clave = `muerto:${t.paso}`
    const veces = rev.estado_del_motor.vueltas[clave] ?? 0
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: rev.estado_del_motor, gasto_usd: rev.gasto_usd, paso: { n: t.n, paso: t.paso, intento: (rev.estado_del_motor.vueltas[`fmt:${t.paso}`] ?? 0) + 1, tipo: 'agente', agente: null, estado: 'muerto', dispatch_key: null, concepto: 'modelo', base: 'usage', cost_usd: 0, error: `sin vuelta en ${MINUTOS_PARA_DAR_POR_MUERTO} min` } })
    if (veces >= 1) {
      await fallar(P, rev, `el paso «${t.paso}» murió dos veces (sin vuelta en ${MINUTOS_PARA_DAR_POR_MUERTO} min)`)
      fallidos.push(rev.id)
      cierres.push({ revision_id: rev.id, resultado: 'fallida', devolver_a: rev.devolver_a, client_id: rev.client_id, artifact_id: rev.artifact_id })
      continue
    }
    const estado = { ...rev.estado_del_motor, vueltas: { ...rev.estado_del_motor.vueltas, [clave]: veces + 1 } }
    await P.almacen.guardar({ revision_id: rev.id, estado_del_motor: estado, gasto_usd: rev.gasto_usd })
    reanudar.push(rev.id)
  }
  return { reanudar, fallidos, cierres }
}

export { desacuerdosDe }
export type { PayloadDeRevision }
export { CLAVE_DE_CORRECCION, CLAVE_DE_DECISION }
