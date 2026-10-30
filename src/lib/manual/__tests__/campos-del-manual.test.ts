/**
 * «El manual sale solo» (30-oct) · E1 + N1 + N2 + E4: la definición única de los campos, el cierre de completitud y la validación por la jefatura.
 * Los textos del eslogan y del propósito son copia LITERAL de los manuales reales (Náufrago v6 y Zero Risk v4, leídos el 30-oct).
 */
import { describe, expect, it } from 'vitest'
import { buildBrandBookRow } from '@/app/api/brand-book/[clientId]/route'
import { chunksFromBrandBook } from '@/lib/brain/persist-chunks'
import {
  CAMPOS, CAMPO_POR_CLAVE, REGLAS_POR_TIPO, columnasDelBorrador, esLemaCitado, eslogan_declarado, estadoDelCampo, evaluarCompletitud,
  fugasDeLasColumnas, obligatoriosPara, quienValido, rotuloVisual,
} from '../campos-del-manual'
import { CAMPOS_PROPONIBLES } from '../propuesta'
import { decidirLaJefatura } from '../jefatura'
import { rutaBorrador } from '../rutas'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'
import { filaInstagram, filaSitio, PROPIOS } from './apoyo'

const NAUFRAGO_LEMAS = [
  '«Cuando tengas esa hambre de... Náufrago te espera!» [frase propia del cliente, verbatim, sitio/perfil social]',
  '«El encebollado y ceviche que llegan a donde estás» [propuesta del agente — centra el diferenciador delivery + especialidad]',
  '«El mar en tu puerta, de jueves a lunes» [propuesta del agente — delivery + ventana horaria como promesa de disponibilidad]',
]
const ZR_LEMAS = [
  'Todo lo que tu empresa necesita para pasar la inspección, en un solo lugar.',
  'el cliente dice: «📣 Contamos con el mejor precio del mercado adaptados a las necesidades de empresas y fábricas.», señalética y más — a todo Ecuador.',
  'Seguridad industrial completa para tu empresa. Sin vueltas.',
]

/** las columnas de `client_brand_books` (leídas de la base el 30-oct) */
const COLUMNAS_DE_LA_TABLA = new Set(['brand_purpose', 'brand_vision', 'brand_mission', 'brand_values', 'brand_personality', 'voice_description', 'tagline', 'key_messages', 'value_propositions', 'forbidden_words', 'required_terminology', 'positioning', 'tone_guidelines', 'writing_style', 'elevator_pitch'])

describe('la definición única · una fila por campo', () => {
  it('cada campo tiene EXACTAMENTE un lugar (columna o ruta), una clave única y una etiqueta', () => {
    const claves = CAMPOS.map((c) => c.clave)
    expect(new Set(claves).size).toBe(claves.length)
    for (const c of CAMPOS) {
      expect(!!c.columna !== !!c.ruta, `${c.clave}: columna XOR ruta`).toBe(true)
      expect(c.etiqueta.length).toBeGreaterThan(2)
      if (c.columna) expect(COLUMNAS_DE_LA_TABLA.has(c.columna), `${c.clave} → ${c.columna} no existe en la tabla`).toBe(true)
    }
  })
  it('todo campo que un agente puede proponer está definido (si no, la propuesta escribiría un campo sin destino)', () => {
    for (const k of Object.keys(CAMPOS_PROPONIBLES)) expect(CAMPO_POR_CLAVE[k], `${k} no está en la definición`).toBeDefined()
  })
  it('el cerebro INDEXA cada columna de la definición (si no, el campo se llenaría y nadie lo leería)', () => {
    for (const c of CAMPOS.filter((x) => x.columna)) {
      const fila = { [c.columna as string]: (c.tipo_de_columna ?? c.tipo) === 'lista' ? ['dato'] : 'dato' }
      const trozos = chunksFromBrandBook(fila)
      expect(trozos.map((t) => t.section_label), `${c.clave} → ${c.columna}`).toContain(c.columna)
    }
  })
  it('cada trozo del cerebro lleva la fuente, la confianza y el estado de su campo (condición 2 del Cerebro)', () => {
    const fila = {
      brand_mission: 'Llevar el mar a la mesa',
      content_text: JSON.stringify({ brand_book_draft: { _field_meta: { mision: { estado: 'confirmado', fuente: 'sitio', confianza: 0.9 } } } }),
    }
    const t = chunksFromBrandBook(fila).find((x) => x.section_label === 'brand_mission')
    expect(t?.metadata).toMatchObject({ campo: 'mision', procedencia: { fuente: 'sitio', confianza: 0.9, estado: 'confirmado' } })
  })
  it('los campos que el tablero edita tienen su clave de tablero y los derivados no se editan', () => {
    expect(CAMPOS.filter((c) => c.clave_del_tablero).map((c) => c.clave_del_tablero).sort()).toEqual(['eslogan', 'nunca', 'posicionamiento', 'proposito', 'publico', 'valores', 'voz'])
    expect(CAMPO_POR_CLAVE.icp_summary.editable).toBe(false)
    expect(CAMPO_POR_CLAVE.customer_angle.editable).toBe(false)
  })
  it('N1 · valores, productos, sedes, lo que nunca hace y visión son obligatorios, además de los de siempre', () => {
    const o = obligatoriosPara()
    for (const k of ['valores', 'productos', 'sedes', 'nunca_hace', 'vision', 'proposito', 'mision', 'positioning', 'voice_description', 'icp_summary']) expect(o).toContain(k)
    expect(o).not.toContain('forbidden_words')
    expect(o).not.toContain('customer_angle')
  })
  it('un tipo de negocio es un dato: sin local no exige sedes; un tipo desconocido usa la base', () => {
    expect(REGLAS_POR_TIPO.sin_local.quita).toContain('sedes')
    expect(obligatoriosPara('sin_local')).not.toContain('sedes')
    expect(obligatoriosPara('sin_local')).toContain('valores')
    expect(obligatoriosPara('inventado')).toEqual(obligatoriosPara())
  })
})

describe('E1 · del borrador a la columna', () => {
  it('Náufrago: los seis (y vision/valores si vienen) llegan a SU columna; personalidad un rasgo por línea', () => {
    const c = columnasDelBorrador({
      mision: 'Náufrago sirve cocina de mar costeña.', proposito: 'Demostrar que la cocina honesta no necesita pretensiones.', vision: 'Ser la mesa del mar en Olón.', valores: ['Frescura', 'Honestidad'],
      personalidad: ['Sin pretensiones', 'Directo', 'Arraigado'], tagline_opciones: NAUFRAGO_LEMAS, mensajes_clave: ['a', 'b'], propuestas_de_valor: ['x', 'y'],
    })
    expect(c.brand_mission).toBe('Náufrago sirve cocina de mar costeña.')
    expect(c.brand_purpose).toContain('no necesita pretensiones')
    expect(c.brand_vision).toBe('Ser la mesa del mar en Olón.')
    expect(c.brand_values).toEqual(['Frescura', 'Honestidad'])
    expect(c.brand_personality).toBe('Sin pretensiones\nDirecto\nArraigado')
    expect(c.key_messages).toEqual(['a', 'b']); expect(c.value_propositions).toEqual(['x', 'y'])
  })
  it('el eslogan de la columna es SOLO el que el cliente declaró (verbatim), sin rótulo ni comillas; las propuestas del agente no van', () => {
    expect(columnasDelBorrador({ tagline_opciones: NAUFRAGO_LEMAS }).tagline).toBe('Cuando tengas esa hambre de... Náufrago te espera!')
    expect(eslogan_declarado(NAUFRAGO_LEMAS)).not.toContain('[')
  })
  it('Cerebro cond. 3 · una cita pegada como lema NUNCA va a la columna; sin declarado queda null (hueco, no relleno)', () => {
    expect(columnasDelBorrador({ tagline_opciones: ZR_LEMAS }).tagline).toBeNull()
    expect(esLemaCitado(ZR_LEMAS[1])).toBe(true); expect(esLemaCitado(ZR_LEMAS[0])).toBe(false)
    expect(eslogan_declarado(['el cliente dice: «Hola» [frase propia del cliente, verbatim]'])).toBeNull()
    expect(eslogan_declarado(['Uno [frase propia del cliente]', 'Dos [frase propia del cliente]'])).toBeNull() // dos declarados: no se elige por máquina
    expect(eslogan_declarado(undefined)).toBeNull()
  })
  it('un borrador viejo sin esos campos no rompe: todo null', () => {
    const c = columnasDelBorrador({ positioning: 'x' })
    expect(Object.values(c).every((v) => v === null)).toBe(true)
  })
  it('la prosa ya limpia manda sobre la cruda (la advertencia interna no viaja en misión/propósito)', () => {
    const c = columnasDelBorrador({ mision: 'Misión X ADVERTENCIA', proposito: 'P' }, { mision: 'Misión X' })
    expect(c.brand_mission).toBe('Misión X')
  })
  it('buildBrandBookRow escribe las columnas y deja el cierre y las fugas en content_text', () => {
    const fila = buildBrandBookRow('c', { positioning: 'p', voice_description: 'v', mision: 'M', proposito: 'P', personalidad: ['rasgo (discovery_summary)'], tagline_opciones: NAUFRAGO_LEMAS }, { source: 'prueba' }, 2)
    expect(fila.brand_mission).toBe('M'); expect(fila.brand_purpose).toBe('P'); expect(fila.tagline).toContain('Náufrago te espera')
    const ct = JSON.parse(String(fila.content_text))
    expect(ct.completitud.completo).toBe(false)
    expect(ct.completitud.huecos.map((h: { clave: string }) => h.clave)).toContain('valores')
    expect(ct._leaked_internal_terms.brand_personality).toContain('discovery_summary')
    expect(fugasDeLasColumnas({ personalidad: ['limpio'] })).toEqual({})
  })
  it('el buildBrandBookRow de siempre no cambia sus otras columnas ni su regla «sale siempre, marcado»', () => {
    const fila = buildBrandBookRow('c', { positioning: 'p', voice_description: 'v', forbidden_words: ['a'] }, { gate_outcome: 'salio_al_tope' }, 1)
    expect(fila).toMatchObject({ positioning: 'p', voice_description: 'v', forbidden_words: ['a'], gate_outcome: 'salio_al_tope', human_validated: false, auto_generated: true })
  })
})

describe('N2 · el cierre: completo, o con sus huecos a la vista', () => {
  const COMPLETO: Record<string, unknown> = Object.fromEntries(obligatoriosPara().map((k) => [k, CAMPO_POR_CLAVE[k].tipo === 'lista' ? ['dato real'] : 'dato real']))
  it('todo lleno ⇒ completo', () => {
    const c = evaluarCompletitud(COMPLETO)
    expect(c.completo).toBe(true); expect(c.huecos).toEqual([]); expect(c.llenos.length).toBe(obligatoriosPara().length)
  })
  it('un vacío, [] o PENDIENTE es hueco y dice qué se buscó; nunca se rellena', () => {
    const c = evaluarCompletitud({ ...COMPLETO, valores: [], sedes: 'PENDIENTE', vision: '   ' }, { buscadoEn: ['el sitio', 'Instagram'] })
    expect(c.completo).toBe(false)
    expect(c.huecos.map((h) => h.clave).sort()).toEqual(['sedes', 'valores', 'vision'])
    expect(c.huecos[0].nota).toContain('busqué en el sitio, Instagram')
  })
  it('una propuesta del agente rotulada cuenta como propuesta (no hueco, no lleno)', () => {
    const c = evaluarCompletitud({ ...COMPLETO, valores: ['Frescura [propuesta del agente — el sitio lo repite]'] })
    expect(c.propuestos).toEqual(['valores']); expect(c.completo).toBe(true)
    expect(estadoDelCampo('x [propuesta del agente — y]')).toBe('propuesta'); expect(estadoDelCampo('x')).toBe('lleno'); expect(estadoDelCampo(null)).toBe('hueco')
  })
  it('sin_local no exige sedes', () => {
    expect(evaluarCompletitud({ ...COMPLETO, sedes: [] }, { tipo: 'sin_local' }).completo).toBe(true)
    expect(evaluarCompletitud({ ...COMPLETO, sedes: [] }).completo).toBe(false)
  })
  it('visual «completo» con tipografía vacía dice «sin letra observada»; con letra, no', () => {
    const sin = evaluarCompletitud({ ...COMPLETO, visual: { estado: 'completo', capa_grafica: { tipografias: [] } }, typography: [] })
    expect(sin.visual).toEqual({ estado: 'completo', tipografia: 'sin_letra_observada' }); expect(rotuloVisual(sin.visual)).toBe('completo · sin letra observada')
    const con = evaluarCompletitud({ ...COMPLETO, visual: { estado: 'completo', capa_grafica: { tipografias: [{ nombre: 'Inter', rol: 'titulos' }] } } })
    expect(con.visual.tipografia).toBe('con_letra'); expect(rotuloVisual(con.visual)).toBe('completo')
    expect(evaluarCompletitud(COMPLETO).visual.tipografia).toBe('no_aplica')
  })
})

describe('quién validó', () => {
  it('jefatura · dueño · propuesta (un manual firmado antes de este ciclo cuenta como del dueño)', () => {
    expect(quienValido({ human_validated: true, provenance_tag: { validado_por: 'jefatura' } })).toBe('jefatura')
    expect(quienValido({ human_validated: true, provenance_tag: { validado_por: 'dueno' } })).toBe('dueno')
    expect(quienValido({ human_validated: true, provenance_tag: { type: 'evidence' } })).toBe('dueno')
    expect(quienValido({ human_validated: true })).toBe('dueno')
    expect(quienValido({ human_validated: false, provenance_tag: { validado_por: 'jefatura' } })).toBe('propuesta')
    expect(quienValido({})).toBe('propuesta')
  })
})

describe('E4 · la jefatura decide', () => {
  const ok = { fidelidad: { umbral: 0.85, puntajes: { positioning: 0.9, icp_summary: 0.9 }, bajo_umbral: [] as string[] }, completitud: evaluarCompletitud(Object.fromEntries(obligatoriosPara().map((k) => [k, CAMPO_POR_CLAVE[k].tipo === 'lista' ? ['x'] : 'x']))), segunda_mirada: true, dudas_abiertas: 0 }
  it('valida solo si TODO se cumple', () => { expect(decidirLaJefatura(ok)).toEqual({ valida: true, motivos: [] }) })
  it('cada condición, por separado, impide validar y se dice cuál', () => {
    expect(decidirLaJefatura({ ...ok, fidelidad: null }).motivos[0]).toContain('no corrió')
    expect(decidirLaJefatura({ ...ok, fidelidad: { ...ok.fidelidad, bajo_umbral: ['positioning'] } }).motivos[0]).toContain('positioning')
    expect(decidirLaJefatura({ ...ok, completitud: evaluarCompletitud({}) }).motivos[0]).toContain('faltan datos obligatorios')
    expect(decidirLaJefatura({ ...ok, segunda_mirada: false }).motivos[0]).toContain('segunda mirada')
    expect(decidirLaJefatura({ ...ok, dudas_abiertas: 2 }).motivos[0]).toContain('2 afirmación')
    for (const malo of [{ fidelidad: null }, { segunda_mirada: false }, { dudas_abiertas: 1 }]) expect(decidirLaJefatura({ ...ok, ...malo }).valida).toBe(false)
  })
})

describe('E4 · la ruta del borrador con la jefatura (base falsa)', () => {
  const C = '11111111-1111-4111-8111-111111111111'
  const WF = { workflow_id: 'w', workflow_execution_id: 'e' }
  const lleno = Object.fromEntries(obligatoriosPara().map((k) => [k, CAMPO_POR_CLAVE[k].tipo === 'lista' ? ['dato propio'] : 'dato propio']))
  const MANUAL = { ...lleno, positioning: 'Una clínica cálida y cercana.', mision: 'Cuidar sonrisas.' }
  const FID = { umbral: 0.85, puntajes: { positioning: 0.9, icp_summary: 0.9 }, bajo_umbral: [] }
  function base(vigenteValidado = false) {
    const db = new DbFalsa()
    db.semilla('clients', [{ id: C, name: 'Clínica Ejemplo', website_url: PROPIOS.sitio, config: { apify: { own_handles: { instagram: 'clinicaejemplo' } } } }])
    db.semilla('client_brand_books', [{ id: 'b1', client_id: C, version: 1, human_validated: vigenteValidado, content_text: JSON.stringify({ brand_book_draft: { positioning: 'Antes.' } }) }])
    db.semilla('apify_raw', [
      filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo', text: 'Una clínica cálida y cercana. Cuidar sonrisas.' }]),
      filaInstagram('i1', 'clinicaejemplo', 'Cuidar sonrisas'),
    ].map((f) => ({ ...f, client_id: C, ensayo: false })))
    return db
  }
  const cuerpo = { client_id: C, manual: MANUAL, costo_usd: 0, fidelidad: FID, opinion: { ok: true, texto: 'bien' }, ...WF }

  it('ADENDA 7 · sin `validador` la jefatura NO valida: borrador + tarjeta en la bandeja del dueño, nada se promueve', async () => {
    const db = base()
    const r = await rutaBorrador(db, { ...cuerpo, dry_run: false })
    expect(r.body).toMatchObject({ ok: true, validador: 'bandeja' })
    expect(r.body.jefatura).toBeUndefined()
    expect(String(r.body.hitl_id ?? '')).not.toBe('')
    expect(db.tablas['client_brand_books']).toHaveLength(1)
  })

  it('todo cumplido ⇒ versión nueva vigente, validada por la jefatura y con fecha; SIN tarjeta para el dueño', async () => {
    const db = base()
    const r = await rutaBorrador(db, { ...cuerpo, validador: 'jefatura', dry_run: false })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, validador: 'jefatura', hitl_id: null })
    expect((r.body.jefatura as { valida: boolean }).valida).toBe(true)
    const filas = db.tablas['client_brand_books']
    expect(filas).toHaveLength(2)
    expect(filas[1]).toMatchObject({ version: 2, human_validated: true })
    expect((filas[1].provenance_tag as Record<string, unknown>)).toMatchObject({ validado_por: 'jefatura' })
    expect(typeof (filas[1].provenance_tag as Record<string, unknown>).validado_en).toBe('string')
    expect(quienValido(filas[1] as never)).toBe('jefatura')
    expect(db.tablas['hitl_queue'] ?? []).toHaveLength(0)
  })
  it('si falta algo (hueco, fidelidad, segunda mirada) NO valida: el borrador queda `draft`, dice por qué y nada va a la bandeja', async () => {
    for (const malo of [{ manual: { ...MANUAL, valores: [] } }, { fidelidad: { ...FID, bajo_umbral: ['positioning'] } }, { opinion: { ok: false, error: 'caído' } }]) {
      const db = base()
      const r = await rutaBorrador(db, { ...cuerpo, ...malo, validador: 'jefatura', dry_run: false })
      expect(r.status).toBe(200)
      expect((r.body.jefatura as { valida: boolean; motivos: string[] }).valida).toBe(false)
      expect((r.body.jefatura as { motivos: string[] }).motivos.length).toBeGreaterThan(0)
      expect(db.tablas['client_brand_books']).toHaveLength(1)
      expect(db.tablas['client_historical_outputs'][0]).toMatchObject({ status: 'draft' })
      expect(db.tablas['hitl_queue'] ?? []).toHaveLength(0)
    }
  })
  it('dry_run no escribe nada y devuelve lo que decidiría', async () => {
    const db = base()
    const r = await rutaBorrador(db, { ...cuerpo, validador: 'jefatura', dry_run: true })
    expect(r.body).toMatchObject({ simulado: true })
    expect((r.body.jefatura as { valida: boolean }).valida).toBe(true)
    expect(db.tablas['client_brand_books']).toHaveLength(1); expect(db.tablas['client_historical_outputs'] ?? []).toHaveLength(0)
  })
  it('sin cambios y el vigente YA validado ⇒ no hay nada que firmar; sin cambios pero SIN validar ⇒ la jefatura lo valida como versión nueva (ninguna fila se edita)', async () => {
    const yaValidado = base(true)
    yaValidado.tablas['client_brand_books'][0].content_text = JSON.stringify({ brand_book_draft: MANUAL })
    const r1 = await rutaBorrador(yaValidado, { ...cuerpo, validador: 'jefatura', dry_run: false })
    expect(r1.body).toMatchObject({ sin_cambios: true, output_id: null }); expect(yaValidado.tablas['client_brand_books']).toHaveLength(1)

    const sinValidar = base(false)
    sinValidar.tablas['client_brand_books'][0].content_text = JSON.stringify({ brand_book_draft: MANUAL })
    const r2 = await rutaBorrador(sinValidar, { ...cuerpo, validador: 'jefatura', dry_run: false })
    expect((r2.body.jefatura as { valida: boolean }).valida).toBe(true)
    expect(sinValidar.tablas['client_brand_books']).toHaveLength(2)
    expect(sinValidar.tablas['client_brand_books'][0]).toMatchObject({ id: 'b1', version: 1, human_validated: false })
  })
  it('`validador: "bandeja"` conserva la tarjeta del dueño como herramienta opcional', async () => {
    const db = base()
    const r = await rutaBorrador(db, { ...cuerpo, validador: 'bandeja', dry_run: false })
    expect(r.body).toMatchObject({ validador: 'bandeja' }); expect(String(r.body.hitl_id)).not.toBe('null')
    expect(db.tablas['hitl_queue']).toHaveLength(1); expect(db.tablas['client_brand_books']).toHaveLength(1)
  })
  it('H3 · el borrador lleva su procedencia (evidencia no confiable) para que ningún lector lo trate como «desconocido»', async () => {
    const db = base()
    await rutaBorrador(db, { ...cuerpo, validador: 'jefatura', manual: { ...MANUAL, valores: [] }, dry_run: false })
    expect(db.tablas['client_historical_outputs'][0].provenance_tag).toMatchObject({ type: 'evidence', trust_level: 'untrusted' })
  })
})
