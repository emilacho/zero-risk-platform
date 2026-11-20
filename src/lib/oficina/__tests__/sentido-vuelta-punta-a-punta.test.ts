/**
 * CAMBIO 4 · firma de Emilio (17-nov 20:34) · de punta a punta por la puerta y la mesa reales (en seco · US$ 0):
 * la jefatura devuelve una corrección de sentido a la mesa → el aviso le pide la respuesta al creador → la dirección responde en una línea propia →
 * esa línea NO sale en la pieza, queda guardada, y la revisión siguiente la lee. El mismo hallazgo no reabre y nadie lo manda a una persona.
 */
import { describe, expect, it } from 'vitest'
import { fichaEnLineas, type FichaDeOferta, type HechoDelNegocioPorOferta } from '../../cadena/ficha-de-oferta'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { datosDeLaJefatura } from '../paso-jefatura'
import { KIT_MESA } from '../plantillas/mesa'
import { VUELTAS_POR_REGLA_DURA, conVueltaPorReglaDura } from '../plantillas/vuelta-por-regla-dura'
import { KIT_HISTORIAS_CON_JEFATURA } from '../plantillas/con-jefatura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { datos } from '../ayudas'
import type { Plantilla } from '../tipos'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import type { Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

const FICHA: FichaDeOferta = { clave: 'oferta-a', nombre: 'Oferta A', que_es: { valor: 'lo que se vende', fuente: 'ficha:1' }, oferta_y_precio: [{ valor: 'el principal $7,00', fuente: 'manual:precios' }], no_se_puede_afirmar: [{ valor: 'que ya atiende en persona', fuente: 'cerebro:dueno · fichas:3', vigente_desde: '2026-10-01' }] }
const LINEAS = fichaEnLineas(FICHA, '2026-11-20')
const LINEA_NO = LINEAS.find((l) => l.startsWith('NO se puede afirmar'))!
const BRIEF = `### BRF-0300 · Instagram · kit_historias
- QUÉ ES: Kit semanal de historias y estados (1 elemento)
- OFERTA: oferta-a
- FICHA DE LA OFERTA:
${LINEAS.map((l) => `  - ${l}`).join('\n')}
- PROTAGONISTA: Lo principal llega a la zona norte.
- LÍMITES: 9:16
- VISUAL: Fondo de la marca.
- ELEMENTOS:
  - 2026-11-20 10:00 | historia | «ya llegó»: zona norte | producto | el principal 7.00
- LLAMADO A LA ACCIÓN: Pide en la web
`
const PIEZA = ['## Objetivo', 'Que la zona norte sepa que ya llega', '## Lámina 1 · El gancho', 'Título: ya llegó.', 'Texto: Pídelo desde casa.', 'Llamado: la web', 'Qué se ve: «ya llegó» sobre el fondo de la marca', 'Imagen: ninguna'].join('\n')
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo: true, version: 1 })
const DIRECTORIO: Tarjeta[] = [tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'post']), tarjeta('content-creator', 'miembro', ['kit']), tarjeta('portero', 'portero', [])]
const salida = (desacuerdos: string[]): SalidaDeRevision => ({ revision_id: 'rev', artifact_type: 'pieza', artifact_id: 'x', resultado: desacuerdos.length ? 'con_desacuerdo' : 'limpia', marcas: { con_desacuerdo: desacuerdos.length > 0, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false, desacuerdos, costo_usd: 0.3, pasos: 1, trace_id: 't', devolver_a: null, simulado: true }) as unknown as SalidaDeRevision

const HALLAZGO = `texto: sentido · pieza: da a entender que ya atiende en persona — ficha: «${LINEA_NO}»`

async function correr(desacuerdos: string[][], piezas: string[], o: { hechos?: HechoDelNegocioPorOferta[]; fecha?: string; real?: boolean; brief?: string; cerebroCaido?: boolean; plantilla?: Plantilla } = {}) {
  const pl: Plantilla = JSON.parse(JSON.stringify(o.plantilla ?? KIT_MESA))
  const M = crearMemoria({ parte: parteCon(o.brief ?? BRIEF), plantilla: pl, config: { familias_activas: ['kit_historias'] } })
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = { kit_historias: { plantilla: KIT_HISTORIAS_CON_JEFATURA, activo: true }, kit_mesa: { plantilla: pl, activo: true } }
  M.P.almacen.leerPlantilla = async (f) => plantillas[f] ?? null
  const MS = crearMesaEnMemoria(DIRECTORIO)
  M.P.mesa = { ...MS }
  const revisiones: string[] = []
  let lecturasDelCerebro = 0
  if (o.hechos || o.cerebroCaido) M.P.hechosPorOferta = async () => { lecturasDelCerebro++; if (o.cerebroCaido) throw new Error('el cerebro no contesta'); return o.hechos! }
  M.P.jefatura = async (sobre) => { revisiones.push(sobre.payload.texto); return { estado: 'cerrada', salida: salida(desacuerdos[Math.min(revisiones.length - 1, desacuerdos.length - 1)]) } }
  let r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0300', dry_run: !o.real, familia: 'kit_historias' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(r.cuerpo.encargo_id)
  // la fila del calendario que guarda el encargo (`sala_ref.fila`): de ahí sale la fecha con que se miden los hechos vivos
  if (o.fecha) M.encargos.get(id)!.sala_ref = { fila: { id: 'F-0300', fecha: o.fecha } }
  for (let i = 0; i < 160 && r.cuerpo.accion === 'esperar'; i++) {
    const t = r.cuerpo.turno as { n: number; paso: string; agente: string }
    const [, tipo] = t.paso.split(':')
    let texto = `(${t.agente}) aporte breve`
    if (t.agente === 'creative-director-mesa' && tipo !== 'dirige') {
      const citas = MS.filas.filter((f) => f.encargo_id === id && f.tipo === 'aporta').map((f) => `A${f.n} usé: el titular`).join('\n')
      // antes de la vuelta escribe la 1.ª pieza; después de la devolución de la jefatura, la 2.ª (con su respuesta)
      // 18-nov · puede haber varias vueltas (la regla dura vuelve las veces que haga falta): la pieza n.º «vueltas»
      const vueltas = MS.filas.filter((f) => f.encargo_id === id && f.tipo === 'devuelve' && f.de === 'oficina-creativa').length
      texto = `${piezas[Math.min(vueltas, piezas.length - 1)]}\n## Citas\n${citas}`
    }
    r = await recibirResultado(M.P, id, t.n, { texto, costo_usd: 0, workflow_execution_id: `t-${t.n}` })
  }
  const enc = M.encargos.get(id)
  if (!enc) throw new Error(`el encargo no se abrió: ${JSON.stringify(r.cuerpo)}`)
  return { r, revisiones, avisos: MS.filas.filter((f) => f.encargo_id === id && f.tipo === 'devuelve' && f.de === 'oficina-creativa').map((f) => f.texto), e: enc.estado_del_motor, llamadas: M.llamadas, lecturasDelCerebro }
}

describe('firma de Emilio · la vuelta con respuesta del creador, de punta a punta', () => {
  it('🔴 «no tomada» con motivo: el aviso la pide, la línea no sale en la pieza, queda guardada, el mismo hallazgo no reabre y la pieza sigue sin marca', async () => {
    const m = await correr([[HALLAZGO], [HALLAZGO]], [PIEZA, `${PIEZA}\nRESPUESTA A LA JEFATURA S1: no tomada: «ya llegó» habla de la entrega a domicilio, no de atender en persona`])
    expect(m.revisiones).toHaveLength(2)
    expect(m.avisos).toHaveLength(1)
    expect(m.avisos[0]).toContain('[S1] sentido · pieza:')
    expect(m.avisos[0]).toContain('RESPUESTA A LA JEFATURA S1: tomada')
    // la línea de respuesta no viaja en la pieza (ni a la segunda revisión)
    expect(m.revisiones[1]).not.toContain('RESPUESTA A LA JEFATURA')
    expect(String(datos(m.e, 'mesa')?.pieza_texto)).not.toContain('RESPUESTA A LA JEFATURA')
    expect(datos(m.e, 'mesa')?.respuestas_a_la_jefatura).toHaveLength(1)
    const j = datosDeLaJefatura(m.e)!
    expect(j.sentido!.respuestas_del_creador).toEqual([expect.objectContaining({ id: 'S1', respuesta: 'no_tomada', motivo: '«ya llegó» habla de la entrega a domicilio, no de atender en persona' })])
    expect(j.sentido!.no_reabre).toHaveLength(1)
    expect(m.e.vueltas.jefatura).toBe(1)
    expect(m.e.fichas.filter((f) => f.origen === 'jefe' && f.estado === 'no_tomada')).toEqual([])
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false })
    expect(JSON.stringify(m.e)).not.toMatch(/a_humano|decide una persona/)
  })

  it('🔴 sin respuesta del creador: se declara «no dicha», nunca «tomada»; sigue el camino normal declarándolo (no espera a una persona)', async () => {
    const m = await correr([[HALLAZGO], []], [PIEZA, PIEZA])
    const j = datosDeLaJefatura(m.e)!
    expect(j.sentido!.respuestas_del_creador).toEqual([expect.objectContaining({ id: 'S1', respuesta: 'no_dicha', declarado: 'el creador no respondió esta corrección' })])
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false })
  })

  it('🔴 regla dura D3 en la pieza: vuelve con «regla dura»; si el creador la corrige, sale limpia; si no, la pieza se FRENA (RESPUESTA-LENOVO punto 3)', async () => {
    const mal = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $9,90.')
    const bien = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $7.')
    const ok = await correr([[], []], [mal, `${bien}\nRESPUESTA A LA JEFATURA S1: tomada`])
    expect(ok.avisos[0]).toMatch(/\[S1\] sentido · pieza: D3 · el precio «\$9,90».*regla dura: se toma sí o sí/)
    expect(datosDeLaJefatura(ok.e)!.sentido!.respuestas_del_creador).toEqual([expect.objectContaining({ id: 'S1', respuesta: 'tomada', dura: true })])
    expect(ok.r.cuerpo).toMatchObject({ con_desacuerdo: false })
    const no = await correr([[], []], [mal, `${mal}\nRESPUESTA A LA JEFATURA S1: no tomada: prefiero ese precio`])
    expect(no.r.cuerpo).toMatchObject({ con_desacuerdo: true, frenada: true })
    expect(no.e.fichas.filter((f) => f.gravedad === 'bloquea' && f.estado === 'no_tomada').map((f) => f.que).join(' ')).toMatch(/D3 · el precio/)
  })

  it.each([
    ['«no tomada» con motivo', (mal: string) => `${mal}\nRESPUESTA A LA JEFATURA S1: no tomada: prefiero ese precio`],
    ['sin respuesta («no dicha»)', (mal: string) => mal],
  ])('🔴 RESPUESTA-LENOVO punto 3 · regla dura que sigue rota tras la vuelta, %s: la pieza NO se publica (ni salida ni bandeja), con su motivo, sin «una persona» y con UNA alarma', async (_c, segunda) => {
    const mal = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $9,90.')
    const m = await correr([[], []], [mal, segunda(mal)], { real: true })
    expect(m.r.cuerpo).toMatchObject({ accion: 'cerrado', frenada: true, con_desacuerdo: true, output_id: null, hitl_queue_id: null })
    expect(m.llamadas.salidas).toEqual([])
    expect(m.llamadas.bandeja).toEqual([])
    const j = datosDeLaJefatura(m.e)!
    expect(j.sentido!.duras_no_tomadas).toEqual([expect.objectContaining({ destino: 'pieza', origen: 'codigo', que: expect.stringMatching(/^D3 · el precio «\$9,90»/) })])
    const ficha = m.e.fichas.find((f) => f.gravedad === 'bloquea' && f.estado === 'no_tomada' && /D3 · el precio/.test(f.que ?? ''))!
    expect(ficha.propuesta).toMatch(/regla dura pendiente: la pieza queda en corrección, sin publicarse ni ir a la bandeja/)
    const alarmas = m.llamadas.avisos.filter((a) => a.canal === 'alertas')
    expect(alarmas).toHaveLength(1)
    // 18-nov · GO Lenovo 13:52Z · ya no «frenada»: «en corrección» (esta plantilla tiene UNA vuelta: no cabe otra)
    expect(m.r.cuerpo).toMatchObject({ en_correccion: true })
    expect(alarmas[0].texto).toMatch(/^🔁 Pieza en corrección · BRF-0300: regla dura pendiente — pieza: D3 · el precio «\$9,90»/)
    expect(alarmas[0].texto).toMatch(/Las demás piezas siguen\.$/)
    expect(alarmas[0].texto).not.toMatch(/frenada/)
    expect(JSON.stringify({ e: m.e, a: m.llamadas.avisos })).not.toMatch(/una persona decide|decide una persona|a_humano/)
  })

  describe('18-nov · GO Lenovo 13:52Z · con la vuelta por regla dura (202611181530), la regla dura vuelve al creador las veces que haga falta', () => {
    const CON_VUELTAS = conVueltaPorReglaDura(KIT_MESA)
    const mal = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $9,90.')
    const bien = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $7.')
    it('🔑 rota en la 1.ª y en la 2.ª, corregida en la 3.ª: vuelve DOS veces (la 2.ª solo con la regla dura) y sale limpia a la bandeja', async () => {
      const m = await correr([[HALLAZGO], [HALLAZGO], [HALLAZGO]], [mal, `${mal}\nRESPUESTA A LA JEFATURA S1: no tomada: prefiero ese precio`, `${bien}\nRESPUESTA A LA JEFATURA S1: tomada`], { plantilla: CON_VUELTAS, real: true })
      expect(m.e.vueltas.jefatura).toBe(2)
      expect(m.avisos).toHaveLength(2)
      expect(m.avisos[0]).toMatch(/D3 · el precio «\$9,90».*regla dura: se toma sí o sí/)
      // la 2.ª vuelta lleva SOLO la regla dura: lo de criterio (el mismo hallazgo de sentido) ya tuvo su vuelta y no reabre
      expect(m.avisos[1]).toMatch(/estas REGLAS DURAS siguen rotas/)
      expect(m.avisos[1]).toMatch(/\[S1\] .*D3 · el precio «\$9,90»/)
      expect(m.avisos[1]).not.toMatch(/atiende en persona/)
      expect(datosDeLaJefatura(m.e)!.sentido!.duras_no_tomadas).toBeUndefined()
      expect(m.r.cuerpo).not.toHaveProperty('en_correccion')
      expect(m.llamadas.bandeja).toHaveLength(1)
      expect(m.llamadas.avisos.filter((a) => /Pieza en corrección|Pieza frenada/.test(a.texto))).toEqual([])
    })
    it('🔴 rota siempre: vuelve mientras cabe y, al no caber otra (red de 6 vueltas, pasos o dinero), queda EN CORRECCIÓN · ni salida ni bandeja, UNA alarma', async () => {
      const m = await correr([[]], [mal], { plantilla: CON_VUELTAS, real: true })
      expect(m.e.vueltas.jefatura).toBeGreaterThanOrEqual(2)
      expect(m.e.vueltas.jefatura).toBeLessThanOrEqual(VUELTAS_POR_REGLA_DURA)
      expect(m.r.cuerpo).toMatchObject({ accion: 'cerrado', en_correccion: true, output_id: null, hitl_queue_id: null })
      expect(m.llamadas.salidas).toEqual([])
      expect(m.llamadas.bandeja).toEqual([])
      expect(m.llamadas.avisos.filter((a) => a.canal === 'alertas')).toEqual([expect.objectContaining({ texto: expect.stringMatching(/^🔁 Pieza en corrección · BRF-0300: regla dura pendiente/) })])
      expect(datosDeLaJefatura(m.e)!.sentido!.vueltas_por_regla_dura).toBe(m.e.vueltas.jefatura - 1)
    })
  })

  it('la regla dura que el creador SÍ corrigió (aunque no lo diga) no frena: manda la medición del código, no la respuesta', async () => {
    const mal = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $9,90.')
    const bien = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo desde casa a $7.')
    const m = await correr([[], []], [mal, bien], { real: true })
    expect(m.r.cuerpo).not.toHaveProperty('frenada')
    expect(datosDeLaJefatura(m.e)!.sentido!.duras_no_tomadas).toBeUndefined()
    expect(m.llamadas.avisos.filter((a) => a.canal === 'alertas' && /Pieza frenada/.test(a.texto))).toEqual([])
  })

  it('🔴 D1 con los hechos VIVOS: la hoja no trae cierre, el cerebro registró uno después ⇒ la pieza vuelve al calendario como regla dura (no se publica sola)', async () => {
    const hechos: HechoDelNegocioPorOferta[] = [{ oferta: 'oferta-a', tipo: 'cierre_retiro', valor: 'la oferta se suspende', vigente_desde: '2026-11-18', fuente: 'dueno:chat-17nov' }]
    const m = await correr([[]], [PIEZA], { hechos, fecha: '2026-11-20' })
    const j = datosDeLaJefatura(m.e)!
    expect(j.sentido!.devoluciones).toEqual([expect.objectContaining({ llave: 'F-0300:calendario', destino: 'calendario', dura: true, origen: 'codigo' })])
    expect(j.sentido!.declarado.join(' ')).toMatch(/hechos vivos/)
    expect(m.e.fichas.some((f) => f.donde === 'calendario' && f.gravedad === 'bloquea' && /^sentido · calendario: D1 · /.test(f.que ?? ""))).toBe(true)
    // eslabones 1 y 3 de #1150 · en ENSAYO no se llama al receptor (medida 5 de CC7): la devolución queda declarada y la pieza sigue, simulada · lo real: espera-de-la-cadena.test.ts
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', simulado: true })
    expect(m.r.cuerpo.observaciones).toEqual(expect.arrayContaining([expect.stringMatching(/^calendario: \(ensayo\) no se devolvió a la cadena: D1 · /)]))
  })
  it('sin hecho vivo de cierre (o con uno que empieza después), la misma pieza sale limpia', async () => {
    const hechos: HechoDelNegocioPorOferta[] = [{ oferta: 'oferta-a', tipo: 'cierre_retiro', valor: 'la oferta se suspende', vigente_desde: '2026-11-25', fuente: 'dueno:chat-17nov' }]
    const m = await correr([[]], [PIEZA], { hechos, fecha: '2026-11-20' })
    expect(datosDeLaJefatura(m.e)!.sentido!.devoluciones).toEqual([])
    expect(m.r.cuerpo).toMatchObject({ con_desacuerdo: false })
  })
})

/**
 * 18-nov · RESPUESTA-LENOVO-a-CC3-CC7 (#1147) · en la revisión de la jefatura el estado de la oferta se lee EN VIVO del cerebro; si choca con la hoja, MANDA el cerebro.
 * Por la puerta real (abrirEncargo → mesa → jefatura → aplicación), en seco y a US$ 0.
 */
describe('#1147 · D1 en la jefatura: manda el cerebro de hoy, en los dos sentidos', () => {
  const CERRADA = BRIEF.replace('- PROTAGONISTA:', '- OFERTA CERRADA EN SU FECHA: la oferta se retiró (fuente: cerebro:dueno · ficha:f1)\n- PROTAGONISTA:')
  const SIN_FICHA = BRIEF.replace(/- FICHA DE LA OFERTA:\n(?:  - .*\n)+/, '- FICHA DE LA OFERTA: sin fichas de hechos todavía · declarado\n')
  const CIERRE = (d: Partial<HechoDelNegocioPorOferta> = {}): HechoDelNegocioPorOferta => ({ oferta: 'oferta-a', tipo: 'cierre_retiro', valor: 'la oferta se suspende', vigente_desde: '2026-11-18', fuente: 'dueno:chat-17nov', ...d })
  it('🔴 la hoja trae la oferta CERRADA, pero el cerebro de hoy la da abierta ⇒ la pieza sale limpia y queda declarado que mandó el cerebro', async () => {
    const m = await correr([[]], [PIEZA], { brief: CERRADA, hechos: [], fecha: '2026-11-20' })
    const j = datosDeLaJefatura(m.e)!
    expect(j.sentido!.devoluciones).toEqual([])
    expect(j.sentido!.declarado.join(' ')).toMatch(/el cerebro de hoy la da abierta.*manda el cerebro/)
    expect(m.r.cuerpo).toMatchObject({ con_desacuerdo: false })
  })
  it('🔴 sabotaje del anterior · la misma hoja CERRADA con el cerebro diciendo cerrada ⇒ D1 frena (vuelve al calendario como regla dura)', async () => {
    const m = await correr([[]], [PIEZA], { brief: CERRADA, hechos: [CIERRE()], fecha: '2026-11-20' })
    expect(datosDeLaJefatura(m.e)!.sentido!.devoluciones).toEqual([expect.objectContaining({ llave: 'F-0300:calendario', destino: 'calendario', dura: true, origen: 'codigo' })])
  })
  it('🔴 el cerebro no contesta ⇒ NO se lee como abierta: la hoja CERRADA sigue frenando y se declara «sin verificar»', async () => {
    const m = await correr([[]], [PIEZA], { brief: CERRADA, cerebroCaido: true, fecha: '2026-11-20' })
    const j = datosDeLaJefatura(m.e)!
    expect(j.sentido!.devoluciones).toEqual([expect.objectContaining({ destino: 'calendario', dura: true })])
    expect(j.sentido!.declarado.join(' ')).toMatch(/sin verificar/)
  })
  it('🔴 SIN ficha en la hoja, un cierre vivo del cerebro igual frena con D1', async () => {
    const m = await correr([[]], [PIEZA], { brief: SIN_FICHA, hechos: [CIERRE()], fecha: '2026-11-20' })
    expect(datosDeLaJefatura(m.e)!.sentido!.devoluciones).toEqual([expect.objectContaining({ llave: 'F-0300:calendario', destino: 'calendario', dura: true, origen: 'codigo' })])
  })
  it('una sola lectura del cerebro por revisión, aunque la hoja ya traiga el cierre', async () => {
    const m = await correr([[]], [PIEZA], { brief: CERRADA, hechos: [CIERRE()], fecha: '2026-11-20' })
    expect(m.lecturasDelCerebro).toBe(1)
  })
})

describe('18-nov · GO Lenovo «lo exacto se autocorrige» · en la mesa, antes de traducir (lo que se DIBUJA sale corregido)', () => {
  it('🔴 un teléfono y un @ ajenos en el texto de la mesa: las láminas y su copy llevan los del cliente, se declara, y la pieza va a la bandeja sin vuelta', async () => {
    const p = PIEZA.replace('Texto: Pídelo desde casa.', 'Texto: Pídelo al 0988 111 222.').replace('Llamado: la web', 'Llamado: escribe a @otra_marca')
    const m = await correr([[], []], [p, p])
    expect(datos(m.e, 'copy_kit')?.elementos).toEqual([expect.objectContaining({ body: 'Pídelo al +593 997 744 288.', cta: 'escribe a @naufrago.ec' })])
    expect(JSON.stringify(datos(m.e, 'laminas_armadas'))).not.toMatch(/0988 111 222|@otra_marca/)
    expect(m.revisiones[0]).not.toMatch(/0988 111 222|@otra_marca/)
    expect(datos(m.e, 'mesa')?.autocorregido).toEqual([
      'se corrigió solo: el teléfono 0988 111 222 → +593 997 744 288 (el del cliente)',
      'se corrigió solo: el usuario @otra_marca → @naufrago.ec (el del cliente)',
    ])
    expect(m.e.vueltas.jefatura ?? 0).toBe(0)
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false })
  })
})
