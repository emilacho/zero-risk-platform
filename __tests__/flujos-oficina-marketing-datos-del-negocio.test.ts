/**
 * 01-nov · ADENDA 3 (punto 11) · UNA SOLA FUENTE de los datos del negocio en Brief `PQdIgbuFexuBsoh8`, parte por filas `BNXqlaX1oHSfZIpF` y Pieza `lVCLzxQCKNkd3uS0`. US$ 0, sin red; se ejecuta el CÓDIGO REAL.
 * Fija: el nodo que lee `POST /api/cliente/datos-del-negocio`; el MISMO bloque de código en los tres flujos; qué imprime con 200, con 502 (lectura parcial) y con cualquier fallo (nunca se lee un error como «no hay datos»);
 * que el eslogan de la fuente gana a la columna `tagline`; y que con una fuente vacía el pedido es el de antes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODOS_BRIEF, NODOS_PIEZA } from '../scripts/ops/oficina-marketing/construir-palabras.mjs'
import { NODO_DATOS } from '../scripts/ops/oficina-marketing/datos-del-negocio.mjs'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'nuevo', `${id}.json`), 'utf8'))
const BRIEF = 'PQdIgbuFexuBsoh8', CADENA = 'BNXqlaX1oHSfZIpF', PIEZA = 'lVCLzxQCKNkd3uS0'
const FLUJOS: [string, any][] = [[BRIEF, NODOS_BRIEF], [CADENA, NODOS_BRIEF], [PIEZA, NODOS_PIEZA]]
const codigoDe = (f: any, nombre: string): string => f.nodes.find((n: any) => n.name === nombre).parameters.jsCode
const sig = (f: any, nodo: string): string => f.connections[nodo].main[0][0].node
const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor

const INICIO = '// 01-nov · UNA SOLA FUENTE · los datos del negocio vienen de POST /api/cliente/datos-del-negocio'
const FIN = '// 01-nov · EL ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE)'
const segmento = (c: string) => c.slice(c.indexOf(INICIO), c.indexOf(FIN))

const CUERPO_COMPLETO = {
  ok: true,
  eslogan: { texto: 'Cuando tengas esa hambre de... Náufrago te espera!', fuente: 'Frase propia del cliente — literal', regla: 'Es del cliente.' },
  sedes: [
    { clave: 'olon', ciudad: 'Olón', datos: [{ campo: 'horario', valor: 'Lun-Dom 9:00-18:00', fuente: 'dueno' }] },
    { clave: 'guayaquil', ciudad: 'Guayaquil', datos: [{ campo: 'horario', valor: 'Mié-Dom 12:00-21:00', fuente: 'sitio' }] },
  ],
  hechos_del_dueno: [{ tema: 'Procedencia del marisco', respuesta: 'No viene de Olón.', sede: '', frases_negadas: ['marisco de Olón'] }],
  activos_solo_lectura: ['sitio web', 'perfil de Google'],
  sin_dato: ['carta y precios por sede'],
  fallos: [],
}
/** ejecuta el segmento compartido con la lectura dada y devuelve `bloquesDelNegocio` */
const bloques = async (lectura: any, limpiar?: (t: string) => string): Promise<string[]> => {
  const seg = segmento(codigoDe(leer(BRIEF), NODOS_BRIEF.armar))
  const $ = (n: string) => { if (n !== NODO_DATOS) throw new Error('nodo no previsto ' + n); return { first: () => ({ json: lectura }) } }
  const cuerpo = seg + '\nreturn bloquesDelNegocio'
  return new AsyncFunction('$', 'limpiar', cuerpo)($, limpiar)
}
const texto = async (lectura: any, limpiar?: (t: string) => string) => (await bloques(lectura, limpiar)).join('\n')

describe('el nodo de la lectura única', () => {
  it.each(FLUJOS)('%s: POST a /api/cliente/datos-del-negocio con la llave interna y el client_id del sobre; el error pasa al nodo', (id) => {
    const n = leer(id).nodes.find((x: any) => x.name === NODO_DATOS)
    expect(n.parameters.method).toBe('POST')
    expect(n.parameters.url).toContain('/api/cliente/datos-del-negocio')
    expect(JSON.stringify(n.parameters.headerParameters)).toContain('$env.INTERNAL_API_KEY')
    expect(n.parameters.jsonBody).toContain("$('⓪ Sobre · llave · modo seco').first().json.client_id")
    expect(n.parameters.options.response.response).toEqual({ fullResponse: true, neverError: true })
    expect(n.onError).toBe('continueRegularOutput')
    expect(n.alwaysOutputData).toBe(true)
    expect(JSON.stringify(n)).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}|\bsk-[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9]{10,}/)
  })
  it.each(FLUJOS)('%s: va justo después de la guarda del manual y antes de lo que seguía', (id, nodos) => {
    const f = leer(id)
    expect(sig(f, nodos.guarda)).toBe(NODO_DATOS)
    expect(f.connections[NODO_DATOS].main[0].length).toBe(1)
    expect(f.nodes.filter((n: any) => n.name === NODO_DATOS).length).toBe(1)
    expect(new Set(f.nodes.map((n: any) => n.id)).size).toBe(f.nodes.length)
  })
  it('el destino de cada flujo es el mismo que tenía antes de colgarle la lectura', () => {
    expect(sig(leer(BRIEF), NODO_DATOS)).toBe('② Cargar la aprobación del plan')
    expect(sig(leer(CADENA), NODO_DATOS)).toBe('② Cargar plan vigente')
    expect(sig(leer(PIEZA), NODO_DATOS)).toBe('③ Cargar las fotos propias')
  })
})

describe('el MISMO código en los tres flujos', () => {
  it('el segmento de la fuente única es idéntico byte a byte en brief, parte por filas y pieza', () => {
    const b = segmento(codigoDe(leer(BRIEF), NODOS_BRIEF.armar))
    expect(b.length).toBeGreaterThan(2000)
    expect(segmento(codigoDe(leer(CADENA), NODOS_BRIEF.armar))).toBe(b)
    expect(segmento(codigoDe(leer(PIEZA), NODOS_PIEZA.armar))).toBe(b)
  })
  it('brief y parte imprimen los bloques tras el eslogan; la pieza, antes del brief', () => {
    for (const id of [BRIEF, CADENA]) expect(codigoDe(leer(id), NODOS_BRIEF.armar)).toContain('  ...bloqueEslogan,\n  ...bloquesDelNegocio,\n')
    expect(codigoDe(leer(PIEZA), NODOS_PIEZA.armar)).toContain("...bloqueEslogan, ...bloquesDelNegocio, '════════ EL BRIEF ════════'")
  })
  it('la pieza conserva su recolector de sedes aparte (esto se SUMA, no lo reemplaza)', () => {
    expect(leer(PIEZA).nodes.some((n: any) => n.name === '⑤ Sedes y voz del cliente')).toBe(true)
  })
})

describe('con 200: lo que se imprime', () => {
  it('hechos del dueño, sedes, activos de solo lectura y lo que falta', async () => {
    const t = await texto({ statusCode: 200, body: CUERPO_COMPLETO })
    expect(t).toContain('LO QUE DECLARÓ EL DUEÑO (hechos con la MÁXIMA precedencia)')
    expect(t).toContain('NO digas ni insinúes: «marisco de Olón»')
    expect(t).toContain('SEDES DEL CLIENTE (cada dato es de SU sede)')
    expect(t).toContain('- Sede Guayaquil [guayaquil]:\n   · horario: Mié-Dom 12:00-21:00 (fuente: sitio)')
    expect(t).toContain('ACTIVOS DEL CLIENTE QUE LA AGENCIA NO TOCA (solo lectura)')
    expect(t).toContain('- sitio web\n- perfil de Google')
    expect(t).toMatch(/no propongas editarlos/)
    expect(t).toMatch(/plantéalo como PEDIDO al dueño/)
    expect(t).toContain('LO QUE FALTA EN LOS DATOS DEL NEGOCIO')
    expect(t).toContain('- carta y precios por sede')
    expect(t).toMatch(/Decláralo como hueco nombrado/)
    expect(t).not.toContain('LECTURA PARCIAL')
    expect(t).not.toContain('NO SE PUDIERON LEER')
  })
  it('200 sin nada que contar ⇒ no imprime ningún bloque (el pedido es el de antes)', async () => {
    expect(await bloques({ statusCode: 200, body: { ok: true, sedes: [], hechos_del_dueno: [], activos_solo_lectura: [], sin_dato: [], fallos: [] } })).toEqual([])
    expect(await bloques({ statusCode: 200, body: { ok: true } })).toEqual([])
  })
  it('acotado y limpio: 10 activos, 10 faltas, nombres protegidos fuera, saltos colapsados', async () => {
    const muchos = Array.from({ length: 14 }, (_, i) => 'A' + i)
    const t = await texto({ statusCode: 200, body: { ok: true, activos_solo_lectura: muchos, sin_dato: muchos.map((x) => 'F' + x) } })
    expect(t).toContain('- A9')
    expect(t).not.toContain('- A10')
    expect(t).toContain('- FA9')
    expect(t).not.toContain('- FA10')
    const l = await texto({ statusCode: 200, body: { ok: true, activos_solo_lectura: ['web de Carlos\nMendoza'] } }, (x) => x.replace('Carlos Mendoza', '[persona]'))
    expect(l).toContain('- web de [persona]')
    expect(l).not.toContain('Carlos Mendoza')
  })
  it('lo que falta y los fallos también pasan por el limpiador de nombres protegidos', async () => {
    const lim = (x: string) => x.replace('Carlos Mendoza', '[persona]')
    const t = await texto({ statusCode: 502, body: { ok: false, sin_dato: ['menú de Carlos Mendoza'], fallos: ['fichas de Carlos Mendoza'] } }, lim)
    expect(t).toContain('- menú de [persona]')
    expect(t).toContain('No se pudo leer: fichas de [persona]')
    expect(t).not.toContain('Carlos Mendoza')
  })
  it('si el flujo no trae el nodo de lectura, no imprime nada (pedido idéntico al de antes)', async () => {
    const seg = segmento(codigoDe(leer(BRIEF), NODOS_BRIEF.armar))
    const $ = () => { throw new Error('Node hasn\'t been executed') }
    expect(await new AsyncFunction('$', 'limpiar', seg + '\nreturn bloquesDelNegocio')($, undefined)).toEqual([])
  })
  it('valores que no son texto o lista se ignoran sin romper', async () => {
    const t = await texto({ statusCode: 200, body: { ok: true, activos_solo_lectura: 'x', sin_dato: { a: 1 }, fallos: 7, sedes: 'x', hechos_del_dueno: 3 } })
    expect(t).toBe('')
  })
})

describe('con 502: lectura parcial', () => {
  it('imprime lo que se pudo leer y declara lo que no, sin inventarlo', async () => {
    const t = await texto({ statusCode: 502, body: { ok: false, sedes: CUERPO_COMPLETO.sedes, hechos_del_dueno: [], activos_solo_lectura: [], sin_dato: [], fallos: ['manual: timeout', 'fichas: caída'] } })
    expect(t).toContain('SEDES DEL CLIENTE')
    expect(t).toContain('DATOS DEL NEGOCIO · LECTURA PARCIAL')
    expect(t).toContain('No se pudo leer: manual: timeout · fichas: caída')
    expect(t).toMatch(/no lo inventes, decláralo como hueco/)
  })
})

describe('cualquier fallo de la lectura NO es «no hay datos»', () => {
  it.each([
    ['error de red', { error: { message: 'ECONNRESET' } }],
    ['401', { statusCode: 401, body: { error: 'unauthorized' } }],
    ['500', { statusCode: 500, body: { ok: false, error: 'datos_del_negocio_error' } }],
    ['400', { statusCode: 400, body: { error: 'invalid_client_id' } }],
    ['cuerpo ilegible', { statusCode: 200, body: 'no es json' }],
    ['cuerpo lista', { statusCode: 200, body: [] }],
    ['sin cuerpo', { statusCode: 200 }],
    ['200 con error', { statusCode: 200, error: 'x', body: CUERPO_COMPLETO }],
    ['vacío', {}],
  ])('%s: el pedido lo dice y no imprime datos', async (_n, lectura) => {
    const t = await texto(lectura as any)
    expect(t).toContain('DATOS DEL NEGOCIO · NO SE PUDIERON LEER')
    expect(t).toMatch(/No inventes sedes, horarios, precios, eslogan ni hechos del dueño: decláralos como hueco/)
    expect(t).not.toContain('SEDES DEL CLIENTE')
    expect(t).not.toContain('LO QUE DECLARÓ EL DUEÑO')
  })
})

// el armado completo (brief y parte por filas): el eslogan de la fuente gana a la columna
const P = '② ¿Ya hay parte de este plan? · guarda'
const BASE = { client_id: 'c-1', dry_run: false, manual_id: 'm-1', manual_version: 2, manual_texto: 'TEXTO DEL MANUAL', manual_voz: { voice_description: 'Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {} }, forbidden_words: [], required_terminology: [], plan_id: 'p-1', plan_texto: 'TEXTO DEL PLAN' }
const pedido = async (id: string, lectura: any, prev: Record<string, unknown> = {}) => {
  const f = leer(id)
  const r = await recorrer(f, NODOS_BRIEF.armar, { name: 'Náufrago', country: 'Ecuador', config: {} }, { previos: { [P]: [{ ...BASE, ...prev }], [NODO_DATOS]: [lectura] }, hasta: [sig(f, NODOS_BRIEF.armar)] })
  return r.historial[NODOS_BRIEF.armar][0].cuerpo.task as string
}
describe.each([BRIEF, CADENA])('%s · el pedido completo', (id) => {
  it('con 200 completo: los bloques van tras el manual, antes del plan, y una sola vez', async () => {
    const t = await pedido(id, { statusCode: 200, body: CUERPO_COMPLETO })
    for (const h of ['LO QUE DECLARÓ EL DUEÑO', 'SEDES DEL CLIENTE', 'ACTIVOS DEL CLIENTE QUE LA AGENCIA NO TOCA', 'LO QUE FALTA EN LOS DATOS DEL NEGOCIO']) expect(t.split(h).length).toBe(2)
    expect(t.indexOf('TEXTO DEL MANUAL')).toBeLessThan(t.indexOf('SEDES DEL CLIENTE'))
    expect(t.indexOf('SEDES DEL CLIENTE')).toBeLessThan(t.indexOf('TEXTO DEL PLAN'))
  })
  it('el eslogan de la fuente se imprime con su fuente y GANA a la columna tagline', async () => {
    const t = await pedido(id, { statusCode: 200, body: CUERPO_COMPLETO }, { manual_tagline: 'Eslogan viejo del manual' })
    expect(t).toContain('«Cuando tengas esa hambre de... Náufrago te espera!»')
    expect(t).toContain('Fuente: Frase propia del cliente — literal')
    expect(t).not.toContain('Eslogan viejo del manual')
  })
  it('sin eslogan en la fuente: cae a la columna tagline (sin línea de fuente)', async () => {
    const t = await pedido(id, { statusCode: 200, body: { ok: true, sedes: [], hechos_del_dueno: [], activos_solo_lectura: [], sin_dato: [], fallos: [] } }, { manual_tagline: 'Eslogan del manual' })
    expect(t).toContain('«Eslogan del manual»')
    expect(t).not.toContain('Fuente: ')
  })
  it('si la lectura falla: el aviso va y la columna tagline sigue sirviendo como respaldo', async () => {
    const t = await pedido(id, { statusCode: 500, body: { ok: false } }, { manual_tagline: 'Eslogan del manual' })
    expect(t).toContain('DATOS DEL NEGOCIO · NO SE PUDIERON LEER')
    expect(t).toContain('«Eslogan del manual»')
  })
  it('si la lectura trae error, el eslogan de su cuerpo NO se usa: manda la columna tagline', async () => {
    const t = await pedido(id, { statusCode: 200, error: 'x', body: CUERPO_COMPLETO }, { manual_tagline: 'Eslogan del manual' })
    expect(t).toContain('«Eslogan del manual»')
    expect(t).not.toContain('Cuando tengas esa hambre')
  })
  it('eslogan de la fuente vacío o sin texto: no imprime un bloque vacío', async () => {
    for (const e of [null, {}, { texto: '   ' }, { texto: 7 }, 'x', ['a']]) {
      const t = await pedido(id, { statusCode: 200, body: { ok: true, eslogan: e } })
      expect(t).not.toContain('ESLOGAN QUE EL CLIENTE YA USA')
    }
  })
})
