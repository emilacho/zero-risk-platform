/**
 * LO COMÚN A TODA REVISIÓN · el módulo compartido de la `oficina de creativos` y de la `jefatura` (diseño v4 §1: «se mueve a un módulo compartido sin cambiar su comportamiento»).
 * Es una FACHADA: re-exporta tal cual las piezas PURAS que ya existían (el motor de pasos, los contratos de formato `fichas.v1` / `resolucion.v1`, la pregunta y la llamada del revisor GPT).
 * No copia ni cambia ni una línea de ellas: la `oficina` y `/api/manual/opinion` siguen importando desde sus rutas de siempre y sus pruebas no se tocan.
 * Regla: la `jefatura` importa SOLO desde aquí (una prueba lo vigila), así el día que la `oficina` suelte sus pasos de revisión (J8a) lo común no se mueve de sitio.
 */
export { evaluar, registrarPaso, siguientePaso } from '../oficina/motor'
export type { ResultadoDePaso } from '../oficina/motor'
export { descartarIgnorados, ESQUEMAS, limpiarSalida, normalizarEnumerados, procesarSalida, validar } from '../oficina/salida'
export type { Esq, ResultadoDeSalida } from '../oficina/salida'
export { estadoInicial } from '../oficina/tipos'
export type { Artefacto, Condicion, Estado, Ficha, Gravedad, Limites, OrigenDeFicha, Paso, Plantilla, Siguiente } from '../oficina/tipos'
export { fichaNueva } from '../oficina/ayudas'
/** revisión 2 = A · la regla única del cierre: solo lo duro cuenta, lo de criterio es observación (oficina y jefatura) */
export { duroYCriterio } from '../oficina/reglas-duras'
export { armarPedido as armarPedidoAlRevisor, ESPERAS_DEL_REVISOR_MS, llamarRevisorGpt, PREGUNTA_AL_REVISOR, preguntaAlRevisor } from '../revisor-gpt'
export type { ContextoDelRevisor, HuecosDeLaPregunta, IntentoDelRevisor, PedidoAlRevisor, ResultadoDelRevisor } from '../revisor-gpt'
/** la llamada a GPT que además anota su costo en el libro central de invocaciones (condición 5 de CC#3) */
export { llamarRevisorGptConLibro } from '../revisor-gpt-libro'
export type { ContextoDelLibro, OrigenDelRevisor } from '../revisor-gpt-libro'
/** 20-nov · PLAN v4 · el segundo doctor CREATIVO: la regla de la cita y de la parte, la lectura del informe y lo que llega al creativo (puro; lo usan la jefatura y la oficina) */
export { bloqueParaElCreativo, huella, leerInformeCreativo, PEDIDO_CREATIVO, resumenDelDoctor } from '../segundo-doctor'
export type { InformeCreativo, ResumenDelDoctor } from '../segundo-doctor'
