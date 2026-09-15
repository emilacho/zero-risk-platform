/**
 * 🔴 E39 · EL TRAMO NUEVO · la casilla «qué es el negocio» sobrevive hasta el
 * paquete del que escribe el manual — no sólo hasta la ficha.
 *
 * E36 probó el contrato (emisor → filtro → ficha). Falta el camino de vuelta:
 * CC#3 midió en E38 que entre el descubridor y el que escribe el manual hay
 * TRES filtros más que reconstruyen el objeto campo por campo · el mismo
 * defecto del contrato, tres veces más. Cualquier casilla que no esté nombrada
 * en los tres, se cae.
 *
 * Esta prueba NO describe los nodos: los CORRE. El código es el publicado,
 * copiado tal cual del motor a `scripts/worker-staging/E39-casilla-negocio/`,
 * y lo que se publica es exactamente lo que acá se prueba.
 *
 *   ① [APIFY-WIRE] Discovery Parser · dynamic targets (lazo)   · flujo del alta
 *   ② [JEFATURA] Transform discovery→package                   · flujo del alta
 *   ③ [BB] Fan-out prep                                        · sub-flujo del cimiento
 *
 * 🔴 El guarda: una casilla de VERDAD inventada NO debe sobrevivir. Sin eso la
 * prueba podría pasar porque la cadena copia todo, y no probaría nada.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'scripts/worker-staging/E39-casilla-negocio/nodos')
const codigo = (f: string) => readFileSync(join(DIR, f), 'utf8')

const CLIENTE = 'a7ad4331-b7d6-48c8-8846-c53063495bd3'
const LA_RESPUESTA =
  'Plataforma de reservas: terceros (escuelas de esqui, empresas de parapente) prestan el ' +
  'servicio, el viajero paga la reserva en linea y el proveedor la confirma. Hay dos lados.'
const INVENTADA = 'esto_no_deberia_viajar_nunca'

type Json = Record<string, any>
/** Corre el código de un nodo n8n con un contexto de mentira · sin motor, sin red. */
function correrNodo(js: string, ctx: { nodos: Record<string, Json[]>; execution?: string }): Json[] {
  const $ = (nombre: string) => {
    const items = ctx.nodos[nombre]
    if (!items) throw new Error(`no hay datos del nodo ${nombre}`)
    return {
      first: () => ({ json: items[0] }),
      all: () => items.map((json) => ({ json })),
    }
  }
  const $execution = { id: ctx.execution ?? 'exec-de-prueba' }
  const $workflow = { id: 'wf-de-prueba' }
  const fn = new Function('$', '$execution', '$workflow', '$json', `${js}`)
  return fn($, $execution, $workflow, {}) as Json[]
}

const DEAL = {
  client_id: CLIENTE,
  client_name: 'GOEUROPEADVENTURE',
  industry: 'turismo europeo',
  website: 'https://www.goeuropeadventure.com',
  _journey_id: 'journey-de-prueba',
}

/** Lo que devuelve el endpoint cuando el descubridor SÍ contestó la pregunta. */
const respuestaDelDescubridor = (extra: Json = {}) => ({
  body: {
    discovery_output: {
      client_id: CLIENTE,
      own_handles: { instagram: '@goeuropeadventure' },
      competitors: [
        { name: 'Zermatters', website: 'https://zermatters.ch', competitor_type: 'direct' },
        { name: 'FLYZermatt', website: 'https://flyzermatt.com', competitor_type: 'direct' },
      ],
      icp: [{ audience_segment: 'Viajero internacional de aventura', pain_points: ['coordinar varios proveedores'], goals: ['variedad sin gestion'] }],
      competitive_landscape_summary: 'El mercado de experiencias guiadas en Zermatt esta dominado por operadores especializados.',
      ...extra,
    },
  },
})

/** El recorrido entero · ① → ② → ③ · devuelve el pedido de cada lente. */
function recorridoCompleto(extra: Json = {}) {
  const uno = correrNodo(codigo('1-discovery-parser.js'), {
    nodos: {
      'Call Onboarding Specialist: Auto-Discovery': [respuestaDelDescubridor(extra)],
      'Validate Deal Data': [DEAL],
    },
  })
  const dos = correrNodo(codigo('2-jefatura-transform.js'), {
    nodos: {
      'Validate Deal Data': [DEAL],
      '[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)': [uno[0].json],
      '[JEFATURA] Load landscape_summary (canon)': [{ content_text: '' }],
      '[APIFY] Enrich competitors': [{ competitors: [] }],
      '[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)': [{ sources: [] }],
    },
  })
  const tres = correrNodo(codigo('3-bb-fan-out-prep.js'), {
    nodos: {
      'Validate Deal Data': [DEAL],
      'Confirm barato · competitor list': [dos[0].json],
      '[APIFY-WIRE] Aggregate Service responses (onboarding_e2e)': [{ sources: [] }],
      '[BB] Load ICP (canon)': [
        { audience_segment: 'Viajero internacional de aventura', pain_points: ['coordinar varios proveedores'], goals: ['variedad sin gestion'] },
      ],
    },
  })
  return {
    paquete_parser: uno[0].json.discovery_package as Json,
    paquete_jefatura: dos[0].json.discovery_package as Json,
    grounding: tres[0].json._grounding_refs as Json,
    tasks: tres[0].json.tasks as Record<string, string>,
    corte: tres[0].json._corte as Json,
  }
}

describe('🔴 E39 · el tramo nuevo · de la respuesta del descubridor al que escribe el manual', () => {
  it('① el primer filtro (Discovery Parser) NO se come la casilla', () => {
    const r = recorridoCompleto({ business_model: LA_RESPUESTA })
    expect(r.paquete_parser.business_model).toBe(LA_RESPUESTA)
  })

  it('② el segundo filtro (JEFATURA Transform) tampoco', () => {
    const r = recorridoCompleto({ business_model: LA_RESPUESTA })
    expect(r.paquete_jefatura.business_model).toBe(LA_RESPUESTA)
  })

  it('③ llega al grounding del que escribe el manual', () => {
    const r = recorridoCompleto({ business_model: LA_RESPUESTA })
    expect(r.grounding.business_model).toBe(LA_RESPUESTA)
  })

  it('🟢 y llega al PEDIDO de las TRES lentes, con la respuesta adentro', () => {
    const r = recorridoCompleto({ business_model: LA_RESPUESTA })
    for (const lente of ['brand-strategist', 'editor-en-jefe', 'jefe-client-success']) {
      expect(r.tasks[lente], `falta el pedido de ${lente}`).toBeDefined()
      expect(r.tasks[lente]).toContain('business_model')
      expect(r.tasks[lente]).toContain('Plataforma de reservas')
    }
  })

  it('no hay corte · la casilla entra sin desplazar evidencia', () => {
    const r = recorridoCompleto({ business_model: LA_RESPUESTA })
    expect(r.corte.hubo).toBe(false)
    expect(r.corte.evidencia_omitida).toEqual([])
  })

  it('sin respuesta, el recorrido NO se rompe y la casilla viaja vacía', () => {
    const r = recorridoCompleto()
    expect(r.paquete_parser.business_model).toBe('')
    expect(r.grounding.business_model).toBe('')
    expect(r.tasks['jefe-client-success']).toBeDefined()
  })
})

describe('🔴 E39 · EL GUARDA · la cadena sigue filtrando', () => {
  it('una casilla de VERDAD inventada NO sobrevive a ninguno de los tres filtros', () => {
    const r = recorridoCompleto({ [INVENTADA]: 'xxx', business_model: LA_RESPUESTA })
    expect(INVENTADA in r.paquete_parser).toBe(false)
    expect(INVENTADA in r.paquete_jefatura).toBe(false)
    expect(INVENTADA in r.grounding).toBe(false)
    for (const lente of Object.keys(r.tasks)) {
      expect(r.tasks[lente]).not.toContain(INVENTADA)
    }
  })
})
