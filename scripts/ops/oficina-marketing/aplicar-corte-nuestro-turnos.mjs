/**
 * 11-nov · regla (b) · arma `aplicado/bTbWL9lUvQCfStAz-corte-nuestro-2026-11-11.json` desde la copia aplicada del 10-nov (igual al vivo). SIN red: no publica nada.
 * Publicar (después del 🟢 de CC7 sobre el flujo, con n8n 0/0, 0 encargos vivos, fuera del :00/:30): `node scripts/ops/n8n-flujo.mjs restaurar bTbWL9lUvQCfStAz <este archivo> --ejecutar`.
 * REVERSA: restaurar `aplicado/bTbWL9lUvQCfStAz-llave-del-acuse-2026-11-10.json`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { AQUI } from './lib.mjs'
import { construirCorteNuestroTurnos } from './corte-nuestro-turnos.mjs'

const base = path.join(AQUI, 'aplicado', 'bTbWL9lUvQCfStAz-llave-del-acuse-2026-11-10.json')
const salida = path.join(AQUI, 'aplicado', 'bTbWL9lUvQCfStAz-corte-nuestro-2026-11-11.json')
const f = JSON.parse(fs.readFileSync(base, 'utf8'))
const n = construirCorteNuestroTurnos(f)
fs.writeFileSync(salida, JSON.stringify(f, null, 2) + '\n')
console.log(`nodos cambiados: ${n} · ${path.relative(process.cwd(), salida)}`)
