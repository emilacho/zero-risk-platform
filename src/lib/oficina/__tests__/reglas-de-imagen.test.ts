import { describe, it, expect } from 'vitest'
import { describirReglas } from '../pedidos'
import { chequearPrompts, decideImagen, veredictoDeImagenes, elegirVersion, citasExisten, datosAjenos, derivarDecision } from '../reglas-de-imagen'
import type { ReglasDeImagen, PropiosDelCliente, ObservacionDeImagen } from '../reglas-de-imagen'

const reglas: ReglasDeImagen = {
  obligatorio: [{ id: 'o1', texto: 'plato completo', claves: ['plato completo', 'plato entero'] }, { id: 'o2', texto: 'producto protagonista', claves: ['ceviche'] }],
  prohibido: [{ id: 'p1', texto: 'personas', claves: ['personas', 'manos'] }, { id: 'p2', texto: 'texto en la imagen', claves: ['texto'] }, { id: 'p3', texto: 'logo', claves: ['logo', 'logotipo'] }],
}
const propios: PropiosDelCliente = { telefonos: ['+593 997 744 288'], handles: ['@marca.propia'], urls: ['https://www.marca-propia.ec'], marcas_ajenas: ['rukutu'] }

describe('② chequearPrompts: ANTES de gastar la imagen', () => {
  const bueno = 'Un ceviche con el plato completo visible, luz natural lateral, mesa de madera clara. Sin personas, sin texto, sin logos.'
  it('pasa el que cubre cada obligatorio y niega los prohibidos', () => {
    const r = chequearPrompts([bueno], reglas, propios)
    expect(r.pasan).toEqual([0]); expect(r.ninguno).toBe(false)
  })
  it('#12 · el que no REPITE la palabra de un obligatorio pasa con un AVISO (lo juzga quien mira la imagen)', () => {
    const r = chequearPrompts(['Un ceviche en un bowl, luz cálida.'], reglas, propios)
    expect(r.pasan).toEqual([0])
    expect(r.avisos.join(' ')).toMatch(/no repite el obligatorio «o1».*lo juzga quien mira la imagen/)
  })
  it('#12 · pero en la imagen el obligatorio sigue exigido: si quien mira dice que falta, la imagen falla', () => {
    const o: ObservacionDeImagen = { indice: 0, reglas: [{ id: 'o1', presente: false }, { id: 'o2', presente: true }, { id: 'p1', presente: false }, { id: 'p2', presente: false }, { id: 'p3', presente: false }], texto_en_imagen: [], marcas: [], personas: 0 }
    expect(decideImagen(o, reglas, propios).fallas.map((f) => f.codigo)).toEqual(['obligatorio_ausente'])
  })
  it('NO pasa el que nombra un prohibido SIN negarlo ("con personas")', () => {
    const r = chequearPrompts(['Un ceviche, plato completo, con personas sonriendo al fondo.'], reglas, propios)
    expect(r.fallan[0].motivos.join(' ')).toMatch(/prohibido «p1»/)
  })
  it('"sin personas", "ni logos", "nada de texto" son NEGACIONES y no cuentan como nombrar el prohibido', () => {
    const r = chequearPrompts(['Ceviche, plato entero, sin personas ni logo, nada de texto.'], reglas, propios)
    expect(r.pasan).toEqual([0])
  })
  it('nombra una marca ajena', () => {
    const r = chequearPrompts(['Ceviche plato completo como el de Rukutu, sin personas, sin texto, sin logos.'], reglas, propios)
    expect(r.fallan[0].motivos.join(' ')).toMatch(/marca ajena/)
  })
  it('los parámetros del generador (--ar) siguen EXACTOS: descartan', () => {
    expect(chequearPrompts([bueno + ' --ar 4:5'], reglas, propios).fallan[0].motivos.join(' ')).toMatch(/parámetros/)
  })
  it('#12 · algo con forma de proporción («10:30», «4:5») ya no descarta: es un aviso', () => {
    for (const x of [' formato 4:5', ' a las 10:30 de la mañana']) {
      const r = chequearPrompts([bueno + x], reglas, propios)
      expect(r.pasan).toEqual([0])
      expect(r.avisos.join(' ')).toMatch(/forma de proporción/)
    }
  })
  it('#12 · «estilo de <Nombre>» ya no descarta: es un aviso (el estilo de Guayaquil no es una persona)', () => {
    for (const x of [' Al estilo de Annie Leibovitz.', ' in the style of Ansel Adams', ' Con el estilo de Guayaquil antiguo.']) {
      const r = chequearPrompts([bueno + x], reglas, propios)
      expect(r.pasan).toEqual([0])
      expect(r.avisos.join(' ')).toMatch(/persona real/)
    }
  })
  it('separa por prompt: de tres, pasan los buenos', () => {
    const r = chequearPrompts([bueno, 'Ceviche, plato completo, con personas al fondo.', bueno.replace('natural lateral', 'de ventana')], reglas, propios)
    expect(r.pasan).toEqual([0, 2]); expect(r.fallan.map((x) => x.indice)).toEqual([1])
  })
  it('un brief sin reglas deja pasar todo lo que no tenga marcas, parámetros ni autores', () => {
    expect(chequearPrompts(['cualquier cosa razonable'], { obligatorio: [], prohibido: [] }, propios).pasan).toEqual([0])
  })
})

describe('③ decideImagen: el curador describe, el CÓDIGO decide', () => {
  const obs = (o: Partial<ObservacionDeImagen> = {}): ObservacionDeImagen => ({
    indice: 0, reglas: [{ id: 'o1', presente: true }, { id: 'o2', presente: true }, { id: 'p1', presente: false }, { id: 'p2', presente: false }, { id: 'p3', presente: false }],
    texto_en_imagen: [], marcas: [], personas: 0, ...o,
  })
  it('pasa cuando todo obligatorio está y ningún prohibido', () => { expect(decideImagen(obs(), reglas, propios).pasa).toBe(true) })
  it('#13 · con el dato exigido: «sí» falla como dato_sin_verificar, sin respuesta como regla_omitida, «no» pasa; sin exigirlo no se mira', () => {
    const cod = (d: boolean | undefined, exigirDato?: boolean) => decideImagen(obs(d === undefined ? {} : { dato_sin_verificar: d }), reglas, propios, { exigirDato }).fallas.map((f) => f.codigo)
    expect(cod(true, true)).toEqual(['dato_sin_verificar'])
    expect(cod(undefined, true)).toEqual(['regla_omitida'])
    expect(cod(false, true)).toEqual([])
    expect(cod(true)).toEqual([]); expect(cod(undefined, false)).toEqual([])
  })
  it('🟡 CC7 §2 · Seguridad Industrial · veredicto: la foto real (su sello verdadero en el extintor) no se exige; la generada con «sí» u omitido falla', () => {
    const real = obs({ indice: 1000, texto_en_imagen: ['INEN'], dato_sin_verificar: true })
    const realOmitida = obs({ indice: 1001 })
    const gen = obs({ indice: 0, dato_sin_verificar: true })
    const genOmitida = obs({ indice: 1 })
    const v = veredictoDeImagenes([real, realOmitida, gen, genOmitida], reglas, propios, false, { exigirDato: true, esGenerada: (i) => i < 1000 })
    expect(v.porImagen.filter((x) => x.pasa).map((x) => x.indice)).toEqual([1000, 1001])
    expect(v.porImagen.find((x) => x.indice === 0)!.fallas.map((f) => f.codigo)).toEqual(['dato_sin_verificar'])
    expect(v.porImagen.find((x) => x.indice === 1)!.fallas.map((f) => f.codigo)).toEqual(['regla_omitida'])
  })
  it('un obligatorio ausente o "no se ve" FALLA', () => {
    expect(decideImagen(obs({ reglas: obs().reglas.map((r) => (r.id === 'o1' ? { ...r, presente: false as const } : r)) }), reglas, propios).fallas[0].codigo).toBe('obligatorio_ausente')
    expect(decideImagen(obs({ reglas: obs().reglas.map((r) => (r.id === 'o1' ? { ...r, presente: 'no_se_ve' as const } : r)) }), reglas, propios).pasa).toBe(false)
  })
  it('un prohibido presente FALLA; un prohibido "no se ve" cuenta como ausente', () => {
    expect(decideImagen(obs({ reglas: obs().reglas.map((r) => (r.id === 'p1' ? { ...r, presente: true as const } : r)) }), reglas, propios).fallas[0].codigo).toBe('prohibido_presente')
    expect(decideImagen(obs({ reglas: obs().reglas.map((r) => (r.id === 'p1' ? { ...r, presente: 'no_se_ve' as const } : r)) }), reglas, propios).pasa).toBe(true)
  })
  it('una regla que el curador OMITIÓ cuenta como falla (no se supone)', () => {
    expect(decideImagen(obs({ reglas: obs().reglas.filter((r) => r.id !== 'p3') }), reglas, propios).fallas[0].codigo).toBe('regla_omitida')
  })
  it('un OBLIGATORIO que el curador omitió también cuenta como falla', () => {
    const r = decideImagen(obs({ reglas: obs().reglas.filter((x) => x.id !== 'o2') }), reglas, propios)
    expect(r.pasa).toBe(false); expect(r.fallas[0].codigo).toBe('regla_omitida')
  })
  it('teléfono, usuario o enlace ajenos en el texto visible FALLAN; los del cliente no', () => {
    expect(decideImagen(obs({ texto_en_imagen: ['RUKUTÚ 0997664119 @rukutuio'] }), reglas, propios).fallas.map((f) => f.codigo)).toContain('dato_ajeno')
    expect(decideImagen(obs({ texto_en_imagen: ['Pide al 0997744288 · @marca.propia · www.marca-propia.ec/menu'] }), reglas, propios).pasa).toBe(true)
  })
  it('una marca ajena visible FALLA', () => {
    expect(decideImagen(obs({ marcas: ['Rukutú'] }), reglas, propios).fallas[0].codigo).toBe('marca_ajena')
  })
  it('veredicto: regenera solo si ninguna pasa Y se puede', () => {
    const mala = obs({ reglas: obs().reglas.map((r) => (r.id === 'o2' ? { ...r, presente: false as const } : r)) })
    expect(veredictoDeImagenes([mala], reglas, propios, true).regenerar).toBe(true)
    expect(veredictoDeImagenes([mala], reglas, propios, false).regenerar).toBe(false)
    expect(veredictoDeImagenes([mala, { ...obs(), indice: 1 }], reglas, propios, true)).toMatchObject({ pasan: [1], regenerar: false })
  })
  it('elegirVersion: la preferida entre las que pasan; ninguna ⇒ null', () => {
    expect(elegirVersion([0, 2], [2, 1, 0])).toBe(2)
    expect(elegirVersion([1], [0, 2])).toBe(1)
    expect(elegirVersion([], [0])).toBeNull()
  })
})

describe('datos ajenos', () => {
  it('compara teléfonos sin importar espacios, +593 o el 0 inicial', () => {
    expect(datosAjenos(['0997 744 288'], propios)).toEqual([])
    expect(datosAjenos(['+593997744288'], propios)).toEqual([])
    expect(datosAjenos(['0997664119'], propios)).toEqual(['teléfono 997664119'])
  })
  it('un subdominio del dominio propio es propio', () => { expect(datosAjenos(['https://menu.marca-propia.ec/x'], propios)).toEqual([]) })
})

describe('17-nov · GO creativos punto 5 · las reglas de imagen se citan POR REFERENCIA; lo no comprobable se MARCA, no se descarta', () => {
  const brief = 'El plato aparece completo y central. Sin personas, sin logo sobre el plato, sin texto quemado. Luz natural.'
  // la hoja real escribe sus campos así (`escribirHoja`): el brief de la pieza la trae entera, con su GRAN IDEA
  const hoja = 'QUÉ ES: reel de la mesa larga\nGRAN IDEA: La mesa larga · todos comen juntos\nVISUAL: mesa de madera, luz de tarde, manos pasando platos\nLLAMADO: reserva'
  const manual = '## Paleta\nazul océano, arena\n## Fotografía\nluz natural, nada de flash'
  const plan = 'Objetivo del trimestre: llenar las noches de semana'
  it('acepta la cita que está en el brief (sin importar tildes, mayúsculas ni signos)', () => {
    const r = citasExisten({ obligatorio: [{ id: 'a', texto: 'completo', cita: 'El plato aparece COMPLETO y central' }], prohibido: [{ id: 'b', texto: 'personas', cita: 'sin personas' }] }, brief)
    expect(r.marcadas).toEqual([]); expect(r.validas.obligatorio).toHaveLength(1)
    expect(r.comprobadas).toEqual([{ id: 'a', fuente: 'brief', por: 'cita' }, { id: 'b', fuente: 'brief', por: 'cita' }])
  })
  it('🔴 sin rejas: la cita inventada y la regla sin cita se USAN igual, marcadas con su motivo (no se descartan)', () => {
    const r = citasExisten({ obligatorio: [{ id: 'a', texto: 'x', cita: 'El plato debe llevar flores' }], prohibido: [{ id: 'b', texto: 'y' }] }, brief)
    expect(r.marcadas.map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(r.validas.obligatorio).toEqual([{ id: 'a', texto: 'x', cita: 'El plato debe llevar flores', marcada: 'la cita no está en ninguna fuente: «El plato debe llevar flores»' }])
    expect(r.validas.prohibido).toEqual([{ id: 'b', texto: 'y', marcada: 'sin referencia: no dice de qué fuente ni qué campo sale' }])
  })
  it('🔴 por CAMPO, sin copiar: la sección nombrada existe en su fuente (hoja · gran idea · manual)', () => {
    const r = citasExisten({
      obligatorio: [{ id: 'o1', texto: 'mesa de madera a la luz de la tarde', fuente: 'hoja', campo: 'VISUAL' }, { id: 'o2', texto: 'paleta azul y arena', fuente: 'manual', campo: 'paleta' }, { id: 'o3', texto: 'todos alrededor de una misma mesa', fuente: 'gran_idea' }],
      prohibido: [{ id: 'p1', texto: 'flash duro', fuente: 'manual', campo: 'Fotografía' }],
    }, { brief: hoja, manual, plan })
    expect(r.marcadas).toEqual([])
    expect(r.comprobadas).toEqual([
      { id: 'o1', fuente: 'hoja', por: 'campo' }, { id: 'o2', fuente: 'manual', por: 'campo' }, { id: 'o3', fuente: 'gran_idea', por: 'campo' }, { id: 'p1', fuente: 'manual', por: 'campo' },
    ])
  })
  it('🔴 la cita cuenta en la fuente que la regla nombra, o en cualquiera si no nombra ninguna', () => {
    const r = citasExisten({ obligatorio: [{ id: 'm', texto: 'luz natural', cita: 'nada de flash', fuente: 'manual' }, { id: 'p', texto: 'noches', cita: 'llenar las noches' }, { id: 'x', texto: 'flash', cita: 'nada de flash', fuente: 'plan' }], prohibido: [] }, { brief, manual, plan })
    expect(r.comprobadas).toEqual([{ id: 'm', fuente: 'manual', por: 'cita' }, { id: 'p', fuente: 'plan', por: 'cita' }])
    expect(r.marcadas).toEqual([{ id: 'x', motivo: 'la cita no está en plan: «nada de flash»' }])
  })
  it('🔴 lo que no se puede comprobar se marca con su porqué: campo que no existe, fuente que no llegó, fuente desconocida, gran idea ausente', () => {
    const sinIdea = 'QUÉ ES: foto\nGRAN IDEA: (sin gran idea)\nVISUAL: plato'
    const r = citasExisten({ obligatorio: [
      { id: 'c', texto: 'a', fuente: 'hoja', campo: 'PALETA SECRETA' },
      { id: 'f', texto: 'b', fuente: 'manual', campo: 'paleta' },
      { id: 'd', texto: 'c', fuente: 'el chat', campo: 'algo' },
      { id: 'g', texto: 'd', fuente: 'gran_idea' },
      { id: 'n', texto: 'e', fuente: 'hoja' },
    ], prohibido: [] }, { brief: sinIdea, manual: null })
    expect(r.marcadas).toEqual([
      { id: 'c', motivo: 'el campo «PALETA SECRETA» no está en hoja' },
      { id: 'f', motivo: 'la fuente «manual» no llegó a este encargo' },
      { id: 'd', motivo: 'fuente desconocida «el chat»' },
      { id: 'g', motivo: 'esta pieza no trae gran idea' },
      { id: 'n', motivo: 'dice que sale de hoja pero no nombra el campo ni cita' },
    ])
    expect(r.validas.obligatorio).toHaveLength(5)
    expect(r.comprobadas).toEqual([])
  })
  it('🔴 la cita cuenta SOLO en la fuente que la regla nombra: está en el brief pero la regla dice «manual» → marcada', () => {
    const r = citasExisten({ obligatorio: [{ id: 'q', texto: 'central', cita: 'aparece completo y central', fuente: 'manual' }], prohibido: [] }, { brief, manual, plan })
    expect(r.comprobadas).toEqual([])
    expect(r.marcadas).toEqual([{ id: 'q', motivo: 'la cita no está en manual: «aparece completo y central»' }])
  })
  it('una marca que el agente mande por su cuenta no se confía: la sala la recalcula', () => {
    const r = citasExisten({ obligatorio: [{ id: 'a', texto: 'completo', cita: 'aparece completo', marcada: 'yo misma' }], prohibido: [] }, brief)
    expect(r.validas.obligatorio[0]).toEqual({ id: 'a', texto: 'completo', cita: 'aparece completo', comprobada: 'cita' })
  })
  it('🔴 cuidado 1 de CC6: la regla dice CÓMO se comprobó (cita ≠ campo); un «comprobada» que mande el agente se recalcula; una marcada no lleva «comprobada»', () => {
    const r = citasExisten({ obligatorio: [
      { id: 'c', texto: 'completo', cita: 'aparece completo' },
      { id: 'k', texto: 'x', fuente: 'brief', campo: 'objetivo', comprobada: 'cita' },
      { id: 'm', texto: 'y', cita: 'no existe en ningún lado', comprobada: 'cita' },
    ] as never, prohibido: [] }, 'Objetivo: el plato aparece completo y central')
    expect(r.validas.obligatorio.map((x) => [x.id, x.comprobada, !!x.marcada])).toEqual([['c', 'cita', false], ['k', 'campo', false], ['m', undefined, true]])
    expect(r.comprobadas.map((x) => [x.id, x.por])).toEqual([['c', 'cita'], ['k', 'campo']])
  })
  it('🔴 la tarea de los siguientes avisa cuando una regla está comprobada SOLO por campo (no dice nada de más para las de cita)', () => {
    const t = describirReglas({ obligatorio: [{ id: 'c', texto: 'uno', comprobada: 'cita' }, { id: 'k', texto: 'dos', comprobada: 'campo' }], prohibido: [] })
    expect(t).toContain('[k] dos (comprobada solo por campo: el campo existe en la fuente, no que la regla salga de él)')
    expect(t).toContain('[c] uno\n')
  })
})

describe('derivarDecision (lo calcula la sala, no el agente)', () => {
  it('generada ⇒ hay_generadas y requiere_mirar', () => { expect(derivarDecision('generada')).toEqual({ modo: 'generada', hay_generadas: true, requiere_mirar: true }) })
  it('real con confianza alta no se mira; media sí', () => {
    expect(derivarDecision('real', 'alta').requiere_mirar).toBe(false)
    expect(derivarDecision('real', 'media').requiere_mirar).toBe(true)
  })
  it('ninguna no genera ni mira', () => { expect(derivarDecision('ninguna')).toEqual({ modo: 'ninguna', hay_generadas: false, requiere_mirar: false }) })
})
