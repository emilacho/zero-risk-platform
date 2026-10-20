// CC#2 · 20-oct · LA `jefatura` REVISA EL PLAN (diseño v4 §5.1, firmas F16/F20 de Emilio) SOBRE EL FLUJO DE PLANEACIÓN DE HOY.
//   node construir-plan-sobre-el-vivo-2026-10-20.mjs
// El enganche del plan (`enganchaPlan`, J7 · CC#1 · 14-oct) estaba construido contra el flujo del 14-oct. Aquí se reaplica, SIN tocar su lógica, sobre el flujo de planeación de HOY
// (el vivo con #655 + el cambio de #657 «Drive fuera del camino crítico») y se escribe el par ANTES/ARREGLADO para aplicar con `scripts/ops/n8n-flujo.mjs`.
// ORDEN DE APLICACIÓN: primero #657 (ya certificado por CC#3), después este. «ANTES» = el flujo tal como queda tras #657: `diferencia` contra el vivo debe dar «iguales» antes de aplicar.
// APAGADO = IDÉNTICO A HOY: con el tipo `plan` fuera de `jefatura_config.tipos_activos` (o la jefatura apagada) el plan sale como hoy y la cadena sigue; la regla 10 (la cadena nunca queda de rehén)
// y la ausencia de puntos humanos nuevos las prueban `jefatura-plan-sobre-el-vivo.test.ts` (81 casos que ejecutan el código real de los nodos) y los 141 de J7.
// Reversa: restaurar el ANTES con `scripts/ops/n8n-flujo.mjs restaurar X9F0zp6LQ2xGEYVS <ANTES> --ejecutar`, o sacar `plan` de `tipos_activos`.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { enganchaPlan } from './construir-enganches.mjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const BASE = join(aqui, '..', 'X9F0zp6LQ2xGEYVS', 'planeacion-ARREGLADO-cadena-sigue-sola-2026-10-20.json')
export const ANTES_DEL_PLAN = 'ANTES-X9F0zp6LQ2xGEYVS-jefatura-plan-2026-10-20.json'
export const ARREGLADO_DEL_PLAN = 'ARREGLADO-X9F0zp6LQ2xGEYVS-jefatura-plan-2026-10-20.json'
export const leerBase = () => JSON.parse(fs.readFileSync(BASE, 'utf8'))
export const construir = (base) => enganchaPlan(base)

if (process.argv[1] && process.argv[1].endsWith('construir-plan-sobre-el-vivo-2026-10-20.mjs')) {
  const base = leerBase()
  fs.writeFileSync(join(aqui, ANTES_DEL_PLAN), JSON.stringify(base, null, 2))
  const nuevo = construir(base)
  fs.writeFileSync(join(aqui, ARREGLADO_DEL_PLAN), JSON.stringify(nuevo, null, 2))
  console.log(`plan · X9F0zp6LQ2xGEYVS · ${base.nodes.length} → ${nuevo.nodes.length} nodos`)
}
