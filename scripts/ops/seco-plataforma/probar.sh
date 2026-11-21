#!/usr/bin/env bash
# Comprueba que el servidor en seco contesta con la semilla pedida y ejerce cada ruta. Uso: probar.sh <puerto> <client_id>
PUERTO="$1"; C="$2"; K=llave-del-seco-no-es-de-produccion; H='content-type: application/json'
p() { echo "--- $1 $2" | cut -c1-110; curl -s -m 120 -w ' [%{http_code}]\n' -H "$H" -H "x-api-key: $K" -d "$2" "localhost:$PUERTO$1" | cut -c1-480; }
p /api/planeacion/prevuelo "{\"client_id\":\"$C\",\"corrida\":\"r1\",\"dry_run\":true}"
p /api/planeacion/corrida "{\"accion\":\"abrir\",\"client_id\":\"$C\",\"corrida\":\"r1\",\"dry_run\":true}"
M=$(curl -s -H "$H" -H "x-api-key: $K" -d "{\"accion\":\"abrir\",\"client_id\":\"$C\",\"dry_run\":true,\"trabajo_id\":\"r1\",\"workflow_id\":\"w\",\"workflow_execution_id\":\"e\",\"semilla\":{\"manual_completo\":{},\"datos\":{}}}" "localhost:$PUERTO/api/planeacion/mesa")
echo "mesa: $M" | cut -c1-200
ID=$(echo "$M" | sed -nE 's/.*"encargo_id":"([^"]+)".*/\1/p')
p /api/planeacion/mesa "{\"accion\":\"avanzar\",\"encargo_id\":\"$ID\",\"workflow_id\":\"w\",\"workflow_execution_id\":\"e\"}"
p /api/finanzas/conversa "{\"accion\":\"abrir\",\"client_id\":\"$C\",\"dry_run\":true,\"workflow_id\":\"w\",\"workflow_execution_id\":\"e\",\"semilla\":{\"evento\":\"mensaje\",\"dias_activos_por_semana\":5}}"
p /api/finanzas/tablero "{\"accion\":\"leer\",\"client_id\":\"$C\"}"
p /api/finanzas/pausar '{"workflow_id":"w","workflow_execution_id":"e"}'
p /api/jefatura/revisiones "{\"artifact_type\":\"plan\",\"artifact_id\":\"a1\",\"client_id\":\"$C\",\"payload\":{\"texto\":\"x\"},\"dry_run\":true}"
curl -s "localhost:$PUERTO/__seco/estado" | cut -c1-900; echo
curl -s "localhost:$PUERTO/__seco/tabla/finanzas_encargos" | grep -o '"texto":"[^"]*"' | cut -c1-200
