/**
 * 19-nov · LA TANDA B · UN SOLO AUTOR (GO Lenovo 18-nov · firma de Emilio 16:37 Zúrich · «constrúyela ya, apagada» 13:58Z).
 * Diseño: raw/tasks/2026-11-18-GO-LENOVO-a-CC2-CC7-prueba-mesa-actual-vs-un-autor.md (CC2, ~14:00Z).
 *  · apagada: sin el dato de la plantilla, la mesa de siempre (los mismos turnos);
 *  · encendida: conceptos → propuestas → cada revisor UNA vez → corrección UNA vez (solo si hay objeciones) → citas → traducir;
 *  · sin pedidos entre compañeros, sin ronda de crítica (el crítico revisa como uno más);
 *  · lo que el código mide: las objeciones que no nombran un plano que exista.
 * El directorio es el VIVO de la mesa de video (SELECT a `oficina_directorio`, activo, 19-nov ~14:03Z), reducido a los campos que lee el planificador.
 */
import { describe, expect, it } from 'vitest'
import { siguienteDeLaMesa, type ContextoDeLaMesa } from '../mesa/planificador'
import { armarTarea } from '../mesa/pedidos'
import { MODO_UN_AUTOR, modoDeLaPlantilla, objecionesSinPlano, planosDeLasPropuestas, revisoresDe, tareaDelAutor } from '../mesa/un-autor'
import type { Aporte, EstadoMesa, Tarjeta } from '../mesa/tipos'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { KIT_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { estadoDeLaMesa } from '../mesa/orquestador'

const t = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo: true, version: 1 })
/** las filas activas de `oficina_directorio` que tocan el video (19-nov) */
const DIRECTORIO_DE_VIDEO: Tarjeta[] = [
  t('content-creator', 'miembro', ['carrusel', 'kit', 'concepto', 'video', 'post']),
  t('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige']),
  t('design-visual-storyteller', 'miembro', ['kit', 'concepto', 'carrusel', 'video']),
  t('marketing_instagram_curator', 'miembro', ['carrusel', 'kit', 'concepto:si_instagram', 'video:si_instagram', 'post']),
  t('marketing_short_video_editing_coach', 'miembro', ['video']),
  t('portero', 'portero', []),
  t('social-media-strategist', 'miembro', ['carrusel:critica', 'kit:critica', 'post:critica', 'video:critica', 'concepto:critica']),
  t('tiktok-strategist', 'miembro', ['concepto:si_video', 'video:si_tiktok_o_reels']),
  t('video-editor', 'miembro', ['concepto:si_video', 'video']),
  t('whimsy-injector', 'miembro', ['concepto', 'carrusel:si_whimsy', 'kit:si_whimsy', 'video:si_whimsy']),
]
const AUTOR = 'creative-director-mesa'
const est = (o: Partial<EstadoMesa> = {}): EstadoMesa => ({ tipo: 'video', condiciones: ['si_instagram', 'si_tiktok_o_reels'], directorio_congelado: DIRECTORIO_DE_VIDEO, direccion: AUTOR, turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, video: { segundos_min: 15, segundos_max: 30, propuestas: 3 }, ...o })
const deUnAutor = (o: Partial<EstadoMesa> = {}) => est({ modo: MODO_UN_AUTOR, ...o })
const ctx: ContextoDeLaMesa = { gasto_usd: 0, tope_usd: 30, hayImagenGenerada: false, tipo: 'video' }
let n = 0
const ap = (de: string, tipo: Aporte['tipo'], texto: string, o: Partial<Aporte> = {}): Aporte => ({ id: `a${++n}`, encargo_id: 'e', n, de, para: null, tipo, texto, refs: [], responde_a: null, profundidad: 0, costo_usd: 0.05, workflow_execution_id: null, creado_en: '', ...o })

const PROPUESTAS = ['# Propuesta 1 · Olón al amanecer', '## Plano 1 · 0–3 s', 'x', '## Plano 2 · 3–8 s', 'y', '# Propuesta 2 · La mesa larga', '## Plano 1 · 0–3 s', 'z', '# Propuesta 3 · El camino', '## Plano 1 · 0–3 s', 'w', '# Citas'].join('\n')
/** los revisores, en el orden del directorio: los especialistas pertinentes y, al final, el crítico */
const REVISORES = ['content-creator', 'design-visual-storyteller', 'marketing_instagram_curator', 'marketing_short_video_editing_coach', 'tiktok-strategist', 'video-editor', 'social-media-strategist']

/** el libro hasta las propuestas: el autor abrió con sus conceptos y escribió las propuestas */
function hastaLasPropuestas(): Aporte[] {
  n = 0
  return [ap(AUTOR, 'dirige', '## Conceptos\n- …\n## Elegidos\n- …'), ap(AUTOR, 'integra', PROPUESTAS)]
}
const revisiones = (texto: (agente: string) => string): Aporte[] => REVISORES.map((r) => ap(r, 'aporta', texto(r)))

describe('el modo lo dice la plantilla (dato) · apagado por omisión', () => {
  it('solo «un_autor» lo enciende', () => {
    expect(modoDeLaPlantilla({ modo_de_la_mesa: 'un_autor' })).toBe(MODO_UN_AUTOR)
    for (const v of [undefined, null, '', 'UN_AUTOR', 'otro', true, 1, { un_autor: true }]) expect(modoDeLaPlantilla({ modo_de_la_mesa: v })).toBeNull()
    expect(modoDeLaPlantilla({})).toBeNull()
  })
  it('sin el modo, la mesa de siempre: abierta la pieza, aporta un especialista (no escribe el autor)', () => {
    const libro = [ap(AUTOR, 'dirige', 'idea rectora')]
    expect(siguienteDeLaMesa(est(), libro, ctx)).toMatchObject({ accion: 'turno', agente: 'content-creator', tipo: 'aportar' })
    expect(siguienteDeLaMesa(deUnAutor(), libro, ctx)).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'integrar' })
  })
})

describe('los turnos del autor y los revisores', () => {
  it('abre el autor (sus conceptos) y después escribe las propuestas', () => {
    expect(siguienteDeLaMesa(deUnAutor(), [], ctx)).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'dirigir' })
    n = 0
    expect(siguienteDeLaMesa(deUnAutor(), [ap(AUTOR, 'dirige', 'conceptos')], ctx)).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'integrar', motivo: 'el autor escribe las propuestas' })
  })
  it('revisan todos los especialistas de la mesa, uno por vez, y el crítico como uno más (nunca el portero ni el autor)', () => {
    expect(revisoresDe(deUnAutor(), false)).toEqual(REVISORES)
    const libro = hastaLasPropuestas()
    const vistos: string[] = []
    for (let i = 0; i < REVISORES.length; i++) {
      const a = siguienteDeLaMesa(deUnAutor(), libro, ctx)
      expect(a).toMatchObject({ accion: 'turno', tipo: 'aportar' })
      const quien = (a as { agente: string }).agente
      vistos.push(quien)
      libro.push(ap(quien, 'aporta', 'Sin objeciones: está fiel al plan.'))
    }
    expect(vistos).toEqual(REVISORES)
  })
  it('si nadie objeta, no hay corrección: a traducir', () => {
    const libro = [...hastaLasPropuestas(), ...revisiones(() => 'Sin objeciones: cumple el plan y el manual.')]
    expect(siguienteDeLaMesa(deUnAutor(), libro, ctx)).toEqual({ accion: 'traducir' })
  })
  it('con una objeción, el autor corrige UNA vuelta; con todas las revisiones citadas, a traducir', () => {
    const libro = [...hastaLasPropuestas(), ...revisiones((r) => (r === 'video-editor' ? 'Propuesta 1 · Plano 2 · el plano dura poco · por qué: no entra la acción' : 'Sin objeciones: bien.'))]
    expect(siguienteDeLaMesa(deUnAutor(), libro, ctx)).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'integrar', motivo: 'el autor corrige una vuelta con las objeciones' })
    const citas = libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} ${a.de === 'video-editor' ? 'usé: alargué el plano dos para que entre la acción' : 'descarté: no tenía objeciones que tomar'}`)
    const corregida = ap(AUTOR, 'integra', `${PROPUESTAS}\n${citas.join('\n')}`)
    expect(siguienteDeLaMesa(deUnAutor({ integraciones: 2 }), [...libro, corregida], ctx)).toEqual({ accion: 'traducir' })
  })
  it('la corrección que no cita a un revisor se devuelve UNA vez por citas; la segunda vez, a traducir', () => {
    const libro = [...hastaLasPropuestas(), ...revisiones((r) => (r === 'video-editor' ? 'Propuesta 1 · Plano 2 · corto · por qué: no entra la acción' : 'Sin objeciones: bien.'))]
    const sinUno = libro.filter((a) => a.tipo === 'aporta' && a.de !== 'whimsy-injector' && a.de !== 'content-creator').map((a) => `A${a.n} usé: lo tomé tal como vino en la revisión`)
    const corregida = ap(AUTOR, 'integra', `${PROPUESTAS}\n${sinUno.join('\n')}`)
    const a = siguienteDeLaMesa(deUnAutor(), [...libro, corregida], ctx)
    expect(a).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'devolver_citas' })
    expect((a as { faltan_citas: { sin_cita: Array<{ agente: string }> } }).faltan_citas.sin_cita.map((x) => x.agente)).toEqual(['content-creator'])
    expect(siguienteDeLaMesa(deUnAutor({ devoluciones_por_citas: 1 }), [...libro, corregida], ctx)).toEqual({ accion: 'traducir' })
  })
  it('no hay ronda de crítica ni pedidos entre compañeros: un pedido de un revisor a otro no abre turno', () => {
    const libro = hastaLasPropuestas()
    libro.push(ap('content-creator', 'pide', '¿qué ritmo le das?', { para: 'video-editor', profundidad: 1 }))
    const a = siguienteDeLaMesa(deUnAutor(), libro, ctx)
    expect(a).toMatchObject({ accion: 'turno', agente: 'content-creator', tipo: 'aportar' })
    const todas = [...libro, ...revisiones(() => 'Sin objeciones: bien.')]
    expect(siguienteDeLaMesa(deUnAutor(), todas, ctx)).toEqual({ accion: 'traducir' })
  })
  it('lo que se le devuelve al autor (la vuelta) lo contesta y vuelve a integrar', () => {
    const libro = [...hastaLasPropuestas(), ...revisiones((r) => (r === 'video-editor' ? 'Propuesta 1 · Plano 2 · corto · por qué: x' : 'Sin objeciones: bien.'))]
    const citas = libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: lo tomé tal como vino en la revisión`)
    libro.push(ap(AUTOR, 'integra', `${PROPUESTAS}\n${citas.join('\n')}`))
    const vuelta = ap('oficina-creativa', 'devuelve', 'la jefatura devolvió la propuesta 2', { para: AUTOR })
    libro.push(vuelta)
    expect(siguienteDeLaMesa(deUnAutor(), libro, ctx)).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'responder', responde_a: vuelta.id })
    libro.push(ap(AUTOR, 'responde', 'cambio el plano 1 de la propuesta 2', { responde_a: vuelta.id }))
    expect(siguienteDeLaMesa(deUnAutor(), libro, ctx)).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'integrar', motivo: 'hay aportes nuevos' })
  })
  it('los topes son los de la mesa: sin dinero para otro turno, el autor cierra con lo que hay', () => {
    n = 0
    const libro = [ap(AUTOR, 'dirige', 'conceptos')]
    expect(siguienteDeLaMesa(deUnAutor(), libro, { ...ctx, gasto_usd: 23.5 })).toMatchObject({ accion: 'turno', agente: AUTOR, tipo: 'integrar', motivo: expect.stringContaining('cierra con lo que hay') })
  })
})

describe('por la puerta y la mesa reales: el modo se congela al abrir desde la plantilla', () => {
  const BRIEF_KIT = `### BRF-0200 · Instagram · kit_historias\n- QUÉ ES: Kit semanal de historias y estados\n- PROTAGONISTA: El plato del día.\n- LÍMITES: 9:16\n- VISUAL: Fondo de la marca, sin personas.\n- ELEMENTOS:\n  - 2026-10-14 18:30 | historia | el plato del día | producto | precio 7.00\n- LLAMADO A LA ACCIÓN: Escríbenos\n`
  const parte = `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${BRIEF_KIT}`
  async function dosTurnos(conModo: boolean): Promise<{ pasos: string[]; modo: unknown }> {
    const pl: Plantilla = JSON.parse(JSON.stringify(KIT_MESA))
    if (conModo) (pl.limites as Record<string, unknown>).modo_de_la_mesa = 'un_autor'
    const M = crearMemoria({ parte, plantilla: pl, config: { familias_activas: ['kit_mesa'] } })
    const MS = crearMesaEnMemoria()
    M.P.mesa = MS
    let r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0200', dry_run: true, familia: 'kit_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(r.cuerpo.encargo_id)
    const pasos: string[] = []
    for (let i = 0; i < 6 && pasos.length < 2 && r.cuerpo.accion === 'esperar'; i++) {
      const t = r.cuerpo.turno as { n: number; paso: string }
      if (t.paso.startsWith('mesa:')) pasos.push(t.paso)
      r = await recibirResultado(M.P, id, t.n, { texto: 'conceptos y elegidos', costo_usd: 0, workflow_execution_id: `t-${t.n}` })
    }
    return { pasos, modo: estadoDeLaMesa(M.encargos.get(id)!.estado_del_motor)?.modo }
  }
  it('con el dato: el autor abre y escribe él (integrar); sin el dato: abre y aporta un especialista (control)', async () => {
    const con = await dosTurnos(true)
    expect(con.modo).toBe(MODO_UN_AUTOR)
    expect(con.pasos).toEqual(['mesa:dirigir:creative-director-mesa', 'mesa:integrar:creative-director-mesa'])
    const sin = await dosTurnos(false)
    expect(sin.modo).toBeUndefined()
    expect(sin.pasos[0]).toBe('mesa:dirigir:creative-director-mesa')
    expect(sin.pasos[1]).toMatch(/^mesa:aportar:/)
  })
})

describe('lo que el código mide · objeciones sin plano (no frena)', () => {
  it('lee los planos de cada propuesta', () => {
    expect([...planosDeLasPropuestas(PROPUESTAS)].sort()).toEqual(['1.1', '1.2', '2.1', '3.1'])
  })
  it('cuenta las objeciones y separa las que no nombran un plano que exista (la sugerencia y la revisión sin objeciones no cuentan)', () => {
    const libro = [
      ...hastaLasPropuestas(),
      ap('video-editor', 'aporta', ['Propuesta 1 · Plano 2 · corto · por qué: x', '- Propuesta 2 · Plano 3 · no existe · por qué: y', 'Propuesta 3 · el tono general · por qué: z', 'Sugerencia: más luz'].join('\n')),
      ap('content-creator', 'aporta', 'Sin objeciones: está fiel al plan.\nPropuesta 1 · Plano 9 · una nota que no es objeción · por qué: la revisión dijo «sin objeciones»'),
    ]
    const r = objecionesSinPlano(libro)
    expect(r.total).toBe(3)
    expect(r.sin_plano.map((o) => o.linea)).toEqual(['- Propuesta 2 · Plano 3 · no existe · por qué: y', 'Propuesta 3 · el tono general · por qué: z'])
  })
})

describe('las tareas', () => {
  const c = { cliente_nombre: 'Cliente', tipo: 'video' as const, brief_id: 'V1', brief_texto: 'EL-BRIEF', manual_texto: 'EL-MANUAL', plan_texto: 'EL-PLAN', fotos: [], tope_usd: 30, gasto_usd: 0, video: { segundos_min: 15, segundos_max: 30, propuestas: 3 } }
  const tarea = (e: EstadoMesa, tipo: 'dirigir' | 'aportar' | 'integrar', libro: Aporte[] = [], agente = AUTOR) => armarTarea({ tipo, agente, tarjeta: undefined, est: e, libro, c })
  it('encendida: el autor saca unos 20 conceptos y elige 3; el revisor revisa con objeciones atadas a un plano', () => {
    expect(tarea(deUnAutor(), 'dirigir')).toContain('unos 20 conceptos cortos')
    expect(tarea(deUnAutor(), 'dirigir')).toContain('los 3 conceptos que vas a desarrollar')
    const rev = tarea(deUnAutor(), 'aportar', hastaLasPropuestas(), 'video-editor')
    expect(rev).toContain('Propuesta <K> · Plano <N>')
    expect(rev).not.toContain('Tu aporte es obligatorio')
  })
  it('apagada: las tareas de siempre', () => {
    expect(tarea(est(), 'dirigir')).not.toContain('unos 20 conceptos')
    expect(tarea(est(), 'aportar', [], 'video-editor')).toContain('Tu aporte es obligatorio')
  })
  it('las propuestas y la corrección llevan la convención del guion; la corrección lista las objeciones sin plano', () => {
    expect(tarea(deUnAutor(), 'integrar', hastaLasPropuestas().slice(0, 1))).toContain('# Propuesta 1')
    const libro = [...hastaLasPropuestas(), ap('video-editor', 'aporta', 'Propuesta 2 · Plano 7 · no existe · por qué: y')]
    const corr = tareaDelAutor({ tipo: 'integrar', agente: AUTOR, libro, propuestas: 3, convencion: 'LA-CONVENCION' })
    expect(corr).toContain('corrige las 3 propuestas (una sola vuelta)')
    expect(corr).toContain(`- A${libro[2].n} (video-editor): Propuesta 2 · Plano 7 · no existe · por qué: y`)
    expect(corr).toContain('LA-CONVENCION')
  })
})
