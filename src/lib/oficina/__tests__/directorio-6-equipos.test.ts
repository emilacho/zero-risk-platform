/**
 * 01-nov (después de T9) · LOS 6 EQUIPOS DEL DEPARTAMENTO EN EL DIRECTORIO (SEÑAL T9 → CC1 · MAPA «ESTRUCTURA FINAL: 6 EQUIPOS», firma 01-nov 00:11Z) · US$ 0, sin base ni red.
 * Se lee la MIGRACIÓN REAL `202611011400` y se comprueba:
 *   · los 6 equipos, con las claves que ya usa el tablero, 3 activos y 3 en segunda etapa (los tres con su bloqueo dicho);
 *   · a qué equipo va cada una de las 14 tarjetas de hoy: el brief a Estrategia, las 12 de la gran idea y las piezas a Creativo, el portero sin equipo (proveedor del cerebro);
 *   · la migración NO toca `rol`, `pertinente_en` ni `indicacion` (el equipo es agrupación, no asiento) y solo llena lo vacío;
 *   · la reversa se niega con encargos abiertos y deja el directorio sin la columna;
 *   · el adaptador pasa el equipo solo cuando la fila trae la columna, y `porEquipo` agrupa sin inventar.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { aTarjeta } from '../mesa/adaptador'
import { porEquipo } from '../mesa/directorio'
import { CLAVES_DE_EQUIPO, esClaveDeEquipo, type Tarjeta } from '../mesa/tipos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const NOMBRE = '202611011400_oficina_equipos_6_equipos_en_directorio'
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', `${NOMBRE}.sql`), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', `${NOMBRE}_REVERSA.sql`), 'utf8')

/** las 14 tarjetas del directorio tras T9 (lectura de producción 01-nov 00:44Z) */
const HOY = {
  direccion: ['campaign-brief-agent', 'creative-director-mesa'],
  miembro: ['carousel-designer', 'content-creator', 'design-image-prompt-engineer', 'design-visual-storyteller', 'inclusive-visuals-specialist', 'marketing_instagram_curator', 'marketing_short_video_editing_coach', 'marketing_video_optimization_specialist', 'tiktok-strategist', 'video-editor', 'whimsy-injector'],
  portero: ['portero'],
}
const TODAS = [...HOY.direccion, ...HOY.miembro, ...HOY.portero]

/** los equipos del INSERT: (clave, nombre, …, etapa, bloqueo, orden) */
function equiposDeLaMigracion(): Array<{ clave: string; nombre: string; etapa: string; bloqueo: string | null; orden: number }> {
  const cuerpo = SQL.slice(SQL.indexOf('INSERT INTO public.oficina_equipos'), SQL.indexOf('ON CONFLICT (clave) DO NOTHING'))
  return [...cuerpo.matchAll(/\('(\w+)',\s*'([^']+)',\s*'[^']*',\s*'[^']*',\s*'(\w+)',\s*(NULL|'[^']*'),\s*(\d+)\)/g)].map((m) => ({
    clave: m[1], nombre: m[2], etapa: m[3], bloqueo: m[4] === 'NULL' ? null : m[4].slice(1, -1), orden: Number(m[5]),
  }))
}
/** a qué equipo manda la migración cada agente (los UPDATE … SET equipo = '…' … WHERE agente …) */
function repartoDeLaMigracion(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of SQL.matchAll(/SET equipo = '(\w+)'[\s\S]*?WHERE agente (?:= '([\w-]+)'|IN \(([\s\S]*?)\))/g)) {
    const agentes = m[2] ? [m[2]] : [...m[3].matchAll(/'([\w-]+)'/g)].map((x) => x[1])
    for (const a of agentes) out[a] = m[1]
  }
  return out
}

describe('6 equipos · la tabla de equipos (dato, no código)', () => {
  const equipos = equiposDeLaMigracion()
  it('son exactamente los 6 del MAPA, con las claves del tablero y en el orden de la firma', () => {
    expect(equipos.map((e) => e.clave)).toEqual([...CLAVES_DE_EQUIPO])
    expect(equipos.map((e) => e.nombre)).toEqual(['Dirección', 'Estrategia', 'Creativo', 'Web y búsqueda', 'Medios y Performance', 'Relaciones'])
    expect(equipos.map((e) => e.orden)).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('3 activos sin bloqueo · 3 en segunda etapa, cada uno con su bloqueo dicho (Medios espera las métricas de Meta)', () => {
    expect(equipos.filter((e) => e.etapa === 'activo').map((e) => e.clave)).toEqual(['direccion', 'estrategia', 'creativo'])
    expect(equipos.filter((e) => e.etapa === 'activo').every((e) => e.bloqueo === null)).toBe(true)
    const segunda = equipos.filter((e) => e.etapa === 'segunda_etapa')
    expect(segunda.map((e) => e.clave)).toEqual(['web', 'medios', 'relaciones'])
    expect(segunda.every((e) => typeof e.bloqueo === 'string' && e.bloqueo.length > 0)).toBe(true)
    expect(segunda.find((e) => e.clave === 'medios')?.bloqueo).toMatch(/métricas de Meta/)
  })
  it('la tabla queda con permisos y seguridad por fila (CREATE TABLE no alcanza) y la columna del directorio apunta a ella', () => {
    expect(SQL).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(SQL).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.oficina_equipos TO service_role/)
    expect(SQL).toMatch(/CREATE POLICY oficina_equipos_service/)
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS equipo text REFERENCES public\.oficina_equipos\(clave\)/)
    expect(SQL).toMatch(/CHECK \(clave IN \('direccion', 'estrategia', 'creativo', 'web', 'medios', 'relaciones'\)\)/)
  })
})

describe('6 equipos · a qué equipo va cada tarjeta de hoy', () => {
  const reparto = repartoDeLaMigracion()
  it('el brief a Estrategia · las 12 de la gran idea y las piezas a Creativo · el portero sin equipo (es del cerebro)', () => {
    expect(reparto['campaign-brief-agent']).toBe('estrategia')
    const creativo = TODAS.filter((a) => a !== 'campaign-brief-agent' && a !== 'portero')
    expect(creativo).toHaveLength(12)
    for (const a of creativo) expect(reparto[a], a).toBe('creativo')
    expect(reparto['portero']).toBeUndefined()
    expect(Object.keys(reparto).sort()).toEqual(TODAS.filter((a) => a !== 'portero').sort())
  })
  it('las guardas exigen 6 equipos, 1 sola tarjeta sin equipo (el portero), 1 en estrategia y 12 en creativo', () => {
    expect(SQL).toMatch(/IF e <> 6 THEN RAISE EXCEPTION/)
    expect(SQL).toMatch(/WHERE equipo IS NULL AND rol <> 'portero'/)
    expect(SQL).toMatch(/IF sin_equipo <> 1 THEN RAISE EXCEPTION/)
    expect(SQL).toMatch(/IF estr <> 1 OR crea <> 12 THEN RAISE EXCEPTION/)
  })
  it('es agrupación, no asiento: no toca rol, pertinente_en ni indicacion, y solo llena lo vacío (idempotente)', () => {
    // E15 (menor de CC3): la asignación prohibida puede venir pegada al SET o detrás de una coma (`SET equipo = 'creativo', rol = 'miembro'`): se mira en TODO el cuerpo de cada UPDATE
    for (const m of SQL.matchAll(/UPDATE public\.oficina_directorio[\s\S]*?;/g)) expect(m[0]).not.toMatch(/\b(rol|pertinente_en|indicacion|activo|especialidad|sabe_hacer|necesita|entrega)\s*=/)
    expect(SQL).not.toMatch(/INSERT INTO public\.oficina_directorio/)
    expect(SQL).not.toMatch(/DELETE FROM public\.oficina_directorio/)
    for (const m of SQL.matchAll(/UPDATE public\.oficina_directorio[\s\S]*?;/g)) expect(m[0]).toMatch(/AND equipo IS NULL/)
    expect(SQL).toMatch(/CREATE TABLE IF NOT EXISTS/)
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS/)
  })
  it('la reversa se niega con encargos abiertos y deja el directorio sin la columna y sin la tabla', () => {
    expect(REVERSA).toMatch(/estado IN \('abierto', 'en_paso'\)[\s\S]*RAISE EXCEPTION/)
    expect(REVERSA).toMatch(/DROP COLUMN IF EXISTS equipo/)
    expect(REVERSA).toMatch(/DROP TABLE IF EXISTS public\.oficina_equipos/)
    expect(REVERSA).not.toMatch(/DELETE FROM public\.oficina_directorio/)
  })
})

describe('6 equipos · el adaptador y la agrupación', () => {
  const base = { rol: 'miembro', especialidad: 'x', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel'], activo: true, version: 1 }
  it('una fila con la columna trae su equipo; NULL (el portero) o un valor desconocido es «sin equipo»; una fila sin la columna no inventa el campo', () => {
    expect(aTarjeta({ ...base, agente: 'a', equipo: 'creativo' }).equipo).toBe('creativo')
    expect(aTarjeta({ ...base, agente: 'portero', rol: 'portero', equipo: null }).equipo).toBeNull()
    expect(aTarjeta({ ...base, agente: 'b', equipo: 'mesa de piezas' }).equipo).toBeNull()
    expect('equipo' in aTarjeta({ ...base, agente: 'c' })).toBe(false)
    expect(esClaveDeEquipo('web')).toBe(true)
    expect(esClaveDeEquipo('piezas')).toBe(false)
  })
  it('porEquipo agrupa las tarjetas por equipo y pone bajo null las que no tienen (o no traen la columna), sin cambiar nada más', () => {
    const t = (agente: string, equipo?: Tarjeta['equipo']): Tarjeta => ({ ...base, agente, rol: 'miembro', ...(equipo === undefined ? {} : { equipo }) })
    const g = porEquipo([t('a', 'creativo'), t('b', 'estrategia'), t('portero', null), t('c', 'creativo'), t('vieja')])
    expect([...g.keys()]).toEqual(['creativo', 'estrategia', null])
    expect(g.get('creativo')?.map((x) => x.agente)).toEqual(['a', 'c'])
    expect(g.get('estrategia')?.map((x) => x.agente)).toEqual(['b'])
    expect(g.get(null)?.map((x) => x.agente)).toEqual(['portero', 'vieja'])
    expect(porEquipo([]).size).toBe(0)
  })
})
