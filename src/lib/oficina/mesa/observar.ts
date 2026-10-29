/**
 * EL PASO `mesa_observar` · lo corre el código DESPUÉS de generar las imágenes, FUERA de la mesa (condición 4 de CC#3): un modelo de otro proveedor describe lo que ve (texto visible y marcas), el código coteja
 * contra el texto que la pieza pidió y deja la elección de versiones con la forma que ya consume la cola mecánica. Ni opina ni aporta; si no contesta, la imagen NO se bloquea por falta de ojos (se avisa).
 */
import { datos, fichaNueva } from '../ayudas'
import type { SalidaCodigoL } from '../orquestador-laminas'
import type { Cambios, Encargo, Puertos } from '../puertos'
import type { Plantilla } from '../tipos'
import { baseDeLaminas } from '../orquestador-laminas'
import { PEDIDO_DEL_OBSERVADOR, leerObservador, observacionDeLaMesa, type LecturaDelObservador } from './evidencia'

/** todas las cadenas de un valor anidado (el texto que la pieza pidió, sin importar la forma del artefacto) */
export function cadenasDe(x: unknown, acc: string[] = []): string[] {
  if (typeof x === 'string') acc.push(x)
  else if (Array.isArray(x)) for (const v of x) cadenasDe(v, acc)
  else if (x && typeof x === 'object') for (const v of Object.values(x as Record<string, unknown>)) cadenasDe(v, acc)
  return acc
}

export async function observarImagenes(P: Puertos, enc: Encargo, _pl: Plantilla): Promise<SalidaCodigoL> {
  void _pl
  const e = enc.estado_del_motor
  const b = baseDeLaminas(e)
  const im = datos(e, 'imagenes')
  const ult = (im?.ultimo_intento as number | undefined) ?? 0
  const items = ((im?.items ?? []) as Array<{ indice: number; ref: string; url: string; prompt?: string; intento: number }>).filter((x) => x.intento === ult && x.url)
  const permitido = [...cadenasDe(datos(e, 'copy_carrusel')), ...cadenasDe(datos(e, 'laminas')), ...cadenasDe(datos(e, 'copy_kit')), ...cadenasDe(datos(e, 'estructura')), b.F.marca?.brand_handle ?? '']
  const lecturas: Record<number, LecturaDelObservador> = {}
  const gastos: NonNullable<Cambios['gastos']> = []
  let costo = 0
  for (const it of items) {
    const rr = await P.revisor({ texto: PEDIDO_DEL_OBSERVADOR(it.prompt ?? ''), imagenes_urls: [it.url], dry_run: enc.dry_run, client_id: enc.client_id, ref_id: enc.id, n: it.indice })
    if (rr.ok) {
      lecturas[it.indice] = leerObservador(rr.texto)
      if (rr.costo_usd > 0) { costo += rr.costo_usd; gastos.push({ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: rr.costo_usd, base: 'usage' }) }
    } else if ((rr.costo_usd ?? 0) > 0) { costo += rr.costo_usd ?? 0; gastos.push({ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: rr.costo_usd ?? 0, base: 'usage' }) }
  }
  const o = observacionDeLaMesa({ items, lecturas, permitido, marcasPropias: [b.F.marca?.brand_handle ?? '', b.F.cliente_nombre ?? ''] })
  const refsConAceptada = new Set(Object.keys(o.aceptadas))
  const fichas = [...new Set(o.rechazadas.map((x) => x.ref))].filter((ref) => !refsConAceptada.has(ref)).map((ref) => {
    const motivos = o.rechazadas.filter((x) => x.ref === ref).map((x) => x.motivo)
    return fichaNueva(`observador-${ref}`, 'chequeo', 'imagen', 'bloquea', `la imagen de «${ref}» muestra algo que la pieza no pidió (${motivos[0]}): no se usa y una persona decide`, 'cotejo del observador de imagen', 'rehacer la imagen o quitarla')
  })
  const avisos = o.sin_lectura.length ? [fichaNueva('observador-sin-lectura', 'chequeo', 'imagen', 'sugerencia', `el observador no contestó para ${o.sin_lectura.length} imagen(es): se aceptan sin cotejo de texto visible`)] : []
  return {
    res: {
      costo_usd: +costo.toFixed(6),
      artefacto: { aceptadas: o.aceptadas, preferencia: [], veredicto: { regenerar: false, pasan: Object.values(o.aceptadas).flat() }, observaciones: o.observaciones, rechazadas: o.rechazadas, sin_lectura: o.sin_lectura, observador: 'externo' },
      fichas: [...fichas, ...avisos], reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' },
    },
    ...(gastos.length ? { gastos } : {}),
  }
}
