/**
 * 02-nov · ADENDA 1 firmada por Emilio: las secciones nuevas del manual, y la regla «lo que no existe se propone razonando; los datos duros nunca se inventan».
 * Contrato con el tablero: raw/tasks/2026-11-02-CONTRATO-CC1-a-CC6-CC2-secciones-nuevas-del-manual.md. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { renderManualLimpio } from '@/lib/brand-book-render-limpio'
import { CAMPOS, CAMPO_POR_CLAVE, evaluarCompletitud, obligatoriosPara } from '../campos-del-manual'
import { editarManualDelDueno, EDITABLES_DEL_TABLERO } from '../edicion-del-dueno'
import { hojasDeTexto } from '../hechos'
import { armarPedidos, CAMPOS_PROPONIBLES, camposFaltantes } from '../propuesta'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const C = '5c2d2dd5-a49e-4da3-87c3-03b504b734f6'
const SECCIONES: Record<string, { tipo: 'texto' | 'lista'; agente: string }> = {
  tono_por_canal: { tipo: 'lista', agente: 'content-creator' },
  reglas_de_escritura: { tipo: 'lista', agente: 'content-creator' },
  direccion_de_fotografia: { tipo: 'lista', agente: 'creative-director-mesa' },
  uso_del_logo: { tipo: 'lista', agente: 'design-visual-storyteller' },
  jerarquia_tipografica: { tipo: 'lista', agente: 'design-visual-storyteller' },
  historia_y_origen: { tipo: 'texto', agente: 'brand-strategist' },
}
const CLAVES = Object.keys(SECCIONES)

describe('las secciones nuevas · una fila por campo', () => {
  it.each(CLAVES)('🔴 %s vive en el borrador, el dueño la edita y un empleado la propone', (clave) => {
    const c = CAMPO_POR_CLAVE[clave]
    expect(c).toMatchObject({ tipo: SECCIONES[clave].tipo, ruta: clave, editable: true })
    expect(c.columna).toBeUndefined()
    expect(EDITABLES_DEL_TABLERO[clave]).toBe(c)
    expect(CAMPOS_PROPONIBLES[clave]).toMatchObject(SECCIONES[clave])
  })

  it('🔴 no cuentan para el cierre: un manual sin ellas no pasa a incompleto', () => {
    const lleno = Object.fromEntries(obligatoriosPara().map((c) => [c, CAMPO_POR_CLAVE[c].tipo === 'lista' ? ['x'] : 'x']))
    for (const clave of CLAVES) expect(obligatoriosPara()).not.toContain(clave)
    expect(evaluarCompletitud(lleno).completo).toBe(true)
    expect(CAMPOS.filter((c) => c.obligatorio).length).toBe(obligatoriosPara().length)
  })

  it('🔴 el dueño edita una sección nueva y queda con su procedencia', async () => {
    const db = new DbFalsa()
    db.semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, human_validated: false, content_text: JSON.stringify({ brand_book_draft: { mision: 'x' } }) }])
    const r = await editarManualDelDueno(db, { client_id: C, campos: { historia_y_origen: 'Empezó en la playa', uso_del_logo: 'Sobre fondo claro; nunca deformado' }, reviewer: 'emilio' })
    expect(r.ok).toBe(true)
    const v2 = [...db.tablas['client_brand_books']].find((f) => Number(f.version) === 2)!
    const d = (JSON.parse(String(v2.content_text)) as { brand_book_draft: Record<string, unknown> }).brand_book_draft
    expect(d.historia_y_origen).toBe('Empezó en la playa')
    expect(d.uso_del_logo).toEqual(['Sobre fondo claro', 'nunca deformado'])
    expect((d._field_meta as Record<string, Record<string, unknown>>).historia_y_origen).toMatchObject({ fuente: 'dueno' })
  })
})

describe('la regla de Emilio · lo que no existe se propone', () => {
  const pedidos = (campos: string[]) => armarPedidos({ draft: {}, fuentes: [], campos }).pedidos

  it('🔴 si falta, se le pide al empleado que le toca', () => {
    expect(camposFaltantes({})).toEqual(expect.arrayContaining(CLAVES))
    for (const clave of CLAVES) expect(pedidos([clave])[0]).toMatchObject({ agente: SECCIONES[clave].agente, campos: [clave] })
  })

  it('🔴 la orden es proponer razonando, y no devolver vacío por falta de evidencia', () => {
    const t = pedidos(['vision'])[0].task
    expect(t).toMatch(/no lo dejes vacío: proponlo razonando/)
    expect(t).not.toMatch(/Si la evidencia no alcanza/)
    expect(t).not.toMatch(/solo si la evidencia lo sostiene/)
  })

  it.each(CLAVES)('🔴 el chequeo de datos duros también lee %s', (clave) => {
    expect(hojasDeTexto({ [clave]: SECCIONES[clave].tipo === 'lista' ? ['Desde 1987'] : 'Desde 1987' }).map((h) => h.campo)).toEqual([clave])
  })

  it('🔴 los datos duros siguen sin inventarse', () => {
    const t = pedidos(['productos'])[0].task
    for (const dato of ['teléfonos', 'direcciones', 'horarios', 'precios', 'fechas', 'cifras']) expect(t).toContain(dato)
    expect(t).toMatch(/nunca se inventan/)
  })
})

describe('el documento del manual', () => {
  const manual = (extra: Record<string, unknown>) => renderManualLimpio({ cliente: 'X', brand_book: { content_text: JSON.stringify({ brand_book_draft: { mision: 'm', ...extra } }) } } as never)

  it('🔴 con dato, cada sección sale con su título', () => {
    const r = manual({ historia_y_origen: 'Empezó en la playa', tono_por_canal: ['Instagram: cercano'], reglas_de_escritura: ['Tuteo'], direccion_de_fotografia: ['Luz natural'], uso_del_logo: ['Fondo claro'], jerarquia_tipografica: ['Títulos en serif'], vision: 'Llegar lejos', valores: ['Honestidad'], productos: ['Encebollado'], sedes: ['Olón'], nunca_hace: ['Prometer de más'] })
    for (const titulo of ['HISTORIA Y ORIGEN', 'TONO SEGÚN EL CANAL', 'REGLAS DE ESCRITURA', 'DIRECCIÓN DE FOTOGRAFÍA', 'USO DEL LOGO', 'JERARQUÍA TIPOGRÁFICA', 'VISIÓN', 'VALORES', 'PRODUCTOS O SERVICIOS', 'SEDES', 'LO QUE NUNCA DICE NI HACE']) expect(r.texto).toContain(titulo)
  })

  it('🔴 sin dato, las secciones nuevas no salen ni se declaran omitidas; las obligatorias sí se declaran', () => {
    const r = manual({})
    for (const clave of CLAVES) { expect(r.secciones).not.toContain(clave); expect(r.omitidas).not.toContain(clave) }
    for (const clave of ['vision', 'valores', 'productos', 'sedes', 'nunca_hace']) expect(r.omitidas).toContain(clave)
  })
})
