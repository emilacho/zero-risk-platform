/**
 * Encargo 9 + ADENDA 1 (sin casillas) · el contrato con CC2 de 18:34Z, aceptado a las 20:49Z (pie de `PROPUESTA-CC2-…-indice-y-entrega.md`).
 * La pieza manda su HOJA completa; el índice y la base son COMPLETOS; la sede, la fecha y la fuente van como DATO. Nada se filtra ni se marca por sede.
 * El ejemplo sale de fichas REALES de Náufrago (las del reel de Olón, encargo 57101e2a): horario de Olón, leyenda del dueño (sin sede)
 * y resumen vivo de Guayaquil. Solo cambia el cliente (al sintético A). Ver `pieza-olon-real.json`.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { A, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import { armarIndice } from '../indice'
import { entregarContenido } from '../entregar'
import { CASILLAS_QUE_YA_NO_VAN, filaDeRastro, leerPieza, type Registrar } from '../segun-la-pieza'

const AHORA = new Date('2026-11-18T12:00:00Z')
const REAL = JSON.parse(fs.readFileSync(new URL('./pieza-olon-real.json', import.meta.url), 'utf-8')) as { fichas: Array<Record<string, unknown>> }
const HORARIO = 'cerebro_fichas:30557c31-5242-49fa-a27c-922ea6348e32'
const LEYENDA = 'cerebro_fichas:0fb4ad1b-1c2d-4ab6-a1de-4d1ca684a7d0'
const RESUMEN_GYE = 'cerebro_fichas:b51fa4e4-2060-4601-b6c4-f2b0634af78a'
const LARGA = 'cerebro_fichas:11111111-2222-4333-8444-555555555555'
const TEXTO_LARGO = 'Olón · carta completa de la temporada. '.repeat(6000) // ≈ 234.000 caracteres: más que el corte de 60.000 y que el tope viejo de 70.000
const original = (ref: string) => REAL.fichas.find((f) => `cerebro_fichas:${f.id}` === ref)?.contenido

const tablas = (conLarga = false) => {
  const t = tablasDeLaBase()
  const reales = REAL.fichas.map((f) => ({ ...f, client_id: A }))
  const larga = conLarga ? [{ id: LARGA.split(':')[1], client_id: A, clase: 'resumen_vivo', titulo: 'Resumen vivo · sede olon', que_es: 'resumen largo', contenido: TEXTO_LARGO, origen: 'plataforma', fecha_fuente: '2026-11-10T00:00:00Z', creado_en: '2026-11-10T00:00:00Z', sede: 'olon', propiedad: 'propia', prueba: false, descartada: false }] : []
  t.cerebro_fichas = [...(t.cerebro_fichas ?? []), ...reales, ...larga]
  return t
}
type Cuerpo = Record<string, any>
const registrador = () => {
  const filas: Array<Record<string, unknown>> = []
  const registrar: Registrar = async (fila) => { filas.push(fila); return { id: `consulta-${filas.length}` } }
  return { filas, registrar }
}
const HOJA = '## Brief\nReel de Olón para el fin de semana: horario y la historia del nombre.\n\n## Plan\n1. gancho con el encebollado\n2. horario de Olón\n3. la leyenda del pergamino'
const PIEZA = { cliente: A, agente: 'content-creator', turno: 'turno-7', pieza: { encargo_id: '57101e2a-reel-olon', fila: 'fila-1', hoja: HOJA } }
const indice = async (cuerpo: unknown, o: { conLarga?: boolean; registrar?: Registrar } = {}) =>
  armarIndice(crearBaseFalsa(tablas(o.conLarga)).consulta, cuerpo, { ahora: AHORA, registrar: o.registrar, reloj: () => 1000 })
const entregar = async (cuerpo: unknown, o: { conLarga?: boolean; registrar?: Registrar } = {}) =>
  entregarContenido(crearBaseFalsa(tablas(o.conLarga)).consulta, cuerpo, { ahora: AHORA, registrar: o.registrar, reloj: () => 1000 })

describe('índice de una pieza · completo, sin casillas · con fichas reales', () => {
  it('el índice es el COMPLETO del cliente: mismas líneas, mismo orden, mismos números y misma huella que sin pieza', async () => {
    const c = (await indice(PIEZA)).cuerpo as Cuerpo
    const sin = (await indice({ cliente: A })).cuerpo as Cuerpo
    expect(c.lista.map((l: Cuerpo) => [l.numero, l.ref])).toEqual(sin.lista.map((l: Cuerpo) => [l.numero, l.ref]))
    expect(c.huella).toBe(sin.huella)
    // lo de Guayaquil y lo que no tiene sede están en el índice como lo demás
    for (const ref of [HORARIO, LEYENDA, RESUMEN_GYE]) expect(c.lista.some((l: Cuerpo) => l.ref === ref), ref).toBe(true)
    // sin pieza, la respuesta de siempre
    expect(sin.base_completa).toBeUndefined()
    expect(sin.lista.some((l: Cuerpo) => 'fuente' in l)).toBe(false)
  })
  it('nada se marca por sede: la sede, la fecha y la fuente van como DATO en cada línea y en el texto', async () => {
    const c = (await indice(PIEZA)).cuerpo as Cuerpo
    const por = (ref: string) => c.lista.find((l: Cuerpo) => l.ref === ref)
    expect(por(HORARIO)).toMatchObject({ sede: 'olon', fuente: 'su_fuente' })
    expect(por(RESUMEN_GYE)).toMatchObject({ sede: 'guayaquil', fuente: 'plataforma', fecha_fuente: '2026-10-31T00:00:00.000Z' })
    expect(por(LEYENDA)).toMatchObject({ sede: null, fuente: 'dueno' })
    for (const l of c.lista) { expect('marca' in l, l.ref).toBe(false); expect('de_la_pieza' in l, l.ref).toBe(false) }
    const lineas: string[] = c.lista_texto.split('\n')
    expect(lineas).toHaveLength(c.lista.length)
    const linea = (ref: string) => lineas[c.lista.findIndex((l: Cuerpo) => l.ref === ref)]
    expect(linea(RESUMEN_GYE)).toMatch(/ · sede guayaquil · fuente plataforma$/)
    expect(linea(HORARIO)).toMatch(/ · sede olon · fuente su_fuente$/)
    expect(linea(LEYENDA)).toMatch(/ · fuente dueno$/)
    expect(linea(LEYENDA)).not.toMatch(/ · sede /)
    expect(c.lista_texto).not.toMatch(/OTRA OFERTA|no es tuyo|de la pieza/i)
  })
  it('base_completa: lo fijo + hechos del negocio + lo del dueño + el resumen vivo de TODAS las sedes, cada texto entero', async () => {
    const c = (await indice(PIEZA)).cuerpo as Cuerpo
    const refs = c.base_completa.map((b: Cuerpo) => b.ref)
    for (const ref of [RESUMEN_GYE, LEYENDA]) expect(refs, ref).toContain(ref)
    for (const ref of [RESUMEN_GYE, LEYENDA]) expect(c.base_completa.find((b: Cuerpo) => b.ref === ref).texto, ref).toBe(original(ref))
    expect(c.base_completa.find((b: Cuerpo) => b.ref === RESUMEN_GYE)).toMatchObject({ sede: 'guayaquil', fuente: 'plataforma', fijo: false, estado_de_lectura: 'ok' })
    // lo fijo va sin número; lo demás con el número del índice
    const fijos = c.base_completa.filter((b: Cuerpo) => b.fijo)
    expect(fijos.map((b: Cuerpo) => b.ref).sort()).toEqual(c.fijo.map((f: Cuerpo) => f.ref).sort())
    for (const f of fijos) expect(f.numero).toBeNull()
    const num = new Map(c.lista.map((l: Cuerpo) => [l.ref, l.numero]))
    for (const b of c.base_completa.filter((x: Cuerpo) => !x.fijo)) expect(b.numero, b.ref).toBe(num.get(b.ref))
    // los hechos del negocio (E2: sedes, datos de sede, ficha del cliente…) están todos
    const e2 = c.lista.filter((l: Cuerpo) => l.estante === 'E2').map((l: Cuerpo) => l.ref)
    expect(e2.length).toBeGreaterThan(0)
    for (const r of e2) expect(refs, r).toContain(r)
    // un horario suelto (clase mapas, E8) NO va a la base: se pide por número
    expect(refs).not.toContain(HORARIO)
  })
  it('nada se recorta: un resumen vivo de ~234.000 caracteres llega ENTERO a la base', async () => {
    const c = (await indice(PIEZA, { conLarga: true })).cuerpo as Cuerpo
    const larga = c.base_completa.find((b: Cuerpo) => b.ref === LARGA)
    expect(larga.texto).toBe(TEXTO_LARGO)
    expect(larga.texto.length).toBeGreaterThan(70_000)
  })
  it('deja rastro en cerebro_consultas con la hoja COMPLETA y devuelve su consulta_id', async () => {
    const r = registrador()
    const c = (await indice(PIEZA, { registrar: r.registrar })).cuerpo as Cuerpo
    expect(c.consulta_id).toBe('consulta-1')
    expect(c.rastro).toEqual({ registrado: true, consulta_id: 'consulta-1' })
    expect(r.filas).toHaveLength(1)
    expect(r.filas[0]).toMatchObject({ client_id: A, oficina: 'mesa', agente: 'content-creator', ruta: 'indice', encargo_id: '57101e2a-reel-olon', fila: 'fila-1', turno: 'turno-7', hoja: HOJA, sede_clave: null, que: null, numeros_no_consta: [] })
    expect(r.filas[0].fichas_entregadas).toEqual(c.base_completa.map((b: Cuerpo) => b.ref))
    expect(r.filas[0].resultados).toBe(c.base_completa.length)
  })
  it('la hoja se guarda tal cual, sin recortar (aunque sea muy larga)', async () => {
    const r = registrador()
    const hoja = `${HOJA}\n${'detalle del plan '.repeat(20000)}`
    await indice({ ...PIEZA, pieza: { ...PIEZA.pieza, hoja } }, { registrar: r.registrar })
    expect(r.filas[0].hoja).toBe(hoja)
  })
  it('si el rastro no se puede escribir, la respuesta lo DICE y sigue (no rompe la pieza)', async () => {
    const c = (await indice(PIEZA, { registrar: async () => { throw new Error('base caída') } })).cuerpo as Cuerpo
    expect(c.rastro).toEqual({ registrado: false, consulta_id: null, error: 'base caída' })
    expect(c.consulta_id).toBeNull()
    expect(c.base_completa.length).toBeGreaterThan(0)
    const e = (await indice(PIEZA, { registrar: async () => ({ error: 'cerebro_consultas: sin permiso' }) })).cuerpo as Cuerpo
    expect(e.rastro).toEqual({ registrado: false, consulta_id: null, error: 'cerebro_consultas: sin permiso' })
  })
  it('SIN CASILLAS: sede, oferta, tema, canal o para_que (afuera o dentro de la pieza) → 400 que dice que la hoja va completa', async () => {
    for (const k of CASILLAS_QUE_YA_NO_VAN) {
      for (const cuerpo of [{ ...PIEZA, [k]: 'olon' }, { ...PIEZA, pieza: { ...PIEZA.pieza, [k]: 'olon' } }]) {
        const r = await indice(cuerpo)
        expect(r.status, k).toBe(400)
        expect((r.cuerpo as Cuerpo).errores.join(' '), k).toMatch(new RegExp(`\`${k}\` ya no va: sin casillas`))
      }
    }
  })
  it('sin hoja, sin encargo o sin agente: 400', async () => {
    expect((await indice({ ...PIEZA, pieza: { encargo_id: 'e1' } })).status).toBe(400)
    expect((await indice({ ...PIEZA, pieza: { ...PIEZA.pieza, hoja: '   ' } })).status).toBe(400)
    expect((await indice({ ...PIEZA, pieza: { fila: 'x', hoja: HOJA } })).status).toBe(400)
    const { agente: _a, ...sinAgente } = PIEZA
    expect((await indice(sinAgente)).status).toBe(400)
    expect((await indice({ ...PIEZA, pieza: 'reel' })).status).toBe(400)
    expect((await indice({ ...PIEZA, turno: 7 })).status).toBe(400)
  })
})

describe('entrega a una pieza · por número con la huella', () => {
  const numeros = async (o: { conLarga?: boolean } = {}) => {
    const c = (await indice(PIEZA, o)).cuerpo as Cuerpo
    const n = (ref: string) => c.lista.find((l: Cuerpo) => l.ref === ref).numero as number
    return { huella: c.huella as string, n }
  }
  it('horario, leyenda y resumen de Guayaquil por número, con su original completo y sede/fecha/fuente como dato; el 9999 «no consta»', async () => {
    const { huella, n } = await numeros()
    const r = registrador()
    const res = await entregar({ ...PIEZA, numeros: [n(HORARIO), n(LEYENDA), n(RESUMEN_GYE), 9999], huella }, { registrar: r.registrar })
    const c = res.cuerpo as Cuerpo
    expect(res.status).toBe(200)
    expect(c.estado).toBe('parcial')
    const por = (ref: string) => c.material.find((m: Cuerpo) => m.ref === ref)
    for (const ref of [HORARIO, LEYENDA, RESUMEN_GYE]) expect(por(ref).texto, ref).toBe(original(ref))
    expect(por(HORARIO)).toMatchObject({ numero: n(HORARIO), sede: 'olon', fuente: 'su_fuente', estado_de_lectura: 'ok' })
    expect(por(LEYENDA)).toMatchObject({ sede: null, fuente: 'dueno' })
    expect(por(RESUMEN_GYE)).toMatchObject({ sede: 'guayaquil', fuente: 'plataforma' })
    for (const m of c.material) { expect('marca' in m).toBe(false); expect('de_la_pieza' in m).toBe(false) }
    expect(c.no_consta).toEqual([{ numero: 9999, estado: 'no_consta', motivo: 'ese número no está en la lista del índice (no existe o fue retirado)' }])
    expect(c.consulta_id).toBe('consulta-1')
    expect(r.filas[0]).toMatchObject({ ruta: 'entregar', encargo_id: '57101e2a-reel-olon', agente: 'content-creator', hoja: HOJA, fichas_entregadas: [HORARIO, LEYENDA, RESUMEN_GYE], numeros_no_consta: [9999], resultados: 3, sin_dato: false })
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
  it('un número repetido se entrega una vez; lo que no es entero «no consta»', async () => {
    const { huella, n } = await numeros()
    const c = (await entregar({ ...PIEZA, numeros: [n(HORARIO), n(HORARIO), 'tres', 2.5], huella })).cuerpo as Cuerpo
    expect(c.material.map((m: Cuerpo) => m.ref)).toEqual([HORARIO])
    expect(c.no_consta.map((x: Cuerpo) => x.numero)).toEqual(['tres', 2.5])
  })
  it('falta la huella o los números, o llega una casilla: 400', async () => {
    expect((await entregar({ ...PIEZA, numeros: [1] })).status).toBe(400)
    expect((await entregar({ ...PIEZA, numeros: [], huella: 'x' })).status).toBe(400)
    expect((await entregar({ ...PIEZA, sede: 'olon', numeros: [1], huella: 'x' })).status).toBe(400)
  })
})

describe('las piezas sueltas del contrato', () => {
  it('leerPieza devuelve la hoja tal cual (con sus saltos y espacios)', () => {
    const hoja = '  brief  \n\n  plan  '
    const p = leerPieza({ ...PIEZA, pieza: { ...PIEZA.pieza, hoja } })
    expect(p.ok && p.pieza.hoja).toBe(hoja)
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
  const columnas = ['ruta', 'encargo_id', 'fila', 'turno', 'hoja', 'fichas_entregadas', 'numeros_no_consta']
  it('es aditiva (solo agrega), sin las casillas viejas, y la reversa quita exactamente lo que agrega', () => {
    expect(mig).not.toMatch(/\bdrop column\b|\bdelete\b|\bupdate\b|\btruncate\b/i)
    expect(mig).not.toMatch(/\b(oferta|canal)\b/)
    for (const k of columnas) {
      expect(mig, k).toMatch(new RegExp(`add column if not exists ${k} `))
      expect(rev, k).toMatch(new RegExp(`drop column if exists ${k}\\b`))
    }
    expect((mig.match(/add column if not exists/g) ?? []).length).toBe(columnas.length)
    expect((rev.match(/drop column if exists/g) ?? []).length).toBe(columnas.length)
    expect(mig).toMatch(/hoja text/)
    expect(mig).toMatch(/fichas_entregadas jsonb/)
    expect(mig).toMatch(/ruta in \('indice', 'entregar'\)/)
    expect(rev).toMatch(/drop constraint if exists cerebro_consultas_ruta_check/)
    expect(rev).toMatch(/drop index if exists public\.cerebro_consultas_pieza/)
  })
})
