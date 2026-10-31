/**
 * T8 · VIDEO SOBRE LA HOJA · lado de la CADENA (31-oct · plan v3 T8 · CC#1) · US$ 0, sin base ni red.
 *  · la única palanca es DATO: un formato `espera_brazo` SIN familia sigue naciendo `espera_video`; CON familia (`video_mesa`) es una fila más (esquema → lote → hoja);
 *  · la hoja escribe el brief de video con el encabezado que la oficina lee (`### <fila> · <Red> · reel|video|short`) y `esVideo`/`formatoDeVideo` lo leen de ahí;
 *  · la migración 202610312011 pone la familia a los 5 formatos de video y su reversa la quita.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { esVideo, formatoDeVideo } from '@/lib/oficina/video/pedido'
import { leerBriefCreativo } from '../brief-creativo'
import { leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { esperaAlBrazoSinSala, expandirPatron, idDeFila } from '../expandir-patron'
import { NOTA_DE_VIDEO_EN_LIMITES, escribirHoja, esFormatoDeVideo, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { Estrategia, FormatoPermitido, FormatosPorRed } from '../tipos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202610312011_cadena_formatos_video_mesa.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'reversas', '202610312011_cadena_formatos_video_mesa_REVERSA.sql'), 'utf8')
const VALIDADOR = fs.readFileSync(path.join(__dirname, '..', 'validador-calendario.ts'), 'utf8')

const reel = (familia: string | null): FormatoPermitido => ({ formato: 'reel', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia })
const SIN_SALA: FormatosPorRed = { instagram: [{ formato: 'foto', produccion: 'opera', lead_dias: 3, max_por_dia: 3, familia: 'post_img' }, reel(null)], tiktok: [{ formato: 'video', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 3, familia: null }] }
const CON_SALA: FormatosPorRed = { instagram: [SIN_SALA.instagram[0], reel('video_mesa')], tiktok: [{ ...SIN_SALA.tiktok[0], familia: 'video_mesa' }], youtube: [{ formato: 'short', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia: 'video_mesa' }] }
const slot = (o: Partial<Estrategia['patron_semanal'][number]>) => ({ slot: 'a', dia_semana: 1, hora: '10:00', red: 'instagram', formato: 'foto', pilar: 'p1', requiere_abierto: false, sede: '', ...o })
const camp = { fecha_inicio: '2026-10-05', fecha_fin: '2026-12-27' }

describe('la palanca es la familia del formato (dato), no el código', () => {
  it('esperaAlBrazoSinSala: espera_brazo sin familia = espera; con familia = pieza; opera nunca espera; sin formato, no', () => {
    expect(esperaAlBrazoSinSala(reel(null))).toBe(true)
    expect(esperaAlBrazoSinSala(reel(undefined as unknown as null))).toBe(true)
    expect(esperaAlBrazoSinSala(reel('video_mesa'))).toBe(false)
    expect(esperaAlBrazoSinSala({ formato: 'foto', produccion: 'opera', lead_dias: 1, max_por_dia: 1, familia: null })).toBe(false)
    expect(esperaAlBrazoSinSala(undefined)).toBe(false)
  })
  it('expandirPatron: el mismo patrón nace `espera_video` sin sala y `esquema` con sala (la foto, siempre esquema)', () => {
    const e = { patron_semanal: [slot({ slot: 'v', formato: 'reel' }), slot({ slot: 'f' }), slot({ slot: 't', red: 'tiktok', formato: 'video' })], piezas_fijas: [] }
    expect(expandirPatron(e, camp, [1], 1, SIN_SALA).map((f) => [f.id, f.estado])).toEqual([[idDeFila(1, 1, 'v'), 'espera_video'], [idDeFila(1, 1, 'f'), 'esquema'], [idDeFila(1, 1, 't'), 'espera_video']])
    expect(expandirPatron(e, camp, [1], 1, CON_SALA).map((f) => f.estado)).toEqual(['esquema', 'esquema', 'esquema'])
  })
  it('V20 del validador usa la MISMA palanca (no decide por su cuenta qué formato espera)', () => {
    expect(VALIDADOR).toMatch(/import \{ esperaAlBrazoSinSala \} from '\.\/expandir-patron'/)
    expect(VALIDADOR).toMatch(/const debeEsperar = esperaAlBrazoSinSala\(fmt\)/)
    expect(VALIDADOR).not.toMatch(/const debeEsperar = fmt\.produccion === 'espera_brazo'/)
  })
})

// ───────────────────────── la hoja escribe el brief de video que la oficina lee
const PLAN = '## Fase 1\nObjetivo: que el barrio sepa que la cocina abre temprano.'
const BRIEF = leerBriefCreativo([
  '## De qué parte del plan sale', 'Fase 1: «que el barrio sepa que la cocina abre temprano».',
  '## Insight', 'La gente desayuna de pie.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Objetivo', '30 desayunos nuevos por semana.', '- instagram: que miren el pan · «ven a desayunar»', '- tiktok: que miren · «ven»',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: delicioso', '- lo que no se dice: precios',
  '## Faltantes', '- público: sin edades en el manual',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n'), { planTexto: PLAN, prohibidas: ['delicioso'] })
const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'instagram', huecos_por_semana: 1 }, { red: 'tiktok', huecos_por_semana: 1 }], prohibidas: ['delicioso'], fotos: ['f-01'] }
const CONCEPTO = leerConcepto([
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Capítulo F1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «que el barrio sepa» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · reel · el pan sale del horno · mensaje: la mesa se llena de a poco · gancho: el vapor del pan · protagonista: el pan · serie: ninguna · foto:f-01',
  '- C1-I02 · tiktok · video · la mesa a las 7 · mensaje: hay una silla para ti · gancho: la silla vacía · protagonista: la mesa · serie: ninguna · foto:ninguna',
].join('\n'), INS_C)
const fila = (o: Partial<FilaDeHoja> & { id: string }): FilaDeHoja => ({ fecha: '2026-11-12', hora: '09:00', red: 'instagram', formato: 'reel', pilar: 'producto', tema: 'el pan sale del horno', datos: [], fase: 'F1', idea_ref: 'C1-I01', ...o })
const INS = (filas: FilaDeHoja[], formatos: FormatosPorRed = CON_SALA): InsumosDeLaHoja => ({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 3, manual_id: 'man-1', hoy: '2026-10-31', lote_key: '2026-W46',
  brief: BRIEF, brief_id: 'brf-abc-v1', concepto: CONCEPTO, concepto_id: 'con-abc-v1', filas, formatos,
})

describe('la hoja escribe el brief de video y la oficina lo reconoce como video', () => {
  it('un reel de Instagram: `### <fila> · Instagram · reel`, familia video_mesa, LÍMITES declara el video corto; parsearBrief + esVideo + formatoDeVideo lo leen', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-r1' })]))
    expect(h.briefs).toEqual([expect.objectContaining({ brief_id: 'F1-S1-ig-r1', familia: 'video_mesa', red: 'instagram', formato: 'reel', idea_ref: 'C1-I01' })])
    expect(h.texto_md).toContain('### F1-S1-ig-r1 · Instagram · reel')
    expect(h.texto_md).toContain(`proporción 9:16 (por omisión del formato reel) · ${NOTA_DE_VIDEO_EN_LIMITES}`)
    expect(h.avisos.filter((a) => /sin familia/.test(a))).toEqual([])
    const b = parsearBrief(h.texto_md, 'F1-S1-ig-r1')!
    expect(b).toBeTruthy()
    expect(esVideo(b)).toBe(true)
    expect(formatoDeVideo(b)).toBe('reel')
    expect(b.red).toBe('Instagram')
    expect(b.texto).toContain('GANCHO: el vapor del pan')
  })
  it('un video de TikTok se lee como formato `tiktok` del brazo; un short de YouTube como `short`; una foto NO es video', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-tt-v1', red: 'tiktok', formato: 'video', idea_ref: 'C1-I02' }), fila({ id: 'F1-S1-yt-s1', red: 'youtube', formato: 'short', idea_ref: null }), fila({ id: 'F1-S1-ig-f1', formato: 'foto', idea_ref: null })]))
    expect(h.briefs.map((b) => [b.brief_id, b.familia])).toEqual([['F1-S1-ig-f1', 'post_img'], ['F1-S1-tt-v1', 'video_mesa'], ['F1-S1-yt-s1', 'video_mesa']])
    expect(formatoDeVideo(parsearBrief(h.texto_md, 'F1-S1-tt-v1')!)).toBe('tiktok')
    expect(formatoDeVideo(parsearBrief(h.texto_md, 'F1-S1-yt-s1')!)).toBe('short')
    expect(esVideo(parsearBrief(h.texto_md, 'F1-S1-ig-f1')!)).toBe(false)
    expect(h.texto_md.split('### F1-S1-ig-f1')[1].split('###')[0]).not.toContain(NOTA_DE_VIDEO_EN_LIMITES)
  })
  it('sin la migración (familia nula) la hoja lo declara: «sin familia … el sobre saldrá sin sala»; el brief igual es legible', () => {
    const h = escribirHoja(INS([fila({ id: 'F1-S1-ig-r1' })], SIN_SALA))
    expect(h.briefs[0].familia).toBeNull()
    expect(h.avisos).toContainEqual(expect.stringMatching(/F1-S1-ig-r1: instagram · reel sin familia en cadena_formatos_por_red/))
    expect(esVideo(parsearBrief(h.texto_md, 'F1-S1-ig-r1')!)).toBe(true)
  })
  it('esFormatoDeVideo coincide con lo que `esVideo` acepta: reel, short, video, tiktok; no carrusel ni historia', () => {
    for (const f of ['reel', 'short', 'video', 'tiktok', 'Reel']) expect(esFormatoDeVideo(f)).toBe(true)
    for (const f of ['carrusel', 'historia', 'foto', 'estado', 'anuncio_imagen']) expect(esFormatoDeVideo(f)).toBe(false)
  })
})

describe('la migración 202610312011 y su reversa', () => {
  it('pone familia video_mesa SOLO a los formatos espera_brazo (reel · video · short) con familia nula; idempotente; guardas de conteo', () => {
    expect(SQL).toMatch(/UPDATE public\.cadena_formatos_por_red\s+SET familia = 'video_mesa'\s+WHERE familia IS NULL\s+AND produccion = 'espera_brazo'\s+AND formato IN \('reel', 'video', 'short'\)/)
    expect(SQL).toMatch(/IF n < 5 THEN RAISE EXCEPTION/)
    expect(SQL).toMatch(/IF sin_sala <> 0 THEN RAISE EXCEPTION/)
    expect(SQL).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE|INSERT INTO)\b/i)
    expect(SQL).toMatch(/NOTIFY pgrst, 'reload schema'/)
    expect(SQL).toMatch(/NO APLICADA/)
  })
  it('la reversa devuelve familia NULL solo a video_mesa y se niega con encargos de video en curso', () => {
    expect(REVERSA).toMatch(/UPDATE public\.cadena_formatos_por_red SET familia = NULL WHERE familia = 'video_mesa'/)
    expect(REVERSA).toMatch(/familia = 'video_mesa' AND estado IN \('abierto', 'en_paso'\)/)
    expect(REVERSA).not.toMatch(/DROP COLUMN/)
  })
  it('el sello 2011 es único entre las migraciones del 31-oct', () => {
    const sellos = fs.readdirSync(path.join(RAIZ, 'migrations')).filter((f) => f.startsWith('20261031')).map((f) => f.slice(0, 12))
    expect(sellos.filter((s) => s === '202610312011')).toHaveLength(1)
    expect(sellos.filter((s) => s === '202610312012')).toHaveLength(1)
  })
})
