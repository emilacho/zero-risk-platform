/**
 * Ayudas de prueba de la jefatura (oficina propia): las 6 filas de política tal como las siembra la migración J1, un almacén EN MEMORIA y un conductor que contesta los turnos con los moldes del seco.
 * Sin base, sin red, sin modelo: US$ 0.
 */
import { estadoInicial, type ResultadoDelRevisor } from '../../src/lib/revision-comun'
import { politicaDeFila, type Almacen, type CambiosDeRevision, type ConfigDeJefatura, type LecturaDePolitica, type NuevaRevision, type PasoRegistrado, type PoliticaDeRevision, type Puertos, type Revision, type TipoDeRevision } from '../../src/lib/jefatura/revision'
import { avanzar, abrirRevision, recibirResultado, type Respuesta } from '../../src/lib/jefatura/revision/orquestador'

const DOC = (clave: string, titulo: string, funcion: string) => ({ clave, titulo, funcion })
const MANUAL = DOC('manual', 'Manual de marca vigente', 'manda si dos documentos se contradicen')
const TOPES = (rf: number, c: number | undefined, sm: number, d: number | undefined) => ({ revision_fondo: rf, ...(c !== undefined ? { correccion: c } : {}), segunda_mirada: sm, ...(d !== undefined ? { decision: d } : {}) })

/** las 6 filas de J1 (clase revision), tal cual su SEED; `is_active` lo pone cada prueba */
export const FILAS_DE_POLITICA: Record<string, Record<string, unknown>> = {
  plan: {
    artifact_type: 'plan', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: 'jefe-marketing', revisor_ciego: true, revisor_ciego_modelo_env: 'JEFATURA_REVISOR_MODEL',
    contra_que: { documentos: [MANUAL, DOC('ficha', 'Ficha del cliente', 'hechos del negocio'), DOC('hechos_del_dueno', 'Lo que dijo el dueño', 'correcciones del dueño; mandan sobre la investigación')] },
    productores: [{ donde: '*', agente: 'campaign-brief-agent' }], esquema_correccion: 'plan_texto_y_resolucion.v1', huecos_pregunta: { que_es: 'el plan de campaña de 90 días', uso: 'guiar toda la producción de la campaña' },
    indicacion_fondo: 'Estás revisando el plan de 90 días contra {documentos}.', chequeos_previos: ['revisarPlan'], tope_revision_usd: 5, tope_paso_usd: { revision_fondo: 0.2, correccion: 2, segunda_mirada: 0.5, decision: 2 }, destino_cierre: 'siguiente_paso', reentrega: 'version_nueva', is_active: false,
  },
  estrategia: {
    artifact_type: 'estrategia', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: 'jefe-marketing', revisor_ciego: true, revisor_ciego_modelo_env: 'JEFATURA_REVISOR_MODEL',
    contra_que: { documentos: [MANUAL, DOC('plan', 'Plan vigente', 'la estrategia sale de él')] }, productores: [{ donde: '*', agente: 'social-media-strategist' }], esquema_correccion: 'resolucion_objeto.v1',
    huecos_pregunta: { que_es: 'la estrategia de contenido', uso: 'ordenar el calendario de la campaña' }, indicacion_fondo: 'Estás revisando la estrategia contra {documentos}.', chequeos_previos: ['validarEstrategia'],
    tope_revision_usd: 2.5, tope_paso_usd: TOPES(0.2, 0.6, 0.5, 0.6), destino_cierre: 'siguiente_paso', reentrega: 'completa', is_active: false,
  },
  calendario: {
    artifact_type: 'calendario', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: 'jefe-marketing', revisor_ciego: true, revisor_ciego_modelo_env: 'JEFATURA_REVISOR_MODEL',
    contra_que: { documentos: [MANUAL, DOC('plan', 'Plan vigente', 'el calendario sale de él'), DOC('estrategia', 'Estrategia validada', 'ordena los temas'), DOC('fechas', 'Fechas verificadas', 'fechas y feriados ya comprobados')] },
    productores: [{ donde: '*', agente: 'social-media-strategist' }], esquema_correccion: 'resolucion_parcial.v1', huecos_pregunta: { que_es: 'el calendario de publicación', uso: 'programar las piezas de la campaña' },
    indicacion_fondo: 'Estás revisando el calendario contra {documentos}.', chequeos_previos: ['validarTodo'], tope_revision_usd: 2.5, tope_paso_usd: TOPES(0.2, 0.6, 0.5, 0.6), destino_cierre: 'siguiente_paso', reentrega: 'parcial', is_active: false,
  },
  brief: {
    artifact_type: 'brief', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: 'jefe-marketing', revisor_ciego: true, revisor_ciego_modelo_env: 'JEFATURA_REVISOR_MODEL',
    contra_que: { documentos: [MANUAL, DOC('plan', 'Plan vigente', 'el brief sale de él'), DOC('calendario', 'Filas del calendario', 'las filas que originaron cada brief')] },
    productores: [{ donde: '*', agente: 'campaign-brief-agent' }], esquema_correccion: null, huecos_pregunta: { que_es: 'el parte de briefs', uso: 'encargar las piezas de la campaña' },
    indicacion_fondo: 'Estás revisando el parte de briefs contra {documentos}.', chequeos_previos: ['chequeos_del_brief'], tope_revision_usd: 1, tope_paso_usd: TOPES(0.2, undefined, 0.5, undefined), destino_cierre: 'siguiente_paso', reentrega: 'ninguna', is_active: false,
  },
  pieza: {
    artifact_type: 'pieza', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: 'jefe-marketing', revisor_ciego: true, revisor_ciego_modelo_env: 'JEFATURA_REVISOR_MODEL',
    contra_que: { documentos: [MANUAL, DOC('plan', 'Plan vigente', 'la pieza sale de él'), DOC('brief', 'Brief de la pieza', 'guía, no regla'), DOC('material_portero', 'Material del portero', 'lo que el cerebro entregó para esta pieza'), DOC('visual_direction', 'Dirección visual', 'la imagen que se decidió')] },
    productores: [{ donde: 'texto', agente: 'content-creator' }, { donde: 'imagen', agente: 'marketing_instagram_curator' }], esquema_correccion: 'resolucion.v1', huecos_pregunta: { que_es: 'una pieza', uso: 'publicar en la red del cliente' },
    indicacion_fondo: 'No repartes trabajo ni asignas tareas a otros. Revisas una sola vez. Entregas fichas con qué, dónde, contra qué, gravedad y propuesta. No reescribes la pieza: señalas y propones. La imagen también es parte de la pieza: revísala contra el manual y el brief.',
    chequeos_previos: ['chequeos', 'chequeos_2'], tope_revision_usd: 1.5, tope_paso_usd: TOPES(0.2, 0.2, 0.5, 0.2), destino_cierre: 'bandeja', reentrega: 'parcial', is_active: false,
  },
  manual: { artifact_type: 'manual', artifact_class: 'revision', judgment_enabled: false, revisor_fondo: null, revisor_ciego: false, reentrega: 'ninguna', productores: [], is_active: false },
}

export const politica = (tipo: TipoDeRevision, cambios: Partial<Record<string, unknown>> = {}): PoliticaDeRevision => {
  const r = politicaDeFila({ ...FILAS_DE_POLITICA[tipo], ...cambios })
  if (!r.ok) throw new Error(r.error)
  return r.politica
}

export interface Rastro { guardados: CambiosDeRevision[]; avisos: string[]; llamadasAlRevisor: Array<{ texto: string; imagenes_urls: string[]; dry_run: boolean }> }

export function almacenEnMemoria(o: { config?: ConfigDeJefatura; filas?: Record<string, Record<string, unknown>>; activas?: string[] } = {}): { almacen: Almacen; revisiones: Map<string, Revision>; pasos: Map<string, PasoRegistrado[]>; config: ConfigDeJefatura } {
  const config: ConfigDeJefatura = o.config ?? { estado: 'ensayo', tipos_activos: ['plan', 'estrategia', 'calendario', 'brief', 'pieza'], clientes_ensayo: ['cliente-prueba'] }
  const revisiones = new Map<string, Revision>()
  const pasos = new Map<string, PasoRegistrado[]>()
  let seq = 0
  const filas = o.filas ?? FILAS_DE_POLITICA
  const almacen: Almacen = {
    async leerConfig() { return config },
    async leerPolitica(tipo): Promise<LecturaDePolitica> {
      const f = filas[tipo]
      if (!f) return { ok: false, error: `sin renglón para «${tipo}»`, existe: false }
      const r = politicaDeFila({ ...f, is_active: (o.activas ?? []).includes(tipo) })
      return r.ok ? { ok: true, politica: r.politica, activa: r.politica.is_active } : { ok: false, error: r.error, existe: true }
    },
    async crearRevision(n: NuevaRevision) {
      for (const x of revisiones.values()) if (x.artifact_type === n.artifact_type && x.artifact_id === n.artifact_id && x.version === n.version && x.dry_run === n.dry_run) return { ok: true as const, revision: x, nuevo: false }
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
      const rev: Revision = { id, client_id: n.client_id, artifact_type: n.artifact_type, artifact_id: n.artifact_id, version: n.version, journey_id: n.journey_id, estado: 'abierta', resultado: null, marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, estado_del_motor: n.estado_del_motor ?? estadoInicial(), productores: n.productores, entrada: n.entrada, devolver_a: n.devolver_a, policy: n.policy, tope_usd: n.tope_usd, gasto_usd: 0, dry_run: n.dry_run, prueba: n.prueba }
      revisiones.set(id, rev)
      return { ok: true as const, revision: rev, nuevo: true }
    },
    async leerRevision(id) { const r = revisiones.get(id); return r ? { ...r } : null },
    async pasoAbierto(id) { return [...(pasos.get(id) ?? [])].reverse().find((p) => p.estado === 'corriendo') ?? null },
    async pasosCorriendoAntesDe() { return [...pasos.entries()].flatMap(([revision_id, ps]) => ps.filter((p) => p.estado === 'corriendo').map((p) => ({ revision_id, n: p.n, paso: p.paso }))) },
    async guardar(c) {
      const r = revisiones.get(c.revision_id)
      if (!r) throw new Error('revisión inexistente en el almacén de prueba')
      revisiones.set(c.revision_id, { ...r, estado_del_motor: c.estado_del_motor, gasto_usd: c.gasto_usd, ...(c.estado ? { estado: c.estado } : {}), ...(c.resultado ? { resultado: c.resultado } : {}), ...(c.marcas ? { marcas: c.marcas } : {}) })
      if (c.paso) {
        const lista = pasos.get(c.revision_id) ?? []
        const i = lista.findIndex((p) => p.n === c.paso!.n)
        if (i >= 0) lista[i] = c.paso
        else lista.push(c.paso)
        pasos.set(c.revision_id, lista)
      }
    },
  }
  return { almacen, revisiones, pasos, config }
}

export function puertosDePrueba(o: { almacen?: ReturnType<typeof almacenEnMemoria>; revisor?: (p: { texto: string; imagenes_urls: string[] }) => ResultadoDelRevisor } = {}): { P: Puertos; mem: ReturnType<typeof almacenEnMemoria>; rastro: Rastro } {
  const mem = o.almacen ?? almacenEnMemoria()
  const rastro: Rastro = { guardados: [], avisos: [], llamadasAlRevisor: [] }
  const guardar = mem.almacen.guardar.bind(mem.almacen)
  mem.almacen.guardar = async (c) => { rastro.guardados.push(c); return guardar(c) }
  const P: Puertos = {
    almacen: mem.almacen,
    ahora: () => new Date('2026-10-13T12:00:00Z'),
    async revisor(p) { rastro.llamadasAlRevisor.push({ texto: p.texto, imagenes_urls: p.imagenes_urls, dry_run: p.dry_run }); return o.revisor ? o.revisor(p) : { ok: true, texto: 'opinión real simulada por la prueba', costo_usd: 0.04, modelo: 'gpt-prueba' } },
    async avisar(p) { rastro.avisos.push(p.texto) },
  }
  return { P, mem, rastro }
}

export const TEXTO_DEL_PLAN = `# Plan de 90 días\n${'Este es un párrafo del plan con datos del negocio y sus fuentes. '.repeat(60)}\n## 8 · Lo que falta\nDatos pendientes declarados.`

export const sobre = (tipo: TipoDeRevision, o: { id?: string; texto?: string; dry_run?: boolean; simulacion?: Record<string, unknown>; payload?: Record<string, unknown>; client_id?: string } = {}): Record<string, unknown> => ({
  artifact_type: tipo, artifact_id: o.id ?? `${tipo}-1`, client_id: o.client_id ?? 'cliente-prueba', journey_id: 'journey-1',
  payload: {
    texto: o.texto ?? (tipo === 'plan' ? TEXTO_DEL_PLAN : tipo === 'pieza' ? 'Pie de foto original\n\n#uno #dos' : `texto de ${tipo}`), dry_run: o.dry_run ?? true,
    devolver_a: { tipo: 'webhook', destino: 'https://n8n.invalid/webhook/jefatura' },
    contexto: [{ titulo: 'Manual de marca vigente', texto: 'Tono cercano. Tuteo.', funcion: 'manda' }],
    ...(tipo === 'plan' ? { pedido_del_plan: 'PEDIDO ORIGINAL DEL PLAN (datos reunidos, hechos del dueño, registro, referencia)' } : {}),
    ...(o.simulacion ? { simulacion: o.simulacion } : {}), ...(o.payload ?? {}),
  },
})

export interface Corrida { aperturas: Respuesta[]; turnos: Array<{ n: number; paso: string; agente: string | null; pedido: Record<string, unknown> }>; final: Respuesta }

/**
 * Conductor: abre y contesta cada turno con el MOLDE del seco (o con `responder`, que puede devolver `{texto}` o `{error}`); termina al cerrar.
 */
export async function correr(P: Puertos, cuerpo: Record<string, unknown>, responder?: (t: { n: number; paso: string; pedido: Record<string, unknown> }) => { texto?: string; error?: string; costo_usd?: number } | undefined): Promise<Corrida> {
  const aperturas: Respuesta[] = []
  const turnos: Corrida['turnos'] = []
  let rsp = await abrirRevision(P, cuerpo)
  aperturas.push(rsp)
  const id = String(rsp.cuerpo.revision_id ?? '')
  for (let i = 0; i < 40 && rsp.cuerpo.accion === 'esperar'; i++) {
    const t = rsp.cuerpo.turno as { n: number; paso: string; agente: string | null; pedido: Record<string, unknown> }
    turnos.push({ n: t.n, paso: t.paso, agente: t.agente, pedido: t.pedido })
    const propio = responder?.({ n: t.n, paso: t.paso, pedido: t.pedido })
    const molde = (t.pedido.molde as { texto: string | null; error?: string } | undefined) ?? { texto: null, error: 'sin molde' }
    const res = propio ?? (molde.texto === null ? { error: molde.error ?? 'sin molde' } : { texto: molde.texto })
    rsp = await recibirResultado(P, id, t.n, res)
  }
  return { aperturas, turnos, final: rsp }
}

export { abrirRevision, avanzar, recibirResultado }
