# Plan v3 · V9 · los nodos del pre-vuelo y la espera (CC#2 · 15-oct)

**Estado:** construido, **apagado** y **sin aplicar**. Lo aplica CC#3 en la tanda 2, después de certificar.
**Base:** `scripts/worker-staging/finanzas-f4/plan-F4-finanzas-v2-ARREGLADO-2026-10-15.json` (F4 v2.1 de CC#1, #591 sobre #588, 63 nodos). **Resultado:** `scripts/worker-staging/planeacion-v3-v9/plan-V9-prevuelo-ARREGLADO-2026-10-15.json` (80 nodos, +17 = 15 del pre-vuelo + 2 del permiso de relleno; ningún nodo existente cambia).

## Orden
F4 v2.1 (#591, sobre #588 y #547) → enganche J7 (#584: código de la cadena, no cambia este flujo) → **V9**. Antes de aplicar: «vivo = respaldo» contra la base de arriba; si el vivo no es igual, NO se aplica.
Depende de V8 (#582, `POST /api/planeacion/prevuelo`) y de V13 (`POST /api/planeacion/corrida`, ya en `main`) **publicadas**, y de las migraciones V1/V13 **aplicadas** (sin ellas el pre-vuelo contesta 503 y el flujo PARA con aviso).

## Qué hace
| Pieza | Comportamiento |
|---|---|
| `V9 · ¿pide el pre-vuelo?` | Solo si el sobre trae `plan_v3: true` + `corrida` + `client_id`. Si no, «⓪ Llave» → «① Cargar el manual» exactamente como hoy. |
| `V9 · pre-vuelo` | `POST /api/planeacion/prevuelo` con `{client_id, corrida}` (+ `dry_run` solo si el sobre lo trae: ausente = real). Llave interna `INTERNAL_API_KEY`. |
| `V9 · decidir` | `correr`/`correr_con_lo_del_alta` → sigue. `esperar` → espera. Lo demás, una respuesta ilegible, un 409 o un 5xx → NO corre. **Falla cerrado.** |
| `V9 · esperar` | `Wait` de 5 min y vuelve a preguntar con la MISMA `corrida` (el reloj de los 45 min vive en `plan_corridas`). Tope: 14 vueltas; una caída del pre-vuelo se reintenta 3 veces. |
| `V9 · no corrió` → aviso → cable | A #alertas con «qué hacer» (salvo `ya_en_marcha`/`terminada`, que son benignos) y al cable de vuelta de la sala con `resultado: no_corrio_prevuelo`. El cable mudo falla ruidoso si la sala lo despachó. |
| `V9 · armar el cierre` → `cerrar` | Cuelga de los dos finales («plan entregado» → `hecha`; «repetida» → `fallida`). Sin `plan_v3` no hace nada. |

| `V9 · ¿relleno permitido para Apify?` + `V9 · Apify sin relleno` | Entre «elegir brazos» y «Brazo · Apify». Sin `plan_v3` deja pasar (= hoy). Con `plan_v3`: solo si el pre-vuelo dijo `relleno_permitido === true`; si no (o la decisión no se lee) NO se llama a Apify y la rama sale como pasamanos con cada objetivo de Apify en `descartados` («sin_relleno…», con `huecos_tipos`), que la junta ya sabe declarar. Cero llamadas, cero gasto. |

## Lo que NO hace (declarado)
- **`huecos_tipos` no filtra pedidos.** Los pedidos de «elegir brazos» hablan en objetivos del plan y `huecos_tipos` en tipos del catálogo; no hay traducción en el flujo (es V6/V14). Hoy `huecos_tipos` y `declara[]` solo se escriben en la declaración de la rama apagada y quedan en la salida de `V9 · decidir`. Con relleno permitido, Apify corre con TODOS sus pedidos, como hoy.
- **Un fallo a mitad del plan** (después de `correr`) no cierra la corrida en el flujo: la libera el barrido de V13 (`/api/planeacion/barrer`, techo de 100 min).
- **Re-disparo:** §16.2 pedía re-disparar por webhook; aquí es un `Wait` por intervalo (no copia ninguna llave, sobrevive a un reinicio). Si se prefiere el webhook, cambia solo `V9 · esperar`.
- **Orden entre ramas:** las ramas nuevas están en una fila propia (abajo) para correr al final; n8n no se puede probar aquí en el orden exacto entre ramas paralelas. Se verifica al aplicar con el seco (`dry_run: true`).

## Reversa
Restaurar el respaldo «ANTES» del flujo vivo con `scripts/ops/n8n-flujo.mjs restaurar X9F0zp6LQ2xGEYVS` (solo si «vivo = respaldo»). Sin `plan_v3` en el sobre, V9 ya es inerte.

## Pruebas
`__tests__/plan-v3-v9-nodos.test.ts` (25): estructura, apagado = hoy (6 sobres), seguir/esperar/tope, no corre y lo dice, falla cerrado, cierre. 4 mutaciones mueren (quitar `http===200`, quitar el tope, saltar el pre-vuelo al esperar, cerrar la repetida como `hecha`).
