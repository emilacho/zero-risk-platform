/**
 * LAS ACCIONES DE CADA RUTA · una sola tabla que usan las 7 rutas `/api/cadena/*` Y el simulador de flujos de las pruebas
 * (así lo que se prueba contra los flujos es EXACTAMENTE lo que la ruta ejecuta).
 */
import { abrirCampana, avanzarCampana, campanasActivas, cierreDeCampana, estadoDeLaCadena, verificarViaje } from './campanas'
import { fechasCobertura, fechasGuardar, fechasPreparar, filasListar, filasLotes, filasMarcar } from './datos'
import { calendarioGuardar, calendarioPreparar, calendarioSiguiente, estrategiaGuardar, estrategiaPreparar, validarSinEscribir } from './pasos'
import { relojDeLaCadena } from './reloj'
import { calendarioPasar, estrategiaPasar } from './revision-jefatura'
import { filasAutoproducir } from './autoproducir'
import { briefAbrir, briefEntregar, conceptoAbrir, conceptoDecidir, conceptoEntregar, hojaEscribir } from './mesas'
import type { Manejador } from './puerta-http'

export const ACCIONES: Record<'campanas' | 'estrategia' | 'calendario' | 'validar' | 'filas' | 'fechas' | 'esperas' | 'brief' | 'concepto' | 'hojas', Record<string, Manejador>> = {
  // 31-oct · nuevo orden (T3): las mesas de brief y de concepto y la hoja por código; solo con la palanca `nuevo_orden` encendida para el cliente
  brief: { abrir: briefAbrir, entregar: briefEntregar },
  concepto: { abrir: conceptoAbrir, entregar: conceptoEntregar, decidir: conceptoDecidir },
  hojas: { escribir: hojaEscribir },
  campanas: {
    abrir: abrirCampana,
    avanzar: avanzarCampana,
    cierre: (al, c) => cierreDeCampana(al, c),
    estado: (al, c) => estadoDeLaCadena(al, c),
    verificar_viaje: (al, c) => verificarViaje(al, c),
    activas: (al, c) => campanasActivas(al, c),
  },
  estrategia: { preparar: estrategiaPreparar, guardar: estrategiaGuardar, pasar: (al, c) => estrategiaPasar(al, c) },
  calendario: { preparar: calendarioPreparar, guardar: calendarioGuardar, siguiente: calendarioSiguiente, pasar: (al, c) => calendarioPasar(al, c) },
  validar: { validar: validarSinEscribir },
  filas: { listar: (al, c) => filasListar(al, c), lotes: filasLotes, marcar: filasMarcar, autoproducir: (al, c) => filasAutoproducir(al, c) },
  fechas: { cobertura: (al, c) => fechasCobertura(al, c), preparar: fechasPreparar, guardar: (al, c) => fechasGuardar(al, c) },
  esperas: { reloj: relojDeLaCadena },
}
