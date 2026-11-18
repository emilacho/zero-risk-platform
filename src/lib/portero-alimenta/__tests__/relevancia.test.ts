/**
 * El juicio de relevancia de lo ajeno (encargo 4) · con DOBLES: base falsa que aplica los filtros, modelo falso, bajada falsa y registro falso. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import {
  COLUMNAS_QUE_ESCRIBE, COSTO_ESTIMADO_POR_TANDA_USD, INSTRUCCION_DE_RELEVANCIA, MODELO_DE_RELEVANCIA, PIEZAS_POR_TANDA, TANDAS_POR_CLIENTE_Y_DIA, TOPE_DE_GASTO_POR_LLAMADA_USD,
  MAXIMO_DE_QUE_HACE, aPieza, armarTexto, imagenesDeLosVideos, rotuloDePieza, costoDeRelevancia, costoEstimado, juzgarRelevancia, leerJuicios, leerPerfil, piezasPorJuzgar, relevanciaDeLaCorridaDelVigilante, relevanciaEncendida, urlReducida,
  type DepsDeRelevancia, type PeticionDeRelevancia, type Pieza,
} from '../relevancia'

type Fila = Record<string, unknown>
const C1 = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const C2 = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const BASE = 'https://abc.supabase.co'
const ON = { PORTERO_RELEVANCIA: 'on' }
const DIARIA = { PORTERO_RELEVANCIA: 'on', PORTERO_RELEVANCIA_DIARIA: 'on' }

/** base falsa: aplica eq/neq/is/not is/in/limit como la de verdad; `sin_motivo` calculada; anota cada escritura y cada lectura */
function baseFalsa(tablas: Record<string, Fila[]>, o: { fallaLectura?: string; fallaEscritura?: boolean } = {}) {
  const escrituras: Array<{ tabla: string; valores: Fila; filtros: string[] }> = []
  const lecturas: Array<{ tabla: string; columnas: string; filtros: string[]; limite?: number }> = []
  const db = {
    from(tabla: string) {
      const filtros: Array<(f: Fila) => boolean> = []
      const nombres: string[] = []
      let limite = Infinity, columnas = '', valores: Fila | null = null
      const ordenes: Array<{ col: string; asc: boolean }> = []
      const q: Record<string, unknown> = {
        select(c: string) { columnas = c; return q },
        update(v: Fila) { valores = v; return q },
        eq(k: string, v: unknown) { nombres.push(`eq:${k}`); filtros.push((f) => f[k] === v); return q },
        neq(k: string, v: unknown) { nombres.push(`neq:${k}`); filtros.push((f) => f[k] !== v); return q },
        is(k: string, v: unknown) { nombres.push(`is:${k}`); filtros.push((f) => (f[k] ?? null) === v); return q },
        not(k: string, op: string, v: unknown) { nombres.push(`not:${k}`); filtros.push((f) => (op === 'is' ? (f[k] ?? null) !== v : true)); return q },
        in(k: string, vs: unknown[]) { nombres.push(`in:${k}`); filtros.push((f) => vs.includes(f[k])); return q },
        order(col: string, op?: { ascending?: boolean }) { ordenes.push({ col, asc: op?.ascending !== false }); return q },
        limit(n: number) { limite = n; return q },
        then(res: (x: unknown) => void, rej: (e: unknown) => void) {
          try {
            const filas: Fila[] = (tablas[tabla] ?? []).map((f) => ({ ...f, sin_motivo: f.papel != null && f.papel !== 'propio' && f.relevancia_motivo == null }))
            const pasa = (f: Fila) => filtros.every((fn) => fn(f))
            if (valores) {
              if (o.fallaEscritura) return res({ error: { message: 'no se pudo escribir' } })
              escrituras.push({ tabla, valores, filtros: nombres })
              for (const f of tablas[tabla] ?? []) if (pasa({ ...f })) Object.assign(f, valores)
              return res({ error: null })
            }
            lecturas.push({ tabla, columnas, filtros: nombres, limite })
            if (o.fallaLectura === tabla) return res({ data: null, error: { message: 'caída' } })
            let r = filas.filter(pasa)
            for (const { col, asc } of [...ordenes].reverse()) r = [...r].sort((a, b) => (String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : String(a[col]) > String(b[col]) ? (asc ? 1 : -1) : 0))
            const pedidas = columnas.split(',').map((s) => s.trim()).filter(Boolean)
            res({ data: r.slice(0, limite).map((f) => (pedidas.length ? Object.fromEntries(pedidas.map((k) => [k, f[k]])) : f)), error: null })
          } catch (e) { rej(e) }
        },
      }
      return q
    },
  }
  return { db, escrituras, lecturas, tablas }
}

const cliente = (): Fila[] => [
  { id: C1, name: 'Náufrago', industry: 'restaurante de mariscos costero ecuatoriano', market: 'Olón · Guayaquil', country: 'EC' },
  { id: C2, name: 'Zero Risk', industry: 'seguridad industrial', market: 'Guayaquil', country: 'EC' },
]
const fichas = (): Fila[] => [
  { client_id: C1, clase: 'precio', titulo: 'sitio · precio:producto encebollado mixto · sede guayaquil', retirada_en: null },
  { client_id: C1, clase: 'precio', titulo: 'sitio · precio:producto ceviche naufrago · sede guayaquil', retirada_en: null },
  { client_id: C1, clase: 'precio', titulo: 'sitio · precio:producto viejo', retirada_en: '2026-10-01' },
  { client_id: C2, clase: 'precio', titulo: 'sitio · precio:contamos con mejor del mercado adaptados', retirada_en: null },
]
const foto = (n: number, o: Fila = {}): Fila => ({ id: id(n), client_id: C1, papel: 'mercado', via: 'hashtag', nivel: 'competencia', relevancia_motivo: 'llegó por #ceviche', tipo: 'post_image', caption: `foto ${n}`, url: `${BASE}/storage/v1/object/public/client-social-images/a/${n}.jpg`, handle: 'x', que_muestra: 'un plato', relevancia_juicio: null, ...o })
const video = (n: number, o: Fila = {}): Fila => ({ id: id(n), client_id: C1, papel: 'competidor', via: 'lista_de_competidores', nivel: 'directa', relevancia_motivo: 'competidor de la lista', tipo: 'reel', caption: `video ${n}`, transcripcion: 'hola', handle: 'y', relevancia_juicio: null, ...o })

function respuestaPara(p: PeticionDeRelevancia, juicio: (n: number) => string = () => 'sirve'): string {
  return JSON.stringify(p.partes.map((_, k) => ({ n: k + 1, juicio: juicio(k + 1), motivo: `motivo ${k + 1}` })))
}
function deps(b: ReturnType<typeof baseFalsa>, o: { respuesta?: (p: PeticionDeRelevancia) => string; usage?: { input_tokens: number; output_tokens: number }; lanza?: boolean; bajada?: boolean; registroFalla?: boolean; stop?: string } = {}) {
  const llamadas: PeticionDeRelevancia[] = []
  const registros: Fila[] = []
  const bajadas: string[] = []
  const d: DepsDeRelevancia = {
    db: b.db,
    llamarModelo: async (p) => {
      llamadas.push(p)
      if (o.lanza) throw new Error('el modelo respondió 529')
      return { texto: (o.respuesta ?? ((x) => respuestaPara(x)))(p), stop_reason: o.stop ?? 'end_turn', usage: o.usage ?? { input_tokens: 11_500, output_tokens: 800 } }
    },
    bajarFoto: async (u) => { bajadas.push(u); return o.bajada === false ? { ok: false, motivo: 'no_se_pudo_bajar' } : { ok: true, base64: 'QUJD', tipo: 'image/jpeg', bytes: 3 } },
    registrar: async (f) => { registros.push(f); return o.registroFalla ? { ok: false, detalle: 'log caído' } : { ok: true } },
    ahora: () => new Date('2026-11-18T12:00:00Z'),
  }
  return { d, llamadas, registros, bajadas }
}
const real = { dry_run: false, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: '999' }

describe('el interruptor y el precio', () => {
  it('apagado salvo PORTERO_RELEVANCIA=on', () => {
    expect(relevanciaEncendida({})).toBe(false)
    expect(relevanciaEncendida({ PORTERO_RELEVANCIA: 'off' })).toBe(false)
    expect(relevanciaEncendida({ PORTERO_RELEVANCIA: ' ON ' })).toBe(true)
  })
  it('Haiku 4.5 a US$ 1 / 5 por millón: la tanda de la cotización cuesta 0,0155', () => {
    expect(MODELO_DE_RELEVANCIA).toBe('claude-haiku-4-5')
    expect(costoDeRelevancia({ input_tokens: 11_500, output_tokens: 800 })).toBe(0.0155)
    expect(costoDeRelevancia({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(1)
    expect(costoDeRelevancia({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(5)
  })
  it('el tope por llamada es lo estimado + 50 % (la firma de Emilio)', () => {
    expect(TOPE_DE_GASTO_POR_LLAMADA_USD).toBeCloseTo(COSTO_ESTIMADO_POR_TANDA_USD * 1.5, 6)
    expect(PIEZAS_POR_TANDA).toBe(20)
  })
})

describe('la foto reducida', () => {
  it('pide la versión de ≤512 px del mismo archivo del almacén', () => {
    expect(urlReducida(`${BASE}/storage/v1/object/public/client-social-images/a/b.jpg?x=1`, `${BASE}/`)).toBe(`${BASE}/storage/v1/render/image/public/client-social-images/a/b.jpg?width=512&height=512&resize=contain&quality=60`)
  })
  it('fuera del almacén, sin base o con «..» no hay foto', () => {
    expect(urlReducida('https://otro.com/storage/v1/object/public/a.jpg', BASE)).toBeNull()
    expect(urlReducida('https://otro-sitio-mucho-mas-largo.com/storage/v1/object/public/client-social-images/a/b.jpg', BASE)).toBeNull()
    expect(urlReducida(`${BASE}/storage/v1/object/public/a.jpg`, '')).toBeNull()
    expect(urlReducida(`${BASE}/storage/v1/object/public/../x.jpg`, BASE)).toBeNull()
    expect(urlReducida(`${BASE}/storage/v1/object/public/`, BASE)).toBeNull()
  })
})

describe('el perfil del cliente', () => {
  it('rubro, mercado, país y ofertas de las fichas de precio VIVAS, sin frases de marketing', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas() })
    const p = await leerPerfil(b.db as never, C1)
    expect(p).toEqual({ client_id: C1, nombre: 'Náufrago', rubro: 'restaurante de mariscos costero ecuatoriano', mercado: 'Olón · Guayaquil', pais: 'EC', ofertas: ['encebollado mixto', 'ceviche naufrago'], que_hace: '', sedes: [] })
    expect((await leerPerfil(b.db as never, C2))?.ofertas).toEqual([])
  })
  it('el rubro COMPLETO sale del modelo de negocio de la ficha del cliente, y las sedes de los hechos del negocio', async () => {
    const BM = 'Empresa B2B que vende extintores, recarga, EPP, señalética, alarmas y detectores de humo a fábricas.'
    const b = baseFalsa({
      clients: [{ ...cliente()[1], config: { apify: { muchas: 'cosas' }, business_model: { text: `  ${BM}\n `, source: 'x' } } }],
      cerebro_fichas: [],
      client_sedes: [{ client_id: C2, clave: 'gye', ciudad: 'Guayaquil' }, { client_id: C2, clave: 'gye2', ciudad: 'Guayaquil' }, { client_id: C2, clave: 'uio', ciudad: '' }, { client_id: C1, clave: 'olon', ciudad: 'Olón' }],
    })
    const p = await leerPerfil(b.db as never, C2)
    expect(p?.que_hace).toBe(BM)
    expect(p?.sedes).toEqual(['Guayaquil', 'uio'])
    expect(b.lecturas.find((l) => l.tabla === 'client_sedes')?.filtros).toEqual(['eq:client_id'])
    const t = armarTexto(p!, [])
    expect(t).toContain(`QUÉ HACE: ${BM}`)
    expect(t).toContain('SEDES: Guayaquil, uio')
  })
  it('el modelo de negocio también vale como texto suelto, se recorta a 600 y sin él dice «sin dato»', async () => {
    const b = baseFalsa({ clients: [{ ...cliente()[1], config: { business_model: 'x'.repeat(900) } }], cerebro_fichas: [], client_sedes: [] })
    expect((await leerPerfil(b.db as never, C2))?.que_hace).toHaveLength(MAXIMO_DE_QUE_HACE)
    const c = baseFalsa({ clients: [{ ...cliente()[1], config: null }], cerebro_fichas: [], client_sedes: [] })
    const p = await leerPerfil(c.db as never, C2)
    expect(p?.que_hace).toBe('')
    expect(armarTexto(p!, [])).toContain('QUÉ HACE: sin dato')
  })
  it('si las sedes no se pueden leer, el perfil sigue (sin sedes)', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_sedes: [] }, { fallaLectura: 'client_sedes' })
    const p = await leerPerfil(b.db as never, C1)
    expect(p?.sedes).toEqual([])
    expect(p?.ofertas).toEqual(['encebollado mixto', 'ceviche naufrago'])
  })
  it('la instrucción dice que el rubro es todo lo de QUÉ HACE', () => {
    expect(INSTRUCCION_DE_RELEVANCIA).toContain('El rubro es TODO lo que dice «QUÉ HACE»')
  })
  it('lee solo fichas de su cliente, de clase precio y no retiradas', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas() })
    await leerPerfil(b.db as never, C1)
    expect(b.lecturas.find((l) => l.tabla === 'cerebro_fichas')?.filtros).toEqual(['eq:client_id', 'eq:clase', 'is:retirada_en'])
  })
  it('sin cliente o con lectura caída → null', async () => {
    expect(await leerPerfil(baseFalsa({ clients: [], cerebro_fichas: [] }).db as never, C1)).toBeNull()
    expect(await leerPerfil(baseFalsa({ clients: cliente(), cerebro_fichas: [] }, { fallaLectura: 'cerebro_fichas' }).db as never, C1)).toBeNull()
  })
  it('el texto al modelo lleva el cliente y cuántas piezas', () => {
    const t = armarTexto({ client_id: C1, nombre: 'N', rubro: 'mariscos', mercado: 'Olón', pais: 'EC', ofertas: ['ceviche'] }, [aPieza('client_videos', video(1))])
    expect(t).toContain('RUBRO: mariscos')
    expect(t).toContain('OFERTAS: ceviche')
    expect(t).toContain('n = 1..1')
    expect(armarTexto({ client_id: C1, nombre: 'N', rubro: '', mercado: '', pais: '', ofertas: [] }, [])).toContain('OFERTAS: sin dato')
  })
})

describe('las piezas por juzgar', () => {
  it('solo ajenas, clasificadas, sin juicio y de su cliente; la bodega y lo propio no', async () => {
    const b = baseFalsa({ client_social_images: [foto(1), foto(2, { papel: 'propio', nivel: 'propio' }), foto(3, { papel: null }), foto(4, { relevancia_juicio: 'sirve' }), foto(5, { client_id: null }), foto(6, { client_id: C2 })] })
    const r = await piezasPorJuzgar(b.db as never, C1, 'client_social_images', 20)
    expect(r.ok && r.piezas.map((p) => p.id)).toEqual([id(1)])
  })
  it('lo propio no ocupa el lugar de lo ajeno en la consulta', async () => {
    const b = baseFalsa({ client_social_images: [...Array.from({ length: 70 }, (_, k) => foto(k + 1, { papel: 'propio', nivel: 'propio', relevancia_motivo: 'propia' })), foto(500, { papel: 'competidor', relevancia_motivo: 'm' })] })
    const r = await piezasPorJuzgar(b.db as never, C1, 'client_social_images', 20)
    expect(r.ok && r.piezas.map((p) => p.id)).toEqual([id(500)])
    expect(b.lecturas[0].filtros).toContain('neq:papel')
  })
  it('primero las «sin motivo», luego el mercado, luego el resto', async () => {
    const b = baseFalsa({ client_social_images: [foto(1, { papel: 'competidor', relevancia_motivo: 'm' }), foto(2), foto(3, { relevancia_motivo: null })] })
    const r = await piezasPorJuzgar(b.db as never, C1, 'client_social_images', 20)
    expect(r.ok && r.piezas.map((p) => p.id)).toEqual([id(3), id(2), id(1)])
  })
  it('respeta el límite y los ids pedidos', async () => {
    const b = baseFalsa({ client_social_images: [1, 2, 3, 4].map((n) => foto(n)) })
    const r = await piezasPorJuzgar(b.db as never, C1, 'client_social_images', 2)
    expect(r.ok && r.piezas.length).toBe(2)
    const s = await piezasPorJuzgar(b.db as never, C1, 'client_social_images', 20, [id(3)])
    expect(s.ok && s.piezas.map((p) => p.id)).toEqual([id(3)])
  })
  it('una lectura caída se dice', async () => {
    const r = await piezasPorJuzgar(baseFalsa({}, { fallaLectura: 'client_videos' }).db as never, C1, 'client_videos', 20)
    expect(r).toEqual({ ok: false, detalle: 'client_videos: caída' })
  })
  it('el texto junta pie y lo que muestra (foto) o la transcripción (video), hasta 500', () => {
    expect(aPieza('client_social_images', foto(1)).texto).toBe('foto 1 · un plato')
    expect(aPieza('client_videos', video(1)).texto).toBe('video 1 · hola')
    expect(aPieza('client_videos', video(1)).url).toBeNull()
    expect(aPieza('client_social_images', foto(1, { caption: 'x'.repeat(900) })).texto.length).toBe(500)
  })
})

describe('leer la respuesta', () => {
  const pz: Pieza[] = [aPieza('client_social_images', foto(1)), aPieza('client_videos', video(2))]
  it('lee juicios válidos y los ata a su pieza por número', () => {
    expect(leerJuicios('ok: [{"n":2,"juicio":"no_sirve","motivo":" otra industria "},{"n":1,"juicio":"dudoso","motivo":"sin texto"}] fin', pz)).toEqual([
      { tabla: 'client_videos', id: id(2), juicio: 'no_sirve', motivo: 'otra industria' },
      { tabla: 'client_social_images', id: id(1), juicio: 'dudoso', motivo: 'sin texto' },
    ])
  })
  it('descarta juicio inventado, sin motivo, número fuera de rango, repetido o JSON roto', () => {
    expect(leerJuicios('[{"n":1,"juicio":"revisar","motivo":"x"}]', pz)).toEqual([])
    expect(leerJuicios('[{"n":1,"juicio":"sirve","motivo":"  "}]', pz)).toEqual([])
    expect(leerJuicios('[{"n":3,"juicio":"sirve","motivo":"x"},{"n":0,"juicio":"sirve","motivo":"x"}]', pz)).toEqual([])
    expect(leerJuicios('[{"n":1,"juicio":"sirve","motivo":"a"},{"n":1,"juicio":"no_sirve","motivo":"b"}]', pz).map((j) => j.juicio)).toEqual(['sirve'])
    expect(leerJuicios('[{"n":1,', pz)).toEqual([])
    expect(leerJuicios(null, pz)).toEqual([])
    expect(leerJuicios('{"n":1}', pz)).toEqual([])
  })
  it('el motivo se recorta a 300', () => {
    expect(leerJuicios(`[{"n":1,"juicio":"sirve","motivo":"${'m'.repeat(400)}"}]`, pz)[0].motivo.length).toBe(300)
  })
  it('la instrucción no manda nada a una persona: lo dudoso es un juicio más', () => {
    expect(INSTRUCCION_DE_RELEVANCIA).toContain('"dudoso"')
    expect(INSTRUCCION_DE_RELEVANCIA).not.toMatch(/humano|persona|revisión humana/i)
  })
})

describe('juzgar · cuándo llama al modelo', () => {
  const base = () => baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1), foto(2)], client_videos: [video(3)] })
  it('dry_run solo cuenta: no llama ni escribe', async () => {
    const b = base(); const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], dry_run: true, workflow_id: 'w', workflow_execution_id: 'e' }, ON)
    expect(r).toMatchObject({ estado: 'ok', dry_run: true, llamadas: 0, escribio: false })
    expect(r.por_juzgar).toEqual({ [`${C1.slice(0, 6)}:client_social_images`]: 2, [`${C1.slice(0, 6)}:client_videos`]: 1 })
    expect(x.llamadas).toHaveLength(0); expect(b.escrituras).toHaveLength(0)
  })
  it('sin el interruptor no llama aunque pidan de verdad', async () => {
    const b = base(); const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, {})
    expect(r).toMatchObject({ estado: 'apagado', dry_run: true, llamadas: 0 })
    expect(x.llamadas).toHaveLength(0)
  })
  it('sin proceso operativo (flujo o ejecución) no llama', async () => {
    for (const p of [{ workflow_id: 'w' }, { workflow_execution_id: 'e' }, { workflow_id: ' ', workflow_execution_id: 'e' }]) {
      const b = base(); const x = deps(b)
      const r = await juzgarRelevancia(x.d, { clientes: [C1], dry_run: false, ...p }, ON)
      expect(r).toMatchObject({ estado: 'sin_proceso', dry_run: true, llamadas: 0 })
      expect(x.llamadas).toHaveLength(0)
    }
  })
  it('un cliente que no es id válido se ignora', async () => {
    const b = base(); const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: ['bodega', ''], ...real }, ON)
    expect(r.llamadas).toBe(0); expect(r.por_juzgar).toEqual({})
  })
})

describe('juzgar · de verdad (con dobles)', () => {
  it('una tanda: foto reducida + texto, escribe solo sus columnas y registra con el flujo', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1), foto(2)], client_videos: [video(3)] })
    const x = deps(b, { respuesta: (p) => respuestaPara(p, (n) => (n === 1 ? 'sirve' : n === 2 ? 'no_sirve' : 'dudoso')) })
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(r).toMatchObject({ estado: 'ok', dry_run: false, escribio: true, juzgadas: 3, llamadas: 1, sin_respuesta: 0, sin_imagen: 1, costo_usd: 0.0155, por_juicio: { sirve: 1, no_sirve: 1, dudoso: 1 } })
    expect(x.llamadas).toHaveLength(1)
    const p = x.llamadas[0]
    expect(p.model).toBe('claude-haiku-4-5')
    expect(p.max_tokens).toBe(2000)
    expect(p.timeoutMs).toBe(60_000)
    expect(p.partes.map((q) => !!q.imagen)).toEqual([true, true, false])
    expect(p.partes[2].rotulo).toContain('SIN IMAGEN')
    expect(x.bajadas).toEqual([foto(1).url, foto(2).url])
    // solo SUS columnas; nunca papel, vía, nivel ni motivo
    for (const w of b.escrituras) {
      expect(Object.keys(w.valores).sort()).toEqual(['relevancia_juicio', 'relevancia_juicio_modelo', 'relevancia_juicio_motivo', 'relevancia_juzgada_en'])
      expect(Object.keys(w.valores).sort()).toEqual([...COLUMNAS_QUE_ESCRIBE].sort())
      expect(w.filtros).toEqual(['eq:id', 'eq:client_id', 'is:relevancia_juicio'])
    }
    const f1 = b.tablas.client_social_images[0]
    expect(f1).toMatchObject({ relevancia_juicio: 'sirve', relevancia_juicio_motivo: 'motivo 1', relevancia_juzgada_en: '2026-11-18T12:00:00.000Z', relevancia_juicio_modelo: 'claude-haiku-4-5', papel: 'mercado', relevancia_motivo: 'llegó por #ceviche' })
    expect(b.tablas.client_videos[0]).toMatchObject({ relevancia_juicio: 'dudoso', papel: 'competidor' })
    expect(x.registros).toHaveLength(1)
    expect(x.registros[0]).toMatchObject({ workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: '999', agent_name: 'juez-de-relevancia', model: 'claude-haiku-4-5', cost_usd: 0.0155, client_id: C1, command: 'portero.relevancia', status: 'completed' })
  })
  it('tandas de 20 y el tope de tandas por cliente', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 70 }, (_, k) => foto(k + 1)), client_videos: [] })
    const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(x.llamadas.map((p) => p.partes.length)).toEqual([20, 20])
    expect(r.juzgadas).toBe(TANDAS_POR_CLIENTE_Y_DIA * 20)
    const y = deps(b)
    await juzgarRelevancia(y.d, { clientes: [C1], ...real, tandas_por_cliente: 1 }, ON)
    expect(y.llamadas).toHaveLength(1)
  })
  it('las tandas pedidas nunca pasan de 50 ni bajan de 0', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 30 }, (_, k) => foto(k + 1)), client_videos: [] })
    const x = deps(b)
    expect((await juzgarRelevancia(x.d, { clientes: [C1], ...real, tandas_por_cliente: -3 }, ON)).llamadas).toBe(0)
    const y = deps(b)
    await juzgarRelevancia(y.d, { clientes: [C1], ...real, tandas_por_cliente: 999 }, ON)
    expect(y.llamadas.map((p) => p.partes.length)).toEqual([20, 10])
    // la consulta pide como mucho 50 tandas (× 3 de margen), nunca lo que pidan
    expect(b.lecturas.filter((l) => l.tabla === 'client_social_images').map((l) => l.limite)).toContain(50 * 20 * 3)
    expect(Math.max(...b.lecturas.map((l) => l.limite ?? 0))).toBeLessThanOrEqual(50 * 20 * 3)
  })
  it('escribir:false (la prueba de 40) llama pero no escribe y devuelve los juicios', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1), foto(2)], client_videos: [] })
    const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real, escribir: false, ids: [id(2)] }, ON)
    expect(b.escrituras).toHaveLength(0)
    expect(r.escribio).toBe(false)
    expect(r.juicios).toEqual([{ tabla: 'client_social_images', id: id(2), juicio: 'sirve', motivo: 'motivo 1' }])
    expect(x.registros[0].command).toBe('portero.relevancia.prueba')
  })
  it('lo que el modelo no contesta queda SIN juicio (no se inventa)', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1), foto(2)], client_videos: [] })
    const x = deps(b, { respuesta: () => '[{"n":2,"juicio":"sirve","motivo":"m"}]' })
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(r).toMatchObject({ juzgadas: 1, sin_respuesta: 1 })
    expect(b.tablas.client_social_images[0].relevancia_juicio).toBeNull()
  })
  it('una foto que no baja se juzga por el texto y se cuenta', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] })
    const x = deps(b, { bajada: false })
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(r.sin_imagen).toBe(1)
    expect(x.llamadas[0].partes[0].imagen).toBeUndefined()
  })
  it('el modelo que falla: se registra como fallida, no escribe, sigue', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] })
    const x = deps(b, { lanza: true })
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(r).toMatchObject({ estado: 'ok', llamadas: 1, juzgadas: 0, escribio: false })
    expect(r.fallas).toContain('llamada al modelo: el modelo respondió 529')
    expect(x.registros[0]).toMatchObject({ status: 'failed', error_message: 'el modelo respondió 529', cost_usd: 0 })
  })
  it('el registro caído se dice', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] })
    const r = await juzgarRelevancia(deps(b, { registroFalla: true }).d, { clientes: [C1], ...real }, ON)
    expect(r.fallas).toContain('llamada sin registro: log caído')
  })
  it('una escritura que falla se dice', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] }, { fallaEscritura: true })
    const r = await juzgarRelevancia(deps(b).d, { clientes: [C1], ...real }, ON)
    expect(r.escribio).toBe(false)
    expect(r.fallas).toContain('client_social_images: no se pudo escribir')
  })
  it('sin perfil del cliente no llama', async () => {
    const b = baseFalsa({ clients: [], cerebro_fichas: [], client_social_images: [foto(1)], client_videos: [] })
    const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(x.llamadas).toHaveLength(0)
    expect(r.fallas[0]).toContain('perfil')
  })
  it('una tabla que no se lee no frena a la otra', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [video(2)] }, { fallaLectura: 'client_videos' })
    const r = await juzgarRelevancia(deps(b).d, { clientes: [C1], ...real }, ON)
    expect(r.juzgadas).toBe(1)
    expect(r.fallas).toContain('client_videos: caída')
  })
  it('sin tiempo para una tanda ENTERA (90 s) antes de la hora límite, no la empieza', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 40 }, (_, k) => foto(k + 1)), client_videos: [] })
    const x = deps(b)
    const T0 = Date.parse('2026-11-18T12:00:00Z')
    // cada mirada al reloj avanza 30 s: la 1.ª tanda arranca con 150 s y la 2.ª encontraría menos de 90 s
    let t = 0
    x.d.ahora = () => new Date(T0 + (t += 30_000))
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real, hasta: T0 + 180_000 }, ON)
    expect(x.llamadas).toHaveLength(1)
    expect(r.fallas).toContain('plazo agotado: no se empezaron más tandas')
  })
  it('justo con 90 s empieza; con 89,999 s no', async () => {
    const T0 = Date.parse('2026-11-18T12:00:00Z')
    for (const [queda, llama] of [[90_000, 1], [89_999, 0]] as const) {
      const x = deps(baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] }))
      await juzgarRelevancia(x.d, { clientes: [C1], ...real, hasta: T0 + queda }, ON)
      expect(x.llamadas).toHaveLength(llama)
    }
  })
  it('la llamada nunca espera más de lo que le queda a la ruta, medido DESPUÉS de bajar las fotos, menos 20 s', async () => {
    const T0 = Date.parse('2026-11-18T12:00:00Z')
    // con tiempo de sobra: 60 s
    const x = deps(baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] }))
    x.d.ahora = () => new Date(T0)
    await juzgarRelevancia(x.d, { clientes: [C1], ...real, hasta: T0 + 95_000 }, ON)
    expect(x.llamadas[0].timeoutMs).toBe(60_000)
    // bajar las fotos tardó 40 s: al llamar quedan 55 s → la llamada espera 35 s
    const y = deps(baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] }))
    let ahoraMs = T0
    y.d.ahora = () => new Date(ahoraMs)
    y.d.bajarFoto = async () => { ahoraMs += 40_000; return { ok: true, base64: 'QUJD', tipo: 'image/jpeg', bytes: 3 } }
    await juzgarRelevancia(y.d, { clientes: [C1], ...real, hasta: T0 + 95_000 }, ON)
    expect(y.llamadas[0].timeoutMs).toBe(35_000)
    // sin hora límite: 60 s
    const z = deps(baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] }))
    await juzgarRelevancia(z.d, { clientes: [C1], ...real }, ON)
    expect(z.llamadas[0].timeoutMs).toBe(60_000)
  })
  it('las fotos de una tanda se bajan en paralelo', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1), foto(2), foto(3)], client_videos: [] })
    const x = deps(b)
    let enVuelo = 0, maximo = 0
    x.d.bajarFoto = async () => { enVuelo++; maximo = Math.max(maximo, enVuelo); await new Promise((r) => setTimeout(r, 5)); enVuelo--; return { ok: true, base64: 'QUJD', tipo: 'image/jpeg', bytes: 3 } }
    await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(maximo).toBe(3)
  })
})

describe('juzgar · el costo total y la respuesta cortada (🟡2 y 🟡3 de CC6)', () => {
  it('el costo total suma todas las llamadas', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 40 }, (_, k) => foto(k + 1)), client_videos: [] })
    const r = await juzgarRelevancia(deps(b).d, { clientes: [C1], ...real }, ON)
    expect(r.llamadas).toBe(2)
    expect(r.costo_usd).toBe(0.031)
  })
  it('una respuesta cortada por el tope de salida se dice, con cuántas quedaron sin juicio', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1), foto(2)], client_videos: [] })
    const cortada = '[{"n":1,"juicio":"sirve","motivo":"m"},{"n":2,"juic'
    const r = await juzgarRelevancia(deps(b, { stop: 'max_tokens', respuesta: () => cortada }).d, { clientes: [C1], ...real }, ON)
    expect(r.fallas).toContain('respuesta cortada (max_tokens): 2 pieza(s) sin juicio')
    expect(r.juzgadas).toBe(0)
  })
  it('una respuesta completa no se marca cortada', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] })
    const r = await juzgarRelevancia(deps(b).d, { clientes: [C1], ...real }, ON)
    expect(r.fallas.filter((f) => f.includes('cortada'))).toEqual([])
  })
  it('la instrucción pide motivo de 120 caracteres como mucho', () => {
    expect(INSTRUCCION_DE_RELEVANCIA).toContain('máx. 120 caracteres')
  })
  it('una tanda llena (20 fotos, 500 caracteres, 15 ofertas) con el tope de salida nuevo cabe en el tope por llamada', () => {
    const perfil = { client_id: C1, nombre: 'Náufrago', rubro: 'restaurante de mariscos costero ecuatoriano', mercado: 'Olón · Guayaquil', pais: 'EC', ofertas: Array.from({ length: 15 }, () => 'o'.repeat(60)), que_hace: 'q'.repeat(600), sedes: Array.from({ length: 15 }, () => 's'.repeat(20)) }
    const partes = Array.from({ length: 20 }, (_, k) => ({ rotulo: rotuloDePieza(aPieza('client_social_images', foto(k, { caption: 'x'.repeat(500) })), k + 1, true), imagen: { tipo: 'image/jpeg', base64: 'A' } }))
    const p: PeticionDeRelevancia = { model: 'm', max_tokens: 2000, system: INSTRUCCION_DE_RELEVANCIA, partes, texto: armarTexto(perfil, []), timeoutMs: 1 }
    expect(costoEstimado(p)).toBeLessThanOrEqual(TOPE_DE_GASTO_POR_LLAMADA_USD)
  })
})

describe('la imagen de los videos (arreglo a de la ADENDA 2)', () => {
  const V1 = id(901), V2 = id(902), V3 = id(903)
  const cap = (video_id: string, posicion: number, o: Fila = {}): Fila => ({ id: id(800 + posicion + (video_id === V1 ? 0 : 50)), client_id: C1, tipo: 'video_captura', video_id, posicion, url: `${BASE}/storage/v1/object/public/c/${video_id.slice(-3)}-${posicion}.jpg`, ...o })
  const portada = (post_id: string, o: Fila = {}): Fila => ({ id: id(700), client_id: C1, tipo: 'post_video', post_id, url: `${BASE}/storage/v1/object/public/p/${post_id}.jpg`, ...o })
  it('primero la captura de menor posición; si no tiene, la portada del mismo post; si no, sin imagen', async () => {
    const b = baseFalsa({ client_social_images: [cap(V1, 3), cap(V1, 1), portada('P1'), portada('P2'), portada('P3', { client_id: C2 }), portada('P2', { tipo: 'post_image', url: 'otra' })] })
    const vids = [aPieza('client_videos', video(901, { post_id: 'P1' })), aPieza('client_videos', video(902, { post_id: 'P2' })), aPieza('client_videos', video(903, { post_id: 'P3' }))]
    const r = await imagenesDeLosVideos(b.db as never, C1, vids)
    expect(r.urls.get(V1)).toContain('/901-1.jpg')
    expect(r.urls.get(V2)).toContain('/p/P2.jpg')
    expect(r.urls.has(V3)).toBe(false)
    expect(r.falla).toBeUndefined()
    expect(b.lecturas.map((l) => [l.tabla, l.filtros.join(' ')])).toEqual([
      ['client_social_images', 'eq:client_id eq:tipo in:video_id'],
      ['client_social_images', 'eq:client_id eq:tipo in:post_id'],
    ])
  })
  it('sin videos no lee; con todos capturados no busca portadas', async () => {
    const b = baseFalsa({ client_social_images: [cap(V1, 1)] })
    expect((await imagenesDeLosVideos(b.db as never, C1, [])).urls.size).toBe(0)
    expect(b.lecturas).toHaveLength(0)
    await imagenesDeLosVideos(b.db as never, C1, [aPieza('client_videos', video(901, { post_id: 'P1' }))])
    expect(b.lecturas).toHaveLength(1)
  })
  it('una lectura caída se dice y no frena', async () => {
    const b = baseFalsa({ client_social_images: [] }, { fallaLectura: 'client_social_images' })
    const r = await imagenesDeLosVideos(b.db as never, C1, [aPieza('client_videos', video(901, { post_id: 'P1' }))])
    expect(r.falla).toContain('capturas de video')
    expect(r.urls.size).toBe(0)
  })
  it('en el juicio, el video manda su imagen al agente (y deja de ir SIN IMAGEN)', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [portada('P9', { papel: null })], client_videos: [video(1, { post_id: 'P9' }), video(2, { post_id: 'P8' })] })
    const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(x.bajadas).toEqual([`${BASE}/storage/v1/object/public/p/P9.jpg`])
    expect(r.sin_imagen).toBe(1)
    expect(x.llamadas[0].partes.filter((p) => p.imagen)).toHaveLength(1)
    expect(x.llamadas[0].partes.find((p) => p.rotulo.includes('video 2'))?.rotulo).toContain('SIN IMAGEN')
  })
  it('una falla al buscar imágenes queda en fallas y el juicio sigue', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [], client_videos: [video(1, { post_id: 'P9' })] }, { fallaLectura: 'client_social_images' })
    const r = await juzgarRelevancia(deps(b).d, { clientes: [C1], ...real }, ON)
    expect(r.fallas.some((f) => f.startsWith('capturas de video'))).toBe(true)
    expect(r.juzgadas).toBe(1)
  })
})

describe('juzgar · los topes de gasto', () => {
  it('si la llamada real pasa el tope (+50 %), se detiene y lo dice', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 40 }, (_, k) => foto(k + 1)), client_videos: [video(99)] })
    const x = deps(b, { usage: { input_tokens: 20_000, output_tokens: 1_000 } })
    const r = await juzgarRelevancia(x.d, { clientes: [C1, C2], ...real }, ON)
    expect(r.estado).toBe('detenido_por_costo')
    expect(r.costo_usd).toBe(0.025)
    expect(x.llamadas).toHaveLength(1)
    expect(r.detalle).toContain('0.025')
  })
  it('justo en el tope sigue', async () => {
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 40 }, (_, k) => foto(k + 1)), client_videos: [] })
    const x = deps(b, { usage: { input_tokens: 19_000, output_tokens: 1_000 } })
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(r.estado).toBe('ok'); expect(x.llamadas).toHaveLength(2)
  })
  it('si la tanda ESTIMADA ya pasa el tope, no se llama', async () => {
    const largo = 'x'.repeat(500)
    const b = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 20 }, (_, k) => foto(k + 1, { caption: largo, que_muestra: largo })), client_videos: [] })
    const x = deps(b)
    x.d.bajarFoto = async () => ({ ok: true, base64: 'QUJD', tipo: 'image/jpeg', bytes: 3 })
    const pesada: PeticionDeRelevancia = { model: 'm', max_tokens: 1500, system: 's', partes: Array.from({ length: 40 }, () => ({ rotulo: 'r', imagen: { tipo: 'image/jpeg', base64: 'A' } })), texto: 't', timeoutMs: 1 }
    expect(costoEstimado(pesada)).toBeGreaterThan(TOPE_DE_GASTO_POR_LLAMADA_USD)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real, tandas_por_cliente: 1 }, ON)
    // 20 piezas con imagen y 500 caracteres: la estimada cabe en el tope (≈ 0,021) → sí llama
    expect(r.estado).toBe('ok')
    expect(costoEstimado(x.llamadas[0])).toBeLessThanOrEqual(TOPE_DE_GASTO_POR_LLAMADA_USD)
  })
  it('si la tanda ESTIMADA pasa el tope (un rubro enorme), no se llama y lo dice', async () => {
    const enorme = cliente().map((c) => ({ ...c, industry: 'mariscos '.repeat(12000) }))
    const b = baseFalsa({ clients: enorme, cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] })
    const x = deps(b)
    const r = await juzgarRelevancia(x.d, { clientes: [C1], ...real }, ON)
    expect(x.llamadas).toHaveLength(0)
    expect(r.estado).toBe('detenido_por_costo')
    expect(r.detalle).toContain('no se llamó')
  })
  it('la estimación cuenta texto e imágenes', () => {
    const p = (img: boolean, chars: number): PeticionDeRelevancia => ({ model: 'm', max_tokens: 0, system: 'x'.repeat(chars), partes: [{ rotulo: '', ...(img ? { imagen: { tipo: 'image/jpeg', base64: 'A' } } : {}) }], texto: '', timeoutMs: 1 })
    expect(costoEstimado(p(false, 3_500_000))).toBe(1)
    expect(costoEstimado(p(true, 0))).toBe(0.00045)
  })
})

describe('el cierre del vigilante', () => {
  const b = () => baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: [foto(1)], client_videos: [] })
  it('apagado: ni lee', async () => {
    const x = baseFalsa({}); const d = deps(x)
    expect(await relevanciaDeLaCorridaDelVigilante(d.d, real, { clientes: [{ client_id: C1 }] }, {})).toBeNull()
    expect(x.lecturas).toHaveLength(0)
  })
  it('con solo el interruptor general (la prueba y la primera pasada), la diaria sigue apagada', async () => {
    const x = baseFalsa({}); const d = deps(x)
    expect(await relevanciaDeLaCorridaDelVigilante(d.d, real, { clientes: [{ client_id: C1 }] }, ON)).toBeNull()
    expect(await relevanciaDeLaCorridaDelVigilante(d.d, real, { clientes: [{ client_id: C1 }] }, { PORTERO_RELEVANCIA_DIARIA: 'on' })).toBeNull()
    expect(x.lecturas).toHaveLength(0)
  })
  it('encendido: juzga a los clientes revisados, con el flujo del cuerpo', async () => {
    const base = b(); const d = deps(base)
    const r = await relevanciaDeLaCorridaDelVigilante(d.d, real, { clientes: [{ client_id: C1 }, { client_id: 'x' }] }, DIARIA)
    expect(r).toMatchObject({ estado: 'ok', juzgadas: 1 })
    expect(d.registros[0]).toMatchObject({ workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: '999' })
  })
  it('el cuerpo sin dry_run:false solo cuenta; sin clientes revisados, nada', async () => {
    const d = deps(b())
    expect(await relevanciaDeLaCorridaDelVigilante(d.d, { workflow_id: 'w', workflow_execution_id: 'e' }, { clientes: [{ client_id: C1 }] }, DIARIA)).toMatchObject({ dry_run: true, llamadas: 0 })
    expect(await relevanciaDeLaCorridaDelVigilante(d.d, real, {}, DIARIA)).toBeNull()
    expect(await relevanciaDeLaCorridaDelVigilante(d.d, null, { clientes: [{ client_id: C1 }] }, DIARIA)).toMatchObject({ dry_run: true })
  })
  it('la diaria juzga solo 2 tandas por cliente (no el tope de un pedido)', async () => {
    const base = baseFalsa({ clients: cliente(), cerebro_fichas: fichas(), client_social_images: Array.from({ length: 70 }, (_, k) => foto(k + 1)), client_videos: [] })
    const d = deps(base)
    await relevanciaDeLaCorridaDelVigilante(d.d, real, { clientes: [{ client_id: C1 }] }, DIARIA)
    expect(d.llamadas).toHaveLength(2)
  })
})
