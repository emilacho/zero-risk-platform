/**
 * EL VIGÍA DE LAS LECTURAS CON LLAVE (17-nov · GO de Lenovo «prevención llaves + Apify», Emilio «dale» 07:00 · condiciones de CC6).
 * Del 10 al 17-nov la llave de Apify estuvo rota y nadie se enteró: las lecturas daban 401, los flujos lo tragaban y el gasto salía «US$ 0.00».
 * Regla: una lectura que no da 200 es una FALLA, nunca un cero. El vigilante de costos de n8n manda aquí lo que leyó con SU llave (código de respuesta y, si leyó, el uso del mes)
 * y esto decide, sin ruido (regla de Slack del 21-oct), qué decir en `#alertas`:
 *  · un incidente por proveedor (clave `lectura:<proveedor>`), con su CLASE: `llave` (401) · `tope` (402/403) · `caida` (5xx, tiempo agotado, sin respuesta, otro código).
 *    401/402/403 abren a la PRIMERA (son deterministas); `caida` pide 2 lecturas seguidas (un parpadeo no alarma). Un cambio de clase va en el hilo; repetir la misma clase no escribe nada;
 *    un 200 lo cierra en su hilo («volvió»).
 *  · el tope del mes: UNA alarma por umbral (75 % · 90 %) y ciclo (clave `tope-del-mes:<proveedor>:<umbral>:<fin del ciclo>`); si ya se pasaron los dos, solo la del mayor.
 *    Su texto es FIJO dentro del ciclo (sin el uso del momento): cada hora se repite igual y la puerta de incidentes solo lo cuenta, sin publicar.
 * PURO: la ruta `POST /api/vigia/lecturas` ejecuta lo que esto decide con su propia puerta de incidentes (`incidentes.ts`, tabla `proveedor_incidentes`: un incidente = una fila, con su hilo).
 */
export type Clase = 'llave' | 'tope' | 'caida'
export const UMBRALES_DEL_TOPE = [75, 90] as const
export const CAIDAS_SEGUIDAS_PARA_AVISAR = 2

export interface UsoDelMes { usado_usd: number; tope_usd: number; ciclo_hasta: string | null }
export interface Lectura {
  proveedor: string
  /** código HTTP de la lectura; null = no hubo respuesta (tiempo agotado, red) */
  estado: number | null
  /** `error.type` del proveedor, si lo dio (p. ej. `user-or-token-not-found`) */
  tipo_error?: string | null
  /** cuántas lecturas seguidas (contando esta) no respondieron: lo lleva el flujo */
  caidas_seguidas?: number
  uso?: UsoDelMes | null
}

export type Accion =
  | { tipo: 'avisar'; clave: string; texto: string }
  | { tipo: 'resolver'; clave: string; nota: string }
  | { tipo: 'esperar'; clave: string; motivo: string }

const NOMBRES: Record<string, string> = { apify: 'Apify', openai: 'OpenAI', anthropic: 'Anthropic', supabase: 'La base (Supabase)' }
export const nombreDe = (p: string): string => NOMBRES[p] ?? p
export const claveDeLectura = (p: string): string => `lectura:${p}`

/** 2xx = leyó · 401 = llave · 402/403 = tope · todo lo demás (sin respuesta incluido) = caída */
export function claseDe(estado: number | null): Clase | 'ok' {
  if (typeof estado === 'number' && estado >= 200 && estado < 300) return 'ok'
  if (estado === 401) return 'llave'
  if (estado === 402 || estado === 403) return 'tope'
  return 'caida'
}

/** el texto de un incidente NO lleva cifras que cambien cada hora: el mismo texto repetido no se vuelve a publicar */
export function textoDeIncidente(l: Lectura, clase: Clase): string {
  const n = nombreDe(l.proveedor)
  const tipo = l.tipo_error ? ` · ${String(l.tipo_error).slice(0, 60)}` : ''
  if (clase === 'llave') return `🔴 ${n} · la llave no sirve: respondió 401${tipo}. Todo lo que se lee o se pide a ${n} falla, y su gasto queda «sin datos» (no es cero) hasta cambiar la llave.`
  if (clase === 'tope') return `🟠 ${n} · la cuenta frena por tope o permiso: respondió ${l.estado}${tipo}. Lo que se pide a ${n} no corre hasta subir el tope o empezar el ciclo nuevo.`
  return `🟠 ${n} · no responde (${familiaDe(l.estado)}) en ${CAIDAS_SEGUIDAS_PARA_AVISAR} lecturas seguidas. Su gasto queda «sin datos» (no es cero) mientras siga así.`
}
/** la familia del código, no el código: 502 y 504 son la misma caída (si no, cada código distinto iría al hilo) */
export const familiaDe = (estado: number | null): string => (estado === null ? 'sin respuesta' : `${Math.floor(estado / 100)}xx`)

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/** el umbral MAYOR que ya se pasó, o null */
export function umbralCruzado(uso: UsoDelMes): number | null {
  if (!finito(uso.usado_usd) || !finito(uso.tope_usd) || uso.tope_usd <= 0) return null
  const pct = (uso.usado_usd / uso.tope_usd) * 100
  const pasados = UMBRALES_DEL_TOPE.filter((u) => pct >= u)
  return pasados.length ? pasados[pasados.length - 1] : null
}

/** FIJO dentro del ciclo: sin el uso del momento (si cambiara cada hora, cada hora sería un mensaje en el hilo) */
export function textoDelTope(proveedor: string, uso: UsoDelMes, umbral: number): string {
  const n = nombreDe(proveedor)
  const corte = uso.ciclo_hasta ? ` El ciclo corta el ${uso.ciclo_hasta.slice(0, 10)}.` : ''
  return `🟠 ${n} · el gasto del mes ya pasó el ${umbral} % del tope de US$ ${uso.tope_usd.toFixed(2)}.${corte} Al llegar al 100 % ${n} frena lo que se le pide hasta el ciclo nuevo.`
}

/** qué hacer con lo que leyó el vigilante. Una lectura por proveedor (si viene repetido, manda la primera) */
export function decidir(lecturas: Lectura[]): Accion[] {
  const acciones: Accion[] = []
  const vistos = new Set<string>()
  for (const l of lecturas) {
    if (vistos.has(l.proveedor)) continue
    vistos.add(l.proveedor)
    const clave = claveDeLectura(l.proveedor)
    const clase = claseDe(l.estado)
    if (clase === 'ok') {
      acciones.push({ tipo: 'resolver', clave, nota: `volvió: ${nombreDe(l.proveedor)} responde bien` })
      const umbral = l.uso ? umbralCruzado(l.uso) : null
      if (l.uso && umbral !== null) acciones.push({ tipo: 'avisar', clave: `tope-del-mes:${l.proveedor}:${umbral}:${(l.uso.ciclo_hasta ?? 'sin-ciclo').slice(0, 10)}`, texto: textoDelTope(l.proveedor, l.uso, umbral) })
      continue
    }
    if (clase === 'caida' && (l.caidas_seguidas ?? 1) < CAIDAS_SEGUIDAS_PARA_AVISAR) { acciones.push({ tipo: 'esperar', clave, motivo: 'primera lectura sin respuesta: se avisa si la siguiente tampoco responde' }); continue }
    acciones.push({ tipo: 'avisar', clave, texto: textoDeIncidente(l, clase) })
  }
  return acciones
}

const PROVEEDOR = /^[a-z0-9-]{2,30}$/
/** valida el cuerpo que manda el flujo; devuelve las lecturas o el porqué */
export function leerCuerpo(b: unknown): { ok: true; dry_run: boolean; lecturas: Lectura[] } | { ok: false; detalle: string } {
  const o = (b && typeof b === 'object' && !Array.isArray(b) ? b : {}) as Record<string, unknown>
  if (typeof o.dry_run !== 'boolean') return { ok: false, detalle: '`dry_run` es obligatorio y debe ser true o false' }
  if (!Array.isArray(o.lecturas) || o.lecturas.length === 0 || o.lecturas.length > 10) return { ok: false, detalle: '`lecturas` debe ser una lista de 1 a 10' }
  const lecturas: Lectura[] = []
  for (const x of o.lecturas as unknown[]) {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    if (typeof r.proveedor !== 'string' || !PROVEEDOR.test(r.proveedor)) return { ok: false, detalle: 'cada lectura necesita `proveedor` (minúsculas, 2-30)' }
    const e = r.estado
    if (!(e === null || (typeof e === 'number' && Number.isInteger(e) && e >= 100 && e <= 599))) return { ok: false, detalle: '`estado` debe ser un código HTTP o null' }
    const u = (r.uso && typeof r.uso === 'object' ? r.uso : null) as Record<string, unknown> | null
    const uso = u && finito(u.usado_usd) && finito(u.tope_usd) ? { usado_usd: u.usado_usd, tope_usd: u.tope_usd, ciclo_hasta: typeof u.ciclo_hasta === 'string' ? u.ciclo_hasta : null } : null
    // una lectura que no leyó TIENE que decir cuántas van seguidas: si el flujo lo olvida, falla aquí (y no queda una caída que nunca alarma)
    const cs = r.caidas_seguidas
    const csValido = typeof cs === 'number' && Number.isInteger(cs) && cs >= 1
    if (claseDe(e as number | null) !== 'ok' && !csValido) return { ok: false, detalle: 'una lectura que no dio 2xx necesita `caidas_seguidas` (entero ≥ 1)' }
    lecturas.push({ proveedor: r.proveedor, estado: e as number | null, tipo_error: typeof r.tipo_error === 'string' ? r.tipo_error : null, caidas_seguidas: csValido ? cs : undefined, uso })
  }
  return { ok: true, dry_run: o.dry_run, lecturas }
}

export interface Ejecutores {
  avisar: (texto: string, clave: string) => Promise<{ ok: boolean; accion: string; detalle: string }>
  resolver: (clave: string, nota: string) => Promise<{ ok: boolean; accion: string; detalle: string }>
}
export interface Resultado { clave: string; tipo: Accion['tipo']; accion: string; ok: boolean; detalle: string }

/** ejecuta las acciones en orden; un error en una no corta las demás */
export async function ejecutar(acciones: Accion[], x: Ejecutores): Promise<Resultado[]> {
  const out: Resultado[] = []
  for (const a of acciones) {
    try {
      if (a.tipo === 'esperar') out.push({ clave: a.clave, tipo: a.tipo, accion: 'esperar', ok: true, detalle: a.motivo })
      else if (a.tipo === 'resolver') out.push({ clave: a.clave, tipo: a.tipo, ...(await x.resolver(a.clave, a.nota)) })
      else out.push({ clave: a.clave, tipo: a.tipo, ...(await x.avisar(a.texto, a.clave)) })
    } catch (e) { out.push({ clave: a.clave, tipo: a.tipo, accion: 'fallo', ok: false, detalle: e instanceof Error ? e.message : String(e) }) }
  }
  return out
}
