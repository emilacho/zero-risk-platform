/**
 * Paso 4 · prueba PERMANENTE de aislamiento: un cliente no ve lo de otro.
 *
 * Tres capas:
 *   1. el adaptador de lectura real solo hace GET y se NIEGA a leer sin filtro;
 *   2. revisión automática del repositorio: todo archivo que lee `client_brain_chunks` menciona el cliente,
 *      salvo la lista de lecturas GLOBALES permitidas (B7 de CC#3: `api/health` y `brain/reindex-stale`);
 *   3. (el comportamiento de la lista corta con filas de otros clientes está en lista-corta.test.ts)
 * Casos escritos antes del código.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { crearConsultaRest } from '../consulta'

const RAIZ = path.resolve(__dirname, '../../../..')

describe('el adaptador de lectura real', () => {
  const respuesta = (cuerpo: unknown, ok = true, status = 200) => ({ ok, status, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo }) as unknown as Response

  it('solo hace GET, nunca otro verbo, y arma el filtro del cliente en la dirección', async () => {
    const vistos: Array<{ url: string; init?: RequestInit }> = []
    const consulta = crearConsultaRest({ url: 'https://x.supabase.co', llave: 'llave', fetchImpl: async (url, init) => { vistos.push({ url: String(url), init }); return respuesta([{ id: '1' }]) } })
    const r = await consulta({ tabla: 'client_web_pages', columnas: ['id', 'url'], donde: { client_id: 'abc' }, orden: { columna: 'crawled_at', descendente: true }, limite: 5 })
    expect(r).toEqual({ filas: [{ id: '1' }], error: null })
    expect(vistos).toHaveLength(1)
    expect(vistos[0].init?.method ?? 'GET').toBe('GET')
    expect(vistos[0].init?.body).toBeUndefined()
    expect(vistos[0].url).toBe('https://x.supabase.co/rest/v1/client_web_pages?select=id,url&client_id=eq.abc&order=crawled_at.desc&limit=5')
  })
  it('se niega a leer sin ningún filtro (y no llega a la red)', async () => {
    let llamadas = 0
    const consulta = crearConsultaRest({ url: 'https://x.supabase.co', llave: 'k', fetchImpl: async () => { llamadas++; return respuesta([]) } })
    const r = await consulta({ tabla: 'client_web_pages', donde: {} })
    expect(r.error).toMatch(/sin filtro/)
    expect(llamadas).toBe(0)
  })
  it('un fallo de red o un estado de error vuelve como error, jamás como lista vacía', async () => {
    const roto = crearConsultaRest({ url: 'https://x.supabase.co', llave: 'k', fetchImpl: async () => { throw new Error('sin red') } })
    expect(await roto({ tabla: 't', donde: { client_id: 'a' } })).toEqual({ filas: [], error: expect.stringMatching(/sin red/) })
    const e500 = crearConsultaRest({ url: 'https://x.supabase.co', llave: 'k', fetchImpl: async () => respuesta({ message: 'boom' }, false, 500) })
    const r = await e500({ tabla: 't', donde: { client_id: 'a' } })
    expect(r.filas).toEqual([])
    expect(r.error).toMatch(/500/)
  })
  it('los valores del filtro se codifican (no se puede colar otro filtro)', async () => {
    let url = ''
    const consulta = crearConsultaRest({ url: 'https://x.supabase.co', llave: 'k', fetchImpl: async (u) => { url = String(u); return respuesta([]) } })
    await consulta({ tabla: 't', donde: { client_id: 'a&client_id=neq.a' } })
    expect(url).toBe('https://x.supabase.co/rest/v1/t?select=*&client_id=eq.a%26client_id%3Dneq.a')
  })
})

describe('revisión automática del repositorio', () => {
  /** Lecturas GLOBALES permitidas: no filtran por cliente a propósito (B7 de CC#3). */
  const LECTURAS_GLOBALES = new Set(['src/app/api/health/route.ts', 'src/app/api/brain/reindex-stale/route.ts'])

  const archivos = (): string[] => {
    const salida = execSync("git grep --untracked -l -E \"from\\(\\s*['\\\"]client_brain_chunks['\\\"]\\s*\\)\" -- src services", { cwd: RAIZ, encoding: 'utf8' })
    return salida.split(/\r?\n/).filter((f) => f && !/\.test\.[tj]sx?$/.test(f) && !f.includes('/__tests__/'))
  }

  it('todo archivo que lee los trozos del cerebro menciona al cliente, salvo las lecturas globales declaradas', () => {
    const sinCliente = archivos().filter((f) => !LECTURAS_GLOBALES.has(f) && !/client_id|clientId|p_client_id/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')))
    expect(sinCliente, `leen los trozos sin mencionar al cliente: ${sinCliente.join(', ')}`).toEqual([])
  })
  it('la lista de lecturas globales no tiene entradas muertas (si un archivo ya no lee los trozos, se quita de la lista)', () => {
    const hoy = new Set(archivos())
    for (const g of LECTURAS_GLOBALES) expect(hoy.has(g), `${g} ya no lee client_brain_chunks: quítalo de la lista`).toBe(true)
  })
})
