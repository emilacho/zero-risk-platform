/**
 * 17-nov · Sprint 4 · A + F (GO Lenovo · firma de Emilio 17:01 Zúrich · 🟢 CC6 a los 4 diseños · CC3).
 *   A · la ficha de hechos por oferta (la orden de trabajo de cada pieza): cada dato con fuente y vigencia; lo que falta se declara.
 *   F · la pieza nace de la idea: la hoja lleva la idea del banco TAL CUAL; el calendario solo pone fecha, red, formato, oferta, objetivo y público.
 * Lo que mide CC6 (NOTA sprint4 fase 1): sin fuente no entra · vencido no llega como vigente · ausente declarado · cada pieza con SU ficha ·
 * la idea del banco llega texto a texto · el mensaje del calendario no llega · el llamado con su orden de respaldo · agnóstico (3 clientes, misma batería).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { comoSeCompraParaLaRed, datosSinFuente, fichaDeLaOferta, fichaEnLineas, fichasEnTexto, objetivoParaLaFecha, TITULO_DEL_BLOQUE, type FichaDeOferta } from '../ficha-de-oferta'
import { CAMPO_FICHA, escribirHoja, ideaTalCual, llamadoDeLaPieza, SIN_FICHAS, SIN_LLAMADO, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import { CONCEPTO_DE_CADA_PIEZA } from '../indicaciones'
import { ESQUEMA_CALENDARIO_TANDA_V5, ESQUEMAS } from '../esquemas'
import type { FormatosPorRed } from '../tipos'

// ── tres clientes de rubros distintos (dobles, US$ 0): la MISMA batería corre con los tres
interface Cliente { nombre: string; ofertas: [string, string]; fichas: FichaDeOferta[]; banco: string[] }
const ficha = (clave: string, o: Partial<FichaDeOferta>): FichaDeOferta => ({ clave, ...o })
const CLIENTES: Cliente[] = [
  {
    nombre: 'restaurante con dos puntos de venta',
    ofertas: ['puerto', 'ciudad'],
    banco: [
      '- C1-I01 · ig · carrusel · la olla del día en el puerto · mensaje: hoy hay caldo recién hecho · gancho: ¿ya desayunaste? · protagonista: la olla · serie: S1 · foto:p-01',
      '- C1-I02 · ig · carrusel · la bolsa que llega a tu puerta · mensaje: pídelo sin salir · gancho: suena el timbre · protagonista: la bolsa · serie: S1 · foto:ninguna',
    ],
    fichas: [
      ficha('puerto', { que_es: { valor: 'salón frente al mar', fuente: 'manual:sedes' }, como_se_compra: [{ valor: 'en el salón o por mensaje', fuente: 'ficha:abc' }], que_mostrar: [{ valor: 'el salón y la olla', fuente: 'manual:fotos' }] }),
      ficha('ciudad', { que_es: { valor: 'cocina solo con entrega a domicilio, sin atención al público', fuente: 'ficha:def' }, como_se_compra: [{ valor: 'pedido en la web, pago en efectivo al recibir', fuente: 'plan:canales' }], que_nunca_mostrar: [{ valor: 'un salón o una fachada', fuente: 'manual:fotos' }], oferta_y_precio: [{ valor: 'combo junior a $3,50', fuente: 'manual:productos', vigente_hasta: '2026-11-30' }] }),
    ],
  },
  {
    nombre: 'tienda en línea',
    ofertas: ['coleccion-invierno', 'envio-gratis'],
    banco: [
      '- C1-I01 · ig · carrusel · tres capas para el frío · mensaje: abrígate sin cargar peso · gancho: ¿cuántas capas llevas hoy? · protagonista: la chaqueta · serie: S1 · foto:t-01',
      '- C1-I02 · ig · carrusel · la caja en la puerta · mensaje: llega a tu casa sin costo · gancho: la caja ya está aquí · protagonista: la caja · serie: S1 · foto:ninguna',
    ],
    fichas: [
      ficha('coleccion-invierno', { que_es: { valor: 'colección de abrigos ligeros', fuente: 'manual:productos' }, como_se_compra: [{ valor: 'en la tienda web', fuente: 'plan:canales' }, { valor: 'etiqueta de compra en la publicación', fuente: 'plan:canales', red: 'ig' }] }),
      ficha('envio-gratis', { que_es: { valor: 'envío sin costo en compras mayores a $40', fuente: 'plan:promos', vigente_hasta: '2026-11-15' }, obligatorios_legales: [{ valor: 'aplican condiciones', fuente: 'manual:legal' }] }),
    ],
  },
  {
    nombre: 'estudio de abogados',
    ofertas: ['laboral', 'familia'],
    banco: [
      '- C1-I01 · ig · carrusel · lo que nadie te dice al firmar un finiquito · mensaje: revisa antes de firmar · gancho: ¿ya firmaste? · protagonista: el documento · serie: S1 · foto:a-01',
      '- C1-I02 · ig · carrusel · la primera consulta · mensaje: te escuchamos sin compromiso · gancho: una pregunta basta · protagonista: la consulta · serie: S1 · foto:ninguna',
    ],
    fichas: [
      ficha('laboral', { que_es: { valor: 'asesoría en despidos y finiquitos', fuente: 'manual:servicios' }, no_se_puede_afirmar: [{ valor: 'que se gana el caso', fuente: 'manual:legal' }], obligatorios_legales: [{ valor: 'la información no reemplaza una asesoría personal', fuente: 'manual:legal' }] }),
      ficha('familia', { que_es: { valor: 'asesoría en divorcios y pensiones', fuente: 'manual:servicios' }, como_se_compra: [{ valor: 'agenda una consulta en la web', fuente: 'plan:canales' }] }),
    ],
  },
]

const PLAN = '## Fase 1\nObjetivo: que nos conozcan.'
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que nos conozcan».',
  '## Insight', 'La gente decide rápido.',
  '## Mensaje', 'Estamos cerca.',
  '## Público', 'Personas de la zona (del plan).', '## Cómo sabremos que funcionó', 'Consultas por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 consultas nuevas por semana.', '- ig: que guarden la publicación · «escríbenos»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: cerca', '- prohibido: increíble', '- lo que no se dice: garantías',
  '## Faltantes', '- ninguno',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: ['increíble'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 2 }], prohibidas: ['increíble'], fotos: ['p-01', 't-01', 'a-01'] }
const concepto = (banco: string[]) => leerConcepto(['## Gran idea  Cerca · Lo que buscas está cerca', '## Cómo se ve  Luz natural.', '## Capítulo F1 · Abrir', 'Qué cuenta: abrimos · Objetivo de la fase (cita): «que nos conozcan» · Cómo se ve en este capítulo: planos cerrados', '## Banco de ideas', ...banco].join('\n'), INS_C)
const FORMATOS: FormatosPorRed = { ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'imagen_fija' }] }
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-20', hora: '09:00', red: 'ig', formato: 'carrusel', pilar: 'p', tema: 'tema', datos: [], fase: 'F1', idea_ref: 'C1-I01', ...o })
const INS = (c: Cliente, filas: FilaDeHoja[], extra: Partial<InsumosDeLaHoja> = {}): InsumosDeLaHoja => ({
  client_name: c.nombre, plan_id: 'plan-1', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief: BRIEF, brief_id: 'brf-1', concepto: concepto(c.banco), concepto_id: 'con-1', filas, formatos: FORMATOS, fichas: c.fichas, ...extra,
})
const seccion = (texto: string, id: string) => parsearBrief(texto, id)!.texto

describe('A · la ficha de hechos (forma pura)', () => {
  const f: FichaDeOferta = {
    clave: 'x',
    que_es: { valor: 'algo', fuente: 'manual:a' },
    oferta_y_precio: [{ valor: 'precio A', fuente: 'plan:p', vigente_hasta: '2026-11-10' }, { valor: 'precio B', fuente: 'plan:p', vigente_hasta: '2026-12-31' }, { valor: 'precio sin fuente', fuente: '' }],
    objetivo_por_fecha: [{ desde: '2026-11-01', hasta: '2026-11-30', objetivo: 'que prueben', fuente: 'plan:f1' }, { desde: '2026-11-15', hasta: '2026-11-21', objetivo: 'que pidan esta semana', fuente: 'plan:s3' }, { objetivo: 'sin fuente', fuente: '' }],
  }
  it('un dato SIN fuente no entra (no se escribe «sin fuente») y se cuenta para avisarlo', () => {
    const l = fichaEnLineas(f, '2026-11-20')
    expect(l.join('\n')).not.toContain('precio sin fuente')
    expect(l.join('\n')).not.toMatch(/sin fuente/)
    expect(datosSinFuente(f)).toBe(2)
  })
  it('un dato vencido para la fecha de la pieza llega marcado VENCIDO, nunca como vigente', () => {
    const l = fichaEnLineas(f, '2026-11-20')
    expect(l).toContain('oferta y precio: VENCIDO · precio A (fuente: plan:p · venció el 2026-11-10)')
    expect(l).toContain('oferta y precio: precio B (fuente: plan:p · vale hasta 2026-12-31)')
  })
  // 16:32Z · CC6: el simétrico de VENCIDO · una apertura del día siguiente a la pieza no llega como afirmable
  it('un dato que EMPIEZA después de la fecha de la pieza llega «AÚN NO VIGENTE», nunca como presente; el mismo día ya vale', () => {
    const apertura: FichaDeOferta = { clave: 'nueva', se_puede_afirmar: [{ valor: 'ya abrimos en el norte', fuente: 'cerebro:hecho-7', vigente_desde: '2026-11-21' }] }
    expect(fichaEnLineas(apertura, '2026-11-20')).toContain('se puede afirmar: AÚN NO VIGENTE · ya abrimos en el norte (fuente: cerebro:hecho-7 · empieza el 2026-11-21)')
    expect(fichaEnLineas(apertura, '2026-11-20').join('\n')).not.toMatch(/se puede afirmar: ya abrimos/)
    expect(fichaEnLineas(apertura, '2026-11-21')).toContain('se puede afirmar: ya abrimos en el norte (fuente: cerebro:hecho-7 · vale desde 2026-11-21)')
    // y en la hoja de la pieza del 20
    const c = CLIENTES[0]
    const h = escribirHoja(INS({ ...c, fichas: [apertura] }, [fila({ id: 'p-n', oferta: 'nueva' })]))
    expect(seccion(h.texto_md, 'p-n')).toContain('  - se puede afirmar: AÚN NO VIGENTE · ya abrimos en el norte')
    // cómo se compra: uno que aún no vale no sirve de llamado
    expect(comoSeCompraParaLaRed({ clave: 'v', como_se_compra: [{ valor: 'futuro', fuente: 'f', vigente_desde: '2026-12-01' }] }, 'ig', '2026-11-20')).toBeNull()
  })
  it('lo que falta se declara UNA vez en «sin dato: …» (nunca se rellena)', () => {
    const l = fichaEnLineas(f, '2026-11-20')
    expect(l[l.length - 1]).toBe('sin dato: para quién y dónde está disponible, se puede afirmar, NO se puede afirmar, cómo se compra o contrata, qué mostrar, qué NUNCA mostrar, obligatorios legales')
  })
  it('el objetivo de la fecha es el del tramo más angosto que la contiene; fuera de todo tramo se declara', () => {
    expect(objetivoParaLaFecha(f, '2026-11-20')!.objetivo).toBe('que pidan esta semana')
    expect(objetivoParaLaFecha(f, '2026-11-05')!.objetivo).toBe('que prueben')
    expect(objetivoParaLaFecha(f, '2026-12-05')).toBeNull()
    expect(fichaEnLineas(f, '2026-12-05').join('\n')).toMatch(/sin dato: .*objetivo para esta fecha/)
  })
  it('fichasEnTexto: el MISMO bloque para todos (D y E); sin fichas lo dice, nunca vacío en silencio', () => {
    expect(fichasEnTexto([])).toBe(`${TITULO_DEL_BLOQUE}\n(sin fichas de hechos todavía: trabaja con el manual y el brief, y no inventes datos de la oferta)`)
    const t = fichasEnTexto(CLIENTES[0].fichas)
    expect(t.startsWith(`${TITULO_DEL_BLOQUE}\n\n## puerto\n- qué es: salón frente al mar (fuente: manual:sedes)`)).toBe(true)
    expect(t).toContain('## ciudad\n- qué es: cocina solo con entrega a domicilio')
    // sin fecha de pieza (el pedido de una mesa) no hay «VENCIDO»: se listan los datos con su vigencia
    expect(t).toContain('combo junior a $3,50 (fuente: manual:productos · vale hasta 2026-11-30)')
  })
  it('cómo se compra: primero el de ESA red, después el general; un dato vencido no sirve', () => {
    const tienda = CLIENTES[1].fichas[0]
    expect(comoSeCompraParaLaRed(tienda, 'ig')!.valor).toBe('etiqueta de compra en la publicación')
    expect(comoSeCompraParaLaRed(tienda, 'facebook')!.valor).toBe('en la tienda web')
    expect(comoSeCompraParaLaRed({ clave: 'v', como_se_compra: [{ valor: 'viejo', fuente: 'f', vigente_hasta: '2026-01-01' }] }, 'ig', '2026-11-20')).toBeNull()
  })
})

for (const c of CLIENTES) {
  describe(`A + F · ${c.nombre} (misma batería)`, () => {
    const [ofA, ofB] = c.ofertas
    const h = escribirHoja(INS(c, [fila({ id: 'p-a', oferta: ofA }), fila({ id: 'p-b', oferta: ofB, idea_ref: 'C1-I02' })]))
    it('cada pieza dice su OFERTA y trae la ficha de SU oferta, no la de otra', () => {
      const a = seccion(h.texto_md, 'p-a'), b = seccion(h.texto_md, 'p-b')
      expect(a).toContain(`- OFERTA: ${ofA}`)
      expect(b).toContain(`- OFERTA: ${ofB}`)
      const qa = c.fichas[0].que_es!.valor, qb = c.fichas[1].que_es!.valor
      expect(a).toContain(`- ${CAMPO_FICHA}:\n  - qué es: ${qa}`)
      expect(a).not.toContain(qb)
      // la ficha de la tienda trae un «qué es» vencido para la fecha de la pieza: llega marcado, no como vigente
      expect(b.split('\n').some((l) => l === `  - qué es: ${qb} (fuente: ${c.fichas[1].que_es!.fuente})` || l.startsWith(`  - qué es: VENCIDO · ${qb}`))).toBe(true)
      expect(b).not.toContain(qa)
    })
    it('la IDEA DEL BANCO llega texto a texto, tal como la crearon los creativos', () => {
      const conc = concepto(c.banco)
      for (const [id, ref] of [['p-a', 'C1-I01'], ['p-b', 'C1-I02']] as const) {
        const idea = conc.banco.find((i) => i.id === ref)!
        const linea = seccion(h.texto_md, id).split('\n').find((l) => l.startsWith('- IDEA DEL BANCO: '))!
        expect(linea).toBe(`- IDEA DEL BANCO: ${ideaTalCual(idea)}`)
        for (const parte of [idea.idea, idea.mensaje, idea.gancho, idea.protagonista]) expect(linea).toContain(parte)
        expect(parsearBrief(h.texto_md, id)!.mensaje).toBe(idea.mensaje)
      }
    })
    it('el mensaje y la idea que escribió el calendario (fila vieja) NO llegan a la hoja', () => {
      const h2 = escribirHoja(INS(c, [fila({ id: 'p-a', oferta: ofA, concepto: { idea: 'IDEA-DEL-CALENDARIO', mensaje: 'MENSAJE-DEL-CALENDARIO', objetivo: 'que guarden', publico: 'vecinos' } })]))
      expect(h2.texto_md).not.toContain('IDEA-DEL-CALENDARIO')
      expect(h2.texto_md).not.toContain('MENSAJE-DEL-CALENDARIO')
      // lo suyo sí llega: el objetivo de la fecha y el público
      expect(parsearBrief(h2.texto_md, 'p-a')!.objetivo).toBe('que guarden')
      expect(h2.texto_md).toContain('- PÚBLICO: vecinos')
    })
    it('una oferta sin ficha se declara y se avisa; la pieza sigue (no es reja)', () => {
      const h3 = escribirHoja(INS(c, [fila({ id: 'p-z', oferta: 'otra-cosa' })]))
      expect(seccion(h3.texto_md, 'p-z')).toContain(`- ${CAMPO_FICHA}: sin ficha para «otra-cosa» · declarado`)
      expect(h3.avisos).toContain('p-z: la oferta «otra-cosa» no tiene ficha de hechos · la mesa trabaja sin ficha')
      expect(h3.provenance.valido).toBe(true)
    })
  })
}

describe('el llamado a la acción: orden de respaldo de 5 pasos (borde b con CC5)', () => {
  const fichas = CLIENTES[1].fichas
  const conFicha = { fichas }
  it('1 · la ficha, de esa red · 2 · la ficha, sin red', () => {
    expect(llamadoDeLaPieza(conFicha, { oferta: 'coleccion-invierno', fecha: '2026-11-20' }, 'ig', 'de la fila', 'del brief')).toBe('etiqueta de compra en la publicación (de la ficha de la oferta · fuente: plan:canales · ig) · la mesa escribe el llamado con este dato')
    expect(llamadoDeLaPieza(conFicha, { oferta: 'coleccion-invierno', fecha: '2026-11-20' }, 'facebook', 'de la fila', 'del brief')).toMatch(/^en la tienda web \(de la ficha de la oferta · fuente: plan:canales\)/)
  })
  it('3 · el llamado de una fila vieja · 4 · el del brief viejo · 5 · declarado (nunca vacío)', () => {
    expect(llamadoDeLaPieza(conFicha, { oferta: 'envio-gratis', fecha: '2026-11-20' }, 'ig', 'de la fila', 'del brief')).toBe('de la fila')
    expect(llamadoDeLaPieza({ fichas: [] }, { oferta: null, fecha: '2026-11-20' }, 'ig', '', 'del brief')).toBe('del brief')
    expect(llamadoDeLaPieza({ fichas: [] }, { oferta: null, fecha: '2026-11-20' }, 'ig', '', '')).toBe(SIN_LLAMADO)
  })
  it('en la hoja: sin ficha ni llamados el campo dice SIN_LLAMADO', () => {
    const sinLlamado = leerBriefCreativo(['## De qué parte del plan sale', 'Fase 1: «que nos conozcan».', '## Insight', 'x', '## Mensaje', 'y', '## Público', 'z (del plan).', '## Cómo sabremos que funcionó', 'Consultas por semana, cada lunes.', '## Objetivo', '30 consultas nuevas por semana.', '- ig: que guarden', '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: cerca', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna'].join('\n'), { planTexto: PLAN, prohibidas: [] })
    const h = escribirHoja(INS(CLIENTES[2], [fila({ id: 'p-a', oferta: 'laboral' })], { brief: sinLlamado }))
    expect(parsearBrief(h.texto_md, 'p-a')!.llamado).toBe(SIN_LLAMADO)
  })
})

describe('sin fichas: la hoja dice la oferta y DECLARA que no hay fichas (🟡 2 de CC6: nunca en silencio)', () => {
  it('sin fichas cargadas (el caso de hoy, hasta la entrega 2) la ficha se declara; sin avisos de ficha', () => {
    for (const fichas of [null, []]) {
      const h = escribirHoja(INS(CLIENTES[0], [fila({ id: 'p-a', oferta: 'puerto' })], { fichas }))
      expect(h.texto_md).toContain('- OFERTA: puerto')
      expect(seccion(h.texto_md, 'p-a')).toContain(`- ${CAMPO_FICHA}: ${SIN_FICHAS}`)
      expect(h.avisos.join(' ')).not.toMatch(/ficha/)
    }
  })
  // 🟡 1 de CC6: el aviso de los datos sin fuente se prueba (la entrega dice «no entra, y se avisa»)
  it('un dato sin fuente: no entra en la hoja y el aviso de la hoja lo nombra', () => {
    const f: FichaDeOferta = { clave: 'puerto', que_es: { valor: 'algo', fuente: 'manual:a' }, oferta_y_precio: [{ valor: 'PRECIO-SIN-FUENTE', fuente: '' }] }
    const h = escribirHoja(INS(CLIENTES[0], [fila({ id: 'p-a', oferta: 'puerto' })], { fichas: [f] }))
    expect(h.texto_md).not.toContain('PRECIO-SIN-FUENTE')
    expect(h.avisos).toContain('p-a: la ficha de «puerto» trae 1 dato sin fuente · no entra en la hoja')
  })
  it('una fila sin oferta lo declara', () => {
    expect(escribirHoja(INS(CLIENTES[0], [fila({ id: 'p-a' })], { fichas: null })).texto_md).toContain('- OFERTA: sin oferta en la fila · declarado')
  })
  it('fichaDeLaOferta no distingue mayúsculas y sin clave devuelve null', () => {
    expect(fichaDeLaOferta(CLIENTES[0].fichas, 'PUERTO')!.clave).toBe('puerto')
    expect(fichaDeLaOferta(CLIENTES[0].fichas, '')).toBeNull()
  })
})

describe('F · el calendario v5 solo pone lo suyo', () => {
  it('el concepto de la pieza en v5 tiene solo objetivo y público; v5 está en el registro', () => {
    const pieza = (ESQUEMA_CALENDARIO_TANDA_V5.properties.piezas as { items: { properties: Record<string, { required?: string[] }> } }).items
    expect(pieza.properties.concepto.required).toEqual(['objetivo', 'publico'])
    expect(ESQUEMAS['calendario_tanda.v5']).toBe(ESQUEMA_CALENDARIO_TANDA_V5)
  })
  // 🟡 4 de CC6: la instrucción pide SOLO lo que el esquema v5 acepta
  it('la instrucción al calendario solo nombra campos que existen en v5, y en `concepto` solo pide objetivo y público', () => {
    const pieza = (ESQUEMA_CALENDARIO_TANDA_V5.properties.piezas as { items: { properties: Record<string, { properties?: Record<string, unknown> }> } }).items
    const campos = new Set([...Object.keys(pieza.properties), ...Object.keys(pieza.properties.concepto.properties ?? {}), 'pendientes'])
    const nombrados = [...CONCEPTO_DE_CADA_PIEZA.matchAll(/`([a-z_]+)`/g)].map((m) => m[1])
    expect(nombrados.length).toBeGreaterThan(0)
    for (const n of nombrados) expect(campos.has(n), `«${n}» no es un campo de calendario_tanda.v5`).toBe(true)
    const pedidos = CONCEPTO_DE_CADA_PIEZA.split('\n').filter((l) => l.startsWith('- ')).map((l) => /^- `?([a-z_]+)`?/.exec(l)?.[1])
    expect(pedidos).toEqual(['objetivo', 'publico'])
    for (const k of ['mensaje', 'idea', 'llamado', 'fotos_disponibles']) expect(CONCEPTO_DE_CADA_PIEZA).not.toMatch(new RegExp(`\`${k}\`|^- ${k}\\b`, 'm'))
  })
})

// 🟡 3 de CC6: el bloque de las mesas (D, E, C) marca lo futuro y lo vencido con su fecha de referencia
describe('fichasEnTexto con fecha de referencia', () => {
  const apertura: FichaDeOferta = {
    clave: 'nueva',
    se_puede_afirmar: [{ valor: 'ya abrimos en el norte', fuente: 'cerebro:hecho-7', vigente_desde: '2026-11-21' }],
    oferta_y_precio: [{ valor: 'promo de lanzamiento', fuente: 'plan:p', vigente_hasta: '2026-11-10' }],
    objetivo_por_fecha: [{ desde: '2026-11-01', hasta: '2026-11-30', objetivo: 'que prueben', fuente: 'plan:f1' }, { desde: '2026-12-01', objetivo: 'que vuelvan', fuente: 'plan:f2' }],
  }
  it('apertura el 21, referencia el 20: llega AÚN NO VIGENTE; lo vencido, VENCIDO; los tramos de objetivo van todos', () => {
    const t = fichasEnTexto([apertura], '2026-11-20')
    expect(t).toContain('(vigencias leídas al 2026-11-20)')
    expect(t).toContain('- se puede afirmar: AÚN NO VIGENTE · ya abrimos en el norte (fuente: cerebro:hecho-7 · empieza el 2026-11-21)')
    expect(t).toContain('- oferta y precio: VENCIDO · promo de lanzamiento (fuente: plan:p · venció el 2026-11-10)')
    expect(t).toContain('- objetivo: que prueben')
    expect(t).toContain('- objetivo: que vuelvan')
  })
  it('sin fecha de referencia, «desde» es neutro (nunca «vale desde»)', () => {
    const t = fichasEnTexto([apertura])
    expect(t).toContain('ya abrimos en el norte (fuente: cerebro:hecho-7 · desde 2026-11-21)')
    expect(t).not.toContain('vale desde')
    expect(t).not.toContain('(vigencias leídas al')
  })
})

describe('agnóstico', () => {
  it('el código nuevo de la ficha no nombra ningún rubro, lugar ni cliente', () => {
    const src = readFileSync(join(__dirname, '..', 'ficha-de-oferta.ts'), 'utf-8').replace(/`sede`/g, '') // el nombre de la columna de la base no cambia en esta fase
    expect(src).not.toMatch(/\b(sedes?|local(es)?|plato|restaurante|men[uú]|cocina|Náufrago|Olón|Guayaquil)\b/i)
  })
  it('la instrucción al calendario solo dice «sede» como nombre del campo de la base', () => {
    expect(CONCEPTO_DE_CADA_PIEZA.replace(/`sede`/g, '')).not.toMatch(/\bsedes?\b|\blocal\b|\bplato\b/i)
  })
})
