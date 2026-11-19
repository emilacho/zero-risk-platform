/**
 * 19-nov · «LO REAL ES EL SET» (GO Lenovo 18-nov + ADENDA 1 + precisión de Emilio 16:34 · REPARTO a CC5 · puntos 1, 2 y 4; el 3 en pausa).
 *  · el agente que crea nombra VARIAS fotos por imagen («Referencia: foto:a, foto:b»): la primera es la base, las demás viajan con ella;
 *  · las que eligió valen para toda la pieza: una imagen sin nombradas hereda las de las otras (nadie arma un juego aparte);
 *  · sin foto real se genera igual con el estilo del manual, sin frenar, y la pieza lo dice (prueba con CERO fotos).
 * US$ 0: todo en seco, en memoria.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CONVENCION_DE_PROMPTS, leerPromptsDelIngeniero } from '../mesa/prompts'
import { MAX_OTRAS_FOTOS, avisoDeImagenGenerada, otrasFotosDeLaImagen } from '../foto-de-referencia'
import type { Tarjeta } from '../mesa/tipos'
import { traducirGuion } from '../video/guion'
import { fotosDelPlano, pedidosDeImagenClave, type PlanoDeLaHoja } from '../video/imagen-clave'
import { CLIENTE, FUENTES, PARTE, crearMemoria } from './memoria'
import { DIRECTORIO, crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, LAMINAS_OK, jugar, parteCon, pieza } from './mesa-arnes'

const PROPIAS = [{ id: 'base-1', url: 'https://f/base-1.jpg' }, { id: 'local-2', url: 'https://f/local-2.jpg' }, { id: 'persona-3', url: 'https://f/persona-3.jpg' }, { id: 'sin-url', url: null }]
const BASE = { id: 'base-1', url: 'https://f/base-1.jpg' }

describe('punto 1 · el lector toma TODAS las fotos de la línea «Referencia:»', () => {
  it('la primera es la base; las demás, en su orden y sin repetir', () => {
    const r = leerPromptsDelIngeniero('## hook\nPrompt: A bowl of soup, no text.\nReferencia: foto:780fc5e1, foto:8a2feb10 y foto:ff42157b, foto:780fc5e1', ['hook'])
    expect(r.por_ref.hook).toEqual({ prompt: 'A bowl of soup, no text.', foto_de_referencia: '780fc5e1', otras_fotos_de_referencia: ['8a2feb10', 'ff42157b'] })
  })
  it('con una sola foto queda EXACTO como antes (sin la clave nueva); con «ninguna», sin fotos', () => {
    expect(leerPromptsDelIngeniero('## hook\nPrompt: A bowl.\nReferencia: foto:abc-123', ['hook']).por_ref.hook).toEqual({ prompt: 'A bowl.', foto_de_referencia: 'abc-123' })
    expect(leerPromptsDelIngeniero('## hook\nPrompt: A bowl.\nReferencia: ninguna', ['hook']).por_ref.hook).toEqual({ prompt: 'A bowl.' })
  })
  it('la convención le dice al agente que puede nombrar varias, que valen para la pieza y que sin foto se genera igual', () => {
    expect(CONVENCION_DE_PROMPTS).toMatch(/Puedes nombrar varias en la misma línea/)
    expect(CONVENCION_DE_PROMPTS).toMatch(/La primera es la base que se edita; las demás viajan con ella/)
    expect(CONVENCION_DE_PROMPTS).toMatch(/una imagen sin referencia lleva las que nombraste en las otras/)
    expect(CONVENCION_DE_PROMPTS).toMatch(/se genera igual con el estilo del manual/)
  })
})

describe('punto 2 · las otras fotos de UNA imagen (puro)', () => {
  it('las que nombró para esta imagen, sin la base y sin repetir', () => {
    expect(otrasFotosDeLaImagen(PROPIAS, BASE, ['base-1', 'local-2', 'persona-3', 'local-2'], ['otra'])).toEqual({ otras: [{ id: 'local-2', url: 'https://f/local-2.jpg' }, { id: 'persona-3', url: 'https://f/persona-3.jpg' }], no_aptas: [] })
  })
  it('sin nombradas para esta imagen, hereda las de la pieza (en su orden)', () => {
    expect(otrasFotosDeLaImagen(PROPIAS, BASE, [undefined], ['persona-3', 'base-1', 'local-2']).otras.map((f) => f.id)).toEqual(['persona-3', 'local-2'])
  })
  it('las que nombró y no se pueden usar quedan en no_aptas; las heredadas que no sirven se callan', () => {
    expect(otrasFotosDeLaImagen(PROPIAS, BASE, ['base-1', 'sin-url', 'no-existe', 'local-2'], [])).toEqual({ otras: [{ id: 'local-2', url: 'https://f/local-2.jpg' }], no_aptas: ['sin-url', 'no-existe'] })
    expect(otrasFotosDeLaImagen(PROPIAS, BASE, [], ['sin-url', 'no-existe'])).toEqual({ otras: [], no_aptas: [] })
  })
  it(`tope: hasta ${MAX_OTRAS_FOTOS} con la base (la edición admite 16)`, () => {
    const muchas = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, url: `https://f/${i}.jpg` }))
    expect(otrasFotosDeLaImagen(muchas, { id: 'f0', url: 'https://f/0.jpg' }, muchas.map((f) => f.id), []).otras).toHaveLength(MAX_OTRAS_FOTOS)
  })
  it('cero fotos en toda la pieza: nada que mandar', () => {
    expect(otrasFotosDeLaImagen([], null, [undefined], [undefined])).toEqual({ otras: [], no_aptas: [] })
  })
})

describe('por la mesa (carrusel, en seco): el pedido al generador lleva las fotos que nombró el agente', () => {
  const ING = 'design-image-prompt-engineer'
  const DIR_ING: Tarjeta[] = DIRECTORIO.map((t) => (t.agente === ING ? { ...t, pertinente_en: ['carrusel:redacta_prompts', 'kit:redacta_prompts'] } : t))
  const CITAS = '## Citas\nA2 usé: los titulares\nA3 usé: el ritmo de las láminas\nA4 usé: la dirección visual del plato'
  const PROMPT = 'Overhead shot of the dish of the day on a light wooden table, natural light, no text.'
  async function correr(referencia: string, fotos?: typeof FUENTES.fotos) {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA, ...(fotos ? { fuentes: { fotos } } : {}) })
    M.P.mesa = crearMesaEnMemoria(DIR_ING)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const { ultima } = await jugar(M, id, a, (t) => {
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: pieza(LAMINAS_OK, CITAS) }
      if (t.tipo === 'redactar_prompts') return { texto: `## hook\nPrompt: ${PROMPT}\nReferencia: ${referencia}` }
      return undefined
    })
    return { M, id, ultima }
  }
  it('🔴 la base que nombró y las otras dos viajan juntas, en su orden', async () => {
    const { M } = await correr('foto:780fc5e1, foto:8a2feb10, foto:ff42157b')
    expect(M.llamadas.imagenFotos).toEqual(['780fc5e1'])
    expect(M.llamadas.imagenOtras).toEqual([['8a2feb10', 'ff42157b']])
  })
  it('🔴 una sola foto nombrada: el pedido es exactamente el de antes (sin otras)', async () => {
    const { M } = await correr('foto:780fc5e1')
    expect(M.llamadas.imagenFotos).toEqual(['780fc5e1'])
    expect(M.llamadas.imagenOtras).toEqual([[]])
  })
  it('🔴 una otra que no existe no frena: sale sin ella y una ficha lo dice', async () => {
    const { M, id, ultima } = await correr('foto:780fc5e1, foto:no-existe-9, foto:8a2feb10')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    expect(M.llamadas.imagenOtras).toEqual([['8a2feb10']])
    const f = M.encargos.get(id)!.estado_del_motor.fichas.find((x) => x.id.startsWith('imagen-otra-foto-no-apta'))
    expect(f).toMatchObject({ gravedad: 'sugerencia' })
    expect(f!.que).toMatch(/nombró la foto «no-existe-9» para «hook».*sale sin ella/)
  })
  it('🔴 CERO fotos (cerebro vacío): la imagen se genera igual, la pieza se cierra y una ficha dice que salió generada', async () => {
    const { M, id, ultima } = await correr('ninguna', [])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    expect(M.llamadas.imagen).toBe(1)
    expect(M.llamadas.imagenFotos).toEqual([null])
    expect(M.llamadas.imagenOtras).toEqual([[]])
    const f = M.encargos.get(id)!.estado_del_motor.fichas.find((x) => x.id.startsWith('imagen-generada'))
    expect(f).toMatchObject({ gravedad: 'sugerencia', que: avisoDeImagenGenerada('la imagen «hook»') })
    expect(M.encargos.get(id)!.estado_del_motor.fichas.filter((x) => x.gravedad === 'bloquea')).toEqual([])
  })
  it('🔴 con foto base no se dice «salió generada»', async () => {
    const { M, id } = await correr('foto:780fc5e1')
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((x) => x.id.startsWith('imagen-generada'))).toBe(false)
  })
})

describe('punto 2 en el video · las fotos que la hoja nombró valen para toda la pieza (imagen clave, puro)', () => {
  const URLV = (id: string) => `https://x.supabase.co/storage/v1/object/public/fotos/${id}.jpg`
  const PROPIAS_V = ['a7512c1c', '8abc6e54', '3b215a19', 'f00dcafe'].map((id) => ({ id, url: URLV(id) }))
  const HOJA = [
    '## Personajes',
    '- El Náufrago: esqueleto con ropa surfer, personaje de la marca · Fotos: foto:8abc6e54',
    '## Plano 1 · 0–3 s', 'Rol: captar', 'Se ve: el bowl en la terraza', 'Producto: sí', 'Foto: foto:a7512c1c, foto:3b215a19 · plato real y terraza del local',
    '## Plano 2 · 3–6 s', 'Rol: giro', 'Se ve: el bowl de cerca', 'Producto: sí', 'Foto: foto:a7512c1c',
    '## Plano 3 · 6–9 s', 'Rol: ambiente', 'Se ve: el Náufrago mira el bowl', 'Producto: sí', 'Foto: foto:a7512c1c', 'Personajes: El Náufrago',
    '## Plano 4 · 9–12 s', 'Rol: cierre', 'Se ve: el mar al atardecer', 'Producto: no', 'Foto: ninguna',
  ].join('\n')
  const pedidos = (fotos = PROPIAS_V) => {
    const g = traducirGuion(HOJA)
    expect(g.ok).toBe(true)
    return pedidosDeImagenClave({ planos: g.planos as PlanoDeLaHoja[], aptas: fotos, proporcion: '9:16', personajes: g.personajes, propias: fotos }).pedidos
  }
  it('🔴 un plano que no nombra otras fotos ni personajes hereda las de la pieza (sin repetir su base) y el prompt dice qué es', () => {
    const [p1, p2] = pedidos()
    expect(p1.otras_fotos?.map((f) => f.id)).toEqual(['3b215a19'])
    expect(p2.foto?.id).toBe('a7512c1c')
    expect(p2.otras_fotos?.map((f) => f.id)).toEqual(['3b215a19'])
    expect(p2.prompt).toMatch(/Image 2 is a real photo of the client chosen for this piece: keep the same real place, light and colors/)
  })
  it('🔴 un plano con personaje lleva SUS fotos y no hereda (no se mete el lugar como si fuera del personaje); el personaje no pasa a otros planos', () => {
    const [p1, p2, p3] = pedidos()
    expect(p3.otras_fotos?.map((f) => f.id)).toEqual(['8abc6e54'])
    expect([p1, p2].flatMap((p) => p.otras_fotos ?? []).map((f) => f.id)).not.toContain('8abc6e54')
  })
  it('🔴 sin base no se hereda nada (una foto heredada no se vuelve base de un plano que no la pidió)', () => {
    const p4 = pedidos()[3]
    expect(p4.foto).toBeNull()
    expect(p4.otras_fotos).toBeUndefined()
  })
  it('🔴 cero fotos: los planos piden igual, sin base ni otras', () => {
    const ps = pedidos([])
    expect(ps).toHaveLength(4)
    expect(ps.every((p) => p.foto === null && !p.otras_fotos)).toBe(true)
  })
  it('fotosDelPlano sin heredadas queda exacto como antes', () => {
    const base = PROPIAS_V[0]
    expect(fotosDelPlano({}, base, [], PROPIAS_V)).toEqual(fotosDelPlano({}, base, [], PROPIAS_V, []))
    expect(fotosDelPlano({}, null, [], PROPIAS_V, ['3b215a19'])).toEqual({ base: null, otras: [], texto: '', sin_foto: [] })
  })
})
