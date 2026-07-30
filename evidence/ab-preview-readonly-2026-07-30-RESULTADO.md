# A/B solo-lectura sobre la vista previa · PR #304 · RESULTADO

**Autorizado por:** Lenovo (endoso del Consejero §3) · **Ejecutado:** CC#2 · 2026-07-30 19:21-19:25Z
**Alcance:** pasos 1-3, 5, 6 del plan · **PASO 4 (escritura) NO ejecutado** · **cero escrituras: todo GET**
**Producción:** `zero-risk-platform.vercel.app` (sin el arreglo · último despliegue **2026-07-24T19:14:33Z**)
**Vista previa:** `…-git-fix-supabase-no-store-cache-…` (con el arreglo · commit `8efe51b`)
**Acceso a la vista previa:** secreto de bypass de automatización **que ya existía** en el proyecto (leído por API, no creado).

---

## TITULAR · el A/B parte en dos, y hay que decirlo así

| | Veredicto |
|---|---|
| **Las 2 rutas horneadas** (`/api/dashboard` · `/api/agents/status`) | ✅ **BUG PROBADO EN RUNTIME · el arreglo lo cura** |
| **La bandeja** (`/api/hitl/approvals/pending`) | ⚠️ **NO reproduce hoy** · producción lee vivo · hay explicación competidora fuerte |

---

## 1 · PROBADO · producción sirve respuestas horneadas hace 6 días

```
GET /api/dashboard
  PRODUCCIÓN : x-vercel-cache HIT · age 144
               {"totalCampaigns":0,…,"timestamp":"2026-07-24T19:15:30.489Z"}   ← 6 DÍAS
  VISTA PREVIA: x-vercel-cache MISS
               {"totalCampaigns":0,…,"timestamp":"2026-07-30T19:24:20.916Z"}   ← AHORA

GET /api/agents/status
  PRODUCCIÓN : x-vercel-cache HIT · age 172 · "timestamp":"2026-07-24T19:15:28.783Z"  ← 6 DÍAS
  VISTA PREVIA: x-vercel-cache MISS         · "timestamp":"2026-07-30T19:24:50.982Z"  ← AHORA
```

La marca de tiempo de producción (**19:15:30Z del 24-jul**) cae **57 segundos después** del último despliegue a producción (**19:14:33Z del 24-jul**). Es la hora del horneado durante el build. Producción **no ejecuta el código de esas rutas**: entrega una respuesta cocinada hace 6 días.

**Esto convierte el análisis estático en [DATO] medido.** Es exactamente lo que predijo CC#3 por inspección y lo que mostró el diff de tabla de rutas — ahora probado en el runtime real, no inferido. **Y es la forma del bug que el `no-store` solo cura porque además vuelve dinámicas esas rutas**: a una respuesta pre-horneada no la alcanza ninguna política de fetch, porque nunca hay fetch.

## 2 · NO REPRODUCE · la bandeja lee vivo en producción, hoy

| Brazo | Resultado |
|---|---|
| Verdad en la base (`status=pending`, por fecha, tope 100) | 100 filas |
| **A · Producción (SIN arreglo)** | `count=100` · **100 servidas como `pending`** · **coincidencia 100/100 = 100%** |
| **B · Vista previa (CON arreglo)** | `count=100` · **coincidencia 100/100 = 100%** |

Sonda extra para descartar que producción estuviera sirviendo una copia vieja que casualmente coincide — pedí `limit=99`, una **clave de caché nueva, imposible de estar cacheada**:

- `limit=100` (posible copia guardada) == primeros 99 de `limit=99` (fresco) → **true**
- `limit=99` (fresco) == verdad en la base → **true**
- `x-vercel-cache: MISS` · `age: 0` en ambas

⇒ **En producción, hoy, esa ruta lee vivo.** El "0 de 100 coinciden" del 29-jul **no se reproduce**.

### Explicación competidora (fuerte) para la medición del 29-jul

El "HITL Inbox Processor" vencía ~100 ítems **cada 15 minutos** hasta que CC#1 lo pausó el **29-jul 20:25Z**. Con esa rotación, un ítem servido como `pending` podía estar `expired` en la base segundos después — lo que produce *exactamente* el síntoma "el punto de conexión sirve 100 pendientes que en la base están vencidos", **sin que haya caché de por medio**. Desde la pausa no hay rotación, y punto de conexión y base coinciden.

**No puedo distinguir las dos causas sin el paso 4** (cambiar una fila y volver a leer), que es escritura y quedó diferido. Tampoco hubo despliegue a producción desde el 24-jul, así que la copia guardada no pudo ser invalidada por una publicación.

**Honesto:** el mecanismo de caché **existe y está probado en el código** (leído dos veces, por CC#2 y CC#3). Lo que queda **[DESCONOCIDO]** es si fue *la* causa de la bandeja ciega del 29-jul.

## 3 · Muestreo · el resto de las rutas

| Ruta | Producción | Vista previa | Lectura |
|---|---|---|---|
| `/api/dashboard/metrics` | 200 · 472b | 200 · 472b | cuerpos distintos (contenido que se mueve) |
| `/api/agent-invocations/recent?limit=5` | 200 · 2196b | 200 · 2196b | **idénticos** — el sistema está pausado, no hay invocaciones nuevas |
| `/api/cost-usage` | 200 · 17240b | 200 · 17240b | **idénticos** — mismo motivo |

Con el sistema pausado, "idéntico" no distingue vivo de congelado. No se puede concluir nada de estas tres, y no se concluye.

## 4 · Lo que el A/B SÍ deja firme para la ratificación

1. **La vista previa con el arreglo funciona**: 100% de coincidencia con la base, ninguna ruta rota, ningún 500, tiempos normales. **El cambio no rompe nada en runtime.**
2. **Dos rutas de producción sirven datos de hace 6 días y el arreglo las cura** — [DATO], no análisis estático.
3. **La justificación original (la bandeja) queda sin probar en runtime.** El arreglo sigue siendo correcto y barato, pero su caso más fuerte hoy son las 2 rutas horneadas, no la bandeja.

## 5 · Lo que NO se hizo

- **Paso 4** (cambiar 1 fila y releer): es escritura. Diferido a momento controlado, como pidió el Consejero.
- **No se creó** ningún secreto ni se cambió ninguna configuración de la plataforma de publicación: el secreto de bypass ya existía, solo se leyó.
- **Cero escrituras** de cualquier tipo. Todas las llamadas fueron GET.

*(técnico · script `ab-preview-readonly-2026-07-30.mjs` · log `ab-preview-readonly-2026-07-30.log` · último deploy prod `2026-07-24T19:14:33.244Z` = merge PR #300 · marcas horneadas 19:15:28Z y 19:15:30Z)*
