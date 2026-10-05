/**
 * Paso 3 · el formato de la conversación (qué pide el agente, qué responde el portero).
 * SIN modelo y SIN tabla de «piso por clase»: lo fijo es lo mínimo (manual vigente + correcciones del aprobador).
 * Casos escritos antes del código.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { MAX_RONDAS, MOTIVOS_DE_QUITA, loFijo, respuestaDeRespaldo, validarPedido, validarRespuesta, verificarIndiceNoMiente } from '../conversacion'
import { A, AHORA, B, C, crearBaseFalsa, tablasDeLaBase } from './casos'

const pedidoValido = (cliente: string) => ({
  cliente,
  voy_a_producir: { output: 'carrusel de reels', material: 'video', canal: 'red social', formato: 'carrusel', objetivo: 'vender el producto uno' },
  necesito: 'tengo que hacer un carrusel de reels',
  ya_tengo: [] as string[],
  ronda: 1,
})
async function lista(cliente: string, fallan: string[] = []) {
  return construirListaCorta(crearBaseFalsa(tablasDeLaBase(), fallan).consulta, cliente, { ahora: AHORA })
}

describe('el pedido', () => {
  it('acepta un pedido completo', () => {
    expect(validarPedido(pedidoValido(A))).toEqual({ ok: true, pedido: expect.objectContaining({ cliente: A, ronda: 1 }) })
  })
  it('el tope de rondas es 4 (la 1.ª la hace el proceso; el agente pregunta hasta 3 veces más)', () => {
    expect(MAX_RONDAS).toBe(4)
    expect(validarPedido({ ...pedidoValido(A), ronda: 4 }).ok).toBe(true)
    expect(validarPedido({ ...pedidoValido(A), ronda: 5 }).ok).toBe(false)
    expect(validarPedido({ ...pedidoValido(A), ronda: 0 }).ok).toBe(false)
  })
  it('rechaza lo que no se puede atender, con el motivo', () => {
    const sinCliente = validarPedido({ ...pedidoValido(A), cliente: '' })
    expect(sinCliente.ok).toBe(false)
    const vacio = validarPedido({ cliente: A, voy_a_producir: {}, necesito: '', ya_tengo: [], ronda: 1 })
    expect(vacio.ok).toBe(false)
    expect(validarPedido({ ...pedidoValido(A), ya_tengo: [7] }).ok).toBe(false)
    expect(validarPedido(null).ok).toBe(false)
  })
  it('acepta «necesito» solo, o «voy_a_producir» solo (el agente dice lo que sabe)', () => {
    expect(validarPedido({ cliente: A, necesito: 'algo para un correo', ronda: 2 }).ok).toBe(true)
    expect(validarPedido({ cliente: A, voy_a_producir: { output: 'artículo' }, ronda: 2 }).ok).toBe(true)
  })
})

describe('lo fijo: manual vigente + correcciones del aprobador (y nada más)', () => {
  it('A: el manual vigente y las decisiones del aprobador; no el manual reemplazado, ni la ficha, ni el sitio', async () => {
    const fijo = loFijo(await lista(A)).map((f) => f.ref).sort()
    expect(fijo).toEqual(['client_brand_books:bb-2', 'client_historical_outputs:pz-2#decision', 'hitl_queue:hq-1'].sort())
  })
  it('B no tiene manual: lo fijo está vacío y lo dice como faltante, no lo inventa', async () => {
    const l = await lista(B)
    expect(loFijo(l)).toEqual([])
    const r = respuestaDeRespaldo(l, pedidoValido(B))
    expect(r.faltantes).toContain('manual de marca vigente')
  })
})

describe('el respaldo (lo arma la biblioteca, sin modelo: no depende de ningún flujo)', () => {
  it('modo respaldo: lo fijo + toda la lista corta restante como índice; no quita nada', async () => {
    const l = await lista(A)
    const r = respuestaDeRespaldo(l, pedidoValido(A))
    expect(r.modo).toBe('respaldo')
    expect(r.material.map((m) => m.ref).sort()).toEqual(loFijo(l).map((f) => f.ref).sort())
    expect(r.lo_que_no_te_di).toEqual([])
    expect(r.material.length + r.indice.length).toBe(l.lineas.length)
    expect(verificarIndiceNoMiente(l, r)).toEqual([])
  })
  it('cada cosa entregada trae su estado, su fecha y su aviso de vencido', async () => {
    const r = respuestaDeRespaldo(await lista(A), pedidoValido(A))
    for (const m of r.material) {
      expect(m).toHaveProperty('estado')
      expect(m).toHaveProperty('fecha_fuente')
      expect(m).toHaveProperty('vencido')
      expect(m.texto, m.ref).toBeTypeOf('string')
    }
  })
  it('lo vencido NO se quita nunca: el motivo «vencido» no existe', () => {
    expect(MOTIVOS_DE_QUITA.some((m) => /venc/i.test(m))).toBe(false)
    expect([...MOTIVOS_DE_QUITA].sort()).toEqual(['contradice_correccion_del_dueno', 'fuera_de_tema', 'no_cabe', 'otra_sede', 'otro_producto', 'repetido'])
  })
  it('un error de lectura NO se confunde con «sin material»', async () => {
    const r = respuestaDeRespaldo(await lista(C, ['client_social_images']), pedidoValido(C))
    expect(r.lectura.fotos).toBe('error_de_lectura')
    expect(r.lectura.sedes).toBe('sin_material')
    expect(r.errores_de_lectura).toEqual(['fotos'])
    expect(r.faltantes.join(' ')).not.toMatch(/fotos/) // no es un faltante: es un fallo que se reintenta, no un hueco del cliente
  })
  it('un cliente sin nada y sin errores: material vacío, faltantes y la lista de lecturas en «sin_material»', async () => {
    const base = crearBaseFalsa({ clients: [{ id: 'e', name: 'vacío', status: 'active', config: {} }] })
    const l = await construirListaCorta(base.consulta, 'e', { ahora: AHORA })
    const r = respuestaDeRespaldo(l, pedidoValido('e'))
    expect(r.material).toEqual([])
    expect(r.errores_de_lectura).toEqual([])
    expect(r.faltantes).toContain('manual de marca vigente')
  })
})

describe('la respuesta', () => {
  it('rechaza un motivo de quita fuera de la lista cerrada', async () => {
    const l = await lista(A)
    const r = respuestaDeRespaldo(l, pedidoValido(A))
    const mala = { ...r, lo_que_no_te_di: [{ ref: 'client_web_pages:wp-a2', motivo: 'vencido_sin_reconfirmar' }] }
    expect(validarRespuesta(mala).ok).toBe(false)
    const buena = { ...r, lo_que_no_te_di: [{ ref: 'client_web_pages:wp-a2', motivo: 'fuera_de_tema' }] }
    expect(validarRespuesta(buena).ok).toBe(true)
  })
  it('rechaza una cosa entregada sin estado o sin fecha', async () => {
    const r = respuestaDeRespaldo(await lista(A), pedidoValido(A))
    const sinEstado = { ...r, material: [{ ...r.material[0], estado: undefined }] }
    expect(validarRespuesta(sinEstado).ok).toBe(false)
    const { fecha_fuente: _quitada, ...sinFecha } = r.material[0]
    expect(validarRespuesta({ ...r, material: [sinFecha] }).ok).toBe(false)
  })
  it('el índice nunca miente: si una cosa vigente no está entregada ni en el índice ni en lo quitado con motivo, se detecta', async () => {
    const l = await lista(A)
    const r = respuestaDeRespaldo(l, pedidoValido(A))
    const sinUna = { ...r, indice: r.indice.filter((i) => i.ref !== 'client_social_images:im-1') }
    expect(verificarIndiceNoMiente(l, sinUna)).toEqual(['client_social_images:im-1'])
    // quitarla CON motivo es válido (está declarada)
    const conMotivo = { ...sinUna, lo_que_no_te_di: [{ ref: 'client_social_images:im-1', motivo: 'fuera_de_tema' as const }] }
    expect(verificarIndiceNoMiente(l, conMotivo)).toEqual([])
  })
  it('una versión reemplazada puede no aparecer: solo se exige lo vigente', async () => {
    const l = await lista(A)
    const r = respuestaDeRespaldo(l, pedidoValido(A))
    const sinVieja = { ...r, indice: r.indice.filter((i) => i.ref !== 'client_brand_books:bb-1') }
    expect(verificarIndiceNoMiente(l, sinVieja)).toEqual([])
  })
})
