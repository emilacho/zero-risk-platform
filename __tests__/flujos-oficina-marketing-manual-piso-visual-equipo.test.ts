/**
 * 02-nov · EQUIPO DEL MANUAL · (c2) PISO VISUAL: `design-visual-storyteller` lo escribe y `style-consistency-reviewer` lo REVISA (SEÑAL-LENOVO 13:27Z · firma de Emilio 01-nov).
 * US$ 0, sin red: se ejecuta el CÓDIGO REAL de los nodos nuevos con un simulador de HTTP; el nodo de CC1 («Piso visual») se compara letra por letra contra el vivo.
 * Fija: del nodo de CC1 solo cambian el empleado y la espera de la llamada; el revisor asesora (no reescribe, no detiene, no cambia nada salvo dejar su hallazgo en
 * `visual.revision_de_estilo`); sin parte visual o sin voz no se llama a nadie; una revisión caída o ilegible no detiene la corrida; el resto del borrador queda igual.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
import { ESTILO } from '../scripts/ops/oficina-marketing/piso-visual-equipo-manual.mjs'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const nuevo = leer('nuevo')
const vivo = leer('vivo')
const nodo = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)
const codigo = (f: any, n: string): string => nodo(f, n).parameters.jsCode
const PISO = '[BB] Piso visual (antes del Promote · CC#1)'
const SACAR = '[BB] Sacar lo sin fuente (antes del Promote)'
const destinos = (f: any, de: string, salida = 0) => (f.connections[de]?.main?.[salida] ?? []).map((x: any) => x.node)

const VISUAL = { version: 2, estado: 'completo', capa_grafica: { paleta: [{ hex: '#0b3c5d', rol: 'principal' }], tipografias: [{ nombre: 'Montserrat', rol: 'titulo' }] }, reglas: { fotos: 'luz natural' }, capa_producto: { platos: ['ceviche'] }, muestra: { fotos_miradas: 6 } }
const borrador = (extra: Record<string, unknown> = {}, visual: any = VISUAL) => ({ client_id: 'c-1', positioning: 'p', icp_summary: 'i', vision: 'v', mision: 'm', proposito: 'pr', propuestas_de_valor: ['x'], voice_description: 'Cercana y directa, habla de tú.', personalidad: ['cálida'], tagline_opciones: ['t'], mensajes_clave: ['m1'], forbidden_words: ['barato'], required_terminology: [], ...(visual ? { visual } : {}), ...extra })
const entrada = (d: Record<string, unknown> = {}, visual: any = VISUAL) => ({ brand_book_draft: borrador(d, visual), fidelity: { score: 0.9 }, cycle: 1 })
const PREVIOS = { 'Validate Deal Data': [{ client_id: 'c-1' }] }
const ok = (obj: unknown) => ({ statusCode: 200, body: { response: JSON.stringify(obj) } })
const HALLAZGO = { output_index: 1, surface: 'manual-voz', axis: 'voice_fidelity', severity: 'medium', issue: 'la voz es cálida y las reglas visuales piden frialdad corporativa', suggested_fix: 'alinear el tono de las reglas de foto', evidence: ['luz natural', 'habla de tú'] }
const REVISION_OK = { verdict: 'revision_needed', severity: 'medium', cascade_summary: 'dos partes se contradicen', findings: [HALLAZGO], open_questions: [] }

async function cadena(item: Record<string, unknown>, respuesta: any, llamadas: any[] = []) {
  return recorrer(nuevo, ESTILO.pedido, item, {
    previos: PREVIOS, hasta: [SACAR],
    http: async (url, _h, cuerpo) => { llamadas.push({ url, cuerpo }); if (respuesta instanceof Error) throw respuesta; return respuesta },
  })
}

describe('el nodo del piso visual (de CC1): solo cambian el empleado y la espera', () => {
  it('deshaciendo esos dos cambios, el código es EXACTAMENTE el del vivo', () => {
    const c = codigo(nuevo, PISO)
    expect(c).toContain("agent: 'design-visual-storyteller',")
    expect(c).toContain('timeout: 300000,')
    expect(c).not.toContain("agent: 'jefe-marketing'")
    const atras = c.replace("agent: 'design-visual-storyteller',", "agent: 'jefe-marketing',").replace('method: \'POST\', json: true, timeout: 300000,', 'method: \'POST\', json: true, timeout: 120000,')
    expect(atras).toBe(codigo(vivo, PISO))
  })
  it('sigue SIN client_id y sin la palanca de vuelta por el corredor (R5 de CC1; contesta directo)', () => {
    const c = codigo(nuevo, PISO)
    const cuerpo = c.slice(c.indexOf('body: {'), c.indexOf("context: { role: 'visual_floor' }"))
    expect(cuerpo).not.toMatch(/client_id\s*:/)
    expect(cuerpo).not.toMatch(/callback_mode/)
    expect(cuerpo).toContain('images_mode')
  })
})

describe('el camino de la revisión de estilo', () => {
  it('piso → pedido → ¿se revisa? → llamada → anotar → «Sacar lo sin fuente» (y «no se revisa» salta directo)', () => {
    expect(destinos(vivo, PISO)).toEqual([SACAR])
    expect(destinos(nuevo, PISO)).toEqual(['[BB] Equipo · logo y tipografía'])   // ADENDA 1: logo y tipografía se escriben en el piso, antes de la revisión
    expect(destinos(nuevo, '[BB] Equipo · logo y tipografía')).toEqual([ESTILO.pedido])
    expect(destinos(nuevo, ESTILO.pedido)).toEqual([ESTILO.si])
    expect(destinos(nuevo, ESTILO.si, 0)).toEqual([ESTILO.http])
    expect(destinos(nuevo, ESTILO.si, 1)).toEqual([SACAR])
    expect(destinos(nuevo, ESTILO.http)).toEqual([ESTILO.anotar])
    expect(destinos(nuevo, ESTILO.anotar)).toEqual([SACAR])
  })
  it('la llamada es de style-consistency-reviewer, con el libro y la atribución de siempre, y lleva el tope de gasto de «Pedir cambios»', () => {
    const b = String(nodo(nuevo, ESTILO.http).parameters.jsonBody)
    for (const k of ['"agent": "style-consistency-reviewer"', '"step_name": "bb-estilo-revision"', '_estilo_revision_pedido', 'brand_book_style_review', 'workflow_execution_id', 'max_budget_usd']) expect(b, k).toContain(k)
    expect(b).not.toContain('brand_book_lens')
    expect(nodo(nuevo, ESTILO.http).parameters.options.timeout).toBe(800000)
  })
})

describe('el pedido (código real)', () => {
  it('con parte visual y voz: se llama UNA vez al revisor con las tres partes, asesorando, y no pide reescribir ni aprobar', async () => {
    const llamadas: any[] = []
    const r = await cadena(entrada(), ok({ verdict: 'approved', findings: [] }), llamadas)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].cuerpo.agent).toBe('style-consistency-reviewer')
    const t = llamadas[0].cuerpo.task as string
    for (const k of ['brand-strategist', 'content-creator', 'design-visual-storyteller', 'manual-estrategia', 'manual-voz', 'manual-visual', 'ASESORAS', 'no reescribes', 'cita el fragmento literal', 'Lo de gusto']) expect(t, k).toContain(k)
    expect(t).not.toMatch(/debes|obligatori|tal cual/i)
    expect(t).toContain('Cercana y directa')
    expect(t).toContain('#0b3c5d')
    expect(r.pasos).toEqual([ESTILO.pedido, ESTILO.si, ESTILO.http, ESTILO.anotar, SACAR])
  })
  it('sin parte visual, con el visual ausente o sin voz: NO se llama a nadie, sigue directo y declara por qué', async () => {
    const casos: Array<[Record<string, unknown>, string]> = [
      [entrada({}, null), 'no hay parte visual que comparar'],
      [entrada({}, { version: 2, estado: 'ausente', motivo: 'sin fotos' }), 'no hay parte visual que comparar'],
      [entrada({ voice_description: '' }), 'no hay voz que comparar'],
    ]
    for (const [item, motivo] of casos) {
      const llamadas: any[] = []
      const r = await cadena(item, ok({ verdict: 'approved', findings: [] }), llamadas)
      expect(llamadas).toHaveLength(0)
      expect(r.pasos).toEqual([ESTILO.pedido, ESTILO.si, SACAR])
      expect(r.item._estilo_revision).toEqual({ corrio: false, motivo })
      expect(r.item.brand_book_draft).toEqual(item.brand_book_draft)
    }
  })
  it('lo visual entra ENTERO por clave o no entra, y lo que no cupo se declara (nunca un JSON partido)', async () => {
    const llamadas: any[] = []
    await cadena(entrada({}, { ...VISUAL, capa_producto: { platos: ['x'.repeat(13000)] } }), ok({ verdict: 'approved', findings: [] }), llamadas)
    const t = llamadas[0].cuerpo.task as string
    expect(t).toContain('no cupo en lo visual: capa_producto')
    expect(t).not.toContain('xxxxxxxxxx')
    const json = t.slice(t.indexOf('\n\nSALIDAS (') + 2).split('\n').slice(1).join('\n')
    expect(() => JSON.parse(json)).not.toThrow()
  })
})

describe('lo que vuelve del revisor (código real)', () => {
  it('queda en visual.revision_de_estilo (recortado) y NADA más del borrador cambia', async () => {
    const e = entrada()
    const r = await cadena(e, ok({ ...REVISION_OK, findings: [HALLAZGO, ...Array.from({ length: 9 }, () => ({ ...HALLAZGO, issue: 'i'.repeat(900), suggested_fix: 's'.repeat(900), evidence: ['e1', 'e2', 'e3', 'e4'] }))] }))
    const rev = r.item.brand_book_draft.visual.revision_de_estilo
    expect(rev).toMatchObject({ corrio: true, veredicto: 'revision_needed', severidad: 'medium', resumen: 'dos partes se contradicen' })
    expect(rev.hallazgos).toHaveLength(6)
    expect(rev.hallazgos[0]).toMatchObject({ superficie: 'manual-voz', eje: 'voice_fidelity', severidad: 'medium', evidencia: ['luz natural', 'habla de tú'] })
    expect(rev.hallazgos[1].problema.length).toBeLessThanOrEqual(400); expect(rev.hallazgos[1].arreglo.length).toBeLessThanOrEqual(300); expect(rev.hallazgos[1].evidencia).toHaveLength(3)
    const sinRev = JSON.parse(JSON.stringify(r.item.brand_book_draft)); delete sinRev.visual.revision_de_estilo
    expect(sinRev).toEqual(e.brand_book_draft)
    expect(r.item.fidelity).toEqual(e.fidelity)   // Promote prep necesita el resto del objeto intacto
    expect(r.item.cycle).toBe(1)
  })
  it('asesora: ni un hallazgo grave detiene la corrida ni cambia el camino', async () => {
    const r = await cadena(entrada(), ok({ verdict: 'escalated', severity: 'critical', cascade_summary: 'x', findings: [{ ...HALLAZGO, severity: 'critical' }] }))
    expect(r.ultimo).toBe(SACAR)
    expect(r.item._estilo_revision.veredicto).toBe('escalated')
  })
  it('revisión caída, vacía o ilegible: la corrida SIGUE, no inventa hallazgos y lo declara en el manual', async () => {
    for (const resp of [{ statusCode: 500, body: {} }, { statusCode: 200, body: { response: 'no es json' } }, { statusCode: 200, body: { response: '{"otra":1}' } }, { statusCode: 200, body: { response: '' } }]) {
      const r = await cadena(entrada(), resp)
      expect(r.ultimo).toBe(SACAR)
      expect(r.item._estilo_revision.corrio).toBe(false)
      expect(r.item._estilo_revision.hallazgos).toEqual([])
      expect(r.item.brand_book_draft.visual.revision_de_estilo.corrio).toBe(false)
    }
  })
  it('lo que el revisor no declara no se inventa: veredicto y severidad ausentes se rotulan como no declarados; severidad de hallazgo desconocida cuenta como la más baja', async () => {
    const r = await cadena(entrada(), ok({ findings: [{ ...HALLAZGO, severity: 'urgentisimo' }] }))
    expect(r.item._estilo_revision).toMatchObject({ corrio: true, veredicto: 'no_declarado', severidad: 'no_declarada' })
    expect(r.item._estilo_revision.hallazgos[0].severidad).toBe('low')
  })
})

describe('alcance', () => {
  it('suma cuatro nodos de revisión de estilo y no toca ningún otro nodo fuera del piso (el piso solo cambia en esas dos líneas)', () => {
    const v = new Set(vivo.nodes.map((n: any) => n.name))
    expect(nuevo.nodes.filter((n: any) => !v.has(n.name) && n.name.startsWith('[BB] Estilo ·')).map((n: any) => n.name).sort()).toEqual(Object.values(ESTILO).sort())
  })
})

// ─────────── reserva 4 de CC3: la revisión de estilo NO se pierde en «Sacar lo sin fuente» (puerta REAL de M2 con base falsa)
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { rutaRecomprobar } from '../src/lib/manual/rutas'
import { filaInstagram, filaSitio } from '../src/lib/manual/__tests__/apoyo'
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
describe('la revisión de estilo sobrevive a «Sacar lo sin fuente»', () => {
  it('visual.revision_de_estilo llega entera al Promote aunque su texto hable de origen verificable (la capa visual no es prosa del autor)', async () => {
    const C = '96864e88-79bc-47ff-8f8e-5bf88610ec7d'
    const db = new DbFalsa()
    db.semilla('clients', [{ id: C, name: 'Cliente de práctica', website_url: 'https://www.clinicaejemplo.test', country: 'EC', config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
    db.semilla('apify_raw', [filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'x', text: 'Ceviche todos los días.' }]), filaInstagram('i1', 'clinicaejemplo', 'hola')].map((f: any) => ({ ...f, client_id: C, ensayo: false, created_at: '2026-10-10' })))
    db.semilla('client_icp_documents', [])
    const revision = { corrio: true, veredicto: 'revision_needed', severidad: 'medium', resumen: 'el origen verificable de la voz choca con reglas frías', hallazgos: [{ superficie: 'manual-voz', eje: 'voice_fidelity', severidad: 'medium', problema: 'denominación de origen implícita', arreglo: 'x', evidencia: ['origen costero verificable'] }], preguntas: [] }
    const draft = { client_id: C, positioning: 'p', voice_description: 'Voz directa y conversacional.', visual: { ...VISUAL, revision_de_estilo: revision } }
    const httpRequest = async (o: { url: string; body: any }) => {
      if (o.url.endsWith('/api/manual/recomprobar')) { const r = await rutaRecomprobar(db as never, o.body); if (r.status !== 200) throw new Error(String(r.status)); return r.body }
      if (o.url.endsWith('/rest/v1/client_historical_outputs')) return {}
      throw new Error('url no prevista ' + o.url)
    }
    const $ = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: { client_id: C } }) } }
    const fn = new AsyncFunction('$', '$json', '$env', '$execution', codigo(nuevo, SACAR))
    const out = (await fn.call({ helpers: { httpRequest } }, $, { brand_book_draft: draft, fidelity: { pass: true }, cycle: 1 }, { ZERO_RISK_API_URL: 'https://app.test', INTERNAL_API_KEY: 'k', SUPABASE_SERVICE_ROLE_KEY: 's' }, { id: '999003' })) as Array<{ json: any }>
    expect(out[0].json.brand_book_draft._sacar.estado).not.toBe('no_se_pudo')
    expect(out[0].json.brand_book_draft.visual.revision_de_estilo).toEqual(revision)
  })
})
