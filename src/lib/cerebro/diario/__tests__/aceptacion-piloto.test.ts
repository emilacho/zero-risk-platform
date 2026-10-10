/**
 * ACEPTACIÓN con las raspadas REALES del piloto (ilustración: `__tests__/fixtures/diario/piloto-diario.json`, 10-oct-2026). El CÓDIGO es agnóstico; solo el dato es del piloto.
 *  · C2 de CC#3: debe reproducir EXACTAMENTE «7 nuevas / 1 quitada; el aviso de estado = transitorio; el programa de fidelidad = cambio real».
 *  · C1 de CC#3: con las 10 corridas de Instagram propio (29-sep a 09-oct) el diario da «sin cambio» donde solo cambió un contador.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compararLineas, decidir, resumirDiferencia } from '../comparar'
import { contenidoDeInstagram, contenidoDeSitio, huellaDeInstagram, huellaDeLineas, lineasDeInstagram, lineasDeTexto, sha } from '../huella'

interface PaginaFix { dia: string; url: string; text: string }
interface IgFix { id: string; creado: string; usuario: string; biografia: string; seguidores: number; publicaciones: Array<{ shortCode: string; caption: string; likesCount: number; commentsCount: number; videoViewCount: number | null; ownerUsername: string }> }
const P = JSON.parse(fs.readFileSync('__tests__/fixtures/diario/piloto-diario.json', 'utf8')) as { sitio: PaginaFix[]; instagram_propio: IgFix[] }
const dias = [...new Set(P.sitio.map((s) => s.dia))].sort()
const delDia = (d: string) => P.sitio.filter((s) => s.dia === d)

describe('C2 · el sitio real del 29-sep contra el del 08-oct', () => {
  const [d1, d2] = dias
  const todas = (d: string) => { const l = lineasDeTexto(delDia(d).map((p) => p.text).join('\n')); return [...l.duraderas, ...l.transitorias] }
  const dif = compararLineas(todas(d1), todas(d2))
  const res = resumirDiferencia(dif)

  it('hay dos días de raspado real con las mismas páginas', () => {
    expect(dias).toEqual(['2026-09-29', '2026-10-08'])
    expect(delDia(d1).length).toBe(4); expect(delDia(d2).length).toBe(4)
  })
  it('reproduce EXACTAMENTE «7 nuevas / 1 quitada»', () => {
    expect(dif.nuevas).toHaveLength(7)
    expect(dif.quitadas).toHaveLength(1)
  })
  it('el aviso de estado («cerrado, vuelve…») es TRANSITORIO: 1 nueva y 1 quitada, y no es un cambio', () => {
    expect(res.transitorias).toEqual({ nuevas: 1, quitadas: 1 })
    expect(dif.nuevas.filter((l) => l.clase === 'transitorio').map((l) => l.linea)).toEqual(['cerrado vuelve hoy 7am'])
    expect(dif.quitadas.map((l) => [l.linea, l.clase])).toEqual([['cerrado vuelve el jueves 7am', 'transitorio']])
  })
  it('lo que el sitio SUMÓ de verdad (el programa de fidelidad y la cuenta) es cambio real: 6 líneas nuevas, ninguna quitada', () => {
    expect(res.cambio_real).toEqual({ nuevas: 6, quitadas: 0 })
    const reales = dif.nuevas.filter((l) => l.clase !== 'transitorio').map((l) => l.linea)
    expect(reales.some((l) => /tesoro de naufrago/.test(l) && /4%/.test(l))).toBe(true)
    expect(reales).toContain('crea tu cuenta y por cada pedido acumula tesoro de naufrago')
  })
  it('con la decisión del diario (solo líneas duraderas) el sitio da VERSIÓN NUEVA con 6 líneas, y el aviso de estado por sí solo no la habría dado', () => {
    const dur = (d: string) => contenidoDeSitio(delDia(d).map((p) => ({ url: p.url, text: p.text }))).lineas
    const d = decidir({ id: 'v1', huella: huellaDeLineas(dur(d1)), lineas: dur(d1) }, { huella: huellaDeLineas(dur(d2)), lineas: dur(d2) })
    expect(d.accion).toBe('version_nueva')
    if (d.accion === 'version_nueva') expect(resumirDiferencia(d.diferencia).cambio_real).toEqual({ nuevas: 6, quitadas: 0 })
    // quitando solo el aviso de estado del día 2, la huella es la del día 1 + las 6 reales; un día con SOLO el aviso cambiado no cambia la huella
    const soloAviso = lineasDeTexto('Texto estable del cliente aqui\nCerrado, vuelve hoy 7am').duraderas
    const otroAviso = lineasDeTexto('Texto estable del cliente aqui\nCerrado, vuelve el jueves 7am').duraderas
    expect(huellaDeLineas(soloAviso)).toBe(huellaDeLineas(otroAviso))
  })
})

describe('C1 · Instagram propio: 10 corridas reales, solo cambian los contadores', () => {
  const corridas = P.instagram_propio
  it('hay 10 corridas del 29-sep al 09-oct y los contadores SÍ cambian entre ellas (seguidores / me gusta)', () => {
    expect(corridas).toHaveLength(10)
    expect(new Set(corridas.map((c) => c.seguidores)).size).toBeGreaterThan(1)
    expect(new Set(corridas.map((c) => c.publicaciones[0].likesCount)).size).toBeGreaterThan(1)
  })
  it('la huella del TEXTO es la misma en las 10: el diario da «sin cambio» donde solo cambió un contador', () => {
    const huellas = new Set(corridas.map((c) => huellaDeInstagram(contenidoDeInstagram({ username: c.usuario, biography: c.biografia, latestPosts: c.publicaciones }))))
    expect(huellas.size).toBe(1)
    const base = contenidoDeInstagram({ username: corridas[0].usuario, biography: corridas[0].biografia, latestPosts: corridas[0].publicaciones })
    for (const c of corridas.slice(1)) {
      const hoy = contenidoDeInstagram({ username: c.usuario, biography: c.biografia, latestPosts: c.publicaciones })
      expect(decidir({ id: 'v', huella: huellaDeInstagram(base), lineas: lineasDeInstagram(base) }, { huella: huellaDeInstagram(hoy), lineas: lineasDeInstagram(hoy) }).accion).toBe('sin_cambio')
    }
  })
  it('un hash ingenuo de lo que devuelve la red (con contadores) SÍ cambiaría casi cada vez: por eso la huella solo mira el texto', () => {
    const ingenua = new Set(corridas.map((c) => sha(JSON.stringify(c.publicaciones.map((p) => [p.shortCode, p.caption, p.likesCount, p.commentsCount])) + c.seguidores)))
    expect(ingenua.size).toBeGreaterThan(1)
  })
  it('si cambia una leyenda o la biografía, SÍ hay versión nueva, con la línea que cambió', () => {
    const c = corridas[0]
    const antes = contenidoDeInstagram({ username: c.usuario, biography: c.biografia, latestPosts: c.publicaciones })
    const mod = { ...c, biografia: c.biografia + '\nNuevo horario de atencion de lunes a viernes' }
    const despues = contenidoDeInstagram({ username: c.usuario, biography: mod.biografia, latestPosts: mod.publicaciones })
    const d = decidir({ id: 'v', huella: huellaDeInstagram(antes), lineas: lineasDeInstagram(antes) }, { huella: huellaDeInstagram(despues), lineas: lineasDeInstagram(despues) })
    expect(d.accion).toBe('version_nueva')
  })
})
