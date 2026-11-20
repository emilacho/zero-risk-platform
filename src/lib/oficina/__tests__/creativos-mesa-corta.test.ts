/**
 * 17-nov · «creativos en cada paso» (GO Lenovo · firma de Emilio 07:18 · punto 1) · la mesa CORTA de las historias y la ruta a la mesa.
 *  · 20-nov · «la mesa para todos los clientes» (firma de Emilio 12:37 Zúrich): sin lista de clientes. Toda pieza NUEVA de una familia con versión con mesa, de CUALQUIER cliente,
 *    abre su mesa si está activa; con la mesa apagada (o sin la mesa conectada, o si la plantilla no se puede leer) sigue la ruta EXACTA de siempre;
 *  · una reapertura o una devolución del dueño sigue en la línea en que nació;
 *  · el freno de la campaña reserva lo de la familia que de verdad corre;
 *  · en la mesa se sientan SOLO los 3 asientos (más quien dirige y el portero) y hay UNA ronda de aportes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { FAMILIA_CON_MESA, familiaConMesa, gruposHermanos, topesConMesa } from '../mesa/con-mesa'
import { directorioConAsientos } from '../mesa/orquestador'
import { siguienteDeLaMesa } from '../mesa/planificador'
import { ASIENTOS_DE_LA_MESA_CORTA, DIFERENCIAS_CON_LAS_HISTORIAS, KIT_MESA, RONDAS_DE_LA_MESA_CORTA } from '../plantillas/mesa'
import { KIT_HISTORIAS_CON_JEFATURA } from '../plantillas/con-jefatura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import type { Aporte, EstadoMesa, Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

/** un cliente que NO estaba en la vieja lista de la palanca (solo estaba Náufrago) */
const OTRO = '00000000-0000-4000-8000-000000000099'

describe('la ruta a la mesa (puro)', () => {
  it('solo rutea una familia con versión con mesa y con la mesa activa', () => {
    expect(familiaConMesa('kit_historias', () => true)).toBe('kit_mesa')
    expect(familiaConMesa('kit_historias', () => false)).toBe('kit_historias')
    expect(familiaConMesa('post_img', () => true)).toBe('post_mesa')
    expect(familiaConMesa('carrusel_ig_v1', () => true)).toBe('carrusel_mesa')
    expect(familiaConMesa('carrusel_ig_v1', () => false)).toBe('carrusel_ig_v1')
    expect(familiaConMesa('video_mesa', () => true)).toBe('video_mesa')
    expect(familiaConMesa(null, () => true)).toBeNull()
  })
  it('las historias, la foto y el carrusel tienen versión con mesa (20-nov: el carrusel también)', () => {
    expect(FAMILIA_CON_MESA).toEqual({ kit_historias: 'kit_mesa', post_img: 'post_mesa', carrusel_ig_v1: 'carrusel_mesa' })
  })
  it('la misma pieza por las dos líneas cuenta como una (versiones y reaperturas)', () => {
    expect(gruposHermanos('kit_mesa').sort()).toEqual(['kit_historias', 'kit_mesa'])
    expect(gruposHermanos('kit_historias').sort()).toEqual(['kit_historias', 'kit_mesa'])
    expect(gruposHermanos('carrusel_ig_v1').sort()).toEqual(['carrusel_ig_v1', 'carrusel_mesa'])
    expect(gruposHermanos('carrusel_mesa').sort()).toEqual(['carrusel_ig_v1', 'carrusel_mesa'])
    expect(gruposHermanos('video_mesa')).toEqual(['video_mesa'])
  })
  it('ya no hay lista de clientes: el código no lee la vieja palanca `creativos_con_mesa`', () => {
    const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8')
    for (const r of ['src/lib/oficina/mesa/con-mesa.ts', 'src/lib/oficina/orquestador.ts', 'src/lib/cadena/autoproducir.ts']) {
      expect(leer(r)).not.toMatch(/CLAVE_DE_LA_PALANCA|palancaEncendida|'creativos_con_mesa'/)
    }
  })
})

describe('el freno de la campaña reserva lo de la familia que corre', () => {
  const topes = { kit_historias: 2.5, post_img: 2.5, kit_mesa: 5 }
  it('la historia reserva el tope de la mesa (sin historia de la mesa) y nunca baja; para cualquier cliente', () => {
    const s = topesConMesa(topes, { kit_historias: 1.2 })
    expect(s.topes.kit_historias).toBe(5)
    expect(s.reservas?.kit_historias).toBe(5)
    expect(s.topes.post_img).toBe(2.5)
    // con lo esperado de la mesa medido, se usa ese
    expect(topesConMesa(topes, { kit_historias: 1.2, kit_mesa: 3.1 }).reservas?.kit_historias).toBe(3.1)
    // una reserva de siempre mayor se queda (del lado seguro)
    expect(topesConMesa({ ...topes, kit_historias: 8 }, { kit_historias: 7, kit_mesa: 3.1 }).reservas?.kit_historias).toBe(7)
  })
  it('el carrusel reserva el tope de su mesa', () => {
    const s = topesConMesa({ carrusel_ig_v1: 2.5, carrusel_mesa: 6 }, { carrusel_ig_v1: 1 })
    expect(s.topes.carrusel_ig_v1).toBe(6)
    expect(s.reservas?.carrusel_ig_v1).toBe(6)
  })
  it('(m4 de CC7) nunca BAJA: si la línea de siempre tiene tope o reserva MAYOR que la mesa, se queda la mayor', () => {
    const r = topesConMesa({ kit_historias: 7, kit_mesa: 5 }, { kit_historias: 6, kit_mesa: 4 })
    expect(r.topes.kit_historias).toBe(7)
    expect(r.reservas!.kit_historias).toBe(6)
    // y con la mesa mayor, sube (control)
    expect(topesConMesa({ kit_historias: 2.5, kit_mesa: 5 }, { kit_historias: 2.5 }).topes.kit_historias).toBe(5)
  })
  it('la mesa apagada (sin tope de familia activa): nada cambia', () => {
    const s = topesConMesa({ kit_historias: 2.5 }, { kit_historias: 1 })
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

const CAMBIOS = { ronda: 1, comentario: 'más luz en la segunda historia, por favor', laminas: [], desde_hitl: 'hitl-1', pedido_por: 'emilio' }
function montarPuerta(o: { mesaActiva?: boolean; leerFalla?: boolean; familias?: string[]; sinMesa?: boolean; cliente?: string } = {}) {
  const M = crearMemoria({ parte: parteCon(BRIEF_KIT), plantilla: KIT_HISTORIAS_CON_JEFATURA, config: { familias_activas: o.familias ?? ['kit_historias'] } })
  const leidas: string[] = []
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = {
    kit_historias: { plantilla: JSON.parse(JSON.stringify(KIT_HISTORIAS_CON_JEFATURA)), activo: true },
    kit_mesa: { plantilla: JSON.parse(JSON.stringify(KIT_MESA)), activo: o.mesaActiva ?? true },
  }
  M.P.almacen.leerPlantilla = async (f) => { leidas.push(f); if (o.leerFalla && f === 'kit_mesa') throw new Error('base caída'); return plantillas[f] ?? null }
  const MS = crearMesaEnMemoria()
  const pedidas: string[] = []
  M.P.mesa = o.sinMesa ? undefined : { ...MS, configDeLaCadena: async (k: string) => { pedidas.push(k); return undefined } }
  const abrir = (extra: Record<string, unknown> = {}) => abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0200', dry_run: true, familia: 'kit_historias', ...extra }, client_id: o.cliente ?? CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const encargo = () => [...M.encargos.values()].at(-1)!
  return { M, abrir, encargo, leidas, pedidas }
}

describe('la puerta de la oficina abre la mesa para cualquier cliente', () => {
  it('con la mesa activa: la pieza nueva abre kit_mesa (tope de la mesa), deja dicho desde qué familia vino y no lee ninguna lista', async () => {
    const x = montarPuerta()
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_mesa')
    expect(x.encargo().tipo_de_grupo).toBe('kit_mesa')
    expect(x.encargo().tope_usd).toBe(KIT_MESA.limites.tope_encargo_usd)
    expect(x.encargo().sala_ref?.con_mesa).toEqual({ de: 'kit_historias', a: 'kit_mesa' })
    expect(x.pedidas).not.toContain('creativos_con_mesa')
  })
  it('un cliente que NO estaba en la vieja lista también abre la mesa', async () => {
    const x = montarPuerta({ cliente: OTRO })
    await x.abrir()
    expect(x.encargo().client_id).toBe(OTRO)
    expect(x.encargo().familia).toBe('kit_mesa')
  })
  it('la mesa APAGADA: la pieza sigue por la línea de siempre (no queda sin producir)', async () => {
    const x = montarPuerta({ mesaActiva: false })
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_historias')
    expect(x.encargo().sala_ref?.con_mesa).toBeUndefined()
  })
  it('si la plantilla de la mesa no se puede leer: la ruta de siempre (nunca frena la pieza)', async () => {
    const x = montarPuerta({ leerFalla: true })
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_historias')
  })
  it('sin la mesa conectada a la oficina: la ruta de siempre, EXACTO como antes, y no lee la plantilla con mesa', async () => {
    const x = montarPuerta({ sinMesa: true })
    await x.abrir()
    expect(x.encargo().familia).toBe('kit_historias')
    expect(x.leidas).not.toContain('kit_mesa')
  })
  it('una REAPERTURA de una pieza nacida SIN mesa sigue sin mesa', async () => {
    const x = montarPuerta()
    await x.abrir({ reabrir_causa_corregida: 'se corrigió el largo del sobre-título' })
    expect(x.encargo().familia).toBe('kit_historias')
  })
  it('(m12 de CC7) una DEVOLUCIÓN DEL DUEÑO de una pieza nacida sin mesa también sigue sin mesa', async () => {
    const x = montarPuerta()
    await x.abrir({ cambios_del_dueno: CAMBIOS })
    expect(x.encargo().familia).toBe('kit_historias')
    expect(x.encargo().sala_ref?.con_mesa).toBeUndefined()
  })
  it('(🟡 2 de CC7) una pieza NACIDA en la mesa vuelve a la mesa: los tres que reabren (rehacer del tablero, cambios del dueño, rehacer fallidos de la cadena) mandan la familia del encargo, `kit_mesa`', async () => {
    for (const extra of [{ reabrir_causa_corregida: 'se corrigió el sobre-título' }, { cambios_del_dueno: CAMBIOS }]) {
      // la pieza termina en la línea que la abrió (encender kit_mesa incluye sumarla a familias_activas)
      const x = montarPuerta({ familias: ['kit_historias', 'kit_mesa'] })
      await x.abrir({ familia: 'kit_mesa', ...extra })
      expect(x.encargo().familia).toBe('kit_mesa')
    }
    // y quién manda la familia del encargo (no la del brief): leído en el código
    const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8')
    expect(leer('src/lib/oficina/tablero/acciones.ts')).toMatch(/reabrir_causa_corregida: causa/)
    expect(leer('src/lib/oficina/tablero/acciones.ts')).toMatch(/familia: enc\.familia, tope_usd: tope, reabrir_causa_corregida/)
    expect(leer('src/lib/oficina/cambios.ts')).toMatch(/familia: enc\.familia, dry_run: false, cambios_del_dueno/)
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
  it('(🟡 1 de CC7) kit_mesa tiene las MISMAS claves que la fila viva de kit_historias (con su valor de hoy), salvo las diferencias nombradas', () => {
    // la fila VIVA de kit_historias, leída en producción (SELECT, 17-nov 08:2xZ, versión 7, tras 202611170900)
    const VIVA = { margen: 6, max_rondas: 2, plataforma: 'instagram-reel', reuso_dias: 14, hashtags_max: 30, body_historia: 140, material_activo: true, pie_de_foto_max: 2200, roles_sin_imagen: ['cta', 'cierre'], tope_encargo_usd: 5, headline_historia: 60, material_tope_usd: 0.4, versiones_por_ref: 2, acompanamiento_max: 700, material_plazo_min: 20, material_techo_min: 30, formato_por_omision: '9:16', limites_verificados: false, reserva_por_pieza_usd: 2.5, imagenes_generadas_max: 8, generar_cuando_no_hay_foto: true, material_max_pedidos_por_encargo: 1 }
    const mesa = KIT_MESA.limites as Record<string, unknown>
    const permitidas = new Set<string>(DIFERENCIAS_CON_LAS_HISTORIAS)
    const soloEnHistorias = Object.keys(VIVA).filter((k) => !(k in mesa) && !permitidas.has(k))
    const soloEnMesa = Object.keys(mesa).filter((k) => !(k in VIVA) && !permitidas.has(k))
    const distintos = Object.keys(VIVA).filter((k) => k in mesa && !permitidas.has(k) && JSON.stringify(mesa[k]) !== JSON.stringify((VIVA as Record<string, unknown>)[k]))
    expect({ soloEnHistorias, soloEnMesa, distintos }).toEqual({ soloEnHistorias: [], soloEnMesa: [], distintos: [] })
    expect([...permitidas].sort()).toEqual(['asientos', 'margen', 'mesa', 'reserva_por_pieza_usd', 'rondas_de_la_mesa'])
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
    M.P.mesa = { ...MS }
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
