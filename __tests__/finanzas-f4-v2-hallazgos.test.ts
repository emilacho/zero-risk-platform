/**
 * F4 v2 · hallazgos 1 y 3 de CC#1 (15-oct) · US$ 0, sin red, sin modelo.
 *  · hallazgo 3: sin acuerdo / sin firma / vencido, el plan RECIBE los rangos supuestos y el motivo; sin `finanzas_id` ni motivo la salida de B4 es IDÉNTICA byte por byte;
 *  · hallazgo 1: P8 solo deja pasar una cifra firmada o un monto que el bloque declara; una suma que «casualmente cuadra» se marca;
 *  · estructura: el flujo sigue en 53 nodos; solo cambian B4, «¿Llegó la vuelta?» y la condición de «FIN · ¿trae finanzas_id?».
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { antesDeF4, enganchaFinanzas, FIN, moduloConFinanzas, NODOS } from '../scripts/worker-staging/finanzas-f4/construir-f4.mjs'
import { calcular } from '../src/lib/finanzas/calculadora'
import { montosDeclarados } from '../src/lib/finanzas/resumen'
import { numerosDelBloque } from '../src/lib/finanzas/firma'

type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown> }
const antes = antesDeF4() as Flujo
const despues = enganchaFinanzas(antes) as Flujo
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const M = new Function(moduloConFinanzas() + '\nreturn { revisarPlan, revisarCifrasFinanzas, lineasDeFinanzas }')() as Record<string, (...a: any[]) => any>

const MANUAL = { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], tone: 'cercano' } }
const entrada = { ficha: { id: 'x-1', name: 'Negocio de práctica', country: 'Ecuador', industry: 'restaurante', config: { spend_cap_usd: 9 } }, manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {}, hechos_del_dueno: ['Atiende por cita previa.'] }
async function b4(flujo: Flujo, nodoFin?: Record<string, unknown>, hook?: Record<string, unknown>) {
  const dolar = (nombre: string) => {
    if (nombre === FIN.leer && nodoFin) return { first: () => ({ json: nodoFin }) }
    if (nombre === 'Webhook · planeacion' && hook) return { first: () => ({ json: { body: hook } }) }
    throw new Error(`Node '${nombre}' hasn't been executed`)
  }
  const f = new AsyncFunction('$input', '$', String(flujo.nodes.find((x) => x.name === NODOS.b4)!.parameters.jsCode))
  return (await f({ first: () => ({ json: entrada }) }, dolar))[0].json as Record<string, any>
}

const ref = (min: number, max: number, base?: number) => ({ min, max, base, tipo: 'supuesto' as const, fuente: 'referencia de prueba (supuesto)' })
const ENT = { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: ref(0.4, 1.2), dias_activos_por_semana: 5, produccion: { fraccion: 0.25, origen: 'plan' as const }, canales: [{ canal: 'canal_a', peso: 0.1, piso_diario: 29.7 }] } as any
const calc = calcular(ENT)
const bloque = (calc as any).ok ? (calc as any) : null

describe('estructura', () => {
  it('63 nodos (los de antes + 3 de F4 + 10 de la oficina conducida por el plan)', () => {
    expect(antes.nodes.length).toBe(50)
    expect(despues.nodes.length).toBe(63)
    const v2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'worker-staging', 'finanzas-f4', 'plan-F4-finanzas-v2-ARREGLADO-2026-10-15.json'), 'utf8')) as Flujo
    expect(v2.nodes.length).toBe(63)
    expect(JSON.stringify(v2)).toBe(JSON.stringify(despues))
  })
  it('la puerta «FIN · ¿trae finanzas_id?» entra también con un motivo (y siempre exige client_id)', () => {
    const n = despues.nodes.find((x) => x.name === FIN.si)!
    const expr = String(n.parameters.conditions.conditions[0].leftValue)
    expect(expr).toContain('finanzas_motivo')
    expect(expr).toContain('finanzas_id')
    expect(expr).toContain('client_id')
  })
})

describe('hallazgo 3 · APAGADO = IDÉNTICO byte por byte', () => {
  it('sin finanzas_id ni motivo (con o sin cuerpo de la sala) la salida de B4 es la de F4 sin finanzas', async () => {
    const a = await b4(antes)
    for (const hook of [undefined, {}, { client_id: 'x-1' }, { client_id: 'x-1', finanzas_motivo: 'cualquier-cosa' }, { finanzas_motivo: 7 }]) {
      const d = await b4(despues, undefined, hook as any)
      expect(JSON.stringify(d), JSON.stringify(hook)).toBe(JSON.stringify(a))
    }
  })
  it('una respuesta de la ruta que no es un bloque (409, 404, 500, cuerpo ilegible) y SIN motivo: idéntico', async () => {
    const a = await b4(antes)
    for (const resp of [{ statusCode: 409, body: { error: 'finanzas_apagada' } }, { statusCode: 404, body: {} }, { statusCode: 500, body: {} }, { statusCode: 200, body: 'no es json' }, {}]) {
      expect(JSON.stringify(await b4(despues, resp, { client_id: 'x-1' }))).toBe(JSON.stringify(a))
    }
  })
})

describe('hallazgo 3 · sin acuerdo / sin firma / vencido: el plan recibe el motivo y los rangos supuestos', () => {
  it.each(['sin_acuerdo', 'sin_firma', 'vencido', 'sin_bloque', 'sin_referencia', 'sin_pauta'])('%s sin bloque: aviso «sin números firmados», contexto con el motivo, y el plan que no lo dice se marca', async (motivo) => {
    const hoy = await b4(antes)
    const d = await b4(despues, { statusCode: 400, body: { error: 'entrada_invalida' } }, { client_id: 'x-1', finanzas_motivo: motivo })
    expect(d.pedido).toContain('SIN NÚMEROS FIRMADOS')
    expect(d.pedido).toContain('RANGO SUPUESTO')
    expect(d.pedido).toContain('DICE de forma visible')
    expect(d.contexto_chequeo.finanzas).toEqual({ numeros: [], semanas: 12, estado: 'sin_bloque', motivo, declaradas: [] })
    expect(d.finanzas_id_usado).toBeNull()
    // fuera del aviso, el pedido es el de hoy
    expect(d.pedido.replace(/══════ OFICINA FINANCIERA: SIN NÚMEROS[\s\S]*?\n\n/, '')).toBe(hoy.pedido)
    const mudo = M.revisarPlan('# Plan\n\n## Presupuesto\nPauta de US$ 300 al mes.\n', d.contexto_chequeo)
    expect(mudo.marcas.map((m: any) => m.codigo)).toContain('P9')
    const bien = M.revisarPlan('# Plan\n\n## Presupuesto\nLa oficina financiera no firmó los números: pauta orientativa de US$ 300 al mes (estimación, rango supuesto).\n', d.contexto_chequeo)
    expect(bien.marcas.filter((m: any) => m.codigo === 'P8' || m.codigo === 'P9')).toEqual([])
  })

  it('un bloque leído SIN firma entra rotulado «SIN FIRMA · motivo» y sus montos se tratan como supuestos', async () => {
    expect(bloque).toBeTruthy()
    const numeros = numerosDelBloque(bloque).map((x) => ({ clave: x.clave, valor: x.valor, minimo: x.minimo, maximo: x.maximo, tipo: x.tipo }))
    const resp = { statusCode: 200, body: { finanzas_id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10', estado: 'sin_firma', huella: 'h', numeros, semanas: 12, resumen: { lineas: ['Meta: 15 ventas por semana.'], alertas: [] }, montos_declarados: montosDeclarados(bloque) } }
    const d = await b4(despues, resp, { client_id: 'x-1', finanzas_id: resp.body.finanzas_id, finanzas_motivo: 'sin_acuerdo' })
    expect(d.pedido).toContain('SIN FIRMA · sin_acuerdo')
    expect(d.pedido).toContain('NO están firmados')
    expect(d.contexto_chequeo.finanzas.estado).toBe('sin_firma')
    expect(d.contexto_chequeo.finanzas.motivo).toBe('sin_acuerdo')
    expect(d.finanzas_estado_usado).toBe('sin_firma')
    // sin motivo en el sobre, un bloque no firmado se rotula «sin_firma»
    const d2 = await b4(despues, resp, { client_id: 'x-1', finanzas_id: resp.body.finanzas_id })
    expect(d2.contexto_chequeo.finanzas.motivo).toBe('sin_firma')
  })

  it('con el bloque FIRMADO el pedido sigue igual que en F4 v1 (el bloque entra; sin motivo, sin aviso de falta de firma)', async () => {
    const numeros = numerosDelBloque(bloque).map((x) => ({ clave: x.clave, valor: x.valor, minimo: x.minimo, maximo: x.maximo, tipo: x.tipo }))
    const resp = { statusCode: 200, body: { finanzas_id: '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10', estado: 'firmado', huella: 'h', numeros, semanas: 12, resumen: { lineas: ['Meta: 15 ventas por semana.'], alertas: [] }, montos_declarados: [] } }
    const d = await b4(despues, resp, { client_id: 'x-1', finanzas_id: resp.body.finanzas_id })
    expect(d.pedido).toContain('NÚMEROS DE LA OFICINA FINANCIERA (firmados)')
    expect(d.pedido).not.toContain('SIN FIRMA')
    expect(d.contexto_chequeo.finanzas.estado).toBe('firmado')
    expect(d.contexto_chequeo.finanzas.motivo).toBeNull()
  })
})

describe('hallazgo 1 · P8 estricto', () => {
  const fin = (extra: Record<string, unknown> = {}) => ({
    numeros: [
      { clave: 'pauta_rendimiento_mes', valor: 100, minimo: null, maximo: null, tipo: 'supuesto' },
      { clave: 'produccion_mes', valor: 40, minimo: null, maximo: null, tipo: 'dato' },
      { clave: 'meta_ig_mes', valor: 60, minimo: null, maximo: null, tipo: 'supuesto' },
    ], semanas: 12, estado: 'firmado', motivo: null, declaradas: [], ...extra,
  })
  const plan = (monto: string) => `# Plan\n\n## Presupuesto\nPauta: US$ ${monto} al mes (estimación).\n`
  const p8 = (monto: string, f = fin()) => M.revisarCifrasFinanzas(plan(monto), f).some((m: any) => m.codigo === 'P8')

  it('US$ 777,77 se marca; una suma de dos o tres firmadas se marca; una firmada pasa', () => {
    expect(p8('777,77')).toBe(true)
    expect(p8('140,00')).toBe(true) // 100 + 40
    expect(p8('200,00')).toBe(true) // 100 + 40 + 60
    expect(p8('100,00')).toBe(false)
    expect(p8('40,00')).toBe(false)
  })
  it('la suma pasa SOLO si el bloque la declara', () => {
    expect(p8('140,00', fin({ declaradas: [140] }))).toBe(false)
    expect(p8('141,00', fin({ declaradas: [140] }))).toBe(true)
  })
  it('mutación: cada firmada movida +1 % o +1 unidad se marca; tolerancia = redondeo, ya no 0,50', () => {
    for (const v of [100, 40, 60]) {
      expect(p8((v + 1).toFixed(2).replace('.', ',')), `${v}+1`).toBe(true)
      expect(p8((v * 1.01).toFixed(2).replace('.', ',')), `${v}+1%`).toBe(true)
      expect(p8(v.toFixed(2).replace('.', ',')), `${v}`).toBe(false)
    }
    const chico = fin({ numeros: [{ clave: 'costo_por_resultado_arranque', valor: 1.04, minimo: 0.48, maximo: 1.68, tipo: 'supuesto' }] })
    expect(M.revisarCifrasFinanzas('# Plan\n\n## Presupuesto\nCosto por resultado: US$ 1,50.\n', chico).some((m: any) => m.codigo === 'P8')).toBe(true) // antes pasaba por la tolerancia de 0,50
  })
  it('montosDeclarados trae los montos que el bloque declara (por semana, prueba inicial, reparto) y ninguno repetido', () => {
    const m = montosDeclarados(bloque)
    for (const x of bloque.calendario.por_semana.filter((v: number) => v > 0)) expect(m).toContain(Math.round(x * 100) / 100)
    expect(m).toContain(Math.round(bloque.calendario.prueba.diez * 100) / 100)
    expect(m).toContain(Math.round(bloque.reparto.total_mes * 100) / 100)
    expect(new Set(m).size).toBe(m.length)
    expect(m.every((x) => x > 0)).toBe(true)
  })
})
