/**
 * Barrido del voseo (relevo «sin voseo» · 2026-10-11 · firma de Emilio: «idioma: tuteo de Ecuador, nunca voseo»). Todo en seco: sin n8n, sin base, sin modelo (US$ 0).
 * Lo que se prueba es la HERRAMIENTA (`scripts/ops/barrer-voseo.mjs`) y que los flujos barridos quedan sin voseo en las instrucciones y SIN romper el detector de trato:
 *   ① la tabla y las reglas generales (imperativo en -á, presente en -ás, pronombre) · ② lo que NO se toca (el diccionario del detector, expresiones regulares, valores `'vos'`, citas, comentarios con ejemplos,
 *   pasados en 1.ª persona, «SOS») · ③ los flujos: segunda pasada = 0 cambios, misma estructura, el detector de trato intacto · ④ los papeles en Markdown: citas de Emilio intactas
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { TABLA, barrerFlujo, barrerMarkdown, barrerTexto } from '../scripts/ops/barrer-voseo.mjs'

const b = (t: string) => barrerTexto(t).texto
/** varias frases en LÍNEAS distintas (una sola línea con muchas formas se leería como el diccionario del detector) */
const NL = String.fromCharCode(10)
const l = (...frases: string[]) => frases.join(NL)

describe('① la tabla y las reglas generales', () => {
  it('imperativo en -á (regular): se quita la tilde · incluso los que acaban en -rá y están en la tabla', () => {
    expect(b(l('Usá el tool y pasá `lens`.', 'Mejorá el borrador y analizá todo.'))).toBe(l('Usa el tool y pasa `lens`.', 'Mejora el borrador y analiza todo.'))
    expect(b(l('Declará cuál gobierna.', 'Registrá el hallazgo. Esperá la vuelta.'))).toBe(l('Declara cuál gobierna.', 'Registra el hallazgo. Espera la vuelta.'))
  })
  it('imperativo en -é / -í (irregulares, uno por uno): cambia la raíz cuando hace falta', () => {
    expect(b(l('Devolvé la pieza. Mantené la estructura.', 'Respondé con JSON. Elegí uno.', 'Emití tu voto. Construí la sección.', 'Describí lo que ves.'))).toBe(l('Devuelve la pieza. Mantén la estructura.', 'Responde con JSON. Elige uno.', 'Emite tu voto. Construye la sección.', 'Describe lo que ves.'))
    expect(b(l('Decime cómo.', 'Rehacé el descubrimiento. Hacelo ya.'))).toBe(l('Dime cómo.', 'Rehaz el descubrimiento. Hazlo ya.'))
  })
  it('presente de indicativo: -ás regular y los irregulares de la tabla', () => {
    expect(b(l('Si querés algo, pedilo.', 'Vos sabés y tenés razón.', 'Consultás y aplicás; decidís vos.'))).toBe(l('Si quieres algo, pídelo.', 'Tú sabes y tienes razón.', 'Consultas y aplicas; decides tú.'))
    expect(b('Sos un evaluador. Eres libre.')).toBe('Eres un evaluador. Eres libre.')
  })
  it('con pronombre pegado y sin tilde (la forma «podes» / «usala» / «decilo» también es voseo)', () => {
    expect(b(l('Podes navegar. Usala para decir QUE ES el negocio.', 'DECILO con estas palabras. Pedilo con `forzar`.', 'Fijate y animate.'))).toBe(l('Puedes navegar. Úsala para decir QUE ES el negocio.', 'DILO con estas palabras. Pídelo con `forzar`.', 'Fíjate y anímate.'))
  })
  it('el pronombre «vos»: tras preposición → «ti» · suelto en prosa → «tú» · mayúsculas respetadas', () => {
    expect(b('te eligen a vos')).toBe('te eligen a ti')
    expect(b('Los jefes diagnostican, vos reescribes.')).toBe('Los jefes diagnostican, tú reescribes.')
    expect(b('Vos escribís el prompt.')).toBe('Tú escribes el prompt.')
    expect(b('con vos')).toBe('contigo')
  })
  it('conserva MAYÚSCULAS e inicial: «LLAMÁ EL TOOL» → «LLAMA EL TOOL»', () => {
    expect(b('LLAMÁ EL TOOL `emit` · Llamá esto una vez · llamá otra')).toBe('LLAMA EL TOOL `emit` · Llama esto una vez · llama otra')
  })
  it('cada entrada de la tabla es una forma con voseo y su sustituto NO lo es (tilde de voseo fuera, sin cambios de significado evidentes)', () => {
    for (const [vos, tu] of Object.entries(TABLA)) {
      expect(typeof tu).toBe('string')
      expect(tu.length).toBeGreaterThan(0)
      if (vos !== 'dale') expect(tu).not.toBe(vos)
      expect(/vos\b/.test(tu)).toBe(false)
    }
  })
})

describe('② lo que NO se toca', () => {
  it('el diccionario del detector (lista densa de formas) y las líneas que explican el registro', () => {
    const dic = "const _VOSEO = _pal('vos|tenés|querés|podés|hacés|sabés|decís|venís|vivís|sos|pedí|vení|probá|mirá')"
    expect(barrerTexto(dic).texto).toBe(dic)
    const expl = 'idioma: "español de Ecuador · sin voseo (tú, no vos: «sabes», «pides»)"'
    expect(barrerTexto(expl).texto).toBe(expl)
  })
  it('las expresiones regulares y los VALORES del detector de trato («\'vos\'» no se vuelve «tú»)', () => {
    for (const l of [
      "tuteo: [/\\b(?:nunca|jamas|no)\\s+(?:uses?\\s+|usar\\s+)?vos\\b/],",
      "var TRATOS = ['tu', 'vos', 'usted']",
      "var POR_PAIS = { argentina: 'vos', uruguay: 'vos', ecuador: 'tu' }",
      "if (w === 'vos') add('vos', w)",
      'var out = { vos: [], tu: [], usted: [] }',
      "if (/^(vos|voseo|vosear)$/.test(t)) return 'vos'",
    ]) expect(barrerTexto(l).texto).toBe(l)
  })
  it('la 1.ª persona del pretérito («pedí», «no pedí nada») no se vuelve imperativo; el imperativo al arrancar una cláusula sí', () => {
    expect(b('Si no pediste nada: «no pedí nada» y listo. Mandé el sobre y escribí el papel.')).toBe('Si no pediste nada: «no pedí nada» y listo. Mandé el sobre y escribí el papel.')
    expect(b('Usa: pedí por WhatsApp. Escribí el texto.')).toBe('Usa: pide por WhatsApp. Escribe el texto.')
  })
  it('un comentario con ejemplos, citas o sobre el trato queda como está · una sola forma en un comentario SÍ se barre', () => {
    expect(b('x = 1 // pedí · mandá · escribí')).toBe('x = 1 // pedí · mandá · escribí')
    expect(b('// «Tutea siempre (nunca vos)»: así dice el manual')).toBe('// «Tutea siempre (nunca vos)»: así dice el manual')
    expect(b('// emití UN solo item con las 3 tasks')).toBe('// emite UN solo item con las 3 tasks')
  })
  it('«SOS» (la alerta) y las palabras que acaban en -á/-ás sin ser verbo', () => {
    expect(b('SOS alerta · está ahí · será útil · además, más y jamás · allá vamos')).toBe('SOS alerta · está ahí · será útil · además, más y jamás · allá vamos')
    expect(b('Tomás y Nicolás llegaron.')).toBe('Tomás y Nicolás llegaron.')
  })
  it('un texto sin voseo no cambia ni un carácter, y barrer dos veces da lo mismo que una', () => {
    const t = 'Eres un evaluador. Usa el tool, di lo que ves y pide ayuda si puedes.'
    expect(b(t)).toBe(t)
    const v = 'Mejorá el texto. Devolvé el JSON. Podés parar.'
    expect(b(b(v))).toBe(b(v))
  })
})

// ───────────────────────── ③ los flujos
const WS = join(process.cwd(), 'scripts/worker-staging')
type Flujo = { nodes: Array<{ name: string; type: string; parameters: Record<string, unknown>; id?: string }>; connections: Record<string, unknown> }
const par = (carpeta: string, nombre: string) => ({ antes: `${carpeta}/${nombre}-ANTES-sin-voseo-2026-10-11.json`, despues: `${carpeta}/${nombre}-ARREGLADO-sin-voseo-2026-10-11.json` })
const FLUJOS = [par('ssLtwYPt7zxuvnM2', 'cimiento'), par('ssLtwYPt7zxuvnM2', 'lazoA'), par('LyVoKcrypS5uLyuu', 'alta'), par('hi5nwPCGUWHkGnT7', 'camino3-voto'), par('X9F0zp6LQ2xGEYVS', 'planeacion'), par('PQdIgbuFexuBsoh8', 'brief'), par('cadena', 'parte-por-filas')]
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const textos = (f: Flujo) => JSON.stringify(f.nodes.map((n) => n.parameters))

describe('③ los flujos barridos', () => {
  for (const { antes, despues } of FLUJOS) {
    const nombre = antes.split('/').pop()!.replace('-ANTES-sin-voseo-2026-10-11.json', '')
    it(`${nombre}: el ARREGLADO es exactamente lo que da barrer el ANTES (reproducible) y una segunda pasada no cambia nada`, () => {
      const a = leer(antes), d = leer(despues)
      const r = barrerFlujo(a)
      expect(JSON.stringify(r.flujo)).toBe(JSON.stringify(d))
      expect(barrerFlujo(d).cambios).toEqual([])
    })
    it(`${nombre}: misma estructura (nodos, tipos, ids, conexiones) · solo cambian textos de parámetros`, () => {
      const a = leer(antes), d = leer(despues)
      expect(d.nodes.map((n) => [n.name, n.type, n.id])).toEqual(a.nodes.map((n) => [n.name, n.type, n.id]))
      expect(d.connections).toEqual(a.connections)
    })
  }
  it('lo barrido NO deja voseo en las instrucciones: el detector sobre el texto barrido solo encuentra el diccionario del detector de trato, expresiones regulares, valores y comentarios con ejemplos', () => {
    const PERMITIDO = /EL TRATO|uses vos|_pal\(|_VOSEO|_TUTEO|_DECLARA|voseo|«vos»|\\b|\(\?:|\.test\(|new RegExp|'vos'|"vos"|vos:|\|vos\||\(vos|vos\)|nunca vos|no vos\b|ni vos|\/\/ [^\n]*(?:pedí|pedilo|mandá|escribí)|ACENTO\[v\]|\['sos'|pedís|tenés|sabés|querés|podés/i
    const FORMAS = /(?<![\p{L}])(vos|sabés|tenés|podés|querés|decís|hacés|decilo|pedilo|pedila|usalo|usala|mirá|probá|fijate|acordate|andá|sos|emití|devolvé|mantené|respondé|elegí|construí|describí|llamá|usá|pasá|agregá|declará|mejorá|analizá)(?![\p{L}])/giu
    for (const { despues } of FLUJOS) {
      const f = leer(despues)
      for (const n of f.nodes) for (const linea of JSON.stringify(n.parameters).split('\\n')) {
        const m = linea.match(FORMAS)
        if (m && !PERMITIDO.test(linea)) throw new Error(`voseo sin explicar en ${despues} · ${n.name} · «${m[0]}» · ${linea.slice(Math.max(0, linea.search(FORMAS) - 50), linea.search(FORMAS) + 80)}`)
      }
    }
  })
  it('el DETECTOR DE TRATO sale intacto de la planeación, el brief y la copia por filas (mismos nodos, mismas líneas del módulo)', () => {
    for (const [carpeta, nombre] of [['X9F0zp6LQ2xGEYVS', 'planeacion'], ['PQdIgbuFexuBsoh8', 'brief'], ['cadena', 'parte-por-filas']] as const) {
      const a = leer(`${carpeta}/${nombre}-ANTES-sin-voseo-2026-10-11.json`), d = leer(`${carpeta}/${nombre}-ARREGLADO-sin-voseo-2026-10-11.json`)
      for (const n of a.nodes) {
        const x = String((n.parameters as { jsCode?: string }).jsCode ?? '')
        const y = String((d.nodes.find((k) => k.name === n.name)!.parameters as { jsCode?: string }).jsCode ?? '')
        for (const marca of ["var TRATOS = ['tu', 'vos', 'usted']", "argentina: 'vos'", "if (w === 'vos') add('vos', w)", "const _VOSEO = _pal('vos|", 'var out = { vos: [], tu: [], usted: [] }']) {
          expect(y.includes(marca)).toBe(x.includes(marca))
        }
        // todas las líneas del detector que contenían la forma «'vos'» siguen idénticas
        const lineasX = x.split('\n').filter((l) => /'vos'/.test(l)), lineasY = y.split('\n').filter((l) => /'vos'/.test(l))
        expect(lineasY).toEqual(lineasX)
      }
    }
  })
  it('los textos que antes tenían voseo de instrucción ya no lo tienen (muestras concretas de cada flujo)', () => {
    const t = (c: string, n: string) => textos(leer(par(c, n).despues))
    expect(t('ssLtwYPt7zxuvnM2', 'cimiento')).toContain('Construye TU sección del brand book')
    expect(t('ssLtwYPt7zxuvnM2', 'cimiento')).toContain('LLAMA EL TOOL')
    expect(t('ssLtwYPt7zxuvnM2', 'cimiento')).toContain('Eres un evaluador de FIDELIDAD')
    expect(t('ssLtwYPt7zxuvnM2', 'lazoA')).toContain('Eres revisor de un borrador de BRAND BOOK')
    expect(t('ssLtwYPt7zxuvnM2', 'lazoA')).toContain('mantén la estructura')
    expect(t('LyVoKcrypS5uLyuu', 'alta')).toContain('Puedes AGREGAR competidores')
    expect(t('LyVoKcrypS5uLyuu', 'alta')).toContain('Rehaz el descubrimiento')
    expect(t('hi5nwPCGUWHkGnT7', 'camino3-voto')).toContain('Eres un revisor Camino III')
    expect(t('X9F0zp6LQ2xGEYVS', 'planeacion')).toContain('Si quieres uno NUEVO igual → pídelo')
  })
})

// ───────────────────────── ④ papeles en Markdown
describe('④ papeles en Markdown · las citas de Emilio no se tocan', () => {
  it('la redacción pasa a tuteo y lo que va entre «…», “…”, "…" o `…` queda literal', () => {
    const md = [
      '| Darle trabajo operativo | *«yo no hago trabajo operativo, hacelo vos»* |',
      '- **Los CCs NO leen Slack.** Vos escribís el prompt, **él lo pega.**',
      '- Abrí Daily Note y mirá los hubs.',
      '- Si querés agregar una idea, tirala en `raw/ideas/`',
      '🔴 **No completes lo que falta. Preguntá.** *(«Decime cuáles son»)*',
    ].join('\n')
    const r = barrerMarkdown(md).texto.split('\n')
    expect(r[0]).toBe('| Darle trabajo operativo | *«yo no hago trabajo operativo, hacelo vos»* |')
    expect(r[1]).toBe('- **Los CCs NO leen Slack.** Tú escribes el prompt, **él lo pega.**')
    expect(r[2]).toBe('- Abre Daily Note y mira los hubs.')
    expect(r[3]).toBe('- Si quieres agregar una idea, tírala en `raw/ideas/`')
    expect(r[4]).toBe('🔴 **No completes lo que falta. Pregunta.** *(«Decime cuáles son»)*')
  })
  it('el aviso del idioma (que enumera las formas prohibidas) se deja entero', () => {
    const l = '> **IDIOMA (firma de Emilio, 11-oct): español de Ecuador, con TUTEO. Nunca voseo («vos», «sabés», «decilo», «tenés»).**'
    expect(barrerMarkdown(l).texto).toBe(l)
    const sinComillas = 'IDIOMA: español de Ecuador con tuteo. Nunca voseo (vos, sabés, decilo, tenés).'
    expect(barrerMarkdown(sinComillas).texto).toBe(sinComillas)
  })
  it('en un registro histórico («sinPreteritos») las formas en -í/-é son pasado y no se tocan, pero el presente en -ás sí', () => {
    const l = '- Descubrí botón "Add Group" · cerré 3 loops · abrí cero frentes · ¿convalidás el alta?'
    expect(barrerMarkdown(l, { sinPreteritos: true }).texto).toBe('- Descubrí botón "Add Group" · cerré 3 loops · abrí cero frentes · ¿convalidas el alta?')
  })
  it('en un papel normal una forma ambigua solo es imperativo si es la primera palabra de la línea', () => {
    expect(barrerMarkdown('2. Escribí tres encargos firmados y nunca se los di.').texto).toBe('2. Escribe tres encargos firmados y nunca se los di.')
    expect(barrerMarkdown('Lo que hice: escribí tres encargos y los envié.').texto).toBe('Lo que hice: escribí tres encargos y los envié.')
  })
  it('los papeles ya barridos del vault no tienen voseo de redacción (si el vault está presente en esta máquina)', () => {
    const V = 'C:/Users/emili/OneDrive/Documents/zr-vault/00-meta'
    for (const f of ['COMO-TRABAJAR-CON-EMILIO.md', 'ARRANQUE-orquestador-copiar-y-pegar.md', 'README.md', 'TEAM_QUICK_START.md']) {
      const p = `${V}/${f}`
      if (!existsSync(p)) continue
      expect(barrerMarkdown(readFileSync(p, 'utf8').split('\r\n').join('\n')).cambios.map((c) => c.antes)).toEqual([])
    }
  })
})
