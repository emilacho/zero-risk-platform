/**
 * EL CANAL «dashboard · manual» (30-oct · firma de Emilio «DALE A TODO») · lo que el dueño escribe en el manual del dashboard entra por la puerta del dueño como DATO DEL MANUAL por campo:
 * reemplaza al anterior del mismo campo (nada se borra), nunca se acumula y el aprendizaje jamás lo desmenuza. Además, el resumen vivo y la consulta muestran el estado del manual vigente.
 * US$ 0 · base falsa · los diez clientes.
 */
import { describe, expect, it } from 'vitest'
import { campoDelManual, esCanalDelManual, rutaDueno, type DepsDeDueno } from '../dueno'
import { estadoDelManual, leerEstadoDelManual } from '../estado-del-manual'
import { armarResumen } from '../resumen-vivo'
import { procesarAprendizaje } from '../aprendizaje/procesar'
import { crearBaseMini } from '../aprendizaje/__tests__/dbmini'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-dashboard', workflow_execution_id: 'ex-1' }
const montar = (c: ClienteSintetico) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  let n = 0
  const deps: DepsDeDueno = { db: base.db, interruptores: ON, ahora: AHORA, activo: true, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` }
  return { t, deps }
}
const dato = (c: ClienteSintetico, campo: string, valor: string, v: number, o: Record<string, unknown> = {}) => ({
  client_id: c.id, dry_run: false, ...WF, evento: 'respuesta', tema: `manual · ${campo}`, pregunta: campo, respuesta: valor, canal: 'dashboard · manual',
  mensaje_ref: `manual:${c.id}:v${v}:${campo}`, respondido_en: new Date(Date.UTC(2026, 9, 30, 10, v)).toISOString(), preguntado_por: { oficina: 'dashboard', agente: 'emilio' }, ...o,
})
const vigentes = (t: T) => t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && !f.retirada_en)
const retiradas = (t: T) => t.cerebro_fichas.filter((f) => f.clase === 'dato_del_dueno' && f.retirada_en)

describe('el canal «dashboard · manual»', () => {
  it('reconoce el canal y el campo del tema', () => {
    expect(esCanalDelManual('dashboard · manual')).toBe(true)
    expect(esCanalDelManual('Dashboard  ·  Manual')).toBe(true)
    expect(esCanalDelManual('#oficina-creativa')).toBe(false)
    expect(campoDelManual('manual · eslogan')).toBe('eslogan')
    expect(campoDelManual('manual · Frase propia')).toBe('frase-propia')
    expect(campoDelManual('tono de voz')).toBeNull()
  })

  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): el dato del manual reemplaza al anterior del MISMO campo y no toca a los otros campos`, async () => {
      const m = montar(c)
      await rutaDueno(m.deps, dato(c, 'eslogan', 'Sabor de casa', 1))
      await rutaDueno(m.deps, dato(c, 'voz', 'Cercana y directa', 1))
      await rutaDueno(m.deps, dato(c, 'voz de marca', 'Formal', 1)) // otro campo con palabras parecidas: NO reemplaza a «voz»
      const r = await rutaDueno(m.deps, dato(c, 'eslogan', 'Sabor de casa, hecho con cariño', 2))
      expect(r.status).toBe(200)
      expect(r.body).toMatchObject({ guardada: true, reemplaza: expect.any(String) })
      expect(vigentes(m.t).map((f) => f.atributo).sort()).toEqual(['dueno:manual:eslogan', 'dueno:manual:marca-voz', 'dueno:manual:voz'])
      expect(vigentes(m.t).find((f) => f.atributo === 'dueno:manual:eslogan')?.que_es).toContain('hecho con cariño')
      expect(retiradas(m.t)).toHaveLength(1)
      expect(retiradas(m.t)[0].motivo_retirada).toContain('reemplazada')
    })
  }

  it('aunque venga `acumula:true`, un dato del manual no se suma: reemplaza', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, dato(c, 'eslogan', 'Uno', 1, { acumula: true }))
    const r = await rutaDueno(m.deps, dato(c, 'eslogan', 'Dos', 2, { acumula: true }))
    expect(r.body).toMatchObject({ reemplaza: expect.any(String) })
    expect(vigentes(m.t)).toHaveLength(1)
    const f = vigentes(m.t)[0]
    expect((f.provenance_tag as { datos: Record<string, unknown> }).datos).toMatchObject({ manual: { campo: 'eslogan' }, canal: 'dashboard · manual' })
    expect((f.provenance_tag as { datos: Record<string, unknown> }).datos.acumula).toBeUndefined()
    expect(f.titulo).toMatch(/^Manual · /)
  })

  it('el canal del manual sin «manual · <campo>» en el tema se rechaza', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    const r = await rutaDueno(m.deps, dato(c, 'eslogan', 'x', 1, { tema: 'el eslogan' }))
    expect(r.status).toBe(400)
  })

  it('la misma nota reenviada no se duplica; la precedencia de dueño se conserva (origen dueno)', async () => {
    const c = DIEZ_CLIENTES[0]; const m = montar(c)
    await rutaDueno(m.deps, dato(c, 'eslogan', 'Uno', 1))
    const igual = await rutaDueno(m.deps, dato(c, 'eslogan', 'Uno', 1))
    expect(igual.body).toMatchObject({ repetida: true })
    expect(vigentes(m.t)).toHaveLength(1)
    expect(vigentes(m.t)[0]).toMatchObject({ origen: 'dueno', propiedad: 'propia' })
  })

  it('el aprendizaje IGNORA el canal: ni con `acumula` en la ficha se desmenuza ni se llama al modelo', async () => {
    const cid = '823873b9-cdb9-4018-a068-9ad0068c5bda'
    const filas = [{ id: 'm1', client_id: cid, clase: 'dato_del_dueno', observado_en: AHORA.toISOString(), retirada_en: null, descartada: false, provenance_tag: { datos: { acumula: true, respuesta: 'Siempre tono cercano', respondido_en: AHORA.toISOString(), canal: 'dashboard · manual', tema: 'manual · voz' } } }]
    const { db } = crearBaseMini({ clients: [{ id: cid, industry: 'prueba' }], cerebro_fichas: filas, cerebro_ingresos: [], cerebro_aprendizaje_indice: [], cerebro_aprendizaje_catalogo: [] }, { rpc: () => ({ data: [], error: null }) })
    let llamadas = 0
    const r = await procesarAprendizaje({ db: db as never, ahora: () => AHORA, workflowId: 'wf', ejecucionId: 'ex', llamarModelo: async () => { llamadas++; throw new Error('no debía llamarse') }, registrar: async () => ({ ok: true }) } as never, { dry_run: false, client_id: cid, solo: 'desmenuzar' })
    expect(llamadas).toBe(0)
    expect(r.notas_crudas_pendientes).toBe(0)
    expect(r.desmenuzadas).toBe(0)
  })
})

describe('el estado del manual vigente', () => {
  const v = (version: number, validado: boolean, creado = '2026-10-20T10:00:00Z') => ({ id: `b${version}`, version, human_validated: validado, created_at: creado })
  it('toma la versión de mayor número', () => {
    expect(estadoDelManual([v(1, true), v(3, false), v(2, true)])).toMatchObject({ estado: 'propuesta_sin_validar', version: 3, fecha: '2026-10-20' })
    expect(estadoDelManual([v(1, false), v(2, true)])).toMatchObject({ estado: 'validado_por_el_dueno', version: 2 })
    // ADENDA 7: la etiqueta sale de QUIÉN validó (provenance_tag.validado_por), no de que alguien lo marcara
    expect(estadoDelManual([{ ...v(2, true), provenance_tag: { validado_por: 'jefatura' } }])).toMatchObject({ estado: 'validado_por_la_jefatura', version: 2 })
    expect(estadoDelManual([{ ...v(2, true), provenance_tag: { validado_por: 'jefatura' } }])).toMatchObject({ texto: expect.stringContaining('validado por la jefatura') })
    expect(estadoDelManual([{ ...v(2, true), provenance_tag: { validado_por: 'dueno' } }])).toMatchObject({ estado: 'validado_por_el_dueno' })
    expect(estadoDelManual([])).toMatchObject({ estado: 'sin_manual', version: null })
  })
  it('lee de la base y dice cuando no puede', async () => {
    const ok = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [v(2, true)], error: null }) }) }) }) }) }
    expect(await leerEstadoDelManual(ok, 'c')).toMatchObject({ estado: 'validado_por_el_dueno', version: 2 })
    const mal = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }) }
    expect(await leerEstadoDelManual(mal, 'c')).toMatchObject({ estado: 'no_se_pudo_leer' })
    expect(await leerEstadoDelManual({ from: () => { throw new Error('caído') } }, 'c')).toMatchObject({ estado: 'no_se_pudo_leer' })
  })
  it('el resumen vivo lo muestra; sin dato del manual no dice nada (no inventa un hueco)', () => {
    const c = DIEZ_CLIENTES[0]
    const base = { client_id: c.id, nombre: c.nombre, rubro: null, ahora: AHORA, fichas: [], zona: [], sedes: [] }
    const con = armarResumen({ ...base, manual: estadoDelManual([v(2, true, '2026-10-25T10:00:00Z')]) })
    expect(con.texto).toContain('## Manual de marca')
    expect(con.texto).toContain('validado por el dueño (versión 2, 2026-10-25)')
    expect(armarResumen(base).texto).not.toContain('Manual de marca')
    expect(armarResumen(base).huecos).toEqual(con.huecos)
  })
})
