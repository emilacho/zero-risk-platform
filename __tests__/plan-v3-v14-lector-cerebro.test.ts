/**
 * Plan v3 · V14 · el lector del cerebro: fichas vivas → `dato.v1`, y el crudo por la MISMA compuerta del `portero`. Solo lee. Base falsa en memoria, US$ 0.
 * Caso de oro del cerebro del piloto (CC#3, 15-oct): 169 vivas, 143 sin atributo — sitio 75 · mención 23 · precio 16 · reseñas 16 · videos 15 · comentarios 10 · mapas 5 · instagram 5 · horario 4.
 * Tres rubros en las pruebas del crudo (clínica, taller, software): el mismo código, solo cambian datos.
 */
import { describe, expect, it } from 'vitest'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { ALTA, CASOS, tablas } from '../src/lib/portero-alimenta/__tests__/fixtures-despertar'
import { crearSnapshot, type FilasDelCatalogo } from '../src/lib/planeacion/dato-v1/catalogo'
import { COLUMNAS_DE_FICHA, crudoAEntradas, faltantesDeLasVias, fichasAEntradas, leerCrudo, leerFichasVivas, tipoDe } from '../src/lib/planeacion/dato-v1/lector-cerebro'
import { normalizarDatos } from '../src/lib/planeacion/dato-v1/normalizador'
import { planificarRelleno } from '../src/lib/planeacion/dato-v1/relleno'
import type { EntradaCruda } from '../src/lib/planeacion/dato-v1/tipos'
import semilla from '../src/lib/planeacion/catalogo/semilla.json'
import type { FilaCruda } from '../src/lib/portero-alimenta/unidades'

const snap = crearSnapshot(semilla as unknown as FilasDelCatalogo)
const AHORA = new Date('2026-10-15T15:00:00Z')
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
type F = Record<string, unknown>
let n = 0
const ficha = (o: F): F => ({ id: `f-${String(++n).padStart(4, '0')}`, clase: 'sitio', atributo: null, titulo: 'sitio · linea', que_es: 'una línea del sitio', contenido: 'una linea del sitio', origen: 'su_fuente', observado_en: hace(5), fecha_fuente: null, vigente_hasta: null, retirada_en: null, reemplazada_por: null, descartada: false, prueba: false, fuente_url: 'https://ejemplo.test/', juzgado_por: 'sistema', propiedad: 'propia', huella: `h${n}`, provenance_tag: null, creado_en: hace(5), ...o })
const veces = (k: number, mk: (i: number) => F) => Array.from({ length: k }, (_, i) => ficha(mk(i)))

// ───────────────────────────────────────────────────────── el caso de oro del piloto (CC#3)
function oroDelPiloto(): F[] {
  return [
    ...veces(75, (i) => ({ clase: 'sitio', que_es: `línea ${i} del sitio`, contenido: `linea ${i} del sitio` })),
    ...veces(23, (i) => ({ clase: 'mencion', origen: 'tercero', propiedad: 'ajena', que_es: `mención ${i}` })),
    ...veces(16, (i) => ({ clase: 'precio', atributo: `precio:producto ${String.fromCharCode(97 + i)}`, que_es: `producto ${String.fromCharCode(97 + i)}`, contenido: `producto ${String.fromCharCode(97 + i)} ${10 + i} usd` })),
    ...veces(16, (i) => ({ clase: 'resenas', origen: 'tercero', propiedad: 'ajena', que_es: `reseña ${i}` })),
    ...veces(15, (i) => ({ clase: 'videos', que_es: `video ${i}` })),
    ...veces(10, (i) => ({ clase: 'comentarios', origen: 'tercero', propiedad: 'ajena', que_es: `comentario ${i}` })),
    ...['nombre', 'categoria', 'ciudad', 'direccion', 'horario'].map((a) => ficha({ clase: 'mapas', atributo: `mapas:${a}`, que_es: `mapas ${a}`, contenido: `mapas ${a}` })),
    ficha({ clase: 'instagram', atributo: 'instagram:bio', que_es: 'bio del perfil' }),
    ...veces(4, (i) => ({ clase: 'instagram', que_es: `publicación ${i}` })),
    ...veces(4, (i) => ({ clase: 'horario', atributo: `horario:dia ${i}`, que_es: `horario dia ${i}` })),
  ]
}

describe('V14 · el caso de oro del piloto (169 fichas vivas)', () => {
  const oro = oroDelPiloto()
  const r = fichasAEntradas(oro, snap)
  it('son 169 y se mapean 137: sitio, menciones, reseñas, precios, horarios del sitio, dirección, horario de Mapas y bio', () => {
    expect(oro).toHaveLength(169)
    expect(r.resumen.fichas_leidas).toBe(169)
    expect(r.resumen.mapeadas).toBe(137)
    expect(r.entradas).toHaveLength(137)
    const por = (t: string) => r.entradas.filter((e) => e.tipo_id === t).length
    expect(por('texto_sitio')).toBe(75)
    expect(por('menciones')).toBe(23)
    expect(por('resenas_texto')).toBe(16)
    expect(por('precio')).toBe(16)
    expect(por('horario_sitio')).toBe(4)
    expect(por('direccion')).toBe(1)
    expect(por('horario')).toBe(1)
    expect(por('bio_red')).toBe(1)
  })
  it('lo que no tiene tipo en el catálogo se CUENTA por clase (no se pierde en silencio)', () => {
    expect(r.resumen.sin_tipo).toEqual({ videos: 15, comentarios: 10, instagram: 4, mapas: 3 })
    const total = r.resumen.mapeadas + Object.values(r.resumen.sin_tipo).reduce((a, b) => a + b, 0)
    expect(total).toBe(169)
  })
  it('entra a V2 sin romper: todo con identidad del portero, vía cerebro, fecha de observación', () => {
    const p = normalizarDatos(r.entradas, { ahora: AHORA, cliente: { nombre: 'X', ubicacion: [], handles: [], dominios: [], telefonos: [], rubro: [] }, pais: 'EC' }, snap)
    expect(p.datos).toHaveLength(137 - p.repetidas)
    expect(p.datos.every((d) => d.identidad.estado === 'coincide' && d.via === 'cerebro')).toBe(true)
    expect(p.datos.filter((d) => d.tipo_id === 'precio').every((d) => d.valor.numero !== undefined && d.valor.moneda === 'USD' && d.origen === 'supuesto')).toBe(true) // moneda por país ⇒ supuesto rotulado (G3)
  })
})

describe('V14 · ficha viva y anomalías', () => {
  it('la definición del portero: retirada, descartada o de prueba NO entran (aunque la consulta las dejara pasar)', () => {
    const fs = [ficha({ clase: 'sitio' }), ficha({ retirada_en: hace(1) }), ficha({ descartada: true }), ficha({ prueba: true })]
    const r = fichasAEntradas(fs, snap)
    expect(r.entradas).toHaveLength(1)
    expect(r.resumen.descartadas).toBe(3)
  })
  it('D4 · dos vivas del mismo atributo: manda la más nueva por creado_en y la otra se declara reemplazada', () => {
    const vieja = ficha({ clase: 'precio', atributo: 'precio:silla', contenido: 'silla 40 usd', creado_en: hace(48), id: 'a-vieja' })
    const nueva = ficha({ clase: 'precio', atributo: 'precio:silla', contenido: 'silla 45 usd', creado_en: hace(2), id: 'b-nueva' })
    const r = fichasAEntradas([vieja, nueva], snap)
    expect(r.entradas).toHaveLength(1)
    expect(r.entradas[0].contenido).toBe(45)
    expect(r.resumen.reemplazadas).toEqual([{ ficha_id: 'a-vieja', atributo: 'precio:silla' }])
  })
  it('anomalía · reemplazada_por con retirada_en nulo ⇒ rechazado + aviso (nunca dato)', () => {
    const r = fichasAEntradas([ficha({ clase: 'precio', atributo: 'precio:silla', reemplazada_por: 'otra-id', id: 'raro' })], snap)
    expect(r.resumen.anomalias).toEqual([{ ficha_id: 'raro', motivo: 'reemplazada_por sin retirada_en' }])
    expect(r.entradas[0].estado).toBe('rechazado')
    const d = normalizarDatos(r.entradas, { ahora: AHORA, cliente: { nombre: 'X', ubicacion: [], handles: [], dominios: [], telefonos: [], rubro: [] } }, snap).datos[0]
    expect(d).toMatchObject({ origen: 'hueco', citable: false })
  })
})

describe('V14 · qué se cita y de dónde sale el valor', () => {
  const cli = { nombre: 'X', ubicacion: [], handles: [], dominios: [], telefonos: [], rubro: [] }
  const norm = (es: EntradaCruda[]) => normalizarDatos(es, { ahora: AHORA, cliente: cli, pais: 'EC' }, snap).datos
  it('un texto NO cita `contenido` (normalizado): el valor sale de `que_es`', () => {
    const [e] = fichasAEntradas([ficha({ clase: 'sitio', que_es: 'Hacemos Muebles a Medida', contenido: 'hacemos muebles a medida' })], snap).entradas
    expect(e.contenido).toBe('Hacemos Muebles a Medida')
    expect(norm([e])[0].valor.texto_corto).toBe('Hacemos Muebles a Medida')
  })
  it('una cifra con atributo `metrica:` sale de provenance_tag.metrica.valor y trae la unidad del tipo', () => {
    const f = ficha({ clase: 'metrica', atributo: 'metrica:instagram:seguidores', que_es: 'seguidores en Instagram: 1236', contenido: 'seguidores en instagram 1236', provenance_tag: { metrica: { nombre: 'seguidores', valor: 1236, unidad: 'seguidores' } } })
    const d = norm(fichasAEntradas([f], snap).entradas)[0]
    expect(d).toMatchObject({ tipo_id: 'seguidores', origen: 'medido', valor: { numero: 1236, unidad: 'seguidores' } })
  })
  it('un 0 es una cifra válida', () => {
    const f = ficha({ clase: 'metrica', atributo: 'metrica:mapas:resenas', provenance_tag: { metrica: { nombre: 'resenas', valor: 0, unidad: 'reseñas' } } })
    expect(norm(fichasAEntradas([f], snap).entradas)[0].valor.numero).toBe(0)
  })
  it('un precio con UN número en `contenido` se lee con el parser único; con varios o ninguno, NO se adivina', () => {
    const un = fichasAEntradas([ficha({ clase: 'precio', atributo: 'precio:a', contenido: 'plan basico 1.234,50 usd' })], snap).entradas[0]
    expect(un.contenido).toBe(1234.5)
    const dos = fichasAEntradas([ficha({ clase: 'precio', atributo: 'precio:b', contenido: 'de 10 a 20 usd' })], snap).entradas[0]
    expect(dos.contenido).toBeUndefined()
    expect(norm([dos])[0]).toMatchObject({ estado: 'registro_sin_campos', origen: 'hueco' })
  })
  it('HALLAZGO EN VIVO · el cerebro guarda los precios NORMALIZADOS («1 00 usd» era «1,00 USD»): se leen como entero + centavos y nunca se adivina', () => {
    const lee = (contenido: string) => fichasAEntradas([ficha({ clase: 'precio', atributo: 'precio:x', contenido, que_es: contenido })], snap).entradas[0].contenido
    expect(lee('producto agua precio 1 00 usd')).toBe(1)
    expect(lee('producto ceviche precio 7 00 usd')).toBe(7)
    expect(lee('producto pan precio 0 50 usd')).toBe(0.5)
    expect(lee('producto menu precio 12 50 usd')).toBe(12.5)
    expect(lee('plan anual precio 1 234 usd')).toBe(1234)
    expect(lee('producto cola precio 2 usd')).toBe(2)
    expect(lee('combo de 10 a 20 usd')).toBeUndefined()
    expect(lee('producto 3 en 1 precio 5 00 usd')).toBeUndefined()
  })
  it('HALLAZGO EN VIVO · el país de la ficha llega como NOMBRE («Ecuador»): la fila de moneda lo reconoce (y no cualquier otro)', () => {
    const [e] = fichasAEntradas([ficha({ clase: 'precio', atributo: 'precio:agua', contenido: 'producto agua precio 1 00 usd' })], snap).entradas
    const cli = { nombre: 'X', ubicacion: [], handles: [], dominios: [], telefonos: [], rubro: [] }
    for (const pais of ['Ecuador', 'ecuador', ' ECUADOR ', 'EC']) {
      const d = normalizarDatos([e], { ahora: AHORA, cliente: cli, pais }, snap).datos[0]
      expect(d, pais).toMatchObject({ origen: 'supuesto', valor: { numero: 1, moneda: 'USD' } })
    }
    const sin = normalizarDatos([e], { ahora: AHORA, cliente: cli, pais: 'Atlantida' }, snap).datos[0]
    expect(sin).toMatchObject({ origen: 'hueco' })
    expect(sin.marcas).toContain('moneda_no_comprobable')
  })
  it('sin `observado_en` es un hueco `sin_fecha` (la fecha del contenido NO es la de la observación)', () => {
    const f = ficha({ clase: 'sitio', observado_en: null, fecha_fuente: hace(2) })
    expect(norm(fichasAEntradas([f], snap).entradas)[0]).toMatchObject({ origen: 'hueco', motivo: 'sin_fecha' })
  })
  it('una ficha de un tercero es alcance tercero (D6) y la del dueño entra como supuesto rotulado (G4)', () => {
    const t = norm(fichasAEntradas([ficha({ clase: 'mencion', origen: 'tercero', propiedad: 'ajena' })], snap).entradas)[0]
    expect(t.alcance).toBe('tercero')
    const d = norm(fichasAEntradas([ficha({ clase: 'mapas', atributo: 'mapas:direccion', que_es: 'Calle 1', origen: 'dueno' })], snap).entradas)[0]
    expect(d.origen).toBe('supuesto')
    expect(d.rotulo).toMatch(/dueño/)
  })
  it('el tipo sale de la FILA del catálogo: otra fila, otro tipo, sin tocar código', () => {
    expect(tipoDe(snap, { atributo: 'precio:silla' })?.tipo_id).toBe('precio')
    expect(tipoDe(snap, { atributo: 'mapas:horario' })?.tipo_id).toBe('horario')
    expect(tipoDe(snap, { atributo: 'horario:lunes' })?.tipo_id).toBe('horario_sitio')
    expect(tipoDe(snap, { clase: 'mencion' })?.tipo_id).toBe('menciones')
    expect(tipoDe(snap, { clase: 'videos' })).toBeNull()
    const otra = crearSnapshot({ ...(semilla as unknown as FilasDelCatalogo), tipos: (semilla as unknown as FilasDelCatalogo).tipos.map((t) => (t.tipo_id === 'comentarios_n' ? { ...t, atributo_cerebro: 'clase:videos' } : t)) })
    expect(tipoDe(otra, { clase: 'videos' })?.tipo_id).toBe('comentarios_n')
  })
})

describe('V14 · la lectura FALLA CERRADO', () => {
  it('lee solo las columnas declaradas y solo lo no retirado de ese cliente', async () => {
    const t = { cerebro_fichas: [ficha({ clase: 'sitio' }), ficha({ clase: 'sitio', retirada_en: hace(1) })] as never }
    const base = crearBaseFalsa({ ...t } as never, {})
    const r = await leerFichasVivas(base.db as never, 'cliente-x')
    expect(r.ok).toBe(true)
    expect(COLUMNAS_DE_FICHA.split(',')).not.toContain('*')
  })
  it('un error de la base NO es «no hay fichas»', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }
    expect(await leerFichasVivas(db as never, 'c')).toMatchObject({ ok: false })
    const lanza = { from: () => { throw new Error('red caída') } }
    expect(await leerFichasVivas(lanza as never, 'c')).toMatchObject({ ok: false })
    const noLista = { from: () => ({ select: () => ({ eq: () => ({ is: async () => ({ data: { x: 1 }, error: null }) }) }) }) }
    expect(await leerFichasVivas(noLista as never, 'c')).toMatchObject({ ok: false })
  })
})

describe('V14 · el crudo pasa por la MISMA compuerta (3 rubros)', () => {
  for (const caso of CASOS) {
    it(`${caso.rubro}: lo propio entra, el homónimo de Mapas NO llega y todo es «crudo filtrado»`, async () => {
      const t = tablas(caso, { homonimoEnMapas: true })
      const base = crearBaseFalsa(t as never, { reloj: () => ALTA.toISOString() })
      const lec = await leerCrudo(base.db as never, caso.id)
      expect(lec.ok).toBe(true)
      if (!lec.ok) return
      const r = crudoAEntradas(lec.filas, lec.cliente, lec.sedes, snap)
      // la ficha de Mapas era de un homónimo: ni una cifra ni un campo de Mapas del cliente
      expect(r.entradas.some((e) => e.ejecucion === `${caso.id}-m`)).toBe(false)
      expect(r.entradas.length).toBeGreaterThan(0)
      expect(r.entradas.every((e) => e.via === 'crudo' && e.identidad && (e.identidad as { via: string }).via === 'crudo_filtrado')).toBe(true)
      const p = normalizarDatos(r.entradas, { ahora: ALTA, cliente: {} as never, pais: null }, snap)
      expect(p.datos.every((d) => d.identidad.estado === 'coincide')).toBe(true)
    })
  }
  it('con la ficha propia de Mapas, las cifras entran desde el crudo (puntaje, reseñas) con su fecha de raspado', async () => {
    const caso = CASOS[0]
    const t = tablas(caso)
    const raw = t.apify_raw.find((f) => f.apify_function === 'own_google_maps_profile') as Record<string, unknown>
    ;(raw.respuesta as Array<Record<string, unknown>>)[0] = { ...(raw.respuesta as Array<Record<string, unknown>>)[0], title: caso.nombre, totalScore: 4.8, reviewsCount: 26, address: `Av. 1, ${caso.ciudad}` }
    const base = crearBaseFalsa(t as never, { reloj: () => ALTA.toISOString() })
    const lec = await leerCrudo(base.db as never, caso.id)
    if (!lec.ok) throw new Error('lectura')
    const r = crudoAEntradas(lec.filas, lec.cliente, lec.sedes, snap)
    const punt = r.entradas.find((e) => e.tipo_id === 'puntaje_resenas')
    expect(punt?.contenido).toBe(4.8)
    expect(punt?.medido_en).toBe(raw.created_at)
    expect(r.entradas.find((e) => e.tipo_id === 'resenas_total')?.contenido).toBe(26)
  })
  it('un ensayo del crudo (ensayo=true) jamás entra', async () => {
    const caso = CASOS[1]
    const base = crearBaseFalsa(tablas(caso, { conEnsayo: true }) as never, { reloj: () => ALTA.toISOString() })
    const lec = await leerCrudo(base.db as never, caso.id)
    if (!lec.ok) throw new Error('lectura')
    expect(lec.filas.some((f: FilaCruda) => f.ensayo === true)).toBe(false)
    const r = crudoAEntradas(lec.filas, lec.cliente, lec.sedes, snap)
    expect(JSON.stringify(r.entradas)).not.toContain('TEXTO-DE-ENSAYO')
  })
  it('🔴 O1 · `portero` NO vale para el crudo: ni el lector lo emite, ni V2 lo acepta con vía crudo', async () => {
    const caso = CASOS[2]
    const base = crearBaseFalsa(tablas(caso) as never, { reloj: () => ALTA.toISOString() })
    const lec = await leerCrudo(base.db as never, caso.id)
    if (!lec.ok) throw new Error('lectura')
    const r = crudoAEntradas(lec.filas, lec.cliente, lec.sedes, snap)
    expect(r.entradas.some((e) => (e.identidad as { via: string } | null)?.via === 'portero')).toBe(false)
    const trampa = r.entradas.map((e) => ({ ...e, identidad: { via: 'portero' as const } }))
    const p = normalizarDatos(trampa, { ahora: ALTA, cliente: {} as never }, snap)
    expect(p.datos.every((d) => d.identidad.estado === 'no_comprobable' && d.origen === 'hueco')).toBe(true)
    // y `crudo_filtrado` con otra vía tampoco vale
    const otra = r.entradas.map((e) => ({ ...e, via: 'cerebro' as const }))
    expect(normalizarDatos(otra, { ahora: ALTA, cliente: {} as never }, snap).datos.every((d) => d.identidad.estado === 'no_comprobable')).toBe(true)
  })
  it('un fallo de lectura del crudo se dice (no es «sin raspado»)', async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) }
    expect(await leerCrudo(db as never, 'c')).toMatchObject({ ok: false })
  })
})

describe('V14 · cerebro → crudo → relleno', () => {
  const e = (tipo: string, h: number, extra: Partial<EntradaCruda> = {}): EntradaCruda => ({ fuente_id: 'cerebro_vivo', tipo_id: tipo, estado: 'trajo', contenido: 5, medido_en: hace(h), via: 'cerebro', ...extra })
  it('lo que el cerebro cubre fresco no mira el crudo; lo del crudo no va a Apify; solo lo que falta o venció queda', () => {
    const r = faltantesDeLasVias({
      snapshot: snap, ahora: AHORA,
      requeridos: ['seguidores', 'puntaje_resenas', 'precio', 'visitas_periodo', 'resenas_total'],
      del_cerebro: [e('seguidores', 2), e('precio', 24 * 200)],            // seguidores fresco · precio VENCIDO (límite 90 d)
      del_crudo: [e('puntaje_resenas', 3, { via: 'crudo' }), e('seguidores', 1, { via: 'crudo' })],
    })
    expect(r.cubiertos).toEqual([{ tipo_id: 'seguidores', via: 'cerebro' }, { tipo_id: 'puntaje_resenas', via: 'crudo' }])
    expect(r.faltantes).toEqual([
      { tipo_id: 'precio', motivo: 'vencida' },
      { tipo_id: 'visitas_periodo', motivo: 'sin_crudo' },
      { tipo_id: 'resenas_total', motivo: 'sin_crudo' },
    ])
  })
  it('sin crudo ni cerebro: sin_ficha', () => {
    const r = faltantesDeLasVias({ snapshot: snap, ahora: AHORA, requeridos: ['seguidores'], del_cerebro: [], del_crudo: [] })
    expect(r.faltantes).toEqual([{ tipo_id: 'seguidores', motivo: 'sin_ficha' }])
  })
  it('un hueco no cubre: una ficha sin valor o rechazada cuenta como falta', () => {
    const r = faltantesDeLasVias({ snapshot: snap, ahora: AHORA, requeridos: ['seguidores'], del_cerebro: [e('seguidores', 1, { contenido: undefined })], del_crudo: [] })
    expect(r.cubiertos).toEqual([])
    expect(r.faltantes[0].tipo_id).toBe('seguidores')
  })
  it('el circuito cierra: las faltas alimentan al planificador, y sin «cerebro listo» no sale NADA', () => {
    const f = faltantesDeLasVias({ snapshot: snap, ahora: AHORA, requeridos: ['visitas_periodo', 'anuncios_activos'], del_cerebro: [], del_crudo: [] })
    const sinListo = planificarRelleno({ snapshot: snap, faltantes: f.faltantes, cerebro_listo: false })
    expect(sinListo.pedidos).toEqual([])
    const conListo = planificarRelleno({ snapshot: snap, faltantes: f.faltantes, cerebro_listo: true })
    expect(conListo.pedidos.map((p) => p.fuente_id).sort()).toEqual(['analitica_dominio', 'biblioteca_anuncios'])
  })
})

describe('V14 · solo lee', () => {
  it('el módulo no escribe: ningún insert/update/upsert/delete', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(__dirname, '..', 'src/lib/planeacion/dato-v1/lector-cerebro.ts'), 'utf8')
    expect(src).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/)
    expect(src).not.toMatch(/\bfetch\s*\(|process\.env/)
  })
})
