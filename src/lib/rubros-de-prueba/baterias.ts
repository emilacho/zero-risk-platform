/**
 * H11 (auditoría agnóstica · ronda 75) · BATERÍA COMPARTIDA DE RUBROS para las pruebas de los chequeos.
 * Clientes SINTÉTICOS de cuatro rubros y dos registros (tuteo / voseo). Sirve a los chequeos del manual (CC#1) y de la pieza y la cadena (CC#2):
 * cada uno trae frases que NO deben marcarse (lo propio del rubro, historias de fundación, personas como sujeto) y frases que SÍ (control).
 * Regla: ningún dato de aquí es de un cliente real; agregar rubros aquí, no copiarlos en cada prueba.
 */
export type RubroDePrueba = 'comida' | 'clinica' | 'tienda_saas' | 'servicio_b2b'

export interface ClienteDePrueba {
  rubro: RubroDePrueba
  nombre: string
  pais: string
  registro: 'tuteo' | 'voseo' | 'usted'
  moneda: string
  /** términos de producto del catálogo del cliente (lo que el chequeo de lugar entiende como «bien») */
  bienes: string[]
  /** frases del manual que un chequeo correcto NO debe marcar como hecho sin respaldo */
  noMarcar: string[]
  /** frases que SÍ deben marcarse sin respaldo (control: el chequeo no se apagó) */
  siMarcar: string[]
}

export const BATERIA_DE_RUBROS: ClienteDePrueba[] = [
  {
    rubro: 'comida', nombre: 'Casa Demo Sabores', pais: 'Colombia', registro: 'tuteo', moneda: 'COP', bienes: ['café', 'quesos', 'harina'],
    noMarcar: [
      'Nuestro origen es humilde: empezamos con una sola mesa en la cocina de casa.',
      'El origen del nombre viene de una receta de la abuela.',
      'Nuestros comensales vienen de todos los barrios de la ciudad.',
      'Una cocina de origen familiar y trato cercano.',
    ],
    siMarcar: ['Los quesos llegan de Boyacá cada semana.', 'Somos el mejor restaurante de la ciudad.'],
  },
  {
    rubro: 'clinica', nombre: 'Clínica Demo Sonrisa', pais: 'Argentina', registro: 'voseo', moneda: 'ARS', bienes: ['implantes', 'resinas', 'insumos odontológicos'],
    noMarcar: [
      'Nuestros pacientes vienen de distintos barrios y de otras ciudades.',
      'Empezamos hace años con un solo consultorio y un equipo muy chico.',
      'Nuestro origen está en la idea de cuidar a las familias del barrio.',
      'Los pacientes llegan de toda la provincia buscando atención cercana.',
    ],
    siMarcar: ['Los implantes llegan de Suiza y están certificados.', 'Somos los únicos con tecnología sin igual.'],
  },
  {
    rubro: 'tienda_saas', nombre: 'Tienda Demo Textil', pais: 'México', registro: 'tuteo', moneda: 'MXN', bienes: ['telas', 'prendas', 'licencias'],
    noMarcar: [
      'Nuestros usuarios llegan de equipos pequeños que quieren ordenar su trabajo.',
      'El origen de la marca es una charla entre dos amigos.',
      'Nuestros clientes vienen de distintas ciudades del país.',
      'Nació como un proyecto de fin de semana y hoy lo usan equipos de todo el país.',
    ],
    siMarcar: ['Las telas vienen de Turquía.', 'La mejor plataforma del mercado.'],
  },
  {
    rubro: 'servicio_b2b', nombre: 'Consultora Demo Norte', pais: 'Uruguay', registro: 'voseo', moneda: 'UYU', bienes: ['informes', 'auditorías', 'equipos de medición'],
    noMarcar: [
      'Nuestros clientes vienen de la industria, el agro y los servicios.',
      'Nuestro origen es un grupo de ingenieros que quiso trabajar distinto.',
      'La historia de la firma empieza con un cliente y un problema concreto.',
      'Los socios de la firma llegan de trayectorias muy distintas.',
    ],
    siMarcar: ['Los equipos de medición llegan de Alemania.', 'Somos líderes en toda la región.'],
  },
]
