/**
 * 10-nov · LA MESA DE REUBICACIÓN de la oficina (GO de Lenovo 18:14Z · camino A 18:24Z): las filas del calendario que quedaron atrás sin producir. US$ 0: modelo y cadena simulados.
 * Se fija: la dirige jefe-marketing (y SOLO la reubicación), no tiene miembros, NO abre con el cerebro ni le pide material al portero, nace de una campaña de la cadena, entrega a la
 * CADENA por `entregarReubicacion` (nunca a la bandeja), y el dato sembrado por la migración es el del código y nace INACTIVO.
 * DOS clientes de práctica de rubros distintos: A · cafetería de barrio · B · clínica veterinaria.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import { abrirMesaDeLaCadena, briefIdDeLaCadena, esDeLaCadenaLaFamilia, validarSobreDeLaCadena, type SobreDeLaCadena } from '../mesa/de-la-cadena'
import { REUBICACION_MESA } from '../plantillas/mesa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import type { Tarjeta } from '../mesa/tipos'
import type { PuertoDelCerebro } from '../puertos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const MIGRACION = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611110000_oficina_mesa_de_reubicacion.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202611110000_oficina_mesa_de_reubicacion_REVERSA.sql'), 'utf8')
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo, version: 1 } as Tarjeta)
/** el directorio como queda tras la migración (y encendida la tarjeta) */
const DIRECTORIO: Tarjeta[] = [
  tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']),
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']),
  tarjeta('jefe-marketing', 'direccion', ['reubicacion:dirige']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'concepto']),
  tarjeta('design-visual-storyteller', 'miembro', ['kit', 'concepto']),
  tarjeta('portero', 'portero', []),
]

interface Caso { nombre: string; marco: string; decision: string }
const CASOS: Caso[] = [
  { nombre: 'A · cafetería', marco: '# Filas del calendario de Café de práctica que quedaron atrás sin producir\n- f1 · 2026-11-09 · instagram · reel', decision: '- f1 · reubicar · 2026-11-19 · es la apertura: primer jueves abierto con margen' },
  { nombre: 'B · clínica veterinaria', marco: '# Filas del calendario de Clínica de práctica que quedaron atrás sin producir\n- f9 · 2026-11-15 · facebook · carrusel', decision: '- f9 · descartar · era un recordatorio de una fecha que ya pasó' },
]

async function montar(k: Caso, o: { directorio?: Tarjeta[]; plantillaActiva?: boolean; sinPuerto?: boolean } = {}) {
  const M = crearMemoria({ plantilla: REUBICACION_MESA, config: { familias_activas: [REUBICACION_MESA.familia] } })
  M.plantilla = { plantilla: M.plantilla!.plantilla, activo: o.plantillaActiva ?? true }
  const MS = crearMesaEnMemoria(o.directorio ?? DIRECTORIO)
  M.P.mesa = MS
  const hecho = { reubicaciones: [] as Array<Record<string, unknown>>, briefs: 0, conceptos: 0, alPortero: 0 }
  M.P.cadena = {
    entregarBrief: async () => { hecho.briefs++; return { ok: true } },
    entregarConcepto: async () => { hecho.conceptos++; return { ok: true } },
    ...(o.sinPuerto ? {} : { entregarReubicacion: async (p: Record<string, unknown>) => { hecho.reubicaciones.push(p); return { ok: true, estado: 'aplicada' } } }),
  }
  const cerebro: PuertoDelCerebro = { avisarA: 'https://x/api/oficina/material-vuelta', pedir: async () => { hecho.alPortero++; return { ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [] } } }, leerPedido: async () => ({ ok: false, error: 'no se usa' }) }
  M.P.cerebro = cerebro
  const s: SobreDeLaCadena = { tipo_de_mesa: 'reubicacion', client_id: CLIENTE, campana_id: CAMPANA, version: 1, dry_run: false, marco_texto: k.marco, condiciones: [] }
  const a = await abrirMesaDeLaCadena(M.P, s, avanzar)
  return { M, MS, hecho, a, id: String(a.cuerpo.encargo_id ?? '') }
}
type Montaje = Awaited<ReturnType<typeof montar>>
async function jugar(m: Montaje, responder: (tipo: string, task: string) => string, max = 10) {
  let ultima: Respuesta = m.a
  const turnos: Array<{ agente: string; tipo: string; task: string }> = []
  for (let i = 0; i < max && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; pedido?: { task?: string } }
    const tipo = t.paso.split(':')[1] ?? t.paso
    turnos.push({ agente: t.agente, tipo, task: t.pedido?.task ?? '' })
    ultima = await recibirResultado(m.M.P, m.id, t.n, { texto: responder(tipo, t.pedido?.task ?? ''), workflow_execution_id: `ex-${t.n}`, costo_usd: 0.1 })
  }
  return { ultima, turnos }
}

describe('quién dirige la reubicación', () => {
  it('🔴 jefe-marketing dirige SOLO la reubicación; las demás mesas siguen con su dirección y nadie es miembro de la reubicación', () => {
    expect(direccionDe(DIRECTORIO, 'reubicacion')?.agente).toBe('jefe-marketing')
    expect(direccionDe(DIRECTORIO, 'brief')?.agente).toBe('campaign-brief-agent')
    expect(direccionDe(DIRECTORIO, 'concepto')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(DIRECTORIO, 'carrusel')?.agente).toBe('creative-director-mesa')
    expect(direccionDe([...DIRECTORIO].reverse(), 'carrusel')?.agente).toBe('creative-director-mesa')
    expect(especialistasPertinentes(DIRECTORIO, 'reubicacion', false)).toEqual([])
    for (const t of ['carrusel', 'kit', 'concepto', 'brief'] as const) expect(especialistasPertinentes(DIRECTORIO, t, true)).not.toContain('jefe-marketing')
  })
  it('sin jefe-marketing activo la reubicación NO cae a otra dirección', () => {
    expect(direccionDe(DIRECTORIO.map((t) => (t.agente === 'jefe-marketing' ? { ...t, activo: false } : t)), 'reubicacion')).toBeNull()
  })
})

describe.each(CASOS)('$nombre · la mesa de punta a punta', (k) => {
  it('🔴 nace de la campaña, jefe-marketing abre SIN el cerebro, decide en dos turnos y la CADENA recibe la decisión; nada a la bandeja ni al portero', async () => {
    const m = await montar(k)
    expect(m.a.status).toBe(200)
    const enc = m.M.encargos.get(m.id)!
    expect(enc).toMatchObject({ familia: 'reubicacion_mesa', parte_id: CAMPANA, brief_id: briefIdDeLaCadena('reubicacion', CAMPANA, 1), tope_usd: 3 })
    expect(enc.sala_ref).toMatchObject({ origen: 'cadena', tipo_de_mesa: 'reubicacion', campana_id: CAMPANA, version: 1 })
    expect(m.hecho.alPortero).toBe(0)
    const { ultima, turnos } = await jugar(m, (tipo) => (tipo === 'dirigir' ? `Lo pienso: ${k.decision}` : k.decision))
    expect(turnos.map((t) => [t.agente, t.tipo])).toEqual([['jefe-marketing', 'dirigir'], ['jefe-marketing', 'integrar']])
    expect(turnos[0].task).toContain(k.marco.split('\n')[0])
    expect(turnos[0].task).toContain('reubicarla en una fecha nueva, fusionarla con una fila que viene, o descartarla')
    expect(turnos[0].task).not.toContain('pedir_material')
    expect(turnos[0].task).not.toContain('Fotos propias')
    expect(turnos[1].task).toContain('entrega la decisión final')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'reubicacion_mesa' })
    expect(m.hecho.reubicaciones).toHaveLength(1)
    expect(m.hecho.reubicaciones[0]).toMatchObject({ campana_id: CAMPANA, version: 1, encargo_id: m.id, texto: k.decision })
    expect(m.hecho.briefs + m.hecho.conceptos).toBe(0)
    expect(m.hecho.alPortero).toBe(0)
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })
  it('🔴 si el agente pide material al portero, se contesta sin ir al cerebro y la mesa sigue', async () => {
    const m = await montar(k)
    const t = m.a.cuerpo.turno as { n: number }
    // el agente deja un pedido al portero en el tablero (como lo haría `pedir_material`)
    await m.MS.aportar({ encargo_id: m.id, de: 'jefe-marketing', para: 'portero', tipo: 'pide', texto: '¿qué fotos hay?', responde_a: null, profundidad: 1, costo_usd: 0 } as never)
    const r = await recibirResultado(m.M.P, m.id, t.n, { texto: `Lo pienso: ${k.decision}`, workflow_execution_id: 'ex-1', costo_usd: 0.1 })
    expect(m.hecho.alPortero).toBe(0)
    const material = m.MS.filas.filter((x) => x.encargo_id === m.id && x.tipo === 'material')
    expect(material.map((x) => x.texto)).toEqual(['(la mesa de reubicación no pide material al cerebro: decide con el marco de la cadena)'])
    expect(r.cuerpo.accion).toBe('esperar')
  })
  it('🔴 sin jefe-marketing activo la mesa FALLA visible y la cadena lo sabe (entrega sin texto, con el motivo del fallo); nunca la deja esperando', async () => {
    const m = await montar(k, { directorio: DIRECTORIO.map((t) => (t.agente === 'jefe-marketing' ? { ...t, activo: false } : t)) })
    expect(m.a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(m.hecho.reubicaciones).toHaveLength(1)
    expect(m.hecho.reubicaciones[0]).toMatchObject({ campana_id: CAMPANA, version: 1, texto: null })
    expect(String(m.hecho.reubicaciones[0].motivo)).toMatch(/^fallo: .*dirección/)
    expect(m.hecho.briefs + m.hecho.conceptos).toBe(0)
  })
  it('la plantilla apagada no abre; sin el puerto de reubicación la mesa cierra igual y avisa a alertas', async () => {
    expect((await montar(k, { plantillaActiva: false })).a).toMatchObject({ status: 409, cuerpo: { error: 'plantilla_inactiva' } })
    const m = await montar(k, { sinPuerto: true })
    const { ultima } = await jugar(m, () => k.decision)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', entrega_a_la_cadena: { ok: false, detalle: 'la cadena no recibe reubicaciones en este entorno' } })
    expect(m.M.llamadas.avisos).toHaveLength(1)
  })
})

describe('el sobre, la plantilla y la migración', () => {
  it('el sobre de reubicación es válido; un tipo desconocido no', () => {
    const base = { client_id: CAMPANA, campana_id: CAMPANA, version: 1, dry_run: true, marco_texto: '# Filas que quedaron atrás sin producir\n- f1', condiciones: [] }
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'reubicacion' }).ok).toBe(true)
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'reubicar' }).ok).toBe(false)
    expect(esDeLaCadenaLaFamilia('reubicacion_mesa')).toBe(true)
    expect(esDeLaCadenaLaFamilia('carrusel_mesa')).toBe(false)
  })
  it('🔴 el dato sembrado es EXACTAMENTE el del código, y nace INACTIVO (plantilla y tarjeta)', () => {
    const tomar = (m: string) => JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(MIGRACION)![1])
    expect(tomar('pasos')).toEqual(JSON.parse(JSON.stringify(REUBICACION_MESA.pasos)))
    expect(tomar('lim')).toEqual(JSON.parse(JSON.stringify(REUBICACION_MESA.limites)))
    expect(REUBICACION_MESA.limites).toMatchObject({ tope_encargo_usd: 3, max_rondas: 1, mesa: true, plazo_mesa_min: 30 })
    expect(MIGRACION).toMatch(/1, 3\.00, false\s*\)/)
    expect(MIGRACION).toMatch(/pertinente_en = ARRAY\['reubicacion:dirige'\]/)
    expect(MIGRACION).toMatch(/activo = false/)
    expect(MIGRACION).not.toMatch(/activo = true|,\s*true\s*\)/)
    // el SQL (sin los comentarios) no crea tablas, no toca la config de la cadena ni el cerebro
    const sql = MIGRACION.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(sql).not.toMatch(/CREATE TABLE|cadena_config|cerebro/i)
  })
  it('la reversa se niega si ya hay encargos de la mesa y deja la tarjeta como estaba', () => {
    expect(REVERSA).toMatch(/RAISE EXCEPTION/)
    expect(REVERSA).toMatch(/oficina_encargos/)
    expect(REVERSA).toMatch(/rol = 'miembro'/)
    expect(REVERSA).toMatch(/DELETE FROM public\.oficina_tipos_de_grupo WHERE tipo = 'reubicacion_mesa'/)
  })
})
