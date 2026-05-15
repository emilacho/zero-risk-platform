/**
 * Multi-path client_id resolver for /api/agents/run-sdk request bodies.
 *
 * Context · LOTE-C item 8 surfaced that 36/36 production rows in
 * `agent_invocations` landed with `client_id IS NULL`. Half of that gap is
 * the daemon side (fixed in mission-control/scripts/daemon/client-resolver.ts);
 * the other half is the Vercel→Railway proxy where n8n callers historically
 * nest `client_id` under different keys depending on which workflow shape
 * they're using:
 *
 *   - body.client_id               · canonical · what the v3 contract documents
 *   - body.metadata.client_id      · n8n workflows that wrap extras in metadata
 *   - body.client.id               · REST-ish callers (e.g. GHL webhook adapter)
 *   - body.extra.client_id         · workflows that bundle context in `extra`
 *
 * Returning `null` is fine · the proxy still forwards the request and the
 * agent_invocations row will simply have a null `client_id`, which is what
 * already happens today. The goal of this resolver is to RAISE the population
 * rate without changing any other contract.
 */

interface BodyShapeWithClientPaths {
  client_id?: unknown;
  clientId?: unknown;
  metadata?: { client_id?: unknown; clientId?: unknown } | null | undefined;
  client?: { id?: unknown } | null | undefined;
  extra?: Record<string, unknown> | null | undefined;
}

function nonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Resolve `client_id` from the request body using a multi-path fallback chain.
 *
 * Tries the paths below in order · first non-empty string wins:
 *   1. body.client_id              · documented contract path
 *   2. body.clientId               · camelCase alias accepted for n8n
 *   3. body.metadata.client_id     · nested metadata path
 *   4. body.metadata.clientId      · nested metadata camelCase
 *   5. body.client.id              · object-style identifier path
 *   6. body.extra.client_id        · workflow extras passthrough
 *   7. body.extra.clientId         · workflow extras camelCase
 *
 * Returns `null` if every path is empty.
 *
 * NB · this function is intentionally string-only · UUID validation is NOT
 * done here. The upstream `clients.id` column is UUID, but the resolver is
 * permissive so that callers carrying slugs (legacy) still get logged · a
 * downstream constraint violation surfaces cleanly via the Supabase insert
 * error in observability and is logged as a soft warning by the daemon.
 */
export function resolveClientIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as BodyShapeWithClientPaths;

  const direct = nonEmptyString(b.client_id) ?? nonEmptyString(b.clientId);
  if (direct) return direct;

  if (b.metadata && typeof b.metadata === "object") {
    const fromMeta =
      nonEmptyString(b.metadata.client_id) ?? nonEmptyString(b.metadata.clientId);
    if (fromMeta) return fromMeta;
  }

  if (b.client && typeof b.client === "object") {
    const fromClientObj = nonEmptyString((b.client as { id?: unknown }).id);
    if (fromClientObj) return fromClientObj;
  }

  if (b.extra && typeof b.extra === "object") {
    const fromExtra =
      nonEmptyString((b.extra as { client_id?: unknown }).client_id) ??
      nonEmptyString((b.extra as { clientId?: unknown }).clientId);
    if (fromExtra) return fromExtra;
  }

  return null;
}
