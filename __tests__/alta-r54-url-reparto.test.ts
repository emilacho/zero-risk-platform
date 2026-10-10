/**
 * Relevo 54 · D-3: el alta acepta `url_reparto` (opcional). Cambia UN nodo respecto del alta arreglada del relevo 51; sin n8n, sin llamadas reales.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

type Nodo = { name: string; parameters: Record<string, unknown> & { jsonBody?: string } }
type Flujo = { nodes: Nodo[]; connections: unknown; active?: boolean }
const leer = (f: string): Flujo => JSON.parse(fs.readFileSync(f, 'utf8'))
const R51 = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r51.json')
const R54 = leer('scripts/worker-staging/LyVoKcrypS5uLyuu/alta-ARREGLADA-2026-10-10-r54.json')
const nodo = (w: Flujo, n: string) => w.nodes.find((x) => x.name === n)!
const PERSIST = 'Persist Client to Supabase'

describe('alta r54 · solo cambia el cuerpo de «Persist Client to Supabase»', () => {
  it('un solo nodo distinto, ninguno nuevo ni quitado, mismas conexiones, sigue apagada', () => {
    const cambian = R51.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(R54, n.name))).map((n) => n.name)
    expect(cambian).toEqual([PERSIST])
    expect(R54.nodes.map((n) => n.name)).toEqual(R51.nodes.map((n) => n.name))
    expect(JSON.stringify(R54.connections)).toBe(JSON.stringify(R51.connections))
    expect(R54.active).toBe(false)
  })
  it('lo demás del cuerpo del nodo queda igual (solo se agrega el campo)', () => {
    const a = nodo(R51, PERSIST).parameters.jsonBody!, b = nodo(R54, PERSIST).parameters.jsonBody!
    expect(b.replace(/,\n  url_reparto:[^\n]*\n\}/, '\n}')).toBe(a)
    expect({ ...nodo(R51, PERSIST).parameters, jsonBody: 0 }).toEqual({ ...nodo(R54, PERSIST).parameters, jsonBody: 0 })
  })
})

/** evalúa la expresión `={{ … }}` del cuerpo con el trato dado (un `$()` falso) y devuelve el JSON que se mandaría */
function cuerpoPara(trato: Record<string, unknown>): Record<string, unknown> {
  const expr = nodo(R54, PERSIST).parameters.jsonBody!.replace(/^=\{\{/, '').replace(/\}\}$/, '')
  const $ = () => ({ first: () => ({ json: trato }) })
  const salida = new Function('$', '$workflow', '$execution', `return (${expr.trim()})`)($, { id: 'wf' }, { id: 'ex' }) as string
  return JSON.parse(salida)
}

describe('el cuerpo que el alta manda a /api/clients/upsert', () => {
  const base = { client_id: 'c-1', client_name: 'Clinica Ejemplo', website: 'https://www.clinicaejemplo.test', industry: 'salud', _defaults_aplicados: [] }
  it('sin el campo en el trato: la clave NO viaja (la ruta no cambia nada)', () => {
    expect(cuerpoPara(base)).not.toHaveProperty('url_reparto')
    expect(cuerpoPara({ ...base, url_reparto: '' })).not.toHaveProperty('url_reparto')
  })
  it('con el campo (lista o texto): viaja tal cual y la ruta lo valida', () => {
    expect(cuerpoPara({ ...base, url_reparto: ['https://app.example.com/t/1'] }).url_reparto).toEqual(['https://app.example.com/t/1'])
    expect(cuerpoPara({ ...base, url_reparto: 'https://a.example.com/1, https://b.example.com/2' }).url_reparto).toBe('https://a.example.com/1, https://b.example.com/2')
  })
  it('el resto del cuerpo es idéntico con o sin el campo', () => {
    const { url_reparto: _u, ...con } = cuerpoPara({ ...base, url_reparto: ['https://app.example.com/t/1'] })
    void _u
    expect(con).toEqual(cuerpoPara(base))
    expect(con.client_id).toBe('c-1'); expect(con.name).toBe('Clinica Ejemplo')
  })
})
