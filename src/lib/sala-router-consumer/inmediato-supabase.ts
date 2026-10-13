/**
 * r79 · D2 · UNA sola forma de pedir el despacho inmediato de un sobre recién escrito, para todas las puertas que escriben en la libreta
 * (`/api/sala/intake` y el `autoproducir` de la cadena, que antes entraba directo y esperaba siempre al reloj de 15 min).
 * Corre en segundo plano (waitUntil): quien llama no espera ni se rompe si falla. El reloj de 15 min sigue de respaldo (el reclamo impide el doble despacho).
 */
import { waitUntil } from '@vercel/functions'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventLogStorage } from '@/lib/sala-event-log'
import { despacharAlEntrar, isInmediatoEnabled } from './inmediato'
import { wireCapSpendQuerySupabase, wireCapUsdQuerySupabase } from './cap-spend-query'

export function programarDespachoInmediato(a: { supabase: SupabaseClient; storage: EventLogStorage; tenant_id: string; event_id: string; stream_id: string; origen: string }): 'programado' | 'apagado' {
  if (!isInmediatoEnabled()) return 'apagado'
  try {
    waitUntil(
      despacharAlEntrar({
        storage: a.storage, tenant_id: a.tenant_id, event_id: a.event_id, stream_id: a.stream_id,
        cap_spend_query: wireCapSpendQuerySupabase(a.supabase, { strategy: 'tenant_window' }),
        cap_usd_query: wireCapUsdQuerySupabase(a.supabase),
      }).then((r) => {
        // un despacho que no sale deja huella en el registro de la función (antes se descartaba mudo)
        if (!r.intentado || !r.tick || r.tick.processed === 0) console.warn(`[${a.origen}] despacho inmediato sin salir · evento ${a.event_id} · ${r.motivo ?? 'sin_sobre_en_el_hilo'} ${r.detalle ?? ''}`.trim())
      }).catch(() => undefined),
    )
    return 'programado'
  } catch {
    return 'apagado'
  }
}
