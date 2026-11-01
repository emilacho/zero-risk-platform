/**
 * 01-nov · ADENDA 1 del equipo del manual · el eslogan real del cliente es un HECHO (reparto con CC1). US$ 0, sin red; se ejecuta el CÓDIGO REAL de «Redactor (B4)» (planeación) y de «[BB] Consolidador» (manual).
 * Fija: sin `contexto_del_cliente.eslogan` el pedido del plan queda IDÉNTICO a la base ya aplicada; con él, un bloque con la frase, su fuente, la regla de la plataforma y la del plan (se usa; otro eslogan = PROPUESTA rotulada).
 * En el manual, la frase propia hallada LITERAL llega como `tagline` con su fuente; sin frase hallada no hay tagline, y `tagline_opciones` no se toca.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string, id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, `${id}.json`), 'utf8'))
const PLAN = 'X9F0zp6LQ2xGEYVS', MANUAL = 'ssLtwYPt7zxuvnM2'
const aplicado = leer('aplicado', PLAN), nuevoPlan = leer('nuevo', PLAN)
const vivoManual = leer('vivo', MANUAL), nuevoManual = leer('nuevo', MANUAL)
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor

const ESLOGAN = { texto: 'Cuando tengas esa hambre de... Náufrago te espera!', fuente: 'Frase propia del cliente hallada en sitio/perfil — literal', regla: 'Es del cliente: úsalo; otro eslogan va como propuesta.' }
const carpeta = (extra: Record<string, unknown> = {}) => ({ brazo: 'cerebro', estado: 'trajo', objetivo: 'cerebro', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'vigente', texto: 'RESUMEN DEL CLIENTE' }, informes: [], ...extra } } })
const b4 = async (flujo: any, material: any[], ficha: any = { name: 'Náufrago', country: 'Ecuador', config: {} }) => {
  const codigo = flujo.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string
  const ent = { ficha, manual: {}, material, descartados: [], referencia: 'REF', casa: {}, plata: {} }
  const $ = (n: string): never => { throw new Error('nodo no previsto ' + n) }
  const r = await new AsyncFunction('$input', '$', '$env', '$json', codigo)({ first: () => ({ json: ent }), all: () => [{ json: ent }] }, $, {}, {})
  return (r[0].json as Record<string, any>).pedido as string
}
const cambiados = (a: any, b: any) => b.nodes.filter((n: any) => { const o = a.nodes.find((x: any) => x.name === n.name); return !o || JSON.stringify(o.parameters) !== JSON.stringify(n.parameters) }).map((n: any) => n.name).sort()

describe('planeación · alcance', () => {
  it('solo cambia «Redactor (B4)»; no se suman ni se quitan nodos ni conexiones', () => {
    expect(cambiados(aplicado, nuevoPlan)).toEqual(['Redactor (B4)'])
    expect(nuevoPlan.nodes.length).toBe(aplicado.nodes.length)
    expect(nuevoPlan.connections).toEqual(aplicado.connections)
  })
})

describe('«Redactor (B4)» · el eslogan real (código real)', () => {
  it('sin eslogan (carpeta sin el campo, sin carpeta, o campo vacío/raro): el pedido es EXACTAMENTE el de hoy', async () => {
    for (const m of [[carpeta()], [], [carpeta({ eslogan: null })], [carpeta({ eslogan: { texto: '   ' } })], [carpeta({ eslogan: 'x' })], [carpeta({ eslogan: [ESLOGAN] })]]) {
      expect(await b4(nuevoPlan, m)).toBe(await b4(aplicado, m))
    }
  })
  it('con eslogan: bloque con la frase, su fuente, la regla de la plataforma y la del plan', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: ESLOGAN })])
    expect(p).toContain('ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE)')
    expect(p).toContain('«Cuando tengas esa hambre de... Náufrago te espera!»')
    expect(p).toContain('Fuente: Frase propia del cliente hallada en sitio/perfil — literal')
    expect(p).toContain('Regla de la plataforma: Es del cliente: úsalo; otro eslogan va como propuesta.')
    expect(p).toMatch(/es un HECHO de la marca, no una opción/)
    expect(p).toMatch(/lo cambies en silencio/)
    expect(p).toMatch(/rotulada como PROPUESTA/)
  })
  it('el bloque va antes de la carpeta, después del registro, y solo una vez', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: ESLOGAN })])
    expect(p.split('ESLOGAN QUE EL CLIENTE YA USA').length).toBe(2)
    expect(p.indexOf('ESLOGAN QUE EL CLIENTE YA USA')).toBeLessThan(p.indexOf('LA CARPETA DEL CLIENTE (completa'))
    expect(p.indexOf('EL MANUAL DE MARCA APROBADO')).toBeLessThan(p.indexOf('ESLOGAN QUE EL CLIENTE YA USA'))
  })
  it('el eslogan con carpeta ilegible/sin resumen igual llega (no depende de que haya informes)', async () => {
    const p = await b4(nuevoPlan, [{ brazo: 'cerebro', estado: 'trajo', objetivo: 'cerebro', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], eslogan: ESLOGAN } } }])
    expect(p).toContain('«Cuando tengas esa hambre de... Náufrago te espera!»')
  })
  it('sin fuente o sin regla: dice «no declarada» y omite la regla, sin romper', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: { texto: 'Frase X' } })])
    expect(p).toContain('Fuente: no declarada')
    expect(p).not.toContain('Regla de la plataforma')
  })
  it('un texto larguísimo se acota; saltos de línea y espacios se colapsan (no rompe el bloque)', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: { texto: 'a\n\n b '.repeat(200), fuente: 'f' } })])
    const linea = p.split('\n').find((l) => l.startsWith('«a'))!
    expect(linea.length).toBeLessThanOrEqual(305)
  })
  it('pasa por la limpieza de nombres de personas protegidas', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: { texto: 'La cocina de Carlos Mendoza', fuente: 'f' } })], { name: 'Náufrago', country: 'Ecuador', config: { personas: ['Carlos Mendoza'] } })
    expect(p).not.toContain('Carlos Mendoza')
  })
})

const lente = (s: Record<string, unknown>) => ({ body: { brand_section: s } })
const consolidar = async (flujo: any, materia: any) => {
  const r = await recorrer(flujo, '[BB] Consolidador', { cycle: 0 }, {
    previos: {
      'Validate Deal Data': [{ client_id: 'c-1' }],
      'Lente · editor-en-jefe': [lente({ tagline_opciones: ['Una propuesta'] })],
      'Lente · brand-strategist': [lente({})],
      'Lente · jefe-client-success': [lente({})],
      'Confirm barato · competitor list': [{ discovery_package: { discovery_summary: 'x' } }],
      '[BB] Fan-out prep': [{ _grounding_refs: { materia_cliente: materia } }],
    },
    hasta: ['[BB] Uso · ¿usó lo disponible?'],
  })
  return r.item.brand_book_draft
}
const HALLADA = { estado_frase_propia: 'hallado', frase_propia: 'Cuando tengas esa hambre de... Náufrago te espera!' }

describe('manual · el Consolidador (código real)', () => {
  it('solo cambian «[BB] Fan-out prep», «[BB] Consolidador» y «[BB] Judge · run-sdk» (partes 1, 2 y 3 acumuladas)', () => {
    expect(cambiados(vivoManual, nuevoManual)).toEqual(['[BB] Consolidador', '[BB] Fan-out prep', '[BB] Judge · run-sdk'])
  })
  it('frase hallada: llega como tagline LITERAL, con la fuente y confianza 1, como hecho de código', async () => {
    const b = await consolidar(nuevoManual, HALLADA)
    expect(b.tagline).toBe('Cuando tengas esa hambre de... Náufrago te espera!')
    expect(b._field_meta.tagline).toMatchObject({ estado: 'hecho', provisional: false, gateado: false, fuente: expect.stringContaining('Frase propia del cliente hallada'), confianza: 1, lente: 'codigo' })
    expect(b.tagline_opciones).toEqual(['Una propuesta']) // las propuestas del editor no se tocan
  })
  it('no es provisional ni ausente: no cae en los baldes que se piden otra vez', async () => {
    const b = await consolidar(nuevoManual, HALLADA)
    const prov = Object.keys(b._field_meta).filter((k) => b._field_meta[k].estado === 'provisional')
    expect(prov).not.toContain('tagline')
  })
  it('sin frase hallada (no hallado, ausente, no es texto, vacía): NO hay tagline ni meta de tagline', async () => {
    for (const m of [{ estado_frase_propia: 'no_hallado' }, { estado_frase_propia: 'no_hallado', frase_propia: 'Una frase que no es del cliente' }, { estado_frase_propia: 'ambigua', frase_propia: 'Dos candidatas' }, null, undefined, { estado_frase_propia: 'hallado', frase_propia: 42 }, { estado_frase_propia: 'hallado' }, { estado_frase_propia: 'hallado', frase_propia: '   ' }]) {
      const b = await consolidar(nuevoManual, m)
      expect('tagline' in b).toBe(false)
      expect(b._field_meta.tagline).toBeUndefined()
    }
  })
  it('un hallazgo vacío tras limpiar no crea tagline; espacios y saltos se colapsan; se acota a 300', async () => {
    expect((await consolidar(nuevoManual, { estado_frase_propia: 'hallado', frase_propia: ' \n ' })).tagline).toBeUndefined()
    expect((await consolidar(nuevoManual, { estado_frase_propia: 'hallado', frase_propia: 'a  b\n c' })).tagline).toBe('a b c')
    expect((await consolidar(nuevoManual, { estado_frase_propia: 'hallado', frase_propia: 'x'.repeat(900) })).tagline.length).toBe(300)
  })
  it('sin la clave de materia, el borrador queda idéntico al de las partes 1 y 2 (solo agrega)', async () => {
    const sin = await consolidar(nuevoManual, null)
    expect(Object.keys(sin)).not.toContain('tagline')
  })
  it('el Consolidador de las partes anteriores (vivo) no tiene tagline: esta parte es la que lo agrega', async () => {
    const hoy = await consolidar(vivoManual, HALLADA)
    expect(hoy.tagline).toBeUndefined()
  })
})
