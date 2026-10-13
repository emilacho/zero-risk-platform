/** r78 · ensayo del tramo 2 · el «modelo simulado» del turno de la oficina tiene molde VÁLIDO para todos los esquemas de las salas 1, 2 y 3, y un esquema sin molde ya no congela el encargo. */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ESQUEMAS, procesarSalida } from '../src/lib/oficina/salida'

const raiz = process.cwd()
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8'))
const nodo = (flujo: { nodes: Array<{ name: string; parameters: { jsCode?: string } }> }) => flujo.nodes.find((n) => n.name === '② Armar el pedido')!.parameters.jsCode!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...a: unknown[]) => Promise<Array<{ json: Record<string, unknown> }>>
const ANTES = nodo(leer('scripts/worker-staging/bTbWL9lUvQCfStAz/turno-r78-ANTES.json'))
const DESPUES = nodo(leer('scripts/worker-staging/bTbWL9lUvQCfStAz/turno-r78-ARREGLADO.json'))

const KIT = '## Elementos del kit (cada uno es una lámina fija 9:16):\n- e01: historia · 2026-10-23 15:00 · tema «el plato» · pilar «plato»\n- e02: estado · sin fecha · tema «cómo pedir» · pilar «entrega»\n\n## Fotos reales candidatas\n- (ninguna)'
const CARRUSEL = '## Roles de lámina posibles (el ref de una imagen es un rol): hook, problem, reframe, proof, social-proof, benefit, objection, cta, cierre\n\n## Fotos reales candidatas\n- (ninguna)'
const GENERAR_KIT = `${KIT}\n\n## Imágenes que hay que GENERAR (ref → para qué)\n- e01: el plato en primer plano\n- e02: la mesa\n\n## Reglas de imagen\n(ninguna)`
const GENERAR_CARRUSEL = `${CARRUSEL}\n\n## Imágenes que hay que GENERAR (ref → para qué)\n- hook: el plato\n\n## Reglas de imagen\n(ninguna)`
const MIRAR = 'Imágenes que te muestro:\n- imagen 1: índice 0\n- imagen 2: índice 1'

async function pedir(codigo: string, esquema: string, task: string) {
  const e = { dry_run: true, encargo_id: 'enc-1', turno: { n: 4, pedido: { esquema, task, agent_name: 'x', client_id: 'c' } } }
  const f = new AsyncFunction('$input', '$workflow', '$execution', codigo)
  const sal = await f({ first: () => ({ json: e }) }, { id: 'wf' }, { id: 'ex', resumeUrl: 'u' })
  return sal[0].json as { simulado: boolean; resultado_body: { texto?: string; error?: string; n: number } }
}

describe('turno de la oficina · moldes del modelo simulado (modo seco)', () => {
  const CASOS: Array<[string, string]> = [
    ['visual_direction.v1', ''], ['prompts.v1', ''], ['observacion_imagen.v1', MIRAR], ['pieza_post.v1', ''], ['fichas.v1', ''], ['resolucion.v1', ''],
    ['direccion_imagenes.v1', KIT], ['direccion_imagenes.v1', CARRUSEL], ['prompts_por_ref.v1', GENERAR_KIT], ['prompts_por_ref.v1', GENERAR_CARRUSEL], ['observacion_imagenes.v1', MIRAR],
    ['copy_base.v1', CARRUSEL], ['laminas.v1', CARRUSEL], ['estructura.v1', KIT], ['copy_kit.v1', KIT],
    ['resolucion_solo.v1', ''], ['resolucion_copy_base.v1', ''], ['resolucion_copy_kit.v1', ''], ['resolucion_estructura.v1', ''], ['resolucion_laminas.v1', ''],
  ]
  it.each(CASOS)('«%s» (%#): el molde pasa el contrato de formato de la oficina', async (esquema, task) => {
    const r = await pedir(DESPUES, esquema, task)
    expect(r.simulado).toBe(true); expect(r.resultado_body.error).toBeUndefined()
    const v = procesarSalida(r.resultado_body.texto!, esquema, 1, 0)
    expect(v.ok, JSON.stringify(v)).toBe(true)
  })
  it('los refs salen del pedido: el kit usa sus elementos; el carrusel, un rol de lámina; los prompts, las imágenes a generar', async () => {
    const dir = JSON.parse((await pedir(DESPUES, 'direccion_imagenes.v1', KIT)).resultado_body.texto!)
    expect(dir.imagenes[0].ref).toBe('e01')
    expect(JSON.parse((await pedir(DESPUES, 'direccion_imagenes.v1', CARRUSEL)).resultado_body.texto!).imagenes[0].ref).toBe('hook')
    expect(JSON.parse((await pedir(DESPUES, 'prompts_por_ref.v1', GENERAR_KIT)).resultado_body.texto!).imagenes.map((i: { ref: string }) => i.ref)).toEqual(['e01', 'e02'])
    expect(JSON.parse((await pedir(DESPUES, 'estructura.v1', KIT)).resultado_body.texto!).elementos.map((i: { ref: string }) => i.ref)).toEqual(['e01', 'e02'])
  })
  it('el carrusel simulado cumple el mínimo de láminas del formato (5) y las láminas salen del texto base', async () => {
    const l = JSON.parse((await pedir(DESPUES, 'laminas.v1', CARRUSEL)).resultado_body.texto!).laminas as Array<{ headline: string }>
    const base = JSON.parse((await pedir(DESPUES, 'copy_base.v1', CARRUSEL)).resultado_body.texto!).texto_base as string
    expect(l.length).toBeGreaterThanOrEqual(5)
    for (const x of l) expect(base).toContain(x.headline)
  })
  it('antes: las salas 2 y 3 mataban la ejecución; ahora un esquema sin molde devuelve un error VISIBLE al motor (no se congela)', async () => {
    await expect(pedir(ANTES, 'direccion_imagenes.v1', KIT)).rejects.toThrow(/OFICINA_SIN_MOLDE_SIMULADO/)
    const r = await pedir(DESPUES, 'esquema_inventado.v1', '')
    expect(r.resultado_body.texto).toBeUndefined(); expect(r.resultado_body.error).toMatch(/OFICINA_SIN_MOLDE_SIMULADO/); expect(r.resultado_body.n).toBe(4)
  })
  it('todo esquema de las plantillas tiene molde (o es del revisor externo)', () => {
    const sinMolde = Object.keys(ESQUEMAS).filter((k) => k !== 'opinion_libre.v1' && !DESPUES.includes(`'${k}'`))
    expect(sinMolde).toEqual([])
  })
})
