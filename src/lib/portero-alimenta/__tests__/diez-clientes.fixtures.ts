/**
 * LOS DIEZ CLIENTES DE PRUEBA PERMANENTES DEL CEREBRO (16-oct · firma de Emilio: «10 clientes de rubros y países distintos pasados por todas las etapas, sin gastar»).
 * Datos sintéticos (nombres y números inventados) para probar que el cerebro NO está hecho solo para un cliente. Cualquier cambio futuro del cerebro debe pasar con los diez.
 * Solo datos: ni lógica ni nombres de clientes reales.
 */
export type PuntoDeVenta = 'loyverse' | 'otro' | null
export interface SedeSintetica { clave: string; ciudad: string; direccion: string; tipo_de_atencion?: string }
export interface ClienteSintetico {
  /** uuid inventado */
  id: string
  nombre: string
  rubro: string
  pais: string
  /** código ISO-2 que se espera */
  iso: string
  voz: 'tuteo' | 'voseo'
  sedes: SedeSintetica[]
  web: string | null
  /** usuario de Instagram (null = no tiene) */
  ig: string | null
  /** ¿tiene ficha propia en Mapas? */
  mapas: boolean
  pos: PuntoDeVenta
  /** líneas de la página web (precios en SU moneda, con SUS separadores) */
  pagina: string[]
  bio: string
  /** un negocio ajeno con el mismo nombre en otra ciudad */
  homonimo: { titulo: string; ciudad: string }
  /** cuántas horas de UTC está su hora local (negativo = atrás) */
  desfase: number
  /** ¿compite por cercanía? (false = B2B / online) */
  compitePorCercania: boolean
  config?: Record<string, unknown>
  /** línea de transitorio propia de su variante («volvé a las 9» en voseo) */
  transitorio: string
}

const u = (n: number) => { const h = n.toString(16); return `${h.repeat(8).slice(0, 8)}-${h.repeat(4).slice(0, 4)}-4${h.repeat(3).slice(0, 3)}-8${h.repeat(3).slice(0, 3)}-${h.repeat(12).slice(0, 12)}` }

export const DIEZ_CLIENTES: ClienteSintetico[] = [
  { id: u(1), nombre: 'Extintores Andinos', rubro: 'seguridad contra incendios y extintores para empresas', pais: 'Ecuador', iso: 'ec', voz: 'tuteo',
    sedes: [{ clave: 'quito', ciudad: 'Quito', direccion: 'Av. de los Shyris N34-120, Quito' }], web: 'https://extintoresandinos.example', ig: 'extintoresandinos', mapas: true, pos: null,
    pagina: ['Recarga de extintores PQS 10 libras desde USD 12,50', 'Inspección anual de sistemas contra incendios con informe técnico', 'Atendemos a industrias y edificios en Quito y Guayaquil'],
    bio: 'Extintores Andinos, protección contra incendios para tu empresa', homonimo: { titulo: 'Extintores Andinos', ciudad: 'Lima' }, desfase: -5, compitePorCercania: true, transitorio: 'Abierto ahora hasta las 18:00' },
  { id: u(2), nombre: 'Clínica Dental Sonrisa Plena', rubro: 'clínica dental y ortodoncia', pais: 'Colombia', iso: 'co', voz: 'tuteo',
    sedes: [{ clave: 'norte', ciudad: 'Bogotá', direccion: 'Calle 127 # 15-20, Bogotá', tipo_de_atencion: 'consultorio' }, { clave: 'centro', ciudad: 'Bogotá', direccion: 'Carrera 7 # 32-10, Bogotá', tipo_de_atencion: 'consultorio' }, { clave: 'medellin', ciudad: 'Medellín', direccion: 'Calle 10 # 40-05, Medellín', tipo_de_atencion: 'consultorio' }],
    web: 'https://sonrisaplena.example', ig: 'sonrisaplena', mapas: true, pos: null,
    pagina: ['Limpieza dental $ 85.000', 'Ortodoncia desde COP 1.800.000', 'Blanqueamiento dental $ 320.000', 'Agenda tu cita por WhatsApp'],
    bio: 'Clínica Dental Sonrisa Plena, cuida tu sonrisa en Bogotá y Medellín', homonimo: { titulo: 'Clínica Dental Sonrisa Plena', ciudad: 'Cali' }, desfase: -5, compitePorCercania: true, transitorio: 'Cerrado ahora, vuelve mañana a las 8' },
  { id: u(3), nombre: 'Flujo CRM', rubro: 'software CRM para pymes (SaaS)', pais: 'México', iso: 'mx', voz: 'tuteo',
    sedes: [], web: 'https://flujocrm.example', ig: 'flujocrm', mapas: false, pos: null,
    pagina: ['Plan Starter MXN 349 por mes', 'Plan Pro MXN 899 por mes', 'Soporte por chat de lunes a viernes', 'Prueba gratis por 14 días'],
    bio: 'Flujo CRM, ordena el seguimiento de tus clientes', homonimo: { titulo: 'Flujo CRM', ciudad: 'Lima' }, desfase: -6, compitePorCercania: false, config: { timezone: 'America/Mexico_City' }, transitorio: 'Última actualización hace 2 horas' },
  { id: u(4), nombre: 'Hotel Boutique Casa Alameda', rubro: 'hotel boutique y alojamiento', pais: 'Perú', iso: 'pe', voz: 'tuteo',
    sedes: [{ clave: 'cusco', ciudad: 'Cusco', direccion: 'Calle Alameda 120, Cusco', tipo_de_atencion: 'hotel' }], web: 'https://casaalameda.example', ig: 'casaalameda', mapas: true, pos: null,
    pagina: ['Habitación doble desde S/ 280 por noche', 'Desayuno incluido', 'Check-in desde las 14:00 y check-out hasta las 11:00'],
    bio: 'Casa Alameda, hotel boutique en el corazón de Cusco', homonimo: { titulo: 'Hotel Casa Alameda', ciudad: 'Arequipa' }, desfase: -5, compitePorCercania: true, transitorio: 'Cerrado ahora' },
  { id: u(5), nombre: 'Fuerza', rubro: 'gimnasio y entrenamiento personal', pais: 'Chile', iso: 'cl', voz: 'tuteo',
    sedes: [{ clave: 'providencia', ciudad: 'Santiago', direccion: 'Av. Providencia 1234, Santiago', tipo_de_atencion: 'gimnasio' }], web: 'https://fuerza-gym.example', ig: null, mapas: true, pos: 'loyverse',
    pagina: ['Plan mensual $ 29.990 CLP', 'Clase de prueba gratis', 'Horario de lunes a viernes de 6 a 22'],
    bio: '', homonimo: { titulo: 'Fuerza', ciudad: 'Valparaíso' }, desfase: -3, compitePorCercania: true, config: { timezone: 'America/Santiago' }, transitorio: 'Abierto ahora' },
  { id: u(6), nombre: 'Tienda Online Luna', rubro: 'tienda online de ropa y accesorios', pais: 'España', iso: 'es', voz: 'tuteo',
    sedes: [], web: 'https://tiendaluna.example', ig: 'tiendaluna', mapas: false, pos: 'otro',
    pagina: ['Vestido de lino € 49,90', 'Bolso de cuero € 79,00', 'Envío gratis a partir de 60 €'],
    bio: 'Tienda Luna, moda online hecha con cariño', homonimo: { titulo: 'Luna Tienda', ciudad: 'Madrid' }, desfase: 2, compitePorCercania: false, config: { timezone: 'Europe/Madrid' }, transitorio: 'Ahora mismo cerrado' },
  { id: u(7), nombre: 'Estudio Jurídico Ramírez', rubro: 'estudio de abogados', pais: 'Argentina', iso: 'ar', voz: 'voseo',
    sedes: [{ clave: 'caba', ciudad: 'Buenos Aires', direccion: 'Av. Corrientes 1234, Buenos Aires', tipo_de_atencion: 'oficina' }], web: 'https://ramirezabogados.example', ig: 'ramirezabogados', mapas: true, pos: null,
    pagina: ['Consulta inicial ARS 45.000', 'Divorcio de mutuo acuerdo desde $ 350.000', 'Pedí tu turno por WhatsApp'],
    bio: 'Estudio Jurídico Ramírez, defendemos tus derechos', homonimo: { titulo: 'Estudio Jurídico Ramírez', ciudad: 'Córdoba' }, desfase: -3, compitePorCercania: true, transitorio: 'Volvé a las 9 de la mañana' },
  { id: u(8), nombre: 'Colegio Bilingüe Horizonte', rubro: 'colegio bilingüe de educación inicial y básica', pais: 'Ecuador', iso: 'ec', voz: 'tuteo',
    sedes: [{ clave: 'guayaquil', ciudad: 'Guayaquil', direccion: 'Km 12 Vía a la Costa, Guayaquil', tipo_de_atencion: 'colegio' }], web: 'https://horizonte.example', ig: 'colegiohorizonte', mapas: true, pos: null,
    pagina: ['Pensión mensual USD 245', 'Matrícula USD 300', 'Inscripciones abiertas para el nuevo año lectivo'],
    bio: 'Colegio Horizonte, educación bilingüe', homonimo: { titulo: 'Colegio Bilingüe Horizonte', ciudad: 'Cuenca' }, desfase: -5, compitePorCercania: true, transitorio: 'Cerrado hoy' },
  { id: u(9), nombre: 'Taller El Pistón', rubro: 'taller mecánico y lubricadora', pais: 'Uruguay', iso: 'uy', voz: 'voseo',
    sedes: [{ clave: 'montevideo', ciudad: 'Montevideo', direccion: 'Bulevar Artigas 2020, Montevideo', tipo_de_atencion: 'taller' }], web: null, ig: 'tallerelpiston', mapas: true, pos: null,
    pagina: [],
    bio: 'Taller El Pistón, mecánica de confianza. Venite a probarnos', homonimo: { titulo: 'Taller El Pistón', ciudad: 'Salto' }, desfase: -3, compitePorCercania: true, transitorio: 'Estamos cerrados hasta mañana' },
  { id: u(10), nombre: 'Farmacia Salud Total', rubro: 'farmacia y droguería con cinco sucursales', pais: 'Colombia', iso: 'co', voz: 'tuteo',
    sedes: ['medellin', 'envigado', 'bello', 'itagui', 'sabaneta'].map((c) => ({ clave: c, ciudad: c[0].toUpperCase() + c.slice(1), direccion: `Calle 10 # 20-30, ${c}`, tipo_de_atencion: 'farmacia' })),
    web: 'https://saludtotal.example', ig: 'saludtotalfarmacias', mapas: true, pos: 'loyverse',
    pagina: ['Acetaminofén 500 mg caja x 16 $ 4.500', 'Servicio a domicilio sin costo en Medellín', 'Abierto las 24 horas en la sucursal de Medellín'],
    bio: 'Farmacia Salud Total, tu salud primero', homonimo: { titulo: 'Farmacia Salud Total', ciudad: 'Barranquilla' }, desfase: -5, compitePorCercania: true, transitorio: 'Abierto ahora' },
]

export const UN_PRECIO_LOCAL: Record<string, RegExp> = {
  ec: /usd|\$/i, co: /\$|cop/i, mx: /mxn/i, pe: /s\//i, cl: /\$|clp/i, es: /€|eur/i, ar: /ars|\$/i, uy: /\$|uyu/i,
}
