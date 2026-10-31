/**
 * «VOZ DEL PÚBLICO Y RESUMEN SIEMPRE» (31-oct · CC-CEREBRO) · US$ 0, sin red ni modelo.
 * (3) las opiniones guardan la fecha REAL y no vencen · (2/5) el adjunto único `contexto_del_cliente` en el pedido y la consulta · (4) la puerta de informes de la mesa de análisis.
 */
import { describe, it, expect } from 'vitest'
import { crearBaseFalsa } from '../src/lib/portero-alimenta/__tests__/base-falsa'
import { DIEZ_CLIENTES } from '../src/lib/portero-alimenta/__tests__/diez-clientes.fixtures'
import { tablasDe } from '../src/lib/portero-alimenta/__tests__/diez-clientes.tablas'
import { AHORA, ON } from '../src/lib/portero-alimenta/__tests__/fixtures-despertar'
import { unidadesDeRaspados } from '../src/lib/portero-alimenta/unidades'
import { planDeArchivo } from '../src/lib/portero-alimenta/archivar'
import { adjuntoDelCliente, TOPE_DE_FICHAS_NUEVAS } from '../src/lib/portero-alimenta/contexto-del-cliente'
import { rutaInforme, tipoNormalizado } from '../src/lib/portero-alimenta/informes'
import { rutaConsultar } from '../src/lib/portero-alimenta/consultar'
import { rutaLeerPedido, rutaPedido, type DepsDePedido } from '../src/lib/portero-alimenta/pedidos'

type Fila = Record<string, unknown>
const c = DIEZ_CLIENTES[0]
const OTRO = '99999999-9999-4999-8999-999999999999'
const WF = { workflow_id: 'wf-mesa', workflow_execution_id: 'ex-1' }
const ficha = (id: string, o: Fila = {}): Fila => ({ id, client_id: c.id, clase: 'precio', atributo: null, titulo: 't', que_es: 'q', contenido: `contenido ${id}`, observado_en: '2026-10-20T10:00:00Z', fecha_fuente: null, creado_en: '2026-10-20T10:00:00Z', vigente_hasta: null, retirada_en: null, descartada: false, sede: null, provenance_tag: null, ...o })
const resumen = (id: string, atributo: string, texto: string, o: Fila = {}) => ficha(id, { clase: 'resumen_vivo', atributo, contenido: texto, observado_en: '2026-10-31T12:00:00Z', ...o })
const informeFila = (id: string, tipo: string, corte: string, o: Fila = {}) => ficha(id, { clase: 'informe_de_analisis', atributo: `informe:${tipo}`, contenido: `informe ${tipo} ${id}`, fecha_fuente: corte, creado_en: '2026-10-30T10:00:00Z', origen: 'tercero', provenance_tag: { datos: { tipo, mesa: 'mesa-de-analisis', agente: 'feedback-synthesizer', citas: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] } }, ...o })
const CITA1 = 'c1111111-1111-4111-8111-111111111111'
const CITA2 = 'c2222222-2222-4222-8222-222222222222'
const mundo = (fichas: Fila[]) => { const t = tablasDe(c) as Record<string, Fila[]>; t.cerebro_fichas = fichas; t.cerebro_ingresos = []; t.cerebro_consultas = []; return crearBaseFalsa(t as never) }

describe('3 · las opiniones guardan la fecha REAL y no vencen', () => {
  const ahora = new Date('2026-10-31T15:00:00Z')
  const base = { propios: { sitio: 'https://naufrago.ec', handles: ['naufrago.ec'] }, fichaDeMapas: (xs: Array<Record<string, unknown>>) => xs[0] ?? null }
  const items = (us: ReturnType<typeof unidadesDeRaspados>) => us.map((unidad) => ({ unidad, item: { clase_dato: 'acumula', atributo: null, autoria: 'tercero' } as never }))
  const decisiones = (n: number) => Array.from({ length: n }, (_, i) => ({ n: i + 1, decision: 'suma' as const, reemplaza_ficha: null, razon: '', cita: null, decidido_por: 'sistema' as const }))
  const fila = (fn: string, respuesta: unknown[]) => ({ id: fn, apify_function: fn, ensayo: false, created_at: '2026-10-31T10:00:00Z', respuesta })
  it('reseña de Mapas, comentario de publicación y mención: la ficha lleva la fecha de la opinión (no la del raspado) y NO lleva vencimiento', () => {
    const us = unidadesDeRaspados([
      fila('own_google_maps_profile', [{ title: 'Náufrago', reviews: [{ reviewId: 'r1', text: 'Muy rica la corvina frita y la atención', publishedAtDate: '2025-03-04T12:00:00.000Z' }] }]),
      fila('instagram_post_comments_scraper', [{ id: 'k1', text: 'Fuimos el domingo y el ceviche estaba increíble', timestamp: '2026-05-01T08:00:00.000Z' }]),
      fila('menciones_en_redes', [{ id: 'm1', caption: 'Almuerzo en naufrago ec con la familia', taggedUsers: [{ username: 'naufrago.ec' }], timestamp: '2026-07-09T08:00:00.000Z' }]),
    ], base as never)
    const op = us.filter((u) => ['resenas', 'comentarios', 'mencion'].includes(u.fuente))
    expect(op.map((u) => u.fuente).sort()).toEqual(['comentarios', 'mencion', 'resenas'])
    const plan = planDeArchivo({ client_id: 'C1', items: items(op), decisiones: decisiones(op.length), descartadas: [], sin_confirmar: [], ahora, puente_al_indice: false })
    expect(plan.fichas).toHaveLength(3)
    for (const f of plan.fichas) {
      expect(f.plazo).toBeNull()
      expect(f.vigente_hasta).toBeNull()
      expect(f.origen).toBe('tercero')
      expect(f.fecha_fuente).not.toBeNull()
      expect(String(f.fecha_fuente).slice(0, 10)).not.toBe(ahora.toISOString().slice(0, 10))
    }
    expect(plan.fichas.map((f) => String(f.fecha_fuente).slice(0, 10)).sort()).toEqual(['2025-03-04', '2026-05-01', '2026-07-09'])
  })
  it('🔴 sin fecha en el origen la fecha queda VACÍA (no se rellena con la del raspado)', () => {
    const us = unidadesDeRaspados([fila('instagram_post_comments_scraper', [{ id: 'k2', text: 'Todo muy bien, volveremos pronto' }])], base as never).filter((u) => u.fuente === 'comentarios')
    expect(us).toHaveLength(1)
    const plan = planDeArchivo({ client_id: 'C1', items: items(us), decisiones: decisiones(1), descartadas: [], sin_confirmar: [], ahora, puente_al_indice: false })
    expect(plan.fichas[0].fecha_fuente).toBeNull()
    expect(plan.fichas[0].vigente_hasta).toBeNull()
  })
})

describe('2/5 · el adjunto único `contexto_del_cliente`', () => {
  it('cliente SIN resumen vivo: lo dice («sin_resumen_vivo») y los informes van vacíos; no inventa', async () => {
    const r = await adjuntoDelCliente(mundo([ficha('f1')]).db as never, c.id, AHORA)
    expect(r).toEqual({ resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], informes_estado: 'ok' })
  })
  it('con resumen vivo: va ENTERO (el del cliente y el de cada sede), con su ficha y fecha; el retirado o descartado no cuenta', async () => {
    const largo = 'Quién es: restaurante de mariscos en Olón. '.repeat(40)
    const r = await adjuntoDelCliente(mundo([
      resumen('r1', 'resumen:cliente', largo),
      resumen('r2', 'resumen:sede:olon', 'sede Olón: abierta'),
      resumen('r3', 'resumen:sede:guayaquil', 'sede Guayaquil: por abrir'),
      resumen('rv', 'resumen:cliente', 'VIEJO', { retirada_en: '2026-10-30T00:00:00Z' }),
      resumen('rd', 'resumen:cliente', 'DESCARTADO', { descartada: true, observado_en: '2026-10-31T13:00:00Z' }),
      resumen('r2b', 'resumen:sede:olon', 'sede Olón: VERSIÓN VIEJA', { observado_en: '2026-10-30T12:00:00Z' }),
    ]).db as never, c.id, AHORA)
    expect(r.resumen_vivo).toMatchObject({ estado: 'vigente', ficha_id: 'r1', texto: largo.trim(), actualizado_en: '2026-10-31T12:00:00Z' })
    expect(r.resumen_vivo.texto).toHaveLength(largo.trim().length)
    expect(r.resumen_vivo.sedes?.map((s) => s.clave).sort()).toEqual(['guayaquil', 'olon'])
    expect(JSON.stringify(r)).not.toMatch(/VIEJO|DESCARTADO|VERSIÓN VIEJA/)
    expect(r.resumen_vivo.sedes?.find((s) => s.clave === 'olon')?.texto).toBe('sede Olón: abierta')
  })
  it('el resumen de OTRO cliente no se cuela', async () => {
    const r = await adjuntoDelCliente(mundo([resumen('rx', 'resumen:cliente', 'ajeno', { client_id: OTRO })]).db as never, c.id, AHORA)
    expect(r.resumen_vivo.estado).toBe('sin_resumen_vivo')
  })
  it('informes: uno vigente por tipo, lado a lado con el resumen (que NO los resume), con autor, corte, citas y origen', async () => {
    const r = await adjuntoDelCliente(mundo([
      resumen('r1', 'resumen:cliente', 'resumen del cliente'),
      informeFila('i1', 'voz_del_publico', '2026-10-25T00:00:00Z'),
      informeFila('i2', 'competencia', '2026-10-20T00:00:00Z'),
      informeFila('iv', 'voz_del_publico', '2026-10-01T00:00:00Z', { retirada_en: '2026-10-25T00:00:00Z' }),
    ]).db as never, c.id, AHORA)
    expect(r.informes.map((i) => [i.tipo, i.ficha_id])).toEqual([['competencia', 'i2'], ['voz_del_publico', 'i1']])
    expect(r.informes[1]).toMatchObject({ autor: { mesa: 'mesa-de-analisis', agente: 'feedback-synthesizer' }, fecha_de_corte: '2026-10-25T00:00:00Z', origen: 'sintesis_de_oficina', citas: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] })
    expect(r.resumen_vivo.texto).toBe('resumen del cliente')
    expect(JSON.stringify(r.resumen_vivo)).not.toMatch(/informe/)
  })
  it('🔴 si por una carrera hubiera dos vigentes del mismo tipo, manda el de corte más nuevo', async () => {
    const r = await adjuntoDelCliente(mundo([informeFila('a', 'x_tipo', '2026-10-01T00:00:00Z'), informeFila('b', 'x_tipo', '2026-10-20T00:00:00Z')]).db as never, c.id, AHORA)
    expect(r.informes.map((i) => i.ficha_id)).toEqual(['b'])
  })
  it('marca `hay_material_nuevo_desde_el_corte`: fichas del cliente entradas DESPUÉS del corte; resumen, informes y descartadas no cuentan', async () => {
    const f = [
      informeFila('i1', 'voz_del_publico', '2026-10-25T00:00:00Z'),
      informeFila('i2', 'competencia', '2026-10-28T00:00:00Z'),
      ficha('n1', { clase: 'resenas', creado_en: '2026-10-27T00:00:00Z' }),
      ficha('n2', { clase: 'comentarios', creado_en: '2026-10-29T00:00:00Z' }),
      ficha('nd', { clase: 'resenas', creado_en: '2026-10-29T00:00:00Z', descartada: true }),
      resumen('r1', 'resumen:cliente', 'resumen', { creado_en: '2026-10-30T00:00:00Z' }),
      ficha('vieja', { creado_en: '2026-10-01T00:00:00Z' }),
      ficha('ajena', { client_id: OTRO, creado_en: '2026-10-30T00:00:00Z' }),
    ]
    const r = await adjuntoDelCliente(mundo(f).db as never, c.id, AHORA)
    const voz = r.informes.find((i) => i.tipo === 'voz_del_publico')!
    const comp = r.informes.find((i) => i.tipo === 'competencia')!
    expect(voz).toMatchObject({ hay_material_nuevo_desde_el_corte: true, fichas_nuevas_desde_el_corte: 2 })
    expect(comp).toMatchObject({ hay_material_nuevo_desde_el_corte: true, fichas_nuevas_desde_el_corte: 1 })
    const sinNuevo = await adjuntoDelCliente(mundo([informeFila('i1', 'voz_del_publico', '2026-10-31T00:00:00Z'), ficha('vieja', { creado_en: '2026-10-01T00:00:00Z' })]).db as never, c.id, AHORA)
    expect(sinNuevo.informes[0]).toMatchObject({ hay_material_nuevo_desde_el_corte: false, fichas_nuevas_desde_el_corte: 0 })
    expect(TOPE_DE_FICHAS_NUEVAS).toBe(500)
  })
  it('🔴 un error de la base NO se lee como vacío: dice `no_se_pudo_leer`', async () => {
    const mala = { from: () => { const q: Record<string, unknown> = {}; for (const k of ['select', 'eq', 'in', 'is', 'gte', 'limit']) q[k] = () => q; q.then = (res: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'caída' } }).then(res); return q } }
    const r = await adjuntoDelCliente(mala as never, c.id, AHORA)
    expect(r.resumen_vivo).toMatchObject({ estado: 'no_se_pudo_leer' })
    expect(r.informes_estado).toBe('no_se_pudo_leer')
  })
  it('🔴 si falla SOLO la lectura de lo nuevo, no se afirma que no hay: la marca sale en true', async () => {
    const real = mundo([informeFila('i1', 'voz_del_publico', '2026-10-25T00:00:00Z')]).db
    let llamadas = 0
    const db = { from: (t: string) => { const q = real.from(t) as Record<string, (...a: unknown[]) => unknown>; const gte = q.gte; q.gte = (...a: unknown[]) => { llamadas++; const r = gte.apply(q, a) as Record<string, unknown>; r.then = (res: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'caída' } }).then(res); return r }; return q } }
    const r = await adjuntoDelCliente(db as never, c.id, AHORA)
    expect(llamadas).toBe(1)
    expect(r.informes[0]).toMatchObject({ hay_material_nuevo_desde_el_corte: true, fichas_nuevas_desde_el_corte: 'no_se_pudo_leer' })
    expect(r.informes_estado).toBe('no_se_pudo_leer')
  })
})

describe('2 · la consulta y el pedido llevan SIEMPRE el adjunto, aparte de los resultados', () => {
  const lleno = [resumen('r1', 'resumen:cliente', 'plato del dia precio horario sede todo junto'), informeFila('i1', 'voz_del_publico', '2026-10-25T00:00:00Z', { contenido: 'plato del dia opiniones del publico' }), ficha('p1', { clase: 'precio', atributo: 'precio:plato', contenido: 'plato del dia 8 00 usd' })]
  it('consulta con resultados: `contexto_del_cliente` aparte; el resumen y el informe NO se mezclan con los resultados', async () => {
    const r = await rutaConsultar({ db: mundo(lleno).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', que: 'plato del dia' })
    expect(r.status).toBe(200)
    const b = r.body as { resultados: Array<{ clase: string }>; contexto_del_cliente: { resumen_vivo: { estado: string }; informes: unknown[] } }
    expect(b.resultados.map((x) => x.clase)).toEqual(['precio'])
    expect(b.contexto_del_cliente.resumen_vivo.estado).toBe('vigente')
    expect(b.contexto_del_cliente.informes).toHaveLength(1)
  })
  it('consulta SIN resultados: igual lleva el adjunto; cliente sin resumen: «sin_resumen_vivo»', async () => {
    const vacia = await rutaConsultar({ db: mundo(lleno).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', que: 'zzzzqqqq' })
    expect(vacia.body).toMatchObject({ sin_dato: true, contexto_del_cliente: { resumen_vivo: { estado: 'vigente' } } })
    const sin = await rutaConsultar({ db: mundo([ficha('p1', { atributo: 'precio:plato', contenido: 'plato del dia' })]).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', que: 'plato' })
    expect(sin.body).toMatchObject({ contexto_del_cliente: { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [] } })
  })
  it('quien pide la clase resumen_vivo o informe_de_analisis expresamente, sigue recibiéndolos como resultado', async () => {
    const rv = await rutaConsultar({ db: mundo(lleno).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'resumen_vivo' })
    expect((rv.body as { resultados: unknown[] }).resultados).toHaveLength(1)
    const ri = await rutaConsultar({ db: mundo(lleno).db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'informe_de_analisis' })
    expect((ri.body as { resultados: unknown[] }).resultados).toHaveLength(1)
  })
  const depsPedido = (fichas: Fila[], activo = true): DepsDePedido => ({ db: mundo(fichas).db as never, interruptores: { ...ON, resumen_vivo: false, resumen_pulido: false }, activo, ahora: AHORA, nuevoId: () => '11111111-2222-4333-8444-555555555555', esperar: async () => {} })
  const pedido = { client_id: c.id, dry_run: true, ...WF, pedido_por: { oficina: 'oficina-creativa', agente: 'creative-director' }, para: 'crear una pieza', huecos: [{ objetivo: 'el plato del dia' }] }
  it('el pedido (también en seco y también cuando no encuentra nada) lleva el adjunto; con el portero apagado no lee nada', async () => {
    const r = await rutaPedido(depsPedido(lleno), pedido)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ contexto_del_cliente: { resumen_vivo: { estado: 'vigente', ficha_id: 'r1' }, informes: [{ tipo: 'voz_del_publico' }] } })
    const sin = await rutaPedido(depsPedido([]), pedido)
    expect(sin.body).toMatchObject({ contexto_del_cliente: { resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [] } })
    const apagado = await rutaPedido(depsPedido(lleno, false), pedido)
    expect(apagado.body.apagado).toBe(true)
    expect(apagado.body).not.toHaveProperty('contexto_del_cliente')
    const base = mundo(lleno)
    await rutaPedido({ ...depsPedido(lleno, false), db: base.db as never }, pedido)
    expect(base.lecturas).toHaveLength(0)
  })
  it('un pedido mal formado (400) no lleva adjunto; el pedido leído después (GET) sí', async () => {
    const mal = await rutaPedido(depsPedido(lleno), { ...pedido, client_id: 'no-es-uuid' })
    expect(mal.status).toBe(400)
    expect(mal.body).not.toHaveProperty('contexto_del_cliente')
    const t = tablasDe(c) as Record<string, Fila[]>
    t.cerebro_fichas = lleno
    const hecho = await rutaPedido({ ...depsPedido(lleno), db: crearBaseFalsa(t as never).db as never }, { ...pedido, dry_run: false })
    const id = String((hecho.body as { pedido_id?: string }).pedido_id ?? '')
    if (id) {
      const leido = await rutaLeerPedido({ db: crearBaseFalsa(t as never).db as never, ahora: AHORA }, id)
      if (leido.status === 200) expect(leido.body).toHaveProperty('contexto_del_cliente')
    }
  })
})

describe('4 · la puerta de informes de la mesa de análisis', () => {
  const fichasBase = () => [ficha(CITA1), ficha(CITA2), ficha('ajena', { client_id: OTRO, id: 'c3333333-3333-4333-8333-333333333333' })]
  const cuerpo = (o: Fila = {}): Fila => ({ client_id: c.id, tipo: 'voz_del_publico', texto: 'La gente pide más porción de pescado y elogia la atención del equipo en Olón durante el fin de semana.', citas: [CITA1, CITA2], fecha_de_corte: '2026-10-30T00:00:00Z', pedido_por: { oficina: 'mesa-de-analisis', agente: 'feedback-synthesizer' }, dry_run: false, ...WF, ...o })
  const montar = (fichas: Fila[] = fichasBase()) => { const m = mundo(fichas); return { m, deps: { db: m.db as never, activo: true, ahora: new Date('2026-10-31T15:00:00Z'), nuevoId: (() => { let k = 0; return () => `00000000-0000-4000-8000-${String(++k).padStart(12, '0')}` })() } } }
  it('guarda: clase informe_de_analisis, origen observado (tercero · ajena), autor, corte y citas; el ingreso queda registrado; costo 0', async () => {
    const { m, deps } = montar()
    const r = await rutaInforme(deps, cuerpo())
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body).toMatchObject({ ok: true, guardado: true, tipo: 'voz_del_publico', citas_verificadas: 2, reemplaza: null, modelos_llamados: 0, costo_usd: 0 })
    const f = m.tablas.cerebro_fichas.find((x) => x.clase === 'informe_de_analisis')!
    expect(f).toMatchObject({ client_id: c.id, atributo: 'informe:voz_del_publico', origen: 'tercero', propiedad: 'ajena', decision: 'suma', plazo: null, vigente_hasta: null, retirada_en: null, alcance: 'cliente' })
    expect(Date.parse(String(f.fecha_fuente))).toBe(Date.parse('2026-10-30T00:00:00Z'))
    expect(f.provenance_tag).toMatchObject({ source: 'sintesis_de_oficina', canal: 'mesa_de_analisis', trust_level: 'untrusted', datos: { tipo: 'voz_del_publico', mesa: 'mesa-de-analisis', agente: 'feedback-synthesizer', citas: [CITA1, CITA2] } })
    expect(m.tablas.cerebro_ingresos).toHaveLength(1)
    expect(m.tablas.cerebro_ingresos[0]).toMatchObject({ origen: 'tercero', estado: 'fichado', workflow_id: 'wf-mesa' })
  })
  it('vuelve a las oficinas: el adjunto trae el informe recién guardado', async () => {
    const { deps } = montar()
    await rutaInforme(deps, cuerpo())
    const a = await adjuntoDelCliente(deps.db, c.id, AHORA)
    expect(a.informes[0]).toMatchObject({ tipo: 'voz_del_publico', autor: { mesa: 'mesa-de-analisis', agente: 'feedback-synthesizer' }, citas: [CITA1, CITA2], origen: 'sintesis_de_oficina' })
  })
  it('un informe nuevo del mismo tipo REEMPLAZA al vigente: el anterior queda retirado con fecha y motivo (no se borra); otro tipo no se toca', async () => {
    const { m, deps } = montar()
    await rutaInforme(deps, cuerpo())
    await rutaInforme(deps, cuerpo({ tipo: 'competencia', texto: 'Los competidores de Salinas bajaron precios del almuerzo y publican más reels que nosotros esta semana.' }))
    const r = await rutaInforme(deps, cuerpo({ fecha_de_corte: '2026-10-31T00:00:00Z', texto: 'La gente ahora elogia el nuevo ceviche mixto y pide más sillas en la terraza del local.' }))
    expect(r.body).toMatchObject({ guardado: true, reemplaza: expect.any(String), llego_tarde: false })
    const informes = m.tablas.cerebro_fichas.filter((x) => x.clase === 'informe_de_analisis')
    expect(informes).toHaveLength(3)
    const voz = informes.filter((x) => x.atributo === 'informe:voz_del_publico')
    const vigentes = voz.filter((x) => !x.retirada_en)
    expect(vigentes).toHaveLength(1)
    const vieja = voz.find((x) => x.retirada_en)!
    expect(vieja.motivo_retirada).toMatch(/reemplazado por .* informe nuevo del mismo tipo/)
    expect(vieja.reemplazada_por).toBe(vigentes[0].id)
    expect(vigentes[0]).toMatchObject({ version_de: vieja.id, decision: 'reemplaza' })
    expect(informes.find((x) => x.atributo === 'informe:competencia')!.retirada_en).toBeNull()
  })
  it('🔴 un informe con corte MÁS VIEJO que el vigente no lo reemplaza: queda archivado con su fecha', async () => {
    const { m, deps } = montar()
    await rutaInforme(deps, cuerpo({ fecha_de_corte: '2026-10-30T00:00:00Z' }))
    const r = await rutaInforme(deps, cuerpo({ fecha_de_corte: '2026-10-10T00:00:00Z', texto: 'Informe atrasado sobre lo que decía el público a inicios de octubre en las reseñas del local.' }))
    expect(r.body).toMatchObject({ guardado: true, llego_tarde: true, reemplaza: null })
    const vigentes = m.tablas.cerebro_fichas.filter((x) => x.clase === 'informe_de_analisis' && !x.retirada_en)
    expect(vigentes).toHaveLength(1)
    expect(Date.parse(String(vigentes[0].fecha_fuente))).toBe(Date.parse('2026-10-30T00:00:00Z'))
    expect(m.tablas.cerebro_fichas.find((x) => x.retirada_en)!.motivo_retirada).toMatch(/corte más nuevo/)
  })
  it('🔴 CITAS FALSAS: una sola cita que no existe (o es de otro cliente) rechaza el informe entero y no escribe nada', async () => {
    const { m, deps } = montar()
    const falsa = 'd4444444-4444-4444-8444-444444444444'
    const r = await rutaInforme(deps, cuerpo({ citas: [CITA1, falsa] }))
    expect(r.status).toBe(422)
    expect(r.body).toMatchObject({ error: 'citas_inexistentes', faltan: [falsa], faltan_total: 1 })
    const ajena = await rutaInforme(deps, cuerpo({ citas: [CITA1, 'c3333333-3333-4333-8333-333333333333'] }))
    expect(ajena.status).toBe(422)
    expect(m.escrituras).toHaveLength(0)
  })
  it('entradas inválidas: sin citas, cita que no es id, texto corto, tipo raro, corte futuro o ausente, sin quién firma, cliente inexistente', async () => {
    const { m, deps } = montar()
    const casos: Array<[Fila, number, string]> = [
      [{ citas: [] }, 400, 'citas_obligatorias'], [{ citas: undefined }, 400, 'citas_obligatorias'], [{ citas: ['hola'] }, 400, 'entrada_invalida'],
      [{ texto: 'corto' }, 400, 'entrada_invalida'], [{ texto: 'x'.repeat(30_001) }, 400, 'entrada_invalida'], [{ tipo: '' }, 400, 'entrada_invalida'], [{ tipo: '!!!' }, 400, 'entrada_invalida'],
      [{ fecha_de_corte: '2027-01-01T00:00:00Z' }, 400, 'entrada_invalida'], [{ fecha_de_corte: 'ayer' }, 400, 'entrada_invalida'], [{ fecha_de_corte: undefined }, 400, 'entrada_invalida'],
      [{ pedido_por: { oficina: 'mesa' } }, 400, 'entrada_invalida'], [{ pedido_por: undefined }, 400, 'entrada_invalida'],
      [{ client_id: OTRO }, 404, 'cliente_inexistente'],
    ]
    for (const [o, status, error] of casos) {
      const r = await rutaInforme(deps, cuerpo(o))
      expect([r.status, r.body.error], JSON.stringify(o).slice(0, 60)).toEqual([status, error])
    }
    expect(m.escrituras).toHaveLength(0)
  })
  it('sin dry_run → 400; con dry_run=false sin ids de flujo → 403; en seco no escribe pero dice qué haría', async () => {
    const { m, deps } = montar()
    expect((await rutaInforme(deps, cuerpo({ dry_run: undefined }))).status).toBe(400)
    expect((await rutaInforme(deps, cuerpo({ workflow_id: undefined }))).status).toBe(403)
    const seco = await rutaInforme(deps, cuerpo({ dry_run: true }))
    expect(seco.body).toMatchObject({ ok: true, dry_run: true, citas_verificadas: 2, reemplaza: null })
    expect(m.escrituras).toHaveLength(0)
  })
  it('apagado (`PORTERO_INFORMES`): no lee ni escribe nada', async () => {
    const { m, deps } = montar()
    const r = await rutaInforme({ ...deps, activo: false }, cuerpo())
    expect(r.body).toMatchObject({ apagado: true })
    expect(m.escrituras).toHaveLength(0)
    expect(m.lecturas).toHaveLength(0)
  })
  it('el mismo informe dos veces (mismo texto y corte) es idempotente; privacidad: correos, teléfonos y @usuarios se omiten', async () => {
    const { m, deps } = montar()
    const texto = 'Dos clientes dejaron su contacto (ana@correo.com, 0991234567, @ana_gye) pidiendo reservar mesa grande el sábado.'
    const a = await rutaInforme(deps, cuerpo({ texto }))
    expect(a.body.datos_personales_omitidos).toBe(true)
    const f = m.tablas.cerebro_fichas.find((x) => x.clase === 'informe_de_analisis')!
    expect(String(f.contenido)).toMatch(/\[correo omitido\]/)
    expect(String(f.contenido)).toMatch(/\[usuario omitido\]/)
    expect(String(f.contenido)).not.toMatch(/ana@correo|0991234567|@ana_gye/)
    const b = await rutaInforme(deps, cuerpo({ texto }))
    expect(b.body).toMatchObject({ ok: true, repetido: true, ficha_id: f.id })
    expect(m.tablas.cerebro_fichas.filter((x) => x.clase === 'informe_de_analisis')).toHaveLength(1)
  })
  it('el tipo se normaliza («Voz del público» → voz_del_publico) y comparte vigencia con el mismo tipo escrito de otra forma', async () => {
    expect(tipoNormalizado('Voz del público')).toBe('voz_del_publico')
    const { m, deps } = montar()
    await rutaInforme(deps, cuerpo({ tipo: 'Voz del público' }))
    await rutaInforme(deps, cuerpo({ tipo: 'voz_del_publico', fecha_de_corte: '2026-10-31T00:00:00Z', texto: 'Segunda versión del informe de voz del público con lo nuevo de la última semana de octubre.' }))
    expect(m.tablas.cerebro_fichas.filter((x) => x.clase === 'informe_de_analisis' && !x.retirada_en)).toHaveLength(1)
  })
  it('un informe NO verifica el manual ni cuenta como declarado por el dueño: nunca origen `dueno` ni propiedad `propia`', async () => {
    const { m, deps } = montar()
    await rutaInforme(deps, cuerpo())
    const f = m.tablas.cerebro_fichas.find((x) => x.clase === 'informe_de_analisis')!
    expect(f.origen).not.toBe('dueno')
    expect(f.propiedad).not.toBe('propia')
    expect((f.provenance_tag as Fila).confirmado_por).toBeUndefined()
  })
})
