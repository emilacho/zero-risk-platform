/**
 * COLATERALES 2d · pieza B · la revisión de los retoques y su vuelta (opción 1 de Lenovo 02:15Z · líneas 1-3 de CC7 · líneas B de CC6 en la certificación de #1024).
 * Dos clientes de rubros distintos, con extractos REALES: Náufrago (restaurante · gran idea en markdown) y el B2B industrial (estrategia en JSON).
 * La base falsa rechaza columnas que su migración no crea y updates sin `grant update`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { baseFalsa } from './base-falsa'
import { almacenDeColaterales, type NuevaEdicion, type NuevoRetoque } from '../almacen'
import { aplicarAprobados, type EscritorDeDocumento } from '../aplicar'
import { TOPE_DE_LA_REVISION_USD, type GastoDelDia, type PuertosDelTurno } from '../turno'
import { cerrarSiNoQuedaNada, duenoDelPendiente, motivoDePendiente, recibirVueltaColateral, revisarLaEdicion, RUTA_DE_VUELTA_DE_COLATERALES, type EntradaDeRevisionColateral, type ResultadoDeAbrirColateral } from '../vuelta'
import type { Documento } from '../../cadena/dependencias-de-documentos'

const CLI_A = 'a0000000-0000-4000-8000-00000000000a'
const CLI_B = 'b0000000-0000-4000-8000-00000000000b'
const CAMP_A = 'ca000000-0000-4000-8000-0000000000ca'
const CAMP_B = 'cb000000-0000-4000-8000-0000000000cb'

// A · Náufrago: el dueño cambió el insight del brief; la gran idea lo cita literal
const ANTES_A = 'sabe que el bueno viene de la costa'
const DESPUES_A = 'sabe que el bueno viene de la playa'
const EDIC_A: NuevaEdicion = { client_id: CLI_A, documento: 'brief', documento_ref: CAMP_A, version_base: '2', seccion: 'Insight', antes: ANTES_A, despues: DESPUES_A, llave: 'llave-vuelta-A' }
// B · B2B industrial: el dueño cambió el plan; la estrategia repite la meta de la fase 1
const EST_B = JSON.parse(B.estrategia) as { fases: Array<{ objetivo: string }> }
const OBJ_B = EST_B.fases[0].objetivo
const EDIC_B: NuevaEdicion = { client_id: CLI_B, documento: 'plan', documento_ref: 'plan-b-1', version_base: '1', seccion: 'canales', antes: 'llevar las consultas entrantes a WhatsApp', despues: 'llevar las consultas entrantes a WhatsApp y al formulario', llave: 'llave-vuelta-B' }

const pedazo = (id: string, documento: Documento, texto: string, inicio: number, ruta: string | null, seccion: string) => ({ id, documento, seccion, texto, inicio, ruta })
const RET_A: NuevoRetoque[] = [
  { pedazo: pedazo('C1', 'gran_idea', ANTES_A, A.gran_idea_v3.indexOf(ANTES_A), null, 'Por qué funciona'), documento_ref: CAMP_A, version_base: '3', afecta: true, razon: 'cita el insight', antes: ANTES_A, despues: DESPUES_A, porque: 'la gran idea cita literal el insight del brief', estado: 'propuesto' },
]
const RET_B: NuevoRetoque[] = [
  { pedazo: pedazo('C1', 'estrategia', OBJ_B, -1, 'fases[0].objetivo', 'fases.0.objetivo'), documento_ref: CAMP_B, version_base: '1', afecta: true, razon: 'repite el canal', antes: 'llevar las consultas entrantes a WhatsApp', despues: 'llevar las consultas entrantes a WhatsApp y al formulario', porque: 'la fase nombra los canales del plan', estado: 'propuesto' },
  { pedazo: pedazo('C2', 'plan', 'consultas', 10, null, 'resumen'), documento_ref: 'plan-b-1', version_base: '1', afecta: true, razon: 'el resumen del plan', antes: 'consultas', despues: 'consultas y formularios', porque: 'el resumen nombra el canal', estado: 'propuesto' },
]

function escritorFalso(texto: string, version: string) {
  const escritas: string[] = []
  const e: EscritorDeDocumento = {
    leerVigente: async () => ({ texto, version }),
    leerVersion: async () => texto,
    escribirSiSigue: async (_ref, base, nuevo) => { if (base !== version) return null; escritas.push(nuevo); return String(Number(version) + 1) },
  }
  return { e, escritas }
}

function armar(o: { abrir?: ResultadoDeAbrirColateral | Error; tope?: number | null | Error; gasto?: Partial<GastoDelDia> | Error } = {}) {
  const { db, tablas } = baseFalsa()
  const almacen = almacenDeColaterales(db)
  const gi = escritorFalso(A.gran_idea_v3, '3')
  const est = escritorFalso(B.estrategia, '1')
  const abrir = vi.fn(async (_e: EntradaDeRevisionColateral): Promise<ResultadoDeAbrirColateral> => { if (o.abrir instanceof Error) throw o.abrir; return o.abrir ?? { estado: 'esperando', revision_id: 'rev-1' } })
  const gasto = vi.fn(async (_c: string, _s: string): Promise<GastoDelDia> => { if (o.gasto instanceof Error) throw o.gasto; return { recibos: 0, en_vuelo: 0, revisiones: 0, revisiones_abiertas: 0, ...(o.gasto ?? {}) } })
  const tope = vi.fn(async () => { if (o.tope instanceof Error) throw o.tope; return o.tope === undefined ? 5 : o.tope })
  const activas = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
  const aplicar = vi.fn((id: string) => aplicarAprobados({ almacen, escritores: { gran_idea: gi.e, estrategia: est.e }, leerFilasActivas: async () => activas }, id))
  const P: PuertosDelTurno = {
    almacen, filasActivas: async () => activas, piezasPorPublicar: async () => ({ frenan: [], se_asumen_publicadas: [] }), documentos: async () => ({}),
    campanaDelCliente: async () => true, gastoDelDia: gasto, topeDiario: tope, abrirRevisionColateral: abrir, aplicar,
  }
  return { P, almacen, tablas, abrir, gasto, tope, aplicar, gi, est }
}
async function sembrar(k: ReturnType<typeof armar>, ed: NuevaEdicion, rs: NuevoRetoque[]) {
  const { edicion } = await k.almacen.crearEdicion(ed)
  await k.almacen.pasarEdicion(edicion.id, 'recibida', 'en_curso')
  await k.almacen.guardarRetoques(edicion.id, rs)
  const ids = k.tablas.colaterales_retoques.filter((t) => t.edicion_id === edicion.id).map((t) => String(t.id))
  return { id: edicion.id, ids, edicion: (await k.almacen.edicion(edicion.id))! }
}
const est = (k: ReturnType<typeof armar>, id: string) => k.tablas.colaterales_retoques.find((t) => t.id === id)
const estEd = (k: ReturnType<typeof armar>, id: string) => k.tablas.colaterales_ediciones.find((t) => t.id === id)?.estado
const salida = (o: Record<string, unknown>) => ({ salida: { revision_id: 'rev-1', artifact_type: 'colateral', resultado: 'limpia', simulado: false, ...o } })
const ver = (xs: Array<{ id: string; veredicto: string; razon?: string }>, extra: Record<string, unknown> = {}) => ({ veredictos: xs, sin_veredicto: [], inventados: [], ...extra })

describe('abrir la revisión al entregar', () => {
  it('Náufrago: UNA revisión `colateral` con la edición del dueño y cada retoque por SU id de fila; queda atada y la edición sigue en curso', async () => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_A, RET_A)
    const r = await revisarLaEdicion(k.P, edicion)
    expect(r).toEqual({ estado: 'esperando', revision_id: 'rev-1', atados: 1 })
    expect(k.abrir).toHaveBeenCalledTimes(1)
    const s = k.abrir.mock.calls[0][0]
    expect(s).toMatchObject({ artifact_type: 'colateral', artifact_id: id, client_id: CLI_A, journey_id: null })
    expect(s.payload).toMatchObject({ dry_run: false, version: 1, edicion_del_dueno: { documento: 'brief', seccion: 'Insight', antes: ANTES_A, despues: DESPUES_A } })
    expect((s.payload.retoques as Array<{ id: string }>).map((x) => x.id)).toEqual(ids)
    expect(String(s.payload.texto)).toContain(DESPUES_A)
    expect(est(k, ids[0])).toMatchObject({ estado: 'propuesto', revision_id: 'rev-1' })
    expect(estEd(k, id)).toBe('en_curso')
  })
  it.each([
    ['sin saldo (lo de hoy + esta revisión pasa el tope)', { gasto: { recibos: 4.8 } }, 'sin saldo para la revisión'],
    ['las revisiones de hoy cuentan', { gasto: { revisiones: 4.8 } }, 'sin saldo para la revisión'],
    ['las revisiones abiertas reservan su tope', { gasto: { revisiones_abiertas: Math.ceil(4.71 / TOPE_DE_LA_REVISION_USD) } }, 'sin saldo para la revisión'],
    ['sin tope definido', { tope: null }, 'no tiene tope diario'],
    ['el tope no se puede leer', { tope: new Error('base caída') }, 'no se pudo leer el tope diario'],
    ['el gasto no se puede leer', { gasto: new Error('base caída') }, 'no se pudo leer el gasto del día'],
    ['la jefatura no abre (la fila está apagada)', { abrir: { estado: 'no_abre' as const, motivo: 'tipo inactivo' } }, 'la jefatura no abrió la revisión (tipo inactivo)'],
    ['la jefatura falla', { abrir: { estado: 'error' as const, motivo: 'la jefatura contestó 500' } }, 'la jefatura no abrió'],
    ['el abridor lanza', { abrir: new Error('red caída') }, 'la jefatura no abrió la revisión (red caída)'],
    ['la jefatura no da número', { abrir: { estado: 'esperando' as const, revision_id: '' } }, 'no devolvió el número'],
  ])('🔴 %s → los retoques quedan `pendiente` con su dueño, nada se aplica y la edición cierra', async (_n, o, motivo) => {
    const k = armar(o as Parameters<typeof armar>[0])
    const { id, ids, edicion } = await sembrar(k, EDIC_A, RET_A)
    const r = await revisarLaEdicion(k.P, edicion)
    expect(r.estado).toBe('sin_revision')
    expect(est(k, ids[0])?.estado).toBe('pendiente')
    expect(String(est(k, ids[0])?.motivo)).toContain(motivo)
    expect(String(est(k, ids[0])?.motivo)).toContain('lo decide jefe-marketing')
    expect(k.gi.escritas).toEqual([])
    expect(estEd(k, id)).toBe('lista')
  })
  it('justo en el tope sí cabe; un centavo más, no (lo de esta edición ya está en lo de hoy: se pide sin excluirla)', async () => {
    const cabe = armar({ gasto: { recibos: 5 - TOPE_DE_LA_REVISION_USD } })
    const a = await sembrar(cabe, EDIC_A, RET_A)
    expect((await revisarLaEdicion(cabe.P, a.edicion)).estado).toBe('esperando')
    expect(cabe.gasto).toHaveBeenCalledWith(CLI_A, '')
    const no = armar({ gasto: { recibos: 5 - TOPE_DE_LA_REVISION_USD + 0.01 } })
    const b = await sembrar(no, EDIC_A, RET_A)
    expect((await revisarLaEdicion(no.P, b.edicion)).estado).toBe('sin_revision')
    expect(no.abrir).not.toHaveBeenCalled()
  })
  it('si la revisión ya había cerrado (la edición volvió a entregar), su salida se aplica en el acto', async () => {
    const k = armar()
    const { ids, edicion } = await sembrar(k, EDIC_A, RET_A)
    k.abrir.mockResolvedValueOnce({ estado: 'cerrada', salida: salida({ veredictos: ver([{ id: ids[0], veredicto: 'aprueba' }]) }).salida })
    const r = await revisarLaEdicion(k.P, edicion)
    expect(r).toMatchObject({ estado: 'juzgada', aprobados: 1, cierre: { estado: 'lista', aplicados: 1 } })
    expect(est(k, ids[0])?.estado).toBe('aplicado')
  })
  it('una revisión ya atada no se pisa: solo se atan los `propuesto` sin revisión', async () => {
    const k = armar()
    const { ids, edicion } = await sembrar(k, EDIC_B, RET_B)
    expect(await k.almacen.atarRevision([ids[0]], 'rev-vieja')).toBe(1)
    const r = await revisarLaEdicion(k.P, edicion)
    expect(r).toMatchObject({ estado: 'esperando', atados: 1 })
    expect(est(k, ids[0])?.revision_id).toBe('rev-vieja')
    expect(est(k, ids[1])?.revision_id).toBe('rev-1')
    expect(await k.almacen.atarRevision([ids[1]], 'otra')).toBe(0)
  })
  it('solo se atan los `propuesto`: un retoque ya movido (aprobado, pendiente, rechazado) sin revisión no se ata', async () => {
    const k = armar()
    const { ids } = await sembrar(k, EDIC_A, RET_A)
    for (const a of ['aprobado', 'pendiente', 'rechazado'] as const) {
      expect(await k.almacen.pasarRetoque(ids[0], est(k, ids[0])?.estado as never, a)).toBe(true)
      expect(await k.almacen.atarRevision([ids[0]], 'rev-x')).toBe(0)
      expect(est(k, ids[0])?.revision_id ?? null).toBe(null)
    }
  })
})

describe('🔴 la vuelta (líneas de CC7 y CC6)', () => {
  it('B2B: aprueba → se aplica en la estrategia; rechaza → `rechazado` con la razón (el documento sigue como estaba); la edición pasa a lista', async () => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_B, [RET_B[0]])
    await revisarLaEdicion(k.P, edicion)
    const r = await recibirVueltaColateral(k.P, { marcas: {}, ...salida({ artifact_id: id, veredictos: ver([{ id: ids[0], veredicto: 'aprueba', razon: 'fiel' }]) }) })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ accion: 'juzgada', aprobados: 1, rechazados: 0, pendientes: 0, cierre: { estado: 'lista', aplicados: 1 } })
    expect(est(k, ids[0])?.estado).toBe('aplicado')
    expect(k.est.escritas.length).toBe(1)
    expect(k.est.escritas[0]).toContain('WhatsApp y al formulario')
    expect(estEd(k, id)).toBe('lista')
    const k2 = armar()
    const x = await sembrar(k2, EDIC_A, RET_A)
    await revisarLaEdicion(k2.P, x.edicion)
    await recibirVueltaColateral(k2.P, salida({ artifact_id: x.id, veredictos: ver([{ id: x.ids[0], veredicto: 'rechaza', razon: 'cambia un hecho' }]) }))
    expect(est(k2, x.ids[0])).toMatchObject({ estado: 'rechazado', motivo: 'rechazado por la jefatura: cambia un hecho' })
    expect(k2.gi.escritas).toEqual([])
    expect(estEd(k2, x.id)).toBe('lista')
  })
  it('🔴 línea 3 de CC7: un veredicto TARDÍO (la edición ya no está en curso) no aplica nada', async () => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_A, RET_A)
    await revisarLaEdicion(k.P, edicion)
    await k.almacen.pasarEdicion(id, 'en_curso', 'fallida', { nota: 'el barrido' })
    const r = await recibirVueltaColateral(k.P, salida({ artifact_id: id, veredictos: ver([{ id: ids[0], veredicto: 'aprueba' }]) }))
    expect(r.cuerpo).toMatchObject({ accion: 'tarde', estado: 'fallida' })
    expect(est(k, ids[0])?.estado).toBe('propuesto')
    expect(k.aplicar).not.toHaveBeenCalled()
  })
  it.each([
    ['incompleta_por_tope', { resultado: 'incompleta_por_tope' }, 'terminó «incompleta_por_tope»'],
    ['fallida', { resultado: 'fallida' }, 'terminó «fallida»'],
    ['simulada (seco)', { simulado: true }, 'simulada'],
    ['sin la marca de simulada', { simulado: undefined }, 'simulada'],
  ])('🔴 línea 2 y 4 de CC6: resultado %s → TODO pendiente aunque traiga veredictos que aprueban', async (_n, o, motivo) => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_A, RET_A)
    await revisarLaEdicion(k.P, edicion)
    await recibirVueltaColateral(k.P, salida({ artifact_id: id, veredictos: ver([{ id: ids[0], veredicto: 'aprueba' }]), ...o }))
    expect(est(k, ids[0])?.estado).toBe('pendiente')
    expect(String(est(k, ids[0])?.motivo)).toContain(motivo)
    expect(k.gi.escritas).toEqual([])
  })
  it('🔴 línea 3 de CC6: lo pedido que NO está en los veredictos es pendiente, aunque `sin_veredicto` venga vacío; los veredictos se re-verifican', async () => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_B, RET_B)
    await revisarLaEdicion(k.P, edicion)
    // el segundo no viene; un id inventado y uno de otra revisión no cuentan
    await recibirVueltaColateral(k.P, salida({ artifact_id: id, veredictos: ver([{ id: ids[0], veredicto: 'aprueba' }, { id: 'inventado', veredicto: 'aprueba' }], { sin_veredicto: [] }) }))
    expect(est(k, ids[0])?.estado).toBe('aplicado')
    expect(est(k, ids[1])?.estado).toBe('pendiente')
    expect(String(est(k, ids[1])?.motivo)).toContain('no dio un veredicto válido')
    // un rechaza sin razón tampoco cuenta (se re-verifica, no se confía en la salida)
    const k2 = armar()
    const y = await sembrar(k2, EDIC_A, RET_A)
    await revisarLaEdicion(k2.P, y.edicion)
    await recibirVueltaColateral(k2.P, salida({ artifact_id: y.id, veredictos: ver([{ id: y.ids[0], veredicto: 'rechaza', razon: '' }]) }))
    expect(est(k2, y.ids[0])?.estado).toBe('pendiente')
  })
  it('🔴 solo se tocan los retoques de ESA revisión; repetir la vuelta no cambia nada (idempotente)', async () => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_B, RET_B)
    await k.almacen.atarRevision([ids[1]], 'rev-otra')
    await revisarLaEdicion(k.P, edicion)
    const v = salida({ artifact_id: id, veredictos: ver([{ id: ids[0], veredicto: 'aprueba' }, { id: ids[1], veredicto: 'aprueba' }]) })
    const r1 = await recibirVueltaColateral(k.P, v)
    expect(r1.cuerpo).toMatchObject({ aprobados: 1, cierre: { estado: 'esperando' } })
    expect(est(k, ids[1])?.estado).toBe('propuesto')
    const antes = structuredClone(k.tablas)
    const r2 = await recibirVueltaColateral(k.P, v)
    expect(r2.cuerpo).toMatchObject({ aprobados: 0, rechazados: 0, pendientes: 0 })
    expect(k.tablas).toEqual(antes)
  })
  it('🔴 regla de Emilio: lo pendiente del manual y del plan lo decide Emilio; todo lo demás, jefe-marketing (y lo dice la nota)', async () => {
    expect(duenoDelPendiente('manual')).toBe('Emilio')
    expect(duenoDelPendiente('plan')).toBe('Emilio')
    for (const d of ['estrategia', 'brief', 'gran_idea', 'calendario', 'pieza']) expect(duenoDelPendiente(d)).toBe('jefe-marketing')
    expect(motivoDePendiente('x', 'plan')).toBe('x · lo decide Emilio')
    const k = armar({ abrir: { estado: 'no_abre', motivo: 'apagada' } })
    const { id, ids, edicion } = await sembrar(k, EDIC_B, RET_B)
    const r = await revisarLaEdicion(k.P, edicion)
    expect(String(est(k, ids[0])?.motivo)).toContain('lo decide jefe-marketing')
    expect(String(est(k, ids[1])?.motivo)).toContain('lo decide Emilio')
    expect(r).toMatchObject({ cierre: { pendientes: { Emilio: [ids[1]], 'jefe-marketing': [ids[0]] } } })
    expect(k.tablas.colaterales_ediciones.find((t) => t.id === id)?.nota).toBe('aplicados 0 · pendientes: Emilio 1, jefe-marketing 1')
  })
  it.each([
    ['sin salida', {}, 400],
    ['otro tipo', salida({ artifact_type: 'registro', artifact_id: 'x' }), 400],
    ['sin revision_id', salida({ revision_id: '', artifact_id: 'x' }), 400],
    ['sin artifact_id', salida({}), 400],
    ['sin resultado', salida({ artifact_id: 'x', resultado: undefined }), 400],
    ['edición que no existe', salida({ artifact_id: 'no-existe' }), 404],
  ])('entrada %s → %s', async (_n, c, st) => {
    expect((await recibirVueltaColateral(armar().P, c as Record<string, unknown>)).status).toBe(st)
  })
})

describe('🔴 cerrar solo con la edición en curso', () => {
  it('si la edición dejó de estar en curso (el barrido la cerró), cerrar no aplica nada ni la pasa a lista', async () => {
    const k = armar()
    const { id, ids, edicion } = await sembrar(k, EDIC_A, RET_A)
    await revisarLaEdicion(k.P, edicion)
    await k.almacen.pasarRetoque(ids[0], 'propuesto', 'aprobado', { motivo: 'fiel' })
    await k.almacen.pasarEdicion(id, 'en_curso', 'fallida', { nota: 'el barrido' })
    expect(await cerrarSiNoQuedaNada(k.P, id)).toEqual({ estado: 'ya_cerrada' })
    expect(k.aplicar).not.toHaveBeenCalled()
    expect(estEd(k, id)).toBe('fallida')
  })
})

describe('ataduras', () => {
  it('el tope de la revisión es el de la fila `colateral` de la jefatura (migración)', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202611111200_jefatura_politica_colateral.sql'), 'utf8')
    expect(sql).toContain(`${TOPE_DE_LA_REVISION_USD.toFixed(2)}`)
  })
  it('la ruta de la vuelta vive bajo /api/jefatura/ (J4 solo entrega ahí) y existe', () => {
    expect(RUTA_DE_VUELTA_DE_COLATERALES.startsWith('api/jefatura/')).toBe(true)
    expect(fs.existsSync(path.join(process.cwd(), 'src/app', RUTA_DE_VUELTA_DE_COLATERALES.replace(/^api/, 'api'), 'route.ts'))).toBe(true)
  })
})
