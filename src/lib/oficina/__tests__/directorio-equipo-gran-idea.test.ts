/**
 * T6 · EL DIRECTORIO DE LA OFICINA PARA LA GRAN IDEA (FIRMA 2 · E2 y E1) · US$ 0, sin base ni red.
 * Se lee la MIGRACIÓN REAL `202610312008` (los datos que se aplicarán en T9) y se ejerce el código real de la mesa (`esPertinente`, `especialistasPertinentes`, `armarTarea`, `aTarjeta`) sobre ellos:
 *   · las tres tarjetas de CC#1 (T7) son byte a byte las de `instalaciones-e1.ts`;
 *   · el concepto con el equipo completo: fijos siempre, condicionales solo con su condición (`si_instagram`, `si_video`);
 *   · la indicación del agente viaja con el pedido de su turno, no en su identidad, y sin indicación el pedido es el de siempre;
 *   · la reversa devuelve el directorio a como estaba.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { INSTALACIONES_E1, INDICACION_IDIOMA_DEL_MANUAL } from '../instalaciones-e1'
import { esPertinente, especialistasPertinentes } from '../mesa/directorio'
import { aTarjeta } from '../mesa/adaptador'
import { armarTarea, seccionDeIndicacion } from '../mesa/pedidos'
import type { EstadoMesa, Tarjeta } from '../mesa/tipos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202610312008_oficina_directorio_equipo_gran_idea.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', '202610312008_oficina_directorio_equipo_gran_idea_REVERSA.sql'), 'utf8')

const dolares = (s: string): string[] => [...s.matchAll(/\$d\$([\s\S]*?)\$d\$/g)].map((m) => m[1])
/** las filas del INSERT: agente, rol, especialidad y las cinco listas (sabe_hacer, necesita, entrega, pertinente_en, indicacion) */
function filasDeLaMigracion(): Tarjeta[] {
  const cuerpo = SQL.slice(SQL.indexOf('INSERT INTO public.oficina_directorio'), SQL.indexOf('ON CONFLICT (agente) DO NOTHING'))
  const bloques = cuerpo.split(/\n  \(\$d\$/).slice(1).map((b) => '$d$' + b)
  return bloques.map((b) => {
    const [cabeza, ...resto] = b.split('\n    ARRAY')
    const [agente, rol, especialidad] = dolares(cabeza)
    const listas = resto.map((x) => dolares(x))
    return { agente, rol: rol as Tarjeta['rol'], especialidad, sabe_hacer: listas[0], necesita: listas[1], entrega: listas[2], pertinente_en: listas[3], indicacion: listas[4], activo: true, version: 1 }
  })
}
const NUEVAS = filasDeLaMigracion()
const fila = (a: string) => NUEVAS.find((t) => t.agente === a)!

/** el directorio TAL COMO QUEDA tras 202610281500 + 202610312000 (las tarjetas de siempre) */
const ANTES: Tarjeta[] = [
  { agente: 'creative-director-mesa', rol: 'direccion', especialidad: 'dirección creativa', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel', 'kit', 'concepto:dirige'], activo: true, version: 1 },
  { agente: 'campaign-brief-agent', rol: 'direccion', especialidad: 'dirección del brief', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['brief:dirige'], activo: true, version: 1 },
  { agente: 'content-creator', rol: 'miembro', especialidad: 'texto', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel', 'kit', 'concepto'], activo: true, version: 1 },
  { agente: 'design-visual-storyteller', rol: 'miembro', especialidad: 'narrativa', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['kit', 'concepto'], activo: true, version: 1 },
  { agente: 'marketing_instagram_curator', rol: 'miembro', especialidad: 'curaduría', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel', 'kit', 'concepto:si_instagram'], activo: true, version: 1 },
  { agente: 'carousel-designer', rol: 'miembro', especialidad: 'láminas', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel'], activo: true, version: 1 },
  { agente: 'design-image-prompt-engineer', rol: 'miembro', especialidad: 'pedido de imagen', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['carrusel:si_imagen_generada', 'kit:si_imagen_generada'], activo: true, version: 1 },
  { agente: 'portero', rol: 'portero', especialidad: 'material', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: [], activo: true, version: 1 },
]
/** la migración sobre ese directorio (lo que hacen sus dos UPDATE y su INSERT) */
const DESPUES: Tarjeta[] = [
  ...ANTES.map((t) => (t.agente === 'design-visual-storyteller' ? { ...t, pertinente_en: [...t.pertinente_en, 'carrusel', 'video'] } : t)),
  ...NUEVAS,
]

describe('la migración 202610312008 trae lo que la firma pide', () => {
  it('cinco tarjetas nuevas, de miembros; el coach de video y el analista de mercado NO están (FIRMA 5: el analista vive solo en la mesa de análisis)', () => {
    expect(NUEVAS.map((t) => t.agente)).toEqual(['whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist', 'video-editor', 'marketing_video_optimization_specialist'])
    for (const t of NUEVAS) expect(t.rol).toBe('miembro')
    expect(SQL).not.toMatch(/video_coach|marketing_short_video_editing_coach/)
    expect(SQL).not.toMatch(/INSERT[\s\S]*market_research_analyst/)
    expect(REVERSA).not.toContain('market_research_analyst')
  })
  it('las tres de CC#1 (T7) son IDÉNTICAS a `instalaciones-e1.ts`: tarjeta e indicación', () => {
    for (const i of INSTALACIONES_E1) {
      const t = fila(i.agente)
      expect(t.especialidad).toBe(i.tarjeta.especialidad)
      expect(t.sabe_hacer).toEqual([...i.tarjeta.sabe_hacer])
      expect(t.necesita).toEqual([...i.tarjeta.necesita])
      expect(t.entrega).toEqual([...i.tarjeta.entrega])
      expect(t.pertinente_en).toEqual([...i.tarjeta.pertinente_en])
      expect(t.indicacion).toEqual([...i.indicacion])
    }
  })
  it('toda indicación lleva la regla de idioma del manual y NINGUNA fija idioma ni trato', () => {
    for (const t of NUEVAS) {
      expect(t.indicacion!.length).toBeGreaterThan(0)
      expect(t.indicacion!).toContain(INDICACION_IDIOMA_DEL_MANUAL)
      for (const r of t.indicacion!) expect(r).not.toMatch(/español de Ecuador|tuteo|voseo|en español\b/i)
    }
  })
  it('video-editor integra un solo gancho por video; el especialista de retención solo gancho y ritmo', () => {
    expect(fila('video-editor').indicacion!.join(' ')).toMatch(/Un solo gancho por video/)
    expect(fila('marketing_video_optimization_specialist').indicacion!.join(' ')).toMatch(/Solo gancho y ritmo/)
  })
  it('las guardas de la migración cuentan lo que hay: 5 tarjetas y 6 miembros del concepto (3 de antes + whimsy, tiktok, video-editor)', () => {
    expect(SQL).toMatch(/IF n <> 5 THEN/)
    expect(SQL).toMatch(/IF c <> 6 THEN/)
    expect(DESPUES.filter((t) => t.rol === 'miembro' && t.pertinente_en.some((p) => p.split(':')[0] === 'concepto')).length).toBe(6)
    expect(NUEVAS.length).toBe(5)
  })
  it('la inserción no pisa filas que ya existen (DO NOTHING) y el director visual suma carrusel y video con su guarda', () => {
    expect(SQL).toMatch(/ON CONFLICT \(agente\) DO NOTHING/)
    expect(SQL).not.toMatch(/DO UPDATE/)
    expect(SQL).toMatch(/array_append\(pertinente_en, 'video'\)[\s\S]*AND NOT \('video' = ANY\(pertinente_en\)\)/)
    expect(SQL).toMatch(/array_append\(pertinente_en, 'carrusel'\)[\s\S]*AND NOT \('carrusel' = ANY\(pertinente_en\)\)/)
  })
  it('la migración es aditiva y la reversa la deshace por nombre, se niega con encargos abiertos y quita la columna', () => {
    expect(SQL).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i)
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS indicacion text[] NOT NULL DEFAULT')
    for (const t of NUEVAS) expect(REVERSA).toContain(`'${t.agente}'`)
    expect(REVERSA).toMatch(/estado IN \('abierto', 'en_paso'\)/)
    expect(REVERSA).toContain('DROP COLUMN IF EXISTS indicacion')
    expect(REVERSA).toMatch(/array_remove\(array_remove\(pertinente_en, 'carrusel'\), 'video'\)/)
  })
})

describe('el concepto con el equipo completo (código real de la mesa sobre los datos de la migración)', () => {
  const concepto = (condiciones: string[]) => especialistasPertinentes(DESPUES, 'concepto', false, condiciones).sort()
  const FIJOS = ['content-creator', 'design-visual-storyteller', 'whimsy-injector']
  it('sin condiciones: los 3 fijos (el director dirige y el portero trae material, no «aportan»)', () => {
    expect(concepto([])).toEqual([...FIJOS].sort())
  })
  it('si_instagram suma al curador; si_video suma a TikTok y al editor de video; ambas, las dos cosas', () => {
    expect(concepto(['si_instagram'])).toEqual([...FIJOS, 'marketing_instagram_curator'].sort())
    expect(concepto(['si_video'])).toEqual([...FIJOS, 'tiktok-strategist', 'video-editor'].sort())
    expect(concepto(['si_instagram', 'si_video'])).toEqual([...FIJOS, 'marketing_instagram_curator', 'tiktok-strategist', 'video-editor'].sort())
  })
  it('el especialista de retención NO entra al concepto aunque haya video (solo a la fila `video`, inerte hasta T8)', () => {
    expect(concepto(['si_video', 'si_instagram'])).not.toContain('marketing_video_optimization_specialist')
    expect(fila('marketing_video_optimization_specialist').pertinente_en).toEqual(['video'])
  })
  it('lo de siempre no se mueve: el concepto sin los nuevos da lo que daba, y los carruseles y kits viejos siguen igual salvo lo declarado', () => {
    expect(especialistasPertinentes(ANTES, 'concepto', false, []).sort()).toEqual(['content-creator', 'design-visual-storyteller'])
    expect(especialistasPertinentes(ANTES, 'carrusel', false, []).sort()).toEqual(['carousel-designer', 'content-creator', 'marketing_instagram_curator'])
    // declarado: el director visual entra también al carrusel
    expect(especialistasPertinentes(DESPUES, 'carrusel', false, []).sort()).toEqual(['carousel-designer', 'content-creator', 'design-visual-storyteller', 'marketing_instagram_curator'])
    expect(especialistasPertinentes(DESPUES, 'kit', false, []).sort()).toEqual(especialistasPertinentes(ANTES, 'kit', false, []).sort())
  })
  it('Inclusive Visuals solo cuando alguien declara que la imagen lleva personas, y nunca en la gran idea', () => {
    expect(especialistasPertinentes(DESPUES, 'carrusel', true, [])).not.toContain('inclusive-visuals-specialist')
    expect(especialistasPertinentes(DESPUES, 'carrusel', true, ['si_personas'])).toContain('inclusive-visuals-specialist')
    expect(especialistasPertinentes(DESPUES, 'kit', true, ['si_personas'])).toContain('inclusive-visuals-specialist')
    expect(especialistasPertinentes(DESPUES, 'concepto', true, ['si_personas'])).not.toContain('inclusive-visuals-specialist')
  })
  it('Whimsy es de la gran idea y NO se convoca en carrusel ni kit (su costo ahí se decide en T9)', () => {
    expect(esPertinente(fila('whimsy-injector'), 'concepto', false, [])).toBe(true)
    expect(esPertinente(fila('whimsy-injector'), 'carrusel', true, ['si_personas', 'si_video'])).toBe(false)
    expect(esPertinente(fila('whimsy-injector'), 'kit', true, ['si_personas', 'si_video'])).toBe(false)
  })
})

describe('la indicación del agente viaja con el pedido de su turno (no con su identidad)', () => {
  const est = { tipo: 'concepto', directorio_congelado: DESPUES, direccion: 'creative-director-mesa', turnos: 1, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null } as unknown as EstadoMesa
  const c = { cliente_nombre: 'Cliente de práctica', tipo: 'concepto' as const, brief_id: 'BRF-1', brief_texto: 'brief', manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 5, gasto_usd: 0 }
  const tarea = (agente: string, tarjeta: Tarjeta | undefined) => armarTarea({ tipo: 'aportar', agente, tarjeta, est, libro: [], c })

  it('con indicación: una sección propia ANTES del turno, con cada regla', () => {
    const t = fila('whimsy-injector')
    const task = tarea('whimsy-injector', t)
    const i = task.indexOf('## Indicación de la oficina para ti (whimsy-injector)')
    expect(i).toBeGreaterThan(0)
    expect(i).toBeLessThan(task.indexOf('## Tu turno'))
    for (const r of t.indicacion!) expect(task).toContain('- ' + r)
  })
  it('sin indicación (o sin tarjeta) el pedido es EXACTAMENTE el de siempre', () => {
    const sin = { ...fila('whimsy-injector'), indicacion: undefined } as Tarjeta
    const base = tarea('whimsy-injector', sin)
    expect(base).not.toContain('Indicación de la oficina')
    expect(tarea('content-creator', DESPUES.find((x) => x.agente === 'content-creator'))).not.toContain('Indicación de la oficina')
    expect(tarea('whimsy-injector', undefined)).not.toContain('Indicación de la oficina')
    expect(seccionDeIndicacion({ ...sin, indicacion: ['  ', ''] }, 'x')).toBe('')
    // la sección es lo ÚNICO que cambia
    const con = tarea('whimsy-injector', fila('whimsy-injector'))
    expect(con.replace(seccionDeIndicacion(fila('whimsy-injector'), 'whimsy-injector'), '')).toBe(base)
  })
  it('el directorio vivo lee la columna nueva: lista → indicacion; ausente o vacía → la tarjeta de siempre (compatible antes de aplicar)', () => {
    const f = { agente: 'x', rol: 'miembro', especialidad: 'e', sabe_hacer: [], necesita: [], entrega: [], pertinente_en: ['concepto'], activo: true, version: 1 }
    expect(aTarjeta({ ...f, indicacion: ['a', 'b'] }).indicacion).toEqual(['a', 'b'])
    expect('indicacion' in aTarjeta(f)).toBe(false)
    expect('indicacion' in aTarjeta({ ...f, indicacion: [] })).toBe(false)
  })
})

import { condicionesDeLaPieza } from '../mesa/directorio'
describe('si_personas se calcula al abrir la pieza, del brief', () => {
  it('con palabras de personas enciende la condición; sin ellas no, y vacío o ausente tampoco', () => {
    expect(condicionesDeLaPieza('Carrusel con la familia en la mesa y niños sonriendo')).toEqual(['si_personas'])
    expect(condicionesDeLaPieza('Our friends love the dish')).toEqual(['si_personas'])
    // palabras ambiguas que NO bastan (CC3: llamarían de más al especialista)
    for (const t of ['atraer clientes con el plato', 'equipo de cocina nuevo', 'un grupo de ofertas', 'a mano alzada, manos a la obra']) expect(condicionesDeLaPieza(t)).toEqual([])
    expect(condicionesDeLaPieza('Primer plano del encebollado, vapor y limón')).toEqual([])
    expect(condicionesDeLaPieza('')).toEqual([])
    // lo que EXCLUYE personas no las convoca
    for (const t of ['VISUAL: El plato aparece completo. No aparecen personas.', 'sin gente en la foto', '- VISUAL PROHIBIDO:\n  - rostros']) expect(condicionesDeLaPieza(t)).toEqual([])
    expect(condicionesDeLaPieza('No aparecen personas. Una familia sonriendo en la mesa')).toEqual(['si_personas'])
    // una negación LEJOS o sobre otra cosa no apaga a las personas (CC3: el error peligroso es no convocar al especialista)
    for (const t of ['No olvides mostrar a las familias del barrio', 'Mujeres y hombres reales, no actores', 'Sin filtros: la gente real del barrio', 'No uses stock: queremos a los comensales de verdad']) expect(condicionesDeLaPieza(t)).toEqual(['si_personas'])
    for (const t of ['No aparecen mujeres, hombres ni niños', 'Nunca muestres rostros', 'Sin personas ni manos', 'without any people in frame']) expect(condicionesDeLaPieza(t)).toEqual([])
    expect(condicionesDeLaPieza(undefined as unknown as string)).toEqual([])
  })
  it('enciende al especialista de inclusión en el carrusel y no en otra cosa', () => {
    const c = condicionesDeLaPieza('la gente disfrutando')
    expect(especialistasPertinentes(DESPUES, 'carrusel', true, c)).toContain('inclusive-visuals-specialist')
    expect(especialistasPertinentes(DESPUES, 'carrusel', true, condicionesDeLaPieza('solo plato'))).not.toContain('inclusive-visuals-specialist')
  })
})
