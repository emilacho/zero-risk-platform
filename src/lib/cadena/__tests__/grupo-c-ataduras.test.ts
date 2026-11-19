/**
 * 19-nov · grupo C (GO de Lenovo 04:29Z) · las ataduras: lo que, si se olvida, vuelve a frenar la cadena o deja una fila «viva» que ya salió.
 *   A · el tope de vueltas de los dos sub-flujos de n8n sale de (1 + RONDAS_DE_CORRECCION) × MAXIMO_DE_INTENTOS (CC1: si suben las rondas sin subir el tope, vuelve el error).
 *   B · todo archivo de la cadena que nombra `descartada_sin_fuente` nombra también `descartada_por_bloqueo` o lee `SALIERON_EN_LA_CADENA`.
 *   · la migración 202611190600 suma el estado al CHECK sin quitar ninguno, y la reversa es su espejo con guarda.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAXIMO_DE_INTENTOS, RONDAS_DE_CORRECCION, TOPE_DE_VUELTAS_DEL_SUBFLUJO } from '../constantes'
import { SALIERON_EN_LA_CADENA } from '../tipos'
import { mejorRonda, rondaDeClave } from '../pasos'
import type { RondaDeEstrategia } from '../almacen'

const RAIZ = path.resolve(__dirname, '../../../..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8')

describe('A · el tope de vueltas de los sub-flujos sale de las rondas', () => {
  it('es (1 + 3 rondas) × 3 intentos = 12', () => {
    expect(RONDAS_DE_CORRECCION).toBe(3)
    expect(TOPE_DE_VUELTAS_DEL_SUBFLUJO).toBe((1 + RONDAS_DE_CORRECCION) * MAXIMO_DE_INTENTOS)
    expect(TOPE_DE_VUELTAS_DEL_SUBFLUJO).toBe(12)
  })
  for (const flujo of ['cadena-estrategia', 'cadena-calendario']) {
    it(`${flujo}: «④ ¿Y ahora?» corta en vuelta >= ${TOPE_DE_VUELTAS_DEL_SUBFLUJO} y en ningún otro número`, () => {
      const d = JSON.parse(leer(`scripts/worker-staging/cadena/flujos/${flujo}.json`)) as { nodes: { name: string; parameters?: { jsCode?: string } }[] }
      const nodo = d.nodes.find((n) => n.name === '④ ¿Y ahora?')
      expect(nodo).toBeDefined()
      const topes = [...(nodo!.parameters?.jsCode ?? '').matchAll(/s\.vuelta\s*>=\s*(\d+)/g)].map((m) => Number(m[1]))
      expect(topes).toEqual([TOPE_DE_VUELTAS_DEL_SUBFLUJO])
      // ningún otro nodo pone un tope propio de vueltas
      const otros = d.nodes.filter((n) => n !== nodo).flatMap((n) => [...(n.parameters?.jsCode ?? '').matchAll(/vuelta\s*>=?\s*\d+/g)])
      expect(otros).toEqual([])
    })
  }
  it('la fuente de los dos flujos (`nodos/paso-y-ahora.js`, la que arma `construir.mjs`) corta en el mismo número', () => {
    const fuente = leer('scripts/worker-staging/cadena/nodos/paso-y-ahora.js')
    expect([...fuente.matchAll(/s\.vuelta\s*>=\s*(\d+)/g)].map((m) => Number(m[1]))).toEqual([TOPE_DE_VUELTAS_DEL_SUBFLUJO])
  })
  it('el peor caso legítimo cabe justo: la última vuelta posible (índice 11) llega a «④» antes del tope', () => {
    const vueltasLegitimas = (1 + RONDAS_DE_CORRECCION) * MAXIMO_DE_INTENTOS
    expect(vueltasLegitimas - 1).toBeLessThan(TOPE_DE_VUELTAS_DEL_SUBFLUJO)
    expect(vueltasLegitimas).toBe(TOPE_DE_VUELTAS_DEL_SUBFLUJO)
  })
})

describe('B · la fila que sale por bloqueo va al lado de la que sale sin fuente', () => {
  it('SALIERON_EN_LA_CADENA son exactamente las dos', () => {
    expect([...SALIERON_EN_LA_CADENA].sort()).toEqual(['descartada_por_bloqueo', 'descartada_sin_fuente'])
  })
  const dir = path.join(RAIZ, 'src/lib/cadena')
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  /**
   * Los que nombran el estado viejo SOLO como un paso propio del «dato sin fuente» (no como una lista que excluye filas): ahí el estado nuevo no corresponde.
   * Se fija cuántas veces lo nombran: un uso nuevo en estos archivos hace caer la prueba y obliga a decidir.
   */
  const SOLO_SIN_FUENTE: Record<string, { veces: number; por_que: string }> = {
    'datos.ts': { veces: 1, por_que: 'MARCAS_LEGALES: la investigación que no halló fuente pasa a descartada_sin_fuente (marca externa, no una salida por bloqueo)' },
    'reloj.ts': { veces: 1, por_que: "la espera 'fila_sale' es la del dato sin fuente: al vencer marca descartada_sin_fuente" },
  }
  const veces = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8').split("'descartada_sin_fuente'").length - 1
  for (const [f, { veces: n, por_que }] of Object.entries(SOLO_SIN_FUENTE)) {
    it(`${f} nombra el estado viejo solo ${n} vez (${por_que})`, () => { expect(veces(f)).toBe(n) })
  }
  const conLaVieja = archivos.filter((f) => !(f in SOLO_SIN_FUENTE) && veces(f) > 0)
  it('hay archivos que nombran el estado viejo (si no, esta prueba no mide nada)', () => {
    expect(conLaVieja.length).toBeGreaterThanOrEqual(6)
  })
  for (const f of conLaVieja) {
    it(`${f} nombra también descartada_por_bloqueo o lee SALIERON_EN_LA_CADENA`, () => {
      const s = fs.readFileSync(path.join(dir, f), 'utf8')
      expect(s.includes("'descartada_por_bloqueo'") || s.includes('SALIERON_EN_LA_CADENA')).toBe(true)
    })
  }
  // cada lista (Set/array/comparación) con el estado viejo, en código (no en comentarios), lleva el nuevo en la MISMA línea
  for (const f of conLaVieja) {
    it(`${f}: cada línea de código con 'descartada_sin_fuente' en una lista o comparación lleva también la nueva`, () => {
      const lineas = fs.readFileSync(path.join(dir, f), 'utf8').split('\n')
        .filter((l) => l.includes("'descartada_sin_fuente'") && !/^\s*(\/\/|\*|\/\*\*)/.test(l))
        .filter((l) => /\[|new Set|!==|===/.test(l))
        // los literales de un solo estado (asignar el estado a la fila, el motivo) no son listas
        .filter((l) => !/estado:\s*[^,]*'descartada_sin_fuente' as const/.test(l) && !/^\s*descartada_sin_fuente:/.test(l))
      for (const l of lineas) expect(l, l.trim()).toContain("'descartada_por_bloqueo'")
    })
  }
})

describe('la migración 202611190600 y su reversa', () => {
  const mig = leer('supabase/migrations/202611190600_cadena_rondas_de_correccion.sql')
  const rev = leer('supabase/reversas/202611190600_cadena_rondas_de_correccion_REVERSA.sql')
  const viejo = leer('supabase/migrations/202610090200_cadena_tablas.sql')
  const estados = (s: string) => {
    const m = /CONSTRAINT cadena_filas_estado_valido CHECK \(estado IN \(([\s\S]*?)\)\)/.exec(s)
    return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : null
  }
  it('suma descartada_por_bloqueo al CHECK sin quitar ningún estado', () => {
    expect(estados(mig)).toEqual([...estados(viejo)!, 'descartada_por_bloqueo'])
  })
  it('la reversa vuelve exactamente al CHECK viejo', () => {
    expect(estados(rev)).toEqual(estados(viejo))
  })
  it('la reversa se niega con filas descartada_por_bloqueo o con rondas guardadas, ANTES de tocar nada', () => {
    const guarda = rev.indexOf('RAISE EXCEPTION')
    expect(guarda).toBeGreaterThan(0)
    expect(rev).toMatch(/WHERE estado = 'descartada_por_bloqueo'\) THEN\s+RAISE EXCEPTION/)
    expect(rev).toMatch(/EXISTS \(SELECT 1 FROM public\.cadena_estrategia_rondas\) THEN\s+RAISE EXCEPTION/)
    expect(guarda).toBeLessThan(rev.indexOf('DROP TABLE'))
    expect(guarda).toBeLessThan(rev.indexOf('DROP CONSTRAINT'))
  })
  it('la tabla de rondas es única por (campaña, versión, ronda), con RLS y solo service_role', () => {
    expect(mig).toContain('UNIQUE (campana_id, version, ronda)')
    expect(mig).toContain('ALTER TABLE public.cadena_estrategia_rondas ENABLE ROW LEVEL SECURITY')
    expect(mig).toContain('REVOKE ALL ON public.cadena_estrategia_rondas FROM PUBLIC, anon, authenticated')
    expect(mig).toContain('REVOKE ALL ON SEQUENCE public.cadena_estrategia_rondas_id_seq FROM PUBLIC, anon, authenticated')
  })
  it('es aditiva: no toca datos (ni UPDATE ni DELETE ni DROP TABLE)', () => {
    expect(mig).not.toMatch(/^\s*(UPDATE|DELETE|DROP TABLE)\b/im)
  })
  it('el almacén de Supabase escribe y lee la misma tabla, con la llave única de la migración', () => {
    const al = leer('src/lib/cadena/almacen-supabase.ts')
    expect(al).toContain("from('cadena_estrategia_rondas').upsert(r, { onConflict: 'campana_id,version,ronda', ignoreDuplicates: true })")
    expect(al).toContain("from('cadena_estrategia_rondas').select('*')")
  })
})

describe('las claves de las rondas', () => {
  it('la ronda sale del final de la clave; las claves viejas (`:c1`) son la ronda 1 y sin ronda es 0', () => {
    expect(rondaDeClave('v2:c0')).toBe(0)
    expect(rondaDeClave('v2:c1')).toBe(1)
    expect(rondaDeClave('t3:v1:c3')).toBe(3)
    expect(rondaDeClave('v2')).toBe(0)
  })
  it('la mejor ronda: menos bloqueos; si empatan, la última', () => {
    const r = (ronda: number, bloqueos: number): RondaDeEstrategia => ({ campana_id: 'c', version: 1, ronda, bloqueos, contenido: {} as never, fichas: [], seco: true })
    expect(mejorRonda([r(0, 3), r(1, 1), r(2, 2), r(3, 4)])!.ronda).toBe(1)
    expect(mejorRonda([r(0, 2), r(1, 1), r(2, 1), r(3, 2)])!.ronda).toBe(2)
    expect(mejorRonda([r(3, 1), r(1, 1)])!.ronda).toBe(3)
    expect(mejorRonda([])).toBeNull()
  })
})
