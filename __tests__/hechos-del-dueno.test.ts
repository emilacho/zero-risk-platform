/**
 * Punto 3 del encargo «errores del plan», firma de Emilio (01-nov): lo declarado por el dueño llega como hecho con precedencia, y lo que lo contradiga se marca por código además de por el revisor.
 * Con el caso que ya ocurrió y con otro cliente. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { controlarFrasesNegadas } from '../src/lib/planeacion/coherencia-del-plan'
import { adjuntoDelCliente } from '../src/lib/portero-alimenta/contexto-del-cliente'
import { textoDeLaCarpeta } from '../src/lib/jefatura/revision/carpeta-para-revisar'
import { abrirRevision, fichasDeLoNegado } from '../src/lib/jefatura/revision/orquestador'
import { puertosDePrueba, sobre } from './_helpers/jefatura-revision'

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
  it('bloquea y entra al ciclo', () => {
    expect(fichasDeLoNegado('marisco de Olón', [MARISCO])[0]).toMatchObject({ gravedad: 'bloquea', origen: 'jefe', estado: 'abierta', contra_que: 'lo que declaró el dueño' })
  })
  it('🔴 al abrir la revisión queda la ficha, aunque el revisor no la vea; sin la lectura, nada se rompe', async () => {
    const { P } = puertosDePrueba()
    P.hechosDelDueno = async () => [MARISCO]
    const r = await abrirRevision(P, sobre('plan', { texto: 'Plan con marisco de Olón' }))
    const rev = await P.almacen.leerRevision(String(r.cuerpo.revision_id))
    expect(rev!.estado_del_motor.fichas.some((f) => /el dueño lo negó/.test(f.que ?? ''))).toBe(true)
    const { P: sin } = puertosDePrueba()
    expect((await abrirRevision(sin, sobre('plan', { id: 'otro', texto: 'Plan con marisco de Olón' }))).status).toBeLessThan(400)
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
  it('lo retirado o de otro cliente no viaja; sin hechos, el campo no aparece', async () => {
    const db = new DbFalsa().semilla('cerebro_fichas', [ficha({ id: 'a', retirada_en: '2026-10-20T00:00:00Z' }), ficha({ id: 'b', client_id: 'otro' })]).semilla('client_brand_books', [])
    expect(await adjuntoDelCliente(db as never, C)).not.toHaveProperty('hechos_del_dueno')
  })
  it('una ficha sin tema o sin respuesta no se cita', async () => {
    const db = new DbFalsa().semilla('cerebro_fichas', [ficha({ provenance_tag: { datos: { tema: 'x' } } })]).semilla('client_brand_books', [])
    expect(await adjuntoDelCliente(db as never, C)).not.toHaveProperty('hechos_del_dueno')
  })
})
