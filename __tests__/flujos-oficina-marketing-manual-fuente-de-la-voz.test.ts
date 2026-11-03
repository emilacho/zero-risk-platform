/**
 * 03-nov · hallazgo de CC1: el Consolidador no guardaba el `_meta` de la voz → la vara de uso no veía la declaración «propuesta» y pedía otra voz de pago. US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «[BB] Consolidador» y luego el de «[BB] Uso · ¿usó lo disponible?» con el borrador que sale del primero.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
import { REVISION } from '../scripts/ops/oficina-marketing/voz-content-creator-manual.mjs'

const nuevo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing', 'nuevo', 'ssLtwYPt7zxuvnM2.json'), 'utf8'))
const CONS = '[BB] Consolidador'
const lente = (s: Record<string, unknown>) => ({ body: { brand_section: s } })
const VOZ = 'Una voz cercana, directa y cálida que habla como el barrio y evita los tecnicismos para que cualquiera la entienda sin esfuerzo.'
const consolidar = async (flujo: any, ed: Record<string, unknown>) => {
  const r = await recorrer(flujo, CONS, { cycle: 0 }, {
    previos: {
      'Validate Deal Data': [{ client_id: 'c-1' }],
      'Lente · editor-en-jefe': [lente(ed)], 'Lente · brand-strategist': [lente({ positioning: 'p', icp_summary: 'i' })], 'Lente · jefe-client-success': [lente({ customer_angle: 'a', retention_notes: 'r' })],
      'Confirm barato · competitor list': [{ discovery_package: { discovery_summary: 'x' } }],
      '[BB] Fan-out prep': [{ _grounding_refs: {} }],
    },
    hasta: [REVISION.pedido],
  })
  return r.item.brand_book_draft
}

describe('la fuente de la voz llega al borrador', () => {
  it('declarada en _field_meta de la lente → en el borrador, solo con fuente (sin estado provisional)', async () => {
    const b = await consolidar(nuevo, { voice_description: VOZ, _field_meta: { voice_description: { fuente: 'propuesta', razon: 'sin texto propio' } } })
    expect(b._field_meta.voice_description).toEqual({ fuente: 'propuesta', lente: 'content-creator' })
    expect(b.voice_description).toBe(VOZ)
  })
  it('declarada en _meta de la lente, o como { valor, fuente } → también llega', async () => {
    const b1 = await consolidar(nuevo, { voice_description: VOZ, _meta: { voice_description: { fuente: 'propuesta' } } })
    expect(b1._field_meta.voice_description.fuente).toBe('propuesta')
    const b2 = await consolidar(nuevo, { voice_description: { valor: VOZ, fuente: 'propuesta' } })
    expect(b2._field_meta.voice_description.fuente).toBe('propuesta')
  })
  it('sin fuente declarada no se escribe nada: el borrador queda como hoy', async () => {
    const b = await consolidar(nuevo, { voice_description: VOZ })
    expect('voice_description' in b._field_meta).toBe(false)
  })
  it('🔴 con el arreglo la vara NO pide otra voz a un cliente sin texto propio; sin el arreglo sí (el defecto que halló CC1)', async () => {
    const f = JSON.parse(JSON.stringify(nuevo))
    const sin = JSON.parse(JSON.stringify(nuevo))
    const n = sin.nodes.find((x: any) => x.name === CONS)
    n.parameters.jsCode = n.parameters.jsCode.replace(/\/\/ 03-nov · la declaración de la voz[\s\S]*?if \(_fuenteVoz\)[^\n]*\n/, '')
    expect(n.parameters.jsCode).not.toContain('_fuenteVoz')
    const AsyncFunction = Object.getPrototypeOf(async () => 0).constructor
    const uso = async (flujo: any) => {
      const ed = { voice_description: VOZ, _field_meta: { voice_description: { fuente: 'propuesta' } } }
      const b = await consolidar(flujo, ed)
      const $ = (nom: string): any => { if (nom === '[BB] Consolidador') return { first: () => ({ json: { brand_book_draft: b } }), all: () => [{ json: { brand_book_draft: b } }] }; throw new Error('nodo no previsto ' + nom) }
      const grounding = { instagram_estado: 'sin', competitors: [{ name: 'x' }], icp_signals: { segments: ['a'] }, discovery_summary: 'x'.repeat(400) }
      const usoNodo = f.nodes.find((x: any) => x.name === '[BB] Uso · ¿usó lo disponible?').parameters.jsCode as string
      const i = usoNodo.indexOf('function usoDeLoDisponible')
      const bloque = usoNodo.slice(usoNodo.indexOf('var UD_'), usoNodo.indexOf('\n}\n', i) + 3)
      const fn = new Function(bloque + '\nreturn usoDeLoDisponible')
      void AsyncFunction; void $
      return fn()(b, grounding)
    }
    const con = await uso(nuevo), sinArreglo = await uso(sin)
    expect(con.sin_usar.filter((x: any) => x.campo === 'voice_description' && x.rotulo)).toEqual([])
    expect(sinArreglo.sin_usar.filter((x: any) => x.campo === 'voice_description' && x.rotulo).length).toBe(1)
  })
})
