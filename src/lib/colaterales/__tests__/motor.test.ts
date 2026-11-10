/**
 * Motor de colaterales · tramo 2a (CC1 · certifica CC7). Reglas: CRITERIOS v2 + adendas 1-4 (🟢 conjunto CC6+CC7) + PLAN tramo 2 + su adenda 1.
 * Fixture: extractos LITERALES de registros reales de Náufrago del 10-nov (gran idea v3, brief v2, brief v4, estrategia v1), los mismos del ensayo 3.
 */
import { describe, it, expect } from 'vitest'
import fx from './__fixtures__/naufrago-2026-11-10-extractos.json'
import { red, pedazosDe, claves, type Edicion, type Pedazo } from '../red'
import { gravedad, palabrasQueCambian, FORMA_VIGENTE } from '../gravedad'
import { yaCoincide, separarYaCoincide, verificarSalida, aplicarEnPedazo, aplicarEnDocumento, puedeLanzarMotor, puedeAplicarEn, notaSinColaterales, type SalidaDelAgente } from '../motor'

const E2: Edicion = { documento: 'brief', seccion: 'Insight', antes: 'sabe que el bueno viene de la costa', despues: 'sabe que el bueno viene de la playa' }
const R1: Edicion = { documento: 'plan', seccion: '3 · La audiencia', antes: '¿será tan bueno como en la costa?', despues: '¿será tan bueno como en la playa?' }
const E3: Edicion = { documento: 'plan', seccion: 'Oferta Guayaquil', antes: 'Pago en efectivo al motorizado', despues: 'Pago en efectivo o por transferencia al motorizado' }

describe('red de palabras · solo aguas abajo, con sección y ocurrencia', () => {
  it('E2 (brief → gran idea): las dos DEBE del extracto salen como candidatas, con su sección', () => {
    const { candidatos } = red(E2, { gran_idea: fx.gran_idea_v3, plan: 'sabe que el bueno viene de la costa', manual: 'sabe que el bueno viene de la costa' })
    const cita = candidatos.find((p) => p.texto.includes('sabe que el bueno viene de la costa'))
    expect(cita?.seccion).toBe('Por qué funciona')
    expect(candidatos.some((p) => p.texto.includes('el encebollado que conoces de la costa') && p.seccion.startsWith('Capítulo desbloquear'))).toBe(true)
  })
  it('nunca aguas arriba: una edición del brief no trae pedazos del plan ni del manual', () => {
    const { candidatos } = red(E2, { gran_idea: fx.gran_idea_v3, plan: 'sabe que el bueno viene de la costa', manual: 'sabe que el bueno viene de la costa' })
    expect(candidatos.every((p) => p.documento === 'gran_idea')).toBe(true)
  })
  it('R1 (plan): el brief v4 entra con su sección «Público»', () => {
    const { candidatos } = red(R1, { brief: fx.brief_v4 })
    expect(candidatos.find((p) => p.texto.includes('¿será tan bueno como en la playa?'))?.seccion).toBe('Público')
  })
  it('un texto repetido en el mismo documento lleva ocurrencia 0 y 1', () => {
    const linea = 'mensaje: el encebollado que conoces de la costa ya no pide que viajes'
    const ps = pedazosDe('gran_idea', `## A\n${linea}\n## B\n${linea}`)
    expect(ps.map((p) => [p.seccion, p.ocurrencia])).toEqual([['A', 0], ['B', 1]])
  })
  it('un documento JSON da pedazos por ruta de llave (la estrategia real)', () => {
    const ps = pedazosDe('estrategia', fx.estrategia_v1)
    const p = ps.find((x) => x.texto.includes('pago en efectivo al recibir'))
    expect(p?.ruta).toMatch(/^piezas_fijas\[\d+\]\.tema$/)
    expect(p?.seccion).toBe(p?.ruta)
  })
  it('un documento sin texto (abierto, vacío) no aporta candidatos', () => {
    expect(red(R1, { gran_idea: '', brief: '' }).candidatos).toEqual([])
  })
  it('las claves salen de la frase ENTERA del «antes», con números', () => {
    expect(claves('encebollado desde $3,50')).toEqual(['encebollado', '3,50'])
  })
})

describe('gravedad · la decide el código', () => {
  it('forma «campo»: público, oferta e idea son 🔴 enteros; un dato no', () => {
    expect(gravedad('publico', R1.antes, R1.despues, 'campo')).toBe('rojo')
    expect(gravedad('dato', 'encebollado desde $3,50', 'encebollado desde $3,75', 'campo')).toBe('normal')
  })
  it('forma «dato clave»: el caso real (costa → playa en una objeción de «La audiencia») es 🟡', () => {
    expect(gravedad('publico', R1.antes, R1.despues, 'dato_clave')).toBe('normal')
  })
  it('sabotaje CC7: un cambio de ZONA dentro de «La audiencia» da 🔴', () => {
    expect(gravedad('publico', 'Residentes de la zona norte de Guayaquil', 'Residentes de la zona sur de Guayaquil', 'dato_clave')).toBe('rojo')
  })
  it('público: un barrio del cliente, un segmento o la edad dan 🔴', () => {
    expect(gravedad('publico', 'vive en Alborada', 'vive en Samanes', 'dato_clave', { lugares: ['Alborada', 'Samanes'] })).toBe('rojo')
    expect(gravedad('publico', 'pensado para oficinistas', 'pensado para estudiantes', 'dato_clave')).toBe('rojo')
    expect(gravedad('publico', 'de 25 a 40 años', 'de 30 a 45 años', 'dato_clave')).toBe('rojo')
  })
  it('oferta: cambiar el precio principal o el producto es 🔴; agregar una forma de pago no', () => {
    expect(gravedad('oferta', 'encebollado junior $3,50', 'encebollado junior $3,75', 'dato_clave')).toBe('rojo')
    expect(gravedad('oferta', 'el plato estrella es el encebollado', 'el plato estrella es el ceviche', 'dato_clave', { productos: ['encebollado', 'ceviche'] })).toBe('rojo')
    expect(gravedad('oferta', E3.antes, E3.despues, 'dato_clave')).toBe('normal')
  })
  it('idea: cualquier cambio de la idea central es 🔴', () => {
    expect(gravedad('idea', 'El oro que nunca buscaste', 'El oro que siempre buscaste', 'dato_clave')).toBe('rojo')
  })
  it('rige «por dato clave» (Lenovo 13:12Z)', () => {
    expect(FORMA_VIGENTE).toBe('dato_clave')
  })
  it('un dato repetido nunca escala, en ninguna forma', () => {
    for (const f of ['campo', 'dato_clave'] as const) expect(gravedad('dato', 'jueves a lunes', 'miércoles a lunes', f)).toBe('normal')
  })
  it('las palabras que cambian son las que entran y salen', () => {
    expect(palabrasQueCambian('la zona norte', 'la zona sur').sort()).toEqual(['norte', 'sur'])
  })
})

describe('R1 · «ya coincide» lo resuelve el código y nunca llama al agente', () => {
  const { candidatos } = red(R1, { brief: fx.brief_v4 })
  it('el pedazo del brief v4 con «playa» ya coincide', () => {
    const p = candidatos.find((x) => x.texto.includes('¿será tan bueno como en la playa?'))!
    expect(yaCoincide(p, R1)).toBe(true)
  })
  it('si TODOS los candidatos ya coinciden, no queda nada para el agente (0 llamadas)', () => {
    const solo = candidatos.filter((p) => yaCoincide(p, R1))
    expect(separarYaCoincide(solo, R1).al_agente).toEqual([])
  })
  it('sabotaje: un pedazo que todavía dice el «antes» NO ya coincide (aunque también diga el después)', () => {
    expect(yaCoincide({ texto: `${R1.antes} y ${R1.despues}` }, R1)).toBe(false)
  })
})

describe('verificar la salida del agente', () => {
  const textos = { gran_idea: fx.gran_idea_v3 }
  const { candidatos } = red(E2, textos)
  const cita = candidatos.find((p) => p.texto.includes('sabe que el bueno viene de la costa'))!
  const todosRevisados = (afecta: string[] = []): SalidaDelAgente['revisados'] => candidatos.map((p) => ({ id: p.id, afecta: afecta.includes(p.id), razon: afecta.includes(p.id) ? '' : 'no habla del insight' }))
  const ok: SalidaDelAgente = { revisados: todosRevisados([cita.id]), colaterales: [{ id: cita.id, documento: 'gran_idea', antes: 'viene de la costa', despues: 'viene de la playa', porque: 'cita del insight' }], no_aparece: [] }

  it('una salida buena se acepta completa', () => {
    const v = verificarSalida(E2, candidatos, textos, ok, { registro: 'tu' })
    expect(v.completa).toBe(true)
    expect(v.aceptados).toHaveLength(1)
    expect(v.descartados).toHaveLength(candidatos.length - 1)
  })
  it('sabotaje: falta un id → no se acepta entera', () => {
    const v = verificarSalida(E2, candidatos, textos, { ...ok, revisados: ok.revisados.slice(1) })
    expect(v.completa).toBe(false)
    expect(v.faltan).toHaveLength(1)
  })
  it('sabotaje (nota 3 CC7): un pedazo descartado sin razón → no se acepta entera', () => {
    const v = verificarSalida(E2, candidatos, textos, { ...ok, revisados: ok.revisados.map((r, i) => (i === 1 && !r.afecta ? { ...r, razon: ' ' } : r)) })
    expect(v.completa).toBe(false)
    expect(v.sin_razon).toHaveLength(1)
  })
  it('sabotaje: un «no aparece» que sí aparece → no se acepta entera', () => {
    const v = verificarSalida(E2, candidatos, textos, { ...ok, no_aparece: [{ documento: 'gran_idea', termino: 'encebollado' }] })
    expect(v.completa).toBe(false)
  })
  it('un «no aparece» verdadero se acepta', () => {
    expect(verificarSalida(E2, candidatos, textos, { ...ok, no_aparece: [{ documento: 'gran_idea', termino: 'transferencia' }] }).completa).toBe(true)
  })
  it('sabotaje: un «antes» que está en el documento pero NO en su pedazo se rechaza', () => {
    const otro = candidatos.find((p) => p.id !== cita.id)!
    const s: SalidaDelAgente = { ...ok, revisados: todosRevisados([otro.id]), colaterales: [{ id: otro.id, documento: 'gran_idea', antes: 'viene de la costa', despues: 'viene de la playa', porque: 'x' }] }
    expect(verificarSalida(E2, candidatos, textos, s).rechazados[0]?.motivo).toBe('antes_no_literal_en_su_pedazo')
  })
  it('sabotaje (línea 1 CC7): un «después» con «pagás» no se aplica con cliente de tuteo', () => {
    const s: SalidaDelAgente = { ...ok, colaterales: [{ ...ok.colaterales[0], despues: 'viene de la playa y pagás al recibir' }] }
    const v = verificarSalida(E2, candidatos, textos, s, { registro: 'tu' })
    expect(v.aceptados).toHaveLength(0)
    expect(v.rechazados[0]).toMatchObject({ motivo: 'registro', detalle: 'pagás' })
  })
  it('sin dato de registro también se mira (el tuteo es lo de la casa)', () => {
    const s: SalidaDelAgente = { ...ok, colaterales: [{ ...ok.colaterales[0], despues: 'viene de la playa, desayunás tranquilo' }] }
    expect(verificarSalida(E2, candidatos, textos, s).rechazados[0]?.motivo).toBe('registro')
  })
  it('con un cliente de voseo, el voseo no se rechaza', () => {
    const s: SalidaDelAgente = { ...ok, colaterales: [{ ...ok.colaterales[0], despues: 'viene de la playa y pagás al recibir' }] }
    expect(verificarSalida(E2, candidatos, textos, s, { registro: 'vos' }).aceptados).toHaveLength(1)
  })
  it('línea 2 CC6: «está», «más», «después», «país», «atrás» y «maracuyá» NO frenan un retoque', () => {
    const s: SalidaDelAgente = { ...ok, colaterales: [{ ...ok.colaterales[0], despues: 'viene de la playa, está más cerca después del país, atrás, con maracuyá' }] }
    expect(verificarSalida(E2, candidatos, textos, s, { registro: 'tu' }).aceptados).toHaveLength(1)
  })
  it('línea 2 CC6: el plan y el brief v4 reales de Náufrago (tuteo) dan 0 frenos por registro, pedazo por pedazo', () => {
    for (const [doc, texto] of [['plan', fx.plan_4996c6c2], ['brief', fx.brief_v4_completo]] as const) {
      const ps = pedazosDe(doc, texto).map((p, i) => ({ ...p, id: `C${i + 1}` }))
      // cada pedazo real como «después» de un retoque sobre un pedazo neutro: si el detector lo frena, es un falso positivo
      const neutro: Pedazo = { id: 'N1', documento: 'gran_idea', seccion: 'x', texto: 'texto base neutro', ocurrencia: 0, ruta: null }
      const frenos = ps.filter((p) => verificarSalida(E2, [neutro], {}, { revisados: [{ id: 'N1', afecta: true, razon: '' }], colaterales: [{ id: 'N1', documento: 'gran_idea', antes: 'texto base neutro', despues: p.texto, porque: 'x' }], no_aparece: [] }, { registro: 'tu' }).rechazados.length)
      expect(frenos.map((p) => p.texto.slice(0, 60)), doc).toEqual([])
    }
  })
  it('sabotaje: un retoque en un pedazo marcado «no afecta» se rechaza', () => {
    const s: SalidaDelAgente = { ...ok, revisados: todosRevisados([]) }
    expect(verificarSalida(E2, candidatos, textos, s).rechazados[0]?.motivo).toBe('no_marcado_como_afecta')
  })
  it('sabotaje: un id que no es candidato, o el documento cambiado, se rechaza', () => {
    expect(verificarSalida(E2, candidatos, textos, { ...ok, colaterales: [{ ...ok.colaterales[0], id: 'C999' }] }).rechazados[0]?.motivo).toBe('id_desconocido')
    expect(verificarSalida(E2, candidatos, textos, { ...ok, colaterales: [{ ...ok.colaterales[0], documento: 'plan' }] }).rechazados[0]?.motivo).toBe('documento_distinto_al_pedazo')
  })
  it('sabotaje: aguas arriba se rechaza aunque el agente lo pida (edición del brief sobre un pedazo del plan)', () => {
    const p: Pedazo = { id: 'C1', documento: 'plan', seccion: 'x', texto: 'el bueno viene de la costa', ocurrencia: 0, ruta: null }
    const s: SalidaDelAgente = { revisados: [{ id: 'C1', afecta: true, razon: '' }], colaterales: [{ id: 'C1', documento: 'plan', antes: 'la costa', despues: 'la playa', porque: 'x' }], no_aparece: [] }
    expect(verificarSalida(E2, [p], { plan: p.texto }, s).rechazados[0]?.motivo).toBe('aguas_arriba')
  })
  it('sabotaje: «antes» igual al «después» se rechaza (retocar lo que ya coincide)', () => {
    expect(verificarSalida(E2, candidatos, textos, { ...ok, colaterales: [{ ...ok.colaterales[0], despues: 'viene de la costa' }] }).rechazados[0]?.motivo).toBe('antes_igual_a_despues')
  })
})

describe('aplicar · dentro de su pedazo, nunca en todo el documento', () => {
  const linea = 'mensaje: el encebollado que conoces de la costa ya no pide que viajes'
  const doc = `## A\n${linea}\n## B\n${linea}\n## C\nla costa ecuatoriana`
  const ps = pedazosDe('gran_idea', doc).map((p, i) => ({ ...p, id: `C${i + 1}` }))
  const r = (p: Pedazo) => ({ pedazo: p, antes: 'de la costa', despues: 'de la playa', porque: 'x' })
  it('retocar la SEGUNDA aparición deja intacta la primera', () => {
    const nuevo = aplicarEnPedazo(doc, r(ps[1]))
    expect(nuevo).toBe(`## A\n${linea}\n## B\n${linea.replace('de la costa', 'de la playa')}\n## C\nla costa ecuatoriana`)
  })
  it('sabotaje: nunca un reemplazo global («la costa ecuatoriana» no se toca)', () => {
    const { texto } = aplicarEnDocumento(doc, [r(ps[0]), r(ps[1])])
    expect(texto).toContain('la costa ecuatoriana')
    expect(texto.split('de la playa').length - 1).toBe(2)
  })
  it('si el pedazo ya no está igual (alguien lo tocó), queda sin aplicar — no se pisa', () => {
    const tocado = doc.replace(linea, 'mensaje: otro texto')
    const { sin_aplicar, aplicados } = aplicarEnDocumento(tocado, [r(ps[1])])
    expect(aplicados).toHaveLength(0)
    expect(sin_aplicar).toHaveLength(1)
  })
  it('JSON: escribe por la ruta de la llave (la estrategia real)', () => {
    const p = pedazosDe('estrategia', fx.estrategia_v1).map((x, i) => ({ ...x, id: `C${i + 1}` })).find((x) => x.texto.includes('pago en efectivo al recibir'))!
    const nuevo = JSON.parse(aplicarEnPedazo(fx.estrategia_v1, { pedazo: p, antes: 'pago en efectivo al recibir', despues: 'pago en efectivo o por transferencia al recibir', porque: 'x' }))
    const viejo = JSON.parse(fx.estrategia_v1)
    const i = Number(p.ruta!.match(/\[(\d+)\]/)![1])
    expect(nuevo.piezas_fijas[i].tema).toContain('o por transferencia')
    nuevo.piezas_fijas[i].tema = viejo.piezas_fijas[i].tema
    expect(nuevo).toEqual(viejo)
  })
})

describe('R2 · encendido calculado en el instante (al guardar y al aplicar)', () => {
  const HOY = new Set(['plan', 'pieza']) // filas activas reales de jefatura_grading_policies (10-nov)
  it('con las filas de hoy, el plan NO lanza el motor y dice qué falta', () => {
    expect(puedeLanzarMotor('plan', HOY)).toEqual({ ok: false, faltan: ['estrategia', 'brief', 'gran_idea', 'calendario'] })
  })
  it('con las filas de hoy, el calendario y la pieza sí', () => {
    expect(puedeLanzarMotor('calendario', HOY).ok).toBe(true)
    expect(puedeLanzarMotor('pieza', HOY).ok).toBe(true)
  })
  it('sabotaje CC6 (orden corregido): pantalla del calendario abierta, se apaga la fila de la pieza, se guarda → no se lanza', () => {
    const alAbrir = puedeLanzarMotor('calendario', HOY).ok
    const alGuardar = puedeLanzarMotor('calendario', new Set(['plan'])).ok
    expect([alAbrir, alGuardar]).toEqual([true, false])
  })
  it('línea 3 CC7: al aplicar se vuelve a mirar la fila del destino', () => {
    expect(puedeAplicarEn('pieza', HOY)).toBe(true)
    expect(puedeAplicarEn('pieza', new Set(['plan']))).toBe(false)
    expect(puedeAplicarEn('brief', HOY)).toBe(false) // H1: fila inactiva → pendiente
  })
  it('la nota del historial dice qué fila falta (adenda 4)', () => {
    expect(notaSinColaterales(['gran_idea'])).toBe('no se revisaron colaterales: falta la fila activa de gran_idea')
  })
})
