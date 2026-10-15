/**
 * Plan v3 · V4 · `procedencia.v1.1` con VALIDACIÓN real en F8 + el armador de la semilla compacta. Sin red, sin modelo, sin gasto.
 * «La validación falla sin el arreglo»: la prueba de la puerta usa el orquestador REAL de F8; la mutación (sin validar) deja pasar el dato inválido y la prueba lo detecta.
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { abrirConversacion } from '../src/lib/finanzas/conversa/orquestador'
import { MAX_RESUMEN, PROCEDENCIAS, sanearProcedencia, validarProcedencia, type DatoConProcedencia } from '../src/lib/finanzas/conversa/esquemas'
import type { EncargoDeConversa, PuertosDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { aProcedencia, armarSemillaCompacta, PRESUPUESTO_DE_DATOS } from '../src/lib/planeacion/dato-v1/semilla-compacta'
import { crearSnapshot, type FilasDelCatalogo } from '../src/lib/planeacion/dato-v1/catalogo'
import { normalizarDatos } from '../src/lib/planeacion/dato-v1/normalizador'
import type { DatoV1, EntradaCruda } from '../src/lib/planeacion/dato-v1/tipos'
import semilla from '../src/lib/planeacion/catalogo/semilla.json'

const snap = crearSnapshot(semilla as unknown as FilasDelCatalogo)
const AHORA = new Date('2026-10-15T12:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const cliente = { nombre: 'Taller Los Arrayanes', ubicacion: ['Riobamba'], handles: [], dominios: [], telefonos: [], rubro: [] }

describe('V4 · procedencia.v1.1 · validación', () => {
  const v1 = { clave: 'ticket', valor: 12, procedencia: 'medido', fuente: 'ficha' }
  it('un dato v1 sigue siendo válido tal cual (compatibilidad hacia atrás)', () => {
    expect(validarProcedencia([v1]).ok).toBe(true)
  })
  it('v1.1 suma `cerebro` y `hueco` y los campos nuevos opcionales', () => {
    expect([...PROCEDENCIAS]).toEqual(['medido', 'de_ensayo', 'supuesto', 'dueno', 'cerebro', 'hueco'])
    const d = { ...v1, procedencia: 'cerebro', id: 'D3', tipo_id: 'seguidores', medido_en: hace(2), resumen: 'seguidores: 1236', estado: 'trajo', identidad: 'coincide', frescura_h: 2, periodo: { tipo: 'instante' }, alcance: 'cliente', confianza: 'alta' }
    expect(validarProcedencia([d]).ok).toBe(true)
    expect(validarProcedencia([{ ...v1, procedencia: 'hueco' }]).ok).toBe(true)
  })
  it('rechaza con la lista de errores: enum fuera de lista, resumen largo, frescura negativa, tipos', () => {
    const r = validarProcedencia([
      { ...v1, procedencia: 'inventado' }, { ...v1, resumen: 'x'.repeat(MAX_RESUMEN + 1) }, { ...v1, frescura_h: -1 }, { ...v1, estado: 'quizas' },
      { ...v1, identidad: 'tal_vez' }, { ...v1, alcance: 'planeta' }, { ...v1, confianza: 'muy_alta' }, { ...v1, id: 7 }, { clave: '', fuente: 'f', procedencia: 'medido' },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) { expect(r.errores).toHaveLength(9); expect(r.errores.join('|')).toMatch(/procedencia\[0\].*inválida/) }
  })
  it('un resumen de exactamente 160 caracteres es válido', () => {
    expect(validarProcedencia([{ ...v1, resumen: 'x'.repeat(MAX_RESUMEN) }]).ok).toBe(true)
  })
})

describe('V4 · la puerta de F8 VALIDA `semilla.datos` (antes los dejaba pasar)', () => {
  function puertos(): { P: PuertosDeConversa; creados: unknown[] } {
    const creados: unknown[] = []
    const P = {
      async config() { return { estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'enciende' } },
      almacen: {
        async crearEncargo(n: { client_id: string; dry_run: boolean; semilla: unknown }) {
          creados.push(n.semilla)
          const e = { id: 'enc-1', client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, semilla: n.semilla } as unknown as EncargoDeConversa
          return { ok: true as const, encargo: e, nuevo: true }
        },
      },
    } as unknown as PuertosDeConversa
    return { P, creados }
  }
  const abrir = (P: PuertosDeConversa, datos: unknown) => abrirConversacion(P, { client_id: 'cliente-prueba', dry_run: false, semilla: { evento: 'mensaje', datos } })
  it('forma inválida ⇒ 400 con la lista de errores y NADA se crea', async () => {
    const { P, creados } = puertos()
    const r = await abrir(P, [{ clave: 'a', valor: 1, procedencia: 'inventado', fuente: 'f' }, { clave: 'b', fuente: 'f', procedencia: 'medido', resumen: 'x'.repeat(200) }])
    expect(r.status).toBe(400)
    expect((r.cuerpo.errores as string[]).length).toBe(2)
    expect(creados).toHaveLength(0)
  })
  it('una semilla con datos v1.1 válidos abre; una sin `datos` también (como hoy)', async () => {
    const a = puertos()
    expect((await abrir(a.P, [{ clave: 'a', valor: 1, procedencia: 'hueco', fuente: 'f' }])).status).toBe(200)
    const b = puertos()
    expect((await abrirConversacion(b.P, { client_id: 'c', dry_run: false, semilla: { evento: 'mensaje' } })).status).toBe(200)
  })
  it('`datos` que no es una lista ⇒ 400', async () => {
    const { P } = puertos()
    expect((await abrir(P, { clave: 'a' })).status).toBe(400)
  })
  it('el 413 sigue mandando antes (semilla enorme)', async () => {
    const { P } = puertos()
    expect((await abrirConversacion(P, { client_id: 'c', dry_run: false, semilla: { ficha_resumen: 'x'.repeat(41_000) } })).status).toBe(413)
  })
})

describe('V4 · sanearProcedencia queda como red', () => {
  const d = (p: DatoConProcedencia['procedencia'], extra: Partial<DatoConProcedencia> = {}): DatoConProcedencia => ({ clave: 'k', valor: 5, procedencia: p, fuente: 'f', ...extra })
  it('un hueco NO lleva valor: no puede ser base de cálculo (y jamás se promociona)', () => {
    const [h] = sanearProcedencia([d('hueco', { valor: 99 })], false)
    expect(h).toMatchObject({ procedencia: 'hueco', valor: null })
  })
  it('un dato «medido» o «cerebro» de otro negocio o sin comprobar baja a hueco; con estado que no es lectura también', () => {
    expect(sanearProcedencia([d('medido', { identidad: 'no_coincide' })], false)[0]).toMatchObject({ procedencia: 'hueco', valor: null })
    expect(sanearProcedencia([d('cerebro', { identidad: 'no_comprobable' })], false)[0].procedencia).toBe('hueco')
    expect(sanearProcedencia([d('medido', { estado: 'registro_sin_campos' })], false)[0].procedencia).toBe('hueco')
    expect(sanearProcedencia([d('medido', { estado: 'vacio_declarado', valor: 0 })], false)[0]).toMatchObject({ procedencia: 'medido', valor: 0 })
  })
  it('lo de siempre: ensayo ⇒ supuesto; corrida de ensayo rebaja medido y cerebro', () => {
    expect(sanearProcedencia([d('de_ensayo')], false)[0].procedencia).toBe('supuesto')
    expect(sanearProcedencia([d('medido'), d('cerebro')], true).map((x) => x.procedencia)).toEqual(['supuesto', 'supuesto'])
    expect(sanearProcedencia([d('medido')], false)[0].procedencia).toBe('medido')
  })
})

describe('V4 · la semilla compacta', () => {
  const entrada = (e: Partial<EntradaCruda> & Pick<EntradaCruda, 'fuente_id' | 'tipo_id'>): EntradaCruda =>
    ({ estado: 'trajo', medido_en: hace(1), via: e.fuente_id === 'cerebro_vivo' ? 'cerebro' : 'crudo', identidad: e.fuente_id === 'cerebro_vivo' ? { via: 'portero' } : { via: 'consulta_propia' }, ...e }) as EntradaCruda
  const norm = (es: EntradaCruda[]): DatoV1[] => normalizarDatos(es, { ahora: AHORA, cliente, pais: 'EC' }, snap).datos

  it('por dato solo viajan id, tipo_id, procedencia, medido_en, valor normalizado y resumen ≤ 160; un hueco viaja SIN valor', () => {
    const datos = norm([
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'seguidores', contenido: 1236 }),
      entrada({ fuente_id: 'biblioteca_anuncios', tipo_id: 'anuncios_activos', items_count: 1, contenido: null, campos: {} }),
    ])
    const s = armarSemillaCompacta(datos, { snapshot: snap })
    expect(s.datos).toHaveLength(2)
    expect(s.datos[0]).toMatchObject({ id: 'D1', tipo_id: 'seguidores', procedencia: 'medido', valor: { numero: 1236 }, estado: 'trajo', identidad: 'coincide' })
    expect(s.datos[0].resumen!.length).toBeLessThanOrEqual(MAX_RESUMEN)
    expect(s.datos[1]).toMatchObject({ id: 'D2', procedencia: 'hueco', valor: null })
    expect(validarProcedencia(s.datos).ok).toBe(true)
    expect(s.nota).toBe('datos_omitidos: 0')
  })
  it('no viaja el contenido completo: un texto largo sale como resumen corto', () => {
    const largo = 'muebles de madera a medida '.repeat(60)
    const [d] = norm([entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'texto_sitio', contenido: largo })])
    const p = aProcedencia(d)
    expect(p.resumen!.length).toBeLessThanOrEqual(MAX_RESUMEN)
    expect(JSON.stringify(p).length).toBeLessThan(900)
  })
  it('bajo presión: entran los CRÍTICOS y MEDIDOS primero, se declara datos_omitidos con sus ids y el resultado cabe', () => {
    const muchos: EntradaCruda[] = [
      ...Array.from({ length: 400 }, (_, i) => entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'texto_sitio', contenido: `línea ${i} del sitio con un texto razonablemente largo para ocupar espacio en la semilla` })),
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'precio', atributo: 'precio:silla', contenido: '45', moneda: 'USD' }),
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'seguidores', contenido: 1000 }),
    ]
    const datos = norm(muchos)
    const idPrecio = datos.find((d) => d.tipo_id === 'precio')!.id
    const idSeg = datos.find((d) => d.tipo_id === 'seguidores')!.id
    const s = armarSemillaCompacta(datos, { snapshot: snap })
    expect(JSON.stringify(s.datos).length).toBeLessThanOrEqual(PRESUPUESTO_DE_DATOS)
    expect(s.datos_omitidos).toBeGreaterThan(0)
    expect(s.omitidos.length).toBe(s.datos_omitidos)
    expect(s.datos.map((x) => x.id)).toContain(idPrecio)
    expect(s.datos.map((x) => x.id)).toContain(idSeg)
    expect(s.omitidos).not.toContain(idPrecio)
    expect(s.datos.length + s.datos_omitidos).toBe(datos.length)
    expect(s.nota).toMatch(/^datos_omitidos: \d+ \(D\d+/)
    // los ids NO cambian: la cita [D#] sigue siendo la misma
    for (const x of s.datos) expect(datos.find((d) => d.id === x.id)).toBeTruthy()
  })
  it('sin la regla de prioridad un crítico se perdería: el orden por críticos es el que lo salva (mutación)', () => {
    const muchos: EntradaCruda[] = [
      ...Array.from({ length: 400 }, (_, i) => entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'texto_sitio', contenido: `línea ${i} del sitio con un texto razonablemente largo para ocupar espacio en la semilla` })),
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'precio', atributo: 'precio:silla', contenido: '45', moneda: 'USD' }),
    ]
    const datos = norm(muchos)
    const idPrecio = datos.find((d) => d.tipo_id === 'precio')!.id
    // sin snapshot no se conoce lo crítico: el precio (último) cae igual que el resto de lo «medido» por id ⇒ se omite
    const ciego = armarSemillaCompacta(datos, {})
    const informado = armarSemillaCompacta(datos, { snapshot: snap })
    expect(ciego.omitidos).toContain(idPrecio)
    expect(informado.omitidos).not.toContain(idPrecio)
  })
  it('todo lo que el armador emite pasa la validación de la puerta de F8 (el circuito cierra)', () => {
    const datos = norm([
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'seguidores', contenido: 10 }),
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'direccion', contenido: 'Calle 1', origen_ficha: 'dueno' }),
      entrada({ fuente_id: 'cerebro_vivo', tipo_id: 'puntaje_resenas', contenido: 6 }),
    ])
    expect(validarProcedencia(armarSemillaCompacta(datos, { snapshot: snap }).datos).ok).toBe(true)
  })
})
