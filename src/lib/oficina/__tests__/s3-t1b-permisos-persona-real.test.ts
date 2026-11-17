/**
 * 17-nov · Sprint 3 · T1b · el registro de permisos de persona real (DECISIONES Lenovo 13:10, opción B) y el modelo explícito en los pedidos (observación de CC7 en #1108).
 * Puro + adaptador real contra la base falsa + el cuerpo que llega a la ruta del brazo.
 */
import { describe, expect, it } from 'vitest'
import { MODELO_APROBADO, catalogoDeModelos } from '@/lib/video/parametros'
import { crearPuertos } from '../adaptadores'
import type { FotoEtiquetada } from '../fotos'
import { permisosDelCliente } from '../orquestador-video'
import { armarPedidoDeLaOficina, pedidosParaCotizar } from '../video/pedido'
import { avisoDePersonasReales, fotosConPermiso, motivoDelPermiso, type PermisoDePersonaReal } from '../video/permisos'
import { huellaDelClip, pedidosPorPlano } from '../video/planos'
import { traducirGuion } from '../video/guion'
import { DbFalsa } from './dbfalsa'

const HOY = new Date('2026-11-17T12:00:00Z')
const foto = (id: string, con_personas: boolean | null): FotoEtiquetada => ({ id, url: `https://x/${id}.jpg`, con_personas, origen: 'propia' })
const permiso = (o: Partial<PermisoDePersonaReal> = {}): PermisoDePersonaReal => ({ id: 'p1', persona: 'Ana (chef)', fotos: ['con-ana'], alcance: ['video'], vence_en: null, evidencia: 'contrato firmado 2026-11-01', revocado_en: null, ...o })
const FOTOS = [foto('plato', false), foto('con-ana', true), foto('sin-etiqueta', null), foto('con-otro', true)]

describe('la regla · una foto propia con personas solo viaja con su permiso vigente', () => {
  it('🔴 sin personas o sin etiqueta: viaja; con personas y permiso vigente de video: viaja; con personas sin permiso: no viaja y se declara', () => {
    const r = fotosConPermiso(FOTOS, [permiso()], 'video', HOY)
    expect(r.fotos.map((f) => f.id)).toEqual(['plato', 'con-ana', 'sin-etiqueta'])
    expect(r.retiradas).toEqual([{ foto_id: 'con-otro', motivo: 'sin_permiso' }])
  })
  it.each([
    ['vencido ayer', { vence_en: '2026-11-16' }, 'permiso_vencido'],
    ['revocado', { revocado_en: '2026-11-10T00:00:00Z' }, 'permiso_revocado'],
    ['solo imagen fija', { alcance: ['imagen'] }, 'sin_alcance'],
    ['sin evidencia', { evidencia: '   ' }, 'sin_evidencia'],
  ] as const)('🔴 permiso %s: la foto no viaja y se dice por qué, con la persona', (_n, cambio, motivo) => {
    const r = fotosConPermiso(FOTOS, [permiso(cambio as Partial<PermisoDePersonaReal>)], 'video', HOY)
    expect(r.fotos.map((f) => f.id)).not.toContain('con-ana')
    expect(r.retiradas).toContainEqual({ foto_id: 'con-ana', motivo, persona: 'Ana (chef)' })
  })
  it('vence HOY: todavía vale (el día es inclusive); sin vencimiento: vale', () => {
    expect(motivoDelPermiso(permiso({ vence_en: '2026-11-17' }), 'video', HOY)).toBeNull()
    expect(motivoDelPermiso(permiso({ vence_en: null }), 'video', HOY)).toBeNull()
  })
  it('🔴 registro que no se pudo leer (null): ninguna foto con personas viaja; las demás sí', () => {
    const r = fotosConPermiso(FOTOS, null, 'video', HOY)
    expect(r.fotos.map((f) => f.id)).toEqual(['plato', 'sin-etiqueta'])
    expect(r.retiradas.map((x) => [x.foto_id, x.motivo])).toEqual([['con-ana', 'registro_no_leido'], ['con-otro', 'registro_no_leido']])
  })
  it('🔴 un permiso de OTRA foto no cubre esta; con dos permisos basta que uno sirva', () => {
    expect(fotosConPermiso([foto('con-ana', true)], [permiso({ fotos: ['otra'] })], 'video', HOY).retiradas[0].motivo).toBe('sin_permiso')
    expect(fotosConPermiso([foto('con-ana', true)], [permiso({ revocado_en: '2026-11-01' }), permiso({ id: 'p2' })], 'video', HOY).retiradas).toEqual([])
  })
  it('con varios permisos que no sirven se declara el más cercano a servir (alcance antes que revocado)', () => {
    const r = fotosConPermiso([foto('con-ana', true)], [permiso({ revocado_en: '2026-11-01', persona: 'A' }), permiso({ id: 'p2', alcance: ['voz'], persona: 'B' })], 'video', HOY)
    expect(r.retiradas).toEqual([{ foto_id: 'con-ana', motivo: 'sin_alcance', persona: 'B' }])
  })
  it('el aviso nombra cada foto (nombre corto), la persona y el motivo; vacío si no se retiró nada', () => {
    expect(avisoDePersonasReales([])).toBe('')
    const a = avisoDePersonasReales(fotosConPermiso(FOTOS, [permiso({ vence_en: '2026-01-01' })], 'video', HOY).retiradas)
    expect(a).toContain('2 fotos propias con personas reales no se usaron')
    expect(a).toContain('con-ana (Ana (chef)): su permiso venció')
    expect(a).toContain('con-otro: sin permiso registrado')
  })
})

describe('el puerto · leer el registro', () => {
  it('🔴 sin el método, con error o si lanza: null (lo seguro); con filas: las filas', async () => {
    expect(await permisosDelCliente({}, 'c1')).toBeNull()
    expect(await permisosDelCliente({ permisosDePersonaReal: async () => ({ error: 'no hay tabla' }) }, 'c1')).toBeNull()
    expect(await permisosDelCliente({ permisosDePersonaReal: async () => { throw new Error('caída') } }, 'c1')).toBeNull()
    expect(await permisosDelCliente({ permisosDePersonaReal: async () => [permiso()] }, 'c1')).toEqual([permiso()])
  })
  it('🔴 el adaptador real lee `oficina_permisos_persona_real` SOLO del cliente, con revocados incluidos (la regla los declara)', async () => {
    const db = new DbFalsa().semilla('oficina_permisos_persona_real', [
      { id: 'a', client_id: 'c1', persona: 'Ana', fotos: ['f1'], alcance: ['video', 'imagen'], vence_en: '2027-01-01', evidencia: 'contrato', revocado_en: null },
      { id: 'b', client_id: 'c1', persona: 'Luis', fotos: ['f2'], alcance: ['video'], vence_en: null, evidencia: 'correo', revocado_en: '2026-11-10T00:00:00Z' },
      { id: 'c', client_id: 'otro', persona: 'Eva', fotos: ['f1'], alcance: ['video'], vence_en: null, evidencia: 'x', revocado_en: null },
    ])
    const P = crearPuertos(db as never, { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('{}')) as unknown as typeof fetch)
    expect(await P.permisosDePersonaReal!('c1')).toEqual([
      { id: 'a', persona: 'Ana', fotos: ['f1'], alcance: ['video', 'imagen'], vence_en: '2027-01-01', evidencia: 'contrato', revocado_en: null },
      { id: 'b', persona: 'Luis', fotos: ['f2'], alcance: ['video'], vence_en: null, evidencia: 'correo', revocado_en: '2026-11-10T00:00:00Z' },
    ])
  })
})

describe('el modelo EXPLÍCITO en los pedidos de la oficina (observación de CC7 en #1108)', () => {
  const con20 = catalogoDeModelos({ modelo_por_omision: 'bytedance/seedance-2.0' })
  const brief = { formato: 'reel', red: 'instagram' }
  const g = traducirGuion(['## Plano 1 · 0–5 s', 'Se ve: la puerta', '## Plano 2 · 5–10 s', 'Se ve: el plato'].join('\n'), { segundosMin: 8, segundosMax: 60 })
  it('🔴 la toma, los planos y la cotización llevan el modelo del catálogo con que se abrió el encargo', () => {
    const a = armarPedidoDeLaOficina({ guion: g, brief, fotos: [], clave: 'k', catalogo: con20 })
    expect(a.ok && a.pedido.modelo).toBe('bytedance/seedance-2.0')
    const pp = pedidosPorPlano({ guion: g, brief, fotos: [], clave: 'k', catalogo: con20 })
    expect(pp.ok && pp.pedidos.map((p) => p.modelo)).toEqual(['bytedance/seedance-2.0', 'bytedance/seedance-2.0'])
    const c = pedidosParaCotizar({ brief, fotos: [], clave: 'k', catalogo: con20 })
    expect(c.ok && c.pedidos[0].pedido.modelo).toBe('bytedance/seedance-2.0')
    expect((armarPedidoDeLaOficina({ guion: g, brief, fotos: [], clave: 'k' }) as { pedido: { modelo: string } }).pedido.modelo).toBe(MODELO_APROBADO)
  })
  it('🔴 la huella con el modelo aprobado de siempre es la de antes (los clips pagados se reutilizan); con otro modelo, otra', () => {
    const c = { fuente: null, prompt: 'p', formato: 'reel', segundos: 5, resolucion: '720p', relacion: '9:16', audio: true }
    expect(huellaDelClip({ ...c, modelo: MODELO_APROBADO })).toBe(huellaDelClip(c))
    expect(huellaDelClip({ ...c, modelo: 'bytedance/seedance-2.0' })).not.toBe(huellaDelClip(c))
    const pp = pedidosPorPlano({ guion: g, brief, fotos: [], clave: 'k', catalogo: con20 })
    expect(pp.ok && pp.pedidos[0].huella).not.toBe((pedidosPorPlano({ guion: g, brief, fotos: [], clave: 'k' }) as { pedidos: Array<{ huella: string }> }).pedidos[0].huella)
  })
  it('🔴 el adaptador manda `modelo` a la ruta al enviar y al cotizar; sin modelo en el pedido, no lo manda', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    const f = (async (_u: string, init?: RequestInit) => { cuerpos.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ ok: true, dry_run: true, request_id: 'r1', status: 'queued', costo_estimado_usd: 1 }), { status: 200 }) }) as unknown as typeof fetch
    const P = crearPuertos(new DbFalsa() as never, { baseUrl: 'https://app.test', internalKey: 'k' }, f)
    const a = armarPedidoDeLaOficina({ guion: g, brief, fotos: [], clave: 'k', catalogo: con20 })
    const pedido = (a as { pedido: Parameters<NonNullable<typeof P.video>['enviar']>[0]['pedido'] }).pedido
    const base = { client_id: 'c1', encargo_id: 'e1', tope_usd: 5, workflow_id: 'oficina:video_mesa', workflow_execution_id: 'x' }
    await P.video!.enviar({ ...base, pedido, dry_run: false })
    await P.video!.cotizar!({ ...base, pedido })
    const { modelo: _m, ...sinModelo } = pedido
    await P.video!.enviar({ ...base, pedido: sinModelo, dry_run: false })
    expect(cuerpos.map((c) => c.modelo)).toEqual(['bytedance/seedance-2.0', 'bytedance/seedance-2.0', undefined])
  })
})
