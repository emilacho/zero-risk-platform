/**
 * 18-nov · R5 · ENSAYO EN SECO DE LA PRUEBA FINAL (PLAN-CC7-prueba-final-conjunta-v2 § 4 · GO de Lenovo, punto 3 · dueño CC3) · US$ 0: sin base, sin red, sin modelo.
 * Recorre el tramo de la CADENA de la prueba (§ 3, pasos 2–9) con dobles en el código, para TRES rubros:
 *   R · un restaurante con dos sedes (la forma de Náufrago) · T · una tienda en línea · S · un servicio profesional.
 *   abrir (camino B de Lenovo: campaña NUEVA con el mismo plan) → estrategia → lector (ficha de la oferta) → brief → gran idea (parada: aprobar) → calendario → hojas → chequeo exacto D1 → corrección al calendario.
 * Mide:
 *   1. que cada tramo se recorre y cada parada aparece;
 *   2. que en T y S no queda nada atado a comida ni a locales;
 *   3. que ningún «si ya existe» toma un resto: cada cliente tiene sembrada una campaña VIEJA con todo lo suyo, y nada de ella entra en la nueva;
 *   4. D1 encendido en el doble (una sede cerrada en los hechos de práctica de R): sale la línea en la hoja y el hallazgo con destino `calendario`.
 * Mesas → propuestas → jefatura → bandeja (pasos 10–11) viven en la oficina: van en la entrega 2 de este ensayo.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { fichaDeLaHoja } from '@/lib/oficina/sentido-contra-la-ficha'
import { chequeosExactos } from '@/lib/oficina/exactos-de-la-ficha'
import { calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar, type Estrategia } from '../index'
import { abrirCampana, hoyEnZona } from '../campanas'
import { fichasGuardar, fichasPreparar } from '../pasos'
import { briefAbrir, conceptoAbrir, conceptoDecidir, hojaEscribir, recibirBrief, recibirConcepto, TIPO_DE_ESPERA_DE_CONCEPTO } from '../mesas'
import { ACCIONES } from '../acciones'
import { CAMPO_OFERTA_CERRADA, CAMPO_PENDIENTES_DE_LA_FICHA } from '../hoja'
import type { Campana } from '../almacen'
import type { HechoDelNegocioPorOferta } from '../ficha-de-oferta'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const AHORA = '2026-11-18T15:00:00Z'
const wf = (x: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-ensayo', ...x })
const ok = (x: unknown, costo = 0) => ({ success: true, structured_output: x, cost_usd: costo })

// ───────────────────────────────────────── las tres fichas de práctica
type Practica = ClienteFixture & { rubro: string; cita: string; objetivo: string; ideas: Array<[string, string]> }
const horario = (dias: number[], abre: string, cierra: string) => Object.fromEntries(dias.map((d) => [d, [{ abre, cierra }]]))

function restaurante(): Practica {
  const a = clienteA()
  const e: Estrategia = { ...a.estrategia, patron_semanal: a.estrategia.patron_semanal.map((s, i) => ({ ...s, sede: i % 2 ? 'playa' : 'centro' })) }
  return {
    ...a, rubro: 'restaurante con dos sedes', clientId: 'practica-r-restaurante', estrategia: e, conocidos: ['Café Brisa', 'centro', 'playa'],
    sedes: [...a.sedes, { clave: 'playa', nombre: 'Café Brisa Playa', telefono: '0990000003', horario: horario([5, 6, 7], '08:00', '16:00') }],
    cita: 'Se publican 3 posts por semana en Instagram y 1 en Facebook', objetivo: 'presentar',
    ideas: [['instagram', 'carrusel'], ['instagram', 'foto'], ['facebook', 'foto']],
  }
}
const PLAN_T = [
  'Plan de 90 días de una tienda en línea de accesorios para bicicletas.',
  'Los canales son Instagram y Facebook. TikTok queda fuera del plan.',
  'Revisión de resultados los días 30, 60 y 90.',
  'Se publican 2 posts por semana en Instagram y 1 en Facebook.',
  'Los pedidos se reciben en la web a cualquier hora y se despachan a todo el país.',
].join(' ')
function tienda(): Practica {
  const b = clienteB()
  const id = 'practica-t-tienda-en-linea'
  const e: Estrategia = {
    ...b.estrategia,
    canales: b.estrategia.canales.filter((c) => c.red !== 'linkedin'),
    pilares: [{ clave: 'producto', nombre: 'El producto en uso', pct: 50 }, { clave: 'rutas', nombre: 'Rutas y consejos', pct: 25 }, { clave: 'clientes', nombre: 'Clientes', pct: 25 }],
    patron_semanal: [
      { slot: 'a', dia_semana: 2, hora: '19:00', red: 'instagram', formato: 'carrusel', pilar: 'producto', requiere_abierto: false, sede: 'tienda-en-linea' },
      { slot: 'b', dia_semana: 5, hora: '12:00', red: 'instagram', formato: 'foto', pilar: 'rutas', requiere_abierto: false, sede: 'tienda-en-linea' },
      { slot: 'c', dia_semana: 3, hora: '20:00', red: 'facebook', formato: 'foto', pilar: 'clientes', requiere_abierto: false, sede: 'tienda-en-linea' },
    ],
    fases: [{ clave: 'f1', dia_desde: 1, dia_hasta: 90, objetivo: 'vender en línea', cita_plan: 'Plan de 90 días' }],
  }
  return {
    ...b, rubro: 'tienda en línea', clientId: id, planTexto: PLAN_T, estrategia: e, conocidos: ['Rueda Libre', 'tienda-en-linea'], forbiddenWords: ['barato'],
    sedes: [{ clave: 'tienda-en-linea', nombre: 'Rueda Libre (web)', telefono: null, horario: horario([1, 2, 3, 4, 5, 6, 7], '00:00', '23:59') }],
    referencias: [
      { id: 'plan-t', client_id: id, origen: 'plan', texto: PLAN_T },
      { id: 'manual-t', client_id: id, origen: 'manual', texto: 'Tono entusiasta y técnico. Vendemos luces, candados y alforjas.' },
    ],
    cita: 'Se publican 2 posts por semana en Instagram y 1 en Facebook', objetivo: 'vender en línea',
    ideas: [['instagram', 'carrusel'], ['instagram', 'foto'], ['facebook', 'foto']],
  }
}
const PLAN_S = [
  'Plan de 90 días de un estudio contable para pequeñas empresas.',
  'Los canales son Instagram, Facebook y LinkedIn. TikTok queda fuera del plan.',
  'Revisión de resultados los días 30, 60 y 90.',
  'Se publican 2 posts por semana en Instagram, 1 en Facebook y 1 en LinkedIn.',
  'Las asesorías se agendan por videollamada.',
].join(' ')
function servicio(): Practica {
  const b = clienteB()
  const id = 'practica-s-servicio-profesional'
  const e: Estrategia = {
    ...b.estrategia,
    pilares: [{ clave: 'educacion', nombre: 'Impuestos claros', pct: 50 }, { clave: 'equipo', nombre: 'El equipo', pct: 25 }, { clave: 'casos', nombre: 'Casos', pct: 25 }],
    patron_semanal: b.estrategia.patron_semanal.map((s) => ({ ...s, sede: 'asesoria', requiere_abierto: false })),
  }
  return {
    ...b, rubro: 'servicio profesional', clientId: id, planTexto: PLAN_S, estrategia: e, conocidos: ['Cuentas Claras', 'asesoria'], forbiddenWords: ['garantizado'],
    sedes: [{ clave: 'asesoria', nombre: 'Asesoría contable', telefono: null, horario: horario([1, 2, 3, 4, 5], '09:00', '17:00') }],
    referencias: [
      { id: 'plan-s', client_id: id, origen: 'plan', texto: PLAN_S },
      { id: 'manual-s', client_id: id, origen: 'manual', texto: 'Tono sereno y preciso. Hablamos de impuestos sin miedo.' },
    ],
    cita: 'Se publican 2 posts por semana en Instagram, 1 en Facebook y 1 en LinkedIn', objetivo: 'posicionar',
    ideas: [['instagram', 'carrusel'], ['instagram', 'foto'], ['facebook', 'foto'], ['linkedin', 'texto']],
  }
}
const PRACTICAS: Array<[string, () => Practica]> = [['R', restaurante], ['T', tienda], ['S', servicio]]

// ───────────────────────────────────────── lo que devolverían los agentes (escrito a mano, por cliente)
const briefDe = (c: Practica) => [
  '## De qué parte del plan sale', `Fase 1: «${c.cita}».`,
  '## Insight', 'La gente decide en pocos segundos si algo es para ella.',
  '## Mensaje', 'Esto es para ti.',
  '## Público', 'Las personas que el plan nombra (del plan).', '## Cómo sabremos que funcionó', 'Consultas por semana contra la meta del plan, cada lunes.', '## Objetivo', 'Treinta consultas nuevas por semana.',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', `- prohibido: ${c.forbiddenWords.join('; ')}`,
  '## Faltantes', '- objetivo: el plan no trae un número de meta',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const conceptoDe = (c: Practica, titulo = 'Para ti · Noventa días cerca') => [
  `## Gran idea  ${titulo}`,
  '## Por qué funciona  El insight dice que se decide en segundos; la idea lo vuelve evidente.',
  '## Cómo se ve  Luz natural, planos cerrados.',
  '## Cómo suena  Voz cercana, frases cortas.',
  `## Capítulo f1 · Abrir`, `Qué cuenta: empezamos · Objetivo de la fase (cita): «${c.objetivo}» · Cómo se ve en este capítulo: planos cerrados`,
  '## Banco de ideas',
  ...c.ideas.map(([red, formato], i) => `- C1-I0${i + 1} · ${red} · ${formato} · idea ${i + 1} · mensaje: esto es para ti · gancho: ¿ya lo viste? · protagonista: el producto · serie: ninguna · foto:ninguna`),
  '## Caminos descartados y por qué', '- «Lo de siempre»: no dice nada nuevo',
].join('\n')
const D = (valor: string) => ({ valor, fuente: 'manual:1', vigente_desde: '', vigente_hasta: '', red: '' })
const vacia = (clave: string, nombre: string) => ({ clave, nombre, que_es: [D(`qué es ${nombre}`)], para_quien_y_donde: [], se_puede_afirmar: [D(`se afirma de ${nombre}`)], no_se_puede_afirmar: [], oferta_y_precio: [], como_se_compra: [], que_mostrar: [], que_nunca_mostrar: [], obligatorios_legales: [], objetivo_por_fecha: [] })
const lectorDe = (c: Practica, pendientes: string[] = []) => ({ fichas: c.sedes.map((s) => vacia(s.clave, s.nombre ?? s.clave)), pendientes })

// ───────────────────────────────────────── el doble: el cliente como queda tras la limpieza del camino (B) de Lenovo
// La campaña del plan (`plan-1`) ya NO existe (R2 la borró). Para la medida 3 queda sembrada una campaña VIEJA, cerrada y de OTRO plan, con todo lo suyo.
// `conLaDelPlan`: el control · la campaña del mismo plan todavía está (como si R2 no la hubiera borrado) → `abrir` tiene que contestar `ya_abierta`.
// `sinVieja`: el cliente sin ninguna campaña anterior.
const NO_VAN_A_LA_HOJA = new Set(['esquema', 'cancelada', 'espera_video', 'vencida_sin_brazo', 'perdio_su_fecha', 'descartada_sin_fuente']) // = mesas.ts:799
const VIEJA = 'campana-vieja', DEL_PLAN = 'campana-del-plan-sin-borrar'
const RESTO = 'RESTO-DE-LA-CAMPANA-VIEJA'
type OpcionesDelDoble = { hechos?: HechoDelNegocioPorOferta[]; conLaDelPlan?: boolean; sinVieja?: boolean }
function doble(c: Practica, o: OpcionesDelDoble = {}) {
  const { hechos } = o
  const al = new AlmacenMemoria({
    contextos: { [c.clientId]: { ...contextoDe(c), zonaHoraria: 'America/Guayaquil' } },
    planes: { [c.clientId]: [{ plan_id: 'plan-viejo', fecha: '2026-09-01' }, { plan_id: 'plan-1', fecha: '2026-11-06' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida', nuevo_orden: { clientes: [c.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: c.clientId }],
  })
  const base: Campana = {
    id: DEL_PLAN, client_id: c.clientId, plan_id: 'plan-1', fecha_inicio: '2026-11-06', fecha_inicio_origen: 'regla', fecha_fin: '2027-02-03', zona_horaria: 'America/Guayaquil', pais: 'EC',
    sedes: c.sedes.map((s) => s.clave), estado: 'pausada', estado_motivo: 'pausada para la prueba final', presupuesto_planificacion_usd: 6, ventana_parte_dias: 10,
    sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false,
  }
  if (o.conLaDelPlan) al.campanas.push(base)
  if (o.sinVieja) { if (hechos) al.hechos = hechos; return al }
  al.campanas.push({ ...base, id: VIEJA, plan_id: 'plan-viejo', estado: 'cerrada', estado_motivo: 'campaña vieja', fecha_inicio: '2026-09-01', fecha_fin: '2026-11-29' })
  // todo lo de la vieja: si algún «si ya existe» lo tomara, el texto RESTO aparecería en la nueva
  al.estrategias.push({ campana_id: VIEJA, version: 3, estado: 'validada', contenido: { ...c.estrategia, pilares: [{ clave: 'resto', nombre: RESTO, pct: 100 }] }, agente: 'x', modelo: null, costo_usd: 0, workflow_execution_id: 'viejo', seco: true })
  al.fichasDeOferta.push({ campana_id: VIEJA, version: 2, fichas: [{ clave: c.sedes[0].clave, que_es: { valor: RESTO, fuente: 'manual:viejo' } }], pendientes: [] } as never)
  const conResto = (t: string) => `${t}\n\n${RESTO}`
  al.briefsCreativos.push({ campana_id: VIEJA, version: 4, estado: 'validada', texto_md: conResto(briefDe(c)), leido: { resto: RESTO }, devolucion_texto: null, motivo: null, costo_usd: 0, encargo_id: 'viejo' } as never)
  al.conceptos.push({ campana_id: VIEJA, version: 2, estado: 'lista', aprobacion: 'aprobado', texto_md: conResto(conceptoDe(c, `${RESTO} · vieja`)), leido: { resto: RESTO }, brief_devuelto: null, motivo: null, costo_usd: 0 } as never)
  al.filasGuardadas.push({ id: 'fila-vieja', campana_id: VIEJA, calendario_version: 1, tanda: 1, semana: 1, dia_semana: 1, fecha: '2026-11-23', hora: '12:00', red: 'instagram', formato: 'foto', pilar: 'resto', tema: RESTO, sede: c.sedes[0].clave, requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'validada', avisos: [], fase: 'f1', idea_ref: 'C1-I01' } as never)
  if (hechos) al.hechos = hechos
  return al
}

type Tramo = { paso: string; status: number; cuerpo: Record<string, unknown> }
/** el paso 1 del camino (B): `abrir` con el mismo plan; contesta 201 con una campaña NUEVA (`ya_abierta` = 200 cuenta aquí como falla del paso) */
async function abrirLaDelPlan(c: Practica, al: AlmacenMemoria) {
  const r = await abrirCampana(al, wf({ client_id: c.clientId, plan_id: 'plan-1', seco: false }), AHORA)
  const id = (r.cuerpo.campana as { id?: string } | undefined)?.id ?? ''
  return { r, id, nueva: r.status === 201 && !r.cuerpo.ya_abierta && id !== '' && id !== VIEJA && id !== DEL_PLAN }
}
async function recorrer(c: Practica, al: AlmacenMemoria, o: { pendientesDelLector?: string[] } = {}) {
  const t: Tramo[] = []
  const anota = (paso: string, r: { status: number; cuerpo: Record<string, unknown> }) => { t.push({ paso, status: r.status, cuerpo: r.cuerpo }); return r }
  const ab = await abrirLaDelPlan(c, al)
  anota('abrir', { status: ab.nueva ? 200 : 409, cuerpo: ab.r.cuerpo })
  const NUEVA = ab.id
  const pe = anota('estrategia·preparar', await estrategiaPreparar(al, wf({ campana_id: NUEVA }), AHORA))
  anota('estrategia·guardar', await estrategiaGuardar(al, wf({ campana_id: NUEVA, corrida_id: pe.cuerpo.corrida_id, resultado: ok(c.estrategia) }), AHORA))
  const pf = anota('lector·preparar', await fichasPreparar(al, wf({ campana_id: NUEVA }), AHORA))
  anota('lector·guardar', await fichasGuardar(al, wf({ campana_id: NUEVA, corrida_id: pf.cuerpo.corrida_id, resultado: ok(lectorDe(c, o.pendientesDelLector)) })))
  anota('brief·abrir', await briefAbrir(al, wf({ campana_id: NUEVA }), AHORA))
  const rb = await recibirBrief(al, { campana_id: NUEVA, version: 1, encargo_id: 'enc-brief', texto: briefDe(c), costo_usd: 0, motivo: null }, AHORA)
  anota('brief·entregar', { status: rb.ok && (rb as { estado?: string }).estado === 'validada' ? 200 : 409, cuerpo: { ...(rb as object), devolucion: (await al.ultimoBriefCreativo(NUEVA))?.devolucion_texto } as never })
  anota('gran-idea·abrir', await conceptoAbrir(al, wf({ campana_id: NUEVA }), AHORA))
  const rc = await recibirConcepto(al, { campana_id: NUEVA, version: 1, encargo_id: 'enc-idea', texto: conceptoDe(c), costo_usd: 0, motivo: null }, AHORA)
  anota('gran-idea·entregar', { status: rc.ok ? 200 : 409, cuerpo: rc as never })
  const parada = al.esperas.filter((e) => e.campana_id === NUEVA && e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO && e.estado === 'viva')
  anota('PARADA·aprobar-la-gran-idea', { status: parada.length === 1 ? 200 : 409, cuerpo: { esperas: parada.length, todas: al.esperas.map((e) => [e.objeto_tipo, e.estado]) } })
  anota('gran-idea·decidir', await conceptoDecidir(al, wf({ campana_id: NUEVA, decision: 'aprobar' }), AHORA))
  const sigueViva = al.esperas.filter((e) => e.campana_id === NUEVA && e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO && e.estado === 'viva').length
  anota('PARADA·se-cierra-al-aprobar', { status: sigueViva === 0 ? 200 : 409, cuerpo: { vivas: sigueViva } })
  const pc = anota('calendario·preparar', await calendarioPreparar(al, wf({ campana_id: NUEVA, tanda: 1 }), AHORA))
  anota('calendario·guardar', await calendarioGuardar(al, wf({ campana_id: NUEVA, tanda: 1, corrida_id: pc.cuerpo.corrida_id, resultado: ok(tandaBuena(c)) }), AHORA))
  // con (B) el día 1 lo pone el plan (no hoy): lo que cae antes de hoy + el plazo de producción queda `perdio_su_fecha` (pasos.ts:405). La hoja es la de la PRIMERA semana que va a la hoja.
  const semana = Math.min(...al.filasGuardadas.filter((f) => f.campana_id === NUEVA && !NO_VAN_A_LA_HOJA.has(f.estado)).map((f) => f.semana))
  anota('hojas', await hojaEscribir(al, wf({ campana_id: NUEVA, semana }), AHORA))
  return Object.assign(t, { id: NUEVA })
}

describe('R5 · ensayo con dobles · el tramo de la cadena en tres rubros', () => {
  for (const [nombre, hacer] of PRACTICAS) {
    it(`${nombre} · se recorre entero`, async () => {
      const c = hacer()
      const al = doble(c)
      const t = await recorrer(c, al)
      expect(t.map((x) => `${x.paso}:${x.status}`), JSON.stringify(t.filter((x) => x.status !== 200).map((x) => [x.paso, x.cuerpo]))).toEqual(t.map((x) => `${x.paso}:200`))
      // la hoja salió de ESTA campaña: sus filas, su brief v1 y su gran idea v1
      const hoja = t.find((x) => x.paso === 'hojas')!.cuerpo
      expect(hoja).toMatchObject({ brief_version: 1, concepto_version: 1 })
      expect((hoja.filas as string[]).length).toBeGreaterThan(0)
    })
  }
})

// ── 19-nov · ADENDA 1 · P2 (CC5): lo que el lector de fichas NO pudo saber llega a la hoja de cada pieza, por el camino entero (lector → hoja)
describe('ADENDA 1 · P2 · los pendientes del lector llegan a la hoja', () => {
  it('🔴 un pendiente del lector aparece en la sección de CADA pieza de la hoja, como pendiente', async () => {
    const c = restaurante()
    const al = doble(c)
    const PENDIENTE = 'Si el canal de pedidos directos está activo'
    const t = await recorrer(c, al, { pendientesDelLector: [PENDIENTE] })
    expect((await al.ultimasFichas(t.id))!.pendientes).toEqual([PENDIENTE])
    const hoja = t.find((x) => x.paso === 'hojas')!.cuerpo
    const filas = hoja.filas as string[]
    expect(filas.length).toBeGreaterThan(0)
    for (const id of filas) expect(parsearBrief(hoja.hoja as string, id)!.texto, id).toContain(`- ${CAMPO_PENDIENTES_DE_LA_FICHA}:\n  - ${PENDIENTE}`)
  })
})

// ── 2 · en la tienda en línea y en el servicio profesional no queda nada atado a comida ni a locales
// Se lee TODO lo que la cadena le pasa a un agente o a la oficina (las tareas de cada paso y la hoja). Lo de la propia ficha de práctica no cuenta.
// Dos excepciones medidas el 18-nov (las 52 coincidencias de la primera corrida eran de estas dos): «mesa» es el nombre interno de cada equipo de agentes
// (la mesa de la gran idea, la de creativos), y «feriados locales» habla de feriados. Ninguna de las dos habla de comida ni de un local.
const COMIDA_O_LOCAL = /\b(comida|platos?|men[uú]|restaurantes?|cocina|desayun\w*|almuerz\w*|cenas?|brunch|caf[eé]|cafeter[ií]a|bebidas?|(?<!feriados )locales?|local físico|sucursal(es)?|en persona|visítanos)\b/gi
describe('R5 · 1b · el arranque del camino (B): `abrir` con el mismo plan', () => {
  for (const [nombre, hacer] of PRACTICAS) {
    it(`${nombre} · contesta 201 con una campaña NUEVA del plan, día 1 = HOY (18-nov · DECISIÓN DE EMILIO: ya no se hereda del plan), y nada queda antes del día 1`, async () => {
      const c = hacer()
      const al = doble(c)
      const t = await recorrer(c, al)
      const camp = al.campanas.find((x) => x.id === t.id)!
      expect(camp).toMatchObject({ plan_id: 'plan-1', estado: expect.any(String) })
      expect([VIEJA, DEL_PLAN]).not.toContain(t.id)
      expect(camp.fecha_inicio).toBe(hoyEnZona(AHORA, camp.zona_horaria))
      expect(camp.fecha_inicio_origen).toBe('regla')
      // el patrón no pone nada antes del día 1; una pieza del agente que cayera ahí queda bloqueada (V04), nunca validada
      expect(al.filasGuardadas.filter((f) => f.campana_id === t.id && f.fecha < camp.fecha_inicio && f.estado === 'validada')).toEqual([])
    })
  }
  it('control: si la campaña del mismo plan NO se borró (R2 fallida), `abrir` contesta `ya_abierta` y el tramo no arranca', async () => {
    const c = restaurante()
    const ab = await abrirLaDelPlan(c, doble(c, { conLaDelPlan: true }))
    expect(ab.r.status).toBe(200)
    expect(ab.r.cuerpo.ya_abierta).toBe(true)
    expect(ab.nueva).toBe(false)
  })
  it('el cliente SIN ninguna campaña anterior (el real tras la limpieza): `abrir` crea y el tramo se recorre igual', async () => {
    const c = tienda()
    const t = await recorrer(c, doble(c, { sinVieja: true }))
    expect(t.map((x) => `${x.paso}:${x.status}`)).toEqual(t.map((x) => `${x.paso}:200`))
  })
})

describe('R5 · 2 · sin comida ni locales en otros rubros', () => {
  for (const [nombre, hacer] of PRACTICAS.filter(([n]) => n !== 'R')) {
    it(`${nombre} · lo que reciben los agentes y la oficina no habla de comida ni de locales`, async () => {
      const c = hacer()
      const t = await recorrer(c, doble(c))
      const hits = t.flatMap((x) => [...JSON.stringify(x.cuerpo).matchAll(COMIDA_O_LOCAL)].map((m) => `${x.paso}: «${JSON.stringify(x.cuerpo).slice(Math.max(0, m.index! - 60), m.index! + 40)}»`))
      expect(hits).toEqual([])
    })
  }
})

// ── 3 · ningún «si ya existe» toma un resto de la campaña vieja del mismo cliente
describe('R5 · 3 · nada de la campaña vieja entra en la nueva', () => {
  for (const [nombre, hacer] of PRACTICAS) {
    it(`${nombre} · cada paso escribe su versión 1 para la campaña de la prueba y nada lleva el texto de la vieja`, async () => {
      const c = hacer()
      const al = doble(c)
      const t = await recorrer(c, al)
      expect(t.filter((x) => JSON.stringify(x.cuerpo).includes(RESTO)).map((x) => x.paso)).toEqual([])
      expect(t.filter((x) => x.cuerpo.ya_hecha || x.cuerpo.ya_abierta).map((x) => x.paso)).toEqual([])
      expect((await al.ultimaEstrategia(t.id))!.version).toBe(1)
      expect((await al.ultimasFichas(t.id))!.version).toBe(1)
      expect(JSON.stringify(await al.ultimasFichas(t.id))).not.toContain(RESTO)
      expect((await al.ultimoBriefCreativo(t.id))!.version).toBe(1)
      expect((await al.conceptosDe(t.id)).map((k) => k.version)).toEqual([1])
      expect(al.filasGuardadas.filter((f) => f.campana_id === t.id).some((f) => f.tema === RESTO || f.id === 'fila-vieja')).toBe(false)
      // y la vieja quedó como estaba
      expect(al.campanas.find((x) => x.id === VIEJA)!.estado).toBe('cerrada')
      expect(al.filasGuardadas.filter((f) => f.campana_id === VIEJA)).toHaveLength(1)
    })
  }
})

// ── 4 · D1 encendido en el doble: una sede de práctica cerrada ⇒ la línea en la hoja, el hallazgo con destino `calendario` y la corrección entra a la cadena
describe('R5 · 4 · D1 en el doble (sede cerrada SOLO en los hechos de práctica)', () => {
  const CIERRE: HechoDelNegocioPorOferta = { oferta: 'playa', sede_id: null, tipo: 'cierre_retiro', valor: 'la sede de la playa cerró por temporada', vigente_desde: '2026-11-01', vigente_hasta: null, fuente: 'dueno · ficha:practica', fecha_de_la_fuente: '2026-11-17', confianza: 'alta' }
  it('🔴 R · las piezas de la sede cerrada llevan la línea; D1 las manda al calendario como regla dura; las de la sede abierta no', async () => {
    const c = restaurante()
    const al = doble(c, { hechos: [CIERRE] })
    const t = await recorrer(c, al)
    const hoja = t.find((x) => x.paso === 'hojas')!.cuerpo
    expect(hoja.filas, JSON.stringify(hoja)).toBeDefined()
    const filas = al.filasGuardadas.filter((f) => f.campana_id === t.id && (hoja.filas as string[]).includes(f.id))
    const playa = filas.filter((f) => f.sede === 'playa'), centro = filas.filter((f) => f.sede === 'centro')
    expect(playa.length).toBeGreaterThan(0)
    expect(centro.length).toBeGreaterThan(0)
    for (const f of filas) {
      const s = parsearBrief(hoja.hoja as string, f.id)!.texto
      const ficha = fichaDeLaHoja(s)
      const d1 = chequeosExactos(ficha, '').hallazgos.filter((h) => /^D1 · /.test(h.que))
      if (f.sede === 'playa') {
        expect(s).toContain(`- ${CAMPO_OFERTA_CERRADA}: la sede de la playa cerró por temporada`)
        expect(d1).toEqual([expect.objectContaining({ destino: 'calendario', origen: 'codigo' })])
        const r = await ACCIONES.correcciones.recibir(al, wf({ campana_id: t.id, fila_id: f.id, destino: 'calendario', motivo: d1[0].que, linea_de_la_ficha: d1[0].linea_de_la_ficha, encargo_id: `enc-${f.id}`, dura: true, regla: 'D1', origen: 'codigo' }), AHORA)
        expect(r.status, JSON.stringify(r.cuerpo)).toBe(201)
      } else {
        expect(s).not.toContain(CAMPO_OFERTA_CERRADA)
        expect(d1).toEqual([])
      }
    }
    expect(al.correcciones.filter((k) => k.campana_id === t.id && k.destino === 'calendario')).toHaveLength(playa.length)
  })
  it('sin el hecho de cierre, la misma corrida no escribe la línea ni dispara D1 (las sedes reales nunca se tocan: todo es del doble)', async () => {
    const c = restaurante()
    const t = await recorrer(c, doble(c, { hechos: [] }))
    expect(String(t.find((x) => x.paso === 'hojas')!.cuerpo.hoja)).not.toContain(CAMPO_OFERTA_CERRADA)
  })
})

describe('ADENDA 1 · P2b · el calendario lee del brief validado el público y los hechos de las ofertas', () => {
  it('🔴 la tarea real del calendario (con la gran idea aprobada) trae el «Público» del brief, entero y en su <documento>', async () => {
    const c = restaurante()
    const t = await recorrer(c, doble(c))
    const tarea = String(((t.find((x) => x.paso === 'calendario·preparar')!.cuerpo.run_sdk as { task: string }).task))
    expect(tarea).toContain('# EL BRIEF DE LA CAMPAÑA (lo que dice del público y de las ofertas)\n<documento fuente="el brief de la campaña">\n## Público\nLas personas que el plan nombra (del plan).')
    // el brief de práctica no trae «Hechos de las ofertas»: la tarea lo dice, no lo inventa
    expect(tarea).toContain('## Hechos de las ofertas\n(el brief no trae esta sección)\n</documento>')
    // y va con los documentos, ARRIBA de la instrucción
    expect(tarea.indexOf('# EL BRIEF DE LA CAMPAÑA')).toBeLessThan(tarea.indexOf('# Qué te pido'))
  })
})
