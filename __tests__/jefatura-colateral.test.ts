/**
 * LA REVISIÓN COLATERAL (11-nov · colaterales 2d parte 4 · opción 1 de Lenovo 02:15Z · líneas 1-3 de CC7 y 1-7 de CC6).
 * Juzgar = el jefe (aquí, el molde o la respuesta de la prueba); atar cada veredicto a un id pedido = código. Nada se aprueba por omisión; el manual (cimiento) no se juzga.
 * Dos clientes de rubros distintos, con extractos REALES: Náufrago (restaurante · brief → gran idea) y Seguridad Industrial (B2B · plan → estrategia).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { almacenEnMemoria, correr, FILAS_DE_POLITICA, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { abrirRevision } from '../src/lib/jefatura/revision/orquestador'
import { politicaDeFila, plantillaDePolitica } from '../src/lib/jefatura/revision/politicas'
import { erroresDeLaEntradaColateral, textoDeLosRetoques, verificarVeredictos, type EdicionDelDueno, type RetoqueParaJuzgar } from '../src/lib/jefatura/revision/colateral'
import A from '../src/lib/colaterales/__tests__/__fixtures__/naufrago-2026-11-10-extractos.json'
import B from '../src/lib/colaterales/__tests__/__fixtures__/b2b-industrial-2026-11-10.json'

const FILA = FILAS_DE_POLITICA.colateral
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/202611111200_jefatura_politica_colateral.sql'), 'utf8')

// A · Náufrago: el dueño cambió el insight del brief; la gran idea lo cita literal
const ED_A: EdicionDelDueno = { documento: 'brief', seccion: 'Insight', antes: 'sabe que el bueno viene de la costa', despues: 'sabe que el bueno se come frente al mar, en la playa' }
const RET_A: RetoqueParaJuzgar[] = [{ id: 'gi-por-que-funciona-1', documento: 'gran_idea', seccion: 'Por qué funciona', antes: 'sabe que el bueno viene de la costa', despues: 'sabe que el bueno se come frente al mar, en la playa', porque: 'la gran idea cita literal el insight del brief' }]
// B · B2B industrial: el dueño cambió la condición del canal en el plan; la estrategia la repite
const EST_B = JSON.parse(B.estrategia) as { fases: Array<{ objetivo: string }> }
const ED_B: EdicionDelDueno = { documento: 'plan', seccion: 'canales', antes: 'activar cuando exista perfil LinkedIn de empresa creado y validado', despues: 'activar cuando exista perfil LinkedIn de empresa creado, validado y con su primera publicación' }
const RET_B: RetoqueParaJuzgar[] = [
  { id: 'est-fase-1', documento: 'estrategia', seccion: 'fases.0.objetivo', antes: EST_B.fases[0].objetivo, despues: `${EST_B.fases[0].objetivo} (LinkedIn solo con perfil validado y su primera publicación)`, porque: 'la fase nombra los canales del plan' },
  { id: 'est-fase-2', documento: 'estrategia', seccion: 'fases.1.objetivo', antes: 'perfil validado', despues: 'perfil validado y 3 publicaciones', porque: 'misma condición' },
]

const mundo = () => {
  const mem = almacenEnMemoria({ filas: { ...FILAS_DE_POLITICA }, activas: ['colateral'], config: { estado: 'ensayo', tipos_activos: ['colateral'], clientes_ensayo: ['cliente-prueba'] } })
  return puertosDePrueba({ almacen: mem })
}
const sobreDe = (ed: EdicionDelDueno, rs: RetoqueParaJuzgar[], o: { dry_run?: boolean; id?: string; simulacion?: Record<string, unknown> } = {}) =>
  sobre('colateral', { id: o.id ?? 'edicion-1:gran_idea', texto: textoDeLosRetoques(ed, rs), dry_run: o.dry_run ?? false, ...(o.simulacion ? { simulacion: o.simulacion } : {}), payload: { edicion_del_dueno: ed, retoques: rs, productores: [{ donde: '*', agente: 'content-creator' }] } })
const veredictos = (xs: Array<{ id: string; veredicto: string; razon?: string }>) => JSON.stringify({ veredictos: xs })
type Salida = { resultado: string; veredictos: { veredictos: Array<{ id: string; veredicto: string; razon: string }>; sin_veredicto: string[]; inventados: string[] } }

describe('🔴 la fila de la política se lee y nace apagada', () => {
  it('la fila de la migración es válida, apagada, sin voto y sin re-entrega', () => {
    const r = politicaDeFila(FILA)
    expect(r.ok).toBe(true)
    if (r.ok) expect([r.politica.is_active, r.politica.reentrega, r.politica.revisor_fondo]).toEqual([false, 'ninguna', 'editor_en_jefe'])
  })
  it('la fila de la prueba es la de la migración', () => {
    for (const x of ["'colateral', 'revision', false, false", "'editor_en_jefe', false, NULL", "'siguiente_paso', 'ninguna'", '{"revision_fondo":0.25}', 'ARRAY[]::text[], 0.30', '[{"donde":"*","agente":"content-creator"}]']) expect(SQL).toContain(x)
    expect(SQL).toMatch(/NACE INACTIVA', false,/)
  })
  it('la plantilla: UN paso del jefe (editor_en_jefe) y el cierre · sin corrección, sin GPT, sin voto · el revisor no es productor', () => {
    const r = politicaDeFila(FILA)
    if (!r.ok) throw new Error(r.error)
    const pl = plantillaDePolitica(r.politica, r.politica.productores, 1)
    expect(pl.pasos.map((p) => [p.clave, p.quien])).toEqual([['revision_colateral', 'editor_en_jefe'], ['cierre', 'jefatura']])
    expect(pl.limites.max_rondas).toBe(1)
    expect(r.politica.productores.map((p) => p.agente)).not.toContain(r.politica.revisor_fondo)
  })
})

describe('🔴 la entrada (línea 1 de CC7: el cimiento no se juzga)', () => {
  it('un retoque sobre el manual → 400 (va a una persona, nunca al veredicto de un jefe)', async () => {
    const { P } = mundo()
    const r = await abrirRevision(P, sobreDe(ED_A, [{ ...RET_A[0], documento: 'manual' }]))
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.cuerpo)).toMatch(/manual es cimiento/)
  })
  it.each([
    ['sin edición del dueño', { retoques: RET_A }],
    ['sin retoques', { edicion_del_dueno: ED_A, retoques: [] }],
    ['ids repetidos', { edicion_del_dueno: ED_A, retoques: [RET_A[0], RET_A[0]] }],
    ['documento desconocido', { edicion_del_dueno: ED_A, retoques: [{ ...RET_A[0], documento: 'folleto' }] }],
    ['antes = después', { edicion_del_dueno: ED_A, retoques: [{ ...RET_A[0], despues: RET_A[0].antes }] }],
    ['retoque sin porque', { edicion_del_dueno: ED_A, retoques: [{ ...RET_A[0], porque: undefined }] }],
  ])('%s → error de entrada', (_n, p) => expect(erroresDeLaEntradaColateral(p as Record<string, unknown>).length).toBeGreaterThan(0))
  it('la entrada buena de los dos clientes no da errores', () => {
    expect(erroresDeLaEntradaColateral({ edicion_del_dueno: ED_A, retoques: RET_A })).toEqual([])
    expect(erroresDeLaEntradaColateral({ edicion_del_dueno: ED_B, retoques: RET_B })).toEqual([])
  })
})

describe('🔴 el veredicto se ata por id (línea 2 de CC7): nada se aprueba por omisión', () => {
  const ids = ['a', 'b', 'c', 'd', 'e']
  const v = verificarVeredictos(ids, [
    { id: 'a', veredicto: 'aprueba' }, // aprueba sin razón: vale
    { id: 'b', veredicto: 'rechaza', razon: 'cambia un precio' },
    { id: 'c', veredicto: 'rechaza', razon: '  ' }, // rechaza sin razón: no cuenta
    { id: 'd', veredicto: 'aprueba', razon: 'ok' }, { id: 'd', veredicto: 'rechaza', razon: 'no' }, // se contradice: no cuenta
    { id: 'zz', veredicto: 'aprueba', razon: 'ok' }, // no se pidió
  ])
  it('cada id pedido con un veredicto válido; lo demás queda SIN veredicto; lo no pedido se descarta', () => {
    expect(v.veredictos).toEqual([{ id: 'a', veredicto: 'aprueba', razon: '' }, { id: 'b', veredicto: 'rechaza', razon: 'cambia un precio' }])
    expect(v.sin_veredicto).toEqual(['c', 'd', 'e'])
    expect(v.inventados).toEqual(['zz'])
  })
  it('un veredicto que no es aprueba ni rechaza, o una lista que no es lista, no aprueba nada', () => {
    expect(verificarVeredictos(['a'], [{ id: 'a', veredicto: 'aprobado' }]).sin_veredicto).toEqual(['a'])
    expect(verificarVeredictos(['a'], [{ id: 'a', veredicto: 'aprobado', razon: 'parece fiel' }]).sin_veredicto).toEqual(['a']) // ni con razón
    expect(verificarVeredictos(['a', 'b'], 'todo bien')).toEqual({ veredictos: [], sin_veredicto: ['a', 'b'], inventados: [] })
  })
})

describe('🔴 la corrida entera (dos clientes)', () => {
  it('A · Náufrago: el jefe recibe la edición y el retoque con su id; aprueba; la salida trae el veredicto verificado', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(ED_A, RET_A), ({ paso }) => (paso === 'revision_colateral' ? { texto: veredictos([{ id: 'gi-por-que-funciona-1', veredicto: 'aprueba', razon: 'lleva justo el cambio del dueño' }]), costo_usd: 0.03 } : undefined))
    expect(d.turnos.map((t) => [t.paso, t.agente])).toEqual([['revision_colateral', 'editor_en_jefe']])
    const task = String(d.turnos[0].pedido.task)
    for (const x of ['[gi-por-que-funciona-1]', ED_A.antes, ED_A.despues, 'ni reescribes nada', '"aprueba|rechaza"']) expect(task).toContain(x)
    expect(A.gran_idea_v3).toContain(RET_A[0].antes) // el retoque sale de un texto real
    const s = d.final.cuerpo.salida as Salida
    expect(s.resultado).toBe('limpia')
    expect(s.veredictos).toEqual({ veredictos: [{ id: 'gi-por-que-funciona-1', veredicto: 'aprueba', razon: 'lleva justo el cambio del dueño' }], sin_veredicto: [], inventados: [] })
  })
  it('B · B2B industrial: uno aprueba, otro rechaza con razón y uno inventado se descarta', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(ED_B, RET_B, { id: 'edicion-b:estrategia' }), () => ({ texto: veredictos([{ id: 'est-fase-1', veredicto: 'aprueba', razon: 'fiel' }, { id: 'est-fase-2', veredicto: 'rechaza', razon: 'agrega «3 publicaciones», que el dueño no dijo' }, { id: 'est-fase-9', veredicto: 'aprueba', razon: 'x' }]) }))
    const s = d.final.cuerpo.salida as Salida
    expect(s.veredictos.veredictos.map((x) => [x.id, x.veredicto])).toEqual([['est-fase-1', 'aprueba'], ['est-fase-2', 'rechaza']])
    expect(s.veredictos.inventados).toEqual(['est-fase-9'])
  })
  it('🔴 el paso del jefe falla → revisión fallida y TODOS sin veredicto (nunca se aprueba por omisión · línea 5 de CC6)', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(ED_B, RET_B, { id: 'edicion-b2:estrategia' }), () => ({ error: 'el agente no respondió' }))
    const s = d.final.cuerpo.salida as Salida
    expect(s.resultado).toBe('fallida')
    expect(s.veredictos).toEqual({ veredictos: [], sin_veredicto: ['est-fase-1', 'est-fase-2'], inventados: [] })
  })
  it('🔴 formato roto dos veces → fallida y todos sin veredicto', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(ED_A, RET_A, { id: 'edicion-a2:gran_idea' }), () => ({ texto: 'esto no es json' }))
    expect(d.turnos).toHaveLength(2)
    const s = d.final.cuerpo.salida as Salida
    expect(s.resultado).toBe('fallida')
    expect(s.veredictos.sin_veredicto).toEqual(['gi-por-que-funciona-1'])
  })
  it('seco: el molde aprueba; con `uno_sin_veredicto` ese queda sin veredicto; con `inventa_uno` el inventado se descarta', async () => {
    const corridas = await Promise.all([undefined, 'uno_sin_veredicto', 'inventa_uno'].map(async (m, i) => {
      const { P } = mundo()
      const d = await correr(P, sobreDe(ED_B, RET_B, { id: `seco-${i}`, dry_run: true, ...(m ? { simulacion: { veredictos: m } } : {}) }))
      return d.final.cuerpo.salida as Salida
    }))
    expect(corridas[0].veredictos).toEqual({ veredictos: [{ id: 'est-fase-1', veredicto: 'aprueba', razon: '(simulado) fiel a la edición' }, { id: 'est-fase-2', veredicto: 'aprueba', razon: '(simulado) fiel a la edición' }], sin_veredicto: [], inventados: [] })
    expect(corridas[1].veredictos.sin_veredicto).toEqual(['est-fase-1'])
    expect(corridas[2].veredictos.inventados).toEqual(['id-inventado'])
  })
  it('🔴 en seco el molde lo entrega SIEMPRE la ruta (el flujo del turno no necesita molde propio para este esquema)', async () => {
    const { P } = mundo()
    const r = await abrirRevision(P, sobreDe(ED_A, RET_A, { id: 'seco-molde', dry_run: true }))
    const pedido = (r.cuerpo.turno as { pedido: { molde?: { texto: string | null }; esquema?: string } }).pedido
    expect(typeof pedido.molde?.texto).toBe('string')
    expect(JSON.parse(String(pedido.molde?.texto)).veredictos.map((x: { id: string }) => x.id)).toEqual(['gi-por-que-funciona-1'])
  })
})
