/**
 * El turno de la jefatura recoge su vuelta del punto de control (ver jefatura-turno-recoger.mjs).
 *   node scripts/ops/oficina-marketing/construir-turno-recoge.mjs · escribe nuevo/o8qaF7bI0PKv2XGZ.json (parte de vivo/)
 */
import { escribirNuevo, leerVivo } from './lib.mjs'
import { construirTurnoQueRecoge } from './jefatura-turno-recoger.mjs'

const f = leerVivo('o8qaF7bI0PKv2XGZ')
construirTurnoQueRecoge(f)
console.log(escribirNuevo(f))
