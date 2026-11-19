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
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, FOTOS, FUENTES, PARTE, PARTE_OTRO_PRODUCTO, PIEZA_OK, crearMemoria, correr, direccionGenerada, observacion, type Guion } from './memoria'
import { DIRECTORIO, crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, jugar, parteCon, pieza, seccionesDeLaminas } from './mesa-arnes'
import { MAX_FOTOS_POR_IMAGEN } from '../../imagen-sobre-foto'
import { ARTEFACTO_BORRADOR_IMAGEN, FUNCION_BORRADOR_IMAGEN, type BorradoresDeImagen } from '../mesa/borrador-imagen'
import { PASO_APROBAR_PROPUESTAS } from '../plantillas/video-mesa'
import { CONDICION_PROMPTS } from '../mesa/prompts'
import type { Plantilla } from '../tipos'

/** 🟡 CC6 23:11Z · fotos del cliente que existen pero NO son candidatas del protagonista (no sirven de base): con solo estas, no hay base */
const SIN_BASE = ['062ec4fa', '1e201f00']
const FOTOS_SIN_BASE = FOTOS.filter((f) => SIN_BASE.includes(f.id))

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
  it('🔴 tope: 15 otras con la base = 16, lo que admite la edición (q08 · fijo, no se mueve con la constante)', () => {
    const muchas = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, url: `https://f/${i}.jpg` }))
    const { otras } = otrasFotosDeLaImagen(muchas, { id: 'f0', url: 'https://f/0.jpg' }, muchas.map((f) => f.id), [])
    expect(otras).toHaveLength(15)
    expect(1 + otras.length).toBe(MAX_FOTOS_POR_IMAGEN)
    expect(MAX_OTRAS_FOTOS).toBe(15)
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
  async function correr(referencia: string, fotos?: typeof FUENTES.fotos, falla = false, o: { laminas?: string[][]; ingeniero?: string } = {}) {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA, ...(fotos ? { fuentes: { fotos } } : {}) })
    if (falla) M.imagenFalla = () => true
    M.P.mesa = crearMesaEnMemoria(DIR_ING)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const { ultima } = await jugar(M, id, a, (t) => {
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: pieza(o.laminas ?? LAMINAS_OK, CITAS) }
      if (t.tipo === 'redactar_prompts') return { texto: o.ingeniero ?? `## hook\nPrompt: ${PROMPT}\nReferencia: ${referencia}` }
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
  it('🔴 cero fotos y el generador falla: no se dice «salió generada» (la imagen no salió)', async () => {
    const { M, id } = await correr('ninguna', [], true)
    expect(M.llamadas.imagen).toBeGreaterThan(0)
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((x) => x.id.startsWith('imagen-generada'))).toBe(false)
  })
  it('🔴 con foto base no se dice «salió generada»', async () => {
    const { M, id } = await correr('foto:780fc5e1')
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((x) => x.id.startsWith('imagen-generada'))).toBe(false)
  })
  it('🔴 fotos nombradas que existen pero ninguna sirve de base: las otras NO viajan (sin base no hay edición) y la ficha dice que había fotos (q10)', async () => {
    const { M, id, ultima } = await correr(SIN_BASE.map((x) => `foto:${x}`).join(', '), FOTOS_SIN_BASE)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    expect(M.llamadas.imagenFotos).toEqual([null])
    expect(M.llamadas.imagenOtras).toEqual([[]])
    const f = M.encargos.get(id)!.estado_del_motor.fichas.find((x) => x.id.startsWith('imagen-generada'))
    expect(f!.que).toBe(avisoDeImagenGenerada('la imagen «hook»', SIN_BASE))
    expect(f!.que).toMatch(/se nombraron fotos reales \(foto:062ec4fa, foto:1e201f00\), pero ninguna sirve de base/)
    expect(f!.que).not.toMatch(/no tiene una foto real/)
  })
  it('🔴 una lámina sin fotos nombradas hereda las que el agente nombró en las otras láminas (q26)', async () => {
    const laminas = LAMINAS_OK.map((l) => (l[0] === 'problem' ? [l[0], l[1], l[2], 'generar: el local por dentro, luz de la tarde'] : l))
    const ingeniero = `## hook\nPrompt: ${PROMPT}\nReferencia: foto:780fc5e1, foto:8a2feb10\n## problem\nPrompt: The inside of the restaurant in the afternoon light, no text.\nReferencia: ninguna`
    const { M } = await correr('', undefined, false, { laminas, ingeniero })
    expect(M.llamadas.imagenFotos).toHaveLength(2)
    expect(M.llamadas.imagenFotos[0]).toBe('780fc5e1')
    const baseDelProblema = M.llamadas.imagenFotos[1]
    expect(baseDelProblema).not.toBeNull()
    expect(M.llamadas.imagenOtras[0]).toEqual(['8a2feb10'])
    // la del problema: las de la pieza (la base y la otra de «hook»), sin repetir su propia base
    expect(M.llamadas.imagenOtras[1]).toEqual(['780fc5e1', '8a2feb10'].filter((x) => x !== baseDelProblema))
    expect(M.llamadas.imagenOtras[1].length).toBeGreaterThan(0)
  })
})

describe('el borrador de imagen de cada propuesta lleva las mismas fotos (🟡 CC6 · q17, q18 y q19)', () => {
  const PASO_BORRADOR: Plantilla['pasos'][number] = { clave: 'borrador_imagen', tipo: 'codigo', quien: 'sala', funcion: FUNCION_BORRADOR_IMAGEN, condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: ARTEFACTO_BORRADOR_IMAGEN, tope_usd: 0.3 }
  const conBorrador = (): Plantilla => {
    const pasos = [...CARRUSEL_MESA.pasos]
    pasos.splice(pasos.findIndex((p) => p.clave === 'mesa') + 1, 0, PASO_BORRADOR, PASO_APROBAR_PROPUESTAS)
    return { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, propuestas: { n: 2 } } as Plantilla['limites'], pasos }
  }
  const propuesta = (i: number) => [`# Propuesta ${i + 1} · Camino ${i + 1}`, `Concepto: camino ${i + 1} · Por qué: porque sí ${i + 1}`, seccionesDeLaminas(LAMINAS_OK), '## Pie', `Pie ${i + 1}.`, '## Etiquetas', '#plato #hoy'].join('\n')
  const DOS = [propuesta(0), propuesta(1), CITAS_COMPLETAS].join('\n')
  const CON_INGENIERO = DIRECTORIO.map((t) => (t.agente === 'design-image-prompt-engineer' ? { ...t, pertinente_en: [...t.pertinente_en, `carrusel:${CONDICION_PROMPTS}`] } : t))
  async function borrador(ref1: string, ref2: string, fotos?: typeof FUENTES.fotos) {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: conBorrador(), ...(fotos ? { fuentes: { fotos } } : {}) })
    M.P.mesa = crearMesaEnMemoria(CON_INGENIERO)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const ING = `## P1-hook\nPrompt: plate on wood\nReferencia: ${ref1}\n## P2-hook\nPrompt: steam over the pot\nReferencia: ${ref2}`
    const { ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: DOS } : t.tipo === 'redactar_prompts' ? { texto: ING } : undefined))
    const b = M.encargos.get(id)!.estado_del_motor.artefactos[ARTEFACTO_BORRADOR_IMAGEN]?.datos as unknown as BorradoresDeImagen
    return { M, ultima, b }
  }
  it('🔴 el pedido del borrador manda la base y las otras que nombró, en su orden; la propuesta sin nombradas hereda las de la otra (q17)', async () => {
    const { M, ultima } = await borrador('foto:780fc5e1, foto:8a2feb10, foto:ff42157b', 'ninguna')
    expect(ultima.cuerpo.accion).toBe('esperar_dueno')
    expect(M.llamadas.imagenFotos).toHaveLength(2)
    expect(M.llamadas.imagenFotos[0]).toBe('780fc5e1')
    expect(M.llamadas.imagenOtras[0]).toEqual(['8a2feb10', 'ff42157b'])
  })
  it('🔴 sin base en el borrador, las otras NO viajan (q18)', async () => {
    const { M } = await borrador(SIN_BASE.map((x) => `foto:${x}`).join(', '), 'ninguna', FOTOS_SIN_BASE)
    expect(M.llamadas.imagenFotos).toEqual([null, null])
    expect(M.llamadas.imagenOtras).toEqual([[], []])
  })
  it('🔴 una foto nombrada que no se puede usar: el borrador sale sin ella y la propuesta lo anota (q19)', async () => {
    const { M, b } = await borrador('foto:780fc5e1, foto:no-existe-9, foto:8a2feb10', 'ninguna')
    expect(M.llamadas.imagenOtras[0]).toEqual(['8a2feb10'])
    expect(b.propuestas[0].errores?.some((x) => /el ingeniero nombró la foto «no-existe-9» para «.*hook» y no se puede usar/.test(x))).toBe(true)
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
  it('🔴 un plano con fotos extra PROPIAS no hereda las de otros planos (q24)', () => {
    const hoja = [
      '## Plano 1 · 0–3 s', 'Rol: captar', 'Se ve: el bowl en la terraza', 'Producto: sí', 'Foto: foto:a7512c1c, foto:3b215a19 · plato y terraza',
      '## Plano 2 · 3–6 s', 'Rol: giro', 'Se ve: el bowl en la barra', 'Producto: sí', 'Foto: foto:a7512c1c, foto:f00dcafe · plato y barra',
    ].join('\n')
    const g = traducirGuion(hoja)
    expect(g.ok).toBe(true)
    const [p1, p2] = pedidosDeImagenClave({ planos: g.planos as PlanoDeLaHoja[], aptas: PROPIAS_V, proporcion: '9:16', personajes: g.personajes, propias: PROPIAS_V }).pedidos
    expect(p1.otras_fotos?.map((f) => f.id)).toEqual(['3b215a19'])
    expect(p2.otras_fotos?.map((f) => f.id)).toEqual(['f00dcafe'])
  })
  it('fotosDelPlano sin heredadas queda exacto como antes', () => {
    const base = PROPIAS_V[0]
    expect(fotosDelPlano({}, base, [], PROPIAS_V)).toEqual(fotosDelPlano({}, base, [], PROPIAS_V, []))
    expect(fotosDelPlano({}, null, [], PROPIAS_V, ['3b215a19'])).toEqual({ base: null, otras: [], texto: '', sin_foto: [] })
  })
})

describe('punto 4 en el post de una imagen (el motor, en seco)', () => {
  const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
  const guion: Guion = {
    paquete: () => ({ texto: 'material del portero' }),
    direccion_visual: () => ({ texto: direccionGenerada() }),
    prompts: () => ({ texto: BUENOS_PROMPTS }),
    mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
    texto: () => ({ texto: PIEZA_OK }),
    revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  }
  const abrirPost = async (M: ReturnType<typeof crearMemoria>) => String((await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })).cuerpo.encargo_id)
  it('🔴 CERO fotos: cada imagen sale generada, la pieza se cierra y una ficha por imagen lo dice', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO, fuentes: { fotos: [] } })
    const id = await abrirPost(M)
    const { ultima } = await correr(M, id, guion)
    expect(ultima.cuerpo.estado).toBe('cerrado')
    expect(M.llamadas.imagen).toBeGreaterThan(0)
    const f = M.encargos.get(id)!.estado_del_motor.fichas.filter((x) => x.id.startsWith('imagen-generada'))
    expect(f).toHaveLength(M.llamadas.imagen)
    expect(f[0]).toMatchObject({ gravedad: 'sugerencia', que: avisoDeImagenGenerada('la imagen 1') })
  })
  it('🔴 con fotos aptas no se dice «salió generada»', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abrirPost(M)
    await correr(M, id, guion)
    expect(M.llamadas.imagenFotos.every((x) => x !== null)).toBe(true)
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((x) => x.id.startsWith('imagen-generada'))).toBe(false)
  })
})
