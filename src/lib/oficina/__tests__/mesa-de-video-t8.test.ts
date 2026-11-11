/**
 * T8 · LA MESA DE VIDEO SOBRE LA HOJA · lado de la OFICINA (31-oct · plan v3 T8 · CC#1) · US$ 0, sin base ni red ni modelo.
 *  · las condiciones del video (`si_instagram`, `si_tiktok_o_reels`) salen del brief de la hoja;
 *  · el equipo de la mesa es el DATO de 202610312008 + 202610312012 (dirección, guion, pie, storyboard, el coach como única voz del gancho [FIRMA 01-nov], curador y TikTok condicionales;
 *    la retención pasa a `video_largo`, la familia propia del video largo de YouTube);
 *  · UNA voz de gancho por video en el pedido de cada turno; la plantilla sembrada es la que produce el código; el concepto de gasto `video` entra al libro;
 *  · la puerta: un sobre de video sin sala activa NO va a la pasarela;
 *  · ensayo en seco de punta a punta: la hoja REAL escribe el parte, la mesa escribe el guion, el brazo simulado «filma», y la pieza cierra con mp4, guion y pie.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '@/lib/cadena/hoja'
import { BRIEF_GUIA_NO_REGLA } from '../brief'
import { leerBriefCreativo } from '@/lib/cadena/brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '@/lib/cadena/conceptos'
import type { FormatosPorRed } from '@/lib/cadena/tipos'
import { condicionesDelVideo, SI_INSTAGRAM, SI_TIKTOK_O_REELS } from '../mesa/condiciones-de-video'
import { direccionDe, especialistasPertinentes } from '../mesa/directorio'
import { AGENTE_GANCHO_DE_VIDEO, METODO_GANCHO_POR_OMISION } from '@/lib/cadena/metodos'
import { QUIEN_INTEGRA_EL_GANCHO, REGLA_DEL_GANCHO, VOZ_DEL_GANCHO, armarTarea, reglaDelGanchoPara } from '../mesa/pedidos'
import type { EstadoMesa, Tarjeta } from '../mesa/tipos'
import { abrirEncargo } from '../orquestador'
import { productoresDeLaPieza, familiaDePieza } from '../paso-jefatura'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import type { PuertoDeVideo } from '../puertos'
import { CONFIG_APAGADA, TARGET_STEP_PRODUCIR, decidirPuerta } from '../sobre'
import { CLIENTE, FOTOS, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202610312012_oficina_mesa_de_video.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', '202610312012_oficina_mesa_de_video_REVERSA.sql'), 'utf8')

// ───────────────────────── el directorio TAL COMO QUEDA tras 202610281500 + 2000 + 2008 (CC#2) + 2012 (esta)
const t = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], indicacion: string[] = []): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, indicacion, activo: true, version: 1 })
const TRAS_2008: Tarjeta[] = [
  t('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'concepto:dirige']),
  t('campaign-brief-agent', 'direccion', ['brief:dirige']),
  t('content-creator', 'miembro', ['carrusel', 'kit', 'concepto']),
  t('design-visual-storyteller', 'miembro', ['kit', 'concepto', 'carrusel', 'video']),
  t('marketing_instagram_curator', 'miembro', ['carrusel', 'kit', 'concepto:si_instagram']),
  t('carousel-designer', 'miembro', ['carrusel']),
  t('design-image-prompt-engineer', 'miembro', ['carrusel:si_imagen_generada', 'kit:si_imagen_generada']),
  t('whimsy-injector', 'miembro', ['concepto']),
  t('tiktok-strategist', 'miembro', ['concepto:si_video', 'video:si_tiktok_o_reels']),
  t('inclusive-visuals-specialist', 'miembro', ['carrusel:si_personas', 'kit:si_personas']),
  t('video-editor', 'miembro', ['concepto:si_video'], ['Un solo gancho por video: el gancho lo propone quien mide la retención; tú lo integras, nunca propones uno aparte.']),
  t('marketing_video_optimization_specialist', 'miembro', ['video'], ['Solo gancho y ritmo.']),
  t('portero', 'portero', []),
]
/** la indicación del coach en 2012 (FIRMA 01-nov): la única voz del gancho final */
export const INDICACION_COACH_2012 = 'Eres la ÚNICA voz del gancho de este video: entregas UN gancho final, no alternativas; el gancho sugerido del brief es punto de partida, no obligación. No escribes el guion entero, no eliges la dirección visual y no tocas el pedido al generador: eso es de quien edita el video, que integra tu gancho como primer plano.'
export const INDICACION_VIDEO_EDITOR_2012 = 'Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone el coach de video corto (marketing_short_video_editing_coach); tú lo integras como primer plano, nunca propones uno aparte.'
/** lo que hacen los UPDATE + el INSERT de 202610312012 (con la FIRMA 01-nov: el coach entra como única voz del gancho; la retención pasa al video largo) */
export const TRAS_2012: Tarjeta[] = [
  ...TRAS_2008.map((x) =>
    x.agente === 'creative-director-mesa' ? { ...x, pertinente_en: [...x.pertinente_en, 'video:dirige'] }
    : x.agente === 'video-editor' ? { ...x, pertinente_en: [...x.pertinente_en, 'video'], indicacion: [INDICACION_VIDEO_EDITOR_2012] }
    : x.agente === 'content-creator' ? { ...x, pertinente_en: [...x.pertinente_en, 'video'] }
    : x.agente === 'marketing_instagram_curator' ? { ...x, pertinente_en: [...x.pertinente_en, 'video:si_instagram'] }
    : x.agente === 'marketing_video_optimization_specialist' ? { ...x, pertinente_en: x.pertinente_en.map((p) => (p === 'video' ? 'video_largo' : p)) }
    : x),
  t('marketing_short_video_editing_coach', 'miembro', ['video'], [INDICACION_COACH_2012]),
]
/** el mismo estado con que la sala abre una mesa (copia local: `estadoInicialDeLaMesa` no es pública) */
const estadoInicialDeLaMesa = (tipo: EstadoMesa['tipo'], directorio: Tarjeta[]): EstadoMesa => ({ tipo, directorio_congelado: directorio.filter((t) => t.activo), direccion: direccionDe(directorio, tipo)?.agente ?? '', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null })

describe('las condiciones del video salen del brief de la hoja', () => {
  it('Instagram + reel ⇒ si_instagram y si_tiktok_o_reels; TikTok ⇒ solo si_tiktok_o_reels; YouTube short ⇒ ninguna; Facebook reel ⇒ solo reels', () => {
    expect(condicionesDelVideo({ red: 'Instagram', formato: 'reel' })).toEqual([SI_INSTAGRAM, SI_TIKTOK_O_REELS])
    expect(condicionesDelVideo({ red: 'ig', formato: 'Reel' })).toEqual([SI_INSTAGRAM, SI_TIKTOK_O_REELS])
    expect(condicionesDelVideo({ red: 'TikTok', formato: 'video' })).toEqual([SI_TIKTOK_O_REELS])
    expect(condicionesDelVideo({ red: 'YouTube', formato: 'short' })).toEqual([])
    expect(condicionesDelVideo({ red: 'youtube', formato: 'video' })).toEqual([])
    expect(condicionesDelVideo({ red: 'Facebook', formato: 'reel' })).toEqual([SI_TIKTOK_O_REELS])
    expect(condicionesDelVideo({ red: '', formato: '' })).toEqual([])
  })
})

describe('el equipo de la mesa de video es dato del directorio (2008 + 2012)', () => {
  it('antes de 2012 NADIE dirige el video (la dirección creativa ya tiene tipos propios: no es el respaldo genérico); con 2012 la dirección es explícita (`video:dirige`)', () => {
    expect(direccionDe(TRAS_2008, 'video')).toBeNull()
    expect(direccionDe(TRAS_2012, 'video')?.agente).toBe('creative-director-mesa')
    expect(direccionDe(TRAS_2012, 'brief')?.agente).toBe('campaign-brief-agent')
  })
  it('fijos: guion (video-editor), pie (content-creator), storyboard (design-visual-storyteller), el coach (gancho); condicionales: curador solo si_instagram, TikTok solo si_tiktok_o_reels; la retención NO (video largo)', () => {
    expect(especialistasPertinentes(TRAS_2012, 'video', false, []).sort()).toEqual(['content-creator', 'design-visual-storyteller', 'marketing_short_video_editing_coach', 'video-editor'])
    expect(especialistasPertinentes(TRAS_2012, 'video', false, [SI_INSTAGRAM]).sort()).toEqual(['content-creator', 'design-visual-storyteller', 'marketing_instagram_curator', 'marketing_short_video_editing_coach', 'video-editor'])
    expect(especialistasPertinentes(TRAS_2012, 'video', false, [SI_INSTAGRAM, SI_TIKTOK_O_REELS]).sort()).toEqual(['content-creator', 'design-visual-storyteller', 'marketing_instagram_curator', 'marketing_short_video_editing_coach', 'tiktok-strategist', 'video-editor'])
    // la retención aporta en el video largo (familia propia, FIRMA 01-nov); el analista de mercado no (FIRMA 5); nadie de carrusel se cuela; whimsy en video queda pendiente (CC#2 2013 cubre carrusel y kit)
    for (const a of especialistasPertinentes(TRAS_2012, 'video', true, [SI_INSTAGRAM, SI_TIKTOK_O_REELS])) expect(['carousel-designer', 'design-image-prompt-engineer', 'inclusive-visuals-specialist', 'whimsy-injector', 'market_research_analyst', 'marketing_video_optimization_specialist']).not.toContain(a)
    expect(TRAS_2012.find((x) => x.agente === 'marketing_video_optimization_specialist')!.pertinente_en).toEqual(['video_largo'])
    // antes de 2012 el video no tenía ni guion ni pie: la migración es necesaria
    expect(especialistasPertinentes(TRAS_2008, 'video', false, [SI_INSTAGRAM]).sort()).toEqual(['design-visual-storyteller', 'marketing_video_optimization_specialist'])
  })
  it('la migración hace esos UPDATE aditivos (array_append con guarda), mueve la retención a video_largo, siembra al coach (ON CONFLICT DO NOTHING) y corrige la indicación de video-editor; nada destructivo', () => {
    expect(SQL).toMatch(/array_append\(pertinente_en, 'video:dirige'\)[\s\S]*WHERE agente = 'creative-director-mesa' AND NOT \('video:dirige' = ANY\(pertinente_en\)\)/)
    expect(SQL).toMatch(/array_append\(pertinente_en, 'video'\)[\s\S]*WHERE agente IN \('video-editor', 'content-creator'\) AND NOT \('video' = ANY\(pertinente_en\)\)/)
    expect(SQL).toMatch(/array_append\(pertinente_en, 'video:si_instagram'\)[\s\S]*WHERE agente = 'marketing_instagram_curator' AND NOT \('video:si_instagram' = ANY\(pertinente_en\)\)/)
    // FIRMA 01-nov
    expect(SQL).toMatch(/array_replace\(pertinente_en, 'video', 'video_largo'\)[^\n]*\n\s+WHERE agente = 'marketing_video_optimization_specialist' AND 'video' = ANY\(pertinente_en\)/)
    expect(SQL).toMatch(/INSERT INTO public\.oficina_directorio \(agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en, indicacion\) VALUES\s+\(\$d\$marketing_short_video_editing_coach\$d\$, \$d\$miembro\$d\$/)
    expect(SQL).toContain(`ARRAY[$d$${INDICACION_COACH_2012}$d$`)
    // R19 (certificación CC3): el coach se sienta en `video` (no en otra pieza); R29: la dirección del video se cuenta por `video:dirige`
    expect(SQL).toContain(`ARRAY[$d$video$d$],\n    ARRAY[$d$${INDICACION_COACH_2012}$d$`)
    expect(SQL).toMatch(/SELECT count\(\*\) INTO d FROM public\.oficina_directorio WHERE activo AND rol = 'direccion' AND 'video:dirige' = ANY\(pertinente_en\);/)
    expect(SQL).toContain(`$d$${INDICACION_VIDEO_EDITOR_2012}$d$), actualizado_en = now()\n  WHERE agente = 'video-editor'`)
    expect(SQL.match(/UPDATE public\.oficina_directorio/g)).toHaveLength(5)
    expect(SQL.match(/INSERT INTO public\.oficina_directorio/g)).toHaveLength(1)
    expect(SQL).toMatch(/ON CONFLICT \(agente\) DO NOTHING/)
    expect(SQL).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/)
    expect(SQL).toMatch(/IF d <> 1 THEN/); expect(SQL).toMatch(/IF m <> 6 THEN/); expect(SQL).toMatch(/IF p <> 1 THEN/); expect(SQL).toMatch(/IF r <> 1 THEN/); expect(SQL).toMatch(/IF v <> 1 THEN/)
    expect(TRAS_2012.filter((x) => x.rol === 'miembro' && x.pertinente_en.some((p) => p.split(':')[0] === 'video'))).toHaveLength(6)
    expect((TRAS_2012.find((x) => x.agente === 'video-editor')!.indicacion ?? []).join(' ')).not.toMatch(/quien mide la retención/)
  })
  it('la jefatura del video revisa texto, etiquetas y guion con sus productores (content-creator y video-editor)', () => {
    expect(familiaDePieza(VIDEO_MESA)).toBe('video')
    expect(productoresDeLaPieza('video')).toEqual([{ donde: 'texto', agente: 'content-creator' }, { donde: 'hashtags', agente: 'content-creator' }, { donde: 'guion', agente: 'video-editor' }])
  })
})

describe('UNA voz de gancho por video (auditoría 5)', () => {
  const est: EstadoMesa = { ...estadoInicialDeLaMesa('video', TRAS_2012), condiciones: [SI_INSTAGRAM, SI_TIKTOK_O_REELS] }
  const c = { cliente_nombre: 'Cliente', tipo: 'video' as const, brief_id: 'F1-S1-ig-r1', brief_texto: '### F1-S1-ig-r1 · Instagram · reel\n- QUÉ ES: reel', manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 }
  const tarea = (tipo: 'dirigir' | 'aportar' | 'responder' | 'integrar', agente: string) => armarTarea({ tipo, agente, tarjeta: TRAS_2012.find((x) => x.agente === agente), est, libro: [], c, pedido: tipo === 'responder' ? { id: 'a-1', encargo_id: 'e', n: 1, de: 'creative-director-mesa', para: agente, tipo: 'pide', texto: '¿gancho?', refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null, creado_en: '' } : undefined })
  it('la voz del gancho es el coach de video corto (FIRMA 01-nov: la misma voz que la cadena fijó el 31-oct); quien integra es video-editor', () => {
    expect(VOZ_DEL_GANCHO).toBe('marketing_short_video_editing_coach')
    expect(VOZ_DEL_GANCHO).toBe(AGENTE_GANCHO_DE_VIDEO)
    expect(QUIEN_INTEGRA_EL_GANCHO).toBe('video-editor')
    expect(REGLA_DEL_GANCHO).toMatch(/UNA sola voz de gancho por video/)
  })
  it('al coach se le pide UN gancho final con su método (la única voz); a video-editor, integrarlo sin proponer otro; a los demás, no proponer gancho', () => {
    expect(tarea('aportar', VOZ_DEL_GANCHO)).toContain('Eres la ÚNICA voz del gancho de este video')
    expect(tarea('aportar', VOZ_DEL_GANCHO)).toContain(METODO_GANCHO_POR_OMISION)
    expect(tarea('aportar', VOZ_DEL_GANCHO)).toContain('El GANCHO SUGERIDO del brief es un punto de partida que puedes mejorar, no una obligación')
    expect(tarea('aportar', QUIEN_INTEGRA_EL_GANCHO)).toContain('El gancho NO lo propones tú')
    // A12 (certificación CC3): la otra mitad de «una sola voz»: al guionista se le prohíbe escribir un gancho alternativo y se le dice de quién es
    expect(tarea('aportar', QUIEN_INTEGRA_EL_GANCHO)).toContain('Nunca escribas un gancho alternativo')
    expect(tarea('aportar', QUIEN_INTEGRA_EL_GANCHO)).toContain(`lo propone ${VOZ_DEL_GANCHO}`)
    expect(tarea('responder', QUIEN_INTEGRA_EL_GANCHO)).toContain('Nunca escribas un gancho alternativo')
    expect(tarea('aportar', VOZ_DEL_GANCHO)).toContain('Un solo gancho final, no alternativas')
    // nadie más recibe el método del gancho
    expect(tarea('aportar', QUIEN_INTEGRA_EL_GANCHO)).not.toContain(METODO_GANCHO_POR_OMISION)
    expect(tarea('aportar', 'tiktok-strategist')).not.toContain(METODO_GANCHO_POR_OMISION)
    expect(tarea('aportar', 'tiktok-strategist')).toContain('No propongas un gancho')
    expect(tarea('aportar', 'content-creator')).toContain('No propongas un gancho')
    expect(tarea('responder', 'tiktok-strategist')).toContain(reglaDelGanchoPara('tiktok-strategist'))
    // la dirección pide el gancho, no lo propone; la integración lleva la regla y la convención dice que el Plano 1 es el único gancho
    expect(tarea('dirigir', 'creative-director-mesa')).toContain('Tú no propones el gancho')
    expect(tarea('integrar', 'creative-director-mesa')).toContain(REGLA_DEL_GANCHO)
    expect(tarea('integrar', 'creative-director-mesa')).toMatch(/El Plano 1 es el gancho y hay UNO solo/)
  })
  it('las mesas que no son de video no reciben la regla del gancho (no cambia carrusel, kit, brief ni concepto)', () => {
    for (const tipo of ['carrusel', 'kit', 'brief', 'concepto'] as const) {
      const e2: EstadoMesa = estadoInicialDeLaMesa(tipo, TRAS_2012)
      const txt = armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: undefined, est: e2, libro: [], c: { ...c, tipo } })
      expect(txt).not.toContain('voz de gancho'); expect(txt).not.toContain('No propongas un gancho')
    }
  })
})

const PASOS_DE_LA_MIRADA = ['cuadros_video', 'mirar_video']
describe('la plantilla video_mesa y el gasto `video` como dato', () => {
  const filaDe = (tipo: string) => {
    const i = SQL.indexOf(`'${tipo}', '${tipo}'`)
    expect(i).toBeGreaterThan(0)
    const resto = SQL.slice(i)
    const toma = (m: string) => JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(resto)![1])
    return { pasos: toma('pasos'), indicaciones: toma('ind'), limites: toma('lim') }
  }
  it('el dato sembrado es EXACTAMENTE el que produce el código, INACTIVA y con tope 10', () => {
    const f = filaDe('video_mesa')
    // 202611111700 · la vuelta del pedido a la mesa se agrega DESPUÉS, al paso del índice 2
    const MIG_1700 = fs.readFileSync(path.join(RAIZ, 'migrations', '202611111700_oficina_video_vuelve_a_la_mesa.sql'), 'utf8')
    const vuelta = JSON.parse(/\$vuelta\$([\s\S]*?)\$vuelta\$/.exec(MIG_1700)![1])
    // CC6 · la migración escribe la vuelta EXACTAMENTE en el paso del índice 2 (el que esta prueba injerta), y lo exige con la guarda
    expect(MIG_1700).toContain("jsonb_set(pasos, '{2,vuelve_a}', $vuelta$")
    expect(MIG_1700).toContain("pasos->2->>'clave' = 'pedido'")
    expect(f.pasos[2].clave).toBe('pedido')
    f.pasos[2] = { ...f.pasos[2], vuelve_a: vuelta }
    // 11-nov · y el código de hoy suma los 2 pasos de la mirada (202611111730, ver `mirar-el-video.test.ts`); fuera de ellos es idéntica
    expect(f.pasos).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.pasos.filter((p) => !PASOS_DE_LA_MIRADA.includes(p.clave)))))
    // 11-nov · la indicación de quien mira el video llega con 202611111730 (la siembra de 2012 no tenía ninguna)
    expect(f.indicaciones).toEqual({})
    expect(Object.keys(VIDEO_MESA.indicaciones)).toEqual(['video-editor'])
    expect(f.limites).toEqual(JSON.parse(JSON.stringify(VIDEO_MESA.limites)))
    expect(SQL).toMatch(/2, 10\.00, false\s*\) ON CONFLICT \(tipo\) DO NOTHING/)
    expect(VIDEO_MESA.pasos.map((p) => p.clave)).toEqual(['abrir', 'mesa', 'pedido', 'video', 'cuadros_video', 'mirar_video', 'chequeos', 'jefatura', 'chequeos_2', 'entrega', 'cierre'])
  })
  it('el CHECK de oficina_gastos admite `video` (lo que cobra el brazo entra al libro) y la reversa lo devuelve', () => {
    expect(SQL).toMatch(/ADD CONSTRAINT oficina_gastos_concepto_valido CHECK \(concepto IN \('modelo', 'revisor_externo', 'imagen', 'portero', 'video'\)\)/)
    expect(REVERSA).toMatch(/ADD CONSTRAINT oficina_gastos_concepto_valido CHECK \(concepto IN \('modelo', 'revisor_externo', 'imagen', 'portero'\)\)/)
    expect(REVERSA).toMatch(/WHERE concepto = 'video'\) THEN RAISE EXCEPTION/)
  })
  it('la reversa quita solo lo de 2012 (no lo de 2008), devuelve la retención a video, borra al coach, restaura la indicación de video-editor y se niega con encargos de video', () => {
    expect(REVERSA).toMatch(/array_remove\(pertinente_en, 'video:dirige'\)[^\n]*WHERE agente = 'creative-director-mesa'/)
    expect(REVERSA).toMatch(/array_remove\(pertinente_en, 'video'\)[^\n]*WHERE agente IN \('video-editor', 'content-creator'\)/)
    expect(REVERSA).toMatch(/array_remove\(pertinente_en, 'video:si_instagram'\)[^\n]*WHERE agente = 'marketing_instagram_curator'/)
    expect(REVERSA).toMatch(/array_replace\(pertinente_en, 'video_largo', 'video'\)[^\n]*WHERE agente = 'marketing_video_optimization_specialist'/)
    expect(REVERSA).toMatch(/DELETE FROM public\.oficina_directorio WHERE agente = 'marketing_short_video_editing_coach'/)
    expect(REVERSA).toContain(`$d$${INDICACION_VIDEO_EDITOR_2012}$d$,\n  $d$Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone quien mide la retención; tú lo integras, nunca propones uno aparte.$d$`)
    const sentencias = REVERSA.split('\n').filter((l) => !l.startsWith('--')).join('\n')
    expect(sentencias).not.toMatch(/design-visual-storyteller|tiktok-strategist|whimsy-injector/)
    expect(REVERSA).toMatch(/DELETE FROM public\.oficina_tipos_de_grupo WHERE tipo = 'video_mesa'/)
    expect(REVERSA).toMatch(/familia = 'video_mesa'\) THEN RAISE EXCEPTION/)
  })
})

describe('la puerta: el video no tiene pasarela', () => {
  const sobre = { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }
  it('la clase video (dato de la plantilla) no tiene pasarela; apagada, no activa o cliente fuera del ensayo ⇒ sin_sala (no pasarela); activa ⇒ abre', () => {
    expect(decidirPuerta(sobre, CONFIG_APAGADA, TARGET_STEP_PRODUCIR, 'c1', true)).toEqual({ accion: 'sin_sala', familia: 'video_mesa', motivo: 'oficina_apagada' })
    expect(decidirPuerta(sobre, { estado: 'encendida', familias_activas: ['carrusel_mesa'], clientes_ensayo: [] }, TARGET_STEP_PRODUCIR, 'c1', true)).toEqual({ accion: 'sin_sala', familia: 'video_mesa', motivo: 'familia_no_activa' })
    expect(decidirPuerta(sobre, { estado: 'ensayo', familias_activas: ['video_mesa'], clientes_ensayo: ['otro'] }, TARGET_STEP_PRODUCIR, 'c1', true)).toEqual({ accion: 'sin_sala', familia: 'video_mesa', motivo: 'cliente_fuera_del_ensayo' })
    expect(decidirPuerta(sobre, { estado: 'encendida', familias_activas: ['video_mesa'], clientes_ensayo: [] }, TARGET_STEP_PRODUCIR, 'c1', true)).toEqual({ accion: 'abrir', familia: 'video_mesa' })
    // las de siempre no cambian
    expect(decidirPuerta({ ...sobre, familia: 'carrusel_mesa' }, CONFIG_APAGADA, TARGET_STEP_PRODUCIR, 'c1')).toEqual({ accion: 'pasarela', motivo: 'oficina_apagada' })
  })
  it('la ruta contesta 409 `sin_sala` con `sin_pasarela: true`; con la plantilla inactiva, 409 `plantilla_inactiva` también marcado', async () => {
    const M = crearMemoria({ plantilla: VIDEO_MESA, config: { familias_activas: [] } })
    const r1 = await abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(r1.status).toBe(409)
    expect(r1.cuerpo).toMatchObject({ error: 'sin_sala', familia: 'video_mesa', motivo: 'familia_no_activa', sin_pasarela: true })
    expect(M.encargos.size).toBe(0)
    const M2 = crearMemoria({ plantilla: VIDEO_MESA })
    M2.plantilla!.activo = false
    const r2 = await abrirEncargo(M2.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(r2.status).toBe(409)
    expect(r2.cuerpo).toMatchObject({ error: 'plantilla_inactiva', familia: 'video_mesa', sin_pasarela: true })
  })
})

// ───────────────────────── ENSAYO EN SECO de punta a punta: hoja real → mesa de video → brazo simulado → entrega
const FORMATOS: FormatosPorRed = { instagram: [{ formato: 'reel', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia: 'video_mesa' }] }
const BRIEF_CREATIVO = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el barrio sepa que la cocina abre temprano».',
  '## Insight', 'La gente desayuna de pie.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', '30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: delicioso', '- lo que no se dice: precios',
  '## Faltantes', '- público: sin edades en el manual',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: '## Fase 1\nObjetivo: que el barrio sepa que la cocina abre temprano.', prohibidas: ['delicioso'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'instagram', huecos_por_semana: 1 }], prohibidas: ['delicioso'], fotos: [FOTOS[0].id] }
const CONCEPTO = leerConcepto([
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Capítulo F1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «que el barrio sepa» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  `- C1-I01 · instagram · reel · el pan sale del horno · mensaje: la mesa se llena de a poco · gancho: el vapor del pan · protagonista: el pan · serie: ninguna · foto:${FOTOS[0].id}`,
].join('\n'), INS_C)
const FILA: FilaDeHoja = { id: 'F1-S1-ig-r1', fecha: '2026-11-12', hora: '09:00', red: 'instagram', formato: 'reel', pilar: 'producto', tema: 'el pan sale del horno', datos: [], fase: 'F1', idea_ref: 'C1-I01' }
const INSUMOS: InsumosDeLaHoja = { client_name: 'Cliente de práctica', plan_id: '29d6daeb-a95a-4328-9c10-cf3cddc236f7', manual_version: 1, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46', brief: BRIEF_CREATIVO, brief_id: 'brf-abc-v1', concepto: CONCEPTO, concepto_id: 'con-abc-v1', filas: [FILA], formatos: FORMATOS }

const GUION = (citas: string) => [
  '## Plano 1 · 0–3 s', `Se ve: el pan de masa madre recién salido del horno, el vapor sube sobre la mesa larga`, 'Movimiento: acercamiento lento', `Foto: foto:${FOTOS[0].id}`,
  '## Plano 2 · 3–12 s', 'Se ve: una mano parte el pan y lo deja en la mesa larga vacía, luz de la mañana', 'Movimiento: cámara fija', 'Texto en pantalla: Hay mesa desde las siete', 'Foto: ninguna',
  '## Audio', 'ambiente de cocina, sin voz',
  '## Pie', 'Hay mesa desde las siete. Ven a desayunar pan de masa madre en la mesa larga.',
  '## Etiquetas', '#desayuno #masamadre',
  '## Citas', citas,
].join('\n')

function brazoSimulado(registro: Array<Record<string, unknown>>): PuertoDeVideo {
  return {
    enviar: async (p) => { registro.push(p as unknown as Record<string, unknown>); return { ok: true, request_id: `req-${registro.length}`, status: 'simulado', costo_estimado_usd: 2.59, costo_lista_usd: 4.9, descuento_pct: 47, simulado: p.dry_run } },
    estado: async () => ({ ok: true, simulado: true }),
  }
}

describe('ENSAYO EN SECO · la hoja real → la mesa de video → el brazo simulado → la pieza en la bandeja (simulada)', () => {
  it('el parte lo escribe la hoja; la mesa abre con si_instagram + si_tiktok_o_reels; aportan los 6; UNA voz de gancho; el guion se traduce; el brazo recibe el pedido; cierra con mp4, guion y pie', async () => {
    const hoja = escribirHoja(INSUMOS)
    expect(hoja.briefs[0]).toMatchObject({ brief_id: 'F1-S1-ig-r1', familia: 'video_mesa' })
    const M = crearMemoria({ parte: hoja.texto_md, plantilla: VIDEO_MESA })
    const MS = crearMesaEnMemoria(TRAS_2012)
    M.P.mesa = MS
    const enviados: Array<Record<string, unknown>> = []
    M.P.video = brazoSimulado(enviados)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.status).toBe(200)
    const id = String(a.cuerpo.encargo_id)
    let aportes = 0
    const { ultima, turnos } = await jugar(M, id, a, (t: Turno) => {
      if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan sale del horno y la mesa larga espera. Pido el gancho al coach y el guion a video-editor.' }
      if (t.tipo === 'aportar') { aportes++; return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho único: el vapor del pan llenando el cuadro en el primer segundo; ritmo de dos planos.' : `Aporte de ${t.agente} para el reel, sin proponer gancho.` } }
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION(Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé tal cual para el guion`).join('\n')) }
      return undefined
    })
    // el equipo: la dirección abre, los 6 aportan (curador por Instagram, TikTok por el reel), la dirección integra
    expect(turnos[0]).toMatchObject({ agente: 'creative-director-mesa', tipo: 'dirigir' })
    expect(turnos.filter((x) => x.tipo === 'aportar').map((x) => x.agente).sort()).toEqual(['content-creator', 'design-visual-storyteller', 'marketing_instagram_curator', 'marketing_short_video_editing_coach', 'tiktok-strategist', 'video-editor'])
    expect(turnos.at(-1)).toMatchObject({ agente: 'creative-director-mesa', tipo: 'integrar' })
    // una voz de gancho en el pedido de cada turno
    expect(turnos.find((x) => x.agente === VOZ_DEL_GANCHO)!.task).toContain('Eres la ÚNICA voz del gancho')
    expect(turnos.find((x) => x.agente === QUIEN_INTEGRA_EL_GANCHO)!.task).toContain('El gancho NO lo propones tú')
    expect(turnos.find((x) => x.agente === 'tiktok-strategist')!.task).toContain('No propongas un gancho')
    expect(turnos.find((x) => x.agente === QUIEN_INTEGRA_EL_GANCHO)!.task).toContain('Un solo gancho por video: el gancho lo propone el coach de video corto')
    expect(turnos.find((x) => x.agente === VOZ_DEL_GANCHO)!.task).toContain(METODO_GANCHO_POR_OMISION)
    expect(turnos.find((x) => x.agente === VOZ_DEL_GANCHO)!.task).toContain(`## 2 · El brief de este entregable (${BRIEF_GUIA_NO_REGLA})`)
    expect(turnos.find((x) => x.agente === VOZ_DEL_GANCHO)!.task).toContain('GANCHO SUGERIDO: el vapor del pan')
    // la mesa abrió con las condiciones del brief de la hoja
    const enc = M.encargos.get(id)!
    const mesa = enc.estado_del_motor.artefactos['mesa']?.datos as unknown as EstadoMesa
    expect(mesa.condiciones).toEqual([SI_INSTAGRAM, SI_TIKTOK_O_REELS])
    expect(mesa.tipo).toBe('video')
    // el brazo recibió UN pedido: reel 9:16, 12 s, con la foto propia del plano 1, y el contexto del flujo de la oficina
    expect(enviados).toHaveLength(1)
    const ped = enviados[0].pedido as Record<string, unknown>
    expect(ped).toMatchObject({ formato: 'reel', segundos: 12, relacion: '9:16', audio: true, fotos: [`https://fotos.test/${FOTOS[0].id}.jpg`], fotos_no_halladas: [] })
    expect(String(ped.prompt)).toContain('Texto en pantalla, literal: «Hay mesa desde las siete»')
    expect(enviados[0]).toMatchObject({ dry_run: true, workflow_id: 'oficina:video_mesa', client_id: CLIENTE })
    // cerró: guion, copy, pedido, video (simulado), entrega con mp4 + guion + pie; nada real
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true })
    // en la tabla de artefactos queda la salida de cada paso; el guion y el copy del video viven en el estado del motor (otros artefactos de la mesa)
    const tipos = new Set(M.artefactos.filter((x) => x.encargo_id === id).map((x) => x.tipo))
    for (const k of ['encargo', 'mesa', 'pedido_video', 'video', 'chequeos', 'entrega']) expect(tipos.has(k), k).toBe(true)
    for (const k of ['guion', 'copy_video']) expect(enc.estado_del_motor.artefactos[k], k).toBeTruthy()
    const guion = enc.estado_del_motor.artefactos['guion'].datos as { planos: unknown[]; texto: string }
    expect(guion.planos).toHaveLength(2)
    expect(guion.texto).toContain('## Plano 1 · 0–3 s')
    const video = enc.estado_del_motor.artefactos['video'].datos as Record<string, unknown>
    expect(video).toMatchObject({ simulado: true, costo_usd: 0, copia: 'simulada' })
    const entrega = enc.estado_del_motor.artefactos['entrega'].datos as { nombres: string[]; texto_para_copiar: string; simulado: boolean }
    expect(entrega.nombres.some((n) => /\.mp4$/.test(n))).toBe(true)
    expect(entrega.nombres.some((n) => /_guion\.md$/.test(n))).toBe(true)
    expect(entrega.texto_para_copiar).toContain('Hay mesa desde las siete')
    expect(M.gastos.filter((g) => g.concepto === 'video')).toHaveLength(0)
    expect(M.llamadas.salida).toBe(0); expect(M.llamadas.bandeja).toHaveLength(0); expect(M.llamadas.guardadoDeArchivos).toBe(0)
    expect(M.llamadas.imagen).toBe(0); expect(M.llamadas.render).toBe(0)
  })
  // 11-nov · GO Lenovo 03:55Z · regla #17: la proporción es UN dato (`cadena_formatos_por_red.proporcion`) que viaja tabla → hoja → brief → oficina → pedido al brazo
  it.each([
    // [caso, cliente, dato en la tabla, lo que recibe el brazo, aviso esperado: 'hoja' (dato ilegible) · 'sala' (el generador no lo admite) · null]
    ['restaurante · cuadrado', 'Cliente de práctica', '1:1', '1:1', null],
    ['B2B de seguridad industrial · vertical', 'Cliente B2B de práctica', '9:16', '9:16', null],
    ['B2B de seguridad industrial · 4:3', 'Cliente B2B de práctica', '4:3', '4:3', null],
    ['dato ilegible en la tabla ⇒ la de por omisión, con aviso en la hoja', 'Cliente de práctica', 'cuadrado', '9:16', 'hoja'],
    ['dato que el generador no admite (4:5) ⇒ la de por omisión, con aviso de la sala (nunca a escondidas)', 'Cliente B2B de práctica', '4:5', '9:16', 'sala'],
  ] as const)('🔴 regla #17 · %s: el brazo recibe la proporción de la tabla de formatos', async (_n, cliente, dato, esperada, aviso) => {
    const hoja = escribirHoja({ ...INSUMOS, client_name: cliente, formatos: { instagram: [{ ...FORMATOS.instagram[0], proporcion: dato }] } })
    expect(hoja.texto_md).toContain(aviso === 'hoja' ? 'proporción 9:16 (por omisión del formato reel)' : `proporción ${dato} (dato de la tabla de formatos para instagram · reel)`)
    expect(hoja.avisos.some((x) => /proporción «cuadrado» de instagram · reel en cadena_formatos_por_red no se puede leer · se usa 9:16/.test(x))).toBe(aviso === 'hoja')
    const M = crearMemoria({ parte: hoja.texto_md, plantilla: VIDEO_MESA })
    M.P.mesa = crearMesaEnMemoria(TRAS_2012)
    const enviados: Array<Record<string, unknown>> = []
    M.P.video = brazoSimulado(enviados)
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    let aportes = 0
    await jugar(M, String(a.cuerpo.encargo_id), a, (t: Turno) => {
      if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan sale del horno y la mesa larga espera.' }
      if (t.tipo === 'aportar') { aportes++; return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho único: el vapor del pan llenando el cuadro.' : `Aporte de ${t.agente}, sin proponer gancho.` } }
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: GUION(Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé tal cual para el guion`).join('\n')) }
      return undefined
    })
    expect(enviados).toHaveLength(1)
    expect((enviados[0].pedido as Record<string, unknown>).relacion).toBe(esperada)
    const motor = JSON.stringify(M.encargos.get(String(a.cuerpo.encargo_id))!.estado_del_motor)
    expect(motor.includes('la proporción 4:5 del brief no la admite el generador de video; se usó 9:16')).toBe(aviso === 'sala')
  })
  it('un brief que NO es de video no abre esta sala (falla visible al abrir, sin gastar)', async () => {
    const hoja = escribirHoja({ ...INSUMOS, filas: [{ ...FILA, id: 'F1-S1-ig-c1', formato: 'carrusel' }], formatos: { instagram: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 4, max_por_dia: 2, familia: 'carrusel_mesa' }] } })
    const M = crearMemoria({ parte: hoja.texto_md, plantilla: VIDEO_MESA })
    M.P.mesa = crearMesaEnMemoria(TRAS_2012)
    // GO 11-nov: la sala no adivina por el texto; la red es la tabla de formatos de la cadena (aquí: carrusel → carrusel_mesa)
    M.P.formatosDeLaCadena = async () => ({ instagram: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 4, max_por_dia: 2, familia: 'carrusel_mesa' }] })
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-c1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(String(a.cuerpo.motivo)).toMatch(/manda a la familia carrusel_mesa; esta sala es video_mesa/)
    expect(M.encargos.get(String(a.cuerpo.encargo_id))!.gasto_usd).toBe(0)
  })
  it('fila #19 (CC7) · una sala NUEVA de clase video produce el reel que la tabla manda a video_mesa (misma clase); el que manda a carrusel_mesa, no', async () => {
    const abrirCon = async (familiaDeLaTabla: string) => {
      const formatos = { instagram: [{ formato: 'reel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: familiaDeLaTabla }] }
      const hoja = escribirHoja({ ...INSUMOS, formatos } as never)
      const M = crearMemoria({ parte: hoja.texto_md, plantilla: { ...VIDEO_MESA, familia: 'reel_nuevo', tipo: 'reel_nuevo', clase: 'video' } })
      M.P.mesa = crearMesaEnMemoria(TRAS_2012)
      M.P.formatosDeLaCadena = async () => formatos as never
      return abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'reel_nuevo' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    }
    const si = await abrirCon('video_mesa')
    // la revisión de sala la deja pasar (después la mesa reconoce su tipo por nombre · FAMILIAS_MESA, fuera de la fila #19)
    expect(String(si.cuerpo.motivo ?? '')).not.toMatch(/manda a la familia/)
    const no = await abrirCon('carrusel_mesa')
    expect(no.cuerpo).toMatchObject({ estado: 'fallido' })
    expect(String(no.cuerpo.motivo)).toMatch(/manda a la familia carrusel_mesa; esta sala es reel_nuevo/)
  })
})
