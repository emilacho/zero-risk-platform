/**
 * Ronda 73 · Drive: (1) el plan/documentos no dejan «(temporal)» ni «Untitled» y, si el borrado falla, el flujo lo dice · (2) el PDF no sale como markdown crudo.
 * Flujos reales (respaldos ANTES de hoy); el plan es el REAL del paso 2.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construir, CODIGO_DE_VERIFICAR, CARPETA, NODOS, URL_DE_BORRADO, CUERPO_DE_CAMPANA } from '../scripts/worker-staging/rXR5GmnrGF6Dkwgq/construir-r73.mjs'
import { construirFlujo as aMd, construirCodigo as aMdCodigo, FUNCION, NODO as NODO_MD } from '../scripts/worker-staging/rXR5GmnrGF6Dkwgq/construir-r73-md.mjs'
import { construirFlujo as soloCarpeta } from '../scripts/worker-staging/XTQTgIUMq9OHNs0a/construir-r73.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown; settings?: Record<string, unknown> }
const D = join(process.cwd(), 'scripts/worker-staging/rXR5GmnrGF6Dkwgq')
const leer = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Flujo
const ANTES = leer(join(D, 'texto-a-drive-r73-ANTES.json')), HOY = leer(join(D, 'texto-a-drive-r73-ARREGLADO.json'))
const ANTES_MD = leer(join(D, 'texto-a-drive-r73-md-ANTES.json')), HOY_MD = leer(join(D, 'texto-a-drive-r73-md-ARREGLADO.json'))
const MANUAL_ANTES = leer(join(process.cwd(), 'scripts/worker-staging/XTQTgIUMq9OHNs0a/manual-a-drive-r73-ANTES.json')), MANUAL_HOY = leer(join(process.cwd(), 'scripts/worker-staging/XTQTgIUMq9OHNs0a/manual-a-drive-r73-ARREGLADO.json'))
const PLAN = readFileSync(join(process.cwd(), '__tests__/fixtures/ronda73/plan-52529141.md'), 'utf8')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const cambian = (a: Flujo, b: Flujo) => a.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(b, n.name))).map((n) => n.name)
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

describe('«(temporal)»: el borrado funciona y, si falla, se dice', () => {
  it('rojo (antes): la dirección usa solo body.id (la subida no trae body ⇒ …/files/undefined) y la verificación solo mira el PDF', () => {
    expect(nodo(ANTES, NODOS.borrar).parameters.url).toContain("json.body || {}).id }}"); expect(nodo(ANTES, NODOS.borrar).parameters.url).not.toContain('.json.id')
    expect(String(nodo(ANTES, NODOS.verificar).parameters.jsCode)).not.toContain('intermedio_borrado')
  })
  it('verde: toma el id donde esté, pide la respuesta completa y cambian SOLO los cuatro nodos previstos', () => {
    expect(nodo(HOY, NODOS.borrar).parameters.url).toBe(URL_DE_BORRADO)
    expect(nodo(HOY, NODOS.borrar).parameters.options.response.response).toEqual({ fullResponse: true, neverError: true })
    expect(cambian(ANTES, HOY).sort()).toEqual([NODOS.borrar, NODOS.campana, NODOS.carpeta, NODOS.verificar].sort())
    expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
  })
  async function verificar(opts: { pdf: boolean; borrado: number | 'sin_nodo' }) {
    const fn = new AsyncFunction('$', CODIGO_DE_VERIFICAR)
    const $ = (n: string) => {
      if (n === 'Nombre y carpeta del PDF') return { first: () => ({ json: opts.pdf ? { id: 'f1', name: 'Plan', webViewLink: 'u' } : {} }) }
      if (n === 'Carpeta definitiva') return { first: () => ({ json: { folder_id: 'c1', folder_reusada: true, client_name: 'Cliente' } }) }
      if (n === 'Borrar el documento intermedio') { if (opts.borrado === 'sin_nodo') throw new Error('sin nodo'); return { first: () => ({ json: { statusCode: opts.borrado } }) } }
      throw new Error('nodo ' + n)
    }
    return (await fn($))[0].json as Record<string, any>
  }
  it('PDF + temporal borrado (204 o 200) ⇒ ok', async () => {
    for (const c of [204, 200]) expect(await verificar({ pdf: true, borrado: c })).toMatchObject({ ok: true, pdf_ok: true, intermedio_borrado: true, codigo_borrado: c, motivo: null })
  })
  it('PDF pero el temporal NO se borró (404, 403, sin código) ⇒ ok falso y el motivo lo dice', async () => {
    for (const c of [404, 403]) { const r = await verificar({ pdf: true, borrado: c }); expect(r).toMatchObject({ ok: false, pdf_ok: true, intermedio_borrado: false }); expect(r.motivo).toContain('temporal NO se borro'); expect(r.motivo).toContain(String(c)) }
    const s = await verificar({ pdf: true, borrado: 'sin_nodo' }); expect(s.ok).toBe(false); expect(s.motivo).toContain('sin codigo')
  })
  it('sin PDF ⇒ ok falso, aunque el temporal sí se haya borrado', async () => {
    expect(await verificar({ pdf: false, borrado: 204 })).toMatchObject({ ok: false, pdf_ok: false, motivo: 'Drive no devolvio el archivo con nombre' })
  })
  it('la campana distingue «el PDF quedó pero el cierre no salió limpio» de «no llegó a Drive»', () => {
    const cuerpo = (j: Record<string, unknown>) => JSON.parse(new Function('$json', 'return ' + CUERPO_DE_CAMPANA.slice(3, -2))(j)).text as string
    expect(cuerpo({ pdf_ok: true, motivo: 'm', client_name: 'C' })).toContain('el cierre no salio limpio'); expect(cuerpo({ pdf_ok: false, motivo: 'm', client_name: 'C' })).toContain('no llego a Drive')
  })
  it('se reconstruye igual desde el respaldo y no se aplica a ciegas si el flujo cambió', () => {
    expect(JSON.stringify(construir({ ...ANTES, name: 'x' } as any).nodes)).toBe(JSON.stringify(HOY.nodes))
    const roto = JSON.parse(JSON.stringify(ANTES)); nodo(roto, NODOS.borrar).parameters.url = 'otra'
    expect(() => construir(roto)).toThrow(/ya no es el de antes/)
  })
})

describe('«Untitled» de 0 bytes: «Crear carpeta si no existe» ya no crea nada cuando la carpeta existe', () => {
  const evalua = (expr: string, json: Record<string, unknown>) => new Function('$json', 'return ' + expr.slice(3, -2))(json)
  it('rojo (antes): con carpeta hallada hacía POST /files con cuerpo {} ⇒ un archivo sin nombre en la raíz', () => {
    const p = nodo(ANTES, NODOS.carpeta).parameters
    expect(p.method).toBe('POST'); expect(p.url).toBe('https://www.googleapis.com/drive/v3/files?fields=id'); expect(p.jsonBody).toContain("$json.folder_id ? '{}'")
  })
  it('verde: con carpeta hallada es un GET de ESA carpeta, sin cuerpo; sin carpeta, el POST de siempre con el cuerpo de la carpeta', () => {
    const p = nodo(HOY, NODOS.carpeta).parameters
    expect(p).toMatchObject(CARPETA)
    const con = { folder_id: 'F1', client_name: 'Cliente' }, sin = { folder_id: null, client_name: 'Cliente' }
    expect(evalua(p.method, con)).toBe('GET'); expect(evalua(p.method, sin)).toBe('POST')
    expect(evalua('=' + '{{ ' + p.url.slice(1).replace(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files/, "'https://www.googleapis.com/drive/v3/files' + ").replace(/\{\{ (.*?) \}\}\?fields=id/, "($1) + '?fields=id'") + ' }}', con)).toBe('https://www.googleapis.com/drive/v3/files/F1?fields=id')
    expect(evalua(p.sendBody, con)).toBe(false); expect(evalua(p.sendBody, sin)).toBe(true)
    expect(JSON.parse(evalua(p.jsonBody, sin))).toMatchObject({ name: 'Cliente', mimeType: 'application/vnd.google-apps.folder' })
  })
  it('el flujo del manual recibe el mismo arreglo y SOLO ese nodo cambia', () => {
    expect(cambian(MANUAL_ANTES, MANUAL_HOY)).toEqual([NODOS.carpeta]); expect(nodo(MANUAL_HOY, NODOS.carpeta).parameters).toMatchObject(CARPETA)
    expect(JSON.stringify(soloCarpeta(MANUAL_ANTES as any).nodes)).toBe(JSON.stringify(MANUAL_HOY.nodes))
    expect(() => soloCarpeta(HOY as any)).toThrow(/ya no es el de antes/)
  })
})

describe('el PDF del plan deja de salir como markdown crudo', () => {
  const md = new Function(FUNCION + '\nreturn markdownATexto')() as (t: unknown) => string
  it('el plan REAL: sin almohadillas de título, sin ** , sin rayas, sin barras de tabla, sin escapes', () => {
    const t = md(PLAN)
    expect(t).not.toMatch(/^#/m); expect(t).not.toMatch(/^\s*---/m); expect(t).not.toMatch(/^\s*\|/m); expect(t).not.toMatch(/\\[#*_|!]/); expect(t).not.toMatch(/`/)
    expect((t.match(/\*\*/g) ?? []).length).toBeLessThanOrEqual(1) // un ** huérfano viene de una fila cortada del propio plan
    expect(t).toContain('PLAN DE CAMPAÑA 90 DÍAS · NÁUFRAGO'); expect(t).toContain('LAS CUATRO PUERTAS · antes de proponer nada'); expect(t).toContain('Rating Google Maps · 4,8 / 5 · 25 reseñas')
  })
  it.each([
    ['## Título\ntexto', 'Título\ntexto\n'], ['antes\n## Título', 'antes\n\nTítulo\n'], ['**negrita** y __otra__', 'negrita y otra\n'], ['*cursiva* aquí', 'cursiva aquí\n'], ['a\n\n---\n\nb', 'a\n\nb\n'],
    ['- uno\n* dos\n+ tres', '• uno\n• dos\n• tres\n'], ['| a | b |\n|---|---|\n| 1 | 2 |', 'a · b\n1 · 2\n'], ['mira `código` y \\*esto\\* y ficha\\_mapa', 'mira código y *esto* y ficha_mapa\n'],
    ['[sitio](https://x.test/a)', 'sitio (https://x.test/a)\n'], ['> cita', 'cita\n'], ['```\n# no es título\n```', '# no es título\n'], ['a\n\n\n\n\nb', 'a\n\nb\n'], ['2 * 3 = 6', '2 * 3 = 6\n'],
  ])('%j', (e, s) => { expect(md(e)).toBe(s) })
  it('vacío y nulo no revientan', () => { expect(md('')).toBe('\n'); expect(md(null)).toBe('\n') })
  it('el nodo «Leer el pedido»: SOLO ese cambia; el texto que entra al documento sale sin marcado y los datos del pedido siguen igual', async () => {
    expect(cambian(ANTES_MD, HOY_MD)).toEqual([NODO_MD]); expect(JSON.stringify(HOY_MD.connections)).toBe(JSON.stringify(ANTES_MD.connections))
    const salida = async (f: Flujo) => (await new AsyncFunction('$input', String(nodo(f, NODO_MD).parameters.jsCode))({ first: () => ({ json: { body: { client_id: 'c', client_name: 'Cliente', nombre: 'Plan', texto: PLAN } } }) }))[0].json
    const [a, d] = [await salida(ANTES_MD), await salida(HOY_MD)]
    expect(a.texto).toMatch(/^#/m); expect(d.texto).not.toMatch(/^#/m); expect(d).toMatchObject({ hay: true, client_id: 'c', client_name: 'Cliente', nombre: 'Plan', motivo: null }); expect(d.caracteres).toBe(d.texto.length)
    const vacio = (await new AsyncFunction('$input', String(nodo(HOY_MD, NODO_MD).parameters.jsCode))({ first: () => ({ json: { body: { client_id: 'c', client_name: 'Cliente', texto: '' } } }) }))[0].json
    expect(vacio.hay).toBe(false); expect(vacio.motivo).toContain('texto')
  })
  it('no se aplica a ciegas ni dos veces', () => {
    expect(() => aMdCodigo('const x = 1')).toThrow(/aparece 0 veces/); expect(() => aMdCodigo(String(nodo(HOY_MD, NODO_MD).parameters.jsCode))).toThrow(/ya tiene markdownATexto/)
    expect(JSON.stringify(aMd({ ...ANTES_MD } as any).nodes)).toBe(JSON.stringify(HOY_MD.nodes))
  })
})
