/**
 * 17-nov · Sprint 3 · T2 · LA FICHA DE PERSONAJE (GO Lenovo, firma de Emilio 11:54 · «nada obligatorio» 11:58).
 * La mesa puede escribir «## Personajes»; cada plano dice quién sale; la ficha de cada personaje (fotos propias o la imagen clave de su primer plano)
 * viaja como referencia en cada clip donde sale (`reference-to-video`). Sin «## Personajes», nada cambia.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { armarPedidoDePlano, cuerpoParaHiggsfield, rutaDelModelo, FICHAS_POR_OMISION, CATALOGO_POR_OMISION } from '../../video/parametros'
import { traducirGuion, leerPersonajes, idDelPersonaje, guionLegible } from '../video/guion'
import { traducirPropuestas } from '../video/propuestas'
import { fichasDeLaPieza, referenciasDelPlano, MAX_IMAGENES_POR_PERSONAJE, type FichaDePersonaje } from '../video/ficha'
import { huellaDelClip, pedidosPorPlano } from '../video/planos'
import { comoPedidoDelBrazo } from '../video/motor-planos'
import { crearPuertos } from '../adaptadores'
import { convencionDelGuion } from '../mesa/pedidos'
import type { FotoEtiquetada } from '../fotos'

const MAX_IMAGENES_DE_REFERENCIA_POR_PLANO = FICHAS_POR_OMISION['bytedance/seedance-2.5'].referencias_max
const U = (x: string) => `https://almacen.example/fotos/${x}.jpg`
const IC = (n: number) => `https://almacen.example/clave/p${n}.png`
const brief = { formato: 'reel', red: 'Instagram' }

const HOJA = [
  '## Personajes',
  '- **Ana**: mujer de 40 años, pelo negro corto, delantal verde · Fotos: foto:ana-frente, foto:ana-perfil',
  '- Luis — niño de 8 años, camiseta amarilla',
  '## Plano 1 · 0–4 s',
  'Se ve: Ana abre la puerta del local',
  'Personajes: Ana',
  '## Plano 2 · 4–9 s',
  'Se ve: Luis corre hacia el mostrador',
  'Personajes: Luis',
  '## Plano 3 · 9–14 s',
  'Se ve: Ana le sirve el plato a Luis',
  'Personajes: Ana y Luis',
  '## Plano 4 · 14–15 s',
  'Se ve: el plato servido, de cerca',
  'Personajes: ninguno',
  '## Audio',
  'guitarra suave',
].join('\n')

describe('el guion lee «## Personajes» y quién sale en cada plano', () => {
  const g = traducirGuion(HOJA)
  it('lee los personajes con su descripción y sus fotos', () => {
    expect(g.personajes).toEqual([
      { id: 'ana', nombre: 'Ana', descripcion: 'mujer de 40 años, pelo negro corto, delantal verde', fotos_ids: ['ana-frente', 'ana-perfil'] },
      { id: 'luis', nombre: 'Luis', descripcion: 'niño de 8 años, camiseta amarilla', fotos_ids: [] },
    ])
  })
  it('cada plano dice quién sale («y», coma, «ninguno»)', () => {
    expect(g.planos.map((p) => p.personajes)).toEqual([['ana'], ['luis'], ['ana', 'luis'], undefined])
    expect(g.avisos.join(' ')).not.toContain('sin ficha')
  })
  it('la sección de personajes no se toma por un plano', () => {
    expect(g.planos).toHaveLength(4)
  })
  it('un nombre que no está en «## Personajes» se avisa y sale sin ficha (no se adivina)', () => {
    const h = traducirGuion(HOJA.replace('Personajes: Luis\n', 'Personajes: Luis, Pedro\n'))
    expect(h.planos[1].personajes).toEqual(['luis'])
    expect(h.avisos.some((a) => a.includes('«Pedro»') && a.includes('sin ficha'))).toBe(true)
  })
  it('un nombre corto halla al único personaje que empieza así', () => {
    const h = traducirGuion(HOJA.replace('- **Ana**:', '- **Ana la dueña**:'))
    expect(h.personajes?.[0].id).toBe('ana-la-duena')
    expect(h.planos[0].personajes).toEqual(['ana-la-duena'])
  })
  it('sin «## Personajes» no aparece nada ni se avisa nada: es una herramienta, no una regla', () => {
    const sin = traducirGuion('## Plano 1 · 0–8 s\nSe ve: el local\n## Audio\nolas')
    expect(sin.personajes).toBeUndefined()
    expect(sin.planos[0].personajes).toBeUndefined()
    expect(sin.avisos.join(' ')).not.toMatch(/personaje/i)
  })
  it('la otra forma: «## Personaje · Ana» con «Descripción:» y «Fotos:»', () => {
    const ps = leerPersonajes([{ titulo: 'Personaje · Ana', lineas: ['Descripción: mujer de 40 años', 'Fotos: foto:ana-frente y foto:ana-perfil'] }])
    expect(ps).toEqual([{ id: 'ana', nombre: 'Ana', descripcion: 'mujer de 40 años', fotos_ids: ['ana-frente', 'ana-perfil'] }])
  })
  it('un nombre repetido se une al primero', () => {
    const ps = leerPersonajes([{ titulo: 'Personajes', lineas: ['- Ana: alta · Fotos: foto:ana-1', '- Ana: Fotos: foto:ana-2'] }])
    expect(ps).toEqual([{ id: 'ana', nombre: 'Ana', descripcion: 'alta', fotos_ids: ['ana-1', 'ana-2'] }])
  })
  it('la clave no lleva tildes ni espacios', () => expect(idDelPersonaje('  Doña Íngrid ')).toBe('dona-ingrid'))
})

describe('la ficha de cada personaje', () => {
  const g = traducirGuion(HOJA)
  const fotos: Record<string, string> = { 'ana-frente': U('ana-frente'), 'ana-perfil': U('ana-perfil') }
  const buscar = (id: string) => fotos[id] ?? null
  const claves = [1, 2, 3, 4].map((n) => ({ n, url: IC(n) }))
  const fichas = fichasDeLaPieza({ personajes: g.personajes, planos: g.planos, buscarFoto: buscar, imagenesClave: claves })

  it('con fotos propias, la ficha son esas fotos', () => {
    expect(fichas[0]).toMatchObject({ id: 'ana', origen: 'fotos_propias', imagenes: [U('ana-frente'), U('ana-perfil')] })
  })
  it('sin fotos propias, la ficha es la imagen clave del PRIMER plano donde sale', () => {
    expect(fichas[1]).toMatchObject({ id: 'luis', origen: 'primera_aparicion', imagenes: [IC(2)], plano_de_origen: 2 })
  })
  it('sin fotos ni imagen clave, viaja solo con su descripción', () => {
    const f = fichasDeLaPieza({ personajes: g.personajes, planos: g.planos, buscarFoto: () => null })
    expect(f.map((x) => x.origen)).toEqual(['solo_descripcion', 'solo_descripcion'])
    expect(f[0].fotos_no_halladas).toEqual(['ana-frente', 'ana-perfil'])
  })
  it('una foto nombrada que no existe se declara y no se inventa', () => {
    const f = fichasDeLaPieza({ personajes: [{ id: 'ana', nombre: 'Ana', fotos_ids: ['ana-frente', 'no-existe'] }], planos: g.planos, buscarFoto: buscar })
    expect(f[0]).toMatchObject({ imagenes: [U('ana-frente')], fotos_no_halladas: ['no-existe'], origen: 'fotos_propias' })
  })
  it(`como mucho ${MAX_IMAGENES_POR_PERSONAJE} imágenes por personaje`, () => {
    const ids = Array.from({ length: 7 }, (_, i) => `f${i}`)
    const f = fichasDeLaPieza({ personajes: [{ id: 'ana', nombre: 'Ana', fotos_ids: ids }], planos: g.planos, buscarFoto: (id) => U(id) })
    expect(f[0].imagenes).toEqual(ids.slice(0, MAX_IMAGENES_POR_PERSONAJE).map(U))
  })
  it('una dirección que no es https no entra en la ficha', () => {
    const f = fichasDeLaPieza({ personajes: [{ id: 'ana', nombre: 'Ana', fotos_ids: ['x'] }], planos: g.planos, buscarFoto: () => 'http://inseguro/x.jpg' })
    expect(f[0]).toMatchObject({ imagenes: [], origen: 'solo_descripcion', fotos_no_halladas: ['x'] })
  })

  describe('las referencias de un plano', () => {
    it('el primer cuadro va primero (fuera de la lista) y el texto numera cada imagen', () => {
      const r = referenciasDelPlano(g.planos[2], fichas, IC(3))
      expect(r.urls).toEqual([U('ana-frente'), U('ana-perfil'), IC(2)])
      expect(r.texto).toContain('Image 1 is the opening frame of this shot')
      expect(r.texto).toContain('Images 2-3 are the character reference of «Ana»: mujer de 40 años')
      expect(r.texto).toContain('Image 4 is the character reference of «Luis»: niño de 8 años')
    })
    it('el plano de origen de una ficha por primera aparición no se lleva a sí mismo', () => {
      const r = referenciasDelPlano(g.planos[1], fichas, IC(2))
      expect(r.urls).toEqual([])
      expect(r.sin_imagen).toEqual(['Luis'])
      expect(r.texto).toBe('Character «Luis»: niño de 8 años, camiseta amarilla. Keep this look identical in every shot.')
    })
    it('sin primer cuadro, la ficha empieza en la imagen 1', () => {
      const r = referenciasDelPlano(g.planos[0], fichas, null)
      expect(r.texto).toMatch(/^Images 1-2 are the character reference of «Ana»/)
    })
    it('un plano sin personajes no lleva nada', () => {
      expect(referenciasDelPlano(g.planos[3], fichas, IC(4))).toEqual({ urls: [], texto: '', sin_imagen: [] })
    })
    it('nunca pasa de lo que admite el proveedor, contando el primer cuadro', () => {
      const muchas: FichaDePersonaje[] = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, nombre: `P${i}`, imagenes: [0, 1, 2, 3].map((k) => U(`p${i}-${k}`)), origen: 'fotos_propias', fotos_no_halladas: [] }))
      const r = referenciasDelPlano({ n: 1, personajes: muchas.map((x) => x.id) }, muchas, IC(1))
      expect(r.urls).toHaveLength(MAX_IMAGENES_DE_REFERENCIA_POR_PLANO - 1)
    })
  })
})

describe('el pedido de cada plano lleva la ficha y va por referencias', () => {
  const g = traducirGuion(HOJA)
  const fotos: FotoEtiquetada[] = [
    { id: 'ana-frente', url: U('ana-frente'), origen: 'propia' },
    { id: 'ana-perfil', url: U('ana-perfil'), origen: 'propia' },
  ]
  const r = pedidosPorPlano({ guion: g, brief, fotos, clave: 'enc:b:r1', relacion: '9:16', imagenesClave: [1, 2, 3, 4].map((n) => ({ n, url: IC(n) })) })
  if (!r.ok) throw new Error(r.errores.join(' · '))
  const [p1, p2, p3, p4] = r.pedidos

  it('devuelve las fichas de la pieza', () => expect(r.fichas.map((f) => [f.id, f.origen])).toEqual([['ana', 'fotos_propias'], ['luis', 'primera_aparicion']]))
  it('el plano con ficha lleva sus referencias, sus personajes y el texto de la ficha delante del pedido', () => {
    expect(p3.referencias).toEqual([U('ana-frente'), U('ana-perfil'), IC(2)])
    expect(p3.personajes).toEqual(['ana', 'luis'])
    expect(p3.fotos).toEqual([IC(3)])
    expect(p3.prompt.startsWith('Image 1 is the opening frame of this shot')).toBe(true)
  })
  it('va por reference-to-video con su primer cuadro primero y la proporción de la red', () => {
    const ped = { modelo: 'bytedance/seedance-2.5', prompt: p3.prompt, formato: p3.formato, segundos: p3.segundos, resolucion: p3.resolucion, relacion: p3.relacion, audio: true, fotos: p3.fotos, referencias: p3.referencias, plano: true }
    expect(rutaDelModelo(ped)).toBe('bytedance/seedance-2.5/reference-to-video')
    const cuerpo = cuerpoParaHiggsfield(ped)
    expect(cuerpo.image_urls).toEqual([IC(3), U('ana-frente'), U('ana-perfil'), IC(2)])
    expect(cuerpo.aspect_ratio).toBe('9:16')
    expect(cuerpo.image_url).toBeUndefined()
  })
  it('el plano de origen de Luis (sin otra imagen) sigue por imagen a video, con su descripción en el pedido', () => {
    expect(p2.referencias).toBeUndefined()
    expect(p2.prompt.startsWith('Character «Luis»')).toBe(true)
    expect(rutaDelModelo({ modelo: 'bytedance/seedance-2.5', fotos: p2.fotos, plano: true })).toBe('bytedance/seedance-2.5/image-to-video')
  })
  it('un plano sin personajes queda exactamente como antes (misma huella: los clips pagados se reutilizan)', () => {
    expect(p4.referencias).toBeUndefined()
    expect(p4.personajes).toBeUndefined()
    const antes = createHash('sha256').update(JSON.stringify(['clip.v1', IC(4), p4.prompt, p4.formato, p4.segundos, p4.resolucion, p4.relacion, true])).digest('hex').slice(0, 40)
    expect(p4.huella).toBe(antes)
  })
  it('la ficha entra en la huella: otro personaje, otro clip', () => {
    const a = huellaDelClip({ fuente: IC(3), prompt: 'x', formato: 'reel', segundos: 5, resolucion: '720p', relacion: '9:16', audio: true, referencias: [U('a')] })
    const b = huellaDelClip({ fuente: IC(3), prompt: 'x', formato: 'reel', segundos: 5, resolucion: '720p', relacion: '9:16', audio: true, referencias: [U('b')] })
    expect(a).not.toBe(b)
    expect(huellaDelClip({ fuente: IC(3), prompt: 'x', formato: 'reel', segundos: 5, resolucion: '720p', relacion: '9:16', audio: true, referencias: [] })).toBe(huellaDelClip({ fuente: IC(3), prompt: 'x', formato: 'reel', segundos: 5, resolucion: '720p', relacion: '9:16', audio: true }))
  })
  it('el pedido al brazo lleva la ficha', () => {
    expect(comoPedidoDelBrazo(p3).referencias).toEqual(p3.referencias)
    expect('referencias' in comoPedidoDelBrazo(p4)).toBe(false)
  })
  it('el plano 1 (Ana con fotos propias) lleva sus dos fotos', () => {
    expect(p1.referencias).toEqual([U('ana-frente'), U('ana-perfil')])
  })
})

describe('el brazo valida la ficha', () => {
  const base = { prompt: 'Ana abre la puerta del local', formato: 'reel', segundos: 5, fotos: [IC(1)] }
  it('acepta direcciones https y quita repetidas', () => {
    const v = armarPedidoDePlano({ ...base, referencias: [U('a'), U('a'), U('b')] })
    expect(v.ok && v.pedido.referencias).toEqual([U('a'), U('b')])
  })
  it('rechaza lo que no es una lista de https', () => {
    const v = armarPedidoDePlano({ ...base, referencias: ['http://x/a.jpg'] })
    expect(v.ok).toBe(false)
  })
  it(`rechaza más de ${MAX_IMAGENES_DE_REFERENCIA_POR_PLANO} imágenes contando la foto del plano`, () => {
    const v = armarPedidoDePlano({ ...base, referencias: Array.from({ length: MAX_IMAGENES_DE_REFERENCIA_POR_PLANO }, (_, i) => U(`r${i}`)) })
    expect(v.ok).toBe(false)
    const w = armarPedidoDePlano({ ...base, referencias: Array.from({ length: MAX_IMAGENES_DE_REFERENCIA_POR_PLANO - 1 }, (_, i) => U(`r${i}`)) })
    expect(w.ok).toBe(true)
  })
  it('sin referencias, el pedido es el de siempre', () => {
    const v = armarPedidoDePlano(base)
    expect(v.ok && 'referencias' in v.pedido).toBe(false)
  })
  it('un video de una toma (no plano) nunca va por la ficha', () => {
    expect(rutaDelModelo({ modelo: 'bytedance/seedance-2.5', fotos: [], referencias: [U('a')] })).toBe('bytedance/seedance-2.5/text-to-video')
  })
})

describe('la mesa conoce la herramienta, sin obligación', () => {
  const c = convencionDelGuion({ segundos_min: 8, segundos_max: 15, propuestas: 3 })
  it('le muestra la sección «## Personajes» como opcional y la línea «Personajes:» del plano', () => {
    expect(c).toContain('## Personajes   (opcional')
    expect(c).toContain('Personajes: <los nombres de «## Personajes» que salen en este plano> | ninguno')
  })
  it('lo que muestra se puede leer tal cual', () => {
    const g = leerPersonajes([{ titulo: 'Personajes', lineas: ['- Ana: mujer de 40 años, pelo negro · Fotos: foto:ana-1'] }])
    expect(g[0]).toMatchObject({ id: 'ana', fotos_ids: ['ana-1'] })
  })
})

describe('con varias propuestas, cada una trae sus personajes', () => {
  const md = ['# Propuesta 1 · La dueña', 'Concepto: Ana abre', HOJA, '# Propuesta 2 · Sin personas', 'Concepto: el local', '## Plano 1 · 0–8 s', 'Se ve: la fachada', '## Audio', 'olas'].join('\n')
  const r = traducirPropuestas(md, { objetivo: 2 })
  if (!r.ok) throw new Error(r.motivo)
  it('la propuesta con personajes los lleva en su guion; la otra no', () => {
    expect(r.resultado.propuestas[0].guion.personajes?.map((x) => x.id)).toEqual(['ana', 'luis'])
    expect(r.resultado.propuestas[0].guion.planos[2].personajes).toEqual(['ana', 'luis'])
    expect(r.resultado.propuestas[1].guion.personajes).toBeUndefined()
  })
  it('el guion legible para quien revisa nombra los personajes', () => {
    const t = guionLegible(r.resultado.propuestas[0].guion)
    expect(t).toContain('Personajes: Ana (mujer de 40 años, pelo negro corto, delantal verde) · Luis (niño de 8 años, camiseta amarilla)')
    expect(t).toContain('  Personajes: Ana, Luis')
    expect(guionLegible(r.resultado.propuestas[1].guion)).not.toContain('Personajes')
  })
})

describe('el adaptador manda la ficha al brazo (al cotizar y al enviar)', () => {
  const ENV = { baseUrl: 'https://app.test', internalKey: 'k', bucket: 'oficina', runnerUrl: 'https://runner.test' }
  const g = traducirGuion(HOJA)
  const fotos: FotoEtiquetada[] = [{ id: 'ana-frente', url: U('ana-frente'), origen: 'propia' }]
  const r = pedidosPorPlano({ guion: g, brief, fotos, clave: 'enc:b:r1', relacion: '9:16', imagenesClave: [1, 2, 3, 4].map((n) => ({ n, url: IC(n) })) })
  if (!r.ok) throw new Error(r.errores.join(' · '))
  const [, , p3, p4] = r.pedidos
  const puerto = (cuerpos: Array<Record<string, unknown>>, respuesta: Record<string, unknown>) =>
    crearPuertos({} as never, ENV as never, (async (_u: string, init?: { body?: string }) => { cuerpos.push(JSON.parse(String(init?.body ?? '{}'))); return { ok: true, status: 200, json: async () => respuesta } }) as never).video!
  it('al enviar', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    await puerto(cuerpos, { request_id: 'r1', status: 'queued' }).enviar({ pedido: comoPedidoDelBrazo(p3), client_id: 'c', encargo_id: 'e', dry_run: false, tope_usd: 5, workflow_id: 'w', workflow_execution_id: 'x' })
    expect(cuerpos[0]).toMatchObject({ plano: true, referencias: p3.referencias, fotos: [IC(3)] })
  })
  it('al cotizar (la cotización gratis tiene que ver la misma ruta que el envío)', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    await puerto(cuerpos, { dry_run: true, costo_estimado_usd: 1.3 }).cotizar!({ pedido: comoPedidoDelBrazo(p3), client_id: 'c', encargo_id: 'e', tope_usd: 5, workflow_id: 'w', workflow_execution_id: 'x' })
    expect(cuerpos[0]).toMatchObject({ plano: true, referencias: p3.referencias, dry_run: true })
  })
  it('un plano sin ficha no manda la clave', async () => {
    const cuerpos: Array<Record<string, unknown>> = []
    await puerto(cuerpos, { request_id: 'r1', status: 'queued' }).enviar({ pedido: comoPedidoDelBrazo(p4), client_id: 'c', encargo_id: 'e', dry_run: false, tope_usd: 5, workflow_id: 'w', workflow_execution_id: 'x' })
    expect('referencias' in cuerpos[0]).toBe(false)
  })
})

describe('casos de borde (los que encontraron los mutantes)', () => {
  const ana: FichaDePersonaje = { id: 'ana', nombre: 'Ana', imagenes: [U('ana-1'), U('ana-2')], origen: 'fotos_propias', fotos_no_halladas: [] }
  it('la imagen del primer cuadro no se repite como ficha', () => {
    expect(referenciasDelPlano({ n: 1, personajes: ['ana'] }, [ana], U('ana-1')).urls).toEqual([U('ana-2')])
  })
  it('el plano de origen no lleva su ficha aunque su primer cuadro sea otra imagen', () => {
    const luis: FichaDePersonaje = { id: 'luis', nombre: 'Luis', imagenes: [IC(2)], origen: 'primera_aparicion', plano_de_origen: 2, fotos_no_halladas: [] }
    expect(referenciasDelPlano({ n: 2, personajes: ['luis'] }, [luis], U('foto-encuadrada')).urls).toEqual([])
    expect(referenciasDelPlano({ n: 3, personajes: ['luis'] }, [luis], U('foto-encuadrada')).urls).toEqual([IC(2)])
  })
  it('un nombre corto que empieza a DOS personajes no se adivina', () => {
    const h = traducirGuion(['## Personajes', '- Ana María: alta', '- Ana Lucía: baja', '## Plano 1 · 0–8 s', 'Se ve: dos mujeres', 'Personajes: Ana'].join('\n'))
    expect(h.planos[0].personajes).toBeUndefined()
    expect(h.avisos.some((a) => a.includes('«Ana»'))).toBe(true)
  })
  it('un título de personajes con tiempos no se toma por un plano', () => {
    const h = traducirGuion(['## Personajes · 0–15 s', '- Ana: alta', '## Plano 1 · 0–8 s', 'Se ve: Ana', 'Personajes: Ana'].join('\n'))
    expect(h.planos).toHaveLength(1)
    expect(h.personajes?.map((x) => x.id)).toEqual(['ana'])
  })
  it('la huella del pedido cambia con la ficha', () => {
    const g = traducirGuion(HOJA)
    const conFicha = pedidosPorPlano({ guion: g, brief, fotos: [{ id: 'ana-frente', url: U('ana-frente'), origen: 'propia' }], clave: 'k', relacion: '9:16', imagenesClave: [{ n: 1, url: IC(1) }] })
    const sinFicha = pedidosPorPlano({ guion: g, brief, fotos: [], clave: 'k', relacion: '9:16', imagenesClave: [{ n: 1, url: IC(1) }] })
    if (!conFicha.ok || !sinFicha.ok) throw new Error('no armó')
    expect(conFicha.pedidos[0].referencias).toEqual([U('ana-frente')])
    expect(conFicha.pedidos[0].huella).not.toBe(huellaDelClip({ fuente: IC(1), prompt: conFicha.pedidos[0].prompt, formato: 'reel', segundos: conFicha.pedidos[0].segundos, resolucion: conFicha.pedidos[0].resolucion, relacion: '9:16', audio: true }))
  })
  it('con una sola propuesta la mesa también ve la sección opcional', () => {
    expect(convencionDelGuion({ segundos_min: 8, segundos_max: 15, propuestas: 1 })).toContain('## Personajes   (opcional')
  })
})

describe('el tope de imágenes es el del modelo del catálogo (el mismo que valida la ruta · CC7 sobre #1108)', () => {
  const corto = { ...CATALOGO_POR_OMISION, fichas: { ...CATALOGO_POR_OMISION.fichas, 'bytedance/seedance-2.5': { ...FICHAS_POR_OMISION['bytedance/seedance-2.5'], referencias_max: 3 } } }
  const g = traducirGuion(HOJA)
  const fotos: FotoEtiquetada[] = [{ id: 'ana-frente', url: U('ana-frente'), origen: 'propia' }, { id: 'ana-perfil', url: U('ana-perfil'), origen: 'propia' }]
  const r = pedidosPorPlano({ guion: g, brief, fotos, clave: 'k', relacion: '9:16', imagenesClave: [1, 2, 3, 4].map((n) => ({ n, url: IC(n) })), catalogo: corto })
  if (!r.ok) throw new Error(r.errores.join(' · '))
  it('la oficina recorta la ficha al tope del modelo, contando el primer cuadro', () => {
    expect(r.pedidos[2].referencias).toEqual([U('ana-frente'), U('ana-perfil')])
  })
  it('y la ruta, con ese mismo catálogo, acepta lo que armó la oficina', () => {
    const p = r.pedidos[2]
    expect(armarPedidoDePlano({ prompt: p.prompt, formato: p.formato, segundos: p.segundos, fotos: p.fotos, referencias: p.referencias }, corto).ok).toBe(true)
  })
  it('la ruta rechaza más de lo que admite el modelo, con su nombre', () => {
    const v = armarPedidoDePlano({ prompt: 'Ana abre la puerta del local', formato: 'reel', segundos: 5, fotos: [IC(1)], referencias: [U('a'), U('b'), U('c')] }, corto)
    expect(v.ok).toBe(false)
    expect(!v.ok && v.errores.join(' ')).toContain('como mucho 3 imágenes de referencia contando su foto, lo que admite bytedance/seedance-2.5')
  })
  it('un modelo sin referencias deja el plano sin ficha (sigue por imagen a video)', () => {
    const cero = { ...corto, fichas: { ...corto.fichas, 'bytedance/seedance-2.5': { ...corto.fichas['bytedance/seedance-2.5'], referencias_max: 1 } } }
    const s = pedidosPorPlano({ guion: g, brief, fotos, clave: 'k', relacion: '9:16', imagenesClave: [1, 2, 3, 4].map((n) => ({ n, url: IC(n) })), catalogo: cero })
    if (!s.ok) throw new Error(s.errores.join(' · '))
    expect(s.pedidos.every((p) => !p.referencias)).toBe(true)
  })
})
