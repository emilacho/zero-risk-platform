/**
 * 20-nov · PLAN v4 (CC4) · EL SEGUNDO DOCTOR CREATIVO EN LA PROPUESTA · el paso `segunda_mirada` de la oficina, su lugar en las 4 mesas y la migración 202611201500.
 * Condiciones: CC7 11:26Z (1 → guarda, 2 contador propio, 3 «cabe» con el costo de rehacer, 4 una sola llamada y dry_run sin llamadas, 5 `datos` fuera del aviso)
 * · CC6 (1-12 de su revisión y ADENDA 2: 9 la posición, 10 margen de pasos, 11 lo decide el paso, 12 si GPT falla la pieza sigue). US$ 0, sin red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { estadoInicial, registrarPaso, siguientePaso } from '../index'
import { ARTEFACTO_BORRADOR_IMAGEN } from '../mesa/borrador-imagen'
import { ARTEFACTO_PROPUESTAS_IMAGEN } from '../mesa/propuestas-imagen'
import { FUNCIONES_CON_GASTO, FUNCIONES_REGISTRADAS, validarPlantilla } from '../plantilla'
import { CARRUSEL_MESA_CON_PROPUESTAS, KIT_MESA_CON_PROPUESTAS, POST_MESA_CON_PROPUESTAS } from '../plantillas/imagen-propuestas'
import { CARRUSEL_MESA_CON_SEGUNDA_MIRADA, KIT_MESA_CON_SEGUNDA_MIRADA, POST_MESA_CON_SEGUNDA_MIRADA, VIDEO_MESA_CON_SEGUNDA_MIRADA } from '../plantillas/segunda-mirada'
import { TOPES_DE_LAS_MESAS_DE_IMAGEN_USD } from '../plantillas/topes-de-las-mesas-de-imagen'
import { RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD } from '../plantillas/reserva-de-las-mesas-de-imagen'
import { COSTO_ESPERADO_DE_LA_SEGUNDA_MIRADA_USD, COSTO_ESPERADO_DE_LA_VUELTA_A_LA_MESA_USD, RESERVA_POR_PIEZA_CON_SEGUNDA_MIRADA_USD, RESERVA_POR_PIEZA_LEIDA_ANTES_DE_LA_SEGUNDA_MIRADA_USD, TOPES_CON_SEGUNDA_MIRADA_USD, TOPES_LEIDOS_ANTES_DE_LA_SEGUNDA_MIRADA_USD } from '../plantillas/segunda-mirada'
import { CARRUSEL_MESA_CON_CORRECCION, KIT_MESA_CON_CORRECCION, POST_MESA_CON_CORRECCION } from '../plantillas/imagen-correccion'
import { RESERVA_POR_PIEZA_DE_LA_CORRECCION_USD } from '../mesa/correccion-imagen'
import { VIDEO_MESA_ENCENDIDA } from '../plantillas/video-mesa'
import type { Encargo, Puertos } from '../puertos'
import { ARTEFACTO_SEGUNDA_MIRADA, cabeLaVueltaDeLaSegundaMirada, conSegundaMirada, correrSegundaMirada, materialDeLaPropuesta, pasoDeLaSegundaMirada, segundaMiradaYaDada } from '../segunda-mirada'
import { leerRespuestas } from '../sentido-contra-la-ficha'
import { sobreDeLaRevision } from '../paso-jefatura'
import type { Estado, Plantilla } from '../tipos'
import { coberturaDelTope, loQueSigueDeLaMesa, reservaPorPasadaDeLaMesa } from '../topes-por-duracion'
import { MARCA_DE_FIN_DEL_INFORME, MARCA_DE_INICIO_DEL_INFORME, TEXTO_HONESTO_AL_CREATIVO } from '../../segundo-doctor'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, 'supabase', ...p), 'utf8').replace(/\r/g, '')
const MIG = leer('migrations', '202611201500_oficina_segunda_mirada_en_la_propuesta.sql')
const REV = leer('reversas', '202611201500_oficina_segunda_mirada_en_la_propuesta_REVERSA.sql')
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
const claves = (pl: Plantilla) => pl.pasos.map((p) => p.clave)

const MANUAL = 'Manual. La luz de la tarde debe sentirse cálida y dorada, nunca fría ni azulada en las fotos.'
const BRIEF = 'Un atardecer en la terraza con el plato estrella servido.'
/** lo que arma `contextoDelRevisorDeLaPieza` (el mismo de la jefatura del render); el plan vacío no debe viajar */
const CONTEXTO = [
  { titulo: 'Manual de marca del cliente', funcion: 'lo vigente', texto: MANUAL },
  { titulo: 'Plan de trabajo del cliente', funcion: 'el plan', texto: '' },
  { titulo: 'El brief de este entregable', funcion: 'el encargo', texto: BRIEF },
]
const PROPUESTAS = {
  ronda: 1, clase: 'post_img', avisos: [], citas: '',
  propuestas: [
    { id: 'P1', nombre: 'La terraza', texto: 'Ven a ver el atardecer desde la terraza: el plato estrella te espera.', laminas: [{ n: 1 }] },
    { id: 'P2', nombre: 'La cocina', texto: 'Lo de siempre, distinto: la cocina abierta al final del día.', laminas: [{ n: 1 }] },
  ],
}
const BORRADORES = { fase: 'borrador', ronda: 1, calidad: 'low', costo_usd: 0.1, propuestas: [{ id: 'P1', costo_usd: 0.05, laminas: [{ n: 1, png_url: 'https://x/p1.png' }] }, { id: 'P2', costo_usd: 0.05, laminas: [{ n: 1, png_url: 'https://x/p2.png' }] }] }

/** el estado de un post justo cuando le toca a `segunda_mirada` (la mesa, el borrador y lo que trajo `abrir`), registrado con el motor */
function estadoAntesDeLaSegundaMirada(pl: Plantilla, gasto = 2): Estado {
  let e = estadoInicial()
  const hasta = pl.pasos.findIndex((p) => p.clave === 'segunda_mirada')
  for (let i = 0; i < hasta; i++) {
    const p = pl.pasos[i]
    const artefacto: Record<string, unknown> =
      p.clave === 'abrir' ? { brief: { texto: BRIEF }, F: { manual_texto: MANUAL, plan_texto: null } }
      : p.clave === 'mesa' ? { texto: 'texto de la mesa' }
      : p.clave === ARTEFACTO_BORRADOR_IMAGEN ? BORRADORES : {}
    const otros = p.clave === 'mesa' ? { otros_artefactos: { [ARTEFACTO_PROPUESTAS_IMAGEN]: PROPUESTAS } } : {}
    e = registrarPaso(e, pl, i, { costo_usd: i === 0 ? gasto : 0, artefacto, ...otros } as never)
  }
  return e
}
const encargo = (e: Estado, extra: Partial<Encargo> = {}): Encargo => ({
  id: 'enc-1', client_id: 'cli-1', parte_id: 'p', brief_id: 'b', tipo_de_grupo: 'post_mesa', familia: 'post_mesa', version_encargo: 1, estado: 'en_paso',
  estado_del_motor: e, con_desacuerdo: false, imagen_generada: false, tope_usd: 999, gasto_usd: e.gasto_usd, dry_run: false, prueba: false, sala_ref: null, salida_output_id: null, hitl_queue_id: null, ...extra,
})
const respuestaDeGpt = (cuerpo: unknown) => `Mi lectura creativa.\n${MARCA_DE_INICIO_DEL_INFORME}\n${JSON.stringify(cuerpo)}\n${MARCA_DE_FIN_DEL_INFORME}`
const CON_OBS = respuestaDeGpt({
  observaciones: [{ que: 'El color está muy liviano', por_que: 'resta apetito', parte: 'imagen 1', fuente: 'Manual de marca del cliente', cita: 'la luz de la tarde debe sentirse cálida y dorada' }],
  datos: [{ que: 'EL PRECIO NO COINCIDE', paso_de_origen: 'brief', parte: 'imagen 2' }],
})
function revisorFalso(texto = CON_OBS, ok = true) {
  const llamadas: Array<{ texto: string; imagenes_urls: string[] }> = []
  const P = {
    async revisor(p: { texto: string; imagenes_urls: string[] }) {
      llamadas.push(p)
      return ok ? { ok: true as const, texto, costo_usd: 0.07, modelo: 'gpt-x', modelo_efectivo: 'gpt-x-2026-11-01', intentos: [] } : { ok: false as const, error: 'cayó', costo_usd: 0, intentos: [] }
    },
  } as unknown as Pick<Puertos, 'revisor'>
  return { P, llamadas }
}
const PL = POST_MESA_CON_SEGUNDA_MIRADA
const PASO = PL.pasos.find((p) => p.clave === 'segunda_mirada')!
/** el tope de hoy no deja lugar a la vuelta (ALTO de CC4 a LENOVO): para probar el camino de la vuelta, un tope que la cubre */
const AMPLIO = { ...PL, limites: { ...PL.limites, tope_encargo_usd: 100 } } as Plantilla
/** lo que cuesta volver: una pasada de la mesa + todo lo que sigue a la mesa + las rondas del dueño que quedan */
const REHACER = reservaPorPasadaDeLaMesa(PL) + loQueSigueDeLaMesa(PL, { vueltas: {} })
const datosDe = (r: { res: { artefacto?: Record<string, unknown> } }) => r.res.artefacto as Record<string, unknown>
/** lo gastado en el PEOR caso justo al decidir la vuelta (la mesa a su cota y cada paso anterior a su tope, este incluido) */
const gastadoAlDecidir = (pl: Plantilla) => {
  const i = pl.pasos.findIndex((p) => p.clave === 'segunda_mirada')
  return reservaPorPasadaDeLaMesa(pl) + pl.pasos.slice(0, i).filter((p) => p.funcion !== 'mesa').reduce((a, s) => a + (Number(s.tope_usd) || 0), 0)
}
/** el peor caso con la vuelta de GPT: lo gastado al decidir + este paso a su tope + rehacer todo (una pasada de la mesa, lo que sigue y las rondas del dueño) */
const peorConLaVuelta = (pl: Plantilla) => gastadoAlDecidir(pl) + Number(pl.pasos.find((p) => p.clave === 'segunda_mirada')!.tope_usd) + reservaPorPasadaDeLaMesa(pl) + loQueSigueDeLaMesa(pl, { vueltas: {} })

describe('el lugar del paso en las 4 mesas (PLAN v4 · (A) sin render)', () => {
  it('imagen: justo después del borrador y antes de que el dueño apruebe', () => {
    for (const pl of [POST_MESA_CON_SEGUNDA_MIRADA, CARRUSEL_MESA_CON_SEGUNDA_MIRADA, KIT_MESA_CON_SEGUNDA_MIRADA]) {
      expect(claves(pl).join(',')).toContain('mesa,borrador_imagen,segunda_mirada,aprobar_propuestas,imagen')
    }
  })
  it('video: después de las imágenes clave borrador y ANTES de borrador_video', () => {
    expect(claves(VIDEO_MESA_CON_SEGUNDA_MIRADA).join(',')).toContain('mesa,imagenes_clave,segunda_mirada,borrador_video,aprobar_propuestas,imagenes_clave_final')
  })
  it('lo demás queda igual que hoy en vivo (con la corrección de CC1): mismos pasos y límites; en imagen solo cambia el tope', () => {
    for (const [con, sin] of [[POST_MESA_CON_SEGUNDA_MIRADA, POST_MESA_CON_CORRECCION], [CARRUSEL_MESA_CON_SEGUNDA_MIRADA, CARRUSEL_MESA_CON_CORRECCION], [KIT_MESA_CON_SEGUNDA_MIRADA, KIT_MESA_CON_CORRECCION], [VIDEO_MESA_CON_SEGUNDA_MIRADA, VIDEO_MESA_ENCENDIDA]] as const) {
      expect(con.pasos.filter((p) => p.clave !== 'segunda_mirada')).toEqual(sin.pasos)
      const { tope_encargo_usd: _a, ...restoCon } = con.limites
      const { tope_encargo_usd: _b, ...restoSin } = sin.limites
      expect(restoCon).toEqual(restoSin)
    }
    expect(VIDEO_MESA_CON_SEGUNDA_MIRADA.limites).toEqual(VIDEO_MESA_ENCENDIDA.limites)
    expect(claves(POST_MESA_CON_SEGUNDA_MIRADA).join(',')).toContain('aprobar_propuestas,imagen,corregir_imagen,editar_imagen,mirar_correccion,observar')
  })
  it('el paso nuevo no agrega ningún error de validación a las 4; la función está registrada y tiene gasto', () => {
    for (const [con, sin] of [[POST_MESA_CON_SEGUNDA_MIRADA, POST_MESA_CON_CORRECCION], [CARRUSEL_MESA_CON_SEGUNDA_MIRADA, CARRUSEL_MESA_CON_CORRECCION], [KIT_MESA_CON_SEGUNDA_MIRADA, KIT_MESA_CON_CORRECCION], [VIDEO_MESA_CON_SEGUNDA_MIRADA, VIDEO_MESA_ENCENDIDA]] as const) {
      expect(validarPlantilla(con).filter((x) => /segunda_mirada/.test(x))).toEqual([])
      expect(validarPlantilla(con)).toEqual(validarPlantilla(sin))
    }
    expect(FUNCIONES_REGISTRADAS).toContain('segunda_mirada')
    expect(FUNCIONES_CON_GASTO).toContain('segunda_mirada')
  })
  it('no se mete dos veces', () => expect(() => conSegundaMirada(POST_MESA_CON_SEGUNDA_MIRADA)).toThrow(/ya tiene/))
})

describe('🔴 la migración 202611201500 escribe EXACTAMENTE el paso del código, con la guarda en la misma sentencia', () => {
  const S = sentencias(MIG)
  it('el JSON del paso es el del código', () => {
    expect(JSON.parse(/\$s\$([\s\S]*?)\$s\$/.exec(S)![1])).toEqual(JSON.parse(JSON.stringify(pasoDeLaSegundaMirada())))
  })
  it('entra después de borrador_imagen (imagen) o de imagenes_clave (video), en las 4 filas', () => {
    expect(S).toMatch(/WHERE p->>'clave' IN \('borrador_imagen', 'imagenes_clave'\)/)
    expect(S).toMatch(/WHERE g\.tipo IN \('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'\)/)
  })
  it('la guarda de encargos vivos va DENTRO del UPDATE (también los que esperan al dueño) y se niega si no cambió las 4', () => {
    const upd = /UPDATE public\.oficina_tipos_de_grupo g[\s\S]*?;/.exec(S)![0]
    expect(upd).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.oficina_encargos e WHERE e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'\)\)/)
    expect(upd).not.toMatch(/dueno/)
    expect(S).toMatch(/GET DIAGNOSTICS n = ROW_COUNT;\s+IF n <> 4 THEN\s+RAISE EXCEPTION/)
  })
  it('bloquea la tabla de encargos y las 4 filas antes de mirar, en una sola transacción', () => {
    expect(S.indexOf('BEGIN;')).toBeLessThan(S.indexOf('LOCK TABLE public.oficina_encargos IN SHARE MODE;'))
    expect(S.indexOf('LOCK TABLE')).toBeLessThan(S.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(S).toMatch(/FOR UPDATE;/)
    expect(S.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
  const T = ['post_mesa', 'carrusel_mesa', 'kit_mesa'] as const
  const L = RESERVA_POR_PIEZA_LEIDA_ANTES_DE_LA_SEGUNDA_MIRADA_USD, N = RESERVA_POR_PIEZA_CON_SEGUNDA_MIRADA_USD
  const TL = TOPES_LEIDOS_ANTES_DE_LA_SEGUNDA_MIRADA_USD, TN = TOPES_CON_SEGUNDA_MIRADA_USD
  it('de los límites solo toca la reserva por pieza y el tope de las 3 mesas de imagen (columna = límite); nada del video', () => {
    const sets = S.match(/SET tope_encargo_usd = [\d.]+, limites = g\.limites \|\| jsonb_build_object\([^)]*\)\nWHERE g\.tipo = '[a-z_]+';/g) ?? []
    expect(sets).toHaveLength(3)
    expect(S.match(/SET limites/g) ?? []).toHaveLength(0)
    expect(S.match(/tope_encargo_usd = /g)?.length).toBeGreaterThan(0)
    expect(S).not.toMatch(/SET [^;]*WHERE g\.tipo = 'video_mesa';/)
  })
  it('🔴 va después de #1250: la reserva leída es la de CC2 + la de la corrección de CC1 (3,35 / 4 / 4) y el tope leído el de #1249 (43 / 45 / 45)', () => {
    expect(L).toEqual({ post_mesa: 3.35, carrusel_mesa: 4, kit_mesa: 4 })
    for (const t of T) expect(L[t]).toBeCloseTo(RESERVA_POR_PIEZA_DE_LAS_MESAS_DE_IMAGEN_USD[t] + RESERVA_POR_PIEZA_DE_LA_CORRECCION_USD[t], 2)
    expect(TL).toEqual(TOPES_DE_LAS_MESAS_DE_IMAGEN_USD)
  })
  it('🔴 punto 1 de CC7 (#1251) · la reserva por pieza sube a la del código: lo leído + GPT + la vuelta a la mesa (contada siempre)', () => {
    expect(N).toEqual({ post_mesa: 5.91, carrusel_mesa: 6.56, kit_mesa: 6.56 })
    for (const t of T) {
      expect(N[t]).toBeCloseTo(L[t] + COSTO_ESPERADO_DE_LA_SEGUNDA_MIRADA_USD + COSTO_ESPERADO_DE_LA_VUELTA_A_LA_MESA_USD, 2)
      expect(S).toContain(`SET tope_encargo_usd = ${TN[t]}, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', ${N[t]}, 'tope_encargo_usd', ${TN[t]})\nWHERE g.tipo = '${t}';`)
    }
    // es lo esperado, no el peor caso: sigue muy por debajo del tope de cada mesa
    for (const t of T) expect(N[t]).toBeLessThan(TN[t] / 5)
  })
  it('🔴 el tope nuevo cubre el peor caso con la vuelta de GPT (lo de antes a su tope + rehacer todo); uno menos, no', () => {
    for (const pl of [POST_MESA_CON_SEGUNDA_MIRADA, CARRUSEL_MESA_CON_SEGUNDA_MIRADA, KIT_MESA_CON_SEGUNDA_MIRADA]) {
      const t = pl.tipo as (typeof T)[number]
      expect(pl.limites.tope_encargo_usd).toBe(TN[t])
      const peor = peorConLaVuelta(pl)
      expect(peor, t).toBeLessThanOrEqual(TN[t])
      expect(peor, t).toBeGreaterThan(TN[t] - 1)
      expect(peor, t).toBeGreaterThan(TL[t])
      expect(coberturaDelTope(pl, TN[t]).cubre).toBe(true)
    }
  })
  it('🔴 exige lo leído (reserva y tope) ANTES de cambiar, y comprueba al final que quedó; frenan con EXCEPTION', () => {
    expect(L.carrusel_mesa).toBe(L.kit_mesa)
    expect(TL.carrusel_mesa).toBe(TL.kit_mesa)
    expect(S).toContain(`(g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${L.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${L.carrusel_mesa})) <> 3 THEN\n    RAISE EXCEPTION '202611201500: la reserva por pieza de las 3 mesas de imagen no es la leída`)
    expect(S).toContain(`(g.tipo = 'post_mesa' AND g.tope_encargo_usd = ${TL.post_mesa} AND (g.limites->>'tope_encargo_usd')::numeric = ${TL.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = ${TL.carrusel_mesa} AND (g.limites->>'tope_encargo_usd')::numeric = ${TL.carrusel_mesa})) <> 3 THEN\n    RAISE EXCEPTION '202611201500: el tope de las 3 mesas de imagen no es el leído`)
    expect(S.indexOf('no es la leída')).toBeLessThan(S.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(S.indexOf('no es el leído')).toBeLessThan(S.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(S).toContain(`(g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${N.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${N.carrusel_mesa})) <> 3 THEN\n    RAISE EXCEPTION '202611201500: la reserva por pieza no quedó`)
    expect(S).toContain(`(g.tipo = 'post_mesa' AND g.tope_encargo_usd = ${TN.post_mesa} AND (g.limites->>'tope_encargo_usd')::numeric = ${TN.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = ${TN.carrusel_mesa} AND (g.limites->>'tope_encargo_usd')::numeric = ${TN.carrusel_mesa})) <> 3 THEN\n    RAISE EXCEPTION '202611201500: el tope no quedó`)
    expect(S.lastIndexOf('no quedó en')).toBeGreaterThan(S.lastIndexOf('UPDATE public.oficina_tipos_de_grupo'))
    // la versión crece en las 4 filas (una sola vez: va en el UPDATE de los pasos)
    expect(S.match(/version = g\.version \+ 1/g)).toHaveLength(1)
  })
  it('la reversa saca solo ese paso, con la misma guarda', () => {
    const R = sentencias(REV)
    expect(R).toMatch(/WHERE p->>'clave' <> 'segunda_mirada'/)
    expect(R).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.oficina_encargos e WHERE e\.estado IN \('abierto', 'en_paso'\) AND e\.familia IN \('post_mesa', 'carrusel_mesa', 'kit_mesa', 'video_mesa'\)\)/)
    expect(R).toMatch(/LOCK TABLE public\.oficina_encargos IN SHARE MODE;/)
    expect(R).not.toMatch(/SET [^;]*WHERE g\.tipo = 'video_mesa';/)
  })
  it('🔴 la reversa vuelve la reserva y el tope a lo leído, exige lo que dejó la ida, lo comprueba al final y la versión crece', () => {
    const R = sentencias(REV)
    for (const t of T) {
      expect(R).toContain(`SET tope_encargo_usd = ${TL[t]}, limites = g.limites || jsonb_build_object('reserva_por_pieza_usd', ${L[t]}, 'tope_encargo_usd', ${TL[t]}) WHERE g.tipo = '${t}';`)
    }
    expect(R).toContain(`(g.tipo = 'post_mesa' AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${N.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND (g.limites->>'reserva_por_pieza_usd')::numeric = ${N.carrusel_mesa})) <> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201500: la reserva por pieza no es la que dejó`)
    expect(R).toContain(`(g.tipo = 'post_mesa' AND g.tope_encargo_usd = ${TN.post_mesa} AND (g.limites->>'tope_encargo_usd')::numeric = ${TN.post_mesa}) OR (g.tipo IN ('carrusel_mesa', 'kit_mesa') AND g.tope_encargo_usd = ${TN.carrusel_mesa} AND (g.limites->>'tope_encargo_usd')::numeric = ${TN.carrusel_mesa})) <> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201500: el tope no es el que dejó`)
    expect(R.indexOf('no es la que dejó')).toBeLessThan(R.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(R.indexOf('no es el que dejó')).toBeLessThan(R.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(R).toContain(`<> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201500: la reserva por pieza no volvió a`)
    expect(R).toContain(`<> 3 THEN\n    RAISE EXCEPTION 'REVERSA 202611201500: el tope no volvió a`)
    expect(R.lastIndexOf('no volvió a')).toBeGreaterThan(R.lastIndexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(R).toMatch(/version = g\.version \+ 1/)
    expect(R.trimEnd().endsWith('COMMIT;')).toBe(true)
  })
})

describe('🔴 por qué la guarda (CC6 9 · CC7 1): el motor ubica por POSICIÓN', () => {
  it('una pieza que espera en aprobar_propuestas con la plantilla vieja, leída con la nueva, cae en otro paso', () => {
    const vieja = POST_MESA_CON_CORRECCION
    let e = estadoInicial()
    const iAprobar = vieja.pasos.findIndex((p) => p.clave === 'aprobar_propuestas')
    for (let i = 0; i <= iAprobar; i++) e = registrarPaso(e, vieja, i, { costo_usd: 0, artefacto: {} })
    expect(vieja.pasos[e.ultimo].clave).toBe('aprobar_propuestas')
    expect(PL.pasos[e.ultimo].clave).toBe('segunda_mirada')
  })
  it('una pieza antes del punto de entrada no se corre', () => {
    let e = estadoInicial()
    const iMesa = POST_MESA_CON_CORRECCION.pasos.findIndex((p) => p.clave === 'mesa')
    for (let i = 0; i <= iMesa; i++) e = registrarPaso(e, POST_MESA_CON_CORRECCION, i, { costo_usd: 0, artefacto: {} })
    expect(PL.pasos[e.ultimo].clave).toBe('mesa')
  })
})

describe('lo que ve GPT: las propuestas como le llegan al dueño', () => {
  const m = materialDeLaPropuesta(estadoAntesDeLaSegundaMirada(PL), CONTEXTO)
  it('el texto de cada propuesta y sus imágenes borrador, rotuladas', () => {
    expect(m.revisado).toContain('### Propuesta P1 · La terraza')
    expect(m.revisado).toContain('el plato estrella te espera')
    expect(m.revisado).toContain('(imagen 1: propuesta P1, lámina 1)')
    expect(m.imagenes).toEqual(['https://x/p1.png', 'https://x/p2.png'])
  })
  it('el contexto: el mismo del revisor de la pieza, sin los vacíos', () => {
    expect(m.contexto.map((c) => c.titulo)).toEqual(['Manual de marca del cliente', 'El brief de este entregable'])
    expect(m.contexto[0].texto).toBe(MANUAL)
  })
})

describe('el paso', () => {
  it('con observaciones y vuelta que cabe: vuelve a la mesa con el aviso SIN firma, y los datos nunca van (CC7 5)', async () => {
    const { P, llamadas } = revisorFalso()
    const r = await correrSegundaMirada(P, encargo(estadoAntesDeLaSegundaMirada(PL)), AMPLIO, PASO, CONTEXTO)
    const d = datosDe(r)
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].texto).toContain('el plato estrella te espera')
    expect(llamadas[0].imagenes_urls).toEqual(['https://x/p1.png', 'https://x/p2.png'])
    expect(d.vuelve_a_la_mesa).toBe(true)
    expect(d.aviso_a_la_mesa).toContain(TEXTO_HONESTO_AL_CREATIVO)
    expect(d.aviso_a_la_mesa).toContain('[O1] El color está muy liviano')
    expect(d.aviso_a_la_mesa).not.toMatch(/PRECIO|gpt|openai|externo|doctor/i)
    expect(r.res.costo_usd).toBe(0.07)
    expect(r.gastos).toEqual([expect.objectContaining({ concepto: 'revisor_externo', cost_usd: 0.07 })])
  })
  it('guarda para medir: informe, huellas, modelo efectivo, la versión A y las imágenes (CC6 3, 4, 7)', async () => {
    const { P } = revisorFalso()
    const d = datosDe(await correrSegundaMirada(P, encargo(estadoAntesDeLaSegundaMirada(PL)), AMPLIO, PASO, CONTEXTO))
    expect(d.modelo_efectivo).toBe('gpt-x-2026-11-01')
    expect((d.resumen as { otro_proveedor: boolean }).otro_proveedor).toBe(true)
    expect((d.huellas as Array<{ titulo: string }>).map((h) => h.titulo)).toEqual(['Manual de marca del cliente', 'El brief de este entregable'])
    expect((d.informe as { datos: unknown[] }).datos).toHaveLength(1)
    expect(d.version_a).toContain('### Propuesta P1')
    expect(d.imagenes).toEqual(['https://x/p1.png', 'https://x/p2.png'])
  })
  it('sin observaciones: guarda y sigue, sin vuelta', async () => {
    const { P } = revisorFalso(respuestaDeGpt({ observaciones: [], datos: [] }))
    const d = datosDe(await correrSegundaMirada(P, encargo(estadoAntesDeLaSegundaMirada(PL)), AMPLIO, PASO, CONTEXTO))
    expect(d.vuelve_a_la_mesa).toBe(false)
    expect(d.aviso_a_la_mesa).toBeUndefined()
    expect(d.sin_vuelta).toBeUndefined()
  })
  it('en ensayo (dry_run): 0 llamadas a GPT y sigue (CC7 4)', async () => {
    const { P, llamadas } = revisorFalso()
    const r = await correrSegundaMirada(P, encargo(estadoAntesDeLaSegundaMirada(PL), { dry_run: true }), AMPLIO, PASO, CONTEXTO)
    expect(llamadas).toHaveLength(0)
    expect(datosDe(r).vuelve_a_la_mesa).toBe(false)
    expect(r.res.costo_usd).toBe(0)
  })
  it('si GPT falla, la pieza sigue sin vuelta (CC6 12)', async () => {
    const { P } = revisorFalso('', false)
    const d = datosDe(await correrSegundaMirada(P, encargo(estadoAntesDeLaSegundaMirada(PL)), AMPLIO, PASO, CONTEXTO))
    expect(d.sin_revision).toBe(true)
    expect(d.motivo).toBe('cayó')
    expect(d.vuelve_a_la_mesa).toBe(false)
  })
  it('🔴 una sola llamada aunque el paso corra otra vez: se decide por lo ya guardado (CC7 4)', async () => {
    const { P, llamadas } = revisorFalso()
    const e = estadoAntesDeLaSegundaMirada(PL)
    const i = PL.pasos.findIndex((p) => p.clave === 'segunda_mirada')
    const r1 = await correrSegundaMirada(P, encargo(e), AMPLIO, PASO, CONTEXTO)
    const e2 = registrarPaso(e, PL, i, r1.res)
    expect(segundaMiradaYaDada(e2)).toBe(true)
    const r2 = await correrSegundaMirada(P, encargo(e2), AMPLIO, PASO, CONTEXTO)
    expect(llamadas).toHaveLength(1)
    expect(datosDe(r2).ya_opino).toBe(true)
    expect(datosDe(r2).vuelve_a_la_mesa).toBe(false)
    expect(r2.res.costo_usd).toBe(0)
  })
  it('en la segunda pasada lee lo que contestó el creativo a cada [O…] y guarda la versión de después', async () => {
    const { P } = revisorFalso()
    const e = estadoAntesDeLaSegundaMirada(PL)
    const i = PL.pasos.findIndex((p) => p.clave === 'segunda_mirada')
    const e2 = registrarPaso(e, PL, i, (await correrSegundaMirada(P, encargo(e), AMPLIO, PASO, CONTEXTO)).res)
    const iMesa = PL.pasos.findIndex((p) => p.clave === 'mesa')
    const e3 = registrarPaso(e2, PL, iMesa, { costo_usd: 0, artefacto: { texto: 'nueva', respuestas_a_la_jefatura: ['RESPUESTA A LA JEFATURA O1: tomada'] } })
    const d = datosDe(await correrSegundaMirada(P, encargo(e3), AMPLIO, PASO, CONTEXTO))
    expect(d.respuestas_del_creativo).toEqual([expect.objectContaining({ id: 'O1' })])
    expect(typeof d.version_despues).toBe('string')
  })
  it('las [O…] no cambian lo que el lector devuelve para las fichas [S…] de la jefatura: mismas, en el mismo orden (CC6 8)', () => {
    const enviadas = [{ id: 'S1', texto: 'a', dura: true }, { id: 'S2', texto: 'b', dura: false }]
    const sinO = ['RESPUESTA A LA JEFATURA S1: tomada', 'RESPUESTA A LA JEFATURA S2: no tomada: no aplica']
    const conO = ['RESPUESTA A LA JEFATURA O1: tomada', sinO[0], 'RESPUESTA A LA JEFATURA O2: no tomada: no va', sinO[1]]
    expect(leerRespuestas(enviadas, conO)).toEqual(leerRespuestas(enviadas, sinO))
  })
  it('el lector de respuestas entiende las [O…] igual que las [S…]', () => {
    const r = leerRespuestas([{ id: 'O1', texto: 'x', dura: false }, { id: 'S2', texto: 'y', dura: false }], ['RESPUESTA A LA JEFATURA O1: tomada', 'RESPUESTA A LA JEFATURA S2: no tomada: no aplica'])
    expect(r.map((x) => x.id)).toEqual(['O1', 'S2'])
  })
})

describe('¿cabe la vuelta? la decide el paso, con el costo de rehacer (CC7 3 · CC6 10 y 11)', () => {
  it('con el tope justo por debajo del costo de rehacer: guarda el informe, sin vuelta (`sin_vuelta: tope`)', async () => {
    const e = estadoAntesDeLaSegundaMirada(PL, 0)
    const pl = { ...PL, limites: { ...PL.limites, tope_encargo_usd: 1 } } as Plantilla
    const { P } = revisorFalso()
    const d = datosDe(await correrSegundaMirada(P, encargo(e), pl, PASO, CONTEXTO))
    expect(d.vuelve_a_la_mesa).toBe(false)
    expect(d.sin_vuelta).toBe('tope')
    expect(d.aviso_a_la_mesa).toBeUndefined()
  })
  it('🔴 el borde exacto: gasto + lo de esta llamada + rehacer TODO (mesa, lo que sigue y las rondas de Emilio) · un centavo abajo no vuelve, justo sí (CC7 2 y 3)', async () => {
    const e = estadoAntesDeLaSegundaMirada(PL, 2)
    const justo = 2 + 0.07 + REHACER
    expect(REHACER).toBeGreaterThan(20) // incluye las 2 rondas del dueño: no es solo mesa + borrador
    const conTope = (t: number) => ({ ...PL, limites: { ...PL.limites, tope_encargo_usd: t } }) as Plantilla
    const abajo = datosDe(await correrSegundaMirada(revisorFalso().P, encargo(e), conTope(justo - 0.01), PASO, CONTEXTO))
    expect(abajo.vuelve_a_la_mesa).toBe(false)
    expect(abajo.sin_vuelta).toBe('tope')
    const arriba = datosDe(await correrSegundaMirada(revisorFalso().P, encargo(e), conTope(justo + 1e-6), PASO, CONTEXTO))
    expect(arriba.vuelve_a_la_mesa).toBe(true)
  })
  it('🔴 con los topes de la migración (45/48/48) la vuelta SÍ cabe, aun con todo lo de antes gastado a su tope; con los de hoy (43/45/45, con la corrección de CC1), NO', async () => {
    for (const pl of [POST_MESA_CON_SEGUNDA_MIRADA, CARRUSEL_MESA_CON_SEGUNDA_MIRADA, KIT_MESA_CON_SEGUNDA_MIRADA]) {
      const t = pl.tipo as keyof typeof TOPES_CON_SEGUNDA_MIRADA_USD
      const paso = pl.pasos.find((p) => p.clave === 'segunda_mirada')!
      const correr = async (tope: number) => datosDe(await correrSegundaMirada(revisorFalso().P, encargo(estadoAntesDeLaSegundaMirada(pl, gastadoAlDecidir(pl))), { ...pl, limites: { ...pl.limites, tope_encargo_usd: tope } } as Plantilla, paso, CONTEXTO))
      expect((await correr(TOPES_CON_SEGUNDA_MIRADA_USD[t])).vuelve_a_la_mesa, t).toBe(true)
      const hoy = await correr(TOPES_LEIDOS_ANTES_DE_LA_SEGUNDA_MIRADA_USD[t])
      expect(hoy.vuelve_a_la_mesa, t).toBe(false)
      expect(hoy.sin_vuelta, t).toBe('tope')
    }
  })
  it('con los topes viejos (post 15) la vuelta no cabe: el informe solo se guarda', async () => {
    const vivo = { ...PL, limites: { ...PL.limites, tope_encargo_usd: 15 } } as Plantilla
    const d = datosDe(await correrSegundaMirada(revisorFalso().P, encargo(estadoAntesDeLaSegundaMirada(PL)), vivo, PASO, CONTEXTO))
    expect(d.sin_vuelta).toBe('tope')
    expect(d.informe).toBeTruthy()
  })
  it('sin vuelta que quede (ya volvió una vez): sin_vuelta', () => {
    const e = { ...estadoAntesDeLaSegundaMirada(PL), vueltas: { segunda_mirada: 1 } }
    expect(cabeLaVueltaDeLaSegundaMirada(PL, PASO, e, 0)).toEqual({ cabe: false, motivo: 'sin_vuelta' })
  })
  it('sin margen de pasos para rehacer: tope_de_pasos', () => {
    const e = { ...estadoAntesDeLaSegundaMirada(PL), pasos_ejecutados: PL.pasos.length + PL.limites.margen - 2 }
    expect(cabeLaVueltaDeLaSegundaMirada(PL, PASO, e, 0)).toEqual({ cabe: false, motivo: 'tope_de_pasos' })
  })
})

describe('🔴 la vuelta tiene su propio contador (CC7 2)', () => {
  it('tras la vuelta de GPT, el dueño todavía puede devolver la pieza a la mesa', () => {
    let e = estadoInicial()
    const vistas: string[] = []
    let veces = 0
    for (let k = 0; k < 60; k++) {
      const s = siguientePaso(e, PL)
      if (s.accion !== 'ejecutar') break
      vistas.push(s.paso.clave)
      if (s.paso.clave === 'segunda_mirada') veces++
      const art: Record<string, unknown> =
        s.paso.clave === 'segunda_mirada' ? { vuelve_a_la_mesa: veces === 1 }
        : s.paso.clave === 'aprobar_propuestas' ? { vuelve_a_la_mesa: vistas.filter((c) => c === 'aprobar_propuestas').length === 1 } : {}
      e = registrarPaso(e, PL, s.indice, { costo_usd: 0, artefacto: art, ...(s.vuelta ? { vuelta: s.vuelta } : {}) })
    }
    expect(e.vueltas.segunda_mirada).toBe(1)
    expect(e.vueltas.aprobar_propuestas).toBe(1)
    const pasadasDeLaMesa = vistas.filter((c) => c === 'mesa').length
    expect(pasadasDeLaMesa).toBe(3)
    expect(veces).toBe(3)
  })
})

describe('en el render, la jefatura no vuelve a llamar a GPT', () => {
  it('el sobre de la revisión lleva `segunda_mirada_ya_dada` cuando el paso ya opinó', async () => {
    const { P } = revisorFalso()
    const e = estadoAntesDeLaSegundaMirada(PL)
    const i = PL.pasos.findIndex((p) => p.clave === 'segunda_mirada')
    const e2 = registrarPaso(e, PL, i, (await correrSegundaMirada(P, encargo(e), AMPLIO, PASO, CONTEXTO)).res)
    expect(segundaMiradaYaDada(e2)).toBe(true)
    expect(segundaMiradaYaDada(e)).toBe(false)
    const sobre = (est: Estado) => sobreDeLaRevision({ id: 'e', client_id: 'cli-1', familia: PL.familia, tope_usd: 30, dry_run: true, sala_ref: null } as never, PL, est, { pieza: 'x', imagenes: [], contexto: [] } as never) as unknown as { payload: Record<string, unknown> }
    expect(sobre(e2).payload.segunda_mirada_ya_dada).toBe(true)
    expect(sobre(e).payload).not.toHaveProperty('segunda_mirada_ya_dada')
  })
})

it('el artefacto del paso se llama como el paso', () => expect(ARTEFACTO_SEGUNDA_MIRADA).toBe('segunda_mirada'))
