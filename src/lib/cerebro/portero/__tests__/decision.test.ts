/**
 * Lo que decidió el modelo, leído con las reglas de la sección 1.5 del diseño del tramo 2.
 * El modelo devuelve SOLO números; el sistema los traduce y nunca confía en ellos sin comprobar.
 * Casos escritos antes del código.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../../lista-corta'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import { interpretarDecision } from '../decision'
import { numerarLista } from '../lista-numerada'

async function numerada() {
  return numerarLista(await construirListaCorta(crearBaseFalsa(tablasDeLaBase()).consulta, A, { ahora: AHORA }))
}
const n = (lista: Awaited<ReturnType<typeof numerada>>, ref: string) => lista.lineas.find((l) => l.ficha.ref === ref)!.numero
const json = (o: unknown) => JSON.stringify(o)

describe('una respuesta buena', () => {
  it('traduce los números a referencias y conserva el porqué, los faltantes y la duda', async () => {
    const lista = await numerada()
    const a = n(lista, 'client_web_pages:wp-a1'), b = n(lista, 'client_sedes:sd-n')
    const r = interpretarDecision(json({ entregar: [a, b], pixeles: [], por_que: [{ numeros: [a], linea: 'el sitio tiene los precios' }], faltantes: ['política de cancelación'], duda: [b] }), lista, { pixeles: true })
    expect(r).toMatchObject({ ok: true })
    if (!r.ok) return
    expect(r.decision.entregar).toEqual(['client_web_pages:wp-a1', 'client_sedes:sd-n'])
    expect(r.decision.por_que).toEqual([{ numeros: [a], linea: 'el sitio tiene los precios' }])
    expect(r.decision.faltantes).toEqual(['política de cancelación'])
    expect(r.decision.duda).toEqual([b])
    expect(r.decision.numeros_invalidos).toEqual([])
  })
  it('acepta el JSON envuelto en un bloque de código', async () => {
    const lista = await numerada()
    const r = interpretarDecision('```json\n' + json({ entregar: [1], pixeles: [], por_que: [], faltantes: [], duda: [] }) + '\n```', lista, { pixeles: true })
    expect(r.ok).toBe(true)
  })
  it('los campos opcionales pueden faltar; solo «entregar» es obligatorio', async () => {
    const r = interpretarDecision(json({ entregar: [1] }), await numerada(), { pixeles: true })
    expect(r.ok && r.decision.faltantes).toEqual([])
  })
})

describe('las reglas de la sección 1.5, una por una', () => {
  it('JSON mal formado → capa 2 (respaldo)', async () => {
    expect(interpretarDecision('{"entregar": [1,2', await numerada(), { pixeles: true })).toEqual({ ok: false, caida: 'json_roto' })
    expect(interpretarDecision('claro, aquí tienes: 1 y 2', await numerada(), { pixeles: true })).toEqual({ ok: false, caida: 'json_roto' })
  })
  it('campos que faltan → capa 2', async () => {
    const l = await numerada()
    expect(interpretarDecision(json({ pixeles: [] }), l, { pixeles: true })).toEqual({ ok: false, caida: 'campos_que_faltan' })
    expect(interpretarDecision(json({ entregar: 'todo' }), l, { pixeles: true })).toEqual({ ok: false, caida: 'campos_que_faltan' })
    expect(interpretarDecision(json([1, 2]), l, { pixeles: true })).toEqual({ ok: false, caida: 'campos_que_faltan' })
  })
  it('un número que no está en la lista se descarta y se anota; el resto sigue', async () => {
    const r = interpretarDecision(json({ entregar: [1, 99999] }), await numerada(), { pixeles: true })
    expect(r.ok && r.decision.entregar).toHaveLength(1)
    expect(r.ok && r.decision.numeros_invalidos).toEqual([99999])
  })
  it('si TODOS los números son inválidos → capa 2', async () => {
    expect(interpretarDecision(json({ entregar: [99998, 99999] }), await numerada(), { pixeles: true })).toEqual({ ok: false, caida: 'todos_los_numeros_invalidos' })
  })
  it('los números que no son enteros cuentan como inválidos', async () => {
    const r = interpretarDecision(json({ entregar: [1, '2', 2.5, null] }), await numerada(), { pixeles: true })
    expect(r.ok && r.decision.entregar).toHaveLength(1)
    expect(r.ok && r.decision.numeros_invalidos).toHaveLength(3)
  })
  it('los números repetidos se quitan', async () => {
    const r = interpretarDecision(json({ entregar: [1, 1, 2, 2, 1] }), await numerada(), { pixeles: true })
    expect(r.ok && r.decision.entregar).toHaveLength(2)
  })
  it('entregar vacío con una lista que tiene algo → respuesta SOSPECHOSA, capa 2; nunca «sin material»', async () => {
    expect(interpretarDecision(json({ entregar: [] }), await numerada(), { pixeles: true })).toEqual({ ok: false, caida: 'entregar_vacio_sospechoso' })
  })
  it('entregar vacío con la lista vacía SÍ vale: sin_material', async () => {
    const vacia = numerarLista(await construirListaCorta(crearBaseFalsa(tablasDeLaBase()).consulta, A, { ahora: AHORA }), { ya_trae: ['ficha_del_cliente', 'manual', 'perfil_cliente_ideal', 'competencia', 'sitio', 'productos', 'sedes', 'datos_de_sede', 'fotos', 'trabajos_hechos', 'trozos_sin_lector'] })
    expect(vacia.lineas).toHaveLength(0)
    const r = interpretarDecision(json({ entregar: [] }), vacia, { pixeles: true })
    expect(r).toMatchObject({ ok: true })
    expect(r.ok && r.decision.sin_material).toBe(true)
  })
})

describe('los píxeles: solo fotos y portadas, a lo más 6, y solo si el pedido los quiere', () => {
  it('ignora los números que no son fotos ni portadas', async () => {
    const l = await numerada()
    const sitio = n(l, 'client_web_pages:wp-a1'), foto = n(l, 'client_social_images:im-1')
    const r = interpretarDecision(json({ entregar: [sitio, foto], pixeles: [sitio, foto] }), l, { pixeles: true })
    expect(r.ok && r.decision.pixeles).toEqual(['client_social_images:im-1'])
  })
  it('tope de 6', async () => {
    const l = await numerada()
    const fotos = l.lineas.filter((x) => ['foto', 'portada_de_video'].includes(x.ficha.clase)).map((x) => x.numero)
    expect(fotos.length).toBeGreaterThan(6)
    const r = interpretarDecision(json({ entregar: fotos, pixeles: fotos }), l, { pixeles: true })
    expect(r.ok && r.decision.pixeles).toHaveLength(6)
  })
  it('si el pedido dijo pixeles:false, siempre se ignoran', async () => {
    const l = await numerada()
    const foto = n(l, 'client_social_images:im-1')
    const r = interpretarDecision(json({ entregar: [foto], pixeles: [foto] }), l, { pixeles: false })
    expect(r.ok && r.decision.pixeles).toEqual([])
  })
})

describe('lo que escribe el modelo es texto de un tercero: se limpia', () => {
  it('recorta frases largas y descarta lo que no es texto', async () => {
    const r = interpretarDecision(json({ entregar: [1], por_que: [{ numeros: [1], linea: 'y'.repeat(900) }, { numeros: 'x', linea: 5 }], faltantes: ['z'.repeat(900), 7] }), await numerada(), { pixeles: true })
    expect(r.ok && r.decision.por_que).toHaveLength(1)
    expect(r.ok && r.decision.por_que[0].linea.length).toBeLessThanOrEqual(300)
    expect(r.ok && r.decision.faltantes).toHaveLength(1)
    expect(r.ok && r.decision.faltantes[0].length).toBeLessThanOrEqual(300)
  })
})
