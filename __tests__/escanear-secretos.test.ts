/**
 * El escáner de secretos por forma: detecta cada tipo de la lista de CC#3, no dispara con marcadores ni con palabras
 * normales, y NUNCA devuelve el valor completo. Los valores falsos se arman por partes para no tropezar con la
 * protección de GitHub ni con el propio escáner.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PATRONES, archivosVersionados, escanearCarpeta, escanearTexto, esDeMentira, ejecutar, formatear } from '../scripts/ops/escanear-secretos.mjs'

const ALFA = 'K9mQ2xLp7RvTz4WnB8cYd3'
const alfa = (n: number) => Array.from({ length: n }, (_, i) => ALFA[i % ALFA.length]).join('')
const HEX = '9f3e7c1a5b2d8064e1f7a3c9b5d20e68'.repeat(2)
const MAYUS = 'Q7K2M9X4B8L3N5P6R1S2T4V6W8Y0'

/** tipo → valor falso que el patrón correspondiente DEBE detectar */
const SEMBRADOS: Record<string, string> = {
  'Cal.com': 'cal_' + 'live_' + alfa(24),
  'Anthropic': 'sk-' + 'ant-' + alfa(40),
  'OpenAI / Braintrust': 'sk-' + 'proj-' + alfa(48),
  'JWT (Supabase / n8n)': 'eyJ' + alfa(24) + '.' + alfa(24) + '.' + alfa(24),
  'Slack (token)': 'xox' + 'b-' + '1234567890-' + alfa(24),
  'Slack (webhook)': 'hooks.slack' + '.com/services/' + 'T0' + alfa(12) + '/B0' + alfa(12),
  'Meta': 'EAA' + alfa(90),
  'Apify': 'apify_' + 'api_' + alfa(30),
  'Supabase (sb_)': 'sb_' + 'secret_' + alfa(30),
  'Supabase (sbp_)': 'sbp_' + HEX.slice(0, 40),
  'GitHub': 'gh' + 'p_' + alfa(40),
  'Healthchecks': 'hc' + 'r_' + alfa(32),
  'Google OAuth (secreto de cliente)': 'GOC' + 'SPX-' + alfa(28),
  'Google API': 'AI' + 'za' + alfa(35),
  'Doppler': 'dp.' + 'st.' + alfa(40),
  'Vercel': 'vcp_' + alfa(30),
  'AWS': 'AK' + 'IA' + MAYUS.slice(0, 16),
  'Postgres (URL con clave)': 'postgres' + '://usuario:' + alfa(14) + '@host.ejemplo.com:5432/db',
}

describe('escanear-secretos · cada patrón detecta su tipo', () => {
  it('la lista sembrada cubre TODOS los patrones (nadie queda sin prueba)', () => {
    expect(Object.keys(SEMBRADOS).sort()).toEqual([...new Set(PATRONES.map((p) => p.tipo))].sort())
  })
  for (const [tipo, valor] of Object.entries(SEMBRADOS)) {
    it(`detecta ${tipo}`, () => {
      const h = escanearTexto(`dato = ${valor} fin`)
      expect(h.map((x: { tipo: string }) => x.tipo)).toContain(tipo)
    })
  }
})

describe('escanear-secretos · lo que NO es un secreto', () => {
  it('<REDACTADO>, XXXX y puntos suspensivos no disparan', () => {
    expect(escanearTexto('token: <REDACTADO>\nllave: sk-' + 'ant-' + 'X'.repeat(40) + '\nid: cal_' + 'live_' + '….')).toEqual([])
  })
  it('palabras normales con «sk-» no disparan por el lookbehind (task-…)', () => {
    expect(escanearTexto('un task-' + alfa(50) + ' cualquiera')).toEqual([])
  })
  it('un hex largo fuera de la carpeta de fichas NO dispara; dentro SÍ', () => {
    expect(escanearTexto(`hash ${HEX}`, { ruta: 'src/algo.ts' })).toEqual([])
    expect(escanearTexto(`hash ${HEX}`, { ruta: 'zr-vault/00-meta/credentials/x.md' }).length).toBe(1)
    expect(escanearTexto(`hash ${HEX}`, { ruta: 'zr-vault\\00-meta\\credentials\\x.md'.replace(/\\/g, '/') }).length).toBe(1)
  })
  it('una URL de Postgres con marcador de clave (<clave>, ${CLAVE}) no dispara; con clave real sí', () => {
    expect(escanearTexto('postgres' + '://u:<clave>@h/db')).toEqual([])
    expect(escanearTexto('postgres' + '://u:${CLAVE_LARGA}@h/db')).toEqual([])
    expect(escanearTexto('postgres' + '://u:' + alfa(12) + '@h/db').length).toBe(1)
  })
  it('en la fila de token, un nombre de variable o un valor sin dígitos no dispara', () => {
    expect(escanearTexto('| Token | `SLACK_BOT_TOKEN_NOMBRE` |')).toEqual([])
    expect(escanearTexto('| Token | `valor-largo-sin-numeros-aqui` |')).toEqual([])
    expect(escanearTexto('| Token | `' + alfa(20) + '` |').length).toBe(1)
  })
  it('límites de largo: un nombre con dígitos, un valor corto y formas demasiado cortas no disparan', () => {
    expect(escanearTexto('| Token | `SLACK_BOT_TOKEN_2026_NOMBRE` |')).toEqual([])
    expect(escanearTexto('| Token | `a1b2c3d4e5` |')).toEqual([])
    expect(escanearTexto('x EAA' + alfa(40))).toEqual([])
    expect(escanearTexto('x EAA' + alfa(80)).length).toBe(1)
    expect(escanearTexto('hooks.slack' + '.com/services/T0ABC')).toEqual([])
  })
  it('esDeMentira reconoce marcadores y ejemplos, no un valor real', () => {
    for (const v of ['XXXXXXXX', 'abc...', 'valor…', 'EXAMPLEKEY', 'fake_key', 'abcdef']) expect(esDeMentira(v)).toBe(true)
    expect(esDeMentira(alfa(40))).toBe(false)
  })
})

describe('escanear-secretos · por contexto (fichas de proveedor)', () => {
  it('la fila «Auth Token» con un valor en comillas invertidas dispara; con <REDACTADO> no', () => {
    expect(escanearTexto('| Auth Token | `' + alfa(32) + '` |').map((h: { tipo: string }) => h.tipo)).toEqual(['ficha de proveedor (valor en la fila de token)'])
    expect(escanearTexto('| Auth Token | `<REDACTADO>` |')).toEqual([])
    expect(escanearTexto('| Auth Token | `corto` |')).toEqual([])
  })
})

describe('escanear-secretos · nunca imprime el valor', () => {
  it('el hallazgo trae solo los últimos 4 y la línea formateada no contiene el valor', () => {
    const v = SEMBRADOS['Anthropic']
    const [h] = escanearTexto('x ' + v, {})
    expect(h.fin).toBe(v.slice(-4))
    expect(JSON.stringify(h)).not.toContain(v)
    expect(formatear({ archivo: 'a/b.md', ...h })).not.toContain(v.slice(0, -4))
  })
})

describe('escanear-secretos · recorrido de carpetas', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'escaner-'))
  fs.mkdirSync(path.join(tmp, 'a'), { recursive: true })
  fs.mkdirSync(path.join(tmp, '.obsidian'), { recursive: true })
  fs.mkdirSync(path.join(tmp, 'node_modules', 'x'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'a', 'vivo.md'), 'k=' + SEMBRADOS['Vercel'] + '\n')
  fs.writeFileSync(path.join(tmp, 'a', 'limpio.md'), 'k=<REDACTADO>\n')
  fs.writeFileSync(path.join(tmp, '.obsidian', 'plugin.js'), 'k=' + SEMBRADOS['Vercel'] + '\n')
  fs.writeFileSync(path.join(tmp, 'node_modules', 'x', 'i.js'), 'k=' + SEMBRADOS['Vercel'] + '\n')
  it('encuentra el vivo, ignora .obsidian y node_modules, y cuenta los archivos revisados', () => {
    const r = escanearCarpeta(tmp)
    expect(r.hallazgos.map((h: { archivo: string }) => path.basename(h.archivo))).toEqual(['vivo.md'])
    expect(r.archivos).toBe(2)
  })
  it('ejecutar --boveda falla (ok=false) con hallazgos y pasa con la carpeta limpia; el log no trae el valor', () => {
    const lineas: string[] = []
    const r = ejecutar({ modo: 'boveda', carpeta: tmp, log: (s: string) => lineas.push(s) })
    expect(r.ok).toBe(false)
    expect(lineas.join('\n')).not.toContain(SEMBRADOS['Vercel'])
    expect(lineas.join('\n')).toMatch(/1 hallazgos/)
    const limpia = fs.mkdtempSync(path.join(os.tmpdir(), 'escaner-limpia-'))
    fs.writeFileSync(path.join(limpia, 'n.md'), 'nada\n')
    expect(ejecutar({ modo: 'boveda', carpeta: limpia, log: () => {} }).ok).toBe(true)
  })
  it('modo --repo: lista los archivos versionados sin las carpetas excluidas, y avisa si git falla', () => {
    const ok = (_c: string, _a: string[]) => ({ status: 0, stdout: 'a.txt\0.obsidian/x.js\0b/node_modules/y.js\0c/d.md\0' })
    expect(archivosVersionados('/r', ok).map((p: string) => p.replace(/\\/g, '/'))).toEqual(['/r/a.txt', '/r/c/d.md'])
    expect(archivosVersionados('/r', () => ({ status: 128, stdout: '' }))).toBeNull()
    const lineas: string[] = []
    expect(ejecutar({ modo: 'repo', log: (s: string) => lineas.push(s), run: () => ({ status: 128, stdout: '' }) }).ok).toBe(false)
    expect(lineas[0]).toMatch(/no pude listar/)
  })
  it('un secreto de Meta pegado a una palabra no dispara (límite de palabra)', () => {
    expect(escanearTexto('x' + SEMBRADOS['Meta'])).toEqual([])
    expect(escanearTexto(' ' + SEMBRADOS['Meta']).length).toBe(1)
  })
  it('sin carpeta o sin modo no hace nada y avisa', () => {
    const lineas: string[] = []
    expect(ejecutar({ modo: 'boveda', carpeta: '/no/existe', log: (s: string) => lineas.push(s) }).ok).toBe(false)
    expect(ejecutar({ log: (s: string) => lineas.push(s) }).ok).toBe(false)
    expect(lineas.length).toBe(2)
  })
})
