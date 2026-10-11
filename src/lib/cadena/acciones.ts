/**
 * LAS ACCIONES DE CADA RUTA · una sola tabla que usan las 7 rutas `/api/cadena/*` Y el simulador de flujos de las pruebas
 * (así lo que se prueba contra los flujos es EXACTAMENTE lo que la ruta ejecuta).
 */
import { abrirCampana, avanzarCampana, campanasActivas, cierreDeCampana, estadoDeLaCadena, verificarViaje } from './campanas'
import { fechasCobertura, fechasGuardar, fechasPreparar, filasListar, filasLotes, filasMarcar } from './datos'
import { calendarioGuardar, calendarioPreparar, calendarioSiguiente, estrategiaGuardar, estrategiaPreparar, validarSinEscribir } from './pasos'
import { relojDeLaCadena } from './reloj'
import { filasAutoproducir } from './autoproducir'
import type { Manejador } from './puerta-http'

export const ACCIONES: Record<'campanas' | 'estrategia' | 'calendario' | 'validar' | 'filas' | 'fechas' | 'esperas', Record<string, Manejador>> = {
  campanas: {
    abrir: abrirCampana,
    avanzar: avanzarCampana,
    cierre: (al, c) => cierreDeCampana(al, c),
    estado: (al, c) => estadoDeLaCadena(al, c),
    verificar_viaje: (al, c) => verificarViaje(al, c),
    activas: (al, c) => campanasActivas(al, c),
  },
  estrategia: { preparar: estrategiaPreparar, guardar: estrategiaGuardar },
  calendario: { preparar: calendarioPreparar, guardar: calendarioGuardar, siguiente: calendarioSiguiente },
  validar: { validar: validarSinEscribir },
  filas: { listar: (al, c) => filasListar(al, c), lotes: filasLotes, marcar: filasMarcar, autoproducir: (al, c) => filasAutoproducir(al, c) },
  fechas: { cobertura: (al, c) => fechasCobertura(al, c), preparar: fechasPreparar, guardar: (al, c) => fechasGuardar(al, c) },
  esperas: { reloj: relojDeLaCadena },
}
