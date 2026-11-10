/**
 * Colaterales · tramo 2c · escritor REAL de la estrategia (`cadena_estrategias`), de punta a punta con aplicar/deshacer.
 * Estrategias REALES de dos clientes de rubros distintos (restaurante y B2B industrial), tal como viven en `contenido`.
 * La base falsa rechaza columnas que la migración de la cadena no crea y respeta su unicidad (campana_id, version).
 */
import { describe, it, expect } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { pedazosDe, type Pedazo } from '../red'
import { almacenDeColaterales } from '../almacen'
import { aplicarAprobados, deshacerEdicion } from '../aplicar'
import { escritorDeEstrategia, FormaCambiada, mismaForma, AUTOR_DE_COLATERALES } from '../escritores'
import { baseFalsa } from './base-falsa'

const TODAS: ReadonlySet<string> = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
const fila = (campana_id: string, version: number, contenido: unknown, estado = 'validada') => ({ id: version, campana_id, version, estado, contenido, texto_md: null, agente: 'estratega', modelo: 'm', costo_usd: 0.5, workflow_execution_id: 'x', seco: false, creada_en: '2026-11-01' })

const CASOS = [
  { cliente: 'A · restaurante', campana: 'camp-a', contenido: JSON.parse(A.estrategia_v1), antes: 'WhatsApp Business', despues: 'WhatsApp Business con catálogo' },
  { cliente: 'B · B2B industrial', campana: 'camp-b', contenido: JSON.parse(B.estrategia), antes: 'llevar las consultas entrantes a WhatsApp', despues: 'llevar las consultas entrantes a WhatsApp y al correo' },
]

async function preparar(caso: (typeof CASOS)[number], estado = 'validada', extra: Record<string, unknown>[] = []) {
  const { db, tablas } = baseFalsa({ inicial: { cadena_estrategias: [fila(caso.campana, 1, caso.contenido, estado), ...extra] } })
  const almacen = almacenDeColaterales(db)
  const ped = pedazosDe('estrategia', JSON.stringify(caso.contenido)).map((p, i): Pedazo => ({ id: `C${i + 1}`, ...p })).filter((p) => p.texto.includes(caso.antes))
  expect(ped.length, caso.cliente).toBeGreaterThan(0)
  const { edicion } = await almacen.crearEdicion({ client_id: caso.campana, documento: 'plan', documento_ref: 'plan', version_base: '1', seccion: 's', antes: caso.antes, despues: caso.despues, llave: `${caso.campana}:llave` })
  await almacen.guardarRetoques(edicion.id, ped.map((p) => ({ pedazo: p, documento_ref: caso.campana, version_base: '1', afecta: true, razon: 'repite lo editado', antes: caso.antes, despues: caso.despues, porque: 'repite lo editado', estado: 'propuesto' as const })))
  for (const f of tablas.colaterales_retoques) await almacen.pasarRetoque(String(f.id), 'propuesto', 'aprobado')
  return { db, tablas, almacen, edicion_id: edicion.id, ped }
}

describe('escritor de la estrategia · dos clientes', () => {
  for (const caso of CASOS) {
    it(`${caso.cliente}: versión 2 nueva, conserva su estado (H2), cambia SOLO el valor de la ruta, firmada por el motor y sin costo`, async () => {
      const { db, tablas, almacen, edicion_id, ped } = await preparar(caso)
      const r = await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(db) }, leerFilasActivas: async () => TODAS }, edicion_id)
      expect(r.pendientes).toEqual([])
      expect(r.aplicados).toHaveLength(ped.length)
      const filas = tablas.cadena_estrategias
      expect(filas.map((f) => f.version)).toEqual([1, 2])
      const v2 = filas[1]
      expect(v2).toMatchObject({ campana_id: caso.campana, estado: 'validada', agente: AUTOR_DE_COLATERALES, costo_usd: 0, seco: false })
      expect(mismaForma(v2.contenido, caso.contenido)).toBe(true)
      const t1 = JSON.stringify(caso.contenido), t2 = JSON.stringify(v2.contenido)
      expect(t2).toBe(t1.split(caso.antes).join(caso.despues))
      expect(filas[0].contenido).toEqual(caso.contenido) // la versión 1 no se tocó
      expect(tablas.colaterales_retoques.every((f) => f.estado === 'aplicado' && f.version_resultante === '2')).toBe(true)
    })
  }

  it('una estrategia APROBADA sigue aprobada después del retoque (H2)', async () => {
    const { db, tablas, almacen, edicion_id } = await preparar(CASOS[1], 'aprobada')
    await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(db) }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(tablas.cadena_estrategias[1].estado).toBe('aprobada')
  })

  it('en borrador cuenta como abierta: no se toca y el retoque queda pendiente', async () => {
    const { db, tablas, almacen, edicion_id } = await preparar(CASOS[0], 'borrador')
    const r = await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(db) }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(new Set(r.pendientes.map((x) => x.motivo))).toEqual(new Set(['documento_abierto']))
    expect(tablas.cadena_estrategias).toHaveLength(1)
  })

  it('descartada: no se retoca (documento_no_existe)', async () => {
    const { db, tablas, almacen, edicion_id } = await preparar(CASOS[1], 'descartada')
    const r = await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(db) }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.pendientes.map((x) => x.motivo)).toEqual(['documento_no_existe'])
    expect(tablas.cadena_estrategias).toHaveLength(1)
  })

  it('un texto que cambia la ESTRUCTURA se rechaza (FormaCambiada) y no se escribe', async () => {
    const { db, tablas } = baseFalsa({ inicial: { cadena_estrategias: [fila('c', 1, CASOS[1].contenido)] } })
    const otro = { ...CASOS[1].contenido, llave_nueva: 'x' }
    await expect(escritorDeEstrategia(db).escribirSiSigue('c', '1', JSON.stringify(otro), 'm')).rejects.toBeInstanceOf(FormaCambiada)
    const sinFases = { ...CASOS[1].contenido, fases: [] }
    await expect(escritorDeEstrategia(db).escribirSiSigue('c', '1', JSON.stringify(sinFases), 'm')).rejects.toBeInstanceOf(FormaCambiada)
    // una lista convertida en objeto con las mismas llaves numéricas también es otra estructura
    const fasesComoObjeto = { ...CASOS[1].contenido, fases: { ...CASOS[1].contenido.fases } }
    await expect(escritorDeEstrategia(db).escribirSiSigue('c', '1', JSON.stringify(fasesComoObjeto), 'm')).rejects.toBeInstanceOf(FormaCambiada)
    expect(tablas.cadena_estrategias).toHaveLength(1)
  })

  it('aplicar: si el escritor rechaza la escritura, el retoque queda pendiente «escritura_rechazada» y la corrida sigue', async () => {
    const { db, tablas, almacen, edicion_id } = await preparar(CASOS[0])
    const esc = escritorDeEstrategia(db)
    const r = await aplicarAprobados({ almacen, escritores: { estrategia: { ...esc, escribirSiSigue: async () => { throw new FormaCambiada('x') } } }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(new Set(r.pendientes.map((x) => x.motivo))).toEqual(new Set(['escritura_rechazada']))
    expect(tablas.cadena_estrategias).toHaveLength(1)
  })

  it('base vieja o carrera en el insert (23505): devuelve null, sin lanzar y sin escribir dos veces', async () => {
    const { db, tablas } = baseFalsa({ inicial: { cadena_estrategias: [fila('c', 1, CASOS[0].contenido), fila('c', 2, CASOS[0].contenido)] } })
    expect(await escritorDeEstrategia(db).escribirSiSigue('c', '1', JSON.stringify(CASOS[0].contenido), 'm')).toBeNull()
    // carrera: otro inserta la v2 entre la lectura y el insert
    const b = baseFalsa({ inicial: { cadena_estrategias: [fila('c', 1, CASOS[0].contenido)] } })
    const conCarrera = { from: (t: string) => { const api = b.db.from(t) as Record<string, any>; const ins = api.insert; api.insert = (f: unknown) => { b.tablas.cadena_estrategias.push(fila('c', 2, CASOS[0].contenido)); return ins(f) }; return api } }
    expect(await escritorDeEstrategia(conCarrera).escribirSiSigue('c', '1', JSON.stringify(CASOS[0].contenido), 'm')).toBeNull()
    expect(b.tablas.cadena_estrategias).toHaveLength(2)
    expect(tablas.cadena_estrategias).toHaveLength(2)
  })

  it('leerVersion devuelve EXACTAMENTE la versión pedida (deshacer vuelve a su base, no a la primera)', async () => {
    const otra = { ...CASOS[0].contenido, fases: CASOS[1].contenido.fases }
    const { db } = baseFalsa({ inicial: { cadena_estrategias: [fila('c', 1, otra), fila('c', 2, CASOS[0].contenido), fila('c', 3, CASOS[1].contenido)] } })
    const esc = escritorDeEstrategia(db)
    expect(await esc.leerVersion('c', '2')).toBe(JSON.stringify(CASOS[0].contenido))
    expect(await esc.leerVersion('c', '3')).toBe(JSON.stringify(CASOS[1].contenido))
    expect(await esc.leerVersion('c', '9')).toBeNull()
  })

  it('un error de la base se LANZA (no se lee como «no existe»)', async () => {
    await expect(escritorDeEstrategia(baseFalsa({ fallarLectura: true }).db).leerVigente('c')).rejects.toThrow(/statement timeout/)
    await expect(escritorDeEstrategia(baseFalsa({ fallarInsert: 'cadena_estrategias', inicial: { cadena_estrategias: [fila('c', 1, CASOS[0].contenido)] } }).db).escribirSiSigue('c', '1', JSON.stringify(CASOS[0].contenido), 'm')).rejects.toThrow(/connection reset/)
  })

  it('deshacer: versión 3 con el contenido de la 1, conserva el estado, y la 2 sigue guardada', async () => {
    for (const caso of CASOS) {
      const { db, tablas, almacen, edicion_id } = await preparar(caso, 'aprobada')
      const escritores = { estrategia: escritorDeEstrategia(db) }
      await aplicarAprobados({ almacen, escritores, leerFilasActivas: async () => TODAS }, edicion_id)
      const r = await deshacerEdicion({ almacen, escritores }, edicion_id)
      expect(r.no_deshechos, caso.cliente).toEqual([])
      const f = tablas.cadena_estrategias
      expect(f.map((x) => x.version)).toEqual([1, 2, 3])
      expect(f[2].contenido).toEqual(caso.contenido)
      expect(f[2].estado).toBe('aprobada')
      expect(f[1].contenido).not.toEqual(caso.contenido)
    }
  })
})
