/**
 * RELEVO 19 · la TOMA de la foto: `con_personas`, `tipo_de_toma` y `formato` (firma de Emilio «SI APROBADO»). Modelo SIMULADO: US$ 0, nada real se llama ni se escribe.
 * Mismo molde de `etiquetar.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { A, AHORA, B, Z, crearBaseFalsa, tablasDeLaBase, type Tablas } from '../../__tests__/casos'
import { crearEscritor, type ValoresDeEtiqueta } from '../etiqueta-escritura'
import { etiquetar, type DepsDeEtiquetar } from '../etiquetar'
import type { PeticionConImagen } from '../modelo'

const BASE = 'https://zero.supabase.co'
const ALMACEN = `${BASE}/storage/v1/object/public/client-social-images`
const foto = (id: string, cliente: string, extra: Record<string, unknown> = {}) => ({
  id, client_id: cliente, owner_role: 'propio', handle: 'cuenta', post_id: `p-${id}`, tipo: 'post_imagen', medio: 'imagen', estado: 'ok', url: `${ALMACEN}/${cliente}/${id}.jpg`,
  caption: 'Cerramos la semana con un plato nuevo', posted_at: '2026-10-01T10:00:00.000Z', post_url: `https://red/${id}`, producto: [], producto_fuente: 'desconocido', created_at: '2026-10-01T10:00:00.000Z', ...extra,
})
const tablas = (extra: Record<string, unknown> = {}): Tablas => ({ ...tablasDeLaBase(), client_social_images: [foto('f1', A, extra), foto('fz', Z)] })

interface Espia { peticiones: PeticionConImagen[]; escrituras: Array<{ foto_id: string; cliente: string; valores: ValoresDeEtiqueta }>; registros: Array<Record<string, unknown>> }
const be32 = (n: number) => Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
const png = (w: number, h: number) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), be32(13), Buffer.from('IHDR'), be32(w), be32(h), Buffer.from([8, 6, 0, 0, 0]), Buffer.alloc(8)]).toString('base64')
const bueno = (extra: Record<string, unknown> = {}) => JSON.stringify({ que_muestra: 'un plato de pescado con arroz', producto_visto: ['Servicio uno'], texto_visible: 'PLATO DEL DÍA', confianza: 'alta', con_personas: 'no', tipo_de_toma: 'producto', ...extra })
const cuerpo = (extra: Record<string, unknown> = {}) => ({ cliente: A, foto: 'f1', workflow_id: 'wf-etiquetar', workflow_execution_id: 'ex-1', ...extra })
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any>

function armar(contesta: string | Error, over: Partial<DepsDeEtiquetar> = {}, t: Tablas = tablas()) {
  const espia: Espia = { peticiones: [], escrituras: [], registros: [] }
  const base = crearBaseFalsa(t)
  const deps: DepsDeEtiquetar = {
    consulta: base.consulta,
    urlDeLaBase: BASE,
    llamarModelo: async (p) => {
      espia.peticiones.push(p)
      if (contesta instanceof Error) throw contesta
      return { texto: contesta, usage: { input_tokens: 3200, output_tokens: 240 } }
    },
    bajarFoto: async () => ({ ok: true, base64: 'QUJD', tipo: 'image/jpeg', bytes: 3 }),
    escribir: async (a) => { espia.escrituras.push(a); return { ok: true } },
    registrar: async (fila) => { espia.registros.push(fila); return { ok: true } },
    ahora: () => AHORA,
    ...over,
  }
  return { deps, espia, base }
}
const conPng = (w: number, h: number): Partial<DepsDeEtiquetar> => ({ bajarFoto: async () => ({ ok: true, base64: png(w, h), tipo: 'image/png', bytes: 40 }) })
const TRES = ['con_personas', 'formato', 'tipo_de_toma']

afterEach(() => { vi.restoreAllMocks() })

describe('la ruta completa pone la toma junto con la etiqueta', () => {
  it('el modelo dice con personas y tipo de toma; el formato sale de las medidas de la imagen, no del modelo', async () => {
    const { deps, espia } = armar(bueno({ con_personas: 'si', tipo_de_toma: 'personas' }), conPng(1080, 1350))
    const r = await etiquetar(deps, cuerpo())
    expect(espia.escrituras[0].valores).toMatchObject({ con_personas: true, tipo_de_toma: 'personas', formato: 'vertical' })
    expect(salida(r).etiqueta).toMatchObject({ con_personas: true, tipo_de_toma: 'personas', formato: 'vertical' })
    expect(espia.peticiones[0].system).toMatch(/con_personas/)
    expect(espia.peticiones[0].system).toMatch(/tipo_de_toma/)
  })
  it('un formato que el modelo «dice» NO cuenta: solo las medidas', async () => {
    const { deps, espia } = armar(bueno({ formato: 'horizontal' }), conPng(1080, 1080))
    await etiquetar(deps, cuerpo())
    expect(espia.escrituras[0].valores.formato).toBe('cuadrado')
  })
  it('lo que el modelo contesta fuera de la lista no se inventa ni se acerca: queda vacío y la etiqueta se guarda igual', async () => {
    const { deps, espia } = armar(bueno({ con_personas: 'quizá', tipo_de_toma: 'paisaje' }))
    const r = await etiquetar(deps, cuerpo())
    expect(salida(r).modo).toBe('etiquetado')
    expect(espia.escrituras[0].valores).toMatchObject({ con_personas: null, tipo_de_toma: null, formato: null })
  })
  it('«texto/afiche» y las variantes con mayúsculas se leen; true y «Sí» también', async () => {
    for (const [dicho, quedo] of [['texto/afiche', 'texto_afiche'], ['Texto Afiche', 'texto_afiche'], ['AMBIENTE', 'ambiente'], ['otro', 'otro']] as const) {
      const { deps, espia } = armar(bueno({ tipo_de_toma: dicho, con_personas: true }))
      await etiquetar(deps, cuerpo())
      expect(espia.escrituras[0].valores, dicho).toMatchObject({ tipo_de_toma: quedo, con_personas: true })
    }
    const { deps, espia } = armar(bueno({ con_personas: 'Sí' }))
    await etiquetar(deps, cuerpo())
    expect(espia.escrituras[0].valores.con_personas).toBe(true)
  })
  it('la ruta normal NO pide las columnas nuevas al leer (así leer no depende de la migración)', async () => {
    const { deps, base } = armar(bueno())
    await etiquetar(deps, cuerpo())
    expect(base.llamadas.find((l) => l.tabla === 'client_social_images')?.columnas).not.toContain('tipo_de_toma')
  })
})

describe('`solo_toma`: la foto ya tiene etiqueta · se vuelve a mirar SOLO para poner esas 3 columnas', () => {
  const etiquetada = (extra: Record<string, unknown> = {}) => tablas({ etiquetada_en: '2026-10-07T00:00:00Z', ...extra })
  it('escribe EXACTAMENTE las 3 (nada de etiquetada_en ni de la etiqueta vieja), con UNA llamada, y lo dice', async () => {
    const { deps, espia, base } = armar(bueno({ con_personas: 'no', tipo_de_toma: 'ambiente' }), conPng(1080, 1350), etiquetada())
    const r = await etiquetar(deps, cuerpo({ solo_toma: true }))
    expect(salida(r)).toMatchObject({ modo: 'etiquetado', escribio: true, llamo_al_modelo: true })
    expect(espia.peticiones).toHaveLength(1)
    expect(espia.escrituras).toHaveLength(1)
    expect(Object.keys(espia.escrituras[0].valores).sort()).toEqual(TRES)
    expect(espia.escrituras[0].valores).toEqual({ con_personas: false, tipo_de_toma: 'ambiente', formato: 'vertical' })
    expect([...salida(r).columnas_escritas].sort()).toEqual(TRES)
    expect(espia.registros[0].metadata).toMatchObject({ solo_toma: true })
    expect(base.llamadas.find((l) => l.tabla === 'client_social_images')?.columnas).toContain('tipo_de_toma')
  })
  it('una foto SIN etiqueta previa se omite sin llamar al modelo (esa pasa por la ruta completa)', async () => {
    const { deps, espia } = armar(bueno())
    const r = await etiquetar(deps, cuerpo({ solo_toma: true }))
    expect(salida(r)).toMatchObject({ modo: 'omitida', motivo: 'sin_etiqueta_previa', llamo_al_modelo: false, escribio: false, costo_usd: 0 })
    expect(espia.peticiones).toHaveLength(0)
    expect(espia.escrituras).toHaveLength(0)
  })
  it('una foto con la toma ya puesta se omite (no se paga dos veces); con `forzar` se repite', async () => {
    const a = armar(bueno(), {}, etiquetada({ tipo_de_toma: 'producto' }))
    expect(salida(await etiquetar(a.deps, cuerpo({ solo_toma: true })))).toMatchObject({ modo: 'omitida', motivo: 'toma_ya_puesta', llamo_al_modelo: false })
    expect(a.espia.peticiones).toHaveLength(0)
    const b = armar(bueno(), {}, etiquetada({ tipo_de_toma: 'producto' }))
    expect(salida(await etiquetar(b.deps, cuerpo({ solo_toma: true, forzar: true }))).modo).toBe('etiquetado')
    expect(b.espia.peticiones).toHaveLength(1)
  })
  it('si el modelo falla no se escribe nada', async () => {
    const { deps, espia } = armar(new Error('el modelo cayó'), {}, etiquetada())
    const r = await etiquetar(deps, cuerpo({ solo_toma: true }))
    expect(salida(r).modo).toBe('respaldo')
    expect(espia.escrituras).toHaveLength(0)
  })
  it('el cliente B no toca la foto de A: sigue filtrando por cliente', async () => {
    const { deps, espia } = armar(bueno(), {}, etiquetada())
    const r = await etiquetar(deps, cuerpo({ cliente: B, solo_toma: true }))
    expect(r.status).toBe(404)
    expect(espia.peticiones).toHaveLength(0)
  })
  it('entrada inválida: `solo_toma` no booleano, o junto a una foto de prueba, se rechaza con 400', async () => {
    const { deps } = armar(bueno())
    expect((await etiquetar(deps, cuerpo({ solo_toma: 'si' }))).status).toBe(400)
    expect((await etiquetar(deps, { cliente: 'prueba-portero', prueba: true, solo_toma: true, foto_de_prueba: { base64: png(10, 10), tipo: 'image/png' }, workflow_id: 'w', workflow_execution_id: 'e' })).status).toBe(400)
  })
})

describe('crearEscritor acepta EXACTAMENTE tres combinaciones de columnas: 6 · 9 · 3', () => {
  const base6 = { que_muestra: 'un plato', producto_visto: ['Servicio uno'], etiquetada_en: '2026-10-07T00:00:00.000Z', etiqueta_modelo: 'claude-sonnet-5-5', texto_visible: '', etiqueta_confianza: 'alta' }
  const toma = { con_personas: true as boolean | null, tipo_de_toma: 'ambiente' as string | null, formato: 'cuadrado' as string | null }
  const ir = async (valores: Record<string, unknown>) => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(null, { status: 204 }))
    const r = await crearEscritor({ urlDeLaBase: BASE, llave: 'k', fetchImpl: f })({ foto_id: 'f', cliente: 'c', valores: valores as never })
    return { r, f }
  }
  it('las 3 solas (poner la toma a una foto ya etiquetada): UN PATCH con solo esas 3', async () => {
    const { r, f } = await ir(toma)
    expect(r.ok).toBe(true)
    expect(Object.keys(JSON.parse(String((f.mock.calls[0] as [string, RequestInit])[1].body))).sort()).toEqual(TRES)
  })
  it('las 6 solas siguen valiendo', async () => { expect((await ir(base6)).r.ok).toBe(true) })
  it('valores vacíos (null) de la toma valen: el modelo pudo no saberlo, el formato pudo no leerse', async () => {
    expect((await ir({ con_personas: null, tipo_de_toma: null, formato: null })).r.ok).toBe(true)
  })
  it('una toma a medias (1 o 2 de las 3), o las 6 con 1 o 2 de la toma, se NIEGA sin hacer la petición', async () => {
    for (const mezcla of [{ con_personas: true }, { con_personas: true, formato: 'vertical' }, { ...base6, tipo_de_toma: 'otro' }, { ...base6, con_personas: false, formato: 'vertical' }]) {
      const { r, f } = await ir(mezcla)
      expect(r.ok, JSON.stringify(Object.keys(mezcla))).toBe(false)
      expect(r.detalle).toMatch(/faltan/)
      expect(f).not.toHaveBeenCalled()
    }
  })
  it('un objeto vacío no escribe nada', async () => {
    const { r, f } = await ir({})
    expect(r.ok).toBe(false)
    expect(f).not.toHaveBeenCalled()
  })
  it('valores fuera de lista se NIEGAN: tipo_de_toma raro, formato raro, con_personas que no es verdadero/falso', async () => {
    for (const malo of [{ ...toma, tipo_de_toma: 'paisaje' }, { ...toma, formato: 'panorámico' }, { ...toma, con_personas: 'si' }, { ...toma, con_personas: 1 }]) {
      const { r, f } = await ir(malo)
      expect(r.ok, JSON.stringify(malo)).toBe(false)
      expect(f).not.toHaveBeenCalled()
    }
  })
})
