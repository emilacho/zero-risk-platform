/**
 * 202611170720 · ENCENDIDO DEL SPRINT 2 de video (CC1 · DECISIÓN Lenovo 17-nov 07:18 · Emilio firmó; certifica CC6 con prueba en seco, US$ 0).
 * `VIDEO_MESA_ENCENDIDA` = plano por plano + 3 propuestas con su borrador en video (480p, tope US$ 20) + la aprobación del dueño + las imágenes clave finales.
 * La migración escribe EXACTAMENTE esa plantilla, no pisa (exige los `pasos` de 202611162300 y los `limites` de 202611170520 enteros), se niega con encargos vivos,
 * y su reversa devuelve lo de antes. No toca `familias_activas` ni ningún tope (encargo 45 · video 15 · reserva 30).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
// 17-nov · T7b: lo que prueba la FORMA de la plantilla es la HISTORIA de 0720/0930 (topes fijos); la corrida en seco por el orquestador usa la VIGENTE (cifras por segundo, 202611171900)
import { abrirEncargo } from '../orquestador'
import { planoPorPlanoEncendido } from '../orquestador-video'
import { validarPlantilla } from '../plantilla'
import {
  PASO_APROBAR_PROPUESTAS, PROPUESTAS_DE_VIDEO, RESERVA_POR_VIDEO_USD, TOPE_DE_VIDEO_MESA_USD, TOPE_DEL_BORRADOR_DE_VIDEO_USD, TOPE_DEL_PASO_VIDEO_USD, VIDEO_MESA, VIDEO_MESA_ENCENDIDA_0930 as VIDEO_MESA_ENCENDIDA, VIDEO_MESA_ENCENDIDA as VIDEO_MESA_ENCENDIDA_VIGENTE,
} from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { ARTEFACTO_BORRADOR_VIDEO, resolucionDelBorrador, type BorradoresDeVideo } from '../video/borradores'
import { PASO_IMAGENES_CLAVE_FINAL } from '../video/imagen-clave'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'
import { brazo, hecho } from './s2-4-arnes'

const RAIZ = path.resolve(__dirname, '../../../../supabase')
const leer = (...p: string[]) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8')
const MIG = leer('migrations', '202611170720_oficina_video_encendido_sprint2.sql')
const REV = leer('reversas', '202611170720_oficina_video_encendido_sprint2_REVERSA.sql')
const M2300 = leer('migrations', '202611162300_oficina_video_imagen_clave.sql')
const M0520 = leer('migrations', '202611170520_oficina_video_reserva_30.sql')
const tomar = (sql: string, d: string) => JSON.parse(new RegExp(`\\$${d}\\$([\\s\\S]*?)\\$${d}\\$`).exec(sql)![1])
const json = (x: unknown) => JSON.parse(JSON.stringify(x))
/** 202611170720 escribió el borrador en 20 (DECISIÓN 04:47); 202611170830 lo bajó a 10 · lo que 0720 escribió = la encendida de hoy con el borrador en 20 */
const PASOS_0720 = json(VIDEO_MESA_ENCENDIDA.pasos.map((p) => (p.clave === 'borrador_video' ? { ...p, tope_usd: 20 } : p)))
/** 0720 escribió el encargo en 45; 202611170930 lo subió a 58 */
const LIM_0720 = json({ ...VIDEO_MESA_ENCENDIDA.limites, tope_encargo_usd: 45 })
const sentencias = (sql: string) => sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
/** las guardas que tienen que ESTAR y estar ANTES del único UPDATE */
const GUARDAS = [
  "IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN",
  'IS DISTINCT FROM $lim_antes$',
  'IS DISTINCT FROM $pasos_antes$',
  "IF (SELECT tope_encargo_usd FROM public.oficina_tipos_de_grupo WHERE familia = 'video_mesa') IS DISTINCT FROM 45::numeric THEN",
]

describe('la plantilla encendida', () => {
  it('el orden acordado: mesa → imágenes clave (borrador) → borrador en video → aprobación del dueño → imágenes clave finales → su revisión → pedido → video…', () => {
    expect(VIDEO_MESA_ENCENDIDA.pasos.map((p) => p.clave)).toEqual([
      'abrir', 'mesa', 'imagenes_clave', 'borrador_video', 'aprobar_propuestas', 'imagenes_clave_final', 'revisar_imagenes_clave',
      'pedido', 'video', 'cuadros_video', 'mirar_video', 'chequeos', 'jefatura', 'chequeos_2', 'entrega', 'cierre',
    ])
    const paso = (c: string) => VIDEO_MESA_ENCENDIDA.pasos.find((p) => p.clave === c)!
    expect(paso('borrador_video').tope_usd).toBe(10)
    expect(paso('video').tope_usd).toBe(TOPE_DEL_PASO_VIDEO_USD)
    expect(paso('aprobar_propuestas')).toEqual(PASO_APROBAR_PROPUESTAS)
    expect(paso('aprobar_propuestas').vuelve_a).toMatchObject({ paso: 'mesa', max: 2 })
    // la revisión con visión mira las imágenes FINALES (las de la propuesta aprobada)
    expect(paso('revisar_imagenes_clave')).toMatchObject({ entrada: [PASO_IMAGENES_CLAVE_FINAL, 'guion'], condicion: { artefacto: PASO_IMAGENES_CLAVE_FINAL, campo: 'hay_imagenes' } })
    expect(paso('imagenes_clave_final')).toMatchObject({ funcion: 'imagenes_clave', salida_artefacto: PASO_IMAGENES_CLAVE_FINAL, tope_usd: 3 })
  })
  it('plano por plano encendido · 3 propuestas · borrador a 480p · los topes: video 15, reserva 30; el encargo 45 → 58 (202611170930)', () => {
    expect(planoPorPlanoEncendido(VIDEO_MESA_ENCENDIDA)).toBe(true)
    expect(planoPorPlanoEncendido(VIDEO_MESA)).toBe(false)
    expect(VIDEO_MESA_ENCENDIDA.limites.video).toMatchObject({ plano_por_plano: true, propuestas: 3, borrador: { resolucion: '480p' }, resolucion: '720p', tope_por_video_usd: 15 })
    expect(resolucionDelBorrador(VIDEO_MESA_ENCENDIDA.limites)).toBe('480p')
    expect([PROPUESTAS_DE_VIDEO, TOPE_DEL_BORRADOR_DE_VIDEO_USD, TOPE_DE_VIDEO_MESA_USD, RESERVA_POR_VIDEO_USD]).toEqual([3, 10, 45, 30])
    expect(VIDEO_MESA_ENCENDIDA.limites).toMatchObject({ tope_encargo_usd: 58, reserva_por_pieza_usd: 30 })
    // el resto de los límites, idéntico (el tope del encargo: 45 en la base, 58 encendido · 202611170930)
    const { video: _a, tope_encargo_usd: _c, ...restoE } = VIDEO_MESA_ENCENDIDA.limites
    const { video: _b, tope_encargo_usd: _d, ...restoB } = VIDEO_MESA.limites
    expect([_d, _c]).toEqual([45, 58])
    expect(restoE).toEqual(restoB)
    expect(VIDEO_MESA_ENCENDIDA.indicaciones).toEqual(VIDEO_MESA.indicaciones)
  })
  it('es válida: los mismos hallazgos que la de antes (los pasos nuevos no agregan ninguno)', () => {
    expect(validarPlantilla(VIDEO_MESA_ENCENDIDA)).toEqual(validarPlantilla(VIDEO_MESA))
  })
  it('lo de ANTES del encendido es lo que hoy está en la base (pasos de 2300 · límites de 0520)', () => {
    expect(json(VIDEO_MESA.pasos)).toEqual(tomar(M2300, 'pasos'))
    expect(json(VIDEO_MESA.limites)).toEqual(tomar(M0520, 'lim'))
  })
})

describe('202611170720 · la migración', () => {
  it('escribe EXACTAMENTE la plantilla encendida del código y exige lo de antes entero', () => {
    expect(tomar(MIG, 'pasos')).toEqual(PASOS_0720)
    expect(tomar(MIG, 'lim')).toEqual(LIM_0720)
    expect(tomar(MIG, 'pasos_antes')).toEqual(tomar(M2300, 'pasos'))
    expect(tomar(MIG, 'lim_antes')).toEqual(tomar(M0520, 'lim'))
  })
  it('un solo UPDATE (pasos + límites de video_mesa), en transacción, con TODAS las guardas antes; nada se borra', () => {
    const s = sentencias(MIG)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    expect(s).toMatch(/UPDATE public\.oficina_tipos_de_grupo SET pasos = \$pasos\$[\s\S]*limites = \$lim\$[\s\S]*WHERE familia = 'video_mesa';/)
    const upd = s.indexOf('UPDATE public.oficina_tipos_de_grupo')
    for (const g of GUARDAS) {
      const i = s.indexOf(g)
      expect(i, g).toBeGreaterThan(0)
      expect(i, g).toBeLessThan(upd)
    }
    expect(s.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(s.trimEnd().endsWith('COMMIT;')).toBe(true)
    expect(s).not.toMatch(/\b(DELETE|TRUNCATE|DROP|INSERT)\b/)
    // NO activa la familia (eso es el «dale» de Emilio a la prueba de la semana) ni toca topes ni indicaciones
    expect(s).not.toMatch(/familias_activas|cadena_config|tope_encargo_usd\s*=|indicaciones\s*=|activo\s*=/)
  })
  it('después de escribir comprueba que quedó encendida (plano por plano + aprobación) y con el tope 45', () => {
    const s = sentencias(MIG)
    const fin = s.slice(s.indexOf('UPDATE public.oficina_tipos_de_grupo'))
    expect(fin).toContain("limites->'video'->>'plano_por_plano'")
    expect(fin).toContain("IS DISTINCT FROM 'true'")
    expect(fin).toContain("p->>'clave' = 'aprobar_propuestas'")
  })
  it('la reversa es el espejo: exige lo encendido y devuelve los pasos de 2300 y los límites de 0520', () => {
    expect(tomar(REV, 'pasos_antes')).toEqual(PASOS_0720)
    expect(tomar(REV, 'lim_antes')).toEqual(LIM_0720)
    expect(tomar(REV, 'pasos')).toEqual(tomar(M2300, 'pasos'))
    expect(tomar(REV, 'lim')).toEqual(tomar(M0520, 'lim'))
    const s = sentencias(REV)
    expect(s.match(/\bUPDATE\b/g)).toHaveLength(1)
    for (const g of GUARDAS) expect(s.indexOf(g), g).toBeGreaterThan(0)
    expect(s).toContain('IS DISTINCT FROM NULL')
  })
})

describe('en seco, la plantilla encendida corre hasta la aprobación del dueño (US$ 0)', () => {
  it('la mesa presenta 3 propuestas, sale el borrador simulado de las 3 a 480p y el encargo espera al dueño; nada se filma', async () => {
    const b = brazo({ estados: () => hecho(1) })
    const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: VIDEO_MESA_ENCENDIDA_VIGENTE })
    M.P.mesa = crearMesaEnMemoria(TRAS_2012)
    M.P.video = b.v
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const TRES = [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
    const responder = (t: Turno) => {
      if (t.tipo === 'dirigir') return { texto: 'Idea rectora: tres caminos para el pan.' }
      if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: [TRES, '# Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé'].join('\n') }
      return { texto: `Respuesta de ${t.agente}.` }
    }
    const { ultima } = await jugar(M, id, a, responder, 120)
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno' })
    const e = M.encargos.get(id)!
    const bv = e.estado_del_motor.artefactos[ARTEFACTO_BORRADOR_VIDEO]?.datos as unknown as BorradoresDeVideo
    expect(bv).toMatchObject({ simulado: true, resolucion: '480p', costo_usd: 0 })
    expect(bv.propuestas).toHaveLength(3)
    expect(e.estado_del_motor.artefactos[PASO_IMAGENES_CLAVE_FINAL]).toBeUndefined()
    expect(e.estado_del_motor.artefactos.video).toBeUndefined()
    expect(b.reg.uniones).toBe(0)
    // lo único anotado en seco son los turnos de la mesa (costo de mentira del agente en memoria): ni el borrador ni el video cobran
    const gastos = (M as unknown as { gastos: Array<{ concepto: string; cost_usd: number }> }).gastos
    // las 6 imágenes clave de borrador (3 propuestas × 2 planos) se anotan en seco a US$ 0; no hay ningún gasto de video
    expect(gastos.filter((g) => g.concepto !== 'modelo')).toEqual(gastos.filter((g) => g.concepto === 'imagen' && g.cost_usd === 0))
    expect(gastos.filter((g) => g.concepto === 'imagen')).toHaveLength(6)
    expect(e.gasto_usd).toBeCloseTo(gastos.reduce((t, g) => t + g.cost_usd, 0), 6)
  })
})
