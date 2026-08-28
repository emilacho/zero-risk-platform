# Segunda fase del alta · flujo NUEVO

**Decisión de Emilio (2026-08-28): «SIMPLEMENTE ARMA OTRO WORKFLOW, NO TE COMPLIQUES».**
En vez de 3 empalmes dentro del worker de 73 nodos, va un flujo aparte con los 9 nodos
elegidos (+ el cierre del recorrido) y, en `LyVoK`, **un solo nodo que lo llama**.

## Archivos

| archivo | qué es |
|---|---|
| `live-worker-2026-08-28.json` | **foto literal** de `LyVoKcrypS5uLyuu` bajada de producción el 28-ago. 73 nodos · `active:false` · `updatedAt 2026-08-09`. Sin credenciales embebidas. |
| `segunda-fase-workflow.json` | **el flujo nuevo**, 1 disparador + 10 nodos. La configuración se **copió** de la foto (IDs de Notion, Cal.com, canal de Slack): no se reinventó nada. |
| `nodo-que-llama.json` | el **único** cambio a `LyVoK`: un `executeWorkflow` colgado de `[MODELB] Emit · cimiento.promoted`, con la carga enumerada. |

## 🔴 La carga del llamado · 11 datos, medidos uno por uno

Hoy esos nodos leen de nodos que quedan atrás en `LyVoK`. En el flujo nuevo **no existen**,
así que todo tiene que viajar en el llamado. La lista es **enumerada, no muestreada**:

| | dato | ¿llega hoy? |
|---|---|---|
| 1 | `client_id` | 🟢 sí — el validador lo genera si falta |
| 2 | `client_name` | 🟢 sí — obligatorio, el alta lanza sin él |
| 3 | `industry` | 🟢 sí — con default `unknown` |
| 4 | `contract_scope` | 🟢 sí — con default `unknown` |
| 5 | `_journey_id` | 🟢 sí — 87/87 filas del registro lo tienen |
| 6 | `_sala_correlation_id` | 🟢 sí — 87/87 |
| 7 | `tenant_id` | 🔴 **NO** — en 87/87 filas `tenant_id == client_id`: el respaldo `\|\| client_id` actúa siempre |
| 8 | `primary_contact_id` | 🔴 **NO** — no lo define **ningún** nodo de los 73 |
| 9 | `contact_email` | 🔴 **NO** — sólo aparece en `Persist Client to Supabase`, que corre después |
| 10 | `contact_name` | 🔴 **NO** |
| 11 | `discovery_result` | ⚠️ **nuevo** — lo lee `Build Success Plan Template` |

### ⚠️ Dos cosas que hay que saber de esta lista

**a) Los cuatro `NO` no son una regresión del flujo nuevo: el worker VIEJO ya los lee vacíos.**
La consecuencia está medida: **las 15 reservas de agenda tienen `client_id` NULO** — la reunión
se agenda y no queda atada a nadie. *(Es el pendiente C7 del manual; ahora tiene causa.)*
Copiar los nodos sin mirar hereda el defecto. Van con respaldo `||` explícito para que el flujo
nuevo **no reviente**; arreglarlos de verdad es decisión aparte.

**b) `discovery_result` casi se pierde.** `Build Success Plan Template` lo lee con la sintaxis
`$node['...']`, no `$('...')`. La primera enumeración sólo miraba la segunda forma y reportó
ese nodo como «no lee nada de aguas arriba». **Falso.** Sin este dato el plan de éxito se arma
sobre vacío. La enumeración final cubre `$('X')`, `$node['X']`, `$node["X"]` y `$items('X')`.

## Estado de la prueba

`__tests__/segunda-fase-alta-rewire.test.ts` · **14 verdes / 5 rojos**, a propósito.

- **Verde** = lo construido en este commit: el flujo nuevo bien formado, encadenado en el orden
  de Emilio, sin leer nada que no exista, y usando **los 11** datos de la carga.
- 🔴 **Rojo** = lo que espera firma: el flujo **no está creado en n8n** (sin `id`), el nodo que
  llama **no tiene `workflowId`**, y en producción `cimiento.promoted` **sigue siendo terminal**.

El control positivo (la primera mitad SÍ está cableada) está a propósito: si diera «no», el
instrumento estaría roto y ningún rojo valdría.

## ⚠️ El nombre del worker viejo viene mal codificado DESDE n8n

`"Zero Risk â€” Client Onboarding E2E v2 …"` — los bytes que manda el servidor son
`c3 a2 e2 82 ac …`: un guión largo (U+2014) leído como Windows-1252 y re-codificado.
Se reproduce con `charset=utf-8` y decodificación explícita ⇒ **el defecto está guardado en n8n**.

🔴 **La foto se deja TAL CUAL.** «Arreglar» el nombre el día del `PUT` sería un cambio no pedido
a producción. **El flujo NUEVO sí se crea con el nombre bien**: no se arrastra el defecto.

## Lo que falta, y espera firma

1. Crear el flujo nuevo en n8n *(es una escritura)* y anotar su `id`.
2. Poner ese `id` en `nodo-que-llama.json`.
3. `PUT` a `LyVoK` agregando ese único nodo colgado de `cimiento.promoted`.

## Contexto medido

- `raw/findings/2026-08-28-CC3-AUDITORIA-ADVERSARIAL-el-alta-esta-cortada-a-la-mitad.md`
- `raw/findings/2026-08-28-CC3-el-orden-real-de-la-cola-y-que-rompe-el-recorte.md`
- `raw/tasks/2026-08-28-DECISION-EMILIO-workflow-nuevo-en-vez-de-empalmes.md`
