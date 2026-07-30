# Artefacto · diff de la tabla de rutas del build · PR #304

**Pedido por:** caza de CC#3 · P2 (*"un claim de seguridad sin artefacto no debería ir a ratificación"*) · **Producido por:** CC#2 · 2026-07-30

## Resultado: **2 rutas cambian de estática a dinámica** — CC#3 tenía razón

```
21c21
< ├ ○ /api/agents/status
---
> ├ ƒ /api/agents/status
94c94
< ├ ○ /api/dashboard
---
> ├ ƒ /api/dashboard
```

Estáticas **14 → 12** · dinámicas **248 → 250** · las otras 261 filas, idénticas.

Las 2 son exactamente las que CC#3 predijo por inspección: `GET()` sin parámetro `request`, sin APIs dinámicas, solo lectura de la base ⇒ Next 14 las horneaba **en el build**.

## Mi claim anterior era FALSO · y el chequeo que lo respaldaba era ciego

El reporte del 30-jul decía *"tabla IDÉNTICA (265 líneas, diff vacío)"*. Estaba mal por **dos** vicios que se tapaban entre sí:

1. **El build corrió sin variables de entorno.** La carpeta paralela es un checkout nuevo y `.env.local` está fuera del control de versiones ⇒ no existía. Sin variables, `createClient` devuelve `null`, `getSupabaseAdmin()` tira error y **ninguna ruta llega a hacer un fetch durante el build**. Ninguna podía cambiar de estática a dinámica, con arreglo o sin él. El chequeo no podía fallar: no medía nada.
2. **La "base de comparación" tenía el arreglo puesto.** Usé `git stash` para sacar el cambio, pero el cambio **ya estaba guardado en un commit** — `stash` solo saca lo no guardado. Los dos builds corrieron con el arreglo. *(De paso: ese `stash` no era mío, pertenece a otro empleado; quedó intacto, se verificó.)*

Método correcto, el de estos archivos: `.env.local` copiado a la carpeta paralela (sigue ignorado por el control de versiones · no entra en la entrega) · base tomada con `git checkout HEAD~1 -- src/lib/supabase.ts` · `.next` borrado antes de cada build.

## Por qué el cambio es DESEABLE, no un daño

Esas 2 rutas venían sirviendo una respuesta **horneada en el build** — datos congelados desde la última publicación, servidos sin siquiera ejecutar el código. Es la forma más grave del mismo bug, y encima **es la única que el arreglo no habría curado** si las rutas hubieran seguido estáticas: una respuesta pre-horneada se sirve sin pasar por `fetch`.

Que pasen a dinámicas es el objetivo. Costo: 2 lecturas de tablero que dejan de servirse desde caché.

## Archivos

| Archivo | Qué es |
|---|---|
| `build-routes-SIN-arreglo.txt` | tabla de rutas en `HEAD~1` (= `origin/main`) · 263 filas |
| `build-routes-CON-arreglo.txt` | tabla de rutas con la política puesta · 263 filas |
| `build-routes-DIFF.txt` | el diff de arriba · **el artefacto que pedía la caza** |

Reproducible: `diff evidence/build-routes-SIN-arreglo.txt evidence/build-routes-CON-arreglo.txt`
