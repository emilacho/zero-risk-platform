/**
 * PASO 8 · lo que dejó INCONCLUSOS los renglones 7 y 13 de CC#3: (a) «aparece en la lista y se lee entero» y (b) el aislamiento entre clientes, en modo prueba.
 * Un cliente de prueba (`prueba-portero` o `prueba-portero-<etiqueta>`) puede LEER sus propias fichas de prueba por la lista y por la entrega; un cliente real jamás ve
 * una ficha de prueba, y un cliente de prueba jamás ve lo de otro. Modelo y base SIMULADOS, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { recibir, type DepsDeRecibir } from '../portero/recibir/recibir'
import { A, AHORA, BaseSimulada, PAGINA, crearModelo, cuerpo, modeloDeGrupos } from '../portero/recibir/__tests__/casos'
import { entregarContenido } from '../portero/entregar'
import { armarIndice } from '../portero/indice'
import { esClienteDePrueba, clienteDePrueba } from '../cliente-de-prueba'
import { construirListaCorta } from '../lista-corta'

describe('quién es un cliente de prueba', () => {
  it.each(['prueba-portero', 'prueba-portero-R1', 'prueba-portero-R2', 'prueba-portero-ab_12'])('«%s» lo es', (c) => { expect(esClienteDePrueba(c)).toBe(true) })
  it.each([A, '', 'prueba-portero-', 'prueba-portero-R 1', 'prueba-portero-R1;drop', 'xprueba-portero', 'prueba-portero2', 'PRUEBA-PORTERO', 'prueba-portero-' + 'x'.repeat(33), 'prueba-portero-R1-R2'])('«%s» NO lo es', (c) => { expect(esClienteDePrueba(c)).toBe(false) })
  it('la etiqueta se vuelve el cliente de prueba (y sin etiqueta es el de siempre)', () => {
    expect(clienteDePrueba('R1')).toBe('prueba-portero-R1')
    expect(clienteDePrueba(undefined)).toBe('prueba-portero')
    expect(clienteDePrueba('R 1')).toBeNull()
    expect(clienteDePrueba('x'.repeat(33))).toBeNull()
  })
})

function armar() {
  const base = new BaseSimulada()
  const m = crearModelo(modeloDeGrupos(3))
  const deps: DepsDeRecibir = { consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar, ahora: () => AHORA, nuevoId: base.nuevoId }
  const ingresar = async (extra: Record<string, unknown>) => { const r = await recibir(deps, cuerpo({ prueba: true, ...extra })); return { ...r, c: r.cuerpo as Record<string, any> } }
  return { base, m, ingresar }
}

describe('`recibir` en modo prueba con `cliente_de_prueba`: cada etiqueta es un cliente de prueba aparte', () => {
  it('las filas llevan `prueba-portero-R1`, la marca de prueba, y el registro sigue en `prueba-portero` (el libro y el presupuesto no cambian)', async () => {
    const { base, m, ingresar } = armar()
    const r = await ingresar({ cliente_de_prueba: 'R1' })
    expect(r.c.estado).toBe('fichado')
    expect(base.ingresos.concat(base.fichas).every((x) => x.client_id === 'prueba-portero-R1' && x.prueba === true)).toBe(true)
    expect(m.espia.registros[0]).toMatchObject({ client_id: 'prueba-portero', command: 'portero.recibir.prueba' })
    expect(m.espia.registros[0].metadata).toMatchObject({ prueba: true, etiqueta_de_cliente: 'R1' })
  })
  it('sin etiqueta sigue siendo `prueba-portero` (nada cambia para quien no la manda)', async () => {
    const { base, ingresar } = armar()
    await ingresar({})
    expect(base.fichas.every((x) => x.client_id === 'prueba-portero')).toBe(true)
  })
  it('una etiqueta inválida, o mandada SIN `prueba: true`, se rechaza (400) y no se guarda nada', async () => {
    const { base, m, ingresar } = armar()
    for (const mala of ['R 1', 'x'.repeat(33), 'a;b', '../x', 12]) expect((await ingresar({ cliente_de_prueba: mala })).status, String(mala)).toBe(400)
    const r = await recibir({ consulta: base.consulta, almacen: base.almacen, llamarModelo: m.llamarModelo, llamarModeloConImagen: m.llamarModeloConImagen, registrar: m.registrar }, cuerpo({ cliente_de_prueba: 'R1' }))
    expect(r.status).toBe(400)
    expect(base.llamadas).toEqual([])
  })
  it('AISLAMIENTO: dos clientes de prueba con la MISMA fuente no se heredan, no se retiran y no se mezclan', async () => {
    const { base, m, ingresar } = armar()
    await ingresar({ cliente_de_prueba: 'R1' })
    const llamadasAntes = m.espia.peticiones.length
    const r2 = await ingresar({ cliente_de_prueba: 'R2', workflow_execution_id: 'ex-2' })
    expect(m.espia.peticiones.length).toBeGreaterThan(llamadasAntes) // R2 NO heredó de R1: llamó al modelo
    expect(r2.c.fichas).toMatchObject({ heredadas: 0, retiradas: 0 })
    expect(new Set(base.fichas.map((f) => f.client_id))).toEqual(new Set(['prueba-portero-R1', 'prueba-portero-R2']))
    const r1b = await ingresar({ cliente_de_prueba: 'R1', workflow_execution_id: 'ex-3' }) // R1 otra vez, igual: hereda lo SUYO
    expect(r1b.c).toMatchObject({ llamo_al_modelo: false, fichas: { heredadas: 2 } })
    await ingresar({ cliente_de_prueba: 'R2', texto: 'Otro material solo de R2', es_completa: true, workflow_execution_id: 'ex-4' })
    expect(base.fichas.filter((f) => f.client_id === 'prueba-portero-R1' && f.retirada_en)).toEqual([]) // un re-ingreso completo de R2 no retira nada de R1
  })
})

describe('«aparece en la lista y se lee entero»: lo archivado en modo prueba se LEE por la lista y por la entrega', () => {
  it('la lista del cliente de prueba trae sus fichas (no «cliente_inexistente»), con su referencia, y cada una se entrega ENTERA, idéntica a lo guardado', async () => {
    const { base, ingresar } = armar()
    await ingresar({ cliente_de_prueba: 'R1' })
    const lista = await construirListaCorta(base.consulta, 'prueba-portero-R1', { ahora: AHORA })
    expect(lista.estado).toBe('ok')
    const refs = lista.lineas.filter((l) => l.ref.startsWith('cerebro_fichas:')).map((l) => l.ref)
    expect(refs).toHaveLength(base.fichas.length)
    expect(refs.length).toBeGreaterThan(0)
    const e = await entregarContenido(base.consulta, { cliente: 'prueba-portero-R1', refs }, { ahora: AHORA })
    expect(e.status).toBe(200)
    const cosas = ((e.cuerpo.entregado ?? e.cuerpo.cosas) as Array<Record<string, any>>) ?? []
    const texto = JSON.stringify(e.cuerpo)
    for (const f of base.fichas) for (const parte of String(f.contenido).split('\n\n')) expect(texto, parte).toContain(JSON.stringify(parte).slice(1, -1))
    void cosas
  })
  it('`indice` (la ruta que lee el agente) también devuelve la lista del cliente de prueba', async () => {
    const { base, ingresar } = armar()
    await ingresar({ cliente_de_prueba: 'R1' })
    const r = await armarIndice(base.consulta, { cliente: 'prueba-portero-R1' }, { ahora: AHORA })
    expect(r.status).toBe(200)
    expect((r.cuerpo.lista as unknown[]).length).toBe(base.fichas.length)
  })
  it('AISLAMIENTO en la lectura: R1 no ve las fichas de R2 en su lista, y pedirle a R1 la referencia de una ficha de R2 no devuelve su texto', async () => {
    const { base, ingresar } = armar()
    await ingresar({ cliente_de_prueba: 'R1' })
    await ingresar({ cliente_de_prueba: 'R2', texto: 'Texto exclusivo de R2: SECRETO-R2-001', workflow_execution_id: 'ex-2' })
    const deR2 = base.fichas.filter((f) => f.client_id === 'prueba-portero-R2')
    expect(deR2.length).toBeGreaterThan(0)
    const lista1 = await construirListaCorta(base.consulta, 'prueba-portero-R1', { ahora: AHORA })
    expect(lista1.lineas.some((l) => deR2.some((f) => l.ref === `cerebro_fichas:${f.id}`))).toBe(false)
    const e = await entregarContenido(base.consulta, { cliente: 'prueba-portero-R1', refs: deR2.map((f) => `cerebro_fichas:${f.id}`) }, { ahora: AHORA })
    expect(JSON.stringify(e.cuerpo)).not.toContain('SECRETO-R2-001')
  })
  it('un cliente REAL jamás ve una ficha de prueba (aunque exista) y el cliente de prueba sin filas ve una lista vacía, no un error', async () => {
    const { base, ingresar } = armar()
    await ingresar({ cliente_de_prueba: 'R1' })
    base.fichas.push({ ...base.fichas[0], id: '99999999-9999-4999-8999-999999999999', client_id: A, prueba: true })
    base.otras.clients = [{ id: A, name: 'Cliente real', website_url: null, status: 'active', config: {}, created_at: '2026-01-01T00:00:00Z' }] // existe de verdad: la lista se lee de verdad, no «cliente_inexistente»
    const real = await construirListaCorta(base.consulta, A, { ahora: AHORA })
    expect(real.estado).not.toBe('cliente_inexistente')
    expect(real.lineas.filter((l) => l.ref.startsWith('cerebro_fichas:'))).toEqual([])
    const vacio = await construirListaCorta(base.consulta, 'prueba-portero-R9', { ahora: AHORA })
    expect(vacio.estado).toBe('ok')
    expect(vacio.lineas).toEqual([])
  })
  it('una ficha de prueba retirada se ve CON su marca en la lista del cliente de prueba (para medir el retiro parcial)', async () => {
    const { base, ingresar } = armar()
    await ingresar({ cliente_de_prueba: 'R1' })
    await ingresar({ cliente_de_prueba: 'R1', texto: PAGINA().split('\n\n').slice(0, 3).join('\n\n'), workflow_execution_id: 'ex-2' }) // sin el segundo repuesto: completo → se retira
    const lista = await construirListaCorta(base.consulta, 'prueba-portero-R1', { ahora: AHORA })
    const retiradas = lista.lineas.filter((l) => /RETIRADA/.test(String(l.aviso ?? '')))
    expect(retiradas.length).toBe(base.fichas.filter((f) => f.retirada_en).length)
    expect(retiradas.length).toBeGreaterThan(0)
  })
})
