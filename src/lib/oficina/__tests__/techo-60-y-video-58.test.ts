/**
 * 202611170930 · techo técnico de la base 50 → 60 + el encargo de video encendido 45 → 58 (CC1 · RESPUESTA Lenovo «check-base-60» · certifica CC6).
 * La cuenta por el MOTOR REAL HASTA EL CIERRE (lección de CC6: no hasta el paso que uno mira), peor caso de CC6 con el video cobrando su tope (15):
 * mesa 3,6 · imágenes 1 · borrador 7,06 · finales 1 · revisar 0,1 · video 15 · mirar 0,2 · jefatura 1. Con 52 se corta antes de la entrega; 53 es el mínimo; 58 (DECISIÓN Lenovo) entrega.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { registrarPaso, siguientePaso } from '../motor'
import { TOPE_DEL_ENCARGO_DE_VIDEO_ENCENDIDO_USD, TOPE_DEL_PASO_VIDEO_USD, VIDEO_MESA_ENCENDIDA } from '../plantillas/video-mesa'
import { TOPE_MAXIMO_DEL_SOBRE_USD, validarSobre } from '../sobre'
import type { Estado, Plantilla } from '../tipos'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611170930_oficina_techo_60_y_video_58.sql')
const REV = leer('reversas', '202611170930_oficina_techo_60_y_video_58_REVERSA.sql')
const M0720 = leer('migrations', '202611170720_oficina_video_encendido_sprint2.sql')
const tomar = (sql: string, d: string) => { const a = `$${d}$`; const i = sql.indexOf(a); return JSON.parse(sql.slice(i + a.length, sql.indexOf(a, i + a.length))) }
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')

const PEOR: Record<string, number> = { mesa: 3.6, imagenes_clave: 1, borrador_video: 7.06, imagenes_clave_final: 1, revisar_imagenes_clave: 0.1, video: TOPE_DEL_PASO_VIDEO_USD, mirar_video: 0.2, jefatura: 1 }
function hastaElCierre(tope: number, rondas: number) {
  const pl: Plantilla = { ...VIDEO_MESA_ENCENDIDA, limites: { ...VIDEO_MESA_ENCENDIDA.limites, tope_encargo_usd: tope } }
  let e: Estado = { ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {}, fichas: [] }
  let quedan = rondas
  const hechos: string[] = []
  for (let k = 0; k < 80; k++) {
    const s = siguientePaso(e, pl)
    if (s.accion !== 'ejecutar') return { fin: s, hechos, gasto: Math.round(e.gasto_usd * 100) / 100 }
    const c = s.paso.clave
    e = registrarPaso(e, pl, s.indice, { costo_usd: PEOR[c] ?? 0, artefacto: c === 'aprobar_propuestas' ? { vuelve_a_la_mesa: quedan-- > 0 } : { hay_imagenes: true, ok: true }, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
    hechos.push(c)
  }
  throw new Error('no terminó')
}

describe('por el motor real, hasta el cierre', () => {
  it('🔴 con 58, 0 · 1 · 2 rondas llegan a la ENTREGA y al cierre (28,76 · 40,42 · 52,08)', () => {
    expect(TOPE_DEL_ENCARGO_DE_VIDEO_ENCENDIDO_USD).toBe(58)
    expect(VIDEO_MESA_ENCENDIDA.limites.tope_encargo_usd).toBe(58)
    for (const [r, g] of [[0, 28.76], [1, 40.42], [2, 52.08]] as const) {
      const x = hastaElCierre(VIDEO_MESA_ENCENDIDA.limites.tope_encargo_usd, r)
      expect(x.fin.accion, `rondas ${r}`).toBe('fin')
      expect(x.hechos.slice(-2)).toEqual(['entrega', 'cierre'])
      expect(x.gasto).toBe(g)
    }
  })
  it('🔴 con 52 (lo pedido antes) el video ya filmado se queda SIN entregar; 53 es el mínimo que entrega', () => {
    const c52 = hastaElCierre(52, 2)
    expect(c52.fin).toMatchObject({ accion: 'cierre_por_tope', razon: 'tope_de_gasto' })
    expect(c52.hechos).toContain('video')
    expect(c52.hechos).not.toContain('entrega')
    expect(hastaElCierre(53, 2).fin.accion).toBe('fin')
  })
  it('🔴 el techo de la base sube a 60: un sobre pide hasta 60 y el video (58) cabe', () => {
    expect(TOPE_MAXIMO_DEL_SOBRE_USD).toBe(60)
    const base = { parte_id: '11111111-1111-4111-8111-111111111111', brief_id: 'b1', dry_run: true }
    expect(validarSobre({ ...base, tope_usd: 58 }).ok).toBe(true)
    expect(validarSobre({ ...base, tope_usd: 60.01 }).ok).toBe(false)
    expect(TOPE_DEL_ENCARGO_DE_VIDEO_ENCENDIDO_USD).toBeLessThanOrEqual(TOPE_MAXIMO_DEL_SOBRE_USD)
  })
})

describe('202611170930 · la migración', () => {
  it('🔴 límites EXACTOS: antes = 0720; después = el código; solo cambia el tope (45 → 58)', () => {
    expect(tomar(MIG, 'lim_antes')).toEqual(tomar(M0720, 'lim'))
    expect(tomar(MIG, 'lim')).toEqual(json(VIDEO_MESA_ENCENDIDA.limites))
    const { tope_encargo_usd: a, ...ra } = tomar(MIG, 'lim_antes')
    const { tope_encargo_usd: d, ...rd } = tomar(MIG, 'lim')
    expect([a, d]).toEqual([45, 58])
    expect(rd).toEqual(ra)
    expect(sentencias(MIG)).toContain("UPDATE public.oficina_tipos_de_grupo SET tope_encargo_usd = 58, limites = $lim$")
  })
  it('🔴 las dos reglas de la base pasan a (0, 60] = el techo del sobre; guardas ANTES; comprobación después; un solo UPDATE; nada se enciende', () => {
    const s = sentencias(MIG)
    expect(s).toContain(`ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= ${TOPE_MAXIMO_DEL_SOBRE_USD});`)
    expect(s).toContain(`ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= ${TOPE_MAXIMO_DEL_SOBRE_USD});`)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    const alter = s.indexOf('ALTER TABLE')
    for (const g of ["IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN", 'IS DISTINCT FROM $lim_antes$', 'IS DISTINCT FROM 45::numeric THEN']) {
      expect(s.indexOf(g), g).toBeGreaterThan(0)
      expect(s.indexOf(g), g).toBeLessThan(alter)
    }
    const fin = s.slice(s.indexOf('UPDATE'))
    expect(fin).toContain("LIKE '%<= (60)%'")
    expect(fin).toContain('IS DISTINCT FROM 58::numeric')
    expect(s).not.toMatch(/\b(DELETE|TRUNCATE|INSERT)\b|familias_activas|pasos\s*=|activo\s*=/)
  })
  it('la reversa: el video vuelve a 45 (límites de 0720) ANTES de bajar las reglas a 50; la de encargos vuelve NOT VALID (la historia no se toca); se niega si otra plantilla pasa de 50', () => {
    const s = sentencias(REV)
    expect(tomar(REV, 'lim_antes')).toEqual(json(VIDEO_MESA_ENCENDIDA.limites))
    expect(tomar(REV, 'lim')).toEqual(tomar(M0720, 'lim'))
    expect(s.indexOf('SET tope_encargo_usd = 45')).toBeLessThan(s.indexOf('ALTER TABLE'))
    expect(s).toContain('CHECK (tope_usd > 0 AND tope_usd <= 50) NOT VALID;')
    expect(s).toContain('CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 50);')
    expect(s).toContain("WHERE familia <> 'video_mesa' AND tope_encargo_usd > 50) THEN")
  })
})
