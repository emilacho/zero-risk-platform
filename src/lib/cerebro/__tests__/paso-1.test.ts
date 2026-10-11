/**
 * PASO 1 del cerebro (renglones 10 y 11 del tablero) · pruebas escritas ANTES del código.
 *   1. la decisión del dueño (aprobar · rechazar · pedir cambio) atada a UNA versión de la cosa, y siempre junto a la cosa;
 *   2. las fotos, logos y portadas PROPIOS no vencen (una clase propia para archivos), sin que dejen de vencer lo demás.
 * Datos de prueba en base simulada: hoy no hay decisiones reales de piezas (la pantalla no existe), y así se declara.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import { entregarContenido } from '../portero/entregar'
import { numerarLista } from '../portero/lista-numerada'
import { PLAZOS_EN_DIAS, cargarPlazos } from '../plazos'
import type { Ficha, ListaCorta } from '../tipos'
import { A, AHORA, Z, crearBaseFalsa, tablasDeLaBase, type Tablas } from './casos'
import fs from 'node:fs'
import path from 'node:path'

const DIA = 86_400_000
const dia = (n: number): string => new Date(AHORA.getTime() - n * DIA).toISOString()
const P = 'ffffffff-0000-4000-8000-00000000000f'
const Q = 'eeeeeeee-0000-4000-8000-00000000000e'
const REF = (id: string) => `client_historical_outputs:${id}`

const pieza = (id: string, status: string, creado: number, extra: Record<string, unknown> = {}, cliente = P) => ({
  id, client_id: cliente, output_type: 'campaign_piece', title: `Pieza ${id}`, status, created_at: dia(creado), content_text: `texto completo de la pieza ${id}`,
  provenance_tag: { brief_id: 'E-9', parte_id: 'part-9' }, hitl_verdict: null, human_edits: null, ...extra,
})
const decision = (id: string, status: string, outputId: string | null, hace: number, extra: Record<string, unknown> = {}, cliente = P) => ({
  id, client_id: cliente, type: 'pieza_aprobacion', status, output_id: outputId, decision: {}, resolution_notes: null, resolved_at: dia(hace), created_at: dia(hace + 1), ...extra,
})
const tablas = (outputs: Array<Record<string, unknown>>, hitl: Array<Record<string, unknown>>, imagenes: Array<Record<string, unknown>> = []): Tablas => ({
  clients: [{ id: P, name: 'Cliente P', website_url: 'https://p.example', status: 'active', config: {} }, { id: Q, name: 'Cliente Q', website_url: 'https://q.example', status: 'active', config: {} }],
  client_historical_outputs: outputs, hitl_queue: hitl, client_social_images: imagenes,
})
const listaDe = async (t: Tablas, cliente = P, fallan: string[] = []) => construirListaCorta(crearBaseFalsa(t, fallan).consulta, cliente, { ahora: AHORA })
const de = (l: ListaCorta, ref: string): Ficha => {
  const f = l.lineas.find((x) => x.ref === ref)
  if (!f) throw new Error(`falta en la lista: ${ref} · hay: ${l.lineas.map((x) => x.ref).join(', ')}`)
  return f
}

describe('1 · la decisión del dueño queda atada a UNA versión de la cosa', () => {
  it('APROBAR: la versión aprobada es la vigente aunque haya un borrador más nuevo, aunque la aprobación solo conste en la cola de revisión', async () => {
    const l = await listaDe(tablas(
      [pieza('v1', 'draft', 20), pieza('v2', 'draft', 10), pieza('v3', 'draft', 3)],
      [decision('h1', 'approved', 'v2', 8)],
    ))
    const v1 = de(l, REF('v1')), v2 = de(l, REF('v2')), v3 = de(l, REF('v3'))
    expect([v2.version, v2.vigente, v2.reemplazada, v2.estado]).toEqual([2, true, false, 'aprobado'])
    expect([v3.version, v3.vigente, v3.reemplazada]).toEqual([3, false, true]) // el borrador más nuevo NO desplaza a la aprobada
    expect(v3.ref_de_la_vigente).toBe(REF('v2'))
    expect(v1.ref_de_la_vigente).toBe(REF('v2'))
    expect(v2.ref_de_la_vigente).toBeUndefined()
    expect(v2.decision_del_dueno).toMatchObject({ decision: 'aprobada', version: 2, ref_de_la_decision: 'hitl_queue:h1' })
    expect(v3.decision_del_dueno).toBeUndefined()
    const d = de(l, 'hitl_queue:h1')
    expect([d.decision, d.de_la_cosa, d.version_decidida]).toEqual(['aprobada', REF('v2'), 2])
  })

  it('RECHAZAR: la versión rechazada no es la aprobada; la anterior aprobada sigue vigente', async () => {
    const l = await listaDe(tablas([pieza('v1', 'approved', 20), pieza('v2', 'draft', 10)], [decision('h1', 'rejected', 'v2', 8)]))
    const v1 = de(l, REF('v1')), v2 = de(l, REF('v2'))
    expect([v1.vigente, v1.estado]).toEqual([true, 'aprobado'])
    expect([v2.vigente, v2.reemplazada, v2.estado]).toEqual([false, true, 'rechazado'])
    expect(v2.decision_del_dueno).toMatchObject({ decision: 'rechazada', version: 2 })
    expect(de(l, 'hitl_queue:h1')).toMatchObject({ decision: 'rechazada', version_decidida: 2 })
  })

  it('PEDIR CAMBIO: queda atado a su versión, lleva lo que se pidió y NO aprueba', async () => {
    const l = await listaDe(tablas(
      [pieza('v1', 'approved', 20), pieza('v2', 'draft', 10)],
      [decision('h1', 'edited', 'v2', 8, { decision: { cambio: 'más corto y sin el segundo párrafo' }, resolution_notes: 'ajustar el cierre' })],
    ))
    const v2 = de(l, REF('v2'))
    expect(de(l, REF('v1')).vigente).toBe(true)
    expect(v2.vigente).toBe(false)
    expect(v2.estado).toBe('borrador sin aprobar')
    expect(v2.decision_del_dueno).toMatchObject({ decision: 'cambio_pedido', version: 2 })
    expect(v2.decision_del_dueno?.detalle).toMatch(/más corto/)
    expect(v2.decision_del_dueno?.detalle).toMatch(/ajustar el cierre/)
    expect(de(l, 'hitl_queue:h1')).toMatchObject({ decision: 'cambio_pedido', version_decidida: 2 })
  })

  it('la ÚLTIMA decisión sobre una versión manda, sin importar el orden en que lleguen las filas', async () => {
    for (const orden of [[0, 1], [1, 0]]) {
      const hitl = [decision('h1', 'approved', 'v1', 9), decision('h2', 'rejected', 'v1', 5)]
      const l = await listaDe(tablas([pieza('v1', 'draft', 20)], orden.map((i) => hitl[i])))
      const v1 = de(l, REF('v1'))
      expect(v1.decision_del_dueno).toMatchObject({ decision: 'rechazada', ref_de_la_decision: 'hitl_queue:h2' })
      expect(v1.estado).toBe('rechazado')
      expect(de(l, 'hitl_queue:h1').decision).toBe('aprobada') // el historial de decisiones sigue listado
    }
    const l = await listaDe(tablas([pieza('v1', 'draft', 20)], [decision('h1', 'approved', 'v1', 9), decision('h2', 'edited', 'v1', 5)]))
    expect(de(l, REF('v1')).decision_del_dueno?.decision).toBe('cambio_pedido')
    expect(de(l, REF('v1')).estado).toBe('borrador sin aprobar') // pidió un cambio después de aprobar: ya no está aprobada
  })

  it('una aprobación más NUEVA que una pieza «aprobada» por su estado la reemplaza: lo que manda es la decisión del dueño', async () => {
    const l = await listaDe(tablas([pieza('v1', 'approved', 20), pieza('v2', 'approved', 10)], [decision('h1', 'rejected', 'v2', 4)]))
    expect(de(l, REF('v2')).estado).toBe('rechazado')
    expect(de(l, REF('v1')).vigente).toBe(true)
  })

  it('una decisión SIN cosa (output_id nulo) o de una cosa que ya no está queda listada, sin versión y sin inventar de quién es', async () => {
    const l = await listaDe(tablas([pieza('v1', 'draft', 20)], [
      decision('h1', 'approved', null, 8),
      decision('h2', 'approved', 'no-existe', 7),
    ]))
    const sin = de(l, 'hitl_queue:h1'), huerfana = de(l, 'hitl_queue:h2')
    expect(sin.de_la_cosa).toBeUndefined()
    expect(sin.version_decidida).toBeUndefined()
    expect(huerfana.de_la_cosa).toBe(REF('no-existe'))
    expect(huerfana.version_decidida).toBeNull()
    expect(huerfana.aviso).toMatch(/ya no está/)
    expect(de(l, REF('v1')).decision_del_dueno).toBeUndefined()
  })

  it('las decisiones pendientes o en revisión NO cuentan', async () => {
    const l = await listaDe(tablas([pieza('v1', 'draft', 20)], [decision('h1', 'pending', 'v1', 8), decision('h2', 'in_review', 'v1', 7), decision('h3', 'expired', 'v1', 6)]))
    expect(l.lineas.filter((f) => f.clase === 'decision_del_aprobador')).toHaveLength(0)
    expect(de(l, REF('v1')).decision_del_dueno).toBeUndefined()
    expect(de(l, REF('v1')).estado).toBe('borrador sin aprobar')
  })

  it('una decisión de OTRO cliente no cruza: ni aparece en esta lista ni se ata a una versión ajena, aunque nombre su pieza', async () => {
    const t = tablas(
      [pieza('p1', 'draft', 20), pieza('q1', 'draft', 20, {}, Q)],
      [decision('hq', 'approved', 'q1', 5, {}, Q), decision('hp', 'approved', 'q1', 4, {}, P)], // una decisión de P que apunta a la pieza de Q
    )
    const lp = await listaDe(t, P)
    expect(lp.lineas.some((f) => f.ref === REF('q1'))).toBe(false)
    expect(de(lp, 'hitl_queue:hp').version_decidida).toBeNull() // no se ata a la pieza de otro cliente
    expect(lp.lineas.some((f) => f.ref === 'hitl_queue:hq')).toBe(false)
    const lq = await listaDe(t, Q)
    expect(de(lq, REF('q1')).decision_del_dueno).toMatchObject({ decision: 'aprobada', ref_de_la_decision: 'hitl_queue:hq' })
  })

  it('una pieza de PRUEBA (prueba_*) no cuenta como versión y su decisión no aprueba nada', async () => {
    const l = await listaDe(tablas([pieza('v1', 'draft', 20), pieza('vt', 'draft', 5, { provenance_tag: { brief_id: 'E-9', parte_id: 'part-9', prueba_paso1: true } })], [decision('h1', 'approved', 'vt', 3)]))
    expect(l.lineas.some((f) => f.ref === REF('vt'))).toBe(false)
    expect(de(l, REF('v1')).decision_del_dueno).toBeUndefined()
    expect(de(l, 'hitl_queue:h1').version_decidida).toBeNull()
  })

  it('r63 · la fila `manual_sacado_en_origen` (registro interno de lo que el chequeo sacó) no entra al catálogo ni cuenta como versión', async () => {
    const interna = pieza('ms', 'draft', 2, { output_type: 'manual_sacado_en_origen', title: 'Manual de marca · lo sacado por no tener fuente' })
    const l = await listaDe(tablas([pieza('v1', 'draft', 20), interna], []))
    expect(l.lineas.some((f) => f.ref === REF('ms'))).toBe(false)
    expect(l.lineas.some((f) => f.ref === REF('v1'))).toBe(true)
    expect(de(l, REF('v1')).vigente).toBe(true) // y no desplaza a la pieza real
  })

  it('sin ninguna decisión todo queda como antes: manda la última aprobada por su estado', async () => {
    const l = await listaDe(tablas([pieza('v1', 'approved', 20), pieza('v2', 'draft', 10)], []))
    expect([de(l, REF('v1')).vigente, de(l, REF('v2')).vigente]).toEqual([true, false])
    expect(l.lineas.some((f) => f.decision_del_dueno)).toBe(false)
    expect(l.estado).toBe('ok')
  })

  it('el veredicto guardado EN la pieza (hitl_verdict / human_edits) también se ata a la versión de esa pieza', async () => {
    const l = await listaDe(tablas([
      pieza('v1', 'approved', 20, { hitl_verdict: 'aprobada', human_edits: 'cambié el segundo párrafo' }),
      pieza('v2', 'draft', 10, { human_edits: 'acortar el cierre' }),
      pieza('v3', 'draft', 5, { hitl_verdict: 'veredicto raro' }),
    ], []))
    expect(de(l, `${REF('v1')}#decision`)).toMatchObject({ decision: 'aprobada', de_la_cosa: REF('v1'), version_decidida: 1 })
    expect(de(l, `${REF('v2')}#decision`)).toMatchObject({ decision: 'cambio_pedido', de_la_cosa: REF('v2'), version_decidida: 2 })
    const raro = de(l, `${REF('v3')}#decision`)
    expect(raro.decision).toBeUndefined() // no se inventa lo que no se sabe leer
    expect([raro.de_la_cosa, raro.version_decidida]).toEqual([REF('v3'), 3])
    expect(de(l, REF('v1')).decision_del_dueno).toMatchObject({ decision: 'aprobada', version: 1 })
  })

  it('la línea que ve el modelo lleva la decisión JUNTO a la cosa (versión y decisión)', async () => {
    const l = await listaDe(tablas([pieza('v1', 'draft', 20), pieza('v2', 'draft', 10), pieza('v3', 'draft', 3)], [decision('h1', 'approved', 'v2', 8)]))
    const n = numerarLista(l)
    const linea = n.texto.split('\n').find((x) => x.includes('Pieza v2'))!
    expect(linea).toMatch(/decisión del dueño: aprobada \(v2\)/)
    expect(n.texto.split('\n').filter((x) => x.includes('Pieza v3') || x.includes('Pieza v1'))).toHaveLength(0) // las reemplazadas no se listan
  })

  it('si la cola de revisión no se puede leer: la pieza se lista pero la lista queda PARCIAL y la pieza lo dice; jamás «no hay decisiones»', async () => {
    const l = await listaDe(tablas([pieza('v1', 'draft', 20)], [decision('h1', 'approved', 'v1', 8)]), P, ['hitl_queue'])
    expect(l.estado).toBe('parcial')
    expect(l.fuentes.decisiones_del_aprobador.estado).toBe('error_de_lectura')
    expect(l.fuentes.trabajos_hechos.estado).toBe('error_de_lectura')
    const v1 = de(l, REF('v1'))
    expect(v1.aviso).toMatch(/decisiones del dueño no se pudieron leer/)
    expect(v1.decision_del_dueno).toBeUndefined()
  })

  it('si falla SOLO la lectura de la cola dentro de las piezas (la otra lectura de la cola responde), la lista igual queda PARCIAL', async () => {
    const t = tablas([pieza('v1', 'draft', 20)], [decision('h1', 'approved', 'v1', 8)])
    const base = crearBaseFalsa(t)
    let llamadasALaCola = 0
    const consulta: typeof base.consulta = async (p) => (p.tabla === 'hitl_queue' && ++llamadasALaCola === 1 ? { filas: [], error: 'fallo simulado de la primera lectura de la cola' } : base.consulta(p))
    const l = await construirListaCorta(consulta, P, { ahora: AHORA })
    expect(llamadasALaCola).toBe(2) // las dos lecturas de la cola ocurren
    expect(l.fuentes.trabajos_hechos.estado).toBe('error_de_lectura')
    expect(l.fuentes.decisiones_del_aprobador.estado).toBe('ok')
    expect(l.estado).toBe('parcial')
  })

  it('cada lectura nueva lleva el filtro del cliente y ninguna es de escritura', async () => {
    const b = crearBaseFalsa(tablas([pieza('v1', 'draft', 20)], [decision('h1', 'approved', 'v1', 8)]))
    await construirListaCorta(b.consulta, P, { ahora: AHORA })
    for (const p of b.llamadas) expect(p.tabla === 'clients' ? p.donde.id : p.donde.client_id, p.tabla).toBe(P)
    expect(b.llamadas.filter((p) => p.tabla === 'hitl_queue').length).toBeGreaterThan(0)
  })
})

describe('1 · la decisión llega SIEMPRE junto a la cosa, también al entregarla', () => {
  const entregar = async (t: Tablas, refs: string[]) => (await entregarContenido(crearBaseFalsa(t).consulta, { cliente: P, refs }, { ahora: AHORA })).cuerpo as Record<string, any>
  const t = () => tablas([pieza('v1', 'draft', 20), pieza('v2', 'draft', 10), pieza('v3', 'draft', 3)], [decision('h1', 'edited', 'v3', 2, { decision: { cambio: 'más corto' } }), decision('h2', 'approved', 'v2', 8)])

  it('al entregar la versión VIGENTE trae su versión, su decisión y que es la vigente, sin pedir la decisión aparte', async () => {
    const c = await entregar(t(), [REF('v2')])
    const m = c.material[0]
    expect(m).toMatchObject({ ref: REF('v2'), version: 2, vigente: true })
    expect(m.decision_del_dueno).toMatchObject({ decision: 'aprobada', version: 2, ref_de_la_decision: 'hitl_queue:h2' })
    expect(m.estado).toBe('aprobado')
  })
  it('al entregar una versión que NO es la vigente lo avisa y dice cuál es la vigente (la aprobada), con su decisión de cambio', async () => {
    const c = await entregar(t(), [REF('v3')])
    const m = c.material[0]
    expect(m).toMatchObject({ version: 3, vigente: false, reemplazada: true, ref_de_la_vigente: REF('v2') })
    expect(m.aviso).toMatch(/NO es la versión vigente/)
    expect(m.aviso).toMatch(new RegExp(REF('v2')))
    expect(m.decision_del_dueno).toMatchObject({ decision: 'cambio_pedido', version: 3 })
    expect(m.decision_del_dueno.detalle).toMatch(/más corto/)
  })
  it('una versión sin decisión trae `decision_del_dueno: null` (se dice que no la hay; no se calla)', async () => {
    const c = await entregar(t(), [REF('v1')])
    expect(c.material[0].decision_del_dueno).toBeNull()
  })
  it('lo que no tiene versiones (una sede, una foto) no trae esos campos', async () => {
    const c = await entregarContenido(crearBaseFalsa(tablasDeLaBase()).consulta, { cliente: A, refs: ['client_sedes:sd-n'] }, { ahora: AHORA })
    const m = (c.cuerpo.material as Array<Record<string, unknown>>)[0]
    expect(m).not.toHaveProperty('decision_del_dueno')
    expect(m).not.toHaveProperty('version')
  })
  it('si se pide SOLO la línea de la decisión, trae a qué cosa y a qué versión se refiere', async () => {
    const c = await entregar(t(), ['hitl_queue:h2'])
    expect(c.material[0]).toMatchObject({ ref: 'hitl_queue:h2', decision: 'aprobada', de_la_cosa: REF('v2'), version_decidida: 2 })
  })
})

describe('2 · las fotos, logos y portadas PROPIOS no vencen (una clase propia para archivos)', () => {
  const imagen = (id: string, rol: string, medio: string, creado: number, extra: Record<string, unknown> = {}) => ({
    id, client_id: P, owner_role: rol, handle: 'cuenta', post_id: id, tipo: medio === 'logo' ? 'logo' : 'post_imagen', medio, estado: 'ok', url: `https://bucket/${id}.jpg`,
    caption: `texto ${id}`, posted_at: dia(creado), post_url: `https://red/${id}`, posicion: 'unica', producto: [], created_at: dia(creado), ...extra,
  })

  it('plazos.json tiene la clase `archivo_propio` en «no vence»; las demás clases de texto y de perfil siguen igual', () => {
    const crudo = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../plazos.json'), 'utf8')) as { plazos: Record<string, unknown>; que_es_cada_uno: Record<string, string> }
    expect(crudo.plazos.archivo_propio).toBeNull()
    expect(crudo.que_es_cada_uno.archivo_propio).toMatch(/foto|archivo/i)
    expect(PLAZOS_EN_DIAS.archivo_propio).toBeNull()
    expect(PLAZOS_EN_DIAS).toMatchObject({ precio_oferta_horario: 7, catalogo_y_direccion: 30, publicacion_propia: 14, perfil_propio: 30, ficha_mapas_propia: 30, anuncio_competencia: 14, sitio_competencia: 30, plan: 90, normativa: 180, configuracion_externa: 30, sin_plazo: null })
    expect(cargarPlazos({ unidad: 'dias', plazos: { archivo_propio: null } }).archivo_propio).toBeNull()
  })

  it('una foto propia, una portada de video propia y un logo propio de hace muchísimo tiempo NO salen vencidos y no llevan aviso', async () => {
    const l = await listaDe(tablas([], [], [imagen('f1', 'propio', 'imagen', 400), imagen('r1', 'propio', 'reel', 400), imagen('l1', 'propio', 'logo', 400, { post_id: null, caption: null, posted_at: null, post_url: null })]))
    for (const id of ['f1', 'r1', 'l1']) {
      const f = de(l, `client_social_images:${id}`)
      expect([f.vencido, f.vigente_hasta, f.aviso], id).toEqual([false, null, undefined])
    }
    expect(['foto', 'portada_de_video', 'logo']).toEqual(['f1', 'r1', 'l1'].map((id) => de(l, `client_social_images:${id}`).clase))
  })

  it('una foto o anuncio de un COMPETIDOR sí sigue venciendo (es un anuncio, no un archivo propio)', async () => {
    const l = await listaDe(tablas([], [], [imagen('c1', 'competidor', 'imagen', 40), imagen('c2', 'competidor', 'imagen', 3)]))
    expect(de(l, 'client_social_images:c1').vencido).toBe(true)
    expect(de(l, 'client_social_images:c1').aviso).toMatch(/^VENCIDO/)
    expect(de(l, 'client_social_images:c2').vencido).toBe(false)
  })

  it('en la base de ejemplo: la portada de hace 40 días y el logo ya no vencen; los precios, horarios, direcciones y páginas siguen venciendo igual', async () => {
    const l = await construirListaCorta(crearBaseFalsa(tablasDeLaBase()).consulta, A, { ahora: AHORA })
    expect(de(l, 'client_social_images:im-2').vencido).toBe(false) // reel propio de hace 40 días (antes vencía a los 14)
    expect(de(l, 'client_social_images:im-4').vencido).toBe(false) // logo de hace 40 días (antes vencía a los 30)
    expect(de(l, 'client_social_images:im-3').vencido).toBe(false) // competidor, 3 días
    expect(de(l, 'client_sede_datos:dat-3').vencido).toBe(true) // horario según mapas, 15 días: plazo 7
    expect(de(l, 'client_sede_datos:dat-4').vencido).toBe(true) // dirección, 65 días: plazo 30
    expect(de(l, 'client_web_pages:wp-a1').vencido).toBe(true) // página propia, 46 días: plazo 30
    expect(l.lineas.filter((f) => f.clase === 'catalogo_item').every((f) => f.vencido)).toBe(true) // precio: plazo 7
  })

  it('el plazo de los archivos es UNA palanca: dándole días por parámetro vuelven a vencer (la línea del lector usa esa clase y no otra)', async () => {
    const b = crearBaseFalsa(tablas([], [], [imagen('f1', 'propio', 'imagen', 40), imagen('l1', 'propio', 'logo', 40, { post_id: null, caption: null, posted_at: null, post_url: null })]))
    const l = await construirListaCorta(b.consulta, P, { ahora: AHORA, plazos: { archivo_propio: 10 } })
    expect(de(l, 'client_social_images:f1').vencido).toBe(true)
    expect(de(l, 'client_social_images:l1').vencido).toBe(true)
    // y cambiar las clases de texto y de perfil NO toca a los archivos
    const m = await construirListaCorta(b.consulta, P, { ahora: AHORA, plazos: { publicacion_propia: 1, perfil_propio: 1 } })
    expect(de(m, 'client_social_images:f1').vencido).toBe(false)
    expect(de(m, 'client_social_images:l1').vencido).toBe(false)
  })

  it('el aviso de un archivo que no se descargó sigue saliendo (no se pierde al quitar el plazo)', async () => {
    const l = await listaDe(tablas([], [], [imagen('f1', 'propio', 'imagen', 400, { estado: 'no_bajo' })]))
    expect(de(l, 'client_social_images:f1').aviso).toBe('archivo no descargado')
  })

  it('el cliente Z: lo suyo no cambia (sin imágenes de otros)', async () => {
    const l = await construirListaCorta(crearBaseFalsa(tablasDeLaBase()).consulta, Z, { ahora: AHORA })
    expect(l.lineas.some((f) => f.ref.includes('im-') && !f.ref.includes('im-z'))).toBe(false)
  })
})
