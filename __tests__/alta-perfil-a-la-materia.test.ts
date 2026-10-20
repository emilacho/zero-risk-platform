/**
 * EL PERFIL DE LA RED LLEGA AL MANUAL ANTES DE ESCRIBIRLO (CC#1 · 20-oct · señal de Lenovo 15:30, punto 4). US$ 0.
 * En la prueba real el perfil de Instagram se leyó a las 10:05, un minuto DESPUÉS de escribirse el manual (10:04). Con la entrada del cliente (#659) el perfil se lee ANTES del descubridor;
 * aquí se comprueba que ese texto entra a la MATERIA que recibe el manual (`discovery_package.materia_cliente`). Se EJECUTA el texto real de «[JEFATURA] Transform discovery→package».
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/LyVoKcrypS5uLyuu')
const M = await import(pathToFileURL(path.join(D, 'construir-perfil-a-la-materia-2026-10-20.mjs')).href)
type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const leer = (f: string, dir = D) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Flujo
const antes = leer('LyVoKcrypS5uLyuu-ANTES-manual-con-lo-disponible-2026-10-20.json')
const nuevo = leer('LyVoKcrypS5uLyuu-ARREGLADO-perfil-a-la-materia-2026-10-20.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const T = M.N_TRANSFORM as string

type Mundo = { perfil?: Record<string, unknown> | 'no_corrio'; sitio?: Record<string, unknown>; cable?: Array<{ gate: Record<string, unknown>; llamada: Record<string, unknown> }> }
/** corre el código real del Transform con el mundo simulado; lo que no se declara, no corrió ($() lanza, como en n8n) */
function correr(codigo: string, m: Mundo) {
  const deal = { client_id: 'c-1', client_name: 'Cliente X', industry: 'rubro', country: 'EC', location: 'Guayaquil, EC', dry_run: false }
  const dado: Record<string, unknown> = {
    'Validate Deal Data': deal,
    '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)': { discovery_package: { discovery_summary: 'resumen', competitors: [] } },
    'El texto del sitio, o el hueco': m.sitio ?? { sitio_estado: 'sin_dato', sitio_texto: '', sitio_caracteres: 0 },
    ...(m.perfil && m.perfil !== 'no_corrio' ? { 'El perfil de la red, o el hueco': m.perfil } : {}),
  }
  const $ = (n: string) => {
    if (n === '[APIFY-WIRE] Gate · drop skip-markers (lazo)') return { first: () => ({ json: {} }), all: () => (m.cable ?? []).map((c) => ({ json: c.gate })) }
    if (n === '[APIFY-WIRE] Call Apify Service Workflow (onboarding_e2e)') return { first: () => ({ json: {} }), all: () => (m.cable ?? []).map((c) => ({ json: c.llamada })) }
    if (!(n in dado)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: dado[n] }), all: () => [{ json: dado[n] }] }
  }
  const [{ json }] = new Function('$input', '$', '$env', '$workflow', '$execution', codigo)({ first: () => ({ json: {} }), all: () => [{ json: {} }] }, $, {}, { id: 'WF' }, { id: 'EX' }) as Array<{ json: Record<string, any> }>
  return json.discovery_package.materia_cliente as Record<string, any>
}
const codigo = nodo(nuevo, T).parameters.jsCode as string
const codigoAntes = nodo(antes, T).parameters.jsCode as string
const PERFIL = { perfil_estado: 'trajo', perfil_usuario: 'cuenta_x', perfil_motivo: '', perfil_texto: 'Perfil de Instagram · Biografía: Seguridad Industrial · Venta/recarga extintores · Señalética\nSeguidores: 800\nPublicaciones recientes: 12' }

describe('el perfil de la red entra a la materia que recibe el manual', () => {
  it('🔴 el caso de la prueba real: el Instagram propio NO llegó por el cable de la materia, pero el perfil YA se había leído ⇒ entra, y dice de dónde salió', () => {
    const m = correr(codigo, { perfil: PERFIL })
    expect(m.instagram_estado).toBe('trajo'); expect(m.instagram_propio).toContain('Venta/recarga extintores'); expect(m.instagram_fuente).toBe('perfil_leido_antes_del_descubridor')
    // y ANTES del arreglo esa misma situación dejaba al manual sin Instagram propio
    expect(correr(codigoAntes, { perfil: PERFIL }).instagram_estado).toBe('no_pedido')
  })
  it('si el cable de la materia SÍ trajo el Instagram propio, manda ese (no se pisa) y no se declara el perfil previo', () => {
    const m = correr(codigo, { perfil: PERFIL, cable: [{ gate: { target_kind: 'own', apify_function: 'instagram_scraper' }, llamada: { ok: true, datos: 'texto del cable ' + 'x'.repeat(200) } }] })
    expect(m.instagram_estado).toBe('trajo'); expect(m.instagram_propio).toContain('texto del cable'); expect(m.instagram_fuente).toBeUndefined()
  })
  it('un cliente DESDE CERO (sin perfil leído) queda como siempre: sin Instagram propio y sin inventar nada', () => {
    for (const perfil of [{ perfil_estado: 'sin_dato', perfil_usuario: '', perfil_texto: '', perfil_motivo: 'el trato no trajo una cuenta de Instagram' }, { perfil_estado: 'sin_respuesta', perfil_usuario: 'x', perfil_texto: '' }, 'no_corrio'] as const) {
      const m = correr(codigo, { perfil }); expect(m.instagram_estado).toBe('no_pedido'); expect(m.instagram_propio).toBe(''); expect(m.instagram_fuente).toBeUndefined()
    }
  })
  it('un perfil con la pared de login NO llega como texto propio (el nodo del perfil ya lo dejó en sin_dato)', () => {
    const m = correr(codigo, { perfil: { perfil_estado: 'sin_dato', perfil_usuario: 'x', perfil_texto: '', perfil_motivo: 'lo que volvió es un muro de inicio de sesión' } })
    expect(m.instagram_propio).toBe(''); expect(m.instagram_estado).toBe('no_pedido')
  })
  it('el perfil largo se recorta DECLARÁNDOLO (nunca un corte mudo)', () => {
    const m = correr(codigo, { perfil: { ...PERFIL, perfil_texto: 'perfil '.repeat(2000) } })
    expect(m.instagram_propio.length).toBeLessThan(8200); expect(m.instagram_propio).toMatch(/recortado: se leyeron 8000 de 14000 caracteres/)
  })
  it('lo demás de la materia no cambia (idioma, sitio)', () => {
    const base = correr(codigoAntes, {}), hoy = correr(codigo, {})
    expect(hoy).toEqual(base)
    expect(correr(codigo, { perfil: PERFIL, sitio: { sitio_estado: 'trajo', sitio_texto: 'texto del sitio', sitio_caracteres: 15 } })).toMatchObject({ sitio_estado: 'trajo', sitio_texto: expect.stringContaining('texto del sitio') })
  })
})

describe('la forma del cambio', () => {
  it('cambia UN nodo; nodos y cables iguales', () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    expect(nuevo.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n) => n.name)).toEqual([T])
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(antes.connections))
  })
  it('🔴 LINAJE: el ANTES es el alta con la entrada del cliente ya aplicada (#659: lleva el nodo del perfil); el constructor reproduce el ARREGLADO y no se construye dos veces', () => {
    expect(nodo(antes, 'El perfil de la red, o el hueco')).toBeTruthy()
    expect(nodo(antes, 'Validate Deal Data').parameters.jsCode as string).toContain('entNormalizar')
    expect(codigoAntes).not.toContain('perfil_leido_antes_del_descubridor')
    expect(JSON.stringify(M.construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => M.construirFlujo(nuevo)).toThrow(/ya trae el perfil/)
  })
  it('conserva los saltos de línea y no lleva llaves ni nombres de clientes', () => {
    const CRLF = String.fromCharCode(13, 10)
    expect(codigo.includes(CRLF)).toBe(codigoAntes.includes(CRLF))
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
  })
})
