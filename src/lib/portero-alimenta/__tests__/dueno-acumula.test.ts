/**
 * NOTAS QUE SE SUMAN Y LECTURA POR CANAL (21-oct · firma de Emilio) · la puerta del dueño reemplazaba por «mismo tema» (palabras compartidas): los comentarios de una pieza de la oficina creativa
 * se pisaban según el largo del id (probado 21-oct: un id de una palabra se sumaba por 0,667 contra 0,67; con un id de dos palabras o un uuid se reemplazaban; dos piezas con el mismo ts también).
 * Ahora la oficina que escribe dice `acumula: true` y su nota NUNCA retira a otra; sin él, todo reemplaza como siempre. La lectura admite `canal` y `limite` y dice `total`. US$ 0 · base falsa · los diez clientes.
 */
import { describe, expect, it } from 'vitest'
import { rutaDueno, rutaLeerDueno, type DepsDeDueno } from '../dueno'
import { armarResumen } from '../resumen-vivo'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-oficina-creativa', workflow_execution_id: 'ex-1' }
const montar = (c: ClienteSintetico) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  let n = 0
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora: AHORA, activo: true, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  return { t, deps }
}
const nota = (c: ClienteSintetico, pieza: string, ts: string, texto: string, o: Record<string, unknown> = {}) => ({
  client_id: c.id, dry_run: false, ...WF, evento: 'respuesta', tema: `oficina creativa · pieza ${pieza}`, pregunta: 'comentario en #oficina-creativa', respuesta: texto, canal: '#oficina-creativa',
  mensaje_ref: `C0123:${ts}`, respondido_en: new Date(Number(ts.split('.')[0]) * 1000).toISOString(), preguntado_por: { oficina: 'oficina-creativa', agente: 'productor' }, ...o,
})
const vigentes = (t: T) => t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && !f.retirada_en)
const retiradas = (t: T) => t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && f.retirada_en)

describe('con `acumula`, las notas del mismo tema se suman (cualquier id, cualquier cliente)', () => {
  // ids de 1, 2 y 5 palabras, y uno largo
  const IDS = ['a1b2c3d4', 'p-7', 'pieza-de-la-semana-3-final', 'x1', 'a1b2c3d4-0000-4000-8000-00000000abcd']
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): dos y tres comentarios de la misma pieza quedan vigentes, con cualquier id`, async () => {
      for (const id of IDS) {
        const m = montar(c)
        const a = await rutaDueno(m.deps, nota(c, id, '1792175397.213719', 'cambia el color del titular', { acumula: true, tema: `oficina creativa · pieza ${id.slice(0, 20)}` }))
        const b = await rutaDueno(m.deps, nota(c, id, '1792179999.000200', 'el logo va más grande', { acumula: true, tema: `oficina creativa · pieza ${id.slice(0, 20)}` }))
        const d = await rutaDueno(m.deps, nota(c, id, '1792183000.000300', 'quita la segunda línea', { acumula: true, tema: `oficina creativa · pieza ${id.slice(0, 20)}` }))
        expect([a.status, b.status, d.status], id).toEqual([200, 200, 200])
        expect(b.body, id).toMatchObject({ reemplaza: null, acumula: true })
        expect(vigentes(m.t), id).toHaveLength(3)
        expect(retiradas(m.t), id).toHaveLength(0)
      }
    })
  }
  it('dos piezas distintas con el mismo ts también conviven', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, nota(c, 'p7', '1792175397.213719', 'uno', { acumula: true }))
    await rutaDueno(m.deps, nota(c, 'p8', '1792175397.213719', 'otro', { acumula: true }))
    expect(vigentes(m.t)).toHaveLength(2)
  })
  it('la nota idéntica (mismo texto y mismo mensaje) no se duplica; el mismo texto con otro mensaje sí es otra nota', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, nota(c, 'p7', '1792175397.213719', 'cambia el color', { acumula: true }))
    const igual = await rutaDueno(m.deps, nota(c, 'p7', '1792175397.213719', 'cambia el color', { acumula: true }))
    expect(igual.body).toMatchObject({ repetida: true })
    await rutaDueno(m.deps, nota(c, 'p7', '1792179999.000200', 'cambia el color', { acumula: true }))
    expect(vigentes(m.t)).toHaveLength(2)
  })
  it('la ficha guarda que es una nota que se suma (decisión y datos)', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, nota(c, 'p7', '1792175397.213719', 'cambia el color', { acumula: true }))
    const f = vigentes(m.t)[0]
    expect(f).toMatchObject({ decision: 'suma', version_de: null })
    expect((f.provenance_tag as { datos: { acumula: boolean } }).datos.acumula).toBe(true)
  })
  it('en seco avisa que sumaría, sin reemplazar nada', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, nota(c, 'p7', '1792175397.213719', 'uno', { acumula: true }))
    const r = await rutaDueno(m.deps, nota(c, 'p7', '1792179999.000200', 'dos', { acumula: true, dry_run: true }))
    expect(r.body).toMatchObject({ dry_run: true, reemplaza: null, acumula: true })
  })
})

describe('sin `acumula`, todo reemplaza como siempre', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: una respuesta nueva al mismo tema retira a la anterior`, async () => {
      const m = montar(c)
      const pedido = (texto: string, ref: string) => ({ ...nota(c, 'x', '1792175397.213719', texto), tema: 'costo por plato', mensaje_ref: ref })
      await rutaDueno(m.deps, pedido('2,10 por plato', 'm1'))
      const r = await rutaDueno(m.deps, pedido('2,40 por plato', 'm2'))
      expect(r.body).toMatchObject({ reemplaza: expect.any(String) })
      expect(vigentes(m.t)).toHaveLength(1)
      expect(retiradas(m.t)).toHaveLength(1)
    })
  }
  it('una nota que se suma no retira una respuesta normal del mismo tema, ni al revés (la normal sí reemplaza a la normal)', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, { ...nota(c, 'x', '1792175397.213719', 'respuesta'), tema: 'costo por plato', mensaje_ref: 'm1' })
    await rutaDueno(m.deps, { ...nota(c, 'x', '1792179999.000200', 'nota'), tema: 'costo por plato', mensaje_ref: 'm2', acumula: true })
    expect(vigentes(m.t)).toHaveLength(2)
    expect(retiradas(m.t)).toHaveLength(0)
  })
})

describe('la lectura: canal, límite y total', () => {
  const c = DIEZ_CLIENTES[0]
  async function conMuchas(creativas: number) {
    const m = montar(c)
    await rutaDueno(m.deps, { ...nota(c, 'x', '1700000000.000100', '2,10 por plato'), tema: 'costo por plato', canal: 'chat con Lenovo', mensaje_ref: 'l1', respondido_en: '2026-09-01T10:00:00Z' })
    await rutaDueno(m.deps, { ...nota(c, 'x', '1700000000.000200', 'unos 20 clientes'), tema: 'afluencia al mediodía', canal: 'chat con Lenovo', mensaje_ref: 'l2', respondido_en: '2026-09-02T10:00:00Z' })
    for (let i = 0; i < creativas; i++) await rutaDueno(m.deps, nota(c, `p${i % 5}`, `${1792175397 + i * 60}.000100`, `comentario ${i}`, { acumula: true }))
    return m
  }
  const leer = (m: { deps: DepsDeDueno }, p: Record<string, unknown> = {}) => rutaLeerDueno({ db: m.deps.db, ahora: AHORA }, { client_id: c.id, ...p } as never)
  it('sin tema devuelve ambas notas de una pieza y dice el total', async () => {
    const m = montar(c)
    await rutaDueno(m.deps, nota(c, 'p7', '1792175397.213719', 'uno', { acumula: true }))
    await rutaDueno(m.deps, nota(c, 'p7', '1792179999.000200', 'dos', { acumula: true }))
    const r = await leer(m)
    expect(r.body).toMatchObject({ total: 2, recortado: false })
    expect((r.body as { respuestas: unknown[] }).respuestas).toHaveLength(2)
  })
  it('con 30 notas creativas el tope de 20 deja fuera las otras del dueño, y el filtro por canal las recupera', async () => {
    const m = await conMuchas(30)
    const todas = await leer(m)
    expect(todas.body).toMatchObject({ total: 32, recortado: true })
    const temas = (todas.body as { respuestas: Array<{ tema: string }> }).respuestas.map((x) => x.tema)
    expect(temas).toHaveLength(20)
    expect(temas.some((x) => /costo por plato/.test(x))).toBe(false) // el problema que pedía el filtro
    const delDueno = await leer(m, { canal: 'chat con Lenovo' })
    expect((delDueno.body as { respuestas: Array<{ tema: string }> }).respuestas.map((x) => x.tema).sort()).toEqual(['afluencia al mediodía', 'costo por plato'])
    expect(delDueno.body).toMatchObject({ total: 2, recortado: false, canal: 'chat con Lenovo' })
    const creativas = await leer(m, { canal: '#oficina-creativa' })
    expect(creativas.body).toMatchObject({ total: 30, recortado: true })
  })
  it('`limite`: por omisión 20 (5 con tema), máximo 100, un valor roto vuelve al de omisión', async () => {
    const m = await conMuchas(30)
    const largo = (r: { body: unknown }) => (r.body as { respuestas: unknown[] }).respuestas.length
    expect(largo(await leer(m, { limite: 100 }))).toBe(32)
    expect(largo(await leer(m, { limite: 3 }))).toBe(3)
    expect(largo(await leer(m, { limite: 'mucho' }))).toBe(20)
    expect(largo(await leer(m, { limite: 5000 }))).toBe(32) // tope 100
    expect(largo(await leer(m, { limite: 0 }))).toBe(20)
    expect(largo(await leer(m, { tema: 'oficina creativa · pieza p1' }))).toBe(5)
  })
})

describe('el resumen vivo: las notas que se suman no desplazan lo que sí dijo el dueño', () => {
  it('con 30 notas y 3 respuestas, salen las 3 respuestas y como mucho 4 notas', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    for (const [i, tema] of ['costo por plato', 'afluencia al mediodía', 'presupuesto de pauta'].entries()) await rutaDueno(m.deps, { ...nota(c, 'x', '1700000000.000100', `respuesta ${i}`), tema, canal: 'chat con Lenovo', mensaje_ref: `l${i}`, respondido_en: '2026-09-01T10:00:00Z' })
    for (let i = 0; i < 30; i++) await rutaDueno(m.deps, nota(c, `p${i % 5}`, `${1792175397 + i * 60}.000100`, `comentario ${i}`, { acumula: true }))
    const texto = armarResumen({ client_id: c.id, nombre: c.nombre, rubro: c.rubro, ahora: AHORA, zona: [], sedes: [], fichas: vigentes(m.t) as never }).texto
    const seccion = texto.split('## Lo que dijo el dueño')[1].split('\n## ')[0]
    const lineas = seccion.split('\n').filter((l) => l.startsWith('- '))
    expect(lineas.filter((l) => /costo por plato|afluencia|presupuesto de pauta/.test(l))).toHaveLength(3)
    expect(lineas.filter((l) => /oficina creativa/.test(l)).length).toBeLessThanOrEqual(4)
  })
})
