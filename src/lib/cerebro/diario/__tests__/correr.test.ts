/** La corrida del diario con una base FALSA: dry_run no escribe nada, una corrida por día, idempotencia, versiones, lo transitorio, lo ajeno y lo de ensayo. Cliente sintético de otro rubro. */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../../../oficina/__tests__/dbfalsa'
import { correrDiario } from '../correr'

const C = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-10-10T12:00:00Z')
const SITIO = 'https://www.clinicaejemplo.test'
const TABLAS_NUEVAS = ['cerebro_vigilancia', 'cerebro_diario_corridas', 'cerebro_oportunidades']
const sinEscrituras = (db: DbFalsa) => TABLAS_NUEVAS.every((t) => !(db.tablas[t]?.length)) && !(db.tablas['cerebro_fichas']?.some((f) => f.retirada_en || f.propiedad))

const web = (id: string, dia: string, texto: string, url = SITIO + '/') => ({ id, client_id: C, ensayo: false, apify_function: 'website_content_scraper', params: { url: SITIO }, respuesta: [{ url, text: texto }], created_at: `${dia}T08:00:00Z` })
const ig = (id: string, dia: string, bio: string, posts: Array<{ shortCode: string; caption: string; likesCount?: number }> = [], extra: Record<string, unknown> = {}) => ({ id, client_id: C, ensayo: false, apify_function: 'instagram_scraper', params: { usernames: ['clinicaejemplo'] }, respuesta: [{ username: 'clinicaejemplo', biography: bio, latestPosts: posts.map((p) => ({ ...p, ownerUsername: 'clinicaejemplo' })), followersCount: 100, ...extra }], created_at: `${dia}T08:00:00Z` })

function base(): DbFalsa {
  return new DbFalsa().semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: SITIO, config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
}
const corre = (db: DbFalsa, o: Partial<Parameters<typeof correrDiario>[0]> = {}) => correrDiario({ db, client_id: C, dry_run: false, ahora: AHORA, workflow_id: 'w', workflow_execution_id: 'e', ...o })

describe('dry_run no escribe NADA', () => {
  it('calcula todo (fuentes, oportunidades, limpieza) y deja las tablas intactas, ni el rastro del día', async () => {
    const db = base().semilla('apify_raw', [web('r1', '2026-10-10', 'Linea del sitio numero uno\nCombo nuevo de la semana $9'), ig('r2', '2026-10-10', 'Sonrisas sin miedo')])
      .semilla('cerebro_fichas', [{ id: 'f1', client_id: C, huella: 'h', creado_en: '2026-10-01T00:00:00Z', vigente_hasta: '2026-10-05T00:00:00Z', origen: 'dueno' }])
    const r = await corre(db, { dry_run: true })
    expect(r).toMatchObject({ ok: true, estado: 'hecha', dry_run: true })
    expect(r.fuentes.map((f) => `${f.fuente}:${f.accion}`).sort()).toEqual(['instagram:nuevo', 'sitio:nuevo'])
    expect(r.escrituras.vigilancia_nuevas).toBe(2); expect(r.limpieza).toMatchObject({ aplicada: false, vencidas: [{ id: 'f1' }] })
    expect(sinEscrituras(db)).toBe(true)
  })
})

describe('la primera corrida', () => {
  it('guarda lo último visto de cada fuente propia, con su huella, y deja el rastro del día', async () => {
    const db = base().semilla('apify_raw', [web('r1', '2026-10-10', 'Linea del sitio numero uno'), ig('r2', '2026-10-10', 'Sonrisas sin miedo', [{ shortCode: 'AAA', caption: 'Primera publicacion' }])])
    const r = await corre(db)
    expect(r).toMatchObject({ ok: true, estado: 'hecha' })
    const v = db.tablas['cerebro_vigilancia']
    expect(v).toHaveLength(2)
    expect(v.map((x) => x.fuente).sort()).toEqual(['instagram', 'sitio'])
    expect(v.every((x) => x.client_id === C && typeof x.huella === 'string' && x.propiedad === 'propia' && !x.retirada_en)).toBe(true)
    expect(db.tablas['cerebro_diario_corridas']).toHaveLength(1)
    expect(db.tablas['cerebro_diario_corridas'][0]).toMatchObject({ client_id: C, dia: '2026-10-10', estado: 'hecha', workflow_id: 'w', workflow_execution_id: 'e' })
  })
  it('lo ajeno NO entra: competidores, otros sitios y filas de ensayo', async () => {
    const db = base().semilla('apify_raw', [
      { ...ig('c1', '2026-10-10', 'Somos los mejores de la ciudad'), params: { usernames: ['competidor'] }, respuesta: [{ username: 'competidor', biography: 'Somos los mejores de la ciudad', latestPosts: [] }] },
      { ...web('c2', '2026-10-10', 'Texto de un competidor del rubro', 'https://otro.test/'), params: { url: 'https://otro.test' } },
      { ...web('e1', '2026-10-10', 'TEXTO SINTETICO de ensayo para pruebas'), ensayo: true },
    ])
    const r = await corre(db)
    expect(r.fuentes).toEqual([]); expect(db.tablas['cerebro_vigilancia'] ?? []).toEqual([])
  })
  it('un cliente inexistente se dice (404) y una lectura que falla NO se lee como «sin nada»', async () => {
    expect((await corre(new DbFalsa(), {})).estado).toBe('cliente_inexistente')
    const db = base(); db.fallar['apify_raw'] = 'boom'
    const r = await corre(db)
    expect(r).toMatchObject({ ok: false, estado: 'lectura_fallida' }); expect(r.detalle).toMatch(/apify_raw: boom/)
    expect(sinEscrituras(db)).toBe(true)
  })
})

describe('una corrida por día e idempotencia', () => {
  it('la segunda corrida del mismo día no hace nada («ya corrió hoy»); con `forzar` repite sin duplicar nada', async () => {
    const db = base().semilla('apify_raw', [web('r1', '2026-10-10', 'Linea del sitio numero uno')])
    await corre(db)
    const antes = JSON.stringify(db.tablas['cerebro_vigilancia'])
    expect(await corre(db)).toMatchObject({ ok: true, estado: 'ya_corrio_hoy' })
    const f = await corre(db, { forzar: true })
    expect(f.fuentes[0].accion).toBe('sin_cambio'); expect(f.escrituras.vigilancia_renovadas).toBe(0)
    expect(JSON.stringify(db.tablas['cerebro_vigilancia'])).toBe(antes)
    expect(db.tablas['cerebro_diario_corridas']).toHaveLength(1) // el rastro se actualiza, no se duplica
  })
  it('mañana, con la misma raspada más nueva, solo se renueva `reconfirmado_en` (no hay versión nueva)', async () => {
    const db = base().semilla('apify_raw', [web('r1', '2026-10-09', 'Linea del sitio numero uno')])
    await corre(db, { ahora: new Date('2026-10-09T12:00:00Z') })
    db.semilla('apify_raw', [web('r2', '2026-10-10', 'Linea del sitio numero uno')])
    const r = await corre(db)
    expect(r.fuentes[0]).toMatchObject({ accion: 'renovada' })
    expect(db.tablas['cerebro_vigilancia']).toHaveLength(1); expect(db.tablas['cerebro_vigilancia'][0].reconfirmado_en).toBe('2026-10-10T08:00:00Z')
  })
})

describe('cambios: versión nueva, transitorios y contadores', () => {
  async function conUnaCorridaPrevia(filas1: Record<string, unknown>[]) {
    const db = base().semilla('apify_raw', filas1)
    await corre(db, { ahora: new Date('2026-10-09T12:00:00Z') })
    return db
  }
  it('si el sitio cambia: la anterior se RETIRA (no se borra), la nueva apunta a ella y salen oportunidades con la línea literal', async () => {
    const db = await conUnaCorridaPrevia([web('r1', '2026-10-09', 'Servicio de limpieza dental completa\nCerrado, vuelve el jueves 7am')])
    db.semilla('apify_raw', [web('r2', '2026-10-10', 'Servicio de limpieza dental completa\nCerrado, vuelve hoy 7am\nBlanqueamiento dental desde $80 este mes')])
    const r = await corre(db)
    expect(r.fuentes[0]).toMatchObject({ accion: 'version_nueva', resumen: { transitorias: { nuevas: 0, quitadas: 0 }, cambio_real: { nuevas: 1, quitadas: 0 }, por_clase: { precio: 1, horario: 0, texto: 0 } } })
    const v = db.tablas['cerebro_vigilancia']
    expect(v).toHaveLength(2) // nada se borró
    const vieja = v.find((x) => x.retirada_en)!, nueva = v.find((x) => !x.retirada_en)!
    expect(vieja.motivo_retirada).toMatch(/reemplazada/); expect(nueva.version_de).toBe(vieja.id)
    expect(db.tablas['cerebro_oportunidades']).toHaveLength(1)
    expect(db.tablas['cerebro_oportunidades'][0]).toMatchObject({ clase: 'precio_cambio', fuente: 'sitio', cita: 'blanqueamiento dental desde $80 este mes' })
  })
  it('si solo cambió el aviso de estado, NO hay versión nueva ni oportunidad', async () => {
    const db = await conUnaCorridaPrevia([web('r1', '2026-10-09', 'Servicio de limpieza dental completa\nCerrado, vuelve el jueves 7am')])
    db.semilla('apify_raw', [web('r2', '2026-10-10', 'Servicio de limpieza dental completa\nAbierto ahora hasta las 6pm')])
    const r = await corre(db)
    expect(r.fuentes[0].accion).toBe('renovada'); expect(db.tablas['cerebro_vigilancia']).toHaveLength(1); expect(db.tablas['cerebro_oportunidades'] ?? []).toEqual([])
  })
  it('Instagram: si solo cambió un contador, «sin cambio»; si cambia una leyenda, versión nueva', async () => {
    const db = await conUnaCorridaPrevia([ig('r1', '2026-10-09', 'Sonrisas sin miedo', [{ shortCode: 'A', caption: 'Primera', likesCount: 10 }])])
    db.semilla('apify_raw', [ig('r2', '2026-10-10', 'Sonrisas sin miedo', [{ shortCode: 'A', caption: 'Primera', likesCount: 99 }], { followersCount: 5000 })])
    expect((await corre(db)).fuentes[0].accion).toBe('renovada')
    db.semilla('apify_raw', [ig('r3', '2026-10-11', 'Sonrisas sin miedo', [{ shortCode: 'A', caption: 'Primera editada' }])])
    expect((await corre(db, { forzar: true, ahora: new Date('2026-10-11T12:00:00Z') })).fuentes[0].accion).toBe('version_nueva')
  })
  it('las oportunidades no se repiten si se vuelve a correr con lo mismo', async () => {
    const db = await conUnaCorridaPrevia([web('r1', '2026-10-09', 'Servicio de limpieza dental completa')])
    db.semilla('apify_raw', [web('r2', '2026-10-10', 'Servicio de limpieza dental completa\nBlanqueamiento dental desde $80 este mes')])
    await corre(db)
    db.tablas['cerebro_vigilancia'] = db.tablas['cerebro_vigilancia'].filter((x) => !x.version_de).map((x) => ({ ...x, retirada_en: null })) // vuelve a «lo viejo» para forzar el mismo cambio
    await corre(db, { forzar: true })
    expect(db.tablas['cerebro_oportunidades']).toHaveLength(1)
  })
})

describe('reseñas y comentarios: solo señales; reparto como fuente propia', () => {
  it('las reseñas de Mapas dejan una SEÑAL agregada (sin texto) y la ficha una huella aparte', async () => {
    const reviews = [...Array.from({ length: 5 }, () => ({ stars: 5, text: 'Muy buen servicio Juan Perez' })), ...Array.from({ length: 3 }, () => ({ stars: 1, text: 'Demora excesiva en la atención' }))]
    const db = base().semilla('apify_raw', [{ id: 'm1', client_id: C, ensayo: false, apify_function: 'own_google_maps_profile', params: { searchStringsArray: ['Clínica Ejemplo'] }, respuesta: [{ title: 'Clínica Ejemplo', address: 'Calle 1', totalScore: 4.5, reviews }], created_at: '2026-10-10T08:00:00Z' }])
    const r = await corre(db)
    expect(r.fuentes.map((f) => f.fuente).sort()).toEqual(['mapas', 'resenas'])
    const guardado = JSON.stringify(db.tablas['cerebro_vigilancia']) + JSON.stringify(db.tablas['cerebro_oportunidades'])
    expect(guardado).not.toMatch(/Juan Perez|Muy buen servicio/)
    expect(db.tablas['cerebro_oportunidades'][0]).toMatchObject({ clase: 'senal_de_resenas', cita: null }); expect(db.tablas['cerebro_oportunidades'][0].dato).toMatch(/5 de 8 reseñas de 5 estrellas; queja repetida: .*demora/)
  })
  it('comentarios: solo si TODAS las publicaciones pedidas son propias (ya vigiladas); si no, se ignoran', async () => {
    const com = (id: string, urls: string[]) => ({ id, client_id: C, ensayo: false, apify_function: 'instagram_post_comments_scraper', params: { directUrls: urls }, respuesta: ['promo muy buena', 'la promo está bien', 'quiero la promo'].map((text) => ({ text })), created_at: '2026-10-10T09:00:00Z' })
    const db = base().semilla('apify_raw', [ig('i1', '2026-10-10', 'Bio de la clinica', [{ shortCode: 'AAA', caption: 'Hola mundo' }]), com('k1', ['https://www.instagram.com/p/AAA/']), com('k2', ['https://www.instagram.com/p/AAA/', 'https://www.instagram.com/p/AJENA/'])])
    // primera pasada: aún no hay publicaciones vigiladas ⇒ los comentarios se ignoran; segunda: ya hay
    expect((await corre(db)).fuentes.some((f) => f.fuente === 'comentarios')).toBe(false)
    const r = await corre(db, { forzar: true })
    expect(r.fuentes.filter((f) => f.fuente === 'comentarios')).toHaveLength(1)
    expect(db.tablas['cerebro_oportunidades'].some((o) => o.clase === 'senal_de_comentarios')).toBe(true)
  })
  it('D-3 · una página de reparto declarada en el alta se vigila como fuente `reparto`; sin declarar, se ignora', async () => {
    const reparto = { id: 'p1', client_id: C, ensayo: false, apify_function: 'website_content_scraper', params: { url: 'https://reparto.test/clinica' }, respuesta: [{ url: 'https://reparto.test/clinica', text: 'Menu del dia con precios claros' }], created_at: '2026-10-10T08:00:00Z' }
    const sin = base().semilla('apify_raw', [reparto]); expect((await corre(sin)).fuentes).toEqual([])
    const con = new DbFalsa().semilla('clients', [{ id: C, name: 'X', website_url: SITIO, config: { apify: { url_reparto: ['https://reparto.test/clinica'] } } }]).semilla('apify_raw', [reparto])
    expect((await corre(con)).fuentes.map((f) => f.fuente)).toEqual(['reparto'])
  })
})

describe('limpieza de fichas y gasto', () => {
  it('retira duplicados y vencidas con motivo, marca lo propio, NUNCA borra, y deja intactas las que no tocan', async () => {
    const db = base().semilla('cerebro_fichas', [
      { id: 'a', client_id: C, huella: 'h', creado_en: '2026-10-01T00:00:00Z', origen: 'dueno' }, { id: 'b', client_id: C, huella: 'h', creado_en: '2026-10-02T00:00:00Z', origen: 'tercero' },
      { id: 'v', client_id: C, huella: 'x', creado_en: '2026-10-01T00:00:00Z', origen: 'tercero', vigente_hasta: '2026-10-05T00:00:00Z' }, { id: 'ok', client_id: C, huella: 'y', creado_en: '2026-10-01T00:00:00Z', origen: 'tercero' },
    ])
    const r = await corre(db)
    const f = (id: string) => db.tablas['cerebro_fichas'].find((x) => x.id === id)!
    expect(db.tablas['cerebro_fichas']).toHaveLength(4)
    expect(f('b')).toMatchObject({ motivo_retirada: 'duplicado de a' }); expect(f('v')).toMatchObject({ motivo_retirada: 'vencida y no reconfirmada' })
    expect(f('a').retirada_en).toBeUndefined(); expect(f('a').propiedad).toBe('propia'); expect(f('ok').retirada_en).toBeUndefined()
    expect(r.escrituras).toMatchObject({ fichas_retiradas: 2, fichas_marcadas: 1 })
  })
  it('`limpiar_fichas: false` no toca las fichas', async () => {
    const db = base().semilla('cerebro_fichas', [{ id: 'v', client_id: C, creado_en: '2026-10-01T00:00:00Z', origen: 'dueno', vigente_hasta: '2026-10-05T00:00:00Z' }])
    const r = await corre(db, { limpiar_fichas: false })
    expect(r.limpieza).toBeNull(); expect(db.tablas['cerebro_fichas'][0].retirada_en).toBeUndefined()
  })
  it('el gasto se informa con el tope de US$ 1,00: dentro del tope no lo supera; pasado, lo DICE (el gasto ya ocurrió)', async () => {
    const db = base()
    expect((await corre(db, { dry_run: true, gasto_ampliacion_usd: 0.4, gasto_de_la_manana_usd: 0.3 })).gasto).toMatchObject({ total_usd: 0.7, tope_usd: 1, supero_el_tope: false })
    expect((await corre(db, { dry_run: true, gasto_ampliacion_usd: 0.9, gasto_de_la_manana_usd: 0.3 })).gasto).toMatchObject({ total_usd: 1.2, supero_el_tope: true })
  })
  it('un error de escritura se junta y se DICE (con_errores); no se esconde', async () => {
    const db = base().semilla('apify_raw', [web('r1', '2026-10-10', 'Linea del sitio numero uno')])
    // la lectura funciona y la ESCRITURA de la vigilancia falla
    const desde = db.from.bind(db)
    db.from = ((t: string) => { const q = desde(t) as unknown as Record<string, unknown>; if (t === 'cerebro_vigilancia') q.insert = () => ({ then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'sin permiso' } }).then(res) }); return q }) as never
    const r = await corre(db)
    expect(r).toMatchObject({ ok: false, estado: 'con_errores' }); expect(r.errores.join(' ')).toMatch(/sin permiso/)
  })
})
