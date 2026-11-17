/**
 * 17-nov · Sprint 3 · T1 · nota de CC7 · el puerto REAL del brazo lee el catálogo de modelos con el MISMO lector que la ruta (`cadena_config.brazo_de_video`, por el almacén de la
 * cadena): lo que la configuración cambia, la oficina lo ve igual que la ruta. Sin valor, con valor raro o con la base caída: el catálogo del código (nunca lanza).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DbFalsa } from './dbfalsa'

const cad = vi.hoisted(() => ({ config: {} as Record<string, unknown>, cae: false, leidas: [] as string[] }))
vi.mock('@/lib/cadena/almacen-supabase', () => ({
  almacenDeSupabase: () => ({
    leerConfig: async (k: string) => { cad.leidas.push(k); if (cad.cae) throw new Error('la base no contesta'); return cad.config[k] },
  }),
}))
import { crearPuertos } from '../adaptadores'
import { CATALOGO_POR_OMISION, CLAVE_DE_CONFIG_DEL_BRAZO, configDelBrazo } from '@/lib/video/parametros'

const env = { baseUrl: 'https://app.test', internalKey: 'k' }
const catalogo = () => crearPuertos(new DbFalsa() as never, env, (async () => new Response('{}')) as unknown as typeof fetch).video!.catalogo!()

describe('el puerto real del brazo · catálogo de modelos', () => {
  beforeEach(() => { cad.config = {}; cad.cae = false; cad.leidas = [] })
  it('🔴 lee la clave del brazo y devuelve lo mismo que arma la ruta con ese valor', async () => {
    const valor = { tope_por_video_usd: 15, modelos: { 'kling/kling-4.0': { segundos_min: 6, segundos_max: 10, referencias_max: 2, audio: false, precio_usd_s: null, fuente: 'x' } }, modelo_por_omision: 'kling/kling-4.0' }
    cad.config[CLAVE_DE_CONFIG_DEL_BRAZO] = valor
    const c = await catalogo()
    expect(cad.leidas).toEqual([CLAVE_DE_CONFIG_DEL_BRAZO])
    expect(c).toEqual(configDelBrazo(valor).catalogo)
    expect(c.por_omision).toBe('kling/kling-4.0')
  })
  it('sin valor, con la base caída: el catálogo del código', async () => {
    expect(await catalogo()).toEqual(CATALOGO_POR_OMISION)
    cad.cae = true
    expect(await catalogo()).toEqual(CATALOGO_POR_OMISION)
  })
})
