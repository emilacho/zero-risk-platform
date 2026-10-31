/**
 * FIRMA de Emilio 01-nov «hoja sin reja · storyteller · YouTube» (CC#1) · US$ 0, sin base ni red ni modelo.
 *  1) la hoja escribe «GANCHO SUGERIDO» y «VOCABULARIO DE LA MARCA»; el lector del brief lee las etiquetas nuevas y las viejas; el encabezado del brief
 *     en los tres pedidos (pieza simple, láminas, mesa) dice «lo único fijo es el manual, lo prohibido y la gran idea; todo lo demás puedes mejorarlo».
 *     El gancho final del video corto lo escribe la mesa de piezas: el coach con el método short-video-scripter pegado a su tarea (la retención ya no).
 *  2) whimsy-injector entra a la mesa de piezas (carrusel · kit · video) con la misma condición de la gran idea (202611011300).
 *  3) design-visual-storyteller: claude-sonnet → claude-opus + capa local corta como indicación del directorio; la identidad no se toca.
 *  4) el video largo de YouTube es familia propia (`video_largo`): fuera de `video_mesa` (2011) y ahí aporta la retención (2012).
 *  5) organigrama: carousel-designer ya figura en la mesa de piezas (dato de 202610281500, lo cruza `especialistasPertinentes`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AGENTE_GANCHO_DE_VIDEO, METODO_GANCHO_POR_OMISION } from '@/lib/cadena/metodos'
import { BRIEF_GUIA_NO_REGLA, parsearBrief } from '../brief'
import { SI_INSTAGRAM, SI_TIKTOK_O_REELS } from '../mesa/condiciones-de-video'
import { especialistasPertinentes } from '../mesa/directorio'
import { VOZ_DEL_GANCHO, armarTarea } from '../mesa/pedidos'
import type { EstadoMesa, Tarjeta } from '../mesa/tipos'
import { construirTareaLaminas, type ContextoLaminas } from '../pedidos-laminas'
import { TRAS_2012 } from './mesa-de-video-t8.test'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const SQL_1300 = leer('supabase', 'migrations', '202611011300_firma_1nov_whimsy_en_piezas_y_storyteller_opus.sql')
const REV_1300 = leer('supabase', 'reversas', '202611011300_firma_1nov_whimsy_en_piezas_y_storyteller_opus_REVERSA.sql')
const CAPA_LOCAL = 'En esta agencia tu trabajo es la dirección visual (concepto, estilo, storyboard) partiendo de las fotos reales del cliente que entrega el portero; animación, infografías e interactivos quedan fuera de tu rol.'
const INDICACION_WHIMSY_2008 = 'Dos o tres momentos de encanto por capítulo o por pieza, cada uno en una frase, con el por qué encaja con la voz del manual. Si la marca pide sobriedad, lo dices y propones poco.'

/** el directorio tras 202611011300: whimsy en las tres piezas; el storyteller con su capa local al frente */
const TRAS_1300: Tarjeta[] = TRAS_2012.map((x) =>
  x.agente === 'whimsy-injector' ? { ...x, pertinente_en: [...x.pertinente_en, 'carrusel', 'kit', 'video'], indicacion: [INDICACION_WHIMSY_2008] }
  : x.agente === 'design-visual-storyteller' ? { ...x, indicacion: [CAPA_LOCAL, ...(x.indicacion ?? [])] }
  : x)

const PARTE_NUEVO = [
  '### F1-S1-ig-r1 · Instagram · reel',
  '- QUÉ ES: reel de 12 s',
  '- MENSAJE (uno): hay mesa desde las siete',
  '- GANCHO SUGERIDO: el vapor del pan',
  '- VOCABULARIO DE LA MARCA:',
  '  - pan de masa madre',
  '  - mesa larga',
  '- PROHIBIDO:',
  '  - delicioso',
].join('\n')
const PARTE_VIEJO = PARTE_NUEVO.replace('- GANCHO SUGERIDO:', '- GANCHO:').replace('VOCABULARIO DE LA MARCA', 'VOCABULARIO OBLIGATORIO')

describe('1 · HOJA SIN REJA (solo texto)', () => {
  it('la hoja escribe «GANCHO SUGERIDO» y «VOCABULARIO DE LA MARCA» (ya no «GANCHO» ni «VOCABULARIO OBLIGATORIO»)', () => {
    const hoja = leer('src', 'lib', 'cadena', 'hoja.ts')
    expect(hoja).toContain("campo('GANCHO SUGERIDO'")
    expect(hoja).toContain("listaDe('VOCABULARIO DE LA MARCA'")
    expect(hoja).not.toContain("campo('GANCHO'")
    expect(hoja).not.toContain('VOCABULARIO OBLIGATORIO')
  })
  it('el lector del brief lee la etiqueta nueva y sigue leyendo los partes viejos (misma lista de vocabulario)', () => {
    const nuevo = parsearBrief(PARTE_NUEVO, 'F1-S1-ig-r1')!
    const viejo = parsearBrief(PARTE_VIEJO, 'F1-S1-ig-r1')!
    expect(nuevo.vocabulario_obligatorio).toEqual(['pan de masa madre', 'mesa larga'])
    expect(viejo.vocabulario_obligatorio).toEqual(['pan de masa madre', 'mesa larga'])
    expect(nuevo.prohibido).toEqual(['delicioso'])
    expect(nuevo.texto).toContain('GANCHO SUGERIDO: el vapor del pan')
  })
  it('el encabezado del brief dice lo firmado, en la pieza simple, en las láminas y en la mesa (la misma constante)', () => {
    expect(BRIEF_GUIA_NO_REGLA).toBe('guía, no regla al pie de la letra: lo único fijo es el manual, lo prohibido y la gran idea; todo lo demás puedes mejorarlo')
    const ENC = `## El brief de este entregable (${BRIEF_GUIA_NO_REGLA})`
    // pieza simple (pedidos.ts) y láminas (pedidos-laminas.ts): la línea base de toda tarea
    expect(leer('src', 'lib', 'oficina', 'pedidos.ts')).toContain('## El brief de este entregable (${BRIEF_GUIA_NO_REGLA})')
    const ctx = {
      brief: { id: 'BRF-9', texto: PARTE_NUEVO, red: 'instagram', formato: 'carrusel' },
      fuentes: { manual_texto: 'manual', plan_texto: '', propios: { telefonos: [], handles: [] }, fuentes: { precios: [] } },
      estado: { fichas: [] }, art: () => undefined, limites: {}, elementos: [], plataforma: 'instagram', familia: 'carrusel_mesa', refsValidos: [], refsGeneradas: [], sinFoto: false, png: [],
    } as unknown as ContextoLaminas
    expect(construirTareaLaminas('direccion_visual', ctx).task).toContain(ENC)
    // la mesa (aportar en una pieza): el mismo encabezado
    const est: EstadoMesa = { tipo: 'carrusel', directorio_congelado: TRAS_1300, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null }
    const c = { cliente_nombre: 'Cliente', tipo: 'carrusel' as const, brief_id: 'F1-S1-ig-r1', brief_texto: PARTE_NUEVO, manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 }
    expect(armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: TRAS_1300.find((x) => x.agente === 'content-creator'), est, libro: [], c })).toContain(`## 2 · ${ENC.slice(3)}`)
    // la gran idea y el brief de campaña no llevan ese encabezado (no son «este entregable»)
    expect(armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est: { ...est, tipo: 'concepto' }, libro: [], c: { ...c, tipo: 'concepto' } })).not.toContain(BRIEF_GUIA_NO_REGLA)
  })
  it('el gancho final del video corto lo escribe el coach con el método scripter (única voz); la hoja solo lo sugiere', () => {
    expect(VOZ_DEL_GANCHO).toBe('marketing_short_video_editing_coach')
    expect(VOZ_DEL_GANCHO).toBe(AGENTE_GANCHO_DE_VIDEO)
    const est: EstadoMesa = { tipo: 'video', directorio_congelado: TRAS_1300, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [SI_INSTAGRAM, SI_TIKTOK_O_REELS] }
    const c = { cliente_nombre: 'Cliente', tipo: 'video' as const, brief_id: 'F1-S1-ig-r1', brief_texto: PARTE_NUEVO, manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 }
    const coach = armarTarea({ tipo: 'aportar', agente: VOZ_DEL_GANCHO, tarjeta: TRAS_1300.find((x) => x.agente === VOZ_DEL_GANCHO), est, libro: [], c })
    expect(coach).toContain('Eres la ÚNICA voz del gancho de este video')
    expect(coach).toContain('El GANCHO SUGERIDO del brief es un punto de partida que puedes mejorar, no una obligación')
    expect(coach).toContain(METODO_GANCHO_POR_OMISION)
    expect(coach).toContain('GANCHO SUGERIDO: el vapor del pan')
    // la retención no se sienta en el video corto; sí en el largo
    expect(especialistasPertinentes(TRAS_1300, 'video', false, [SI_INSTAGRAM, SI_TIKTOK_O_REELS])).not.toContain('marketing_video_optimization_specialist')
    expect(TRAS_1300.find((x) => x.agente === 'marketing_video_optimization_specialist')!.pertinente_en).toEqual(['video_largo'])
  })
})

describe('2 · whimsy-injector entra a la mesa de piezas (202611011300)', () => {
  it('con 1300 whimsy es pertinente en carrusel, kit y video además del concepto; antes solo en el concepto', () => {
    for (const tipo of ['carrusel', 'kit', 'video'] as const) {
      expect(especialistasPertinentes(TRAS_2012, tipo, false, [SI_INSTAGRAM, SI_TIKTOK_O_REELS])).not.toContain('whimsy-injector')
      expect(especialistasPertinentes(TRAS_1300, tipo, false, [SI_INSTAGRAM, SI_TIKTOK_O_REELS])).toContain('whimsy-injector')
    }
    expect(especialistasPertinentes(TRAS_1300, 'concepto', false, [])).toContain('whimsy-injector')
    expect(especialistasPertinentes(TRAS_1300, 'brief', false, [])).not.toContain('whimsy-injector')
  })
  it('la condición es la firmada para la gran idea (su indicación de 2008: «si la marca pide sobriedad, lo dices y propones poco»); en video no propone gancho', () => {
    expect(leer('supabase', 'migrations', '202610312008_oficina_directorio_equipo_gran_idea.sql')).toContain(INDICACION_WHIMSY_2008)
    const est: EstadoMesa = { tipo: 'video', directorio_congelado: TRAS_1300, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] }
    const c = { cliente_nombre: 'Cliente', tipo: 'video' as const, brief_id: 'F1-S1-ig-r1', brief_texto: PARTE_NUEVO, manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 }
    const w = armarTarea({ tipo: 'aportar', agente: 'whimsy-injector', tarjeta: TRAS_1300.find((x) => x.agente === 'whimsy-injector'), est, libro: [], c })
    expect(w).toContain('Si la marca pide sobriedad, lo dices y propones poco')
    expect(w).toContain('No propongas un gancho')
    expect(w).not.toContain(METODO_GANCHO_POR_OMISION)
  })
  it('la migración solo agrega marcas con guarda (array_append + NOT ANY) y la reversa las quita; nada destructivo', () => {
    for (const m of ['carrusel', 'kit', 'video']) {
      expect(SQL_1300).toMatch(new RegExp(`array_append\\(pertinente_en, '${m}'\\)[^\\n]*\\n\\s+WHERE agente = 'whimsy-injector' AND NOT \\('${m}' = ANY\\(pertinente_en\\)\\)`))
    }
    expect(SQL_1300).toMatch(/pertinente_en @> ARRAY\['concepto', 'carrusel', 'kit', 'video'\]/)
    expect(REV_1300).toMatch(/array_remove\(array_remove\(array_remove\(pertinente_en, 'carrusel'\), 'kit'\), 'video'\)[^\n]*WHERE agente = 'whimsy-injector'/)
    expect(SQL_1300).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE|INSERT INTO)\b/i)
    expect(REV_1300).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE|INSERT INTO)\b/i)
  })
})

describe('3 · design-visual-storyteller: sonnet → opus + capa local corta, sin tocar la identidad', () => {
  it('la migración cambia SOLO agents.model (de claude-sonnet a claude-opus, alias del CHECK) y la reversa lo devuelve', () => {
    expect(SQL_1300).toMatch(/UPDATE public\.agents SET model = 'claude-opus', updated_at = now\(\)\s+WHERE name = 'design-visual-storyteller' AND model = 'claude-sonnet'/)
    expect(REV_1300).toMatch(/UPDATE public\.agents SET model = 'claude-sonnet', updated_at = now\(\) WHERE name = 'design-visual-storyteller' AND model = 'claude-opus'/)
    const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.startsWith('--')).join('\n')
    expect(sinComentarios(SQL_1300)).not.toMatch(/identity_content|identity_source|display_name/)
    expect(sinComentarios(REV_1300)).not.toMatch(/identity_content|identity_source|display_name/)
    expect(SQL_1300.match(/UPDATE public\.agents/g)).toHaveLength(1)
  })
  it('la capa local es la frase firmada, va al FRENTE de la indicación del directorio (array_prepend con guarda) y la reversa la quita', () => {
    expect(SQL_1300).toContain(`array_prepend(\n  $d$${CAPA_LOCAL}$d$,\n  indicacion)`)
    expect(SQL_1300).toMatch(/WHERE agente = 'design-visual-storyteller'\s+AND NOT EXISTS \(SELECT 1 FROM unnest\(indicacion\) i WHERE i LIKE 'En esta agencia tu trabajo es la dirección visual%'\)/)
    expect(SQL_1300).toMatch(/indicacion\[1\] LIKE 'En esta agencia tu trabajo es la dirección visual%'/)
    expect(REV_1300).toContain(`array_remove(indicacion,\n  $d$${CAPA_LOCAL}$d$)`)
    // en la mesa, la capa local llega como indicación del asiento (dato), antes de lo demás
    const est: EstadoMesa = { tipo: 'video', directorio_congelado: TRAS_1300, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones: [] }
    const c = { cliente_nombre: 'Cliente', tipo: 'video' as const, brief_id: 'F1-S1-ig-r1', brief_texto: PARTE_NUEVO, manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 }
    const s = armarTarea({ tipo: 'aportar', agente: 'design-visual-storyteller', tarjeta: TRAS_1300.find((x) => x.agente === 'design-visual-storyteller'), est, libro: [], c })
    expect(s).toContain(CAPA_LOCAL)
  })
})

describe('4 · el video largo de YouTube es familia propia', () => {
  it('2011 deja youtube·video fuera de video_mesa y 2012 manda la retención a video_largo', () => {
    const sql2011 = leer('supabase', 'migrations', '202610312011_cadena_formatos_video_mesa.sql')
    const sql2012 = leer('supabase', 'migrations', '202610312012_oficina_mesa_de_video.sql')
    expect(sql2011).toMatch(/AND NOT \(red = 'youtube' AND formato = 'video'\)/)
    expect(sql2011).toMatch(/video_largo/)
    expect(sql2012).toMatch(/array_replace\(pertinente_en, 'video', 'video_largo'\)/)
    expect(sql2012).toMatch(/WHERE agente = 'marketing_video_optimization_specialist' AND 'video' = ANY\(pertinente_en\)/)
  })
})

describe('5 · organigrama: carousel-designer en la mesa de piezas', () => {
  it('carousel-designer es pertinente en el carrusel (dato ya sembrado en 202610281500) y en ninguna otra pieza', () => {
    expect(especialistasPertinentes(TRAS_1300, 'carrusel', false, [])).toContain('carousel-designer')
    for (const tipo of ['kit', 'video', 'concepto', 'brief'] as const) expect(especialistasPertinentes(TRAS_1300, tipo, false, [])).not.toContain('carousel-designer')
  })
})

describe('sellos y formato de las migraciones de la firma', () => {
  it('el sello 202611011300 es único, tiene reversa y las dos se guardan en LF; nada nombra a un cliente', () => {
    const sellos = fs.readdirSync(path.join(RAIZ, 'supabase', 'migrations')).map((f) => f.slice(0, 12))
    expect(sellos.filter((s) => s === '202611011300')).toHaveLength(1)
    expect(SQL_1300).not.toMatch(/\r/); expect(REV_1300).not.toMatch(/\r/)
    expect(SQL_1300).toMatch(/NO APLICADA/); expect(SQL_1300).toMatch(/NOTIFY pgrst, 'reload schema'/); expect(REV_1300).toMatch(/NOTIFY pgrst, 'reload schema'/)
    expect(SQL_1300 + REV_1300).not.toMatch(/n[aá]ufrago|peniche|p[ée]rez/i)
  })
})
