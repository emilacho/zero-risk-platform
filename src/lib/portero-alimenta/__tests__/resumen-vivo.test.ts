/**
 * Mejora 3 (15-oct) · el resumen vivo del cliente: por código, con cita en cada línea, versión nueva reemplaza a la vieja, huecos a la vista.
 * US$ 0 · base falsa · 3 rubros (tuteo y voseo). Lo que no tiene fuente NO entra.
 */
import { describe, expect, it } from 'vitest'
import { armarResumen, atributoDeSede, fichasDeResumen, temasConConteo, CLASE_DEL_RESUMEN, type FichaParaResumen } from '../resumen-vivo'
import { archivarFichasDeBrazos } from '../brazos/archivo'
import { alimentarCliente } from '../alimentar'
import { crearBaseFalsa } from './base-falsa'

const AHORA = new Date('2026-10-15T13:00:00Z')
const f = (id: string, clase: string, contenido: string, extra: Partial<FichaParaResumen> = {}): FichaParaResumen => ({
  id, clase, titulo: extra.titulo ?? `${clase} · ${id}`, contenido, atributo: extra.atributo ?? null, observado_en: extra.observado_en ?? '2026-10-15T12:31:00Z', fecha_fuente: extra.fecha_fuente ?? '2026-10-14',
  vigente_hasta: extra.vigente_hasta ?? null, retirada_en: extra.retirada_en ?? null, provenance_tag: extra.provenance_tag ?? {}, creado_en: extra.creado_en ?? '2026-10-15T12:31:00Z',
})
const RUBROS = [
  { rubro: 'restaurante de mariscos', nombre: 'Náufrago', cliente: '11111111-1111-4111-8111-111111111111', precio: 'Ceviche de camarón 8,50 dólares', resena: 'El ceviche estaba fresco y el servicio rápido', web: 'Cocina costera ecuatoriana frente al mar' },
  { rubro: 'clínica dental', nombre: 'Clínica Sonrisa Norte', cliente: '22222222-2222-4222-8222-222222222222', precio: 'Limpieza dental 35 dólares', resena: 'La atención fue muy amable y el consultorio impecable', web: 'Odontología familiar en el norte de Quito' },
  { rubro: 'software B2B', nombre: 'Flujo CRM', cliente: '33333333-3333-4333-8333-333333333333', precio: 'Plan Pro 49 dólares al mes', resena: 'El soporte respondió rápido y la facturación quedó integrada', web: 'CRM y facturación para pymes' },
]

describe.each(RUBROS)('armar el resumen · $rubro', ({ rubro, nombre, cliente, precio, resena, web }) => {
  const fichas = [
    f('aaaaaaaa-0000-0000-0000-000000000001', 'sitio', web),
    f('bbbbbbbb-0000-0000-0000-000000000002', 'precio', precio),
    f('cccccccc-0000-0000-0000-000000000003', 'mapas', 'Puntaje 4,5 de 5 con 61 reseñas', { atributo: 'mapas:puntaje', observado_en: '2026-10-15T12:31:00Z' }),
    f('cccccccc-0000-0000-0000-000000000004', 'mapas', 'Puntaje 4,2 de 5 con 55 reseñas', { atributo: 'mapas:puntaje', observado_en: '2026-09-20T10:00:00Z', retirada_en: '2026-10-15T12:31:00Z' }),
    f('dddddddd-0000-0000-0000-000000000005', 'resenas', resena),
    f('dddddddd-0000-0000-0000-000000000006', 'resenas', resena + ' otra vez'),
    f('eeeeeeee-0000-0000-0000-000000000007', 'competidor_vigilado', 'Compite en la misma zona con precios parecidos', { titulo: 'Competidor Uno' }),
  ]
  it('cada línea cita su ficha con fecha y trae las secciones esperadas', () => {
    const r = armarResumen({ client_id: cliente, nombre, rubro, ahora: AHORA, fichas, zona: [f('zzzzzzzz-0000-0000-0000-000000000009', 'contexto', 'Feriado nacional el 2 de noviembre')], sedes: [] })
    for (const s of ['Quién es', 'Qué vende y a qué precio', 'Cifras y su tendencia', 'Qué dicen los clientes', 'Competencia vigilada', 'Contexto que le aplica']) expect(r.texto).toContain(s)
    const lineas = r.texto.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- (sin datos'))
    expect(lineas.length).toBeGreaterThanOrEqual(6)
    for (const l of lineas) expect(l).toMatch(/\[ficha:[0-9a-z]{8} · \d{4}-\d{2}-\d{2}\]/)
    expect(r.huecos).toEqual([])
  })
  it('la cifra trae su tendencia contra la versión retirada de los últimos 60 días', () => {
    const r = armarResumen({ client_id: cliente, nombre, rubro, ahora: AHORA, fichas, zona: [], sedes: [] })
    expect(r.texto).toMatch(/Puntaje 4,5[^\n]*subió \(antes 4\.2\)/)
  })
  it('los temas llevan conteo; un tema de una sola reseña no entra', () => {
    const t = temasConConteo([resena, resena + ' otra vez', 'algo totalmente distinto'])
    expect(t.length).toBeGreaterThan(0)
    expect(t.every((x) => x.veces >= 2)).toBe(true)
  })
  it('sin fichas: todo es hueco declarado y NO hay una sola afirmación inventada', () => {
    const r = armarResumen({ client_id: cliente, nombre, rubro, ahora: AHORA, fichas: [], zona: [], sedes: [] })
    expect(r.huecos).toHaveLength(6)
    expect(r.texto.split('\n').filter((l) => l.startsWith('- ') && !l.startsWith('- (sin datos') && !/^- no hay /.test(l))).toEqual([])
    expect(r.texto).toContain('## Huecos')
  })
  it('una ficha retirada o vencida NO entra como dato vigente', () => {
    const r = armarResumen({ client_id: cliente, nombre, rubro, ahora: AHORA, fichas: [f('ffffffff-0000-0000-0000-000000000010', 'precio', 'Precio viejo 1 dólar', { vigente_hasta: '2026-10-01T00:00:00Z' }), f('ffffffff-0000-0000-0000-000000000011', 'precio', 'Precio retirado 2 dólares', { retirada_en: '2026-10-10T00:00:00Z' })], zona: [], sedes: [] })
    expect(r.texto).not.toContain('Precio viejo')
    expect(r.texto).not.toContain('Precio retirado')
  })
})

describe('por sede y archivo', () => {
  const comp = (id: string, sede: string) => f(id, 'competidor_vigilado', 'Compite en la zona', { titulo: 'Rival ' + sede, provenance_tag: { datos: { sede } } })
  it('una ficha por sede solo si hay 2 o más sedes y esa sede tiene competencia propia', () => {
    const base = { client_id: 'c', nombre: 'N', rubro: 'r', ahora: AHORA, fichas: [comp('11111111-0000-0000-0000-000000000001', 'olon')], zona: [] }
    expect(fichasDeResumen({ ...base, sedes: [{ clave: 'olon', ciudad: 'Olón' }] }).sedes).toHaveLength(0)
    const s = fichasDeResumen({ ...base, sedes: [{ clave: 'olon', ciudad: 'Olón' }, { clave: 'guayaquil', ciudad: 'Guayaquil' }] })
    expect(s.sedes).toHaveLength(1)
    expect(s.sedes[0].atributo).toBe(atributoDeSede('olon'))
    expect(s.cliente.clase).toBe(CLASE_DEL_RESUMEN)
    expect(s.cliente.decision).toBe('reemplaza')
  })
  it('archivar: la versión nueva reemplaza a la vieja y la vieja queda retirada (nada se borra); el mismo día no duplica', async () => {
    const C = '11111111-1111-4111-8111-111111111111'
    const base = crearBaseFalsa({ cerebro_fichas: [], cerebro_ingresos: [] } as never)
    const e1 = fichasDeResumen({ client_id: C, nombre: 'N', rubro: 'r', ahora: AHORA, fichas: [f('11111111-0000-0000-0000-000000000001', 'precio', 'Menú 5 dólares')], zona: [], sedes: [] })
    const a1 = await archivarFichasDeBrazos({ db: base.db as never, fichas: [e1.cliente], ahora: AHORA, dry_run: false })
    expect(a1.errores).toEqual([]); expect(a1.escritas).toBe(1)
    const a1b = await archivarFichasDeBrazos({ db: base.db as never, fichas: [e1.cliente], ahora: AHORA, dry_run: false })
    expect(a1b.escritas).toBe(0); expect(a1b.iguales).toBe(1)
    const manana = new Date(AHORA.getTime() + 86_400_000)
    const e2 = fichasDeResumen({ client_id: C, nombre: 'N', rubro: 'r', ahora: manana, fichas: [f('11111111-0000-0000-0000-000000000001', 'precio', 'Menú 6 dólares')], zona: [], sedes: [] })
    const a2 = await archivarFichasDeBrazos({ db: base.db as never, fichas: [e2.cliente], ahora: manana, dry_run: false })
    expect(a2.errores).toEqual([]); expect(a2.escritas).toBe(1); expect(a2.retiradas).toBe(1)
    const todas = (base.tablas as Record<string, Array<Record<string, unknown>>>).cerebro_fichas
    expect(todas).toHaveLength(2)
    expect(todas.filter((x) => !x.retirada_en)).toHaveLength(1)
  })
  it('dry_run no escribe nada', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: [], cerebro_ingresos: [] } as never)
    const e = fichasDeResumen({ client_id: 'c', nombre: 'N', rubro: 'r', ahora: AHORA, fichas: [], zona: [], sedes: [] })
    const a = await archivarFichasDeBrazos({ db: base.db as never, fichas: [e.cliente], ahora: AHORA, dry_run: true })
    expect(a.escritas).toBe(0)
    expect((base.tablas as Record<string, unknown[]>).cerebro_fichas).toHaveLength(0)
  })
})
void alimentarCliente

describe('la lectura de las oficinas', () => {
  it('devuelve el resumen vigente en una llamada y nunca el retirado; sin resumen = null', async () => {
    const { leerResumenVivo } = await import('../resumen-vivo')
    const t = { cerebro_fichas: [
      { id: 'v1', client_id: 'c', clase: CLASE_DEL_RESUMEN, atributo: 'resumen:cliente', titulo: 'R', contenido: 'viejo', observado_en: '2026-10-14T10:00:00Z', retirada_en: '2026-10-15T10:00:00Z', descartada: false },
      { id: 'v2', client_id: 'c', clase: CLASE_DEL_RESUMEN, atributo: 'resumen:cliente', titulo: 'R', contenido: 'nuevo', observado_en: '2026-10-15T10:00:00Z', retirada_en: null, descartada: false },
    ] }
    const b = crearBaseFalsa(t as never)
    const r = await leerResumenVivo(b.db as never, 'c')
    expect(r.ok && r.cliente?.contenido).toBe('nuevo')
    const vacio = await leerResumenVivo(crearBaseFalsa({ cerebro_fichas: [] } as never).db as never, 'c')
    expect(vacio.ok && vacio.cliente).toBeNull()
    const falla = await leerResumenVivo(crearBaseFalsa(t as never, { fallaEn: 'cerebro_fichas' } as never).db as never, 'c')
    expect(falla.ok).toBe(false)
  })
})

describe('la tendencia solo mira los últimos 60 días', () => {
  it('una versión retirada de hace 100 días NO da tendencia', () => {
    const fs = [
      f('aaaaaaaa-0000-0000-0000-000000000001', 'mapas', 'Puntaje 4,5 de 5 con 61 reseñas', { atributo: 'mapas:puntaje' }),
      f('aaaaaaaa-0000-0000-0000-000000000002', 'mapas', 'Puntaje 3,0 de 5 con 20 reseñas', { atributo: 'mapas:puntaje', observado_en: '2026-07-01T10:00:00Z', retirada_en: '2026-07-02T10:00:00Z' }),
    ]
    const r = armarResumen({ client_id: 'c', nombre: 'N', rubro: 'r', ahora: AHORA, fichas: fs, zona: [], sedes: [] })
    expect(r.texto).toContain('Puntaje 4,5')
    expect(r.texto).not.toMatch(/subió|bajó|igual que antes/)
  })
})
