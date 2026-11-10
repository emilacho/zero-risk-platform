/**
 * PERFIL DEL PÚBLICO · T2 · el adaptador de fuentes de la oficina lee el perfil del adjunto de ESE cliente (base falsa + adjunto simulado).
 * Dos clientas de práctica de rubros distintos: una cafetería en Madrid y un proveedor industrial B2B en Monterrey.
 */
import { describe, expect, it, vi } from 'vitest'
import { TIPO_DEL_INFORME } from '../../perfil-del-publico/perfil'
const PERFIL_CAFE = ['[perfil del público · vecinos del barrio]', '## Cómo habla', '- «me pilla de camino al curro» [voz:33333333-3333-4333-8333-333333333333]'].join('\n')
const PERFIL_B2B = ['[perfil del público · jefes de mantenimiento]', '## Cómo habla', '- «que no se me pare la línea» [voz:55555555-5555-4555-8555-555555555555]'].join('\n')
const adjunto = (informes: Array<{ tipo: string; texto: string }>) => ({ informes, informes_estado: 'ok' as const })
// ─────────────────────────────────────────────────────────── el adaptador real (base falsa + adjunto simulado)
const adjuntos = vi.hoisted(() => ({ porCliente: new Map<string, unknown>(), falla: new Set<string>(), pedidos: [] as string[] }))
vi.mock('../../portero-alimenta/contexto-del-cliente', async (original) => ({
  ...(await original<object>()),
  adjuntoDelCliente: async (_db: unknown, clientId: string) => {
    adjuntos.pedidos.push(clientId)
    if (adjuntos.falla.has(clientId)) throw new Error('base caída')
    return adjuntos.porCliente.get(clientId) ?? { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], informes_estado: 'ok' }
  },
}))
import { crearPuertos, type Entorno } from '../adaptadores'
import { DbFalsa } from './dbfalsa'

const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k', openaiKey: 'sk', revisorModelo: 'm', revisorPrecioEntrada: 1, revisorPrecioSalida: 1, slackToken: 'x', bucket: 'b' }
const MADRID = '0c0ffee0-0000-4000-8000-000000000001', MONTERREY = '0b2b0000-0000-4000-8000-000000000002'
function base(): DbFalsa {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: MADRID, name: 'Cafetería de práctica', country: 'España', config: {} }, { id: MONTERREY, name: 'Proveedor industrial de práctica', country: 'México', config: {} }])
  db.semilla('client_brand_books', [{ client_id: MADRID, version: 1, voice_description: 'Tutea.', forbidden_words: [] }, { client_id: MONTERREY, version: 1, voice_description: 'Trato formal de usted.', forbidden_words: [] }])
  for (const t of ['client_social_images', 'oficina_uso_de_fotos', 'client_sede_datos', 'client_web_pages']) db.semilla(t, [])
  return db
}

describe('el adaptador de fuentes lee el perfil del adjunto de ESE cliente', () => {
  it('🔴 cada clienta recibe SU perfil (pedido con su id); el de la otra nunca entra', async () => {
    adjuntos.porCliente.set(MADRID, adjunto([{ tipo: TIPO_DEL_INFORME, texto: PERFIL_CAFE }]))
    adjuntos.porCliente.set(MONTERREY, adjunto([{ tipo: TIPO_DEL_INFORME, texto: PERFIL_B2B }]))
    adjuntos.pedidos.length = 0
    const P = crearPuertos(base(), ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch)
    const m = await P.fuentes(MADRID), b = await P.fuentes(MONTERREY)
    if ('error' in m || 'error' in b) throw new Error('fuentes con error')
    expect(adjuntos.pedidos).toEqual([MADRID, MONTERREY])
    expect(m.perfil_del_publico).toMatchObject({ estado: 'vigente', texto: PERFIL_CAFE })
    expect(m.fuentes.perfil_del_publico_texto).toBe(PERFIL_CAFE)
    expect(b.fuentes.perfil_del_publico_texto).toBe(PERFIL_B2B)
  })
  it('🔴 si leer el adjunto falla, las fuentes salen igual con el perfil «no se pudo leer» (texto null: las frases atribuidas se avisan)', async () => {
    adjuntos.falla.add(MADRID)
    try {
      const m = await crearPuertos(base(), ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch).fuentes(MADRID)
      if ('error' in m) throw new Error(m.error)
      expect(m.perfil_del_publico).toEqual({ estado: 'no_se_pudo_leer', detalle: 'base caída' })
      expect(m.fuentes.perfil_del_publico_texto).toBeNull()
      expect(m.fuentes.perfil_del_publico_estado).toBe('no_se_pudo_leer')
    } finally { adjuntos.falla.delete(MADRID) }
  })
  it('sin perfil hecho todavía (hoy, con T3 apagado): `sin_perfil` y la tarea queda como antes', async () => {
    adjuntos.porCliente.delete(MONTERREY)
    const b = await crearPuertos(base(), ENV, (async () => new Response('{}', { status: 404 })) as typeof fetch).fuentes(MONTERREY)
    if ('error' in b) throw new Error(b.error)
    expect(b.perfil_del_publico).toEqual({ estado: 'sin_perfil' })
    expect(b.fuentes.perfil_del_publico_texto).toBeNull()
    expect(b.fuentes.perfil_del_publico_estado).toBe('sin_perfil')
  })
})
