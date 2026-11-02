/**
 * 02-nov · ADENDA 3 del equipo del manual (Emilio: sin regla dura) · LA FRASE QUE EL CLIENTE USA ES CONTEXTO. US$ 0, sin red; se ejecuta el CÓDIGO REAL de «Redactor (B4)» (planeación) y de «[BB] Consolidador» (manual).
 * Fija: sin `contexto_del_cliente.eslogan` el pedido del plan queda IDÉNTICO a la base ya aplicada; con él, un bloque con la frase y su fuente COMO CONTEXTO (se usa, se adapta o se propone otra; la regla que mande la plataforma NO se copia;
 * solo si la declaró el dueño manda). En el manual el código YA NO escribe `tagline` ni lo marca como hecho: la frase hallada llega a las lentes como contexto (relevo 62) y no cambia el borrador.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sinFraseSedes } from './_sin-frase-sedes'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string, id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, `${id}.json`), 'utf8'))
const PLAN = 'X9F0zp6LQ2xGEYVS', MANUAL = 'ssLtwYPt7zxuvnM2'
const aplicado = leer('aplicado', PLAN), nuevoPlan = sinFraseSedes(leer('nuevo', PLAN))
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
  it('solo cambia «Redactor (B4)» (más lo del «Qué cambió»); no se suman ni se quitan nodos ni conexiones', () => {
    // + el «Qué cambió» por código (punto 6 de CC1): se prueba aparte en flujos-oficina-marketing-que-cambio-por-codigo.test.ts
    // + la adenda 5 (no guardar copias del plan anterior): 8 nodos nuevos «② …», «Pedir el plan al redactor» y «Guardar el plan»; se prueba aparte en flujos-oficina-marketing-planeacion-no-guardar-copias.test.ts
    const COPIAS = ['② ¿Es copia del plan anterior?', '② IF · ¿copia · reintentar?', '② IF · ¿copia · detener?', '② IF · ¿hay pedido de cambios?', '② Cambio · sin cambios reales', '② Resumen · sin cambios reales', '② Cable de vuelta · sin cambios reales', '② Cable · ¿volvió? · sin cambios reales']
    expect(cambiados(aplicado, nuevoPlan).filter((n: string) => !n.startsWith('JEF · plan ·') && !COPIAS.includes(n) && !['Pedir el plan al redactor', 'Guardar el plan'].includes(n))).toEqual(['Redactor (B4)'])
    expect(nuevoPlan.nodes.length).toBe(aplicado.nodes.length + COPIAS.length)
    const sinCopias = Object.fromEntries(Object.entries(nuevoPlan.connections).filter(([k]) => !COPIAS.includes(k)).map(([k, v]: [string, any]) => [k, { main: v.main.map((g: any[]) => g.map((c) => (c.node === COPIAS[0] ? { ...c, node: 'Guardar el plan' } : c))) }]))
    expect(sinCopias).toEqual(aplicado.connections)
  })
})

describe('«Redactor (B4)» · el eslogan real (código real)', () => {
  it('sin eslogan (carpeta sin el campo, sin carpeta, o campo vacío/raro): el pedido es EXACTAMENTE el de hoy', async () => {
    for (const m of [[carpeta()], [], [carpeta({ eslogan: null })], [carpeta({ eslogan: { texto: '   ' } })], [carpeta({ eslogan: 'x' })], [carpeta({ eslogan: [ESLOGAN] })]]) {
      expect(await b4(nuevoPlan, m)).toBe(await b4(aplicado, m))
    }
  })
  it('con eslogan: bloque con la frase y su fuente como CONTEXTO; la regla de la plataforma no se copia', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: ESLOGAN })])
    expect(p).toContain('UNA FRASE QUE EL CLIENTE USA (contexto)')
    expect(p).toContain('«Cuando tengas esa hambre de... Náufrago te espera!»')
    expect(p).toContain('Fuente: Frase propia del cliente hallada en sitio/perfil — literal')
    expect(p).not.toContain('Regla de la plataforma')
    expect(p).not.toContain('Es del cliente: úsalo')
    expect(p).toContain('Es contexto sobre cómo se presenta hoy el cliente, no una obligación')
    expect(p).toContain('proponer otra mejor, libremente')
    expect(p).toContain('no necesitan justificarse')
    expect(p).not.toMatch(/es un HECHO de la marca|no una opción|lo cambies en silencio|rotulada como PROPUESTA/i)
  })
  it('si la fuente es el dueño, manda (palabra del dueño) y puede sugerir variantes rotuladas', async () => {
    for (const fuente of ['Declarado por el dueño', 'dueno · manual']) {
      const p = await b4(nuevoPlan, [carpeta({ eslogan: { texto: 'Frase X', fuente } })])
      expect(p).toContain('Esta frase la declaró el dueño: manda')
      expect(p).toContain('Puedes sugerir variantes como propuesta')
      expect(p).not.toContain('no una obligación')
    }
  })
  it('el bloque va antes de la carpeta, después del registro, y solo una vez', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: ESLOGAN })])
    expect(p.split('UNA FRASE QUE EL CLIENTE USA').length).toBe(2)
    expect(p.indexOf('UNA FRASE QUE EL CLIENTE USA')).toBeLessThan(p.indexOf('LA CARPETA DEL CLIENTE (completa'))
    expect(p.indexOf('EL MANUAL DE MARCA APROBADO')).toBeLessThan(p.indexOf('UNA FRASE QUE EL CLIENTE USA'))
  })
  it('el eslogan con carpeta ilegible/sin resumen igual llega (no depende de que haya informes)', async () => {
    const p = await b4(nuevoPlan, [{ brazo: 'cerebro', estado: 'trajo', objetivo: 'cerebro', datos: { contexto_del_cliente: { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], eslogan: ESLOGAN } } }])
    expect(p).toContain('«Cuando tengas esa hambre de... Náufrago te espera!»')
  })
  it('sin fuente: dice «no declarada», sin romper (y no es del dueño)', async () => {
    const p = await b4(nuevoPlan, [carpeta({ eslogan: { texto: 'Frase X' } })])
    expect(p).toContain('Fuente: no declarada')
    expect(p).toContain('no una obligación')
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
  it('solo cambian «[BB] Fan-out prep», «[BB] Consolidador», «[BB] Judge · run-sdk» (partes 1, 2 y 3) y, con «pedir cambios al manual» (02-nov), «Validate Deal Data» y «[BB] Promote prep»', () => {
    expect(cambiados(vivoManual, nuevoManual)).toEqual(['Validate Deal Data', '[BB] Consolidador', '[BB] Fan-out prep', '[BB] Judge · run-sdk', '[BB] Promote prep'])
  })
  it('frase hallada: el código YA NO escribe tagline ni lo marca como hecho; las propuestas del editor no se tocan', async () => {
    const b = await consolidar(nuevoManual, HALLADA)
    expect('tagline' in b).toBe(false)
    expect(b._field_meta.tagline).toBeUndefined()
    expect(b.tagline_opciones).toEqual(['Una propuesta'])
  })
  it('con o sin frase hallada (no hallado, ambigua, ausente, vacía, enorme) el borrador tiene los mismos campos que sin materia: la frase no cambia nada', async () => {
    for (const m of [HALLADA, { estado_frase_propia: 'no_hallado' }, { estado_frase_propia: 'ambigua', frase_propia: 'Dos candidatas' }, null, undefined, { estado_frase_propia: 'hallado', frase_propia: ' \n ' }, { estado_frase_propia: 'hallado', frase_propia: 'x'.repeat(900) }]) {
      const b = await consolidar(nuevoManual, m), hoy = await consolidar(nuevoManual, null)
      expect(b.tagline).toBeUndefined()
      expect(Object.keys(b).sort()).toEqual(Object.keys(hoy).sort())
    }
  })
  it('el Consolidador no menciona la frase propia como hecho: el código del nodo no trae esa lógica', () => {
    const c = nuevoManual.nodes.find((n: any) => n.name === '[BB] Consolidador').parameters.jsCode as string
    expect(c).not.toMatch(/Frase propia del cliente hallada en su sitio y su perfil social/)
    expect(c).not.toMatch(/_meta\.tagline\s*=/)
  })

})
