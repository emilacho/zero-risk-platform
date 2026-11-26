/**
 * 17-nov · «creativos en cada paso», tramo B (GO Lenovo · firma de Emilio 07:18 · punto 1) · la FOTO con su mesa corta (`post_mesa`).
 * Una sola instancia creativa: dirección visual, prompts y texto se deciden en UNA mesa (3 asientos, 1 ronda); la cola mecánica de la sala 1
 * lee lo que la mesa deja, con su forma de siempre. US$ 0: todo en memoria y en seco.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { FAMILIA_CON_MESA, familiaConMesa, gruposHermanos } from '../mesa/con-mesa'
import { artefactosDeLaFoto } from '../mesa/orquestador'
import { traducirPieza } from '../mesa/traductor'
import { CONVENCION_DE_LA_PIEZA } from '../mesa/pedidos'
import { FAMILIAS_MESA, FAMILIA_V1_DE } from '../mesa/tipos'
import { ASIENTOS_DE_LA_MESA_CORTA, DIFERENCIAS_CON_LA_FOTO, POST_MESA, RONDAS_DE_LA_MESA_CORTA, TOPE_DE_LA_MESA_USD } from '../plantillas/mesa'
import { POST_IMG_CON_JEFATURA } from '../plantillas/con-jefatura'
import { ESQUEMAS, validar } from '../salida'
import { datos } from '../ayudas'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import type { Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'


const PIEZA = (imagen: string, extra = '') => `## Objetivo
Que vengan a probar el plato del día · Escríbenos
## Concepto
El plato recién servido, visto de cerca
## Pieza
Sobre-título: Hoy en la casa
Título: El plato de hoy
Texto: Recién salido de la cocina
Llamado: Escríbenos
Qué se ve: el plato sobre la mesa de madera, luz de la mañana
Imagen: ${imagen}
## Pie
Hoy te esperamos con el plato del día, recién servido.
## Etiquetas
#platodeldia #almuerzo
${extra}`

describe('el traductor, modo foto', () => {
  it('una pieza con foto propia: el texto de la publicación, lo que va sobre la imagen y la foto elegida', () => {
    const t = traducirPieza(PIEZA('foto:f-01'), 'post')
    expect(t.ok).toBe(true)
    expect(t.pieza_post).toEqual({
      pie_de_foto: 'Hoy te esperamos con el plato del día, recién servido.', hashtags: ['#platodeldia', '#almuerzo'], llamado: 'Escríbenos',
      texto_en_imagen: { etiqueta: 'Hoy en la casa', titular: 'El plato de hoy', bajada: 'Recién salido de la cocina', boton: 'Escríbenos' },
    })
    expect(t.imagenes).toHaveLength(1)
    expect(t.imagenes[0]).toMatchObject({ ref: 'pieza', modo: 'real', foto_id: 'f-01' })
    expect(validar(ESQUEMAS['pieza_post.v1'], t.pieza_post)).toEqual([])
  })
  it('una imagen a generar lleva el concepto de la pieza', () => {
    const t = traducirPieza(PIEZA('generar: el plato del día servido sobre madera'), 'post')
    expect(t.imagenes[0]).toMatchObject({ ref: 'pieza', modo: 'generada' })
    expect((t.imagenes[0] as { concepto?: { idea?: string } }).concepto?.idea).toBe('El plato recién servido, visto de cerca')
  })
  it('la imagen sin texto también es una decisión de la mesa: sin título, la imagen va sin texto y la pieza sale igual', () => {
    const md = PIEZA('ninguna').replace('Sobre-título: Hoy en la casa\n', '').replace('Título: El plato de hoy\n', '').replace('Texto: Recién salido de la cocina\n', '').replace('Llamado: Escríbenos\n', '')
    const t = traducirPieza(md, 'post')
    expect(t.ok).toBe(true)
    expect(t.pieza_post?.texto_en_imagen).toEqual({})
    expect(t.imagenes[0]).toMatchObject({ modo: 'ninguna' })
  })
  it('sin texto de publicación ni título: UNA pregunta a la dirección; después, falla declarada', () => {
    const md = '## Pieza\nQué se ve: algo\nImagen: ninguna\n'
    const t1 = traducirPieza(md, 'post')
    expect(t1.ok).toBe(false)
    expect(t1.pregunta).toMatch(/texto de esta publicación/)
    const t2 = traducirPieza(md, 'post', { preguntasHechas: 9 })
    expect(t2.ok).toBe(false)
    expect(t2.pregunta).toBeUndefined()
  })
  it('sin «## Pie» usa el título y el texto de la imagen, con aviso', () => {
    const md = PIEZA('ninguna').replace(/## Pie\n.*\n/, '')
    const t = traducirPieza(md, 'post')
    expect(t.pieza_post?.pie_de_foto).toBe('El plato de hoy\n\nRecién salido de la cocina')
    expect(t.avisos.join(' ')).toMatch(/no dejó texto de publicación/)
  })
  it('el pedido a la mesa explica la convención de la foto (y no la del kit)', () => {
    const c = CONVENCION_DE_LA_PIEZA('post')
    expect(c).toMatch(/## Pieza/)
    expect(c).toMatch(/Imagen: foto:<id de una foto propia> \| generar: <qué debe mostrarse> \| ninguna/)
    expect(c).not.toMatch(/una sección por elemento del brief/)
  })
})

describe('lo que la mesa deja, con la forma que lee la cola de la sala 1', () => {
  const otros = (por_ref: Record<string, unknown> = {}) => ({ visual_direction: { origen: 'mesa', reglas_de_imagen: { obligatorio: [], prohibido: [] } }, prompts_validos: { por_ref } })
  it('foto propia: decisión «real» con su foto, sin prompts', () => {
    const a = artefactosDeLaFoto(traducirPieza(PIEZA('foto:f-07'), 'post'), otros())
    expect(a.visual_direction.decision).toEqual({ modo: 'real', foto_id: 'f-07', motivo: 'elegida por la mesa' })
    expect(a.visual_direction.origen).toBe('mesa')
    expect(a.prompts_validos).toMatchObject({ ninguno: true, prompts: [], indices: [] })
    expect(validar(ESQUEMAS['pieza_post.v1'], a.pieza_post)).toEqual([])
  })
  it('generada: decisión «generada» y los prompts de su ref en `prompts_validos.prompts` (lo que lee `imagen`)', () => {
    const a = artefactosDeLaFoto(traducirPieza(PIEZA('generar: el plato'), 'post'), otros({ pieza: { indices: [0], prompts: [{ prompt: 'a plate of food on wood, morning light' }] } }))
    expect(a.visual_direction.decision).toMatchObject({ modo: 'generada' })
    expect(a.prompts_validos).toMatchObject({ ninguno: false, indices: [0], prompts: [{ prompt: 'a plate of food on wood, morning light' }] })
  })
  it('ninguna: la pieza sale sin imagen y lo dice', () => {
    const a = artefactosDeLaFoto(traducirPieza(PIEZA('ninguna'), 'post'), otros())
    expect(a.visual_direction.decision).toMatchObject({ modo: 'ninguna' })
  })
})

/** la fila VIVA de `post_img` (versión 7), leída en producción el 17-nov (solo SELECT) */
const VIVA_POST_IMG = { margen: 6, max_rondas: 2, reuso_dias: 14, hashtags_max: 30, material_activo: true, pie_de_foto_max: 2200, roles_sin_imagen: ['cta', 'cierre'], tope_encargo_usd: 4, material_tope_usd: 0.4, material_plazo_min: 20, material_techo_min: 30, formato_por_omision: '1:1', limites_verificados: false, reserva_por_pieza_usd: 2.5, imagenes_generadas_max: 3, generar_cuando_no_hay_foto: true, material_max_pedidos_por_encargo: 1 }

describe('la plantilla `post_mesa`', () => {
  it('es de la mesa, de la clase de la foto (la jefatura revisa `pieza_post`), con 3 asientos y 1 ronda', () => {
    expect(FAMILIAS_MESA.post_mesa).toBe('post')
    expect(FAMILIA_V1_DE.post).toBe('post_img')
    expect(POST_MESA).toMatchObject({ tipo: 'post_mesa', familia: 'post_mesa', clase: POST_IMG_CON_JEFATURA.clase })
    expect(POST_MESA.limites).toMatchObject({ mesa: true, asientos: [...ASIENTOS_DE_LA_MESA_CORTA], rondas_de_la_mesa: RONDAS_DE_LA_MESA_CORTA, tope_encargo_usd: TOPE_DE_LA_MESA_USD })
  })
  it('UNA instancia creativa: ni dirección visual, ni prompts, ni texto, ni curador que mira, ni re-imagen; una mesa y una jefatura', () => {
    expect(POST_MESA.pasos.map((p) => p.clave)).toEqual(['abrir', 'elegir_foto', 'mesa', 'imagen', 'observar', 'elegir_version', 'acabado', 'chequeos', 'jefatura', 'chequeos_2', 'entrega', 'cierre'])
    expect(POST_MESA.pasos.filter((p) => p.tipo === 'agente' || p.tipo === 'portero')).toEqual([])
    expect(POST_MESA.pasos.filter((p) => p.tipo === 'jefatura')).toHaveLength(1)
    const de = (c: string) => POST_MESA.pasos.find((p) => p.clave === c)!
    expect(de('observar')).toMatchObject({ funcion: 'mesa_observar', condicion: de('imagen').condicion })
    expect(de('elegir_foto').entrada).toEqual(['encargo'])
    expect(de('mesa').entrada).toEqual(['candidatas_foto'])
  })
  it('tiene las MISMAS claves que la fila viva de `post_img` (con su valor de hoy), salvo las diferencias nombradas', () => {
    const lim = POST_MESA.limites as Record<string, unknown>
    for (const [k, v] of Object.entries(VIVA_POST_IMG)) if (!(DIFERENCIAS_CON_LA_FOTO as readonly string[]).includes(k)) expect([k, lim[k]]).toEqual([k, v])
    const sobran = Object.keys(lim).filter((k) => !(k in VIVA_POST_IMG) && !(DIFERENCIAS_CON_LA_FOTO as readonly string[]).includes(k))
    expect(sobran).toEqual([])
    expect(lim.reserva_por_pieza_usd).toBeUndefined()
  })
})

describe('la ruta lleva la foto a su mesa (20-nov: para cualquier cliente)', () => {
  it('`post_img` tiene versión con mesa; con la mesa apagada, nada cambia', () => {
    expect(FAMILIA_CON_MESA.post_img).toBe('post_mesa')
    expect(familiaConMesa('post_img', () => true)).toBe('post_mesa')
    expect(familiaConMesa('post_img', () => false)).toBe('post_img')
    expect(gruposHermanos('post_img')).toEqual(['post_img', 'post_mesa'])
    expect(gruposHermanos('post_mesa')).toEqual(['post_mesa', 'post_img'])
  })
})

const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo, version: 1 })
/** el directorio vivo de hoy CON las 4 marcas que siembra la migración del tramo B (`post` y `post:redacta_prompts`) */
const DIRECTORIO_CON_POST: Tarjeta[] = [
  tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'post', 'concepto:dirige', 'video:dirige']),
  tarjeta('jefe-marketing', 'direccion', ['reubicacion:dirige', 'fallidos:dirige']),
  tarjeta('design-visual-storyteller', 'miembro', ['kit', 'concepto', 'carrusel', 'video']),
  tarjeta('design-image-prompt-engineer', 'miembro', ['carrusel:redacta_prompts', 'kit:redacta_prompts', 'post:redacta_prompts']),
  tarjeta('content-creator', 'miembro', ['carrusel', 'kit', 'post', 'concepto', 'video']),
  tarjeta('marketing_instagram_curator', 'miembro', ['carrusel', 'kit', 'post', 'concepto:si_instagram', 'video:si_instagram']),
  tarjeta('portero', 'portero', []),
]

function montar(o: { mesaActiva?: boolean; directorio?: Tarjeta[] } = {}) {
  const M = crearMemoria({ plantilla: POST_IMG_CON_JEFATURA, config: { familias_activas: ['post_img', 'post_mesa'] } })
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = {
    post_img: { plantilla: JSON.parse(JSON.stringify(POST_IMG_CON_JEFATURA)), activo: true },
    post_mesa: { plantilla: JSON.parse(JSON.stringify(POST_MESA)), activo: o.mesaActiva ?? true },
  }
  M.P.almacen.leerPlantilla = async (f) => plantillas[f] ?? null
  const MS = crearMesaEnMemoria(o.directorio ?? DIRECTORIO_CON_POST)
  M.P.mesa = { ...MS }
  const abrir = () => abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, MS, abrir }
}

/** corre la mesa entera: aportes breves, la integración (la pieza con su imagen) y, si se genera, los prompts del ingeniero */
async function correrLaMesa(x: ReturnType<typeof montar>, imagen: string) {
  let r = await x.abrir()
  const id = String(r.cuerpo.encargo_id)
  const vistos: string[] = []
  for (let i = 0; i < 20 && r.cuerpo.accion === 'esperar'; i++) {
    const t = r.cuerpo.turno as { n: number; paso: string; agente: string }
    if (!t.paso.startsWith('mesa:')) break
    vistos.push(t.paso)
    const tipo = t.paso.split(':')[1]
    let texto = `(${t.agente}) aporte breve`
    if (tipo === 'integrar') {
      const citas = x.MS.filas.filter((f) => f.encargo_id === id && f.tipo === 'aporta').map((f) => `A${f.n} usé: ${f.de === 'content-creator' ? 'el titular y el llamado de la publicación' : 'la luz de la mañana sobre la madera'}`).join('\n')
      texto = PIEZA(imagen, `## Citas\n${citas}`)
    }
    if (tipo === 'redactar_prompts') texto = 'pieza: a freshly served plate of food on a wooden table, soft morning side light, close-up'
    r = await recibirResultado(x.M.P, id, t.n, { texto, costo_usd: 0, workflow_execution_id: `t-${t.n}` })
  }
  return { id, r, vistos, enc: () => x.M.encargos.get(id)! }
}

describe('por la puerta y la mesa reales (en seco)', () => {
  it('`post_mesa` APAGADA: la foto abre `post_img`, EXACTO como antes', async () => {
    const x = montar({ mesaActiva: false })
    const r = await x.abrir()
    const enc = x.M.encargos.get(String(r.cuerpo.encargo_id))!
    expect(enc.familia).toBe('post_img')
    expect(enc.sala_ref?.con_mesa).toBeUndefined()
  })
  it('con la mesa activa: abre `post_mesa` con el tope de la mesa y se sientan solo los asientos, más quien dirige', async () => {
    const x = montar()
    const m = await correrLaMesa(x, 'foto:f-01')
    expect(m.enc().familia).toBe('post_mesa')
    expect(m.enc().tope_usd).toBe(TOPE_DE_LA_MESA_USD)
    expect(m.enc().sala_ref?.con_mesa).toEqual({ de: 'post_img', a: 'post_mesa' })
    const agentes = new Set(m.vistos.map((p) => p.split(':')[2]))
    expect([...agentes].filter((a) => a && !['creative-director-mesa', ...ASIENTOS_DE_LA_MESA_CORTA].includes(a))).toEqual([])
    expect(m.vistos.some((p) => p.startsWith('mesa:integrar'))).toBe(true)
  })
  it('foto propia: la mesa deja `visual_direction`, `prompts_validos` y `pieza_post` con la forma de la sala 1, la cola entrega la foto real y la jefatura revisa la pieza', async () => {
    const x = montar()
    // 26-nov · la foto real tiene que existir entre las del cliente (antes `f-01`, que no existe: la pieza salía «real» SIN imagen, el error que arregla la red de seguridad).
    // La mesa la nombra ACORTADA, como lo hizo el equipo de verdad el 26-nov: se guarda el id entero
    const m = await correrLaMesa(x, 'foto:062e')
    const e = m.enc().estado_del_motor
    expect(datos(e, 'visual_direction')?.decision).toMatchObject({ modo: 'real', foto_id: '062ec4fa' })
    expect(validar(ESQUEMAS['pieza_post.v1'], datos(e, 'pieza_post'))).toEqual([])
    expect(datos(e, 'pieza_post')?.texto_en_imagen).toMatchObject({ titular: 'El plato de hoy' })
    expect(datos(e, 'imagen_final')).toMatchObject({ origen: 'real', foto_id: '062ec4fa', url: 'https://fotos.test/062ec4fa.jpg' })
    expect(x.M.llamadas.imagen).toBe(0)
    // la jefatura (no un agente de la línea de siempre) es lo siguiente que pide trabajo
    const t = m.r.cuerpo.turno as { paso?: string } | undefined
    expect(m.r.cuerpo.accion === 'esperar' ? String(t?.paso) : String(m.r.cuerpo.accion)).toMatch(/jefatura|entreg|listo|cerr/)
  })
  it('generada: los prompts del ingeniero llegan al generador y el observador de la mesa mira la imagen (no el curador sentado)', async () => {
    const x = montar()
    const m = await correrLaMesa(x, 'generar: el plato del día servido sobre madera')
    expect(m.vistos.some((p) => p.startsWith('mesa:redactar_prompts:design-image-prompt-engineer'))).toBe(true)
    const e = m.enc().estado_del_motor
    expect(datos(e, 'visual_direction')?.decision).toMatchObject({ modo: 'generada' })
    expect((datos(e, 'prompts_validos')?.prompts as Array<{ prompt: string }>)[0].prompt).toMatch(/plate of food/)
    expect(x.M.llamadas.imagen).toBe(1)
    expect(datos(e, 'observacion_imagen')).toMatchObject({ observador: expect.any(String) })
    expect(datos(e, 'imagen_final')).toMatchObject({ origen: 'generada' })
  })
  it('sin la marca `post` en el directorio (hoy): la pieza no abre en la mesa y lo dice (por eso la migración las siembra)', async () => {
    const sinPost = DIRECTORIO_CON_POST.map((t) => ({ ...t, pertinente_en: t.pertinente_en.filter((p) => !p.startsWith('post')) }))
    const x = montar({ directorio: sinPost })
    const m = await correrLaMesa(x, 'foto:f-01')
    expect(m.enc().estado).toBe('fallido')
    expect(JSON.stringify(m.enc())).toMatch(/dirección creativa activa para «post»/)
  })
})

describe('el observador de la mesa mira la FOTO (real, sin ensayo)', () => {
  const art = (d: unknown) => ({ version: 1, version_consumida: 0, datos: d })
  /** la imagen de la sala 1 NO lleva `ref` (como la deja el paso `imagen` de la sala 1) */
  const estado = () => ({ artefactos: {
    encargo: art({ F: { cliente_nombre: 'Náufrago', marca: { brand_handle: '@naufrago.ec' } } }),
    imagenes: art({ ultimo_intento: 1, items: [{ indice: 0, intento: 1, prompt_idx: 0, url: 'https://x.test/a.png', prompt: 'a plate of food' }] }),
    pieza_post: art({ pie_de_foto: 'Hoy te esperamos con el plato del día', hashtags: ['#platodeldia'], texto_en_imagen: { titular: 'El plato de hoy' } }),
  } })
  const correr = async (texto: string) => {
    const { observarImagenes } = await import('../mesa/observar')
    const pedidos: string[] = []
    const P = { revisor: async (p: { texto: string }) => { pedidos.push(p.texto); return { ok: true, texto, costo_usd: 0.004 } } }
    const r = await observarImagenes(P as never, { id: 'e', client_id: 'c', dry_run: false, estado_del_motor: estado() } as never, {} as never)
    return { r, pedidos, fichas: (r.res.fichas ?? []) as Array<{ id: string; gravedad: string }> }
  }
  it('el texto de la publicación y el de la imagen le llegan como «texto de la pieza» (lo que se escribe sobre la foto no es ajeno)', async () => {
    const { pedidos, r } = await correr('TEXTO_VISIBLE: "El plato de hoy"\nMARCAS: ninguna\nPERSONAS: 0\nTEXTO_AJENO: no\nDATO_SIN_VERIFICAR: no')
    const textoDeLaPieza = pedidos[0].split('Texto de la pieza:')[1] ?? ''
    expect(textoDeLaPieza).toMatch(/El plato de hoy/)
    expect(textoDeLaPieza).toMatch(/Hoy te esperamos con el plato del día/)
    expect((r.res.artefacto as { veredicto: { pasan: number[] } }).veredicto.pasan).toEqual([0])
  })
  it('si no la acepta, la ficha nombra la imagen de la pieza («pieza»), no un «undefined»', async () => {
    const { fichas, r } = await correr('')
    expect(fichas.map((f) => f.id)).toEqual(['observador-pieza'])
    expect(JSON.stringify(fichas)).toMatch(/la imagen de «pieza»/)
    expect(JSON.stringify(r.res.artefacto)).not.toMatch(/undefined/)
  })
})

describe('la migración del tramo B es el dato EXACTO del código', () => {
  const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/202611171400_oficina_post_mesa.sql'), 'utf8')
  const rev = readFileSync(join(__dirname, '../../../../supabase/reversas/202611171400_oficina_post_mesa_REVERSA.sql'), 'utf8')
  const entre = (t: string, tag: string) => JSON.parse(t.split(`$${tag}$`)[1])
  it('pasos y límites iguales a POST_MESA; nace apagada, clase de la foto, tope 5', () => {
    expect(entre(sql, 'pasos')).toEqual(JSON.parse(JSON.stringify(POST_MESA.pasos)))
    expect(entre(sql, 'lim')).toEqual(JSON.parse(JSON.stringify(POST_MESA.limites)))
    expect(sql).toMatch(/2, 5\.00, false, 'post_img'\r?\n\);/)
  })
  it('el directorio SOLO suma las 4 marcas que la prueba de punta a punta necesita, y la reversa las quita', () => {
    expect(sql).not.toMatch(/array_remove/)
    expect(sql).toMatch(/array_append\(pertinente_en, 'post'\)[\s\S]*'creative-director-mesa', 'content-creator', 'marketing_instagram_curator'/)
    expect(sql).toMatch(/array_append\(pertinente_en, 'post:redacta_prompts'\)[\s\S]*'design-image-prompt-engineer'/)
    expect(rev).toMatch(/FROM public\.oficina_tipos_de_grupo WHERE tipo = 'post_mesa';/)
    expect(rev).toMatch(/array_remove\(pertinente_en, 'post'\)/)
    expect(rev).toMatch(/array_remove\(pertinente_en, 'post:redacta_prompts'\)/)
  })
  it('la palanca del tramo A no se toca y se niega con encargos vivos', () => {
    expect(sql).not.toMatch(/public\.cadena_config/)
    expect(sql).toMatch(/estado IN \('abierto', 'en_paso'\)/)
  })
})
