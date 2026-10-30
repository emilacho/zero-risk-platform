/**
 * 30-oct · «Editar el manual» y «Validar el manual» desde el dashboard (paso 1 de 3). US$ 0.
 * Contrato: RESPUESTA de Cerebro (§1–§4): versión max+1 vigente con _field_meta.<campo>{fuente:'dueno',por,en,valor_anterior,cita}; la anterior queda; después cada campo a la puerta del dueño
 * del cerebro (sin acumula, canal «dashboard · manual», con reintento); validar = la vigente pasa a validada por el dueño; lo que escribe el dueño no lo pisa una corrida posterior.
 */
import { describe, expect, it } from 'vitest'
import { buildBrandBookRow } from '@/app/api/brand-book/[clientId]/route'
import { quienValido } from '../campos-del-manual'
import { conservarLoDelDueno, cuerpoParaElCerebro, editarManualDelDueno, empujarCamposAlCerebro, validarManualDelDueno, EDITABLES_DEL_TABLERO } from '../edicion-del-dueno'
import { rutaEditarManual, rutaValidarManual } from '../edicion-rutas'
import { manualValidar } from '@/lib/oficina/tablero/acciones'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const AHORA = new Date('2026-10-30T16:00:00Z')

function base(extra: Record<string, unknown> = {}) {
  const db = new DbFalsa()
  const draft = { proposito: 'Propósito viejo', mision: 'Misión escrita por el sistema', valores: ['honestidad'], voice_description: 'Voz cálida', _field_meta: { mision: { estado: 'confirmado', fuente: 'sitio', confianza: 0.9 } } }
  db.semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, brand_purpose: 'Propósito viejo', brand_mission: 'Misión escrita por el sistema', brand_values: ['honestidad'], voice_description: 'Voz cálida', tagline: null, content_text: JSON.stringify({ brand_book_draft: draft }), provenance_tag: { type: 'evidence', trust_level: 'untrusted' }, ...extra }])
  return db
}
const versiones = (db: DbFalsa) => [...db.tablas['client_brand_books']].sort((a, b) => Number(a.version) - Number(b.version))
const draftDe = (f: Record<string, unknown>) => (JSON.parse(String(f.content_text)) as { brand_book_draft: Record<string, unknown> }).brand_book_draft

describe('editar el manual · versión nueva con la procedencia del dueño', () => {
  it('una edición crea la versión max+1 vigente, deja la anterior y marca el campo como del dueño con valor anterior y cita', async () => {
    const db = base()
    const r = await editarManualDelDueno(db, { client_id: C, campos: { proposito: 'Que todos coman rico', eslogan: 'Del mar a tu mesa' }, comentario: 'lo dijo el dueño por teléfono', reviewer: 'emilio', ahora: AHORA })
    expect(r).toMatchObject({ ok: true, version_nueva: 2 })
    const [v1, v2] = versiones(db)
    expect(db.tablas['client_brand_books']).toHaveLength(2)
    expect(v1).toMatchObject({ version: 1, brand_purpose: 'Propósito viejo' }) // la anterior NO se toca
    expect(v2).toMatchObject({ version: 2, brand_purpose: 'Que todos coman rico', tagline: 'Del mar a tu mesa', brand_mission: 'Misión escrita por el sistema' })
    const meta = draftDe(v2)._field_meta as Record<string, Record<string, unknown>>
    expect(meta.proposito).toEqual({ fuente: 'dueno', por: 'emilio', en: AHORA.toISOString(), valor_anterior: 'Propósito viejo', cita: 'lo dijo el dueño por teléfono' })
    expect(meta.tagline_opciones).toMatchObject({ fuente: 'dueno', valor_anterior: null })
    expect(meta.mision).toMatchObject({ fuente: 'sitio' }) // lo no tocado conserva su origen
    expect(v2.auto_generated_from).toBe('edicion_del_dueno')
  })
  it('las listas y los campos sin columna también se guardan (valores, lo que nunca dice, público)', async () => {
    const db = base()
    const r = await editarManualDelDueno(db, { client_id: C, campos: { valores: 'honestidad\ncercanía; producto fresco', nunca: 'prometer entregas imposibles', publico: 'Familias de la costa' }, reviewer: 'emilio', ahora: AHORA })
    expect(r.ok).toBe(true)
    const v2 = versiones(db)[1]
    expect(v2.brand_values).toEqual(['honestidad', 'cercanía', 'producto fresco'])
    const d = draftDe(v2)
    expect(d.nunca_hace).toEqual(['prometer entregas imposibles'])
    expect(d.icp_summary).toBe('Familias de la costa')
    expect((d._field_meta as Record<string, Record<string, unknown>>).nunca_hace).toMatchObject({ fuente: 'dueno' })
  })
  it('rechaza lo que no se puede editar, lo vacío y lo demasiado largo; no escribe nada', async () => {
    const db = base()
    const malos: Array<Record<string, unknown>> = [{ mision_x: 'a' }, { derivado: 'a' }, { proposito: '   ' }, { proposito: 'x'.repeat(2001) }, {}]
    for (const campos of malos) {
      const r = await editarManualDelDueno(db, { client_id: C, campos, reviewer: 'emilio' })
      expect(r.ok).toBe(false)
    }
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
  it('un cliente sin manual → 404; un client_id inválido → 400', async () => {
    expect(await editarManualDelDueno(new DbFalsa(), { client_id: C, campos: { proposito: 'x' }, reviewer: 'e' })).toMatchObject({ ok: false, status: 404 })
    expect(await editarManualDelDueno(base(), { client_id: 'no-uuid', campos: { proposito: 'x' }, reviewer: 'e' })).toMatchObject({ ok: false, status: 400 })
  })
  it('la edición conserva el sello de validación que ya tenía la vigente', async () => {
    const db = base({ human_validated: true, provenance_tag: { validado_por: 'jefatura' } })
    await editarManualDelDueno(db, { client_id: C, campos: { voz: 'Voz directa' }, reviewer: 'emilio', ahora: AHORA })
    const v2 = versiones(db)[1]
    expect(v2.human_validated).toBe(true)
    expect(v2.voice_description).toBe('Voz directa')
    expect(EDITABLES_DEL_TABLERO.voz.columna).toBe('voice_description')
  })
  it('dos ediciones seguidas dan v2 y v3, siempre sobre la vigente', async () => {
    const db = base()
    await editarManualDelDueno(db, { client_id: C, campos: { proposito: 'Uno' }, reviewer: 'emilio', ahora: AHORA })
    const r = await editarManualDelDueno(db, { client_id: C, campos: { voz: 'Dos' }, reviewer: 'emilio', ahora: AHORA })
    expect(r).toMatchObject({ ok: true, version_nueva: 3 })
    expect(versiones(db)[2]).toMatchObject({ brand_purpose: 'Uno', voice_description: 'Dos' })
  })
})

describe('después, el cerebro · puerta del dueño', () => {
  const cambio = { clave: 'proposito', clave_del_tablero: 'proposito', etiqueta: 'Propósito', valor: 'Que todos coman rico', valor_anterior: null }
  it('el cuerpo es el que pidió Cerebro: dato del manual por campo, sin acumula, canal «dashboard · manual»', () => {
    const b = cuerpoParaElCerebro({ client_id: C, version: 2, cambio, reviewer: 'emilio', en: AHORA.toISOString() })
    expect(b).toMatchObject({ evento: 'respuesta', client_id: C, tema: 'manual · proposito', pregunta: 'Propósito', respuesta: 'Que todos coman rico', canal: 'dashboard · manual', mensaje_ref: `manual:${C}:v2:proposito`, preguntado_por: { oficina: 'dashboard', agente: 'emilio' }, dry_run: false })
    expect(b).not.toHaveProperty('acumula')
    expect(b.workflow_id).toBeTruthy(); expect(b.workflow_execution_id).toBeTruthy()
  })
  it('reintenta lo pasajero (3 intentos) y no reintenta lo permanente; lo que no entra vuelve como pendiente', async () => {
    const llamadas: string[] = []
    const guion: Record<string, Array<{ ok: true; repetida: boolean } | { ok: false; permanente: boolean; error: string }>> = {
      'manual · proposito': [{ ok: false, permanente: false, error: '503' }, { ok: true, repetida: false }],
      'manual · voice_description': [{ ok: false, permanente: true, error: 'rechazada' }],
      'manual · valores': [{ ok: false, permanente: false, error: 'a' }, { ok: false, permanente: false, error: 'b' }, { ok: false, permanente: false, error: 'c' }],
    }
    const r = await empujarCamposAlCerebro({
      env: { baseUrl: 'https://x', internalKey: 'k' }, esperar: async () => {},
      enviar: async (_e, _f, cuerpo) => { const t = String(cuerpo.tema); llamadas.push(t); return guion[t].shift()! },
    }, { client_id: C, version: 2, reviewer: 'emilio', en: AHORA.toISOString(), cambios: [cambio, { ...cambio, clave: 'voice_description', etiqueta: 'Voz' }, { ...cambio, clave: 'valores', etiqueta: 'Valores' }] })
    expect(r.enviados).toEqual(['proposito'])
    expect(r.pendientes.map((p) => p.clave)).toEqual(['voice_description', 'valores'])
    expect(llamadas.filter((t) => t === 'manual · proposito')).toHaveLength(2)
    expect(llamadas.filter((t) => t === 'manual · voice_description')).toHaveLength(1)
    expect(llamadas.filter((t) => t === 'manual · valores')).toHaveLength(3)
  })
  it('si el cerebro falla, el manual YA quedó: la ruta responde 200, dice el pendiente y re-indexa la versión nueva', async () => {
    const db = base()
    const indexadas: string[] = []
    const s = await rutaEditarManual({
      db, ahora: () => AHORA,
      cerebro: { env: { baseUrl: 'https://x', internalKey: 'k' }, esperar: async () => {}, enviar: async () => ({ ok: false, permanente: false, error: 'la puerta está apagada' }) },
      empujarManual: (x) => { indexadas.push(x.source_id); return { estado: 'agendado' } },
    }, C, { campos: { proposito: 'Nuevo propósito' }, reviewer: 'emilio' })
    expect(s.status).toBe(200)
    expect(s.body).toMatchObject({ ok: true, version_nueva: 2, cerebro: { enviados: [], pendientes: [{ clave: 'proposito' }] } })
    expect(String(s.body.aviso)).toMatch(/pendiente/)
    expect(versiones(db)[1].brand_purpose).toBe('Nuevo propósito')
    expect(indexadas).toEqual([String(versiones(db)[1].id)])
  })
  it('la respuesta nombra cada cambio con su campo, su valor y que lo escribió el dueño (el tablero lo muestra al instante)', async () => {
    const s = await rutaEditarManual({ db: base(), ahora: () => AHORA, cerebro: { env: { baseUrl: 'x', internalKey: 'k' }, esperar: async () => {}, enviar: async () => ({ ok: true, repetida: false }) }, empujarManual: () => ({ estado: 'agendado' }) }, C, { campos: { eslogan: 'Del mar a tu mesa' }, reviewer: 'emilio' })
    expect(s.body.cambios).toEqual([{ campo: 'eslogan', etiqueta: 'Eslogan', valor: 'Del mar a tu mesa', escrito_por: 'dueno' }])
    expect(s.body).not.toHaveProperty('aviso')
  })
})

describe('validar el manual · la vigente pasa a validada por el dueño', () => {
  it('crea la versión max+1 validada por el dueño, deja la anterior, y marca lo no tocado como «aceptado por el dueño»', async () => {
    const db = base()
    await editarManualDelDueno(db, { client_id: C, campos: { proposito: 'Escrito por el dueño' }, reviewer: 'emilio', ahora: AHORA })
    const r = await validarManualDelDueno(db, { client_id: C, reviewer: 'emilio', ahora: AHORA })
    expect(r).toMatchObject({ ok: true, version_nueva: 3, sin_cambios: false })
    const v3 = versiones(db)[2]
    expect(db.tablas['client_brand_books']).toHaveLength(3)
    expect(v3.human_validated).toBe(true)
    expect(quienValido(v3)).toBe('dueno')
    expect(v3.provenance_tag).toMatchObject({ validado_por: 'dueno', validado_en: AHORA.toISOString(), validado_via: 'emilio' })
    const meta = draftDe(v3)._field_meta as Record<string, Record<string, unknown>>
    expect(meta.proposito.fuente).toBe('dueno'); expect(meta.proposito.aceptado_por_el_dueno).toBeUndefined() // escrito ≠ aceptado
    expect(meta.mision.aceptado_por_el_dueno).toMatchObject({ por: 'emilio' })
    expect(r.ok && r.aceptados).toContain('mision')
  })
  it('validar un manual ya validado por el dueño no crea nada; uno validado por la jefatura pasa a dueño', async () => {
    const yaDueno = base({ human_validated: true, provenance_tag: { validado_por: 'dueno' } })
    expect(await validarManualDelDueno(yaDueno, { client_id: C, reviewer: 'e' })).toMatchObject({ ok: true, sin_cambios: true })
    expect(yaDueno.tablas['client_brand_books']).toHaveLength(1)
    const deJefatura = base({ human_validated: true, provenance_tag: { validado_por: 'jefatura' } })
    await validarManualDelDueno(deJefatura, { client_id: C, reviewer: 'e', ahora: AHORA })
    expect(quienValido(versiones(deJefatura)[1])).toBe('dueno')
  })
  it('sin manual → 404', async () => {
    expect(await validarManualDelDueno(new DbFalsa(), { client_id: C, reviewer: 'e' })).toMatchObject({ ok: false, status: 404 })
  })
  it('la acción del tablero «manual-validar» la ejecuta y deja su resultado', async () => {
    const db = base()
    const s = await manualValidar({ db, puertos: (() => ({})) as never, ahora: () => AHORA }, { cuerpo: { client_id: C }, reviewer: 'emilio' })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ ok: true, validado_por: 'dueno', version_nueva: 2 })
    expect(s.toca).toMatchObject({ client_id: C })
    const mala = await manualValidar({ db, puertos: (() => ({})) as never, ahora: () => AHORA }, { cuerpo: { client_id: 'no' }, reviewer: 'emilio' })
    expect(mala.status).toBe(400)
  })
  it('rutaValidarManual: el índice del cerebro se re-hace solo si hubo versión nueva', async () => {
    const llamadas: string[] = []
    const d = { db: base(), ahora: () => AHORA, cerebro: { env: { baseUrl: 'x', internalKey: 'k' } }, empujarManual: (x: { source_id: string }) => { llamadas.push(x.source_id); return { estado: 'agendado' } } }
    await rutaValidarManual(d, C, 'emilio')
    await rutaValidarManual(d, C, 'emilio') // ya validado: sin cambios
    expect(llamadas).toHaveLength(1)
  })
})

describe('lo que escribe el dueño no lo pisa una corrida posterior', () => {
  it('una corrida del alta/cimiento arma su borrador desde cero: los campos del dueño se vuelven a poner (valor y procedencia)', async () => {
    const db = base()
    await editarManualDelDueno(db, { client_id: C, campos: { proposito: 'Escrito por el dueño', eslogan: 'Del mar a tu mesa' }, reviewer: 'emilio', ahora: AHORA })
    const previa = versiones(db)[1]
    const borradorDeLaCorrida = { proposito: 'Propósito que infirió la corrida', mision: 'Misión nueva de la corrida', tagline_opciones: ['Otro lema [frase propia del cliente, verbatim]'] }
    const { bb, conservados } = conservarLoDelDueno(previa, borradorDeLaCorrida)
    expect(conservados.sort()).toEqual(['proposito', 'tagline_opciones'])
    expect(bb.mision).toBe('Misión nueva de la corrida') // lo demás de la corrida queda
    const fila = buildBrandBookRow(C, bb, {}, 3) as Record<string, unknown>
    expect(fila.brand_purpose).toBe('Escrito por el dueño')
    expect(fila.tagline).toBe('Del mar a tu mesa')
    expect(fila.brand_mission).toBe('Misión nueva de la corrida')
    const meta = draftDe(fila)._field_meta as Record<string, Record<string, unknown>>
    expect(meta.proposito).toMatchObject({ fuente: 'dueno', por: 'emilio' })
  })
  it('sin nada del dueño, o sin versión previa, el borrador de la corrida pasa igual', () => {
    const bb = { proposito: 'x' }
    expect(conservarLoDelDueno(null, bb)).toEqual({ bb, conservados: [] })
    expect(conservarLoDelDueno(versiones(base())[0], bb)).toEqual({ bb, conservados: [] })
  })
})
