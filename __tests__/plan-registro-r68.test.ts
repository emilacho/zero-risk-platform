/**
 * Ronda 68 · (4) el registro del PLAN lo comprueba el código · (1) el cimiento no escribe la fuente en la prosa.
 * Datos reales de la repetición del tramo 1: el plan de 90 días trae «Pedí por WhatsApp.» dentro de un texto de ejemplo, con el cliente en tuteo (Ecuador).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TABLA } from '../scripts/ops/barrer-voseo.mjs'
import { construir as construirPlaneacion, BIBLIOTECA_PLAN } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r68.mjs'
import { construir as construirCimiento, REGLAS_EVIDENCIA_R68, NODOS as NODOS_REGLAS } from '../scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-r68.mjs'
import { REGLAS_EVIDENCIA } from '../scripts/worker-staging/ssLtwYPt7zxuvnM2/construir-r62.mjs'

const PLAN = fs.readFileSync('src/lib/manual/__tests__/fixtures/repeticion-r68/plan-90-dias-texto.md', 'utf8')
const lib = new Function(`${BIBLIOTECA_PLAN}\nreturn { corregirRegistroDelPlan, formasDeVoseo, bloqueDeRevisionDeRegistro, _VOS_A_TU }`)() as {
  corregirRegistroDelPlan: (t: string, r: string | null) => { texto: string; corregidas: Array<{ antes: string; despues: string }>; restantes: string[] }
  formasDeVoseo: (t: string) => string[]
  bloqueDeRevisionDeRegistro: (r: { restantes: string[] }, registro: string | null) => string
  _VOS_A_TU: Record<string, string>
}

describe('4 · el plan real de la repetición', () => {
  it('rojo de hoy: el plan trae «Pedí por WhatsApp.» (voseo) y ninguna otra forma', () => {
    expect(PLAN).toContain('Pedí por WhatsApp.')
    expect(lib.formasDeVoseo(PLAN)).toEqual([]) // «Pedí» es ambiguo con un pasado: el detector de restos no lo cuenta, la corrección sí lo ve por su posición
  })
  it('verde: con el registro tuteo se corrige SOLO esa palabra y el resto del plan queda idéntico', () => {
    const r = lib.corregirRegistroDelPlan(PLAN, 'tuteo')
    expect(r.corregidas).toEqual([{ antes: 'Pedí', despues: 'Pide' }])
    expect(r.texto).toContain('Pide por WhatsApp.')
    expect(r.texto.replace('Pide por WhatsApp.', 'Pedí por WhatsApp.')).toBe(PLAN)
    expect(r.restantes).toEqual([])
  })
  it('con otro registro NO se reescribe (se respeta el voseo o el usted de una marca que lo pida)', () => {
    for (const reg of ['voseo', 'formal', null, 'sin_dato']) expect(lib.corregirRegistroDelPlan(PLAN, reg as string).texto).toBe(PLAN)
  })
})

describe('4 · reglas del corrector', () => {
  const c = (t: string) => lib.corregirRegistroDelPlan(t, 'tuteo')
  it('imperativo y presente: Mirá → Mira, Sabés → Sabes, vení → ve, con mayúsculas como el original', () => {
    expect(c('Mirá esto. Sabés que sí. Y vení hoy.').texto).toBe('Mira esto. Sabes que sí. Y ve hoy.')
    expect(c('PROBÁ YA').texto).toBe('PRUEBA YA')
  })
  it('las formas en -í que también son un pasado («pedí ayer») solo se tocan al arrancar una oración o tras y/o/e/u o puntuación', () => {
    expect(c('Yo pedí ayer y me gustó.').texto).toBe('Yo pedí ayer y me gustó.')
    expect(c('Pedí hoy. Mirá y pedí mañana.').texto).toBe('Pide hoy. Mira y pide mañana.')
  })
  it('lo citado («…», `…`, direcciones) no se toca, y «SOS» (emergencia) tampoco', () => {
    expect(c('El cliente dice: «Pedí ya» y escribe `pedí`. SOS.').texto).toBe('El cliente dice: «Pedí ya» y escribe `pedí`. SOS.')
    expect(c('Ver https://x.test/mirá').texto).toBe('Ver https://x.test/mirá')
  })
  it('«vos» tras preposición ⇒ «ti»; suelto ⇒ «tú»; «con vos» no se arregla solo (cambia dos palabras): se MARCA', () => {
    expect(c('Es para vos. Vos decidís.').texto).toBe('Es para ti. Tú decides.')
    const r = c('Hablamos con vos.')
    expect(r.texto).toBe('Hablamos con vos.'); expect(r.restantes).toEqual(['vos'])
    expect(lib.bloqueDeRevisionDeRegistro(r, 'tuteo')).toMatch(/Revisión del registro[\s\S]*vos/)
  })
  it('la tabla es la MISMA del barrido (sin segunda lista distinta)', () => {
    for (const [k, v] of Object.entries(lib._VOS_A_TU)) expect((TABLA as Record<string, string>)[k], k).toBe(v)
    expect(Object.keys(lib._VOS_A_TU).length).toBeGreaterThan(250)
  })
  it('agnóstico: ni clientes, ni ciudades, ni rubros', () => {
    expect(BIBLIOTECA_PLAN.replace(/\/\*[\s\S]*?\*\//, '')).not.toMatch(/náufrago|naufrago|olón|guayaquil|ceviche|marisco/i)
  })
})

describe('4 · el nodo «¿Llegó la vuelta?» de la planeación (código REAL del nodo)', () => {
  const antes = JSON.parse(fs.readFileSync('scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ANTES-r68-2026-10-11.json', 'utf8'))
  const despues = construirPlaneacion(antes)
  const corre = (flujo: any, registro: string | null, texto: string) => {
    const code = flujo.nodes.find((n: any) => n.name === '¿Llegó la vuelta?').parameters.jsCode as string
    const nodos: Record<string, any> = { 'elegir brazos': { descartados: [] }, 'Redactor (B4)': { cliente_id: 'c1', registro_usado: registro ? { registro } : undefined }, 'Ficha del cliente': { name: 'Cliente X' } }
    const $ = (n: string) => { if (!(n in nodos)) throw new Error('nodo no previsto ' + n); return { first: () => ({ json: nodos[n] }) } }
    return (new Function('$input', '$', code)({ first: () => ({ json: { body: { response: texto } } }) }, $) as Array<{ json: any }>)[0].json
  }
  it('rojo: el nodo tal como estaba deja pasar «Pedí» al plan guardado', () => {
    expect(corre(antes, 'tuteo', PLAN).texto).toContain('Pedí por WhatsApp.')
  })
  it('verde: con registro tuteo el plan sale con «Pide» y la salida dice qué se corrigió', () => {
    const j = corre(despues, 'tuteo', PLAN)
    expect(j.texto).toContain('Pide por WhatsApp.'); expect(j.texto).not.toContain('Pedí por WhatsApp.')
    expect(j.registro_revisado).toEqual({ registro: 'tuteo', corregidas: 1, formas_corregidas: ['Pedí → Pide'], restantes: [] })
    expect(j.llego_la_vuelta).toBe(true); expect(j.texto).toContain('Lo que NO se buscó y por qué')
  })
  it('lo que no se arregla solo se marca al final del plan; con voseo declarado no se toca nada', () => {
    const j = corre(despues, 'tuteo', 'Hablamos con vos. Pedí ya.')
    expect(j.texto).toMatch(/Revisión del registro \(la hace el sistema\)[\s\S]*vos/); expect(j.registro_revisado.restantes).toEqual(['vos'])
    const v = corre(despues, 'voseo', 'Pedí ya.')
    expect(v.texto).toContain('Pedí ya.'); expect(v.registro_revisado.corregidas).toBe(0)
  })
  it('sin vuelta (espera agotada) o sin registro: no inventa nada y no rompe', () => {
    expect(corre(despues, 'tuteo', '').llego_la_vuelta).toBe(false)
    expect(corre(despues, null, 'Pedí ya.').texto).toContain('Pedí ya.')
  })
  it('solo cambia ese nodo; conexiones y ajustes idénticos; el flujo sigue pegando la tabla única país→trato', () => {
    const cambiados = despues.nodes.filter((n: any, i: number) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n: any) => n.name)
    expect(cambiados).toEqual(['¿Llegó la vuelta?'])
    expect(JSON.stringify(despues.connections)).toBe(JSON.stringify(antes.connections))
    expect(() => construirPlaneacion(despues)).toThrow(/ya trae r68/)
  })
})

describe('1 · el cimiento no escribe la fuente en la prosa', () => {
  const cim = JSON.parse(fs.readFileSync('scripts/worker-staging/ssLtwYPt7zxuvnM2/cimiento-ANTES-2026-10-11-r68.json', 'utf8'))
  const lazo = JSON.parse(fs.readFileSync('scripts/worker-staging/ssLtwYPt7zxuvnM2/lazoA-ANTES-2026-10-11-r68.json', 'utf8'))
  it('rojo: la regla (1) de hoy pide «de dónde salió» junto a la cita (de ahí salen los «(discovery_summary)»)', () => {
    expect(REGLAS_EVIDENCIA).toContain('lleva su cita literal y de dónde salió')
  })
  it('verde: la regla nueva manda la fuente a los metadatos y prohíbe paréntesis de fuente, nombres internos y «ICP …»', () => {
    expect(REGLAS_EVIDENCIA_R68).toMatch(/_field_meta\.<campo>\.fuente/); expect(REGLAS_EVIDENCIA_R68).toMatch(/NUNCA dentro del texto/)
    expect(REGLAS_EVIDENCIA_R68).not.toContain('y de dónde salió')
    expect(REGLAS_EVIDENCIA_R68.length).toBeLessThan(1400)
    expect(REGLAS_EVIDENCIA_R68).not.toMatch(/Olón|Náufrago|ceviche|marisco|restaurante/i)
  })
  it('cimiento y Lazo A: solo cambia el texto de las reglas en su nodo; el resto, idéntico', () => {
    for (const antes of [cim, lazo]) {
      const { flujo, tocados } = construirCimiento(antes)
      expect(tocados).toHaveLength(1); expect(NODOS_REGLAS).toContain(tocados[0])
      const cambiados = flujo.nodes.filter((n: any, i: number) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n: any) => n.name)
      expect(cambiados).toEqual(tocados)
      const nodo = flujo.nodes.find((n: any) => n.name === tocados[0])
      expect(nodo.parameters.jsCode).toContain(JSON.stringify(REGLAS_EVIDENCIA_R68)); expect(nodo.parameters.jsCode).not.toContain(JSON.stringify(REGLAS_EVIDENCIA))
      expect(JSON.stringify(flujo.connections)).toBe(JSON.stringify(antes.connections))
    }
  })
})
