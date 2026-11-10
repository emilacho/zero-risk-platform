/**
 * GO-LENOVO 10-nov 18:14Z punto 1 · la tabla de alarmas de fechas pierde los permisos de más del servidor (vaciar, referencias, disparadores,
 * mantenimiento, y UPDATE del contador) y conserva lo que usa: leer, insertar y cerrar (UPDATE) alarmas, y USAGE del contador.
 * Lo medido en vivo el 10-nov 18:07Z: tabla service_role=arwDxtm · contador service_role=rwU. La reversa vuelve exactamente a eso.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const N = '202611102200_alarmas_de_fechas_sin_permisos_de_mas'
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '')
const sentencias = (s: string) => s.replace(/--.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean)
const MIG = sentencias(leer(`supabase/migrations/${N}.sql`))
const REV = sentencias(leer(`supabase/reversas/${N}_REVERSA.sql`))

/** aplica, sobre el acl medido de un rol, las sentencias revoke/grant de un archivo (solo las de service_role en estos dos objetos) */
const LETRA: Record<string, string> = { select: 'r', insert: 'a', update: 'w', delete: 'd', truncate: 'D', references: 'x', trigger: 't', maintain: 'm', usage: 'U' }
function aplicar(acl: { tabla: string; contador: string }, sql: string[]) {
  const out = { ...acl }
  for (const s of sql) {
    const m = /^(revoke|grant) (.+?) on (sequence )?public\.(cadena_fechas_alarmas(?:_id_seq)?) (?:from|to) service_role;$/.exec(s)
    if (!m) continue
    const cual = m[3] ? 'contador' : 'tabla'
    expect(m[4]).toBe(cual === 'contador' ? 'cadena_fechas_alarmas_id_seq' : 'cadena_fechas_alarmas')
    const letras = m[2]!.split(',').map((p) => LETRA[p.trim()]!)
    for (const l of letras) out[cual] = m[1] === 'revoke' ? out[cual].replace(l, '') : out[cual].includes(l) ? out[cual] : out[cual] + l
  }
  const ord = (x: string) => [...x].sort().join('')
  return { tabla: ord(out.tabla), contador: ord(out.contador) }
}
const MEDIDO = { tabla: 'arwDxtm', contador: 'rwU' }
const ord = (x: string) => [...x].sort().join('')

describe('migración: una transacción, solo el servidor, solo estos dos objetos', () => {
  it('abre y cierra una transacción y no hace nada más', () => {
    expect(MIG[0]).toBe('begin;')
    expect(MIG.at(-1)).toBe('commit;')
    expect(MIG.slice(1, -1)).toEqual([
      'revoke truncate, references, trigger, maintain on public.cadena_fechas_alarmas from service_role;',
      'revoke update on sequence public.cadena_fechas_alarmas_id_seq from service_role;',
    ])
  })
  it('después quedan exactamente leer, insertar y cerrar en la tabla, y usar/leer el contador (lo que pidió #1002)', () => {
    expect(aplicar(MEDIDO, MIG)).toEqual({ tabla: ord('arw'), contador: ord('rU') })
  })
  it('🔴 el servidor sigue pudiendo insertar (a), cerrar alarmas (w) y sacar el número siguiente (U); sin vaciar (D) ni borrar (d)', () => {
    const d = aplicar(MEDIDO, MIG)
    for (const l of ['a', 'r', 'w']) expect(d.tabla).toContain(l)
    expect(d.contador).toContain('U')
    for (const l of ['D', 'd', 'x', 't', 'm']) expect(d.tabla).not.toContain(l)
    expect(d.contador).not.toContain('w')
  })
  it('no toca otros roles, ni reglas, ni valores por omisión (eso es el punto 2, en paso aparte)', () => {
    const texto = MIG.join('\n')
    expect(texto).not.toMatch(/\b(anon|authenticated|postgres|public\s+from|policy|default privileges|cerebro_|client_voc_)\b/i)
  })
})

describe('reversa = lo medido', () => {
  it('una transacción que devuelve exactamente lo medido el 10-nov 18:07Z', () => {
    expect(REV[0]).toBe('begin;')
    expect(REV.at(-1)).toBe('commit;')
    expect(aplicar(aplicar(MEDIDO, MIG), REV)).toEqual({ tabla: ord(MEDIDO.tabla), contador: ord(MEDIDO.contador) })
  })
})
