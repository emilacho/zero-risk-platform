/**
 * CONEXIÓN · PASO 1 · la bandeja de aprobación (relevo 14). US$ 0, base simulada.
 *  · `POST /api/hitl/queue` guarda `output_id` (opcional): sin él la fila es IDÉNTICA a la de hoy;
 *  · `PATCH /api/hitl/[id]` acepta `edited` y escribe `resolved_at` (lo que lee el cerebro) además de `decided_at`;
 *  · una decisión humana puede guardar en `metadata` la frase del aprobador y la hora (`decision_humana`), para que no se confunda con el clic de un empleado;
 *  · las filas viejas no se tocan; lo no pedido no se escribe.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Llamada { tabla: string; op: 'insert' | 'update' | 'select'; datos?: Record<string, unknown>; id?: string }
const registro: Llamada[] = []
let filaActual: Record<string, unknown> | null = null
let errorDeInsert: { message: string; code?: string } | null = null
let errorDeUpdate: { message: string; code?: string } | null = null
let salidaActual: Record<string, unknown> | null = null
let errorDeLecturaDeSalida: { message: string } | null = null

vi.mock('@/lib/internal-auth', () => ({
  checkInternalKey: (r: Request) => (r.headers.get('x-api-key') === 'k' ? { ok: true } : { ok: false, reason: 'Invalid x-api-key' }),
}))
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      insert: (datos: Record<string, unknown>) => {
        registro.push({ tabla, op: 'insert', datos })
        return { select: () => ({ single: async () => (errorDeInsert ? { data: null, error: errorDeInsert } : { data: { id: 'nuevo', ...datos }, error: null }) }) }
      },
      update: (datos: Record<string, unknown>) => ({
        eq: (_col: string, id: string) => {
          registro.push({ tabla, op: 'update', datos, id })
          return { select: () => ({ single: async () => (errorDeUpdate ? { data: null, error: errorDeUpdate } : { data: { id, type: String(filaActual?.type ?? 'otro'), metadata: filaActual?.metadata ?? {}, ...datos }, error: null }) }) }
        },
      }),
      select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => { registro.push({ tabla, op: 'select', id }); return tabla === 'client_historical_outputs' ? { data: salidaActual, error: errorDeLecturaDeSalida } : { data: filaActual, error: null } } }) }),
    }),
  }),
}))

const post = async (cuerpo: unknown, llave = 'k') => {
  const { POST } = await import('../src/app/api/hitl/queue/route')
  const r = await POST(new Request('http://x/api/hitl/queue', { method: 'POST', headers: { 'x-api-key': llave, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))
  return { status: r.status, json: (await r.json()) as Record<string, any> }
}
const patch = async (cuerpo: unknown, id = '11111111-1111-4111-8111-111111111111', llave = 'k') => {
  const { PATCH } = await import('../src/app/api/hitl/[id]/route')
  const r = await PATCH(new Request('http://x/api/hitl/' + id, { method: 'PATCH', headers: { 'x-api-key': llave, 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }), { params: { id } })
  return { status: r.status, json: (await r.json()) as Record<string, any> }
}
const OUT = '6ed1307a-0000-4000-8000-000000000001'

const CLI = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
beforeEach(() => { salidaActual = { id: OUT, client_id: CLI }; errorDeLecturaDeSalida = null; registro.length = 0; filaActual = { id: '11111111-1111-4111-8111-111111111111', type: 'otro', metadata: { origen: 'flujo' } }; errorDeInsert = null; errorDeUpdate = null })

describe('POST /api/hitl/queue', () => {
  const base = { type: 'content_review', title: 'Pieza', client_id: '41dd3d62-d6de-4c9a-9996-6df78c1da118' }
  it('LÍNEA BASE: sin `output_id` la fila es EXACTAMENTE la de hoy (mismas llaves, ninguna nueva)', async () => {
    const r = await post(base)
    expect(r.status).toBe(201)
    expect(registro.find((x) => x.op === 'insert')?.datos).toEqual({
      client_id: base.client_id, agent_name: 'system', risk_type: 'strategic_decision', output_preview: 'Pieza', type: 'content_review', title: 'Pieza', priority: 'medium', status: 'pending', payload: {}, metadata: {},
    })
    expect(Object.keys(registro[0].datos as object)).not.toContain('output_id')
  })
  it('con `output_id` válido la fila lo guarda y todo lo demás sigue igual', async () => {
    const r = await post({ ...base, output_id: OUT })
    expect(r.status).toBe(201)
    const fila = registro.find((x) => x.op === 'insert')?.datos as Record<string, unknown>
    expect(fila.output_id).toBe(OUT)
    const { output_id: _o, ...resto } = fila
    expect(resto).toEqual({ client_id: base.client_id, agent_name: 'system', risk_type: 'strategic_decision', output_preview: 'Pieza', type: 'content_review', title: 'Pieza', priority: 'medium', status: 'pending', payload: {}, metadata: {} })
  })
  it.each([null, undefined, ''])('`output_id` %j se trata como ausente (fila idéntica a la de hoy)', async (v) => {
    await post({ ...base, output_id: v })
    expect(Object.keys(registro[0].datos as object)).not.toContain('output_id')
  })
  it.each(['no-es-uuid', 123, {}, [], '6ed1307a', 'x'.repeat(40), true].map((v) => [v]))('un `output_id` inválido (%j) se rechaza con 400 y no escribe nada', async (v) => {
    const r = await post({ ...base, output_id: v })
    expect(r.status).toBe(400)
    expect(r.json.error).toBe('output_id_invalid')
    expect(registro).toHaveLength(0)
  })
  it('una pieza que no existe (error de llave foránea de la base) → 400 claro, no un 500', async () => {
    errorDeInsert = { message: 'insert or update on table "hitl_queue" violates foreign key constraint "hitl_queue_output_id_fkey"', code: '23503' }
    const r = await post({ ...base, output_id: OUT })
    expect(r.status).toBe(400)
    expect(r.json.error).toBe('output_id_not_found')
  })
  describe('la pieza tiene que ser del MISMO cliente que la fila (condición 1 de CC#3)', () => {
    it('la salida existe y es del mismo cliente → se guarda (y se leyó solo `client_historical_outputs`)', async () => {
      const r = await post({ ...base, output_id: OUT })
      expect(r.status).toBe(201)
      expect(registro[0]).toMatchObject({ tabla: 'client_historical_outputs', op: 'select', id: OUT })
      expect(registro[1]).toMatchObject({ tabla: 'hitl_queue', op: 'insert' })
    })
    it('la salida es de OTRO cliente → 400 `output_id_other_client` y no se escribe nada', async () => {
      salidaActual = { id: OUT, client_id: 'e388a370-910f-4ee7-9a48-4a79393b8cb4' }
      const r = await post({ ...base, output_id: OUT })
      expect(r.status).toBe(400)
      expect(r.json.error).toBe('output_id_other_client')
      expect(registro.filter((x) => x.op === 'insert')).toHaveLength(0)
    })
    it('la salida no existe → 400 `output_id_not_found` sin intentar escribir', async () => {
      salidaActual = null
      const r = await post({ ...base, output_id: OUT })
      expect(r.status).toBe(400)
      expect(r.json.error).toBe('output_id_not_found')
      expect(registro.filter((x) => x.op === 'insert')).toHaveLength(0)
    })
    it('con `output_id` pero SIN `client_id` → 400 `client_id_required_with_output_id` (no se adivina de quién es)', async () => {
      const { client_id: _c, ...sinCliente } = base
      const r = await post({ ...sinCliente, output_id: OUT })
      expect(r.status).toBe(400)
      expect(r.json.error).toBe('client_id_required_with_output_id')
      expect(registro).toHaveLength(0)
    })
    it('si la base falla al leer la salida → 500 y no se escribe', async () => {
      errorDeLecturaDeSalida = { message: 'base caída' }
      const r = await post({ ...base, output_id: OUT })
      expect(r.status).toBe(500)
      expect(registro.filter((x) => x.op === 'insert')).toHaveLength(0)
    })
    it('SIN `output_id` no se lee la salida (la ruta de hoy no hace la lectura extra)', async () => {
      await post(base)
      expect(registro.filter((x) => x.tabla === 'client_historical_outputs')).toHaveLength(0)
    })
  })
  it('cualquier otro error de la base sigue siendo 500 con su mensaje', async () => {
    errorDeInsert = { message: 'boom' }
    const r = await post(base)
    expect(r.status).toBe(500)
    expect(r.json.error).toBe('boom')
  })
  it('sin llave 401, sin campos obligatorios 400 (como hoy)', async () => {
    expect((await post(base, 'mala')).status).toBe(401)
    expect((await post({ title: 'x' })).status).toBe(400)
    expect(registro).toHaveLength(0)
  })
})

describe('PATCH /api/hitl/[id]', () => {
  it('LÍNEA BASE: aprobar escribe lo de siempre (status, reviewer, decision, decided_at) + `resolved_at` con la MISMA hora; nada de `metadata`', async () => {
    const r = await patch({ status: 'approved', reviewer: 'emilio' })
    expect(r.status).toBe(200)
    const u = registro.find((x) => x.op === 'update')?.datos as Record<string, unknown>
    expect(Object.keys(u).sort()).toEqual(['decided_at', 'decision', 'resolved_at', 'reviewer', 'status'])
    expect(u).toMatchObject({ status: 'approved', reviewer: 'emilio', decision: {} })
    expect(u.resolved_at).toBe(u.decided_at)
    expect(Number.isNaN(Date.parse(String(u.resolved_at)))).toBe(false)
  })
  it('rechazar igual; `in_review` y `expired` NO ponen fecha de decisión (como hoy)', async () => {
    await patch({ status: 'rejected' })
    expect(Object.keys(registro.find((x) => x.op === 'update')?.datos as object).sort()).toEqual(['decided_at', 'decision', 'resolved_at', 'reviewer', 'status'])
    for (const status of ['in_review', 'expired']) {
      registro.length = 0
      await patch({ status })
      expect(Object.keys(registro.find((x) => x.op === 'update')?.datos as object).sort(), status).toEqual(['decision', 'reviewer', 'status'])
    }
  })
  it('`edited` se acepta (antes 400), escribe las dos fechas y NO propaga a otras tablas', async () => {
    filaActual = { id: 'x', type: 'seo_playbook_review', metadata: { task_id: 'T1' } }
    const r = await patch({ status: 'edited', reviewer: 'emilio' })
    expect(r.status).toBe(200)
    const upd = registro.filter((x) => x.op === 'update')
    expect(upd).toHaveLength(1) // solo la cola: edited no marca la entidad de origen
    expect(upd[0].datos).toMatchObject({ status: 'edited' })
    expect(upd[0].datos?.resolved_at).toBe(upd[0].datos?.decided_at)
  })
  it('aprobar SÍ sigue propagando a la entidad de origen (comportamiento de hoy)', async () => {
    filaActual = { id: 'x', type: 'seo_playbook_review', metadata: { task_id: 'T1' } }
    await patch({ status: 'approved' })
    const upd = registro.filter((x) => x.op === 'update')
    expect(upd).toHaveLength(2)
    expect(upd[1]).toMatchObject({ tabla: 'seo_engagements', datos: { status: 'approved' } })
  })
  it('un estado que no existe sigue siendo 400, y ahora el mensaje incluye `edited`', async () => {
    const r = await patch({ status: 'quizas' })
    expect(r.status).toBe(400)
    expect(r.json.error).toMatch(/edited/)
    expect(registro).toHaveLength(0)
  })
  it('sin llave 401', async () => { expect((await patch({ status: 'approved' }, undefined, 'mala')).status).toBe(401); expect(registro).toHaveLength(0) })

  describe('la frase del aprobador y la hora (`decision_humana` en metadata)', () => {
    it('con `frase_del_aprobador` guarda la frase, la hora y quién, SIN borrar lo que ya traía la fila', async () => {
      const r = await patch({ status: 'approved', reviewer: 'emilio', frase_del_aprobador: 'Apruebo esta pieza: sí, así sale.' })
      expect(r.status).toBe(200)
      const u = registro.find((x) => x.op === 'update')?.datos as Record<string, any>
      expect(u.metadata.origen).toBe('flujo')
      expect(u.metadata.decision_humana).toMatchObject({ frase: 'Apruebo esta pieza: sí, así sale.', reviewer: 'emilio', estado: 'approved' })
      expect(u.metadata.decision_humana.hora).toBe(u.resolved_at) // la hora de la decisión, del servidor
    })
    it('con `hora_de_la_frase` válida guarda además la hora en que Emilio la dijo', async () => {
      await patch({ status: 'rejected', frase_del_aprobador: 'No, cámbiala.', hora_de_la_frase: '2026-10-08T15:04:05Z' })
      const u = registro.find((x) => x.op === 'update')?.datos as Record<string, any>
      expect(u.metadata.decision_humana.hora_de_la_frase).toBe('2026-10-08T15:04:05.000Z')
      expect(u.metadata.decision_humana.hora).toBe(u.resolved_at) // la hora de la decisión sigue siendo la del servidor, no la que mande el cliente
      expect(u.metadata.decision_humana.hora).not.toBe('2026-10-08T15:04:05.000Z')
    })
    it('`edited` también guarda la frase', async () => {
      await patch({ status: 'edited', frase_del_aprobador: 'Aprobada con cambios: quita la segunda línea.' })
      const u = registro.find((x) => x.op === 'update')?.datos as Record<string, any>
      expect(u.metadata.decision_humana.estado).toBe('edited')
    })
    it.each([['vacía', ''], ['solo espacios', '   '], ['no es texto', 12], ['muy larga', 'x'.repeat(2001)]])('una frase %s → 400 y no escribe nada', async (_n, frase) => {
      const r = await patch({ status: 'approved', frase_del_aprobador: frase })
      expect(r.status).toBe(400)
      expect(r.json.error).toBe('frase_del_aprobador_invalid')
      expect(registro.filter((x) => x.op === 'update')).toHaveLength(0)
    })
    it('una frase con `in_review` o `expired` (no es una decisión) → 400', async () => {
      for (const status of ['in_review', 'expired']) {
        const r = await patch({ status, frase_del_aprobador: 'hola' })
        expect(r.status, status).toBe(400)
      }
      expect(registro.filter((x) => x.op === 'update')).toHaveLength(0)
    })
    it('una `hora_de_la_frase` ilegible → 400', async () => {
      const r = await patch({ status: 'approved', frase_del_aprobador: 'ok', hora_de_la_frase: 'ayer' })
      expect(r.status).toBe(400)
      expect(r.json.error).toBe('hora_de_la_frase_invalid')
    })
    it('si la fila no existe, con frase → 404 y no se escribe', async () => {
      filaActual = null
      const r = await patch({ status: 'approved', frase_del_aprobador: 'ok' })
      expect(r.status).toBe(404)
      expect(registro.filter((x) => x.op === 'update')).toHaveLength(0)
    })
    it.each([['un texto', 'solo texto'], ['una lista', ['a', 'b']], ['un número', 7], ['nulo', null]])('si el `metadata` previo es %s se trata como {} y se mezcla sin romper', async (_n, previo) => {
      filaActual = { id: 'x', type: 'otro', metadata: previo }
      const r = await patch({ status: 'approved', frase_del_aprobador: 'ok' })
      expect(r.status).toBe(200)
      const u = registro.find((x) => x.op === 'update')?.datos as Record<string, any>
      expect(Object.keys(u.metadata)).toEqual(['decision_humana'])
      expect(Array.isArray(u.metadata)).toBe(false)
    })
    it('sin frase NO se lee ni se escribe `metadata` (la ruta de hoy no hace la lectura extra)', async () => {
      await patch({ status: 'approved' })
      expect(registro.filter((x) => x.op === 'select')).toHaveLength(0)
      expect(Object.keys(registro.find((x) => x.op === 'update')?.datos as object)).not.toContain('metadata')
    })
  })
})
