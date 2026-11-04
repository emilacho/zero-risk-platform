/**
 * DESCARTAR PREGUNTAS PENDIENTES (04-nov · firma de Emilio: las preguntas dejan Slack y se contestan en «Tu oficina»). US$ 0 · base falsa · los diez clientes de práctica.
 * El evento `descartar` archiva como «obsoleta» (con fecha y motivo; nada se borra) y NO crea ficha de respuesta; y una respuesta con canal «dashboard · Tu oficina» + pregunta_id cierra la pendiente.
 */
import { describe, expect, it } from 'vitest'
import { rutaDueno, rutaLeerDueno, temaNormal, type DepsDeDueno } from '../dueno'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-oficina', workflow_execution_id: 'ex-1' }
const MOTIVO = 'las preguntas se contestan en Tu oficina'
const montar = (c: ClienteSintetico, activo = true) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora: AHORA, activo, nuevoId: () => '00000000-0000-4000-8000-000000000001' }
  return { t, deps }
}
const pendiente = (t: T, c: ClienteSintetico, id: string, tema: string, extra: Record<string, unknown> = {}) => t.cerebro_dueno_preguntas.push({ id, client_id: c.id, sede_clave: null, tema, tema_norm: temaNormal(tema), pregunta: `¿${tema}?`, canal: 'canal privado de Slack «buzon-de-preguntas»', preguntado_por_oficina: 'financiera', preguntado_por_agente: 'cfo', estado: 'pendiente', creado_en: '2026-10-20T20:11:23Z', ...extra })
const estado = (t: T, id: string) => t.cerebro_dueno_preguntas.find((p) => p.id === id)!.estado
const descartar = (deps: DepsDeDueno, c: ClienteSintetico, o: Record<string, unknown>) => rutaDueno(deps, { evento: 'descartar', client_id: c.id, motivo: MOTIVO, dry_run: false, ...WF, ...o })

describe('descartar preguntas pendientes', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: por tema archiva la pendiente (obsoleta, con fecha y motivo), no crea ficha y las demás quedan`, async () => {
      const { t, deps } = montar(c)
      pendiente(t, c, 'p1', 'ticket real'); pendiente(t, c, 'p2', 'protocolo respuesta'); pendiente(t, c, 'p3', 'ticket real', { estado: 'respondida' })
      const fichas = t.cerebro_fichas.length
      const seco = await descartar(deps, c, { tema: 'Ticket real', dry_run: true })
      expect(seco.body).toMatchObject({ dry_run: true, descartaria: 1, descartadas: 0 }); expect(estado(t, 'p1')).toBe('pendiente')
      const r = await descartar(deps, c, { tema: 'Ticket real' })
      expect(r.body).toMatchObject({ ok: true, descartadas: 1 })
      expect(t.cerebro_dueno_preguntas.find((p) => p.id === 'p1')).toMatchObject({ estado: 'obsoleta', motivo_descarte: MOTIVO, obsoleta_en: AHORA.toISOString() })
      expect(estado(t, 'p2')).toBe('pendiente'); expect(estado(t, 'p3')).toBe('respondida')
      expect(t.cerebro_dueno_preguntas).toHaveLength(3) // nada se borra
      expect(t.cerebro_fichas).toHaveLength(fichas) // sin ficha de respuesta
    })
  }
  it('por pregunta_id solo toca esa; la de otro cliente no; sin motivo o sin id/tema es 400; apagado no escribe; sin coincidencia lo dice', async () => {
    const c = DIEZ_CLIENTES[0], o = DIEZ_CLIENTES[1]
    const { t, deps } = montar(c)
    pendiente(t, c, 'a', 'ticket real'); pendiente(t, c, 'b', 'ticket real'); pendiente(t, o, 'z', 'ticket real')
    expect((await descartar(deps, c, { pregunta_id: 'a' })).body).toMatchObject({ descartadas: 1 })
    expect(t.cerebro_dueno_preguntas.map((p) => `${p.id}:${p.estado}`)).toEqual(['a:obsoleta', 'b:pendiente', 'z:pendiente'])
    expect((await descartar(deps, c, { pregunta_id: 'z' })).body).toMatchObject({ descartadas: 0 }); expect(estado(t, 'z')).toBe('pendiente')
    expect((await descartar(deps, c, { tema: 'ticket real', motivo: '' })).status).toBe(400)
    expect((await descartar(deps, c, {})).status).toBe(400)
    const off = montar(c, false); pendiente(off.t, c, 'q', 'ticket real')
    expect((await descartar(off.deps, c, { tema: 'ticket real' })).body).toMatchObject({ apagado: true }); expect(estado(off.t, 'q')).toBe('pendiente')
    expect((await descartar(deps, c, { tema: 'otro asunto distinto' })).body).toMatchObject({ descartadas: 0 })
  })
  it('una obsoleta ya no bloquea a otra oficina ni aparece como pendiente', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, 'a', 'ticket real', { creado_en: AHORA.toISOString() })
    await descartar(deps, c, { pregunta_id: 'a' })
    const nueva = await rutaDueno(deps, { evento: 'pregunta', client_id: c.id, tema: 'ticket real', pregunta: '¿Cuál es el ticket real?', canal: 'dashboard · Tu oficina', preguntado_por: { oficina: 'estrategia', agente: 'planning-director' }, dry_run: false, ...WF })
    expect(nueva.body).toMatchObject({ registrada: true })
    const lec = await rutaLeerDueno(deps, { client_id: c.id, tema: 'ticket real' })
    expect(JSON.stringify(lec.body)).not.toContain('"pregunta_id":"a"')
  })
  it('respuesta con canal «dashboard · Tu oficina» y pregunta_id: guarda la ficha y cierra la pendiente (forma exacta para CC5)', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, deps } = montar(c)
    pendiente(t, c, 'pid-1', 'ticket real', { creado_en: AHORA.toISOString() })
    const r = await rutaDueno(deps, { evento: 'respuesta', client_id: c.id, pregunta_id: 'pid-1', tema: 'ticket real', pregunta: '¿Cuál es el ticket real?', respuesta: 'Unos 14 dólares por persona', canal: 'dashboard · Tu oficina', mensaje_ref: 'oficina:pid-1', respondido_en: AHORA.toISOString(), preguntado_por: { oficina: 'financiera', agente: 'cfo' }, dry_run: false, ...WF })
    expect(r.status).toBe(200)
    const vivas = t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && !f.retirada_en)
    expect(vivas).toHaveLength(1)
    expect(t.cerebro_dueno_preguntas[0]).toMatchObject({ estado: 'respondida', ficha_id: vivas[0].id })
  })
})
