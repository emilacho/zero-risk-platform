/** r71 · «Manual → Drive»: el documento temporal se borra de verdad y, si no, el flujo lo dice (código REAL de los nodos, simulando la respuesta de Drive). */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { construir, NODOS } from '../scripts/worker-staging/XTQTgIUMq9OHNs0a/construir-r71.mjs'

const antes = JSON.parse(fs.readFileSync('scripts/worker-staging/XTQTgIUMq9OHNs0a/manual-a-drive-ANTES-r71.json', 'utf8'))
const despues = construir(antes)
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)
/** evalúa el {{ … }} de una expresión de n8n con el `$` simulado */
const evalExpr = (expr: string, $: (n: string) => any) => expr.replace(/^=/, '').replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_m, e: string) => String(new Function('$', `return (${e})`)($)))
const subida = (json: unknown) => (n: string) => ({ first: () => ({ json: n === 'Subir texto como documento' ? json : {} }) })

describe('la dirección del borrado', () => {
  it('rojo: tal como estaba, con la forma REAL de la salida de la subida ({ id }) borraba …/files/undefined', () => {
    expect(evalExpr(nodo(antes, NODOS.borrar).parameters.url, subida({ id: 'DOC123' }))).toContain('files/undefined')
  })
  it('verde: toma el id donde esté ({ id } o { body: { id } })', () => {
    expect(evalExpr(despues.nodes.find((n: any) => n.name === NODOS.borrar).parameters.url, subida({ id: 'DOC123' }))).toBe('https://www.googleapis.com/drive/v3/files/DOC123')
    expect(evalExpr(nodo(despues, NODOS.borrar).parameters.url, subida({ body: { id: 'DOC456' } }))).toBe('https://www.googleapis.com/drive/v3/files/DOC456')
  })
  it('pide la respuesta COMPLETA (código de estado) sin cortar el flujo si Drive responde un error', () => {
    expect(nodo(despues, NODOS.borrar).parameters.options.response.response).toEqual({ fullResponse: true, neverError: true })
    expect(nodo(despues, NODOS.borrar).parameters.method).toBe('DELETE')
  })
})

describe('«Verificar que el PDF esta» dice la verdad', () => {
  const corre = (flujo: any, patch: unknown, borrado: unknown) => {
    const datos: Record<string, any> = { 'Nombre y carpeta del PDF': patch, 'Carpeta definitiva': { folder_id: 'F1', folder_reusada: false, client_name: 'Cliente X' }, 'Borrar el documento intermedio': borrado }
    const $ = (n: string) => ({ first: () => { if (!(n in datos)) throw new Error('sin ejecutar ' + n); return { json: datos[n] } } })
    return (new Function('$', nodo(flujo, NODOS.verificar).parameters.jsCode)($) as Array<{ json: any }>)[0].json
  }
  const pdf = { id: 'P1', name: 'Manual de Marca · X', webViewLink: 'https://drive.test/p1' }
  it('rojo: antes, con el temporal SIN borrar (404) igual salía ok:true («Salió bien»)', () => {
    const j = corre(antes, pdf, { statusCode: 404, body: '<html>' })
    expect(j.ok).toBe(true)
  })
  it('verde: PDF con nombre + Drive contesta 204 ⇒ ok; también 200', () => {
    for (const codigo of [204, 200]) expect(corre(despues, pdf, { statusCode: codigo })).toMatchObject({ ok: true, pdf_ok: true, intermedio_borrado: true, codigo_borrado: codigo, motivo: null, file_id: 'P1', folder_id: 'F1' })
  })
  it('el temporal NO se borró (404, 403, 500, sin código, o el nodo ni corrió): ok:false, el PDF sigue contando como bueno y el motivo lo dice', () => {
    for (const b of [{ statusCode: 404 }, { statusCode: 403 }, { statusCode: 500 }, { body: '<html>404</html>' }, undefined]) {
      const j = corre(despues, pdf, b)
      expect(j.ok, JSON.stringify(b)).toBe(false); expect(j.pdf_ok).toBe(true); expect(j.intermedio_borrado).toBe(false); expect(j.motivo).toMatch(/PDF quedo en Drive pero el documento temporal NO se borro/)
    }
    expect(corre(despues, pdf, { statusCode: 404 }).motivo).toContain('404'); expect(corre(despues, pdf, { body: 'x' }).motivo).toContain('sin codigo')
  })
  it('sin PDF con nombre: ok:false con su motivo de siempre', () => {
    const j = corre(despues, { error: 'x' }, { statusCode: 204 })
    expect(j).toMatchObject({ ok: false, pdf_ok: false, motivo: 'Drive no devolvio el archivo con nombre' })
  })
})

describe('el aviso', () => {
  const texto = (j: Record<string, unknown>) => JSON.parse(String(new Function('$json', `return (${/\{\{\s*([\s\S]*?)\s*\}\}\s*$/.exec(nodo(despues, NODOS.campana).parameters.jsonBody)![1]})`)(j))).text as string
  it('PDF presente y temporal sin borrar: lo dice así (no «no llegó a Drive»)', () => {
    const t = texto({ pdf_ok: true, motivo: 'el PDF quedo en Drive pero …', client_name: 'X' })
    expect(t).toMatch(/PDF del manual quedo en Drive/); expect(t).toMatch(/\(temporal\)/); expect(t).not.toMatch(/no llego a Drive/)
  })
  it('PDF ausente: el aviso de siempre', () => {
    const t = texto({ pdf_ok: false, motivo: 'la subida fallo', client_name: 'X' })
    expect(t).toMatch(/El manual no llego a Drive/); expect(t).toMatch(/se reintenta/)
  })
})

describe('solo cambian esos tres nodos', () => {
  it('conexiones y ajustes idénticos; los otros 13 nodos, byte a byte', () => {
    const cambiados = despues.nodes.filter((n: any, i: number) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n: any) => n.name).sort()
    expect(cambiados).toEqual([NODOS.borrar, NODOS.campana, NODOS.verificar].sort())
    expect(JSON.stringify(despues.connections)).toBe(JSON.stringify(antes.connections))
    expect(() => construir(despues)).toThrow(/ya no es el de antes/)
  })
})
