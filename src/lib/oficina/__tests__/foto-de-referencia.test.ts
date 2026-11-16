/**
 * SPRINT 1 · MEJORA 3 (GO-LENOVO 16-nov) · la imagen generada se EDITA sobre la foto real del cliente cuando hay una foto propia apta
 * del protagonista; sin ella, se genera como siempre. Sin rejas: si la foto no se pudo usar, la imagen sale igual y una ficha lo dice.
 * US$ 0: todo en dry_run o con el generador simulado.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { ejecutarCodigoL } from '../orquestador-laminas'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { estadoInicial, type Estado, type Paso } from '../tipos'
import { fotoDeReferencia, fotosDeReferencia } from '../foto-de-referencia'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, FOTOS, PARTE, PARTE_OTRO_PRODUCTO, PIEZA_OK, crearMemoria, correr, direccionGenerada, observacion, type Guion, type Memoria } from './memoria'

const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const guion: Guion = {
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  texto: () => ({ texto: PIEZA_OK }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
}
const abierto = async (M: Memoria) => String((await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })).cuerpo.encargo_id)
type Item = { indice: number; url: string; foto_referencia_id?: string }

describe('qué fotos sirven de referencia (pura)', () => {
  const fotos = [{ id: 'a', url: 'https://x/a.jpg' }, { id: 'b', url: 'https://x/b.jpg' }, { id: 'c', url: 'https://x/c.jpg' }, { id: 'd', url: null }]
  it('🔴 solo candidatas con dirección y que muestran el protagonista: la «cercana» no (editaría otro producto)', () => {
    expect(fotosDeReferencia(fotos, [{ id: 'a', cercana: true }, { id: 'b' }, { id: 'd' }, { id: 'zz' }]).map((x) => x.id)).toEqual(['b'])
  })
  it('🔴 la que eligió el director va primero; las excluidas no entran; sin repetidas', () => {
    expect(fotosDeReferencia(fotos, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'b' }], { preferida: 'c' }).map((x) => x.id)).toEqual(['c', 'a', 'b'])
    expect(fotosDeReferencia(fotos, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], { excluir: ['a'] }).map((x) => x.id)).toEqual(['b', 'c'])
    expect(fotosDeReferencia(fotos, [{ id: 'a' }, { id: 'b' }], { preferida: 'no-es-candidata' }).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('🔴 rota sobre las aptas; sin aptas → null (se genera como siempre)', () => {
    const aptas = fotosDeReferencia(fotos, [{ id: 'a' }, { id: 'b' }])
    expect([0, 1, 2].map((n) => fotoDeReferencia(aptas, n)?.id)).toEqual(['a', 'b', 'a'])
    expect(fotoDeReferencia([], 0)).toBeNull()
  })
})

// el brief del encebollado: las fotos reales etiquetadas del cliente muestran encebollado (aptas); el del ceviche solo tiene «cercanas»
describe('post de una imagen · la imagen generada sale de la foto real', () => {
  it('🔴 con fotos propias aptas, CADA imagen se pide sobre una de ellas y queda anotada en la imagen', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    await correr(M, id, guion)
    const e = M.encargos.get(id)!.estado_del_motor
    const cand = (e.artefactos['candidatas_foto'].datos.candidatas as Array<{ id: string; cercana?: boolean }>)
    const aptas = cand.filter((c) => !c.cercana).map((c) => c.id)
    expect(aptas.length).toBeGreaterThan(1)
    expect(M.llamadas.imagenFotos).toEqual([aptas[0], aptas[1]])
    const items = e.artefactos['imagenes'].datos.items as Item[]
    expect(items.map((i) => i.foto_referencia_id)).toEqual([aptas[0], aptas[1]])
    expect(e.fichas.some((f) => f.id.startsWith('imagen-sin-foto'))).toBe(false)
  })
  it('🔴 si la foto no se pudo usar, la imagen sale igual, SIN marca de referencia, y una ficha (sugerencia, no bloquea) dice por qué', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    M.referenciaNoUsada = (n) => (n === 1 ? 'la foto no es PNG, JPEG ni WEBP: se generó sin ella' : null)
    const id = await abierto(M)
    const { ultima } = await correr(M, id, guion)
    expect(ultima.cuerpo.estado).toBe('cerrado')
    const e = M.encargos.get(id)!.estado_del_motor
    const items = e.artefactos['imagenes'].datos.items as Item[]
    expect(items[0].foto_referencia_id).toBeUndefined()
    expect(items[1].foto_referencia_id).toBeTruthy()
    const f = e.fichas.find((x) => x.id.startsWith('imagen-sin-foto'))
    expect(f).toBeTruthy()
    expect(f!.gravedad).toBe('sugerencia')
    expect(f!.que).toMatch(/no es PNG, JPEG ni WEBP/)
  })
  for (const [caso, o] of [['sin fotos propias del cliente', { parte: PARTE_OTRO_PRODUCTO, fuentes: { fotos: [] } }], ['solo fotos «cercanas» (no muestran el protagonista: el ceviche)', {}]] as const) {
    it(`🔴 ${caso}: se genera como siempre (sin foto) y sin ficha`, async () => {
      const M = crearMemoria(o as never)
      const id = await abierto(M)
      await correr(M, id, guion)
      expect(M.llamadas.imagen).toBeGreaterThan(0)
      expect(M.llamadas.imagenFotos.every((x) => x === null)).toBe(true)
      expect(M.encargos.get(id)!.estado_del_motor.fichas.some((f) => f.id.startsWith('imagen-sin-foto'))).toBe(false)
    })
  }
})

describe('carrusel · cada imagen generada sobre su foto (las versiones de una imagen, sobre la misma)', () => {
  const PASO = CARRUSEL_IG_V1.pasos.find((p) => p.funcion === 'imagen_ref') as Paso
  const estado = (o: { candidatas: Array<{ id: string; cercana?: boolean }>; imagenes: Array<{ ref: string; modo: string; foto_id?: string }> }): Estado => {
    const e = estadoInicial()
    const art = (datos: Record<string, unknown>) => ({ datos, version: 1 }) as never
    e.artefactos = {
      encargo: art({ brief: {}, proporcion: '4:5', F: { fotos: FOTOS }, familia: 'carrusel', plataforma: 'instagram', elementos: [] }),
      candidatas_foto: art({ candidatas: o.candidatas }),
      visual_direction: art({ imagenes: o.imagenes, refs_generadas: o.imagenes.filter((i) => i.modo === 'generada').map((i) => i.ref) }),
      prompts_validos: art({ por_ref: Object.fromEntries(o.imagenes.filter((i) => i.modo === 'generada').map((i) => [i.ref, { prompts: [{ prompt: `escena ${i.ref} v1` }, { prompt: `escena ${i.ref} v2` }] }])) }),
    }
    return e
  }
  const encargo = (e: Estado) => ({ id: 'enc-1', client_id: CLIENTE, dry_run: true, estado_del_motor: e }) as never
  it('🔴 dos láminas generadas: cada una sobre una foto distinta, sin usar la que ya va como foto real', async () => {
    const [f0, f1, f2] = FOTOS.map((f) => f.id)
    const M = crearMemoria()
    const e = estado({ candidatas: [{ id: f0 }, { id: f1 }, { id: f2 }], imagenes: [{ ref: 'portada', modo: 'real', foto_id: f0 }, { ref: 'l2', modo: 'generada' }, { ref: 'l3', modo: 'generada' }] })
    const s = await ejecutarCodigoL(M.P, encargo(e), CARRUSEL_IG_V1, PASO)
    expect(M.llamadas.imagenFotos).toEqual([f1, f1, f2, f2])
    expect((s.res.artefacto!.items as Array<{ ref: string; foto_referencia_id?: string }>).map((i) => `${i.ref}:${i.foto_referencia_id}`)).toEqual([`l2:${f1}`, `l2:${f1}`, `l3:${f2}`, `l3:${f2}`])
  })
  it('🔴 solo cercanas (no muestran el protagonista): se genera sin foto', async () => {
    const M = crearMemoria()
    const e = estado({ candidatas: [{ id: FOTOS[0].id, cercana: true }], imagenes: [{ ref: 'l2', modo: 'generada' }] })
    await ejecutarCodigoL(M.P, encargo(e), CARRUSEL_IG_V1, PASO)
    expect(M.llamadas.imagenFotos).toEqual([null, null])
  })
})
