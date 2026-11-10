/**
 * Colaterales · tramo 2c · escritor REAL de la estrategia (`cadena_estrategias`), de punta a punta con aplicar/deshacer.
 * Estrategias REALES de dos clientes de rubros distintos (restaurante y B2B industrial), tal como viven en `contenido`.
 * La cadena se lee y escribe por SU almacén (regla del proyecto); aquí, su almacén en memoria. El historial, por la base falsa del 2b.
 */
import { describe, it, expect } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { pedazosDe, type Pedazo } from '../red'
import { almacenDeColaterales } from '../almacen'
import { aplicarAprobados, deshacerEdicion } from '../aplicar'
import { escritorDeEstrategia, FormaCambiada, mismaForma, AUTOR_DE_COLATERALES } from '../escritores'
import { baseFalsa } from './base-falsa'
import { AlmacenMemoria } from '../../cadena/__fixtures__/almacen-memoria'
import type { EstrategiaGuardada } from '../../cadena/almacen'

const TODAS: ReadonlySet<string> = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
const fila = (campana_id: string, version: number, contenido: unknown, estado = 'validada'): EstrategiaGuardada => ({ campana_id, version, estado: estado as EstrategiaGuardada['estado'], contenido: contenido as EstrategiaGuardada['contenido'], agente: 'estratega', modelo: 'm', costo_usd: 0.5, workflow_execution_id: 'x', seco: false })
const cadenaCon = (...filas: EstrategiaGuardada[]) => { const al = new AlmacenMemoria(); al.estrategias = structuredClone(filas); return al }

const CASOS = [
  { cliente: 'A · restaurante', campana: 'camp-a', contenido: JSON.parse(A.estrategia_v1), antes: 'WhatsApp Business', despues: 'WhatsApp Business con catálogo' },
  { cliente: 'B · B2B industrial', campana: 'camp-b', contenido: JSON.parse(B.estrategia), antes: 'llevar las consultas entrantes a WhatsApp', despues: 'llevar las consultas entrantes a WhatsApp y al correo' },
]

async function preparar(caso: (typeof CASOS)[number], estado = 'validada', extra: EstrategiaGuardada[] = []) {
  const { db, tablas } = baseFalsa()
  const cadena = cadenaCon(fila(caso.campana, 1, caso.contenido, estado), ...extra)
  const almacen = almacenDeColaterales(db)
  const ped = pedazosDe('estrategia', JSON.stringify(caso.contenido)).map((p, i): Pedazo => ({ id: `C${i + 1}`, ...p })).filter((p) => p.texto.includes(caso.antes))
  expect(ped.length, caso.cliente).toBeGreaterThan(0)
  const { edicion } = await almacen.crearEdicion({ client_id: caso.campana, documento: 'plan', documento_ref: 'plan', version_base: '1', seccion: 's', antes: caso.antes, despues: caso.despues, llave: `${caso.campana}:llave` })
  await almacen.guardarRetoques(edicion.id, ped.map((p) => ({ pedazo: p, documento_ref: caso.campana, version_base: '1', afecta: true, razon: 'repite lo editado', antes: caso.antes, despues: caso.despues, porque: 'repite lo editado', estado: 'propuesto' as const })))
  for (const f of tablas.colaterales_retoques) await almacen.pasarRetoque(String(f.id), 'propuesto', 'aprobado')
  return { cadena, tablas, almacen, edicion_id: edicion.id, ped }
}

describe('escritor de la estrategia · dos clientes', () => {
  for (const caso of CASOS) {
    it(`${caso.cliente}: versión 2 nueva, conserva su estado (H2), cambia SOLO el valor de la ruta, firmada por el motor y sin costo`, async () => {
      const { cadena, tablas, almacen, edicion_id, ped } = await preparar(caso)
      const r = await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(cadena) }, leerFilasActivas: async () => TODAS }, edicion_id)
      expect(r.pendientes).toEqual([])
      expect(r.aplicados).toHaveLength(ped.length)
      const filas = cadena.estrategias
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
    const { cadena, tablas, almacen, edicion_id } = await preparar(CASOS[1], 'aprobada')
    await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(cadena) }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(cadena.estrategias[1].estado).toBe('aprobada')
  })

  it('en borrador cuenta como abierta: no se toca y el retoque queda pendiente', async () => {
    const { cadena, tablas, almacen, edicion_id } = await preparar(CASOS[0], 'borrador')
    const r = await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(cadena) }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(new Set(r.pendientes.map((x) => x.motivo))).toEqual(new Set(['documento_abierto']))
    expect(cadena.estrategias).toHaveLength(1)
  })

  it('descartada: no se retoca (documento_no_existe)', async () => {
    const { cadena, tablas, almacen, edicion_id } = await preparar(CASOS[1], 'descartada')
    const r = await aplicarAprobados({ almacen, escritores: { estrategia: escritorDeEstrategia(cadena) }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(r.pendientes.map((x) => x.motivo)).toEqual(['documento_no_existe'])
    expect(cadena.estrategias).toHaveLength(1)
  })

  it('un texto que cambia la ESTRUCTURA se rechaza (FormaCambiada) y no se escribe', async () => {
    const cadena = cadenaCon(fila('c', 1, CASOS[1].contenido))
    const otro = { ...CASOS[1].contenido, llave_nueva: 'x' }
    await expect(escritorDeEstrategia(cadena).escribirSiSigue('c', '1', JSON.stringify(otro), 'm')).rejects.toBeInstanceOf(FormaCambiada)
    const sinFases = { ...CASOS[1].contenido, fases: [] }
    await expect(escritorDeEstrategia(cadena).escribirSiSigue('c', '1', JSON.stringify(sinFases), 'm')).rejects.toBeInstanceOf(FormaCambiada)
    // una lista convertida en objeto con las mismas llaves numéricas también es otra estructura
    const fasesComoObjeto = { ...CASOS[1].contenido, fases: { ...CASOS[1].contenido.fases } }
    await expect(escritorDeEstrategia(cadena).escribirSiSigue('c', '1', JSON.stringify(fasesComoObjeto), 'm')).rejects.toBeInstanceOf(FormaCambiada)
    expect(cadena.estrategias).toHaveLength(1)
  })

  it('aplicar: si el escritor rechaza la escritura, el retoque queda pendiente «escritura_rechazada» y la corrida sigue', async () => {
    const { cadena, almacen, edicion_id } = await preparar(CASOS[0])
    const esc = escritorDeEstrategia(cadena)
    const r = await aplicarAprobados({ almacen, escritores: { estrategia: { ...esc, escribirSiSigue: async () => { throw new FormaCambiada('x') } } }, leerFilasActivas: async () => TODAS }, edicion_id)
    expect(new Set(r.pendientes.map((x) => x.motivo))).toEqual(new Set(['escritura_rechazada']))
    expect(cadena.estrategias).toHaveLength(1)
  })

  it('base vieja o carrera en el guardado: devuelve null, sin lanzar y sin escribir dos veces', async () => {
    const cadena = cadenaCon(fila('c', 1, CASOS[0].contenido), fila('c', 2, CASOS[0].contenido))
    expect(await escritorDeEstrategia(cadena).escribirSiSigue('c', '1', JSON.stringify(CASOS[0].contenido), 'm')).toBeNull()
    expect(cadena.estrategias).toHaveLength(2)
    // carrera: otro guarda la v2 entre la lectura y el guardado
    const b = cadenaCon(fila('c', 1, CASOS[0].contenido))
    const conCarrera = { ultimaEstrategia: (r: string) => b.ultimaEstrategia(r), estrategiaEnVersion: (r: string, v: number) => b.estrategiaEnVersion(r, v), insertarEstrategiaSiLibre: async (e: EstrategiaGuardada) => { b.estrategias.push(fila('c', 2, CASOS[1].contenido)); return b.insertarEstrategiaSiLibre(e) } }
    expect(await escritorDeEstrategia(conCarrera).escribirSiSigue('c', '1', JSON.stringify(CASOS[0].contenido), 'm')).toBeNull()
    expect(b.estrategias.map((e) => e.version)).toEqual([1, 2])
    expect(b.estrategias[1].contenido).toEqual(CASOS[1].contenido) // lo del otro no se pisó
  })

  it('leerVersion devuelve EXACTAMENTE la versión pedida (deshacer vuelve a su base, no a la primera)', async () => {
    const otra = { ...CASOS[0].contenido, fases: CASOS[1].contenido.fases }
    const esc = escritorDeEstrategia(cadenaCon(fila('c', 1, otra), fila('c', 2, CASOS[0].contenido), fila('c', 3, CASOS[1].contenido)))
    expect(await esc.leerVersion('c', '2')).toBe(JSON.stringify(CASOS[0].contenido))
    expect(await esc.leerVersion('c', '3')).toBe(JSON.stringify(CASOS[1].contenido))
    expect(await esc.leerVersion('c', '9')).toBeNull()
  })

  it('un error del almacén se LANZA (no se lee como «no existe»)', async () => {
    const roto = { ultimaEstrategia: async () => { throw new Error('statement timeout') }, estrategiaEnVersion: async () => null, insertarEstrategiaSiLibre: async () => true }
    await expect(escritorDeEstrategia(roto).leerVigente('c')).rejects.toThrow(/statement timeout/)
    const b = cadenaCon(fila('c', 1, CASOS[0].contenido))
    const guardadoRoto = { ultimaEstrategia: (r: string) => b.ultimaEstrategia(r), estrategiaEnVersion: async () => null, insertarEstrategiaSiLibre: async () => { throw new Error('connection reset') } }
    await expect(escritorDeEstrategia(guardadoRoto).escribirSiSigue('c', '1', JSON.stringify(CASOS[0].contenido), 'm')).rejects.toThrow(/connection reset/)
  })

  it('deshacer: versión 3 con el contenido de la 1, conserva el estado, y la 2 sigue guardada', async () => {
    for (const caso of CASOS) {
      const { cadena, tablas, almacen, edicion_id } = await preparar(caso, 'aprobada')
      const escritores = { estrategia: escritorDeEstrategia(cadena) }
      await aplicarAprobados({ almacen, escritores, leerFilasActivas: async () => TODAS }, edicion_id)
      const r = await deshacerEdicion({ almacen, escritores }, edicion_id)
      expect(r.no_deshechos, caso.cliente).toEqual([])
      const f = cadena.estrategias
      expect(f.map((x) => x.version)).toEqual([1, 2, 3])
      expect(f[2].contenido).toEqual(caso.contenido)
      expect(f[2].estado).toBe('aprobada')
      expect(f[1].contenido).not.toEqual(caso.contenido)
    }
  })
})
