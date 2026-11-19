/**
 * 18-nov · ids únicos al juntar el banco de la gran idea (corrección de CC1 · GO Lenovo 13:08Z, «dentro de la (b)»).
 * Causa medida en T7d (concepto 5, encargo 0aa14d17): cada miembro numera desde C1-I01; la cadena se quedaba con la primera línea de cada id y botaba
 * las demás como «id duplicado» → 71 ideas escritas, 32 en el banco. Ahora la segunda se renumera dentro de su capítulo.
 * El fixture sale del registro real (`oficina_mesa_aportes`, solo lectura): de los aportes quedan sus líneas de idea; las integraciones van enteras.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ideasDeLosAportes, textoParaLaCadena } from '../mesa/de-la-cadena'
import { ideasDelTexto, leerConcepto, type InsumosDelConcepto } from '@/lib/cadena/conceptos'

type Ap = { n: number; de: string; tipo: string; texto: string }
const real = JSON.parse(readFileSync(join(__dirname, '../__fixtures__/libro-concepto-5-0aa14d17-real.json'), 'utf8')) as { libro: Ap[] }
// las cuotas reales de la campaña 36e66179 (banco_parcial del concepto 5: 18+2+18+2+36+4+36+4 = 120)
const INSUMOS: InsumosDelConcepto = {
  fases: [{ clave: 'desbloquear', semanas: 3 }, { clave: 'cimientos', semanas: 3 }, { clave: 'velocidad', semanas: 6 }, { clave: 'acumular', semanas: 6 }],
  redes: [{ red: 'instagram', huecos_por_semana: 6 }, { red: 'whatsapp', huecos_por_semana: 2 / 3 }],
  prohibidas: [], fotos: [],
}
const idea = (id: string, texto: string, extra = '') => `- ${id} · instagram · post · ${texto} · mensaje: m ${texto} · gancho: g ${texto}${extra}`
const integra = (texto: string, n = 9): Ap => ({ n, de: 'dir', tipo: 'integra', texto })
const aporta = (n: number, de: string, ...lineas: string[]): Ap => ({ n, de, tipo: 'aporta', texto: lineas.join('\n') })
const ids = (lineas: string[]) => lineas.map((l) => /^- (\S+) ·/.exec(l)?.[1])

describe('el banco real de T7d (concepto 5) · ids únicos', () => {
  const md = textoParaLaCadena(real.libro, null, true)
  const c = leerConcepto(md, INSUMOS)

  it('🔴 las 71 escritas: 70 entran al banco y ninguna se pierde por «id duplicado» (antes: 32 y 39 duplicadas)', () => {
    expect(c.banco.length).toBe(70)
    expect(c.ideas_descartadas.filter((d) => /id duplicado/.test(d.motivo))).toEqual([])
    // la única que sale es una repetición de verdad (mismo mensaje), declarada
    expect(c.ideas_descartadas.map((d) => d.motivo.replace(/\(igual al de [^)]+\)/, '(…)'))).toEqual(['mensaje repetido (…)'])
  })

  it('🔴 la idea fiel a la hipótesis B que se perdía por id repetido (REVISION-CC6-agente-de-la-gran-idea §4.3) ahora entra al banco', () => {
    const b = c.banco.filter((i) => /lunes de origen/i.test(i.idea))
    expect(b).toHaveLength(1)
    expect(b[0].mensaje).toMatch(/guayaquil/i)
    expect(b[0].capitulo).toBe('cimientos')
  })

  it('cada id del banco es único', () => {
    expect(new Set(c.banco.map((i) => i.id)).size).toBe(c.banco.length)
  })

  it('🔴 las 32 que ya entraban conservan su id y su línea: lo que la dirección cita sigue apuntando a la misma idea', () => {
    // el texto «antes» se arma sin renumerar: las líneas de los aportes en el mismo orden, quedándose con la primera de cada id (como hacía la cadena)
    const integracion = [...real.libro].reverse().find((a) => a.tipo === 'integra')!.texto.trim()
    const vistas = new Set<string>()
    const antes = new Map<string, string>()
    for (const i of ideasDelTexto(integracion)) if (!antes.has(i.id)) antes.set(i.id, i.linea)
    for (const l of ideasDeLosAportesSinRenumerar(real.libro, integracion)) { const i = ideasDelTexto(l)[0]; if (i && !antes.has(i.id) && !vistas.has(l)) { vistas.add(l); antes.set(i.id, i.linea) } }
    const ahora = new Map(c.banco.map((i) => [i.id, i.linea]))
    const cAntes = leerConcepto(`${integracion}\n\n${[...antes.values()].join('\n')}`, INSUMOS)
    expect(cAntes.banco.length).toBe(32)
    for (const i of cAntes.banco) expect(ahora.get(i.id)).toBe(i.linea)
  })

  it('los ids nuevos son mayores que cualquier id de su capítulo escrito en el libro', () => {
    const maximo = new Map<string, number>()
    for (const a of real.libro) for (const m of a.texto.matchAll(/\bC([A-Za-z0-9_]+)-I(\d{2,})\b/g)) maximo.set(m[1], Math.max(maximo.get(m[1]) ?? 0, Number(m[2])))
    const escritos = new Set(real.libro.flatMap((a) => [...a.texto.matchAll(/\bC[A-Za-z0-9_]+-I\d{2,}\b/g)].map((m) => m[0])))
    const nuevos = c.banco.filter((i) => !escritos.has(i.id))
    expect(nuevos.length).toBe(38)
    for (const i of nuevos) {
      const [, cap, n] = /^C([A-Za-z0-9_]+)-I(\d{2,})$/.exec(i.id)!
      expect(Number(n)).toBeGreaterThan(maximo.get(cap) ?? 0)
    }
  })

  it('es determinista: dos lecturas del mismo libro dan el mismo texto', () => {
    expect(textoParaLaCadena(real.libro, null, true)).toBe(md)
  })
})

describe('ids únicos · casos', () => {
  it('🔴 dos aportes con el mismo id e ideas distintas: la segunda se renumera (y no se pierde)', () => {
    const libro = [aporta(1, 'a', idea('C1-I01', 'uno')), aporta(2, 'b', idea('C1-I01', 'dos')), integra('## Gran idea\nX · y')]
    const out = ideasDeLosAportes(libro, libro[2].texto)
    expect(ids(out)).toEqual(['C1-I01', 'C1-I02'])
    // del más nuevo al más viejo: el aporte 2 conserva el id
    expect(out[0]).toContain('dos')
    expect(out[1]).toContain('uno')
  })

  it('la integración manda: su idea conserva el id y la del aporte con el mismo id se renumera', () => {
    const integ = `## Banco\n${idea('C2-I03', 'de la dirección')}`
    const libro = [aporta(1, 'a', idea('C2-I03', 'del miembro')), integra(integ)]
    const out = ideasDeLosAportes(libro, integ)
    expect(out).toEqual([`- C2-I04 · instagram · post · del miembro · mensaje: m del miembro · gancho: g del miembro`])
  })

  it('el aporte citado por la integración conserva el id; el no citado se renumera', () => {
    const integ = 'Uso A1 (C1-I01).'
    const libro = [aporta(1, 'a', idea('C1-I01', 'citada')), aporta(2, 'b', idea('C1-I01', 'no citada')), integra(integ, 3)]
    const out = ideasDeLosAportes(libro, integ)
    expect(out[0]).toBe(idea('C1-I01', 'citada'))
    expect(out[1]).toBe(idea('C1-I02', 'no citada'))
  })

  it('🔴 la misma idea repetida (mismo texto, aunque cambien mayúsculas, tildes o el envoltorio) NO se renumera: es una sola', () => {
    const libro = [aporta(1, 'a', idea('C1-I01', 'Café')), aporta(2, 'b', `- **C1-I01** · instagram · post · cafe · mensaje: m cafe · gancho: g cafe`), integra('## G\nx')]
    const out = ideasDeLosAportes(libro, '## G\nx')
    expect(ids(out)).toEqual(['C1-I01', 'C1-I01'])
    const c = leerConcepto(`## Gran idea\nX · y\n${out.join('\n')}`, INSUMOS)
    expect(c.banco.map((i) => i.id)).toEqual(['C1-I01'])
    expect(c.ideas_descartadas).toEqual([])
  })

  it('🔴 el id nuevo no cae sobre uno que alguien ya escribió o citó (p. ej. en «Ideas que salen»)', () => {
    const integ = '## Gran idea\nX · y\n## Ideas que salen\n- C1-I07: no va'
    const libro = [aporta(1, 'a', idea('C1-I01', 'uno'), idea('C1-I05', 'cinco')), aporta(2, 'b', idea('C1-I01', 'otra')), integra(integ)]
    const out = ideasDeLosAportes(libro, integ)
    expect(ids(out)).toEqual(['C1-I01', 'C1-I08', 'C1-I05'])
  })

  it('cada capítulo numera aparte', () => {
    const libro = [aporta(1, 'a', idea('C1-I01', 'a1'), idea('C2-I01', 'a2')), aporta(2, 'b', idea('C1-I01', 'b1'), idea('C2-I01', 'b2')), integra('x')]
    expect(ids(ideasDeLosAportes(libro, 'x'))).toEqual(['C1-I01', 'C2-I01', 'C1-I02', 'C2-I02'])
  })

  it('tres choques del mismo id: cada uno recibe su propio número', () => {
    const libro = [aporta(1, 'a', idea('C1-I01', 'a')), aporta(2, 'b', idea('C1-I01', 'b')), aporta(3, 'c', idea('C1-I01', 'c')), integra('x')]
    expect(ids(ideasDeLosAportes(libro, 'x'))).toEqual(['C1-I01', 'C1-I02', 'C1-I03'])
  })

  it('el id renumerado conserva el resto de la línea tal cual (serie, cuadros, foto)', () => {
    // el más viejo (A1) es el que se renumera: va detrás del más nuevo
    const libro = [aporta(1, 'a', idea('C1-I01', 'a', ' · serie: S2 · cuadros: 3 · foto:abc12345')), aporta(2, 'b', idea('C1-I01', 'b')), integra('x')]
    const out = ideasDeLosAportes(libro, 'x')
    expect(out).toEqual([idea('C1-I01', 'b'), idea('C1-I02', 'a', ' · serie: S2 · cuadros: 3 · foto:abc12345')])
    const i = leerConcepto(`## Gran idea\nX · y\n${out.join('\n')}`, INSUMOS).banco.find((x) => x.id === 'C1-I02')!
    expect([i.serie, i.cuadros, i.foto]).toEqual(['S2', 3, 'abc12345'])
  })

  it('con números de tres cifras, el nuevo sigue el mayor', () => {
    const libro = [aporta(1, 'a', idea('C3-I120', 'a')), aporta(2, 'b', idea('C3-I120', 'b')), integra('x')]
    expect(ids(ideasDeLosAportes(libro, 'x'))).toEqual(['C3-I120', 'C3-I121'])
  })

  it('🔴 una línea de la integración SIN mensaje (la dirección cita «- C1-I01 · usé A1») no ocupa el id: la idea del aporte lo conserva', () => {
    const integ = '## Gran idea\nX · y\n## Banco\n- C1-I01 · instagram · usé A1 entera'
    const libro = [aporta(1, 'a', idea('C1-I01', 'la de verdad')), integra(integ)]
    expect(ideasDeLosAportes(libro, integ)).toEqual([idea('C1-I01', 'la de verdad')])
    const c = leerConcepto(`${integ}\n${ideasDeLosAportes(libro, integ).join('\n')}`, INSUMOS)
    expect(c.banco.map((i) => [i.id, i.idea])).toEqual([['C1-I01', 'la de verdad']])
  })

  it('🔴 una línea de aporte SIN mensaje tampoco ocupa el id ni se renumera (sale igual, «sin mensaje»)', () => {
    const libro = [aporta(1, 'a', '- C1-I01 · instagram · post · borrador sin mensaje'), aporta(2, 'b', idea('C1-I01', 'completa')), integra('x')]
    const out = ideasDeLosAportes(libro, 'x')
    expect(ids(out)).toEqual(['C1-I01', 'C1-I01'])
    expect(out[0]).toContain('completa')
  })

  it('🔴 un id que la dirección puso en «Ideas que salen» no se renumera: el choque sale como antes', () => {
    const integ = '## Gran idea\nX · y\n## Ideas que salen\n- C1-I02: repetida'
    const libro = [aporta(1, 'a', idea('C1-I02', 'a')), aporta(2, 'b', idea('C1-I02', 'b')), integra(integ)]
    expect(ids(ideasDeLosAportes(libro, integ))).toEqual(['C1-I02', 'C1-I02'])
    const c = leerConcepto(`${integ}\n${ideasDeLosAportes(libro, integ).join('\n')}`, INSUMOS)
    expect(c.banco).toEqual([])
  })

  it('un id de otra sección de la integración (no «Ideas que salen») sí se renumera al chocar', () => {
    const integ = '## Gran idea\nX · y\n## Citas\nA1 usé C1-I02'
    const libro = [aporta(1, 'a', idea('C1-I02', 'a')), aporta(2, 'b', idea('C1-I02', 'b')), integra(integ)]
    expect(ids(ideasDeLosAportes(libro, integ))).toEqual(['C1-I02', 'C1-I03'])
  })

  it('sin choques, nada cambia', () => {
    const libro = [aporta(1, 'a', idea('C1-I01', 'a')), aporta(2, 'b', idea('C1-I02', 'b')), integra('x')]
    expect(ideasDeLosAportes(libro, 'x')).toEqual([idea('C1-I02', 'b'), idea('C1-I01', 'a')])
  })
})

/** lo que juntaba la cadena antes del 18-nov (mismo orden, sin renumerar): solo para comparar en la prueba real */
function ideasDeLosAportesSinRenumerar(libro: Ap[], integracion: string): string[] {
  const dir = [...libro].reverse().find((a) => a.tipo === 'integra')?.de ?? null
  const aportes = libro.filter((a) => (a.tipo === 'aporta' || a.tipo === 'responde') && a.de !== dir && a.texto.trim())
  const citados: number[] = []
  for (const m of integracion.matchAll(/\bA(\d{1,4})\b/g)) { const n = Number(m[1]); if (!citados.includes(n)) citados.push(n) }
  const orden = [...citados.map((n) => aportes.find((a) => a.n === n)).filter((a): a is Ap => !!a), ...[...aportes].reverse().filter((a) => !citados.includes(a.n))]
  return orden.flatMap((a) => a.texto.split('\n').filter((l) => /^\s*(?:[-*•]|\d+[.)])\s+[`*]*C[A-Za-z0-9_]+-I\d{2,}[`*]*\s*·/.test(l)).map((l) => {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+[`*]*(C[A-Za-z0-9_]+-I\d{2,})[`*]*\s*·\s*(.*)$/.exec(l)!
    return `- ${m[1]} · ${m[2].replace(/[`*]+\s*$/, '').trim()}`
  }))
}
