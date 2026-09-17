/**
 * 🔴 E87 · LOS LECTORES DEJAN DE INVENTAR (arreglo C de E86 · puntos a y c).
 *
 *  a · alta «Parse veredicto» / «Parse re-gate veredicto»: una respuesta perdida es «no sé», NUNCA «observar».
 *      Fijado con la evidencia REAL de la bolita (140135): `{"error":"terminated"}` ⇒ `observar` (viejo) · `no_se` (nuevo).
 *  c · Journey B (RwUo7G2PmZNqyMbe): el CEREBRO no guarda marcadores de fallo. La GUARDA para si el empleado no
 *      respondió, y ninguna ingesta conserva el texto de relleno «pending · upstream agent did not return response».
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(__dirname, '..', 'scripts', 'worker-staging')
const leer = (p: string) => readFileSync(join(DIR, p), 'utf8')
const EV = JSON.parse(leer('LyVoKcrypS5uLyuu/evidencia-140135-veredicto.json')) as { veredicto_perdido: unknown; regate_real: unknown; parse_viejo: string }
const V2 = leer('LyVoKcrypS5uLyuu/parse-veredicto-v2.js').replace(/__LISTA__/g, 'Confirm barato · competitor list')
const GUARDA = leer('RwUo7G2PmZNqyMbe/guarda-respondio.js').replace(/__STEP__/g, 'Step 1 · onboarding-specialist intake form')

function runParse(code: string, json: unknown) {
  const $ = () => ({ item: { json: { client_id: 'c', client_name: 'n' } }, first: () => ({ json: { client_id: 'c', client_name: 'n' } }) })
  const $input = { first: () => ({ json }), all: () => [{ json }] }
  return new Function('$', '$input', code)($, $input)[0].json as { veredicto: string; razones: string[]; _perdida?: string | null }
}
function runGuarda(stepJson: unknown) {
  const $ = () => ({ first: () => ({ json: stepJson }) })
  const $input = { first: () => ({ json: { client_id: 'c' } }), all: () => [{ json: { client_id: 'c' } }] }
  try { new Function('$', '$input', '$execution', GUARDA)($, $input, { id: '1' }); return { paso: true, msg: '' } }
  catch (e) { return { paso: false, msg: (e as Error).message } }
}

describe('E87 · a · el veredicto de competidores · respuesta perdida = no_se', () => {
  it('el rojo · el parse publicado en la bolita leía «terminated» como observar', () => {
    expect(runParse(EV.parse_viejo, EV.veredicto_perdido).veredicto).toBe('observar')
  })
  it('la evidencia real de 140135 · «terminated» ⇒ no_se con motivo', () => {
    const r = runParse(V2, EV.veredicto_perdido)
    expect(r.veredicto).toBe('no_se')
    expect(r.razones[0]).toMatch(/respuesta_perdida/)
    expect(r._perdida).toMatch(/success_true/)
  })
  it('la respuesta real del re-gate (confirmar) sigue leyéndose como confirmar', () => {
    expect(runParse(V2, EV.regate_real).veredicto).toBe('confirmar')
  })
  it('observar legítimo sigue siendo observar', () => {
    expect(runParse(V2, { success: true, response: '```json\n{"veredicto":"observar","razones":["lista vacia"]}\n```' }).veredicto).toBe('observar')
  })
  it('success:false · sin success · success:true sin JSON · JSON sin veredicto ⇒ no_se (nunca un valor)', () => {
    for (const b of [{ success: false, error: 'x' }, { response: '{"veredicto":"confirmar"}' }, { success: true, response: 'sin json' }, { success: true, response: '{"otro":1}' }, null, 'texto']) {
      expect(runParse(V2, b).veredicto, JSON.stringify(b)).toBe('no_se')
    }
  })
})

describe('E87 · c · Journey B · el CEREBRO no guarda marcadores de fallo', () => {
  it('sin respuesta · success:false · response vacía · el propio relleno ⇒ la GUARDA para y no se ingiere', () => {
    for (const s of [null, { error: 'terminated' }, { success: false, error: 'x' }, { success: true, response: '' }, { success: true, response: 'step-1-intake pending · upstream agent did not return response.' }]) {
      const r = runGuarda(s)
      expect(r.paso, JSON.stringify(s)).toBe(false)
      expect(r.msg).toMatch(/RESPUESTA_PERDIDA/)
    }
  })
  it('con success:true y texto, pasa', () => {
    expect(runGuarda({ success: true, response: 'Intake form: 1) …' }).paso).toBe(true)
  })
  it('la foto publicada de Journey B ya no tiene texto de relleno en ninguna ingesta y declara el avisador', () => {
    const jb = JSON.parse(leer('RwUo7G2PmZNqyMbe/journey-b-VIVO-2026-09-17.json')) as { nodes: Array<{ name: string; type: string; parameters: Record<string, unknown> }>; settings: { errorWorkflow?: string } }
    // sólo las ingestas (HTTP) · la GUARDA (Code) nombra la frase para RECHAZARLA
    const ingestas = jb.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && String(n.parameters.url ?? '').includes('/api/brain/ingest-source'))
    expect(ingestas.length).toBe(4)
    for (const n of ingestas) expect(String(n.parameters.jsonBody), n.name).not.toContain('did not return response')
    expect(jb.nodes.filter((n) => n.name.startsWith('GUARDA · Step')).length).toBe(4)
    expect(jb.settings.errorWorkflow).toBe('5fkPLbZvQsQa1bcd')
  })
})
