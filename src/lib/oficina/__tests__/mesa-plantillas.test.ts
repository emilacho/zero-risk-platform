import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { siguientePaso } from '../motor'
import { CARRUSEL_MESA, KIT_MESA, TOPE_DE_LA_MESA_USD } from '../plantillas/mesa'
import { estadoInicial, type Plantilla } from '../tipos'

const RAIZ = path.join(__dirname, '..', '..', '..', '..')
const MIGRACION = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', '202610281500_oficina_la_mesa.sql'), 'utf8')
const REVERSA = fs.readFileSync(path.join(RAIZ, 'supabase', 'reversas', '202610281500_oficina_la_mesa_REVERSA.sql'), 'utf8')

/** el bloque de una plantilla en la migración: lo que hay entre $pasos$…$pasos$, $ind$…$ind$ y $lim$…$lim$ de la fila de ese tipo */
function filaDe(tipo: string): { pasos: unknown; indicaciones: unknown; limites: unknown } {
  const i = MIGRACION.indexOf(`'${tipo}', '${tipo}'`)
  expect(i, `no hay fila para ${tipo}`).toBeGreaterThan(0)
  const resto = MIGRACION.slice(i)
  const toma = (m: string) => JSON.parse(new RegExp(`\\$${m}\\$([\\s\\S]*?)\\$${m}\\$`).exec(resto)![1])
  return { pasos: toma('pasos'), indicaciones: toma('ind'), limites: toma('lim') }
}

describe('LA MESA · plantillas como dato', () => {
  for (const [tipo, P] of [['carrusel_mesa', CARRUSEL_MESA], ['kit_mesa', KIT_MESA]] as Array<[string, Plantilla]>) {
    it(`${tipo}: el dato sembrado en la migración es EXACTAMENTE el que produce el código`, () => {
      const f = filaDe(tipo)
      expect(f.pasos).toEqual(JSON.parse(JSON.stringify(P.pasos)))
      expect(f.indicaciones).toEqual(JSON.parse(JSON.stringify(P.indicaciones)))
      expect(f.limites).toEqual(JSON.parse(JSON.stringify(P.limites)))
    })

    it(`${tipo}: tope US$ ${TOPE_DE_LA_MESA_USD}, un solo paso de mesa, cola mecánica con jefatura y SIN pasos de agente (el equipo trabaja en el tablero)`, () => {
      expect(P.familia).toBe(tipo)
      expect(P.limites.tope_encargo_usd).toBe(5)
      expect(P.pasos.filter((p) => p.funcion === 'mesa')).toHaveLength(1)
      expect(P.pasos.filter((p) => p.tipo === 'agente' || p.tipo === 'portero')).toHaveLength(0)
      expect(P.pasos.filter((p) => p.tipo === 'jefatura')).toHaveLength(1)
      // el observador de imagen es un paso de código aparte, DESPUÉS de generar y ANTES de elegir
      const clave = P.pasos.map((p) => p.clave)
      expect(clave.indexOf('imagen')).toBeLessThan(clave.indexOf('observar'))
      expect(clave.indexOf('observar')).toBeLessThan(clave.indexOf('elegir_version'))
      expect(clave.indexOf('asignar_fotos')).toBeLessThan(clave.indexOf('mesa'))
      expect(clave.indexOf('mesa')).toBeLessThan(clave.indexOf('imagen'))
      // el margen alcanza para 24 turnos de agente sobre los pasos de la plantilla
      expect(P.limites.margen).toBeGreaterThanOrEqual(24 + 6)
    })

    it(`${tipo}: el motor llega al paso «mesa» tras abrir y asignar fotos`, () => {
      let e = estadoInicial()
      const vistos: string[] = []
      for (let k = 0; k < 3; k++) {
        const s = siguientePaso(e, P)
        if (s.accion !== 'ejecutar') break
        vistos.push(s.paso.clave)
        e = { ...e, ultimo: s.indice, pasos_ejecutados: e.pasos_ejecutados + 1 }
      }
      expect(vistos).toEqual(['abrir', 'asignar_fotos', 'mesa'])
    })
  }

  it('la migración es aditiva y segura: tablas con RLS + GRANT + política, libro solo-agregar, plantillas inactivas, sin jueces en el directorio', () => {
    for (const t of ['oficina_directorio', 'oficina_mesa_aportes']) {
      expect(MIGRACION).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
      expect(MIGRACION).toMatch(new RegExp(`REVOKE ALL ON public\\.${t} FROM PUBLIC, anon, authenticated`))
      expect(MIGRACION).toMatch(new RegExp(`GRANT [A-Z, ]+ ON public\\.${t} TO service_role`))
      expect(MIGRACION).toMatch(new RegExp(`CREATE POLICY ${t}_service ON public\\.${t} FOR ALL TO service_role`))
    }
    expect(MIGRACION).toMatch(/GRANT SELECT, INSERT ON public\.oficina_mesa_aportes TO service_role/)
    expect(MIGRACION).not.toMatch(/\b(DROP TABLE|DELETE FROM|TRUNCATE|UPDATE public\.oficina_)/i)
    expect(MIGRACION).toMatch(/2, 5\.00, false/g)
    for (const juez of ['brand_strategist', 'editor_en_jefe', 'jefe_client_success', 'jefe-marketing']) {
      expect(MIGRACION.slice(MIGRACION.indexOf('INSERT INTO public.oficina_directorio'), MIGRACION.indexOf('ON CONFLICT (agente)'))).not.toContain(`'${juez}'`)
    }
    expect(MIGRACION).toMatch(/NOTIFY pgrst, 'reload schema'/)
  })

  it('la reversa se niega con encargos de la mesa y deshace lo creado', () => {
    expect(REVERSA).toMatch(/hay encargos de la mesa/)
    expect(REVERSA).toMatch(/DROP TABLE IF EXISTS public\.oficina_mesa_aportes/)
    expect(REVERSA).toMatch(/DROP TABLE IF EXISTS public\.oficina_directorio/)
    expect(REVERSA).toMatch(/DELETE FROM public\.oficina_tipos_de_grupo WHERE tipo IN \('carrusel_mesa', 'kit_mesa'\)/)
  })
})
