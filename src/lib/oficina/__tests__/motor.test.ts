import { describe, it, expect } from 'vitest'
import { POST_IMG, validarPlantilla, siguientePaso, estadoInicial, registrarPaso, evaluar, puedeResolver, duenoDeLaFicha } from '../index'
import type { Plantilla, Ficha } from '../index'
import { simular } from './simular'

const real = { direccion_visual: { costo_usd: 0.07, artefacto: { decision: { modo: 'real', requiere_mirar: false } } } }
const generada = { direccion_visual: { costo_usd: 0.07, artefacto: { decision: { modo: 'generada', requiere_mirar: true } } } }

describe('la plantilla post_img es válida contra el vocabulario cerrado', () => {
  it('validarPlantilla(POST_IMG) no da errores', () => { expect(validarPlantilla(POST_IMG)).toEqual([]) })
  it('el margen cubre 3 reintentos + todas las vueltas (1 + 2)', () => { expect(POST_IMG.limites.margen).toBe(6) })
  it('toda regla de indicación tiene aplicador (código, jefe, gpt o guía)', () => {
    for (const reglas of Object.values(POST_IMG.indicaciones)) for (const r of reglas) expect(r.aplica).toMatch(/^(codigo:[a-z_]+|jefe|gpt|guia)$/)
  })
})

describe('validarPlantilla rechaza lo que está fuera del vocabulario', () => {
  const copia = (): Plantilla => JSON.parse(JSON.stringify(POST_IMG))
  const con = (mut: (p: Plantilla) => void): string[] => { const p = copia(); mut(p); return validarPlantilla(p) }
  it('un tipo de paso inventado', () => { expect(con((p) => { (p.pasos[1] as unknown as { tipo: string }).tipo = 'magia' }).join('|')).toMatch(/fuera del vocabulario/) })
  it('una condición inventada', () => { expect(con((p) => { (p.pasos[4] as unknown as { condicion: unknown }).condicion = { tipo: 'o', a: 1 } }).join('|')).toMatch(/condición «o» fuera/) })
  it('una función de código no registrada', () => { expect(con((p) => { p.pasos[0].funcion = 'borrar_todo' }).join('|')).toMatch(/no registrada/) })
  it('un validador no registrado', () => { expect(con((p) => { p.pasos[3].valida = ['inventado'] }).join('|')).toMatch(/validador «inventado»/) })
  it('un esquema no registrado', () => { expect(con((p) => { p.pasos[3].salida = { esquema: 'x.v9', reintento_formato: 1 } }).join('|')).toMatch(/esquema «x.v9»/) })
  it('un agente SIN contrato de salida (el formato lo hace cumplir el código)', () => { expect(con((p) => { delete p.pasos[3].salida }).join('|')).toMatch(/contrato de salida/) })
  it('una vuelta que apunta hacia adelante', () => { expect(con((p) => { p.pasos[4].vuelve_a = { paso: 'imagen', max: 1, si: { tipo: 'siempre' } } }).join('|')).toMatch(/hacia atrás/) })
  it('vueltas anidadas o solapadas', () => { expect(con((p) => { p.pasos[7].vuelve_a!.paso = 'prompts' }).join('|')).toMatch(/se solapan o se anidan/) })
  it('una vuelta que cruza una ronda de crítica', () => { expect(con((p) => { p.pasos[12].vuelve_a = { paso: 'chequeos', max: 1, si: { tipo: 'siempre' } } }).join('|')).toMatch(/cruza el paso de crítica/) })
  it('un margen menor que 3 + la suma de vueltas', () => { expect(con((p) => { p.limites.margen = 4 }).join('|')).toMatch(/limites.margen/) })
  it('una regla de indicación sin aplicador válido', () => { expect(con((p) => { p.indicaciones['content-creator'][0].aplica = 'confiar' }).join('|')).toMatch(/aplicador válido/) })
  it('una condición que cita un artefacto que nadie produce', () => { expect(con((p) => { p.pasos[4].condicion = { tipo: 'si_cambio', artefacto: 'fantasma' } }).join('|')).toMatch(/fantasma/) })
  it('un paso de código con tope de gasto', () => { expect(con((p) => { p.pasos[0].tope_usd = 1 }).join('|')).toMatch(/no tiene modelo/) })
  it('claves repetidas', () => { expect(con((p) => { p.pasos[1].clave = 'abrir' }).join('|')).toMatch(/repetidas/) })
})

describe('el motor recorre post_img sin conocerla (rama foto real)', () => {
  it('foto real con confianza alta: sin prompts, sin imagen, sin mirar, sin correcciones', () => {
    const { claves, final } = simular(POST_IMG, real)
    expect(claves).toEqual(['abrir', 'paquete', 'elegir_foto', 'direccion_visual', 'acabado', 'texto', 'chequeos', 'revision_jefe', 'revisor_externo', 'entrega', 'cierre'])
    expect(final.accion).toBe('fin')
  })
  it('foto real con confianza media: el curador mira (2 pasos más en total que la alta... solo `mirar`)', () => {
    const { claves } = simular(POST_IMG, { direccion_visual: { costo_usd: 0, artefacto: { decision: { modo: 'real', requiere_mirar: true } } }, mirar: { costo_usd: 0, artefacto: { veredicto: { regenerar: false } } } })
    expect(claves).toContain('mirar')
    expect(claves).not.toContain('imagen')
  })
})

describe('rama foto generada y la vuelta acotada', () => {
  it('prompts → chequeo → imagen → mirar → elegir → acabado…', () => {
    const { claves } = simular(POST_IMG, { ...generada, chequear_prompts: { costo_usd: 0, artefacto: { ninguno: false } }, mirar: { costo_usd: 0.07, artefacto: { veredicto: { regenerar: false } } } })
    expect(claves.slice(3, 10)).toEqual(['direccion_visual', 'prompts', 'chequear_prompts', 'imagen', 'mirar', 'elegir_version', 'acabado'])
  })
  it('regenerar ≤ 2 veces: la imagen se genera 3 veces como máximo y el motor SIGUE DE LARGO (no se atasca)', () => {
    const { claves, final } = simular(POST_IMG, { ...generada, chequear_prompts: { costo_usd: 0, artefacto: { ninguno: false } }, mirar: { costo_usd: 0.07, artefacto: { veredicto: { regenerar: true } } } })
    expect(claves.filter((c) => c === 'imagen')).toHaveLength(3)
    expect(claves.filter((c) => c === 'mirar')).toHaveLength(3)
    expect(claves).toContain('elegir_version')
    expect(final.accion).toBe('fin')
  })
  it('una regeneración y luego pasa: 2 imágenes', () => {
    const { claves } = simular(POST_IMG, { ...generada, chequear_prompts: { costo_usd: 0, artefacto: { ninguno: false } }, mirar: (n) => ({ costo_usd: 0.07, artefacto: { veredicto: { regenerar: n < 2 } } }) })
    expect(claves.filter((c) => c === 'imagen')).toHaveLength(2)
  })
  it('si ningún prompt pasa, el ingeniero repite UNA vez y luego sigue (no hay tercera)', () => {
    const { claves } = simular(POST_IMG, { ...generada, chequear_prompts: { costo_usd: 0, artefacto: { ninguno: true } }, mirar: { costo_usd: 0, artefacto: { veredicto: { regenerar: false } } } })
    expect(claves.filter((c) => c === 'prompts')).toHaveLength(2)
  })
})

describe('rondas, ficha y dueño del «donde»', () => {
  const f = (o: Partial<Ficha>): Ficha => ({ id: 'a', origen: 'jefe', donde: 'texto', gravedad: 'bloquea', estado: 'abierta', ...o })
  it('una ficha del jefe que bloquea abre «corrige»; una sugerencia no', () => {
    const con = simular(POST_IMG, { ...real, revision_jefe: { costo_usd: 0.07, artefacto: {}, fichas: [f({})] }, corrige: { costo_usd: 0.07, artefacto: { pie_de_foto: 'x' }, resoluciones: [{ id: 'a', estado: 'tomada', razon: 'ok' }] } })
    expect(con.claves).toContain('corrige')
    expect(con.claves).toContain('chequeos_2') // la pieza cambió ⇒ se re-chequea
    const sin = simular(POST_IMG, { ...real, revision_jefe: { costo_usd: 0.07, artefacto: {}, fichas: [f({ gravedad: 'sugerencia' })] } })
    expect(sin.claves).not.toContain('corrige')
  })
  it('una ficha externa abre «decide» (ronda 2) y la pieza cambiada se re-chequea', () => {
    const r = simular(POST_IMG, { ...real, revisor_externo: { costo_usd: 0.1, artefacto: {}, fichas: [f({ id: 'e', origen: 'externa', gravedad: 'sugerencia' })] }, decide: { costo_usd: 0.07, artefacto: { pie_de_foto: 'y' }, resoluciones: [{ id: 'e', estado: 'no_tomada', razon: 'no aplica' }] } })
    expect(r.claves.slice(-4)).toEqual(['decide', 'chequeos_3', 'entrega', 'cierre'])
  })
  it('solo el dueño del «donde» resuelve la ficha', () => {
    expect(duenoDeLaFicha({ donde: 'texto' })).toBe('content-creator')
    expect(puedeResolver({ donde: 'texto' }, 'content-creator')).toBe(true)
    expect(puedeResolver({ donde: 'texto' }, 'marketing_instagram_curator')).toBe(false)
    expect(puedeResolver({ donde: 'imagen' }, 'content-creator')).toBe(false)
    expect(puedeResolver({ donde: 'imagen' }, 'marketing_instagram_curator')).toBe(true)
    expect(duenoDeLaFicha({ donde: 'formato' })).toBeNull()
  })
})

describe('topes: pasos y gasto', () => {
  it('el tope duro de pasos corta (pasos + margen)', () => {
    let e = estadoInicial()
    e = { ...e, pasos_ejecutados: POST_IMG.pasos.length + POST_IMG.limites.margen, ultimo: 2 }
    const s = siguientePaso(e, POST_IMG)
    expect(s.accion).toBe('cierre_por_tope')
    if (s.accion === 'cierre_por_tope') expect(s.razon).toBe('tope_de_pasos')
  })
  it('el freno: gasto + tope del paso > tope del encargo ⇒ no arranca (cierre por tope, no excepción)', () => {
    let e = estadoInicial()
    e = registrarPaso(e, POST_IMG, 0, { costo_usd: 9.9, artefacto: {} })
    const s = siguientePaso(e, POST_IMG) // siguiente = paquete (tope 0,06) ⇒ 9,96 ≤ 10 arranca
    expect(s.accion).toBe('ejecutar')
    e = { ...e, gasto_usd: 9.99 }
    const t = siguientePaso(e, POST_IMG)
    expect(t.accion).toBe('cierre_por_tope')
    if (t.accion === 'cierre_por_tope') expect(t.razon).toBe('tope_de_gasto')
  })
  it('un paso de código (tope 0) sí arranca con el gasto justo al tope', () => {
    const e = { ...registrarPaso(estadoInicial(), POST_IMG, 0, { costo_usd: 0, artefacto: {} }), gasto_usd: 10 }
    const s = siguientePaso({ ...e, ultimo: 1 }, POST_IMG) // elegir_foto: código
    expect(s.accion).toBe('ejecutar')
  })
  it('el gasto se acumula con redondeo estable', () => {
    let e = estadoInicial()
    for (let i = 0; i < 3; i++) e = registrarPaso(e, POST_IMG, 4, { costo_usd: 0.014 })
    expect(e.gasto_usd).toBeCloseTo(0.042, 6)
  })
})

describe('registrarPaso es puro y lleva «cambio»', () => {
  it('no muta el estado de entrada', () => {
    const e0 = estadoInicial()
    const e1 = registrarPaso(e0, POST_IMG, 0, { costo_usd: 1, artefacto: { a: 1 } })
    expect(e0.gasto_usd).toBe(0)
    expect(e0.artefactos).toEqual({})
    expect(e1.artefactos.encargo.version).toBe(1)
  })
  it('si_cambio: verdadero tras una versión nueva, falso cuando un paso la consumió', () => {
    let e = registrarPaso(estadoInicial(), POST_IMG, 10, { costo_usd: 0, artefacto: { pie_de_foto: 'a' } }) // texto produce pieza_post v1
    expect(evaluar({ tipo: 'si_cambio', artefacto: 'pieza_post' }, e)).toBe(true)
    e = registrarPaso(e, POST_IMG, 11, { costo_usd: 0, artefacto: {} }) // chequeos consume pieza_post
    expect(evaluar({ tipo: 'si_cambio', artefacto: 'pieza_post' }, e)).toBe(false)
    e = registrarPaso(e, POST_IMG, 13, { costo_usd: 0, artefacto: { pie_de_foto: 'b' } }) // corrige: v2
    expect(evaluar({ tipo: 'si_cambio', artefacto: 'pieza_post' }, e)).toBe(true)
  })
  it('una observación nueva reemplaza las fichas abiertas de ese origen y «donde»', () => {
    const vieja: Ficha = { id: 'o1', origen: 'chequeo', donde: 'imagen', gravedad: 'bloquea', estado: 'abierta' }
    let e = registrarPaso(estadoInicial(), POST_IMG, 7, { costo_usd: 0, fichas: [vieja] })
    e = registrarPaso(e, POST_IMG, 7, { costo_usd: 0, reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' }, fichas: [] })
    expect(e.fichas[0].estado).toBe('tomada')
  })
})

describe('GENERICIDAD: el mismo motor corre una plantilla de juguete sin cambiar código', () => {
  const JUGUETE: Plantilla = {
    tipo: 'texto_corto', familia: 'texto_corto',
    limites: { margen: 3, tope_encargo_usd: 5, max_rondas: 1 },
    pasos: [
      { clave: 'abrir', tipo: 'codigo', quien: 'sala', funcion: 'abrir', condicion: { tipo: 'siempre' }, entrada: [], salida_artefacto: 'encargo', tope_usd: 0 },
      { clave: 'texto', tipo: 'agente', quien: 'content-creator', condicion: { tipo: 'siempre' }, entrada: ['encargo'], salida_artefacto: 'pieza_post', tope_usd: 0.2, salida: { esquema: 'pieza_post.v1', reintento_formato: 1 } },
      { clave: 'cierre', tipo: 'codigo', quien: 'sala', funcion: 'cierre', condicion: { tipo: 'siempre' }, entrada: ['pieza_post'], salida_artefacto: 'cierre', tope_usd: 0 },
    ],
    indicaciones: { 'content-creator': [{ regla: 'Entregas el texto.', aplica: 'codigo:salida' }] },
  }
  it('es válida y se recorre', () => {
    expect(validarPlantilla(JUGUETE)).toEqual([])
    expect(simular(JUGUETE, {}).claves).toEqual(['abrir', 'texto', 'cierre'])
  })
  it('el código del motor no menciona ninguna familia', async () => {
    const fs = await import('node:fs'), path = await import('node:path')
    const src = ['motor.ts', 'plantilla.ts'].map((f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n')
    expect(src).not.toMatch(/post_img|carrusel|historia/i)
  })
})
