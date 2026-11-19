/**
 * ENCARGO 10 · al LEER, lo de otro negocio llega CON su marca (no se oculta): el lector de fichas, la línea que ve el modelo y la entrega según la pieza.
 * Y la migración 202611191600 con su reversa. US$ 0, sin red. El motivo y la prueba son los reales de la reclasificación del 19-nov (Medellín → mercado/global; Laredo → nada).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { lineaParaElModelo, textoDeLaMarca } from '../portero/lista-numerada'
import { datosDeLaFicha } from '../portero/segun-la-pieza'
import type { Ficha, ListaCorta } from '../tipos'
import { A, AHORA, crearBaseFalsa } from './casos'
import { dias, ficha, tablasConFichas } from './fichas-casos'

const HOTEL = 'https://www.clickclackhotel.com/en/hotel-clickclackmedellin-in-medellin/restaurants/castaway/'
const LAREDO = 'https://www.lmtonline.com/lmtenespanol/article/N-ufrago-ecuatoriano-est-vivo-para-contar-10388465.php'
const MEDELLIN = 'negocio de Medellín (Colombia), mismo rubro en otro país: lo trajo la búsqueda de Mapas alrededor de la sede falsa «antioquia»; no compite con el cliente'
const DE_LAREDO = 'se armó para la sede «laredo», que salió de un diario de Laredo (lmtonline.com) sobre un náufrago, no del cliente'

async function conMarcas(): Promise<ListaCorta> {
  const t = tablasConFichas()
  t.cerebro_fichas = [
    ...(t.cerebro_fichas ?? []),
    ficha('mde-1', A, { clase: 'competidor_mapas', titulo: 'Competidor en Mapas · PESQUEIRA', creado_en: dias(20), otro_negocio_motivo: MEDELLIN, otro_negocio_prueba: HOTEL, otro_negocio_como: 'mercado', otro_negocio_nivel: 'global', otro_negocio_por: 'decision:CEREBRO-2026-11-19', otro_negocio_en: dias(0) }),
    ficha('lar-1', A, { clase: 'resumen_vivo', titulo: 'Resumen vivo · sede laredo', creado_en: dias(20), otro_negocio_motivo: DE_LAREDO, otro_negocio_prueba: LAREDO, otro_negocio_como: 'nada', otro_negocio_nivel: null, otro_negocio_por: 'decision:CEREBRO-2026-11-19', otro_negocio_en: dias(0) }),
  ]
  return construirListaCorta(crearBaseFalsa(t).consulta, A, { ahora: AHORA })
}
const de = (l: ListaCorta, id: string): Ficha => {
  const f = l.lineas.find((x) => x.ref === `cerebro_fichas:${id}`)
  if (!f) throw new Error(`falta cerebro_fichas:${id}`)
  return f
}

describe('el lector de fichas entrega la marca entera (no oculta la ficha)', () => {
  it('Medellín: mercado, nivel global, con su motivo y su prueba', async () => {
    const l = await conMarcas()
    expect(de(l, 'mde-1').otro_negocio).toEqual({ motivo: MEDELLIN, prueba: HOTEL, como: 'mercado', nivel: 'global' })
  })
  it('Laredo: nada, sin nivel', async () => {
    expect(de(await conMarcas(), 'lar-1').otro_negocio).toEqual({ motivo: DE_LAREDO, prueba: LAREDO, como: 'nada', nivel: null })
  })
  it('una ficha sin marca no trae el campo', async () => {
    expect(de(await conMarcas(), 'fa-1')).not.toHaveProperty('otro_negocio')
  })
})

describe('la línea que ve el modelo dice «NO ES DE ESTE CLIENTE» con el motivo entero', () => {
  it('mercado: dice que sirve solo de referencia de mercado y nunca como competencia ni como dato del cliente', async () => {
    const t = lineaParaElModelo(7, de(await conMarcas(), 'mde-1'))
    expect(t).toContain(`NO ES DE ESTE CLIENTE: ${MEDELLIN}`)
    expect(t).toContain('sirve solo como referencia de mercado (nivel global); nunca como competencia ni como dato del cliente')
  })
  it('nada: solo la marca y el motivo', async () => {
    const t = lineaParaElModelo(8, de(await conMarcas(), 'lar-1'))
    expect(t).toContain(`NO ES DE ESTE CLIENTE: ${DE_LAREDO}`)
    expect(t).not.toContain('referencia de mercado')
  })
  it('sin marca, la línea no la menciona', async () => {
    expect(lineaParaElModelo(1, de(await conMarcas(), 'fa-1'))).not.toContain('NO ES DE ESTE CLIENTE')
  })
  it('el motivo no se recorta, aunque sea largo', () => {
    const largo = 'x'.repeat(900)
    expect(textoDeLaMarca({ motivo: largo, prueba: HOTEL, como: 'nada', nivel: null })).toBe(`NO ES DE ESTE CLIENTE: ${largo}`)
  })
})

describe('la entrega según la pieza lleva la marca en los datos de cada ficha', () => {
  it('con marca → `no_es_de_este_cliente`; sin marca → null', async () => {
    const l = await conMarcas()
    expect(datosDeLaFicha(de(l, 'mde-1')).no_es_de_este_cliente).toEqual({ motivo: MEDELLIN, prueba: HOTEL, como: 'mercado', nivel: 'global' })
    expect(datosDeLaFicha(de(l, 'fa-1')).no_es_de_este_cliente).toBeNull()
  })
})

describe('la migración 202611191600 y su reversa', () => {
  const mig = fs.readFileSync(new URL('../../../../supabase/migrations/202611191600_cerebro_fichas_otro_negocio.sql', import.meta.url), 'utf-8')
  const rev = fs.readFileSync(new URL('../../../../supabase/reversas/202611191600_cerebro_fichas_otro_negocio_REVERSA.sql', import.meta.url), 'utf-8')
  const COLS = ['otro_negocio_motivo', 'otro_negocio_prueba', 'otro_negocio_como', 'otro_negocio_nivel', 'otro_negocio_por', 'otro_negocio_en']
  it('es aditiva: agrega las 6 columnas (la fecha como timestamptz) y no borra ni cambia nada', () => {
    for (const c of COLS) expect(mig, c).toMatch(new RegExp(`add column if not exists ${c} (text|timestamptz)`))
    expect(mig).toMatch(/add column if not exists otro_negocio_en timestamptz/)
    // solo «drop constraint if exists» antes de volver a crearla: nada de borrar columnas, tablas ni filas
    expect(mig.replace(/--.*$/gm, '')).not.toMatch(/\b(drop column|drop table|delete|truncate|update)\b/i)
  })
  it('cómo solo admite mercado o nada; nivel solo global, país o mundo', () => {
    expect(mig).toMatch(/otro_negocio_como in \('mercado', ?'nada'\)/)
    expect(mig).toMatch(/otro_negocio_nivel in \('global', ?'pais', ?'mundo'\)/)
  })
  it('la marca va entera o no va: con motivo exige prueba, cómo, quién y cuándo; mercado exige nivel y nada no lo lleva', () => {
    expect(mig).toMatch(/cerebro_fichas_otro_negocio_entera/)
    for (const c of ['otro_negocio_prueba', 'otro_negocio_como', 'otro_negocio_por', 'otro_negocio_en']) expect(mig, c).toMatch(new RegExp(`${c} is not null`))
    expect(mig).toMatch(/\(otro_negocio_como = 'mercado'\) = \(otro_negocio_nivel is not null\)/)
  })
  it('índice parcial por cliente solo para lo marcado', () => {
    expect(mig).toMatch(/create index if not exists cerebro_fichas_otro_negocio\s+on (public\.)?cerebro_fichas \(client_id\) where otro_negocio_motivo is not null/)
  })
  it('la reversa quita el índice, las restricciones y las 6 columnas', () => {
    expect(rev).toMatch(/drop index if exists (public\.)?cerebro_fichas_otro_negocio\b/)
    expect(rev).toMatch(/drop constraint if exists cerebro_fichas_otro_negocio_entera/)
    for (const c of COLS) expect(rev, c).toMatch(new RegExp(`drop column if exists ${c}\\b`))
  })
})
