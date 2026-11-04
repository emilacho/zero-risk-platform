#!/bin/bash
# La plataforma REAL (next dev en 4200) contra la base en memoria, con la red cortada. Reinicia la anterior de este doble chequeo.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
source "$AQUI/entorno.sh"
powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$AQUI/parar-plataforma.ps1")" >/dev/null 2>&1
ping -n 3 127.0.0.1 >/dev/null
NODE_OPTIONS="--require $SIN_RED" nohup node ../node_modules/next/dist/bin/next dev -p 4200 > "$SECO_RAIZ/next.log" 2>&1 &
for i in $(seq 1 40); do curl -s -m 3 -o /dev/null localhost:4200/api/planeacion/mesa && break; ping -n 3 127.0.0.1 >/dev/null; done
tail -1 "$SECO_RAIZ/next.log" | cut -c1-100
