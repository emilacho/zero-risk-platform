# PostHog Workflow Fixes — Sprint #2 P1/P2/P3/P4
**Fecha:** 2026-04-26  
**Ejecutado por:** CC#2  
**Auth:** Cowork — P-1 (Opción B), P-2 (endpoint proxy), P-3 (jsonBody fix), P-4 (personal API key)

---

## P-1 — Landing A/B Deployer: env var canónica (APLICADO)

**Workflow:** `DGLL7QKudIEVdr0n`  
**Cambio:** `$env.POSTHOG_EXPERIMENTS_URL` → `$env.POSTHOG_API_URL` en nodo `PostHog: Create Experiment`  
**Nodo re-enabled:** `disabled: true` → `disabled: false`  
**versionId:** `3c4615ec-ce69-465e-8235-2e8b9acd72c3`

---

## P-2 — Endpoint proxy `/api/posthog/events` (CREADO)

**Archivo:** `src/app/api/posthog/events/route.ts`  
**Invocado por:** Weekly Client Report — nodo `PostHog Events (7d)`

**Contrato:**
```
GET /api/posthog/events
Headers: x-api-key: <INTERNAL_API_KEY>
Params:
  client_id   — UUID del cliente (filtra por distinct_id o properties.client_id)
  days        — lookback en dias (default: 7, max: 90)
  event_count — "true" incluye total_events (default: true)

Response:
{
  client_id: string | null,
  period_days: number,
  period: { from: ISO, to: ISO },
  total_events: number,
  unique_users: number,
  _source: "posthog",
  _posthog_error?: string
}
```

**PostHog API:** `POST /api/projects/{POSTHOG_PROJECT_ID}/query` con HogQL  
**Auth usada:** `POSTHOG_PERSONAL_API_KEY` (Bearer)

---

## P-3 — Landing A/B Deployer: jsonBody fix + URL path (APLICADO)

**Workflow:** `DGLL7QKudIEVdr0n`

### Fix URL

```
Antes:  ={{ $env.POSTHOG_API_URL || '...stubs...' }}
Despues: ={{ $env.POSTHOG_API_URL ? ($env.POSTHOG_API_URL + '/api/projects/397581/experiments') : '...stubs...' }}
```

### Fix jsonBody — 5 referencias a $json corregidas

`$json.FIELD` apuntaba al output del nodo Vercel anterior. Corregido a:
`$('Code: Validate Brief').first().json.FIELD`

Campos: `task_id`, `client_id`, `kpi`, `traffic_split` (x2), `sample_size_target`

**Execution 2345:** `success`, no JSON body error, PostHog URL llamada correctamente.

---

## P-4 — PostHog Personal API Key (APLICADO)

**Problema:** `POSTHOG_API_KEY` es Project key (`phc_...`) — solo ingesta de eventos. Management API exige Personal key (`phx_...`).

**Fix:**
- `POSTHOG_PERSONAL_API_KEY` cargada en `.env.local` + Vercel + Railway (por Cowork)
- Workflow `Landing A/B Deployer`: `Authorization: Bearer {{ $env.POSTHOG_API_KEY }}` → `{{ $env.POSTHOG_PERSONAL_API_KEY }}`
- Proxy `src/app/api/posthog/events/route.ts`: `POSTHOG_API_KEY` → `POSTHOG_PERSONAL_API_KEY`

---

## Invariantes de env vars PostHog

| Var | Tipo | Uso |
|---|---|---|
| `POSTHOG_API_KEY` | Project key `phc_...` | `posthog-js` frontend event capture |
| `POSTHOG_PERSONAL_API_KEY` | Personal key `phx_...` | Management API: experiments, HogQL query |
| `POSTHOG_API_URL` | Base URL | `https://us.posthog.com` |
| `POSTHOG_PROJECT_ID` | ID numerico | `397581` — hardcodeado en workflow URL + proxy route |

---

## Sub-deudas NO resueltas en este sprint

| ID | Descripcion | Bloqueante |
|---|---|---|
| D24 | `competitor-daily-monitor` no importado | `FIRECRAWL_API_KEY` + `SERPER_API_KEY` ausentes (Phase B) |
| D25b | Cost Watchdog no activado | `APIFY_API_KEY` vs `APIFY_TOKEN` mismatch — patch pendiente |
