-- Archive smoke + dupe clients from `public.clients` · soft-delete via
-- `archived_at` timestamp. Dashboard data layer filters
-- `archived_at IS NULL` so only operational clients (Náufrago + Seg
-- Ind Pérez) surface in production views.
--
-- Decision · Sprint 6 cleanup batch · CC#1 dispatch
-- CC1-DASHBOARD-PHASE-4-5-9-PARALELO STEP 1a · 2026-05-17.
-- Audit: hard-delete is reversible only via Supabase point-in-time
-- restore. Soft archive keeps full audit trail.

alter table public.clients
  add column if not exists archived_at timestamptz;

alter table public.clients
  add column if not exists archived_reason text;

create index if not exists clients_archived_at_idx
  on public.clients (archived_at)
  where archived_at is null;

-- Archive · 11 rows (6 smoke runs + 4 dupes "Zero Risk Ec." + 1
-- "_smoke_cc1_clients_upsert_sanity" placeholder). Náufrago
-- (d69100b5-8ad7-4bb0-908c-68b5544065dc) and Seg Industrial Pérez
-- (5c2d2dd5-a49e-4da3-87c3-03b504b734f6) stay live.

update public.clients
   set archived_at = now(),
       archived_reason = 'smoke-cleanup-2026-05-17 · sprint-6 batch'
 where id in (
   '300ef1fb-7a4b-4680-91f5-d6e9ce0e582d',  -- Cliente Smoke FIX-8B R1 (13 inv but is smoke per dispatch)
   '45fda631-cf6b-4b35-8a0d-ad9b3257b55c',  -- Cliente Smoke LOTE-C R7
   '6fc1c1b7-e66b-4f30-87f5-6aeb8e9d04ec',  -- Cliente Smoke LOTE-C R6
   '45d98a7e-e19a-4c19-9b8d-7e1240c2a537',  -- Cliente Smoke UGK3-WIRE R5
   '8f3d9f59-f75c-4546-a9a5-bcfaa55deda8',  -- Cliente Smoke MASTER-JOURNEY R4
   '19021185-a662-4098-87d4-a6ff6b55a409',  -- Cliente Smoke E2E Final R3
   'ce7fa586-249a-4201-a20a-7de48ecc5261',  -- Cliente Smoke E2E Final
   '6870aaca-3fcc-4a4c-be8b-98a64edafa98',  -- Zero Risk Ec. Seg. Ind. (dupe)
   '5d05f634-2edd-4d71-bdc2-47a261443ae1',  -- _smoke_cc1_clients_upsert_sanity
   '644bbe7f-e6d7-43dc-af95-79784eb5df59',  -- Zero Risk Ec. Seg. Ind. (dupe · slug zero-risk)
   '07f88bef-8054-4d09-9102-46bc36177c2f'   -- Zero Risk Ec. Seg. Ind. (dupe · seguridad-industrial-p-rez)
 );

-- Encoding fix · row "Seguridad Industrial PÃ©rez" → "Seguridad
-- Industrial Pérez" (UTF-8 mojibake from earlier insert via
-- non-utf8 client). Verified row id 5c2d2dd5 is the canonical
-- active client to KEEP.

update public.clients
   set name = 'Seguridad Industrial Pérez'
 where id = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
   and name <> 'Seguridad Industrial Pérez';

comment on column public.clients.archived_at is
  'Soft-delete · NULL means active. Set on smoke-cleanup 2026-05-17.';
comment on column public.clients.archived_reason is
  'Why archived · audit string · e.g. "smoke-cleanup-2026-05-17 · sprint-6 batch".';
