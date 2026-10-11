/**
 * AUTOPRODUCIR (2026-10-11 · firma de Emilio: «el brief manda solo a producir») · en seco: sin base, sin red, sin modelo (US$ 0). La SALA es la de verdad (el orquestador de intake y su libro) en memoria.
 *   · nace APAGADO (interruptor propio por campaña + la compuerta de la cadena + la oficina apagada) · un sobre por brief con su familia · sin familia → sin `familia` (pieza simple)
 *   · idempotente (un brief = un sobre aunque se repita) · respeta el freno de gasto · lo seco no gasta ni consulta el freno · nunca toca la oficina ni llama a un modelo
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCIONES } from '../acciones'
import { filasAutoproducir, llaveDeProducir, sobresDeProducir, type Campana, type ParteGuardada } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'

const CLIENTE = '96864e88-79bc-47ff-8f8e-5bf88610ec7d'
const OTRO = '11111111-1111-4111-8111-111111111111'
const PARTE = '22222222-2222-4222-8222-222222222222'
const WF = { workflow_id: 'wf-copia-por-filas', workflow_execution_id: 'ex-1' }

/** 3 briefs: una foto (post_img), un carrusel (carrusel_ig_v1) y una pieza sin sala (sin familia) */
const parte = (extra: Partial<ParteGuardada> = {}): ParteGuardada => ({
  id: PARTE, client_id: CLIENTE, valido: true,
  briefs: [
    { brief_id: 'B1', fila_id: 'f1', familia: 'post_img' },
    { brief_id: 'B2', fila_id: 'f2', familia: 'carrusel_ig_v1' },
    { brief_id: 'B3', fila_id: 'f3', familia: null },
  ],
  ...extra,
})
const campanaBase = (extra: Partial<Campana> = {}): Omit<Campana, 'id'> => ({
  client_id: CLIENTE, plan_id: 'plan-1', fecha_inicio: '2026-10-12', fecha_inicio_origen: 'regla', fecha_fin: '2026-12-20', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: [], estado: 'activa', estado_motivo: null,
  presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: true, sala_ref: {}, reemplaza_a: null, seco: true, ...extra,
})
async function montar(o: { campana?: Partial<Campana>; parte?: Partial<ParteGuardada>; freno?: boolean; intakeApagado?: boolean; config?: Record<string, unknown> } = {}) {
  const al = new AlmacenMemoria({ partes: [parte(o.parte)], frenoBloqueado: o.freno, intakeApagado: o.intakeApagado, config: { flujos: ['wf-copia-por-filas'], ...(o.config ?? {}) } })
  const c = await al.insertarCampana(campanaBase(o.campana))
  return { al, c }
}
const llamar = (al: AlmacenMemoria, c: Campana, extra: Record<string, unknown> = {}) => filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true, ...WF, ...extra })

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('el ensayo del encargo: 3 briefs (foto · carrusel · sin familia) → 3 sobres correctos, 0 duplicados al repetir', () => {
  it('con TODO apagado (cadena y oficina) y dry_run:true: salen 3 sobres a la sala de PIEZAS (la puerta de la oficina), cada uno con SU familia · el tercero SIN `familia`', async () => {
    const { al, c } = await montar()
    expect(await al.leerConfig('estado_cadena')).toBe('apagada')
    const r = await llamar(al, c)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ emite: true, dry_run: true, parte_id: PARTE, emitidos: 3, duplicados: 0, rechazados: 0, sin_familia: 1, omitidos: [] })
    expect(al.sala.size).toBe(3)
    const eventos = (await al.sala.select({ tenant_id: CLIENTE })) as unknown as Array<{ idempotency_key: string; journey_type: string; payload: { envelope_payload: Record<string, unknown>; worker_workflow_id: string } }>
    expect(new Set(eventos.map((e) => e.idempotency_key)).size).toBe(3)                 // una llave de la sala por brief (la sala la compone con la nuestra)
    for (const e of eventos) { expect(e.journey_type).toBe('PIEZAS'); expect(e.payload.worker_workflow_id).toBe('PzZ3b6cY6DYmIaOQ') }   // a la PUERTA de la oficina
    const porBrief = Object.fromEntries(eventos.map((e) => [String(e.payload.envelope_payload.brief_id), e.payload.envelope_payload]))
    expect(porBrief.B1).toMatchObject({ parte_id: PARTE, brief_id: 'B1', dry_run: true, familia: 'post_img', fila_id: 'f1' })
    expect(porBrief.B2).toMatchObject({ brief_id: 'B2', dry_run: true, familia: 'carrusel_ig_v1' })
    expect(porBrief.B3).toMatchObject({ brief_id: 'B3', dry_run: true })
    expect('familia' in porBrief.B3).toBe(false)                                  // sin familia → sobre sin `familia` → pieza simple
  })
  it('al REPETIR la llamada: 0 sobres nuevos, 3 duplicados · el libro de la sala no crece', async () => {
    const { al, c } = await montar()
    await llamar(al, c)
    const otra = await llamar(al, c)
    expect(otra.cuerpo).toMatchObject({ emitidos: 0, duplicados: 3, rechazados: 0 })
    expect(al.sala.size).toBe(3)
    const tercera = await llamar(al, c, { workflow_execution_id: 'ex-2' })       // otra ejecución, mismo parte
    expect(tercera.cuerpo).toMatchObject({ emitidos: 0, duplicados: 3 })
    expect(al.sala.size).toBe(3)
  })
  it('la acción vive en la tabla de la ruta `/api/cadena/filas` (la misma que prueba el simulador)', async () => {
    const { al, c } = await montar()
    const r = await ACCIONES.filas.autoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true, ...WF }, '2026-10-11T12:00:00Z')
    expect(r.status).toBe(200)
    expect((r.cuerpo as { emitidos: number }).emitidos).toBe(3)
  })
})

describe('nace APAGADO · los tres candados', () => {
  it('candado 1 · el interruptor propio: campaña con autoproducir en falso (el valor por omisión) → no sale NADA, ni en seco', async () => {
    const { al, c } = await montar({ campana: { autoproducir: false } })
    const r = await llamar(al, c)
    expect(r.cuerpo).toMatchObject({ emite: false, motivo: 'autoproducir_apagado', emitidos: 0, sobres: [] })
    expect(al.sala.size).toBe(0)
  })
  it('candado 2 · la compuerta: lo REAL con la cadena apagada → 409 y 0 sobres · en ensayo solo sale el cliente de la lista · encendida sale', async () => {
    const apagada = await montar()
    const r1 = await llamar(apagada.al, apagada.c, { dry_run: false })
    expect(r1.status).toBe(409); expect(r1.cuerpo.code).toBe('E-CADENA-APAGADA'); expect(apagada.al.sala.size).toBe(0)
    const fuera = await montar({ config: { estado_cadena: 'ensayo', clientes_ensayo: [OTRO] } })
    const r2 = await llamar(fuera.al, fuera.c, { dry_run: false })
    expect(r2.status).toBe(409); expect(r2.cuerpo.code).toBe('E-CADENA-NO-ADMITIDO'); expect(fuera.al.sala.size).toBe(0)
    const dentro = await montar({ config: { estado_cadena: 'ensayo', clientes_ensayo: [CLIENTE] } })
    expect((await llamar(dentro.al, dentro.c, { dry_run: false })).cuerpo).toMatchObject({ emitidos: 3, dry_run: false })
    const enc = await montar({ config: { estado_cadena: 'encendida' } })
    expect((await llamar(enc.al, enc.c, { dry_run: false })).cuerpo).toMatchObject({ emitidos: 3 })
  })
  it('candado 3 · la oficina: los sobres van a la PUERTA de la oficina y este módulo no toca ninguna tabla ni nombre de la oficina', () => {
    const codigo = readFileSync(join(process.cwd(), 'src/lib/cadena/autoproducir.ts'), 'utf8').split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*')).join('\n')
    expect(codigo).not.toMatch(new RegExp(['oficina' + '_', 'familias' + '_activas'].join('|')))
    expect(codigo).not.toMatch(/run-sdk|fetch\(|anthropic|openai/i)               // nunca llama a un modelo ni despacha
  })
  it('`dry_run` es OBLIGATORIO y booleano: ausente o mal escrito → 400 y 0 sobres', async () => {
    const { al, c } = await montar()
    for (const dry of [undefined, 'true', 1, null]) {
      const r = await filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, ...(dry === undefined ? {} : { dry_run: dry }), ...WF })
      expect(r.status).toBe(400)
    }
    expect(al.sala.size).toBe(0)
  })
  it('exige el contexto del flujo (workflow_id y workflow_execution_id) · un flujo desconocido → 403', async () => {
    const { al, c } = await montar()
    expect((await filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true })).status).toBe(400)
    expect((await filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: true, workflow_id: 'otro', workflow_execution_id: 'x' })).status).toBe(403)
    expect(al.sala.size).toBe(0)
  })
})

describe('el freno de gasto §150 y el tope por cliente (#487)', () => {
  it('lo REAL con el cliente ya al techo: NO sale ningún sobre', async () => {
    const { al, c } = await montar({ freno: true, config: { estado_cadena: 'encendida' } })
    const r = await llamar(al, c, { dry_run: false })
    expect(r.cuerpo).toMatchObject({ emite: false, motivo: 'freno_de_gasto', emitidos: 0 })
    expect(al.sala.size).toBe(0)
    expect(al.consultasDelFreno).toBe(1)
  })
  it('lo SECO no gasta: no consulta el freno y sale aunque el cliente esté al techo', async () => {
    const { al, c } = await montar({ freno: true })
    const r = await llamar(al, c)
    expect(r.cuerpo).toMatchObject({ emite: true, emitidos: 3 })
    expect(al.consultasDelFreno).toBe(0)
  })
})

describe('lo que NO sale', () => {
  it('parte no válido → no sale nada · parte de otro cliente → 403 · parte inexistente → 404 · campaña no activa → 409', async () => {
    const a = await montar({ parte: { valido: false } })
    expect((await llamar(a.al, a.c)).cuerpo).toMatchObject({ emite: false, motivo: 'parte_no_valido' })
    const b = await montar({ parte: { client_id: OTRO } })
    expect((await llamar(b.al, b.c)).status).toBe(403)
    const c = await montar()
    expect((await filasAutoproducir(c.al, { campana_id: c.c.id, parte_id: '33333333-3333-4333-8333-333333333333', dry_run: true, ...WF })).status).toBe(404)
    const d = await montar({ campana: { estado: 'pausada' } })
    expect((await llamar(d.al, d.c)).status).toBe(409)
    for (const x of [a, b, c, d]) expect(x.al.sala.size).toBe(0)
  })
  it('briefs sin id, con id inválido o repetidos se omiten con su motivo · una familia mal escrita sale SIN familia (nunca se inventa)', async () => {
    const { al, c } = await montar({ parte: { briefs: [
      { brief_id: 'B1', fila_id: 'f1', familia: 'post_img' }, { brief_id: null, fila_id: 'f2', familia: 'post_img' }, { brief_id: 'B 3!', fila_id: 'f3', familia: null },
      { brief_id: 'B1', fila_id: 'f9', familia: 'carrusel_ig_v1' }, { brief_id: 'B4', fila_id: 'f4', familia: 'Post Img' },
    ] } })
    const r = await llamar(al, c)
    expect(r.cuerpo).toMatchObject({ emitidos: 2, sin_familia: 1 })
    expect((r.cuerpo as { omitidos: unknown[] }).omitidos).toEqual([{ brief_id: null, motivo: 'brief_sin_id' }, { brief_id: 'B 3!', motivo: 'brief_id_invalido' }, { brief_id: 'B1', motivo: 'brief_repetido_en_el_parte' }])
    const eventos = (await al.sala.select({ tenant_id: CLIENTE })) as unknown as Array<{ payload: { envelope_payload: Record<string, unknown> } }>
    const b4 = eventos.find((e) => e.payload.envelope_payload.brief_id === 'B4')!.payload.envelope_payload
    expect('familia' in b4).toBe(false)
  })
  it('con la sala apagada (intake) los sobres se REPORTAN como rechazados (no se tragan)', async () => {
    const { al, c } = await montar({ intakeApagado: true })
    const r = await llamar(al, c)
    expect(r.cuerpo).toMatchObject({ emitidos: 0, rechazados: 3 })
    expect((r.cuerpo as { sobres: Array<{ resultado: string; motivo?: string }> }).sobres.every((s) => s.resultado === 'rechazado' && /intake_apagado/.test(s.motivo ?? ''))).toBe(true)
  })
  it('sin llave interna la sala rechaza: el sobre NO entra', async () => {
    delete process.env.INTERNAL_API_KEY
    const { al, c } = await montar()
    const r = await llamar(al, c)
    expect(r.cuerpo).toMatchObject({ emitidos: 0, rechazados: 3 })
    expect(al.sala.size).toBe(0)
  })
})

describe('sobresDeProducir (puro)', () => {
  it('la llave es <parte>:<brief>:producir · el periodo lógico es el parte · el cliente y el tenant salen del parte, nunca del brief', () => {
    const { sobres } = sobresDeProducir(parte(), { dry_run: false, correlation_id: 'corr-1', desde_worker: 'wf-x' })
    expect(sobres.map((s) => s.idempotency_key)).toEqual([`${PARTE}:B1:producir`, `${PARTE}:B2:producir`, `${PARTE}:B3:producir`])
    for (const s of sobres) expect(s).toMatchObject({ source: 'brief/parte-listo', intent: 'producir', logical_period: `parte:${PARTE}`, client_id: CLIENTE, tenant_id: CLIENTE, correlation_id: 'corr-1' })
    expect(sobres[0].payload).toMatchObject({ dry_run: false, desde_worker: 'wf-x' })
  })
})
