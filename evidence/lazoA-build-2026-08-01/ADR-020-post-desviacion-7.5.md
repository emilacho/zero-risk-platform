---
type: ADR-020 · La Jefatura = módulo general de calificación (diseño brain-level · workflows se cuelgan de ella)
created: 2026-07-05
status: ✅ **RATIFICADO por Emilio §144-e + GO de arranque (05-jul 21:30 vía Lenovo · fold de las 6 marcas ✅ Lenovo 21:28) — CANON VIGENTE** · Primera Revolución CERRADA · sprint de construcción ACTIVO: SPRINT-JEFATURA-construccion-2026-07-05.md · canonización CLAUDE.md = lote doc-only `LOTE-DOC-canonizacion-JEFATURA-CEREBRO-2026-07-05.md` (consejero revisa pre-merge · ejecuta CC con micro-GO) · historial: 🟢 APROBADO por el consejero (05-jul 16:55 · v2.3 + Anexo M1 leídos completos · cierra P2+P4 · "fiel al diseño y honesto §148") · v2.4 = sus 2 endurecimientos foldeados (integridad del gate de fidelidad · golden set) · diseño $0 · resta SOLO ratificación Emilio §144-e (canoniza JEFATURA/CEREBRO · lote doc-only lo revisa el consejero pre-merge) + GO de arranque del sprint de construcción · NO se cablea nada · v2.5 = §7 Convergencia y autoridad de decisión (concern de Emilio 17:12 · gatea F1) · v2.6 = criterio del consejero 17:30 FOLDEADO a §7 (turnos cruzados · CONVERGEN en "la vara objetiva decide · los críticos asesoran" · tabulador determinista · relevancia-al-gate · progreso monótono · triage del creador · perilla de Emilio) · v2.7 = **nod del consejero sobre §7 OTORGADO (20:48 · §7 deja de gatear F1)** + su aclaración explícita en §7.3 (top-N focaliza · nunca aprueba · la vara re-puntúa) · fold de las 6 marcas ✅ (21:28) → §144-e + GO de arranque ✅ (21:30) — sin pendientes propios
authority: dirección de diseño de Emilio (§144 · 2026-07-05 14:26 vía Lenovo) + aclaración autoritativa de Emilio (13:51 vía consejero) + validación de topología (13:26) y criterio de diseño (14:34) del consejero + verificación §148 del gate (CC#3 14:50 · file:line) + read del Arquitecto (09:10/13:37/14:06/14:38)
owner: Emilio (§144) · Arquitecto/Fable (diseño) · Consejero (validación) · Lenovo (prepara el sprint de construcción con el resultado)
responsable_del_documento: Arquitecto de Sistema (Fable)
canon: §144 · §148 · §149 · §150 · §151 · ADR-011 · ADR-012 · ADR-018 · ADR-019
supersede_parcial: fold del T.1 del sprint (vocabulario único · P2-10) · alinea CLAUDE.md §10.1 (modelo viejo de 2 revisores)
related:
  - SPRINT-PRIMERA-REVOLUCION-COMPLETA-2026-07-03.md (§9 acuerdos · F3.3/F3.4/F4.3)
  - SPEC-camino-iii-lazo-correccion-2026-06-27.md (Lazo A · correcciones accionables)
  - SPEC-brand-book-build-colaborativo-cero-humano-2026-06-29.md (fidelidad valida cimientos)
  - ARQUITECTURA-camino-iii-y-brain-2026-06-09.md (simbiosis Cerebro↔Jefatura)
  - ADR-018 (la sala = despacho por eventos · la Jefatura se engancha por el log)
regla: quien actualiza, re-firma
---

# ADR-020 · La Jefatura — un módulo de calificación, muchos tipos de artefacto

## Contexto (dirección de Emilio · 2026-07-05)

Emilio fijó la dirección de fondo: **NO cablear workflows sueltos con lógica de calidad adentro de cada uno.** Diseñar la **Jefatura** BIEN como sistema general (brain-level), y que los workflows se **cuelguen** de ella. Diseño primero, conexión después. Con dos correcciones de canon:

1. **Vocabulario único (P2-10):** "Camino III" / "3 caminos" → **JEFATURA**. "cerebro del cliente" → **CEREBRO**. De ahora en adelante, en todo el canon.
2. **Separación conceptual (eran dos cosas distintas):** el **CEREBRO** es el *almacén de conocimiento* del cliente (RAG · chunks). La **JEFATURA** es el *módulo de revisión / corrección / juicio* (los 3 jefes + fidelidad + Braintrust + GPT-5.5). No se mezclan.

El problema que resuelve: hoy la calidad vive acoplada dentro de workflows individuales (el gate en `hi5nwPCGUWHkGnT7`, el Lazo A en `kSSAvCbEfHs2Hoa0`), lo que fabrica inconsistencia y drift. La solución es la misma filosofía que la sala: **una sola cosa hace calidad; los workflows la consumen, no la reimplementan.**

## Decisión

**La Jefatura es UN módulo transversal de calificación con graders distintos por CLASE DE ARTEFACTO.** Un solo servicio interno; adentro, la mecánica se elige por el tipo de lo que se le entrega — no por qué workflow lo pidió.

### Principio raíz (espejo de ADR-018 aplicado a calidad)

> **Una sola cosa califica; cualquier workflow que reimplemente calidad adentro es un bug, no una función.** La Jefatura SIEMPRE corrige/mejora (función base, todos los casos). El *juicio* (aprobar/rechazar) es un añadido que solo aplica al CONTENIDO.

### 1 · Un contrato de entrada único (no lógica per-workflow)

Cualquier productor entrega a la Jefatura un sobre uniforme:
```
{ artifact_type, artifact_id, client_id, journey_id, payload }
```
La Jefatura NO sabe ni le importa qué workflow la llamó. El `artifact_type` gobierna todo lo demás. Añadir un tipo nuevo (email, landing) = **una fila en una tabla**, no un workflow nuevo.

### 2 · Registro de graders determinista (tabla, no código · espejo del router de la sala)

Una tabla `jefatura_grading_policies` mapea `artifact_type → política`. Igual que el router de la sala decide despacho por tabla (no LLM), la Jefatura decide *tratamiento* por tabla:

| artifact_class | CORRECCIÓN (siempre) | JUICIO (gate) | Grader que decide canon | Contrapeso (no bloquea) |
|---|---|---|---|---|
| **cimiento** (brand_book · ICP · competitivo) | Lazo A · jefes correctores · máx N ciclos | **NO** (sería circular) | **Fidelidad/groundedness ≥0.85 factual** (scorer automático) | scorer sombra cross-model (dead-end · M2/F1.2) |
| **contenido** (ad_creative · copy · email · landing) | correcciones accionables · máx N ciclos | **SÍ** · voto 3-de-N contra el brand book del CEREBRO | el voto de los jefes | GPT-5.5 cross-model `non_voting` (cazador de punto ciego · fuerza humano) |

### 3 · Dos capacidades universales (toda pieza recibe una combinación)

- **CORRECCIÓN — siempre encendida.** Los jefes emiten objetos accionables `{eje, severidad, dónde, problema, por_qué, cambio_sugerido}` (formato SPEC-lazo). El **creador original** corrige (nunca los jefes reescriben — no-auto-calificación). Re-entrega. Tope de ciclos (§150).
- **JUICIO — solo contenido.** Voto 3-de-N contra el brand book: ≥2 verde y 0 rojo aprueba · ≥2 rojo rechaza · resto → humano. El rechazo SIEMPRE trae correcciones (un rojo sin correcciones es un bug, no un voto).

### 4 · El guardrail NO-NEGOCIABLE: no-circularidad

**El brand book (cimiento) define qué es contenido de calidad → jamás se rutea por el voto de contenido.** Votar calidad-de-contenido sobre lo que *define* esa calidad es circular. El cimiento se califica SOLO por fidelidad. El nombre unifica (una Jefatura); los mecanismos NUNCA se cruzan. (Razón real detrás del canon previo del consejero.)

### 5 · Dónde viven los satélites (explícitamente FUERA del path bloqueante)

- **Fidelidad** = el grader del cimiento (automático · groundedness ≥0.85 en campos factuales · `emit_fidelity_scores`). Es un grader, no un jefe.
- **Braintrust** = capa de **calibración ENCIMA** del módulo. Consume trazas de votos + golden set → score de acuerdo. Mide si los graders califican bien. **NO califica artefactos · NO vota.** (F4.3)
- **GPT-5.5** = cross-model `non_voting`. En contenido: cazador de punto ciego (rojo donde los jefes dan verde → fuerza humano · adjunta criterio · no aprueba · F3.4). En cimiento: el contrapeso cross-model es el scorer sombra (dead-end). **Ninguno de los dos gatea nada.**

Mnemotecnia canónica: **la Jefatura corrige siempre · vota solo contenido · la fidelidad valida cimientos · Braintrust califica a los que califican · GPT-5.5 caza puntos ciegos.**

### 6 · Cómo se cuelgan los workflows (acople por EVENTOS, no per-workflow)

Consistente con ADR-018 (handoffs por el event-log · cero worker→worker directo):
```
Workflow productor termina una pieza publicable
        │
        ▼  emite EVENTO al sala_event_log:  artifact.ready {type, artifact_id, journey_id}
        │
   El ROUTER determinista lee el evento → routing_rule por artifact_type → despacha a la JEFATURA
        │
   La Jefatura aplica la política del registro (grader por clase) → emite de vuelta al log:
        ├─ jefatura.corrections {artifact_id, correcciones[]}  → router re-despacha al creador (rama "corregir")
        ├─ jefatura.verdict {PASS}   → router promueve (publica / entra al CEREBRO como canon)
        └─ jefatura.verdict {ESCALATE} → humano (HITL)
```
La Jefatura es un **suscriptor/emisor del event-log**, NO un nodo hardcodeado dentro de cada workflow. Un productor nuevo se engancha emitiendo `artifact.ready` — no reimplementa calidad. **Eso es "diseñar el módulo, los workflows se cuelgan de él."**

### 7 · Convergencia y autoridad de decisión (concern de Emilio · 17:12 · gatea F1)

Emilio marcó el hueco correcto: "siempre corrige" + ~5 entidades + cap=1 **no dice QUIÉN decide, CUÁNDO para, ni cómo convergen opiniones contradictorias.** El cap evita el loop infinito, no la over-correction dentro de una pasada. Se cierra con el principio raíz del sistema: **una vara objetiva decide; los opinantes solo aconsejan** (espejo de "código decide, LLM aconseja").

**7.1 · No son 5 co-decisores. Son 3 asesores + 1 vara objetiva.**
Los **3 jefes = ASESORES** (emiten correcciones sobre SU eje · no deciden "listo"). El **decisor es objetivo y automático**: CIMIENTO → scorer de fidelidad ≥0.85 · CONTENIDO → voto 3-de-N. Los **satélites** (Braintrust, GPT-5.5, sombra) NO opinan sobre la pieza en este loop (calibran/contrastan · fuera del path por §5). El miedo a "5 opiniones peleando" se disuelve: sobre el cimiento hay 3 asesores + 1 vara.

**7.2 · Autoridad (Q2): la vara decide "listo", no los jefes.**
CIMIENTO: la **fidelidad decide**. Si el brand book pasa ≥0.85 está LISTO, aunque un jefe todavía tenga sugerencias — los jefes **no pueden bloquear una pieza que pasa la vara**. (Mata el "nunca satisfechos".) CONTENIDO: el **voto 3-de-N decide** — y la decisión final la calcula el **TABULADOR DETERMINISTA** (`tabulate.ts` · espejo de ADR-018 "árbitro determinista, no LLM"): nadie "opina" la decisión final, una regla objetiva la computa. **No hay jefe-árbitro** — el árbitro es la vara. Si tras el cap no se llega → la autoridad pasa al **HUMANO** (HITL), nunca a un jefe.

**7.3 · Qué amerita corrección (Q1+Q4 · anti-over-correction): severidad, no gusto.**
Toda corrección lleva severidad (SPEC-lazo: rojo/ámbar). **Solo el ROJO (bloqueante) dispara re-síntesis · el ÁMBAR se adjunta como sugerencia y NO itera.** "Siempre corrige" = siempre EMITE observaciones; solo las severas mueven la pasada. **La vara es el techo:** no se corrige lo que ya pasa — fidelidad ≥0.85 = "suficiente", se para aunque haya ámbar pendiente (responde la Q1). **Presupuesto por pasada:** solo las rojas top-N llegan al creador (evita el volcado de 40 nitpicks). **El top-N FOCALIZA, NUNCA aprueba (aclaración del consejero · nod 20:48):** quien decide pasa/no-pasa es la VARA re-puntuando el RESULTADO, no el conteo de correcciones — si quedan bloqueantes de groundedness sin resolver, la fidelidad sigue <0.85 → no pasa → humano. El top-N no es un atajo que cuela piezas con gaps reales. **Segunda capa (consejero 17:30) · relevancia-al-gate:** solo amerita ciclo lo que MUEVE la métrica objetiva (gap factual/groundedness en cimiento) — lo estilístico no mueve la fidelidad → advisory SIEMPRE, jamás ciclo (la over-correction estilística queda estructuralmente imposible). **Perilla para Emilio (default recomendado · tuneable):** en cimiento solo cuenta como bloqueante lo que afecta groundedness/hecho.

**7.4 · Conflictos entre jefes (Q3): dueño-de-eje manda · el creador integra · irreconciliable → humano.**
Cada jefe **posee un eje** (brand_strategist=posicionamiento/ICP · editor_en_jefe=voz/factual · jefe_client_success=cliente/retención); en su eje su corrección **precede** a la de otro. Contradicciones **cruzando ejes** las integra el **creador** (tiene la pieza entera · rol integrador · los jefes nunca reescriben) — y el creador hace **TRIAGE**: elige QUÉ bloqueantes aplica (punto único de integración · no 5 voces forzando cambios · NO "aplicar todas", sería incoherente). Dos rojos genuinamente irreconciliables → **ESCALATE a humano** (salida honesta y rara · no se fuerza convergencia falsa).

**7.5 · Cuándo PARA (convergencia):** para cuando (a) la vara pasa (fidelidad ≥0.85 / voto aprueba) → LISTO · o (b) se agota el cap → HUMANO. **Nunca "los jefes quedaron satisfechos" como señal de fin** — esa señal no existe (siempre hay una sugerencia más). El fin lo marca la vara objetiva o el humano.

> **DESVIACIÓN REGISTRADA · §144 Emilio · 2026-08-01 · carril CIMIENTO**
>
> En el carril **cimiento**, al agotarse el cap la autoridad **NO** pasa al humano: la corrida termina en **fallo honesto** (`cimiento.failed` + `Stop and Error`, **sin despacho**, con registro durable).
>
> **Motivo:** la bandeja de revisión **no tiene resolutor** — `hitl/queue` no persiste el `callback_url` y **ningún endpoint despierta el `Wait`** (mediciones CC#3 29-jul · M2/M5). Mandar al humano sería mandar a una bandeja que nadie puede resolver: el "listo falso" con otra cara.
>
> **Se reconsidera cuando se construya la JEFATURA** y exista una bandeja resoluble. Hasta entonces, esta desviación es **deliberada y está registrada** — no es un olvido.
>
> *(Condición #2 del Consejero para el rebuild del Lazo A cap=1 · plan `raw/tasks/2026-08-01-CC3-PLAN-FINAL-rebuild-lazo-A-cap1-v2.md` · ejecutada por CC#2.)*

**7.6 · Progreso monótono (consejero 17:30 · diseñado HOY para cuando el cap suba):** un ciclo solo procede si se espera que la métrica MEJORE; si una re-síntesis NO sube la fidelidad vs el ciclo previo → **STOP y se toma la mejor versión registrada**. En cap=1 es moot, pero queda diseñado YA para que subir a ≥3 sea seguro (el Anexo M1 ya trae `cycle` + scores por ciclo → medible por traza, no por fe).

> **Concern de Emilio, cerrado:** over-correction la matan la severidad (solo rojo itera) + la vara-como-techo (no corregir lo que pasa). Los círculos los matan el cap + que decide la vara, no las opiniones. La autoridad es la vara (fidelidad/voto), no un jefe. Conflictos: dueño-de-eje → creador integra → humano si irreconciliable. **Esta sección gatea F1 · los turnos del Arquitecto (17:30:50) y del consejero (17:30:25) se CRUZARON y CONVERGEN — mismo principio raíz, cero contradicciones · su criterio ya está foldeado acá (v2.6) · **NOD del consejero OTORGADO 05-jul 20:48** ("merge fiel de los dos turnos · cero contradicciones · cierra el concern de Emilio") → **§7 deja de gatear F1** · su aclaración top-N-no-aprueba explícita en §7.3 (v2.7).**

**Fasing (criterio del consejero 14:34 · §148 honesto · ADOPTADO):** el diagrama de arriba es el TARGET. Hoy la sala sigue en sombra (flags OFF · 0 despachos reales) → NO se construye el mesh de eventos completo antes de que la sala viva — sería gatear calidad sobre un despachador no probado. **v1 pragmático: la Jefatura como sub-workflow único (executeWorkflowTrigger) llamado por contrato.** Mismo contrato de entrada y de veredicto; cuando la sala se encienda, se muda el TRANSPORTE (return → eventos del log), no la interfaz. (Resuelve el punto abierto (a) del turno del Arquitecto 14:38 — el híbrido intake-síncrono/veredicto-vía-sala queda para el encendido de la sala.) El registry vive en **tabla DB** (auditable · §148-queryable · sin redeploy por cambio de perfil · espejo del `routing_rules` del router) — punto (b) a objetar por el consejero en su revisión del draft si no acuerda.

### 8 · Perilla de costo (parte del GO reservado de Emilio)

`MAX_CYCLES` del Lazo A es una perilla costo/calidad, NO un hueco de seguridad. Cap=1 (~$1-1.5/corrida) es *más* seguro que ≥3 (no puede loopear · cero runaway). **Recomendación v1 del consejero (adoptada): cap=1.** Subir a ≥3 con loop-back (~$2.5-4) solo si corridas reales muestran que 1 pasada no alcanza — no re-introducir el loop que degeneró, especulativamente.

## Qué reemplaza / relación con lo existente

**Mapa a lo desplegado (verificado §148 · CC#3 05-jul 14:50 · file:line):**

| Pieza desplegada | Qué ES (verificado) | Rol en la Jefatura |
|---|---|---|
| `hi5nwPCGUWHkGnT7` "Camino III 3-of-N Voting Gate" (activo · huérfano) | **VOTO 3-de-N DE CONTENIDO** — nodo `Vote A/B/C` · agente emite `{vote: green\|amber\|red, rationale, confidence, concerns, corrections}` · `camino-iii/reviews/route.ts:4` ("3-of-N voting") · `:109` `expected_votes_count=3` · `votes/route.ts:6` auto-tabula · `:110` red=REJECT · **SIN `emit_fidelity_scores` · SIN umbral ≥0.85** | grader de **JUICIO de CONTENIDO** únicamente · **NUNCA en el path del cimiento** (sería el error circular — excluido por diseño) |
| `kSSAvCbEfHs2Hoa0` "Brand Book Lazo A" (inactivo · huérfano) | correct-loop del cimiento · MAX_CYCLES=1 deliberado · contador independiente ✅ | la **CORRECCIÓN del cimiento** (cap=1 v1 per criterio consejero 13:26) |
| Gate de fidelidad del cimiento (paso que DECIDE ≥0.85) | **NO EXISTE CABLEADO HOY** — la capacidad vive a nivel runner/agente (`emit_fidelity_scores` forced-emit · evidencia: 0.95/0.92 del artefacto d18b3370 · sombra F1.2) · el forced-emit del Lazo A es NO-vinculante | **pieza a CONSTRUIR** en el sprint de la Jefatura — el grader que decide canon del cimiento (el cableado Q2 del consejero lo asumía existente · corregido acá) |
| Scorer sombra cross-model (patrón F1.2) | dead-end · registra delta en `metadata.fidelity_forced_emit.shadow_scoring` | contrapeso del cimiento · fuera del path bloqueante |
| Los 3 jefes (auditados CC#2 05-jul 15:17 · `raw/findings/2026-07-05-audit-jefatura-graders.md`) | identidades reales: `brand_strategist`="Brand Guardian" (qa-reviewer-B · lente posicionamiento+ICP) · `editor_en_jefe`="Reality Checker" (qa-reviewer-A · PRIMARY · lente voz/factual) · `jefe_client_success`="Account Strategist" (qa-reviewer-C · lente cliente) · **todos `claude-sonnet`** (NO los "2 Haiku" del §10.1 viejo) · naming fragmentado (underscore/hyphen/qa-slot) resuelto por alias-map **frágil** · umbrales verificados en `tabulate.ts`: ≥2 green + 0 red → approved · ≥2 red → rejected · resto → HITL · amber advisory · red exige ≥1 corrección (coincide con §3 de este ADR) · el voto corrió E2E UNA vez (smoke `5e1f534a` · 2g/1a/0r → approved) · **nunca orgánico** (0 contenido real votado) | correctores universales + votantes SOLO de contenido · **naming único = requisito del registry (pre-build · mata el alias-map)** |
| Braintrust (auditado CC#4 05-jul 15:19 · `raw/findings/2026-07-05-audit-jefatura-satelites.md`) | **STUB/SCAFFOLD ENV-GATED** — código importado en el runner pero todo tras `BRAINTRUST_API_KEY` (ausente en prod → cero spans) · golden set solo schema de diseño (`docs/braintrust-golden-set-schema.md` · 50 records) · **calibración NO existe** (coincide ADR-019 §148) | capa de calibración ENCIMA (F4.3) · pieza a ACTIVAR en el build (key + golden set etiquetado §144-d) · nunca en el path bloqueante |
| GPT-5.5 (auditado CC#4 05-jul 15:19) | **NOMINAL** — corre en Sonnet 4.6 (MODEL_MAP solo Claude → fallback L1029 · sin cliente GPT para agentes · `gpt-5.5-advisor` no está en el registro → no loadable) · la honestidad F1.2 (`effective_model`) ya evita que la traza mienta | cross-model `non_voting` (F3.4 = cablear MODEL_MAP **+ registro del agente**) · **cross-model REAL = pieza a construir** |
| Linkage evidencia CEREBRO→JEFATURA (auditado CC#4 05-jul 15:19) | **PROSA-ONLY · sin linkage claim→chunk** — `evidence_refs` no existe · `chunk_id` está en DB/RPC pero la capa app lo descarta (`client-brain.ts` + `brain-enrichment.ts`) · el consolidator alimenta al juez SOLO con `discovery_summary` (recorta client_name/industry/competitors/icp que el juez espera) | **groundedness verdadera (campo→chunk) = eslabón faltante del gate de fidelidad del cimiento** → requisito pre-build: M1 surfacea `chunk_id`/`evidence_refs` |
| Sustrato CEREBRO · RAG (auditado CC#1 05-jul 15:44 · `raw/findings/2026-07-05-audit-cerebro.md`) | **OPERATIVO · REAL, no stub** — ingest `persistDiscoveryToBrain`→`persist-chunks.ts:88-188` · embed 1536 `embed.ts:20-21` · RPC `query_client_brain` cosine · consumer `brain-enrichment.ts:101-157` → system prompt · metadata `brain_hit/chunks_count/query_ms/cost` (`agent-sdk-runner.ts:887-917`) · 484/484 chunks Náufrago embebidos + `provenance_tag` poblado (ADR-012 vivo) · `client_brand_books` ya es fuente (4 chunks) · gaps 06-09 cerrados (migraciones `271201`/`271210` · rag-search STUB→REAL) | la Jefatura **LEE de acá** (frontera CEREBRO↔JEFATURA) — el almacén del gate de fidelidad EXISTE y es real · lo que falta es el surfacing `chunk_id`/`evidence_refs` hasta el juez (fila anterior · M1) · riesgo A4 HNSW multi-cliente → backlog pre-multi-tenant (NO gatea el build single-tenant) |

- **Unifica bajo un nombre** lo que hoy está disperso: el voto de contenido + el Lazo A pasan a ser *implementaciones de graders* dentro del módulo Jefatura, no sistemas sueltos.
- **Alinea CLAUDE.md §10.1** (que aún describe el modelo viejo de 2 revisores Haiku) → 3 jefes (hoy **todos Sonnet** · verificado CC#2 15:17 · drift §10.1 confirmado) + graders por artefacto. El texto de alineación se corrige con la realidad verificada, no con el diseño aspiracional.
- **No rompe** ADR-011 (composición de jefes), ADR-012 (portero de datos del CEREBRO — capa distinta), ADR-018 (la sala despacha), ADR-019 (Braintrust/vendor policy).

## Estado honesto (§148) · qué falta antes de canonizar

**Nada se cablea. Esto es diseño $0.** Estado de las dos condiciones:

1. ✅ **Verificación §148 del gate — CUMPLIDA 05-jul 14:50 (CC#3 · $0 · file:line · rama "corregir"):** `hi5nwPCGUWHkGnT7` resultó ser **voto 3-de-N de CONTENIDO, NO scorer de fidelidad** (ver Mapa a lo desplegado). Aplica el criterio endurecido de Emilio (13:51): NO se canoniza el voto como gate del cimiento — **excluido por diseño en este ADR** (el voto queda grader de contenido únicamente). Sin circularidad viva que corregir en prod: el gate está huérfano — nada rutea el brand book por él hoy (la corrección es de diseño, no un fix de cableado). Consecuencia constructiva: **el gate de fidelidad del cimiento no existe cableado → pieza explícita del sprint de construcción.**
2. ✅ **Revisión del DRAFT por el consejero — APROBADO 05-jul 16:55** (v2.3 + Anexo M1 · cierra P2+P4 · registry en tabla DB sin objeción · condición del green-light: las 6 marcas del review del sprint —foldea Lenovo en su doc— + sus 2 endurecimientos —foldeados acá abajo, v2.4— · revisa el lote doc-only antes del merge).

Cumplidas ambas, se canoniza en CLAUDE.md (vocabulario único P2-10) con ratificación §144-e de Emilio. La **reactivación + wiring** siguen siendo GO reservado de Emilio (servido: cap=1 · ~$1-1.5 · $0-wire → UNA corrida real en ventana quieta, regla real-run Q1).

**Requisitos pre-build (vinculantes · del criterio del consejero 14:34):**
- **Observabilidad M1 primero:** la instrumentación de la Jefatura a `agent_invocations.metadata` se define ANTES del build — es el sustrato que Braintrust consume (F4.3) y la lección del postmortem #249 (T.2).
- **Loop-cap CENTRAL en el módulo** (no per-workflow): un solo lugar que acota, imposible de olvidar — la lección del bb-worker degenerado.
- **Build = generalizar lo existente** (Lazo A + scorer de fidelidad + voto 3-de-N → un servicio), NO inventar graders nuevos — "profundizar, no ensanchar". El arranque del build = transición de fase → GO de Emilio.
- **Naming único de jefes en el registry** (CC#2 15:17): el alias-map underscore/hyphen/qa-slot es frágil — el registry de la Jefatura fija UN nombre canónico por jefe y mata el alias-map.
- **Groundedness verdadera claim→chunk** (CC#4 15:19): el gate de fidelidad del cimiento necesita `evidence_refs`/`chunk_id` surfaceados hasta el juez (hoy prosa-only: la capa app descarta el `chunk_id` y el consolidator recorta los campos que el juez espera) — se define junto con la instrumentación M1, es parte del mismo sustrato.

**Endurecimientos del consejero (05-jul 16:55 · vinculantes · elevan los ítems 1+2 de auditoría CC#4 de "foldear" a PRECONDICIÓN — integridad del gate, no cosmético):**
- **Ítem 1 · consolidator = HARD pre-F2.2:** sin `client_name/industry/competitors/icp` llegando al juez, el score sale de input empobrecido (garbage-in). Se arregla en F1 del sprint de construcción, ANTES de la corrida real de calificación.
- **Ítem 2 · `evidence_refs` = TARGET del path cimiento, no backlog eterno:** mientras el surfacing claim→chunk no exista, la traza declara `grounding: prose_only` (Anexo M1) y NO se sobre-vende — el resultado se reporta **"calificado PROVISIONAL (grounded por prosa)"**, NUNCA "gateado por groundedness real". Un score de fidelidad sobre prosa que se hace pasar por groundedness es el mismo falso-verde ya cazado (dry_run≠real · sombra same-model · "hecho"≠productivizado). El gate del cimiento está "de verdad hecho" recién con `evidence_refs` real.
- **Golden set (carry-over a F3 del sprint de construcción):** 49 total es delgado para calibrar — estructurar por dimensión (50-100 por dimensión) + medir acuerdo humano (kappa) ANTES del etiquetado §144-d de Emilio, o el ≥85% de F4 es inalcanzable por diseño.

## Anexo M1 · Spec de observabilidad de la Jefatura (P4 del sprint de construcción · pre-build · vinculante)

**Principio (T.2 aplicado a la Jefatura · lección postmortem #249):** cada resolución deja traza §148-queryable ANTES de construirse el servicio. Ningún nodo del build se da por diseñado sin declarar QUÉ escribe de este namespace. Es también el sustrato exacto que Braintrust consume (F4.3).

**1 · Namespace `metadata.jefatura` — en CADA invocación de jefe/scorer dentro del módulo:**
- `review_id` (uuid de la resolución · agrupa las N invocaciones de una misma pieza)
- `artifact_type` · `artifact_id` · `client_id` · `journey_id` (el sobre del contrato · copiado literal)
- `policy_id` + `policy_snapshot {mecanismo, threshold, max_cycles}` (la fila de `jefatura_grading_policies` VIGENTE al decidir — auditable aunque la tabla cambie después)
- `role`: `corrector | votante | fidelity_scorer | shadow | non_voting` (rol de ESTA invocación)
- `cycle` (0-based · el contador independiente del Lazo A viaja acá · el loop-cap central se audita contra este campo)
- `nominal_agent` + `effective_model` (condición F1.2 heredada · la traza NUNCA miente el modelo)
- `workflow_id` + `workflow_execution_id` (§149 · ya obligatorio)

**2 · El veredicto — una vez por resolución (invocación decisora + fila en `editorial_decisions`):**
- `verdict`: `pass | corrections | escalate` (+ `vote_tally {green, amber, red}` si contenido)
- `scores`: fidelidad por campo factual + agregado (cimiento) · confidence (contenido)
- `corrections_count` + `corrections_ref` (el contrato exige ≥1 SIEMPRE — cero correcciones = bug, se detecta acá)
- `evidence_refs[]`: chunk_ids del CEREBRO usados como grounding (eslabón CC#4 · claim→chunk) · `grounding: chunk_linked | prose_only` declarado — mientras el surfacing no exista, la traza lo dice en vez de aparentar groundedness
- `cost_usd` de la resolución completa (suma de invocaciones · alimenta §150 + presupuesto T.3)

**3 · Persistencia y transporte:** `editorial_decisions` sigue siendo la tabla de veredictos · cada fila referencia `review_id`. En v1 (sub-workflow) NO se emiten eventos a la sala (en sombra) — cuando la sala viva, estos MISMOS campos viajan en `jefatura.resolved` (cambia el transporte, no el contrato de traza).

**4 · Queries §148 predefinidas (el build las deja corriendo, no las improvisa):** resoluciones por artifact_type/cliente/período · % con `evidence_refs` no-vacío (meta: 100% en cimiento) · acuerdo judge-vs-sombra (patrón F1.2) · costo por resolución vs cap · ciclos consumidos vs `max_cycles`.

**5 · Braintrust:** consume EXACTAMENTE este namespace (spans = `review_id`) + golden set etiquetado (§144-d) → score de acuerdo. Si `BRAINTRUST_API_KEY` falta, la traza local basta para calibración manual y el campo `braintrust_exported: false` lo declara (fail-open honesto · no silencioso).

## Consecuencias

**A favor:** una sola verdad de calidad · productores nuevos se enganchan por evento (sin reimplementar) · no-circularidad garantizada por diseño · satélites (fidelidad/Braintrust/GPT-5.5) con rol inequívoco · vocabulario único mata el drift de nombres.
**Costo:** exige la tabla de políticas + el contrato de entrada + la rama "corregir" estándar en productores (patrón único, capa transversal — ya especificado en SPEC-lazo §6). Es construcción, va al sprint que Lenovo prepara con este diseño.
**Riesgo vigilado:** que un productor futuro llame a la Jefatura con lógica propia en vez de por evento → romper el acople limpio. Mitigación: el contrato de entrada único + enforcement de que la promoción/publicación solo ocurre por `jefatura.verdict` del log.

---

**Firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 · (DRAFT · gatea: verificación §148 del gate de fidelidad + validación del consejero → canonización §144-e de Emilio)
**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 15:05 · (DRAFT v2 · foldeados: criterio de diseño del consejero 14:34 — fasing v1 sub-workflow-por-contrato → event-driven cuando la sala viva · loop-cap central · observabilidad M1 pre-build · registry en tabla DB (punto (b) a objetar en su revisión) — + verificación §148 del gate CUMPLIDA (CC#3 14:50 · file:line): `hi5nwPCGUWHkGnT7` = voto 3-de-N de CONTENIDO → excluido del path del cimiento por diseño · el gate de fidelidad del cimiento NO existe cableado → pieza del sprint de construcción · Mapa a lo desplegado agregado · resta SOLO revisión del draft por el consejero → §144-e)
**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 15:45 · (DRAFT v2.1 · inventario verificado de las 2 auditorías foldeado al Mapa a lo desplegado + requisitos pre-build: **CC#2 15:17 graders** — identidades reales de los 3 jefes · todos Sonnet (drift §10.1 confirmado) · umbrales del voto verificados `tabulate.ts` (coinciden con §3) · voto E2E una sola vez, nunca orgánico · naming único al registry · **CC#4 15:19 satélites** — Braintrust STUB/ENV-GATED (cero spans en prod) · GPT-5.5 NOMINAL (Sonnet · F3.4 = MODEL_MAP + registro del agente) · linkage CEREBRO→JEFATURA prosa-only → groundedness claim→chunk = eslabón faltante del gate de fidelidad, sumado a requisitos pre-build con M1 · texto de alineación §10.1 corregido a la realidad verificada · el diseño NO cambia — las auditorías lo confirman (piezas huérfanas · satélites fuera del path · gate del cimiento a construir) · resta SOLO revisión del draft por el consejero → §144-e)
**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 16:10 · (DRAFT v2.2 · auditoría CEREBRO de CC#1 (15:44 · `raw/findings/2026-07-05-audit-cerebro.md`) foldeada al Mapa a lo desplegado — lado almacén de la frontera: sustrato RAG **real, no stub** (ingest→embed 1536→RPC cosine→consumer→metadata · file:line) · 484/484 con provenance · `client_brand_books` nueva fuente · gaps 06-09 resueltos → el gate de fidelidad del cimiento tiene almacén real de dónde leer; su eslabón faltante sigue siendo el surfacing `chunk_id`/`evidence_refs` (CC#4 · M1) · riesgo A4 HNSW → backlog pre-multi-tenant, no gatea el build · el diseño NO cambia — 3ª auditoría que lo confirma · resta SOLO revisión del draft por el consejero → §144-e)
**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 16:45 · (DRAFT v2.3 · **Anexo M1 agregado — spec de observabilidad de la Jefatura (P4 del sprint de construcción · pre-build vinculante):** namespace `metadata.jefatura` con `review_id`/`policy_snapshot`/`role`/`cycle` · `nominal_agent`+`effective_model` (condición F1.2 heredada) · §149 obligatorio · veredicto con `corrections_count≥1` enforced-por-traza + `evidence_refs[]` con `grounding: chunk_linked|prose_only` declarado (eslabón CC#4 honesto hasta que el surfacing exista) · `cost_usd` por resolución (§150/T.3) · queries §148 predefinidas · Braintrust consume este namespace con `braintrust_exported` declarado · v1 sin eventos a la sala — mismo contrato de traza cuando se mude el transporte · el diseño NO cambia · resta SOLO revisión del draft por el consejero → §144-e)

**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 17:05 · (v2.4 · **APROBACIÓN del consejero 16:55 registrada — v2.3 + Anexo M1 · cierra P2+P4 · registry-en-DB sin objeción** · sus 2 endurecimientos FOLDEADOS: (1) integridad del gate de fidelidad — consolidator HARD pre-F2.2 + `evidence_refs` real = target del cimiento con reporte "calificado PROVISIONAL (grounded por prosa)" mientras no exista · (2) golden set estructurado por dimensión + kappa ANTES del §144-d · el diseño NO cambia · resta SOLO ratificación Emilio §144-e + GO de arranque — el lote doc-only de canonización lo revisa el consejero pre-merge)

**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 19:10 · (v2.6 · **criterio del consejero 17:30 sobre convergencia/autoridad FOLDEADO a §7** — turnos cruzados (su 17:30:25 · mi 17:30:50) y CONVERGENTES en el principio raíz "la vara objetiva decide · los críticos asesoran": suma tabulador determinista como autoridad del voto + HITL post-cap (7.2) · relevancia-al-gate como 2ª capa anti-over-correction + perilla de Emilio con default (7.3) · triage del creador (7.4) · **7.6 NUEVO: progreso monótono** — re-síntesis que no sube la fidelidad → STOP · moot en cap=1 · deja seguro el salto a ≥3 · medible por M1 (`cycle` + scores) · higiene: numeración duplicada corregida (Perilla de costo §7→§8) · nota §148: la edición v2.5 (17:30) quedó sin re-firma al pie — esta firma cubre v2.5 y v2.6 · resta SOLO el nod del consejero sobre §7 (su propio criterio ya adentro) → §144-e + GO de arranque de Emilio)

**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 21:05 · (v2.7 · **NOD del consejero sobre §7 REGISTRADO (20:48 · "merge fiel de los dos turnos · cero contradicciones · cierra el concern de Emilio") → §7 deja de gatear F1** · su aclaración foldeada como línea explícita en §7.3: el presupuesto top-N FOCALIZA al creador, NUNCA aprueba — la vara decide re-puntuando el resultado · blockers de groundedness sin resolver ⇒ fidelidad <0.85 ⇒ humano · el diseño NO cambia · con esto el ADR queda SIN gates propios: resta el fold de las 6 marcas por Lenovo en su sprint doc → §144-e de Emilio (ratificar + canonizar JEFATURA/CEREBRO · lote doc-only revisado por el consejero pre-merge) + GO de arranque)

**Re-firma:** Arquitecto de Sistema · **Fable** · 2026-07-05 21:40 · (**RATIFICADO §144-e + GO de arranque de Emilio — 21:30 vía Lenovo · fold de las 6 marcas de Lenovo 21:28 — este ADR es CANON VIGENTE** · Primera Revolución CERRADA (F0-F2 + transversales) · sprint JEFATURA ACTIVO como único plan activo · gates F3 transferidos con sus dueños (GO 3.1 Emilio · prueba del cap ítem 6 = GO delegado del consejero encolado · §144-d) · encargo de canonización ejecutado de mi lado: lote doc-only redactado y servido al consejero pre-merge — `LOTE-DOC-canonizacion-JEFATURA-CEREBRO-2026-07-05.md` (E1-E8 canon CLAUDE.md: glosario + filas §6 JEFATURA/CEREBRO con ground truth 04/05-jul + §7 capas + pilar 4 + snapshots + §16 nuevo con taxonomía/convergencia/3-jefes-Sonnet/regla real-run Q1/observabilidad M1 · E9 repo §10.1 drift "2 Haiku"→3 jefes Sonnet) · renombres físicos siguen diferidos per Emilio 14:26: tablas prod → backlog · display-names n8n → sprint de construcción)

*Regla de mantenimiento: quien actualice este ADR, re-firma al pie.*
