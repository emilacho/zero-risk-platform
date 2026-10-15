# Pedidos libres al portero · «completar con huecos» (16-oct-2026)

Firma de Emilio (16-oct): *«no le pongas límite a lo que pueden pedir… si llenamos de código que limita, el LLM deja de ser una agencia agéntica»*. Quien pide es **la oficina o el director de esa oficina**; no hay lista de autorizados: solo se **registra** quién pidió y para qué.

## Entrada y salida
- `POST /api/brain/alimentar/pedido` · cabecera `x-api-key: INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`) · detrás de `PORTERO_PEDIDOS=on` (apagado por omisión: responde `{apagado:true}` sin leer ni escribir).
- `GET /api/brain/alimentar/pedido?id=<pedido_id>` · el resultado de un pedido.
- `GET|POST /api/brain/alimentar/listo` acepta además `pedido_id` y devuelve `pedido: {…}` junto con la señal de listo (que no cambia).

### Pedido
```json
{
  "client_id": "<uuid>",
  "dry_run": false,
  "workflow_id": "<id del flujo que llama>",
  "workflow_execution_id": "<ejecución>",
  "sede_clave": "guayaquil",
  "pedido_por": { "oficina": "oficina-financiera", "agente": "chief-financial-officer" },
  "para": "qué necesita y para qué (lenguaje natural)",
  "huecos": [ { "fuente": "…", "tipo": "…", "objetivo": "…", "motivo": "…" } ],
  "pedido_id": "<uuid opcional: el mismo id devuelve el mismo pedido sin gastar>"
}
```
- Obligatorios: `client_id`, `dry_run` (booleano), `pedido_por.oficina`, `pedido_por.agente`, `para`. Con `dry_run:false` también `workflow_id` y `workflow_execution_id` (el portero solo corre desde un flujo).
- `huecos` es **libre**: hasta 12; cada uno puede ser un texto suelto o un objeto con cualquier mezcla de `fuente | tipo | objetivo | motivo`. Sin `huecos`, lo que dice `para` es el pedido.
- `tipo`/`fuente` que coincidan con el **atributo** o la **clase** de fichas frescas (p. ej. `metrica:loyverse:ingreso`, `resumen_vivo`) se responden por código, sin modelo y sin gasto.
- Un `agente` fuera del roster se registra igual y se avisa en `avisos`.

### Respuesta inmediata (`dry_run:false`)
```json
{ "ok": true, "pedido_id": "<uuid>", "estado": "en_proceso", "client_id": "…", "sede_clave": "…", "pedido_por": {…}, "agente_en_roster": true, "tope_usd": 0.4, "avisos": [], "nota": "…" }
```
Sigue en segundo plano (hasta ~5 min). Con `dry_run:true` responde de inmediato **con el plan** (qué respondería «ya está», qué decidiría el modelo) y no escribe nada.

### Resultado (`GET …/pedido?id=` o `pedido` en `/listo`)
```json
{
  "pedido_id": "…", "client_id": "…", "estado": "resuelto | parcial | en_cadena | no_resuelto | en_proceso | fallo",
  "costo_usd": 0.023, "fichas": ["<ids de fichas del cerebro que responden>"],
  "huecos": [ {
    "hueco": {…},
    "estado": "ya_esta | traido_y_archivado | en_cadena | no_resuelto | tope",
    "detalle": "una frase",
    "fichas": ["…"],
    "hallazgos": [ { "resumen": "…", "url": "…", "cita": "texto literal de la página", "alcance": "cliente | mercado" } ],
    "intentado": ["lo que se probó cuando no se resolvió"],
    "funciones": ["función del catálogo pedida a la cadena"],
    "costo_usd": 0.013
  } ],
  "cadena_llego": { "llegaron": [], "faltan": [] }
}
```
- **`ya_esta`**: ya había una ficha fresca (por atributo, o por el modelo con cita literal de esa ficha). Sin gasto de búsqueda.
- **`traido_y_archivado`**: no estaba; el portero lo halló en la web, **verificó la cita literal** en la página leída, lo entregó y lo **archivó en el cerebro** (`clase dato_de_pedido`, con fuente, fecha, quién pidió, vigente 30 días; `alcance: cliente` solo si la página identifica al negocio con nombre entero + segunda señal; si no, `mercado`).
- **`en_cadena`**: lo trae una función del catálogo; se pidió a la MISMA cadena del portero (filtro, archivar, vigilante). Consulta con `GET` hasta que `cadena_llego.faltan` esté vacío; lo traído aparece en el cerebro.
- **`no_resuelto`**: «esta información me falta» + `intentado`. Queda en la lista de no resueltos (tabla `cerebro_pedidos` y `raw/tasks/PEDIDOS-NO-RESUELTOS-CEREBRO.md`). No avisa a Emilio.
- **`tope`**: se alcanzó el tope; lo que falta no se intentó.

## Qué NO se limita y qué sí se mide
- **No se limita**: qué se pide, quién pide, el lenguaje, la lista de fuentes (si no está en el catálogo, el portero lo intenta por la web).
- **Se mide**: gasto (tope por pedido US$ 0,40, por oficina y día US$ 1,50 — `PORTERO_PEDIDO_TOPE_USD`, `PORTERO_PEDIDO_TOPE_OFICINA_DIA_USD` — y el tope diario del portero: aviso > 3, apaga > 10); cita literal verificada por código; anti-homónimo; idempotencia (el mismo pedido en 24 h devuelve el anterior, sin gastar; un `fallo` sí se reintenta).
- El tope se mira **antes de cada llamada**: a lo más una llamada se pasa del tope del pedido.

## Dónde corre y qué cuesta
- Modelo del portero (`portero-del-cerebro`, registrado en `agent_invocations` con `command portero.pedido`: cuenta en su tope). Búsqueda: actor de Google de Apify (≈ US$ 0,003 por consulta; deja su fila cruda en `apify_raw` con `metadata.origen = portero_pedido`). Lectura de páginas: `fetch` directo, US$ 0.
- Un pedido típico: 0 (ya está) a ≈ US$ 0,03 (razonar + 1–2 búsquedas + extraer).

## Rastro
Tabla `cerebro_pedidos` (migración `202610161100_cerebro_pedidos.sql`, con reversa): quién, cliente, sede, huecos, para qué, estado, costo, fichas, resultado por hueco.

## Lo que queda para encenderlo
1. Aplicar la migración (tabla nueva). 2. `PORTERO_PEDIDOS=on` y redesplegar (n8n 0/0, fuera de 12–14 UTC). 3. El otro orquestador hace que los directores de oficina llamen al endpoint desde su flujo (con su `workflow_id`).
