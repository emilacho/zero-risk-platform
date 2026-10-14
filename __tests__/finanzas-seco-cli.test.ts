/**
 * EL CLI DEL SECO DE LA OFICINA FINANCIERA (CC#2 · 14-oct): sin `--aplicar` solo imprime (cero red), nunca imprime una llave, se niega sin sus variables y no conoce la llave de despacho.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..')
const CLI = path.join(RAIZ, 'scripts/ops/finanzas-seco.mjs')
const LLAVE_SECRETA = 'llave-secreta-que-jamas-debe-salir-por-pantalla'
const correr = (args: string[], env: Record<string, string> = {}) => {
  const limpio: Record<string, string> = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '' }
  return spawnSync(process.execPath, [CLI, ...args], { cwd: RAIZ, encoding: 'utf8', env: { ...limpio, ...env } as NodeJS.ProcessEnv, timeout: 30_000 })
}

describe('finanzas-seco.mjs', () => {
  it('`plan` no necesita red ni variables y describe la matriz, los interruptores y las 3 condiciones', () => {
    const r = correr(['plan'])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/celdas\s+: 140/)
    expect(r.stdout).toMatch(/INTERRUPTORES/)
    expect(r.stdout).toMatch(/3 CONDICIONES DE CC#3/)
    expect(r.stdout).toMatch(/Ahora no se ha tocado nada/)
  })
  it('sin `--aplicar`, `correr` y `puerta` solo imprimen: ni una llamada de red, ni una variable pedida', () => {
    for (const args of [['correr', '--negocio', 'tienda-en-linea', '--caso', 'completo'], ['puerta'], ['apagar']]) {
      const r = correr(args, { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x', N8N_API_KEY: 'x', N8N_BASE_URL: 'http://127.0.0.1:9', APP_URL: 'http://127.0.0.1:9', INTERNAL_API_KEY: LLAVE_SECRETA })
      expect(r.status, args.join(' ')).toBe(0)
      expect(r.stdout, args.join(' ')).toMatch(/solo se imprime/)
      expect(r.stdout + r.stderr).not.toContain(LLAVE_SECRETA)
    }
  })
  it('con `--aplicar` y sin su llave interna se niega (código 2) y dice cuál falta, sin imprimir ninguna', () => {
    const r = correr(['correr', '--negocio', 'tienda-en-linea', '--caso', 'completo', '--aplicar'], { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x' })
    expect(r.status).toBe(2)
    expect(r.stderr).toMatch(/INTERNAL_API_KEY/)
  })
  it('una orden desconocida sale con 2', () => {
    expect(correr(['inventada']).status).toBe(2)
  })
  it('el kit no lee ni nombra la llave de despacho y despierta solo por la ruta', () => {
    const src = fs.readFileSync(CLI, 'utf8').replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')
    expect(src).not.toMatch(/process\.env\.SALA_DISPATCH_KEY|x-sala-dispatch-key/i)
    expect(src).toContain("'x-api-key'")
    expect(src).toContain('/api/finanzas/conversa')
  })
})
