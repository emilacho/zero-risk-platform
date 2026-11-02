/**
 * ADENDA 1 de Emilio (01-nov): el eslogan que el cliente ya usa es un hecho con su fuente; viaja en la carpeta y lo reciben el redactor, el brief y las piezas. Agnóstico. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { columnasDelBorrador, esloganDelCliente, REGLA_DEL_ESLOGAN, reglaDelEslogan } from '../src/lib/manual/campos-del-manual'
import { conservarLoDelDueno } from '../src/lib/manual/edicion-del-dueno'
import { renderManualLimpio } from '../src/lib/brand-book-render-limpio'
import { adjuntoDelCliente } from '../src/lib/portero-alimenta/contexto-del-cliente'
import { textoDeLaCarpeta } from '../src/lib/jefatura/revision/carpeta-para-revisar'

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
// la forma que tiene hoy un manual real: la marca se perdió, la procedencia quedó
const OPCIONES = ['Cuando tengas esa sed, aquí estamos!', 'PROPUESTA (no es dato del cliente): Fresco y bueno.', 'PROPUESTA (no es dato del cliente): El que vuelve.']
const META = { tagline_opciones: { fuente: '[1] Frase propia del cliente hallada en sitio/perfil — literal. [2] y [3] propuesta editorial' } }
const BORRADOR = { tagline_opciones: OPCIONES, _field_meta: META }

describe('leer el eslogan', () => {
  it('🔴 el caso real: la opción sin rótulo, con procedencia de frase propia, es el eslogan', () => {
    expect(esloganDelCliente(BORRADOR)?.texto).toBe('Cuando tengas esa sed, aquí estamos!')
  })
  it('🔴 sin esa procedencia no se adivina: un lema de un modelo no pasa por eslogan', () => {
    expect(esloganDelCliente({ tagline_opciones: OPCIONES })).toBeNull()
    expect(esloganDelCliente({ tagline_opciones: OPCIONES, _field_meta: { tagline_opciones: { fuente: 'propuesta editorial' } } })).toBeNull()
  })
  it('dos opciones sin rótulo: no elige por su cuenta; todas propuestas: tampoco', () => {
    expect(esloganDelCliente({ tagline_opciones: ['Uno dos', 'Tres cuatro'], _field_meta: META })).toBeNull()
    expect(esloganDelCliente({ tagline_opciones: ['PROPUESTA: uno'], _field_meta: META })).toBeNull()
  })
  it('un lema citado («el cliente dice…») no pasa por eslogan, aunque sea la única opción sin rótulo (E06 de CC3)', () => {
    expect(esloganDelCliente({ tagline_opciones: ['el cliente dice: «Hola a todos»', 'PROPUESTA: otra'], _field_meta: META })).toBeNull()
  })
  it('manda lo declarado con su marca, luego la columna', () => {
    expect(esloganDelCliente({ tagline_opciones: ['Lo mío [frase propia del cliente, verbatim — escrita por el dueño]', 'Otra'], tagline: 'Columna', _field_meta: META })?.texto).toBe('Lo mío')
    expect(esloganDelCliente({ tagline: ' Columna ', tagline_opciones: OPCIONES, _field_meta: META })?.texto).toBe('Columna')
  })
  it('sin nada, null; y al guardar la columna se llena', () => {
    expect(esloganDelCliente({})).toBeNull(); expect(esloganDelCliente(null)).toBeNull()
    expect(columnasDelBorrador(BORRADOR).tagline).toBe('Cuando tengas esa sed, aquí estamos!')
  })
})

describe('una versión nueva', () => {
  it('🔴 sin eslogan no borra el que ya se conocía; con el suyo, manda el suyo; sin ninguno, no cambia nada', () => {
    const previa = { tagline: 'El de siempre', forbidden_words: [] }
    expect(conservarLoDelDueno(previa, { tagline_opciones: ['PROPUESTA: otra'] }).bb.tagline).toBe('El de siempre')
    expect(conservarLoDelDueno(previa, { tagline: 'Nuevo hallado' }).bb.tagline).toBe('Nuevo hallado')
    const bb = { tagline_opciones: ['PROPUESTA: otra'] }
    expect(conservarLoDelDueno({ forbidden_words: [] }, bb).bb).toBe(bb)
  })
  it('la fuente que trae el flujo se respeta', () => {
    expect(esloganDelCliente({ tagline: 'Uno', _field_meta: { tagline: { fuente: 'perfil de la red, 2026-10-30' } } })?.fuente).toBe('perfil de la red, 2026-10-30')
  })
})

describe('🔴 ADENDA 3: contexto, salvo lo que declaró el dueño', () => {
  it('nada obliga ni pide explicación', () => {
    expect(REGLA_DEL_ESLOGAN).toBe('es contexto: úsala, adáptala o propón otra mejor')
    expect(reglaDelEslogan('hallada en su sitio')).toBe(REGLA_DEL_ESLOGAN)
  })
  it('🔴 si la declaró el dueño, manda y admite variantes', () => {
    expect(reglaDelEslogan('lo declaró el dueño')).toMatch(/manda.*variantes/)
    expect(reglaDelEslogan('dueno')).toMatch(/manda/)
  })
  it('🔴 la columna sin fuente no se rotula como hallada en sus canales', () => {
    expect(esloganDelCliente({ tagline: 'Algo' })?.fuente).toBe('según el manual')
  })
})

describe('🔴 el manual leído', () => {
  const leer = (bb: Record<string, unknown>) => renderManualLimpio({ brand_book: { content_text: JSON.stringify({ brand_book_draft: bb }) }, client_name: 'X', country: null })
  it('🔴 lo presenta como contexto, sin obligación ni pedir explicación, y ya no entre los lemas propuestos', () => {
    const t = leer(BORRADOR).texto
    expect(t).toMatch(/UNA FRASE QUE EL CLIENTE USA \(es contexto: úsala, adáptala o propón otra mejor\)[\s\S]*Cuando tengas esa sed/)
    expect(t).not.toMatch(/úsalo|di por qué|YA USA/i)
    expect(t.slice(t.indexOf('LEMAS PROPUESTOS'))).not.toMatch(/Cuando tengas esa sed/)
    expect(t).toMatch(/LEMAS PROPUESTOS[\s\S]*Fresco y bueno/)
  })
  it('sin eslogan no imprime un título huérfano ni lo declara como hueco', () => {
    const r = leer({ tagline_opciones: ['PROPUESTA: uno'] })
    expect(r.texto).not.toMatch(/FRASE QUE EL CLIENTE/)
    expect(r.omitidas).not.toContain('_eslogan')
  })
})

describe('🔴 la carpeta', () => {
  const manual = (o: Record<string, unknown>) => ({ client_id: C, version: 2, tagline: null, content_text: JSON.stringify({ brand_book_draft: BORRADOR }), ...o })
  it('lo trae con su fuente y su regla, del manual vigente de ESTE cliente', async () => {
    const db = new DbFalsa().semilla('client_brand_books', [manual({ version: 1, content_text: '{}', tagline: 'Viejo' }), manual({}), manual({ client_id: 'otro', version: 9, tagline: 'Ajeno' })]).semilla('cerebro_fichas', [])
    const c = await adjuntoDelCliente(db as never, C)
    expect(c.eslogan).toMatchObject({ texto: 'Cuando tengas esa sed, aquí estamos!', regla: REGLA_DEL_ESLOGAN })
    expect(textoDeLaCarpeta(c)).toMatch(/Una frase que el cliente usa \(contexto\)[\s\S]*Cuando tengas esa sed[\s\S]*propón otra mejor/i)
    expect(textoDeLaCarpeta(c)).not.toMatch(/úsalo|di por qué|ya usa/i)
  })
  it('🔴 si la lectura del manual falla o lanza, la carpeta viaja igual (E15 de CC3)', async () => {
    const fichas = new DbFalsa().semilla('cerebro_fichas', [])
    const conManualRoto = (roto: () => unknown) => ({ from: (tabla: string) => (tabla === 'client_brand_books' ? roto() : fichas.from(tabla)) })
    const lanza = await adjuntoDelCliente(conManualRoto(() => { throw new Error('caída') }) as never, C)
    expect(lanza).not.toHaveProperty('eslogan'); expect(lanza.resumen_vivo).toBeDefined()
    const consulta: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) consulta[m] = () => consulta
    consulta.then = (ok: (v: unknown) => unknown) => ok({ data: null, error: { message: 'tiempo agotado' } })
    const conError = await adjuntoDelCliente(conManualRoto(() => consulta) as never, C)
    expect(conError).not.toHaveProperty('eslogan'); expect(conError.resumen_vivo).toBeDefined()
  })
  it('sin manual, o con un contenido ilegible, la carpeta viaja igual', async () => {
    const sin = await adjuntoDelCliente(new DbFalsa().semilla('cerebro_fichas', []) as never, C)
    expect(sin).not.toHaveProperty('eslogan'); expect(textoDeLaCarpeta(sin)).not.toMatch(/Eslogan/)
    const roto = await adjuntoDelCliente(new DbFalsa().semilla('client_brand_books', [manual({ content_text: 'no es json', tagline: 'De columna' })]).semilla('cerebro_fichas', []) as never, C)
    expect(roto.eslogan?.texto).toBe('De columna')
  })
})

describe('la cadena', () => {
  const lee = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it('lo lee del manual y las dos mesas lo reciben (de forma, sobre el código)', () => {
    expect(lee('src/lib/cadena/almacen-supabase.ts')).toMatch(/eslogan: esloganParaLaCadena\(manual\)/)
    expect(lee('src/lib/cadena/almacen-supabase.ts')).toMatch(/palabras_con_intencion, tagline, version/)
    expect(lee('src/lib/cadena/mesas.ts').split('a.ctx.eslogan ?').length - 1).toBe(2)
  })
})
