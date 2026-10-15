/**
 * Plan v3 · V10 · refresco y envejecimiento (§8.2). Los tres casos de la tabla del diseño + N1–N3, con reloj simulado. PURO, US$ 0.
 *   1 · corrida larga: `recolectado_en` en el encabezado y aviso pasado `limite_entrega_h`;
 *   2 · refresco idempotente por fuente: re-pide solo lo vencido / hueco / ausente y reutiliza el planteo fijado;
 *   3 · cambio material (solo con la fila del tipo): nueva ronda (máx. 2 en total) o bloque conservado «sobre datos del [fecha]»;
 *   + manual distinto. Mutaciones: quitar la regla del catálogo = hoy; operador que siempre dice «material»; ignorar el máximo de rondas.
 */
import { describe, expect, it } from 'vitest'
import { crearSnapshot, type FilasDelCatalogo } from '../src/lib/planeacion/dato-v1/catalogo'
import { normalizarDatos } from '../src/lib/planeacion/dato-v1/normalizador'
import { huellaDeInsumos, OPERADORES_DE_REFRESCO, planificarRefresco, RONDAS_MAXIMAS_DE_LA_OFICINA, type OperadoresDeRefresco } from '../src/lib/planeacion/dato-v1/refresco'
import type { DatoV1, EntradaCruda } from '../src/lib/planeacion/dato-v1/tipos'
import semilla from '../src/lib/planeacion/catalogo/semilla.json'

const F = semilla as unknown as FilasDelCatalogo
const snap = crearSnapshot(F)
const T0 = new Date('2026-10-15T12:00:00Z')
const cliente = { nombre: 'Taller Los Arrayanes', ubicacion: ['Riobamba'], handles: [], dominios: [], telefonos: [], rubro: [] }
const hace = (base: Date, h: number) => new Date(base.getTime() - h * 3_600_000).toISOString()
const E = (e: Partial<EntradaCruda> & Pick<EntradaCruda, 'fuente_id' | 'tipo_id'>, medido_en: string): EntradaCruda =>
  ({ estado: 'trajo', medido_en, via: e.fuente_id === 'cerebro_vivo' ? 'cerebro' : 'crudo', identidad: e.fuente_id === 'cerebro_vivo' ? { via: 'portero' } : { via: 'consulta_propia' }, ...e }) as EntradaCruda
const norm = (es: EntradaCruda[], ahora = T0): DatoV1[] => normalizarDatos(es, { ahora, cliente, pais: 'EC' }, snap).datos
const crudo = (tipo: string, valor: number | string, h: number, fuente = 'mapas_ficha', ahora = T0): EntradaCruda =>
  E({ fuente_id: fuente, tipo_id: tipo, contenido: valor, campos: fuente === 'mapas_ficha' ? { title: 't', totalScore: 1, reviewsCount: 1 } : fuente === 'instagram_perfil' ? { username: 'u', followersCount: 1 } : {}, ...(fuente === 'cerebro_vivo' ? {} : {}) }, hace(ahora, h))

describe('V10 · 1 · corrida larga: recolectado_en y límite de entrega', () => {
  const previos = norm([crudo('puntaje_resenas', 4.8, 3), crudo('seguidores', 1236, 3, 'instagram_perfil')])
  it('el encabezado lleva la fecha de recolección (la más reciente que sostiene el plan), puesta por código', () => {
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: [], rondas_de_oficina_usadas: 0 })
    expect(p.recolectado_en).toBe(hace(T0, 3))
    expect(p.encabezado).toBe('datos al 2026-10-15 09:00 UTC')
    expect(p.vencido_para_entregar).toBe(false)
  })
  it('pasado `limite_entrega_h` del catálogo (6 h) avisa: «sobre datos del …»', () => {
    const tarde = new Date(T0.getTime() + 5 * 3_600_000) // 8 h después de la recolección
    const p = planificarRefresco({ snapshot: snap, ahora: tarde, previos, nuevos: [], rondas_de_oficina_usadas: 0 })
    expect(p.vencido_para_entregar).toBe(true)
    expect(p.declara.join(' ')).toMatch(/hace 8 h .*más de 6 h.*datos del 2026-10-15/)
  })
  it('el límite es FILA del catálogo: con otra fila cambia sin tocar código', () => {
    const corto = crearSnapshot({ ...F, reglas: F.reglas.map((r) => (r.regla_id === 'param_limite_entrega_h' ? { ...r, parametros: { horas: 1 } } : r)) })
    expect(planificarRefresco({ snapshot: corto, ahora: T0, previos, nuevos: [], rondas_de_oficina_usadas: 0 }).vencido_para_entregar).toBe(true)
  })
  it('sin datos con fecha no inventa una', () => {
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos: [], nuevos: [], rondas_de_oficina_usadas: 0 })
    expect(p.recolectado_en).toBeNull()
    expect(p.encabezado).toMatch(/sin fecha/)
  })
})

describe('V10 · 2 · refresco IDEMPOTENTE por fuente', () => {
  const previos = norm([
    crudo('puntaje_resenas', 4.8, 24 * 20),                                  // mapas · medido hace 20 d (límite 7 d ⇒ vencido)
    crudo('seguidores', 1236, 2, 'instagram_perfil'),                        // instagram · fresco
    E({ fuente_id: 'biblioteca_anuncios', tipo_id: 'anuncios_activos', items_count: 1, contenido: null, campos: {} }, hace(T0, 2)), // hueco
  ])
  const p = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: [], rondas_de_oficina_usadas: 0, tipos_requeridos: ['puntaje_resenas', 'seguidores', 'anuncios_activos', 'visitas_periodo'] })
  it('re-pide SOLO lo vencido, lo que estaba en hueco y lo que falta', () => {
    const por = Object.fromEntries(p.repedir.map((r) => [r.fuente_id, r]))
    expect(por.mapas_ficha).toMatchObject({ motivo: 'vencido' })
    expect(por.mapas_ficha.tipos).toContain('puntaje_resenas')
    expect(por.biblioteca_anuncios).toMatchObject({ motivo: 'hueco' })
    expect(por.analitica_dominio).toMatchObject({ motivo: 'ausente' })
  })
  it('lo vigente NO se vuelve a pedir y el planteo fijado se reutiliza', () => {
    expect(p.repedir.map((r) => r.fuente_id)).not.toContain('instagram_perfil')
    expect(p.reutiliza).toContain('instagram_perfil')
    expect(p.reutiliza_planteo_fijado).toBe(true)
  })
  it('idempotente: pedir dos veces con los mismos datos da el mismo plan', () => {
    const q = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: [], rondas_de_oficina_usadas: 0, tipos_requeridos: ['puntaje_resenas', 'seguidores', 'anuncios_activos', 'visitas_periodo'] })
    expect(JSON.stringify(q)).toBe(JSON.stringify(p))
  })
  it('después del refresco de lo vencido ya no queda nada por re-pedir de esa fuente', () => {
    const nuevos = norm([crudo('puntaje_resenas', 4.8, 1)])
    const q = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 0, tipos_requeridos: ['puntaje_resenas', 'seguidores'] })
    expect(q.repedir).toEqual([])
  })
})

describe('V10 · 3 · cambio material: nueva ronda o bloque conservado', () => {
  const previos = norm([crudo('seguidores', 1000, 30, 'instagram_perfil'), crudo('puntaje_resenas', 4.8, 30)])
  it('un cambio que la fila del tipo llama material ⇒ nueva ronda de la oficina', () => {
    const nuevos = norm([crudo('seguidores', 1200, 1, 'instagram_perfil')]) // +20 % (regla: > 5 %)
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 1 })
    expect(p.cambios_materiales).toEqual([{ tipo_id: 'seguidores', atributo: null, antes: 1000, despues: 1200, regla: 'cambio_material_seguidores' }])
    expect(p.nueva_ronda).toBe(true)
    expect(p.conserva_bloque).toBe(false)
  })
  it('un cambio que NO llega al umbral no cambia nada: el bloque se conserva y el plan lo declara', () => {
    const nuevos = norm([crudo('seguidores', 1020, 1, 'instagram_perfil')]) // +2 %
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 0 })
    expect(p.cambios_materiales).toEqual([])
    expect(p.nueva_ronda).toBe(false)
    expect(p.conserva_bloque).toBe(true)
    expect(p.declara.join(' ')).toMatch(/el bloque se conserva: sobre datos del 2026-10-1\d/)
  })
  it('máximo 2 rondas en total: con las 2 usadas, aun con cambio material se CONSERVA y lo dice', () => {
    const nuevos = norm([crudo('seguidores', 5000, 1, 'instagram_perfil')])
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: RONDAS_MAXIMAS_DE_LA_OFICINA })
    expect(p.cambios_materiales).toHaveLength(1)
    expect(p.nueva_ronda).toBe(false)
    expect(p.conserva_bloque).toBe(true)
    expect(p.declara.join(' ')).toMatch(/ya se usaron las 2 rondas/)
  })
  it('un tipo SIN fila de cambio material no dispara nada (la regla es del tipo, no del código)', () => {
    const pr = norm([E({ fuente_id: 'cerebro_vivo', tipo_id: 'direccion', contenido: 'Calle 1' }, hace(T0, 30))])
    const nu = norm([E({ fuente_id: 'cerebro_vivo', tipo_id: 'direccion', contenido: 'Calle 99' }, hace(T0, 1))])
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos: pr, nuevos: nu, rondas_de_oficina_usadas: 0 })
    expect(p.cambios_materiales).toEqual([])
    expect(p.nueva_ronda).toBe(false)
  })
  it('N2 · si la huella de los insumos no cambió, no hay nueva ronda aunque haya una lectura nueva', () => {
    const nuevos = norm([crudo('seguidores', 1200, 1, 'instagram_perfil')])
    const sinCambio = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 0 })
    const igual = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 0, insumos_huella_previa: sinCambio.insumos_huella })
    expect(sinCambio.nueva_ronda).toBe(true)
    expect(igual.nueva_ronda).toBe(false)
  })
  it('la huella de insumos no depende del orden de llegada y SÍ de los valores', () => {
    const d = norm([crudo('seguidores', 1000, 2, 'instagram_perfil'), crudo('puntaje_resenas', 4.8, 2)])
    expect(huellaDeInsumos([...d].reverse())).toBe(huellaDeInsumos(d))
    expect(huellaDeInsumos(norm([crudo('seguidores', 1001, 2, 'instagram_perfil'), crudo('puntaje_resenas', 4.8, 2)]))).not.toBe(huellaDeInsumos(d))
  })
})

describe('V10 · el manual cambió entre medio (N3)', () => {
  it('avisa con la versión usada; con la misma versión no dice nada', () => {
    const previos = norm([crudo('puntaje_resenas', 4.8, 2)])
    const a = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: [], rondas_de_oficina_usadas: 0, manual: { version_usada: 3, version_actual: 4 } })
    expect(a.declara.join(' ')).toMatch(/manual cambió.*versión 3.*vigente es la 4/)
    const b = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: [], rondas_de_oficina_usadas: 0, manual: { version_usada: 4, version_actual: 4 } })
    expect(b.declara.join(' ')).not.toMatch(/manual/)
  })
})

describe('V10 · reversa y mutaciones', () => {
  const previos = norm([crudo('seguidores', 1000, 30, 'instagram_perfil')])
  const nuevos = norm([crudo('seguidores', 5000, 1, 'instagram_perfil')])
  it('quitar la regla del catálogo = hoy: sin fila de cambio material no hay nueva ronda', () => {
    const sinRegla = crearSnapshot({ ...F, reglas: F.reglas.filter((r) => r.clase !== 'cambio_material') })
    const p = planificarRefresco({ snapshot: sinRegla, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 0 })
    expect(p.cambios_materiales).toEqual([])
    expect(p.nueva_ronda).toBe(false)
    expect(planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 0 }).nueva_ronda).toBe(true)
  })
  it('muere: un operador que siempre dice «material» cambia el resultado donde NO hay cambio', () => {
    const siempre: OperadoresDeRefresco = { esMaterial: () => true }
    const casi = norm([crudo('seguidores', 1001, 1, 'instagram_perfil')])
    expect(planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: casi, rondas_de_oficina_usadas: 0 }, OPERADORES_DE_REFRESCO).nueva_ronda).toBe(false)
    expect(planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos: casi, rondas_de_oficina_usadas: 0 }, siempre).nueva_ronda).toBe(true)
  })
  it('muere: sin el tope de rondas la tercera vuelta SÍ se haría; con él, no', () => {
    const p = planificarRefresco({ snapshot: snap, ahora: T0, previos, nuevos, rondas_de_oficina_usadas: 2 })
    expect(p.nueva_ronda).toBe(false)
    expect(RONDAS_MAXIMAS_DE_LA_OFICINA).toBe(2)
  })
})
