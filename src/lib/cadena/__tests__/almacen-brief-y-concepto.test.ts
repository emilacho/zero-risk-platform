/**
 * 31-oct (nuevo orden · T1) · el almacén del brief creativo y del concepto: UNA fila por (campaña, versión); la primera entrega que cierra gana (UNIQUE), el plazo del concepto lo guarda la cadena.
 * Prueba el almacén en memoria (lo que las rutas de T3 usarán) y que la siembra real de la migración trae el plazo `aprobacion_concepto`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AlmacenMemoria, plazosDeLaMigracion } from '../__fixtures__/almacen-memoria'
import type { BriefCreativoGuardado, ConceptoGuardado } from '../almacen'
import { calcularReloj } from '../esperas'

const brief = (v: number, o: Partial<BriefCreativoGuardado> = {}): BriefCreativoGuardado => ({ campana_id: 'camp-1', version: v, estado: 'borrador', texto_md: null, leido: null, devolucion_texto: null, motivo: null, costo_usd: null, encargo_id: null, seco: false, ...o })
const concepto = (v: number, o: Partial<ConceptoGuardado> = {}): ConceptoGuardado => ({ campana_id: 'camp-1', version: v, estado: 'abierta', aprobacion: null, texto_md: null, leido: null, brief_devuelto: null, motivo: null, costo_usd: null, plazo_en: '2026-10-31T13:30:00.000Z', encargo_id: null, hitl_id: null, nota_de_emilio: null, apunta_a: null, decidido_en: null, seco: false, ...o })

describe('almacén en memoria · brief creativo y concepto', () => {
  it('brief: inserta, lee el último por versión, actualiza; el mismo (campaña, versión) dos veces falla como la base (23505)', async () => {
    const a = new AlmacenMemoria()
    expect(await a.ultimoBriefCreativo('camp-1')).toBeNull()
    await a.insertarBriefCreativo(brief(1))
    await a.insertarBriefCreativo(brief(2, { estado: 'validada', texto_md: '## Mensaje\nuno' }))
    expect((await a.ultimoBriefCreativo('camp-1'))?.version).toBe(2)
    await a.actualizarBriefCreativo('camp-1', 1, { estado: 'devuelta', devolucion_texto: 'dos mensajes' })
    expect(a.briefsCreativos.find((b) => b.version === 1)).toMatchObject({ estado: 'devuelta', devolucion_texto: 'dos mensajes' })
    await expect(a.insertarBriefCreativo(brief(2))).rejects.toMatchObject({ code: '23505' })
    expect(await a.ultimoBriefCreativo('otra')).toBeNull()
  })
  it('concepto: inserta, lee el último, actualiza la aprobación; los vencidos son SOLO los abiertos con plazo pasado', async () => {
    const a = new AlmacenMemoria()
    await a.insertarConcepto(concepto(1, { plazo_en: '2026-10-31T13:00:00.000Z' }))
    await a.insertarConcepto(concepto(2, { plazo_en: '2026-10-31T15:00:00.000Z' }))
    await a.insertarConcepto(concepto(1, { campana_id: 'camp-2', estado: 'lista', aprobacion: 'pendiente', plazo_en: '2026-10-31T12:00:00.000Z' }))
    expect((await a.ultimoConcepto('camp-1'))?.version).toBe(2)
    expect((await a.conceptosVencidos('2026-10-31T14:00:00.000Z')).map((c) => [c.campana_id, c.version])).toEqual([['camp-1', 1]])
    await a.actualizarConcepto('camp-2', 1, { aprobacion: 'cambios', apunta_a: 'brief', nota_de_emilio: 'otro tono', decidido_en: '2026-10-31T14:05:00.000Z' })
    expect(a.conceptos.find((c) => c.campana_id === 'camp-2')).toMatchObject({ aprobacion: 'cambios', apunta_a: 'brief' })
    await expect(a.insertarConcepto(concepto(2))).rejects.toMatchObject({ code: '23505' })
    await expect(a.actualizarConcepto('camp-9', 1, {})).rejects.toThrow(/no existe/)
  })
  it('las lecturas devuelven copias (mutar lo leído no toca el almacén)', async () => {
    const a = new AlmacenMemoria()
    await a.insertarConcepto(concepto(1))
    const c = (await a.ultimoConcepto('camp-1'))!
    c.estado = 'sin_mesa'
    expect(a.conceptos[0].estado).toBe('abierta')
  })
})

describe('la siembra real de la migración 202610312001', () => {
  const RAIZ = join(__dirname, '..', '..', '..', '..')
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610312001_cadena_brief_creativo_y_conceptos.sql'), 'utf8')
  it('trae el plazo aprobacion_concepto (24 h · 72 h · seguir_esperando) y el reloj sabe calcularlo', () => {
    const p = plazosDeLaMigracion().find((x) => x.tipo === 'aprobacion_concepto')!
    expect(p).toEqual({ tipo: 'aprobacion_concepto', recordatorio_horas: 24, alerta_horas: 72, vence_horas: null, vence_regla: 'seguir_esperando', accion_al_vencer: 'seguir_esperando' })
    expect(calcularReloj(p, '2026-10-31T12:00:00Z').vence_en).toBe('2026-11-03T12:00:00.000Z')
  })
  it('la palanca nuevo_orden nace VACÍA, el redactor del plan es dato y hay tope de fases', () => {
    expect(sql).toMatch(/\('nuevo_orden',\s*'\{"clientes":\[\]\}'::jsonb\)/)
    expect(sql).toMatch(/\('planeacion',\s*'\{"redactor":"jefe-marketing"\}'::jsonb\)/)
    expect(sql).toMatch(/\('max_fases',\s*'4'::jsonb\)/)
  })
  it('las dos tablas nuevas cierran permisos (RLS + REVOKE anon/authenticated + GRANT service_role + secuencias) y el CHECK de validaciones admite los objetos nuevos', () => {
    expect(sql).toMatch(/ARRAY\['cadena_brief_creativo','cadena_conceptos'\]/)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON SEQUENCE public\.cadena_brief_creativo_id_seq, public\.cadena_conceptos_id_seq FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/CHECK \(objeto IN \('estrategia','calendario','brief','brief_creativo','concepto'\)\)/)
    expect(sql).toMatch(/NOTIFY pgrst/)
    const reversa = readFileSync(join(RAIZ, 'supabase', 'reversas', '202610312001_cadena_brief_creativo_y_conceptos_REVERSA.sql'), 'utf8')
    for (const t of ['cadena_conceptos', 'cadena_brief_creativo']) expect(reversa).toContain(`DROP TABLE IF EXISTS public.${t}`)
    expect(reversa).toMatch(/RAISE EXCEPTION 'cadena_config\.nuevo_orden tiene/)
  })
})
