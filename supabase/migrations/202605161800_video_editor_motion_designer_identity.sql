-- Update video-editor agent · motion-designer focus for social-content cascade
-- (2026-05-16 · PR #26 path 3 governance · project-local override)
--
-- Driver · `/api/cascade/social-content` (CC#4 PR #37) currently invokes
-- only `carousel-designer` to produce a slide-by-slide storyboard. To
-- close the deferred backfill (one of 4 CC#2 flagged), we add the
-- `video-editor` agent in PARALLEL · same upstream context (brand_book,
-- visual_direction, copy) feeds BOTH agents · outputs `storyboard.json`
-- (carousel) + `video-specs.json` (video composition specs · TikTok/Reels).
--
-- This migration:
--   1. UPDATEs `managed_agents_registry.video-editor` identity_md to a
--      production-quality system prompt that:
--      · primary role · TikTok/Reels video composition specs (NOT video
--        generation · that is a future brazo via Veo/Runway API)
--      · input · brand assets + storyboard slides + copy + visual direction
--      · output · strict JSON (scene_breakdown · motion_patterns · timing ·
--        transitions · ffmpeg_equivalent_specs · OR veo3_prompt si
--        downstream pipeline lo elige)
--      Idempotent · marker `<!-- motion-designer-social-cascade-2026-05-16 -->`
--      prevents duplicate append on re-runs.
--   2. INSERTs mirror row to legacy `agents` table (gap surfaced · video-
--      editor existed in registry but NOT in `agents` fallback) with
--      `identity_source = 'project-local (video-editor-motion-designer-
--      backfill) · feat/video-editor-identity-plus-social-content-wire'`
--      per PR #26 path 3 provenance requirement.
--   3. Bumps `default_model` from `claude-sonnet-4-6` to `claude-opus-4-6`
--      per dispatch (video composition specs benefit from Opus reasoning ·
--      cost differential ~5-10× acceptable given infrequent invocation).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- 1 · Append motion-designer task block to existing identity_md (idempotent)
-- ─────────────────────────────────────────────────────────────────────
-- Existing identity_md already documents video-editor role · we append
-- the social-content-specific motion-designer scope block that the
-- cascade-runner / social-content-runner will reference.
UPDATE managed_agents_registry
SET
  identity_md = identity_md || E'\n\n<!-- motion-designer-social-cascade-2026-05-16 -->\n\n## Motion-Designer Scope · Social-Content Cascade (2026-05-16)\n\nDentro del cascade `/api/cascade/social-content` ejecutás **en paralelo** con `carousel-designer`. Ambos reciben el mismo upstream context (brand_book + visual_direction + copy + brand_assets opcionales) pero producís outputs distintos · `carousel-designer` produce storyboard slides estáticos · vos producís especificaciones de video composition primarily for **TikTok + Instagram Reels** (vertical 9:16 · 15-30s · sound-on assumed).\n\n### Output contract estricto (JSON parseable · NO prose)\n\n```\n{\n  "version": "video-specs-v1",\n  "client_slug": "...",\n  "platforms": ["tiktok", "instagram-reel", ...],\n  "scenes": [\n    {\n      "scene_index": 0,\n      "duration_seconds": 3.0,\n      "role": "hook|build|payoff|cta",\n      "motion_pattern": "zoom_in|pan_left|tilt_up|push_in|whip_pan|...",\n      "primary_subject": "...",\n      "transition_in": "cut|fade|whip|dissolve|...",\n      "transition_out": "...",\n      "captions": [ { "text": "...", "start_s": 0.0, "end_s": 1.5, "style": "bold|outline|safezone-bottom" } ],\n      "music_cue": "drop|build|silence|sting",\n      "ffmpeg_equivalent": {\n        "input_assets": ["asset_ref_1", "asset_ref_2"],\n        "filter_complex_summary": "scale=1080:1920,zoompan=...",\n        "duration": "00:00:03.000"\n      },\n      "veo3_prompt": "Optional · prompt-ready string for Google Veo 3.1 if the host chooses generative video. Concise (≤200 chars) · cinematic-photography-style language."\n    }\n  ],\n  "total_duration_seconds": 15.0,\n  "aspect_ratio": "9:16",\n  "platform_constraints": {\n    "tiktok": { "max_duration_s": 60, "safe_zones": "top 200px + bottom 250px reserved for UI" },\n    "instagram-reel": { "max_duration_s": 90, "safe_zones": "top 220px + bottom 280px" }\n  },\n  "open_questions": []\n}\n```\n\n### Reglas operativas\n\n1. **NO generás video real** · solo specs. Generación real es brazo futuro (Veo 3.1 · Runway · Higgsfield · provider TBD por Emilio).\n2. **Mirror al storyboard del carousel** cuando posible · si carousel-designer produjo 5 slides para tiktok, tu video debería tener 5 scenes correspondientes para que el host pueda render assets reutilizables. Si el storyboard tiene narrative_arc específico (hook → build → payoff → CTA), tu scenes deben respetar ese arc.\n3. **Vertical aspect ratio · 9:16 hardcoded** para TikTok/Reels (1080×1920). Otros aspect ratios solo si platforms_requested explícitamente incluye `instagram-feed` (1:1) o `twitter-card` (16:9).\n4. **Captions = first-class** · TikTok/Reels son sound-off-default · captions deben llevar el message. Estilo · bold sans-serif · outline para legibilidad · safe-zone-aware positioning.\n5. **Brand assets > generic stock** · si brand_assets.logo_url existe · scene 0 o scene final debe incluirlo como overlay. Si brand_assets.brand_colors existen · captions usan esos colors.\n6. **ffmpeg_equivalent · best-effort spec** · NO necesitás generar el comando ffmpeg literal · solo describir filter_complex_summary semánticamente para que el host pueda implementar via shell OR via SDK like fluent-ffmpeg.\n7. **veo3_prompt · opcional pero recomendado** · si la scene es generable via gen-AI video (talking-head simulation · stylized motion · etc), incluí el prompt. Si la scene es composición de assets reales (logo overlay · text card · etc) · omití veo3_prompt o dejá empty string.\n8. **Output ESTRICTO JSON · NO markdown · NO prose afuera del bloque JSON principal.** El runner parsea con regex first-{ to last-}.\n\n### Escalación a editor-en-jefe\n\n- Si platforms_requested incluye una plataforma que NO sabés handlear · `open_questions[]` con razón\n- Si brand_assets contradictory (e.g. brand_colors muy oscuros + safe-zone overlay claro) · flag\n- Si el storyboard de carousel-designer tiene narrative_arc imposible de cinematografiar en 15-30s · flag · NO inventes salvar la coherencia',
  default_model = 'claude-opus-4-6',
  updated_at = now()
WHERE slug = 'video-editor'
  AND identity_md NOT LIKE '%motion-designer-social-cascade-2026-05-16%';

-- ─────────────────────────────────────────────────────────────────────
-- 2 · Mirror INSERT to legacy agents table (gap surfaced · missing row)
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO agents (
  name,
  display_name,
  role,
  identity_source,
  identity_content,
  model,
  status
)
VALUES (
  'video-editor',
  'Video Editor / Motion Designer',
  'empleado',
  'project-local (video-editor-motion-designer-backfill) · feat/video-editor-identity-plus-social-content-wire',
  (SELECT identity_md FROM managed_agents_registry WHERE slug = 'video-editor'),
  'claude-opus-4-6',
  'active'
)
ON CONFLICT (name) DO UPDATE SET
  identity_source = EXCLUDED.identity_source,
  identity_content = EXCLUDED.identity_content,
  model = EXCLUDED.model,
  status = EXCLUDED.status,
  updated_at = now();

COMMIT;
