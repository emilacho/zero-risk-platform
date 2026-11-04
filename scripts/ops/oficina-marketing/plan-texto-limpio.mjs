/**
 * 03-nov · ENCARGO-LENOVO-a-CC2 (cierre del alta y plan limpio, punto 3 y 4) + decisión 13:54Z («súmenle al redactor del plan el bloque de texto limpio») · SOLO INDICACIÓN, sin control ni regla por código.
 * Una frase en «Redactor (B4)» (el pedido que recibe el redactor del plan), justo tras la de sedes: el plan se lee como un documento para el cliente (sin nombres internos ni prefijos de sistema),
 * una cifra que no viene de un dato del cliente se dice «supuesto» con su porqué en palabras del cliente, y el presupuesto trae lo que le falta hoy (ventas necesarias, costo por cliente, origen de cada cifra, dos escenarios).
 * No bloquea, no valida, no cambia ninguna salida: el pedido solo gana unas líneas de texto.
 */
import { cambiarCodigo } from './lib.mjs'
import { FRASE_SEDES_Y_PREGUNTAR } from './frase-sedes-y-preguntar.mjs'

export const FRASE_PLAN_LIMPIO =
  'El plan se lee como un documento para el cliente: sin nombres internos ni códigos del sistema y sin prefijos como «PROPUESTA (no es dato del cliente):». Una cifra que no viene de un dato del cliente se escribe como «supuesto», con su porqué en palabras del cliente; nunca como dato. El presupuesto trae las ventas necesarias, el costo por cliente, de dónde sale cada cifra y dos escenarios.'

const ANCLA = "'" + FRASE_SEDES_Y_PREGUNTAR + "',\n'',\n"

export function construirPlanTextoLimpio(f) {
  cambiarCodigo(f, 'Redactor (B4)', ANCLA, ANCLA + "'" + FRASE_PLAN_LIMPIO + "',\n'',\n")
}
