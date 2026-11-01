/**
 * EL ÚNICO TOPE DE TAMAÑO DE UN PEDIDO (01-nov · firma de Emilio: «darle el tamaño máximo a todo para no perder corridas por un error sin sentido que no nos cuesta nada corregir»).
 * Es el límite REAL: el contexto del modelo (200.000 tokens ≈ 700.000 caracteres), con margen, y por debajo del 1 MB medido del corredor. Nada se recorta por debajo de esto por prudencia.
 * Por encima, el pedido se rechaza con un 400 gratis que dice el motivo: nunca se corta callado ni se cae a mitad de una corrida paga.
 */
export const TOPE_REAL_DEL_PEDIDO = 600_000

/** 01-nov · lo que escribe el dueño (unas 25.000 palabras): es un techo de cordura para un texto humano, no un recorte. La base lo exige igual en plan_cambios y notas_del_dueno (migración 202611012100), y n8n usa el mismo número en «⓪ Llave» */
export const TOPE_DEL_TEXTO_DEL_DUENO = 100_000
