/**
 * LAS MESAS DE LA CADENA (31-oct · nuevo orden · T2): `brief_mesa` y `concepto_mesa` de la oficina. US$ 0: modelo, portero y cadena simulados.
 * Se fija: quién DIRIGE cada tipo (por tipo, no por orden), quién aporta (con la condición `si_instagram` declarada por la cadena), que el dato sembrado es EXACTAMENTE el que produce el código,
 * que el encargo nace de una campaña de la cadena (sin brief de la sala), que la entrega va a la CADENA por su puerto (nunca a la bandeja ni a la jefatura de la pieza), que el concepto tiene
 * DOS rondas (caminos → elección → desarrollo → integración), que la dirección puede DEVOLVER el brief una vez y la mesa cierra sin gastar más, y que todo fallo le avisa a la cadena.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import { abrirMesaDeLaCadena, briefIdDeLaCadena, devolucionDelBrief, textoParaLaCadena, validarSobreDeLaCadena, type SobreDeLaCadena } from '../mesa/de-la-cadena'
import { cotaAgotada, siguienteDeLaMesa } from '../mesa/planificador'
import { ROTULO_DE_MATERIAL, pedidoDeAperturaDeLaCadena } from '../mesa/orquestador'
import { DIETA, armarTarea } from '../mesa/pedidos'
import { BRIEF_MESA, CONCEPTO_MESA } from '../plantillas/mesa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria, DIRECTORIO } from './mesa-memoria'
import type { Aporte, EstadoMesa, Tarjeta } from '../mesa/tipos'
import type { PuertoDelCerebro, PuertoDeLaCadena } from '../puertos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const MIGRACION = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202610312000_oficina_mesas_de_brief_y_concepto.sql'), 'utf8')

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo, version: 1 })

/** el directorio como queda tras la migración */
const TRAS_LA_MIGRACION: Tarjeta[] = [
  tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']),
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']),
  tarjeta('carousel-designer', 'miembro', ['carrusel']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'concepto']),
  tarjeta('design-image-prompt-engineer', 'miembro', ['carrusel:si_imagen_generada', 'kit:si_imagen_generada']),
  tarjeta('design-visual-storyteller', 'miembro', ['kit', 'concepto']),
  tarjeta('marketing_instagram_curator', 'miembro', ['carrusel', 'kit', 'concepto:si_instagram']),
  tarjeta('portero', 'portero', []),
]

describe('quién DIRIGE cada tipo (por tipo, nunca por orden)', () => {
  it('campaign-brief-agent dirige el brief; el director creativo dirige el concepto, los carruseles y los kits', () => {
    expect(direccionDe(TRAS_LA_MIGRACION, 'brief')?.agente).toBe('campaign-brief-agent')
    expect(direccionDe(TRAS_LA_MIGRACION, 'concepto')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(TRAS_LA_MIGRACION, 'carrusel')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(TRAS_LA_MIGRACION, 'kit')?.agente).toBe('creative-director-mesa')
  })
  it('el orden del directorio no cambia quién dirige: con campaign-brief-agent PRIMERO, un carrusel no lo dirige él', () => {
    const al_reves = [...TRAS_LA_MIGRACION].reverse()
    for (const d of [TRAS_LA_MIGRACION, al_reves]) {
      expect(direccionDe(d, 'carrusel')?.agente).toBe('creative-director-mesa')
      expect(direccionDe(d, 'kit')?.agente).toBe('creative-director-mesa')
      expect(direccionDe(d, 'brief')?.agente).toBe('campaign-brief-agent')
    }
    expect(direccionDe([tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']), tarjeta('creative-director-mesa', 'direccion', [])], 'carrusel')?.agente).toBe('creative-director-mesa')
  })
  it('las mesas de la cadena NO caen a otra dirección: sin quien las dirija, no abren (falla visible)', () => {
    const sin = TRAS_LA_MIGRACION.map((t) => (t.agente === 'campaign-brief-agent' ? { ...t, activo: false } : t))
    expect(direccionDe(sin, 'brief')).toBeNull()
    expect(direccionDe(DIRECTORIO, 'brief')).toBeNull()
    expect(direccionDe(DIRECTORIO, 'concepto')).toBeNull()
    expect(direccionDe(DIRECTORIO, 'carrusel')?.agente).toBe('creative-director-mesa')
  })
  it('sin tipo se conserva el comportamiento de antes (la primera dirección activa)', () => {
    expect(direccionDe(DIRECTORIO)?.agente).toBe('creative-director-mesa')
    expect(direccionDe([])).toBeNull()
  })
})

describe('quién aporta en cada mesa', () => {
  it('el brief no tiene especialistas (la dirección y el portero); el concepto: content-creator y design-visual-storyteller, y el curador SOLO si la cadena declara Instagram', () => {
    expect(especialistasPertinentes(TRAS_LA_MIGRACION, 'brief', false)).toEqual([])
    expect([...especialistasPertinentes(TRAS_LA_MIGRACION, 'concepto', false)].sort()).toEqual(['content-creator', 'design-visual-storyteller'])
    expect([...especialistasPertinentes(TRAS_LA_MIGRACION, 'concepto', false, ['si_instagram'])].sort()).toEqual(['content-creator', 'design-visual-storyteller', 'marketing_instagram_curator'])
    expect(especialistasPertinentes(TRAS_LA_MIGRACION, 'concepto', false, ['si_video'])).not.toContain('marketing_instagram_curator')
  })
  it('la condición no se activa sola ni afecta a los carruseles y kits (el curador sigue siendo miembro de siempre ahí)', () => {
    expect(especialistasPertinentes(TRAS_LA_MIGRACION, 'carrusel', true)).toContain('marketing_instagram_curator')
    expect(especialistasPertinentes(TRAS_LA_MIGRACION, 'carrusel', true)).not.toContain('creative-director-mesa')
    expect(especialistasPertinentes(TRAS_LA_MIGRACION, 'kit', true)).not.toContain('campaign-brief-agent')
  })
})

describe('las plantillas y la migración', () => {
  const tomar = (tipo: string, m: string) => {
    const i = MIGRACION.indexOf(`'${tipo}', '${tipo}'`)
    expect(i).toBeGreaterThan(0)
    return JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(MIGRACION.slice(i))![1])
  }
  it('el dato sembrado es EXACTAMENTE el que produce el código (un solo paso mesa; brief 1,60 una ronda; concepto 5,00 dos rondas mínimas, plazo 90 min)', () => {
    expect(tomar('brief_mesa', 'pasos')).toEqual(JSON.parse(JSON.stringify(BRIEF_MESA.pasos)))
    expect(tomar('brief_mesa', 'lim')).toEqual(JSON.parse(JSON.stringify(BRIEF_MESA.limites)))
    expect(tomar('concepto_mesa', 'pasos2')).toEqual(JSON.parse(JSON.stringify(CONCEPTO_MESA.pasos)))
    expect(tomar('concepto_mesa', 'lim2')).toEqual(JSON.parse(JSON.stringify(CONCEPTO_MESA.limites)))
    expect(BRIEF_MESA.limites).toMatchObject({ tope_encargo_usd: 1.6, max_rondas: 1, mesa: true })
    expect(CONCEPTO_MESA.limites).toMatchObject({ tope_encargo_usd: 5, max_rondas: 2, rondas_minimas: 2, plazo_mesa_min: 90, mesa: true })
    expect(BRIEF_MESA.pasos).toHaveLength(1)
    expect(CONCEPTO_MESA.pasos[0].funcion).toBe('mesa')
    expect(MIGRACION).toMatch(/1, 1\.60, true\s*\)/)
    expect(MIGRACION).toMatch(/2, 5\.00, true\s*\)/)
  })
  it('la migración quita el índice de «una sola dirección», no toca cerebro/portero/tablas de la cadena/palanca', () => {
    expect(MIGRACION).toMatch(/DROP INDEX IF EXISTS public\.oficina_directorio_una_direccion/)
    expect(MIGRACION).not.toMatch(/portero'\s*,\s*'portero'/)
    expect(MIGRACION).not.toMatch(/CREATE TABLE/i)
    expect(MIGRACION).not.toMatch(/INSERT INTO public\.cadena_config/)
  })
  it('el directorio sembrado por la migración es el que estas pruebas suponen', () => {
    expect(MIGRACION).toMatch(/ARRAY\['carrusel', 'kit', 'concepto:dirige'\]/)
    expect(MIGRACION).toMatch(/ARRAY\['brief:dirige'\]/)
    expect(MIGRACION).toMatch(/'concepto:si_instagram'/)
  })
  it('la reversa se niega si ya hay encargos de las mesas y repone el índice', () => {
    const rev = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202610312000_oficina_mesas_de_brief_y_concepto_REVERSA.sql'), 'utf8')
    expect(rev).toMatch(/RAISE EXCEPTION/)
    expect(rev).toMatch(/oficina_encargos/)
    expect(rev).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS oficina_directorio_una_direccion/)
  })
})

describe('el sobre de la cadena', () => {
  const OK = { dry_run: true, tipo_de_mesa: 'concepto', client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', campana_id: '8168f32b-47d9-466a-9350-3dff31700a58', version: 1, marco_texto: 'x'.repeat(40) }
  it('exige tipo, dry_run booleano, uuids, versión entera, un marco y condiciones bien formadas', () => {
    expect(validarSobreDeLaCadena(OK).ok).toBe(true)
    expect(validarSobreDeLaCadena({ ...OK, tipo_de_mesa: 'brief', condiciones: ['si_instagram'] }).ok).toBe(true)
    for (const malo of [{ ...OK, tipo_de_mesa: 'calendario' }, { ...OK, tipo_de_mesa: undefined }, { ...OK, dry_run: undefined }, { ...OK, dry_run: 'si' }, { ...OK, client_id: 'x' }, { ...OK, campana_id: 'x' }, { ...OK, version: 0 }, { ...OK, marco_texto: '' }, { ...OK, condiciones: 'si_instagram' }, { ...OK, condiciones: ['instagram'] }, { ...OK, condiciones: [1] }, null, []]) {
      expect(validarSobreDeLaCadena(malo).ok).toBe(false)
    }
  })
  it('el id del encargo cabe en 40 caracteres, no lleva «:» y es distinto por mesa, campaña y versión', () => {
    const a = briefIdDeLaCadena('concepto', OK.campana_id, 1)
    expect(a).toMatch(/^con-[0-9a-f]{12}-v1$/)
    expect(briefIdDeLaCadena('brief', OK.campana_id, 1)).toMatch(/^brf-[0-9a-f]{12}-v1$/)
    expect(a.length).toBeLessThanOrEqual(40)
    expect(briefIdDeLaCadena('concepto', OK.campana_id, 2)).not.toBe(a)
    expect(briefIdDeLaCadena('brief', OK.campana_id, 1)).not.toBe(a)
    expect(briefIdDeLaCadena('concepto', '31dc6aaf-2e9c-426e-81c5-1645c500283e', 1)).not.toBe(a)
  })
})

describe('las cotas de las mesas de la cadena no reservan «lo que sigue» (no hay imagen ni jefatura de pieza)', () => {
  const est = { turnos: 0 } as EstadoMesa
  it('con tope 1,60/5,00 y nada gastado la mesa NO nace agotada; con la reserva de una pieza sí lo estaría', () => {
    for (const tope of [1.6, 5]) expect(cotaAgotada(est, { gasto_usd: 0, tope_usd: tope, hayImagenGenerada: false, reserva_posterior_usd: 0 })).toBeNull()
    expect(cotaAgotada(est, { gasto_usd: 0, tope_usd: 1.6, hayImagenGenerada: false })).not.toBeNull()
  })
  it('agota cuando el gasto más la reserva de un turno pasa el tope, y a los 24 turnos', () => {
    expect(cotaAgotada(est, { gasto_usd: 1.1, tope_usd: 1.6, hayImagenGenerada: false, reserva_posterior_usd: 0 })).toMatch(/pasa el tope/)
    expect(cotaAgotada({ turnos: 24 } as EstadoMesa, { gasto_usd: 0, tope_usd: 5, hayImagenGenerada: false, reserva_posterior_usd: 0 })).toMatch(/24 turnos/)
  })
})

describe('rondas mínimas del planificador', () => {
  const dir = tarjeta('creative-director-mesa', 'direccion', ['concepto:dirige'])
  const cc = tarjeta('content-creator', 'miembro', ['concepto'])
  const estado = (condiciones: string[] = []): EstadoMesa => ({ tipo: 'concepto', directorio_congelado: [dir, cc], direccion: dir.agente, turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones })
  const ap = (n: number, de: string, tipo: Aporte['tipo'], texto = 'x'): Aporte => ({ id: `a${n}`, encargo_id: 'e', n, de, para: null, tipo, texto, responde_a: null, profundidad: 0, costo_usd: 0, creado_en: '2026-10-31T00:00:00Z' } as unknown as Aporte)
  const ctx = (rondas?: number) => ({ gasto_usd: 0, tope_usd: 5, hayImagenGenerada: false, reserva_posterior_usd: 0, ...(rondas ? { rondas_minimas: rondas } : {}) })
  const unaRonda = [ap(1, dir.agente, 'dirige'), ap(2, cc.agente, 'aporta'), ap(3, dir.agente, 'integra', ['## Citas', 'A2 usé: todo lo que propuso'].join('\n'))]
  it('con 1 ronda (las demás mesas) tras la primera integración con citas la mesa termina', () => {
    expect(siguienteDeLaMesa(estado(), unaRonda, ctx()).accion).toBe('traducir')
  })
  it('con 2 rondas mínimas, tras la primera integración el especialista aporta DE NUEVO y la dirección integra otra vez; solo entonces termina', () => {
    const a = siguienteDeLaMesa(estado(), unaRonda, ctx(2))
    expect(a).toMatchObject({ accion: 'turno', agente: 'content-creator', tipo: 'aportar' })
    const dos = [...unaRonda, ap(4, cc.agente, 'aporta', 'ronda 2')]
    expect(siguienteDeLaMesa(estado(), dos, ctx(2))).toMatchObject({ accion: 'turno', agente: 'creative-director-mesa', tipo: 'integrar' })
    const fin = [...dos, ap(5, dir.agente, 'integra', ['## Citas', 'A4 usé: todo lo que propuso'].join('\n'))]
    expect(siguienteDeLaMesa(estado(), fin, ctx(2)).accion).toBe('traducir')
  })
})

// ───────────────────────── el encargo jugado de punta a punta

const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
const sobre = (tipo: 'brief' | 'concepto', extra: Partial<SobreDeLaCadena> = {}): SobreDeLaCadena => ({ tipo_de_mesa: tipo, client_id: CLIENTE, campana_id: CAMPANA, version: 1, dry_run: false, marco_texto: '# Marco de la campaña\n- fase 1 · lanzamiento · días 1-30\n- fase 2 · constancia · días 31-60', condiciones: [], ...extra })

/** la integración cita CADA aporte del tablero que no es de la dirección (como exige el planificador): así no se devuelve por citas */
const integracionCon = (libro: Array<{ n: number; de: string; tipo: string }>, cuerpo: string): string => `${cuerpo}\n## Citas\n${libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: lo que propone ${a.de}`).join('\n')}`

type Entregas = { briefs: Array<Parameters<PuertoDeLaCadena['entregarBrief']>[0]>; conceptos: Array<Parameters<PuertoDeLaCadena['entregarConcepto']>[0]>; pedidosAlPortero: Array<Record<string, unknown>> }

async function montar(tipo: 'brief' | 'concepto', o: { directorio?: Tarjeta[]; cerebro?: boolean; cadenaFalla?: boolean; plantillaActiva?: boolean; condiciones?: string[]; dry?: boolean } = {}) {
  const pl = tipo === 'brief' ? BRIEF_MESA : CONCEPTO_MESA
  const M = crearMemoria({ plantilla: pl, config: { familias_activas: [pl.familia] } })
  if (o.plantillaActiva === false) M.plantilla = { plantilla: M.plantilla!.plantilla, activo: false }
  const MS = crearMesaEnMemoria(o.directorio ?? TRAS_LA_MIGRACION)
  M.P.mesa = MS
  const hecho: Entregas = { briefs: [], conceptos: [], pedidosAlPortero: [] }
  M.P.cadena = {
    entregarBrief: async (p) => { if (o.cadenaFalla) throw new Error('la cadena no contesta'); hecho.briefs.push(p); return { ok: true, estado: p.texto ? 'validada' : 'sin_brief', ya_cerrada: false } },
    entregarConcepto: async (p) => { if (o.cadenaFalla) throw new Error('la cadena no contesta'); hecho.conceptos.push(p); return { ok: true, estado: p.texto ? 'lista' : 'sin_mesa', ya_cerrada: false } },
  }
  if (o.cerebro !== false) {
    const cerebro: PuertoDelCerebro = {
      avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta',
      pedir: async (p) => { hecho.pedidosAlPortero.push(p as unknown as Record<string, unknown>); return { ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [{ hueco: { objetivo: '¿Qué personajes usa la marca?' }, estado: 'traido_y_archivado', hallazgos: [{ resumen: 'Un esqueleto con ropa de surfer y un cangrejo en una isla', fuente: 'cerebro' }] }] } } },
      leerPedido: async () => ({ ok: false, error: 'no se usa' }),
    }
    M.P.cerebro = cerebro
  }
  const a = await abrirMesaDeLaCadena(M.P, sobre(tipo, { dry_run: o.dry ?? false, condiciones: o.condiciones ?? [] }), avanzar)
  return { M, MS, hecho, a, id: String(a.cuerpo.encargo_id ?? '') }
}

type Turno = { paso: string; agente: string; tipo: string; task: string; n: number }
type Montaje = Awaited<ReturnType<typeof montar>>
type Dado = { texto?: string; error?: string; costo_usd?: number } | undefined
async function jugar(m: Montaje, responder: (t: Turno, veces: number) => Dado = () => undefined, max = 40) {
  let ultima: Respuesta = m.a
  const turnos: Turno[] = []
  const veces: Record<string, number> = {}
  for (let i = 0; i < max && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; pedido?: { task?: string } }
    const turno: Turno = { paso: t.paso, agente: t.agente, tipo: t.paso.split(':')[1] ?? t.paso, task: t.pedido?.task ?? '', n: t.n }
    turnos.push(turno)
    veces[t.paso] = (veces[t.paso] ?? 0) + 1
    const libro = m.MS.filas.filter((x) => x.encargo_id === m.id)
    const cuerpo = '## Gran idea\nLa isla que cuenta · una historia de mar para cada mesa\n## Caminos descartados y por qué\n- el sorteo · no cabe'
    const por = responder(turno, veces[t.paso]) ?? (turno.tipo === 'dirigir' ? { texto: 'El problema en una frase: que el visitante sienta la isla antes de llegar.' } : turno.tipo === 'integrar' || turno.tipo === 'devolver_citas' ? { texto: integracionCon(libro, cuerpo) } : { texto: `aporte de ${turno.agente}` })
    ultima = await recibirResultado(m.M.P, m.id, t.n, { ...por, workflow_execution_id: `ex-${t.n}`, costo_usd: por.costo_usd ?? 0.08 })
  }
  return { ultima, turnos }
}

describe('la mesa del BRIEF de punta a punta', () => {
  it('nace de la campaña (sin brief de la sala), campaign-brief-agent abre y el cerebro entra ANTES del primer turno', async () => {
    const m = await montar('brief')
    expect(m.a.status).toBe(200)
    expect(m.a.cuerpo.accion).toBe('esperar')
    const enc = m.M.encargos.get(m.id)!
    expect(enc.familia).toBe('brief_mesa')
    expect(enc.parte_id).toBe(CAMPANA)
    expect(enc.brief_id).toBe(briefIdDeLaCadena('brief', CAMPANA, 1))
    expect(enc.tope_usd).toBe(1.6)
    expect(enc.sala_ref).toMatchObject({ origen: 'cadena', tipo_de_mesa: 'brief', campana_id: CAMPANA, version: 1 })
    expect((m.a.cuerpo.turno as { agente: string }).agente).toBe('campaign-brief-agent')
    expect(m.hecho.pedidosAlPortero).toHaveLength(1)
    expect(JSON.stringify(m.hecho.pedidosAlPortero[0])).toContain('brief creativo')
    expect(JSON.stringify(m.hecho.pedidosAlPortero[0])).toContain('Cliente de práctica')
  })

  it('un solo miembro: la dirección abre e integra (sin especialistas) y la CADENA recibe el brief; nada a la bandeja ni a la jefatura', async () => {
    const m = await montar('brief')
    const { ultima, turnos } = await jugar(m, (t) => (t.tipo === 'integrar' ? { texto: '## Insight\nlo que sea\n## Mensaje\nuno' } : undefined))
    expect(turnos.map((t) => t.tipo)).toEqual(['dirigir', 'integrar'])
    expect(turnos[0].task).toContain('brief creativo de la campaña')
    expect(turnos[0].task).toContain('El marco de la campaña')
    expect(turnos[0].task).toContain('UN insight, UN mensaje')
    expect(turnos[1].task).toContain('## De qué parte del plan sale')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: false, resultado_para_la_sala: 'brief_mesa' })
    expect(m.hecho.briefs).toHaveLength(1)
    expect(m.hecho.conceptos).toHaveLength(0)
    expect(m.hecho.briefs[0]).toMatchObject({ campana_id: CAMPANA, version: 1, encargo_id: m.id })
    expect(m.hecho.briefs[0].texto).toContain('## Mensaje')
    expect(m.M.llamadas.bandeja).toHaveLength(0)
    expect(m.M.llamadas.salida).toBe(0)
    expect(m.M.llamadas.avisos).toHaveLength(0)
  })

  it('el manual y el plan llegan COMPLETOS al brief (dieta de la cadena) y la dieta de las piezas sigue siendo la de hoy', () => {
    expect(DIETA.carrusel).toEqual({ manual: 7000, marco: 5000, plan: 3000 })
    expect(DIETA.kit).toEqual({ manual: 7000, marco: 5000, plan: 3000 })
    expect(DIETA.brief.manual).toBeGreaterThanOrEqual(100_000)
    expect(DIETA.brief.plan).toBeGreaterThanOrEqual(100_000)
    expect(DIETA.concepto.plan).toBe(0)
  })
})

describe('la mesa del CONCEPTO de punta a punta', () => {
  it('dos rondas: la dirección abre, los miembros dan caminos, la dirección ELIGE, los miembros desarrollan, la dirección integra con la convención; la cadena recibe el concepto', async () => {
    const m = await montar('concepto')
    const { ultima, turnos } = await jugar(m)
    expect(turnos.map((t) => t.tipo)).toEqual(['dirigir', 'aportar', 'aportar', 'integrar', 'aportar', 'aportar', 'integrar'])
    expect(turnos[0].agente).toBe('creative-director-mesa')
    expect(new Set(turnos.filter((t) => t.tipo === 'aportar').map((t) => t.agente))).toEqual(new Set(['content-creator', 'design-visual-storyteller']))
    expect(turnos[0].task).toContain('6 criterios')
    expect(turnos[0].task).toContain('Devolución del brief')
    expect(turnos[1].task).toContain('RONDA 1 · CAMINOS')
    expect(turnos[3].task).toContain('elige UNA gran idea')
    expect(turnos[3].task).not.toContain('## Capítulo <clave de fase>')
    expect(turnos[4].task).toContain('RONDA 2 · DESARROLLO')
    expect(turnos[4].task).toContain('- C<fase>-I<nn> ·')
    expect(turnos[6].task).toContain('## Capítulo <clave de fase> · <nombre>')
    expect(turnos[6].task).toContain('mensaje: <UNA frase propia')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'concepto_mesa' })
    expect(m.hecho.conceptos).toHaveLength(1)
    expect(m.hecho.briefs).toHaveLength(0)
    expect(m.hecho.conceptos[0]).toMatchObject({ campana_id: CAMPANA, version: 1, encargo_id: m.id })
    expect(m.hecho.conceptos[0].brief_devuelto).toBeNull()
    expect(m.hecho.conceptos[0].texto).toBe(m.MS.filas.filter((x) => x.tipo === 'integra').at(-1)!.texto)
    expect(m.M.llamadas.bandeja).toHaveLength(0)
    expect(m.M.llamadas.salida).toBe(0)
    expect(m.M.encargos.get(m.id)!.tope_usd).toBe(5)
  })

  it('el curador de Instagram participa SOLO si la cadena declaró si_instagram', async () => {
    const sin = await montar('concepto')
    const t0 = await jugar(sin)
    expect(t0.turnos.some((t) => t.agente === 'marketing_instagram_curator')).toBe(false)
    const con = await montar('concepto', { condiciones: ['si_instagram'] })
    const t1 = await jugar(con)
    expect(t1.turnos.filter((t) => t.agente === 'marketing_instagram_curator')).toHaveLength(2)
    expect(t1.turnos.map((t) => t.tipo).filter((x) => x === 'aportar')).toHaveLength(6)
  })

  it('la dirección DEVUELVE el brief en su primer turno: la mesa cierra SIN gastar más turnos y la cadena recibe el motivo y los puntos', async () => {
    const m = await montar('concepto')
    const devolucion = '## Devolución del brief\n- el mensaje no es uno solo: hay dos\n- el insight es una solución, no un problema'
    const { ultima, turnos } = await jugar(m, (t) => (t.tipo === 'dirigir' ? { texto: devolucion } : undefined))
    expect(turnos.map((t) => t.tipo)).toEqual(['dirigir'])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', brief_devuelto: true })
    expect(m.hecho.conceptos).toHaveLength(1)
    expect(m.hecho.conceptos[0].texto).toBeNull()
    expect(m.hecho.conceptos[0].motivo).toBe('brief_devuelto')
    expect(m.hecho.conceptos[0].brief_devuelto).toContain('el mensaje no es uno solo')
    expect(m.hecho.conceptos[0].brief_devuelto).not.toContain('## Devolución del brief')
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })

  it('la devolución se lee de la sección, sin confundirla con otras: texto vacío o sin sección = no devuelve', () => {
    expect(devolucionDelBrief('## Devolución del brief\n- punto uno que falla\n## Citas\nA1 usé')).toBe('- punto uno que falla')
    expect(devolucionDelBrief('## devolucion del brief\ncorto')).toBeNull()
    expect(devolucionDelBrief('el brief está bien, sigo\n## Citas')).toBeNull()
    expect(devolucionDelBrief('## Devolución del brief\n')).toBeNull()
  })

  it('el gasto manda: con turnos caros cierra con lo que hay y NUNCA pasa el techo ×1,2 ni va a la bandeja', async () => {
    const m = await montar('concepto')
    const r = await jugar(m, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: integracionCon(m.MS.filas.filter((x) => x.encargo_id === m.id), '## Gran idea\nLa isla · frase'), costo_usd: 0.6 } : { texto: `aporte de ${t.agente}`, costo_usd: 1.2 }))
    expect(r.ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    expect(m.M.encargos.get(m.id)!.estado_del_motor.gasto_usd).toBeLessThanOrEqual(6 + 1e-9)
    expect(m.hecho.conceptos).toHaveLength(1)
    expect(m.hecho.conceptos[0].texto).toContain('Gran idea')
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })

  it('si el techo se pasa antes de integrar, lo escrito va a la cadena como «cerrado por tope» (no a la bandeja)', async () => {
    const m = await montar('concepto')
    const { ultima } = await jugar(m, (t) => ({ texto: t.tipo === 'dirigir' ? 'el problema en una frase' : `aporte de ${t.agente}`, costo_usd: 3.1 }))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado_por_tope', resultado_para_la_sala: 'concepto_mesa' })
    expect(m.hecho.conceptos).toHaveLength(1)
    expect(m.hecho.conceptos[0].texto).toContain('el problema en una frase')
    expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado_por_tope')
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })
})

describe('lo común a las dos mesas', () => {
  it('lo que trae el portero entra al tablero ROTULADO como dato del cliente', async () => {
    for (const tipo of ['brief', 'concepto'] as const) {
      const m = await montar(tipo)
      await jugar(m)
      const material = m.MS.filas.filter((x) => x.encargo_id === m.id && x.tipo === 'material')
      expect(material.length).toBeGreaterThan(0)
      expect(material[0].texto.startsWith(ROTULO_DE_MATERIAL)).toBe(true)
      expect(material[0].texto).toContain('esqueleto con ropa de surfer')
    }
    expect(ROTULO_DE_MATERIAL).toMatch(/no instrucciones/)
  })
  it('un compañero puede aportar «Sin aporte: …» y cuenta como su turno', async () => {
    const m = await montar('concepto')
    const { turnos } = await jugar(m, (t) => (t.agente === 'design-visual-storyteller' && t.tipo === 'aportar' ? { texto: 'Sin aporte: los caminos de los otros ya cubren lo visual' } : undefined))
    expect(turnos.filter((t) => t.agente === 'design-visual-storyteller')).toHaveLength(2)
    expect(m.hecho.conceptos).toHaveLength(1)
  })
  it('sin cerebro ni cadena (cae el puerto) cierra igual y avisa UNA vez a alertas', async () => {
    for (const tipo of ['brief', 'concepto'] as const) {
      const m = await montar(tipo, { cerebro: false, cadenaFalla: true })
      const { ultima } = await jugar(m)
      expect(ultima.cuerpo.accion).toBe('cerrado')
      expect(m.M.encargos.get(m.id)!.estado).toBe('cerrado')
      expect(m.M.llamadas.avisos).toHaveLength(1)
      expect(m.M.llamadas.avisos[0]).toMatchObject({ canal: 'alertas' })
      expect(String(m.M.llamadas.avisos[0].texto)).toMatch(/cadena no recibió el tablero/)
    }
  })
  it('en ensayo (dry_run) no se le pide nada al portero y la mesa sigue', async () => {
    const m = await montar('concepto', { dry: true })
    const { ultima } = await jugar(m)
    expect(m.hecho.pedidosAlPortero).toHaveLength(0)
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(m.hecho.conceptos).toHaveLength(1)
  })
  it('un tablero vacío (nadie pudo abrir) se le entrega a la cadena SIN texto, con motivo', async () => {
    const m = await montar('concepto')
    const { ultima } = await jugar(m, () => ({ error: 'el modelo no contestó', costo_usd: 0 }))
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(m.hecho.conceptos).toHaveLength(1)
    expect(m.hecho.conceptos[0].texto).toBeNull()
    expect(m.hecho.conceptos[0].motivo).toBeTruthy()
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })
  it('sin la dirección en el directorio el encargo FALLA visible y la cadena lo sabe (no cae a otra dirección)', async () => {
    const brief = await montar('brief', { directorio: DIRECTORIO })
    expect(brief.a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(brief.M.encargos.get(brief.id)!.estado).toBe('fallido')
    expect(brief.hecho.briefs).toHaveLength(1)
    expect(brief.hecho.briefs[0].texto).toBeNull()
    expect(brief.hecho.briefs[0].motivo).toMatch(/dirección creativa activa para «brief»/)
    expect(brief.M.llamadas.avisos.some((x) => x.canal === 'alertas')).toBe(true)
    const concepto = await montar('concepto', { directorio: DIRECTORIO })
    expect(concepto.hecho.conceptos[0].motivo).toMatch(/dirección creativa activa para «concepto»/)
  })
  it('la plantilla apagada no abre; un sobre repetido no abre otro encargo', async () => {
    const apagada = await montar('concepto', { plantillaActiva: false })
    expect(apagada.a.status).toBe(409)
    expect(apagada.a.cuerpo.error).toBe('plantilla_inactiva')
    const { M, a } = await montar('brief')
    const otra = await abrirMesaDeLaCadena(M.P, sobre('brief'), avanzar)
    expect(otra.cuerpo.accion).toBe('ya_existia')
    expect(otra.cuerpo.encargo_id).toBe(a.cuerpo.encargo_id)
    expect(M.encargos.size).toBe(1)
  })
  it('el estado de la mesa queda tipado y con las condiciones que declaró la cadena', async () => {
    const { M, id } = await montar('concepto', { condiciones: ['si_instagram', 'si_video'] })
    const est = M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as unknown as EstadoMesa
    expect(est.tipo).toBe('concepto')
    expect(est.direccion).toBe('creative-director-mesa')
    expect(est.condiciones).toEqual(['si_instagram', 'si_video'])
  })
})

describe('textos puros', () => {
  it('el pedido de apertura nombra al cliente y distingue brief de concepto, pide público, reseñas, lo gustado, competencia, hechos y fotos, y admite que no haya nada', () => {
    const b = pedidoDeAperturaDeLaCadena('brief', 'Cliente de práctica')
    const c = pedidoDeAperturaDeLaCadena('concepto', 'Cliente de práctica')
    for (const t of [b, c]) {
      expect(t).toContain('Cliente de práctica')
      expect(t).toMatch(/Público real y sus reseñas/)
      expect(t).toMatch(/fotos propias etiquetadas/)
      expect(t).toMatch(/Si no hay nada, dilo/)
    }
    expect(b).toContain('brief creativo')
    expect(c).toContain('gran idea')
    expect(b).not.toBe(c)
  })
  it('el texto para la cadena es la última integración; sin ella, la pieza; sin nada, lo escrito; vacío si no hay nada', () => {
    const l = (tipo: string, texto: string, de = 'x') => ({ de, tipo, texto })
    expect(textoParaLaCadena([l('aporta', 'a'), l('integra', 'uno'), l('integra', 'dos')], null)).toBe('dos')
    expect(textoParaLaCadena([l('aporta', 'a')], 'la pieza')).toBe('la pieza')
    expect(textoParaLaCadena([l('dirige', 'abre', 'e'), l('aporta', 'idea', 'c')], null)).toBe('[e] abre\n\n[c] idea')
    expect(textoParaLaCadena([], '')).toBe('')
  })
  it('armarTarea: el recorte avisa cuánto cortó y de qué documento (nunca callado)', () => {
    const est = { tipo: 'carrusel', directorio_congelado: TRAS_LA_MIGRACION, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null } as EstadoMesa
    const t = armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c: { cliente_nombre: 'X', tipo: 'carrusel', brief_id: 'b', brief_texto: 'y'.repeat(100), manual_texto: 'm'.repeat(9000), plan_texto: 'p'.repeat(4000), fotos: [], tope_usd: 1, gasto_usd: 0 } })
    expect(t).toContain('[… recortado: 7000 de 9000 caracteres de el manual de marca]')
    expect(t).toContain('[… recortado: 3000 de 4000 caracteres de el plan]')
    expect(t).not.toContain('de el marco]')
  })
})
