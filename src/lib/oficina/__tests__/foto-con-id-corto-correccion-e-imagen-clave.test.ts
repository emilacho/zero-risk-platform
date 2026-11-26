/**
 * 26-nov · 🟡 CC6 a #1287 · los caminos que leen un id de foto ESCRITO POR UN AGENTE también aceptan el id acortado (comienzo de UNA sola foto).
 * La corrección de imagen (la foto real de la imagen y las otras de la imagen clave) y la imagen clave del video (la foto que nombra un plano de ambiente
 * y la foto real de la revisión). Cada prueba cae si ese lugar vuelve a la búsqueda exacta. En seco, sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { ARTEFACTO_PEDIDO_DE_CORRECCION, editarImagenes, tareaDeLaCorreccion } from '../mesa/correccion-imagen'
import { PASO_IMAGENES_CLAVE_FINAL, fotosDelPlano, pedidosDeImagenClave, tareaDeLaRevisionDeImagenesClave, type PlanoDeLaHoja } from '../video/imagen-clave'
import type { Estado } from '../tipos'

const REAL = { id: 'bf597cd8-1111-4000-8000-000000000001', url: 'https://fotos.test/real.jpg' }
const OTRA = { id: 'febd9334-2222-4000-8000-000000000002', url: 'https://fotos.test/otra.jpg' }
const FOTOS = [REAL, OTRA]
const CORTO_REAL = 'bf597cd8'
const CORTO_OTRA = 'febd9334'

const art = (datos: unknown, version = 1) => ({ version, version_consumida: 0, datos })
const enc = (e: Estado) => ({ id: '11111111-2222-3333-4444-555555555555', client_id: 'cli', dry_run: false, estado_del_motor: e }) as never
const conArt = (e: Estado, k: string, v: unknown): Estado => ({ ...e, artefactos: { ...(e.artefactos as Record<string, unknown>), [k]: art(v) } } as unknown as Estado)

/** la imagen final de la mesa, hecha sobre la foto real que el agente nombró ACORTADA */
function estadoFinal(): Estado {
  const items = [
    { indice: 0, ref: 'hook', intento: 1, prompt_idx: 0, url: 'https://img.test/hook-0.png', generation_id: 'g0', prompt: 'el plato en la mesa', foto_referencia_id: CORTO_REAL },
    { indice: 1, ref: 'hook', intento: 1, prompt_idx: 1, url: 'https://img.test/hook-1.png', generation_id: 'g1', prompt: 'el plato en la mesa' },
  ]
  return { artefactos: { encargo: art({ F: { fotos: FOTOS } }), imagenes: art({ ultimo_intento: 1, items }), prompts_validos: art({ por_ref: { hook: { prompts: [{}] } } }) }, fichas: [], vueltas: {}, pasos_ejecutados: 9, gasto_usd: 1 } as unknown as Estado
}
/** la imagen clave del video: su foto real y las otras que viajaron con ella, ACORTADAS */
function estadoVideo(): Estado {
  const planos = [{ n: 1, url: 'https://img.test/ic-1.png', imagenes: ['https://img.test/ic-1.png'], prompt: 'Key frame for shot 1', foto_referencia_id: CORTO_REAL, referencia_usada: true, otras_referencias_ids: [CORTO_OTRA], costo_usd: 0.04, generation_id: 'g1' }]
  return { artefactos: { encargo: art({ F: { fotos: FOTOS }, brief: { texto: 'un reel' } }), [PASO_IMAGENES_CLAVE_FINAL]: art({ fase: 'final', calidad: { quality: 'max', size: '1024x1536' }, planos, hay_imagenes: true }, 4) }, fichas: [], vueltas: {}, pasos_ejecutados: 9, gasto_usd: 1 } as unknown as Estado
}
function puertos() {
  const llamadas: Array<{ foto: { url: string }; otras_fotos?: Array<{ id: string; url: string }> }> = []
  const P = {
    imagen: async (p: (typeof llamadas)[number]) => { llamadas.push(p); return { ok: true, url: `https://img.test/ed-${llamadas.length}.png`, generation_id: `ge${llamadas.length}`, costo_usd: 0.01 } },
    imagenYaPedida: async () => null,
  }
  return { P: P as never, llamadas }
}

describe('la corrección de imagen con el id acortado', () => {
  it('c3 · el creativo ve la foto real UNA vez aunque el agente la haya nombrado acortada', () => {
    const t = tareaDeLaCorreccion(estadoFinal(), { contrato: '', fotos: FOTOS })
    expect(t.images.filter((u) => u === REAL.url)).toHaveLength(1)
  })
  it('c5 · la edición lleva la foto real PRIMERA entre las otras', async () => {
    const { P, llamadas } = puertos()
    await editarImagenes(P, enc(conArt(estadoFinal(), ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref: { hook: { base: 0, cambios: 'más luz' } } })))
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].otras_fotos?.[0]?.url).toBe(REAL.url)
  })
  it('c4 · en el video, las otras fotos de la imagen clave viajan con la edición', async () => {
    const { P, llamadas } = puertos()
    await editarImagenes(P, enc(conArt(estadoVideo(), ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref: { 'plano-1': { base: 0, cambios: 'más luz' } } })), { limites: { imagen_clave: { final: { quality: 'high', size: '1024x1792' } } } } as never)
    expect(llamadas).toHaveLength(1)
    // con el id ENTERO (no el acortado que escribió el agente)
    expect((llamadas[0].otras_fotos ?? []).map((f) => [f.id, f.url])).toEqual([[REAL.id, REAL.url], [OTRA.id, OTRA.url]])
  })
})

describe('la imagen clave del video con el id acortado', () => {
  it('c10 · un plano de ambiente que nombra una foto apta acortada la lleva', () => {
    const planos: PlanoDeLaHoja[] = [{ n: 1, desde: 0, hasta: 3, se_ve: 'la calle', producto: false, foto_id: CORTO_REAL }]
    const r = pedidosDeImagenClave({ planos, aptas: FOTOS, proporcion: '9:16' })
    expect(r.pedidos[0].foto?.url).toBe(REAL.url)
  })
  it('c11 · la revisión muestra la foto real de la imagen clave hecha sobre ella (nombrada acortada)', () => {
    const t = tareaDeLaRevisionDeImagenesClave({
      imagenes: [{ n: 1, url: 'https://i/1.png', prompt: '', foto_referencia_id: CORTO_REAL, referencia_usada: true, costo_usd: 0, generation_id: 'g1' }] as never,
      planos: [{ n: 1, desde: 0, hasta: 3, se_ve: 'el plato', producto: true }],
      fotos: FOTOS, brief_texto: 'el plato del día', red: 'instagram', contrato: '',
    })
    expect(t.images).toEqual(['https://i/1.png', REAL.url])
  })
})

describe('el id acortado se guarda ENTERO (observaciones de la revisión de #1287)', () => {
  it('la corrección: la base nombrada acortada no vuelve a viajar como «otra» cuando el prompt la nombró entera', async () => {
    const e = estadoFinal()
    const conPrompt = conArt(e, 'prompts_validos', { por_ref: { hook: { prompts: [{ foto_de_referencia: REAL.id, otras_fotos_de_referencia: [OTRA.id] }] } } })
    const { P, llamadas } = puertos()
    await editarImagenes(P, enc(conArt(conPrompt, ARTEFACTO_PEDIDO_DE_CORRECCION, { vuelta: 1, por_ref: { hook: { base: 0, cambios: 'más luz' } } })))
    expect((llamadas[0].otras_fotos ?? []).map((f) => [f.id, f.url])).toEqual([[REAL.id, REAL.url], [OTRA.id, OTRA.url]])
  })
  it('la imagen clave: `fotos_extra` y las fotos de un personaje valen acortadas', () => {
    const extra = fotosDelPlano({ fotos_extra: [CORTO_OTRA], personajes: [] }, REAL, [], FOTOS)
    expect(extra.otras.map((f) => f.url)).toEqual([OTRA.url])
    const conPersonaje = fotosDelPlano({ personajes: ['ana'] }, null, [{ id: 'ana', nombre: 'Ana', fotos_ids: [CORTO_OTRA] }], FOTOS)
    expect([conPersonaje.base, ...conPersonaje.otras].map((f) => f?.url)).toContain(OTRA.url)
    expect(conPersonaje.sin_foto).toEqual([])
  })
})
