/** Las dos puertas de «lo que falta lo proponen los agentes» con una base falsa: preparar, aplicar, y que lo propuesto sea lo ÚNICO que cambia. Sin modelo. */
import { describe, expect, it } from 'vitest'
import { rutaAplicarPropuesta, rutaPrepararPropuesta } from '../propuesta-rutas'
import type { Db } from '../revision'

const CID = '22222222-2222-4222-8222-222222222222'
const DRAFT = { client_id: CID, positioning: 'Un negocio local que cuida lo que hace.', mision: '', proposito: 'Que más gente pueda acceder a lo que hacemos.', voice_description: 'Cercana y clara.', personalidad: ['Cercana', 'Directa'], mensajes_clave: ['Hecho con cuidado'], propuestas_de_valor: ['Trato cercano'], tagline_opciones: ['Lema uno'], customer_angle: 'Llega, pide, se va contento.', retention_notes: 'Lo recordamos.', _field_meta: { mision: { estado: 'provisional' } }, campos_provisionales: ['mision'], campos_ausentes: [] }
const CT = JSON.stringify({ brand_book_draft: DRAFT, fidelity_passed: true, fidelity_scores: { positioning: 0.9 }, fidelity_threshold: 0.85, gate_outcome: 'paso_la_vara' })

function base(opciones: { version?: number; contentText?: string } = {}): Db {
  const tablas: Record<string, unknown[]> = {
    clients: [{ id: CID, name: 'Negocio Demo', website_url: 'https://negocio.example', config: { apify: { own_handles: { instagram: 'negocio_demo' } } } }],
    client_brand_books: [{ id: 'b1', version: opciones.version ?? 4, content_text: opciones.contentText ?? CT, created_at: '2026-10-11T00:00:00Z', gate_outcome: 'paso_la_vara' }],
    apify_raw: [{ id: 'r1', apify_function: 'website_content_scraper', params: { url: 'https://negocio.example' }, respuesta: [{ url: 'https://negocio.example', text: 'Somos un negocio local. Atendemos a quien pasa por la zona con cocina de casa.' }], ensayo: false }, { id: 'r2', apify_function: 'instagram_scraper', params: {}, respuesta: [], ensayo: false }],
    client_icp_documents: [],
  }
  return { from: (t: string) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (ok: (v: unknown) => unknown) => ok({ data: tablas[t] ?? [], error: null }) }; return q } } as unknown as Db
}
const RESPUESTA = JSON.stringify({ mision: { texto: 'Ofrecemos cocina de la casa a quienes pasan por la zona.', razon: 'el sitio lo describe así' } })

describe('preparar', () => {
  it('dice qué falta y arma UN pedido para el agente dueño de la misión', async () => {
    const r = await rutaPrepararPropuesta(base(), { client_id: CID, campos: ['mision'] })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, version_base: 4, faltantes: expect.arrayContaining(['mision']) })
    const pedidos = r.body.pedidos as Array<{ agente: string; campos: string[]; task: string }>
    expect(pedidos.length).toBe(1); expect(pedidos[0]).toMatchObject({ agente: 'jefe-client-success', campos: ['mision'] })
    expect(pedidos[0].task).toContain('cocina de casa')
  })
  it('validaciones: cuerpo, uuid, cliente sin manual', async () => {
    expect((await rutaPrepararPropuesta(base(), null)).status).toBe(400)
    expect((await rutaPrepararPropuesta(base(), { client_id: 'x' })).status).toBe(400)
    expect((await rutaPrepararPropuesta(base({ contentText: 'no es json' }), { client_id: CID })).status).toBe(409)
  })
})

describe('aplicar', () => {
  const cuerpo = (extra: Record<string, unknown> = {}) => ({ client_id: CID, dry_run: false, campos: ['mision'], version_base: 4, respuestas: [{ agente: 'jefe-client-success', response: RESPUESTA }], ...extra })
  it('devuelve el cuerpo listo para guardar: SOLO cambia la misión, rotulada; lo demás igual; datos del veredicto de la versión base', async () => {
    const r = await rutaAplicarPropuesta(base(), cuerpo())
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, aplicado: true, aplicadas: ['mision'] })
    expect((r.body.diferencias as Array<{ campo: string }>).map((d) => d.campo)).toEqual(['mision'])
    const pb = r.body.promote_body as { brand_book: Record<string, unknown>; source: string; fidelity_passed: boolean; gate_outcome: string; gate_nota: string }
    expect(pb.brand_book.mision).toBe('Ofrecemos cocina de la casa a quienes pasan por la zona. [propuesta del agente — el sitio lo describe así]')
    for (const k of Object.keys(DRAFT)) if (k !== 'mision' && !k.startsWith('_') && k !== 'campos_provisionales') expect(JSON.stringify(pb.brand_book[k]), k).toBe(JSON.stringify((DRAFT as Record<string, unknown>)[k]))
    expect(pb).toMatchObject({ source: 'propuesta_del_agente', fidelity_passed: true, gate_outcome: 'paso_la_vara' }); expect(pb.gate_nota).toMatch(/mision/)
  })
  it('si el manual cambió desde que se prepararon los pedidos → 409 y no se aplica nada', async () => {
    const r = await rutaAplicarPropuesta(base({ version: 5 }), cuerpo())
    expect(r.status).toBe(409); expect(r.body.error).toBe('el_manual_cambio')
  })
  it('una respuesta ilegible, o de un agente al que no se le pidió, no aplica nada y lo dice', async () => {
    const a = await rutaAplicarPropuesta(base(), cuerpo({ respuestas: [{ agente: 'jefe-client-success', response: 'no pude' }] }))
    expect(a.body).toMatchObject({ ok: true, aplicado: false }); expect((a.body.sin_leer as unknown[]).length).toBe(1)
    const b = await rutaAplicarPropuesta(base(), cuerpo({ respuestas: [{ agente: 'otro', response: RESPUESTA }] }))
    expect(b.body.aplicado).toBe(false)
  })
  it('una propuesta con un hecho sin respaldo se rechaza', async () => {
    const mala = JSON.stringify({ mision: { texto: 'Somos el mejor negocio certificado del país desde 1999.', razon: 'x' } })
    const r = await rutaAplicarPropuesta(base(), cuerpo({ respuestas: [{ agente: 'jefe-client-success', response: mala }] }))
    expect(r.body.aplicado).toBe(false); expect(JSON.stringify(r.body.rechazadas)).toMatch(/sin respaldo/)
  })
  it('dry_run es obligatorio y booleano', async () => {
    expect((await rutaAplicarPropuesta(base(), cuerpo({ dry_run: undefined }))).status).toBe(400)
    expect((await rutaAplicarPropuesta(base(), { client_id: CID, dry_run: true, respuestas: [] })).status).toBe(400)
  })
})

// ───────────────────────── ronda 76 · corrección del dueño: manda, y una propuesta anterior se puede volver a proponer
const PREVIA = 'Atendemos a quienes pasan por la zona en dos ciudades. [propuesta del agente — según la evidencia]'
const DRAFT_V5 = { ...DRAFT, mision: PREVIA, campos_provisionales: [] as string[] }
const baseConDueno = (opciones: { sedesError?: boolean; draft?: Record<string, unknown> } = {}): Db => {
  const ct = JSON.stringify({ brand_book_draft: opciones.draft ?? DRAFT_V5, fidelity_passed: true, gate_outcome: 'paso_la_vara' })
  const tablas: Record<string, unknown[]> = {
    clients: [{ id: CID, name: 'Negocio Demo', website_url: 'https://negocio.example', config: { apify: { own_handles: { instagram: 'negocio_demo' } } } }],
    client_brand_books: [{ id: 'b5', version: 5, content_text: ct, created_at: '2026-10-12T00:00:00Z', gate_outcome: 'paso_la_vara' }],
    apify_raw: [{ id: 'r1', apify_function: 'website_content_scraper', params: { url: 'https://negocio.example' }, respuesta: [{ url: 'https://negocio.example', text: 'Somos un negocio con local en la costa y entregas a domicilio.' }], ensayo: false }],
    client_icp_documents: [],
    client_sedes: [{ id: 's1', clave: 'costa', ciudad: 'Costa' }, { id: 's2', clave: 'capital', ciudad: 'Capital' }],
    client_sede_datos: [
      { sede_id: 's1', campo: 'tipo_de_atencion', valor_texto: 'restaurante (local) y domicilio', fuente: 'dueno', fuente_ref: 'dueño', observado_en: '2026-10-12T10:00:00Z' },
      { sede_id: 's2', campo: 'tipo_de_atencion', valor_texto: 'solo domicilio (sin local)', fuente: 'dueno', fuente_ref: 'dueño', observado_en: '2026-10-12T10:00:00Z' },
      { sede_id: 's2', campo: 'tipo_de_atencion', valor_texto: 'restaurante (local)', fuente: 'dueno', fuente_ref: 'dueño', observado_en: '2026-10-01T10:00:00Z' }, // una corrección anterior: la más nueva gana
    ],
  }
  return { from: (t: string) => { const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (ok: (v: unknown) => unknown) => ok(t === 'client_sedes' && opciones.sedesError ? { data: null, error: { message: 'la base no contestó' } } : { data: tablas[t] ?? [], error: null }) }; return q } } as unknown as Db
}
describe('lo que dijo el dueño manda y llega primero', () => {
  it('el pedido lleva sus datos ANTES del manual y la evidencia, con la corrección más nueva', async () => {
    const r = await rutaPrepararPropuesta(baseConDueno(), { client_id: CID, campos: ['mision'], reproponer: ['mision'] })
    expect(r.status).toBe(200); expect(r.body.datos_del_dueno).toBe(2)
    const t = (r.body.pedidos as Array<{ task: string }>)[0].task
    expect(t).toContain('LO QUE DIJO EL DUEÑO'); expect(t).toContain('sede de Costa · tipo de atencion: restaurante (local) y domicilio (corrección del dueño, 2026-10-12)')
    expect(t).toContain('sede de Capital · tipo de atencion: solo domicilio (sin local)'); expect(t).not.toContain('sede de Capital · tipo de atencion: restaurante (local) (')
    expect(t.indexOf('LO QUE DIJO EL DUEÑO')).toBeLessThan(t.indexOf('EL MANUAL HASTA AHORA')); expect(t.indexOf('LO QUE DIJO EL DUEÑO')).toBeLessThan(t.indexOf('EVIDENCIA DEL CLIENTE'))
    expect(t).toContain('PROPUESTA ANTERIOR QUE SE DESCARTA'); expect(t).toContain('Atendemos a quienes pasan')
  })
  it('sin pedir expresamente volver a proponer, una propuesta anterior NO se pisa; un texto del cliente nunca', async () => {
    const sin = await rutaPrepararPropuesta(baseConDueno(), { client_id: CID, campos: ['mision'] })
    expect(sin.body.pedidos).toEqual([]); expect(JSON.stringify(sin.body.rechazados)).toMatch(/nunca lo pisa/)
    const delCliente = await rutaPrepararPropuesta(baseConDueno({ draft: { ...DRAFT_V5, mision: 'Texto escrito por el cliente.' } }), { client_id: CID, campos: ['mision'], reproponer: ['mision'] })
    expect(delCliente.body.pedidos).toEqual([])
  })
  it('si no se pueden leer sus datos NO se pide nada (no se lee como «el dueño no dijo nada»)', async () => {
    const r = await rutaPrepararPropuesta(baseConDueno({ sedesError: true }), { client_id: CID, campos: ['mision'], reproponer: ['mision'] })
    expect(r.status).toBe(502); expect(JSON.stringify(r.body)).toMatch(/la base no contestó/)
  })
  const resp = JSON.stringify({ mision: { texto: 'Preparamos comida de la casa en nuestro restaurante de la costa y la llevamos a domicilio también en la capital.', razon: 'recoge lo que dijo el dueño sobre cada sede' } })
  it('aplicar: la propuesta nueva REEMPLAZA a la anterior, solo cambia la misión, y el chequeo de hechos acepta lo que respalda el dueño', async () => {
    const r = await rutaAplicarPropuesta(baseConDueno(), { client_id: CID, dry_run: false, campos: ['mision'], reproponer: ['mision'], version_base: 5, respuestas: [{ agente: 'jefe-client-success', response: resp }] })
    expect(r.body).toMatchObject({ ok: true, aplicado: true, aplicadas: ['mision'] })
    const dif = r.body.diferencias as Array<{ campo: string; antes: string; despues: string }>
    expect(dif.map((d) => d.campo)).toEqual(['mision']); expect(dif[0].antes).toBe(PREVIA); expect(dif[0].despues).toMatch(/restaurante de la costa[\s\S]*\[propuesta del agente — recoge/)
  })
  it('aplicar sin «reproponer»: no pisa la propuesta anterior', async () => {
    const r = await rutaAplicarPropuesta(baseConDueno(), { client_id: CID, dry_run: false, campos: ['mision'], version_base: 5, respuestas: [{ agente: 'jefe-client-success', response: resp }] })
    expect(r.body.aplicado).toBe(false)
  })
})
