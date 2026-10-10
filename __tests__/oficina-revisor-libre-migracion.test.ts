/**
 * OFICINA · REVISOR EXTERNO LIBRE · la FORMA de la migración que lleva las tres plantillas ya sembradas a su definición actual (y de su reversa). SIN APLICAR.
 * Debe ser SOLO una actualización de plantillas INACTIVAS, idéntica al código al terminar, repetible, sin encender nada; y la reversa deja la definición anterior.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARRUSEL_IG_V1 } from '../src/lib/oficina/plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../src/lib/oficina/plantillas/kit-historias'
import { POST_IMG } from '../src/lib/oficina/plantillas/post-img'
import { validarPlantilla } from '../src/lib/oficina/plantilla'
import type { Plantilla } from '../src/lib/oficina/tipos'

const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610100300_oficina_revisor_libre.sql'
const REVERSA = 'supabase/reversas/202610100300_oficina_revisor_libre_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sinComentarios = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/^\s*--.*$/, '')).join('\n')
const bloque = (s: string, etiqueta: string): unknown => { const m = new RegExp(`\\$${etiqueta}\\$([\\s\\S]*?)\\$${etiqueta}\\$`).exec(s); return m ? JSON.parse(m[1]) : undefined }
const updateDe = (s: string, tipo: string): string => { const i = s.indexOf("UPDATE public.oficina_tipos_de_grupo SET"); const todos = s.split('UPDATE public.oficina_tipos_de_grupo SET').slice(1); return todos.find((x) => x.includes(`WHERE tipo = '${tipo}'`)) ?? (i < 0 ? '' : '') }
const PLANTILLAS: Array<[string, Plantilla]> = [['post_img', POST_IMG], ['carrusel_ig_v1', CARRUSEL_IG_V1], ['kit_historias', KIT_HISTORIAS]]

describe('la migración del revisor libre', () => {
  const s = sinComentarios(MIGRACION)
  it('existe y la reversa NO está en supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true); expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)REVERSA(_|\.)/i.test(f))).toEqual([])
  })
  it('solo ACTUALIZA las tres plantillas y solo si están INACTIVAS; no crea, no borra, no enciende', () => {
    for (const prohibido of [/\bCREATE\b/i, /\bALTER\b/i, /\bDROP\b/i, /\bTRUNCATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bGRANT\b/i, /oficina_config/]) expect(s, String(prohibido)).not.toMatch(prohibido)
    const ups = [...s.matchAll(/UPDATE public\.([a-z_]+) SET[\s\S]*?WHERE tipo = '([a-z_0-9]+)' AND activo = false;/g)].map((m) => `${m[1]}:${m[2]}`)
    expect(ups).toEqual(['oficina_tipos_de_grupo:post_img', 'oficina_tipos_de_grupo:carrusel_ig_v1', 'oficina_tipos_de_grupo:kit_historias'])
    expect(s).toMatch(/^\s*BEGIN;/m); expect(s).toMatch(/COMMIT;/)
    expect((s.match(/UPDATE /g) ?? []).length).toBe(3)
  })
  it('al terminar, cada plantilla es IDÉNTICA a la del código (pasos, indicaciones y límites) y válida', () => {
    for (const [tipo, p] of PLANTILLAS) {
      const u = updateDe(s, tipo)
      expect(bloque(u, 'pasos')).toEqual(JSON.parse(JSON.stringify(p.pasos)))
      expect(bloque(u, 'ind')).toEqual(JSON.parse(JSON.stringify(p.indicaciones)))
      expect(bloque(u, 'lim')).toEqual(JSON.parse(JSON.stringify(p.limites)))
      expect(validarPlantilla({ ...p, pasos: bloque(u, 'pasos') as never })).toEqual([])
    }
  })
  it('el revisor externo queda SIN formato ni rúbrica en las tres, y la opinión llega a cada dueño: decide_imagen en las tres, decide_estructura en el kit y UNA sola llamada del diseñador en el carrusel', () => {
    for (const [tipo] of PLANTILLAS) {
      const pasos = bloque(updateDe(s, tipo), 'pasos') as Array<{ clave: string; quien: string; condicion: { tipo: string }; salida?: { esquema: string; reintento_formato: number } }>
      const claves = pasos.map((x) => x.clave)
      expect(pasos.find((x) => x.clave === 'revisor_externo')!.salida).toEqual({ esquema: 'opinion_libre.v1', reintento_formato: 0 })
      expect(claves).toContain('decide_imagen')
      expect(pasos.find((x) => x.clave === 'decide_imagen')).toMatchObject({ quien: 'marketing_instagram_curator', salida: { esquema: 'resolucion_solo.v1' } })
      expect(claves).not.toContain('decide_laminas') // el diseñador atiende la opinión en «ajusta_laminas_2» (condición «cualquiera»): una sola llamada
      expect(claves.includes('decide_estructura'), tipo).toBe(tipo === 'kit_historias')
      if (tipo === 'carrusel_ig_v1') expect(pasos.find((x) => x.clave === 'ajusta_laminas_2')!.condicion.tipo).toBe('cualquiera')
    }
  })
  it('agnóstica: ningún dato nombra a un cliente, una ciudad o un producto', () => {
    const todo = leer(MIGRACION).toLowerCase()
    for (const x of ['naufrago', 'náufrago', 'guayaquil', 'ceviche', 'ecuador', 'rukut', 'perez', 'pérez']) expect(todo).not.toContain(x)
  })
})

describe('la reversa', () => {
  const r = sinComentarios(REVERSA)
  it('devuelve las tres plantillas INACTIVAS a la definición anterior: revisor con fichas en formato cerrado', () => {
    expect((r.match(/UPDATE /g) ?? []).length).toBe(3)
    for (const [tipo] of PLANTILLAS) {
      const u = updateDe(r, tipo)
      const pasos = bloque(u, 'pasos') as Array<{ clave: string; salida?: { esquema: string } }>
      expect(pasos.find((x) => x.clave === 'revisor_externo')!.salida!.esquema).toBe('fichas.v1')
      expect(u).toMatch(/AND activo = false;/)
    }
    expect(bloque(updateDe(r, 'carrusel_ig_v1'), 'pasos') as Array<{ clave: string }>).toSatisfy((p: Array<{ clave: string }>) => p.some((x) => x.clave === 'decide_laminas'))
    expect(bloque(updateDe(r, 'kit_historias'), 'pasos') as Array<{ clave: string }>).toSatisfy((p: Array<{ clave: string }>) => p.some((x) => x.clave === 'decide_estructura'))
    for (const prohibido of [/\bDROP\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i, /\bINSERT\b/i]) expect(r).not.toMatch(prohibido)
  })
})
