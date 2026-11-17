/**
 * 🟡 de CC6 a #1144 · el motor del alta del lector, con un n8n SIMULADO (sin red).
 * (a) publicado ≠ respaldo ⇒ ninguna escritura · (b) borrador ajeno ⇒ ninguna escritura · (c) sub-flujo previo distinto o dos ⇒ ninguna escritura
 * (d) el sub-flujo se publica ANTES del PUT de la puerta · (e) publicado ≠ parche tras el PUT ⇒ falla Y restaura la puerta al respaldo.
 */
import { describe, expect, it } from 'vitest'
import { altaDelLector, huella } from '../../../../scripts/worker-staging/cadena/alta-del-lector-motor.mjs'
import { construirFlujos } from '../../../../scripts/worker-staging/cadena/construir.mjs'
import { construirFlujo as conLector } from '../../../../scripts/worker-staging/cadena/construir-s4-fichas-puerta.mjs'
import fs from 'node:fs'
import path from 'node:path'

type Nodo = { name: string; type: string; parameters: unknown; onError?: string }
type Flujo = { id?: string; name: string; nodes: Nodo[]; connections: unknown; settings?: unknown; active?: boolean; isArchived?: boolean; versionId?: string; activeVersionId?: string; activeVersion?: { nodes: Nodo[]; connections: unknown } }
const ANTES: Flujo = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../../scripts/worker-staging/cadena/puerta-s4-fichas-ANTES.json'), 'utf8'))
const SUB: Flujo = construirFlujos()['cadena-fichas']
const ID_PUERTA = 'pBAp5Cx7R39U585i'
const copia = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

/** un n8n de juguete con lo que hace el de verdad: PUT guarda el BORRADOR; si la puerta está activa, publica… salvo que llame a un sub-flujo sin publicar (400) */
function n8n(o: { previos?: Flujo[]; borrador?: Flujo; publicado?: Flujo; romper?: (m: string, p: string, veces: number) => boolean; publicaMal?: boolean; putNoPublica?: boolean; activarNoActiva?: boolean; porPagina?: number } = {}) {
  const flujos = new Map<string, Flujo>()
  let v = 0
  const conVersion = (id: string, borrador: Flujo, publicado: Flujo): Flujo => ({ ...copia(borrador), id, active: true, versionId: `v${++v}`, activeVersionId: 'p0', activeVersion: copia({ nodes: publicado.nodes, connections: publicado.connections }) })
  const puerta = conVersion(ID_PUERTA, o.borrador ?? ANTES, o.publicado ?? ANTES)
  puerta.name = 'Zero Risk — Cadena · puerta (webhook · CC#1)'
  puerta.activeVersionId = puerta.versionId
  flujos.set(ID_PUERTA, puerta)
  for (const p of o.previos ?? []) flujos.set(p.id!, copia(p))
  const llamadas: string[] = []
  const veces = new Map<string, number>()
  const llamaSinPublicar = (w: Flujo) => w.nodes.some((n) => {
    const id = (n.parameters as { workflowId?: { value?: string } })?.workflowId?.value
    // los otros sub-flujos de la cadena (fuera de este simulador) están publicados en el n8n real
    return !!id && flujos.has(id) && flujos.get(id)!.active !== true
  })
  const publicar = (w: Flujo) => {
    if (llamaSinPublicar(w)) throw Object.assign(new Error('400 Cannot publish workflow: references workflow which is not published'), { status: 400 })
    w.activeVersionId = w.versionId
    w.activeVersion = copia({ nodes: o.publicaMal ? w.nodes.slice(1) : w.nodes, connections: w.connections })
  }
  const api = async (m: string, p: string, body?: Flujo) => {
    const k = `${m} ${p.split('?')[0]}`
    veces.set(k, (veces.get(k) ?? 0) + 1)
    llamadas.push(k)
    if (o.romper?.(m, p, veces.get(k)!)) throw new Error(`${k} → 500 roto a propósito`)
    if (m === 'GET' && p.startsWith('/workflows?')) {
      // paginado como el real (hoy 132 flujos en 2 páginas de 100): cursor = índice de inicio
      const todos = [...flujos.values()].map((w) => ({ id: w.id, name: w.name, active: w.active, isArchived: !!w.isArchived }))
      const tam = o.porPagina ?? 100, desde = Number(new URLSearchParams(p.split('?')[1]).get('cursor') ?? 0)
      return { data: todos.slice(desde, desde + tam), nextCursor: desde + tam < todos.length ? String(desde + tam) : null }
    }
    const id = p.split('/')[2]
    if (m === 'GET') return copia(flujos.get(id)!)
    if (m === 'POST' && p === '/workflows') { const nuevo = { ...copia(body!), id: 'sub-nuevo', active: false }; flujos.set(nuevo.id, nuevo); return copia(nuevo) }
    if (m === 'POST' && p.endsWith('/activate')) { const w = flujos.get(id)!; if (id === ID_PUERTA) publicar(w); else if (!o.activarNoActiva) w.active = true; return copia(w) }
    if (m === 'PUT') { const w = flujos.get(id)!; w.nodes = copia(body!.nodes); w.connections = copia(body!.connections); w.versionId = `v${++v}`; if (w.active && !o.putNoPublica) publicar(w); return copia(w) }
    throw new Error(`no simulado: ${k}`)
  }
  const escrituras = () => llamadas.filter((l) => !l.startsWith('GET'))
  return { api, flujos, llamadas, escrituras, puerta: () => flujos.get(ID_PUERTA)! }
}
const correr = (sim: ReturnType<typeof n8n>, ejecutar = true) => altaDelLector({ api: sim.api, ANTES, sub: SUB, conLector, idPuerta: ID_PUERTA, ejecutar })
const PARCHE = (id: string): Flujo => conLector(ANTES, id)

describe('el motor del alta del lector · guardas sin escritura', () => {
  it('🔴 (a) lo PUBLICADO no es el respaldo ⇒ frenado y CERO escrituras', async () => {
    const otro = copia(ANTES); otro.nodes = otro.nodes.slice(1)
    const sim = n8n({ publicado: otro })
    const r = await correr(sim)
    expect(r.estado).toBe('frenado')
    expect(r.motivo).toMatch(/PUBLICADA no es igual al respaldo/)
    expect(sim.escrituras()).toEqual([])
  })
  it('🔴 (b) el BORRADOR no es ni el respaldo ni el parche ⇒ frenado y CERO escrituras', async () => {
    const raro = copia(ANTES); raro.nodes[0] = { ...raro.nodes[0], parameters: { cambiado: true } }
    const sim = n8n({ borrador: raro })
    const r = await correr(sim)
    expect(r.estado).toBe('frenado')
    expect(r.motivo).toMatch(/BORRADOR/)
    expect(sim.escrituras()).toEqual([])
  })
  it('🔴 (c) un sub-flujo previo DISTINTO del de construir.mjs ⇒ frenado y CERO escrituras', async () => {
    const distinto = { ...copia(SUB), id: 'sub-viejo', active: false }; distinto.nodes = distinto.nodes.slice(1)
    const sim = n8n({ previos: [distinto] })
    const r = await correr(sim)
    expect(r.estado).toBe('frenado')
    expect(sim.escrituras()).toEqual([])
  })
  it('🔴 (c) DOS sub-flujos previos con ese nombre ⇒ frenado y CERO escrituras', async () => {
    const sim = n8n({ previos: [{ ...copia(SUB), id: 's1' }, { ...copia(SUB), id: 's2' }] })
    const r = await correr(sim)
    expect(r.estado).toBe('frenado')
    expect(r.motivo).toMatch(/hay 2 flujos/)
    expect(sim.escrituras()).toEqual([])
  })
  it('🔴 un previo ARCHIVADO no cuenta (se crea uno nuevo)', async () => {
    const sim = n8n({ previos: [{ ...copia(SUB), id: 'viejo', isArchived: true }] })
    const r = await correr(sim)
    expect(r.estado).toBe('hecho')
    expect(r.idFichas).toBe('sub-nuevo')
  })
  it('🔴 paginación: el sub-flujo previo está en la SEGUNDA página ⇒ se reusa, no se crea un duplicado', async () => {
    const id = 'k1IZ5eGfGbUeMQR8'
    const relleno: Flujo[] = Array.from({ length: 3 }, (_, i) => ({ id: `otro-${i}`, name: `otro ${i}`, nodes: [], connections: {}, active: true }))
    const sim = n8n({ porPagina: 2, previos: [...relleno, { ...copia(SUB), id, active: false }] })
    const r = await correr(sim)
    expect(r.estado).toBe('hecho')
    expect(r.idFichas).toBe(id)
    expect(sim.escrituras()).not.toContain('POST /workflows')
    expect(sim.llamadas.filter((l) => l === 'GET /workflows').length).toBeGreaterThanOrEqual(3)
  })
  it('sin --ejecutar: plan, CERO escrituras', async () => {
    const sim = n8n()
    expect((await correr(sim, false)).estado).toBe('plan')
    expect(sim.escrituras()).toEqual([])
  })
})

describe('el motor del alta del lector · el camino bueno y el orden', () => {
  it('🔴 (d) crea el sub-flujo, lo PUBLICA y RECIÉN después hace el PUT de la puerta; lo publicado queda = parche', async () => {
    const sim = n8n()
    const r = await correr(sim)
    expect(r.estado).toBe('hecho')
    expect(sim.escrituras()).toEqual(['POST /workflows', 'POST /workflows/sub-nuevo/activate', `PUT /workflows/${ID_PUERTA}`])
    const p = sim.puerta()
    expect(huella(p)).toBe(huella(PARCHE('sub-nuevo')))
    expect(huella(p.activeVersion)).toBe(huella(PARCHE('sub-nuevo')))
    expect(r.sql).toContain(`'["sub-nuevo"]'::jsonb`)
  })
  it('🔴 el alta A MEDIAS de esta tarde (sub-flujo idéntico apagado + borrador = parche): lo reusa, lo publica y termina', async () => {
    const id = 'k1IZ5eGfGbUeMQR8'
    const sim = n8n({ previos: [{ ...copia(SUB), id, active: false }], borrador: PARCHE(id) })
    const r = await correr(sim)
    expect(r.estado).toBe('hecho')
    expect(r.idFichas).toBe(id)
    expect(sim.escrituras()).toEqual([`POST /workflows/${id}/activate`, `PUT /workflows/${ID_PUERTA}`])
    expect(huella(sim.puerta().activeVersion)).toBe(huella(PARCHE(id)))
  })
  it('🔴 (d) «activar» responde bien pero el sub-flujo NO queda activo ⇒ fallido y la puerta NO se tocó', async () => {
    const sim = n8n({ activarNoActiva: true })
    const r = await correr(sim)
    expect(r.estado).toBe('fallido')
    expect(r.motivo).toMatch(/no quedó publicado · la puerta NO se tocó/)
    expect(sim.escrituras().some((l) => l.startsWith('PUT'))).toBe(false)
  })
  it('🔴 un n8n cuyo PUT solo guarda el borrador: el motor publica la puerta él mismo y lo publicado queda = parche', async () => {
    const sim = n8n({ putNoPublica: true })
    const r = await correr(sim)
    expect(r.estado).toBe('hecho')
    expect(sim.escrituras()).toEqual(['POST /workflows', 'POST /workflows/sub-nuevo/activate', `PUT /workflows/${ID_PUERTA}`, `POST /workflows/${ID_PUERTA}/activate`])
    expect(huella(sim.puerta().activeVersion)).toBe(huella(PARCHE('sub-nuevo')))
  })
  it('🔴 si publicar el sub-flujo falla: «fallido» y la puerta NO se tocó (ni borrador ni publicado)', async () => {
    const sim = n8n({ romper: (m, p) => m === 'POST' && p.endsWith('/activate') })
    const r = await correr(sim)
    expect(r.estado).toBe('fallido')
    expect(r.motivo).toMatch(/la puerta NO se tocó/)
    expect(sim.escrituras().some((l) => l.startsWith('PUT'))).toBe(false)
    expect(huella(sim.puerta())).toBe(huella(ANTES))
  })
})

describe('el motor del alta del lector · (e) nunca deja un estado a medias', () => {
  it('🔴 (e) lo publicado tras el PUT NO es el parche ⇒ fallido Y la puerta vuelve al respaldo (borrador y publicado)', async () => {
    const sim = n8n({ publicaMal: true })
    const r = await correr(sim)
    expect(r.estado).toBe('fallido')
    expect(r.motivo).toMatch(/no es igual al parche/)
    // la restauración vuelve a publicar con el n8n que «publica mal»: no lo logra y LO DICE
    expect(r.restaurada).toBe(false)
    expect(r.motivo).toMatch(/NO LOGRADA/)
  })
  it('🔴 (e) con lo publicado YA cambiado al parche y la verificación caída: la restauración REPUBLICA el respaldo (borrador y publicado)', async () => {
    // PUT solo guarda; la 3.ª lectura de la puerta (la verificación tras publicarla) se cae
    const sim = n8n({ putNoPublica: true, romper: (m, p, n) => m === 'GET' && p === `/workflows/${ID_PUERTA}` && n === 3 })
    const r = await correr(sim)
    expect(r.estado).toBe('fallido')
    expect(r.restaurada).toBe(true)
    expect(huella(sim.puerta())).toBe(huella(ANTES))
    expect(huella(sim.puerta().activeVersion)).toBe(huella(ANTES))
    expect(sim.escrituras().filter((l) => l === `POST /workflows/${ID_PUERTA}/activate`)).toHaveLength(2)
  })
  it('🔴 (e) la restauración misma LANZA (el PUT de restaurar cae) ⇒ restaurada === false y «NO LOGRADA», nunca un sí falso', async () => {
    // 1.er PUT de la puerta (el parche) cae → se restaura; el 2.º PUT (el de restaurar) también cae
    const sim = n8n({ romper: (m, p) => m === 'PUT' && p.includes(ID_PUERTA) })
    const r = await correr(sim)
    expect(r.estado).toBe('fallido')
    expect(r.restaurada).toBe(false)
    expect(r.motivo).toMatch(/NO LOGRADA/)
  })
  it('🔴 (e) el PUT de la puerta falla ⇒ fallido, se restaura y queda IGUAL al respaldo', async () => {
    const sim = n8n({ romper: (m, p, n) => m === 'PUT' && p.includes(ID_PUERTA) && n === 1 })
    const r = await correr(sim)
    expect(r.estado).toBe('fallido')
    expect(r.restaurada).toBe(true)
    expect(r.motivo).toMatch(/LOGRADA/)
    expect(huella(sim.puerta())).toBe(huella(ANTES))
    expect(huella(sim.puerta().activeVersion)).toBe(huella(ANTES))
  })
  it('🔴 (e) la verificación final falla (el GET de después se cae) ⇒ restaura: borrador y publicado = respaldo', async () => {
    let tocada = false
    const sim = n8n({ romper: (m, p) => { if (m === 'PUT') tocada = true; return tocada && m === 'GET' && p === `/workflows/${ID_PUERTA}` && !restaurando } })
    let restaurando = false
    const apiOriginal = sim.api
    const api = async (m: string, p: string, b?: Flujo) => { if (m === 'PUT' && tocada) restaurando = true; return apiOriginal(m, p, b) }
    const r = await altaDelLector({ api, ANTES, sub: SUB, conLector, idPuerta: ID_PUERTA, ejecutar: true })
    expect(r.estado).toBe('fallido')
    expect(r.restaurada).toBe(true)
    expect(huella(sim.puerta())).toBe(huella(ANTES))
    expect(huella(sim.puerta().activeVersion)).toBe(huella(ANTES))
  })
})
