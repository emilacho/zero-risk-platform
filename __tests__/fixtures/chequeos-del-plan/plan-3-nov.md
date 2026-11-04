# Plan de campaña 90 días · Náufrago
**Período:** semanas 1-12 · noviembre 2026 – enero 2027
**Preparado por:** Zero Risk Agency
**Idioma del plan:** español · tuteo (declarado en el manual)

---

## Las cuatro puertas (antes de proponer nada)

### Puerta 1 · Capacidad de atender

La sede de Olón opera jueves a lunes de 07:00 a 15:00 [D78]. El punto de venta registró unos 20 clientes al mediodía de fin de semana (dato del negocio) [D60], con picos a las 13:00, 10:00 y 12:00 en octubre 2026 [ficha:5121f5f7]. El encebollado Náufrago fue el ítem con mayor ingreso en octubre: 409 unidades en el mes [ficha:4d116c86].

**Señal de capacidad disponible:** el negocio opera 5 días a la semana, cierra martes y miércoles. Si la pauta trae tráfico fuera del horario o en días cerrados, se pierde. Toda comunicación pagada se programa dentro de la ventana operativa.

**Sede Guayaquil:** aún no atiende al público [D76]. El plan puede construir expectativa y lista de espera para la apertura, pero no debe prometer atención ni servicio activo en Guayaquil todavía.

**Pregunta al negocio (pendiente):** ¿Cuál es la capacidad máxima de platos que la cocina puede despachar por turno en Olón? Sin ese dato, el plan no puede garantizar que la meta de 80 ventas/semana no desborde la operación.

### Puerta 2 · Medición mínima viva antes de gastar

El negocio no tiene píxel de seguimiento instalado [D67]. El sitio usa PostHog para analítica de comportamiento (medido en el sitio: 978 visitas, 416 personas distintas en 90 días; 72 eventos "menu_viewed", 48 "checkout_started", 4 "order_delivered") [fuente: analítica del dominio www.naufrago.ec, ventana 90 días, medido 2026-11-03]. La atribución es por dominio, no por cliente, y PostHog no puede conectar una visita al sitio con un anuncio en Meta.

**Lo que la plataforma de anuncios sí entrega sin píxel:** alcance, clics al enlace, costo por clic. Lo que no entrega: conversiones, retargeting de visitantes, optimización por compra. La campaña arranca en modo "tráfico" (clic al menú), no en modo "conversión".

**Acción mínima antes de gastar un dólar:** activar el Meta Pixel en naufrago.ec y configurar el evento "menu_viewed" o "checkout_started" como señal de conversión proxy. La agencia prepara las instrucciones; el negocio da acceso al gestor de etiquetas o al repositorio del sitio (alojado en Vercel [D28]).

**Hueco confirmado:** no se pudo verificar si GA4 o Meta Pixel están instalados hoy en naufrago.ec. Se trata como hueco, no como ausencia confirmada. Hay que verificarlo antes de la semana 1.

### Puerta 3 · El cuello de botella real

El embudo del sitio en los últimos 90 días muestra [fuente: analítica del dominio www.naufrago.ec]:
- 978 páginas vistas → 72 menú visto (tasa: ~7%)
- 72 menú visto → 69 carrito abierto (~96% de los que ven el menú abren el carrito)
- 69 carrito abierto → 48 checkout iniciado (~70%)
- 48 checkout iniciado → 3 pedidos enviados (~6%)
- 3 pedidos enviados → 4 pedidos entregados (posible margen de error de ventana temporal)

**El cuello real no está en traer tráfico: está en cerrar el pedido.** De cada 100 personas que abren el carrito, solo 6 completan el pedido. El problema está en el tramo checkout. Esto se resuelve antes de escalar el gasto en pauta. Las posibles causas: fricción en el pago (el sitio acepta cobro contra entrega en efectivo o coordinación por WhatsApp; el pago con tarjeta "está en camino" [D103]), zona de entrega fuera de cobertura, o abandono por tiempo de respuesta.

**Acción de la agencia en semana 1:** mapear los puntos de abandono en el checkout del sitio y proponer una mejora de flujo antes de escalar pauta.

### Puerta 4 · Las primeras 24-72 horas

El sitio declara: "recibimos tu mensaje, te respondemos en las próximas 24 horas laborables" [D40]. El negocio no tiene WhatsApp Business [D89]; los pedidos y consultas llegan al número personal (+593997744288 [D146]).

**Riesgo operativo:** si la pauta genera consultas o pedidos que no se responden en menos de 2 horas (restaurante de mariscos = decisión de hambre, no de planificación), la conversión cae y la reputación se daña.

**Estándar mínimo que el negocio debe comprometer antes de activar pauta:** respuesta a consultas por WhatsApp en menos de 30 minutos dentro del horario operativo. La agencia prepara respuestas tipo; el negocio las usa. Si el volumen de mensajes supera la capacidad de respuesta manual, se evalúa WhatsApp Business API (condición de activación, no acción inmediata).

---

## Sección 1 · El número

**Punto de partida (medido):**
- Octubre 2026: 4.530 USD en ingresos, 443 tickets, sede Olón [D9, D52]. Ticket promedio: 10,23 USD [D91].
- Últimos 30 días (al 2 de noviembre): 5.570,05 USD, 524 tickets, ticket promedio 10,63 USD [D90, D97, D139].
- Pico semanal: viernes, sábado y domingo concentran la mayor parte del volumen [ficha:5121f5f7].

**Nota sobre moneda:** los precios e ingresos se expresan en USD por omisión del país; nadie declaró la moneda formalmente. Se usa USD porque coincide con los precios del sitio y del punto de venta. Si el negocio opera en otra unidad, hay que declararlo.

**Meta del plan:**
- Meta prudente: 80 ventas por semana (supuesto de la oficina, no firmado).
- Meta ambiciosa: 150 ventas por semana (supuesto; techo teórico con audiencia extendida a Santa Elena completo desde semana 3).
- Plazo: semana 12 (finales de enero 2027).

**Aviso de la oficina (no bloquea el plan):** sin línea base de ventas por canal, la pauta se dimensiona para la meta total y puede quedar sobredimensionada si el negocio ya vende sin pauta. Se necesita separar ventas orgánicas de ventas atribuibles a pauta desde el primer día con medición activa.

---

## Sección 2 · El servicio que se empuja

**Una sola línea de ingreso: el Encebollado Náufrago (sede Olón).**

Razón: es el ítem con mayor ingreso en octubre (409 unidades, 1.432,00 USD en el mes) [ficha:4d116c86]. Es el plato más mencionado en reseñas [D7, D14, D26, D70, D113, D115, D180] y en menciones de terceros [D15, D57, D175, D176]. Tiene precio de entrada bajo (4,00 USD el encebollado Náufrago [D166]; 3,50 USD el Junior [D56]) que reduce la barrera de primera compra. El ticket promedio real del punto de venta (10,63 USD [D139]) sugiere que los clientes agregan más ítems una vez que deciden comprar.

**La sede de Guayaquil** no se empuja como canal de ventas activo todavía [D76]. El plan sí puede construir expectativa y captar interés antes de la apertura (contenido de "viene pronto", lista de espera por WhatsApp).

**Lo que no se empuja ahora:** burritos, quesadillas y los ítems "sin equivalente" en el catálogo [ficha:loyverse_mapa_de_items_meta]. No porque no vendan, sino porque concentrar el mensaje en el encebollado aprovecha el posicionamiento ya construido en reseñas y menciones.

---

## Sección 3 · La audiencia

**Definida por conducta y momento de decisión, no por edad:**

**Perfil principal (Olón):** persona que ya está en la zona costera de Santa Elena (turista, visitante de fin de semana, residente temporal) y siente hambre a media mañana o al mediodía. Busca en Google Maps o ve una publicación en Instagram → contacta por WhatsApp o entra al sitio → decide en minutos. La decisión es por impulso, no por planificación. [Fuente: público ideal del descubrimiento; no confirmado por el negocio, se usa para orientar mensaje y canales.]

**Señales que ya existen:**
- Reseñas en inglés y en español [D14, D70, D115, D153]: el público incluye turistas internacionales, especialmente del entorno surf.
- Menciones de cuentas de hospedaje y comunidad costera [D36, D74, D105, D126].
- Comentario directo: "Cerrando el feriado como se debe con el mejor encebollado de la zona" [D15] — confirma la estacionalidad de feriados como pico de tráfico.

**Segmentación operativa en Meta:**
- Geográfica: radio alrededor de Olón y zona costera de Santa Elena. Expandir a Santa Elena completo a partir de la semana 3 si la audiencia local se satura (señal: frecuencia > 3 en los primeros 14 días).
- Conductual: personas interesadas en playa, gastronomía ecuatoriana, surf, viajes costeros.
- En semana 3 en adelante: lookalike de quienes interactuaron con los primeros anuncios (condición: tener al menos 100 eventos de interacción acumulados).

**Perfil secundario (Guayaquil · construcción de expectativa):** residente de Guayaquil que conoce Náufrago de la costa o que busca delivery de mariscos en la ciudad. No se activa con pauta de conversión todavía; solo con contenido orgánico y captación de lista de espera.

---

## Sección 4 · La oferta

**Qué:** Encebollado Náufrago (4,00 USD [D166]) y Encebollado Junior (3,50 USD [D56]) como entrada; el ticket real promedia 10,63 USD [D139] porque el cliente agrega bebida, ceviche o chifle.

**Para quién:** el turista o visitante de playa que está en Olón y quiere comer mariscos frescos ahora, sin fila y sin complicaciones.

**Cuándo:** dentro del horario operativo, jueves a lunes, 07:00 a 15:00 [D78]. **Nota:** existe una discrepancia entre el horario del sitio (07:00-15:00 [D78, D144]) y la ficha de mapas (08:00-16:00 [D33]). Se usa el horario del sitio como fuente más reciente y pública. **Acción pendiente:** confirmar con el negocio el horario real vigente antes de publicarlo en anuncios o creativos.

**Qué incluye:** pedido desde el sitio (naufrago.ec) con checkout propio. Para Guayaquil: entrega por motorizado de PedidosYa [D71]. Para Olón: entrega por WhatsApp (canal confirmado); no hay evidencia de PedidosYa ni de checkout web activo para pedidos en Olón. **Este dato se corrige respecto a la versión anterior del plan:** el plan anterior asumía "delivery operativo vía PedidosYa y sitio web propio con checkout" para ambas sedes; PedidosYa está confirmado solo para Guayaquil [D71]; para Olón el canal de delivery es WhatsApp. **Pregunta pendiente al negocio:** ¿el checkout del sitio también procesa pedidos para Olón o solo para Guayaquil?

**Precio:** 4,00 USD el encebollado principal [D166], con ticket promedio real de 10,63 USD [D139]. Costo por plato: 2,10 USD (dato del negocio para uso interno; no es un margen calculado) [D111].

**Por qué creerlo:** 4,9 estrellas en Google Maps [D18] con 28 reseñas [D39]. Reseñas en español e inglés que mencionan explícitamente "el mejor encebollado" [D14, D115, D113]. Clientes internacionales que vuelven [D153].

**Siguiente paso:** clic al menú en naufrago.ec → pedido por WhatsApp (Olón) o checkout web (Guayaquil cuando abra). El botón de WhatsApp es hoy el CTA principal para Olón.

**Idea de marca que une las piezas:**

"Fresco como recién salido del mar" [D179] es la frase del propio negocio. La idea es: Náufrago es el único lugar en la costa donde el mar llega a ti, no al revés. Todos los creativos, textos y formatos deben evocar esa sensación: inmediatez, frescura, mar sin esfuerzo.

**Presupuesto para construir marca (no solo activar ventas):** el 20% del presupuesto de pauta se reserva para piezas de reconocimiento (Reels de ambiente, contenido de cocina, origen del producto [D12]) que no piden compra directa. La meta de recordación: que el nombre "Náufrago" aparezca en la mente del visitante de Olón antes de que sienta hambre, no después.

---

## Sección 5 · El camino (RACE)

### Alcanzar (Reach)

**Canal principal: Meta/Instagram (65% del presupuesto de pauta)**
Razón: la cuenta de Instagram @naufrago.ec existe con 1.235 seguidores [D85] y 19 publicaciones [D68]. El público turístico de Olón está en Instagram. Los competidores con mayor presencia digital también operan en Instagram. Es el canal con mayor masa crítica de evidencia para este negocio.

Estructura de campaña: 1 campaña CBO (presupuesto centralizado), 1-2 conjuntos de anuncios activos simultáneos. Con el presupuesto disponible, más conjuntos activos fragmentan el aprendizaje de la plataforma. La agencia crea las variantes creativas en volumen; el negocio aprueba antes de publicar.

**Canal de soporte: búsqueda local (25% del presupuesto de pauta)**
Google Maps y Google Search. No requiere producción de creativos visuales. La ficha pública del negocio ya tiene 4,9 estrellas [D18] y 28 reseñas [D39] — base para aparecer en búsquedas de "encebollado Olón" o "restaurante Olón". **Hueco:** no se pudo verificar si el perfil de Google Business está reclamado y verificado. Se trata como hueco, no como ausencia. Verificar en semana 1.

**Canal de soporte: video corto (10% del presupuesto de pauta)**
Reels en Instagram y/o TikTok. Náufrago no tiene cuenta confirmada en TikTok [ficha:busqueda_de_cuentas]. Los Reels se publican desde @naufrago.ec en Instagram. **Condición:** este canal solo escala si el negocio puede generar video propio (UGC del dueño o del equipo de cocina) o si se contrata producción externa. Sin video, el 10% se redistribuye a Meta/Instagram. **Pregunta al negocio:** ¿puedes grabar videos cortos de la cocina o del servicio una vez por semana?

**Canal diferido: base propia (0% hasta activación)**
El sitio tiene un programa de fidelización activo: Náufrago Club con acumulación de "tesoro" (4% por pedido) [D168], login sin contraseña [D94], historial de pedidos [D4]. **Esto es infraestructura de lista propia**, no ausencia de lista. Sin embargo, el negocio declaró "no tiene lista propia de clientes" [D62] — ese dato es de octubre 2026. **Acción en semana 1:** verificar con el negocio si el Náufrago Club genera una lista exportable de clientes con historial de pedidos. Si sí → activar base_propia desde semana 1 con esos datos. Si el club existe pero sin exportación operativa → documentarlo como hueco técnico y construir la exportación. La condición de activación ya no es "cuando el dueño construya lista": la infraestructura existe; el hueco es técnico, no estructural.

### Actuar (Act)

El anuncio lleva al menú en naufrago.ec. El embudo del sitio muestra que quien llega al menú, en un 96% abre el carrito [fuente: analítica del dominio www.naufrago.ec]. El problema no está en la atracción sino en el cierre (ver Puerta 3).

**Acciones de la agencia:**
- Crear 3-5 variantes de creativos por conjunto de anuncios (imagen estática, carrusel, Reel) con los colores del manual (#1a0828, #663772, #51d4b4) y las tipografías aprobadas (Bebas Neue para titulares, Inter para cuerpo [manual]).
- Textos de anuncio en tuteo, con la voz del sitio: "cuando tengas esa hambre de Náufrago, te espera" [D42], "fresco como recién salido del mar" [D179].
- Rotar y desactivar creativos con CTR < 1% después de 7 días y gasto mínimo equivalente a 3 veces el techo por resultado (ver §7).

**Acciones del negocio:**
- Aprobar creativos antes de publicar (tiempo estimado: 20 minutos por ronda de aprobación).
- Responder mensajes de WhatsApp en menos de 30 minutos dentro del horario operativo.

### Convertir (Convert)

**Olón:** el CTA es el botón de WhatsApp. La conversión se mide en pedidos confirmados por WhatsApp dentro del horario operativo.

**Guayaquil (cuando abra):** checkout web + entrega por PedidosYa [D71]. La conversión se mide en pedidos completados en el sitio.

**Mejora del flujo de checkout (acción de la agencia en semana 1):** mapear el abandono entre "checkout_started" (48 eventos) y "order_submitted" (3 eventos) [fuente: analítica del dominio]. Proponer una mejora de flujo específica antes de escalar pauta. La tasa actual de cierre (~6% desde carrito abierto) es el mayor limitante del plan.

**Métodos de pago actuales:** cobro contra entrega en efectivo al motorizado o coordinación previa por WhatsApp [D103]. El pago con tarjeta "está en camino" [D103]. Mientras no esté disponible, se menciona solo el pago en efectivo en los anuncios para evitar confusión.

### Fidelizar (Engage)

**El cliente regular vuelve al menos una vez a la semana** (dato del negocio) [D112]. Eso es un activo enorme: no hay que convencer a este cliente de volver; hay que asegurarse de que recuerde Náufrago cuando no está en Olón y de que traiga a alguien nuevo cuando regrese.

**Plan de recompra y retención:**
1. **Náufrago Club activo:** el programa de tesoro (4% por pedido) [D168] ya está en el sitio. La agencia crea contenido que recuerde al cliente canjear su tesoro antes de que expire.
2. **Contenido de retención en Instagram:** 1 publicación semanal de fondo (no de venta): cocina, origen del producto, equipo, momentos de playa. Esto mantiene al seguidor conectado entre visitas.
3. **Reseñas como ciclo:** después de cada pedido, la agencia prepara un mensaje tipo que el negocio envía por WhatsApp pidiendo una reseña en Google Maps. Meta: llegar a 50 reseñas (desde 28 [D39]) antes de la semana 8.
4. **Guayaquil · lista de espera:** captar interesados en la apertura desde las primeras semanas, con contenido de expectativa en Instagram y un enlace de pre-registro (por WhatsApp o formulario simple).

**Momentos de compra de este mercado (de las fuentes):**

| Momento | Señal | Acción |
|---|---|---|
| Feriado de Independencia de Cuenca | 3 noviembre 2026 [ficha:e8f664a3] | Pauta activa ese día desde las 07:00 |
| Fin de semana regular (viernes-sábado-domingo) | Pico de tickets [ficha:5121f5f7] | Pauta aumentada jueves noche - viernes mañana |
| Navidad 25 diciembre 2026 | Feriado [ficha:c7feb680] | Contenido especial + pauta |
| Año Nuevo 1 enero 2027 | Feriado [ficha:70b31f82] | Pauta al máximo semanal |
| Carnaval 8-9 febrero 2027 | Feriado de playa [ficha:5879940f, ficha:194c0fe9] | Pico máximo del horizonte; aumentar pauta 2 semanas antes |
| Vacaciones escolares costa | 1 feb - 31 mar 2027 [ficha:b6fde035] | Temporada alta para turismo costero; sostener pauta |

---

## Sección 6 · La prueba (qué le falta y cómo se resuelve)

**Lo que falta (no lo que ya tiene):**

| Brecha | Impacto | Cómo se resuelve | Plazo |
|---|---|---|---|
| Sin Meta Pixel en el sitio | Sin optimización por conversión, sin retargeting | La agencia entrega instrucciones de instalación; el negocio da acceso a Vercel o al repositorio del sitio | Semana 1 · antes de gastar pauta |
| Sin WhatsApp Business | Los pedidos y consultas llegan al número personal; sin métricas de respuesta | Evaluar WhatsApp Business API (la agencia prepara la comparativa de costos y opciones) | Semana 2 |
| Sin confirmación de Google Business Profile verificado | Riesgo de perder posición en búsqueda local | Verificar y optimizar el perfil (nombre, horario, fotos, enlace al sitio) | Semana 1 |
| Horario inconsistente entre sitio y ficha de mapas | Los anuncios pueden mostrar horario erróneo | Confirmar horario real con el negocio y actualizar en todas las plataformas | Semana 1 · urgente |
| Sin exportación de lista del Náufrago Club | No se puede activar retención por comunicación directa | Verificar si el sistema genera exportación; si no, construirla | Semana 1-2 |
| Sin atribución para pedidos de Olón por WhatsApp | No se puede medir cuántos pedidos vienen de la pauta | Usar un enlace de WhatsApp con parámetro UTM en los anuncios para trackear origen | Semana 1 |
| Checkout con tasa de cierre ~6% | El 94% de quienes abren el carrito no compran | Mapear el abandono y proponer mejora de flujo antes de escalar pauta | Semana 1 |
| Sin confirmación del canal de delivery en Olón | El plan anterior asumía PedidosYa para Olón sin evidencia | Confirmar con el negocio si el delivery en Olón opera por WhatsApp, por el sitio o por ambos | Semana 1 · urgente |

---

## Sección 7 · El presupuesto

**Origen del presupuesto:** el negocio declaró 200 USD por semana de presupuesto de pauta [D120]. Se trabaja con ese número como base declarada.

**Aviso importante:** las cifras de la oficina financiera no están firmadas. Se presentan como estimaciones (supuestos), no como datos confirmados. El presupuesto es una propuesta; quien aprueba toma la decisión final.

### Cadena del dinero

**a) La meta en ventas:**
- Meta prudente: 80 ventas por semana (supuesto).
- Meta ambiciosa: 150 ventas por semana (supuesto).

**b) Costo por resultado y por venta:**

Los siguientes valores son estimaciones (supuestos) de la oficina; no están firmados:

| Concepto | Estimación | Nota |
|---|---|---|
| Costo por resultado (clic al menú) | 0,59 USD (rango: 0,30 a 1,12 USD) | Supuesto; no medido todavía |
| Tasa de resultado a venta | 8% | Supuesto |
| Costo por venta (solo pauta) | 7,31 USD | Supuesto |
| Costo por venta (pauta + marca + producción) | 15,23 USD | Supuesto |
| Techo por resultado (regla de pausa) | 2,26 USD | Supuesto |

**Nota:** la contribución por venta (precio menos costos variables) **no se pudo calcular** porque no se conocen todos los costos variables. El costo por plato es 2,10 USD [D111], pero ese es el dato que el negocio usa para sus cuentas internas, no un margen calculado. La oficina financiera sí pudo calcular un equilibrio en los supuestos anteriores; ese cálculo depende de supuestos que el negocio debe confirmar.

**c) Escenarios:**

| | Escenario prudente | Escenario ambicioso |
|---|---|---|
| Meta semanal | 80 ventas/semana | 150 ventas/semana |
| Inversión mensual propuesta (pauta) | 800 USD/mes (200 USD/semana × 4) | 800 USD/mes (mismo presupuesto, meta más alta si el CPR baja) |
| Resultados necesarios por semana (a 8% de conversión) | ~1.000 resultados/semana | ~1.875 resultados/semana |
| Costo por resultado necesario para cubrir la meta con 800 USD/mes | 0,20 USD | 0,11 USD |
| Clientes para cubrir el costo de pauta mensual | Pendiente: requiere confirmar contribución por venta | Pendiente |

**Alerta:** con el presupuesto declarado de 200 USD/semana y el costo por resultado estimado de 0,59 USD, el techo teórico es ~339 resultados por semana, no 1.000. Para alcanzar 80 ventas a la semana con una tasa de conversión del 8% se necesitan 1.000 resultados, lo que requeriría ~590 USD solo en pauta de rendimiento por semana. Hay una brecha entre el presupuesto declarado y la meta declarada. **Esto se le presenta al negocio como una decisión:** o se ajusta la meta a lo que alcanza el presupuesto (~27 ventas/semana en el escenario base), o se aumenta el presupuesto. No es decisión de la agencia.

**Reparto del presupuesto mensual (propuesta, para 800 USD/mes):**

| Renglón | Monto mensual | Porcentaje | Razón |
|---|---|---|---|
| Meta/Instagram (pauta de rendimiento) | 480 USD | 60% | Canal principal con mayor evidencia de audiencia; incluye la reserva de marca (20% de este renglón = contenido de reconocimiento, no de respuesta directa) |
| Búsqueda local (Google) | 200 USD | 25% | Turista que ya busca activamente "encebollado Olón" o "restaurante Olón"; intención de compra alta, bajo costo en mercado pequeño |
| Video corto (Reels) | 80 USD | 10% | Solo si hay video propio disponible; si no, este 10% se suma a Meta/Instagram |
| Producción de contenido (creativos) | 40 USD | 5% | Monto mínimo para ajustes de arte; la agencia produce las variantes dentro de su servicio |

**Nota sobre el reparto:** no se usa un porcentaje fijo por costumbre. Los porcentajes salen de los canales donde está el público de Náufrago (Instagram confirmado con presencia activa, Google Maps con 4,9 estrellas) y de la capacidad creativa disponible (video condicionado a UGC del negocio).

**Prueba inicial (semanas 1-2):** entre 80 y 160 USD (10-20% de la pauta de rendimiento del horizonte) para validar el CPR real antes de escalar.

### Pauta por semana (semanas 1-12)

| Semana | Pauta de rendimiento | Nota |
|---|---|---|
| 1 | 0 | Instalación de Pixel, corrección de horario, mapeo de checkout |
| 2 | 0 | Prueba inicial de creativos, sin gasto de rendimiento |
| 3 | 160 USD | Prueba inicial (10-20% del horizonte) |
| 4 | 160 USD | Prueba; validar CPR real |
| 5 | 200 USD | Escala si CPR ≤ 2,26 USD |
| 6 | 200 USD | Mantener |
| 7 | 200 USD | Mantener |
| 8 | 200 USD | Mantener |
| 9 | 200 USD | Sostener; vacaciones escolares de la costa se acercan |
| 10 | 200 USD | Aumentar si el CPR bajó sostenidamente (ver regla de revisión) |
| 11 | 200 USD | Carnaval se acerca: preparar creativos estacionales |
| 12 | 200 USD | Cerrar horizonte; revisión completa |

---

## Sección 8 · La regla de revisión

**Quién es el dueño del resultado:** el negocio (quien aprueba el plan y tiene acceso a los ingresos reales del punto de venta). La agencia reporta; el negocio decide.

**Ritual:** 15-20 minutos cada 10-14 días. La agencia presenta dos números: cuánto costó este período y cuántos clientes llegaron. El negocio compara con sus ventas reales del punto de venta [D52, D109] para detectar si la pauta suma o si el negocio ya vendía igual sin ella.

**Regla de decisión (basada en el costo por resultado):**

| Situación | Acción |
|---|---|
| CPR ≤ 2,26 USD | Sigo: el canal está dentro del techo |
| CPR entre 2,26 y 4,52 USD por 7 días | Ajusto: recorto el presupuesto diario un 20% y reviso creativos |
| CPR > 4,52 USD por 7 días | Paro: suspendo pauta y diagnostico antes de reiniciar |
| 0 resultados después de gastar 3 veces el techo (6,78 USD sin un resultado) | Pausa técnica: algo está roto (pixel, enlace de destino, zona de segmentación) |
| Destino (WhatsApp o sitio) sin respuesta > 30 minutos de forma sostenida | Pausa técnica: la pauta trae gente que nadie atiende |

**Nada se juzga antes de:** día 14, 15 resultados medidos acumulados, o el ciclo de venta completo. Salvo fallo técnico confirmado.

**Sigo si:** CPR real está dentro del rango estimado (0,30-1,12 USD) y hay pedidos atribuibles.
**Ajusto si:** CPR sube más del 30% respecto a la semana anterior o la tasa de resultado a venta cae por debajo del 4%.
**Paro si:** CPR supera 4,52 USD por 7 días consecutivos o hay fallo técnico sin resolución en 48 horas.

---

## Calendario de 12 semanas

| Semana | Fecha | Tema | Formato | Acción principal |
|---|---|---|---|---|
| 1 | 3-9 nov 2026 | Infraestructura | — | Instalar Pixel, verificar Google Business, confirmar horario y delivery Olón, mapear checkout, verificar exportación Náufrago Club |
| 2 | 10-16 nov 2026 | Creativos iniciales | Imagen estática + carrusel | Producir 3 variantes de anuncio; prueba de publicación orgánica en Instagram; preparar respuestas tipo para WhatsApp |
| 3 | 17-23 nov 2026 | Lanzamiento de prueba | Anuncio Meta/Instagram | Activar pauta de prueba (10-20% del horizonte); monitorear CPR a diario |
| 4 | 24-30 nov 2026 | Prueba en curso | Anuncio + Reel (si hay video) | Revisar CPR al día 7; ajustar segmentación si frecuencia > 3 |
| 5 | 1-7 dic 2026 | Escala si el CPR lo permite | Anuncio + contenido de marca | Ampliar audiencia a Santa Elena si la local se saturó; publicar primer contenido de reconocimiento (origen del producto [D12]) |
| 6 | 8-14 dic 2026 | Reseñas y prueba social | Carrusel de reseñas | Campaña de solicitud de reseñas por WhatsApp post-pedido; publicar reseñas en Instagram (con permiso) |
| 7 | 15-21 dic 2026 | Navidad se acerca | Contenido de temporada | Creativos con mensaje de playa + Navidad; aumentar frecuencia viernes-domingo |
| 8 | 22-28 dic 2026 | Navidad (25 dic feriado) | Anuncio + Reel festivo | Pauta máxima semanal; revisar capacidad de atención antes de publicar |
| 9 | 29 dic 2026 - 4 ene 2027 | Año Nuevo (1 ene feriado) | Anuncio + contenido de brindis de mar | Pauta máxima; mensaje de "empieza el año con el mejor encebollado" |
| 10 | 5-11 ene 2027 | Vacaciones escolares de la costa (1 feb) | Contenido anticipatorio | Empezar a calentar la audiencia para el pico de febrero; contenido de "ven a Olón" |
| 11 | 12-18 ene 2027 | Pre-Carnaval | Contenido de expectativa | Creativos de Carnaval; aumentar presupuesto si el CPR sigue dentro del techo |
| 12 | 19-25 ene 2027 | Cierre del horizonte | Revisión + plan siguiente | Informe completo al negocio; definir si se extiende o se redimensiona el plan |

---

## Qué asumimos y de dónde lo sacamos

| Supuesto o hueco | Tipo | Fuente o razón |
|---|---|---|
| Moneda USD | Supuesto | El sitio muestra precios en USD; Ecuador usa USD como moneda oficial; nadie lo declaró formalmente en la ficha |
| CPR base Meta/IG: 0,59 USD (rango 0,30-1,12 USD) | Supuesto (oficina, sin firmar) | Estimación de la oficina financiera; no es un dato medido ni de plataforma; cambiará con los primeros días de pauta |
| Tasa de resultado a venta: 8% | Supuesto (oficina, sin firmar) | Estimación de la oficina; sin datos de atribución propios aún |
| Costo por venta (solo pauta): 7,31 USD | Supuesto (oficina, sin firmar) | Derivado de los supuestos anteriores |
| Costo por venta (con marca y producción): 15,23 USD | Supuesto (oficina, sin firmar) | Derivado; aviso de la oficina: con este costo, la primera venta deja solo 3,36 USD de ganancia por venta (supuesto) |
| Meta de 80 ventas/semana alcanzable con 200 USD/semana | Hueco / posible contradicción | Con CPR estimado de 0,59 USD y tasa del 8%, el presupuesto declarado genera ~27 ventas/semana, no 80. La brecha se le presenta al negocio como decisión. |
| Delivery en Olón por WhatsApp (no por PedidosYa) | Corrección respecto al plan anterior | El sitio confirma PedidosYa solo para Guayaquil [D71]; la sede Olón tiene delivery por WhatsApp según la descripción del negocio; no hay evidencia de PedidosYa en Olón |
| Náufrago Club genera lista exportable de clientes | Hueco técnico | El sistema de fidelización existe en el sitio [D88, D95, D168]; el negocio declaró "no tiene lista propia de clientes" [D62] en octubre 2026, antes del descubrimiento del sitio. Hay que verificar si el club genera exportación |
| Horario operativo: 07:00-15:00, jueves a lunes | Provisional | El sitio (fuente más reciente) dice 07:00-15:00 [D78, D144]; la ficha de mapas dice 08:00-16:00 [D33]. Se usa el sitio hasta confirmar con el negocio |
| Google Business Profile existe y está verificado | Hueco | No se pudo verificar (fuente no llegó a la junta). Se trata como hueco, no como ausencia |
| Meta Pixel instalado en naufrago.ec | Hueco | El negocio declaró "no tiene píxel" [D67]; el sitio usa PostHog [D150]; no se pudo confirmar si Meta Pixel está instalado adicionalmente. Se trata como hueco |
| Capacidad máxima de la cocina en Olón | Hueco | No hay dato en ninguna fuente. Pregunta pendiente al negocio |
| Atribución de pedidos por WhatsApp en Olón | Hueco | Sin UTM en el enlace de WhatsApp, no se puede saber si el pedido viene de la pauta o del tráfico orgánico |
| PedidosYa retorna datos de atribución de campañas externas | Hueco | ~60% del volumen de delivery en Guayaquil podría quedar ciego para atribución. No hay confirmación de PedidosYa sobre este punto |
| Capacidad del negocio para generar video propio (UGC) | Hueco | No hay dato. Determina si el canal de video corto (10% del presupuesto) se activa o se redistribuye |

---

## Qué no vamos a hacer todavía y por qué

| Qué | Por qué no ahora | Condición de activación |
|---|---|---|
| Pauta en Guayaquil (conversión) | La sede no atiende al público todavía [D76]; activar pauta de conversión antes de la apertura genera frustración | Cuando la sede esté abierta y operativa |
| WhatsApp Business API | El negocio no tiene WhatsApp Business [D89]; la API requiere cuenta Business activa y proceso de verificación | Cuando el negocio active WhatsApp Business y el volumen de mensajes supere la capacidad de respuesta manual |
| Retargeting de visitantes del sitio | Sin Meta Pixel instalado, no hay audiencia de retargeting acumulada | Cuando el Pixel lleve al menos 14 días activo con 100+ eventos de "menu_viewed" |
| TikTok | No hay cuenta confirmada de Náufrago en TikTok [ficha:busqueda_de_cuentas]; abrir una cuenta nueva requiere tiempo de crecimiento orgánico antes de que la pauta sea eficiente | Cuando la cuenta tenga al menos 10 videos publicados y señales de engagement orgánico |
| Email marketing | Sin lista propia exportable hoy [D62]; el canal requiere lista y consentimiento explícito [D110] | Cuando la exportación del Náufrago Club esté operativa y el negocio haya obtenido consentimiento de sus contactos |
| Pauta en Google Search (keywords genéricas) | El presupuesto es pequeño para keywords competitivas; el foco en búsqueda local es más eficiente con el perfil de Google Business | Cuando el perfil de Google Business esté optimizado y se tenga dato real de CPR local |
| Lookalike audiences | Se necesitan al menos 100 eventos de interacción acumulados en Meta para que el algoritmo construya un lookalike confiable | Semana 3 en adelante, si la prueba inicial acumula suficientes eventos |

---

## Qué tiene que pasar de tu lado esta semana

Estas son las acciones que necesita tomar el negocio. La agencia no puede hacerlas sola:

1. **Confirmar el horario real vigente** (10 minutos): ¿el local abre a las 07:00 o a las 08:00 y cierra a las 15:00 o a las 16:00? Con ese dato la agencia actualiza el anuncio y la ficha de mapas.

2. **Confirmar cómo llegan los pedidos de delivery en Olón** (5 minutos): ¿por WhatsApp al número personal, por el checkout del sitio, o por ambos? Este dato cambia el CTA de los anuncios.

3. **Dar acceso para instalar el Meta Pixel en naufrago.ec** (20-30 minutos con la agencia): sin el Pixel, la pauta no puede optimizar por conversión ni crear audiencias de retargeting. El sitio está en Vercel [D28]; la agencia entrega las instrucciones exactas.

4. **Confirmar si el Náufrago Club genera una lista exportable de clientes** (10 minutos): si existe, la agencia la usa desde la semana 1 para retención. Si no existe, la agencia construye la exportación.

5. **Confirmar si puedes grabar un video corto de la cocina o del servicio una vez por semana** (5 minutos de respuesta): esto decide si el canal de video corto (10% del presupuesto) se activa o se redistribuye.

6. **Revisar y aprobar las respuestas tipo para WhatsApp** que la agencia va a preparar (20 minutos): para que los pedidos que lleguen de la pauta tengan una respuesta en menos de 30 minutos.

---

## Identidad visual del plan

Todos los creativos, textos y piezas de este plan usan exclusivamente:

**Colores:** #1a0828 (principal) · #663772 · #2d1135 (secundario) · #51d4b4 (acento) · #38154b · #4b2855 [manual]

**Tipografías:** Caveat · Inter (cuerpo) · Alfa Slab One · Bebas Neue [manual]. Para titulares de anuncios: Bebas Neue. Para cuerpo de texto: Inter. Para detalles de carácter manuscrito o artesanal: Caveat o Homemade Apple.

No se usan otras fuentes ni colores fuera de esta lista, aunque existan en el sitio.

---

## Lo que NO se buscó y por qué

*(Para que quede registro; no son fallas del plan)*

- **Comparación de precios de competidores:** no corresponde al rubro; aplica solo a negocios que venden a otras empresas.
- **Velocidad del sitio:** no fue solicitada por ninguno de los rubros medidos; se excluye hasta que alguien la pida.
- **Capacidad de alojamiento:** no corresponde al rubro restaurante.
- **Manual de marca:** no es un objetivo de recolección en esta fase; entra antes de los brazos del plan.

---

*Este plan es una propuesta. Ninguna cifra de gasto se ejecuta sin aprobación del negocio. Las estimaciones de la oficina financiera son supuestos no firmados; el negocio las revisa antes de comprometer presupuesto.*

---

<<<RESOLUCION>>>
{"respuestas":[{"id":"jefe-0-0","estado":"tomada","razon":"Se separó el dato por sede: PedidosYa confirmado solo para Guayaquil (D71); para Olón el canal de delivery es WhatsApp. Se corrigió en secciones 5 (camino), 6 (prueba) y en qué asumimos. Se añadió pregunta al negocio sobre el checkout web en Olón."},{"id":"jefe-0-1","estado":"tomada","razon":"Se verificó que el Náufrago Club es infraestructura de lista propia activa (D88, D95, D168). La condición de activación cambió de 'cuando el dueño construya lista' a 'cuando se confirme exportación operativa'. Se añade como acción de semana 1 verificar la exportación con el negocio."},{"id":"jefe-0-2","estado":"tomada","razon":"Se adoptó el horario del sitio (07:00-15:00) como fuente provisional por ser la más reciente y pública (D78, D144). Se declaró la contradicción con la ficha de mapas (D33). Se añadió como acción urgente de semana 1 confirmar el horario real con el negocio antes de usarlo en pauta o creativos."}]}
<<<FIN_RESOLUCION>>>