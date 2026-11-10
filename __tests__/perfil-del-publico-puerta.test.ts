/**
 * PERFIL DEL PÚBLICO · la PUERTA HTTP de verdad (pedido de CC6 en la certificación de #981): sin `dry_run` explícito o sin la firma de la
 * corrida no se hace NADA (ni se arman las dependencias ni se corre); y el reloj del crédito corta a los 20 s como «sin crédito».
 */
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { correrPerfil, dependenciasReales } = vi.hoisted(() => ({ correrPerfil: vi.fn(async () => ({ estado: 'ensayo' })), dependenciasReales: vi.fn(() => ({})) }))
vi.mock('@/lib/internal-auth', () => ({ checkInternalKey: () => ({ ok: true }) }))
vi.mock('@/lib/perfil-del-publico/corrida', () => ({ correrPerfil }))
vi.mock('@/lib/perfil-del-publico/dependencias', () => ({ dependenciasReales }))

import { POST } from '@/app/api/perfil-del-publico/route'

const CLIENTE = '11111111-1111-4111-8111-111111111111'
const pedir = (cuerpo: unknown) => POST(new Request('http://x/api/perfil-del-publico', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) }))
const FIRMA = { workflow_id: 'wf-perfil', workflow_execution_id: 'ex-1' }
type Dependencias = typeof import('@/lib/perfil-del-publico/dependencias')

describe('la puerta del perfil del público', () => {
  beforeEach(() => { correrPerfil.mockClear(); dependenciasReales.mockClear() })
  const nadaSeHizo = () => { expect(correrPerfil).not.toHaveBeenCalled(); expect(dependenciasReales).not.toHaveBeenCalled() }

  const sinDry: Array<[string, unknown]> = [['sin dry_run', undefined], ['dry_run como texto', 'false'], ['dry_run nulo', null], ['dry_run como número', 0]]
  for (const [nombre, dry] of sinDry) {
    it(`${nombre} → 400 y no se hizo nada`, async () => {
      const r = await pedir({ client_id: CLIENTE, ...FIRMA, ...(dry === undefined ? {} : { dry_run: dry }) })
      expect(r.status).toBe(400)
      expect((await r.json()).detalle).toMatch(/dry_run/)
      nadaSeHizo()
    })
  }
  const sinFirma: Array<[string, Record<string, string>]> = [['sin workflow_id', { workflow_execution_id: 'ex-1' }], ['sin workflow_execution_id', { workflow_id: 'wf' }], ['firma en blanco', { workflow_id: ' ', workflow_execution_id: ' ' }], ['sin firma', {}]]
  for (const [nombre, firma] of sinFirma) {
    for (const dry_run of [false, true]) {
      it(`${nombre} (dry_run ${dry_run}) → 403 y no se hizo nada`, async () => {
        const r = await pedir({ client_id: CLIENTE, dry_run, ...firma })
        expect(r.status).toBe(403)
        expect((await r.json()).error).toBe('sin_firma')
        nadaSeHizo()
      })
    }
  }
  it('un client_id que no es uuid → 400 y no se hizo nada', async () => {
    expect((await pedir({ client_id: 'cliente-x', dry_run: true, ...FIRMA })).status).toBe(400)
    nadaSeHizo()
  })
  it('con todo en regla, corre con el dry_run y la firma que llegaron', async () => {
    const r = await pedir({ client_id: CLIENTE, dry_run: false, ...FIRMA })
    expect(r.status).toBe(200)
    expect(correrPerfil).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ client_id: CLIENTE, dry_run: false, ...FIRMA }))
  })
})

describe('el reloj del crédito', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('una lectura que no vuelve es «sin crédito» a los 20 s, ni antes ni después', async () => {
    const { conReloj, LIMITE_DEL_CREDITO_MS } = await vi.importActual<Dependencias>('@/lib/perfil-del-publico/dependencias')
    expect(LIMITE_DEL_CREDITO_MS).toBe(20_000)
    let fin: unknown = 'pendiente'
    void conReloj(new Promise(() => {})).then((x) => { fin = x })
    await vi.advanceTimersByTimeAsync(19_999)
    expect(fin).toBe('pendiente')
    await vi.advanceTimersByTimeAsync(1)
    expect(fin).toEqual({ ok: false, detalle: 'la lectura tardó más de 20 s' })
  })
  it('una lectura que vuelve a tiempo pasa tal cual', async () => {
    const { conReloj } = await vi.importActual<Dependencias>('@/lib/perfil-del-publico/dependencias')
    const lectura = { ok: false as const, detalle: 'Apify respondió 500' }
    await expect(conReloj(Promise.resolve(lectura))).resolves.toEqual(lectura)
  })
  it('la lectura real del crédito pasa por el reloj', () => {
    const src = fs.readFileSync('src/lib/perfil-del-publico/dependencias.ts', 'utf8')
    expect(src).toMatch(/async leerCredito\(\): Promise<LecturaDeCredito> \{\s+return conReloj\(leerUsoDelMes\(\)/)
  })
})
