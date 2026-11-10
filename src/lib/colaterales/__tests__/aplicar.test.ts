/**
 * Colaterales · tramo 2c (CC1 · certifica CC7) · aplicar y deshacer los retoques aprobados, sobre documentos REALES de dos clientes de rubros distintos:
 *   · A · restaurante · su gran idea en markdown (el retoque va por POSICIÓN)
 *   · B · B2B industrial · su plan en JSON (el retoque va por RUTA)
 * Los escritores son falsos (en memoria, con versiones); el historial usa la base falsa que rechaza columnas fuera de la migración.
 */
import { describe, it, expect } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { pedazosDe, type Pedazo } from '../red'
import { almacenDeColaterales, type NuevaEdicion } from '../almacen'
import { aplicarAprobados, deshacerEdicion, type EscritorDeDocumento } from '../aplicar'
import type { Documento } from '../../cadena/dependencias-de-documentos'
import { baseFalsa } from './base-falsa'

/** escritor en memoria: versiones por ref; escribir solo si la vigente sigue siendo la base */
function escritorFalso(inicial: Record<string, string>, o: { adelantarse?: boolean } = {}) {
  const versiones = new Map(Object.entries(inicial).map(([ref, texto]) => [ref, [{ version: '1', texto, motivo: 'original' }]]))
  const escrituras: { ref: string; base: string; motivo: string }[] = []
  const lecturasDeVersion: string[] = []
  const esc: EscritorDeDocumento = {
    async leerVigente(ref) { const v = versiones.get(ref); return v ? { texto: v.at(-1)!.texto, version: v.at(-1)!.version } : null },
    async leerVersion(ref, version) { lecturasDeVersion.push(version); return versiones.get(ref)?.find((x) => x.version === version)?.texto ?? null },
    async escribirSiSigue(ref, base, texto, motivo) {
      const v = versiones.get(ref)
      if (!v || o.adelantarse || v.at(-1)!.version !== base) return null
      const nueva = String(v.length + 1)
      v.push({ version: nueva, texto, motivo })
      escrituras.push({ ref, base, motivo })
      return nueva
    },
  }
  /** alguien (el dueño, otra corrida) escribe encima */
  const tocar = (ref: string, texto: string) => { const v = versiones.get(ref)!; v.push({ version: String(v.length + 1), texto, motivo: 'otro' }) }
  return { esc, versiones, escrituras, tocar, lecturasDeVersion }
}

const conId = (p: Omit<Pedazo, 'id'>, i: number): Pedazo => ({ id: `C${i + 1}`, ...p })
const PED_A = pedazosDe('gran_idea', A.gran_idea_v3).map(conId)
const PED_B = pedazosDe('plan', B.plan).map(conId)
const A_COSTA = PED_A.filter((p) => p.texto.includes('costa'))
const B_COND = PED_B.find((p) => p.texto.includes('creado y validado'))!

const EDIC_A: NuevaEdicion = { client_id: 'a', documento: 'brief', documento_ref: 'brief-a', version_base: '2', seccion: 'Insight', antes: 'costa', despues: 'playa', llave: 'a:brief:2:costa-playa' }
const EDIC_B: NuevaEdicion = { client_id: 'b', documento: 'manual', documento_ref: 'manual-b', version_base: '1', seccion: 'canales', antes: 'creado y validado', despues: 'creado, validado y con su primera publicación', llave: 'b:manual:1:cond' }
const TODAS: ReadonlySet<string> = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])

async function preparar(ed: NuevaEdicion, documento: Documento, ref: string, pedazos: Pedazo[], antes: string, despues: string, estado: 'aprobado' | 'propuesto' = 'aprobado') {
  const { db, tablas } = baseFalsa()
  const almacen = almacenDeColaterales(db)
  const { edicion } = await almacen.crearEdicion(ed)
  await almacen.guardarRetoques(edicion.id, pedazos.map((p) => ({ pedazo: p, documento_ref: ref, version_base: '1', afecta: true, razon: 'repite lo editado', antes, despues, porque: 'repite lo editado', estado: 'propuesto' as const })))
  if (estado === 'aprobado') for (const f of tablas.colaterales_retoques) await almacen.pasarRetoque(String(f.id), 'propuesto', 'aprobado')
  void documento
  return { almacen, tablas, edicion_id: edicion.id }
}

describe('aplicar · dos clientes · versión nueva, en el pedazo exacto', () => {
  it('A (markdown): los 2 pedazos aprobados se escriben en UNA versión nueva, cada uno en su posición; el resto del documento no cambia', async () => {
    expect(A_COSTA).toHaveLength(2)
    const { almacen, tablas, edicion_id } = await preparar(EDIC_A, 'gran_idea', 'gi-a', A_COSTA, 'costa', 'playa')
    const w = escritorFalso({ 'gi-a': A.gran_idea_v3 })
    const r = await aplicarAprobados({ almacen, escritores: { gran_idea: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.pendientes).toEqual([])
    expect(r.aplicados.map((x) => x.version)).toEqual(['2', '2'])
    expect(w.escrituras).toHaveLength(1)
    const nuevo = w.versiones.get('gi-a')![1].texto
    let esperado = A.gran_idea_v3
    for (const p of [...A_COSTA].sort((a, b) => b.inicio - a.inicio)) esperado = esperado.slice(0, p.inicio) + p.texto.replace('costa', 'playa') + esperado.slice(p.inicio + p.texto.length)
    expect(nuevo).toBe(esperado)
    expect(nuevo.length).toBe(A.gran_idea_v3.length)
    expect(tablas.colaterales_retoques.every((f) => f.estado === 'aplicado' && f.version_resultante === '2')).toBe(true)
  })

  it('B (JSON): el retoque va por su RUTA; el JSON nuevo solo cambia ese valor', async () => {
    const { almacen, edicion_id } = await preparar(EDIC_B, 'plan', 'plan-b', [B_COND], EDIC_B.antes, EDIC_B.despues)
    const w = escritorFalso({ 'plan-b': B.plan })
    const r = await aplicarAprobados({ almacen, escritores: { plan: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.aplicados).toHaveLength(1)
    const antes = JSON.parse(B.plan), despues = JSON.parse(w.versiones.get('plan-b')![1].texto)
    const valorEn = (o: unknown, ruta: string) => (ruta.match(/[^.[\]]+/g) ?? []).reduce<any>((x, k) => x?.[/^\d+$/.test(k) ? Number(k) : k], o)
    expect(valorEn(despues, B_COND.ruta!)).toBe(B_COND.texto.replace(EDIC_B.antes, EDIC_B.despues))
    const ruta = B_COND.ruta!
    const parte = ruta.match(/[^.[\]]+/g)!
    const quitar = (o: any) => { const c = structuredClone(o); let x = c; for (const k of parte.slice(0, -1)) x = x[/^\d+$/.test(k) ? Number(k) : k]; delete x[parte.at(-1)!]; return c }
    expect(quitar(despues)).toEqual(quitar(antes))
  })

  it('H1 / línea 3 de CC7: si la fila del destino se apagó al aplicar, queda pendiente y no se escribe nada', async () => {
    const { almacen, tablas, edicion_id } = await preparar(EDIC_A, 'gran_idea', 'gi-a', A_COSTA, 'costa', 'playa')
    const w = escritorFalso({ 'gi-a': A.gran_idea_v3 })
    const r = await aplicarAprobados({ almacen, escritores: { gran_idea: w.esc }, leerFilasActivas: async () => new Set(['plan', 'pieza']) }, edicion_id)
    expect(r.pendientes.map((x) => x.motivo)).toEqual(['fila_inactiva', 'fila_inactiva'])
    expect(w.escrituras).toEqual([])
    expect(tablas.colaterales_retoques.map((f) => [f.estado, f.motivo])).toEqual([['pendiente', 'fila_inactiva'], ['pendiente', 'fila_inactiva']])
  })

  it('la fila activa se lee UNA vez, al aplicar; si no hay aprobados ni se lee', async () => {
    let lecturas = 0
    const leer = async () => { lecturas++; return TODAS }
    const p1 = await preparar(EDIC_B, 'plan', 'plan-b', [B_COND], EDIC_B.antes, EDIC_B.despues, 'propuesto')
    await aplicarAprobados({ almacen: p1.almacen, escritores: { plan: escritorFalso({ 'plan-b': B.plan }).esc }, leerFilasActivas: leer }, p1.edicion_id)
    expect(lecturas).toBe(0)
    expect(p1.tablas.colaterales_retoques[0].estado).toBe('propuesto') // lo no aprobado no se toca
    const p2 = await preparar(EDIC_A, 'gran_idea', 'gi-a', A_COSTA, 'costa', 'playa')
    await aplicarAprobados({ almacen: p2.almacen, escritores: { gran_idea: escritorFalso({ 'gi-a': A.gran_idea_v3 }).esc }, leerFilasActivas: leer }, p2.edicion_id)
    expect(lecturas).toBe(1)
  })

  it('línea 2 de CC7: si alguien escribió después de la versión base, pendiente «version_cambiada» y no se pisa', async () => {
    const { almacen, edicion_id } = await preparar(EDIC_B, 'plan', 'plan-b', [B_COND], EDIC_B.antes, EDIC_B.despues)
    const w = escritorFalso({ 'plan-b': B.plan })
    w.tocar('plan-b', B.plan.replace('creado y validado', 'lo cambió el dueño'))
    const r = await aplicarAprobados({ almacen, escritores: { plan: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.pendientes).toEqual([{ id: expect.any(String), motivo: 'version_cambiada' }])
    expect(w.versiones.get('plan-b')).toHaveLength(2)
  })

  it('carrera: otro se adelanta entre leer y escribir → pendiente, nada aplicado', async () => {
    const { almacen, tablas, edicion_id } = await preparar(EDIC_A, 'gran_idea', 'gi-a', A_COSTA, 'costa', 'playa')
    const w = escritorFalso({ 'gi-a': A.gran_idea_v3 }, { adelantarse: true })
    const r = await aplicarAprobados({ almacen, escritores: { gran_idea: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.aplicados).toEqual([])
    expect(tablas.colaterales_retoques.map((f) => f.estado)).toEqual(['pendiente', 'pendiente'])
  })

  it('un pedazo que ya no está igual queda pendiente; el otro del mismo documento sí se aplica', async () => {
    const malo: Pedazo = { ...A_COSTA[1], texto: A_COSTA[1].texto + ' (texto que no está)' }
    const { almacen, tablas, edicion_id } = await preparar(EDIC_A, 'gran_idea', 'gi-a', [A_COSTA[0], malo], 'costa', 'playa')
    const w = escritorFalso({ 'gi-a': A.gran_idea_v3 })
    const r = await aplicarAprobados({ almacen, escritores: { gran_idea: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.aplicados).toHaveLength(1)
    expect(r.pendientes).toEqual([{ id: expect.any(String), motivo: 'pedazo_no_encontrado' }])
    expect(tablas.colaterales_retoques.find((f) => f.pedazo_texto === malo.texto)?.estado).toBe('pendiente')
  })

  it('si NINGÚN pedazo se encuentra, no se escribe una versión nueva vacía de cambios', async () => {
    const malos = A_COSTA.map((p) => ({ ...p, texto: p.texto + ' (texto que no está)' }))
    const { almacen, edicion_id } = await preparar(EDIC_A, 'gran_idea', 'gi-a', malos, 'costa', 'playa')
    const w = escritorFalso({ 'gi-a': A.gran_idea_v3 })
    const r = await aplicarAprobados({ almacen, escritores: { gran_idea: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.pendientes.map((x) => x.motivo)).toEqual(['pedazo_no_encontrado', 'pedazo_no_encontrado'])
    expect(w.escrituras).toEqual([])
    expect(w.versiones.get('gi-a')).toHaveLength(1)
  })

  it('sin escritor para el destino, o documento inexistente: pendiente con su motivo', async () => {
    const p = await preparar(EDIC_A, 'gran_idea', 'gi-a', A_COSTA, 'costa', 'playa')
    expect((await aplicarAprobados({ almacen: p.almacen, escritores: {}, leerFilasActivas: async () => TODAS }, p.edicion_id)).pendientes.map((x) => x.motivo)).toEqual(['sin_escritor', 'sin_escritor'])
    const q = await preparar(EDIC_B, 'plan', 'plan-b', [B_COND], EDIC_B.antes, EDIC_B.despues)
    expect((await aplicarAprobados({ almacen: q.almacen, escritores: { plan: escritorFalso({}).esc }, leerFilasActivas: async () => TODAS }, q.edicion_id)).pendientes.map((x) => x.motivo)).toEqual(['documento_no_existe'])
  })
})

describe('deshacer · otra versión nueva, nunca se pisa lo de encima', () => {
  it('A y B: deshacer escribe una versión nueva con el texto de la base y marca los retoques «deshecho»', async () => {
    for (const [ed, doc, ref, peds, texto] of [[EDIC_A, 'gran_idea', 'gi-a', A_COSTA, A.gran_idea_v3], [EDIC_B, 'plan', 'plan-b', [B_COND], B.plan]] as const) {
      const { almacen, tablas, edicion_id } = await preparar(ed, doc, ref, [...peds], ed.antes, ed.despues)
      const w = escritorFalso({ [ref]: texto })
      await aplicarAprobados({ almacen, escritores: { [doc]: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
      const r = await deshacerEdicion({ almacen, escritores: { [doc]: w.esc } }, edicion_id)
      expect(r.no_deshechos).toEqual([])
      expect(w.versiones.get(ref)!.map((v) => v.version)).toEqual(['1', '2', '3'])
      expect(w.versiones.get(ref)![2].texto).toBe(texto)
      expect(tablas.colaterales_retoques.every((f) => f.estado === 'deshecho' && f.version_resultante === '2' && f.motivo === 'deshecho en la versión 3')).toBe(true)
      // deshacer otra vez no hace nada: lo deshecho no vuelve a deshacerse ni da aviso
      expect(await deshacerEdicion({ almacen, escritores: { [doc]: w.esc } }, edicion_id)).toEqual({ deshechos: [], no_deshechos: [], ya_cambiaron: [] })
      expect(w.versiones.get(ref)).toHaveLength(3)
    }
  })

  it('si alguien escribió encima de lo aplicado, NO se deshace (se avisa) y los retoques siguen «aplicado»', async () => {
    const { almacen, tablas, edicion_id } = await preparar(EDIC_B, 'plan', 'plan-b', [B_COND], EDIC_B.antes, EDIC_B.despues)
    const w = escritorFalso({ 'plan-b': B.plan })
    await aplicarAprobados({ almacen, escritores: { plan: w.esc }, leerFilasActivas: async () => TODAS }, edicion_id)
    w.tocar('plan-b', '{"otro":"cambio del dueño"}')
    const r = await deshacerEdicion({ almacen, escritores: { plan: w.esc } }, edicion_id)
    expect(r.no_deshechos.map((x) => x.motivo)).toEqual(['version_posterior'])
    expect(w.lecturasDeVersion).toEqual([]) // ni siquiera lee la base: se frena antes
    expect(w.versiones.get('plan-b')).toHaveLength(3)
    expect(tablas.colaterales_retoques[0].estado).toBe('aplicado')
  })
})
