/**
 * EL ÚNICO TOPE DE TAMAÑO DE UN PEDIDO (01-nov · firma de Emilio: «darle el tamaño máximo a todo para no perder corridas por un error sin sentido que no nos cuesta nada corregir»).
 * Es el límite REAL del modelo, con margen. Nada se recorta por debajo de esto por prudencia.
 * Por encima, el pedido se rechaza con un 400 gratis que dice el motivo: nunca se corta callado ni se cae a mitad de una corrida paga.
 *
 * 18-nov · firma de Emilio «nada se recorta» (G1 del barrido de topes · CC5) · de 600.000 a 1.500.000. La cuenta, MEDIDA y no supuesta:
 *   · los modelos de la cadena y la oficina (Opus 5.5, Sonnet 5.5, Sonnet 4.6, Opus 4.7) tienen 1.000.000 de tokens de contexto (referencia oficial de modelos)
 *   · `count_tokens` (gratis) sobre un texto real en español del vault (89.812 caracteres): Opus 5.5 = 2,10 caracteres por token · Sonnet 4.6 / Haiku 4.5 = 2,62
 *   · 1.000.000 − 128.000 de respuesta − ~100.000 de identidad, cerebro y vueltas de herramientas ≈ 770.000 tokens × ~2,0 ≈ 1.540.000 caracteres
 *   · el transporte aguanta: el corredor recibe hasta 4 MB (`express.json({ limit: '4mb' })` · el «1 MB» que citaba este comentario era el comentario viejo
 *     de `services/agent-runner/src/index.ts`, no el límite) y Vercel rechazó un cuerpo de 4,88 MB; 1,5 M caracteres en JSON son ≈ 1,7 MB
 * OJO · Haiku 4.5 tiene 200.000 tokens: le caben ≈ 250.000 caracteres (ya con el tope viejo de 600.000 un pedido así lo rechazaba la API). Ese caso no se
 * resuelve aquí: lo rechaza la API con su motivo, sin cobrar.
 */
export const TOPE_REAL_DEL_PEDIDO = 1_500_000

/** 01-nov · lo que escribe el dueño (unas 25.000 palabras): es un techo de cordura para un texto humano, no un recorte. La base lo exige igual en plan_cambios y notas_del_dueno (migración 202611012100), y n8n usa el mismo número en «⓪ Llave» */
export const TOPE_DEL_TEXTO_DEL_DUENO = 100_000
/** 18-nov · G2b (CC5): el mismo tope con otro nombre, para el código de la cadena, que no puede nombrar al cliente (prueba `cadena/__tests__/generalidad`). Igual al del tablero */
export const TOPE_DE_LO_ESCRITO = TOPE_DEL_TEXTO_DEL_DUENO
