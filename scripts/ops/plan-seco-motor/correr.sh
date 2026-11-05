#!/bin/bash
# Una corrida del doble chequeo: reinicia SOLO el arnés (puerto 4100), enciende mesa y pausa en la base EN MEMORIA, y dispara el plan local.
# Uso: SECO_RAIZ=<carpeta> correr.sh <nombre> [escenario.json] [cuerpo extra JSON sin llaves]
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
NOMBRE="$1"; ESC="${2:-}"; EXTRA="${3:-}"
SALIDA="$SECO_RAIZ/$NOMBRE"
rm -rf "$SALIDA"; mkdir -p "$SALIDA"
curl -s -m 2 -o /dev/null localhost:4100/__apagar; ping -n 2 127.0.0.1 >/dev/null
ARG=()
if [ -n "$ESC" ]; then ARG=(--escenario "$ESC"); export SECO_ESCENARIO_JSON="$(cat "$ESC")"; fi
SECO_PLAN_FIJO="${SECO_PLAN_FIJO:-}" nohup node "$AQUI/arnes.mjs" --foto "$SECO_RAIZ/foto.json" --salida "$SALIDA" --moldes "$AQUI/moldes.mjs" "${ARG[@]}" > "$SALIDA/arnes.log" 2>&1 &
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 1 -o /dev/null localhost:4100/__estado && break; ping -n 2 127.0.0.1 >/dev/null; done
curl -s -XPATCH "localhost:4100/rest/v1/finanzas_config?id=eq.1" -H 'content-type: application/json' -d '{"mesa_de_estrategia":true,"pausa_al_dueno":true}' -o /dev/null
[ -z "${SECO_PREGUNTAS:-}" ] || curl -s -XPATCH "localhost:4100/rest/v1/finanzas_config?id=eq.1" -H "content-type: application/json" -d "{\"preguntas_slack\":\"$SECO_PREGUNTAS\"}" -o /dev/null
# El portero real de Náufrago corrió hoy (estado hecha, vigilante ok). Aquí no se copia su resumen: se siembra una fila mínima y fresca, solo en memoria, para pasar «cerebro listo».
AHORA="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; HOY="${AHORA%%T*}"
[ -n "${SECO_SIN_PORTERO:-}" ] || curl -s -XPOST "localhost:4100/rest/v1/cerebro_portero_corridas" -H 'content-type: application/json' -d "{\"client_id\":\"0a2ffbd4-957c-4315-a37f-b9e4fbbbb312\",\"dia\":\"$HOY\",\"estado\":\"hecha\",\"creado_en\":\"$AHORA\",\"resumen\":{\"unidades\":1,\"vigilante\":{\"ok\":true,\"revisado_en\":\"$AHORA\"}}}" -o /dev/null
# ventas de la caja: solo el atributo y su procedencia de las 12 métricas reales (foto aparte, fuera del repositorio); en memoria, nunca se toca el cerebro real
# la mesa de análisis encendida para este cliente, solo en memoria; y, si se pide, una carpeta con informes vigentes
[ -z "${SECO_ANALISIS:-}" ] || curl -s -XPATCH "localhost:4100/rest/v1/cadena_config?clave=eq.mesa_de_analisis" -H 'content-type: application/json' -d '{"valor":{"encendida":true,"clientes":["0a2ffbd4-957c-4315-a37f-b9e4fbbbb312"]}}' -o /dev/null
[ -z "${SECO_FICHAS:-}" ] || curl -s -XPOST "localhost:4100/rest/v1/cerebro_fichas" -H 'content-type: application/json' --data-binary "@$SECO_FICHAS" -o /dev/null
[ -z "${SECO_TROZOS:-}" ] || curl -s -XPOST "localhost:4100/rest/v1/client_brain_chunks" -H 'content-type: application/json' --data-binary "@$SECO_TROZOS" -o /dev/null
[ -z "${SECO_CAJA:-}" ] || curl -s -XPOST "localhost:4100/rest/v1/cerebro_fichas" -H 'content-type: application/json' --data-binary "@$SECO_CAJA" -o /dev/null
# cupo: gastado de las últimas 24 h y tope de la ficha, solo en memoria
[ -z "${SECO_GASTADO:-}" ] || curl -s -XPOST "localhost:4100/rest/v1/agent_invocations" -H 'content-type: application/json' -d "{\"agent_name\":\"siembra\",\"client_id\":\"0a2ffbd4-957c-4315-a37f-b9e4fbbbb312\",\"cost_usd\":$SECO_GASTADO,\"started_at\":\"$AHORA\",\"workflow_execution_id\":\"siembra\"}" -o /dev/null
[ -z "${SECO_TOPE_FICHA:-}" ] || curl -s "localhost:4100/__tabla?t=clients" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',async()=>{const c=JSON.parse(s).find(x=>x.id==='0a2ffbd4-957c-4315-a37f-b9e4fbbbb312');const r=await fetch('http://localhost:4100/rest/v1/clients?id=eq.'+c.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({config:{...c.config,spend_cap_usd:Number(process.env.SECO_TOPE_FICHA)}})});console.log('tope ficha',process.env.SECO_TOPE_FICHA,r.status)})"
CUERPO="{\"client_id\":\"0a2ffbd4-957c-4315-a37f-b9e4fbbbb312\",\"dry_run\":false,\"corrida\":\"seco-$NOMBRE\",\"con_analisis\":true,\"forzar\":true,\"validar_forma\":true${EXTRA:+,$EXTRA}}"
[ -z "${SECO_CUERPO_BOTON:-}" ] || CUERPO="{\"pedido\":\"plan de 90 dias\",\"dry_run\":false,\"plan_v3\":true,\"corrida\":\"seco-$NOMBRE\",\"forzar\":true,\"force_restart\":true,\"client_id\":\"0a2ffbd4-957c-4315-a37f-b9e4fbbbb312\",\"con_analisis\":true,\"validar_forma\":true,\"desde_worker\":\"tablero-aprobar-manual\",\"journey_id\":\"seco-$NOMBRE\"}"
echo "$CUERPO" > "$SALIDA/cuerpo.json"
curl -s -m 20 -w " · http %{http_code}\n" -XPOST localhost:5678/webhook/zero-risk/planeacion -H 'content-type: application/json' -H 'x-sala-dispatch-key: seco-local' -H 'x-api-key: seco-local' -d "$CUERPO"
