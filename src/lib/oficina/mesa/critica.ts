/**
 * Sprint 4 · fase 1 · E · EL ROL DE CRÍTICA EN LAS MESAS (GO Lenovo · firma de Emilio 17:01 Zúrich · diseño `DISENO-CC2-…-sprint4-E-rol-de-critica`).
 *
 * Como en una agencia: después de que el equipo aportó y ANTES de que la dirección integre, un especialista (estratega) lee los hechos y el plan y responde a lo
 * que propusieron los demás: qué choca con un hecho o con el plan y qué falta probar. La dirección, al integrar, dice qué tomó, qué cambió y por qué.
 *
 *  · NO es un freno ni una validación: el código no comprueba la respuesta de la dirección ni le devuelve nada por la crítica. Es una voz más en la mesa.
 *  · Si la crítica falla, no cabe (cotas) o se terminaron las rondas, la mesa sigue igual y la dirección lo declara.
 *  · Quién critica es DATO (la tarjeta con `<tipo>:critica`); sin ella, la mesa trabaja exactamente como antes.
 *  · Agnóstico: nada aquí nombra un rubro, un local ni un producto; la unidad es «la oferta».
 * Puro: sin base, sin red, sin modelo.
 */
import { criticoDe, direccionDe } from './directorio'
import { COTAS, type Aporte, type EstadoMesa } from './tipos'

/**
 * cómo empieza la línea que la dirección escribe DENTRO de «## Citas» al integrar. Va en las citas a propósito: todas las convenciones (láminas, kit, foto, guion,
 * concepto, propuestas) ya cierran con «## Citas» y todos los traductores la apartan de lo que se dibuja o se filma; así la respuesta queda en la entrega sin volverse una lámina.
 */
export const PREFIJO_DE_LA_CRITICA = 'Crítica:'

/** el rótulo con que la crítica entra al tablero (primera línea del aporte): la ven todos los turnos y la jefatura; y el banco de ideas de la mesa de concepto la salta */
export const MARCA_DE_LA_CRITICA = '[crítica · confronta lo propuesto con los hechos y el plan]'
export const conMarcaDeLaCritica = (texto: string): string => (esCritica(texto) ? texto : `${MARCA_DE_LA_CRITICA}\n${texto}`)
export const esCritica = (texto: string): boolean => String(texto ?? '').trimStart().startsWith(MARCA_DE_LA_CRITICA)

const fallosDe =(libro: Aporte[], agente: string): number => libro.filter((a) => a.tipo === 'nota' && a.de === agente && a.texto.startsWith('turno_fallido')).length
const ultimaIntegracion = (libro: Aporte[]): Aporte | null => [...libro].reverse().find((a) => a.tipo === 'integra') ?? null

/** el crítico de esta mesa (nunca la dirección: `criticoDe` solo acepta tarjetas de miembro, y quien dirige es una tarjeta de dirección) */
export const criticoDeLaMesa = (est: EstadoMesa): string | null => criticoDe(est.directorio_congelado, est.tipo)?.agente ?? null

/** la crítica de ESTA ronda (después de la última integración), si ya se escribió */
export function criticaDeLaRonda(est: EstadoMesa, libro: Aporte[]): Aporte | null {
  const critico = criticoDeLaMesa(est)
  if (!critico) return null
  const desde = ultimaIntegracion(libro)?.n ?? 0
  return [...libro].reverse().find((a) => a.n > desde && a.de === critico && (a.tipo === 'aporta' || a.tipo === 'responde') && a.texto.trim()) ?? null
}

/**
 * ¿le toca a la crítica? Solo si hay crítico, el equipo aportó algo nuevo desde la última integración (lo que se critica), la crítica de esta ronda no está escrita
 * y no agotó sus reintentos. `rondasHechas`: la mesa corta ya no abre rondas de aportes (tampoco de crítica). Devuelve el nombre del crítico o null.
 */
export function criticaPendiente(est: EstadoMesa, libro: Aporte[], rondasHechas: boolean): string | null {
  const critico = criticoDeLaMesa(est)
  if (!critico || rondasHechas) return null
  if (fallosDe(libro, critico) >= COTAS.REINTENTOS_DE_TURNO) return null
  if (criticaDeLaRonda(est, libro)) return null
  const desde = ultimaIntegracion(libro)?.n ?? 0
  const dir = direccionDe(est.directorio_congelado, est.tipo)?.agente
  const hayQueCriticar = libro.some((a) => a.n > desde && (a.tipo === 'aporta' || a.tipo === 'responde') && a.de !== critico && a.de !== dir && a.texto.trim())
  return hayQueCriticar ? critico : null
}

/** lo que la dirección sabe de la crítica al integrar: la crítica de la ronda (A<n>), o por qué no llegó. Sin crítico en la mesa: null (la tarea no cambia) */
export function estadoDeLaCritica(est: EstadoMesa, libro: Aporte[]): { critico: string; aporte: Aporte } | { critico: string; motivo: string } | null {
  const critico = criticoDeLaMesa(est)
  if (!critico) return null
  const aporte = criticaDeLaRonda(est, libro)
  if (aporte) return { critico, aporte }
  if (fallosDe(libro, critico) >= COTAS.REINTENTOS_DE_TURNO) return { critico, motivo: `el turno de ${critico} falló ${COTAS.REINTENTOS_DE_TURNO} veces` }
  if (est.cierre_forzado) return { critico, motivo: `la mesa cierra con lo que hay (${est.cierre_forzado})` }
  return { critico, motivo: 'no hubo una ronda de aportes nuevos que criticar' }
}

/** cuánto de la crítica ve la dirección en su tarea (completa hasta aquí; nunca se corta callado) */
export const LARGO_DE_LA_CRITICA_PARA_LA_DIRECCION = 8000
const recortaCritica = (t: string): string => (t.length <= LARGO_DE_LA_CRITICA_PARA_LA_DIRECCION ? t : `${t.slice(0, LARGO_DE_LA_CRITICA_PARA_LA_DIRECCION)}\n[… recortado: ${LARGO_DE_LA_CRITICA_PARA_LA_DIRECCION} de ${t.length} caracteres de la crítica]`)

/** la sección que se agrega a la tarea de la dirección cuando integra (null = no hay crítico: la tarea es la de siempre) */
export function seccionDeLaCriticaParaLaDireccion(est: EstadoMesa, libro: Aporte[]): string | null {
  const e = estadoDeLaCritica(est, libro)
  if (!e) return null
  if ('aporte' in e) return [
    `## La crítica de esta ronda (A${e.aporte.n} · ${e.critico})`,
    `${e.critico} confrontó lo que propuso el equipo con los hechos y el plan. Léela antes de integrar (aquí va completa; en el tablero puede verse recortada). Tú decides: la crítica asesora, no aprueba ni rechaza.`,
    '',
    recortaCritica(e.aporte.texto),
    '',
    `Dentro de \`## Citas\`, además de la cita de A${e.aporte.n}, escribe líneas que empiecen por «${PREFIJO_DE_LA_CRITICA}»: qué tomaste de la crítica, qué cambiaste por ella y por qué; y qué no tomaste y por qué. Nombra lo que cambió por su id (A<n>, o el id de la idea); no copies ahí líneas del banco ni de la pieza.`,
  ].join('\n')
  return ['## La crítica de esta ronda', `La crítica no llegó: ${e.motivo}. Integra igual y dilo en una línea dentro de \`## Citas\` que empiece por «${PREFIJO_DE_LA_CRITICA} no llegó».`].join('\n')
}

/** la tarea del turno de crítica (va debajo de la cabecera común: manual, brief, plan, fotos y tablero) */
export function tareaDeLaCritica(agente: string): string {
  return [
    `## Tu turno · CRÍTICA (${agente})`,
    'El equipo ya aportó (míralo en el tablero) y la dirección todavía no integra. Tu rol es el de un estratega de agencia: **confronta lo que se propuso con los hechos y con el plan**, antes de que la dirección decida. Lees lo mismo que el resto de la mesa (manual, brief, plan, fichas y tablero): si falta un dato que necesitas (el plan, la ficha de una oferta), dilo como «sin dato» y no lo supongas.',
    'Para cada propuesta o idea que lo amerite, citándola por su referencia (A<n>, o el id de la idea):',
    '- **Qué choca con un hecho**: algo que la oferta no es, no tiene, no ofrece, no está disponible donde o cuando se dice, o no se puede afirmar según el manual, el brief, el plan o el material del portero. Di cuál es el hecho y dónde está.',
    '- **Qué choca con el plan**: objetivo, público, fase, ruta o mensaje que el plan no sostiene.',
    '- **Qué falta probar**: lo que la propuesta da por hecho y nadie mostró con una fuente.',
    '- **Qué está bien sostenido**: dilo en una línea, para que la dirección sepa qué no tocar.',
    'Lo que no es un hecho o no está en el plan es opinión: si la das, dila como tal y en una línea. No reescribas la pieza, no propongas ideas nuevas, no votes, no apruebes ni rechaces: la dirección decide.',
    'No copies líneas del banco ni de la pieza: cita su id. Si te falta un hecho para confrontar algo, dilo (o pídelo con `pedir_material`); no lo supongas.',
    'Si no hay nada que choque, escribe una línea que empiece por «Sin observaciones:» y di qué revisaste.',
  ].join('\n')
}
