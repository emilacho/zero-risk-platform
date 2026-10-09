/**
 * RELEVO 21 · punto 2 · EL ETIQUETADO DIARIO · pruebas PERMANENTES, US$ 0, sin red ni modelo.
 * Ejecutan el MISMO texto del bloque que el flujo `EZXAFQvKZsJlvGNO` lleva dentro de su nodo ② (`scripts/n8n-nodos/cerebro-diario-etiquetar.js`) contra una base y una ruta simuladas,
 * y prueban la excepción declarada del detector de flujos vivos (`cerebro-tablas-no-las-usa-nadie.mjs`).
 * Lo que cuidan: solo foto PROPIA sin etiqueta · topes (fotos por cliente, gasto del día, intentos por foto) · un fallo de lectura jamás se lee como «no hay nada» · nunca `forzar` ni `solo_toma` ·
 * solo lectura de la base · la excepción cubre SOLO esa lectura en ese nodo de ese flujo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const RAIZ = process.cwd()
const TEXTO_DEL_BLOQUE = fs.readFileSync(path.join(RAIZ, 'scripts/n8n-nodos/cerebro-diario-etiquetar.js'), 'utf8')
type Resp = { statusCode: number; body: unknown }
type Dep = { SB: string; API: string; auth: object; hoy0: string; cliente: string; topes: Topes; flujoId: string; ejecucionId: string; leer: (u: string, h: object) => Promise<Resp>; enviar: (u: string, b: Record<string, unknown>) => Promise<Resp> }
type Topes = { fotos_por_cliente_dia: number; usd_dia: number; intentos_por_foto: number; peor_caso_usd: number }
type Salida = { sin_etiqueta: number; elegibles: number; llamadas: Array<Record<string, unknown>>; gastado_usd: number; gasto_de_hoy_antes_usd: number | null; agotadas: Array<{ foto: string; intentos: number }>; parado: string | null }
const etiquetarFotos = new Function(`${TEXTO_DEL_BLOQUE}\nreturn etiquetarFotos`)() as (d: Dep) => Promise<Salida>

const TOPES: Topes = { fotos_por_cliente_dia: 5, usd_dia: 0.1, intentos_por_foto: 2, peor_caso_usd: 0.0286 }
const CLIENTE = '41dd3d62-0000-4000-8000-000000000001'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface Mundo { gastoHoy?: number[]; fotos?: number[]; intentos?: Record<string, number>; fallaGasto?: number; fallaFotos?: number; fallaIntentos?: number; ruta?: (foto: string, n: number) => Resp }
function montar(m: Mundo, topes: Topes = TOPES) {
  const gets: string[] = []
  const posts: Array<{ url: string; body: Record<string, unknown> }> = []
  let n = 0
  const d: Dep = {
    SB: 'https://base.test', API: 'https://api.test', auth: { k: 1 }, hoy0: '2026-10-09T00:00:00.000Z', cliente: CLIENTE, topes, flujoId: 'EZXAFQvKZsJlvGNO', ejecucionId: '777',
    leer: async (u) => {
      gets.push(u)
      if (u.includes('agent_invocations') && u.includes('created_at=gte')) return m.fallaGasto ? { statusCode: m.fallaGasto, body: { message: 'x' } } : { statusCode: 200, body: (m.gastoHoy ?? []).map((c) => ({ cost_usd: c })) }
      if (u.includes('client_social_images')) return m.fallaFotos ? { statusCode: m.fallaFotos, body: {} } : { statusCode: 200, body: (m.fotos ?? []).map((k) => ({ id: id(k), etiquetada_en: null })) }
      if (u.includes('agent_invocations') && u.includes('foto_id')) {
        if (m.fallaIntentos) return { statusCode: m.fallaIntentos, body: {} }
        const filas: Array<{ metadata: { foto_id: string } }> = []
        for (const [f, c] of Object.entries(m.intentos ?? {})) for (let i = 0; i < c; i++) filas.push({ metadata: { foto_id: f } })
        return { statusCode: 200, body: filas }
      }
      throw new Error('lectura inesperada: ' + u)
    },
    enviar: async (u, b) => {
      posts.push({ url: u, body: b })
      n += 1
      return (m.ruta ?? (() => ({ statusCode: 200, body: { modo: 'etiquetado', llamo_al_modelo: true, escribio: true, costo_usd: 0.01, columnas_escritas: ['x'] } })))(String(b.foto), n)
    },
  }
  return { d, gets, posts }
}

describe('el bloque del etiquetado diario', () => {
  it('sin fotos sin etiqueta: solo mira, no llama a la ruta', async () => {
    const { d, posts } = montar({ fotos: [] })
    const r = await etiquetarFotos(d)
    expect(r.sin_etiqueta).toBe(0); expect(r.llamadas).toEqual([]); expect(posts).toEqual([]); expect(r.parado).toBeNull()
  })
  it('pide `etiquetar` por cada foto sin etiqueta, con el cuerpo EXACTO (nunca `forzar` ni `solo_toma`) y suma el costo real', async () => {
    const { d, posts } = montar({ fotos: [1, 2, 3] })
    const r = await etiquetarFotos(d)
    expect(posts.map((p) => p.url)).toEqual(['https://api.test/api/brain/portero/etiquetar', 'https://api.test/api/brain/portero/etiquetar', 'https://api.test/api/brain/portero/etiquetar'])
    expect(posts[0].body).toEqual({ cliente: CLIENTE, foto: id(1), workflow_id: 'EZXAFQvKZsJlvGNO', workflow_execution_id: '777' })
    for (const p of posts) { expect(Object.keys(p.body).sort()).toEqual(['cliente', 'foto', 'workflow_execution_id', 'workflow_id']) }
    expect(r.llamadas).toHaveLength(3); expect(r.gastado_usd).toBeCloseTo(0.03, 6); expect(r.parado).toBeNull()
  })
  it('las lecturas son SOLO lo declarado: id y marca de etiquetada, solo fotos PROPIAS del cliente, sin etiqueta; intentos solo los cobrados', async () => {
    const { d, gets } = montar({ fotos: [1] })
    await etiquetarFotos(d)
    const fotos = gets.find((u) => u.includes('client_social_images')) as string
    expect(fotos).toContain('select=id,etiquetada_en&'); expect(fotos).toContain('client_id=eq.' + CLIENTE); expect(fotos).toContain('owner_role=eq.propio'); expect(fotos).toContain('etiquetada_en=is.null')
    const intentos = gets.find((u) => u.includes('foto_id')) as string
    expect(intentos).toContain('agent_name=eq.etiquetador-del-cerebro'); expect(intentos).toContain('cost_usd=gt.0'); expect(intentos).toContain(id(1))
    const gasto = gets.find((u) => u.includes('created_at=gte')) as string
    expect(gasto).toContain('agent_name=eq.etiquetador-del-cerebro')
  })
  it('tope de fotos por cliente y día: de 8 sin etiqueta solo se llama a 5', async () => {
    const { d, posts } = montar({ fotos: [1, 2, 3, 4, 5, 6, 7, 8] })
    const r = await etiquetarFotos(d)
    expect(posts).toHaveLength(5); expect(r.parado).toBe('tope_de_fotos_del_cliente')
  })
  it('tope de gasto del DÍA con lo ya gastado hoy (cualquier origen): 0,09 gastado + peor caso 0,0286 pasa de 0,10 → no llama a nadie', async () => {
    const { d, posts } = montar({ fotos: [1, 2], gastoHoy: [0.05, 0.04] })
    const r = await etiquetarFotos(d)
    expect(posts).toEqual([]); expect(r.parado).toBe('tope_de_gasto_del_dia'); expect(r.gasto_de_hoy_antes_usd).toBeCloseTo(0.09, 6)
  })
  it('el gasto de la propia corrida cuenta: con 0,04 por foto para en la 2.ª (0,08 + 0,0286 > 0,10)', async () => {
    const { d, posts } = montar({ fotos: [1, 2, 3, 4], ruta: () => ({ statusCode: 200, body: { modo: 'etiquetado', llamo_al_modelo: true, escribio: true, costo_usd: 0.04 } }) })
    const r = await etiquetarFotos(d)
    expect(posts).toHaveLength(2); expect(r.parado).toBe('tope_de_gasto_del_dia'); expect(r.gastado_usd).toBeCloseTo(0.08, 6)
  })
  it('una foto con 2 intentos cobrados y sin etiqueta NO se paga otra vez (se declara agotada); las demás sí', async () => {
    const { d, posts } = montar({ fotos: [1, 2], intentos: { [id(1)]: 2, [id(2)]: 1 } })
    const r = await etiquetarFotos(d)
    expect(posts.map((p) => p.body.foto)).toEqual([id(2)]); expect(r.agotadas).toEqual([{ foto: id(1), intentos: 2 }]); expect(r.elegibles).toBe(1)
  })
  it('un fallo al LEER (gasto, fotos o intentos) detiene todo: jamás se lee como «no se gastó nada» ni «no hay fotos»', async () => {
    for (const falla of [{ fallaGasto: 500 }, { fallaFotos: 503 }, { fallaIntentos: 500 }]) {
      const { d, posts } = montar({ fotos: [1, 2], ...falla })
      const r = await etiquetarFotos(d)
      expect(posts, JSON.stringify(falla)).toEqual([]); expect(r.parado, JSON.stringify(falla)).toMatch(/^no_se_pudo_leer/)
    }
  })
  it('si la ruta rechaza (401/403) para en la primera: no se sigue golpeando la puerta', async () => {
    const { d, posts } = montar({ fotos: [1, 2, 3], ruta: () => ({ statusCode: 403, body: { error: 'workflow_id_required' } }) })
    const r = await etiquetarFotos(d)
    expect(posts).toHaveLength(1); expect(r.parado).toMatch(/^la_ruta_rechazo/); expect(r.llamadas[0].error).toBe('workflow_id_required')
  })
  it('si el modelo no responde 2 veces seguidas (sin llamarlo, costo 0) para; una que sí llama reinicia la cuenta', async () => {
    const caido = { statusCode: 200, body: { modo: 'respaldo', motivo_de_respaldo: 'error_del_modelo', llamo_al_modelo: false, escribio: false, costo_usd: 0 } }
    const a = montar({ fotos: [1, 2, 3, 4], ruta: () => caido })
    const ra = await etiquetarFotos(a.d)
    expect(a.posts).toHaveLength(2); expect(ra.parado).toMatch(/^el_modelo_no_responde/)
    const ok = { statusCode: 200, body: { modo: 'etiquetado', llamo_al_modelo: true, escribio: true, costo_usd: 0.01 } }
    const b = montar({ fotos: [1, 2, 3, 4], ruta: (_f, n) => (n % 2 === 0 ? ok : caido) })
    const rb = await etiquetarFotos(b.d)
    expect(b.posts).toHaveLength(4); expect(rb.parado).toBeNull()
  })
  it('un cliente que no es uuid no consulta nada', async () => {
    const { d, gets, posts } = montar({ fotos: [1] })
    const r = await etiquetarFotos({ ...d, cliente: "x' or 1=1" })
    expect(gets).toEqual([]); expect(posts).toEqual([]); expect(r.parado).toBe('cliente_invalido')
  })
  it('el texto del bloque no escribe en ninguna tabla: ni PATCH/POST/DELETE a la base ni `forzar`/`solo_toma`', () => {
    expect(TEXTO_DEL_BLOQUE).not.toMatch(/PATCH|DELETE|upsert|\.update\(|forzar:|solo_toma:/)
    expect(TEXTO_DEL_BLOQUE.match(/d\.enviar\(/g)).toHaveLength(1)
    expect(TEXTO_DEL_BLOQUE).toMatch(/d\.enviar\(d\.API \+ '\/api\/brain\/portero\/etiquetar'/)
  })
})

describe('la excepción declarada del detector de flujos vivos', async () => {
  const det = await import(pathToFileURL(path.join(RAIZ, 'scripts/audit/cerebro-tablas-no-las-usa-nadie.mjs')).href)
  const NODO = '② Ejecutar el plan y medir'
  const LECTURA = "const r = await rest('client_social_images?select=id,etiquetada_en&client_id=eq.' + c + '&owner_role=eq.propio&etiquetada_en=is.null&order=posted_at.desc&limit=20')"
  const flujo = (idF: string, nodos: Array<{ name: string; jsCode: string }>) => ({ id: idF, name: 'f', active: true, nodes: nodos.map((n) => ({ name: n.name, type: 'n8n-nodes-base.code', parameters: { jsCode: n.jsCode } })) })

  it('el bloque REAL del etiquetado, dentro del nodo ② del flujo diario, NO es infracción', () => {
    const r = det.revisarFlujos([flujo('EZXAFQvKZsJlvGNO', [{ name: NODO, jsCode: TEXTO_DEL_BLOQUE }])])
    expect(r.infracciones).toEqual([]); expect(r.ok).toBe(true)
  })
  it('la lectura permitida suelta tampoco', () => {
    expect(det.revisarFlujos([flujo('EZXAFQvKZsJlvGNO', [{ name: NODO, jsCode: LECTURA }])]).ok).toBe(true)
  })
  it('SÍ es infracción: el mismo texto en OTRO flujo', () => {
    const r = det.revisarFlujos([flujo('OTROFLUJO0000000', [{ name: NODO, jsCode: LECTURA }])])
    expect(r.infracciones.map((i: { detalle: string }) => i.detalle)).toEqual(['etiquetada_en'])
  })
  it('SÍ es infracción: el mismo flujo pero OTRO nodo (el ① no está cubierto)', () => {
    const r = det.revisarFlujos([flujo('EZXAFQvKZsJlvGNO', [{ name: '① Plan del día (topes escritos)', jsCode: LECTURA }])])
    expect(r.ok).toBe(false)
  })
  it('SÍ es infracción: en el nodo permitido, una ESCRITURA de la columna (cuerpo con `etiquetada_en`) o cualquier otra columna del cerebro', () => {
    for (const malo of [
      LECTURA + "\nawait http({ method: 'PATCH', url: SB + '/rest/v1/client_social_images?id=eq.1', body: { etiquetada_en: new Date() } })",
      LECTURA + "\nconst x = 'que_muestra'",
      LECTURA + "\nconst y = { con_personas: true }",
      LECTURA + "\nconst z = 'tipo_de_toma'",
      LECTURA + "\nconst t = 'cerebro_fichas'",
      "const r = await rest('client_social_images?select=que_muestra,etiquetada_en&client_id=eq.1')",
    ]) {
      const r = det.revisarFlujos([flujo('EZXAFQvKZsJlvGNO', [{ name: NODO, jsCode: malo }])])
      expect(r.ok, malo.slice(0, 80)).toBe(false)
    }
  })
  it('el detector YA vigila `con_personas` y `tipo_de_toma` en cualquier flujo (en el relevo 19 solo se cambió el comentario, no la expresión)', () => {
    for (const nombre of ['con_personas', 'tipo_de_toma']) {
      const r = det.revisarFlujos([flujo('CUALQUIERA0000000', [{ name: 'n', jsCode: `const a = '${nombre}'` }])])
      expect(r.ok, nombre).toBe(false)
    }
    expect(det.NOMBRES_NUEVOS.test('formato')).toBe(false)
  })
  it('la excepción es UNA: un flujo, un nodo, un nombre (si alguien agrega otra, esta prueba obliga a declararla aquí)', () => {
    expect(Object.keys(det.EXCEPCIONES)).toEqual(['EZXAFQvKZsJlvGNO'])
    expect(det.EXCEPCIONES.EZXAFQvKZsJlvGNO.nodo).toBe(NODO)
    expect(det.EXCEPCIONES.EZXAFQvKZsJlvGNO.nombres).toEqual(['etiquetada_en'])
  })
})

describe('el nodo ① lleva los topes escritos y el nodo ② el bloque (lo comprueba el guion de edición del flujo, y esta prueba fija sus valores)', () => {
  it('los topes firmados del etiquetado diario son estos (cambiarlos exige cambiar esta prueba, a la vista)', () => {
    expect(TOPES).toEqual({ fotos_por_cliente_dia: 5, usd_dia: 0.1, intentos_por_foto: 2, peor_caso_usd: 0.0286 })
  })
})
