/**
 * 19-nov · G5b · A′ (GO Lenovo 03:41Z, con sus 2 cambios). Puras y por la oficina en memoria, en seco, US$ 0.
 * (1) la duración la declara el brief (`DURACIÓN: N s · porqué`); sin ella, 15 s Y una ficha visible; (2) los topes de ESE encargo se calculan con su duración,
 * no con la pieza más larga (120 s); (3) si el guion pide más, nada se recorta: se recalculan dentro del tope de la campaña (el del encargo) con aviso; si no cabe,
 * vuelve UNA vez a la mesa con el aviso, y sin vuelta el pedido no sale (no se recorta).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '../brief'
import { validarPlantilla } from '../plantilla'
import { TOPE_MAXIMO_DEL_SOBRE_USD } from '../sobre'
import { abrirEncargo, plantillaDe } from '../orquestador'
import { ejecutarCodigoV } from '../orquestador-video'
import { traducirGuion } from '../video/guion'
import { parametrosDelVideo } from '../video/propuestas'
import { VIDEO_MESA_POR_SEGUNDO } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Encargo } from '../puertos'
import { estadoInicial, type Plantilla } from '../tipos'
import { aplicarTopesPorDuracion } from '../topes-por-duracion'
import { CLAVE_DE_LA_DURACION, duracionAbierta, duracionDeLaPieza, leerDuracion, segundosDelEncargo } from '../video/duracion-de-la-pieza'
import { TECHO_DE_LA_PIEZA_S } from '../video/techo-de-la-pieza'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T
/** la plantilla viva que deja G5b: rango hasta 120 s, 15 s por omisión */
const conRango = (max = TECHO_DE_LA_PIEZA_S, omision: number | undefined = 15): Plantilla => {
  const p = copia(VIDEO_MESA_POR_SEGUNDO)
  const v = p.limites.video as Record<string, unknown>
  v.segundos_max = max
  if (omision !== undefined) v.duracion_por_omision_s = omision
  return p
}
const topesA = (s: number) => aplicarTopesPorDuracion(conRango(), s).plantilla
const parteCon = (duracion?: string) => ['## Briefs', '', '### BRF-G5B · Instagram · reel', '- QUÉ ES: un reel del local', ...(duracion !== undefined ? [`- DURACIÓN: ${duracion}`] : []), '- MENSAJE: venir hoy', ''].join('\n')

describe('G5b · leer la duración del brief', () => {
  it('🔴 segundos, minutos y el porqué', () => {
    expect(leerDuracion('45 s · porque cuenta la historia en tres momentos')).toEqual({ segundos: 45, porque: 'cuenta la historia en tres momentos' })
    expect(leerDuracion('1 min 30 s · tres capítulos')).toEqual({ segundos: 90, porque: 'tres capítulos' })
    expect(leerDuracion('2 min')).toEqual({ segundos: 120, porque: '' })
    expect(leerDuracion('90 segundos, la receta completa')).toEqual({ segundos: 90, porque: 'la receta completa' })
  })
  it('🔴 sin un largo legible no adivina', () => {
    expect(leerDuracion('')).toBeNull()
    expect(leerDuracion('lo que haga falta')).toBeNull()
    expect(leerDuracion('0 s')).toBeNull()
  })
  it('🔴 parsearBrief lee el campo DURACIÓN', () => {
    expect(parsearBrief(parteCon('45 s · tres momentos'), 'BRF-G5B')?.duracion).toBe('45 s · tres momentos')
    expect(parsearBrief(parteCon(), 'BRF-G5B')?.duracion).toBeUndefined()
  })
})

describe('G5b · la duración con que se abre', () => {
  it('🔴 la declarada, con su porqué y sin aviso', () => {
    expect(duracionDeLaPieza({ duracion: '45 s · tres momentos' }, conRango())).toEqual({ segundos: 45, porque: 'tres momentos', por_omision: false })
  })
  it('🔴 sin declarar: la de por omisión de la plantilla, marcada y CON aviso', () => {
    const d = duracionDeLaPieza({}, conRango(120, 20))
    expect(d).toMatchObject({ segundos: 20, por_omision: true })
    expect(d.aviso).toMatch(/no declara la duración.*20 s/)
    expect(duracionDeLaPieza(null, conRango(120, undefined))).toMatchObject({ segundos: 15, por_omision: true })
    expect(duracionDeLaPieza({ duracion: 'larga' }, conRango()).aviso).toMatch(/no se pudo leer/)
  })
  it('🔴 lo que pasa del máximo se abre con el máximo, con aviso', () => {
    const d = duracionDeLaPieza({ duracion: '3 min · todo' }, conRango())
    expect(d).toMatchObject({ segundos: TECHO_DE_LA_PIEZA_S, por_omision: false })
    expect(d.aviso).toMatch(/pide 180 s.*hasta 120 s/)
    expect(duracionDeLaPieza({ duracion: '40 s' }, conRango(30)).segundos).toBe(30)
  })
})

describe('G5b · los topes del encargo con su duración', () => {
  it('🔴 a 15 s, los de 15 s aunque la plantilla admita 120', () => {
    const a15 = aplicarTopesPorDuracion(conRango(15)).plantilla
    expect(topesA(15).limites.tope_encargo_usd).toBe(a15.limites.tope_encargo_usd)
    expect(topesA(15).pasos.find((p) => p.funcion === 'video')!.tope_usd).toBe(a15.pasos.find((p) => p.funcion === 'video')!.tope_usd)
    expect(topesA(120).limites.tope_encargo_usd).toBeGreaterThan(topesA(15).limites.tope_encargo_usd)
    // sin segundos: la más larga, como siempre
    expect(aplicarTopesPorDuracion(conRango()).plantilla.limites.tope_encargo_usd).toBe(topesA(120).limites.tope_encargo_usd)
    // nunca más que el máximo de la plantilla
    expect(aplicarTopesPorDuracion(conRango(60), 500).plantilla.limites.tope_encargo_usd).toBe(aplicarTopesPorDuracion(conRango(60)).plantilla.limites.tope_encargo_usd)
  })
  it('🔴 segundosDelEncargo: la recalculada por el guion manda; luego la abierta; sin dato, la de por omisión', () => {
    const pl = conRango()
    expect(segundosDelEncargo({ sala_ref: { [CLAVE_DE_LA_DURACION]: { segundos: 45 } } }, pl)).toBe(45)
    expect(segundosDelEncargo({ sala_ref: { [CLAVE_DE_LA_DURACION]: { segundos: 45 } }, estado_del_motor: { artefactos: { pedido_video: { datos: { duracion_s: 70 } } } } }, pl)).toBe(70)
    expect(segundosDelEncargo({ sala_ref: null }, pl)).toBe(15)
    expect(segundosDelEncargo({ sala_ref: { [CLAVE_DE_LA_DURACION]: { segundos: 999 } } }, pl)).toBe(120)
    expect(duracionAbierta({ sala_ref: null })).toBeNull()
  })
  it('🔴 una plantilla sin topes por segundo de video no cambia (undefined)', () => {
    const fija = aplicarTopesPorDuracion(conRango()).plantilla
    expect(segundosDelEncargo({ sala_ref: { [CLAVE_DE_LA_DURACION]: { segundos: 45 } } }, fija)).toBeUndefined()
  })
})

describe('G5b · por la oficina (memoria, en seco)', () => {
  const abrir = async (parte: string, pl = conRango(), tope_usd?: number) => {
    const M = crearMemoria({ plantilla: pl, parte })
    const r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-G5B', dry_run: true, familia: pl.familia, ...(tope_usd ? { tope_usd } : {}) }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    return { M, r, enc: [...M.encargos.values()][0] as Encargo | undefined }
  }
  it('🔴 abre con la duración del brief guardada y el motor ve los topes de ESA duración', async () => {
    const { M, r, enc } = await abrir(parteCon('45 s · tres momentos'))
    expect(r.status, JSON.stringify(r.cuerpo)).toBeLessThan(300)
    expect(enc!.sala_ref?.[CLAVE_DE_LA_DURACION]).toEqual({ segundos: 45, porque: 'tres momentos', por_omision: false })
    const pl = await plantillaDe(M.P, enc!)
    expect(pl.limites.tope_encargo_usd).toBe(Math.min(enc!.tope_usd, topesA(45).limites.tope_encargo_usd))
    expect(pl.pasos.find((p) => p.funcion === 'video')!.tope_usd).toBe(topesA(45).pasos.find((p) => p.funcion === 'video')!.tope_usd)
  })
  it('🔴 el tope con que nace es el de la campaña (el sobre), no el de la duración: deja lugar para que el guion crezca', async () => {
    const { enc } = await abrir(parteCon('20 s · corto'), conRango(), 300)
    expect(enc!.tope_usd).toBe(300)
  })
  it('🔴 sin DURACIÓN: 15 s por omisión, guardado con su aviso (la ficha lo muestra)', async () => {
    const { M, enc } = await abrir(parteCon())
    const d = enc!.sala_ref?.[CLAVE_DE_LA_DURACION] as { segundos: number; por_omision: boolean; aviso: string }
    expect(d).toMatchObject({ segundos: 15, por_omision: true })
    expect(d.aviso).toMatch(/nadie la razonó/)
    expect((await plantillaDe(M.P, enc!)).pasos.find((p) => p.funcion === 'video')!.tope_usd).toBe(topesA(15).pasos.find((p) => p.funcion === 'video')!.tope_usd)
  })
  it('🔴 la cobertura se mide con la duración declarada: un sobre que cubre 15 s pero no 120 abre', async () => {
    const t15 = topesA(15).limites.tope_encargo_usd
    const { r } = await abrir(parteCon('15 s · un momento'), conRango(), Math.ceil(t15) + 1)
    expect(r.status, JSON.stringify(r.cuerpo)).toBeLessThan(300)
  })
})

describe('G5b · cambio 2 de Lenovo · el guion pide más: nada se recorta', () => {
  const guion = (planos: number, seg: number) => [
    ...Array.from({ length: planos }, (_, i) => [`## Plano ${i + 1} · ${i * seg}–${(i + 1) * seg} s`, 'Rol: situar', `Se ve: la escena ${i + 1}`, 'Movimiento: fija', 'Foto: ninguna'].join('\n')),
    '## Audio', 'ambiente', '## Pie', 'Ven hoy.', '## Etiquetas', '#local',
  ].join('\n\n')
  const PASO = conRango().pasos.find((p) => p.funcion === 'pedido_de_video')!
  const armar = (segAbierta: number, planos: number, seg: number, tope: number, vueltas = 0) => {
    const t = traducirGuion(guion(planos, seg), { segundosMin: 4, segundosMax: TECHO_DE_LA_PIEZA_S })
    if (!t.ok) throw new Error(t.motivo)
    const brief = parsearBrief(parteCon(`${segAbierta} s · corto`), 'BRF-G5B')!
    const e = { ...estadoInicial(), vueltas: { [PASO.clave]: vueltas }, artefactos: {
      encargo: { version: 1, version_consumida: 1, datos: { brief, proporcion: '9:16', F: { fotos: [] }, familia: 'video', plataforma: 'instagram', elementos: [], formato_video: 'reel' } },
      guion: { version: 1, version_consumida: 0, datos: { ...t, texto: 'guion' } },
    } }
    return { id: 'enc-g5b', client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-G5B', familia: conRango().familia, tope_usd: tope, dry_run: true, sala_ref: { [CLAVE_DE_LA_DURACION]: { segundos: segAbierta, porque: 'corto', por_omision: false } }, estado_del_motor: e } as unknown as Encargo
  }
  const correr = async (enc: Encargo) => {
    const M = crearMemoria({ plantilla: conRango() })
    const pl = await plantillaDe(M.P, enc)
    return ejecutarCodigoV(M.P, enc, pl, pl.pasos.find((p) => p.funcion === 'pedido_de_video')!)
  }
  it('🔴 cabe en el tope de la campaña: se recalculan los topes con la duración del guion, el pedido sale entero y queda el aviso', async () => {
    const enc = armar(15, 3, 10, 400)
    const s = await correr(enc)
    expect(s.fallido).toBeUndefined()
    const a = s.res.artefacto as Record<string, unknown>
    expect(a.vuelve_a_la_mesa).toBe(false)
    expect(a.duracion_s).toBe(30)
    expect(String(a.aviso_duracion)).toMatch(/dura 30 s y el brief abrió 15 s/)
    // desde aquí el motor ve los topes de 30 s
    const despues = { ...enc, estado_del_motor: { ...enc.estado_del_motor, artefactos: { ...enc.estado_del_motor.artefactos, pedido_video: { version: 1, version_consumida: 0, datos: a } } } } as Encargo
    const M = crearMemoria({ plantilla: conRango() })
    expect((await plantillaDe(M.P, despues)).pasos.find((p) => p.funcion === 'video')!.tope_usd).toBe(topesA(30).pasos.find((p) => p.funcion === 'video')!.tope_usd)
  })
  it('🔴 no cabe y le queda la vuelta: vuelve UNA vez a la mesa con el aviso, sin pedir nada', async () => {
    const tope = Math.floor(topesA(15).limites.tope_encargo_usd) + 1 // cubre 15 s, no 30
    const s = await correr(armar(15, 3, 10, tope))
    expect(s.fallido).toBeUndefined()
    const a = s.res.artefacto as Record<string, unknown>
    expect(a.vuelve_a_la_mesa).toBe(true)
    expect(a.pedido).toBeUndefined()
    expect(String(a.aviso_a_la_mesa)).toMatch(/dura 30 s.*abrió 15 s.*Rehaz el guion dentro de 15 s/)
  })
  it('🔴 no cabe y ya volvió: no se recorta y no se pide; queda para decidir', async () => {
    const tope = Math.floor(topesA(15).limites.tope_encargo_usd) + 1
    const s = await correr(armar(15, 3, 10, tope, 9))
    expect(s.fallido).toMatch(/No se recorta/)
    expect(s.res.artefacto).toBeUndefined()
  })
  it('🔴 un guion dentro de lo abierto sigue como antes (sin aviso ni recálculo)', async () => {
    const s = await correr(armar(45, 3, 10, 400))
    const a = s.res.artefacto as Record<string, unknown>
    expect(a.duracion_s).toBeUndefined()
    expect(a.aviso_duracion).toBeUndefined()
  })
})

describe('G5b · la migración 202611190500 (detrás de la 202611190330 de CC3)', () => {
  const RAIZ = path.resolve(__dirname, '../../../../supabase')
  const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r/g, '')
  const tomar = (sql: string, d: string) => { const a = `$${d}$`; const i = sql.indexOf(a); return JSON.parse(sql.slice(i + a.length, sql.indexOf(a, i + a.length))) }
  const CC3 = leer('migrations', '202611190330_oficina_video_al_triple_de_lo_medido.sql')
  const MIG = leer('migrations', '202611190500_oficina_video_duracion_de_la_pieza.sql')
  const REV = leer('reversas', '202611190500_oficina_video_duracion_de_la_pieza_REVERSA.sql')
  const vivaDeCC3 = (): Plantilla => ({ ...copia(VIDEO_MESA_POR_SEGUNDO), pasos: tomar(CC3, 'pasos'), limites: tomar(CC3, 'lim') })
  it('🔴 «antes» = el «después» de CC3; solo cambian segundos_max (15 → 120) y duracion_por_omision_s (15)', () => {
    expect(tomar(MIG, 'lim_antes')).toEqual(tomar(CC3, 'lim'))
    const esperado = copia(tomar(CC3, 'lim')); esperado.video.segundos_max = TECHO_DE_LA_PIEZA_S; esperado.video.duracion_por_omision_s = 15
    expect(tomar(MIG, 'lim')).toEqual(esperado)
    expect(MIG).not.toMatch(/pasos =/)
  })
  it('🔴 la reversa deja exactamente lo de CC3 y niega si el dato no es el de G5b', () => {
    expect(tomar(REV, 'lim')).toEqual(tomar(CC3, 'lim'))
    expect(tomar(REV, 'lim_antes')).toEqual(tomar(MIG, 'lim'))
  })
  it('🔴 la columna es el techo de la familia a 120 s y cabe en el techo de la base; un encargo de 15 s reserva lo mismo que con la fila de CC3', () => {
    const despues = { ...vivaDeCC3(), limites: tomar(MIG, 'lim') }
    expect(validarPlantilla(despues)).toEqual(validarPlantilla(vivaDeCC3()))
    const a120 = aplicarTopesPorDuracion(despues).plantilla.limites.tope_encargo_usd
    expect(MIG).toContain(`tope_encargo_usd = ${a120},`)
    expect(a120).toBeLessThanOrEqual(TOPE_MAXIMO_DEL_SOBRE_USD)
    const a15 = aplicarTopesPorDuracion(despues, 15).plantilla
    const cc3 = aplicarTopesPorDuracion(vivaDeCC3()).plantilla
    expect(a15.limites.tope_encargo_usd).toBe(cc3.limites.tope_encargo_usd)
    expect(a15.pasos.map((p) => p.tope_usd)).toEqual(cc3.pasos.map((p) => p.tope_usd))
    expect(MIG).toContain('117.9::numeric')
  })
  it('🔴 con la fila de G5b, un brief sin DURACIÓN abre con 15 s', () => {
    expect(duracionDeLaPieza({}, { limites: tomar(MIG, 'lim') } as Plantilla)).toMatchObject({ segundos: 15, por_omision: true })
  })
})

describe('G5b · 🟡 de CC6 (#1201) · el mínimo y la de por omisión dentro del rango', () => {
  const nuevos = (p: Plantilla) => validarPlantilla(p).filter((x) => !validarPlantilla(conRango()).includes(x))
  const con = (o: Record<string, unknown>) => { const p = conRango(); Object.assign(p.limites.video as Record<string, unknown>, o); return p }
  it('🔴 la plantilla rechaza un mínimo sobre el techo o sobre el máximo', () => {
    expect(nuevos(con({ segundos_min: 121 })).join(' ')).toMatch(/segundos_min.*\(121\) pasa del techo/)
    expect(nuevos(con({ segundos_min: 30, segundos_max: 20 })).join(' ')).toMatch(/segundos_min.*\(30\) es mayor que .segundos_max. \(20\)/)
    expect(nuevos(con({ segundos_min: 8 }))).toEqual([])
  })
  it('🔴 la de por omisión tiene que ser un número dentro del rango', () => {
    for (const d of [0, -1, 'quince', 121, 4]) expect(nuevos(con({ duracion_por_omision_s: d })).join(' '), String(d)).toMatch(/duracion_por_omision_s/)
    expect(nuevos(con({ duracion_por_omision_s: 15 }))).toEqual([])
  })
  it('🔴 la mesa nunca recibe un mínimo sobre el techo (el máximo no queda debajo del mínimo)', () => {
    const r = parametrosDelVideo(con({ segundos_min: 500, segundos_max: 600 }))
    expect(r.segundos_min).toBe(TECHO_DE_LA_PIEZA_S)
    expect(r.segundos_max).toBe(TECHO_DE_LA_PIEZA_S)
  })
})
