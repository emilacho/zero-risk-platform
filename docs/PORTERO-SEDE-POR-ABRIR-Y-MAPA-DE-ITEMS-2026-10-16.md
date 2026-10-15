# Sede «por abrir» y mapa de ítems por sinónimo (16-oct-2026)

Encargo: `raw/tasks/2026-10-16-ENCARGO-LENOVO-CC-CEREBRO-loyverse-historial-csv.md` (puntos 2 y 3). Firma de Emilio: «Guayaquil aún no abre al público» · «los nombres de la caja y de la carta web deberían coincidir; si alguno es diferente es un sinónimo».

## 1 · Sede por abrir (el estado es un dato; la vigilancia sigue COMPLETA)
- **Dato:** fila de `client_sede_datos` con `campo = 'estado_de_la_sede'` y `valor_texto = 'por abrir'` (fuente `dueno`, con la firma en `fuente_ref`). Migración `202610161000_sede_estado_de_la_sede.sql` (solo amplía la lista cerrada de campos; reversa en `supabase/reversas/`).
- **Corrección de la tanda nocturna (Emilio 16-oct):** primero se había construido «por abrir = no se vigila»; la firma final es **«por abrir con vigilancia completa»**: competencia, posición y contexto de esa sede se vigilan igual (así hay línea base el día que abra). Por eso el estado **no cambia ninguna acción ni ficha**; es un dato legible (`SedeConPunto.estado`, `estadoDeLaSede`, `porAbrir`) para que quien reporte no trate la falta de ventas como problema.
- **«Sin ventas» no es problema:** el brazo de propios solo arma grupos por tienda con recibos; una tienda sin ventas (la de Guayaquil en Loyverse) no se reporta ni como problema ni como hueco.
- **Cuando abra:** agregar una fila más nueva con `valor_texto = 'abierta'`; vale la fila más reciente por `observado_en`.
- Valores reconocidos como «por abrir»: «por abrir», «aún/todavía no abre», «no ha abierto», «próxima apertura», «pre-apertura», «sin abrir».

## 2 · Mapa de ítems por sinónimo (`brazos/mapa-de-items.ts`)
Une los nombres de la caja con los de la carta web sin esperar al dueño. Capas, de más a menos segura:

| Certeza | Qué significa | ¿Entra al mapa? |
|---|---|---|
| exacta | mismo nombre (sin tildes ni mayúsculas) | sí |
| sinónimo | mismas palabras distintivas, sin presentación (con/sin guarnición, envase, porción), con abreviaturas (jr → junior) y sin el nombre del negocio | sí |
| probable | variante de UN solo ítem de la carta **y con el mismo precio** | sí, rotulada «(probable)» |
| dudosa | se parece a varios ítems o difiere en lo que distingue el producto | no: se muestra «podría ser A o B; sin afirmar» |
| sin equivalente | la carta no lista nada parecido (extras, envases, platos fuera de la carta) | no |

- Guardado: `clients.config.apify.loyverse_mapa_de_items` (nombre de la caja → nombre de la carta) y `loyverse_mapa_de_items_meta` (origen «automático por sinónimo», fecha, resumen, probables, dudosos con candidatos, sin equivalente).
- Cómo se lee: `fichasDeVentas` rotula los ítems con el mapa y dice «equivalencias armadas automáticamente por sinónimo (no las confirmó el dueño)»; ya no dice «sin confirmar».
- Se vuelve a armar con `npx tsx scripts/ops/armar-mapa-de-items.ts` (en seco) y `--escribir` (guarda con respaldo). Lee el catálogo de Loyverse (solo lectura) y la carta del JSON-LD de `client_web_pages` propias.
- **Agente barato para los dudosos:** no está cableado. Un agente solo puede invocarse dentro de un flujo (con `workflow_id`); un script suelto no puede. Lo dudoso queda dudoso y declarado; si se quiere, se resuelve en la corrida diaria con el mismo patrón del pulido (un agente del roster, con tope), aparte.
- Agnóstico: probado con restaurante, clínica y taller; las abreviaturas y palabras de presentación son datos (`SINONIMOS_DE_ESCRITURA`, `PALABRAS_DE_PRESENTACION`).

## Pruebas
`sede-por-abrir-y-mapa-de-items.test.ts` (22) + las de siempre. Mutación `mutar-sede-mapa.cjs`: 33 mutantes, 32 muertos, 1 equivalente declarado (`dudosa`/`sin_equivalente` siempre tienen `web = null`, así que el filtro extra del mapa no cambia el resultado).
