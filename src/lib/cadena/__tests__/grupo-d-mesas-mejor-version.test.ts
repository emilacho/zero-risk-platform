/**
 * 19-nov · GRUPO D (ADENDA de Lenovo 18-nov 17:22Z, punto 2 · D1 (a) y D2 (c), 19-nov 08:00Z) · las mesas de brief y de gran idea al llegar al tope:
 *   · D1 (a): queda vigente el brief DEVUELTO con menos bloqueos (empate: el más nuevo), validado, con sus bloqueos escritos como avisos. Condición de Lenovo: esos
 *     avisos llegan escritos a la jefatura junto con cada pieza (la hoja los copia en la sección de la pieza; el revisor recibe esa sección entera);
 *   · grupo 2: sin versión con texto, la mesa se reabre en la vuelta siguiente del vigía (a lo más una vez por tramo de medio día), con UNA alarma;
 *   · D2 (c): tope de 3 pedidos de cambios; al 4.º se le pregunta a Emilio en el buzón y la campaña no se detiene.
 * Nunca `necesita_humano`. Cliente sintético, almacén en memoria, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { BriefCreativoGuardado, Campana, EstrategiaGuardada } from '../almacen'
import { CAMPO_AVISOS_DEL_BRIEF_CREATIVO, leerBriefCreativo, PREFIJO_AVISO_DE_LA_MEJOR_VERSION, type BriefCreativoLeido } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import {
  briefAbrir, CAP_DE_VUELTAS_DE_CAMBIOS, cerrarMesasVencidas, conceptoAbrir, conceptoDecidir, marcaDeMesaEnReintento, mejorBriefConTexto, MOTIVO_CAMBIOS_DE_EMILIO,
  MOTIVO_MEJOR_VERSION_DEL_BRIEF, recibirBrief, recibirConcepto, tramoDeLaMarca,
} from '../mesas'
import type { FormatosPorRed } from '../tipos'
import { parsearBrief } from '@/lib/oficina/brief'
import { contextoDelRevisor, type ContextoDePedido } from '@/lib/oficina/pedidos'

const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z' // tramo 2026-10-09pm
const MISMO_TRAMO = '2026-10-09T23:30:00Z'
const TRAMO_2 = '2026-10-10T00:30:00Z' // 2026-10-10am
const TRAMO_3 = '2026-10-10T12:30:00Z' // 2026-10-10pm
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })

function almacen() {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
  const campana: Campana = {
    id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  return al
}

// el mismo brief de `mesas.test.ts` (cita literal del plan del cliente A)
const BRIEF_BUENO = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
/** 1 bloqueo: la cita del plan no es literal */
const UN_BLOQUEO = BRIEF_BUENO.replace('«Se publican 3 posts por semana en Instagram y 1 en Facebook»', '«esta frase no está en el plan de nadie»')
/** 2 bloqueos: la misma cita y voseo en «Tono» */
const DOS_BLOQUEOS = UN_BLOQUEO.replace('Cercano y directo, sin exclamaciones.', 'Cercano y directo: entrá y pedí.')
const CONCEPTO_BUENO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  El insight del brief dice que la gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Cómo suena  Voz cercana, frases cortas.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: ninguna · foto:ninguna',
  '- C1-I03 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto, no de la mesa',
].join('\n')
const entrega = (version: number, texto: string | null, extra: Record<string, unknown> = {}) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null, ...extra })
const avisosDe = (b: BriefCreativoGuardado) => ((b.leido ?? {}) as unknown as BriefCreativoLeido).avisos ?? []
const marcados = (b: BriefCreativoGuardado) => avisosDe(b).filter((a) => a.startsWith(PREFIJO_AVISO_DE_LA_MEJOR_VERSION))

/** dos versiones del brief devueltas por el código: la v1 con `primero`, la v2 con `segundo` */
async function dosDevueltas(al: AlmacenMemoria, primero: string, segundo: string) {
  expect((await briefAbrir(al, wf(), AHORA)).cuerpo.version).toBe(1)
  expect(await recibirBrief(al, entrega(1, primero), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
  expect((await briefAbrir(al, wf(), AHORA)).cuerpo.version).toBe(2)
  expect(await recibirBrief(al, entrega(2, segundo), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
  expect(al.campanas[0].estado).toBe('calendario')
}
/** dos versiones del brief sin texto (la mesa no entregó) */
async function dosSinTexto(al: AlmacenMemoria) {
  await briefAbrir(al, wf(), AHORA)
  expect(await recibirBrief(al, entrega(1, null, { motivo: 'tope de la mesa' }), AHORA)).toMatchObject({ estado: 'descartada' })
  await briefAbrir(al, wf(), AHORA)
  expect(await recibirBrief(al, entrega(2, null, { motivo: 'tope de la mesa' }), AHORA)).toMatchObject({ estado: 'descartada' })
}

// ───────────────────────────────────────────────────────── D1 · cuál queda
describe('D1 · la mejor versión del brief (puro)', () => {
  const v = (version: number, estado: BriefCreativoGuardado['estado'], bloqueos: number, extra: Partial<BriefCreativoGuardado> = {}) =>
    ({ version, estado, texto_md: 'x', leido: {}, devolucion_texto: bloqueos ? Array.from({ length: bloqueos }, (_, i) => `- b${i}`).join('\n') : null, motivo: null, ...extra })
  it('🔴 gana la de MENOS bloqueos aunque sea más vieja; con empate, la más nueva', () => {
    expect(mejorBriefConTexto([v(1, 'devuelta', 1), v(2, 'devuelta', 3)])?.version).toBe(1)
    expect(mejorBriefConTexto([v(1, 'devuelta', 2), v(2, 'devuelta', 2), v(3, 'devuelta', 4)])?.version).toBe(2)
  })
  it('🔴 solo compiten las devueltas con texto leído: ni la validada ya reemplazada, ni la descartada, ni la que Emilio mandó a cambiar', () => {
    expect(mejorBriefConTexto([v(1, 'validada', 0), v(2, 'devuelta', 2)])?.version).toBe(2)
    expect(mejorBriefConTexto([v(1, 'devuelta', 0, { motivo: MOTIVO_CAMBIOS_DE_EMILIO }), v(2, 'devuelta', 2)])?.version).toBe(2)
    expect(mejorBriefConTexto([v(1, 'descartada', 0), v(2, 'devuelta', 1, { texto_md: null }), v(3, 'devuelta', 1, { leido: null })])).toBeNull()
    expect(mejorBriefConTexto([])).toBeNull()
  })
})

describe('D1 · al tope queda la mejor versión, con sus bloqueos como avisos, y la campaña sigue', () => {
  it('🔴 la v1 (1 bloqueo) gana a la v2 (2): se copia como v3 validada con la marca y su aviso; UNA alarma; la gran idea se abre sobre ella', async () => {
    const al = almacen()
    await dosDevueltas(al, UN_BLOQUEO, DOS_BLOQUEOS)
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r).toMatchObject({ status: 200, cuerpo: { ya_hecha: true, version: 3, brief_id: 'brf-camp1-v3', mejor_version: { de: 1, bloqueos: 1 } } })
    expect(r.cuerpo.sobre).toBeUndefined() // ninguna mesa nueva
    const v3 = al.briefsCreativos[2]
    expect(v3).toMatchObject({ version: 3, estado: 'validada', motivo: MOTIVO_MEJOR_VERSION_DEL_BRIEF, texto_md: al.briefsCreativos[0].texto_md, encargo_id: null, costo_usd: null })
    expect(marcados(v3)).toHaveLength(1)
    expect(marcados(v3)[0]).toMatch(/no se encuentra literal en el plan/)
    expect(al.briefsCreativos.slice(0, 2).map((b) => b.estado)).toEqual(['devuelta', 'devuelta']) // las otras no se tocan
    expect(al.campanas[0].estado).toBe('calendario')
    expect(al.esperas.filter((e) => e.objeto_tipo === 'necesita_humano')).toHaveLength(0)
    expect(al.avisosAlBuzon).toHaveLength(1)
    expect(al.avisosAlBuzon[0]).toMatchObject({ tipo: 'alarma', clave: `cadena:mejor-version:brief:${CAMP}`, client_id: A.clientId })
    expect(al.avisosAlBuzon[0].titulo).toContain('la 1')
    // otra vuelta: ya es la vigente (no se copia otra vez ni se avisa otra vez) y la gran idea se abre sobre la v3
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 3 })
    expect(al.briefsCreativos).toHaveLength(3)
    expect(al.avisosAlBuzon).toHaveLength(1)
    const c = await conceptoAbrir(al, wf(), AHORA)
    expect(c).toMatchObject({ status: 200, cuerpo: { version: 1, brief_version: 3 } })
  })
  it('🔴 con la mejor como última, se valida ahí mismo (sin copia) y sus bloqueos quedan como avisos sin repetirse', async () => {
    const al = almacen()
    await dosDevueltas(al, DOS_BLOQUEOS, UN_BLOQUEO)
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 2, mejor_version: { de: 2, bloqueos: 1 } })
    expect(al.briefsCreativos).toHaveLength(2)
    expect(al.briefsCreativos[1]).toMatchObject({ estado: 'validada', motivo: MOTIVO_MEJOR_VERSION_DEL_BRIEF })
    expect(marcados(al.briefsCreativos[1])).toHaveLength(1)
    expect(new Set(avisosDe(al.briefsCreativos[1])).size).toBe(avisosDe(al.briefsCreativos[1]).length)
  })
  it('🔴 la dirección devuelve la mejor versión: el brief NO se devuelve (sería otra vuelta sin fin); sus puntos se suman a los avisos y la gran idea se pide en la vuelta siguiente', async () => {
    const al = almacen()
    await dosDevueltas(al, UN_BLOQUEO, UN_BLOQUEO)
    await briefAbrir(al, wf(), AHORA)
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.version).toBe(1)
    expect(await recibirConcepto(al, entrega(1, '## Devolución del brief\n- el insight no se sostiene', { brief_devuelto: '- el insight no se sostiene' }), AHORA)).toMatchObject({ ok: true, estado: 'brief_devuelto' })
    const b = al.briefsCreativos[1]
    expect(b).toMatchObject({ version: 2, estado: 'validada', motivo: MOTIVO_MEJOR_VERSION_DEL_BRIEF })
    expect(marcados(b)).toContain(`${PREFIJO_AVISO_DE_LA_MEJOR_VERSION}el insight no se sostiene`)
    expect(al.campanas[0].estado).toBe('calendario')
    // en este tramo, la gran idea espera; en el siguiente se abre la v2 (sobre el mismo brief)
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, en_reintento: true, mesa: 'concepto' })
    expect(al.conceptos).toHaveLength(1)
    expect((await conceptoAbrir(al, wf(), TRAMO_2)).cuerpo).toMatchObject({ version: 2, brief_version: 2 })
    expect(al.briefsCreativos).toHaveLength(2)
  })
  it('🔴 la dirección devuelve la mejor versión dos veces: el punto repetido queda una vez y el nuevo se suma', async () => {
    const al = almacen()
    await dosDevueltas(al, UN_BLOQUEO, UN_BLOQUEO)
    await briefAbrir(al, wf(), AHORA)
    await conceptoAbrir(al, wf(), AHORA)
    await recibirConcepto(al, entrega(1, '## Devolución del brief\n- el insight no se sostiene', { brief_devuelto: '- el insight no se sostiene' }), AHORA)
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ en_reintento: true }) // el tramo del tope espera
    expect((await conceptoAbrir(al, wf(), TRAMO_2)).cuerpo.version).toBe(2)
    await recibirConcepto(al, entrega(2, '## Devolución del brief\n- el insight no se sostiene\n- falta el público', { brief_devuelto: '- el insight no se sostiene\n- falta el público' }), TRAMO_2)
    const avisos = marcados(al.briefsCreativos[1])
    expect(avisos.filter((a) => a.endsWith('el insight no se sostiene'))).toHaveLength(1)
    expect(avisos).toContain(`${PREFIJO_AVISO_DE_LA_MEJOR_VERSION}falta el público`)
    expect(al.briefsCreativos[1].estado).toBe('validada')
  })
  it('control: la dirección devuelve un brief que NO es la mejor versión → se devuelve como siempre (y la mesa del brief se reabre)', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    await recibirBrief(al, entrega(1, BRIEF_BUENO), AHORA)
    await conceptoAbrir(al, wf(), AHORA)
    await recibirConcepto(al, entrega(1, '## Devolución del brief\n- el insight no se sostiene', { brief_devuelto: '- el insight no se sostiene' }), AHORA)
    expect(al.briefsCreativos[0].estado).toBe('devuelta')
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo.version).toBe(2)
  })
})

// ───────────────────────────────────────────────────────── D1 · la condición de Lenovo: los avisos llegan a la jefatura con cada pieza
describe('D1 · los avisos del brief llegan escritos a cada pieza y a la jefatura', () => {
  const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 2 }], prohibidas: [], fotos: [] }
  const CONCEPTO = leerConcepto([
    '## Gran idea  Ya llegó · El norte también come de Olón', '## Cómo se ve  Púrpura, turquesa.',
    '## Capítulo F1 · Llegar', 'Qué cuenta: llegamos · Objetivo de la fase (cita): «que el norte sepa» · Cómo se ve en este capítulo: tipografía',
    '## Banco de ideas',
    '- C1-I01 · ig · carrusel · el menú · mensaje: todo el menú a domicilio · gancho: el menú. · protagonista: el plato · serie: ninguna · foto:ninguna',
    '- C1-I02 · ig · carrusel · el local · mensaje: ya abrimos · gancho: mira. · protagonista: el local · serie: ninguna · foto:ninguna',
  ].join('\n'), INS_C)
  const BRIEF = leerBriefCreativo([
    '## De qué parte del plan sale', 'Fase 1: «que el norte sepa».', '## Insight', 'Nadie sabía.', '## Mensaje', 'Ya llegó.',
    '## Público', 'Vecinos del norte que piden comida a domicilio entre semana.', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 pedidos nuevos por semana.',
    '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: encebollado', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna',
  ].join('\n'), { planTexto: '## Fase 1\nObjetivo: que el norte sepa.', prohibidas: [] })
  const FORMATOS: FormatosPorRed = { ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 2, familia: 'carrusel_ig' }] }
  const FILAS: FilaDeHoja[] = [
    { id: 'F1-a', fecha: '2026-11-20', hora: '10:00', red: 'ig', formato: 'carrusel', pilar: 'conveniencia', tema: 'el menú', datos: [], fase: 'F1', idea_ref: 'C1-I01' },
    { id: 'F1-b', fecha: '2026-11-21', hora: '10:00', red: 'ig', formato: 'carrusel', pilar: 'conveniencia', tema: 'el local', datos: [], fase: 'F1', idea_ref: 'C1-I02' },
  ]
  const hoja = (avisos: string[]) => escribirHoja({
    client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
    brief: { ...BRIEF, avisos: [...BRIEF.avisos, ...avisos] }, brief_id: 'brf-v1', concepto: CONCEPTO, concepto_id: 'con-v1', filas: FILAS, formatos: FORMATOS,
  } as InsumosDeLaHoja).texto_md
  const PUNTO = 'la cita «Fase 1: «x».» no se encuentra literal en el plan'
  const OTRO = 'el insight no se sostiene'

  it('🔴 cada pieza lleva el campo con los avisos (sin la marca), y la oficina lo lee dentro del brief de la pieza', () => {
    const t = hoja([`${PREFIJO_AVISO_DE_LA_MEJOR_VERSION}${PUNTO}`, `${PREFIJO_AVISO_DE_LA_MEJOR_VERSION}${OTRO}`])
    for (const id of ['F1-a', 'F1-b']) {
      const b = parsearBrief(t, id)
      expect(b, id).not.toBeNull()
      expect(b!.texto).toContain(`- ${CAMPO_AVISOS_DEL_BRIEF_CREATIVO}:\n  - ${PUNTO}\n  - ${OTRO}`)
      expect(b!.texto).not.toContain(PREFIJO_AVISO_DE_LA_MEJOR_VERSION)
    }
  })
  it('🔴 el revisor de la jefatura recibe esos avisos en «El brief de este entregable»', () => {
    const t = hoja([`${PREFIJO_AVISO_DE_LA_MEJOR_VERSION}${PUNTO}`])
    const brief = parsearBrief(t, 'F1-a')!
    const c = { brief, fuentes: { manual_texto: 'manual', plan_texto: 'plan' }, art: () => undefined } as unknown as ContextoDePedido
    const delBrief = contextoDelRevisor(c).contexto.find((x) => x.titulo === 'El brief de este entregable')!
    expect(delBrief.texto).toContain(CAMPO_AVISOS_DEL_BRIEF_CREATIVO)
    expect(delBrief.texto).toContain(PUNTO)
  })
  it('🔴 sin avisos marcados la hoja no cambia: otros avisos del brief no entran al campo, y quitando el campo queda la hoja de siempre', () => {
    const sin = hoja([])
    expect(sin).not.toContain('AVISOS DEL BRIEF CREATIVO')
    expect(hoja(['un aviso cualquiera del lector'])).toBe(sin)
    const con = hoja([`${PREFIJO_AVISO_DE_LA_MEJOR_VERSION}${PUNTO}`])
    expect(con.replace(new RegExp(`- ${CAMPO_AVISOS_DEL_BRIEF_CREATIVO.replace(/[()]/g, '\\$&')}:\\n  - [^\\n]*\\n`, 'g'), '')).toBe(sin)
  })
})

// ───────────────────────────────────────────────────────── grupo 2 · sin texto que elegir: la vuelta siguiente
describe('grupo 2 · la mesa que no entregó texto se reabre en la vuelta siguiente, a lo más una vez por tramo', () => {
  it('🔴 brief: espera en el tramo del tope (UNA alarma), abre la v3 en el siguiente, y vuelve a esperar hasta el otro tramo', async () => {
    const al = almacen()
    await dosSinTexto(al)
    const r1 = await briefAbrir(al, wf(), AHORA)
    expect(r1).toMatchObject({ status: 200, cuerpo: { ya_hecha: true, en_reintento: true, mesa: 'brief', version: 2 } })
    expect(r1.cuerpo.sobre).toBeUndefined()
    expect(al.campanas[0]).toMatchObject({ estado: 'calendario', estado_motivo: marcaDeMesaEnReintento('brief', '2026-10-09pm') })
    expect(al.avisosAlBuzon).toHaveLength(1)
    expect(al.avisosAlBuzon[0]).toMatchObject({ tipo: 'alarma', clave: `cadena:mesa-en-reintento:brief:${CAMP}:v2` })
    // el mismo tramo, otra vez: sigue esperando y no avisa de nuevo
    expect((await briefAbrir(al, wf(), MISMO_TRAMO)).cuerpo).toMatchObject({ en_reintento: true })
    expect(al.briefsCreativos).toHaveLength(2)
    expect(al.avisosAlBuzon).toHaveLength(1)
    // el tramo siguiente: abre la v3 (con su sobre) y la marca pasa a este tramo
    const r2 = await briefAbrir(al, wf(), TRAMO_2)
    expect(r2).toMatchObject({ status: 200, cuerpo: { version: 3 } })
    expect(r2.cuerpo.sobre).toBeDefined()
    expect(tramoDeLaMarca(al.campanas[0].estado_motivo, 'brief')).toBe('2026-10-10am')
    // la v3 tampoco entrega: en este mismo tramo no se abre otra; en el siguiente, sí
    expect(await recibirBrief(al, entrega(3, null, { motivo: 'tope de la mesa' }), TRAMO_2)).toMatchObject({ estado: 'descartada' })
    expect((await briefAbrir(al, wf(), TRAMO_2)).cuerpo).toMatchObject({ en_reintento: true, version: 3 })
    expect(al.briefsCreativos).toHaveLength(3)
    expect((await briefAbrir(al, wf(), TRAMO_3)).cuerpo).toMatchObject({ version: 4 })
    expect(al.avisosAlBuzon).toHaveLength(1) // una alarma por incidente
    expect(al.campanas[0].estado).toBe('calendario')
  })
  it('🔴 si una de las dos sí trajo texto, no espera: queda esa como la mejor', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(1, UN_BLOQUEO), AHORA)).toMatchObject({ estado: 'devuelta' })
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(2, null, { motivo: 'tope de la mesa' }), AHORA)).toMatchObject({ estado: 'descartada' })
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 3, mejor_version: { de: 1 } })
  })
  it('🔴 el reloj: la segunda vencida ya no detiene y la apertura siguiente espera la vuelta siguiente', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    await cerrarMesasVencidas(al, '2026-10-09T13:30:00Z')
    expect((await briefAbrir(al, wf(), '2026-10-09T13:31:00Z')).cuerpo.version).toBe(2)
    const out = await cerrarMesasVencidas(al, '2026-10-09T15:00:00Z')
    expect(out[0].texto).toMatch(/ya son dos: sigue sola/)
    expect(al.campanas[0].estado).toBe('calendario')
    expect((await briefAbrir(al, wf(), '2026-10-09T15:00:00Z')).cuerpo).toMatchObject({ en_reintento: true })
  })
  it('🔴 gran idea: dos veces sin concepto → espera en el tramo (UNA alarma) y abre la v3 en el siguiente', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    await recibirBrief(al, entrega(1, BRIEF_BUENO), AHORA)
    for (const v of [1, 2]) {
      expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.version).toBe(v)
      expect(await recibirConcepto(al, entrega(v, null, { motivo: 'venció la mesa' }), AHORA)).toMatchObject({ estado: 'sin_mesa' })
    }
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, en_reintento: true, mesa: 'concepto' })
    expect((await conceptoAbrir(al, wf(), MISMO_TRAMO)).cuerpo).toMatchObject({ en_reintento: true })
    expect(al.avisosAlBuzon.filter((a) => a.clave.startsWith('cadena:mesa-en-reintento:concepto:'))).toHaveLength(1)
    expect((await conceptoAbrir(al, wf(), TRAMO_2)).cuerpo).toMatchObject({ version: 3 })
    expect(al.campanas[0].estado).toBe('calendario')
  })
  it('las marcas del brief y de la gran idea no se confunden', () => {
    expect(tramoDeLaMarca(marcaDeMesaEnReintento('brief', '2026-10-09pm'), 'brief')).toBe('2026-10-09pm')
    expect(tramoDeLaMarca(marcaDeMesaEnReintento('brief', '2026-10-09pm'), 'concepto')).toBeNull()
    expect(tramoDeLaMarca(null, 'brief')).toBeNull()
    expect(tramoDeLaMarca('reintento automático · estrategia · la bolsa', 'brief')).toBeNull()
  })
})

// ───────────────────────────────────────────────────────── D2 (c) · el tope de cambios de Emilio
describe('D2 (c) · tope de 3 pedidos de cambios; al 4.º, la pregunta al buzón sin detener la campaña', () => {
  async function conConceptoListo(al: AlmacenMemoria, version: number) {
    const a = await conceptoAbrir(al, wf(), AHORA)
    expect(a.cuerpo.version).toBe(version)
    expect(await recibirConcepto(al, entrega(version, CONCEPTO_BUENO), AHORA)).toMatchObject({ estado: 'lista' })
  }
  it('🔴 tres pedidos abren tres rondas; el 4.º no se aplica, pregunta UNA vez por versión y Emilio puede aprobar', async () => {
    expect(CAP_DE_VUELTAS_DE_CAMBIOS).toBe(3)
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    await recibirBrief(al, entrega(1, BRIEF_BUENO), AHORA)
    await conConceptoListo(al, 1)
    for (const v of [1, 2, 3]) {
      const r = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: `cambio ${v}` }), AHORA)
      expect(r, String(v)).toMatchObject({ status: 200, cuerpo: { siguiente: { mesa: 'concepto', version: v + 1 }, vueltas_restantes: 3 - v } })
      await conConceptoListo(al, v + 1)
    }
    const r4 = await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'un cuarto cambio' }), AHORA)
    expect(r4).toMatchObject({ status: 409, cuerpo: { error: 'vueltas_agotadas', necesita_humano: false, pregunta: 'enviada', detalle: expect.stringContaining('te dejé la pregunta en el buzón') } })
    expect(al.conceptos).toHaveLength(4)
    expect(al.conceptos[3]).toMatchObject({ estado: 'lista', aprobacion: 'pendiente' })
    expect(al.campanas[0].estado).toBe('calendario')
    expect(al.esperas.filter((e) => e.objeto_tipo === 'necesita_humano')).toHaveLength(0)
    const preguntas = al.avisosAlBuzon.filter((a) => a.tipo === 'pregunta')
    expect(preguntas).toHaveLength(1)
    expect(preguntas[0].titulo).toContain('3 veces')
    expect(preguntas[0].detalle).toContain('número 4 sobre la gran idea (el tope firmado es 3)')
    // el mismo pedido otra vez: misma clave (el buzón la marca repetida: no sale a Slack otra vez)
    await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: 'un cuarto cambio' }), AHORA)
    expect(al.avisosAlBuzon.filter((a) => a.tipo === 'pregunta').map((a) => a.accion)).toEqual(['abrio', 'repetida'])
    expect((await conceptoDecidir(al, wf({ decision: 'aprobar' }), AHORA)).status).toBe(200)
  })
})
