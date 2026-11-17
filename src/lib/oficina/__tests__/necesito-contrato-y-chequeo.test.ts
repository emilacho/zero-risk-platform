/**
 * 17-nov · mini-prueba (RESPUESTAS Lenovo 12:23Z) · la foto del 19 (encargo 9e24e327) falló en «dirección visual» porque el contrato en texto mostraba `"necesito": []` sin la forma
 * del elemento: el curador inventó `{campo, pregunta}` y el chequeo (`salida.ts`, `necesito`) exige `{que, para_que?, bloquea?}`. Esta prueba ata el texto al chequeo: todo contrato cuyo
 * esquema acepta `necesito` muestra un ejemplo que el MISMO chequeo acepta, y ningún contrato muestra `necesito` si su esquema no lo acepta. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { AVISO_DEL_CEREBRO, CONTRATOS_EN_TEXTO } from '../pedidos'
import { CONTRATOS_LAMINAS } from '../pedidos-laminas'
import { ESQUEMAS, validar, type Esq } from '../salida'

const CONTRATOS: Record<string, string> = { ...CONTRATOS_EN_TEXTO, ...CONTRATOS_LAMINAS }

/** el esquema de `necesito` de un contrato, o null si no lo acepta */
function esquemaDeNecesito(id: string): Esq | null {
  const e = ESQUEMAS[id] as { props?: Record<string, Esq> } | undefined
  return e?.props?.necesito ?? null
}

/** el arreglo de ejemplo que muestra el texto del contrato después de `"necesito":` */
function ejemploDeNecesito(texto: string): unknown {
  const i = texto.indexOf('"necesito":')
  if (i < 0) return undefined
  const desde = texto.indexOf('[', i)
  let prof = 0
  for (let k = desde; k < texto.length; k++) {
    if (texto[k] === '[') prof++
    else if (texto[k] === ']' && --prof === 0) return JSON.parse(texto.slice(desde, k + 1))
  }
  throw new Error('el arreglo de `necesito` no cierra')
}

describe('«necesito» · el texto del contrato coincide con el chequeo', () => {
  const conNecesito = Object.keys(CONTRATOS).filter((id) => esquemaDeNecesito(id))

  it('hay contratos con `necesito` (la prueba no pasa en vacío) · los 6 de hoy', () => {
    expect(conNecesito.sort()).toEqual(['copy_base.v1', 'copy_kit.v1', 'direccion_imagenes.v1', 'laminas.v1', 'pieza_post.v1', 'visual_direction.v1'])
  })

  it.each(Object.keys(CONTRATOS))('%s · muestra `necesito` si y solo si su esquema lo acepta', (id) => {
    expect(CONTRATOS[id].includes('"necesito"')).toBe(esquemaDeNecesito(id) !== null)
  })

  it.each(conNecesito)('%s · el ejemplo trae al menos un elemento y el MISMO chequeo lo acepta', (id) => {
    const ej = ejemploDeNecesito(CONTRATOS[id])
    expect(Array.isArray(ej) && ej.length > 0).toBe(true)
    expect(validar(esquemaDeNecesito(id)!, ej)).toEqual([])
  })

  it('la forma que inventó el curador el 17-nov (`campo`, `pregunta`) el chequeo la rechaza: por eso el texto tiene que decirla', () => {
    const errores = validar(esquemaDeNecesito('visual_direction.v1')!, [{ campo: 'foto', pregunta: '¿hay foto del ceviche?' }])
    expect(errores.join(' · ')).toMatch(/que: falta/)
  })

  it('el aviso del cerebro también dice la forma', () => {
    expect(AVISO_DEL_CEREBRO).toContain('{"que": "…", "para_que": "…"}')
  })
})
