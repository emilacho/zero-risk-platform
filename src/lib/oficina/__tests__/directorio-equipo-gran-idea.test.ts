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
  it('seis tarjetas nuevas, de miembros, y el coach de video NO está', () => {
    expect(NUEVAS.map((t) => t.agente)).toEqual(['whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist', 'market_research_analyst', 'video-editor', 'marketing_video_optimization_specialist'])
    for (const t of NUEVAS) expect(t.rol).toBe('miembro')
    expect(SQL).not.toMatch(/video_coach|marketing_short_video_editing_coach/)
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
  it('el mercado pide TRES señales con fuente y fecha, sin estimar; video-editor integra un solo gancho; el especialista de retención solo gancho y ritmo', () => {
    expect(fila('market_research_analyst').indicacion!.join(' ')).toMatch(/TRES señales/)
    expect(fila('market_research_analyst').indicacion!.join(' ')).toMatch(/sin dato/)
    expect(fila('video-editor').indicacion!.join(' ')).toMatch(/Un solo gancho por video/)
    expect(fila('marketing_video_optimization_specialist').indicacion!.join(' ')).toMatch(/Solo gancho y ritmo/)
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
  const FIJOS = ['content-creator', 'design-visual-storyteller', 'market_research_analyst', 'whimsy-injector']
  it('sin condiciones: los 4 fijos (el director dirige y el portero trae material, no «aportan»)', () => {
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
    expect(condicionesDeLaPieza('Our customers love the dish')).toEqual(['si_personas'])
    expect(condicionesDeLaPieza('Primer plano del encebollado, vapor y limón')).toEqual([])
    expect(condicionesDeLaPieza('')).toEqual([])
    expect(condicionesDeLaPieza(undefined as unknown as string)).toEqual([])
  })
  it('enciende al especialista de inclusión en el carrusel y no en otra cosa', () => {
    const c = condicionesDeLaPieza('la gente disfrutando')
    expect(especialistasPertinentes(DESPUES, 'carrusel', true, c)).toContain('inclusive-visuals-specialist')
    expect(especialistasPertinentes(DESPUES, 'carrusel', true, condicionesDeLaPieza('solo plato'))).not.toContain('inclusive-visuals-specialist')
  })
})
