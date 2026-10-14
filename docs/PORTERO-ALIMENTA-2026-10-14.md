# El portero que ALIMENTA · construido APAGADO (14-oct)

Firma de Emilio 14-oct: «el portero es una máquina de alimentar información» · «el cerebro acumula con fecha; el portero razona qué reemplaza» · tope **US$ 1,50 por cliente y día**, todo diario · hasta 3 búsquedas propias por día · menciones de terceros con ensayo aparte (US$ 0,50) · **las oficinas buscan en el cerebro; el portero no empuja nada**.

## Ciclo
`descubrir` (plan unificado y diario, en código) → traer (Servicio de Apify, topes) → `filtrar` «es el cliente y es nuevo» (código; el modelo solo en la duda) → `juzgar` suma / reemplaza / nada / duda (modelo, con cita literal) → `archivar` (fecha y fuente, nada se borra) → puente al índice (misma biblioteca de consulta).

## Dónde vive
| Qué | Dónde |
|---|---|
| Lógica pura y rutas | `src/lib/portero-alimenta/` (fuera de `src/lib/cerebro/`: la vigilancia de la condición 1 prohíbe partir textos del PEDIDO allí; aquí se filtra material raspado) |
| Rutas | `POST /api/brain/alimentar/descubrir` (plan; `fase:'articulos'` = segunda tanda) · `POST /api/brain/alimentar/procesar` (filtrar → juzgar → archivar) |
| Migración (SIN APLICAR) | `supabase/migrations/202610141500_cerebro_portero_alimenta.sql` + reversa en `supabase/reversas/` (se niega a borrar con filas) |
| Flujo | `scripts/worker-staging/ogfq56oIEoHufFPM/` · `…-ANTES-2026-10-14.json` (respaldo) y `…-ARREGLADO-alimenta-2026-10-14.json` (reutiliza todo lo de hoy; INACTIVO; NO aplicado) |
| Seco real en solo lectura | `scripts/ops/portero-alimenta-seco.ts` |

## Interruptores (todos APAGADOS por omisión)
`PORTERO_ALIMENTAR` (maestro: sin él, las rutas contestan `{apagado:true}` sin leer ni escribir) · `PORTERO_PROPONER_BUSQUEDAS` · `PORTERO_MENCIONES` (el actor `menciones_en_redes` aún NO existe en el Servicio vivo) · `PORTERO_PUENTE_AL_INDICE`.

## Orden de encendido (cada paso con su «dale»; ninguno antes de que cierre la `jefatura`)
1. Fusionar el PR con **n8n 0/0** (un merge redespliega el corredor) y comprobar `/api/brain/alimentar/*` → 401 sin llave y `{apagado:true}` con llave.
2. Aplicar la migración `202610141500` (respaldo de Supabase antes) y comprobar: 2 tablas con RLS y 0 filas; el CHECK de `client_brain_chunks` acepta `cerebro_fichas`.
3. Cargar el flujo ARREGLADO sobre `ogfq56oIEoHufFPM` (respaldo ANTES ya está); sigue inactivo.
4. `PORTERO_ALIMENTAR=on` y correr **a mano en seco** (`dry_run:true`) sobre el cliente de prueba; revisar `decisiones`.
5. Primera corrida **real acotada** (`dry_run:false`, 1 cliente, ≥ 1 ejecución con evidencia por tramo; regla Q1).
6. `PORTERO_PUENTE_AL_INDICE=on` y confirmar en `client_brain_chunks` que lo propio queda buscable y lo de terceros marcado (`apify_function`).
7. `PORTERO_PROPONER_BUSQUEDAS=on`.
8. (aparte, 1 cliente, tope US$ 0,50) sumar la función `menciones_en_redes` al Servicio con respaldo ANTES y `PORTERO_MENCIONES=on`.
9. Activar el horario del flujo.

## Reversa
Apagar interruptores → desactivar el flujo → restaurar `ANTES` → reversa SQL (aborta si hay filas: exportar primero).
