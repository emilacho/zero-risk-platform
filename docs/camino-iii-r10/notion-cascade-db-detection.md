# Detección · 3 DB IDs Notion del cascade · worker `LyVoKcrypS5uLyuu` · §144 · CC#2

**Estado:** detectado · documentado · **NO se crearon DBs** (lo confirma Emilio).
**Worker:** `LyVoKcrypS5uLyuu` = workflow n8n "Zero Risk Client Onboarding E2E v2" (trigger Webhook Deal Won).

---

## Cómo llega a Notion

El cascade no escribe a Notion directo. Sus 2 nodos Notion son `httpRequest` que llaman a endpoints de la plataforma:

```
Webhook Deal Won (LyVoKcrypS5uLyuu)
  → Validate Deal Data
  → "Create Notion Client Workspace" → POST /api/notion/create-client-workspace
  → "Build Success Plan Template"
  → "Create Success Plan in Notion"  → POST /api/notion/create-success-plan
        ↓ (row-writers dual-mode · src/lib/notion-db-rows.ts)
   Clientes · Campañas · Reportes
```

Los IDs no están hardcodeados en el workflow — viven en env vars de la plataforma (`src/lib/notion-db-rows.ts`).

---

## Las 3 bases de datos + IDs configurados

Cada DB tiene **dos** IDs configurados: el database ID (page-based writers) y el data source ID (row writers · API Notion 2025 data sources).

| DB | database ID (`NOTION_*_DB_ID`) | data source ID (`NOTION_*_DATA_SOURCE_ID`) | ¿real o placeholder? |
|---|---|---|---|
| **Clientes**  | `78d82ba8-…` (len 36) | `dac8d61b-…` (len 36) | **real** · UUID hex válido · sin marcadores stub |
| **Campañas**  | `5f5c440f-…` (len 36) | `38322e08-…` (len 36) | **real** · UUID hex válido |
| **Reportes**  | `0e2b0b1c-…` (len 36) | `7ec5c20f-…` (len 36) | **real** · UUID hex válido |

`NOTION_API_KEY` presente (`ntn_50…` · len 50). Los 6 IDs son UUID de 36 chars, hex, sin patrones placeholder (`stub`/`xxxx`/`0000`/`your-`). **Lucen reales**, no placeholders.

---

## Gap detectado (§148 · reportar, no improvisar)

1. **Drift de nombres env · RESUELTO 2026-06-27.** El diagnóstico de `src/app/api/notion/sync-report/route.ts` listaba `NOTION_DATABASE_CLIENTS` / `NOTION_DATABASE_CAMPAIGNS` / `NOTION_DATABASE_WEEKLY` (no leídas en ningún `process.env`), mientras los row-writers reales (`src/lib/notion-db-rows.ts`) consumen `NOTION_CLIENTS_DATA_SOURCE_ID` / `NOTION_CAMPAIGNS_DATA_SOURCE_ID` / `NOTION_REPORTS_DATA_SOURCE_ID` (fuente de verdad en `.env.local`). Unificado: el diagnóstico ahora lista los `*_DATA_SOURCE_ID` reales. (`WEEKLY`→`REPORTS`/Reportes).
2. **Prod no verificado.** Los valores están en `.env.local` (local). Canon §6 marca "Vercel pending Emilio post-merge". NO verifiqué si los 6 IDs están poblados en Vercel prod — la tarea era solo detectar.

**Acción Emilio:** confirmar que las 3 DBs existen en el workspace Notion con esos IDs y que las env vars de Vercel están pobladas con la convención de nombres correcta. NO creé nada.
