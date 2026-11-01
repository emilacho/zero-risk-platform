/**
 * ENCARGO Lenovo 01-nov firmado por Emilio: cada palabra del manual con su intención y su fuente. Solo lo declarado (norma o dueño) bloquea; lo demás es contexto de marca. Agnóstico. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { aplicarDecisionDelDueno, conservarPalabrasDuras, leerPalabras, palabrasDeEstilo, palabrasDuras } from '../src/lib/manual/palabras-con-intencion'
import { conservarLoDelDueno, decidirPalabraDelDueno } from '../src/lib/manual/edicion-del-dueno'
import { palabrasProhibidasDelManual, limpiarManual } from '../src/lib/manual/limpieza'
import { chequeosDePost, palabrasQueBloquean, type ContextoDeChequeo } from '../src/lib/oficina/chequeos'
import { formatGuardrailsForPrompt } from '../src/lib/client-brain'
import { renderManualLimpio } from '../src/lib/brand-book-render-limpio'
import { CAMPOS_PROPONIBLES } from '../src/lib/manual/propuesta'

const CITA_LEGAL = { cita: 'Art. 12 de la norma sanitaria', origen: 'regulador' }
const CITA_DUENO = { cita: 'No quiero «barato»', fecha: '2026-11-01T10:00:00Z', por: 'dueño' }
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

describe('leer las palabras', () => {
  it('🔴 lo que ya existe se lee solo como estilo, y nada se pierde', () => {
    expect(leerPalabras({ forbidden_words: ['el mejor', 'premium'] })).toEqual([{ texto: 'el mejor', intencion: 'estilo' }, { texto: 'premium', intencion: 'estilo' }])
    expect(palabrasDuras({ forbidden_words: ['el mejor', 'premium'] })).toEqual([])
  })
  it('🔴 un agente no fabrica un bloqueo: legal sin cita y dueño sin cita o sin fecha son estilo', () => {
    for (const e of [{ intencion: 'legal' }, { intencion: 'legal', fuente: { cita: ' ' } }, { intencion: 'del_dueno', fuente: { cita: 'x' } }, { intencion: 'del_dueno', fuente: { cita: 'x', fecha: 'ayer no' } }, { intencion: 'inventada', fuente: CITA_LEGAL }]) {
      expect(palabrasDuras({ palabras_con_intencion: [{ texto: 'x', ...e }] })).toEqual([])
      expect(palabrasDeEstilo({ palabras_con_intencion: [{ texto: 'x', ...e }] })).toEqual(['x'])
    }
  })
  it('con su cita bloquea, aunque la lista no la nombre; sin repetir, ignorando mayúsculas y tildes', () => {
    const m = { forbidden_words: ['Gratís', 'premium'], palabras_con_intencion: [{ texto: 'gratis', intencion: 'legal', fuente: CITA_LEGAL }, { texto: 'barato', intencion: 'del_dueno', fuente: CITA_DUENO }] }
    expect(palabrasDuras(m)).toEqual(['gratis', 'barato'])
    expect(palabrasDeEstilo(m)).toEqual(['premium'])
  })
  it('una entrada rota o una columna ausente no tumban la lectura', () => {
    expect(leerPalabras({ forbidden_words: [1, null, 'ok'], palabras_con_intencion: 'no es lista' })).toEqual([{ texto: 'ok', intencion: 'estilo' }])
    expect(leerPalabras(null)).toEqual([])
    expect(leerPalabras({ palabras_con_intencion: [null, 3, { intencion: 'legal' }] })).toEqual([])
  })
})

describe('lo declarado no se pierde', () => {
  const previa = { forbidden_words: ['barato', 'viejo'], palabras_con_intencion: [{ texto: 'barato', intencion: 'del_dueno', fuente: CITA_DUENO }] }
  it('una corrida nueva conserva las duras y no hereda el estilo viejo', () => {
    const r = conservarPalabrasDuras(previa, { forbidden_words: ['nuevo'], palabras_con_intencion: [] })
    expect(r.forbidden_words).toEqual(['nuevo', 'barato'])
    expect(palabrasDuras(r)).toEqual(['barato'])
  })
  it('lo declarado manda sobre lo que proponga la corrida', () => {
    const r = conservarPalabrasDuras(previa, { forbidden_words: ['barato'], palabras_con_intencion: [{ texto: 'barato', intencion: 'estilo', porque: 'no va' }] })
    expect(r.forbidden_words).toEqual(['barato'])
    expect(palabrasDuras(r)).toEqual(['barato'])
  })
  it('conservarLoDelDueno las lleva aunque el dueño no haya tocado ningún otro campo; sin duras no cambia nada', () => {
    const bb = { forbidden_words: ['nuevo'] }
    expect(palabrasDuras(conservarLoDelDueno(previa, bb).bb as never)).toEqual(['barato'])
    expect(conservarLoDelDueno({ forbidden_words: ['x'] }, bb).bb).toBe(bb)
  })
})

describe('la decisión del dueño', () => {
  const manual = () => ({ id: 'm1', client_id: C, version: 3, forbidden_words: ['premium', 'barato'], palabras_con_intencion: [], content_text: JSON.stringify({ brand_book_draft: { forbidden_words: ['premium', 'barato'] } }) })
  const decidir = (db: DbFalsa, texto: unknown, decision: unknown, comentario: string | null = null) => decidirPalabraDelDueno(db as never, { client_id: C, texto, decision, comentario, reviewer: 'emilio', ahora: new Date('2026-11-01T12:00:00Z') })
  it('prohibir: queda dura con su cita y su fecha, en versión nueva; la anterior queda', async () => {
    const db = new DbFalsa().semilla('client_brand_books', [manual()])
    const r = await decidir(db, 'barato', 'prohibir', 'No quiero esa palabra')
    expect(r).toMatchObject({ ok: true, version_nueva: 4, duras: ['barato'] })
    const filas = db.tablas['client_brand_books']
    expect(filas).toHaveLength(2)
    const nueva = filas.find((f) => f.version === 4)!
    expect(nueva.forbidden_words).toEqual(['premium', 'barato'])
    expect(nueva.palabras_con_intencion).toEqual([{ texto: 'barato', intencion: 'del_dueno', fuente: { cita: 'No quiero esa palabra', origen: 'tablero', fecha: '2026-11-01T12:00:00.000Z', por: 'emilio' } }])
    expect(JSON.parse(String(nueva.content_text)).brand_book_draft._field_meta.forbidden_words.fuente).toBe('dueno')
  })
  it('sin comentario, la cita dice qué hizo y es válida', async () => {
    const db = new DbFalsa().semilla('client_brand_books', [manual()])
    await decidir(db, 'nueva', 'prohibir')
    const nueva = db.tablas['client_brand_books'].find((f) => f.version === 4)!
    expect(palabrasDuras(nueva as never)).toEqual(['nueva'])
  })
  it('quitar la saca de la lista; contexto la devuelve a estilo', () => {
    const dura = aplicarDecisionDelDueno(manual(), { texto: 'barato', decision: 'prohibir', por: 'e', en: '2026-11-01T12:00:00Z' })
    const quitada = aplicarDecisionDelDueno(dura, { texto: 'BARATO', decision: 'quitar', por: 'e', en: '2026-11-01T12:00:00Z' })
    expect(quitada).toEqual({ forbidden_words: ['premium'], palabras_con_intencion: [] })
    const contexto = aplicarDecisionDelDueno(dura, { texto: 'barato', decision: 'contexto', por: 'e', en: '2026-11-01T12:00:00Z' })
    expect(palabrasDuras(contexto)).toEqual([]); expect(contexto.forbidden_words).toContain('barato')
  })
  it('entradas malas: 400 sin escribir; quitar lo que no está: 404; sin manual: 404', async () => {
    const db = new DbFalsa().semilla('client_brand_books', [manual()])
    for (const [t, d] of [['', 'prohibir'], ['x'.repeat(201), 'prohibir'], [3, 'prohibir'], ['x', 'otra']] as const) expect(await decidir(db, t, d)).toMatchObject({ ok: false, status: 400 })
    expect(await decidir(db, 'no esta', 'quitar')).toMatchObject({ ok: false, status: 404, error: 'palabra_no_esta' })
    expect(await decidir(new DbFalsa().semilla('client_brand_books', []), 'x', 'prohibir')).toMatchObject({ ok: false, status: 404, error: 'sin_manual' })
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
})

describe('quién bloquea', () => {
  it('🔴 en la pieza: bloquea lo declarado y lo que el brief prohíbe por su cuenta; lo que el brief solo repite del manual es contexto', () => {
    const r = palabrasQueBloquean({ palabras_prohibidas: ['premium', 'barato'], palabras_duras: ['barato'] }, ['premium', 'competidor x'])
    expect(r.bloquean.sort()).toEqual(['barato', 'competidor x'])
    expect(r.contexto).toEqual(['premium'])
  })
  it('🔴 en el chequeo de la pieza, la misma palabra bloquea si está declarada y es sugerencia si no (corrige lo que el 01-nov quedó sin cubrir)', () => {
    const ctx = (duras?: string[]) => ({
      pieza: { pie_de_foto: 'Un plato premium y rico', hashtags: ['#mar'] },
      fuentes: { palabras_prohibidas: ['premium'], ...(duras ? { palabras_duras: duras } : {}), telefonos: [], handles: [], precios: [], competidores: [], registro: 'tuteo' },
      limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false },
    }) as unknown as ContextoDeChequeo
    const de = (c: ContextoDeChequeo) => chequeosDePost(c).filter((f) => /premium/.test(f.que ?? ''))
    expect(de(ctx()).map((f) => f.gravedad)).toEqual(['sugerencia'])
    expect(de(ctx(['premium'])).map((f) => f.gravedad)).toEqual(['bloquea'])
  })
  it('a los agentes les llega dicho cuál es prohibición y cuál es contexto', () => {
    const base = { forbidden_words: ['premium'], required_terminology: [], voice_description: null, competitor_mentions_policy: null, compliance_notes: null } as never
    const sin = formatGuardrailsForPrompt(base)
    expect(sin).toMatch(/WORDS THE BRAND AVOIDS/); expect(sin).not.toMatch(/FORBIDDEN WORDS/)
    expect(formatGuardrailsForPrompt({ ...(base as object), hard_forbidden_words: ['gratis'] } as never)).toMatch(/FORBIDDEN WORDS[^\n]*gratis/)
  })
  it('🔴 la limpieza del manual solo quita lo declarado', () => {
    const texto = 'Somos premium en lo que hacemos. Nada de barato aquí señor.'
    expect(palabrasProhibidasDelManual({ forbidden_words: ['premium', 'barato'] })).toEqual([])
    expect(limpiarManual({ forbidden_words: ['premium'], voice_description: texto }).manual.voice_description).toContain('premium')
    const conDura = limpiarManual({ forbidden_words: ['premium'], palabras_con_intencion: [{ texto: 'premium', intencion: 'legal', fuente: CITA_LEGAL }], voice_description: texto })
    expect(conDura.manual.voice_description).not.toContain('premium')
  })
  it('el manual leído separa lo prohibido de lo que evita', () => {
    const t = renderManualLimpio({ brand_book: { forbidden_words: ['premium', 'barato'], palabras_con_intencion: [{ texto: 'barato', intencion: 'del_dueno', fuente: CITA_DUENO }] }, client_name: 'X', country: null }).texto
    expect(t).toMatch(/PROHIBIDAS POR UNA NORMA O POR EL DUEÑO[\s\S]*barato/)
    expect(t).toMatch(/PALABRAS QUE LA MARCA EVITA[\s\S]*premium/)
    expect(t).not.toMatch(/PALABRAS PROHIBIDAS/)
    expect(renderManualLimpio({ brand_book: { forbidden_words: ['premium'] }, client_name: 'X', country: null }).texto).not.toMatch(/PROHIBIDAS POR UNA NORMA/)
  })
})

describe('el reparto firmado', () => {
  it('estrategia, misión, propósito, visión y propuestas de valor las propone quien hace estrategia; productos y sedes, quien tiene los datos', () => {
    for (const c of ['mision', 'proposito', 'vision', 'propuestas_de_valor', 'positioning']) expect(CAMPOS_PROPONIBLES[c].agente).toBe('brand-strategist')
    for (const c of ['productos', 'sedes']) expect(CAMPOS_PROPONIBLES[c].agente).toBe('jefe-client-success')
  })
})

describe('los lectores', () => {
  const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('la cadena lee la columna y la pasa; promover no pierde lo declarado (de forma, sobre el código)', () => {
    const a = lee('src/lib/cadena/almacen-supabase.ts')
    expect(a).toMatch(/select\('id, content_text, forbidden_words, palabras_con_intencion,/)
    expect(a).toMatch(/palabrasDuras: palabrasDuras\(manual\)/)
    expect(lee('src/lib/manual/promover.ts')).toMatch(/Object\.assign\(row, conservarPalabrasDuras\(anterior, row\)\)/)
  })
})

describe('la migración', () => {
  const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('agrega la columna sin tocar ninguna fila; la reversa se niega si alguien ya declaró algo', () => {
    const m = lee('supabase/migrations/202611012300_client_brand_books_palabras_con_intencion.sql')
    expect(m).toMatch(/ADD COLUMN IF NOT EXISTS palabras_con_intencion jsonb NOT NULL DEFAULT '\[\]'::jsonb/)
    expect(m).not.toMatch(/UPDATE|DELETE/i)
    expect(lee('supabase/reversas/202611012300_client_brand_books_palabras_con_intencion_REVERSA.sql')).toMatch(/palabras_con_intencion <> '\[\]'::jsonb\) THEN RAISE EXCEPTION/)
  })
})
