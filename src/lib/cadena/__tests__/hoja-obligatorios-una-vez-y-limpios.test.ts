/**
 * 17-nov · GO Lenovo (firma de Emilio 17:22 Zúrich) · CC3: la hoja duplicaba el vocabulario y lo prohibido de la marca, pegados con «**»
 * (auditoría `raw/findings/auditoria-cadena-28de888e/07-hojas-piezas.md`). Prueba con las líneas REALES del brief v4 de esa corrida
 * (`04-brief-creativo.md`, sección Obligatorios, copiadas tal cual): cada cosa sale UNA vez y limpia.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief, prohibePersonas } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto } from '../conceptos'
import { escribirHoja, type FilaDeHoja } from '../hoja'

const OBLIGATORIOS_REALES = [
  '## Obligatorios',
  '',
  '- **vocabulario:** encebollado, producto del día, naufrago.ec, zona norte, pagas en efectivo al recibir, Náufrago, Olón',
  '- **prohibido:** «premium», «gourmet», «artesanal», «exclusivo»; «el mejor encebollado del Ecuador» sin citar reseña atribuida; prometer pago con tarjeta (no disponible); afirmar que hay local físico en Guayaquil; publicar horarios de martes ni miércoles (cerrado en ambas sedes)',
  '- **lo que no se dice:** que la cobertura llega a toda Guayaquil (solo zona norte confirmada); que el tiempo de entrega es 20–35 min (no confirmado en pedidos piloto); que el pago digital está disponible',
]
const PLAN = '## Fase 1\nObjetivo: que el norte sepa.'
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el norte sepa».', '## Insight', 'Nadie sabía.', '## Mensaje', 'Ya llegó.',
  '## Público', 'Vecinos del norte (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 pedidos nuevos por semana.',
  '## Tono', 'Cercano.', ...OBLIGATORIOS_REALES, '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: [] })
const CONCEPTO = leerConcepto(['## Gran idea  Ya llegó · El norte', '## Cómo se ve  Púrpura.', '## Capítulo F1 · Llegar', 'Qué cuenta: llegamos · Objetivo de la fase (cita): «que el norte sepa» · Cómo se ve en este capítulo: tipografía', '## Banco de ideas',
  '- C1-I01 · ig · post · la olla · mensaje: ya llegó · gancho: g · protagonista: la olla · serie: S1 · foto:ninguna'].join('\n'), { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: [], fotos: [] })
const fila: FilaDeHoja = { id: 'p-1', fecha: '2026-11-20', hora: '10:00', red: 'ig', formato: 'post', pilar: 'p', tema: 't', datos: [], fase: 'F1', idea_ref: 'C1-I01' }
const h = escribirHoja({ client_name: 'Cliente', plan_id: 'plan-1', manual_version: 1, manual_id: 'm', hoy: '2026-11-17', lote_key: '2026-W47', brief: BRIEF, brief_id: 'b', concepto: CONCEPTO, concepto_id: 'c', filas: [fila], formatos: { ig: [{ formato: 'post', produccion: 'opera', lead_dias: 1, max_por_dia: 1, familia: 'post_img' }] } })
const b = parsearBrief(h.texto_md, 'p-1')!

describe('vocabulario y prohibido: una vez y limpios (brief real de la auditoría)', () => {
  it('ningún «**» llega a la hoja', () => {
    expect(h.texto_md).not.toContain('**')
  })
  it('vocabulario: los 7 términos, limpios', () => {
    expect(b.vocabulario_obligatorio).toEqual(['encebollado', 'producto del día', 'naufrago.ec', 'zona norte', 'pagas en efectivo al recibir', 'Náufrago', 'Olón'])
  })
  it('prohibido: cada item entero; las comillas solo se quitan si envuelven todo el item', () => {
    expect(b.prohibido).toEqual(['premium', 'gourmet', 'artesanal', 'exclusivo', '«el mejor encebollado del Ecuador» sin citar reseña atribuida', 'prometer pago con tarjeta (no disponible)', 'afirmar que hay local físico en Guayaquil', 'publicar horarios de martes ni miércoles (cerrado en ambas sedes)'])
  })
  it('cada prohibido sale UNA vez en la hoja (ya no se repite en NEGATIVOS)', () => {
    for (const p of b.prohibido) expect(h.texto_md.split(`  - ${p}\n`).length - 1).toBe(1)
    expect(b.negativos).toEqual(['que la cobertura llega a toda Guayaquil (solo zona norte confirmada)', 'que el tiempo de entrega es 20–35 min (no confirmado en pedidos piloto)', 'que el pago digital está disponible'])
  })
  it('un «no aparecen personas» en lo prohibido se sigue leyendo (prohibePersonas no pierde nada)', () => {
    expect(prohibePersonas({ visual: '', negativos: [], visual_prohibido: [], prohibido: ['no aparecen personas'] })).toBe(true)
    expect(prohibePersonas({ visual: '', negativos: [], visual_prohibido: [], prohibido: ['gourmet'] })).toBe(false)
  })
})
