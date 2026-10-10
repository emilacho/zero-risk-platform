/** R2 (la materia ordenada y recortada por bloque, con aviso) y R1 (las frases propias literales). Sin modelo. */
import { describe, expect, it } from 'vitest'
import { aplicarEslogan, esFilaPropia, frasesPropias, fuentesDeRaspado, ordenarMateria, resumirEstructurado } from '..'
import { contieneLiteral, normalizar, partirEnClausulas, partirEnFrases } from '..'
import { F, filaInstagram, filaMapas, filaSitio, PROPIOS } from './apoyo'

describe('texto común', () => {
  it('normalizar quita tildes, mayúsculas y puntuación; contieneLiteral exige palabras completas', () => {
    expect(normalizar('Cuando tengas… ¡ESA hambre!')).toBe('cuando tengas esa hambre')
    expect(contieneLiteral('Atendemos de lunes a viernes.', 'LUNES a viernes')).toBe(true)
    expect(contieneLiteral('Atendemos de lunes a viernes.', 'lune')).toBe(false)
    expect(contieneLiteral('algo', '')).toBe(false)
  })
  it('partirEnFrases no corta cifras ni precios; partirEnClausulas no corta una coma entre dígitos ni una raya entre cifras', () => {
    expect(partirEnFrases('Cuesta 7.00 dólares. Abrimos hoy!\nNos vemos')).toEqual(['Cuesta 7.00 dólares.', 'Abrimos hoy!', 'Nos vemos'])
    expect(partirEnClausulas('Tenemos 1,231 seguidores, y crecemos')).toEqual(['Tenemos 1,231 seguidores', 'y crecemos'])
    expect(partirEnClausulas('Desde $7–$9 según el plato')).toEqual(['Desde $7–$9 según el plato'])
    expect(partirEnClausulas('Una cosa — otra cosa: y más')).toEqual(['Una cosa', 'otra cosa', 'y más'])
  })
})

describe('R2 · la materia: ordenada por código, recortada por bloque y NUNCA en silencio', () => {
  const largo = (n: number, marca = 'x') => `${marca} `.repeat(n)
  const filas = [
    filaSitio('s1', [
      { url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo · Sonríe con confianza', description: 'Odontología familiar', text: 'Portada: bienvenida.' },
      { url: 'https://www.clinicaejemplo.test/blog/algo', text: largo(500, 'blog') },
      { url: 'https://www.clinicaejemplo.test/preguntas', text: '¿Atienden urgencias? Sí, todos los días.' },
      { url: 'https://www.clinicaejemplo.test/nosotros', text: 'Somos un equipo de tres odontólogos.' },
    ]),
    filaInstagram('i1', 'clinicaejemplo', 'Sonríe con confianza\nAgenda por WhatsApp', [{ caption: 'Nuevo consultorio', ownerUsername: 'clinicaejemplo' }, { caption: 'Una nota de otra cuenta', ownerUsername: 'otracuenta' }]),
  ]
  const fuentes = fuentesDeRaspado(filas, PROPIOS)
  it('el título y la descripción van PRIMERO aunque la página sea larga; el orden sale por tipo de página, no por posición', () => {
    const m = ordenarMateria(fuentes)
    expect(m.bloques.map((b) => b.bloque)).toEqual(['titulo_meta', 'portada', 'preguntas', 'nosotros', 'otras_paginas', 'instagram_propio'])
    expect(m.texto.indexOf('Sonríe con confianza')).toBeLessThan(m.texto.indexOf('Portada: bienvenida'))
  })
  it('el recorte es POR BLOQUE y deja un marcador visible con cuánto se leyó; sin recorte, ningún marcador', () => {
    const m = ordenarMateria(fuentes, { otras_paginas: 1000 })
    const otras = m.bloques.find((b) => b.bloque === 'otras_paginas')!
    expect(otras.recortado).toBe(true)
    expect(otras.texto).toMatch(/\[bloque recortado: se leyeron 1000 de \d+ caracteres\]/)
    expect(m.recortes).toEqual([{ bloque: 'otras_paginas', leidos: 1000, total: otras.total }])
    expect(m.total_leido).toBeLessThan(m.total_original)
    const sin = ordenarMateria(fuentes)
    expect(sin.recortes).toEqual([]); expect(sin.texto).not.toMatch(/recortado/)
  })
  it('un volcado largo en un bloque NO tapa a los demás (tope por bloque, no por posición)', () => {
    const m = ordenarMateria(fuentes, { otras_paginas: 200 })
    for (const b of ['titulo_meta', 'portada', 'preguntas', 'nosotros', 'instagram_propio']) expect(m.bloques.some((x) => x.bloque === b && !x.recortado), b).toBe(true)
  })
  it('solo entra lo PROPIO: nada de competidores ni de filas de ensayo; de Instagram solo las publicaciones de la propia cuenta', () => {
    const f2 = fuentesDeRaspado([
      ...filas,
      filaInstagram('i2', 'competidor', 'El mejor del mundo', [{ caption: 'oferta del competidor' }]),
      { ...filaSitio('s2', [{ url: 'https://www.clinicaejemplo.test/', text: 'TEXTO SINTÉTICO DE ENSAYO' }]), ensayo: true },
    ], PROPIOS)
    expect(f2.some((x) => x.texto.includes('TEXTO SINTÉTICO'))).toBe(false)
    expect(f2.filter((x) => x.texto.includes('competidor')).every((x) => x.tipo === 'tercero')).toBe(true)
    const m = ordenarMateria(f2)
    expect(m.texto).not.toMatch(/competidor|El mejor del mundo/)
    expect(m.texto).toContain('Nuevo consultorio'); expect(m.texto).not.toContain('Una nota de otra cuenta')
  })
  it('esFilaPropia: el sitio por su dirección, las redes por su usuario, los mapas por el nombre de la función', () => {
    expect(esFilaPropia({ apify_function: 'website_content_scraper', params: { url: 'https://clinicaejemplo.test/otra' } }, PROPIOS)).toBe(true)
    expect(esFilaPropia({ apify_function: 'website_content_scraper', params: { url: 'https://otro.test' } }, PROPIOS)).toBe(false)
    expect(esFilaPropia({ apify_function: 'instagram_scraper', params: { startUrls: [{ url: 'https://instagram.com/ClinicaEjemplo' }] } }, PROPIOS)).toBe(true)
    expect(esFilaPropia({ apify_function: 'instagram_scraper', params: { usernames: ['competidor'] } }, PROPIOS)).toBe(false)
    expect(esFilaPropia({ apify_function: 'own_google_maps_profile', params: {} }, PROPIOS)).toBe(true)
    expect(esFilaPropia({ apify_function: 'google_maps_scraper', params: {} }, PROPIOS)).toBe(false)
  })
  it('los datos estructurados se RESUMEN (no se vuelcan) y van aparte', () => {
    const r = resumirEstructurado([{ '@type': 'Dentist', name: 'Clínica Ejemplo', telephone: '+000 111', address: { streetAddress: 'Calle 1', addressLocality: 'Ciudad' }, openingHours: 'Mo-Fr 09:00-18:00' }])
    expect(r).toContain('Dentist · name: Clínica Ejemplo'); expect(r).toContain('dirección: Calle 1, Ciudad'); expect(r).toContain('horario: Mo-Fr 09:00-18:00'); expect(r).not.toContain('@type')
    const f = fuentesDeRaspado([filaSitio('s3', [{ url: 'https://www.clinicaejemplo.test/', text: 'hola', jsonLd: [{ '@type': 'Dentist', name: 'X' }] }])], PROPIOS)
    expect(ordenarMateria(f).bloques.map((b) => b.bloque)).toContain('estructurado')
  })
  it('un cliente de mapas propio entra como bloque propio; la misma página repetida en varios raspados no se duplica', () => {
    const f = fuentesDeRaspado([filaMapas('m1', { title: 'Clínica Ejemplo', address: 'Calle 1', city: 'Ciudad' }), filaSitio('a', [{ url: 'https://www.clinicaejemplo.test/', text: 'igual' }]), filaSitio('b', [{ url: 'https://www.clinicaejemplo.test/', text: 'igual' }])], PROPIOS)
    expect(f.filter((x) => x.rol === 'cuerpo')).toHaveLength(1)
    expect(ordenarMateria(f).bloques.map((b) => b.bloque)).toContain('mapas_propios')
  })
})

describe('R1 · las frases propias del cliente, literales y por código', () => {
  const fuentes = fuentesDeRaspado([
    filaSitio('s', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo · Sonríe sin miedo, siempre contigo', text: 'Bienvenida. Todos los derechos reservados. Atendemos con cita previa.' }]),
    filaInstagram('i', 'clinicaejemplo', 'Sonríe sin miedo,\nsiempre contigo!\n📍 Ciudad Ejemplo\nAgenda por WhatsApp'),
    filaInstagram('c', 'competidor', 'Sonríe sin miedo, siempre contigo (copiado por el competidor)'),
  ], PROPIOS)
  it('halla el eslogan: lo que está en la biografía Y en el título del sitio, con su literal (tildes, signos y saltos de línea juntados) y su procedencia', () => {
    const r = frasesPropias(fuentes)
    expect(r.estado_eslogan).toBe('hallado')
    expect(r.eslogan!.literal).toBe('Sonríe sin miedo, siempre contigo!')
    expect(r.eslogan!.tipo).toBe('biografia')
    expect(new Set(r.eslogan!.fuentes.map((f) => f.canal))).toEqual(new Set(['sitio', 'instagram']))
  })
  it('lo de competidores NO cuenta: una frase que solo repite un competidor no es del cliente', () => {
    const solo = frasesPropias(fuentesDeRaspado([filaInstagram('i', 'clinicaejemplo', 'Agenda por WhatsApp hoy mismo'), filaInstagram('c', 'competidor', 'Sonríe sin miedo, siempre contigo')], PROPIOS))
    expect(solo.estado_eslogan).toBe('sin_dato'); expect(solo.eslogan).toBeNull()
  })
  it('las frases vacías de cualquier sitio no se cuelan como eslogan', () => {
    const f = fuentesDeRaspado([
      filaSitio('s', [{ url: 'https://www.clinicaejemplo.test/', title: 'Todos los derechos reservados 2026', text: 'Todos los derechos reservados por la clínica' }]),
      filaInstagram('i', 'clinicaejemplo', 'Todos los derechos reservados'),
    ], PROPIOS)
    expect(frasesPropias(f).eslogan).toBeNull()
  })
  it('sin candidata ⇒ hueco declarado (nunca inventado ni parafraseado); una sola fuente no basta', () => {
    const r = frasesPropias(fuentesDeRaspado([filaSitio('s', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo', text: 'Algo único de esta página sola' }])], PROPIOS))
    expect(r).toMatchObject({ estado_eslogan: 'sin_dato', eslogan: null, repetidas: [] })
  })
  it('las repetidas que NO viven en biografía ni título van como material (máx. 10), nunca como eslogan', () => {
    const f = fuentesDeRaspado([
      filaSitio('s', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo', text: 'Cuidamos tu sonrisa con tecnología de punta cada día' }]),
      filaInstagram('i', 'clinicaejemplo', 'Hola', [{ caption: 'Cuidamos tu sonrisa con tecnología de punta cada día en el consultorio' }]),
    ], PROPIOS)
    const r = frasesPropias(f, { maxRepetidas: 1 })
    expect(r.eslogan).toBeNull()
    expect(r.repetidas).toHaveLength(1); expect(r.repetidas[0].tipo).toBe('repetida')
  })
  it('el código escribe el eslogan en `tagline` solo si está vacío; nunca pisa lo que ya hay', () => {
    const r = frasesPropias(fuentes)
    expect(aplicarEslogan({ tagline: null, positioning: 'p' }, r)).toMatchObject({ aplicado: true, manual: { tagline: 'Sonríe sin miedo, siempre contigo!', positioning: 'p' } })
    expect(aplicarEslogan({ tagline: 'Otro' }, r)).toMatchObject({ aplicado: false, motivo: 'tagline_ocupado', manual: { tagline: 'Otro' } })
    expect(aplicarEslogan({}, { eslogan: null, estado_eslogan: 'sin_dato', repetidas: [], fuentes_propias_leidas: 0 })).toMatchObject({ aplicado: false, motivo: 'sin_eslogan' })
  })
})
void F
