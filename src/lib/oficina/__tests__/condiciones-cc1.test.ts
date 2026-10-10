/**
 * Las condiciones de CC#1 a la certificación de la sala 1 (raw/tasks/2026-10-10-CERTIFICACION-CC1-sala-1-completa.md), cada una con su prueba:
 *  C1 teléfonos que no lo son · C2 contador de reintento de formato · foto real que falla el control ③ · el plan del cliente como fuente.
 */
import { describe, expect, it } from 'vitest'
import { chequeosDePost } from '../chequeos'
import { planDeOrigen } from '../brief'
import { abrirEncargo } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { datosDeContacto, esFechaORangoOCifra } from '../texto'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PARTE_OTRO_PRODUCTO, PARTE_REAL, FICHAS_VACIAS, crearMemoria, correr, direccionGenerada, direccionReal, observacion, type Guion, type Memoria } from './memoria'

const abierto = async (M: Memoria, brief = 'BRF-0003') => String((await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: brief, dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })).cuerpo.encargo_id)
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const PIEZA = JSON.stringify({ pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp al 0997744288.', hashtags: ['#ceviche'] })

describe('C1 · una fecha, un rango o una cifra con miles NO es un teléfono', () => {
  it('lo que no es teléfono', () => {
    for (const t of ['2026-10-09', '2026/10/09', '09/10/2026', '9-10-26', '10-11-12', '10 - 11 - 12', '1.250.000', '1,250,000', '12.500,50']) expect(esFechaORangoOCifra(t), t).toBe(true)
  })
  it('lo que SÍ es teléfono sigue siéndolo', () => {
    for (const t of ['0997 744 288', '+593 997 744 288', '099-774-4288', '(02) 255-1234', '0997744288']) expect(esFechaORangoOCifra(t), t).toBe(false)
    expect(datosDeContacto('Escríbenos al 0997 744 288 o al +593 99 774 4288').telefonos).toEqual(['997744288', '997744288'])
  })
  it('un pie de foto con una fecha o una cifra grande no abre ficha de teléfono ajeno; uno con un teléfono ajeno, sí', () => {
    const base = { fuentes: { palabras_prohibidas: [], telefonos: ['+593 997 744 288'], handles: [], precios: [], competidores: [], registro: 'tuteo' as const }, limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false } }
    const limpio = chequeosDePost({ ...base, pieza: { pie_de_foto: 'Desde el 2026-10-09 y hasta el 10-11-12, más de 1.250.000 platos servidos.', hashtags: [] } })
    expect(limpio.filter((f) => /teléfono/.test(f.que ?? ''))).toEqual([])
    const ajeno = chequeosDePost({ ...base, pieza: { pie_de_foto: 'Llama al 0991112223', hashtags: [] } })
    expect(ajeno.some((f) => /teléfono/.test(f.que ?? '') && f.gravedad === 'bloquea')).toBe(true)
  })
})

describe('C2 · el reintento de formato es de cada PASE de una vuelta, no del paso', () => {
  it('el curador falla el formato en el 1.er pase (reintenta y lo arregla), la imagen no cumple y se regenera, y en el 2.º pase vuelve a fallar el formato: TAMBIÉN tiene su reintento', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const g: Guion = {
      paquete: () => ({ texto: 'material' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
      mirar: (n, t) => ({ texto: n === 1 || n === 3 ? '{esto no es json' : observacion(indicesDe(t), { falta: n === 2 ? 'o1' : undefined }) }),
      texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }),
    }
    const { pasos, ultima } = await correr(M, id, g)
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(4)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it('sigue siendo un solo reintento por pase: dos fallos seguidos en el mismo pase cierran FALLIDO', async () => {
    const M = crearMemoria()
    const id = await abierto(M)
    const g: Guion = {
      paquete: () => ({ texto: 'material' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
      mirar: () => ({ texto: '{esto no es json' }), texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }),
    }
    const { ultima } = await correr(M, id, g)
    expect(ultima.cuerpo).toMatchObject({ estado: 'fallido' })
  })
})

describe('una foto REAL que no cumple el brief se descarta explícitamente (control ③)', () => {
  const guion = (obs: string): Guion => ({
    paquete: () => ({ texto: 'material' }), direccion_visual: () => ({ texto: direccionReal('ef0921ad') }), mirar: () => ({ texto: obs }),
    texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  })
  const obs = (ajeno?: string) => JSON.stringify({ imagenes: [{ indice: 1000, reglas: [], texto_en_imagen: ajeno ? [ajeno] : [], marcas: [], personas: 0 }], preferencia: [1000] })
  const obsReal = (ajeno?: string) => JSON.stringify({ imagenes: [{ indice: 0, reglas: [], texto_en_imagen: ajeno ? [ajeno] : [], marcas: [], personas: 0 }], preferencia: [0] })
  it('con un teléfono ajeno visible en la foto: no se entrega, el uso no se registra y la pieza sale con desacuerdo', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    const { ultima } = await correr(M, id, guion(obsReal('Llama al 0991112223')))
    const fin = M.encargos.get(id)!.estado_del_motor.artefactos['imagen_final'].datos as { origen: string; nota: string; url?: string }
    expect(fin.origen).toBe('ninguna'); expect(fin.nota).toMatch(/descartó/); expect(fin.url).toBeUndefined()
    expect(M.usos).toEqual([])
    expect(ultima.cuerpo).toMatchObject({ con_desacuerdo: true })
  })
  it('si la foto cumple, se entrega y se registra su uso (como antes)', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    await correr(M, id, guion(obsReal()))
    expect(M.encargos.get(id)!.estado_del_motor.artefactos['imagen_final'].datos).toMatchObject({ origen: 'real' })
    expect(M.usos).toEqual([{ foto_id: 'ef0921ad', rol: 'pieza' }])
    void obs
  })
})

describe('el plan del cliente es una fuente más', () => {
  it('se lee el plan de origen que dice la parte y viaja en la tarea de cada empleado', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO })
    const id = await abierto(M)
    const { tareas } = await correr(M, id, { paquete: () => ({ texto: 'm' }), direccion_visual: () => ({ texto: direccionReal('ef0921ad') }), mirar: () => ({ texto: JSON.stringify({ imagenes: [{ indice: 0, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 }], preferencia: [0] }) }), texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }) })
    expect(M.llamadas.planes).toEqual(['29d6daeb-a95a-4328-9c10-cf3cddc236f7'])
    expect(tareas['texto'][0]).toMatch(/Plan de trabajo del cliente[\s\S]*PLAN DE TRABAJO DE PRUEBA/)
    expect(tareas['revision_jefe'][0]).toMatch(/PLAN DE TRABAJO DE PRUEBA/)
  })
  it('si el plan no se puede leer, no se inventa: la tarea no trae esa sección', async () => {
    const M = crearMemoria({ parte: PARTE_OTRO_PRODUCTO, plan: null, fuentes: { plan_texto: null } })
    const id = await abierto(M)
    const { tareas } = await correr(M, id, { paquete: () => ({ texto: 'm' }), direccion_visual: () => ({ texto: direccionReal('ef0921ad') }), mirar: () => ({ texto: JSON.stringify({ imagenes: [{ indice: 0, reglas: [], texto_en_imagen: [], marcas: [], personas: 0 }], preferencia: [0] }) }), texto: () => ({ texto: PIEZA }), revision_jefe: () => ({ texto: FICHAS_VACIAS }) })
    expect(tareas['texto'][0]).not.toMatch(/Plan de trabajo del cliente/)
  })
  it('planDeOrigen: lee el uuid del encabezado, y nada si la parte no lo dice', () => {
    expect(planDeOrigen(PARTE_REAL)).toBe('29d6daeb-a95a-4328-9c10-cf3cddc236f7')
    expect(planDeOrigen('# PARTE\nsin plan')).toBeNull()
  })
})
