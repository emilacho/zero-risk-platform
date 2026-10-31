/**
 * LA MESA DE CREATIVOS EN EL CALENDARIO (31-oct) · la familia `calendario_mesa` de la oficina. US$ 0: modelo, portero y cadena simulados.
 * Lo que se fija: quién DIRIGE el calendario (R5: por tipo, no por orden), quién aporta, que el encargo nace de una tanda de la cadena (sin brief de la sala), que la entrega va a la CADENA
 * (nunca a la bandeja ni a la jefatura de la pieza), que el tope y las cotas valen sin la reserva de «lo que sigue», y que todo fallo le avisa a la cadena para que ordene el calendario sin ideas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import { abrirMesaDelCalendario, briefIdDelCalendario, textoParaLaCadena, validarSobreDelCalendario, type SobreDelCalendario } from '../mesa/calendario'
import { cotaAgotada } from '../mesa/planificador'
import { ROTULO_DE_MATERIAL, pedidoDeAperturaDelCalendario } from '../mesa/orquestador'
import { CALENDARIO_MESA } from '../plantillas/mesa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import type { Tarjeta, EstadoMesa } from '../mesa/tipos'
import type { PuertoDelCerebro, PuertoDeLaCadena } from '../puertos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const MIGRACION = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202610311600_oficina_mesa_de_creativos_calendario.sql'), 'utf8')

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo, version: 1 })

/** el directorio como queda tras la migración: dos direcciones (una por tipo), el director creativo también miembro del calendario */
const DIRECTORIO_TRAS_LA_MIGRACION: Tarjeta[] = [
  tarjeta('creative-director-mesa', 'direccion', ['calendario:miembro']),
  tarjeta('carousel-designer', 'miembro', ['carrusel']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'calendario']),
  tarjeta('design-image-prompt-engineer', 'miembro', ['carrusel:si_imagen_generada', 'kit:si_imagen_generada']),
  tarjeta('design-visual-storyteller', 'miembro', ['kit', 'calendario']),
  tarjeta('marketing_instagram_curator', 'miembro', ['carrusel', 'kit', 'calendario']),
  tarjeta('portero', 'portero', []),
  tarjeta('social-media-strategist', 'direccion', ['calendario']),
]

describe('R5 · quién DIRIGE cada tipo de pieza (por tipo, nunca por orden)', () => {
  it('el estratega dirige el calendario; el director creativo sigue dirigiendo carruseles y kits', () => {
    expect(direccionDe(DIRECTORIO_TRAS_LA_MIGRACION, 'calendario')?.agente).toBe('social-media-strategist')
    expect(direccionDe(DIRECTORIO_TRAS_LA_MIGRACION, 'carrusel')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(DIRECTORIO_TRAS_LA_MIGRACION, 'kit')?.agente).toBe('creative-director-mesa')
  })

  it('el orden del directorio no cambia quién dirige: con el estratega PRIMERO, un carrusel no lo dirige él', () => {
    const al_reves = [...DIRECTORIO_TRAS_LA_MIGRACION].reverse()
    expect(al_reves[0].agente).toBe('social-media-strategist')
    expect(direccionDe(al_reves, 'carrusel')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(al_reves, 'kit')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(al_reves, 'calendario')?.agente).toBe('social-media-strategist')
  })

  it('sin estratega activo el calendario NO lo dirige el director creativo: no abre (falla visible)', () => {
    const sin = DIRECTORIO_TRAS_LA_MIGRACION.map((t) => (t.agente === 'social-media-strategist' ? { ...t, activo: false } : t))
    expect(direccionDe(sin, 'calendario')).toBeNull()
    // y con el directorio de ANTES de la migración (una sola dirección sin tipos) tampoco: el calendario solo lo dirige quien lo dice
    expect(direccionDe(DIRECTORIO, 'calendario')).toBeNull()
    expect(direccionDe(DIRECTORIO, 'carrusel')?.agente).toBe('creative-director-mesa')
  })

  it('sin tipo se conserva el comportamiento de antes (la primera dirección activa)', () => {
    expect(direccionDe(DIRECTORIO)?.agente).toBe('creative-director-mesa')
    expect(direccionDe([])).toBeNull()
  })

  it('en el calendario aportan los tres miembros de siempre MÁS el director creativo como miembro; no el estratega (dirige), no el portero, no quien dibuja', () => {
    const p = especialistasPertinentes(DIRECTORIO_TRAS_LA_MIGRACION, 'calendario', false)
    expect([...p].sort()).toEqual(['content-creator', 'creative-director-mesa', 'design-visual-storyteller', 'marketing_instagram_curator'])
    expect(p).not.toContain('social-media-strategist')
    expect(p).not.toContain('carousel-designer')
    expect(p).not.toContain('design-image-prompt-engineer')
  })

  it('la marca «calendario:miembro» no mete al director creativo en los carruseles ni en los kits como miembro', () => {
    expect(especialistasPertinentes(DIRECTORIO_TRAS_LA_MIGRACION, 'carrusel', true)).not.toContain('creative-director-mesa')
    expect(especialistasPertinentes(DIRECTORIO_TRAS_LA_MIGRACION, 'kit', true)).not.toContain('creative-director-mesa')
    expect(especialistasPertinentes(DIRECTORIO_TRAS_LA_MIGRACION, 'carrusel', true)).not.toContain('social-media-strategist')
  })
})

describe('la plantilla y la migración', () => {
  it('el dato sembrado es EXACTAMENTE el que produce el código (un solo paso mesa, tope 1,50, activa)', () => {
    const i = MIGRACION.indexOf("'calendario_mesa', 'calendario_mesa'")
    expect(i).toBeGreaterThan(0)
    const resto = MIGRACION.slice(i)
    const toma = (m: string) => JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(resto)![1])
    expect(toma('pasos')).toEqual(JSON.parse(JSON.stringify(CALENDARIO_MESA.pasos)))
    expect(toma('ind')).toEqual(JSON.parse(JSON.stringify(CALENDARIO_MESA.indicaciones)))
    expect(toma('lim')).toEqual(JSON.parse(JSON.stringify(CALENDARIO_MESA.limites)))
    expect(CALENDARIO_MESA.limites.tope_encargo_usd).toBe(1.5)
    expect(CALENDARIO_MESA.pasos).toHaveLength(1)
    expect(CALENDARIO_MESA.pasos[0].funcion).toBe('mesa')
    expect(resto).toMatch(/1, 1\.50, true\s*\)/)
  })

  it('la migración quita el índice de «una sola dirección», no toca cerebro/portero y deja el aviso de que la palanca no se enciende aquí', () => {
    expect(MIGRACION).toMatch(/DROP INDEX IF EXISTS public\.oficina_directorio_una_direccion/)
    expect(MIGRACION).not.toMatch(/portero'\s*,\s*'portero'/)
    expect(MIGRACION).not.toMatch(/INSERT INTO public\.cadena_config/)
  })

  it('la reversa se niega si ya hay mesas o encargos del calendario y repone el índice', () => {
    const rev = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202610311600_oficina_mesa_de_creativos_calendario_REVERSA.sql'), 'utf8')
    expect(rev).toMatch(/RAISE EXCEPTION/)
    expect(rev).toMatch(/cadena_mesas_calendario/)
    expect(rev).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS oficina_directorio_una_direccion/)
  })
})

describe('el sobre de la cadena', () => {
  const OK = { dry_run: true, client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', campana_id: '8168f32b-47d9-466a-9350-3dff31700a58', tanda: 2, version: 1, marco_texto: 'x'.repeat(40) }
  it('exige dry_run booleano, uuids, tanda entera y un marco', () => {
    expect(validarSobreDelCalendario(OK).ok).toBe(true)
    for (const malo of [{ ...OK, dry_run: undefined }, { ...OK, dry_run: 'si' }, { ...OK, client_id: 'x' }, { ...OK, campana_id: 'x' }, { ...OK, tanda: 0 }, { ...OK, tanda: 1.5 }, { ...OK, version: 0 }, { ...OK, marco_texto: '' }, null, []]) {
      expect(validarSobreDelCalendario(malo).ok).toBe(false)
    }
  })
  it('el id del brief cabe en 40 caracteres, no lleva «:» y es distinto por campaña, tanda y versión', () => {
    const a = briefIdDelCalendario(OK.campana_id, 2, 1)
    expect(a.length).toBeLessThanOrEqual(40)
    expect(a).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/)
    expect(briefIdDelCalendario(OK.campana_id, 3, 1)).not.toBe(a)
    expect(briefIdDelCalendario(OK.campana_id, 2, 2)).not.toBe(a)
    expect(briefIdDelCalendario('31dc6aaf-2e9c-426e-81c5-1645c500283e', 2, 1)).not.toBe(a)
  })
})

describe('las cotas del calendario no reservan «lo que sigue» (no hay imagen ni jefatura de pieza)', () => {
  const est = { turnos: 0 } as EstadoMesa
  it('con tope 1,50 y nada gastado, la mesa NO nace agotada; con la reserva de una pieza sí lo estaría (esa es la diferencia)', () => {
    expect(cotaAgotada(est, { gasto_usd: 0, tope_usd: 1.5, hayImagenGenerada: false, reserva_posterior_usd: 0 })).toBeNull()
    expect(cotaAgotada(est, { gasto_usd: 0, tope_usd: 1.5, hayImagenGenerada: false })).not.toBeNull()
  })
  it('agota cuando el gasto más la reserva de un turno pasa el tope, y a los 24 turnos', () => {
    expect(cotaAgotada(est, { gasto_usd: 0.95, tope_usd: 1.5, hayImagenGenerada: false, reserva_posterior_usd: 0 })).toMatch(/pasa el tope/)
    expect(cotaAgotada({ turnos: 24 } as EstadoMesa, { gasto_usd: 0, tope_usd: 1.5, hayImagenGenerada: false, reserva_posterior_usd: 0 })).toMatch(/24 turnos/)
  })
})

// ───────────────────────── el encargo jugado de punta a punta

const SOBRE: SobreDelCalendario = { client_id: CLIENTE, campana_id: '8168f32b-47d9-466a-9350-3dff31700a58', tanda: 2, version: 1, dry_run: false, marco_texto: '# Tanda 2 del calendario\n- s5-d2-feed · semana 5 · martes 2026-11-03 19:00 · instagram · carrusel · pilar producto\n- s5-d4-reel · semana 5 · jueves 2026-11-05 19:00 · instagram · reel · pilar historia' }

/** la integración cita CADA aporte del tablero que no es de la dirección (como exige el planificador): así no se devuelve por citas */
const integracionCon = (libro: Array<{ n: number; de: string; tipo: string }>): string => {
  const citas = libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: lo que propone ${a.de} para los huecos de la tanda`)
  return `## s5-d2-feed · semana 5 · martes · instagram · carrusel\nIdea elegida: el cangrejo de la isla cuenta el plato del día\nViene de: A${libro.find((a) => a.tipo === 'aporta')?.n ?? 1}\nAlternativa: la tabla de surf como mesa\n## s5-d4-reel · semana 5 · jueves · instagram · reel\nIdea elegida: el esqueleto surfista prueba el encebollado\n## Citas\n${citas.join('\n')}`
}

type Hecho = { cadena: Array<Parameters<PuertoDeLaCadena['entregarIdeas']>[0]>; pedidosAlPortero: Array<Record<string, unknown>> }

async function montar(o: { directorio?: Tarjeta[]; cerebro?: boolean; cadenaFalla?: boolean; dry?: boolean; plantillaActiva?: boolean } = {}) {
  const M = crearMemoria({ plantilla: CALENDARIO_MESA, config: { familias_activas: ['calendario_mesa'] } })
  if (o.plantillaActiva === false) M.plantilla = { plantilla: M.plantilla!.plantilla, activo: false }
  const MS = crearMesaEnMemoria(o.directorio ?? DIRECTORIO_TRAS_LA_MIGRACION)
  M.P.mesa = MS
  const hecho: Hecho = { cadena: [], pedidosAlPortero: [] }
  M.P.cadena = {
    entregarIdeas: async (p) => {
      if (o.cadenaFalla) throw new Error('la cadena no contesta')
      hecho.cadena.push(p)
      return { ok: true, estado: p.texto ? 'lista' : 'sin_mesa', ya_cerrada: false }
    },
  }
  if (o.cerebro !== false) {
    const cerebro: PuertoDelCerebro = {
      avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta',
      pedir: async (p) => { hecho.pedidosAlPortero.push(p as unknown as Record<string, unknown>); return { ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [{ hueco: { objetivo: '¿Qué personajes usa la marca?' }, estado: 'traido_y_archivado', hallazgos: [{ resumen: 'Un esqueleto con ropa de surfer y un cangrejo en una isla', fuente: 'cerebro' }] }] } } },
      leerPedido: async () => ({ ok: false, error: 'no se usa' }),
    }
    M.P.cerebro = cerebro
  }
  const a = await abrirMesaDelCalendario(M.P, { ...SOBRE, dry_run: o.dry ?? false }, avanzar)
  return { M, MS, hecho, a, id: String(a.cuerpo.encargo_id ?? '') }
}

type Turno = { paso: string; agente: string; tipo: string; task: string; n: number }
async function jugar(M: Awaited<ReturnType<typeof montar>>['M'], MS: Awaited<ReturnType<typeof montar>>['MS'], id: string, primera: Respuesta, responder: (t: Turno, veces: number) => { texto?: string; error?: string; costo_usd?: number } | undefined = () => undefined, max = 60) {
  let ultima = primera
  const turnos: Turno[] = []
  const veces: Record<string, number> = {}
  for (let i = 0; i < max && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; pedido?: { task?: string } }
    const turno: Turno = { paso: t.paso, agente: t.agente, tipo: t.paso.split(':')[1] ?? t.paso, task: t.pedido?.task ?? '', n: t.n }
    turnos.push(turno)
    veces[t.paso] = (veces[t.paso] ?? 0) + 1
    const dado = responder(turno, veces[t.paso])
    const r = dado ?? (turno.tipo === 'dirigir' ? { texto: 'Idea rectora de la tanda: el cangrejo, el esqueleto y la tabla como hilo de las cuatro semanas.' } : turno.tipo === 'integrar' || turno.tipo === 'devolver_citas' ? { texto: integracionCon(MS.filas.filter((x) => x.encargo_id === id)) } : { texto: `Aporte de ${turno.agente}: una idea concreta por hueco.` })
    ultima = await recibirResultado(M.P, id, t.n, { ...r, workflow_execution_id: `ex-${t.n}`, costo_usd: r.costo_usd ?? 0.08 })
  }
  return { ultima, turnos }
}

describe('el encargo del calendario de punta a punta', () => {
  it('nace de la tanda (sin brief de la sala), el estratega abre y el cerebro entra ANTES del primer turno', async () => {
    const { M, a, id, hecho } = await montar()
    expect(a.status).toBe(200)
    expect(a.cuerpo.accion).toBe('esperar')
    const enc = M.encargos.get(id)!
    expect(enc.familia).toBe('calendario_mesa')
    expect(enc.parte_id).toBe(SOBRE.campana_id)
    expect(enc.brief_id).toBe(briefIdDelCalendario(SOBRE.campana_id, 2, 1))
    expect(enc.tope_usd).toBe(1.5)
    expect(enc.sala_ref).toMatchObject({ origen: 'cadena', campana_id: SOBRE.campana_id, tanda: 2, version: 1 })
    // el primer turno es del estratega, DESPUÉS de que el portero contestó
    expect((a.cuerpo.turno as { agente: string }).agente).toBe('social-media-strategist')
    expect(hecho.pedidosAlPortero).toHaveLength(1)
    expect(JSON.stringify(hecho.pedidosAlPortero[0])).toContain('tanda 2')
    expect(JSON.stringify(hecho.pedidosAlPortero[0])).toContain('Cliente de práctica')
  })

  it('el equipo trabaja sobre el marco: estratega abre → cuatro miembros aportan → estratega integra → la CADENA recibe el tablero (nada a la bandeja ni a la jefatura)', async () => {
    const { M, MS, hecho, a, id } = await montar()
    const { ultima, turnos } = await jugar(M, MS, id, a)
    expect(turnos.map((t) => t.tipo)).toEqual(['dirigir', 'aportar', 'aportar', 'aportar', 'aportar', 'integrar'])
    expect(turnos[0].agente).toBe('social-media-strategist')
    expect(turnos[5].agente).toBe('social-media-strategist')
    expect(new Set(turnos.slice(1, 5).map((t) => t.agente))).toEqual(new Set(['content-creator', 'design-visual-storyteller', 'marketing_instagram_curator', 'creative-director-mesa']))
    // lo que lee cada turno: el marco de la tanda y el título del calendario, no un brief de láminas
    expect(turnos[0].task).toContain('ideas del calendario')
    expect(turnos[0].task).toContain('s5-d2-feed')
    expect(turnos[0].task).toContain('El marco de la tanda')
    expect(turnos[0].task).toContain('IDEA RECTORA DE LA TANDA'.replace('IDEA RECTORA DE LA TANDA', 'idea rectora de la tanda'))
    expect(turnos[5].task).toContain('Idea elegida')
    // la entrega
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: false, resultado_para_la_sala: 'calendario_mesa' })
    expect(hecho.cadena).toHaveLength(1)
    expect(hecho.cadena[0]).toMatchObject({ campana_id: SOBRE.campana_id, tanda: 2, version: 1, encargo_id: id })
    expect(hecho.cadena[0].texto).toBe(MS.filas.filter((x) => x.tipo === 'integra').at(-1)!.texto)
    expect(hecho.cadena[0].texto).toContain('Idea elegida')
    expect(hecho.cadena[0].costo_usd).toBeGreaterThan(0.4)
    expect(M.llamadas.bandeja).toHaveLength(0)
    expect(M.llamadas.salida).toBe(0)
    expect(M.llamadas.avisos).toHaveLength(0)
    expect(M.encargos.get(id)!.estado).toBe('cerrado')
  })

  it('lo que trae el portero entra al tablero ROTULADO como dato del cliente (nadie ejecuta instrucciones que vengan de una foto)', async () => {
    const { M, MS, a, id } = await montar()
    await jugar(M, MS, id, a)
    const material = MS.filas.filter((x) => x.encargo_id === id && x.tipo === 'material')
    expect(material.length).toBeGreaterThan(0)
    expect(material[0].texto.startsWith(ROTULO_DE_MATERIAL)).toBe(true)
    expect(material[0].texto).toContain('esqueleto con ropa de surfer')
    expect(ROTULO_DE_MATERIAL).toMatch(/no instrucciones/)
  })

  it('un compañero puede aportar «Sin aporte: …» y cuenta como su turno (la dirección descarta)', async () => {
    const { M, MS, a, id, hecho } = await montar()
    const { turnos } = await jugar(M, MS, id, a, (t) => (t.agente === 'design-visual-storyteller' && t.tipo === 'aportar' ? { texto: 'Sin aporte: las ideas de los otros ya cubren los huecos visuales' } : undefined))
    expect(turnos.filter((t) => t.agente === 'design-visual-storyteller')).toHaveLength(1)
    expect(hecho.cadena).toHaveLength(1)
  })

  it('la mesa no frena sin cerebro ni con la cadena caída: cierra igual (la cadena ordena sin ideas al vencer el plazo) y avisa UNA vez', async () => {
    const { M, MS, a, id } = await montar({ cerebro: false, cadenaFalla: true })
    const { ultima } = await jugar(M, MS, id, a)
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(M.encargos.get(id)!.estado).toBe('cerrado')
    expect(M.llamadas.avisos).toHaveLength(1)
    expect(M.llamadas.avisos[0]).toMatchObject({ canal: 'alertas' })
    expect(String(M.llamadas.avisos[0].texto)).toMatch(/cadena no recibió el tablero/)
  })

  it('en ensayo (dry_run) no se le pide nada al portero y la mesa sigue', async () => {
    const { M, MS, a, id, hecho } = await montar({ dry: true })
    const { ultima } = await jugar(M, MS, id, a)
    expect(hecho.pedidosAlPortero).toHaveLength(0)
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(hecho.cadena).toHaveLength(1)
  })

  it('el gasto manda: con turnos caros cierra con lo que hay (una integración) y NUNCA pasa el techo ×1,2 ni va a la bandeja', async () => {
    const caro = await montar()
    const r = await jugar(caro.M, caro.MS, caro.id, caro.a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: integracionCon(caro.MS.filas.filter((x) => x.encargo_id === caro.id)), costo_usd: 0.3 } : { texto: `aporte de ${t.agente}`, costo_usd: 0.45 }))
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    const enc = caro.M.encargos.get(caro.id)!
    // dirección 0,45 + dos aportes 0,45 ya pasan 0,9 + reserva de un turno (0,6) > tope 1,5: cierra con lo que hay con UNA integración y no sigue convocando
    expect(r.turnos.filter((t) => t.tipo === 'integrar')).toHaveLength(1)
    expect(r.turnos.filter((t) => t.tipo === 'aportar').length).toBeLessThan(4)
    expect((caro.M.encargos.get(caro.id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa).cierre_forzado).toMatch(/cierra con lo que hay|tope/)
    expect(enc.estado_del_motor.gasto_usd).toBeLessThanOrEqual(1.8 + 1e-9)
    expect(caro.hecho.cadena).toHaveLength(1)
    expect(caro.hecho.cadena[0].texto).toContain('Idea elegida')
    expect(caro.M.llamadas.bandeja).toHaveLength(0)
  })

  it('si el techo se pasa antes de integrar, lo que el equipo escribió va a la cadena como «cerrado por tope» (no a la bandeja)', async () => {
    const { M, MS, a, id, hecho } = await montar()
    const { ultima } = await jugar(M, MS, id, a, (t) => ({ texto: t.tipo === 'dirigir' ? 'idea rectora de la tanda' : `aporte de ${t.agente}`, costo_usd: 2 }))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado_por_tope', resultado_para_la_sala: 'calendario_mesa' })
    expect(hecho.cadena).toHaveLength(1)
    expect(hecho.cadena[0].texto).toContain('idea rectora de la tanda')
    expect(M.encargos.get(id)!.estado).toBe('cerrado_por_tope')
    expect(M.llamadas.bandeja).toHaveLength(0)
    expect(M.llamadas.salida).toBe(0)
  })

  it('un tablero vacío (la dirección no pudo abrir) se le entrega a la cadena SIN texto: ordena sin ideas', async () => {
    const { M, MS, a, id, hecho } = await montar()
    const { ultima } = await jugar(M, MS, id, a, () => ({ error: 'el modelo no contestó', costo_usd: 0 }))
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(hecho.cadena).toHaveLength(1)
    expect(hecho.cadena[0].texto).toBeNull()
    expect(hecho.cadena[0].motivo).toBeTruthy()
    expect(M.llamadas.bandeja).toHaveLength(0)
  })

  it('sin estratega en el directorio el encargo FALLA visible y la cadena lo sabe (no cae al director creativo)', async () => {
    const { M, a, id, hecho } = await montar({ directorio: DIRECTORIO })
    expect(a.cuerpo.accion).toBe('cerrado')
    expect(a.cuerpo.estado).toBe('fallido')
    expect(M.encargos.get(id)!.estado).toBe('fallido')
    expect(hecho.cadena).toHaveLength(1)
    expect(hecho.cadena[0].texto).toBeNull()
    expect(hecho.cadena[0].motivo).toMatch(/dirección creativa activa para «calendario»/)
    expect(M.llamadas.avisos.some((x) => x.canal === 'alertas')).toBe(true)
  })

  it('la plantilla apagada o inexistente no abre; un sobre repetido no abre otro encargo', async () => {
    const apagada = await montar({ plantillaActiva: false })
    expect(apagada.a.status).toBe(409)
    expect(apagada.a.cuerpo.error).toBe('plantilla_inactiva')
    const { M, a } = await montar()
    const otra = await abrirMesaDelCalendario(M.P, SOBRE, avanzar)
    expect(otra.cuerpo.accion).toBe('ya_existia')
    expect(otra.cuerpo.encargo_id).toBe(a.cuerpo.encargo_id)
    expect(M.encargos.size).toBe(1)
  })

  it('el estado de la mesa queda tipado como calendario y la dirección es el estratega', async () => {
    const { M, id } = await montar()
    const est = M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
    expect(est.tipo).toBe('calendario')
    expect(est.direccion).toBe('social-media-strategist')
  })
})

describe('textos puros', () => {
  it('el pedido de apertura nombra al cliente y la tanda, pide fotos, hechos y lo gustado, y admite que no haya nada', () => {
    const t = pedidoDeAperturaDelCalendario('Cliente de práctica', 3)
    expect(t).toContain('tanda 3')
    expect(t).toContain('Cliente de práctica')
    expect(t).toMatch(/Fotos propias etiquetadas/)
    expect(t).toMatch(/lo que más ha gustado/)
    expect(t).toMatch(/Si no hay nada, dilo/)
  })
  it('el texto para la cadena es la última integración; sin ella, la pieza; sin nada, lo que el equipo escribió; vacío si no hay nada', () => {
    const l = (tipo: string, texto: string, de = 'x') => ({ de, tipo, texto })
    expect(textoParaLaCadena([l('aporta', 'a'), l('integra', 'uno'), l('integra', 'dos')], null)).toBe('dos')
    expect(textoParaLaCadena([l('aporta', 'a')], 'la pieza')).toBe('la pieza')
    expect(textoParaLaCadena([l('dirige', 'abre', 'e'), l('aporta', 'idea', 'c')], null)).toBe('[e] abre\n\n[c] idea')
    expect(textoParaLaCadena([], '')).toBe('')
  })
})
