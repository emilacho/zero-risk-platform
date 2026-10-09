import { describe, it, expect } from 'vitest'
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
  it('NO pasa el que no cubre un obligatorio', () => {
    const r = chequearPrompts(['Un ceviche en un bowl, luz cálida.'], reglas, propios)
    expect(r.ninguno).toBe(true)
    expect(r.fallan[0].motivos.join(' ')).toMatch(/obligatorio «o1»/)
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
  it('trae parámetros del generador o relación de aspecto', () => {
    expect(chequearPrompts([bueno + ' --ar 4:5'], reglas, propios).fallan[0].motivos.join(' ')).toMatch(/parámetros/)
    expect(chequearPrompts([bueno + ' formato 4:5'], reglas, propios).fallan[0].motivos.join(' ')).toMatch(/relación de aspecto/)
  })
  it('nombra el estilo de una persona real', () => {
    expect(chequearPrompts([bueno + ' Al estilo de Annie Leibovitz.'], reglas, propios).fallan[0].motivos.join(' ')).toMatch(/persona real/)
    expect(chequearPrompts([bueno + ' in the style of Ansel Adams'], reglas, propios).fallan[0].motivos.join(' ')).toMatch(/persona real/)
  })
  it('separa por prompt: de tres, pasan los buenos', () => {
    const r = chequearPrompts([bueno, 'Ceviche sin más.', bueno.replace('natural lateral', 'de ventana')], reglas, propios)
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

describe('citas literales: una regla extraída de un brief de texto debe CITARLO', () => {
  const brief = 'El plato aparece completo y central. Sin personas, sin logo sobre el plato, sin texto quemado. Luz natural.'
  it('acepta la cita que está en el brief (sin importar tildes, mayúsculas ni signos)', () => {
    const r = citasExisten({ obligatorio: [{ id: 'a', texto: 'completo', cita: 'El plato aparece COMPLETO y central' }], prohibido: [{ id: 'b', texto: 'personas', cita: 'sin personas' }] }, brief)
    expect(r.rechazadas).toEqual([]); expect(r.validas.obligatorio).toHaveLength(1)
  })
  it('rechaza la cita inventada y la regla sin cita', () => {
    const r = citasExisten({ obligatorio: [{ id: 'a', texto: 'x', cita: 'El plato debe llevar flores' }], prohibido: [{ id: 'b', texto: 'y' }] }, brief)
    expect(r.rechazadas.map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(r.validas.obligatorio).toHaveLength(0)
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
