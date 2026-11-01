/**
 * ENCARGO Lenovo 01-nov firmado por Emilio (corrida 210273): el revisor tiene la misma carpeta que quien escribe, ningún tope de tamaño corta una corrida, y una mesa bien citada no se descarta. US$ 0, sin red.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { carpetaParaRevisar, textoDeLaCarpeta } from '../src/lib/jefatura/revision/carpeta-para-revisar'
import { TOPE_DE_CARACTERES_DEL_PLAN } from '../src/lib/jefatura/revision/formatos'
import { TOPE_REAL_DEL_PEDIDO } from '../src/lib/limites-de-tamano'
import { MESA as _M, armarMaterial, leerInforme, TOPE_DEL_INFORME, TOPE_DEL_MATERIAL, type Analista } from '../src/lib/planeacion/mesa-de-analisis'
import { PEDIDO_MAXIMO } from '../src/lib/planeacion/puertas'
import { MAX_TAREA_RUN_SDK } from '../src/lib/finanzas/conversa/modelo-run-sdk'
import { idsCitadosEnElTexto } from '../src/lib/portero-alimenta/contexto-del-cliente'
import { erroresDeCambios } from '../src/lib/oficina/cambios-del-dueno'
import { MINUTOS_PARA_DAR_POR_MUERTO, MINUTOS_QUE_ESPERA_EL_TURNO } from '../src/lib/jefatura/revision/orquestador'
import { REGLA_DE_LAS_PALABRAS_DEL_MANUAL } from '../src/lib/jefatura/revision/pedidos'
import { brazoAnalisis } from '../src/lib/planeacion/brazos'

void _M
const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const F1 = '9f51be94-0000-4000-8000-000000000001'
const F2 = '5a749707-0000-4000-8000-000000000002'
const RAIZ = join(__dirname, '..')

describe('sin topes de tamaño arbitrarios', () => {
  it('el tope único es el real: cabe de sobra lo medido y queda bajo el 1 MB del corredor', () => {
    expect(TOPE_REAL_DEL_PEDIDO).toBeGreaterThan(125_108 * 4)
    expect(TOPE_REAL_DEL_PEDIDO).toBeLessThan(1_000_000)
  })
  it('todas las puertas y recortes usan ese mismo tope', () => {
    for (const t of [PEDIDO_MAXIMO, TOPE_DE_CARACTERES_DEL_PLAN, TOPE_DEL_MATERIAL, TOPE_DEL_INFORME, MAX_TAREA_RUN_SDK]) expect(t).toBe(TOPE_REAL_DEL_PEDIDO)
    const contrato = JSON.parse(readFileSync(join(RAIZ, 'src/lib/contracts/inputs/agents-run-sdk.json'), 'utf8')) as { properties: { task: { maxLength: number } } }
    expect(contrato.properties.task.maxLength).toBe(TOPE_REAL_DEL_PEDIDO)
  })
  it('un material grande ya no se recorta', () => {
    const fichas = Array.from({ length: 50 }, (_, i) => ({ ficha_id: `id-${i}`, clase: 'x', fecha: null, contenido: 'y'.repeat(1_000) }))
    const m = armarMaterial({ resumen_vivo: null, fichas })
    expect(m.recortado).toBe(false); expect(m.fichas).toBe(50); expect(m.texto).not.toContain('se recortó')
  })
})

describe('la mesa: un informe bien citado no se descarta', () => {
  const analista = { tipo: 'retencion', agente: 'growth-hacker', exige: 'cita' } as unknown as Analista
  const INFORME = `- Un hallazgo de verdad [ficha:9f51be94] · abre una oportunidad\n- Otro hallazgo [ficha:5a749707 · ficha:ffffffff]`
  it('🔴 caso real de la corrida 210273: la consulta no trajo fichas y las citas salen del resumen vivo', () => {
    const sin = armarMaterial({ resumen_vivo: 'el negocio [ficha:9f51be94 · 2026-10-01]', fichas: [] })
    expect(leerInforme(INFORME, analista, sin.ids).hallazgos).toBe(0)
    const con = armarMaterial({ resumen_vivo: 'el negocio [ficha:9f51be94 · 2026-10-01]', fichas: [], ids_del_resumen: [F1, F2] })
    const l = leerInforme(INFORME, analista, con.ids)
    expect(l.hallazgos).toBe(2)
    expect([...l.citas].sort()).toEqual([F1, F2].sort())
    expect(con.fichas).toBe(0)
  })
  it('una cita a algo que no está ni en el resumen ni en las fichas sigue sin contar', () => {
    const m = armarMaterial({ resumen_vivo: 'x', fichas: [], ids_del_resumen: [F1] })
    expect(leerInforme('- Inventado [ficha:ffffffff]', analista, m.ids).hallazgos).toBe(0)
  })
  it('del resumen al id completo: solo de ESTE cliente, y un prefijo repetido no cuenta', async () => {
    const r = '[ficha:9f51be94 · x] [ficha:5a749707 · y] [ficha:abcdef01 · z] [ficha:12345678 · w]'
    const db = new DbFalsa().semilla('cerebro_fichas', [{ id: F1, client_id: C }, { id: F2, client_id: 'otro' }, { id: 'abcdef01-0000-4000-8000-000000000003', client_id: C }, { id: 'abcdef01-0000-4000-8000-000000000004', client_id: C }, { id: '99999999-0000-4000-8000-000000000005', client_id: C }])
    expect(await idsCitadosEnElTexto(db as never, C, r)).toEqual([F1])
    expect(await idsCitadosEnElTexto(db as never, C, 'sin citas')).toEqual([])
    const roto = new DbFalsa(); roto.fallar['cerebro_fichas'] = 'caída'
    expect(await idsCitadosEnElTexto(roto as never, C, r)).toEqual([])
  })
})

describe('el revisor tiene la misma carpeta', () => {
  it('un resumen vivo que no está vigente no se presenta como vigente', () => {
    const r = textoDeLaCarpeta({ resumen_vivo: { estado: 'vencido', texto: 'RESUMEN VIEJO' }, informes: [] } as never)
    expect(r).not.toContain('RESUMEN VIEJO')
    expect(r).toContain('(resumen vivo: vencido)')
  })
  it('el texto lleva el resumen vivo y los informes enteros, y dice lo que no se pudo leer', () => {
    const t = textoDeLaCarpeta({ resumen_vivo: { estado: 'vigente', texto: 'RESUMEN', sedes: [{ clave: 's', texto: 'DE SEDE' }] }, informes: [{ tipo: 'mercado', texto: 'x'.repeat(50_000) }] } as never)
    expect(t).toContain('RESUMEN'); expect(t).toContain('[sede s] DE SEDE'); expect(t).toContain('x'.repeat(50_000))
    expect(textoDeLaCarpeta({ resumen_vivo: { estado: 'sin_resumen_vivo' }, informes: [], informes_estado: 'no_se_pudo_leer', informes_detalle: 'caída' } as never)).toContain('no se pudieron leer: caída')
  })
  it('junta carpeta, dueño y páginas propias; las de la competencia y otros clientes no entran', async () => {
    const db = new DbFalsa()
      .semilla('client_sede_datos', [{ id: 'd', client_id: C, sede_id: 's1', campo: 'tipo_de_atencion', valor_texto: 'local y domicilio', fuente: 'dueno', observado_en: '2026-10-12T00:00:00Z' }])
      .semilla('client_sedes', [{ id: 's1', client_id: C, clave: 'norte', ciudad: 'Norte' }])
      .semilla('client_web_pages', [
        { url: 'https://a.test/menu', client_id: C, competitor_id: null, owner_role: 'propio', content_text: 'ENCEBOLLADO 4,00' },
        { url: 'https://b.test', client_id: C, competitor_id: 'x', owner_role: 'competidor', content_text: 'AJENO' },
        { url: 'https://c.test', client_id: 'otro', competitor_id: null, owner_role: 'propio', content_text: 'OTRO' },
      ])
    const c = await carpetaParaRevisar(db, C)
    const t = (s: string) => c.find((x) => x.titulo.includes(s))?.texto ?? ''
    expect(c.map((x) => x.titulo).join('|')).toContain('La carpeta del cliente')
    expect(t('dueño')).toContain('local y domicilio')
    expect(t('páginas')).toContain('ENCEBOLLADO 4,00'); expect(t('páginas')).toContain('https://a.test/menu')
    expect(JSON.stringify(c)).not.toContain('AJENO'); expect(JSON.stringify(c)).not.toContain('OTRO')
  })
  it('🔴 una fuente que falla viaja DICHA, nunca como que no existe, y nunca tumba la revisión', async () => {
    const db = new DbFalsa(); db.fallar['client_web_pages'] = 'caída'
    const c = await carpetaParaRevisar(db, C)
    expect(c.find((x) => x.titulo.includes('páginas'))?.texto).toMatch(/no se pudo leer: caída.*No lo tomes como que no existe/)
  })
  it('sin páginas ni datos del dueño, no se inventa un bloque vacío', async () => {
    const c = await carpetaParaRevisar(new DbFalsa(), C)
    expect(c.map((x) => x.titulo)).toEqual(['La carpeta del cliente (la misma que recibe quien escribe)'])
  })
})

describe('las palabras del manual son contexto (ADENDA de Emilio)', () => {
  it('la regla al revisor pide razonar la intención y descarta la coincidencia literal', () => {
    expect(REGLA_DE_LAS_PALABRAS_DEL_MANUAL).toMatch(/contexto de marca/)
    expect(REGLA_DE_LAS_PALABRAS_DEL_MANUAL).toMatch(/claim propio que no se pueda comprobar/)
    expect(REGLA_DE_LAS_PALABRAS_DEL_MANUAL).toMatch(/reseña de un cliente, citada y atribuida/)
    expect(REGLA_DE_LAS_PALABRAS_DEL_MANUAL).toMatch(/coincidir con la lista no basta/)
    const lee = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
    expect(lee('src/lib/jefatura/revision/pedidos.ts')).toMatch(/bloqueDeContexto\(a\.payload\.contexto \?\? \[\]\), REGLA_DE_LAS_PALABRAS_DEL_MANUAL/)
  })
  it('ningún chequeo de la cadena bloquea por una palabra de la lista', () => {
    const lee = (p: string) => readFileSync(join(RAIZ, p), 'utf8')
    expect(lee('src/lib/cadena/brief-creativo.ts')).not.toMatch(/contienePalabraEntera\(loQuePide, p\)\) bloqueos\.push/)
    expect(lee('src/lib/cadena/validador-calendario.ts')).not.toMatch(/h\('V15', 'bloquea', f, `el tema usa la palabra/)
    expect(lee('src/lib/cadena/mesas.ts')).not.toMatch(/PALABRAS PROHIBIDAS|sin palabras prohibidas/)
    expect(lee('src/lib/client-brain.ts')).not.toMatch(/never use these/)
  })
})

describe('la escucha en X sin material no es una falla', () => {
  const correr = (tipo: string) => brazoAnalisis({ objetivo: 'o', fuente: 'f', tipo, agente: 'a', rotulo: 'r', dry_run: false, esperados: { min: 1, max: 5 }, pedir: async () => ({ ok: true, salida: 'Sin dato: no hay publicaciones.', costo_usd: 0.1 }), leer: () => ({ hallazgos: 0, declara_sin_dato: true, lineas_sin_sosten: 0, citas: [], informe: '', recortado: false, citas_ajenas: 0 }), archivar: async () => ({ ok: true, detalle: '' }) } as never)
  it('X dice «sin material de X todavía»; otro analista sigue con su motivo', async () => {
    const x = await correr('escucha_x') as { estado: string; motivo: string }
    expect(x.estado).toBe('sin_dato'); expect(x.motivo).toMatch(/^sin material de X todavía/); expect(x.motivo).toMatch(/no es una falla/)
    const otro = await correr('mercado') as { estado: string; motivo: string }
    expect(otro.estado).toBe('sin_dato'); expect(otro.motivo).toMatch(/^fui, miré y no hay/)
  })
})

describe('la jefatura de las piezas lleva la carpeta', () => {
  it('el orquestador la suma al contexto del revisor y, si falla, lo dice sin tumbar la revisión', () => {
    const o = readFileSync(join(RAIZ, 'src/lib/oficina/orquestador.ts'), 'utf8')
    expect(o).toMatch(/contexto: \[\.\.\.material\.contexto, \.\.\.carpeta\]/)
    expect(o).toMatch(/P\.carpetaParaRevisar\(String\(enc\.client_id\)\)\.catch\([^\n]*no se pudo leer[^\n]*No lo tomes como que no existe/)
    expect(readFileSync(join(RAIZ, 'src/lib/oficina/adaptadores.ts'), 'utf8')).toMatch(/carpetaParaRevisar: \(clientId\) => carpetaParaRevisar\(db, clientId\)/)
  })
})

describe('lo que escribe el dueño no tiene un tope corto', () => {
  it('el sobre de los cambios de una pieza admite 100.000 caracteres y rechaza uno más', () => {
    const sobre = (n: number) => ({ ronda: 1, comentario: 'a'.repeat(n), laminas: [], desde_hitl: 'h', pedido_por: 'emilio' })
    expect(erroresDeCambios(sobre(100_000)).join(' ')).not.toMatch(/comentario/)
    expect(erroresDeCambios(sobre(100_001)).join(' ')).toMatch(/comentario/)
  })
})

describe('una lectura fallida de los datos del dueño', () => {
  it('🔴 viaja dicha: el revisor no la lee como que el dueño no dijo nada', async () => {
    const tabla = (t: string) => { const c: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'maybeSingle']) c[m] = () => c; c.then = (ok: (v: unknown) => unknown) => ok({ data: t === 'client_sedes' ? null : [], error: t === 'client_sedes' ? { message: 'caída' } : null }); return c }
    const carpeta = await carpetaParaRevisar({ from: tabla }, 'c1')
    expect(carpeta.find((x) => x.titulo === 'Lo que dijo el dueño')?.texto).toMatch(/no se pudo leer.*No lo tomes como que no existe/)
  })
})

describe('el vigía no le gana al turno que recoge la respuesta', () => {
  it('🔴 da por muerto un paso solo después de la espera del turno (hallazgo de CC3)', () => {
    expect(MINUTOS_QUE_ESPERA_EL_TURNO).toBe(31)
    expect(MINUTOS_PARA_DAR_POR_MUERTO).toBeGreaterThanOrEqual(MINUTOS_QUE_ESPERA_EL_TURNO + 3) // colchón: el turno necesita unos segundos para entregar lo que recogió
  })
})
