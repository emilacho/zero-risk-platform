/**
 * CHEQUEOS DUROS de `post_img` (paso `chequeos`) · sin modelo. Solo lo firmado (palabras prohibidas, datos falsos, legales) más lo propio de una imagen; el resto es guía.
 * Cada falla = una ficha `origen: 'chequeo'` con `donde` ∈ texto · hashtags · imagen. Un dato NO verificable = ficha `sugerencia`, no `bloquea`. Diseño: sala 1 §8.
 * Agnóstico: las listas (prohibidas, teléfonos, precios, registro) llegan como DATO del cliente; ningún cliente vive aquí.
 */
import { contienePalabra, datosDeContacto, esTelefonoDeLaLista, normalizar } from './texto'
import type { Ficha } from './tipos'
import { importesEnTexto, numeroDeImporte } from '@/lib/moneda/por-pais'

export type Registro = 'tuteo' | 'voseo' | 'formal' | 'sin_dato'
/** lo que el código sabe del cliente (de su manual, su ficha, su carta guardada y sus sedes) */
export interface FuentesDelCliente {
  palabras_prohibidas: string[]
  telefonos: string[]
  handles: string[]
  /** precios publicados (cifras exactas, p. ej. «7.00»); vacío = no hay carta guardada (no verificable) */
  precios: string[]
  competidores: string[]
  /** r75 · H5 · moneda del cliente (ficha/manual o país): los precios se comparan POR importe y moneda; null = no se sabe (un «$» suelto se compara solo por el importe) */
  moneda?: string | null
  registro: Registro
  /** false = no se pudieron leer los teléfonos / usuarios del cliente: lo que no esté en la lista es «no verificado» (sugerencia), nunca «falso» (bloquea) */
  telefonos_verificables?: boolean
  handles_verificables?: boolean
}
export interface PiezaDePost { pie_de_foto: string; hashtags: string[]; llamado?: string; nota_para_quien_publica?: string }
export interface ContextoDeChequeo {
  pieza: PiezaDePost
  fuentes: FuentesDelCliente
  limites: { pie_de_foto_max: number; hashtags_max: number; limites_verificados: boolean }
  /** palabras que el brief prohíbe además del manual */
  prohibidas_del_brief?: string[]
  imagen?: { generada: boolean; declarada_en_bandeja: boolean }
}

/** voseo SIN tilde que no se confunde con tuteo (lista cerrada; se aplica solo si el registro es tuteo o no hay dato) */
export const VOSEO_SIN_TILDE = ['vos', 'pedilo', 'pedila', 'escribinos', 'venite', 'fijate', 'contanos', 'probalo', 'probala', 'animate', 'llamanos', 'seguinos', 'compartilo', 'etiquetanos', 'agendate', 'tomate', 'sumate', 'pasate']
/** formas que SOLO son voseo con su tilde («mirá»); sin tilde son tuteo válido («mira») y no se marcan */
export const VOSEO_CON_TILDE = ['mirá', 'hacé', 'andá', 'llamá', 'tenés', 'querés', 'podés', 'sabés', 'pedí', 'escribí', 'vení', 'probá', 'conseguí', 'comentá', 'reservá', 'agendá', 'seguí', 'compartí', 'sumá', 'pasá', 'tomá', 'contá']

const ficha = (donde: string, gravedad: Ficha['gravedad'], que: string, contra_que: string, propuesta: string, n: number): Ficha => ({
  id: `chk-${donde}-${n}`, origen: 'chequeo', donde, gravedad, estado: 'abierta', que, contra_que, propuesta,
})

export function chequeosDePost(c: ContextoDeChequeo): Ficha[] {
  const f: Ficha[] = []
  const texto = c.pieza.pie_de_foto
  const todo = `${texto}\n${(c.pieza.hashtags ?? []).join(' ')}\n${c.pieza.llamado ?? ''}`
  let n = 0

  // 1 · prohibidas del manual y del brief (en el pie, el llamado y los hashtags)
  const prohibidas = [...c.fuentes.palabras_prohibidas, ...(c.prohibidas_del_brief ?? [])]
  for (const p of prohibidas) {
    if (!p.trim()) continue
    if (contienePalabra(texto, p) || contienePalabra(c.pieza.llamado ?? '', p)) f.push(ficha('texto', 'bloquea', `usa la palabra prohibida «${p}»`, 'palabras prohibidas del manual y del brief', 'reescribir sin esa palabra', n++))
    if ((c.pieza.hashtags ?? []).some((h) => contienePalabra(h.replace(/^#/, ''), p))) f.push(ficha('hashtags', 'bloquea', `un hashtag trae la palabra prohibida «${p}»`, 'palabras prohibidas del manual y del brief', 'quitar o cambiar el hashtag', n++))
  }

  // 2 · registro: el voseo solo es falla si el registro resuelto del cliente es tuteo (si no hay dato, solo sugerencia)
  if (c.fuentes.registro === 'tuteo' || c.fuentes.registro === 'sin_dato') {
    const grav: Ficha['gravedad'] = c.fuentes.registro === 'tuteo' ? 'bloquea' : 'sugerencia'
    const hallados = new Set<string>()
    const bajo = texto.toLowerCase()
    for (const v of VOSEO_CON_TILDE) if (new RegExp(`(^|[^\\p{L}])${v}(?![\\p{L}])`, 'u').test(bajo)) hallados.add(v)
    for (const v of VOSEO_SIN_TILDE) if (contienePalabra(texto, v)) hallados.add(v)
    if (hallados.size) f.push(ficha('texto', grav, `voseo en el texto: ${[...hallados].join(', ')}`, c.fuentes.registro === 'tuteo' ? 'el manual del cliente fija tuteo' : 'el registro del cliente no está declarado', 'reescribir en tuteo', n++))
  }

  // 3 · datos: teléfonos, @ y precios solo los del cliente
  const dc = datosDeContacto(todo)
  const telGrav: Ficha['gravedad'] = c.fuentes.telefonos_verificables === false ? 'sugerencia' : 'bloquea'
  const hanGrav: Ficha['gravedad'] = c.fuentes.handles_verificables === false ? 'sugerencia' : 'bloquea'
  for (const t of dc.telefonos) if (!esTelefonoDeLaLista(t, c.fuentes.telefonos)) f.push(ficha('texto', telGrav, `teléfono ${t} que no es del cliente${telGrav === 'sugerencia' ? ' (no se pudo verificar: no hay teléfonos del cliente leídos)' : ''}`, 'ficha del cliente y sedes', 'usar solo el teléfono del cliente', n++))
  const han = new Set(c.fuentes.handles.map((h) => normalizar(h.startsWith('@') ? h : `@${h}`)))
  for (const h of dc.handles) if (!han.has(h)) f.push(ficha('texto', hanGrav, `usuario ${h} que no es del cliente${hanGrav === 'sugerencia' ? ' (no se pudo verificar: no hay usuarios del cliente leídos)' : ''}`, 'ficha del cliente', 'usar solo los usuarios del cliente', n++))
  // r75 · H5 · precios con la MONEDA del cliente (no solo «$»): importe + moneda; un «$» suelto es del cliente si su moneda es la local; otra moneda explícita no es la suya
  const monedaCliente = c.fuentes.moneda ?? null
  const buenos = new Set(c.fuentes.precios.map((p) => numeroDeImporte(String(p)).toFixed(2)))
  for (const im of importesEnTexto(texto)) {
    const etiqueta = im.crudo.replace(/\s+/g, ' ').trim()
    if (monedaCliente && im.moneda && im.moneda !== monedaCliente) { f.push(ficha('texto', 'bloquea', `precio ${etiqueta} en otra moneda (la del cliente es ${monedaCliente})`, 'moneda de la ficha del cliente', `usar precios en ${monedaCliente}`, n++)); continue }
    if (c.fuentes.precios.length === 0) { f.push(ficha('texto', 'sugerencia', `precio ${etiqueta} sin lista de precios publicada para verificarlo`, 'lista de precios del cliente', 'verificar el precio antes de publicar', n++)); continue }
    if (!buenos.has(im.valor.toFixed(2))) f.push(ficha('texto', 'bloquea', `precio ${etiqueta} que no está en la lista de precios publicada del cliente`, 'lista de precios publicada del cliente', 'usar un precio de la lista', n++))
  }

  // 4 · hashtags: sin competidores, cantidad
  for (const comp of c.fuentes.competidores) {
    if ((c.pieza.hashtags ?? []).some((h) => contienePalabra(h.replace(/^#/, ''), comp)) || contienePalabra(texto, comp)) f.push(ficha('hashtags', 'bloquea', `nombra a un competidor del cliente («${comp}»)`, 'competidores del cliente', 'quitar el nombre', n++))
  }
  if ((c.pieza.hashtags ?? []).length > c.limites.hashtags_max) f.push(ficha('hashtags', c.limites.limites_verificados ? 'bloquea' : 'sugerencia', `${c.pieza.hashtags.length} hashtags, más que el límite de ${c.limites.hashtags_max}`, 'límite de la plataforma' + (c.limites.limites_verificados ? '' : ' (no verificado)'), 'reducir los hashtags', n++))

  // 5 · longitud
  if (texto.length > c.limites.pie_de_foto_max) f.push(ficha('texto', c.limites.limites_verificados ? 'bloquea' : 'sugerencia', `el pie de foto tiene ${texto.length} caracteres, más que el límite de ${c.limites.pie_de_foto_max}`, 'límite de la plataforma' + (c.limites.limites_verificados ? '' : ' (no verificado)'), 'acortar el texto', n++))

  // 6 · imagen generada declarada
  if (c.imagen?.generada && !c.imagen.declarada_en_bandeja) f.push(ficha('imagen', 'bloquea', 'la imagen es generada y la bandeja no lo declara', 'honestidad de la imagen', 'marcar la pieza como imagen generada', n++))
  return f
}
