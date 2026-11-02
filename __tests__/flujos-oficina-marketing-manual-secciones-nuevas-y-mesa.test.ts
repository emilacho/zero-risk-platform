/**
 * 02-nov · ADENDA 1 del manual (secciones nuevas · mesa creativa · regla de proponer). Ejecuta el CÓDIGO REAL de los cuatro nodos nuevos con empleados falsos.
 * Garantías: cada sección tiene UN dueño · la mesa solo ve lo creativo y solo aporta · el creador integra · una llamada caída se declara y no detiene · un dato duro que no está en lo que se sabe del cliente
 * no queda como hecho (guarda por código) · lo propuesto sale rotulado y estampado · las 11 claves llegan al borrador · la puerta de «Sacar lo sin fuente» no borra las propuestas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EQUIPO, DUENOS } from '../scripts/ops/oficina-marketing/secciones-nuevas-y-mesa-manual.mjs'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { rutaRecomprobar } from '../src/lib/manual/rutas'
import { filaInstagram, filaSitio } from '../src/lib/manual/__tests__/apoyo'

const raiz = path.resolve(__dirname, '..', 'scripts/ops/oficina-marketing')
const nuevo = JSON.parse(fs.readFileSync(path.join(raiz, 'nuevo/ssLtwYPt7zxuvnM2.json'), 'utf8'))
const vivo = JSON.parse(fs.readFileSync(path.join(raiz, 'vivo/ssLtwYPt7zxuvnM2.json'), 'utf8'))
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const codigoDe = (n: string) => nuevo.nodes.find((x: any) => x.name === n).parameters.jsCode as string

type Llamada = { agent: string; step_name: string; task: string; context: any; max_budget_usd?: number; workflow_id: string }
type Respuesta = any | Error
const PIDE = 'emit_brand_section'
interface Cfg { reescritura?: any }
async function correr(nodoNombre: string, json: any, responder: (l: Llamada) => Respuesta, cfg: Cfg = {}) {
  const llamadas: Llamada[] = []
  const httpRequest = async (o: { url: string; body: Llamada }) => {
    if (!o.url.endsWith('/api/agents/run-sdk')) throw new Error('url no prevista ' + o.url)
    llamadas.push(o.body)
    const r = responder(o.body)
    if (r instanceof Error) throw r
    return r
  }
  const $ = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: { client_id: 'c-1', ...(cfg.reescritura ? { reescritura: cfg.reescritura } : {}) } }) } }
  const fn = new AsyncFunction('$', '$json', '$env', '$execution', codigoDe(nodoNombre))
  const out = (await fn.call({ helpers: { httpRequest } }, $, json, { ZERO_RISK_API_URL: 'https://app.test', INTERNAL_API_KEY: 'k' }, { id: '777' })) as Array<{ json: any }>
  return { out: out[0].json, llamadas }
}
const sec = (brand_section: any) => ({ body: { brand_section } })

const GROUNDING = {
  discovery_summary: 'Cevichería familiar en Olón. Abrimos de 9 a 17h. Tienda en Av. Principal 12. Llámanos al 0991234567.',
  materia_cliente: { sitio_estado: 'trajo', sitio_texto: 'Ceviche de camarón $8.50. Desde 2012 cocinamos con pescado del día.' },
  icp_signals: { segments: ['Familias locales'] },
}
const DRAFT = { client_id: 'c-1', positioning: 'Ceviche honesto del pescador al plato.', icp_summary: 'Familias locales y turistas.', voice_description: 'Voz directa y cercana.', personalidad: ['cercana'], mensajes_clave: ['Fresco cada día'], vision: 'v', productos: ['Ceviche'], sedes: ['Olón'] }
const base = (extra: any = {}) => ({ brand_book_draft: { ...DRAFT }, _grounding_refs: GROUNDING, _fidelity_cycle: 1, ...extra })

const respuestaAportes = (l: Llamada): Respuesta => {
  if (l.agent === 'content-creator') return sec({
    tono_por_canal: ['Instagram: cercano, con humor [propuesta del agente — su perfil es informal]', 'WhatsApp: directo y rápido, responde en minutos [propuesta del agente — razón]'],
    reglas_de_escritura: ['Frases cortas y tuteo [propuesta del agente — así habla en su perfil]'],
    valores: ['Frescura: pescado del día'], nunca_hace: ['Nunca esconde de dónde viene el pescado [propuesta del agente — razón]'],
    _field_meta: { valores: { fuente: 'sitio', razon: 'dicho en el sitio' } },
  })
  if (l.agent === 'brand-strategist') return sec({ historia_y_origen: 'Cocinan con pescado del día desde 2012. Fundaron el local con 3 socios en 1998 [propuesta del agente — razón]' })
  throw new Error('agente no previsto ' + l.agent)
}

describe('estructura del tramo', () => {
  const nombres = new Set(nuevo.nodes.map((n: any) => n.name))
  it('los cuatro nodos nuevos existen y el vivo no los tenía', () => {
    const v = new Set(vivo.nodes.map((n: any) => n.name))
    for (const n of Object.values(EQUIPO)) { expect(nombres.has(n)).toBe(true); expect(v.has(n)).toBe(false) }
  })
  it('sin enlaces rotos', () => {
    for (const [de, c] of Object.entries<any>(nuevo.connections)) { expect(nombres.has(de)).toBe(true); for (const g of c.main) for (const x of g) expect(nombres.has(x.node)).toBe(true) }
  })
  it('el tramo va ANTES del juez: las dos entradas de «Judge prep» desde la voz pasan por los aportes; el Lazo A sigue entrando directo', () => {
    const a = (de: string, salida = 0) => nuevo.connections[de].main[salida].map((x: any) => x.node)
    expect(a('[BB] Uso · mezclar la voz')).toEqual([EQUIPO.aportes])
    expect(a('[BB] Uso · ¿hay que repetir la voz?', 1)).toEqual([EQUIPO.aportes])
    expect(a(EQUIPO.aportes)).toEqual([EQUIPO.mesa]); expect(a(EQUIPO.mesa)).toEqual([EQUIPO.integra]); expect(a(EQUIPO.integra)).toEqual(['[BB] Judge prep'])
    expect(a('[BB] Execute Lazo A corrección')).toEqual(['[BB] Judge prep'])
  })
  it('logo y tipografía van en el piso: el piso pasa por ellos antes de la revisión de estilo', () => {
    expect(nuevo.connections['[BB] Piso visual (antes del Promote · CC#1)'].main[0].map((x: any) => x.node)).toEqual([EQUIPO.logo])
    expect(nuevo.connections[EQUIPO.logo].main[0].map((x: any) => x.node)).toEqual(['[BB] Estilo · pedido de revisión'])
  })
  it('una sección = un dueño (tabla del contrato)', () => {
    expect(DUENOS['content-creator']).toEqual({ tono_por_canal: 'lista', reglas_de_escritura: 'lista', valores: 'lista', nunca_hace: 'lista' })
    expect(Object.keys(DUENOS['brand-strategist'])).toEqual(['historia_y_origen'])
    expect(Object.keys(DUENOS['creative-director-mesa'])).toEqual(['direccion_de_fotografia'])
    expect(Object.keys(DUENOS['design-visual-storyteller']).sort()).toEqual(['jerarquia_tipografica', 'uso_del_logo'])
    const todos = Object.values(DUENOS).flatMap((d) => Object.keys(d)); expect(new Set(todos).size).toBe(todos.length)
  })
})

describe('1 · aportes de los dueños', () => {
  it('dos llamadas, a los dueños correctos, nombrando emit_brand_section, con la regla de proponer y bajo el techo', async () => {
    const { out, llamadas } = await correr(EQUIPO.aportes, base(), respuestaAportes)
    expect(llamadas.map((l) => l.agent).sort()).toEqual(['brand-strategist', 'content-creator'])
    for (const l of llamadas) {
      expect(l.task).toContain(PIDE); expect(l.task).toContain('PROPÓNLO'); expect(l.task).toContain('NUNCA se inventan'); expect(l.task.length).toBeLessThanOrEqual(15900)
      expect(l.workflow_id).toBe('777'); expect(l.step_name).toMatch(/^bb-equipo-aportes/)
    }
    const cc = llamadas.find((l) => l.agent === 'content-creator')!
    for (const k of ['tono_por_canal', 'reglas_de_escritura', 'valores', 'nunca_hace']) expect(cc.task).toContain(k)
    expect(cc.task).not.toContain('historia_y_origen')
    expect(llamadas.find((l) => l.agent === 'brand-strategist')!.task).not.toContain('tono_por_canal')
    expect(Object.keys(out._equipo.aportes.valores).sort()).toEqual(['historia_y_origen', 'nunca_hace', 'reglas_de_escritura', 'tono_por_canal', 'valores'])
  })
  it('cada dueño entrega SOLO lo suyo: lo que escriba de más se ignora', async () => {
    const { out } = await correr(EQUIPO.aportes, base(), (l) => (l.agent === 'content-creator' ? sec({ tono_por_canal: ['x'], historia_y_origen: 'invadió', positioning: 'pisó' }) : sec({ historia_y_origen: 'h', tono_por_canal: ['invadió'] })))
    expect(out._equipo.aportes.valores).toEqual({ tono_por_canal: ['x'], historia_y_origen: 'h' })
  })
  it('una llamada caída se DECLARA y la otra sigue; el borrador no se toca', async () => {
    const { out } = await correr(EQUIPO.aportes, base(), (l) => (l.agent === 'content-creator' ? new Error('timeout') : respuestaAportes(l)))
    expect(out._equipo.declarado.join(' ')).toMatch(/content-creator/)
    expect(Object.keys(out._equipo.aportes.valores)).toEqual(['historia_y_origen'])
    expect(out.brand_book_draft).toEqual(DRAFT)
  })
  it('una respuesta ilegible se declara, nunca se inventa', async () => {
    const { out } = await correr(EQUIPO.aportes, base(), () => ({ body: { response: 'no sé qué decir' } }))
    expect(out._equipo.declarado.length).toBe(2); expect(out._equipo.aportes.valores).toEqual({})
  })
  it('acepta el JSON dentro del texto y la forma {valor,fuente,confianza}', async () => {
    const { out } = await correr(EQUIPO.aportes, base(), (l) => (l.agent === 'content-creator' ? { body: { response: 'Aquí va: ' + JSON.stringify({ valores: { valor: ['Calidez'], fuente: 'sitio' }, tono_por_canal: ['Instagram: cálido'] }) } } : sec({ historia_y_origen: 'h' })))
    expect(out._equipo.aportes.valores.tono_por_canal).toEqual(['Instagram: cálido'])
    expect(out._equipo.aportes.valores.valores).toEqual(['Calidez'])
  })
  it('respeta el tope de gasto de «Pedir cambios» (dividido entre las llamadas) y no lo pone si no hay', async () => {
    const con = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: { tope_reescritura_usd: 8 } })
    expect(con.llamadas.every((l) => l.max_budget_usd === 1)).toBe(true)
    const sin = await correr(EQUIPO.aportes, base(), respuestaAportes)
    expect(sin.llamadas.every((l) => !('max_budget_usd' in l))).toBe(true)
  })
  it('con la evidencia más larga que el techo, la evidencia entra entera por clave o no entra y el pedido cabe', async () => {
    const enorme = { ...GROUNDING, competitors: Array.from({ length: 60 }, (_, i) => ({ name: 'Competidor ' + i, nota: 'x'.repeat(300) })) }
    const { llamadas, out } = await correr(EQUIPO.aportes, base({ _grounding_refs: enorme }), respuestaAportes)
    for (const l of llamadas) expect(l.task.length).toBeLessThanOrEqual(15900)
    expect(out._equipo.evidencia_omitida).toContain('competitors')
  })
  it('no corre dos veces', async () => {
    const { llamadas } = await correr(EQUIPO.aportes, base({ _equipo: { corrio: true } }), respuestaAportes)
    expect(llamadas).toHaveLength(0)
  })
})

describe('2 · mesa creativa', () => {
  const previo = { aportes: { valores: { tono_por_canal: ['Instagram: cálido'], reglas_de_escritura: ['Tutea'] }, meta: {} }, declarado: [] }
  const mesaOk = (): Respuesta => ({ body: { brand_section: { direccion_de_fotografia: ['Luz natural de mediodía [propuesta del agente — el local da al mar]'] }, response: JSON.stringify({ aportes: [
    { para: 'content-creator', campo: 'tono_por_canal', texto: 'Suma humor de mar en Instagram.' }, { para: 'piso_visual', campo: 'jerarquia_tipografica', texto: 'Titulares en cursiva marina.' }, { para: 'otro', campo: 'x', texto: 'va al piso por omisión' }, { para: 'content-creator', texto: '   ' } ] }) } })
  it('llama SOLO a creative-director-mesa, ve lo creativo y NO lo estratégico ni los datos', async () => {
    const { llamadas } = await correr(EQUIPO.mesa, base({ _equipo: previo }), mesaOk)
    expect(llamadas.map((l) => l.agent)).toEqual(['creative-director-mesa'])
    const tarea = llamadas[0].task
    expect(tarea).toContain(PIDE); expect(tarea).toContain('direccion_de_fotografia'); expect(tarea).toContain('Voz directa y cercana'); expect(tarea).toContain('Instagram: cálido')
    expect(tarea).not.toContain('Ceviche honesto del pescador')      // positioning
    expect(tarea).not.toContain('Familias locales y turistas')       // icp_summary
    expect(tarea).toContain('no reescribes')
  })
  it('lee la dirección de fotografía y los aportes (los vacíos se descartan; sin destino claro van al piso)', async () => {
    const { out } = await correr(EQUIPO.mesa, base({ _equipo: previo }), mesaOk)
    expect(out._equipo.aportes.valores.direccion_de_fotografia[0]).toContain('Luz natural')
    expect(out._equipo.mesa.aportes.map((a: any) => a.para)).toEqual(['content-creator', 'piso_visual', 'piso_visual'])
    expect(out._equipo.aportes.valores.tono_por_canal).toEqual(['Instagram: cálido'])   // no pisa lo de los dueños
  })
  it('si la mesa no responde fuera de una mesa, se DECLARA y la corrida sigue sin la fotografía', async () => {
    const { out } = await correr(EQUIPO.mesa, base({ _equipo: previo }), () => new Error('500'))
    expect(out._equipo.declarado.join(' ')).toMatch(/creative-director-mesa/); expect(out._equipo.mesa.corrio).toBe(false)
    expect(out._equipo.aportes.valores.direccion_de_fotografia).toBeUndefined()
  })
  it('respaldo: si solo viene el JSON en el texto, también se lee', async () => {
    const { out } = await correr(EQUIPO.mesa, base({ _equipo: previo }), () => ({ body: { response: JSON.stringify({ direccion_de_fotografia: ['Planos cortos'], aportes: [] }) } }))
    expect(out._equipo.aportes.valores.direccion_de_fotografia).toEqual(['Planos cortos'])
  })
})

describe('3 · integración y guarda de datos duros', () => {
  const eq = (aportes: any, mesaAportes: any[] = []) => ({ aportes: { valores: aportes, meta: {} }, mesa: { corrio: true, aportes: mesaAportes }, declarado: [] })
  it('sin aportes de la mesa NO hay llamada; el creador integra solo cuando hay aportes', async () => {
    const sin = await correr(EQUIPO.integra, base({ _equipo: eq({ tono_por_canal: ['Instagram: cálido'] }) }), () => { throw new Error('no debía llamar') })
    expect(sin.llamadas).toHaveLength(0); expect(sin.out._equipo.integracion).toBe('sin_aportes')
    const con = await correr(EQUIPO.integra, base({ _equipo: eq({ tono_por_canal: ['Instagram: cálido'], reglas_de_escritura: ['Tutea'] }, [{ para: 'content-creator', campo: 'tono_por_canal', texto: 'Suma humor.' }]) }),
      () => sec({ tono_por_canal: ['Instagram: cálido y con humor de mar [propuesta del agente — la mesa lo sugiere]'], reglas_de_escritura: ['Tutea'] }))
    expect(con.llamadas.map((l) => l.agent)).toEqual(['content-creator'])
    expect(con.llamadas[0].task).toContain('aportes, no órdenes'); expect(con.llamadas[0].task).toContain(PIDE)
    expect(con.out.brand_book_draft.tono_por_canal[0]).toContain('humor de mar'); expect(con.out._equipo.integracion).toBe('integrado')
  })
  it('si la integración cae, queda lo que había y se declara', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ tono_por_canal: ['Instagram: cálido'] }, [{ para: 'content-creator', campo: 'x', texto: 'y' }]) }), () => new Error('x'))
    expect(out.brand_book_draft.tono_por_canal).toEqual(['Instagram: cálido']); expect(out._equipo.integracion).toBe('no_se_pudo'); expect(out._equipo.declarado.join(' ')).toMatch(/integración/)
  })
  it('DATOS DUROS: teléfono, precio, hora o año que NO están en lo que se sabe del cliente se quitan; los que sí están se conservan', async () => {
    const aportes = { tono_por_canal: [
      'WhatsApp: escribe al 0987654321 [propuesta del agente — razón]',          // teléfono inventado
      'Atención: abrimos de 8 a 20h',                                            // horario que no está (en la evidencia es 9 a 17h)
      'Precios: ceviche a $12.00',                                               // precio inventado
      'Instagram: cercano y con humor [propuesta del agente — razón]',           // sin dato duro
    ], reglas_de_escritura: ['Llama al 0991234567 solo para pedidos'] }          // teléfono REAL (está en la evidencia)
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq(aportes) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.tono_por_canal).toEqual(['Instagram: cercano y con humor [propuesta del agente — razón]'])
    expect(out.brand_book_draft.reglas_de_escritura).toEqual(['Llama al 0991234567 solo para pedidos'])
    expect(out._equipo.guarda_datos_duros.map((q: any) => q.campo)).toEqual(['tono_por_canal', 'tono_por_canal', 'tono_por_canal'])
  })
  it('las cifras de la RAZÓN del rótulo no cuentan como dato duro', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ tono_por_canal: ['Instagram: cálido [propuesta del agente — publican a las 7pm todos los días desde 1999]'], historia_y_origen: 'Pescado del día desde 2012. [propuesta del agente — hay 5 posts que lo dicen]' }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.tono_por_canal).toHaveLength(1); expect(out.brand_book_draft.tono_por_canal[0]).toMatch(/^Instagram: cálido/)
    expect(out.brand_book_draft.historia_y_origen).toContain('desde 2012')
  })
  it('un campo que se queda sin nada dice PENDIENTE (falta el dato), no inventa ni queda vacío', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ nunca_hace: ['Nunca cobra más de $99.99 [propuesta del agente — razón]'] }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.nunca_hace).toHaveLength(1); expect(out.brand_book_draft.nunca_hace[0]).toMatch(/^PENDIENTE — falta el dato duro/)
    expect(out.brand_book_draft._field_meta.nunca_hace.estado).toBe('ausente')
  })
  it('historia y origen: TODA cifra no sostenida sale (años, socios); lo sostenido queda y el rótulo viaja', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ historia_y_origen: 'Cocinan con pescado del día desde 2012. Fundaron el local con 3 socios en 1998 [propuesta del agente — razón]' }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.historia_y_origen).toBe('Cocinan con pescado del día desde 2012. [propuesta del agente — razón]')
    expect(out._equipo.guarda_datos_duros[0]).toMatchObject({ campo: 'historia_y_origen' })
  })
  it('historia: una cifra que no es año ni precio («3 socios») también sale; en una regla de escritura la misma cifra es estilo y queda', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ historia_y_origen: 'Pescado del día desde 2012. Lo fundaron 3 socios.', reglas_de_escritura: ['Frases de máximo 3 líneas'] }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.historia_y_origen).toBe('Pescado del día desde 2012.')
    expect(out.brand_book_draft.reglas_de_escritura).toEqual(['Frases de máximo 3 líneas'])
  })
  it('un rango de horas con un extremo conocido y otro inventado («de 8 a 17h», la evidencia dice 9 a 17h) sale', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ tono_por_canal: ['Atención: de 8 a 17h [propuesta del agente — razón]', 'Atención: de 9 a 17h'] }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.tono_por_canal).toEqual(['Atención: de 9 a 17h'])
  })
  it('historia con todo inventado → PENDIENTE', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ historia_y_origen: 'Nació en 1987 con 5 hermanos.' }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.historia_y_origen).toMatch(/^PENDIENTE/)
  })
  it('lo propuesto queda estampado propuesta_del_agente; lo dicho por el cliente queda provisional sin rótulo; las 11 claves nuevas llegan al borrador', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({
      tono_por_canal: ['Instagram: cálido [propuesta del agente — razón]'], reglas_de_escritura: ['Tutea'], valores: ['Frescura: pescado del día'],
      nunca_hace: ['Nunca esconde el origen [propuesta del agente — razón]'], historia_y_origen: 'Pescado del día desde 2012.', direccion_de_fotografia: ['Luz natural [propuesta del agente — razón]'] }) }), () => { throw new Error('no') })
    const m = out.brand_book_draft._field_meta
    expect(m.tono_por_canal.estado).toBe('propuesta_del_agente'); expect(m.reglas_de_escritura.estado).toBe('provisional'); expect(m.valores.estado).toBe('provisional')
    expect(out.brand_book_draft.campos_con_propuesta_del_agente.sort()).toEqual(['direccion_de_fotografia', 'nunca_hace', 'tono_por_canal'])
    for (const k of ['tono_por_canal', 'reglas_de_escritura', 'valores', 'nunca_hace', 'historia_y_origen', 'direccion_de_fotografia']) expect(out.brand_book_draft[k]).toBeTruthy()
    for (const k of Object.keys(DRAFT)) expect(out.brand_book_draft[k]).toEqual((DRAFT as any)[k])    // nada de lo anterior se pierde
    expect(out._equipo.corrio).toBe(true); expect(out._equipo.aportes).toBeUndefined()
  })
  it('un manual sin ningún campo nuevo sale igual que hoy (más la marca de que el tramo corrió)', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: { aportes: { valores: {}, meta: {} }, declarado: ['x'] } }), () => { throw new Error('no') })
    expect(out.brand_book_draft).toEqual({ ...DRAFT, _field_meta: {} })
  })
})

describe('4 · logo y tipografía (en el piso)', () => {
  const conPiso = () => base({ _equipo: { corrio: true, declarado: [], aportes_piso: [{ para: 'piso_visual', campo: 'jerarquia_tipografica', texto: 'Titulares en cursiva marina.' }] },
    brand_book_draft: { ...DRAFT, visual: { estado: 'ok', capa_grafica: 'Azul marino y arena; logo circular con ancla', reglas: 'Sans humanista', capa_producto: 'x' } } })
  it('llama a design-visual-storyteller con lo OBSERVADO y los aportes de la mesa, y guarda sus dos campos', async () => {
    const { out, llamadas } = await correr(EQUIPO.logo, conPiso(), () => sec({ uso_del_logo: ['Siempre sobre arena o blanco; margen de media ancla'], jerarquia_tipografica: ['Título: sans humanista en negrita [propuesta del agente — lo visto en las fotos]'] }))
    expect(llamadas.map((l) => l.agent)).toEqual(['design-visual-storyteller'])
    expect(llamadas[0].task).toContain(PIDE); expect(llamadas[0].task).toContain('Azul marino y arena'); expect(llamadas[0].task).toContain('cursiva marina')
    expect(out.brand_book_draft.uso_del_logo).toHaveLength(1); expect(out.brand_book_draft._field_meta.jerarquia_tipografica.estado).toBe('propuesta_del_agente')
    expect(out.brand_book_draft.visual.capa_grafica).toContain('Azul marino')    // el piso de CC1 queda intacto
  })
  it('sin lo observado igual propone (rotulado) y lo dice; si la llamada cae, se declara y el piso sigue', async () => {
    const sinPiso = base({ _equipo: { corrio: true, declarado: [] } })
    const a = await correr(EQUIPO.logo, sinPiso, () => sec({ uso_del_logo: ['Fondo claro [propuesta del agente — razón]'] }))
    expect(a.llamadas[0].task).toContain('no trajo lo observado')
    const b = await correr(EQUIPO.logo, conPiso(), () => new Error('timeout'))
    expect(b.out._equipo.declarado.join(' ')).toMatch(/logo y tipografía/); expect(b.out._equipo.logo_corrio).toBe(false); expect(b.out.brand_book_draft.visual.capa_grafica).toContain('Azul marino')
  })
  it('el nodo que revisa el estilo lee también el logo y la tipografía', async () => {
    const f = nuevo.nodes.find((n: any) => n.name === '[BB] Estilo · pedido de revisión').parameters.jsCode
    const fn = new AsyncFunction('$json', f)
    const out = (await fn({ brand_book_draft: { ...DRAFT, visual: { estado: 'ok', capa_grafica: 'Azul' }, uso_del_logo: ['Fondo claro'], jerarquia_tipografica: ['Titulo: sans'] } })) as any
    expect(out[0].json._estilo_revision_pedido).toContain('Fondo claro'); expect(out[0].json._estilo_revision_pedido).toContain('Titulo: sans')
  })
})

describe('las propuestas rotuladas sobreviven a «Sacar lo sin fuente» (puerta REAL)', () => {
  it('prosa propuesta y datos sostenidos pasan; el rótulo viaja con el texto', async () => {
    const C = '96864e88-79bc-47ff-8f8e-5bf88610ec7d'
    const db = new DbFalsa()
    db.semilla('clients', [{ id: C, name: 'Cliente de práctica', website_url: 'https://www.clinicaejemplo.test', country: 'EC', config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
    db.semilla('apify_raw', [filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'x', text: 'Ceviche todos los días.' }]), filaInstagram('i1', 'clinicaejemplo', 'hola')].map((f: any) => ({ ...f, client_id: C, ensayo: false, created_at: '2026-10-01T10:00:00Z' })))
    db.semilla('client_icp_documents', [])
    const draft: any = { client_id: C, positioning: 'p', voice_description: 'Voz directa.', tono_por_canal: ['Instagram: cercano [propuesta del agente — la bio es informal]'], reglas_de_escritura: ['Frases cortas [propuesta del agente — razón]'],
      direccion_de_fotografia: ['Luz natural [propuesta del agente — razón]'], uso_del_logo: ['Fondo claro'], valores: ['Frescura [propuesta del agente — razón]'] }
    const r = await rutaRecomprobar(db as never, { client_id: C, despues: draft, sin_manual_previo: true, sin_eslogan: true })
    expect(r.status).toBe(200)
    const m = (r.body as any).manual
    for (const k of ['tono_por_canal', 'reglas_de_escritura', 'direccion_de_fotografia', 'uso_del_logo', 'valores']) expect(m[k]).toEqual(draft[k])
  })
})
