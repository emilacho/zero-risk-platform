/**
 * JEFATURA · el corrector de lengua (`spell-check-corrector`, Haiku) como corrección DURA (31-oct, decisión de Emilio).
 * El paso `revision_lengua` existe SOLO si la política del tipo declara `tope_paso_usd.revision_lengua` y el tipo tiene re-entrega (es dato, no código).
 * Sus fichas nacen con origen `jefe` y gravedad `bloquea`: las toma la corrección del productor que ya existe. GPT sigue siendo solo opinión. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { plantillaDePolitica, tieneRevisionDeLengua, REVISOR_DE_LENGUA } from '../src/lib/jefatura/revision/politicas'
import { almacenEnMemoria, correr, FILAS_DE_POLITICA, politica, puertosDePrueba, sobre } from './_helpers/jefatura-revision'

const TOPES_PIEZA = { revision_fondo: 0.4, revision_lengua: 0.05, correccion: 0.3, segunda_mirada: 0.15, decision: 0.2 }
const conLengua = (tipo: 'pieza' | 'brief' = 'pieza') => ({ ...FILAS_DE_POLITICA, [tipo]: { ...FILAS_DE_POLITICA[tipo], tope_paso_usd: TOPES_PIEZA } })

describe('la plantilla: el paso de lengua es dato', () => {
  it('sin la clave en la política, la plantilla es la de siempre (ningún paso nuevo)', () => {
    const p = politica('pieza')
    expect(tieneRevisionDeLengua(p)).toBe(false)
    expect(plantillaDePolitica(p, p.productores, 1).pasos.map((x) => x.clave)).not.toContain('revision_lengua')
  })
  it('con la clave: va justo después del fondo, lo hace el corrector, con su tope, y antes de la corrección del productor', () => {
    const p = politica('pieza', { tope_paso_usd: TOPES_PIEZA })
    const claves = plantillaDePolitica(p, p.productores, 1).pasos.map((x) => x.clave)
    expect(claves.slice(0, 3)).toEqual(['revision_fondo', 'revision_lengua', 'correccion:content-creator'])
    const paso = plantillaDePolitica(p, p.productores, 1).pasos[1]
    expect(paso.quien).toBe(REVISOR_DE_LENGUA)
    expect(paso.tope_usd).toBe(0.05)
    expect(paso.ronda).toBe(1)
    expect(paso.salida?.esquema).toBe('fichas.v1')
  })
  it('un tipo sin re-entrega (brief) no lo tiene aunque declare la clave: no habría quién reciba la corrección', () => {
    const p = politica('brief', { tope_paso_usd: TOPES_PIEZA })
    expect(tieneRevisionDeLengua(p)).toBe(false)
    expect(plantillaDePolitica(p, p.productores, 1).pasos.map((x) => x.clave)).not.toContain('revision_lengua')
  })
})

describe('la corrida (seco, moldes)', () => {
  it('sin la clave: la corrida no llama al corrector', async () => {
    const { P } = puertosDePrueba()
    const c = await correr(P, sobre('pieza', { id: 'pz-sin', simulacion: { fichas: 'ninguna' } }))
    expect(c.turnos.map((t) => t.agente)).not.toContain(REVISOR_DE_LENGUA)
  })
  it('con la clave: el corrector entra una vez, con la cabecera que evita el editor, y su pedido no pide tocar contenido ni estilo', async () => {
    const { P } = puertosDePrueba({ almacen: almacenEnMemoria({ filas: conLengua(), activas: ['pieza'] }) })
    const c = await correr(P, sobre('pieza', { id: 'pz-len', simulacion: { fichas: 'ninguna' } }))
    const t = c.turnos.filter((x) => x.agente === REVISOR_DE_LENGUA)
    expect(t).toHaveLength(1)
    expect(t[0].paso).toBe('revision_lengua')
    expect((t[0].pedido as { headers_requeridos: Record<string, string> }).headers_requeridos['x-skip-editor-middleware']).toBe('1')
    const task = String((t[0].pedido as { task: string }).task)
    expect(task).toMatch(/ortografía, gramática y puntuación propias del idioma/)
    expect(task).toMatch(/No cambies el contenido, el estilo ni la voz/)
    expect(task).toMatch(/tú, vos o usted/)
    expect(c.turnos.map((x) => x.paso).indexOf('revision_lengua')).toBe(c.turnos.map((x) => x.paso).indexOf('revision_fondo') + 1)
  })
  it('una ficha de lengua que bloquea llega a la corrección del productor (no se queda sin dueño)', async () => {
    const { P } = puertosDePrueba({ almacen: almacenEnMemoria({ filas: conLengua(), activas: ['pieza'] }) })
    const ficha = JSON.stringify({ fichas: [{ que: 'falta la tilde en «mas»', donde: 'texto', contra_que: 'ortografía', gravedad: 'bloquea', propuesta: 'más' }] })
    const c = await correr(P, sobre('pieza', { id: 'pz-len2', simulacion: { fichas: 'ninguna', toma: 'todo' } }), (t) => (t.paso === 'revision_lengua' ? { texto: ficha } : undefined))
    const pasos = c.turnos.map((x) => x.paso)
    expect(pasos).toContain('correccion:content-creator')
    const corr = c.turnos.find((x) => x.paso === 'correccion:content-creator')!
    expect(String((corr.pedido as { task: string }).task)).toContain('falta la tilde en «mas»')
  })
  it('una ficha de lengua que es solo sugerencia no dispara corrección', async () => {
    const { P } = puertosDePrueba({ almacen: almacenEnMemoria({ filas: conLengua(), activas: ['pieza'] }) })
    const ficha = JSON.stringify({ fichas: [{ que: 'coma opcional', donde: 'texto', contra_que: 'puntuación', gravedad: 'sugerencia', propuesta: ',' }] })
    const c = await correr(P, sobre('pieza', { id: 'pz-len3', simulacion: { fichas: 'ninguna' } }), (t) => (t.paso === 'revision_lengua' ? { texto: ficha } : undefined))
    expect(c.turnos.map((x) => x.paso)).not.toContain('correccion:content-creator')
  })
})
