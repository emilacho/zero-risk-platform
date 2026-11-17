/**
 * REVISIÓN 2 · el inventario se defiende solo (medida 1 y 2 de CC7 · RESPUESTA-CC7-a-CC4-LENOVO-revision-2-lo-que-voy-a-medir).
 *  · Cada `'bloquea'` del código de la oficina está contado aquí, archivo por archivo y con su motivo. Uno NUEVO hace fallar esta prueba:
 *    o es una regla dura de la lista (y lleva `dura: true` desde el código de la regla), o es criterio (y al cierre queda como observación), o se agrega aquí con su motivo.
 *  · Ningún texto visible (comillas o plantillas) dice «una persona decide», «una persona mira»… (punto 8: sin persona en el medio).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..')
const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
  return n.endsWith('.ts') ? [p] : []
})
const rel = (p: string) => relative(RAIZ, p).replace(/\\/g, '/')

/** cuántos `'bloquea'` tiene cada archivo y por qué (lo que pone la gravedad, lo que la filtra, o el tipo) */
const INVENTARIO: Record<string, { n: number; motivo: string }> = {
  'chequeos.ts': { n: 9, motivo: 'reglas duras 1-5 (voseo, teléfono/@, precio, hashtags/largo, imagen generada): `dura` en el ayudante `ficha`' },
  'entrega.ts': { n: 7, motivo: 'regla dura 6 (formato de la red): `dura` en el ayudante `nueva`' },
  'laminas.ts': { n: 5, motivo: 'regla dura 7 (láminas, kit, imagen sin lámina): `dura` en el ayudante `ficha`' },
  'orquestador-laminas.ts': { n: 8, motivo: 'regla 4 en láminas (largo verificado, `dura`) + filtros de fichas abiertas + punto 8 (imagen que no pasa: vuelve a su creador, al cierre es observación) + fichas del jefe (criterio)' },
  'orquestador.ts': { n: 10, motivo: 'filtros de fichas abiertas + punto 8 (imagen: vuelve a su creador, al cierre es observación) + formato de la salida del agente (falla visible) + fichas del jefe (criterio)' },
  'orquestador-video.ts': { n: 5, motivo: 'punto 8 (video que no llegó, que no cuenta el guion, que no se pudo mirar o bajar): vuelve a su creador; al cierre es observación' },
  'paso-jefatura.ts': { n: 4, motivo: 'desacuerdo del jefe (criterio) + sentido de #1148 (lo duro lleva `dura`)' },
  'mesa/observar.ts': { n: 2, motivo: 'punto 8 (imagen que no se pudo juzgar o muestra algo no pedido): vuelve a su creador; al cierre es observación' },
  'hechos-del-negocio.ts': { n: 1, motivo: 'filtro que reconoce el desacuerdo de hechos del jefe (criterio)' },
  'salida.ts': { n: 3, motivo: 'esquema de las fichas de un agente (su «bloquea» es criterio) + falla visible del formato' },
  'reglas-duras.ts': { n: 1, motivo: 'el único lugar que decide al cierre' },
  'tipos.ts': { n: 1, motivo: 'el tipo `Gravedad`' },
  'plantillas/carrusel-ig-v1.ts': { n: 2, motivo: 'condición de vuelta: las fichas del jefe hacen volver al creador' },
  'plantillas/kit-historias.ts': { n: 2, motivo: 'condición de vuelta: las fichas del jefe hacen volver al creador' },
  'plantillas/post-img.ts': { n: 1, motivo: 'condición de vuelta: las fichas del jefe hacen volver al creador' },
}

describe('revisión 2 · el inventario de «bloquea» se defiende solo', () => {
  const vistos: Record<string, number> = {}
  for (const p of archivos(RAIZ)) {
    const n = (readFileSync(p, 'utf8').match(/'bloquea'/g) ?? []).length
    if (n) vistos[rel(p)] = n
  }
  it('cada archivo tiene exactamente los «bloquea» contados (uno nuevo pide decidir: regla dura de la lista, criterio, o anotarlo aquí con su motivo)', () => {
    expect(vistos).toEqual(Object.fromEntries(Object.entries(INVENTARIO).map(([k, v]) => [k, v.n])))
  })
  it('cada entrada del inventario dice su motivo', () => {
    for (const [k, v] of Object.entries(INVENTARIO)) expect(v.motivo.length, k).toBeGreaterThan(10)
  })
})

describe('revisión 2 · punto 8 · ningún texto visible manda a una persona', () => {
  const RE = /una persona (decide|mira|lo baja|la mira|las mira)|decide una persona|para una persona/
  it('ni fichas, ni marcas de bandeja, ni avisos lo dicen (solo se miran los textos entre comillas, no los comentarios)', () => {
    const malos: string[] = []
    for (const p of archivos(RAIZ)) {
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return
        const textos = l.match(/'[^']*'|`[^`]*`|"[^"]*"/g) ?? []
        if (textos.some((t) => RE.test(t))) malos.push(`${rel(p)}:${i + 1}`)
      })
    }
    expect(malos).toEqual([])
  })
})
