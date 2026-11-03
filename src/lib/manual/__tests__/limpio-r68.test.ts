/**
 * Ronda 68 · datos REALES de la repetición del tramo 1 (fixtures/repeticion-r68: el manual guardado por el cimiento + el material propio raspado). Código agnóstico: el cliente es solo dato.
 * 03-nov, decisión de Emilio: la limpieza por código se quitó. Aquí queda lo que sigue vivo: los precios como fuente, las palabras declaradas anotadas y que la puerta no toca el texto.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluarHechos, fuentesDeRaspado, recomprobar } from '..'
import { palabrasDeclaradasEnUso, usaPalabraProhibida, palabrasProhibidasDelManual } from '../palabras-anotadas'

const DIR = 'src/lib/manual/__tests__/fixtures/repeticion-r68'
const MANUAL = JSON.parse(fs.readFileSync(`${DIR}/manual-guardado.json`, 'utf8')) as Record<string, any>
const { propios, filas } = JSON.parse(fs.readFileSync(`${DIR}/filas-propias.json`, 'utf8'))
const fuentes = fuentesDeRaspado(filas, propios)

describe('1 · nombres internos citados como fuente: la puerta ya no los quita', () => {
  it('rojo de hoy: el manual guardado trae (discovery_summary) ×2 en positioning y (icp_signals) ×N en icp_summary', () => {
    expect((MANUAL.positioning.match(/\(discovery_summary\)/g) ?? []).length).toBe(2)
    expect((MANUAL.icp_summary.match(/\(icp_signals\)/g) ?? []).length).toBeGreaterThanOrEqual(10)
  })
  it('la puerta los deja tal cual: que no salgan es trabajo de los empleados del manual y del panel', () => {
    const m = recomprobar({}, MANUAL, { fuentes }).manual
    expect(m.positioning).toBe(MANUAL.positioning)
    expect(m.icp_summary).toBe(MANUAL.icp_summary)
    expect(m.mensajes_clave).toEqual(MANUAL.mensajes_clave)
  })
})

describe('2 · los precios publicados por el cliente son fuente', () => {
  const precios = (t: string) => evaluarHechos({ manual: { m: t }, fuentes }).hechos.filter((h) => h.marcas.includes('cifra'))
  it('los datos estructurados de la carta (MenuItem → offers → price) llegan como fuente propia', () => {
    expect(fuentes.some((f) => f.tipo === 'primaria_propia' && f.rol === 'estructurado' && /precio: 3\.50/.test(f.texto))).toBe(true)
  })
  it('«$3.50–$9» (mínimo y máximo de la carta, con 9 = 9.00) tiene respaldo: no sale sin cita', () => {
    const hs = precios('Comida marina ecuatoriana en Olón a precio accesible ($3.50–$9 por plato).')
    expect(hs.length).toBeGreaterThan(0)
    for (const h of hs) expect(h.estado, h.clausula).toBe('verificado')
  })
  it('una cifra que el cliente NO publica sigue sin respaldo', () => {
    const hs = precios('Cobramos $14.75 por plato.')
    expect(hs.length).toBeGreaterThan(0)
    expect(hs.every((h) => h.estado === 'sin_cita')).toBe(true)
  })
  it('la puerta completa deja los precios del menú en el manual (antes los retiraba)', () => {
    const r = recomprobar({}, { positioning: 'Cocina marina a precio accesible ($3.50–$9 por plato), con servicio a domicilio.', mision: 'Servir comida marina accesible ($3.50–$9) a vecinos y visitantes todos los días.' }, { fuentes })
    expect(r.retirados.filter((x) => x.marca === 'cifra')).toEqual([])
    expect(r.manual.mision).toContain('$3.50–$9')
  })
})

describe('5 · las palabras que el propio manual declara se anotan (02-nov, firma de Emilio)', () => {
  it('rojo: las reglas visuales de la repetición usan «artesanal» y «exclusiva», que el mismo manual prohíbe', () => {
    const reglas = JSON.stringify(MANUAL.visual.reglas)
    expect(reglas).toMatch(/artesanal/); expect(reglas).toMatch(/exclusiva/)
  })
  it('verde: el texto sigue igual y queda anotado dónde se usan', () => {
    const m = { ...MANUAL, palabras_con_intencion: (MANUAL.forbidden_words as string[]).map((texto) => ({ texto, intencion: 'legal', fuente: { cita: 'la norma' } })) }
    expect(palabrasProhibidasDelManual(m)).toContain('artesanal')
    expect((recomprobar({}, m, { fuentes }).manual as Record<string, any>).visual.reglas).toEqual(MANUAL.visual.reglas)
    const anotadas = palabrasDeclaradasEnUso(m)
    expect(anotadas.map((q) => q.ruta).every((x) => x.startsWith('visual.reglas'))).toBe(true)
    expect(anotadas.length).toBeGreaterThan(0)
  })
  it('MENCIONARLA no es usarla: entre comillas, o tras «nunca/evita/sin…», o en un texto del cliente citado', () => {
    const p = ['artesanal', 'reserva']
    expect(usaPalabraProhibida('Nunca digas artesanal en un titular.', p)).toBeNull()
    expect(usaPalabraProhibida('Evitar términos como artesanal.', p)).toBeNull()
    expect(usaPalabraProhibida('Dolor: «sin posibilidad de reserva» según el cliente.', p)).toBeNull()
    expect(usaPalabraProhibida('Es una cocina artesanal y cercana.', p)).toBe('artesanal')
    expect(usaPalabraProhibida('Haz tu reserva hoy', p)).toBe('reserva')
  })
  it('la cita del cliente sobre «reserva» en el perfil de cliente ideal NO se anota', () => {
    const m = { ...MANUAL, palabras_con_intencion: [{ texto: 'reserva', intencion: 'legal', fuente: { cita: 'la norma' } }] }
    expect(palabrasDeclaradasEnUso(m).filter((q) => q.ruta === 'icp_summary')).toEqual([])
  })
})

describe('todo junto · la puerta real con el manual guardado de la repetición', () => {
  const r = recomprobar({}, MANUAL, { fuentes })
  it('todo el texto sale igual que entró', () => {
    for (const k of Object.keys(MANUAL)) if (!k.startsWith('_')) expect(r.manual[k], k).toEqual(MANUAL[k])
  })
  it('nada queda como retirado ni como cambio', () => {
    expect(r.retirados).toEqual([])
    expect(r.cambios).toEqual([])
  })
  it('idempotente: pasarlo otra vez tampoco cambia el texto', () => {
    const otra = recomprobar({}, r.manual, { fuentes })
    expect({ ...otra.manual, _field_meta: null }).toEqual({ ...r.manual, _field_meta: null })
  })
  it('agnóstico: el módulo no nombra a ningún cliente, ciudad ni rubro', () => {
    const src = fs.readFileSync('src/lib/manual/palabras-anotadas.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/náufrago|naufrago|olón|guayaquil|ceviche|encebollado|marisco/i)
  })
})
