# Ventas del punto de venta (Loyverse) en el cerebro · 15-oct-2026

Brazo `propios` del portero (interruptor `PORTERO_BRAZO_PROPIOS`, apagado por omisión). Solo lectura, US$ 0, sin modelo. Solo ingresos: ninguna ficha habla de margen ni de costo (los costos del punto de venta están en cero).

## Qué escribe

Una ficha por **mes**, por **métrica** (y por **tienda** si el punto de venta distingue más de una; el total va siempre):

| atributo | valor (`provenance_tag.metrica.valor`) |
|---|---|
| `metrica:loyverse:ingreso:AAAA-MM[:tienda-<slug>]` | ingreso del mes (ventas netas de anuladas; reembolsos aparte en `datos`) |
| `metrica:loyverse:tickets:AAAA-MM[...]` | nº de tickets |
| `metrica:loyverse:ticket_promedio:AAAA-MM[...]` | ingreso ÷ tickets |
| `metrica:loyverse:dias_y_horas:AAAA-MM[...]` | texto: 3 días y 3 horas con más tickets (hora local UTC−5) |
| `metrica:loyverse:items:AAAA-MM[...]` | texto: 10 ítems con más ingreso (nombres del punto de venta; la equivalencia con la carta web la confirma el dueño en `config.apify.loyverse_mapa_de_items`) |
| `metrica:loyverse:<métrica>:ultimos_30_dias` | lo mismo, de la ventana móvil de 30 días (se reemplaza cada día) |

- `clase = 'metrica'`, `alcance = 'cliente'`, `propiedad = 'propia'`, `origen = 'plataforma'`, ref `brazo:propios:loyverse:…`.
- `provenance_tag.datos`: `periodo`, `desde`, `hasta` (fechas locales), `en_curso`, `tickets`, `ingreso`, `ticket_promedio`, `reembolsos`, `tienda`; en el mes en curso también `snapshot` (para poder cerrarlo después).
- **Mes cerrado**: no vence y no se reescribe. **Mes en curso**: parcial, rotulado «MES EN CURSO», se reemplaza cada día (la vieja queda retirada con su fecha) y vence en 3 días si el brazo deja de correr.
- La moneda es la del punto de venta; la ficha no la nombra (la lee quien consulta de `clients.config.moneda`).

## Lo que deja leer el plan de Loyverse (verificado en vivo 15-oct)

La API responde `402 PAYMENT_REQUIRED` a todo pedido que empiece antes de 31 días atrás («Please subscribe to Unlimited sales history»). Por eso:

- Hoy NO se puede rellenar 12 meses: se archiva el mes en curso y la ventana de 30 días; cada mes cerrado se va sumando solo desde el 31-oct.
- Un mes que termina se cierra con lo guardado en su última lectura + lo leído desde el día de esa lectura (ingreso, tickets, reembolsos y ticket promedio **exactos**; las listas de días, horas e ítems llegan hasta la última lectura y la ficha lo dice: `datos.aproximado_hasta`).
- Al ampliar el plan: `PORTERO_LOYVERSE_HISTORIAL_DIAS=400` (dato del entorno) y el siguiente paso del portero rellena los 12 meses, una vez, idempotente, en una sola lectura paginada (tope 120 páginas de 250 recibos).

## Cómo lo leen

1. **Resumen vivo** (`leerResumenVivo`, ficha `resumen:cliente`): sección «Ventas del punto de venta (solo ingresos)»: último mes cerrado, mes en curso, últimos 30 días, tendencia de los meses cerrados con cita por mes, días/horas fuertes, ítems, y por tienda si hay más de una. Solo aparece si el cliente tiene punto de venta conectado.
2. **Búsqueda** (`query_client_brain` / puente al índice): las fichas son buscables como texto («Ventas de 2026-09: …»).
3. **Lector de fichas del plan v3** (`src/lib/planeacion/dato-v1/lector-cerebro.ts`, el que alimenta a la planeación y a la oficina financiera con `dato.v1`): lee `provenance_tag.metrica.valor`, pero solo mapea fichas cuyo `atributo` tenga una fila en `plan_catalogo_tipos`. **Hoy no existe esa fila**: las fichas llegan contadas en `sin_tipo.metrica`. Propuesta (la aplica el dueño del plan v3, no este brazo):

```json
{ "tipo_id": "ventas_mes", "atributo_cerebro": "metrica:loyverse:ingreso:*", "clase_dato": "atributo", "unidad": "dinero", "moneda_requerida": true, "rango": { "min": 0 }, "frescura_limite_h": 1080, "critico": false, "n_minimo": 0, "periodo_requerido": true, "comparable_con": [], "via_preferida": "cerebro" }
```
   y (cambio chico en `fichasAEntradas`) rellenar `periodo = { tipo: 'ventana', desde: datos.desde, hasta: datos.hasta }` desde `provenance_tag.datos`: hoy el lector no pone período y un tipo con `periodo_requerido` saldría `desconocido`. Con prefijo `:*` entran los meses, `:ultimos_30_dias` y las tiendas; para separar total de tienda se filtra por `datos.tienda`.
