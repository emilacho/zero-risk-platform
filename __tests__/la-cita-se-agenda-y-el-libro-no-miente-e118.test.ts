/**
 * 🔴 E118 · LA CITA SE AGENDA OTRA VEZ · Y EL FALLO SE DECLARA.
 *
 * Medido (E117 · CC#2 · E110: alta 146720 · segunda fase 146739): el trato que entra por la sala trae el correo
 * como `email`; la cadena lo pide como `contact_email` en dos puntos («Armar carga · segunda fase» del alta y
 * «Schedule Kickoff Call (Cal.com)» de la segunda fase) ⇒ vacío ⇒ 400 `contact_email_required` ⇒ el nodo
 * «continúa en error» y el aviso de Slack dice «ONBOARDING INITIATED» sin mencionar la cita. El libro ya anota
 * SCHEDULING como `started` (no `completed`) cuando Cal.com no confirmó: eso no se toca.
 *
 * Fija: (①) la carga acepta los dos nombres · (②) la reserva acepta los dos nombres · (③) el aviso declara
 * AGENDADO (fecha · enlace) o NO AGENDADO (motivo) · (④) la anotación del libro sigue igual · (⑤) nada más cambió.
 * Con los datos REALES de 146720/146739 (correos tachados). Sin red.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Nodo = { name: string; type: string; parameters: Record<string, any>; onError?: string }
type Flujo = { nodes: Nodo[]; connections: Record<string, unknown>; settings?: any }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8'))
const ALTA_VIVO = leer('LyVoKcrypS5uLyuu/alta-antes-e118-f2993727.json') as Flujo
const ALTA_HOY = leer('LyVoKcrypS5uLyuu/alta-construida-e118.json') as Flujo
const F2_VIVO = leer('wu1DUAXIuEG5nNTX/fase2-antes-e118-785537fe.json') as Flujo
const F2_HOY = leer('wu1DUAXIuEG5nNTX/fase2-construida-e118.json') as Flujo
const EV20 = leer('LyVoKcrypS5uLyuu/evidencia-146720-e118.json') as { validate_deal_data: Record<string, any> }
const EV39 = leer('wu1DUAXIuEG5nNTX/evidencia-146739-e118.json') as { datos_del_alta: Record<string, any>; reserva_respuesta: Record<string, any> }

const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error(`falta ${n}`); return x }
/** evalúa un jsonBody `={ … {{ expr }} … }` como el motor · con $('X').item.json simulado */
function cuerpo(f: Flujo, n: string, nodos: Record<string, any>) {
  const plantilla = String(nodo(f, n).parameters.jsonBody).replace(/^=/, '')
  const $ = (name: string) => { if (!(name in nodos)) throw new Error(`Node '${name}' hasn't been executed`); return { item: { json: nodos[name] }, first: () => ({ json: nodos[name] }) } }
  const $now = new Date().toISOString()
  const texto = plantilla.replace(/\{\{([\s\S]*?)\}\}/g, (_, e) => String(new Function('$', '$now', `return (${e})`)($, $now)))
  return JSON.parse(texto) as Record<string, any>
}
function armarCarga(f: Flujo, validate: Record<string, any>, discovery: Record<string, any>) {
  const code = String(nodo(f, 'Armar carga · segunda fase').parameters.jsCode)
  const $ = (name: string) => ({ item: { json: name === 'Validate Deal Data' ? validate : discovery } })
  return new Function('$', code)($) as Array<{ json: Record<string, any> }>
}
const DISC = { discovery_output: null, response: 'x', response_complete: true, response_length_real: 1, response_length_stored: 1, response_note: null }
const OK = { ok: true, booking: { id: 'b-1', scheduled_at: '2026-09-26T15:00:00.000Z', meeting_url: 'https://cal.com/video/abc' }, cal: { uid: 'abc' } }

describe('el rojo · lo que corrió en E110', () => {
  it('Validate Deal Data trae `email` y no `contact_email` · la carga (f2993727) manda contact_email vacío', () => {
    expect(String(EV20.validate_deal_data.email)).toContain('@')
    expect(EV20.validate_deal_data).not.toHaveProperty('contact_email')
    const carga = armarCarga(ALTA_VIVO, EV20.validate_deal_data, DISC)[0].json
    expect(carga.contact_email).toBe('')
    expect(EV39.datos_del_alta.contact_email).toBe('')
  })
  it('la reserva (785537fe) manda contact_email vacío y Cal.com contestó 400 contact_email_required · el aviso no lo dice', () => {
    const b = cuerpo(F2_VIVO, 'Schedule Kickoff Call (Cal.com)', { 'Datos del alta': EV39.datos_del_alta })
    expect(b.contact_email).toBe('')
    expect(String(EV39.reserva_respuesta.error?.message)).toContain('contact_email_required')
    const aviso = cuerpo(F2_VIVO, 'Alert Slack: Onboarding Initiated', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': EV39.reserva_respuesta })
    expect(aviso.text).not.toMatch(/Kickoff|AGENDAD/)
  })
})

describe('① la carga del alta acepta los dos nombres', () => {
  it('con el trato real de 146720 (email) → contact_email = email · el resto de la carga idéntico', () => {
    const antes = armarCarga(ALTA_VIVO, EV20.validate_deal_data, DISC)[0].json
    const hoy = armarCarga(ALTA_HOY, EV20.validate_deal_data, DISC)[0].json
    expect(hoy.contact_email).toBe(EV20.validate_deal_data.email)
    expect({ ...hoy, contact_email: null }).toEqual({ ...antes, contact_email: null })
  })
  it('el camino viejo sigue: con contact_email gana contact_email · sin ninguno, cadena vacía', () => {
    expect(armarCarga(ALTA_HOY, { ...EV20.validate_deal_data, contact_email: 'a@b.c' }, DISC)[0].json.contact_email).toBe('a@b.c')
    const { email: _e, ...sin } = EV20.validate_deal_data
    expect(armarCarga(ALTA_HOY, sin, DISC)[0].json.contact_email).toBe('')
  })
})

describe('② la reserva acepta los dos nombres · ③ el aviso declara la cita · ④ el libro no cambia', () => {
  it('reserva: contact_email || email · el resto del cuerpo igual', () => {
    const datos = { ...EV39.datos_del_alta, email: 'emilio@ejemplo.ec' }
    const hoy = cuerpo(F2_HOY, 'Schedule Kickoff Call (Cal.com)', { 'Datos del alta': datos })
    const antes = cuerpo(F2_VIVO, 'Schedule Kickoff Call (Cal.com)', { 'Datos del alta': datos })
    expect(hoy.contact_email).toBe('emilio@ejemplo.ec')
    expect(cuerpo(F2_HOY, 'Schedule Kickoff Call (Cal.com)', { 'Datos del alta': { ...datos, contact_email: 'c@d.e' } }).contact_email).toBe('c@d.e')
    expect(cuerpo(F2_HOY, 'Schedule Kickoff Call (Cal.com)', { 'Datos del alta': EV39.datos_del_alta }).contact_email).toBe('')
    const { contact_email: _a, contact_id: _b, scheduled_at: _c, ...restoHoy } = hoy
    const { contact_email: _d, contact_id: _e, scheduled_at: _f, ...restoAntes } = antes
    expect(restoHoy).toEqual(restoAntes)
  })
  it('aviso: con Cal.com en error → «Kickoff: NO AGENDADO · motivo» · con reserva → «AGENDADO · fecha · enlace» · el encabezado no cambia', () => {
    const malo = cuerpo(F2_HOY, 'Alert Slack: Onboarding Initiated', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': EV39.reserva_respuesta })
    expect(malo.text).toContain('Kickoff: NO AGENDADO · ')
    expect(malo.text).toContain('contact_email_required')
    const bueno = cuerpo(F2_HOY, 'Alert Slack: Onboarding Initiated', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': OK })
    expect(bueno.text).toContain('Kickoff: AGENDADO · 2026-09-26T15:00:00.000Z · https://cal.com/video/abc')
    const antes = cuerpo(F2_VIVO, 'Alert Slack: Onboarding Initiated', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': OK })
    expect(bueno.text.startsWith(antes.text)).toBe(true)
    const vacio = cuerpo(F2_HOY, 'Alert Slack: Onboarding Initiated', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': {} })
    expect(vacio.text).toContain('Kickoff: NO AGENDADO · sin respuesta de la puerta')
  })
  it('libro: SCHEDULING sale `started` si Cal.com no confirmó y `completed` sólo con ok + booking.id · igual que antes', () => {
    for (const f of [F2_VIVO, F2_HOY]) {
      const malo = cuerpo(f, '[MODELB] Phase-boundary Emit · kickoff_scheduled', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': EV39.reserva_respuesta })
      expect(malo).toMatchObject({ phase_name: 'SCHEDULING', phase_state: 'started' })
      const bueno = cuerpo(f, '[MODELB] Phase-boundary Emit · kickoff_scheduled', { 'Datos del alta': EV39.datos_del_alta, 'Schedule Kickoff Call (Cal.com)': OK })
      expect(bueno.phase_state).toBe('completed')
    }
    expect(nodo(F2_HOY, '[MODELB] Phase-boundary Emit · kickoff_scheduled').parameters).toEqual(nodo(F2_VIVO, '[MODELB] Phase-boundary Emit · kickoff_scheduled').parameters)
  })
})

describe('⑤ nada más cambió', () => {
  const dif = (hoy: Flujo, vivo: Flujo) => hoy.nodes.filter((n) => JSON.stringify({ t: n.type, p: n.parameters, o: n.onError || null }) !== JSON.stringify({ t: nodo(vivo, n.name).type, p: nodo(vivo, n.name).parameters, o: nodo(vivo, n.name).onError || null })).map((n) => n.name)
  it('alta: 98 nodos · sólo «Armar carga · segunda fase» · conexiones iguales', () => {
    expect(ALTA_HOY.nodes.length).toBe(ALTA_VIVO.nodes.length)
    expect(dif(ALTA_HOY, ALTA_VIVO)).toEqual(['Armar carga · segunda fase'])
    expect(ALTA_HOY.connections).toEqual(ALTA_VIVO.connections)
  })
  it('segunda fase: 18 nodos · sólo la reserva y el aviso · conexiones iguales · la reserva sigue continuando en error (no mata la corrida)', () => {
    expect(F2_HOY.nodes.length).toBe(F2_VIVO.nodes.length)
    expect(dif(F2_HOY, F2_VIVO).sort()).toEqual(['Alert Slack: Onboarding Initiated', 'Schedule Kickoff Call (Cal.com)'])
    expect(F2_HOY.connections).toEqual(F2_VIVO.connections)
    expect(nodo(F2_HOY, 'Schedule Kickoff Call (Cal.com)').parameters.jsonBody).not.toBe(nodo(F2_VIVO, 'Schedule Kickoff Call (Cal.com)').parameters.jsonBody)
    expect((nodo(F2_HOY, 'Schedule Kickoff Call (Cal.com)') as any).onError).toBe('continueRegularOutput')
  })
})
