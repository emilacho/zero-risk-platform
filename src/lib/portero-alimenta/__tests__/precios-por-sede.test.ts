/**
 * PRECIOS Y CARTA POR SEDE (16-oct · firma de Emilio): mecanismo general, no una regla de un cliente.
 * Tres rubros (restaurante 2 sedes local + solo entrega · clínica 3 sedes con una web común · B2B sin local), un cliente de una sola sede que sigue igual,
 * y la guarda: ningún nombre propio de cliente en el código. US$ 0 (todo simulado).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { BRAZOS_APAGADOS, correrBrazos } from '../brazos'
import { armarResumen, type FichaParaResumen } from '../resumen-vivo'
import { brazoDePropios, fichasDeVentas, ventasPorMes, type Fetch } from '../brazos/propios'
import { cargarContextoDeBrazos } from '../brazos/sistematica'
import { radioDeSede, sedesConPunto, type SedeConPunto } from '../brazos/sedes'
import { canalDeLaSede, canalDeTexto, claveDeAlcance, datosDeSede, sedesDeFicha, sedesDeLaFuente, sufijoDeRef, tipoDeFuenteDeUnidad } from '../sedes-fuentes'
import { fuenteDeLaFicha, planDeReasignacion, reasignarFichasASusSedes, versionConSede } from '../reasignar-sedes'
import { crearBaseFalsa } from './base-falsa'

const C = '66666666-6666-4666-8666-666666666666'
const ON = { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }
const D1 = new Date('2026-10-16T10:30:00Z')

describe('canal de la sede', () => {
  it('lo dicho por el alta o el dueño: la palabra de la lista o el texto libre de la ficha', () => {
    expect(canalDeTexto('solo_entrega')).toBe('solo_entrega')
    expect(canalDeTexto('sin_local')).toBe('sin_local')
    expect(canalDeTexto('Solo domicilio')).toBe('solo_entrega')
    expect(canalDeTexto('cocina oculta (dark kitchen)')).toBe('solo_entrega')
    expect(canalDeTexto('solo delivery')).toBe('solo_entrega')
    expect(canalDeTexto('sin local')).toBe('solo_entrega') // texto libre: así lo leía la ficha de la sede (cocina sin local)
    expect(canalDeTexto('Restaurante en sitio')).toBe('local')
    expect(canalDeTexto('consultorio')).toBe('local')
    expect(canalDeTexto('local y domicilio')).toBe('ambos')
    expect(canalDeTexto('ambos')).toBe('ambos')
    expect(canalDeTexto('venta online')).toBe('sin_local')
    expect(canalDeTexto('B2B')).toBe('sin_local')
    expect(canalDeTexto('lo que sea')).toBeNull()
    expect(canalDeTexto('')).toBeNull()
  })
  it('orden: dato de config > ficha de la sede > deducido (y se rotula «deducido»)', () => {
    const config = { apify: { canal_por_sede: { norte: 'solo_entrega' } } }
    expect(canalDeLaSede({ clave: 'norte', config, datos: [{ campo: 'tipo_de_atencion', valor_texto: 'local' }], rubroCompitePorCercania: true })).toMatchObject({ canal: 'solo_entrega', origen: 'dato' })
    expect(canalDeLaSede({ clave: 'sur', config, datos: [{ campo: 'tipo_de_atencion', valor_texto: 'consultorio' }], rubroCompitePorCercania: true })).toMatchObject({ canal: 'local', origen: 'dato' })
    expect(canalDeLaSede({ clave: 'sur', config, datos: [], rubroCompitePorCercania: true })).toMatchObject({ canal: 'local', origen: 'deducido' })
    expect(canalDeLaSede({ clave: 'sur', config: {}, datos: [], rubroCompitePorCercania: false })).toMatchObject({ canal: 'sin_local', origen: 'deducido' })
    // una palabra inválida en la config no manda: se cae al siguiente
    expect(canalDeLaSede({ clave: 'sur', config: { apify: { canal_por_sede: { sur: 'cualquiera' } } }, datos: [{ campo: 'tipo_de_atencion', valor_texto: 'oficina' }], rubroCompitePorCercania: true })).toMatchObject({ canal: 'local', origen: 'dato' })
  })
  it('el radio de competencia sigue el canal: entrega → reparto; local → local; ambos → el mayor; sin local → no por cercanía', () => {
    const s = (canal: SedeConPunto['canal'], tipo: SedeConPunto['tipo'] = 'desconocido') => ({ canal, tipo })
    expect(radioDeSede(['comida'], s('local'))).toBe(3)
    expect(radioDeSede(['comida'], s('solo_entrega'))).toBe(6)
    expect(radioDeSede(['comida'], s('ambos'))).toBe(6)
    expect(radioDeSede(['comida'], s('sin_local'))).toBeNull()
    expect(radioDeSede(['salud'], s('solo_entrega'))).toBeNull() // un rubro que no entrega no compite por reparto
    expect(radioDeSede(['salud'], s('ambos'))).toBe(8)
    expect(radioDeSede(['comida'], { canal: undefined, tipo: 'solo_domicilio' })).toBe(6) // sin canal: como siempre, por el tipo
    expect(radioDeSede(['comida'], { canal: undefined, tipo: 'desconocido' })).toBe(3)
  })
  it('sedesConPunto lleva el canal y de dónde salió; el tipo viejo sigue como estaba', () => {
    const sedes = [{ id: 'a', clave: 'centro', ciudad: 'Quito' }, { id: 'b', clave: 'norte', ciudad: 'Quito' }]
    const r = sedesConPunto({ nombreDelCliente: 'X', sedes, datos: [{ sede_id: 'a', campo: 'tipo_de_atencion', valor_texto: 'restaurante' }], config: { apify: { canal_por_sede: { norte: 'solo_entrega' } } }, filas: [], familias: ['comida'] })
    expect(r[0]).toMatchObject({ clave: 'centro', canal: 'local', canal_origen: 'dato', tipo: 'local' })
    expect(r[1]).toMatchObject({ clave: 'norte', canal: 'solo_entrega', canal_origen: 'dato', tipo: 'desconocido' })
    const sin = sedesConPunto({ nombreDelCliente: 'X', sedes, datos: [], config: {}, filas: [], familias: ['software'] })
    expect(sin.every((s) => s.canal === 'sin_local' && s.canal_origen === 'deducido')).toBe(true)
    // sin saber el rubro no se afirma «sin local»: se asume atención en local, rotulado «deducido»
    const sinRubro = sedesConPunto({ nombreDelCliente: 'X', sedes, datos: [], config: {}, filas: [] })
    expect(sinRubro.every((s) => s.canal === 'local' && s.canal_origen === 'deducido')).toBe(true)
  })
  it('la carga de las sedes del cliente deduce el canal con SU rubro (un cliente de software no compite por cercanía)', async () => {
    const t = {
      client_sedes: [{ id: 'a', client_id: C, clave: 'bodega-a', ciudad: 'Guayaquil' }, { id: 'b', client_id: C, clave: 'bodega-b', ciudad: 'Quito' }],
      client_sede_datos: [], apify_raw: [], cerebro_fichas: [],
    }
    const base = crearBaseFalsa(t as never)
    const ctx = await cargarContextoDeBrazos(base.db, C, { name: 'Distribuidora', industry: 'software CRM para pymes', config: {} } as never, D1)
    expect(ctx.sedes.map((s) => [s.canal, s.canal_origen])).toEqual([['sin_local', 'deducido'], ['sin_local', 'deducido']])
    const base2 = crearBaseFalsa({ ...t, client_sede_datos: [{ client_id: C, sede_id: 'a', campo: 'tipo_de_atencion', valor_texto: 'solo domicilio', observado_en: '2026-10-01T00:00:00Z' }] } as never)
    const ctx2 = await cargarContextoDeBrazos(base2.db, C, { name: 'Cocina', industry: 'restaurante de comida', config: { apify: { canal_por_sede: { 'bodega-b': 'local' } } } } as never, D1)
    expect(ctx2.sedes.map((s) => [s.clave, s.canal, s.canal_origen])).toEqual([['bodega-a', 'solo_entrega', 'dato'], ['bodega-b', 'local', 'dato']])
  })
})

describe('fuente → sede', () => {
  const claves = ['centro', 'norte', 'valle']
  it('un cliente de UNA sede (o sin sedes) no necesita nada: todo es de esa sede', () => {
    const cfg = { apify: { fuentes_por_sede: { sitio_web: 'norte' } } }
    expect(sedesDeLaFuente(cfg, 'sitio_web', null, ['unica']).sedes).toBeNull()
    expect(sedesDeLaFuente(cfg, 'sitio_web', null, []).sedes).toBeNull()
  })
  it('sin asignación = todas las sedes; «todas» también', () => {
    expect(sedesDeLaFuente({}, 'sitio_web', null, claves).sedes).toBeNull()
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { sitio_web: 'todas' } } }, 'sitio_web', null, claves).sedes).toBeNull()
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { sitio_web: ['centro', 'TODAS'] } } }, 'sitio_web', null, claves).sedes).toBeNull()
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { redes: 'norte' } } }, 'sitio_web', null, claves).sedes).toBeNull()
  })
  it('una sede, varias sedes, y por detalle (la tienda del punto de venta, la cuenta de la red)', () => {
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { sitio_web: 'norte' } } }, 'sitio_web', null, claves).sedes).toEqual(['norte'])
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { sitio_web: ['valle', 'centro'] } } }, 'sitio_web', null, claves).sedes).toEqual(['centro', 'valle'])
    const pdv = { apify: { fuentes_por_sede: { punto_de_venta: { 'Tienda Centro': 'centro', 'Cocina Norte': 'norte' } } } }
    expect(sedesDeLaFuente(pdv, 'punto_de_venta', 'Tienda Centro', claves).sedes).toEqual(['centro'])
    expect(sedesDeLaFuente(pdv, 'punto_de_venta', 'cocina norte', claves).sedes).toEqual(['norte'])
    expect(sedesDeLaFuente(pdv, 'punto_de_venta', 'Otra tienda', claves).sedes).toBeNull()
    // el nombre exacto manda aunque otro nombre más corto esté contenido en él (la tienda «Cocina» y la «Cocina Norte»)
    const cocinas = { apify: { fuentes_por_sede: { punto_de_venta: { Cocina: 'centro', 'Cocina Norte': 'norte' } } } }
    expect(sedesDeLaFuente(cocinas, 'punto_de_venta', 'Cocina Norte', claves).sedes).toEqual(['norte'])
    expect(sedesDeLaFuente(cocinas, 'punto_de_venta', 'cocina', claves).sedes).toEqual(['centro'])
    expect(sedesDeLaFuente(cocinas, 'punto_de_venta', 'Cocina Norte 2', claves).sedes).toEqual(['norte']) // sin exacto: el nombre más largo que lo contiene
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { redes: { '*': 'valle', micuenta: 'norte' } } } }, 'redes', 'micuenta', claves).sedes).toEqual(['norte'])
    expect(sedesDeLaFuente({ apify: { fuentes_por_sede: { redes: { '*': 'valle', micuenta: 'norte' } } } }, 'redes', 'otra', claves).sedes).toEqual(['valle'])
  })
  it('una asignación a una sede que no existe se DICE y la fuente no se pierde: queda en todas', () => {
    const r = sedesDeLaFuente({ apify: { fuentes_por_sede: { sitio_web: 'luna' } } }, 'sitio_web', null, claves)
    expect(r.sedes).toBeNull()
    expect(r.declarado.join(' ')).toMatch(/«luna» no es una sede/)
    const m = sedesDeLaFuente({ apify: { fuentes_por_sede: { sitio_web: ['norte', 'luna'] } } }, 'sitio_web', null, claves)
    expect(m.sedes).toEqual(['norte'])
    expect(m.declarado).toHaveLength(1)
  })
  it('qué tipo de fuente es cada unidad del portero; lo de terceros no pertenece a una sede', () => {
    expect(tipoDeFuenteDeUnidad({ fuente: 'sitio', ref: 'https://x.example/' })).toEqual({ tipo: 'sitio_web', detalle: null })
    expect(tipoDeFuenteDeUnidad({ fuente: 'reparto', ref: 'https://www.pedidos.example/x' })).toEqual({ tipo: 'reparto', detalle: 'pedidos.example' })
    expect(tipoDeFuenteDeUnidad({ fuente: 'mapas', ref: 'mapas' })).toEqual({ tipo: 'ficha_de_mapas', detalle: null })
    expect(tipoDeFuenteDeUnidad({ fuente: 'metrica', ref: 'mapas' })).toEqual({ tipo: 'ficha_de_mapas', detalle: null })
    expect(tipoDeFuenteDeUnidad({ fuente: 'metrica', ref: '@mi_cuenta' })).toEqual({ tipo: 'redes', detalle: 'mi_cuenta' })
    expect(tipoDeFuenteDeUnidad({ fuente: 'instagram', ref: '@mi_cuenta' })).toEqual({ tipo: 'redes', detalle: 'mi_cuenta' })
    expect(tipoDeFuenteDeUnidad({ fuente: 'articulo', ref: 'https://x.example/n' })).toBeNull()
    expect(tipoDeFuenteDeUnidad({ fuente: 'mencion', ref: 'redes' })).toBeNull()
  })
  it('la clave de alcance y lo que lleva una ficha con sede', () => {
    expect(claveDeAlcance(null)).toBe('')
    expect(claveDeAlcance([])).toBe('')
    expect(claveDeAlcance(['b', 'a'])).toBe('a,b')
    expect(sedesDeFicha({ datos: { sede: 'norte' } })).toEqual(['norte'])
    expect(sedesDeFicha({ datos: { sedes: ['a', 'b'], sede: 'a' } })).toEqual(['a', 'b'])
    expect(sedesDeFicha({ datos: { sede: '' } })).toBeNull()
    expect(sedesDeFicha(null)).toBeNull()
    expect(datosDeSede(['norte'])).toMatchObject({ sede: 'norte', sedes: ['norte'] })
    expect(datosDeSede(null)).toEqual({})
    expect(sufijoDeRef(['valle', 'Norte Uno'])).toBe(':s:norte-uno+valle')
    expect(sufijoDeRef(null)).toBe('')
  })
})

// ── la corrida diaria con fichas por sede ──────────────────────────────────────────────────────────────
const web = (texto: string, creado = '2026-10-16T08:00:00Z', url = 'https://brisa.example/') => ({ id: `w-${creado}-${url}`, client_id: C, apify_function: 'website_content_scraper', ensayo: false, created_at: creado, respuesta: [{ url, text: texto }] })
const vigente = (id: string, atributo: string, contenido: string, sede: string | null) => ({ id, client_id: C, atributo, contenido, creado_en: '2026-10-15T00:00:00Z', retirada_en: null, prueba: false, ref: `portero:sitio:${id}`, provenance_tag: sede ? { type: 'evidence', datos: { sede, sedes: [sede] } } : { type: 'evidence' } })
const tablas = (o: { sedes: Array<[string, string]>; config?: Record<string, unknown>; apify: unknown[]; fichas?: unknown[]; rubro?: string }) => ({
  clients: [{ id: C, name: 'Estudio Brisa', website_url: 'https://brisa.example', industry: o.rubro ?? 'restaurante de comida', config: o.config ?? {} }],
  client_sedes: o.sedes.map(([clave, ciudad]) => ({ id: `sede-${clave}`, client_id: C, clave, ciudad })),
  apify_raw: o.apify, cerebro_unidades_vistas: [], cerebro_fichas: (o.fichas ?? []) as Array<Record<string, unknown>>, cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [] as Array<Record<string, unknown>>,
})
const modelo = (reemplaza: string, cita = 'ceviche mixto') => async (_i: string, m: string) => { const n = Number(/^\[(\d+)\]/m.exec(m)?.[1] ?? 1); return { texto: JSON.stringify({ decisiones: [{ n, decision: 'reemplaza', reemplaza_ficha: reemplaza, cita, razon: 'cambió el precio' }] }), costo_usd: 0, tokens_entrada: 1, tokens_salida: 1 } }
const corrida = (t: ReturnType<typeof tablas>, llamar?: ReturnType<typeof modelo>) => {
  const base = crearBaseFalsa(t as never)
  return alimentarCliente({ db: base.db, client_id: C, dry_run: false, interruptores: ON, ahora: D1, llamarModelo: llamar, workflow_id: 'wf', workflow_execution_id: 'ex' }).then((r) => ({ r, t }))
}

describe('RESTAURANTE · dos sedes (local y solo entrega) con precios distintos', () => {
  const config = { apify: { canal_por_sede: { centro: 'local', norte: 'solo_entrega' }, fuentes_por_sede: { sitio_web: 'norte' } } }
  it('el precio de la web (asignada a la sede de entrega) NUNCA reemplaza al de la otra sede', async () => {
    const del_local = vigente('F-LOCAL', 'precio:ceviche mixto', 'ceviche mixto $7', 'centro')
    const { r, t } = await corrida(tablas({ sedes: [['centro', 'Quito'], ['norte', 'Quito']], config, apify: [web('Ceviche mixto $9')], fichas: [del_local] }))
    expect(r.estado).toBe('hecha')
    expect(r.juez.items).toBe(0) // en la sede «norte» no había nada vigente: no hay qué juzgar
    expect(r.plan?.resumen).toMatchObject({ suma: 1, reemplaza: 0 })
    const nueva = t.cerebro_fichas.find((f) => (f as { id: string }).id !== 'F-LOCAL') as Record<string, unknown>
    expect(nueva.atributo).toBe('precio:ceviche mixto')
    expect(nueva.contenido).toBe('ceviche mixto $9')
    expect(sedesDeFicha(nueva.provenance_tag)).toEqual(['norte'])
    expect(nueva.sede).toBe('norte') // la columna `sede` de la ficha, que ya leen las oficinas
    expect(String(nueva.titulo)).toMatch(/sede norte/)
    expect(String(nueva.ref)).toMatch(/:s:norte$/)
    // la del local sigue viva y sin tocar
    const local = t.cerebro_fichas.find((f) => (f as { id: string }).id === 'F-LOCAL') as Record<string, unknown>
    expect(local.retirada_en).toBeNull()
  })
  it('un cambio de precio en la sede de entrega reemplaza SOLO a la ficha de esa sede', async () => {
    const t = tablas({ sedes: [['centro', 'Quito'], ['norte', 'Quito']], config, apify: [web('Ceviche mixto $10')], fichas: [vigente('F-LOCAL', 'precio:ceviche mixto', 'ceviche mixto $7', 'centro'), vigente('F-NORTE', 'precio:ceviche mixto', 'ceviche mixto $9', 'norte')] })
    const { r } = await corrida(t, modelo('F-NORTE'))
    expect(r.juez.items).toBe(1)
    expect(r.plan?.resumen.reemplaza).toBe(1)
    const f = (id: string) => t.cerebro_fichas.find((x) => (x as { id: string }).id === id) as Record<string, unknown>
    expect(f('F-NORTE').retirada_en).toBeTruthy()
    expect(f('F-LOCAL').retirada_en).toBeNull()
    const vivas = t.cerebro_fichas.filter((x) => !(x as { retirada_en: unknown }).retirada_en) as Array<Record<string, unknown>>
    expect(vivas.map((x) => `${(sedesDeFicha(x.provenance_tag) ?? ['—'])[0]}:${x.contenido}`).sort()).toEqual(['centro:ceviche mixto $7', 'norte:ceviche mixto $10'])
  })
  it('una ficha que solo trae la columna `sede` (sin el detalle en provenance_tag) también es de su sede', async () => {
    const soloColumna = { ...vigente('F-COL', 'precio:ceviche mixto', 'ceviche mixto $7', null), sede: 'centro' }
    const t = tablas({ sedes: [['centro', 'Quito'], ['norte', 'Quito']], config, apify: [web('Ceviche mixto $9')], fichas: [soloColumna] })
    const { r } = await corrida(t, modelo('F-COL'))
    expect(r.juez.items).toBe(0)
    expect(r.plan?.resumen.reemplaza).toBe(0)
    expect((t.cerebro_fichas.find((x) => (x as { id: string }).id === 'F-COL') as Record<string, unknown>).retirada_en).toBeNull()
  })
  it('lo anterior a la asignación (sin sede) lo adopta la primera lectura con sede, y se retira con su motivo (nada se borra)', async () => {
    const t = tablas({ sedes: [['centro', 'Quito'], ['norte', 'Quito']], config, apify: [web('Ceviche mixto $9')], fichas: [vigente('F-VIEJA', 'precio:ceviche mixto', 'ceviche mixto $7', null)] })
    const { r } = await corrida(t, modelo('F-VIEJA'))
    expect(r.plan?.resumen.reemplaza).toBe(1)
    const vieja = t.cerebro_fichas.find((x) => (x as { id: string }).id === 'F-VIEJA') as Record<string, unknown>
    expect(vieja.retirada_en).toBeTruthy()
    expect(String(vieja.motivo_retirada)).toMatch(/reemplazada por/)
    const nueva = t.cerebro_fichas.find((x) => (x as { id: string }).id !== 'F-VIEJA') as Record<string, unknown>
    expect(sedesDeFicha(nueva.provenance_tag)).toEqual(['norte'])
    expect(nueva.version_de).toBe('F-VIEJA')
  })
  it('el resumen vivo muestra los precios POR SEDE, cada línea con la suya', () => {
    const fichas: FichaParaResumen[] = [
      { id: 'a', clase: 'precio', titulo: 't', contenido: 'ceviche mixto $7', atributo: 'precio:ceviche mixto', observado_en: '2026-10-15T10:00:00Z', fecha_fuente: null, vigente_hasta: null, retirada_en: null, provenance_tag: { datos: { sede: 'centro', sedes: ['centro'] } } },
      { id: 'b', clase: 'precio', titulo: 't', contenido: 'ceviche mixto $9', atributo: 'precio:ceviche mixto', observado_en: '2026-10-15T11:00:00Z', fecha_fuente: null, vigente_hasta: null, retirada_en: null, provenance_tag: { datos: { sede: 'norte', sedes: ['norte'] } } },
      { id: 'c', clase: 'horario', titulo: 't', contenido: 'horario de lunes a viernes de 9 a 18', atributo: 'horario:lunes', observado_en: '2026-10-15T09:00:00Z', fecha_fuente: null, vigente_hasta: null, retirada_en: null, provenance_tag: {} },
    ]
    const r = armarResumen({ client_id: C, nombre: 'Estudio Brisa', rubro: null, ahora: D1, fichas, zona: [], sedes: [{ clave: 'centro', ciudad: 'Quito' }, { clave: 'norte', ciudad: 'Quito' }] })
    expect(r.texto).toMatch(/por sede: pueden diferir entre sedes/)
    expect(r.texto).toMatch(/\[sede centro \(Quito\)\] ceviche mixto \$7/)
    expect(r.texto).toMatch(/\[sede norte \(Quito\)\] ceviche mixto \$9/)
    expect(r.texto).toMatch(/\[todas las sedes\] horario de lunes/)
    // primero las sedes (por clave) y al final lo de todas
    const i = (t: RegExp) => r.texto.search(t)
    expect(i(/\[sede centro/)).toBeLessThan(i(/\[sede norte/))
    expect(i(/\[sede norte/)).toBeLessThan(i(/\[todas las sedes\]/))
  })
  it('lee la sede de las fichas vigentes (provenance_tag) al comparar', async () => {
    const t = tablas({ sedes: [['centro', 'Quito'], ['norte', 'Quito']], config, apify: [web('Ceviche mixto $9')], fichas: [] })
    const base = crearBaseFalsa(t as never)
    const columnas: string[] = []
    const from = base.db.from.bind(base.db)
    ;(base.db as { from: (n: string) => unknown }).from = (n: string) => { const q = from(n) as Record<string, (...a: unknown[]) => unknown>; const sel = q.select; q.select = (c: unknown) => { if (n === 'cerebro_fichas') columnas.push(String(c)); return sel(c) }; return q }
    await alimentarCliente({ db: base.db, client_id: C, dry_run: true, interruptores: ON, ahora: D1 })
    expect(columnas.join('|')).toMatch(/provenance_tag/)
  })
  it('de punta a punta: la corrida de los brazos archiva las ventas de cada tienda con la sede de esa tienda', async () => {
    const t = tablas({ sedes: [['centro', 'Quito'], ['norte', 'Quito']], config: { apify: { fuentes_por_sede: { punto_de_venta: { 'Tienda Centro': 'centro', 'Cocina Norte': 'norte' } } } }, apify: [] })
    const recibo = (store: string, total: number) => ({ created_at: '2026-10-10T17:00:00Z', store_id: store, total_money: total, receipt_type: 'SALE', line_items: [{ item_name: 'Ceviche', quantity: 1, total_money: total }] })
    const fetch = async (url: string) => ({ ok: true, status: 200, json: async () => (url.includes('/stores') ? { stores: [{ id: 't1', name: 'Tienda Centro' }, { id: 't2', name: 'Cocina Norte' }] } : { receipts: [recibo('t1', 10), recibo('t2', 20)] }) })
    const cliente = { id: C, name: 'Estudio Brisa', slug: 'brisa', industry: 'restaurante de comida', country: 'Ecuador', config: t.clients[0].config }
    const base = crearBaseFalsa(t as never)
    const r = await correrBrazos({ db: base.db, brazos: { ...BRAZOS_APAGADOS, propios: true }, cliente, client_id: C, filas: [], ahora: D1, dry_run: false, env: { CLIENTE_BRISA_LOYVERSE_TOKEN: 'llave-falsa' }, fetch })
    expect(r.errores).toEqual([])
    const de = (tienda: string) => t.cerebro_fichas.filter((f) => /Tienda|Cocina/.test(String(f.titulo)) && String(f.titulo).includes(tienda))
    expect(de('Tienda Centro').length).toBeGreaterThan(0)
    expect(de('Tienda Centro').every((f) => sedesDeFicha(f.provenance_tag)?.[0] === 'centro')).toBe(true)
    expect(de('Cocina Norte').every((f) => sedesDeFicha(f.provenance_tag)?.[0] === 'norte')).toBe(true)
    // y la columna `sede` de la ficha (la que ya leen las oficinas) trae la misma sede
    expect(de('Tienda Centro').every((f) => f.sede === 'centro')).toBe(true)
    expect(de('Cocina Norte').every((f) => f.sede === 'norte')).toBe(true)
  })
  it('el brazo de datos propios asigna cada tienda del punto de venta a su sede', async () => {
    const recibo = (store: string, total: number) => ({ created_at: '2026-10-10T17:00:00Z', store_id: store, total_money: total, receipt_type: 'SALE', line_items: [{ item_name: 'Ceviche', quantity: 1, total_money: total }] })
    const fetch: Fetch = async (url) => {
      const cuerpo = url.includes('/stores') ? { stores: [{ id: 't1', name: 'Tienda Centro' }, { id: 't2', name: 'Cocina Norte' }] } : { receipts: [recibo('t1', 10), recibo('t2', 20)] }
      return { ok: true, status: 200, json: async () => cuerpo }
    }
    const cfg = { apify: { fuentes_por_sede: { punto_de_venta: { 'Tienda Centro': 'centro', 'Cocina Norte': 'norte' } } } }
    const r = await brazoDePropios({ client_id: C, slug: 'brisa', config: cfg, ahora: D1, env: { CLIENTE_BRISA_LOYVERSE_TOKEN: 'llave-falsa' }, fetch, clavesDeSedes: ['centro', 'norte'] })
    const sedesDe = (t: string) => [...new Set(r.fichas.filter((f) => f.datos?.tienda === t).map((f) => (f.datos as Record<string, unknown>).sede))]
    expect(sedesDe('Tienda Centro')).toEqual(['centro'])
    expect(sedesDe('Cocina Norte')).toEqual(['norte'])
    // sin las claves de las sedes (un cliente de una sola sede) no hay asignación
    const sola = await brazoDePropios({ client_id: C, slug: 'brisa', config: cfg, ahora: D1, env: { CLIENTE_BRISA_LOYVERSE_TOKEN: 'llave-falsa' }, fetch })
    expect(sola.fichas.every((f) => !('sede' in (f.datos as Record<string, unknown>)))).toBe(true)
  })
  it('sin ninguna ficha con sede, el resumen vivo queda como siempre (un solo listado)', () => {
    const fichas: FichaParaResumen[] = [{ id: 'a', clase: 'precio', titulo: 't', contenido: 'ceviche mixto $7', atributo: 'precio:ceviche mixto', observado_en: '2026-10-15T10:00:00Z', fecha_fuente: null, vigente_hasta: null, retirada_en: null, provenance_tag: {} }]
    const r = armarResumen({ client_id: C, nombre: 'X', rubro: null, ahora: D1, fichas, zona: [], sedes: [{ clave: 'centro', ciudad: 'Quito' }, { clave: 'norte', ciudad: 'Quito' }] })
    expect(r.texto).toMatch(/## Qué vende y a qué precio \(vigente\)\n- ceviche mixto \$7/)
    expect(r.texto).not.toMatch(/\[sede|todas las sedes\]/)
  })
  it('las ventas de cada tienda del punto de venta llevan la sede de esa tienda', () => {
    const recibo = (store: string, total: number) => ({ created_at: '2026-09-10T17:00:00Z', store_id: store, total_money: total, receipt_type: 'SALE', line_items: [{ item_name: 'Ceviche', quantity: 1, total_money: total }] })
    const { meses } = ventasPorMes([recibo('t1', 10), recibo('t2', 20)], { tiendas: new Map([['t1', 'Tienda Centro'], ['t2', 'Cocina Norte']]) })
    // el comodín «*» cubre cualquier tienda con nombre, pero el total del negocio no es una tienda
    const cfg = { apify: { fuentes_por_sede: { punto_de_venta: { '*': 'valle', 'Tienda Centro': 'centro', 'Cocina Norte': 'norte' } } } }
    const fichas = fichasDeVentas({ client_id: C, meses, ahora: D1, sedeDeTienda: (t) => sedesDeLaFuente(cfg, 'punto_de_venta', t, ['centro', 'norte', 'valle']).sedes })
    const de = (t: string) => fichas.filter((f) => f.datos?.tienda === t)
    expect(de('Tienda Centro').length).toBeGreaterThan(0)
    expect(de('Tienda Centro').every((f) => (f.datos as Record<string, unknown>).sede === 'centro' && /sede centro/.test(f.titulo))).toBe(true)
    expect(de('Cocina Norte').every((f) => (f.datos as Record<string, unknown>).sede === 'norte')).toBe(true)
    // el total del negocio no es de una sede
    expect(fichas.filter((f) => f.datos?.tienda === null).every((f) => !('sede' in (f.datos as Record<string, unknown>)))).toBe(true)
  })
})

describe('CLÍNICA · tres sedes con una web común (todas las sedes)', () => {
  const config = { apify: { canal_por_sede: { norte: 'local', centro: 'local', valle: 'local' } } }
  const CITA = 'limpieza dental'
  it('sin asignación la web es de todas: el precio nuevo reemplaza al vigente como siempre, sin sede en la ficha', async () => {
    const t = tablas({ sedes: [['norte', 'Quito'], ['centro', 'Quito'], ['valle', 'Cumbayá']], config, rubro: 'clínica dental', apify: [web('Limpieza dental $40')], fichas: [vigente('F-V', 'precio:limpieza dental', 'limpieza dental $35', null)] })
    const { r } = await corrida(t, modelo('F-V', CITA))
    expect(r.plan?.resumen.reemplaza).toBe(1)
    const nueva = t.cerebro_fichas.find((x) => (x as { id: string }).id !== 'F-V') as Record<string, unknown>
    expect(sedesDeFicha(nueva.provenance_tag)).toBeNull()
    expect(nueva.sede).toBeNull()
    expect(String(nueva.ref)).not.toMatch(/:s:/)
    expect(String(nueva.titulo)).not.toMatch(/sede/)
  })
  it('«todas» explícito da el mismo resultado; una asignación a una sede inexistente se declara y no cambia nada', async () => {
    const a = tablas({ sedes: [['norte', 'Quito'], ['centro', 'Quito']], config: { apify: { fuentes_por_sede: { sitio_web: 'todas' } } }, apify: [web('Limpieza dental $40')], fichas: [vigente('F-V', 'precio:limpieza dental', 'limpieza dental $35', null)] })
    const ra = await corrida(a, modelo('F-V', CITA))
    expect(ra.r.declarado_sedes).toEqual([])
    const b = tablas({ sedes: [['norte', 'Quito'], ['centro', 'Quito']], config: { apify: { fuentes_por_sede: { sitio_web: 'luna' } } }, apify: [web('Limpieza dental $40')], fichas: [vigente('F-V', 'precio:limpieza dental', 'limpieza dental $35', null)] })
    const rb = await corrida(b, modelo('F-V', CITA))
    expect(rb.r.declarado_sedes?.join(' ')).toMatch(/«luna»/)
    expect(rb.r.plan?.resumen.reemplaza).toBe(1)
    expect(sedesDeFicha((b.cerebro_fichas.find((x) => (x as { id: string }).id !== 'F-V') as Record<string, unknown>).provenance_tag)).toBeNull()
  })
})

describe('B2B · dos bodegas, sin local', () => {
  it('el canal se deduce «sin local» por el rubro y no se compite por cercanía; los precios de lista siguen siendo de todas', async () => {
    const sedes = sedesConPunto({ nombreDelCliente: 'Distribuidora', sedes: [{ id: 'a', clave: 'bodega-a', ciudad: 'Guayaquil' }, { id: 'b', clave: 'bodega-b', ciudad: 'Quito' }], datos: [], config: {}, filas: [], familias: ['software'] })
    expect(sedes.map((s) => [s.canal, s.canal_origen])).toEqual([['sin_local', 'deducido'], ['sin_local', 'deducido']])
    expect(sedes.map((s) => radioDeSede(['software'], s))).toEqual([null, null])
    const t = tablas({ sedes: [['bodega-a', 'Guayaquil'], ['bodega-b', 'Quito']], rubro: 'software', apify: [web('Plan Pro US$ 49 por mes')], fichas: [vigente('F-V', 'precio:plan pro', 'plan pro us$ 39 por mes', null)] })
    const { r } = await corrida(t, modelo('F-V', 'plan pro'))
    expect(r.plan?.resumen.reemplaza).toBe(1)
  })
})

describe('UNA SOLA SEDE · funciona igual que hoy', () => {
  it('aunque la config traiga asignaciones, un cliente de una sede no cambia: ficha sin sede, ref igual que siempre', async () => {
    const t = tablas({ sedes: [['unica', 'Cuenca']], config: { apify: { fuentes_por_sede: { sitio_web: 'otra' }, canal_por_sede: { unica: 'local' } } }, apify: [web('Sesion de masaje $35')], fichas: [vigente('F-V', 'precio:sesion masaje', 'sesion de masaje $30', null)] })
    const { r } = await corrida(t, modelo('F-V', 'sesion de masaje'))
    expect(r.declarado_sedes).toEqual([])
    expect(r.plan?.resumen.reemplaza).toBe(1)
    const nueva = t.cerebro_fichas.find((x) => (x as { id: string }).id !== 'F-V') as Record<string, unknown>
    expect(nueva.ref).toMatch(/^portero:sitio:[0-9a-f]{16}$/)
    expect(sedesDeFicha(nueva.provenance_tag)).toBeNull()
  })
  it('sin sedes registradas tampoco rompe', async () => {
    const t = tablas({ sedes: [], apify: [web('Sesion de masaje $35')] })
    const { r } = await corrida(t)
    expect(r.estado).toBe('hecha')
    expect(r.plan?.resumen.suma).toBe(1)
  })
})

describe('REASIGNAR las fichas ya guardadas a su sede (versionar, sin borrar)', () => {
  const ficha = (id: string, o: Record<string, unknown>) => ({ id, client_id: C, ingreso_id: 'ing', clase: 'precio', titulo: 'sitio · precio:x', contenido: 'x $5', origen: 'su_fuente', retirada_en: null, descartada: false, prueba: false, provenance_tag: { type: 'evidence' }, sede: null, creado_en: '2026-10-01T00:00:00Z', ...o })
  const config = { apify: { fuentes_por_sede: { sitio_web: 'norte', ficha_de_mapas: 'centro', punto_de_venta: { 'Tienda Centro': 'centro', 'Cocina Norte': 'norte' } } } }
  const claves = ['centro', 'norte']
  const fichas = [
    ficha('p1', { ref: 'portero:sitio:aaaa', atributo: 'precio:ceviche', fuente_url: 'https://brisa.example/' }),
    ficha('p2', { ref: 'portero:sitio:bbbb', clase: 'sitio', atributo: null }),
    ficha('m1', { ref: 'portero:mapas:cccc', clase: 'mapas', atributo: 'mapas:horario' }),
    ficha('m2', { ref: 'portero:metrica:dddd', clase: 'metrica', atributo: 'metrica:mapas:puntaje' }),
    ficha('i1', { ref: 'portero:instagram:eeee', clase: 'instagram', atributo: 'instagram:bio', fuente_url: 'https://www.instagram.com/brisa/' }),
    ficha('v1', { ref: 'brazo:propios:loyverse:ingreso:2026-09:tienda-centro', clase: 'metrica', atributo: 'metrica:loyverse:ingreso:2026-09:tienda-centro', provenance_tag: { datos: { tienda: 'Tienda Centro' } } }),
    ficha('v2', { ref: 'brazo:propios:loyverse:ingreso:2026-09:tienda-norte', clase: 'metrica', atributo: 'metrica:loyverse:ingreso:2026-09:tienda-norte', provenance_tag: { datos: { tienda: 'Cocina Norte', sede: 'norte', sedes: ['norte'] } }, sede: 'norte' }),
    ficha('v3', { ref: 'brazo:propios:loyverse:ingreso:2026-09', clase: 'metrica', atributo: 'metrica:loyverse:ingreso:2026-09', provenance_tag: { datos: { tienda: null } } }),
    ficha('c1', { ref: 'brazo:competencia:x', clase: 'competidor_vigilado' }),
    ficha('t1', { ref: 'portero:resenas:ffff', clase: 'resenas', fuente_url: null }),
    ficha('t2', { ref: 'portero:articulo:gggg', clase: 'articulo' }),
    ficha('x1', { ref: 'portero:sitio:hhhh', retirada_en: '2026-10-05T00:00:00Z' }),
    ficha('x2', { ref: 'portero:sitio:iiii', descartada: true }),
  ] as Array<Record<string, unknown>>
  it('de qué fuente es cada ficha', () => {
    const de = (id: string) => fuenteDeLaFicha(fichas.find((f) => f.id === id)!)
    expect(de('p1')).toEqual({ tipo: 'sitio_web', detalle: null })
    expect(de('m1')).toEqual({ tipo: 'ficha_de_mapas', detalle: null })
    expect(de('m2')).toEqual({ tipo: 'ficha_de_mapas', detalle: null })
    expect(de('t1')).toEqual({ tipo: 'ficha_de_mapas', detalle: null }) // las reseñas de la ficha de Mapas son de la sede de esa ficha
    expect(de('i1')).toEqual({ tipo: 'redes', detalle: 'brisa' })
    expect(de('v1')).toEqual({ tipo: 'punto_de_venta', detalle: 'Tienda Centro' })
    expect(de('v3')).toBeNull() // el total del negocio no es de una sede
    expect(de('c1')).toBeNull()
    expect(de('t2')).toBeNull()
  })
  it('el plan: solo lo que cambia de sede; lo que ya está, lo de terceros, lo retirado y lo descartado no se toca', () => {
    const p = planDeReasignacion(fichas, config, claves)
    expect(p.reasignar.map((x) => `${x.id}→${x.a.join(',')}`).sort()).toEqual(['m1→centro', 'm2→centro', 'p1→norte', 'p2→norte', 't1→centro', 'v1→centro'])
    expect(p.ya_en_su_sede).toBe(1) // v2 ya está en norte
    expect(p.sin_asignacion).toBe(1) // la cuenta de redes no tiene asignación: queda en todas
    expect(p.no_aplica).toBe(3) // el total del negocio, la competencia vigilada y un artículo de un tercero
  })
  it('un cliente de una sola sede no reasigna nada', () => {
    expect(planDeReasignacion(fichas, config, ['unica']).reasignar).toEqual([])
  })
  it('la versión copia todo, cambia solo la sede y deja el rastro; la del portero lleva la sede en la ref y la del brazo conserva la suya', () => {
    const v = versionConSede(fichas[0], ['norte'], { id: 'N1', motivo: 'prueba' })
    expect(v).toMatchObject({ id: 'N1', version_de: 'p1', sede: 'norte', ref: 'portero:sitio:aaaa:s:norte', contenido: 'x $5', ingreso_id: 'ing', decision: 'reemplaza', razon_de_decision: 'prueba' })
    expect(String(v.titulo)).toMatch(/ · sede norte$/)
    expect(sedesDeFicha(v.provenance_tag)).toEqual(['norte'])
    expect(v).not.toHaveProperty('creado_en')
    const b = versionConSede(fichas[5], ['centro'], { id: 'N2', motivo: 'prueba' })
    expect(b.ref).toBe('brazo:propios:loyverse:ingreso:2026-09:tienda-centro')
    expect((b.provenance_tag as Record<string, unknown>).datos).toMatchObject({ tienda: 'Tienda Centro', sede: 'centro' })
    // ya tiene el sufijo: no se duplica
    expect(versionConSede({ ...fichas[0], ref: 'portero:sitio:aaaa:s:norte', titulo: 'x · sede norte' }, ['norte'], { id: 'N3', motivo: 'm' }).ref).toBe('portero:sitio:aaaa:s:norte')
  })
  it('aplicar: versiona y retira con su motivo; en seco no escribe; repetir no hace nada', async () => {
    const t = { cerebro_fichas: fichas.map((f) => ({ ...f })) as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t as never)
    let n = 0
    const seco = await reasignarFichasASusSedes({ db: base.db, client_id: C, config, clavesDeSedes: claves, ahora: D1, dry_run: true, motivo: 'la fuente es de esa sede' })
    expect(seco.plan.reasignar).toHaveLength(6)
    expect(seco.escritas).toBe(0)
    expect(t.cerebro_fichas).toHaveLength(fichas.length)
    const real = await reasignarFichasASusSedes({ db: base.db, client_id: C, config, clavesDeSedes: claves, ahora: D1, dry_run: false, motivo: 'la fuente es de esa sede', nuevoId: () => `N-${++n}` })
    expect(real.errores).toEqual([])
    expect(real).toMatchObject({ escritas: 6, retiradas: 6 })
    const p1 = t.cerebro_fichas.find((f) => f.id === 'p1') as Record<string, unknown>
    expect(p1.retirada_en).toBe(D1.toISOString())
    expect(String(p1.motivo_retirada)).toMatch(/reasignada a la sede norte el 2026-10-16: la fuente es de esa sede/)
    expect(String(p1.reemplazada_por)).toMatch(/^N-/)
    // nada se borró
    expect(t.cerebro_fichas).toHaveLength(fichas.length + 6)
    // las demás no se tocaron
    expect((t.cerebro_fichas.find((f) => f.id === 'c1') as Record<string, unknown>).retirada_en).toBeNull()
    // idempotente
    const otra = await reasignarFichasASusSedes({ db: base.db, client_id: C, config, clavesDeSedes: claves, ahora: D1, dry_run: false, motivo: 'x', nuevoId: () => `M-${++n}` })
    expect(otra.plan.reasignar).toEqual([])
    expect(otra.escritas).toBe(0)
  })
  // una base cuya escritura (insert o update) de las fichas falla: lo demás funciona
  const conFallaDe = (db: ReturnType<typeof crearBaseFalsa>['db'], op: 'insert' | 'update') => ({
    from: (n: string) => {
      const q = db.from(n) as Record<string, unknown>
      if (n !== 'cerebro_fichas') return q
      const roto = { eq: () => roto, then: (r: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'falla simulada' } }).then(r) }
      q[op] = () => roto
      return q
    },
  })
  it('si la versión nueva no se escribe, la anterior NO se retira (nada se pierde)', async () => {
    const t = { cerebro_fichas: fichas.map((f) => ({ ...f })) as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t as never)
    const r = await reasignarFichasASusSedes({ db: conFallaDe(base.db, 'insert') as never, client_id: C, config, clavesDeSedes: claves, ahora: D1, dry_run: false, motivo: 'x' })
    expect(r.errores.join(' ')).toMatch(/versión de p1: falla simulada/)
    expect(r).toMatchObject({ escritas: 0, retiradas: 0 })
    expect(t.cerebro_fichas.every((f) => f.retirada_en === null || f.id === 'x1')).toBe(true)
  })
  it('si el retiro falla se dice y no se cuenta como retirada', async () => {
    const t = { cerebro_fichas: fichas.map((f) => ({ ...f })) as Array<Record<string, unknown>> }
    const base = crearBaseFalsa(t as never)
    const r = await reasignarFichasASusSedes({ db: conFallaDe(base.db, 'update') as never, client_id: C, config, clavesDeSedes: claves, ahora: D1, dry_run: false, motivo: 'x' })
    expect(r.errores.join(' ')).toMatch(/retiro de p1: falla simulada/)
    expect(r.escritas).toBe(6)
    expect(r.retiradas).toBe(0)
  })
  it('si no se puede leer lo vigente se dice y no se escribe nada', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: fichas.map((f) => ({ ...f })) } as never, { fallaEn: 'cerebro_fichas' })
    const r = await reasignarFichasASusSedes({ db: base.db, client_id: C, config, clavesDeSedes: claves, ahora: D1, dry_run: false, motivo: 'x' })
    expect(r.errores.join(' ')).toMatch(/lectura de las fichas vigentes/)
    expect(r.escritas).toBe(0)
  })
})

describe('GUARDA · ningún nombre propio de un cliente en el código', () => {
  // los clientes reales con sedes y precios propios: sus nombres, ciudades y negocios viven solo en la configuración y en los datos
  const PROHIBIDOS = /n[aá]ufrago|naufrago|\bol[oó]n\b|guayaquil|peniche|seguridad industrial p[eé]rez/i
  // el catálogo público de feriados y temporadas por país nombra lugares (no clientes): es la única excepción, por archivo
  const CATALOGO_PUBLICO = new Set(['brazos\\contexto.ts', 'brazos/contexto.ts'])
  const RAIZ = path.resolve(__dirname, '..')
  const archivos = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__tests__' ? [] : archivos(path.join(d, e.name))) : e.name.endsWith('.ts') ? [path.join(d, e.name)] : []))
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
  it('el código del portero (sin comentarios) no nombra a ningún cliente, sus ciudades ni sus sedes', () => {
    const culpables: string[] = []
    for (const a of archivos(RAIZ)) {
      if (CATALOGO_PUBLICO.has(path.relative(RAIZ, a))) continue
      const c = sinComentarios(fs.readFileSync(a, 'utf8'))
      c.split('\n').forEach((l, i) => { if (PROHIBIDOS.test(l)) culpables.push(`${path.relative(RAIZ, a)}:${i + 1}: ${l.trim().slice(0, 90)}`) })
    }
    expect(culpables).toEqual([])
  })
  it('la guarda se activa: un nombre de cliente en una cadena sí la dispara', () => {
    expect(PROHIBIDOS.test(sinComentarios("const sede = 'Guayaquil' // la del cliente"))).toBe(true)
    expect(PROHIBIDOS.test(sinComentarios("// Guayaquil\nconst x = 1"))).toBe(false)
  })
})
