/**
 * 18-nov · GO de Lenovo (firma de Emilio 14:16 Zúrich) · «los que crean la pieza VEN las fotos y razonan con ellas» · parte de CC2: la mesa.
 *
 * Caso real (fixture leído de la base, solo lectura): la mesa del reel de Olón (`57101e2a`). La foto del personaje (`8abc6e54`, ilustración del
 * esqueleto náufrago) estaba en la lista de texto, pero ningún turno la vio: el pedido iba con `images: []`. En la integración A18, el plano 2 de la
 * propuesta 3 dice «Foto: ninguna · Personajes: ninguno» y pide «a generated skeleton character».
 *
 * Lo que se prueba es lo EXACTO (código): qué fotos llegan como imagen a cada turno, con qué rótulo, y que la instrucción pida nombrar la foto del
 * elemento real y no inventarlo. Que el modelo lo cumpla se juzga con una pieza real (regla de Emilio: un arreglo de salida cierra con pieza real).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FotoEtiquetada } from '../fotos'
import type { Aporte } from '../mesa/tipos'
import { MAX_IMAGENES } from '../../imagenes-del-pedido'
import { fotosALaVista, imagenesDelTurno, rotuloDeLaFoto, REGLA_DE_LOS_ELEMENTOS_REALES, LA_CRITICA_MIRA_LAS_FOTOS, MAX_FOTOS_DE_LA_LISTA } from '../mesa/fotos-a-la-vista'
import { LISTA_DE_FOTOS, armarTarea, convencionDelGuion, pedidoDeAgente, type ContextoDeTurno } from '../mesa/pedidos'
import { tareaDeLaCritica } from '../mesa/critica'
import { traducirGuion } from '../video/guion'
import { montar, jugar } from './mesa-arnes'

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '__fixtures__', 'mesa-reel-olon-57101e2a-fotos-real.json'), 'utf8')) as { fotos: FotoEtiquetada[]; libro: Aporte[] }
const PERSONAJE = FIX.fotos.find((f) => f.id.startsWith('8abc6e54'))!
const antesDe = (n: number) => FIX.libro.filter((a) => a.n < n)
/** los turnos que crean, critican o integran: la lista va escrita aquí (no se lee de la constante), para que quitar uno de la constante haga caer la prueba */
const LOS_QUE_VEN = ['dirigir', 'aportar', 'responder', 'criticar', 'integrar', 'devolver_citas', 'redactar_prompts'] as const

describe('el caso real: el reel de Olón (57101e2a)', () => {
  it('control: la foto del personaje está en la lista y A18 pidió un esqueleto inventado (lo que pasó en T7d)', () => {
    expect(PERSONAJE.que_muestra).toMatch(/esqueleto/i)
    expect(LISTA_DE_FOTOS(FIX.fotos)).toContain(PERSONAJE.id)
    const a18 = FIX.libro.find((a) => a.n === 18)!
    expect(a18.tipo).toBe('integra')
    expect(a18.texto).toMatch(/Foto: ninguna\s*\nPersonajes: ninguno\s*\nPrompt de imagen: Medium shot of a generated skeleton character/)
  })

  it('la foto del personaje llega como IMAGEN, con su rótulo, a todos los turnos que crean, critican o integran', () => {
    for (const tipo of LOS_QUE_VEN) expect(imagenesDelTurno(tipo, FIX.fotos), tipo).toContainEqual({ url: PERSONAJE.url, label: rotuloDeLaFoto(PERSONAJE.id) })
  })

  it('tope: el máximo técnico del cable (20), sin repetidas, todas http(s) y todas de la lista que lee la mesa', () => {
    const ims = imagenesDelTurno('integrar', FIX.fotos)
    expect(ims).toHaveLength(MAX_IMAGENES)
    expect(new Set(ims.map((i) => i.url)).size).toBe(ims.length)
    for (const i of ims) expect(i.url).toMatch(/^https:\/\//)
    const lista = LISTA_DE_FOTOS(FIX.fotos)
    for (const i of ims) expect(lista).toContain(i.label!.replace(/^foto:/, ''))
  })

  it('orden ESTABLE: por confianza (alta, media, baja) y, a igual confianza, en el orden de la lista; las mismas 20 en todos los turnos', () => {
    const ids = fotosALaVista(FIX.fotos).map((f) => f.id.slice(0, 8))
    const conf = (x: string) => FIX.fotos.find((f) => f.id.startsWith(x))!.etiqueta_confianza!
    const pesos = ids.map((x) => ['alta', 'media', 'baja'].indexOf(conf(x)))
    expect(pesos).toEqual([...pesos].sort((a, b) => a - b))
    // del caso real: 11 alta + 4 media + las 5 primeras baja de la lista; quedan fuera las 4 últimas baja
    expect(pesos.filter((x) => x === 0)).toHaveLength(11)
    expect(pesos.filter((x) => x === 1)).toHaveLength(4)
    const fuera = FIX.fotos.slice(0, MAX_FOTOS_DE_LA_LISTA).map((f) => f.id.slice(0, 8)).filter((x) => !ids.includes(x))
    expect(fuera).toEqual(['5d6eb7fb', '310dabf6', '13a45320', '9fb0de4d'])
    expect(fuera.every((x) => conf(x) === 'baja')).toBe(true)
  })

  it('el tablero no mueve la vista: aunque los aportes nombren (o descarten) fotos de confianza baja, la del personaje no sale de la vista', () => {
    // el libro real hasta A17 nombra 14 fotos, entre ellas varias de confianza baja que la dirección DESCARTÓ (A8: «baja/media con personas: 8eb78d2f, febd9334…»)
    expect(antesDe(18).some((a) => a.texto.includes('8eb78d2f'))).toBe(true)
    const ids = imagenesDelTurno('integrar', FIX.fotos).map((i) => i.label)
    expect(ids).toContain(rotuloDeLaFoto(PERSONAJE.id))
    expect(imagenesDelTurno('dirigir', FIX.fotos)).toEqual(imagenesDelTurno('integrar', FIX.fotos))
  })

  it('una foto sin dirección http(s) no se puede mirar: no va como imagen y su lugar lo toma la siguiente', () => {
    const sinUrl = FIX.fotos.map((f) => (f.id === PERSONAJE.id ? { ...f, url: null } : f))
    const ims = imagenesDelTurno('integrar', sinUrl)
    expect(ims).toHaveLength(MAX_IMAGENES)
    expect(ims.map((i) => i.label)).not.toContain(rotuloDeLaFoto(PERSONAJE.id))
    expect(ims.map((i) => i.label)).toContain(rotuloDeLaFoto(FIX.fotos.find((f) => f.id.startsWith('5d6eb7fb'))!.id))
  })

  it('solo https: una dirección http (sin cifrar) no va como imagen', () => {
    const http = FIX.fotos.map((f) => (f.id === PERSONAJE.id ? { ...f, url: f.url!.replace(/^https:/, 'http:') } : f))
    expect(imagenesDelTurno('integrar', http).map((i) => i.label)).not.toContain(rotuloDeLaFoto(PERSONAJE.id))
    expect(imagenesDelTurno('integrar', FIX.fotos).map((i) => i.label)).toContain(rotuloDeLaFoto(PERSONAJE.id))
  })

  it('frontera: una dirección de la carpeta de la WEB del cliente (`client-websites`) nunca se manda a mirar', () => {
    const web = FIX.fotos.map((f) => (f.id === PERSONAJE.id ? { ...f, url: f.url!.replace('/client-social-images/', '/client-websites/') } : f))
    const ims = imagenesDelTurno('integrar', web)
    expect(ims.map((i) => i.label)).not.toContain(rotuloDeLaFoto(PERSONAJE.id))
    expect(ims.some((i) => i.url.includes('client-websites'))).toBe(false)
    // también con mayúsculas en la dirección
    const webMay = FIX.fotos.map((f) => (f.id === PERSONAJE.id ? { ...f, url: f.url!.replace('/client-social-images/', '/Client-Websites/') } : f))
    expect(imagenesDelTurno('integrar', webMay).map((i) => i.label)).not.toContain(rotuloDeLaFoto(PERSONAJE.id))
  })

  it('a igual confianza manda el orden de la lista (estable)', () => {
    const dos = [FIX.fotos[0], FIX.fotos[1]].map((f) => ({ ...f, origen: 'propia' as const, etiqueta_confianza: 'media' as const }))
    expect(fotosALaVista(dos).map((f) => f.id)).toEqual([dos[0].id, dos[1].id])
    expect(fotosALaVista([dos[1], dos[0]]).map((f) => f.id)).toEqual([dos[1].id, dos[0].id])
  })

  it('la lista de texto dice cuáles van a la vista y cuáles solo como descripción', () => {
    const vista = new Set(fotosALaVista(FIX.fotos).map((f) => f.id))
    const lista = LISTA_DE_FOTOS(FIX.fotos, vista)
    expect(lista).toMatch(new RegExp(`${PERSONAJE.id}[^\\n]* · a la vista`))
    expect((lista.match(/ · a la vista/g) ?? []).length).toBe(MAX_IMAGENES)
    expect((lista.match(/ · solo descripción/g) ?? []).length).toBe(MAX_FOTOS_DE_LA_LISTA - MAX_IMAGENES)
    expect(LISTA_DE_FOTOS(FIX.fotos)).not.toMatch(/a la vista|solo descripción/)
  })
})

describe('las fotos llegan al pedido del agente', () => {
  it('pedidoDeAgente lleva las imágenes que recibe; sin ellas, el pedido de siempre (images: [])', () => {
    const base = { agente: 'creative-director-mesa', task: 't', encargo_id: 'e', client_id: 'c', dry_run: true, paso: 'p', reserva_usd: 1 }
    expect(pedidoDeAgente(base).images).toEqual([])
    const ims = imagenesDelTurno('dirigir', FIX.fotos)
    expect(pedidoDeAgente({ ...base, images: ims }).images).toEqual(ims)
  })

  it('de punta a punta (arnés de la mesa): cada turno de la mesa recibe las fotos del cliente como imágenes', async () => {
    const { M, a, id } = await montar()
    const { turnos } = await jugar(M, id, a)
    const deLaMesa = turnos.filter((t) => (LOS_QUE_VEN as readonly string[]).includes(t.tipo))
    expect(deLaMesa.length).toBeGreaterThan(3)
    for (const t of deLaMesa) {
      expect(t.images?.length, `${t.paso}`).toBeGreaterThan(0)
      for (const u of t.images!) expect(u).toMatch(/^https:\/\/fotos\.test\//)
    }
  })
})

describe('la instrucción: nombrar la foto del elemento real y no inventarlo', () => {
  const c: ContextoDeTurno = { cliente_nombre: 'Náufrago', tipo: 'video', brief_id: 'BRF-1', brief_texto: 'brief', manual_texto: 'manual', plan_texto: 'plan', fotos: FIX.fotos, tope_usd: 10, gasto_usd: 0 }
  const est = { directorio_congelado: [], tipo: 'video' } as never

  it('cada turno lleva la regla de los elementos reales y la lista con «a la vista»', () => {
    for (const tipo of ['dirigir', 'aportar', 'integrar', 'criticar'] as const) {
      const t = armarTarea({ tipo, agente: 'x', tarjeta: undefined, est, libro: antesDe(18), c })
      expect(t, tipo).toContain(REGLA_DE_LOS_ELEMENTOS_REALES)
      expect(t, tipo).toMatch(new RegExp(`${PERSONAJE.id}[^\\n]* · a la vista`))
    }
  })

  it('sin fotos propias, la regla no aparece (la tarea es la de siempre)', () => {
    const t = armarTarea({ tipo: 'dirigir', agente: 'x', tarjeta: undefined, est, libro: [], c: { ...c, fotos: [] } })
    expect(t).not.toContain(REGLA_DE_LOS_ELEMENTOS_REALES)
  })

  it('la regla nombra la foto exacta, la creación nueva y el personaje de la marca', () => {
    expect(REGLA_DE_LOS_ELEMENTOS_REALES).toMatch(/nombra la foto exacta que lo muestra/)
    expect(REGLA_DE_LOS_ELEMENTOS_REALES).toContain('No lo inventes como si fuera real: proponlo como **creación nueva**')
    expect(REGLA_DE_LOS_ELEMENTOS_REALES).toContain('«creación nueva · basada en foto:<id>»')
    expect(REGLA_DE_LOS_ELEMENTOS_REALES).toMatch(/personaje de la marca/)
    expect(REGLA_DE_LOS_ELEMENTOS_REALES).toMatch(/imágenes reales/)
  })

  it('la hoja de planos pide la foto en todo plano con un elemento real, y el personaje de la marca con su foto', () => {
    const g = convencionDelGuion({ segundos_min: 8, segundos_max: 12, propuestas: 3 })
    expect(g).not.toContain('(solo en los planos de producto)')
    expect(g).toMatch(/Foto: foto:<id de una foto propia>, foto:<id> · <por qué la elegiste, en una frase> \| ninguna {3}\(en todo plano que muestre un elemento real del cliente/)
    expect(g).toMatch(/Un personaje de la marca \(mascota, ilustración, figura\) lleva SIEMPRE la foto que lo muestra/)
    // el formato del personaje nuevo es el que leen los planos (CC4, 13:24Z): «· creación nueva · basada en foto:<id>»
    expect(g).toContain('«- <Nombre>: <cómo es> · creación nueva · basada en foto:<id>»')
  })

  it('el formato nuevo lo lee el traductor de hoy: «Foto: foto:a, foto:b · por qué» da la 1.ª foto, y el personaje de la marca trae su foto al plano', () => {
    const md = [
      '## Personajes',
      `- El náufrago: esqueleto con ropa surfer y sombrero · Fotos: foto:${PERSONAJE.id}`,
      '## Plano 1 · 0–4 s',
      'Se ve: el bowl en la mesa',
      `Foto: foto:${FIX.fotos[20].id}, foto:${FIX.fotos[22].id} · es el plato real del local`,
      'Personajes: ninguno',
      '## Plano 2 · 4–8 s',
      'Se ve: el personaje junto al bowl',
      'Foto: ninguna',
      'Personajes: El náufrago',
      '## Audio', 'ambiente', '## Pie', 'pie', '## Etiquetas', '#a',
    ].join('\n')
    const tr = traducirGuion(md, {})
    expect(tr.planos[0].foto_id).toBe(FIX.fotos[20].id)
    expect(tr.personajes?.[0].fotos_ids).toEqual([PERSONAJE.id])
    expect(tr.planos[1].personajes).toEqual([tr.personajes![0].id])
  })

  it('la crítica revisa con las fotos a la vista (incluidas personas y marcas de terceros)', () => {
    const t = tareaDeLaCritica('social-media-strategist')
    expect(t).toContain(LA_CRITICA_MIRA_LAS_FOTOS)
    expect(LA_CRITICA_MIRA_LAS_FOTOS).toMatch(/personas o marcas de terceros/)
  })
})
