/**
 * Encargo 9 · el cerebro entrega SEGÚN LA PIEZA · el contrato acordado con CC2 (pie de `PROPUESTA-CC2-…-indice-y-entrega.md`, 16:05Z + nota).
 * El ejemplo sale de fichas REALES de Náufrago (las del reel de Olón, encargo 57101e2a): el horario de Olón, la leyenda (sin sede)
 * y el resumen vivo de Guayaquil. Solo cambia el cliente (al sintético A). Ver `pieza-olon-real.json`.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { A, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import { armarIndice } from '../indice'
import { entregarContenido } from '../entregar'
import { AVISO_SIN_SEDE, deLaPieza, filaDeRastro, leerPieza, type Registrar } from '../segun-la-pieza'

const AHORA = new Date('2026-11-18T12:00:00Z')
const REAL = JSON.parse(fs.readFileSync(new URL('./pieza-olon-real.json', import.meta.url), 'utf-8')) as { fichas: Array<Record<string, unknown>> }
const HORARIO = 'cerebro_fichas:30557c31-5242-49fa-a27c-922ea6348e32'
const LEYENDA = 'cerebro_fichas:0fb4ad1b-1c2d-4ab6-a1de-4d1ca684a7d0'
const RESUMEN_GYE = 'cerebro_fichas:b51fa4e4-2060-4601-b6c4-f2b0634af78a'
const LARGA = 'cerebro_fichas:11111111-2222-4333-8444-555555555555'
const TEXTO_LARGO = 'Olón · carta completa de la temporada. '.repeat(6000) // ≈ 234.000 caracteres: más que el corte de 60.000 y que el tope viejo de 70.000

const tablas = (conLarga = false) => {
  const t = tablasDeLaBase()
  const reales = REAL.fichas.map((f) => ({ ...f, client_id: A }))
  const larga = conLarga ? [{ id: LARGA.split(':')[1], client_id: A, clase: 'carta', titulo: 'Carta de la temporada · sede olon', que_es: 'carta completa', contenido: TEXTO_LARGO, origen: 'dueno', fecha_fuente: '2026-11-10T00:00:00Z', creado_en: '2026-11-10T00:00:00Z', sede: 'olon', propiedad: 'propia', prueba: false, descartada: false }] : []
  t.cerebro_fichas = [...(t.cerebro_fichas ?? []), ...reales, ...larga]
  return t
}
type Cuerpo = Record<string, any>
const registrador = () => {
  const filas: Array<Record<string, unknown>> = []
  const registrar: Registrar = async (fila) => { filas.push(fila); return { id: `consulta-${filas.length}` } }
  return { filas, registrar }
}
const PIEZA = { cliente: A, agente: 'content-creator', sede: 'olon', oferta: 'encebollado', canal: 'instagram', tema: 'horario del fin de semana', turno: 'turno-7', pieza: { encargo_id: '57101e2a-reel-olon', fila: 'fila-1' } }
const indice = async (cuerpo: unknown, o: { conLarga?: boolean; registrar?: Registrar } = {}) => {
  const b = crearBaseFalsa(tablas(o.conLarga))
  return armarIndice(b.consulta, cuerpo, { ahora: AHORA, registrar: o.registrar, reloj: () => 1000 })
}
const entregar = async (cuerpo: unknown, o: { conLarga?: boolean; registrar?: Registrar } = {}) => {
  const b = crearBaseFalsa(tablas(o.conLarga))
  return entregarContenido(b.consulta, cuerpo, { ahora: AHORA, registrar: o.registrar, reloj: () => 1000 })
}

describe('índice de una pieza (sede olon) · con fichas reales', () => {
  it('base_de_la_pieza = lo fijo + lo de SU sede con el original completo; ni Guayaquil ni lo que no tiene sede entran a la base', async () => {
    const c = (await indice(PIEZA)).cuerpo as Cuerpo
    const refs = c.base_de_la_pieza.map((b: Cuerpo) => b.ref)
    expect(refs).toContain(HORARIO)
    expect(refs).not.toContain(RESUMEN_GYE)
    expect(refs).not.toContain(LEYENDA)
    const horario = c.base_de_la_pieza.find((b: Cuerpo) => b.ref === HORARIO)
    expect(horario.texto).toBe(REAL.fichas.find((f) => `cerebro_fichas:${f.id}` === HORARIO)?.contenido)
    expect(horario).toMatchObject({ sede: 'olon', fijo: false, estado_de_lectura: 'ok' })
    expect(typeof horario.numero).toBe('number')
    // lo fijo va a la base, sin número
    const fijos = c.base_de_la_pieza.filter((b: Cuerpo) => b.fijo)
    expect(fijos.map((b: Cuerpo) => b.ref).sort()).toEqual(c.fijo.map((f: Cuerpo) => f.ref).sort())
    for (const f of fijos) expect(f.numero).toBeNull()
    expect(c.avisos).toEqual([])
  })
  it('cada línea dice su sede y si es de la pieza; la de otra sede va marcada «otra oferta: guayaquil»; la que no tiene sede no es de la pieza y NO se marca', async () => {
    const c = (await indice(PIEZA)).cuerpo as Cuerpo
    const por = (ref: string) => c.lista.find((l: Cuerpo) => l.ref === ref)
    expect(por(HORARIO)).toMatchObject({ sede: 'olon', de_la_pieza: true })
    expect(por(HORARIO).marca).toBeUndefined()
    expect(por(RESUMEN_GYE)).toMatchObject({ sede: 'guayaquil', de_la_pieza: false, marca: 'otra oferta: guayaquil' })
    expect(por(LEYENDA)).toMatchObject({ sede: null, de_la_pieza: false })
    expect(por(LEYENDA).marca).toBeUndefined()
    // en el texto para el empleado, solo la de Guayaquil lleva la marca
    const lineas = c.lista_texto.split('\n')
    expect(lineas).toHaveLength(c.lista.length)
    const marcadas = lineas.filter((l: string) => l.includes('OTRA OFERTA:'))
    expect(marcadas.length).toBe(c.lista.filter((l: Cuerpo) => l.marca).length)
    expect(lineas.find((l: string) => l.startsWith(`${por(RESUMEN_GYE).numero}.`) || l.includes(`${por(RESUMEN_GYE).numero} `))).toContain('OTRA OFERTA: GUAYAQUIL')
  })
  it('las de la pieza van primero; los NÚMEROS y la huella son los mismos que sin pieza', async () => {
    const c = (await indice(PIEZA)).cuerpo as Cuerpo
    const sin = (await indice({ cliente: A })).cuerpo as Cuerpo
    const primeraAjena = c.lista.findIndex((l: Cuerpo) => !l.de_la_pieza)
    expect(primeraAjena).toBeGreaterThan(0)
    expect(c.lista.slice(primeraAjena).every((l: Cuerpo) => !l.de_la_pieza)).toBe(true)
    const numSin = new Map(sin.lista.map((l: Cuerpo) => [l.ref, l.numero]))
    for (const l of c.lista) expect(l.numero, l.ref).toBe(numSin.get(l.ref))
    expect(c.lista.length).toBe(sin.lista.length)
    expect(c.huella).toBe(sin.huella)
    // sin pieza, la respuesta de siempre: ni base ni marcas
    expect(sin.base_de_la_pieza).toBeUndefined()
    expect(sin.lista.some((l: Cuerpo) => 'de_la_pieza' in l)).toBe(false)
  })
  it('una pieza SIN sede: todo es de la pieza, la base es solo lo fijo y lo avisa', async () => {
    const { sede: _s, ...sinSede } = PIEZA
    const c = (await indice(sinSede)).cuerpo as Cuerpo
    expect(c.avisos).toEqual([AVISO_SIN_SEDE])
    expect(c.lista.every((l: Cuerpo) => l.de_la_pieza === true && l.marca === undefined)).toBe(true)
    expect(c.base_de_la_pieza.every((b: Cuerpo) => b.fijo)).toBe(true)
  })
  it('nada se recorta: una ficha de su sede de ~234.000 caracteres llega ENTERA a la base', async () => {
    const c = (await indice(PIEZA, { conLarga: true })).cuerpo as Cuerpo
    const larga = c.base_de_la_pieza.find((b: Cuerpo) => b.ref === LARGA)
    expect(larga.texto).toBe(TEXTO_LARGO)
    expect(larga.texto.length).toBeGreaterThan(70_000)
  })
  it('deja rastro en cerebro_consultas y devuelve su consulta_id', async () => {
    const r = registrador()
    const c = (await indice(PIEZA, { registrar: r.registrar })).cuerpo as Cuerpo
    expect(c.consulta_id).toBe('consulta-1')
    expect(c.rastro).toEqual({ registrado: true, consulta_id: 'consulta-1' })
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toMatchObject({ client_id: A, oficina: 'mesa', agente: 'content-creator', ruta: 'indice', encargo_id: '57101e2a-reel-olon', fila: 'fila-1', turno: 'turno-7', oferta: 'encebollado', canal: 'instagram', sede_clave: 'olon', que: 'horario del fin de semana', numeros_no_consta: [] })
    expect(r.filas[0].fichas_entregadas).toEqual(c.base_de_la_pieza.map((b: Cuerpo) => b.ref))
    expect(r.filas[0].resultados).toBe(c.base_de_la_pieza.length)
  })
  it('si el rastro no se puede escribir, la respuesta lo DICE y sigue (no rompe la pieza)', async () => {
    const c = (await indice(PIEZA, { registrar: async () => { throw new Error('base caída') } })).cuerpo as Cuerpo
    expect(c.rastro).toEqual({ registrado: false, consulta_id: null, error: 'base caída' })
    expect(c.consulta_id).toBeNull()
    expect(c.base_de_la_pieza.length).toBeGreaterThan(0)
    const e = (await indice(PIEZA, { registrar: async () => ({ error: 'cerebro_consultas: sin permiso' }) })).cuerpo as Cuerpo
    expect(e.rastro).toEqual({ registrado: false, consulta_id: null, error: 'cerebro_consultas: sin permiso' })
  })
  it('una pieza sin encargo o sin agente se rechaza (400): el rastro necesita los dos', async () => {
    expect((await indice({ ...PIEZA, pieza: { fila: 'x' } })).status).toBe(400)
    const { agente: _a, ...sinAgente } = PIEZA
    const r = await indice(sinAgente)
    expect(r.status).toBe(400)
    expect((r.cuerpo as Cuerpo).errores).toContain('falta `agente` (quién pide: va al rastro)')
    expect((await indice({ ...PIEZA, sede: 7 })).status).toBe(400)
    expect((await indice({ ...PIEZA, pieza: 'reel' })).status).toBe(400)
  })
})

describe('entrega a una pieza · por número con la huella', () => {
  const numeros = async (o: { conLarga?: boolean } = {}) => {
    const c = (await indice(PIEZA, o)).cuerpo as Cuerpo
    const n = (ref: string) => c.lista.find((l: Cuerpo) => l.ref === ref).numero as number
    return { huella: c.huella as string, n }
  }
  it('el horario y la leyenda por número, con su original completo; Guayaquil llega marcado; el 9999 «no consta»', async () => {
    const { huella, n } = await numeros()
    const r = registrador()
    const res = await entregar({ ...PIEZA, numeros: [n(HORARIO), n(LEYENDA), n(RESUMEN_GYE), 9999], huella }, { registrar: r.registrar })
    const c = res.cuerpo as Cuerpo
    expect(res.status).toBe(200)
    expect(c.estado).toBe('parcial')
    const por = (ref: string) => c.material.find((m: Cuerpo) => m.ref === ref)
    for (const ref of [HORARIO, LEYENDA, RESUMEN_GYE]) expect(por(ref).texto, ref).toBe(REAL.fichas.find((f) => `cerebro_fichas:${f.id}` === ref)?.contenido)
    expect(por(HORARIO)).toMatchObject({ numero: n(HORARIO), sede: 'olon', de_la_pieza: true, estado_de_lectura: 'ok' })
    expect(por(LEYENDA)).toMatchObject({ sede: null, de_la_pieza: false })
    expect(por(LEYENDA).marca).toBeUndefined()
    expect(por(RESUMEN_GYE)).toMatchObject({ sede: 'guayaquil', de_la_pieza: false, marca: 'otra oferta: guayaquil' })
    expect(c.no_consta).toEqual([{ numero: 9999, estado: 'no_consta', motivo: 'ese número no está en la lista del índice (no existe o fue retirado)' }])
    expect(c.consulta_id).toBe('consulta-1')
    expect(r.filas[0]).toMatchObject({ ruta: 'entregar', encargo_id: '57101e2a-reel-olon', agente: 'content-creator', fichas_entregadas: [HORARIO, LEYENDA, RESUMEN_GYE], numeros_no_consta: [9999], resultados: 3, sin_dato: false })
  })
  it('sin tope: la ficha de ~234.000 caracteres se entrega entera', async () => {
    const { huella, n } = await numeros({ conLarga: true })
    const c = (await entregar({ ...PIEZA, numeros: [n(LARGA), n(HORARIO)], huella }, { conLarga: true })).cuerpo as Cuerpo
    expect(c.estado).toBe('ok')
    expect(c.material.find((m: Cuerpo) => m.ref === LARGA).texto).toBe(TEXTO_LARGO)
    expect(c.material).toHaveLength(2)
  })
  it('huella vieja: NADA se entrega por número (podría ser otra ficha); todo «no consta» y viene la huella actual', async () => {
    const { huella, n } = await numeros()
    const r = registrador()
    const c = (await entregar({ ...PIEZA, numeros: [n(HORARIO)], huella: 'ffffffffffffffff' }, { registrar: r.registrar })).cuerpo as Cuerpo
    expect(c.material).toEqual([])
    expect(c.estado).toBe('no_consta')
    expect(c.no_consta).toEqual([{ numero: n(HORARIO), estado: 'no_consta', motivo: 'la lista cambió desde que se vio: pide de nuevo el índice' }])
    expect(c.huella_actual).toBe(huella)
    expect(r.filas[0]).toMatchObject({ fichas_entregadas: [], numeros_no_consta: [n(HORARIO)], sin_dato: true })
  })
  it('un número que no es entero, o repetido: el repetido se entrega una vez y lo inválido «no consta»', async () => {
    const { huella, n } = await numeros()
    const c = (await entregar({ ...PIEZA, numeros: [n(HORARIO), n(HORARIO), 'tres', 2.5], huella })).cuerpo as Cuerpo
    expect(c.material.map((m: Cuerpo) => m.ref)).toEqual([HORARIO])
    expect(c.no_consta.map((x: Cuerpo) => x.numero)).toEqual(['tres', 2.5])
  })
  it('falta la huella o los números: 400', async () => {
    expect((await entregar({ ...PIEZA, numeros: [1] })).status).toBe(400)
    expect((await entregar({ ...PIEZA, numeros: [], huella: 'x' })).status).toBe(400)
  })
})

describe('las piezas sueltas del contrato', () => {
  const f = (sede: string | null) => ({ sede }) as never
  it('comparar sedes es exacto, campo contra campo: solo espacios al borde y mayúsculas; las tildes cuentan', () => {
    expect(deLaPieza(f(' Olon '), 'olon')).toEqual({ de_la_pieza: true, marca: null })
    expect(deLaPieza(f('Olón'), 'olon')).toEqual({ de_la_pieza: false, marca: 'otra oferta: Olón' })
    expect(deLaPieza(f('olon norte'), 'olon')).toEqual({ de_la_pieza: false, marca: 'otra oferta: olon norte' })
    expect(deLaPieza(f(null), 'olon')).toEqual({ de_la_pieza: false, marca: null })
    expect(deLaPieza(f('guayaquil'), null)).toEqual({ de_la_pieza: true, marca: null })
  })
  it('la fila del rastro solo lleva columnas de cerebro_consultas (las de hoy + las de 202611181800)', () => {
    const p = leerPieza(PIEZA)
    if (!p.ok) throw new Error('pieza')
    const fila = filaDeRastro({ cliente: A, pieza: p.pieza, ruta: 'entregar', entregadas: [HORARIO], noConstan: [9], ms: 12.6 })
    const mig = fs.readFileSync(new URL('../../../../../supabase/migrations/202611181800_cerebro_consultas_rastro_de_la_pieza.sql', import.meta.url), 'utf-8')
    const deHoy = ['client_id', 'oficina', 'agente', 'que', 'atributo', 'sede_clave', 'resultados', 'sin_dato', 'ms']
    for (const k of Object.keys(fila)) expect(deHoy.includes(k) || new RegExp(`add column if not exists ${k} `).test(mig), k).toBe(true)
    expect(fila.ms).toBe(13)
  })
})

describe('la migración 202611181800 y su reversa', () => {
  const mig = fs.readFileSync(new URL('../../../../../supabase/migrations/202611181800_cerebro_consultas_rastro_de_la_pieza.sql', import.meta.url), 'utf-8')
  const rev = fs.readFileSync(new URL('../../../../../supabase/reversas/202611181800_cerebro_consultas_rastro_de_la_pieza_REVERSA.sql', import.meta.url), 'utf-8')
  const columnas = ['ruta', 'encargo_id', 'fila', 'turno', 'oferta', 'canal', 'fichas_entregadas', 'numeros_no_consta']
  it('es aditiva (solo agrega) y la reversa quita exactamente lo que agrega', () => {
    expect(mig).not.toMatch(/\bdrop column\b|\bdelete\b|\bupdate\b|\btruncate\b/i)
    for (const k of columnas) {
      expect(mig, k).toMatch(new RegExp(`add column if not exists ${k} `))
      expect(rev, k).toMatch(new RegExp(`drop column if exists ${k}\\b`))
    }
    expect(mig).toMatch(/fichas_entregadas jsonb/)
    expect(mig).toMatch(/numeros_no_consta jsonb/)
    expect(mig).toMatch(/ruta in \('indice', 'entregar'\)/)
    expect(rev).toMatch(/drop constraint if exists cerebro_consultas_ruta_check/)
    expect(rev).toMatch(/drop index if exists public\.cerebro_consultas_pieza/)
  })
})
