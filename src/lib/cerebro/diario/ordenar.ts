/**
 * LIMPIO Y ORDENADO (paso 3) · el plan de limpieza de las FICHAS del cerebro. PURO.
 *  · duplicados fuera: por huella; se conserva la más antigua con fuente primaria (dueño / su fuente) y las demás se RETIRAN con motivo;
 *  · lo vencido y no reconfirmado se retira («el índice nunca miente»);
 *  · lo propio se rotula propio.
 * NUNCA se borra: retirar es poner `retirada_en` y `motivo_retirada` (la libreta es histórica). Solo se opera sobre `cerebro_fichas`; los trozos viejos de `client_brain_chunks` no se tocan.
 * B3 de CC#3: lo que un modelo escribió a partir de un raspado nace como SÍNTESIS con enlace a lo crudo (`provenanceDeSintesis`), nunca como fuente propia.
 */
export interface FichaFila {
  id: string
  huella?: string | null
  creado_en: string
  vigente_hasta?: string | null
  reconfirmado_en?: string | null
  retirada_en?: string | null
  origen: string
  propiedad?: string | null
}
export interface PlanDeLimpieza {
  duplicados: Array<{ id: string; conservar_id: string }>
  vencidas: Array<{ id: string }>
  marcar_propias: Array<{ id: string }>
}
const PRIMARIOS = new Set(['dueno', 'su_fuente'])
const t = (s: string | null | undefined): number => (s ? new Date(s).getTime() : NaN)

export function planDeLimpieza(fichas: FichaFila[], ahora: Date): PlanDeLimpieza {
  const vivas = fichas.filter((f) => !f.retirada_en)
  const plan: PlanDeLimpieza = { duplicados: [], vencidas: [], marcar_propias: [] }
  // vencidas: pasó su fecha y no se reconfirmó después de ella
  const vencidas = new Set<string>()
  for (const f of vivas) {
    const hasta = t(f.vigente_hasta)
    if (Number.isFinite(hasta) && hasta < ahora.getTime() && !(Number.isFinite(t(f.reconfirmado_en)) && t(f.reconfirmado_en) >= hasta)) vencidas.add(f.id)
  }
  // duplicados entre las que siguen vivas y no vencidas
  const porHuella = new Map<string, FichaFila[]>()
  for (const f of vivas) if (f.huella && !vencidas.has(f.id)) (porHuella.get(f.huella) ?? porHuella.set(f.huella, []).get(f.huella)!).push(f)
  for (const grupo of porHuella.values()) {
    if (grupo.length < 2) continue
    const orden = [...grupo].sort((a, b) => Number(PRIMARIOS.has(b.origen)) - Number(PRIMARIOS.has(a.origen)) || t(a.creado_en) - t(b.creado_en) || (a.id < b.id ? -1 : 1))
    for (const f of orden.slice(1)) plan.duplicados.push({ id: f.id, conservar_id: orden[0].id })
  }
  plan.vencidas = [...vencidas].map((id) => ({ id }))
  const retiradas = new Set([...plan.duplicados.map((d) => d.id), ...vencidas])
  plan.marcar_propias = vivas.filter((f) => PRIMARIOS.has(f.origen) && !f.propiedad && !retiradas.has(f.id)).map((f) => ({ id: f.id }))
  return plan
}

/** lo que un modelo escribió a partir de lo raspado: síntesis con enlace a la fila cruda (la revisión del manual y el juez toman la fuente cruda, no esto) */
export function provenanceDeSintesis(apifyRawId: string): { type: 'evidence'; source: 'agent_synthesis'; trust_level: 'untrusted'; respaldo_en: { tabla: 'apify_raw'; id: string } } {
  return { type: 'evidence', source: 'agent_synthesis', trust_level: 'untrusted', respaldo_en: { tabla: 'apify_raw', id: apifyRawId } }
}
