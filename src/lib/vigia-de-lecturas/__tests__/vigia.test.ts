/**
 * El vigía de las lecturas con llave · condiciones de CC6 (REVISION-CC6-a-CC2-plan-prevencion-llaves, 17-nov).
 * Fixtures de lo REAL medido el 17-nov: Apify con la llave vieja → 401 `user-or-token-not-found`; con la nueva → `/v2/users/me/limits` 200, usado 29.13657240315892 de 29, ciclo hasta 2026-11-24T23:59:59.999Z.
 */
import { describe, expect, it, vi } from 'vitest'
import { claseDe, decidir, ejecutar, leerCuerpo, textoDeIncidente, textoDelTope, umbralCruzado } from '../vigia'

const USO_REAL = { usado_usd: 29.13657240315892, tope_usd: 29, ciclo_hasta: '2026-11-24T23:59:59.999Z' }
const LLAVE_ROTA = { proveedor: 'apify', estado: 401, tipo_error: 'user-or-token-not-found' }

describe('clase de una lectura (condición 1 de CC6)', () => {
  it('2xx lee · 401 llave · 402/403 tope · lo demás y sin respuesta = caída', () => {
    expect(claseDe(200)).toBe('ok')
    expect(claseDe(204)).toBe('ok')
    expect(claseDe(401)).toBe('llave')
    expect(claseDe(402)).toBe('tope')
    expect(claseDe(403)).toBe('tope')
    expect(claseDe(299)).toBe('ok')
    for (const e of [500, 502, 504, 408, 429, 404, 400, 300, 301, 199, null]) expect(claseDe(e)).toBe('caida')
  })
})

describe('un incidente por proveedor', () => {
  it('401 abre a la PRIMERA lectura, con su clave por proveedor y el tipo de error', () => {
    const a = decidir([LLAVE_ROTA])
    expect(a).toEqual([{ tipo: 'avisar', clave: 'lectura:apify', texto: expect.stringContaining('respondió 401 · user-or-token-not-found') }])
    expect((a[0] as { texto: string }).texto).toContain('«sin datos» (no es cero)')
  })
  it('402 y 403 abren a la primera como tope, con el código real en el texto', () => {
    expect(decidir([{ proveedor: 'apify', estado: 402 }])[0]).toMatchObject({ tipo: 'avisar', texto: expect.stringContaining('respondió 402') })
    expect(decidir([{ proveedor: 'apify', estado: 403 }])[0]).toMatchObject({ tipo: 'avisar', texto: expect.stringContaining('tope o permiso') })
  })
  it('una caída sola espera; la segunda seguida avisa', () => {
    expect(decidir([{ proveedor: 'apify', estado: 503, caidas_seguidas: 1 }])).toEqual([{ tipo: 'esperar', clave: 'lectura:apify', motivo: expect.any(String) }])
    expect(decidir([{ proveedor: 'apify', estado: null }])[0].tipo).toBe('esperar')
    expect(decidir([{ proveedor: 'apify', estado: null, caidas_seguidas: 2 }])[0]).toMatchObject({ tipo: 'avisar', texto: expect.stringContaining('sin respuesta') })
    expect(decidir([{ proveedor: 'apify', estado: 504, caidas_seguidas: 3 }])[0]).toMatchObject({ tipo: 'avisar', texto: expect.stringContaining('respondió 504') })
  })
  it('la caída no cierra el incidente abierto (no manda «volvió»)', () => {
    expect(decidir([{ proveedor: 'apify', estado: 500, caidas_seguidas: 1 }]).some((x) => x.tipo === 'resolver')).toBe(false)
  })
  it('un 200 cierra el incidente en su hilo («volvió»)', () => {
    expect(decidir([{ proveedor: 'apify', estado: 200 }])).toEqual([{ tipo: 'resolver', clave: 'lectura:apify', nota: 'volvió: Apify responde bien' }])
  })
  it('la misma clase da el MISMO texto (repetir no publica) y otra clase da otro (va al hilo)', () => {
    const t1 = textoDeIncidente(LLAVE_ROTA, 'llave')
    expect(textoDeIncidente({ ...LLAVE_ROTA }, 'llave')).toBe(t1)
    expect(textoDeIncidente({ proveedor: 'apify', estado: 402 }, 'tope')).not.toBe(t1)
    expect(t1).not.toMatch(/\d{2}:\d{2}/) // sin hora: cada hora sería «otro detalle» y se publicaría en el hilo
  })
  it('cada proveedor es su propio incidente; repetido en la lista, manda el primero', () => {
    const a = decidir([LLAVE_ROTA, { proveedor: 'supabase', estado: 200 }, { proveedor: 'apify', estado: 200 }])
    expect(a.map((x) => `${x.tipo} ${x.clave}`)).toEqual(['avisar lectura:apify', 'resolver lectura:supabase'])
  })
})

describe('tope del mes (condición 2 de CC6)', () => {
  it('umbral mayor cruzado: <75 nada · 75 · 90 · 100 % = solo 90', () => {
    expect(umbralCruzado({ usado_usd: 21.7, tope_usd: 29, ciclo_hasta: null })).toBeNull()
    expect(umbralCruzado({ usado_usd: 21.75, tope_usd: 29, ciclo_hasta: null })).toBe(75)
    expect(umbralCruzado({ usado_usd: 26.1, tope_usd: 29, ciclo_hasta: null })).toBe(90)
    expect(umbralCruzado(USO_REAL)).toBe(90)
    expect(umbralCruzado({ usado_usd: 5, tope_usd: 0, ciclo_hasta: null })).toBeNull()
    expect(umbralCruzado({ usado_usd: Number.NaN, tope_usd: 29, ciclo_hasta: null })).toBeNull()
  })
  it('primer encendido con lo real (100,5 %): UNA alarma, la del 90, con la clave del ciclo', () => {
    const a = decidir([{ proveedor: 'apify', estado: 200, uso: USO_REAL }])
    const topes = a.filter((x) => x.clave.startsWith('tope-del-mes:'))
    expect(topes).toHaveLength(1)
    expect(topes[0]).toMatchObject({ tipo: 'avisar', clave: 'tope-del-mes:apify:90:2026-11-24', texto: expect.stringContaining('ya pasó el 90 % del tope de US$ 29.00') })
    expect((topes[0] as { texto: string }).texto).toContain('El ciclo corta el 2026-11-24')
  })
  it('el texto del tope es FIJO en el ciclo: con otro uso, el mismo texto (la puerta lo cuenta y no lo publica)', () => {
    expect(textoDelTope('apify', USO_REAL, 90)).toBe(textoDelTope('apify', { ...USO_REAL, usado_usd: 26.3 }, 90))
    expect(textoDelTope('apify', USO_REAL, 90)).not.toContain('29.14')
  })
  it('al 80 % es la del 75; el ciclo nuevo da otra clave', () => {
    const a = decidir([{ proveedor: 'apify', estado: 200, uso: { usado_usd: 23.2, tope_usd: 29, ciclo_hasta: '2026-12-24T23:59:59.999Z' } }])
    expect(a[1]).toMatchObject({ tipo: 'avisar', clave: 'tope-del-mes:apify:75:2026-12-24' })
  })
  it('sin ciclo conocido, la clave lo dice (no se mezcla con un ciclo real)', () => {
    expect(decidir([{ proveedor: 'apify', estado: 200, uso: { ...USO_REAL, ciclo_hasta: null } }])[1]).toMatchObject({ clave: 'tope-del-mes:apify:90:sin-ciclo' })
  })
  it('sin lectura buena no hay alarma de tope (un 401 no trae uso)', () => {
    expect(decidir([{ ...LLAVE_ROTA, uso: USO_REAL }]).some((x) => x.clave.startsWith('tope-del-mes:'))).toBe(false)
  })
})

describe('ejecutar', () => {
  const ejecutores = () => ({ avisar: vi.fn(async () => ({ ok: true, accion: 'abrio', detalle: 'entregado' })), resolver: vi.fn(async () => ({ ok: true, accion: 'sin_incidente', detalle: 'nada' })) })
  it('avisar y resolver van a su ejecutor con su clave; esperar no toca nada; un error no corta el resto', async () => {
    const x = ejecutores()
    x.resolver.mockRejectedValueOnce(new Error('boom'))
    const r = await ejecutar([{ tipo: 'resolver', clave: 'lectura:supabase', nota: 'n' }, { tipo: 'esperar', clave: 'lectura:openai', motivo: 'm' }, { tipo: 'avisar', clave: 'lectura:apify', texto: 'a' }], x)
    expect(r.map((y) => `${y.tipo} ${y.accion} ${y.ok}`)).toEqual(['resolver fallo false', 'esperar esperar true', 'avisar abrio true'])
    expect(x.avisar).toHaveBeenCalledTimes(1)
    expect(x.avisar).toHaveBeenCalledWith('a', 'lectura:apify')
    expect(x.resolver).toHaveBeenCalledWith('lectura:supabase', 'n')
  })
})

describe('cuerpo', () => {
  it('dry_run obligatorio, lista de 1 a 10, proveedor en minúsculas, estado HTTP o null', () => {
    expect(leerCuerpo({ lecturas: [LLAVE_ROTA] }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: true, lecturas: [] }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: true, lecturas: Array(11).fill(LLAVE_ROTA) }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: true, lecturas: [{ proveedor: 'Apify', estado: 401 }] }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: true, lecturas: [{ proveedor: 'apify', estado: '401' }] }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: true, lecturas: [{ proveedor: 'apify', estado: 99 }] }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: true, lecturas: [{ proveedor: 'apify' }] }).ok).toBe(false)
    expect(leerCuerpo({ dry_run: false, lecturas: [{ proveedor: 'apify', estado: null }] })).toMatchObject({ ok: true, dry_run: false })
  })
  it('un uso a medias se descarta (no inventa un tope)', () => {
    const c = leerCuerpo({ dry_run: true, lecturas: [{ proveedor: 'apify', estado: 200, uso: { usado_usd: 29.1 } }] })
    expect(c.ok && c.lecturas[0].uso).toBeNull()
    const d = leerCuerpo({ dry_run: true, lecturas: [{ proveedor: 'apify', estado: 200, caidas_seguidas: 2, uso: USO_REAL }] })
    expect(d.ok && d.lecturas[0]).toMatchObject({ caidas_seguidas: 2, uso: USO_REAL })
  })
})
