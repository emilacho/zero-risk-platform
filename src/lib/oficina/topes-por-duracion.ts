/**
 * 17-nov · Sprint 3 · T7a · EL TOPE POR SEGUNDO TERMINADO (CC2 · 🟢 de CC6 con 4 condiciones: `REVISION-CC6-a-CC2-LENOVO-t7-tope-por-segundo`).
 *
 * Un tope que depende del largo de la pieza se escribe como DATO en dos partes: la fija (`tope_usd`, `limites.tope_encargo_usd`) y la que crece con la pieza
 * (`tope_usd_por_segundo` × `limites.video.segundos_max`, `tope_usd_por_plano` × `limites.video.planos_max`, `limites.tope_encargo_usd_por_segundo` × `segundos_max`).
 * Se calcula con el MÁXIMO que la mesa puede elegir, al cargar la plantilla (antes de abrir el encargo): un video corto reserva de más, pero ninguno se corta a medias.
 * El motor NO cambia: sigue viendo números. Lo aplica quien CARGA la plantilla (`almacen-supabase.leerPlantilla`) y, por si el almacén es otro, `abrirEncargo` y `plantillaDe`.
 * Es IDEMPOTENTE: la salida ya no trae las partes por segundo/plano, así que aplicarla dos veces da lo mismo.
 *
 * Condición 1 de CC6 · el INVARIANTE va en el código (`coberturaDelTope`): el tope del encargo cubre una pasada por todos los pasos que gastan, cada uno a su tope,
 * más un turno de la mesa si la plantilla la tiene. Si no, el encargo NO abre (409 claro en `abrirEncargo`), nada de abrir para cortarse después.
 */
import { COTAS, FAMILIAS_MESA } from './mesa/tipos'
import { propuestasDeLaPlantilla } from './mesa/propuestas-imagen'
import { evaluar } from './motor'
import type { Estado, Paso, Plantilla } from './tipos'

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const r4 = (n: number) => Math.round(n * 10000) / 10000
const objeto = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})

/** los campos que crecen con la pieza: se leen de la plantilla de la base (dato) y desaparecen al aplicar */
export const POR_SEGUNDO_DEL_PASO = 'tope_usd_por_segundo'
export const POR_PLANO_DEL_PASO = 'tope_usd_por_plano'
export const POR_SEGUNDO_DEL_ENCARGO = 'tope_encargo_usd_por_segundo'

/**
 * 17-nov · T7b · una cifra por segundo puede depender de la RESOLUCIÓN del video final (Lenovo: 720p 1,0/s · 1080p 2,0/s): `{ "720p": 1, "1080p": 2 }`.
 * Se toma la de `limites.video.resolucion` de la plantilla (la que se filma de verdad). Un número suelto vale para todas. Sin la de esa resolución → dato inválido.
 */
const porSegundoDe = (x: unknown, resolucion: unknown): number | null => {
  if (num(x) !== null) return x as number
  const m = objeto(x)
  return typeof resolucion === 'string' ? num(m[resolucion]) : null
}
const cifraValida = (x: unknown, resolucion: unknown): boolean => {
  if (num(x) !== null) return (x as number) >= 0
  const m = objeto(x)
  if (!Object.keys(m).length || !Object.values(m).every((v) => num(v) !== null && (v as number) >= 0)) return false
  return porSegundoDe(x, resolucion) !== null
}

const tieneUnidades = (p: Plantilla): boolean =>
  (p.limites as Record<string, unknown>)[POR_SEGUNDO_DEL_ENCARGO] !== undefined || p.pasos.some((s) => (s as unknown as Record<string, unknown>)[POR_SEGUNDO_DEL_PASO] !== undefined || (s as unknown as Record<string, unknown>)[POR_PLANO_DEL_PASO] !== undefined)

/** lo que tiene que cumplir el dato por segundo/plano · puro (lo usa `validarPlantilla` y el cargador) */
export function erroresDeLosTopesPorDuracion(p: Plantilla): string[] {
  if (!p || !Array.isArray(p.pasos) || !p.limites) return []
  const e: string[] = []
  const v = objeto((p.limites as Record<string, unknown>).video)
  const seg = num(v.segundos_max), planos = num(v.planos_max)
  const lim = p.limites as Record<string, unknown>
  const pideSegundos = (campo: string, x: unknown) => {
    if (x === undefined) return false
    if (!cifraValida(x, v.resolucion)) e.push(`${campo} debe ser un número ≥ 0 o una cifra por resolución que incluya la del video (\`limites.video.resolucion\` = ${String(v.resolucion)})`)
    return true
  }
  let usaSegundos = pideSegundos(`\`limites.${POR_SEGUNDO_DEL_ENCARGO}\``, lim[POR_SEGUNDO_DEL_ENCARGO])
  let usaPlanos = false
  for (const s of p.pasos) {
    const x = s as unknown as Record<string, unknown>
    if (pideSegundos(`paso «${s.clave}»: \`${POR_SEGUNDO_DEL_PASO}\``, x[POR_SEGUNDO_DEL_PASO])) usaSegundos = true
    if (x[POR_PLANO_DEL_PASO] !== undefined) {
      usaPlanos = true
      if (!(num(x[POR_PLANO_DEL_PASO]) !== null && (x[POR_PLANO_DEL_PASO] as number) >= 0)) e.push(`paso «${s.clave}»: \`${POR_PLANO_DEL_PASO}\` debe ser un número ≥ 0`)
    }
  }
  if (usaSegundos && !(seg !== null && seg > 0)) e.push('un tope por segundo pide `limites.video.segundos_max` (> 0): sin el largo máximo no hay tope')
  if (usaPlanos && !(planos !== null && planos > 0 && Number.isInteger(planos))) e.push('un tope por plano pide `limites.video.planos_max` (entero > 0): sin el máximo de planos no hay tope')
  return e
}

/**
 * La plantilla con cada tope YA calculado para la pieza más larga que se puede pedir · pura, idempotente.
 * Sin partes por segundo/plano devuelve la MISMA plantilla (las demás familias no cambian). Con un dato inválido no calcula nada y devuelve los errores.
 * El paso de función `video` con parte por segundo/plano fija además `limites.video.tope_por_video_usd` (el que usa la cotización), para que no haya dos cifras.
 * 19-nov · G5b (A′ · GO Lenovo 03:41Z) · con `segundos` (la duración de ESTA pieza, la que declaró su brief) los topes se calculan para ella y no para la más larga;
 * nunca más que `limites.video.segundos_max`. Sin `segundos`, como siempre: la más larga.
 */
export function aplicarTopesPorDuracion(p: Plantilla, segundos?: number): { plantilla: Plantilla; errores: string[] } {
  if (!p || !Array.isArray(p.pasos) || !p.limites || !tieneUnidades(p)) return { plantilla: p, errores: [] }
  const errores = erroresDeLosTopesPorDuracion(p)
  if (errores.length) return { plantilla: p, errores }
  const lim = p.limites as Record<string, unknown>
  const v = objeto(lim.video)
  const maxDeLaPlantilla = num(v.segundos_max) ?? 0
  const seg = typeof segundos === 'number' && Number.isFinite(segundos) && segundos > 0 ? Math.min(segundos, maxDeLaPlantilla) : maxDeLaPlantilla
  const planos = num(v.planos_max) ?? 0
  let topeDelVideo: number | null = null
  const pasos: Paso[] = p.pasos.map((s) => {
    const x = s as unknown as Record<string, unknown>
    if (x[POR_SEGUNDO_DEL_PASO] === undefined && x[POR_PLANO_DEL_PASO] === undefined) return s
    const { [POR_SEGUNDO_DEL_PASO]: ps, [POR_PLANO_DEL_PASO]: pp, ...resto } = x
    const tope = r4((num(s.tope_usd) ?? 0) + (porSegundoDe(ps, v.resolucion) ?? 0) * seg + (num(pp) ?? 0) * planos)
    if (s.funcion === 'video') topeDelVideo = tope
    return { ...(resto as unknown as Paso), tope_usd: tope }
  })
  const { [POR_SEGUNDO_DEL_ENCARGO]: pe, ...limResto } = lim
  const limites = {
    ...limResto,
    tope_encargo_usd: r4((num(p.limites.tope_encargo_usd) ?? 0) + (porSegundoDe(pe, v.resolucion) ?? 0) * seg),
    ...(topeDelVideo !== null ? { video: { ...v, tope_por_video_usd: topeDelVideo } } : {}),
  } as Plantilla['limites']
  return { plantilla: { ...p, pasos, limites }, errores: [] }
}

/** lo que se reserva para VOLVER desde `paso` a su destino: los topes de los pasos que se repiten (destino → paso, inclusive) y, si el destino es la mesa,
 *  un turno de la mesa · pura · sin destino válido, infinito (nunca cabe). 17-nov · T7b: vive aquí para que la guarda de las vueltas (`orquestador-video`)
 *  y lo requerido al abrir (`coberturaDelTope`) usen LA MISMA cuenta. */
/** 17-nov · GO Lenovo (encendido de imagen: «nunca cortar a medias; mejor un tope que cubra el trabajo») · la COTA DE LA MESA por pasada (dato `limites.cota_de_la_mesa_usd`,
 *  un número > 0): lo que sus turnos pueden gastar en una pasada, integración incluida; la mesa la hace cumplir (`cotaAgotada`). null sin el dato · pura */
export function cotaDeLaMesa(pl: Pick<Plantilla, 'limites'>): number | null {
  const v = (pl?.limites as Record<string, unknown> | undefined)?.cota_de_la_mesa_usd
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}
/** lo que se reserva por cada pasada de la mesa: su cota si la plantilla la trae; si no, un turno (como siempre) */
export const reservaPorPasadaDeLaMesa = (pl: Pick<Plantilla, 'limites'>): number => cotaDeLaMesa(pl) ?? COTAS.RESERVA_POR_TURNO_USD

export function costoDeVolver(pl: Plantilla, paso: Paso): number {
  const de = pl.pasos.findIndex((x) => x.clave === paso.vuelve_a?.paso)
  const a = pl.pasos.findIndex((x) => x.clave === paso.clave)
  if (de < 0 || a < de) return Number.POSITIVE_INFINITY
  const topes = pl.pasos.slice(de, a + 1).reduce((s, x) => s + (Number(x.tope_usd) || 0), 0)
  return +(topes + (pl.pasos[de].funcion === 'mesa' ? reservaPorPasadaDeLaMesa(pl) : 0)).toFixed(6)
}

/**
 * 17-nov · T7b · las vueltas que el código SALTA si no caben en el tope (las guarda `cabeLaVuelta` en `orquestador-video`): el pedido que vuelve por fotos,
 * la revisión de las imágenes clave y la mirada del video. Esas nunca cortan un encargo, así que no se reservan al abrir. TODA otra vuelta (hoy: la ronda del
 * dueño, `aprobar_propuestas`, que el dueño pide y el código no puede saltar) SÍ se reserva, a su máximo. Una vuelta nueva cuenta por omisión (lado seguro).
 */
// 18-nov · GO Lenovo 13:52Z · la vuelta de la JEFATURA a la mesa también se salta si no cabe (`puedeVolverALaMesa` → `cabeLaVuelta` antes de devolver, con cada paso a su tope):
//   nunca corta a medias. Con la vuelta por regla dura (hasta 6, 202611181530) reservarla al abrir dejaría sin abrir a casi todas las piezas; sin caber, la regla dura queda «en corrección»
// 20-nov · PLAN v4 (CC4) · la vuelta de la SEGUNDA MIRADA (GPT en la propuesta) también se salta si no cabe (`cabeLaVueltaDeLaSegundaMirada`): no se reserva al abrir
// 20-nov · punto 3 · la vuelta de la corrección de la imagen (`mirar_correccion` → `corregir_imagen`) también: la decide la mirada solo si cabe entera (`cabeOtraVuelta`)
export const VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN = { funciones: ['pedido_de_video', 'segunda_mirada'], claves: ['revisar_imagenes_clave', 'mirar_video', 'jefatura', 'mirar_correccion'] } as const
const seSalta = (s: Paso) => (VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN.funciones as readonly string[]).includes(String(s.funcion ?? '')) || (VUELTAS_QUE_SE_SALTAN_SI_NO_CABEN.claves as readonly string[]).includes(s.clave)

/**
 * Condición 1 de CC6 · ¿el tope de este encargo cubre el PEOR caso de la plantilla? · pura (sobre la plantilla YA aplicada).
 * Lo requerido = una pasada (la suma de los topes de TODOS los pasos que gastan, cada uno una vez, + un turno de la mesa si la hay) MÁS cada vuelta que no se
 * salta, a su máximo (`vuelve_a.max` × `costoDeVolver`, con cada paso a su tope). 17-nov · T7b (condición fuerte de CC6 + regla de Emilio 08:06 «nunca corta a
 * medias»): las 2 rondas del dueño entran aquí. Sale de los pasos de la plantilla, no de una lista a mano.
 */
export function coberturaDelTope(p: Plantilla, tope: number): { requerido: number; cubre: boolean; detalle: string } {
  const pasos = Array.isArray(p?.pasos) ? p.pasos : []
  const gastan = pasos.filter((s) => (num(s.tope_usd) ?? 0) > 0)
  const mesa = pasos.some((s) => s.funcion === 'mesa') ? reservaPorPasadaDeLaMesa(p) : 0
  const pasada = gastan.reduce((a, s) => a + (num(s.tope_usd) ?? 0), 0) + mesa
  const vueltas = pasos
    .filter((s) => (num(s.vuelve_a?.max) ?? 0) > 0 && !seSalta(s))
    .map((s) => ({ clave: s.clave, max: num(s.vuelve_a?.max) as number, costo: costoDeVolver(p, s) }))
  const porPasos = r4(pasada + vueltas.reduce((a, x) => a + x.max * x.costo, 0))
  // 17-nov · T7b · condición de CC6 (CERTIFICACIÓN 1118, una sola cuenta): en el video la mesa guarda lo que sigue con `loQueSigueDeLaMesa` (+ la jefatura) antes de su
  //   primer turno; lo requerido nunca es menos que eso, o el encargo abriría y la mesa cerraría sin pieza
  const iMesa = pasos.findIndex((s) => s.funcion === 'mesa')
  // 17-nov · propuestas en imagen · tramo 2b (punto 4 de CC6): la mesa de imagen CON propuestas guarda lo que sigue con la misma cuenta (borradores + rondas + final)
  const deLaMesa = iMesa >= 0 && guardaLoQueSigue(p)
    ? r4(pasos.slice(0, iMesa).reduce((a, s) => a + Math.max(0, num(s.tope_usd) ?? 0), 0) + reservaPorPasadaDeLaMesa(p) + loQueSigueDeLaMesa(p, { vueltas: {} }))
    : 0
  const requerido = Math.max(porPasos, deLaMesa)
  const cubre = num(tope) !== null && tope + 1e-9 >= requerido
  const partes = gastan.map((s) => `${s.clave} ${s.tope_usd}`).concat(mesa ? [cotaDeLaMesa(p) !== null ? `la cota de la mesa ${mesa}` : `un turno de la mesa ${mesa}`] : [])
  const deVueltas = vueltas.map((x) => `${x.max} × la vuelta de «${x.clave}» (${r4(x.costo)})`)
  return { requerido, cubre, detalle: `el tope del encargo (US$ ${tope}) ${cubre ? 'cubre' : 'NO cubre'} el peor caso con cada paso a su tope (US$ ${requerido}: una pasada ${partes.join(' + ') || 'sin gasto'}${deVueltas.length ? ` + ${deVueltas.join(' + ')}` : ''} = ${porPasos}${deLaMesa > porPasos ? `; pero la mesa ${(FAMILIAS_MESA as Record<string, string>)[String(p.familia)] === 'video' ? 'del video' : 'con propuestas'} guarda ${deLaMesa} antes de su primer turno (${cotaDeLaMesa(p) !== null ? 'su cota' : 'su turno'} + lo que sigue + la jefatura), y manda eso` : ''})` }
}

/** 17-nov · ¿la mesa de esta plantilla guarda lo que sigue con `loQueSigueDeLaMesa`? La del video siempre; la de imagen solo CON propuestas (dato `limites.propuestas` > 1:
 *  N borradores y rondas del dueño); sin propuestas, la cifra fija de su tipo como hoy · pura */
export const guardaLoQueSigue = (p: Plantilla): boolean => (FAMILIAS_MESA as Record<string, string>)[String(p.familia)] === 'video' || propuestasDeLaPlantilla(p) > 1

/**
 * 17-nov · T7b · lo que la MESA tiene que dejar para lo que viene DESPUÉS de ella, con la misma cuenta que `coberturaDelTope`: los pasos que gastan después
 * de la mesa (cada uno una vez, a su tope) + la revisión de cada paso de la jefatura (su tope en la plantilla es 0 y gasta de lo que queda: se le guarda
 * `COTAS.RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD`, 1,5 + margen, como en la cifra fija vieja) + las vueltas que no se saltan y aún quedan (`vuelve_a.max` − las ya hechas) × `costoDeVolver`. Con esto la mesa del
 * video se frena a tiempo (`cotaAgotada`) y nunca se come lo que necesita el borrador, el video o una ronda del dueño. Antes era una cifra fija (6,5, del 31-oct). Pura.
 * 17-nov · CC6 (RESPUESTA aplicar-1118): la vuelta EN CURSO cuenta como hecha. El motor la suma recién al registrar el primer paso de la vuelta (la mesa), así
 *   que mientras la mesa trabaja la ronda del dueño `e.vueltas` aún no la tiene; si el último paso hecho vuelve a ESTA mesa y su condición se cumple (lo mismo
 *   que decide `siguientePaso`), esa ronda ya está ocurriendo y no se reserva otra vez.
 */
/** 17-nov · GO Lenovo · cuántas pasadas de la mesa van, la de ahora incluida: 1 + las vueltas a la mesa ya contadas + la que está en curso (el motor la cuenta recién al
 *  registrar su primer paso, como en `loQueSigueDeLaMesa`) · pura */
export function pasadasDeLaMesa(p: Plantilla, e: { vueltas?: Record<string, number> } & Partial<Estado>): number {
  const pasos = Array.isArray(p?.pasos) ? p.pasos : []
  const i = pasos.findIndex((s) => s.funcion === 'mesa')
  if (i < 0) return 1
  const clave = pasos[i].clave
  const hechas = pasos.filter((s) => s.vuelve_a?.paso === clave).reduce((a, s) => a + Math.max(0, e.vueltas?.[s.clave] ?? 0), 0)
  const ult = typeof e.ultimo === 'number' && e.ultimo >= 0 ? pasos[e.ultimo] : undefined
  const v = ult?.vuelve_a
  const enCurso = ult && v && v.paso === clave && (e.vueltas?.[ult.clave] ?? 0) < v.max && evaluar(v.si, e as Estado) ? 1 : 0
  return 1 + hechas + enCurso
}

export function loQueSigueDeLaMesa(p: Plantilla, e: { vueltas?: Record<string, number> } & Partial<Estado>): number {
  const pasos = Array.isArray(p?.pasos) ? p.pasos : []
  const i = pasos.findIndex((s) => s.funcion === 'mesa')
  if (i < 0) return 0
  const despues = pasos.slice(i + 1)
  const ult = typeof e.ultimo === 'number' && e.ultimo >= 0 ? pasos[e.ultimo] : undefined
  const v = ult?.vuelve_a
  const enCurso = ult && v && v.paso === pasos[i].clave && (e.vueltas?.[ult.clave] ?? 0) < v.max && evaluar(v.si, e as Estado) ? ult.clave : null
  const pasada = despues.reduce((a, s) => a + Math.max(0, num(s.tope_usd) ?? 0) + (s.tipo === 'jefatura' ? COTAS.RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD : 0), 0)
  const vueltas = despues
    .filter((s) => (num(s.vuelve_a?.max) ?? 0) > 0 && !seSalta(s))
    .reduce((a, s) => a + Math.max(0, (num(s.vuelve_a?.max) as number) - (e.vueltas?.[s.clave] ?? 0) - (s.clave === enCurso ? 1 : 0)) * costoDeVolver(p, s), 0)
  return r4(pasada + vueltas)
}

/**
 * 20-nov · CC6 🔴 #1254 · lo que sigue DESPUÉS de un paso, con la misma cuenta que `loQueSigueDeLaMesa`: cada paso a su tope (más la reserva de la jefatura) y las vueltas
 * que no se saltan y aún quedan, a su `costoDeVolver`. Lo usa la corrección de la imagen antes de decidir otra vuelta o turno: si no guarda esto, en el video puede
 * comerse lo del paso `video` y el motor corta la pieza a medias por `tope_de_gasto` (Emilio 17-nov 08:06: «nunca corta a medias»). Sin el paso, 0 · pura
 */
export function loQueSigueDespuesDelPaso(p: Plantilla, clave: string, e: { vueltas?: Record<string, number> } & Partial<Estado>): number {
  const pasos = Array.isArray(p?.pasos) ? p.pasos : []
  const i = pasos.findIndex((s) => s.clave === clave)
  if (i < 0) return 0
  const despues = pasos.slice(i + 1)
  const pasada = despues.reduce((a, s) => a + Math.max(0, num(s.tope_usd) ?? 0) + (s.tipo === 'jefatura' ? COTAS.RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD : 0), 0)
  const vueltas = despues
    .filter((s) => (num(s.vuelve_a?.max) ?? 0) > 0 && !seSalta(s))
    .reduce((a, s) => a + Math.max(0, (num(s.vuelve_a?.max) as number) - (e.vueltas?.[s.clave] ?? 0)) * costoDeVolver(p, s), 0)
  return r4(pasada + vueltas)
}

/** el tope del encargo de una FILA de la base (`tope_encargo_usd`, `limites`, `pasos`) con la misma cuenta: para el freno de la campaña (condición 2) · puro.
 *  Sin partes por segundo, la columna (como siempre). Con dato inválido, `null` (quien lo lee se queda del lado seguro). */
export function topeDelEncargoDeLaFila(f: { tope_encargo_usd: unknown; limites?: unknown; pasos?: unknown }): number | null {
  const col = num(typeof f.tope_encargo_usd === 'string' ? Number(f.tope_encargo_usd) : f.tope_encargo_usd)
  const limites = objeto(f.limites)
  if (!Array.isArray(f.pasos) || !Object.keys(limites).length) return col
  const pl = { tipo: '', familia: '', pasos: f.pasos as Paso[], limites: limites as Plantilla['limites'], indicaciones: {} } as Plantilla
  if (!tieneUnidades(pl)) return col
  const a = aplicarTopesPorDuracion(pl)
  return a.errores.length ? null : a.plantilla.limites.tope_encargo_usd
}
