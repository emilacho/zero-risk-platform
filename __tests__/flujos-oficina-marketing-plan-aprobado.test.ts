/**
 * 01-nov · PUNTOS 9a / 9b / 9c del encargo «errores del plan» (ADENDA 2 de Lenovo: «el único que cuenta es el que yo apruebo») · US$ 0, sin red; se ejecuta el CÓDIGO REAL de los nodos.
 *   9a · el brief lee el plan APROBADO (plan_aprobaciones.estado = aprobado, el último por decidido_en), nunca «el más reciente»; sin aprobado: real ⇒ se DETIENE, ensayo ⇒ último borrador ROTULADO; un error de la base no es «sin aprobar».
 *   9b · la jerarquía: dueño > plan aprobado > manual (la regla 4 del redactor ya no manda al manual) en brief y parte por filas.
 *   9c · la pieza no lee ningún plan (lee el parte ya escrito).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODO_DATOS } from '../scripts/ops/oficina-marketing/datos-del-negocio.mjs'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string, id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, `${id}.json`), 'utf8'))
const BRIEF = 'PQdIgbuFexuBsoh8', CADENA = 'BNXqlaX1oHSfZIpF', PIEZA = 'lVCLzxQCKNkd3uS0'
const brief = leer('nuevo', BRIEF), vivoBrief = leer('vivo', BRIEF)
const APROB = '② Cargar la aprobación del plan', CARGAR = '② Cargar plan vigente', GUARDA = '② GUARDA · sin plan se DETIENE', ARMAR = '③ Armar el cuerpo del redactor'
const SOBRE = '⓪ Sobre · llave · modo seco', GUARDA_MANUAL = '① GUARDA · sin manual aprobado se DETIENE'
const sig = (f: any, nodo: string): string => f.connections[nodo].main[0][0].node
const cambiados = (a: any, b: any) => b.nodes.filter((n: any) => { const o = a.nodes.find((x: any) => x.name === n.name); return !o || JSON.stringify(o.parameters) !== JSON.stringify(n.parameters) }).map((n: any) => n.name).sort()
const CERO = '00000000-0000-0000-0000-000000000000'

/** la URL que pediría «② Cargar plan vigente» según lo que contestó la aprobación y el modo */
const urlDelPlan = async (aprobacion: Record<string, unknown>, dry_run: boolean): Promise<string> => {
  let url = ''
  await recorrer(brief, CARGAR, {}, {
    previos: { [SOBRE]: [{ client_id: 'c-1', dry_run }], [APROB]: [aprobacion] },
    http: async (u) => { url = u; return { statusCode: 200, body: [] } },
    hasta: [GUARDA],
  })
  return url
}
const PREV = (extra: Record<string, unknown> = {}) => ({ client_id: 'c-1', dry_run: false, manual_id: 'm-1', ...extra })
const PLAN = (extra: Record<string, unknown> = {}) => ({ id: 'p-aprobado', created_at: '2026-10-30T00:00:00Z', title: 'Plan', content_text: 'TEXTO DEL PLAN', status: 'draft', ...extra })
const guarda = async (aprobacion: Record<string, unknown>, planes: Record<string, unknown>[], prev: Record<string, unknown> = PREV()) => {
  // el nodo recibe la fila que devolvió la consulta del plan (una, o el ítem vacío si no hubo)
  const entrada = planes[0] ?? {}
  const r = await recorrer(brief, GUARDA, entrada, { previos: { [GUARDA_MANUAL]: [prev], [APROB]: [aprobacion] }, hasta: [sig(brief, GUARDA)] })
  return r.historial[GUARDA][0]
}

describe('alcance', () => {
  it('el Brief suma el nodo de la aprobación y cambia el GET del plan, su guarda y el armado; nada más frente al flujo sin esta parte', () => {
    expect(brief.nodes.length).toBe(vivoBrief.nodes.length + 2) // la aprobación del plan y la lectura única (adenda 3)
    const c = cambiados(vivoBrief, brief)
    for (const n of [APROB, CARGAR, GUARDA, ARMAR]) expect(c).toContain(n)
  })
  it('el nodo nuevo va entre la guarda del manual y la carga del plan', () => {
    expect(sig(brief, GUARDA_MANUAL)).toBe(NODO_DATOS)
    expect(sig(brief, NODO_DATOS)).toBe(APROB)
    expect(sig(brief, APROB)).toBe(CARGAR)
  })
  it('la parte por filas NO suma nodos de aprobación (ya lee el plan de su campaña por id) y recibe la jerarquía', () => {
    const c = leer('nuevo', CADENA)
    expect(c.nodes.some((n: any) => n.name === APROB)).toBe(false)
    const a = c.nodes.find((n: any) => n.name === ARMAR).parameters.jsCode as string
    expect(a).toContain('JERARQUÍA DE FUENTES')
  })
})

describe('9a · el nodo de la aprobación', () => {
  it('pide la última fila aprobada del cliente (estado aprobado, por decidido_en)', () => {
    const u = brief.nodes.find((n: any) => n.name === APROB).parameters.url as string
    expect(u).toContain('/rest/v1/plan_aprobaciones?')
    expect(u).toContain('estado=eq.aprobado')
    expect(u).toContain('order=decidido_en.desc')
    expect(u).toContain('limit=1')
    expect(u).toMatch(/client_id=eq\.\{\{ \$\('⓪ Sobre · llave · modo seco'\)\.first\(\)\.json\.client_id \}\}/)
  })
  it('un error de la base se deja pasar al nodo (no se descarta) y la consulta no tiene credenciales pegadas', () => {
    const n = brief.nodes.find((x: any) => x.name === APROB)
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.alwaysOutputData).toBe(true)
    expect(JSON.stringify(n)).not.toMatch(/eyJ|sk-|service_role_key_pegada/)
  })
})

describe('9a · qué plan se pide', () => {
  it('con plan aprobado: pide ESE id, aunque haya un borrador más nuevo', async () => {
    const u = await urlDelPlan({ plan_id: 'p-aprobado', version: 1 }, false)
    expect(u).toContain('&id=eq.p-aprobado&')
    expect(u).toContain('limit=1')
  })
  it('real sin aprobado: pide un id que no existe (nunca el más reciente)', async () => {
    const u = await urlDelPlan({}, false)
    expect(u).toContain(`&id=eq.${CERO}`)
  })
  it('ensayo sin aprobado: el último borrador (sin filtro de id)', async () => {
    const u = await urlDelPlan({}, true)
    expect(u).not.toContain('&id=eq.')
    expect(u).toContain('order=created_at.desc')
  })
  it('ensayo CON aprobado: también el aprobado', async () => {
    expect(await urlDelPlan({ plan_id: 'p-aprobado' }, true)).toContain('&id=eq.p-aprobado&')
  })
})

describe('9a · la guarda del plan', () => {
  it('con plan aprobado: pasa, sin rótulo y con la versión aprobada', async () => {
    const r = await guarda({ plan_id: 'p-aprobado', version: 3 }, [PLAN()])
    expect(r.plan_id).toBe('p-aprobado')
    expect(r.plan_sin_aprobar).toBe(false)
    expect(r.plan_aprobado_version).toBe(3)
    expect(r.plan_texto).toBe('TEXTO DEL PLAN')
  })
  it('real sin aprobado: se DETIENE aunque la consulta traiga un borrador (nunca cae al más reciente)', async () => {
    await expect(guarda({}, [PLAN({ id: 'p-borrador' })])).rejects.toThrow(/BRIEF_PLAN_NO_APROBADO/)
    await expect(guarda({}, [])).rejects.toThrow(/BRIEF_PLAN_NO_APROBADO/)
  })
  it('ensayo sin aprobado: sigue con el borrador, ROTULADO', async () => {
    const r = await guarda({}, [PLAN({ id: 'p-borrador' })], PREV({ dry_run: true }))
    expect(r.plan_id).toBe('p-borrador')
    expect(r.plan_sin_aprobar).toBe(true)
    expect(r.plan_aprobado_version).toBeNull()
  })
  it('ensayo sin aprobado y sin ningún plan: se detiene por falta de plan', async () => {
    await expect(guarda({}, [], PREV({ dry_run: true }))).rejects.toThrow(/BRIEF_SIN_PLAN/)
  })
  it('aprobado en la tabla pero la fila del plan no existe: se detiene (BRIEF_SIN_PLAN)', async () => {
    await expect(guarda({ plan_id: 'p-fantasma' }, [])).rejects.toThrow(/BRIEF_SIN_PLAN/)
  })
  it('un error de la base al leer la aprobación NO es «sin aprobar»: se detiene con su motivo, en real y en ensayo', async () => {
    for (const falla of [{ error: { message: 'timeout de la base' } }, { error: 'caído' }, { code: '42P01', message: 'relation does not exist' }]) {
      for (const dry of [false, true]) await expect(guarda(falla, [PLAN()], PREV({ dry_run: dry }))).rejects.toThrow(/BRIEF_APROBACION_CONSULTA_FALLO/)
    }
  })
  it('un plan vacío sigue deteniendo', async () => {
    await expect(guarda({ plan_id: 'p-aprobado' }, [PLAN({ content_text: '   ' })])).rejects.toThrow(/BRIEF_PLAN_VACIO/)
  })
})

describe('9a · el pedido', () => {
  const armar = async (flujo: any, prevNombre: string, prev: Record<string, unknown>) => {
    const r = await recorrer(flujo, ARMAR, { name: 'Náufrago', country: 'Ecuador', config: {} }, {
      previos: { [prevNombre]: [{ client_id: 'c-1', dry_run: false, manual_id: 'm-1', manual_version: 2, manual_texto: 'TEXTO DEL MANUAL', manual_voz: { voice_description: 'Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {} }, forbidden_words: [], required_terminology: [], plan_id: 'p-1', plan_texto: 'TEXTO DEL PLAN', ...prev }] },
      hasta: [sig(flujo, ARMAR)],
    })
    return r.historial[ARMAR][0].cuerpo.task as string
  }
  const P = '② ¿Ya hay parte de este plan? · guarda'
  it('aprobado: el encabezado del plan es el de siempre', async () => {
    const t = await armar(brief, P, { plan_sin_aprobar: false })
    expect(t).toContain('════════ PLAN DE 90 DÍAS VIGENTE (id p-1) ════════')
    expect(t).not.toContain('BORRADOR SIN APROBAR')
  })
  it('sin aprobar (ensayo): el encabezado lo dice con todas sus letras', async () => {
    const t = await armar(brief, P, { plan_sin_aprobar: true })
    expect(t).toContain('PLAN DE 90 DÍAS VIGENTE (id p-1) · BORRADOR SIN APROBAR (ensayo: el dueño no lo ha aprobado; no es su plan)')
  })
  it('campo ausente (flujo sin esta parte en la guarda): el encabezado es el de siempre', async () => {
    expect(await armar(brief, P, {})).not.toContain('BORRADOR SIN APROBAR')
  })
})

describe('9b · la jerarquía de fuentes en brief y parte por filas', () => {
  it.each([BRIEF, CADENA])('%s: manda el plan aprobado sobre el manual; el choque se declara; lo del dueño gana incluso al plan', (id) => {
    const a = leer('nuevo', id).nodes.find((n: any) => n.name === ARMAR).parameters.jsCode as string
    expect(a).toContain('JERARQUÍA DE FUENTES: 1º lo que el dueño ordenó o declaró · 2º el plan que el dueño APROBÓ · 3º el manual de marca')
    expect(a).toContain('MANDA EL PLAN')
    expect(a).toContain('«se siguió el plan aprobado»')
    expect(a).toContain('Lo que el dueño declaró en el manual o en la carpeta como hecho suyo gana incluso al plan')
    expect(a).not.toContain('NO obedeces al plan')
    expect(a).not.toContain('en el brief usas lo que dice el manual.')
  })
  it.each([BRIEF, CADENA])('%s: el choque se sigue declarando en «contradicciones_plan_vs_manual»', (id) => {
    const a = leer('nuevo', id).nodes.find((n: any) => n.name === ARMAR).parameters.jsCode as string
    expect(a).toContain('DECLARAS el choque en «contradicciones_plan_vs_manual»')
  })
})

describe('9c · la pieza no lee ningún plan', () => {
  it('ningún nodo de la pieza consulta campaign_plan_90d ni plan_aprobaciones', () => {
    const f = leer('nuevo', PIEZA)
    for (const n of f.nodes) expect(JSON.stringify(n.parameters)).not.toMatch(/campaign_plan_90d|plan_aprobaciones/)
  })
  it('la pieza lee el parte ya escrito (campaign_brief_pack), no el plan', () => {
    const n = leer('nuevo', PIEZA).nodes.find((x: any) => x.name === '① Cargar el parte')
    expect(n.parameters.url).toContain('output_type=eq.campaign_brief_pack')
  })
})
