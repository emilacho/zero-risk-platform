/**
 * LAS ACCIONES DE CADA RUTA · una sola tabla que usan las 7 rutas `/api/cadena/*` Y el simulador de flujos de las pruebas
 * (así lo que se prueba contra los flujos es EXACTAMENTE lo que la ruta ejecuta).
 */
import { abrirCampana, avanzarCampana, reabrirCampana, campanasActivas, cierreDeCampana, estadoDeLaCadena, verificarViaje } from './campanas'
import { flujoCampana } from './flujo-de-campana'
import { reintentarAhora } from './reintento-manual'
import { filasProducir } from './elegidas'
import { fechasCobertura, fechasGuardar, fechasPreparar, filasListar, filasLotes, filasMarcar } from './datos'
import { calendarioGuardar, calendarioPreparar, calendarioSiguiente, estrategiaGuardar, estrategiaPreparar, fichasGuardar, fichasPreparar, validarSinEscribir } from './pasos'
import { relojDeLaCadena } from './reloj'
import { calendarioPasar, estrategiaPasar } from './revision-jefatura'
import { filasAutoproducir } from './autoproducir'
import { fechasLeerPdf } from './fechas-pdf'
import { briefAbrir, briefEntregar, conceptoAbrir, conceptoDecidir, conceptoEntregar, hojaEscribir } from './mesas'
import { briefRevalidar, conceptoRevalidar } from './revalidar'
import { bancoEditar, bancoRetirar } from './banco-de-ideas'
import { correccionesDelEncargo, correccionRecibir } from './correcciones'
import type { Manejador } from './puerta-http'

export const ACCIONES: Record<'campanas' | 'estrategia' | 'calendario' | 'validar' | 'filas' | 'fechas' | 'esperas' | 'brief' | 'concepto' | 'banco' | 'hojas' | 'fichas' | 'correcciones', Record<string, Manejador>> = {
  // 31-oct · nuevo orden (T3): las mesas de brief y de concepto y la hoja por código; solo con la palanca `nuevo_orden` encendida para el cliente
  // 09-nov · revalidar lo ya escrito (opción B firmada por Emilio): un brief devuelto EN FALSO por el verificador vuelve a pasar el verificador de hoy · US$ 0
  brief: { abrir: briefAbrir, entregar: briefEntregar, revalidar: briefRevalidar },
  // 09-nov · revalidar la gran idea ya pagada (ALTO de Lenovo): una versión que el lector dejó sin_mesa se relee con la entrega de hoy desde el libro de su mesa · US$ 0
  // 17-nov · el banco de ideas de la gran idea APROBADA, editable desde el tablero (`/api/cadena/concepto/banco`) · editar en tanda · retirar con reasignación · US$ 0
  banco: { editar: bancoEditar, retirar: bancoRetirar },
  concepto: { abrir: conceptoAbrir, entregar: conceptoEntregar, decidir: conceptoDecidir, revalidar: conceptoRevalidar },
  hojas: { escribir: hojaEscribir },
  campanas: {
    abrir: abrirCampana,
    avanzar: avanzarCampana,
    // 09-nov · E (firma de Emilio): reabrir en el mismo lugar · día 1 = el día en que se reabre, origen emilio, la duración del plan
    reabrir: reabrirCampana,
    cierre: (al, c) => cierreDeCampana(al, c),
    estado: (al, c) => estadoDeLaCadena(al, c),
    verificar_viaje: (al, c) => verificarViaje(al, c),
    activas: (al, c) => campanasActivas(al, c),
    // 18-nov · el botón «Flujo de la campaña» del tablero: parar · reanudar (acción humana; solo aquí se acepta `workflow_id: 'tablero'`)
    flujo: flujoCampana,
    // 21-nov · opción c (GO Lenovo 03:55Z): «reintentar ahora» un paso agotado · acción de operador (CC7), sin botón · deja registro en la libreta
    reintentar: reintentarAhora,
  },
  // 17-nov · Sprint 4 · A entrega 2: el lector de las fichas de hechos por oferta (una vez por campaña, antes del calendario · no es reja)
  fichas: { preparar: fichasPreparar, guardar: (al, c) => fichasGuardar(al, c) },
  // 17-nov · cambio 4 · entrega 2: la jefatura devuelve una corrección a un paso de la cadena (hoja · calendario · banco) · la bandeja lee su estado por encargo
  // la ruta llama con 3 argumentos: el 4.º (`enProceso`) solo lo pasa el puerto de la oficina (sugerencia CC6)
  correcciones: { recibir: (al, c, ahora) => correccionRecibir(al, c, ahora), del_encargo: (al, c) => correccionesDelEncargo(al, c) },
  estrategia: { preparar: estrategiaPreparar, guardar: estrategiaGuardar, pasar: (al, c) => estrategiaPasar(al, c) },
  calendario: { preparar: calendarioPreparar, guardar: calendarioGuardar, siguiente: calendarioSiguiente, pasar: (al, c) => calendarioPasar(al, c) },
  validar: { validar: validarSinEscribir },
  filas: { listar: (al, c) => filasListar(al, c), lotes: filasLotes, marcar: filasMarcar, autoproducir: (al, c) => filasAutoproducir(al, c), producir: (al, c) => filasProducir(al, c, new Date().toISOString()) },
  // 11-nov · leer_pdf (GO Lenovo 19:30 · opción b): el texto de los PDF oficiales que «② Juntar» descartó, solo de las fuentes cargadas
  fechas: { cobertura: (al, c) => fechasCobertura(al, c), preparar: fechasPreparar, guardar: (al, c) => fechasGuardar(al, c), leer_pdf: (al, c) => fechasLeerPdf(al, c) },
  esperas: { reloj: relojDeLaCadena },
}
