/**
 * 11-nov · GO Lenovo 03:55Z · regla #17 del barrido · la proporción del cuadro sale de UNA columna (`cadena_formatos_por_red.proporcion`).
 * La hoja y el brazo de video usan el MISMO respaldo (`cadena/proporciones.ts`); el brazo ya no tiene el suyo (video = 16:9). US$ 0, sin base ni red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROPORCION_POR_FORMATO, proporcionDeLaTabla } from '../proporciones'
import { RELACION_POR_FORMATO } from '@/lib/video/parametros'
import { pedidosParaCotizar } from '@/lib/oficina/video/pedido'
import type { FormatosPorRed } from '../tipos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611111400_cadena_formatos_proporcion.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', '202611111400_cadena_formatos_proporcion_REVERSA.sql'), 'utf8')
const SRC = path.join(__dirname, '..', '..', '..')
const leer = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8')

const fila = (red: string, formato: string, proporcion?: string | null) => ({ [red]: [{ formato, produccion: 'opera' as const, lead_dias: 3, max_por_dia: 2, familia: null, proporcion }] }) as FormatosPorRed

describe('regla #17 · la proporción es un dato de la tabla de formatos', () => {
  it('🔴 el dato de la tabla gana; sin dato o ilegible, la de por omisión del formato (y 1:1 si el formato no está)', () => {
    expect(proporcionDeLaTabla(fila('youtube', 'video', '16:9'), 'youtube', 'video')).toEqual({ proporcion: '16:9', por_omision: false })
    expect(proporcionDeLaTabla(fila('YouTube', 'Video', ' 16:9 '), 'YouTube', 'video')).toEqual({ proporcion: '16:9', por_omision: false })
    expect(proporcionDeLaTabla(fila('tiktok', 'video', null), 'tiktok', 'video')).toEqual({ proporcion: '9:16', por_omision: true })
    expect(proporcionDeLaTabla(fila('tiktok', 'video', 'vertical'), 'tiktok', 'video')).toEqual({ proporcion: '9:16', por_omision: true, ilegible: 'vertical' })
    expect(proporcionDeLaTabla({}, 'linkedin', 'texto')).toEqual({ proporcion: '1:1', por_omision: true })
    // el mismo formato en dos redes puede tener cuadros distintos: por eso es por (red, formato)
    const dos: FormatosPorRed = { ...fila('tiktok', 'video', '9:16'), ...fila('youtube', 'video', '16:9') }
    expect([proporcionDeLaTabla(dos, 'tiktok', 'video').proporcion, proporcionDeLaTabla(dos, 'youtube', 'video').proporcion]).toEqual(['9:16', '16:9'])
  })
  it('🔴 el brazo usa el MISMO respaldo que la hoja (se acabó su video = 16:9)', () => {
    for (const [f, r] of Object.entries(RELACION_POR_FORMATO)) expect(r, f).toBe(PROPORCION_POR_FORMATO[f])
    expect(RELACION_POR_FORMATO.video).toBe('9:16')
    expect(leer('lib/video/parametros.ts')).not.toMatch(/video: '16:9'/)
  })
  it('🔴 la oficina toma la proporción del brief (lo que escribió la hoja) y la manda en el pedido', () => {
    const ov = leer('lib/oficina/orquestador-video.ts')
    expect(ov).toMatch(/const leida = proporcionDelBrief\(brief, porOmision\)/)
    expect(ov).toMatch(/const proporcion = RELACIONES_PERMITIDAS\.has\(leida\) \? leida : porOmision/)
    expect(ov).toMatch(/armarPedidoDeLaOficina\(\{[^}]*relacion: b\.proporcion/)
    // la cotización previa usa la MISMA proporción (el costo depende del cuadro)
    expect(ov).toMatch(/await cotizarPrimero\(P, enc, pl, brief, fu\.fotos, proporcion\)/)
    expect(ov).toMatch(/pedidosParaCotizar\(\{[^}]*\brelacion,/)
    for (const relacion of ['1:1', '9:16']) {
      const r = pedidosParaCotizar({ brief: { formato: 'reel', red: 'instagram' }, fotos: [], clave: 'enc:brief', relacion })
      expect(r.ok && r.pedidos.map((p) => p.pedido.relacion)).toEqual([relacion])
    }
  })
  it('🔴 regla #18 · el brazo y el Estudio leen la clave por UNA sola función (`leerConfigDelBrazo`) y nadie más la nombra', () => {
    expect(leer('app/api/video/generate/route.ts')).toMatch(/const cfg = await leerConfigDelBrazo\(/)
    expect(leer('lib/estudio/servicio.ts')).toMatch(/await leerConfigDelBrazo\(d\.leerConfig\)/)
    const quienes = ['app/api/video/generate/route.ts', 'lib/estudio/servicio.ts', 'lib/estudio/deps.ts', 'lib/oficina/orquestador-video.ts', 'lib/oficina/adaptadores.ts'].filter((p) => /brazo_de_video|DESCUENTO_VIGENTE|TOPE_POR_VIDEO_USD/.test(leer(p).split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n')))
    expect(quienes).toEqual([])
  })
  it('🔴 el almacén lleva la columna a los formatos (sin eso la hoja nunca ve el dato)', () => {
    expect(leer('lib/cadena/almacen-supabase.ts')).toMatch(/familia: f\.familia \?\? null, proporcion: f\.proporcion \?\? null \}/)
  })
  it('la migración: columna nullable + CHECK, valores iguales a los de hoy salvo youtube·video = 16:9, idempotente; la reversa solo quita la columna', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS proporcion text;/)
    expect(SQL).toMatch(/CHECK \(proporcion IS NULL OR proporcion IN \(/)
    expect(SQL).toMatch(/SET proporcion = '16:9'\s+WHERE proporcion IS NULL AND red = 'youtube' AND formato = 'video'/)
    // los valores sembrados son EXACTAMENTE el respaldo de código (sin cambio de conducta)
    const valores = Object.fromEntries([...SQL.matchAll(/\('([a-z]+)','(\d+:\d+)'\)/g)].map((m) => [m[1], m[2]]))
    expect(valores).toEqual(PROPORCION_POR_FORMATO)
    expect(SQL).not.toMatch(/\bDROP\b|\bDELETE\b|\bTRUNCATE\b/i)
    expect(REVERSA).toMatch(/drop column if exists proporcion/)
    expect(REVERSA.split('\n').filter((l) => !l.startsWith('--')).join('\n')).not.toMatch(/drop table|delete from/i)
  })
})
