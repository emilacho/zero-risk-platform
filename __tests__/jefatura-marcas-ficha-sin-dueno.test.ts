/**
 * J6 cuarto · `marcasDe` perdía `ficha_sin_dueno` al RELEER la fila (señal de CC#3): guardar ⇒ leer ⇒ elegir versión. US$ 0, base falsa.
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/revision-comun'
import { almacenDeSupabase } from '../src/lib/jefatura/revision/almacen-supabase'
import { resultadoTrasElegir } from '../src/lib/jefatura/revision/plan'
import { DbFalsaJefatura } from './_helpers/dbfalsa-jefatura'
import { politica } from './_helpers/jefatura-revision'

type Json = Record<string, any>
const nueva = () => ({ client_id: 'c', artifact_type: 'pieza' as const, artifact_id: 'p1', version: 1, journey_id: 'j', productores: politica('pieza').productores, entrada: { texto: 't', dry_run: true, devolver_a: { tipo: 'webhook' as const, destino: 'x' } }, devolver_a: { tipo: 'webhook' as const, destino: 'x' }, policy: politica('pieza'), tope_usd: 1.5, dry_run: true, prueba: false, estado_del_motor: estadoInicial() })

async function cerrarCon(marcas: Json) {
  const db = new DbFalsaJefatura()
  const a = almacenDeSupabase(db)
  const r = await a.crearRevision(nueva() as never)
  const id = r.ok ? r.revision.id : ''
  await a.guardar({ revision_id: id, estado_del_motor: estadoInicial(), gasto_usd: 0.2, estado: 'cerrada', resultado: 'con_desacuerdo', marcas: marcas as never })
  return { db, a, id }
}

describe('marcasDe · ida y vuelta de `ficha_sin_dueno`', () => {
  it('guardar ⇒ leer: la marca se conserva', async () => {
    const { a, id } = await cerrarCon({ con_desacuerdo: true, sin_segunda_mirada: false, ficha_sin_dueno: true })
    const rev = await a.leerRevision(id)
    expect(rev?.marcas).toEqual({ con_desacuerdo: true, sin_segunda_mirada: false, ficha_sin_dueno: true })
  })
  it('guardar ⇒ leer ⇒ elegir versión ⇒ guardar ⇒ leer: la marca sobrevive a la reescritura', async () => {
    const { a, id } = await cerrarCon({ con_desacuerdo: true, sin_segunda_mirada: false, ficha_sin_dueno: true })
    const rev = (await a.leerRevision(id))!
    const fin = resultadoTrasElegir({ resultado: rev.resultado!, marcas: rev.marcas }, false)
    expect(fin.marcas.ficha_sin_dueno).toBe(true)
    await a.guardar({ revision_id: id, estado_del_motor: rev.estado_del_motor, gasto_usd: rev.gasto_usd, resultado: fin.resultado, marcas: fin.marcas })
    expect((await a.leerRevision(id))?.marcas).toMatchObject({ con_desacuerdo: true, ficha_sin_dueno: true })
  })
  it('la forma de siempre NO cambia: sin la marca no aparece la clave (ni con false ni con otro valor)', async () => {
    for (const m of [{ con_desacuerdo: false, sin_segunda_mirada: false }, { con_desacuerdo: false, sin_segunda_mirada: false, ficha_sin_dueno: false }, { con_desacuerdo: true, sin_segunda_mirada: true, ficha_sin_dueno: 'si' }]) {
      const { a, id } = await cerrarCon(m)
      const rev = await a.leerRevision(id)
      expect(Object.keys(rev!.marcas).sort()).toEqual(['con_desacuerdo', 'sin_segunda_mirada'])
    }
  })
  it('mutación: sin conservarla (la lectura vieja) la ida y vuelta pierde la marca', () => {
    const lecturaVieja = (v: Json) => ({ con_desacuerdo: v.con_desacuerdo === true, sin_segunda_mirada: v.sin_segunda_mirada === true })
    expect((lecturaVieja({ con_desacuerdo: true, sin_segunda_mirada: false, ficha_sin_dueno: true }) as Json).ficha_sin_dueno).toBeUndefined()
  })
})
