/**
 * T7 · INSTALACIONES E1 (FIRMA de Emilio 31-oct 16:30Z) · prueba de REGISTRO y de CATÁLOGO · US$ 0, sin modelo.
 *  · catálogo: cada `.md` existe, conserva el front matter del origen y lleva la atribución MIT fijada al commit; Whimsy va recortado a marca/contenido (sin CSS/JS/bash);
 *    los otros dos van tal cual; la migración 202610312007 lleva cada identidad byte a byte, modelo Sonnet, solo inserta; la reversa borra solo esas 3 filas y con guarda;
 *  · registro: los tres están en `MESA_ALLOW` del corredor (el turno monta `mesa_pedir`); LinkedIn NO (diferido);
 *  · la indicación obligatoria de cada uno lleva la regla de idioma del manual y sus límites; ninguna fija idioma ni trato;
 *  · la tarjeta sugerida se comporta con `esPertinente` como dice la firma (Whimsy fijo en la gran idea; TikTok solo con video; Inclusive solo con personas).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { esPertinente } from '../mesa/directorio'
import type { Tarjeta } from '../mesa/tipos'
import { DIFERIDOS_E1, INDICACION_IDIOMA_DEL_MANUAL, INSTALACIONES_E1, indicacionDe, instalacionDe, ORIGEN_E1, SLUGS_E1 } from '../instalaciones-e1'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const MIGRACION = leer('supabase/migrations/202610312007_agents_instalaciones_e1.sql')
const REVERSA = leer('supabase/reversas/202610312007_agents_instalaciones_e1_REVERSA.sql')
const REGISTRO = leer('services/agent-runner/src/lib/agent-mcp-registry.ts')
const BLOQUE_MESA = /export const MESA_ALLOW[\s\S]*?\]\)/.exec(REGISTRO)![0]
const FIJA_IDIOMA_O_TRATO = /\b(tuteo|voseo|vosea|tutea|trata de usted|en español|español de ecuador|in english|en inglés)\b/i

const tarjetaDe = (agente: string): Tarjeta => ({ agente, activo: true, version: 1, ...instalacionDe(agente)!.tarjeta, sabe_hacer: [...instalacionDe(agente)!.tarjeta.sabe_hacer], necesita: [...instalacionDe(agente)!.tarjeta.necesita], entrega: [...instalacionDe(agente)!.tarjeta.entrega], pertinente_en: [...instalacionDe(agente)!.tarjeta.pertinente_en] })

describe('T7 · catálogo: las tres identidades, su atribución y la migración', () => {
  it('🔴 son exactamente tres (Whimsy, TikTok, Inclusive); LinkedIn queda diferido y sin archivo', () => {
    expect(SLUGS_E1).toEqual(['whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist'])
    expect(DIFERIDOS_E1.map((d) => d.agente)).toEqual(['linkedin-content-creator'])
    expect(fs.existsSync(path.join(RAIZ, 'src/agents/identities/linkedin-content-creator.md'))).toBe(false)
    expect(MIGRACION).not.toContain('linkedin')
  })

  it.each(INSTALACIONES_E1.map((i) => [i.agente, i] as const))('🔴 %s: el .md existe, conserva el front matter del origen y lleva la atribución MIT fijada al commit', (_slug, i) => {
    const md = leer(i.archivo)
    const lineas = md.split('\n')
    expect(lineas[0]).toBe('---')
    const cierre = lineas.indexOf('---', 1)
    expect(cierre).toBeGreaterThan(1)
    expect(lineas.slice(1, cierre).join('\n')).toContain(`name: ${i.display_name}`)
    const atribucion = lineas[cierre + 1]
    expect(atribucion.startsWith('<!-- ORIGEN · ')).toBe(true)
    expect(atribucion.endsWith(' -->')).toBe(true)
    for (const pieza of [ORIGEN_E1.repositorio, ORIGEN_E1.commit, i.ruta_de_origen, 'Licencia MIT', ORIGEN_E1.titular, 'FIRMA de Emilio', 'identity_content']) expect(atribucion, pieza).toContain(pieza)
    expect(atribucion).toContain(i.recortado ? 'RECORTE' : 'Texto tal cual del repositorio.')
    // el delimitador de la migración no puede aparecer en la identidad (rompería el INSERT)
    expect(md).not.toContain('$ident$')
  })

  it('🔴 Whimsy va recortado a marca/contenido: sin CSS, JavaScript ni bash; conserva misión, reglas, el marco de personalidad, flujo, estilo y métricas', () => {
    const md = leer('src/agents/identities/whimsy-injector.md')
    expect(md).not.toMatch(/```(css|javascript|js|bash|typescript|ts)\b/)
    // el cuerpo (sin la línea de atribución, que nombra lo omitido) no trae las secciones de código
    const cuerpo = md.split('\n').filter((l) => !l.startsWith('<!-- ORIGEN · ')).join('\n')
    for (const s of ['Micro-Interaction Design System', 'Playful Microcopy Library', 'Gamification System Design']) expect(cuerpo).not.toContain(s)
    for (const s of ['## 🎯 Your Core Mission', '## 🚨 Critical Rules You Must Follow', '### Brand Personality Framework', '## 🔄 Your Workflow Process', '### Step 1: Brand Personality Analysis', '- Review brand guidelines and target audience', '## 💭 Your Communication Style', '## 🎯 Your Success Metrics']) expect(md, s).toContain(s)
    expect(md.length).toBeLessThan(10_000)
  })

  it('TikTok e Inclusive van tal cual: conservan su identidad de origen entera (cabecera, misión, reglas, flujo, métricas)', () => {
    const tiktok = leer('src/agents/identities/tiktok-strategist.md')
    expect(tiktok).toContain('You are a TikTok culture native')
    for (const s of ['## Core Mission', '## Critical Rules', '## Workflow Process', '## Success Metrics', '## Advanced Capabilities']) expect(tiktok, s).toContain(s)
    const inclusive = leer('src/agents/identities/inclusive-visuals-specialist.md')
    expect(inclusive).toContain('rigorous prompt engineer specializing exclusively in authentic human representation')
    for (const s of ['## 🎯 Your Core Mission', '## 🚨 Critical Rules You Must Follow', '## 🔄 Your Workflow Process', '## 🎯 Your Success Metrics']) expect(inclusive, s).toContain(s)
  })

  it('🔴 la migración 202610312007 lleva cada identidad BYTE A BYTE, modelo claude-sonnet, activa, solo inserta y cita el commit; no toca otras filas', () => {
    for (const i of INSTALACIONES_E1) {
      expect(MIGRACION, i.agente).toContain(`$ident$${leer(i.archivo)}$ident$, 'claude-sonnet', 'active', true`)
      expect(MIGRACION).toContain(`SELECT '${i.agente}', '${i.display_name}', COALESCE(r.role, 'empleado'), r.department_id, r.phase,`)
      expect(MIGRACION).toContain(`'canonical:${ORIGEN_E1.repositorio}@${ORIGEN_E1.commit.slice(0, 7)}:${i.ruta_de_origen} · MIT`)
    }
    expect(MIGRACION.match(/INSERT INTO public\.agents/g)).toHaveLength(3)
    expect(MIGRACION.match(/ON CONFLICT \(name\) DO NOTHING;/g)).toHaveLength(3)
    expect(MIGRACION).toContain(ORIGEN_E1.commit)
    expect(MIGRACION).toContain('SIN APLICAR')
    expect(MIGRACION).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b|\bALTER\b/)
    expect(MIGRACION.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
  })

  it('🔴 la reversa borra SOLO las tres filas (por nombre Y por procedencia) y se detiene si alguna sigue activa en el directorio', () => {
    expect(REVERSA).toContain(`DELETE FROM public.agents WHERE name IN ('whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist') AND identity_source LIKE 'canonical:${ORIGEN_E1.repositorio}@${ORIGEN_E1.commit.slice(0, 7)}:%';`)
    expect(REVERSA.match(/DELETE FROM/g)).toHaveLength(1)
    // menor 1 de CC3 (Y11): la guarda es EXACTAMENTE esta condición (sin añadidos que la neutralicen, sin comentar) y lo que sigue es la excepción
    const guarda = /^\s*IF to_regclass\('public\.oficina_directorio'\) IS NOT NULL AND EXISTS \(SELECT 1 FROM public\.oficina_directorio WHERE agente IN \('whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist'\) AND activo\) THEN\n\s*RAISE EXCEPTION 'alguno de los agentes E1 sigue activo en oficina_directorio: desactívalo antes de revertir';\n\s*END IF;$/m
    expect(REVERSA).toMatch(guarda)
    expect(REVERSA.match(/RAISE EXCEPTION/g)).toHaveLength(1)
    expect(REVERSA.indexOf('RAISE EXCEPTION')).toBeLessThan(REVERSA.indexOf('DELETE FROM'))
    expect(REVERSA).not.toMatch(/design-visual-storyteller|creative-director/)
  })
})

describe('T7 · registro: el corredor monta la mesa a los tres y a nadie más nuevo', () => {
  it.each(SLUGS_E1)('🔴 %s está en MESA_ALLOW (su turno monta mesa_pedir · mesa_devolver · pedir_material)', (slug) => {
    expect(BLOQUE_MESA).toContain(`'${slug}'`)
  })
  it('🔴 LinkedIn no está en MESA_ALLOW (diferido) y los jueces tampoco', () => {
    expect(BLOQUE_MESA).not.toContain('linkedin')
    expect(BLOQUE_MESA).not.toMatch(/'(brand_strategist|editor_en_jefe|jefe_client_success|jefe-marketing)'/)
  })
})

describe('T7 · la indicación obligatoria y la tarjeta sugerida (dato para CC2 en T6)', () => {
  it('🔴 cada indicación lleva la regla de idioma del manual, sus límites, y no fija idioma ni trato', () => {
    for (const i of INSTALACIONES_E1) {
      expect(i.indicacion, i.agente).toContain(INDICACION_IDIOMA_DEL_MANUAL)
      expect(indicacionDe(i.agente)).toContain(INDICACION_IDIOMA_DEL_MANUAL)
      expect(indicacionDe(i.agente)).not.toMatch(FIJA_IDIOMA_O_TRATO)
    }
    expect(indicacionDe('whimsy-injector')).toMatch(/Nada de código, interfaces/)
    expect(indicacionDe('tiktok-strategist')).toMatch(/Nada de anuncios, Spark Ads/)
    expect(indicacionDe('inclusive-visuals-specialist')).toMatch(/solo cuando la imagen lleva personas/)
    expect(indicacionDe('linkedin-content-creator')).toBeNull()
    expect(INDICACION_IDIOMA_DEL_MANUAL).toMatch(/manual del cliente/)
    expect(INDICACION_IDIOMA_DEL_MANUAL).not.toMatch(FIJA_IDIOMA_O_TRATO)
  })

  it('🔴 Whimsy es fijo en la gran idea; TikTok solo con `si_video`; Inclusive solo con `si_personas` (en carrusel y kit, nunca en la gran idea)', () => {
    const w = tarjetaDe('whimsy-injector')
    expect(esPertinente(w, 'concepto', false)).toBe(true)
    expect(esPertinente(w, 'carrusel', false)).toBe(false)
    const t = tarjetaDe('tiktok-strategist')
    expect(esPertinente(t, 'concepto', false)).toBe(false)
    expect(esPertinente(t, 'concepto', false, ['si_instagram'])).toBe(false)
    expect(esPertinente(t, 'concepto', false, ['si_video'])).toBe(true)
    const inc = tarjetaDe('inclusive-visuals-specialist')
    expect(esPertinente(inc, 'carrusel', true)).toBe(false)
    expect(esPertinente(inc, 'carrusel', true, ['si_personas'])).toBe(true)
    expect(esPertinente(inc, 'kit', true, ['si_personas'])).toBe(true)
    expect(esPertinente(inc, 'concepto', false, ['si_personas'])).toBe(false)
    for (const x of [w, t, inc]) expect(esPertinente({ ...x, activo: false }, 'concepto', false, ['si_video'])).toBe(false)
  })
})
