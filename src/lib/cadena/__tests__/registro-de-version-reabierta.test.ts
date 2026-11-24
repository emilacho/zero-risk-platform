/**
 * 24-nov · ARREGLO A (GO de Lenovo 18:30Z) · la versión REABIERTA (retomar donde se cayó, #1279) pasa por una revisión de registro NUEVA.
 * Lo que pasó en vivo: la gran idea v1 se reabrió y la mesa la entregó otra vez, pero la espera (`dedup_key`) y la revisión de la jefatura (`artifact_id`) chocaron con las de
 * la primera pasada, ya cerradas. La vuelta no halló espera viva y la v1 quedó `abierta` hasta vencer (y rehacerse la mesa entera, con gasto).
 * El puerto de la jefatura de aquí DEDUPLICA por `artifact_id` como la real: la segunda apertura del mismo id devuelve la revisión vieja (cerrada, con su salida vieja).
 * Contra el almacén en memoria: sin modelo, sin red, US$ 0. Dos clientes de práctica de rubros y registros distintos. Nada aquí nombra a un cliente real.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { BriefCreativoGuardado, Campana, EntradaDeRegistro, EstrategiaGuardada, ResultadoDeAbrirRegistro } from '../almacen'
import { briefAbrir, conceptoAbrir, EN_REVISION_DE_REGISTRO, reabrirConceptoPorCausaExterna, recibirBrief, recibirConcepto, recibirVueltaDeRegistro, seguirSinRevisionDeRegistro } from '../mesas'
import { abrirRegistro, artifactIdDeRegistro, esperaDeRegistroViva, leerArtifactIdDeRegistro, leerObjetoDeRegistro, MAXIMO_DE_RONDAS_DE_REGISTRO, objetoDeRegistro } from '../registro-en-jefatura'
import { TIPO_DE_ESPERA } from '../revision-jefatura'

const AHORA = '2026-10-09T12:00:00Z'
const LUEGO = '2026-10-09T18:00:00Z'
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

interface Caso { nombre: string; c: ClienteFixture; registro: 'vos' | 'usted'; suenaMal: string; suenaBien: string; tonoMal: string; tonoBien: string }
const CASOS: Caso[] = [
  { nombre: 'A · cafetería · voseo', c: clienteA(), registro: 'vos', suenaMal: 'Voz cercana: pide la mesa, tú eliges.', suenaBien: 'Voz cercana: pedí la mesa, vos elegís.', tonoMal: 'Cercano: pide ya, tú sabes.', tonoBien: 'Cercano: pedí ya, vos sabés.' },
  { nombre: 'B · clínica veterinaria · usted', c: clienteB(), registro: 'usted', suenaMal: 'Voz serena: entrá y mirá a tu mascota.', suenaBien: 'Voz serena: pase y mire a su mascota.', tonoMal: 'Cálido: entrá y mirá.', tonoBien: 'Cálido: pase y mire.' },
]
const campDe = (k: Caso) => `camp-${k.c.clientId}`
const wf = (k: Caso) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: campDe(k) })
const citaDelPlan = (c: ClienteFixture) => c.planTexto.split(/(?<=\.)\s+/).find((s) => /posts por semana/.test(s))!.replace(/\.$/, '')
function briefDe(k: Caso, tono: string): string {
  const redes = k.c.estrategia.canales.filter((x) => x.rol !== 'no').map((x) => x.red)
  return [
    '## De qué parte del plan sale', `Fase 1: «${citaDelPlan(k.c)}».`,
    '## Insight', 'La gente cree que no hay un buen momento para venir de lunes a viernes.',
    '## Mensaje', 'Hay lugar desde temprano.',
    '## Público', 'Vecinos que pasan cerca de lunes a viernes (del plan).', '## Cómo sabremos que funcionó', 'Llegadas por semana contra la meta del plan, revisadas cada lunes.',
    '## Objetivo', 'Que lleguen 30 personas nuevas por semana.', ...redes.map((r) => `- ${r}: que vean el horario · «horario a la vista»`),
    '## Tono', tono,
    '## Obligatorios', '- vocabulario: horario', `- prohibido: ${k.c.forbiddenWords.join('; ')}`, '- lo que no se dice: precios',
    '## Faltantes', '- público: el manual no dice edades',
    '## Contradicciones plan vs manual', '- ninguna',
  ].join('\n')
}
const conceptoDe = (suena: string) => [
  '## Gran idea  La mesa larga · Noventa días para encontrarse',
  '## Por qué funciona  El insight del brief dice que no hay buen momento; la idea lo vuelve costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos.',
  `## Cómo suena  ${suena}`,
  '## Capítulo f1 · Abrir la puerta', 'Qué cuenta: se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera visita · mensaje: siempre hay lugar · gancho: ¿quién llegó primero? · protagonista: la puerta · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · las siete · mensaje: se llena de a poco · gancho: dos horas en una foto · protagonista: la sala · serie: ninguna · foto:ninguna',
  '- C1-I03 · facebook · foto · la silla libre · mensaje: ninguna silla sobra · gancho: un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El producto del día»: habla del producto, no del lugar',
].join('\n')

/** la jefatura de práctica: una revisión por `artifact_id` (como la real, que deduplica por `artifact_id + version`); la segunda apertura del mismo id devuelve la vieja */
class JefaturaDePractica {
  revisiones = new Map<string, { salida: Record<string, unknown> | null }>()
  abrir = async (e: EntradaDeRegistro): Promise<ResultadoDeAbrirRegistro> => {
    const ya = this.revisiones.get(e.artifact_id)
    if (ya) return ya.salida ? { estado: 'cerrada', salida: ya.salida } : { estado: 'esperando', revision_id: `rev-${e.artifact_id}` }
    this.revisiones.set(e.artifact_id, { salida: null })
    return { estado: 'esperando', revision_id: `rev-${e.artifact_id}` }
  }
  /** la revisión cierra sin cambios (sin versión corregida): su salida queda guardada, como en `jefatura_revisiones` */
  cerrar(artifactId: string): Record<string, unknown> {
    const salida = { revision_id: `rev-${artifactId}`, artifact_type: 'registro', artifact_id: artifactId, resultado: 'limpia', marcas: {}, artefacto_final: {}, versiones: [] }
    this.revisiones.set(artifactId, { salida })
    return salida
  }
}

function almacen(k: Caso, jef: JefaturaDePractica) {
  const id = k.c.clientId
  const al = new AlmacenMemoria({
    contextos: { [id]: { ...contextoDe(k.c), registro: k.registro } },
    planes: { [id]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [id], nuevo_orden: { clientes: [id] } },
    journeys: [{ journeyId: 'journey-1', clientId: id }],
  })
  const campana: Campana = {
    id: campDe(k), client_id: id, plan_id: 'plan-1', fecha_inicio: k.c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: k.c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'pais-de-practica', sedes: k.c.sedes.map((s) => s.clave),
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: campDe(k), version: 1, estado: 'validada', contenido: k.c.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  al.retencion = async (tipo) => ({ retener: tipo === 'registro', motivo: tipo === 'registro' ? 'jefatura_activa' : 'tipo_no_activo' })
  al.registro = jef.abrir
  const b: BriefCreativoGuardado = { campana_id: campDe(k), version: 1, estado: 'validada', texto_md: briefDe(k, k.tonoBien), leido: null, devolucion_texto: null, motivo: null, costo_usd: 0, encargo_id: 'enc-b', seco: true, plazo_en: null }
  al.briefsCreativos.push(b)
  return al
}
const entrega = (k: Caso, texto: string) => ({ campana_id: campDe(k), version: 1, encargo_id: 'enc-1', texto, costo_usd: 0.1, motivo: null })
const concepto = (al: AlmacenMemoria, k: Caso) => al.conceptos.find((b) => b.campana_id === campDe(k) && b.version === 1)!
const esperasDeRegistro = (al: AlmacenMemoria, k: Caso) => al.esperas.filter((e) => e.campana_id === campDe(k) && e.objeto_tipo === TIPO_DE_ESPERA)
const viva = (al: AlmacenMemoria, k: Caso) => esperasDeRegistro(al, k).filter((e) => e.estado === 'viva').map((e) => e.objeto_id)

/** la primera pasada: la gran idea entra a revisión (ronda 1), la jefatura cierra y la v1 queda `lista` esperando a Emilio; después se REABRE por una caída externa */
async function reabiertaTrasSuPrimeraRevision(k: Caso) {
  const jef = new JefaturaDePractica()
  const al = almacen(k, jef)
  expect((await conceptoAbrir(al, wf(k), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, entrega(k, conceptoDe(k.suenaMal)), AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
  const r1 = artifactIdDeRegistro('concepto', campDe(k), 1)
  expect((await recibirVueltaDeRegistro(al, { marcas: {}, salida: jef.cerrar(r1) }, AHORA)).cuerpo).toMatchObject({ ok: true, estado: 'lista' })
  expect(concepto(al, k)).toMatchObject({ estado: 'lista', aprobacion: 'pendiente' })
  expect(await reabrirConceptoPorCausaExterna(al, { campana_id: campDe(k), version: 1, encargo_id: 'enc-1' }, LUEGO)).toEqual({ ok: true, estado: 'abierta' })
  return { al, jef, r1 }
}

describe.each(CASOS)('$nombre', (k) => {
  it('🔴 la versión reabierta y entregada otra vez abre una revisión NUEVA (ronda 2, las dos llaves) con el texto nuevo, y su vuelta la deja `lista` con tarjeta para Emilio', async () => {
    const { al, jef, r1 } = await reabiertaTrasSuPrimeraRevision(k)
    expect(await recibirConcepto(al, entrega(k, conceptoDe(k.suenaBien)), LUEGO)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
    // la espera nueva es la de la ronda 2, viva; la de la ronda 1 sigue cerrada
    expect(viva(al, k)).toEqual(['registro:concepto:v1:r2'])
    expect(esperasDeRegistro(al, k).find((e) => e.objeto_id === 'registro:concepto:v1')!.estado).toBe('resuelta')
    // la jefatura recibió UN sobre nuevo, con su propio `artifact_id` y el texto de HOY (no la revisión vieja)
    expect(al.sobresDeRegistro.map((s) => s.artifact_id)).toEqual([r1, `${r1}:r2`])
    expect((al.sobresDeRegistro[1].payload as { texto: string }).texto).toBe(conceptoDe(k.suenaBien))
    expect(jef.revisiones.size).toBe(2)
    // la vuelta de la ronda 2 cierra: `lista`, pendiente de Emilio, con el texto nuevo y una tarjeta nueva
    const tarjetasAntes = al.tarjetas.length
    expect((await recibirVueltaDeRegistro(al, { marcas: {}, salida: jef.cerrar(`${r1}:r2`) }, LUEGO)).cuerpo).toMatchObject({ ok: true, estado: 'lista' })
    expect(concepto(al, k)).toMatchObject({ estado: 'lista', aprobacion: 'pendiente', texto_md: conceptoDe(k.suenaBien) })
    expect(al.tarjetas).toHaveLength(tarjetasAntes + 1)
    expect(al.tarjetas.at(-1)).toMatchObject({ status: 'pending', version: 1 })
    expect(viva(al, k)).toEqual([])
  })

  it('🔴 una vuelta VIEJA (la de la ronda 1) que llega después de reabrir no cierra la revisión nueva ni toca la versión', async () => {
    const { al, jef, r1 } = await reabiertaTrasSuPrimeraRevision(k)
    await recibirConcepto(al, entrega(k, conceptoDe(k.suenaBien)), LUEGO)
    const antes = structuredClone(concepto(al, k))
    expect((await recibirVueltaDeRegistro(al, { marcas: {}, salida: jef.revisiones.get(r1)!.salida! }, LUEGO)).cuerpo).toMatchObject({ ok: true, ya_cerrada: true })
    expect(concepto(al, k)).toEqual(antes)
    expect(antes.estado).toBe('abierta')
    expect(viva(al, k)).toEqual(['registro:concepto:v1:r2'])
  })

  it('🔴 una entrega repetida mientras la ronda 2 espera no abre una ronda 3 ni manda otro sobre', async () => {
    const { al } = await reabiertaTrasSuPrimeraRevision(k)
    await recibirConcepto(al, entrega(k, conceptoDe(k.suenaBien)), LUEGO)
    expect(await recibirConcepto(al, entrega(k, conceptoDe(k.suenaBien)), LUEGO)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
    expect(al.sobresDeRegistro).toHaveLength(2)
    expect(viva(al, k)).toEqual(['registro:concepto:v1:r2'])
    expect(esperasDeRegistro(al, k)).toHaveLength(2)
  })

  it('🔴 si la espera de la ronda 2 vence sin vuelta, el reloj cierra la versión con su texto (no queda `abierta` hasta rehacerse la mesa)', async () => {
    const { al } = await reabiertaTrasSuPrimeraRevision(k)
    await recibirConcepto(al, entrega(k, conceptoDe(k.suenaBien)), LUEGO)
    const e = esperasDeRegistro(al, k).find((x) => x.objeto_id === 'registro:concepto:v1:r2')!
    expect(await seguirSinRevisionDeRegistro(al, e, LUEGO)).toMatch(/siguió sin revisión de registro/)
    expect(concepto(al, k)).toMatchObject({ estado: 'lista', aprobacion: 'pendiente', texto_md: conceptoDe(k.suenaBien) })
    expect(viva(al, k)).toEqual([])
  })

  it('🔴 sin rondas libres (todas cerradas), no se llama a la jefatura: la versión cierra con las pistas como aviso, nunca queda de rehén', async () => {
    const jef = new JefaturaDePractica()
    const al = almacen(k, jef)
    await conceptoAbrir(al, wf(k), AHORA)
    for (let r = 1; r <= MAXIMO_DE_RONDAS_DE_REGISTRO; r++) {
      await al.abrirEspera({ campana_id: campDe(k), objeto_tipo: TIPO_DE_ESPERA, objeto_id: objetoDeRegistro('concepto', 1, r), motivo: 'vieja', desde: AHORA, recordatorio_en: null, alerta_en: null, vence_en: LUEGO, estado: 'resuelta', rung_enviado: 0, dedup_key: `${campDe(k)}:${TIPO_DE_ESPERA}:${objetoDeRegistro('concepto', 1, r)}`, accion_al_vencer: 'pasar_sin_revision', seco: true } as never)
    }
    expect(await recibirConcepto(al, entrega(k, conceptoDe(k.suenaMal)), LUEGO)).toMatchObject({ ok: true, estado: 'lista' })
    expect(al.sobresDeRegistro).toEqual([])
    expect((concepto(al, k).leido as { avisos: string[] }).avisos.some((a) => /ya no tiene ronda libre/.test(a))).toBe(true)
  })

  it('🔴 el brief que vuelve a entregarse tras cerrarse su revisión también va en la ronda 2, y su cierre resuelve la espera de esa ronda', async () => {
    const jef = new JefaturaDePractica()
    const al = almacen(k, jef)
    al.briefsCreativos.length = 0
    expect((await briefAbrir(al, wf(k), AHORA)).status).toBe(200)
    const eb = { campana_id: campDe(k), version: 1, encargo_id: 'enc-1', costo_usd: 0.1, motivo: null }
    expect(await recibirBrief(al, { ...eb, texto: briefDe(k, k.tonoMal) }, AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
    // la revisión de la ronda 1 se cierra por otra vía (el brief sigue retenido en `borrador` con su texto)
    al.esperas.find((e) => e.objeto_id === 'registro:brief:v1')!.estado = 'resuelta'
    expect(await recibirBrief(al, { ...eb, texto: briefDe(k, k.tonoBien) }, LUEGO)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
    const r2 = artifactIdDeRegistro('brief', campDe(k), 1, 2)
    expect(al.sobresDeRegistro.at(-1)!.artifact_id).toBe(r2)
    expect((await recibirVueltaDeRegistro(al, { marcas: {}, salida: jef.cerrar(r2) }, LUEGO)).cuerpo).toMatchObject({ ok: true, estado: 'validada' })
    expect(viva(al, k)).toEqual([])
  })
})

describe('las llaves de la ronda', () => {
  it('🔴 la ronda 1 (y toda versión que nunca se reabrió) usa las llaves de siempre, byte a byte', () => {
    expect(objetoDeRegistro('concepto', 1)).toBe('registro:concepto:v1')
    expect(objetoDeRegistro('concepto', 1, 1)).toBe('registro:concepto:v1')
    expect(objetoDeRegistro('brief', 3)).toBe('registro:brief:v3')
    expect(artifactIdDeRegistro('concepto', 'camp-x', 1)).toBe('registro:concepto:camp-x:v1')
    expect(artifactIdDeRegistro('brief', 'camp-x', 2, 1)).toBe('registro:brief:camp-x:v2')
  })
  it('🔴 la ronda 2+ lleva su marca en las dos llaves; el calendario no lleva ronda nunca', () => {
    expect(objetoDeRegistro('concepto', 1, 2)).toBe('registro:concepto:v1:r2')
    expect(artifactIdDeRegistro('concepto', 'camp-x', 1, 3)).toBe('registro:concepto:camp-x:v1:r3')
    expect(objetoDeRegistro('calendario', 4, 2)).toBe('registro:calendario:t4')
    expect(artifactIdDeRegistro('calendario', 'camp-x', 4, 2)).toBe('registro:calendario:camp-x:t4')
  })
  it('🔴 se leen de vuelta con su ronda; una marca fuera de rango no se reconoce', () => {
    expect(leerObjetoDeRegistro('registro:concepto:v1')).toEqual({ doc: 'concepto', version: 1 })
    expect(leerObjetoDeRegistro('registro:concepto:v1:r2')).toEqual({ doc: 'concepto', version: 1, ronda: 2 })
    expect(leerObjetoDeRegistro('registro:calendario:t5')).toEqual({ doc: 'calendario', version: 5 })
    expect(leerArtifactIdDeRegistro('registro:brief:camp-x:v2:r9')).toEqual({ doc: 'brief', campana_id: 'camp-x', version: 2, ronda: 9 })
    expect(leerArtifactIdDeRegistro('registro:concepto:camp-x:v1')).toEqual({ doc: 'concepto', campana_id: 'camp-x', version: 1 })
    for (const malo of ['registro:concepto:v1:r1', 'registro:concepto:v1:r10', 'registro:calendario:t1:r2']) expect(leerObjetoDeRegistro(malo)).toBeNull()
    for (const malo of ['registro:concepto:camp-x:v1:r1', 'registro:calendario:camp-x:t1:r2']) expect(leerArtifactIdDeRegistro(malo)).toBeNull()
  })
  it('🔴 la espera viva es de SU versión y de su documento: la de otra versión u otro documento no cuenta', async () => {
    const k = CASOS[0]
    const al = almacen(k, new JefaturaDePractica())
    const abrir = (objeto: string) => al.abrirEspera({ campana_id: campDe(k), objeto_tipo: TIPO_DE_ESPERA, objeto_id: objeto, motivo: 'otra', desde: AHORA, recordatorio_en: null, alerta_en: null, vence_en: LUEGO, estado: 'viva', rung_enviado: 0, dedup_key: `${campDe(k)}:${objeto}`, accion_al_vencer: 'pasar_sin_revision', seco: true } as never)
    await abrir(objetoDeRegistro('concepto', 2, 2))
    await abrir(objetoDeRegistro('brief', 1, 2))
    expect(await esperaDeRegistroViva(al, campDe(k), 'concepto', 1)).toBeNull()
    expect(await esperaDeRegistroViva(al, campDe(k), 'concepto', 1, 2)).toBeNull()
    expect((await esperaDeRegistroViva(al, campDe(k), 'concepto', 2))?.objeto_id).toBe('registro:concepto:v2:r2')
    expect(await esperaDeRegistroViva(al, campDe(k), 'concepto', 2, 1)).toBeNull()
  })
  it('🔴 abrirRegistro del calendario con su espera ya cerrada sigue como hoy: llama a la jefatura con la llave de siempre', async () => {
    const k = CASOS[0]
    const jef = new JefaturaDePractica()
    const al = almacen(k, jef)
    const campana = al.campanas[0]
    await al.abrirEspera({ campana_id: campana.id, objeto_tipo: TIPO_DE_ESPERA, objeto_id: 'registro:calendario:t1', motivo: 'vieja', desde: AHORA, recordatorio_en: null, alerta_en: null, vence_en: LUEGO, estado: 'resuelta', rung_enviado: 0, dedup_key: `${campana.id}:${TIPO_DE_ESPERA}:registro:calendario:t1`, accion_al_vencer: 'pasar_sin_revision', seco: true } as never)
    const { r } = await abrirRegistro(al, { doc: 'calendario', campana, version: 1, texto: 'x', registro: 'vos', origenes: [] }, LUEGO)
    expect(r.estado).toBe('esperando')
    expect(al.sobresDeRegistro.map((s) => s.artifact_id)).toEqual([`registro:calendario:${campana.id}:t1`])
  })
})
