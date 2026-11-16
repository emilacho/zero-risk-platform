/**
 * Las cuentas OFICIALES de Meta de cada cliente (16-nov · GO Lenovo «conectar redes de Náufrago» · CC3).
 *
 * Viven en la ficha del cliente, no en variables globales: una variable global sirve para UN cliente y el sistema es agnóstico.
 *
 *   clients.config.redes_oficiales = {
 *     meta: { pagina_facebook: "<id numérico de la página>", instagram_id: "<id de la cuenta de Instagram profesional>" },
 *     correo?: "…",
 *     publicacion_real?: true   // SOLO con firma de Emilio; sin esto, todo queda en ensayo
 *   }
 *
 * Los usuarios públicos (@cuenta) siguen en `config.apify.own_handles`, donde ya los leen los raspadores y las métricas.
 *
 * El token es el del usuario del sistema de la agencia (`META_ACCESS_TOKEN`). Facebook NO acepta ese token para la página:
 * hay que pedirle a Meta el token DE LA PÁGINA con él (`GET /<pagina>?fields=access_token`). Instagram sí lo acepta.
 */

export const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0'

export interface CuentasMeta {
  pagina_facebook: string | null
  instagram_id: string | null
  publicacion_real: boolean
}

const obj = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}

/** Un id de Meta es solo dígitos (los de página y de Instagram tienen 15 a 17). Cualquier otra cosa = sin cuenta. */
export function idDeMeta(v: unknown): string | null {
  const t = typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : typeof v === 'string' ? v.trim() : ''
  return /^\d{5,25}$/.test(t) ? t : null
}

/** PURO · lee las cuentas oficiales de la config de un cliente. `publicacion_real` solo vale con un `true` explícito. */
export function cuentasMetaDe(config: unknown): CuentasMeta {
  const r = obj(obj(config).redes_oficiales)
  const m = obj(r.meta)
  return {
    pagina_facebook: idDeMeta(m.pagina_facebook),
    instagram_id: idDeMeta(m.instagram_id),
    publicacion_real: r.publicacion_real === true,
  }
}

/** ¿Ensayo o de verdad? Solo un `dry_run: false` EXPLÍCITO pide publicar; y aun así, solo si la ficha tiene la publicación real encendida. */
export type Modo = { modo: 'ensayo' } | { modo: 'real' } | { modo: 'negado'; motivo: 'publicacion_real_apagada' }
export function decidirModo(dryRun: unknown, cuentas: CuentasMeta): Modo {
  if (dryRun !== false) return { modo: 'ensayo' }
  return cuentas.publicacion_real ? { modo: 'real' } : { modo: 'negado', motivo: 'publicacion_real_apagada' }
}

type Base = { from(tabla: string): any }

export type LecturaCuentas =
  | { ok: true; cuentas: CuentasMeta }
  | { ok: false; motivo: 'cliente_no_existe' | 'no_se_pudo_leer_la_ficha'; detalle?: string }

/** Lee la ficha del cliente. Un error de la base NO se confunde con «no existe». */
export async function leerCuentasMeta(base: Base, clientId: string): Promise<LecturaCuentas> {
  const { data, error } = await base.from('clients').select('id, config').eq('id', clientId).maybeSingle()
  if (error) return { ok: false, motivo: 'no_se_pudo_leer_la_ficha', detalle: String(error.message ?? error).slice(0, 200) }
  if (!data) return { ok: false, motivo: 'cliente_no_existe' }
  return { ok: true, cuentas: cuentasMetaDe((data as { config?: unknown }).config) }
}

/** El token y el nombre de la página, pedidos con el token del sistema. Solo lectura. */
export async function tokenDePagina(
  paginaId: string,
  tokenSistema: string,
): Promise<{ ok: true; token: string; nombre: string | null } | { ok: false; detalle: string }> {
  try {
    const r = await fetch(
      `${META_GRAPH_BASE}/${paginaId}?fields=access_token,name&access_token=${encodeURIComponent(tokenSistema)}`,
      { method: 'GET', signal: AbortSignal.timeout(20_000) },
    )
    const j = (await r.json().catch(() => ({}))) as { access_token?: string; name?: string; error?: { message?: string } }
    if (!r.ok || !j.access_token) return { ok: false, detalle: j.error?.message || `status_${r.status}` }
    return { ok: true, token: j.access_token, nombre: j.name ?? null }
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) }
  }
}

/** Comprueba que la cuenta de Instagram se puede leer con el token del sistema. Solo lectura. */
export async function cuentaInstagram(
  igId: string,
  tokenSistema: string,
): Promise<{ ok: true; usuario: string | null } | { ok: false; detalle: string }> {
  try {
    const r = await fetch(`${META_GRAPH_BASE}/${igId}?fields=username&access_token=${encodeURIComponent(tokenSistema)}`, {
      method: 'GET',
      signal: AbortSignal.timeout(20_000),
    })
    const j = (await r.json().catch(() => ({}))) as { id?: string; username?: string; error?: { message?: string } }
    if (!r.ok || !j.id) return { ok: false, detalle: j.error?.message || `status_${r.status}` }
    return { ok: true, usuario: j.username ?? null }
  } catch (e) {
    return { ok: false, detalle: e instanceof Error ? e.message : String(e) }
  }
}
