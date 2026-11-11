/**
 * 11-nov · LA MESA DE REVISIÓN DE FALLIDOS de la oficina (GO de Lenovo 16:46 Zúrich · decisión de Emilio 16:43). US$ 0: modelo y cadena simulados.
 * Se fija: la dirige jefe-marketing (que sigue dirigiendo la reubicación), no tiene miembros, NO abre con el cerebro ni le pide material al portero, nace de una campaña de la cadena,
 * entrega a la CADENA por `entregarFallidos` (nunca a la bandeja), y el dato sembrado por la migración es el del código y nace INACTIVO.
 * DOS clientes de práctica de rubros distintos: A · cafetería de barrio · B · clínica veterinaria.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import { abrirMesaDeLaCadena, briefIdDeLaCadena, esDeLaCadenaLaFamilia, validarSobreDeLaCadena, type SobreDeLaCadena } from '../mesa/de-la-cadena'
import { FALLIDOS_MESA, REUBICACION_MESA } from '../plantillas/mesa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import type { Tarjeta } from '../mesa/tipos'
import type { PuertoDelCerebro } from '../puertos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const MIGRACION = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611111800_oficina_mesa_de_fallidos.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202611111800_oficina_mesa_de_fallidos_REVERSA.sql'), 'utf8')
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo, version: 1 } as Tarjeta)
/** el directorio como queda tras la migración */
const DIRECTORIO: Tarjeta[] = [
  tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']),
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']),
  tarjeta('jefe-marketing', 'direccion', ['reubicacion:dirige', 'fallidos:dirige']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'concepto']),
  tarjeta('portero', 'portero', []),
]

interface Caso { nombre: string; marco: string; veredicto: string }
const CASOS: Caso[] = [
  { nombre: 'A · cafetería', marco: '# Piezas de Café de práctica que fallaron después de gastar\n- F1 · pieza B1 · Causa guardada: «no pude leer las tarifas»\n- A1 · fix: lector de tarifas', veredicto: 'F1 · reabrir · A1 · el lector nuevo entiende la tarifa que falló' },
  { nombre: 'B · clínica veterinaria', marco: '# Piezas de Clínica de práctica que fallaron después de gastar\n- F1 · pieza B7 · Causa guardada: «faltaba la foto de portada»\n- A1 · docs: el reloj', veredicto: 'F1 · dejar · el único cambio es de documentación, no toca la portada' },
]

async function montar(k: Caso, o: { directorio?: Tarjeta[]; plantillaActiva?: boolean; sinPuerto?: boolean } = {}) {
  const M = crearMemoria({ plantilla: FALLIDOS_MESA, config: { familias_activas: [FALLIDOS_MESA.familia] } })
  M.plantilla = { plantilla: M.plantilla!.plantilla, activo: o.plantillaActiva ?? true }
  const MS = crearMesaEnMemoria(o.directorio ?? DIRECTORIO)
  M.P.mesa = MS
  const hecho = { fallidos: [] as Array<Record<string, unknown>>, reubicaciones: 0, briefs: 0, conceptos: 0, alPortero: 0 }
  M.P.cadena = {
    entregarBrief: async () => { hecho.briefs++; return { ok: true } },
    entregarConcepto: async () => { hecho.conceptos++; return { ok: true } },
    entregarReubicacion: async () => { hecho.reubicaciones++; return { ok: true } },
    ...(o.sinPuerto ? {} : { entregarFallidos: async (p: Record<string, unknown>) => { hecho.fallidos.push(p); return { ok: true, estado: 'cerrada' } } }),
  }
  const cerebro: PuertoDelCerebro = { avisarA: 'https://x/api/oficina/material-vuelta', pedir: async () => { hecho.alPortero++; return { ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [] } } }, leerPedido: async () => ({ ok: false, error: 'no se usa' }) }
  M.P.cerebro = cerebro
  const s: SobreDeLaCadena = { tipo_de_mesa: 'fallidos', client_id: CLIENTE, campana_id: CAMPANA, version: 1, dry_run: false, marco_texto: k.marco, condiciones: [] }
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

describe('quién dirige la revisión de fallidos', () => {
  it('🔴 jefe-marketing dirige la revisión de fallidos Y la reubicación; las demás mesas siguen con su dirección y nadie es miembro de la revisión', () => {
    expect(direccionDe(DIRECTORIO, 'fallidos')?.agente).toBe('jefe-marketing')
    expect(direccionDe(DIRECTORIO, 'reubicacion')?.agente).toBe('jefe-marketing')
    expect(direccionDe(DIRECTORIO, 'carrusel')?.agente).toBe('creative-director-mesa')
    expect(especialistasPertinentes(DIRECTORIO, 'fallidos', false)).toEqual([])
    for (const t of ['carrusel', 'kit', 'concepto', 'brief'] as const) expect(especialistasPertinentes(DIRECTORIO, t, true)).not.toContain('jefe-marketing')
  })
})

describe.each(CASOS)('$nombre · la mesa de punta a punta', (k) => {
  it('🔴 nace de la campaña, jefe-marketing abre SIN el cerebro, decide en dos turnos y la CADENA recibe los veredictos; nada a la bandeja ni al portero', async () => {
    const m = await montar(k)
    expect(m.a.status).toBe(200)
    const enc = m.M.encargos.get(m.id)!
    expect(enc).toMatchObject({ familia: 'fallidos_mesa', parte_id: CAMPANA, brief_id: briefIdDeLaCadena('fallidos', CAMPANA, 1), tope_usd: 2 })
    expect(enc.brief_id).toMatch(/^fal-[0-9a-f]{12}-v1$/)
    expect(enc.sala_ref).toMatchObject({ origen: 'cadena', tipo_de_mesa: 'fallidos', campana_id: CAMPANA, version: 1 })
    const { ultima, turnos } = await jugar(m, (tipo) => (tipo === 'dirigir' ? `Lo pienso: ${k.veredicto}` : k.veredicto))
    expect(turnos.map((t) => [t.agente, t.tipo])).toEqual([['jefe-marketing', 'dirigir'], ['jefe-marketing', 'integrar']])
    expect(turnos[0].task).toContain(k.marco.split('\n')[0])
    expect(turnos[0].task).toContain('rehacerla nombrando el cambio que corrige su causa, o dejarla como está')
    expect(turnos[0].task).toContain('El código verifica después')
    expect(turnos[0].task).not.toContain('pedir_material')
    expect(turnos[0].task).not.toContain('Fotos propias')
    expect(turnos[0].task).not.toContain('Manual de marca')
    expect(turnos[1].task).toContain('entrega los veredictos finales')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'fallidos_mesa' })
    expect(m.hecho.fallidos).toHaveLength(1)
    expect(m.hecho.fallidos[0]).toMatchObject({ campana_id: CAMPANA, version: 1, encargo_id: m.id, texto: k.veredicto })
    expect(m.hecho.reubicaciones + m.hecho.briefs + m.hecho.conceptos + m.hecho.alPortero).toBe(0)
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })
  it('🔴 si el agente pide material al portero, se contesta sin ir al cerebro y la mesa sigue', async () => {
    const m = await montar(k)
    const t = m.a.cuerpo.turno as { n: number }
    await m.MS.aportar({ encargo_id: m.id, de: 'jefe-marketing', para: 'portero', tipo: 'pide', texto: '¿qué fotos hay?', responde_a: null, profundidad: 1, costo_usd: 0 } as never)
    const r = await recibirResultado(m.M.P, m.id, t.n, { texto: `Lo pienso: ${k.veredicto}`, workflow_execution_id: 'ex-1', costo_usd: 0.1 })
    expect(m.hecho.alPortero).toBe(0)
    expect(m.MS.filas.filter((x) => x.encargo_id === m.id && x.tipo === 'material').map((x) => x.texto)).toEqual(['(la revisión de fallidos no pide material al cerebro: decide con el marco de la cadena)'])
    expect(r.cuerpo.accion).toBe('esperar')
  })
  it('sin jefe-marketing activo la mesa FALLA visible y la cadena lo sabe (entrega sin texto); nunca la deja esperando', async () => {
    const m = await montar(k, { directorio: DIRECTORIO.map((t) => (t.agente === 'jefe-marketing' ? { ...t, activo: false } : t)) })
    expect(m.a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(m.hecho.fallidos).toHaveLength(1)
    expect(m.hecho.fallidos[0]).toMatchObject({ campana_id: CAMPANA, version: 1, texto: null })
  })
  it('la plantilla apagada no abre; sin el puerto de fallidos la mesa cierra igual y avisa a alertas', async () => {
    expect((await montar(k, { plantillaActiva: false })).a).toMatchObject({ status: 409, cuerpo: { error: 'plantilla_inactiva' } })
    const m = await montar(k, { sinPuerto: true })
    const { ultima } = await jugar(m, () => k.veredicto)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', entrega_a_la_cadena: { ok: false, detalle: 'la cadena no recibe la revisión de fallidos en este entorno' } })
    expect(m.M.llamadas.avisos).toHaveLength(1)
  })
})

describe('el sobre, la plantilla y la migración', () => {
  it('el sobre de fallidos es válido; un tipo desconocido no', () => {
    const base = { client_id: CAMPANA, campana_id: CAMPANA, version: 1, dry_run: true, marco_texto: '# Piezas que fallaron después de gastar\n- F1', condiciones: [] }
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'fallidos' }).ok).toBe(true)
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'fallido' }).ok).toBe(false)
    expect(esDeLaCadenaLaFamilia('fallidos_mesa')).toBe(true)
  })
  it('🔴 el dato sembrado es EXACTAMENTE el del código, de clase interna, y la plantilla nace INACTIVA', () => {
    const tomar = (m: string) => JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(MIGRACION)![1])
    expect(tomar('pasos')).toEqual(JSON.parse(JSON.stringify(FALLIDOS_MESA.pasos)))
    expect(tomar('lim')).toEqual(JSON.parse(JSON.stringify(FALLIDOS_MESA.limites)))
    expect(FALLIDOS_MESA).toMatchObject({ clase: 'interna', limites: { tope_encargo_usd: 2, max_rondas: 1, mesa: true, plazo_mesa_min: 30 } })
    expect(FALLIDOS_MESA.pasos).toEqual(REUBICACION_MESA.pasos)
    expect(MIGRACION).toMatch(/1, 2\.00, false, 'interna'\s*\)/)
    expect(MIGRACION).toMatch(/pertinente_en = ARRAY\['reubicacion:dirige', 'fallidos:dirige'\]/)
    const sql = MIGRACION.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')
    // la tarjeta de jefe-marketing no se enciende ni se apaga (hoy dirige la reubicación encendida); no crea tablas, no toca la config de la cadena ni el cerebro
    expect(sql).not.toMatch(/activo = (true|false)/)
    expect(sql).not.toMatch(/CREATE TABLE|cadena_config|cerebro/i)
    // solo cambia la tarjeta si está exactamente como la dejó la reubicación
    expect(sql).toMatch(/WHERE agente = 'jefe-marketing' AND rol = 'direccion' AND pertinente_en = ARRAY\['reubicacion:dirige'\];/)
  })
  it('🔴 CC6 (certificación 6cfe0eb) · las guardas de la migración, fijadas: se detiene si falta la plantilla o la dirección, nunca pisa una plantilla existente y la especialidad nombra los fallidos', () => {
    const sql = MIGRACION.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(sql).toContain("SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'fallidos_mesa' AND clase = 'interna';")
    expect(sql).toContain("SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'jefe-marketing' AND rol = 'direccion' AND pertinente_en = ARRAY['reubicacion:dirige', 'fallidos:dirige'];")
    expect(sql).toContain('IF p <> 1 THEN RAISE EXCEPTION')
    expect(sql).toContain('IF d <> 1 THEN RAISE EXCEPTION')
    expect(sql).toMatch(/\) ON CONFLICT \(tipo\) DO NOTHING;/)
    expect(sql).not.toMatch(/DO UPDATE/i)
    const especialidad = /SET especialidad = '([^']+)'/.exec(sql)![1]!
    expect(especialidad).toContain('fallaron después de gastar')
    expect(especialidad).toContain('filas del calendario que pasaron sin producirse')
  })
  it('🔴 CC6 · la reversa se niega con la condición exacta (cualquier encargo de la familia, sin aflojar)', () => {
    expect(REVERSA).toContain("IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE familia = 'fallidos_mesa') THEN\n    RAISE EXCEPTION".replace(/\n/g, REVERSA.includes('\r\n') ? '\r\n' : '\n'))
  })
  it('la reversa se niega si ya hay encargos de la mesa y deja la tarjeta como la dejó la reubicación', () => {
    expect(REVERSA).toMatch(/RAISE EXCEPTION/)
    expect(REVERSA).toMatch(/familia = 'fallidos_mesa'/)
    expect(REVERSA).toMatch(/pertinente_en = ARRAY\['reubicacion:dirige'\], actualizado_en/)
    expect(REVERSA).toMatch(/DELETE FROM public\.oficina_tipos_de_grupo WHERE tipo = 'fallidos_mesa'/)
    // la especialidad que devuelve es la que sembró la reubicación
    const vieja = /SET rol = 'direccion',\s*especialidad = '([^']+)'/.exec(fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611110000_oficina_mesa_de_reubicacion.sql'), 'utf8'))![1]
    expect(REVERSA).toContain(`especialidad = '${vieja}'`)
  })
})
