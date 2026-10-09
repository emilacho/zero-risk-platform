/**
 * Relevo 26 · el SDK del `agent-runner` (0.3.282 · CLI 2.1.282) · pruebas PERMANENTES, US$ 0. El 09-oct la corrida A (Opus 5.5) murió con «Claude Code 2.1.138 does not support this model; version 2.1.280 or newer is required»:
 * el corredor traía el SDK 0.2.138. Estas pruebas fijan que las versiones queden COHERENTES (el SDK, sus binarios musl, el SDK de la API que exige como par y el lockfile) y que no se vuelva a bajar de 2.1.280 sin darse cuenta.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const pkg = JSON.parse(leer('services/agent-runner/package.json')) as { dependencies: Record<string, string>; pnpm: { overrides: Record<string, string> } }
const lock = leer('services/agent-runner/pnpm-lock.yaml')
const SDK = pkg.dependencies['@anthropic-ai/claude-agent-sdk']

describe('SDK del corredor', () => {
  it('está fijado EXACTO (sin ^ ni ~) en una versión 0.3.x cuyo CLI es ≥ 2.1.280 (la 0.3.n trae el CLI 2.1.n)', () => {
    expect(SDK).toMatch(/^0\.3\.\d+$/)
    expect(Number(SDK.split('.')[2])).toBeGreaterThanOrEqual(280)
  })
  it('los binarios musl (que apuntan a los de glibc que usa la imagen) están en LA MISMA versión que el SDK', () => {
    const o = pkg.pnpm.overrides
    expect(o['@anthropic-ai/claude-agent-sdk-linux-x64-musl']).toBe(`npm:@anthropic-ai/claude-agent-sdk-linux-x64@${SDK}`)
    expect(o['@anthropic-ai/claude-agent-sdk-linux-arm64-musl']).toBe(`npm:@anthropic-ai/claude-agent-sdk-linux-arm64@${SDK}`)
  })
  it('el SDK de la API que el SDK exige como par (>= 0.93.0) se cumple', () => {
    const rango = pkg.dependencies['@anthropic-ai/sdk']
    const m = /^\^0\.(\d+)\.\d+$/.exec(rango)
    expect(m, rango).not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(93)
  })
  it('el lockfile resuelve esas mismas versiones (nada quedó en 0.2.138)', () => {
    expect(lock).toContain(`'@anthropic-ai/claude-agent-sdk@${SDK}`)
    expect(lock).toContain(`claude-agent-sdk-linux-x64@${SDK}`)
    expect(lock).not.toContain('0.2.138')
    expect(lock).toMatch(/'@anthropic-ai\/sdk@0\.93\.\d+'/)
  })
})

describe('desde la 0.3.142 los servidores MCP se conectan en segundo plano: el corredor pide esperar como antes', () => {
  it('index.ts fija MCP_CONNECTION_NONBLOCKING=0 al arrancar, salvo que alguien ya lo haya fijado', () => {
    const idx = leer('services/agent-runner/src/index.ts')
    expect(idx).toMatch(/if \(process\.env\.MCP_CONNECTION_NONBLOCKING === undefined\) process\.env\.MCP_CONNECTION_NONBLOCKING = '0'/)
  })
})
