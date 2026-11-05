#!/bin/bash
# Variables comunes del doble chequeo. Ninguna llave real: todo apunta a esta máquina. Se usa con `source`.
export SECO_RAIZ="${SECO_RAIZ:?falta SECO_RAIZ}"
export SECO_RED_LOG="$SECO_RAIZ/red-bloqueada.log"
cp "$(dirname "${BASH_SOURCE[0]}")/sin-red.cjs" "$SECO_RAIZ/sin-red.cjs" # NODE_OPTIONS no admite espacios en la ruta
SIN_RED="$(cygpath -m "$SECO_RAIZ/sin-red.cjs")"
export SIN_RED
# la plataforma y n8n comparten estas direcciones
export ZERO_RISK_API_URL=http://localhost:4200
export FINANZAS_RUN_SDK_BASE=http://localhost:4100
export SUPABASE_URL=http://localhost:4100
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:4100
export SUPABASE_SERVICE_ROLE_KEY=seco-local
export NEXT_PUBLIC_SUPABASE_ANON_KEY=seco-local
export INTERNAL_API_KEY=seco-local
export SALA_DISPATCH_KEY=seco-local
export SALA_CALLBACK_API_KEY=seco-local
export SALA_INGRESS_API_KEY=seco-local
export SALA_CALLBACK_URL=http://localhost:4100/api/sala/callback
export SALA_INTAKE_URL=http://localhost:4100/api/sala/intake
export SLACK_WEBHOOK_URL=http://localhost:4100/slack
export SLACK_BOT_TOKEN=seco-local
export N8N_WEBHOOK_BASE=http://localhost:5678/webhook
export N8N_LOCAL_URL=http://localhost:5678
export N8N_BASE_URL=http://localhost:5678
# la plataforma pregunta a n8n por el arnés, que lee la base real del n8n local (el n8n local no tiene llave de API)
export SECO_PLATAFORMA_N8N=http://localhost:4100 N8N_API_KEY=seco-local
export OPENAI_API_KEY=seco-local JEFATURA_REVISOR_MODEL=gpt-simulado JEFATURA_REVISOR_PRECIO_ENTRADA_USD_M=5 JEFATURA_REVISOR_PRECIO_SALIDA_USD_M=30
