/** ¿Es voz de verdad? (ronda 76) · música y ruido no cuentan como «se leyó lo que dicen»; con las transcripciones REALES grabadas y con la copia que corre dentro del flujo. Sin modelo. */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { VOZ_JS } from '../../../../scripts/worker-staging/construir-fuentes-publicas.mjs'
import { esVozReal } from '../voz'

const NO_VOZ = ['Bam bam bilam bam bam bam.', 'Butuhong.', '♪ la la la la la la la la ♪', '[Music]', 'Oh oh oh oh oh oh yeah yeah yeah', 'na na na na na na na na', 'hola', '', 'sí sí sí sí sí sí sí sí sí', 'uh uh uh mm mm hm hm']
const VOZ = [
  'Hola a todos, hoy les mostramos cómo preparamos el plato del día con producto fresco.',
  'Hey everybody, let us go to the soup place. The best soup in town, honestly, you have to try it.',
  'Todo lo hacemos al momento y con producto del día, sin congelar nada.',
  'Bienvenidos a nuestro local, abrimos de jueves a lunes y también hacemos entregas a domicilio.',
]
describe('voz de verdad contra música y ruido', () => {
  it.each(NO_VOZ)('NO es voz: «%s»', (t) => { expect(esVozReal(t).voz, t).toBe(false) })
  it.each(VOZ)('SÍ es voz: «%s»', (t) => { expect(esVozReal(t).voz, t).toBe(true) })
  it('lo que no es texto no es voz', () => { expect(esVozReal(null).voz).toBe(false); expect(esVozReal(42).voz).toBe(false) })
  it('con las transcripciones REALES de Instagram: «Bam bam bilam…» queda fuera, el resto se juzga', () => {
    const filas = (JSON.parse(fs.readFileSync(path.join(process.cwd(), '__tests__/fixtures/fuentes-reales-r75/videos_instagram.json'), 'utf8')) as { respuesta: Array<{ transcript?: string }> }).respuesta
    const r = filas.map((x) => ({ t: x.transcript ?? '', v: esVozReal(x.transcript).voz }))
    expect(r.find((x) => x.t.startsWith('Bam bam'))!.v).toBe(false)
    expect(r.some((x) => x.v)).toBe(true)
  })
})

describe('la copia que corre dentro del flujo da lo mismo que la de TypeScript', () => {
  const copia = new Function(`${VOZ_JS}\nreturn esVozReal;`)() as (t: unknown) => { voz: boolean; motivo: string }
  it.each([...NO_VOZ, ...VOZ, 'Lo primero que ves hacer a un niño cuando gatea es intentar entender su entorno.', 'Cuando tengas esa hambre de... Náufrago te espera!'])('«%s»', (t) => {
    expect(copia(t)).toEqual(esVozReal(t))
  })
})
