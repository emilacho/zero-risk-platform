/**
 * EL TOPE DE LA GRAN IDEA · 21-nov · GO Lenovo 10:19Z (firma de Emilio 10:18Z) · CC4. US$ 0: modelo, portero, cadena y base simulados.
 * Se fija:
 *  (1) la dirección de la mesa de concepto reserva US$ 10 por turno (los demás asientos y las demás mesas, 0,60), siempre dentro del techo de la mesa;
 *  (2) el plazo de ese turno es coherente con la reserva: el vigía no lo da por muerto antes de 250 min (los demás, a los 12), la mesa entera tiene 340 min
 *      (plantilla, migración y cadena dicen lo mismo) y la espera del flujo `oficina · turno` deja caber esos 250 min;
 *  (3) el gasto de los turnos cortados se anota: el corte por tope trae lo gastado en el error, una vuelta tardía suma sin reabrir el turno,
 *      y la campaña cuenta lo que el encargo lleva gastado aunque la mesa ya haya entregado.
 * Medido el 21-nov (solo lectura): `director-gran-idea` · 6 corridas · 2 cortes por tope (0,81 y 0,63) · 4 «sin vuelta» (3 terminaron, 801–1 037 s, y Vercel perdió la vuelta).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { abrirMesaDeLaCadena, type SobreDeLaCadena } from '../mesa/de-la-cadena'
import { techoDe } from '../mesa/planificador'
import { BRIEF_MESA, CONCEPTO_MESA, PLAZO_DE_LA_MESA_DE_CONCEPTO_MIN, TOPE_DE_LA_MESA_DE_CONCEPTO_USD } from '../plantillas/mesa'
import { COTAS, ESPERA_DEL_FLUJO_POR_OMISION_S, PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN, RESERVA_POR_TURNO_DE_LA_GRAN_IDEA_USD, esperaDelTurnoS, pisoDelTurnoMin, reservaPorTurnoDe, type Tarjeta } from '../mesa/tipos'
import { costoDelTurno } from '../costo-del-turno'
import { MINUTOS_PARA_DAR_POR_MUERTO, revisarPasosMuertos } from '../vigia'
import { DbFalsa } from './dbfalsa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { PLAZO_DE_MESA_MIN } from '../../cadena/mesas'
import { medirGastoDeCampana } from '../../cadena/tope-de-campana'
import { AGENTES_CON_VUELTA_POR_EL_CORREDOR, vueltaPorElCorredorElegible } from '@/app/api/agents/run-sdk/route'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
const DIRECCION = 'director-gran-idea'
const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo: true, version: 1 })
const DIRECTORIO: Tarjeta[] = [
  tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']),
  tarjeta(DIRECCION, 'direccion', ['concepto:dirige']),
  tarjeta('content-creator', 'miembro', ['concepto']),
  tarjeta('design-visual-storyteller', 'miembro', ['concepto']),
  tarjeta('portero', 'portero', []),
]
const sobre = (tipo: 'brief' | 'concepto'): SobreDeLaCadena => ({ tipo_de_mesa: tipo, client_id: CLIENTE, campana_id: CAMPANA, version: 1, dry_run: false, marco_texto: '# Marco de la campaña\n- fase 1 · lanzamiento · días 1-30', condiciones: [] })
const CORTE = (gastado: string) => `el agente FALLÓ · error_max_budget_usd · el empleado alcanzó el tope de gasto de la corrida (US$ 10) y se DETUVO · gastado ≈ US$ ${gastado} · lo escrito hasta ahí es PARCIAL y no se da por respuesta`

async function montar(tipo: 'brief' | 'concepto') {
  const pl = tipo === 'brief' ? BRIEF_MESA : CONCEPTO_MESA
  const M = crearMemoria({ plantilla: pl, config: { familias_activas: [pl.familia] } })
  const MS = crearMesaEnMemoria(DIRECTORIO)
  M.P.mesa = MS
  M.P.cadena = { entregarBrief: async () => ({ ok: true, estado: 'validada', ya_cerrada: false }), entregarConcepto: async () => ({ ok: true, estado: 'lista', ya_cerrada: false }) }
  M.P.cerebro = {
    avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta',
    pedir: async () => ({ ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [] } }),
    leerPedido: async () => ({ ok: false, error: 'no se usa' }),
  }
  const a = await abrirMesaDeLaCadena(M.P, sobre(tipo), avanzar)
  return { M, MS, a, id: String(a.cuerpo.encargo_id ?? '') }
}
type Turno = { n: number; paso: string; agente: string; tipo: string; reserva: number }
const turnoDe = (r: Respuesta): Turno => {
  const t = r.cuerpo.turno as { n: number; paso: string; agente: string; pedido?: { max_budget_usd?: number } }
  return { n: t.n, paso: t.paso, agente: t.agente, tipo: t.paso.split(':')[1] ?? t.paso, reserva: Number(t.pedido?.max_budget_usd) }
}
/** juega la mesa con respuestas simples; devuelve los turnos con lo que reservó cada uno */
async function jugar(m: Awaited<ReturnType<typeof montar>>, max = 30) {
  let ultima: Respuesta = m.a
  const turnos: Turno[] = []
  for (let i = 0; i < max && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = turnoDe(ultima)
    turnos.push(t)
    const libro = m.MS.filas.filter((x) => x.encargo_id === m.id)
    const integra = `## Gran idea\nLa isla que cuenta\n## Citas\n${libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: lo que propone ${a.de}`).join('\n')}`
    const texto = t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? integra : `aporte de ${t.agente}`
    ultima = await recibirResultado(m.M.P, m.id, t.n, { texto, workflow_execution_id: `ex-${t.n}`, costo_usd: 0.08 })
  }
  return { ultima, turnos }
}

describe('(1) la reserva propia de la gran idea', () => {
  it('pura: la dirección de concepto reserva 10; un miembro de concepto, la dirección de otra mesa y un agente sin dirección conocida, 0,60', () => {
    expect(RESERVA_POR_TURNO_DE_LA_GRAN_IDEA_USD).toBe(10)
    expect(reservaPorTurnoDe('concepto', DIRECCION, DIRECCION)).toBe(10)
    expect(reservaPorTurnoDe('concepto', 'content-creator', DIRECCION)).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe('brief', 'campaign-brief-agent', 'campaign-brief-agent')).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe('carrusel', 'creative-director-mesa', 'creative-director-mesa')).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe('concepto', DIRECCION, '')).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(reservaPorTurnoDe('concepto', DIRECCION, null)).toBe(COTAS.RESERVA_POR_TURNO_USD)
    expect(COTAS.RESERVA_POR_TURNO_USD).toBe(0.6)
  })
  it('cabe en el techo de la mesa de concepto de hoy (17,79 × 1,2 = 21,35): el techo deja los 10 de un turno', () => {
    expect(techoDe(TOPE_DE_LA_MESA_DE_CONCEPTO_USD)).toBeGreaterThanOrEqual(RESERVA_POR_TURNO_DE_LA_GRAN_IDEA_USD)
    expect(CONCEPTO_MESA.limites.tope_encargo_usd).toBe(TOPE_DE_LA_MESA_DE_CONCEPTO_USD)
  })
  it('en una mesa de concepto real: los turnos de la dirección piden max_budget_usd 10 y los de los miembros 0,6', async () => {
    const m = await montar('concepto')
    expect(m.a.status).toBe(200)
    const { turnos } = await jugar(m)
    const dir = turnos.filter((t) => t.agente === DIRECCION)
    const miembros = turnos.filter((t) => t.agente !== DIRECCION)
    expect(dir.map((t) => t.tipo)).toContain('dirigir')
    expect(dir.map((t) => t.tipo)).toContain('integrar')
    expect(miembros.length).toBeGreaterThan(0)
    for (const t of dir) expect(t.reserva, t.paso).toBe(10)
    for (const t of miembros) expect(t.reserva, t.paso).toBe(0.6)
  })
  it('la mesa del brief no cambia: su dirección sigue con 0,6', async () => {
    const m = await montar('brief')
    const t = turnoDe(m.a)
    expect(t.agente).toBe('campaign-brief-agent')
    expect(t.reserva).toBe(0.6)
  })
  it('dentro del techo: con lo gastado cerca del techo, la reserva de la dirección es lo que queda (nunca pasa el techo)', async () => {
    const m = await montar('concepto')
    const enc = m.M.encargos.get(m.id)!
    const techo = techoDe(enc.tope_usd)
    enc.estado_del_motor = { ...enc.estado_del_motor, gasto_usd: techo - 3 }
    enc.gasto_usd = techo - 3
    const r = await avanzar(m.M.P, m.id) // reentrega del turno abierto: rearma el pedido con lo gastado de hoy
    const t = turnoDe(r)
    expect(t.agente).toBe(DIRECCION)
    expect(t.reserva).toBeCloseTo(3, 4)
  })
})

describe('(2) el plazo del turno coherente con la reserva', () => {
  it('250 min: 10 dólares al ritmo más lento medido (0,06 por minuto) con el margen ×1,5', () => {
    expect(PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN).toBe(250)
    expect(PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN).toBeGreaterThanOrEqual((10 / 0.06) * 1.5 - 1e-6)
    expect(PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN).toBeLessThan((10 / 0.06) * 1.5 + 10)
  })
  it('el piso del vigía: 250 para la dirección de concepto; 12 para los demás', () => {
    expect(MINUTOS_PARA_DAR_POR_MUERTO).toBe(12)
    expect(pisoDelTurnoMin('concepto', DIRECCION, DIRECCION, 12)).toBe(250)
    expect(pisoDelTurnoMin('concepto', 'content-creator', DIRECCION, 12)).toBe(12)
    expect(pisoDelTurnoMin('brief', 'campaign-brief-agent', 'campaign-brief-agent', 12)).toBe(12)
    expect(pisoDelTurnoMin('concepto', null, DIRECCION, 12)).toBe(12)
    expect(pisoDelTurnoMin('concepto', DIRECCION, DIRECCION, 300)).toBe(300) // un piso mayor manda
  })
  const ahora = new Date('2026-11-21T12:00:00Z')
  const hace = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString()
  async function conTurnoAbierto(min: number) {
    const m = await montar('concepto')
    const t = turnoDe(m.a)
    const db = new DbFalsa()
    db.semilla('oficina_turnos', [{ encargo_id: m.id, n: t.n, paso: t.paso, tipo: 'agente', agente: t.agente, estado: 'corriendo', inicio: hace(min), workflow_execution_id: 'ex-1' }])
    return { ...m, db, t }
  }
  it('el vigía NO da por muerto el turno de la dirección a los 20 min (con los 12 de antes, sí)', async () => {
    const { M, MS, id, db, t } = await conTurnoAbierto(20)
    expect(t.agente).toBe(DIRECCION)
    const r = await revisarPasosMuertos(M.P, db as never, ahora)
    expect(r.reanudar).toEqual([])
    expect(MS.filas.filter((f) => f.tipo === 'nota' && /turno_fallido/.test(f.texto))).toHaveLength(0)
    expect(M.encargos.get(id)!.estado).not.toBe('fallido')
  })
  it('a los 251 min sí: queda anotado «sin vuelta en 250 min» y la mesa sigue', async () => {
    const { M, MS, id, db } = await conTurnoAbierto(251)
    const r = await revisarPasosMuertos(M.P, db as never, ahora)
    expect(r.reanudar).toEqual([id])
    expect(MS.filas.filter((f) => f.tipo === 'nota' && /turno_fallido: sin vuelta en 250 min/.test(f.texto))).toHaveLength(1)
  })
  it('el turno de un MIEMBRO de la gran idea sigue muriendo a los 12 min', async () => {
    const m = await montar('concepto')
    // la dirección abre: su respuesta deja el turno siguiente a un miembro
    const t0 = turnoDe(m.a)
    const r1 = await recibirResultado(m.M.P, m.id, t0.n, { texto: 'el problema en una frase', workflow_execution_id: 'ex-a', costo_usd: 0.08 })
    const t1 = turnoDe(r1)
    expect(t1.agente).not.toBe(DIRECCION)
    const db = new DbFalsa()
    db.semilla('oficina_turnos', [{ encargo_id: m.id, n: t1.n, paso: t1.paso, tipo: 'agente', agente: t1.agente, estado: 'corriendo', inicio: hace(20), workflow_execution_id: 'ex-1' }])
    const r = await revisarPasosMuertos(m.M.P, db as never, ahora)
    expect(r.reanudar).toEqual([m.id])
    expect(m.MS.filas.filter((f) => f.tipo === 'nota' && /turno_fallido: sin vuelta en 12 min/.test(f.texto))).toHaveLength(1)
  })
  it('la mesa entera: 90 + 250 = 340 min, igual en la plantilla, en la cadena y en la migración (con su reversa a 90)', () => {
    expect(PLAZO_DE_LA_MESA_DE_CONCEPTO_MIN).toBe(340)
    expect(CONCEPTO_MESA.limites.plazo_mesa_min).toBe(340)
    expect(PLAZO_DE_MESA_MIN.concepto).toBe(CONCEPTO_MESA.limites.plazo_mesa_min)
    expect(BRIEF_MESA.limites.plazo_mesa_min).toBe(30)
    expect(PLAZO_DE_MESA_MIN.brief).toBe(30)
    const mig = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611211130_oficina_plazo_de_la_gran_idea.sql'), 'utf8')
    const rev = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202611211130_oficina_plazo_de_la_gran_idea_REVERSA.sql'), 'utf8')
    expect(mig).toContain("jsonb_build_object('plazo_mesa_min', 340)")
    expect(mig).toContain("(g.limites->>'plazo_mesa_min')::numeric = 90")
    expect(mig).toContain("e.familia = 'concepto_mesa'")
    expect(rev).toContain("jsonb_build_object('plazo_mesa_min', 90)")
    expect(rev).toContain("(g.limites->>'plazo_mesa_min')::numeric = 340")
  })
  it('la espera es POR TURNO: el pedido de la dirección de la gran idea trae espera_s (su plazo + 5 min); los demás no traen nada', async () => {
    expect(esperaDelTurnoS('concepto', DIRECCION, DIRECCION)).toBe((PLAZO_DEL_TURNO_DE_LA_GRAN_IDEA_MIN + 5) * 60)
    expect(esperaDelTurnoS('concepto', 'content-creator', DIRECCION)).toBeNull()
    expect(esperaDelTurnoS('brief', 'campaign-brief-agent', 'campaign-brief-agent')).toBeNull()
    expect(ESPERA_DEL_FLUJO_POR_OMISION_S).toBe(1800)
    const m = await montar('concepto')
    let ultima: Respuesta = m.a
    const vistos: Array<{ agente: string; pedido: Record<string, unknown> }> = []
    for (let i = 0; i < 30 && ultima.cuerpo.accion === 'esperar'; i++) {
      const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; pedido: Record<string, unknown> }
      vistos.push({ agente: t.agente, pedido: t.pedido })
      const libro = m.MS.filas.filter((x) => x.encargo_id === m.id)
      const integra = `## Gran idea\nLa isla\n## Citas\n${libro.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: algo`).join('\n')}`
      ultima = await recibirResultado(m.M.P, m.id, t.n, { texto: t.paso.includes(':integrar') ? integra : 'aporte', workflow_execution_id: `ex-${t.n}`, costo_usd: 0.08 })
    }
    const dir = vistos.filter((v) => v.agente === DIRECCION), otros = vistos.filter((v) => v.agente !== DIRECCION)
    expect(dir.length).toBeGreaterThan(1); expect(otros.length).toBeGreaterThan(0)
    for (const v of dir) expect(v.pedido.espera_s).toBe(15300)
    for (const v of otros) expect('espera_s' in v.pedido).toBe(false)
    // la mesa del brief tampoco
    const b = await montar('brief')
    expect('espera_s' in ((b.a.cuerpo.turno as { pedido: Record<string, unknown> }).pedido)).toBe(false)
  })
  it('la espera del flujo `oficina · turno`: el DESPUÉS lee la espera del turno (o 1800) y es el único cambio contra el ANTES', async () => {
    const dir = path.join(RAIZ, 'scripts', 'worker-staging', 'oficina', 'espera-gran-idea')
    const leer = (n: string) => JSON.parse(fs.readFileSync(path.join(dir, `bTbWL9lUvQCfStAz-${n}-2026-11-21.json`), 'utf8'))
    const antes = leer('ANTES'), despues = leer('DESPUES')
    const espera = (f: { nodes: Array<{ name: string; parameters: Record<string, unknown> }> }) => f.nodes.find((n) => n.name === '② Esperar al agente')!.parameters
    expect(espera(antes)).toMatchObject({ resume: 'webhook', limitWaitTime: true, resumeUnit: 'seconds', resumeAmount: 1800 })
    expect(espera(despues)).toMatchObject({ resume: 'webhook', limitWaitTime: true, resumeUnit: 'seconds' })
    // la expresión de n8n, evaluada como la evalúa n8n: `$('② Armar el pedido').first().json` es la salida de ese nodo (lleva `turno.pedido` tal como lo mandó la sala)
    const expr = String(espera(despues).resumeAmount)
    expect(expr.startsWith('={{') && expr.endsWith('}}')).toBe(true)
    const evaluar = (pedido: Record<string, unknown>): unknown => new Function('$', `return (${expr.slice(3, -2)})`)((nodo: string) => {
      expect(nodo).toBe('② Armar el pedido')
      return { first: () => ({ json: { turno: { n: 2, pedido } } }) }
    })
    expect(evaluar({ agent_name: DIRECCION, espera_s: 15300 })).toBe(15300)
    expect(evaluar({ agent_name: 'content-creator' })).toBe(1800)
    expect(evaluar({ espera_s: 'basura' })).toBe(1800)
    // el nodo de verdad que nombra la expresión existe y devuelve `turno` en su salida (`{ ...e, … }` con e = la entrada, que trae turno)
    const armar = antes.nodes.find((n: { name: string }) => n.name === '② Armar el pedido')
    expect(armar).toBeTruthy()
    expect(String(armar.parameters.jsCode)).toContain('const t = e.turno')
    expect(String(armar.parameters.jsCode)).toContain('return [{ json: { ...e, simulado: false, cuerpo } }]')
    // espera_s NO viaja a run-sdk: el cuerpo se arma campo por campo
    expect(String(armar.parameters.jsCode)).not.toMatch(/\.\.\.p\b|espera_s/)
    const sinEspera = (f: { nodes: Array<{ name: string; parameters: Record<string, unknown> }>; connections: unknown }) => JSON.stringify({ n: f.nodes.map((n) => (n.name === '② Esperar al agente' ? { ...n, parameters: { ...n.parameters, resumeAmount: 0 } } : n)), c: f.connections })
    expect(sinEspera(despues)).toBe(sinEspera(antes))
    const { conEsperaDeLaGranIdea } = await import('../../../../scripts/worker-staging/oficina/espera-gran-idea/preparar.mjs')
    expect(JSON.stringify(conEsperaDeLaGranIdea(antes))).toBe(JSON.stringify(despues))
    expect(() => conEsperaDeLaGranIdea(despues)).toThrow(/no 1800/)
    expect(JSON.stringify(despues)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{10,}|xox[abp]-/)
  })
  it('la vuelta de la dirección de la gran idea la entrega el corredor (sin el techo de 800 s de Vercel)', () => {
    expect(AGENTES_CON_VUELTA_POR_EL_CORREDOR).toContain(DIRECCION)
    expect(vueltaPorElCorredorElegible({ agent: DIRECCION, callback_mode: 'runner' } as never)).toMatchObject({ elegible: true })
    expect(vueltaPorElCorredorElegible({ agent: DIRECCION } as never)).toMatchObject({ elegible: false })
  })
})

describe('(3) el gasto de los turnos cortados se anota', () => {
  it('puro: lee «gastado ≈ US$ X» del error si la vuelta no trae costo; si trae, manda el costo; sin la marca, 0', () => {
    expect(costoDelTurno({ costo_usd: 0, error: CORTE('0.8066') })).toBe(0.8066)
    expect(costoDelTurno({ error: CORTE('0.6328') })).toBe(0.6328)
    expect(costoDelTurno({ costo_usd: 1.2, error: CORTE('0.8066') })).toBe(1.2)
    expect(costoDelTurno({ costo_usd: 0, error: 'sin vuelta en 12 min' })).toBe(0)
    expect(costoDelTurno({ costo_usd: 0.5 })).toBe(0.5)
    expect(costoDelTurno({ costo_usd: -3, error: 'otra cosa' })).toBe(0)
    expect(costoDelTurno({ costo_usd: -3 })).toBe(0) // un costo negativo nunca resta, haya error o no
    expect(costoDelTurno({ costo_usd: Number.NaN, error: CORTE('0.4') })).toBe(0.4)
    expect(costoDelTurno({ costo_usd: 0, error: 'gastado ≈ US$ abc' })).toBe(0)
  })
  it('un turno de la dirección cortado por tope suma lo gastado al encargo, al libro de gastos y a la nota del libro', async () => {
    const m = await montar('concepto')
    const t = turnoDe(m.a)
    const antes = m.M.encargos.get(m.id)!.gasto_usd // el portero ya cobró lo suyo al abrir
    await recibirResultado(m.M.P, m.id, t.n, { error: CORTE('0.8066'), workflow_execution_id: '258329', costo_usd: 0 })
    const enc = m.M.encargos.get(m.id)!
    expect(enc.gasto_usd).toBeCloseTo(antes + 0.8066, 6)
    expect(enc.estado_del_motor.gasto_usd).toBeCloseTo(antes + 0.8066, 6)
    expect(m.M.gastos.filter((g) => g.ref_id === '258329').map((g) => g.cost_usd)).toEqual([0.8066])
    const nota = m.MS.filas.find((f) => f.tipo === 'nota' && /turno_fallido/.test(f.texto))!
    expect(Number(nota.costo_usd)).toBeCloseTo(0.8066, 6)
  })
  it('una vuelta TARDÍA (el vigía ya dio el turno por muerto) suma su costo una sola vez y no reabre el turno', async () => {
    const m = await montar('concepto')
    const t = turnoDe(m.a)
    const ahora = new Date(Date.now() + 300 * 60_000)
    const db = new DbFalsa()
    db.semilla('oficina_turnos', [{ encargo_id: m.id, n: t.n, paso: t.paso, tipo: 'agente', agente: t.agente, estado: 'corriendo', inicio: new Date(ahora.getTime() - 260 * 60_000).toISOString(), workflow_execution_id: 'ex-acusado' }])
    expect((await revisarPasosMuertos(m.M.P, db as never, ahora)).reanudar).toEqual([m.id])
    expect(m.MS.filas.filter((f) => f.tipo === 'nota' && /turno_fallido: sin vuelta en 250 min/.test(f.texto))).toHaveLength(1)
    const antes = m.M.encargos.get(m.id)!.gasto_usd
    const turnosAntes = m.MS.filas.length
    const tarde = await recibirResultado(m.M.P, m.id, t.n, { texto: 'la respuesta que llegó tarde', workflow_execution_id: '258383', costo_usd: 1.0516 })
    expect(tarde.status).not.toBe(409)
    expect(m.M.encargos.get(m.id)!.gasto_usd).toBeCloseTo(antes + 1.0516, 6)
    expect(m.MS.filas.filter((f) => f.texto === 'la respuesta que llegó tarde')).toHaveLength(0)
    expect(m.MS.filas.length).toBe(turnosAntes)
    await recibirResultado(m.M.P, m.id, t.n, { texto: 'la respuesta que llegó tarde', workflow_execution_id: '258383', costo_usd: 1.0516 })
    expect(m.M.encargos.get(m.id)!.gasto_usd).toBeCloseTo(antes + 1.0516, 6)
  })
  it('una vuelta tardía cortada por tope también suma lo gastado que trae en el error', async () => {
    const m = await montar('concepto')
    const t = turnoDe(m.a)
    const ahora = new Date(Date.now() + 300 * 60_000)
    const db = new DbFalsa()
    db.semilla('oficina_turnos', [{ encargo_id: m.id, n: t.n, paso: t.paso, tipo: 'agente', agente: t.agente, estado: 'corriendo', inicio: new Date(ahora.getTime() - 260 * 60_000).toISOString(), workflow_execution_id: 'ex-acusado' }])
    expect((await revisarPasosMuertos(m.M.P, db as never, ahora)).reanudar).toEqual([m.id])
    expect(m.MS.filas.filter((f) => f.tipo === 'nota' && /turno_fallido: sin vuelta en 250 min/.test(f.texto))).toHaveLength(1)
    const antes = m.M.encargos.get(m.id)!.gasto_usd
    await recibirResultado(m.M.P, m.id, t.n, { error: CORTE('0.6328'), workflow_execution_id: '258479', costo_usd: 0 })
    expect(m.M.encargos.get(m.id)!.gasto_usd).toBeCloseTo(antes + 0.6328, 6)
  })
  it('la campaña cuenta lo mayor entre el costo fijado de la mesa y lo que su encargo lleva gastado hoy (nunca los dos)', () => {
    const base = { corridas: [], briefs: [], partes: [], topes_de_familia: {}, reservas_de_familia: {}, soltados: [], revisiones: [] }
    const enc = (id: string, gasto: number) => ({ id, estado: 'cerrado', gasto_usd: gasto, familia: 'concepto_mesa', parte_id: CAMPANA, brief_id: null })
    const medir = (costo: number | null, gasto: number) => medirGastoDeCampana({ ...base, conceptos: [{ costo_usd: costo, encargo_id: 'e1' }], encargos: [enc('e1', gasto)] } as never, 'otra').gastado
    expect(medir(2.3, 3.4)).toBeCloseTo(3.4, 6) // llegó una vuelta tardía: cuenta lo del encargo
    expect(medir(2.3, 2.3)).toBeCloseTo(2.3, 6)
    expect(medir(2.3, 1)).toBeCloseTo(2.3, 6) // lo fijado manda si es mayor
    expect(medir(null, 3.4)).toBeCloseTo(3.4, 6) // sin costo fijado: el encargo como siempre
    // la fila de la mesa redondea a 4 decimales: una diferencia de redondeo no es una vuelta tardía (fotos reales del 10-nov: 4,5775 fijado / 4,577545 el encargo)
    expect(medir(4.5775, 4.577545)).toBe(4.5775)
    expect(medir(4.5775, 4.57759)).toBe(4.5775)
    expect(medir(4.5775, 4.57761)).toBe(4.57761)
    // un concepto cuyo encargo no está en la lectura cuenta su costo como siempre
    expect(medirGastoDeCampana({ ...base, conceptos: [{ costo_usd: 2.3, encargo_id: 'otro' }], encargos: [] } as never, 'otra').gastado).toBeCloseTo(2.3, 6)
    // y el brief creativo igual
    expect(medirGastoDeCampana({ ...base, conceptos: [], briefs: [{ costo_usd: 1, encargo_id: 'b1' }], encargos: [enc('b1', 1.7)] } as never, 'otra').gastado).toBeCloseTo(1.7, 6)
  })
})
