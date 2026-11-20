/**
 * 17-nov · GO de Lenovo (firma de Emilio 17:22) · AUDITORÍA de la cadena (EVIDENCIA-CC6 §9): la corrección del kit (revisión 84307f1f) murió dos veces por
 * «$.pieza: debe ser un objeto». El agente NO tomó nada y escribió `"pieza": null`; el lector no leía ese null como «no hay pieza nueva».
 * La prueba usa las dos salidas REALES del registro (agent_invocations.output_summary), copiadas tal cual. US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { correr, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { procesarSalidaDeRevision } from '../src/lib/jefatura/revision/formatos'
import { ESQUEMAS, procesarSalida, quitarNulosOpcionales, validar } from '../src/lib/oficina/salida'

const REAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'jefatura-84307f1f-correccion-pieza-nula.json'), 'utf8')) as { intentos: Array<{ texto: string }> }
const [PRIMERO, SEGUNDO] = REAL.intentos.map((x) => x.texto)

/** las 4 fichas del jefe en el caso real: 0 y 2 sugerencia, 1 y 3 bloquean (las que fueron a la corrección) */
const FICHAS_DEL_JEFE = JSON.stringify({
  fichas: [
    { que: 'un guion «—» sobrante bajo «ya llegó.»', donde: 'texto', contra_que: 'el manual', gravedad: 'sugerencia', propuesta: 'quitar el guion' },
    { que: 'la lámina 1 solo muestra «ya llegó.»: faltan los datos obligatorios del brief', donde: 'texto', contra_que: 'el brief', gravedad: 'bloquea', propuesta: 'agregar los datos obligatorios' },
    { que: 'la regla de precio solo con acción directa', donde: 'texto', contra_que: 'el manual', gravedad: 'sugerencia', propuesta: 'precio junto a la acción' },
    { que: 'falta delimitar la zona de entrega', donde: 'texto', contra_que: 'el brief', gravedad: 'bloquea', propuesta: 'delimitar la zona' },
  ],
})
const idsDelPedido = (task: unknown) => [...String(task).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => m[1])

describe('la salida real del kit (pieza: null, nada tomado)', () => {
  it('las dos salidas reales traen pieza null y ninguna ficha tomada (el caso es el que se cree)', () => {
    for (const t of [PRIMERO, SEGUNDO]) {
      const v = JSON.parse(t.replace(/^```json\s*|\s*```\s*$/g, ''))
      expect(v.pieza).toBeNull()
      expect(v.respuestas.map((r: { id: string; estado: string }) => [r.id, r.estado])).toEqual([['jefe-0-1', 'no_tomada'], ['jefe-0-3', 'no_tomada']])
    }
  })
  it('el validador sin el arreglo da EXACTAMENTE el error del registro', () => {
    const v = JSON.parse(SEGUNDO.replace(/^```json\s*|\s*```\s*$/g, ''))
    expect(validar(ESQUEMAS['resolucion.v1'], v)).toEqual(['$.pieza: debe ser un objeto'])
  })
  it('ahora se lee: pieza ausente, anotado, y las respuestas intactas', () => {
    for (const t of [PRIMERO, SEGUNDO]) {
      const r = procesarSalidaDeRevision(t, 'resolucion.v1', 0, 1)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      expect('pieza' in r.valor).toBe(false)
      expect(r.normalizados).toContain('$.pieza: null → ausente (campo opcional)')
      expect((r.valor.respuestas as unknown[]).length).toBe(2)
    }
  })
})

describe('solo null, y solo en lo opcional (no se afloja la forma)', () => {
  const esq = ESQUEMAS['resolucion.v1']
  it('un texto suelto donde va la pieza sigue fallando', () => {
    const r = procesarSalidaDeRevision(JSON.stringify({ respuestas: [], pieza: 'el pie nuevo' }), 'resolucion.v1', 1, 1)
    expect(r.ok).toBe(false)
    if (!r.ok && r.accion === 'falla_visible') expect(r.errores).toContain('$.pieza: debe ser un objeto')
    else expect.unreachable('debía fallar visible')
  })
  it('un REQUERIDO en null sigue fallando (respuestas: null), también dentro de la pieza (pie_de_foto: null)', () => {
    expect(validar(esq, quitarNulosOpcionales(esq, { respuestas: null }))).toContain('$.respuestas: debe ser una lista')
    const r = procesarSalidaDeRevision(JSON.stringify({ respuestas: [], pieza: { pie_de_foto: null, hashtags: [] } }), 'resolucion.v1', 1, 1)
    expect(r.ok).toBe(false)
    if (!r.ok && r.accion === 'falla_visible') expect(r.errores.join(' ')).toContain('$.pieza.pie_de_foto')
    else expect.unreachable('debía fallar visible')
  })
  it('un opcional en null DENTRO de la pieza también es ausente (llamado: null)', () => {
    const r = procesarSalidaDeRevision(JSON.stringify({ respuestas: [], pieza: { pie_de_foto: 'pie', hashtags: [], llamado: null } }), 'resolucion.v1', 0, 1)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.valor.pieza).toEqual({ pie_de_foto: 'pie', hashtags: [] })
  })
  it('un campo que no está en el esquema sigue siendo «no permitido» aunque venga en null', () => {
    expect(validar(esq, quitarNulosOpcionales(esq, { respuestas: [], inventado: null }))).toEqual(['$.inventado: campo no permitido'])
  })
  it('dentro de una lista también: un «necesito» con su opcional en null (bloquea: null) se lee; su requerido en null (que: null) no', () => {
    const ok = procesarSalida(JSON.stringify({ pie_de_foto: 'pie', hashtags: [], necesito: [{ que: 'el precio', bloquea: null }] }), 'pieza_post.v1', 0, 1, { normalizar: true })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.valor.necesito).toEqual([{ que: 'el precio' }])
    const mal = procesarSalida(JSON.stringify({ pie_de_foto: 'pie', hashtags: [], necesito: [{ que: null }] }), 'pieza_post.v1', 1, 1, { normalizar: true })
    expect(mal.ok).toBe(false)
  })
  it('las otras clases (post, carrusel, video) leen la misma regla: todo esquema de la oficina pasa por el mismo lector', () => {
    for (const id of ['pieza_post.v1', 'resolucion.v1']) {
      const base = id === 'pieza_post.v1' ? { pie_de_foto: 'pie', hashtags: [], llamado: null } : { respuestas: [], pieza: null }
      const r = procesarSalida(JSON.stringify(base), id, 0, 1, { normalizar: true })
      expect(r.ok).toBe(true)
    }
  })
})

describe('punta a punta en la jefatura de la pieza (motor real, arnés en memoria)', () => {
  const correrCon = (correccion: (ids: string[]) => string[]) => {
    const { P } = puertosDePrueba()
    let ronda = 0
    return correr(P, sobre('pieza', { dry_run: false }), (t) => {
      if (t.paso === 'revision_fondo') return { texto: FICHAS_DEL_JEFE }
      // 20-nov · PLAN v4 · GPT va primero en la pieza, así que el jefe es el paso 1 y sus fichas son `jefe-1-*` (en el registro real, `jefe-0-*`):
      //   la salida real se reproduce tal cual, solo con el número de paso de los ids llevado al de este pedido
      if (t.paso === 'correccion:content-creator') {
        const ids = idsDelPedido(t.pedido.task)
        const prefijo = (ids[0] ?? 'jefe-0-0').replace(/-\d+$/, '-')
        return { texto: (correccion(ids)[ronda++] ?? '').replace(/jefe-0-(\d+)/g, `${prefijo}$1`), costo_usd: 0.08 }
      }
      return { texto: JSON.stringify({ respuestas: idsDelPedido(t.pedido.task).map((id) => ({ id, estado: 'no_tomada', razon: 'no aplica' })) }), costo_usd: 0.07 }
    })
  }
  it('la corrección llega con las fichas reales que bloquean (la 1 y la 3 del jefe, que ahora es el paso 1: jefe-1-1 y jefe-1-3)', async () => {
    const vistos: string[][] = []
    await correrCon((ids) => { vistos.push(ids); return [PRIMERO] })
    expect(vistos[0]).toEqual(['jefe-1-1', 'jefe-1-3'])
  })
  it('con la salida real: NO falla por formato; las fichas quedan no tomadas con su razón ⇒ observaciones declaradas (revisión 2 = A), pieza sin versión nueva', async () => {
    const c = await correrCon(() => [PRIMERO, SEGUNDO])
    expect(c.final.cuerpo.resultado).toBe('limpia')
    expect(c.turnos.filter((t) => t.paso === 'correccion:content-creator')).toHaveLength(1)
    const s = c.final.cuerpo.salida as { desacuerdos: string[]; observaciones: string[]; respuestas: Array<{ id: string; estado: string; razon: string }> }
    expect(s.desacuerdos).toEqual([])
    expect(s.observaciones.join(' ')).toContain('Lámina 2')
  })
  it('«tomada» con pieza null: no muere por formato ni inventa una versión (límite J2: lo tomado sin pieza se aplica a mano desde la bandeja, como antes)', async () => {
    const c = await correrCon((ids) => [JSON.stringify({ respuestas: ids.map((id) => ({ id, estado: 'tomada', razon: 'lo agrego' })), pieza: null })])
    expect(c.turnos.filter((t) => t.paso === 'correccion:content-creator')).toHaveLength(1)
    expect(c.final.cuerpo.resultado).not.toBe('fallida')
    expect(JSON.stringify(c.final.cuerpo.salida)).not.toContain('Versión 2')
  })
  it('«tomada» CON pieza sigue igual: la pieza cambia', async () => {
    const c = await correrCon((ids) => [JSON.stringify({ respuestas: ids.map((id) => ({ id, estado: 'tomada', razon: 'ok' })), pieza: { pie_de_foto: 'ya llegó a la zona de entrega', hashtags: [] } })])
    expect(c.final.cuerpo.resultado).toBe('limpia')
  })
})
