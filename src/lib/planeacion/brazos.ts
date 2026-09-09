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
 * 🔴 Lo que el Servicio de Apify YA distingue · y que este envoltorio tiraba.
 *
 * Condición de certificación de CC#3 (09-sep), cerrada acá: la primera versión
 * recibía SÓLO las filas y rotulaba «fui, miré y no hay» **aunque nadie hubiera
 * mirado**. Es el caso Meta un piso más arriba y peor: en Meta la fuente nunca
 * publicó el dato; acá **el Servicio ya había hecho el trabajo de distinguirlo
 * y el envoltorio lo tiraba a la basura** ⇒ el plan escribiría «el competidor
 * no tiene X» cuando la verdad es que nadie preguntó.
 *
 * 🔴 Y DÓNDE viven esos campos · medido sobre el flujo vivo `3lyknrP3PoS2KzUf`
 * (nodos `transform-sections` · `skipped-response` · `final-response-ok`):
 *
 *   AL RAS      skipped · skip_reason · motivo · sin_resultados · datos · chunks_count
 *   ANIDADO     cero: { clase · motivo · se_miro_de_verdad · registros_descartados }
 *               ↑ y `cero` es null cuando SÍ hubo resultados
 *
 * La primera versión de este envoltorio leía `clase` y `se_miro_de_verdad` AL RAS
 * —donde no están— así que las tres ramas de «nadie miró» estaban MUERTAS y todo
 * volvía a caer en «fui, miré y no hay». Corregido 2026-09-09.
 */
export interface CeroClasificado {
  readonly clase?: 'no_pude_ver' | 'no_existe' | 'ensayo' | string
  readonly motivo?: string | null
  readonly se_miro_de_verdad?: boolean
  readonly registros_descartados?: number
}

export interface RespuestaServicioApify {
  readonly ok?: boolean
  readonly skipped?: boolean
  readonly skip_reason?: string | null
  readonly motivo?: string | null
  readonly sin_resultados?: boolean
  readonly motivo_cero?: string | null
  readonly datos?: string | null
  readonly chunks_count?: number
  /**
   * 🔴 EL CERO CLASIFICADO VIENE ANIDADO ACÁ · no al ras.
   * Corregido 2026-09-09 tras el aviso de Lenovo: la primera version leia
   * `clase` y `se_miro_de_verdad` en la raiz — donde NO estan — asi que las
   * tres ramas de «nadie miro» estaban MUERTAS y todo caia en «fui, mire y no
   * hay». Medido sobre el nodo `transform-sections` del flujo vivo.
   * `cero` es `null` cuando SI hubo resultados.
   */
  readonly cero?: CeroClasificado | null
  /** compatibilidad · algunos llamadores arman filas por su cuenta */
  readonly filas?: ReadonlyArray<Record<string, unknown>>
}

export async function brazoApify(args: {
  objetivo: string
  fuente: string
  encendido?: boolean
  limite_ms?: number
  proposito?: string
  /** Devuelve el SOBRE del Servicio, no sólo las filas: la distinción viene
   *  adentro y tirarla es el defecto que esta pieza existe para impedir. */
  consultar: () => Promise<RespuestaServicioApify | ReadonlyArray<Record<string, unknown>>>
}): Promise<RespuestaBrazo> {
  return envolverBrazo({
    brazo: 'apify',
    objetivo: args.objetivo,
    fuente: args.fuente,
    ...(args.limite_ms !== undefined ? { limite_ms: args.limite_ms } : {}),
    ...(args.proposito ? { proposito: args.proposito } : {}),
    ...(args.encendido !== undefined ? { encendido: args.encendido } : {}),
    ejecutar: async () => {
      const r = await args.consultar()
      // Compatibilidad · si llega un array pelado, no hay distinción que
      // preservar y NO se puede afirmar que se miró. Se dice así.
      if (Array.isArray(r)) {
        if (r.length === 0) {
          return {
            hay: false as const,
            motivo:
              'el llamador entregó filas sueltas, sin el sobre del Servicio: ' +
              'CERO filas NO alcanza para afirmar que se miró',
            noSeMiro: true,
          }
        }
        return { hay: true as const, datos: { filas: r, cantidad: r.length } }
      }

      // `Array.isArray` no estrecha un `readonly T[]` en el else · se hace explícito.
      const sobre = r as RespuestaServicioApify
      const filas = sobre.filas ?? []
      // UNA LINEA POR RAMA · el cero clasificado vive anidado en `cero`.
      const cero = sobre.cero ?? null
      const clase = cero?.clase ?? (sobre as { clase?: string }).clase
      const seMiro = cero?.se_miro_de_verdad ?? (sobre as { se_miro_de_verdad?: boolean }).se_miro_de_verdad
      // el anidado manda; lo de al ras queda SOLO como red (ver nota arriba).
      // `sobre.motivo` va al final y es seguro: la rama `skipped` —la unica que
      // usa ese campo con otro sentido— ya devolvio antes de llegar aca.
      const motivoCero = cero?.motivo ?? sobre.motivo_cero ?? sobre.motivo
      // «hay dato» lo dice el Servicio, no el largo de un arreglo que quiza no manda
      const hayDato = sobre.sin_resultados === false ||
        (sobre.chunks_count ?? 0) > 0 ||
        (typeof sobre.datos === 'string' && sobre.datos.length > 0) ||
        filas.length > 0
      // ① nadie preguntó · el Servicio lo saltó
      if (sobre.skipped === true) {
        return {
          hay: false as const,
          noSeMiro: true,
          motivo: `NADIE PREGUNTÓ · el Servicio salteó esta función${sobre.motivo ? ' · ' + sobre.motivo : ''}`,
        }
      }
      // ② no se pudo ver · hubo ceguera o descartes
      if (clase === 'no_pude_ver') {
        return {
          hay: false as const,
          noSeMiro: true,
          motivo: `NO SE PUDO VER${motivoCero ? ' · ' + motivoCero : ''}`,
        }
      }
      // ③ ensayo · no es una mirada real
      if (clase === 'ensayo' || seMiro === false) {
        return {
          hay: false as const,
          noSeMiro: true,
          motivo: `NO SE MIRÓ DE VERDAD${clase === 'ensayo' ? ' · fue un ensayo (dry-run)' : ''}${motivoCero ? ' · ' + motivoCero : ''}`,
        }
      }
      // ④ se miró de verdad · acá SÍ vale «fui, miré y no hay»
      if (!hayDato) {
        return {
          hay: false as const,
          motivo: `fui, miré y no hay${motivoCero ? ' · ' + motivoCero : ' · el raspador terminó sin registros'}`,
        }
      }
      return {
        hay: true as const,
        datos: {
          ...(filas.length ? { filas, cantidad: filas.length } : {}),
          ...(sobre.datos ? { texto: sobre.datos } : {}),
          ...(sobre.chunks_count !== undefined ? { chunks_count: sobre.chunks_count } : {}),
        },
      }
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
  limite_ms?: number
  proposito?: string
  consultar: () => Promise<Record<string, unknown> | null>
}): Promise<RespuestaBrazo> {
  return envolverBrazo({
    brazo: 'posthog',
    objetivo: args.objetivo,
    fuente: args.fuente,
    ...(args.limite_ms !== undefined ? { limite_ms: args.limite_ms } : {}),
    ...(args.proposito ? { proposito: args.proposito } : {}),
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
  limite_ms?: number
  proposito?: string
  buscar: () => Promise<ReadonlyArray<unknown>>
}): Promise<RespuestaBrazo> {
  return envolverBrazo({
    brazo: 'cerebro',
    objetivo: args.objetivo,
    fuente: args.fuente,
    ...(args.limite_ms !== undefined ? { limite_ms: args.limite_ms } : {}),
    ...(args.proposito ? { proposito: args.proposito } : {}),
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
