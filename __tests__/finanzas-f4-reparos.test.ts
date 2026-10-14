/**
 * OFICINA FINANCIERA · F4 · reparos de CC#3 (R-F4-1: P9 y los miles; R-F4-2: cliente obligatorio) y las tres mutaciones que sobrevivían (CC#1 · 14-oct).
 */
import { describe, expect, it } from 'vitest'
import { antesDeF4, enganchaFinanzas, FIN, moduloConFinanzas, NODOS } from '../scripts/worker-staging/finanzas-f4/construir-f4.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'

type Json = Record<string, any>
const M = new Function(moduloConFinanzas() + '\nreturn { revisarCifrasFinanzas, _finFormas, _finAgrupar }')() as Record<string, (...a: any[]) => any>
const despues = enganchaFinanzas(antesDeF4()) as Json
const codigos = (r: any[]) => r.map((m) => m.codigo)
const fin = (clave: string, valor: number, tipo = 'supuesto') => ({ numeros: [{ clave, valor, minimo: null, maximo: null, tipo }], semanas: 12 })
const plan = (frase: string) => ['# Plan', '## 7 · El presupuesto', frase].join('\n')

describe('R-F4-1 · P9 ve los miles con separador (en los dos formatos)', () => {
  it('las formas que genera: 1.234,50 · 1,234.50 · 1234.5 · 1234,5 · y 2.000 · 2,000 · 2000', () => {
    const a = M._finFormas(1234.5)
    for (const f of ['1.234,50', '1,234.50', '1234.50', '1234,50']) expect(a, f).toContain(f)
    const b = M._finFormas(2000)
    for (const f of ['2.000', '2,000', '2000', '2000.00', '2000,00']) expect(b, f).toContain(f)
    expect(M._finFormas(1.04)).not.toContain('1')
    expect(M._finAgrupar('1234567', '.')).toBe('1.234.567')
    expect(M._finAgrupar('123', '.')).toBe('123')
    expect(M._finAgrupar('1234', ',')).toBe('1,234')
  })
  for (const [valor, textos] of [[1234.5, ['1.234,50', '1,234.50', '1234,50', '1234.50']], [2000, ['2.000', '2,000', '2000']], [1234567, ['1.234.567', '1,234,567']]] as Array<[number, string[]]>) {
    for (const t of textos) {
      it(`un supuesto de ${valor} escrito «${t}» SIN declararlo como estimación → P9 marca`, () => {
        expect(codigos(M.revisarCifrasFinanzas(plan(`Cada mes se invierten exactamente ${t} USD en total.`), fin('total_mes', valor)))).toContain('P9')
      })
      it(`el mismo «${t}» declarado como estimado → no marca`, () => {
        expect(codigos(M.revisarCifrasFinanzas(plan(`Cada mes se invierten, como estimado, ${t} USD en total.`), fin('total_mes', valor)))).not.toContain('P9')
      })
    }
  }
  it('un número que es PARTE de otro más largo no se confunde (2.000 dentro de 12.000 no cuenta)', () => {
    expect(codigos(M.revisarCifrasFinanzas(plan('Se invierten 12.000 USD en el año.'), fin('total_mes', 2000)))).not.toContain('P9')
    expect(codigos(M.revisarCifrasFinanzas(plan('Se invierten 2.0001 USD.'), fin('total_mes', 2000)))).not.toContain('P9')
  })
})

describe('las tres mutaciones que sobrevivían', () => {
  it('P9 solo mira las cifras de DINERO: «50 resultados» (clave resultados_por_semana) sin declarar no marca', () => {
    expect(codigos(M.revisarCifrasFinanzas(plan('Se esperan 50 resultados por semana.'), fin('resultados_por_semana', 50)))).toEqual([])
    expect(codigos(M.revisarCifrasFinanzas(plan('Se esperan 50 resultados por semana.'), fin('pauta_diaria', 50)))).toContain('P9')
  })
  it('P9 no marca fracciones (< 1): «0,73» sin declarar no marca; «1,04» sí', () => {
    expect(codigos(M.revisarCifrasFinanzas(plan('El techo es 0,73 por resultado.'), fin('techo_por_resultado', 0.73)))).toEqual([])
    expect(codigos(M.revisarCifrasFinanzas(plan('El costo es 1,04 por resultado.'), fin('costo_por_resultado_arranque', 1.04)))).toContain('P9')
  })
  it('P9 solo marca lo que la oficina llama «supuesto»: un DATO (producción del plan) sin declarar no marca', () => {
    expect(codigos(M.revisarCifrasFinanzas(plan('La producción es de 93,89 al mes.'), fin('produccion_mes', 93.89, 'dato')))).toEqual([])
  })
  it('B4 solo toma un bloque con estado de respuesta 200: un 201, un 202 o un 500 con cuerpo firmado NO entra', async () => {
    const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
    const b4 = String(despues.nodes.find((n: Json) => n.name === NODOS.b4).parameters.jsCode)
    const MANUAL = { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], typography: ['Lato'] } }
    const ent = { ficha: { id: 'x-1', name: 'Cliente de práctica', country: 'Colombia', industry: 'consultoría', config: { spend_cap_usd: 9 } }, manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {}, hechos_del_dueno: [] }
    const cuerpo = { finanzas_id: 'a', estado: 'firmado', huella: 'h', numeros: [{ clave: 'k', valor: 1, tipo: 'dato' }], semanas: 12, resumen: { lineas: ['Meta: 1.'], alertas: [] } }
    const correrB4 = async (statusCode: number) => (await new AsyncFunction('$input', '$', b4)({ first: () => ({ json: ent }) }, (n: string) => { if (n === FIN.leer) return { first: () => ({ json: { statusCode, body: cuerpo } }) }; throw new Error('no ejecutado') }))[0].json
    expect((await correrB4(200)).finanzas_id_usado).toBe('a')
    for (const s of [201, 202, 204, 500, 401]) expect((await correrB4(s)).finanzas_id_usado, String(s)).toBeUndefined()
  })
})

describe('R-F4-2 · el cliente es obligatorio también en el nodo', () => {
  const stubs = Object.fromEntries(despues.nodes.filter((n: Json) => n.name !== FIN.si && n.name !== FIN.leer && n.name !== FIN.devolver && (n.type === 'n8n-nodes-base.code' || n.type === 'n8n-nodes-base.httpRequest')).map((n: Json) => [n.name, (items: any[]) => [{ json: { _nodo: n.name, _recibio: items.map((i) => i.json) } }]]))
  const unir = [{ json: { paquete: 'x' } }]
  const ejecutar = (body: Json) => correr(despues, { inicio: NODOS.unir, itemsDeInicio: unir, previos: { 'Webhook · planeacion': { body: { dry_run: true, ...body } } }, stubs, http: { [FIN.leer]: () => ({ statusCode: 200, body: {} }) }, env: { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid', INTERNAL_API_KEY: 'k' } })
  it('con finanzas_id pero SIN client_id (o vacío o no texto): va DIRECTO al redactor y no se llama a la ruta', async () => {
    for (const body of [{ finanzas_id: 'a' }, { finanzas_id: 'a', client_id: '' }, { finanzas_id: 'a', client_id: 5 }]) {
      const r = await ejecutar(body)
      expect(r.nombres.slice(0, 2), JSON.stringify(body)).toEqual([FIN.si, NODOS.b4])
      expect(r.llamadasHttp.filter((l: any) => String(l.url).includes('finanzas'))).toEqual([])
    }
  })
  it('con los dos: lee, y el cuerpo lleva el client_id tal cual (sin «|| null»)', async () => {
    const r = await ejecutar({ finanzas_id: 'a', client_id: 'cli-1' })
    expect(r.nombres.slice(0, 2)).toEqual([FIN.si, FIN.leer])
    expect(r.llamadasHttp.find((l: any) => l.nodo === FIN.leer).cuerpo).toEqual({ accion: 'leer', finanzas_id: 'a', client_id: 'cli-1' })
    expect(JSON.stringify(despues.nodes.find((n: Json) => n.name === FIN.leer).parameters)).not.toContain('|| null')
  })
})
