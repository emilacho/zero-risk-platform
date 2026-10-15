# El catálogo del plan v3 · qué es fila y qué es código (V12)

> Pieza V12 del plan v3 · CC#2 · 15-oct-2026. Diseño: `2026-10-14-DISENO-CC1-plan-v3.md` §4. Las tablas las crea V1 (CC#1); esta pieza documenta el alta y trae el guion.
> ⚠️ Los nombres de columnas son los del diseño §4.1. Si V1 cambia alguno, se cambia **solo** `TABLAS` en `scripts/ops/catalogo-agregar/nucleo.mjs`.

## Las cinco tablas

| Tabla (`--tabla`) | Una fila es… | Clave | Obligatorias |
|---|---|---|---|
| `fuentes` · `plan_catalogo_fuentes` | una fuente de datos | `fuente_id` | `proveedor`, `funcion`, `criticidad` (critica/normal/baja), `plazo_s`, `tope_usd` |
| `tipos` · `plan_catalogo_tipos` | un tipo de dato | `tipo_id` | `unidad`, `frescura_limite_h`, `critico` |
| `reglas` · `plan_catalogo_reglas` | una regla (identidad, contradicción, precedencia, cambio material) | `regla_id` | `clase`, `operador`, `parametros`, `aplica_a` (`{fuente}` o `{tipo}`), `severidad` (bloquea/avisa) |
| `lexico` · `plan_catalogo_lexico` | léxico de chequeo por idioma | `lexico_id` | `idioma`, `grupo` (verificacion/ausencia/supuesto/dominio/periodo), `terminos[]` |
| `topes` · `plan_catalogo_topes` | un tope por tramo (y por fuente) | `tope_id` | `tramo`, `usd`, `contador` |

Todas llevan `version`, `vigente`, `desde` y `pais` (null = global); **esas cuatro las pone el guion**, no quien da de alta.

## Qué es fila y qué es código
- **Es fila:** fuentes, tipos, frescura, identidad (con los operadores existentes), léxico, topes, una regla nueva que use un operador existente.
- **Es código (no se da de alta aquí):** un **operador** nuevo (los ocho cerrados — rev. 3 §14.2: la identidad la decide el criterio del `portero`, salen los `coincide_*`: `delegada_en_portero`, `rango`, `edad_max_h`, `igual_unidad`, `difiere_mas_de`, `precede`, `contiene_termino`, `n_minimo`), un nodo de n8n para una fuente que no habla por el Servicio, y la calculadora. Un operador desconocido se rechaza con «uno de …».

## Cómo se da de alta
```
# 1 · validar (sin escribir; con red comprueba que la fuente/tipo referenciado exista y esté vigente)
node scripts/ops/catalogo-agregar.mjs plan --tabla tipos --archivo fila.json

# 2 · aplicar (respaldo → insert versión+1 como no vigente → voltea vigente → lee de vuelta)
node --env-file=.env.local scripts/ops/catalogo-agregar.mjs agregar --tabla tipos --archivo fila.json --salida _respaldos/catalogo-AAAA-MM-DD --aplicar

# reversa (vuelve a marcar vigente una versión anterior; también con respaldo)
node --env-file=.env.local scripts/ops/catalogo-agregar.mjs revertir --tabla tipos --clave telefono --version 1 --aplicar
```
- **Nunca se edita una fila en sitio:** el contenido de una versión queda igual para siempre; solo cambia cuál es la vigente.
- Sin `--aplicar` no escribe nada. Con la tabla inexistente (V1 sin aplicar) termina con código 3 y no inventa nada.
- La corrida del plan lee **una vez** el catálogo y guarda `catalogo_version` y `catalogo_huella` en el paquete: un alta no cambia una corrida en curso.

## Ejemplo (alta válida)
```json
{ "tipo_id": "resenas_total", "unidad": "conteo", "frescura_limite_h": 720, "critico": false, "n_minimo": 1, "via_preferida": "crudo" }
```
Inválidas típicas: `operador` fuera de la lista, `aplica_a` que nombra una fuente que no existe, `version`/`vigente` puestos a mano, columna que no existe, `tope_usd` > 5.

## Límite conocido · el alta no es atómica
El alta hace tres escrituras seguidas (insertar la versión nueva como no vigente → marcar la anterior no vigente → marcar la nueva vigente). Entre la segunda y la tercera el catálogo puede quedar, por unos milisegundos, **sin fila vigente** para esa clave; y si la tercera falla, queda sin vigente hasta correr `revertir` (el guion lo dice y no toca nada más).
- **Regla:** dar de alta **solo con 0 corridas del plan en vuelo** (el plan lee el catálogo una vez por corrida; una corrida en curso no cambia, pero una que arranque justo en ese intervalo vería la clave sin vigente).
- **Pendiente propio:** cuando V1 exista, hacer el cambio de `vigente` en una función SQL (RPC) transaccional y que el guion la llame; hasta entonces, la regla de arriba.
