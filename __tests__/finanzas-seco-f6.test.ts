/**
 * OFICINA FINANCIERA · F6 · el SECO a US$ 0 (CC#1 · 14-oct) · rev. 9: HONESTO sobre lo que cubre.
 * 18 celdas = 3 modelos MUY distintos × 6 casos centrales, cada una con una entrada propia (o un camino de firma propio): ya no hay una dimensión «registro» decorativa.
 * En cada celda: APAGADA = 0 escrituras y 0 gasto (también en seco), el plan NUNCA se bloquea (rechazos con motivo), sin NaN ni celda vacía, huella estable, lo escrito lleva su traza,
 * y la firma sigue las reglas (salida del jefe obligatoria; una sola corrección).
 * Que la calculadora no llama a ningún modelo ni proveedor NO se prueba con contadores en 0 (eran constantes): lo prueba `finanzas-pureza-y-barrido.test.ts`, que FALLA si aparece `fetch`.
 */
import { describe, expect, it } from 'vitest'
import { calcular } from '../src/lib/finanzas/calculadora'
import { huellaDe, numerosDelBloque } from '../src/lib/finanzas/firma'
import { resumenDelBloque } from '../src/lib/finanzas/resumen'
import { manejarBloque, manejarTablero, type ConfigDeFinanzas, type FilaDeTablero, type PuertosDeTablero } from '../src/lib/finanzas/ruta'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const REF = (min: number, max: number) => ({ min, max, tipo: 'supuesto' as const, fuente: 'referencia de prueba (supuesto)' })
// tres modelos MUY distintos (solo pruebas): venta con entrega · compra directa en línea · ciclo largo con dos pasos
const MODELOS: Record<string, Entrada> = {
  entrega: { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: REF(0.4, 1.2), dias_activos_por_semana: 5, produccion: { fraccion: 0.25, origen: 'plan' }, canales: [{ canal: 'canal_a', peso: 0.1, piso_diario: 30 }] },
  directa: { meta_por_semana: 10, ticket: 29, margen: 0.45, referencia: REF(8, 20), dias_activos_por_semana: 7, produccion: { fraccion: 0.2, origen: 'supuesto' }, evento_alterno: { nombre: 'alterno', referencia: REF(1.5, 4) } },
  largo: { meta_por_semana: 1, pasos: [{ tasa: 0.3 }, { tasa: 0.4 }], ticket: 400000, margen: 0.6, referencia: REF(25000, 70000), dias_activos_por_semana: 5, ciclo_dias: 60, produccion: { fraccion: 0.15, origen: 'supuesto' } },
}
type Central = { nombre: string; entrada: (e: Entrada) => Entrada; espera: 'bloque' | 'rechazo'; hallazgos?: Array<{ severidad: string; que: string }>; correcciones?: number; firma: 'firmado' | 'sin_firma' | null }
const CENTRALES: Central[] = [
  { nombre: '1 camino feliz: datos completos, el jefe no encuentra críticos → firmado', entrada: (e) => e, espera: 'bloque', firma: 'firmado' },
  { nombre: '2 faltan datos (sin ticket ni margen): sale con la referencia de mercado → firmado', entrada: (e) => ({ ...e, ticket: null, margen: null, costo_entrega: null }), espera: 'bloque', firma: 'firmado' },
  { nombre: '3 no hay referencia (sin base): se rechaza con motivo y el plan sigue', entrada: (e) => ({ ...e, referencia: null }), espera: 'rechazo', firma: null },
  { nombre: '4 formato roto (números que no son números): se rechaza con motivo y el plan sigue', entrada: (e) => ({ ...e, meta_por_semana: Number.NaN, pasos: [{ tasa: 7 }] }), espera: 'rechazo', firma: null },
  { nombre: '5 con críticos tras la única corrección → sin firma (el plan sigue)', entrada: (e) => ({ ...e, meta_por_semana: e.meta_por_semana * 2 }), espera: 'bloque', hallazgos: [{ severidad: 'critico', que: 'cifra que no cuadra' }], correcciones: 1, firma: 'sin_firma' },
  { nombre: '6 la pauta no alcanza el mínimo: dilución / alterno / un conjunto, nunca vacío', entrada: (e) => ({ ...e, meta_por_semana: 1, pasos: e.pasos?.length ? [{ tasa: 0.9 }] : undefined }), espera: 'bloque', firma: 'firmado' },
]
const VOSEO = /(^|[^a-záéíóúñ])(vos|sabés|tenés|querés|podés|decime|decilo|mirá|fijate|andá|contame|avisame|respondé|hacé|poné|pasame|elegí|confirmá|necesitás|cobrás)(?![a-záéíóúñ])/i
const ID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10'
const cfg = (estado: ConfigDeFinanzas['estado']): ConfigDeFinanzas => ({ estado, clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'apagado' })

function mundo(estado: ConfigDeFinanzas['estado']) {
  const c = { escrituras: 0 }
  let guardado: FilaDeTablero | null = null
  const P: PuertosDeTablero = {
    async leerConfig() { return cfg(estado) },
    async guardarTablero(t) { c.escrituras++; guardado = { id: ID, client_id: t.client_id, version: 1, vigente: true, estado: 'borrador', entrada: t.entrada, bloque: t.bloque as Bloque, huella: t.huella }; return { id: ID, version: 1 } },
    async leerTablero() { return guardado },
    async leerNumeros() { return guardado ? numerosDelBloque(guardado.bloque) : [] },
    async actualizarTablero(_i, p) { c.escrituras++; if (guardado) guardado = { ...guardado, estado: p.estado } },
  }
  return { P, c, tablero: () => guardado }
}

describe('F6 · el seco: 18 celdas (3 modelos × 6 casos centrales), cada una con su entrada', () => {
  let celdas = 0
  const vistas = new Set<string>()
  for (const [modelo, base] of Object.entries(MODELOS)) {
    for (const central of CENTRALES) {
      it(`${modelo} · ${central.nombre}`, async () => {
        celdas++
        const entrada = central.entrada(base)
        vistas.add(JSON.stringify(entrada))
        // 1 · APAGADA = 0 escrituras, también en seco y también con la entrada rota
        for (const dry of [true, false]) {
          const a = mundo('apagada')
          const r = await manejarBloque({ client_id: 'c1', dry_run: dry, entrada }, a.P)
          expect(r.status).toBe(409)
          expect(a.c.escrituras).toBe(0)
        }
        // 2 · encendida, en seco: nunca escribe; el plan NUNCA se bloquea
        const s = mundo('encendida')
        const seco = await manejarBloque({ client_id: 'c1', dry_run: true, entrada }, s.P)
        expect(s.c.escrituras).toBe(0)
        expect(seco.status).toBe(central.espera === 'bloque' ? 200 : 422)
        if (central.espera === 'rechazo') {
          expect(seco.cuerpo.sin_bloque).toBe(true)
          expect((seco.cuerpo.errores as string[]).length).toBeGreaterThan(0)
          const real = mundo('encendida')
          expect((await manejarBloque({ client_id: 'c1', dry_run: false, entrada }, real.P)).status).toBe(422)
          expect(real.c.escrituras).toBe(0)
          return
        }
        // 3 · el bloque: sin NaN, sin celda vacía, huella estable, determinista, reparto exacto
        const b = seco.cuerpo.bloque as Bloque
        for (const c of Object.values(b.cifras)) { if (c.valor == null) { expect(c.tipo).toBe('sin_base'); expect(c.motivo).toBeTruthy() } else expect(Number.isFinite(c.valor)).toBe(true) }
        expect(seco.cuerpo.huella).toBe(huellaDe(b))
        expect(huellaDe(calcular(entrada))).toBe(seco.cuerpo.huella)
        expect(b.reparto.parte_meta_ig).toBeGreaterThanOrEqual(0.6 - 1e-3)
        expect(Math.round((b.reparto.meta_ig + b.reparto.produccion.monto + b.reparto.otros.reduce((x, o) => x + o.monto, 0)) * 100)).toBe(Math.round(b.reparto.total_mes * 100))
        if (central.nombre.startsWith('6')) expect(b.aprendizaje.dilucion || b.aprendizaje.limitado || b.alterno !== null).toBe(true)
        // 4 · real: escribe UN tablero con su traza; la firma sigue las reglas
        const w = mundo('encendida')
        const real = await manejarBloque({ client_id: 'c1', dry_run: false, entrada }, w.P)
        expect(real.status).toBe(200)
        expect(w.c.escrituras).toBe(1)
        expect((w.tablero() as FilaDeTablero).huella).toBe(real.cuerpo.huella)
        const f = await manejarTablero({ accion: 'firmar', finanzas_id: ID, client_id: 'c1', dry_run: false, salida: 'sale_ajustada', invocacion_id: 'inv-1', hallazgos: central.hallazgos ?? [], correcciones_hechas: central.correcciones ?? 0 }, w.P)
        expect(f.cuerpo.decision).toBe(central.firma)
        expect((w.tablero() as FilaDeTablero).estado).toBe(central.firma)
        // 5 · el texto de la oficina sale en tuteo y sin jerga
        const texto = resumenDelBloque(b, { dias_activos_por_semana: entrada.dias_activos_por_semana }).lineas.join('\n')
        expect(VOSEO.test(texto)).toBe(false)
        expect(texto.toLowerCase()).not.toContain('dry_run')
      })
    }
  }
  it('son exactamente 18 celdas y las 18 corrieron, con entradas distintas entre sí (las dos de «feliz» y «críticos» no son la misma)', () => {
    expect(Object.keys(MODELOS).length * CENTRALES.length).toBe(18)
    expect(celdas).toBe(18)
    // 3 modelos × 6 entradas, de las cuales por modelo las celdas 3 y 4 son rotas distintas y 1/5 difieren en la meta: 18 entradas distintas
    expect(vistas.size).toBe(18)
  })
})

describe('el detector de voseo del seco ve las formas con tilde final (R6 de CC#3)', () => {
  it('mirá, andá, hacé, poné, respondé, elegí, confirmá, necesitás, cobrás se detectan; el tuteo no', () => {
    for (const v of ['Mirá el plan', 'andá a revisar', 'hacé la prueba', 'poné la cifra', 'respondé aquí', 'elegí una', 'confirmá el monto', 'necesitás decidir', 'cobrás aparte']) expect(VOSEO.test(v), v).toBe(true)
    for (const t of ['Mira el plan', 've a revisar', 'haz la prueba', 'pon la cifra', 'responde aquí', 'elige una', 'confirma el monto', 'necesitas decidir', 'cobras aparte', 'la oficina está lista']) expect(VOSEO.test(t), t).toBe(false)
  })
})
