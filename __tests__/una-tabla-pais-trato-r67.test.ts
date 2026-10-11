/**
 * Ronda 67 · D1 · UNA sola tabla país → trato. El módulo del detector (`src/lib/trato/trato-logica.js`) es la fuente; la planeación, el alta, el brief, la pieza y la copia por filas llevan
 * EL MISMO bloque (lo pega el constructor). Aquí: bloque idéntico en cada nodo, ninguna tabla vieja viva, comportamiento igual y «Ecuador.» con punto resuelto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { BLOQUE, detector, planeacion, alta, reservaDe } from '../scripts/worker-staging/construir-una-tabla-r67.mjs'

const require = createRequire(import.meta.url)
const modulo = require('../src/lib/trato/trato-logica.js') as {
  POR_PAIS: Record<string, string>; CODIGO_PAIS: Record<string, string>; paisNormal: (s: unknown) => string
  resolverTrato: (manual: unknown, f: Record<string, unknown>) => { trato?: string; fuente?: string }
}
const WS = join(process.cwd(), 'scripts/worker-staging')
type Nodo = { name: string; parameters: { jsCode?: string } }
const flujo = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as { nodes: Nodo[]; active?: boolean }
const RESERVA = 'Schedule Kickoff Call (Cal.com)'
const lf = (s: string) => s.split('\r\n').join('\n')

const FLUJOS: Array<[string, string, string[], (c: string) => string]> = [
  ['brief', 'PQdIgbuFexuBsoh8/brief-ARREGLADO-ronda67-2026-10-11.json', ['③ Armar', '④ Chequeos'], detector],
  ['pieza', 'lVCLzxQCKNkd3uS0/pieza-ARREGLADA-ronda67-2026-10-11.json', ['⑤ Armar', '⑦ Chequeos'], detector],
  ['copia por filas', 'cadena/parte-por-filas-ARREGLADA-ronda67-2026-10-11.json', ['③ Armar', '④ Chequeos'], detector],
  ['planeación', 'X9F0zp6LQ2xGEYVS/planeacion-ARREGLADA-ronda67-2026-10-11.json', ['① GUARDA', 'Redactor (B4)'], planeacion],
  ['alta', 'LyVoKcrypS5uLyuu/alta-ARREGLADA-ronda67-2026-10-11.json', ['[JEFATURA] Transform discovery'], alta],
]
const ANTES: Record<string, string> = {
  brief: 'PQdIgbuFexuBsoh8/brief-ANTES-ronda67-2026-10-11.json', pieza: 'lVCLzxQCKNkd3uS0/pieza-ANTES-ronda67-2026-10-11.json',
  'copia por filas': 'cadena/parte-por-filas-ANTES-ronda67-2026-10-11.json', planeación: 'X9F0zp6LQ2xGEYVS/planeacion-ANTES-ronda67-2026-10-11.json',
  alta: 'LyVoKcrypS5uLyuu/alta-ANTES-ronda67-2026-10-11.json',
}
const elegidos = (f: { nodes: Nodo[] }, prefijos: string[]) => f.nodes.filter((n) => prefijos.some((p) => n.name.startsWith(p)) && typeof n.parameters.jsCode === 'string')

describe('la única tabla', () => {
  it('tiene la unión verificada: 16 países, cada código de dos letras apunta a uno de ellos, y el trato es tu/vos/usted', () => {
    expect(Object.keys(modulo.POR_PAIS).length).toBe(16)
    for (const v of Object.values(modulo.POR_PAIS)) expect(['tu', 'vos', 'usted']).toContain(v)
    for (const [cod, pais] of Object.entries(modulo.CODIGO_PAIS)) { expect(cod).toMatch(/^[a-z]{2}$/); expect(modulo.POR_PAIS[pais]).toBeDefined() }
    for (const p of Object.keys(modulo.POR_PAIS)) expect(modulo.paisNormal(p)).toBe(p)
  })
  it('«Ecuador.» con punto, el código, mayúsculas y tildes dan la misma clave; lo desconocido NO se adivina', () => {
    for (const s of ['Ecuador.', 'EC', ' ecuador ', 'ECUADOR!']) expect(modulo.paisNormal(s)).toBe('ecuador')
    expect(modulo.paisNormal('República Dominicana')).toBe('republica dominicana')
    expect(modulo.paisNormal('Rep. Dominicana')).toBe('republica dominicana')
    expect(modulo.paisNormal('Francia')).toBe('francia')
    expect(modulo.POR_PAIS[modulo.paisNormal('Francia')]).toBeUndefined()
    expect(modulo.paisNormal(null)).toBe('')
  })
  it('el detector resuelve «Ecuador.» y Costa Rica (usted)', () => {
    expect(modulo.resolverTrato(null, { country: 'Ecuador.' }).trato).toBe('tu')
    expect(modulo.resolverTrato(null, { country: 'cr' }).trato).toBe('usted')
    expect(modulo.resolverTrato(null, { country: 'Francia' }).trato).toBe('no_definido')
  })
})

describe('los 5 flujos llevan EL MISMO bloque que el módulo', () => {
  for (const [nombre, ruta, prefijos] of FLUJOS) {
    it(`${nombre}: cada nodo tocado contiene el bloque idéntico, una sola vez`, () => {
      const f = flujo(ruta)
      const nodos = elegidos(f, prefijos)
      expect(nodos.length).toBe(prefijos.length)
      for (const n of nodos) { const c = lf(n.parameters.jsCode!); expect(c.split(BLOQUE).length - 1).toBe(1) }
    })
    it(`${nombre}: ya no queda ninguna tabla vieja de países`, () => {
      const f = flujo(ruta)
      for (const n of elegidos(f, prefijos)) {
        const c = lf(n.parameters.jsCode!)
        expect(c).not.toContain("var POR_PAIS = { argentina: 'vos', uruguay: 'vos', paraguay: 'vos', ecuador: 'tu', mexico: 'tu', peru: 'tu', chile: 'tu', espana: 'tu', bolivia: 'tu', venezuela: 'tu', panama: 'tu', 'costa rica': 'usted' }")
        expect(c).not.toContain('_PAIS_TRATO')
        expect(c).not.toMatch(/REGISTRO_POR_PAIS = \{\n/)
      }
    })
    it(`${nombre}: se reconstruye igual desde el respaldo y deshacer da el respaldo (solo cambian los nodos tocados)`, () => {
      const antes = flujo(ANTES[nombre]), hoy = flujo(ruta)
      const fn = FLUJOS.find((x) => x[0] === nombre)![3]
      const tocados = new Set(elegidos(antes, prefijos).map((n) => n.name))
      if (nombre === 'alta') tocados.add(RESERVA) // CC#3 §2.5-1: la reserva manda el client_id (prueba abajo)
      const igualOReserva = (n: Nodo, h: Nodo) => (n.name === RESERVA ? h.parameters.jsCode === n.parameters.jsCode : h.parameters.jsCode === fn(n.parameters.jsCode!))
      void igualOReserva
      for (const n of antes.nodes) {
        const h = hoy.nodes.find((x) => x.name === n.name)!
        if (n.name === RESERVA) continue
        if (tocados.has(n.name)) expect(h.parameters.jsCode).toBe(fn(n.parameters.jsCode!))
        else expect(JSON.stringify(h)).toBe(JSON.stringify(n))
      }
      expect(hoy.nodes.length).toBe(antes.nodes.length)
      expect(hoy.active).toBe(antes.active)
    })
  }
})

describe('comportamiento', () => {
  it('detector embebido: la función resolverTrato de cada nodo es EXACTAMENTE la del módulo (mismo trato para cada país, código y variante)', () => {
    const fuente = lf(readFileSync(join(process.cwd(), 'src/lib/trato/trato-logica.js'), 'utf8'))
    const tomar = (c: string) => { const i = c.indexOf('function resolverTrato'); return c.slice(i, c.indexOf('\n}\n', i) + 3) }
    const esperada = tomar(fuente)
    expect(esperada.length).toBeGreaterThan(500)
    for (const [, ruta, prefijos] of FLUJOS.slice(0, 3)) for (const n of elegidos(flujo(ruta), prefijos)) expect(tomar(lf(n.parameters.jsCode!))).toBe(esperada)
    for (const pais of [...Object.keys(modulo.POR_PAIS), ...Object.keys(modulo.CODIGO_PAIS), 'Ecuador.', 'Rep. Dominicana']) {
      expect(modulo.resolverTrato(null, { country: pais }).trato).toBe(modulo.POR_PAIS[modulo.paisNormal(pais)])
    }
  })
  it('planeación: el registro sale de la única tabla (tu→tuteo · vos→voseo · usted→formal)', () => {
    const src = readFileSync(join(WS, 'X9F0zp6LQ2xGEYVS/registro-del-cliente.js'), 'utf8')
    const lib = new Function(`${src}\nreturn { registroFinal, REGISTRO_POR_PAIS }`)() as { registroFinal: (m: unknown, p: string) => { registro?: string }; REGISTRO_POR_PAIS: Record<string, string> }
    expect(Object.keys(lib.REGISTRO_POR_PAIS).sort()).toEqual(Object.keys(modulo.POR_PAIS).sort())
    const mapa: Record<string, string> = { tu: 'tuteo', vos: 'voseo', usted: 'formal' }
    for (const [k, v] of Object.entries(modulo.POR_PAIS)) expect(lib.REGISTRO_POR_PAIS[k]).toBe(mapa[v])
    expect(lib.registroFinal(null, 'Ecuador.').registro).toBe('tuteo')
    expect(lib.registroFinal(null, 'AR').registro).toBe('voseo')
    expect(lib.registroFinal(null, 'Costa Rica').registro).toBe('formal')
    expect(lib.registroFinal(null, 'Francia').registro).toBe('sin_dato')
  })
  it('alta: el idioma sale de la única tabla, con «Ecuador.» y códigos; sin país o país desconocido queda vacío y declarado', () => {
    const f = flujo(FLUJOS[4][1])
    const c = lf(elegidos(f, FLUJOS[4][2])[0].parameters.jsCode!)
    const ini = c.indexOf(BLOQUE), fin = c.indexOf('let _idioma_cliente')
    const idioma = new Function(`${c.slice(ini, fin)}\nreturn _idiomaDelCliente`)() as (d: unknown) => { texto: string; estado: string; pais: string | null }
    expect(idioma({ country: 'Ecuador.' })).toMatchObject({ estado: 'por_pais', pais: 'ecuador' })
    expect(idioma({ country: 'Ecuador.' }).texto).toContain('tuteo')
    expect(idioma({ country: 'AR' }).texto).toContain('voseo')
    expect(idioma({ country: 'Costa Rica' }).texto).toContain('usted')
    expect(idioma({ location: 'Olón · Ecuador' })).toMatchObject({ estado: 'por_pais', pais: 'ecuador' })
    expect(idioma({ country: 'Francia' })).toMatchObject({ texto: '', estado: 'pais_sin_registro_conocido', pais: 'francia' })
    expect(idioma({})).toMatchObject({ texto: '', estado: 'pendiente_sin_pais', pais: null })
    expect(idioma({ country: 'constructor' })).toMatchObject({ estado: 'pais_sin_registro_conocido' })
  })
})

describe('CC#3 §2.5-1 · las dos reservas del alta mandan el client_id (sin él, #495 deja la zona en UTC y la reserva sin cliente)', () => {
  const CASOS: Array<[string, string, string, string]> = [
    ['alta', 'LyVoKcrypS5uLyuu/alta-ANTES-ronda67-2026-10-11.json', 'LyVoKcrypS5uLyuu/alta-ARREGLADA-ronda67-2026-10-11.json', 'Validate Deal Data'],
    ['segunda fase', 'wu1DUAXIuEG5nNTX/segunda-fase-ANTES-ronda67-2026-10-11.json', 'wu1DUAXIuEG5nNTX/segunda-fase-ARREGLADA-ronda67-2026-10-11.json', 'Datos del alta'],
  ]
  const render = (cuerpo: string, nodo: string, item: Record<string, unknown>) => {
    const sinPlantilla = cuerpo.replace(/^=/, '')
    const evaluar = (expr: string) => new Function('$', 'JSON', 'Date', 'return (' + expr + ')')((n: string) => ({ item: { json: n === nodo ? item : {} } }), JSON, Date)
    return JSON.parse(sinPlantilla.replace(/\{\{\s*([\s\S]*?)\s*\}\}/g, (_m, e: string) => String(evaluar(e))))
  }
  for (const [nombre, antes, hoy, nodo] of CASOS) {
    it(nombre + ': solo cambia el cuerpo de la reserva, que ahora trae el client_id (o null) y lo demás igual', () => {
      const a = flujo(antes), h = flujo(hoy)
      const cuerpo = (f: { nodes: Nodo[] }) => String((f.nodes.find((n) => n.name === RESERVA) as unknown as { parameters: { jsonBody: string } }).parameters.jsonBody)
      expect(cuerpo(h)).toBe(reservaDe(nodo)(cuerpo(a)))
      const dif = a.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(h.nodes.find((x) => x.name === n.name))).map((n) => n.name)
      expect(dif.filter((x) => x === RESERVA)).toEqual([RESERVA])
      expect(h.active).toBe(a.active)
      const con = render(cuerpo(h), nodo, { client_id: 'abc-123', client_name: 'X', contact_email: 'a@b.c' })
      expect(con.client_id).toBe('abc-123')
      const sin = render(cuerpo(h), nodo, { client_name: 'X', contact_email: 'a@b.c' })
      expect(sin.client_id).toBeNull()
      expect(con.contact_email).toBe('a@b.c')
    })
  }
})
