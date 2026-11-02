/**
 * Punto 3 del encargo «errores del plan», firma de Emilio (01-nov): lo declarado por el dueño llega como hecho con precedencia, y lo que lo contradiga se marca por código además de por el revisor.
 * Con el caso que ya ocurrió y con otro cliente. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { controlarFrasesNegadas } from '../src/lib/planeacion/coherencia-del-plan'
import { adjuntoDelCliente } from '../src/lib/portero-alimenta/contexto-del-cliente'
import { textoDeLaCarpeta } from '../src/lib/jefatura/revision/carpeta-para-revisar'
import { abrirRevision, armarSalida, avisosDelPlan, elegirVersionDelPlan, fichasDeLoNegado } from '../src/lib/jefatura/revision/orquestador'
import { resolverCierre } from '../src/lib/jefatura/revision/cierre'
import { ARTEFACTO_DE_LA_JEFATURA, metadataDeLaJefatura } from '../src/lib/oficina/paso-jefatura'
import { puertosDePrueba, sobre, correr } from './_helpers/jefatura-revision'
import { crearPuertos } from '../src/lib/jefatura/revision/adaptadores'

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MARISCO = { tema: 'origen del marisco', frases_negadas: ['marisco de Olón', 'pescado del día de Olón'] }
const CLINICA = { tema: 'sede de Cuenca', frases_negadas: ['abierto los domingos'] }
const ficha = (o: Record<string, unknown>) => ({ id: 'f1', client_id: C, clase: 'dato_del_dueno', contenido: 'x', observado_en: '2026-10-16T00:00:00Z', provenance_tag: { datos: { tema: 'origen del marisco', respuesta: 'viene de Manta', frases_negadas: ['marisco de Olón'] } }, ...o })

describe('🔴 la frase que el dueño negó', () => {
  it('el caso real: el plan dice «marisco de Olón», sin importar mayúsculas ni tildes', () => {
    expect(controlarFrasesNegadas('Nuestro MARISCO DE OLON fresco.', [MARISCO])).toEqual([expect.objectContaining({ estado: 'no_cuadra', que: expect.stringMatching(/«marisco de Olón», y el dueño lo negó \(origen del marisco\)/) })])
  })
  it('otro cliente, otro hecho', () => {
    expect(controlarFrasesNegadas('La clínica está abierto los domingos', [CLINICA])).toHaveLength(1)
  })
  it('negarla no es usarla: «no es marisco de Olón» no se marca; si además la usa, sí', () => {
    expect(controlarFrasesNegadas('Aclaramos que no es marisco de Olón.', [MARISCO])).toEqual([])
    expect(controlarFrasesNegadas('Aclaramos que no es marisco de Olón. Después: nuestro marisco de Olón.', [MARISCO])).toHaveLength(1)
  })
  it('sin frases, o sin usarlas, no hay nada', () => {
    expect(controlarFrasesNegadas('Texto cualquiera', [{ tema: 'x', frases_negadas: [] }])).toEqual([])
    expect(controlarFrasesNegadas('Texto cualquiera', [MARISCO])).toEqual([])
  })
  it('fuera del plan, bloquea y entra al ciclo', () => {
    expect(fichasDeLoNegado('marisco de Olón', [MARISCO])[0]).toMatchObject({ gravedad: 'bloquea', origen: 'jefe', estado: 'abierta', contra_que: 'lo que declaró el dueño' })
  })
  it('🔴 en el plan no deja ficha: llega completo y con su aviso; sin la lectura, nada se rompe', async () => {
    const { P } = puertosDePrueba()
    P.hechosDelDueno = async () => [MARISCO]
    const notas: Array<Record<string, unknown>> = []
    P.anotarPalabraDelDueno = async (x) => { notas.push(x as never) }
    const c = await correr(P, sobre('plan', { texto: 'Plan con marisco de Olón', simulacion: { fichas: 'ninguna', gpt: 'vacio' } }))
    const id = String(c.aperturas[0].cuerpo.revision_id)
    const rev = await P.almacen.leerRevision(id)
    expect(rev!.estado_del_motor.fichas.some((f) => /el dueño lo negó/.test(f.que ?? ''))).toBe(false)
    expect(rev!.estado_del_motor.avisos).toBeUndefined()
    const leer = P.almacen.leerRevision.bind(P.almacen)
    P.almacen.leerRevision = async (x) => { const f = await leer(x); return f ? { ...f, dry_run: false } : f }
    const e = await elegirVersionDelPlan(P, id, { evaluaciones: [{ etiqueta: 'A', marcas: 0, largo: 24 }], idDeA: 'A-id', existentes: [] })
    expect(e.cuerpo.adoptada).toBe('A')
    expect(notas[0].detalle).toMatch(/Aviso: .*el dueño lo negó/)
    const { P: sin } = puertosDePrueba()
    expect((await abrirRevision(sin, sobre('plan', { id: 'otro', texto: 'Plan con marisco de Olón' }))).status).toBeLessThan(400)
  })
  it('🔴 en una pieza no deja ficha: se cierra con su aviso y llega a la bandeja', async () => {
    const { P } = puertosDePrueba()
    P.hechosDelDueno = async () => [MARISCO]
    const c = await correr(P, sobre('pieza', { texto: 'Pieza con marisco de Olón', simulacion: { fichas: 'ninguna', gpt: 'vacio' } }))
    const rev = await P.almacen.leerRevision(String(c.aperturas[0].cuerpo.revision_id))
    expect(rev!.estado_del_motor.fichas.some((f) => /el dueño lo negó/.test(f.que ?? ''))).toBe(false)
    expect(rev!.estado_del_motor.avisos?.[0]).toMatch(/^Aviso: .*el dueño lo negó/)
    expect(rev!.estado).toBe('cerrada')
    expect(armarSalida(rev!, resolverCierre(rev!.estado_del_motor, { tope: false, fallida: false, duenos: [] })).avisos?.[0]).toMatch(/el dueño lo negó/)
  })
  it('🔴 sin frase negada, o en una revisión fallida, la pieza no lleva aviso', async () => {
    const { P } = puertosDePrueba()
    P.hechosDelDueno = async () => [MARISCO]
    const c = await correr(P, sobre('pieza', { texto: 'Pieza limpia', simulacion: { fichas: 'ninguna', gpt: 'vacio' } }))
    const rev = await P.almacen.leerRevision(String(c.aperturas[0].cuerpo.revision_id))
    expect(rev!.estado_del_motor.avisos).toBeUndefined()
  })
  it('🔴 lo que no es plan ni pieza, con re-entrega, sigue bloqueando', async () => {
    const { P } = puertosDePrueba()
    P.hechosDelDueno = async () => [MARISCO]
    const r = await abrirRevision(P, sobre('estrategia', { texto: 'Estrategia con marisco de Olón' }))
    const rev = await P.almacen.leerRevision(String(r.cuerpo.revision_id))
    if (rev!.policy.reentrega === 'ninguna') throw new Error('esta prueba necesita un tipo con re-entrega')
    expect(rev!.estado_del_motor.fichas.some((f) => /el dueño lo negó/.test(f.que ?? '') && f.gravedad === 'bloquea')).toBe(true)
  })
  it('🔴 el aviso viaja de la salida a los datos de la bandeja', () => {
    const e = { artefactos: { [ARTEFACTO_DE_LA_JEFATURA]: { datos: { jefatura: { resultado: 'limpia', avisos: ['Aviso: x'], incompleta: false, sin_revisar: false } } } } } as never
    expect(metadataDeLaJefatura(e)).toMatchObject({ avisos_de_jefatura: ['Aviso: x'] })
    const sin = { artefactos: { [ARTEFACTO_DE_LA_JEFATURA]: { datos: { jefatura: { resultado: 'limpia', incompleta: false, sin_revisar: false } } } } } as never
    expect(metadataDeLaJefatura(sin)).not.toHaveProperty('avisos_de_jefatura')
  })
})

describe('🔴 viaja en la carpeta', () => {
  it('con su tema, su respuesta y lo que niega; el revisor lo lee como lo que manda', async () => {
    const db = new DbFalsa().semilla('cerebro_fichas', [ficha({})]).semilla('client_brand_books', [])
    const c = await adjuntoDelCliente(db as never, C)
    expect(c.hechos_del_dueno).toEqual([{ tema: 'origen del marisco', respuesta: 'viene de Manta', sede: null, frases_negadas: ['marisco de Olón'] }])
    const t = textoDeLaCarpeta(c)
    expect(t).toMatch(/Hechos que declaró el dueño \(mandan sobre cualquier otra fuente\)/)
    expect(t).toMatch(/origen del marisco: viene de Manta · frases que niega: «marisco de Olón»/)
  })
  it('🔴 con los puertos REALES sobre una base falsa, el control sí ve la frase negada (H14 de CC3)', async () => {
    const db = new DbFalsa().semilla('cerebro_fichas', [ficha({})]).semilla('client_brand_books', [])
    const reales = crearPuertos(db as never, {} as never)
    const hechos = await reales.hechosDelDueno!(C)
    expect(hechos).toEqual([expect.objectContaining({ tema: 'origen del marisco', frases_negadas: ['marisco de Olón'] })])
    expect(avisosDelPlan('Nuestro marisco de Olón', '', hechos, new Date('2026-11-02T00:00:00Z')).some((x) => /el dueño lo negó/.test(x))).toBe(true)
  })
  it('una lectura caída no tumba la revisión', async () => {
    const reales = crearPuertos({ from() { throw new Error('caída') } } as never, {} as never)
    expect(await reales.hechosDelDueno!(C)).toEqual([])
  })
  it('el hecho conserva su sede, y el revisor la lee (H15 de CC3)', async () => {
    const c = await adjuntoDelCliente(new DbFalsa().semilla('cerebro_fichas', [ficha({ sede: 'loja' })]).semilla('client_brand_books', []) as never, C)
    expect(c.hechos_del_dueno![0].sede).toBe('loja')
    expect(textoDeLaCarpeta(c)).toMatch(/sede loja · origen del marisco/)
  })
  it('lo retirado o de otro cliente no viaja; sin hechos, el campo no aparece', async () => {
    const db = new DbFalsa().semilla('cerebro_fichas', [ficha({ id: 'a', retirada_en: '2026-10-20T00:00:00Z' }), ficha({ id: 'b', client_id: 'otro' })]).semilla('client_brand_books', [])
    expect(await adjuntoDelCliente(db as never, C)).not.toHaveProperty('hechos_del_dueno')
  })
  it('una ficha sin tema o sin respuesta no se cita', async () => {
    const db = new DbFalsa().semilla('cerebro_fichas', [ficha({ provenance_tag: { datos: { tema: 'x' } } })]).semilla('client_brand_books', [])
    expect(await adjuntoDelCliente(db as never, C)).not.toHaveProperty('hechos_del_dueno')
  })
})
