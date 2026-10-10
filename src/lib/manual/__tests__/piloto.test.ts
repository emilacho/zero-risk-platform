/**
 * LAS MEDICIONES DEL PILOTO como pruebas (ilustración: `__tests__/fixtures/manual/piloto-medicion.json`, 10-oct-2026, datos reales del cliente piloto).
 * El CÓDIGO que se prueba es agnóstico; solo el dato es del piloto. Lo que midió el diagnóstico de CC#3 y mi prueba de factibilidad queda fijado aquí, sin modelo.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { camposFirmes, detectarDudas, dudasAtadas, evaluarHechos, fuenteDeSintesis, fuentesDeRaspado, frasesPropias, normalizar, ordenarMateria, recomprobar, ESTADOS_SIN_RESPALDO, aplicarEslogan } from '..'

const P = JSON.parse(fs.readFileSync('__tests__/fixtures/manual/piloto-medicion.json', 'utf8'))
const raspado = fuentesDeRaspado(P.filas, P.propios)
const sintesis = [
  ...P.sintesis.map((s: { texto: string; source_table: string }, i: number) => fuenteDeSintesis(`cerebro${i}`, `cerebro · ${s.source_table}`, s.texto)),
  ...P.icp.map((d: Record<string, unknown>, i: number) => fuenteDeSintesis(`icp${i}`, 'documento de ICP', JSON.stringify(d))),
]
const dudas = detectarDudas(P.icp.map((d: Record<string, unknown>, i: number) => ({ origen: `ICP ${i}`, texto: JSON.stringify(d.objections ?? '') })))
const informe = evaluarHechos({ manual: P.manual, fuentes: [...raspado, ...sintesis], dudas })
const propiasNorm = normalizar(raspado.filter((f) => f.tipo === 'primaria_propia').map((f) => f.texto).join('\n'))

describe('piloto · R1 el eslogan perdido', () => {
  const fp = frasesPropias(raspado)
  it('el código HALLA el eslogan que el manual no recogió, literal y con su procedencia (biografía + título del sitio + sitio)', () => {
    expect(fp.estado_eslogan).toBe('hallado')
    expect(fp.eslogan!.literal).toBe('Cuando tengas esa hambre de... Náufrago te espera!')
    expect(fp.eslogan!.tipo).toBe('biografia')
    expect(new Set(fp.eslogan!.fuentes.map((f) => f.canal))).toEqual(new Set(['sitio', 'instagram']))
    expect(fp.eslogan!.fuentes.some((f) => f.rol === 'titulo')).toBe(true)
  })
  it('las cuentas de COMPETIDORES presentes en el raspado no se mezclan con lo propio', () => {
    expect(raspado.some((f) => f.tipo === 'tercero')).toBe(true)
    expect(fp.eslogan!.fuentes.every((f) => raspado.find((x) => x.id === f.fuente_id)!.tipo === 'primaria_propia')).toBe(true)
  })
  it('y `tagline` (nulo en el manual de 29-sep) lo escribe el código, sin modelo', () => {
    expect(P.manual.tagline).toBeUndefined()
    expect(aplicarEslogan({ ...P.manual, tagline: null }, fp)).toMatchObject({ aplicado: true, manual: { tagline: 'Cuando tengas esa hambre de... Náufrago te espera!' } })
  })
})

describe('piloto · R2 la materia', () => {
  const m = ordenarMateria(raspado)
  it('lee MÁS que los 3.500 + 1.000 caracteres de hoy, el título con el eslogan va en las primeras líneas y todo recorte lleva su aviso', () => {
    expect(m.total_leido).toBeGreaterThan(4500)
    expect(m.texto.indexOf('Cuando tengas esa hambre')).toBeLessThan(800)
    expect(m.bloques[0].bloque).toBe('titulo_meta')
    for (const r of m.recortes) expect(m.bloques.find((b) => b.bloque === r.bloque)!.texto).toContain(`[bloque recortado: se leyeron ${r.leidos} de ${r.total} caracteres]`)
    expect(m.texto).not.toMatch(/TEXTO SINTÉTICO|ensayo/i)
  })
})

describe('piloto · R3 R4 R5 R7 lo que el manual afirma y nadie respalda', () => {
  it('las palabras de certeza del manual NO aparecen en NINGUNA de las fuentes propias (medido: «trazabilidad», «verificable», «ningún competidor», «origen»); «única» sí aparece, en otro contexto', () => {
    const palabra = (w: string) => ` ${propiasNorm} `.includes(` ${w} `)
    for (const w of ['trazabilidad', 'verificable', 'ningun competidor', 'origen']) expect(palabra(w), w).toBe(false)
    expect(propiasNorm.includes('unic')).toBe(true)
    for (const palabra of ['trazabilidad', 'verificable', 'ningun competidor', 'origen']) expect(normalizar(JSON.stringify(P.manual)).includes(palabra), palabra).toBe(true)
  })
  it('NINGUNA frase con palabra de certeza del manual queda «verificada»: todas salen sin respaldo (sin cita, o solo la síntesis del modelo)', () => {
    const ciertas = informe.hechos.filter((h) => h.marcas.includes('certeza'))
    expect(ciertas.length).toBeGreaterThanOrEqual(8)
    for (const h of ciertas) expect(ESTADOS_SIN_RESPALDO, `${h.campo}: ${h.clausula}`).toContain(h.estado)
    const palabras = (t: string) => ciertas.some((h) => h.detalle.some((d) => d.marca === 'certeza' && normalizar(d.texto).startsWith(t)))
    for (const t of ['trazab', 'verific', 'ningun competid', 'orige']) expect(palabras(t), t).toBe(true)
  })
  it('«única» (la palabra SÍ aparece en lo propio, en otro contexto) tampoco respalda «la única ghost kitchen…»: sin cita', () => {
    const h = informe.hechos.find((x) => x.campo === 'positioning' && normalizar(x.clausula).includes('unica ghost kitchen'))!
    expect(h.estado).toBe('sin_cita')
  })
  it('R4 · lo que solo repite el resumen del propio modelo es `solo_sintesis` (se citó a sí mismo), no un hecho', () => {
    const h = informe.hechos.find((x) => x.campo === 'propuestas_de_valor' && normalizar(x.clausula).includes('trazabilidad verificable'))!
    expect(h.estado).toBe('solo_sintesis')
    expect(h.fuente!.tipo).toBe('sintesis')
  })
  it('R5 · «el marisco viene de Olón»: Olón es la SEDE en lo propio (y una frase de marketing), no el origen del producto ⇒ sin cita, con su motivo', () => {
    const h = informe.hechos.find((x) => x.marcas.includes('lugar') && normalizar(x.clausula).includes('viene de olon'))!
    expect(h.estado).toBe('sin_cita')
    expect(h.motivo).toBe('sede_no_es_origen')
  })
  it('R7 · la duda del modelo existía («No sé si el marisco realmente viene de Olón o es marketing») y se ata a esa afirmación', () => {
    expect(dudas.map((d) => d.frase)).toContain('No sé si el marisco realmente viene de Olón o es marketing')
    const h = informe.hechos.find((x) => x.marcas.includes('lugar') && normalizar(x.clausula).includes('viene de olon'))!
    expect(dudasAtadas(h.clausula, dudas).length).toBeGreaterThanOrEqual(1)
  })
  it('lo creativo del piloto (voz, personalidad, misión) no da hallazgos por sí mismo', () => {
    const solo = evaluarHechos({ manual: { voice_description: P.manual.voice_description, mision_sin_origen: 'Llevar sabor de playa a la mesa.' }, fuentes: raspado })
    expect(solo.hechos).toEqual([])
  })
})

describe('piloto · R6 y la puerta final sobre el manual de hoy', () => {
  const r = recomprobar({}, P.manual, { fuentes: [...raspado, ...sintesis], dudas })
  it('después de la puerta, ningún hecho queda sin respaldo en la prosa (lo dudoso sale del manual o es «el cliente dice»)', () => {
    expect(r.informe.sin_respaldo.filter((h) => h.estado !== 'con_duda')).toEqual([])
    expect(JSON.stringify(r.manual)).not.toContain('PENDIENTE')
    expect(r.retirados.length).toBeGreaterThan(0) // lo retirado queda SOLO en el registro interno
    // el posicionamiento de hoy es TODO afirmación sin cita (A3): sale entero del manual y queda en el registro interno; el campo no inventa nada
    expect(r.manual.positioning).toBe('')
    expect(r.retirados.filter((x) => x.ruta === 'positioning').length).toBeGreaterThanOrEqual(4)
    const f = camposFirmes(r.manual)
    expect(f.sin_revisar).toEqual([])
  })
  it('no toca lo creativo: la descripción de voz queda tal cual', () => {
    expect(r.manual.voice_description).toBe(P.manual.voice_description)
  })
})
