/**
 * Canon canonical · LOS BRAZOS, envueltos en el contrato común §4.2.
 *
 * Lienzo v11 (firmado por Emilio): son **DOS brazos** —Apify y PostHog— más
 * el **cerebro, que se LEE y no se escribe**. «web propia» es la función 17
 * de Apify, no un brazo aparte.
 *
 * Cada envoltorio es fino a propósito: no reimplementa el brazo, lo llama y
 * **traduce su resultado a los tres estados**. La traducción es todo el
 * trabajo, porque es donde hoy se pierde la diferencia entre «no hay» y
 * «no contestó».
 */
import {
  campoNoPublicado,
  envolverBrazo,
  type RespuestaBrazo,
} from './contrato-brazos'

/**
 * 🔴 Los campos que la biblioteca de anuncios de Meta DECLARA en su esquema
 * y devuelve VACÍOS: sólo los publica para anuncios políticos.
 * Lectura del esquema por CC#3 (A4) · **no midió los valores** — se trata
 * como lo que es: una lectura de esquema, no una medición de datos.
 */
export const CAMPOS_META_NO_PUBLICADOS = ['spend', 'impressions', 'reach'] as const

/**
 * Canon canonical · brazo APIFY · raspado de competencia, redes y web propia.
 *
 * `consultar` devuelve las filas que trajo el Servicio. La distinción que
 * importa la hace ACÁ y no el envoltorio: cero filas tras una llamada
 * exitosa es `sin_dato` con motivo; una llamada que se rompe o un brazo
 * apagado es `sin_respuesta`.
 */
export async function brazoApify(args: {
  objetivo: string
  fuente: string
  encendido?: boolean
  consultar: () => Promise<ReadonlyArray<Record<string, unknown>>>
}): Promise<RespuestaBrazo> {
  return envolverBrazo({
    brazo: 'apify',
    objetivo: args.objetivo,
    fuente: args.fuente,
    ...(args.encendido !== undefined ? { encendido: args.encendido } : {}),
    ejecutar: async () => {
      const filas = await args.consultar()
      if (!filas || filas.length === 0) {
        return {
          hay: false as const,
          motivo: 'fui, miré y no hay: el raspador respondió y devolvió cero filas',
        }
      }
      return { hay: true as const, datos: { filas, cantidad: filas.length } }
    },
  })
}

/**
 * 🔴 Canon canonical · el gasto de la competencia en Meta · EL CASO PELIGROSO.
 *
 * No se consulta y se interpreta: se declara de entrada que la fuente **no
 * publica** esos campos. Devolver 0 —o un vacío mudo— haría que el plan
 * escriba «este competidor no invierte en pauta» cuando la verdad es
 * «no se puede saber por esta fuente».
 */
export function brazoMetaGastoCompetencia(args: {
  fuente: string
  medido_en?: string
}): RespuestaBrazo {
  return campoNoPublicado({
    brazo: 'apify',
    objetivo: 'gasto en pauta de la competencia (Meta Ad Library)',
    fuente: args.fuente,
    campo: CAMPOS_META_NO_PUBLICADOS,
    detalle: 'Meta sólo publica estos campos para anuncios políticos',
    ...(args.medido_en ? { medido_en: args.medido_en } : {}),
  })
}

/**
 * Canon canonical · brazo POSTHOG · tráfico, embudo y conversión.
 *
 * 🔴 `getPostHogClient()` devuelve `null` cuando no está configurado. Eso es
 * **brazo apagado ⇒ `sin_respuesta`**, no `sin_dato`: no es que el cliente no
 * tenga tráfico, es que no preguntamos. Confundirlos escribiría «este cliente
 * no tiene visitas» sobre un cliente que quizá tiene miles.
 */
export async function brazoPostHog(args: {
  objetivo: string
  fuente: string
  clienteConfigurado: boolean
  consultar: () => Promise<Record<string, unknown> | null>
}): Promise<RespuestaBrazo> {
  return envolverBrazo({
    brazo: 'posthog',
    objetivo: args.objetivo,
    fuente: args.fuente,
    encendido: args.clienteConfigurado,
    ejecutar: async () => {
      const r = await args.consultar()
      if (r === null || r === undefined || Object.keys(r).length === 0) {
        return {
          hay: false as const,
          motivo:
            'fui, miré y no hay: el proyecto respondió y no registra eventos para este cliente',
        }
      }
      return { hay: true as const, datos: r }
    },
  })
}

/**
 * Canon canonical · el CEREBRO · se LEE, no se escribe.
 *
 * Cero fragmentos tras una búsqueda exitosa es `sin_dato` («este cliente
 * todavía no tiene conocimiento cargado») — información real y accionable.
 * Que la búsqueda se rompa es `sin_respuesta`.
 */
export async function brazoCerebro(args: {
  objetivo: string
  fuente: string
  buscar: () => Promise<ReadonlyArray<unknown>>
}): Promise<RespuestaBrazo> {
  return envolverBrazo({
    brazo: 'cerebro',
    objetivo: args.objetivo,
    fuente: args.fuente,
    ejecutar: async () => {
      const fragmentos = await args.buscar()
      if (!fragmentos || fragmentos.length === 0) {
        return {
          hay: false as const,
          motivo:
            'fui, miré y no hay: la búsqueda respondió y el cliente no tiene fragmentos cargados',
        }
      }
      return {
        hay: true as const,
        datos: { fragmentos, cantidad: fragmentos.length },
      }
    },
  })
}
