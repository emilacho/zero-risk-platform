/**
 * 04-nov · cada llamada guarda de qué trabajo es (firma de Emilio 11:14Z): lee los datos, los guarda en columnas propias,
 * nunca frena una llamada y no inventa nada. Las filas sin datos quedan como siempre.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as plataforma from '@/lib/trabajo-de-la-llamada'
import * as corredor from '../services/agent-runner/src/lib/trabajo-de-la-llamada'
import { recordDispatchIntent } from '@/lib/agent-dispatch-ledger'
import { filaDeInvocacionDeImagen } from '@/lib/image-ledger'
import { camposDeLaVueltaDelCorredor } from '@/app/api/agents/run-sdk/route'
import { cuerpoDeLaVuelta } from '../services/agent-runner/src/lib/entrega-de-la-vuelta'

const { trabajoDeLaLlamada, metadataDelTrabajo } = plataforma
const encabezados = (m: Record<string, string>) => (n: string) => m[n]

describe('lee los datos de donde lleguen', () => {
  it('del cuerpo: tipo, id, paso y padre', () => {
    expect(trabajoDeLaLlamada({ trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'consolidar', llamada_padre: 'i1' })).toEqual({
      columnas: { trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'consolidar', llamada_padre: 'i1' },
      invalido: [],
    })
  })
  it('de `context` y de los encabezados', () => {
    expect(trabajoDeLaLlamada({ context: { trabajo_tipo: 'alta', trabajo_id: 'j1' } }).columnas).toEqual({ trabajo_tipo: 'alta', trabajo_id: 'j1' })
    expect(trabajoDeLaLlamada({}, encabezados({ 'x-zr-trabajo-tipo': 'plan', 'x-zr-trabajo-id': 'c1', 'x-zr-paso': 'p', 'x-zr-llamada-padre': 'i2' })).columnas)
      .toEqual({ trabajo_tipo: 'plan', trabajo_id: 'c1', paso: 'p', llamada_padre: 'i2' })
  })
  it('manda el cuerpo sobre `context`, y `context` sobre los encabezados', () => {
    const h = encabezados({ 'x-zr-paso': 'de-encabezado' })
    expect(trabajoDeLaLlamada({ paso: 'de-cuerpo', context: { paso: 'de-context' } }, h).columnas.paso).toBe('de-cuerpo')
    expect(trabajoDeLaLlamada({ context: { paso: 'de-context' } }, h).columnas.paso).toBe('de-context')
  })
  it('sin `paso` usa `step_name`; con los dos, manda `paso`', () => {
    expect(trabajoDeLaLlamada({ step_name: 'viejo' }).columnas.paso).toBe('viejo')
    expect(trabajoDeLaLlamada({ step_name: 'viejo', paso: 'nuevo' }).columnas.paso).toBe('nuevo')
  })
})

describe('no inventa y no frena', () => {
  it('sin datos no agrega ninguna llave', () => {
    const t = trabajoDeLaLlamada({ agent: 'a', task: 't' })
    expect(t).toEqual({ columnas: {}, invalido: [] })
    expect(metadataDelTrabajo(t)).toEqual({})
  })
  it('una expresión de n8n sin valor no es un dato', () => {
    for (const v of ['', '   ', 'undefined', 'null', null, undefined, {}, []]) {
      expect(trabajoDeLaLlamada({ trabajo_tipo: v, trabajo_id: v, paso: v, llamada_padre: v })).toEqual({ columnas: {}, invalido: [] })
    }
  })
  it('un tipo desconocido se descarta con su id y queda anotado', () => {
    const t = trabajoDeLaLlamada({ trabajo_tipo: 'reunion', trabajo_id: 'x', paso: 'p' })
    expect(t.columnas).toEqual({ paso: 'p' })
    expect(metadataDelTrabajo(t)).toEqual({ trabajo_invalido: ['trabajo_tipo_desconocido'] })
  })
  it('tipo sin id o id sin tipo: ninguno entra (la base los exige juntos)', () => {
    expect(trabajoDeLaLlamada({ trabajo_tipo: 'alta' })).toEqual({ columnas: {}, invalido: ['falta_trabajo_id'] })
    expect(trabajoDeLaLlamada({ trabajo_id: 'x' })).toEqual({ columnas: {}, invalido: ['falta_trabajo_tipo'] })
  })
  it('lo demasiado largo: id y padre se descartan, el paso se corta en 200', () => {
    const largo = 'x'.repeat(201)
    expect(trabajoDeLaLlamada({ trabajo_tipo: 'alta', trabajo_id: largo })).toEqual({ columnas: {}, invalido: ['trabajo_id_demasiado_largo'] })
    expect(trabajoDeLaLlamada({ llamada_padre: largo })).toEqual({ columnas: {}, invalido: ['llamada_padre_demasiado_larga'] })
    expect(trabajoDeLaLlamada({ paso: largo }).columnas.paso).toHaveLength(200)
    expect(trabajoDeLaLlamada({ trabajo_tipo: 'alta', trabajo_id: 'x'.repeat(200) }).columnas.trabajo_id).toHaveLength(200)
  })
  it('el tipo se normaliza a minúsculas y un id numérico se guarda como texto', () => {
    expect(trabajoDeLaLlamada({ trabajo_tipo: ' PIEZA ', trabajo_id: 42 }).columnas).toEqual({ trabajo_tipo: 'pieza', trabajo_id: '42' })
  })
})

describe('el corredor y la plataforma dicen lo mismo, y la base también', () => {
  it('las dos copias son iguales, salvo la línea que señala a la otra', () => {
    const sinAviso = (s: string) => s.replace(/\r\n/g, '\n').split('\n').filter((l) => !l.includes('(el corredor no importa de la plataforma)')).join('\n')
    expect(sinAviso(readFileSync('services/agent-runner/src/lib/trabajo-de-la-llamada.ts', 'utf8'))).toBe(sinAviso(readFileSync('src/lib/trabajo-de-la-llamada.ts', 'utf8')))
    expect(corredor.TIPOS_DE_TRABAJO).toEqual(plataforma.TIPOS_DE_TRABAJO)
  })
  it('la restricción de las dos tablas admite exactamente los mismos tipos', () => {
    const sql = readFileSync('supabase/migrations/202611041300_llamada_sabe_su_trabajo.sql', 'utf8')
    const listas = [...sql.matchAll(/trabajo_tipo in \(([^)]*)\)/g)].map((m) => m[1].replace(/['\s]/g, '').split(','))
    expect(listas).toHaveLength(2)
    for (const l of listas) expect(l).toEqual([...plataforma.TIPOS_DE_TRABAJO])
  })
})

describe('llega a las filas', () => {
  const dbFalsa = () => {
    const filas: Record<string, unknown>[] = []
    return { filas, db: { from: () => ({ insert: async (f: Record<string, unknown>) => { filas.push(f); return { error: null } } }) } as never }
  }
  it('el despacho lleva los datos en columnas', async () => {
    const { filas, db } = dbFalsa()
    await recordDispatchIntent(db, { workflow_id: 'w', agent_name: 'a', trabajo: { trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'x', llamada_padre: 'i1' } })
    expect(filas[0]).toMatchObject({ trabajo_tipo: 'pedido', trabajo_id: 'p1', paso: 'x', llamada_padre: 'i1' })
  })
  it('un despacho sin datos no menciona las columnas', async () => {
    const { filas, db } = dbFalsa()
    await recordDispatchIntent(db, { workflow_id: 'w', agent_name: 'a' })
    for (const c of ['trabajo_tipo', 'trabajo_id', 'paso', 'llamada_padre']) expect(filas[0]).not.toHaveProperty(c)
  })
  it('la imagen lleva los datos en columnas y lo descartado en metadata', () => {
    const base = { generationId: 'g', clientId: 'c', agentSlug: 'a', prompt: 'p', model: 'm', size: 's', quality: null, caller: 'x', costUsd: 1, costBasis: 'b', startedAtMs: 1, endedAtMs: 2 }
    const f = filaDeInvocacionDeImagen({ ...base, trabajo: trabajoDeLaLlamada({ trabajo_tipo: 'pieza', trabajo_id: 'z', llamada_padre: 'a'.repeat(201) }) }) as Record<string, any>
    expect(f).toMatchObject({ trabajo_tipo: 'pieza', trabajo_id: 'z' })
    expect(f.metadata.trabajo_invalido).toEqual(['llamada_padre_demasiado_larga'])
    expect(filaDeInvocacionDeImagen(base)).not.toHaveProperty('trabajo_tipo')
  })
})

describe('la respuesta dice cuál fue la llamada, para poder nombrarla como padre', () => {
  it('por la respuesta de la puerta', () => {
    expect(camposDeLaVueltaDelCorredor({ invocationId: 'i9' })).toEqual({ invocation_id: 'i9' })
    expect(camposDeLaVueltaDelCorredor({})).toEqual({})
  })
  it('por la vuelta que entrega el corredor: con éxito y con fallo', () => {
    const c = { agentName: 'a', dispatchKey: 'd' }
    expect(cuerpoDeLaVuelta({ success: true, invocationId: 'i9' }, c).invocation_id).toBe('i9')
    expect(cuerpoDeLaVuelta({ success: false, invocationId: 'i9' }, c).invocation_id).toBe('i9')
    expect(cuerpoDeLaVuelta({ success: true }, c)).not.toHaveProperty('invocation_id')
  })
})
