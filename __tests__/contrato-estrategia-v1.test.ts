/**
 * PRUEBA DE CONTRATO `estrategia.v1` CON DATOS REALES · 31-oct · T1 «lo afectado por la auditoría» (plan v3 firmado por CC#3) · CC#1 · certifica CC#3.
 *
 * Las dos puntas del contrato, con lo que de verdad pasó por el sistema:
 *   · el PEDIDO: `tareaDeEstrategia` con el plan REAL del redactor (corrida real 12-oct · `fixtures/ronda78/plan-v2-811b9e94.md`, ~35 k caracteres);
 *   · la RESPUESTA: la estrategia REAL que `social-media-strategist` (claude-opus-5-5) devolvió el 30-oct 23:40Z para la campaña de Náufrago
 *     (`cadena_estrategias` id 12 · versión 1 · estado `validada` · US$ 0,2499 · leída de la base solo para esta prueba · `fixtures/estrategia-real-naufrago-2026-10-30.json`).
 * Honestidad: esa respuesta se produjo contra el plan que el flujo guardó ESE día (los parámetros del plan en JSON), no contra la prosa del 12-oct:
 * por eso sus `cita_plan` se miden aquí contra lo que el modelo tuvo delante, no contra el plan de prosa. Lo que SÍ cruza las dos puntas es el consumidor:
 * `insumosDesdeEstrategia` (fases con semanas + redes con huecos) y el validador de forma del plan.
 */
import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ESQUEMA_ESTRATEGIA, ESQUEMAS } from '@/lib/cadena/esquemas'
import { tareaDeEstrategia } from '@/lib/cadena/indicaciones'
import { problemasDeEsquema, validarEstrategia } from '@/lib/cadena/validador-estrategia'
import { insumosDesdeEstrategia, semanasDeFase } from '@/lib/cadena/conceptos'
import type { ContextoDelCliente } from '@/lib/cadena/almacen'
import type { Estrategia } from '@/lib/cadena/tipos'
import { validarFormaDelPlan } from '@/lib/planeacion/validador-plan'

const leer = (...p: string[]) => readFileSync(join(__dirname, 'fixtures', ...p), 'utf8')
const PLAN_REAL = leer('ronda78', 'plan-v2-811b9e94.md')
const ESTRATEGIA_REAL = JSON.parse(leer('estrategia-real-naufrago-2026-10-30.json')) as Estrategia
/** lo que el modelo tuvo delante el 30-oct: el plan-en-JSON que el flujo guardó ese día (`client_historical_outputs` 3dfcc12f · `campaign_plan_90d` · 1.485 caracteres · leído de la base solo para esta prueba) */
const PLAN_JSON_30_OCT = leer('plan-json-naufrago-2026-10-30.txt')
/** la tabla REAL `cadena_formatos_por_red` (19 pares · 31-oct · solo lectura): los formatos permitidos que el estratega tuvo delante */
const FORMATOS_REALES = JSON.parse(leer('cadena-formatos-por-red-2026-10-31.json')) as Record<string, Array<{ formato: string; produccion: 'opera' | 'espera_brazo'; lead_dias: number; max_por_dia: number | null; familia: string | null }>>
const FORMATOS: Record<string, string[]> = Object.fromEntries(Object.entries(FORMATOS_REALES).map(([red, fs]) => [red, fs.map((f) => f.formato)]))
const ctx: ContextoDelCliente = {
  clientId: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', nombreDelNegocio: 'Náufrago', pais: 'Ecuador', zonaHoraria: 'America/Guayaquil',
  registro: 'tu', idioma: 'español', planTexto: PLAN_REAL, manualTexto: '(manual de marca de la prueba)', forbiddenWords: [], sedes: [], referencias: [], fechaDelPlan: '2026-10-12',
}

describe('contrato estrategia.v1 · el pedido con el plan real', () => {
  it('el plan real pasa el validador de forma antes de pedir la estrategia (es el mismo plan que recibe el estratega)', () => {
    expect(validarFormaDelPlan(PLAN_REAL)).toEqual({ ok: true, hallazgos: [], correccion: null })
  })
  it('la tarea lleva el plan ENTERO bajo # PLAN, el manual, el registro del cliente y las reglas del contrato; sin voseo', () => {
    const t = tareaDeEstrategia({ ctx, formatosPermitidos: FORMATOS, version: 1 })
    expect(t).toContain('# PLAN\n' + PLAN_REAL)
    expect(t).toContain('# MANUAL DE MARCA\n(manual de marca de la prueba)')
    expect(t).toContain('# Formatos permitidos por red\n- facebook: ' + FORMATOS.facebook.join(', '))
    expect(Object.keys(FORMATOS).sort()).toEqual(['facebook', 'instagram', 'linkedin', 'tiktok', 'whatsapp', 'youtube'])
    expect(t).toMatch(/cita_plan/)
    expect(t).toMatch(/Los pilares suman 100\. Las fases caen dentro de 90 días\./)
    expect(t).toMatch(/\(versión de estrategia 1\)/)
    expect(t).not.toMatch(/# CORRECCIÓN/)
    // el registro: el del cliente (tuteo aquí porque la ficha lo fija), nunca uno fijo del proyecto escrito en la tarea;
    // la regla de idioma NOMBRA «vos» como trato posible (eso no es voseo): lo que no puede haber son formas verbales voseantes
    expect(t).toMatch(/tuteo/i)
    expect(t).toMatch(/Respeta el trato \(tú, vos, usted u otro\) que fije el manual/)
    expect(t.slice(0, t.indexOf('# PLAN'))).not.toMatch(/\b(?:ten[eé]s|sab[eé]s|pod[eé]s|decime|escrib[ií]|respond[eé])\b/i)
  })
  it('con corrección, la tarea agrega el bloque CORRECCIÓN (única) con las fichas numeradas', () => {
    const t = tareaDeEstrategia({ ctx, formatosPermitidos: FORMATOS, version: 2, correccion: [{ que: 'faltó la cita', donde: 'fases[0]', contra_que: 'plan', gravedad: 'bloquea', propuesta: 'copia la frase literal' }] })
    expect(t).toContain('# CORRECCIÓN (única)')
    expect(t).toContain('1. [fases[0]] faltó la cita → copia la frase literal')
  })
})

describe('contrato estrategia.v1 · la respuesta real del estratega (30-oct)', () => {
  it('cumple el JSON Schema `estrategia.v1` tal cual (sin campos extra, enums válidos) y `problemasDeEsquema` no le ve nada', () => {
    expect(ESQUEMAS['estrategia.v1']).toBe(ESQUEMA_ESTRATEGIA)
    const ajv = new Ajv({ strict: true, allErrors: true })
    const v = ajv.compile(ESQUEMA_ESTRATEGIA)
    expect(v(ESTRATEGIA_REAL) || JSON.stringify(v.errors)).toBe(true)
    expect(problemasDeEsquema(ESTRATEGIA_REAL)).toEqual([])
  })
  it('es una estrategia con sustancia: 3 fases que cubren los 90 días, pilares que suman 100, redes canónicas con rol y un patrón semanal', () => {
    expect(ESTRATEGIA_REAL.fases.map((f) => [f.dia_desde, f.dia_hasta])).toEqual([[1, 30], [31, 60], [61, 90]])
    expect(ESTRATEGIA_REAL.pilares.reduce((s, p) => s + p.pct, 0)).toBe(100)
    expect(ESTRATEGIA_REAL.canales.map((c) => `${c.red}:${c.rol}`)).toEqual(['instagram:principal', 'facebook:replica', 'tiktok:replica', 'youtube:replica', 'whatsapp:principal', 'linkedin:no'])
    expect(ESTRATEGIA_REAL.patron_semanal.length).toBeGreaterThanOrEqual(5)
    for (const s of ESTRATEGIA_REAL.patron_semanal) { expect(s.dia_semana).toBeGreaterThanOrEqual(1); expect(s.dia_semana).toBeLessThanOrEqual(7); expect(s.hora).toMatch(/^\d{2}:\d{2}$/) }
    for (const p of ESTRATEGIA_REAL.pendientes) expect(['portero', 'sistema']).toContain(p.pedir_a)
  })
  it('el validador de la cadena la acepta con los insumos REALES de ese día (plan en JSON + tabla de formatos): 0 bloqueos, como en producción (`validada`)', () => {
    const r = validarEstrategia(ESTRATEGIA_REAL, { planTexto: PLAN_JSON_30_OCT, formatos: FORMATOS_REALES })
    expect(r.filter((h) => h.severidad === 'bloquea').map((h) => `${h.chequeo} · ${h.ficha.que}`)).toEqual([])
  })
  it('contra la prosa del 12-oct (otro plan) lo único que cambia son las citas (S02); el esquema (S01) y los pares red-formato (S06) siguen bien', () => {
    const r = validarEstrategia(ESTRATEGIA_REAL, { planTexto: PLAN_REAL, formatos: FORMATOS_REALES })
    const chequeos = [...new Set(r.filter((h) => h.severidad === 'bloquea').map((h) => h.chequeo))]
    expect(chequeos).not.toContain('S01')
    expect(chequeos).not.toContain('S06')
    expect(chequeos).toEqual(['S02'])
  })
  it('el consumidor del nuevo orden (`insumosDesdeEstrategia`) saca de ella las fases con semanas y las redes con sus huecos', () => {
    const ins = insumosDesdeEstrategia(ESTRATEGIA_REAL, ['prohibida'], ['foto:1'])
    expect(ins.fases).toEqual([{ clave: 'senal', semanas: 5 }, { clave: 'recompra', semanas: 5 }, { clave: 'temporada', semanas: 5 }])
    expect(semanasDeFase({ dia_desde: 1, dia_hasta: 30 })).toBe(5)
    expect(ins.redes).toEqual(expect.arrayContaining([{ red: 'instagram', huecos_por_semana: 4 }, { red: 'whatsapp', huecos_por_semana: 2 }, { red: 'tiktok', huecos_por_semana: 1 }]))
    expect(ins.redes.map((r) => r.red)).not.toContain('linkedin')
    expect(ins.prohibidas).toEqual(['prohibida'])
    expect(ins.fotos).toEqual(['foto:1'])
  })
})
