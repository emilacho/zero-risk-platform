/**
 * 17-nov · GO creativos en cada paso · punto 7 (CC1 · certifica CC6): (a) el JSON roto de «mirar» se repara al leer, ANTES de gastar el reintento;
 * (b) el motivo de cierre queda SIEMPRE guardado en el encargo (nunca más un cierre «sin rastro»).
 * El caso real: encargo `f0490664` (foto · 11-nov) cerró fallido en «mirar» con `json_invalido: Unexpected token ']', ...\" pan)\"]}, ], \"prefer\"...`
 * (una coma sobrante antes de cerrar la lista) y sin `estado_del_motor.fallo`. Ambas cosas ya las cubre el código del 11-nov; aquí quedan FIJAS con una prueba. US$ 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { procesarSalida } from '../salida'
import { conCausaDelFallo, MOTIVO_SIN_DECLARAR } from '../causa-del-fallo'
import type { Estado } from '../tipos'

/** el repositorio guarda algunos archivos con CRLF: se compara siempre con LF */
const sinCR = (s: string) => s.replace(/\r/g, '')
/** la forma EXACTA del caso real: `…" pan)"]}, ], "preferencia": …` (la coma sobrante antes de `]`) */
const MIRAR_ROTO = '{"imagenes": [{"indice": 0, "reglas": [{"id": "o1", "presente": true, "evidencia": "se ve el plato completo"}], "texto_en_imagen": [], "marcas": [], "personas": 0, "producto": "ceviche", "elementos_visibles": ["plato", "limón", "(junto al pan)"]}, ], "preferencia": [0]}'

describe('(a) el JSON roto de «mirar» se repara al leer: no gasta el reintento ni tumba el encargo', () => {
  it('🔴 el caso real (coma sobrante antes de cerrar la lista) se lee en el PRIMER intento, con la reparación anotada', () => {
    expect(() => JSON.parse(MIRAR_ROTO)).toThrow(/Unexpected token/)
    const r = procesarSalida(MIRAR_ROTO, 'observacion_imagen.v1', 0, 1)
    expect(r).toMatchObject({ ok: true })
    if (r.ok) {
      expect((r.valor.imagenes as unknown[]).length).toBe(1)
      expect(r.normalizados).toEqual(['$: 1 coma(s) sobrante(s) antes de un cierre, quitada(s) al leer'])
    }
  })
  it('🔴 también en el ÚLTIMO intento (donde antes cerraba fallido): se lee igual', () => {
    expect(procesarSalida(MIRAR_ROTO, 'observacion_imagen.v1', 1, 1)).toMatchObject({ ok: true })
  })
  it('lo que la reparación no puede leer va al reintento con el error ORIGINAL (lo que el agente debe corregir)', () => {
    const r = procesarSalida('{"imagenes": [{"indice": 0 "personas": 1}], "preferencia": [0]}', 'observacion_imagen.v1', 0, 1)
    expect(r).toMatchObject({ ok: false, accion: 'reintentar' })
    if (!r.ok && r.accion === 'reintentar') expect(r.mensaje_de_error).toMatch(/json_invalido/)
  })
  it('🔴 «mirar» ilegible tras su reintento NO cierra el encargo: el orquestador sigue con la imagen sin juzgar y una ficha que bloquea (una persona mira)', () => {
    const fuente = sinCR(fs.readFileSync(path.resolve(__dirname, '../orquestador.ts'), 'utf8'))
    const i = fuente.indexOf('if (!p.ok && ES_MIRAR(paso.clave)) {')
    const j = fuente.indexOf('if (!p.ok) {', i)
    expect(i).toBeGreaterThan(0)
    expect(j).toBeGreaterThan(i)
    const rama = fuente.slice(i, j)
    expect(rama).toContain('return avanzar(P, enc.id)')
    expect(rama).not.toContain('fallar(')
  })
})

describe('(b) el motivo de cierre queda SIEMPRE guardado', () => {
  const base = { artefactos: {}, fichas: [], vueltas: {}, pasos_ejecutados: 0, gasto_usd: 0 } as unknown as Estado
  it('🔴 un cierre sin pasos (murió al abrir) también guarda su causa, con 0 pasos', () => {
    const e = conCausaDelFallo(base, 'el brief no es de video', new Date('2026-11-17T08:00:00Z'))
    expect((e as unknown as { fallo: Record<string, unknown> }).fallo).toMatchObject({ motivo: 'el brief no es de video', pasos_ejecutados: 0, en: '2026-11-17T08:00:00.000Z' })
  })
  it('🔴 sin texto de motivo, queda escrito que no se declaró (nunca vacío)', () => {
    const e = conCausaDelFallo(base, '', new Date('2026-11-17T08:00:00Z'))
    expect((e as unknown as { fallo: { motivo: string } }).fallo.motivo).toBe(MOTIVO_SIN_DECLARAR)
  })
  it('🔴 guarda: ningún código de la oficina cierra un encargo «fallido» sin pasar por `fallar` (que guarda la causa) o por la entrega de la mesa que `fallar` llama', () => {
    const raiz = path.resolve(__dirname, '..')
    const archivos: string[] = []
    const recorrer = (d: string) => { for (const x of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, x.name); if (x.isDirectory()) { if (x.name !== '__tests__' && x.name !== '__fixtures__') recorrer(p) } else if (p.endsWith('.ts')) archivos.push(p) } }
    recorrer(raiz)
    const escriben = archivos.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, n) => ({ f: path.relative(raiz, f).split(path.sep).join('/'), n: n + 1, l })))
      .filter((x) => /estado:\s*'fallido'/.test(x.l) && !/includes\(|===|!==/.test(x.l))
    // las 4 (la entrega de la mesa, el guardado, el rastro y la respuesta) son de orquestador.ts y están DENTRO de `fallar`, después de `conCausaDelFallo`
    expect(escriben.map((x) => x.f)).toEqual(['orquestador.ts', 'orquestador.ts', 'orquestador.ts', 'orquestador.ts'])
    const fuente = sinCR(fs.readFileSync(path.join(raiz, 'orquestador.ts'), 'utf8'))
    const ini = fuente.indexOf('export async function fallar(')
    const fin = fuente.indexOf('\n}\n', ini)
    const causa = fuente.indexOf('conCausaDelFallo(enc.estado_del_motor', ini)
    for (const x of escriben) {
      const pos = fuente.split('\n').slice(0, x.n - 1).join('\n').length
      expect(pos, `${x.f}:${x.n}`).toBeGreaterThan(causa)
      expect(pos, `${x.f}:${x.n}`).toBeLessThan(fin)
    }
  })
})
