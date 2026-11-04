#!/bin/bash
# Corre escenarios uno tras otro y deja por cada uno su `resumen.txt`. Uso: SECO_RAIZ=… SECO_N8N_LOCAL=… bateria.sh <carpeta de escenarios> nombre1 nombre2 …
# El camino usa el cuerpo con mesa, análisis y chequeo de forma; con SECO_CUERPO_BOTON=1 usa el cuerpo real del botón.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
ESC="$1"; shift
VER="$SECO_N8N_LOCAL/ver.mjs"
DATOS="$SECO_RAIZ/n8n-datos"
quieto() {
  local i q=0
  for i in $(seq 1 ${1:-60}); do
    if node "$VER" "$DATOS" --lista 2>/dev/null | grep -qE "'running'|'new'"; then q=0; else q=$((q + 1)); fi
    [ "$q" -ge 4 ] && return 0
    ping -n 4 127.0.0.1 >/dev/null
  done
  return 1
}
for n in "$@"; do
  quieto 20 || echo "aviso: quedó algo corriendo antes de $n"
  ULT=$(node "$VER" "$DATOS" --lista 2>/dev/null | sed -n 4p | awk '{print $4}')
  bash "$AQUI/correr.sh" "$n" "$ESC/$n.json" '"plan_v3":true' > /dev/null
  ping -n 4 127.0.0.1 >/dev/null
  quieto 60 && TERMINO=si || TERMINO=no
  S="$SECO_RAIZ/$n/resumen.txt"
  {
    echo "### $n · terminó de correr: $TERMINO · escenario: $(cat "$ESC/$n.json")"
    node "$AQUI/resumen.mjs" "$SECO_RAIZ/$n"
    echo '--- ejecuciones (más nueva arriba)'
    node "$VER" "$DATOS" --lista 2>/dev/null | sed -n 4,8p | cut -c1-120
    echo '--- últimos pasos del plan'
    node "$VER" "$DATOS" --cola 12 2>/dev/null | cut -c1-200
    for t in plan_corridas mesa_encargos finanzas_encargos esperas_del_dueno jefatura_revisiones plan_compuertas; do
      echo "--- $t"
      curl -s "localhost:4100/__tabla?t=$t" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{for(const f of JSON.parse(s||'[]'))console.log(JSON.stringify({estado:f.estado,motivo:f.motivo,gasto_usd:f.gasto_usd,resultado:f.resultado,marcas:f.marcas,version:f.version}))})"
    done
    curl -s "localhost:4100/__estado" | cut -c1-300
    echo
  } > "$S" 2>&1
  echo "$n listo"
done
