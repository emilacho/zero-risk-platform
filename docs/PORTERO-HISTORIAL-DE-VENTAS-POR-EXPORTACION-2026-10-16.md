# Historial de ventas por exportación (CSV) del Back Office de Loyverse (16-oct-2026)

Encargo: `raw/tasks/2026-10-16-ENCARGO-LENOVO-CC-CEREBRO-loyverse-historial-csv.md` (punto 1). Firma de Emilio: «no voy a ampliar el plan de Loyverse; yo entro a la app y veo todos los meses».

## Por qué
La API del plan del cliente responde `402 PAYMENT_REQUIRED` a todo pedido de recibos de más de 31 días. El Back Office sí muestra y **exporta CSV** por rango de fechas. Esto convierte esos CSV en las **mismas fichas por mes** que arma el brazo de propios (`metrica:loyverse:<ingreso|tickets|ticket_promedio|dias_y_horas|items>:<AAAA-MM>`), solo ingresos.

## Qué exportar (Emilio) y dónde dejarlo
Carpeta: `raw/entrada/loyverse/` (vault). Del Back Office → Reportes, rango de los últimos 12 meses, botón de exportar CSV:
1. **Resumen de ventas**, agrupado **por día** (obligatorio: da ingreso y reembolsos por día). Un archivo con los 12 meses sirve.
2. **Recibos** (si puede): un archivo por mes o uno solo; da tickets, horas fuertes y anulados.
3. **Ventas por artículo**: este reporte no se parte solo por mes → **un archivo por mes**, con el mes en el nombre: `ventas-por-articulo-2026-03.csv`. Un archivo de varios meses se guarda como «ítems del rango» (no se reparte entre meses).
No hace falta renombrar los otros. Español o inglés, coma o punto y coma: se reconocen solos.

## Qué hace el importador (`brazos/exportacion-loyverse.ts` + `scripts/ops/importar-ventas-loyverse-csv.ts`)
- **Reconoce la forma por las columnas** (recibos · resumen por día · por artículo), no por el nombre del archivo; lo que no reconoce lo declara y lo deja donde está.
- **Solo lee columnas de una lista blanca** (fecha, hora, número y tipo de recibo, estado, importes, cantidades, ítem). Nombres, teléfonos y correos de clientes **no se leen ni se guardan**; las columnas de costo y ganancia tampoco: **solo ingresos**.
- **Un mes se archiva solo si el archivo lo cubre entero**; los parciales (el primero del rango, por ejemplo) se declaran y no se archivan. El **mes en curso nunca** se importa (lo lee la API cada día) y un mes ya archivado no se reescribe.
- **Elige la columna de ingreso comparando con la API** en los días que se solapan (la API da el total cobrado del recibo): total cobrado / ventas netas / ventas brutas. Dice cuál eligió y cuántos días coinciden; si ninguna coincide o no hay días en común, lo declara.
- **Si el resumen por día no trae el número de tickets**, no los inventa: la ficha lo dice y no escribe tickets ni ticket promedio.
- **Misma forma de ficha que la API**: mismas claves por mes, `fuente: loyverse_exportacion`, `observado_en` = fecha de la exportación, sello «tomado de la exportación del Back Office de Loyverse del <fecha> (no de la API)». Repetir la importación no duplica (misma `ref`).
- **Ítems**: un archivo por artículo de un mes entero se une a ese mes; de otro rango queda como ficha de rango (`metrica:loyverse:items:rango:<desde>_<hasta>`). Los nombres pasan por el mapa de ítems por sinónimo.
- Al terminar mueve los CSV reconocidos a `raw/entrada/loyverse/procesados/` (no borra).

## Cómo correrlo
```
npx tsx scripts/ops/importar-ventas-loyverse-csv.ts             # en seco: lee, valida contra la API, muestra qué escribiría
npx tsx scripts/ops/importar-ventas-loyverse-csv.ts --escribir  # escribe y mueve a procesados/
# opciones: --dir=<carpeta> · --exportado=AAAA-MM-DD · --sin-api
```
US$ 0 (lectura de la API de los últimos 30 días; ningún modelo).

## Lo que NO está probado
Se probó con CSV **sintéticos** (español e inglés; coma, punto y coma, tabulador). **Todavía no con un CSV real del Back Office**: los nombres exactos de las columnas de Loyverse pueden variar por idioma o versión. Si un archivo real no se reconoce, el importador lo dice (columnas no reconocidas) y se agrega el sinónimo de columna a `CABECERAS` — un cambio de una línea.
