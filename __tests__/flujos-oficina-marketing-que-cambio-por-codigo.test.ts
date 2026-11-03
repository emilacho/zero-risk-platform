/**
 * 01-nov · «QUÉ CAMBIÓ» POR CÓDIGO · parte de CC2 del punto 6 de CC1. US$ 0, sin red; se ejecuta el CÓDIGO REAL de «JEF · plan · el plan de guardado» y «JEF · plan · armar B / C».
 * Fija: si `elegir_version` devuelve `textos_a_guardar[S]` (texto no vacío), ESE es el `content` / `content_text` de la fila; si no (ausente, vacío, no texto, otra versión), se guarda lo de hoy, idéntico al flujo ya aplicado.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
import { sinFraseSedes } from './_sin-frase-sedes'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const nuevo = sinFraseSedes(leer('nuevo')), aplicado = leer('aplicado')
const sig = (f: any, nodo: string): string => f.connections[nodo].main[0][0].node
const GUARDADO = 'JEF · plan · el plan de guardado'
const TEXTO_B = 'PLAN B\n## Qué cambió (versión 2)\n- pidió Guayaquil'
const TEXTO_C = 'PLAN C\n## Qué cambió (versión 3)\n- pidió X'

const procesadas = { B: { texto: 'PLAN B DEL MODELO', caracteres: 17, estado_del_plan: 'ok', pendientes: null }, C: { texto: 'PLAN C DEL MODELO', caracteres: 17, estado_del_plan: 'ok', pendientes: null } }
const cuerpoElegir = (extra: Record<string, unknown>) => ({ statusCode: 200, body: { accion: 'versiones_elegidas', adoptada: 'A', plan_de_guardado: { guardar: [{ etiqueta: 'B', version: 2, version_de: 'A' }, { etiqueta: 'C', version: 3, version_de: 'B' }], solo_en_la_traza: [] }, ...extra } })
const guardado = async (f: any, extra: Record<string, unknown>) => {
  const r = await recorrer(f, GUARDADO, cuerpoElegir(extra), { previos: { 'JEF · plan · evaluar': [{ jef: { revision_id: 'r-1' }, id_de_a: 'a-1', client_id: 'c-1', procesadas }], 'JEF · plan · armar la elección': [{ tags: {} }] }, hasta: [sig(f, GUARDADO)] })
  return r.historial[GUARDADO][0]
}
const armar = async (f: any, S: 'B' | 'C', est: any) => {
  const nodo = `JEF · plan · armar ${S}`
  const r = await recorrer(f, nodo, {}, {
    previos: { [GUARDADO]: [est], 'Guardar el plan': [{ body: [{ provenance_tag: { v: 1 } }] }], 'Redactor · elegir': [{ redactor_elegido: 'redactor-x' }], 'JEF · plan · guardar B': [{ statusCode: 201, body: [{ id: 'b-1', provenance_tag: { v: 2 } }] }] },
    hasta: [sig(f, nodo)],
  })
  return r.historial[nodo][0]
}
const EST = (extra: Record<string, unknown> = {}) => ({ jef: { revision_id: 'r-1' }, id_de_a: 'a-1', client_id: 'c-1', procesadas, tags: {}, guardar: [{ etiqueta: 'B', version: 2, version_de: 'A' }, { etiqueta: 'C', version: 3, version_de: 'B' }], ...extra })

describe('«el plan de guardado» deja pasar los textos', () => {
  it('con textos_a_guardar objeto: pasan tal cual; ausente o no objeto: {}', async () => {
    expect((await guardado(nuevo, { textos_a_guardar: { B: TEXTO_B, C: TEXTO_C } })).textos_a_guardar).toEqual({ B: TEXTO_B, C: TEXTO_C })
    for (const t of [undefined, null, 'x', ['a'], 7]) expect((await guardado(nuevo, { textos_a_guardar: t })).textos_a_guardar).toEqual({})
  })
  it('lo demás de la salida es el de hoy', async () => {
    const a = await guardado(aplicado, {}), n = await guardado(nuevo, { textos_a_guardar: { B: TEXTO_B } })
    const { textos_a_guardar, ...resto } = n
    expect(resto).toEqual(a)
    expect(textos_a_guardar).toEqual({ B: TEXTO_B })
  })
})

describe('«armar B / C» guarda el texto con «Qué cambió» por código', () => {
  it.each(['B', 'C'] as const)('%s: con texto, ese es content y content_text, y caracteres describe ese texto', async (S) => {
    const t = S === 'B' ? TEXTO_B : TEXTO_C
    const r = await armar(nuevo, S, EST({ textos_a_guardar: { B: TEXTO_B, C: TEXTO_C } }))
    expect(r.fila_base.content).toBe(t)
    expect(r.fila_base.content_text).toBe(t)
    expect(r.tag_propio.caracteres).toBe(t.length)
  })
  it('cada versión toma el SUYO (B no recibe el de C)', async () => {
    expect((await armar(nuevo, 'B', EST({ textos_a_guardar: { C: TEXTO_C } }))).fila_base.content).toBe('PLAN B DEL MODELO')
    expect((await armar(nuevo, 'C', EST({ textos_a_guardar: { B: TEXTO_B } }))).fila_base.content).toBe('PLAN C DEL MODELO')
  })
  it.each(['B', 'C'] as const)('%s: sin texto útil (ausente, vacío, espacios, no texto) la fila es IDÉNTICA a la del flujo ya aplicado', async (S) => {
    for (const tx of [undefined, {}, { [S]: '' }, { [S]: '   ' }, { [S]: 42 }, { [S]: null }, { [S]: ['x'] }]) {
      const est = EST(tx === undefined ? {} : { textos_a_guardar: tx })
      expect(await armar(nuevo, S, est)).toEqual(await armar(aplicado, S, EST()))
    }
  })
  it('lo demás de la fila (título, versión, padre, agente) no cambia con el texto', async () => {
    const con = await armar(nuevo, 'B', EST({ textos_a_guardar: { B: TEXTO_B } })), sin = await armar(aplicado, 'B', EST())
    expect({ ...con, fila_base: { ...con.fila_base, content: 0, content_text: 0 }, tag_propio: { ...con.tag_propio, caracteres: 0 } }).toEqual({ ...sin, fila_base: { ...sin.fila_base, content: 0, content_text: 0 }, tag_propio: { ...sin.tag_propio, caracteres: 0 } })
  })
})

describe('alcance', () => {
  it('frente al ya aplicado, este paso toca solo «el plan de guardado», «armar B» y «armar C» (y nada de conexiones)', () => {
    const c = nuevo.nodes.filter((n: any) => { const o = aplicado.nodes.find((x: any) => x.name === n.name); return o && JSON.stringify(o.parameters) !== JSON.stringify(n.parameters) }).map((n: any) => n.name)
    for (const n of [GUARDADO, 'JEF · plan · armar B', 'JEF · plan · armar C']) expect(c).toContain(n)
    const mios = new Set(['② ¿Es copia del plan anterior?', '② IF · ¿copia · reintentar?', '② IF · ¿copia · detener?', '② IF · ¿hay pedido de cambios?', '② Cambio · sin cambios reales', '② Resumen · sin cambios reales', '② Cable de vuelta · sin cambios reales', '② Cable · ¿volvió? · sin cambios reales'])
    const sinCopias = Object.fromEntries(Object.entries(nuevo.connections).filter(([k]) => !mios.has(k)).map(([k, v]: [string, any]) => [k, { main: v.main.map((g: any[]) => g.map((c) => (c.node === '② ¿Es copia del plan anterior?' ? { ...c, node: 'Guardar el plan' } : c))) }]))
    expect(sinCopias).toEqual(aplicado.connections)
  })
})
