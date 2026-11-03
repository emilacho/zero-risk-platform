/**
 * 3-nov · auditoría n.º 5: cada revisión va al panel de su documento. La clasificación vive en la base (`hitl_queue.documento`, calculada).
 * Aquí se prueba la regla con la misma expresión de la migración, y que el pedido del manual siga empezando como la regla espera: si alguien cambia ese texto, la revisión caería en 'otro'.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SQL = readFileSync('supabase/migrations/202611031800_hitl_documento_de_la_revision.sql', 'utf8')
const patron = (re: RegExp) => { const m = SQL.match(re); if (!m) throw new Error(`no hallé ${re}`); return new RegExp(m[1].replace(/\\s/g, '\\s'), 'u') }
const MANUAL_PEDIDO = patron(/when contexto ~ '([^']+)' or salida ~ 'emit_brand_section'/)
const PIEZA_PEDIDO = patron(/when contexto ~ '([^']+)' or salida ~ '\^/)
const PIEZA_SALIDA = patron(/or salida ~ '(\^[^']+)' then 'pieza'/)

/** la misma regla de la migración, para la revisión del editor */
const delEditor = (contexto: string, salida: string) => (MANUAL_PEDIDO.test(contexto) || salida.includes('emit_brand_section') ? 'manual' : PIEZA_PEDIDO.test(contexto) || PIEZA_SALIDA.test(salida) ? 'pieza' : 'otro')

describe('🔴 la revisión del editor va por su documento, no por su tipo', () => {
  it.each([
    ['sección del manual (caso ZR SI)', 'Eres el DUEÑO de estas secciones del manual de marca de un cliente: tono_por_canal', 'Voy a cargar…', 'manual'],
    ['sección del manual, pedido del alta', 'Construye TU sección del brand book SOLO desde la evidencia', 'Texto', 'manual'],
    ['el agente usó la herramienta de sección', 'Este cliente tiene un cerebro', 'Voy a cargar el esquema de la herramienta `emit_brand_section`', 'manual'],
    ['mesa de una pieza', '# Mesa de trabajo · Zero Risk · carrusel BRF-0002', 'Texto', 'pieza'],
    ['pieza con el manual de contexto: citarlo no la vuelve del manual', 'Este cliente tiene un cerebro (…) MANUAL DE MARCA Zero Risk', '```json { "texto_base": "VARIANTE A" }', 'pieza'],
    ['pieza con elementos', 'Este cliente tiene un cerebro', '```json {"elementos":[{"ref":"e01"}]}', 'pieza'],
    ['lo que no se reconoce no cae en ningún panel por error', 'Otra cosa', 'Otro texto', 'otro'],
  ])('%s', (_n, contexto, salida, esperado) => expect(delEditor(contexto, salida)).toBe(esperado))
})

describe('🔴 cada tipo tiene su documento', () => {
  it.each([
    ["tipo = 'content_piece_review' then 'pieza'"],
    ["tipo = 'manual_de_marca_review' then 'manual'"],
    ["tipo in ('plan_con_pendientes', 'palabra_del_dueno') then 'plan'"],
    ["tipo = 'concepto_review' then 'gran_idea'"],
    ["tipo = 'confirm_competitor_list' then 'competidores'"],
  ])('%s', (regla) => expect(SQL).toContain(regla))
  it('un tipo nuevo cae en «otro», sin romper ni esconderse', () => expect(SQL).toMatch(/else 'otro'\s*end\s*\$\$/))
})

describe('🔴 la columna', () => {
  it('es calculada: ningún flujo la escribe ni se la salta, y no cambia datos de la fila', () => {
    expect(SQL).toMatch(/add column if not exists documento text generated always as \(public\.documento_de_la_revision\(type, review_context, output_preview\)\) stored/)
    expect(SQL).toMatch(/language sql immutable/)
    expect(SQL).not.toMatch(/\bupdate\s+public\.hitl_queue/i)
  })
})

describe('🔴 el aviso si el pedido cambia', () => {
  it('el proceso del manual sigue pidiendo con el texto que la regla reconoce', () => {
    const flujo = readFileSync('scripts/worker-staging/ssLtwYPt7zxuvnM2/ssLtwYPt7zxuvnM2-ARREGLADO-e3-2026-10-30.json', 'utf8')
    expect(flujo).toContain('Eres el DUEÑO ')
  })
})

describe('🔴 Decisiones lleva la revisión al panel de su documento', () => {
  const fuente = readFileSync('src/lib/direccion/decisiones.ts', 'utf8')
  it('lee `documento` y lo usa cuando el tipo no trae ruta', () => {
    expect(fuente).toContain('type, documento, title')
    expect(fuente).toContain('m.ruta ?? RUTA_POR_DOCUMENTO[String(h.documento)]')
    expect(fuente).toMatch(/RUTA_POR_DOCUMENTO: Record<string, string> = \{ manual: '\/nuevo', plan: '\/nuevo', pieza: '\/piezas' \}/)
  })
})
