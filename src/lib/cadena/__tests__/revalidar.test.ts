/**
 * 09-nov · REVALIDAR LO YA ESCRITO (GO de Lenovo, opción B firmada por Emilio 19:11Z · regla de sistema) · CC2 · US$ 0, sin modelo, sin red.
 * El caso real: Náufrago `28de888e`, brief v2 devuelto EN FALSO por el verificador de citas (las negritas del plan, arreglado en #956) · campaña en `necesita_humano`.
 * Aquí el falso rojo se reproduce dejando la versión como la dejó el verificador viejo (estado `devuelta`, su bloqueo guardado en `leido`, el motivo con el que
 * `recibirBrief` detiene la campaña) sobre un texto que el verificador de HOY lee limpio.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, calendarioSiguiente, estrategiaGuardar, estrategiaPreparar } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { briefAbrir, conceptoAbrir, MOTIVO_CAMBIOS_DE_EMILIO, recibirBrief, recibirConcepto } from '../mesas'
import { ponerNecesitaHumano } from '../nucleo'
import { briefRevalidar } from '../revalidar'
import { ACCIONES } from '../acciones'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const almacen = () => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) },
  planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
  journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
})
const ok = (o: unknown, costo = 0.3) => ({ success: true, structured_output: o, cost_usd: costo })
const CITA_BUENA = 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».'
const BRIEF = [
  '## De qué parte del plan sale', CITA_BUENA,
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const MALO = BRIEF.replace(CITA_BUENA, 'Fase 1: «esta frase no está en ningún plan».')
const BLOQUEO_VIEJO = 'la cita «Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».» no se encuentra literal en el plan · no se puede verificar de qué parte sale'
const entrega = (campana_id: string, version: number, texto: string) => ({ campana_id, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })

/** campaña con estrategia validada · brief v1 devuelto de verdad · v2 `texto` entregado; con `falsoRojo`, la v2 queda como la dejó el verificador viejo */
async function detenidaPorElBrief(texto: string, o: { falsoRojo?: boolean } = {}) {
  const al = almacen()
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
  const id = (c.cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  expect((await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)).status).toBe(200)
  await briefAbrir(al, wf({ campana_id: id }), AHORA)
  expect(await recibirBrief(al, entrega(id, 1, MALO), AHORA)).toMatchObject({ estado: 'devuelta' })
  await briefAbrir(al, wf({ campana_id: id }), AHORA)
  const r = await recibirBrief(al, entrega(id, 2, texto), AHORA)
  if (o.falsoRojo) {
    expect(r).toMatchObject({ estado: 'validada' }) // el verificador de HOY la lee limpia
    const b = al.briefsCreativos.find((x) => x.campana_id === id && x.version === 2)!
    Object.assign(b, { estado: 'devuelta', leido: { ...b.leido, bloqueos: [BLOQUEO_VIEJO] }, devolucion_texto: `- ${BLOQUEO_VIEJO}` })
    await ponerNecesitaHumano(al, al.campanas.find((x) => x.id === id)!, `el brief creativo se devolvió por código dos veces: ${BLOQUEO_VIEJO}`, AHORA)
  }
  expect(al.campanas.find((x) => x.id === id)!.estado).toBe('necesita_humano')
  return { al, id }
}
const foto = (al: AlmacenMemoria) => JSON.stringify({ c: al.campanas, b: al.briefsCreativos, e: al.esperas, k: al.corridas })
const nhVivas = (al: AlmacenMemoria, id: string) => al.esperas.filter((e) => e.campana_id === id && e.objeto_tipo === 'necesita_humano' && e.estado === 'viva')

describe('revalidar lo ya escrito · un brief devuelto EN FALSO vuelve a pasar el verificador de hoy', () => {
  it('🔴 el falso rojo PASA: la v2 queda validada (sin versión nueva, sin gasto), la campaña vuelve a calendario, su espera se resuelve y la respuesta trae el sobre hacia la gran idea', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const corridasAntes = al.corridas.length
    const r = await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo).toMatchObject({ pasa: true, version: 2, bloqueos_antes: [BLOQUEO_VIEJO], campana: { estado: 'calendario' }, siguiente: { sobre: { idempotency_key: `${id}:tanda-1:abrir-concepto-v1` } } })
    expect(al.briefsCreativos.filter((b) => b.campana_id === id).map((b) => [b.version, b.estado])).toEqual([[1, 'devuelta'], [2, 'validada']])
    const v2 = al.briefsCreativos.find((b) => b.version === 2)!
    expect(v2.devolucion_texto).toBeNull()
    expect((v2.leido as { bloqueos: string[] }).bloqueos).toEqual([])
    expect(al.campanas[0].estado).toBe('calendario')
    expect(al.campanas[0].estado_motivo).toMatch(/^brief v2 revalidado con el verificador de hoy: ya no bloquea/)
    expect(nhVivas(al, id)).toEqual([])
    expect(al.corridas.length).toBe(corridasAntes) // US$ 0: ninguna corrida, ningún modelo
  })
  it('🔴 idempotente: otra vez contesta ya_revalidada y no escribe nada', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    const f = foto(al)
    expect((await briefRevalidar(al, wf({ campana_id: id }), AHORA)).cuerpo).toMatchObject({ ya_revalidada: true, version: 2 })
    expect(foto(al)).toBe(f)
  })
  it('🔴 el ensayo dice qué haría y no escribe nada', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const f = foto(al)
    const r = await briefRevalidar(al, wf({ campana_id: id, ensayo: true }), AHORA)
    expect(r.cuerpo).toMatchObject({ ensayo: true, escrituras: 0, pasa: true, haria: { brief: 'validada', campana: 'calendario' } })
    expect((r.cuerpo.haria as { esperas_que_se_resuelven: unknown[] }).esperas_que_se_resuelven).toHaveLength(1)
    expect(foto(al)).toBe(f)
  })
  it('🔴 un rojo VERDADERO sigue rojo: no pasa, no escribe (mismos bloqueos) y la espera de Emilio sigue viva con su mismo plazo', async () => {
    const { al, id } = await detenidaPorElBrief(MALO)
    const f = foto(al)
    const r = await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    expect(r.cuerpo).toMatchObject({ pasa: false, version: 2, sin_cambios: true, campana: { estado: 'necesita_humano' } })
    expect(foto(al)).toBe(f)
  })
  it('si el verificador de hoy encuentra OTROS bloqueos: la versión guarda los nuevos, la campaña sigue en necesita_humano con el motivo nuevo y la espera NO se rehace', async () => {
    const { al, id } = await detenidaPorElBrief(MALO)
    const b = al.briefsCreativos.find((x) => x.version === 2)!
    Object.assign(b, { leido: { ...b.leido, bloqueos: ['un bloqueo que el verificador viejo veía'] } })
    const espera = JSON.stringify(nhVivas(al, id))
    const r = await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    expect(r.cuerpo).toMatchObject({ pasa: false, campana: { estado: 'necesita_humano' } })
    const v2 = al.briefsCreativos.find((x) => x.version === 2)!
    expect(v2.estado).toBe('devuelta')
    expect(v2.devolucion_texto).toMatch(/esta frase no está en ningún plan/)
    expect(al.campanas[0].estado_motivo).toMatch(/^el brief creativo se devolvió por código dos veces: .*esta frase no está en ningún plan/)
    expect(JSON.stringify(nhVivas(al, id))).toBe(espera)
  })
})

describe('revalidar · lo que NO se toca (409, nada escrito)', () => {
  const nada = async (al: AlmacenMemoria, id: string, codigo: string, extra: Record<string, unknown> = {}) => {
    const f = foto(al)
    const r = await briefRevalidar(al, wf({ campana_id: id, ...extra }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: codigo.toLowerCase().replace(/-/g, '_') })
    expect(foto(al)).toBe(f)
  }
  it('🔴 la devolución de Emilio con cambios no es un falso rojo', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    al.briefsCreativos.find((x) => x.version === 2)!.motivo = MOTIVO_CAMBIOS_DE_EMILIO
    await nada(al, id, 'E-CAMBIOS-DE-EMILIO')
  })
  it('🔴 una versión devuelta por una persona o por la mesa de la gran idea (sin bloqueos del verificador guardados) no se revalida', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const b = al.briefsCreativos.find((x) => x.version === 2)!
    Object.assign(b, { leido: { ...b.leido, bloqueos: [] }, devolucion_texto: 'la mesa de la gran idea lo devolvió' })
    await nada(al, id, 'E-NO-LA-DEVOLVIO-EL-VERIFICADOR')
  })
  it('🔴 una campaña detenida por OTRA cosa no sale de necesita_humano por revalidar su brief', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    al.campanas[0].estado_motivo = 'la estrategia sigue con 3 bloqueo(s) tras la única corrección'
    await nada(al, id, 'E-OTRO-MOTIVO')
  })
  it('🔴 una campaña que no está en necesita_humano no se revalida', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    al.campanas[0].estado = 'pausada'
    await nada(al, id, 'E-NO-SE-REVALIDA')
  })
  it('sin llave/flujo autorizado no entra', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const f = foto(al)
    const r = await briefRevalidar(al, { campana_id: id, workflow_id: "wf-intruso", workflow_execution_id: "x" }, AHORA)
    expect(r.status).toBeGreaterThanOrEqual(400)
    expect(foto(al)).toBe(f)
  })
})

describe('revalidar · vuelve atrás si algo falla a medias', () => {
  it('🔴 si falla al resolver la espera, la versión, la campaña y la espera quedan como estaban', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const f = foto(al)
    const original = al.actualizarEspera.bind(al)
    let fallar = true
    al.actualizarEspera = async (eid, patch) => { if (fallar && patch.estado === 'resuelta') { fallar = false; throw new Error('la base se cayó') } return original(eid, patch) }
    await expect(briefRevalidar(al, wf({ campana_id: id }), AHORA)).rejects.toThrow('la base se cayó')
    expect(foto(al)).toBe(f)
  })
  it('🔴 con DOS esperas vivas y la falla en la segunda: la primera, ya resuelta, vuelve a viva', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    await ponerNecesitaHumano(al, al.campanas[0], `el brief creativo ya se devolvió 2 veces`, AHORA)
    al.campanas[0].estado_motivo = `el brief creativo se devolvió por código dos veces: ${BLOQUEO_VIEJO}`
    expect(nhVivas(al, id)).toHaveLength(2)
    const f = foto(al)
    const original = al.actualizarEspera.bind(al)
    let resueltas = 0
    al.actualizarEspera = async (eid, patch) => { if (patch.estado === 'resuelta' && ++resueltas === 2) throw new Error('la base se cayó'); return original(eid, patch) }
    await expect(briefRevalidar(al, wf({ campana_id: id }), AHORA)).rejects.toThrow('la base se cayó')
    expect(foto(al)).toBe(f)
  })
})

describe('revalidar · los 5 casos de CC7 (RESPUESTA 19:57Z)', () => {
  it('🔴 caso 1 · un brief que devolvió la DIRECCIÓN (mesa de la gran idea, por el camino real) no se revalida: su juicio no se anula', async () => {
    const al = almacen()
    const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
    const id = (c.cuerpo.campana as { id: string }).id
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    expect(await recibirBrief(al, entrega(id, 1, BRIEF), AHORA)).toMatchObject({ estado: 'validada' })
    await conceptoAbrir(al, wf({ campana_id: id }), AHORA)
    expect(await recibirConcepto(al, { ...entrega(id, 1, '## Devolución del brief\n- el insight no se sostiene'), brief_devuelto: '- el insight no se sostiene' }, AHORA)).toMatchObject({ estado: 'brief_devuelto' })
    expect(al.briefsCreativos[0]).toMatchObject({ estado: 'devuelta', motivo: null })
    // aun si la campaña estuviera detenida por el brief y la versión tuviera bloqueos guardados, la devolución de la dirección manda
    const b = al.briefsCreativos[0]
    Object.assign(b, { leido: { ...b.leido, bloqueos: [BLOQUEO_VIEJO] } })
    await ponerNecesitaHumano(al, al.campanas[0], `el brief creativo se devolvió por código dos veces: ${BLOQUEO_VIEJO}`, AHORA)
    const f = foto(al)
    const r = await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'e_la_devolvio_la_direccion' })
    expect(foto(al)).toBe(f)
  })
  it('🔴 caso 2 · dos pedidos A LA VEZ: uno revalida y trae el sobre; el otro contesta ya_revalidada sin escribir (una sola campaña movida, un solo sobre)', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const movidas: string[] = []
    const original = al.actualizarCampanaSi.bind(al)
    al.actualizarCampanaSi = async (cid, estado, patch) => { const r = await original(cid, estado, patch); if (r) movidas.push(String(patch.estado)); return r }
    // barrera: los DOS pedidos leen la versión `devuelta` antes de que cualquiera escriba (la carrera de verdad, no uno detrás del otro)
    const cargar = al.cargarContexto.bind(al)
    let llegaron = 0
    let soltar!: () => void
    const barrera = new Promise<void>((r) => { soltar = r })
    al.cargarContexto = async (...a) => { if (++llegaron === 2) soltar(); await barrera; return cargar(...a) }
    const [r1, r2] = await Promise.all([briefRevalidar(al, wf({ campana_id: id, workflow_execution_id: 'ex-a' }), AHORA), briefRevalidar(al, wf({ campana_id: id, workflow_execution_id: 'ex-b' }), AHORA)])
    const rs = [r1.cuerpo, r2.cuerpo]
    expect(rs.filter((x) => x.pasa === true)).toHaveLength(1)
    expect(rs.filter((x) => x.ya_revalidada === true)).toHaveLength(1)
    expect(rs.filter((x) => x.siguiente)).toHaveLength(1)
    expect(movidas).toEqual(['calendario'])
    expect(al.campanas[0].estado).toBe('calendario')
    expect(nhVivas(al, id)).toEqual([])
  })
  it('🔴 caso 3 · solo cambia lo que mira el verificador (estado, leido, devolución) y queda constancia de quién, cuándo y por qué se había devuelto', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const antes = structuredClone(al.briefsCreativos.find((b) => b.version === 2)!)
    await briefRevalidar(al, wf({ campana_id: id, workflow_id: 'wf-cadena', workflow_execution_id: 'ex-77' }), AHORA)
    const despues = al.briefsCreativos.find((b) => b.version === 2)!
    for (const k of ['texto_md', 'costo_usd', 'encargo_id', 'motivo', 'version', 'seco', 'plazo_en'] as const) expect(despues[k], k).toEqual(antes[k])
    const m = al.campanas[0].estado_motivo ?? ''
    expect(m).toContain('wf-cadena')
    expect(m).toContain('ex-77')
    expect(m).toContain(AHORA)
    expect(m).toContain('se había devuelto por: la cita «Fase 1')
  })
  it('🔴 caso 4 · el estado de vuelta: tanda 1 → calendario (el caso de Náufrago) · con una tanda ya hecha → activa', async () => {
    const t1 = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    expect((await briefRevalidar(t1.al, wf({ campana_id: t1.id }), AHORA)).cuerpo).toMatchObject({ campana: { estado: 'calendario' } })
    const t2 = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    t2.al.filasGuardadas.push({ id: 'S1-01', campana_id: t2.id, calendario_version: 1, tanda: 1, estado: 'aprobada' } as unknown as AlmacenMemoria['filasGuardadas'][number])
    expect((await briefRevalidar(t2.al, wf({ campana_id: t2.id }), AHORA)).cuerpo).toMatchObject({ campana: { estado: 'activa' } })
    expect(t2.al.campanas[0].estado).toBe('activa')
  })
  it('🔴 caso 5 · lo que el sistema ve después: la espera cerrada, fuera de las campañas en espera (Decisiones) y el reloj entra por la gran idea, no por abrir-brief-v3', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    expect((await al.campanasEnEspera()).map((x) => x.id)).toContain(id)
    await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    expect(nhVivas(al, id)).toEqual([])
    expect((await al.campanasEnEspera()).map((x) => x.id)).not.toContain(id)
    const s = await calendarioSiguiente(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1', campana_id: id }, AHORA)
    expect(s.cuerpo).toMatchObject({ tanda: 1 })
    expect(String(s.cuerpo.etapa)).toMatch(/^abrir-concepto-v1/)
    expect(String(s.cuerpo.etapa)).not.toContain('abrir-brief')
  })
})

describe('revalidar · las pruebas de CC7 (CERTIFICACIÓN 20:09Z · raw/evidencia/2026-11-09-revalidar/cc7-casos-propios.test.ts)', () => {
  async function base() {
    const al = almacen()
    const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)
    const id = (c.cuerpo.campana as { id: string }).id
    const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    expect(await recibirBrief(al, entrega(id, 1, MALO), AHORA)).toMatchObject({ estado: 'devuelta' })
    await briefAbrir(al, wf({ campana_id: id }), AHORA)
    expect(await recibirBrief(al, entrega(id, 2, BRIEF), AHORA)).toMatchObject({ estado: 'validada' })
    return { al, id }
  }
  it('camino REAL: la dirección devuelve la v2 → necesita_humano → revalidar se niega y no escribe', async () => {
    const { al, id } = await base()
    expect((await conceptoAbrir(al, wf({ campana_id: id }), AHORA)).status).toBe(200)
    await recibirConcepto(al, { campana_id: id, version: 1, encargo_id: 'e', texto: '## Devolución del brief\n- el insight no se sostiene', costo_usd: 0.1, motivo: null, brief_devuelto: '- el insight no se sostiene' }, AHORA)
    expect(al.campanas[0].estado).toBe('necesita_humano')
    const f = JSON.stringify([al.campanas, al.briefsCreativos, al.esperas])
    // aunque el motivo dijera lo del brief (camino briefAbrir), las guardas la frenan
    for (const motivo of [al.campanas[0].estado_motivo, 'el brief creativo ya se devolvió 2 veces']) {
      al.campanas[0].estado_motivo = motivo
      const r = await briefRevalidar(al, wf({ campana_id: id }), AHORA)
      expect(r.status).toBe(409)
    }
    al.campanas[0].estado_motivo = JSON.parse(f)[0][0].estado_motivo
    expect(JSON.stringify([al.campanas, al.briefsCreativos, al.esperas])).toBe(f)
  })
  it('tanda > 1: vuelve a activa, no a calendario', async () => {
    const { al, id } = await base()
    const b = al.briefsCreativos.find((x) => x.version === 2)!
    Object.assign(b, { estado: 'devuelta', leido: { ...b.leido, bloqueos: ['viejo'] } })
    await ponerNecesitaHumano(al, al.campanas[0], 'el brief creativo se devolvió por código dos veces: viejo', AHORA)
    ;(al as unknown as { filas: () => Promise<unknown[]> }).filas = async () => [{ estado: 'lista', tanda: 1 }]
    const r = await briefRevalidar(al, wf({ campana_id: id }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(al.campanas[0].estado).toBe('activa')
  })
})

describe('revalidar · la campaña movida por OTRO a mitad (🟡 de CC7 20:17Z)', () => {
  /** el brief gana su condición, pero justo entonces otro mueve la campaña (vence la espera → pausada) */
  const moverAMitad = (al: AlmacenMemoria, a: 'pausada' | 'cerrada') => {
    const original = al.actualizarBriefCreativoSi.bind(al)
    al.actualizarBriefCreativoSi = async (...x) => { const r = await original(...x); al.campanas[0].estado = a; al.campanas[0].estado_motivo = `otro la dejó ${a}`; return r }
  }
  it('🔴 rama que PASA: la campaña pausada NO revive (no va a calendario), la versión vuelve a devuelta, la espera sigue viva y hay error', async () => {
    const { al, id } = await detenidaPorElBrief(BRIEF, { falsoRojo: true })
    const brief = JSON.stringify(al.briefsCreativos)
    const esperas = JSON.stringify(nhVivas(al, id))
    moverAMitad(al, 'pausada')
    await expect(briefRevalidar(al, wf({ campana_id: id }), AHORA)).rejects.toThrow('la campaña cambió de estado mientras se revalidaba')
    expect(al.campanas[0]).toMatchObject({ estado: 'pausada', estado_motivo: 'otro la dejó pausada' })
    expect(JSON.stringify(al.briefsCreativos)).toBe(brief)
    expect(JSON.stringify(nhVivas(al, id))).toBe(esperas)
  })
  it('🔴 rama que NO pasa: a la campaña cerrada por otro no se le pega ni el motivo nuevo ni el viejo de necesita_humano', async () => {
    const { al, id } = await detenidaPorElBrief(MALO)
    const b = al.briefsCreativos.find((x) => x.version === 2)!
    Object.assign(b, { leido: { ...b.leido, bloqueos: ['un bloqueo que el verificador viejo veía'] } })
    const brief = JSON.stringify(al.briefsCreativos)
    moverAMitad(al, 'cerrada')
    await expect(briefRevalidar(al, wf({ campana_id: id }), AHORA)).rejects.toThrow('la campaña cambió de estado mientras se revalidaba')
    expect(al.campanas[0]).toMatchObject({ estado: 'cerrada', estado_motivo: 'otro la dejó cerrada' })
    expect(JSON.stringify(al.briefsCreativos)).toBe(brief)
  })
})

describe('revalidar · cableado', () => {
  it('la acción vive en la tabla de la ruta del brief', () => {
    expect(Object.keys(ACCIONES.brief)).toEqual(['abrir', 'entregar', 'revalidar'])
  })
})

/**
 * 10-nov · 🟡 de CC7 a #968 (pedido 2): las DOS entradas del brief pasan el registro del cliente al verificador. Un brief con voseo en «Tono» («pedí»)
 * deja el aviso de «Tono» en la lectura GUARDADA, al recibirlo y al revalidarlo.
 */
describe('las entradas del brief pasan el registro del cliente', () => {
  const VOSEO = BRIEF.replace('## Tono\nCercano y directo.', '## Tono\nCercano y directo: pedí lo que quieras.')
  const avisoDeTono = (b: { leido?: unknown }) => ((b.leido as { avisos: string[] }).avisos).filter((a) => a.startsWith('«Tono» usa formas'))
  it('🔴 recibirBrief: el aviso de «Tono» queda guardado', async () => {
    expect(VOSEO).toContain('pedí lo que quieras')
    const { al, id } = await detenidaPorElBrief(VOSEO, { falsoRojo: true })
    // la lectura que dejó recibirBrief (antes de que el falso rojo le pusiera su bloqueo)
    expect(avisoDeTono(al.briefsCreativos.find((b) => b.campana_id === id && b.version === 2)!)).toHaveLength(1)
  })
  it('🔴 briefRevalidar: la relectura guarda el aviso de «Tono» (aunque la lectura vieja no lo tuviera)', async () => {
    const { al, id } = await detenidaPorElBrief(VOSEO, { falsoRojo: true })
    const b = al.briefsCreativos.find((x) => x.campana_id === id && x.version === 2)!
    Object.assign(b, { leido: { ...(b.leido as object), avisos: [] } })
    expect((await briefRevalidar(al, wf({ campana_id: id }), AHORA)).cuerpo).toMatchObject({ pasa: true, version: 2 })
    expect(avisoDeTono(al.briefsCreativos.find((x) => x.campana_id === id && x.version === 2)!)).toHaveLength(1)
  })
})
