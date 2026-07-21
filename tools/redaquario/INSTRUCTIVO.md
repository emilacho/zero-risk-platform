# RedAquario · Instructivo de arranque (para Emilio) · 5 minutos, una sola vez

Esto es **lo único** que necesitás hacer vos. Son 3 cosas: crear una App de Slack, copiar 2 llaves, y crear un canal. Después no lo tocás más. Todo el resto lo maneja el empleado técnico.

> **Importante:** las 2 llaves NUNCA van dentro del proyecto. Van en un archivo aparte de tu computadora (`.env`), que nunca se guarda ni se comparte. El instructivo te dice exactamente dónde.

---

## Paso 1 · Crear la App de Slack (2 min)

1. Entrá a **https://api.slack.com/apps** → botón **"Create New App"** → **"From scratch"**.
2. Nombre: `RedAquario`. Elegí tu espacio de trabajo (Zero Risk). → **Create App**.

## Paso 2 · Prender el modo túnel y sacar la 1ª llave (1 min)

3. En el menú izquierdo → **"Socket Mode"** → activá el interruptor **"Enable Socket Mode"**.
4. Te va a pedir crear un *App-Level Token* con el permiso **`connections:write`**. Ponele nombre `redaquario-socket` → **Generate**.
5. Copiá la llave que empieza con **`xapp-...`** — esa es la **llave 1**. Guardala un momento.

## Paso 3 · Darle lectura al canal y sacar la 2ª llave (1 min)

6. Menú izquierdo → **"OAuth & Permissions"** → sección **"Scopes" → "Bot Token Scopes"** → agregá estos 4:
   `channels:history` · `channels:read` · `chat:write` · `groups:history`
7. Arriba de esa misma página → **"Install to Workspace"** → **Allow**.
8. Copiá el **"Bot User OAuth Token"** que empieza con **`xoxb-...`** — esa es la **llave 2**.

## Paso 4 · Crear el canal de la torre (30 seg)

9. En Slack, creá un canal nuevo llamado **`#torre-de-control`** (ahí te van a llegar los avisos 🛫🛬⚠️🔴).
10. Escribí `/invite @RedAquario` dentro de `#torre-de-control` **y** dentro de `#equipo` (para que la App pueda leer y avisar).

## Paso 5 · Entregar las llaves (30 seg)

Las 2 llaves las pega **el empleado técnico**, no vos. Vos solo se las pasás por el chat (es canal seguro). Él las pone en el archivo `.env` local del script — nunca en el proyecto:

```
SLACK_APP_TOKEN=xapp-...   (llave 1)
SLACK_BOT_TOKEN=xoxb-...   (llave 2)
```

Y le decís el identificador del canal `#torre-de-control` (click derecho en el canal → "Ver detalles" → abajo aparece el ID `C...`), para que lo ponga en la configuración.

---

## Con eso ya está

- El sistema arranca en **modo prueba (dry-run)**: escucha, entiende y **anota lo que haría**, pero todavía **no despierta a nadie**. Cero riesgo, cero gasto.
- El paso a "en vivo" es una decisión aparte tuya + del gerente de operaciones — no pasa solo.

## Tu control de emergencia (para tener a mano)

- Escribí **`STOP`** en `#equipo` (desde tu cuenta) y el portero frena a todos al instante.
- Se reactiva **solo** cuando vos escribís **`GO PORTERO`**. Nadie más puede frenarlo ni reactivarlo.
- Tus palabras de mando (desde tu cuenta, al inicio del mensaje): **`APROBADO`** · **`EJECUTEN`** · **`APROBADO, EJECUTEN`** · **`FRENEN`** · **`STOP`**.
