/**
 * 17-nov · LA MESA «CORRECCIÓN DEL BANCO» de la oficina (GO de Lenovo · cambio 4). US$ 0: modelo y cadena simulados.
 * Se fija: la dirige creative-director-mesa (que sigue dirigiendo la gran idea), no tiene miembros, NO abre con el cerebro ni le pide material al portero, nace de una campaña
 * de la cadena, entrega a la CADENA por `entregarBanco` (nunca a la bandeja), el tope del sobre solo BAJA el de la plantilla, y el dato sembrado por la migración es el del código y nace INACTIVO.
 * DOS clientes de práctica de rubros distintos: A · ferretería de barrio · B · estudio de yoga.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import { abrirMesaDeLaCadena, briefIdDeLaCadena, esDeLaCadenaLaFamilia, validarSobreDeLaCadena, type SobreDeLaCadena } from '../mesa/de-la-cadena'
import { BANCO_MESA, FALLIDOS_MESA } from '../plantillas/mesa'
import { crearMemoria, CLIENTE } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import type { Tarjeta } from '../mesa/tipos'
import type { PuertoDelCerebro } from '../puertos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const MIGRACION = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202611180030_oficina_mesa_de_correccion_del_banco.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202611180030_oficina_mesa_de_correccion_del_banco_REVERSA.sql'), 'utf8')
const CAMPANA = '8168f32b-47d9-466a-9350-3dff31700a58'
const SIN_COMENTARIOS = (s: string) => s.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n')

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['algo'], necesita: ['algo'], entrega: ['algo'], pertinente_en, activo, version: 1 })
/** el directorio como queda tras la migración (la fila viva de creative-director-mesa, SELECT 17-nov, más `banco:dirige`) */
const DIRECTORIO: Tarjeta[] = [
  tarjeta('campaign-brief-agent', 'direccion', ['brief:dirige']),
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige']),
  tarjeta('jefe-marketing', 'direccion', ['reubicacion:dirige', 'fallidos:dirige']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'concepto', 'video', 'post']),
  tarjeta('social-media-strategist', 'miembro', ['carrusel:critica', 'concepto:critica']),
  tarjeta('portero', 'portero', []),
]

interface Caso { nombre: string; marco: string; respuesta: string }
const bloque = (o: unknown) => '```json\n' + JSON.stringify(o) + '\n```'
const CASOS: Caso[] = [
  { nombre: 'A · ferretería', marco: '# Corrección de la jefatura sobre una idea del banco · Ferretería de práctica\n## La idea\n- C1-I02 · facebook · foto · taladro en oferta · mensaje: 2x1 en taladros', respuesta: bloque({ respuesta: 'tomada', accion: 'editar', cambios: { mensaje: 'taladros para la obra de casa' }, explicacion: 'la oferta cerró' }) },
  { nombre: 'B · estudio de yoga', marco: '# Corrección de la jefatura sobre una idea del banco · Estudio de práctica\n## La idea\n- C2-I05 · instagram · historia · clase al amanecer · mensaje: clase gratis el domingo', respuesta: bloque({ respuesta: 'no_tomada', explicacion: 'la ficha no dice que la clase cerró' }) },
]

async function montar(k: Caso, o: { directorio?: Tarjeta[]; plantillaActiva?: boolean; sinPuerto?: boolean; tope_usd?: number } = {}) {
  const M = crearMemoria({ plantilla: BANCO_MESA, config: { familias_activas: [BANCO_MESA.familia] } })
  M.plantilla = { plantilla: M.plantilla!.plantilla, activo: o.plantillaActiva ?? true }
  const MS = crearMesaEnMemoria(o.directorio ?? DIRECTORIO)
  M.P.mesa = MS
  const hecho = { banco: [] as Array<Record<string, unknown>>, otras: 0, alPortero: 0 }
  M.P.cadena = {
    entregarBrief: async () => { hecho.otras++; return { ok: true } },
    entregarConcepto: async () => { hecho.otras++; return { ok: true } },
    entregarReubicacion: async () => { hecho.otras++; return { ok: true } },
    entregarFallidos: async () => { hecho.otras++; return { ok: true } },
    ...(o.sinPuerto ? {} : { entregarBanco: async (p: Record<string, unknown>) => { hecho.banco.push(p); return { ok: true, estado: 'respondida' } } }),
  }
  const cerebro: PuertoDelCerebro = { avisarA: 'https://x/api/oficina/material-vuelta', pedir: async () => { hecho.alPortero++; return { ok: true, body: { estado: 'completo', costo_usd: 0.05, huecos: [] } } }, leerPedido: async () => ({ ok: false, error: 'no se usa' }) } as unknown as PuertoDelCerebro
  M.P.cerebro = cerebro
  const s: SobreDeLaCadena = { tipo_de_mesa: 'banco', client_id: CLIENTE, campana_id: CAMPANA, version: 1, dry_run: false, marco_texto: k.marco, condiciones: [], ...(o.tope_usd !== undefined ? { tope_usd: o.tope_usd } : {}) }
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

describe('quién dirige la corrección del banco', () => {
  it('🔴 creative-director-mesa dirige la corrección del banco Y la gran idea; nadie es miembro de la corrección (ni la crítica); jefe-marketing sigue con lo suyo', () => {
    expect(direccionDe(DIRECTORIO, 'banco')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(DIRECTORIO, 'concepto')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(DIRECTORIO, 'fallidos')?.agente).toBe('jefe-marketing')
    expect(especialistasPertinentes(DIRECTORIO, 'banco', true)).toEqual([])
    expect(especialistasPertinentes(DIRECTORIO, 'banco', false)).toEqual([])
  })
})

describe.each(CASOS)('$nombre · la mesa de punta a punta', (k) => {
  it('🔴 nace de la campaña, la dirección abre SIN el cerebro, decide en dos turnos y la CADENA recibe la respuesta; nada a la bandeja ni al portero', async () => {
    const m = await montar(k)
    expect(m.a.status).toBe(200)
    const enc = m.M.encargos.get(m.id)!
    expect(enc).toMatchObject({ familia: 'banco_mesa', parte_id: CAMPANA, brief_id: briefIdDeLaCadena('banco', CAMPANA, 1), tope_usd: 1.5 })
    expect(enc.brief_id).toMatch(/^bco-[0-9a-f]{12}-v1$/)
    expect(enc.sala_ref).toMatchObject({ origen: 'cadena', tipo_de_mesa: 'banco', campana_id: CAMPANA, version: 1 })
    const { ultima, turnos } = await jugar(m, (tipo) => (tipo === 'dirigir' ? `Lo pienso:\n${k.respuesta}` : k.respuesta))
    expect(turnos.map((t) => [t.agente, t.tipo])).toEqual([['creative-director-mesa', 'dirigir'], ['creative-director-mesa', 'integrar']])
    expect(turnos[0].task).toContain(k.marco.split('\n')[0])
    expect(turnos[0].task).toContain('Una regla dura se toma sí o sí')
    expect(turnos[0].task).toContain('El código verifica después')
    expect(turnos[0].task).not.toContain('pedir_material')
    expect(turnos[0].task).not.toContain('Fotos propias')
    expect(turnos[1].task).toContain('entrega tu respuesta final')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'banco_mesa' })
    expect(m.hecho.banco).toHaveLength(1)
    expect(m.hecho.banco[0]).toMatchObject({ campana_id: CAMPANA, version: 1, encargo_id: m.id, texto: k.respuesta })
    expect(m.hecho.otras + m.hecho.alPortero).toBe(0)
    expect(m.M.llamadas.bandeja).toHaveLength(0)
  })
  it('🔴 si la dirección pide material al portero, se contesta sin ir al cerebro y la mesa sigue', async () => {
    const m = await montar(k)
    const t = m.a.cuerpo.turno as { n: number }
    await m.MS.aportar({ encargo_id: m.id, de: 'creative-director-mesa', para: 'portero', tipo: 'pide', texto: '¿qué ofertas hay?', responde_a: null, profundidad: 1, costo_usd: 0 } as never)
    const r = await recibirResultado(m.M.P, m.id, t.n, { texto: `Lo pienso:\n${k.respuesta}`, workflow_execution_id: 'ex-1', costo_usd: 0.1 })
    expect(m.hecho.alPortero).toBe(0)
    expect(m.MS.filas.filter((x) => x.encargo_id === m.id && x.tipo === 'material').map((x) => x.texto)).toEqual(['(la corrección del banco no pide material al cerebro: decide con el marco de la cadena)'])
    expect(r.cuerpo.accion).toBe('esperar')
  })
  it('🔴 el tope del sobre solo BAJA el de la plantilla (el reintento va dentro del mismo tope); uno mayor no lo sube', async () => {
    expect((await montar(k, { tope_usd: 0.7 })).M.encargos.values().next().value!.tope_usd).toBe(0.7)
    expect((await montar(k, { tope_usd: 9 })).M.encargos.values().next().value!.tope_usd).toBe(1.5)
  })
  it('sin la dirección activa la mesa FALLA visible y la cadena lo sabe (entrega sin texto)', async () => {
    const m = await montar(k, { directorio: DIRECTORIO.map((t) => (t.agente === 'creative-director-mesa' ? { ...t, activo: false } : t)) })
    expect(m.a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(m.hecho.banco).toHaveLength(1)
    expect(m.hecho.banco[0]).toMatchObject({ campana_id: CAMPANA, version: 1, texto: null })
  })
  it('la plantilla apagada no abre; sin el puerto del banco la mesa cierra igual y avisa a alertas', async () => {
    expect((await montar(k, { plantillaActiva: false })).a).toMatchObject({ status: 409, cuerpo: { error: 'plantilla_inactiva' } })
    const m = await montar(k, { sinPuerto: true })
    const { ultima } = await jugar(m, () => k.respuesta)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', entrega_a_la_cadena: { ok: false, detalle: 'la cadena no recibe las correcciones del banco en este entorno' } })
    expect(m.M.llamadas.avisos).toHaveLength(1)
  })
})

describe('el sobre, la plantilla y la migración', () => {
  it('el sobre del banco es válido; un tope no positivo no; un tipo desconocido no', () => {
    const base = { client_id: CAMPANA, campana_id: CAMPANA, version: 1, dry_run: true, marco_texto: '# Corrección de una idea del banco\n- C1-I01', condiciones: [] }
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'banco' }).ok).toBe(true)
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'banco', tope_usd: 0.5 })).toMatchObject({ ok: true, sobre: { tope_usd: 0.5 } })
    for (const tope_usd of [0, -1, '1', Number.NaN]) expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'banco', tope_usd }).ok).toBe(false)
    expect(validarSobreDeLaCadena({ ...base, tipo_de_mesa: 'bancos' }).ok).toBe(false)
    expect(esDeLaCadenaLaFamilia('banco_mesa')).toBe(true)
  })
  it('🔴 el dato sembrado es EXACTAMENTE el del código, de clase interna, y la plantilla nace INACTIVA', () => {
    const tomar = (m: string) => JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(MIGRACION)![1])
    expect(tomar('pasos')).toEqual(JSON.parse(JSON.stringify(BANCO_MESA.pasos)))
    expect(tomar('lim')).toEqual(JSON.parse(JSON.stringify(BANCO_MESA.limites)))
    expect(BANCO_MESA).toMatchObject({ clase: 'interna', limites: { tope_encargo_usd: 1.5, max_rondas: 1, mesa: true, plazo_mesa_min: 30 } })
    expect(BANCO_MESA.pasos).toEqual(FALLIDOS_MESA.pasos)
    expect(MIGRACION).toMatch(/1, 1\.50, false, 'interna'\s*\)/)
    const sql = SIN_COMENTARIOS(MIGRACION)
    expect(sql).not.toMatch(/activo = (true|false)/)
    expect(sql).not.toMatch(/CREATE TABLE|cadena_config|cerebro/i)
    // solo cambia la tarjeta si está EXACTAMENTE como la fila viva (SELECT 17-nov): no pisa una tarjeta que alguien cambió
    expect(sql).toContain("WHERE agente = 'creative-director-mesa' AND rol = 'direccion' AND pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post'];")
    expect(sql).toContain("SET pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige'],")
    expect(sql).not.toMatch(/SET especialidad/)
  })
  it('🔴 las guardas de la migración: se detiene si falta la plantilla o la dirección y nunca pisa una plantilla existente', () => {
    const sql = SIN_COMENTARIOS(MIGRACION)
    expect(sql).toContain("SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'banco_mesa' AND clase = 'interna';")
    expect(sql).toContain("SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'creative-director-mesa' AND rol = 'direccion' AND pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige'];")
    expect(sql).toContain('IF p <> 1 THEN RAISE EXCEPTION')
    expect(sql).toContain('IF d <> 1 THEN RAISE EXCEPTION')
    expect(sql).toMatch(/\) ON CONFLICT \(tipo\) DO NOTHING;/)
    expect(sql).not.toMatch(/DO UPDATE/i)
  })
  it('🔴 la reversa se niega si ya hay encargos de la mesa y devuelve la tarjeta EXACTA de antes', () => {
    const sql = SIN_COMENTARIOS(REVERSA)
    expect(sql).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos WHERE familia = 'banco_mesa'\) THEN\s+RAISE EXCEPTION/)
    expect(sql).toContain("SET pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post'], actualizado_en = now()")
    expect(sql).toContain("pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige'];")
    expect(sql).toMatch(/DELETE FROM public\.oficina_tipos_de_grupo WHERE tipo = 'banco_mesa';/)
  })
})
