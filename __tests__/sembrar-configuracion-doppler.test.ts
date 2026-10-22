/** Sembrar solo CONFIGURACIÓN no secreta en Doppler: lo importante es lo que se descarta. Solo funciones puras. */
import { describe, expect, it } from 'vitest'
import { REFERENCIAS, pareceSecretoPorNombre, pareceSecretoPorValor, planear } from '../scripts/ops/sembrar-configuracion-doppler.mjs'

const v = (key: string, type: string, value: string | undefined, target = ['production', 'preview']) => ({ key, type, target, value })

describe('pareceSecretoPorNombre', () => {
  it('detecta llaves, tokens, secretos, contraseñas, DSN, firmas y webhooks', () => {
    for (const n of ['OPENAI_API_KEY', 'SLACK_BOT_TOKEN', 'CRON_SECRET', 'MC_MASTER_PASSWORD', 'SENTRY_DSN', 'SALA_INGRESS_VENTAS_HMAC_SECRET', 'INNGEST_SIGNING_KEY', 'SLACK_WEBHOOK_URL', 'APIFY_SERVICE_WEBHOOK_URL', 'DATAFORSEO_AUTH', 'SLACK_ALGO']) expect(pareceSecretoPorNombre(n), n).toBe(true)
  })
  it('deja pasar configuración: URLs, ids, banderas, topes y modelos', () => {
    for (const n of ['N8N_BASE_URL', 'MC_BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SALA_INTAKE_ENABLED', 'PORTERO_GASTO_AVISO_USD', 'OFICINA_REVISOR_MODEL', 'ANTHROPIC_ENVIRONMENT_ID', 'SENTRY_ORG', 'FINANZAS_CANAL_PREGUNTAS']) expect(pareceSecretoPorNombre(n), n).toBe(false)
  })
})

describe('pareceSecretoPorValor', () => {
  it('detecta formas de llave y de URL con credenciales', () => {
    for (const x of ['sk-proj-' + 'a'.repeat(40), 'xoxb-1234-5678-abcd', 'eyJ' + 'a'.repeat(30), 'apify_api_' + 'b'.repeat(20), 'a'.repeat(40), 'f'.repeat(64), 'Bearer abcdefghijklmnop', 'https://usuario:clave@host.test/x', 'https://x.test/api?token=abc', 'https://' + 'hooks.' + 'slack.com/services/T0/B0/xyz']) expect(pareceSecretoPorValor(x), x.slice(0, 20)).toBe(true)
  })
  it('deja pasar valores de configuración corrientes', () => {
    for (const x of ['true', '1.5', 'https://n8n-production-72be.up.railway.app', 'claude-sonnet-4-6', 'C0B7XUUEBHA', 'U01ABCDEF,U02GHIJKL', 'zero-risk-platform']) expect(pareceSecretoPorValor(x), x).toBe(false)
  })
  it('un valor que no es texto se trata como secreto (no se siembra lo que no se pudo leer)', () => {
    expect(pareceSecretoPorValor(undefined as never)).toBe(true)
  })
})

describe('planear', () => {
  it('siembra configuración legible de Producción y descarta con motivo todo lo demás', () => {
    const p = planear([
      v('N8N_BASE_URL', 'plain', 'https://n8n.test'),
      v('SALA_INTAKE_ENABLED', 'encrypted', 'true'),
      v('OPENAI_API_KEY', 'encrypted', 'sk-proj-' + 'a'.repeat(40)),            // nombre de secreto
      v('MC_SUPABASE_MODE', 'sensitive', undefined),                              // sensible en Vercel
      v('ESCONDIDA', 'encrypted', 'f'.repeat(64)),                                 // el nombre no lo delata, el valor sí
      v('SOLO_EN_PREVIEW', 'plain', 'x', ['preview']),                              // sin valor en Producción
      v('YA_ESTA', 'plain', 'x'),                                                   // ya existe en Doppler
    ], ['YA_ESTA'])
    expect(p.sembrar.map((s: { nombre: string }) => s.nombre).sort()).toEqual(['N8N_BASE_URL', 'SALA_INTAKE_ENABLED'])
    const motivo = (n: string) => p.descartadas.find((d: { nombre: string }) => d.nombre === n)?.motivo
    expect(motivo('OPENAI_API_KEY')).toMatch(/nombre/); expect(motivo('MC_SUPABASE_MODE')).toMatch(/sensible/); expect(motivo('ESCONDIDA')).toMatch(/valor parece/)
    expect(motivo('SOLO_EN_PREVIEW')).toMatch(/Producción/); expect(motivo('YA_ESTA')).toMatch(/ya existe/)
  })
  it('un valor largo de letras y números mezclados (forma de llave) y un valor larguísimo con espacios NO se siembran', () => {
    const p = planear([v('ID_RARO', 'encrypted', 'Zq9'.repeat(15)), v('TEXTO_LARGO', 'encrypted', 'palabra '.repeat(300))], [])
    expect(p.sembrar).toEqual([])
    expect(p.descartadas.map((d: { motivo: string }) => d.motivo).sort()).toEqual(['el valor parece una llave o lleva credenciales', 'valor demasiado largo para ser configuración'])
  })
  it('una variable sensible en todos sus entornos nunca se siembra, aunque traiga un valor', () => {
    expect(planear([v('X_ID', 'sensitive', 'abc')], []).sembrar).toEqual([])
  })
  it('usa el valor de Producción cuando hay varios entornos', () => {
    const p = planear([v('A_URL', 'plain', 'https://dev.test', ['development']), v('A_URL', 'plain', 'https://prod.test', ['production'])], [])
    expect(p.sembrar).toEqual([{ nombre: 'A_URL', valor: 'https://prod.test' }])
  })
  it('las que se espejan por referencia no se siembran como valor', () => {
    expect(Object.keys(REFERENCIAS)).toContain('APIFY_API_TOKEN'); expect(REFERENCIAS.APIFY_API_TOKEN).toBe('${APIFY_TOKEN}')
    expect(planear([v('APIFY_API_TOKEN', 'encrypted', 'x')], []).sembrar).toEqual([])
  })
})
