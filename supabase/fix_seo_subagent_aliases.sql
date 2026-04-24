-- Zero Risk — Fix SEO sub-agent slug aliases
--
-- Symptom: smoke test resolves `content-strategist`, `technical-seo`,
-- `geo-optimization`, `backlink-strategist` to 404 because the registry
-- has them under `seo-*` slugs with only underscore-style aliases.
--
-- Fix: append the hyphenated forms to each row's `aliases`, so either
-- short name works end-to-end.
--
-- Safe to re-run (checks NOT ANY before append).

UPDATE managed_agents_registry
SET aliases = array_append(aliases, 'content-strategist')
WHERE slug = 'seo-content-strategist'
  AND NOT ('content-strategist' = ANY(aliases));

UPDATE managed_agents_registry
SET aliases = array_append(aliases, 'technical-seo')
WHERE slug = 'seo-technical'
  AND NOT ('technical-seo' = ANY(aliases));

UPDATE managed_agents_registry
SET aliases = array_append(aliases, 'geo-optimization')
WHERE slug = 'seo-geo-optimization'
  AND NOT ('geo-optimization' = ANY(aliases));

UPDATE managed_agents_registry
SET aliases = array_append(aliases, 'backlink-strategist')
WHERE slug = 'seo-backlink-strategist'
  AND NOT ('backlink-strategist' = ANY(aliases));

-- Verify
SELECT slug, aliases
FROM managed_agents_registry
WHERE slug LIKE 'seo-%'
ORDER BY slug;
