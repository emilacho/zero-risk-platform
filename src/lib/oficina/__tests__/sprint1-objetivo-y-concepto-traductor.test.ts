/**
 * 16-nov · Sprint 1 · Mejoras 1 y 2 · el traductor tolerante lee el OBJETIVO de la pieza (lo declara la dirección; si falta, el del brief, con aviso)
 * y el CONCEPTO de cada lámina o elemento (idea, qué se ve), y ambos viajan con cada imagen hasta el brazo. Nada de esto se dibuja como texto ni bloquea.
 */
import { describe, expect, it } from 'vitest'
import { traducirPieza } from '../mesa/traductor'

const CARRUSEL = [
  '## Objetivo',
  'Dar a conocer la web y el delivery en Guayaquil · Pide en la web',
  '## Concepto',
  'El plato llega a tu puerta como recién salido de la cocina',
  '## Lámina 1 · hook',
  'Título: El encebollado que llega a tu casa',
  'Idea: el antojo de domingo resuelto sin salir',
  'Qué se ve: un tazón humeante sobre una mesa de departamento, luz de mañana',
  'Imagen: generar: tazón de encebollado humeante en una mesa de casa',
  '## Lámina 2 · cta',
  'Título: Pide en la web',
  'Llamado: Pide ahora',
  'Qué se ve: la puerta de un departamento abriéndose a un repartidor con la bolsa',
  '## Pie',
  'Ya llegamos a tu barrio.',
].join('\n')

describe('Mejora 1 · el objetivo de la pieza', () => {
  it('la dirección lo declara en «## Objetivo»: queda en la traducción y viaja con cada imagen; no hay aviso de objetivo', () => {
    const t = traducirPieza(CARRUSEL, 'carrusel', { objetivoDelBrief: 'otro objetivo del brief' })
    expect(t.ok).toBe(true)
    expect(t.objetivo).toBe('Dar a conocer la web y el delivery en Guayaquil · Pide en la web')
    for (const im of t.imagenes) expect((im as { concepto?: { objetivo?: string } }).concepto?.objetivo).toBe(t.objetivo)
    expect(t.avisos.join(' ')).not.toMatch(/objetivo/)
  })
  it('también vale una línea «Objetivo de la pieza: …» en cualquier parte', () => {
    const t = traducirPieza('## Lámina 1 · hook\nTítulo: a\nObjetivo de la pieza: que reserven mesa', 'carrusel')
    expect(t.objetivo).toBe('que reserven mesa')
    // la línea no se dibuja: no es título, texto ni llamado
    expect(JSON.stringify(t.laminas)).not.toMatch(/reserven/)
  })
  it('sin objetivo declarado se usa el del brief y se AVISA al final; la pieza sigue (no es reja)', () => {
    const t = traducirPieza('## Lámina 1 · hook\nTítulo: El encebollado\n', 'carrusel', { objetivoDelBrief: 'dar a conocer el delivery' })
    expect(t.ok).toBe(true)
    expect(t.objetivo).toBe('dar a conocer el delivery')
    expect(t.avisos[t.avisos.length - 1]).toBe('la dirección no declaró el objetivo de la pieza; se usa el del brief')
  })
  it('sin objetivo en ningún lado: aviso distinto, sin objetivo y la pieza sigue', () => {
    const t = traducirPieza('## Lámina 1 · hook\nTítulo: El encebollado\n', 'carrusel')
    expect(t.ok).toBe(true)
    expect(t.objetivo).toBeUndefined()
    expect(t.avisos).toContain('ni la dirección ni el brief declaran el objetivo de la pieza')
  })
  it('la sección «## Objetivo» no corre el orden de los elementos del kit', () => {
    const md = '## Objetivo\nque pidan por la web\n## h1\nTítulo: Primero\n## h2\nTítulo: Segundo\n'
    const t = traducirPieza(md, 'kit', { refsDelKit: ['x1', 'x2'] })
    expect(t.copy_kit!.map((c) => c.headline)).toEqual(['Primero', 'Segundo'])
    expect(t.objetivo).toBe('que pidan por la web')
  })
  it('una pieza que no se pudo traducir conserva el objetivo (va a la jefatura como texto con él)', () => {
    const t = traducirPieza('## Objetivo\nque pidan\n## Notas\nnada que dibujar', 'carrusel')
    expect(t.ok).toBe(false)
    expect(t.objetivo).toBe('que pidan')
  })
})

describe('Mejora 2 · el concepto viaja con la imagen', () => {
  const t = traducirPieza(CARRUSEL, 'carrusel')
  it('la lámina con idea y escena propias: la imagen lleva idea, qué se ve, mensaje (su título) y objetivo', () => {
    expect(t.imagenes[0]).toEqual({
      ref: 'hook', modo: 'generada', descripcion: 'tazón de encebollado humeante en una mesa de casa',
      concepto: { idea: 'el antojo de domingo resuelto sin salir', que_se_ve: 'un tazón humeante sobre una mesa de departamento, luz de mañana', mensaje: 'El encebollado que llega a tu casa', objetivo: 'Dar a conocer la web y el delivery en Guayaquil · Pide en la web' },
    })
  })
  it('sin «Imagen:» pero con «Qué se ve:» se genera ESA escena (antes quedaba sin imagen); sin idea propia toma la de la pieza', () => {
    expect(t.imagenes[1]).toMatchObject({ ref: 'cta', modo: 'generada', descripcion: 'la puerta de un departamento abriéndose a un repartidor con la bolsa' })
    expect((t.imagenes[1] as { concepto: { idea: string } }).concepto.idea).toBe('El plato llega a tu puerta como recién salido de la cocina')
  })
  it('la idea y la escena NO se dibujan: no aparecen en las láminas ni en el texto base', () => {
    const dibujado = JSON.stringify([t.laminas, t.copy_carrusel])
    expect(dibujado).not.toMatch(/antojo de domingo|tazón humeante sobre|repartidor/)
    expect(t.laminas!.map((l) => l.headline)).toEqual(['El encebollado que llega a tu casa', 'Pide en la web'])
  })
  it('las secciones de objetivo y concepto no se cuentan como láminas', () => {
    expect(t.laminas).toHaveLength(2)
  })
  it('«Imagen: ninguna» sigue mandando aunque haya escena', () => {
    const r = traducirPieza('## Lámina 1 · hook\nTítulo: a\nQué se ve: una mesa\nImagen: ninguna', 'carrusel')
    expect(r.imagenes[0]).toEqual({ ref: 'hook', modo: 'ninguna' })
  })
  it('la foto propia también lleva su concepto (para editarla sobre la foto real)', () => {
    const r = traducirPieza('## Lámina 1 · hook\nTítulo: a\nEscena: el plato en la barra\nImagen: foto:abcd1234', 'carrusel')
    expect(r.imagenes[0]).toEqual({ ref: 'hook', modo: 'real', foto_id: 'abcd1234', concepto: { que_se_ve: 'el plato en la barra', mensaje: 'a' } })
  })
  it('en el kit, cada elemento lleva el suyo', () => {
    const r = traducirPieza('## h1\nTítulo: Hoy hay ceviche\nSe ve: el ceviche en la barra\n', 'kit', { refsDelKit: ['h1'], objetivoDelBrief: 'que vengan hoy' })
    expect(r.imagenes[0]).toEqual({ ref: 'h1', modo: 'generada', descripcion: 'el ceviche en la barra', concepto: { que_se_ve: 'el ceviche en la barra', mensaje: 'Hoy hay ceviche', objetivo: 'que vengan hoy' } })
  })
})
