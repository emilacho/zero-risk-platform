/**
 * CANDADO DEL TIC · un solo tic a la vez · CC#1 · 2026-09-30 · paquete del repartidor · pieza ①.
 *
 * Medido el 27-sep: con la base lenta el tic (cada 3 min) no termina y el siguiente arranca ENCIMA, cada uno con su conexión abierta · la caída se alimenta sola.
 * El candado es un ARRENDAMIENTO en la base (función atómica `sala_router_try_lock`): quien lo toma corre; quien no, sale al instante con «tic en curso». Vence solo (TTL) por si el dueño muere.
 * Sin la base no hay candado ⇒ el tic no corre: es lo correcto (sin base no hay nada que despachar) y NO se apila porque el tope de tiempo (pieza ②) corta la espera.
 */
import { randomUUID } from 'node:crypto'

export type TomaDelCandado = { ok: true; holder: string } | { ok: false; motivo: string }

export interface CandadoDelTic {
  tomar(ttlMs: number): Promise<TomaDelCandado>
  soltar(holder: string): Promise<void>
}

/** Candado de prueba: mismo contrato, en memoria · vence por TTL igual que el real */
export class CandadoEnMemoria implements CandadoDelTic {
  private dueno: { holder: string; vence: number } | null = null
  constructor(private readonly ahora: () => number = Date.now) {}
  async tomar(ttlMs: number): Promise<TomaDelCandado> {
    const t = this.ahora()
    if (this.dueno && this.dueno.vence > t) return { ok: false, motivo: 'tic_en_curso' }
    const holder = randomUUID()
    this.dueno = { holder, vence: t + ttlMs }
    return { ok: true, holder }
  }
  async soltar(holder: string): Promise<void> {
    if (this.dueno?.holder === holder) this.dueno = null
  }
}

type ClienteRpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> }

/** El real: dos funciones SQL atómicas (ver la migración `sala_router_tick_lock`) */
export function candadoEnSupabase(supabase: ClienteRpc): CandadoDelTic {
  return {
    async tomar(ttlMs) {
      const holder = randomUUID()
      const { data, error } = await supabase.rpc('sala_router_try_lock', { p_holder: holder, p_ttl_seconds: Math.max(1, Math.ceil(ttlMs / 1000)) })
      if (error) return { ok: false, motivo: `candado_no_disponible · ${error.message}` }
      return data === true ? { ok: true, holder } : { ok: false, motivo: 'tic_en_curso' }
    },
    async soltar(holder) {
      try {
        await supabase.rpc('sala_router_unlock', { p_holder: holder })
      } catch {
        /* vence solo por TTL */
      }
    },
  }
}
