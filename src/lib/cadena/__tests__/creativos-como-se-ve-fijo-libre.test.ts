/**
 * 17-nov · «creativos en cada paso» (GO Lenovo · firma de Emilio 07:18) · puntos 2 y 3 (CC3).
 *  2 · la gran idea decide «cómo se ve la campaña» en cuatro partes (luz, encuadre, fotos propias, lo que nunca se muestra) y llega a la hoja de CADA pieza:
 *      se prueba una pieza por familia (foto, historia del kit, carrusel, reel). Una gran idea vieja, sin las partes, escribe la hoja EXACTA de antes.
 *  3 · lo decidido pasa como FIJO / LIBRE / PORQUÉ: el paso siguiente (la oficina, `parsearBrief`, y la tarea de la mesa) recibe la DECISIÓN con su porqué, no texto para copiar.
 * Solo por las puertas que ya existen (concepto → hoja → parte → brief de la oficina); ninguna lectura nueva del CEREBRO.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief, prohibePersonas } from '@/lib/oficina/brief'
import { armarTarea, CONVENCION_DE_LA_PIEZA } from '@/lib/oficina/mesa/pedidos'
import type { EstadoMesa } from '@/lib/oficina/mesa/tipos'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { leerBriefCreativo } from '../brief-creativo'
import { marcoDelConcepto } from '../mesas'
import { comoSeVeSinPartes, decisionDeLaParte, leerConcepto, partesDeComoSeVe, type InsumosDelConcepto } from '../conceptos'
import { CAMPO_LO_DECIDIDO, escribirHoja, LIBRE_DE_LA_PIEZA, loDecidido, PREFIJO_VISUAL_DE_CAMPANA, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'

const PLAN = '## Fase 1\nObjetivo: que el barrio sepa que la cocina abre temprano.'
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el barrio sepa que la cocina abre temprano».',
  '## Insight', 'La gente desayuna de pie.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', '30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre', '- prohibido: delicioso', '- lo que no se dice: precios',
  '## Faltantes', '- ninguno',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: ['delicioso'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'instagram', huecos_por_semana: 4 }], prohibidas: ['delicioso'], fotos: ['f-01'] }
const BANCO = [
  '## Banco de ideas',
  '- C1-I01 · instagram · foto_4x5 · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:f-01',
  '- C1-I02 · instagram · historia · el pan a las siete · mensaje: el pan sale a las siete · gancho: ¿ya desayunaste? · protagonista: el pan · serie: ninguna · foto:ninguna',
  '- C1-I03 · instagram · carrusel · la mesa por dentro · mensaje: así se arma la mesa · gancho: lo que no ves · protagonista: la mesa · serie: ninguna · foto:ninguna',
  '- C1-I04 · instagram · reel · la puerta que se abre · mensaje: abrimos a las siete · gancho: el sonido de la puerta · protagonista: la puerta · serie: ninguna · foto:ninguna',
]
const CAPITULO = ['## Capítulo F1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «que el barrio sepa» · Cómo se ve en este capítulo: planos cerrados']
/** la gran idea NUEVA: «Cómo se ve» con sus cuatro partes (dos con porqué propio) y una dirección libre */
const CON_PARTES = leerConcepto([
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Cómo se ve',
  'Madera y pan, nada de estudio.',
  '- luz: cálida de ventana a primera hora · porqué: el insight es el desayuno temprano',
  '- encuadre: cerrado a la altura de la mesa',
  '- **fotos propias:** las del local (foto:f-01) cuando la pieza muestre el lugar · porqué: el barrio reconoce su mesa',
  '- nunca se muestra: platos de catálogo ni gente posando',
  ...CAPITULO, ...BANCO,
].join('\n'), INS_C)
/** la gran idea VIEJA: el mismo «Cómo se ve» de siempre, en texto libre */
const VIEJA = leerConcepto(['## Gran idea  La mesa larga · Noventa días para sentarse juntos', '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.', ...CAPITULO, ...BANCO].join('\n'), INS_C)

const FORMATOS: FormatosPorRed = {
  instagram: [
    { formato: 'foto_4x5', produccion: 'opera', lead_dias: 1, max_por_dia: 1, familia: 'post_img' },
    { formato: 'historia', produccion: 'opera', lead_dias: 1, max_por_dia: 3, familia: 'kit_historias' },
    { formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'carrusel_ig_v1' },
    { formato: 'reel', produccion: 'opera', lead_dias: 3, max_por_dia: 1, familia: 'video_mesa' },
  ],
}
const fila = (id: string, formato: string, idea: string, hora: string): FilaDeHoja => ({ id, fecha: '2026-11-12', hora, red: 'instagram', formato, pilar: 'producto', tema: idea, datos: [], fase: 'F1', idea_ref: idea })
const FILAS = [fila('F1-S1-ig-foto', 'foto_4x5', 'C1-I01', '09:00'), fila('F1-S1-ig-hist', 'historia', 'C1-I02', '10:00'), fila('F1-S1-ig-carr', 'carrusel', 'C1-I03', '11:00'), fila('F1-S1-ig-reel', 'reel', 'C1-I04', '12:00')]
const INS = (concepto: typeof CON_PARTES): InsumosDeLaHoja => ({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 3, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46',
  brief: BRIEF, brief_id: 'brf-abc-v1', concepto, concepto_id: 'con-abc-v1', filas: FILAS, formatos: FORMATOS,
})

describe('punto 2 · la gran idea lee «cómo se ve la campaña» en cuatro partes', () => {
  it('lee las cuatro partes (viñeta y negrita admitidas); la dirección libre queda aparte', () => {
    expect(CON_PARTES.como_se_ve_partes).toEqual({
      luz: 'cálida de ventana a primera hora · porqué: el insight es el desayuno temprano',
      encuadre: 'cerrado a la altura de la mesa',
      fotos_propias: 'las del local (foto:f-01) cuando la pieza muestre el lugar · porqué: el barrio reconoce su mesa',
      nunca_se_muestra: 'platos de catálogo ni gente posando',
    })
    expect(comoSeVeSinPartes(CON_PARTES.como_se_ve)).toBe('Madera y pan, nada de estudio.')
  })
  it('una gran idea vieja (texto libre) no trae partes: nada se inventa', () => {
    expect(VIEJA.como_se_ve_partes).toBeUndefined()
    expect(partesDeComoSeVe('Luz cálida, madera, manos sobre la mesa.')).toBeNull()
    expect(partesDeComoSeVe('')).toBeNull()
    expect(partesDeComoSeVe(undefined)).toBeNull()
  })
  it('cada parte: la primera manda; «lo que nunca se muestra» y «foto propia» también se leen', () => {
    expect(partesDeComoSeVe('- luz: a\n- luz: b\n- lo que nunca se muestra: c\n- foto propia: d')).toEqual({ luz: 'a', nunca_se_muestra: 'c', fotos_propias: 'd' })
  })
  it('el porqué se separa de lo decidido; sin porqué, null', () => {
    expect(decisionDeLaParte('cálida · porqué: el insight')).toEqual({ que: 'cálida', porque: 'el insight' })
    expect(decisionDeLaParte('cálida · por qué: el insight')).toEqual({ que: 'cálida', porque: 'el insight' })
    expect(decisionDeLaParte('cerrado a la altura de la mesa')).toEqual({ que: 'cerrado a la altura de la mesa', porque: null })
  })
})

describe('punto 2 · «cómo se ve» llega a la hoja de CADA pieza (una por familia)', () => {
  const h = escribirHoja(INS(CON_PARTES))
  for (const [id, familia] of [['F1-S1-ig-foto', 'foto'], ['kit-2026-W46', 'historias (kit)'], ['F1-S1-ig-carr', 'carrusel'], ['F1-S1-ig-reel', 'reel']] as const) {
    it(`${familia}: la hoja trae las cuatro partes como FIJO, la idea de la pieza y lo LIBRE`, () => {
      const b = parsearBrief(h.texto_md, id)
      expect(b, `no está el brief ${id}`).not.toBeNull()
      const d = b!.lo_decidido!
      expect(d).toEqual(expect.arrayContaining([
        'FIJO · luz: cálida de ventana a primera hora · PORQUÉ: el insight es el desayuno temprano',
        'FIJO · encuadre: cerrado a la altura de la mesa · PORQUÉ: lo decidió la gran idea «La mesa larga» para toda la campaña',
        'FIJO · fotos propias: las del local (foto:f-01) cuando la pieza muestre el lugar · PORQUÉ: el barrio reconoce su mesa',
        'FIJO · nunca se muestra: platos de catálogo ni gente posando · PORQUÉ: lo decidió la gran idea «La mesa larga» para toda la campaña',
        LIBRE_DE_LA_PIEZA,
      ]))
      // la línea VISUAL ya no repite las partes: lleva la dirección libre y el capítulo
      expect(b!.visual).toBe(`${PREFIJO_VISUAL_DE_CAMPANA}Madera y pan, nada de estudio. · planos cerrados${id === 'F1-S1-ig-foto' ? ' · foto f-01' : ''}`)
    })
  }
  // 17-nov · Sprint 4 · F: la descripción del banco llega TAL CUAL en IDEA DEL BANCO (la pieza nace de la idea); el porqué dice que la crearon los creativos
  it('la idea elegida de cada pieza viaja como FIJO con su porqué; su descripción llega tal cual en IDEA DEL BANCO', () => {
    // 17-nov (RESPUESTA a Lenovo «el brief trae el cómo»): lo fijo de la idea es el qué y el quién (id, mensaje, protagonista); «la puerta que se abre» es el cómo que imaginó el banco
    const fijo = parsearBrief(h.texto_md, 'F1-S1-ig-reel')!.lo_decidido!.find((x) => x.startsWith('FIJO · idea de esta pieza: C1-I04'))!
    expect(fijo).toMatch(/^FIJO · idea de esta pieza: C1-I04 · mensaje: .+ · PORQUÉ: la crearon los creativos de la gran idea en el capítulo F1; el calendario solo le puso fecha, red y formato$/)
    expect(fijo).not.toContain('la puerta que se abre')
    expect(parsearBrief(h.texto_md, 'F1-S1-ig-reel')!.texto).toMatch(/^- IDEA DEL BANCO: C1-I04 · la puerta que se abre · mensaje: /m)
  })
})

describe('gran idea vieja (sin las partes de «cómo se ve») · 17-nov (RESPUESTA a Lenovo «el brief trae el cómo»): igual lleva FIJO (la idea) y LIBRE', () => {
  it('LO DECIDIDO trae solo la idea y lo LIBRE (ningún FIJO de «cómo se ve» que la gran idea no decidió); la línea VISUAL es la de siempre', () => {
    const h = escribirHoja(INS(VIEJA))
    expect(h.texto_md).toContain(`- ${CAMPO_LO_DECIDIDO}:`)
    const ld = parsearBrief(h.texto_md, 'F1-S1-ig-foto')!.lo_decidido!
    expect(ld).toHaveLength(2)
    expect(ld[0]).toMatch(/^FIJO · idea de esta pieza: C1-I\d+ · mensaje: /)
    expect(ld[1]).toBe(LIBRE_DE_LA_PIEZA)
    expect(h.texto_md).not.toMatch(/FIJO · (luz|encuadre|fotos propias|nunca se muestra):/)
    expect(parsearBrief(h.texto_md, 'F1-S1-ig-foto')!.visual).toBe(`${PREFIJO_VISUAL_DE_CAMPANA}Luz cálida, madera, manos sobre la mesa. · planos cerrados · foto f-01`)
  })
  it('la misma gran idea vieja con y sin el campo nuevo en el tipo escribe el mismo texto (control: quitar las partes deja la hoja idéntica a la vieja salvo la dirección libre)', () => {
    const sinPartes = { ...CON_PARTES, como_se_ve_partes: undefined, como_se_ve: 'Luz cálida, madera, manos sobre la mesa.' }
    expect(escribirHoja(INS(sinPartes)).texto_md).toBe(escribirHoja(INS(VIEJA)).texto_md)
  })
  it('loDecidido sin partes: sin idea ni mensaje, solo LIBRE; sin idea con el mensaje de la fila, FIJO del mensaje y LIBRE', () => {
    expect(loDecidido(VIEJA, null, null)).toEqual([LIBRE_DE_LA_PIEZA])
    expect(loDecidido(VIEJA, null, null, 'hay mesa desde las siete')).toEqual(['FIJO · mensaje de esta pieza: hay mesa desde las siete · PORQUÉ: lo fija la fila del calendario (no tiene idea del banco)', LIBRE_DE_LA_PIEZA])
  })
})

describe('punto 3 · el paso siguiente recibe la DECISIÓN, no texto para copiar', () => {
  const h = escribirHoja(INS(CON_PARTES))
  it('la oficina recibe cada decisión separada en qué y porqué (FIJO) y lo que decide ella (LIBRE)', () => {
    const d = parsearBrief(h.texto_md, 'F1-S1-ig-foto')!.lo_decidido!
    for (const x of d) expect(x).toMatch(/^(FIJO · [^:]+: .+ · PORQUÉ: .+|LIBRE · .+ · PORQUÉ: .+)$/)
    expect(d.filter((x) => x.startsWith('LIBRE ·'))).toHaveLength(1)
  })
  for (const [id, tipo] of [['kit-2026-W46', 'kit'], ['F1-S1-ig-carr', 'carrusel'], ['F1-S1-ig-reel', 'video']] as const) {
    it(`la tarea de cada asiento de la mesa (${tipo}) lleva lo decidido dentro del brief que recibe`, () => {
      const b = parsearBrief(h.texto_md, id)!
      const est: EstadoMesa = { tipo, directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] }
      const c = { cliente_nombre: 'Cliente', tipo, brief_id: id, brief_texto: b.texto, manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 }
      const t = armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est, libro: [], c })
      expect(t).toContain('FIJO · luz: cálida de ventana a primera hora · PORQUÉ: el insight es el desayuno temprano')
      expect(t).toContain(LIBRE_DE_LA_PIEZA)
    })
  }
})

// ───────────────────────── certificación CC7 de #1089
describe('🟡 1 de CC7 · «nunca se muestra: personas» sigue protegiendo la elección de fotos', () => {
  const conNunca = (linea: string) => leerConcepto(['## Gran idea  La mesa larga · Noventa días para sentarse juntos', '## Cómo se ve', 'Madera y pan.', '- luz: cálida de ventana', linea, ...CAPITULO, ...BANCO].join('\n'), INS_C)
  it('la gran idea escribe «- nunca se muestra: no aparecen personas»: la VISUAL ya no lo dice, pero LO DECIDIDO sí y la oficina prohíbe personas', () => {
    const b = parsearBrief(escribirHoja(INS(conNunca('- nunca se muestra: no aparecen personas'))).texto_md, 'F1-S1-ig-foto')!
    expect(b.visual).not.toMatch(/personas/)
    expect(prohibePersonas(b)).toBe(true)
    // control: sin leer LO DECIDIDO, la misma pieza ya no prohibiría personas (lo que medía CC7)
    expect(prohibePersonas({ ...b, lo_decidido: undefined })).toBe(false)
  })
  it('«- nunca se muestra: personas ni platos» también cuenta (la etiqueta ya es la negación)', () => {
    const b = parsearBrief(escribirHoja(INS(conNunca('- nunca se muestra: personas ni platos'))).texto_md, 'F1-S1-ig-foto')!
    expect(prohibePersonas(b)).toBe(true)
  })
  it('sin nada sobre personas, no prohíbe (no inventa una reja)', () => {
    expect(prohibePersonas(parsearBrief(escribirHoja(INS(CON_PARTES)).texto_md, 'F1-S1-ig-foto')!)).toBe(false)
  })
})

describe('🟡 2 de CC7 · los dos pedidos de la gran idea piden las cuatro partes, y LO DECIDIDO va justo después de VISUAL', () => {
  const CUATRO = ['- luz:', '- encuadre:', '- fotos propias:', '- nunca se muestra:']
  it('el pedido de la cadena (marcoDelConcepto)', () => {
    const t = marcoDelConcepto({ ctx: contextoDe(clienteA()), estrategia: clienteA().estrategia, briefTexto: 'brief', version: 1, nota: null })
    for (const p of CUATRO) expect(t).toContain(`«${p} … · porqué: …»`)
  })
  it('el pedido de la mesa de la gran idea (convención concepto.v1)', () => {
    const t = CONVENCION_DE_LA_PIEZA('concepto')
    const i = t.indexOf('## Cómo se ve'), j = t.indexOf('## Cómo suena')
    expect(i).toBeGreaterThan(-1)
    const bloque = t.slice(i, j)
    for (const p of CUATRO) expect(bloque).toContain(`${p} <`)
    expect(bloque).toContain('· porqué: <por qué>')
  })
  it('en la hoja, LO DECIDIDO sigue inmediatamente a la línea VISUAL', () => {
    const lineas = parsearBrief(escribirHoja(INS(CON_PARTES)).texto_md, 'F1-S1-ig-carr')!.texto.split('\n')
    const v = lineas.findIndex((l) => l.startsWith('- VISUAL:'))
    expect(lineas[v + 1]).toBe(`- ${CAMPO_LO_DECIDIDO}:`)
  })
})
