/**
 * OFICINA FINANCIERA · F0 · las identidades (CC#1 · 14-oct · rev. 9): el texto del repo canónico TAL CUAL (huella fija), nada a mano, solo inserta, siempre inactivas,
 * nunca duplica lo ya instalado ni toca a `finance-financial-analyst`. El guion nace en seco y su CONFIRMACIÓN tiene prueba de comportamiento: se ejerce `ejecutar` entero con una base
 * simulada (sin `--aplicar` no escribe; con `--aplicar` exige una fecha REAL, no futura y no anterior a la construcción).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ejecutar, FILA_DE_REFERENCIA, huella, IDENTIDADES, INTOCABLES, leerFechaConfirmada, leerIdentidad, nombreDelFrente, planDeInstalacion, PRIMER_DIA } from '../scripts/ops/instalar-identidades-finanzas.mjs'

const textos = Object.fromEntries(IDENTIDADES.map((i) => [i.nombre, leerIdentidad(i.nombre)]))
const REF = { name: FILA_DE_REFERENCIA, role: 'empleado', department_id: 'dep-1', phase: null }
const HOY = new Date('2026-10-15T12:00:00Z')

function mundo(existentes: string[] = [FILA_DE_REFERENCIA], opts: { postFalla?: boolean } = {}) {
  const llamadas: Array<{ metodo: string; url: string; cuerpo?: any }> = []
  const log: string[] = []
  const f = async (url: string, init?: { method?: string; body?: string }) => {
    llamadas.push({ metodo: init?.method ?? 'GET', url, cuerpo: init?.body ? JSON.parse(init.body) : undefined })
    if ((init?.method ?? 'GET') === 'GET') return { ok: true, status: 200, json: async () => existentes.map((n) => (n === FILA_DE_REFERENCIA ? REF : { name: n })) }
    return { ok: !opts.postFalla, status: opts.postFalla ? 500 : 201, json: async () => ({}) }
  }
  const d = { fetch: f, ahora: () => HOY, base: { url: 'https://base.invalid', llave: 'llave-de-prueba' }, leer: (n: string) => textos[n], log: (...a: string[]) => log.push(a.join(' ')) }
  return { d, llamadas, log, posts: () => llamadas.filter((l) => l.metodo === 'POST') }
}

describe('F0 · identidades de la oficina financiera', () => {
  it('son exactamente dos y sus textos coinciden con la huella del repo canónico (nadie las editó)', () => {
    expect(IDENTIDADES.map((i) => i.nombre)).toEqual(['finance-fpa-analyst', 'chief-financial-officer'])
    for (const i of IDENTIDADES) expect(huella(textos[i.nombre]), i.nombre).toBe(i.sha256)
  })
  it('el frente del archivo trae su nombre y el archivo vive donde la sincronización oficial lo busca', () => {
    expect(nombreDelFrente(textos['finance-fpa-analyst'])).toBe('FP&A Analyst')
    expect(nombreDelFrente(textos['chief-financial-officer'])).toBe('Chief Financial Officer')
    for (const i of IDENTIDADES) expect(fs.existsSync(path.join(__dirname, '..', 'src', 'agents', 'identities', i.nombre + '.md'))).toBe(true)
  })
  it('seco por omisión: inserta solo las que FALTAN, inactivas, sin tocar nada existente', () => {
    const p = planDeInstalacion({ existentes: [FILA_DE_REFERENCIA, 'paid_media_ppc_strategist', 'tracking-specialist'], referencia: REF, textos })
    expect(p.errores).toEqual([])
    expect(p.inserciones.map((x: any) => x.name)).toEqual(['finance-fpa-analyst', 'chief-financial-officer'])
    for (const x of p.inserciones) expect(x).toMatchObject({ status: 'inactive', is_active: false, role: 'empleado', department_id: 'dep-1', model: 'claude-sonnet' })
  })
  it('R2 · identity_source sigue la convención de las filas ya instaladas: canonical:msitarzewski/agency-agents@main:<ruta> · …', () => {
    const p = planDeInstalacion({ existentes: [], referencia: REF, textos })
    expect(p.inserciones.map((x: any) => x.identity_source)).toEqual([
      expect.stringMatching(/^canonical:msitarzewski\/agency-agents@main:finance\/finance-fpa-analyst\.md · /),
      expect.stringMatching(/^canonical:msitarzewski\/agency-agents@main:specialized\/chief-financial-officer\.md · /),
    ])
  })
  it('lo que ya está instalado se omite (no se actualiza ni se duplica)', () => {
    const p = planDeInstalacion({ existentes: ['finance-fpa-analyst'], referencia: REF, textos })
    expect(p.omitidas.map((o: any) => o.nombre)).toEqual(['finance-fpa-analyst'])
    expect(p.inserciones.map((x: any) => x.name)).toEqual(['chief-financial-officer'])
  })
  it('un texto editado a mano se rechaza (huella distinta) y no se instala nada de él; uno ausente o vacío, también', () => {
    const p = planDeInstalacion({ existentes: [], referencia: REF, textos: { ...textos, 'chief-financial-officer': textos['chief-financial-officer'] + '\nuna línea de más' } })
    expect(p.errores.join(' ')).toContain('huella distinta')
    expect(p.inserciones.map((x: any) => x.name)).toEqual(['finance-fpa-analyst'])
    expect(planDeInstalacion({ existentes: [], referencia: REF, textos: {} }).errores.length).toBe(2)
    expect(planDeInstalacion({ existentes: [], referencia: REF, textos: { ...textos, 'finance-fpa-analyst': '   ' } }).errores.length).toBe(1)
  })
  it('`finance-financial-analyst` es INTOCABLE (fase 2) y no figura entre lo que se instala', () => {
    expect(INTOCABLES).toContain('finance-financial-analyst')
    expect(IDENTIDADES.map((i) => i.nombre)).not.toContain('finance-financial-analyst')
  })
})

describe('R1 · la fecha de la confirmación: real, no futura, no anterior a la construcción', () => {
  it('válidas: el primer día y hoy', () => {
    expect(leerFechaConfirmada(PRIMER_DIA, HOY)).toEqual({ valor: PRIMER_DIA })
    expect(leerFechaConfirmada('2026-10-15', HOY)).toEqual({ valor: '2026-10-15' })
  })
  for (const [nombre, v] of [['imposible 9999-99-99', '9999-99-99'], ['30 de febrero', '2026-02-30'], ['mes 13', '2026-13-01'], ['sin ceros', '2026-10-1'], ['con hora', '2026-10-14T10:00'], ['texto', 'hoy'], ['vacía', ''], ['nula', null], ['futura', '2026-10-16'], ['anterior a la construcción', '2026-10-13'], ['número', 20261014]] as Array<[string, unknown]>) {
    it(`${nombre}: se rechaza con motivo`, () => { expect(leerFechaConfirmada(v, HOY)).toHaveProperty('error') })
  }
})

describe('R1 · el guion entero (con una base simulada): la confirmación se EJERCE, no se lee', () => {
  it('sin --aplicar: dice qué haría y NO hace ni un POST (aunque pasen una fecha)', async () => {
    for (const argv of [[], ['--confirmo-cc3', '2026-10-15']]) {
      const m = mundo()
      expect(await ejecutar(argv, m.d)).toBe(0)
      expect(m.posts()).toEqual([])
      expect(m.log.join(' ')).toContain('seco: no se escribió nada')
    }
  })
  for (const [nombre, argv] of [
    ['--aplicar sin --confirmo-cc3', ['--aplicar']],
    ['con fecha imposible', ['--aplicar', '--confirmo-cc3', '9999-99-99']],
    ['con fecha futura', ['--aplicar', '--confirmo-cc3', '2026-12-31']],
    ['con fecha anterior a la construcción', ['--aplicar', '--confirmo-cc3', '2026-01-01']],
    ['con --confirmo-cc3 sin valor al final', ['--aplicar', '--confirmo-cc3']],
  ] as Array<[string, string[]]>) {
    it(`${nombre}: se detiene con código 3, no lee la base y no escribe`, async () => {
      const m = mundo()
      expect(await ejecutar(argv, m.d)).toBe(3)
      expect(m.llamadas).toEqual([])
    })
  }
  it('con --aplicar y una fecha real: inserta SOLO las faltantes, inactivas, con POST (nunca PATCH, PUT ni DELETE)', async () => {
    const m = mundo([FILA_DE_REFERENCIA, 'finance-fpa-analyst'])
    expect(await ejecutar(['--aplicar', '--confirmo-cc3', '2026-10-15'], m.d)).toBe(0)
    expect(m.posts()).toHaveLength(1)
    expect(m.posts()[0].cuerpo).toMatchObject({ name: 'chief-financial-officer', is_active: false, status: 'inactive' })
    expect(m.llamadas.every((l) => l.metodo === 'GET' || l.metodo === 'POST')).toBe(true)
  })
  it('si la inserción falla, para (código 6) y no sigue', async () => {
    const m = mundo([FILA_DE_REFERENCIA], { postFalla: true })
    expect(await ejecutar(['--aplicar', '--confirmo-cc3', '2026-10-15'], m.d)).toBe(6)
    expect(m.posts()).toHaveLength(1)
  })
  it('si ya están las dos, no hay nada que insertar; sin variables de la base, código 2', async () => {
    const m = mundo([FILA_DE_REFERENCIA, 'finance-fpa-analyst', 'chief-financial-officer'])
    expect(await ejecutar(['--aplicar', '--confirmo-cc3', '2026-10-15'], m.d)).toBe(0)
    expect(m.posts()).toEqual([])
    expect(await ejecutar([], { ...mundo().d, base: { url: '', llave: '' } })).toBe(2)
  })
  it('un texto con huella distinta detiene todo (código 5) antes de escribir', async () => {
    const m = mundo()
    const d = { ...m.d, leer: (n: string) => (n === 'chief-financial-officer' ? textos[n] + ' x' : textos[n]) }
    expect(await ejecutar(['--aplicar', '--confirmo-cc3', '2026-10-15'], d)).toBe(5)
    expect(m.posts()).toEqual([])
  })
  it('la llave no se imprime y el guion dice que NO es la vía oficial', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ops', 'instalar-identidades-finanzas.mjs'), 'utf8')
    expect(src).toContain('ESTE GUION ES NUEVO: NO es «la vía oficial»')
    expect(src).not.toMatch(/log\([^)]*llave/)
    expect(src).not.toMatch(/method:\s*'(PATCH|PUT|DELETE)'/)
    expect(src).not.toContain('merge-duplicates')
  })
})

describe('nota de CC#3 · «la fecha existe en el calendario» con un reloj de diciembre', () => {
  // en JavaScript `2026-11-31` se corre a `2026-12-01`: con el reloj en octubre lo rechaza «es futura», pero desde diciembre pasaría las otras dos reglas si faltara esta
  const DICIEMBRE = new Date('2026-12-15T12:00:00Z')
  it('2026-11-31 y 2026-12-32 NO existen: se rechazan por el calendario, no por «futura» ni por «anterior»', () => {
    for (const f of ['2026-11-31', '2026-12-32']) {
      const r = leerFechaConfirmada(f, DICIEMBRE) as { error?: string }
      expect(r.error, f).toContain('no existe en el calendario')
    }
  })
  it('una fecha real de noviembre sí pasa con el reloj de diciembre', () => {
    expect(leerFechaConfirmada('2026-11-30', DICIEMBRE)).toEqual({ valor: '2026-11-30' })
  })
})
