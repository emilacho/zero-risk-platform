/**
 * GO Lenovo 11-nov 03:55Z · fila #19 del barrido de reglas rígidas (CC4) · la CLASE de la pieza es un dato de la plantilla. US$ 0 · sin red.
 *   · una familia NUEVA cargada en datos se comporta según su clase (no cae como «post»);
 *   · una familia de nombre conocido que su plantilla declara de otra clase sigue al dato;
 *   · una plantilla sin clase no abre encargos (409 visible), no se adivina.
 * Dos clientes de rubros distintos (restaurante y consultora B2B).
 */
import { describe, expect, it } from 'vitest'
import { claseDe, dibujaLaminas, tienePasarela } from '../clase'
import { briefEsDelEncargo, claseDeLaFamilia } from '../familia-del-brief'
import { abrirEncargo } from '../orquestador'
import { familiaDeLaminas } from '../orquestador-laminas'
import { familiaDeVideo } from '../orquestador-video'
import { familiaDePieza, productoresDeLaPieza } from '../paso-jefatura'
import { POST_IMG } from '../plantillas/post-img'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR, decidirPuerta } from '../sobre'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const CLIENTES = [{ rubro: 'restaurante', client_id: CLIENTE }, { rubro: 'consultora B2B', client_id: 'practica-b2b-consultora' }]
const con = (base: Plantilla, familia: string, clase: string | undefined): Plantilla => {
  const p = JSON.parse(JSON.stringify(base)) as Plantilla
  p.familia = familia; p.tipo = familia
  if (clase === undefined) delete p.clase; else p.clase = clase
  return p
}
const abrir = (pl: Plantilla, client_id: string, config: Record<string, unknown> = {}) => {
  const M = crearMemoria({ plantilla: pl, config })
  return abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: pl.familia }, client_id, target_step_id: TARGET_STEP_PRODUCIR })
}

describe('fila #19 · la clase sale de la plantilla, nunca del nombre', () => {
  it('una familia NUEVA de clase carrusel se dibuja y se revisa como carrusel; una de clase kit, como kit', () => {
    expect(familiaDeLaminas({ clase: 'carrusel' })).toBe('carrusel')
    expect(familiaDePieza({ clase: 'kit' })).toBe('kit')
    expect(productoresDeLaPieza(familiaDePieza({ clase: 'carrusel' })).map((p) => p.donde)).toContain('laminas')
  })
  it('un nombre conocido NO decide: «video_mesa» con clase post_img no es video; «post_img» con clase video sí lo es', () => {
    expect(familiaDeVideo({ clase: 'post_img' })).toBeNull()
    expect(familiaDeVideo({ clase: 'video' })).toBe('video')
    expect(familiaDePieza({ clase: undefined })).toBe('post_img') // solo tras la puerta, que no abre sin clase
  })
  it('lo que hace cada clase: solo carrusel y kit dibujan láminas; solo video no tiene pieza simple', () => {
    expect(['post_img', 'carrusel', 'kit', 'video', 'interna'].filter((c) => dibujaLaminas(claseDe({ clase: c })))).toEqual(['carrusel', 'kit'])
    expect(['post_img', 'carrusel', 'kit', 'video', 'interna'].filter((c) => !tienePasarela(claseDe({ clase: c })))).toEqual(['video'])
    expect(claseDe({ clase: 'Carrusel' })).toBeNull(); expect(claseDe({ clase: 'otra' })).toBeNull(); expect(claseDe(null)).toBeNull()
  })
})

describe('fila #19 · la puerta usa la clase de la plantilla', () => {
  for (const c of CLIENTES) {
    it(`${c.rubro}: una familia nueva «reel_corto» de clase video, con la oficina apagada, ESPERA (sin_sala); no cae a la pasarela como un post`, async () => {
      const r = await abrir(con(VIDEO_MESA, 'reel_corto', 'video'), c.client_id, { estado: 'apagada' })
      expect(r.status).toBe(409); expect(r.cuerpo).toMatchObject({ error: 'sin_sala', familia: 'reel_corto', sin_pasarela: true })
    })
    it(`${c.rubro}: una plantilla SIN clase no abre encargos (409 plantilla_sin_clase) y no gasta`, async () => {
      const r = await abrir(con(POST_IMG, 'post_nuevo', undefined), c.client_id, { familias_activas: ['post_nuevo'] })
      expect(r.status).toBe(409); expect(r.cuerpo).toMatchObject({ error: 'plantilla_sin_clase', familia: 'post_nuevo' })
    })
    it(`${c.rubro}: «video_mesa» que su plantilla declara post_img, apagada, va a la pasarela (manda el dato, no el nombre)`, async () => {
      const r = await abrir(con(POST_IMG, 'video_mesa', 'post_img'), c.client_id, { estado: 'apagada' })
      expect(r.status).toBe(409); expect(r.cuerpo).toMatchObject({ error: 'oficina_no_abre', motivo: 'oficina_apagada' })
    })
  }
  it('la puerta pura: sin pasarela ⇒ sin_sala; con pasarela ⇒ pasarela', () => {
    const s = { parte_id: PARTE, brief_id: 'B', dry_run: true, familia: 'x' }
    const off = { estado: 'apagada' as const, familias_activas: [], clientes_ensayo: [] }
    expect(decidirPuerta(s, off, TARGET_STEP_PRODUCIR, 'c', true).accion).toBe('sin_sala')
    expect(decidirPuerta(s, off, TARGET_STEP_PRODUCIR, 'c', false).accion).toBe('pasarela')
  })
})

describe('fila #19 · ¿el brief es de esta sala? las variantes se reconocen por la clase de sus plantillas', () => {
  const tabla = { Instagram: [{ formato: 'carrusel', familia: 'carrusel_ig_v1' }] } as never
  const b = { id: 'X', red: 'Instagram', formato: 'carrusel' }
  const leer = (clases: Record<string, string | null>) => async (f: string) => (clases[f] ?? null) as never
  it('restaurante: dos carruseles de nombre distinto y la misma clase → es de la sala', async () => {
    expect(await briefEsDelEncargo(b, 'carrusel_nuevo', async () => tabla, leer({ carrusel_ig_v1: 'carrusel', carrusel_nuevo: 'carrusel' }))).toEqual({ ok: true })
  })
  it('consultora B2B: misma tabla, pero la sala es de clase kit → no la produce; y sin clase legible de la otra, tampoco', async () => {
    expect((await briefEsDelEncargo(b, 'kit_nuevo', async () => tabla, leer({ carrusel_ig_v1: 'carrusel', kit_nuevo: 'kit' }))).ok).toBe(false)
    expect((await briefEsDelEncargo(b, 'carrusel_nuevo', async () => tabla, leer({ carrusel_nuevo: 'carrusel' }))).ok).toBe(false)
  })
  it('el lector de clase por el almacén: una lectura que falla da null (no rompe)', async () => {
    const P = { almacen: { leerPlantilla: async () => { throw new Error('base caída') } } } as never
    expect(await claseDeLaFamilia(P)('carrusel_ig_v1')).toBeNull()
  })
})
