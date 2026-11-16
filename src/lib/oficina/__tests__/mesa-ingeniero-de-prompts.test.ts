/** Sprint 1 · mejora 4 · el ingeniero de prompts: un turno propio DESPUÉS de la integración; lo que escribe es lo que recibe el modelo de imagen (US$ 0: todo en memoria) */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { especialistasPertinentes, esPertinente, ingenieroDePrompts } from '../mesa/directorio'
import { ingenieroPendiente, siguienteDeLaMesa } from '../mesa/planificador'
import { aporteDePrompts, conceptoEnTexto, leerPromptsDelIngeniero, promptsParaElBrazo, tareaDelIngeniero } from '../mesa/prompts'
import type { Aporte, EstadoMesa, Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { DIRECTORIO, crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, LAMINAS_OK, jugar, parteCon, pieza } from './mesa-arnes'

const ING = 'design-image-prompt-engineer'
const T = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo, version: 1 })
const DIR: Tarjeta[] = [
  T('creative-director-mesa', 'direccion', ['carrusel', 'kit']),
  T('content-creator', 'miembro', ['carrusel', 'kit']),
  T(ING, 'miembro', ['carrusel:redacta_prompts', 'kit:redacta_prompts']),
  T('portero', 'portero', []),
]
const est = (o: Partial<EstadoMesa> = {}): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: DIR, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, ...o })
let n = 0
const A = (o: Partial<Aporte> & Pick<Aporte, 'de' | 'tipo'>): Aporte => { n++; return { id: `id-${n}`, encargo_id: 'e1', n, para: null, texto: 'texto', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: 'x', creado_en: '2026-11-16T00:00:00Z', ...o } }
const ctx = (img: boolean, g = 0.5, tope = 5) => ({ gasto_usd: g, tope_usd: tope, hayImagenGenerada: img })
/** dirección abre, el redactor aporta, la dirección integra citándolo */
const integrada = (): Aporte[] => { n = 0; return [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'creative-director-mesa', tipo: 'integra', texto: '## Lámina 1 · hook\nTítulo: hola\nImagen: generar: un plato\n## Citas\nA2 usé: el texto' })] }

describe('directorio · quién es el ingeniero de prompts lo dice el dato', () => {
  it('la marca `<tipo>:redacta_prompts` lo hace ingeniero y lo saca de los aportes de antes de la integración', () => {
    expect(ingenieroDePrompts(DIR, 'carrusel')?.agente).toBe(ING)
    expect(ingenieroDePrompts(DIR, 'kit')?.agente).toBe(ING)
    expect(ingenieroDePrompts(DIR, 'video')).toBeNull()
    expect(esPertinente(DIR[2], 'carrusel', true, ['redacta_prompts'])).toBe(false)
    expect(especialistasPertinentes(DIR, 'carrusel', true)).toEqual(['content-creator'])
  })
  it('sin la marca (directorio de hoy) o con la tarjeta apagada no hay ingeniero: la mesa trabaja como antes', () => {
    expect(ingenieroDePrompts(DIRECTORIO, 'carrusel')).toBeNull()
    expect(ingenieroDePrompts(DIR.map((t) => (t.agente === ING ? { ...t, activo: false } : t)), 'carrusel')).toBeNull()
    expect(ingenieroDePrompts(DIR.map((t) => (t.agente === ING ? { ...t, rol: 'portero' as const } : t)), 'carrusel')).toBeNull()
  })
})

describe('planificador · el turno del ingeniero va después de la integración', () => {
  it('pieza integrada con imagen a generar → turno `redactar_prompts`; con su texto escrito → traducir, sin volver a integrar', () => {
    const l = integrada()
    expect(siguienteDeLaMesa(est(), l, ctx(true))).toMatchObject({ accion: 'turno', agente: ING, tipo: 'redactar_prompts' })
    const conPrompts = [...l, A({ de: ING, tipo: 'aporta', texto: '## hook\nPrompt: a plate' })]
    expect(siguienteDeLaMesa(est(), conPrompts, ctx(true))).toEqual({ accion: 'traducir' })
  })
  it('sin imágenes a generar, sin integración o sin ingeniero no hay turno de prompts', () => {
    const l = integrada()
    expect(siguienteDeLaMesa(est(), l, ctx(false))).toEqual({ accion: 'traducir' })
    expect(ingenieroPendiente(est(), l.slice(0, 2), true)).toBeNull()
    expect(siguienteDeLaMesa(est({ directorio_congelado: DIR.filter((t) => t.agente !== ING) }), l, ctx(true))).toEqual({ accion: 'traducir' })
  })
  it('antes de la integración el ingeniero NO es convocado a aportar', () => {
    n = 0
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' })]
    expect(siguienteDeLaMesa(est(), l, ctx(true))).toMatchObject({ agente: 'creative-director-mesa', tipo: 'integrar' })
  })
  it('un texto del ingeniero ANTERIOR a la última integración no cuenta: vuelve a escribir sobre la pieza nueva', () => {
    const l = integrada()
    const viejo = [...l, A({ de: ING, tipo: 'aporta' }), A({ de: 'creative-director-mesa', tipo: 'integra', texto: '## Lámina 1\nImagen: generar: otro plato\n## Citas\nA2 usé: el texto' })]
    expect(aporteDePrompts(viejo, ING)).toBeNull()
    expect(siguienteDeLaMesa(est(), viejo, ctx(true))).toMatchObject({ agente: ING, tipo: 'redactar_prompts' })
  })
  it('sus reintentos tienen cota: tras 3 turnos muertos la mesa sigue a traducir con la descripción de la dirección', () => {
    const l = [...integrada(), A({ de: ING, tipo: 'nota', texto: 'turno_fallido: x' }), A({ de: ING, tipo: 'nota', texto: 'turno_fallido: x' })]
    expect(siguienteDeLaMesa(est(), l, ctx(true))).toMatchObject({ agente: ING, tipo: 'redactar_prompts' })
    const tres = [...l, A({ de: ING, tipo: 'nota', texto: 'turno_fallido: x' })]
    expect(siguienteDeLaMesa(est(), tres, ctx(true))).toEqual({ accion: 'traducir' })
  })
  it('«cierra con lo que hay»: tras la integración final escribe los prompts si cabe bajo el techo; si no, a dibujar', () => {
    const l = integrada()
    const cerrando = est({ cierre_forzado: 'se usaron los 24 turnos de la mesa', marcas: { integracion_forzada: true } })
    expect(siguienteDeLaMesa(cerrando, l, ctx(true, 0.5, 5))).toMatchObject({ agente: ING, tipo: 'redactar_prompts' })
    expect(siguienteDeLaMesa(cerrando, [...l, A({ de: ING, tipo: 'aporta' })], ctx(true, 0.5, 5))).toMatchObject({ accion: 'seguir_a_dibujar' })
    // gastado casi todo: la reserva de un turno más lo que sigue no cabe bajo el techo ×1,2
    expect(siguienteDeLaMesa(cerrando, l, ctx(true, 4.5, 5))).toMatchObject({ accion: 'seguir_a_dibujar' })
  })
})

describe('lectura tolerante de lo que escribe el ingeniero', () => {
  const TXT = '## Lámina 1 · hook\nPrompt: Close-up of a steaming bowl of fish soup on a rustic wooden table,\nsoft morning light, 50mm, no text, no letters, no logos.\nReferencia: foto:abc-123\n\n## benefit\n**Prompt:** "Wide shot of a beach restaurant at sunset, no text."\nReferencia: ninguna'
  it('una sección por imagen; el encabezado vale si contiene el ref; prompt en varias líneas; foto de referencia', () => {
    const r = leerPromptsDelIngeniero(TXT, ['hook', 'benefit'])
    expect(r.por_ref.hook).toEqual({ prompt: 'Close-up of a steaming bowl of fish soup on a rustic wooden table, soft morning light, 50mm, no text, no letters, no logos.', foto_de_referencia: 'abc-123' })
    expect(r.por_ref.benefit).toEqual({ prompt: 'Wide shot of a beach restaurant at sunset, no text.' })
  })
  it('con una sola imagen y sin encabezados, el texto entero es su prompt', () => {
    expect(leerPromptsDelIngeniero('A plate of ceviche, top view, no text.', ['hook']).por_ref.hook.prompt).toBe('A plate of ceviche, top view, no text.')
  })
  it('lo que falta se cubre con la descripción de la dirección y queda un aviso; sin ingeniero no hay aviso', () => {
    const r = promptsParaElBrazo([{ ref: 'hook', descripcion: 'un plato' }, { ref: 'cta', descripcion: 'la playa' }], TXT)
    expect(r.por_ref.hook.prompt).toMatch(/^Close-up/)
    expect(r.por_ref.cta).toEqual({ prompt: 'la playa' })
    expect(r.del_ingeniero).toEqual(['hook'])
    expect(r.avisos).toEqual([expect.stringMatching(/«cta».*descripción de la dirección/)])
    expect(promptsParaElBrazo([{ ref: 'hook', descripcion: 'un plato' }], null)).toEqual({ por_ref: { hook: { prompt: 'un plato' } }, avisos: [], del_ingeniero: [] })
  })
  it('la tarea: inglés, escena, lugar, luz, lente, estilo del manual, sin texto en la imagen, foto real del producto, y la lista de imágenes', () => {
    const t = tareaDelIngeniero([{ ref: 'hook', descripcion: 'un plato servido' }])
    for (const x of [/inglés/, /lugar/, /luz/, /lente/, /manual de marca/, /Sin texto dentro de la imagen/, /no text, no letters, no logos/, /Zona libre para texto/, /DÓNDE queda un área limpia/, /Referencia:/, /\*\*hook\*\* · lo que pidió la dirección: un plato servido/]) expect(t).toMatch(x)
    expect(t).not.toMatch(/Concepto de esta imagen/)
  })
  it('el concepto de la imagen (mejora 2 de CC1), si viene, entra en la lista; lo vacío no se escribe', () => {
    const t = tareaDelIngeniero([{ ref: 'hook', descripcion: 'un plato', concepto: { objetivo: 'dar a conocer la web', que_se_ve: 'el encebollado humeante', mensaje: '', emocion: 'antojo' } }])
    expect(t).toMatch(/Concepto de esta imagen: objetivo: dar a conocer la web · qué se ve: el encebollado humeante · emoción: antojo/)
    expect(conceptoEnTexto(undefined)).toBe('')
    expect(conceptoEnTexto({ idea: '  ' })).toBe('')
  })
})

describe('LA MESA · punta a punta con el ingeniero en el directorio (ensayo, en memoria)', () => {
  const DIR_ING = DIRECTORIO.map((t) => (t.agente === ING ? { ...t, pertinente_en: ['carrusel:redacta_prompts', 'kit:redacta_prompts'] } : t))
  /** monta la mesa y guarda el CONTENIDO de cada artefacto que se escribe (la memoria solo guarda su huella): ahí viajan `avisos_del_traductor` */
  async function montarConIngeniero(directorio: Tarjeta[] = DIR_ING) {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA })
    const MS = crearMesaEnMemoria(directorio)
    M.P.mesa = MS
    const contenidos: Array<Record<string, unknown>> = []
    const guardar = M.P.almacen.guardar.bind(M.P.almacen)
    M.P.almacen.guardar = async (c) => { if (c.artefacto?.contenido) contenidos.push(c.artefacto.contenido as Record<string, unknown>); return guardar(c) }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    return { M, MS, a, id: String(a.cuerpo.encargo_id), contenidos }
  }
  /** los avisos que el cierre de la mesa dejó en el artefacto `mesa` (contenido con `avisos_del_traductor`) */
  const avisosDelCierre = (contenidos: Array<Record<string, unknown>>): string[] => {
    const c = [...contenidos].reverse().find((x) => Array.isArray(x.avisos_del_traductor))
    expect(c, 'el cierre de la mesa escribió su artefacto con avisos_del_traductor').toBeDefined()
    return c!.avisos_del_traductor as string[]
  }
  const CITAS = '## Citas\nA2 usé: los titulares\nA3 usé: el ritmo de las láminas\nA4 usé: la dirección visual del plato'
  const PROMPT = 'Overhead shot of the dish of the day served on a light wooden table, natural window light from the left, 35mm, shallow depth of field, no text, no letters, no logos.'

  it('el ingeniero escribe DESPUÉS de integrar, recibe la imagen pedida, y su prompt es el que llega al brazo de imagen', async () => {
    const { M, MS, a, id } = await montarConIngeniero()
    const { ultima, turnos } = await jugar(M, id, a, (t) => {
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: pieza(LAMINAS_OK, CITAS) }
      if (t.tipo === 'redactar_prompts') return { texto: `## Lámina 1 · hook\nPrompt: ${PROMPT}\nReferencia: ninguna` }
      return undefined
    })
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true })
    expect(turnos.filter((t) => t.tipo === 'aportar').map((t) => t.agente)).not.toContain(ING)
    const iInt = turnos.findIndex((t) => t.tipo === 'integrar')
    const iIng = turnos.findIndex((t) => t.tipo === 'redactar_prompts')
    expect(iIng).toBeGreaterThan(iInt)
    expect(turnos[iIng]).toMatchObject({ agente: ING, paso: `mesa:redactar_prompts:${ING}` })
    expect(turnos[iIng].task).toMatch(/\*\*hook\*\* · lo que pidió la dirección: un plato servido sobre una mesa de madera clara, luz natural/)
    expect(turnos.filter((t) => t.tipo === 'integrar')).toHaveLength(1)
    expect(MS.filas.map((f) => f.tipo)).toEqual(['dirige', 'aporta', 'aporta', 'aporta', 'integra', 'aporta'])
    const pv = M.encargos.get(id)!.estado_del_motor.artefactos.prompts_validos.datos as { por_ref: Record<string, { prompts: Array<{ prompt: string }>; origen: string }>; ingeniero?: { agente: string } }
    expect(pv.por_ref.hook.prompts[0].prompt).toBe(PROMPT)
    expect(pv.por_ref.hook.origen).toBe('ingeniero_de_prompts')
    expect(pv.ingeniero?.agente).toBe(ING)
    expect(M.llamadas.imagen).toBe(1)
  })

  it('si el ingeniero no deja nada legible, la imagen sale con la descripción de la dirección y la pieza no se frena', async () => {
    const { M, a, id, contenidos } = await montarConIngeniero()
    const { ultima } = await jugar(M, id, a, (t) => {
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: pieza(LAMINAS_OK, CITAS) }
      if (t.tipo === 'redactar_prompts') return { texto: '## otra cosa\nPrompt: algo que no es de ninguna lámina' }
      return undefined
    })
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    const pv = M.encargos.get(id)!.estado_del_motor.artefactos.prompts_validos.datos as { por_ref: Record<string, { prompts: Array<{ prompt: string }>; origen: string }> }
    expect(pv.por_ref.hook.prompts[0].prompt).toBe('un plato servido sobre una mesa de madera clara, luz natural')
    expect(pv.por_ref.hook.origen).toBe('direccion')
    // CC6 m18 · el aviso llega a la pieza (artefacto `mesa`), no solo a la función pura
    expect(avisosDelCierre(contenidos)).toEqual(expect.arrayContaining([expect.stringMatching(/el ingeniero de prompts no dejó una instrucción legible para «hook»/)]))
  })

  it('CC6 m19 · con el directorio de hoy (sin `redacta_prompts`) todo queda como antes: sin turno, sin avisos de prompts, origen `direccion`', async () => {
    const { M, a, id, contenidos } = await montarConIngeniero(DIRECTORIO)
    const { ultima, turnos } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: pieza(LAMINAS_OK, CITAS + '\nA5 usé: el prompt de la primera imagen') } : undefined))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(turnos.map((t) => t.tipo)).not.toContain('redactar_prompts')
    const pv = M.encargos.get(id)!.estado_del_motor.artefactos.prompts_validos.datos as { por_ref: Record<string, { prompts: Array<{ prompt: string }>; origen: string }>; ingeniero?: unknown }
    expect(pv.por_ref.hook.prompts[0].prompt).toBe('un plato servido sobre una mesa de madera clara, luz natural')
    expect(pv.por_ref.hook.origen).toBe('direccion')
    expect(pv.ingeniero).toBeUndefined()
    expect(avisosDelCierre(contenidos).filter((x) => /ingeniero de prompts/.test(x))).toEqual([])
  })
})
