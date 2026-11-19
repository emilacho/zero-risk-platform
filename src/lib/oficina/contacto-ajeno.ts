/**
 * 18-nov · GO Lenovo 13:52Z «lo exacto se autocorrige» · un teléfono o un @ que NO es del cliente se reemplaza por el del cliente (el primero de su lista), sin modelo y sin gasto.
 * Regla de Emilio: «juzgar = agente; verificar exacto = código». Ante la duda NO se toca y se declara:
 *  · sin teléfonos (o @) del cliente leídos, o marcados como no verificables: no se reemplaza (el chequeo de siempre lo deja como sugerencia);
 *  · un @ pegado a una palabra es un correo («ventas@dominio.com»): no se toca;
 *  · una fecha, un rango o una cifra con miles no son teléfonos (la misma lectura que el chequeo, `datosDeContacto`).
 * Puro. Agnóstico: los datos del cliente llegan como dato.
 */
import { RE_HANDLE, RE_TELEFONO, digitosDeTelefono, esFechaORangoOCifra, esTelefonoDeLaLista, normalizar } from './texto'
import type { FuentesDelCliente } from './chequeos'

export interface CambioDeContacto { de: string; a: string; que: 'telefono' | 'usuario' }
export interface TextoCorregido { texto: string; cambios: CambioDeContacto[] }

type Fuentes = Pick<FuentesDelCliente, 'telefonos' | 'handles' | 'telefonos_verificables' | 'handles_verificables'>

/** ¿el número va pegado a otra cosa? La palabra entera (hasta el espacio) trae letras, «/», «:», «_», «=», «@» o «#» fuera del número */
function pegadoAOtraCosa(todo: string, desde: number, hasta: number): boolean {
  let i = desde, j = hasta
  while (i > 0 && !/\s/.test(todo[i - 1])) i--
  while (j < todo.length && !/\s/.test(todo[j])) j++
  return /[\p{L}/:_=@#]/u.test(todo.slice(i, desde) + todo.slice(hasta, j))
}

export function corregirContactoAjeno(texto: string, f: Fuentes): TextoCorregido {
  const cambios: CambioDeContacto[] = []
  let t = String(texto ?? '')
  const tel = f.telefonos_verificables === false ? undefined : (f.telefonos ?? []).map((x) => String(x).trim()).find((x) => digitosDeTelefono(x).length >= 7)
  if (tel) {
    t = t.replace(RE_TELEFONO, (m, desde: number, todo: string) => {
      if (esFechaORangoOCifra(m) || digitosDeTelefono(m).length < 7 || esTelefonoDeLaLista(m, f.telefonos)) return m
      // ante la duda no se toca: cifras DENTRO de una palabra, un id o una dirección («foto:062ec4fa-…-000000000099», «https://…/123456789») no son un teléfono
      if (pegadoAOtraCosa(todo, desde, desde + m.length)) return m
      // el número que se reemplaza conserva lo que tenía alrededor (espacios del final, si el patrón los tomó)
      cambios.push({ de: m.trim(), a: tel, que: 'telefono' })
      return m.replace(m.trim(), tel)
    })
  }
  const propios = (f.handles ?? []).map((h) => String(h).trim()).filter(Boolean).map((h) => (h.startsWith('@') ? h : `@${h}`))
  const usuario = f.handles_verificables === false ? undefined : propios[0]
  if (usuario) {
    const suyos = new Set(propios.map((h) => normalizar(h)))
    t = t.replace(RE_HANDLE, (m, desde: number, todo: string) => {
      // pegado a una letra o cifra por delante = un correo: no se toca
      if (desde > 0 && /[\p{L}0-9_./]/u.test(todo[desde - 1])) return m
      // el punto final de la oración no es parte del usuario
      const limpio = m.replace(/\.+$/, '')
      if (suyos.has(normalizar(limpio))) return m
      cambios.push({ de: limpio, a: usuario, que: 'usuario' })
      return usuario + m.slice(limpio.length)
    })
  }
  return { texto: t, cambios }
}

/**
 * el texto que se PUBLICA de una pieza (pie de foto y llamado del post y del video): se corrige campo por campo, en el paso de chequeos.
 * Con mesa, el texto entero ya llega corregido desde antes de traducirlo (`mesa/orquestador.ts`), así que también lo que se DIBUJA en las láminas.
 * Lo ya dibujado no se toca aquí (está en la imagen): su chequeo sigue como siempre.
 */
export function corregirContactoDeLaPieza<T extends Record<string, unknown>>(pieza: T, f: Fuentes, campos: ReadonlyArray<string> = ['pie_de_foto', 'llamado']): { pieza: T; declarado: string[] } {
  const cambios: CambioDeContacto[] = []
  const nueva: Record<string, unknown> = { ...pieza }
  for (const k of campos) {
    if (typeof pieza[k] !== 'string') continue
    const r = corregirContactoAjeno(pieza[k] as string, f)
    if (r.cambios.length) { nueva[k] = r.texto; cambios.push(...r.cambios) }
  }
  return cambios.length ? { pieza: nueva as T, declarado: declaracionDeContacto(cambios) } : { pieza, declarado: [] }
}

/** lo que se declara en la pieza: «se corrigió solo: X → Y» (una línea por cambio, sin repetir) */
export const declaracionDeContacto = (cambios: ReadonlyArray<CambioDeContacto>): string[] =>
  [...new Set(cambios.map((c) => `se corrigió solo: ${c.que === 'telefono' ? 'el teléfono' : 'el usuario'} ${c.de} → ${c.a} (el del cliente)`))]
