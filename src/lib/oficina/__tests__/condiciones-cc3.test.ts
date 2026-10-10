/**
 * Condiciones de CC#3 a las salas (relevo 44): fechas imposibles (#469 H2) y el encargo ya cerrado (#471 · doble fila de bandeja).
 * Las pruebas de teléfonos viven en condiciones-cc1.test.ts (regresión de #475).
 */
import { describe, it, expect } from 'vitest'
import { abrirEncargo, avanzar } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { aUtc } from '../entrega'
import { fechaLimiteDelBrief, elementosDelKit } from '../brief'
import { esFechaReal, esHoraReal } from '../texto'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PIEZA_OK, FICHAS_VACIAS, crearMemoria, correr, direccionGenerada, observacion } from './memoria'

describe('#469 H2 · una fecha que no existe no se corrige sola: se rechaza', () => {
  it('días y horas que existen / que no', () => {
    for (const f of ['2026-02-28', '2028-02-29', '2026-12-31', '2026-01-01']) expect(esFechaReal(f), f).toBe(true)
    for (const f of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '2026-13-45', '26-10-10', '']) expect(esFechaReal(f), f).toBe(false)
    for (const h of ['00:00', '09:30', '23:59']) expect(esHoraReal(h), h).toBe(true)
    for (const h of ['24:00', '25:99', '12:60', '9:30', '']) expect(esHoraReal(h), h).toBe(false)
  })
  it('«aprobar antes del 31 de febrero» NO da fecha límite; uno real, sí', () => {
    expect(fechaLimiteDelBrief('aprobar antes del 31 de febrero de 2026')).toBeNull()
    expect(fechaLimiteDelBrief('aprobar antes del 30 de abril de 2026')?.fecha).toBe('2026-04-30')
    expect(fechaLimiteDelBrief('aprobar antes del 31 de abril de 2026')).toBeNull()
    expect(fechaLimiteDelBrief('aprobar antes del 29 de febrero de 2026')).toBeNull()
    expect(fechaLimiteDelBrief('aprobar antes del 29 de febrero de 2028')?.fecha).toBe('2028-02-29')
    expect(fechaLimiteDelBrief('aprobar antes del 0 de marzo de 2026')).toBeNull()
  })
  it('un elemento de kit con fecha u hora imposibles es ILEGIBLE (el encargo falla visible); uno real se lee', () => {
    const malos = ['2026-13-45 25:99 | historia | tema | pilar | dato', '2026-02-31 09:00 | historia | tema | pilar', '2026-10-12 24:00 | estado | tema | pilar']
    const r = elementosDelKit({ elementos: malos })
    expect(r.elementos).toEqual([])
    expect(r.ilegibles).toEqual(malos)
    const bien = elementosDelKit({ elementos: ['2026-10-12 09:00 | historia | tema | pilar | dato', '2026-10-13 | estado | tema | pilar', 'sin fecha | estado | tema | pilar'] })
    expect(bien.ilegibles).toEqual([])
    expect(bien.elementos.map((e) => [e.fecha, e.hora])).toEqual([['2026-10-12', '09:00'], ['2026-10-13', null], [null, null]])
  })
  it('aUtc no adivina: fecha imposible o sin zona ⇒ null; una real se convierte', () => {
    expect(aUtc('2026-02-31', '09:00', 'America/Guayaquil')).toBeNull()
    expect(aUtc('2026-13-45', '25:99', 'America/Guayaquil')).toBeNull()
    expect(aUtc('2026-10-12', '09:00', null)).toBeNull()
    expect(aUtc('2026-10-12', '09:00', 'Mars/Olympus')).toBeNull()
    expect(aUtc('2026-10-12', '09:00', 'America/Guayaquil')).toBe('2026-10-12T14:00:00.000Z')
    expect(aUtc('2026-10-12', '25:99', 'America/Guayaquil')).toBeNull() // CC#1: una hora imposible NO cae a medianoche
    expect(aUtc('2026-10-12', null, 'America/Guayaquil')).toBe('2026-10-12T05:00:00.000Z') // sin hora sí: medianoche local, como siempre
  })
})

describe('#471 · un encargo CERRADO no se vuelve a cerrar (sin segunda pieza ni segunda fila de bandeja)', () => {
  it('«siguiente» repetido sobre un encargo cerrado deja la bandeja como estaba', async () => {
    const M = crearMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const indicesDe = (tarea: string) => [...tarea.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
    const { ultima } = await correr(M, id, {
      paquete: () => ({ texto: 'material del portero' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
      mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }), texto: () => ({ texto: PIEZA_OK }), revision_jefe: () => ({ texto: FICHAS_VACIAS }),
      corrige: () => ({ texto: '{"respuestas": []}' }), decide: () => ({ texto: '{"respuestas": []}' }),
    })
    expect(ultima.cuerpo.estado).toBe('cerrado')
    const antes = M.llamadas.bandeja.length
    expect(antes).toBe(1)
    await avanzar(M.P, id)
    await avanzar(M.P, id)
    expect(M.llamadas.bandeja.length).toBe(antes)
  })
})

// ───────────────────────── lo que CC#1 marcó (relevo 46)
import fs from 'node:fs'
import { datosDeContacto } from '../texto'

describe('CC#1 · condiciones que quedaban', () => {
  it('una fecha con ESPACIOS («2026 10 09», «09 10 2026») no es un teléfono ajeno; los teléfonos con espacios siguen siéndolo', () => {
    const tel = (t: string) => datosDeContacto(t).telefonos.length
    for (const t of ['Desde el 2026 10 09', 'el 09 10 2026']) expect(tel(t), t).toBe(0)
    for (const t of ['Escríbenos al 099 123 4567', 'al 042 345 678', 'Tel 2 345 678', 'WhatsApp +593 99 123 4567']) expect(tel(t), t).toBe(1)
  })
  it('el nodo «Vigilar» del vigía espera 300 s (lo mismo que su ruta) y el resto de los tiempos de #474 siguen', () => {
    const src = fs.readFileSync('scripts/worker-staging/oficina/construir-oficina.mjs', 'utf8')
    expect(/http\(N\.vigia,[^\n]*timeout: 300000/.test(src)).toBe(true)
    expect(/http\(N\.registrar,[^\n]*timeout: 300000/.test(src)).toBe(true)
    expect(/http\(N\.rearmar,[^\n]*timeout: 300000/.test(src)).toBe(true)
    expect(/http\(N\.abrir,[^\n]*timeout: 120000/.test(src)).toBe(true)
    expect(fs.readFileSync('src/app/api/oficina/vigia/route.ts', 'utf8')).toMatch(/maxDuration = 300/)
  })
})
