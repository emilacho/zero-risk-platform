/**
 * La identidad visual del cliente para las láminas (21-oct · ENCARGO «manual visual con todas las fuentes», puntos 6 y 7):
 *  ⑥ UN solo lugar: el bloque visual del manual (`visual.capa_grafica`); las columnas viejas y la ficha, solo de respaldo.
 *  ⑦ PRE-VUELO en la puerta: sin identidad visual legible o sin slug NO se crea el encargo de láminas (409 con el motivo); lo demás (post_img, una lectura que falla) no se frena.
 * Caso de la tercera prueba (df7e47cc): ficha solo con Instagram ⇒ manual con paleta vacía ⇒ antes 3 encargos `fallido` a los 3 s; ahora el pre-vuelo.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bloqueVisualDelManual, esFamiliaDeLaminas, identidadVisualDelCliente, previueloDeLaminas } from '../identidad-visual'
import { marcaDelCliente } from '../adaptadores'
import { familiaDeLaminas } from '../orquestador-laminas'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const bloque = (capa: Record<string, unknown>) => JSON.stringify({ visual: { version: 1, capa_grafica: capa } })
const manualCon = (capa: Record<string, unknown> | null, columnas: Record<string, unknown> = {}) => ({ content_text: capa ? bloque(capa) : '{}', ...columnas })
const HEX = { principal: '#1a0828', secundario: '#2d1135', acento: '#51d4b4' }

describe('⑥ el bloque visual del manual es la fuente; lo viejo es respaldo', () => {
  it('lee la paleta del bloque ordenada por rol (principal · secundario · acento), sin importar cómo vengan', () => {
    const m = identidadVisualDelCliente(manualCon({ paleta: [{ color: HEX.acento, rol: 'acento' }, { color: HEX.principal, rol: 'principal' }, { color: HEX.secundario, rol: 'Secundario' }] }), {}, [])
    expect(m.marca?.colors).toEqual({ primary: HEX.principal, secondary: HEX.secundario, accent: HEX.acento }); expect(m.procedencia.colores).toBe('bloque_visual'); expect(m.motivo).toBeNull()
  })
  it('sin roles respeta el orden en que vienen; mezcla colores sin rol; descarta lo que no es un color de verdad y repetidos; acepta #abc', () => {
    const m = identidadVisualDelCliente(manualCon({ paleta: ['rojo', { color: 'url(x)' }, '#12', { color: '#ABC' }, { hex: '#445566' }, '#abc', { color: '#778899', rol: 'acento' }] }), {}, [])
    expect(m.marca?.colors).toEqual({ primary: '#778899', secondary: '#ABC', accent: '#445566' })
  })
  it('un color con rol NULL (el modelo no eligió) no gana por posición: el principal se escoge por rol', () => {
    const m = identidadVisualDelCliente(manualCon({ paleta: [{ color: '#aaaaaa', rol: null }, { color: '#bbbbbb', rol: 'principal', estado: 'declarado' }, { color: '#cccccc' }] }), {}, [])
    expect(m.marca?.colors).toEqual({ primary: '#bbbbbb', secondary: '#aaaaaa', accent: '#cccccc' })
  })
  it('un color observado marcado PROPUESTA (material real con procedencia) también cuenta: la marca no inventa, pero tampoco exige que sea «declarado»', () => {
    const m = identidadVisualDelCliente(manualCon({ paleta: [{ color: '#d4622a', rol: 'principal', procedencia: 'foto 3 del feed', estado: 'PROPUESTA' }] }), {}, [])
    expect(m.marca?.colors.primary).toBe('#d4622a')
  })
  it('las COLUMNAS del manual mandan cuando están llenas (así un cliente que ya funciona no cambia); el bloque cubre lo que falta; la ficha va al final; cada cosa por separado', () => {
    const capa = { paleta: [{ color: HEX.principal, rol: 'principal' }], tipografias: [{ nombre: 'Caveat', rol: 'titulos' }, { nombre: 'Inter', rol: 'cuerpo' }], logo_url: 'https://logo.test/bloque.png' }
    const ficha = { brand_colors: ['#222222'], brand_fonts: ['Bebas'], logo_url: 'https://logo.test/ficha.png' }
    const a = identidadVisualDelCliente(manualCon(capa, { primary_colors: ['#111111'], typography: ['Otra'] }), ficha, [])
    expect(a.marca).toEqual({ colors: { primary: '#111111' }, fonts: { family: 'Otra' }, logo_url: 'https://logo.test/ficha.png' })
    expect(a.procedencia).toEqual({ colores: 'manual', tipografias: 'manual', logo: 'ficha' })
    // colores en las columnas, tipografías vacías: las tipografías salen del bloque (con sus roles), los colores de las columnas
    const b = identidadVisualDelCliente(manualCon(capa, { primary_colors: ['#111111'], typography: [] }), {}, [])
    expect(b.marca).toEqual({ colors: { primary: '#111111' }, fonts: { family: 'Inter', headline_family: 'Caveat' }, logo_url: 'https://logo.test/bloque.png' })
    expect(b.procedencia).toEqual({ colores: 'manual', tipografias: 'bloque_visual', logo: 'bloque_visual' })
    // sin columnas: todo del bloque, y el bloque va ANTES que la ficha
    const c = identidadVisualDelCliente(manualCon(capa), ficha, [])
    expect(c.marca?.colors).toEqual({ primary: HEX.principal }); expect(c.marca?.fonts).toEqual({ family: 'Inter', headline_family: 'Caveat' }); expect(c.procedencia).toEqual({ colores: 'bloque_visual', tipografias: 'bloque_visual', logo: 'ficha' })
  })
  it('columnas del manual con objetos que traen ROL (como las escribe el piso visual con todas las fuentes): principal primero y tipografías por rol; en texto plano, por orden como siempre', () => {
    const a = identidadVisualDelCliente({ primary_colors: [{ hex: '#333333', rol: 'acento', procedencia: 'foto 2', estado: 'propuesta' }, { hex: '#111111', rol: 'principal', estado: 'propuesta' }, { hex: '#222222', rol: 'secundario' }], typography: [{ family: 'Caveat', rol: 'titulos', estado: 'propuesta' }, { family: 'Inter', rol: 'cuerpo' }] }, {}, [])
    expect(a.marca).toEqual({ colors: { primary: '#111111', secondary: '#222222', accent: '#333333' }, fonts: { family: 'Inter', headline_family: 'Caveat' } }); expect(a.procedencia).toMatchObject({ colores: 'manual', tipografias: 'manual' })
    const b = identidadVisualDelCliente({ primary_colors: ['#333333', '#111111'], typography: ['Caveat', 'Inter'] }, {}, [])
    expect(b.marca).toEqual({ colors: { primary: '#333333', secondary: '#111111' }, fonts: { family: 'Caveat', headline_family: 'Inter' } })
    // y los repetidos de las columnas NO se quitan (comportamiento de siempre)
    expect(identidadVisualDelCliente({ primary_colors: ['#111111', '#111111', '#222222'] }, {}, []).marca?.colors).toEqual({ primary: '#111111', secondary: '#111111', accent: '#222222' })
  })
  it('los colores repetidos del bloque cuentan una sola vez (secundario y acento no repiten al principal)', () => {
    const m = identidadVisualDelCliente(manualCon({ paleta: ['#111111', { color: '#111111', rol: 'acento' }, '#222222', '#222222', '#333333'] }), {}, [])
    expect(m.marca?.colors).toEqual({ primary: '#111111', secondary: '#222222', accent: '#333333' })
  })
  it('respaldo en orden: bloque → columnas del manual → ficha (cada cosa por separado) → por omisión', () => {
    const solo = (manual: Record<string, unknown>, ficha: Record<string, unknown>) => identidadVisualDelCliente(manual, ficha, [])
    const a = solo(manualCon(null, { primary_colors: ['#111111', { hex: '#222222' }], typography: [{ family: 'Caveat' }, { name: 'Inter' }] }), { brand_colors: ['#999999'], brand_fonts: ['Bebas'] })
    expect(a.marca).toEqual({ colors: { primary: '#111111', secondary: '#222222' }, fonts: { family: 'Caveat', headline_family: 'Inter' } }); expect(a.procedencia).toEqual({ colores: 'manual', tipografias: 'manual', logo: null })
    const b = solo(manualCon(null, { primary_colors: [], typography: {} }), { brand_colors: [{ hex: '#abcdef' }], brand_fonts: ['Bebas Neue'], logo_url: 'https://logo.test/l.png' })
    expect(b.marca).toEqual({ colors: { primary: '#abcdef' }, fonts: { family: 'Bebas Neue' }, logo_url: 'https://logo.test/l.png' }); expect(b.procedencia).toEqual({ colores: 'ficha', tipografias: 'ficha', logo: 'ficha' })
    const c = solo(manualCon(null, { primary_colors: ['#111111'] }), {})
    expect(c.marca?.fonts).toEqual({ family: 'Inter' }); expect(c.procedencia.tipografias).toBe('por_omision')
    const d = solo(manualCon({ paleta: [{ color: '#111111', rol: 'principal' }], tipografias: [] }, { typography: ['Caveat'] }), {})
    expect(d.marca?.fonts.family).toBe('Caveat'); expect(d.procedencia).toMatchObject({ colores: 'bloque_visual', tipografias: 'manual' })
  })
  it('las tipografías del bloque: cuerpo → family, títulos → headline; sin roles, primera y segunda; una sola no se repite como titular', () => {
    const t = (tipografias: unknown[]) => identidadVisualDelCliente(manualCon({ paleta: ['#111111'], tipografias }), {}, []).marca!.fonts
    expect(t([{ nombre: 'Caveat', rol: 'titulos' }, { nombre: 'Inter', rol: 'cuerpo' }])).toEqual({ family: 'Inter', headline_family: 'Caveat' })
    expect(t([{ nombre: 'Inter', rol: 'cuerpo' }, { nombre: 'Caveat', rol: 'títulos' }])).toEqual({ family: 'Inter', headline_family: 'Caveat' })
    expect(t(['Poppins', 'Lora'])).toEqual({ family: 'Poppins', headline_family: 'Lora' })
    expect(t([{ nombre: 'Solo', rol: 'titulos' }])).toEqual({ family: 'Solo' })
    expect(t(['Una', 'Una'])).toEqual({ family: 'Una' })
    expect(t([{ rol: 'cuerpo' }, 7, null])).toEqual({ family: 'Inter' })
    expect(t([{ nombre: 'A', rol: 'extra' }, { nombre: 'B', rol: 'titulos' }, { nombre: 'C', rol: 'cuerpo' }])).toEqual({ family: 'C', headline_family: 'B' })
    expect(t([{ nombre: 'B', rol: 'titulos' }, { nombre: 'A', rol: 'extra' }, { nombre: 'C', rol: 'cuerpo' }])).toEqual({ family: 'C', headline_family: 'B' })
    // el rol con TILDE o mayúsculas también se reconoce (con «títulos» sin normalizar, A quedaría de titular)
    expect(t([{ nombre: 'A', rol: 'extra' }, { nombre: 'B', rol: 'Títulos' }, { nombre: 'C', rol: 'cuerpo' }])).toEqual({ family: 'C', headline_family: 'B' })
  })
  it('el logo: el de la ficha manda (como siempre); sin ficha, el del bloque, y solo si es una dirección http(s)', () => {
    const l = (logo: unknown, ficha: unknown = null) => identidadVisualDelCliente(manualCon({ paleta: ['#111111'], logo_url: logo }), { logo_url: ficha }, []).marca!.logo_url
    expect(l('https://x.test/a.png', 'https://logo.test/ficha.png')).toBe('https://logo.test/ficha.png')
    expect(l('https://x.test/a.png')).toBe('https://x.test/a.png'); expect(l('javascript:alert(1)')).toBeUndefined(); expect(l(null)).toBeUndefined()
    expect(l('javascript:alert(1)', 'https://logo.test/ficha.png')).toBe('https://logo.test/ficha.png')
  })
  it('el usuario de la marca viaja (primer handle)', () => {
    expect(identidadVisualDelCliente(manualCon({ paleta: ['#111111'] }), {}, ['@mi.marca', '@otra']).marca?.brand_handle).toBe('@mi.marca')
    expect('brand_handle' in identidadVisualDelCliente(manualCon({ paleta: ['#111111'] }), {}, []).marca!).toBe(false)
  })
  it('el caso de df7e47cc (solo Instagram, paleta vacía, columnas vacías, ficha sin colores) NO tiene identidad: sin_color_primario, y NO se inventa una', () => {
    const r = identidadVisualDelCliente(manualCon({ paleta: [], tipografias: [], logo_url: null }, { primary_colors: [], typography: {} }), { brand_colors: null, brand_fonts: null, logo_url: null }, ['@zeroriskgye'])
    expect(r).toEqual({ marca: null, motivo: 'sin_color_primario', procedencia: { colores: null, tipografias: null, logo: null } })
  })
  it('un bloque ilegible o ausente no lanza: se cae al respaldo', () => {
    for (const ct of ['no es json', '', null, undefined, 42, '[]', '{"visual":null}', '{"visual":{"capa_grafica":[]}}']) expect(bloqueVisualDelManual({ content_text: ct })).toBeNull()
    expect(identidadVisualDelCliente({ content_text: 'no es json', primary_colors: ['#111111'] }, {}, []).marca?.colors.primary).toBe('#111111')
    expect(bloqueVisualDelManual({ content_text: { visual: { capa_grafica: { paleta: ['#111111'] } } } })?.paleta).toEqual(['#111111'])
  })
  it('`marcaDelCliente` (la que usa la oficina) es esta misma función: mismo resultado', () => {
    const m = manualCon({ paleta: [{ color: HEX.principal, rol: 'principal' }] }), c = { logo_url: 'https://logo.test/l.png' }
    expect(marcaDelCliente(m, c, ['@a'])).toEqual(identidadVisualDelCliente(m, c, ['@a']).marca)
  })
  it('NO-REGRESIÓN con un manual real de cliente con web (el de la prueba de Náufrago): paleta y tipografías salen del bloque, y si las columnas viejas dicen lo mismo, la marca es la de siempre', () => {
    const real = JSON.parse(readFileSync(new URL('../../manual/__tests__/fixtures/repeticion-r68/manual-guardado.json', import.meta.url), 'utf8')) as { visual: { capa_grafica: { paleta: Array<{ color: string; rol: string }>; tipografias: Array<{ nombre: string; rol: string }>; logo_url: string } } }
    const g = real.visual.capa_grafica
    const nuevo = marcaDelCliente({ content_text: JSON.stringify(real) }, {}, [])
    expect(nuevo?.colors.primary).toBe(g.paleta.find((p) => p.rol === 'principal')?.color)
    // con las columnas viejas coherentes (principal, secundario, acento en ese orden), el resultado es idéntico al de antes
    const columnas = { primary_colors: ['principal', 'secundario', 'acento'].map((r) => g.paleta.find((p) => p.rol === r)!.color), typography: [g.tipografias.find((t) => t.rol === 'cuerpo')!.nombre, g.tipografias.find((t) => t.rol === 'titulos')!.nombre] }
    const antes = marcaDelCliente(columnas, {}, [])
    const ahora = marcaDelCliente({ ...columnas, content_text: JSON.stringify(real) }, {}, [])
    expect({ colors: ahora?.colors, fonts: ahora?.fonts }).toEqual({ colors: antes?.colors, fonts: antes?.fonts })
    expect(ahora?.logo_url).toBe(g.logo_url)
  })
})

/** la implementación de ANTES (congelada), para probar que un cliente cuyas columnas ya vienen llenas NO cambia ni un byte */
function marcaDeAntes(manual: Record<string, unknown>, cliente: Record<string, unknown>, handles: string[]) {
  const lista = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : [])
  const hex = (x: unknown): string | null => { const v = typeof x === 'string' ? x : (x as { hex?: unknown } | null)?.hex; return typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim()) ? v.trim() : null }
  let colores = lista<unknown>(manual.primary_colors).map(hex).filter((x): x is string => !!x)
  if (!colores.length) colores = lista<unknown>(cliente.brand_colors).map(hex).filter((x): x is string => !!x)
  if (!colores.length) return null
  const tipos = (lista<unknown>(manual.typography).length ? lista<unknown>(manual.typography) : lista<unknown>(cliente.brand_fonts)).map((x) => (typeof x === 'string' ? x : (x as { family?: unknown; name?: unknown } | null)?.family ?? (x as { name?: unknown } | null)?.name)).filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim())
  return {
    colors: { primary: colores[0], ...(colores[1] ? { secondary: colores[1] } : {}), ...(colores[2] ? { accent: colores[2] } : {}) },
    fonts: { family: tipos[0] ?? 'Inter', ...(tipos[1] ? { headline_family: tipos[1] } : {}) },
    ...(typeof cliente.logo_url === 'string' && cliente.logo_url ? { logo_url: cliente.logo_url } : {}),
    ...(handles[0] ? { brand_handle: handles[0] } : {}),
  }
}

describe('NO-REGRESIÓN (aviso de CC#3): lo que ya funcionaba da EXACTAMENTE lo de antes', () => {
  const NAUFRAGO_COLUMNAS = { primary_colors: ['#1a0828', '#663772', '#2d1135', '#51d4b4', '#38154b', '#4b2855'], typography: ['Caveat', 'Inter'] }
  const NAUFRAGO_BLOQUE = { paleta: [{ color: '#1a0828', rol: 'principal' }, { color: '#2d1135', rol: 'secundario' }, { color: '#51d4b4', rol: 'acento' }], tipografias: [{ nombre: 'Caveat', rol: 'titulos' }, { nombre: 'Inter', rol: 'cuerpo' }], logo_url: 'https://bucket.test/propio/logo-hd.jpg' }
  it('con los números MEDIDOS en Náufrago (columnas ×6/×2 y un bloque con otros roles) la marca es idéntica a la de antes: colores, tipografías (Caveat=family, Inter=headline) y logo de la ficha', () => {
    const cliente = { logo_url: 'https://logo.test/ficha-naufrago.png' }
    const antes = marcaDeAntes(NAUFRAGO_COLUMNAS, cliente, ['@naufrago.ec'])
    const ahora = marcaDelCliente({ ...NAUFRAGO_COLUMNAS, content_text: bloque(NAUFRAGO_BLOQUE) }, cliente, ['@naufrago.ec'])
    expect(ahora).toEqual(antes)
    expect(ahora).toEqual({ colors: { primary: '#1a0828', secondary: '#663772', accent: '#2d1135' }, fonts: { family: 'Caveat', headline_family: 'Inter' }, logo_url: 'https://logo.test/ficha-naufrago.png', brand_handle: '@naufrago.ec' })
  })
  const COLUMNAS = [[], {}, ['#111111', '#222222', '#333333'], [{ hex: '#aa0011' }, 'rojo'], ['rojo', '#12'], ['#111111', '#111111', '#222222']]
  const TIPOS = [[], {}, ['Caveat', 'Inter'], [{ family: 'A' }, { name: 'B' }], ['Solo'], ['Una', 'Una']]
  const FICHA_C = [null, [], [{ hex: '#abcdef' }], ['#fedcba', '#123456']]
  const FICHA_T = [null, ['Bebas'], ['Bebas', 'Lora']]
  const LOGO = [null, 'https://logo.test/l.png']
  const CON_BLOQUE = [false, true]
  it('SIN bloque visual: para cualquier combinación de columnas y ficha el resultado es EXACTAMENTE el de antes (cero cambios para quien no tiene bloque)', () => {
    let n = 0
    for (const c of COLUMNAS) for (const t of TIPOS) for (const fc of FICHA_C) for (const ft of FICHA_T) for (const lg of LOGO) {
      const m = { primary_colors: c, typography: t }, cl = { brand_colors: fc, brand_fonts: ft, logo_url: lg }
      expect(marcaDelCliente(m, cl, ['@h'])).toEqual(marcaDeAntes(m, cl, ['@h'])); n++
    }
    expect(n).toBe(COLUMNAS.length * TIPOS.length * FICHA_C.length * FICHA_T.length * LOGO.length)
  })
  it('CON bloque visual, si las columnas del manual ya traen colores y tipografías válidos, el resultado sigue siendo EXACTAMENTE el de antes (el bloque no se mete)', () => {
    for (const bl of CON_BLOQUE) for (const fc of FICHA_C) for (const ft of FICHA_T) for (const lg of LOGO.filter((x) => x)) {
      const m = { ...NAUFRAGO_COLUMNAS, ...(bl ? { content_text: bloque(NAUFRAGO_BLOQUE) } : {}) }, cl = { brand_colors: fc, brand_fonts: ft, logo_url: lg }
      expect(marcaDelCliente(m, cl, [])).toEqual(marcaDeAntes(NAUFRAGO_COLUMNAS, cl, []))
    }
  })
  it('lo único que se SUMA a un cliente que ya funciona: si su ficha no tiene logo, el del bloque visual (antes: sin logo). Colores y tipografías no cambian', () => {
    const ahora = marcaDelCliente({ ...NAUFRAGO_COLUMNAS, content_text: bloque(NAUFRAGO_BLOQUE) }, {}, [])
    const antes = marcaDeAntes(NAUFRAGO_COLUMNAS, {}, [])
    expect({ colors: ahora?.colors, fonts: ahora?.fonts }).toEqual({ colors: antes?.colors, fonts: antes?.fonts })
    expect(antes?.logo_url).toBeUndefined(); expect(ahora?.logo_url).toBe('https://bucket.test/propio/logo-hd.jpg')
  })
  it('lo que SÍ cambia (a propósito): un cliente SIN columnas con bloque visual ahora tiene identidad (antes: ninguna → encargos fallidos)', () => {
    expect(marcaDeAntes({ primary_colors: [], typography: {} }, {}, [])).toBeNull()
    expect(marcaDelCliente({ primary_colors: [], typography: {}, content_text: bloque(NAUFRAGO_BLOQUE) }, {}, [])?.colors.primary).toBe('#1a0828')
  })
})

describe('⑦ el pre-vuelo: qué se frena y qué no', () => {
  it('sin marca → sin_identidad_visual; con marca y sin slug → sin_slug; con las dos cosas → pasa', () => {
    const marca = { colors: { primary: '#111111' }, fonts: { family: 'Inter' } }
    expect(previueloDeLaminas({ marca: null, slug: 'x' })).toMatchObject({ error: 'sin_identidad_visual' })
    expect(previueloDeLaminas({ slug: 'x' })).toMatchObject({ error: 'sin_identidad_visual' })
    expect(previueloDeLaminas({ marca, slug: null })).toMatchObject({ error: 'sin_slug' })
    expect(previueloDeLaminas({ marca, slug: '' })).toMatchObject({ error: 'sin_slug' })
    expect(previueloDeLaminas({ marca, slug: 'cliente' })).toBeNull()
    expect(previueloDeLaminas({ marca: null, slug: null })?.error).toBe('sin_identidad_visual')
  })
  it('el motivo dice que queda PENDIENTE (no se pregunta al dueño ni se inventa nada)', () => {
    const d = previueloDeLaminas({ marca: null })!.detalle
    expect(d).toMatch(/pendiente/); expect(d).not.toMatch(/pregunt|dueño/i)
  })
  it('la lista de familias de láminas del pre-vuelo es la misma del orquestador de láminas', () => {
    for (const f of ['carrusel_ig_v1', 'kit_historias', 'post_img', 'otra', '']) expect(esFamiliaDeLaminas(f)).toBe(familiaDeLaminas({ familia: f }) !== null)
  })
  const abrir = (M: ReturnType<typeof crearMemoria>, brief: string, familia: string) => abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: brief, dry_run: true, familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  it('post_img NO se frena aunque el cliente no tenga marca ni slug (no dibuja láminas)', async () => {
    const M = crearMemoria({ fuentes: { marca: null, slug: null } })
    const a = await abrir(M, 'BRF-0003', 'post_img')
    expect(a.status).not.toBe(409); expect(M.encargos.size).toBe(1)
  })
  it('una lectura que FALLA (fuentes con error) no se confunde con «falta el dato»: en una familia de láminas tampoco frena en la puerta (el paso abrir lo dirá)', async () => {
    const M = crearMemoria({ plantilla: CARRUSEL_IG_V1 })
    M.P.fuentes = async () => ({ error: 'caída de la base' })
    const a = await abrir(M, 'BRF-0003', 'carrusel_ig_v1')
    expect(a.status).not.toBe(409); expect(M.encargos.size).toBe(1)
  })
  it('en láminas, sin color primario → 409 sin_identidad_visual y sin slug → 409 sin_slug, y NO nace ningún encargo; con las dos cosas abre', async () => {
    const sin = crearMemoria({ plantilla: CARRUSEL_IG_V1, fuentes: { marca: null } })
    const a = await abrir(sin, 'BRF-0003', 'carrusel_ig_v1')
    expect(a.status).toBe(409); expect(a.cuerpo).toMatchObject({ error: 'sin_identidad_visual', familia: 'carrusel_ig_v1', pendiente: 'reproceso_visual' }); expect(sin.encargos.size).toBe(0)
    const marca = { colors: { primary: '#111111' }, fonts: { family: 'Inter' } }
    const sinSlug = crearMemoria({ plantilla: KIT_HISTORIAS, fuentes: { marca, slug: null } })
    const b = await abrir(sinSlug, 'BRF-0003', 'kit_historias')
    expect(b.status).toBe(409); expect(b.cuerpo).toMatchObject({ error: 'sin_slug', familia: 'kit_historias' }); expect(sinSlug.encargos.size).toBe(0)
    const bien = crearMemoria({ plantilla: CARRUSEL_IG_V1, fuentes: { marca, slug: 'cliente' } })
    expect((await abrir(bien, 'BRF-0003', 'carrusel_ig_v1')).status).not.toBe(409); expect(bien.encargos.size).toBe(1)
  })
})
