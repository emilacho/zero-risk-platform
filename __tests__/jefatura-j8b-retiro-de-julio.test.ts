/**
 * JEFATURA · J8b (CC#1 · 14-oct) · la cabecera del editor en la oficina, el voto de julio, las 4 filas de contenido y las aprobaciones `editor_escalation`: todo con respaldo y SIN ejecutar.
 * Se prueba el cálculo (puro), que el guion no escribe nada sin `--aplicar` ni sin respaldo, y que la cabecera queda fijada también en el flujo de la jefatura (prueba (a) del diseño §9.4).
 */
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { CABECERA, conCabeceraDelEditor, dentroDeLaBoveda, ESTADOS_PENDIENTES, FLUJO_OFICINA, FLUJO_VOTO, NODO_AGENTE, pasosDeJ8b, planDeFilasDeContenido, planDePendientes, referenciasA, TIPOS_DE_CONTENIDO } from '../scripts/ops/jefatura-j8b/nucleo.mjs'
import { construirTurno } from '../scripts/worker-staging/jefatura/construir-jefatura.mjs'

type Json = Record<string, any>
const antes = JSON.parse(fs.readFileSync('scripts/worker-staging/bTbWL9lUvQCfStAz/ANTES-bTbWL9lUvQCfStAz-2026-10-14.json', 'utf8').split('\r\n').join('\n')) as Json
const voto = JSON.parse(fs.readFileSync('scripts/worker-staging/hi5nwPCGUWHkGnT7/ANTES-hi5nwPCGUWHkGnT7-2026-10-14.json', 'utf8').split('\r\n').join('\n')) as Json
const nodo = (f: Json, n: string) => (f.nodes as Json[]).find((x) => x.name === n) as Json

describe('J8b · cabecera `x-skip-editor-middleware` en «② Agente (run-sdk)» de la oficina', () => {
  const despues = conCabeceraDelEditor(antes) as Json
  it('cambia SOLO ese nodo y SOLO suma la cabecera a su lista; lo demás queda igual, nodo por nodo y enlace por enlace', () => {
    for (const n of antes.nodes as Json[]) {
      if (n.name === NODO_AGENTE) continue
      expect(JSON.stringify(nodo(despues, n.name))).toBe(JSON.stringify(n))
    }
    expect(despues.nodes).toHaveLength(antes.nodes.length)
    expect(despues.connections).toEqual(antes.connections)
    expect(despues.name).toBe(antes.name); expect(despues.settings).toEqual(antes.settings)
    const a = nodo(antes, NODO_AGENTE), d = nodo(despues, NODO_AGENTE)
    expect(d.parameters.headerParameters.parameters).toEqual([...a.parameters.headerParameters.parameters, CABECERA])
    const { headerParameters: _h1, ...restoA } = a.parameters; const { headerParameters: _h2, ...restoD } = d.parameters
    void _h1; void _h2
    expect(restoD).toEqual(restoA)
    expect({ ...d, parameters: null }).toEqual({ ...a, parameters: null })
  })
  it('no muta el flujo que recibe (devuelve una copia)', () => { expect(nodo(antes, NODO_AGENTE).parameters.headerParameters.parameters.some((h: Json) => h.name === CABECERA.name)).toBe(false) })
  it('se niega si ya la trae (no se pone dos veces), si el nodo no es único o si dejó de ser HTTP', () => {
    expect(() => conCabeceraDelEditor(despues)).toThrow(/ya trae la cabecera/)
    const sin = JSON.parse(JSON.stringify(antes)); sin.nodes = sin.nodes.filter((n: Json) => n.name !== NODO_AGENTE)
    expect(() => conCabeceraDelEditor(sin)).toThrow(/UN nodo/)
    const dos = JSON.parse(JSON.stringify(antes)); dos.nodes.push(JSON.parse(JSON.stringify(nodo(antes, NODO_AGENTE))))
    expect(() => conCabeceraDelEditor(dos)).toThrow(/UN nodo/)
    const otro = JSON.parse(JSON.stringify(antes)); nodo(otro, NODO_AGENTE).type = 'n8n-nodes-base.code'
    expect(() => conCabeceraDelEditor(otro)).toThrow(/ya no es un nodo HTTP/)
    const sinCab = JSON.parse(JSON.stringify(antes)); nodo(sinCab, NODO_AGENTE).parameters.sendHeaders = false
    expect(() => conCabeceraDelEditor(sinCab)).toThrow(/no envía cabeceras/)
  })
  it('el nombre de la cabecera es EXACTAMENTE el que lee el editor viejo y su valor es «1»', () => { expect(CABECERA).toEqual({ name: 'x-skip-editor-middleware', value: '1' }) })
  it('PRUEBA (a) del diseño: la cabecera queda fijada en el nodo «Agente» del flujo de la jefatura Y en el agente de la oficina', () => {
    const jef = construirTurno() as Json
    const agente = (jef.nodes as Json[]).find((n) => /^② Agente/.test(n.name)) as Json
    expect(JSON.stringify(agente.parameters.headerParameters)).toMatch(/x-skip-editor-middleware/)
    expect(JSON.stringify(nodo(despues, NODO_AGENTE).parameters.headerParameters)).toMatch(/x-skip-editor-middleware/)
    // y hoy, ANTES de J8b, la oficina NO la fija (por eso J8b existe)
    expect(JSON.stringify(nodo(antes, NODO_AGENTE).parameters.headerParameters)).not.toMatch(/x-skip-editor-middleware/)
  })
  it('el flujo ARREGLADO que se deja en el repositorio es exactamente el resultado de esta función sobre el ANTES respaldado', () => {
    const f = JSON.parse(fs.readFileSync(`scripts/worker-staging/${FLUJO_OFICINA}/oficina-turno-ARREGLADO-j8b-2026-10-14.json`, 'utf8').split('\r\n').join('\n'))
    expect(f).toEqual(despues)
  })
})

describe('J8b · el voto de julio (`hi5nwPCGUWHkGnT7`) solo se desactiva si NADIE lo referencia', () => {
  const otros = [{ id: 'A', name: 'otro', nodes: [{ name: 'x', parameters: { url: 'https://n8n/webhook/zero-risk/algo' } }] }, { id: 'B', name: 'usa el voto', nodes: [{ name: 'Ejecutar voto', parameters: { workflowId: FLUJO_VOTO } }] }]
  it('lista quién lo referencia (nodo y flujo) y no se cuenta a sí mismo', () => {
    expect(referenciasA([voto, otros[0]], FLUJO_VOTO)).toEqual([])
    // un flujo que se nombra a sí mismo en un nodo (su propio id) NO cuenta como referencia ajena
    expect(referenciasA([{ id: FLUJO_VOTO, name: 'voto', nodes: [{ name: 'yo', parameters: { x: FLUJO_VOTO } }] }], FLUJO_VOTO)).toEqual([])
    expect(referenciasA([voto, ...otros], FLUJO_VOTO)).toEqual([{ flujo: 'B', nombre: 'usa el voto', nodo: 'Ejecutar voto' }])
    expect(referenciasA([...otros], FLUJO_VOTO, { excepto: ['B'] })).toEqual([])
  })
  it('el voto vivo respaldado está activo y trae su propio id (el respaldo es del flujo correcto)', () => { expect(voto.id).toBe(FLUJO_VOTO); expect(voto.active).toBe(true) })
})

describe('J8b · las 4 filas de contenido (nunca el cimiento)', () => {
  const fila = (artifact_type: string, artifact_class: string, is_active = true) => ({ artifact_type, artifact_class, is_active })
  const tabla = (o: Json = {}) => [fila('ad_creative', 'contenido'), fila('brand_book', 'cimiento'), fila('competitive', 'cimiento'), fila('copy', 'contenido'), fila('email', 'contenido'), fila('icp', 'cimiento'), fila('landing', 'contenido'), ...(o.extra ?? [])]
  it('apaga exactamente las 4 de contenido; el filtro nombra los 4 tipos Y la clase contenido; el cuerpo es solo is_active=false', () => {
    const p = planDeFilasDeContenido(tabla())
    expect(p.tipos).toEqual([...TIPOS_DE_CONTENIDO].sort()); expect(p.cuerpo).toEqual({ is_active: false }); expect(p.cimiento).toEqual(['brand_book', 'competitive', 'icp'])
    expect(p.filtro).toBe('artifact_type=in.(ad_creative,copy,email,landing)&artifact_class=eq.contenido')
    expect(p.filtro).not.toMatch(/brand_book|icp|competitive/)
  })
  it('una fila ya apagada se declara y no se repite; con las 4 apagadas no hay nada que hacer', () => {
    const t = tabla().map((f) => (f.artifact_type === 'copy' ? { ...f, is_active: false } : f))
    expect(planDeFilasDeContenido(t).ya_apagadas).toEqual(['copy']); expect(planDeFilasDeContenido(t).tipos).toEqual(['ad_creative', 'email', 'landing'])
    expect(planDeFilasDeContenido(tabla().map((f) => ({ ...f, is_active: f.artifact_class === 'cimiento' }))).tipos).toEqual([])
  })
  it('se niega si falta una fila del cimiento (no se puede comprobar que queda intacta), si faltan filas de contenido o si una «de contenido» cambió de clase', () => {
    expect(() => planDeFilasDeContenido(tabla().filter((f) => f.artifact_type !== 'icp'))).toThrow(/3 filas del cimiento/)
    expect(() => planDeFilasDeContenido(tabla().filter((f) => f.artifact_type !== 'email'))).toThrow(/4 filas de contenido/)
    expect(() => planDeFilasDeContenido(tabla().map((f) => (f.artifact_type === 'landing' ? { ...f, artifact_class: 'cimiento' } : f)))).toThrow(/no es de clase contenido/)
    expect(() => planDeFilasDeContenido(null as never)).toThrow(/no se leyeron/)
  })
  it('las filas nuevas de la jefatura (clase revision) no entran en el filtro ni en el conteo', () => {
    const p = planDeFilasDeContenido(tabla({ extra: [fila('plan', 'revision', false), fila('pieza', 'revision', false)] }))
    expect(p.tipos).toHaveLength(4)
  })
})

describe('J8b · las aprobaciones `editor_escalation`', () => {
  const f = (approval_type: string, status: string, item_id = Math.random().toString(36).slice(2)) => ({ approval_type, status, item_id })
  it('cierra SOLO las `editor_escalation` abiertas: ni las ya cerradas ni las de RUFLO, NEXUS, CRO, informes, QBR', () => {
    const filas = [f('editor_escalation', 'pending', 'e1'), f('editor_escalation', 'notified', 'e2'), f('editor_escalation', 'escalated', 'e3'), f('editor_escalation', 'approved', 'e4'), f('editor_escalation', 'expired', 'e5'), f('ruflo_decision', 'pending', 'r1'), f('nexus_gate', 'pending', 'n1'), f('weekly_report', 'pending', 'w1')]
    const p = planDePendientes(filas, { ahora: '2026-10-14T20:00:00Z' })
    expect(p.por_cerrar).toEqual(['e1', 'e2', 'e3']); expect(p.ya_cerradas).toBe(2); expect(p.ajenas_que_no_se_tocan).toBe(3)
    expect(p.filtro).toBe('approval_type=eq.editor_escalation&status=in.(pending,notified,escalated)')
    expect(p.cuerpo).toEqual({ status: 'expired', resolved_at: '2026-10-14T20:00:00Z', resolver: 'editor apagado, cubierto por jefatura' })
    expect(ESTADOS_PENDIENTES).toEqual(['pending', 'notified', 'escalated'])
  })
  it('hoy (0 filas) no hay nada que cerrar; con filas sin leer se niega', () => {
    expect(planDePendientes([], { ahora: 'x' }).por_cerrar).toEqual([])
    expect(() => planDePendientes(undefined as never, { ahora: 'x' })).toThrow(/no se leyeron/)
  })
  it('se marca, no se borra: el cuerpo no tiene ninguna operación de borrado y el estado es uno que la tabla admite', () => {
    const p = planDePendientes([f('editor_escalation', 'pending', 'e1')], { ahora: 'x' })
    expect(Object.keys(p.cuerpo)).toEqual(['status', 'resolved_at', 'resolver']); expect(['pending', 'notified', 'approved', 'rejected', 'expired', 'escalated']).toContain(p.cuerpo.status)
  })
})

describe('J8b · el guion', () => {
  it('detecta la bóveda de secretos (los respaldos con texto van fuera)', () => {
    expect(dentroDeLaBoveda('C:/Users/x/OneDrive/Documents/zr-vault/raw/respaldo')).toBe(true)
    expect(dentroDeLaBoveda('C:\\Users\\x\\zr-vault\\a')).toBe(true)
    expect(dentroDeLaBoveda('C:/Users/x/Documents/Claude/Projects/Agentic Business Agency/_respaldos/j8b')).toBe(false)
  })
  it('el plan trae sus 8 pasos, cada uno con su reversa, en el orden respaldo → foto → precondiciones → cabecera → voto → contenido → pendientes → comprobar', () => {
    const p = pasosDeJ8b()
    expect(p.map((x: Json) => x.paso)).toEqual(['respaldo', 'foto', 'precondiciones', 'cabecera', 'voto', 'contenido', 'pendientes', 'comprobar'])
    for (const x of p) expect(String(x.reversa).length).toBeGreaterThan(0)
  })
  it('`plan` se imprime sin red; `respaldar --aplicar` y `paso` se niegan dentro de la bóveda o sin carpeta (nada se escribe)', () => {
    const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x', N8N_API_KEY: 'x', N8N_BASE_URL: 'http://127.0.0.1:9' }
    const plan = spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'plan'], { encoding: 'utf8', env })
    expect(plan.status).toBe(0); expect(plan.stdout).toContain('Ahora no se ha tocado nada')
    const boveda = spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'respaldar', '--aplicar', '--carpeta', 'C:/x/zr-vault/raw/j8b'], { encoding: 'utf8', env })
    expect(boveda.status).toBe(2); expect(boveda.stderr).toContain('FUERA')
    const sinCarpeta = spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'paso', 'cabecera'], { encoding: 'utf8', env })
    expect(sinCarpeta.status).toBe(2); expect(sinCarpeta.stderr).toContain('--carpeta')
  })
  it('no escribe llaves, no nombra naufrago.ec en el código, y solo toca esas dos tablas y esos dos flujos', () => {
    const s = fs.readFileSync('scripts/ops/jefatura-j8b.mjs', 'utf8') + fs.readFileSync('scripts/ops/jefatura-j8b/nucleo.mjs', 'utf8')
    expect(s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')).not.toMatch(/naufrago/i)
    expect(s).not.toMatch(/[0-9a-f]{64}/); expect(s).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
    expect([...new Set([...s.matchAll(/rest\('(\w+)'/g)].map((m) => m[1]))].sort()).toEqual(['hitl_pending_approvals', 'jefatura_grading_policies'])
    expect(s).not.toMatch(/method: 'DELETE'/)
    expect(FLUJO_OFICINA).toBe('bTbWL9lUvQCfStAz'); expect(FLUJO_VOTO).toBe('hi5nwPCGUWHkGnT7')
  })
})
