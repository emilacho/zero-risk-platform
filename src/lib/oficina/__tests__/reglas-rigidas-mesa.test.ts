/**
 * GO Lenovo 11-nov 03:55Z · fila #20 del barrido de reglas rígidas (CC4) · el traductor de la mesa. US$ 0 · sin red.
 *   · el máximo de láminas sale del dato del formato (la plantilla) y, si el director dejó más, se AVISA y las que sobran quedan anotadas (antes: corte en 10 sin decir nada);
 *   · una nota del director usada como RÓTULO («Texto en imagen: …») ya no vacía el título: se quita el rótulo y queda el texto.
 * Dos clientes de rubros distintos (restaurante y consultora B2B) + el cable desde la plantilla, con la mesa simulada de punta a punta.
 */
import { describe, expect, it } from 'vitest'
import { traducirPieza } from '../mesa/traductor'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, LAMINAS_OK, jugar, parteCon, pieza } from './mesa-arnes'

const carrusel = (laminas: Array<[string, string, string]>) =>
  `${laminas.map(([rol, t, x], i) => `## Lámina ${i + 1} · ${rol}\nTítulo: ${t}\nTexto: ${x}\nImagen: ninguna`).join('\n')}\n## Pie\nPie de la pieza.\n## Etiquetas\n#uno`

const CLIENTES = [
  { rubro: 'restaurante', laminas: (n: number) => Array.from({ length: n }, (_, i) => ['benefit', `Plato ${i + 1} de la semana`, 'Fresco, cada día.'] as [string, string, string]) },
  { rubro: 'consultora B2B', laminas: (n: number) => Array.from({ length: n }, (_, i) => ['benefit', `Paso ${i + 1} del cierre contable`, 'Sin sorpresas en diciembre.'] as [string, string, string]) },
]

describe('fila #20 · el máximo de láminas sale del formato y nunca se recorta en silencio', () => {
  for (const c of CLIENTES) {
    it(`${c.rubro}: 12 láminas con el máximo por omisión (10) → se dibujan 10, se avisa y las 2 que sobran quedan anotadas`, () => {
      const t = traducirPieza(carrusel(c.laminas(12)), 'carrusel')
      if (!t.ok) throw new Error(String(t.motivo ?? t.pregunta))
      expect(t.laminas).toHaveLength(10)
      expect(t.avisos.join('\n')).toMatch(/dejó 12 láminas y el formato admite 10/)
      expect(t.alternativas?.filter((x) => /lámina que no entró/.test(x))).toHaveLength(2)
    })
    it(`${c.rubro}: con un formato de 12 entran las 12 (sin aviso); con uno de 6 entran 6`, () => {
      const doce = traducirPieza(carrusel(c.laminas(12)), 'carrusel', { maxLaminas: 12 })
      expect(doce.ok && doce.laminas).toHaveLength(12); expect(doce.avisos.join('\n')).not.toMatch(/el formato admite/)
      const seis = traducirPieza(carrusel(c.laminas(12)), 'carrusel', { maxLaminas: 6 })
      expect(seis.ok && seis.laminas).toHaveLength(6); expect(seis.avisos.join('\n')).toMatch(/dejó 12 láminas y el formato admite 6/)
    })
  }
  it('CC7 · el rol de cada lámina se cuenta sobre lo que SE DIBUJA: máximo 5 y el director deja 7 → la lámina 5 es el cierre (y con 10 fijo no lo sería)', () => {
    const sinRol = (n: number) => `${Array.from({ length: n }, (_, i) => `## Lámina ${i + 1}\nTítulo: Paso ${i + 1} del cierre contable\nTexto: Sin sorpresas.\nImagen: ninguna`).join('\n')}\n## Pie\nPie de la pieza.\n## Etiquetas\n#uno`
    const t = traducirPieza(sinRol(7), 'carrusel', { maxLaminas: 5 })
    if (!t.ok) throw new Error(String(t.motivo ?? t.pregunta))
    expect(t.laminas).toHaveLength(5)
    expect(t.laminas?.[0].rol).toBe('hook')
    expect(t.laminas?.[4].rol).toBe('cierre')
    expect(t.laminas?.slice(1, 4).map((l) => l.rol)).not.toContain('cierre')
  })
  it('un máximo inválido (0, negativo, decimal) cae al de siempre (10)', () => {
    for (const m of [0, -3, 2.5]) { const t = traducirPieza(carrusel(CLIENTES[0].laminas(11)), 'carrusel', { maxLaminas: m }); expect(t.ok && t.laminas).toHaveLength(10) }
  })
})

describe('fila #20 · un rótulo del director no vacía el título', () => {
  it('restaurante: «Texto en imagen: Encebollado del lunes» dibuja «Encebollado del lunes» y avisa', () => {
    const t = traducirPieza(carrusel([['hook', 'Texto en imagen: Encebollado del lunes', 'Fresco.'], ['cta', 'Escríbenos', 'Te esperamos.']]), 'carrusel')
    if (!t.ok) throw new Error(String(t.motivo ?? t.pregunta))
    expect(t.laminas?.[0].headline).toBe('Encebollado del lunes')
    expect(t.avisos.join('\n')).toMatch(/traía el rótulo «Texto en imagen» del director; se dibujó solo el texto/)
  })
  it('consultora B2B: «Titular nativo — Cierra el año sin multas» dibuja el texto; una nota SIN texto después sigue sin dibujarse', () => {
    const t = traducirPieza(carrusel([['hook', 'Titular nativo — Cierra el año sin multas', 'Te ayudamos.'], ['benefit', 'Paso 1', 'texto en imagen'], ['cta', 'Agenda tu diagnóstico', 'Hoy.']]), 'carrusel')
    if (!t.ok) throw new Error(String(t.motivo ?? t.pregunta))
    expect(t.laminas?.[0].headline).toBe('Cierra el año sin multas')
    expect(t.laminas?.[1].body).toBeUndefined()
    expect(t.avisos.join('\n')).toMatch(/lámina 2: el texto traía una nota del director y no se dibujó/)
  })
})

describe('el cable: la mesa le pasa al traductor el máximo de la plantilla', () => {
  it('con una plantilla de 3 láminas, la pieza de 5 se dibuja con 3 y queda el aviso', async () => {
    const plantilla = { ...CARRUSEL_MESA, limites: { ...CARRUSEL_MESA.limites, laminas_min: 1, laminas_max: 3 } }
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla })
    M.P.mesa = crearMesaEnMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    await jugar(M, String(a.cuerpo.encargo_id), a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: pieza(LAMINAS_OK) } : undefined))
    expect(M.llamadas.renderPedidos[0].slides).toHaveLength(3)
  })
})
