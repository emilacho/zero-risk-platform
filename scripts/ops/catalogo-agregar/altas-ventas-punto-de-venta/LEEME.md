# Ventas del punto de venta como dato (plan v3) · altas de catálogo · CC#1 · 16-oct

**Regla de Emilio (16-oct):** el tipo es «ventas del punto de venta», NO «Loyverse». El nombre del proveedor es un comodín (`metrica:*:ingreso:*`): mañana puede ser otro punto de venta si su brazo escribe `metrica:<proveedor>:<ingreso|tickets|ticket_promedio>:<período>`. La planeación y la oficina financiera piden las ventas al cerebro; NUNCA llaman a un punto de venta directo. Un cliente SIN fichas de ventas sale igual que hoy (sin error, sin bloqueo, sin dato inventado).

Tres filas de `plan_catalogo_tipos` (vía oficial `catalogo-agregar`, V12). Apagado: sin estas filas las fichas `metrica:<proveedor>:*` siguen contadas como «sin tipo» (= hoy).

| archivo | tipo_id | atributo del cerebro | unidad |
|---|---|---|---|
| `ventas_mes.json` | `ventas_mes` | `metrica:*:ingreso:*` | dinero (moneda de `clients.config.moneda`) |
| `tickets_mes.json` | `tickets_mes` | `metrica:*:tickets:*` | tickets |
| `ticket_promedio.json` | `ticket_promedio` | `metrica:*:ticket_promedio:*` | dinero |

El prefijo `:*` cubre los meses, `ultimos_30_dias` y las tiendas (`…:tienda-<slug>`; el total y cada tienda son datos distintos y NO se suman).

## Aplicar (CC#3, después de fusionar el código del lector; n8n 0/0, fuera de 12:00–14:00 y 00:00–00:30 UTC)
```
node scripts/ops/catalogo-agregar.mjs plan    --tabla tipos --archivo scripts/ops/catalogo-agregar/altas-ventas-punto-de-venta/ventas_mes.json
node scripts/ops/catalogo-agregar.mjs agregar --tabla tipos --archivo scripts/ops/catalogo-agregar/altas-ventas-punto-de-venta/ventas_mes.json --aplicar
# ídem tickets_mes.json y ticket_promedio.json
```
Cada `agregar --aplicar` respalda la clave, inserta `version = max + 1`, la deja vigente y lee de vuelta.

## Reversa
Las claves son nuevas (no hay versión anterior que revertir): se marcan NO vigentes; nada se borra:
```
UPDATE public.plan_catalogo_tipos SET vigente = false WHERE tipo_id IN ('ventas_mes','tickets_mes','ticket_promedio') AND vigente;
```
Sin filas vigentes el lector vuelve a contarlas «sin tipo» y el dato v1 queda como hoy. El cambio de código del lector (período desde `provenance_tag.datos`) no necesita reversa: solo actúa en fichas que declaran `desde` y `hasta`.
