# MC Portability Kit

Scripts dormantes para exportar datos de Mission Control y migrarlos a otra plataforma.
**No se ejecutan automáticamente. No afectan producción hasta que los llames manualmente.**

---

## Cuándo usar este kit

| Situación | Script |
|-----------|--------|
| MC se reinicia y pierde datos (Railway) | `export-mc-data.mjs` → `restore-to-supabase.mjs` |
| Migrar a otra plataforma (Notion, Linear…) | `export-mc-data.mjs` → `import-from-mc.mjs` |
| Backup antes de un deploy grande | `export-mc-data.mjs` |
| Rollback post-migración | `restore-to-supabase.mjs --file <snapshot>` |

---

## Flujo estándar de migración

```bash
# PASO 1 — Exportar datos actuales de MC
node scripts/mc-portability/export-mc-data.mjs

# PASO 2 — Ver qué adapters están disponibles
node scripts/mc-portability/import-from-mc.mjs --list

# PASO 3 — Dry-run al adapter elegido (sin escribir nada)
node scripts/mc-portability/import-from-mc.mjs --adapter notion

# PASO 4 — Ejecutar importación real
node scripts/mc-portability/import-from-mc.mjs --adapter notion --execute
```

---

## Scripts

### `export-mc-data.mjs`
Llama a la API de MC y guarda un snapshot JSON neutral.

```bash
node scripts/mc-portability/export-mc-data.mjs
# → scripts/mc-portability/exports/mc-export-<timestamp>.json
```

No requiere variables de entorno extra (usa MC_API_URL si está en .env.local, sino usa la URL de Railway por defecto).

---

### `import-from-mc.mjs`
Orquestador. Lee un snapshot y ejecuta el adapter elegido.

```bash
# Ver adapters disponibles
node scripts/mc-portability/import-from-mc.mjs --list

# Dry-run (default) — muestra qué se importaría
node scripts/mc-portability/import-from-mc.mjs --adapter <nombre>

# Usar snapshot específico
node scripts/mc-portability/import-from-mc.mjs --adapter linear --file exports/mc-export-2024-01-01.json

# Ejecutar importación real
node scripts/mc-portability/import-from-mc.mjs --adapter linear --execute
```

---

### `restore-to-supabase.mjs`
Rollback — restaura snapshot a las tablas `mission_control_*` en Supabase.

```bash
# Dry-run
node scripts/mc-portability/restore-to-supabase.mjs

# Ejecutar (requiere schema aplicado primero)
node scripts/mc-portability/restore-to-supabase.mjs --execute

# Restaurar snapshot específico
node scripts/mc-portability/restore-to-supabase.mjs --file exports/mc-export-2024-01-01.json --execute
```

**Prerrequisito**: aplicar `supabase/schema_mc_migration.sql` en el proyecto Supabase antes de correr con `--execute`.

---

## Adapters disponibles

| Adapter | Plataforma | Variables requeridas |
|---------|------------|----------------------|
| `jsonl` | Archivos locales | ninguna |
| `supabase` | Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `notion` | Notion | `NOTION_API_KEY`, `NOTION_TASKS_DB_ID` |
| `linear` | Linear | `LINEAR_API_KEY`, `LINEAR_TEAM_ID` |
| `plane` | Plane.so | `PLANE_API_KEY`, `PLANE_WORKSPACE_SLUG`, `PLANE_PROJECT_ID` |
| `asana` | Asana | `ASANA_ACCESS_TOKEN`, `ASANA_PROJECT_GID` |
| `github-projects` | GitHub Projects v2 | `GITHUB_TOKEN`, `GITHUB_PROJECT_ID` |

Todas las variables van en `.env.local` (nunca commitear).

---

## Agregar un nuevo adapter

1. Crear `scripts/mc-portability/adapters/to-<nombre>.mjs`
2. Exportar `META` con `name` y `description`
3. Exportar `async function run(snapshot, { dryRun })` que retorna `{ tasks, ... }`
4. El orquestador lo detecta automáticamente — no hay registro manual

```javascript
export const META = {
  name: 'mi-plataforma',
  description: 'Importa tasks a Mi Plataforma',
}

export async function run(snapshot, { dryRun = true } = {}) {
  const tasks = snapshot.tasks || []
  const created = []
  for (const task of tasks) {
    if (!dryRun) {
      // llamar API de mi-plataforma
    }
    created.push({ name: task.title })
  }
  return { tasks: created.length, created }
}
```

---

## Schema de Supabase (solo si usas adapter `supabase` o `restore`)

```bash
# Aplicar schema (solo una vez, en el proyecto Supabase)
# Pegar contenido de supabase/schema_mc_migration.sql en el SQL editor de Supabase
```

El schema crea tablas `mission_control_tasks`, `mission_control_inbox`, `mission_control_projects`.
No modifica tablas existentes del proyecto Zero Risk.

---

## Notas

- **Este kit no toca producción** hasta que corras un script manualmente con `--execute`.
- **MC Railway sigue siendo la fuente de verdad** hasta que decidas migrar.
- Los snapshots se guardan en `exports/` (ignorados por .gitignore).
- Los dry-runs no requieren credenciales de la plataforma destino.
