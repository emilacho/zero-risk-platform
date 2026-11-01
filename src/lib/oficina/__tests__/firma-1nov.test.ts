/**
 * ORDEN 01-nov PASO A · parte de CC#1: FIRMA de Emilio «hoja sin reja · storyteller · YouTube» puntos 1, 3 y 4 + FIRMA 5 punto 2. US$ 0, sin base ni red ni modelo.
 *  1) la hoja escribe «GANCHO SUGERIDO» y «VOCABULARIO DE LA MARCA»; el lector del brief lee las etiquetas nuevas y las viejas; el encabezado del brief
 *     en los tres pedidos (pieza simple, láminas, mesa) dice «lo único fijo es el manual, lo prohibido y la gran idea; todo lo demás puedes mejorarlo».
 *     El gancho final del video corto lo escribe la mesa de piezas: el coach con el método short-video-scripter pegado a su tarea (la retención ya no).
 *  3) design-visual-storyteller: claude-sonnet → claude-opus + capa local corta como indicación del directorio; la identidad no se toca (202611011300).
 *  4) el video largo de YouTube es familia propia (`video_largo`): fuera de `video_mesa` (2011) y ahí aporta la retención (2012).
 *  FIRMA 5 punto 2) market_research_analyst fuera de la mesa de creativos: no tiene fila ni asiento en código; la migración lo deja dicho con una guarda.
 *  (El punto 2, whimsy en piezas con `si_whimsy`, y los puntos 5 y 6 son de CC#2 · 202610312013.)
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
const SQL_1300 = leer('supabase', 'migrations', '202611011300_firma_1nov_storyteller_opus_y_analista_fuera_de_creativos.sql')
const REV_1300 = leer('supabase', 'reversas', '202611011300_firma_1nov_storyteller_opus_y_analista_fuera_de_creativos_REVERSA.sql')
const sinComentarios = (s: string) => s.split('\n').filter((l) => !l.startsWith('--')).join('\n')
const CAPA_LOCAL = 'En esta agencia tu trabajo es la dirección visual (concepto, estilo, storyboard) partiendo de las fotos reales del cliente que entrega el portero; animación, infografías e interactivos quedan fuera de tu rol.'

/** el directorio tras 202611011300: el storyteller con su capa local al frente (lo demás igual que tras 2012) */
const TRAS_1300: Tarjeta[] = TRAS_2012.map((x) => (x.agente === 'design-visual-storyteller' ? { ...x, indicacion: [CAPA_LOCAL, ...(x.indicacion ?? [])] } : x))
const estado = (tipo: EstadoMesa['tipo'], condiciones: string[] = []): EstadoMesa => ({ tipo, directorio_congelado: TRAS_1300, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, condiciones })

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
const contexto = (tipo: 'carrusel' | 'kit' | 'video' | 'concepto') => ({ cliente_nombre: 'Cliente', tipo, brief_id: 'F1-S1-ig-r1', brief_texto: PARTE_NUEVO, manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 })

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
    expect(armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: TRAS_1300.find((x) => x.agente === 'content-creator'), est: estado('carrusel'), libro: [], c: contexto('carrusel') })).toContain(`## 2 · ${ENC.slice(3)}`)
    // la gran idea y el brief de campaña no llevan ese encabezado (no son «este entregable»)
    expect(armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est: estado('concepto'), libro: [], c: contexto('concepto') })).not.toContain(BRIEF_GUIA_NO_REGLA)
  })
  it('el gancho final del video corto lo escribe el coach con el método scripter (única voz); la hoja solo lo sugiere', () => {
    expect(VOZ_DEL_GANCHO).toBe('marketing_short_video_editing_coach')
    expect(VOZ_DEL_GANCHO).toBe(AGENTE_GANCHO_DE_VIDEO)
    const coach = armarTarea({ tipo: 'aportar', agente: VOZ_DEL_GANCHO, tarjeta: TRAS_1300.find((x) => x.agente === VOZ_DEL_GANCHO), est: estado('video', [SI_INSTAGRAM, SI_TIKTOK_O_REELS]), libro: [], c: contexto('video') })
    expect(coach).toContain('Eres la ÚNICA voz del gancho de este video')
    expect(coach).toContain('El GANCHO SUGERIDO del brief es un punto de partida que puedes mejorar, no una obligación')
    expect(coach).toContain(METODO_GANCHO_POR_OMISION)
    expect(coach).toContain('GANCHO SUGERIDO: el vapor del pan')
    // la retención no se sienta en el video corto; sí en el largo
    expect(especialistasPertinentes(TRAS_1300, 'video', false, [SI_INSTAGRAM, SI_TIKTOK_O_REELS])).not.toContain('marketing_video_optimization_specialist')
    expect(TRAS_1300.find((x) => x.agente === 'marketing_video_optimization_specialist')!.pertinente_en).toEqual(['video_largo'])
  })
})

describe('3 · design-visual-storyteller: sonnet → opus + capa local corta, sin tocar la identidad', () => {
  it('la migración cambia SOLO agents.model (de claude-sonnet a claude-opus, alias del CHECK) y la reversa lo devuelve', () => {
    expect(SQL_1300).toMatch(/UPDATE public\.agents SET model = 'claude-opus', updated_at = now\(\)\s+WHERE name = 'design-visual-storyteller' AND model = 'claude-sonnet'/)
    expect(REV_1300).toMatch(/UPDATE public\.agents SET model = 'claude-sonnet', updated_at = now\(\) WHERE name = 'design-visual-storyteller' AND model = 'claude-opus'/)
    expect(sinComentarios(SQL_1300)).not.toMatch(/identity_content|identity_source|display_name/)
    expect(sinComentarios(REV_1300)).not.toMatch(/identity_content|identity_source|display_name/)
    expect(SQL_1300.match(/UPDATE public\.agents/g)).toHaveLength(1)
    expect(SQL_1300).toMatch(/IF s <> 1 THEN RAISE EXCEPTION 'design-visual-storyteller debe quedar en claude-opus y activo'/)
  })
  it('la capa local es la frase firmada, va al FRENTE de la indicación del directorio (array_prepend con guarda) y la reversa la quita', () => {
    expect(SQL_1300).toContain(`array_prepend(\n  $d$${CAPA_LOCAL}$d$,\n  indicacion)`)
    expect(SQL_1300).toMatch(/WHERE agente = 'design-visual-storyteller'\s+AND NOT EXISTS \(SELECT 1 FROM unnest\(indicacion\) i WHERE i LIKE 'En esta agencia tu trabajo es la dirección visual%'\)/)
    expect(SQL_1300).toMatch(/indicacion\[1\] LIKE 'En esta agencia tu trabajo es la dirección visual%'/)
    expect(REV_1300).toContain(`array_remove(indicacion,\n  $d$${CAPA_LOCAL}$d$)`)
    // en la mesa, la capa local llega como indicación del asiento (dato)
    const s = armarTarea({ tipo: 'aportar', agente: 'design-visual-storyteller', tarjeta: TRAS_1300.find((x) => x.agente === 'design-visual-storyteller'), est: estado('video'), libro: [], c: contexto('video') })
    expect(s).toContain(CAPA_LOCAL)
  })
  it('no toca a whimsy (punto 2, de CC#2 en 202610312013) ni siembra ni borra nada', () => {
    expect(sinComentarios(SQL_1300 + REV_1300)).not.toMatch(/whimsy|growth-hacker|carousel-designer/)
    expect(SQL_1300).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE|INSERT INTO)\b/i)
    expect(REV_1300).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE|INSERT INTO)\b/i)
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

describe('FIRMA 5 punto 2 · market_research_analyst fuera de la mesa de creativos', () => {
  it('ningún código de la oficina lo sienta en una mesa creativa y 2008 no lo siembra; la migración le quita marcas de creativos si alguna vez tuviera fila, y lo guarda', () => {
    for (const tipo of ['concepto', 'carrusel', 'kit', 'video'] as const) expect(especialistasPertinentes(TRAS_1300, tipo, true, [SI_INSTAGRAM, SI_TIKTOK_O_REELS])).not.toContain('market_research_analyst')
    const fuentes = ['mesa/directorio.ts', 'mesa/orquestador.ts', 'mesa/pedidos.ts', 'plantillas/concepto-mesa.ts', 'plantillas/video-mesa.ts', 'instalaciones-e1.ts']
      .filter((f) => fs.existsSync(path.join(RAIZ, 'src', 'lib', 'oficina', f)))
    for (const f of fuentes) expect(leer('src', 'lib', 'oficina', f), f).not.toMatch(/market_research_analyst/)
    expect(leer('supabase', 'migrations', '202610312008_oficina_directorio_equipo_gran_idea.sql')).not.toMatch(/INSERT[\s\S]*market_research_analyst/)
    expect(SQL_1300).toMatch(/WHERE agente = 'market_research_analyst'\s+AND EXISTS \(SELECT 1 FROM unnest\(pertinente_en\) p WHERE split_part\(p, ':', 1\) IN \('concepto', 'carrusel', 'kit', 'video'\)\)/)
    expect(SQL_1300).toMatch(/IF a <> 0 THEN RAISE EXCEPTION 'market_research_analyst no puede tener marcas de la mesa de creativos/)
    // R26 (certificación CC3): la sentencia le quita las CUATRO mesas creativas (video incluida), no solo algunas
    expect(SQL_1300).toMatch(/ARRAY\(SELECT p FROM unnest\(pertinente_en\) p WHERE split_part\(p, ':', 1\) NOT IN \('concepto', 'carrusel', 'kit', 'video'\)\)/)
    expect(sinComentarios(REV_1300)).not.toMatch(/market_research_analyst/)
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
