/**
 * CEREBRO · H1.2 · el arreglo del escritor
 *
 * Causa raíz medida en H0.1 (raw/findings/2026-08-20-CC1-H0.1-mapeo-del-escritor.md):
 * `client_brand_books` NO tiene columna `positioning`, así que el escritor guardaba el
 * posicionamiento bajo `elevator_pitch` (route.ts L116-117, con comentario que lo declara).
 * Consecuencia medida: los 5 manuales vivos indexan el posicionamiento en el cerebro con
 * el rótulo `elevator_pitch` (persist-chunks.ts L61 · 5 filas en client_brain_chunks).
 *
 * ⇒ El arreglo NO es re-rotular: es el casillero que falta. Estos tests fijan las dos
 * mitades — la fila que escribe el endpoint, y el rótulo con que el cerebro la indexa.
 *
 * ROJO ANTES DEL ARREGLO · con el código previo:
 *   - «el posicionamiento va a su propia columna» falla (undefined ≠ el texto)
 *   - «elevator_pitch NO recibe el posicionamiento» falla (recibía bb.positioning)
 *   - «el cerebro rotula positioning» falla (no estaba en textFields)
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildBrandBookRow } from '../src/app/api/brand-book/[clientId]/route'
import { chunksFromBrandBook } from '../src/lib/brain/persist-chunks'

const raiz = join(__dirname, '..')
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')

const CID = 'd69100b5-8ad7-4bb0-908c-68b5544065dc'

const POSITIONING = 'Sweet & Coffee es la cafetería de Guayaquil: 48 locales, 25+ años.'
const PITCH = 'Café 100% ecuatoriano, tostado acá, servido en dos minutos.'

describe('H1.2 · el escritor guarda el posicionamiento en su propia columna', () => {
  it('el posicionamiento va a la columna positioning · no a elevator_pitch', () => {
    const row = buildBrandBookRow(CID, { positioning: POSITIONING }, {})

    expect(row.positioning).toBe(POSITIONING)
    // el rótulo prestado queda libre · nadie más lo pisa
    expect(row.elevator_pitch).toBeNull()
  })

  it('elevator_pitch recibe el elevator_pitch real cuando el borrador lo trae', () => {
    const row = buildBrandBookRow(CID, { positioning: POSITIONING, elevator_pitch: PITCH }, {})

    expect(row.positioning).toBe(POSITIONING)
    expect(row.elevator_pitch).toBe(PITCH)
  })

  it('sin posicionamiento en el borrador · la columna queda en null, no en undefined', () => {
    const row = buildBrandBookRow(CID, { voice_description: 'cálida' }, {})

    // undefined lo omitiría del INSERT · null es la ausencia explícita
    expect(row.positioning).toBeNull()
    expect(row.elevator_pitch).toBeNull()
  })

  it('no toca lo que ya funcionaba · las 4 columnas de contenido + el draft entero', () => {
    const draft = {
      positioning: POSITIONING,
      voice_description: 'cálida',
      forbidden_words: ['premium'],
      required_terminology: ['café 100% ecuatoriano'],
      icp_summary: 'oficinista guayaquileño',
    }
    const row = buildBrandBookRow(CID, draft, { source: 'onboarding_collaborative_build' })

    expect(row.client_id).toBe(CID)
    expect(row.voice_description).toBe('cálida')
    expect(row.forbidden_words).toEqual(['premium'])
    expect(row.required_terminology).toEqual(['café 100% ecuatoriano'])
    expect(row.auto_generated_from).toBe('onboarding_collaborative_build')
    // el borrador completo se sigue preservando · nada se pierde (incl. icp_summary)
    const preserved = JSON.parse(row.content_text as string)
    expect(preserved.brand_book_draft).toEqual(draft)
  })
})

describe('H1.2 · el cerebro indexa el posicionamiento con su propio rótulo', () => {
  it('emite un fragmento rotulado positioning', () => {
    const chunks = chunksFromBrandBook({ positioning: POSITIONING })

    const etiquetas = chunks.map((c) => c.section_label)
    expect(etiquetas).toContain('positioning')
    expect(chunks.find((c) => c.section_label === 'positioning')?.chunk_text).toBe(POSITIONING)
  })

  it('posicionamiento y pitch conviven como fragmentos distintos', () => {
    const chunks = chunksFromBrandBook({ positioning: POSITIONING, elevator_pitch: PITCH })

    expect(chunks.find((c) => c.section_label === 'positioning')?.chunk_text).toBe(POSITIONING)
    expect(chunks.find((c) => c.section_label === 'elevator_pitch')?.chunk_text).toBe(PITCH)
  })
})

/**
 * C2 del Consejero · el defecto de fondo NO era el campo: eran CINCO listas paralelas
 * de campos del manual, mantenidas a mano. Yo arreglé 3 y me salté 2 — el ayudante de
 * SQL y el guionista del re-llenado. Esta prueba fija las cinco: el próximo campo nuevo
 * no se puede colar en cuatro y faltar en la quinta.
 */
describe('H1.2 · C2 · las 5 listas de campos del manual no se desincronizan', () => {
  const LISTAS: ReadonlyArray<readonly [string, string]> = [
    ['src/lib/brain/persist-chunks.ts', 'escritura al cerebro · vía alta + descubrimiento'],
    ['src/app/api/brain/reindex-stale/route.ts', 're-indexado de lo viejo'],
    ['src/app/api/brain/reembed-source-row/route.ts', 're-embebido de una fila'],
    ['sql/generate_embedding_helpers.sql', 'ayudante de SQL · arma el texto a embeber'],
    ['scripts/sprint7p5-backfill-client-brain-embeddings.mjs', 'guionista del re-llenado'],
  ]

  it.each(LISTAS)('%s incluye positioning (%s)', (archivo) => {
    expect(leer(archivo)).toContain('positioning')
  })

  it('las 4 listas de JS/TS nombran positioning junto a elevator_pitch', () => {
    // si alguien agrega el campo suelto en otro lado del archivo la prueba de arriba
    // pasaría igual · esta exige que esté en la MISMA lista que el pitch
    for (const [archivo] of LISTAS.slice(0, 3)) {
      const texto = leer(archivo)
      const iPitch = texto.indexOf("'elevator_pitch'") >= 0
        ? texto.indexOf("'elevator_pitch'")
        : texto.indexOf('"elevator_pitch"')
      const iPos = texto.indexOf("'positioning'") >= 0
        ? texto.indexOf("'positioning'")
        : texto.indexOf('"positioning"')
      expect(iPitch, `${archivo} · no encontré elevator_pitch`).toBeGreaterThan(-1)
      expect(iPos, `${archivo} · no encontré positioning en la lista`).toBeGreaterThan(-1)
      // vecinos · a lo sumo ~400 caracteres de distancia (la lista entera es más corta)
      expect(Math.abs(iPos - iPitch), `${archivo} · positioning está lejos de la lista`).toBeLessThan(400)
    }
  })
})

/**
 * C2 · el segundo defecto del ayudante de SQL, que el Consejero nombró aparte:
 * NO alcanza con sumarle el campo · esa función además PISA `content_text`, que es
 * donde el escritor guarda el borrador completo en JSON y de donde el reporte de alta
 * lee el posicionamiento. Una corrida = borrador destruido, sin aviso.
 */
describe('H1.2 · C2 · el ayudante de SQL no se come el borrador', () => {
  it('el UPDATE de content_text saltea las filas que tienen un borrador JSON', () => {
    const sql = leer('sql/generate_embedding_helpers.sql')

    expect(sql).toContain('SET content_text = v_content')
    // la guarda · sin ella el UPDATE es incondicional y destruye el borrador
    expect(sql).toContain(`NOT LIKE '%"brand_book_draft"%'`)
  })
})
