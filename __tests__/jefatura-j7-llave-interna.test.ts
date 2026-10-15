/**
 * J7 pieza · la llave del flujo de prueba (CC#1 · 15-oct · firma de Emilio «si a todo»): el nodo «⓪ Entrada · llave» acepta TAMBIÉN `x-api-key` = INTERNAL_API_KEY (por $env),
 * sin quitar la de despacho. Código REAL del nodo; sin red. «401» = el nodo lanza y la ejecución muere ANTES de abrir nada (el webhook responde «recibido» y el flujo falla).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
const DIR = path.join(__dirname, '..', 'scripts', 'worker-staging', 'jefatura-j7')
const leer = (n: string) => JSON.parse(fs.readFileSync(path.join(DIR, n), 'utf8'))
const codigoDe = (f: any) => String(f.nodes.find((n: any) => n.name === '⓪ Entrada · llave').parameters.jsCode)
const ANTES = leer('ANTES-EVMrQ4Tqw98L1L0D-2026-10-15.json')
const ARREGLADO = leer('ARREGLADO-EVMrQ4Tqw98L1L0D-llave-interna-2026-10-15.json')

const DESPACHO = 'despacho-de-prueba-0123456789'
const INTERNA = 'interna-de-prueba-9876543210'
const CUERPO = { dry_run: true, client_id: 'cliente-prueba', texto: 'Pie de foto de prueba', artifact_id: 'pieza:1' }
const correr = async (codigo: string, headers: Record<string, string | undefined>, env: Record<string, string | undefined>, body: Record<string, unknown> = CUERPO) => {
  const f = new AsyncFunction('$input', '$env', codigo)
  return f({ first: () => ({ json: { headers, body } }) }, env)
}
const nuevo = codigoDe(ARREGLADO)
const ENV = { SALA_DISPATCH_KEY: DESPACHO, INTERNAL_API_KEY: INTERNA }

describe('estructura: SOLO cambia el código del nodo «⓪ Entrada · llave»', () => {
  it('los demás nodos, los enlaces y los ajustes son idénticos al flujo vivo respaldado', () => {
    expect(ARREGLADO.nodes.length).toBe(ANTES.nodes.length)
    const a = new Map(ANTES.nodes.map((n: any) => [n.name, JSON.stringify(n)]))
    const cambiados = ARREGLADO.nodes.filter((n: any) => a.get(n.name) !== JSON.stringify(n)).map((n: any) => n.name)
    expect(cambiados).toEqual(['⓪ Entrada · llave'])
    expect(JSON.stringify(ARREGLADO.connections)).toBe(JSON.stringify(ANTES.connections))
    expect(ARREGLADO.active).toBe(false)
  })
  it('lee las dos llaves por $env, sin pegar ningún valor, y conserva la de despacho', () => {
    expect(nuevo).toContain('$env.SALA_DISPATCH_KEY')
    expect(nuevo).toContain('$env.INTERNAL_API_KEY')
    expect(nuevo).toContain("headers['x-sala-dispatch-key']")
    expect(nuevo).toContain("headers['x-api-key']")
    expect(JSON.stringify(ARREGLADO)).not.toMatch(/[0-9a-f]{64}|eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|xox[a-z]-/)
  })
})

describe('la llave', () => {
  it('la de despacho en su cabecera sigue pasando (como hoy)', async () => {
    const r = await correr(nuevo, { 'x-sala-dispatch-key': DESPACHO }, ENV)
    expect(r[0].json).toMatchObject({ client_id: 'cliente-prueba', artifact_id: 'pieza:1', dry_run: true })
  })
  it('la INTERNA en x-api-key pasa', async () => {
    const r = await correr(nuevo, { 'x-api-key': INTERNA }, ENV)
    expect(r[0].json.client_id).toBe('cliente-prueba')
  })
  it('sin llave, con llave falsa, de otro largo o vacía: la ejecución muere («401»)', async () => {
    for (const h of [{}, { 'x-api-key': 'falsa' }, { 'x-api-key': INTERNA + 'x' }, { 'x-api-key': '' }, { 'x-sala-dispatch-key': 'falsa' }, { 'x-api-key': INTERNA.slice(0, -1) }]) {
      await expect(correr(nuevo, h, ENV), JSON.stringify(h)).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    }
  })
  it('cada llave solo vale en SU cabecera (no se sustituyen)', async () => {
    await expect(correr(nuevo, { 'x-api-key': DESPACHO }, ENV)).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    await expect(correr(nuevo, { 'x-sala-dispatch-key': INTERNA }, ENV)).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
  })
  it('falla CERRADO: sin ninguna llave en el entorno, o con una vacía, nada pasa (ni «vacío = vacío»)', async () => {
    await expect(correr(nuevo, { 'x-api-key': '' }, {})).rejects.toThrow(/CERRADA/)
    await expect(correr(nuevo, { 'x-api-key': '', 'x-sala-dispatch-key': '' }, { SALA_DISPATCH_KEY: '', INTERNAL_API_KEY: '  ' })).rejects.toThrow(/CERRADA/)
    // solo existe la de despacho: la interna ausente no abre con cabecera vacía
    await expect(correr(nuevo, { 'x-api-key': '' }, { SALA_DISPATCH_KEY: DESPACHO })).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    // solo existe la interna: la de despacho se mantiene cerrada con cabecera vacía
    await expect(correr(nuevo, { 'x-sala-dispatch-key': '' }, { INTERNAL_API_KEY: INTERNA })).rejects.toThrow(/PROCEDENCIA_INVALIDA/)
    const ok = await correr(nuevo, { 'x-api-key': INTERNA }, { INTERNAL_API_KEY: INTERNA })
    expect(ok).toHaveLength(1)
  })
  it('lo demás del nodo sigue igual: dry_run booleano, cliente, texto y artefacto (la llave pasa y aun así se detiene)', async () => {
    const h = { 'x-api-key': INTERNA }
    await expect(correr(nuevo, h, ENV, { ...CUERPO, dry_run: undefined })).rejects.toThrow(/SIN_DRY_RUN/)
    await expect(correr(nuevo, h, ENV, { ...CUERPO, dry_run: 'true' })).rejects.toThrow(/SIN_DRY_RUN/)
    await expect(correr(nuevo, h, ENV, { ...CUERPO, client_id: 'x' })).rejects.toThrow(/CLIENTE_INVALIDO/)
    await expect(correr(nuevo, h, ENV, { ...CUERPO, texto: '  ' })).rejects.toThrow(/SIN_TEXTO/)
    await expect(correr(nuevo, h, ENV, { ...CUERPO, artifact_id: '??' })).rejects.toThrow(/ARTEFACTO_INVALIDO/)
  })
  it('con la llave de despacho la salida es IDÉNTICA a la del código de ayer (igualdad con el vivo respaldado)', async () => {
    const cuerpos = [CUERPO, { ...CUERPO, dry_run: false, familia: 'carrusel', imagenes: ['https://x.invalid/a.png', 7], tope_restante_usd: 0.5 }, { ...CUERPO, simulacion: { fichas: 'sugerencia' } }]
    for (const c of cuerpos) {
      const antes = await correr(codigoDe(ANTES), { 'x-sala-dispatch-key': DESPACHO }, { SALA_DISPATCH_KEY: DESPACHO }, c)
      const ahora = await correr(nuevo, { 'x-sala-dispatch-key': DESPACHO }, ENV, c)
      expect(JSON.stringify(ahora)).toBe(JSON.stringify(antes))
    }
  })
  it('mutación: si el nodo comparara con «==» corto o aceptara cualquier x-api-key, estas pruebas lo matan', async () => {
    const flojo = nuevo.replace("const okInterna = igual(headers['x-api-key'], interna)", "const okInterna = !!headers['x-api-key']")
    expect(flojo).not.toBe(nuevo)
    await expect(correr(flojo, { 'x-api-key': 'falsa' }, ENV)).resolves.toBeTruthy() // el mutante pasa con una llave falsa…
    await expect(correr(nuevo, { 'x-api-key': 'falsa' }, ENV)).rejects.toThrow() // …el real, no
  })
})
