/**
 * La lista que ve el portero: numerada, sin lo fijo, sin lo reemplazado y sin lo que el proceso YA entrega (ya_trae).
 * Casos escritos antes del código.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../../lista-corta'
import { loFijo } from '../../conversacion'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import { FUENTE_DE_CLASE, lineaParaElModelo, numerarLista } from '../lista-numerada'

async function listaDe(cliente = A) {
  return construirListaCorta(crearBaseFalsa(tablasDeLaBase()).consulta, cliente, { ahora: AHORA })
}
const refsDe = (n: ReturnType<typeof numerarLista>) => n.lineas.map((l) => l.ficha.ref)

describe('qué entra a la lista numerada', () => {
  it('no incluye lo fijo (manual vigente y correcciones del aprobador): ya se entrega siempre', async () => {
    const lista = await listaDe()
    const n = numerarLista(lista)
    expect(n.fijo.map((f) => f.ref).sort()).toEqual(loFijo(lista).map((f) => f.ref).sort())
    for (const f of n.fijo) expect(refsDe(n)).not.toContain(f.ref)
  })

  it('no incluye lo reemplazado, pero la versión vigente dice cuántas anteriores tiene', async () => {
    const n = numerarLista(await listaDe())
    for (const r of ['client_brand_books:bb-1', 'client_historical_outputs:pz-1', 'client_historical_outputs:pz-3', 'client_historical_outputs:part-2']) expect(refsDe(n), r).not.toContain(r)
    expect(refsDe(n)).toContain('client_historical_outputs:pz-2')
    expect(n.texto).toMatch(/\+2 versiones anteriores/)
  })

  it('todo lo demás de la lista de A sí está (una línea por cosa vigente)', async () => {
    const lista = await listaDe()
    const n = numerarLista(lista)
    const fijas = new Set(n.fijo.map((f) => f.ref))
    const esperadas = lista.lineas.filter((f) => f.reemplazada !== true && !fijas.has(f.ref)).map((f) => f.ref)
    expect(refsDe(n).sort()).toEqual(esperadas.sort())
  })

  it('los números son 1..N, contiguos, y el texto tiene una línea por número', async () => {
    const n = numerarLista(await listaDe())
    expect(n.lineas.map((l) => l.numero)).toEqual(Array.from({ length: n.lineas.length }, (_, i) => i + 1))
    const lineas = n.texto.split('\n')
    expect(lineas).toHaveLength(n.lineas.length)
    lineas.forEach((l, i) => expect(l.startsWith(`#${i + 1} `), l).toBe(true))
  })

  it('es determinista: la misma lista da los mismos números y la misma huella; si cambia algo, cambia la huella', async () => {
    const a = numerarLista(await listaDe()), b = numerarLista(await listaDe())
    expect(a.huella).toBe(b.huella)
    expect(refsDe(a)).toEqual(refsDe(b))
    const lista = await listaDe()
    lista.lineas = lista.lineas.filter((f) => f.ref !== 'client_social_images:im-1')
    expect(numerarLista(lista).huella).not.toBe(a.huella)
  })
})

describe('la línea que lee el portero (formato D)', () => {
  it('trae clase, título, qué es, producto, estado, fecha, vigencia, versión y peso en UNA línea', async () => {
    const n = numerarLista(await listaDe())
    const foto = n.lineas.find((l) => l.ficha.ref === 'client_social_images:im-1')!
    const t = lineaParaElModelo(foto.numero, foto.ficha)
    expect(t).not.toContain('\n')
    expect(t).toMatch(new RegExp(`^#${foto.numero} +E3 foto · `))
    for (const parte of ['Servicio uno', 'producto: Servicio uno', 'visto_en_su_fuente', '2026-', 'vigente hasta', 'peso ']) expect(t, parte).toContain(parte)
  })
  it('lo vencido lleva su aviso en la línea; nunca desaparece', async () => {
    const n = numerarLista(await listaDe())
    const sitio = n.lineas.find((l) => l.ficha.ref === 'client_web_pages:wp-a1')!
    expect(lineaParaElModelo(sitio.numero, sitio.ficha)).toMatch(/VENCIDO desde 2026-/)
  })
  it('la versión se dice, y «qué es» se recorta a 100 caracteres', async () => {
    const n = numerarLista(await listaDe())
    const pieza = n.lineas.find((l) => l.ficha.ref === 'client_historical_outputs:pz-2')!
    expect(lineaParaElModelo(pieza.numero, pieza.ficha)).toMatch(/v2 vigente/)
    const larga = { ...pieza.ficha, que_es: 'x'.repeat(300) }
    const t = lineaParaElModelo(1, larga)
    expect(t).toContain('x'.repeat(100))
    expect(t).not.toContain('x'.repeat(101))
  })
})

describe('ya_trae: lo que el proceso ya entrega por su cuenta', () => {
  it('quita una fuente entera por su nombre', async () => {
    const n = numerarLista(await listaDe(), { ya_trae: ['fotos'] })
    expect(n.lineas.some((l) => ['foto', 'portada_de_video', 'logo'].includes(l.ficha.clase))).toBe(false)
    expect(n.lineas.some((l) => l.ficha.clase === 'sede')).toBe(true)
  })
  it('quita una clase por su nombre y normaliza mayúsculas y espacios', async () => {
    const n = numerarLista(await listaDe(), { ya_trae: [' SEDE '] })
    expect(n.lineas.some((l) => l.ficha.clase === 'sede')).toBe(false)
    expect(n.lineas.some((l) => l.ficha.clase === 'dato_de_sede')).toBe(true)
  })
  it('un nombre que no existe se REPORTA, no se ignora en silencio', async () => {
    const n = numerarLista(await listaDe(), { ya_trae: ['fotos', 'inventada'] })
    expect(n.ya_trae_desconocido).toEqual(['inventada'])
  })
  it('no quita lo fijo aunque se nombre', async () => {
    const lista = await listaDe()
    const n = numerarLista(lista, { ya_trae: ['manual', 'decision_del_aprobador'] })
    expect(n.fijo.map((f) => f.ref).sort()).toEqual(loFijo(lista).map((f) => f.ref).sort())
  })
  it('toda clase de la lista tiene su fuente conocida (una clase nueva sin fuente rompe esta prueba)', async () => {
    const lista = await listaDe()
    for (const f of lista.lineas) expect(FUENTE_DE_CLASE[f.clase], `clase sin fuente: ${f.clase}`).toBeDefined()
  })
})
