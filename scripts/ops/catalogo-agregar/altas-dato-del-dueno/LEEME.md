# Lo que el dueño confirmó, como dato del plan (plan v3) · alta de catálogo · CC#3 · 16-oct

**Hueco medido (seco del 16-oct, ejecución 181205):** el cerebro de Náufrago tiene 7 fichas `origen = 'dueno'`, `clase = 'dato_del_dueno'`, `atributo = 'dueno:<tema>'` (pauta 200/sem, plato 2,10, afluencia, píxel, WhatsApp, lista, sede). El `dato.v1` NO las traía: `tipoDe` no tenía fila de catálogo para ese atributo y las contaba «sin tipo» (148 datos, 0 del dueño). El redactor del plan no veía lo que el dueño ya había dicho.

**Qué agrega:** UNA fila de `plan_catalogo_tipos` (`dato_del_dueno`, atributo `dueno:*`, texto, frescura 90 días, acumula, no crítico). El normalizador ya sabe qué hacer con ellas (G4: «lo del dueño entra como `supuesto` rotulado»): sale con rótulo «indicado por el dueño…», citable.

**Lo que NO cambia:** sin esta fila, todo queda como hoy (se cuentan «sin tipo»). En `dry_run` siguen siendo `de_ensayo` y NO entran al pedido (regla 1 del §2). Un cliente sin fichas del dueño sale igual.

## Aplicar (CC#3, después de certificar; n8n 0/0, fuera de 12:00–14:00 y 00:00–00:30 UTC)
```
node scripts/ops/catalogo-agregar.mjs plan    --tabla tipos --archivo scripts/ops/catalogo-agregar/altas-dato-del-dueno/dato_del_dueno.json
node scripts/ops/catalogo-agregar.mjs agregar --tabla tipos --archivo scripts/ops/catalogo-agregar/altas-dato-del-dueno/dato_del_dueno.json --aplicar
```
Respalda la clave, inserta `version = max + 1`, la deja vigente y lee de vuelta.

## Reversa
La clave es nueva: se marca NO vigente; nada se borra:
```
UPDATE public.plan_catalogo_tipos SET vigente = false WHERE tipo_id = 'dato_del_dueno' AND vigente;
```
