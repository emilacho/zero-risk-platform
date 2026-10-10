import { describe, expect, it } from 'vitest'
import { abrirEncargo, avanzar } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import { CLIENTE, PARTE, FICHAS_VACIAS, FUENTES, correr, crearMemoria, type Guion, type Memoria } from './memoria'

const j = (x: unknown) => JSON.stringify(x)

// ───────────────────────── briefs (formato de la parte: «### ID · red · formato» + campos)
const BRIEF_CARRUSEL = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el plato del día
- PROTAGONISTA: El plato del día. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- VOCABULARIO OBLIGATORIO:
  - plato
- PROHIBIDO:
  - premium
- SINTAXIS: Frases cortas.
- VISUAL: El plato aparece completo. No aparecen personas.
- VISUAL OBLIGATORIO:
  - El plato aparece completo
- VISUAL PROHIBIDO:
  - No aparecen personas
- LLAMADO A LA ACCIÓN: Escríbenos por WhatsApp
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`
const BRIEF_KIT = `### BRF-0200 · Instagram · kit_historias
- QUÉ ES: Kit semanal de historias y estados
- PROTAGONISTA: El plato del día.
- LÍMITES: 9:16
- VISUAL: Fondo de la marca, sin personas.
- ELEMENTOS:
  - 2026-10-14 18:30 | historia | el plato del día | producto | precio 7.00
  - 2026-10-15 09:00 | estado | horario de la semana | servicio
  - 2026-10-16 12:00 | historia | mensaje de la semana | marca
- LLAMADO A LA ACCIÓN: Escríbenos
`
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`

const REGLAS = { obligatorio: [{ id: 'o1', texto: 'el plato completo', claves: ['plato'], cita: 'El plato aparece completo' }], prohibido: [{ id: 'p1', texto: 'personas', claves: ['personas'], cita: 'No aparecen personas' }] }
const sinImagenes = j({ resumen: 'Fondo de la marca', imagenes: [], reglas_de_imagen: { obligatorio: [], prohibido: [] } })
const conImagenGenerada = (ref = 'hook', reglas = REGLAS) => j({ resumen: 'Luz natural lateral', estilo: 'directo', imagenes: [{ ref, modo: 'generada', motivo: 'no hay foto real que sirva' }], reglas_de_imagen: reglas })
const promptsDe = (refs: string[]) => j({ imagenes: refs.map((ref) => ({ ref, prompts: [
  { prompt: 'Un plato servido sobre una mesa de madera clara, luz natural lateral. El plato aparece completo. Sin personas, sin texto', idea_en_una_linea: 'cenital' },
  { prompt: 'A nivel de mesa, fondo de cocina desenfocado. El plato aparece completo. Sin personas ni logos', idea_en_una_linea: 'nivel de mesa' },
  { prompt: 'Una mesa de madera vacía junto a una ventana luminosa.', idea_en_una_linea: 'no cubre lo obligatorio' }] })), tamaño: '1080x1350' })
const observacion = (indices: number[], o: { falta?: boolean } = {}) => j({
  imagenes: indices.map((indice) => ({ indice, reglas: [{ id: 'o1', presente: !o.falta, evidencia: 'v' }, { id: 'p1', presente: false, evidencia: 'no hay' }, { id: 'brief-o1', presente: !o.falta, evidencia: 'v' }, { id: 'brief-p1', presente: false, evidencia: 'no hay' }], texto_en_imagen: [], marcas: [], personas: 0, producto: 'plato' })),
  preferencia: indices,
})
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))

const TEXTO_BASE = 'Cada mañana empieza igual.\nHoy cambia el plato del día.\nPrueba el plato del día.\nLo preparamos al momento.\nEscríbenos por WhatsApp'
const COPIA = { texto_base: TEXTO_BASE, pie_de_foto: 'El plato del día te espera.', hashtags: ['#plato'], llamado: 'Escríbenos por WhatsApp' }
const LAMINAS = [
  { rol: 'hook', headline: 'Cada mañana empieza igual' }, { rol: 'problem', headline: 'Hoy cambia el plato del día' }, { rol: 'reframe', headline: 'Prueba el plato del día' },
  { rol: 'benefit', headline: 'Lo preparamos al momento' }, { rol: 'cta', headline: 'Escríbenos por WhatsApp', cta: 'Escríbenos por WhatsApp' },
]

const guionCarrusel = (o: Partial<Record<keyof typeof BASE_C, Guion[string]>> = {}): Guion => ({ ...BASE_C, ...o } as Guion)
const BASE_C = {
  paquete: () => ({ texto: 'material del portero: fotos etiquetadas, sedes, manual vigente' }),
  direccion_visual: () => ({ texto: sinImagenes }),
  prompts: () => ({ texto: promptsDe(['hook']) }),
  mirar: (_n: number, t: string) => ({ texto: observacion(indicesDe(t)) }),
  texto: () => ({ texto: j(COPIA) }),
  laminas: () => ({ texto: j({ laminas: LAMINAS }) }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  corrige_texto: () => ({ texto: '{"respuestas": []}' }), ajusta_laminas: () => ({ texto: '{"respuestas": []}' }), corrige_laminas: () => ({ texto: '{"respuestas": []}' }),
  decide_texto: () => ({ texto: '{"respuestas": []}' }), decide_imagen: () => ({ texto: '{"respuestas": []}' }), ajusta_laminas_2: () => ({ texto: '{"respuestas": []}' }), decide_laminas: () => ({ texto: '{"respuestas": []}' }),
}

const ESTRUCTURA = { elementos: [
  { ref: 'e01', rol: 'apertura', beat: 'presentar el plato', mood: 'cálido', foto_slot: 'e01' }, { ref: 'e02', rol: 'servicio', beat: 'cuándo y dónde', mood: 'claro' }, { ref: 'e03', rol: 'cierre', beat: 'invitar', mood: 'cercano' },
] }
const COPY_KIT = { elementos: [
  { ref: 'e01', headline: 'El plato del día', body: 'Hoy cuesta 7.00', acompanamiento: 'Hoy: el plato del día. Pídelo por mensaje.', hashtags: ['#plato'] },
  { ref: 'e02', headline: 'Abrimos de jueves a lunes', acompanamiento: 'Horario de la semana.' },
  { ref: 'e03', headline: 'Escríbenos', cta: 'Escríbenos', acompanamiento: 'Te esperamos.' },
] }
const BASE_K = {
  paquete: BASE_C.paquete, direccion_visual: BASE_C.direccion_visual, prompts: BASE_C.prompts, mirar: BASE_C.mirar,
  narrativa: () => ({ texto: j(ESTRUCTURA) }), texto: () => ({ texto: j(COPY_KIT) }), revision_jefe: BASE_C.revision_jefe,
  corrige_texto: BASE_C.corrige_texto, decide_imagen: BASE_C.decide_imagen, corrige_estructura: () => ({ texto: '{"respuestas": []}' }), decide_texto: BASE_C.decide_texto, decide_estructura: () => ({ texto: '{"respuestas": []}' }),
}
const guionKit = (o: Partial<Record<keyof typeof BASE_K, Guion[string]>> = {}): Guion => ({ ...BASE_K, ...o } as Guion)

async function abierto(plantilla: Plantilla, brief: string, brief_id: string, o: { dry_run?: boolean; fuentes?: Parameters<typeof crearMemoria>[0] extends infer X ? (X extends { fuentes?: infer F } ? F : never) : never } = {}) {
  const M = crearMemoria({ parte: parteCon(brief), plantilla, ...(o.fuentes ? { fuentes: o.fuentes } : {}) })
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id, dry_run: o.dry_run ?? true, familia: plantilla.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, a, id: String(a.cuerpo.encargo_id) }
}
const abiertoC = (o: Parameters<typeof abierto>[3] = {}) => abierto(CARRUSEL_IG_V1, BRIEF_CARRUSEL, 'BRF-0100', o)
const abiertoK = (o: Parameters<typeof abierto>[3] = {}) => abierto(KIT_HISTORIAS, BRIEF_KIT, 'BRF-0200', o)
const arte = (M: Memoria, id: string, n: string) => M.encargos.get(id)!.estado_del_motor.artefactos[n]?.datos as Record<string, any>
const fichas = (M: Memoria, id: string) => M.encargos.get(id)!.estado_del_motor.fichas

describe('SALA 2 · carrusel · punta a punta con modelo simulado', () => {
  it('dry_run: recorre el camino, dibuja las láminas en simulacro y no llama a ningún proveedor ni escribe salida/bandeja', async () => {
    const { M, id, a } = await abiertoC()
    expect(a.status).toBe(200)
    const { ultima, pasos } = await correr(M, id, guionCarrusel())
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'texto', 'laminas', 'revision_jefe'])
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: false, simulado: true, resultado_para_la_sala: 'encargo_en_bandeja' })
    expect(M.llamadas.render).toBe(1); expect(M.llamadas.renderReal).toBe(0)
    expect(M.llamadas.imagenReal).toBe(0); expect(M.llamadas.revisorReal).toBe(0)
    expect(M.llamadas.salida).toBe(0); expect(M.llamadas.bandeja).toHaveLength(0); expect(M.llamadas.guardadoDeArchivos).toBe(0)
    expect(arte(M, id, 'render').urls).toHaveLength(5)
  })
  it('real: dibuja con el brazo en su subcarpeta, empaqueta la entrega, escribe la salida y la bandeja con su vencimiento', async () => {
    const { M, id } = await abiertoC({ dry_run: false })
    const { ultima } = await correr(M, id, guionCarrusel())
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false, simulado: false })
    expect(M.llamadas.renderPedidos[0]).toMatchObject({ plataforma: 'instagram-feed', subcarpeta: `oficina/${id}`, slug: 'cliente-de-practica' })
    expect(M.llamadas.renderPedidos[0].slides).toHaveLength(5)
    expect(M.llamadas.renderPedidos[0].slides.every((s) => s.background_image_url === null)).toBe(true)
    expect(M.llamadas.archivos.filter((n) => n.endsWith('.png'))).toEqual(Array.from({ length: 5 }, (_, i) => `sin-fecha_sin-hora_instagram_carrusel_BRF-0100_0${i + 1}-de-05.png`))
    expect(M.llamadas.archivos).toContain('manifest.json'); expect(M.llamadas.archivos.some((n) => n.endsWith('_texto.txt'))).toBe(true); expect(M.llamadas.archivos.some((n) => n.endsWith('_publicar.md'))).toBe(true)
    expect(M.llamadas.salida).toBe(1); expect(M.llamadas.bandeja).toHaveLength(1)
    expect(M.llamadas.bandeja[0].expires_at).toBe('2026-10-14T05:00:00.000Z') // 14-oct 00:00 en America/Guayaquil
    expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/Carrusel BRF-0100.*5 láminas/)
    expect((M.llamadas.salidas[0] as { contenido: { laminas: unknown[] } }).contenido.laminas).toHaveLength(5)
  })
  it('no hay brazo de publicación: la entrega es para publicar A MANO', async () => {
    const { M, id } = await abiertoC({ dry_run: false })
    await correr(M, id, guionCarrusel())
    const hoja = arte(M, id, 'entrega')
    expect(JSON.stringify(hoja)).not.toMatch(/api\/social|meta-social|publicar_en/i)
    expect(hoja.nombres.some((n: string) => n.endsWith('_publicar.md'))).toBe(true)
  })
  it('el texto de una lámina que NO es del autor: un reintento con el error literal; si lo corrige, sigue limpio', async () => {
    const { M, id } = await abiertoC()
    const mala = LAMINAS.map((l, i) => (i === 1 ? { ...l, headline: 'Hoy todo cambia para siempre' } : l))
    const { tareas, ultima } = await correr(M, id, guionCarrusel({ laminas: (n) => ({ texto: j({ laminas: n === 1 ? mala : LAMINAS }) }) }))
    expect(tareas['laminas']).toHaveLength(2); expect(tareas['laminas'][1]).toMatch(/recorte literal/)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
  })
  it('si el diseñador sigue escribiendo texto nuevo tras el reintento, la pieza sale con desacuerdo (ficha que bloquea), nunca se corrige a mano', async () => {
    const { M, id } = await abiertoC()
    const mala = LAMINAS.map((l, i) => (i === 1 ? { ...l, headline: 'Hoy todo cambia para siempre' } : l))
    const { ultima } = await correr(M, id, guionCarrusel({ laminas: () => ({ texto: j({ laminas: mala }) }) }))
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: true })
    expect(fichas(M, id).some((f) => f.gravedad === 'bloquea' && f.donde === 'laminas' && /recorte literal/.test(f.que ?? ''))).toBe(true)
  })
  it('la plataforma, el tamaño y las preguntas abiertas que escriba el diseñador se ignoran y se anotan', async () => {
    const { M, id } = await abiertoC()
    const { ultima } = await correr(M, id, guionCarrusel({ laminas: () => ({ texto: j({ platform: 'tiktok', platforms_requested: ['a'], open_questions: ['¿qué color?'], laminas: LAMINAS.map((l) => ({ ...l, size: '1x1' })) }) }) }))
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
    expect(JSON.stringify(arte(M, id, 'laminas'))).not.toMatch(/tiktok|open_questions|1x1/)
    expect(M.llamadas.renderPedidos[0].plataforma).toBe('instagram-feed')
  })
  it('una palabra prohibida del manual en el texto del autor abre ficha que bloquea (chequeo duro) y el jefe ya la ve', async () => {
    const { M, id } = await abiertoC()
    const { tareas } = await correr(M, id, guionCarrusel({
      texto: () => ({ texto: j({ ...COPIA, pie_de_foto: 'Un plato premium te espera.' }) }),
    }))
    expect(tareas['revision_jefe'][0]).toMatch(/premium/)
    expect(fichas(M, id).some((f) => f.gravedad === 'bloquea' && /premium/.test(f.que ?? ''))).toBe(true)
  })
  it('un porcentaje inventado en las láminas bloquea', async () => {
    const { M, id } = await abiertoC()
    const base = TEXTO_BASE.replace('Lo preparamos al momento', 'Sube 80% tus ventas')
    const lam = LAMINAS.map((l, i) => (i === 3 ? { ...l, headline: 'Sube 80% tus ventas' } : l))
    await correr(M, id, guionCarrusel({ texto: () => ({ texto: j({ ...COPIA, texto_base: base }) }), laminas: () => ({ texto: j({ laminas: lam }) }) }))
    expect(fichas(M, id).some((f) => f.gravedad === 'bloquea' && /80%/.test(f.que ?? ''))).toBe(true)
  })
  it('un hallazgo del jefe sobre el texto: corrige el autor, el diseñador vuelve a recortar y se vuelve a dibujar (2 dibujos)', async () => {
    const { M, id } = await abiertoC()
    const nuevaCopia = { ...COPIA, texto_base: TEXTO_BASE.replace('Hoy cambia el plato del día', 'Hoy cambia tu mañana') }
    const nuevas = LAMINAS.map((l, i) => (i === 1 ? { ...l, headline: 'Hoy cambia tu mañana' } : l))
    const { pasos, ultima } = await correr(M, id, guionCarrusel({
      revision_jefe: () => ({ texto: j({ fichas: [{ que: 'el gancho es tibio', donde: 'texto', contra_que: 'brief', gravedad: 'bloquea', propuesta: 'más directo' }] }) }),
      corrige_texto: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(jefe-[^\]]+)\]/.exec(t)![1], estado: 'tomada', razon: 'ok' }], copia: nuevaCopia }) }),
      ajusta_laminas: () => ({ texto: j({ respuestas: [], laminas: nuevas }) }),
    }))
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'texto', 'laminas', 'revision_jefe', 'corrige_texto', 'ajusta_laminas'])
    expect(M.llamadas.render).toBe(2)
    expect(JSON.stringify(M.llamadas.renderPedidos[1].slides)).toMatch(/Hoy cambia tu mañana/)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
  })
  it('si el autor cambia el texto y el diseñador NO vuelve a recortar (laminas obsoletas), se le pide una vez y luego queda ficha que bloquea', async () => {
    const { M, id } = await abiertoC()
    const nuevaCopia = { ...COPIA, texto_base: TEXTO_BASE.replace('Hoy cambia el plato del día', 'Hoy cambia tu mañana') }
    const { ultima, tareas } = await correr(M, id, guionCarrusel({
      revision_jefe: () => ({ texto: j({ fichas: [{ que: 'x', donde: 'texto', contra_que: 'brief', gravedad: 'bloquea', propuesta: 'y' }] }) }),
      corrige_texto: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(jefe-[^\]]+)\]/.exec(t)![1], estado: 'tomada', razon: 'ok' }], copia: nuevaCopia }) }),
      ajusta_laminas: () => ({ texto: j({ respuestas: [] }) }), // no recorta de nuevo
    }))
    expect(tareas['ajusta_laminas']).toHaveLength(2)
    expect(ultima.cuerpo).toMatchObject({ con_desacuerdo: true })
  })
  it('un hallazgo de láminas lo atiende el diseñador, sin tocar el texto del autor', async () => {
    const { M, id } = await abiertoC()
    const { pasos } = await correr(M, id, guionCarrusel({
      revision_jefe: () => ({ texto: j({ fichas: [{ que: 'el orden confunde', donde: 'laminas', contra_que: 'brief', gravedad: 'bloquea', propuesta: 'reordenar' }] }) }),
      corrige_laminas: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(jefe-[^\]]+)\]/.exec(t)![1], estado: 'tomada', razon: 'ok' }], laminas: [LAMINAS[1], LAMINAS[0], ...LAMINAS.slice(2)] }) }),
    }))
    expect(pasos).toContain('corrige_laminas'); expect(pasos).not.toContain('corrige_texto')
    expect(M.llamadas.render).toBe(2)
  })
  it('🔴 el revisor externo recibe la pieza (texto + hasta 4 láminas dibujadas) y el cerebro del cliente, con UNA pregunta abierta; sin reglas y sin nada del jefe ni del diseñador', async () => {
    const { M, id } = await abiertoC()
    await correr(M, id, guionCarrusel({ revision_jefe: () => ({ texto: j({ fichas: [{ que: 'SECRETO-DEL-JEFE', donde: 'texto', contra_que: 'brief', gravedad: 'sugerencia', propuesta: 'x' }] }) }) }))
    expect(M.llamadas.revisor).toBe(1)
    const t = M.llamadas.revisorPedidos[0]
    expect(t).toMatch(/^Te comparto una pieza, que se usa para .+ Usa el contexto para entender lo que te comparto, no para justificarlo\./)
    expect(t).not.toMatch(/\{qué es\}|\{uso\}|\{público\}|\{objetivo\}/)
    const pos = ['## Resumen del encargo', '## La pieza', '## Contexto de la marca'].map((x) => t.indexOf(x))
    expect(pos.every((p) => p >= 0) && pos[0] < pos[1] && pos[1] < pos[2], 'orden: resumen → pieza → contexto').toBe(true)
    for (const s of ['### Manual de marca del cliente — ', '### Plan de trabajo del cliente — ', '### El brief de este entregable — ', '### Lo que reunió el portero — ']) expect(t).toContain(s)
    expect(t).toContain('Texto base:'); expect(t).toContain('Láminas:')
    expect(t).not.toMatch(/SECRETO-DEL-JEFE|visual_direction|reglas_de_imagen|gravedad|rúbrica|JSON/i)
    expect(M.llamadas.revisorImagenes[0].length).toBeGreaterThanOrEqual(3); expect(M.llamadas.revisorImagenes[0].length).toBeLessThanOrEqual(4)
    expect(M.llamadas.revisorImagenes[0].every((u) => /\.test\//.test(u))).toBe(true)
  })
  it('si el brazo no responde (también al reintentar), el encargo cierra FALLIDO y visible; nunca una pieza sin láminas', async () => {
    const { M, id } = await abiertoC()
    M.renderFalla = () => true
    const { ultima } = await correr(M, id, guionCarrusel())
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(String(ultima.cuerpo.motivo)).toMatch(/dibujar las láminas/)
    expect(M.llamadas.render).toBe(2)
    expect(M.llamadas.avisos.some((x) => x.canal === 'alertas')).toBe(true)
  })
  it('si el brazo falla una vez y responde al reintentar, sigue', async () => {
    const { M, id } = await abiertoC()
    M.renderFalla = (n) => n === 1
    const { ultima } = await correr(M, id, guionCarrusel())
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' }); expect(M.llamadas.render).toBe(2)
  })
  it('un brief que no es un carrusel, o un cliente sin identidad visual, cierran el encargo FALLIDO y visible', async () => {
    const a = await abierto(CARRUSEL_IG_V1, BRIEF_KIT, 'BRF-0200')
    expect(a.a.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(a.a.cuerpo.motivo)).toMatch(/no es un carrusel/)
    const b = await abiertoC({ fuentes: { marca: null } })
    expect(b.a.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(b.a.cuerpo.motivo)).toMatch(/identidad visual/)
  })
  it('un «siguiente» repetido entrega de nuevo el mismo pedido y no gasta de más', async () => {
    const { M, id, a } = await abiertoC()
    const t1 = (a.cuerpo.turno as { n: number; dispatch_key: string })
    const otra = await avanzar(M.P, id)
    expect(otra.cuerpo).toMatchObject({ accion: 'esperar', reentrega: true, turno: { n: t1.n, dispatch_key: t1.dispatch_key } })
  })
})

describe('SALA 2 · las imágenes por rol y los 3 controles', () => {
  it('imagen generada para «hook»: prompts por imagen → solo los que cubren lo obligatorio se generan → mira → la elegida entra a la lámina de ese rol (y solo a esa)', async () => {
    const { M, id } = await abiertoC({ dry_run: false })
    const { pasos, ultima } = await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: conImagenGenerada() }) }))
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'prompts', 'mirar', 'texto', 'laminas', 'revision_jefe'])
    expect(M.llamadas.imagen).toBe(2) // el tercer prompt no cubría lo obligatorio: no se generó
    expect(M.gastos.filter((g) => g.concepto === 'imagen')).toHaveLength(2)
    const fondos = M.llamadas.renderPedidos[0].slides.map((s) => s.background_image_url)
    expect(fondos[0]).toMatch(/img\.test/); expect(fondos.slice(1).every((x) => x === null)).toBe(true)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
    expect(M.encargos.get(id)!.imagen_generada).toBe(true)
    expect(M.llamadas.bandeja[0].metadata).toMatchObject({ imagen_generada: true })
  })
  it('control ②: un prompt que nombra lo prohibido o no cubre lo obligatorio NO se genera; si ninguno pasa, el ingeniero repite UNA vez y luego esa lámina sale sin imagen, declarado', async () => {
    const { M, id } = await abiertoC()
    const malos = j({ imagenes: [{ ref: 'hook', prompts: [{ prompt: 'Una mesa vacía con luz de ventana por la mañana', idea_en_una_linea: 'a' }, { prompt: 'Un paisaje de playa al amanecer con olas suaves', idea_en_una_linea: 'b' }] }] })
    const { pasos } = await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: conImagenGenerada() }), prompts: () => ({ texto: malos }) }))
    expect(pasos.filter((p) => p === 'prompts')).toHaveLength(2)
    expect(M.llamadas.imagen).toBe(0)
    expect(fichas(M, id).some((f) => f.gravedad === 'bloquea' && f.donde === 'imagen')).toBe(true)
  })
  it('control ③: si la imagen no cumple, se regenera ≤ 2 veces; a la 3.ª se descarta, la lámina sale sin imagen y la pieza con desacuerdo', async () => {
    const { M, id } = await abiertoC()
    const { pasos, ultima } = await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: conImagenGenerada() }), mirar: (_n, t) => ({ texto: observacion(indicesDe(t), { falta: true }) }) }))
    expect(pasos.filter((p) => p === 'mirar')).toHaveLength(3)
    expect(M.llamadas.imagen).toBe(6) // 2 versiones × 3 intentos
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: true })
    expect(fichas(M, id).some((f) => f.gravedad === 'bloquea' && f.donde === 'imagen' && /hook/.test(f.que ?? ''))).toBe(true)
    expect(arte(M, id, 'imagenes_elegidas').por_ref).toEqual({})
  })
  it('una regeneración y luego pasa: solo se rehace lo que falló', async () => {
    const { M, id } = await abiertoC()
    await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: conImagenGenerada() }), mirar: (n, t) => ({ texto: observacion(indicesDe(t), { falta: n === 1 }) }) }))
    expect(M.llamadas.imagen).toBe(4)
    expect(arte(M, id, 'imagenes_elegidas').por_ref.hook.origen).toBe('generada')
    expect(fichas(M, id).filter((f) => f.gravedad === 'bloquea' && f.estado === 'abierta')).toEqual([])
  })
  it('el curador pide más imágenes generadas que el máximo: el código las baja a «ninguna» con ficha', async () => {
    const { M, id } = await abiertoC()
    const tres = j({ resumen: 'x', imagenes: ['hook', 'proof', 'cta'].map((ref) => ({ ref, modo: 'generada', motivo: 'm' })), reglas_de_imagen: REGLAS })
    await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: tres }), prompts: () => ({ texto: promptsDe(['hook', 'proof']) }) }))
    expect(arte(M, id, 'visual_direction').refs_generadas).toEqual(['hook', 'proof'])
    expect(fichas(M, id).some((f) => /más de 2 imágenes generadas/.test(f.que ?? ''))).toBe(true)
  })
  it('un rol que no existe, o repetido, se le devuelve al curador una vez y luego se descarta con ficha', async () => {
    const { M, id } = await abiertoC()
    const raro = j({ resumen: 'x', imagenes: [{ ref: 'portada', modo: 'ninguna', motivo: 'm' }], reglas_de_imagen: { obligatorio: [], prohibido: [] } })
    const { tareas } = await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: raro }) }))
    expect(tareas['direccion_visual']).toHaveLength(2); expect(tareas['direccion_visual'][1]).toMatch(/portada/)
    expect(arte(M, id, 'visual_direction').imagenes).toEqual([])
  })
  it('una regla de imagen con cita INVENTADA se descarta', async () => {
    const { M, id } = await abiertoC()
    const inventada = { obligatorio: [{ id: 'o1', texto: 'x', claves: ['plato'], cita: 'Esta frase no está en el brief' }], prohibido: [] }
    await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: conImagenGenerada('hook', inventada as never) }), mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }) }))
    expect(arte(M, id, 'visual_direction').reglas_rechazadas).toHaveLength(1)
  })
  it('foto REAL candidata: se usa, se mira si su confianza no es alta, no se genera nada y queda el uso registrado con su rol', async () => {
    const { M, id } = await abiertoC({ dry_run: false })
    let foto = ''
    const { ultima } = await correr(M, id, guionCarrusel({
      direccion_visual: (_n, t) => { foto = /^- (\S+): muestra/m.exec(t)![1]; return { texto: j({ resumen: 'foto real', imagenes: [{ ref: 'hook', modo: 'real', foto_id: foto, motivo: 'sirve' }], reglas_de_imagen: { obligatorio: [], prohibido: [] } }) } },
      mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
    }))
    expect(M.llamadas.imagen).toBe(0)
     expect(M.usos).toEqual([{ foto_id: foto, rol: 'hook' }])
    expect(M.llamadas.renderPedidos[0].slides[0].background_image_url).toMatch(/fotos\.test/)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it('una foto que NO es candidata: el código manda generar (no confía en el modelo)', async () => {
    const { M, id } = await abiertoC()
    await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: j({ resumen: 'x', imagenes: [{ ref: 'hook', modo: 'real', foto_id: 'no-existe', motivo: 'm' }], reglas_de_imagen: REGLAS }) }) }))
    expect(arte(M, id, 'visual_direction').imagenes[0].modo).toBe('generada')
    expect(fichas(M, id).some((f) => /no es una candidata/.test(f.que ?? ''))).toBe(true)
  })
})

describe('SALA 2 · más reglas del orquestador de láminas', () => {
  it('una foto usada hace poco no se ofrece al curador; si todas las que sirven ya se usaron, se permite repetir (y se avisa)', async () => {
    const { M, id } = await abiertoC()
    await correr(M, id, guionCarrusel())
    const cands = arte(M, id, 'candidatas_foto').candidatas as Array<{ id: string }>
    expect(cands.length).toBeGreaterThan(1)
    const usos = { [cands[0].id]: '2026-10-09T10:00:00Z' }
    const B = await abiertoC({ fuentes: { usos } })
    await correr(B.M, B.id, guionCarrusel())
    expect((arte(B.M, B.id, 'candidatas_foto').candidatas as Array<{ id: string }>).map((x) => x.id)).not.toContain(cands[0].id)
    expect(arte(B.M, B.id, 'candidatas_foto').reuso_permitido).toBe(false)
    const todas = Object.fromEntries(cands.map((c) => [c.id, '2026-10-09T10:00:00Z']))
    const C = await abiertoC({ fuentes: { usos: todas } })
    await correr(C.M, C.id, guionCarrusel({ direccion_visual: (_n, t) => ({ texto: j({ resumen: 'x', imagenes: [{ ref: 'hook', modo: 'real', foto_id: /^- (\S+): muestra/m.exec(t)![1], motivo: 'm' }], reglas_de_imagen: { obligatorio: [], prohibido: [] } }) }) }))
    expect(arte(C.M, C.id, 'candidatas_foto').reuso_permitido).toBe(true)
    expect(fichas(C.M, C.id).some((f) => /ya se usó dentro de la ventana/.test(f.que ?? ''))).toBe(true)
  })
  it('en una regeneración solo se rehacen las imágenes que NO tienen todavía una versión aceptada', async () => {
    const { M, id } = await abiertoC()
    const dos = j({ resumen: 'x', imagenes: [{ ref: 'hook', modo: 'generada', motivo: 'm' }, { ref: 'proof', modo: 'generada', motivo: 'm' }], reglas_de_imagen: REGLAS })
    const falla = (indices: number[], mal: number[]) => j({
      imagenes: indices.map((indice) => ({ indice, reglas: [{ id: 'o1', presente: !mal.includes(indice), evidencia: 'v' }, { id: 'p1', presente: false, evidencia: 'no' }, { id: 'brief-o1', presente: !mal.includes(indice), evidencia: 'v' }, { id: 'brief-p1', presente: false, evidencia: 'no' }], texto_en_imagen: [], marcas: [], personas: 0 })), preferencia: indices,
    })
    await correr(M, id, guionCarrusel({ direccion_visual: () => ({ texto: dos }), prompts: () => ({ texto: promptsDe(['hook', 'proof']) }), mirar: (n, t) => ({ texto: falla(indicesDe(t), n === 1 ? [2, 3] : []) }) }))
    expect(M.llamadas.imagen).toBe(6) // 2 imágenes × 2 versiones + solo «proof» otra vez (2)
    const por = arte(M, id, 'imagenes_elegidas').por_ref
    expect(Object.keys(por).sort()).toEqual(['hook', 'proof'])
    expect(arte(M, id, 'observacion_imagen').aceptadas.hook).toEqual([0, 1])
  })
  it('si el brazo devuelve menos láminas de las pedidas, el encargo falla visible (no se entrega una pieza incompleta)', async () => {
    const { M, id } = await abiertoC()
    M.P.renderLaminas = async (p) => ({ ok: true, urls: [`https://lam.test/${p.encargo_id}/1-1080x1350.png`], ancho: 1080, alto: 1350, fonts_usadas: [], fonts_faltantes: [], timings_ms: [] })
    const { ultima } = await correr(M, id, guionCarrusel())
    expect(ultima.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(ultima.cuerpo.motivo)).toMatch(/devolvió 1 imagen/)
  })
  it('un hallazgo del revisor externo sobre el texto (ronda 2): decide el autor, el diseñador vuelve a recortar y se dibuja otra vez', async () => {
    const { M, id } = await abiertoC()
    M.revisorTexto = () => ({ ok: true, texto: 'Yo cambiaría el cierre: lo siento flojo, y la tercera idea se repite con la primera.', costo_usd: 0.1, modelo: 'r' })
    const nueva = { ...COPIA, texto_base: TEXTO_BASE.replace('Lo preparamos al momento', 'Lo hacemos al momento') }
    const lam = LAMINAS.map((l, i) => (i === 3 ? { ...l, headline: 'Lo hacemos al momento' } : l))
    const { pasos } = await correr(M, id, guionCarrusel({
      decide_texto: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(ext-[^\]]+)\]/.exec(t)![1], estado: 'tomada', razon: 'ok' }], copia: nueva }) }),
      ajusta_laminas_2: () => ({ texto: j({ respuestas: [], laminas: lam }) }),
    }))
    expect(pasos.slice(-3)).toEqual(['decide_texto', 'ajusta_laminas_2', 'decide_imagen'])
    expect(M.llamadas.render).toBe(2)
    expect(JSON.stringify(M.llamadas.renderPedidos[1].slides)).toMatch(/Lo hacemos al momento/)
  })
  it('el plan de origen de la parte se lee y viaja en la tarea de cada empleado de láminas', async () => {
    const { M, id } = await abiertoC()
    const { tareas } = await correr(M, id, guionCarrusel())
    expect(M.llamadas.planes).toEqual(['29d6daeb-a95a-4328-9c10-cf3cddc236f7'])
    expect(tareas['texto'][0]).toMatch(/Plan de trabajo del cliente[\s\S]*PLAN DE TRABAJO DE PRUEBA/)
    expect(tareas['laminas'][0]).toMatch(/PLAN DE TRABAJO DE PRUEBA/)
  })
  it('el jefe ve las láminas dibujadas: portada, una intermedia y la última', async () => {
    const { M, id } = await abiertoC()
    const { pedidos } = await correr(M, id, guionCarrusel())
    const imgs = (pedidos['revision_jefe'][0].images as Array<{ url: string }>).map((x) => x.url)
    expect(imgs).toHaveLength(3)
    expect(imgs[0]).toMatch(/\/1-1080x1350\.png$/); expect(imgs[2]).toMatch(/\/5-1080x1350\.png$/)
  })
  it('cada pedido lleva la indicación de ESE agente en ESTA sala, el tope del paso y el dry_run', async () => {
    const { M, id } = await abiertoC()
    const { pedidos } = await correr(M, id, guionCarrusel())
    const d = pedidos['laminas'][0] as { agent_name: string; extra: { indicacion_oficina: string }; max_budget_usd: number; dry_run: boolean; task: string }
    expect(d).toMatchObject({ agent_name: 'carousel-designer', max_budget_usd: 0.5, dry_run: true })
    expect(d.extra.indicacion_oficina).toMatch(/recortas LITERALMENTE/)
    expect(d.task).toMatch(/Texto base:/); expect(d.task).toMatch(/instagram-feed/)
  })
})

describe('SALA 3 · kit de historias y estados · punta a punta con modelo simulado', () => {
  it('dry_run: una lámina por elemento, sin pie ni indicador, todo en simulacro', async () => {
    const { M, id, a } = await abiertoK()
    expect(a.status).toBe(200)
    const { pasos, ultima } = await correr(M, id, guionKit())
    expect(pasos).toEqual(['paquete', 'direccion_visual', 'narrativa', 'texto', 'revision_jefe'])
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false, simulado: true })
    expect(M.llamadas.render).toBe(1); expect(M.llamadas.renderReal).toBe(0)
    const slides = M.llamadas.renderPedidos[0].slides
    expect(slides).toHaveLength(3)
    expect(slides.every((s) => s.pie === null && s.ocultar_indicador === true)).toBe(true)
    expect(M.llamadas.renderPedidos[0].plataforma).toBe('instagram-reel')
  })
  it('real: archivos con día y hora en el nombre, un texto por lámina, UNA hoja de publicación y el vencimiento de la primera', async () => {
    const { M, id } = await abiertoK({ dry_run: false })
    const { ultima } = await correr(M, id, guionKit())
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
    const png = M.llamadas.archivos.filter((n) => n.endsWith('.png'))
    expect(png).toEqual([
      '2026-10-14_1830_instagram_historia_BRF-0200_01-de-03.png', '2026-10-15_0900_whatsapp_estado_BRF-0200_02-de-03.png', '2026-10-16_1200_instagram_historia_BRF-0200_03-de-03.png',
    ])
    expect([...png].sort()).toEqual(png) // ordenables por fecha
    expect(M.llamadas.archivos.filter((n) => n.endsWith('_texto.txt'))).toHaveLength(3)
    expect(M.llamadas.archivos.filter((n) => n.endsWith('_publicar.md'))).toHaveLength(1)
    expect(M.llamadas.bandeja[0].expires_at).toBe('2026-10-14T23:30:00.000Z') // 18:30 en America/Guayaquil
    expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/Kit BRF-0200.*3 láminas/)
  })
  it('el narrador NO puede escribir texto de imagen: el esquema lo rechaza, un reintento, y luego el encargo falla visible', async () => {
    const { M, id } = await abiertoK()
    const conTexto = { elementos: ESTRUCTURA.elementos.map((e, i) => (i === 0 ? { ...e, headline: 'Texto escrito por el narrador' } : e)) }
    const { ultima, tareas } = await correr(M, id, guionKit({ narrativa: () => ({ texto: j(conTexto) }) }))
    expect(tareas['narrativa']).toHaveLength(2)
    expect(ultima.cuerpo).toMatchObject({ estado: 'fallido' })
    expect(M.llamadas.render).toBe(0)
  })
  it('si a la estructura le falta un elemento del kit, se le devuelve una vez', async () => {
    const { M, id } = await abiertoK()
    const incompleta = { elementos: ESTRUCTURA.elementos.slice(0, 2) }
    const { tareas } = await correr(M, id, guionKit({ narrativa: (n) => ({ texto: j(n === 1 ? incompleta : ESTRUCTURA) }) }))
    expect(tareas['narrativa']).toHaveLength(2); expect(tareas['narrativa'][1]).toMatch(/e03/)
  })
  it('un titular de historia demasiado largo se le devuelve al autor una vez; si lo corrige, sigue', async () => {
    const { M, id } = await abiertoK()
    const largo = { elementos: COPY_KIT.elementos.map((e, i) => (i === 0 ? { ...e, headline: 'x'.repeat(61) } : e)) }
    const { tareas, ultima } = await correr(M, id, guionKit({ texto: (n) => ({ texto: j(n === 1 ? largo : COPY_KIT) }) }))
    expect(tareas['texto']).toHaveLength(2); expect(tareas['texto'][1]).toMatch(/61 caracteres/)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
  })
  it('falta el texto de un elemento: se pide de nuevo; si sigue sin estar, el encargo no inventa nada', async () => {
    const { M, id } = await abiertoK()
    const sinE3 = { elementos: COPY_KIT.elementos.slice(0, 2) }
    const { ultima } = await correr(M, id, guionKit({ texto: () => ({ texto: j(sinE3) }) }))
    expect(ultima.cuerpo).toMatchObject({ con_desacuerdo: true })
    expect(fichas(M, id).some((f) => f.donde === 'estructura' && /e03/.test(f.que ?? ''))).toBe(true)
    expect(M.llamadas.renderPedidos[0].slides).toHaveLength(2)
  })
  it('un hallazgo de estructura lo atiende el narrador; uno de texto, el autor; ambos vuelven a dibujar el kit', async () => {
    const { M, id } = await abiertoK()
    const f = (donde: string) => ({ que: `detalle de ${donde}`, donde, contra_que: 'brief', gravedad: 'bloquea', propuesta: 'cambiar' })
    const { pasos } = await correr(M, id, guionKit({
      revision_jefe: () => ({ texto: j({ fichas: [f('estructura'), f('texto')] }) }),
      corrige_estructura: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(jefe-[^\]]+)\]/.exec(t)![1], estado: 'tomada', razon: 'ok' }], elementos: [{ ...ESTRUCTURA.elementos[0], mood: 'más cálido' }] }) }),
      corrige_texto: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(jefe-[^\]]+)\]/.exec(t)![1], estado: 'tomada', razon: 'ok' }], elementos: [{ ref: 'e02', headline: 'Abrimos de jueves a lunes' }] }) }),
    }))
    expect(pasos).toContain('corrige_estructura'); expect(pasos).toContain('corrige_texto')
    expect(M.llamadas.render).toBe(2)
    expect(arte(M, id, 'estructura').elementos[0].mood).toBe('más cálido')
    expect(arte(M, id, 'estructura').elementos).toHaveLength(3)
  })
  it('imagen generada para un elemento: entra a SU lámina y a ninguna otra', async () => {
    const { M, id } = await abiertoK({ dry_run: false })
    const dir = j({ resumen: 'x', imagenes: [{ ref: 'e01', modo: 'generada', motivo: 'm' }], reglas_de_imagen: { obligatorio: [], prohibido: [] } })
    const { ultima } = await correr(M, id, guionKit({ direccion_visual: () => ({ texto: dir }), prompts: () => ({ texto: promptsDe(['e01']) }), mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }) }))
    const fondos = M.llamadas.renderPedidos[0].slides.map((s) => s.background_image_url)
    expect(fondos[0]).toMatch(/img\.test/); expect(fondos[1]).toBeNull(); expect(fondos[2]).toBeNull()
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it('la opinión libre del revisor sobre el kit llega a TODOS los que hicieron algo: autor, narrador y curador; cada uno responde sobre SU parte, una sola vez', async () => {
    const { M, id } = await abiertoK()
    M.revisorTexto = () => ({ ok: true, texto: 'La semana se siente repetitiva: tres historias dicen casi lo mismo.', costo_usd: 0.1, modelo: 'r' })
    const resp = (estado: string, razon: string) => (_n: number, t: string) => ({ texto: j({ respuestas: [{ id: /\[(ext-[^\]]+)\]/.exec(t)![1], estado, razon }] }) })
    const { pasos, tareas, ultima } = await correr(M, id, guionKit({
      decide_texto: resp('no_tomada', 'cada historia tiene su pilar'), decide_estructura: resp('tomada', 'el ritmo sí se repite'), decide_imagen: resp('no_tomada', 'la paleta es la del manual'),
    }))
    const r2 = pasos.slice(pasos.indexOf('revisor_externo') + 1)
    for (const p of ['decide_texto', 'decide_estructura', 'decide_imagen']) expect(r2.filter((x) => x === p), p).toHaveLength(1)
    expect(tareas['decide_texto'][0]).toMatch(/Opinión libre del revisor externo[\s\S]*repetitiva/)
    expect(tareas['decide_estructura'][0]).toMatch(/repetitiva/); expect(tareas['decide_imagen'][0]).toMatch(/repetitiva/)
    const ext = M.encargos.get(id)!.estado_del_motor.fichas.filter((f) => f.origen === 'externa')
    expect(ext.map((f) => [f.donde, f.estado, f.razon])).toEqual([['texto', 'no_tomada', 'cada historia tiene su pilar'], ['imagen', 'no_tomada', 'la paleta es la del manual'], ['estructura', 'tomada', 'el ritmo sí se repite']])
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', con_desacuerdo: false })
    expect(M.llamadas.revisorPedidos[0]).toMatch(/## La pieza\ne01/)
  })
  it('carrusel: la opinión llega al autor, al diseñador (laminas) y al curador (imagen); el diseñador se llama UNA vez aunque haya dos motivos (copia cambiada + opinión)', async () => {
    const { M, id } = await abiertoC()
    M.revisorTexto = () => ({ ok: true, texto: 'El orden de las láminas no me convence; la cuarta sobra.', costo_usd: 0.1, modelo: 'r' })
    const nueva = { ...COPIA, texto_base: TEXTO_BASE.replace('Lo preparamos al momento', 'Lo hacemos al momento') }
    const lam = LAMINAS.map((l, i) => (i === 3 ? { ...l, headline: 'Lo hacemos al momento' } : l))
    const resp = (estado: string, razon: string, extra: Record<string, unknown> = {}) => (_n: number, t: string) => ({ texto: j({ respuestas: [{ id: /\[(ext-[^\]]+)\]/.exec(t)![1], estado, razon }], ...extra }) })
    const { pasos } = await correr(M, id, guionCarrusel({ decide_texto: resp('tomada', 'ok', { copia: nueva }), ajusta_laminas_2: () => ({ texto: j({ respuestas: [{ id: 'ext-x', estado: 'no_tomada', razon: 'x' }], laminas: lam }) }), decide_imagen: resp('no_tomada', 'la foto es la correcta') }))
    const r2 = pasos.slice(pasos.indexOf('revisor_externo') + 1)
    expect(r2.filter((x) => x === 'ajusta_laminas_2')).toHaveLength(1)
    expect(r2.filter((x) => x === 'decide_imagen')).toHaveLength(1)
    const ext = M.encargos.get(id)!.estado_del_motor.fichas.filter((f) => f.origen === 'externa')
    expect(ext.map((f) => f.donde).sort()).toEqual(['imagen', 'laminas', 'texto'])
    expect(ext.every((f) => f.estado !== 'abierta')).toBe(true)
  })
  it('carrusel: si el autor NO cambia el texto, la opinión sobre las láminas igual llega al diseñador (cualquiera de dos motivos)', async () => {
    const { M, id } = await abiertoC()
    M.revisorTexto = () => ({ ok: true, texto: 'Las láminas se sienten apretadas.', costo_usd: 0.1, modelo: 'r' })
    const { pasos } = await correr(M, id, guionCarrusel({ ajusta_laminas_2: (_n, t) => ({ texto: j({ respuestas: [{ id: /\[(ext-[^\]]+)\]/.exec(t)![1], estado: 'no_tomada', razon: 'caben bien' }], laminas: LAMINAS }) }) }))
    expect(pasos.slice(pasos.indexOf('revisor_externo') + 1).filter((x) => x === 'ajusta_laminas_2')).toHaveLength(1)
    const lam = M.encargos.get(id)!.estado_del_motor.fichas.find((f) => f.origen === 'externa' && f.donde === 'laminas')!
    expect(lam).toMatchObject({ estado: 'no_tomada', razon: 'caben bien' })
  })
  it('un elemento del kit que no se entiende cierra el encargo FALLIDO, visible, sin adivinar', async () => {
    const roto = BRIEF_KIT.replace('| servicio', '| servicio\n  - mañana temprano | video | tema | pilar')
    const { a } = await abierto(KIT_HISTORIAS, roto, 'BRF-0200')
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(a.cuerpo.motivo)).toMatch(/no se entienden/)
  })
  it('sin calendario, el kit se empaqueta igual pero sin fecha en los nombres y sin vencimiento (se declara)', async () => {
    const sinFecha = BRIEF_KIT.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, 'sin fecha')
    const { M, id } = await abierto(KIT_HISTORIAS, sinFecha, 'BRF-0200', { dry_run: false })
    await correr(M, id, guionKit())
    expect(M.llamadas.archivos.filter((n) => n.endsWith('.png'))[0]).toMatch(/^sin-fecha_sin-hora_instagram_historia/)
    expect(M.llamadas.bandeja[0].expires_at).toBeNull()
  })
})

describe('las plantillas de láminas no cambian el comportamiento de la sala 1', () => {
  it('la puerta sigue mandando la familia a SU plantilla: una familia no activa pasa por la pasarela', async () => {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_IG_V1, config: { familias_activas: ['post_img'] } })
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_ig_v1' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.status).toBe(409)
  })
  it('el cliente de práctica de las pruebas tiene marca y carpeta (sin ellas las salas de láminas no abren)', () => {
    expect(FUENTES.marca?.colors.primary).toBeTruthy(); expect(FUENTES.slug).toBeTruthy()
  })
})

describe('CC#3 #471 · lo que sus mutaciones dejaron vivo en la entrega y en la elección de la foto', () => {
  it('foto REAL elegida: la lámina lleva EXACTAMENTE la dirección de esa foto (no la de otra)', async () => {
    const { M, id } = await abiertoC({ dry_run: false })
    let foto = ''
    const { pedidos } = await correr(M, id, guionCarrusel({
      direccion_visual: (_n, t) => { foto = /^- (\S+): muestra/m.exec(t)![1]; return { texto: j({ resumen: 'foto real', imagenes: [{ ref: 'hook', modo: 'real', foto_id: foto, motivo: 'sirve' }], reglas_de_imagen: { obligatorio: [], prohibido: [] } }) } },
      mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
    }))
    // si la foto no es de confianza alta, al empleado que mira se le muestra ESA foto
    const vistas = (pedidos['mirar'] ?? []).flatMap((p) => ((p.images as Array<string | { url: string }> | undefined) ?? []).map((x) => (typeof x === 'string' ? x : x.url)))
    if (vistas.length) expect(vistas).toContain(`https://fotos.test/${foto}.jpg`)
    expect(M.llamadas.renderPedidos[0].slides[0].background_image_url).toBe(`https://fotos.test/${foto}.jpg`)
    expect(M.llamadas.renderPedidos[0].slides.slice(1).every((s) => !s.background_image_url)).toBe(true)
  })
  it('la marca «imagen GENERADA» aparece en la hoja de entrega y en la bandeja SOLO si alguna imagen es generada', async () => {
    const dir = j({ resumen: 'x', imagenes: [{ ref: 'e01', modo: 'generada', motivo: 'm' }], reglas_de_imagen: { obligatorio: [], prohibido: [] } })
    const conGen = await abiertoK({ dry_run: false })
    await correr(conGen.M, conGen.id, guionKit({ direccion_visual: () => ({ texto: dir }), prompts: () => ({ texto: promptsDe(['e01']) }), mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }) }))
    const hoja = (M: Memoria) => Object.entries(M.llamadas.contenidos).find(([n]) => n.endsWith('_publicar.md'))![1]
    expect(hoja(conGen.M)).toMatch(/GENERADA/)
    expect(JSON.stringify(conGen.M.llamadas.bandeja[0])).toMatch(/"imagen_generada":true/)
    const sinGen = await abiertoK({ dry_run: false })
    await correr(sinGen.M, sinGen.id, guionKit())
    expect(hoja(sinGen.M)).not.toMatch(/GENERADA/)
    expect(JSON.stringify(sinGen.M.llamadas.bandeja[0])).not.toMatch(/"imagen_generada":true/)
  })
  it('kit: el límite de texto de WhatsApp se comprueba SOLO en los elementos de estado (cada destino con su fila)', async () => {
    const largo = 'a'.repeat(750) // estado: tope 700 · historia de Instagram: tope 2200
    const copia = (ref: string) => ({ elementos: COPY_KIT.elementos.map((c) => (c.ref === ref ? { ...c, acompanamiento: largo } : c)) })
    const enEstado = await abiertoK({ dry_run: false })
    await correr(enEstado.M, enEstado.id, guionKit({ texto: () => ({ texto: j(copia('e02')) }) }))
    const largos = (M: Memoria, id: string) => fichas(M, id).filter((f) => f.donde === 'texto' && /ent\d+-/.test(f.id))
    expect(largos(enEstado.M, enEstado.id).length).toBeGreaterThan(0)
    const enHistoria = await abiertoK({ dry_run: false })
    await correr(enHistoria.M, enHistoria.id, guionKit({ texto: () => ({ texto: j(copia('e01')) }) }))
    expect(largos(enHistoria.M, enHistoria.id)).toEqual([])
  })
})
