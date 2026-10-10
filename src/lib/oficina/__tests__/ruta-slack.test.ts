import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// La oficina usa la credencial de Slack que ya existe (SLACK_BOT_TOKEN), no una propia.
describe('ruta · token de Slack', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/lib/oficina/ruta.ts'), 'utf8')
  it('lee SLACK_BOT_TOKEN y no OFICINA_SLACK_BOT_TOKEN', () => {
    expect(src).toMatch(/process\.env\.SLACK_BOT_TOKEN\b/)
    expect(src).not.toMatch(/OFICINA_SLACK_BOT_TOKEN/)
  })
})
