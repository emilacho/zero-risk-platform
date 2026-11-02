/**
 * 02-nov · ADENDA 1 del manual (secciones nuevas · mesa creativa · regla de proponer). Ejecuta el CÓDIGO REAL de los cinco nodos nuevos con empleados falsos.
 * Garantías: cada sección tiene UN dueño · la mesa solo ve lo creativo y solo aporta · el creador integra · una llamada caída se declara y no detiene · un dato duro sin fuente lo ANOTA el juez (sin guarda por código: nada se quita) · lo propuesto sale rotulado y estampado · las claves llegan al borrador · la puerta de «Sacar lo sin fuente» no borra las propuestas.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { EQUIPO, DUENOS } from '../scripts/ops/oficina-marketing/secciones-nuevas-y-mesa-manual.mjs'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { rutaRecomprobar } from '../src/lib/manual/rutas'
import { filaInstagram, filaSitio } from '../src/lib/manual/__tests__/apoyo'
import { recorrer } from './_emulador-n8n'

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
  // el nodo del equipo se parte en preparar → llamar (HTTP) → recoger: aquí se ejecutan las tres fases con el MISMO código del flujo
  const llamadas: Llamada[] = []
  const $base = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: { client_id: 'c-1', ...(cfg.reescritura ? { reescritura: cfg.reescritura } : {}) } }) } }
  const env = { ZERO_RISK_API_URL: 'https://app.test', INTERNAL_API_KEY: 'k' }
  const ejecutar = async (nombre: string, $: any, $json: any) => {
    const fn = new AsyncFunction('$', '$json', '$env', '$execution', codigoDe(nombre))
    return (await fn.call({ helpers: {} }, $, $json, env, { id: '777' })) as Array<{ json: any }>
  }
  const nPre = nodoNombre + ' · preparar', nHttp = nodoNombre + ' · llamar'
  const pre = await ejecutar(nPre, $base, json)
  const pedidos = pre.filter((x) => !x.json._eq_sin_pedidos)
  const respuestas = pedidos.map((x) => {
    const cuerpo = x.json._eq_body as Llamada
    llamadas.push(cuerpo)
    const r = responder(cuerpo)
    return { json: r instanceof Error ? { error: r.message } : { statusCode: 200, ...r } }
  })
  const $r = (n: string) => {
    if (n === nPre) return { first: () => pre[0], all: () => pre }
    if (n === nHttp) { if (!pedidos.length) throw new Error('el nodo no corrió'); return { first: () => respuestas[0], all: () => respuestas } }
    return $base(n)
  }
  const out = await ejecutar(nodoNombre, $r, pedidos.length ? respuestas[0].json : pre[0].json)
  return { out: out[0].json, llamadas, pedidos: pedidos.length }
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
  it('los cinco nodos nuevos existen y el vivo no los tenía', () => {
    const v = new Set(vivo.nodes.map((n: any) => n.name))
    for (const n of Object.values(EQUIPO)) { expect(nombres.has(n)).toBe(true); expect(v.has(n)).toBe(false) }
  })
  it('sin enlaces rotos', () => {
    for (const [de, c] of Object.entries<any>(nuevo.connections)) { expect(nombres.has(de)).toBe(true); for (const g of c.main) for (const x of g) expect(nombres.has(x.node)).toBe(true) }
  })
  it('el tramo va ANTES del juez: las dos entradas de «Judge prep» desde la voz pasan por los aportes; el Lazo A sigue entrando directo', () => {
    const a = (de: string, salida = 0) => nuevo.connections[de].main[salida].map((x: any) => x.node)
    const pre = (n: string) => n + ' · preparar'
    expect(a('[BB] Uso · mezclar la voz')).toEqual([pre(EQUIPO.aportes)])
    expect(a('[BB] Uso · ¿hay que repetir la voz?', 1)).toEqual([pre(EQUIPO.aportes)])
    expect(a(EQUIPO.aportes)).toEqual([pre(EQUIPO.mesa)]); expect(a(EQUIPO.mesa)).toEqual([pre(EQUIPO.integra)]); expect(a(EQUIPO.integra)).toEqual(['[BB] Judge prep'])
    expect(a('[BB] Execute Lazo A corrección')).toEqual(['[BB] Judge prep'])
  })
  it('logo y tipografía van en el piso: el piso pasa por ellos antes de la revisión de estilo', () => {
    expect(nuevo.connections['[BB] Piso visual (antes del Promote · CC#1)'].main[0].map((x: any) => x.node)).toEqual([EQUIPO.logo + ' · preparar'])
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

describe('3 · integración (sin guarda por código)', () => {
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
  it('SIN GUARDA POR CÓDIGO (decisión de Emilio): nada de lo que escribe el agente se quita ni se cambia, ni siquiera un dato duro que no está en la evidencia', async () => {
    const aportes = { tono_por_canal: [
      'WhatsApp: escribe al 0987654321 [propuesta del agente — razón]',
      'Atención: abrimos de 8 a 20h',
      'Precios: ceviche a $12.00',
      'Instagram: cercano y con humor [propuesta del agente — razón]',
    ], reglas_de_escritura: ['Llama al 0991234567 solo para pedidos'], historia_y_origen: 'Nació en 1987 con 5 hermanos. [propuesta del agente — razón]' }
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq(aportes) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.tono_por_canal).toEqual(aportes.tono_por_canal)
    expect(out.brand_book_draft.reglas_de_escritura).toEqual(aportes.reglas_de_escritura)
    expect(out.brand_book_draft.historia_y_origen).toBe(aportes.historia_y_origen)
    expect(out._equipo.guarda_datos_duros).toBeUndefined()
    expect(JSON.stringify(out)).not.toMatch(/falta el dato duro/)
  })
  it('un campo que dice PENDIENTE sigue estampado «ausente» (el agente lo declaró, el código no lo inventa ni lo vacía)', async () => {
    const { out } = await correr(EQUIPO.integra, base({ _equipo: eq({ nunca_hace: ['PENDIENTE — falta el teléfono'] }) }), () => { throw new Error('no') })
    expect(out.brand_book_draft.nunca_hace).toEqual(['PENDIENTE — falta el teléfono'])
    expect(out.brand_book_draft._field_meta.nunca_hace.estado).toBe('ausente')
  })
  it('la regla de los datos duros viaja como INSTRUCCIÓN en cada pedido a un dueño: «si no están en la evidencia, escribe "falta"»', async () => {
    const a = await correr(EQUIPO.aportes, base(), respuestaAportes)
    const m = await correr(EQUIPO.mesa, base({ _equipo: { aportes: { valores: {}, meta: {} }, declarado: [] } }), () => sec({ direccion_de_fotografia: ['x'] }))
    const l = await correr(EQUIPO.logo, base({ _equipo: { corrio: true, declarado: [] } }), () => sec({ uso_del_logo: ['x'] }))
    const i = await correr(EQUIPO.integra, base({ _equipo: eq({ tono_por_canal: ['a'], reglas_de_escritura: ['b'] }, [{ para: 'content-creator', campo: 'tono_por_canal', texto: 'y' }]) }), () => sec({ tono_por_canal: ['a'] }))
    for (const llamada of [...a.llamadas, ...m.llamadas, ...l.llamadas, ...i.llamadas]) {
      expect(llamada.task).toContain('NUNCA se inventan'); expect(llamada.task).toContain('si no están en la evidencia, escribe "falta"')
    }
  })
  it('lo propuesto queda estampado propuesta_del_agente; lo dicho por el cliente queda provisional sin rótulo; las claves nuevas llegan al borrador', async () => {
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

describe('«Pedir cambios al manual» llega a los nodos nuevos y no pisa lo validado (reparo 1 de CC3)', () => {
  const VIGENTE = { tono_por_canal: ['WhatsApp: cercano [propuesta del agente — razón]'], valores: ['Frescura validada por el dueño'], uso_del_logo: ['Siempre sobre blanco (validado)'], nunca_hace: ['Nunca esconde el origen'] }
  const RE = (extra: any = {}) => ({ cambios_del_dueno: 'cambia el tono de WhatsApp a formal', seccion: 'tono_por_canal', campos_validados: ['valores', 'uso_del_logo'], campos_liberados: [], manual_vigente: JSON.stringify(VIGENTE), tope_reescritura_usd: 8, ...extra })
  it('aportes: solo pide lo que el pedido nombra, con el pedido del dueño y el valor de hoy; no llama a quien no tiene nada que cambiar', async () => {
    const { llamadas, out } = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE() })
    expect(llamadas.map((l) => l.agent)).toEqual(['content-creator'])
    const tarea = llamadas[0].task
    expect(tarea).toContain('ESTA ES UNA REESCRITURA'); expect(tarea).toContain('cambia el tono de WhatsApp a formal'); expect(tarea).toContain('WhatsApp: cercano')
    expect(tarea).toContain('tono_por_canal'); expect(tarea).not.toContain('nunca_hace: lista'); expect(tarea).not.toContain('valores: lista de valores')
    expect(Object.keys(out._equipo.aportes.valores)).toEqual(['tono_por_canal'])       // lo validado y lo no nombrado no se escribe aunque el agente lo mande
    expect(out._equipo.declarado.join(' ')).toMatch(/pedir cambios.*tono_por_canal.*conserva lo validado: valores, uso_del_logo/)
  })
  it('sin «Pedir cambios» todo sigue como antes: las dos llamadas y los cinco campos', async () => {
    const { llamadas, out } = await correr(EQUIPO.aportes, base(), respuestaAportes)
    expect(llamadas).toHaveLength(2); expect(Object.keys(out._equipo.aportes.valores)).toHaveLength(5)
    for (const l of llamadas) expect(l.task).not.toContain('ESTA ES UNA REESCRITURA')
  })
  it('un campo VALIDADO que el dueño nombra o libera sí se reescribe; el que no, se protege', async () => {
    const nombra = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE({ cambios_del_dueno: 'revisa los valores y el tono de Instagram' }) })
    expect(Object.keys(nombra.out._equipo.aportes.valores).sort()).toEqual(['tono_por_canal', 'valores'])
    const libera = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE({ campos_liberados: ['nunca_hace'] }) })
    expect(Object.keys(libera.out._equipo.aportes.valores).sort()).toEqual(['nunca_hace', 'tono_por_canal'])
  })
  it('un pedido que solo habla de la historia llama SOLO a brand-strategist (content-creator no se llama: es dinero)', async () => {
    const { llamadas, out } = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE({ cambios_del_dueno: 'cuenta mejor la historia de cómo nació el local', seccion: 'historia_y_origen' }) })
    expect(llamadas.map((l) => l.agent)).toEqual(['brand-strategist'])
    expect(Object.keys(out._equipo.aportes.valores)).toEqual(['historia_y_origen'])
    const nada = await correr(EQUIPO.aportes, base(), () => { throw new Error('no debía llamar') }, { reescritura: RE({ cambios_del_dueno: 'ajusta el eslogan', seccion: 'tagline_opciones' }) })
    expect(nada.llamadas).toHaveLength(0)
  })
  it('un campo VALIDADO no se reescribe por una palabra suelta («WhatsApp» en un pedido sobre la historia); sí por su clave, su etiqueta o si está liberado', async () => {
    const pedido = (extra: any) => RE({ cambios_del_dueno: 'en la historia di que atendemos por WhatsApp desde el primer día', seccion: 'historia_y_origen', campos_validados: ['tono_por_canal', 'valores'], ...extra })
    const palabra = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: pedido({}) })
    expect(palabra.llamadas.map((l) => l.agent)).toEqual(['brand-strategist']); expect(Object.keys(palabra.out._equipo.aportes.valores)).toEqual(['historia_y_origen'])
    const clave = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: pedido({ cambios_del_dueno: 'ajusta tono_por_canal y la historia' }) })
    expect(Object.keys(clave.out._equipo.aportes.valores).sort()).toEqual(['historia_y_origen', 'tono_por_canal'])
    const etiqueta = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: pedido({ cambios_del_dueno: 'cambia el Tono según el canal y la historia' }) })
    expect(Object.keys(etiqueta.out._equipo.aportes.valores).sort()).toEqual(['historia_y_origen', 'tono_por_canal'])
    const libera = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: pedido({ campos_liberados: ['tono_por_canal'] }) })
    expect(Object.keys(libera.out._equipo.aportes.valores).sort()).toEqual(['historia_y_origen', 'tono_por_canal'])
    const noValidado = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: pedido({ campos_validados: [] }) })      // sin validar, la palabra suelta sí cuenta
    expect(Object.keys(noValidado.out._equipo.aportes.valores).sort()).toEqual(['historia_y_origen', 'tono_por_canal'])
  })
  it('mesa: si el pedido no habla de fotografía, no llama a nadie y lo dice', async () => {
    const { llamadas, out } = await correr(EQUIPO.mesa, base({ _equipo: { aportes: { valores: { tono_por_canal: ['x'] }, meta: {} }, declarado: [] } }), () => { throw new Error('no debía llamar') }, { reescritura: RE() })
    expect(llamadas).toHaveLength(0); expect(out._equipo.mesa.corrio).toBe(false); expect(out._equipo.declarado.join(' ')).toMatch(/la mesa no corre/)
    const conFoto = await correr(EQUIPO.mesa, base({ _equipo: { aportes: { valores: {}, meta: {} }, declarado: [] } }), () => sec({ direccion_de_fotografia: ['Luz natural'] }), { reescritura: RE({ cambios_del_dueno: 'más fotos de gente comiendo', seccion: 'direccion_de_fotografia' }) })
    expect(conFoto.llamadas.map((l) => l.agent)).toEqual(['creative-director-mesa']); expect(conFoto.llamadas[0].task).toContain('más fotos de gente comiendo')
  })
  it('integración: lo validado VUELVE del manual vigente (no se pisa) y lo pedido se escribe', async () => {
    const aportes = { tono_por_canal: ['WhatsApp: formal y breve [propuesta del agente — lo pidió el dueño]'], valores: ['PISADO por el agente'], nunca_hace: ['PISADO también'] }
    const { out, llamadas } = await correr(EQUIPO.integra, base({ _equipo: { aportes: { valores: aportes, meta: {} }, mesa: { corrio: false, aportes: [] }, declarado: [] } }), () => { throw new Error('no') }, { reescritura: RE() })
    expect(llamadas).toHaveLength(0)
    expect(out.brand_book_draft.tono_por_canal).toEqual(aportes.tono_por_canal)
    expect(out.brand_book_draft.valores).toEqual(VIGENTE.valores); expect(out.brand_book_draft.uso_del_logo).toEqual(VIGENTE.uso_del_logo); expect(out.brand_book_draft.nunca_hace).toEqual(VIGENTE.nunca_hace)
    expect(out._equipo.conservados.sort()).toEqual(['nunca_hace', 'uso_del_logo', 'valores'])
    expect(out.brand_book_draft._field_meta.tono_por_canal.estado).toBe('propuesta_del_agente')
  })
  it('integración: acepta el manual vigente como objeto con brand_book_draft y sin vigente no inventa nada', async () => {
    const e = { aportes: { valores: { tono_por_canal: ['formal'] }, meta: {} }, mesa: { corrio: false, aportes: [] }, declarado: [] }
    const a = await correr(EQUIPO.integra, base({ _equipo: e }), () => { throw new Error('no') }, { reescritura: RE({ manual_vigente: { brand_book_draft: VIGENTE } }) })
    expect(a.out.brand_book_draft.valores).toEqual(VIGENTE.valores)
    const b = await correr(EQUIPO.integra, base({ _equipo: e }), () => { throw new Error('no') }, { reescritura: RE({ manual_vigente: null }) })
    expect(b.out.brand_book_draft.valores).toBeUndefined(); expect(b.out._equipo.conservados).toEqual([])
  })
  it('integración: el pedido del dueño llega a la llamada del creador y el valor de hoy de sus campos', async () => {
    const e = { aportes: { valores: { tono_por_canal: ['WhatsApp: cercano'] }, meta: {} }, mesa: { corrio: true, aportes: [{ para: 'content-creator', campo: 'tono_por_canal', texto: 'Suma formalidad.' }] }, declarado: [] }
    const { llamadas } = await correr(EQUIPO.integra, base({ _equipo: e }), () => sec({ tono_por_canal: ['WhatsApp: formal'] }), { reescritura: RE() })
    expect(llamadas).toHaveLength(1); expect(llamadas[0].task).toContain('ESTA ES UNA REESCRITURA'); expect(llamadas[0].task).toContain('cambia el tono de WhatsApp a formal'); expect(llamadas[0].task).toContain('WhatsApp: cercano [propuesta')
  })
  it('integración: un campo validado que el manual vigente no trae tampoco se escribe, y lo conservado trae su ficha', async () => {
    const e = { aportes: { valores: { tono_por_canal: ['formal'], valores: ['PISADO'] }, meta: {} }, mesa: { corrio: false, aportes: [] }, declarado: [] }
    const sinValor = await correr(EQUIPO.integra, base({ _equipo: e }), () => { throw new Error('no') }, { reescritura: RE({ manual_vigente: JSON.stringify({ tono_por_canal: ['x'] }) }) })
    expect(sinValor.out.brand_book_draft.valores).toBeUndefined()
    const ficha = { estado: 'provisional', fuente: 'dueño', razon: 'validado' }
    const conFicha = await correr(EQUIPO.integra, base({ _equipo: e }), () => { throw new Error('no') }, { reescritura: RE({ manual_vigente: JSON.stringify({ ...VIGENTE, _field_meta: { valores: ficha } }) }) })
    expect(conFicha.out.brand_book_draft._field_meta.valores).toEqual(ficha)
  })
  it('logo y tipografía: no corren si el pedido no los nombra; si los libera el dueño, solo se pide el liberado', async () => {
    const no = await correr(EQUIPO.logo, base({ _equipo: { corrio: true, declarado: [] } }), () => { throw new Error('no debía llamar') }, { reescritura: RE() })
    expect(no.llamadas).toHaveLength(0); expect(no.out._equipo.declarado.join(' ')).toMatch(/logo y tipografía no corren/)
    expect(no.out.brand_book_draft.uso_del_logo).toBeUndefined()
    const si = await correr(EQUIPO.logo, base({ _equipo: { corrio: true, declarado: [] } }), () => sec({ uso_del_logo: ['Nuevo'], jerarquia_tipografica: ['Pisada'] }), { reescritura: RE({ campos_liberados: ['uso_del_logo'] }) })
    expect(si.llamadas).toHaveLength(1); expect(si.llamadas[0].task).toContain('uso_del_logo'); expect(si.llamadas[0].task).toContain('cambia el tono de WhatsApp a formal')
    expect(si.out.brand_book_draft.uso_del_logo).toEqual(['Nuevo']); expect(si.out.brand_book_draft.jerarquia_tipografica).toBeUndefined()
  })
  it('el gasto de una reescritura se reparte por llamada (tope ÷ 8): cada llamada lleva su parte', async () => {
    const { llamadas } = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE({ tope_reescritura_usd: 4 }) })
    expect(llamadas.every((l) => l.max_budget_usd === 0.5)).toBe(true)
  })
})

describe('5 · el juez anota los datos duros sin fuente (no borra, no cambia)', () => {
  const conDatos = () => base({ brand_book_draft: { ...DRAFT, tono_por_canal: ['WhatsApp: escribe al 0987654321 [propuesta del agente — razón]', 'Instagram: cercano'], historia_y_origen: 'Nació en 1987 con 5 hermanos.', positioning: 'Ceviche honesto del pescador al plato. Abrimos de 9 a 17h.' }, _equipo: { corrio: true, declarado: [] } })
  const notas = (lista: any[]) => ({ body: { response: 'Aquí van: ' + JSON.stringify({ notas: lista }) } })
  it('llama UNA vez a market_research_analyst, pide solo anotar y recibe la evidencia y los campos', async () => {
    const { llamadas } = await correr(EQUIPO.notas, conDatos(), () => notas([]))
    expect(llamadas.map((l) => l.agent)).toEqual(['market_research_analyst'])
    const t = llamadas[0].task
    expect(t).toContain('ANOTA'); expect(t).toContain('no corriges, no borras'); expect(t).toContain('Llámanos al 0991234567'); expect(t).toContain('0987654321'); expect(t.length).toBeLessThanOrEqual(15900)
    expect(llamadas[0].step_name).toBe('bb-equipo-juez-datos-duros')
  })
  it('las notas quedan APARTE del texto: en _field_meta.<clave>.notas_del_juez y en notas_del_juez; ningún campo cambia', async () => {
    const entrada = conDatos()
    const { out } = await correr(EQUIPO.notas, entrada, () => notas([
      { campo: 'tono_por_canal', dato: '0987654321', motivo: 'ese teléfono no aparece en la evidencia' },
      { campo: 'historia_y_origen', dato: '1987', motivo: 'el año no está en la evidencia' },
    ]))
    const d = out.brand_book_draft
    for (const k of Object.keys(entrada.brand_book_draft)) expect(d[k]).toEqual(entrada.brand_book_draft[k])      // ni un texto cambia
    expect(d.notas_del_juez).toEqual([{ campo: 'tono_por_canal', dato: '0987654321', motivo: 'ese teléfono no aparece en la evidencia' }, { campo: 'historia_y_origen', dato: '1987', motivo: 'el año no está en la evidencia' }])
    expect(d._field_meta.tono_por_canal.notas_del_juez).toEqual([{ dato: '0987654321', motivo: 'ese teléfono no aparece en la evidencia' }])
    expect(d._field_meta.historia_y_origen.notas_del_juez[0].dato).toBe('1987')
    expect(out._equipo.datos_duros_juez).toMatchObject({ corrio: true, notas_n: 2, descartadas: 0 })
  })
  it('una nota solo vale si el dato está tal cual en ese campo: lo inventado por el juez o con un campo ajeno se descarta', async () => {
    const { out } = await correr(EQUIPO.notas, conDatos(), () => notas([
      { campo: 'historia_y_origen', dato: '1987', motivo: 'ok' },
      { campo: 'historia_y_origen', dato: '1999', motivo: 'no está en el campo' },
      { campo: 'tono_por_canal', dato: '1987', motivo: 'está en otro campo' },
      { campo: 'client_id', dato: 'c-1', motivo: 'campo que no se revisa' },
      { campo: 'positioning', dato: '', motivo: 'sin dato' },
      { dato: 'x' },
    ]))
    expect(out.brand_book_draft.notas_del_juez.map((n: any) => n.dato)).toEqual(['1987'])
    expect(out._equipo.datos_duros_juez).toMatchObject({ notas_n: 1, descartadas: 5 })
  })
  it('ignora tildes y espacios al buscar el dato en el campo y anota a lo sumo 20', async () => {
    const e = base({ brand_book_draft: { ...DRAFT, historia_y_origen: 'Atención: de   9 a 17h' }, _equipo: { corrio: true, declarado: [] } })
    const a = await correr(EQUIPO.notas, e, () => notas([{ campo: 'historia_y_origen', dato: 'Atencion: de 9 a 17h', motivo: 'm' }]))
    expect(a.out.brand_book_draft.notas_del_juez).toHaveLength(1)
    const muchas = Array.from({ length: 30 }, () => ({ campo: 'historia_y_origen', dato: '9', motivo: 'm' }))
    const b = await correr(EQUIPO.notas, e, () => notas(muchas))
    expect(b.out.brand_book_draft.notas_del_juez).toHaveLength(20)
  })
  it('si el juez falla o no se le entiende, se DECLARA y el manual sale igual (nunca bloquea)', async () => {
    const entrada = conDatos()
    for (const r of [new Error('timeout'), { body: { response: 'no sé' } }] as any[]) {
      const { out } = await correr(EQUIPO.notas, entrada, () => r)
      const { _equipo: resumen, ...sinResumen } = out.brand_book_draft; expect(sinResumen).toEqual(entrada.brand_book_draft); expect(resumen.declarado.join(' ')).toMatch(/el juez de datos duros/); expect(out._equipo.declarado.join(' ')).toMatch(/el juez de datos duros/); expect(out._equipo.datos_duros_juez.corrio).toBe(false)
    }
  })
  it('lo que el equipo declaró viaja DENTRO del borrador (el Promote solo manda el borrador): qué se pidió, qué se conservó por estar validado y qué falló', async () => {
    const RE2 = { cambios_del_dueno: 'cambia el tono de WhatsApp a formal', seccion: '', campos_validados: ['tono_por_canal'], campos_liberados: [], manual_vigente: JSON.stringify({ tono_por_canal: ['x'] }), tope_reescritura_usd: 8 }
    const e = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE2 })
    const i = await correr(EQUIPO.integra, { ...base(), ...e.out }, () => { throw new Error('no') }, { reescritura: RE2 })
    const n = await correr(EQUIPO.notas, { ...base(), ...i.out }, () => ({ body: { response: JSON.stringify({ notas: [] }) } }), { reescritura: RE2 })
    const r = n.out.brand_book_draft._equipo
    expect(r.reescritura).toBe(true); expect(r.protegidos).toEqual(['tono_por_canal']); expect(r.objetivo).toEqual([]); expect(r.conservados).toEqual(['tono_por_canal'])
    expect(r.declarado.join(' ')).toMatch(/conserva lo validado: tono_por_canal/); expect(r.datos_duros_juez).toMatchObject({ corrio: true })
    const sin = await correr(EQUIPO.notas, base({ brand_book_draft: { client_id: 'c-1' } }), () => { throw new Error('no') })
    expect(sin.out.brand_book_draft._equipo).toMatchObject({ reescritura: false, objetivo: [], declarado: [] })
  })
  it('el resumen del borrador trae a lo sumo 20 declarados de 300 caracteres', async () => {
    const largos = Array.from({ length: 30 }, (_, i) => 'x'.repeat(500) + i)
    const { out } = await correr(EQUIPO.notas, base({ brand_book_draft: { client_id: 'c-1' }, _equipo: { corrio: true, declarado: largos } }), () => { throw new Error('no') })
    const d = out.brand_book_draft._equipo.declarado
    expect(d).toHaveLength(20); expect(d.every((x: string) => x.length === 300)).toBe(true)
  })
  it('tocados_validados: solo los validados que el pedido PARECE tocar por sus palabras y no se liberaron ni se nombraron (el dato justo del aviso)', async () => {
    const RE = (extra: any = {}) => ({ cambios_del_dueno: '', seccion: '', campos_validados: [], campos_liberados: [], manual_vigente: JSON.stringify({}), tope_reescritura_usd: 8, ...extra })
    const plan = async (extra: any) => (await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE({ campos_validados: ['tono_por_canal', 'reglas_de_escritura', 'valores'], ...extra }) })).out._equipo.plan
    // «WhatsApp» está en el vocabulario del tono; Reglas y Valores ni se mencionaron
    const a = await plan({ cambios_del_dueno: 'cambia el tono de WhatsApp a formal', seccion: '' })
    expect(a.protegidos.sort()).toEqual(['reglas_de_escritura', 'tono_por_canal', 'valores']); expect(a.tocados_validados).toEqual(['tono_por_canal'])
    // si se nombra por su etiqueta o se libera, ya no es «tocado sin liberar»: sí cambia
    expect((await plan({ cambios_del_dueno: 'cambia Tono según el canal, en WhatsApp', seccion: '' })).tocados_validados).toEqual([])
    expect((await plan({ cambios_del_dueno: 'cambia el tono de WhatsApp a formal', seccion: '', campos_liberados: ['tono_por_canal'] })).tocados_validados).toEqual([])
    // un pedido sin palabras de ningún campo validado → lista vacía (el aviso será el general)
    expect((await plan({ cambios_del_dueno: 'ajusta el eslogan', seccion: '' })).tocados_validados).toEqual([])
    // sin «Pedir cambios» no hay nada
    expect((await correr(EQUIPO.aportes, base(), respuestaAportes)).out._equipo.plan.tocados_validados).toEqual([])
  })
  it('tocados_validados devuelve TODOS los validados tocados por palabras, no solo el primero', async () => {
    const RE4 = { cambios_del_dueno: 'cambia el tono de WhatsApp y pon el logo sobre fondo claro', seccion: '', campos_validados: ['tono_por_canal', 'uso_del_logo', 'valores'], campos_liberados: [], manual_vigente: JSON.stringify({}), tope_reescritura_usd: 8 }
    const { out } = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE4 })
    expect(out._equipo.plan.tocados_validados.sort()).toEqual(['tono_por_canal', 'uso_del_logo'])
    expect(out._equipo.plan.protegidos.sort()).toEqual(['tono_por_canal', 'uso_del_logo', 'valores'])
  })
  it('el resumen del borrador lleva tocados_validados', async () => {
    const RE3 = { cambios_del_dueno: 'cambia el tono de WhatsApp a formal', seccion: '', campos_validados: ['tono_por_canal', 'valores'], campos_liberados: [], manual_vigente: JSON.stringify({}), tope_reescritura_usd: 8 }
    const e = await correr(EQUIPO.aportes, base(), respuestaAportes, { reescritura: RE3 })
    const n = await correr(EQUIPO.notas, { ...base(), ...e.out }, () => ({ body: { response: JSON.stringify({ notas: [] }) } }), { reescritura: RE3 })
    expect(n.out.brand_book_draft._equipo.tocados_validados).toEqual(['tono_por_canal'])
  })
  it('sin campos que revisar no hay llamada', async () => {
    const { llamadas, out } = await correr(EQUIPO.notas, base({ brand_book_draft: { client_id: 'c-1' } }), () => { throw new Error('no debía llamar') })
    expect(llamadas).toHaveLength(0); expect(out._equipo.datos_duros_juez.corrio).toBe(false)
  })
  it('va entre «Sacar lo sin fuente» y el Promote; lo que la puerta saca no vuelve y las notas viajan', () => {
    const a = (de: string) => nuevo.connections[de].main[0].map((x: any) => x.node)
    expect(a('[BB] Sacar lo sin fuente (antes del Promote)')).toEqual([EQUIPO.notas + ' · preparar']); expect(a(EQUIPO.notas)).toEqual(['[BB] Promote prep'])
  })
})

describe('ningún nodo de código espera a un empleado (n8n corta una tarea de código a los 120 s)', () => {
  const todos = Object.values(EQUIPO)
  it('cada nodo del equipo es preparar → ¿hay llamada? → llamar (HTTP) → recoger; sin pedidos pasa directo a recoger', () => {
    for (const n of todos) {
      const salida = (de: string, i = 0) => (nuevo.connections[de].main[i] || []).map((x: any) => x.node)
      expect(salida(n + ' · preparar')).toEqual([n + ' · ¿hay llamada?'])
      expect(salida(n + ' · ¿hay llamada?', 0)).toEqual([n]); expect(salida(n + ' · ¿hay llamada?', 1)).toEqual([n + ' · llamar'])
      expect(salida(n + ' · llamar')).toEqual([n])
      const http = nuevo.nodes.find((x: any) => x.name === n + ' · llamar')
      expect(http.type).toBe('n8n-nodes-base.httpRequest'); expect(http.parameters.options.timeout).toBe(800000)
      expect(http.retryOnFail).toBe(true); expect(http.onError).toBe('continueRegularOutput')
      expect(String(http.parameters.url)).toContain('/api/agents/run-sdk')
    }
  })
  it('el código de los nodos de código NO hace llamadas de red (solo prepara y recoge)', () => {
    for (const n of todos) for (const nombre of [n, n + ' · preparar']) {
      const c = codigoDe(nombre)
      expect(c.includes('httpRequest') || c.includes('fetch(') || c.includes('axios') || c.includes('helpers.')).toBe(false)
    }
  })
  it('«preparar» no hace ninguna llamada: devuelve un item por pedido, con el cuerpo listo', async () => {
    const r = await correr(EQUIPO.aportes, base(), respuestaAportes)
    expect(r.pedidos).toBe(2); expect(r.llamadas.map((l) => l.agent).sort()).toEqual(['brand-strategist', 'content-creator'])
  })
  it('sin pedidos (el nodo ya corrió) no hay llamada y la salida es la misma', async () => {
    const r = await correr(EQUIPO.aportes, base({ _equipo: { corrio: true } }), respuestaAportes)
    expect(r.pedidos).toBe(0); expect(r.llamadas.length).toBe(0); expect(r.out._equipo.corrio).toBe(true)
  })
  it('un fallo del nodo HTTP (conexión perdida tras los reintentos de n8n) se DECLARA y no detiene', async () => {
    const r = await correr(EQUIPO.aportes, base(), (l) => (l.agent === 'content-creator' ? new Error('The connection to the server was closed unexpectedly') : respuestaAportes(l)))
    expect(JSON.stringify(r.out._equipo.declarado)).toMatch(/falló la llamada a content-creator/)
    expect(JSON.stringify(r.out._equipo.aportes.valores)).toContain('Cocinan con pescado')
  })
  it('RECORRIDO REAL del grafo (cables y condición): con pedido pasa por el nodo HTTP; sin pedido salta directo a «recoger»', async () => {
    const PREV = { 'Validate Deal Data': [{ client_id: 'c-1' }] }
    const m = EQUIPO.mesa
    const llamadas: any[] = []
    const con = await recorrer(nuevo, m + ' · preparar', base(), { previos: PREV, hasta: [EQUIPO.integra + ' · preparar'], http: async (_u, h, cuerpo) => { llamadas.push({ h, cuerpo }); return { statusCode: 200, body: { brand_section: { direccion_de_fotografia: ['Luz natural [propuesta del agente — razón]'], aportes: [{ para: 'content-creator', campo: 'tono_por_canal', texto: 'Más cálido.' }] } } } } })
    expect(con.pasos).toEqual([m + ' · preparar', m + ' · ¿hay llamada?', m + ' · llamar', m, EQUIPO.integra + ' · preparar'])
    expect(llamadas.length).toBe(1); expect(llamadas[0].cuerpo.agent).toBe('creative-director-mesa'); expect(llamadas[0].h['x-api-key']).toBe('llave-interna')
    expect(JSON.stringify(con.item._equipo.aportes.valores)).toContain('Luz natural')
    // sin pedido (el tramo ya corrió): ni pasa por el HTTP ni llama a nadie
    const sin = await recorrer(nuevo, m + ' · preparar', base({ _equipo: { corrio: true } }), { previos: PREV, hasta: [EQUIPO.integra + ' · preparar'] })
    expect(sin.pasos).toEqual([m + ' · preparar', m + ' · ¿hay llamada?', m, EQUIPO.integra + ' · preparar'])
  })
  it('«¿hay llamada?» manda con pedido al HTTP (salida 1) y sin pedido a «recoger» (salida 0)', () => {
    for (const n of Object.values(EQUIPO)) {
      const c = nuevo.nodes.find((x: any) => x.name === n + ' · ¿hay llamada?').parameters.conditions.conditions[0]
      expect(String(c.leftValue)).toContain('_eq_sin_pedidos === true'); expect(c.rightValue).toBe(true); expect(c.operator.operation).toBe('equals')
    }
  })
  it('un HTTP 500 también se declara (el nodo HTTP no lanza con neverError)', async () => {
    const r = await correr(EQUIPO.aportes, base(), (l) => (l.agent === 'brand-strategist' ? ({ statusCode: 500, body: { error: 'boom' } } as any) : respuestaAportes(l)))
    expect(JSON.stringify(r.out._equipo.declarado)).toMatch(/falló la llamada a brand-strategist: HTTP 500/)
  })
})

describe('un dueño que falla se declara (nunca se calla)', () => {
  it('brand-strategist caído: se declara por su nombre y content-creator sigue', async () => {
    const { out } = await correr(EQUIPO.aportes, base(), (l) => (l.agent === 'brand-strategist' ? new Error('timeout') : respuestaAportes(l)))
    expect(out._equipo.declarado.join(' ')).toMatch(/falló la llamada a brand-strategist/)
    expect(Object.keys(out._equipo.aportes.valores).sort()).toEqual(['nunca_hace', 'reglas_de_escritura', 'tono_por_canal', 'valores'])
  })
})

describe('las etiquetas con las que el dueño nombra un campo validado son las del manual', () => {
  it('cada una de las 8 claves lleva EXACTAMENTE la etiqueta de campos-del-manual.ts (si el manual la cambia, esta prueba avisa)', async () => {
    const { CAMPOS } = await import('../src/lib/manual/campos-del-manual')
    const { COMUN } = await import('../scripts/ops/oficina-marketing/secciones-nuevas-y-mesa-manual.mjs')
    const bloque = /const ETIQUETAS = \{([^}]*)\}/.exec(COMUN as string)![1]
    const claves = Object.values(DUENOS).flatMap((d) => Object.keys(d))
    expect(claves).toHaveLength(8)
    for (const k of claves) {
      const campo = (CAMPOS as any[]).find((c) => c.clave === k)
      expect(campo, k).toBeTruthy()
      expect(bloque, k).toContain(`${k}: '${campo.etiqueta}'`)
    }
  })
})
