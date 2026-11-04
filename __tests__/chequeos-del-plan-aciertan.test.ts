/**
 * 04-nov · los chequeos del plan aciertan solos («dale» de Emilio 14:23Z). Se corren el módulo VIVO respaldado + el parche sobre el plan real del 4-nov y sobre otros planes.
 * El plan real debe dar 0 falsas alarmas y encontrar lo que vio CC3. Ninguno de estos cambios frena un plan: marcan o avisan.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { construirChequeosQueAciertan, NODOS_DEL_MODULO, parcharModulo } from '../scripts/ops/oficina-marketing/chequeos-que-aciertan.mjs'
import { moduloDeLosChequeos } from '../scripts/worker-staging/jefatura-j7/plan-versiones.mjs'

const DIR = '__tests__/fixtures/chequeos-del-plan'
const leer = (n: string) => fs.readFileSync(`${DIR}/${n}`, 'utf8').replace(/\r\n/g, '\n')
const CRUDO = moduloDeLosChequeos(JSON.parse(leer('modulo-vivo.json')).vuelta)
const armar = (js: string) => new Function(`${js}\nreturn { revisarPlan, pendientesDelPlan, _celdasSinCifra }`)() as { revisarPlan: (t: string, c: unknown) => Resultado; pendientesDelPlan: (r: Resultado) => string | null; _celdasSinCifra: (s: string) => string[] }
const V = armar(CRUDO)
const N = armar(parcharModulo(CRUDO))
interface Marca { codigo: string; que: string; ejemplos: string[] }
interface Resultado { ok: boolean; marcas: Marca[]; avisos_p10?: Marca[] }
const CTX = JSON.parse(leer('contexto.json'))
const PLAN_B = leer('plan-4-nov-b.md')
const PLAN_A = leer('plan-4-nov-a.md')
const PLAN_3 = leer('plan-3-nov.md')
const cod = (r: Resultado) => r.marcas.map((m) => m.codigo)
const avisos = (r: Resultado) => (r.avisos_p10 ?? []).map((m) => m.codigo)
const de = (r: Resultado, c: string) => [...r.marcas, ...(r.avisos_p10 ?? [])].find((m) => m.codigo === c)

describe('el plan sin rótulos internos (Emilio, 15:37Z)', () => {
  const fin = { estado: 'sin_firma', motivo: 'sin_firma', numeros: [{ clave: 'pauta_semanal', valor: 200, tipo: 'supuesto' }], semanas: 12, resumen: { lineas: ['Meta: 130'], alertas: ['ojo'] } }
  const conFin = { ...CTX, finanzas: fin }
  const limpio = '# Plan\n\nLa pauta es de $200 por semana.\n'
  it('🔴 P9 ya no pide decir «sin firma» ni rotular cifras', () => {
    expect(V.revisarPlan(limpio, conFin).marcas.map((m) => m.codigo)).toContain('P9')
    expect(N.revisarPlan(limpio, conFin).marcas.map((m) => m.codigo)).not.toContain('P9')
  })
  it('🔴 P15 marca lo que el plan real traía', () => {
    const e = de(N.revisarPlan(PLAN_B, CTX), 'P15')!
    expect(e.ejemplos.join(' ')).toMatch(/sin firma|oficina financiera/i)
  })
  it.each(['La oficina financiera estimó el costo.', 'Costo de $3 (estimación sin firma).', 'Es un supuesto de la oficina.', 'Dato pendiente de confirmación.', 'Quedó una pregunta sin responder.', 'Esto no tiene respuesta todavía.', 'La oficina propone $434.'])('🔴 marca «%s»', (frase) => {
    expect(cod(N.revisarPlan('# Plan\n\n' + frase + '\n', CTX))).toContain('P15')
  })
  it.each(['Responder en menos de una hora los mensajes sin responder en Instagram.', 'Abrimos cerca de la oficina de turismo.', 'Una estimación de 30 visitas al día.', 'La fuente es [D12].'])('🔴 no marca «%s»', (frase) => {
    expect(cod(N.revisarPlan('# Plan\n\n' + frase + '\n', CTX))).not.toContain('P15')
  })
  it('🔴 el pedido al redactor ya no le ordena declararlo', () => {
    const js = parcharModulo(CRUDO)
    if (!js.includes('function lineasDeFinanzas(')) return
    const lineas = new Function(js + '\nreturn lineasDeFinanzas')() as (f: unknown) => string[]
    for (const caso of [fin, { estado: 'firmado', numeros: fin.numeros, resumen: fin.resumen }, { motivo: 'vencido' }]) {
      const t = lineas(caso).join('\n')
      expect(t).not.toMatch(/SIN FIRMA|DICE de forma visible|el plan los dice|NO están firmados/)
      expect(t).toContain('NUNCA menciones a la oficina financiera')
    }
  })
})

describe('el plan real del 4-nov', () => {
  const v = V.revisarPlan(PLAN_B, CTX), r = N.revisarPlan(PLAN_B, CTX)
  it('antes daba las falsas alarmas que vio CC3 · la prueba mide un cambio de verdad', () => {
    expect(cod(v)).toEqual(expect.arrayContaining(['P4', 'P5', 'P7']))
  })
  it('🔴 0 falsas alarmas: ni P4, ni P5, ni P7, ni P10 de citas mal leídas', () => {
    for (const c of ['P4', 'P5', 'P7', 'P10a', 'P10l']) expect(cod(r), c).not.toContain(c)
  })
  it('🔴 lo único que marca es real: las cifras no firmadas y los adicionales', () => {
    expect(cod(r)).toEqual(['P8', 'P15', 'P11'])
    expect(de(r, 'P8')!.ejemplos).toEqual(expect.arrayContaining(['$10,63', '$1.382']))
  })
  it('🔴 lo que declaró el dueño no es una cifra suelta: $200 y su mes, $800', () => {
    expect(de(r, 'P8')!.ejemplos).not.toContain('$200')
    expect(de(r, 'P8')!.ejemplos).not.toContain('$800')
  })
  it('🔴 encuentra lo de CC3: adicionales 130 contra 22', () => {
    expect(de(r, 'P11')!.ejemplos.join(' ')).toContain('~130')
    expect(de(r, 'P11')!.ejemplos.join(' ')).not.toContain('~22')
  })
  it('🔴 encuentra lo de CC3: dos tickets distintos, como aviso', () => {
    expect(de(r, 'P12')!.ejemplos.join(' ')).toMatch(/ticket promedio: 10\.23 · 10\.63/)
  })
  it('🔴 encuentra lo de CC3: nombra lo que el manual dice que nunca promete, como aviso', () => {
    expect(de(r, 'P14')!.ejemplos.join(' ')).toContain('PedidosYa')
  })
  it('$0,23 por resultado NO se marca: es la cifra de arranque de finanzas', () => {
    expect(CTX.finanzas.numeros.find((n: { clave: string }) => n.clave === 'costo_por_resultado_arranque').valor).toBe(0.23)
    expect(de(r, 'P8')!.ejemplos).not.toContain('$0,23')
  })
  it('🔴 la bandeja dice los avisos que el dueño debe leer', () => {
    expect(N.pendientesDelPlan(r)).toMatch(/Aviso P14/)
  })
  it('lo que afirma sin cita sigue visible como aviso', () => {
    expect(avisos(r)).toEqual(expect.arrayContaining(['P10b', 'P10d', 'P10f']))
  })
  it('la versión A da lo mismo', () => { expect(cod(N.revisarPlan(PLAN_A, CTX))).toEqual(['P8', 'P15', 'P11']) })
})

describe('otro plan guardado', () => {
  it('🔴 el del 3-nov tampoco trae P5 ni P7 falsos', () => {
    const r = N.revisarPlan(PLAN_3, CTX)
    for (const c of ['P5', 'P7']) expect(cod(r), c).not.toContain(c)
  })
})

describe('cada regla, con otro cliente y otro rubro', () => {
  const ctx = { identidad: { colores: ['#112233'], tipografias: ['Roboto', 'Open Sans'] }, moneda: { codigo: 'EUR' }, personas: [], nombre_cliente: 'Clínica Sol' }
  const base = (x: string) => `# Plan\n${x}\n`
  it('🔴 P4: una celda vacía o «a calcular» se sigue marcando; una tabla de texto, no', () => {
    expect(N._celdasSinCifra('| Rubro | Mes |\n|---|---|\n| Pauta | |\n| Otro | 20 |')).toHaveLength(1)
    expect(N._celdasSinCifra('| Rubro | Mes |\n|---|---|\n| Pauta | Ads |\n| Otro | 20 |\n| Más | 30 |')).toHaveLength(1)
    expect(N._celdasSinCifra('| Si pasa | Hago |\n|---|---|\n| Costo 3 | Paro |\n| Sube | Ajusto |')).toEqual([])
    expect(N._celdasSinCifra('| A | B |\n|---|---|\n| x | 10 |\n| y | 20 |\n| Para no perder | Una explicación larga de por qué no aplica esta cifra |')).toEqual([])
  })
  it('🔴 P5: la tipografía declarada pasa con su frase; una ajena, no', () => {
    expect(cod(N.revisarPlan(base('Tipografías: Roboto para títulos, Open Sans en cuerpo.'), ctx))).not.toContain('P5')
    expect(cod(N.revisarPlan(base('Tipografías: Comic Sans para títulos.'), ctx))).toContain('P5')
    expect(cod(N.revisarPlan(base('Color #abcdef.'), ctx))).toContain('P5')
  })
  it('🔴 P7: una fuga real se marca; «los datos, pero el dueño» no', () => {
    expect(cod(N.revisarPlan(base('Faltan los datos, pero el dueño debe confirmarlos.'), ctx))).not.toContain('P7')
    for (const f of ['Dato del dueño: abre a las 8.', 'Fuente: el dueño.', 'El dueño dijo que abre.']) expect(cod(N.revisarPlan(base(f), ctx)), f).toContain('P7')
  })
  it('🔴 P11 con la meta del plan, sin finanzas; el mismo número en otra frase no cuenta', () => {
    expect(cod(N.revisarPlan(base('Meta: 40 pacientes por semana.\n\n| Pacientes adicionales | ~40 |'), ctx))).toContain('P11')
    expect(cod(N.revisarPlan(base('Meta: 40 pacientes por semana y hacen falta 5 pacientes adicionales.'), ctx))).not.toContain('P11')
  })
  it('🔴 avisos del manual: palabra prohibida, y lo que nunca promete salvo si lo niega', () => {
    const c = { ...ctx, manual_limites: { prohibidas: ['premium'], nunca_promete: ['Glovo'] } }
    const r = N.revisarPlan(base('Un servicio premium con entrega por Glovo.'), c)
    expect(avisos(r)).toEqual(expect.arrayContaining(['P13', 'P14']))
    expect(avisos(N.revisarPlan(base('Trato cercano, sin premium.\nNo usamos Glovo.'), c))).not.toEqual(expect.arrayContaining(['P13']))
    expect(avisos(N.revisarPlan(base('No usamos Glovo.'), c))).not.toContain('P14')
    const solo = N.revisarPlan(base('Un servicio premium.'), c)
    for (const x of ['P13', 'P14']) expect(cod(solo), x).not.toContain(x)
  })
  it('🔴 lo que la competencia ofrece no es una promesa del plan', () => {
    const c = { ...ctx, manual_limites: { prohibidas: [], nunca_promete: ['Glovo'] } }
    expect(avisos(N.revisarPlan(base('Un competidor directo vende por Glovo.'), c))).not.toContain('P14')
  })
  it('🔴 sin datos del manual ni de finanzas, no marca nada nuevo', () => {
    const r = N.revisarPlan(base('Un plan corto, sin nada que revisar.'), {})
    expect(avisos(r)).toEqual([])
    expect(cod(r)).not.toContain('P11')
  })
})

describe('P10 · citas y fechas', () => {
  const D = (id: string, numero: number | null, extra: Record<string, unknown> = {}) => ({ id, origen: 'medido', estado: 'trajo', tipo_id: 'x', valor: numero === null ? { texto_corto: 'for $3 50 today', unidad: 'texto' } : { numero, unidad: 'dinero' }, ...extra })
  const ctx = (datos: unknown[]) => ({ identidad: { colores: [], tipografias: [] }, moneda: {}, plan_v3: { datos, op: { lexico: { verificacion: ['medid', 'confirmad'], ausencia: ['no tiene', 'no hay'], supuesto: ['supuesto'], dominio: [] }, tolerancias: {}, cifras_de_slots: [] } } })
  const todos = (r: Resultado) => [...r.marcas, ...(r.avisos_p10 ?? [])]
  it('🔴 «[D9, D55]» son dos citas: no marca la cifra del primero', () => {
    const r = N.revisarPlan('Ventas: $4.530,00 en 443 tickets [D9, D55].', ctx([D('D9', 4530), D('D55', 443)]))
    expect(cod(r)).not.toContain('P10l')
  })
  it('🔴 una cifra que no es la del dato citado sí se marca', () => {
    expect(cod(N.revisarPlan('Ventas: $999,00 [D9].', ctx([D('D9', 4530)])))).toContain('P10l')
  })
  it('🔴 una cita de texto puede traer la cifra', () => {
    expect(cod(N.revisarPlan('Reseñas lo citan a $3,50 [D73] y [D9] da 10,00.', ctx([D('D73', null), D('D9', 10)])))).not.toContain('P10l')
  })
  it('🔴 lo que el dueño declaró se puede citar; un hueco, no', () => {
    expect(cod(N.revisarPlan('No hay píxel [D70].', ctx([{ ...D('D70', null), origen: 'supuesto', tipo_id: 'dato_del_dueno' }])))).not.toContain('P10a')
    expect(cod(N.revisarPlan('Precio 5,00 [D1].', ctx([{ ...D('D1', 5), origen: 'hueco' }])))).toContain('P10a')
  })
  it('🔴 «2026 – 1 de febrero» no deja un «20» suelto, y «a medida que» no es «medido»', () => {
    const r = N.revisarPlan('Del 4 de noviembre de 2026 – 1 de febrero de 2027.\nA medida que crece, mejora.', ctx([D('D9', 1)]))
    expect(JSON.stringify(todos(r))).not.toContain('«20»')
    expect(JSON.stringify(todos(r))).not.toContain('«medid»')
  })
  it('🔴 con el mes abreviado tampoco queda un «20» suelto', () => {
    const r = N.revisarPlan('Del 4 nov 2026 – 1 feb 2027.', ctx([D('D9', 1)]))
    expect(JSON.stringify(todos(r))).not.toContain('«20»')
  })
  it('🔴 los sin cita ya no ponen el plan en pendientes, pero se avisan', () => {
    const r = N.revisarPlan('Tenemos 999 ventas medidas.', ctx([D('D9', 1)]))
    for (const x of ['P10b', 'P10f']) expect(cod(r), x).not.toContain(x)
    expect(avisos(r)).toEqual(expect.arrayContaining(['P10b', 'P10f']))
  })
})

describe('el cambio se aplica igual en los 3 nodos', () => {
  const f = JSON.parse(leer('modulo-vivo.json'))
  const flujo = { name: 'plan', nodes: [
    { name: 'Redactor (B4)', parameters: { jsCode: f.redactor } },
    { name: '¿Llegó la vuelta?', parameters: { jsCode: f.vuelta } },
    { name: 'JEF · plan · evaluar', parameters: { jsCode: f.evaluar } },
  ] }
  construirChequeosQueAciertan(flujo as never)
  const cod3 = (n: string) => flujo.nodes.find((x) => x.name === n)!.parameters.jsCode
  it('🔴 los 3 traen las reglas nuevas', () => { for (const n of NODOS_DEL_MODULO) expect(cod3(n)).toContain('_adicionalesComoMeta') })
  it('🔴 el redactor le pasa al chequeo los límites del manual', () => {
    expect(cod3('Redactor (B4)')).toContain('manual_limites: limitesDelManual(manual)')
    const m = cod3('Redactor (B4)')
    const i = m.indexOf('function limitesDelManual'), fin = m.indexOf('const manual = ent.manual')
    const limites = new Function(`${m.slice(i, fin)}\nreturn limitesDelManual`)() as (m: unknown) => { prohibidas: string[]; nunca_promete: string[] }
    const r = limites({ content_text: JSON.stringify({ brand_book_draft: { forbidden_words: ['premium'], nunca_hace: ['Nunca promete delivery por Uber Eats, PedidosYa u otra app.', 'Nunca anuncia la sede de Quito como abierta.'] } }) })
    expect(r.prohibidas).toEqual(['premium'])
    expect(r.nunca_promete).toEqual(['Uber Eats', 'PedidosYa'])
  })
  it('🔴 un manual ilegible no rompe nada', () => {
    const m = cod3('Redactor (B4)')
    const limites = new Function(`${m.slice(m.indexOf('function limitesDelManual'), m.indexOf('const manual = ent.manual'))}\nreturn limitesDelManual`)() as (m: unknown) => unknown
    expect(limites({ content_text: 'no es json' })).toEqual({ prohibidas: [], nunca_promete: [] })
  })
})
