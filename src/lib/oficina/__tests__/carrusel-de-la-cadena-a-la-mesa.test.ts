/**
 * 20-nov · GO Lenovo «la mesa para todos los clientes» (firma de Emilio 12:37 Zúrich) · punto 2: el carrusel que pide la cadena llega como `carrusel_ig_v1`
 * (`cadena_formatos_por_red`: instagram, facebook y linkedin `carrusel` → `carrusel_ig_v1`, leído en vivo el 20-nov) y antes entraba por la línea vieja.
 * Ahora la puerta de la oficina lo abre en `carrusel_mesa`, para cualquier cliente. US$ 0: memoria y en seco.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_IG_CON_JEFATURA } from '../plantillas/con-jefatura'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

const OTRO = '00000000-0000-4000-8000-000000000099'
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const BRIEF = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el producto
- PROTAGONISTA: El producto. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- LLAMADO A LA ACCIÓN: Escríbenos
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`

function montar(o: { mesaActiva?: boolean; cliente?: string; extra?: Record<string, unknown> } = {}) {
  const M = crearMemoria({ parte: parteCon(BRIEF), plantilla: CARRUSEL_IG_CON_JEFATURA, fuentes: { fotos: [] }, config: { familias_activas: ['carrusel_ig_v1', 'carrusel_mesa'] } })
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = {
    carrusel_ig_v1: { plantilla: JSON.parse(JSON.stringify(CARRUSEL_IG_CON_JEFATURA)), activo: true },
    carrusel_mesa: { plantilla: JSON.parse(JSON.stringify(CARRUSEL_MESA)), activo: o.mesaActiva ?? true },
  }
  M.P.almacen.leerPlantilla = async (f) => plantillas[f] ?? null
  M.P.mesa = { ...crearMesaEnMemoria() }
  const abrir = () => abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_ig_v1', ...(o.extra ?? {}) }, client_id: o.cliente ?? CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, abrir, encargo: () => [...M.encargos.values()].at(-1)! }
}

describe('el carrusel de la cadena entra a su mesa', () => {
  it('`carrusel_ig_v1` abre `carrusel_mesa` y deja dicho de qué familia vino', async () => {
    const x = montar()
    const r = await x.abrir()
    expect(r.status).toBeLessThan(300)
    expect(x.encargo().familia).toBe('carrusel_mesa')
    expect(x.encargo().tipo_de_grupo).toBe('carrusel_mesa')
    expect(x.encargo().sala_ref?.con_mesa).toEqual({ de: 'carrusel_ig_v1', a: 'carrusel_mesa' })
  })
  it('también para un cliente que no estaba en la vieja lista', async () => {
    const x = montar({ cliente: OTRO })
    await x.abrir()
    expect(x.encargo().familia).toBe('carrusel_mesa')
  })
  it('con `carrusel_mesa` apagada sigue por `carrusel_ig_v1` (nunca queda sin producir)', async () => {
    const x = montar({ mesaActiva: false })
    await x.abrir()
    expect(x.encargo().familia).toBe('carrusel_ig_v1')
  })
  it('un carrusel en curso nacido sin mesa (reapertura) sigue sin mesa: la pieza en curso no cambia de línea', async () => {
    const x = montar({ extra: { reabrir_causa_corregida: 'se corrigió la lámina 3' } })
    await x.abrir()
    expect(x.encargo().familia).toBe('carrusel_ig_v1')
  })
})
