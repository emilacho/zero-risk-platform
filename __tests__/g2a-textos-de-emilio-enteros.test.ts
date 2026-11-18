/** 18-nov · G2a «nada se recorta» (CC5): lo que escribe Emilio llega entero hasta el tope único del texto del dueño (100.000) */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOPE_DEL_TEXTO_DEL_DUENO } from '@/lib/limites-de-tamano'
import * as preguntas from '@/lib/dueno-preguntas/preguntas'
import * as dueno from '@/lib/portero-alimenta/dueno'
import { interpretarEvento, interpretarInteractividad, CALLBACK_DEL_RECHAZO, BLOQUE_DEL_MOTIVO, CAMPO_DEL_MOTIVO } from '@/lib/notas-del-dueno/interpretar'
import { cuerpoParaElCerebro } from '@/lib/manual/edicion-del-dueno'

const LEE = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const LARGO = 'x'.repeat(5000) // más que cualquiera de los topes viejos (2000, 4000, 600, 80)
const UUID = '11111111-2222-4333-8444-555555555555'

describe('G2a · lo que escribe Emilio llega entero', () => {
  it('🔴 las preguntas al dueño aceptan tema, pregunta y respuesta hasta el tope único (antes 80 / 600 / 2000)', () => {
    for (const m of [preguntas, dueno]) {
      expect(m.MAX_TEMA).toBe(TOPE_DEL_TEXTO_DEL_DUENO)
      expect(m.MAX_PREGUNTA).toBe(TOPE_DEL_TEXTO_DEL_DUENO)
      expect(m.MAX_RESPUESTA).toBe(TOPE_DEL_TEXTO_DEL_DUENO)
    }
  })
  it('🔴 la llave del tema sigue corta: `temaNormal` no pasa de 80 aunque el tema sea largo', () => {
    expect(dueno.temaNormal(Array.from({ length: 200 }, (_, i) => `palabra${i}`).join(' ')).length).toBeLessThanOrEqual(80)
  })
  it('🔴 la base acepta lo mismo que el código: la migración sube los 4 límites de `dueno_preguntas` a 100.000', () => {
    const m = LEE('supabase/migrations/202611182100_dueno_preguntas_textos_sin_tope_corto.sql')
    for (const c of ['tema', 'pregunta', 'supuesto', 'respuesta']) expect(m, c).toMatch(new RegExp(`dueno_preguntas_${c}_check CHECK \\(.*char_length\\(${c}\\) BETWEEN 1 AND 100000\\)`))
  })
  it('🔴 un comentario largo por Slack llega entero (antes se cortaba en silencio)', () => {
    const ev = { type: 'event_callback', event: { type: 'message', channel: 'C1', thread_ts: '1.0', ts: '2.0', user: 'U1', text: LARGO } }
    expect(interpretarEvento(ev)).toMatchObject({ tipo: 'comentar', texto: LARGO })
    const motivo = { type: 'view_submission', user: { id: 'U1' }, view: { callback_id: CALLBACK_DEL_RECHAZO, private_metadata: JSON.stringify({ hitl_id: UUID }), state: { values: { [BLOQUE_DEL_MOTIVO]: { [CAMPO_DEL_MOTIVO]: { value: LARGO } } } } } }
    expect(interpretarInteractividad(motivo)).toMatchObject({ tipo: 'rechazar', comentario: LARGO })
  })
  it('🔴 arriba del tope el comentario se rechaza CON MOTIVO, no se corta', () => {
    const ev = { type: 'event_callback', event: { type: 'message', channel: 'C1', thread_ts: '1.0', ts: '2.0', user: 'U1', text: 'x'.repeat(TOPE_DEL_TEXTO_DEL_DUENO + 1) } }
    const r = interpretarEvento(ev)
    expect(r.tipo).toBe('ignorar')
    expect((r as { motivo: string }).motivo).toMatch(/pasa de 100000 caracteres/)
    const motivo = { type: 'view_submission', user: { id: 'U1' }, view: { callback_id: CALLBACK_DEL_RECHAZO, private_metadata: JSON.stringify({ hitl_id: UUID }), state: { values: { [BLOQUE_DEL_MOTIVO]: { [CAMPO_DEL_MOTIVO]: { value: 'x'.repeat(TOPE_DEL_TEXTO_DEL_DUENO + 1) } } } } } }
    expect(interpretarInteractividad(motivo)).toMatchObject({ tipo: 'ignorar', motivo: expect.stringMatching(/el motivo pasa de 100000/) })
  })
  it('🔴 lo que Emilio cambia en el manual va entero al cerebro (antes 2000)', () => {
    const c = cuerpoParaElCerebro({ client_id: 'c', version: 1, cambio: { clave: 'k', etiqueta: 'E', valor: LARGO } as never, reviewer: 'emilio', en: '2026-11-18T00:00:00Z' })
    expect(c.respuesta).toBe(LARGO)
  })
  it('🔴 en el código ya no queda el corte de 2000 en el comentario de Emilio, la respuesta de la puerta ni el `feedback` de la revisión', () => {
    expect(LEE('src/lib/oficina/eventos-de-emilio/registrar.ts')).not.toMatch(/slice\(0, 2000\)/)
    expect(LEE('src/lib/notas-del-dueno/puerta-del-dueno.ts')).toMatch(/const MAX_RESPUESTA = TOPE_DEL_TEXTO_DEL_DUENO/)
    expect(LEE('src/app/api/hitl/resolve/route.ts')).toMatch(/sanitizeString\(body\.feedback, TOPE_DEL_TEXTO_DEL_DUENO\)/)
    const contrato = JSON.parse(LEE('src/lib/contracts/inputs/hitl-action.json'))
    expect(contrato.properties.reason.maxLength).toBe(TOPE_DEL_TEXTO_DEL_DUENO)
    expect(contrato.properties.notes.maxLength).toBe(TOPE_DEL_TEXTO_DEL_DUENO)
  })
  it('🔴 el acta de la mesa ya no dice solo «es obligatorio» cuando el texto pasa del largo', () => {
    const t = LEE('src/lib/planeacion/mesa/acta.ts')
    expect(t).not.toMatch(/es obligatorio['`]/)
    expect(t).toMatch(/es obligatorio \(texto de 1 a 4000 caracteres\)/)
  })
})
