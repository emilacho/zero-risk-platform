/** la semilla de 202611162230 leída como filas (como las devuelve la base), para cruzarla con el código en las pruebas · sin base ni red */
import fs from 'node:fs'
import path from 'node:path'
import type { LecturaDeLaBiblioteca } from '../video/biblioteca'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
export const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611162230_oficina_biblioteca_de_planos_y_ritmos_de_video.sql'), 'utf8')
export const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', '202611162230_oficina_biblioteca_de_planos_y_ritmos_de_video_REVERSA.sql'), 'utf8')

// ───────── la semilla de la migración, leída como filas (para cruzarla con el código)
const arr = (s: string): string[] => (s === "'{}'" ? [] : [...s.matchAll(/(?:\$d\$([^$]*)\$d\$|'([^']*)')/g)].map((m) => m[1] ?? m[2]))
const FICHA = /^\s+\('([a-z0-9-]+)', \$d\$(.+?)\$d\$, \$d\$(.+?)\$d\$, ARRAY\[([^\]]*)\], '([^']*)', '([^']*)', \$d\$(.+?)\$d\$, '([^']*)', ([\d.]+), ([\d.]+), \$d\$(.+?)\$d\$, ARRAY\[(.*)\], ('\{\}'|ARRAY\[[^\]]*\]), (\d+)\),?$/
const RITMO = /^\s+\('([a-z0-9-]+)', \$d\$(.+?)\$d\$, ([\d.]+), ([\d.]+), (NULL|'[a-z]+'), (\d+), (\d+), ([\d.]+), ([\d.]+), ARRAY\[(.*)\]\),?$/
export const FILAS_FICHAS = SQL.split('\n').map((l) => FICHA.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({
  id: m[1], nombre: m[2], que_hace: m[3], roles: arr(m[4]), material: m[5], forma: m[6], camara: m[7], intensidad: m[8], segundos_min: Number(m[9]), segundos_max: Number(m[10]), efecto: m[11], trampas: arr(m[12]), rubros: m[13] === "'{}'" ? [] : arr(m[13].replace(/^ARRAY\[|\]$/g, '')), orden: Number(m[14]), activo: true,
}))
export const FILAS_RITMOS = SQL.split('\n').map((l) => RITMO.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => ({
  id: m[1], nombre: m[2], segundos_min: Number(m[3]), segundos_max: Number(m[4]), red: m[5] === 'NULL' ? null : m[5].slice(1, -1), planos_min: Number(m[6]), planos_max: Number(m[7]), gancho_hasta_s: Number(m[8]), producto_antes_de_s: Number(m[9]), notas: arr(m[10]), rubros: [], activo: true,
}))
export const LECTURA_DE_LA_SEMILLA = (industria: string | null): LecturaDeLaBiblioteca => ({ fichas: FILAS_FICHAS, ritmos: FILAS_RITMOS, industria })

