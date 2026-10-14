// CLIENTES DE PRÁCTICA Y GUIONES DEL SECO DE LA OFICINA FINANCIERA · CC#2 · 14-oct · SOLO DATOS DE PRUEBA: nada se inserta en `clients` (las tablas `finanzas_*` guardan `client_id` como TEXTO sin llave).
// Siete negocios MUY distintos (los siete casos en papel del diseño v2 rev. 9 §7). TODAS las cifras son ilustrativas («supuesto»): sirven para ejercer el código, no son referencia de nada ni precios de nadie.
// Registro: cada negocio se prueba en tuteo y en voseo. El registro vive en `manual_resumen` (lo que el cliente dice de sí mismo): la INSTRUCCIÓN interna a los agentes sale siempre en tuteo; el voseo del manual
// solo puede aparecer dentro del CONTEXTO que se les pasa, nunca en lo que la oficina les pide.
// Agentes simulados: `guion[<paso>]` = lo que ese paso contesta (objeto, texto roto, `null` = no contesta, o lista de intentos). Ver `src/lib/finanzas/conversa/simulado.ts`.

export const ID_PREFIJO = 'prueba-finanzas-seco-'

const R = (min, max, base) => ({ min, max, ...(base !== undefined ? { base } : {}) })

/** los siete negocios: lo mínimo que cambia; todo lo demás sale de funciones. `evento` = el resultado que se paga; `pasos` = tasas hasta la meta (para el rango de `tasa_cierre`) */
export const NEGOCIOS = [
  { slug: 'local-con-entrega', nombre: 'Negocio A (PRUEBA)', rubro: 'restaurante local con entrega', pais: 'Colombia', moneda: 'COP', evento: 'mensaje', alterno: null, dias: 5, zonas: ['zona_norte', 'zona_centro'], meta: 15, ambiciosa: 40, ticket: R(9, 12, 10), margen: R(0.5, 0.6, 0.55), entrega: R(1.5, 2.5, 2), tasa: R(0.2, 0.4, 0.3), costo: R(0.4, 1.2, 0.8), horizonte: 90, canales: [{ canal: 'meta_ig', peso: 1 }, { canal: 'busqueda_pagada', peso: 0.1, activo: false, condicion: 'si la búsqueda local gratuita no trae pedidos' }], produccion: { fraccion: 0.25 } },
  { slug: 'tienda-en-linea', nombre: 'Negocio B (PRUEBA)', rubro: 'tienda en línea', pais: 'España', moneda: 'EUR', evento: 'compra_web', alterno: 'mensaje', dias: 7, zonas: ['pais_completo'], meta: 10, ambiciosa: 25, ticket: R(25, 33, 29), margen: R(0.4, 0.5, 0.45), tasa: R(0.9, 1, 1), costo: R(8, 20, 12), costoAlterno: R(1.5, 4, 2.5), canales: [{ canal: 'meta_ig', peso: 1 }, { canal: 'busqueda_pagada', peso: 0.15 }], produccion: { fraccion: 0.2 } },
  { slug: 'servicio-b2b-ciclo-largo', nombre: 'Negocio C (PRUEBA)', rubro: 'servicio B2B de ciclo largo', pais: 'México', moneda: 'MXN', evento: 'formulario_calificado', alterno: null, dias: 5, zonas: ['ciudad_principal'], meta: 1, ambiciosa: 2, ticket: R(350000, 450000, 400000), margen: R(0.5, 0.65, 0.6), tasa: R(0.08, 0.16, 0.12), costo: R(25000, 70000, 40000), ciclo: 60, canales: [{ canal: 'profesional_b2b', peso: 0.6 }, { canal: 'meta_ig', peso: 0.4 }], produccion: { fraccion: 0.15 } },
  { slug: 'suscripcion', nombre: 'Negocio D (PRUEBA)', rubro: 'suscripción o membresía', pais: 'Chile', moneda: 'CLP', evento: 'registro_de_prueba', alterno: null, dias: 7, zonas: ['pais_completo'], meta: 12, ambiciosa: 30, ticket: R(25, 35, 30), margen: R(0.7, 0.85, 0.8), periodos: R(4, 8, 6), tasa: R(0.1, 0.2, 0.15), costo: R(3, 12, 7), canales: [{ canal: 'meta_ig', peso: 1 }], produccion: { fraccion: 0.2 } },
  { slug: 'profesional-con-citas', nombre: 'Negocio E (PRUEBA)', rubro: 'profesional con citas', pais: 'Perú', moneda: 'PEN', evento: 'llamada', alterno: 'mensaje', dias: 5, zonas: ['distrito_a', 'distrito_b'], meta: 8, ambiciosa: 16, ticket: R(40, 50, 45), margen: R(0.5, 0.7, 0.6), periodos: R(1.5, 2.5, 2), tasa: R(0.2, 0.4, 0.3), costo: R(2, 7, 4), canales: [{ canal: 'meta_ig', peso: 1 }, { canal: 'busqueda_pagada', peso: 0.2 }], produccion: { monto: 40 } },
  { slug: 'evento-de-temporada', nombre: 'Negocio F (PRUEBA)', rubro: 'evento de temporada corta', pais: 'Ecuador', moneda: 'USD', evento: 'compra_web', alterno: null, dias: 7, zonas: ['ciudad_sede'], meta: 14, ambiciosa: 30, ticket: R(18, 22, 20), margen: R(0.6, 0.75, 0.7), tasa: R(0.9, 1, 1), costo: R(4, 14, 9), horizonte: 14, canales: [{ canal: 'meta_ig', peso: 1 }, { canal: 'video_corto', peso: 0.1 }], produccion: { fraccion: 0.25 } },
  { slug: 'captacion-sin-venta', nombre: 'Negocio G (PRUEBA)', rubro: 'organización sin venta (captación)', pais: 'Argentina', moneda: 'ARS', evento: 'formulario_alta', alterno: null, dias: 7, zonas: ['provincia'], meta: 25, ambiciosa: 50, tasa: R(0.9, 1, 1), costo: R(1.5, 5, 3.25), canales: [{ canal: 'meta_ig', peso: 1 }], produccion: { fraccion: 0.2 } },
]

export const CLIENTES = NEGOCIOS.map((n) => ({ id: `${ID_PREFIJO}${n.slug}`, nombre: n.nombre, rubro: n.rubro, slug: n.slug }))
export const idDe = (n) => `${ID_PREFIJO}${n.slug}`

const MANUAL = {
  tuteo: (n) => `Negocio de ${n.rubro} en ${n.pais}. La marca habla de tú: «cuéntanos», «escríbenos», «tienes». Nunca usa «vos» ni «tenés». Tono cercano y claro.`,
  voseo: (n) => `Negocio de ${n.rubro} en ${n.pais}. La marca habla de vos: «contanos», «escribinos», «tenés», «mirá». Nunca usa «tú» ni «tienes». Tono cercano y directo.`,
}

/** la semilla que entrega el plan al abrir; `caso` puede quitarle la referencia o marcar la corrida como de ensayo */
export function semilla(n, registro, caso) {
  const referencias = caso?.sin_referencia ? [] : [{ canal: 'meta_ig', evento: n.evento, min: n.costo.min, max: n.costo.max, base: n.costo.base, tipo: 'supuesto', fuente: 'referencia de prueba (supuesto)', fecha: '2026-10-14' }]
  return {
    rubro: n.rubro, pais: n.pais, moneda: n.moneda, dias_activos_por_semana: n.dias, zonas: n.zonas, evento: n.evento,
    ficha_resumen: `Ficha de práctica de un negocio de ${n.rubro} (${n.pais}).`,
    manual_resumen: MANUAL[registro](n),
    brazos_resumen: 'Sin datos reales: cliente de práctica.',
    referencias,
    evento_alterno: n.alterno ? { [n.evento]: n.alterno } : {},
    pisos: { meta_ig: 1 },
    fecha: '2026-10-14',
    ...(caso?.dato_de_ensayo ? {
      corrida_es_de_ensayo: true,
      datos: [
        { clave: 'resenas_promedio', valor: 4.8, procedencia: 'de_ensayo', fuente: 'brazo de ensayo' },
        { clave: 'seguidores', valor: 1200, procedencia: 'medido', fuente: 'corrida de ensayo' },
      ],
    } : {}),
  }
}

// ───────────────────────── lo que contesta cada agente simulado
export function planteo(n, extra = {}) {
  return {
    meta_por_semana: n.meta, meta_ambiciosa_por_semana: n.ambiciosa, zonas: n.zonas, dias_y_horarios: { dias_activos_por_semana: n.dias },
    evento: n.evento, canales: n.canales, produccion: n.produccion, ...(n.horizonte ? { horizonte_dias: n.horizonte } : {}), ...(n.ciclo ? { ciclo_dias: n.ciclo } : {}),
    no_se: ['la tasa de cierre real'], ...extra,
  }
}
export function fpa(n) {
  const s = {}
  if (n.ticket) s.ticket = n.ticket
  if (n.margen) s.margen = n.margen
  if (n.entrega) s.costo_entrega = n.entrega
  if (n.periodos) s.periodos = n.periodos
  if (n.tasa) s.tasa_cierre = n.tasa
  return { agente: 'finance-fpa-analyst', resumen: 'supuestos de negocio (de práctica)', supuestos: s, preguntas_a_otros: [], alertas: [] }
}
export function redes(n, { sinCosto = false } = {}) {
  return { agente: 'paid_media_paid_social_strategist', resumen: 'costos de redes (de práctica)', supuestos: sinCosto ? {} : { costo_por_resultado: n.costo, ...(n.costoAlterno ? { costo_por_resultado_alterno: n.costoAlterno } : {}) }, preguntas_a_otros: [], alertas: [] }
}
export const busqueda = () => ({ agente: 'paid_media_ppc_strategist', resumen: 'búsqueda: diferida hasta la señal', supuestos: {}, preguntas_a_otros: [], alertas: [] })
export const medicion = () => ({ agente: 'tracking-specialist', resumen: 'qué cuenta como resultado', supuestos: {}, preguntas_a_otros: [], alertas: [] })
export const acuerdoOk = () => ({ salida: 'sale', hallazgos: [], conflictos_resueltos: [], preguntas_a_emilio: [] })
export const acuerdoConCritico = (alude = 'redes') => ({ salida: 'sale_ajustada', hallazgos: [{ severidad: 'critico', que: 'el costo por resultado no cuadra con el piso de plataforma', alude }], conflictos_resueltos: [], preguntas_a_emilio: [] })

/** el guion de un negocio en el camino feliz (todos los pasos que pueden hablar) */
export function guionBase(n) {
  return {
    planteo: planteo(n), fpa: fpa(n), redes: redes(n), busqueda: busqueda(), medicion: medicion(),
    ajuste: planteo(n), cierre: acuerdoOk(),
    fpa_2: fpa(n), redes_2: redes(n), busqueda_2: busqueda(), medicion_2: medicion(), ajuste_2: planteo(n), cierre_2: acuerdoOk(),
  }
}
