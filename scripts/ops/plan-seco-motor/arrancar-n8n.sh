#!/bin/bash
# n8n local, misma versión que producción, con la red cortada. Importa las copias y las publica. Uso: arrancar-n8n.sh <carpeta de n8n instalado> <carpeta de flujos>
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
source "$AQUI/entorno.sh"
N8N="$1"; FLUJOS="$2"
export N8N_USER_FOLDER="$SECO_RAIZ/n8n-datos"
export N8N_BLOCK_ENV_ACCESS_IN_NODE=false N8N_DIAGNOSTICS_ENABLED=false N8N_VERSION_NOTIFICATIONS_ENABLED=false N8N_TEMPLATES_ENABLED=false N8N_PERSONALIZATION_ENABLED=false
export N8N_PORT=5678 N8N_HOST=localhost WEBHOOK_URL=http://localhost:5678/ N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=false DB_TYPE=sqlite
export EXECUTIONS_DATA_SAVE_ON_SUCCESS=all EXECUTIONS_DATA_SAVE_ON_ERROR=all EXECUTIONS_DATA_MAX_AGE=720
export NODE_OPTIONS="--require $SIN_RED --max-old-space-size=12288"
B="$N8N/node_modules/.bin/n8n"
for f in "$FLUJOS"/*.json; do
  case "$f" in *cambios.json) continue;; esac
  "$B" import:workflow --input="$f" 2>&1 | tail -1 | cut -c1-140
done
for f in "$FLUJOS"/*.json; do
  case "$f" in *cambios.json) continue;; esac
  id=$(basename "$f" .json)
  "$B" publish:workflow --id="$id" 2>&1 | tail -1 | cut -c1-140
done
exec "$B" start
