/**
 * 18-nov · T7d · encargo de Lenovo al pie de `PARA-LENOVO-de-CC7-T7d-gran-idea-lista-para-tu-mirada` (arreglos 2 y 3). US$ 0, sin base ni red ni modelo.
 *  2) La integración real A31 de la mesa `0aa14d17` abrió con la charla del director («Voy a leer el tablero completo…», «El sistema indica que ya se alcanzó el límite de pedidos
 *     encadenados…»), y fue lo primero que se leyó en la bandeja. Regla exacta en la mesa de CONCEPTO: lo que va antes de la primera sección `## ` no se entrega. Además va una
 *     instrucción en el pedido.
 *  3) El voseo («pedilo», «pagás», «sabés») vino de los aportes del equipo (A13, A21 y A24) y el banco junta líneas de esos aportes. Por instrucción, sin código nuevo: todos los
 *     turnos de la mesa reciben «la forma de trato es la del manual; si el manual tutea, nunca voseo». Juzgarlo es del agente.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { sinCharlaAntesDeLaPrimeraSeccion, textoDeLaMesaParaLaCadena, textoParaLaCadena, TITULO_IDEAS_DE_LOS_APORTES } from '../mesa/de-la-cadena'
import { armarTarea, FORMA_DE_TRATO_Y_SIN_CHARLA, LA_FORMA_DE_TRATO, type TipoDeTurno } from '../mesa/pedidos'
import type { EstadoMesa } from '../mesa/tipos'

/** la integración REAL A31 de la mesa de la gran idea de T7d (`oficina_mesa_aportes`, encargo 0aa14d17, leída con SELECT el 18-nov) */
/** 🟡 CC6: en Windows el fixture baja con CRLF (`core.autocrlf`); se normaliza para que la prueba mida lo mismo que en CI */
const A31 = fs.readFileSync(path.join(__dirname, '..', '..', 'cadena', '__fixtures__', 'integracion-a31-0aa14d17-real.md'), 'utf8').replace(/\r\n/g, '\n')
const CHARLA = ['Voy a leer el tablero completo antes de integrar las citas que faltan.', 'Integro con las citas completas de cada aporte del tablero.', 'El sistema indica que ya se alcanzó el límite de pedidos encadenados. Entrego la pieza completa directamente como texto.']
const IDEA = '- C1-I01 · instagram · historia · revelación del bowl · mensaje: el encebollado ya llega a tu barrio · gancho: brecha de curiosidad · protagonista: bowl · serie: S1 · foto:8a05ea9d'
const libroCon = (integracion: string) => [
  { n: 20, de: 'content-creator', tipo: 'aporta', texto: `Aporte del redactor.\n\n${IDEA}` },
  { n: 31, de: 'creative-director-mesa', tipo: 'integra', texto: integracion },
]

describe('arreglo 2 · la charla del director no se entrega en la gran idea', () => {
  it('el texto real A31 empieza con la charla (control: la prueba mira lo que pasó en T7d)', () => {
    for (const frase of CHARLA) expect(A31).toContain(frase)
    expect(A31.indexOf('## Gran idea')).toBeGreaterThan(A31.indexOf(CHARLA[2]))
  })
  it('sobre el texto real A31: sale desde «## Gran idea», sin la charla, y todo lo demás queda igual', () => {
    const limpio = sinCharlaAntesDeLaPrimeraSeccion(A31)
    expect(limpio.startsWith('## Gran idea\n')).toBe(true)
    for (const frase of CHARLA) expect(limpio).not.toContain(frase)
    expect(limpio).toBe(A31.slice(A31.indexOf('## Gran idea')).trim())
    expect(limpio).toContain('## Citas')
  })
  it('sin ninguna sección el texto queda igual; si ya empieza con sección, también', () => {
    const sinSeccion = 'Voy a leer el tablero.\n\nSolo texto, sin secciones.'
    expect(sinCharlaAntesDeLaPrimeraSeccion(sinSeccion)).toBe(sinSeccion)
    const yaLimpio = '## Gran idea\nNombre · frase\n\n## Citas\nA3 usé'
    expect(sinCharlaAntesDeLaPrimeraSeccion(yaLimpio)).toBe(yaLimpio)
    // un «###» o un «##» pegado a la palabra NO son la primera sección: la regla es exacta (`## ` con espacio, al inicio de la línea)
    expect(sinCharlaAntesDeLaPrimeraSeccion('Charla\n##Gran idea\ntexto')).toBe('Charla\n##Gran idea\ntexto')
    expect(sinCharlaAntesDeLaPrimeraSeccion('Charla con ## dentro de la línea\ntexto')).toBe('Charla con ## dentro de la línea\ntexto')
  })
  it('🟡 CC6 (h1): un título «###» de la charla no cuenta como la primera sección; se corta en «## Gran idea»', () => {
    expect(sinCharlaAntesDeLaPrimeraSeccion('Voy a leer el tablero.\n### Notas de trabajo\nreviso A20\n\n## Gran idea\nNombre · frase')).toBe('## Gran idea\nNombre · frase')
  })
  it('lo que la mesa de CONCEPTO entrega a la cadena empieza en «## Gran idea» y conserva el banco de los aportes', () => {
    const t = textoDeLaMesaParaLaCadena({ familia: 'concepto_mesa' }, libroCon(A31), null)
    expect(t.startsWith('## Gran idea\n')).toBe(true)
    for (const frase of CHARLA) expect(t).not.toContain(frase)
    expect(t).toContain(`${TITULO_IDEAS_DE_LOS_APORTES}\n\n${IDEA}`)
  })
  it('las otras mesas de la cadena no cambian: el brief entrega la integración tal cual (la regla es solo de la gran idea)', () => {
    expect(textoDeLaMesaParaLaCadena({ familia: 'brief_mesa' }, libroCon(A31), null)).toBe(A31.trim())
    expect(textoParaLaCadena(libroCon(A31), null)).toBe(A31.trim())
  })
})

const est = (tipo: EstadoMesa['tipo']): EstadoMesa => ({ tipo, directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] })
const ctx = (tipo: 'concepto' | 'brief' | 'carrusel' | 'kit' | 'video') => ({ cliente_nombre: 'Náufrago', tipo, brief_id: 'cpt-x-v1', brief_texto: 'el brief de la campaña', manual_texto: 'Tutear en todo imperativo: «pide», «ven», «prueba».', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 })

describe('arreglos 2 y 3 · la instrucción de la mesa: forma de trato del manual y sin charla', () => {
  it('la instrucción nombra el voseo con ejemplos y el «no narres»', () => {
    expect(FORMA_DE_TRATO_Y_SIN_CHARLA).toContain('Si el manual tutea, tutea siempre')
    expect(FORMA_DE_TRATO_Y_SIN_CHARLA).toContain('nunca voseo')
    for (const x of ['«pídelo»', '«pedilo»', '«pagás»', '«sabés»']) expect(FORMA_DE_TRATO_Y_SIN_CHARLA).toContain(x)
    expect(FORMA_DE_TRATO_Y_SIN_CHARLA).toContain('No narres lo que vas a hacer')
  })
  const turnos: TipoDeTurno[] = ['dirigir', 'aportar', 'responder', 'integrar', 'devolver_citas']
  it.each(turnos)('gran idea · el turno «%s» lleva la instrucción (dirección y equipo: el voseo vino de los aportes)', (tipo) => {
    const t = armarTarea({ tipo, agente: tipo === 'aportar' || tipo === 'responder' ? 'content-creator' : 'creative-director-mesa', tarjeta: undefined, est: est('concepto'), libro: [], c: ctx('concepto'), faltanCitas: 'A13' })
    expect(t).toContain(FORMA_DE_TRATO_Y_SIN_CHARLA)
    // va con las reglas, ANTES del manual y del tablero
    expect(t.indexOf(FORMA_DE_TRATO_Y_SIN_CHARLA)).toBeLessThan(t.indexOf('## 1 · Manual de marca'))
  })
  it.each(['brief', 'carrusel', 'kit', 'video'] as const)('la mesa de %s también la lleva (el mismo encabezado para todas)', (tipo) => {
    expect(armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est: est(tipo), libro: [], c: ctx(tipo) })).toContain(FORMA_DE_TRATO_Y_SIN_CHARLA)
  })
  it('🟡 CC6 · la mesa del banco (corrige UNA idea y reescribe su línea) lleva la forma de trato; no el «no narres» (su formato de respuesta es otro)', () => {
    const c = { ...ctx('concepto'), tipo: 'banco' } as unknown as ReturnType<typeof ctx>
    const t = armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est: est('banco' as EstadoMesa['tipo']), libro: [], c })
    expect(t).toContain('# Corrección de una idea del banco')
    expect(t).toContain(`6. ${LA_FORMA_DE_TRATO.replace(/^- /, '')}`)
    expect(t).not.toContain('No narres lo que vas a hacer')
  })
})
