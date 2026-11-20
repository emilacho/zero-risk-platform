/**
 * 17-nov · GO Lenovo «arreglo de la historia pobre» (DIAGNOSTICO-CC6-historia-mini-prueba · encargo 503a8f5b) · CC3 construye, CC6 certifica · US$ 0.
 *  (a) el traductor del kit no tira nada: N cuadros por elemento (máximo como dato), lo que sobra se avisa y queda como alternativa;
 *  (b) «—» en un campo es vacío (en «Imagen», ninguna);
 *  (c) la firma / pie del cuadro tiene campo propio en el contrato del kit y se dibuja en el pie;
 *  (d) un desacuerdo de la jefatura vuelve UNA vez a la mesa como corrección; solo si sigue, va a la bandeja marcado.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, puedeVolverALaMesa, recibirResultado } from '../orquestador'
import { traducirPieza, gruposDelKit, separarTitulosPegados, textoAntesDelPrimerTitulo, traeCamposDeLaPieza } from '../mesa/traductor'
import { CONVENCION_DE_LA_PIEZA } from '../mesa/pedidos'
import { armarLaminasDeKit, refDeCuadro, refDelElemento } from '../laminas'
import { aplicarSalidaDeJefatura, avisoDeLaJefaturaALaMesa } from '../paso-jefatura'
import { costoDeVolver } from '../orquestador-video'
import { KIT_MESA, VUELTA_DE_LA_JEFATURA_A_LA_MESA } from '../plantillas/mesa'
import { KIT_HISTORIAS_CON_JEFATURA } from '../plantillas/con-jefatura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { datos } from '../ayudas'
import { estadoInicial, type Plantilla } from '../tipos'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import type { Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

// la pieza REAL de la mini-prueba (forma de `mesa.pieza_texto` del encargo 503a8f5b): 2 láminas, sin ref, «—» en los campos vacíos y la firma escrita aparte
const DOS_LAMINAS = [
  '## Objetivo', 'Que la zona norte sepa que ya llega el encebollado · pedir por naufrago.ec',
  '## Lámina 1 · El gancho', 'Título: ya llegó.', 'Texto: —', 'Llamado: —', 'Firma: el encebollado de Olón · zona norte · naufrago.ec', 'Qué se ve: «ya llegó» en Caveat turquesa sobre púrpura oscuro', 'Imagen: ninguna',
  '## Lámina 2 · La prueba de origen', 'Título: Nació en Olón.', 'Texto: Ahora pídelo desde casa.', 'Llamado: naufrago.ec', 'Imagen: foto:062ec4fa',
].join('\n')

describe('(a) el traductor del kit no tira nada', () => {
  it('🔴 la historia real: 1 elemento y 2 láminas ⇒ 2 cuadros del MISMO elemento (antes la 2.ª, la de la foto, desaparecía sin aviso)', () => {
    const t = traducirPieza(DOS_LAMINAS, 'kit', { refsDelKit: ['e01'], tipoPorRef: { e01: 'historia' }, temaPorRef: { e01: '«ya llegó» en púrpura' } })
    expect(t.ok).toBe(true)
    expect(t.copy_kit!.map((c) => [c.ref, c.headline])).toEqual([['e01', 'ya llegó.'], ['e01-c2', 'Nació en Olón.']])
    expect(t.copy_kit![1]).toMatchObject({ de: 'e01', cuadro: 2, body: 'Ahora pídelo desde casa.', cta: 'naufrago.ec' })
    expect(t.estructura!.map((e) => [e.ref, e.rol, e.de ?? null])).toEqual([['e01', 'historia', null], ['e01-c2', 'historia', 'e01']])
    expect(t.estructura![0].beat).toBe('«ya llegó» en púrpura')
    // el tema del brief es del elemento: el cuadro 2 cuenta lo suyo (su título)
    expect(t.estructura![1].beat).toBe('Nació en Olón.')
    expect(t.imagenes.map((i) => [i.ref, i.modo])).toEqual([['e01', 'ninguna'], ['e01-c2', 'real']])
    expect(t.imagenes[1]).toMatchObject({ foto_id: '062ec4fa' })
  })
  it('🔴 más cuadros que el máximo (dato): se dibujan los primeros, se AVISA y lo demás queda como alternativa', () => {
    const md = ['## e01', 'Título: uno', '## e01 · cuadro 2', 'Título: dos', '## e01 · cuadro 3', 'Título: tres'].join('\n')
    const t = traducirPieza(md, 'kit', { refsDelKit: ['e01'], maxCuadros: 2 })
    expect(t.copy_kit!.map((c) => c.ref)).toEqual(['e01', 'e01-c2'])
    expect(t.avisos.join(' | ')).toMatch(/«e01»: la dirección dejó 3 cuadros y el formato admite 2/)
    expect(t.alternativas!.join(' | ')).toMatch(/cuadro de «e01» que no entró \(e01 · cuadro 3\): Título: tres/)
    // sin dato, 10
    expect(traducirPieza(md, 'kit', { refsDelKit: ['e01'] }).copy_kit).toHaveLength(3)
  })
  it('🔴 un cuadro de más sin título: UNA pregunta; si sigue sin título, aviso y alternativa (nunca en silencio)', () => {
    const md = ['## e01', 'Título: uno', '## e01 · cuadro 2', 'Texto: algo sin título'].join('\n')
    const p = traducirPieza(md, 'kit', { refsDelKit: ['e01'], preguntasHechas: 0 })
    expect(p.ok).toBe(false)
    expect(p.pregunta).toMatch(/«e01-c2»/)
    const t = traducirPieza(md, 'kit', { refsDelKit: ['e01'], preguntasHechas: 1 })
    expect(t.copy_kit!.map((c) => c.ref)).toEqual(['e01'])
    expect(t.avisos.join(' | ')).toMatch(/«e01-c2»: el cuadro no trae título y no se dibujó/)
    expect(t.alternativas!.join(' | ')).toMatch(/cuadro sin título \(e01 · cuadro 2\)/)
  })
  it('qué sección es de qué elemento: el nombre manda; sin nombre, el próximo elemento libre; sin libres, cuadro del anterior', () => {
    const s = (titulo: string) => ({ titulo })
    const g = (titulos: string[], refs: string[]) => Object.fromEntries([...gruposDelKit(titulos.map(s), refs).porRef].map(([r, xs]) => [r, xs.map((x) => x.titulo)]))
    // como antes: una por elemento, por nombre o por orden
    expect(g(['BRF-1 · plato', 'segunda'], ['BRF-1', 'BRF-2'])).toEqual({ 'BRF-1': ['BRF-1 · plato'], 'BRF-2': ['segunda'] })
    expect(g(['a', 'b'], ['e01', 'e02'])).toEqual({ e01: ['a'], e02: ['b'] })
    // nuevo: dos secciones con el mismo ref son dos cuadros (antes la 2.ª se perdía)
    expect(g(['e01', 'e01 · cuadro 2', 'e02'], ['e01', 'e02'])).toEqual({ e01: ['e01', 'e01 · cuadro 2'], e02: ['e02'] })
    // sin libres, la sección sin nombre sigue a la anterior
    expect(g(['e01', 'swipe', 'e02'], ['e01', 'e02'])).toEqual({ e01: ['e01', 'swipe'], e02: ['e02'] })
    expect(g(['e01', 'e02', 'swipe'], ['e01', 'e02'])).toEqual({ e01: ['e01'], e02: ['e02', 'swipe'] })
    // ninguna con nombre y más secciones que elementos: las de más, del último (con aviso)
    const r = gruposDelKit(['a', 'b', 'c'].map(s), ['e01', 'e02'])
    expect([...r.porRef].map(([k, xs]) => [k, xs.length])).toEqual([['e01', 1], ['e02', 2]])
    expect(r.repartidas).toMatch(/las 1 de más quedaron como cuadros de «e02»/)
    expect(gruposDelKit(['a', 'b'].map(s), ['e01']).repartidas).toBeNull()
  })
  it('el cuadro n vuelve a su elemento (destino, día y hora de la entrega)', () => {
    expect(refDeCuadro('e01', 2)).toBe('e01-c2')
    expect(refDelElemento('e01-c2')).toBe('e01')
    expect(refDelElemento('e01-c12')).toBe('e01')
    expect(refDelElemento('e01')).toBe('e01')
    expect(refDelElemento('BRF-1')).toBe('BRF-1')
  })
})

describe('(b) «—» es vacío · (c) la firma tiene campo propio', () => {
  it('🔴 «—» en texto y llamado no se dibuja; en «Imagen» vale «ninguna» (no se genera la escena)', () => {
    const t = traducirPieza(DOS_LAMINAS, 'kit', { refsDelKit: ['e01'] })
    expect(t.copy_kit![0].body).toBeUndefined()
    expect(t.copy_kit![0].cta).toBeUndefined()
    const sinImagen = traducirPieza(['## e01', 'Título: hola', 'Qué se ve: una playa al amanecer', 'Imagen: —'].join('\n'), 'kit', { refsDelKit: ['e01'] })
    expect(sinImagen.imagenes[0].modo).toBe('ninguna')
    // 17-nov · nada se pierde sin aviso (observación de CC1 en #1125): sin imagen, pero el «Qué se ve» de la lámina se conserva
    expect(sinImagen.imagenes[0]).toMatchObject({ modo: 'ninguna', concepto: { que_se_ve: 'una playa al amanecer' } })
    expect(traducirPieza(['## e01', 'Título: hola', 'Qué se ve: el bowl en la mesa', 'Imagen: ninguna'].join('\n'), 'kit', { refsDelKit: ['e01'] }).imagenes[0]).toMatchObject({ modo: 'ninguna', concepto: { que_se_ve: 'el bowl en la mesa' } })
    // control: sin «Imagen» y con escena, se genera esa escena (Mejora 2, igual que antes)
    expect(traducirPieza(['## e01', 'Título: hola', 'Qué se ve: una playa al amanecer'].join('\n'), 'kit', { refsDelKit: ['e01'] }).imagenes[0].modo).toBe('generada')
    // también en el carrusel: «—» nunca es texto
    const c = traducirPieza(['## Lámina 1', 'Título: hola', 'Texto: —', '## Lámina 2', 'Título: chao', 'Texto: – '].join('\n'), 'carrusel', {})
    expect(c.laminas!.map((l) => l.body ?? null)).toEqual([null, null])
  })
  it('🔴 la firma se lee aparte y se dibuja en el pie del cuadro; sin firma, sin pie', () => {
    const t = traducirPieza(DOS_LAMINAS, 'kit', { refsDelKit: ['e01'] })
    expect(t.copy_kit![0].firma).toBe('el encebollado de Olón · zona norte · naufrago.ec')
    expect(t.copy_kit![1].firma).toBeUndefined()
    const r = armarLaminasDeKit(t.estructura!, t.copy_kit!, { 'e01-c2': { origen: 'real', url: 'https://fotos.test/f-01.jpg', foto_id: 'f-01' } })
    expect(r.refs).toEqual(['e01', 'e01-c2'])
    expect(r.slides.map((s) => s.pie)).toEqual(['el encebollado de Olón · zona norte · naufrago.ec', null])
    expect(r.slides[1].background_image_url).toBe('https://fotos.test/f-01.jpg')
    // también «Pie de lámina:»
    expect(traducirPieza(['## e01', 'Título: hola', 'Pie de lámina: naufrago.ec'].join('\n'), 'kit', { refsDelKit: ['e01'] }).copy_kit![0].firma).toBe('naufrago.ec')
  })
  it('el contrato del kit le pide a la dirección la firma y un cuadro por sección con el mismo ref', () => {
    const k = CONVENCION_DE_LA_PIEZA('kit')
    expect(k).toMatch(/Firma: </)
    expect(k).toMatch(/## e01 · cuadro 2/)
  })
})

describe('un solo molde «nada se pierde sin aviso» (REAPERTURA de CC6 · GO Lenovo 13:00Z)', () => {
  it('🔴 el título pegado al texto anterior pasa a su línea (el caso del reel: «…citas.**# Propuesta 1»); «#etiqueta» sin espacio no se toca', () => {
    expect(separarTitulosPegados('Voy a integrar las citas.**# Propuesta 1 · La puerta')).toBe('Voy a integrar las citas.**\n# Propuesta 1 · La puerta')
    expect(separarTitulosPegados('Imagen: ninguna.## Lámina 2')).toBe('Imagen: ninguna.\n## Lámina 2')
    expect(separarTitulosPegados('fin)### e02')).toBe('fin)\n### e02')
    expect(separarTitulosPegados('Pide ya. #encebollado #zonanorte')).toBe('Pide ya. #encebollado #zonanorte')
    expect(separarTitulosPegados('## e01\nTítulo: hola')).toBe('## e01\nTítulo: hola')
    expect(separarTitulosPegados('a\r\nb')).toBe('a\nb')
  })
  it('🔴 en el kit: el cuadro con el título pegado NO se pierde, y se avisa', () => {
    const md = '## Lámina 1 · El gancho\nTítulo: ya llegó.\nImagen: ninguna.## Lámina 2 · La prueba\nTítulo: Nació en Olón.'
    const t = traducirPieza(md, 'kit', { refsDelKit: ['e01'] })
    expect(t.copy_kit!.map((c) => c.headline)).toEqual(['ya llegó.', 'Nació en Olón.'])
    expect(t.avisos.join(' | ')).toMatch(/un título venía pegado al texto anterior/)
    // control: sin título pegado, no hay aviso
    expect(traducirPieza(md.replace('ninguna.## ', 'ninguna.\n## '), 'kit', { refsDelKit: ['e01'] }).avisos.join(' | ')).not.toMatch(/pegado/)
  })
  it('🔴 lo que trae campos ANTES del primer título se avisa y queda como alternativa; la narración del agente, no', () => {
    const conCampos = 'Título: un título suelto\nTexto: perdido\n## e01\nTítulo: hola'
    expect(textoAntesDelPrimerTitulo(conCampos)).toBe('Título: un título suelto\nTexto: perdido')
    expect(traeCamposDeLaPieza('Título: x')).toBe(true)
    expect(traeCamposDeLaPieza('Voy a leer los aportes del tablero antes de integrar.')).toBe(false)
    const t = traducirPieza(conCampos, 'kit', { refsDelKit: ['e01'] })
    expect(t.avisos.join(' | ')).toMatch(/texto antes del primer título: 2 línea\(s\) sin título/)
    expect(t.alternativas!.join(' | ')).toMatch(/texto sin título: Título: un título suelto/)
    const n = traducirPieza('Voy a leer los aportes del tablero.\n## e01\nTítulo: hola', 'kit', { refsDelKit: ['e01'] })
    expect(n.avisos.join(' | ')).not.toMatch(/antes del primer título/)
    expect(textoAntesDelPrimerTitulo('sin títulos')).toBe('')
  })
})

// ───────────────────────── (d) y la historia entera por la puerta y la mesa reales (en seco)
const BRIEF_UNO = `### BRF-0300 · Instagram · kit_historias
- QUÉ ES: Kit semanal de historias y estados (1 elemento)
- PROTAGONISTA: El encebollado llega a la zona norte.
- LÍMITES: 9:16
- VISUAL: Fondo púrpura de la marca.
- ELEMENTOS:
  - 2026-11-20 10:00 | historia | «ya llegó» en púrpura: zona norte | producto | encebollado junior 3.50
- LLAMADO A LA ACCIÓN: Pide en naufrago.ec
`
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo: true, version: 1 })
const DIRECTORIO: Tarjeta[] = [
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'post']),
  tarjeta('design-image-prompt-engineer', 'miembro', ['kit:redacta_prompts']),
  tarjeta('content-creator', 'miembro', ['kit']),
  tarjeta('marketing_instagram_curator', 'miembro', ['kit']),
  tarjeta('portero', 'portero', []),
]
const salida = (desacuerdos: string[], costo = 0.3): SalidaDeRevision => ({
  revision_id: `rev-${Math.random().toString(36).slice(2, 8)}`, artifact_type: 'pieza', artifact_id: 'x', resultado: desacuerdos.length ? 'con_desacuerdo' : 'limpia',
  marcas: { con_desacuerdo: desacuerdos.length > 0, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false,
  desacuerdos, costo_usd: costo, pasos: 1, trace_id: 't', devolver_a: null, simulado: true,
})

function montar(o: { plantilla?: Plantilla; desacuerdos: string[][] }) {
  const pl: Plantilla = JSON.parse(JSON.stringify(o.plantilla ?? KIT_MESA))
  const M = crearMemoria({ parte: parteCon(BRIEF_UNO), plantilla: pl, config: { familias_activas: ['kit_historias'] } })
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = { kit_historias: { plantilla: KIT_HISTORIAS_CON_JEFATURA, activo: true }, kit_mesa: { plantilla: pl, activo: true } }
  M.P.almacen.leerPlantilla = async (f) => plantillas[f] ?? null
  const MS = crearMesaEnMemoria(DIRECTORIO)
  M.P.mesa = { ...MS }
  const revisiones: string[] = []
  M.P.jefatura = async (sobre) => { revisiones.push(sobre.payload.texto); return { estado: 'cerrada', salida: salida(o.desacuerdos[Math.min(revisiones.length - 1, o.desacuerdos.length - 1)]) } }
  return { M, MS, revisiones }
}

/** corre la historia entera: la dirección escribe la pieza en cada turno suyo después de los aportes (la primera vez y, si vuelve, otra vez); los demás aportan breve */
async function correr(x: ReturnType<typeof montar>, piezas: string[]) {
  let r = await abrirEncargo(x.M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0300', dry_run: true, familia: 'kit_historias' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(r.cuerpo.encargo_id)
  const turnos: string[] = []
  let escritas = 0
  for (let i = 0; i < 40 && r.cuerpo.accion === 'esperar'; i++) {
    const t = r.cuerpo.turno as { n: number; paso: string; agente: string }
    turnos.push(t.paso)
    const [, tipo] = t.paso.split(':')
    let texto = `(${t.agente}) aporte breve`
    if (t.agente === 'creative-director-mesa' && tipo !== 'dirige') {
      const citas = x.MS.filas.filter((f) => f.encargo_id === id && f.tipo === 'aporta').map((f) => `A${f.n} usé: ${f.de === 'content-creator' ? 'el titular y el llamado de la historia' : 'el fondo púrpura de la marca'}`).join('\n')
      texto = `${piezas[Math.min(escritas, piezas.length - 1)]}\n## Citas\n${citas}`
      escritas++
    }
    r = await recibirResultado(x.M.P, id, t.n, { texto, costo_usd: 0, workflow_execution_id: `t-${t.n}` })
  }
  return { id, r, turnos, enc: () => x.M.encargos.get(id)! }
}

const CORREGIDA = DOS_LAMINAS.replace('Texto: Ahora pídelo desde casa.', 'Texto: Ahora pídelo desde casa en la zona norte.')

describe('(d) un desacuerdo de la jefatura vuelve UNA vez a la mesa', () => {
  it('🔴 la historia real por la puerta: 2 cuadros dibujados (el 2.º con la foto propia, la firma en el pie del 1.º), y el desacuerdo vuelve a la mesa; la 2.ª revisión limpia ⇒ bandeja sin marca', async () => {
    const x = montar({ desacuerdos: [['texto: anuncia «ya llegó» sin decir que es solo zona norte'], []] })
    const m = await correr(x, [DOS_LAMINAS, CORREGIDA])
    const e = m.enc().estado_del_motor
    // la jefatura revisó DOS veces: la segunda, la pieza corregida por la mesa
    expect(x.revisiones).toHaveLength(2)
    expect(x.revisiones[1]).toMatch(/zona norte/)
    // la mesa recibió la devolución, una sola vez, con el desacuerdo como corrección
    const devoluciones = x.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo === 'devuelve' && f.de === 'oficina-creativa')
    expect(devoluciones).toHaveLength(1)
    expect(devoluciones[0].texto).toMatch(/sin decir que es solo zona norte/)
    expect(e.vueltas.jefatura).toBe(1)
    // los dos cuadros llegaron al dibujo
    const ultimo = x.M.llamadas.renderPedidos[x.M.llamadas.renderPedidos.length - 1] as { slides: Array<{ headline: string; body?: string; pie?: string | null; background_image_url?: string | null }> }
    expect(ultimo.slides.map((s) => s.headline)).toEqual(['ya llegó.', 'Nació en Olón.'])
    expect(ultimo.slides[0].body).toBeUndefined()
    expect(ultimo.slides[0].pie).toBe('el encebollado de Olón · zona norte · naufrago.ec')
    expect(ultimo.slides[1].background_image_url).toBe('https://fotos.test/062ec4fa.jpg')
    expect(datos(e, 'laminas_armadas')?.refs).toEqual(['e01', 'e01-c2'])
    // nada se pierde sin aviso (observación de CC1 en #1125): la lámina sin imagen conserva su «Qué se ve» en la dirección visual
    expect((datos(e, 'visual_direction')?.imagenes as Array<Record<string, unknown>>)[0]).toMatchObject({ ref: 'e01', modo: 'ninguna', concepto: { que_se_ve: '«ya llegó» en Caveat turquesa sobre púrpura oscuro' } })
    // la entrega: los dos cuadros con el día, la hora y el destino de su elemento
    expect(datos(e, 'entrega')?.laminas).toEqual(['2026-11-20_1000_instagram_historia_BRF-0300_01-de-02.png', '2026-11-20_1000_instagram_historia_BRF-0300_02-de-02.png'])
    // la bandeja: una pieza, sin desacuerdo (la segunda revisión cerró limpia)
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false })
    expect(e.fichas.filter((f) => f.origen === 'jefe' && f.estado === 'no_tomada')).toEqual([])
  })
  it('🔴 si el desacuerdo sigue tras la vuelta: NO vuelve otra vez; va a la bandeja con la OBSERVACIÓN declarada (punto 9: no «con desacuerdo»)', async () => {
    const x = montar({ desacuerdos: [['texto: falta la zona norte'], ['texto: falta la zona norte']] })
    const m = await correr(x, [DOS_LAMINAS, DOS_LAMINAS])
    expect(x.revisiones).toHaveLength(2)
    expect(x.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo === 'devuelve' && f.de === 'oficina-creativa')).toHaveLength(1)
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false, observaciones: ['texto: falta la zona norte'] })
    expect(m.enc().estado_del_motor.fichas.filter((f) => f.origen === 'jefe' && f.estado === 'no_tomada').map((f) => f.que)).toEqual(['falta la zona norte'])
  })
  it('control: sin la vuelta en la plantilla (dato), la pieza va directo a la bandeja con el desacuerdo como observación declarada', async () => {
    const sin: Plantilla = JSON.parse(JSON.stringify(KIT_MESA))
    for (const p of sin.pasos) delete p.vuelve_a
    const x = montar({ plantilla: sin, desacuerdos: [['texto: falta la zona norte']] })
    const m = await correr(x, [DOS_LAMINAS])
    expect(x.revisiones).toHaveLength(1)
    expect(x.MS.filas.filter((f) => f.encargo_id === m.id && f.tipo === 'devuelve' && f.de === 'oficina-creativa')).toHaveLength(0)
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false, observaciones: ['texto: falta la zona norte'] })
  })
  it('sin desacuerdos: no vuelve (una sola revisión)', async () => {
    const x = montar({ desacuerdos: [[]] })
    const m = await correr(x, [DOS_LAMINAS])
    expect(x.revisiones).toHaveLength(1)
    expect(m.r.cuerpo.resultado_para_la_sala).toBe('encargo_en_bandeja')
  })
})

describe('(d) las reglas puras de la vuelta', () => {
  const jef = KIT_MESA.pasos.find((p) => p.clave === 'jefatura')!
  it('la plantilla lo declara como dato: una vuelta a la mesa, si la jefatura lo pidió', () => {
    expect(jef.vuelve_a).toEqual(VUELTA_DE_LA_JEFATURA_A_LA_MESA)
    expect(VUELTA_DE_LA_JEFATURA_A_LA_MESA).toEqual({ paso: 'mesa', max: 1, si: { tipo: 'si_artefacto', artefacto: 'respuesta_imagen', campo: 'vuelve_a_la_mesa', igual: true } })
  })
  it('🔴 vuelve solo si queda la vuelta Y cabe en el tope, contando lo que costó esta revisión', () => {
    const e = { ...estadoInicial(), gasto_usd: 1 }
    expect(puedeVolverALaMesa(KIT_MESA, jef, e)?.(0.3)).toBe(true)
    // ya se usó la vuelta
    expect(puedeVolverALaMesa(KIT_MESA, jef, { ...e, vueltas: { jefatura: 1 } })).toBeUndefined()
    // no cabe: lo gastado + esta revisión + lo que cuesta volver pasa el tope (5)
    expect(puedeVolverALaMesa(KIT_MESA, jef, { ...e, gasto_usd: 4.5 })?.(0.3)).toBe(false)
    expect(puedeVolverALaMesa(KIT_MESA, jef, { ...e, gasto_usd: 4.5 })?.(0)).toBe(false)
    // 🔴 cuenta lo que costó ESTA revisión: justo en el borde, sin ella cabe y con ella no
    const borde = KIT_MESA.limites.tope_encargo_usd - costoDeVolver(KIT_MESA, jef) - 0.1
    expect(puedeVolverALaMesa(KIT_MESA, jef, { ...e, gasto_usd: borde })?.(0)).toBe(true)
    expect(puedeVolverALaMesa(KIT_MESA, jef, { ...e, gasto_usd: borde })?.(0.3)).toBe(false)
    // una vuelta a OTRO paso (no a la mesa): nunca
    expect(puedeVolverALaMesa(KIT_MESA, { ...jef, vuelve_a: { ...VUELTA_DE_LA_JEFATURA_A_LA_MESA, paso: 'imagen' } }, e)).toBeUndefined()
    // un paso sin vuelta a la mesa: nunca
    expect(puedeVolverALaMesa(KIT_MESA, { ...jef, vuelve_a: undefined }, e)).toBeUndefined()
  })
  it('🔴 aplicar: con vuelta, el desacuerdo viaja como aviso a la mesa y NO queda como ficha; sin vuelta, ficha de desacuerdo como siempre', () => {
    const e = estadoInicial()
    const s = salida(['texto: falta la zona norte', 'brief: falta el precio'])
    const con = aplicarSalidaDeJefatura(KIT_MESA, e, s, { reImagen: () => ({ re_imagen: false }), puedeVolverALaMesa: () => true })
    expect(con.artefacto).toMatchObject({ vuelve_a_la_mesa: true })
    expect(String(con.artefacto!.aviso_a_la_mesa)).toBe(avisoDeLaJefaturaALaMesa(['texto: falta la zona norte', 'brief: falta el precio']))
    expect(con.fichas ?? []).toEqual([])
    const sin = aplicarSalidaDeJefatura(KIT_MESA, e, s, { reImagen: () => ({ re_imagen: false }), puedeVolverALaMesa: () => false })
    expect(sin.artefacto?.vuelve_a_la_mesa).toBeUndefined()
    expect((sin.fichas ?? []).map((f) => f.que)).toEqual(['falta la zona norte', 'falta el precio'])
    const nada = aplicarSalidaDeJefatura(KIT_MESA, e, salida([]), { reImagen: () => ({ re_imagen: false }), puedeVolverALaMesa: () => true })
    expect(nada.artefacto?.vuelve_a_la_mesa).toBeUndefined()
  })
  it('🔴 (sabotaje sobreviviente de CC6) si la pieza vuelve a la mesa NO se pide además re-imagen; sin vuelta, sí', () => {
    const e = estadoInicial()
    const s = { ...salida(['texto: falta la zona norte']), imagen_por_rehacer: true }
    const pedidas: unknown[] = []
    const reImagen = (t: unknown) => { pedidas.push(t); return { re_imagen: true } }
    const con = aplicarSalidaDeJefatura(KIT_MESA, e, s, { reImagen, puedeVolverALaMesa: () => true })
    expect(con.artefacto).toMatchObject({ vuelve_a_la_mesa: true, re_imagen: false })
    expect(pedidas).toHaveLength(0)
    const sin = aplicarSalidaDeJefatura(KIT_MESA, e, s, { reImagen, puedeVolverALaMesa: () => false })
    expect(sin.artefacto).toMatchObject({ re_imagen: true })
    expect(pedidas).toHaveLength(1)
  })
  it('el aviso a la mesa nombra cada desacuerdo y dice que lo de criterio tiene una sola vuelta (18-nov: la regla dura vuelve las veces que haga falta)', () => {
    const a = avisoDeLaJefaturaALaMesa(['texto: falta la zona norte'])
    expect(a).toMatch(/- texto: falta la zona norte/)
    expect(a).toMatch(/Lo de criterio tiene esta sola vuelta/)
    expect(a).toMatch(/Las reglas duras se toman sí o sí: si siguen rotas, la pieza vuelve otra vez/)
    expect(a).toMatch(/no lo inventes/)
  })
})
