# Braintrust Golden Set · Schema de evaluación de calidad de contenido

**Autor:** CC#3 · 2026-06-29
**Estado:** DISEÑO · §144 STOP — no conectar a la API de Braintrust hasta que Emilio provea `BRAINTRUST_API_KEY`
**Scope:** estructura del golden set (~50 ejemplos) para evaluar la calidad del contenido generado por los agentes (posts, copies, reportes)
**Proyecto Braintrust:** org `681199c4` · proj `9a1f2db0` · base URL `https://api-eu.braintrust.dev` (región EU)

---

## 0 · Resumen ejecutivo

El golden set es un dataset versionado en Braintrust que sirve como **vara de medición fija** para la calidad del contenido que producen los agentes. Cada ejemplo describe una petición de generación (`input`), una referencia ideal + rúbrica (`expected`), y etiquetas para cortar resultados (`metadata`). El contenido de marketing **no tiene una única respuesta correcta**, así que la evaluación combina scorers determinísticos (límites, tokens obligatorios, idioma) con scorers LLM-as-judge (voz de marca, ajuste a la audiencia, precisión factual). Este doc define el contrato; la conexión a la API real queda diferida (§144) hasta tener la credencial.

**§148 honesto · qué NO cubre este diseño:** no valida tono subjetivo más allá de lo que un juez LLM puede aproximar; no mide rendimiento real de campañas (CTR/conversión — eso es PostHog/ads, no Braintrust); no reemplaza la revisión humana HITL del primer contenido por cliente. Es un test de regresión de calidad, no una garantía de performance comercial.

---

## 1 · Mapeo de conceptos Braintrust

| Concepto Braintrust | Uso en Zero Risk |
|---|---|
| **Dataset** | El golden set versionado (`zr-content-golden-v1`) · ~50 records |
| **Record** | Un caso de evaluación · `{ input, expected, metadata }` |
| **`input`** | La petición de generación que recibe el agente (brief + contexto cliente + restricciones) |
| **`expected`** | Referencia ideal + rúbrica + restricciones duras (NO se usa para exact-match en contenido abierto) |
| **`metadata`** | Etiquetas para slicing (tipo, plataforma, idioma, dificultad, client_id) |
| **Experiment** | Una corrida de eval · el agente genera `output`, los scorers lo puntúan vs `expected` |
| **`output`** | Lo que el agente produce en la corrida (NO vive en el dataset · lo genera el experimento) |
| **Scorer** | Función 0..1 que puntúa `output` contra `input`/`expected` |

Contrato clave: **el dataset guarda `input` + `expected` + `metadata`. El `output` lo produce cada experimento, no se almacena en el golden set.**

---

## 2 · Schema del record

### 2.1 · `input` (la petición de generación)

```jsonc
{
  "content_type": "post | copy | report",        // familia principal
  "subtype": "instagram_caption",                  // ver tabla §3
  "language": "es | en",                            // idioma objetivo del output
  "brief": "Texto de la tarea · qué generar y para qué",
  "client_context": {
    "client_id": "uuid | synthetic-...",            // synthetic-* para ejemplos sintéticos
    "industry": "seguridad industrial",
    "brand_voice": "profesional · cercano · sin tecnicismos vacíos",
    "audience_icp": "gerentes de planta · PYMES manufactureras Ecuador",
    "own_handles": { "instagram": "@...", "youtube": "@..." }  // opcional
  },
  "constraints": {
    "max_chars": 2200,                              // límite duro de plataforma
    "must_include": ["CTA", "#seguridadlaboral"],  // tokens/elementos obligatorios
    "must_avoid": ["promesas absolutas", "datos inventados"],
    "format": "caption + 3-5 hashtags",            // forma esperada
    "cta_required": true
  },
  "brain_context": [                                // chunks RAG opcionales (Capa 0)
    { "chunk": "El cliente prioriza cumplimiento normativo INEN...", "source": "brand_book" }
  ]
}
```

**Canon redes sociales (§Stack V4):** cuando `subtype` sea social, la lista de plataformas posibles es Instagram + Facebook + TikTok + LinkedIn + **YouTube** (YouTube siempre incluido).

### 2.2 · `expected` (referencia + rúbrica)

```jsonc
{
  "reference_output": "Un ejemplo gold del contenido ideal (orientativo · NO exact-match)",
  "rubric": [
    { "dimension": "brand_voice",        "weight": 0.20, "guidance": "Coincide con brand_voice del cliente · sin jerga vacía" },
    { "dimension": "audience_fit",       "weight": 0.15, "guidance": "Habla al ICP · relevante a su dolor" },
    { "dimension": "constraint_compliance","weight": 0.20, "guidance": "Respeta max_chars + must_include + format" },
    { "dimension": "factual_accuracy",   "weight": 0.20, "guidance": "Cero datos/estadísticas inventadas (§148)" },
    { "dimension": "clarity",            "weight": 0.10, "guidance": "Claro · legible · bien estructurado" },
    { "dimension": "cta_strength",       "weight": 0.10, "guidance": "CTA presente · accionable · específico" },
    { "dimension": "originality",        "weight": 0.05, "guidance": "No genérico · no plantilla obvia de IA" }
  ],
  "hard_constraints": {                              // fallan el caso si se violan (gate)
    "must_include_all": ["CTA"],
    "must_avoid_any": ["dato numérico sin fuente"],
    "max_chars": 2200,
    "language": "es"
  },
  "ideal_behavior": "generate"                       // generate | refuse | ask_clarification (ver §4 negativos)
}
```

Los pesos de cada `rubric` suman 1.0. El score compuesto del caso = suma ponderada de los scorers LLM-judge, **multiplicado por 0 si falla cualquier `hard_constraint`** (gate determinístico — un post que excede el límite de caracteres o inventa un dato no puede "compensar" con buena voz).

### 2.3 · `metadata` (slicing)

```jsonc
{
  "content_type": "post",
  "subtype": "instagram_caption",
  "platform": "instagram",
  "language": "es",
  "difficulty": "easy | medium | hard | adversarial",
  "client_id": "synthetic-perez-001",
  "tags": ["cta", "hashtags", "brand_voice"],
  "source": "synthetic | real_redacted",            // origen del caso
  "golden_version": "v1"
}
```

---

## 3 · Taxonomía de tipos y subtipos

| `content_type` | `subtype` | Plataforma/uso | Restricción típica |
|---|---|---|---|
| **post** | `instagram_caption` | Instagram | ≤2200 char · 3-5 hashtags |
| post | `linkedin_post` | LinkedIn | tono profesional · ≤3000 char |
| post | `tiktok_script` | TikTok | guion 15-30s · hook en 3s |
| post | `youtube_description` | YouTube | ≤5000 char · timestamps + CTA |
| post | `facebook_post` | Facebook | conversacional · CTA |
| **copy** | `ad_headline` | Meta/Google Ads | ≤40 char · gancho |
| copy | `ad_primary_text` | Meta Ads | ≤125 char visibles |
| copy | `landing_hero` | Landing Next.js | titular + subtítulo + CTA |
| copy | `email_subject` | Resend | ≤60 char · sin spam-words |
| copy | `cta_button` | Landing/email | ≤5 palabras · accionable |
| **report** | `weekly_report` | Notion/cliente | estructura RAG + métricas reales |
| report | `qbr` | Notion/cliente | resumen ejecutivo + RAID |
| report | `campaign_recap` | Notion/cliente | resultados + aprendizajes |

---

## 4 · Casos negativos / adversariales (§148)

El golden set incluye casos donde **la respuesta correcta NO es generar contenido**, para verificar que el agente no alucina ni inventa:

- **Brief insuficiente** → `ideal_behavior: ask_clarification`. Ej. "Hacé un post" sin industria/audiencia → el agente debe pedir contexto, no inventar.
- **Bait de alucinación** → `ideal_behavior: generate` pero `hard_constraints.must_avoid_any` incluye estadísticas. Ej. "Escribí un copy sobre cuánto reducimos accidentes" sin datos provistos → el agente debe escribir sin inventar un número.
- **Restricción imposible** → `ideal_behavior: refuse | ask_clarification`. Ej. titular de 40 char que debe incluir 3 keywords largas → señalar el conflicto.
- **Idioma cruzado** → input pide `es` pero brain_context viene en inglés → output debe respetar `es`.

---

## 5 · Diseño de scorers

### 5.1 · Determinísticos (rápidos · sin LLM · gate)

| Scorer | Qué mide | Implementación |
|---|---|---|
| `char_limit` | output ≤ `max_chars` | `len(output) <= max_chars ? 1 : 0` |
| `must_include` | todos los tokens obligatorios presentes | set-contains |
| `must_avoid` | ningún token/patrón prohibido | regex/set-not-contains |
| `language_match` | idioma del output == `language` | langdetect |
| `format_shape` | hashtags/timestamps/estructura según subtype | regex por subtype |
| `number_has_source` | todo dígito-estadística tiene fuente en brain_context | regex + cross-check (§148) |

### 5.2 · LLM-as-judge (una dimensión por scorer · rúbrica §2.2)

Cada dimensión de la rúbrica es un scorer juez independiente (Braintrust `autoevals` custom o `LLMClassifier`), puntuando 0..1 con la `guidance` como criterio. Modelo juez sugerido: `claude-sonnet-4-6` (barato · suficiente para juicio de calidad; reservar opus solo si hay desacuerdo). El juez recibe `input`, `output` y `reference_output`, y devuelve score + justificación.

**Anti-sesgo:** el juez NO ve el score de otros jueces (independencia) · se le instruye a penalizar genericidad y "sabor a IA" · `reference_output` es orientativo, no plantilla a copiar.

### 5.3 · Score compuesto

```
hard_gate = AND(todos los scorers determinísticos de hard_constraints)
quality   = Σ (rubric.weight_i × judge_score_i)
final     = hard_gate ? quality : 0
```

---

## 6 · Composición del golden set (~50 ejemplos)

| `content_type` | Ejemplos | Desglose dificultad |
|---|---|---|
| post | 22 | 8 easy · 8 medium · 4 hard · 2 adversarial |
| copy | 18 | 6 easy · 7 medium · 3 hard · 2 adversarial |
| report | 10 | 3 easy · 4 medium · 2 hard · 1 adversarial |
| **Total** | **50** | 17 easy · 19 medium · 9 hard · **5 adversarial** |

**Cobertura por idioma:** ~70% `es` · ~30% `en` (la agencia es agnóstica · default español canon §15).
**Cobertura por plataforma social:** ≥1 caso de cada una (Instagram · Facebook · TikTok · LinkedIn · YouTube) para honrar el canon de redes sociales.
**Origen:** mayoría `synthetic` (cliente de práctica `synthetic-perez-001`) · algunos `real_redacted` derivados del piloto Pérez/Náufrago con datos sensibles removidos.

---

## 7 · Ejemplos completos (worked examples)

### 7.1 · Post · Instagram · medium

```jsonc
{
  "input": {
    "content_type": "post", "subtype": "instagram_caption", "language": "es",
    "brief": "Post educativo sobre la importancia del equipo de protección personal (EPP) en plantas de manufactura. Objetivo: posicionar al cliente como experto y generar consultas.",
    "client_context": {
      "client_id": "synthetic-perez-001",
      "industry": "seguridad industrial",
      "brand_voice": "experto · cercano · práctico · sin alarmismo",
      "audience_icp": "gerentes de planta y jefes de seguridad · PYMES manufactureras Ecuador"
    },
    "constraints": {
      "max_chars": 2200, "cta_required": true,
      "must_include": ["CTA", "#seguridadindustrial"],
      "must_avoid": ["estadísticas sin fuente", "promesas absolutas"],
      "format": "caption + 3-5 hashtags"
    }
  },
  "expected": {
    "reference_output": "El EPP no es un trámite, es la última barrera entre tu equipo y un accidente... [caption ejemplo] ¿Querés una revisión gratuita de tu protocolo de EPP? Escribinos. #seguridadindustrial #EPP #prevención",
    "rubric": [
      {"dimension":"brand_voice","weight":0.20,"guidance":"Experto y cercano · sin alarmismo ni jerga vacía"},
      {"dimension":"audience_fit","weight":0.15,"guidance":"Habla a gerentes de planta · dolor real"},
      {"dimension":"constraint_compliance","weight":0.20,"guidance":"≤2200 char · incluye CTA + #seguridadindustrial + 3-5 hashtags"},
      {"dimension":"factual_accuracy","weight":0.20,"guidance":"Sin números inventados"},
      {"dimension":"clarity","weight":0.10,"guidance":"Legible · escaneo fácil"},
      {"dimension":"cta_strength","weight":0.10,"guidance":"CTA específico y accionable"},
      {"dimension":"originality","weight":0.05,"guidance":"No genérico"}
    ],
    "hard_constraints": {"must_include_all":["CTA","#seguridadindustrial"],"max_chars":2200,"language":"es","must_avoid_any":["dato numérico sin fuente"]},
    "ideal_behavior": "generate"
  },
  "metadata": {"content_type":"post","subtype":"instagram_caption","platform":"instagram","language":"es","difficulty":"medium","client_id":"synthetic-perez-001","tags":["cta","hashtags","brand_voice"],"source":"synthetic","golden_version":"v1"}
}
```

### 7.2 · Copy · Ad headline · hard (límite duro)

```jsonc
{
  "input": {
    "content_type":"copy","subtype":"ad_headline","language":"es",
    "brief":"Titular de anuncio Meta para campaña de auditorías de seguridad. Gancho directo.",
    "client_context":{"client_id":"synthetic-perez-001","industry":"seguridad industrial","brand_voice":"directo · confiable","audience_icp":"dueños de PYME"},
    "constraints":{"max_chars":40,"cta_required":false,"must_avoid":["signos de exclamación múltiples","mayúsculas sostenidas"]}
  },
  "expected":{
    "reference_output":"Tu planta, ¿lista para una auditoría?",
    "rubric":[
      {"dimension":"constraint_compliance","weight":0.35,"guidance":"≤40 caracteres ESTRICTO"},
      {"dimension":"brand_voice","weight":0.20,"guidance":"Directo y confiable"},
      {"dimension":"audience_fit","weight":0.20,"guidance":"Relevante a dueño de PYME"},
      {"dimension":"cta_strength","weight":0.15,"guidance":"Gancho que invita a click"},
      {"dimension":"originality","weight":0.10,"guidance":"No cliché"}
    ],
    "hard_constraints":{"max_chars":40,"language":"es"},
    "ideal_behavior":"generate"
  },
  "metadata":{"content_type":"copy","subtype":"ad_headline","platform":"meta","language":"es","difficulty":"hard","client_id":"synthetic-perez-001","tags":["char_limit"],"source":"synthetic","golden_version":"v1"}
}
```

### 7.3 · Adversarial · brief insuficiente

```jsonc
{
  "input":{
    "content_type":"post","subtype":"linkedin_post","language":"es",
    "brief":"Hacé un post para LinkedIn.",
    "client_context":{"client_id":"synthetic-unknown-001"},
    "constraints":{}
  },
  "expected":{
    "reference_output":"Para escribir un post efectivo necesito: ¿qué industria/cliente es?, ¿cuál es el objetivo (awareness, leads, autoridad)?, ¿quién es la audiencia? y ¿hay un mensaje o dato puntual que querés destacar?",
    "rubric":[
      {"dimension":"asks_right_questions","weight":0.70,"guidance":"Pide industria + objetivo + audiencia · NO inventa contenido"},
      {"dimension":"clarity","weight":0.30,"guidance":"Pregunta clara y concisa"}
    ],
    "hard_constraints":{"must_avoid_any":["contenido inventado con datos del cliente"],"language":"es"},
    "ideal_behavior":"ask_clarification"
  },
  "metadata":{"content_type":"post","subtype":"linkedin_post","platform":"linkedin","language":"es","difficulty":"adversarial","client_id":"synthetic-unknown-001","tags":["insufficient_brief","no_hallucination"],"source":"synthetic","golden_version":"v1"}
}
```

---

## 8 · Plan de conexión (DIFERIDO · §144 STOP)

**No ejecutar hasta que Emilio provea `BRAINTRUST_API_KEY`.** Cuando esté disponible:

1. Agregar `BRAINTRUST_API_KEY` a las credenciales (Vercel + `.env.local`) — tarea de empleado navegador, no de Emilio más allá de proveer la clave.
2. Construir los 50 records como JSONL siguiendo el schema §2 (`zr-content-golden-v1.jsonl`).
3. Crear/poblar el dataset vía API:
   - Base URL: `https://api-eu.braintrust.dev`
   - Auth: `Authorization: Bearer $BRAINTRUST_API_KEY`
   - Org `681199c4` · proj `9a1f2db0`
   - `POST /v1/dataset` (crear si no existe) → `POST /v1/dataset/{id}/insert` (batch de records).
4. Definir los scorers (§5) como funciones del SDK Braintrust o `autoevals`.
5. Primera corrida de eval con un modelo baseline · establecer el piso de calidad.
6. Wire de regresión: correr el eval en CI cuando cambien prompts de los agentes de contenido (gate de calidad pre-merge).

**Pre-claim checklist (§ground-truth):** ningún número de "score" o "calidad" es citable hasta que exista una corrida real con la API. Este doc es solo el contrato de diseño.

---

## 9 · Versionado

- `golden_version: v1` en todos los records de esta primera tanda.
- Cambios futuros (nuevos subtipos, re-pesos de rúbrica) → `v2`, manteniendo `v1` para comparar regresiones históricas.
- El dataset en Braintrust se versiona nativamente; `golden_version` en metadata permite filtrar por tanda dentro de un mismo dataset.
