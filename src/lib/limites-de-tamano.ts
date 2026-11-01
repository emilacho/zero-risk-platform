/**
 * EL ÚNICO TOPE DE TAMAÑO DE UN PEDIDO (01-nov · firma de Emilio: «darle el tamaño máximo a todo para no perder corridas por un error sin sentido que no nos cuesta nada corregir»).
 * Es el límite REAL: el contexto del modelo (200.000 tokens ≈ 700.000 caracteres), con margen, y por debajo del 1 MB medido del corredor. Nada se recorta por debajo de esto por prudencia.
 * Por encima, el pedido se rechaza con un 400 gratis que dice el motivo: nunca se corta callado ni se cae a mitad de una corrida paga.
 */
export const TOPE_REAL_DEL_PEDIDO = 600_000
