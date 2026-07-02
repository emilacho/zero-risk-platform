# Onboarding report · n8n render workflow spec (Camino A · OAuth-as-user)

**Fecha:** 2026-07-02 · **Decisión:** Emilio · Camino A (OAuth-as-user · descartado service account por `storageQuotaExceeded` en Drive personal + Slides API deshabilitada).

El endpoint `POST /api/onboarding/report/[clientId]` produce el modelo de 6 slides + `slides_batch_requests` (array `requests` listo para la Slides API). Este workflow n8n hace el **render** con la credencial Google de Emilio (archivos propiedad suya · con cuota).

## Pre-requisitos (acción Emilio · 2 pasos)
1. **Habilitar Google Slides API** en el proyecto GCP de la cuenta (Google Cloud Console).
2. **Autorizar la credencial Google en n8n** (OAuth2 · cuenta Emilio · scopes Drive + Presentations).

## Trigger
- Webhook POST `{ client_id }` desde el nodo **Promote** del brand-book worker (`LyVoKcrypS5uLyuu`) cuando `client_brand_books` pasa 0→1. HTTP Request node (NO `fetch` en Code · postmortem regla H).

## Nodos (todos HTTP Request o nodos nativos Google · sin `fetch` en Code)
1. **Get report model** · HTTP Request → `POST {VERCEL}/api/onboarding/report/{{client_id}}` · header `x-api-key`. Devuelve `{ report, slides_batch_requests }`.
2. **Ensure client folder** · Google Drive node (o HTTP Drive v3) · buscar carpeta `report.client_name` bajo `DRIVE_CUENTAS_FOLDER_ID` · crear si no existe. Credencial OAuth Emilio.
3. **Create presentation** · Google Slides node · `presentations.create` · title `Reporte Onboarding {{client_name}} {{report_date}}`.
4. **Move to folder** · Google Drive node · `files.update` · `addParents = folderId` · `removeParents = root`.
5. **Populate slides** · Google Slides node · `presentations.batchUpdate` · `requests = {{ $json.slides_batch_requests }}` (viene tal cual del paso 1).
6. **Persist URL** · HTTP Request → Supabase `PATCH /rest/v1/clients?id=eq.{{client_id}}` · body `{ report_url: "https://docs.google.com/presentation/d/{{presentationId}}/edit" }`.

## Env vars (n8n Railway)
```
DRIVE_CUENTAS_FOLDER_ID=1WRmkLvj5CMdbohf4T2INsG0hn5Ebl88d
DRIVE_ROOT_FOLDER_ID=1J9Iag4qZaFEoG6MtP95qmmbhBLvi8Dwc
```
(La credencial Google va como **credential OAuth de n8n**, NO como env var · Camino A.)

## §148 evidencia requerida (post-autorización Emilio)
1. URL Google Slides generada (`https://docs.google.com/presentation/d/...`).
2. Archivo visible en `Drive/Cuentas/Náufrago/`.
3. `clients.report_url` poblado (query Supabase).

## Nota de estado
El endpoint (modelo + batch requests) está en producción-ready con CI verde. El render (este workflow) se aplica en n8n cuando Emilio complete los 2 pre-requisitos. La carpeta `Cuentas/Náufrago/` ya existe (creada en el smoke del service account · vacía).
