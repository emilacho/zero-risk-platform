/**
 * 17-nov · «creativos en cada paso» (GO Lenovo · firma de Emilio 07:18 · punto 1) · la mesa CORTA de las historias y la palanca por cliente.
 *  · la palanca apagada (ausente, vacía, ilegible, otro cliente) deja la ruta EXACTA de siempre; encendida y con la mesa activa, la pieza nueva abre `kit_mesa`;
 *  · una reapertura o una devolución del dueño sigue en la línea en que nació; con la mesa apagada, la palanca no deja la pieza sin producir;
 *  · el freno de la campaña reserva lo de la familia que de verdad corre;
 *  · en la mesa se sientan SOLO los 3 asientos (más quien dirige y el portero) y hay UNA ronda de aportes.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { CLAVE_DE_LA_PALANCA, FAMILIA_CON_MESA, familiaConMesa, gruposHermanos, palancaEncendida, topesConMesa } from '../mesa/con-mesa'
import { directorioConAsientos } from '../mesa/orquestador'
import { siguienteDeLaMesa } from '../mesa/planificador'
import { ASIENTOS_DE_LA_MESA_CORTA, KIT_MESA, RONDAS_DE_LA_MESA_CORTA } from '../plantillas/mesa'
import { KIT_HISTORIAS_CON_JEFATURA } from '../plantillas/con-jefatura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import type { Aporte, EstadoMesa, Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

const OTRO = '00000000-0000-4000-8000-000000000099'
const ON = { clientes: [CLIENTE] }

describe('la palanca por cliente (puro)', () => {
  it('apagada por defecto: ausente, vacía, mal formada u otro cliente', () => {
    for (const v of [undefined, null, {}, { clientes: [] }, { clientes: OTRO }, [CLIENTE], 'si', { clientes: [OTRO] }]) expect(palancaEncendida(v, CLIENTE)).toBe(false)
    expect(palancaEncendida(ON, CLIENTE)).toBe(true)
  })
  it('solo rutea una familia con versión con mesa, con la palanca encendida y la mesa activa', () => {
    expect(familiaConMesa('kit_historias', ON, CLIENTE, () => true)).toBe('kit_mesa')
    expect(familiaConMesa('kit_historias', ON, CLIENTE, () => false)).toBe('kit_historias')
    expect(familiaConMesa('kit_historias', { clientes: [] }, CLIENTE, () => true)).toBe('kit_historias')
    expect(familiaConMesa('carrusel_ig_v1', ON, CLIENTE, () => true)).toBe('carrusel_ig_v1')
    expect(familiaConMesa('video_mesa', ON, CLIENTE, () => true)).toBe('video_mesa')
    expect(familiaConMesa(null, ON, CLIENTE, () => true)).toBeNull()
  })
  it('hoy solo las historias tienen versión con mesa por palanca (la foto llega en su tramo)', () => {
    expect(FAMILIA_CON_MESA).toEqual({ kit_historias: 'kit_mesa' })
  })
  it('la misma pieza por las dos líneas cuenta como una (versiones y reaperturas)', () => {
    expect(gruposHermanos('kit_mesa').sort()).toEqual(['kit_historias', 'kit_mesa'])
    expect(gruposHermanos('kit_historias').sort()).toEqual(['kit_historias', 'kit_mesa'])
    expect(gruposHermanos('post_img')).toEqual(['post_img'])
  })
})

describe('el freno de la campaña reserva lo de la familia que corre', () => {
  const topes = { kit_historias: 2.5, post_img: 2.5, kit_mesa: 5 }
  it('sin palanca: los mapas salen IGUALES (mismo objeto)', () => {
    const r = { kit_historias: 1.2 }
    const s = topesConMesa(topes, r, { clientes: [OTRO] }, CLIENTE)
    expect(s.topes).toBe(topes)
    expect(s.reservas).toBe(r)
  })
  it('con palanca: la historia reserva el tope de la mesa (sin historia de la mesa) y nunca baja', () => {
    const s = topesConMesa(topes, { kit_historias: 1.2 }, ON, CLIENTE)
    expect(s.topes.kit_historias).toBe(5)
    expect(s.reservas?.kit_historias).toBe(5)
    expect(s.topes.post_img).toBe(2.5)
    // con lo esperado de la mesa medido, se usa ese
    expect(topesConMesa(topes, { kit_historias: 1.2, kit_mesa: 3.1 }, ON, CLIENTE).reservas?.kit_historias).toBe(3.1)
    // una reserva de siempre mayor se queda (del lado seguro)
    expect(topesConMesa({ ...topes, kit_historias: 8 }, { kit_historias: 7, kit_mesa: 3.1 }, ON, CLIENTE).reservas?.kit_historias).toBe(7)
  })
  it('con palanca pero la mesa apagada (sin tope de familia activa): nada cambia', () => {
    const s = topesConMesa({ kit_historias: 2.5 }, { kit_historias: 1 }, ON, CLIENTE)
    expect(s.topes).toEqual({ kit_historias: 2.5 })
    expect(s.reservas).toEqual({ kit_historias: 1 })
  })
})

// ───────────────────────── la puerta de la oficina
const BRIEF_KIT = `### BRF-0200 · Instagram · kit_historias
- QUÉ ES: Kit semanal de historias y estados
- PROTAGONISTA: El plato del día.
- LÍMITES: 9:16
- VISUAL: Fondo de la marca, sin personas.
- ELEMENTOS:
  - 2026-10-14 18:30 | historia | el plato del día | producto | precio 7.00
  - 2026-10-15 09:00 | estado | horario de la semana | servicio
- LLAMADO A LA ACCIÓN: Escríbenos
`
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`

function montarPuerta(o: { palanca?: unknown; mesaActiva?: boolean; leerFalla?: boolean } = {}) {
  const M = crearMemoria({ parte: parteCon(BRIEF_KIT), plantilla: KIT_HISTORIAS_CON_JEFATURA, config: { familias_activas: ['kit_historias'] } })
  const leidas: string[] = []
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = {
    kit_historias: { plantilla: JSON.parse(JSON.stringify(KIT_HISTORIAS_CON_JEFATURA)), activo: true },
    kit_mesa: { plantilla: JSON.parse(JSON.stringify(KIT_MESA)), activo: o.mesaActiva ?? true },
  }
  M.P.almacen.leerPlantilla = async (f) => { leidas.push(f); return plantillas[f] ?? null }
  const MS = crearMesaEnMemoria()
  const pedidas: string[] = []
  M.P.mesa = { ...MS, configDeLaCadena: async (k: string) => { pedidas.push(k); if (o.leerFalla) throw new Error('base caída'); return k === CLAVE_DE_LA_PALANCA ? o.palanca : undefined } }
  const abrir = (extra: Record<string, unknown> = {}) => abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0200', dry_run: true, familia: 'kit_historias', ...extra }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const encargo = () => [...M.encargos.values()].at(-1)!
  return { M, abrir, encargo, leidas, pedidas }
}

describe('la puerta de la oficina con la palanca', () => {
  it('APAGADA (ausente): la historia abre kit_historias, EXACTO como hoy, y no lee la plantilla con mesa', async () => {
    const x = montarPuerta({ palanca: undefined })
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_historias')
    expect(x.encargo().tipo_de_grupo).toBe('kit_historias')
    expect(x.encargo().sala_ref?.con_mesa).toBeUndefined()
    expect(x.leidas).not.toContain('kit_mesa')
  })
  it('apagada para OTRO cliente o vacía: la ruta de siempre', async () => {
    for (const palanca of [{ clientes: [OTRO] }, { clientes: [] }]) {
      const x = montarPuerta({ palanca })
      await x.abrir()
      expect(x.encargo().familia).toBe('kit_historias')
    }
  })
  it('si la palanca no se puede leer: la ruta de siempre (nunca frena la pieza)', async () => {
    const x = montarPuerta({ palanca: ON, leerFalla: true })
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_historias')
  })
  it('ENCENDIDA y la mesa activa: la pieza nueva abre kit_mesa (tope de la mesa) y deja dicho desde qué familia vino', async () => {
    const x = montarPuerta({ palanca: ON })
    await x.abrir()
    expect(x.pedidas).toContain(CLAVE_DE_LA_PALANCA)
    expect(x.encargo().familia).toBe('kit_mesa')
    expect(x.encargo().tipo_de_grupo).toBe('kit_mesa')
    expect(x.encargo().tope_usd).toBe(KIT_MESA.limites.tope_encargo_usd)
    expect(x.encargo().sala_ref?.con_mesa).toEqual({ de: 'kit_historias', a: 'kit_mesa' })
  })
  it('encendida pero la mesa APAGADA: la pieza sigue por la línea de siempre (no queda sin producir)', async () => {
    const x = montarPuerta({ palanca: ON, mesaActiva: false })
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_historias')
  })
  it('una REAPERTURA o una devolución del dueño sigue en la línea en que nació', async () => {
    const x = montarPuerta({ palanca: ON })
    await x.abrir({ reabrir_causa_corregida: 'se corrigió el largo del sobre-título' })
    expect(x.encargo().familia).toBe('kit_historias')
  })
})

// ───────────────────────── los asientos y la ronda
const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo, version: 1 })
const DIRECTORIO_VIVO: Tarjeta[] = [
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige', 'video:dirige']),
  tarjeta('jefe-marketing', 'direccion', ['reubicacion:dirige', 'fallidos:dirige']),
  tarjeta('design-visual-storyteller', 'miembro', ['kit', 'concepto', 'carrusel', 'video']),
  tarjeta('design-image-prompt-engineer', 'miembro', ['carrusel:redacta_prompts', 'kit:redacta_prompts']),
  tarjeta('inclusive-visuals-specialist', 'miembro', ['carrusel:si_personas', 'kit:si_personas']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'concepto', 'video']),
  tarjeta('marketing_instagram_curator', 'miembro', ['carrusel', 'kit', 'concepto:si_instagram', 'video:si_instagram']),
  tarjeta('whimsy-injector', 'miembro', ['concepto', 'carrusel:si_whimsy', 'kit:si_whimsy']),
  tarjeta('review-responder', 'miembro', [], false),
  tarjeta('portero', 'portero', []),
]

describe('la mesa corta de las historias: 3 asientos y 1 ronda', () => {
  it('la plantilla lo declara como dato: los 3 asientos y una ronda; sigue sin pasos de agente ni de portero y con UNA jefatura', () => {
    expect(KIT_MESA.limites.asientos).toEqual(['marketing_instagram_curator', 'design-image-prompt-engineer', 'content-creator'])
    expect(KIT_MESA.limites.rondas_de_la_mesa).toBe(1)
    expect([...ASIENTOS_DE_LA_MESA_CORTA]).toHaveLength(3)
    expect(RONDAS_DE_LA_MESA_CORTA).toBe(1)
    expect(KIT_MESA.pasos.filter((p) => p.tipo === 'agente' || p.tipo === 'portero')).toHaveLength(0)
    expect(KIT_MESA.pasos.filter((p) => p.tipo === 'jefatura')).toHaveLength(1)
  })
  it('en la mesa se sientan solo los 3 asientos, más quien dirige y el portero (nadie inactivo)', () => {
    const d = directorioConAsientos(DIRECTORIO_VIVO, KIT_MESA.limites.asientos).map((t) => t.agente).sort()
    expect(d).toEqual(['content-creator', 'creative-director-mesa', 'design-image-prompt-engineer', 'jefe-marketing', 'marketing_instagram_curator', 'portero'])
  })
  it('sin asientos en la plantilla: el directorio activo entero, como siempre', () => {
    expect(directorioConAsientos(DIRECTORIO_VIVO, undefined)).toHaveLength(DIRECTORIO_VIVO.filter((t) => t.activo).length)
    expect(directorioConAsientos(DIRECTORIO_VIVO, [])).toHaveLength(DIRECTORIO_VIVO.filter((t) => t.activo).length)
  })

  const congelado = directorioConAsientos(DIRECTORIO_VIVO, KIT_MESA.limites.asientos)
  const est = (o: Partial<EstadoMesa> = {}): EstadoMesa => ({ tipo: 'kit', condiciones: ['si_personas', 'si_whimsy'], directorio_congelado: congelado, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, ...o })
  let n = 0
  const ap = (de: string, tipo: Aporte['tipo'], texto: string, o: Partial<Aporte> = {}): Aporte => ({ id: `a${++n}`, encargo_id: 'e', n, de, para: null, tipo, texto, refs: [], responde_a: null, profundidad: 0, costo_usd: 0.05, workflow_execution_id: null, creado_en: '', ...o })
  const ctx = { gasto_usd: 0.5, tope_usd: 5, hayImagenGenerada: true, tipo: 'kit' as const, rondas_max: 1 }

  it('antes de integrar convoca SOLO a los asientos con aporte (curador y texto); ni el narrador, ni inclusión, ni whimsy, aunque el brief los pida', () => {
    n = 0
    const libro = [ap('creative-director-mesa', 'dirige', 'idea rectora')]
    const a1 = siguienteDeLaMesa(est(), libro, ctx)
    expect(a1).toMatchObject({ accion: 'turno', tipo: 'aportar' })
    const vistos = new Set<string>()
    const l = [...libro]
    for (let i = 0; i < 6; i++) {
      const a = siguienteDeLaMesa(est(), l, ctx)
      if (a.accion !== 'turno' || a.tipo !== 'aportar') break
      vistos.add(a.agente)
      l.push(ap(a.agente, 'aporta', `aporte de ${a.agente}`))
    }
    expect([...vistos].sort()).toEqual(['content-creator', 'marketing_instagram_curator'])
    expect(siguienteDeLaMesa(est(), l, ctx)).toMatchObject({ accion: 'turno', agente: 'creative-director-mesa', tipo: 'integrar' })
  })

  it('UNA ronda: integrada la pieza, un pedido de la dirección a un especialista NO abre otro turno de aporte; un pedido A la dirección sí se atiende', () => {
    n = 0
    const base = [ap('creative-director-mesa', 'dirige', 'idea'), ap('marketing_instagram_curator', 'aporta', 'luz'), ap('content-creator', 'aporta', 'textos')]
    const integra = ap('creative-director-mesa', 'integra', '## e01\nTítulo: x\n## Citas\nA2 usé: la luz cálida de la mañana sobre el plato\nA3 usé: los titulares cortos de cada historia')
    const pedido = ap('creative-director-mesa', 'pide', 'otra vuelta de texto, por favor', { para: 'content-creator' })
    const a = siguienteDeLaMesa(est({ integraciones: 1 }), [...base, integra, pedido], ctx)
    expect(a.accion === 'turno' && a.agente === 'content-creator').toBe(false)
    // sin el límite de rondas (lo de siempre), el mismo pedido SÍ abre el turno del especialista
    const sinLimite = siguienteDeLaMesa(est({ integraciones: 1 }), [...base, integra, pedido], { ...ctx, rondas_max: undefined })
    expect(sinLimite).toMatchObject({ accion: 'turno', agente: 'content-creator', tipo: 'responder' })
    // la pregunta del traductor (una devolución A la dirección) se atiende aunque la ronda esté hecha
    const pregunta = ap('traductor', 'devuelve', '¿cuál es el titular de e02?', { para: 'creative-director-mesa' })
    expect(siguienteDeLaMesa(est({ integraciones: 1 }), [...base, integra, pregunta], ctx)).toMatchObject({ accion: 'turno', agente: 'creative-director-mesa', tipo: 'responder' })
  })

  // por la puerta y la mesa REALES: la ronda única sale del DATO de la plantilla (sin él, el mismo pedido abre otro turno de aporte)
  async function hastaDespuesDeIntegrar(sinLimite: boolean): Promise<{ agente: string; paso: string }> {
    const mesaPl: Plantilla = JSON.parse(JSON.stringify(KIT_MESA))
    if (sinLimite) delete (mesaPl.limites as Record<string, unknown>).rondas_de_la_mesa
    const M = crearMemoria({ parte: parteCon(BRIEF_KIT), plantilla: mesaPl, config: { familias_activas: ['kit_historias'] } })
    const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = { kit_historias: { plantilla: KIT_HISTORIAS_CON_JEFATURA, activo: true }, kit_mesa: { plantilla: mesaPl, activo: true } }
    M.P.almacen.leerPlantilla = async (f) => plantillas[f] ?? null
    const MS = crearMesaEnMemoria(DIRECTORIO_VIVO)
    M.P.mesa = { ...MS, configDeLaCadena: async (k: string) => (k === CLAVE_DE_LA_PALANCA ? ON : undefined) }
    let r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0200', dry_run: true, familia: 'kit_historias' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(r.cuerpo.encargo_id)
    expect(M.encargos.get(id)!.familia).toBe('kit_mesa')
    for (let i = 0; i < 12 && r.cuerpo.accion === 'esperar'; i++) {
      const t = r.cuerpo.turno as { n: number; paso: string; agente: string }
      const tipo = t.paso.split(':')[1]
      let texto = `(${t.agente}) aporte breve`
      if (tipo === 'integrar') {
        // durante su turno de integrar, la dirección pide otra vuelta de texto a un especialista
        await MS.aportar({ encargo_id: id, de: 'creative-director-mesa', para: 'content-creator', tipo: 'pide', texto: 'otra vuelta de texto, por favor', refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
        const citas = MS.filas.filter((x) => x.encargo_id === id && x.tipo === 'aporta').map((x) => `A${x.n} usé: ${x.de === 'content-creator' ? 'los titulares y el llamado de cada historia' : 'la dirección visual de fondo sólido'}`).join('\n')
        texto = `## e01\nRol: el plato del día\nTítulo: El plato de hoy\nImagen: generar: un plato\n## e02\nRol: el horario\nTítulo: Abrimos a las siete\nImagen: generar: un reloj\n## Citas\n${citas}`
        r = await recibirResultado(M.P, id, t.n, { texto, costo_usd: 0, workflow_execution_id: `t-${t.n}` })
        const sig = r.cuerpo.turno as { agente: string; paso: string } | undefined
        return { agente: sig?.agente ?? String(r.cuerpo.accion), paso: sig?.paso ?? '' }
      }
      r = await recibirResultado(M.P, id, t.n, { texto, costo_usd: 0, workflow_execution_id: `t-${t.n}` })
    }
    throw new Error('no llegó a integrar')
  }
  it('por la puerta y la mesa reales: con la ronda única de la plantilla, el pedido tras integrar NO abre turno del especialista; sin el dato, sí (control)', async () => {
    const conLimite = await hastaDespuesDeIntegrar(false)
    expect(conLimite.agente).not.toBe('content-creator')
    expect(conLimite.paso).toBe('mesa:redactar_prompts:design-image-prompt-engineer')
    const sinLimite = await hastaDespuesDeIntegrar(true)
    expect(sinLimite).toMatchObject({ agente: 'content-creator' })
  })

  it('después de la ronda escribe los prompts el ingeniero (su asiento) y luego se traduce', () => {
    n = 0
    const l = [ap('creative-director-mesa', 'dirige', 'idea'), ap('marketing_instagram_curator', 'aporta', 'luz'), ap('content-creator', 'aporta', 'textos'), ap('creative-director-mesa', 'integra', '## e01\nImagen: generar: un plato\n## Citas\nA2 usé: la luz cálida de la mañana sobre el plato\nA3 usé: los titulares cortos de cada historia')]
    expect(siguienteDeLaMesa(est({ integraciones: 1 }), l, ctx)).toMatchObject({ accion: 'turno', agente: 'design-image-prompt-engineer', tipo: 'redactar_prompts' })
  })
})
