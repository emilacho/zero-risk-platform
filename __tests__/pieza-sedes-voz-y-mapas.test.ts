/**
 * EL FLUJO DE LA PIEZA CON SEDES, MAPAS Y VOZ · pruebas a costo cero con el código EXACTO de cada nodo y los datos REALES de Náufrago · CC#1 · 2026-10-02
 * (encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1, 2, 3, 5 y 6 · certificación CC#3 de la primera pieza real).
 *
 * 🔴 EL ROJO (la corrida real 01-oct): el pedido mandaba `ficha_en_mapas · donde = Ecuador` (trajo la ficha de OTRO negocio, Gualaceo) · el productor no recibía las sedes ni textos de voz
 * y afirmó un horario (7am–3pm) que su propio Instagram contradice para Olón sin que el sistema lo supiera. Después: cada sede se pide por ciudad y dirección, el pedido declara lo que falta o choca,
 * los textos propios llegan como referencia de voz y el chequeo compara el horario de la pieza contra lo que el sistema vio.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'pieza-el-productor')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const { construirFlujo, codigoDeNodo, N } = await import(pathToFileURL(join(DIR, 'construir-pieza.mjs')).href)
const CH = require(join(DIR, 'pieza-chequeos.js'))
const S = require(join(process.cwd(), 'src', 'lib', 'sedes', 'sedes-logica.js'))
const BRIEF = JSON.parse(readFileSync(join(DIR, 'fixtures', 'brf-0006.json'), 'utf8'))
const FX = join(process.cwd(), '__tests__', 'fixtures', 'sedes-naufrago')
const SITIO = JSON.parse(readFileSync(join(FX, 'sitio-pagina.json'), 'utf8'))
const IG = JSON.parse(readFileSync(join(FX, 'instagram-perfil.json'), 'utf8'))
const MAPAS = JSON.parse(readFileSync(join(FX, 'mapas-homonimo-gualaceo.json'), 'utf8'))

type Ctx = { input?: unknown[]; refs?: Record<string, unknown>; env?: Record<string, string> }
async function correrNodo(clave: string, ctx: Ctx) {
  const items = (ctx.input ?? [{}]).map((j) => ({ json: j }))
  const $input = { first: () => items[0], all: () => items }
  const $ = (n: string) => { if (!(ctx.refs && n in ctx.refs)) throw new Error('nodo no ejecutado: ' + n); const v = ctx.refs![n]; const lista = Array.isArray(v) ? v : [v]; return { first: () => ({ json: lista[0] }), all: () => lista.map((j) => ({ json: j })) } }
  return new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', codigoDeNodo(clave))(
    $input, $, ctx.env ?? {}, items[0]?.json, { id: 'WF-PIEZA' }, { id: '999', resumeUrl: 'https://n8n.test/webhook-waiting/999' })
}

const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
// lo que el recolector entrega para Náufrago HOY (sitio + bio + el homónimo descartado) · construido con la MISMA lógica
const obs = () => [...S.observacionesDelSitio(SITIO.content_text, { url: SITIO.url, crawled_at: SITIO.crawled_at }), ...S.observacionesDeInstagram(IG, { observado_en: '2026-10-01T23:45:36Z' })]
const SEDES = () => S.resolverSedes(S.descubrirSedes(obs()), obs())
const DESCARTE = () => S.observacionesDeMaps(MAPAS.item, S.descubrirSedes(obs()), 'Náufrago', {}).descartado
const INFO_REAL = () => ({ sedes_info: { sedes: SEDES(), textos_propios: S.textosPropios(IG.latestPosts), descartes: [{ fuente: 'mapas', motivo: DESCARTE().motivo }] } })
const FICHA = { id: CID, name: 'Náufrago', config: { apify: { own_handles: { instagram: ['naufrago.ec'] } } }, website_url: 'https://www.naufrago.ec', country: 'Ecuador', market: 'Guayaquil · Guayas' }
const PREV = { client_id: CID, tenant_id: CID, brief_id: 'BRF-0006', parte_id: 'p1', dry_run: false, forzar: false, tope_usd: 0.6, brief: BRIEF, brief_texto: 'BRIEF BRF-0006 · …', fotos: [{ url: 'https://x/a.jpg', label: 'imagen · p1' }] }
const armar = (info: Record<string, unknown> | null, ficha: Record<string, unknown> = FICHA) =>
  correrNodo('cuerpo', {
    input: info === null ? [ficha] : [info],
    refs: { '④ ¿Ya hay pieza de este brief? · guarda': PREV, '⑤ Ficha del cliente': ficha },
  }).then((r) => r[0].json)

describe('⑤ GUARDA · sedes y voz (la lectura caída se DECLARA, no se rellena ni se traga)', () => {
  const guarda = (e: unknown) => correrNodo('guardaSedes', { input: [e] }).then((r) => r[0].json.sedes_info)
  it('respuesta ok ⇒ pasa las sedes, los textos propios y los descartes', async () => {
    const i = await guarda({ ok: true, sedes: SEDES(), textos_propios: [{ fecha: '2026-03-06', texto: 'x', post: 'a' }], descartes: [{ fuente: 'mapas', motivo: 'm' }], nuevas: 3 })
    expect(i.sedes).toHaveLength(2)
    expect(i.textos_propios).toHaveLength(1)
    expect(i.descartes).toHaveLength(1)
  })
  it('también cuando el nodo HTTP la envuelve en `body`', async () => {
    expect((await guarda({ body: { ok: true, sedes: [], textos_propios: [], descartes: [] } })).sedes).toEqual([])
  })
  it('🔴 cada forma de lectura caída ⇒ `error` con su motivo (nunca «sin sedes» como si fuera cierto)', async () => {
    expect((await guarda({ error: { message: 'timeout 45000ms' } })).error).toMatch(/no se pudo leer la ficha de sedes.*timeout/)
    expect((await guarda({ ok: false, error: 'la base no contesta' })).error).toBe('la base no contesta')
    expect((await guarda({ error: 'unauthorized', detail: 'Invalid x-api-key' })).error).toBe('unauthorized')
    expect((await guarda({})).error).toMatch(/no contestó ok/)
    expect((await guarda({ ok: true })).error).toMatch(/sin la lista de sedes/)
  })
})

describe('③ MAPAS con la ciudad y la dirección de la SEDE · nunca con el país', () => {
  it('🔴 Náufrago: una búsqueda de Mapas por sede («Avenida 8 NO, Guayaquil» y «Olon») y NINGUNA con «Ecuador»', async () => {
    const t = (await armar(INFO_REAL())).cuerpo.task as string
    expect(t).toContain('que_mirar = ficha_en_mapas       · de_quien = Náufrago · donde = Avenida 8 NO, Guayaquil')
    expect(t).toContain('que_mirar = ficha_en_mapas       · de_quien = Náufrago · donde = Olon')
    expect(t).not.toContain('donde = Ecuador')
  })
  it('dos sedes ⇒ dos búsquedas de Mapas ⇒ el cupo crece a 5 (para no dejar sin turno al Instagram ni al sitio) y el sistema lo hace cumplir (opciones ofrecidas intactas · nunca anuncios de pago)', async () => {
    const j = await armar(INFO_REAL())
    expect(j.cuerpo.mirar_afuera_limites).toEqual({ max_pedidos: 5, permitidos: ['instagram', 'ficha_en_mapas', 'leer_el_sitio', 'que_dice_el_buscador'] })
    expect(j.cuerpo.task).toMatch(/MÁXIMO 5 pedidos/)
    expect(j.max_pedidos_mirar_afuera).toBe(5)
    expect(JSON.stringify(j.cuerpo.mirar_afuera_limites)).not.toMatch(/anuncios_en/)
  })
  it('una sola ubicación ⇒ el cupo de siempre (4)', async () => {
    const j = await armar({ sedes_info: { sedes: [SEDES()[0]], textos_propios: [], descartes: [] } })
    expect(j.cuerpo.mirar_afuera_limites.max_pedidos).toBe(4)
  })
  it('🔴 sin sedes y sin ubicación en la ficha (sólo el país) ⇒ `ficha_en_mapas` NO se ofrece y el pedido lo dice con su motivo', async () => {
    const j = await armar({ sedes_info: { sedes: [], textos_propios: [], descartes: [] } }, { id: CID, name: 'Otro', country: 'Ecuador' })
    expect(j.cuerpo.mirar_afuera_limites.permitidos).not.toContain('ficha_en_mapas')
    expect(j.cuerpo.task).not.toContain('que_mirar = ficha_en_mapas')
    expect(j.cuerpo.task).toMatch(/NO tienes:.*ficha_en_mapas \(la ficha del cliente no trae ciudad ni dirección/)
  })
  it('sin sedes pero con la ciudad en la ficha («Guayaquil · Guayas») ⇒ Mapas por esa ciudad', async () => {
    const j = await armar({ sedes_info: { sedes: [], textos_propios: [], descartes: [] } })
    expect(j.cuerpo.task).toContain('que_mirar = ficha_en_mapas       · de_quien = Náufrago · donde = Guayaquil')
  })
  it('el pedido avisa que lo de mirar_afuera NO entra al cerebro y que una ficha de otra ciudad es OTRO negocio', async () => {
    const t = (await armar(INFO_REAL())).cuerpo.task as string
    expect(t).toMatch(/NO entra al cerebro del cliente/)
    expect(t).toMatch(/una ficha de otra ciudad es OTRO negocio/)
  })
})

describe('① ② las sedes y su horario llegan al productor CON su fuente · lo que falta o choca se DECLARA', () => {
  it('Náufrago: el bloque D trae cada sede con su horario y de dónde salió · «SIN DATO» donde ninguna fuente lo trae', async () => {
    const t = (await armar(INFO_REAL())).cuerpo.task as string
    expect(t).toContain('D) LAS SEDES')
    expect(t).toContain('Sede Guayaquil:')
    expect(t).toMatch(/horario: jueves a lunes 07:00–15:00 \(visto sólo en una fuente: sitio/)
    expect(t).toContain('Sede Olon:')
    expect(t).toMatch(/horario: jueves a lunes 08:00–16:00.*instagram/)
    expect(t).toMatch(/dirección: SIN DATO/)
    expect(t).toMatch(/Nunca le preguntes el horario al dueño/)
  })
  it('🔴 un conflicto entre fuentes llega como «LAS FUENTES NO COINCIDEN» con las dos versiones (el productor NO elige una)', async () => {
    const sede = [{ clave: 'olon', ciudad: 'Olón' }]
    const o = [
      { sede: 'olon', campo: 'horario', valor_texto: 'jueves a lunes 07:00–15:00', valor_norm: S.horarioDeTexto('jueves a lunes 7 a 15'), fuente: 'sitio', observado_en: '2026-09-29', alcance: 'sede' },
      { sede: 'olon', campo: 'horario', valor_texto: 'jueves a lunes 08:00–16:00', valor_norm: S.horarioDeTexto('jueves a lunes 8 a 16'), fuente: 'instagram', observado_en: '2026-10-01', alcance: 'sede' },
    ]
    const j = await armar({ sedes_info: { sedes: S.resolverSedes(sede, o), textos_propios: [], descartes: [] } })
    expect(j.cuerpo.task).toMatch(/horario: LAS FUENTES NO COINCIDEN · «jueves a lunes 07:00–15:00» \(sitio\) ≠ «jueves a lunes 08:00–16:00» \(instagram\)/)
    expect(j.sedes_resumen.sedes[0].horario).toBe('conflicto')
  })
  it('🔴 la lectura de sedes caída ⇒ el pedido lo DECLARA y prohíbe afirmar horarios que no vengan en el brief · la pieza guarda el motivo', async () => {
    const j = await armar({ sedes_info: { error: 'no se pudo leer la ficha de sedes (timeout)' } })
    expect(j.cuerpo.task).toMatch(/NO se pudieron leer las sedes del cliente \(no se pudo leer la ficha de sedes \(timeout\)\)/)
    expect(j.cuerpo.task).toMatch(/No afirmes ningún horario, dirección ni teléfono que no venga en el brief/)
    expect(j.sedes_resumen).toMatchObject({ leidas: false })
    expect(j.cuerpo.dry_run).toBe(false) // el resto del cuerpo (lo que paga) no cambia
  })
  it('sin sedes registradas ⇒ lo DECLARA (no inventa)', async () => {
    const j = await armar({ sedes_info: { sedes: [], textos_propios: [], descartes: [] } })
    expect(j.cuerpo.task).toMatch(/NO tiene sedes registradas/)
  })
  it('la regla 3 manda el horario/dirección/teléfono al brief o al bloque D (nunca a la memoria del modelo)', async () => {
    expect(((await armar(INFO_REAL())).cuerpo.task as string)).toMatch(/horario, la dirección y el teléfono salen del brief o del bloque D/)
  })
  it('el resumen viaja con la pieza: estados por sede y lo descartado (Gualaceo) con su motivo', async () => {
    const j = await armar(INFO_REAL())
    expect(j.sedes_resumen.leidas).toBe(true)
    expect(j.sedes_resumen.sedes.map((s: { ciudad: string }) => s.ciudad).sort()).toEqual(['Guayaquil', 'Olon'])
    expect(j.sedes_resumen.descartes[0].motivo).toMatch(/Gualaceo/)
  })
})

describe('⑥ la voz: el productor recibe los textos de los posts propios del cliente', () => {
  it('Náufrago: los textos propios van en el bloque E con su fecha · mandan tutear · no copiar', async () => {
    const j = await armar(INFO_REAL())
    const t = j.cuerpo.task as string
    expect(t).toContain('E) LA VOZ')
    expect(t).toMatch(/\[2026-\d\d-\d\d\] «/)
    expect(t).toMatch(/TUTEA siempre/)
    expect(t).toMatch(/no los copies/i)
    expect(t).not.toMatch(/#syntropic/) // la cola de hashtags no entra
    expect(j.voz_resumen.textos).toBeGreaterThan(3)
  })
  it('sin textos propios ⇒ el pedido lo DECLARA («sin textos propios de referencia»)', async () => {
    const j = await armar({ sedes_info: { sedes: SEDES(), textos_propios: [], descartes: [] } })
    expect(j.cuerpo.task).toMatch(/No hay textos de posts propios del cliente guardados/)
    expect(j.voz_resumen.textos).toBe(0)
  })
})

describe('⑦ el chequeo compara el HORARIO de la pieza con lo que el sistema vio', () => {
  const pieza = (texto: string) => ({ titular: 'Ceviche de Olón · $7', texto_principal: texto, prompt_imagen: 'Un plato de ceviche sobre la mesa', fuente_imagen: 'cliente', no_pude_cumplir: [], que_miro: ['x'] })
  const herr = { horarioDeTexto: S.horarioDeTexto, canonicoHorario: S.canonicoHorario, describirHorario: S.describirHorario }
  const flt = (r: { hallazgos: { chequeo: string; detalle: string }[] }) => r.hallazgos.filter((h) => h.chequeo === 'horario_sin_respaldo')
  it('el horario de la pieza real (jueves a lunes 7am a 3pm) está respaldado por Guayaquil ⇒ sin hallazgo', () => {
    expect(flt(CH.chequearPieza(BRIEF, pieza('Delivery Guayaquil, de jueves a lunes de 7am a 3pm. Escríbenos.'), { forbidden_words: [] }, SEDES(), herr))).toEqual([])
  })
  it('🔴 un horario que NINGUNA sede tiene verificado ⇒ hallazgo con lo que el sistema vio de cada sede', () => {
    const h = flt(CH.chequearPieza(BRIEF, pieza('Abrimos de lunes a viernes de 9am a 5pm.'), { forbidden_words: [] }, SEDES(), herr))
    expect(h).toHaveLength(1)
    expect(h[0].detalle).toMatch(/lunes a viernes 09:00–17:00/)
    expect(h[0].detalle).toMatch(/Guayaquil: jueves a lunes 07:00–15:00/)
    expect(h[0].detalle).toMatch(/Olon: jueves a lunes 08:00–16:00/)
    expect(h[0].detalle).toMatch(/no el dueño/)
  })
  it('sedes con el horario en CONFLICTO o SIN DATO nunca respaldan: la pieza que afirma un horario se declara', () => {
    const sin = [{ ciudad: 'Cuenca', horario: { estado: 'sin_dato', valor: null, fuentes: [] } }, { ciudad: 'Loja', horario: { estado: 'conflicto', valor: null, fuentes: [] } }]
    const h = flt(CH.chequearPieza(BRIEF, pieza('Abrimos de lunes a viernes de 9am a 5pm.'), { forbidden_words: [] }, sin, herr))
    expect(h[0].detalle).toMatch(/Cuenca: sin dato · Loja: las fuentes no coinciden/)
  })
  it('🔴 aunque una sede en CONFLICTO (o sin dato) trajera un horario adjunto, NO respalda a la pieza: sólo respaldan «coincide» y «una fuente»', () => {
    const horario = S.horarioDeTexto('lunes a viernes de 9am a 5pm')
    const raras = [{ ciudad: 'Cuenca', horario: { estado: 'conflicto', valor: null, norm: horario, fuentes: [] } }, { ciudad: 'Loja', horario: { estado: 'sin_dato', valor: null, norm: horario, fuentes: [] } }]
    expect(flt(CH.chequearPieza(BRIEF, pieza('Abrimos de lunes a viernes de 9am a 5pm.'), { forbidden_words: [] }, raras, herr))).toHaveLength(1)
    const buena = [{ ciudad: 'Cuenca', horario: { estado: 'una_fuente', valor: 'x', norm: horario, fuentes: [] } }]
    expect(flt(CH.chequearPieza(BRIEF, pieza('Abrimos de lunes a viernes de 9am a 5pm.'), { forbidden_words: [] }, buena, herr))).toEqual([])
  })
  it('sin sedes registradas el hallazgo lo dice · sin lectura de sedes (null) NO se corre el chequeo (no se inventa una verificación)', () => {
    expect(flt(CH.chequearPieza(BRIEF, pieza('de lunes a viernes de 9am a 5pm'), { forbidden_words: [] }, [], herr))[0].detalle).toMatch(/no tiene sedes registradas/)
    expect(flt(CH.chequearPieza(BRIEF, pieza('de lunes a viernes de 9am a 5pm'), { forbidden_words: [] }, null, herr))).toEqual([])
    expect(flt(CH.chequearPieza(BRIEF, pieza('de lunes a viernes de 9am a 5pm'), { forbidden_words: [] }))).toEqual([]) // la firma de siempre sigue funcionando
  })
  it('una pieza que no afirma ningún horario no recibe el hallazgo', () => {
    expect(flt(CH.chequearPieza(BRIEF, pieza('El ceviche que viene de Olón. Escríbenos.'), { forbidden_words: [] }, SEDES(), herr))).toEqual([])
  })
  it('por el NODO real: la pieza guardada trae las sedes, lo descartado y la voz en su provenance · y el hallazgo del horario', async () => {
    const c = {
      client_id: CID, client_name: 'Náufrago', brief_id: 'BRF-0006', parte_id: 'p1', brief: BRIEF, dry_run: false, tope_usd: 0.6, llego_la_vuelta: true,
      texto: JSON.stringify({ pieza: pieza('Delivery Guayaquil, de lunes a viernes de 9am a 5pm.') }), forbidden_words: [], manual_id: 'm', manual_version: 2, plan_id: 'pl',
      fotos_en_la_tabla: 1, fotos_enviadas: 1, fotos_no_enviadas: [], fotos_excluidas: [], sin_fotos: false, cuerpo: { dry_run: false, max_budget_usd: 0.6 },
      sedes_resumen: { leidas: true, sedes: [{ ciudad: 'Guayaquil', horario: 'una_fuente', direccion: 'una_fuente', canal_pedido: 'coincide' }], descartes: [{ fuente: 'mapas', motivo: 'la ficha «El Naufrago Marisquería» es de «Gualaceo»' }] },
      sedes_resueltas: SEDES(), voz_resumen: { textos: 8, fechas: ['2026-05-24'] },
    }
    const j = (await correrNodo('chequeos', { input: [{}], refs: { '⑥ ¿Llegó la vuelta?': c } }))[0].json
    expect(j.por_chequeo.horario_sin_respaldo).toBe(1)
    expect(j.fila_pieza.provenance_tag.sedes).toMatchObject({ leidas: true, descartes: [{ fuente: 'mapas' }] })
    expect(j.fila_pieza.provenance_tag.voz).toEqual({ textos: 8, fechas: ['2026-05-24'] })
    expect(j.pieza_md).toMatch(/## Sedes y voz que se le dieron al productor/)
    expect(j.pieza_md).toMatch(/DESCARTADO: la ficha «El Naufrago Marisquería» es de «Gualaceo»/)
    expect(j.pieza_md).toMatch(/VOZ: 8 texto\(s\)/)
  })
})

describe('el grafo: la lectura de sedes es un paso del camino, sin reintento y agnóstico', () => {
  const flujo = construirFlujo()
  const nodo = (n: string) => flujo.nodes.find((x: { name: string }) => x.name === n)
  it('ficha → sedes → guarda → cuerpo → salud → guarda de salud → productor (en serie, el orden lo da el grafo)', () => {
    const sig = (n: string) => flujo.connections[n].main[0][0].node
    expect([sig(N.ficha), sig(N.sedes), sig(N.guardaSedes), sig(N.cuerpo), sig(N.salud), sig(N.guardaSalud)]).toEqual([N.sedes, N.guardaSedes, N.cuerpo, N.salud, N.guardaSalud, N.productor])
  })
  it('el nodo de sedes: POST a la ruta del recolector con la llave interna y el client_id del sobre · SIN reintento · entrega salida siempre y la GUARDA decide', () => {
    const n = nodo(N.sedes)
    expect(n.parameters.url).toBe('https://zero-risk-platform.vercel.app/api/clients/sedes/recolectar')
    expect(n.parameters.method).toBe('POST')
    expect(JSON.stringify(n.parameters.headerParameters)).toMatch(/x-api-key.*INTERNAL_API_KEY/)
    expect(n.parameters.jsonBody).toContain(`$('${N.sobre}').first().json.client_id`)
    expect(n.retryOnFail).toBeUndefined()
    expect(n.alwaysOutputData).toBe(true)
    expect(n.onError).toBe('continueRegularOutput')
  })
  it('🔴 AGNÓSTICO: ni la lógica de sedes ni los nodos nombran a un cliente', () => {
    for (const f of ['n5-armar-cuerpo.js', 'n5c-guarda-sedes-y-voz.js', 'pieza-chequeos.js', 'n7-chequeos-nodo.js']) expect(readFileSync(join(DIR, f), 'utf8'), f).not.toMatch(/Náufrago|naufrago|Olón|Guayaquil/i)
    expect(readFileSync(join(process.cwd(), 'src', 'lib', 'sedes', 'sedes-logica.js'), 'utf8')).not.toMatch(/Náufrago|naufrago|Olón|Guayaquil/i)
    expect(readFileSync(join(process.cwd(), 'src', 'lib', 'sedes', 'recolectar.ts'), 'utf8')).not.toMatch(/Náufrago|naufrago|Olón|Guayaquil/i)
  })
})

describe('las migraciones (sin aplicar) y la ruta del recolector', () => {
  const mig = (f: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', f), 'utf8')
  it('client_sedes y client_sede_datos: restricciones, índice único anti-duplicado, RLS y permisos en la MISMA migración (una tabla nueva sin ellos no la ve PostgREST)', () => {
    const m = mig('202610020200_client_sedes.sql')
    expect(m).toMatch(/CREATE TABLE IF NOT EXISTS public\.client_sedes/)
    expect(m).toMatch(/CREATE TABLE IF NOT EXISTS public\.client_sede_datos/)
    expect(m).toMatch(/campo\s+text NOT NULL CHECK \(campo IN \('direccion','horario','canal_pedido'\)\)/)
    expect(m).toMatch(/fuente\s+text NOT NULL CHECK \(fuente IN \('sitio','instagram','mapas'\)\)/)
    expect(m).toMatch(/CHECK \(\(alcance = 'cuenta'\) = \(sede_id IS NULL\)\)/)
    expect(m).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS client_sedes_uq ON public\.client_sedes \(client_id, clave\)/)
    expect(m).toMatch(/observado_en\s+timestamptz NOT NULL/)
    for (const t of ['client_sedes', 'client_sede_datos']) {
      expect(m).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)
      expect(m).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${t} TO service_role`)
      expect(m).toMatch(new RegExp(`CREATE POLICY \\w+ ON public\\.${t} FOR ALL TO service_role`))
    }
    expect(m).not.toMatch(/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/i) // aditiva: no toca nada existente
  })
  it('🔴 «Mapas» NO puede crear una sede: la columna de fuente de las sedes no existe (las sedes no llevan fuente; sólo los datos) y el código del recolector sólo crea sedes desde las sedes descubiertas', () => {
    const r = readFileSync(join(process.cwd(), 'src', 'lib', 'sedes', 'recolectar.ts'), 'utf8')
    expect(r).toMatch(/const sedesDeclaradas = L\.descubrirSedes\(obs\)/) // se calcula ANTES de leer las fichas de Mapas
    expect(r.indexOf('const sedesDeclaradas')).toBeLessThan(r.indexOf("filter((x) => x.apify_function !== 'instagram_scraper')"))
    expect(r).toMatch(/faltantes = sedesDeclaradas\.filter/)
  })
  it('retirar el trozo 343bed5c: UN solo borrado, atado por id + cliente + sección + origen del raspado + texto, idempotente, sin tocar nada si no coincide', () => {
    const m = mig('202610020100_retirar_trozo_gualaceo_343bed5c.sql')
    expect((m.match(/DELETE FROM/g) || []).length).toBe(1)
    for (const c of ["id = '343bed5c-2333-4ea7-8f1b-5ef320269a29'", "client_id = '41dd3d62-d6de-4c9a-9996-6df78c1da118'", "section_label = 'google_maps_competitive'", "metadata->>'apify_function' = 'google_maps_scraper'", "chunk_text LIKE '%Gualaceo%'"]) {
      expect((m.match(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, c).toBe(2) // en la comprobación y en el borrado
    }
    expect(m).toMatch(/IF encontrados = 0 THEN[\s\S]*RETURN;/)
    expect(m).toMatch(/IF borrados <> 1 THEN\s+RAISE EXCEPTION/)
    expect(m).not.toMatch(/TRUNCATE|DROP/i)
    expect(m).toMatch(/NO APLICADA al escribirse/)
  })
  it('la ruta del recolector exige la llave interna, valida el uuid y devuelve 200 con {ok:false} si falla (la pieza lo declara)', () => {
    const r = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'clients', 'sedes', 'recolectar', 'route.ts'), 'utf8')
    expect(r).toMatch(/checkInternalKey\(request\)/)
    expect(r).toMatch(/status: 401/)
    expect(r).toMatch(/client_id debe ser un uuid/)
    expect(r).toMatch(/status: 400/)
    expect(r).toMatch(/recolectarSedes\(getSupabaseAdmin\(\), clientId\)/)
  })
})
