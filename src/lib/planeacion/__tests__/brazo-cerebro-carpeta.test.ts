/**
 * 01-nov · FIRMA de Emilio 08:42Z punto 2 · el plan recibe la CARPETA COMPLETA, no busca · POST /api/planeacion/brazo/cerebro · US$ 0, sin red.
 *   · con carpeta: `trajo` con `contexto_del_cliente` ENTERO (el resumen vivo largo no se recorta; los informes van uno por tipo) y los ids del material
 *     crudo que un informe cita (solo por cita; la puerta no lee las tablas del cerebro); los parámetros de la búsqueda vieja se ignoran y se declara;
 *   · sin resumen vivo ni informes: `sin_dato` (el portero no armó la carpeta); la base caída: `sin_respuesta`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { crearBaseFalsa } from '../../portero-alimenta/__tests__/base-falsa'

const C = '11111111-1111-4111-8111-111111111111'
const F1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const F2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const LLAVE = 'llave-interna-456'
let base: ReturnType<typeof crearBaseFalsa>

vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => base.db }))

import { POST } from '../../../app/api/planeacion/brazo/cerebro/route'

const ficha = (id: string, o: Record<string, unknown>) => ({
  id, client_id: C, clase: 'sitio', atributo: '', titulo: '', que_es: '', contenido: '', observado_en: '2026-10-30T10:00:00Z', fecha_fuente: '2026-10-30', creado_en: '2026-10-30T10:00:00Z',
  vigente_hasta: null, sede: null, origen: 'apify', propiedad: null, provenance_tag: {}, retirada_en: null, descartada: false, ...o,
})
const RESUMEN = 'resumen vivo '.repeat(1000) // 13.000 caracteres: mucho más que el recorte viejo de 2.500
const INFORME = 'i'.repeat(5000)
const URL_ = 'http://x/api/planeacion/brazo/cerebro'
const sobre = (o: Record<string, unknown>) => new Request(URL_, { method: 'POST', headers: { 'x-api-key': LLAVE, 'content-type': 'application/json' }, body: JSON.stringify(o) })
const respuestas = async (r: Response) => ((await r.json()) as { respuestas: Array<Record<string, unknown>> }).respuestas

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_KEY', LLAVE)
  base = crearBaseFalsa({
    cerebro_fichas: [
      ficha('rv', { clase: 'resumen_vivo', atributo: 'resumen:cliente', contenido: RESUMEN, observado_en: '2026-11-01T00:35:00Z' }),
      ficha('rv-sede', { clase: 'resumen_vivo', atributo: 'resumen:sede:olon', contenido: 'la sede de la playa' }),
      ficha('inf', { clase: 'informe_de_analisis', atributo: 'informe:competencia', contenido: INFORME, fecha_fuente: '2026-10-31T00:00:00Z', provenance_tag: { datos: { tipo: 'competencia', mesa: 'mesa_de_analisis', agente: 'competitive-intelligence-agent', citas: [F1] } } }),
      ficha(F1, { clase: 'competidor_anuncios', atributo: 'competidor:rival', titulo: 'Rival', contenido: 'r'.repeat(2500) }),
      ficha(F2, { clase: 'resenas', atributo: 'resenas:x', contenido: 'no la cita nadie' }),
    ],
  } as never)
})
afterEach(() => { vi.unstubAllEnvs() })

describe('brazo · cerebro · la carpeta completa', () => {
  it('trajo: el resumen vivo ENTERO (y sus sedes), el informe vigente por tipo con sus citas, y el material crudo solo de lo citado (recortado y declarado)', async () => {
    const rs = await respuestas(await POST(sobre({ client_id: C, pedidos: [{ objetivo: 'qué sabe el cerebro', params: { query: 'Cliente Zeta · cafetería', k: 12 } }] })))
    expect(rs).toHaveLength(1)
    expect(rs[0]).toMatchObject({ brazo: 'cerebro', estado: 'trajo' })
    expect(String(rs[0].fuente)).toMatch(/sin búsqueda por parecido.*ignorados: query, k/)
    const d = rs[0].datos as { contexto_del_cliente: Record<string, unknown>; material_citado: { ids: string[]; detalle: string }; carpeta: Record<string, unknown> }
    const rv = d.contexto_del_cliente.resumen_vivo as Record<string, unknown>
    expect(rv.estado).toBe('vigente'); expect(String(rv.texto)).toBe(RESUMEN.trim())
    expect(rv.sedes).toEqual([{ clave: 'olon', ficha_id: 'rv-sede', texto: 'la sede de la playa' }])
    const informes = d.contexto_del_cliente.informes as Array<Record<string, unknown>>
    expect(informes).toHaveLength(1)
    expect(informes[0]).toMatchObject({ ficha_id: 'inf', tipo: 'competencia', texto: INFORME, citas: [F1], origen: 'sintesis_de_oficina', autor: { mesa: 'mesa_de_analisis', agente: 'competitive-intelligence-agent' } })
    // el material crudo sigue disponible SOLO por cita: viajan los ids (la puerta no lee las tablas del cerebro; se le pide al portero)
    expect(d.material_citado).toEqual({ ids: [F1], detalle: expect.stringMatching(/se pide al portero por su id/) })
    expect(JSON.stringify(d)).not.toContain('r'.repeat(100))
    expect(d.carpeta).toEqual({ resumen_vivo: 'vigente', informes: 1, informes_estado: 'ok' })
    expect(JSON.stringify(d)).not.toContain('no la cita nadie')
    expect(base.escrituras).toEqual([])
  })
  it('sin resumen vivo ni informes es sin_dato (el portero no armó la carpeta); la base caída es sin_respuesta; sin client_id es pedido inválido', async () => {
    base = crearBaseFalsa({ cerebro_fichas: [ficha(F2, { contenido: 'solo material crudo' })] } as never)
    const r1 = await respuestas(await POST(sobre({ client_id: C, pedidos: [{ objetivo: 'qué sabe' }] })))
    expect(r1[0].estado).toBe('sin_dato'); expect(String(r1[0].motivo)).toMatch(/no tiene carpeta todavía/)
    // la carpeta vacía viaja igual (el flujo la lee también en sin_dato · contrato con CC2)
    expect(r1[0].datos).toMatchObject({ contexto_del_cliente: { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [] }, carpeta: { resumen_vivo: 'sin_resumen_vivo', informes: 0 } })
    expect(JSON.stringify(r1[0].datos)).not.toContain('solo material crudo')
    base = crearBaseFalsa({ cerebro_fichas: [] } as never, { fallaEn: 'cerebro_fichas' })
    const r2 = await respuestas(await POST(sobre({ client_id: C, pedidos: [{ objetivo: 'qué sabe' }] })))
    expect(r2[0].estado).toBe('sin_respuesta'); expect(String(r2[0].motivo)).toMatch(/no se pudo leer la carpeta/)
    const r3 = await respuestas(await POST(sobre({ pedidos: [{ objetivo: 'qué sabe' }] })))
    expect(String(r3[0].motivo)).toMatch(/falta client_id/)
  })
})
