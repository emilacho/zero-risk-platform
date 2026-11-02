/**
 * 02-nov · EQUIPO DEL MANUAL · (d) `content-creator` ESCRIBE la voz y `editor-en-jefe` la REVISA (SEÑAL-LENOVO 13:27Z · ADENDAS de Emilio: sin reglas duras).
 * US$ 0, sin red: se ejecuta el CÓDIGO REAL de los nodos (pedido de revisión, anotar, «¿usó lo disponible?», rescate) con un simulador de HTTP.
 * Fija: quién contesta cada llamada, el camino nuevo (pedido → ¿se revisa? → llamada → anotar → «¿usó…?»), que el revisor ASESORA (solo blocker/major vuelven al escritor, tope 1),
 * que una revisión caída o ilegible NO detiene la corrida, que sin revisión todo queda IDÉNTICO a hoy, y que la red de rescate busca/reintenta al empleado real de la casilla.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
import { REVISION } from '../scripts/ops/oficina-marketing/voz-content-creator-manual.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nuevo = leer('nuevo')
const vivo = leer('vivo')
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)
const codigo = (f: any, n: string): string => nodo(f, n).parameters.jsCode
const USO = '[BB] Uso · ¿usó lo disponible?'
const REPETIR_SI = '[BB] Uso · ¿hay que repetir la voz?'
const REPETIR_HTTP = '[BB] Uso · pedir la voz otra vez (editor-en-jefe)'
const JUDGE_PREP = '[BB] Judge prep'
const LENTE = 'Lente · editor-en-jefe'
const destinos = (f: any, de: string, salida = 0) => (f.connections[de]?.main?.[salida] ?? []).map((x: any) => x.node)

const VOZ = 'Cercana y directa, habla de tú, usa el humor de la costa y nombra los platos por su nombre de siempre.'
const grounding = { discovery_summary: 'x'.repeat(200), icp_signals: { segments: ['familias'] }, competitors: [{ n: 1 }], materia_cliente: { sitio_estado: 'trajo', sitio_texto: 's'.repeat(400), instagram_estado: 'trajo', instagram_propio: 'i'.repeat(300) } }
const borrador = (extra: Record<string, unknown> = {}) => ({ client_id: 'c-1', positioning: 'p'.repeat(80), icp_summary: 'i'.repeat(80), voice_description: VOZ, personalidad: ['cercana'], tagline_opciones: ['a'], mensajes_clave: ['m'], forbidden_words: ['barato'], required_terminology: [], ...extra })
const entrada = (extra: Record<string, unknown> = {}, d: Record<string, unknown> = {}) => ({ brand_book_draft: borrador(d), _grounding_refs: grounding, _fidelity_cycle: 1, cycle: 0, ...extra })
const PREVIOS = { 'Validate Deal Data': [{ client_id: 'c-1' }], '[BB] Fan-out prep': [{ tasks: { 'editor-en-jefe': 'TAREA-ORIGINAL-DE-LA-VOZ' } }] }

/** pedido → ¿se revisa? → (llamada → anotar) → ¿usó lo disponible? → ¿repetir? ; se detiene ANTES de la vuelta al escritor y del juez */
async function cadena(item: Record<string, unknown>, respuesta: any, llamadas: any[] = []) {
  return recorrer(nuevo, REVISION.pedido, item, {
    previos: PREVIOS,
    hasta: [REPETIR_HTTP, JUDGE_PREP],
    http: async (url, _h, cuerpo) => { llamadas.push({ url, cuerpo }); if (respuesta instanceof Error) throw respuesta; return respuesta },
  })
}
const ok = (obj: unknown) => ({ statusCode: 200, body: { response: JSON.stringify(obj) } })
const OBS = (severidad: string) => ({ veredicto: 'ajustar', observaciones: [{ campo: 'voice_description', severidad, observacion: 'dice algo que el cliente no dijo', sugerencia: 'mirar la cita' }] })

describe('quién contesta cada llamada', () => {
  it('la lente de la casilla de la voz y «pedir la voz otra vez» las contesta content-creator; el revisor es editor-en-jefe', () => {
    for (const n of [LENTE, REPETIR_HTTP]) {
      const c = String(nodo(nuevo, n).parameters.jsonBody)
      expect(c).toContain('"agent": "content-creator",')
      expect(c).toMatch(/"lens": "content-creator"/)
      expect(c).not.toContain('"agent": "editor-en-jefe"')
    }
    const rev = String(nodo(nuevo, REVISION.http).parameters.jsonBody)
    expect(rev).toContain('"agent": "editor-en-jefe"')
    expect(rev).toContain('"step_name": "bb-voz-revision"')
    expect(rev).not.toContain('brand_book_lens')   // el revisor no usa la herramienta de secciones: asesora en texto
    expect(rev).toContain('workflow_execution_id')
    expect(nodo(nuevo, REVISION.http).parameters.options.timeout).toBe(800000)
  })
  it('lo demás de las lentes sigue como hoy: brand-strategist y jefe-client-success no cambian de empleado', () => {
    for (const n of ['Lente · brand-strategist', 'Lente · jefe-client-success']) expect(nodo(nuevo, n).parameters.jsonBody.replace(/\n {2}\{\{ \(function[^\n]*\n/, '\n')).toContain('"agent": "' + n.replace('Lente · ', '') + '"')
    expect(codigo(nuevo, '[BB] Fan-out prep')).toContain("{ lens: 'editor-en-jefe', agent: 'content-creator',")
  })
  it('el camino nuevo: Consolidador → pedido → ¿se revisa? → llamada → anotar → «¿usó…?» (y el «no se revisa» salta a «¿usó…?»)', () => {
    expect(destinos(nuevo, '[BB] Consolidador')).toEqual([REVISION.pedido])
    expect(destinos(vivo, '[BB] Consolidador')).toEqual([USO])
    expect(destinos(nuevo, REVISION.pedido)).toEqual([REVISION.si])
    expect(destinos(nuevo, REVISION.si, 0)).toEqual([REVISION.http])
    expect(destinos(nuevo, REVISION.si, 1)).toEqual([USO])
    expect(destinos(nuevo, REVISION.http)).toEqual([REVISION.anotar])
    expect(destinos(nuevo, REVISION.anotar)).toEqual([USO])
  })
  it('hay un solo lugar donde el editor-en-jefe llama: la revisión (ya no escribe la voz en ningún nodo)', () => {
    const llamadas = nuevo.nodes.filter((n: any) => n.type.endsWith('httpRequest') && /"agent": "editor-en-jefe"/.test(String(n.parameters.jsonBody))).map((n: any) => n.name)
    expect(llamadas).toEqual([REVISION.http])
  })
})

describe('el borrador: la voz se rotula con quien la escribió', () => {
  it('«mezclar la voz» rotula lente: content-creator', () => {
    expect(codigo(nuevo, '[BB] Uso · mezclar la voz')).toContain("lente: 'content-creator', reintento_uso: true")
    expect(codigo(nuevo, '[BB] Uso · mezclar la voz')).not.toContain("lente: 'editor-en-jefe'")
  })
  it('el Consolidador rotula personalidad, tagline_opciones y mensajes_clave con content-creator; mision/proposito/propuestas siguen con jefe-client-success', () => {
    const c = codigo(nuevo, '[BB] Consolidador')
    for (const k of ['personalidad', 'tagline_opciones', 'mensajes_clave']) expect(c).toMatch(new RegExp(`_nuevo\\(editor, '${k}',\\s+'content-creator',`))
    expect(c).not.toMatch(/_nuevo\(editor, '[a-z_]+',\s+'editor-en-jefe'/)
    expect(c).toMatch(/_nuevo\(cs,\s+'mision',\s+'jefe-client-success'/)
  })
})

describe('la revisión asesora (código real)', () => {
  it('primera pasada con voz y evidencia: se pide la revisión; el pedido NO manda reescribir y deja la decisión al escritor; lleva la voz y la evidencia', async () => {
    const llamadas: any[] = []
    const r = await cadena(entrada(), ok({ veredicto: 'ok', observaciones: [] }), llamadas)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].cuerpo.agent).toBe('editor-en-jefe')
    const t = llamadas[0].cuerpo.task as string
    expect(t).toContain('NO la escribes ni la reescribes')
    expect(t).toContain('decide qué integra')
    expect(t).toContain(VOZ)
    expect(t).toContain('discovery_summary')
    expect(t).toMatch(/la creatividad es libre/)
    expect(t).not.toMatch(/debes|obligatori|tal cual|siempre incluye/i)
    expect(r.pasos).toEqual([REVISION.pedido, REVISION.si, REVISION.http, REVISION.anotar, USO, REPETIR_SI, JUDGE_PREP])
  })
  it('segunda pasada, sin voz o sin evidencia: NO se llama a nadie y sigue como hoy', async () => {
    for (const item of [entrada({ _fidelity_cycle: 2 }), entrada({}, { voice_description: '' }), entrada({ _grounding_refs: {} })]) {
      const llamadas: any[] = []
      const r = await cadena(item, ok({ veredicto: 'ok', observaciones: [] }), llamadas)
      expect(llamadas).toHaveLength(0)
      expect(r.pasos[2]).toBe(USO)
    }
  })
  it('la evidencia entra ENTERA por clave o no entra, y lo que no cupo se declara (nunca un JSON partido)', async () => {
    const llamadas: any[] = []
    await cadena(entrada({ _grounding_refs: { ...grounding, apify_sources: ['z'.repeat(20000)] } }), ok({ veredicto: 'ok', observaciones: [] }), llamadas)
    const t = llamadas[0].cuerpo.task as string
    expect(t).toContain('(no cupo: apify_sources)')
    expect(t.length).toBeLessThan(14000)
    const ev = t.slice(t.lastIndexOf('\n') + 1)
    expect(() => JSON.parse(ev)).not.toThrow()
  })
})

describe('lo que vuelve del revisor (código real)', () => {
  it('solo blocker y major vuelven al escritor (por el camino de repetir la voz, que ya tiene tope 1); minor se anota y NO obliga', async () => {
    for (const sev of ['blocker', 'major']) {
      const r = await cadena(entrada(), ok(OBS(sev)))
      expect(r.item._voz_revision.bloquea).toHaveLength(1)
      expect(r.item._uso_repetir_voz).toBe(true)
      expect(r.pasos.slice(-2)).toEqual([REPETIR_SI, REPETIR_HTTP])
      expect(r.item._uso_pedido_voz).toContain('TAREA-ORIGINAL-DE-LA-VOZ')
      expect(r.item._uso_pedido_voz).toContain('OBSERVACIONES DEL REVISOR')
      expect(r.item._uso_pedido_voz).toContain('tú decides qué integrar y qué no')
      expect(r.item._uso_pedido_voz).not.toContain('REPARO')   // la voz no estaba vacía: no es el reparo de la vara de uso
    }
    const m = await cadena(entrada(), ok(OBS('minor')))
    expect(m.item._voz_revision.observaciones).toHaveLength(1)
    expect(m.item._voz_revision.bloquea).toEqual([])
    expect(m.item._uso_repetir_voz).toBe(false)
    expect(m.ultimo).toBe(JUDGE_PREP)
  })
  it('tope 1: en la segunda pasada una observación grave ya no vuelve al escritor', async () => {
    const r = await recorrer(nuevo, USO, { ...entrada({ _fidelity_cycle: 2 }), _voz_revision: { corrio: true, observaciones: [], bloquea: [{ campo: 'voice_description', severidad: 'blocker', observacion: 'x', sugerencia: '' }] } }, { previos: PREVIOS, hasta: [REPETIR_HTTP, JUDGE_PREP] })
    expect(r.item._uso_repetir_voz).toBe(false)
  })
  it('la voz vacía (vara de uso) y una observación grave piden UNA sola vuelta con las dos cosas, y el pedido cabe en 15.900', async () => {
    const item = entrada({}, { voice_description: 'PENDIENTE' })
    const r = await cadena(item, ok(OBS('major')))
    expect(r.item._uso_repetir_voz).toBe(true)
    expect(r.item._uso_pedido_voz).toContain('REPARO')
    expect(r.item._uso_pedido_voz).toContain('OBSERVACIONES DEL REVISOR')
    const largo = await recorrer(nuevo, USO, { ...item, _voz_revision: { corrio: true, observaciones: [], bloquea: [{ campo: 'voice_description', severidad: 'major', observacion: 'o'.repeat(400), sugerencia: 's'.repeat(300) }] } }, { previos: { ...PREVIOS, '[BB] Fan-out prep': [{ tasks: { 'editor-en-jefe': 't'.repeat(16000) } }] }, hasta: [REPETIR_HTTP, JUDGE_PREP] })
    expect(largo.item._uso_pedido_voz.length).toBeLessThanOrEqual(15900)
    expect(largo.item._uso_pedido_voz).toContain('OBSERVACIONES DEL REVISOR')
  })
  it('revisión caída, vacía o ilegible: la corrida SIGUE, no inventa observaciones y lo declara', async () => {
    for (const resp of [{ statusCode: 500, body: {} }, { statusCode: 200, body: { response: 'no es json' } }, { statusCode: 200, body: { response: '{"veredicto":"ok"}' } }, { statusCode: 200, body: { response: '' } }]) {
      const r = await cadena(entrada(), resp)
      expect(r.item._voz_revision.corrio).toBe(false)
      expect(r.item._voz_revision.bloquea).toEqual([])
      expect(r.item._uso_repetir_voz).toBe(false)
      expect(r.ultimo).toBe(JUDGE_PREP)
    }
  })
  it('severidad desconocida cuenta como minor, se aceptan hasta 6 y se acotan los textos', async () => {
    const muchas = { veredicto: 'ajustar', observaciones: Array.from({ length: 9 }, (_, i) => ({ campo: 'voice_description', severidad: i === 0 ? 'urgentisimo' : 'minor', observacion: 'o'.repeat(900) + i, sugerencia: 's'.repeat(900) })) }
    const r = await cadena(entrada(), ok(muchas))
    const v = r.item._voz_revision
    expect(v.observaciones).toHaveLength(6)
    expect(v.observaciones[0].severidad).toBe('minor')
    expect(v.bloquea).toEqual([])
    expect(v.observaciones[0].observacion.length).toBeLessThanOrEqual(400)
    expect(v.observaciones[0].sugerencia.length).toBeLessThanOrEqual(300)
  })
  it('no toca el borrador: lo único que cambia respecto del item de entrada son las marcas de la revisión', async () => {
    const e = entrada()
    const r = await cadena(e, ok(OBS('minor')))
    expect(r.item.brand_book_draft).toEqual(e.brand_book_draft)
    expect(Object.keys(r.item).filter((k) => !(k in e)).sort()).toEqual(['_uso', '_uso_pedido_voz', '_uso_repetir_voz', '_voz_revisar', '_voz_revision', '_voz_revision_pedido'])
  })
})

describe('sin revisión, «¿usó lo disponible?» es IDÉNTICO a hoy', () => {
  it('mismos resultados que el vivo (repetir y pedido byte a byte) con voz buena, voz vacía y rotulo', async () => {
    for (const d of [{}, { voice_description: 'PENDIENTE' }, { voice_description: 'Cercana y directa, habla de tú, usa el humor de la costa y nombra los platos.' }]) {
      for (const g of [grounding, { discovery_summary: 'x'.repeat(200) }]) {
        const it = entrada({ _grounding_refs: g }, d)
        const a = await recorrer(vivo, USO, it, { previos: PREVIOS, hasta: [REPETIR_HTTP, JUDGE_PREP] })
        const b = await recorrer(nuevo, USO, it, { previos: PREVIOS, hasta: [REPETIR_HTTP, JUDGE_PREP] })
        expect(b.item._uso_repetir_voz).toBe(a.item._uso_repetir_voz)
        expect(b.item._uso_pedido_voz).toBe(a.item._uso_pedido_voz)
        expect(JSON.stringify(b.item._uso)).toBe(JSON.stringify(a.item._uso))
      }
    }
  })
  it('el bloque de la vara de uso (de CC1) queda byte a byte igual: solo cambia la cola del nodo', () => {
    const a = codigo(vivo, USO), b = codigo(nuevo, USO)
    const fin = '// ═══ fin del uso de lo disponible ═══'
    expect(b.slice(0, b.indexOf(fin))).toBe(a.slice(0, a.indexOf(fin)))
  })
})

describe('la red de rescate busca y reintenta al empleado real de la casilla', () => {
  it('la lectura de lo ya pagado pide content-creator (no editor-en-jefe)', () => {
    const url = String(nodo(nuevo, '[BB] Rescate · leer invocaciones').parameters.url)
    expect(url).toContain('agent_name=in.(brand-strategist,content-creator,jefe-client-success)')
    expect(url).not.toContain('editor-en-jefe')
  })
  it('red 1: una fila de la base de content-creator rescata la casilla «editor-en-jefe»; una de editor-en-jefe NO (ya no escribe esa sección)', async () => {
    const sec = (x: string) => ({ voice_description: x })
    const filas = (agent: string) => [{ agent_name: agent, metadata: { brand_section: sec('desde la base') } }]
    const previos = (agent: string) => ({ 'Validate Deal Data': [{ client_id: 'c-1' }], '[BB] Rescate · leer invocaciones': [filas(agent)], '[BB] Fan-out prep': [{ tasks: { 'brand-strategist': 'a', 'editor-en-jefe': 'b', 'jefe-client-success': 'c' } }], 'Lente · brand-strategist': [{ body: { brand_section: sec('bs') } }], 'Lente · jefe-client-success': [{ body: { brand_section: sec('cs') } }] })
    const bueno = await recorrer(nuevo, '[BB] Rescate · red 1 · triaje', {}, { previos: previos('content-creator'), hasta: ['[BB] Rescate · ¿falta alguna?'] })
    expect(bueno.item.secciones['editor-en-jefe']).toEqual(sec('desde la base'))
    expect(bueno.item.origen['editor-en-jefe']).toBe('rescate_base')
    const viejo = await recorrer(nuevo, '[BB] Rescate · red 1 · triaje', {}, { previos: previos('editor-en-jefe'), hasta: ['[BB] Rescate · ¿falta alguna?'] })
    expect(viejo.item._faltan).toEqual(['editor-en-jefe'])
    expect(viejo.item._task).toBe('b')
  })
  it('red 2: el reintento llama a content-creator para la casilla de la voz y a los demás por su nombre', () => {
    const crudo = String(nodo(nuevo, '[BB] Rescate · red 2 · leer lo ya pagado').parameters.jsonBody)
    const agente = (lente: string) => { const e = /\{\{\s*([^}]*\$json\._lente[^}]*)\}\}/.exec(crudo)![1]; return new Function('$json', `return (${e})`)({ _lente: lente }) }
    expect(agente('editor-en-jefe')).toBe('content-creator')
    expect(agente('brand-strategist')).toBe('brand-strategist')
    expect(agente('jefe-client-success')).toBe('jefe-client-success')
  })
  it('red 3: la respuesta del reintento de content-creator se atribuye a la casilla «editor-en-jefe» (y no se pierde ni se asigna a otra)', async () => {
    const triaje = { secciones: { 'brand-strategist': { a: 1 }, 'jefe-client-success': { c: 1 } }, origen: {}, _faltan: ['editor-en-jefe'], _lente: 'editor-en-jefe', client_id: 'c-1' }
    const r = await recorrer(nuevo, '[BB] Rescate · red 3 · fusionar o PARAR', { statusCode: 200, body: { agent: 'content-creator', brand_section: { voice_description: 'reintento' } } }, { previos: { '[BB] Rescate · red 1 · triaje': [triaje] }, hasta: ['[BB] Consolidador'] })
    expect(r.item.secciones['editor-en-jefe']).toEqual({ voice_description: 'reintento' })
    expect(r.item.origen['editor-en-jefe']).toBe('reintento')
    expect(Object.keys(r.item.secciones).sort()).toEqual(['brand-strategist', 'editor-en-jefe', 'jefe-client-success'])
  })
  it('red 3: con dos lentes faltantes y un solo reintento vivo, la respuesta de content-creator va a la casilla de la voz (no a la primera de la fila)', async () => {
    const triaje = { secciones: { 'jefe-client-success': { c: 1 } }, origen: {}, _faltan: ['brand-strategist', 'editor-en-jefe'], client_id: 'c-1' }
    const triajes = [{ ...triaje, _lente: 'brand-strategist' }, { ...triaje, _lente: 'editor-en-jefe' }]
    const r = await recorrer(nuevo, '[BB] Rescate · red 3 · fusionar o PARAR', { statusCode: 200, body: { agent: 'content-creator', brand_section: { voice_description: 'reintento' } } }, { previos: { '[BB] Rescate · red 1 · triaje': triajes }, hasta: ['[BB] Consolidador'] }).catch((e: Error) => e)
    // la de brand-strategist sigue faltando: PARA ruidoso, y dice cuál falta (la de la voz quedó atribuida bien)
    expect(String((r as Error).message)).toContain('LENTE_SIN_SECCION · brand-strategist')
    expect(String((r as Error).message)).not.toContain('editor-en-jefe,')
  })
})

describe('alcance', () => {
  it('este paso suma cuatro nodos de revisión y toca solo lo de la voz y el rescate (más lo de las partes anteriores del archivo acumulado)', () => {
    const v = new Set(vivo.nodes.map((n: any) => n.name))
    expect(nuevo.nodes.filter((n: any) => !v.has(n.name)).map((n: any) => n.name).sort()).toEqual(Object.values(REVISION).sort())
    expect(nuevo.nodes.length).toBe(vivo.nodes.length + 4)
  })
})
