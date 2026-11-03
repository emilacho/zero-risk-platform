/**
 * ENCARGO Lenovo 01-nov firmado por Emilio: cada palabra del manual con su intención y su fuente. Solo lo declarado (norma o dueño) bloquea; lo demás es contexto de marca. Agnóstico. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { aplicarDecisionDelDueno, conservarPalabrasDuras, deUnaCorrida, leerPalabras, palabrasDeEstilo, palabrasDuras } from '../src/lib/manual/palabras-con-intencion'
import { conservarLoDelDueno, decidirPalabraDelDueno } from '../src/lib/manual/edicion-del-dueno'
import { palabrasProhibidasDelManual, palabrasDeclaradasEnUso } from '../src/lib/manual/palabras-anotadas'
import { chequeosDePost, palabrasDeclaradas, type ContextoDeChequeo } from '../src/lib/oficina/chequeos'
import { formatGuardrailsForPrompt } from '../src/lib/client-brain'
import { renderManualLimpio } from '../src/lib/brand-book-render-limpio'
import { reglasParaPrompts } from '../src/lib/oficina/ayudas'
import { buildBrandBookRow } from '../src/app/api/brand-book/[clientId]/route'
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

describe('🔴 una corrida de agentes no declara por el dueño (hallazgo de CC3)', () => {
  const inventada = { texto: 'barato', intencion: 'del_dueno', porque: 'dicen', fuente: CITA_DUENO }
  it('del_dueno con cita y fecha, si viene de una corrida, baja a estilo; legal con cita se conserva hasta que Lenovo decida', () => {
    expect(deUnaCorrida([inventada])).toEqual([{ texto: 'barato', intencion: 'estilo', porque: 'dicen' }])
    expect(palabrasDuras({ palabras_con_intencion: deUnaCorrida([{ texto: 'gratis', intencion: 'legal', fuente: CITA_LEGAL }]) })).toEqual(['gratis'])
    expect(deUnaCorrida('no es lista')).toEqual([])
  })
  it('por la ruta del manual: con o sin versión anterior, lo inventado no bloquea; lo que el dueño declaró antes sí', () => {
    const bb = { forbidden_words: ['barato'], palabras_con_intencion: [inventada] }
    expect(palabrasDuras(conservarLoDelDueno(null, bb).bb as never)).toEqual([])
    expect(palabrasDuras(conservarLoDelDueno({ forbidden_words: ['x'] }, bb).bb as never)).toEqual([])
    const previa = { forbidden_words: ['caro'], palabras_con_intencion: [{ texto: 'caro', intencion: 'del_dueno', fuente: CITA_DUENO }] }
    expect(palabrasDuras(conservarLoDelDueno(previa, bb).bb as never)).toEqual(['caro'])
  })
  it('el alta tampoco lo deja pasar', () => {
    expect(readFileSync(join(process.cwd(), 'src/app/api/clients/upsert/route.ts'), 'utf8')).toMatch(/palabras_con_intencion: deUnaCorrida\(bb\.palabras_con_intencion\)/)
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
  it('una decisión sobre otra palabra no borra el porqué de un estilo (W12 de CC3)', () => {
    const conPorque = { forbidden_words: ['lujo', 'barato'], palabras_con_intencion: [{ texto: 'lujo', intencion: 'estilo', porque: 'la marca es de barrio' }] }
    const r = aplicarDecisionDelDueno(conPorque, { texto: 'barato', decision: 'prohibir', por: 'e', en: '2026-11-01T12:00:00Z' })
    expect(r.palabras_con_intencion.find((p) => p.texto === 'lujo')).toEqual({ texto: 'lujo', intencion: 'estilo', porque: 'la marca es de barrio' })
  })
  it('el texto de la palabra: 200 caracteres entran, 201 no (W22 de CC3)', async () => {
    const db = new DbFalsa().semilla('client_brand_books', [manual()])
    expect(await decidir(db, 'x'.repeat(201), 'prohibir')).toMatchObject({ ok: false, status: 400 })
    expect(db.tablas['client_brand_books']).toHaveLength(1)
    expect(await decidir(db, 'x'.repeat(200), 'prohibir')).toMatchObject({ ok: true })
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

describe('cómo se avisa (02-nov, firma de Emilio: ninguna palabra bloquea)', () => {
  it('🔴 en la pieza: se avisa lo declarado y lo que el brief prohíbe por su cuenta; lo que el brief solo repite del manual es contexto', () => {
    const r = palabrasDeclaradas({ palabras_prohibidas: ['premium', 'barato'], palabras_duras: ['barato'] }, ['premium', 'competidor x'])
    expect(r.declaradas.sort()).toEqual(['barato', 'competidor x'])
    expect(r.contexto).toEqual(['premium'])
  })
  it('🔴 en el chequeo de la pieza, la palabra es sugerencia esté o no declarada', () => {
    const ctx = (duras?: string[]) => ({
      pieza: { pie_de_foto: 'Un plato premium y rico', hashtags: ['#mar'] },
      fuentes: { palabras_prohibidas: ['premium'], ...(duras ? { palabras_duras: duras } : {}), telefonos: [], handles: [], precios: [], competidores: [], registro: 'tuteo' },
      limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false },
    }) as unknown as ContextoDeChequeo
    const de = (c: ContextoDeChequeo) => chequeosDePost(c).filter((f) => /premium/.test(f.que ?? ''))
    expect(de(ctx()).map((f) => f.gravedad)).toEqual(['sugerencia'])
    expect(de(ctx(['premium'])).map((f) => f.gravedad)).toEqual(['sugerencia'])
  })
  it('a los agentes les llega dicho cuál es prohibición y cuál es contexto', () => {
    const base = { forbidden_words: ['premium'], required_terminology: [], voice_description: null, competitor_mentions_policy: null, compliance_notes: null } as never
    const sin = formatGuardrailsForPrompt(base)
    expect(sin).toMatch(/WORDS THE BRAND AVOIDS/); expect(sin).not.toMatch(/FORBIDDEN WORDS/)
    expect(formatGuardrailsForPrompt({ ...(base as object), hard_forbidden_words: ['gratis'] } as never)).toMatch(/FORBIDDEN WORDS[^\n]*gratis/)
  })
  it('🔴 en los prompts de imagen solo se muestra lo declarado y lo que el brief prohíbe por su cuenta (W16 de CC3)', () => {
    const vetadas = (duras: string[], prohibido: string[] = []) => reglasParaPrompts(
      { artefactos: {}, fichas: [] } as never,
      { prohibido, visual_obligatorio: [], visual_prohibido: [] } as never,
      { fuentes: { palabras_prohibidas: ['premium', 'barato'], palabras_duras: duras } } as never,
    ).prohibido.flatMap((r) => r.claves ?? [])
    expect(vetadas([])).toEqual([])
    expect(vetadas(['barato'])).toEqual(['barato'])
    expect(vetadas([], ['premium', 'otra']).sort()).toEqual(['otra'])
  })
  it('🔴 en el manual solo se anota lo declarado', () => {
    const texto = 'Somos premium en lo que hacemos. Nada de barato aquí señor.'
    expect(palabrasProhibidasDelManual({ forbidden_words: ['premium', 'barato'] })).toEqual([])
    expect(palabrasDeclaradasEnUso({ forbidden_words: ['premium'], voice_description: texto })).toEqual([])
    expect(palabrasDeclaradasEnUso({ forbidden_words: ['premium'], palabras_con_intencion: [{ texto: 'premium', intencion: 'legal', fuente: CITA_LEGAL }], voice_description: texto }).map((a) => a.palabra)).toEqual(['premium'])
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

describe('el guardado del manual', () => {
  it('lo que no sea lista no entra a la columna: su candado haría fallar todo el manual', () => {
    const fila = (x: unknown) => buildBrandBookRow('c', { palabras_con_intencion: x } as never, {} as never, 1) as Record<string, unknown>
    for (const x of ['texto', { a: 1 }, 3, null, undefined]) expect(fila(x).palabras_con_intencion).toEqual([])
    expect(fila([{ texto: 'a', intencion: 'estilo' }]).palabras_con_intencion).toEqual([{ texto: 'a', intencion: 'estilo' }])
  })
})

describe('los lectores', () => {
  const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('la herramienta de las lentes declara el campo y no ofrece declarar por el dueño', () => {
    const h = lee('services/agent-runner/src/lib/mcp/brand-section-server.js')
    expect(h).toMatch(/palabras_con_intencion: z\.array/)
    expect(h).toMatch(/intencion: z\.enum\(\['estilo', 'legal'\]\)/)
  })
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
