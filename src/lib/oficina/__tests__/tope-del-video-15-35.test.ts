/**
 * 202611111930 · TOPE DEL VIDEO US$ 15 · ENCARGO DE VIDEO US$ 35 · LO ESPERADO POR VIDEO US$ 12 · CC3 · GO Lenovo 11-nov 18:56 + 19:44 Zúrich · certifica CC6 (mide antes y después).
 * Regla premium: la SEGUNDA filmación (la vuelta de la mirada, #1050) tiene que caber en el encargo. Es DATO: aquí se prueba que la migración escribe EXACTAMENTE lo del código,
 * que no pisa (exige el dato entero de antes), que la reversa lo devuelve, y que con estos números la vuelta cabe y el freno de la campaña reserva 12 por video.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cabeLaVuelta, costoDeVolver } from '../orquestador-video'
import { RESERVA_POR_VIDEO_USD, TOPE_DE_VIDEO_MESA_USD, TOPE_DEL_PASO_VIDEO_USD, VIDEO_MESA } from '../plantillas/video-mesa'
import { reservasDesdeLaHistoria } from '../gasto-de-encargos'
import { TOPE_MAXIMO_DEL_SOBRE_USD, validarSobre } from '../sobre'
import { PASO_MIRAR_VIDEO } from '../video/mirada'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const MIG = leer('migrations', '202611111930_oficina_video_tope_15_35.sql')
const REV = leer('reversas', '202611111930_oficina_video_tope_15_35_REVERSA.sql')
const M1730 = leer('migrations', '202611111730_oficina_un_agente_mira_el_video.sql')
const SIEMBRA = leer('migrations', '202610312012_oficina_mesa_de_video.sql')
const tomar = (sql: string, d: string) => JSON.parse(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`).exec(sql)![1])
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
/** los límites de video_mesa tal como los sembró 202610312012 (nadie los cambió hasta esta migración) */
const LIM_SEMBRADOS = (() => { const resto = SIEMBRA.slice(SIEMBRA.indexOf("'video_mesa', 'video_mesa'")); return tomar(resto, 'lim') })()
const PASOS_1730 = tomar(M1730, 'pasos')

describe('la plantilla de código: video 15, encargo 35, lo esperado 12', () => {
  it('🔴 los cuatro sitios del tope dicen lo mismo y la vuelta del video CABE', () => {
    expect(TOPE_DEL_PASO_VIDEO_USD).toBe(15); expect(TOPE_DE_VIDEO_MESA_USD).toBe(35); expect(RESERVA_POR_VIDEO_USD).toBe(12)
    expect(VIDEO_MESA.pasos.find((p) => p.clave === 'video')!.tope_usd).toBe(15)
    expect(VIDEO_MESA.limites).toMatchObject({ tope_encargo_usd: 35, reserva_por_pieza_usd: 12, video: { tope_por_video_usd: 15 } })
    // mesa (≈ 3) + primer video (15) + mirada (0,5) = 18,5 gastado: volver (pedido + video + cuadros + mirada + un turno de la mesa = 16,10) cabe en 35
    const mirar = VIDEO_MESA.pasos.find((p) => p.clave === PASO_MIRAR_VIDEO)!
    const volver = costoDeVolver(VIDEO_MESA, mirar)
    expect(volver).toBeCloseTo(16.1, 6)
    const e = (gasto: number) => ({ gasto_usd: gasto }) as unknown as Parameters<typeof cabeLaVuelta>[1]
    expect(cabeLaVuelta(VIDEO_MESA, e(18.5), volver)).toBe(true)
    expect(cabeLaVuelta(VIDEO_MESA, e(18.91), volver)).toBe(false)
  })
  it('🔴 sin historia, el freno de la campaña espera 12 por video (no el tope de 35)', () => {
    const fila = { familia: 'video_mesa', tope_encargo_usd: 35, limites: tomar(MIG, 'lim') }
    expect(reservasDesdeLaHistoria([fila], [])).toEqual({ video_mesa: 12 })
  })
  it('🔴 un sobre puede pedir hasta el techo de la base (50), no más; se abre con el menor entre lo pedido y el tope de la familia', () => {
    expect(TOPE_MAXIMO_DEL_SOBRE_USD).toBe(50)
    expect(MIG).toContain(`CHECK (tope_usd > 0 AND tope_usd <= ${TOPE_MAXIMO_DEL_SOBRE_USD})`)
    expect(MIG).toContain(`CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= ${TOPE_MAXIMO_DEL_SOBRE_USD})`)
    const base = { parte_id: '11111111-1111-4111-8111-111111111111', brief_id: 'b1', dry_run: true }
    expect(validarSobre({ ...base, tope_usd: 35 }).ok).toBe(true)
    expect(validarSobre({ ...base, tope_usd: 50.01 }).ok).toBe(false)
  })
})

describe('la migración 202611111930', () => {
  it('🔴 escribe EXACTAMENTE el dato del código (pasos, límites, tope) y el brazo a 15', () => {
    expect(tomar(MIG, 'pasos')).toEqual(json(VIDEO_MESA.pasos))
    expect(tomar(MIG, 'lim')).toEqual(json(VIDEO_MESA.limites))
    expect(sentencias(MIG)).toContain(`tope_encargo_usd = ${TOPE_DE_VIDEO_MESA_USD} WHERE familia = 'video_mesa';`)
    expect(tomar(MIG, 'brazo')).toEqual({ tope_por_video_usd: TOPE_DEL_PASO_VIDEO_USD })
  })
  it('🔴 no pisa: exige el dato ENTERO de antes (los pasos de 202611111730, los límites sembrados, el tope 10 y el brazo en 10)', () => {
    expect(tomar(MIG, 'antes')).toEqual(PASOS_1730)
    expect(tomar(MIG, 'lim_antes')).toEqual(LIM_SEMBRADOS)
    expect(sentencias(MIG)).toContain("IS DISTINCT FROM 10::numeric THEN")
    expect(tomar(MIG, 'brazo_antes')).toEqual({ tope_por_video_usd: 10 })
    // fuera del tope del paso video, los pasos son los de 202611111730
    expect(tomar(MIG, 'pasos').map((p: Record<string, unknown>) => (p.clave === 'video' ? { ...p, tope_usd: 5 } : p))).toEqual(PASOS_1730)
  })
  it('🔴 la reversa devuelve todo lo de antes y exige lo que dejó la migración', () => {
    expect(tomar(REV, 'pasos')).toEqual(tomar(MIG, 'antes')); expect(tomar(REV, 'antes')).toEqual(tomar(MIG, 'pasos'))
    expect(tomar(REV, 'lim')).toEqual(tomar(MIG, 'lim_antes')); expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
    expect(tomar(REV, 'brazo')).toEqual(tomar(MIG, 'brazo_antes')); expect(tomar(REV, 'brazo_antes')).toEqual(tomar(MIG, 'brazo'))
    expect(sentencias(REV)).toContain("tope_encargo_usd = 10 WHERE familia = 'video_mesa';")
    expect(REV).toContain('CHECK (tope_usd > 0 AND tope_usd <= 20) NOT VALID')
    expect(REV).toContain('CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 20);')
  })
  it('🔴 (CC6) cada guarda es COMPLETA y va ANTES de tocar nada; la comprobación final va DESPUÉS', () => {
    for (const [sql, extra] of [[MIG, 0], [REV, 1]] as const) {
      const s = sentencias(sql)
      const primerCambio = Math.min(s.indexOf('ALTER TABLE'), s.indexOf('UPDATE public.'))
      const guardas = [
        "IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN",
        '$antes$::jsonb THEN', '$lim_antes$::jsonb THEN', '$brazo_antes$::jsonb THEN',
      ]
      for (const g of guardas) {
        expect(s.split(g).length - 1, g).toBe(1)
        expect(s.indexOf(g), g).toBeLessThan(primerCambio)
        expect(s.slice(s.indexOf(g) + g.length).trimStart().startsWith('RAISE EXCEPTION '), g).toBe(true)
      }
      // cada condición ENTERA, sin nada pegado delante ni detrás (un «false AND …» la apagaría)
      const tope = sql === MIG ? 10 : 35
      const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const completas = [
        ...(['pasos|antes', 'limites|lim_antes'].map((x) => x.split('|')).map(([col, d]) => new RegExp(`\\n  IF \\(SELECT ${col} FROM public\\.oficina_tipos_de_grupo WHERE familia = 'video_mesa'\\) IS DISTINCT FROM \\$${d}\\$[^$]*\\$${d}\\$::jsonb THEN\\s+RAISE EXCEPTION '`))),
        new RegExp(`\\n  IF \\(SELECT valor FROM public\\.cadena_config WHERE clave = 'brazo_de_video'\\) IS DISTINCT FROM \\$brazo_antes\\$[^$]*\\$brazo_antes\\$::jsonb THEN\\s+RAISE EXCEPTION '`),
        new RegExp(`\\n  ${esc(`IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM ${tope}::numeric THEN`)}\\s+RAISE EXCEPTION '`),
        new RegExp(`\\n  ${esc("IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN")}\\s+RAISE EXCEPTION '`),
        ...(extra ? [new RegExp(`\\n  ${esc("IF EXISTS (SELECT 1 FROM public.oficina_tipos_de_grupo WHERE familia <> 'video_mesa' AND tope_encargo_usd > 20) THEN")}\\s+RAISE EXCEPTION '`)] : []),
      ]
      for (const re of completas) expect(s.match(new RegExp(re.source, 'g')), re.source.slice(0, 80)).toHaveLength(1)
      // 5 guardas antes (+1 en la reversa: otra plantilla ya pasa de 20) y 1 comprobación después
      expect(s.match(/^\s*IF /gm)).toHaveLength(6 + extra)
      expect(s.lastIndexOf('RAISE EXCEPTION')).toBeGreaterThan(s.lastIndexOf('UPDATE public.'))
    }
  })
  it('🔴 (CC6) la comprobación FINAL es ENTERA: cada condición con su valor, unidas por OR, y termina levantando excepción', () => {
    const finalDe = (sql: string) => { const s = sentencias(sql); return s.slice(s.lastIndexOf('DO $$')).trim() }
    const esperado = (nombre: string, video: number, encargo: number, brazo: number) => [
      'DO $$',
      'BEGIN',
      `  IF (SELECT (p->>'tope_usd')::numeric FROM public.oficina_tipos_de_grupo t, jsonb_array_elements(t.pasos) AS p WHERE t.familia = 'video_mesa' AND p->>'clave' = 'video') IS DISTINCT FROM ${video}::numeric`,
      `     OR (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM ${encargo}::numeric`,
      `     OR (SELECT (valor->>'tope_por_video_usd')::numeric FROM public.cadena_config WHERE clave = 'brazo_de_video') IS DISTINCT FROM ${brazo}::numeric THEN`,
      `    RAISE EXCEPTION '${nombre}: video_mesa no quedó con los topes esperados';`,
      '  END IF;',
      'END $$;',
      '',
      'COMMIT;',
    ].join('\n')
    expect(finalDe(MIG).replace(/\r\n/g, '\n')).toBe(esperado('202611111930', TOPE_DEL_PASO_VIDEO_USD, TOPE_DE_VIDEO_MESA_USD, TOPE_DEL_PASO_VIDEO_USD))
    expect(finalDe(REV).replace(/\r\n/g, '\n')).toBe(esperado('202611111930 REVERSA', 5, 10, 10))
  })
  it('🔴 el ORDEN: la migración abre las reglas ANTES de escribir 35; la reversa vuelve el dato ANTES de cerrar las reglas a 20', () => {
    const m = sentencias(MIG), r = sentencias(REV)
    expect(m.indexOf('ADD CONSTRAINT oficina_tipos_tope_valido')).toBeLessThan(m.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(m.indexOf('ADD CONSTRAINT oficina_encargos_tope_valido')).toBeLessThan(m.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(r.indexOf('UPDATE public.oficina_tipos_de_grupo')).toBeLessThan(r.indexOf('ADD CONSTRAINT oficina_tipos_tope_valido'))
  })
  it('🔴 solo toca video_mesa, el brazo y las dos reglas: nada se borra ni se inserta', () => {
    for (const sql of [MIG, REV]) {
      const s = sentencias(sql)
      expect(s).not.toMatch(/\b(DELETE|TRUNCATE|INSERT)\b|DROP TABLE|DROP COLUMN/i)
      expect(s.match(/UPDATE public\.\w+ SET/g)).toEqual(['UPDATE public.oficina_tipos_de_grupo SET', 'UPDATE public.cadena_config SET'])
      expect(s).toContain("WHERE familia = 'video_mesa';"); expect(s).toContain("WHERE clave = 'brazo_de_video';")
      expect(s.match(/DROP CONSTRAINT IF EXISTS (\w+)/g)).toEqual(['DROP CONSTRAINT IF EXISTS oficina_encargos_tope_valido', 'DROP CONSTRAINT IF EXISTS oficina_tipos_tope_valido'])
      expect(s.trim().startsWith('BEGIN;')).toBe(true); expect(s.trim().endsWith('COMMIT;')).toBe(true)
    }
  })
})
