/**
 * Fechas especiales · el texto de los PDF oficiales (11-nov · GO Lenovo 19:30, opción b · CC3 construye, CC7 certifica) · US$ 0 (sin red real, sin modelo).
 * Dos países: Ecuador (cafetería, cliente A) y Colombia (clínica, cliente B), con el MISMO código. El PDF se lee con el lector REAL del cerebro (proceso aparte).
 */
import { describe, it, expect } from 'vitest'
import { abrirCampana } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe } from '../__fixtures__/clientes'
import { bajarPdf, fechasLeerPdf, PDF_POR_LLAMADA, type DependenciasDePdf, type ResultadoDeBajada } from '../fechas-pdf'
import { citaRespaldaLaFecha } from '../datos'
import { ACCIONES } from '../acciones'
import { leerPdf } from '@/lib/cerebro/archivos/pdf'
import { crearPdf, textoPagina } from '@/lib/cerebro/archivos/__tests__/muestras'

const A = clienteA() // Ecuador
const B = clienteB() // Colombia
const AHORA = '2026-10-09T12:00:00Z'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const PDF_EC = 'https://www.sri.gob.ec/feriados-2026.pdf'
const PDF_CO = 'https://www.mintrabajo.gov.co/festivos-2026.pdf'
const DOMINIOS = { '*|ecuador': [PDF_EC, 'https://www.turismo.gob.ec/feriados'], '*|colombia': [PDF_CO] }

function mundo(config: Record<string, unknown> = {}) {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: { ...contextoDe(A), pais: 'Ecuador' }, [B.clientId]: { ...contextoDe(B), pais: 'Colombia' } },
    planes: { [A.clientId]: [{ plan_id: 'plan-a', fecha: '2026-10-08' }], [B.clientId]: [{ plan_id: 'plan-b', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'encendida', dominios_fechas: DOMINIOS, ...config },
    journeys: [{ journeyId: 'j-a', clientId: A.clientId }, { journeyId: 'j-b', clientId: B.clientId }],
  })
}
async function campanaDe(al: AlmacenMemoria, clientId: string, seco = false): Promise<string> {
  const r = await abrirCampana(al, { ...wf, client_id: clientId, seco }, AHORA)
  return (r.cuerpo.campana as { id: string }).id
}
const PDF_FERIADOS_EC = crearPdf([textoPagina('Calendario de feriados nacionales 2026', 'Viernes 1 de mayo: Día del Trabajo', 'Lunes 10 de agosto: Primer Grito de Independencia')])
const PDF_FESTIVOS_CO = crearPdf([textoPagina('Festivos en Colombia 2026', 'Lunes 20 de julio: Día de la Independencia')])
const ESCANEADO = crearPdf([{ escaneada: true }])

/** el bajador falso cuenta lo que pidió: así se ve que una dirección fuera de la lista ni se pide */
function deps(porUrl: Record<string, ResultadoDeBajada>): DependenciasDePdf & { pedidas: string[] } {
  const pedidas: string[] = []
  return { pedidas, bajar: async (u) => { pedidas.push(u); return porUrl[u] ?? { ok: false, razon: 'respondió 404' } }, leer: (b, n) => leerPdf(b, n) }
}
const pdf = (bytes: Buffer): ResultadoDeBajada => ({ ok: true, bytes, tipo: 'application/pdf' })
const pedir = (campana_id: string, pais: string, urls: unknown) => ({ ...wf, campana_id, pais, tipo: 'feriados', urls })

describe('leer_pdf · el texto del PDF oficial vuelve como una página más', () => {
  it('Ecuador: el texto del PDF del SRI vuelve como página y la cita del feriado se comprueba contra ese texto', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    const d = deps({ [PDF_EC]: pdf(PDF_FERIADOS_EC) })
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), d)
    expect(r.status).toBe(200)
    const pag = (r.cuerpo.paginas as Array<{ url: string; texto: string }>)
    expect(pag).toHaveLength(1); expect(pag[0].url).toBe(PDF_EC)
    expect(pag[0].texto).toMatch(/Viernes 1 de mayo: Día del Trabajo/)
    expect(citaRespaldaLaFecha({ fecha: '2026-05-01', nombre: 'Día del Trabajo', alcance: 'nacional', fuente_url: PDF_EC, cita_literal: 'Viernes 1 de mayo: Día del Trabajo' }, pag[0].texto)).toBe(true)
    expect(r.cuerpo.descartadas).toEqual([])
  })
  it('Colombia: el MISMO código, con su fuente cargada', async () => {
    const al = mundo(); const id = await campanaDe(al, B.clientId)
    const r = await fechasLeerPdf(al, pedir(id, 'Colombia', [PDF_CO]), deps({ [PDF_CO]: pdf(PDF_FESTIVOS_CO) }))
    expect((r.cuerpo.paginas as Array<{ texto: string }>)[0].texto).toMatch(/Lunes 20 de julio: Día de la Independencia/)
  })
  it('🔴 una dirección que NO está en las fuentes cargadas de ese país ni se pide', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    const d = deps({ [PDF_CO]: pdf(PDF_FESTIVOS_CO), 'https://atacante.test/x.pdf': pdf(PDF_FERIADOS_EC) })
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_CO, 'https://atacante.test/x.pdf']), d)
    expect(d.pedidas).toEqual([])
    expect(r.cuerpo.paginas).toEqual([])
    expect((r.cuerpo.descartadas as Array<{ razon: string }>).every((x) => /no está entre las fuentes oficiales/.test(x.razon))).toBe(true)
  })
  it('🔴 el tipo y el país se leen con la MISMA llave que la cobertura («Feriados locales» → feriados_locales)', async () => {
    const al = mundo({ dominios_fechas: { 'feriados_locales|ecuador': [PDF_EC] } }); const id = await campanaDe(al, A.clientId)
    const d = deps({ [PDF_EC]: pdf(PDF_FERIADOS_EC) })
    await fechasLeerPdf(al, { ...pedir(id, 'Ecuador', [PDF_EC]), tipo: 'Feriados locales' }, d)
    expect(d.pedidas).toEqual([PDF_EC])
  })
  it('🔴 la lista del tipo gana a la del país: con «feriados|ecuador» cargado, la del país ya no vale', async () => {
    const al = mundo({ dominios_fechas: { ...DOMINIOS, 'feriados|ecuador': ['https://otro.gob.ec/f.pdf'] } }); const id = await campanaDe(al, A.clientId)
    const d = deps({ [PDF_EC]: pdf(PDF_FERIADOS_EC) })
    await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), d)
    expect(d.pedidas).toEqual([])
  })
  it('🔴 un PDF escaneado se DECLARA, no se inventa texto', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), deps({ [PDF_EC]: pdf(ESCANEADO) }))
    expect(r.cuerpo.paginas).toEqual([])
    expect((r.cuerpo.descartadas as Array<{ razon: string }>)[0].razon).toMatch(/escaneado/)
  })
  it('🔴 un PDF que casi no trae texto (una portada) no entra como página: se dice por qué', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), deps({ [PDF_EC]: pdf(crearPdf([textoPagina('Feriados 2026')])) }))
    expect(r.cuerpo.paginas).toEqual([])
    expect(r.cuerpo.descartadas).toEqual([{ url: PDF_EC, razon: 'el PDF casi no trae texto' }])
  })
  it('🔴 lo que no empieza con %PDF no se lee como PDF (aunque diga application/pdf)', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    let leyo = false
    const d: DependenciasDePdf = { bajar: async () => ({ ok: true, bytes: Buffer.from('<html>feriados</html>'), tipo: 'application/pdf' }), leer: async (b, n) => { leyo = true; return leerPdf(b, n) } }
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), d)
    expect(leyo).toBe(false)
    expect((r.cuerpo.descartadas as Array<{ razon: string }>)[0].razon).toMatch(/no es un PDF \(application\/pdf\)/)
  })
  it('🔴 si la bajada falla, se dice por qué y no se lee nada', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), deps({ [PDF_EC]: { ok: false, razon: 'respondió 503' } }))
    expect(r.cuerpo.descartadas).toEqual([{ url: PDF_EC, razon: 'respondió 503' }])
  })
  it('en seco se lee igual que en real (como el HTML: bajar y leer no llaman a ningún modelo)', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId, true)
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), deps({ [PDF_EC]: pdf(PDF_FERIADOS_EC) }))
    expect((r.cuerpo.paginas as unknown[]).length).toBe(1)
  })
  it(`🔴 como mucho ${PDF_POR_LLAMADA} PDF por llamada (los de afuera de la lista no cuentan)`, async () => {
    const urls = Array.from({ length: PDF_POR_LLAMADA + 2 }, (_, i) => `https://www.sri.gob.ec/f${i}.pdf`)
    const al = mundo({ dominios_fechas: { '*|ecuador': urls } }); const id = await campanaDe(al, A.clientId)
    const d = deps(Object.fromEntries(urls.map((u) => [u, pdf(PDF_FERIADOS_EC)])))
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', ['https://fuera.test/a.pdf', ...urls]), d)
    expect(d.pedidas).toEqual(urls.slice(0, PDF_POR_LLAMADA))
    expect((r.cuerpo.paginas as unknown[]).length).toBe(PDF_POR_LLAMADA)
  })
  it('🔴 sin workflow_id o sin direcciones, no se atiende', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    expect((await fechasLeerPdf(al, { campana_id: id, pais: 'Ecuador', tipo: 'feriados', urls: [PDF_EC] }, deps({}))).status).toBe(400)
    expect((await fechasLeerPdf(al, pedir(id, 'Ecuador', []), deps({}))).status).toBe(400)
  })
  it('🔴 la llave general del cliente: con la cadena apagada (o en ensayo sin estar en la lista), una campaña REAL no baja ningún PDF', async () => {
    for (const [config, code] of [[{ estado_cadena: 'apagada' }, 'E-CADENA-APAGADA'], [{ estado_cadena: 'ensayo', clientes_ensayo: [B.clientId] }, 'E-CADENA-NO-ADMITIDO']] as const) {
      // la campaña real se abrió con la cadena encendida; después se apagó (o pasó a ensayo)
      const al = mundo(); const id = await campanaDe(al, A.clientId, false)
      for (const [k, v] of Object.entries(config)) await al.escribirConfig(k, v)
      const d = deps({ [PDF_EC]: pdf(PDF_FERIADOS_EC) })
      const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC]), d)
      expect(r.status, code).toBe(409); expect(r.cuerpo.code).toBe(code)
      expect(d.pedidas).toEqual([])
    }
  })
  it('la acción está en la tabla de la ruta de fechas', () => { expect(typeof ACCIONES.fechas.leer_pdf).toBe('function') })
})

describe('bajarPdf · tope, redirecciones y protocolo', () => {
  const resp = (status: number, cuerpo: Buffer | null, headers: Record<string, string> = {}) => new Response(cuerpo ? new Uint8Array(cuerpo) : null, { status, headers })
  it('sigue una redirección dentro del MISMO sitio', async () => {
    const pedidas: string[] = []
    const f = (async (u: string) => { pedidas.push(u); return u.endsWith('/viejo.pdf') ? resp(301, null, { location: '/nuevo.pdf' }) : resp(200, PDF_FERIADOS_EC, { 'content-type': 'application/pdf' }) }) as unknown as typeof fetch
    const r = await bajarPdf('https://www.sri.gob.ec/viejo.pdf', f)
    expect(r.ok).toBe(true); expect(pedidas).toEqual(['https://www.sri.gob.ec/viejo.pdf', 'https://www.sri.gob.ec/nuevo.pdf'])
  })
  it('🔴 NO sigue una redirección a otro sitio', async () => {
    const f = (async () => resp(302, null, { location: 'https://atacante.test/x.pdf' })) as unknown as typeof fetch
    const r = await bajarPdf('https://www.sri.gob.ec/f.pdf', f)
    expect(r).toEqual({ ok: false, razon: 'redirige a otro sitio (atacante.test): no se sigue' })
  })
  it('🔴 corta en el tope de bytes aunque el sitio no diga el tamaño', async () => {
    const f = (async () => resp(200, Buffer.alloc(2000, 65))) as unknown as typeof fetch
    const r = await bajarPdf('https://www.sri.gob.ec/f.pdf', f, 1000)
    expect(r.ok).toBe(false); expect((r as { razon: string }).razon).toMatch(/tope/)
  })
  it('🔴 corta por el tamaño declarado sin leer el cuerpo', async () => {
    const f = (async () => resp(200, Buffer.alloc(10), { 'content-length': '5000' })) as unknown as typeof fetch
    expect(await bajarPdf('https://www.sri.gob.ec/f.pdf', f, 1000)).toEqual({ ok: false, razon: 'pesa 5000 bytes (tope 1000)' })
  })
  it('🔴 un protocolo que no es web no se pide', async () => {
    let pidio = false
    const f = (async () => { pidio = true; return resp(200, PDF_FERIADOS_EC) }) as unknown as typeof fetch
    expect(await bajarPdf('file:///etc/passwd', f)).toEqual({ ok: false, razon: 'protocolo no admitido (file:)' })
    expect(pidio).toBe(false)
  })
  /** un sitio que tarda `ms` en contestar y respeta la señal (como fetch); sin señal, a los 2 s contesta que nadie lo cortó */
  const lento = (ms: number, contestar: (u: string) => Response) => (async (u: string, o?: RequestInit) => new Promise<Response>((ok, mal) => {
    const s = o?.signal
    if (!s) { setTimeout(() => mal(new Error('nadie lo cortó')), 2000); return }
    if (s.aborted) return mal(s.reason)
    const t = setTimeout(() => ok(contestar(u)), ms)
    s.addEventListener('abort', () => { clearTimeout(t); mal(s.reason) })
  })) as unknown as typeof fetch
  it('🔴 una descarga colgada se corta en el plazo y se dice «tiempo agotado»', async () => {
    const r = await bajarPdf('https://www.sri.gob.ec/f.pdf', lento(10_000, () => resp(200, PDF_FERIADOS_EC)), 1_000_000, 40)
    expect(r).toEqual({ ok: false, razon: 'no se pudo bajar (tiempo agotado)' })
  })
  /** (CC7) la cabecera llega enseguida y el CUERPO se cuelga: entrega el comienzo y no termina hasta que la señal lo corta, como fetch */
  const cuerpoColgado = (async (_u: string, o?: RequestInit) => {
    const s = o?.signal
    const cuerpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('%PDF-1.7\n'))
        if (!s) return
        if (s.aborted) c.error(s.reason); else s.addEventListener('abort', () => c.error(s.reason))
      },
    })
    return new Response(cuerpo, { status: 200, headers: { 'content-type': 'application/pdf' } })
  }) as unknown as typeof fetch
  it('🔴 (CC7) un cuerpo que se cuelga a mitad se corta en el plazo y se dice «tiempo agotado» (no revienta)', async () => {
    expect(await bajarPdf('https://www.sri.gob.ec/f.pdf', cuerpoColgado, 1_000_000, 40)).toEqual({ ok: false, razon: 'no se pudo bajar (tiempo agotado)' })
  })
  it('🔴 (CC7) en la misma llamada, el PDF de cuerpo colgado sale descartado y el otro SIGUE leído', async () => {
    const al = mundo(); const id = await campanaDe(al, A.clientId)
    const f = (async (u: string, o?: RequestInit) => (u === PDF_EC ? cuerpoColgado(u, o) : resp(200, PDF_FERIADOS_EC, { 'content-type': 'application/pdf' }))) as unknown as typeof fetch
    const OTRO = 'https://www.turismo.gob.ec/feriados'
    const d: DependenciasDePdf = { bajar: (u) => bajarPdf(u, f, 1_000_000, 40), leer: (b, n) => leerPdf(b, n) }
    const r = await fechasLeerPdf(al, pedir(id, 'Ecuador', [PDF_EC, OTRO]), d)
    expect(r.status).toBe(200)
    expect(r.cuerpo.descartadas).toEqual([{ url: PDF_EC, razon: 'no se pudo bajar (tiempo agotado)' }])
    expect((r.cuerpo.paginas as Array<{ url: string }>).map((p) => p.url)).toEqual([OTRO])
  })
  it('🔴 el plazo es UNO para todos los saltos: 3 redirecciones de 25 ms no caben en 50 ms (aunque cada una sola sí)', async () => {
    let n = 0
    const f = lento(25, () => (++n <= 3 ? resp(302, null, { location: `/r${n}.pdf` }) : resp(200, PDF_FERIADOS_EC)))
    expect(await bajarPdf('https://www.sri.gob.ec/f.pdf', f, 1_000_000, 50)).toEqual({ ok: false, razon: 'no se pudo bajar (tiempo agotado)' })
    n = 0
    expect((await bajarPdf('https://www.sri.gob.ec/f.pdf', f, 1_000_000, 1_000)).ok).toBe(true)
  })
  it('🔴 más de 3 redirecciones se cortan', async () => {
    let n = 0
    const f = (async () => resp(302, null, { location: `/r${++n}.pdf` })) as unknown as typeof fetch
    expect(await bajarPdf('https://www.sri.gob.ec/f.pdf', f)).toEqual({ ok: false, razon: 'más de 3 redirecciones' })
    expect(n).toBe(4)
  })
})
