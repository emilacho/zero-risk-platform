/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · la fuente «Propuestas» de `GET /api/direccion/decisiones` (tarjeta de CC5).
 * Contrato: ADENDA 1, 2 y 3 de `2026-11-16-RESPUESTA-CC1-a-CC2-CC3-CC5-sprint2-hoja-fase-y-propuestas.md`. Solo lectura, US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { problemasDeLaFicha, QUE_SE_DETIENE_EL_VIDEO } from '../src/lib/direccion/decisiones-ficha'
import { propuestasDeLaDecision, TITULO_PROPUESTAS } from '../src/lib/direccion/decisiones-propuestas'
import { quedanVueltas } from '../src/lib/oficina/video/aprobacion'

const AHORA = new Date('2026-11-16T23:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PRAC = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const E1 = '11111111-1111-4111-8111-111111111111'
const E2 = '22222222-2222-4222-8222-222222222222'
const E3 = '33333333-3333-4333-8333-333333333333'
const plano = (n: number, x: Record<string, unknown> = {}) => ({ n, desde: (n - 1) * 3, hasta: n * 3, se_ve: `Se ve ${n}`, rol: n === 1 ? 'captar' : undefined, dice: n === 1 ? 'Hola' : undefined, producto: n === 2 ? true : undefined, ...x })
const propuesta = (i: number, x: Record<string, unknown> = {}) => ({ id: `P${i}`, nombre: `Camino ${i}`, concepto: `Concepto ${i}`, segundos: 6, red: 'instagram', objetivo: 'ventas', por_que: `porque ${i}`, guion: { segundos: 6, planos: [plano(1), plano(2)] }, texto: `# Propuesta ${i}`, ...x })
const motor = (x: Record<string, unknown> = {}) => ({
  vueltas: {},
  artefactos: {
    propuestas_video: { datos: { ronda: 1, avisos: ['se pidieron 3 propuestas y quedan 2: se presentan las que hay'], propuestas: [propuesta(1), propuesta(2)] } },
    imagenes_clave: { datos: { propuestas: [{ id: 'P2', costo_usd: 0.08, planos: [{ n: 1, url: 'https://img/p2-1a.png', imagenes: ['https://img/p2-1a.png', 'https://img/p2-1b.png'] }, { n: 2, imagenes: ['https://img/p2-2.png'] }] }] } },
    borrador_video: { datos: { propuestas: [{ id: 'P2', url: 'https://vid/p2.mp4', costo_usd: 0.5 }] } },
  },
  ...x,
})
const PASOS = [{ clave: 'mesa', tipo: 'codigo', funcion: 'mesa' }, { clave: 'aprobar_propuestas', tipo: 'codigo', funcion: 'aprobar_propuestas', vuelve_a: { paso: 'mesa', max: 2 } }]
const turno = (encargo_id: string, x: Record<string, unknown> = {}) => ({ id: Math.random(), encargo_id, n: 5, paso: 'aprobar_propuestas', tipo: 'dueno', estado: 'corriendo', inicio: '2026-11-16T22:40:00Z', ...x })
const encargo = (id: string, x: Record<string, unknown> = {}) => ({ id, client_id: C1, brief_id: 'F1-S1-ig-r1', familia: 'video_mesa', dry_run: false, estado: 'en_paso', estado_del_motor: motor(), ...x })
const base = () => new DbFalsa()
  .semilla('clients', [{ id: C1, name: 'Náufrago', industry: 'restaurante', status: 'active' }, { id: PRAC, name: 'Prueba Uno', industry: 'prueba', status: 'active' }])
  .semilla('oficina_tipos_de_grupo', [{ familia: 'video_mesa', pasos: PASOS }])
const ctx = (db: DbFalsa): Contexto => {
  const from = db.from.bind(db)
  db.from = ((t: string) => { const q = from(t) as unknown as Record<string, unknown>; for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { throw new Error(`ESCRITURA en ${t}`) }; return q }) as unknown as typeof db.from
  return { db, ahora: () => AHORA, env: {} }
}

describe('lo que muestra la tarjeta (puro)', () => {
  it('cada propuesta con sus planos; las imágenes y el video de CC2/CC3 por id; lo que falta va null / []', () => {
    const p = propuestasDeLaDecision({ id: E1, brief_id: 'b' }, motor(), PASOS)!
    expect(p).toMatchObject({ encargo_id: E1, brief_id: 'b', ronda: 1, quedan_vueltas: 2, avisos: ['se pidieron 3 propuestas y quedan 2: se presentan las que hay'] })
    expect(p.lista.map((x) => x.id)).toEqual(['P1', 'P2'])
    const [p1, p2] = p.lista
    expect(p1).toMatchObject({ nombre: 'Camino 1', concepto: 'Concepto 1', segundos: 6, red: 'instagram', objetivo: 'ventas', por_que: 'porque 1', video_url: null, costo: { borrador_usd: null, final_usd: null } })
    expect(p1.planos[0]).toEqual({ n: 1, desde: 0, hasta: 3, rol: 'captar', dice: 'Hola', se_ve: 'Se ve 1', texto_en_pantalla: null, producto: null, imagen_url: null, imagenes: [] })
    expect(p1.planos[1]).toMatchObject({ producto: true, rol: null, dice: null })
    expect(p2.video_url).toBe('https://vid/p2.mp4')
    expect(QUE_SE_DETIENE_EL_VIDEO).toBe('la producción')
    expect(p2.costo).toEqual({ borrador_usd: 0.58, final_usd: null })
    expect(p2.planos[0]).toMatchObject({ imagen_url: 'https://img/p2-1a.png', imagenes: ['https://img/p2-1a.png', 'https://img/p2-1b.png'] })
    // sin `url`, el primero de `imagenes` es la imagen del plano (ADENDA 3)
    expect(p2.planos[1]).toMatchObject({ imagen_url: 'https://img/p2-2.png', imagenes: ['https://img/p2-2.png'] })
  })
  it('🔴 (CC6) las rondas que quedan siguen la regla del motor: `max` del paso menos las hechas; sin `vuelve_a` o sin plantilla, 0; nunca negativas', () => {
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, motor({ vueltas: { aprobar_propuestas: 1 } }), PASOS)!.quedan_vueltas).toBe(1)
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, motor({ vueltas: { aprobar_propuestas: 5 } }), PASOS)!.quedan_vueltas).toBe(0)
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, motor(), null)!.quedan_vueltas).toBe(0)
    const sinVuelta = [{ clave: 'aprobar_propuestas', tipo: 'codigo', funcion: 'aprobar_propuestas' }]
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, motor(), sinVuelta)!.quedan_vueltas).toBe(0)
    // el motor dice lo mismo para el mismo paso y las mismas vueltas
    expect(quedanVueltas({ vueltas: {} }, sinVuelta[0] as never)).toBe(0)
    expect(quedanVueltas({ vueltas: { aprobar_propuestas: 1 } }, PASOS[1] as never)).toBe(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, motor({ vueltas: { aprobar_propuestas: 1 } }), PASOS)!.quedan_vueltas)
  })
  it('una dirección que no es http(s) no se muestra como imagen ni video', () => {
    const m = motor()
    ;(m.artefactos as Record<string, unknown>).imagenes_clave = { datos: { propuestas: [{ id: 'P2', planos: [{ n: 1, imagenes: ['javascript:alert(1)', 'https://img/ok.png'] }] }] } }
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, m, PASOS)!.lista[1].planos[0]).toMatchObject({ imagen_url: 'https://img/ok.png', imagenes: ['https://img/ok.png'] })
    ;(m.artefactos as Record<string, unknown>).borrador_video = { datos: { propuestas: [{ id: 'P2', url: 'javascript:alert(1)' }] } }
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, m, PASOS)!.lista[1].video_url).toBeNull()
  })
  it('(CC5) lo que la mesa no escribió va null, nunca 0 ni texto vacío; el nombre cae al id', () => {
    const m = motor()
    ;(m.artefactos as Record<string, any>).propuestas_video.datos.propuestas = [{ id: 'P1', nombre: '  ', concepto: '', segundos: 0, red: '', objetivo: undefined, por_que: '  ', guion: { segundos: 0, planos: [] } }]
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, m, PASOS)!.lista[0]).toMatchObject({ nombre: 'P1', concepto: null, segundos: null, red: null, objetivo: null, por_que: null })
    ;(m.artefactos as Record<string, any>).propuestas_video.datos.propuestas[0].guion.segundos = 12
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, m, PASOS)!.lista[0].segundos).toBe(12)
  })
  it('sin propuestas guardadas no hay tarjeta', () => {
    expect(propuestasDeLaDecision({ id: E1, brief_id: 'b' }, { artefactos: {} }, PASOS)).toBeNull()
  })
})

describe('la fuente en `leerDecisiones`', () => {
  it('🔴 un encargo parado en el dueño aparece como decisión «propuestas» con su ficha válida (Aprobar + Pedir cambios, detiene el video, sin fecha límite)', async () => {
    const db = base().semilla('oficina_turnos', [turno(E1)]).semilla('oficina_encargos', [encargo(E1)])
    const r = await leerDecisiones(ctx(db))
    const d = r.decisiones.find((x) => x.tipo === 'propuestas')!
    expect(d).toMatchObject({ id: E1, tipo: 'propuestas', fuente: 'oficina_turnos', client_id: C1, cliente: 'Náufrago', titulo: TITULO_PROPUESTAS, desde: '2026-11-16T22:40:00Z', vence: null, detiene: true, decidir: { ruta: null, accion: 'propuestas-aprobar' } })
    expect(d.propuestas?.lista).toHaveLength(2)
    expect(d.criticos).toEqual(['Solo lo que apruebes se fabrica, en máxima calidad'])
    expect(d.ficha!.decisivo).toEqual([{ largo: 'Solo lo que apruebes se fabrica, en máxima calidad' }])
    expect(d.para_que_corto && d.destraba_corto).toBeTruthy()
    expect(d.ficha).not.toBeNull()
    expect(problemasDeLaFicha(d.ficha!)).toEqual([])
    expect(d.ficha!.acciones).toEqual([
      { verbo: 'aprobar', principal: true, destino: 'propuestas-aprobar' },
      { verbo: 'pedir_cambios', pide: { que: 'texto', obligatorio: true }, destino: 'propuestas-cambios' },
    ])
    expect(d.ficha!.detiene).toEqual({ que: QUE_SE_DETIENE_EL_VIDEO })
    expect(d.ficha!.espera).toMatchObject({ sin_limite: true })
    expect(d.ficha!.departamento.oficina).toBe('marketing')
    expect(r.fuentes.filter((f) => f.fuente === 'oficina_turnos' || f.fuente === 'oficina_encargos').every((f) => f.estado === 'ok')).toBe(true)
  })
  it('sin rondas de cambios la ficha solo ofrece Aprobar (la tarjeta esconde «Pedir cambios»)', async () => {
    const db = base().semilla('oficina_turnos', [turno(E1)]).semilla('oficina_encargos', [encargo(E1, { estado_del_motor: motor({ vueltas: { aprobar_propuestas: 2 } }) })])
    const d = (await leerDecisiones(ctx(db))).decisiones.find((x) => x.tipo === 'propuestas')!
    expect(d.propuestas?.quedan_vueltas).toBe(0)
    expect(d.ficha!.acciones.map((a) => a.verbo)).toEqual(['aprobar'])
  })
  it('se omiten: los ensayos (se cuentan), los clientes de práctica, los encargos ya cerrados y los turnos que no son del dueño o no corren', async () => {
    const db = base()
      .semilla('oficina_turnos', [turno(E1), turno(E2), turno(E3), turno(E1, { tipo: 'agente', n: 4 }), turno(E2, { estado: 'hecho', n: 6 })])
      .semilla('oficina_encargos', [encargo(E1, { dry_run: true }), encargo(E2, { client_id: PRAC }), encargo(E3, { estado: 'cerrado' })])
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.filter((x) => x.tipo === 'propuestas')).toEqual([])
    expect(r.omitidas.ensayos).toBeGreaterThanOrEqual(1)
    expect(r.omitidas.clientes_de_practica).toBeGreaterThanOrEqual(1)
  })
  it('si la tabla de turnos falla, se DECLARA (no se lee como «no hay nada») y la lista no se marca completa', async () => {
    const db = base().semilla('oficina_encargos', [encargo(E1)])
    const from = db.from.bind(db)
    db.from = ((t: string) => (t === 'oficina_turnos' ? { select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'caída', code: 'XX000' } }) }) }) }) } : from(t))) as unknown as typeof db.from
    const r = await leerDecisiones(ctx(db))
    expect(r.fuentes.find((f) => f.fuente === 'oficina_turnos')).toMatchObject({ estado: 'error' })
    expect(r.completo).toBe(false)
  })
})
