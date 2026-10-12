/** Ronda 77 · el enlace propio a prueba de engaños: nombre ENTERO, sin créditos del diseñador, sin homónimos, y lo no confirmado no se pide. Sondas de CC#3 + batería de rubros. Sin base ni modelo. */
import { describe, expect, it } from 'vitest'
import { BATERIA_DE_RUBROS } from '../../rubros-de-prueba/baterias'
import { analizarNombre, clasificarEnlace, coincideElNombreEntero, enlacesDelCliente, planDeLaFicha, type FilaPropia } from '..'

const sitio = (url: string, paginas: Array<{ links: string[]; text?: string }>): FilaPropia => ({ apify_function: 'website_content_scraper', params: { url }, respuesta: paginas.map((p, i) => ({ url: `${url}/p${i}`, links: p.links, text: p.text ?? '' })) })
const funciones = (plan: { llamadas: Array<{ funcion: string }> }) => plan.llamadas.map((l) => l.funcion)

describe('sonda de CC#3 · los créditos del diseñador web en el pie', () => {
  const AGENCIA_IG = 'https://www.instagram.com/agencia_creativa_x'
  const AGENCIA_FB = 'https://www.facebook.com/agenciacreativax'
  const pie = `Hotel Demo Costa © 2026 · Diseñado por Agencia Creativa X ${AGENCIA_IG} ${AGENCIA_FB}`
  const ficha = { name: 'Hotel Demo Costa', industry: 'hotel', country: 'Colombia', website_url: 'https://hoteldemocosta.example', config: {} }
  it('el pie repetido en 4 páginas con «diseñado por» NO se toma como perfil del cliente ni se pide', () => {
    const { plan, entrada } = planDeLaFicha(ficha, [sitio('https://hoteldemocosta.example', [0, 1, 2, 3].map(() => ({ links: [AGENCIA_IG, AGENCIA_FB], text: pie })))])
    expect(entrada.redes?.facebook).toBeUndefined(); expect(entrada.redes?.instagram).toBeUndefined()
    expect(funciones(plan)).not.toContain('resenas_facebook'); expect(funciones(plan)).not.toContain('publicaciones_facebook')
    expect(entrada.descartados.map((d) => d.motivo).join(' ')).toMatch(/crédito|diseñado por|quien hizo el sitio/)
  })
  it('el mismo pie SIN crédito pero con «síguenos» en ≥ 3 páginas SÍ es del cliente (perfil repetido y marcado «nuestro»)', () => {
    const propio = 'https://www.instagram.com/cuenta_del_local'
    const txt = `Síguenos en Instagram ${propio}`
    const { entrada } = planDeLaFicha(ficha, [sitio('https://hoteldemocosta.example', [0, 1, 2].map(() => ({ links: [propio], text: txt })))])
    expect(entrada.enlaces).toEqual([propio])
  })
  it('con un «síguenos» Y un «diseñado por» en la misma ventana manda el crédito (se descarta)', () => {
    const u = 'https://www.facebook.com/otra_pagina'
    const txt = `Síguenos ${u} · Diseñado por Estudio Z`
    const { entrada } = planDeLaFicha(ficha, [sitio('https://hoteldemocosta.example', [0, 1, 2].map(() => ({ links: [u], text: txt })))])
    expect(entrada.enlaces).toEqual([])
  })
})

describe('sonda de CC#3 · otro negocio cuyo nombre CONTIENE el del cliente', () => {
  const ficha = { name: 'Hotel Demo Costa', industry: 'hotel', country: 'Colombia', market: 'Cartagena, Colombia', website_url: 'https://hoteldemocosta.example', config: {} }
  const RESORT = 'https://www.booking.com/hotel/co/demo-costa-resort.html'
  const AZUL = 'https://www.tripadvisor.com/Hotel_Review-g1-d2-Reviews-Demo_Costa_Azul-Cartagena.html'
  const SUYO_B = 'https://www.booking.com/hotel/co/hotel-demo-costa.html'
  const SUYO_T = 'https://www.tripadvisor.com/Hotel_Review-g1-d3-Reviews-Hotel_Demo_Costa-Cartagena.html'
  it('«Demo Costa Resort» y «Demo Costa Azul» NO se piden: quedan sin confirmar con su motivo', () => {
    const { plan, entrada } = planDeLaFicha(ficha, [sitio('https://hoteldemocosta.example', [{ links: [RESORT, AZUL] }, { links: [] }, { links: [] }])])
    expect(funciones(plan)).not.toContain('resenas_booking'); expect(funciones(plan)).not.toContain('resenas_tripadvisor')
    expect(entrada.sin_confirmar.map((x) => x.url).sort()).toEqual([AZUL, RESORT].sort())
    expect(plan.omitidas.filter((o) => /^sin confirmar/.test(o.motivo)).length).toBe(2)
    expect(plan.omitidas.find((o) => o.motivo.includes(RESORT))!.motivo).toMatch(/OTRO negocio/)
  })
  it('las fichas del hotel mismo (nombre entero + su ciudad) sí se piden', () => {
    const { plan } = planDeLaFicha(ficha, [sitio('https://hoteldemocosta.example', [{ links: [SUYO_B, SUYO_T, RESORT, AZUL] }, { links: [] }, { links: [] }])])
    expect(funciones(plan)).toContain('resenas_booking'); expect(funciones(plan)).toContain('resenas_tripadvisor')
    expect(plan.llamadas.find((l) => l.funcion === 'resenas_booking')!.objetivo).toBe(SUYO_B)
  })
})

describe('sonda de CC#3 · el homónimo exacto con nombre corto o genérico', () => {
  const base = { name: 'Café del Mar', industry: 'cafetería', country: 'España', website_url: 'https://cafedelmar.example', config: {} }
  const IBIZA = 'https://www.tripadvisor.com/Restaurant_Review-g1-d2-Reviews-Cafe_del_Mar_Ibiza-Ibiza.html'
  const SOLO = 'https://www.tripadvisor.com/Restaurant_Review-g1-d3-Reviews-Cafe_del_Mar-Tarifa.html'
  it('«Café del Mar Ibiza» no se pide (palabras de más); sin ciudad en la ficha, ni el «Café del Mar» a secas', () => {
    const { plan, entrada } = planDeLaFicha(base, [sitio('https://cafedelmar.example', [{ links: [IBIZA, SOLO] }, { links: [] }, { links: [] }])])
    expect(funciones(plan)).not.toContain('resenas_tripadvisor')
    expect(entrada.sin_confirmar.length).toBe(2)
  })
  it('con la ciudad de la ficha en la dirección, el nombre corto sí se confirma; la de otra ciudad sigue sin confirmar', () => {
    const { plan, entrada } = planDeLaFicha({ ...base, market: 'Tarifa, Cádiz, España' }, [sitio('https://cafedelmar.example', [{ links: [IBIZA, SOLO] }, { links: [] }, { links: [] }])])
    expect(plan.llamadas.find((l) => l.funcion === 'resenas_tripadvisor')?.objetivo).toBe(SOLO)
    expect(entrada.sin_confirmar.map((x) => x.url)).toEqual([IBIZA])
  })
  it('o que el sitio lo marque como «nuestro» (contacto / síguenos)', () => {
    const { plan } = planDeLaFicha(base, [sitio('https://cafedelmar.example', [{ links: [SOLO], text: `Nuestra ficha en Tripadvisor ${SOLO} · contacto` }, { links: [] }, { links: [] }])])
    expect(plan.llamadas.find((l) => l.funcion === 'resenas_tripadvisor')?.objetivo).toBe(SOLO)
  })
})

describe('el nombre es la ficha ENTERA (secuencia, no contención)', () => {
  it.each([
    ['https://www.tripadvisor.com/Hotel_Review-g1-d3-Reviews-Hotel_Demo_Costa-Cartagena.html', 'Hotel Demo Costa', 'entero'],
    ['https://www.booking.com/hotel/co/demo-costa-resort.html', 'Hotel Demo Costa', 'con_extras'],
    ['https://www.facebook.com/hoteldemocosta', 'Hotel Demo Costa', 'entero'],
    ['https://www.facebook.com/hoteldemocostaresort', 'Hotel Demo Costa', 'con_extras'],
    ['https://www.facebook.com/democosta.co', 'Hotel Demo Costa', 'entero'],
    ['https://www.facebook.com/costa_demo', 'Hotel Demo Costa', 'no'],
    ['https://www.tripadvisor.com/Hotel_Review-g1-d3-Reviews-Costa-Demo.html', 'Hotel Demo Costa', 'no'],
  ])('%s con «%s» → %s', (url, nombre, esperado) => { expect(coincideElNombreEntero(url, nombre, ['Cartagena', 'Colombia'])).toBe(esperado) })
  it('nombre corto o genérico', () => {
    expect(analizarNombre('Café del Mar').debil).toBe(true); expect(analizarNombre('Casa Azul').debil).toBe(true)
    expect(analizarNombre('Hotel Demo Costa').debil).toBe(false); expect(analizarNombre('Producto Demo').debil).toBe(false)
  })
})

describe('la rama final: nada que no se reconozca NUNCA es «propio»', () => {
  const ctx = { nombre: 'Hotel Demo Costa', paginasPorEnlace: new Map<string, number>(), paginasLeidas: 5 }
  it.each(['https://ejemplo.org/pagina', 'https://www.spotify.com/artist/1', 'https://www.tripadvisor.com/Hotel_Review-g1-d9-Reviews-Otro_Lugar-Ciudad.html', 'https://www.instagram.com/alguien'])('%s', (u) => {
    expect(clasificarEnlace(u, ctx).estado).not.toBe('propio')
  })
  it('un enlace que no es de una plataforma conocida no es candidato ni se reporta', () => {
    expect(enlacesDelCliente(['https://ejemplo.org/pagina'], ctx)).toEqual({ propios: [], sin_confirmar: [], descartados: [] })
  })
  it('el motivo del descarte final dice por qué', () => {
    const v = clasificarEnlace('https://ejemplo.org/pagina', ctx)
    expect(v.estado).toBe('descartado'); expect((v as { motivo: string }).motivo).toMatch(/no se demuestra/)
  })
})

describe.each(BATERIA_DE_RUBROS)('batería · $rubro · el nombre + una palabra de más no se pide, el propio sí', (c) => {
  it('propio sí · «nombre + gran resort»: sin confirmar', () => {
    const slug = c.nombre.replace(/ /g, '_')
    const propio = `https://www.tripadvisor.com/Restaurant_Review-g1-d2-Reviews-${slug}-Ciudad.html`
    const mas = `https://www.tripadvisor.com/Restaurant_Review-g1-d3-Reviews-${slug}_Gran_Resort-Ciudad.html`
    const { entrada } = planDeLaFicha({ name: c.nombre, industry: 'restaurante', country: c.pais, market: `Ciudad, ${c.pais}`, website_url: 'https://negocio-demo.example' }, [sitio('https://negocio-demo.example', [{ links: [propio, mas] }, { links: [] }, { links: [] }])])
    expect(entrada.enlaces).toEqual([propio]); expect(entrada.sin_confirmar.map((x) => x.url)).toEqual([mas])
  })
})
